import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, CheckCircle2, XCircle, Loader2, Cloud, Monitor, Wand2 } from "lucide-react";
import { api } from "../api.js";

const MODES = [
  { value: "auto", label: "Auto", icon: Wand2, blurb: "Use Colab if it's connected and reachable right now, otherwise fall back to local." },
  { value: "colab", label: "Google Colab", icon: Cloud, blurb: "Always use Colab. Fails clearly if it isn't reachable, instead of silently using local." },
  { value: "local", label: "Local (AllTalk)", icon: Monitor, blurb: "Always use the AllTalk server on this machine." },
];

const COLAB_ENGINES = [
  {
    key: "xtts",
    name: "XTTS-v2",
    tag: "Voice cloning",
    blurb: "Clones your uploaded sample directly. The most reliable option if sounding like YOU specifically is the goal.",
    license: "Non-commercial (Coqui Public Model License)",
  },
  {
    key: "dia",
    name: "Dia",
    tag: "Emotional + cloning",
    blurb: "Write (laughs), (sighs), (coughs) right in your script and it performs them. Also clones your sample, via a different method than XTTS.",
    license: "Apache 2.0 (commercial-friendly)",
  },
  {
    key: "chattts",
    name: "ChatTTS",
    tag: "Conversational only - no cloning",
    blurb: "Natural conversational delivery with fillers and pauses. Does NOT clone your sample - picks one consistent voice per project instead.",
    license: "Check the project's license before commercial use",
  },
];

function StatusPill({ ok, label }) {
  return (
    <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${ok ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-300"}`}>
      {ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      {label}
    </span>
  );
}

export default function VoiceEngineSettings() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("auto");
  const [colabUrl, setColabUrl] = useState("");
  const [colabApiKey, setColabApiKey] = useState("");
  const [hasColabKey, setHasColabKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get("/settings/tts").then((res) => {
      setMode(res.data.mode);
      setColabUrl(res.data.colabUrl || "");
      setHasColabKey(res.data.hasColabKey);
      setLoading(false);
    });
  }, []);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const body = { mode, colabUrl };
      if (colabApiKey) body.colabApiKey = colabApiKey; // only send if the user typed a new one
      const res = await api.post("/settings/tts/test", body);
      setTestResult(res.data);
    } catch (err) {
      setTestResult({ error: err.response?.data?.error || "Test failed" });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const body = { mode, colabUrl };
      if (colabApiKey) body.colabApiKey = colabApiKey; // blank = keep whatever was saved before
      await api.put("/settings/tts", body);
      if (colabApiKey) {
        setHasColabKey(true);
        setColabApiKey("");
      }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-10 text-slate-400">Loading...</div>;

  return (
    <div className="min-h-screen p-8 max-w-2xl mx-auto">
      <button onClick={() => navigate("/dashboard")} className="flex items-center gap-1 text-slate-400 hover:text-white mb-6 text-sm">
        <ArrowLeft size={16} /> Back to dashboard
      </button>

      <h1 className="text-2xl font-semibold mb-1">Voice Engine</h1>
      <p className="text-slate-400 text-sm mb-6">
        Choose whether narration is generated on this machine or on a free Google Colab GPU. Video rendering always
        happens locally either way.
      </p>

      <div className="bg-panel border border-slate-800 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Cloud size={18} className="text-accent" />
          <h2 className="font-medium">Run TTS on Google Colab</h2>
        </div>
        <p className="text-sm text-slate-400 mb-3">
          Pick ONE engine below, download its notebook, open it in Colab, and run its cells - it prints a URL and an
          API key you paste in below. You can switch engines later by just downloading a different notebook.
        </p>

        <div className="grid grid-cols-1 gap-2 mb-4">
          {COLAB_ENGINES.map((engine) => (
            <div key={engine.key} className="border border-slate-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm">{engine.name}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    engine.key === "chattts" ? "bg-amber-900 text-amber-300" : "bg-slate-700 text-slate-300"
                  }`}
                >
                  {engine.tag}
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-1">{engine.blurb}</p>
              <p className="text-xs text-slate-600 mb-2">License: {engine.license}</p>
              <a
                href={`/api/colab-notebook?engine=${engine.key}`}
                className="inline-flex items-center gap-1 text-xs bg-accent text-slate-900 font-medium rounded-lg px-3 py-1.5 hover:opacity-90"
              >
                <Download size={12} /> Download {engine.name} notebook
              </a>
            </div>
          ))}
        </div>

        <label className="text-sm text-slate-400 block mb-1">Colab URL</label>
        <input
          value={colabUrl}
          onChange={(e) => setColabUrl(e.target.value)}
          placeholder="https://something.trycloudflare.com"
          className="w-full bg-base border border-slate-700 rounded-lg px-3 py-2 mb-3 outline-none focus:border-accent font-mono text-sm"
        />
        <label className="text-sm text-slate-400 block mb-1">
          API key {hasColabKey && <span className="text-slate-500">(one is already saved - leave blank to keep it)</span>}
        </label>
        <input
          value={colabApiKey}
          onChange={(e) => setColabApiKey(e.target.value)}
          placeholder={hasColabKey ? "•••••••••••• (unchanged)" : "printed by the notebook"}
          className="w-full bg-base border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-accent font-mono text-sm"
        />
        <p className="text-xs text-slate-500 mt-2">
          Colab disconnects on its own after a while, and the URL + key change every time you re-run it - just update
          them here when that happens.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="text-sm text-slate-400 block mb-2">Which engine to use</label>
          <div className="space-y-2">
            {MODES.map(({ value, label, icon: Icon, blurb }) => (
              <label
                key={value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${mode === value ? "border-accent bg-accent/5" : "border-slate-700"}`}
              >
                <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-1" />
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Icon size={14} /> {label}
                  </div>
                  <p className="text-xs text-slate-500">{blurb}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="px-4 py-2 rounded-lg border border-slate-700 text-sm hover:border-accent disabled:opacity-50 flex items-center gap-2"
          >
            {testing && <Loader2 size={14} className="animate-spin" />}
            Test connection
          </button>
          <button
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-accent text-slate-900 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && <span className="text-emerald-400 text-sm">Saved.</span>}
        </div>
      </form>

      {testResult && (
        <div className="mt-5 bg-panel border border-slate-800 rounded-xl p-4 space-y-2">
          {testResult.error ? (
            <p className="text-red-400 text-sm">{testResult.error}</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm">Google Colab</span>
                <StatusPill ok={testResult.colab.reachable && testResult.colab.ready} label={testResult.colab.detail} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Local (AllTalk)</span>
                <StatusPill ok={testResult.local.reachable} label={testResult.local.detail} />
              </div>
              <p className="text-sm text-slate-400 pt-2 border-t border-slate-800">
                With these settings, generation would use:{" "}
                <strong className="text-white">{testResult.wouldUse ? MODES.find((m) => m.value === testResult.wouldUse)?.label ?? testResult.wouldUse : "nothing - neither engine is reachable"}</strong>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
