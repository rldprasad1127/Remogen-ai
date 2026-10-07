"""
RemoGen Studio - XTTS-v2 voice-cloning server (runs in Google Colab).
See rg_common.py for the shared HTTP contract all three engine servers share.

XTTS-v2 does genuine zero-shot cloning from your uploaded reference sample
(no transcript needed) and has its own native speed control, so this is the
simplest of the three servers.
"""
import os
import threading

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from typing import Optional
from contextlib import asynccontextmanager

from rg_common import API_KEY, FAKE, VOICE_DIR, require_key, voice_path, save_uploaded_voice, fake_wav_bytes

MODEL_NAME = "tts_models/multilingual/multi-dataset/xtts_v2"
state = {"tts": None, "device": "cpu", "gpu": None, "default_speaker": None, "error": None}
synth_lock = threading.Lock()  # one synthesis at a time; the GPU is the bottleneck anyway


def load_model():
    try:
        if FAKE:
            state.update(device="fake", gpu="none (fake mode)")
            state["tts"] = "fake"
            return
        os.environ.setdefault("COQUI_TOS_AGREED", "1")  # Coqui Public Model License (non-commercial)
        import torch
        from TTS.api import TTS

        device = "cuda" if torch.cuda.is_available() else "cpu"
        state["device"] = device
        state["gpu"] = torch.cuda.get_device_name(0) if device == "cuda" else None
        tts = TTS(MODEL_NAME).to(device)
        speakers = list(getattr(tts, "speakers", None) or [])
        state["default_speaker"] = os.environ.get("DEFAULT_SPEAKER") or (speakers[0] if speakers else None)
        state["tts"] = tts
    except Exception as exc:  # surfaced through /health so it isn't a silent hang
        state["error"] = f"{type(exc).__name__}: {exc}"
        raise


@asynccontextmanager
async def lifespan(_app):
    threading.Thread(target=load_model, daemon=True).start()
    yield


app = FastAPI(title="RemoGen Colab TTS - XTTS-v2", lifespan=lifespan)


@app.get("/health", dependencies=[Depends(require_key)])
def health():
    if state["error"]:
        return JSONResponse(status_code=500, content={"status": "error", "detail": state["error"]})
    return {
        "status": "ok" if state["tts"] is not None else "loading",
        "model": "xtts_v2" if not FAKE else "fake",
        "device": state["device"],
        "gpu": state["gpu"],
    }


@app.post("/voices", dependencies=[Depends(require_key)])
async def upload_voice(file: UploadFile = File(...)):
    return {"voice_id": save_uploaded_voice(await file.read(), file.filename)}


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
    if state["tts"] is None:
        raise HTTPException(status_code=503, detail="Model is still loading")

    speaker_wav = None
    if req.voice_id:
        speaker_wav = voice_path(req.voice_id)
        if not speaker_wav:
            raise HTTPException(status_code=404, detail="Unknown voice_id - upload the voice sample again")

    if FAKE:
        return Response(content=fake_wav_bytes(text), media_type="audio/wav")

    out_path = os.path.join(VOICE_DIR, f"out_{threading.get_ident()}_{os.getpid()}.wav")
    with synth_lock:
        tts = state["tts"]
        kwargs = dict(text=text, file_path=out_path, language=req.language, split_sentences=True)
        if speaker_wav:
            kwargs["speaker_wav"] = speaker_wav
        else:
            kwargs["speaker"] = state["default_speaker"]
        try:
            tts.tts_to_file(speed=req.speed, **kwargs)
        except TypeError:
            tts.tts_to_file(**kwargs)  # older builds without a speed argument
    with open(out_path, "rb") as fh:
        audio = fh.read()
    os.remove(out_path)
    return Response(content=audio, media_type="audio/wav")
