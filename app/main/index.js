/*
TankobanPlus — Main Boot (Build 77, Phase 3)

OWNERSHIP: App lifecycle and window creation.
All IPC handlers are in main/ipc/index.js.
*/

module.exports = function boot({ APP_ROOT }) {

const { app, BrowserWindow, Menu, screen, session, globalShortcut } = require('electron');
const { fileURLToPath } = require('url');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Menu / DevTools policy
//
// Goal: fullscreen reading should not be interrupted by the Electron menu bar.
// - In packaged builds: hide the menu bar and disable DevTools by default.
//   (You can re-enable DevTools by launching with TANKOBAN_DEVTOOLS=1.)
// - In dev: allow DevTools, but still keep the menu bar hidden unless explicitly
//   requested (TANKOBAN_SHOW_MENU=1).
//
// Note: we still register keyboard shortcuts for DevTools when allowed.
// ---------------------------------------------------------------------------
const __isPackaged = !!app.isPackaged;
const __allowDevTools = (!__isPackaged) || (process.env.TANKOBAN_DEVTOOLS === '1');
const __showMenu = (process.env.TANKOBAN_SHOW_MENU === '1') && __allowDevTools;


// BUILD110: SharedArrayBuffer reliability (needed for near-zero-copy libmpv canvas playback).
// Chromium requires cross-origin isolation (COOP+COEP) for SharedArrayBuffer.
// Keep this minimal: attach headers for renderer responses and enable the feature gate.
let __didInstallCOIHeaders = false;
function ensureCrossOriginIsolationHeaders() {
  if (__didInstallCOIHeaders) return;
  __didInstallCOIHeaders = true;
  try {
    const ses = session && session.defaultSession;
    if (!ses || !ses.webRequest || typeof ses.webRequest.onHeadersReceived !== 'function') return;
    ses.webRequest.onHeadersReceived((details, callback) => {
      try {
        const h = details.responseHeaders || {};
        h['Cross-Origin-Opener-Policy'] = ['same-origin'];
        h['Cross-Origin-Embedder-Policy'] = ['require-corp'];
        callback({ responseHeaders: h });
      } catch {
        callback({ responseHeaders: details.responseHeaders });
      }
    });
  } catch {}
}

try {
  app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
} catch {}


// FIND_THIS:TANKOBAN_RENAME_PRESERVE_DATA (Tankoban Build 1A)
// IMPORTANT: Preserve existing user data across renames / restructures.
// Build 83 introduced sandboxed renderers which can easily make the app look like a fresh install
// if the userData directory (or preload bridge) changes. We pick the most "data-rich" candidate.
function readJsonSafe(p) {
  try {
    if (!p || !fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function scoreUserDataDir(dir) {
  try {
    if (!dir || !fs.existsSync(dir)) return -1;
  } catch {
    return -1;
  }

  let score = 0;
  const libStatePath = path.join(dir, 'library_state.json');
  const libIndexPath = path.join(dir, 'library_index.json');
  const videoIndexPath = path.join(dir, 'video_index.json');
  const progressPath = path.join(dir, 'progress.json');

  // File existence / size (cheap signal)
  const statScore = (p, w) => {
    try {
      const st = fs.statSync(p);
      if (!st || !st.isFile()) return 0;
      // cap size contribution to avoid weird spikes
      return Math.min(200, Math.floor((st.size || 0) / 1024)) * w;
    } catch {
      return 0;
    }
  };

  score += statScore(libStatePath, 1);
  score += statScore(libIndexPath, 1);
  score += statScore(videoIndexPath, 1);
  score += statScore(progressPath, 0.5);

  const libState = readJsonSafe(libStatePath);
  if (libState && typeof libState === 'object') {
    score += 50;
    const rf = Array.isArray(libState.rootFolders) ? libState.rootFolders.length : 0;
    const sf = Array.isArray(libState.seriesFolders) ? libState.seriesFolders.length : 0;
    const vf = Array.isArray(libState.videoFolders) ? libState.videoFolders.length : 0;
    // Strong signal: non-empty libraries
    if (rf) score += 500 + rf * 10;
    if (sf) score += 500 + sf * 10;
    if (vf) score += 500 + vf * 10;
  }

  const libIndex = readJsonSafe(libIndexPath);
  if (libIndex && typeof libIndex === 'object') {
    score += 25;
    const books = Array.isArray(libIndex.books) ? libIndex.books.length : 0;
    const series = Array.isArray(libIndex.series) ? libIndex.series.length : 0;
    score += Math.min(500, books) * 2;
    score += Math.min(200, series) * 5;
  }

  const videoIndex = readJsonSafe(videoIndexPath);
  if (videoIndex && typeof videoIndex === 'object') {
    score += 25;
    const shows = Array.isArray(videoIndex.shows) ? videoIndex.shows.length : 0;
    const episodes = Array.isArray(videoIndex.episodes) ? videoIndex.episodes.length : 0;
    score += Math.min(200, shows) * 5;
    score += Math.min(500, episodes) * 1;
  }

  return score;
}

function pickUserDataDir() {
  const defaultUserData = app.getPath('userData');
  const baseDir = path.dirname(defaultUserData);

  const candidates = [];
  const add = (p) => {
    if (!p) return;
    if (candidates.includes(p)) return;
    candidates.push(p);
  };

  // Current default (based on package.json name)
  add(defaultUserData);

  // Common historical / user-facing names
  add(path.join(baseDir, 'Tankoban'));
  add(path.join(baseDir, 'Tankoban Pro'));
  add(path.join(baseDir, 'Tankoban Plus'));
  add(path.join(baseDir, 'TankobanPlus'));
  add(path.join(baseDir, 'manga-scroller'));
  add(path.join(baseDir, 'manga_scroller'));
  add(path.join(baseDir, 'Manga-Scroller'));

  let best = defaultUserData;
  let bestScore = scoreUserDataDir(best);
  for (const c of candidates) {
    const s = scoreUserDataDir(c);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

const selectedUserData = pickUserDataDir();
app.setName('Tankoban');
try { app.setPath('userData', selectedUserData); } catch {}

// Phase 2: IPC contract for sending events
const { EVENT } = require('../shared/ipc');

// Window tracking
const windows = new Set();
let win = null;

// Helper: dataPath
function dataPath(file) {
  return path.join(app.getPath('userData'), file || '');
}

// Boot-specific helpers for file opening
function statSafe(p) {
  try { return fs.statSync(p); } catch { return null; }
}

let pendingOpenPaths = [];
let pendingOpenSource = '';

// Player launcher mode: when opened with a video file, skip the library window
// and launch the Qt player directly. Quit when player exits.
let __isPlayerLauncherMode = false;
let __pendingVideoPath = '';

function normalizeOpenArg(a) {
  let s = String(a || '').trim();
  if (!s) return '';
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
  if (s.startsWith('file://')) {
    try { s = fileURLToPath(s); } catch {}
  }
  return s;
}

function isComicArchivePath(p) {
  const s = String(p || '');
  return /\.(cbz|cbr)$/i.test(s);
}

function isVideoPath(p) {
  return /\.(mp4|mkv|avi|mov|m4v|webm|ts|m2ts|wmv|flv|mpeg|mpg|3gp)$/i.test(String(p || ''));
}

function extractVideoPathFromArgv(argv) {
  for (const raw of (Array.isArray(argv) ? argv : [])) {
    const s0 = normalizeOpenArg(raw);
    if (!s0) continue;
    if (s0.startsWith('-')) continue;
    if (!isVideoPath(s0)) continue;
    const st = statSafe(s0);
    if (!st || !st.isFile()) continue;
    return s0;
  }
  return '';
}

function hasShowLibraryFlag(argv) {
  return (Array.isArray(argv) ? argv : []).some(a => String(a).trim() === '--show-library');
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
    if (s0.startsWith('-')) continue;
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

// Window creation
function createWindow(opts = {}) {
  const openBookId = (opts && opts.openBookId) ? String(opts.openBookId) : '';
  // BUILD14: Create borderless fullscreen window (kiosk mode)
  const w = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Tankoban',
    backgroundColor: '#000000',
    icon: path.join(APP_ROOT, 'build', 'icon.png'),
    frame: true,            // Build16: normal window chrome
    fullscreen: false,      // will be set programmatically after creation
    // Hide menu bar (especially important for fullscreen reading on Windows/Linux).
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(APP_ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Preload is split across local CommonJS modules (preload.js -> preload/index.js plus shared/ipc.js).
      // Sandboxed renderers restrict preload's `require()` to built-in modules only, which breaks the bridge.
      // Keep the renderer sandbox disabled so IPC + dialogs + persisted libraries work reliably.
      sandbox: false,
      devTools: __allowDevTools,
    },
  });

  windows.add(w);
  win = w;
  // Keep the menu bar out of the way (Windows/Linux fullscreen UX).
  try {
    if (process.platform !== 'darwin') {
      if (__showMenu) {
        w.setMenuBarVisibility(true);
        w.setAutoHideMenuBar(false);
      } else {
        w.setMenuBarVisibility(false);
        w.setAutoHideMenuBar(true);
      }
    }
  } catch {}

  // Optional debug menu (off by default). If not shown, keep app menu null.
  if (__showMenu) {
    try {
      const menu = Menu.buildFromTemplate([
        ...(process.platform === 'darwin' ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] }] : []),
        { label: 'View', submenu: [
          { label: 'Toggle Developer Tools', accelerator: 'Ctrl+Shift+I', click: () => { try { w.webContents.toggleDevTools(); } catch {} } },
          { label: 'Toggle Developer Tools (F12)', accelerator: 'F12', click: () => { try { w.webContents.toggleDevTools(); } catch {} } },
          { role: 'reload' },
          { role: 'forceReload' }
        ]},
      ]);
      Menu.setApplicationMenu(menu);
    } catch {}
  } else {
    try { Menu.setApplicationMenu(null); } catch {}
  }

  // Register DevTools shortcuts only when allowed.
  if (__allowDevTools) {
    try {
      globalShortcut.unregisterAll();
      globalShortcut.register('CommandOrControl+Shift+I', () => { try { w.webContents.toggleDevTools(); } catch {} });
      globalShortcut.register('F12', () => { try { w.webContents.toggleDevTools(); } catch {} });
    } catch {}
  }

  w.on('focus', () => { win = w; });
  w.on('closed', () => {
    try { windows.delete(w); } catch {}
  });

  w.on('ready-to-show', () => { 
    w.__tankobanDidFinishLoad = true; 
    
    flushPendingOpenPaths(w); 
  });

  w.loadFile(path.join(APP_ROOT, 'src', 'index.html'), openBookId ? { query: { book: openBookId } } : {})
    .then(() => { 
      w.show(); 
      // BUILD14: Log ready state
      try { console.log('TANKOBAN_BUILD14_READY'); } catch {}
    })
    .catch((err) => { console.error('Failed to load renderer:', err); });

  return w;
}

// Player launcher mode: launch Qt player directly without showing the library window.
// Looks up the video in the library index for progress tracking context.
async function __launchVideoFromFileAssoc(videoPath) {
  const playerCoreDomain = require('./domains/player_core');
  const storage = require('./lib/storage');
  const { CHANNEL, EVENT: EVT } = require('../shared/ipc');

  const ctx = { APP_ROOT, win: null, storage, CHANNEL, EVENT: EVT };

  let videoId = '';
  let showId = '';
  let startSeconds = 0;
  let showRootPath = path.dirname(videoPath);
  let playlistPaths = null;
  let playlistIds = null;
  let playlistIndex = -1;
  let prefAid = null;
  let prefSid = null;
  let prefSubVisibility = null;

  // Look up the video in the library index (best-effort)
  try {
    const idxPath = path.join(app.getPath('userData'), 'video_index.json');
    const raw = fs.readFileSync(idxPath, 'utf8');
    const idx = JSON.parse(raw);
    const episodes = Array.isArray(idx.episodes) ? idx.episodes : [];

    const normVideo = path.resolve(videoPath).toLowerCase();
    const match = episodes.find(ep => {
      const epPath = String(ep.path || '');
      return epPath && path.resolve(epPath).toLowerCase() === normVideo;
    });

    if (match) {
      videoId = String(match.id || '');
      showId = String(match.showId || '');
      showRootPath = String(match.showRootPath || '') || path.dirname(videoPath);

      // Build playlist from sibling episodes in the same show
      const showEps = episodes
        .filter(ep => String(ep.showId || '') === showId)
        .sort((a, b) => String(a.path || '').localeCompare(String(b.path || ''), undefined, { numeric: true, sensitivity: 'base' }));
      if (showEps.length > 1) {
        playlistPaths = showEps.map(ep => String(ep.path || ''));
        playlistIds = showEps.map(ep => String(ep.id || ''));
        playlistIndex = playlistPaths.findIndex(p => path.resolve(p).toLowerCase() === normVideo);
      }

      // Read progress for resume position and track preferences
      if (videoId) {
        try {
          const progressPath = path.join(app.getPath('userData'), 'video_progress.json');
          const progressRaw = fs.readFileSync(progressPath, 'utf8');
          const allProgress = JSON.parse(progressRaw);
          const prog = allProgress[videoId];
          if (prog && typeof prog === 'object') {
            const pos = Number(prog.positionSec);
            const dur = Number(prog.durationSec);
            if (Number.isFinite(pos) && pos > 0) {
              if (!dur || !Number.isFinite(dur) || dur <= 0 || (pos / dur) < 0.98) {
                startSeconds = pos;
              }
            }
            if (prog.aid !== undefined && prog.aid !== null && String(prog.aid).length) prefAid = String(prog.aid);
            if (prog.sid !== undefined && prog.sid !== null && String(prog.sid).length) prefSid = String(prog.sid);
            if (prog.subVisibility !== undefined && prog.subVisibility !== null) prefSubVisibility = !!prog.subVisibility;
          }
        } catch {}
      }
    }
  } catch {}

  const appExe = __isPackaged ? process.execPath : '';

  const result = await playerCoreDomain.launchQt(ctx, {}, {
    filePath: videoPath,
    startSeconds,
    videoId,
    showId,
    showRootPath,
    playlistPaths,
    playlistIds,
    playlistIndex,
    appExe,
    launcherMode: true,
    prefAid,
    prefSid,
    prefSubVisibility,
  });

  if (!result || !result.ok) {
    throw new Error(result ? result.error : 'launchQt_failed');
  }
}

// App lifecycle
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    // --show-library: summon the library window (sent by the player's LIB button)
    if (hasShowLibraryFlag(argv)) {
      __isPlayerLauncherMode = false;
      app.whenReady().then(() => {
        const w = getPrimaryWindow() || createWindow();
        if (!w) return;
        try { if (w.isMinimized()) w.restore(); } catch {}
        try { w.show(); } catch {}
        try { w.focus(); } catch {}
      });
      return;
    }

    // Video file: launch the Qt player (with library context if available)
    const videoPath = extractVideoPathFromArgv(argv);
    if (videoPath) {
      app.whenReady().then(async () => {
        try { await __launchVideoFromFileAssoc(videoPath); } catch {}
        // If library is visible, also show/focus it
        const w = getPrimaryWindow();
        if (w && !w.isDestroyed()) {
          try { if (w.isMinimized()) w.restore(); } catch {}
          try { w.show(); } catch {}
          try { w.focus(); } catch {}
        }
      });
      return;
    }

    // Comic archives: existing behavior
    const paths = extractComicPathsFromArgv(argv);
    if (paths.length) enqueueOpenPaths(paths, 'second-instance');
    app.whenReady().then(() => {
      const w = getPrimaryWindow() || createWindow();
      if (!w) return;
      try { if (w.isMinimized()) w.restore(); } catch {}
      try { w.show(); } catch {}
      try { w.focus(); } catch {}
      flushPendingOpenPaths(w);
    });
  });

  app.on('will-finish-launching', () => {
    app.on('open-file', (event, filePath) => {
      event.preventDefault();
      // Video file: launch player directly
      if (isVideoPath(filePath)) {
        app.whenReady().then(async () => {
          try { await __launchVideoFromFileAssoc(filePath); } catch {}
        });
        return;
      }
      // Comic archive: existing behavior
      enqueueOpenPaths([filePath], 'open-file');
      app.whenReady().then(() => {
        const w = getPrimaryWindow() || createWindow();
        if (!w) return;
        try { w.show(); } catch {}
        try { w.focus(); } catch {}
        flushPendingOpenPaths(w);
      });
    });
  });

  try {
    const initPaths = extractComicPathsFromArgv(process.argv);
    if (initPaths.length) enqueueOpenPaths(initPaths, 'argv');
  } catch {}

  // Detect video file in argv: enter player launcher mode (no library window)
  try {
    __pendingVideoPath = extractVideoPathFromArgv(process.argv);
    if (__pendingVideoPath) __isPlayerLauncherMode = true;
  } catch {}
}

app.whenReady().then(async () => {
  if (!gotLock) return;
  Menu.setApplicationMenu(null);

  // BUILD110: make SharedArrayBuffer usable (helps mpv shared surface avoid per-frame copies).
  try { ensureCrossOriginIsolationHeaders(); } catch {}

  // Register IPC handlers early (needed for player_core even in launcher mode).
  // Safe with win=null: the IPC registry uses optional chaining for window access.
  const registerIpc = require('./ipc');
  registerIpc({ APP_ROOT, win, windows });

  if (__isPlayerLauncherMode && __pendingVideoPath) {
    // Player launcher mode: skip library window, launch Qt player directly.
    try {
      await __launchVideoFromFileAssoc(__pendingVideoPath);
    } catch (e) {
      console.error('Player launcher failed:', e);
      __isPlayerLauncherMode = false;
      createWindow();
    }
  } else {
    createWindow();
  }

  // Legacy cleanup
  try {
    const oldP = dataPath('video_settings.json');
    if (oldP && fs.existsSync(oldP)) fs.unlinkSync(oldP);
  } catch {}

  // Display metrics tracking (mpvPlayers managed in IPC registry)
  try {
    if (screen && typeof screen.on === 'function') {
      // Note: actual mpv resync happens in IPC registry
      screen.on('display-metrics-changed', () => {});
      screen.on('display-added', () => {});
      screen.on('display-removed', () => {});
    }
  } catch {}

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      __isPlayerLauncherMode = false;
      createWindow();
    }
  });
});

app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch {} });

app.on('window-all-closed', () => {
  if (__isPlayerLauncherMode) return; // Qt player is still running headless
  if (process.platform !== 'darwin') app.quit();
});

// Note: before-quit cleanup handled in IPC registry where state lives

}; // end boot
