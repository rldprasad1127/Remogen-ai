/**
 * Seeds the five system-default templates referenced throughout the spec
 * (HookScene, ConceptCard, CodeWindow, ComparisonScene, OutroScene) so a
 * fresh install has a usable template catalog before any AI-generated
 * templates are added. Run with: node seed.js
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "./config/db.js";
import Template from "./models/Template.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULTS = [
  { name: "Hook Scene", type: "hook", file: "HookScene.jsx", defaultProps: { title: "Wait, this changes everything", subtitle: "" } },
  { name: "Concept Card", type: "concept", file: "ConceptCard.jsx", defaultProps: { title: "Key Idea", points: ["Point one", "Point two", "Point three"] } },
  { name: "Code Terminal", type: "code", file: "CodeWindow.jsx", defaultProps: { title: "terminal", codeSnippet: "npm install remogen-studio" } },
  { name: "Split Comparison", type: "comparison", file: "ComparisonScene.jsx", defaultProps: { leftLabel: "Before", leftItems: ["Slow"], rightLabel: "After", rightItems: ["Fast"] } },
  { name: "Outro Scene", type: "outro", file: "OutroScene.jsx", defaultProps: { cta: "Follow for more", handle: "@yourhandle" } },
];

async function main() {
  await connectDB();

  for (const def of DEFAULTS) {
    const componentCode = fs.readFileSync(
      path.join(__dirname, "remotion", "scenes", def.file),
      "utf-8"
    );
    await Template.findOneAndUpdate(
      { type: def.type, isSystemDefault: true },
      {
        name: def.name,
        type: def.type,
        componentCode,
        defaultProps: def.defaultProps,
        isSystemDefault: true,
      },
      { upsert: true, new: true }
    );
    console.log(`[seed] upserted system template: ${def.name}`);
  }

  console.log("[seed] done");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
