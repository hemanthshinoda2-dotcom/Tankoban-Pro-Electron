# MPV Windows Runtime (Not Committed)

This folder is intentionally kept out of git because GitHub rejects files over 100 MB (for example `libmpv-2.dll`).

## Automatic download (default)

```bat
scripts\windows\ensure_mpv_windows.bat
```

The build and run scripts call this automatically:

- `build_windows_exe.bat`
- `install_and_run.bat`

## Manual placement target and required files

If automated download cannot run in your environment, place extracted MPV files directly in:

- `app/resources/mpv/windows`

Required runtime files:

- `mpv.exe`
- one of: `libmpv-2.dll`, `mpv-2.dll`, or `mpv-1.dll`

## Use a predownloaded archive

You can point the setup script to a local `.7z`/`.zip` file, or a folder containing `mpv-x86_64-*.7z` / `mpv-x86_64-*.zip`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/download_mpv_windows.ps1 -ArchivePath C:\path\to\mpv-x86_64-*.7z
```

Equivalent environment variables:

- `TANKOBAN_MPV_ARCHIVE_PATH` (or `MPV_ARCHIVE_PATH`)
- `TANKOBAN_MPV_ARCHIVE_SHA256` (or `MPV_ARCHIVE_SHA256`) for optional SHA256 verification

## Troubleshooting: proxy / offline / rate-limits

- **Proxy required**: run in a PowerShell session where `HTTP_PROXY` / `HTTPS_PROXY` are set, then rerun `ensure_mpv_windows.bat`.
- **Offline environment**: download MPV archives on a connected machine, copy them into your environment, then use `-ArchivePath` (or `TANKOBAN_MPV_ARCHIVE_PATH`).
- **GitHub API rate-limit**: provide a local archive with `-ArchivePath` to skip API requests.
- **Checksum mismatch**: re-download the archive from a trusted source and verify `TANKOBAN_MPV_ARCHIVE_SHA256` matches the file before retrying.
