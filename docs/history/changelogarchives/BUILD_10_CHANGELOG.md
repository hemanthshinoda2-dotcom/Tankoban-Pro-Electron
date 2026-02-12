# TankobanPro Build 10 - Track Picker + Context Menu + Chapters

## What's New

Build 10 adds powerful playback features while maintaining all Build 9 enhancements. The player now has proper track selection UI, comprehensive right-click menu, and chapter navigation support.

## Major Features

### 1. Proper Audio & Subtitle Track Picker 🎧💬

**Full Track Selection UI**
- Dedicated dialog for audio and subtitle track management
- Opened via existing 🎵 Tracks button in top bar
- Non-blocking dialog - can stay open while watching

**Audio Track Features**
- Lists all available audio tracks with language and title
- Shows track language codes (eng, jpn, etc.)
- Displays track titles when available
- Current track marked with ✓
- Click to select any audio track instantly
- Uses mpv track-list for accurate track info

**Subtitle Track Features**
- Lists all subtitle tracks with language and title
- Toggle subtitles on/off button
- Current track marked with ✓
- Click to select any subtitle track
- Off option available

**Subtitle Delay Controls**
- Shows current delay value in seconds
- ➕ +0.1s button
- ➖ -0.1s button
- 🔄 Reset button
- Live delay adjustment while watching

**Implementation**
- Uses mpv track-list property for accurate data
- Sets aid (audio ID) and sid (subtitle ID) directly
- Fallback to cycle commands if track-list unavailable
- Error handling prevents crashes

### 2. Right-Click Context Menu 🖱️

**Quick Access Actions**
Comprehensive context menu on video surface provides instant access to all common actions.

**Playback Controls**
- ▶ Play / ⏸ Pause (dynamic based on state)
- 🔇 Mute/Unmute toggle

**Volume Presets**
- Quick set to 25%, 50%, 75%, 100%
- Instant volume adjustment

**Speed Presets**
- 0.5x, 0.75x, 1.0x, 1.25x, 1.5x, 2.0x
- Current speed marked with ✓
- One-click speed changes

**Audio Track Submenu**
- Lists all audio tracks
- Shows language and title
- Current track marked with ✓
- Direct track selection

**Subtitle Track Submenu**
- Lists all subtitle tracks
- Shows language and title
- "Off" option available
- Current track marked with ✓
- Direct track selection

**Subtitle Controls**
- Toggle subtitles visibility
- Subtitle delay +0.1s
- Subtitle delay -0.1s
- Reset subtitle delay

**File Operations**
- 📋 Copy File Path - copies full path to clipboard
- 📂 Open Containing Folder - opens folder in file manager
- 🕐 Copy Timestamp - copies current position (hh:mm:ss)

**Usage**
- Right-click anywhere on video surface
- Menu appears at cursor
- Select action instantly
- Focus returns to player (keyboard shortcuts still work)

### 3. Chapters Support 📖

**Chapter List & Navigation**
- 📖 Chapters button in top bar
- Non-blocking chapters dialog
- Lists all chapters with timestamps
- Shows chapter titles
- Current chapter marked with ▶
- Double-click to jump to chapter

**Chapter Controls**
- ⏮ Previous Chapter button
- ⏭ Next Chapter button
- Keyboard shortcuts:
  - **Shift+N** = Next chapter
  - **Shift+P** = Previous chapter

**Chapter Detection**
- Uses mpv chapter-list property
- Displays "No chapters available" if none found
- Shows chapter times in hh:mm:ss format
- Auto-refreshes on chapter change

**Implementation**
- Reads mpv chapter-list property
- Sets chapter property for navigation
- Uses mpv "add chapter" command for prev/next
- Error handling for files without chapters

### 4. Keyboard Enhancements ⌨️

**New Shortcuts (Build 10)**
- **Shift+N** - Next chapter
- **Shift+P** - Previous chapter

**Preserved from Build 9 & 110**
All existing keyboard shortcuts work identically:
- Navigation: Backspace (back), Escape (fullscreen/hide)
- Playback: Space/K (play/pause), arrows (seek), J/L (10s)
- Volume: Up/Down (adjust, shows HUD), M (mute)
- Fullscreen: Enter/F (toggle)
- Speed: C/]/X/[/Z/\ 
- Tracks: A/S (cycle), Alt+A/Alt+L/Alt+H
- Subtitle delay: >/</
- Episodes: N/P (within folder)
- Go to time: G

**No Conflicts**
- Shift+N/P for chapters does not conflict with N/P for episodes
- Episode navigation works without Shift modifier

## Build 9 Features (Fully Preserved)

### UI Overhaul ✨
- Modern dark theme with rounded corners
- Symbol-only buttons (no text labels)
- Enhanced top and bottom bars
- Auto-hide in fullscreen (2s idle)
- All UI features intact

### Scroll Wheel Volume 🖱️
- Scroll on video to adjust volume
- Default: 2, Shift: 5, Ctrl: 10
- Volume HUD shows changes
- Works perfectly with new context menu

### Volume HUD 📊
- Smooth fade in/out animations
- Shows symbol, bar, percentage
- Triggers on scroll, keyboard, slider
- Fully functional

### Folder-Scoped Playlist 📁
- Playlist limited to current folder
- Sub-folder switcher for seasons
- Natural sort order
- N/P navigation stays in folder
- All playlist features preserved

## Symbol Usage (No Duplicates)

**Top Bar**
- ← Back
- 📋 Playlist
- 🎵 Tracks (opens track picker dialog)
- ⚡ Speed
- 📖 Chapters (new in Build 10)
- ⛶ Fullscreen
- ⋮ Misc menu

**Bottom Bar**
- ⏮ Previous episode
- ▶/⏸ Play/Pause (swaps state)
- ⏭ Next episode
- 🔊/🔇/🔈/🔉 Mute (adapts to volume, swaps state)
- ⛶ Fullscreen

**Dialogs & Menus**
- ✓ Check mark (selection indicator, not button)
- ▶ Current chapter indicator (not button)
- 🎧 Audio track indicator
- 💬 Subtitle track indicator
- ➕➖🔄 Delay controls

**Context Menu** (uses text labels, allowed per spec)

## Technical Details

### New Classes

**TrackPickerDialog**
- QDialog for audio/subtitle selection
- QListWidget for track lists
- Live mpv track-list integration
- Subtitle delay controls

**ChaptersDialog**
- QDialog for chapter navigation
- QListWidget for chapter list
- Chapter property management

### Error Handling

**Reliability Guardrails**
- Prints `QT_PLAYER_BUILD10_READY` on success
- All new features wrapped in try/except
- Prints `QT_PLAYER_BUILD10_FEATURE_ERROR: ...` on failures
- Player continues working even if features fail
- Context menu errors don't crash player
- Track picker errors don't crash player
- Chapter errors don't crash player

### MPV Integration

**Track Management**
- Uses `track-list` property for full track data
- Sets `aid` for audio selection
- Sets `sid` for subtitle selection
- Sets `sid = "no"` for subtitles off
- Reads `sub-delay` property
- Sets `sub-delay` property

**Chapter Management**
- Uses `chapter-list` property for chapter data
- Sets `chapter` property for direct jumps
- Uses `add chapter ±1` command for navigation

### Context Menu

**Qt Integration**
- QMenu with native styling
- Custom context menu policy on video_host
- customContextMenuRequested signal
- exec() at cursor position
- Does not steal keyboard focus

**Clipboard Operations**
- QClipboard for copy operations
- setText() for file path and timestamp

**File Operations**
- Platform-specific folder opening:
  - Windows: os.startfile()
  - macOS: subprocess + "open"
  - Linux: subprocess + "xdg-open"

## Migration from Build 9

### For Users
- All Build 9 features work identically
- New track picker more intuitive than old tracks menu
- Right-click menu provides quick access
- Chapters work automatically when available
- Keyboard shortcuts enhanced, not changed

### For Developers
- No new arguments required
- Backward compatible with Build 9
- All Build 9 args supported
- No breaking changes

## Testing Checklist

- [x] Player opens reliably (QT_PLAYER_BUILD10_READY prints)
- [x] Track picker dialog opens and shows tracks
- [x] Audio track selection works
- [x] Subtitle track selection works
- [x] Subtitle toggle works
- [x] Subtitle delay controls work
- [x] Right-click context menu appears
- [x] Context menu actions work
- [x] Volume presets work via context menu
- [x] Speed presets work via context menu
- [x] Track submenus work in context menu
- [x] Copy file path works
- [x] Copy timestamp works
- [x] Open containing folder works
- [x] Chapters dialog opens
- [x] Chapter list displays correctly
- [x] Chapter jumping works
- [x] Shift+N/P chapter navigation works
- [x] N/P episode navigation still works (no conflict)
- [x] All Build 9 features preserved
- [x] Scroll wheel volume works
- [x] Volume HUD works
- [x] Folder-scoped playlist works
- [x] No duplicate symbols on buttons
- [x] Keyboard contract maintained
- [x] Error handling prevents crashes

## Known Limitations

1. Track picker requires mpv track-list support
2. Chapters require mpv chapter-list support
3. Files without chapters show "No chapters available"
4. Context menu file operations are platform-dependent
5. Symbol rendering varies by platform

## Future Enhancements

Possible improvements for future builds:
- Chapter markers on seek slider
- Thumbnail previews in chapter list
- Track preview/switching without closing dialog
- Bookmark system for custom markers
- Advanced subtitle styling controls
- Audio equalizer
- Video filters UI

---

**Build Date:** February 2026  
**Base:** TankobanPro Build 9  
**Target:** Power features without sacrificing reliability  
**Priority:** Track picker, context menu, chapters
