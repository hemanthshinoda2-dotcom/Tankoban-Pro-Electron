# Map: progress sync from Python player to the library

This map shows how “Continue Watching” and resume points update while the video is still playing.

```mermaid
flowchart TD
  A[Python and Qt player is playing] --> B[Python: app/player_qt/run_player.py<br/>PlayerWindow._write_progress]
  B --> C[Atomic write JSON session file<br/>userData/qt_player_sessions/session_<sessionId>.json]

  C --> D[Main process poller<br/>app/main/domains/player_core/index.js<br/>__startQtProgressSync]
  D --> E{File modified time changed?}
  E -- no --> D
  E -- yes --> F[Read session JSON]
  F --> G[Normalize and validate fields]
  G --> H[Save progress<br/>app/main/domains/videoProgress/index.js]
  H --> I[Persist to user data<br/>video_progress.json]
  H --> J[Emit update event to renderer<br/>CHANNEL.VIDEO_PROGRESS_UPDATED]
  J --> K[Renderer refreshes “Continue Watching” and tiles<br/>app/src/domains/video/video.js]
```

## Session JSON schema (written by Python)

`session_<sessionId>.json` fields (common keys):

- `videoId`: string
- `showId`: string
- `sessionId`: string
- `position`: number (seconds)
- `duration`: number (seconds)
- `maxPosition`: number (seconds)
- `watchedTime`: number (seconds)
- `finished`: boolean
- `timestamp`: number (unix seconds)
- `phase`: string (examples: periodic, close, eof)

Track preference carry fields (best-effort):
- `aid`: audio track identifier
- `sid`: subtitle track identifier
- `subVisibility`: boolean
