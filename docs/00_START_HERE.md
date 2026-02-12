# Start Here

If you want a full end-to-end walkthrough, go to `docs/MUSEUM_TOUR.md` and pick the trace map for your area.

## What this repository is

Assumptions: Windows only. Python is installed.

Tankoban Pro is an Electron application with:

- a main process in `app/main/`
- a preload bridge in `app/preload/`
- a renderer in `app/src/`
- worker threads for scanning in `app/library_scan_worker.js` and `app/video_scan_worker.js`
- shared contracts in `app/shared/`

For video playback, current builds launch a detached Tankoban player window using Python + Qt (`app/player_qt/`), orchestrated by Player Core in the main process.

## The one rule that prevents most breakage

Do not change stable entry file paths unless you also update every reference to them.

The sensitive entry files are:

- `app/main.js`
- `app/preload.js`
- `app/src/index.html`
- `app/library_scan_worker.js`
- `app/video_scan_worker.js`

Next: `docs/01_ARCHITECTURE_OVERVIEW.md`.
