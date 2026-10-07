import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { useTheme } from "../ThemeContext.jsx";

export default function HookScene({ title = "", subtitle = "" }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  // Title: pops in with a spring + slides up while fading in.
  const titleScale = spring({ frame, fps, config: { damping: 12 } });
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [0, 20], [40, 0], { extrapolateRight: "clamp" });

  // Subtitle: staggered ~10 frames behind the title, its own local clock.
  const subtitleFrame = frame - 10;
  const subtitleOpacity = interpolate(subtitleFrame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const subtitleY = interpolate(subtitleFrame, [0, 20], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // A soft accent shape drifting in behind the text, staggered earliest of all.
  const bgScale = spring({ frame, fps, config: { damping: 20 }, durationInFrames: 40 });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 80 }}>
      <div
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: `${theme.primaryColor}14`,
          transform: `scale(${bgScale})`,
        }}
      />
      <div style={{ textAlign: "center", position: "relative" }}>
        <h1
          style={{
            fontSize: 88,
            fontWeight: 800,
            margin: 0,
            color: theme.primaryColor,
            opacity: titleOpacity,
            transform: `scale(${titleScale}) translateY(${titleY}px)`,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              fontSize: 36,
              marginTop: 24,
              opacity: subtitleOpacity * 0.85,
              transform: `translateY(${subtitleY}px)`,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </AbsoluteFill>
  );
}
