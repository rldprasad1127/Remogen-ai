# RemoGen Studio - Frontend

Vite + React + Tailwind CSS + `@remotion/player`. Talks to the backend API
via `/api` (proxied to `http://localhost:4000` in dev - see `vite.config.js`).

## Setup

```bash
rm -rf node_modules package-lock.json   # if you installed before this update
npm install
npm run dev     # http://localhost:5173
```

**Keep Remotion versions in sync with the backend** - `remotion` and every
`@remotion/*` package here must be pinned to the exact same version as in
`backend/package.json` (not just semver-compatible), or you'll hit
Remotion's "Multiple versions of Remotion detected" error in the browser.

## Structure

```
src/pages/            Login, Register, Dashboard, ProjectWorkspace (4-step wizard), Templates
src/components/       StepTracker, PlanReview, SceneEditor, ThemeSelector, ProgressBar
src/context/          AuthContext (JWT stored in localStorage + httpOnly cookie)
src/remotion/         Mirrors backend/remotion so the in-browser Player preview
                      (Step 3) matches the server-rendered MP4 exactly
```

## Note on the Remotion composition duplication

`src/remotion/*` is a copy of `backend/remotion/*`. `@remotion/player` needs
the composition to run client-side for scrubbing/preview, while
`@remotion/renderer` needs it server-side for the actual MP4 render. Keeping
one canonical copy is best done by extracting `remotion/` into a shared
local package (e.g. an npm workspace) both apps import - left as a follow-up
since it depends on how you structure your monorepo/deploy.
