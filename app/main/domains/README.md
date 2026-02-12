# domains (app/main/domains)

This folder is main process logic, split into small domains. Each domain owns one slice of behavior.

If you are unsure where to edit, start at `app/START_HERE.md` and `docs/00_START_HERE.md`.

## What is in here

Folders:

- `archives/` — comic archive import and extraction helpers
- `clipboard/` — clipboard read and write and paste helpers
- `comic/` — comic reader domain and persistence hooks
- `export/` — export utilities
- `files/` — file system helpers used by multiple domains
- `library/` — comic library roots, scanning orchestration, library state
- `player_core/` — detached Python and Qt player launch, hide and restore, and progress sync
- `progress/` — shared progress utilities (comics and videos)
- `seriesSettings/` — per series settings and persistence
- `shell/` — mode switching and top-level app shell state
- `thumbs/` — thumbnail and poster storage and caching
- `video/` — video library state, folder navigation, scan orchestration, auto poster generation
- `videoProgress/` — video progress storage and merges
- `videoSettings/` — video preference persistence (audio track, subtitle track, and related)
- `videoUi/` — video user interface state persistence (panels, toggles, last selections)
- `window/` — window creation and window state persistence

Standalone file:

- `folder_thumbs.js` — experimental folder thumbnail generator (not wired into the current scan and user interface flow)

## Notes

- Embedded mpv and canvas playback folders were removed in this repository line.
- mpv is still used as a command line tool for auto poster generation (see `video/`).

See also:
- `docs/05_VIDEO_PIPELINE.md`
- `docs/maps/MAP_VIDEO_FLOW.md`
- `docs/maps/MAP_AUTO_POSTER_FLOW.md`
