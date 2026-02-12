# Tankoban Pro Electron

## Windows setup

1. Run `install_and_run.bat` to perform a full first-run setup from one entrypoint.
   - Verifies Python availability (`py` or `python`) and enforces Python 3.9+.
   - Installs MPV runtime files when missing.
   - Runs `app\player_qt\install_windows.bat` to create/update the Qt player virtualenv.
   - Installs Electron app dependencies and then launches the app.
2. Run `build_windows_exe.bat` to build distributables.

### Non-interactive setup mode (CI/release scripts)

Use either of the following:
- `install_and_run.bat --non-interactive`
- `set TANKOBAN_NON_INTERACTIVE=1 && install_and_run.bat`

In non-interactive mode, setup runs with fail-fast behavior and **does not launch the app**.
Any Python/Qt setup failure exits with remediation text so CI can fail clearly.

Both scripts automatically download MPV runtime files into `app/resources/mpv/windows` when missing.
