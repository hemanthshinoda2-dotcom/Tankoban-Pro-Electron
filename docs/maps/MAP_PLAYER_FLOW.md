# MAP_PLAYER_FLOW — Playback wiring (HTML video vs Detached Qt player)

This map explains **what plays the video** and where the wiring lives.

---

## Path 1 — HTML `<video>` element (native browser playback)

- Owned by Renderer.
- Used for lightweight previews or as a basic fallback when the Qt player is unavailable.

Relevant files:
- Renderer video domain: `app/src/domains/video/video.js` (look for `videoEl`)

---

## Path 2 — Detached Python/Qt player (primary)

- Electron renders the library and controls.
- Playback happens in a **separate Python/Qt process** (`app/player_qt/`).
- The Electron window may hide/restore to keep the experience “single app”.

Relevant files:
- Player process: `app/player_qt/run_player.py` (+ `PlayerWindow`)
- Main orchestration: `app/main/domains/player_core/`
- Renderer launch calls + progress merge: `app/src/domains/video/video.js`

Notes:
- Embedded mpv / canvas / native bridge code is intentionally **not part of this repo line**.

