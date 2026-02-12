# Architecture Overview

Tankoban Pro is an Electron application with a strict separation between four layers.

## 1) Main process (`app/main/`)

Owns the application lifecycle, window creation, file system access that should not run in the renderer, and the server side of the Inter Process Communication handlers.

Entry:
- `app/main.js` delegates to `app/main/index.js`.

## 2) Preload bridge (`app/preload/`)

The preload layer exposes a small, explicit API to the renderer. This is where you keep the boundary tight.

Entry:
- `app/preload.js` delegates to `app/preload/index.js`.

## 3) Renderer (`app/src/`)

The user interface. It should not directly access Node.js APIs.

Entry:
- `app/src/index.html` loads the renderer scripts.

## 4) Workers (`app/workers/`)

Long-running scans and indexing work runs off the user interface thread.

Entries:
- `app/library_scan_worker.js`
- `app/video_scan_worker.js`

Implementation files:
- `app/workers/library_scan_worker_impl.js`
- `app/workers/video_scan_worker_impl.js`

## Contracts that must remain stable

- `app/shared/ipc.js` defines event and channel names.
- Any function exposed from preload to renderer is part of a public interface.

Next: `docs/02_ENTRYPOINTS.md`.
