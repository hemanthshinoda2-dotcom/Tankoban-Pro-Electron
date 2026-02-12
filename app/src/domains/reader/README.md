# reader (app/src/domains/reader)

**Purpose:** Renderer code (user interface, browser-side logic, styles).

## Code map

**Key files:**

- `bitmaps.js`
- `boot.js`
- `hud_core.js`
- `input_keyboard.js`
- `input_pointer.js`
- `mega_settings.js`
- `open.js`
- `render_core.js`
- `render_portrait.js`
- `render_two_page.js`
- `state_machine.js`
- `volume_nav_overlay.js`

## Editing guide

- If you are unsure where to edit, start at `docs/00_START_HERE.md`.
- If you touch cross-process messages, read `docs/03_INTER_PROCESS_COMMUNICATION.md` before changing anything.
- Avoid renaming or moving entry files without updating references (Electron config and worker launch paths).

## Notes

- This README is meant to be a **local map** so an editor can orient without hunting across the repo.
