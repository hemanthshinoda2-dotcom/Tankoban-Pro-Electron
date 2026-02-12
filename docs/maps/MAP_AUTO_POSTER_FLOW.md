# Map: auto poster generation for shows

This map covers the “show poster” feature used in the video library tiles.

```mermaid
flowchart TD
  A[Video scan finishes] --> B[Main process: app/main/domains/video/index.js<br/>post-scan hook]
  B --> C{Show has a folder poster image?}
  C -- yes --> D[Use folder poster path as thumbPath]
  C -- no --> E{User poster already saved in user data?}
  E -- yes --> F[Use user data poster file]
  E -- no --> G[Pick a candidate episode file]
  G --> H{Bundled mpv.exe available?}
  H -- no --> I[Skip auto poster (best-effort)]
  H -- yes --> J[Spawn mpv.exe to capture a frame]
  J --> K[Write userData/video_posters/<showId>.jpg]
  K --> L[Update in-memory index thumbPath]
  L --> M[Renderer asks for poster URL<br/>Tanko.api.videoPoster.get(showId)]
  M --> N[Main process: thumbs domain returns file:// URL]
  N --> O[Renderer cache busts with revision query<br/>withPosterRev(...) and refreshes tiles]
```

Notes:
- This is best-effort and capped per scan.
- See `docs/05_VIDEO_PIPELINE.md` for the scan pipeline and this post-scan step.
