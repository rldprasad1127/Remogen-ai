import React from "react";
import { AbsoluteFill, useCurrentFrame, spring, interpolate, useVideoConfig } from "remotion";
import { useTheme } from "../ThemeContext.jsx";

export default function OutroScene({ cta = "", handle = "" }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const ctaScale = spring({ frame, fps, config: { damping: 12 } });
  const ctaOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  // Handle is staggered in after the CTA has popped, own fade + slide-up.
  const handleFrame = frame - 15;
  const handleOpacity = interpolate(handleFrame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const handleY = interpolate(handleFrame, [0, 15], [15, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <h2
          style={{
            fontSize: 60,
            color: theme.primaryColor,
            margin: 0,
            opacity: ctaOpacity,
            transform: `scale(${ctaScale})`,
          }}
        >
          {cta}
        </h2>
        {handle && (
          <p
            style={{
              fontSize: 30,
              marginTop: 20,
              opacity: handleOpacity * 0.8,
              transform: `translateY(${handleY}px)`,
            }}
          >
            {handle}
          </p>
        )}
      </div>
    </AbsoluteFill>
  );
}
