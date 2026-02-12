# video domain (app/main/domains/video)

This domain owns the video library data model.

## Responsibilities

- Manage video roots (configured folders)
- Run and coordinate video scanning (via worker)
- Maintain the video index (shows, seasons, episodes)
- Best-effort auto poster generation for shows (uses mpv as a command line tool)
- Provide read and write operations for the renderer video library

## Key file

- `index.js`

## Persistence (user data)

- `video_index.json` — scan output index
- `video_roots.json` — configured roots

Auto poster output:
- `video_posters/<showId>.jpg` (best-effort)

## Related docs and maps

- `docs/05_VIDEO_PIPELINE.md`
- `docs/maps/MAP_VIDEO_FLOW.md`
- `docs/maps/MAP_AUTO_POSTER_FLOW.md`
