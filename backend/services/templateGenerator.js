import { generateStructured } from "./ollamaService.js";
import Template from "../models/Template.js";

/**
 * Generates a new Remotion scene template (component code + prop schema)
 * from a natural-language description, so end-users never write React by hand.
 *
 * IMPORTANT for whoever wires up the AI coding assistant that maintains this
 * file (Claude / Cursor): when extending the prompts below, point the
 * assistant at the Remotion MCP server so generated code correctly uses
 * Remotion's actual API surface - useCurrentFrame, interpolate, spring,
 * <AbsoluteFill>, <Sequence> - rather than hallucinated prop names.
 */
const SYSTEM_PROMPT = `You are a senior Remotion (React video) motion graphics engineer - not a
slideshow generator. Every component you write must feel like an animated
explainer video, not a static slide with a single fade.

Component requirements:
- import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence } from "remotion"
- accept a single "props" object matching a JSON schema you also define
- use useTheme() from "../ThemeContext" for primaryColor / borderRadius / fontFamily
- animate purely with useCurrentFrame() + interpolate/spring (no external animation libs, no CSS @keyframes)
- if the scene benefits from a diagram (a process, a comparison, a hierarchy, a flow,
  an architecture) draw it as plain inline SVG shapes (rect/circle/path/line) that
  animate in the same way as everything else - do not just describe the diagram in text
- never fetch network resources or use browser-only APIs
- NEVER use Math.random() - Remotion re-renders each frame independently (including
  during server-side rendering across parallel workers), so Math.random() produces
  visibly inconsistent results. If randomness is genuinely needed, import { random }
  from "remotion" and call it with a fixed string seed, e.g. random("my-seed").
- if the scene needs a static image, use <Img> from "remotion"; if it needs a local
  asset from the project's public/ folder (not a remote URL), wrap the path in
  staticFile() from "remotion", e.g. <Img src={staticFile("logo.png")} />
- do not use <Video>, <Gif>, or <Audio> unless the scene description explicitly calls
  for embedded video/GIF/audio - these scene templates are visual layers only; the
  narration audio track is added once, separately, by the code that assembles scenes
- do NOT wrap your own output in <TransitionSeries> or <Series> - that is handled by
  the code that sequences multiple scenes together; your component is a single scene

Animation Rules (STRICT - do not return a static slide):
1. Nothing appears at full opacity/scale on frame 0. Every visible element enters over
   time: fade with interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: "clamp",
   extrapolateRight: "clamp" }), and pop/slide with spring({ fps, frame, config: {
   damping: 12 } }) combined into a transform, e.g. \`scale(\${scale}) translateY(\${translateY}px)\`.
2. Stagger every group of elements (bullet points, diagram nodes, multiple lines of
   text) - each one gets its own local frame offset by subtracting an index-based
   delay, e.g. \`const childFrame = frame - i * 8;\` then animate childFrame instead of
   frame directly for that element. Never animate a list of things all at frame 0.
3. Prefer motion that supports the content's meaning (a comparison slides two sides in
   from opposite directions, a process diagram draws its connecting lines/arrows in
   sequence, a stat counts up) over generic fades where a more specific animation fits.

EXAMPLE OF THE EXPECTED ANIMATION STYLE (copy this pattern, do not just fade a div in and stop):

import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

export const AnimatedText = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fluid entry using spring (pops up from 0 to 1)
  const scale = spring({ fps, frame, config: { damping: 12 } });

  // Smooth fade in using interpolate
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Sliding up motion
  const translateY = interpolate(frame, [0, 20], [50, 0], { extrapolateRight: "clamp" });

  return (
    <h1 style={{ opacity, transform: \`scale(\${scale}) translateY(\${translateY}px)\` }}>
      Dynamic Title
    </h1>
  );
};

Return strictly valid JSON with keys "componentCode" (string, the full .jsx source)
and "defaultProps" (object, sample prop values that make the component look good
in an isolated preview, showing several staggered elements so the animation is visible).`;

export async function generateTemplateFromPrompt({ userId, name, type, description }) {
  const userPrompt = `Template name: "${name}"
Template type key: "${type}"
User's description of the desired scene: "${description}"

Design a single React component named "${toComponentName(name)}" implementing this idea.`;

  const schemaHint = `{
  "componentCode": "<full JSX source as a string>",
  "defaultProps": { "...": "sample prop values" }
}`;

  const result = await generateStructured({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    schemaHint,
  });

  const template = await Template.create({
    userId,
    name,
    type,
    componentCode: result.componentCode,
    defaultProps: result.defaultProps || {},
    isSystemDefault: false,
  });

  return template;
}

function toComponentName(name) {
  return name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
}
