import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, LogOut, Film, Palette, Download, Mic } from "lucide-react";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

const STATUS_STYLES = {
  draft: "bg-slate-700 text-slate-200",
  planning: "bg-sky-900 text-sky-300",
  plan_approved: "bg-sky-900 text-sky-300",
  scripting: "bg-indigo-900 text-indigo-300",
  script_approved: "bg-indigo-900 text-indigo-300",
  generating_audio: "bg-amber-900 text-amber-300",
  rendering_video: "bg-amber-900 text-amber-300",
  completed: "bg-emerald-900 text-emerald-300",
  failed: "bg-red-900 text-red-300",
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [conceptPrompt, setConceptPrompt] = useState("");
  const [voiceSample, setVoiceSample] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    const res = await api.get("/projects");
    setProjects(res.data.projects);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const form = new FormData();
      form.append("title", title);
      form.append("conceptPrompt", conceptPrompt);
      if (voiceSample) form.append("voiceSample", voiceSample);
      const res = await api.post("/projects", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setShowModal(false);
      navigate(`/project/${res.data.project._id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-panel border-r border-slate-800 flex flex-col p-4">
        <div className="flex items-center gap-2 mb-8">
          <Film className="text-accent" size={24} />
          <span className="font-semibold">RemoGen Studio</span>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-accent text-slate-900 font-medium rounded-lg px-3 py-2 mb-6 hover:opacity-90"
        >
          <Plus size={18} /> New Project
        </button>
        <button
          onClick={() => navigate("/templates")}
          className="flex items-center gap-2 text-slate-300 hover:text-white rounded-lg px-3 py-2 mb-2"
        >
          <Palette size={18} /> Templates
        </button>
        <button
          onClick={() => navigate("/settings/voice")}
          className="flex items-center gap-2 text-slate-300 hover:text-white rounded-lg px-3 py-2 mb-2"
        >
          <Mic size={18} /> Voice Engine
        </button>
        <div className="mt-auto pt-4 border-t border-slate-800">
          <p className="text-sm text-slate-400 truncate mb-2">{user?.email}</p>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm"
          >
            <LogOut size={16} /> Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8">
        <h1 className="text-2xl font-semibold mb-6">Your Projects</h1>
        {projects.length === 0 ? (
          <p className="text-slate-400">No projects yet. Create your first one.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <div
                key={p._id}
                onClick={() => navigate(`/project/${p._id}`)}
                className="bg-panel border border-slate-800 rounded-xl p-4 cursor-pointer hover:border-accent transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium truncate">{p.title}</h3>
                  <span className={`status-badge ${STATUS_STYLES[p.status] || ""}`}>
                    {p.status}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mb-3">
                  {new Date(p.createdAt).toLocaleDateString()}
                </p>
                {p.voiceSettings?.durationInSeconds && (
                  <p className="text-xs text-slate-500 mb-2">
                    ~{Math.round(p.voiceSettings.durationInSeconds)}s voiceover
                  </p>
                )}
                {p.renderedVideoUrl && (
                  <div onClick={(e) => e.stopPropagation()} className="space-y-2">
                    <video
                      src={p.renderedVideoUrl}
                      controls
                      preload="metadata"
                      className="w-full rounded-lg border border-slate-800 bg-black"
                    />
                    <a
                      href={p.renderedVideoUrl}
                      download
                      className="flex items-center gap-1 text-accent text-sm hover:underline"
                    >
                      <Download size={14} /> Download MP4
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4">
          <div className="bg-panel border border-slate-800 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">New Project</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <input
                required
                placeholder="Project title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-base border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-accent"
              />
              <textarea
                required
                placeholder="Describe the video's topic and target audience..."
                rows={4}
                value={conceptPrompt}
                onChange={(e) => setConceptPrompt(e.target.value)}
                className="w-full bg-base border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-accent"
              />
              <div>
                <label className="text-sm text-slate-400 block mb-1">
                  Reference voice sample (.wav/.mp3, optional)
                </label>
                <input
                  type="file"
                  accept=".wav,.mp3"
                  onChange={(e) => setVoiceSample(e.target.files[0])}
                  className="text-sm text-slate-300"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  disabled={creating}
                  className="px-4 py-2 rounded-lg bg-accent text-slate-900 font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
