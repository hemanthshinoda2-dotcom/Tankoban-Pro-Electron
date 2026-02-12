# scripts/

This folder is a **clean home for helper scripts**.

Important: this packaged build also keeps copies of the same Windows batch files at the repo root (for convenience / backwards compatibility). If you edit a script, either:
- update both copies, or
- make the root script delegate into this folder.

## scripts/windows/

- `install_and_run.bat` — installs dependencies (when required) and launches the app
- `build_windows_exe.bat` — packaging helper for a Windows executable build

## Editing guide

- These scripts are **packaging/runtime critical**. Small changes can stop the app from launching.
- Prefer additive changes (new flags, new helper scripts) over rewriting existing logic.
- After any change, test a full run from a clean folder.
