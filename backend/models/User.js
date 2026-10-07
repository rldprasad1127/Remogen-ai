import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  // Which text-to-speech engine to use. No defaults on purpose: unset means
  // "fall back to .env", see services/ttsService.js.
  ttsSettings: {
    mode: { type: String, enum: ["auto", "colab", "local"] },
    colabUrl: String,
    colabApiKey: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("User", UserSchema);
