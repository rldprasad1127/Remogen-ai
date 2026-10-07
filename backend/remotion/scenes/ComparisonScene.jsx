import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { useTheme } from "../ThemeContext.jsx";

export default function ComparisonScene({
  leftLabel = "Before",
  leftItems = [],
  rightLabel = "After",
  rightItems = [],
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();

  // Each side slides in from its own edge of the screen, independently.
  const leftX = interpolate(frame, [0, 20], [-120, 0], { extrapolateRight: "clamp" });
  const rightX = interpolate(frame, [0, 20], [120, 0], { extrapolateRight: "clamp" });
  const sidesOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  // Diagram: a vertical divider that draws itself (grows from the center
  // outward) plus a small "vs" arrow badge that pops in once the divider
  // has mostly finished, tying the two sides together visually.
  const dividerHeight = interpolate(frame, [5, 30], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const badgeScale = spring({ frame: frame - 22, fps, config: { damping: 12 } });

  const Column = ({ label, items, accent, offsetX, align }) => (
    <div
      style={{
        flex: 1,
        padding: 40,
        opacity: sidesOpacity,
        transform: `translateX(${offsetX}px)`,
        textAlign: align,
      }}
    >
      <h3 style={{ fontSize: 40, color: accent, marginBottom: 20 }}>{label}</h3>
      {items.map((item, i) => {
        const childFrame = frame - 15 - i * 8;
        const opacity = interpolate(childFrame, [0, 15], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const translateY = interpolate(childFrame, [0, 15], [15, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <p key={i} style={{ fontSize: 28, margin: "12px 0", opacity, transform: `translateY(${translateY}px)` }}>
            • {item}
          </p>
        );
      })}
    </div>
  );

  return (
    <AbsoluteFill style={{ flexDirection: "row", alignItems: "center" }}>
      <Column label={leftLabel} items={leftItems} accent="#64748b" offsetX={leftX} align="right" />

      <div style={{ position: "relative", width: 2, height: "100%", display: "flex", justifyContent: "center" }}>
        <div
          style={{
            width: 2,
            height: `${dividerHeight}%`,
            background: theme.primaryColor,
            opacity: 0.4,
            alignSelf: "center",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: `translate(-50%, -50%) scale(${badgeScale})`,
            background: theme.primaryColor,
            color: "#fff",
            borderRadius: "50%",
            width: 56,
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          VS
        </div>
      </div>

      <Column label={rightLabel} items={rightItems} accent={theme.primaryColor} offsetX={rightX} align="left" />
    </AbsoluteFill>
  );
}
