# Contributing to Tankoban Pro Electron

Thanks for helping improve the project.

## Who this is for

This guide is for contributors who plan to run the app from source, debug behavior, or create release builds.

If you only want to use the app, follow the [User Release Guide](docs/USER_RELEASE_GUIDE.md).

## Development environment

- Windows 10 or Windows 11
- Node.js (LTS recommended)
- npm
- Python 3 (required for QT player helper flows)

## Setup (source build)

From repository root:

1. One-click bootstrap + package build (dependencies + Qt player + dist):
   - `build_windows_exe.bat`
2. Install and run locally in dev mode:
   - `install_and_run.bat`

These scripts download MPV runtime files into `app/resources/mpv/windows` when missing.

## Project documentation map

- Start here: [Documentation Index](docs/README.md)
- Architecture overview: [01_ARCHITECTURE_OVERVIEW.md](docs/01_ARCHITECTURE_OVERVIEW.md)
- Testing and smoke checks: [08_TESTING_AND_SMOKE.md](docs/08_TESTING_AND_SMOKE.md)
- Repository structure: [REPO_STRUCTURE.md](docs/REPO_STRUCTURE.md)

## Scope and constraints

- Windows is the only supported platform.
- Linux/macOS behavior is out of scope unless explicitly planned.
- Keep user-facing docs release-focused; put implementation details in docs under `docs/`.
