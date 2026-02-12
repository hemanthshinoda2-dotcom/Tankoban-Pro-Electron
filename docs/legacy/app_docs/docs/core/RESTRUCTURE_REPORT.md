# Tankoban Pro — Restructure Report (Final)

This is the up-to-date map of the repo layout and ownership boundaries. If you’re making changes, read **START_HERE.md** first, then use this file to orient yourself.

## Key entrypoints

- **Main boot:** `app/main.js` → `app/main/index.js`
- **IPC registry:** `app/main/ipc/index.js`
- **Preload entry:** `app/preload.js` → `app/preload/index.js`
- **Renderer entry:** `app/src/index.html` (classic script tags)
- **IPC contract:** `app/shared/ipc.js`
- **Smoke enforcement:** `app/tools/smoke_check.js`

## Final folder map (ownership)

```text
app/
  build/                  (icons/artifacts)
  main/
    index.js              (main wiring)
    ipc/index.js          (the only ipcMain registry)
    domains/              (main-side logic)
    lib/storage.js         (persistence plumbing used by domains)
  preload/
    index.js              (contextBridge surface + legacy aliases)
  shared/
    ipc.js                (IPC contract: channels + helpers)
  src/
    index.html            (script-tag load order)
    services/api_gateway.js (Tanko.api gateway; only electronAPI caller)
    domains/              (renderer logic by ownership)
    state/                (renderer runtime state globals)
    modules/              (compat shims kept for script order + legacy globals)
    styles.css, overhaul.css
  native/
    libmpv_bridge/         (native addon; build outputs must not be touched)
  tools/
  workers/               (worker impls; entries remain stable)
    library_scan_worker_impl.js
    video_scan_worker_impl.js
  library_scan_worker.js  (wrapper entry; kept for legacy paths)
  video_scan_worker.js    (wrapper entry; kept for legacy paths)
    smoke_check.js        (fast structural enforcement)
```

## Renderer organization (script tags + shims)

Renderer still loads **`app/src/modules/**`** via script tags to preserve global timing and legacy surfaces. Those files are intentionally thin and delegate into the real implementations:

- Real renderer implementations live under **`app/src/domains/**`** and **`app/src/state/**`**.
- State is global (no imports) and is mirrored under `window.Tanko.state`.
- Renderer-to-main calls go through `Tanko.api.*` (see `app/src/services/api_gateway.js`).

## Invariants

The repo relies on a small set of structural rules to avoid accidental breakage. The authoritative write-up is **ARCHITECTURE_RULES.md**.

- IPC strings only in `app/shared/ipc.js`
- ipcMain registrations only in `app/main/ipc/index.js`
- renderer never calls `electronAPI` directly (only `app/src/services/api_gateway.js`)

## Related docs

- `app/START_HERE.md` — single “how to change things safely” guide
- `app/ARCHITECTURE_RULES.md` — enforced invariants + how smoke checks them
- `app/CHANGE_LOCATOR.md` — quick “go here for X” map
- `app/TESTING_GOLDEN_PATHS.md` — minimal manual regression checklist
- `app/DOCS_CLEANUP_REPORT.md` — what docs were removed and why