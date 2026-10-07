import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(__dirname, "..");

// Functions, not constants, so they read process.env when CALLED rather than
// when this module is first imported - .env is guaranteed loaded by then.
// Always absolute, so it doesn't matter which directory node was started in.
export function storageRoot() {
  return path.resolve(BACKEND_ROOT, process.env.STORAGE_ROOT || "public/storage");
}

// URL that the headless Chromium inside Remotion's renderer can use to reach
// this server (it can't open filesystem paths, only URLs).
export function publicBaseUrl() {
  return (process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/+$/, "");
}
