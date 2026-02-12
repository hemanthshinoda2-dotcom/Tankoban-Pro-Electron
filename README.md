# Tankoban Pro Electron

## Windows setup

1. Run `install_and_run.bat` to install dependencies and launch the app.
2. Run `build_windows_exe.bat` to build distributables.

Both scripts automatically download MPV runtime files into `app/resources/mpv/windows` when missing.

## Maintainer release flow (reproducible + verifiable)

Run these commands from repository root on a Windows maintainer machine:

1. `build_windows_exe.bat`
   - Installs app dependencies with retry logic.
   - Runs `npm run dist` inside `app`.
2. `npm run dist` runs the same deterministic release path every time:
   - `npm run release:prep`
   - `npm run build:player` (`app/player_qt/build_player.bat`)
   - `npm run validate:player` (checks expected player artifacts)
   - `electron-builder`

Expected output paths under `app/dist`:

- NSIS installer: `app/dist/Tankoban Plus-Setup-<version>.exe`
- Portable build: `app/dist/Tankoban Plus-<version>-x64-Portable.exe`
- Unpacked directory (when running `npm run pack`): `app/dist/win-unpacked/`
