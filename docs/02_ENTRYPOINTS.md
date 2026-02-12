# Entrypoints and Boot Flow

This document is a literal map of the first files that execute in each process.

## Main process

1. Electron starts `app/main.js` (from `app/package.json`).
2. `app/main.js` calls `app/main/index.js` with `APP_ROOT`.
3. `app/main/index.js` sets `userData` paths, creates windows, wires Inter Process Communication, and loads the renderer.

## Preload

1. BrowserWindow is created with `preload: app/preload.js`.
2. `app/preload.js` delegates to `app/preload/index.js`.
3. The preload layer registers the bridge API and subscribes to events.

## Renderer

1. `app/src/index.html` loads styles and scripts.
2. Renderer modules initialize state, then request data via the preload bridge.

## Workers

1. Main or renderer triggers scanning.
2. `app/library_scan_worker.js` (or `app/video_scan_worker.js`) is spawned.
3. The worker entry loads the corresponding implementation in `app/workers/*_impl.js`.

Next: `docs/03_INTER_PROCESS_COMMUNICATION.md`.
