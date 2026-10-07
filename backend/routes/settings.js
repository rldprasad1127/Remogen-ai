import express from "express";
import { requireAuth } from "../middleware/auth.js";
import User from "../models/User.js";
import { normalizeColabUrl } from "../services/tts/colabProvider.js";
import { testProviders } from "../services/ttsService.js";

const router = express.Router();

// Never send the saved API key back to the browser - only whether one exists.
router.get("/tts", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select("ttsSettings").lean();
  const s = user?.ttsSettings || {};
  res.json({
    mode: s.mode || process.env.TTS_PROVIDER || "auto",
    colabUrl: s.colabUrl || "",
    hasColabKey: Boolean(s.colabApiKey),
    envColabConfigured: Boolean(process.env.COLAB_TTS_URL),
  });
});

router.put("/tts", requireAuth, async (req, res) => {
  try {
    const { mode, colabUrl, colabApiKey } = req.body;
    if (!["auto", "colab", "local"].includes(mode)) {
      return res.status(400).json({ error: "mode must be auto, colab or local" });
    }
    const set = { "ttsSettings.mode": mode };
    if (colabUrl !== undefined) set["ttsSettings.colabUrl"] = normalizeColabUrl(colabUrl);
    // undefined = leave the saved key alone; string (even "") = replace it.
    if (colabApiKey !== undefined) set["ttsSettings.colabApiKey"] = String(colabApiKey).trim();
    await User.updateOne({ _id: req.user.id }, { $set: set });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Checks both engines right now, using unsaved form values if provided, and
// reports which one a production run would use.
router.post("/tts/test", requireAuth, async (req, res) => {
  try {
    const overrides = {};
    if (req.body.mode) overrides.mode = req.body.mode;
    if (req.body.colabUrl !== undefined) overrides.colabUrl = normalizeColabUrl(req.body.colabUrl);
    if (req.body.colabApiKey) overrides.colabApiKey = req.body.colabApiKey;
    res.json(await testProviders(req.user.id, overrides));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
