import React, { useState } from "react";

export default function PlanReview({ plan, onApprove, onRevise, busy }) {
  const [feedback, setFeedback] = useState("");
  const [showRevise, setShowRevise] = useState(false);

  if (!plan?.hook) {
    return <p className="text-slate-400">Generating plan...</p>;
  }

  return (
    <div className="bg-panel border border-slate-800 rounded-xl p-6 space-y-4">
      <div>
        <span className="text-xs uppercase text-slate-500">Hook</span>
        <p className="text-lg">{plan.hook}</p>
      </div>
      <div>
        <span className="text-xs uppercase text-slate-500">Key Points</span>
        <ul className="list-disc list-inside space-y-1 mt-1">
          {(plan.keyPoints || []).map((kp, i) => (
            <li key={i}>{kp}</li>
          ))}
        </ul>
      </div>
      <div>
        <span className="text-xs uppercase text-slate-500">Call to Action</span>
        <p>{plan.cta}</p>
      </div>

      {showRevise ? (
        <div className="space-y-2 pt-2">
          <textarea
            rows={3}
            placeholder="What would you like changed?"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="w-full bg-base border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => onRevise(feedback)}
              className="px-4 py-2 rounded-lg bg-accent text-slate-900 font-medium hover:opacity-90 disabled:opacity-50"
            >
              Submit feedback
            </button>
            <button onClick={() => setShowRevise(false)} className="px-4 py-2 rounded-lg text-slate-300">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 pt-2">
          <button
            disabled={busy}
            onClick={onApprove}
            className="px-4 py-2 rounded-lg bg-accent text-slate-900 font-medium hover:opacity-90 disabled:opacity-50"
          >
            Approve Plan
          </button>
          <button onClick={() => setShowRevise(true)} className="px-4 py-2 rounded-lg text-slate-300 border border-slate-700">
            Request changes
          </button>
        </div>
      )}
    </div>
  );
}
