# RemoGen Studio - Backend

Express + MongoDB/Mongoose API, a stage-based production pipeline (planner /
scriptwriter / voice / render), two interchangeable text-to-speech engines,
and a Remotion server-side renderer.

## Setup

```bash
cp .env.example .env      # fill in JWT_SECRET, Mongo URI, etc.
npm install
node seed.js               # seeds the 5 system-default templates
npm run dev                # starts on PORT (default 4000)
```

**Keeping Remotion package versions in sync:** every `remotion` /
`@remotion/*` package must be on the *identical* version, not just a
compatible semver range - `package.json` pins them all exactly, plus an
`overrides` entry, to prevent Remotion's "Multiple versions of Remotion
detected" error. If you bump one, bump all of them (here and in the
frontend) to the same exact version, then reinstall.

## Two ways to generate narration - pick one, or let it choose automatically

Voice cloning is the most hardware-hungry part of this pipeline. You can run
it two ways, per-user, from **Voice Engine** in the sidebar:

| Mode | Where TTS runs | Needs |
|---|---|---|
| **Local** | This machine, via AllTalk | AllTalk installed and running (below) |
| **Colab** | A free Google Colab GPU | The included notebook, running in a browser tab |
| **Auto** (default) | Colab if it's connected and reachable right now, otherwise local | Either of the above |

**Video rendering always happens on this machine regardless of which TTS
engine generated the narration** - Colab only ever produces small audio
clips that get downloaded here before rendering starts.

### Option A: Local AllTalk

`services/tts/allTalkProvider.js` is built against AllTalk's actual API
(`/api/tts-generate`, `application/x-www-form-urlencoded`, a JSON reply
containing a download URL - not raw audio bytes back directly).

1. `git clone https://github.com/erew123/alltalk_tts`
2. Run `atsetup.sh` / `atsetup.bat`, choose **Standalone Application**.
   Needs Python 3.11.x; Windows also needs C++ build tools.
3. Start it with whatever command the setup script prints
   (`start_alltalk.sh` / `.bat`). First launch downloads the XTTS model.
4. Confirm: `curl http://localhost:7851/api/voices` should return a JSON
   list of voice filenames. `TTS_BASE_URL` in `.env` must match.

**Voice cloning specifically:** AllTalk's API won't accept an arbitrary
reference wav per-request - a voice must already be a named file in
AllTalk's own `voices/` folder. Set `ALLTALK_VOICES_DIR` in `.env` to that
folder's absolute path so the backend can copy your upload there and ask
AllTalk to rescan; without it, narration silently uses
`ALLTALK_DEFAULT_VOICE` instead of your uploaded sample, with no error.

### Option B: Google Colab (no local GPU needed)

Three notebooks, one per engine - download whichever fits what you need from
**Voice Engine** in the app (or directly from `colab/`), open it in Colab,
run the cells in order. The last cell prints a **URL** and an **API key** -
paste both into Voice Engine and save. All three expose the exact same
`/health` + `/voices` + `/tts` contract, so the backend's Colab client
(`services/tts/colabProvider.js`) doesn't know or care which one you're
running - swapping engines is just downloading a different notebook.

| Notebook | Engine | What it's for |
|---|---|---|
| `RemoGen_Colab_TTS_XTTS.ipynb` | XTTS-v2 | Clones your uploaded sample directly. The default choice if sounding like a specific person matters most. |
| `RemoGen_Colab_TTS_Dia.ipynb` | [Dia](https://github.com/nari-labs/dia) | Write `(laughs)`, `(sighs)`, `(coughs)` directly into scene text and it performs them. Also clones your sample (via audio-prompt + an auto-transcribed reference, not XTTS's method). |
| `RemoGen_Colab_TTS_ChatTTS.ipynb` | [ChatTTS](https://github.com/2noise/ChatTTS) | Natural conversational delivery with fillers/pauses. **Does not clone your sample** - see below. |

The notebooks disconnect on their own after a while (Colab's free-tier
limit), and the URL/key are different every time you re-run one - when
generation starts failing, that's almost always why; just re-run it and
update the two fields.

`colab/rg_common.py` holds the shared plumbing (auth, upload handling,
speed adjustment) all three servers use; `colab/server_xtts.py` /
`server_dia.py` / `server_chattts.py` are the model-specific parts. Run
`python3 colab/build_notebooks.py` after editing any of them to regenerate
the `.ipynb` files - they're built FROM these source files, not maintained
by hand, so the notebook and the code it actually runs can never drift
apart.

**Licenses differ per engine** - XTTS-v2 is Coqui's Public Model License
(non-commercial). Dia is Apache 2.0 (no such restriction). Check ChatTTS's
own license before commercial use.

**On ChatTTS specifically: it does not clone your uploaded voice.** There's
no zero-shot "clone this audio" capability in ChatTTS the way there is in
XTTS or Dia - what it offers instead is one consistent, naturally-sounding
voice, randomly sampled once per project, that stays the same across every
scene. An uploaded sample just gives that voice a stable ID to remember
across retries; it is not the source of what the voice sounds like. The
app's UI says this explicitly rather than implying otherwise.

**On Dia's voice cloning specifically:** unlike XTTS, Dia needs the
reference clip's *transcript* alongside the audio (handled automatically -
a small Whisper model transcribes your upload when you first use it), and
its output is documented to include the replayed reference clip before the
new narration, which `server_dia.py` trims off automatically based on the
reference clip's own length. This trimming logic is unit-tested
(see `colab/test_trim.py` if you want to verify it yourself), but the
author of this code could not verify the underlying "does it actually
replay the prompt" assumption against a real GPU - if a cloned scene's
audio is missing a beat at the start or has extra sound before it, that's
the first thing to check.

### Other machine requirements

- **MongoDB** running and reachable at `MONGO_URI`.
- **Ollama** running locally (`ollama serve`) with a model pulled, e.g.
  `ollama pull llama3.1:8b`.
- **Chromium deps for Remotion** - `@remotion/renderer` needs the same
  system libraries as headless Chrome.

## How narration generation actually works

Each scene gets its **own** audio clip (not one long track for the whole
video) - `voiceCloneNode` in `langgraph/workflow.js` synthesizes scene by
scene, and each scene's length in the final video is derived from its
clip's real duration (`remotion/constants.js`), so picture and voice can't
drift out of sync no matter how long the video runs.

This also makes failures resumable rather than "start over from scratch":
if scene 14 of 20 fails, `POST /:id/retry` only regenerates scene 14
onward - scenes 1-13 already have a matching clip on disk and are skipped.
If only *rendering* failed (all narration succeeded), retry skips straight
to re-rendering, without touching narration at all.

Progress (`project.progressPercent` / `progressPhase`, pushed live over the
existing `/progress` SSE stream) reflects this: 0-40% is narration (one
tick per scene), 40-45% is preparing the video engine, 45-100% is the
actual frame-by-frame render.

## Hardware safety

- `services/ollamaService.js` calls `keep_alive: 0` after planning/scripting
  to free RAM before TTS/rendering start.
- `services/renderService.js` defaults render `concurrency` to `1`
  (`RENDER_CONCURRENCY` in `.env`; 2 max recommended on 16GB machines).
- The Remotion bundle is built once per server process and reused for every
  render, not rebuilt from scratch each time.

## Folder map

```
models/         Mongoose schemas (User, Template, Project)
routes/         Express routers (auth, projects, templates, settings)
middleware/     JWT auth middleware
services/tts/   Both TTS engines behind one interface (allTalkProvider.js,
                colabProvider.js) + a WAV duration parser and retry helper
services/       Ollama, TTS engine selection, Remotion render, template gen
langgraph/      The four pipeline stages (planner/scriptwriter/voice/render),
                each independently callable - see the comment at the top of
                workflow.js for why this isn't a single compiled graph
remotion/       The Remotion composition rendered server-side, plus the
                shared timing constants (constants.js) also used by the
                workflow to size scenes to their narration
colab/          The XTTS-v2 server + generated notebook for cloud TTS
config/         Storage path + public URL helpers (all paths are absolute,
                regardless of which directory the process is started from)
```

## API surface

- `POST /api/auth/register|login`, `GET /api/auth/me`
- `GET/POST /api/projects`, `GET/DELETE /api/projects/:id`
- `POST /api/projects/:id/plan` -> runs the planner stage
- `POST /api/projects/:id/plan/revise` -> re-runs the planner with feedback
- `POST /api/projects/:id/plan/approve` -> runs the scriptwriter stage only
- `POST /api/projects/:id/script/approve` -> starts voice + render (async)
- `POST /api/projects/:id/retry` -> resumes from whichever stage failed
- `GET /api/projects/:id/progress` -> SSE stream (status, percent, phase,
  which voice engine is in use, error details)
- `GET/POST /api/templates`, `POST /api/templates/generate`,
  `DELETE /api/templates/:id`
- `GET/PUT /api/settings/tts` -> a user's saved voice-engine mode/Colab
  connection; `POST /api/settings/tts/test` checks both engines' live
  status without saving anything
- `GET /api/colab-notebook` -> downloads the Colab notebook
