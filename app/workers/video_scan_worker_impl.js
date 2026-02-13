// Tankoban Plus Build 3.2 — Video scan worker
// INTENT: Build a comic-like two-layer index (shows + episodes) off the main thread.

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { statSafe } = require('./shared/fs_safe');
const { normLower, makeIgnoreConfig, shouldIgnorePath } = require('./shared/ignore');
const { rootIdForPath, showIdForPath, looseShowIdForRoot, videoIdForPath } = require('./shared/ids');




const VIDEO_EXT_RE = /\.(mp4|mkv|avi|mov|webm|m4v|mpg|mpeg|ts)$/i;

const HIDDEN_SHOW_IDS = new Set(
  Array.isArray(workerData?.hiddenShowIds) ? workerData.hiddenShowIds.map(x => String(x || '')).filter(Boolean) : []
);

// BUILD 104c: Preserve progress across rename/move by emitting aliasIds.
// Best-effort: read previous index (if any) and match by a conservative signature (ext+size+mtimeMs+duration).
let __prevSigToIds = null;
const __usedPrevIds = new Set();

function __episodeSigBits(ext, size, mtimeMs, durationSec){
  const e = normLower(ext || '');
  const s = Number(size || 0);
  const m = Math.round(Number(mtimeMs || 0));
  const d = Number(durationSec);
  const dr = (Number.isFinite(d) && d > 0) ? Math.round(d) : 0;
  return `${e}::${s}::${m}::${dr || ''}`;
}

function __buildPrevSigIndex(){
  try {
    const p = workerData && workerData.indexPath;
    if (!p) return null;
    const raw = fs.readFileSync(p, 'utf-8');
    const idx = JSON.parse(raw);
    const eps = Array.isArray(idx && idx.episodes) ? idx.episodes : [];
    const map = new Map();
    for (const ep of eps) {
      const id = String(ep && ep.id || '');
      if (!id) continue;
      const sig = __episodeSigBits(ep && ep.ext, ep && ep.size, ep && ep.mtimeMs, ep && ep.durationSec);
      if (!sig) continue;
      let arr = map.get(sig);
      if (!arr) { arr = []; map.set(sig, arr); }
      arr.push(id);
    }
    return map;
  } catch { return null; }
}

__prevSigToIds = __buildPrevSigIndex();

function __aliasIdsForEpisode(ext, st, meta, newId){
  try {
    if (!__prevSigToIds) return undefined;
    const sig = __episodeSigBits(ext, st && st.size, st && st.mtimeMs, meta && meta.durationSec);
    if (!sig) return undefined;
    const arr = __prevSigToIds.get(sig);
    if (!arr || arr.length !== 1) return undefined;
    const oldId = String(arr[0] || '');
    const nid = String(newId || '');
    if (!oldId || !nid || oldId === nid) return undefined;
    if (__usedPrevIds.has(oldId)) return undefined;
    __usedPrevIds.add(oldId);
    return [oldId];
  } catch { return undefined; }
}


// Prefer poster-like filenames (Kodi-ish conventions)
const POSTER_CANDIDATES = ['poster', 'folder', 'cover', 'fanart'];
const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

function findPosterInFolder(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = entries
      .filter(e => e && e.isFile && e.isFile())
      .map(e => e.name);

    const lower = new Map();
    for (const f of files) lower.set(String(f).toLowerCase(), f);

    for (const base of POSTER_CANDIDATES) {
      for (const ext of IMG_EXTS) {
        const want = `${base}${ext}`;
        const hit = lower.get(want);
        if (hit) {
          const full = path.join(dirPath, hit);
          const st = statSafe(full);
          if (st && st.isFile() && st.size > 0) return full;
        }
      }
    }
  } catch {}
  return null;
}

function listVideoFilesRecursive(rootDir, ignoreCfg) {
  const out = [];
  const stack = [rootDir];
  const seenReal = new Set();

  while (stack.length) {
    const dir = stack.pop();

    // Best-effort cycle protection (symlink/junction loops)
    try {
      const rp = fs.realpathSync(dir);
      const key = String(rp || '').toLowerCase();
      if (key && seenReal.has(key)) continue;
      if (key) seenReal.add(key);
    } catch {}

    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }

    for (const e of entries) {
      const name = e && e.name ? e.name : '';
      const full = path.join(dir, name);

      // Determine type; follow symlinks/junctions via stat if needed.
      let isDir = false;
      let isFile = false;

      try {
        if (e.isDirectory && e.isDirectory()) isDir = true;
        else if (e.isFile && e.isFile()) isFile = true;
        else if (e.isSymbolicLink && e.isSymbolicLink()) {
          const st = statSafe(full);
          if (st && st.isDirectory()) isDir = true;
          else if (st && st.isFile()) isFile = true;
        }
      } catch {}

      if (shouldIgnorePath(full, name, isDir, ignoreCfg)) continue;

      if (isDir) {
        stack.push(full);
      } else if (isFile && VIDEO_EXT_RE.test(name)) {
        out.push(full);
      }
    }
  }
  return out;
}



// VideoIdx (Build 5.1A foundation):
// roots:   [{ id, name, path, displayPath }]
// shows:   [{ id, rootId, name, path, displayPath, isLoose, thumbPath, folders[] }]
// episodes:[{ id, title, rootId, rootName, showId, showName, showRootPath, folderRelPath, folderKey, path, size, mtimeMs, ext, durationSec, width, height, thumbPath, folderId, folderName }]
// NOTE: folderId/folderName are kept for Build 3 compatibility (folderId = rootId).

function normalizeDisplayPath(p) {
  return String(p || '').replace(/\\/g, '/');
}




function folderKeyFor(showId, folderRelPath) {
  const raw = `${String(showId || '')}::${String(folderRelPath || '')}`;
  return crypto.createHash('sha1').update(raw).digest('base64url');
}

// BUILD 88 FIX 1.2: Made async to support yield points
async function buildVideoIndex(videoFolders, showFolders) {
  const roots = [];
  const shows = [];
  const episodes = [];
  const seenShowPaths = new Set();  // Prevent same show scanned in both phases

  const ignoreCfg = makeIgnoreConfig(workerData.ignore || null);
  const inFolders = Array.isArray(videoFolders) ? videoFolders : [];
  const inShowFolders = Array.isArray(showFolders) ? showFolders : [];
  const total = inFolders.length + inShowFolders.length;

  try { parentPort.postMessage({ type: 'progress', foldersDone: 0, foldersTotal: total, currentFolder: '' }); } catch {}

  let done = 0;
  for (const rootPath of inFolders) {
    const rid = rootIdForPath(rootPath);
    const rootName = path.basename(rootPath) || rootPath;
    roots.push({ id: rid, name: rootName, path: rootPath, displayPath: normalizeDisplayPath(rootPath) });

    // 1) Immediate child folders => shows
    let entries = [];
    try { entries = fs.readdirSync(rootPath, { withFileTypes: true }); } catch { entries = []; }

    const childDirs = entries
      .filter(e => e && e.isDirectory && e.isDirectory())
      .map(e => ({ name: e.name, full: path.join(rootPath, e.name) }))
      .filter(d => !shouldIgnorePath(d.full, d.name, true, ignoreCfg));

    for (const d of childDirs) {
      const sp = d.full;
      const sid = showIdForPath(sp);
      if (HIDDEN_SHOW_IDS.has(String(sid))) continue;
      const showName = d.name;

      const posterPath = findPosterInFolder(sp);

      const showObj = {
        id: sid,
        rootId: rid,
        name: showName,
        path: sp,
        displayPath: normalizeDisplayPath(sp),
        isLoose: false,
        thumbPath: posterPath || null,
        folders: [],
      };
      shows.push(showObj);
      seenShowPaths.add(sp);

      // Build folder groups while scanning.
      const folderMap = new Map(); // folderKey -> { folderKey, folderRelPath, episodeCount, watchedCount, inProgressCount, percentComplete }

      const files = listVideoFilesRecursive(sp, ignoreCfg);
      let fileCount = 0;
      for (const fp of files) {
        const st = statSafe(fp);
        if (!st) continue;
        const id = videoIdForPath(fp, st);
        const title = path.basename(fp).replace(VIDEO_EXT_RE, '');

        const ext = (path.extname(fp).slice(1) || '').toUpperCase();
        const meta = {};
        const thumbPath = null;

        // Folder grouping relative to show root.
        let folderRelPath = '';
        try {
          const rel = path.relative(sp, path.dirname(fp));
          if (rel && rel !== '.' && !rel.startsWith('..')) folderRelPath = normalizeDisplayPath(rel);
        } catch {}
        const folderKey = folderKeyFor(sid, folderRelPath);
        const fHit = folderMap.get(folderKey);
        if (fHit) {
          fHit.episodeCount += 1;
        } else {
          folderMap.set(folderKey, {
            folderKey,
            folderRelPath,
            episodeCount: 1,
            watchedCount: 0,
            inProgressCount: 0,
            percentComplete: 0,
          });
        }

        episodes.push({
          id,
          aliasIds: __aliasIdsForEpisode(ext, st, meta, id),
          title,
          rootId: rid,
          rootName,
          showId: sid,
          showName,
          showRootPath: sp,
          folderRelPath,
          folderKey,
          // Compatibility keys for existing Build 3 UI
          folderId: rid,
          folderName: rootName,
          path: fp,
          size: st.size,
          mtimeMs: st.mtimeMs,
          ext,
          durationSec: meta.durationSec ?? null,
          width: meta.width ?? null,
          height: meta.height ?? null,
          thumbPath: thumbPath || null,
        });
        
        // BUILD 88 FIX 1.2: Yield to event loop every 10 files to prevent freeze
        fileCount++;
        if (fileCount % 10 === 0) {
          await new Promise(res => setImmediate(res));
        }
      }

      // Attach folder groups to the show.
      showObj.folders = Array.from(folderMap.values()).sort((a, b) => {
        return String(a.folderRelPath || '').localeCompare(String(b.folderRelPath || ''), undefined, { numeric: true, sensitivity: 'base' });
      });
    }

    // 2) Loose files directly under root (do NOT recurse)
    const looseFiles = entries
      .filter(e => e && e.isFile && e.isFile())
      .map(e => ({ name: e.name, full: path.join(rootPath, e.name) }))
      .filter(f => VIDEO_EXT_RE.test(f.name));

    if (looseFiles.length) {
      const looseId = looseShowIdForRoot(rootPath);
      if (HIDDEN_SHOW_IDS.has(String(looseId))) {
        continue;
      }
      const looseName = 'Loose files';

      const posterPath = findPosterInFolder(rootPath);

      const looseObj = {
        id: looseId,
        rootId: rid,
        name: looseName,
        path: rootPath,
        displayPath: normalizeDisplayPath(rootPath),
        isLoose: true,
        thumbPath: posterPath || null,
        folders: [],
      };
      shows.push(looseObj);

      const folderMap = new Map();
      
      let looseFileCount = 0;
      for (const f of looseFiles) {
        const fp = f.full;
        const st = statSafe(fp);
        if (!st) continue;
        const id = videoIdForPath(fp, st);
        const title = path.basename(fp).replace(VIDEO_EXT_RE, '');

        const ext = (path.extname(fp).slice(1) || '').toUpperCase();
        const meta = {};
        const thumbPath = null;

        const folderRelPath = '';
        const folderKey = folderKeyFor(looseId, folderRelPath);
        const fHit = folderMap.get(folderKey);
        if (fHit) {
          fHit.episodeCount += 1;
        } else {
          folderMap.set(folderKey, {
            folderKey,
            folderRelPath,
            episodeCount: 1,
            watchedCount: 0,
            inProgressCount: 0,
            percentComplete: 0,
          });
        }

        episodes.push({
          id,
          aliasIds: __aliasIdsForEpisode(ext, st, meta, id),
          title,
          rootId: rid,
          rootName,
          showId: looseId,
          showName: looseName,
          showRootPath: rootPath,
          folderRelPath,
          folderKey,
          folderId: rid,
          folderName: rootName,
          path: fp,
          size: st.size,
          mtimeMs: st.mtimeMs,
          ext,
          durationSec: meta.durationSec ?? null,
          width: meta.width ?? null,
          height: meta.height ?? null,
          thumbPath: thumbPath || null,
        });
        
        // BUILD 88 FIX 1.2: Yield to event loop every 10 files to prevent freeze
        looseFileCount++;
        if (looseFileCount % 10 === 0) {
          await new Promise(res => setImmediate(res));
        }
      }

      looseObj.folders = Array.from(folderMap.values());
    }

    done++;
    try {
      parentPort.postMessage({
        type: 'progress',
        foldersDone: done,
        foldersTotal: total,
        currentFolder: rootName,
      });
    } catch {}
  }

  // Build 95: Single show folders (one show) — scanned as shows under a single pseudo-root.
  if (inShowFolders.length) {
    const showRootId = String(workerData?.showFolderRootId || '__added_show_folders__');
    const showRootName = String(workerData?.showFolderRootName || 'Folders');
    roots.push({ id: showRootId, name: showRootName, path: '', displayPath: '' });

    for (const showPath of inShowFolders) {
      const sp = String(showPath || '');
      if (!sp) continue;
      const stDir = statSafe(sp);
      if (!stDir || !stDir.isDirectory()) continue;

      // Dedup: skip if already scanned under a root folder (PHASE 1)
      if (seenShowPaths.has(sp)) { done++; continue; }

      // Dedup: skip if this is a subfolder of an already-scanned show
      let isNested = false;
      for (const other of seenShowPaths) {
        if (sp.startsWith(other + path.sep)) { isNested = true; break; }
      }
      if (isNested) { done++; continue; }

      const sid = showIdForPath(sp);
      if (HIDDEN_SHOW_IDS.has(String(sid))) {
        done++;
        try {
          parentPort.postMessage({ type: 'progress', foldersDone: done, foldersTotal: total, currentFolder: path.basename(sp) || sp });
        } catch {}
        continue;
      }

      const showName = path.basename(sp) || sp;
      const posterPath = findPosterInFolder(sp);
      const showObj = {
        id: sid,
        rootId: showRootId,
        name: showName,
        path: sp,
        displayPath: normalizeDisplayPath(sp),
        isLoose: false,
        thumbPath: posterPath || null,
        folders: [],
      };
      shows.push(showObj);
      seenShowPaths.add(sp);

      const folderMap = new Map();
      const files = listVideoFilesRecursive(sp, ignoreCfg);
      let fileCount = 0;
      for (const fp of files) {
        const st = statSafe(fp);
        if (!st) continue;
        const id = videoIdForPath(fp, st);
        const title = path.basename(fp).replace(VIDEO_EXT_RE, '');

        const ext = (path.extname(fp).slice(1) || '').toUpperCase();
        const meta = {};
        const thumbPath = null;

        let folderRelPath = '';
        try {
          const rel = path.relative(sp, path.dirname(fp));
          if (rel && rel !== '.' && !rel.startsWith('..')) folderRelPath = normalizeDisplayPath(rel);
        } catch {}
        const folderKey = folderKeyFor(sid, folderRelPath);
        const fHit = folderMap.get(folderKey);
        if (fHit) fHit.episodeCount += 1;
        else folderMap.set(folderKey, { folderKey, folderRelPath, episodeCount: 1, watchedCount: 0, inProgressCount: 0, percentComplete: 0 });

        episodes.push({
          id,
          aliasIds: __aliasIdsForEpisode(ext, st, meta, id),
          title,
          rootId: showRootId,
          rootName: showRootName,
          showId: sid,
          showName,
          showRootPath: sp,
          folderRelPath,
          folderKey,
          folderId: showRootId,
          folderName: showRootName,
          path: fp,
          size: st.size,
          mtimeMs: st.mtimeMs,
          ext,
          durationSec: meta.durationSec ?? null,
          width: meta.width ?? null,
          height: meta.height ?? null,
          thumbPath: thumbPath || null,
        });

        fileCount++;
        if (fileCount % 10 === 0) {
          await new Promise(res => setImmediate(res));
        }
      }

      showObj.folders = Array.from(folderMap.values()).sort((a, b) => {
        return String(a.folderRelPath || '').localeCompare(String(b.folderRelPath || ''), undefined, { numeric: true, sensitivity: 'base' });
      });

      done++;
      try {
        parentPort.postMessage({ type: 'progress', foldersDone: done, foldersTotal: total, currentFolder: showName });
      } catch {}
    }
  }

  // Stable ordering:
  roots.sort((a, b) => a.name.localeCompare(b.name));
  shows.sort((a, b) => (a.rootId || '').localeCompare(b.rootId || '') || a.name.localeCompare(b.name));
  episodes.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0) || String(a.title || '').localeCompare(String(b.title || '')));

  return { roots, shows, episodes };
}

// Build 95: avoid top-level await crashes in Worker (wrap in async IIFE).
(async () => {
  try {
    const videoFolders = Array.isArray(workerData?.videoFolders) ? workerData.videoFolders : [];
    const showFolders = Array.isArray(workerData?.showFolders) ? workerData.showFolders : [];
    const idx = await buildVideoIndex(videoFolders, showFolders);

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
    parentPort.postMessage({ type: 'done', idx: { roots: [], shows: [], episodes: [] }, error: String(err?.message || err) });
  }
})();
