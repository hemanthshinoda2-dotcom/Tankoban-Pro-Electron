# Qt player integration (current path)

Tankoban Pro plays videos by launching a separate Python and Qt window. The Electron window hides during playback and restores on exit, so it feels like one application.

Embedded canvas playback is not used in this repository line.

## What happens when you click a video

1) Renderer requests playback by calling `Tanko.api.player.launchQt(...)`.
2) Preload forwards the call to the main process over the `player:launchQt` Inter Process Communication channel.
3) The player core domain starts the Python and Qt player (`app/player_qt/run_player.py`) or a bundled player executable if present.
4) The player writes progress into a JSON session file under Electron user data.
5) The main process polls that session file and merges it into the app progress store.
6) On player exit, the main Electron window is restored and return state is applied.

## Where to look in code

- Renderer click path: `app/src/domains/video/video.js` (search for `openVideo(` and `Tanko.api.player.launchQt`)
- Renderer gateway: `app/src/services/api_gateway.js`
- Preload bridge: `app/preload/index.js`
- Channel contract: `app/shared/ipc.js`
- Main launcher and sync: `app/main/domains/player_core/index.js`
- Main Inter Process Communication registration: `app/main/ipc/register/player_core.js`
- Player code: `app/player_qt/run_player.py`

## Logs and files

- Player spawn log: `userData/qt_player_logs/qt_player_spawn.log`
- Player session progress file: `userData/qt_player_sessions/session_<sessionId>.json`
- Video progress store: `userData/video_progress.json`

## Maps

- `docs/maps/MAP_QT_LAUNCH_FLOW.md`
- `docs/maps/MAP_PROGRESS_SYNC_FLOW.md`
