# Styles map

## Owns
- Global styling and theme variables (Noir theme).

## Does not own
- Anything not listed above. If you’re unsure, jump to `docs/MUSEUM_TOUR.md`.

## Entry points
- Primary stylesheet: `app/src/styles/overhaul.css`

## How to inspect fast
- Search for `TRACE:` to follow the execution spine.
- If you’re editing inter-process communication, start from `app/shared/ipc.js` and then go to `app/main/ipc/`.

## Safe edit zones
- Theme tweaks: edit CSS variables first.
- Component tweaks: keep selectors narrow; prefer domain-scoped classes.

## Danger zones
- Don’t rename global classes casually; UI scripts may query them.

## Next links
- `docs/README.md`
- `docs/CODEMAP_INDEX.md`
- `docs/maps/`

