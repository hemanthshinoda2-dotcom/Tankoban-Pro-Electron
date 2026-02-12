# videoProgress domain (app/main/domains/videoProgress)

This domain owns persistent playback progress for videos.

## Responsibilities

- Save and load progress per video identifier
- Merge updates from the Python and Qt player session file
- Provide “Continue Watching” inputs to the renderer

## Key file

- `index.js`

## Persistence (user data)

- `video_progress.json`

## Related docs and maps

- `docs/07_STATE_AND_PERSISTENCE.md`
- `docs/maps/MAP_PROGRESS_SYNC_FLOW.md`
