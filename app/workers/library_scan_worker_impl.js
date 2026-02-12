/*
OWNERSHIP (worker):
- Background library scanning (file walking + metadata extraction)
- Runs off the main thread; communicates with main via worker messages only
- Must remain side-effect free outside the scan run
*/

// BUILD 19C_LIBCACHE (Build 19C)
// INTENT: Worker builds the heavy library index off the UI/main thread.
// It optionally persists the index to the provided indexPath so startup can be fast.

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');

const { statSafe } = require('./shared/fs_safe');
const { makeIgnoreConfig, shouldIgnorePath } = require('./shared/ignore');
const { seriesIdForFolder, bookIdForPath } = require('./shared/ids');




function listCbzFilesRecursive(rootDir, ignoreCfg) {
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);

      if (shouldIgnorePath(full, e.name, e.isDirectory(), ignoreCfg)) continue;

      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && /\.(cbz|cbr)$/i.test(e.name)) out.push(full);
    }
  }
  return out;
}



// BUILD 88 FIX 1.3: Made async to support yield points
async function buildLibraryIndex(seriesFolders) {
  const series = [];
  const books = [];

  const ignoreCfg = makeIgnoreConfig(workerData.ignore || null);
  const total = Array.isArray(seriesFolders) ? seriesFolders.length : 0;

  try { parentPort.postMessage({ type: 'progress', seriesDone: 0, seriesTotal: total, currentSeries: '' }); } catch {}

  let done = 0;
  for (const folder of (seriesFolders || [])) {
    const sid = seriesIdForFolder(folder);
    const name = path.basename(folder);
    const files = listCbzFilesRecursive(folder, ignoreCfg);

    const seriesBooks = [];
    let bookCount = 0;
    for (const fp of files) {
      const st = statSafe(fp);
      if (!st) continue;
      const id = bookIdForPath(fp, st);
      const title = path.basename(fp).replace(/\.(cbz|cbr)$/i, '');

      const b = {
        id,
        title,
        seriesId: sid,
        series: name,
        path: fp,
        size: st.size,
        mtimeMs: st.mtimeMs,
      };
      books.push(b);
      seriesBooks.push(b);
      
      // BUILD 88 FIX 1.3: Yield to event loop every 10 archives to prevent freeze
      bookCount++;
      if (bookCount % 10 === 0) {
        await new Promise(res => setImmediate(res));
      }
    }

    series.push({
      id: sid,
      name,
      path: folder,
      count: seriesBooks.length,
      newestMtimeMs: seriesBooks.reduce((m, x) => Math.max(m, x.mtimeMs || 0), 0),
    });

    done++;
    try {
      parentPort.postMessage({
        type: 'progress',
        seriesDone: done,
        seriesTotal: total,
        currentSeries: name,
      });
    } catch {}
  }

  // Stable ordering
  series.sort((a, b) => (b.newestMtimeMs || 0) - (a.newestMtimeMs || 0) || a.name.localeCompare(b.name));
  books.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));

  return { series, books };
}

// BUILD 88 FIX 1.3: buildLibraryIndex is now async
try {
  const folders = Array.isArray(workerData?.seriesFolders) ? workerData.seriesFolders : [];
  const idx = await buildLibraryIndex(folders);

  const indexPath = String(workerData?.indexPath || '');
  if (indexPath) {
    try {
      fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  // TRACE:PERSIST_WRITE fs.writeFileSync(indexPath, JSON.stringify(idx, null, 2), 'utf-8');
      fs.writeFileSync(indexPath, JSON.stringify(idx, null, 2), 'utf-8');
    } catch {}
  }

  parentPort.postMessage({ type: 'done', idx });
} catch (err) {
  // Keep message shape stable; main.js treats errors as scan failure.
  parentPort.postMessage({ type: 'done', idx: { series: [], books: [] }, error: String(err?.message || err) });
}
