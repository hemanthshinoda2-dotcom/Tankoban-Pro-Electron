# Testing and Smoke Flows

This repository favors a **golden path smoke test** over a large formal test suite.

## Golden path

Use `app/TESTING_GOLDEN_PATHS.md` as the authoritative list.

Typical quick run:

1. Launch the app.
2. Add a root folder.
3. Confirm library tiles populate.
4. Open a comic and confirm progress persists.
5. Add a video root folder.
6. Confirm show folders populate.
7. Open a video and confirm playback launches.
8. Use back navigation and confirm the library remains stable.

## Regression danger zones

- Open-with routing (opening files from the operating system)
- Cancelling scans mid-run
- Persistence format changes
- Two-page parity behavior

## When editing scanning code

- Confirm both library and video scans still run.
- Confirm cancel does not leave partial indexes.

Next: `docs/10_CHANGE_CHECKLIST.md`.
