# Tankoban Pro Electron

## Windows setup

1. Run `install_and_run.bat` to install dependencies and launch the app.
2. Run `build_windows_exe.bat` to build distributables.

Both scripts automatically download MPV runtime files into `app/resources/mpv/windows` when missing.

### MPV download troubleshooting (proxy / offline / rate-limit)

If automatic MPV download fails in a restricted environment:

- Manual placement target: `app/resources/mpv/windows`
- Required files: `mpv.exe` and one of `libmpv-2.dll` / `mpv-2.dll` / `mpv-1.dll`
- Use a local archive directly:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/download_mpv_windows.ps1 -ArchivePath C:\path\to\mpv-x86_64-*.7z`
- Optional checksum verification:
  - add `-ArchiveSha256 <sha256>`
  - or set `TANKOBAN_MPV_ARCHIVE_SHA256`

Environment variable alternatives:

- `TANKOBAN_MPV_ARCHIVE_PATH` (or `MPV_ARCHIVE_PATH`)
- `TANKOBAN_MPV_ARCHIVE_SHA256` (or `MPV_ARCHIVE_SHA256`)

For more detail, see `app/resources/mpv/windows/README.md`.
