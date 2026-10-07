import fetch from "node-fetch";

const BASE_URL = process.env.OLLAMA_BASE_URL || "https://ollama.com";
const MODEL = process.env.OLLAMA_MODEL || "gemma4:31b";

/**
 * Calls the local Ollama server for a structured JSON response.
 * `schemaHint` is a plain-English description of the exact JSON shape
 * the model must return - Ollama's `format: "json"` mode enforces valid JSON,
 * the schema hint keeps the *shape* consistent since Ollama has no native
 * JSON-schema constraint like OpenAI function calling.
 */
export async function generateStructured({ systemPrompt, userPrompt, schemaHint }) {
  const fullPrompt = `${userPrompt}\n\nRespond ONLY with valid JSON matching this shape, no prose, no markdown fences:\n${schemaHint}`;

  const token = process.env.CLOUD_API_KEY; // Retrieve this from your environment variables or auth state

  const res = await fetch(`${BASE_URL}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      model: MODEL,
      system: systemPrompt,
      prompt: fullPrompt,
      format: "json",
      stream: false,
      options: { temperature: 0.7 },
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const raw = (data.response || "").trim();

  try {
    return JSON.parse(raw);
  } catch (err) {
    // Model occasionally wraps JSON in fences despite instructions - strip and retry once.
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  }
}

/**
 * Hardware safety: force Ollama to unload the model from RAM/VRAM immediately.
 * Call this right after planning and script generation are done, since the
 * TTS engine and Remotion renderer both need headroom on a 16GB machine.
 */
export async function unloadModel() {
  try {
    await fetch(`${BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, keep_alive: 0 }),
    });
    console.log(`[ollama] unloaded ${MODEL} from memory`);
  } catch (err) {
    console.warn("[ollama] failed to unload model:", err.message);
  }
}
