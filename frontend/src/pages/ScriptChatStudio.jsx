import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Rocket } from "lucide-react";
import { api } from "../api.js";

export default function ScriptChatStudio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [chatHistory, setChatHistory] = useState([]);
  const [script, setScript] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [launching, setLaunching] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.get(`/projects/${id}/script-chat`).then((res) => {
      setChatHistory(res.data.chatHistory);
      setScript(res.data.script);
    });
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  async function handleSend(e) {
    e.preventDefault();
    if (!message.trim() || busy) return;
    const outgoing = message;
    setMessage("");
    setBusy(true);
    setChatHistory((h) => [...h, { role: "user", content: outgoing }]);
    try {
      const res = await api.post(`/projects/${id}/script-chat`, { message: outgoing });
      setChatHistory(res.data.chatHistory);
      setScript(res.data.script);
    } finally {
      setBusy(false);
    }
  }

  async function handleUseForProduction() {
    setLaunching(true);
    try {
      await api.post(`/projects/${id}/script-chat/use-for-production`);
      navigate(`/project/${id}`);
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col max-w-3xl mx-auto p-8">
      <button
        onClick={() => navigate(`/project/${id}`)}
        className="flex items-center gap-1 text-slate-400 hover:text-white mb-4 text-sm"
      >
        <ArrowLeft size={16} /> Back to project
      </button>

      <h1 className="text-xl font-semibold mb-1">Script chat</h1>
      <p className="text-sm text-slate-500 mb-4">
        First message describes the video. Every message after that revises the
        current script - "make the intro punchier", "add a section on pricing", etc.
      </p>

      <div className="flex-1 bg-panel border border-slate-800 rounded-xl p-4 overflow-y-auto mb-4 space-y-3" style={{ minHeight: 240, maxHeight: 360 }}>
        {chatHistory.length === 0 && (
          <p className="text-slate-500 text-sm">
            Try: "A 90 second explainer on why REST APIs are still relevant in 2026."
          </p>
        )}
        {chatHistory.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user" ? "bg-accent text-slate-900" : "bg-slate-800 text-slate-200"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && <p className="text-slate-500 text-sm">Generating...</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="flex gap-2 mb-6">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe the video, or ask for a change..."
          className="flex-1 bg-base border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-accent"
        />
        <button
          disabled={busy}
          className="flex items-center gap-1 bg-accent text-slate-900 font-medium rounded-lg px-4 py-2 hover:opacity-90 disabled:opacity-50"
        >
          <Send size={16} /> Send
        </button>
      </form>

      {script.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm uppercase text-slate-500">
              Current script ({script.length} segments)
            </h2>
            <button
              onClick={handleUseForProduction}
              disabled={launching}
              className="flex items-center gap-1 bg-accent text-slate-900 text-sm font-medium rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
            >
              <Rocket size={14} /> {launching ? "Sending to production..." : "Use this script for production"}
            </button>
          </div>
          <div className="space-y-2">
            {script.map((seg, i) => (
              <div key={i} className="bg-panel border border-slate-800 rounded-lg p-3">
                <span className="text-xs text-slate-500">{i + 1}. {seg.type}</span>
                <p className="text-sm mt-1">{seg.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
