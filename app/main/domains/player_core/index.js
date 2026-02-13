/*
TankobanPro — Player Core Domain (Pro V1half)

INTENT:
- Introduce a main-process Player Core singleton that will become the only logical player backend.
- V1half scope: foundation only (domain + IPC wiring). Renderer is NOT rerouted yet.

HARD RULES (V1half):
- No UI/window/rendering changes.
- No behavior changes unless Player Core is explicitly invoked via IPC.
- Minimal diffs; keep existing project style.
*/

// Dependencies are required here so Player Core can delegate to the existing mpv/libmpv domain.
// NOTE: In V1half, these are only used if Player Core IPC is invoked.
let mpvDomain = null;
try { mpvDomain = require('../mpv'); } catch { /* embedded mpv disabled */ }
const videoProgressDomain = require('../videoProgress');

const { spawn } = require('child_process');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const fs = require('fs');

let __initializedAt = Date.now();

// ========== MODULE STATE (singleton) ==========

const __state = {
  backend: null,         // 'libmpv' | 'mpv' | null
  handleId: null,        // libmpv handle
  playerId: null,        // mpv child player id
  mediaRef: null,        // { videoId, path, showId, episodeId, ... } - shape owned by renderer/video domain
  isPlaying: false,
  positionSec: 0,
  durationSec: 0,
  ended: false,
  stopped: false,
  lastUpdateAt: 0,
  // BUILD14: Track Qt player process and session
  qtPlayerChild: null,
  qtPlayerSessionId: null,
  qtLaunching: false,
  qtProgressFile: null,
  qtVideoId: null,
  // BUILD21: Track playlist file for session cleanup/recovery (Build 6)
  qtPlaylistFile: null,
  // BUILD20: Live-sync Qt progress while the player is running (Build 3)
  qtProgressSyncTimer: null,
  qtProgressSyncLastMtimeMs: 0,
  qtProgressSyncLastSyncAt: 0,
  qtProgressSyncInFlight: false,
  qtRecoveryDone: false,
  // BUILD16: Remember Tankoban window bounds for restore after Qt player exits
  qtReturnBounds: null,
  qtReturnWinId: null,
  qtReturnSessionId: null,
  qtReturnWasFullscreen: false,
  qtRestoreFullscreenOnReturn: false,
  qtLastUiEventToken: '',
  // Player launcher mode: headless (no library window). Quit app when player exits.
  launcherMode: false,
};

// Debounced/throttled progress writes (V1 foundation; not actively used until V1full routes events here)
let __progressWriteTimer = null;
let __pendingProgress = null;
let __lastProgressWriteAt = 0;

function __now(){ return Date.now(); }

function __log(tag, extra){
  // Keep logs minimal and one-line.
  try {
    if (extra !== undefined && extra !== null && String(extra).length) console.log(String(tag), String(extra));
    else console.log(String(tag));
  } catch {}
}

function __copyState(){
  return {
    backend: __state.backend,
    handleId: __state.handleId,
    playerId: __state.playerId,
    mediaRef: __state.mediaRef ? { ...__state.mediaRef } : null,
    isPlaying: !!__state.isPlaying,
    positionSec: Number(__state.positionSec) || 0,
    durationSec: Number(__state.durationSec) || 0,
    ended: !!__state.ended,
    stopped: !!__state.stopped,
    lastUpdateAt: Number(__state.lastUpdateAt) || 0,
    initializedAt: __initializedAt,
  };
}

function __scheduleProgressWrite(ctx){
  // V1half: only writes if invoked via Player Core calls.
  if (!__pendingProgress || !ctx) return;

  const throttleMs = 1200; // 1.2s
  const elapsed = __now() - __lastProgressWriteAt;
  const delay = Math.max(0, throttleMs - elapsed);

  if (__progressWriteTimer) return;

  __progressWriteTimer = setTimeout(async () => {
    __progressWriteTimer = null;
    const payload = __pendingProgress;
    __pendingProgress = null;
    if (!payload) return;

    __lastProgressWriteAt = __now();

    try {
      // Persist via existing videoProgress domain (preserve format + location).
      if (payload.videoId) {
        await videoProgressDomain.save(ctx, null, payload.videoId, payload.progress || {});
        __log('PLAYER_PROGRESS_WRITE', `${String(payload.videoId)} ${Number(payload.progress?.positionSec)||0}/${Number(payload.progress?.durationSec)||0}`);
      }
    } catch (e) {
      // best-effort; do not throw to renderer
      __log('PLAYER_PROGRESS_WRITE_ERR', String(e && e.message ? e.message : e));
    }
  }, delay);
}

// ========== STRICT PLAYER CORE API ==========

async function start(ctx, _evt, mediaRef, opts){
  if (!mpvDomain) return { ok: false, error: 'embedded_player_disabled' };
  const o = (opts && typeof opts === 'object') ? opts : {};

  // V1half: allow attaching to an existing backend handle if provided.
  // V1full will own the full lifecycle + event subscriptions.
  __state.mediaRef = (mediaRef && typeof mediaRef === 'object') ? { ...mediaRef } : null;

  const backend = (o.backend === 'mpv' || o.backend === 'libmpv') ? o.backend : null;
  __state.backend = backend;

  // Optional: attach to an existing handle/player id
  __state.handleId = (backend === 'libmpv' && o.handleId !== undefined && o.handleId !== null) ? o.handleId : null;
  __state.playerId = (backend === 'mpv' && o.playerId) ? String(o.playerId) : null;

  __state.isPlaying = false;
  __state.positionSec = 0;
  __state.durationSec = 0;
  __state.ended = false;
  __state.stopped = false;
  __state.lastUpdateAt = __now();

  __log('PLAYER_CORE_SINGLETON_OK');

  // Foundation only: optionally load immediately if caller requests it and provides enough info.
  // This is NOT used by current UI and will not affect behavior unless invoked.
  try {
    if (o.autoload && __state.mediaRef && __state.mediaRef.path) {
      const p = String(__state.mediaRef.path);
      if (__state.backend === 'mpv' && __state.playerId) {
        await mpvDomain.mpvLoad(ctx, null, __state.playerId, p);
      } else if (__state.backend === 'libmpv' && __state.handleId) {
        // libmpv expects a command array; reuse existing command path
        await mpvDomain.libmpvCommand(ctx, null, __state.handleId, ['loadfile', p, 'replace']);
      }
    }
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e), state: __copyState() };
  }

  return { ok: true, state: __copyState() };
}

async function play(ctx, _evt){
  if (!mpvDomain) return { ok: false, error: 'embedded_player_disabled' };
  try {
    if (__state.backend === 'mpv' && __state.playerId) {
      await mpvDomain.mpvSetProperty(ctx, null, __state.playerId, 'pause', false);
    } else if (__state.backend === 'libmpv' && __state.handleId) {
      await mpvDomain.libmpvSetPropertyString(ctx, null, __state.handleId, 'pause', 'no');
    }
    __state.isPlaying = true;
    __state.lastUpdateAt = __now();
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e), state: __copyState() };
  }
  return { ok: true, state: __copyState() };
}

async function pause(ctx, _evt){
  if (!mpvDomain) return { ok: false, error: 'embedded_player_disabled' };
  try {
    if (__state.backend === 'mpv' && __state.playerId) {
      await mpvDomain.mpvSetProperty(ctx, null, __state.playerId, 'pause', true);
    } else if (__state.backend === 'libmpv' && __state.handleId) {
      await mpvDomain.libmpvSetPropertyString(ctx, null, __state.handleId, 'pause', 'yes');
    }
    __state.isPlaying = false;
    __state.lastUpdateAt = __now();
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e), state: __copyState() };
  }

  // Best-effort: flush any pending progress write (if any) soon.
  __scheduleProgressWrite(ctx);

  return { ok: true, state: __copyState() };
}

async function seek(ctx, _evt, secondsOrMs){
  if (!mpvDomain) return { ok: false, error: 'embedded_player_disabled' };
  const x = Number(secondsOrMs);
  if (!Number.isFinite(x)) return { ok: false, error: 'seek: invalid position', state: __copyState() };

  try {
    // Interpret values > 10000 as milliseconds to keep it forgiving.
    const sec = x > 10000 ? (x / 1000) : x;
    if (__state.backend === 'mpv' && __state.playerId) {
      await mpvDomain.mpvCommand(ctx, null, __state.playerId, ['seek', String(sec), 'absolute']);
    } else if (__state.backend === 'libmpv' && __state.handleId) {
      await mpvDomain.libmpvCommand(ctx, null, __state.handleId, ['seek', String(sec), 'absolute']);
    }
    __state.positionSec = sec;
    __state.lastUpdateAt = __now();
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e), state: __copyState() };
  }

  // Best-effort: schedule a progress write.
  try {
    const videoId = (__state.mediaRef && (__state.mediaRef.videoId || __state.mediaRef.id)) ? String(__state.mediaRef.videoId || __state.mediaRef.id) : null;
    if (videoId) {
      __pendingProgress = {
        videoId,
        progress: { positionSec: __state.positionSec, durationSec: __state.durationSec || undefined }
      };
      __scheduleProgressWrite(ctx);
    }
  } catch {}

  return { ok: true, state: __copyState() };
}

async function stop(ctx, _evt, reason){
  if (!mpvDomain) return { ok: false, error: 'embedded_player_disabled' };
  try {
    if (__state.backend === 'mpv' && __state.playerId) {
      await mpvDomain.mpvCommand(ctx, null, __state.playerId, ['stop']);
    } else if (__state.backend === 'libmpv' && __state.handleId) {
      await mpvDomain.libmpvCommand(ctx, null, __state.handleId, ['stop']);
    }
  } catch (e) {
    // best-effort
    __log('PLAYER_STOP_ERR', String(e && e.message ? e.message : e));
  }

  __state.isPlaying = false;
  __state.stopped = true;
  __state.ended = false;
  __state.lastUpdateAt = __now();

  // Flush pending progress write.
  __scheduleProgressWrite(ctx);

  return { ok: true, reason: reason ? String(reason) : '', state: __copyState() };
}


async function launchQt(_ctx, _evt, args){
  const a = (args && typeof args === 'object') ? args : {};
  const filePath = a.filePath ? String(a.filePath) : '';
  if (!filePath) return { ok: false, error: 'launchQt: missing filePath' };

  let returnWin = null;
  let returnWinFullscreen = false;
  try {
    const bw = BrowserWindow.fromWebContents(_evt?.sender);
    if (bw && !bw.isDestroyed()) {
      returnWin = bw;
      returnWinFullscreen = !!bw.isFullScreen();
    }
  } catch {}

// BUILD18: Single-instance behavior for Qt player
try {
  const p = __state.qtPlayerChild;
  const running = !!(p && p.exitCode === null);

  // If a launch is already in-flight, keep the existing guard.
  if (__state.qtLaunching) {
    return { ok: false, alreadyRunning: true };
  }

  // If the player is already running, forward the request to the existing window
  // instead of forcing the user to close it.
  if (running) {
    const keepLibraryVisible = !!returnWinFullscreen;
    try {
      if (returnWin && !returnWin.isDestroyed()) {
        __state.qtReturnWinId = returnWin.id;
        __state.qtReturnWasFullscreen = keepLibraryVisible;
        __state.qtRestoreFullscreenOnReturn = keepLibraryVisible;
        const b = returnWin.getBounds();
        if (b && typeof b === 'object') {
          __state.qtReturnBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
        }
      }
    } catch {}

    const userData = app.getPath('userData');
    const sessionsDir = path.join(userData, 'qt_player_sessions');
    try { fs.mkdirSync(sessionsDir, { recursive: true }); } catch {}

    const activeSessionId = String(__state.qtPlayerSessionId || '');
    const targetSessionId = activeSessionId || String(a.sessionId || Date.now());
    const cmdPath = path.join(sessionsDir, `command_${targetSessionId}.json`);

    const startSeconds = Number(a.startSeconds);
    const start = Number.isFinite(startSeconds) ? startSeconds : 0;

    let playlistIndex = -1;
    try { if (Number.isFinite(Number(a.playlistIndex))) playlistIndex = Number(a.playlistIndex); } catch {}

    const cmd = {
      action: 'open',
      filePath: String(filePath),
      startSeconds: start,
      videoId: String(a.videoId || ''),
      showId: String(a.showId || ''),
      title: String(a.title || ''),
      showRootPath: String(a.showRootPath || ''),
      playlistPaths: Array.isArray(a.playlistPaths) ? a.playlistPaths : null,
      playlistIds: Array.isArray(a.playlistIds) ? a.playlistIds : null,
      playlistIndex,
      ts: Date.now(),
    };

    try { fs.writeFileSync(cmdPath, JSON.stringify(cmd, null, 2)); } catch {}

    // Ensure we still provide a log path for debugging/toasts.
    const logDir = path.join(userData, 'qt_player_logs');
    const logPath = path.join(logDir, 'qt_player_spawn.log');
    try { fs.mkdirSync(logDir, { recursive: true }); } catch {}
    try { fs.appendFileSync(logPath, `
[${new Date().toISOString()}] launchQt: forwarded open to running player session=${targetSessionId} file=${filePath}
`); } catch {}

    return {
      ok: true,
      forwarded: true,
      sessionId: targetSessionId,
      progressFile: __state.qtProgressFile || '',
      logPath,
      keepLibraryVisible,
    };
  }

  // Clear stale handle (defensive) so a finished child doesn't block future launches.
  if (p && p.exitCode !== null) {
    __state.qtPlayerChild = null;
    __state.qtPlayerSessionId = null;
    __state.qtProgressFile = null;
    __state.qtVideoId = null;
    __state.qtPlaylistFile = null;
    __state.qtReturnBounds = null;
    __state.qtReturnWinId = null;
    __state.qtReturnSessionId = null;
    __state.qtReturnWasFullscreen = false;
    __state.qtRestoreFullscreenOnReturn = false;
    __state.qtLastUiEventToken = '';
  }
} catch {}
__state.qtLaunching = true;

  __state.qtReturnWasFullscreen = !!returnWinFullscreen;
  __state.qtRestoreFullscreenOnReturn = !!returnWinFullscreen;
  __state.qtLastUiEventToken = '';
  if (a.launcherMode) __state.launcherMode = true;

  const startSeconds = Number(a.startSeconds);
  const start = Number.isFinite(startSeconds) ? startSeconds : 0;
  const sessionId = a.sessionId ? String(a.sessionId) : String(Date.now());

  const userData = app.getPath('userData');
  const progressFile = a.progressFile ? String(a.progressFile) : path.join(userData, 'qt_player_sessions', `session_${sessionId}.json`);

// V8: pass library identity + playlist context to Qt player (written as a session file, not argv JSON).
const videoId = a.videoId ? String(a.videoId) : '';
const showId = a.showId ? String(a.showId) : '';
const sessionsDir = path.join(userData, 'qt_player_sessions');
try { fs.mkdirSync(sessionsDir, { recursive: true }); } catch {}

// BUILD22: Restore per-video audio/subtitle preferences (best-effort)
let prefAid = null;
let prefSid = null;
let prefSubVisibility = null;
try {
  if (videoId) {
    const videoProgress = require('../videoProgress');
    if (videoProgress && typeof videoProgress.get === 'function') {
      const p = videoProgress.get(_ctx, null, videoId);
      // get() is async; but this launch path is already async, so await if it returns a promise.
      const cur = (p && typeof p.then === 'function') ? await p : p;
      if (cur && typeof cur === 'object') {
        if (cur.aid !== undefined && cur.aid !== null && String(cur.aid).length) prefAid = String(cur.aid);
        if (cur.sid !== undefined && cur.sid !== null && String(cur.sid).length) prefSid = String(cur.sid);
        if (cur.subVisibility !== undefined && cur.subVisibility !== null) prefSubVisibility = !!cur.subVisibility;
      }
    }
  }
} catch {}

// BUILD21: Recover stale Qt session files once per app run.
try {
  if (!__state.qtRecoveryDone) {
    __state.qtRecoveryDone = true;
    await __recoverStaleQtSessions(_ctx);
  }
} catch {}

let playlistFile = '';
let playlistIndex = -1;
try {
  if (Number.isFinite(Number(a.playlistIndex))) playlistIndex = Number(a.playlistIndex);
} catch {}
try {
  const paths = Array.isArray(a.playlistPaths) ? a.playlistPaths : null;
  if (paths && paths.length) {
    const ids = Array.isArray(a.playlistIds) ? a.playlistIds : [];
    playlistFile = path.join(sessionsDir, `playlist_${sessionId}.json`);
    fs.writeFileSync(playlistFile, JSON.stringify({ paths, ids, index: playlistIndex }, null, 2));
  }
} catch {}


  // Always create a spawn log, even if Python preflight fails.
  // This is the primary debugging artifact users can send when the player does not open.
  const logDir = path.join(userData, 'qt_player_logs');
  const logPath = path.join(logDir, 'qt_player_spawn.log');
  try { fs.mkdirSync(logDir, { recursive: true }); } catch {}
  const __appendLog = (s) => { try { fs.appendFileSync(logPath, String(s)); } catch {} };
  const __clearQtLaunching = () => { try { __state.qtLaunching = false; } catch {} };

  const appRoot = (_ctx && _ctx.APP_ROOT) ? String(_ctx.APP_ROOT) : process.cwd();
  const playerDir = path.join(appRoot, 'player_qt');
  const playerScript = path.join(playerDir, 'run_player.py');

  // Packaged builds: prefer a bundled, self-contained player exe (PyInstaller),
  // so end-users don't need Python installed.
  const isPackaged = !!app.isPackaged;
  const bundledPlayerExe = (process.platform === 'win32')
    ? (isPackaged
        ? path.join(process.resourcesPath, 'player', 'TankobanPlayer', 'TankobanPlayer.exe')
        : path.join(playerDir, 'dist', 'TankobanPlayer', 'TankobanPlayer.exe'))
    : '';
  const preferBundledExeInDev = (process.env.TANKOBAN_USE_BUNDLED_PLAYER_IN_DEV === '1');
  const canUseBundledExe = !!(bundledPlayerExe && fs.existsSync(bundledPlayerExe) && (isPackaged || preferBundledExeInDev));

  // Ensure libmpv DLL discovery is deterministic (Python player reads this env var).
  const mpvDllDir = (process.platform === 'win32')
    ? (isPackaged
        ? path.join(process.resourcesPath, 'mpv', 'windows')
        : path.join(appRoot, 'resources', 'mpv', 'windows'))
    : '';

  // Choose python binary (DEV BUILD RULES):
  // Prefer the local venv created by install_qt_player.bat.
  // This avoids silent failures when system python lacks PySide6/python-mpv.
  let py = '';
  try {
    const venvPyWin = path.join(playerDir, '.venv', 'Scripts', 'python.exe');
    const venvPyNix = path.join(playerDir, '.venv', 'bin', 'python');
    const venvPy = (process.platform === 'win32') ? venvPyWin : venvPyNix;
    if (fs.existsSync(venvPy)) py = venvPy;
  } catch {}

  if (!py) {
    const envPy = process.env.PYTHON_BIN ? String(process.env.PYTHON_BIN) : '';
    if (envPy && fs.existsSync(envPy)) py = envPy;
  }

  // On Windows, the Python launcher ("py") is common even when "python" is not on PATH.
  if (!py) py = (process.platform === 'win32') ? 'py' : 'python';

  const commonArgs = [
    '--file', filePath,
    '--start', String(start),
    '--session', sessionId,
    '--progress-file', progressFile,
    '--title', 'Tankoban Player',
    '--show-root', path.dirname(filePath),

  // Build16: match player window geometry to Tankoban window (best-effort)
  ...(() => {
    try {
      const bw = (returnWin && !returnWin.isDestroyed()) ? returnWin : BrowserWindow.fromWebContents(_evt.sender);
      if (!bw) return [];
      const b = bw.getBounds();
      if (!b) return [];
      // BUILD16: Persist bounds for restore (do this here so argv + restore use the same values)
      try {
        __state.qtReturnBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
        __state.qtReturnWinId = bw.id;
        __state.qtReturnSessionId = sessionId;
      } catch {}
      const out = ['--win-x', String(b.x), '--win-y', String(b.y), '--win-w', String(b.width), '--win-h', String(b.height)];
      if (__state.qtReturnWasFullscreen) out.push('--fullscreen');
      return out;
    } catch {
      return [];
    }
  })(),
];

  const argv = canUseBundledExe ? [...commonArgs] : [playerScript, ...commonArgs];

  if (videoId) { argv.push('--video-id', videoId); }
  if (showId) { argv.push('--show-id', showId); }
  // BUILD22: Pass persisted audio/subtitle prefs (best-effort)
  try {
    if (prefAid !== null && prefAid !== undefined && String(prefAid).length) argv.push('--pref-aid', String(prefAid));
    if (prefSid !== null && prefSid !== undefined && String(prefSid).length) argv.push('--pref-sid', String(prefSid));
    if (prefSubVisibility !== null && prefSubVisibility !== undefined) argv.push('--pref-sub-visibility', prefSubVisibility ? 'yes' : 'no');
  } catch {}
  if (playlistFile) {
    argv.push('--playlist-file', playlistFile);
    argv.push('--playlist-index', String(playlistIndex));
  }

  // BUILD23: Allow single-instance Qt player to switch files via a command file.
  try {
    const commandFile = path.join(sessionsDir, `command_${sessionId}.json`);
    argv.push('--command-file', commandFile);
  } catch {}

  // Pass the main app exe path so the player can summon the library window.
  try {
    const appExe = a.appExe ? String(a.appExe) : (app.isPackaged ? process.execPath : '');
    if (appExe) argv.push('--app-exe', appExe);
  } catch {}

  // Emit a header before preflight so failures still produce a usable log file.
  __appendLog(`[${new Date().toISOString()}] launchQt: begin\n`);
  __appendLog(`  mode=${canUseBundledExe ? 'bundled-exe' : 'python'}\n`);
  if (canUseBundledExe) {
    __appendLog(`  exe=${bundledPlayerExe}\n`);
  } else {
    __appendLog(`  py=${py}\n`);
    __appendLog(`  script=${playerScript}\n`);
  }
  __appendLog(`  file=${filePath}\n`);
  __appendLog(`  start=${start}\n`);
  __appendLog(`  session=${sessionId}\n`);
  __appendLog(`  progress=${progressFile}\n`);
  __appendLog(`  returnFullscreen=${__state.qtReturnWasFullscreen ? 'yes' : 'no'}\n`);
  __appendLog(`  videoId=${videoId}\n`);
  __appendLog(`  showId=${showId}\n`);
  if (playlistFile) __appendLog(`  playlistFile=${playlistFile} index=${playlistIndex}\n`);

  // Avoid blocking preflight probes on the main thread.
  // Launch errors are still reported by the existing spawn/error handlers below.
  if (!canUseBundledExe) __appendLog('  preflight=skipped (non-blocking)\n');

// Header already written above.

  try {
    const spawnCmd = canUseBundledExe
      ? `"${bundledPlayerExe}" ${argv.join(' ')}`
      : `${py} ${argv.join(' ')}`;
    __log('QT_PLAYER_SPAWN', spawnCmd);

    // Keep stdio so errors show up in the terminal when running via "npm start".
    // Also write stdout/stderr to a log file for easy debugging.
    const env = { ...process.env };
    try { if (mpvDllDir) env.TANKOBAN_MPV_DLL_DIR = mpvDllDir; } catch {}

    const child = canUseBundledExe
      ? spawn(bundledPlayerExe, argv, {
          cwd: path.dirname(bundledPlayerExe),
          detached: false,
          windowsHide: false,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : spawn(py === 'py' ? 'py' : py, py === 'py' ? ['-3', ...argv] : argv, {
          cwd: playerDir,
          detached: false,
          windowsHide: false,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

    const qtVerboseLogs = (process.env.TANKOBAN_QT_VERBOSE_LOGS === '1');
    const appendQtChildLog = (tag, d) => {
      try {
        const s = String(d || '');
        if (!s) return;
        try { fs.appendFile(logPath, s, () => {}); } catch {}
        if (qtVerboseLogs) {
          try { __log(tag, s.trim()); } catch {}
        }
      } catch {}
    };

    child.stdout.on('data', (d) => {
      appendQtChildLog('QT_PLAYER_OUT', d);
    });
    child.stderr.on('data', (d) => {
      appendQtChildLog('QT_PLAYER_ERR', d);
    });
    child.on('error', (err) => {
      try { if (__state.qtPlayerChild !== child) return; } catch {}
      try { fs.appendFileSync(logPath, `\n[spawn error] ${String(err && err.message ? err.message : err)}\n`); } catch {}
      __log('QT_PLAYER_SPAWN_ERROR', String(err && err.message ? err.message : err));
      // BUILD14: On spawn error, restore window
      __restoreWindowAfterPlayerExit(_ctx, 1, 'spawn-error');
    });
    child.on('exit', (code, sig) => {
      try { if (__state.qtPlayerChild !== child) return; } catch {}
      try { fs.appendFileSync(logPath, `\n[exit] code=${code} sig=${sig}\n`); } catch {}
      if (code && Number(code) !== 0) {
        __log('QT_PLAYER_EXIT', `code=${code} (see ${logPath})`);
      }
      // BUILD14: Restore window when player exits (normal or crash)
      __restoreWindowAfterPlayerExit(_ctx, code, sig);
    });
    
    // BUILD14: Track the spawned process
    __state.qtPlayerChild = child;
    __state.qtPlayerSessionId = sessionId;
    __state.qtProgressFile = progressFile;
    __state.qtVideoId = videoId || null;
    __state.qtPlaylistFile = playlistFile || null;

// BUILD18: Wait for actual spawn success so renderer only hides on a real launch.
const spawnErr = await new Promise((resolve) => {
  try {
    child.once('spawn', () => resolve(null));
    child.once('error', (e) => resolve(e || new Error('spawn_failed')));
  } catch (e) {
    resolve(e || new Error('spawn_failed'));
  }
});
if (spawnErr) {
  try { fs.appendFileSync(logPath, `\n[spawn_failed] ${String(spawnErr && spawnErr.message ? spawnErr.message : spawnErr)}\n`); } catch {}
  // Clear Qt player tracking so we don't wedge in a "running" state.
  try {
    __state.qtPlayerChild = null;
    __state.qtPlayerSessionId = null;
    __state.qtProgressFile = null;
    __state.qtVideoId = null;
    __state.qtPlaylistFile = null;
    __state.qtReturnBounds = null;
    __state.qtReturnWinId = null;
    __state.qtReturnSessionId = null;
    __state.qtReturnWasFullscreen = false;
    __state.qtRestoreFullscreenOnReturn = false;
    __state.qtLastUiEventToken = '';
    __state.launcherMode = false;
  } catch {}
  // BUILD21: Clean up any playlist file created for this session.
  try { __cleanupQtSessionFiles(null, playlistFile); } catch {}
  __clearQtLaunching();
  return { ok: false, error: 'spawn_failed', logPath };
}
__clearQtLaunching();
// BUILD20: Live-sync progress while Qt player is running (Build 3)
try { __startQtProgressSync(_ctx); } catch {}
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    __appendLog(`  [spawn exception] ${msg}\n`);
    // BUILD21: Clean up any playlist file created for this session.
    try { __cleanupQtSessionFiles(null, playlistFile); } catch {}
    // BUILD14: On exception, restore window
    __restoreWindowAfterPlayerExit(_ctx, 1, 'spawn-exception');
    __clearQtLaunching();
    return { ok: false, error: msg, logPath };
  }

  return {
    ok: true,
    sessionId,
    progressFile,
    logPath,
    keepLibraryVisible: !!__state.qtReturnWasFullscreen,
  };
}

async function getState(_ctx, _evt){
  return { ok: true, state: __copyState() };
}


function __readJsonSafe(p) {
  try {
    if (!p || !fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function __readJsonSafeAsync(p) {
  try {
    if (!p) return null;
    const raw = await fs.promises.readFile(p, 'utf8');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function __unlinkSafe(p) {
  try {
    if (!p) return;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

function __cleanupQtSessionFiles(progressPath, playlistPath) {
  try { __unlinkSafe(progressPath); } catch {}
  try { __unlinkSafe(playlistPath); } catch {}
}

// BUILD21: If Tankoban crashed while the Qt player was running, the session files may remain.
// Recover by importing them into Tankoban's progress store the next time we have a valid ctx.
async function __recoverStaleQtSessions(ctx) {
  try {
    if (!ctx || !ctx.storage || typeof ctx.storage.dataPath !== 'function') return;

    const userData = app.getPath('userData');
    const sessionsDir = path.join(userData, 'qt_player_sessions');
    let files = [];
    const names = await fs.promises.readdir(sessionsDir).catch(() => []);
    try {
      files = names
        .filter((n) => n && n.startsWith('session_') && n.endsWith('.json'))
        .map((n) => {
          const idPart = String(n).slice('session_'.length, -'.json'.length);
          const rank = Number(idPart);
          return { p: path.join(sessionsDir, n), r: Number.isFinite(rank) ? rank : 0 };
        })
        .sort((a, b) => (b.r || 0) - (a.r || 0))
        .slice(0, 25)
        .map((x) => x.p);
    } catch {
      files = [];
    }
    if (!files.length) return;

    for (const sessionPath of files) {
      try {
        const q = await __readJsonSafeAsync(sessionPath);
        if (!q || typeof q !== 'object') { __unlinkSafe(sessionPath); continue; }

        const videoId = q.videoId ? String(q.videoId) : '';
        if (!videoId) { __unlinkSafe(sessionPath); continue; }

        const sessionId = q.sessionId ? String(q.sessionId) : '';
        const playlistPath = sessionId ? path.join(sessionsDir, `playlist_${sessionId}.json`) : '';

        // Only apply recovery if it is not older than the current stored progress.
        const tsMs = Number.isFinite(Number(q.timestamp)) ? (Number(q.timestamp) * 1000) : 0;
        let existing = null;
        try { existing = await videoProgressDomain.get(ctx, null, videoId); } catch { existing = null; }
        try {
          const last = existing && Number.isFinite(Number(existing.lastWatchedAtMs)) ? Number(existing.lastWatchedAtMs) : 0;
          if (last && tsMs && (last > (tsMs + 2000))) {
            __cleanupQtSessionFiles(sessionPath, playlistPath);
            continue;
          }
        } catch {}

        const pos = Number(q.position);
        const dur = Number(q.duration);
        const maxPos = Number(q.maxPosition);
        const watched = Number(q.watchedTime);
        const finished = !!q.finished;

        const payload = {
          positionSec: Number.isFinite(pos) ? pos : 0,
          durationSec: (Number.isFinite(dur) && dur > 0) ? dur : null,
          finished: !!finished,
          lastWatchedAtMs: tsMs || Date.now(),
          completedAtMs: finished ? (tsMs || Date.now()) : null,
          maxPositionSec: Number.isFinite(maxPos) ? maxPos : (Number.isFinite(pos) ? pos : 0),
          watchedSecApprox: Number.isFinite(watched) ? watched : 0,
          updatedAt: Date.now(),
        };

        try {
          const p = videoProgressDomain.save(ctx, null, videoId, payload);
          try { if (p && typeof p.then === 'function') await p; } catch {}
        } catch {}

        try { __broadcastVideoProgressUpdated(videoId, payload); } catch {}
        __cleanupQtSessionFiles(sessionPath, playlistPath);
      } catch {
        // If anything about recovery breaks, delete the session file so it doesn't keep failing.
        try { __unlinkSafe(sessionPath); } catch {}
      }
    }
  } catch {}
}

function __broadcastVideoProgressUpdated(videoId, progress) {
  try {
    if (!videoId) return;
    const { EVENT } = require('../../../shared/ipc');
    const payload = { videoId: String(videoId), progress: progress || null };
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w || w.isDestroyed()) continue;
      w.webContents.send(EVENT.VIDEO_PROGRESS_UPDATED, payload);
    }
  } catch {}
}

function __resolveReturnWindow(ctx) {
  let win = null;
  try { if (__state.qtReturnWinId) win = BrowserWindow.fromId(__state.qtReturnWinId); } catch {}
  try { if (!win && ctx && ctx.win && !ctx.win.isDestroyed()) win = ctx.win; } catch {}
  try {
    if (!win) {
      const windows = BrowserWindow.getAllWindows();
      win = Array.isArray(windows) ? windows.find((w) => w && !w.isDestroyed()) : null;
    }
  } catch {}
  if (!win || win.isDestroyed()) return null;
  return win;
}

function __handleQtUiEvent(ctx, synced) {
  try {
    if (!synced || typeof synced !== 'object') return;

    const uiEvent = (synced.uiEvent && typeof synced.uiEvent === 'object') ? synced.uiEvent : null;
    if (!uiEvent || !uiEvent.type) return;

    const token = String(uiEvent.token || '');
    if (!token) return;
    if (__state.qtLastUiEventToken === token) return;
    __state.qtLastUiEventToken = token;

    const win = __resolveReturnWindow(ctx);
    if (!win) return;

    if (uiEvent.type === 'fullscreen') {
      if (typeof uiEvent.value === 'boolean') {
        __state.qtRestoreFullscreenOnReturn = !!uiEvent.value;
        try {
          if (!!win.isFullScreen() !== !!uiEvent.value) win.setFullScreen(!!uiEvent.value);
        } catch {}
      }
      return;
    }

    if (uiEvent.type === 'back') {
      const wantFullscreen = !!__state.qtRestoreFullscreenOnReturn;
      try { if (win.isMinimized && win.isMinimized()) win.restore(); } catch {}
      if (wantFullscreen) {
        try { if (!win.isFullScreen()) win.setFullScreen(true); } catch {}
      } else {
        try { if (win.isFullScreen()) win.setFullScreen(false); } catch {}
        try {
          const b = __state.qtReturnBounds;
          if (b && typeof b === 'object') win.setBounds(b);
        } catch {}
      }
      try { win.show(); } catch {}
      try { win.focus(); } catch {}
      return;
    }
  } catch {}
}

function __stopQtProgressSync() {
  try {
    if (__state.qtProgressSyncTimer) clearInterval(__state.qtProgressSyncTimer);
  } catch {}
  __state.qtProgressSyncTimer = null;
  __state.qtProgressSyncLastMtimeMs = 0;
  __state.qtProgressSyncLastSyncAt = 0;
  __state.qtProgressSyncInFlight = false;
}

function __startQtProgressSync(ctx) {
  try {
    __stopQtProgressSync();
    const intervalMs = 500;
    __state.qtProgressSyncTimer = setInterval(() => {
      if (__state.qtProgressSyncInFlight) return;
      __state.qtProgressSyncInFlight = true;
      (async () => {
        const child = __state.qtPlayerChild;
        if (!child || child.exitCode !== null) return;
        const progressPath = __state.qtProgressFile;
        if (!progressPath) return;

        const st = await fs.promises.stat(progressPath).catch(() => null);
        const mtimeMs = Number(st && st.mtimeMs) || 0;
        if (!mtimeMs || mtimeMs <= (Number(__state.qtProgressSyncLastMtimeMs) || 0)) return;
        __state.qtProgressSyncLastMtimeMs = mtimeMs;

        // Throttle the sync work a bit, even if the file changes quickly.
        const now = Date.now();
        const last = Number(__state.qtProgressSyncLastSyncAt) || 0;
        if ((now - last) < 180) return;
        __state.qtProgressSyncLastSyncAt = now;

        const q = await __readJsonSafeAsync(progressPath);
        const synced = __syncProgressFromQtSession(ctx, q);
        try { __handleQtUiEvent(ctx, synced); } catch {}
        if (synced && synced.videoId) {
          __broadcastVideoProgressUpdated(String(synced.videoId), synced.progress || null);
        }
      })()
        .catch(() => {})
        .finally(() => { __state.qtProgressSyncInFlight = false; });
    }, intervalMs);
  } catch {}
}

// BUILD16: Sync Qt player session progress into Tankoban's persisted progress store.
// This is the key to "instant progress update on close" and "perfect resume" for Qt playback.
function __syncProgressFromQtSession(ctx, qOverride) {
  try {
    const progressPath = __state.qtProgressFile;
    const q = (qOverride && typeof qOverride === 'object') ? qOverride : __readJsonSafe(progressPath);
    if (!q || typeof q !== 'object') return null;

    const videoId = String(q.videoId || __state.qtVideoId || '');
    if (!videoId) return null;

    const pos = Number(q.position);
    const dur = Number(q.duration);
    const maxPos = Number(q.maxPosition);
    const watched = Number(q.watchedTime);
    const finished = !!q.finished;

    // BUILD22: Persist track preferences (best-effort)
    const aid = (q.aid === undefined || q.aid === null) ? null : String(q.aid);
    const sid = (q.sid === undefined || q.sid === null) ? null : String(q.sid);
    const subVisibility = (q.subVisibility === undefined || q.subVisibility === null) ? null : !!q.subVisibility;

    const payload = {
      positionSec: Number.isFinite(pos) ? pos : 0,
      durationSec: (Number.isFinite(dur) && dur > 0) ? dur : null,
      finished: !!finished,
      lastWatchedAtMs: Date.now(),
      completedAtMs: finished ? Date.now() : null,
      maxPositionSec: Number.isFinite(maxPos) ? maxPos : (Number.isFinite(pos) ? pos : 0),
      watchedSecApprox: Number.isFinite(watched) ? watched : 0,
      updatedAt: Date.now(),
      ...(aid !== null ? { aid } : {}),
      ...(sid !== null ? { sid } : {}),
      ...(subVisibility !== null ? { subVisibility } : {}),
    };

    let playerFullscreen = null;
    try {
      if (q.windowFullscreen !== undefined && q.windowFullscreen !== null) {
        playerFullscreen = !!q.windowFullscreen;
      }
    } catch {}

    let uiEvent = null;
    try {
      const rawEvt = q.uiEvent;
      if (rawEvt && typeof rawEvt === 'object') {
        const type = String(rawEvt.type || '').trim().toLowerCase();
        if (type) {
          const idNum = Number(rawEvt.id);
          const tsNum = Number(rawEvt.ts);
          const hasId = Number.isFinite(idNum);
          const hasTs = Number.isFinite(tsNum);
          const val = (rawEvt.value === true || rawEvt.value === false) ? !!rawEvt.value : null;
          const token = hasId
            ? `${type}:${idNum}`
            : hasTs
            ? `${type}:${tsNum}`
            : `${type}:${val === null ? '' : (val ? '1' : '0')}`;
          uiEvent = { type, value: val, token };
        }
      }
    } catch {}

    // Persist to the same progress store used by the renderer (Tanko.api.videoProgress.*)
    try {
      const videoProgress = require('../videoProgress');
      if (videoProgress && typeof videoProgress.save === 'function') {
        // save(ctx, evt, videoId, progress)
        const p = videoProgress.save(ctx, null, videoId, payload);
        try { if (p && typeof p.then === 'function') p.catch(() => {}); } catch {}
      }
    } catch (e) {
      __log('BUILD16_PROGRESS_SYNC_ERROR', String(e && e.message ? e.message : e));
    }

    return { videoId, progress: payload, raw: q, playerFullscreen, uiEvent };
  } catch (e) {
    __log('BUILD16_PROGRESS_SYNC_ERROR', String(e && e.message ? e.message : e));
    return null;
  }
}

// BUILD14: Window restore after player exits
function __restoreWindowAfterPlayerExit(ctx, exitCode, signal) {
  try {
    __log('BUILD14_RESTORE_AFTER_EXIT', `code=${exitCode} sig=${signal}`);

    // BUILD20: Stop live sync timer first to avoid concurrent reads while restoring.
    try { __stopQtProgressSync(); } catch {}

    // FIX19: Sync Qt session progress into Tankoban store immediately on exit/crash (best-effort).
    // Moved before window check so progress is saved even in headless launcher mode.
    let synced = null;
    try { synced = __syncProgressFromQtSession(ctx); } catch (e) { synced = null; }
    if (synced && typeof synced.playerFullscreen === 'boolean' && !__state.qtLastUiEventToken) {
      __state.qtRestoreFullscreenOnReturn = !!synced.playerFullscreen;
    }

    // BUILD21: Clean up session artifacts (best-effort). If Tankoban crashes, recovery will import on next launch.
    try { __cleanupQtSessionFiles(__state.qtProgressFile, __state.qtPlaylistFile); } catch {}

    // Capture values before clearing state (needed for window restore below)
    const wasLauncherMode = !!__state.launcherMode;
    const restoreFullscreen = !!__state.qtRestoreFullscreenOnReturn;
    const returnBounds = __state.qtReturnBounds;

    // Clear Qt player tracking
    __state.qtLaunching = false;
    __state.qtPlayerChild = null;
    __state.qtPlayerSessionId = null;
    __state.qtReturnBounds = null;
    __state.qtReturnWinId = null;
    __state.qtReturnSessionId = null;
    __state.qtReturnWasFullscreen = false;
    __state.qtRestoreFullscreenOnReturn = false;
    __state.qtLastUiEventToken = '';
    // FIX16: Clear per-session sync fields
    __state.qtProgressFile = null;
    __state.qtVideoId = null;
    __state.qtPlaylistFile = null;
    __state.launcherMode = false;

    // Player launcher mode: no window to restore. Quit if no library was summoned.
    if (wasLauncherMode) {
      const allWindows = BrowserWindow.getAllWindows();
      if (!allWindows || allWindows.length === 0) {
        try { app.quit(); } catch {}
      }
      // If a library window exists (user clicked LIB), fall through to show it.
    }

    const win = __resolveReturnWindow(ctx);
    if (!win || win.isDestroyed()) {
      __log('BUILD14_RESTORE', 'No window to restore (headless or closed)');
      return;
    }

    if (!restoreFullscreen) {
      try { win.setFullScreen(false); } catch (e) { __log('BUILD14_ERROR', `fullscreenOff: ${e.message}`); }
      try {
        const b = returnBounds;
        if (b && typeof b === 'object') win.setBounds(b);
      } catch (e) { __log('BUILD14_ERROR', `setBounds: ${e.message}`); }
    } else {
      try { if (!win.isFullScreen()) win.setFullScreen(true); } catch (e) { __log('BUILD14_ERROR', `fullscreenOn: ${e.message}`); }
    }

    // Show window
    try { if (win.isMinimized && win.isMinimized()) win.restore(); } catch {}
    try { win.show(); } catch (e) { __log('BUILD14_ERROR', `show: ${e.message}`); }
    if (restoreFullscreen) {
      try { if (!win.isFullScreen()) win.setFullScreen(true); } catch (e) { __log('BUILD14_ERROR', `fullscreenOnAfterShow: ${e.message}`); }
    }

    // Focus window
    try { win.focus(); } catch (e) { __log('BUILD14_ERROR', `focus: ${e.message}`); }
    // Notify renderer to restore state (and merge synced progress immediately if available)
    try {
      win.webContents.send('build14:playerExited', { exitCode, signal, synced });
    } catch (e) {
      __log('BUILD14_ERROR', `send event: ${e.message}`);
    }

    // FIX16: Broadcast VIDEO_PROGRESS_UPDATED so Continue Watching updates instantly (best-effort)
    try {
      if (synced && synced.videoId) {
        const { EVENT } = require('../../../shared/ipc');
        const payload = { videoId: String(synced.videoId), progress: synced.progress || null };
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w || w.isDestroyed()) continue;
          w.webContents.send(EVENT.VIDEO_PROGRESS_UPDATED, payload);
        }
      }
    } catch {}

  } catch (e) {
    __log('BUILD14_ERROR', `restore: ${String(e && e.message ? e.message : e)}`);
  }
}

// BUILD14: State save/restore functions
async function saveReturnState(_ctx, _evt, stateData) {
  try {
    const userData = app.getPath('userData');
    const statePath = path.join(userData, 'return_state.json');
    
    const state = {
      version: 1,
      savedAt: new Date().toISOString(),
      mode: (stateData && stateData.mode) ? String(stateData.mode) : 'videos',
      showRootPath: (stateData && stateData.showRootPath) ? String(stateData.showRootPath) : '',
      currentFolderPath: (stateData && stateData.currentFolderPath) ? String(stateData.currentFolderPath) : '',
      scrollTop: Number(stateData && stateData.scrollTop) || 0,
      selectedItemId: (stateData && stateData.selectedItemId) ? String(stateData.selectedItemId) : '',
      selectedItemPath: (stateData && stateData.selectedItemPath) ? String(stateData.selectedItemPath) : '',
    };
    
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
    __log('BUILD14_HIDE_AND_PLAY', statePath);
    
    return { ok: true, statePath };
  } catch (e) {
    __log('BUILD14_ERROR', `saveReturnState: ${String(e && e.message ? e.message : e)}`);
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

async function getReturnState(_ctx, _evt) {
  try {
    const userData = app.getPath('userData');
    const statePath = path.join(userData, 'return_state.json');
    
    if (!fs.existsSync(statePath)) {
      return { ok: true, state: null };
    }
    
    const raw = fs.readFileSync(statePath, 'utf8');
    const state = JSON.parse(raw);
    
    return { ok: true, state };
  } catch (e) {
    __log('BUILD14_ERROR', `getReturnState: ${String(e && e.message ? e.message : e)}`);
    return { ok: false, error: String(e && e.message ? e.message : e), state: null };
  }
}

async function clearReturnState(_ctx, _evt) {
  try {
    const userData = app.getPath('userData');
    const statePath = path.join(userData, 'return_state.json');
    
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }
    
    return { ok: true };
  } catch (e) {
    __log('BUILD14_ERROR', `clearReturnState: ${String(e && e.message ? e.message : e)}`);
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

module.exports = {
  start,
  play,
  pause,
  seek,
  stop,
  getState,
  launchQt,
  // BUILD14: State management exports
  saveReturnState,
  getReturnState,
  clearReturnState,
};
