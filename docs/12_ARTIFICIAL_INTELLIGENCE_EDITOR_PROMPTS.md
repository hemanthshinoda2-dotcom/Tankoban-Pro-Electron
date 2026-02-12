# Artificial Intelligence editor prompts

These prompts are designed to be pasted into another editor. They are short, strict, and focus on correctness.

Project assumptions: Windows only. Python is assumed to be installed. Embedded canvas playback is dead. Deliver changes as full file replacements and keep documentation updated.

## Prompt 1: orientation and truth summary

Use this when a new editor opens the repository for the first time.

```text
You are editing the Tankoban Pro repository.

Goal: produce a truth summary of what this application is today.

Hard constraints:
- Windows only.
- Embedded canvas playback is not part of this repository line.
- Video playback is done by launching the detached Python and Qt player at app/player_qt/run_player.py.
- Python is assumed to be installed.
- When delivering changes, output full file replacements for every changed file.
- Every change must be paired with documentation updates so the docs remain accurate.
- Do not refactor or rename files.
- Do not change formatting unless a change is required.

Steps:
1) Read these first: app/START_HERE.md, docs/00_START_HERE.md, docs/01_ARCHITECTURE_OVERVIEW.md, docs/05_VIDEO_PIPELINE.md, docs/06_QT_PLAYER.md, docs/maps/README.md, DANGER_ZONES.md.
2) Build a one page summary:
   - What the app does (comics + videos).
   - What runs in main process versus renderer versus Python player.
   - Where persistence lives (user data files).
   - The three most dangerous areas that break easily.
3) Output:
   - The summary.
   - A file map of the top ten files to touch for common changes.
   - A short smoke checklist.
```

## Prompt 2: implement a small feature safely

Use this when you have a clear request.

```text
You are editing the Tankoban Pro repository.

Work order:
<PASTE THE REQUEST HERE>

Hard constraints:
- Minimal diffs. Keep changes local.
- Preserve all entry points.
- Keep main process to renderer process messaging strings only in app/shared/ipc.js.
- Keep ipcMain registrations only in app/main/ipc/index.js and app/main/ipc/register/*.
- Renderer must call only window.Tanko.api.* (defined in app/src/services/api_gateway.js).
- In app/player_qt/run_player.py, preserve this line exactly (spacing and one line):
  if __name__ == "__main__": raise SystemExit(main())
- Do not move methods out of the PlayerWindow class (indentation errors can crash the player immediately).

Definition of done:
- The feature works.
- npm run smoke passes.
- The relevant documentation is updated (docs/ and local README.md files).

Required output format:
1) A short explanation of what you changed.
2) A list of files changed with the reason for each.
3) A test plan with exact steps.
4) The full patch or full file replacements (no partial snippets).
```

## Prompt 3: audit a build for missing work

Use this when an editor claims changes are done, or when you receive a build zip.

```text
You are auditing a Tankoban Pro build zip.

Inputs:
- A build zip file.
- A list of requested changes.

Goal:
- Determine whether each requested change is actually implemented.

Method:
- Locate the exact code paths where the feature must exist.
- Verify by reading the code, not by guessing.
- Mark each item as PASS, FAIL, or PARTIAL.
- If FAIL or PARTIAL, explain exactly what is missing and which files prove it.

Report format:
- A table with: change request, status, evidence (file and line references), and fix suggestion.
- A short summary of the biggest risk areas you saw.

Important:
- Do not assume a feature exists because a document claims it.
- Trust the code and the running path.
```
