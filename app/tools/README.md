# Tools map

## Owns
- Developer tooling used by smoke checks and doc verification.

## Does not own
- Anything not listed above. If you’re unsure, jump to `docs/MUSEUM_TOUR.md`.

## Entry points
- Smoke runner: `app/tools/smoke_check.js`
- Map verifier: `app/tools/verify_maps.js`
- Trace verifier: `app/tools/verify_trace.js`
- Renderer load-order verifier: `app/tools/verify_renderer_load_order.js`

## How to inspect fast
- Search for `TRACE:` to follow the execution spine.
- If you’re editing inter-process communication, start from `app/shared/ipc.js` and then go to `app/main/ipc/`.

## Safe edit zones
- If you add new maps or TRACE conventions, update verifiers here.

## Danger zones
- Keep tools Node-only and dependency-light.

## Next links
- `docs/README.md`
- `docs/CODEMAP_INDEX.md`
- `docs/maps/`

