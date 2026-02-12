# State and persistence map

This application persists user state in JSON files under the Electron user data directory.

## Where the user data directory comes from

The main process chooses a user data directory with migration awareness:

- Code: `app/main/index.js`
- It evaluates multiple candidate folders (current default + historical names)
- It picks the directory with the richest library state signals

This is why changing the application name or user data path can make the application look like a fresh install.

## Common persisted files (typical)

You will see files like:

- `library_state.json`
- `library_index.json`
- `video_index.json`
- `progress.json`

The exact list can grow over time, but the pattern is consistent: JSON files used for fast startup and resume.

## Rules for safe changes

- Adding new fields is usually safe.
- Renaming or removing fields is high risk.
- If you must change a shape, implement a migration step and keep backward compatibility whenever possible.

## Practical debugging

If a user reports “everything reset”:

1) Confirm the user data directory did not change.
2) Check whether the expected JSON files exist and have content.
3) Look for errors during load that caused a fallback to empty state.
