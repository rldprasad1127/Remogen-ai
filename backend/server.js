// MUST be the first import: ES module imports run before the importing file's
// own body, so calling dotenv.config() further down loaded .env AFTER other
// modules had already read process.env - silently ignoring your settings.
import "dotenv/config";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "./config/db.js";
import { storageRoot } from "./config/paths.js";
import authRoutes from "./routes/auth.js";
import projectRoutes from "./routes/projects.js";
import templateRoutes from "./routes/templates.js";
import settingsRoutes from "./routes/settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Generated media (narration, final video) is fetched by Remotion's headless
// browser from a different origin, and by the audio decoder using Range
// requests, so it needs open CORS. Mounted BEFORE the credentialed CORS below
// so that one doesn't apply to it. Uploaded voice samples stay private.
app.use(
  "/storage",
  cors({ origin: "*", exposedHeaders: ["Content-Range", "Content-Length", "Accept-Ranges"] }),
  (req, res, next) => (/voice-samples/i.test(req.path) ? res.status(404).end() : next()),
  express.static(storageRoot())
);

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/settings", settingsRoutes);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const COLAB_NOTEBOOKS = {
  xtts: "RemoGen_Colab_TTS_XTTS.ipynb",
  dia: "RemoGen_Colab_TTS_Dia.ipynb",
  chattts: "RemoGen_Colab_TTS_ChatTTS.ipynb",
};

app.get("/api/colab-notebook", (req, res) => {
  const engine = String(req.query.engine || "xtts").toLowerCase();
  const filename = COLAB_NOTEBOOKS[engine];
  if (!filename) {
    return res.status(400).json({ error: `Unknown engine "${engine}". Valid options: ${Object.keys(COLAB_NOTEBOOKS).join(", ")}` });
  }
  res.download(path.join(__dirname, "colab", filename), filename);
});

// Generic error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`[server] RemoGen Studio API listening on :${PORT}`));
});
