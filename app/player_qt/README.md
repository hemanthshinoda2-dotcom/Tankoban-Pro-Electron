# Python and Qt player (app/player_qt)

This folder contains the detached video player used by the video library.

The Electron application launches this player as a separate process. The main window can hide during playback and restore on exit.

Embedded canvas playback is not used in this repository line.

## Key file

- `run_player.py` — the player

## Dependencies

Install once:

```bash
pip install -r requirements.txt
```

Notes:
- The `python-mpv` package needs access to mpv dynamic libraries.
- The Electron launcher sets `TANKOBAN_MPV_DLL_DIR` when it has a bundled mpv folder available.

## Maintainer build contract

Use `build_player.bat` for release builds. It now performs:

1. Preflight checks for Python launcher availability and Python version (3.10+).
2. Tooling checks for `pip` and `pyinstaller` inside `.venv_build`.
3. PyInstaller `--onedir` build.
4. Post-build artifact validation for:
   - `dist\TankobanPlayer\TankobanPlayer.exe`
   - `dist\TankobanPlayer\_internal\*.dll`
   - `dist\TankobanPlayer\_internal\*.pyd`

If any required artifact is missing, the script fails fast with an explicit error message.

## How the player is launched

The main process builds a command like this (example):

```bash
py -3 run_player.py --file "<video>" --start 0 --session "<sessionId>" --progress-file "<path>"
```

Common launch arguments:

- `--file` (required) — video file path
- `--start` — resume time in seconds
- `--session` — session identifier used for file names
- `--progress-file` — absolute path of the JSON session progress file
- `--video-id` — stable identifier used by the library progress store
- `--show-id` — show identifier used by the library user interface
- `--playlist-file` — optional playlist file
- `--playlist-index` — which playlist entry to start from
- `--command-file` — optional path to a command file used for single-instance forwarding
- `--show-root` — optional show folder path
- `--pref-aid`, `--pref-sid`, `--pref-sub-visibility` — initial track preferences
- `--fullscreen` — start in fullscreen

## How progress sync works

- The player writes a JSON progress record to the progress file (`--progress-file`).
- The Electron main process polls that file and merges it into `video_progress.json`.

See:
- `docs/maps/MAP_PROGRESS_SYNC_FLOW.md`
- `app/main/domains/player_core/README.md`

## Very important: indentation and class methods

The player window class is `PlayerWindow`.

If a method accidentally moves out of the class (indentation error), signal connections like `.connect(self._show_context_menu)` can crash the player immediately.

When editing `run_player.py`, always confirm that:
- `_show_context_menu` exists
- It is inside the `PlayerWindow` class
- The entry point line stays exactly one line and unchanged:
  `if __name__ == "__main__": raise SystemExit(main())`
