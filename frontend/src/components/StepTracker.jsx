import React from "react";
import { Check } from "lucide-react";

const STEPS = ["Concept & Planning", "Script & Scenes", "Preview", "Render & Download"];

export default function StepTracker({ current }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, i) => {
        const stepNum = i + 1;
        const isDone = stepNum < current;
        const isActive = stepNum === current;
        return (
          <React.Fragment key={label}>
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                  isDone
                    ? "bg-accent text-slate-900"
                    : isActive
                    ? "border-2 border-accent text-accent"
                    : "border border-slate-700 text-slate-500"
                }`}
              >
                {isDone ? <Check size={14} /> : stepNum}
              </div>
              <span className={`text-sm ${isActive ? "text-white" : "text-slate-500"}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && <div className="w-8 h-px bg-slate-700" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}
