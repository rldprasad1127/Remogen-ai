These scene components are mirrored from `backend/remotion/` so
`@remotion/player` can preview the exact same visuals in-browser (Step 3 of
the wizard) that `@remotion/renderer` produces server-side for the final
MP4. If you hand-edit a scene, keep both copies in sync, or better, extract
them into a shared local npm package/workspace.
