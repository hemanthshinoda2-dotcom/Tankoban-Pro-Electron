# Tankoban Pro — AI Editing Guide

This repository is already structured with clear ownership boundaries. The goal of this guide is to make future edits fast and safe.

## Project assumptions for editors

- Windows only. Do not add Linux or macOS instructions unless explicitly requested.
- Python is assumed to be installed on the machine running Tankoban Pro.
- Embedded canvas playback is dead. Do not reintroduce it.
- When delivering changes, output full file replacements for every changed file (no diffs, no partial snippets).
- Every code change must be paired with a documentation update so this repo stays self-describing. At minimum:
  - Update the relevant map in `docs/maps/` (or add a new map if the change crosses boundaries).
  - Update `docs/README.md` if a document was added, removed, or renamed.
  - Update `app/START_HERE.md` if runtime behavior or cross-boundary flow changed.
  - Update `DANGER_ZONES.md` if you touched a brittle area or created a new one.


## Quick orientation

Start with:
- `app/START_HERE.md` (the primary guide for changes)
- `docs/REPO_STRUCTURE.md` (repo map) or legacy: `docs/legacy/app_docs/docs/core/RESTRUCTURE_REPORT.md` (repo map and ownership)
- `docs/00_START_HERE.md` + `docs/01_ARCHITECTURE_OVERVIEW.md` (current) or legacy: `docs/legacy/app_docs/docs/core/ARCHITECTURE_RULES.md` (non negotiable structure rules)

## Where to change what

Main process (window, persistence, native, workers)
- Entrypoint: `app/main.js` → `app/main/index.js`
- Domains: `app/main/domains/` (each domain owns a slice: library, video, progress, player, window)

Preload bridge (the only safe bridge to renderer)
- Entrypoint: `app/preload.js` → `app/preload/index.js`

Renderer user interface
- Entrypoint: `app/src/index.html` (script tags)
- Primary logic: `app/src/domains/` and `app/src/state/`
- The only place that calls `window.electronAPI`: `app/src/services/api_gateway.js`

Inter process communication contract
- Channels and helpers: `app/shared/ipc.js`

Workers (background scanning)
- Stable entries (do not move): `app/library_scan_worker.js`, `app/video_scan_worker.js`
- Actual implementations: `app/workers/library_scan_worker_impl.js`, `app/workers/video_scan_worker_impl.js`

## Safe edit checklist

When you make a change:
1. Update the inter process communication contract in `app/shared/ipc.js` if a channel is added or changed.
2. Add the main side handler in `app/main/domains/<domain>/` and register it in `app/main/ipc/index.js`.
3. Expose it in `app/preload/index.js`.
4. Route it through `app/src/services/api_gateway.js`.
5. Run `npm run smoke` inside `app/`.

## Folder rules used in this refactor

- Worker implementations moved into `app/workers/`, but worker entry files stayed put to preserve path stability.
- Documentation lives under `docs/`. Legacy/archived docs live under `docs/legacy/` and `docs/history/`.
- Patch files moved into `patches/` for cleanliness.
