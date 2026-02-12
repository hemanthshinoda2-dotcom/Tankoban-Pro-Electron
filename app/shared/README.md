# Shared contracts map

## Owns
- Cross-layer contracts used by renderer, preload, main, and workers (IPC channels, constants, shared utilities).

## Does not own
- Anything not listed above. If you’re unsure, jump to `docs/MUSEUM_TOUR.md`.

## Entry points
- IPC constants: `app/shared/ipc.js`

## How to inspect fast
- Search for `TRACE:` to follow the execution spine.
- If you’re editing inter-process communication, start from `app/shared/ipc.js` and then go to `app/main/ipc/`.

## Safe edit zones
- Add new channels here first, then implement main handler + preload wrapper + renderer caller.

## Danger zones
- This is a high-impact folder: contract mistakes cause hard-to-debug failures.

## Next links
- `docs/README.md`
- `docs/CODEMAP_INDEX.md`
- `docs/maps/`

