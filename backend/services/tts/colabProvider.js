import fs from "fs";
import path from "path";
import { fetchWithRetry, networkCode } from "./http.js";

// Client for colab/server.py (the XTTS-v2 server you run in Google Colab).
//   GET  /health                  -> { status: "ok" | "loading", model, device, gpu }
//   POST /voices  (multipart)     -> { voice_id }     upload the reference sample ONCE
//   POST /tts     (json)          -> audio/wav        { text, language, speed, voice_id }
// Every call carries X-API-Key. Unlike AllTalk, the reference voice is
// uploaded over HTTP, so cloning needs no shared filesystem.

export function normalizeColabUrl(input) {
  const value = String(input || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  if (!/^https?:\/\/[^\s]+$/i.test(value)) {
    throw new Error("Colab URL must start with http:// or https:// (e.g. https://something.trycloudflare.com)");
  }
  return value;
}

const authHeaders = (apiKey) => ({
  "X-API-Key": apiKey || "",
  // ngrok's free tier injects an HTML warning page unless this is present.
  "ngrok-skip-browser-warning": "1",
});

function explainStatus(status, body = "") {
  const snippet = String(body).slice(0, 300);
  if (status === 401) return "Colab rejected the API key. Copy the key printed by the notebook into Voice engine settings.";
  if ([502, 504, 524, 530].includes(status) || /1033|tunnel/i.test(snippet)) {
    return "The Colab tunnel is down - the notebook has probably stopped or restarted. Re-run it and paste the NEW URL and key into Voice engine settings.";
  }
  if (status === 503) return "The Colab TTS model is still loading or busy. Wait a minute and retry.";
  return `Colab TTS error HTTP ${status}${snippet ? `: ${snippet}` : ""}`;
}

export async function checkColab({ url, apiKey }) {
  if (!url) return { configured: false, reachable: false, ready: false, detail: "No Colab URL set" };
  try {
    const res = await fetch(`${url}/health`, { headers: authHeaders(apiKey), signal: AbortSignal.timeout(7000) });
    if (res.status === 401) return { configured: true, reachable: false, ready: false, authFailed: true, detail: explainStatus(401) };
    if (!res.ok) return { configured: true, reachable: false, ready: false, detail: explainStatus(res.status, await res.text().catch(() => "")) };
    const info = await res.json().catch(() => ({}));
    const ready = info.status === "ok";
    return {
      configured: true,
      reachable: true,
      ready,
      detail: ready
        ? `Connected - ${info.model || "TTS model"} on ${info.gpu || info.device || "unknown device"}`
        : "Connected, but the model is still loading",
      device: info.device,
    };
  } catch (err) {
    return { configured: true, reachable: false, ready: false, detail: `Cannot reach Colab: ${networkCode(err) || err.message}` };
  }
}

async function waitUntilReady({ url, apiKey }, timeoutMs = 180000) {
  const started = Date.now();
  for (;;) {
    const check = await checkColab({ url, apiKey });
    if (check.ready) return;
    if (check.authFailed || !check.reachable) throw new Error(check.detail);
    if (Date.now() - started > timeoutMs) throw new Error("Colab TTS model didn't finish loading in time");
    await new Promise((r) => setTimeout(r, 4000));
  }
}

async function uploadVoice({ url, apiKey }, voiceSamplePath) {
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(voiceSamplePath)]), path.basename(voiceSamplePath));
  const res = await fetchWithRetry(`${url}/voices`, { method: "POST", headers: authHeaders(apiKey), body: form }, { retries: 2, timeoutMs: 120000 });
  if (!res.ok) throw new Error(explainStatus(res.status, await res.text().catch(() => "")));
  const { voice_id } = await res.json();
  if (!voice_id) throw new Error("Colab didn't return a voice id for the uploaded sample");
  return voice_id;
}

export function createColabProvider({ url, apiKey }) {
  const conn = { url, apiKey };
  return {
    name: "colab",
    label: "Google Colab",

    async prepare({ voiceSamplePath }) {
      await waitUntilReady(conn);
      const hasSample = voiceSamplePath && fs.existsSync(voiceSamplePath);
      return { voiceSamplePath: hasSample ? voiceSamplePath : null, voiceId: hasSample ? await uploadVoice(conn, voiceSamplePath) : null };
    },

    async synthesize(ctx, text, { speed }) {
      const send = () =>
        fetchWithRetry(
          `${url}/tts`,
          {
            method: "POST",
            headers: { ...authHeaders(apiKey), "Content-Type": "application/json" },
            body: JSON.stringify({ text, language: process.env.TTS_LANGUAGE || "en", speed, voice_id: ctx.voiceId }),
          },
          { retries: 2, timeoutMs: 240000 }
        );

      let res;
      try {
        res = await send();
        // Colab restarted mid-run and forgot the uploaded voice: re-upload once.
        if (res.status === 404 && ctx.voiceId && ctx.voiceSamplePath) {
          ctx.voiceId = await uploadVoice(conn, ctx.voiceSamplePath);
          res = await send();
        }
      } catch (err) {
        throw new Error(
          `Lost connection to Colab (${networkCode(err) || err.message}). If the notebook stopped, re-run it and update the URL in Voice engine settings.`
        );
      }
      if (!res.ok) throw new Error(explainStatus(res.status, await res.text().catch(() => "")));
      return Buffer.from(await res.arrayBuffer());
    },
  };
}
