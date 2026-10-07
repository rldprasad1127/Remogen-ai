import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { useTheme } from "../ThemeContext.jsx";

export default function ConceptCard({ title = "", points = [] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  const titleOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const titleX = interpolate(frame, [0, 18], [-30, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: 100 }}>
      <h2
        style={{
          fontSize: 56,
          marginBottom: 32,
          color: theme.primaryColor,
          opacity: titleOpacity,
          transform: `translateX(${titleX}px)`,
        }}
      >
        {title}
      </h2>
      <ul style={{ listStyle: "none", padding: 0, fontSize: 34, lineHeight: 1.8 }}>
        {points.map((point, i) => {
          // Each bullet gets its own local clock, offset after the title and
          // staggered from its siblings.
          const childFrame = frame - 15 - i * 8;
          const opacity = interpolate(childFrame, [0, 15], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const translateX = interpolate(childFrame, [0, 15], [-40, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          // A small animated marker (diagram-lite: a filled dot that pops in)
          // instead of a static bullet character.
          const markerScale = spring({ frame: childFrame, fps, config: { damping: 14 } });

          return (
            <li
              key={i}
              style={{
                opacity,
                transform: `translateX(${translateX}px)`,
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: theme.primaryColor,
                  transform: `scale(${markerScale})`,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  borderLeft: `4px solid ${theme.primaryColor}`,
                  paddingLeft: 20,
                  borderRadius: theme.borderRadius,
                }}
              >
                {point}
              </span>
            </li>
          );
        })}
      </ul>
    </AbsoluteFill>
  );
}
