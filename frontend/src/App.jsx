import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import ProjectWorkspace from "./pages/ProjectWorkspace.jsx";
import ScriptChatStudio from "./pages/ScriptChatStudio.jsx";
import Templates from "./pages/Templates.jsx";
import VoiceEngineSettings from "./pages/VoiceEngineSettings.jsx";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-10 text-slate-400">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/dashboard"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/templates"
        element={
          <Protected>
            <Templates />
          </Protected>
        }
      />
      <Route
        path="/project/:id"
        element={
          <Protected>
            <ProjectWorkspace />
          </Protected>
        }
      />
      <Route
        path="/project/:id/script-chat"
        element={
          <Protected>
            <ScriptChatStudio />
          </Protected>
        }
      />
      <Route
        path="/settings/voice"
        element={
          <Protected>
            <VoiceEngineSettings />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
