import React from "react";

const FALLBACK_LABELS = {
  script_approved: "Queued...",
  generating_audio: "Generating narration...",
  rendering_video: "Rendering video...",
  completed: "Done!",
  failed: "Failed",
};

/**
 * Shows the REAL progress reported by the backend (percent + a human phase
 * string like "Generating voiceover (Google Colab - scene 4 of 12)"), not a
 * guessed 4-step split. Falls back to a status-based label only if the
 * backend hasn't reported a phase yet (e.g. right after clicking approve,
 * before the first SSE tick arrives).
 */
export default function ProgressBar({ status, percent, phase, voiceProvider }) {
  const pct = status === "completed" ? 100 : status === "failed" ? (percent ?? 100) : (percent ?? 0);
  const label = phase || FALLBACK_LABELS[status] || status;

  return (
    <div>
      <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${status === "failed" ? "bg-red-500" : "bg-accent"}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-sm text-slate-400">{label}</p>
        {status !== "failed" && <p className="text-xs text-slate-500">{Math.round(pct)}%</p>}
      </div>
      {voiceProvider && status !== "failed" && (
        <p className="text-xs text-slate-500 mt-1">Voice engine: {voiceProvider === "colab" ? "Google Colab" : "Local (AllTalk)"}</p>
      )}
    </div>
  );
}
