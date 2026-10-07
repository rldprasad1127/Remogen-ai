"""
Builds RemoGen_Colab_TTS_{XTTS,Dia,ChatTTS}.ipynb from the actual server_*.py
files, so the notebook and the code it runs can never drift apart. Run this
after editing any server_*.py or rg_common.py.
"""
import ast
import json
import os

DIR = os.path.dirname(os.path.abspath(__file__))
COMMON_PY = open(os.path.join(DIR, "rg_common.py")).read()


def md(text):
    return {"cell_type": "markdown", "metadata": {}, "source": text.strip("\n").splitlines(True)}


def code(text):
    return {"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": text.strip("\n").splitlines(True)}


def writefile_cell(name, content):
    """Like code(), but never touches the embedded file's own content - only
    the %%writefile header line - so what Colab writes to disk is byte-for-byte
    identical to the real source file."""
    return {"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": [f"%%writefile {name}\n"] + content.splitlines(True)}


LAUNCH_AND_TUNNEL = '''
# Start the TTS server + a public tunnel, then print the URL and API key
import os, re, sys, time, json, secrets, subprocess, urllib.request, urllib.error

os.environ["COQUI_TOS_AGREED"] = "1"     # harmless if this engine doesn't use it
API_KEY = secrets.token_urlsafe(24)      # protects the public URL - don't share it
PORT = 8000

def health():
    req = urllib.request.Request(f"http://127.0.0.1:{{PORT}}/health", headers={{"X-API-Key": API_KEY}})
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read())

# --- start the server (loads the model in the background) ---
server = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "{module}:app", "--host", "127.0.0.1", "--port", str(PORT)],
    env={{**os.environ, "RG_API_KEY": API_KEY}},
    stdout=open("server.log", "w"), stderr=subprocess.STDOUT,
)
print("Loading {friendly_name} ({load_note})...")
t0 = time.time()
while True:
    if server.poll() is not None:
        print(open("server.log").read()[-3000:])
        raise SystemExit("Server crashed - see the log above")
    try:
        info = health()
        if info.get("status") == "ok":
            break
    except urllib.error.HTTPError as e:
        if e.code == 500:
            raise SystemExit("Model failed to load: " + e.read().decode()[:1500])
    except Exception:
        pass                                   # server still starting
    if time.time() - t0 > {load_timeout}:
        raise SystemExit("Timed out waiting for the model to load")
    time.sleep(5)
print("Model ready on:", info.get("gpu") or info.get("device"))

# --- open a public tunnel (Cloudflare quick tunnel: free, no account) ---
if not os.path.exists("cloudflared"):
    subprocess.run(["wget", "-q", "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64",
                    "-O", "cloudflared"], check=True)
    os.chmod("cloudflared", 0o755)
tunnel = subprocess.Popen(["./cloudflared", "tunnel", "--url", f"http://127.0.0.1:{{PORT}}", "--no-autoupdate"],
                          stdout=open("tunnel.log", "w"), stderr=subprocess.STDOUT)
public_url = None
for _ in range(90):
    time.sleep(1)
    m = re.search(r"https://[-a-z0-9]+\\.trycloudflare\\.com", open("tunnel.log").read())
    if m:
        public_url = m.group(0)
        break
if not public_url:
    print(open("tunnel.log").read()[-2000:])
    raise SystemExit("Could not open a tunnel - see the log above")

print("\\n" + "=" * 64)
print(" PASTE THESE INTO RemoGen Studio -> Voice Engine")
print("=" * 64)
print(f" Engine    : {friendly_name}")
print(f" Colab URL : {{public_url}}")
print(f" API key   : {{API_KEY}}")
print("=" * 64)
print(" Keep this cell running. Stop it (or close the tab) to shut TTS down.\\n")

# --- keep the runtime alive while you work ---
try:
    while server.poll() is None and tunnel.poll() is None:
        time.sleep(30)
except KeyboardInterrupt:
    pass
finally:
    tunnel.terminate(); server.terminate()
    print("Stopped.")
'''


def build_notebook(filename, title_md, install_cell, server_module, server_py_path, friendly_name, load_note, load_timeout, troubleshooting_md, extra_files=()):
    server_py = open(os.path.join(DIR, server_py_path)).read()

    cells = [
        md(title_md),
        code(install_cell),
        writefile_cell("rg_common.py", COMMON_PY),
    ]
    for name, path in extra_files:
        cells.append(writefile_cell(name, open(os.path.join(DIR, path)).read()))
    cells.append(writefile_cell(f"{server_module}.py", server_py))
    cells.append(code(LAUNCH_AND_TUNNEL.format(module=server_module, friendly_name=friendly_name, load_note=load_note, load_timeout=load_timeout)))
    cells.append(md(troubleshooting_md))

    nb = {
        "cells": cells,
        "metadata": {
            "accelerator": "GPU",
            "colab": {"gpuType": "T4", "provenance": []},
            "kernelspec": {"display_name": "Python 3", "name": "python3"},
            "language_info": {"name": "python"},
        },
        "nbformat": 4, "nbformat_minor": 0,
    }
    json.dump(nb, open(os.path.join(DIR, filename), "w"), indent=1)

    # Validate every code cell parses as Python once magics/shell lines are stripped.
    for i, c in enumerate(cells):
        if c["cell_type"] != "code":
            continue
        src = "".join(c["source"])
        # Drop the first line if it's a %%writefile magic - the REST of the cell is the target file's own source, not this cell's.
        lines = src.splitlines()
        if lines and lines[0].startswith("%%writefile"):
            body = "\n".join(lines[1:])
        else:
            body = "\n".join(l for l in lines if not l.lstrip().startswith(("!", "%%")))
        ast.parse(body)
    print(f"{filename}: {len(cells)} cells, all Python OK")


# ---- XTTS-v2 --------------------------------------------------------------
build_notebook(
    filename="RemoGen_Colab_TTS_XTTS.ipynb",
    title_md="""
# RemoGen Studio - voice cloning on Colab (XTTS-v2)

Runs XTTS-v2 here on Colab's GPU for narration + voice cloning from your uploaded sample.
Your PC keeps doing everything else (script writing, preview, video rendering).

**How to use**
1. **Runtime -> Change runtime type -> T4 GPU**.
2. Run the cells below **in order**. The last cell prints a **URL** and an **API key**.
3. In RemoGen Studio open **Voice Engine**, paste both, press **Test connection**, and **Save**.
4. Leave this tab open while you generate. If the notebook stops, re-run the last cell - the URL and key **change every time**.

*Note:* XTTS-v2 is released under the Coqui Public Model License, which is **non-commercial**.
""",
    install_cell="""
# 1) Check for a GPU and install the dependencies (first run: ~2-4 minutes)
!nvidia-smi -L || echo ">>> NO GPU: choose Runtime -> Change runtime type -> T4 GPU, then re-run"
!pip -q install coqui-tts fastapi "uvicorn[standard]" python-multipart
""",
    server_module="server_xtts",
    server_py_path="server_xtts.py",
    friendly_name="XTTS-v2",
    load_note="first run downloads ~2 GB, a few minutes",
    load_timeout=900,
    troubleshooting_md="""
### Troubleshooting
- **"NO GPU"** - Runtime -> Change runtime type -> T4 GPU, then Runtime -> Restart and run all.
- **Install errors about `transformers` / `torch`** - run `!pip -q install -U coqui-tts` and restart the runtime.
- **RemoGen says the tunnel is down** - Colab stopped (free tier disconnects after idle/limits). Re-run the last cell and paste the new URL + key.
- **Voice doesn't sound like your sample** - use 10-30 s of clean speech, one speaker, no music/noise.
""",
)

# ---- Dia -------------------------------------------------------------------
build_notebook(
    filename="RemoGen_Colab_TTS_Dia.ipynb",
    title_md="""
# RemoGen Studio - expressive narration on Colab (Dia by Nari Labs)

Runs Dia (Apache-2.0, 1.6B) here on Colab's GPU. Unlike XTTS, you can write things like
`(laughs)`, `(sighs)`, `(coughs)` directly into your script and Dia will actually perform them -
this is the option for narration that doesn't sound like a flat text-to-speech reading.

Voice cloning works too, but is handled a bit differently than XTTS: your uploaded reference
clip is automatically transcribed (a small Whisper model, included below) since Dia needs the
clip's transcript alongside the audio itself.

**How to use**
1. **Runtime -> Change runtime type -> T4 GPU**.
2. Run the cells below **in order**. First run downloads the model (~3-5 GB) - a few minutes.
3. The last cell prints a **URL** and an **API key** - paste both into RemoGen Studio -> **Voice Engine**, **Test connection**, **Save**.
4. Leave this tab open while you generate. Re-running the last cell gives a **new** URL and key every time.

*Note:* Dia is Apache-2.0 licensed (no non-commercial restriction, unlike XTTS/Coqui).

*Honesty note:* voice cloning here trims the replayed reference clip off the start of each
generation automatically, based on how this class of model is documented to behave. This
project's author could not verify that exact behaviour on a real GPU - if a cloned scene's
audio is missing its first second or has an extra second of the reference clip up front,
that's the thing to look at first (see `_trim_wav_start` in `server_dia.py`).
""",
    install_cell="""
# 1) Check for a GPU and install the dependencies (first run: ~3-5 minutes)
!nvidia-smi -L || echo ">>> NO GPU: choose Runtime -> Change runtime type -> T4 GPU, then re-run"
!pip -q install git+https://github.com/nari-labs/dia.git
!pip -q install faster-whisper fastapi "uvicorn[standard]" python-multipart
""",
    server_module="server_dia",
    server_py_path="server_dia.py",
    friendly_name="Dia",
    load_note="first run downloads the model + a small Whisper model, a few minutes",
    load_timeout=900,
    troubleshooting_md="""
### Troubleshooting
- **"NO GPU"** - Runtime -> Change runtime type -> T4 GPU, then Runtime -> Restart and run all.
- **Install fails on `dia`** - it needs a recent `torch`; run `!pip -q install -U torch` first, restart the runtime, then re-run the install cell.
- **A cloned voice sounds cut off at the start, or has extra sound before it starts** - see the "Honesty note" above; the reference-clip trim may need adjusting for your specific clip length.
- **Non-verbal tags like `(laughs)` are read out loud as the word "laughs"** - make sure the tag is written exactly as shown (see the list in `server_dia.py`'s `NON_VERBAL_TAGS`), with the parentheses.
- **RemoGen says the tunnel is down** - Colab stopped (free tier disconnects after idle/limits). Re-run the last cell and paste the new URL + key.
""",
)

# ---- ChatTTS -----------------------------------------------------------------
build_notebook(
    filename="RemoGen_Colab_TTS_ChatTTS.ipynb",
    title_md="""
# RemoGen Studio - conversational narration on Colab (ChatTTS)

Runs ChatTTS here on Colab's GPU. It's trained specifically on natural dialogue, so narration
comes out sounding less like a teleprompter reading and more like a person talking - it adds
natural pauses and can include `[laugh]`/`[uv_break]`-style delivery.

**Read this before using it: ChatTTS does NOT clone your uploaded voice sample.** There is no
zero-shot "clone this audio" feature in ChatTTS the way there is in XTTS or Dia. What you get
instead is ONE consistent, natural-sounding voice, randomly selected once per project, that
stays the same across every scene - uploading a reference sample just gives that consistent
voice a stable ID to remember, it does not change what the voice sounds like.

**How to use**
1. **Runtime -> Change runtime type -> T4 GPU**.
2. Run the cells below **in order**.
3. The last cell prints a **URL** and an **API key** - paste both into RemoGen Studio -> **Voice Engine**, **Test connection**, **Save**.
4. Leave this tab open while you generate. Re-running the last cell gives a **new** URL and key every time.
""",
    install_cell="""
# 1) Check for a GPU and install the dependencies (first run: ~2-3 minutes)
!nvidia-smi -L || echo ">>> NO GPU: choose Runtime -> Change runtime type -> T4 GPU, then re-run"
!pip -q install ChatTTS fastapi "uvicorn[standard]" python-multipart
""",
    server_module="server_chattts",
    server_py_path="server_chattts.py",
    friendly_name="ChatTTS",
    load_note="first run downloads the model, a couple of minutes",
    load_timeout=600,
    troubleshooting_md="""
### Troubleshooting
- **"NO GPU"** - Runtime -> Change runtime type -> T4 GPU, then Runtime -> Restart and run all.
- **Voice doesn't match my uploaded sample at all** - that's expected, see the note above; ChatTTS picks its own consistent voice rather than cloning yours.
- **Want more/less laughter or pausing** - set the `CHATTTS_REFINE_PROMPT` environment variable before starting the server (see `server_chattts.py`) - e.g. `[oral_2][laugh_1][break_4]` for a bit more laughter.
- **RemoGen says the tunnel is down** - Colab stopped (free tier disconnects after idle/limits). Re-run the last cell and paste the new URL + key.
""",
)

print("\\nAll notebooks generated successfully.")
