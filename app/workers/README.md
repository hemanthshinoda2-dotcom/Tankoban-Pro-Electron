# Workers map

## Owns
- Background scanning/indexing logic for library and video. Runs off the main thread.

## Does not own
- Anything not listed above. If you’re unsure, jump to `docs/MUSEUM_TOUR.md`.

## Entry points
- Entrypoints: `app/library_scan_worker.js`, `app/video_scan_worker.js` (stable paths)
- Implementations: `app/workers/*_worker_impl.js`
- Shared helpers: `app/workers/shared/*`

## How to inspect fast
- Search for `TRACE:` to follow the execution spine.
- If you’re editing inter-process communication, start from `app/shared/ipc.js` and then go to `app/main/ipc/`.

## Safe edit zones
- Edit the `_impl.js` files, not the stable wrappers.
- Keep messages/payloads stable; update docs/maps if shapes change.

## Danger zones
- Workers must remain deterministic and safe under cancellation.

## Next links
- `docs/README.md`
- `docs/CODEMAP_INDEX.md`
- `docs/maps/`

