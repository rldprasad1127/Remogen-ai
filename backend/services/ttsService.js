import User from "../models/User.js";
import { createAllTalkProvider, checkAllTalk } from "./tts/allTalkProvider.js";
import { createColabProvider, checkColab } from "./tts/colabProvider.js";

/**
 * Picks which TTS engine to use for a user, in one place.
 *
 *   mode "local" -> always local AllTalk
 *   mode "colab" -> always the Colab server (clear error if it isn't reachable)
 *   mode "auto"  -> Colab if a Colab URL is configured AND it answers a
 *                   health check right now, otherwise local AllTalk
 *
 * Settings come from the user's saved "Voice engine" settings, falling back
 * to COLAB_TTS_URL / COLAB_TTS_API_KEY / TTS_PROVIDER in .env.
 */

export const ttsSpeed = () => Number(process.env.TTS_SPEED_FACTOR || 0.88);

export async function getEffectiveTtsSettings(userId, overrides = {}) {
  const user = userId ? await User.findById(userId).select("ttsSettings").lean() : null;
  const saved = user?.ttsSettings || {};
  const mode = overrides.mode || saved.mode || process.env.TTS_PROVIDER || "auto";
  return {
    mode: ["auto", "colab", "local"].includes(mode) ? mode : "auto",
    colabUrl: (overrides.colabUrl ?? saved.colabUrl ?? process.env.COLAB_TTS_URL ?? "").trim().replace(/\/+$/, ""),
    colabApiKey: overrides.colabApiKey ?? saved.colabApiKey ?? process.env.COLAB_TTS_API_KEY ?? "",
  };
}

export async function resolveProvider(userId) {
  const { mode, colabUrl, colabApiKey } = await getEffectiveTtsSettings(userId);
  const colab = () => createColabProvider({ url: colabUrl, apiKey: colabApiKey });

  if (mode === "local") return createAllTalkProvider();

  if (mode === "colab") {
    if (!colabUrl) throw new Error("Voice engine is set to Colab but no Colab URL is saved. Open Voice engine settings and paste it.");
    const c = await checkColab({ url: colabUrl, apiKey: colabApiKey });
    if (!c.reachable || !c.ready) throw new Error(c.detail);
    return colab();
  }

  // auto
  if (colabUrl) {
    const c = await checkColab({ url: colabUrl, apiKey: colabApiKey });
    if (c.reachable && c.ready) return colab();
    console.warn(`[tts] Colab not usable (${c.detail}) - falling back to local AllTalk`);
    const local = await checkAllTalk();
    if (!local.reachable) {
      throw new Error(`No voice engine is reachable. Colab: ${c.detail}. Local: ${local.detail}`);
    }
  }
  return createAllTalkProvider();
}

export async function testProviders(userId, overrides = {}) {
  const { mode, colabUrl, colabApiKey } = await getEffectiveTtsSettings(userId, overrides);
  const [colab, local] = await Promise.all([checkColab({ url: colabUrl, apiKey: colabApiKey }), checkAllTalk()]);

  let wouldUse = null;
  const colabOk = colab.reachable && colab.ready;
  if (mode === "local") wouldUse = local.reachable ? "local" : null;
  else if (mode === "colab") wouldUse = colabOk ? "colab" : null;
  else wouldUse = colabOk ? "colab" : local.reachable ? "local" : null;

  return { mode, colab, local, wouldUse };
}
