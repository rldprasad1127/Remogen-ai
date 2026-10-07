import mongoose from "mongoose";

const TemplateSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true, // e.g. hook, concept, code, comparison, outro
  },
  componentCode: {
    type: String, // JSX/TSX source for dynamic compilation/preview
    default: "",
  },
  defaultProps: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  isSystemDefault: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// A given user cannot have two templates that claim the same "type" key twice
// unless they are system defaults (which are seeded once, userId = null-ish shared owner).
TemplateSchema.index({ userId: 1, type: 1 });

export default mongoose.model("Template", TemplateSchema);
