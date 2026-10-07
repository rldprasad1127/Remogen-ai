import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { useTheme } from "../ThemeContext.jsx";

export default function CodeWindow({ title = "terminal", codeSnippet = "" }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  // The window itself pops/fades in first...
  const windowScale = spring({ frame, fps, config: { damping: 14 } });
  const windowOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });

  // ...then typing starts once the window has mostly settled in.
  const typeFrame = Math.max(0, frame - 15);
  const charsToShow = Math.min(codeSnippet.length, Math.floor(typeFrame * 1.5));
  const visibleCode = codeSnippet.slice(0, charsToShow);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 60 }}>
      <div
        style={{
          width: "100%",
          maxWidth: 1000,
          background: "#0B1220",
          borderRadius: theme.borderRadius,
          boxShadow: `0 20px 60px ${theme.primaryColor}33`,
          overflow: "hidden",
          border: `1px solid ${theme.primaryColor}55`,
          opacity: windowOpacity,
          transform: `scale(${windowScale})`,
        }}
      >
        <div style={{ display: "flex", gap: 8, padding: 16, background: "#111827" }}>
          <div style={{ width: 12, height: 12, borderRadius: 6, background: "#EF4444" }} />
          <div style={{ width: 12, height: 12, borderRadius: 6, background: "#F59E0B" }} />
          <div style={{ width: 12, height: 12, borderRadius: 6, background: "#22C55E" }} />
          <span style={{ marginLeft: 12, color: "#94A3B8", fontSize: 20 }}>{title}</span>
        </div>
        <pre
          style={{
            margin: 0,
            padding: 32,
            fontSize: 26,
            lineHeight: 1.6,
            color: theme.primaryColor,
            whiteSpace: "pre-wrap",
            fontFamily: "Menlo, Consolas, monospace",
            minHeight: 120,
          }}
        >
          {visibleCode}
          <span style={{ opacity: frame % 20 < 10 ? 1 : 0 }}>▍</span>
        </pre>
      </div>
    </AbsoluteFill>
  );
}
