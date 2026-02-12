# Main process map

## Owns
- Everything that runs in the Electron main process: IPC registration, file system operations, persistence, scan orchestration, mpv/native integration.

## Does not own
- Anything not listed above. If you’re unsure, jump to `docs/MUSEUM_TOUR.md`.

## Entry points
- Entrypoint: `app/main/index.js`
- IPC router: `app/main/ipc/index.js`
- Domains: `app/main/domains/*`

## How to inspect fast
- Search for `TRACE:` to follow the execution spine.
- If you’re editing inter-process communication, start from `app/shared/ipc.js` and then go to `app/main/ipc/`.

## Safe edit zones
- Edit logic inside `app/main/domains/*`.
- Add new IPC handlers under `app/main/ipc/register/*` (follow existing grouping).

## Danger zones
- Do not add string literal IPC channel names; use `app/shared/ipc.js` constants.
- Avoid heavy synchronous operations in main.

## Next links
- `docs/README.md`
- `docs/CODEMAP_INDEX.md`
- `docs/maps/`

