import mongoose from "mongoose";

const ThemeSchema = new mongoose.Schema(
  {
    name: { type: String, default: "minimal_light" },
    primaryColor: { type: String, default: "#2563EB" },
    backgroundColor: { type: String, default: "#F8FAFC" },
    fontFamily: { type: String, default: "Inter, sans-serif" },
    borderRadius: { type: Number, default: 12 },
  },
  { _id: false }
);

const PlanSchema = new mongoose.Schema(
  {
    hook: String,
    keyPoints: [String],
    cta: String,
  },
  { _id: false }
);

const SceneSchema = new mongoose.Schema(
  {
    sceneIndex: Number,
    templateType: String,
    dialogue: String,
    props: { type: mongoose.Schema.Types.Mixed, default: {} },
    durationInFrames: Number,
    // Per-scene narration. Each scene owns its clip so picture and voice stay
    // in sync however long the video is; audioText lets a retry skip scenes
    // whose narration is already generated and still matches the dialogue.
    audioUrl: String,
    audioDurationInSeconds: Number,
    audioText: String,
  },
  { _id: false }
);

const VoiceSettingsSchema = new mongoose.Schema(
  {
    voiceSamplePath: String,
    audioUrl: String,
    durationInSeconds: Number,
    provider: String, // which engine generated the narration: "colab" | "local"
  },
  { _id: false }
);

const ProjectSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  title: { type: String, required: true },
  status: {
    type: String,
    enum: [
      "draft",
      "planning",
      "plan_approved",
      "scripting",
      "script_approved",
      "generating_audio",
      "rendering_video",
      "completed",
      "failed",
    ],
    default: "draft",
  },
  conceptPrompt: String,
  theme: { type: ThemeSchema, default: () => ({}) },
  plan: { type: PlanSchema, default: () => ({}) },
  scenes: { type: [SceneSchema], default: [] },
  // Chat-driven, template-agnostic monologue script (avatar/talking-head style),
  // separate from `scenes` which is what the Remotion renderer consumes.
  avatarScript: {
    type: [
      new mongoose.Schema(
        { type: { type: String, default: "avatar" }, text: String },
        { _id: false }
      ),
    ],
    default: [],
  },
  scriptChatHistory: {
    type: [
      new mongoose.Schema(
        {
          role: { type: String, enum: ["user", "assistant"] },
          content: String,
          at: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
    ],
    default: [],
  },
  voiceSettings: { type: VoiceSettingsSchema, default: () => ({}) },
  renderedVideoUrl: String,
  errorMessage: String,
  failedAtStep: { type: String, enum: ["voice", "render", null], default: null },
  progressPercent: { type: Number, default: 0 },
  progressPhase: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ProjectSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model("Project", ProjectSchema);
