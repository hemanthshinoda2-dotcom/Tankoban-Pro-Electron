# Tankoban Pro

A powerful Windows desktop application for managing and reading manga/comic archives and video libraries.

## Key Features

### Comic Archive Support
- Read **CBZ** and **CBR** files with smooth page navigation
- Multiple reading modes: single page, double page, long strip, auto-scroll, and more
- Loupe (magnifier) for detailed viewing
- Resume points — pick up exactly where you left off
- Volume navigator for jumping between volumes in a series

### Video Library Management
- Organize and play video content with integrated **MPV** playback
- Supports MP4, MKV, AVI, MOV, WebM, M4V, MPEG, and TS formats
- Audio and subtitle track selection with delay adjustment
- Load external subtitle files (SRT, ASS)
- Playback speed control (0.25x to 4x)
- Chapter markers on the timeline

### Chapter Tracking
- Keep track of your reading progress across series
- Continue Reading / Continue Watching shelves for quick access
- Mark volumes or episodes as finished, in-progress, or unwatched
- Per-show bulk actions (mark all watched, clear all progress)

### Library Scanning
- Automatic detection and organization of your content
- Nested folder support for seasons, arcs, and multi-volume series
- Background scanning with configurable ignore patterns
- Hidden series/show management

### Thumbnail Generation
- Quick visual browsing of your collection
- Custom poster support — file picker, clipboard paste, or drag-and-drop
- Auto-generate thumbnails from video episodes

### Modern Interface
- Clean, dark-themed UI built with Electron
- Global search across all series, shows, volumes, and episodes
- Right-click context menus for quick actions
- Keyboard shortcuts throughout — press **K** to see them all
- Fullscreen support with auto-hiding HUD controls

## Installation

### Option 1: Setup Installer (Recommended)

**File:** `Tankoban Pro-Setup.exe`

Full installation with Start Menu shortcuts and file associations. Automatically handles updates and dependencies.

### Option 2: Portable Version

**File:** `Tankoban Pro-Portable.exe`

No installation required — run directly from any folder. Perfect for USB drives or isolated environments. All settings and data stored in the app folder.

## System Requirements

- **OS:** Windows 10 or Windows 11 (64-bit)
- **RAM:** 4GB minimum, 8GB recommended
- **Storage:** 200MB for the app + space for your libraries
- **Display:** 1280x720 minimum resolution

## Build from source

If you want to develop, debug, or package custom builds:

- [CONTRIBUTING.md](CONTRIBUTING.md) — source build and dev workflow
- [Documentation Index](docs/README.md) — architecture and internal documentation

## Known Issues

- macOS and Linux are not currently supported
- First library scan may take time depending on collection size

## Support

For issues, feature requests, or questions, please [open an issue](../../issues) on GitHub.

Built with [Electron 30.0.0](https://www.electronjs.org/) | [Python 3.14](https://www.python.org/) | [Qt 6.10](https://www.qt.io/) | [MPV](https://mpv.io/)
