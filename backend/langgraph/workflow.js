import { generateStructured } from "../services/ollamaService.js";
import { unloadModel } from "../services/ollamaService.js";
import fs from "fs";
import path from "path";
import { resolveProvider, ttsSpeed } from "../services/ttsService.js";
import { wavDurationSeconds } from "../services/tts/wav.js";
import { renderProjectVideo } from "../services/renderService.js";
import { storageRoot } from "../config/paths.js";
import { sceneFramesForAudio } from "../remotion/constants.js";
import Project from "../models/Project.js";
import Template from "../models/Template.js";

/**
 * These four functions are the pipeline's stages - each one takes a plain
 * state object, does its work, persists the result on the Project, and
 * returns. They're written in LangGraph's node style (state in, partial
 * state out) so they could be wired into a StateGraph with checkpointing
 * later, but the route layer (routes/projects.js) calls them directly, ONE
 * AT A TIME, rather than compiling them into a graph with a single fixed
 * START edge.
 *
 * Why not use StateGraph.invoke() to run them: this app's stages are each
 * triggered by a separate HTTP request (generate plan, approve plan,
 * approve script, retry). A graph with `addEdge(START, "plannerNode")`
 * always begins execution at plannerNode no matter what state you pass in -
 * there's no way to tell "invoke, but skip planning, I already have an
 * approved plan" without a configured checkpointer resuming a specific
 * prior run. Without one, every invoke() silently re-ran planning (and
 * often scripting) from scratch, discarding whatever the user had already
 * approved or edited. Calling the stage functions directly avoids that
 * class of bug entirely and makes "retry just this failed stage" trivial.
 */

export async function plannerNode({ projectId, prompt, userPlanFeedback }) {
  const project = await Project.findById(projectId);

  const result = await generateStructured({
    systemPrompt: `You are a video content strategist. Given a topic, you produce a tight
short-form video plan: one strong hook line, 3-6 concise key points, and a call to action.
You also intelligently pick a default theme name from this list based on the topic's tone:
["minimal_light", "minimal_dark", "cyberpunk", "corporate"]. Prefer "minimal_light" unless
the topic clearly calls for something else (e.g. gaming/tech-hacker content suits
"cyberpunk", enterprise/B2B content suits "corporate").`,
    userPrompt: `Topic / concept prompt: "${prompt}"${
      userPlanFeedback ? `\nUser feedback on previous draft: "${userPlanFeedback}"` : ""
    }`,
    schemaHint: `{
  "hook": "string",
  "keyPoints": ["string", "..."],
  "cta": "string",
  "suggestedTheme": "minimal_light | minimal_dark | cyberpunk | corporate"
}`,
  });

  project.plan = { hook: result.hook, keyPoints: result.keyPoints, cta: result.cta };
  if (result.suggestedTheme) project.theme.name = result.suggestedTheme;
  project.status = "planning";
  await project.save();
  return project;
}

export async function scriptWriterNode({ projectId, userId, userScriptFeedback }) {
  const project = await Project.findById(projectId);
  const templates = await Template.find({
    $or: [{ userId }, { isSystemDefault: true }],
  }).select("type name");

  const availableTypes = templates.map((t) => t.type).join(", ") || "hook, concept, code, comparison, outro";

  const result = await generateStructured({
    systemPrompt: `You are a video scriptwriter. Break an approved plan into a sequence of
scenes. Each scene MUST use one of the available template types provided, and MUST include
a "dialogue" line (what the narrator says) plus a "props" object with whatever fields that
template type needs (e.g. title, subtitle, codeSnippet, leftLabel/rightLabel for comparisons).`,
    userPrompt: `Plan: ${JSON.stringify(project.plan)}
Available template types: ${availableTypes}
${userScriptFeedback ? `User revision feedback: "${userScriptFeedback}"` : ""}`,
    schemaHint: `{
  "scenes": [
    {
      "sceneIndex": 0,
      "templateType": "hook",
      "dialogue": "string",
      "props": { "...": "..." },
      "durationInFrames": 150
    }
  ]
}`,
  });

  project.scenes = result.scenes;
  project.status = "scripting";
  await project.save();
  return project;
}

// Overall progress is one bar across the whole production:
//   0-40%  narration, one scene at a time
//   40-45% preparing the video engine (bundling)
//   45-100% rendering frames
const VOICE_END = 40;
const BUNDLE_END = 45;

/**
 * Serialises progress writes and drops duplicates: renderMedia reports
 * progress on every frame, but we only need a database write when the whole
 * percent (or the phase text) actually changes.
 */
function makeProgressWriter(projectId) {
  let chain = Promise.resolve();
  let lastPercent = -1;
  let lastPhase = "";
  return {
    set(percent, phase) {
      const p = Math.max(0, Math.min(99, Math.round(percent)));
      if (p === lastPercent && phase === lastPhase) return;
      lastPercent = p;
      lastPhase = phase;
      chain = chain
        .then(() => Project.updateOne({ _id: projectId }, { $set: { progressPercent: p, progressPhase: phase } }))
        .catch(() => {});
    },
    flush: () => chain,
  };
}

const fileForAudioUrl = (audioUrl) => path.join(storageRoot(), audioUrl.replace(/^\/storage\//, ""));

export async function voiceCloneNode({ projectId, userId, voiceSamplePath }) {
  const project = await Project.findById(projectId);
  project.status = "generating_audio";
  project.failedAtStep = null;
  project.errorMessage = null;
  project.progressPercent = 0;
  project.progressPhase = "Preparing voice engine";
  await project.save();

  // Free RAM before handing off to the (often GPU/CPU heavy) TTS engine.
  await unloadModel();

  try {
    const provider = await resolveProvider(userId);
    project.voiceSettings.provider = provider.name;
    project.progressPhase = `Connecting to ${provider.label}`;
    await project.save();

    const ctx = await provider.prepare({
      voiceSamplePath: voiceSamplePath || project.voiceSettings?.voiceSamplePath,
      userId,
      projectId,
    });

    const outDir = path.join(storageRoot(), userId, projectId);
    fs.mkdirSync(outDir, { recursive: true });

    const total = project.scenes.length;
    let totalSeconds = 0;

    // One clip per scene. Besides keeping picture and voice in sync (see
    // RemoGenMain), this makes generation resumable: a retry skips every
    // scene whose narration already exists and still matches its dialogue,
    // so a failure at scene 14 of 20 restarts at scene 14, not scene 1.
    for (let i = 0; i < total; i++) {
      const scene = project.scenes[i];
      const text = (scene.dialogue || "").trim();
      const label = `${provider.label} - scene ${i + 1} of ${total}`;

      if (!text) continue; // nothing to say - keeps its estimated length

      const reusable =
        scene.audioUrl && scene.audioText === text && scene.audioDurationInSeconds && fs.existsSync(fileForAudioUrl(scene.audioUrl));

      if (!reusable) {
        project.progressPercent = (VOICE_END * i) / total;
        project.progressPhase = `Generating voiceover (${label})`;
        await project.save();

        const wav = await provider.synthesize(ctx, text, { speed: ttsSpeed(), index: i });
        const seconds = wavDurationSeconds(wav);

        // Unique filename per generation so an edited line never serves a
        // stale cached clip to the preview Player; delete the one it replaces.
        const filename = `voice_${i}_${Date.now()}.wav`;
        fs.writeFileSync(path.join(outDir, filename), wav);
        if (scene.audioUrl && fs.existsSync(fileForAudioUrl(scene.audioUrl))) {
          fs.unlinkSync(fileForAudioUrl(scene.audioUrl));
        }

        scene.audioUrl = `/storage/${userId}/${projectId}/${filename}`;
        scene.audioDurationInSeconds = seconds;
        scene.audioText = text;
      }

      scene.durationInFrames = sceneFramesForAudio(scene.audioDurationInSeconds);
      totalSeconds += scene.audioDurationInSeconds;
      project.progressPercent = (VOICE_END * (i + 1)) / total;
      await project.save();
    }

    project.voiceSettings.durationInSeconds = +totalSeconds.toFixed(2);
    project.progressPercent = VOICE_END;
    project.progressPhase = "Voiceover complete";
    await project.save();
    return project;
  } catch (err) {
    project.status = "failed";
    project.failedAtStep = "voice";
    project.errorMessage = `Voice generation failed: ${err.message}`;
    await project.save();
    throw err;
  }
}

export async function videoRenderNode({ projectId }) {
  const project = await Project.findById(projectId);
  project.status = "rendering_video";
  project.failedAtStep = null;
  project.errorMessage = null;
  project.progressPercent = Math.max(project.progressPercent || 0, VOICE_END);
  project.progressPhase = "Preparing video engine";
  await project.save();

  const progress = makeProgressWriter(projectId);
  try {
    const { publicUrl } = await renderProjectVideo(project, ({ phase, fraction }) => {
      if (phase === "bundling") {
        progress.set(VOICE_END + (BUNDLE_END - VOICE_END) * fraction, "Preparing video engine");
      } else {
        const pct = Math.round(fraction * 100);
        progress.set(BUNDLE_END + (100 - BUNDLE_END) * fraction, `Rendering video - ${pct}%`);
      }
    });
    await progress.flush(); // don't let a late progress write land after "completed"

    project.renderedVideoUrl = publicUrl;
    project.status = "completed";
    project.progressPercent = 100;
    project.progressPhase = "Done";
    await project.save();
    return project;
  } catch (err) {
    await progress.flush();
    project.status = "failed";
    project.failedAtStep = "render";
    project.errorMessage = `Rendering failed: ${err.message}`;
    await project.save();
    throw err;
  }
}

/**
 * Runs voice cloning then rendering, in order, stopping (not throwing past
 * this function) if either stage fails - the failure is already recorded on
 * the project by the stage itself. Used both for a fresh "start production"
 * and, from the failedAtStep === "voice" branch, for retrying after a voice
 * failure (which must also re-run rendering afterward).
 */
export async function runVoiceAndRender(args) {
  await voiceCloneNode(args);
  await videoRenderNode(args);
}
