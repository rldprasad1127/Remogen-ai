import { generateStructured } from "./ollamaService.js";

// Rough conversational narration pace. Adjust to match your actual TTS
// voice's speaking rate once you've heard a sample - AllTalk/XTTS voices
// vary roughly 120-160 wpm depending on the cloned speaker.
export const WORDS_PER_MINUTE = 140;

/**
 * Looks for an explicit duration target in the user's message, e.g.
 * "10-15 min video", "about 12 minutes", "lasts up to 10 minutes".
 * Returns { minMinutes, maxMinutes } or null if nothing was stated.
 */
export function parseDurationMinutes(message) {
  const rangeMatch = message.match(/(\d+)\s*(?:-|to)\s*(\d+)\s*min/i);
  if (rangeMatch) {
    return { minMinutes: Number(rangeMatch[1]), maxMinutes: Number(rangeMatch[2]) };
  }
  const singleMatch = message.match(/(\d+)\s*min/i);
  if (singleMatch) {
    const m = Number(singleMatch[1]);
    return { minMinutes: m, maxMinutes: m };
  }
  return null;
}

function wordCount(script) {
  return script.reduce((sum, seg) => sum + (seg.text || "").trim().split(/\s+/).filter(Boolean).length, 0);
}

/**
 * Step 1 of long-form generation: a short, cheap call that plans section
 * titles + a word budget per section, so the target length is decided
 * BEFORE any prose is written, rather than hoped for after the fact.
 */
async function generateOutline({ concept, targetWords }) {
  const sectionCount = Math.max(1, Math.min(6, Math.round(targetWords / 350)));

  const result = await generateStructured({
    systemPrompt: `You are planning the structure of a spoken, single-narrator video script.
Break the concept into ${sectionCount} sequential sections (intro/hook first, closing CTA last).
Distribute a total word budget of about ${targetWords} words across the sections - the sum of
"targetWords" across all sections should be close to ${targetWords}.`,
    userPrompt: `Concept: "${concept}"`,
    schemaHint: `{
  "sections": [
    { "title": "string", "summary": "one sentence on what this section covers", "targetWords": 200 }
  ]
}`,
  });

  if (!Array.isArray(result.sections) || result.sections.length === 0) {
    throw new Error("Model did not return a valid outline");
  }
  return result.sections;
}

/**
 * Step 2: generate ONE section's spoken segments in its own completion.
 * Keeping each call small and bounded is what makes hitting a long total
 * duration reliable with a local model - it never has to produce more than
 * a couple hundred words in a single response.
 */
async function generateSectionSegments({ concept, section, position, total }) {
  const result = await generateStructured({
    systemPrompt: `You are writing one section of a longer spoken, single-narrator video script.
Write natural conversational spoken English, first person, broken into segments of
1-4 sentences each (natural pauses a narrator would take).
${position === 1 ? "This is the opening section - hook the viewer in the first line." : ""}
${position === total ? "This is the FINAL section - end with a clear closing/call-to-action." : ""}
Aim for approximately ${section.targetWords} words total across all segments in this section
(a normal amount of variance is fine - don't pad with filler just to hit the number).`,
    userPrompt: `Overall video concept: "${concept}"
This section's role: "${section.title}" - ${section.summary}`,
    schemaHint: `{ "segments": [ { "type": "avatar", "text": "string" } ] }`,
  });

  if (!Array.isArray(result.segments)) {
    throw new Error(`Model did not return valid segments for section "${section.title}"`);
  }
  return result.segments;
}

/**
 * One expansion pass if the assembled script came in noticeably short of
 * the target - asks for supplementary segments rather than re-writing
 * everything, and inserts them just before the closing section so the
 * hook and CTA aren't disturbed.
 */
async function expandScript({ concept, script, wordsNeeded }) {
  const result = await generateStructured({
    systemPrompt: `You are extending an existing spoken video script that came in shorter than
its target length. Write ${Math.max(wordsNeeded, 60)} additional words of NEW spoken content
that fits naturally in the middle of the script (more examples, more depth, an additional
sub-point) - do not repeat what's already been said, and do not write a new intro or
closing, those already exist.`,
    userPrompt: `Video concept: "${concept}"
Existing script so far:\n${script.map((s) => s.text).join(" ")}`,
    schemaHint: `{ "segments": [ { "type": "avatar", "text": "string" } ] }`,
  });
  if (!Array.isArray(result.segments)) return [];
  return result.segments;
}

/**
 * Full orchestration for an initial, duration-targeted script: outline ->
 * per-section generation -> word-count check -> optional expansion pass.
 * Returns { script, estimatedMinutes, targetMinutes }.
 */
export async function generateLongFormScript({ concept, duration }) {
  const targetMinutes = (duration.minMinutes + duration.maxMinutes) / 2;
  const targetWords = Math.round(targetMinutes * WORDS_PER_MINUTE);

  const outline = await generateOutline({ concept, targetWords });

  let script = [];
  for (let i = 0; i < outline.length; i++) {
    const segments = await generateSectionSegments({
      concept,
      section: outline[i],
      position: i + 1,
      total: outline.length,
    });
    script = script.concat(segments);
  }

  let currentWords = wordCount(script);
  const minAcceptableWords = Math.round(duration.minMinutes * WORDS_PER_MINUTE * 0.85);

  // One expansion pass, max - avoids an unbounded retry loop against a
  // model that just can't hit the target no matter how many times you ask.
  if (currentWords < minAcceptableWords) {
    const closing = script.pop();
    const expansion = await expandScript({
      concept,
      script,
      wordsNeeded: minAcceptableWords - currentWords,
    });
    script = script.concat(expansion);
    if (closing) script.push(closing);
    currentWords = wordCount(script);
  }

  return {
    script,
    estimatedMinutes: +(currentWords / WORDS_PER_MINUTE).toFixed(1),
    targetMinutes,
  };
}

/**
 * Generates or revises a long-form, single-narrator "avatar" script - a flat
 * list of { type: "avatar", text } segments meant to be spoken end-to-end by
 * a talking-head / AI avatar, as opposed to `scenes`, which is short,
 * template-mapped data for the Remotion visual renderer.
 *
 * DESIGN NOTE: for precise, positional edits ("add a point before the
 * second one", "delete point 4", "move the CTA to the end"), asking a small
 * local model to silently retype the ENTIRE array with the edit correctly
 * applied is unreliable - it has to get every index right in one shot with
 * no way to double-check itself. Instead, the model is asked to describe
 * the edit as a small structured "op" (insert/delete/move/replace_segment),
 * and THIS CODE applies that op to the array deterministically. Open-ended
 * requests ("rewrite this in a more casual tone", "make it about pricing
 * instead") still fall back to "full", where the model returns the whole
 * script, since those aren't expressible as a single positional edit.
 */
const SYSTEM_PROMPT = `You are a scriptwriter for long-form, single-narrator talking-head
videos (the kind delivered by one presenter or AI avatar speaking directly to camera).

Output rules:
- Segments are 1-4 sentences each - natural spoken pauses, not one giant paragraph.
- Every segment has "type": "avatar" unless the user's instructions say otherwise.
- Write in first person, conversational spoken English, not written-essay style.

Behavior:
- If there is no current script yet, this is the FIRST message: respond with
  op "full" and write a complete script for the requested topic (hook/intro,
  the substantive content in a logical sequence, then a closing/CTA).
- If the user's instruction is a PRECISE POSITIONAL EDIT against the existing
  script - inserting a new point at a specific spot, deleting a specific
  point, moving one point elsewhere, or rewriting one specific point - respond
  with the matching op below and ONLY that op. Segment numbers the user
  refers to are 1-based; convert them to 0-based indices yourself.
  - {"op": "insert", "beforeIndex": <0-based index to insert before, or
     equal to script length to append at the end>, "segment": {"type":
     "avatar", "text": "..."}}
  - {"op": "delete", "atIndex": <0-based index to remove>}
  - {"op": "move", "fromIndex": <0-based>, "toIndex": <0-based destination
     index in the array AFTER removal>}
  - {"op": "replace_segment", "atIndex": <0-based>, "segment": {"type":
     "avatar", "text": "..."}}
- For anything broader than a single positional edit (tone changes, adding
  a whole new section without a specific position, changing the topic,
  restructuring), respond with {"op": "full", "script": [...]} containing
  the complete revised script.
- Never invent an index you're not confident about from the user's wording -
  if the user doesn't specify a clear position, prefer "full" instead of
  guessing.`;

export async function generateScriptOp({ history, userMessage, currentScript }) {
  const transcript = history
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const userPrompt = `${
    transcript ? `Conversation so far:\n${transcript}\n\n` : ""
  }${
    currentScript?.length
      ? `Current script, 1-based for reference in your reasoning but respond with 0-based indices:\n${currentScript
          .map((s, i) => `${i + 1}. [${s.type}] ${s.text}`)
          .join("\n")}\n\n`
      : "There is no current script yet.\n\n"
  }New user message: "${userMessage}"`;

  const schemaHint = `One of:
{"op": "full", "script": [{"type": "avatar", "text": "string"}]}
{"op": "insert", "beforeIndex": 0, "segment": {"type": "avatar", "text": "string"}}
{"op": "delete", "atIndex": 0}
{"op": "move", "fromIndex": 0, "toIndex": 0}
{"op": "replace_segment", "atIndex": 0, "segment": {"type": "avatar", "text": "string"}}`;

  return generateStructured({ systemPrompt: SYSTEM_PROMPT, userPrompt, schemaHint });
}

/**
 * Applies a model-produced op to the current script array deterministically.
 * Throws on out-of-range indices rather than silently clamping, so a bad
 * index surfaces as a visible error instead of a wrong edit.
 */
export function applyScriptOp(currentScript, op) {
  const script = [...(currentScript || [])];

  switch (op.op) {
    case "full": {
      if (!Array.isArray(op.script)) throw new Error("'full' op missing a script array");
      return op.script;
    }
    case "insert": {
      assertIndexInRange(op.beforeIndex, script.length, "beforeIndex");
      assertSegment(op.segment);
      script.splice(op.beforeIndex, 0, op.segment);
      return script;
    }
    case "delete": {
      assertIndexInRange(op.atIndex, script.length - 1, "atIndex");
      script.splice(op.atIndex, 1);
      return script;
    }
    case "move": {
      assertIndexInRange(op.fromIndex, script.length - 1, "fromIndex");
      const [moved] = script.splice(op.fromIndex, 1);
      assertIndexInRange(op.toIndex, script.length, "toIndex");
      script.splice(op.toIndex, 0, moved);
      return script;
    }
    case "replace_segment": {
      assertIndexInRange(op.atIndex, script.length - 1, "atIndex");
      assertSegment(op.segment);
      script[op.atIndex] = op.segment;
      return script;
    }
    default:
      throw new Error(`Unknown script op: ${op.op}`);
  }
}

function assertIndexInRange(index, max, label) {
  if (typeof index !== "number" || index < 0 || index > max) {
    throw new Error(`Model returned an out-of-range ${label}: ${index}`);
  }
}

function assertSegment(segment) {
  if (!segment || typeof segment.text !== "string" || !segment.text.trim()) {
    throw new Error("Model returned an invalid segment");
  }
  if (!segment.type) segment.type = "avatar";
}
