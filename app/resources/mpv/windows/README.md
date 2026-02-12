# MPV Windows Runtime (Not Committed)

This folder is intentionally kept out of git because GitHub rejects files over 100 MB (for example `libmpv-2.dll`).

To download the required runtime files:

```bat
scripts\windows\ensure_mpv_windows.bat
```

The build and run scripts call this automatically:

- `build_windows_exe.bat`
- `install_and_run.bat`
