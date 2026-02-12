# player_core domain (app/main/domains/player_core)

This domain owns video playback orchestration.

Video playback is done by launching a detached Python and Qt process. The Electron main window can hide during playback and restore when the player exits.

## Main responsibilities

- Spawn the Python and Qt player (`app/player_qt/run_player.py`)
- Enforce a single player process
- Forward “open file” commands to an already running player
- Sync progress from the player session file into the app progress store
- Save and restore return state so the app feels seamless

## Public functions (exports)

- `launchQt(ctx, event, args)`
  - The main entry point from the renderer.
  - Builds the spawn arguments.
  - Starts progress syncing.
- `qtIsRunning()`
- `qtSendOpen(ctx, event, args)`
  - Used when the player is already running.
  - Writes a small command JSON into `userData/qt_player_sessions/`.
- `saveReturnState(ctx, event, payload)`
- `getReturnState(ctx)`
- `clearReturnState(ctx)`
- `health(ctx)`

## User data files

- `qt_player_sessions/session_<sessionId>.json`
  - Progress session file written by Python.
- `qt_player_sessions/cmd_<sessionId>_<timestamp>.json`
  - Command file written by Electron when forwarding an open request.
- `qt_player_logs/qt_player_spawn.log`
  - Spawn output and Python logs.
- `video_progress.json`
  - Main progress store (merged from the session file).
- `return_state.json`
  - Saved view state for “hide main window, play video, restore view”.

## Progress sync

Progress sync is polling based.

- Timer start: `__startQtProgressSync(ctx)`
- Read and merge: `__syncProgressFromQtSession(ctx)`
- Persist: `app/main/domains/videoProgress/index.js`

## What breaks easily

- The Python player can crash immediately if a method moves out of the `PlayerWindow` class due to indentation.
- If `session_<sessionId>.json` stops updating, progress will not update in the library.
- If single-instance gates are removed, double launches can happen.

See:
- `docs/maps/MAP_QT_LAUNCH_FLOW.md`
- `docs/maps/MAP_PROGRESS_SYNC_FLOW.md`
