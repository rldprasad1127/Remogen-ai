import express from "express";
import { requireAuth } from "../middleware/auth.js";
import Template from "../models/Template.js";
import { generateTemplateFromPrompt } from "../services/templateGenerator.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const templates = await Template.find({
    $or: [{ userId: req.user.id }, { isSystemDefault: true }],
  }).sort({ isSystemDefault: -1, createdAt: -1 });
  res.json({ templates });
});

router.post("/generate", requireAuth, async (req, res) => {
  try {
    const { name, type, description } = req.body;
    if (!name || !type || !description) {
      return res.status(400).json({ error: "name, type and description are required" });
    }
    const template = await generateTemplateFromPrompt({
      userId: req.user.id,
      name,
      type,
      description,
    });
    res.status(201).json({ template });
  } catch (err) {
    res.status(500).json({ error: "Template generation failed", details: err.message });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  await Template.deleteOne({ _id: req.params.id, userId: req.user.id, isSystemDefault: false });
  res.status(204).end();
});

export default router;
