import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth } from "../middleware/auth.js";
import { storageRoot } from "../config/paths.js";
import Project from "../models/Project.js";
import { plannerNode, scriptWriterNode, runVoiceAndRender, videoRenderNode } from "../langgraph/workflow.js";
import { generateScriptOp, applyScriptOp, parseDurationMinutes, generateLongFormScript, WORDS_PER_MINUTE } from "../services/scriptChatService.js";

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(storageRoot(), req.user.id, "voice-samples");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
});

router.get("/", requireAuth, async (req, res) => {
  const projects = await Project.find({ userId: req.user.id }).sort({ updatedAt: -1 });
  res.json({ projects });
});

router.get("/:id", requireAuth, async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, userId: req.user.id });
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json({ project });
});

router.post("/", requireAuth, upload.single("voiceSample"), async (req, res) => {
  try {
    const { title, conceptPrompt } = req.body;
    const project = await Project.create({
      userId: req.user.id,
      title,
      conceptPrompt,
      voiceSettings: {
        voiceSamplePath: req.file ? req.file.path : undefined,
      },
    });
    res.status(201).json({ project });
  } catch (err) {
    res.status(500).json({ error: "Failed to create project", details: err.message });
  }
});

// Step 1: generate plan (stops at human checkpoint)
router.post("/:id/plan", requireAuth, async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, userId: req.user.id });
  if (!project) return res.status(404).json({ error: "Project not found" });

  try {
    await plannerNode({
      projectId: project._id.toString(),
      prompt: project.conceptPrompt,
    });
    const updated = await Project.findById(project._id);
    res.json({ project: updated });
  } catch (err) {
    res.status(500).json({ error: "Planning failed", details: err.message });
  }
});

// Approve plan -> generate the scene script (does NOT re-run planning)
router.post("/:id/plan/approve", requireAuth, async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, userId: req.user.id });
  if (!project) return res.status(404).json({ error: "Project not found" });

  project.status = "plan_approved";
  await project.save();

  try {
    await scriptWriterNode({
      projectId: project._id.toString(),
      userId: req.user.id,
    });
    const updated = await Project.findById(project._id);
    res.json({ project: updated });
  } catch (err) {
    res.status(500).json({ error: "Script generation failed", details: err.message });
  }
});

// Request a scene rewrite with feedback, without re-running the whole graph
router.post("/:id/plan/revise", requireAuth, async (req, res) => {
  const { feedback } = req.body;
  const project = await Project.findOne({ _id: req.params.id, userId: req.user.id });
  if (!project) return res.status(404).json({ error: "Project not found" });

  await plannerNode({
    projectId: project._id.toString(),
    prompt: project.conceptPrompt,
    userPlanFeedback: feedback,
  });
  const updated = await Project.findById(project._id);
  res.json({ project: updated });
});

// Kicks off voice cloning + rendering ONLY - the scenes/plan are already
// final by this point (either from the wizard's scriptWriterNode or from
// the chat script's use-for-production handoff), so this must NOT touch
// planning or scripting again, or it would silently discard whatever the
// user already approved.
function startProduction(project, userId) {
  runVoiceAndRender({
    projectId: project._id.toString(),
    userId,
    voiceSamplePath: project.voiceSettings?.voiceSamplePath,
  }).catch((err) => console.error(`[workflow] project ${project._id} failed:`, err));
}

router.post("/:id/script/approve", requireAuth, async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, userId: req.user.id });
  if (!project) return res.status(404).json({ error: "Project not found" });

  project.status = "script_approved";
  await project.save();

  // Run async; client polls status or listens on the SSE progress endpoint.
  startProduction(project, req.user.id);

  res.json({ status: "production_started" });
});

// Server-Sent Events progress stream for the render step
router.get("/:id/progress", requireAuth, async (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  const interval = setInterval(async () => {
    const project = await Project.findOne({ _id: req.params.id, userId: req.user.id });
    if (!project) {
      clearInterval(interval);
      return res.end();
    }
    res.write(`data: ${JSON.stringify({
      status: project.status,
      videoUrl: project.renderedVideoUrl,
      error: project.errorMessage,
      failedAtStep: project.failedAtStep,
      progressPercent: project.progressPercent,
      progressPhase: project.progressPhase,
      voiceProvider: project.voiceSettings?.provider,
    })}\n\n`);
    if (["completed", "failed"].includes(project.status)) {
      clearInterval(interval);
      res.end();
    }
  }, 1000);

  req.on("close", () => clearInterval(interval));
});

router.delete("/:id", requireAuth, async (req, res) => {
  await Project.deleteOne({ _id: req.params.id, userId: req.user.id });
  res.status(204).end();
});

// Resumes production from whichever stage actually failed, instead of
// restarting the whole pipeline. If voice generation failed, redo voice
// then render (since there's no audio to render with yet). If only
// rendering failed, redo just the render - the audio already succeeded, so
// there's no reason to re-clone the voice (which costs real time and, if
// it's slow/rate-limited, real cost) just to try rendering again.
router.post("/:id/retry", requireAuth, async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, userId: req.user.id });
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (project.status !== "failed") {
    return res.status(400).json({ error: "Project isn't in a failed state" });
  }

  const args = {
    projectId: project._id.toString(),
    userId: req.user.id,
    voiceSamplePath: project.voiceSettings?.voiceSamplePath,
  };

  // Flip status BEFORE responding: the progress stream closes as soon as it
  // sees "failed", so leaving it until the background job gets going would
  // race the client's first progress tick and hide the progress bar.
  const resumedFrom = project.failedAtStep === "render" ? "render" : "voice";
  project.status = resumedFrom === "render" ? "rendering_video" : "generating_audio";
  project.errorMessage = null;
  project.progressPhase = "Resuming...";
  await project.save();

  if (project.failedAtStep === "render") {
    videoRenderNode(args).catch((err) => console.error(`[retry] project ${project._id} failed again:`, err));
  } else {
    // Covers "voice" and the (shouldn't normally happen) case of no
    // failedAtStep recorded - safest default is to redo both stages.
    runVoiceAndRender(args).catch((err) => console.error(`[retry] project ${project._id} failed again:`, err));
  }

  res.json({ status: "retrying", resumedFrom });
});

// --- Chat-driven avatar/monologue script flow (separate from the
// scenes/templates pipeline above) ---

router.get("/:id/script-chat", requireAuth, async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, userId: req.user.id });
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json({ script: project.avatarScript, chatHistory: project.scriptChatHistory });
});

router.post("/:id/script-chat", requireAuth, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const project = await Project.findOne({ _id: req.params.id, userId: req.user.id });
  if (!project) return res.status(404).json({ error: "Project not found" });

  try {
    const isFirstMessage = !project.avatarScript || project.avatarScript.length === 0;
    const duration = parseDurationMinutes(message);

    let script, chatNote;

    if (isFirstMessage && duration) {
      const result = await generateLongFormScript({ concept: message, duration });
      script = result.script;
      chatNote = `Generated a ${result.script.length}-segment script, estimated ~${result.estimatedMinutes} min (target was ${duration.minMinutes}-${duration.maxMinutes} min). Actual runtime depends on your TTS voice's speaking rate - check the rendered audio duration once voiceover is generated.`;
    } else {
      const op = await generateScriptOp({
        history: project.scriptChatHistory,
        userMessage: message,
        currentScript: project.avatarScript,
      });
      script = applyScriptOp(project.avatarScript, op);
      chatNote = describeOp(op, script.length);
    }

    project.avatarScript = script;
    project.scriptChatHistory.push(
      { role: "user", content: message },
      { role: "assistant", content: chatNote }
    );
    await project.save();

    res.json({ script: project.avatarScript, chatHistory: project.scriptChatHistory });
  } catch (err) {
    res.status(500).json({ error: "Script generation failed", details: err.message });
  }
});

function describeOp(op, resultingLength) {
  switch (op.op) {
    case "insert":
      return `Inserted a new point at position ${op.beforeIndex + 1}. Script now has ${resultingLength} segments.`;
    case "delete":
      return `Removed point ${op.atIndex + 1}. Script now has ${resultingLength} segments.`;
    case "move":
      return `Moved point ${op.fromIndex + 1} to position ${op.toIndex + 1}.`;
    case "replace_segment":
      return `Rewrote point ${op.atIndex + 1}.`;
    default:
      return `Updated script (${resultingLength} segments).`;
  }
}

const FPS = 30;

// Converts the chat-generated `avatarScript` into the `scenes` shape the
// LangGraph pipeline / Remotion renderer actually consume, then marks the
// project ready for production - the SAME state `POST /:id/script/approve`
// expects, so voice cloning + rendering pick it up identically either way.
router.post("/:id/script-chat/use-for-production", requireAuth, async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, userId: req.user.id });
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (!project.avatarScript?.length) {
    return res.status(400).json({ error: "No chat-generated script to use yet" });
  }

  project.scenes = project.avatarScript.map((segment, i) => {
    const words = segment.text.trim().split(/\s+/).filter(Boolean).length;
    const seconds = Math.max(2, words / (WORDS_PER_MINUTE / 60));
    return {
      sceneIndex: i,
      templateType: "avatar",
      dialogue: segment.text,
      props: { text: segment.text },
      durationInFrames: Math.round(seconds * FPS),
    };
  });

  project.status = "script_approved";
  await project.save();

  startProduction(project, req.user.id);

  res.json({ project });
});

export default router;
