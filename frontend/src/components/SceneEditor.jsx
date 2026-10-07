import React, { useState } from "react";
import { RefreshCw } from "lucide-react";

export default function SceneEditor({ scenes, onChange, onApprove, busy }) {
  const [regenIndex, setRegenIndex] = useState(null);
  const [regenNote, setRegenNote] = useState("");

  function updateScene(index, patch) {
    const next = scenes.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange(next);
  }

  function updateProp(index, key, value) {
    updateScene(index, { props: { ...scenes[index].props, [key]: value } });
  }

  return (
    <div className="space-y-4">
      {scenes.map((scene, i) => (
        <div key={i} className="bg-panel border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">
              Scene {i + 1} <span className="text-slate-500 text-sm">({scene.templateType})</span>
            </h3>
            <button
              onClick={() => setRegenIndex(regenIndex === i ? null : i)}
              className="flex items-center gap-1 text-sm text-slate-400 hover:text-accent"
            >
              <RefreshCw size={14} /> Regenerate scene
            </button>
          </div>

          <label className="text-xs uppercase text-slate-500 block mb-1">Dialogue</label>
          <textarea
            rows={2}
            value={scene.dialogue}
            onChange={(e) => updateScene(i, { dialogue: e.target.value })}
            className="w-full bg-base border border-slate-700 rounded-lg px-3 py-2 mb-3 outline-none focus:border-accent"
          />

          {Object.entries(scene.props || {}).map(([key, value]) => (
            <div key={key} className="mb-2">
              <label className="text-xs uppercase text-slate-500 block mb-1">{key}</label>
              <input
                value={typeof value === "string" ? value : JSON.stringify(value)}
                onChange={(e) => updateProp(i, key, e.target.value)}
                className="w-full bg-base border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-accent"
              />
            </div>
          ))}

          {regenIndex === i && (
            <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
              <textarea
                rows={2}
                placeholder="What should change about this scene?"
                value={regenNote}
                onChange={(e) => setRegenNote(e.target.value)}
                className="w-full bg-base border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-accent"
              />
              <p className="text-xs text-slate-500">
                Note: full per-scene regeneration calls the same revision endpoint as the
                plan step, passing this note as feedback for a script rewrite.
              </p>
            </div>
          )}
        </div>
      ))}

      <button
        disabled={busy}
        onClick={onApprove}
        className="px-5 py-2 rounded-lg bg-accent text-slate-900 font-medium hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Starting production..." : "Approve Script & Start Production"}
      </button>
    </div>
  );
}
