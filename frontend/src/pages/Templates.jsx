import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Trash2 } from "lucide-react";
import { api } from "../api.js";

export default function Templates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await api.get("/templates");
    setTemplates(res.data.templates);
  }

  async function handleGenerate(e) {
    e.preventDefault();
    setGenerating(true);
    setError("");
    try {
      await api.post("/templates/generate", { name, type, description });
      setShowModal(false);
      setName("");
      setType("");
      setDescription("");
      await load();
    } catch (err) {
      setError(err.response?.data?.error || "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(id) {
    await api.delete(`/templates/${id}`);
    load();
  }

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto">
      <button
        onClick={() => navigate("/dashboard")}
        className="flex items-center gap-1 text-slate-400 hover:text-white mb-6 text-sm"
      >
        <ArrowLeft size={16} /> Back to dashboard
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Template Studio</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-accent text-slate-900 font-medium rounded-lg px-4 py-2 hover:opacity-90"
        >
          <Sparkles size={16} /> New Template with AI
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((t) => (
          <div key={t._id} className="bg-panel border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">{t.name}</h3>
              {!t.isSystemDefault && (
                <button onClick={() => handleDelete(t._id)} className="text-slate-500 hover:text-red-400">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <span className="text-xs text-slate-500">{t.type}</span>
            {t.isSystemDefault && (
              <span className="ml-2 status-badge bg-slate-700 text-slate-300">system</span>
            )}
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4">
          <div className="bg-panel border border-slate-800 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">New Template with AI</h2>
            <form onSubmit={handleGenerate} className="space-y-3">
              <input
                required
                placeholder="Template name (e.g. 3D Laptop Showcase)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-base border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-accent"
              />
              <input
                required
                placeholder="Type key (e.g. laptop_showcase)"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-base border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-accent"
              />
              <textarea
                required
                rows={4}
                placeholder="Describe the scene: what it shows, how it animates..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-base border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-accent"
              />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-slate-300">
                  Cancel
                </button>
                <button
                  disabled={generating}
                  className="px-4 py-2 rounded-lg bg-accent text-slate-900 font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {generating ? "Generating..." : "Generate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
