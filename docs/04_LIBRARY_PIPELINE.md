# Library scanning and indexing (comics)

This is the practical map of the comic library scan. It follows the order the code runs and points to the exact files that own each step.

## The moving parts

- Worker entry (stable path): `app/library_scan_worker.js`
- Worker implementation: `app/workers/library_scan_worker_impl.js`
- Worker shared helpers: `app/workers/shared/`
- Persisted index file: `library_index.json` inside the Electron user data folder

## Runtime flow (end to end)

1) **Main process starts a scan**

The main process creates a worker thread and passes `workerData` that includes:

- `seriesFolders`: absolute paths to each comic series folder
- `ignore`: ignore rules (directory names and substrings)
- `indexPath`: where the worker should write `library_index.json`

The main process listens for worker messages:

- `{ type: "progress", ... }` for progress updates
- `{ type: "done", idx }` when the scan finishes

2) **Worker walks the filesystem**

Owned by `app/workers/library_scan_worker_impl.js`.

- The worker builds an ignore configuration using `app/workers/shared/ignore.js`.
- It recursively walks each series folder and collects `.cbz` and `.cbr` files.
- It is intentionally conservative: any filesystem error is treated as “skip and continue” instead of crashing the whole scan.

3) **Worker builds a stable index**

For each archive:

- It computes a book identifier based on `absolute path + file size + modified time` (`app/workers/shared/ids.js`).
- It stores metadata needed for sorting and resume:
  - `id`, `title`, `seriesId`, `series`, `path`, `size`, `mtimeMs`

For each series folder:

- It computes a series identifier from the folder path.
- It records:
  - `id`, `name`, `path`, `count`, `newestMtimeMs`

The final output shape is:

- `idx.series`: array of series objects
- `idx.books`: array of book objects

4) **Worker yields periodically to stay responsive**

The worker yields to the event loop every 10 archives to avoid starvation:

- `await new Promise(res => setImmediate(res));`

That is why the function is `async` and the file uses top-level `await`.

5) **Worker writes the index to disk (optional but usually enabled)**

If `workerData.indexPath` is present, the worker creates the parent directory and writes a pretty-printed JSON file.

6) **Main process stores and serves the index**

After the worker posts `{ type: "done" }`, the main process (and later the renderer through the preload bridge) reads from the persisted index file to populate the library.

## Safety rules

- **Do not change** the index JSON shape casually. The renderer expects the field names as-is.
- Do not move `app/library_scan_worker.js`. That file exists specifically because other code depends on the path.
- If you want to reuse logic between workers, add it to `app/workers/shared/` (that is already the pattern).

## Debugging checklist

- If the library is empty after a scan, confirm the worker actually received `seriesFolders`.
- If scanning is slow, the hot loop is the recursive walk plus `statSync`; that is normal.
- If the application freezes during scan, confirm the yield points still exist.
