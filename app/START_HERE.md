# Tankoban Pro — Start Here

If you are changing this repository, start here. This is the one document that should stay accurate.

## What runs where

Main boot: `app/main.js` → `app/main/index.js`  
Owns windows, persistence, scan workers, and the player launch flow.

Main process to renderer process messaging registry: `app/main/ipc/index.js`  
The only place `ipcMain.handle` and `ipcMain.on` registrations are allowed.

Main process domains: `app/main/domains/`  
Each domain owns one slice (library, video, progress, player core, window, and so on).

Preload bridge: `app/preload.js` → `app/preload/index.js`  
Exposes a small surface to the renderer: `window.electronAPI`.

Renderer: `app/src/index.html`  
Classic script tags and globals. No direct Node.js access.

Renderer gateway: `app/src/services/api_gateway.js`  
Defines `window.Tanko.api.*` and is the only allowed caller of `window.electronAPI`.

Channel contract: `app/shared/ipc.js`  
The only place channel strings should live.

## Video playback (current truth)

Embedded canvas playback is not part of this repository line.

When a user plays a video:
- Renderer calls `Tanko.api.player.launchQt(...)`.
- Main process launches `app/player_qt/run_player.py` (Python is assumed to be installed).
- The main window may hide during playback and is restored on exit.
- Progress is written into session files under the Electron user data folder and synced into the main app progress store.

mpv is still used in one place: auto poster extraction for shows that do not have a folder poster image (command line use only).

## The safe path for any change

1) Add or adjust a constant in `app/shared/ipc.js` (if the change crosses processes).
2) Implement behavior in `app/main/domains/<domain>/`.
3) Register the handler in `app/main/ipc/index.js`.
4) Expose the call in `app/preload/index.js`.
5) Wrap it in `app/src/services/api_gateway.js`.
6) Call it from renderer code as `Tanko.api.*`.

## What not to do

Do not bypass structure:
- Channel strings must stay in `app/shared/ipc.js`.
- Main process handlers must stay in `app/main/ipc/`.
- Renderer should not call `window.electronAPI` directly.

See:
- `docs/01_ARCHITECTURE_OVERVIEW.md`
- `docs/03_INTER_PROCESS_COMMUNICATION.md`
- `DANGER_ZONES.md`

## Smoke check

From the `app/` folder:

```bash
npm run smoke
```

## Operating system assumption

This repository line targets Windows only.

Quick run (Windows): run `install_and_run.bat` in the repository root.
