# Map: Python and Qt player launch

This map shows the current video playback path: detached Python and Qt player.

```mermaid
flowchart TD
  A[User clicks a video tile] --> B[Renderer: app/src/domains/video/video.js<br/>openVideo(...)]
  B --> C[Renderer gateway: app/src/services/api_gateway.js<br/>Tanko.api.player.launchQt]
  C --> D[Preload: app/preload/index.js<br/>window.electronAPI.invoke]
  D --> E[Channel contract: app/shared/ipc.js<br/>CHANNEL.PLAYER_LAUNCH_QT]
  E --> F[Main process handler: app/main/ipc/register/player_core.js]
  F --> G[Domain: app/main/domains/player_core/index.js<br/>launchQt(...)]

  G --> H{Existing player process running?}
  H -- yes --> I[Write command file to user data<br/>qt_player_sessions/cmd_*.json]
  I --> J[Return ok to renderer]

  H -- no --> K[Build spawn arguments<br/>--file, --start, --progress-file, --video-id, --show-id]
  K --> L[Spawn Python process<br/>app/player_qt/run_player.py]
  L --> M[Optional: hide main Electron window]
  M --> N[Start progress sync timer in main process]

  N --> O[Poll session progress file<br/>userData/qt_player_sessions/session_*.json]
  O --> P[Merge to video progress store<br/>userData/video_progress.json]
  P --> Q[Emit update event to renderer<br/>CHANNEL.VIDEO_PROGRESS_UPDATED]

  L --> R{Python process exits}
  R --> S[Stop progress sync timer]
  S --> T[Restore main Electron window + return state]
```

Notes:
- Debug log: `userData/qt_player_logs/qt_player_spawn.log`
- Return state file: `userData/return_state.json`
