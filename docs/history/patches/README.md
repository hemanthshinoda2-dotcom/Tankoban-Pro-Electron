# patches/

This folder is **archive + paper trail**.

Patches here are NOT automatically applied at runtime. They exist so an editor can:
- see how a change was done in the past,
- re-apply a fix to a new build manually,
- or compare behavior when debugging regressions.

## What’s inside

- `Build-101.patch` — historical diff for a Build 101 change
- `build91.patch` — historical diff for Build 91

## How to use (safe)

- Read the patch header/comments first.
- If you apply a patch manually, do it **surgically** and then run `npm run smoke` from `app/`.
- If a patch touches IPC:
  - update `app/shared/ipc.js` (channel/event constants)
  - update the relevant main handler in `app/main/ipc/`
  - update preload bridge if needed in `app/preload/`

## Do not do

- Do not auto-apply these in scripts without reviewing: old patches may not match current folder layout.
