# Tankoban Pro — Build 83 (Critical Hotfix)

## Exactly which files changed

- `app/main/index.js`
  - Captures the legacy `userData` directory *before* any app name/path changes, then restores it via `app.setPath('userData', legacyUserData)`.

- `app/src/domains/shell/core.js`
  - Exposes the existing `el` map as `window.el` for renderer back-compat (no key/selector changes).

- `app/BUILD_83_DONE.md` (this file)

## Fix #1 verification — libraries restored

- **Comics library**: previously saved entries reappear immediately on launch (no “fresh install” state).
- **Videos library**: previously saved entries reappear immediately on launch (no “fresh install” state).

## Fix #2 verification — topbar actions restored

- **Comics**: Add Root / Add Folder / Open File actions work.
- **Videos**: Add Root / Add Folder / Open File actions work.

## Gates

- No IPC channel strings or payloads changed.
- No persistence filenames/keys/formats changed.
- No UI/layout/styling changes made.
- `npm run smoke` passes.
- No non-doc files were removed; all input files/folders preserved and native/build artifacts left untouched.
