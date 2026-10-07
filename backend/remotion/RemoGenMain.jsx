import React from "react";
import { AbsoluteFill } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { ThemeProvider } from "./ThemeContext.jsx";
import { TRANSITION_FRAMES, effectiveSceneFrames } from "./constants.js";
import HookScene from "./scenes/HookScene.jsx";
import ConceptCard from "./scenes/ConceptCard.jsx";
import CodeWindow from "./scenes/CodeWindow.jsx";
import ComparisonScene from "./scenes/ComparisonScene.jsx";
import OutroScene from "./scenes/OutroScene.jsx";
import AvatarScene from "./scenes/AvatarScene.jsx";

const SCENE_COMPONENTS = {
  hook: HookScene,
  concept: ConceptCard,
  code: CodeWindow,
  comparison: ComparisonScene,
  outro: OutroScene,
  avatar: AvatarScene,
};

/**
 * Root composition. Each scene is a <TransitionSeries.Sequence> with a
 * crossfade to the next (no hard cuts), and each scene carries its OWN
 * narration clip (scene.audioUrl) that starts exactly when the scene does.
 * Scene lengths are derived from the real audio length by the backend
 * (see sceneFramesForAudio), so picture and voice stay in sync however long
 * the video is - a single long audio track drifts, per-scene clips can't.
 */
export default function RemoGenMain({ theme, scenes = [] }) {
  if (!scenes.length) {
    return <ThemeProvider theme={theme}><AbsoluteFill /></ThemeProvider>;
  }

  return (
    <ThemeProvider theme={theme}>
      <TransitionSeries>
        {scenes.flatMap((scene, i) => {
          const Component = SCENE_COMPONENTS[scene.templateType] || ConceptCard;
          const items = [
            <TransitionSeries.Sequence
              key={`scene-${scene.sceneIndex ?? i}`}
              durationInFrames={effectiveSceneFrames(scene)}
            >
              <Component {...(scene.props || {})} />
              {scene.audioUrl ? <Audio src={scene.audioUrl} /> : null}
            </TransitionSeries.Sequence>,
          ];
          if (i < scenes.length - 1) {
            items.push(
              <TransitionSeries.Transition
                key={`transition-${scene.sceneIndex ?? i}`}
                timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
                presentation={fade()}
              />
            );
          }
          return items;
        })}
      </TransitionSeries>
    </ThemeProvider>
  );
}
