# Renderer domains map

## Owns
- Domain-driven UI code: library, reader, video, player, shell/navigation.

## Does not own
- Anything not listed above. If you’re unsure, jump to `docs/MUSEUM_TOUR.md`.

## Entry points
- Start with `docs/maps/` then open the domain folder you need.
- Video: `app/src/domains/video/`
- Player: `app/src/domains/player/`
- Library: `app/src/domains/library/`

## How to inspect fast
- Search for `TRACE:` to follow the execution spine.
- If you’re editing inter-process communication, start from `app/shared/ipc.js` and then go to `app/main/ipc/`.

## Safe edit zones
- Each domain folder should have its own README and map links.
- Keep pure transforms in `*_utils.js` or `*_selectors.js` where possible.

## Danger zones
- Avoid cross-domain imports through globals unless documented. Keep contracts explicit.

## Next links
- `docs/README.md`
- `docs/CODEMAP_INDEX.md`
- `docs/maps/`

