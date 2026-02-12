# App folder map

## Owns
- Electron app runtime: main process, preload bridge, renderer, workers, native bridge, shared contracts, tools, and bundled resources.

## Does not own
- Anything not listed above. If you’re unsure, jump to `docs/MUSEUM_TOUR.md`.

## Entry points
- Main: `app/main.js` → `app/main/index.js`
- Preload: `app/preload.js` → `app/preload/index.js`
- Renderer shell: `app/index.html` + `app/src/**`

## How to inspect fast
- Search for `TRACE:` to follow the execution spine.
- If you’re editing inter-process communication, start from `app/shared/ipc.js` and then go to `app/main/ipc/`.

## Safe edit zones
- Prefer editing under `app/src/domains/*` (UI) and `app/main/domains/*` (backend logic).
- Use existing `EDIT_ZONE:` blocks when present.

## Danger zones
- `app/preload/*` and `app/shared/ipc.js` are wiring-critical.
- Worker entry wrappers (`app/library_scan_worker.js`, `app/video_scan_worker.js`) must remain stable paths.

## Next links
- `docs/README.md`
- `docs/CODEMAP_INDEX.md`
- `docs/maps/`

