# Refactoring Nirvana Checklist (what “10/10” means here)

This repo is aiming for one outcome: **small changes stay small** because the codebase is hard to misread.

Each item is tagged as:
- ✅ **ENFORCED** — `npm run smoke` fails if you break it
- 🟡 **CONVENTION** — expected style, but not automatically validated (yet)
- ⏳ **TODO** — desired but not implemented

## 1) Navigation + “you can’t get lost” docs

- ✅ Root has a single front door (`MUSEUM.md`) and it points to the docs index.
- ✅ Major folders contain local `README.md` maps (see `app/README.md`, `app/main/README.md`, etc.).
- ✅ Flow maps live in `docs/maps/` and are path-verified (see verifier: `app/tools/verify_maps.js`).
- 🟡 Each folder README should include: owns / does-not-own / entrypoints / danger zones / next links.

## 2) Contracts (IPC names + payload expectations)

- ✅ All IPC channel and event strings live in `app/shared/ipc.js`.
- 🟡 No raw string channel names outside that file (goal: enforce this everywhere).
- 🟡 Each channel/event has a short payload note right next to it.

## 3) Traceable boundary spine (searchable)

- ✅ Minimum TRACE markers are enforced by `app/tools/verify_trace.js`.
- 🟡 Full coverage target:
  - `TRACE:UI_CLICK` at renderer click points
  - `TRACE:IPC_OUT` at invoke/send points
  - `TRACE:IPC_IN` at main registrations
  - `TRACE:WORKER_IN/OUT` around worker message boundaries
  - `TRACE:PERSIST_WRITE` at write boundaries

## 4) Big-file decomposition

- ✅ IPC registrations are split into `app/main/ipc/register/*.js` for readability.
- 🟡 Target structure for “elephant files”:
  - entry (wiring only)
  - handlers (IPC only)
  - service (business logic)
  - store (state + persistence)
  - selectors (pure transforms)

## 5) Self-verifying build

- ✅ `npm run smoke` exists and is expected after any change.
- ✅ Smoke validates:
  - map references (docs/maps → real paths)
  - TRACE minimum coverage
  - renderer load-order constraints

See: `app/tools/smoke_check.js` for the exact checks.

## 6) Change playbook

- ✅ `docs/AI_CHANGE_PLAYBOOK.md` is the single “how to make a change safely” procedure.
- 🟡 Every significant change should update:
  - relevant flow map(s)
  - relevant folder README(s)
  - `docs/NIRVANA_PROGRESS.md`
