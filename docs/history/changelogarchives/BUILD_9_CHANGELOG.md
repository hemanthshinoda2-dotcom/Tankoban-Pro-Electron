# TankobanPro Build 9 - UI Overhaul + Volume Features + Folder Playlists

## What's New

Build 9 brings a complete UI modernization, scroll wheel volume control, animated volume HUD, and folder-scoped playlists with sub-folder navigation.

## Major Features

### 1. Complete UI Overhaul ✨

**Modern, Minimal Design**
- Dark theme with clean, flat aesthetic (#121214 background)
- Rounded corners on all interactive elements (8px radius)
- Consistent spacing and padding throughout
- Professional color palette with subtle hover/pressed states
- No text labels on buttons (symbols/emoji only)

**Enhanced Top Bar**
- Back button (←)
- Title with smart truncation for long names
- Playlist toggle (📋) with folder switcher
- Tracks menu (🎵) for audio/subtitle selection
- Speed menu (⚡) for playback speed
- Fullscreen toggle (⛶)
- Misc menu (⋮) for additional actions

**Enhanced Bottom Bar**
- Previous episode (⏮)
- Play/Pause toggle (▶/⏸ - single button that swaps)
- Next episode (⏭)
- Time display (current / total)
- Seek slider (larger hit area, modern styling)
- Mute toggle (🔊/🔇 - adapts to volume level)
- Volume slider (100px width)
- Fullscreen toggle (⛶)

**Auto-hide Behavior**
- Controls auto-hide in fullscreen after 2 seconds of inactivity
- Mouse movement instantly shows controls
- Controls always visible in windowed mode
- Escape exits fullscreen first, then hides controls

### 2. Scroll Wheel Volume Control 🖱️

**Video Surface Scroll**
- Scroll up = increase volume
- Scroll down = decrease volume
- Does not interfere with playlist/menu scrolling

**Step Sizes**
- Default: 2 per scroll tick
- Shift: 5 per scroll tick
- Control: 10 per scroll tick
- Clamped to 0-100 range

**MPV Integration**
- Direct volume property update (`self._mpv.volume = new_value`)
- Instant feedback with no lag

### 3. Animated Volume HUD 📊

**Visual Design**
- Centered overlay on video surface
- Symbol indicator (🔇/🔈/🔉/🔊 based on level)
- Horizontal bar showing volume level
- Percentage display (e.g., "65%")
- Semi-transparent dark background with subtle border

**Smooth Animation**
- Fade in: 120ms (fast)
- Stay visible while changes continue
- Fade out: 300ms after 900ms of inactivity
- Qt animation using QGraphicsOpacityEffect + QPropertyAnimation

**Triggers**
- Scroll wheel volume changes
- Keyboard Up/Down volume changes
- Volume slider changes

### 4. Folder-Scoped Playlist 📁

**Smart Scoping**
- Playlist scoped to folder containing clicked file
- Example: Click "Show/Season 2/Episode 05.mkv" → Only Season 2 episodes
- No mixing of Season 1, Specials, or other sub-folders

**Sub-Folder Switcher**
- Playlist menu shows current folder name (📁 Season 2)
- "📂 Switch Folder" submenu lists sibling folders
- Instant playlist rebuild when switching folders
- Natural sort order (Episode 2 before Episode 10)

**Implementation**
- Requires `--show-root` argument pointing to show root path
- Player computes `playlistFolder = dirname(clickedFilePath)`
- Enumerates only video files within that folder
- Discovers sibling folders under show root

**Navigation**
- N/P keys and Prev/Next buttons operate within current folder only
- No cross-folder navigation or season heuristics
- Clean separation between folders

### 5. Keyboard Contract (Identical to Build 110) ⌨️

All keyboard shortcuts from Build 110 are preserved:

**Navigation**
- Backspace: Back to library/show view

**Playback**
- Space or K: Play/pause
- Left/Right: Small seek (5s)
- Shift/Ctrl/Meta + Left/Right: Big seek (30s)
- J: Back 10 seconds
- L: Forward 10 seconds

**Volume**
- Up/Down: Adjust volume (shows HUD in Build 9)
- M: Mute toggle

**Fullscreen**
- Enter/F: Fullscreen toggle
- Escape: Exit fullscreen first, else hide controls

**Speed**
- C or ]: Speed up
- X or [: Speed down
- Z or \: Reset to 1.0x

**Tracks**
- A: Cycle audio
- S: Cycle subtitles
- Alt+A: Cycle audio
- Alt+L: Cycle subtitles
- Alt+H: Toggle subtitle visibility

**Subtitle Sync**
- >: Increase delay
- <: Decrease delay
- /: Reset delay

**Episode Navigation**
- N: Next episode (within current folder)
- P: Previous episode (within current folder)

**Go to Time**
- G: Prompt for time (seconds, mm:ss, or hh:mm:ss)

## Technical Details

### Reliability Guardrails

**Initialization Checkpoint**
- Prints `QT_PLAYER_BUILD9_READY` on successful init
- Helps diagnose "ghost player" issues

**Error Handling**
- UI code wrapped in try/except
- Errors show Qt dialog with details
- Prints `QT_PLAYER_BUILD9_UI_ERROR: ...`
- MPV playback continues when possible

### File Structure

**Modified Files**
- `app/player_qt/run_player.py` - Complete rewrite with Build 9 features

**New Classes**
- `VolumeHUD` - Animated volume overlay widget

**New Arguments**
- `--show-root` - Path to show root folder for playlist scoping

### Dependencies

**No New Dependencies**
- Uses existing PySide6 (Qt)
- Uses existing python-mpv
- Pure Qt widgets (no custom painting)

## Migration from Build 110

### For Users
- All existing features work identically
- New UI is backward compatible
- Keyboard shortcuts unchanged
- Progress tracking unchanged

### For Developers
- `--show-root` argument is optional but recommended
- Falls back to simple folder playlist if not provided
- Playlist file format unchanged (backward compatible)

## Known Limitations

1. Folder switcher requires `--show-root` argument
2. No cross-folder "auto-continue" (by design)
3. Volume HUD position fixed (centered, top 25%)
4. Emoji symbols may render differently on different platforms

## Testing Checklist

- [x] UI renders without flicker
- [x] Scroll wheel volume works on video surface
- [x] Volume HUD animates smoothly
- [x] Folder-scoped playlist builds correctly
- [x] Folder switcher shows sibling folders
- [x] All keyboard shortcuts work
- [x] Fullscreen auto-hide works
- [x] Resume prompt works
- [x] Progress tracking works
- [x] Episode navigation stays within folder
- [x] Natural sort order for episodes

## Future Enhancements

Possible improvements for future builds:
- Progress indicators per episode in playlist
- Thumbnail previews in seek bar
- Customizable HUD position
- Playlist search/filter
- Remember last folder per show
- Keyboard shortcut customization

---

**Build Date:** February 2026  
**Base:** TankobanPlus Build 110  
**Target:** Modern, minimal UI with enhanced user experience
