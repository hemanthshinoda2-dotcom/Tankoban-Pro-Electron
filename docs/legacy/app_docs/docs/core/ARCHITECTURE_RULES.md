# Tankoban Pro — Architecture Rules (Enforced)

These rules exist to keep main/preload/renderer responsibilities clean and to prevent “drive-by” changes that quietly break IPC or persistence.

## The three invariants (non-negotiable)

1) **IPC channel strings only in `app/shared/ipc.js`.**  
   No other file may contain hardcoded IPC channel names.

2) **`ipcMain.handle/on` registrations only in `app/main/ipc/index.js`.**  
   Main domains implement behavior; the registry wires channels to domains.

3) **Renderer never calls `electronAPI` directly.**  
   Renderer code must call `Tanko.api.*`. The only allowed `window.electronAPI` usage is inside `app/src/services/api_gateway.js`.

## How smoke enforces this

All enforcement is in **`app/tools/smoke_check.js`** and is meant to be fast and deterministic (no Electron launch).

- **IPC string literals scan**: fails if it finds `ipcMain.handle/on(`, `ipcRenderer.invoke/on(...)`, or `webContents.send(` using string literals outside `app/shared/ipc.js`.
- **Single registry scan**: fails if `ipcMain.handle/on` appears anywhere except `app/main/ipc/index.js`.
- **Renderer gateway scan**: fails if `electronAPI.` or `window.electronAPI` appears anywhere except `app/src/services/api_gateway.js`.
- **Preload surface sanity**: checks that preload delegates `app/preload.js` → `app/preload/index.js` and that `electronAPI` is exposed via `contextBridge.exposeInMainWorld('electronAPI', ...)`.
- **Entry file existence**: checks key entrypoints exist (main/preload/index.html/contract).

## What a failure means (and the usual fix)

If smoke fails, it’s almost always one of these:

- You added a new IPC channel string somewhere else. Move the constant/helper to `app/shared/ipc.js`, and reference it from both sides.
- You registered a handler in the wrong place. Move the `ipcMain.handle/on` call into `app/main/ipc/index.js` and delegate into a domain.
- Renderer code touched `electronAPI` directly. Route it through `app/src/services/api_gateway.js` and call it as `Tanko.api.*`.

## Why this matters

These invariants are what keep legacy globals + script-tag ordering stable while still letting the internal structure evolve safely.
