# Preload bridge map

## Owns
- The only allowed bridge between renderer and main. Exposes `Tanko.api.*` / `window.electronAPI` style functions.

## Does not own
- Anything not listed above. If you’re unsure, jump to `docs/MUSEUM_TOUR.md`.

## Entry points
- Entrypoint: `app/preload/index.js`
- Contracts: `app/shared/ipc.js`

## How to inspect fast
- Search for `TRACE:` to follow the execution spine.
- If you’re editing inter-process communication, start from `app/shared/ipc.js` and then go to `app/main/ipc/`.

## Safe edit zones
- Add or adjust exposed APIs in `app/preload/index.js`.
- Keep calls thin wrappers around IPC invoke/send.

## Danger zones
- Breaking preload breaks the whole app. Keep diffs minimal and run `npm run smoke` after any change.

## Next links
- `docs/README.md`
- `docs/CODEMAP_INDEX.md`
- `docs/maps/`

