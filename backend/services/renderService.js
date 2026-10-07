import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { storageRoot, publicBaseUrl } from "../config/paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY_POINT = path.join(__dirname, "..", "remotion", "index.jsx");

// Bundling (webpack) takes a while and its output only depends on the
// composition's source code - scenes/theme go in as inputProps - so do it
// once per server process and reuse it, which also makes retries faster.
let bundlePromise = null;
function getBundle(onBundleProgress) {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: ENTRY_POINT,
      webpackOverride: (config) => config,
      onProgress: (percent) => onBundleProgress(percent / 100),
    }).catch((err) => {
      bundlePromise = null; // don't cache a failure
      throw err;
    });
  }
  return bundlePromise;
}

// Remotion's headless browser can't open filesystem paths or relative URLs
// like /storage/...; it needs a full URL it can fetch from this server.
const absoluteUrl = (url) => (/^https?:\/\//i.test(url) ? url : `${publicBaseUrl()}${url}`);

/**
 * Renders the final MP4 with @remotion/renderer.
 * Hardware safety: concurrency defaults to 1 so a 16GB machine doesn't
 * spawn enough headless Chromium workers to thrash.
 *
 * @param project  Mongoose Project document
 * @param onProgress ({ phase: "bundling" | "rendering", fraction: 0..1 }) => void
 */
export async function renderProjectVideo(project, onProgress = () => {}) {
  const userId = project.userId.toString();
  const projectId = project._id.toString();
  const outDir = path.join(storageRoot(), userId, projectId);
  fs.mkdirSync(outDir, { recursive: true });
  const outputLocation = path.join(outDir, "final.mp4");

  onProgress({ phase: "bundling", fraction: 0 });
  const serveUrl = await getBundle((fraction) => onProgress({ phase: "bundling", fraction }));
  onProgress({ phase: "bundling", fraction: 1 });

  const plain = typeof project.toObject === "function" ? project.toObject() : project;
  const inputProps = {
    theme: plain.theme,
    scenes: (plain.scenes || []).map((s) => ({ ...s, audioUrl: s.audioUrl ? absoluteUrl(s.audioUrl) : null })),
  };

  const composition = await selectComposition({ serveUrl, id: "RemoGenMain", inputProps });

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation,
    inputProps,
    concurrency: Number(process.env.RENDER_CONCURRENCY || 1), // 1 or 2 per the hardware-safety requirement
    logLevel: "warn",
    onProgress: ({ progress }) => onProgress({ phase: "rendering", fraction: progress }),
  });

  return { videoOutputPath: outputLocation, publicUrl: `/storage/${userId}/${projectId}/final.mp4` };
}
