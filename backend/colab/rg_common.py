"""
Shared plumbing for RemoGen's Colab TTS servers (server_xtts.py, server_dia.py,
server_chattts.py). All three expose the SAME contract:
  GET  /health   -> {"status": "ok" | "loading", "model", "device", "gpu"}
  POST /voices   -> multipart "file" -> {"voice_id": "..."}
  POST /tts      -> JSON {"text", "language", "speed", "voice_id"} -> audio/wav
so the Node backend (services/tts/colabProvider.js) never needs to know or
care which model is actually running - only this file's contents differ.
"""
import glob
import hashlib
import hmac
import io
import math
import os
import struct
import subprocess
import wave
from typing import Optional

from fastapi import Header, HTTPException

API_KEY = os.environ.get("RG_API_KEY", "")
FAKE = os.environ.get("RG_FAKE_TTS") == "1"
VOICE_DIR = os.environ.get("RG_VOICE_DIR", "/tmp/rg_voices")
os.makedirs(VOICE_DIR, exist_ok=True)


def require_key(x_api_key: str = Header(default="")):
    if API_KEY and not hmac.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")


def voice_path(voice_id: str) -> Optional[str]:
    """Resolves a voice_id to its uploaded file, refusing anything that isn't
    a plain hex id - blocks path-traversal tricks like "../../etc/passwd"."""
    if not voice_id or not voice_id.isalnum():
        return None
    matches = glob.glob(os.path.join(VOICE_DIR, f"{voice_id}.*"))
    return matches[0] if matches else None


def save_uploaded_voice(data: bytes, original_filename: str) -> str:
    """Saves an uploaded reference sample, deduped by content hash so
    re-uploading the same file is free, and normalises it to mono 22.05kHz
    (what these models expect) when ffmpeg is available."""
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Reference audio is over 50 MB")

    voice_id = hashlib.sha1(data).hexdigest()[:16]
    ext = os.path.splitext(original_filename or "")[1].lower() or ".wav"
    raw_path = os.path.join(VOICE_DIR, f"{voice_id}{ext}")
    with open(raw_path, "wb") as fh:
        fh.write(data)

    wav_path = os.path.join(VOICE_DIR, f"{voice_id}.wav")
    if raw_path != wav_path:
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", raw_path, "-ac", "1", "-ar", "22050", wav_path],
                check=True, timeout=120,
            )
            os.remove(raw_path)
        except Exception:
            pass  # keep the original file; most loaders can read it directly
    return voice_id


def wav_duration_seconds(path: str) -> float:
    with wave.open(path, "rb") as w:
        return w.getnframes() / w.getframerate()


def apply_speed(input_path: str, output_path: str, speed: float):
    """Re-times narration with ffmpeg's atempo filter. Used uniformly across
    all three engines rather than each model's own (inconsistent, sometimes
    absent) speed control, so behaviour matches what services/tts/http.js's
    caller expects regardless of which Colab engine is running."""
    speed = max(0.5, min(2.0, float(speed or 1.0)))
    if abs(speed - 1.0) < 0.01:
        if input_path != output_path:
            os.replace(input_path, output_path)
        return
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", input_path, "-filter:a", f"atempo={speed}", output_path],
        check=True, timeout=120,
    )


def fake_wav_bytes(text: str) -> bytes:
    """A short sine-wave tone standing in for real audio, so the HTTP
    plumbing (auth, upload, download) can be tested without a GPU or any of
    these (large) models actually installed. Set RG_FAKE_TTS=1 to use this."""
    seconds = max(0.6, 0.4 * len(text.split()))
    rate = 24000
    frames = b"".join(
        struct.pack("<h", int(6000 * math.sin(2 * math.pi * 220 * i / rate))) for i in range(int(seconds * rate))
    )
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(frames)
    return buf.getvalue()
