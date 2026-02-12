# Testing — Golden Paths (Manual)

This is the minimal “did we break anything obvious?” checklist after changes. It’s intentionally short.

## App launch

- Start the app normally.
- Expected: window opens to the library view, no obvious console errors.

## OS open + drag & drop

- With the app already open, open a .cbz/.cbr from the OS (Open With / double-click).
- Drag a .cbz/.cbr onto the window.
- Expected: existing window focuses and the book opens; no second instance stays running.

## Library scan

- Start a library scan (Ctrl+R).
- Cancel it.
- Expected: progress UI behaves normally; cancel stops quickly; no crash.

## Video scan

- Start a video scan (whatever UI trigger you use today).
- Cancel it.
- Expected: status events keep updating and cancel doesn’t wedge the UI.

## Thumbnails spot check

- Confirm at least one library item and one video item show a thumbnail (or the same placeholder behavior as before).

## Progress + settings persistence

- Open a book, move to a distinct page, then close the app.
- Re-open and verify it resumes the same way it did before.
- Change a setting, close the app, re-open.
- Expected: both progress and settings persist with the same cadence/semantics as before.

## Reader navigation sanity

- Basic navigation still feels identical (page turns, HUD toggle, overlays).

## Video playback sanity

- Open a video and verify play/pause/seek works.
- If mpv is used in your setup: switch to mpv engine and confirm playback starts and the surface stays aligned while resizing.
