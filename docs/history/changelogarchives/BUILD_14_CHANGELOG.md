# Tankoban Pro — Build 14 Changelog

## Fullscreen Kiosk + Hide-on-Play + Restore-on-Exit (Seamless Return)

### Goal
Create a console-like experience where Tankoban stays alive but disappears during playback, 
returning to the exact same view after the player exits.

### Changes

#### A) App Launch: Borderless Fullscreen (Kiosk Mode)
- **Modified**: `app/main/index.js`
  - Window creation now uses `frame: false` for borderless appearance
  - Automatically enters fullscreen on `ready-to-show` event
  - Fullscreen state persists across restore events
  - Logs `TANKOBAN_BUILD14_READY` on successful initialization

#### B) Video Click: Save State → Hide Window → Launch Player Fullscreen
- **New**: `app/src/domains/video/build14_state.js`
  - State capture module for video library UI
  - Captures: current mode, show root, folder path, scroll position, selected tile
  - Restore logic with intelligent fallbacks

- **Modified**: `app/src/domains/video/video.js`
  - `openVideo()` function now captures state before playback
  - Saves state to main process via new IPC channel
  - Hides window after successful player launch
  - Registers listener for player exit events to trigger restore

- **Modified**: `app/main/domains/player_core/index.js`
  - `launchQt()` now passes `--fullscreen` argument to Python player
  - Tracks spawned player process
  - Monitors player exit (normal or crash)
  - Restores window automatically on exit with `__restoreWindowAfterPlayerExit()`
  - Ensures final progress flush happens before restore
  - New functions: `saveReturnState()`, `getReturnState()`, `clearReturnState()`

- **Modified**: `app/player_qt/run_player.py`
  - Added `--fullscreen` argument support
  - Player starts in fullscreen mode when flag is present
  - No behavior change for non-fullscreen users

#### C) Player Exit: Show Window → Restore Fullscreen → Restore Exact State
- **Modified**: `app/main/domains/window/index.js`
  - New `hideWindow()` and `showWindow()` functions
  - `showWindow()` re-asserts fullscreen state after showing

- **Modified**: `app/src/state/bootstrap.js`
  - Added simple event emitter to `window.Tanko`
  - Methods: `Tanko.on()` and `Tanko.emit()`
  - Registers callback to receive player exit events from preload

- **Modified**: `app/preload/index.js`
  - Exposed `build14` API namespace with state management functions
  - Added `window.hide()` and `window.show()` functions
  - Set up event forwarding system for player exit events
  - Bridges IPC events from main to renderer's Tanko.emit()

- **Modified**: `app/shared/ipc.js`
  - Added `BUILD14_SAVE_RETURN_STATE` channel
  - Added `BUILD14_GET_RETURN_STATE` channel
  - Added `BUILD14_CLEAR_RETURN_STATE` channel
  - Added `WINDOW_HIDE` and `WINDOW_SHOW` channels

- **Modified**: `app/main/ipc/register/player_core.js`
  - Registered BUILD14 state management IPC handlers

- **Modified**: `app/main/ipc/register/window.js`
  - Registered BUILD14 window hide/show IPC handlers

- **Modified**: `app/src/index.html`
  - Included `build14_state.js` script before `video.js`

#### State File Format
Location: `{userData}/return_state.json`

```json
{
  "version": 1,
  "savedAt": "2026-02-04T15:42:00.000Z",
  "mode": "videos",
  "showRootPath": "/path/to/show/root",
  "currentFolderPath": "/path/to/season",
  "scrollTop": 1234,
  "selectedItemId": "episode_id",
  "selectedItemPath": "/path/to/episode.mkv"
}
```

### Error Handling
- Player launch failure → Tankoban unhides within timeout
- Player crash → Tankoban still restores state
- Missing/corrupt state file → Safe fallback to Videos mode
- Spawn errors → Window restoration guaranteed

### Logging (for debugging)
- `TANKOBAN_BUILD14_READY` - App started successfully
- `BUILD14_HIDE_AND_PLAY` - State saved, window hidden
- `BUILD14_RESTORE_AFTER_EXIT` - Window restored after player exit
- `BUILD14_ERROR:` - Any errors during state management

### Backward Compatibility
- Python player launch mechanism unchanged (same module, invocation, working directory)
- Only adds `--fullscreen` argument (backward compatible)
- No new UI toggles or settings
- Existing non-fullscreen users unaffected
- Single video player implementation (Python Qt mpv)

### Testing Notes
- Click video → Window hides, player opens fullscreen
- Close player → Tankoban returns to exact same folder/scroll/selection
- Kill player process → Tankoban still returns
- Force launch failure → Tankoban unhides and doesn't get stuck

### Non-Negotiables Met
✓ Python player spawn route unchanged (module, invocation, working directory)
✓ No second video player implementation
✓ Stable even if player crashes or fails to launch
✓ Fullscreen is default behavior
✓ No new toggles or settings in UI
✓ Tankoban stays alive during playback (hidden, not closed)
✓ Exact state restoration (mode, folder, scroll, selection)


### Embedded parity upgrades (Build 14 patch)
- Replaced separate modal panels with stage-anchored slide drawers for Tracks (right) and Playlist (left).
- Added hover time bubble and click-to-seek scrubber to match embedded canvas feel.
- Added toast feedback for common actions (speed, quality, auto-advance, aspect, subtitle style, window mode).
- Added Speed preset menu on the Speed chip.
- Added Auto-advance toggle in Playlist drawer (EOF respects this).
- Added Always on Top toggle + Open File action in right-click menu.
- Added Video submenu with Aspect Ratio presets + Screenshot in right-click menu.
- Default: respect embedded subtitle styles (sub-ass-override = no), toggleable from Tracks drawer.
