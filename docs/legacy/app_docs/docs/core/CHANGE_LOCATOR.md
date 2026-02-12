# Change Locator — “Where do I change X?”

Use this when you know what you want to change but don’t know where to touch the code.

## IPC / channels / payload helpers

- Contract (channel names + payload helpers): `app/shared/ipc.js`
- Registration (wires channels → implementations): `app/main/ipc/index.js`

## Main-process behavior (real I/O, OS, persistence)

- Domain logic: `app/main/domains/**`
- Storage / persistence plumbing: `app/main/lib/storage.js` (called by domains)
- Worker threads: `app/library_scan_worker.js` and `app/video_scan_worker.js`

## Preload surface (renderer-visible API)

- Main surface + routing: `app/preload/index.js`
- Entrypoint wrapper: `app/preload.js`
- Rule of thumb: keep `window.electronAPI` stable; add legacy alias routes when older renderer code expects them.

## Renderer → main calls

- **Only** here: `app/src/services/api_gateway.js` (exports `window.Tanko.api.*`)
- Renderer UI code should call `Tanko.api.*` and never touch `electronAPI` directly.

## Renderer UI behavior

- Ownership logic: `app/src/domains/**` (library / video / reader / player / shell)
- Runtime state globals: `app/src/state/**` (mirrors into `window.Tanko.state`)
- Compat shims (kept for script order + globals): `app/src/modules/**`
  - If you’re changing behavior, prefer updating the domain file and keep the shim thin.

## Styling / layout

- Main styles: `app/src/styles.css`
- Optional/alternate styles: `app/src/overhaul.css`

## mpv / native bridge

- Native addon (compiled artifact): `app/native/libmpv_bridge/` (do not touch build outputs)
- Main-domain integration: `app/main/domains/mpv/`
- Renderer/player adapter: `app/src/domains/player/`
