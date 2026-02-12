# Inter Process Communication Contract

Tankoban Pro uses a strict contract file so channel names do not drift.

## Single source of truth

- `app/shared/ipc.js`

This module defines:

- event and channel constants
- helper functions for creating fully-qualified channel names

## Editing rules

- Add new channels only in `app/shared/ipc.js`.
- Update both ends in the same change: main handler + preload exposure + renderer caller.
- Avoid sending large objects repeatedly; prefer small messages and file-based persistence.

## Common symptom patterns

- Renderer clicks do nothing: preload method name mismatch.
- Event listeners never fire: channel constant typo.
- Crash on startup: preload import error or path resolution change.

Next: `docs/08_TESTING_AND_SMOKE.md`.
