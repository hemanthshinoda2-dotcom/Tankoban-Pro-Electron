# AI Inspection Chunk Map

This file splits the app into small, reviewable chunks for AI-assisted inspection.

For each chunk, ask the AI to do exactly:
1) List mechanisms in the chunk (UI, UX, logic, state, IPC, persistence).
2) Identify shortcomings and underdeveloped mechanisms.
3) Propose and implement fixes only inside the chunk boundary (unless a dependency is explicitly included).

## Review Sequence (recommended)

Start with these first because they match current pain points:
- `C12` video sidebar + show actions
- `C13` video show explorer/back behavior
- `C19` main video domain + video scan worker
- `C01` IPC chain (contract -> preload -> gateway -> register)

Then continue in order.

## Chunks

### C01 - IPC Contract And Bridge Chain
- Scope:
  - `shared/ipc.js`
  - `preload/index.js`
  - `src/services/api_gateway.js`
  - `main/ipc/register/*.js`
- Why isolated: Most UI bugs that "call works in one place but not another" are bridge mismatches.
- Inspect focus: Channel parity, argument shape parity, return shape parity, missing wrappers.
- Example signals:
  - A method exists in preload/register but not in gateway.
  - Renderer calls method names that are not exposed through `Tanko.api.*`.

### C02 - Main Boot, Window Lifecycle, File Association
- Scope:
  - `main/index.js`
  - `main/domains/window/index.js`
  - `main/domains/shell/index.js`
- Why isolated: Startup mode, single-instance behavior, and window restore are easy to regress.
- Inspect focus: Open-with flow, player-launcher mode, window show/focus/restore rules.

### C03 - Persistence Foundation
- Scope:
  - `main/lib/storage.js`
  - `main/domains/progress/index.js`
  - `main/domains/videoProgress/index.js`
  - `main/domains/videoSettings/index.js`
  - `main/domains/videoUi/index.js`
  - `main/domains/seriesSettings/index.js`
- Why isolated: Hidden persistence bugs present as random UI/UX state failures.
- Inspect focus: Atomic writes, debounce behavior, schema migration, stale data cleanup.

### C04 - Shell Core: App State And Shared UI Runtime
- Scope:
  - `src/domains/shell/core.js`
- Why isolated: This is the shared runtime spine for comics mode and reader integration.
- Inspect focus: `appState`, library refresh scheduling, shared overlays, view switching.

### C05 - Shell Bindings: Top Bar, Global Back, Refresh
- Scope:
  - `src/domains/shell/shell_bindings.js`
  - `src/index.html` (top bar controls only)
- Why isolated: Global button behavior is centralized here.
- Inspect focus: `libBackBtn`, refresh behavior by mode, mode-sensitive button wiring.

### C06 - Comics Library: Sidebar Tree And Root/Series Actions
- Scope:
  - `src/domains/library/library.js` (`renderSidebarFolders`, context menus)
- Why isolated: Folder model UX and root/series management live here.
- Inspect focus: Sidebar hierarchy, focus state, context-menu actions, scan action semantics.

### C07 - Comics Library: Continue Shelf, Series Grid, Search
- Scope:
  - `src/domains/library/library.js` (`renderContinue`, `renderSeriesGrid`, search index functions)
- Why isolated: Discovery UX and "continue reading" quality are concentrated here.
- Inspect focus: Relevance, sorting, stale entries, search ergonomics.

### C08 - Comics Library: Volume Table And Selection Model
- Scope:
  - `src/domains/library/library.js` (`renderVolumes`, selection, keyboard delegates)
- Why isolated: Volume navigation and open behavior are interaction-heavy.
- Inspect focus: Selection persistence, open behavior, sort/search interplay, preview sync.

### C09 - Reader Open/Decode Pipeline
- Scope:
  - `src/domains/reader/open.js`
  - `src/domains/reader/bitmaps.js`
  - `main/domains/archives/index.js`
  - `main/domains/comic/index.js`
- Why isolated: "open succeeds but rendering fails" usually starts here.
- Inspect focus: Token cancellation, session lifecycle, first-page decode failure handling.

### C10 - Reader Rendering Modes
- Scope:
  - `src/domains/reader/render_core.js`
  - `src/domains/reader/render_portrait.js`
  - `src/domains/reader/render_two_page.js`
  - `src/domains/reader/state_machine.js`
- Why isolated: Core reading UX quality and mode correctness.
- Inspect focus: Mode transitions, spread detection, pan/zoom rules, redraw scheduling.

### C11 - Reader Input/HUD/Settings
- Scope:
  - `src/domains/reader/input_pointer.js`
  - `src/domains/reader/input_keyboard.js`
  - `src/domains/reader/hud_core.js`
  - `src/domains/reader/mega_settings.js`
  - `src/domains/reader/volume_nav_overlay.js`
  - `src/domains/reader/boot.js`
- Why isolated: Most reader UX friction is input and HUD-driven.
- Inspect focus: Keybind conflicts, pointer gestures, HUD consistency, setting persistence effects.

### C12 - Video Library Sidebar, Show Actions, Rescan Entry Points
- Scope:
  - `src/domains/video/video.js` (`renderVideoFolders`, show/root context menus)
  - `src/index.html` (video sidebar nodes)
- Why isolated: Root/show actions originate here, including show-level rescan.
- Inspect focus: Root vs show action parity, action feedback, context-menu resilience.
- High-risk references:
  - `src/domains/video/video.js:4718`
  - `src/domains/video/video.js:4738`

### C13 - Video Show Explorer And Back Navigation Depth
- Scope:
  - `src/domains/video/video.js` (`openVideoShow`, `navigateShowFolder`, `goVideoHome`, `videoApp.back`)
  - `src/domains/shell/shell_bindings.js` (`libBackBtn` handler)
- Why isolated: Folder-depth navigation state is independent from playback and scan logic.
- Inspect focus: `epFolderRel` stack semantics, one-level-back vs go-home behavior, Backspace parity.
- High-risk references:
  - `src/domains/video/video.js:5384`
  - `src/domains/video/video.js:2903`
  - `src/domains/video/video.js:9541`
  - `src/domains/shell/shell_bindings.js:124`

### C14 - Video Continue Shelf, Progress Summaries, Video Search
- Scope:
  - `src/domains/video/video.js` (`renderContinue`, progress summary cache, global video search)
- Why isolated: "continue watching" quality and discoverability are mostly local here.
- Inspect focus: Progress-derived ranking, stale/missing episode hydration, UI chunk rendering behavior.

### C15 - Video Player Entry/Exit Flow (Renderer Side)
- Scope:
  - `src/domains/video/video.js` (`openVideo`, `showVideoLibrary`, player transitions)
  - `src/domains/video/build14_state.js`
- Why isolated: Playback launch and return feel is a distinct UX pipeline.
- Inspect focus: Return-state capture/restore assumptions, failure fallback, player/library handoff.

### C16 - Video Playback Controls, Tracks, Menus, Panels
- Scope:
  - `src/domains/video/video.js` (player control block, tracks panel, context menus, scrubber)
- Why isolated: Dense interaction cluster with many stateful controls.
- Inspect focus: Control discoverability, menu consistency, track/delay persistence timing.

### C17 - Video Keyboard And Global Shortcut Semantics
- Scope:
  - `src/domains/video/video.js` (`bindKeyboard`, Backspace/Escape behavior)
  - `src/domains/shell/shell_bindings.js`
- Why isolated: Shortcut behavior can conflict with navigation and overlays.
- Inspect focus: Mode gating, input-field exclusions, consistent back behavior between button and key.

### C18 - Main Library Domain + Library Scan Worker
- Scope:
  - `main/domains/library/index.js`
  - `workers/library_scan_worker_impl.js`
  - `workers/shared/*`
- Why isolated: Comics scan correctness and performance.
- Inspect focus: Effective-folder computation, queueing/cancel semantics, progress pruning behavior.

### C19 - Main Video Domain + Video Scan Worker
- Scope:
  - `main/domains/video/index.js`
  - `workers/video_scan_worker_impl.js`
  - `workers/shared/*`
- Why isolated: Video indexing, rescan behavior, hidden-show handling, poster generation.
- Inspect focus: `scanShow` behavior, root vs show-folder scan paths, worker output consistency.
- High-risk references:
  - `main/domains/video/index.js:1157`
  - `main/domains/video/index.js:1175`
  - `main/domains/video/index.js:777`

### C20 - Player Core (Qt Process, Session Files, Progress Sync)
- Scope:
  - `main/domains/player_core/index.js`
  - `player_qt/run_player.py`
- Why isolated: Most fragile non-UI runtime and crash-prone edge cases.
- Inspect focus: Single-process guard, command/session file contract, crash recovery, return-window restore.

### C21 - Thumbs, Export, Files, Clipboard, Archives IPC Surface
- Scope:
  - `main/domains/thumbs/index.js`
  - `main/domains/export/index.js`
  - `main/domains/files/index.js`
  - `main/domains/clipboard/index.js`
  - `main/domains/archives/index.js`
  - `main/ipc/register/*.js` (related handlers only)
- Why isolated: Utility domains with independent failure modes and easy wins.
- Inspect focus: Input validation, error handling quality, result-shape consistency.

### C22 - Renderer Markup And CSS Layers
- Scope:
  - `src/index.html`
  - `src/styles/styles.css`
  - `src/styles/overhaul.css`
  - `src/styles/video-library-match.css`
- Why isolated: UI polish and accessibility issues are best reviewed separate from logic.
- Inspect focus: Semantic structure, responsive constraints, visual consistency across comics/video modes.

### C23 - Health, Diagnostics, And Smoke Tooling
- Scope:
  - `src/services/health/monitor.js`
  - `tools/smoke_check.js`
  - `tools/verify_renderer_load_order.js`
  - `tools/doctor.js`
- Why isolated: Stability guardrails and regression detection.
- Inspect focus: Detectability of bridge failures, actionable logs, false-positive/false-negative balance.

## Per-Chunk Prompt Template

Use this prompt with your coding agent for each chunk:

```
Inspect chunk <CHUNK_ID> only.

Tasks:
1) Enumerate all mechanisms in this chunk:
   - UI elements
   - UX behaviors and transitions
   - logic/state flows
   - IPC calls and persistence touch points
2) Identify shortcomings:
   - what fails
   - what is brittle
   - what is underdeveloped
   - what is inconsistent with nearby UX
3) Implement fixes only for this chunk boundary.
4) Provide:
   - changed files
   - behavior before/after
   - risks
   - focused test checklist

Do not inspect unrelated files unless this chunk explicitly includes them.
```

