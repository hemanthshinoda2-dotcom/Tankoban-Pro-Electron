# Release Checklist (Objective Pass/Fail)

Use this checklist before publishing any release.

## Scope

This checklist defines objective, repeatable pass/fail criteria for:

- clean setup
- app launch
- playback path
- MPV runtime presence
- build artifacts (installer + portable)

A release is **blocked** if any required check fails.

## Environment assumptions

- OS: Windows
- Shell: `cmd.exe` (for `.bat` scripts)
- Repository root: `<repo-root>`

---

## 1) Clean setup

### Working directory

`<repo-root>`

### Command

```bat
install_and_run.bat
```

### Pass criteria

- Script completes without non-zero exit.
- Dependencies install successfully.
- MPV runtime is downloaded automatically if missing.
- Application launches.

### Fail criteria

- Script exits with non-zero code.
- Any dependency installation step errors.
- MPV runtime download fails.
- App does not open.

---

## 2) App launch from app directory

### Working directory

`<repo-root>\app`

### Command

```bat
npm start
```

### Pass criteria

- Electron app window opens.
- No startup crash in terminal output.

### Fail criteria

- Command exits immediately with error.
- App window never appears.
- Fatal startup errors are printed.

---

## 3) Playback path works

### Working directory

`<repo-root>\app`

### Command

```bat
npm run smoke
```

### Pass criteria

- Smoke test completes successfully.
- Playback launch path executes without runtime error.

### Fail criteria

- Smoke test exits non-zero.
- Any playback launch path assertion/check fails.
- Python/Qt player launch fails when invoked by smoke path.

---

## 4) MPV runtime present

### Working directory

`<repo-root>`

### Command

```bat
if exist app\resources\mpv\windows\mpv-2.dll (echo MPV_OK) else (echo MPV_MISSING & exit /b 1)
```

### Pass criteria

- Command outputs `MPV_OK`.
- File exists at expected runtime path.

### Fail criteria

- Output is `MPV_MISSING`.
- File `app\resources\mpv\windows\mpv-2.dll` is missing.

---

## 5) Build installer + portable artifacts

### Working directory

`<repo-root>`

### Command

```bat
build_windows_exe.bat
```

### Pass criteria

- Script exits with zero status.
- Both installer and portable artifacts are produced in `app\dist\`.

### Fail criteria

- Build script exits non-zero.
- Either required artifact is missing.

### Required artifact names and locations

After `build_windows_exe.bat` completes, all files below must exist:

- `app\dist\Tankoban Plus-Setup-0.1.31.exe` (installer)
- `app\dist\Tankoban Plus-0.1.31-x64-Portable.exe` (portable package)

Validation command (from `<repo-root>`):

```bat
if not exist "app\dist\Tankoban Plus-Setup-0.1.31.exe" exit /b 1
if not exist "app\dist\Tankoban Plus-0.1.31-x64-Portable.exe" exit /b 1
echo RELEASE_ARTIFACTS_OK
```

Pass when `RELEASE_ARTIFACTS_OK` is printed and no command fails.

---

## Release decision rule

- **PASS**: every required check above passes.
- **FAIL**: any single check fails.

Do not publish a release on FAIL.
