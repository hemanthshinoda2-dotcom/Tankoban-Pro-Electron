# AI Change Playbook

Use this when editing Tankoban Pro with another AI model.

## Delivery format (required)

When you change files, you must output full file replacements.

Rules:
- Each changed file must be shown in full.
- Precede each file with its repository path as a plain line.
- Do not output patches, diffs, or “only the changed parts”.
- Do not split a single file across multiple responses unless it is too large to fit.

## Documentation upkeep (required)

This repository is treated as a living system: the documentation must match the code.

After any change:
- Update the relevant map in `docs/maps/` (or add a new one).
- Update `docs/README.md` if a document was added, removed, or renamed.
- Update `app/START_HERE.md` if runtime behavior or cross-boundary flow changed.
- Update `DANGER_ZONES.md` if you touched a brittle area or created a new one.

## The 30-second approach
1. Start at `MUSEUM.md`.
2. Pick the right domain map in `docs/maps/`.
3. Search for `TRACE:` markers to follow the boundary hops.
4. Make the smallest possible change inside the owning module.
5. Run `npm run smoke` (required).
6. Update the relevant map + `docs/NIRVANA_PROGRESS.md` if structure changed.

## Where to look first
- UI weirdness: `app/src/domains/shell/core.js` + the relevant domain file.
- IPC missing: `app/shared/ipc.js` (channel) then `app/main/ipc/register/*`.
- Persistence bug: `app/main/lib/storage.js` + the domain that writes.
- Scan / indexing: `app/workers/*_impl.js`.

## Non-negotiable rules
- Do not introduce string literal IPC channels (use constants from `app/shared/ipc.js`).
- Do not register IPC outside `app/main/ipc/`.
- Keep renderer script load order valid (smoke check verifies it).
