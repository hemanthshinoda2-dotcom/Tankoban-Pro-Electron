/*
TankobanPlus — Library Domain (Build 78C, Phase 4 Checkpoint C)

Handles comic library management:
- Library state and index loading
- Background scanning with worker threads
- Root and series folder management
- Scan ignore patterns

Extracted from Build 78B IPC registry with ZERO behavior changes.
*/

const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { dialog } = require('electron');
const { pathToFileURL } = require('url');

// ========== MODULE STATE ==========

/**
 * BUILD 19C_LIBCACHE: Library state cache
 * Lifted from Build 78B index.js lines 318-332.
 */
let libraryCache = {
  idx: { series: [], books: [] },
  autoSeriesFolders: [],
  effectiveSeriesFolders: [],
  scanning: false,
  scanWorker: null, // BUILD27: allow cancel
  lastScanAt: 0,
  error: null,
  idxLoaded: false,
  scanId: 0,
  lastScanKey: '',
  scanQueuedFolders: null,
  scanQueuedKey: null,
  pendingPruneProgress: false,
  pendingPrunePrevBookIds: null,
};

// BUILD27_SCAN_IGNORE_DEFAULTS
// Lifted from Build 78B index.js lines 690-699.
const DEFAULT_SCAN_IGNORE_DIRNAMES = [
  '__macosx',
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '@eadir',
  '$recycle.bin',
  'system volume information',
];

// ========== HELPER FUNCTIONS ==========

/**
 * List immediate subdirectories of a folder.
 * Lifted from Build 78B index.js lines 235-246.
 */
function listImmediateSubdirs(rootFolder) {
  let entries;
  try { entries = fs.readdirSync(rootFolder, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    // Skip hidden/system folders
    if (e.name.startsWith('.')) continue;
    out.push(path.join(rootFolder, e.name));
  }
  return out;
}

/**
 * Remove duplicates from array.
 * Lifted from Build 78B index.js lines 248-258.
 */
function uniq(arr) {
  const seen = new Set();
  const out = [];
  for (const x of (arr || [])) {
    if (!x) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

/**
 * Compute auto-discovered series folders from roots.
 * Lifted from Build 78B index.js lines 260-290.
 */
function computeAutoSeries(rootFolders, ignoredSeries, scanIgnore) {
  const ignore = new Set(ignoredSeries || []);
  const out = [];

  const ignoreDirNames = new Set((DEFAULT_SCAN_IGNORE_DIRNAMES || []).map(s => String(s || '').toLowerCase()));
  const subsNeedle = (Array.isArray(scanIgnore) ? scanIgnore : [])
    .map(s => String(s || '').trim().toLowerCase())
    .filter(Boolean);

  for (const root of (rootFolders || [])) {
    const subs = listImmediateSubdirs(root);
    for (const folder of subs) {
      if (ignore.has(folder)) continue;

      // Build 28: apply ignore rules to auto-discovered series folders too
      const base = path.basename(folder || '').toLowerCase();
      if (base.startsWith('.')) continue;
      if (ignoreDirNames.has(base)) continue;

      const p = String(folder || '').toLowerCase();
      let blocked = false;
      for (const needle of subsNeedle) {
        if (needle && p.includes(needle)) { blocked = true; break; }
      }
      if (blocked) continue;

      out.push(folder);
    }
  }
  return uniq(out);
}

/**
 * Read library configuration.
 * Lifted from Build 78B index.js lines 579-594.
 */
function readLibraryConfig(ctx) {
  const p = ctx.storage.dataPath('library_state.json');
  const state = ctx.storage.readJSON(p, { seriesFolders: [], rootFolders: [], ignoredSeries: [], scanIgnore: [], videoFolders: [], videoShowFolders: [], videoHiddenShowIds: [], videoFiles: [] });

  // Migration: older builds used { folders: [] }.
  if (state.folders && !state.seriesFolders) state.seriesFolders = state.folders;
  delete state.folders;

  state.seriesFolders = Array.isArray(state.seriesFolders) ? state.seriesFolders : [];
  state.rootFolders = Array.isArray(state.rootFolders) ? state.rootFolders : [];
  state.ignoredSeries = Array.isArray(state.ignoredSeries) ? state.ignoredSeries : [];
  state.scanIgnore = Array.isArray(state.scanIgnore) ? state.scanIgnore : [];
  state.videoFolders = Array.isArray(state.videoFolders) ? state.videoFolders : [];
  state.videoShowFolders = Array.isArray(state.videoShowFolders) ? state.videoShowFolders : [];
  state.videoHiddenShowIds = Array.isArray(state.videoHiddenShowIds) ? state.videoHiddenShowIds : [];
  state.videoFiles = Array.isArray(state.videoFiles) ? state.videoFiles : [];

  return state;
}

/**
 * Write library configuration.
 * Lifted from Build 78B index.js lines 596-607.
 */
async function writeLibraryConfig(ctx, state) {
  // INTENT: Keep this file small and stable. Heavy index lives in library_index.json.
  const p = ctx.storage.dataPath('library_state.json');
  await ctx.storage.writeJSON(p, {
    seriesFolders: Array.isArray(state.seriesFolders) ? state.seriesFolders : [],
    rootFolders: Array.isArray(state.rootFolders) ? state.rootFolders : [],
    ignoredSeries: Array.isArray(state.ignoredSeries) ? state.ignoredSeries : [],
    scanIgnore: Array.isArray(state.scanIgnore) ? state.scanIgnore : [],
    videoFolders: Array.isArray(state.videoFolders) ? state.videoFolders : [],
    videoShowFolders: Array.isArray(state.videoShowFolders) ? state.videoShowFolders : [],
    videoHiddenShowIds: Array.isArray(state.videoHiddenShowIds) ? state.videoHiddenShowIds : [],
    videoFiles: Array.isArray(state.videoFiles) ? state.videoFiles : [],
  });
}

/**
 * Compute effective series folders from config.
 * Lifted from Build 78B index.js lines 609-613.
 */
function computeEffectiveFromConfig(state) {
  const autoSeriesFolders = computeAutoSeries(state.rootFolders, state.ignoredSeries, state.scanIgnore);
  const effectiveSeriesFolders = uniq([...(state.seriesFolders || []), ...autoSeriesFolders]);
  return { autoSeriesFolders, effectiveSeriesFolders };
}

/**
 * Load library index from disk if not already loaded.
 * Lifted from Build 78B index.js lines 615-647.
 */
function ensureLibraryIndexLoaded(ctx) {
  if (libraryCache.idxLoaded) return;
  libraryCache.idxLoaded = true;

  const idxPath = ctx.storage.dataPath('library_index.json');

  // Prefer dedicated index cache.
  const idx = ctx.storage.readJSON(idxPath, null);
  if (idx && Array.isArray(idx.series) && Array.isArray(idx.books)) {
    libraryCache.idx = { series: idx.series, books: idx.books };
    return;
  }

  // Migration: older builds persisted heavy index inside library_state.json.
  const legacy = ctx.storage.readJSON(ctx.storage.dataPath('library_state.json'), null);
  if (legacy && Array.isArray(legacy.series) && Array.isArray(legacy.books)) {
    libraryCache.idx = { series: legacy.series, books: legacy.books };

    // One-time migration: persist index separately and shrink library_state.json to config-only.
    try {
      if (!fs.existsSync(idxPath)) {
        ctx.storage.writeJSON(idxPath, libraryCache.idx);
      }
      writeLibraryConfig(ctx, {
        seriesFolders: Array.isArray(legacy.seriesFolders) ? legacy.seriesFolders : [],
        rootFolders: Array.isArray(legacy.rootFolders) ? legacy.rootFolders : [],
        ignoredSeries: Array.isArray(legacy.ignoredSeries) ? legacy.ignoredSeries : [],
        scanIgnore: Array.isArray(legacy.scanIgnore) ? legacy.scanIgnore : [],
      });
    } catch {}
  }
}

/**
 * Create library state snapshot for renderer.
 * Lifted from Build 78B index.js lines 649-669.
 */
function makeLibraryStateSnapshot(ctx, state) {
  const s = state || readLibraryConfig(ctx);
  const { autoSeriesFolders, effectiveSeriesFolders } = computeEffectiveFromConfig(s);

  libraryCache.autoSeriesFolders = autoSeriesFolders;
  libraryCache.effectiveSeriesFolders = effectiveSeriesFolders;

  return {
    seriesFolders: s.seriesFolders,
    rootFolders: s.rootFolders,
    ignoredSeries: s.ignoredSeries,
    scanIgnore: Array.isArray(s.scanIgnore) ? s.scanIgnore : [],
    autoSeriesFolders,
    effectiveSeriesFolders,
    series: Array.isArray(libraryCache.idx.series) ? libraryCache.idx.series : [],
    books: Array.isArray(libraryCache.idx.books) ? libraryCache.idx.books : [],
    scanning: !!libraryCache.scanning,
    lastScanAt: libraryCache.lastScanAt || 0,
    error: libraryCache.error || null,
  };
}

/**
 * Emit library updated event to renderer.
 * Lifted from Build 78B index.js lines 671-673.
 */
function emitLibraryUpdated(ctx) {
  try { ctx.win?.webContents?.send(ctx.EVENT.LIBRARY_UPDATED, makeLibraryStateSnapshot(ctx)); } catch {}
}

/**
 * Prune progress entries for removed books.
 * Lifted from Build 78B index.js lines 675-687.
 */
function pruneProgressByRemovedBookIds(ctx, removedIds) {
  // INTENT: Only delete progress entries for books that were removed from the library index.
  // This preserves Open File (external) progress that is not part of the library.
  try {
    if (!removedIds || !removedIds.length) return;
    // Note: getProgressMem is in the progress domain - we'll call it through ctx
    const progress = require('../progress');
    const all = progress._getProgressMem ? progress._getProgressMem(ctx) : {};
    let changed = false;
    for (const id of removedIds) {
      if (all && all[id]) { delete all[id]; changed = true; }
    }
    if (changed) ctx.storage.writeJSONDebounced(ctx.storage.dataPath('progress.json'), all, 50);
  } catch {}
}

/**
 * Start library scan worker.
 * Lifted from Build 78B index.js lines 701-837.
 */
function startLibraryScan(ctx, effectiveSeriesFolders, opts = {}) {
  ensureLibraryIndexLoaded(ctx);

  const folders = Array.isArray(effectiveSeriesFolders) ? effectiveSeriesFolders : [];
  const key = JSON.stringify(folders);

  // If a scan is already running, remember the latest requested folders and run again afterward.
  if (libraryCache.scanning) {
    libraryCache.scanQueuedFolders = folders;
    libraryCache.scanQueuedKey = key;
    return;
  }

  const force = !!opts.force;
  if (!force && libraryCache.lastScanAt > 0 && libraryCache.lastScanKey === key) return;

  libraryCache.lastScanKey = key;
  libraryCache.scanning = true;
  libraryCache.error = null;
  const myScanId = ++libraryCache.scanId;

  // BUILD16C_SCAN_STATUS: keep existing renderer scan indicator behavior.
  try {
    ctx.win?.webContents?.send(ctx.EVENT.LIBRARY_SCAN_STATUS, {
      scanning: true,
      progress: { seriesDone: 0, seriesTotal: folders.length || 0, currentSeries: '' },
    });
  } catch {}

  const indexPath = ctx.storage.dataPath('library_index.json');

  // BUILD27: load ignore patterns from config and pass to worker
  const cfg = readLibraryConfig(ctx);
  const scanIgnore = Array.isArray(cfg.scanIgnore) ? cfg.scanIgnore : [];

  // BUILD 16 compat: use file URL for Worker so packaging remains reliable.
  const workerURL = pathToFileURL(path.join(ctx.APP_ROOT, 'library_scan_worker.js'));

  const w = new Worker(workerURL, {
    workerData: {
      seriesFolders: folders,
      indexPath,
      ignore: {
        dirNames: DEFAULT_SCAN_IGNORE_DIRNAMES,
        substrings: scanIgnore,
      },
    },
  });

  libraryCache.scanWorker = w;

  const finish = (ok) => {
    if (myScanId !== libraryCache.scanId) return;

    libraryCache.scanWorker = null;

    libraryCache.scanning = false;
    if (ok) libraryCache.lastScanAt = Date.now();

    // If something queued while we were scanning, immediately run the latest request.
    const queued = libraryCache.scanQueuedFolders;
    const queuedKey = libraryCache.scanQueuedKey;
    libraryCache.scanQueuedFolders = null;
    libraryCache.scanQueuedKey = null;

    if (queued && queuedKey && queuedKey !== libraryCache.lastScanKey) {
      // Keep scanning indicator effectively "on" for chained scans.
      startLibraryScan(ctx, queued, { force: true });
      return;
    }

    try { ctx.win?.webContents?.send(ctx.EVENT.LIBRARY_SCAN_STATUS, { scanning: false, progress: null }); } catch {}
  };

  w.on('message', (msg) => {
    if (myScanId !== libraryCache.scanId) return;

    if (msg && msg.type === 'progress') {
      try {
        ctx.win?.webContents?.send(ctx.EVENT.LIBRARY_SCAN_STATUS, {
          scanning: true,
          progress: {
            seriesDone: msg.seriesDone || 0,
            seriesTotal: msg.seriesTotal || 0,
            currentSeries: msg.currentSeries || '',
          },
        });
      } catch {}
      return;
    }

    if (msg && msg.type === 'done') {
      const idx = msg.idx || { series: [], books: [] };
      libraryCache.idx = {
        series: Array.isArray(idx.series) ? idx.series : [],
        books: Array.isArray(idx.books) ? idx.books : [],
      };

      // One-shot cleanup: prune orphan progress only when a removal requested it.
      if (libraryCache.pendingPruneProgress) {
        libraryCache.pendingPruneProgress = false;

        const prevArr = Array.isArray(libraryCache.pendingPrunePrevBookIds) ? libraryCache.pendingPrunePrevBookIds : [];
        libraryCache.pendingPrunePrevBookIds = null;

        const prev = new Set(prevArr);
        const cur = new Set((libraryCache.idx.books || []).map(b => b.id));

        const removed = [];
        for (const id of prev) {
          if (!cur.has(id)) removed.push(id);
        }

        pruneProgressByRemovedBookIds(ctx, removed);
      }

      emitLibraryUpdated(ctx);
      finish(true);
    }
  });

  w.on('error', (err) => {
    if (myScanId !== libraryCache.scanId) return;
    libraryCache.error = String(err?.message || err);
    emitLibraryUpdated(ctx);
    finish(false);
  });

  w.on('exit', (code) => {
    if (myScanId !== libraryCache.scanId) return;
    if (code !== 0) {
      libraryCache.error = `Library scan worker exited ${code}`;
      emitLibraryUpdated(ctx);
      finish(false);
    }
  });
}

/**
 * Generate series ID from folder path.
 * Lifted from Build 78B index.js lines 181-183.
 */
function seriesIdForFolder(folderPath) {
  return Buffer.from(folderPath).toString('base64url');
}

// ========== DOMAIN HANDLERS ==========

/**
 * Get library state.
 * Lifted from Build 78B index.js lines 1138-1152.
 */
async function getState(ctx) {
  // BUILD 19C_LIBCACHE
  // INTENT: Fast path on launch/open — return cached index immediately (from library_index.json),
  // and kick off ONE background scan per app session to refresh stale disk state.
  ensureLibraryIndexLoaded(ctx);

  const state = readLibraryConfig(ctx);
  const snap = makeLibraryStateSnapshot(ctx, state);

  // Refresh once per run (deduped by lastScanKey/lastScanAt).
  // This keeps the index current without blocking the renderer.
  startLibraryScan(ctx, snap.effectiveSeriesFolders);

  return snap;
}

/**
 * Force library rescan.
 * Lifted from Build 78B index.js lines 1155-1160.
 */
async function scan(ctx, _evt, opts) {
  const state = readLibraryConfig(ctx);
  const snap = makeLibraryStateSnapshot(ctx, state);
  startLibraryScan(ctx, snap.effectiveSeriesFolders, { force: true });
  return { ok: true };
}

/**
 * Cancel running scan.
 * Lifted from Build 78B index.js lines 1163-1181.
 */
async function cancelScan(ctx) {
  if (!libraryCache.scanning || !libraryCache.scanWorker) return { ok: false };

  const w = libraryCache.scanWorker;
  libraryCache.scanWorker = null;

  // Invalidate current scan id so late events are ignored
  libraryCache.scanId++;
  libraryCache.scanning = false;
  libraryCache.error = null;
  libraryCache.scanQueuedFolders = null;
  libraryCache.scanQueuedKey = null;

  try { await w.terminate(); } catch {}

  try { ctx.win?.webContents?.send(ctx.EVENT.LIBRARY_SCAN_STATUS, { scanning: false, progress: null, canceled: true }); } catch {}
  emitLibraryUpdated(ctx);
  return { ok: true };
}

/**
 * Set scan ignore patterns.
 * Lifted from Build 78B index.js lines 1184-1209.
 */
async function setScanIgnore(ctx, _evt, patterns) {
  const state = readLibraryConfig(ctx);
  const arr = Array.isArray(patterns) ? patterns : [];

  // sanitize: strings only, trim, de-dupe, cap size
  const out = [];
  const seen = new Set();
  for (const p of arr) {
    const s = String(p || '').trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= 200) break;
  }

  state.scanIgnore = out;
  await writeLibraryConfig(ctx, state);

  const snap = makeLibraryStateSnapshot(ctx, state);
  startLibraryScan(ctx, snap.effectiveSeriesFolders, { force: true });
  emitLibraryUpdated(ctx);

  return { ok: true, state: snap };
}

/**
 * Add root folder.
 * Lifted from Build 78B index.js lines 1211-1230.
 */
async function addRootFolder(ctx, evt) {
  const { BrowserWindow } = require('electron');
  const w = BrowserWindow.fromWebContents(evt.sender);
  const res = await dialog.showOpenDialog(w, {
    title: 'Add root library folder',
    properties: ['openDirectory'],
  });
  if (res.canceled || !res.filePaths?.length) return { ok: false };

  const root = res.filePaths[0];

  const state = readLibraryConfig(ctx);
  if (!state.rootFolders.includes(root)) state.rootFolders.unshift(root);
  await writeLibraryConfig(ctx, state);

  const snap = makeLibraryStateSnapshot(ctx, state);
  startLibraryScan(ctx, snap.effectiveSeriesFolders, { force: true });

  // Return immediately with cached index; renderer will update on library:updated.
  return { ok: true, state: snap };
}

/**
 * Remove root folder.
 * Lifted from Build 78B index.js lines 1233-1251.
 */
async function removeRootFolder(ctx, _evt, rootPath) {
  const root = String(rootPath || '');
  if (!root) return { ok: false };

  ensureLibraryIndexLoaded(ctx);
  try { libraryCache.pendingPrunePrevBookIds = (libraryCache.idx.books || []).map(b => b.id); } catch {}

  const state = readLibraryConfig(ctx);
  state.rootFolders = state.rootFolders.filter(r => r !== root);
  await writeLibraryConfig(ctx, state);

  // Defer orphan pruning until the new index is known (post-scan).
  libraryCache.pendingPruneProgress = true;

  const snap = makeLibraryStateSnapshot(ctx, state);
  startLibraryScan(ctx, snap.effectiveSeriesFolders, { force: true });

  return { ok: true, state: snap };
}

/**
 * Add series folder.
 * Lifted from Build 78B index.js lines 1254-1272.
 */
async function addSeriesFolder(ctx, evt) {
  const { BrowserWindow } = require('electron');
  const w = BrowserWindow.fromWebContents(evt.sender);
  const res = await dialog.showOpenDialog(w, {
    title: 'Add series folder',
    properties: ['openDirectory'],
  });
  if (res.canceled || !res.filePaths?.length) return { ok: false };

  const folder = res.filePaths[0];

  const state = readLibraryConfig(ctx);
  if (!state.seriesFolders.includes(folder)) state.seriesFolders.unshift(folder);
  await writeLibraryConfig(ctx, state);

  const snap = makeLibraryStateSnapshot(ctx, state);
  startLibraryScan(ctx, snap.effectiveSeriesFolders, { force: true });

  return { ok: true, state: snap };
}

/**
 * Remove series folder.
 * Lifted from Build 78B index.js lines 1274-1317.
 */
async function removeSeriesFolder(ctx, _evt, folder) {
  const target = String(folder || '');
  if (!target) return { ok: false };

  ensureLibraryIndexLoaded(ctx);
  try { libraryCache.pendingPrunePrevBookIds = (libraryCache.idx.books || []).map(b => b.id); } catch {}

  const state = readLibraryConfig(ctx);

  // If it's a manually-added series, remove it. If it was auto-detected from a root,
  // add it to ignoredSeries so it stays hidden.
  if (state.seriesFolders.includes(target)) {
    state.seriesFolders = state.seriesFolders.filter(f => f !== target);
  } else {
    const autoSeriesFolders = computeAutoSeries(state.rootFolders, state.ignoredSeries, state.scanIgnore);
    if (autoSeriesFolders.includes(target) && !state.ignoredSeries.includes(target)) {
      state.ignoredSeries.unshift(target);
    }
  }

  // Cleanup rule: removing a series must remove its Continue entries immediately.
  // INTENT: Use cached index (fast) instead of rebuilding index synchronously (slow).
  try {
    const removedSeriesId = seriesIdForFolder(target);
    const progress = require('../progress');
    const all = progress._getProgressMem ? progress._getProgressMem(ctx) : {};
    let changed = false;

    for (const b of (libraryCache.idx.books || [])) {
      if (b.seriesId === removedSeriesId && all[b.id]) { delete all[b.id]; changed = true; }
    }

    if (changed) ctx.storage.writeJSONDebounced(ctx.storage.dataPath('progress.json'), all, 50);
  } catch {}

  await writeLibraryConfig(ctx, state);

  // Also prune orphans after we have the new index (post-scan).
  libraryCache.pendingPruneProgress = true;

  const snap = makeLibraryStateSnapshot(ctx, state);
  startLibraryScan(ctx, snap.effectiveSeriesFolders, { force: true });

  return { ok: true, state: snap };
}

/**
 * Unignore series folder.
 * Lifted from Build 78B index.js lines 1319-1330.
 */
async function unignoreSeries(ctx, _evt, folder) {
  const target = String(folder || '');

  const state = readLibraryConfig(ctx);
  state.ignoredSeries = state.ignoredSeries.filter(x => x !== target);
  await writeLibraryConfig(ctx, state);

  const snap = makeLibraryStateSnapshot(ctx, state);
  startLibraryScan(ctx, snap.effectiveSeriesFolders, { force: true });

  return { ok: true, state: snap };
}

/**
 * Clear all ignored series.
 * Lifted from Build 78B index.js lines 1332-1341.
 */
async function clearIgnoredSeries(ctx) {
  const state = readLibraryConfig(ctx);
  state.ignoredSeries = [];
  await writeLibraryConfig(ctx, state);

  const snap = makeLibraryStateSnapshot(ctx, state);
  startLibraryScan(ctx, snap.effectiveSeriesFolders, { force: true });

  return { ok: true, state: snap };
}

module.exports = {
  getState,
  scan,
  cancelScan,
  setScanIgnore,
  addRootFolder,
  removeRootFolder,
  addSeriesFolder,
  removeSeriesFolder,
  unignoreSeries,
  clearIgnoredSeries,
};
