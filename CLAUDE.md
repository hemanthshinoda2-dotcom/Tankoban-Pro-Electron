# Tankoban Pro — Project Guide for Claude

## What is this?

Tankoban Pro is a Windows Electron desktop app for managing and reading manga/comic archives (CBZ/CBR) and video libraries with an integrated MPV-based video player.

## Architecture (four layers)

```
Renderer (app/src/)  →  Preload (app/preload/)  →  Main Process (app/main/)  →  Workers (app/workers/)
                                                         ↕
                                                  Qt Video Player (app/player_qt/)
```

- **Main process** (`app/main/index.js`): App lifecycle, window creation, userData resolution
- **IPC registry** (`app/main/ipc/index.js`): THE ONLY file where `ipcMain.handle`/`on` may be called. Delegates to domain modules.
- **Domains** (`app/main/domains/`): Business logic modules (video, videoProgress, player_core, library, etc.)
- **Preload** (`app/preload/index.js`): Exposes `Tanko.api.*` namespace to renderer via contextBridge
- **Renderer** (`app/src/`): HTML/CSS/JS UI
- **IPC contract** (`app/shared/ipc.js`): Single source of truth for all CHANNEL and EVENT constants
- **Storage** (`app/main/lib/storage.js`): Centralized persistence (atomic JSON writes, debounced writes, dataPath)
- **Qt Player** (`app/player_qt/run_player.py`): Standalone Python/Qt/mpv video player (6000+ lines)

## Video Player

The video player is a **separate Python/Qt process** (not embedded in Electron):
- Built with PySide6 + python-mpv
- Packaged via PyInstaller into `TankobanPlayer.exe`
- Bundled at `resources/player/TankobanPlayer/` in packaged builds
- Communicates with Electron via **file-based progress sync** (session JSON files polled every 500ms)
- Supports standalone operation via OS file associations (launcher mode in `app/main/index.js`)
- Single-instance via QLocalServer; command files for switching videos in a running player

## Key data files (in userData)

- `video_index.json` — Video library index (roots, shows, episodes)
- `video_progress.json` — Per-video playback progress, keyed by videoId
- `library_state.json` — Config (folders, ignored series, video folders)
- `library_index.json` — Comic library index (series, books)
- `progress.json` — Comic reading progress
- `qt_player_sessions/` — Live session files, command files, playlist files

## Commands

- `npm start` — Run in dev mode (from `app/` directory)
- `npm run dist` — Build installer + portable (runs `release:prep` first which builds the Qt player)
- `npm run build:player` — Build TankobanPlayer.exe via PyInstaller
- `npm run validate:player` — Validate player build artifacts
- `npm run smoke` — Run smoke checks (verifies doc paths, etc.)
- `npm run doctor` — Diagnostics tool

## Flow maps

`docs/maps/` contains end-to-end wiring diagrams. Start there when you don't know where something lives. Key maps:
- `MAP_QT_LAUNCH_FLOW.md` — How the Qt player is spawned
- `MAP_PROGRESS_SYNC_FLOW.md` — How progress is synced between player and Electron
- `MAP_VIDEO_FLOW.md` — Video library scanning and state

## Critical patterns

- **Atomic JSON writes**: temp file + rename pattern (both Node.js in `storage.js` and Python in `run_player.py`)
- **Debounced writes**: `writeJSONDebounced()` batches frequent saves (150ms default)
- **Video ID generation**: `SHA1(filePath::fileSize::mtimeMs)` → base64url
- **IPC channels vs events**: Channels are request-response (`ipcMain.handle`), events are push (`webContents.send`)
- **Domain ctx object**: `{ APP_ROOT, win, storage, CHANNEL, EVENT }` passed to all domain handlers

## Code style

- Minimal diffs; match existing style
- Every new feature gets a `BUILD<N>` or `FIX<N>` tag in comments for traceability
- Extensive try/catch wrapping — failures should degrade gracefully, never crash
- The Qt player's class indentation is critical — misaligned methods break signal connections
- Entry point for the Qt player must stay: `if __name__ == "__main__": raise SystemExit(main())`

## Don't

- Don't add docstrings/comments/type annotations to code you didn't change
- Don't refactor surrounding code when fixing a bug
- Don't create new files unless absolutely necessary
- Don't modify `app/shared/ipc.js` without updating both main and preload
- Don't use interactive git flags (`-i`)
- Don't skip pre-commit hooks (`--no-verify`)
