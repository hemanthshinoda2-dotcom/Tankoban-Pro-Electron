# AI Chunk Inspections

This file records inspections chunk-by-chunk.

## C12 - Video Library Sidebar, Show Actions, Rescan Entry Points

### Scope inspected
- `src/index.html`
- `src/domains/video/video.js` (`renderVideoFolders`, root/show sidebar context menus)

### Mechanisms in this chunk
- Sidebar tree shell and actions area:
  - `#videoFoldersList` (`role="tree"`) and buttons for add/show/restore/refresh in `src/index.html:258`, `src/index.html:259`, `src/index.html:269`, `src/index.html:271`.
- Root/show tree render and state:
  - `renderVideoFolders()` in `src/domains/video/video.js:3215`.
  - Root selection, expand/collapse, root removal, child show rows.
- Root context menu actions:
  - Rescan, reveal path, remove in `src/domains/video/video.js:3351`.
- Sidebar show context menu actions:
  - Open, rescan this show, reveal path, copy path, remove in `src/domains/video/video.js:4720`.
- Context menu helper:
  - `openCtxMenu(e, items)` used by both root and show context menus.
- Sidebar data dependencies:
  - Root/show count derivation, selected root/show state, persisted expansion state.

### Findings (ordered by severity)

1. High - Show rescan action can fail due missing renderer gateway method
- Evidence:
  - Caller uses `Tanko.api.video.scanShow(showPath)` in `src/domains/video/video.js:4738`.
  - Preload exposes `scanShow` in `preload/index.js:137`.
  - Renderer gateway video API does not include `scanShow` in `src/services/api_gateway.js:93`.
- Why it matters:
  - Sidebar menu says "Rescan this show" but may throw at runtime, producing failure behavior instead of rescanning.
- Fix direction:
  - Add `scanShow` wrapper in `src/services/api_gateway.js` and guard/disable the menu item when unavailable.

2. Medium - Root "Rescan" is misleading and over-broad
- Evidence:
  - Root row menu label is generic "Rescan" in `src/domains/video/video.js:3351`.
  - Action always calls global `video.scan({ force: true })` in `src/domains/video/video.js:3353`.
- Why it matters:
  - In a multi-root setup, user expects "rescan this root" but action triggers full library scan, causing unnecessary waiting and confusion.
- Fix direction:
  - Either relabel as "Rescan all videos" (short-term honesty) or implement root-scoped scan API and call that.

3. Medium - Sidebar show "Copy path" uses web clipboard directly and silently no-ops on failure
- Evidence:
  - Uses `navigator.clipboard.writeText(showPath)` with no await/catch in `src/domains/video/video.js:4757`.
  - Other menus correctly use `Tanko.api.clipboard.copyText(...)` (for example `src/domains/video/video.js:4680`, `src/domains/video/video.js:4913`).
- Why it matters:
  - Behavior is inconsistent across menus and may fail silently depending on runtime permissions/context.
- Fix direction:
  - Reuse `Tanko.api.clipboard.copyText` consistently and show success/failure toast.

4. Medium - Root row nests a button inside a button (invalid interactive markup)
- Evidence:
  - Root row is a `button` in `src/domains/video/video.js:3286`.
  - Remove control is another `button` in `src/domains/video/video.js:3315`.
  - Nested button is appended in `src/domains/video/video.js:3328`.
- Why it matters:
  - Invalid semantics can produce unpredictable keyboard/focus behavior and assistive-technology issues.
- Fix direction:
  - Use non-button container (`div` with role/button behavior) or split row action area into sibling controls.

5. Low - "All videos" entry lacks selected/active state parity with root rows
- Evidence:
  - "All videos" uses plain `navBtn` with no active-state handling in `src/domains/video/video.js:3220`.
  - Root rows apply active styling based on `selectedRootId`.
- Why it matters:
  - Users cannot reliably tell when the unfiltered view is active.
- Fix direction:
  - Add active class/toggle when `selectedRootId` is null.

6. Low - Silent error swallowing in sidebar context menu actions
- Evidence:
  - Root rescan: `try { await Tanko.api.video.scan({ force: true }); } catch {}` at `src/domains/video/video.js:3353` swallows errors, then always shows "Refreshing..." toast at line 3354 even if the call failed.
  - Root reveal: `try { await Tanko.api.shell.revealPath(r.path); } catch {}` at `src/domains/video/video.js:3361`.
  - Show reveal: `try { await Tanko.api.shell.revealPath(showPath); } catch {}` at `src/domains/video/video.js:4751`.
- Why it matters:
  - Failed actions produce misleading success feedback or no feedback at all. Debugging becomes harder.
- Fix direction:
  - Log or toast failures in catch blocks. For the root rescan, move the toast inside the try block or add a failure toast in catch.

### Plain-language UX impact
- Issue 1:
  - What users feel: "Rescan this show" sometimes does nothing or fails.
  - After fix: Right-click rescan is reliable and predictable.
- Issue 2:
  - What users feel: rescanning one folder unexpectedly rescans everything and takes longer.
  - After fix: scans match user intent, so refresh feels faster and less disruptive.
- Issue 3:
  - What users feel: "Copy path" works in one menu but not another.
  - After fix: copy actions behave consistently everywhere.
- Issue 4:
  - What users feel: occasional odd click/focus behavior in sidebar rows, especially with keyboard navigation.
  - After fix: cleaner and more stable sidebar interaction.
- Issue 5:
  - What users feel: uncertainty about whether they are viewing all videos or a filtered root.
  - After fix: clearer navigation state and less mental overhead.
- Issue 6:
  - What users feel: actions appear to succeed when they actually failed (e.g., toast says "Refreshing..." when scan threw).
  - After fix: honest feedback on action outcomes.

### Underdevelopment vs finished-product expectation
- Sidebar actions are functionally rich but not contract-consistent end-to-end (API bridge parity gap).
- Action labeling is not intent-accurate in multi-root libraries.
- Interaction semantics (nested buttons and tree accessibility semantics) are not polished for a production-grade navigation panel.
- Error handling defaults to silent swallowing rather than graceful degradation with user feedback.

### Prioritized fix backlog
**P0 â€” Must fix:** 1. Add `scanShow` to renderer gateway (Finding 1)
**P1 â€” Should fix:** 2. Relabel or scope root rescan (Finding 2), 3. Use `Tanko.api.clipboard.copyText` consistently (Finding 3), 4. Fix nested button markup (Finding 4)
**P2 â€” Polish:** 5. Add active state to "All videos" (Finding 5), 6. Add error feedback to catch blocks (Finding 6)

### Confidence and unknowns
- High confidence: Findings 1-3 verified against actual preload/gateway/register code. Finding 4 verified in DOM construction at lines 3286-3328.
- Medium confidence: Finding 6 â€” silent catches are a code quality concern; actual user impact depends on how often the underlying IPC calls fail.
- No false positives identified in this chunk.

### Suggested next chunk
- `C13` (folder-depth back behavior), then `C19`, then `C01`.

## C13 - Video Show Explorer And Back Navigation Depth

### Scope inspected
- `src/domains/video/video.js` (`openVideoShow`, `navigateShowFolder`, `goVideoHome`, `videoApp.back`, keyboard Backspace handling)
- `src/domains/shell/shell_bindings.js` (`libBackBtn` delegation)
- `src/index.html` (video show back affordance)

### Mechanisms in this chunk
- Video subview state:
  - `videoSubView` (`home` or `show`) and `selectedShowId` in `src/domains/video/video.js:253`.
- In-show folder browser state:
  - `epFolderRel` (relative folder path) in `src/domains/video/video.js:240`.
  - Folder navigation via `navigateShowFolder(...)` in `src/domains/video/video.js:5384`.
  - Up-row generation in show table (uses `..` to move parent) in `src/domains/video/video.js:5729`.
- Back entry points:
  - Top-left back delegates to `window.videoApp.back()` in `src/domains/shell/shell_bindings.js:124`.
  - Show header back button calls `goVideoHome()` in `src/domains/video/video.js:9081`.
  - Keyboard Backspace in video library calls `goVideoHome()` when in show view in `src/domains/video/video.js:8686`.
  - Shared back implementation in `window.videoApp.back` in `src/domains/video/video.js:9538`.
- Home transition behavior:
  - `goVideoHome()` clears `selectedShowId`, `selectedEpisodeId`, and `epFolderRel` in `src/domains/video/video.js:2903`.

### Findings (ordered by severity)

1. High - All "Back" controls skip folder depth and jump directly out of show view
- Evidence:
  - Top-left back path: shell -> `videoApp.back()` -> `goVideoHome()` (`src/domains/shell/shell_bindings.js:124`, `src/domains/video/video.js:9541`).
  - Show crumb back button always calls `goVideoHome()` (`src/domains/video/video.js:9081`).
  - Backspace in show view always calls `goVideoHome()` (`src/domains/video/video.js:8686`).
- Why it matters:
  - When user is inside nested show folders, Back should go up one folder first, not exit straight to show home/library.
- Fix direction:
  - Introduce a single "back one step" resolver:
    - If in player: return to library view.
    - Else if in show and `epFolderRel` non-empty: go to parent folder.
    - Else if in show root: go home.
    - Else: switch mode to comics.

2. Medium - Two parallel navigation models exist and conflict
- Evidence:
  - Folder browser has proper hierarchical navigation via `navigateShowFolder` and `..` rows (`src/domains/video/video.js:5384`, `src/domains/video/video.js:5729`).
  - Global back controls bypass that model and hard-jump to home (`goVideoHome` path).
- Why it matters:
  - Users see folder navigation on-screen, but the back button behaves like a different app model.
- Fix direction:
  - Route all back affordances through the same folder-aware navigation function.

3. Medium - Back destroys show context too aggressively
- Evidence:
  - `goVideoHome()` clears `selectedShowId`, `selectedEpisodeId`, and `epFolderRel` every time (`src/domains/video/video.js:2903`).
- Why it matters:
  - Accidental back loses current show/folder placement and increases re-navigation work.
- Fix direction:
  - Separate "step back within show" from "exit show".
  - Only clear show context on explicit "exit show/home" actions.

4. Medium - Folder location memory is underdeveloped (single global folder path)
- Evidence:
  - `epFolderRel` is a single global string (`src/domains/video/video.js:240`).
  - It is persisted globally in UI snapshot (`src/domains/video/video.js:2772`, `src/domains/video/video.js:2792`).
  - Switching to a different show resets it (`src/domains/video/video.js:3072`).
- Why it matters:
  - App does not remember folder position per show, which feels incomplete for large multi-season libraries.
- Fix direction:
  - Track folder state per show (for example `epFolderRelByShowId`), with backward-compatible migration.

5. Low - Back behavior is duplicated in multiple handlers
- Evidence:
  - Back logic exists in three places: `videoApp.back`, Backspace handler, show back button handler (`src/domains/video/video.js:9538`, `src/domains/video/video.js:8673`, `src/domains/video/video.js:9081`).
- Why it matters:
  - Future tweaks can easily update one path and forget the others, causing inconsistent behavior.
- Fix direction:
  - Centralize in a single navigation function called by all back triggers.

6. Low - No scroll position preservation when navigating between show folders
- Evidence:
  - `navigateShowFolder(rel)` at `src/domains/video/video.js:5384` sets `epFolderRel` and re-renders the show table.
  - No scroll position is saved before navigation or restored on return to parent folder.
  - The `..` row up-navigation at `src/domains/video/video.js:5729` also re-renders without scroll context.
- Why it matters:
  - Navigating into a subfolder and back loses the user's scroll position in the parent, causing minor re-orientation work.
- Fix direction:
  - Save scroll offset keyed by `epFolderRel` before navigation, restore after re-render when returning to a parent folder.

### Plain-language UX impact
- Issue 1:
  - What users feel: when inside `Season -> Episode folder`, pressing Back kicks them out too far.
  - After fix: Back works like expected in file browsers, one level at a time.
- Issue 2:
  - What users feel: on-screen ".." folder behavior and Back button do different things.
  - After fix: all navigation controls feel consistent and predictable.
- Issue 3:
  - What users feel: one mistaken Back can lose place in a big show tree.
  - After fix: less frustration, faster return to where they were.
- Issue 4:
  - What users feel: app "forgets where I was" when switching shows.
  - After fix: each show can feel stateful and polished.
- Issue 5:
  - What users feel: occasional weird differences between keyboard/back button behavior over time.
  - After fix: stable, uniform back behavior across controls.
- Issue 6:
  - What users feel: navigating into a subfolder and pressing ".." scrolls them to the top instead of where they were.
  - After fix: folder browsing feels fluid and position-aware.

### Underdevelopment vs finished-product expectation
- A finished media browser usually has a clear hierarchical navigation contract.
- This chunk currently has folder-depth state (`epFolderRel`) but does not fully use it for global Back behavior.
- The core pieces already exist; what is missing is unifying them into a single navigation model.
- Scroll position memory across folder levels is expected in production file browsers.

### Prioritized fix backlog
**P0 â€” Must fix:** 1. Unify back behavior to respect folder depth (Findings 1-2)
**P1 â€” Should fix:** 2. Separate "step back" from "exit show" in `goVideoHome` (Finding 3), 3. Centralize back logic (Finding 5)
**P2 â€” Polish:** 4. Per-show folder memory (Finding 4), 5. Scroll position preservation (Finding 6)

### Confidence and unknowns
- High confidence: Findings 1-3 verified by tracing all three back entry points through to `goVideoHome()`.
- High confidence: Finding 5 verified via code search â€” three separate handler locations with duplicated logic.
- Medium confidence: Finding 4 â€” `epFolderRel` is clearly global, but the UX impact depends on how many users have multi-season shows.
- Medium confidence: Finding 6 â€” confirmed no scroll save/restore in `navigateShowFolder`, but the impact is minor for small folder lists.

### Suggested next chunk
- `C19` (main video domain + worker) to validate whether show-level rescans are structurally correct and efficient.

## C19 - Main Video Domain Plus Video Scan Worker

### Scope inspected
- `main/domains/video/index.js`
- `workers/video_scan_worker_impl.js`
- `workers/shared/ignore.js`
- `workers/shared/ids.js`
- `workers/shared/fs_safe.js`

### Mechanisms in this chunk
- Main-process scan orchestration:
  - Worker lifecycle, deduping, queueing, and scan status events in `main/domains/video/index.js:777`, `main/domains/video/index.js:833`, `main/domains/video/index.js:855`.
- Show-level rescan entry:
  - `scanShow(...)` path selection in `main/domains/video/index.js:1157`.
- Scan cancellation:
  - Active worker termination and queue reset in `main/domains/video/index.js:1239`.
- Worker indexing pipeline:
  - Build `roots/shows/episodes` from root folders and explicit show folders in `workers/video_scan_worker_impl.js:174`, `workers/video_scan_worker_impl.js:397`.
- Ignore and ID contracts:
  - Path ignore rules in `workers/shared/ignore.js:5`.
  - Stable IDs from path/file stat in `workers/shared/ids.js:19`, `workers/shared/ids.js:25`.
- Worker safe filesystem access:
  - `statSafe(...)` in `workers/shared/fs_safe.js:5`.
- Post-scan poster generation:
  - `__autoGenerateMissingShowPosters(ctx, idx)` called after scan done in `main/domains/video/index.js:895`.
- Worker output persistence:
  - Worker writes index to disk at `workers/video_scan_worker_impl.js:526`.
  - Main process re-writes index after poster gen at `main/domains/video/index.js:911`.

### Findings (ordered by severity)

1. High - Worker scan failures can be treated as successful scans and overwrite index with empty data
- Evidence:
  - Worker catch path posts a `done` message with empty index plus `error` in `workers/video_scan_worker_impl.js:532`.
  - Main `done` handler never checks `msg.error`, always writes `msg.idx` into cache and calls `finish(true)` in `main/domains/video/index.js:873`, `main/domains/video/index.js:877`, `main/domains/video/index.js:917`.
- Why it matters:
  - A failed scan can look like a successful refresh while temporarily wiping the library view.
- Fix direction:
  - Treat `msg.error` as failure: preserve prior index, set `videoCache.error`, and finish with `false`.

2. High - "Rescan this show" for root-child shows still rescans the entire root
- Evidence:
  - `scanShow(...)` falls back to `startVideoScan(ctx, [parentRoot], [], { force: true })` when show is under `videoFolders` in `main/domains/video/index.js:1175`.
- Why it matters:
  - User intent is "refresh one show", but the app does a much larger and slower operation.
- Fix direction:
  - Add a worker path that accepts one explicit show folder even for root-child shows, then route `scanShow` there.

3. Medium - Path matching is brittle (non-normalized string checks across Windows path variants)
- Evidence:
  - Exact-string membership and prefix checks in `main/domains/video/index.js:1164`, `main/domains/video/index.js:1172`, `main/domains/video/index.js:1323`, `main/domains/video/index.js:1330`.
  - Worker dedupe also uses raw `startsWith` in `workers/video_scan_worker_impl.js:415`.
- Why it matters:
  - Mixed slash/case/trailing-slash forms can cause not-found results, duplicate coverage, or missed dedupe.
- Fix direction:
  - Normalize and canonicalize paths before comparisons (for example `realpath` plus platform-aware case normalization).

4. Medium - Scan metadata fields exist but are never populated
- Evidence:
  - Worker sets `const meta = {};` in both scan phases in `workers/video_scan_worker_impl.js:235`, `workers/video_scan_worker_impl.js:453`.
  - Output still writes `durationSec/width/height` from empty `meta` in `workers/video_scan_worker_impl.js:277`, `workers/video_scan_worker_impl.js:278`, `workers/video_scan_worker_impl.js:279`.
- Why it matters:
  - UX features that depend on runtime metadata (duration/resolution quality cues) remain underdeveloped.
- Fix direction:
  - Populate metadata from a probe step (best-effort), or remove dead fields until implemented.

5. Low - Cancel path leaves one queue field stale
- Evidence:
  - Queued show folders are set in `main/domains/video/index.js:786` and normally cleared in `main/domains/video/index.js:844`.
  - `cancelScan(...)` clears `scanQueuedFolders` and `scanQueuedKey` at `main/domains/video/index.js:1248-1249`, but does NOT clear `scanQueuedShowFolders`.
  - Compare with `finish()` at `main/domains/video/index.js:843-845` which correctly clears all three fields.
- Why it matters:
  - Stale in-memory queue state increases edge-case complexity and debugging cost.
- Fix direction:
  - Add `videoCache.scanQueuedShowFolders = null;` to cancel flow at line 1249.

6. Low - Exit-code success can be reported without ever receiving a done payload
- Evidence:
  - Worker exit handler explicitly treats `code === 0` without done as success in `main/domains/video/index.js:939-941`.
  - A diagnostic log is emitted ("scan may have failed silently") but `finish(true)` is still called.
- Why it matters:
  - Silent partial failures can be misreported as successful completion.
- Fix direction:
  - Track a `doneReceived` flag and fail when exit occurs without a `done` message.

7. Medium - Poster generation runs on potentially failed/empty scan results
- Evidence:
  - After worker posts `done`, main handler proceeds to `__autoGenerateMissingShowPosters(ctx, videoCache.idx)` at `main/domains/video/index.js:895`.
  - This happens regardless of whether `msg.error` was set (see Finding 1 â€” `msg.error` is never checked).
  - If the worker failed and posted `{ done, error, idx: { roots: [], shows: [], episodes: [] } }`, poster generation is attempted on an empty index.
  - The poster generation result is then written to disk at `main/domains/video/index.js:911` inside a silent `try {} catch {}`.
- Why it matters:
  - Wasted work on a failed scan, and potentially overwrites a valid index file with an empty one.
- Fix direction:
  - Gate poster generation on `!msg.error` or on `idx.shows.length > 0`.

### Plain-language UX impact
- Issue 1:
  - What users feel: after "scan complete", their library can suddenly look empty or incomplete.
  - After fix: failed scans are clearly marked as failed and existing library data stays intact.
- Issue 2:
  - What users feel: "rescan this show" takes too long because it rescans much more than expected.
  - After fix: show rescans are fast and scoped to exactly what user requested.
- Issue 3:
  - What users feel: rescans or show-folder actions behave inconsistently for some folders.
  - After fix: folder operations are stable regardless of path formatting differences.
- Issue 4:
  - What users feel: missing useful info (like reliable runtime details) makes browsing feel basic.
  - After fix: richer metadata enables a more polished media-library experience.
- Issue 5:
  - What users feel: occasional hard-to-reproduce scan oddities.
  - After fix: cleaner internal state means fewer edge-case glitches.
- Issue 6:
  - What users feel: app says "done" even when something actually failed silently.
  - After fix: completion status becomes trustworthy.
- Issue 7:
  - What users feel: scan failure still triggers "Generating show thumbnails..." phase, wasting time.
  - After fix: poster generation is skipped on failed scans, and the scan status reflects reality.

### Underdevelopment vs finished-product expectation
- The scan backbone is functionally complete, but trust and precision gaps remain in error handling and scope targeting.
- A finished product should treat show-level rescans as truly show-level and fail visibly when worker output is invalid.
- Path normalization and metadata enrichment are the main maturity gaps before this feels robust at scale.
- Post-scan side effects (poster generation, index write) should be gated on scan success.

### Prioritized fix backlog
**P0 â€” Must fix:** 1. Check `msg.error` in done handler, preserve prior index on failure (Findings 1, 7)
**P1 â€” Should fix:** 2. Implement true show-scoped rescan (Finding 2), 3. Normalize paths before comparison (Finding 3), 4. Track `doneReceived` flag for exit handler (Finding 6)
**P2 â€” Polish:** 5. Clear `scanQueuedShowFolders` in cancel (Finding 5), 6. Populate or remove metadata stubs (Finding 4)

### Confidence and unknowns
- High confidence: Findings 1, 5, 6, 7 verified against exact code in `main/domains/video/index.js:873-941` and `workers/video_scan_worker_impl.js:530-532`.
- High confidence: Finding 2 verified â€” `scanShow` at line 1175 clearly falls back to full root scan.
- Medium confidence: Finding 3 â€” the specific failure scenarios depend on user file system behavior (mixed slashes, case sensitivity on Windows NTFS).
- Medium confidence: Finding 4 â€” the meta fields are confirmed empty but the feature may be intentionally deferred.

### Suggested next chunk
- `C01` (IPC contract and bridge chain) to close method parity and compatibility gaps.

## C01 - IPC Contract And Bridge Chain

### Scope inspected
- `shared/ipc.js`
- `preload/index.js`
- `src/services/api_gateway.js`
- `main/ipc/register/video.js`
- `tools/smoke_check.js` (for parity guardrail coverage)

### Mechanisms in this chunk
- Channel contract source:
  - IPC constants (for example `VIDEO_SCAN_SHOW`) in `shared/ipc.js:120`, `shared/ipc.js:136`.
- Preload bridge exposure:
  - `window.electronAPI.video.*` and legacy aliases in `preload/index.js:135`, `preload/index.js:137`, `preload/index.js:730`.
- Renderer gateway wrapping:
  - `Tanko.api.*` adapter over preload in `src/services/api_gateway.js:43`, `src/services/api_gateway.js:93`.
- Main registration:
  - Channel-to-domain handler mapping in `main/ipc/register/video.js:15`, `main/ipc/register/video.js:17`.
- CI smoke coverage:
  - Parse/existence checks and renderer boundary checks in `tools/smoke_check.js:230`, `tools/smoke_check.js:255`.

### Findings (ordered by severity)

1. High - Contract parity break: `video.scanShow` exists in preload/main but missing in renderer gateway
- Evidence:
  - Preload exposes `scanShow` in `preload/index.js:137`.
  - Main handler is registered in `main/ipc/register/video.js:17`.
  - Renderer gateway `video` object has no `scanShow` method in `src/services/api_gateway.js:93-123`.
  - UI calls `Tanko.api.video.scanShow(showPath)` in `src/domains/video/video.js:4738`.
- Why it matters:
  - User-triggered show rescan can fail at renderer boundary even though IPC backend exists.
- Fix direction:
  - Add `scanShow` to gateway `video` wrapper and include parity check in guardrails.

2. Medium - Gateway fallback method names do not match actual preload legacy aliases
- Evidence:
  - Gateway scan fallback calls `ea.scanVideos` in `src/services/api_gateway.js:98`, but preload legacy alias is `scanVideoLibrary` in `preload/index.js:772`.
  - Gateway subtitle-dialog fallback calls `ea.openVideoSubtitleFileDialog` in `src/services/api_gateway.js:106`, but preload legacy alias is `openSubtitleFileDialog` in `preload/index.js:778`.
  - Gateway clipboard fallback calls `ea.setClipboardText` in `src/services/api_gateway.js:169`, but preload legacy alias is `copyText` in `preload/index.js:808`.
- Why it matters:
  - Compatibility path is brittle; if namespaced API is unavailable, fallback can call undefined methods.
- Fix direction:
  - Align fallback names with actual preload legacy aliases (or remove dead fallback variants).

3. Medium - Some gateway fallbacks silently return `undefined` instead of failing fast
- Evidence:
  - `addShowFolder` fallback chain ends in `undefined` in `src/services/api_gateway.js:101-102`. No preload legacy alias `addVideoShowFolder` exists.
  - `getEpisodesByIds` fallback uses optional call `ea.getEpisodesByIds?.(...a)` and may return `undefined` in `src/services/api_gateway.js:122`. No preload legacy alias exists.
- Why it matters:
  - Calling code gets weak signal quality and debugging becomes slower.
- Fix direction:
  - Return normalized error objects or throw explicit errors when required bridge methods are missing.
- Correction from prior version: `generateShowThumbnail` was previously listed here but its fallback correctly resolves via the preload legacy alias `generateVideoShowThumbnail` at `preload/index.js:781`. Removed as false positive.

4. Low - Current smoke checks validate structure, not API method parity across layers
- Evidence:
  - `tools/smoke_check.js` checks parse/existence and boundary rules but has no cross-layer method parity assertion between `shared/ipc.js`, `preload/index.js`, and `src/services/api_gateway.js` in `tools/smoke_check.js:230`, `tools/smoke_check.js:255`.
- Why it matters:
  - Missing methods like `scanShow` can ship unnoticed until runtime.
- Fix direction:
  - Add a parity check script that diffs expected method surface per namespace (`library`, `video`, `clipboard`, etc.).

### Plain-language UX impact
- Issue 1:
  - What users feel: some actions look available but fail when clicked.
  - After fix: UI actions consistently reach backend handlers.
- Issue 2:
  - What users feel: behavior can break unexpectedly after refactors because backup method names are wrong.
  - After fix: compatibility layer behaves predictably.
- Issue 3:
  - What users feel: failures are vague and hard to understand.
  - After fix: clear errors make bugs faster to detect and fix.
- Issue 4:
  - What users feel: regressions slip in between builds.
  - After fix: automated checks catch bridge mismatches earlier.

### Underdevelopment vs finished-product expectation
- Core architecture is correct (contract -> preload -> gateway -> register), but it is not yet self-verifying.
- A finished product should have strict surface parity and explicit failure behavior across all bridge layers.
- This chunk mostly needs contract hygiene and guardrails, not a redesign.

### Prioritized fix backlog
**P0 â€” Must fix:** 1. Add `scanShow` to gateway video namespace (Finding 1)
**P1 â€” Should fix:** 2. Correct fallback method names to match actual preload aliases (Finding 2), 3. Fail explicitly instead of returning undefined for missing methods (Finding 3)
**P2 â€” Polish:** 4. Add cross-layer parity check to smoke tests (Finding 4)

### Confidence and unknowns
- High confidence: Finding 1 verified â€” gateway video object at lines 93-123 has no `scanShow` entry.
- High confidence: Finding 2 verified â€” all three fallback name mismatches confirmed against preload legacy aliases at lines 772, 778, 808.
- High confidence: Finding 3 verified â€” `addShowFolder` has no legacy alias in preload lines 760-819. `generateShowThumbnail` DOES have a working alias (`generateVideoShowThumbnail` at line 781) and was removed from this finding.
- Medium confidence: Finding 4 â€” smoke check coverage was verified by reading the file, but the parity check complexity depends on how dynamic the API surface is.

## C14 - Video Continue Shelf, Progress Summaries, And Global Video Search

### Scope inspected
- `src/domains/video/video.js`
- `src/domains/video/video_utils.js` (helper dependency used by video search UI)

### Mechanisms in this chunk
- Continue shelf selection and rendering:
  - Candidate selection in `src/domains/video/video.js:3448`.
  - Tile rendering and clear action in `src/domains/video/video.js:3573`, `src/domains/video/video.js:3602`, `src/domains/video/video.js:3623`.
  - On-demand episode hydration for continue items in `src/domains/video/video.js:2963`.
- Progress summary cache and incremental refresh:
  - Full rebuild cache in `src/domains/video/video.js:3838`.
  - Per-show recompute and throttled rerender in `src/domains/video/video.js:3931`, `src/domains/video/video.js:3968`.
  - Snapshot application and derived cache rebuild in `src/domains/video/video.js:3097`.
- Global video search:
  - Search index build for shows/episodes in `src/domains/video/video.js:9298`.
  - Ranked retrieval in `src/domains/video/video.js:9352`.
  - Results UI render in `src/domains/video/video.js:9385`.
  - Search result selection/activation helpers in `src/domains/video/video_utils.js:29`.

### Findings (ordered by severity)

1. High - Video global-search helper functions are coupled in a fragile way (likely scope break)
- Evidence:
  - `video.js` calls bare identifiers `videoHideGlobalSearchResults`, `videoSetGlobalSearchSelection`, `videoActivateGlobalSearchSelection` in `src/domains/video/video.js:9394`, `src/domains/video/video.js:9522`, `src/domains/video/video.js:9561`.
  - `video_utils.js` defines those functions inside an IIFE in `src/domains/video/video_utils.js:13`, but only exports `_videoGsNorm/_videoMatchText/_videoNatCmp/_videoEscHtml` in `src/domains/video/video_utils.js:83`.
  - `video.js` only imports those exported utility names via `window.tankobanVideoUtils` in `src/domains/video/video.js:34`.
- Why it matters:
  - Search interaction can fail with runtime reference errors or rely on accidental global leakage.
- Fix direction:
  - Explicitly export these search helper functions (or move them into `video.js`) and bind them through a clear interface.

2. Medium - Search relevance scoring is largely canceled by post-sort ordering
- Evidence:
  - Ranked retrieval is computed in `videoSearchFromIndex(...)` (`src/domains/video/video.js:9352`), but show results are then sorted alphabetically in `src/domains/video/video.js:9414`.
  - Episode results are similarly re-sorted by show/title/path in `src/domains/video/video.js:9431`.
- Why it matters:
  - Query relevance weights exist, but users still see alphabetical ordering rather than best matches first.
- Fix direction:
  - Preserve rank order and use alphabetical sorting only as a tie-breaker.

3. Medium - Episode search corpus can be incomplete after lite snapshot updates
- Evidence:
  - Snapshot apply replaces `state.videos` directly from `snap.episodes` in `src/domains/video/video.js:3106`.
  - Push updates always flow through `applyVideoSnapshot(...)` in `src/domains/video/video.js:9181`, `src/domains/video/video.js:9177`.
  - This file explicitly documents that snapshots may be lite-capped in `src/domains/video/video.js:2960`.
  - Search index is rebuilt from `state.videos` in `src/domains/video/video.js:9301`, `src/domains/video/video.js:3115`.
- Why it matters:
  - Global episode search can miss legitimate results until those episodes are rehydrated elsewhere.
- Fix direction:
  - Keep a stable full episode corpus for search, or hydrate missing episode metadata before running episode search.

4. Medium - "Clear all continue" path only clears progress, not last-active episode memory
- Evidence:
  - `setAllVideoProgress(...)` resets only `state.progress` in `src/domains/video/video.js:9526`.
  - Continue source also includes `state.lastActiveEpisodeByShowId` in `src/domains/video/video.js:3482`.
  - Last-active entries are persisted by `touchLastActiveEpisode(...)` in `src/domains/video/video.js:3432`.
- Why it matters:
  - Users can clear continue/resume points but still see continue tiles repopulate from last-opened memory.
- Fix direction:
  - Add an explicit "clear continue memory" path that resets `lastActiveEpisodeByShowId` (and any related dismissal state) when user clears all continue items.

### Plain-language UX impact
- Issue 1:
  - What users feel: search dropdown behavior can feel random or broken.
  - After fix: search controls behave consistently because helper wiring is explicit and reliable.
- Issue 2:
  - What users feel: exact/better matches are not always at the top.
  - After fix: best matches appear first, so search feels smarter.
- Issue 3:
  - What users feel: "I know this episode exists, but search can't find it."
  - After fix: search covers the real library, not just the currently loaded slice.
- Issue 4:
  - What users feel: clearing continue does not fully clear continue.
  - After fix: clear actions match expectation and feel trustworthy.

### Underdevelopment vs finished-product expectation
- This chunk has strong core mechanics (continue cards, progress summary cache, indexed search), but contract clarity and data-coherency are not fully finished.
- A finished app should make search relevance obvious, keep a complete searchable corpus, and make clear/refresh actions deterministic.
- The biggest maturity gap is not missing features, but consistency between cached state, hydrated data, and user-facing intent.

### Prioritized fix backlog
**P0 â€” Must fix:** 1. Export or relocate global search helper functions (Finding 1)
**P1 â€” Should fix:** 2. Preserve relevance sort order (Finding 2), 3. Ensure full episode corpus for search (Finding 3), 4. Clear `lastActiveEpisodeByShowId` in clear-all path (Finding 4)

### Confidence and unknowns
- High confidence: Finding 1 â€” verified export list in `video_utils.js:83-86` vs bare identifier calls in `video.js`. The functions are defined inside the IIFE but not exported.
- High confidence: Finding 4 â€” `setAllVideoProgress` only resets `state.progress`, verified at line 9526.
- Medium confidence: Finding 2 â€” alphabetical sort is confirmed, but it may be an intentional design choice for discoverability.
- Medium confidence: Finding 3 â€” lite snapshot capping is documented but the actual frequency of missing episodes depends on library size.
- Correction from prior version: Finding 4 (continue shelf recency cache hash) was REMOVED. The hash at `src/domains/video/video.js:2983` controls hydration fetch order, not rendering order. The continue shelf rendering sorts independently by `updatedAt`. This was a false positive â€” the cache is correctly invalidated for display purposes.

### Suggested next chunk
- `C15` (Video player entry and exit flow on renderer side).

## C15 - Video Player Entry And Exit Flow (Renderer Side)

### Scope inspected
- `src/domains/video/video.js`
- `src/domains/video/build14_state.js`

### Mechanisms in this chunk
- Player entry points:
  - Episode open and double-click entry paths in `src/domains/video/video.js:5265`, `src/domains/video/video.js:5377`, `src/domains/video/video.js:9085`.
  - Shell-play event entry in `src/domains/video/video.js:9223`.
  - Unified launcher function `openVideo(...)` in `src/domains/video/video.js:6228`.
- Launch preparation and handoff:
  - Resume/start selection and playlist payload build in `src/domains/video/video.js:6268`, `src/domains/video/video.js:6285`.
  - Qt launcher call in `src/domains/video/video.js:6343`.
- Exit/back flow:
  - Player back handling in `src/domains/video/video.js:9215`.
  - Shared close/back helper in `src/domains/video/video.js:4217`.
  - Library return/reset in `src/domains/video/video.js:6368`.
- Build14 state capture/restore hooks:
  - Capture before launch in `src/domains/video/video.js:6253`.
  - Restore after `build14:playerExited` in `src/domains/video/video.js:8967`.
  - Capture/restore implementation module in `src/domains/video/build14_state.js:18`, `src/domains/video/build14_state.js:78`.

### Findings (ordered by severity)

1. High - Entry/exit reliability depends on optional APIs and can silently skip hide/restore behavior
- Evidence:
  - `openVideo(...)` only saves return state if `api.build14.saveReturnState` exists in `src/domains/video/video.js:6258`.
  - It only hides the window if `api.window.hide` exists in `src/domains/video/video.js:6353`.
  - Exit restore only runs if `api.build14.getReturnState` exists in `src/domains/video/video.js:8976`.
- Why it matters:
  - The app can launch the external player without reliably hiding/restoring the library context, with no clear failure signal.
- Fix direction:
  - Treat required entry/exit bridge methods as mandatory for this flow (or show explicit user-visible fallback warnings when unavailable).

2. High - `build14_state.js` is out-of-sync with current renderer state and DOM contracts
- Evidence:
  - Uses `_openShowId` and `showsById` in `src/domains/video/build14_state.js:30`, `src/domains/video/build14_state.js:32`, but current state uses `selectedShowId` and `shows` in `src/domains/video/video.js:253`, `src/domains/video/video.js:254`.
  - Expects `show.rootPath` / `show.folderPath` in `src/domains/video/build14_state.js:33`, `src/domains/video/build14_state.js:43`, while current show objects use `show.id` / `show.path` patterns.
  - Looks up DOM via `.videoLibraryContainer` / `.video-library` and `[data-episode-id=...]` in `src/domains/video/build14_state.js:49`, `src/domains/video/build14_state.js:133`, while episode rows are keyed as `data-id` in `src/domains/video/video.js:5193`, `src/domains/video/video.js:5305`.
  - Restore searches for show by `s.rootPath === savedState.showRootPath` at `src/domains/video/build14_state.js:101`, but shows have `s.path`, not `s.rootPath`.
- Why it matters:
  - Even when restore code runs, much of the saved context is likely to restore incorrectly or not at all.
- Fix direction:
  - Rewrite Build14 capture/restore to current contracts (`selectedShowId`, `epFolderRel`, `selectedEpisodeId`, current scroll container, `data-id` row targeting).

3. Medium - Return state is read on player exit but never cleared
- Evidence:
  - Player-exit handler reads `getReturnState()` in `src/domains/video/video.js:8977`.
  - No `clearReturnState()` call in this renderer flow after successful restore.
- Why it matters:
  - Stale return state can survive and be reused unexpectedly on later exits if a fresh save fails or is skipped.
- Fix direction:
  - Clear return state after successful restore (or version/token-guard it by session id).

4. Medium - Shell-play has a legacy direct-Qt branch that bypasses the unified launcher path
- Evidence:
  - In shell-play handler, when `localStorage.getItem('tankobanUseQtPlayer') === '1'`, code calls `api.player.launchQt(...)` directly in `src/domains/video/video.js:9243-9247`.
  - This bypasses `openVideo(v, p)` at `src/domains/video/video.js:9251` which handles state capture, playlist context, resume logic, and window hide.
- Why it matters:
  - Different entry paths can produce different behavior (playlist context, return handling, and diagnostics), which is hard to reason about and test.
- Fix direction:
  - Route all shell-play launches through `openVideo(...)` and remove the legacy bypass branch.

5. Low - Qt-only intent and embedded-player cleanup logic are mixed together
- Evidence:
  - This file states Qt-only entry intent in `src/domains/video/video.js:6229` and `src/domains/video/video.js:9256`.
  - Exit flow still performs embedded player pause/unload/destroy and class cleanup in `src/domains/video/video.js:6384`, `src/domains/video/video.js:6389`.
- Why it matters:
  - Extra legacy branches increase maintenance overhead and make regressions in back/exit behavior more likely.
- Fix direction:
  - Separate Qt-only exit behavior from legacy embedded-player cleanup, or gate legacy cleanup behind a single explicit capability flag.

6. Low - No file existence validation before launch
- Evidence:
  - `openVideo(v, opts)` at `src/domains/video/video.js:6240` checks `if (!v || !v.path) return` but does not verify the file exists on disk before proceeding to launch.
  - If the file was deleted or moved since the library index was built, the Qt player receives an invalid path.
  - The window may be hidden at `src/domains/video/video.js:6353` before the player reports the error.
- Why it matters:
  - User sees the library disappear but the player fails to start, producing a confusing blank state.
- Fix direction:
  - Add a best-effort file existence check before launch, or ensure the window is only hidden after the player confirms successful file open.

### Plain-language UX impact
- Issue 1:
  - What users feel: launching playback sometimes does not cleanly hide/return the app.
  - After fix: opening and returning from the player feels dependable every time.
- Issue 2:
  - What users feel: after closing player, app may not return to the same place they left.
  - After fix: user lands back in the same show/folder context more reliably.
- Issue 3:
  - What users feel: occasional "jumps" to old context after playback.
  - After fix: stale return states stop interfering with current session behavior.
- Issue 4:
  - What users feel: behavior differs based on how playback was triggered.
  - After fix: all play entry points behave consistently.
- Issue 5:
  - What users feel: hard-to-reproduce edge glitches around back/exit paths.
  - After fix: simpler, clearer flow reduces weird edge-case behavior.
- Issue 6:
  - What users feel: library disappears but video doesn't play (deleted/moved file).
  - After fix: user gets an immediate error message instead of a confusing blank state.

### Underdevelopment vs finished-product expectation
- The chunk has a strong launcher foundation (`openVideo` builds good payloads), but return-state restore is not aligned to the current app model.
- A finished product should have one canonical play entry path and one deterministic return path.
- The main gap is contract drift: old Build14 assumptions are still wired into a modernized video state model.
- File validation before launch is a basic robustness expectation for a media player.

### Prioritized fix backlog
**P0 â€” Must fix:** 1. Rewrite `build14_state.js` to current state/DOM contracts (Finding 2)
**P1 â€” Should fix:** 2. Make entry/exit bridge methods mandatory or warn visibly (Finding 1), 3. Clear return state after restore (Finding 3), 4. Route shell-play through `openVideo` (Finding 4)
**P2 â€” Polish:** 5. Remove embedded-player cleanup or gate behind flag (Finding 5), 6. Add file existence check before launch (Finding 6)

### Confidence and unknowns
- High confidence: Finding 2 â€” verified all four contract mismatches between `build14_state.js` and current `video.js` state fields and DOM attributes.
- High confidence: Finding 4 â€” legacy Qt bypass at lines 9241-9248 is still present in the code. The `tankobanUseQtPlayer === '1'` check and direct `launchQt` call bypass `openVideo` entirely.
- Medium confidence: Finding 1 â€” the optional API checks are visible, but the actual failure frequency depends on how often the bridge methods are missing in practice.
- Medium confidence: Finding 6 â€” file existence check is straightforward but the window hide timing makes the UX worse when the file is missing.

### Suggested next chunk
- `C16` (video playback controls, tracks, menus, and player panels).

## C16 - Video Playback Controls, Tracks, Menus, Panels

### Scope inspected
- `src/domains/video/video.js` (player control block, tracks panel, context menus, scrubber interactions, speed/volume/fullscreen controls, playlist panel, diagnostics overlay, HUD visibility logic, chapter markers)

### Mechanisms in this chunk

**UI Elements:**
- Scrubber/timeline bar with fill, thumb, bubble tooltip, chapter markers (`setVideoScrubUI`, `renderScrubChapters`)
- HUD control bar (play/pause, time labels, fullscreen button, exit fullscreen arrow)
- Top bar buttons: tracks, speed, quality, info/diagnostics
- Right-click context menu with submenus (audio tracks, subtitle tracks, speed presets, aspect ratios, delay controls)
- PotPlayer-style left-click menu (disabled by default, localStorage gated)
- Tracks panel (audio/subtitle selects, delay +/- buttons, transforms section, external subtitle loader, respect-styles toggle)
- Speed panel (up/down buttons, preset chips, value display)
- Volume panel (slider, mute toggle, close button)
- Playlist panel (episode list, prev/next buttons, season folder header, auto-advance toggle)
- Volume OSD overlay (bar indicator with auto-fade)
- Diagnostics overlay (canvas render stats)
- Resume prompt (resume/restart buttons)

**UX Behaviors/Transitions:**
- HUD auto-hide after 3s when playing; reveal zone at bottom 32px with 8px hysteresis
- Cursor auto-hide in fullscreen while playing
- Single-click toggles HUD; double-click toggles fullscreen (180ms delay to disambiguate)
- Mouse wheel: volume (default), seek (Shift+wheel)
- Scrub bar: pointer drag with live seek throttled at 120ms, RAF-gated move updates, commit guard against double-fire
- Keyboard nudge seek: coalesces rapid key presses, previews instantly, commits after 100ms idle
- Panel mutual exclusion via `closeAllToolPanels()`
- Click-outside-panel closes active panel (capture phase listener)
- Context menu submenu positioning with viewport clamping and left-flip fallback
- Context menu hover delay (300ms) before submenu auto-close

**Logic/State Flows:**
- Track fetching with retry loops (8-10 retries at 80-90ms in `refreshTracksFromPlayer`, 3 retries at 250ms in `openTracksPanel`, 6 retries at 200ms in `applyPreferredTracksForVideo`)
- Preferred track application gated by `preferredTracksAppliedForVideoId` (once per video)
- Context menu HTML caching (`menuCacheState`/`menuCacheHTML`) to avoid repeated DOM rebuilds
- Volume write throttling (~11/sec max, 90ms interval) with `queueVolumeToPlayer`/`flushVolumeToPlayer`
- Speed cycling through fixed preset array [0.25...4] with `cycleSpeed`; exact set via `setSpeedExact`
- Playback preferences (tracks, delays) persisted per-episode via `schedulePlaybackPreferencesSave` (500ms debounce)
- Chapter markers fetched on `loadedmetadata`, `duration`, and `file-loaded` (with 500ms delay)

**IPC/Persistence Touch Points:**
- `persistVideoSettings()` -- saves volume, muted, speed, autoAdvance, respectSubtitleStyles
- `saveSetting()` -- saves preferred audio/subtitle language globally
- `Tanko.api.videoProgress.save()` / `.get()` -- per-episode track/delay persistence
- `Tanko.api.window.toggleFullscreen()` / `isFullscreen()` / `isAlwaysOnTop()` / `toggleAlwaysOnTop()`
- `Tanko.api.window.openSubtitleDialog()` -- external subtitle file picker
- `Tanko.api.shell.revealPath()` -- reveal file in Explorer
- `Tanko.api.clipboard.copyText()` -- copy file path
- `Tanko.api.video.openFileDialog()` -- open file dialog from context menu

### Findings (ordered by severity)

1. High -- `closeHud()` is called but never defined
- Evidence: Escape key handler at `src/domains/video/video.js:8729` calls `closeHud()` when no panel/overlay is open. No function named `closeHud` exists anywhere in the `src/` tree (grep returns zero definitions).
- User-facing symptom: Pressing Escape while watching (no fullscreen, no panels open) throws a ReferenceError silently. The HUD remains visible or the key does nothing -- Escape feels broken.
- Fix direction: Define `closeHud()` (likely should be `el.videoStage?.classList.remove('showHud')` + clear `hudHideTimer`) or replace the call with `hideHudSoon()` / `setVideoUiHidden(true)`.

2. High -- Context menu "Stop" action pauses + seeks to 0 instead of returning to library
- Evidence: The right-click context menu "Stop" action at `src/domains/video/video.js:7546-7554` calls `state.player.pause()` then `seekTo(0)`. The PotPlayer-style left-click menu's "Stop" at `src/domains/video/video.js:4290` calls `closeOrBackFromPlayer()` which actually exits the player.
- User-facing symptom: Right-click -> Stop leaves the user staring at the first frame of the video, not the library. Left-click menu Stop exits as expected. Two "Stop" actions with the same label do completely different things.
- Fix direction: Unify both Stop actions. The right-click "Stop" should either call `closeOrBackFromPlayer()` (matching the left-click menu and user expectations for "Stop") or be relabeled as "Restart from beginning".

3. High -- Audio delay reset in context menu does not persist per-episode
- Evidence: Context menu audio delay reset at `src/domains/video/video.js:7666-7675` resets audio delay to 0 but does not call `schedulePlaybackPreferencesSave()`. Compare with subtitle delay reset at `src/domains/video/video.js:7688-7697` which also does not call it. Both track panel nudge buttons correctly persist via `src/domains/video/video.js:1889` and `src/domains/video/video.js:1900`. The standalone `resetSubtitleDelay()` function at `src/domains/video/video.js:4250` does persist.
- User-facing symptom: User resets audio delay via context menu, closes player, reopens -- the old delay comes back. Resetting subtitle delay via the `/` hotkey or tracks panel persists correctly. Inconsistent persistence.
- Fix direction: Add `schedulePlaybackPreferencesSave()` calls to both context menu reset handlers (audio and subtitle delay).

4. Medium -- Track panel `openTracksPanel` retry logic has an early-return bug
- Evidence: At `src/domains/video/video.js:2024-2026`, when `res.tracks.length` is truthy the function returns immediately. But if the first attempt returns an empty `tracks` array, the function returns `{ tracks: [], selectedId: null }` on the first try instead of retrying -- because the `return` at line 2026 is inside the successful-but-empty branch and executes before the `if (i < tries - 1) await wait(delayMs)` guard at line 2025.
- User-facing symptom: When opening the tracks panel immediately after loading a video, audio/subtitle track dropdowns show empty even though tracks would have been available 250ms later.
- Fix direction: Only return the empty result after all retries are exhausted. Move the `return` at line 2026 into an `else if (i === tries - 1)` guard.

5. Medium -- `normalizeAspectMode` known list is missing `2.35:1` which the context menu and aspect select offer
- Evidence: `normalizeAspectMode()` at `src/domains/video/video.js:1915` only recognizes `['16:9','4:3','1:1','21:9']`. The context menu submenu at `src/domains/video/video.js:1557` and `applyAspectMode` at `src/domains/video/video.js:4254` both use `2.35:1`. When mpv reports this back, `normalizeAspectMode` returns `'custom'` instead of `'2.35:1'`.
- User-facing symptom: After setting aspect to 2.35:1, the transforms UI shows "Custom" instead of "2.35:1". The active indicator in the context menu aspect submenu won't highlight the correct option.
- Fix direction: Add `'2.35:1'` to the `known` array in `normalizeAspectMode`.

6. Low -- Canvas-mode context menu listener has no explicit rebind guard (hardening)
- Evidence: At `src/domains/video/video.js:7387-7407`, `attachContextMenuCanvas()` adds a capture-phase document listener with no canvas-specific guard. However, `bindPlayerUi` is protected by `if (state._playerDomBound) return` at `src/domains/video/video.js:7271`, so this currently appears to run once in normal flow.
- User-facing symptom: No confirmed current user impact. If future refactors call this binding path more than once, duplicate listeners could cause menu double-fire/flicker.
- Fix direction: Add a dedicated guard flag (for example `_videoCtxMenuCanvasDocBound`) for future-proofing.

7. Medium -- `showHud()` called after async operations inside `openVideoCtxMenu` creates a race
- Evidence: At `src/domains/video/video.js:1694-1698`, context menu open triggers `refreshTracksFromPlayer().then(() => populateContextMenuSubmenus())`. This is async and unguarded. If the user closes the context menu before the refresh completes, `populateContextMenuSubmenus()` will re-populate invisible menu HTML and the cache will be updated based on stale open state.
- User-facing symptom: Minor: stale cache writes; could cause visible flicker if menu is rapidly opened/closed. Low probability but possible.
- Fix direction: Gate the `.then()` callback on `ctxMenuOpen` still being true.

8. Medium -- Indentation inconsistency across the chunk (scope-level code at column 0)
- Evidence: Multiple functions that should be indented inside the enclosing scope are at column 0:
  - `cachedAspectMode`/`cachedCropMode` declarations at `src/domains/video/video.js:1755-1757`
  - `setTransformsUiVisible`, `normalizeAspectMode`, `normalizeCropMode`, `syncTransformsUi`, `refreshTransformsFromPlayer` at `src/domains/video/video.js:1907-1956`
  - `closeTracksPanel` at `src/domains/video/video.js:2085` (4-space indent but surrounding code uses 2-space)
  - `buildPotLikeLeftClickMenuItems`, `applyAspectMode`, `applyCropMode`, `cycleSpeed`, `_writeVolumeNow`, `queueVolumeToPlayer` all at column 0
- User-facing symptom: No direct user impact, but increases maintenance risk.
- Fix direction: Normalize indentation to the enclosing scope level (2-space indent) in a dedicated formatting pass.

9. Medium -- Verbose debug logging left in chapter rendering and context menu code
- Evidence: Multiple `console.log('[BUILD89 CHAPTERS]...')` calls at `src/domains/video/video.js:686-690`, `src/domains/video/video.js:719-724`, `src/domains/video/video.js:742`, `src/domains/video/video.js:746-759`, `src/domains/video/video.js:770`, `src/domains/video/video.js:777`, `src/domains/video/video.js:780`. Also `[BUILD69 CTX]` debug logs in context menu code at `src/domains/video/video.js:7290`, `src/domains/video/video.js:7304-7314`, `src/domains/video/video.js:7335`, `src/domains/video/video.js:7343-7345`.
- User-facing symptom: Dev console floods with chapter and context menu diagnostic spam on every video load and right-click.
- Fix direction: Remove or gate behind a `DEBUG` flag. Keep at most one summary log per event.

10. Medium -- Volume +/- in left-click menu reads stale snapshot
- Evidence: `buildPotLikeLeftClickMenuItems()` at `src/domains/video/video.js:4278-4279` captures `st = state.player?.getState?.()` once. The `Volume +` handler at `src/domains/video/video.js:4338` reads `st.volume` from this closed-over snapshot. If the user changes volume between opening the menu and clicking the button, the delta is applied to a stale base.
- User-facing symptom: Volume jump -- if user used scroll wheel to set volume to 60%, then opens left-click menu and clicks "Volume +", it might increment from the 50% that was current when the menu was built.
- Fix direction: Read fresh `state.player.getState().volume` inside the onClick handler instead of closing over `st`.

11. Low -- `fillSelect` default-to-ON logic can select the wrong initial subtitle track
- Evidence: At `src/domains/video/video.js:1996-1998`, if no subtitle track has `selected: true` and `allowOff` is true, the code picks `firstReal` (the first non-"Off" option). This overrides mpv's actual state, selecting a track in the UI that isn't actually active in the player.
- User-facing symptom: Tracks panel shows a subtitle track as selected even though mpv has subtitles off.
- Fix direction: When no track is `selected`, default to `'no'` (Off) to match mpv's actual state, rather than guessing.

12. Low -- Context menu cache does not include `cropMode` in its state check
- Evidence: `menuCacheState` at `src/domains/video/video.js:1444-1452` includes `aspectMode` but not `cachedCropMode`. The aspect container is rebuilt on aspect changes but crop changes are not reflected until the next full rebuild.
- User-facing symptom: Negligible since crop is in the tracks panel, not the context menu. Would matter if crop presets are added to the context menu later.
- Fix direction: Add `cropMode: cachedCropMode` to the cache state key if crop presets are added to the context menu.

13. Low -- Chapter marker inline styles override CSS class styling
- Evidence: At `src/domains/video/video.js:707-712`, chapter markers have hardcoded inline styles including `background: '#FFFFFF'`, `width: '2px'`, `zIndex: '9999'`. Comment says "Force bright red" but the actual color is white. The CSS class `scrubChapterMark` exists but is overridden.
- User-facing symptom: Chapter markers may not respect theme changes and the comment-vs-code mismatch signals a debugging artifact left in production code.
- Fix direction: Remove inline style overrides; let the CSS class control marker appearance.

### Plain-language UX impact
- Issue 1:
  - What users feel: Pressing Escape does nothing or errors silently when no panel is open.
  - After fix: Escape predictably closes HUD or signals "nothing to dismiss".
- Issue 2:
  - What users feel: Right-click -> Stop leaves you staring at frame 0 instead of going back to library.
  - After fix: Stop consistently means "leave the player".
- Issue 3:
  - What users feel: Audio delay resets via context menu don't stick between sessions.
  - After fix: All delay resets persist reliably, no more "why did my delay come back?"
- Issue 4:
  - What users feel: Tracks panel sometimes shows empty dropdowns right after loading a video.
  - After fix: Track lists populate reliably even when opened immediately.
- Issue 5:
  - What users feel: Setting 2.35:1 aspect shows "Custom" in the UI.
  - After fix: Aspect indicators match what you selected.
- Issue 6:
  - What users feel: Usually nothing today; this is mainly preventative.
  - After fix: Future player/binding changes are less likely to introduce duplicate context-menu behavior.
- Issue 7:
  - What users feel: Rapid open/close of context menu can cause stale submenu state.
  - After fix: Menu content always matches current player state.
- Issue 8:
  - What users feel: No direct user impact.
  - After fix: Reduced maintenance risk for future changes.
- Issue 9:
  - What users feel: Dev console floods with diagnostic spam on every video load and right-click.
  - After fix: Cleaner logs, easier debugging when real issues arise.
- Issue 10:
  - What users feel: Volume +/- in left-click menu can cause an unexpected jump.
  - After fix: Volume adjustments are always relative to current actual level.
- Issue 11:
  - What users feel: Tracks panel may show wrong subtitle as "selected".
  - After fix: UI matches actual player state.
- Issue 12:
  - What users feel: Negligible.
  - After fix: Cache correctness improves.
- Issue 13:
  - What users feel: Chapter markers are hardcoded white, don't adapt to themes.
  - After fix: Chapter markers respect CSS theming.

### Underdevelopment vs finished-product expectation
- No scrubber hover preview: Production video players show a time tooltip when hovering the timeline without clicking. The bubble only updates during active drag or playback.
- No buffered-range visualization: The scrubber shows current position but no secondary fill for buffered content.
- Chapter navigation has no keyboard shortcut: Chapter markers are click-only. No "next chapter" / "previous chapter" keyboard binding exists.
- Speed panel has no visual indicator of current speed in preset chips: The speed panel shows current speed as text but the preset chips don't highlight the active one (unlike the context menu which marks `.active`).
- No seek-preview thumbnail: The scrubber shows time text while dragging but no video thumbnail preview.
- Volume OSD creates a new DOM element on first use: `showVolumeOSD` at `src/domains/video/video.js:7025-7031` uses create-if-missing pattern instead of a static DOM element.
- Tracks panel fetch is blocking (serial audio then subtitle): `openTracksPanel` fetches audio tracks, waits, then fetches subtitle tracks. These could be parallelized.
- No keyboard shortcut discoverability from inside the player: The `K` key toggles tips only when not in the player.
- Dead code from BUILD 65 button removal: Multiple commented-out button handlers and "old button" compatibility paths at `src/domains/video/video.js:8001-8017`, `src/domains/video/video.js:8082-8095`, `src/domains/video/video.js:8070-8080`.
- Transforms (aspect/crop) are not persisted per-episode: Unlike track and delay preferences, aspect/crop selections are session-only.

### Prioritized fix backlog (P0/P1/P2, inspection-only plan)

**P0 -- Must fix (broken behavior):**
1. Define `closeHud()` or replace the call at line 8729 -- runtime error on Escape
2. Unify context menu "Stop" with `closeOrBackFromPlayer()` -- behavioral mismatch between two "Stop" actions
3. Add `schedulePlaybackPreferencesSave()` to context menu delay reset handlers -- persistence gap

**P1 -- Should fix (brittle or degraded UX):**
4. Fix `fetchTracksWithRetry` early-return on empty tracks -- tracks panel shows empty unnecessarily
5. Add `'2.35:1'` to `normalizeAspectMode` known list -- UI mislabels a valid preset
6. Gate async track refresh in `openVideoCtxMenu` on `ctxMenuOpen` still being true
7. Read fresh volume state inside left-click menu Volume +/- handlers

**P2 -- Should fix (polish / maintenance):**
8. Guard canvas-mode document context menu listener against duplicate binding
9. Remove or gate `BUILD89 CHAPTERS` and `BUILD69 CTX` debug logging
10. Fix `fillSelect` default to `'no'` when no subtitle is selected by the player
11. Remove chapter marker inline style overrides; let CSS class apply
12. Normalize indentation for column-0 functions inside the enclosing scope
13. Remove dead commented-out button handlers from BUILD 65

### Confidence and unknowns
- High confidence:
  - Finding 1 (`closeHud` undefined): Confirmed via grep -- zero definitions exist in entire `src/` tree.
  - Finding 2 (Stop mismatch): Code paths are unambiguous; two different implementations for the same label.
  - Finding 3 (delay persistence gap): Direct comparison between context menu handlers and tracks panel handlers.
  - Finding 5 (`normalizeAspectMode` missing 2.35:1): Verified the known list vs the offered presets.
- Medium confidence:
  - Finding 4 (retry early-return): The control flow is complex. The bug depends on whether mpv returns `{ ok: true, tracks: [] }` (empty but successful) on the first attempt. To confirm: add a breakpoint in `fetchTracksWithRetry` during early video load and check if `res.tracks.length` is 0 on first call.
- Low confidence / hardening:
  - Finding 6 (listener guard): `state._playerDomBound` at `src/domains/video/video.js:7271` likely prevents re-binding in current flow, so this is primarily future-proofing unless binding lifecycle changes.
- Potential false positives:
  - Finding 8 (indentation): Style concern, not a functional bug. The renderer JS runs fine regardless of indentation.
  - Finding 12 (crop cache): The context menu currently doesn't show crop options as a submenu, so the missing cache key has near-zero practical impact.
- Unknowns requiring cross-chunk verification:
  - Whether `closeHud` is defined in another loaded script outside `src/`. Assumption: it is not. Confirmed by grepping all `src/` -- zero hits beyond the call site.
  - Whether `buildPotLikeLeftClickMenuItems` is ever invoked in practice (requires `localStorage.setItem('tb_video_left_menu', '1')`). If truly dev-only, Finding 10 is low-severity.

### Suggested next chunk
- `C17` (video keyboard and global shortcut semantics).

## C17 - Video Keyboard And Global Shortcut Semantics

### Scope inspected
- `src/domains/video/video.js` (`bindKeyboard`, `onKeyDown`, `onKeyUp`, Backspace/Escape behavior, all player hotkeys)
- `src/domains/shell/shell_bindings.js` (Escape handler, `libBackBtn` delegation)

### Mechanisms in this chunk

**Keyboard listener registration:**
- `bindKeyboard()` at `src/domains/video/video.js:8490` defines `onKeyDown` and `onKeyUp` handlers.
- Both registered on `window` in capture phase (`true`) at `src/domains/video/video.js:8942-8943`.
- Resize listener for fullscreen CSS sync at `src/domains/video/video.js:8946`.

**Mode and context gating:**
- Top-level guard: `state.mode !== 'videos'` early-return at `src/domains/video/video.js:8664`.
- Input-field exclusion: `input`, `textarea`, `isContentEditable` at `src/domains/video/video.js:8667`.
- Library vs player split: `!inPlayer` block at `src/domains/video/video.js:8698` â€” only `K` (tips overlay) and Escape (close tips) work outside the player. All other shortcuts are player-only.

**Escape priority cascade (player mode):**
- Fullscreen exit (highest priority) at `src/domains/video/video.js:8707-8718`.
- Context menu close at `src/domains/video/video.js:8725`.
- Diagnostics overlay close at `src/domains/video/video.js:8726`.
- Playlist panel close at `src/domains/video/video.js:8727`.
- Tracks panel close at `src/domains/video/video.js:8728`.
- Volume panel close at `src/domains/video/video.js:8728` (same line, two statements).
- Fallback: `closeHud()` (undefined â€” see C16 Finding 1) at `src/domains/video/video.js:8729`.

**Backspace navigation (all video mode):**
- In player: `closeOrBackFromPlayer()` at `src/domains/video/video.js:8681`.
- In show view: `goVideoHome()` at `src/domains/video/video.js:8687`.
- At library home: no-op at `src/domains/video/video.js:8692`.

**Player hotkeys (no modifier):**
- `A` â€” cycle audio track, `S` â€” cycle subtitle track at `src/domains/video/video.js:8761-8772`.
- `G` â€” jump to time (blocking `window.prompt`) at `src/domains/video/video.js:8775-8796`.
- `C/X/Z` â€” speed up/down/reset at `src/domains/video/video.js:8800-8803`.
- `>/<//` â€” subtitle delay nudge/reset at `src/domains/video/video.js:8807-8810`.
- Space â€” play/pause (or cancel auto-advance) at `src/domains/video/video.js:8813-8834`.
- Arrow keys â€” seek (left/right) and volume (up/down) at `src/domains/video/video.js:8837-8862`.
- `M` â€” mute toggle at `src/domains/video/video.js:8865`.
- `Enter`/`F` â€” fullscreen toggle at `src/domains/video/video.js:8872-8883`.
- `]/[/\` â€” speed alternate keys at `src/domains/video/video.js:8889-8891`.
- `J/L` â€” seek -10s/+10s at `src/domains/video/video.js:8893-8894`.
- `N/P` â€” next/prev episode at `src/domains/video/video.js:8897-8921`.

**Alt-modified hotkeys:**
- `Alt+A` â€” cycle audio track at `src/domains/video/video.js:8737`.
- `Alt+H` â€” toggle subtitles on/off at `src/domains/video/video.js:8743`.
- `Alt+L` â€” cycle subtitle track at `src/domains/video/video.js:8749`.

**Shell Escape listener:**
- `document.addEventListener('keydown', ...)` (bubble phase) at `src/domains/shell/shell_bindings.js:94`.
- Only handles Escape when `libDrawerOpen` is true and NOT `inPlayer`.
- No conflict with video capture-phase handler (video fires first, shell only runs when video doesn't consume the event).

**Reader keyboard co-existence:**
- Reader keydown at `src/domains/reader/input_keyboard.js:35` early-returns when `inVideoPlayer` is true at line 38.
- No cross-mode conflict.

**onKeyUp handler:**
- Prevents default on Space/Enter to stop "button click" activation when player controls have focus at `src/domains/video/video.js:8926-8940`.
- Same input-field exclusion as keydown (same gap â€” no `select`).

### Findings (ordered by severity)

1. High â€” `hideResumePrompt()` and `resumeChoice()` are called but never defined
- Evidence:
  - `hideResumePrompt()` called at `src/domains/video/video.js:6378` (inside `showVideoLibrary()`).
  - `resumeChoice('resume')` and `resumeChoice('restart')` wired as click handlers at `src/domains/video/video.js:8485-8486`.
  - Neither function is defined anywhere in the `src/` tree (grep returns zero definitions across all JS files).
  - The resume prompt DOM element `#videoResumePrompt` exists in `src/index.html:715` and is queried as `el.videoResumePrompt` at `src/domains/video/video.js:195`.
- User-facing symptom: The resume prompt feature is dead â€” the DOM exists but the display/hide/action functions were never implemented. The buttons would throw `ReferenceError` if clicked. `showVideoLibrary()` silently errors on the `hideResumePrompt()` call.
- Fix direction: Either implement the resume prompt lifecycle (`showResumePrompt`, `hideResumePrompt`, `resumeChoice`) or remove the dead DOM element and button wiring.

2. Medium â€” Speed panel missing from Escape key dismiss cascade
- Evidence:
  - Escape handler at `src/domains/video/video.js:8725-8729` checks: `ctxMenuOpen`, diagnostics, `playlistPanelOpen`, `tracksPanelOpen`, `volPanelOpen`.
  - `speedPanelOpen` (declared at `src/domains/video/video.js:2092`) is NOT checked.
  - `closeAllToolPanels()` at `src/domains/video/video.js:1404-1410` correctly closes the speed panel, but it is not called from the Escape handler.
  - When speed panel is open and user presses Escape, the handler falls through to the undefined `closeHud()` at line 8729.
- User-facing symptom: Escape doesn't close the speed panel. Instead it either errors silently (`closeHud` undefined) or does nothing.
- Fix direction: Add `if (speedPanelOpen) { closeSpeedPanel(); showHud(); return; }` to the Escape cascade before the fallback.

3. Medium â€” `select` elements not excluded from keyboard shortcut handler
- Evidence:
  - Input-field guard at `src/domains/video/video.js:8667` checks `input`, `textarea`, `isContentEditable` â€” but NOT `select`.
  - The same guard is used in `onKeyUp` at `src/domains/video/video.js:8931-8932`.
  - The reader's equivalent `isTypingTarget()` at `src/domains/reader/hud_core.js:197` correctly includes `select` in its check.
  - The tracks panel uses `<select>` elements: `videoAudioTrackSelect` at `src/domains/video/video.js:174`, `videoSubtitleTrackSelect` filled at `src/domains/video/video.js:2064`.
- User-facing symptom: When a user focuses the audio track `<select>` in the tracks panel and presses `A`, both the native select navigation AND the `cycleAudioTrackHotkey()` fire. The audio track cycles unexpectedly while the user is trying to browse the dropdown.
- Fix direction: Add `|| tag === 'select'` to the input-field guard at line 8667 and line 8931, matching the reader's `isTypingTarget` pattern.

4. Medium â€” `G` key uses blocking `window.prompt()` which freezes the renderer
- Evidence:
  - At `src/domains/video/video.js:8777`: `const input = window.prompt('Go to time (seconds, mm:ss, or hh:mm:ss):', '');`
  - `window.prompt()` is a synchronous blocking call that halts the entire renderer thread.
  - The dialog is a native OS modal â€” not themed, not styled, visually jarring inside an Electron app.
  - While the prompt is open, the video player's progress polling, HUD auto-hide, and all timers are frozen.
- User-facing symptom: Pressing `G` opens an ugly native dialog that freezes the player mid-frame. Feels broken and out of place.
- Fix direction: Replace with an in-app overlay input (similar to the reader's goto overlay, which uses `el.gotoInput` at `src/domains/reader/volume_nav_overlay.js:1136`). The overlay should be dismissible with Escape and should not block the renderer.

5. Low â€” Backspace in show view always skips folder depth (cross-ref C13)
- Evidence:
  - Backspace handler at `src/domains/video/video.js:8686-8688` calls `goVideoHome()` when in show view, regardless of `epFolderRel` depth.
  - This is the implementation site for C13 Finding 1.
- User-facing symptom: Pressing Backspace while inside `Show > Season 2` exits to the library home instead of going up to `Show` root.
- Fix direction: Route through a unified "back one step" resolver (see C13 fix direction). Check `epFolderRel` before calling `goVideoHome()`.

6. Low â€” Redundant key bindings: `A` is bound as both Alt+A and plain A to the same handler
- Evidence:
  - `Alt+A` at `src/domains/video/video.js:8737-8741` calls `cycleAudioTrackHotkey()`.
  - Plain `A` at `src/domains/video/video.js:8761-8765` also calls `cycleAudioTrackHotkey()`.
  - Since plain `A` always fires (no modifier required), `Alt+A` is unreachable unless the user deliberately presses Alt.
- User-facing symptom: No user impact â€” both bindings do the same thing. But the Alt variant is dead weight and adds maintenance confusion.
- Fix direction: Remove the plain-A binding (keep Alt+A for consistency with Alt+H and Alt+L), or document the intentional dual binding.

7. Low â€” Overloaded `L` key semantics (seek vs subtitle cycle depending on Alt)
- Evidence:
  - Plain `L` at `src/domains/video/video.js:8894`: `seekBy(+10)` (10-second seek forward).
  - `Alt+L` at `src/domains/video/video.js:8749`: `cycleSubtitleTrackHotkey()` (next subtitle track).
  - No keyboard shortcut reference or tooltip explains this distinction.
- User-facing symptom: Users who discover `L` seeks forward would not expect `Alt+L` to change subtitles. The mapping is not discoverable from within the player (the `K` tips overlay is library-only).
- Fix direction: Add `L` to the in-player shortcut reference (when implemented). Consider whether the Alt-modifier pattern is worth keeping vs dedicated single keys.

8. Low â€” `speedPanelOpen` missing from HUD auto-hide guard
- Evidence:
  - HUD auto-hide guard at `src/domains/video/video.js:2380` checks: `ctxMenuOpen || playlistPanelOpen || tracksPanelOpen || volPanelOpen || diagnosticsOn || state.seekDragging || state._pointerOverControls`.
  - `speedPanelOpen` is NOT in this list.
  - Same omission in cursor-hide check at `src/domains/video/video.js:2400`.
- User-facing symptom: While the speed panel is open, the HUD may auto-hide after 3s, hiding the controls underneath the speed panel. The cursor may also auto-hide in fullscreen while the speed panel is visible.
- Fix direction: Add `speedPanelOpen` to both guard conditions at lines 2380 and 2400.

### Plain-language UX impact
- Issue 1:
  - What users feel: Resume prompt buttons do nothing (if the prompt ever becomes visible). Library exit silently errors.
  - After fix: Resume prompt either works correctly or is cleanly removed.
- Issue 2:
  - What users feel: Escape doesn't close the speed panel; have to click elsewhere to dismiss it.
  - After fix: Escape consistently closes any open panel.
- Issue 3:
  - What users feel: Keyboard shortcuts fire while browsing track dropdowns, causing unexpected track changes.
  - After fix: Keyboard shortcuts are suppressed while interacting with form controls.
- Issue 4:
  - What users feel: "Go to time" opens a jarring, unstyled native dialog that freezes the player.
  - After fix: A clean, in-app overlay that matches the rest of the UI.
- Issue 5:
  - What users feel: Backspace in a show subfolder exits too far (same as C13).
  - After fix: Backspace goes up one folder level as expected.
- Issue 6:
  - What users feel: No direct impact.
  - After fix: Cleaner shortcut map, less maintenance confusion.
- Issue 7:
  - What users feel: Shortcut behavior is surprising and undiscoverable.
  - After fix: Users can learn shortcuts from within the player.
- Issue 8:
  - What users feel: HUD auto-hides while speed panel is open, making it feel glitchy.
  - After fix: HUD stays visible whenever any panel is open.

### Underdevelopment vs finished-product expectation
- Resume prompt is a partially stubbed feature â€” DOM exists, functions do not. A finished product either fully implements resume-on-play or removes the dead markup.
- Escape cascade does not cover all dismissible panels. A finished player should have a single "dismiss topmost overlay" function that knows about all panel states.
- In-player keyboard shortcut discoverability is absent. The `K` tips overlay only works in the library. A production video player typically shows shortcut hints or has a `?` overlay.
- The `window.prompt()` usage is a development shortcut. No production media player uses native prompt dialogs for seek-to-time.
- The reader side uses `isTypingTarget()` which includes `select` elements, but the video side has a handwritten inline check that omits `select`. A shared utility would prevent this kind of drift.

### Prioritized fix backlog
**P0 â€” Must fix:** 1. Define `hideResumePrompt`/`resumeChoice` or remove dead resume prompt DOM and wiring (Finding 1)
**P1 â€” Should fix:** 2. Add `speedPanelOpen` to Escape cascade (Finding 2), 3. Add `select` to keyboard input-field exclusion (Finding 3), 4. Replace `window.prompt` with in-app overlay for "Go to time" (Finding 4), 5. Add `speedPanelOpen` to HUD auto-hide guard (Finding 8)
**P2 â€” Polish:** 6. Route Backspace through folder-aware back resolver (Finding 5), 7. Clean up redundant A binding (Finding 6), 8. Add in-player shortcut reference (Finding 7)

### Confidence and unknowns
- High confidence: Finding 1 â€” grep confirms zero definitions of `hideResumePrompt` and `resumeChoice` across all JS files in `src/`.
- High confidence: Finding 2 â€” `speedPanelOpen` is clearly missing from the Escape if-chain at lines 8725-8728. Verified by comparing with `closeAllToolPanels()` which does include it.
- High confidence: Finding 3 â€” the tag check at line 8667 is unambiguous; `select` is absent. Reader's `isTypingTarget` at `hud_core.js:197` includes it. Tracks panel uses `<select>` elements confirmed at line 2064.
- High confidence: Finding 4 â€” `window.prompt()` is synchronous and blocking, verified at line 8777.
- Medium confidence: Finding 8 â€” the HUD auto-hide with speed panel open depends on timing. If the user opens the speed panel and then doesn't move the mouse for 3 seconds, the HUD hides. The speed panel's own panel close logic may or may not re-trigger `showHud()`.
- Cross-chunk references: Finding 1 overlaps C15/C16 (resume prompt is part of player entry/controls). Finding 5 is the C13 keyboard implementation site. Finding 2 is the C16 Escape cascade with speed panel gap.

### Suggested next chunk
- `C02` (main boot, window lifecycle, file association) or `C20` (player core, Qt process, session files).

---

## Upgrade Changelog

**Inspection revision date: 2026-02-14**
**Chunks upgraded: C12, C13, C19, C01, C14, C15, C16**

### Per-chunk changes

**C12:**
- All 5 original findings confirmed with current line refs.
- Added Finding 6 (Low): Silent error swallowing in sidebar context menus â€” empty catch blocks produce misleading success feedback.
- Added Prioritized fix backlog and Confidence sections.
- Expanded Mechanisms to include `openCtxMenu` helper reference.

**C13:**
- All 5 original findings confirmed with current line refs.
- Added Finding 6 (Low): No scroll position preservation when navigating show folders.
- Added Prioritized fix backlog and Confidence sections.
- Expanded Underdevelopment section to mention scroll position memory.

**C19:**
- All 6 original findings confirmed with current line refs.
- Added Finding 7 (Medium): Poster generation runs on potentially failed/empty scan results â€” `__autoGenerateMissingShowPosters` is called without checking `msg.error`.
- Added post-scan poster generation and worker persistence to Mechanisms.
- Added Prioritized fix backlog and Confidence sections.

**C01:**
- Findings 1, 2, 4 confirmed as-is.
- Finding 3 corrected: Removed `generateShowThumbnail` from the "silently returns undefined" list. The fallback correctly resolves via preload legacy alias `generateVideoShowThumbnail` at `preload/index.js:781`. This was a false positive.
- Added Prioritized fix backlog and Confidence sections.

**C14:**
- Findings 1, 2, 3 confirmed. Original Finding 5 renumbered to Finding 4.
- Original Finding 4 (continue shelf recency cache hash) REMOVED. The hash at line 2983 controls hydration fetch order, not rendering order. The continue shelf rendering sorts independently by `updatedAt`. This was a false positive.
- Added Prioritized fix backlog and Confidence sections.

**C15:**
- Findings 1, 2, 3, 5 confirmed with current line refs.
- Finding 4 CONFIRMED still present in code at lines 9241-9248. The `tankobanUseQtPlayer === '1'` check and direct `launchQt` call bypassing `openVideo` are still in the codebase. Updated line references.
- Added Finding 6 (Low): No file existence validation before launch â€” window may hide before player reports file-not-found error.
- Added Prioritized fix backlog and Confidence sections.

**C16:**
- All 13 findings confirmed as-is (freshly inspected in this session).
- No changes needed. Full sections (Mechanisms, Findings, UX impact, Underdevelopment, Fix backlog, Confidence) already present.

### Summary of corrections
| Chunk | Finding | Action | Reason |
|-------|---------|--------|--------|
| C01 | 3b (`generateShowThumbnail`) | Removed from finding | Legacy alias `generateVideoShowThumbnail` exists at `preload/index.js:781`; fallback works |
| C14 | 4 (recency cache hash) | Removed entirely | Hash controls fetch order not display order; renderer sorts independently |
| C15 | 4 (shell-play legacy bypass) | Kept (agent error corrected) | Code at `video.js:9241-9248` still present; bypass is NOT removed |

---

## C02 - Main Boot, Window Lifecycle, File Association

### Scope inspected
- `main/index.js` (631 lines) â€” app lifecycle, window creation, userData migration, single-instance lock, file association handling, player launcher mode
- `main/domains/window/index.js` (273 lines) â€” window operations (fullscreen, hide/show, always-on-top, screenshot, subtitle dialog, minimize/close)
- `main/domains/shell/index.js` (52 lines) â€” `revealPath` handler

### Mechanisms in this chunk

- **userData directory migration** (`pickUserDataDir` at `main/index.js:137`):
  - Scores 8 candidate directories by data richness (file sizes, folder counts, book/series/episode counts)
  - Selects highest-scoring directory to preserve user data across app name changes
  - Called synchronously at module scope before app is ready

- **Cross-Origin Isolation headers** (`ensureCrossOriginIsolationHeaders` at `main/index.js:35`):
  - Installs COOP+COEP response headers on `session.defaultSession` for SharedArrayBuffer
  - Feature gate via `app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')`

- **Player launcher mode** (`__isPlayerLauncherMode` at `main/index.js:198`):
  - When app is opened with a video file, skips library window and launches Qt player directly
  - `__launchVideoFromFileAssoc()` (line 390) looks up video in library index for progress/playlist context
  - On Qt player exit, `__restoreWindowAfterPlayerExit()` in player_core domain calls `app.quit()` if no windows exist

- **Single-instance lock** (`app.requestSingleInstanceLock()` at `main/index.js:488`):
  - Second instance forwards argv to first instance via `second-instance` event
  - Handles `--show-library` flag, video files, and comic archives differently

- **File association handling**:
  - `open-file` event (macOS, line 536): dispatches to video launcher or comic enqueue
  - `second-instance` event (Windows, line 492): parses argv for video/comic paths
  - `extractVideoPathFromArgv` / `extractComicPathsFromArgv`: type detection via extension regex

- **Window creation** (`createWindow` at `main/index.js:298`):
  - `sandbox: false` for preload CommonJS `require()` support
  - `show: false` + `ready-to-show` â†’ set `__tankobanDidFinishLoad` â†’ `loadFile().then()` â†’ `show()`
  - DevTools shortcuts via `globalShortcut.register()` (process-wide)

- **Comic open-with flow** (`enqueueOpenPaths` / `flushPendingOpenPaths` at `main/index.js:267-295`):
  - Queues paths, flushes to renderer via `EVENT.APP_OPEN_FILES` when window is ready

- **Window domain operations** (`main/domains/window/index.js`):
  - All handlers use `winFromEvt(evt) || ctx.win` pattern for window resolution
  - `hideWindow` / `showWindow`: BUILD14 hide-on-play lifecycle
  - `showWindow` forces `setFullScreen(false)` â€” always returns to windowed mode

### Findings (ordered by severity)

1. **Medium â€” globalShortcut clobbers DevTools shortcuts on multi-window**
- Evidence:
  - `createWindow()` at `main/index.js:358-364` calls `globalShortcut.unregisterAll()` then re-registers F12 and Ctrl+Shift+I bound to the new window's `w.webContents.toggleDevTools()`.
  - `globalShortcut` is process-wide. Each `createWindow()` call unregisters ALL shortcuts then re-registers them closing over the new `w`.
  - For multi-window (e.g. `openBookInNewWindow`), the first window loses its DevTools shortcuts entirely.
- UX impact: Developer cannot open DevTools in any window except the most recently created one. Low user-facing impact (dev-only), but frustrating for debugging.
- Fix direction: Remove `globalShortcut` usage from `createWindow()`. Rely solely on the per-window `__tankobanBindDevtoolsShortcuts(w)` in `main/ipc/index.js:114-129` which correctly uses `webContents.on('before-input-event')` per-window.
- Note: The IPC registry already binds per-window shortcuts at `main/ipc/index.js:1040`, so the globalShortcut registration in createWindow is redundant and harmful.

2. **Medium â€” COEP `require-corp` headers may block future external resources**
- Evidence:
  - `ensureCrossOriginIsolationHeaders()` at `main/index.js:41-49` sets `Cross-Origin-Embedder-Policy: require-corp` on ALL responses via `session.defaultSession.webRequest.onHeadersReceived`.
  - This header requires all loaded sub-resources (images, scripts, fonts) to have a `Cross-Origin-Resource-Policy` header or be same-origin.
  - Currently safe because the app only loads local files (`file://` protocol), but any future feature loading external resources (CDN fonts, external images, API calls) will silently fail with COEP violations.
- UX impact: None currently. Future breakage risk if external resources are added.
- Fix direction: Consider using `credentialless` instead of `require-corp` for COEP, or scope the headers to only apply to same-origin responses. Alternatively, document the constraint clearly.

3. **Medium â€” `showWindow` always forces windowed mode**
- Evidence:
  - `showWindow()` at `main/domains/window/index.js:251` unconditionally calls `w.setFullScreen(false)`.
  - Comment says "Normalize to windowed (do not force fullscreen)".
  - However, if the user was reading comics in fullscreen before hiding the window (BUILD14 hide-on-play), restoring the window will exit fullscreen without restoring the previous state.
- UX impact: User who was in fullscreen reading mode before launching a video will return to windowed mode unexpectedly.
- Fix direction: Capture `w.isFullScreen()` before hiding, restore it in `showWindow`. Or rely on the player_core domain's `__restoreWindowAfterPlayerExit` which already handles fullscreen restoration separately (checking `qtRestoreFullscreenOnReturn`). Verify that `showWindow` IPC is not called independently of that flow.

4. **Low â€” Launcher mode can leave app running if `app.quit()` silently fails**
- Evidence:
  - `app.on('window-all-closed')` at `main/index.js:623-626` returns early when `__isPlayerLauncherMode` is true (don't quit â€” Qt player is still running).
  - On Qt player exit, `__restoreWindowAfterPlayerExit` at `player_core/index.js:1048-1054` calls `app.quit()` wrapped in try/catch.
  - The `child.on('exit')` handler at `player_core/index.js:616-624` should always fire even on crash.
  - However: if `app.quit()` at line 1051 throws and is swallowed, or if `__state.launcherMode` was already cleared by spawn failure (line 657) before exit fires, the app becomes a zombie process with no windows.
- UX impact: Edge case â€” app may remain in Task Manager after Qt player crashes in specific race conditions. User must manually kill it.
- Fix direction: Add a safety timeout in launcher mode: if no windows exist and no Qt player process for N seconds, force quit. Or set `__isPlayerLauncherMode = false` in a finally-block in `__launchVideoFromFileAssoc` on error.

5. **Low â€” `__tankobanDidFinishLoad` set on `ready-to-show` may precede renderer readiness**
- Evidence:
  - `ready-to-show` at `main/index.js:371-375` sets `w.__tankobanDidFinishLoad = true` and calls `flushPendingOpenPaths(w)`.
  - `ready-to-show` fires when the window's content has finished painting for the first time, but the renderer's JS (preload + app scripts) may not have registered `ipcRenderer.on(EVENT.APP_OPEN_FILES)` yet.
  - `flushPendingOpenPaths` sends `EVENT.APP_OPEN_FILES` via `webContents.send` (line 293) which is fire-and-forget â€” if the listener isn't registered yet, the message is lost.
  - In practice, `loadFile().then()` fires after `ready-to-show`, and `w.show()` is called there â€” but the IPC listener registration in `src/domains/shell/core.js:89` depends on the full renderer bootstrap completing.
- UX impact: If comic files are queued and flushed during `ready-to-show`, the renderer may miss the `APP_OPEN_FILES` event. The user opens a .cbz via file association but the app shows an empty library.
- Fix direction: Have the renderer send a "ready" IPC message once its listeners are registered, then flush pending paths in response. Or use `webContents.once('did-finish-load')` instead of `ready-to-show` for the flag.

6. **Low â€” `pickUserDataDir` reads and parses JSON synchronously at module scope**
- Evidence:
  - `pickUserDataDir()` at `main/index.js:137-170` is called at line 172, which runs synchronously when `boot()` is called.
  - It calls `scoreUserDataDir()` (line 74) which calls `readJsonSafe()` to parse up to 4 JSON files per candidate directory, across 8 candidates = up to 32 synchronous file reads + JSON parses.
  - For users with large library indices (e.g. 10MB `library_index.json`), this adds measurable startup latency.
- UX impact: Cold start is slower than necessary. User sees a brief delay before the window appears.
- Fix direction: Cache the winning directory path to avoid re-scoring on subsequent launches. Or defer scoring to async and only use it on first launch / name migration.

7. **Info â€” `sandbox: false` is a deliberate tradeoff**
- Evidence:
  - `createWindow()` at `main/index.js:319` sets `sandbox: false` with an explanatory comment (lines 316-318).
  - This is required because the preload bridge uses `require()` across local CommonJS modules.
  - Disabling the sandbox reduces Electron's security isolation between renderer and main process.
- UX impact: None directly, but reduces defense-in-depth. A compromised renderer has more access to Node.js APIs.
- Fix direction: Accepted tradeoff per the comment. If ever migrating preload to ESM or a single bundled file, re-enable sandbox.

### UX impact summary
- Multi-window DevTools shortcut clobbering is dev-facing only but wastes debugging time.
- The `showWindow` fullscreen-exit behavior could surprise users who were in fullscreen before launching a video.
- The `ready-to-show` vs renderer-ready race could cause missed file associations (open-with fails silently).
- Launcher mode zombie is a rare edge case but requires Task Manager intervention.

### Underdevelopment
- No retry or fallback if `APP_OPEN_FILES` message is dropped between `ready-to-show` and renderer listener registration.
- Display metrics event handlers at `main/index.js:604-611` are registered as no-ops â€” presumably placeholders for future mpv resync.
- No mechanism to detect or recover from a launcher-mode zombie (no windows, no player, app still running).

### Prioritized fix backlog
1. Remove redundant `globalShortcut` registration from `createWindow()` (Medium, straightforward)
2. Defer `flushPendingOpenPaths` until renderer signals readiness instead of `ready-to-show` (Low-Medium, prevents missed file associations)
3. Preserve fullscreen state across hide/show cycle in window domain (Medium, UX improvement)
4. Add launcher-mode safety timeout (Low, edge case hardening)
5. Consider `credentialless` for COEP or scope headers (Low, future-proofing)

### Confidence
- Findings 1, 3, 5 verified by direct code reading with cross-referenced call sites.
- Finding 2 verified by reading header installation code; no current breakage but well-known COEP constraint.
- Finding 4 verified by tracing the full launcher mode lifecycle across main/index.js and player_core/index.js.
- Finding 6 verified by counting candidate directories and file read calls.
- Finding 7 informational, directly from code comment.

---

## C04 - Shell Core: App State And Shared UI Runtime

### Scope inspected
- `src/domains/shell/core.js` (2666 lines) â€” shared runtime spine: external open/DnD handlers, DOM refs (`el`), toast, context menu, ZIP reader, app state, scroll speed, control modes, thumbnails, refreshLibrary, view switching, boot flow

### Mechanisms in this chunk

- **External open / Drag-and-drop** (lines 28-118):
  - `enqueueExternalOpen()` queues incoming file paths; `flushPendingExternalOpen()` opens the first path when `bootReady` is true.
  - `onAppOpenFiles` IPC listener wires main â†’ renderer file association forwarding.
  - `document.addEventListener('drop')` handles DnD of .cbz/.cbr files.

- **DOM element refs** (`el` object, lines 122-377):
  - 130+ cached `$('#...')` selectors covering library, reader, player, settings, overlays.
  - Exported as `window.el` for cross-module access.

- **Context menu** (lines 495-579):
  - `showContextMenu({ x, y, items })` renders a reusable positioned menu.
  - Closes on outside left-click. Clamped to viewport.

- **App state** (`appState`, lines 1932-2040):
  - Central mutable object: library data, progress, active book, playback state, settings, UI state.
  - `appState.settings = { ...DEFAULTS }` with per-series overrides loaded via `loadSeriesSettings()`.
  - Token system for race-condition protection (`tokens.volume`, `tokens.nav`, `tokens.mode`, `tokens.open`).

- **View switching** (`setView`, line 2128):
  - Toggles `libraryView`/`playerView` visibility and `inPlayer` body class.
  - Entering library: closes comic session, resets HUD.
  - Entering player: hides library settings overlay, starts HUD auto-hide.

- **Library refresh** (`refreshLibrary`, line 2464):
  - Fetches `library.getState()` + `progress.getAll()` from main process.
  - Rebuilds `bookById` map, derived caches, schedules render.
  - Hooks `onUpdated` and `onScanStatus` listeners (once).

- **Boot flow** (lines 2615-2655):
  - `refreshLibrary()` â†’ `bootReady = true` â†’ flush pending opens â†’ check `openBookId` query param.
  - Guarded by `window.__tankoInitialBootStarted` to prevent double boot.

- **State namespace export** (lines 2658-2666):
  - `window.Tanko.state.app`, `.library`, `.settings` â€” one-time reference assignments.

- **Thumbnail pipeline** (lines 2260-2458):
  - Lazy IntersectionObserver-driven, concurrency-limited (3), with self-healing on corrupt thumbs.
  - Memory cache (`thumbMem`) + disk cache via IPC.

- **Scroll speed / control modes** (lines 820-1347):
  - 10 preset levels with auto-scroll scale factor.
  - 6 control modes (Long Strip, Auto, Auto Flip, Double Page variants).
  - Mode transitions handle y/pageIndex preservation, Auto Flip timer lifecycle.

### Findings (ordered by severity)

1. **High â€” Open-in-new-window query param mismatch: `book` vs `openBookId`**
- Evidence:
  - `main/index.js:377`: `w.loadFile(..., openBookId ? { query: { book: openBookId } } : {})` â€” sends query param named `book`.
  - `core.js:2627`: `const openId = (new URLSearchParams(window.location.search)).get('openBookId')` â€” reads query param named `openBookId`.
  - The param names don't match: main sends `?book=X` but renderer looks for `?openBookId=X`.
  - `openId` will always be `null`, so the open-in-new-window feature silently fails.
- UX impact: "Open in New Window" via `openBookInNewWindow()` creates a window that shows the library instead of opening the requested book. User must manually navigate to the book.
- Fix direction: Change either side to match. Simplest: change `core.js:2627` to `.get('book')`.

2. **Medium â€” `window.Tanko.state.library` and `.settings` become stale after reassignment**
- Evidence:
  - `core.js:2663-2665` sets `window.Tanko.state.app = appState`, `.library = appState.library`, `.settings = appState.settings`.
  - These are assigned once at boot using `||=` semantics.
  - `refreshLibrary()` at line 2468 does `appState.library = await Tanko.api.library.getState()` â€” replaces the entire `library` object.
  - After this, `window.Tanko.state.library` still points to the OLD object; `window.Tanko.state.app.library` points to the NEW one.
  - Similarly, `appState.settings = { ...DEFAULTS }` in `resetToDefaults()` (line 1742) or `resetSeriesSettings()` (line 1727) replaces the settings object, making `window.Tanko.state.settings` stale.
- UX impact: Any code reading `window.Tanko.state.library` (e.g., debug tools, external integrations) will see stale data after library refresh. Low practical impact since internal code uses `appState` directly.
- Fix direction: Use getters instead of direct assignment: `Object.defineProperty(window.Tanko.state, 'library', { get: () => appState.library })`.

3. **Medium â€” `confirmRemoveSeriesFromLibrary` dialog is missing `cancel` event handling (Esc/backdrop path)**
- Evidence:
  - `confirmRemoveSeriesFromLibrary()` at line 2505 binds only button clicks (`[data-act="cancel"]` and `[data-act="remove"]`) at lines 2532-2533.
  - It does not register `d.addEventListener('cancel', ...)`, unlike `confirmRemoveRootFolder()` at line 429.
  - On `<dialog>`, pressing Escape emits `cancel`; without mapping that to `finish(false)`, the Promise can remain unresolved and the flow can appear stuck.
- UX impact: Pressing Escape on the remove dialog can do nothing from the app's perspective, forcing extra clicks and making the confirm flow feel unreliable.
- Fix direction: Add a `cancel` listener that `preventDefault()` + `finish(false)`. Add a `done` guard too for parity/hardening.

4. **Medium â€” Rescan series context menu triggers full library scan instead of single-series scan**
- Evidence:
  - `openSeriesContextMenu()` at `core.js:2569-2573`: "Rescan series" action calls `await Tanko.api.library.scan({ force: true })` â€” this rescans the ENTIRE library.
  - The label says "Rescan series" but the action is a full scan.
  - Compare with the video sidebar which has `Tanko.api.video.scanShow(showPath)` for per-show rescan.
  - No `scanSeries(seriesPath)` API exists for comics â€” the only option is a full library scan.
- UX impact: User right-clicks a single series â†’ "Rescan series" â†’ waits for the entire library to rescan. Misleading label and unnecessarily slow.
- Fix direction: Rename label to "Rescan library" to be honest, or implement a targeted single-series rescan API.

5. **Low â€” Only the first dropped/opened file is processed; rest silently ignored**
- Evidence:
  - `flushPendingExternalOpen()` at `core.js:75-77`: `const first = paths[0]; const extra = Math.max(0, paths.length - 1); if (extra) toast(...)`.
  - Only the first file is passed to `openExternalFilePath()`. Extra files are discarded with a toast notification.
  - This is by design (the toast says "Opening 1 of N files (others ignored)") but the behavior is undiscoverable â€” user dragging 5 .cbz files expects all to open.
- UX impact: User expectation mismatch when dropping multiple files. The toast mitigates confusion but the behavior is still surprising.
- Fix direction: Consider opening additional files in new windows, or queueing them as a playlist.

6. **Low â€” `_splitKeyCache` grows unbounded until 8000 entries, then bulk clears**
- Evidence:
  - `core.js:800`: `if (_splitKeyCache.size > 8000) _splitKeyCache.clear()`.
  - When the cache exceeds 8000 entries, it clears entirely (not LRU eviction).
  - Immediately after clearing, subsequent sorts will re-populate, causing a burst of allocations.
  - With a large library (thousands of books), sorting after cache clear could cause a brief GC pause.
- UX impact: Negligible â€” sort performance temporarily degrades after cache clear. Self-recovers quickly.
- Fix direction: Consider LRU eviction or a WeakRef-based cache. Low priority.

7. **Info â€” `scheduleProgressSave` usage is an implicit cross-module dependency**
- Evidence:
  - `scheduleProgressSave` is called at `core.js:943,1254,1504,1541,1736,1750,1754,1762,1777,2232`.
  - It is defined in `src/domains/reader/state_machine.js:1019`, which is loaded through the deferred reader module chain in `src/state/deferred_modules.js`.
  - Most call sites are reader/settings flows; a pre-reader call path is possible but not yet confirmed as a live crash in production.
- UX impact: No confirmed user-facing breakage yet. This is primarily a maintainability/edge-case risk if a library-only path invokes it before reader modules load.
- Fix direction: Optional hardening: guard with `if (typeof scheduleProgressSave === 'function')` or expose a no-op stub before deferred reader load.

### UX impact summary
- Finding 1 (query param mismatch) completely breaks open-in-new-window. This is a live regression.
- Finding 3 (missing Esc/backdrop cancel handling) and Finding 4 (rescan label) are UX polish issues with clear fixes.
- Finding 7 is an unconfirmed edge-case hardening item, not a proven live regression.

### Underdevelopment
- Multi-file open is by design single-file-only (Finding 5) â€” could be a future playlist feature.
- `window.Tanko.state` namespace is one-time-assign and stales (Finding 2) â€” would need getters for live reflection.
- Confirmation dialog handling is inconsistent across similar flows (root-folder confirm is more defensive than series confirm).

### Prioritized fix backlog
1. Fix query param mismatch: `.get('book')` instead of `.get('openBookId')` (High, 1-character fix, restores open-in-new-window)
2. Add `cancel` event handling + `done` guard to `confirmRemoveSeriesFromLibrary` (Medium, small fix, prevents stuck/duplicate-close paths)
3. Rename "Rescan series" to "Rescan library" or implement targeted rescan (Medium, label fix or new API)
4. Use getters for `window.Tanko.state.library` / `.settings` (Low, prevents stale refs)

### Confidence
- Finding 1 verified by direct comparison of main/index.js:377 (sends `book`) vs core.js:2627 (reads `openBookId`). The names definitively don't match.
- Finding 2 verified by tracing reassignment in `refreshLibrary()` (line 2468) and `resetToDefaults()` (line 1742).
- Finding 3 verified by comparing confirmation dialog implementations side-by-side (lines 398-436 vs 2505-2538), specifically missing `cancel` handling in the series dialog.
- Finding 4 verified by reading the context menu action at line 2569-2573.
- Finding 7 is a conservative hardening note: the implicit dependency exists, but a reproducible pre-reader crash path has not been confirmed.

---

## C05 - Shell Bindings: Top Bar, Global Back, Refresh

### Scope inspected
- `src/domains/shell/shell_bindings.js` (161 lines) â€” top bar button wiring: tile density, hidden series (video thumbs toggle), drawer, back, refresh, window controls, scan cancel
- `src/index.html` (top bar section, lines 33-63) â€” header markup: `libMenuBtn`, `libBackBtn`, `libForwardBtn`, `refreshBtn`, mode switch, tile density, hidden series, search, window chrome

### Mechanisms in this chunk

- **Tile density toggle** (lines 7-31):
  - Binary toggle between `compact` (Medium) and `comfortable` (Large).
  - Persisted via `localStorage.setItem('tileDensity')`, applied via `document.body.dataset.tileDensity`.
  - Button label updated to reflect current state.

- **Hidden series / video thumbs dual-purpose button** (lines 33-46):
  - In Comics mode: falls through to existing hidden-series overlay wiring (not in this file).
  - In Videos mode: capture-phase click handler intercepts, calls `videoApp.toggleThumbs()` + `videoApp.syncThumbsBtn()`.
  - MutationObserver on body class (lines 48-54) keeps button label correct when switching modes.

- **Off-canvas drawer** (lines 56-100):
  - `libMenuBtn` toggles `libDrawerOpen` body class. Guarded against player view.
  - Backdrop click and Escape key close the drawer.
  - Focus management: first button in `.libSidebar` receives focus on open.

- **Refresh button** (lines 102-108):
  - In video mode: delegates to `videoApp.refresh()`.
  - In comics mode: calls `refreshLibrary()`.

- **Scan cancel** (lines 110-118):
  - Calls `Tanko.api.library.cancelScan()`.

- **Back button** (lines 120-129):
  - In video mode: delegates to `videoApp.back()`.
  - In comics mode: simulates click on `seriesBackBtn` if a series is selected.

- **Window chrome** (lines 131-158):
  - Library: `minimizeBtn`, `libFsBtn`, `closeBtn`.
  - Player: `playerMinBtn`, `playerFsBtn`, `playerCloseBtn`.
  - Fullscreen sync via `syncLibraryFullscreenBtn()` / `syncPlayerFullscreenBtn()` from reader domain.

- **Series back** (lines 141-144):
  - Clears `appState.selectedSeriesId` and calls `renderLibrary()`.

### Findings (ordered by severity)

1. **Medium â€” `libForwardBtn` exists in HTML but is completely dead (no binding, permanently disabled)**
- Evidence:
  - `index.html:37`: `<button id="libForwardBtn" class="iconBtn" title="Forward" aria-label="Forward" disabled>â–¶</button>`
  - `core.js:125`: `libForwardBtn: $('#libForwardBtn')` â€” cached in `el`.
  - Grep across entire `src/` finds NO event listener, NO enable logic, NO click handler for `libForwardBtn`.
  - The button is permanently visible (no `hidden` class) and permanently `disabled`.
- UX impact: Dead UI element takes up space in the top bar. Confusing for users who see a Forward button that never activates.
- Fix direction: Either remove the button from HTML and `el` (if forward navigation is not planned), or implement forward navigation with a navigation stack in `appState`.

2. **Medium â€” `el.playerMinBtn` and `el.playerCloseBtn` accessed without null guard**
- Evidence:
  - `shell_bindings.js:146`: `el.playerMinBtn.addEventListener('click', ...)` â€” no `if (el.playerMinBtn)` guard.
  - `shell_bindings.js:154`: `el.playerCloseBtn.addEventListener('click', ...)` â€” no guard.
  - These elements exist in `reader_view.html:265,268`, loaded via synchronous XHR at `index.html:741-748`.
  - If the XHR fails (network error, file not found in packaged build), `el.playerMinBtn` and `el.playerCloseBtn` are `null`, and `addEventListener` throws `TypeError`.
  - Compare: `el.playerFsBtn` at line 147 IS guarded with `if (el.playerFsBtn)`. The inconsistency suggests the guards were forgotten for min/close.
  - Also compare: `el.libFsBtn` at line 132 and `el.libMenuBtn` at line 75 are properly guarded.
- UX impact: If reader_view.html fails to load, the IIFE throws and ALL subsequent bindings (including critical close/minimize buttons for the library view) may not execute, leaving the window without functional controls.
- Fix direction: Add `if (el.playerMinBtn)` and `if (el.playerCloseBtn)` guards, matching the pattern used for `el.playerFsBtn`.

3. **Medium â€” `el.refreshBtn` and `el.seriesBackBtn` accessed without null guard**
- Evidence:
  - `shell_bindings.js:102`: `el.refreshBtn.addEventListener('click', ...)` â€” no guard.
  - `shell_bindings.js:141`: `el.seriesBackBtn.addEventListener('click', ...)` â€” no guard.
  - Both elements exist in `index.html` (lines 38 and 138 respectively), so they should always be present.
  - However, the IIFE pattern means any single null element access would crash the entire function, preventing all subsequent bindings from executing.
  - All other non-chrome elements in the file use guards (`if (el.tileDensityBtn)`, `if (el.hiddenSeriesBtn)`, `if (el.libMenuBtn)`, etc.).
- UX impact: Same as Finding 2 â€” if either element is missing (unlikely but possible with DOM mutations), all subsequent bindings fail.
- Fix direction: Add null guards for consistency and defensive robustness.

4. **Low â€” Escape handler for drawer doesn't check input focus**
- Evidence:
  - `shell_bindings.js:94-100`: Escape keydown handler checks `libDrawerOpen` and `inPlayer` but doesn't check if the user is typing in an input/textarea/select.
  - If the drawer is open and the user is typing in `#globalSearch` (inside the top bar, not inside the drawer), pressing Escape will close the drawer instead of canceling the search input.
  - Compare: the video keyboard handler in C17 was found to have similar input-focus issues.
- UX impact: Minor â€” Escape in search field closes the drawer (unexpected side effect). Low probability since the drawer and search are rarely open simultaneously.
- Fix direction: Add an `isTypingTarget(e.target)` check, or move the Escape handler to fire after the search clear handler.

5. **Low â€” `libBackBtn` does nothing when in comics mode with no series selected**
- Evidence:
  - `shell_bindings.js:122-128`: In comics mode, the handler only acts `if (appState.selectedSeriesId && el.seriesBackBtn)`.
  - If no series is selected (user is on the home/grid view), clicking Back does nothing â€” no feedback, no navigation, no toast.
  - The button remains visually enabled and clickable.
- UX impact: Clicking Back on the home view feels broken â€” button appears active but does nothing. Minor since there's nowhere to go back to.
- Fix direction: Either disable `libBackBtn` when `!appState.selectedSeriesId` (sync on render), or add a visual disabled state.

6. **Info â€” Window chrome buttons are `winChromeHidden` class (hidden in normal builds)**
- Evidence:
  - `index.html:59-62`: `minimizeBtn`, `libFsBtn`, `closeBtn` all have class `winChromeHidden`.
  - Comment says "Build 36: Windows provides native title bar controls now (hidden, but kept for legacy bindings)."
  - The buttons are hidden via CSS but still have active event listeners registered.
- UX impact: None â€” hidden buttons with working listeners are harmless. The listeners serve as fallbacks if the CSS class is removed (e.g., frameless mode).
- Fix direction: None needed. Informational.

### UX impact summary
- The dead Forward button (Finding 1) is visible UI clutter.
- Missing null guards (Findings 2-3) create a fragile IIFE where one missing element breaks all subsequent bindings.
- The Escape/search interaction (Finding 4) is a minor UX rough edge.

### Underdevelopment
- `libForwardBtn` was added to HTML with no implementation â€” forward navigation is unimplemented.
- No visual disabled state for `libBackBtn` when there's nothing to go back to.
- No keyboard shortcut for the library drawer (only button + Escape to close).

### Prioritized fix backlog
1. Add null guards for `el.playerMinBtn`, `el.playerCloseBtn`, `el.refreshBtn`, `el.seriesBackBtn` (Medium, 4-line fix, prevents IIFE crash cascade)
2. Remove or hide `libForwardBtn` from HTML (Medium, dead UI cleanup)
3. Add typing-target check to Escape drawer handler (Low, prevents search interaction conflict)
4. Disable `libBackBtn` when no series selected in comics mode (Low, UX polish)

### Confidence
- Finding 1 verified by exhaustive grep: `libForwardBtn` has zero event listeners anywhere in `src/`.
- Findings 2-3 verified by reading shell_bindings.js line-by-line and comparing guarded vs unguarded element accesses.
- Finding 4 verified by reading the Escape handler at lines 94-100 â€” no input-focus check.
- Finding 5 verified by reading the Back handler at lines 122-128 â€” conditional only fires when series is selected.

---

## C03 - Persistence Foundation

### Scope inspected
- `main/lib/storage.js` (152 lines) â€” centralized persistence: `dataPath`, `readJSON`, `writeJSON` (async atomic), `writeJSONDebounced`, `flushAllWrites`
- `main/domains/progress/index.js` (91 lines) â€” comic reading progress (in-memory cache + debounced writes)
- `main/domains/videoProgress/index.js` (96 lines) â€” video playback progress (same pattern)
- `main/domains/videoSettings/index.js` (97 lines) â€” video player settings with legacy migration
- `main/domains/videoUi/index.js` (80 lines) â€” video UI state persistence
- `main/domains/seriesSettings/index.js` (78 lines) â€” per-series reading preferences

### Mechanisms in this chunk

- **Atomic JSON writes** (`writeJSON` at `storage.js:55`):
  - Writes to temp file â†’ rename â†’ backup copy pattern
  - Async with retry logic (3 attempts, 50ms delay between retries)
  - Windows fallback: `copyFile` + `unlink` when `rename` fails on existing target
  - Performance logging for writes >10ms

- **Debounced writes** (`writeJSONDebounced` at `storage.js:115`):
  - 150ms default delay, coalesces frequent writes to same file
  - Map of `filePath â†’ { timer, latestObj }` â€” last-write-wins within debounce window
  - Errors silently swallowed in timer callback

- **Flush-all** (`flushAllWrites` at `storage.js:135`):
  - Iterates pending debounced writes, cancels timers, writes immediately
  - Returns Promise.all for all pending writes

- **Read with backup restore** (`readJSON` at `storage.js:33`):
  - Primary read â†’ fallback to `.bak` file â†’ fallback to provided default
  - On backup restore, rewrites primary file from backup

- **In-memory caching pattern** (all 5 domain modules):
  - Module-level `let xxxMem = null` â€” loaded lazily on first access from disk
  - All mutations go through the in-memory cache â†’ debounced write to disk
  - Cache never invalidated after initial load

- **Legacy migration** (`videoSettings/index.js:36`):
  - One-time migration from `video_settings.json` â†’ `video_prefs.json`
  - Debounced write of new file + synchronous delete of legacy file

- **Dual write system** (IPC registry at `ipc/index.js:151-196` vs `storage.js`):
  - The IPC registry has its own local `writeJSONSafe` (sync) and `writeJSONDebounced` with a separate debounce map
  - Domain modules use `ctx.storage.writeJSONDebounced` from `storage.js`
  - Both can target the same files (e.g., `progress.json`)

### Findings (ordered by severity)

1. **High â€” `flushAllWrites()` is never called â€” pending writes lost on quit**
- Evidence:
  - `flushAllWrites()` is defined at `storage.js:135` and exported at line 150.
  - Grep across entire codebase shows zero callers â€” it is only referenced in its own definition and export.
  - `main/index.js:628` has comment "before-quit cleanup handled in IPC registry where state lives" but no `before-quit` handler exists in the IPC registry (`main/ipc/index.js` â€” confirmed via grep for `before-quit`).
  - `main/index.js:621` only has `will-quit` handler that unregisters global shortcuts.
  - The IPC registry's own `debouncedJSONWrites` map (line 181) is also never flushed.
- UX impact: User saves reading progress, closes app within 150ms â†’ progress lost. Happens most visibly when user closes app immediately after changing a page or saving video progress. User reopens app and finds they've been "sent back" to an earlier position.
- Fix direction: Add `app.on('before-quit', async (e) => { e.preventDefault(); await storage.flushAllWrites(); app.exit(); })` in main/index.js or IPC registry. Also flush the IPC registry's local debounce map.

2. **High â€” Progress pruning is dead code (`getProgressMem` undefined in IPC registry)**
- Evidence:
  - `pruneProgressByRemovedBookIds()` at `ipc/index.js:711-723` calls `getProgressMem()` at line 716.
  - `getProgressMem` is **never defined** in `ipc/index.js`. The function exists only in `progress/index.js:20` and is exported as `_getProgressMem`.
  - The IPC registry imports `const progress = require('../domains/progress')` at line 50, so the correct call would be `progress._getProgressMem(ctx)`.
  - The `ReferenceError` is silently swallowed by the `try {} catch {}` at line 714.
  - This means book progress entries are never pruned when books are removed from the library â€” `progress.json` grows unboundedly.
- UX impact: `progress.json` accumulates stale entries for deleted/removed books indefinitely. Over time, file grows larger, increasing load time and memory usage. No functional breakage (progress data for existing books is unaffected), but storage waste.
- Fix direction: Change line 716 to `const all = progress._getProgressMem(ctx);` and line 721 to `ctx.storage.writeJSONDebounced(...)` (or the IPC local equivalent with correct debounce map).

3. **Medium â€” Dual write systems can race on the same file (conditional on fixing Finding 2)**
- Evidence:
  - `storage.js:108` has its own `debouncedJSONWrites` map.
  - `ipc/index.js:181` has a **separate** `debouncedJSONWrites` map.
  - Both systems target `progress.json`:
    - Domain: `progress/index.js:54` â†’ `ctx.storage.writeJSONDebounced(p, all)`
    - IPC registry: `ipc/index.js:721` â†’ `writeJSONDebounced(dataPath('progress.json'), all, 50)` (local version)
  - Currently Finding 2 means the IPC path is dead, but if Finding 2 is fixed, both paths would write `progress.json` through separate debounce timers.
  - Similarly, `library/index.js:266,619` uses `ctx.storage.writeJSONDebounced` for `progress.json` while the IPC prune path uses the local one.
  - Two concurrent pending writes to the same file from different debounce maps â†’ last timer wins, potentially overwriting the other's data.
- UX impact: If Finding 2 is fixed without addressing this, a library rescan that prunes progress could race with a progress save from the renderer, resulting in either stale entries surviving or fresh progress being lost. This is not the active runtime path today because Finding 2 currently keeps prune writes dead.
- Fix direction: Consolidate to a single write system. Remove the IPC registry's local `writeJSONSafe`/`writeJSONDebounced` and have all code use `ctx.storage.*`. Or at minimum ensure both paths share the same debounce map instance. Treat this as the immediate follow-up to Finding 2.

4. **Medium â€” videoSettings migration deletes source before target is written**
- Evidence:
  - `getVideoSettingsMem()` at `videoSettings/index.js:42-49`:
    - Line 45: `ctx.storage.writeJSONDebounced(prefsPath, legacy)` â€” schedules async write for 150ms later
    - Line 46: `try { fs.unlinkSync(legacyPath); } catch {}` â€” synchronously deletes legacy file immediately
  - Between line 46 and the debounced write completing (~150ms later), neither file exists on disk.
  - If app crashes in that window, both files are gone â€” user loses all video settings.
  - The in-memory cache (`videoSettingsMem = legacy`) is set correctly, so the app works until it quits. But on next launch, both files missing â†’ empty settings.
- UX impact: One-time data loss on first launch after migration if the app crashes within 150ms. Low probability but irreversible.
- Fix direction: Use `await ctx.storage.writeJSON(prefsPath, legacy)` (non-debounced, immediate write) for the migration, then delete the legacy file after the write succeeds. Or keep the legacy file until next successful launch confirms `video_prefs.json` exists.

5. **Medium â€” In-memory caches never invalidated after initial load**
- Evidence:
  - All 5 domains use `let xxxMem = null` with a getter that loads from disk once:
    - `progress/index.js:14`: `let progressMem = null`
    - `videoProgress/index.js:14`: `let videoProgressMem = null`
    - `videoSettings/index.js:17`: `let videoSettingsMem = null`
    - `videoUi/index.js:14`: `let videoUiStateMem = null`
    - `seriesSettings/index.js:14`: `let seriesSettingsMem = null`
  - Grep confirms none of these variables are ever set back to `null` after their initial assignment.
  - External modifications to JSON files (manual editing, migration tools, multiple processes) are invisible until app restart.
- UX impact: Not a current functional issue (only the app writes these files). But prevents future features like import/export, multi-window state sharing, or external tooling from working without app restart.
- Fix direction: Add a `resetCache()` method to each domain, callable via IPC for dev/maintenance purposes.

6. **Medium â€” Debounced write errors silently swallowed**
- Evidence:
  - `storage.js:124`: `try { await writeJSON(p, cur.latestObj); } catch {}`
  - `ipc/index.js:192`: `try { writeJSONSafe(p, cur.latestObj); } catch {}`
  - Both debounce systems discard write errors with empty catch blocks.
  - The domain handlers (e.g., `progress.save()` at `progress/index.js:50-56`) return `{ ok: true }` before the debounced write even fires â€” the caller has no way to know the write failed.
  - Disk-full, permission denied, or path-too-long errors are invisible to the user.
- UX impact: User believes progress was saved, but it wasn't. Next launch shows stale state. No error message or retry.
- Fix direction: Add `console.error` logging in the catch blocks at minimum. Consider a write-failure counter and periodic "save failed" warning event to the renderer.

7. **Low â€” `writeJSON` Windows rename fallback can produce partial writes**
- Evidence:
  - `storage.js:74-80`: On Windows, `fs.promises.rename(tmp, p)` fails if `p` exists.
  - Fallback: `await fs.promises.copyFile(tmp, p)` â€” this is NOT atomic; if the app crashes during `copyFile`, the target file can be truncated/partial.
  - The `.bak` file at line 83 mitigates this: `readJSON` will fall back to the backup if the primary file is corrupted.
  - However, the backup is updated AFTER the primary write (line 83), so backup reflects the previous good state, not the intended new state.
- UX impact: On crash during write, user loses only the most recent save (reverts to previous backup state). Low probability but worth noting.
- Fix direction: On Windows, consider using `fs.promises.rename` with an intermediate step: unlink target first, then rename. Or use a platform-specific atomic write library.

8. **Info â€” No schema validation on persisted data**
- Evidence:
  - `progress.save()` at `progress/index.js:53`: `all[bookId] = { ...progress, updatedAt: Date.now() }` â€” spreads arbitrary object from renderer.
  - `videoProgress.save()` at `videoProgress/index.js:56-60`: Same pattern, spreads renderer-provided keys.
  - All domain `save()` handlers accept arbitrary objects and persist them without key whitelisting.
- UX impact: Not a current security issue (contextIsolation is on, data is JSON-serialized). But a compromised renderer could bloat persisted files with arbitrary data.
- Fix direction: Consider adding key whitelists for each domain's save handler.

### UX impact summary
- Finding 1 (flushAllWrites) is the most impactful: users can lose the last 150ms of progress saves on every normal quit. This is likely the root cause of intermittent "lost my place" reports.
- Finding 2 (dead progress pruning) causes unbounded growth of progress.json but no immediate functional breakage.
- Finding 3 (dual write race) is conditional today because Finding 2 keeps the prune path dead, but it becomes important immediately after Finding 2 is fixed.
- Finding 4 (migration data loss) is a one-time risk, mitigated by the low probability of crashes in the 150ms window.

### Underdevelopment
- `flushAllWrites` was designed but never integrated into the app lifecycle.
- The dual write system (storage.js vs IPC registry local) suggests an incomplete migration from the monolithic IPC registry to the domain module architecture.
- No mechanism exists to reload persisted state from disk without app restart.
- No write-failure notification to the user.

### Prioritized fix backlog
1. Wire `flushAllWrites()` into `before-quit` lifecycle (High, 5-minute fix, prevents data loss)
2. Fix `getProgressMem` reference in IPC registry `pruneProgressByRemovedBookIds` (High, 1-line fix, restores progress pruning)
3. Consolidate dual write systems or share debounce maps (Medium, architectural follow-up after #2, prevents write races)
4. Use immediate `writeJSON` for videoSettings migration, delete legacy after (Medium, prevents migration data loss)
5. Add `console.error` logging to debounced write catch blocks (Medium, 2-line fix, makes failures observable)
6. Add cache invalidation methods to domain modules (Low, future-proofing)
7. Consider Windows-safe atomic rename strategy (Low, edge case)

### Confidence
- Finding 1 verified by exhaustive grep: `flushAllWrites` has zero callers. `before-quit` handler does not exist.
- Finding 2 verified by grep: `getProgressMem` is never defined in `ipc/index.js`. The only definition is in `progress/index.js:20` which requires `ctx`. The call at line 716 would throw `ReferenceError`, caught by `try/catch`.
- Finding 3 verified by reading both debounce map declarations (`storage.js:108` and `ipc/index.js:181`) and tracing callers to `progress.json`; impact is explicitly conditional on fixing Finding 2.
- Finding 4 verified by reading the exact line sequence: debounced write (line 45) then synchronous delete (line 46).
- Findings 5-8 verified by reading all 5 domain modules and confirming the patterns are consistent across all of them.

## C06 - Comics Library Sidebar Tree And Root/Series Actions

### Scope inspected
- `src/domains/library/library.js` (`renderSidebarFolders`)
- `src/domains/shell/core.js` (`openSeriesContextMenu`, `confirmRemoveSeriesFromLibrary`)
- `src/domains/reader/volume_nav_overlay.js` (sidebar add-root/add-series button bindings)
- `src/index.html` (library sidebar tree and action buttons)

### Mechanisms in this chunk
- Sidebar folder tree rendering:
  - `renderSidebarFolders()` in `src/domains/library/library.js:279`.
  - Focus and selection state: `appState.ui.folderFocusRoot`, `appState.selectedSeriesId`.
  - Root->children grouping with loose-series fallback.
- Root actions (context menu):
  - Rescan root, reveal path, remove root in `src/domains/library/library.js:371-423`.
- Series actions (context menu):
  - Open/reveal/rescan/remove in `src/domains/shell/core.js:2541-2604`.
- Sidebar add actions:
  - `#addRootBtn`, `#addSeriesBtn` in `src/index.html:77`, `src/index.html:86`.
  - Event handlers registered in `src/domains/reader/volume_nav_overlay.js:608-642`.

### Findings (ordered by severity)

1. **High - Sidebar add-root/add-series actions are deferred behind reader module load**
- Evidence:
  - Buttons exist in `src/index.html:77` and `src/index.html:86`.
  - Their click handlers are only in `src/domains/reader/volume_nav_overlay.js:608-642`.
  - Reader overlay module is loaded lazily through `ensureReaderModulesLoaded()` in `src/state/deferred_modules.js:74-93`, which is triggered from deferred `openBook` wrapper at `src/state/deferred_modules.js:113-116`.
  - No equivalent eager bindings exist in `src/domains/library/library.js`.
- Why it matters:
  - On cold boot (before opening any book), core sidebar management actions can appear present but not respond.
- Fix direction:
  - Move sidebar library-management bindings (`addRootBtn`, `addSeriesBtn`) into an eagerly loaded library/shell module, or load a minimal non-reader binder at startup.

2. **Medium - Root/series "Rescan" labels imply scoped actions but both trigger full-library scans**
- Evidence:
  - Root context menu label `"Rescan this root"` at `src/domains/library/library.js:382` calls `Tanko.api.library.scan({ force: true })` at line 384.
  - Series context menu label `"Rescan series"` at `src/domains/shell/core.js:2568` also calls full scan at line 2570.
  - Both flows refresh and toast regardless of the call outcome (`catch {}` + optimistic refresh/toast) at `src/domains/library/library.js:384-386` and `src/domains/shell/core.js:2570-2572`.
- Why it matters:
  - Users expect narrow rescans but get whole-library work, plus misleading "refreshing" feedback on failures.
- Fix direction:
  - Implement scoped scan APIs (`scanRoot`, `scanSeries`) or rename to "Rescan library" and show explicit failure feedback.

3. **Medium - Tree accessibility semantics are incomplete**
- Evidence:
  - Container declares `role="tree"` in `src/index.html:87`.
  - Items are plain `<button>` elements created in `src/domains/library/library.js:315-331` with no `role="treeitem"`, `aria-level`, or expand/collapse semantics.
  - No tree keyboard model (ArrowUp/ArrowDown/ArrowLeft/ArrowRight) is implemented in `renderSidebarFolders()`.
- Why it matters:
  - Keyboard and assistive-technology behavior is below production expectations for a hierarchical navigation tree.
- Fix direction:
  - Add treeitem semantics and a basic arrow-key tree navigation model.

4. **Low - Root-child grouping has edge-case misclassification and scales as O(roots * series)**
- Evidence:
  - Child grouping is recomputed by filtering all series per root in `src/domains/library/library.js:302-306`.
  - Prefix check requires `root + '/'`, so a series path equal to the root path is treated as "loose" (`startsWith(prefix)` at line 305, loose fallback at line 311).
- Why it matters:
  - Edge-case folder layouts can look inconsistent, and large libraries pay avoidable repeated grouping cost per render.
- Fix direction:
  - Pre-index series by normalized root and include exact-path equality in grouping logic.

### Plain-language UX impact
- Issue 1:
  - What users feel: sidebar "Add root" / "Add series" can feel dead until other actions load reader code.
  - After fix: library setup actions work immediately on startup.
- Issue 2:
  - What users feel: "rescan this root/series" takes too long and seems to rescan everything.
  - After fix: scan actions match the label and give honest success/failure feedback.
- Issue 3:
  - What users feel: folder tree navigation feels mouse-first and less accessible from keyboard.
  - After fix: tree navigation behaves like a proper desktop file tree.
- Issue 4:
  - What users feel: occasional odd grouping in edge folder setups; slower redraws on very large libraries.
  - After fix: stable grouping and better scaling.

### Underdevelopment vs finished-product expectation
- Sidebar management actions are still coupled to deferred reader-loading infrastructure.
- Hierarchical navigation is visually present but lacks full tree semantics and keyboard UX.
- Action labeling and backend scan scope are not aligned.

### Prioritized fix backlog
1. Move `addRootBtn` and `addSeriesBtn` bindings out of deferred reader module (High)
2. Make root/series rescan semantics honest (scoped scan or relabel) and add failure feedback (Medium)
3. Add treeitem ARIA + arrow-key navigation for `#sidebarFoldersTree` (Medium)
4. Optimize root-child grouping and handle root-equals-series path edge case (Low)

### Confidence and unknowns
- High confidence:
  - Finding 1: binding locations and deferred load path are explicit and traceable.
  - Finding 2: scan calls are unambiguously full-library in both root and series menus.
- Medium confidence:
  - Finding 3: accessibility gap is clear, but impact varies by user input method.
  - Finding 4: performance impact depends on library size and render frequency.

### Suggested next chunk
- `C07` (Continue shelf, series grid, and global search behavior).

## C07 - Comics Library Continue Shelf, Series Grid, And Search

### Scope inspected
- `src/domains/library/library.js` (`renderContinue`, `renderSeriesGrid`, search index and results rendering)
- `src/domains/reader/volume_nav_overlay.js` (continue/search control event bindings)
- `src/domains/shell/core.js` (series context-menu remove confirmation parity reference)

### Mechanisms in this chunk
- Continue shelf:
  - Data hydration from `appState.progressAll` + `bookById` + `bookByIdExtra` in `src/domains/library/library.js:134-223`.
  - Per-tile actions and context menu in `src/domains/library/library.js:47-132`, `src/domains/library/library.js:245-269`.
- Series grid:
  - Grid card rendering and card actions in `src/domains/library/library.js:480-540`.
  - Quick remove button and right-click context menu entry points.
- Global search:
  - Index build in `src/domains/library/library.js:938-996`.
  - Ranked candidate retrieval in `src/domains/library/library.js:1010-1045`.
  - Results rendering/selection/activation in `src/domains/library/library.js:1142-1214`.
  - Input/keyboard/outside-click bindings in `src/domains/reader/volume_nav_overlay.js:765-839`.

### Findings (ordered by severity)

1. **High - Continue/search controls are bound in deferred reader module instead of eager library runtime**
- Evidence:
  - Continue controls: `hideFinishedToggle` and `clearContinueBtn` handlers in `src/domains/reader/volume_nav_overlay.js:738-763`.
  - Search controls: `globalSearch` handlers in `src/domains/reader/volume_nav_overlay.js:801-830`.
  - Reader overlay module is lazy-loaded (`src/state/deferred_modules.js:74-93`) via deferred `openBook` wrapper (`src/state/deferred_modules.js:113-116`).
  - `src/domains/library/library.js` renders these features but does not bind their input events.
- Why it matters:
  - On startup, core discovery controls (search and continue filters/actions) can appear but not react until reader modules are pulled in.
- Fix direction:
  - Register library-mode continue/search listeners in an eager module; keep reader-specific behavior behind deferred load.

2. **Medium - Series grid quick-remove bypasses confirmation while context-menu remove asks for confirmation**
- Evidence:
  - Grid remove button directly deletes series in `src/domains/library/library.js:513-524`.
  - Context-menu remove path asks for confirmation in `src/domains/shell/core.js:2577-2581`.
- Why it matters:
  - Inconsistent safety model increases accidental removal risk from a small "X" target.
- Fix direction:
  - Reuse the same confirmation flow for grid quick-remove, or add an undo toast.

3. **Medium - Search relevance scoring is mostly overridden by post-sort**
- Evidence:
  - Ranked search returns score-sorted candidates in `src/domains/library/library.js:1010-1045`.
  - Results are then sorted alphabetically in `src/domains/library/library.js:1077` (series) and `src/domains/library/library.js:1094` (books).
- Why it matters:
  - Best textual matches may be pushed below weaker ones due purely to alphabetic order.
- Fix direction:
  - Keep score order as primary; apply alphabetical tie-break only for equal/near-equal scores.

4. **Medium - Enter key can activate stale search results under debounce timing**
- Evidence:
  - Input handler debounces rendering by 70ms in `src/domains/reader/volume_nav_overlay.js:801-807`.
  - Enter handler activates current selection immediately in `src/domains/reader/volume_nav_overlay.js:820-823` without forcing immediate render or flushing timer.
- Why it matters:
  - Fast type + Enter can open previous-query results or no result.
- Fix direction:
  - On Enter, clear pending timer and force render before activation.

5. **Low - Result click path relies on hover to update selected index**
- Evidence:
  - Selection index is updated on `mouseenter` in `src/domains/library/library.js:1195`.
  - Click handler calls `activateGlobalSearchSelection()` without explicitly setting index from clicked item in `src/domains/library/library.js:1196`.
- Why it matters:
  - On non-hover input modalities, click/tap can target a different item than expected.
- Fix direction:
  - Set selection from clicked item index before activation.

### Plain-language UX impact
- Issue 1:
  - What users feel: search/continue controls can feel inactive until they open a book first.
  - After fix: discovery controls work immediately at app launch.
- Issue 2:
  - What users feel: clicking the grid "X" can remove a series too quickly by mistake.
  - After fix: remove behavior is safer and consistent across entry points.
- Issue 3:
  - What users feel: search results look alphabetic, not "best match first."
  - After fix: top results better match what users typed.
- Issue 4:
  - What users feel: typing a query and pressing Enter quickly can open wrong/old result.
  - After fix: Enter always targets current query results.
- Issue 5:
  - What users feel: occasional click/tap mismatch in result activation.
  - After fix: clicked result is always the activated one.

### Underdevelopment vs finished-product expectation
- Continue/search interactions are too tightly coupled to deferred reader overlay code.
- Search has a strong indexing/ranking core but final ordering and activation timing are not polished.
- Series grid safety patterns are inconsistent across action surfaces.

### Prioritized fix backlog
1. Move continue/search input bindings to eager library runtime (High)
2. Add confirmation/undo parity for series quick-remove in grid (Medium)
3. Preserve score-first ordering in global search results (Medium)
4. Flush debounce and re-render before Enter activation (Medium)
5. Set search selection on clicked result before activation (Low)

### Confidence and unknowns
- High confidence:
  - Findings 1-4 are directly traceable to code paths with unambiguous behavior.
- Medium confidence:
  - Finding 5 impact depends on input modality (mouse vs touch/pen/assistive input).

### Suggested next chunk
- `C08` (volume table/selection model and volume controls).

## C08 - Comics Library Volume Table And Selection Model

### Scope inspected
- `src/domains/library/library.js` (`renderVolumes`, caching, virtualization, selection, delegates)
- `src/domains/reader/volume_nav_overlay.js` (volume controls wiring)
- `src/domains/shell/core.js` (progress mutation path affecting cache invalidation)
- `src/index.html` (volume table shell)

### Mechanisms in this chunk
- Volume list derivation and caching:
  - `getCachedVisibleVolumes()` and `clearVolumeCacheIfNeeded()` in `src/domains/library/library.js:552-611`.
- Virtualized row rendering:
  - `mountVolumeRows()` in `src/domains/library/library.js:635-717`.
- Selection model:
  - `setVolumeSelectionByIndex()` and visibility sync in `src/domains/library/library.js:613-752`.
  - Selection persistence via `appState.ui.volSelBookId`.
- Table interactions:
  - click/double-click/contextmenu/keyboard delegates in `src/domains/library/library.js:754-808`.
- Volume controls:
  - sort/search/open/hide-preview handlers in `src/domains/reader/volume_nav_overlay.js:699-727`.

### Findings (ordered by severity)

1. **High - Volume controls are deferred behind reader module load**
- Evidence:
  - `volSort`, `volSearch`, `clearVolSearch`, `volOpenBtn`, and `volHidePreviewToggle` handlers are bound in `src/domains/reader/volume_nav_overlay.js:699-727`.
  - That module is lazy-loaded via `ensureReaderModulesLoaded()` in `src/state/deferred_modules.js:74-93`.
  - Volume table UI is rendered from `src/domains/library/library.js` before deferred reader load.
- Why it matters:
  - Core volume-table controls can appear unresponsive until a book is opened at least once.
- Fix direction:
  - Move library-mode volume control bindings to eager code path.

2. **Medium - Last-read sorting cache can become stale due reference-only invalidation**
- Evidence:
  - Cache invalidation only checks object references in `src/domains/library/library.js:553-557`.
  - Cached sort output is reused by key in `src/domains/library/library.js:563-565`.
  - Progress can be mutated in place (`appState.progressAll[id] = ...`) in `src/domains/shell/core.js:2222-2227`, which does not change the `progressAll` object reference.
- Why it matters:
  - `lastread` order may not refresh immediately after reading progress updates.
- Fix direction:
  - Add a progress-version token to cache key/invalidation, or avoid in-place progress mutations for paths that affect sorting.

3. **Medium - Row context menu does not sync table selection**
- Evidence:
  - Contextmenu handler resolves row/book in `src/domains/library/library.js:778-786` but does not call `setVolumeSelectionByIndex(...)`.
  - Selection and preview state are driven by `appState.ui.volSelBookId` and `setVolumeSelectionByIndex()` (`src/domains/library/library.js:726-751`).
- Why it matters:
  - Right-clicking one row while another is selected can leave preview/open-toolbar state visually out of sync with user intent.
- Fix direction:
  - Set selection to the context-clicked row before showing the menu.

4. **Low - Keyboard row navigation requires manual focus acquisition**
- Evidence:
  - Keyboard logic is attached to `el.volumesGrid` in `src/domains/library/library.js:800-807`.
  - Grid is made focusable (`tabIndex`) in `src/domains/library/library.js:894` but is not auto-focused when entering series view.
- Why it matters:
  - Arrow/Home/End can appear broken until the grid is clicked or tab-focused.
- Fix direction:
  - Optionally focus the grid when series view opens, or provide a visible focus affordance/hint.

5. **Low - Pages column is rendered as a static placeholder**
- Evidence:
  - Volume row markup hardcodes pages cell to em dash in `src/domains/library/library.js:698`.
- Why it matters:
  - Table exposes a "Pages" column with no actual value, which feels unfinished.
- Fix direction:
  - Hydrate pages from available metadata or remove/hide column until data is present.

### Plain-language UX impact
- Issue 1:
  - What users feel: sort/search/open/preview toggles in the volume area can feel dead on fresh boot.
  - After fix: volume controls respond immediately.
- Issue 2:
  - What users feel: "Last read" order can lag behind what they just read.
  - After fix: sorting reflects latest reading activity right away.
- Issue 3:
  - What users feel: right-click row actions and selected preview can disagree.
  - After fix: row interaction state stays consistent.
- Issue 4:
  - What users feel: keyboard arrows sometimes do nothing until they click the table first.
  - After fix: keyboard behavior is predictable.
- Issue 5:
  - What users feel: pages column looks incomplete.
  - After fix: table communicates complete, trustworthy metadata.

### Underdevelopment vs finished-product expectation
- Volume controls are implemented but lifecycle placement (deferred binding) is not production-safe.
- Selection/caching logic is solid overall, but progress-driven invalidation and interaction polish need tightening.
- Table metadata presentation is not fully realized.

### Prioritized fix backlog
1. Move volume control listeners (`volSort`, `volSearch`, `volOpenBtn`, etc.) to eager runtime (High)
2. Add progress-version-aware invalidation for `lastread` sorting cache (Medium)
3. Sync selection on row context-menu open (Medium)
4. Improve keyboard focus handoff into volume table (Low)
5. Fill or remove placeholder Pages column (Low)

### Confidence and unknowns
- High confidence:
  - Finding 1 and Finding 2 are strongly supported by explicit control-flow and state-mutation paths.
- Medium confidence:
  - Finding 3 and Finding 4 are UX-consistency issues rather than hard runtime errors.
- Low confidence:
  - Finding 5 impact depends on whether pages metadata is intentionally deferred for future implementation.

### Suggested next chunk
- `C09` (reader open/decode pipeline), then `C10` (reader rendering modes).

## C09 - Reader Open/Decode Pipeline

### Scope inspected
- `src/domains/reader/open.js`
- `src/domains/reader/bitmaps.js`
- `main/domains/archives/index.js`
- `main/domains/comic/index.js`
- `main/ipc/index.js` (archive session cleanup integration points)

### Mechanisms in this chunk
- Open pipeline orchestration:
  - `openBook()` tokenized stale-guard flow in `src/domains/reader/open.js:32-297`.
  - Per-open archive session bootstrap and `appState.zip` shim (`open.js:133-171`).
- Decode/cache pipeline:
  - Byte-budgeted page cache and decode queue in `src/domains/reader/bitmaps.js:6-114`, `src/domains/reader/bitmaps.js:133-209`.
  - Stale decode guards with volume token/reference snapshots in `bitmaps.js:152-169`.
- Archive domain behavior:
  - CBZ: central-directory session + random-access entry reads in `main/domains/archives/index.js:171-287`.
  - CBR: whole-file memory extractor session in `main/domains/archives/index.js:296-360`.
- Open-file book object shaping:
  - `openFileDialog` + `bookFromPath` in `main/domains/comic/index.js:46-97`.

### Findings (ordered by severity)

1. **High - CBR open error contract is mismatched with `openBook` expectations**
- Evidence:
  - Renderer open path assumes `opened.sessionId` exists after `cbrOpen`/`cbzOpen` (`src/domains/reader/open.js:141-146`).
  - `cbrOpen` returns `{ ok: false, error }` on failure rather than throwing (`main/domains/archives/index.js:368-374`).
  - `openBook` does not check `opened.ok` before using `opened.sessionId` and `opened.entries`, so failures degrade into generic "No images found" behavior (`open.js:173-179`).
- Why it matters:
  - Real CBR open failures are masked as content-empty failures, making diagnosis and user feedback incorrect.
- Fix direction:
  - Normalize archive open contracts (both throw on failure, or both return `{ ok, ... }` and renderer checks it explicitly before continuing).

2. **High - CBR sessions are not owner-scoped and are not cleaned up on window close**
- Evidence:
  - CBZ sessions track `ownerId` and expose `cbzCloseAllForOwner` (`main/domains/archives/index.js:18-23`, `main/domains/archives/index.js:55-67`).
  - Main IPC window cleanup calls only CBZ owner cleanup (`main/ipc/index.js:1012-1022`).
  - CBR session schema has no `ownerId` and no owner-close utility (`main/domains/archives/index.js:141-147`, `main/domains/archives/index.js:321`).
- Why it matters:
  - Closing a window can leave large in-memory CBR sessions alive until later eviction or app exit.
- Fix direction:
  - Add owner tracking + `cbrCloseAllForOwner` parity and call it in the same window-closed cleanup path.

3. **Medium - CBR read-entry error path returns `null`, causing opaque downstream decode failures**
- Evidence:
  - `cbrReadEntry` swallows errors and returns `null` (`main/domains/archives/index.js:381-387`).
  - Renderer wraps archive bytes with `new Uint8Array(ab)` (`src/domains/reader/open.js:165-169`), so `null` becomes a generic type/decode failure instead of preserving original archive error context.
- Why it matters:
  - User and logs lose the actionable root cause (bad archive entry vs generic decode issue).
- Fix direction:
  - Make `cbrReadEntry` throw on failure (CBZ-style), or return structured `{ ok, error }` and handle explicitly in renderer decode flow.

4. **Medium - CBR open path is eager whole-file-in-memory; CBZ path is lazy/random-access**
- Evidence:
  - CBR open reads entire file into memory (`fs.readFile`) and stores `dataAB` in session (`main/domains/archives/index.js:303-305`, `main/domains/archives/index.js:321`).
  - CBZ open stores file handle and reads entries by offset (`main/domains/archives/index.js:175-183`, `main/domains/archives/index.js:242-274`).
- Why it matters:
  - Large CBR archives can create major memory pressure and slower startup versus CBZ behavior.
- Fix direction:
  - Move toward lazy CBR entry access (stream/on-demand extraction) or aggressively close CBR sessions when no longer active.

5. **Low - Reader open image filter excludes GIF even though dim parsers support it elsewhere**
- Evidence:
  - Open pipeline only admits `png/jpg/webp` (`src/domains/reader/open.js:173-175`).
  - Two-page dimension parser includes GIF support (`src/domains/reader/render_two_page.js:865-877`).
- Why it matters:
  - GIF-backed pages in archives are silently ignored at open time.
- Fix direction:
  - Decide supported formats explicitly; either include GIF in open filter or remove GIF parser path to avoid inconsistent expectations.

### Plain-language UX impact
- Issue 1:
  - What users feel: some broken CBR files say "No images found" instead of giving a useful failure reason.
  - After fix: failures report the real cause and are easier to troubleshoot.
- Issue 2:
  - What users feel: memory can stay high after closing CBR-heavy windows.
  - After fix: archive memory is released more predictably per window lifecycle.
- Issue 3:
  - What users feel: random decode errors without clear explanation.
  - After fix: errors become specific (which entry failed and why).
- Issue 4:
  - What users feel: opening big CBRs can be slower/heavier than CBZ equivalents.
  - After fix: load behavior is more consistent across archive types.
- Issue 5:
  - What users feel: some archives with GIF pages look incomplete or fail to open as expected.
  - After fix: supported image formats behave consistently.

### Underdevelopment vs finished-product expectation
- Archive adapters have inconsistent error and session-lifecycle contracts.
- CBR handling is functional but still in a memory-heavy compatibility mode versus CBZâ€™s mature lazy path.
- Open pipeline resilience is strong for stale-nav/session races, but weaker for archive contract mismatch cases.

### Prioritized fix backlog
1. Unify `cbrOpen`/`cbzOpen` error contracts and enforce renderer-side checks (High)
2. Add CBR owner-based cleanup parity on window close (High)
3. Stop returning bare `null` for CBR read failures; preserve error context (Medium)
4. Reduce CBR memory footprint (lazy entry strategy or tighter lifecycle) (Medium)
5. Align GIF support policy across open/decode/render layers (Low)

### Confidence and unknowns
- High confidence:
  - Findings 1-4 are directly verified with line-level contract tracing.
- Medium confidence:
  - Finding 5 depends on whether GIF is intentionally unsupported for reader decode.

### Suggested next chunk
- `C10` (reader rendering modes and state machine behavior).

## C10 - Reader Rendering Modes

### Scope inspected
- `src/domains/reader/render_core.js`
- `src/domains/reader/render_portrait.js`
- `src/domains/reader/render_two_page.js`
- `src/domains/reader/state_machine.js`

### Mechanisms in this chunk
- Render dispatch:
  - `drawActiveFrame()` mode switch in `src/domains/reader/render_core.js:3-20`.
- Portrait/single-page rendering:
  - viewport sizing and canvas sync in `src/domains/reader/render_portrait.js:5-63`.
  - strip and single-page draw paths in `render_portrait.js:102-274`.
- Two-page rendering:
  - pairing/parity + spread logic in `src/domains/reader/render_two_page.js:5-199`.
  - flip and scroll renderers, row-build caches, prefetch in `render_two_page.js:202-1411`.
- Playback/navigation/scrub/state:
  - auto-scroll/auto-flip loops, nav coalescing, scrubber, manual scroller, progress saves in `src/domains/reader/state_machine.js:11-1508`.

### Findings (ordered by severity)

1. **High - Auto-scroll speed units are inconsistent on HiDPI displays**
- Evidence:
  - Reader y-position and page height math use canvas backing-store units (device pixels), for example `el.stage.width/height` and `scaledH` in `render_portrait.js:105-132`.
  - Auto-scroll tick computes `dy = speed * dt` without DPR normalization in `state_machine.js:287`, while declaring `dpr` but not using it (`state_machine.js:277`).
- Why it matters:
  - On high-DPI displays, "same speed" settings can feel materially different because movement and geometry are in different unit assumptions.
- Fix direction:
  - Normalize auto-scroll speed to one unit system (CSS px or device px) end-to-end and apply consistent conversion.

2. **Medium - `getViewportCssSize()` can return `undefined` in video-player mode, making resize destructuring unsafe**
- Evidence:
  - Early return with no object when `inVideoPlayer` is true (`src/domains/reader/render_portrait.js:7-9`).
  - Caller destructures return value unguarded (`const { vw, vh } = getViewportCssSize();` at `render_portrait.js:24`).
- Why it matters:
  - If any reader draw/resize call runs while `inVideoPlayer` is set, this can throw a runtime destructuring error.
- Fix direction:
  - Always return a `{ vw, vh }` object (even in video mode) or guard caller before destructuring.

3. **Medium - Scrubber event bindings are unguarded and can hard-fail module initialization if DOM nodes are missing**
- Evidence:
  - Direct listeners are attached without null checks (`el.scrub.addEventListener(...)`) in `src/domains/reader/state_machine.js:739-782`.
  - Other controls in the same file are guarded (`initScrollSpeedSlider` checks required nodes at `state_machine.js:1323-1324`).
- Why it matters:
  - A partial/failed reader DOM mount can crash state-machine setup and take out core navigation controls.
- Fix direction:
  - Add defensive guards around scrubber bindings (and fail-soft logging) to match the rest of the module.

4. **Low - `scheduleProgressSave` payload has duplicated `bookMeta` key block**
- Evidence:
  - `bookMeta` is written twice in the same payload object in `src/domains/reader/state_machine.js:1061-1076`.
- Why it matters:
  - No immediate behavior break (later key wins), but it signals merge drift and increases maintenance error risk.
- Fix direction:
  - Keep one canonical `bookMeta` assignment block.

5. **Low - Render/state modules remain tightly coupled through implicit globals**
- Evidence:
  - Reader render/decode modules rely on globals defined outside their own files (for example `withLimit` from `src/domains/shell/core.js:2263`, `makeStaleError`/`isStaleError` from `src/domains/shell/core.js:694-700`).
- Why it matters:
  - Current load order works, but module portability/testability and future refactors are fragile.
- Fix direction:
  - Gradually expose explicit shared utilities/hooks instead of hard global symbol coupling.

### Plain-language UX impact
- Issue 1:
  - What users feel: auto-scroll speed feels inconsistent across different screens.
  - After fix: speed presets feel predictable regardless of DPI scaling.
- Issue 2:
  - What users feel: occasional mode-switch edge crashes are possible.
  - After fix: viewport sizing stays safe across reader/video class transitions.
- Issue 3:
  - What users feel: if reader UI loads partially, controls can fail hard instead of degrading gracefully.
  - After fix: missing-node cases fail softly instead of breaking the whole reader interaction layer.
- Issue 4:
  - What users feel: no direct visible impact today.
  - After fix: lower regression risk in progress-save logic.
- Issue 5:
  - What users feel: no immediate direct impact.
  - After fix: easier maintenance and safer refactors.

### Underdevelopment vs finished-product expectation
- Rendering feature depth is strong, but unit consistency (DPI/speed semantics) still needs hardening.
- State-machine resiliency differs across controls (some guarded, some brittle).
- Reader internals still depend heavily on legacy global coupling rather than explicit module contracts.

### Prioritized fix backlog
1. Normalize auto-scroll speed units across DPI contexts (High)
2. Make `getViewportCssSize` return contract total (never `undefined`) (Medium)
3. Guard scrubber initialization to prevent module-wide crash on missing DOM refs (Medium)
4. Remove duplicate `bookMeta` payload block (Low)
5. Introduce explicit shared utility hooks to reduce global coupling (Low)

### Confidence and unknowns
- High confidence:
  - Findings 1-4 are directly evidenced in source.
- Medium confidence:
  - Finding 5 is architectural debt; impact depends on future refactor/migration plans.

### Suggested next chunk
- `C11` + `C18` (Batch C).

## C11 - Reader Input, HUD, Settings, Volume Navigation, Boot

### Scope inspected
- `src/domains/reader/input_pointer.js`
- `src/domains/reader/input_keyboard.js`
- `src/domains/reader/hud_core.js`
- `src/domains/reader/mega_settings.js`
- `src/domains/reader/volume_nav_overlay.js`
- `src/domains/reader/boot.js`

### Mechanisms in this chunk
- Reader startup/open handoff:
  - Boot sequence and `openBookId` startup routing in `src/domains/reader/boot.js:4-33`.
- Pointer and wheel interaction model:
  - Click zones, middle-zone behavior, wheel-to-scrub/manual scroll in `src/domains/reader/input_pointer.js:6-1098`.
- Keyboard routing and overlay gates:
  - Global/player/library hotkeys with overlay-priority gates in `src/domains/reader/input_keyboard.js:35-539`.
- HUD lifecycle:
  - Auto-hide, freeze conditions, activity hooks in `src/domains/reader/hud_core.js:43-173`.
- Settings/overlays:
  - Mega settings navigation, goto/image-fx/loupe overlays in `src/domains/reader/mega_settings.js:11-1422`.
- Volume navigation and major UI bindings:
  - Volume chooser, prev/next volume controls, many HUD/overlay button bindings in `src/domains/reader/volume_nav_overlay.js:157-1274`.

### Findings (ordered by severity)

1. **High - Startup open flow is coupled to `refreshLibrary()` success**
- Evidence:
  - Boot logic runs `refreshLibrary().then(async () => { ... openBookId/flushPendingExternalOpen ... })` in `src/domains/reader/boot.js:5-29`.
  - On `refreshLibrary` rejection, code falls to a toast catch and does not execute the open flow in `src/domains/reader/boot.js:33`.
- Why it matters:
  - A temporary library refresh failure can block window startup opening (`openBookId`) even when the target book metadata is otherwise available.
- Fix direction:
  - Decouple startup-open routing from library refresh success (run open path in a `finally`/separate guarded step).

2. **Medium - Several overlay key paths say "swallow keys" but do not prevent default behavior**
- Evidence:
  - Keys overlay branch returns without `preventDefault` for non-Escape keys in `src/domains/reader/input_keyboard.js:105-109`.
  - Vol-nav overlay branch does the same in `src/domains/reader/input_keyboard.js:111-119`.
  - Manga tips overlay branch also returns early in `src/domains/reader/input_keyboard.js:96-99`.
- Why it matters:
  - Browser/system defaults can still fire (or propagate unexpectedly) while overlays are open, creating inconsistent keyboard behavior.
- Fix direction:
  - Where intent is true key swallowing, call `e.preventDefault()`/`e.stopPropagation()` consistently before return.

3. **Medium - HUD freeze model does not include all modal overlays (goto/image-fx/loupe)**
- Evidence:
  - HUD freeze checks include keys/vol-nav/mega/speed slider, but not goto/image-fx/loupe in `src/domains/reader/hud_core.js:64-67`.
  - Those modal states exist (`isGotoOpen`, `isImgFxOpen`, `isLoupeZoomOpen`) in `src/domains/reader/mega_settings.js:530-537`.
  - Open/close helpers for those overlays do not refresh HUD freeze/timer state in `src/domains/reader/mega_settings.js:581-615`, `src/domains/reader/mega_settings.js:675-683`.
- Why it matters:
  - HUD visibility/timer behavior can feel inconsistent while modal tools are open.
- Fix direction:
  - Add these overlays to HUD freeze conditions and trigger `hudRefreshAfterUiChange()` on their open/close transitions.

4. **Medium - Reader context menu implementation is currently dead/unreachable**
- Evidence:
  - Rich reader context menu builder exists in `src/domains/reader/input_pointer.js:318-527`.
  - Actual right-click bindings route to `openMegaSettingsFloaterFromEvent` instead in `src/domains/reader/input_pointer.js:530-531`.
  - No other call site invokes `showReaderContextMenuFromEvent` (single definition only).
- Why it matters:
  - Large action surface (export/copy/bookmark rows) is effectively dead code, increasing drift risk and confusing future maintenance.
- Fix direction:
  - Either wire this menu intentionally, or remove/merge it to keep one clear right-click contract.

5. **Low - Core input bindings are brittle to DOM drift because several listeners are unguarded**
- Evidence:
  - `el.clickZones.querySelector(...)` and immediate `leftZone/rightZone.addEventListener(...)` assume required nodes exist in `src/domains/reader/input_pointer.js:6-8`, `src/domains/reader/input_pointer.js:72`, `src/domains/reader/input_pointer.js:116`.
  - Multiple major controls bind without null guards in `src/domains/reader/volume_nav_overlay.js:1033-1072`, `src/domains/reader/volume_nav_overlay.js:1093-1112`.
- Why it matters:
  - Any markup drift or partial mount can hard-fail reader bootstrap instead of degrading gracefully.
- Fix direction:
  - Guard required nodes and fail-soft with diagnostics for missing critical elements.

### Plain-language UX impact
- Issue 1:
  - What users feel: opening a book in a new window can randomly fail after startup hiccups.
  - After fix: startup opens are reliable even if library refresh is flaky.
- Issue 2:
  - What users feel: keyboard behavior changes unpredictably when overlays are open.
  - After fix: overlays feel modal and consistent, with fewer accidental key side effects.
- Issue 3:
  - What users feel: HUD hiding/showing can feel off while using popup tools.
  - After fix: HUD behavior feels stable while adjusting goto/image/loupe settings.
- Issue 4:
  - What users feel: right-click behavior is inconsistent with what code suggests is available.
  - After fix: one clear right-click experience with less hidden/unused behavior.
- Issue 5:
  - What users feel: rare UI load differences can produce broken controls instead of graceful fallback.
  - After fix: reader survives missing nodes better and fails less catastrophically.

### Underdevelopment vs finished-product expectation
- Input/HUD/overlay behavior is feature-rich, but not fully contract-tight across keyboard gating, HUD freeze state, and right-click pathways.
- The reader has multiple mature subsystems, yet some integration edges still behave like iterative build artifacts rather than final product contracts.
- Bootstrap and DOM resilience are still weaker than a fully hardened production reader.

### Prioritized fix backlog
1. Decouple startup open-flow from `refreshLibrary()` success path (High)
2. Make overlay key-swallow branches actually prevent default propagation (Medium)
3. Add goto/img-fx/loupe overlays to HUD freeze + UI-change refresh hooks (Medium)
4. Resolve dead reader context menu path (wire or remove/merge) (Medium)
5. Add fail-soft guards for required reader DOM bindings (Low)

### Confidence and unknowns
- High confidence:
  - Findings 1, 2, and 4 are directly traceable to explicit control flow.
- Medium confidence:
  - Finding 3 impact depends on exact UX intent for HUD while modal overlays are open.
- Medium confidence:
  - Finding 5 depends on how often DOM variants/partial mounts occur in real deployments.

### Suggested next chunk
- `C20` + `C21` (Batch D).

## C18 - Main Library Domain + Library Scan Worker

### Scope inspected
- `main/domains/library/index.js`
- `workers/library_scan_worker_impl.js`
- `main/ipc/register/library.js`

### Mechanisms in this chunk
- Library config/state/index cache:
  - `libraryCache`, config read/write, snapshot shape in `main/domains/library/index.js:25-240`.
- Scan orchestration and worker lifecycle:
  - scan start, dedupe, queueing, progress events, finish/error handling in `main/domains/library/index.js:274-410`.
- Folder management and progress pruning:
  - add/remove root/series, ignored-series handling, orphan progress cleanup in `main/domains/library/index.js:512-663`.
- Worker-side index build:
  - recursive archive discovery, metadata extraction, sort, index persistence in `workers/library_scan_worker_impl.js:23-130`.
- IPC exposure:
  - library domain registration in `main/ipc/register/library.js`.

### Findings (ordered by severity)

1. **High - Worker fatal errors are treated as successful "done" scans**
- Evidence:
  - Worker catch path posts `{ type: 'done', idx: { series: [], books: [] }, error: ... }` in `workers/library_scan_worker_impl.js:128-130`.
  - Main-process done handler does not check `msg.error`; it accepts `msg.idx`, emits update, and calls `finish(true)` in `main/domains/library/index.js:365-392`.
- Why it matters:
  - A worker crash can look like a successful scan and replace library contents with an empty index.
- Fix direction:
  - Treat `msg.error` as failure (`finish(false)` + preserve previous index) and surface actionable error state.

2. **High - Forced rescan intent can be dropped when a scan is already running**
- Evidence:
  - While scanning, requests only queue `folders` + `key` in `main/domains/library/index.js:281-284`.
  - Completion only restarts queued scan when `queuedKey !== lastScanKey` in `main/domains/library/index.js:339-341`.
  - `setScanIgnore()` requests a forced rescan in `main/domains/library/index.js:502`, but scan-ignore changes do not alter folder key.
- Why it matters:
  - Mid-scan ignore-pattern updates (or other force-worthy changes) may not trigger a second scan, leaving stale results.
- Fix direction:
  - Queue force/intention metadata (not just folder key), and rerun when force-worthy state changed even if folder list is identical.

3. **Medium - File-system access failures are largely silent, causing partial/invisible scan misses**
- Evidence:
  - Root subdir listing errors are swallowed and return `[]` in `main/domains/library/index.js:63`.
  - Worker recursive readdir errors are swallowed and continue in `workers/library_scan_worker_impl.js:29`.
- Why it matters:
  - Missing permissions/disconnected paths can silently drop series/books with little user-facing explanation.
- Fix direction:
  - Aggregate recoverable scan warnings and surface them in scan status/error payloads.

4. **Medium - App startup always triggers a full background scan per session**
- Evidence:
  - `getState()` always calls `startLibraryScan(...)` in `main/domains/library/index.js:437`.
  - Deduping relies on in-memory `lastScanAt` initialized to `0` in `main/domains/library/index.js:31`, `main/domains/library/index.js:288`.
- Why it matters:
  - Large libraries can incur heavy startup scanning every run, even when no disk changes occurred.
- Fix direction:
  - Persist freshness metadata and/or add change detection heuristics to avoid unnecessary full-session rescans.

5. **Medium - Scan worker is a full rebuild path with no incremental diff strategy**
- Evidence:
  - For each series folder, worker recursively lists all archives and stats each file in `workers/library_scan_worker_impl.js:58-66`.
  - Entire index is rewritten each scan in `workers/library_scan_worker_impl.js:123`.
- Why it matters:
  - Scan latency scales linearly with library size, making repeated rescans expensive.
- Fix direction:
  - Add incremental indexing (mtime/path diffing or per-series cache) and write only changed segments.

### Plain-language UX impact
- Issue 1:
  - What users feel: a scan failure can look like "my whole library disappeared".
  - After fix: failures keep old data and clearly report what went wrong.
- Issue 2:
  - What users feel: changing scan rules during an active scan may seem ignored.
  - After fix: forced changes reliably apply on the next pass.
- Issue 3:
  - What users feel: some folders quietly vanish from results with no clear reason.
  - After fix: users get understandable warnings instead of silent misses.
- Issue 4:
  - What users feel: app startup can feel heavy on big libraries every launch.
  - After fix: faster startup when nothing changed.
- Issue 5:
  - What users feel: rescans stay slow as the library grows.
  - After fix: scan times improve and scale better with large collections.

### Underdevelopment vs finished-product expectation
- Core scan architecture is solid (worker offload, progress events, queueing), but failure semantics and force-queue semantics are not yet production-tight.
- The pipeline still behaves like a full-rebuild scanner, whereas a finished large-library product typically uses incremental indexing and explicit warning surfaces.
- Error observability is currently weaker than expected for a mature library management domain.

### Prioritized fix backlog
1. Handle worker `done+error` as failure and preserve last good index (High)
2. Preserve force-intent in queued scans (especially for ignore-rule updates) (High)
3. Surface recoverable scan warnings for inaccessible paths (Medium)
4. Reduce unnecessary startup rescans with persisted freshness/change checks (Medium)
5. Add incremental scan/index-write strategy (Medium)

### Confidence and unknowns
- High confidence:
  - Findings 1 and 2 are directly evidenced by worker message shape and main-process queue/finish logic.
- Medium confidence:
  - Findings 3-5 are architecture/perf maturity gaps; exact impact varies by library size and storage environment.

### Suggested next chunk
- `C20` + `C21` (Batch D), then `C22` + `C23` (Batch E).

---

## C20 â€” Player Core (Qt Process, Session Files, Progress Sync)

### Scope
- `main/domains/player_core/index.js`
- `player_qt/run_player.py` (referenced but inspection limited to Electron-side contract)

### Mechanisms enumerated

1. **Singleton state** (`__state` object, line 29-63): Tracks Qt player child process, session ID, progress file path, return-window info, launcher mode, progress sync timer, and fullscreen restore state.
2. **V1half embedded player API** (lines 127-264): `start`, `play`, `pause`, `seek`, `stop` â€” delegates to mpv domain. Only active when mpv domain is available.
3. **Qt player launch** (`launchQt`, lines 267-685): Single-instance guard, command file forwarding to already-running player, Python/bundled-exe resolution, venv detection, child process spawn with stdio piping, spawn-success await.
4. **Command file forwarding** (lines 294-354): When player is already running, writes a JSON command file to `qt_player_sessions/` instead of spawning a new process.
5. **Session files** (lines 385-431): Creates session progress file, playlist file, and command file in `qt_player_sessions/` directory.
6. **Stale session recovery** (`__recoverStaleQtSessions`, lines 728-805): On first launch, scans for leftover session files from a previous crash, imports their progress into the videoProgress store, then deletes them.
7. **Live progress sync** (`__startQtProgressSync`, lines 887-922): Polls the Qt session progress file every 500ms via `setInterval`, syncs to videoProgress store, broadcasts `VIDEO_PROGRESS_UPDATED` events.
8. **Progress sync logic** (`__syncProgressFromQtSession`, lines 926-1005): Reads session JSON, extracts position/duration/finished/track preferences, persists via videoProgress domain, returns uiEvent data.
9. **Window restore** (`__restoreWindowAfterPlayerExit`, lines 1008-1103): On player exit, syncs final progress, cleans up session files, restores window bounds/fullscreen state, sends `build14:playerExited` event to renderer.
10. **UI event handling** (`__handleQtUiEvent`, lines 833-875): Responds to Qt player's fullscreen toggle and back events by adjusting the Tankoban window state.
11. **Return state persistence** (`saveReturnState`/`getReturnState`/`clearReturnState`, lines 1106-1165): Writes `return_state.json` to userData for renderer state restore after player exit.

### Findings

#### Finding 1 â€” `build14:playerExited` event bypasses IPC contract
- **Severity**: Medium
- **Evidence**: `player_core/index.js:1083` sends `win.webContents.send('build14:playerExited', ...)` using a hardcoded string. This event is NOT defined in `shared/ipc.js` (the single source of truth for all IPC constants). The renderer receives it via a callback chain: `preload/index.js` â†’ `state/bootstrap.js:41` â†’ `window.Tanko.emit('build14:playerExited')` â†’ `video.js:8970`.
- **UX impact**: Works today but violates the project's IPC contract pattern. Any future audit of `shared/ipc.js` for event coverage will miss this channel. Renaming or removing it would silently break video player return flow.
- **Fix direction**: Add `PLAYER_EXITED: 'player:exited'` to `EVENT` in `shared/ipc.js` and use `EVENT.PLAYER_EXITED` in both player_core and preload.

#### Finding 2 â€” `return_state.json` bypasses storage.js entirely
- **Severity**: Low
- **Evidence**: `saveReturnState` (line 1122) uses raw `fs.writeFileSync` and `getReturnState` (line 1141) uses raw `fs.readFileSync`. Neither uses `storage.readJSON`/`storage.writeJSON` which provide atomic writes, backup recovery, and directory creation.
- **UX impact**: If a crash occurs during `saveReturnState` write, the file could be corrupted with no `.bak` fallback. On next launch, `getReturnState` would fail and return `{ ok: false }`, losing the video library navigation position.
- **Fix direction**: Use `ctx.storage.readJSON` and `ctx.storage.writeJSON` for `return_state.json`.

#### Finding 3 â€” `cbzOpen` throws raw errors to IPC layer (no try/catch wrapper)
- **Severity**: Medium
- **Evidence**: `archives/index.js:404-407` â€” `cbzOpen` directly returns `cbzOpenInternal(filePath, ownerId)` without wrapping in try/catch. Compare with `cbrOpen` (line 368-374) which catches and returns `{ ok: false, error }`. A corrupt CBZ or permission error will throw an unhandled rejection through `ipcMain.handle`, which Electron logs as a console error and returns a generic rejection to the renderer.
- **UX impact**: Renderer gets an unhelpful error string instead of a structured `{ ok: false, error }` response. Error handling code in the renderer that checks `.ok` will not find the property.
- **Fix direction**: Wrap `cbzOpen` in try/catch like `cbrOpen`.

#### Finding 4 â€” `cbzReadEntry` and `cbzClose` also throw raw errors
- **Severity**: Medium
- **Evidence**: `archives/index.js:413-414` â€” `cbzReadEntry` returns `cbzReadEntryInternal()` directly (no try/catch). `cbzClose` (line 421-423) also has no try/catch. Compare with `cbrReadEntry` (line 381-387) which catches and returns `null`, and `cbrClose` (line 394-396) which catches silently.
- **UX impact**: Same as Finding 3 â€” unstructured errors propagate to renderer. A closed/evicted session throws "CBZ session not found" as an unhandled rejection.
- **Fix direction**: Wrap in try/catch matching CBR handler patterns.

#### Finding 5 â€” `files.read` has no path validation (path traversal)
- **Severity**: High (security)
- **Evidence**: `files/index.js:9-12` â€” `read(ctx, _evt, filePath)` passes `filePath` directly to `fs.promises.readFile` with zero validation. The renderer can read ANY file on the filesystem (e.g., `C:\Windows\System32\config\SAM`, SSH keys, `.env` files). The IPC channel `FILE_READ` (shared/ipc.js:238) is exposed via preload as `Tanko.api.files.read()` / `readFile()` (preload/index.js:228,805).
- **UX impact**: Any renderer-side code (or XSS if one exists) can exfiltrate arbitrary files from the user's system.
- **Fix direction**: Validate that `filePath` is within a known safe directory (e.g., `app.getPath('userData')`) or restrict to known archive/media paths.

#### Finding 6 â€” CBR reads entire file into memory
- **Severity**: Low-Medium
- **Evidence**: `archives/index.js:303` â€” `cbrOpenInternal` reads the entire RAR file into memory with `fs.promises.readFile(fp)`. For a 500MB CBR, this allocates 500MB of Node.js heap. Combined with CBR_OPEN_MAX=3 sessions, worst case is ~1.5GB just for open CBR archives.
- **UX impact**: Users with large CBR files may experience sluggish performance or crashes. CBZ avoids this by using file handles with lazy reads.
- **Fix direction**: This is a limitation of `node-unrar-js` which requires the full data buffer. Document the memory ceiling. Consider adding a file-size warning or limiting max CBR file size.

#### Finding 7 â€” CBR eviction uses `openedAt` only (no touch-on-read)
- **Severity**: Low
- **Evidence**: `archives/index.js:153-162` â€” `cbrEvictIfNeeded` sorts by `openedAt` only. Compare with CBZ's `cbzEvictIfNeeded` (line 87-101) which sorts by `lastUsedAt` (updated via `cbzTouchSession` on every read). A CBR archive being actively read could be evicted if it was opened earliest.
- **UX impact**: If a user has 3 CBR books open and opens a 4th, the oldest-opened (but possibly currently-reading) book gets evicted, causing "CBR session not found" errors on next page turn.
- **Fix direction**: Add `lastUsedAt` tracking to CBR sessions and update it on `cbrReadEntry`.

#### Finding 8 â€” `videoPosterDelete` directly manipulates `video_index.json`
- **Severity**: Medium
- **Evidence**: `thumbs/index.js:157-178` â€” `videoPosterDelete` reads and writes `video_index.json` using raw `fs.readFileSync`/`fs.writeFileSync`, bypassing both the storage layer and the video domain's in-memory index cache. If the video domain has a cached copy of the index, the `thumbPath: null` change won't be reflected until next full rescan.
- **UX impact**: After removing a poster, the current session can continue showing stale poster metadata until a refresh/rescan (or restart) reloads video index state.
- **Fix direction**: Use the video domain's API to clear thumbPath, or at minimum invalidate/notify the video domain's cache after modifying the index.

#### Finding 9 â€” Progress sync fire-and-forget with no error propagation
- **Severity**: Low
- **Evidence**: `player_core/index.js:993-994` â€” `videoProgress.save()` is called and its promise is caught silently (`.catch(() => {})`). During live sync (line 914), progress broadcast happens regardless of whether the save succeeded. The 500ms polling interval combined with the 180ms throttle means rapid seeks may drop progress updates.
- **UX impact**: In rare I/O failure scenarios, the user's progress appears saved (broadcast to UI) but isn't actually persisted to disk. On restart, position would jump back.
- **Fix direction**: Acceptable for best-effort sync. Consider a final flush on player exit (already done in `__restoreWindowAfterPlayerExit`).

#### Finding 10 â€” Spawn command log line is ambiguous for complex paths
- **Severity**: Low
- **Evidence**: `player_core/index.js:566-567` builds a single interpolated command string for logging. The actual `spawn()` call (lines 576-589) correctly uses argument arrays, so command injection is not the issue.
- **UX impact**: Debug logs can be hard to read when args contain spaces or special characters.
- **Fix direction**: Quote/escape logged args for readability. No runtime security fix needed here.

### Fix backlog (priority order)
1. Add path validation to `files.read` to prevent arbitrary file reads (High)
2. Wrap `cbzOpen`, `cbzReadEntry`, `cbzClose` in try/catch matching CBR patterns (Medium)
3. Move `build14:playerExited` event constant to `shared/ipc.js` (Medium)
4. Fix `videoPosterDelete` to use video domain API or invalidate cache (Medium)
5. Add `lastUsedAt` touch-on-read to CBR sessions (Low)
6. Use `storage.readJSON`/`writeJSON` for `return_state.json` (Low)

### Confidence and unknowns
- High confidence:
  - Findings 3-5 (CBZ error handling, files path traversal) are directly evidenced by comparing code patterns.
  - Finding 1 (hardcoded event) confirmed via grep of shared/ipc.js.
  - Finding 8 (direct video_index.json manipulation) confirmed by reading thumbs domain code.
- Medium confidence:
  - Finding 6 (CBR memory) â€” depends on node-unrar-js API surface; may have no streaming alternative.
  - Finding 9 (progress sync gaps) â€” edge case requiring specific I/O failure timing.

---

## C21 â€” Thumbs, Export, Files, Clipboard, Archives IPC Surface

### Scope
- `main/domains/thumbs/index.js`
- `main/domains/export/index.js`
- `main/domains/files/index.js`
- `main/domains/clipboard/index.js`
- `main/domains/archives/index.js`

### Mechanisms enumerated

1. **Book thumbnails** (`thumbs/index.js:246-293`): `thumbsGet`, `thumbsDelete`, `thumbsHas`, `thumbsSave` â€” CRUD for book cover thumbnails stored as `{bookId}.jpg` in `userData/thumbs/`.
2. **Page thumbnails** (`thumbs/index.js:22-73`): `pageThumbsHas`, `pageThumbsGet`, `pageThumbsSave` â€” per-page thumbnails stored as `{pageIndex}.jpg` in `userData/page_thumbs/{bookId}/`.
3. **Video posters** (`thumbs/index.js:81-239`): `videoPosterGet`, `videoPosterHas`, `videoPosterDelete`, `videoPosterSave`, `videoPosterPaste` â€” show poster images (jpg/png) in `userData/video_posters/`.
4. **Export save** (`export/index.js:58-88`): Reads comic page bytes from archive session, prompts save dialog, writes to user-chosen path.
5. **Export copy** (`export/index.js:94-113`): Reads comic page bytes, creates nativeImage, copies to clipboard.
6. **File read** (`files/index.js:9-12`): Reads any file path and returns ArrayBuffer. Used for loading comic metadata or supplementary files.
7. **Clipboard write** (`clipboard/index.js:9-16`): Wraps `clipboard.writeText()`.
8. **CBZ session management** (`archives/index.js:23-287`): File-handle-based ZIP reading with LRU eviction (max 3), lazy per-entry decompression, owner-based cleanup.
9. **CBR session management** (`archives/index.js:138-360`): Full-file-in-memory RAR extraction with eviction by openedAt (max 3).
10. **CBZ/CBR IPC handlers** (`archives/index.js:362-440`): Domain handler wrappers for `cbrOpen/Read/Close` and `cbzOpen/Read/Close`.

### Findings

#### Finding 1 â€” `files.read` allows arbitrary file system reads (DUPLICATE of C20-F5)
- **Severity**: High (security)
- **Evidence**: `files/index.js:9-12` â€” No path validation. Already detailed in C20 Finding 5.
- **Fix direction**: See C20 Finding 5.

#### Finding 2 â€” Inconsistent error wrapping between CBZ and CBR handlers
- **Severity**: Medium
- **Evidence**: `archives/index.js` â€” CBR handlers (`cbrOpen` line 368, `cbrReadEntry` line 381, `cbrClose` line 394) all wrap in try/catch and return structured responses (`{ ok: false, error }` or `null`). CBZ handlers (`cbzOpen` line 404, `cbzReadEntry` line 413, `cbzClose` line 421) have NO try/catch and let errors propagate as unhandled rejections. This is a copy-paste inconsistency from the domain extraction.
- **UX impact**: Corrupt CBZ files cause unhelpful error popups; corrupt CBR files degrade gracefully.
- **Fix direction**: Add try/catch to all three CBZ handlers matching CBR pattern.

#### Finding 3 â€” `pageThumbsSave` only accepts `jpeg`/`jpg` data URLs
- **Severity**: Low
- **Evidence**: `thumbs/index.js:63` â€” Regex pattern is `/^data:image\/(jpeg|jpg);base64,(.+)$/`. If the renderer generates a PNG thumbnail (e.g., from `canvas.toDataURL('image/png')`), the save silently returns `{ ok: false }` with no error message.
- **UX impact**: Thumbnails may silently fail to save for certain image formats. The renderer would need to know to always export as JPEG.
- **Fix direction**: Accept PNG in the regex and save accordingly, or document that only JPEG is supported and ensure renderer always uses JPEG.

#### Finding 4 â€” `videoPosterSave` only accepts `jpeg` data URLs
- **Severity**: Low
- **Evidence**: `thumbs/index.js:194` â€” Same pattern: `/^data:image\/jpeg;base64,(.+)$/`. PNG data URLs are silently rejected. Compare with `videoPosterPaste` (line 223-226) which tries JPEG first, then falls back to PNG.
- **UX impact**: If a renderer feature allows uploading a PNG poster, it would silently fail.
- **Fix direction**: Accept PNG format in addition to JPEG.

#### Finding 5 â€” Synchronous fs operations in thumbs domain
- **Severity**: Low
- **Evidence**: Throughout `thumbs/index.js`: `fs.existsSync` (lines 35, 48, 111, 112, 152, 153, 160, 200, 201, 232, 233, 250, 262, 273), `fs.writeFileSync` (lines 68, 176, 199, 230, 288), `fs.unlinkSync` (lines 152, 153, 201, 232, 233, 262). All called from async IPC handlers on the main thread.
- **UX impact**: Each sync I/O operation blocks the main process event loop. For large poster images or slow disks, this could cause brief UI freezes.
- **Fix direction**: Migrate to async equivalents (`fs.promises.*`). Not urgent since files are small (thumbnails/posters) but should be addressed for consistency with the async direction of storage.js.

#### Finding 6 â€” `export/index.js` duplicates `winFromEvt` helper
- **Severity**: Low (code hygiene)
- **Evidence**: `export/index.js:22-32` â€” Identical `winFromEvt` function exists in `window/index.js`. Comment on line 21 even acknowledges this: "Duplicated from window domain for independence."
- **UX impact**: No functional impact. Maintenance burden if logic needs to change.
- **Fix direction**: Import from a shared location or accept the intentional duplication.

#### Finding 7 â€” CBZ eviction closes file handles but CBR eviction doesn't clean up
- **Severity**: Low
- **Evidence**: CBZ eviction (`cbzCloseInternal`, line 281-287) properly closes the file handle via `fh.close()`. CBR eviction (`cbrEvictIfNeeded`, line 153-162) just deletes the Map entry â€” the `dataAB` (full file ArrayBuffer) and `extractor` object rely on garbage collection. The `node-unrar-js` extractor may hold native resources.
- **UX impact**: Potential memory leak if node-unrar-js extractors hold native handles. The JS garbage collector will eventually collect the ArrayBuffer but timing is non-deterministic.
- **Fix direction**: Check if `node-unrar-js` extractor has a `close()`/`dispose()` method; if so, call it on eviction.

#### Finding 8 â€” `clipboard.writeText` and `clipboard.readImage` are called on main thread
- **Severity**: Low
- **Evidence**: `clipboard/index.js:11` calls `clipboard.writeText()` synchronously. `thumbs/index.js:214` calls `clipboard.readImage()` synchronously. These are Electron main-process clipboard operations that block the event loop.
- **UX impact**: Minimal for text. For large images (via `readImage`), clipboard deserialization could block briefly.
- **Fix direction**: Acceptable as-is. Electron clipboard API is inherently synchronous.

### Fix backlog (priority order)
1. Add path validation to `files.read` (High â€” duplicate of C20 backlog item 1)
2. Wrap CBZ handlers in try/catch matching CBR patterns (Medium)
3. Accept PNG data URLs in `pageThumbsSave` and `videoPosterSave` (Low)
4. Add `lastUsedAt` touch-on-read to CBR sessions (Low â€” duplicate of C20 backlog item 5)
5. Migrate thumbs domain to async fs operations (Low)

### Confidence and unknowns
- High confidence:
  - Findings 1-4 are directly evidenced by reading the source and comparing patterns.
  - Finding 5 (sync ops) confirmed by line-by-line review.
- Medium confidence:
  - Finding 7 (CBR cleanup) â€” depends on whether node-unrar-js extractor holds native resources.

### Suggested next chunk
- `C22` + `C23` (Batch E).

---

## C22 â€” Renderer Markup And CSS Layers

### Scope
- `src/index.html`
- `src/styles/styles.css`
- `src/styles/overhaul.css`
- `src/styles/video-library-match.css`

### Mechanisms enumerated

1. **HTML scaffold** (`index.html`): Single-page app with inline `<style>` reset, three external CSS sheets loaded in order (`styles.css` â†’ `overhaul.css` â†’ `video-library-match.css`), then renderer JS scripts at the bottom.
2. **Synchronous reader injection** (`index.html:736-753`): Inline `<script>` fires a synchronous XHR (`req.open('GET', ..., false)`) to load `reader_view.html`, then replaces the mount `<div>` via `outerHTML`.
3. **CSS custom property theming** (`styles.css:111-154`): `:root` block defines ~40 design tokens (`--bg`, `--text`, `--accent`, `--panel-rgb`, `--shadow*`, etc.) for a dark OLED Cinema theme. `body:not(.inPlayer)` (line 187-206) re-overrides tokens for library mode.
4. **Body class state machine**: Layout is driven by body classes â€” `inVideoPlayer`, `videoShellMode`, `videoFullscreen`, `inPlayer`, `hudHidden`, `videoUiHidden`, `libDrawerOpen`, `mpvEngine`, `libmpvCanvas`. CSS selectors compose these for conditional layout.
5. **Noir theme layer** (`overhaul.css`): Experiment layer that redefines all tokens under `--vx-*` namespace, converts the sidebar to an off-canvas drawer (`position: fixed; transform: translateX(-106%)`), collapses grid to `1fr`, adds animated gradient background.
6. **Video library match layer** (`video-library-match.css`): Makes video library UI match comic library's visual style. Overrides video episode table grid columns, sidebar width, topbar, series cards.
7. **Script load order** (`index.html:896-909`): `services/api_gateway.js` â†’ `services/health/monitor.js` â†’ `state/bootstrap.js` â†’ `state/deferred_modules.js` â†’ `domains/shell/core.js` â†’ `domains/library/library.js` â†’ `state/reader.js` â†’ `domains/shell/shell_bindings.js`.
8. **Window chrome** (`index.html:60-62`): Custom title bar buttons (min/max/close) hidden via `winChromeHidden` class since Build 36 (native OS title bar).
9. **Video player DOM** (`index.html:418-729`): Extensive markup: context menus, HUD controls, tracks panel, volume/speed popovers, playlist panel, toast overlay, resume prompt, anchored popovers for subtitle styling.
10. **z-index stratification** (`styles.css` throughout): Multiple z-index layers â€” topbar (20), loupe (28), stage gradient (4), HUD (5), exit fullscreen (6), tracks panel (30), playlist panel (31), context menu (80), chapter markers (9999), video toast (999), volume OSD (10000), video library toast (12000).

### Findings

#### Finding 1 â€” Synchronous XHR blocks renderer startup
- **Severity**: Medium
- **Evidence**: `index.html:741-743` â€” `req.open('GET', './domains/reader/reader_view.html', false)` performs a synchronous XMLHttpRequest. The third argument `false` makes the call blocking. All script execution and DOM parsing halts until the response arrives.
- **UX impact**: On cold start with a slow disk or large `reader_view.html`, the entire UI is frozen during this fetch. No loading indicator is visible. Modern browsers flag synchronous XHR as deprecated and log console warnings.
- **Fix direction**: Convert to async `fetch()` + `await`, or use a build step to inline the HTML at package time. Alternatively, use `<link rel="import">` or a DOM insertion via `DOMContentLoaded`.

#### Finding 2 â€” Three-layer CSS cascade with ~100+ `!important` overrides
- **Severity**: Medium (maintenance)
- **Evidence**: `styles.css` provides baseline styling. `overhaul.css` overrides it via later load order AND `!important` on ~100+ declarations. `video-library-match.css` adds further `!important` overrides. Example chain: `styles.css:257` sets `grid-template-columns` for `.libraryShell` â†’ `overhaul.css:257` overrides with `1fr !important` â†’ `video-library-match.css:178` overrides with its own grid `!important`. Each layer can only override the previous by escalating specificity or adding more `!important`.
- **UX impact**: No visual bug today, but any future style change requires understanding all three layers. Adding a fourth layer would be impractical. Debugging computed styles in DevTools requires tracing through multiple files.
- **Fix direction**: Consolidate `overhaul.css` into `styles.css` as the permanent theme (it's labelled "EXPERIMENT" but is the shipped theme). Remove `!important` where load-order alone suffices. Use CSS custom properties or `@layer` for structured cascade control.

#### Finding 3 â€” Sidebar style conflict between overhaul.css and video-library-match.css
- **Severity**: Low-Medium
- **Evidence**: `overhaul.css:260-275` converts the sidebar to an off-canvas drawer: `body:not(.inPlayer) .libSidebar { position: fixed; transform: translateX(-106%); width: min(320px, 92vw); }`. But `video-library-match.css:292` sets `#videoLibraryView .libSidebar { background: rgba(10,12,20,.46) !important; ... }` â€” styling for a visible sidebar within the video library view, without accounting for the off-canvas transform.
- **UX impact**: The video library sidebar relies on the drawer being opened via `libDrawerOpen` body class (set by JS), but the `video-library-match.css` styles implicitly assume the sidebar is visible. If the drawer open/close logic has a bug, these conflicting assumptions could cause the sidebar to be styled but invisible.
- **Fix direction**: Document the drawer interaction explicitly. Ensure video-library-match.css sidebar styles are scoped to the `.libDrawerOpen` state.

#### Finding 4 â€” `libForwardBtn` exists in HTML but has no JS bindings
- **Severity**: Low
- **Evidence**: `index.html:37` â€” `<button id="libForwardBtn" class="iconBtn" title="Forward" aria-label="Forward" disabled>â–¶</button>`. `core.js` references it in the DOM map (`el.libForwardBtn`), but there is no listener or enable path for Forward behavior, while `libBackBtn` has active behavior.
- **UX impact**: A disabled Forward button is permanently visible in the topbar. It takes up space and may confuse users who expect browser-like forward navigation.
- **Fix direction**: Either implement forward navigation (undo the last Back) or remove the button from the HTML.

#### Finding 5 â€” Chapter marker comment says "Bright red" but color is white (#FFFFFF)
- **Severity**: Low (misleading comment)
- **Evidence**: `styles.css:1919` â€” `background: #FFFFFF; /* BUILD 89: Bright red for visibility */` and line 1924 â€” `background: #FFFFFF; /* BUILD 89: Bright red override */`. The comment references a color that was presumably changed from red to white at some point, but the comment was never updated.
- **UX impact**: No functional issue. Misleading for future developers.
- **Fix direction**: Update comment to say "White for visibility" or remove the color commentary.

#### Finding 6 â€” Duplicate `.scanPill` rule definitions
- **Severity**: Low
- **Evidence**: `styles.css:2537-2549` defines `.scanPill` (with `display: inline-flex`, `border-radius: 999px`, etc.). Then `styles.css:2655` redefines `.scanPill` (with `display: flex`, `justify-content: space-between`, etc.) in the "Tankoban Plus Build 1" section. The second definition completely overrides the first due to cascade order.
- **UX impact**: First definition is dead code. The two have different `display` values (`inline-flex` vs `flex`) and layout properties.
- **Fix direction**: Remove the earlier dead definition (lines 2537-2549) and keep the active Build 1 version.

#### Finding 7 â€” Duplicate `.videoTimeDisplay` rule definitions
- **Severity**: Low
- **Evidence**: `styles.css:2966-2974` defines `.videoTimeDisplay` with `font-size: 12px`, `border-radius: 999px`, `border`, `background`, and `backdrop-filter`. Then `styles.css:3426-3432` redefines `.videoTimeDisplay` with `font-size: 13px`, no border, no background, no backdrop-filter. The second definition (BUILD 69) overrides the first.
- **UX impact**: The earlier styled version (with border and background pill) is dead code. The active version is a simpler unstyled text display.
- **Fix direction**: Remove the earlier dead definition (lines 2966-2974).

#### Finding 8 â€” Duplicate `.videoAnchoredPopover` rule blocks in overhaul.css
- **Severity**: Low (code hygiene)
- **Evidence**: `overhaul.css:1107-1108` sets `z-index: 9999` on `.videoAnchoredPopover`. Then `overhaul.css:1112-1113` sets `pointer-events: auto` on the same `.videoAnchoredPopover` selector. These are separate rule blocks for the same selector that could be merged.
- **UX impact**: No functional issue. Minor maintenance friction.
- **Fix direction**: Merge the two blocks into one rule.

#### Finding 9 â€” Empty CSS rule block in video-library-match.css
- **Severity**: Low (dead code)
- **Evidence**: `video-library-match.css:599-607` â€” Six selectors (`#libraryView .seriesGrid`, `.seriesCard`, `.continuePanel`, `.contTile`, `#seriesGrid:not(#videoShowsGrid)`, `.continueYacRow .contTile`) with a comment-only body: `/* Comic library uses original styles - do not override */`. This is a no-op rule.
- **UX impact**: No functional issue. Adds ~8 lines of dead code. The intent (documenting scope boundaries) is valid but a CSS comment outside the rule would suffice.
- **Fix direction**: Replace with a plain CSS comment block outside a selector.

#### Finding 10 â€” z-index escalation across layers
- **Severity**: Low-Medium (architecture)
- **Evidence**: z-index values span from 4 (stage gradient) to 12000 (video library toast). Key escalation points: chapter markers use `z-index: 9999` (styles.css:1920), video toast uses `z-index: 999 !important` (styles.css:3351), volume OSD uses `z-index: 10000` (styles.css:3388), video library toast uses `z-index: 12000` (styles.css:3154). There is no documented z-index scale or token system.
- **UX impact**: Adding new overlays requires guessing a z-index value that sits correctly in the stack. Chapter markers at 9999 could visually occlude the video toast (999) â€” though they're in different DOM trees.
- **Fix direction**: Define a z-index scale as CSS custom properties (e.g., `--z-hud: 5`, `--z-menu: 80`, `--z-toast: 200`, `--z-osd: 300`) and migrate hardcoded values.

#### Finding 11 â€” Firefox-specific CSS in Electron-only app
- **Severity**: Low (dead code)
- **Evidence**: `overhaul.css` includes Firefox-specific slider styling (`::-moz-range-*` pseudo-elements). Since the app runs in Electron (Chromium), all Firefox-specific rules are unreachable dead code.
- **UX impact**: No functional issue. Adds ~20 lines of dead CSS.
- **Fix direction**: Remove Firefox-specific rules to reduce CSS size.

### Fix backlog (priority order)
1. Convert synchronous XHR reader injection to async or build-time inline (Medium)
2. Consolidate CSS layers â€” merge overhaul.css into styles.css, reduce `!important` usage (Medium)
3. Define z-index scale as CSS custom properties (Low-Medium)
4. Remove or implement `libForwardBtn` (Low)
5. Remove duplicate rule definitions (`.scanPill`, `.videoTimeDisplay`) (Low)
6. Remove Firefox-specific CSS (Low)

### Confidence and unknowns
- High confidence:
  - Findings 1, 4-9, 11 are directly evidenced by reading source files.
  - Finding 2 (CSS layers) confirmed by counting `!important` instances and tracing cascade chains.
- Medium confidence:
  - Finding 3 (sidebar conflict) â€” the actual runtime behavior depends on JS drawer-open logic; the CSS alone doesn't cause a visible bug.
  - Finding 10 (z-index) â€” exact overlap depends on DOM tree isolation, which mitigates cross-branch z-index conflicts.

---

## C23 - Health, Diagnostics, and Smoke Tooling

### Scope
- `src/services/health/monitor.js`
- `tools/smoke_check.js`
- `tools/verify_renderer_load_order.js`
- `tools/doctor.js`

### Mechanisms enumerated

1. **Health monitor** (`monitor.js`): IIFE module that pings main process responsiveness every 5 seconds via `window.Tanko.api.ping()`. Logs informational output above 50ms, warnings above 100ms, and freeze/error logs above 1000ms. Exposes controls via `window.Tanko.health.monitor`.
2. **Smoke check** (`smoke_check.js`): Pre-commit/CI validator for IPC string-literal policy, IPC registration boundaries, renderer gateway usage, preload exposure contract, baseline file checks, and renderer script-reference resolution.
3. **Renderer load order verifier** (`verify_renderer_load_order.js`): Parses `src/index.html` `<script src="...">` tags and enforces selected ordering constraints.
4. **Doctor** (`doctor.js`): Lightweight environment diagnostics for expected files, lockfile presence, and critical dependency version pinning.

### Findings

#### Finding 1 - `doctor.js` checks for files that do not exist
- **Severity**: High (tool broken)
- **Evidence**: `doctor.js:50` expects `src/renderer.js` and `src/styles.css`, but the repo uses split renderer scripts and `src/styles/styles.css`.
- **UX impact**: `npm run doctor` fails even on a healthy repo.
- **Fix direction**: Update expected-file list to actual project structure.

#### Finding 2 - `verify_renderer_load_order.js` video-utils check is effectively a no-op
- **Severity**: Medium
- **Evidence**: `verify_renderer_load_order.js:39` asserts order for `./domains/video/video_utils.js` and `./domains/video/video.js`, but the verifier only parses static `<script src>` tags from `index.html`. Those files are loaded dynamically via `src/state/deferred_modules.js`.
- **UX impact**: A real deferred-load reorder regression would not be caught.
- **Fix direction**: Extend verifier to inspect deferred module chain or add runtime assertion in deferred loader.

#### Finding 3 - `smoke_check.js` comment filtering misses inline comments
- **Severity**: Low-Medium
- **Evidence**: `isCommentLine()` only checks line starts (`//`, `/*`, `*`) and does not strip trailing inline comments before regex checks.
- **UX impact**: Potential false positives from IPC-like text inside inline comments on code lines.
- **Fix direction**: Strip inline comment tails before pattern matching, with care for string-literal edge cases.

#### Finding 4 - Health monitor auto-start is single-shot and gated on `window.Tanko` at module load
- **Severity**: Low
- **Evidence**: `monitor.js:95-98` only schedules auto-start when `window.Tanko` is already present; no retry loop exists if that condition is false. Current script order makes it work today, but the behavior is brittle to future load-order changes.
- **UX impact**: In a future refactor, health monitoring could silently never start.
- **Fix direction**: Add retry/event-based startup (`Tanko` ready hook) instead of one-shot gating.

#### Finding 5 - `smoke_check.js` does not baseline-check CSS override layers
- **Severity**: Low
- **Evidence**: Baseline checks validate core JS/html paths and script refs, but not `src/styles/overhaul.css` and `src/styles/video-library-match.css` existence.
- **UX impact**: Accidental deletion of shipped theme layers would bypass smoke checks.
- **Fix direction**: Add both CSS layer files to baseline existence checks.

### Fix backlog (priority order)
1. Fix `doctor.js` expected files to match current repo layout (High)
2. Make renderer load-order verification cover deferred-loaded modules (Medium)
3. Improve comment handling in `smoke_check.js` pattern scans (Low-Medium)
4. Add health monitor retry/event-based startup (Low)
5. Add CSS layer files to smoke-check baseline list (Low)

### Confidence and unknowns
- High confidence:
  - Findings 1-3 are directly verifiable in current tooling code.
  - Finding 2 is confirmed by comparing `verify_renderer_load_order.js` with `src/state/deferred_modules.js`.
- Medium confidence:
  - Finding 4 depends on future script-order refactors (latent today).
  - Finding 5 assumes CSS layer files should be treated as baseline-critical assets.

### Suggested next chunk
- All 23 chunks (C01-C23) are complete. Next useful step is a cross-chunk prioritization pass into fix batches.
