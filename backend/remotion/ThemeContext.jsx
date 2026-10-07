import React, { createContext, useContext } from "react";
import { AbsoluteFill } from "remotion";

// Light by default: motion-graphics style videos read better on a clean
// light background than the dark "app UI" look. Dark presets are still
// available and selectable per-project (see ThemeSelector).
const defaultTheme = {
  name: "minimal_light",
  primaryColor: "#2563EB",
  backgroundColor: "#F8FAFC",
  fontFamily: "Inter, sans-serif",
  borderRadius: 12,
};

const ThemeContext = createContext(defaultTheme);

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Wraps the composition, decoupling visual style from structural scene
 * components. Applies background/font/text-contrast globally via a base
 * <AbsoluteFill>, and exposes primaryColor/borderRadius to scenes through
 * useTheme().
 */
export function ThemeProvider({ theme, children }) {
  const merged = { ...defaultTheme, ...theme };
  const textColor = getContrastColor(merged.backgroundColor);

  return (
    <ThemeContext.Provider value={merged}>
      <AbsoluteFill
        style={{
          backgroundColor: merged.backgroundColor,
          fontFamily: merged.fontFamily,
          color: textColor,
        }}
      >
        {children}
      </AbsoluteFill>
    </ThemeContext.Provider>
  );
}

function getContrastColor(hex) {
  if (!hex || hex[0] !== "#") return "#FFFFFF";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0F172A" : "#F8FAFC";
}
