# app/build

This folder is **assets-only** for the app build.

## What’s in here

- `icon.ico` — Windows application icon used for packaging
- `icon.png` — source icon used by packaging scripts / tooling

## Editing guide (keep it safe)

- Changing icons is safe, but keep the **filenames identical** unless you also update the packaging scripts.
- Prefer replacing the file contents **in place** rather than adding new icon names.
- If you change the icon, do a quick sanity run of the packaged app to ensure the executable still shows the icon in Explorer/taskbar.
