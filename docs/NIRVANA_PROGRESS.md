# Nirvana Progress

This is the “what’s actually true right now” tracker.

If you’re editing the build, this file answers: **what is enforced automatically** vs **what is still discipline-only**.

## Current state (Build 110 packaged)

### ✅ Enforced by smoke

These are checked by `npm run smoke` (run from `app/`):

- **Flow maps point to real files** (`app/tools/verify_maps.js`)
- **Minimum TRACE coverage exists** (`app/tools/verify_trace.js`)
- **Renderer script load order hasn’t broken** (`app/tools/verify_renderer_load_order.js`)

### ✅ Structural wins already in place

- IPC registrations are grouped under `app/main/ipc/register/*` and orchestrated from `app/main/ipc/index.js`.
- IPC channel/event strings are centralized in `app/shared/ipc.js`.
- Worker logic is in `app/workers/*_impl.js` (stable wrappers remain at `app/*_scan_worker.js`).

### 🟡 Still “convention” (recommended, not enforced)

- “No raw string channel names” outside `app/shared/ipc.js` (goal: fully enforce).
- Full TRACE coverage everywhere (`TRACE:UI_CLICK`, `TRACE:WORKER_*`, `TRACE:PERSIST_WRITE` in all write paths).
- Payload examples for the top 10 IPC calls.

### Next best upgrades (highest return)

1) **Enforce IPC string bans** (scan for `ipcRenderer.invoke('...')` and `ipcMain.handle('...')`).
2) **Finish TRACE spine** for the remaining boundary points.
3) **Split remaining elephants** (mpv domain, shell core) only after (1) and (2) to reduce risk.
