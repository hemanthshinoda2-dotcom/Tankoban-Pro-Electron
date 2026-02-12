# Tankoban Pro Electron

## System Requirements

This repository line is **Windows-only**.

- **Supported OS:** Windows 10 (64-bit) and Windows 11 (64-bit)
- **Node.js:** `>=20.0.0 <21.0.0` (Node 20 LTS)
- **Python:** `>=3.10 <3.13` (Python launcher `py` recommended)
- **Internet access:** Required on first run (or any time MPV files are missing) so `scripts/windows/ensure_mpv_windows.bat` can fetch MPV runtime files from GitHub releases.

## First-Run Quickstart (Windows)

From the repository root, run:

```bat
install_and_run.bat
```

What this does:
1. Downloads/prepares MPV runtime files when missing.
2. Installs npm dependencies in `app/`.
3. Starts the Electron app.

## First-Run Troubleshooting

If first run fails, check these common Windows issues:

- **PowerShell execution policy blocks scripts**
  - `install_and_run.bat` calls PowerShell with `-ExecutionPolicy Bypass`, but some locked-down environments still block script execution.
  - Try running from an elevated PowerShell/Command Prompt, or ask IT to allow local script execution for this repo workflow.

- **`py` / Python not found**
  - Install Python 3.10–3.12 and ensure either `py` or `python` is on PATH.
  - Verify with:
    - `py -3 --version`
    - `python --version`

- **Antivirus or file locks (EBUSY / EPERM / ENOTEMPTY)**
  - Close running `electron.exe` processes.
  - Close editors/file explorers that may hold locks in `app/node_modules`.
  - Temporarily disable real-time antivirus scanning for the repo and retry.

- **Network / proxy blocks MPV download**
  - MPV fetch uses GitHub API/assets (`api.github.com` and GitHub release download URLs).
  - If your environment uses a corporate proxy, configure PowerShell/Windows proxy settings so `Invoke-RestMethod` and `Invoke-WebRequest` can reach GitHub.

## Windows setup

1. Run `install_and_run.bat` to install dependencies and launch the app.
2. Run `build_windows_exe.bat` to build distributables.

Both scripts automatically download MPV runtime files into `app/resources/mpv/windows` when missing.
