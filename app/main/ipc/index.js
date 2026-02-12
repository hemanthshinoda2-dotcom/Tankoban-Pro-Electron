/*
TankobanPlus — Main IPC Registry (Build 78A, Phase 4 Checkpoint A)

  // TRACE:IPC_IN OWNERSHIP: THE ONLY FILE WHERE ipcMain.handle/on MAY BE CALLED.
OWNERSHIP: THE ONLY FILE WHERE ipcMain.handle/on MAY BE CALLED.
All IPC handler registrations live here.

Build 78A changes:
- Persistence-sensitive handlers (progress, videoProgress, videoSettings, videoUi, seriesSettings)
  are now delegated to domain modules in app/main/domains/
- Storage utilities (dataPath, readJSON, writeJSON, writeJSONDebounced) are centralized
  in app/main/lib/storage.js
- Domain handlers use a ctx object for dependencies
- All other handlers remain inline as part of gradual extraction

This file is a complete extraction of all IPC-related code from main.js.
*/

module.exports = function registerIpc({ APP_ROOT, win, windows }) {

// ========== IMPORTS ==========
const { app, BrowserWindow, dialog, ipcMain, Menu, shell, clipboard, nativeImage, screen } = require('electron');
const { Worker } = require('worker_threads');
const { pathToFileURL, fileURLToPath } = require('url');
const { createExtractorFromData } = require('node-unrar-js');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');

// Phase 2: IPC contract (Build 76) - Phase 3: adjusted path
const { CHANNEL, EVENT } = require('../../shared/ipc');

// Phase 4A: Storage library and persistence domains (Build 78A)
const storage = require('../lib/storage');
const progress = require('../domains/progress');
const videoProgress = require('../domains/videoProgress');
const videoSettings = require('../domains/videoSettings');
const videoUi = require('../domains/videoUi');
const seriesSettings = require('../domains/seriesSettings');

// BUILD88: Ensure health:ping is always registered even if later registry modules throw.
try {
  ipcMain.handle(CHANNEL.HEALTH_PING, async () => ({ ok: true, timestamp: Date.now() }));
} catch {}

// Phase 4B: Window, shell, archives, export domains (Build 78B)
const windowDomain = require('../domains/window');
const shellDomain = require('../domains/shell');
const archivesDomain = require('../domains/archives');
const exportDomain = require('../domains/export');

// Phase 4C: Thumbs, library, video domains (Build 78C)
const thumbsDomain = require('../domains/thumbs');
const libraryDomain = require('../domains/library');
const videoDomain = require('../domains/video');

// Phase 4D: MPV/libmpv extraction + thin registry sweep (Build 78D)
const playerCoreDomain = require('../domains/player_core');
const clipboardDomain = require('../domains/clipboard');
const filesDomain = require('../domains/files');
const comicDomain = require('../domains/comic');

// Phase 4A/4B: Build context object for domain handlers
// Note: createWindow and createVideoShellWindow are defined below and added to ctx after definition
const ctx = { APP_ROOT, win, storage, CHANNEL, EVENT };

// Phase 2: IPC contract (Build 76)

// BUILD31_DEVTOOLS_SHORTCUTS (TankobanPlus Build 31)
// INTENT: Allow opening Chromium Developer Tools even when the app menu is removed.
// Works in packaged builds.
function __tankobanToggleDevTools(w){
  if (!w || w.isDestroyed()) return;
  try {
    const wc = w.webContents;
    if (!wc) return;
    if (wc.isDevToolsOpened()) wc.closeDevTools();
    else wc.openDevTools({ mode: 'detach' });
  } catch {}
}

function __tankobanBindDevtoolsShortcuts(w){
  if (!w || w.isDestroyed()) return;
  try {
    w.webContents.on('before-input-event', (event, input) => {
      try {
        const key = String(input?.key || '');
        const ctrl = !!(input?.control || input?.meta);
        const shift = !!input?.shift;
        if (key === 'F12' || (ctrl && shift && (key === 'I' || key === 'J'))) {
          event.preventDefault();
          __tankobanToggleDevTools(w);
        }
      } catch {}
    });
  } catch {}
}

// BUILD 19D/19E: CBZ/CBR session management moved to domains/archives (Build 78B, Phase 4B)

function dataPath(file) {
  return path.join(app.getPath('userData'), file);
}

function readJSONSafe(p, fallback) {
  const bakPath = `${p}.bak`;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch {
    try {
      const bak = JSON.parse(fs.readFileSync(bakPath, 'utf-8'));
      try { writeJSONSafe(p, bak); } catch {}
      return bak;
    } catch {
      return fallback;
    }
  }
}

function writeJSONSafe(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });

  // Improvement 2 (Build 86): atomic JSON writes + last-known-good backup
  const json = JSON.stringify(obj, null, 2);
  const dir = path.dirname(p);
  const tmp = path.join(dir, `.${path.basename(p)}.${process.pid}.${Date.now()}.tmp`);
  const bakPath = `${p}.bak`;

  let fd;
  try {
    fd = fs.openSync(tmp, 'w');
    fs.writeSync(fd, json, 0, 'utf-8');
    try { fs.fsyncSync(fd); } catch {}
  } finally {
    try { if (typeof fd === 'number') fs.closeSync(fd); } catch {}
  }

  try {
    fs.renameSync(tmp, p);
  } catch {
    try { fs.copyFileSync(tmp, p); } catch {}
    try { fs.unlinkSync(tmp); } catch {}
  }

  try { fs.copyFileSync(p, bakPath); } catch {}
}

// BUILD 16: debounce frequent JSON writes (progress/settings) to reduce disk churn.
// Map: filePath -> { timer, latestObj }
const debouncedJSONWrites = new Map();

function writeJSONDebounced(p, obj, delayMs = 150) {
  const prev = debouncedJSONWrites.get(p);
  if (prev?.timer) clearTimeout(prev.timer);

  debouncedJSONWrites.set(p, {
    latestObj: obj,
    timer: setTimeout(() => {
      const cur = debouncedJSONWrites.get(p);
      if (!cur) return;
      try { writeJSONSafe(p, cur.latestObj); } catch {}
      debouncedJSONWrites.delete(p);
    }, delayMs),
  });
}

function statSafe(p) {
  try { return fs.statSync(p); } catch { return null; }
}

function listCbzFilesRecursive(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && /\.cbz$/i.test(e.name)) out.push(full);
    }
  }
  return out;
}

function seriesIdForFolder(folderPath) {
  return Buffer.from(folderPath).toString('base64url');
}

function bookIdForPath(p, st) {
  // Stable enough for resume: absolute path + size + modified time.
  return Buffer.from(`${p}::${st.size}::${st.mtimeMs}`).toString('base64url');
}

function buildLibraryIndex(seriesFolders) {
  const series = [];
  const books = [];

  for (const folder of (seriesFolders || [])) {
    const sid = seriesIdForFolder(folder);
    const name = path.basename(folder);
    const files = listCbzFilesRecursive(folder);

    const seriesBooks = [];
    for (const fp of files) {
      const st = statSafe(fp);
      if (!st) continue;
      const id = bookIdForPath(fp, st);
      const title = path.basename(fp).replace(/\.cbz$/i, '');

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
    }

    series.push({
      id: sid,
      name,
      path: folder,
      count: seriesBooks.length,
      newestMtimeMs: seriesBooks.reduce((m, x) => Math.max(m, x.mtimeMs || 0), 0),
    });
  }

  // Stable ordering
  series.sort((a, b) => (b.newestMtimeMs || 0) - (a.newestMtimeMs || 0) || a.name.localeCompare(b.name));
  books.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));

  return { series, books };
}

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


// BUILD 19C_LIBCACHE (Build 19C)
// INTENT: Adopt Build 23’s efficiency architecture:
// - Keep library_state.json config-only (small, cheap reads/writes).
// - Store the heavy index (series/books) in library_index.json.
// - Never rebuild the index synchronously in IPC handlers (no main-process stalls).
//
// SCHEMA: libraryCache
// {
//   idx: { series: Array<Series>, books: Array<Book> },
//   autoSeriesFolders: string[],
//   effectiveSeriesFolders: string[],
//   scanning: boolean,
//   lastScanAt: number,
//   error: string|null,
//   idxLoaded: boolean,
//   scanId: number,
//   lastScanKey: string,              // JSON.stringify(effectiveSeriesFolders) for dedupe
//   scanQueuedFolders: string[]|null, // last requested folders while a scan is running
//   scanQueuedKey: string|null,
//   pendingPruneProgress: boolean,        // one-shot: prune after next scan completes
//   pendingPrunePrevBookIds: string[]|null // snapshot of book IDs BEFORE removal (for diff-based pruning)
// }
//
// Series: { id, name, path, count, newestMtimeMs }
// Book:   { id, title, seriesId, series, path, size, mtimeMs }
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
};




// ---------- Video library cache (Tankoban Plus Build 3.2) ----------
// INTENT: Keep video config in library_state.json, but store heavy index in video_index.json.
// VideoIdx (Build 3.2):
//   roots:    Array<{id,name,path,displayPath}>
//   shows:    Array<{id,rootId,name,path,displayPath,isLoose}>
//   episodes: Array<{id,title,rootId,rootName,showId,showName,path,size,mtimeMs,ext,durationSec,width,height,thumbPath,folderId,folderName}>
let videoCache = {
  idx: { roots: [], shows: [], episodes: [] },
  scanning: false,
  scanWorker: null,
  lastScanAt: 0,
  error: null,
  idxLoaded: false,
  scanId: 0,
  lastScanKey: '',
  scanQueuedFolders: null,
  scanQueuedKey: null,
};

function ensureVideoIndexLoaded() {
  if (videoCache.idxLoaded) return;
  videoCache.idxLoaded = true;

  const idxPath = dataPath('video_index.json');
  const idx = readJSONSafe(idxPath, null);
  if (idx && Array.isArray(idx.roots) && Array.isArray(idx.shows) && Array.isArray(idx.episodes)) {
    videoCache.idx = { roots: idx.roots, shows: idx.shows, episodes: idx.episodes };
    return;
  }

  // Legacy (Build 1/2): { folders, videos }
  if (idx && Array.isArray(idx.folders) && Array.isArray(idx.videos)) {
    // Do not try to "fix" the old model here; Build 3.2 worker will rebuild on next scan.
    videoCache.idx = { roots: [], shows: [], episodes: [] };
  }
}

function videoRootIdForPath(p) {
  return Buffer.from(String(p || ''), 'utf8').toString('base64url');
}

function normalizeDisplayPath(p) {
  return String(p || '').replace(/\\/g, '/');
}

function rootsFromConfig(videoFolders) {
  const folders = Array.isArray(videoFolders) ? videoFolders : [];
  return folders.map((fp) => ({
    id: videoRootIdForPath(fp),
    name: path.basename(fp) || fp,
    path: fp,
    displayPath: normalizeDisplayPath(fp),
  }));
}

function videoHiddenShowIdsFromConfig(cfg) {
  const ids = Array.isArray(cfg?.videoHiddenShowIds) ? cfg.videoHiddenShowIds : [];
  return ids.map(x => String(x || '')).filter(Boolean);
}

function filterVideoIdxForHiddenShows(idx, hiddenIds) {
  const set = new Set(Array.isArray(hiddenIds) ? hiddenIds : []);
  if (!set.size) return idx;
  const shows = Array.isArray(idx?.shows) ? idx.shows.filter(s => !set.has(String(s?.id || ''))) : [];
  const episodes = Array.isArray(idx?.episodes) ? idx.episodes.filter(e => !set.has(String(e?.showId || ''))) : [];
  const roots = Array.isArray(idx?.roots) ? idx.roots : [];
  return { roots, shows, episodes };
}

function makeVideoStateSnapshot(state) {
  const s = state || readLibraryConfig();
  const folders = Array.isArray(s.videoFolders) ? s.videoFolders : [];
  const rootsCfg = rootsFromConfig(folders);

  const hiddenShowIds = videoHiddenShowIdsFromConfig(s);

  const idxRoots = Array.isArray(videoCache.idx.roots) ? videoCache.idx.roots : [];
  const idxShows = Array.isArray(videoCache.idx.shows) ? videoCache.idx.shows : [];
  const idxEpisodes = Array.isArray(videoCache.idx.episodes) ? videoCache.idx.episodes : [];

  const filtered = filterVideoIdxForHiddenShows({ roots: idxRoots, shows: idxShows, episodes: idxEpisodes }, hiddenShowIds);

  // BUILD71: Performance improvement - send episode counts instead of full arrays
  // Calculate episode counts per show for initial state
  const episodeCounts = {};
  if (Array.isArray(filtered.episodes)) {
    for (const ep of filtered.episodes) {
      const sid = String(ep?.showId || '');
      if (sid) episodeCounts[sid] = (episodeCounts[sid] || 0) + 1;
    }
  }

  // Attach episode count to each show
  const showsWithCounts = (filtered.shows || []).map(show => ({
    ...show,
    episodeCount: episodeCounts[String(show?.id || '')] || 0,
  }));

  return {
    videoFolders: folders,
    roots: (filtered.roots && filtered.roots.length) ? filtered.roots : (idxRoots.length ? idxRoots : rootsCfg),
    shows: showsWithCounts,
    // BUILD73: Send all episodes initially (fixes Continue Watching + episode count bugs)
    // The on-demand loading in Build 71/72 caused hydration issues
    episodes: filtered.episodes || [],
    episodeCounts,
    scanning: !!videoCache.scanning,
    lastScanAt: videoCache.lastScanAt || 0,
    error: videoCache.error || null,
  };
}

function emitVideoUpdated() {
  try { win?.webContents?.send(EVENT.VIDEO_UPDATED, makeVideoStateSnapshot()); } catch {}
}

// Reuse ignore defaults from comic scanning
const DEFAULT_VIDEO_SCAN_IGNORE_DIRNAMES = [
  '__macosx',
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '@eadir',
  '$recycle.bin',
  'system volume information',
];

function startVideoScan(videoFolders, opts = {}) {
  ensureVideoIndexLoaded();

  const folders = Array.isArray(videoFolders) ? videoFolders : [];
  const key = JSON.stringify(folders);

  if (videoCache.scanning) {
    videoCache.scanQueuedFolders = folders;
    videoCache.scanQueuedKey = key;
    return;
  }

  const force = !!opts.force;
  if (!force && videoCache.lastScanAt > 0 && videoCache.lastScanKey === key) return;

  videoCache.lastScanKey = key;
  videoCache.scanning = true;
  videoCache.error = null;
  const myScanId = ++videoCache.scanId;

  try {
    win?.webContents?.send(EVENT.VIDEO_SCAN_STATUS, {
      scanning: true,
      progress: { foldersDone: 0, foldersTotal: folders.length || 0, currentFolder: '' },
    });
  } catch {}

  const indexPath = dataPath('video_index.json');
  const thumbsDir = dataPath('video_thumbs');
  const cfg = readLibraryConfig();
  const scanIgnore = Array.isArray(cfg.scanIgnore) ? cfg.scanIgnore : [];
  const hiddenShowIds = videoHiddenShowIdsFromConfig(cfg);

  const workerURL = pathToFileURL(path.join(APP_ROOT, 'video_scan_worker.js'));
  const w = new Worker(workerURL, {
    workerData: {
      videoFolders: folders,
      indexPath,
      thumbsDir,
      hiddenShowIds,
      ignore: {
        dirNames: DEFAULT_VIDEO_SCAN_IGNORE_DIRNAMES,
        substrings: scanIgnore,
      },
    },
  });

  videoCache.scanWorker = w;

  const finish = (ok) => {
    if (myScanId !== videoCache.scanId) return;

    videoCache.scanWorker = null;
    videoCache.scanning = false;
    if (ok) videoCache.lastScanAt = Date.now();

    const queued = videoCache.scanQueuedFolders;
    const queuedKey = videoCache.scanQueuedKey;
    videoCache.scanQueuedFolders = null;
    videoCache.scanQueuedKey = null;

    if (queued && queuedKey && queuedKey !== videoCache.lastScanKey) {
      startVideoScan(queued, { force: true });
      return;
    }

    try { win?.webContents?.send(EVENT.VIDEO_SCAN_STATUS, { scanning: false, progress: null }); } catch {}
  };

  w.on('message', (msg) => {
    if (myScanId !== videoCache.scanId) return;

    if (msg && msg.type === 'progress') {
      try {
        win?.webContents?.send(EVENT.VIDEO_SCAN_STATUS, {
          scanning: true,
          progress: {
            foldersDone: msg.foldersDone || 0,
            foldersTotal: msg.foldersTotal || 0,
            currentFolder: msg.currentFolder || '',
          },
        });
      } catch {}
      return;
    }

    if (msg && msg.type === 'done') {
      const idx = msg.idx || { roots: [], shows: [], episodes: [] };
      videoCache.idx = {
        roots: Array.isArray(idx.roots) ? idx.roots : [],
        shows: Array.isArray(idx.shows) ? idx.shows : [],
        episodes: Array.isArray(idx.episodes) ? idx.episodes : [],
      };
      emitVideoUpdated();
      finish(true);
    }
  });

  w.on('error', (err) => {
    if (myScanId !== videoCache.scanId) return;
    videoCache.error = String(err?.message || err);
    emitVideoUpdated();
    finish(false);
  });

  w.on('exit', (code) => {
    if (myScanId !== videoCache.scanId) return;
    if (code !== 0) {
      videoCache.error = `Video scan worker exited ${code}`;
      emitVideoUpdated();
      finish(false);
    }
  });
}
function readLibraryConfig() {
  const p = dataPath('library_state.json');
  const state = readJSONSafe(p, { seriesFolders: [], rootFolders: [], ignoredSeries: [], scanIgnore: [], videoFolders: [], videoHiddenShowIds: [] });

  // Migration: older builds used { folders: [] }.
  if (state.folders && !state.seriesFolders) state.seriesFolders = state.folders;
  delete state.folders;

  state.seriesFolders = Array.isArray(state.seriesFolders) ? state.seriesFolders : [];
  state.rootFolders = Array.isArray(state.rootFolders) ? state.rootFolders : [];
  state.ignoredSeries = Array.isArray(state.ignoredSeries) ? state.ignoredSeries : [];
  state.scanIgnore = Array.isArray(state.scanIgnore) ? state.scanIgnore : [];
  state.videoFolders = Array.isArray(state.videoFolders) ? state.videoFolders : [];
  state.videoHiddenShowIds = Array.isArray(state.videoHiddenShowIds) ? state.videoHiddenShowIds : [];
  return state;
}

function writeLibraryConfig(state) {
  // INTENT: Keep this file small and stable. Heavy index lives in library_index.json.
  const p = dataPath('library_state.json');
  writeJSONSafe(p, {
    seriesFolders: Array.isArray(state.seriesFolders) ? state.seriesFolders : [],
    rootFolders: Array.isArray(state.rootFolders) ? state.rootFolders : [],
    ignoredSeries: Array.isArray(state.ignoredSeries) ? state.ignoredSeries : [],
    scanIgnore: Array.isArray(state.scanIgnore) ? state.scanIgnore : [],
    videoFolders: Array.isArray(state.videoFolders) ? state.videoFolders : [],
    videoHiddenShowIds: Array.isArray(state.videoHiddenShowIds) ? state.videoHiddenShowIds : [],
  });
}

function computeEffectiveFromConfig(state) {
  const autoSeriesFolders = computeAutoSeries(state.rootFolders, state.ignoredSeries, state.scanIgnore);
  const effectiveSeriesFolders = uniq([...(state.seriesFolders || []), ...autoSeriesFolders]);
  return { autoSeriesFolders, effectiveSeriesFolders };
}

function ensureLibraryIndexLoaded() {
  if (libraryCache.idxLoaded) return;
  libraryCache.idxLoaded = true;

  const idxPath = dataPath('library_index.json');

  // Prefer dedicated index cache.
  const idx = readJSONSafe(idxPath, null);
  if (idx && Array.isArray(idx.series) && Array.isArray(idx.books)) {
    libraryCache.idx = { series: idx.series, books: idx.books };
    return;
  }

  // Migration: older builds persisted heavy index inside library_state.json.
  const legacy = readJSONSafe(dataPath('library_state.json'), null);
  if (legacy && Array.isArray(legacy.series) && Array.isArray(legacy.books)) {
    libraryCache.idx = { series: legacy.series, books: legacy.books };

    // One-time migration: persist index separately and shrink library_state.json to config-only.
    try {
      if (!fs.existsSync(idxPath)) {
        writeJSONSafe(idxPath, libraryCache.idx);
      }
      writeLibraryConfig({
        seriesFolders: Array.isArray(legacy.seriesFolders) ? legacy.seriesFolders : [],
        rootFolders: Array.isArray(legacy.rootFolders) ? legacy.rootFolders : [],
        ignoredSeries: Array.isArray(legacy.ignoredSeries) ? legacy.ignoredSeries : [],
        scanIgnore: Array.isArray(legacy.scanIgnore) ? legacy.scanIgnore : [],
      });
    } catch {}
  }
}

function makeLibraryStateSnapshot(state) {
  const s = state || readLibraryConfig();
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

function emitLibraryUpdated() {
  try { win?.webContents?.send(EVENT.LIBRARY_UPDATED, makeLibraryStateSnapshot()); } catch {}
}

function pruneProgressByRemovedBookIds(removedIds) {
  // INTENT: Only delete progress entries for books that were removed from the library index.
  // This preserves Open File (external) progress that is not part of the library.
  try {
    if (!removedIds || !removedIds.length) return;
    const all = getProgressMem();
    let changed = false;
    for (const id of removedIds) {
      if (all && all[id]) { delete all[id]; changed = true; }
    }
    if (changed) writeJSONDebounced(dataPath('progress.json'), all, 50);
  } catch {}
}

// BUILD27_SCAN_IGNORE_DEFAULTS
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

function startLibraryScan(effectiveSeriesFolders, opts = {}) {
  ensureLibraryIndexLoaded();

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
    win?.webContents?.send(EVENT.LIBRARY_SCAN_STATUS, {
      scanning: true,
      progress: { seriesDone: 0, seriesTotal: folders.length || 0, currentSeries: '' },
    });
  } catch {}

  const indexPath = dataPath('library_index.json');

  // BUILD27: load ignore patterns from config and pass to worker
  const cfg = readLibraryConfig();
  const scanIgnore = Array.isArray(cfg.scanIgnore) ? cfg.scanIgnore : [];

  // BUILD 16 compat: use file URL for Worker so packaging remains reliable.
  const workerURL = pathToFileURL(path.join(APP_ROOT, 'library_scan_worker.js'));

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
      // Keep scanning indicator effectively “on” for chained scans.
      startLibraryScan(queued, { force: true });
      return;
    }

    try { win?.webContents?.send(EVENT.LIBRARY_SCAN_STATUS, { scanning: false, progress: null }); } catch {}
  };

  w.on('message', (msg) => {
    if (myScanId !== libraryCache.scanId) return;

    if (msg && msg.type === 'progress') {
      try {
        win?.webContents?.send(EVENT.LIBRARY_SCAN_STATUS, {
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

        pruneProgressByRemovedBookIds(removed);
      }

      emitLibraryUpdated();
      finish(true);
    }
  });

  w.on('error', (err) => {
    if (myScanId !== libraryCache.scanId) return;
    libraryCache.error = String(err?.message || err);
    emitLibraryUpdated();
    finish(false);
  });

  w.on('exit', (code) => {
    if (myScanId !== libraryCache.scanId) return;
    if (code !== 0) {
      libraryCache.error = `Library scan worker exited ${code}`;
      emitLibraryUpdated();
      finish(false);
    }
  });
}

let videoShellWin = null; // dedicated video player shell window (controller UI)

// BUILD26_SINGLE_INSTANCE_OPENWITH (Build 26)
// INTENT: Support OS "Open with Tankoban" and argv-based open on first launch,
// while enforcing single-instance behavior (focus existing window + forward opens).
let pendingOpenPaths = [];
let pendingOpenSource = '';

function normalizeOpenArg(a) {
  let s = String(a || '').trim();
  if (!s) return '';
  // Strip surrounding quotes (Windows shells sometimes include them).
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
  // Convert file:// URLs to paths if present.
  if (s.startsWith('file://')) {
    try { s = fileURLToPath(s); } catch {}
  }
  return s;
}

function isComicArchivePath(p) {
  const s = String(p || '');
  return /\.(cbz|cbr)$/i.test(s);
}

function getPrimaryWindow() {
  try {
    const w = BrowserWindow.getFocusedWindow();
    if (w && !w.isDestroyed()) return w;
  } catch {}
  try {
    for (const w of windows) {
      if (w && !w.isDestroyed()) return w;
    }
  } catch {}
  return win;
}

function extractComicPathsFromArgv(argv) {
  const out = [];
  const seen = new Set();
  for (const raw of (Array.isArray(argv) ? argv : [])) {
    const s0 = normalizeOpenArg(raw);
    if (!s0) continue;
    if (s0.startsWith('-')) continue; // ignore flags
    if (!isComicArchivePath(s0)) continue;

    const st = statSafe(s0);
    if (!st || !st.isFile()) continue;

    if (seen.has(s0)) continue;
    seen.add(s0);
    out.push(s0);
  }
  return out;
}

function enqueueOpenPaths(paths, source) {
  const list = Array.isArray(paths) ? paths.map(normalizeOpenArg).filter(Boolean) : [];
  const valid = [];
  for (const p of list) {
    if (!isComicArchivePath(p)) continue;
    const st = statSafe(p);
    if (!st || !st.isFile()) continue;
    valid.push(p);
  }
  if (!valid.length) return;

  pendingOpenSource = String(source || '') || pendingOpenSource || 'unknown';
  pendingOpenPaths.push(...valid);

  const w = getPrimaryWindow();
  if (w && w.__tankobanDidFinishLoad) flushPendingOpenPaths(w);
}

function flushPendingOpenPaths(targetWindow) {
  const w = targetWindow;
  if (!w || w.isDestroyed()) return;
  if (!w.__tankobanDidFinishLoad) return;
  if (!pendingOpenPaths.length) return;

  const paths = pendingOpenPaths.slice(0);
  pendingOpenPaths = [];

  const source = pendingOpenSource || 'unknown';
  pendingOpenSource = '';

  try {
    w.webContents.send(EVENT.APP_OPEN_FILES, { paths, source });
  } catch {}
}

// BUILD21_MULTI_WINDOW (Build 21)
// INTENT: Allow multiple independent reader windows without changing the renderer architecture.
// We keep `win` only as a last-resort fallback; all IPC should prefer the calling window.

function winFromEvt(evt) {
  // Prefer the calling window so dialogs/fullscreen affect the correct instance.
  try {
    const w = BrowserWindow.fromWebContents(evt?.sender);
    if (w && !w.isDestroyed()) return w;
  } catch {}
  try {
    const w2 = BrowserWindow.getFocusedWindow();
    if (w2 && !w2.isDestroyed()) return w2;
  } catch {}
  return win;
}

function createWindow(opts = {}) {
  const openBookId = (opts && opts.openBookId) ? String(opts.openBookId) : '';

  const w = new BrowserWindow({
    width: 1200,
    height: 800,
    // FIND_THIS:TANKOBAN_RENAME_COSMETIC (Tankoban Build 1A)
    title: 'Tankoban',
    backgroundColor: '#000000',
    icon: path.join(APP_ROOT, 'build', 'icon.png'),
    // Build 36: restore standard window chrome (Windows title bar buttons).
    frame: true,
    fullscreen: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(APP_ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // CRITICAL BUGFIX (Build 84): disabling sandbox keeps preload module loading intact.
      sandbox: false,
    },
  });

  windows.add(w);
  win = w;

// BUILD32_CBZ_WINDOW_OWNER (Build 32)
  const cbzOwnerId = w.webContents.id;

  w.on('focus', () => { win = w; });
  w.on('closed', () => {
    try { windows.delete(w); } catch {}

    // BUILD32_CBZ_WINDOW_CLEANUP (Build 32)
    // Best-effort: close any CBZ sessions opened by this renderer window.
    (async () => {
      try { await archivesDomain.cbzCloseAllForOwner(cbzOwnerId); } catch {}
    })();

    (async () => {
      // BUILD31_LIBMPV_WINDOW_CLEANUP (TankobanPlus Build 31)
      // Best-effort: close any embedded libmpv players created by this renderer window.
    })();  });

  w.setMenuBarVisibility(false);
  w.setMenu(null);
  // Allow exiting fullscreen even with menu removed (F11)
  w.webContents.on('before-input-event', (event, input) => {
    if (input && input.key === 'F11') {
      event.preventDefault();
      w.setFullScreen(!w.isFullScreen());
    }
  });

  // Build 31: Developer tools shortcuts (F12 / Ctrl+Shift+I)
  __tankobanBindDevtoolsShortcuts(w);

  // Optional debug mode for renderer diagnostics (default-off).
  // Enable by launching with: MANGA_SCROLLER_DEBUG=1
  const debug = String(process.env.MANGA_SCROLLER_DEBUG || '') === '1';

  // BUILD21_MULTI_WINDOW_STARTUP (Build 21)
  // INTENT: Let a new window boot directly into a volume by passing openBookId via query string.
  const query = {};
  if (debug) query.debug = '1';
  if (openBookId) query.openBookId = openBookId;

  w.__tankobanDidFinishLoad = false;

  w.loadFile(path.join(APP_ROOT, 'src', 'index.html'), Object.keys(query).length ? { query } : undefined);

  // Only send open-with events once the renderer has loaded listeners.
  w.webContents.on('did-finish-load', () => {
    w.__tankobanDidFinishLoad = true;
    flushPendingOpenPaths(w);
  });

  w.once('ready-to-show', () => {
    // Start maximized (not fullscreen) so Windows chrome is visible.
    try { w.maximize(); } catch {}
    w.show();
  });

  return w;
}


function createVideoShellWindow() {
  const debug = String(process.env.MANGA_SCROLLER_DEBUG || '') === '1';
  const query = { videoShell: '1' };
  if (debug) query.debug = '1';

  const w = new BrowserWindow({
    width: 900,
    height: 260,
    title: 'Tankoban Player',
    backgroundColor: '#000000',
    icon: path.join(APP_ROOT, 'build', 'icon.png'),
    frame: true,
    fullscreen: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(APP_ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // CRITICAL BUGFIX (Build 84): disabling sandbox keeps preload module loading intact.
      sandbox: false,
    },
  });

  windows.add(w);
  videoShellWin = w;
  w.__tankobanDidFinishLoad = false;
  w.__videoShellPendingPlay = null;

  w.on('focus', () => { win = w; });
  w.on('closed', () => {
    try { windows.delete(w); } catch {}
    try { if (videoShellWin === w) videoShellWin = null; } catch {}
  });

  w.loadFile(path.join(APP_ROOT, 'src', 'index.html'), { query });

  w.webContents.on('did-finish-load', () => {
    w.__tankobanDidFinishLoad = true;
    try {
      if (w.__videoShellPendingPlay) {
        w.webContents.send(EVENT.VIDEO_SHELL_PLAY, w.__videoShellPendingPlay);
        w.__videoShellPendingPlay = null;
      }
    } catch {}
  });

  w.once('ready-to-show', () => {
    try { w.show(); } catch {}
    try { w.focus(); } catch {}
  });

  return w;
}

// Phase 4B: Add window creation functions to ctx for window domain
ctx.createWindow = createWindow;
ctx.createVideoShellWindow = createVideoShellWindow;
ctx.windows = windows; // Add windows set for getPrimaryWindow
ctx.getWin = () => win; // Live win getter for domains that need it

// BUILD26_SINGLE_INSTANCE_OPENWITH (Build 26)
// ========== IPC: Registry Modules (Nirvana 10) ==========
// This file owns IPC bootstrap + ctx creation.
// Individual ipcMain.handle registrations are grouped in ./register/*.js for readability.
const registerModules = [
  require('./register/window'),
  require('./register/shell'),
  require('./register/library'),
  require('./register/video'),
  require('./register/video_posters'),
  require('./register/page_thumbnails'),
  require('./register/archives'),
  require('./register/export'),
  require('./register/progress'),
  require('./register/video_progress'),
  require('./register/video_settings'),
  require('./register/video_ui_state'),
  require('./register/player_core'),
  require('./register/series_settings'),
  require('./register/health_check'),
];

for (const register of registerModules) {
  try {
    register({ ipcMain, CHANNEL, ctx, domains: {
    archivesDomain,
    clipboardDomain,
    comicDomain,
    exportDomain,
    filesDomain,
    libraryDomain,
    playerCoreDomain,
    shellDomain,
    thumbsDomain,
    videoDomain,
    windowDomain,
    progress,
    videoProgress,
    videoSettings,
    videoUi,
    seriesSettings,
    }});
  } catch (e) {
    // Keep IPC partially functional even if a single register module fails.
    try { console.error('[ipc] register module failed:', e && e.message ? e.message : e); } catch {}
  }
}

}; // end registerIpc
