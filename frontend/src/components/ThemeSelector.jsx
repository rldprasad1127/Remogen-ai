import React from "react";

const PRESETS = {
  minimal_light: { primaryColor: "#2563EB", backgroundColor: "#F8FAFC", label: "Minimal Light" },
  minimal_dark: { primaryColor: "#38BDF8", backgroundColor: "#0F172A", label: "Minimal Dark" },
  cyberpunk: { primaryColor: "#F0ABFC", backgroundColor: "#0A0014", label: "Cyberpunk" },
  corporate: { primaryColor: "#2563EB", backgroundColor: "#F8FAFC", label: "Corporate" },
};

export default function ThemeSelector({ value, onChange }) {
  return (
    <div>
      <label className="text-sm text-slate-400 block mb-2">Theme</label>
      <div className="flex gap-3">
        {Object.entries(PRESETS).map(([key, preset]) => (
          <button
            key={key}
            type="button"
            onClick={() =>
              onChange({
                name: key,
                primaryColor: preset.primaryColor,
                backgroundColor: preset.backgroundColor,
                fontFamily: "Inter, sans-serif",
                borderRadius: 12,
              })
            }
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
              value?.name === key ? "border-accent" : "border-slate-700"
            }`}
          >
            <span
              className="w-4 h-4 rounded-full inline-block"
              style={{ backgroundColor: preset.primaryColor }}
            />
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
