# Repository structure

```text
TankobanPro/
  README.md
  build_windows_exe.bat
  install_and_run.bat
  DANGER_ZONES.md
  MUSEUM.md
  docs/
    README.md
    00_START_HERE.md
    ...
    history/
      changelogarchives/
      patches/
    legacy/
      app_docs/
      ...
  app/
    START_HERE.md
    main.js
    preload.js
    library_scan_worker.js
    video_scan_worker.js
    workers/
      library_scan_worker_impl.js
      video_scan_worker_impl.js
    main/
      index.js
      ipc/
      domains/
      lib/
    preload/
    shared/
    src/
    native/
    resources/
    tools/
    player_qt/
      run_player.py
      requirements.txt
      install_qt_player.bat
```

Notes:
- Everything under `app/` is the application runtime.
- Everything under `docs/` is for humans only.
- Historical artifacts live under `docs/history/` and `docs/legacy/`.
