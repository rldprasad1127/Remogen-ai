import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Film } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await register(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-panel border border-slate-800 rounded-2xl p-8 shadow-xl">
        <div className="flex items-center gap-2 mb-6">
          <Film className="text-accent" size={28} />
          <h1 className="text-xl font-semibold">Create your account</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-base border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-accent"
          />
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-base border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-accent"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            disabled={busy}
            className="w-full bg-accent text-slate-900 font-medium rounded-lg py-2 hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Creating account..." : "Register"}
          </button>
        </form>
        <p className="text-sm text-slate-400 mt-4 text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
