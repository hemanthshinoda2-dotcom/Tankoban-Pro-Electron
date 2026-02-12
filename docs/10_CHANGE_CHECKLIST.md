# Change Checklist

Use this when making any non-trivial edit.

## Before coding

- Identify the layer: main, preload, renderer, or worker.
- Locate the entrypoint and the owner file.
- Read the folder README where you are editing.

## While coding

- Keep the public contract stable.
- Add comments near any intentionally weird behavior.

## After coding

- Run the golden path in `app/TESTING_GOLDEN_PATHS.md`.
- Update the nearest folder README with the new file or decision.
- Update `docs/CODEMAP_INDEX.md` if new files were added.
