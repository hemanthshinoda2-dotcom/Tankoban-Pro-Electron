# Flow maps (docs/maps)

These files are the repo’s "wiring diagrams" — they tell you, end-to-end, how a user action travels:

**UI (renderer) → preload bridge → IPC channel → main handler → domain/workers → persistence → UI update**

If you’re an AI editor, treat these as the *first stop* when you don’t know where something lives.

## Maps available

- `MAP_LIBRARY_FLOW.md`
- `MAP_READER_FLOW.md`
- `MAP_VIDEO_FLOW.md`
- `MAP_PLAYER_FLOW.md`
- `MAP_PERSISTENCE_FLOW.md`
- `MAP_QT_LAUNCH_FLOW.md`
- `MAP_PROGRESS_SYNC_FLOW.md`
- `MAP_AUTO_POSTER_FLOW.md`

## Non-negotiable rules (prevents doc drift)

1) **Never reference a file that doesn’t exist.**
   - `npm run smoke` verifies map paths.

2) **Use exact file paths whenever possible.**
   - If you must use a pattern, make it explicit (example: `app/main/domains/video/*`).

3) **Every IPC hop must name the constant, not the raw string.**
   - Channels/events live in: `app/shared/ipc.js`

4) **Each map must include at least one “how to find it fast” token.**
   - Example: `Search: TRACE:IPC_OUT` or `Search: FIND_THIS:`.

## How to update a map (fast)

- Step 1: Identify the user-facing action (button, menu item, keyboard shortcut).
- Step 2: Locate the renderer call site.
- Step 3: Follow the IPC channel constant into `app/main/ipc/`.
- Step 4: Write down the persistence touchpoints (files/keys) and any broadcast events.
- Step 5: Run `npm run smoke` to ensure the map still points to real paths.

## Folder conventions used in maps

- **Renderer:** `app/src/**`
- **Preload:** `app/preload/**`
- **Main:** `app/main/**`
- **IPC contract:** `app/shared/ipc.js`
- **Workers:** stable wrappers in `app/*_scan_worker.js` → logic in `app/workers/*_impl.js`
