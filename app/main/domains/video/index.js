/*
TankobanPlus — Video Domain (Build 78C, Phase 4 Checkpoint C)

Handles video library management:
- Video state and index loading
- Background scanning with worker threads
- Video folder management
- Show hiding/filtering
- Episode loading

Extracted from Build 78B IPC registry with ZERO behavior changes.
*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const { dialog, BrowserWindow } = require('electron');
const { pathToFileURL } = require('url');

// DIAG: Temporary diagnostic logger for debugging scan/add issues
const __diagLog = (() => {
  const { app } = require('electron');
  let logPath = null;
  return function(msg) {
    try {
      if (!logPath) logPath = path.join(app.getPath('userData'), 'diag_video.log');
      const ts = new Date().toISOString();
      fs.appendFileSync(logPath, `[${ts}] ${msg}\n`);
    } catch {}
  };
})();

const { spawn } = require('child_process');

// ========== AUTO POSTER GENERATION (Build 110 Nirvana) ==========
/*
Goal: If a show has NO poster image in its folder AND no userData poster already saved,
auto-generate a poster from inside the first episode after a scan completes.

- Uses bundled mpv.exe on Windows when available (resources/mpv/windows/mpv.exe).
- Generates into userData/video_posters/<showId>.jpg
- Updates show.thumbPath in the in-memory index so the UI can show it immediately
  (even if the renderer poster cache has a stored null).

IMPORTANT: This is best-effort; failures should never break scanning.
*/

const AUTO_POSTER_ENABLED = true;
const AUTO_POSTER_MAX_PER_SCAN = 8; // safety cap to avoid extremely long post-scan work

function __safeVideoPosterId(showId) {
  try { return String(showId || 'unknown').replace(/[^a-z0-9_-]/gi, '_'); } catch { return 'unknown'; }
}

function __videoPosterPathJpg(ctx, showId) {
  const safeId = __safeVideoPosterId(showId);
  const dir = ctx.storage.dataPath('video_posters');
  return { dir, jpg: path.join(dir, `${safeId}.jpg`), png: path.join(dir, `${safeId}.png`) };
}

function __fileExistsNonEmpty(p) {
  try {
    if (!p || !fs.existsSync(p)) return false;
    const st = fs.statSync(p);
    return !!(st && st.isFile && st.isFile() && Number(st.size || 0) > 0);
  } catch {
    return false;
  }
}

function __hasUserPoster(ctx, showId) {
  try {
    const p = __videoPosterPathJpg(ctx, showId);
    return __fileExistsNonEmpty(p.jpg) || __fileExistsNonEmpty(p.png);
  } catch { return false; }
}

function __existingUserPosterPath(ctx, showId) {
  try {
    const p = __videoPosterPathJpg(ctx, showId);
    if (__fileExistsNonEmpty(p.jpg)) return p.jpg;
    if (__fileExistsNonEmpty(p.png)) return p.png;
    return null;
  } catch { return null; }
}

function __resolveBundledMpvExe(ctx) {
  try {
    if (process.platform !== 'win32') return null;

    // Packaged locations
    try {
      const { app } = require('electron');
      if (app && app.isPackaged) {
        const c1 = path.join(process.resourcesPath, 'mpv', 'windows', 'mpv.exe');
        if (fs.existsSync(c1)) return c1;
        const c2 = path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'mpv', 'windows', 'mpv.exe');
        if (fs.existsSync(c2)) return c2;
      }
    } catch {}

    // Development / unpacked build: relative to APP_ROOT
    try {
      const c3 = path.join(ctx.APP_ROOT, 'resources', 'mpv', 'windows', 'mpv.exe');
      if (fs.existsSync(c3)) return c3;
    } catch {}

    return null;
  } catch { return null; }
}

function __spawnMpvGrabFrame(mpvExe, episodePath, outDir, outBaseName) {
  return new Promise((resolve) => {
    try {
      fs.mkdirSync(outDir, { recursive: true });
    } catch {}

    // mpv image output:
    // - use image video output for a single frame
    // - mute audio, no terminal, quiet
    // - start a few seconds in to avoid black frames
    const args = [
      '--no-config',
      '--no-terminal',
      '--msg-level=all=no',
      '--ao=null',
      '--vo=image',
      '--frames=1',
      '--start=7',
      '--vo-image-format=jpg',
      `--vo-image-outdir=${outDir}`,
      episodePath,
    ];

    let done = false;
    const finish = (ok, producedPath) => {
      if (done) return;
      done = true;
      resolve({ ok, producedPath: producedPath || null });
    };

    const p = spawn(mpvExe, args, { windowsHide: true });
    p.on('error', () => finish(false, null));
    p.on('exit', (code) => {
      if (code !== 0) return finish(false, null);

      // mpv may write the exact filename or a numbered one; find best candidate.
      try {
        const exact = path.join(outDir, `${outBaseName}.jpg`);
        if (fs.existsSync(exact)) return finish(true, exact);

        const files = fs.readdirSync(outDir).filter(f => String(f).toLowerCase().endsWith('.jpg'));
        if (!files.length) return finish(false, null);

        // choose the newest jpg
        let best = null;
        let bestM = -1;
        for (const f of files) {
          const full = path.join(outDir, f);
          const st = __statSafe(full);
          const mt = st ? Number(st.mtimeMs || 0) : 0;
          if (mt > bestM) { bestM = mt; best = full; }
        }
        return finish(true, best || null);
      } catch {
        return finish(false, null);
      }
    });

    // hard timeout safeguard (slow spinning disks and high-bitrate files can take longer)
    setTimeout(() => finish(false, null), 30000);
  });
}

async function __autoGeneratePosterForShow(ctx, show, episodePath) {
  try {
    const showId = String(show?.id || '');
    if (!showId) return null;

    const p = __videoPosterPathJpg(ctx, showId);
    if (__fileExistsNonEmpty(p.jpg)) return p.jpg;
    // Cleanup stale zero-byte artifacts from older failed runs.
    try {
      if (fs.existsSync(p.jpg) && !__fileExistsNonEmpty(p.jpg)) fs.unlinkSync(p.jpg);
    } catch {}
    try {
      if (fs.existsSync(p.png) && !__fileExistsNonEmpty(p.png)) fs.unlinkSync(p.png);
    } catch {}

    const mpvExe = __resolveBundledMpvExe(ctx);
    if (!mpvExe) return null;

    const tmpDir = path.join(p.dir, '_autogen_tmp');
    const outBase = `${__safeVideoPosterId(showId)}_autogen`;

    const r = await __spawnMpvGrabFrame(mpvExe, episodePath, tmpDir, outBase);
    if (!r.ok || !r.producedPath) return null;

    try { fs.mkdirSync(p.dir, { recursive: true }); } catch {}
    try {
      fs.copyFileSync(r.producedPath, p.jpg);
      try { if (fs.existsSync(p.png)) fs.unlinkSync(p.png); } catch {}
    } catch {
      return null;
    }

    // best-effort cleanup tmp dir (leave if busy)
    try {
      const files = fs.readdirSync(tmpDir);
      for (const f of files) {
        try { fs.unlinkSync(path.join(tmpDir, f)); } catch {}
      }
    } catch {}

    return p.jpg;
  } catch {
    return null;
  }
}

async function __autoGenerateMissingShowPosters(ctx, idx) {
  try {
    if (!AUTO_POSTER_ENABLED) return { generated: 0, candidates: 0 };
    const shows = Array.isArray(idx?.shows) ? idx.shows : [];
    const eps = Array.isArray(idx?.episodes) ? idx.episodes : [];

    let generated = 0;
    let candidates = 0;

    for (const show of shows) {
      if (generated >= AUTO_POSTER_MAX_PER_SCAN) break;

      // Skip only when show has a usable on-disk folder poster.
      if (show && show.thumbPath && __fileExistsNonEmpty(String(show.thumbPath || ''))) continue;
      if (__hasUserPoster(ctx, show?.id)) continue;

      // Find first valid episode for this show
      const sid = String(show?.id || '');
      if (!sid) continue;

      let epPath = null;
      for (const ep of eps) {
        if (!ep || String(ep.showId || '') !== sid) continue;
        const p = ep.path ? String(ep.path) : '';
        if (!p) continue;
        const st = __statSafe(p);
        if (st && st.isFile && st.isFile() && st.size > 0) { epPath = p; break; }
      }
      if (!epPath) continue;
      candidates += 1;

      const posterPath = await __autoGeneratePosterForShow(ctx, show, epPath);
      if (posterPath) {
        try { show.thumbPath = posterPath; } catch {}
        generated += 1;
      }
    }

    return { generated, candidates };
  } catch {
    return { generated: 0, candidates: 0 };
  }
}


// ========== MODULE STATE ==========

/**
 * Video library cache (Tankoban Plus Build 3.2)
 * Lifted from Build 78B index.js lines 343-354.
 */
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

// BUILD 88 FIX 2.4: Cache sorted progress keys for continue watching
let progressSortCache = {
  lastProgHash: '',
  sortedKeys: []
};

// BUILD 104d: Prune orphaned video progress entries (conservative + backup + retention).
const VIDEO_PROGRESS_PRUNE_RETENTION_DAYS = 90;

function __collectLiveEpisodeIds(idx){
  const live = new Set();
  const eps = Array.isArray(idx && idx.episodes) ? idx.episodes : [];
  for (const ep of eps) {
    const id = String(ep && ep.id || '');
    if (id) live.add(id);
    const aliases = Array.isArray(ep && ep.aliasIds) ? ep.aliasIds : [];
    for (const a of aliases) {
      const aid = String(a || '');
      if (aid) live.add(aid);
    }
  }
  return live;
}

function __broadcastVideoProgressCleared(ctx, videoId){
  try {
    const payload = { videoId: String(videoId), progress: null };
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w || w.isDestroyed()) continue;
      w.webContents.send(ctx.EVENT.VIDEO_PROGRESS_UPDATED, payload);
    }
  } catch {}
}

function __pruneOrphanedVideoProgress(ctx, idx){
  try {
    const liveIds = __collectLiveEpisodeIds(idx);
    // If we don't have an index, don't guess.
    if (!liveIds || liveIds.size === 0) return { ok: true, removed: 0 };

    const progressPath = ctx.storage.dataPath('video_progress.json');
    const backupPath = ctx.storage.dataPath('video_progress.backup.json');

    let prog = {};
    try { prog = ctx.storage.readJSON(progressPath, {}) || {}; } catch { prog = {}; }

    const keys = Object.keys(prog || {});
    if (!keys.length) return { ok: true, removed: 0 };

    const now = Date.now();
    const retentionMs = VIDEO_PROGRESS_PRUNE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const toDelete = [];

    for (const k of keys) {
      const id = String(k || '');
      if (!id) continue;
      if (liveIds.has(id)) continue;
      const rec = prog[id];
      const updatedAt = Number(rec && rec.updatedAt);
      // Conservative: only prune if we can confidently age it.
      if (!Number.isFinite(updatedAt) || updatedAt <= 0) continue;
      if ((now - updatedAt) < retentionMs) continue;
      toDelete.push(id);
    }

    if (!toDelete.length) return { ok: true, removed: 0 };

    // One-time backup (do not overwrite).
    try {
      if (!fs.existsSync(backupPath) && fs.existsSync(progressPath)) {
        fs.copyFileSync(progressPath, backupPath);
      }
    } catch {}

    for (const id of toDelete) delete prog[id];
    try { ctx.storage.writeJSON(progressPath, prog); } catch {}

    // Keep renderer state in sync in long-running sessions.
    try {
      for (const id of toDelete) __broadcastVideoProgressCleared(ctx, id);
    } catch {}

    return { ok: true, removed: toDelete.length };
  } catch { return { ok: false, removed: 0 }; }
}

// Reuse ignore defaults from comic scanning
// Lifted from Build 78B index.js lines 454-463.
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

// ========== HELPER FUNCTIONS ==========

// ========== BUILD 93: Added Files + Restore Removed ==========

const ADDED_FILES_ROOT_ID = '__added_files__';
const ADDED_FILES_SHOW_ID = '__added_files_show__';
const ADDED_FILES_ROOT_NAME = 'Added Files';

// Build 95: Single show folders (one show per folder) live under a pseudo-root.
const ADDED_SHOW_FOLDERS_ROOT_ID = '__added_show_folders__';
const ADDED_SHOW_FOLDERS_ROOT_NAME = 'Folders';

function __decodeBase64Url(str){
  try {
    const s = String(str || '');
    if (!s) return '';
    // Node supports 'base64url' in newer versions, but keep a safe fallback.
    try { return Buffer.from(s, 'base64url').toString('utf8'); } catch {}
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return Buffer.from(b64 + pad, 'base64').toString('utf8');
  } catch { return ''; }
}

function __videoIdForPath(filePath, st){
  try {
    const raw = `${String(filePath || '')}::${Number(st?.size || 0)}::${Number(st?.mtimeMs || 0)}`;
    return crypto.createHash('sha1').update(raw).digest('base64url');
  } catch { return ''; }
}

function __folderKeyFor(showId, folderRelPath){
  try {
    const raw = `${String(showId || '')}::${String(folderRelPath || '')}`;
    return crypto.createHash('sha1').update(raw).digest('base64url');
  } catch { return ''; }
}

function __looseShowIdForRoot(rootPath){
  try {
    const raw = `${String(rootPath || '')}::LOOSE_FILES`;
    return crypto.createHash('sha1').update(raw).digest('base64url');
  } catch { return ''; }
}

function __statSafe(fp){
  try { return fs.statSync(fp); } catch { return null; }
}

function __uniqStrings(list){
  const out = [];
  const seen = new Set();
  for (const v of (Array.isArray(list) ? list : [])) {
    const s = String(v || '');
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function __buildAddedFilesEntities(cfg, hiddenSet){
  try {
    const files = __uniqStrings(cfg?.videoFiles);
    if (!files.length) return { root: null, show: null, episodes: [] };

    // If the whole Added Files show is hidden, behave like it's not there.
    if (hiddenSet && hiddenSet.has(ADDED_FILES_SHOW_ID)) return { root: null, show: null, episodes: [] };

    const episodes = [];
    for (const fp of files) {
      const st = __statSafe(fp);
      if (!st || !st.isFile()) continue;
      const id = __videoIdForPath(fp, st);
      if (!id) continue;
      const title = path.basename(fp).replace(/\.(mp4|mkv|avi|mov|webm|m4v|mpg|mpeg|ts)$/i, '');
      const ext = (path.extname(fp).slice(1) || '').toUpperCase();
      const folderRelPath = '';
      const folderKey = __folderKeyFor(ADDED_FILES_SHOW_ID, folderRelPath);
      episodes.push({
        id,
        title,
        rootId: ADDED_FILES_ROOT_ID,
        rootName: ADDED_FILES_ROOT_NAME,
        showId: ADDED_FILES_SHOW_ID,
        showName: ADDED_FILES_ROOT_NAME,
        showRootPath: '',
        folderRelPath,
        folderKey,
        folderId: ADDED_FILES_ROOT_ID,
        folderName: ADDED_FILES_ROOT_NAME,
        path: fp,
        size: st.size,
        mtimeMs: st.mtimeMs,
        ext,
        durationSec: null,
        width: null,
        height: null,
        thumbPath: null,
      });
    }

    if (!episodes.length) return { root: null, show: null, episodes: [] };

    const root = {
      id: ADDED_FILES_ROOT_ID,
      name: ADDED_FILES_ROOT_NAME,
      path: '',
      displayPath: 'Added files',
    };

    const show = {
      id: ADDED_FILES_SHOW_ID,
      rootId: ADDED_FILES_ROOT_ID,
      name: ADDED_FILES_ROOT_NAME,
      path: '',
      displayPath: 'Added files',
      isLoose: true,
      thumbPath: null,
      folders: [],
    };

    return { root, show, episodes };
  } catch {
    return { root: null, show: null, episodes: [] };
  }
}


/**
 * Load video index from disk if not already loaded.
 * BUILD 88 FIX 1.1: Made async to prevent blocking main process startup.
 * BUILD 88 FIX 3.1: Added performance timing.
 * Lifted from Build 78B index.js lines 356-372.
 */
async function ensureVideoIndexLoaded(ctx) {
  if (videoCache.idxLoaded) return;
  videoCache.idxLoaded = true;

  console.time('[PERF] video_index_load');
  const idxPath = ctx.storage.dataPath('video_index.json');
  
  // Async file read to prevent blocking
  let idx = null;
  try {
    const content = await fs.promises.readFile(idxPath, 'utf-8');
    idx = JSON.parse(content);
  } catch {
    idx = null;
  }
  console.timeEnd('[PERF] video_index_load');
  
  if (idx && Array.isArray(idx.roots) && Array.isArray(idx.shows) && Array.isArray(idx.episodes)) {
    videoCache.idx = { roots: idx.roots, shows: idx.shows, episodes: idx.episodes };
    try { __pruneOrphanedVideoProgress(ctx, videoCache.idx); } catch {}
    return;
  }

  // Legacy (Build 1/2): { folders, videos }
  if (idx && Array.isArray(idx.folders) && Array.isArray(idx.videos)) {
    // Do not try to "fix" the old model here; Build 3.2 worker will rebuild on next scan.
    videoCache.idx = { roots: [], shows: [], episodes: [] };
    try { __pruneOrphanedVideoProgress(ctx, videoCache.idx); } catch {}
  }
}

/**
 * Generate root ID from path.
 * Lifted from Build 78B index.js lines 374-376.
 */
function videoRootIdForPath(p) {
  return Buffer.from(String(p || ''), 'utf8').toString('base64url');
}

/**
 * Normalize display path (forward slashes).
 * Lifted from Build 78B index.js lines 378-380.
 */
function normalizeDisplayPath(p) {
  return String(p || '').replace(/\\/g, '/');
}

/**
 * Build roots array from config.
 * Lifted from Build 78B index.js lines 382-390.
 */
function rootsFromConfig(videoFolders) {
  const folders = Array.isArray(videoFolders) ? videoFolders : [];
  return folders.map((fp) => ({
    id: videoRootIdForPath(fp),
    name: path.basename(fp) || fp,
    path: fp,
    displayPath: normalizeDisplayPath(fp),
  }));
}

/**
 * Get hidden show IDs from config.
 * Lifted from Build 78B index.js lines 392-395.
 */
function videoHiddenShowIdsFromConfig(cfg) {
  const ids = Array.isArray(cfg?.videoHiddenShowIds) ? cfg.videoHiddenShowIds : [];
  return ids.map(x => String(x || '')).filter(Boolean);
}

/**
 * Filter index to remove hidden shows.
 * Lifted from Build 78B index.js lines 397-404.
 */
function filterVideoIdxForHiddenShows(idx, hiddenIds) {
  const set = new Set(Array.isArray(hiddenIds) ? hiddenIds : []);
  if (!set.size) return idx;
  const shows = Array.isArray(idx?.shows) ? idx.shows.filter(s => !set.has(String(s?.id || ''))) : [];
  const episodes = Array.isArray(idx?.episodes) ? idx.episodes.filter(e => !set.has(String(e?.showId || ''))) : [];
  const roots = Array.isArray(idx?.roots) ? idx.roots : [];
  return { roots, shows, episodes };
}

/**
 * Create video state snapshot for renderer.
 * Lifted from Build 78B index.js lines 406-447.
 */
function makeVideoStateSnapshot(ctx, state, opts) {
  const s = state || readLibraryConfig(ctx);
  const folders = Array.isArray(s.videoFolders) ? s.videoFolders : [];
  const showFolders = Array.isArray(s.videoShowFolders) ? s.videoShowFolders : [];
  let rootsCfg = rootsFromConfig(folders);
  if (showFolders.length) {
    rootsCfg = [...(rootsCfg || []), { id: ADDED_SHOW_FOLDERS_ROOT_ID, name: ADDED_SHOW_FOLDERS_ROOT_NAME, path: '', displayPath: '' }];
  }

  const hiddenShowIds = videoHiddenShowIdsFromConfig(s);
  const hiddenSet = new Set((hiddenShowIds || []).map(x => String(x)));

  const idxRoots = Array.isArray(videoCache.idx.roots) ? videoCache.idx.roots : [];
  const idxShows = Array.isArray(videoCache.idx.shows) ? videoCache.idx.shows : [];
  const idxEpisodes = Array.isArray(videoCache.idx.episodes) ? videoCache.idx.episodes : [];

  const filtered = filterVideoIdxForHiddenShows({ roots: idxRoots, shows: idxShows, episodes: idxEpisodes }, hiddenShowIds);

  // IMPORTANT:
  // Treat the configured folders (rootsCfg) as the source of truth for roots.
  // Otherwise Add/Remove folder can look like a no-op when an older index exists.
  // We still use the on-disk index for shows/episodes (filtered), but only for roots
  // that currently exist in config.
  const cfgRootIdSet = new Set((rootsCfg || []).map(r => String(r?.id || '')).filter(Boolean));

  // Build virtual "Added Files" root/show/episodes (Build 93).
  const added = __buildAddedFilesEntities(s, hiddenSet);
  const rootsOut = added.root ? [...rootsCfg, added.root] : rootsCfg;
  if (added.root) cfgRootIdSet.add(ADDED_FILES_ROOT_ID);
  if (showFolders.length) cfgRootIdSet.add(ADDED_SHOW_FOLDERS_ROOT_ID);

  const shows = Array.isArray(filtered.shows) ? filtered.shows.filter(sh => cfgRootIdSet.has(String(sh?.rootId || ''))) : [];
  const episodesAllBase = Array.isArray(filtered.episodes) ? filtered.episodes.filter(ep => cfgRootIdSet.has(String(ep?.rootId || ''))) : [];

  // Merge virtual Added Files show.
  if (added.show) shows.push(added.show);
  const episodesAll = added.episodes && added.episodes.length ? [...episodesAllBase, ...added.episodes] : episodesAllBase;

  // BUILD71: Performance improvement - send episode counts instead of full arrays
  // Calculate episode counts per show for initial state
  const episodeCounts = {};
  if (Array.isArray(episodesAll)) {
    for (const ep of episodesAll) {
      const sid = String(ep?.showId || '');
      if (sid) episodeCounts[sid] = (episodeCounts[sid] || 0) + 1;
    }
  }

  return {
    videoFolders: folders,
    videoShowFolders: showFolders,
    roots: rootsOut,
    shows: (shows || []).map(show => ({
      ...show,
      episodeCount: episodeCounts[String(show?.id || '')] || 0,
    })),
// Build 85: Lite snapshot mode.
// When lite=true, omit the full episodes list (it can be enormous) and only include a small subset
// needed for Continue Watching. Full episode lists are fetched on-demand via getEpisodesForShow/root.
episodes: (() => {
  const o = (opts && typeof opts === 'object') ? opts : {};
  const lite = !!o.lite;

  const all = Array.isArray(episodesAll) ? episodesAll : [];
  if (!lite) return all;

  // Continue Watching requires episode objects for items with saved progress.
  // Pull the most recently updated items from video_progress.json and include only those episodes.
  // BUILD 88 FIX 2.4: Cache sorted keys to avoid re-sorting on every snapshot
  let prog = {};
  try {
    prog = ctx.storage.readJSON(ctx.storage.dataPath('video_progress.json'), {}) || {};
  } catch { prog = {}; }

  const keys = Object.keys(prog || {});
  if (!keys.length) return [];

  // Create hash of progress data to detect changes
  const progHash = keys.length + '_' + keys.slice(0, 10).join('_');
  let sortedKeys;
  
  if (progressSortCache.lastProgHash === progHash) {
    // Use cached sorted keys
    sortedKeys = progressSortCache.sortedKeys;
  } else {
    // Sort by updatedAt (desc) and cache the result
    sortedKeys = keys.slice().sort((a, b) => Number((prog[b] && prog[b].updatedAt) || 0) - Number((prog[a] && prog[a].updatedAt) || 0));
    progressSortCache.lastProgHash = progHash;
    progressSortCache.sortedKeys = sortedKeys;
  }
  
  const cap = Math.max(0, Math.min(60, sortedKeys.length));
  const want = new Set(sortedKeys.slice(0, cap).map(k => String(k)));

  const out = [];
  for (const ep of all) {
    const id = String(ep?.id || '');
    if (id && want.has(id)) out.push(ep);
    if (out.length >= cap) break;
  }
  return out;
})(),
episodeCounts,

    scanning: !!videoCache.scanning,
    lastScanAt: videoCache.lastScanAt || 0,
    error: videoCache.error || null,
  };
}

/**
 * Emit video updated event to renderer.
 * Lifted from Build 78B index.js lines 449-451.
 */
function emitVideoUpdated(ctx) {
  const w = ctx.win;
  __diagLog(`emitVideoUpdated: ctx.win=${w ? 'BrowserWindow' : 'null'}, webContents=${w?.webContents ? 'yes' : 'no'}`);
  try {
    const snap = makeVideoStateSnapshot(ctx, undefined, { lite: true });
    __diagLog(`emitVideoUpdated: snap.roots=${snap?.roots?.length}, snap.shows=${snap?.shows?.length}, snap.episodes=${snap?.episodes?.length}, error=${snap?.error || 'none'}, scanning=${snap?.scanning}`);
    ctx.win?.webContents?.send(ctx.EVENT.VIDEO_UPDATED, snap);
  } catch (e) { __diagLog(`emitVideoUpdated ERROR: ${e.message}`); }
}

/**
 * Read library configuration (shared with library domain).
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
 * Write library configuration (shared with library domain).
 * Lifted from Build 78B index.js lines 596-607.
 */
function writeLibraryConfig(ctx, state) {
  // INTENT: Keep this file small and stable. Heavy index lives in library_index.json.
  const p = ctx.storage.dataPath('library_state.json');
  ctx.storage.writeJSON(p, {
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
 * Start video scan worker.
 * Lifted from Build 78B index.js lines 465-578.
 */
function startVideoScan(ctx, videoFolders, videoShowFolders, opts = {}) {
  ensureVideoIndexLoaded(ctx);

  const folders = Array.isArray(videoFolders) ? videoFolders : [];
  const showFolders = Array.isArray(videoShowFolders) ? videoShowFolders : [];
  const key = JSON.stringify({ folders, showFolders });

  if (videoCache.scanning) {
    videoCache.scanQueuedFolders = folders;
    videoCache.scanQueuedShowFolders = showFolders;
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
    ctx.win?.webContents?.send(ctx.EVENT.VIDEO_SCAN_STATUS, {
      scanning: true,
      phase: 'scan',
      message: 'Rescanning videos...',
      progress: { foldersDone: 0, foldersTotal: (folders.length + showFolders.length) || 0, currentFolder: '' },
    });
  } catch {}

  const indexPath = ctx.storage.dataPath('video_index.json');
  const thumbsDir = ctx.storage.dataPath('video_thumbs');
  const cfg = readLibraryConfig(ctx);
  const scanIgnore = Array.isArray(cfg.scanIgnore) ? cfg.scanIgnore : [];
  const hiddenShowIds = videoHiddenShowIdsFromConfig(cfg);

  const workerURL = pathToFileURL(path.join(ctx.APP_ROOT, 'video_scan_worker.js'));
  const w = new Worker(workerURL, {
    workerData: {
      videoFolders: folders,
      showFolders,
      showFolderRootId: ADDED_SHOW_FOLDERS_ROOT_ID,
      showFolderRootName: ADDED_SHOW_FOLDERS_ROOT_NAME,
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
    const queuedShow = videoCache.scanQueuedShowFolders;
    const queuedKey = videoCache.scanQueuedKey;
    videoCache.scanQueuedFolders = null;
    videoCache.scanQueuedShowFolders = null;
    videoCache.scanQueuedKey = null;

    if (queued && queuedKey && queuedKey !== videoCache.lastScanKey) {
      startVideoScan(ctx, queued, queuedShow, { force: true });
      return;
    }

    try { ctx.win?.webContents?.send(ctx.EVENT.VIDEO_SCAN_STATUS, { scanning: false, progress: null }); } catch {}
  };

  w.on('message', (msg) => {
    if (myScanId !== videoCache.scanId) return;

    if (msg && msg.type === 'progress') {
      try {
        ctx.win?.webContents?.send(ctx.EVENT.VIDEO_SCAN_STATUS, {
          scanning: true,
          phase: 'scan',
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
      (async () => {
        const idx = msg.idx || { roots: [], shows: [], episodes: [] };
        __diagLog(`scan DONE: roots=${idx.roots?.length}, shows=${idx.shows?.length}, episodes=${idx.episodes?.length}`);
        videoCache.idx = {
          roots: Array.isArray(idx.roots) ? idx.roots : [],
          shows: Array.isArray(idx.shows) ? idx.shows : [],
          episodes: Array.isArray(idx.episodes) ? idx.episodes : [],
        };
        try { __pruneOrphanedVideoProgress(ctx, videoCache.idx); } catch {}

        // Build 110: auto-generate posters for shows missing thumbnails (best-effort, post-scan).
        try {
          try {
            ctx.win?.webContents?.send(ctx.EVENT.VIDEO_SCAN_STATUS, {
              scanning: true,
              phase: 'thumbnails',
              message: 'Generating show thumbnails...',
              progress: null,
            });
          } catch {}

          const r = await __autoGenerateMissingShowPosters(ctx, videoCache.idx);
          try {
            ctx.win?.webContents?.send(ctx.EVENT.VIDEO_SCAN_STATUS, {
              scanning: true,
              phase: 'thumbnails',
              completed: true,
              generated: Number(r?.generated || 0),
              candidates: Number(r?.candidates || 0),
              message: `Generated ${Number(r?.generated || 0)} / ${Number(r?.candidates || 0)} show thumbnails`,
              progress: null,
            });
          } catch {}

          if (r && r.generated > 0) {
            try {
              const p = indexPath; // closure from startVideoScan
              await fs.promises.writeFile(p, JSON.stringify(videoCache.idx, null, 2), 'utf-8');
            } catch {}
          }
        } catch {}

        emitVideoUpdated(ctx);
        finish(true);
      })();
      return;
    }
  });

  w.on('error', (err) => {
    __diagLog(`scan WORKER ERROR: ${err?.message || err}\n${err?.stack || ''}`);
    if (myScanId !== videoCache.scanId) return;
    videoCache.error = String(err?.message || err);
    emitVideoUpdated(ctx);
    finish(false);
  });

  w.on('exit', (code) => {
    __diagLog(`scan WORKER EXIT: code=${code}`);
    if (myScanId !== videoCache.scanId) return;
    if (code !== 0) {
      videoCache.error = `Video scan worker exited ${code}`;
      emitVideoUpdated(ctx);
      finish(false);
    } else {
      // code 0 but no 'done' message = silent failure
      __diagLog('scan WORKER EXIT code=0 (no done message received, scan may have failed silently)');
      finish(true);
    }
  });
}

// ========== DOMAIN HANDLERS ==========

/**
 * Get video state.
 * BUILD 88 FIX 1.1: ensureVideoIndexLoaded is now async.
 * Lifted from Build 78B index.js lines 1346-1354.
 */
async function getState(ctx, _evt, opts) {
  __diagLog('getState: ENTERED');
  await ensureVideoIndexLoaded(ctx);
  const state = readLibraryConfig(ctx);
  __diagLog(`getState: videoFolders=${JSON.stringify(state.videoFolders)}, videoShowFolders=${JSON.stringify(state.videoShowFolders)}`);
  const snap = makeVideoStateSnapshot(ctx, state, opts);
  __diagLog(`getState: snap.roots=${snap?.roots?.length}, snap.shows=${snap?.shows?.length}, snap.episodes=${snap?.episodes?.length}`);

  // Refresh once per run (deduped by lastScanKey/lastScanAt).
  startVideoScan(ctx, snap.videoFolders, snap.videoShowFolders);
  return snap;
}

/**
 * Get episodes for a specific show (on-demand loading).
 * BUILD 88 FIX 1.1: ensureVideoIndexLoaded is now async.
 * Lifted from Build 78B index.js lines 1357-1369.
 */
async function getEpisodesForShow(ctx, _evt, showId) {
  await ensureVideoIndexLoaded(ctx);

  // BUILD 93: Added Files pseudo-show
  if (String(showId || '') === ADDED_FILES_SHOW_ID) {
    const cfg = readLibraryConfig(ctx);
    const hidden = new Set(videoHiddenShowIdsFromConfig(cfg).map(x => String(x || '')));
    const added = __buildAddedFilesEntities(cfg, hidden);
    return { ok: true, episodes: Array.isArray(added.episodes) ? added.episodes : [] };
  }
  const hiddenShowIds = videoHiddenShowIdsFromConfig(readLibraryConfig(ctx));
  const hiddenSet = new Set(hiddenShowIds);
  
  const allEpisodes = Array.isArray(videoCache.idx.episodes) ? videoCache.idx.episodes : [];
  const episodes = allEpisodes.filter(ep => {
    const sid = String(ep?.showId || '');
    return sid === String(showId) && !hiddenSet.has(sid);
  });
  
  return { ok: true, episodes };
}

/**
 * Get episodes for a specific root (on-demand loading).
 * BUILD 88 FIX 1.1: ensureVideoIndexLoaded is now async.
 * Lifted from Build 78B index.js lines 1371-1391.
 */
async function getEpisodesForRoot(ctx, _evt, rootId) {
  await ensureVideoIndexLoaded(ctx);

  // BUILD 93: Added Files pseudo-root
  if (String(rootId || '') === ADDED_FILES_ROOT_ID) {
    const cfg = readLibraryConfig(ctx);
    const hidden = new Set(videoHiddenShowIdsFromConfig(cfg).map(x => String(x || '')));
    const added = __buildAddedFilesEntities(cfg, hidden);
    return { ok: true, episodes: Array.isArray(added.episodes) ? added.episodes : [] };
  }
  const hiddenShowIds = videoHiddenShowIdsFromConfig(readLibraryConfig(ctx));
  const hiddenSet = new Set(hiddenShowIds);
  
  // Get all shows for this root
  const allShows = Array.isArray(videoCache.idx.shows) ? videoCache.idx.shows : [];
  const showIds = new Set(
    allShows
      .filter(s => String(s?.rootId || '') === String(rootId))
      .map(s => String(s?.id || ''))
  );
  
  const allEpisodes = Array.isArray(videoCache.idx.episodes) ? videoCache.idx.episodes : [];
  const episodes = allEpisodes.filter(ep => {
    const sid = String(ep?.showId || '');
    return showIds.has(sid) && !hiddenSet.has(sid);
  });
  
  return { ok: true, episodes };
}


/**
 * Get episodes for a list of episode IDs.
 * BUILD 104b: used by Continue Watching so it doesn't depend on lite snapshot episode cap.
 * Returns only episodes that are visible under current config (roots + hidden show filter),
 * plus virtual "Added Files" episodes.
 */
async function getEpisodesByIds(ctx, _evt, ids) {
  await ensureVideoIndexLoaded(ctx);
  const wantArr = Array.isArray(ids) ? ids : [];
  const want = [];
  for (const x of wantArr) {
    const s = String(x || '');
    if (s) want.push(s);
  }
  if (!want.length) return { ok: true, episodes: [] };

  const wantSet = new Set(want);

  // Mirror makeVideoStateSnapshot's visibility rules (roots + hidden shows + Added Files).
  const state = readLibraryConfig(ctx);
  const folders = Array.isArray(state?.videoFolders) ? state.videoFolders : [];
  const showFolders = Array.isArray(state?.videoShowFolders) ? state.videoShowFolders : [];
  let rootsCfg = rootsFromConfig(folders);
  if (showFolders.length) {
    rootsCfg = [...(rootsCfg || []), { id: ADDED_SHOW_FOLDERS_ROOT_ID, name: ADDED_SHOW_FOLDERS_ROOT_NAME, path: '', displayPath: '' }];
  }

  const hiddenShowIds = videoHiddenShowIdsFromConfig(state);
  const hiddenSet = new Set((hiddenShowIds || []).map(x => String(x)));

  const cfgRootIdSet = new Set((rootsCfg || []).map(r => String(r?.id || '')).filter(Boolean));

  // Virtual Added Files root/show/episodes (Build 93).
  const added = __buildAddedFilesEntities(state, hiddenSet);
  if (added?.root) cfgRootIdSet.add(ADDED_FILES_ROOT_ID);
  if (showFolders.length) cfgRootIdSet.add(ADDED_SHOW_FOLDERS_ROOT_ID);

  const outById = new Map();

  // Added Files episodes are small; check them first.
  if (added?.episodes && Array.isArray(added.episodes)) {
    for (const ep of added.episodes) {
      const id = String(ep?.id || '');
      if (!id) continue;
      if (!wantSet.has(id)) continue;
      outById.set(id, ep);
    }
  }

  // Scan index episodes and pick only requested IDs, honoring current visibility rules.
  const allEpisodes = Array.isArray(videoCache.idx.episodes) ? videoCache.idx.episodes : [];
  let remaining = wantSet.size - outById.size;
  if (remaining > 0) {
    for (const ep of allEpisodes) {
      if (!ep) continue;
      const id = String(ep?.id || '');

      const aliases = Array.isArray(ep?.aliasIds) ? ep.aliasIds : [];
      let matched = false;

      if (id && wantSet.has(id) && !outById.has(id)) {
        matched = true;
      } else if (aliases && aliases.length) {
        for (const a of aliases) {
          const aid = String(a || '');
          if (!aid || !wantSet.has(aid) || outById.has(aid)) continue;
          matched = true;
          break;
        }
      }
      if (!matched) continue;

      const rootId = String(ep?.rootId || '');
      if (!rootId || !cfgRootIdSet.has(rootId)) continue;

      const sid = String(ep?.showId || '');
      if (sid && hiddenSet.has(sid)) continue;

      if (id && wantSet.has(id) && !outById.has(id)) {
        outById.set(id, ep);
        remaining -= 1;
      }

      if (remaining > 0 && aliases && aliases.length) {
        for (const a of aliases) {
          const aid = String(a || '');
          if (!aid || !wantSet.has(aid) || outById.has(aid)) continue;
          outById.set(aid, ep);
          remaining -= 1;
          if (remaining <= 0) break;
        }
      }

      if (remaining <= 0) break;
    }
  }

  const episodes = [];
  for (const id of want) {
    const ep = outById.get(id);
    if (ep) episodes.push(ep);
  }
  return { ok: true, episodes };
}

/**
 * Force video rescan.
 * Lifted from Build 78B index.js lines 1393-1398.
 */
async function scan(ctx, _evt, opts) {
  const cfg = readLibraryConfig(ctx);
  // Build 103: Manual rescan should restore any previously removed/hidden shows.
  if (Array.isArray(cfg.videoHiddenShowIds) && cfg.videoHiddenShowIds.length) {
    cfg.videoHiddenShowIds = [];
    writeLibraryConfig(ctx, cfg);
    // Update renderer immediately so previously hidden shows can reappear if already indexed.
    emitVideoUpdated(ctx);
  }
  const folders = Array.isArray(cfg.videoFolders) ? cfg.videoFolders : [];
  const showFolders = Array.isArray(cfg.videoShowFolders) ? cfg.videoShowFolders : [];
  startVideoScan(ctx, folders, showFolders, { force: true });
  return { ok: true };
}

/**
 * Generate auto thumbnail for a single show on-demand.
 * Useful for manual verification and retry when a show has no poster.
 */
async function generateShowThumbnail(ctx, _evt, showId, opts) {
  try {
    await ensureVideoIndexLoaded(ctx);

    const sid = String(showId || '');
    if (!sid) return { ok: false, reason: 'invalid_show_id' };
    const force = !!(opts && opts.force);

    const shows = Array.isArray(videoCache.idx?.shows) ? videoCache.idx.shows : [];
    const show = shows.find(s => String(s?.id || '') === sid);
    if (!show) return { ok: false, reason: 'show_not_found' };

    // Keep default behavior conservative unless caller explicitly forces regeneration.
    if (!force) {
      const folderPoster = String(show?.thumbPath || '');
      if (folderPoster && __fileExistsNonEmpty(folderPoster)) {
        return { ok: true, generated: false, reason: 'folder_poster_exists', path: folderPoster };
      }
      const existing = __existingUserPosterPath(ctx, sid);
      if (existing) {
        return { ok: true, generated: false, reason: 'user_poster_exists', path: existing };
      }
    }

    const eps = Array.isArray(videoCache.idx?.episodes) ? videoCache.idx.episodes : [];
    let epPath = null;
    for (const ep of eps) {
      if (!ep || String(ep.showId || '') !== sid) continue;
      const p = String(ep.path || '');
      if (!p) continue;
      const st = __statSafe(p);
      if (st && st.isFile && st.isFile() && Number(st.size || 0) > 0) { epPath = p; break; }
    }
    if (!epPath) return { ok: true, generated: false, reason: 'no_episode_file' };

    const posterPath = await __autoGeneratePosterForShow(ctx, show, epPath);
    if (!posterPath) return { ok: true, generated: false, reason: 'generation_failed' };

    try { show.thumbPath = posterPath; } catch {}
    emitVideoUpdated(ctx);
    return { ok: true, generated: true, path: posterPath };
  } catch (err) {
    return { ok: false, reason: 'error', error: String(err?.message || err) };
  }
}

/**
 * Cancel running scan.
 * Lifted from Build 78B index.js lines 1400-1417.
 */
async function cancelScan(ctx) {
  if (!videoCache.scanning || !videoCache.scanWorker) return { ok: false };

  const w = videoCache.scanWorker;
  videoCache.scanWorker = null;

  videoCache.scanId++;
  videoCache.scanning = false;
  videoCache.error = null;
  videoCache.scanQueuedFolders = null;
  videoCache.scanQueuedKey = null;

  try { await w.terminate(); } catch {}

  try { ctx.win?.webContents?.send(ctx.EVENT.VIDEO_SCAN_STATUS, { scanning: false, progress: null, canceled: true }); } catch {}
  emitVideoUpdated(ctx);
  return { ok: true };
}

/**
 * Add video folder.
 * BUILD 88 FIX 1.1: ensureVideoIndexLoaded is now async.
 * Lifted from Build 78B index.js lines 1419-1438.
 */
async function addFolder(ctx, evt) {
  __diagLog('addFolder: ENTERED');
  try {
    const { BrowserWindow } = require('electron');
    __diagLog(`addFolder: evt=${!!evt}, evt.sender=${!!evt?.sender}`);
    const w = BrowserWindow.fromWebContents(evt.sender);
    __diagLog(`addFolder: parentWindow=${!!w}`);
    const res = await dialog.showOpenDialog(w, {
      title: 'Add video library folder',
      properties: ['openDirectory'],
    });
    __diagLog(`addFolder: dialog result canceled=${res.canceled}, paths=${JSON.stringify(res.filePaths)}`);
    if (res.canceled || !res.filePaths?.length) return { ok: false };

    const folder = res.filePaths[0];
    const state = readLibraryConfig(ctx);
    state.videoFolders = Array.isArray(state.videoFolders) ? state.videoFolders : [];
    __diagLog(`addFolder: existing videoFolders=${JSON.stringify(state.videoFolders)}`);
    if (!state.videoFolders.includes(folder)) state.videoFolders.unshift(folder);
    __diagLog(`addFolder: updated videoFolders=${JSON.stringify(state.videoFolders)}`);
    writeLibraryConfig(ctx, state);

    await ensureVideoIndexLoaded(ctx);
    const snap = makeVideoStateSnapshot(ctx, state, { lite: true });
    __diagLog(`addFolder: snap.videoFolders=${JSON.stringify(snap.videoFolders)}, snap.videoShowFolders=${JSON.stringify(snap.videoShowFolders)}`);
    __diagLog(`addFolder: snap.roots=${snap?.roots?.length}, snap.shows=${snap?.shows?.length}`);
    startVideoScan(ctx, snap.videoFolders, snap.videoShowFolders, { force: true });

    __diagLog('addFolder: returning ok=true');
    return { ok: true, state: snap };
  } catch (e) {
    __diagLog(`addFolder ERROR: ${e.message}\n${e.stack}`);
    throw e;
  }
}

/**
 * Add a single show folder (one show) into the video library.
 * Build 95: This is distinct from adding a root folder.
 */
async function addShowFolder(ctx, evt) {
  __diagLog('addShowFolder: ENTERED');
  try {
    const { BrowserWindow } = require('electron');
    __diagLog(`addShowFolder: evt=${!!evt}, evt.sender=${!!evt?.sender}`);
    const w = BrowserWindow.fromWebContents(evt.sender);
    __diagLog(`addShowFolder: parentWindow=${!!w}`);
    const res = await dialog.showOpenDialog(w, {
      title: 'Add show folder',
      properties: ['openDirectory'],
    });
    __diagLog(`addShowFolder: dialog result canceled=${res.canceled}, paths=${JSON.stringify(res.filePaths)}`);
    if (res.canceled || !res.filePaths?.length) return { ok: false };

    const folder = res.filePaths[0];
    const state = readLibraryConfig(ctx);
    state.videoShowFolders = Array.isArray(state.videoShowFolders) ? state.videoShowFolders : [];
    __diagLog(`addShowFolder: existing videoShowFolders=${JSON.stringify(state.videoShowFolders)}`);
    if (!state.videoShowFolders.includes(folder)) state.videoShowFolders.unshift(folder);
    writeLibraryConfig(ctx, state);

    await ensureVideoIndexLoaded(ctx);
    const snap = makeVideoStateSnapshot(ctx, state, { lite: true });
    startVideoScan(ctx, snap.videoFolders, snap.videoShowFolders, { force: true });

    return { ok: true, state: snap };
  } catch (e) {
    __diagLog(`addShowFolder ERROR: ${e.message}\n${e.stack}`);
    throw e;
  }
}

/**
 * Remove video folder.
 * BUILD 88 FIX 1.1: ensureVideoIndexLoaded is now async.
 * Lifted from Build 78B index.js lines 1440-1454.
 */
async function removeFolder(ctx, _evt, folderPath) {
  const target = String(folderPath || '');
  if (!target) return { ok: false };

  const state = readLibraryConfig(ctx);
  // BUILD 111 FIX: Also remove from videoShowFolders so show folders can be properly removed.
  state.videoFolders = Array.isArray(state.videoFolders) ? state.videoFolders : [];
  state.videoFolders = state.videoFolders.filter(p => p !== target);
  state.videoShowFolders = Array.isArray(state.videoShowFolders) ? state.videoShowFolders : [];
  state.videoShowFolders = state.videoShowFolders.filter(p => p !== target);
  writeLibraryConfig(ctx, state);

  await ensureVideoIndexLoaded(ctx);
  const snap = makeVideoStateSnapshot(ctx, state, { lite: true });
  startVideoScan(ctx, snap.videoFolders, snap.videoShowFolders, { force: true });

  return { ok: true, state: snap };
}

/**
 * Hide show from video library.
 * BUILD 88 FIX 1.1: ensureVideoIndexLoaded is now async.
 * Lifted from Build 78B index.js lines 1457-1474.
 */
async function hideShow(ctx, _evt, showId) {
  await ensureVideoIndexLoaded(ctx);
  const sid = String(showId || '');
  if (!sid) return { ok: false };

  const cfg = readLibraryConfig(ctx);
  cfg.videoHiddenShowIds = Array.isArray(cfg.videoHiddenShowIds) ? cfg.videoHiddenShowIds : [];
  if (!cfg.videoHiddenShowIds.includes(sid)) cfg.videoHiddenShowIds.push(sid);
  writeLibraryConfig(ctx, cfg);

  // Filter current index immediately so UI updates without a rescan.
  const filtered = filterVideoIdxForHiddenShows(videoCache.idx, cfg.videoHiddenShowIds);
  videoCache.idx = filtered;
  try { ctx.storage.writeJSON(ctx.storage.dataPath('video_index.json'), videoCache.idx); } catch {}

  emitVideoUpdated(ctx);
  return { ok: true, state: makeVideoStateSnapshot(ctx, cfg) };
}

/**
 * Open video file dialog.
 * Lifted from Build 78B index.js lines 1476-1503.
 */
async function openFileDialog(ctx, evt) {
  try {
    const { BrowserWindow } = require('electron');
    const w = BrowserWindow.fromWebContents(evt.sender);
    const res = await dialog.showOpenDialog(w, {
      title: 'Open video file',
      properties: ['openFile'],
      filters: [
        { name: 'Video Files', extensions: ['mp4','mkv','avi','mov','webm','m4v','mpg','mpeg','ts'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (!res || res.canceled || !res.filePaths?.[0]) return { ok: false };

    const fp = res.filePaths[0];
    const st = await fs.promises.stat(fp);
    if (!st || !st.isFile()) return { ok: false };

    // Video id mirrors worker logic: path + size + modified time.
    const raw = `${fp}::${st.size}::${st.mtimeMs}`;
    const id = crypto.createHash('sha1').update(raw).digest('base64url');
    const title = path.basename(fp).replace(/\.(mp4|mkv|avi|mov|webm|m4v|mpg|mpeg|ts)$/i, '');

    return { ok: true, video: { id, title, path: fp, size: st.size, mtimeMs: st.mtimeMs } };
  } catch {
    return { ok: false };
  }
}

/**
 * Open subtitle file dialog.
 * Lifted from Build 78B index.js lines 1504-1634 (truncated view, continuing pattern).
 */
async function openSubtitleFileDialog(ctx, evt) {
  try {
    const { BrowserWindow } = require('electron');
    const w = BrowserWindow.fromWebContents(evt.sender);
    const res = await dialog.showOpenDialog(w, {
      title: 'Load subtitle file',
      properties: ['openFile'],
      filters: [
        { name: 'Subtitle Files', extensions: ['srt','ass','ssa','vtt','sub'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (!res || res.canceled || !res.filePaths?.[0]) return { ok: false };
    return { ok: true, path: res.filePaths[0] };
  } catch {
    return { ok: false };
  }
}



// BUILD 93: Add individual files into library (Added Files)
async function addFiles(ctx, evt) {
  try {
    const { BrowserWindow } = require('electron');
    const w = BrowserWindow.fromWebContents(evt.sender);
    const res = await dialog.showOpenDialog(w, {
      title: 'Add video files',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Video Files', extensions: ['mp4','mkv','avi','mov','webm','m4v','mpg','mpeg','ts'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (!res || res.canceled || !Array.isArray(res.filePaths) || !res.filePaths.length) return { ok: false };

    const cfg = readLibraryConfig(ctx);
    cfg.videoFiles = Array.isArray(cfg.videoFiles) ? cfg.videoFiles : [];
    const set = new Set(cfg.videoFiles.map(x => String(x || '')));
    for (const fp of res.filePaths) {
      const p = String(fp || '');
      if (!p) continue;
      if (!set.has(p)) {
        cfg.videoFiles.unshift(p);
        set.add(p);
      }
    }

    writeLibraryConfig(ctx, cfg);
    const snap = makeVideoStateSnapshot(ctx, cfg, { lite: true });
    emitVideoUpdated(ctx);
    return { ok: true, state: snap };
  } catch {
    return { ok: false };
  }
}

async function removeFile(ctx, _evt, filePath) {
  try {
    const target = String(filePath || '');
    if (!target) return { ok: false };
    const cfg = readLibraryConfig(ctx);
    cfg.videoFiles = Array.isArray(cfg.videoFiles) ? cfg.videoFiles : [];
    cfg.videoFiles = cfg.videoFiles.filter(p => String(p || '') !== target);
    writeLibraryConfig(ctx, cfg);
    const snap = makeVideoStateSnapshot(ctx, cfg, { lite: true });
    emitVideoUpdated(ctx);
    return { ok: true, state: snap };
  } catch {
    return { ok: false };
  }
}

// BUILD 93: Restore removed shows
async function restoreAllHiddenShows(ctx) {
  try {
    const cfg = readLibraryConfig(ctx);
    cfg.videoHiddenShowIds = [];
    writeLibraryConfig(ctx, cfg);
    // Rescan is initiated from renderer (keeps existing scan behavior)
    const snap = makeVideoStateSnapshot(ctx, cfg, { lite: true });
    emitVideoUpdated(ctx);
    return { ok: true, state: snap };
  } catch {
    return { ok: false };
  }
}

async function restoreHiddenShowsForRoot(ctx, _evt, rootId) {
  try {
    const rid = String(rootId || '');
    const cfg = readLibraryConfig(ctx);
    cfg.videoHiddenShowIds = Array.isArray(cfg.videoHiddenShowIds) ? cfg.videoHiddenShowIds : [];

    // Added Files pseudo-root: just unhide the pseudo-show id
    if (rid === ADDED_FILES_ROOT_ID) {
      cfg.videoHiddenShowIds = cfg.videoHiddenShowIds.filter(x => String(x || '') !== ADDED_FILES_SHOW_ID);
      writeLibraryConfig(ctx, cfg);
      const snap = makeVideoStateSnapshot(ctx, cfg, { lite: true });
      emitVideoUpdated(ctx);
      return { ok: true, state: snap };
    }

    // Build 95: Single show folders pseudo-root: unhide shows whose paths match configured show folders.
    if (rid === ADDED_SHOW_FOLDERS_ROOT_ID) {
      const sf = Array.isArray(cfg.videoShowFolders) ? cfg.videoShowFolders : [];
      const setPaths = new Set(sf.map(p => String(p || '')).filter(Boolean));
      cfg.videoHiddenShowIds = cfg.videoHiddenShowIds.filter((sid) => {
        const s = String(sid || '');
        if (!s) return false;
        const showPath = __decodeBase64Url(s);
        return !(showPath && setPaths.has(showPath));
      });
      writeLibraryConfig(ctx, cfg);
      const snap = makeVideoStateSnapshot(ctx, cfg, { lite: true });
      emitVideoUpdated(ctx);
      return { ok: true, state: snap };
    }

    const rootPath = __decodeBase64Url(rid);
    if (!rootPath) {
      return restoreAllHiddenShows(ctx);
    }

    const looseId = __looseShowIdForRoot(rootPath);

    const keep = [];
    for (const sid of cfg.videoHiddenShowIds) {
      const s = String(sid || '');
      if (!s) continue;
      if (s === looseId) continue;
      // Most show ids are base64url of show path. Decode and check if within root folder.
      const showPath = __decodeBase64Url(s);
      if (showPath && (showPath === rootPath || showPath.startsWith(rootPath + path.sep) || showPath.startsWith(rootPath + '/') || showPath.startsWith(rootPath + '\\'))) {
        continue;
      }
      keep.push(s)
    }

    cfg.videoHiddenShowIds = keep;
    writeLibraryConfig(ctx, cfg);
    const snap = makeVideoStateSnapshot(ctx, cfg, { lite: true });
    emitVideoUpdated(ctx);
    return { ok: true, state: snap };
  } catch {
    return { ok: false };
  }
}

module.exports = {
  getEpisodesByIds,
  getState,
  getEpisodesForShow,
  getEpisodesForRoot,
  scan,
  generateShowThumbnail,
  cancelScan,
  addFolder,
  addShowFolder,
  removeFolder,
  hideShow,
  openFileDialog,
  openSubtitleFileDialog,
  addFiles,
  removeFile,
  restoreAllHiddenShows,
  restoreHiddenShowsForRoot,
};
