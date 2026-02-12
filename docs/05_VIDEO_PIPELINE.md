# Video scanning and indexing

This is the practical map of the video scan. It is designed to mirror the comic library mindset: build a clean index off the main thread, then render it like a library.

## The moving parts

- Worker entry (stable path): `app/video_scan_worker.js`
- Worker implementation: `app/workers/video_scan_worker_impl.js`
- Worker shared helpers: `app/workers/shared/`
- Persisted index file: `video_index.json` inside the Electron user data folder

## Output shape (what the worker produces)

The worker builds a two-layer index:

- `roots`: each configured video root folder
- `shows`: each immediate child folder under a root (or a special “loose files” show)
- `episodes`: video files grouped under a show and a folder group

The comments inside `video_scan_worker_impl.js` describe the intended fields.

## Runtime flow (end to end)

1) **Main process starts a scan**

A worker thread is created with `workerData` that can include:

- `videoFolders`: roots where each child folder is a show
- `showFolders`: explicit show folders (when the user points directly at a show)
- `hiddenShowIds`: shows that should be excluded
- `ignore`: ignore rules (directory names and substrings)
- `indexPath`: where the worker should write `video_index.json`

2) **Worker enumerates shows**

For each root folder:

- A root identifier is computed from the root path.
- Immediate child directories become show folders.
- A “poster” image is discovered by convention (for example `poster.jpg`, `folder.jpg`, `cover.png`) and saved as `thumbPath` when present.

3) **Worker scans episodes**

- The worker recursively walks show folders, collecting video files by extension.
- It includes cycle protection by tracking `realpath` results (best-effort protection against symlink and junction loops).

4) **Progress preservation across moves and renames (alias identifiers)**

The worker attempts to keep playback progress stable when a file moves:

- It reads the previous `video_index.json` (if `indexPath` points to an existing index).
- It computes a conservative signature using extension, size, modified time, and duration.
- If there is exactly one match in the old index, the worker emits `aliasIds` so the application can map old progress to the new episode identifier.

This logic is intentionally best-effort and will not always match.

5) **Worker writes the index to disk**

If `indexPath` is provided, the worker writes the index JSON to disk.

## Safety rules

- The index JSON shape is part of the application contract. Changing field names will break the renderer.
- Do not move `app/video_scan_worker.js`. It is a stable wrapper.
- If you add a new video extension, change only the extension regular expression and keep everything else stable.

## Debugging checklist

- If a show appears but has zero episodes, confirm recursion is not blocked by ignore rules.
- If the scan never finishes, look for junction loops or very deep directory trees.
- If progress resets after a rename, that is expected in cases where the signature match is ambiguous.


## Auto poster generation for shows without thumbnails (Build 110)

After a scan completes, the main process does a best-effort pass: for any show that has no folder poster (`poster.jpg`, `folder.jpg`, etc.) and no user poster saved in `userData/video_posters/`, it will attempt to generate a poster from inside the first episode using the bundled `mpv.exe` (Windows only). The generated file is saved as `userData/video_posters/<showId>.jpg` and the in-memory index is updated so the UI can show the thumbnail immediately.

Notes:
- Best-effort: failures never break scanning.
- Capped per scan (`AUTO_POSTER_MAX_PER_SCAN`) to avoid extremely long post-scan work.
