# export (app/main/domains/export)

**Purpose:** Main process code (Electron lifecycle, windows, operating system integration, IPC handlers).

## Code map

**Key files:**

- `index.js`

## Editing guide

- If you are unsure where to edit, start at `docs/00_START_HERE.md`.
- If you touch cross-process messages, read `docs/03_INTER_PROCESS_COMMUNICATION.md` before changing anything.
- Avoid renaming or moving entry files without updating references (Electron config and worker launch paths).

## Notes

- This README is meant to be a **local map** so an editor can orient without hunting across the repo.
