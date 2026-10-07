// Shared by the Remotion composition, the backend workflow, and (via a
// mirrored copy) the browser Player, so all three agree on how long scenes
// and the whole video are. Plain JS - no JSX - so Node can import it too.

export const FPS = 30;

// Crossfade between scenes. TransitionSeries overlaps the outgoing and
// incoming scene by this many frames, so total video length is the sum of
// scene lengths MINUS this overlap for every boundary.
export const TRANSITION_FRAMES = 15;

// A short breathing pause after each spoken line, in frames.
export const SCENE_GAP_FRAMES = 6;

// A scene in the middle of the video has a transition on both sides, so it
// must be long enough not to have the two overlap each other.
export const MIN_SCENE_FRAMES = TRANSITION_FRAMES * 2 + 2;

export const DEFAULT_SCENE_FRAMES = 150;

export function effectiveSceneFrames(scene) {
  return Math.max(Number(scene?.durationInFrames) || DEFAULT_SCENE_FRAMES, MIN_SCENE_FRAMES);
}

/**
 * How long a scene must last to fit `seconds` of narration with no overlap
 * into the next scene's audio. The next scene starts TRANSITION_FRAMES
 * before this one ends, so the scene must outlast its audio by at least
 * that much (plus a small pause).
 */
export function sceneFramesForAudio(seconds) {
  return Math.max(MIN_SCENE_FRAMES, Math.ceil(seconds * FPS) + TRANSITION_FRAMES + SCENE_GAP_FRAMES);
}

export function totalCompositionFrames(scenes = []) {
  if (!scenes.length) return FPS * 5; // placeholder length for an empty project
  const sum = scenes.reduce((s, sc) => s + effectiveSceneFrames(sc), 0);
  return Math.max(1, sum - TRANSITION_FRAMES * (scenes.length - 1));
}
