import React from "react";
import { registerRoot, Composition } from "remotion";
import RemoGenMain from "./RemoGenMain.jsx";
import { FPS, totalCompositionFrames } from "./constants.js";

function Root() {
  return (
    <Composition
      id="RemoGenMain"
      component={RemoGenMain}
      durationInFrames={FPS * 5}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{
        theme: {
          name: "minimal_light",
          primaryColor: "#2563EB",
          backgroundColor: "#F8FAFC",
          fontFamily: "Inter, sans-serif",
          borderRadius: 12,
        },
        scenes: [],
      }}
      calculateMetadata={async ({ props }) => ({
        // Sum of scene lengths minus the crossfade overlaps, so the render
        // ends exactly when the last scene does (no blank tail).
        durationInFrames: totalCompositionFrames(props.scenes || []),
      })}
    />
  );
}

registerRoot(Root);
