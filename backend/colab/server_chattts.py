"""
RemoGen Studio - ChatTTS voice server for Google Colab.
See rg_common.py for the shared HTTP contract all three engine servers share.

IMPORTANT, read this before assuming this clones your voice - IT DOES NOT.
ChatTTS has no zero-shot "clone this uploaded audio" capability the way
XTTS/Dia do. What it offers instead is a persistent RANDOM speaker voice:
`sample_random_speaker()` returns a fixed embedding you can reuse so every
scene in a project sounds like the same (randomly chosen, natural-sounding)
narrator - but it is NOT derived from whatever reference sample the user
uploaded. This file is honest about that: an uploaded sample's CONTENT is
only used as a key (so the same upload consistently maps to the same
sampled voice across retries), never as the source of the voice itself.
The frontend/README must not claim this clones the user's voice.

What ChatTTS is genuinely good at: natural conversational fillers via
[uv_break]/[laugh]-style tags and a statistically natural, less "reading
a teleprompter" delivery than a straight narration model.
"""
import json
import os
import threading
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from rg_common import FAKE, VOICE_DIR, require_key, save_uploaded_voice, apply_speed, fake_wav_bytes

# How much natural "oral" filler / laughter / pausing the refine-text stage
# adds - see ChatTTS's own docs for the [oral_N][laugh_N][break_N] scale.
REFINE_PROMPT = os.environ.get("CHATTTS_REFINE_PROMPT", "[oral_2][laugh_0][break_4]")

state = {"chat": None, "device": "cpu", "gpu": None, "default_speaker": None, "error": None}
synth_lock = threading.Lock()

SPEAKER_STORE = os.path.join(VOICE_DIR, "chattts_speakers.json")
speakers = {}  # content-hash voice_id -> saved speaker embedding string
if os.path.exists(SPEAKER_STORE):
    try:
        speakers.update(json.load(open(SPEAKER_STORE)))
    except Exception:
        pass


def save_speakers():
    json.dump(speakers, open(SPEAKER_STORE, "w"))


def load_model():
    try:
        if FAKE:
            state.update(device="fake", gpu="none (fake mode)", default_speaker="fake-speaker", chat="fake")
            return
        import torch
        import ChatTTS

        device = "cuda" if torch.cuda.is_available() else "cpu"
        state["device"] = device
        state["gpu"] = torch.cuda.get_device_name(0) if device == "cuda" else None

        chat = ChatTTS.Chat()
        chat.load_models(compile=False)
        state["chat"] = chat
        # One consistent voice for projects that don't upload a reference
        # sample at all, sampled once per Colab session so it doesn't
        # change scene-to-scene.
        state["default_speaker"] = str(chat.sample_random_speaker())
    except Exception as exc:
        state["error"] = f"{type(exc).__name__}: {exc}"
        raise


@asynccontextmanager
async def lifespan(_app):
    threading.Thread(target=load_model, daemon=True).start()
    yield


app = FastAPI(title="RemoGen Colab TTS - ChatTTS", lifespan=lifespan)


@app.get("/health", dependencies=[Depends(require_key)])
def health():
    if state["error"]:
        return JSONResponse(status_code=500, content={"status": "error", "detail": state["error"]})
    ready = state["chat"] is not None
    return {
        "status": "ok" if ready else "loading",
        "model": "chattts" if not FAKE else "fake",
        "device": state["device"],
        "gpu": state["gpu"],
        # Surfaced so the app can be upfront in its UI that this isn't cloning.
        "clones_voice": False,
    }


@app.post("/voices", dependencies=[Depends(require_key)])
async def upload_voice(file: UploadFile = File(...)):
    data = await file.read()
    # save_uploaded_voice() is only used here to get a stable content-hash
    # id and to validate the upload - the audio ITSELF is discarded after,
    # since ChatTTS has nothing that can use it.
    voice_id = save_uploaded_voice(data, file.filename)

    if voice_id not in speakers:
        if FAKE:
            speakers[voice_id] = "fake-sampled-speaker"
        else:
            if state["chat"] is None:
                raise HTTPException(status_code=503, detail="Model is still loading - try again shortly")
            speakers[voice_id] = str(state["chat"].sample_random_speaker())
        save_speakers()

    return {"voice_id": voice_id}


class TTSRequest(BaseModel):
    text: str
    language: str = "en"  # accepted for interface consistency; ChatTTS handles mixed-language text natively
    speed: float = 1.0
    voice_id: Optional[str] = None


@app.post("/tts", dependencies=[Depends(require_key)])
def synthesize(req: TTSRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is empty")
    if state["error"]:
        raise HTTPException(status_code=500, detail=state["error"])
    if state["chat"] is None and not FAKE:
        raise HTTPException(status_code=503, detail="Model is still loading")

    speaker_emb = speakers.get(req.voice_id) if req.voice_id else None
    if req.voice_id and speaker_emb is None:
        raise HTTPException(status_code=404, detail="Unknown voice_id - upload the reference sample again")
    speaker_emb = speaker_emb or state["default_speaker"]

    raw_path = os.path.join(VOICE_DIR, f"chattts_raw_{threading.get_ident()}_{os.getpid()}.wav")
    final_path = os.path.join(VOICE_DIR, f"chattts_out_{threading.get_ident()}_{os.getpid()}.wav")

    if FAKE:
        with open(raw_path, "wb") as fh:
            fh.write(fake_wav_bytes(text))
    else:
        import torch
        import torchaudio
        import ChatTTS

        with synth_lock:
            params_infer_code = ChatTTS.Chat.InferCodeParams(spk_emb=speaker_emb)
            params_refine_text = ChatTTS.Chat.RefineTextParams(prompt=REFINE_PROMPT)
            wavs = state["chat"].infer([text], params_infer_code=params_infer_code, params_refine_text=params_refine_text)
        torchaudio.save(raw_path, torch.from_numpy(wavs[0]), 24000)

    apply_speed(raw_path, final_path, req.speed)
    with open(final_path, "rb") as fh:
        audio = fh.read()
    for p in (raw_path, final_path):
        if os.path.exists(p):
            os.remove(p)
    return Response(content=audio, media_type="audio/wav")
