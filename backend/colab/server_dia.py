"""
RemoGen Studio - Dia (Nari Labs) voice server for Google Colab.
See rg_common.py for the shared HTTP contract all three engine servers share.

Dia is a 1.6B, Apache-2.0-licensed dialogue TTS model. Two things make it
worth a separate engine choice over XTTS: it accepts non-verbal tags like
(laughs), (sighs), (coughs) written directly in the script text, and it
supports genuine voice cloning via an audio prompt.

Dia's cloning is more involved than XTTS's: it needs the ACTUAL TRANSCRIPT
of the reference clip alongside the audio (not just the audio alone), and
it generates the reference clip's audio again as part of its output before
continuing into the new text - so the output has to be trimmed by the
reference clip's own duration to get just the new narration. This file
handles both automatically: faster-whisper transcribes your uploaded
sample once at upload time, and the reference clip's length is trimmed
off every generation.

Caveat worth knowing: the exact trim-and-continue behaviour described above
matches how this class of audio-prompted continuation model is documented
to work, but this project's author (an AI assistant) could not verify it
against a real GPU. If a cloned voice's audio sounds like it's missing its
first second or two, or has an extra second of the reference clip at the
start, that's the first thing to adjust - see the TRIM logic below.
"""
import json
import os
import threading
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from rg_common import (
    FAKE, VOICE_DIR, require_key, voice_path, save_uploaded_voice,
    wav_duration_seconds, apply_speed, fake_wav_bytes,
)

MODEL_CHECKPOINT = "nari-labs/Dia-1.6B-0626"
NON_VERBAL_TAGS = (
    "(laughs), (clears throat), (sighs), (gasps), (coughs), (singing), (sings), "
    "(mumbles), (beep), (groans), (sniffs), (claps), (screams), (inhales), (exhales), "
    "(applause), (burps), (humming), (sneezes), (chuckle), (whistles)"
)

state = {"model": None, "whisper": None, "device": "cpu", "gpu": None, "error": None}
synth_lock = threading.Lock()
# voice_id -> {"wav": path, "transcript": "[S1] ..."} - Dia's cloning needs
# both the audio AND its exact transcript, unlike XTTS's audio-only cloning.
voice_transcripts = {}


def load_model():
    try:
        if FAKE:
            state.update(device="fake", gpu="none (fake mode)", model="fake")
            return
        import torch
        from dia.model import Dia

        device = "cuda" if torch.cuda.is_available() else "cpu"
        state["device"] = device
        state["gpu"] = torch.cuda.get_device_name(0) if device == "cuda" else None
        state["model"] = Dia.from_pretrained(MODEL_CHECKPOINT, compute_dtype="float16" if device == "cuda" else "float32")

        # A small Whisper model just to transcribe short (5-10s) reference
        # clips for cloning - not used for the actual narration at all.
        from faster_whisper import WhisperModel
        state["whisper"] = WhisperModel("small.en", device=device, compute_type="float16" if device == "cuda" else "int8")
    except Exception as exc:
        state["error"] = f"{type(exc).__name__}: {exc}"
        raise


@asynccontextmanager
async def lifespan(_app):
    threading.Thread(target=load_model, daemon=True).start()
    yield


app = FastAPI(title="RemoGen Colab TTS - Dia", lifespan=lifespan)

# Persist transcripts across restarts within the same Colab session (state
# dict alone would lose them if this module got reloaded).
TRANSCRIPT_STORE = os.path.join(VOICE_DIR, "dia_transcripts.json")
if os.path.exists(TRANSCRIPT_STORE):
    try:
        voice_transcripts.update(json.load(open(TRANSCRIPT_STORE)))
    except Exception:
        pass


def save_transcripts():
    json.dump(voice_transcripts, open(TRANSCRIPT_STORE, "w"))


@app.get("/health", dependencies=[Depends(require_key)])
def health():
    if state["error"]:
        return JSONResponse(status_code=500, content={"status": "error", "detail": state["error"]})
    return {
        "status": "ok" if (state["model"] is not None or FAKE) else "loading",
        "model": "dia-1.6b" if not FAKE else "fake",
        "device": state["device"],
        "gpu": state["gpu"],
    }


@app.post("/voices", dependencies=[Depends(require_key)])
async def upload_voice(file: UploadFile = File(...)):
    data = await file.read()
    voice_id = save_uploaded_voice(data, file.filename)
    wav = voice_path(voice_id)

    if FAKE:
        voice_transcripts[voice_id] = "[S1] This is a fake transcript for testing."
    elif voice_id not in voice_transcripts:
        if state["whisper"] is None:
            raise HTTPException(status_code=503, detail="Model is still loading - try again shortly")
        segments, _ = state["whisper"].transcribe(wav, language="en")
        transcript = " ".join(seg.text.strip() for seg in segments).strip()
        if not transcript:
            raise HTTPException(status_code=422, detail="Could not transcribe the reference clip - try a clearer sample")
        # Dia requires every input to open with a speaker tag, and treats
        # this transcript as one continuous [S1] turn.
        voice_transcripts[voice_id] = f"[S1] {transcript}"

    save_transcripts()
    return {"voice_id": voice_id}


class TTSRequest(BaseModel):
    text: str
    language: str = "en"
    speed: float = 1.0
    voice_id: Optional[str] = None


@app.post("/tts", dependencies=[Depends(require_key)])
def synthesize(req: TTSRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is empty")
    if state["error"]:
        raise HTTPException(status_code=500, detail=state["error"])
    if state["model"] is None and not FAKE:
        raise HTTPException(status_code=503, detail="Model is still loading")

    # Single-narrator use: always speaker 1. (laughs)-style tags are just
    # part of the scene text already, written in by the scriptwriter/user -
    # Dia recognises them inline, nothing extra to do here for that part.
    generation_text = f"[S1] {text}"

    audio_prompt = None
    trim_seconds = 0.0
    if req.voice_id:
        audio_prompt = voice_path(req.voice_id)
        if not audio_prompt:
            raise HTTPException(status_code=404, detail="Unknown voice_id - upload the voice sample again")
        transcript = voice_transcripts.get(req.voice_id)
        if not transcript:
            raise HTTPException(status_code=422, detail="No transcript stored for this voice - re-upload the sample")
        generation_text = f"{transcript} {generation_text}"
        trim_seconds = wav_duration_seconds(audio_prompt)

    raw_path = os.path.join(VOICE_DIR, f"dia_raw_{threading.get_ident()}_{os.getpid()}.wav")
    final_path = os.path.join(VOICE_DIR, f"dia_out_{threading.get_ident()}_{os.getpid()}.wav")

    if FAKE:
        with open(raw_path, "wb") as fh:
            fh.write(fake_wav_bytes(text))
    else:
        with synth_lock:
            kwargs = {"use_torch_compile": False, "verbose": False}
            if audio_prompt:
                kwargs["audio_prompt"] = audio_prompt
            output = state["model"].generate(generation_text, **kwargs)
            state["model"].save_audio(raw_path, output)

        if trim_seconds > 0:
            _trim_wav_start(raw_path, trim_seconds)

    apply_speed(raw_path, final_path, req.speed)
    with open(final_path, "rb") as fh:
        audio = fh.read()
    for p in (raw_path, final_path):
        if os.path.exists(p):
            os.remove(p)
    return Response(content=audio, media_type="audio/wav")


def _trim_wav_start(path: str, seconds: float):
    """Cuts the first `seconds` off a WAV in place - removes the replayed
    reference clip from a cloned generation's output. See the module
    docstring's caveat about this specific behaviour being unverified."""
    import wave as wave_mod

    with wave_mod.open(path, "rb") as r:
        params = r.getparams()
        frames_to_skip = min(int(seconds * params.framerate), r.getnframes())
        r.readframes(frames_to_skip)
        remaining = r.readframes(r.getnframes() - frames_to_skip)

    with wave_mod.open(path, "wb") as w:
        w.setparams(params)
        w.writeframes(remaining)
