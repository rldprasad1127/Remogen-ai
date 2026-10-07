import fs from "fs";
import path from "path";
import { fetchWithRetry, networkCode } from "./http.js";

// Local AllTalk. Contract verified against AllTalk's "Standard TTS Generation
// API" docs: form-urlencoded POST, voice referenced BY FILENAME (it must
// already be in AllTalk's voices/ folder), JSON reply containing a URL to
// download the audio from.

const baseUrl = () => (process.env.TTS_BASE_URL || "http://localhost:7851").replace(/\/+$/, "");

export async function checkAllTalk() {
  const url = baseUrl();
  try {
    const res = await fetch(`${url}/api/voices`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { reachable: false, detail: `AllTalk answered HTTP ${res.status}`, url };
    const data = await res.json().catch(() => null);
    const count = Array.isArray(data?.voices) ? data.voices.length : null;
    return { reachable: true, url, detail: count != null ? `AllTalk is running (${count} voices)` : "AllTalk is running" };
  } catch (err) {
    return {
      reachable: false,
      url,
      detail: networkCode(err) === "ECONNREFUSED" ? `Nothing is listening at ${url} - is AllTalk started?` : err.message,
    };
  }
}

async function resolveCharacterVoice({ voiceSamplePath, userId, projectId }) {
  const defaultVoice = process.env.ALLTALK_DEFAULT_VOICE || "female_01.wav";
  const voicesDir = process.env.ALLTALK_VOICES_DIR || null;

  if (!voiceSamplePath || !fs.existsSync(voiceSamplePath)) return defaultVoice;
  if (!voicesDir) {
    console.warn(
      "[tts:local] A reference voice was uploaded but ALLTALK_VOICES_DIR isn't set, so it can't be " +
      "copied into AllTalk for cloning. Using the default voice. Set ALLTALK_VOICES_DIR in .env to clone."
    );
    return defaultVoice;
  }

  const filename = `remogen_${userId}_${projectId}.wav`;
  fs.copyFileSync(voiceSamplePath, path.join(voicesDir, filename));
  try {
    await fetch(`${baseUrl()}/api/reload_config`, { signal: AbortSignal.timeout(8000) });
  } catch (err) {
    console.warn(`[tts:local] Could not ask AllTalk to rescan voices: ${err.message}`);
  }
  return filename;
}

export function createAllTalkProvider() {
  const url = baseUrl();
  return {
    name: "local",
    label: "Local AllTalk",

    async prepare({ voiceSamplePath, userId, projectId }) {
      return { characterVoice: await resolveCharacterVoice({ voiceSamplePath, userId, projectId }), projectId };
    },

    async synthesize(ctx, text, { speed, index }) {
      // Base parameters
      const params = new URLSearchParams({
        text_input: text,
        text_filtering: "standard",
        character_voice_gen: ctx.characterVoice,
        narrator_enabled: "false",
        text_not_inside: "character",
        language: process.env.TTS_LANGUAGE || "en",
        output_file_name: `${ctx.projectId}_s${index}`,
        output_file_timestamp: "true",
        autoplay: "false",
        autoplay_volume: "0.8", // <--- ADD THIS LINE
        narrator_voice_gen: ctx.characterVoice,
      });

      // Only attach speed if it is actually provided.
      if (speed !== undefined && speed !== null) {
        const boundedSpeed = Math.min(Math.max(Number(speed), 0.25), 2.0);
        params.append("speed", String(boundedSpeed));
      }

      let res;
      try {
        res = await fetchWithRetry(
          `${url}/api/tts-generate`,
          { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params },
          { retries: 1, timeoutMs: 300000 }
        );
      } catch (err) {
        if (networkCode(err) === "ECONNREFUSED") {
          throw new Error(`Could not reach the local TTS server at ${url}. Is AllTalk running?`);
        }
        throw err;
      }

      // Better error handling to expose FastAPI's validation complaints
      if (!res.ok) {
        let errorDetail = "";
        try {
          const errBody = await res.json();
          errorDetail = errBody.detail ? JSON.stringify(errBody.detail) : JSON.stringify(errBody);
        } catch {
          errorDetail = await res.text();
        }
        throw new Error(`AllTalk request failed: HTTP ${res.status} ${res.statusText} - ${errorDetail}`);
      }

      const result = await res.json();
      if (result.status !== "generate-success") {
        throw new Error(
          `AllTalk reported a generation failure. Check "${ctx.characterVoice}" exists in AllTalk (GET ${url}/api/voices lists them).`
        );
      }

      const fileUrl = result.output_file_url || result.output_cache_url;
      if (!fileUrl) throw new Error("AllTalk didn't say where the generated audio is");

      // Fix: Check if AllTalk returned an absolute URL or a relative path
      const downloadUrl = fileUrl.startsWith("http") ? fileUrl : `${url}${fileUrl}`;

      // The reply describes the file; the audio itself is a second request.
      const audioRes = await fetchWithRetry(downloadUrl, {}, { retries: 1, timeoutMs: 120000 });
      if (!audioRes.ok) throw new Error(`Could not download generated audio from AllTalk: HTTP ${audioRes.status}`);
      return Buffer.from(await audioRes.arrayBuffer());
    },
  };
}

// export function createAllTalkProvider() {
//   const url = baseUrl();
//   return {
//     name: "local",
//     label: "Local AllTalk",

//     async prepare({ voiceSamplePath, userId, projectId }) {
//       return { characterVoice: await resolveCharacterVoice({ voiceSamplePath, userId, projectId }), projectId };
//     },

//     async synthesize(ctx, text, { speed, index }) {
//       const params = new URLSearchParams({
//         text_input: text,
//         text_filtering: "standard",
//         character_voice_gen: ctx.characterVoice,
//         narrator_enabled: "false",
//         text_not_inside: "character",
//         language: process.env.TTS_LANGUAGE || "en",
//         output_file_name: `${ctx.projectId}_s${index}`,
//         output_file_timestamp: "true",
//         autoplay: "false",
//         speed: String(speed),
//         narrator_voice_gen: ctx.characterVoice,
//       });

//       let res;
//       try {
//         res = await fetchWithRetry(
//           `${url}/api/tts-generate`,
//           { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params },
//           { retries: 1, timeoutMs: 300000 }
//         );
//       } catch (err) {
//         if (networkCode(err) === "ECONNREFUSED") {
//           throw new Error(`Could not reach the local TTS server at ${url}. Is AllTalk running?`);
//         }
//         throw err;
//       }
//       if (!res.ok) throw new Error(`AllTalk request failed: HTTP ${res.status} ${res.statusText}`);

//       const result = await res.json();
//       if (result.status !== "generate-success") {
//         throw new Error(
//           `AllTalk reported a generation failure. Check "${ctx.characterVoice}" exists in AllTalk (GET ${url}/api/voices lists them).`
//         );
//       }
//       const fileUrl = result.output_file_url || result.output_cache_url;
//       if (!fileUrl) throw new Error("AllTalk didn't say where the generated audio is");

//       // The reply describes the file; the audio itself is a second request.
//       const audioRes = await fetchWithRetry(`${url}${fileUrl}`, {}, { retries: 1, timeoutMs: 120000 });
//       if (!audioRes.ok) throw new Error(`Could not download generated audio from AllTalk: HTTP ${audioRes.status}`);
//       return Buffer.from(await audioRes.arrayBuffer());
//     },
//   };
// }
