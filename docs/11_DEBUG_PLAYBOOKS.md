# Debug playbooks

This file is for fast diagnosis. It is written for an editor who did not build the system.

If you are lost, start with `docs/maps/README.md` and pick the right map.

## Symptom: video click does nothing

First checks:
- Confirm the click path reaches `openVideo(...)` in `app/src/domains/video/video.js`.
- Confirm `Tanko.api.player.launchQt` exists in the renderer (search `Tanko.api.player` in `app/src/services/api_gateway.js`).
- Confirm the main process handler exists: `app/main/ipc/register/player_core.js`.

What to open:
- Player spawn log: `userData/qt_player_logs/qt_player_spawn.log`
- Session file: `userData/qt_player_sessions/session_<sessionId>.json` (created when the player starts)

Common causes:
- Python is not found by the spawn command.
- The Python player crashed early due to a class indentation mistake (a method accidentally moved out of `PlayerWindow` in `app/player_qt/run_player.py`).
- The main process is blocked and never returns to the renderer.

## Symptom: the Python and Qt player opens twice

First checks:
- Search for double invocation of `openVideo(...)` in `app/src/domains/video/video.js` event bindings.
- In the main process, confirm `launchQt` has a single instance gate (look for `qtLaunching` and `qtPlayerChild` in `app/main/domains/player_core/index.js`).

Common causes:
- A click handler is attached twice after re-render.
- A double click is being treated as two single click actions.

## Symptom: progress does not update while playing

Reality of how it works:
- The Python player writes a JSON file (session progress file).
- The main process polls that file and merges it into `video_progress.json`.
- The renderer listens for the update event and refreshes the user interface.

What to open:
- Python progress writer: `app/player_qt/run_player.py` (method `_write_progress`)
- Main poller: `app/main/domains/player_core/index.js` (functions `__startQtProgressSync` and `__syncProgressFromQtSession`)
- Video progress persistence: `app/main/domains/videoProgress/index.js` (`save` and merge logic)

Common causes:
- The progress file path passed to Python is empty or invalid.
- The main process poll timer is not started.
- The session file writes but the video identifier is missing, so merges do nothing.
- The renderer shows stale state because a cache was not invalidated.

## Symptom: resume starts at the wrong time

First checks:
- Confirm the resume decision is based on the stored max position, not current position.
- Confirm the Python player receives the resume time in the launch arguments.

What to open:
- Renderer: `app/src/domains/video/video.js` (search for `resume` and `startSeconds`)
- Main process: `app/main/domains/player_core/index.js` (argument builder for `--start`)
- Python: `app/player_qt/run_player.py` (argument parser, `--start`)

Common causes:
- A video identifier changed after a scan, so progress is now under a different key.
- A shutdown write wrote position near zero. The player has defensive logic for this, but it can still happen when the process ends abruptly.

## Symptom: show posters do not appear or update late

First checks:
- Confirm the poster get and save calls work: `Tanko.api.videoPoster.get` and `Tanko.api.videoPoster.save`.
- Confirm cache busting is applied after save (search `withPosterRev` in `app/src/domains/video/video.js`).

What to open:
- Poster storage: `app/main/domains/thumbs/index.js` (video poster functions)
- Auto poster generation: `app/main/domains/video/index.js` (auto poster section)
- Video scan pipeline: `docs/05_VIDEO_PIPELINE.md`

Common causes:
- The renderer cached a null poster result. The revision query string exists to break that.
- A file path was created but points to a stale file. Delete the user data poster file and refresh.

## Symptom: scan finishes, but shows or episodes are missing

First checks:
- Confirm the roots are correct and exist on disk.
- Confirm ignore rules are not filtering the folders.

What to open:
- Worker entry: `app/video_scan_worker.js`
- Worker implementation: `app/workers/video_scan_worker_impl.js`
- Saved index: `userData/video_index.json`

Common causes:
- Junction or symlink loops. The worker does cycle protection but deep trees can still be slow.
- The folder is not a direct child of the configured root, so it will not become a show.

## Symptom: application opens, but videos mode cannot scroll

First checks:
- Confirm the scroll container is the element receiving wheel events.
- Confirm a recent layout change did not create a fixed height container without overflow.

What to open:
- Renderer video styles: `app/src/styles/video.css`
- Renderer logic: `app/src/domains/video/video.js`

Common causes:
- A parent container set `overflow: hidden`.
- The content is in a child that is not scrollable.

## Where logs live

- Main process console output shows in the terminal when running via `npm start`.
- Player spawn log: `userData/qt_player_logs/qt_player_spawn.log`
- Video index: `userData/video_index.json`
- Video progress store: `userData/video_progress.json`
