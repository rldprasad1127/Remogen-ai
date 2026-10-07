import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { useTheme } from "../ThemeContext.jsx";

/**
 * Fallback visual for chat-generated "avatar" monologue segments, which have
 * no template-specific props - just spoken text. Shows the line as a caption
 * with an animated waveform. Swap this out once you wire in an actual
 * talking-head video/avatar render, or a webcam overlay.
 */
export default function AvatarScene({ text = "" }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const textScale = spring({ frame, fps, config: { damping: 14 } });
  const textOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const textY = interpolate(frame, [0, 20], [30, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 100 }}>
      <div
        style={{
          textAlign: "center",
          maxWidth: 900,
          opacity: textOpacity,
          transform: `scale(${textScale}) translateY(${textY}px)`,
        }}
      >
        <p style={{ fontSize: 42, lineHeight: 1.5, fontWeight: 600 }}>{text}</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 40 }}>
          {Array.from({ length: 24 }).map((_, i) => {
            // Bars stagger their entrance left-to-right, then oscillate
            // continuously once visible.
            const barFrame = frame - i * 1.5;
            const entrance = interpolate(barFrame, [0, 10], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const height = (8 + Math.abs(Math.sin(frame / 4 + i)) * 32) * entrance;
            return (
              <div
                key={i}
                style={{
                  width: 4,
                  height,
                  borderRadius: 2,
                  background: theme.primaryColor,
                  opacity: 0.7 * entrance,
                }}
              />
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}
