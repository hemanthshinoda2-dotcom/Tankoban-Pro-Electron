# workers/shared (app/workers/shared)

**Purpose:** Shared helper utilities used by scan workers (library + video). This exists to prevent copy-paste divergence.

## Code map

- `fs_safe.js` — safe `stat`/existence helpers (never throw; used in scanners)
- `ignore.js` — ignore config + ignore checks (folders/files)
- `ids.js` — stable ID helpers used by scanners (deterministic IDs)

## Editing guide (AI)

- **Keep these pure and dependency-light.** Workers are performance-sensitive and should not import renderer/main modules.
- **Do not add Electron imports here.** Worker code must remain Node-only.
- If a change affects scan semantics (what gets included/ignored), update:
  - `docs/04_LIBRARY_PIPELINE.md` and/or `docs/05_VIDEO_PIPELINE.md`
  - relevant map in `docs/maps/`

## Related maps

- `docs/maps/MAP_LIBRARY_FLOW.md`
- `docs/maps/MAP_VIDEO_FLOW.md`
