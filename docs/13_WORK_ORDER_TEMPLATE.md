# Work Order Template (copy-paste)

Use this format when asking an Artificial Intelligence editor to change Tankoban Pro.

## Goal

Describe the user-visible behavior you want.

## Base assumptions

- Windows only.
- Python is installed.
- Embedded canvas playback is dead and must not be reintroduced.
- Deliver changes as full file replacements for every changed file.

## Hard constraints (non negotiable)

- Preserve `main()` and preserve this entrypoint line exactly as-is (same spacing, same one-liner, do not reformat it):  
  `if __name__ == "__main__": raise SystemExit(main())`
- Avoid “helpful refactors” that move methods around or change class structure unless absolutely necessary.
- If a Qt signal hookup crashes with `AttributeError` for a method, treat indentation or method placement inside the class as the first suspect.

## Required outputs

1) A short list of files you changed.
2) For each changed file: output the entire file content.
3) Update documentation so it stays accurate:
   - Update the relevant map in `docs/maps/`.
   - Update `docs/README.md` if you add or move documents.
   - Update `DANGER_ZONES.md` if you touched a brittle area.

## Mandatory checks

- Run the golden path smoke flow (`docs/08_TESTING_AND_SMOKE.md`).
- Confirm video click launches the Python and Qt player.
- Confirm closing the player restores the app view and progress updates.

