# Renderer (UI) map

## Owns
- Everything that runs in the renderer: UI, DOM events, view state, page routing, and player HUD.

## Does not own
- Anything not listed above. If you’re unsure, jump to `docs/MUSEUM_TOUR.md`.

## Entry points
- Root UI: `app/index.html`
- Styles: `app/src/styles/*`
- Domains: `app/src/domains/*`

## How to inspect fast
- Search for `TRACE:` to follow the execution spine.
- If you’re editing inter-process communication, start from `app/shared/ipc.js` and then go to `app/main/ipc/`.

## Safe edit zones
- Make UI changes inside a domain folder.
- If splitting files, update `index.html` load order and run `npm run smoke` (it validates load order).

## Danger zones
- Renderer is single-threaded: avoid heavy loops on entry. Prefer chunking or moving heavy work to workers/main.

## Next links
- `docs/README.md`
- `docs/CODEMAP_INDEX.md`
- `docs/maps/`

