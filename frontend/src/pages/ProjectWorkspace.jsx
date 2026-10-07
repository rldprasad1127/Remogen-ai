import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Player } from "@remotion/player";
import { ArrowLeft, Download, MessageSquare, RotateCcw } from "lucide-react";
import { api } from "../api.js";
import StepTracker from "../components/StepTracker.jsx";
import PlanReview from "../components/PlanReview.jsx";
import SceneEditor from "../components/SceneEditor.jsx";
import ThemeSelector from "../components/ThemeSelector.jsx";
import ProgressBar from "../components/ProgressBar.jsx";
import RemoGenMain from "../remotion/RemoGenMain.jsx";

const STATUS_TO_STEP = {
  draft: 1,
  planning: 1,
  plan_approved: 2,
  scripting: 2,
  script_approved: 3,
  generating_audio: 4,
  rendering_video: 4,
  completed: 4,
  failed: 4,
};

export default function ProjectWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [busy, setBusy] = useState(false);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    loadProject();
    return () => eventSourceRef.current?.close();
  }, [id]);

  async function loadProject() {
    const res = await api.get(`/projects/${id}`);
    setProject(res.data.project);
    if (["script_approved", "generating_audio", "rendering_video"].includes(res.data.project.status)) {
      subscribeToProgress();
    }
  }

  async function handleGeneratePlan() {
    setBusy(true);
    try {
      const res = await api.post(`/projects/${id}/plan`);
      setProject(res.data.project);
    } finally {
      setBusy(false);
    }
  }

  async function handleApprovePlan() {
    setBusy(true);
    try {
      const res = await api.post(`/projects/${id}/plan/approve`);
      setProject(res.data.project);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevisePlan(feedback) {
    setBusy(true);
    try {
      const res = await api.post(`/projects/${id}/plan/revise`, { feedback });
      setProject(res.data.project);
    } finally {
      setBusy(false);
    }
  }

  async function handleThemeChange(theme) {
    const res = await api.post(`/projects/${id}/plan/revise`, { feedback: "" }).catch(() => null);
    // Theme changes are stored client-side then saved along with the next
    // save-triggering action; for immediate persistence you'd add a
    // dedicated PATCH /projects/:id endpoint.
    setProject((p) => ({ ...p, theme }));
  }

  async function handleApproveScript() {
    setBusy(true);
    try {
      await api.post(`/projects/${id}/script/approve`);
      const res = await api.get(`/projects/${id}`);
      setProject(res.data.project);
      subscribeToProgress();
    } finally {
      setBusy(false);
    }
  }

  async function handleRetry() {
    setBusy(true);
    try {
      await api.post(`/projects/${id}/retry`);
      const res = await api.get(`/projects/${id}`);
      setProject(res.data.project);
      subscribeToProgress();
    } finally {
      setBusy(false);
    }
  }

  function subscribeToProgress() {
    // Auth here relies on the httpOnly cookie set at login/register, since
    // native EventSource can't attach a custom Authorization header.
    const es = new EventSource(`/api/projects/${id}/progress`, { withCredentials: true });
    eventSourceRef.current = es;
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setProject((p) => ({
        ...p,
        status: data.status,
        renderedVideoUrl: data.videoUrl,
        errorMessage: data.error,
        failedAtStep: data.failedAtStep,
        progressPercent: data.progressPercent,
        progressPhase: data.progressPhase,
        voiceSettings: { ...p.voiceSettings, provider: data.voiceProvider ?? p.voiceSettings?.provider },
      }));
      if (["completed", "failed"].includes(data.status)) es.close();
    };
  }

  if (!project) return <div className="p-10 text-slate-400">Loading...</div>;

  const step = STATUS_TO_STEP[project.status] || 1;
  const totalDuration = (project.scenes || []).reduce((s, sc) => s + (sc.durationInFrames || 150), 0) || 900;

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto">
      <button
        onClick={() => navigate("/dashboard")}
        className="flex items-center gap-1 text-slate-400 hover:text-white mb-6 text-sm"
      >
        <ArrowLeft size={16} /> Back to dashboard
      </button>

      <h1 className="text-2xl font-semibold mb-2">{project.title}</h1>
      <StepTracker current={step} />

      {step === 1 && (
        <div className="space-y-6">
          <ThemeSelector value={project.theme} onChange={handleThemeChange} />
          <button
            onClick={() => navigate(`/project/${id}/script-chat`)}
            className="flex items-center gap-2 text-sm text-slate-300 border border-slate-700 rounded-lg px-4 py-2 hover:border-accent w-fit"
          >
            <MessageSquare size={16} />
            Prefer a single-narrator monologue? Try the script chat instead
          </button>
          {!project.plan?.hook ? (
            <button
              disabled={busy}
              onClick={handleGeneratePlan}
              className="px-5 py-2 rounded-lg bg-accent text-slate-900 font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Generating..." : "Generate Plan"}
            </button>
          ) : (
            <PlanReview plan={project.plan} onApprove={handleApprovePlan} onRevise={handleRevisePlan} busy={busy} />
          )}
        </div>
      )}

      {step === 2 && (
        <SceneEditor
          scenes={project.scenes}
          onChange={(scenes) => setProject((p) => ({ ...p, scenes }))}
          onApprove={handleApproveScript}
          busy={busy}
        />
      )}

      {step === 3 && (
        <div className="space-y-4">
          <p className="text-slate-400 text-sm">
            Production is running - preview the composed video below and continue to
            watch it render into a final MP4.
          </p>
          <div className="rounded-xl overflow-hidden border border-slate-800 max-w-3xl mx-auto">
            <Player
              component={RemoGenMain}
              inputProps={{
                theme: project.theme,
                scenes: project.scenes,
                audioUrl: project.voiceSettings?.audioUrl || null,
              }}
              durationInFrames={totalDuration}
              fps={30}
              compositionWidth={1920}
              compositionHeight={1080}
              style={{ width: "100%" }}
              controls
            />
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4 max-w-md">
          <ProgressBar
            status={project.status}
            percent={project.progressPercent}
            phase={project.progressPhase}
            voiceProvider={project.voiceSettings?.provider}
          />
          {project.status === "completed" && project.renderedVideoUrl && (
            <>
              <video
                src={project.renderedVideoUrl}
                controls
                className="w-full rounded-xl border border-slate-800 bg-black"
              />
              <a
                href={project.renderedVideoUrl}
                download
                className="flex items-center gap-2 w-fit px-5 py-2 rounded-lg bg-accent text-slate-900 font-medium hover:opacity-90"
              >
                <Download size={16} /> Download MP4
              </a>
            </>
          )}
          {project.status === "failed" && (
            <div className="space-y-3">
              <p className="text-red-400 text-sm">{project.errorMessage}</p>
              <button
                disabled={busy}
                onClick={handleRetry}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-accent text-slate-900 font-medium hover:opacity-90 disabled:opacity-50"
              >
                <RotateCcw size={16} />
                {busy
                  ? "Retrying..."
                  : project.failedAtStep === "render"
                  ? "Retry rendering (voice already generated)"
                  : "Retry from voice generation"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
