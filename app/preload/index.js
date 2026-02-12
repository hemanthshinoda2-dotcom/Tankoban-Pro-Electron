/**
 * TankobanPlus — Preload API (Build 79, Phase 5)
 * 
 * OWNERSHIP: Unified preload bridge with organized namespaces.
 * Exposes electronAPI to renderer with:
 * - Grouped namespaces (window.*, shell.*, library.*, etc.)
 * - Full legacy alias layer for backward compatibility
 * 
 * Phase 5 Goals:
 * - Organize API surface into logical namespaces
 * - Preserve 100% backward compatibility via legacy aliases
 * - Use IPC contract (CHANNEL/EVENT) exclusively
 */

const { contextBridge, ipcRenderer } = require('electron');
const { CHANNEL, EVENT } = require('../shared/ipc');

// ========================================
// GROUPED API IMPLEMENTATION
// ========================================

const api = {
  // ========================================
  // window.*
  // ========================================
  window: {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    isFullscreen: () => ipcRenderer.invoke(CHANNEL.WINDOW_IS_FULLSCREEN),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    toggleFullscreen: () => ipcRenderer.invoke(CHANNEL.WINDOW_TOGGLE_FULLSCREEN),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    setFullscreen: (v) => ipcRenderer.invoke(CHANNEL.WINDOW_SET_FULLSCREEN, v),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    isAlwaysOnTop: () => ipcRenderer.invoke(CHANNEL.WINDOW_IS_ALWAYS_ON_TOP),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    toggleAlwaysOnTop: () => ipcRenderer.invoke(CHANNEL.WINDOW_TOGGLE_ALWAYS_ON_TOP),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    takeScreenshot: () => ipcRenderer.invoke(CHANNEL.WINDOW_TAKE_SCREENSHOT),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    openSubtitleDialog: () => ipcRenderer.invoke(CHANNEL.WINDOW_OPEN_SUBTITLE_DIALOG),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    minimize: () => ipcRenderer.invoke(CHANNEL.WINDOW_MINIMIZE),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    close: () => ipcRenderer.invoke(CHANNEL.WINDOW_CLOSE),
  // BUILD14: Window hide/show
    hide: () => ipcRenderer.invoke(CHANNEL.WINDOW_HIDE),
    show: () => ipcRenderer.invoke(CHANNEL.WINDOW_SHOW),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    openBookInNewWindow: (bookId) => ipcRenderer.invoke(CHANNEL.WINDOW_OPEN_BOOK_IN_NEW_WINDOW, bookId),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    openVideoShell: (payload) => ipcRenderer.invoke(CHANNEL.WINDOW_OPEN_VIDEO_SHELL, payload),
  },

  // ========================================
  // shell.*
  // ========================================
  shell: {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    revealPath: (path) => ipcRenderer.invoke(CHANNEL.SHELL_REVEAL_PATH, path),
  },

  // ========================================
  // library.*
  // ========================================
  library: {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    getState: () => ipcRenderer.invoke(CHANNEL.LIBRARY_GET_STATE),
    
    onUpdated: (cb) => {
      if (typeof cb !== 'function') return;
      ipcRenderer.on(EVENT.LIBRARY_UPDATED, (_evt, state) => cb(state));
    },

    onScanStatus: (cb) => {
      if (typeof cb !== 'function') return;
      ipcRenderer.on(EVENT.LIBRARY_SCAN_STATUS, (_evt, s) => cb(s));
    },

  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    scan: (opts) => ipcRenderer.invoke(CHANNEL.LIBRARY_SCAN, opts),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    cancelScan: () => ipcRenderer.invoke(CHANNEL.LIBRARY_CANCEL_SCAN),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    setScanIgnore: (patterns) => ipcRenderer.invoke(CHANNEL.LIBRARY_SET_SCAN_IGNORE, patterns),

  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    addRootFolder: () => ipcRenderer.invoke(CHANNEL.LIBRARY_ADD_ROOT_FOLDER),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    addSeriesFolder: () => ipcRenderer.invoke(CHANNEL.LIBRARY_ADD_SERIES_FOLDER),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    removeSeriesFolder: (folder) => ipcRenderer.invoke(CHANNEL.LIBRARY_REMOVE_SERIES_FOLDER, folder),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    removeRootFolder: (rootPath) => ipcRenderer.invoke(CHANNEL.LIBRARY_REMOVE_ROOT_FOLDER, rootPath),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    unignoreSeries: (folder) => ipcRenderer.invoke(CHANNEL.LIBRARY_UNIGNORE_SERIES, folder),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    clearIgnoredSeries: () => ipcRenderer.invoke(CHANNEL.LIBRARY_CLEAR_IGNORED_SERIES),
    
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    openComicFileDialog: () => ipcRenderer.invoke(CHANNEL.COMIC_OPEN_FILE_DIALOG),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    bookFromPath: (filePath) => ipcRenderer.invoke(CHANNEL.COMIC_BOOK_FROM_PATH, filePath),

    onAppOpenFiles: (cb) => {
      if (typeof cb !== 'function') return () => {};
      const handler = (_evt, payload) => cb(payload);
      ipcRenderer.on(EVENT.APP_OPEN_FILES, handler);
      return () => ipcRenderer.removeListener(EVENT.APP_OPEN_FILES, handler);
    },
  },

  // ========================================
  // video.*
  // ========================================
  video: {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    getState: (opts) => ipcRenderer.invoke(CHANNEL.VIDEO_GET_STATE, opts),
    
    onUpdated: (cb) => {
      if (typeof cb !== 'function') return;
      ipcRenderer.on(EVENT.VIDEO_UPDATED, (_evt, state) => cb(state));
    },

    onShellPlay: (cb) => {
      if (typeof cb !== 'function') return;
      ipcRenderer.on(EVENT.VIDEO_SHELL_PLAY, (_evt, payload) => cb(payload));
    },

    onScanStatus: (cb) => {
      if (typeof cb !== 'function') return;
      ipcRenderer.on(EVENT.VIDEO_SCAN_STATUS, (_evt, s) => cb(s));
    },

  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    scan: (opts) => ipcRenderer.invoke(CHANNEL.VIDEO_SCAN, opts),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    generateShowThumbnail: (showId, opts) => ipcRenderer.invoke(CHANNEL.VIDEO_GENERATE_SHOW_THUMBNAIL, showId, opts),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    cancelScan: () => ipcRenderer.invoke(CHANNEL.VIDEO_CANCEL_SCAN),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    addFolder: () => ipcRenderer.invoke(CHANNEL.VIDEO_ADD_FOLDER),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    addShowFolder: () => ipcRenderer.invoke(CHANNEL.VIDEO_ADD_SHOW_FOLDER),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    removeFolder: (folderPath) => ipcRenderer.invoke(CHANNEL.VIDEO_REMOVE_FOLDER, folderPath),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    hideShow: (showId) => ipcRenderer.invoke(CHANNEL.VIDEO_HIDE_SHOW, showId),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    openFileDialog: () => ipcRenderer.invoke(CHANNEL.VIDEO_OPEN_FILE_DIALOG),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    openSubtitleFileDialog: () => ipcRenderer.invoke(CHANNEL.VIDEO_OPEN_SUBTITLE_FILE_DIALOG),
    
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    addFiles: () => ipcRenderer.invoke(CHANNEL.VIDEO_ADD_FILES),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    removeFile: (filePath) => ipcRenderer.invoke(CHANNEL.VIDEO_REMOVE_FILE, filePath),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    restoreAllHiddenShows: () => ipcRenderer.invoke(CHANNEL.VIDEO_RESTORE_ALL_HIDDEN_SHOWS),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    restoreHiddenShowsForRoot: (rootId) => ipcRenderer.invoke(CHANNEL.VIDEO_RESTORE_HIDDEN_SHOWS_FOR_ROOT, rootId),

  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    getEpisodesForShow: (showId) => ipcRenderer.invoke(CHANNEL.VIDEO_GET_EPISODES_FOR_SHOW, showId),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    getEpisodesForRoot: (rootId) => ipcRenderer.invoke(CHANNEL.VIDEO_GET_EPISODES_FOR_ROOT, rootId),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    getEpisodesByIds: (ids) => ipcRenderer.invoke(CHANNEL.VIDEO_GET_EPISODES_BY_IDS, ids),
  },

  // ========================================
  // thumbs.*
  // ========================================
  thumbs: {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    has: (bookId) => ipcRenderer.invoke(CHANNEL.THUMBS_HAS, bookId),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    get: (bookId) => ipcRenderer.invoke(CHANNEL.THUMBS_GET, bookId),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    save: (bookId, dataUrl) => ipcRenderer.invoke(CHANNEL.THUMBS_SAVE, bookId, dataUrl),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    delete: (bookId) => ipcRenderer.invoke(CHANNEL.THUMBS_DELETE, bookId),

    // page thumbs
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    hasPage: (bookId, pageIndex) => ipcRenderer.invoke(CHANNEL.PAGE_THUMBS_HAS, bookId, pageIndex),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    getPage: (bookId, pageIndex) => ipcRenderer.invoke(CHANNEL.PAGE_THUMBS_GET, bookId, pageIndex),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    savePage: (bookId, pageIndex, dataUrl) => ipcRenderer.invoke(CHANNEL.PAGE_THUMBS_SAVE, bookId, pageIndex, dataUrl),
  },

  // ========================================
  // archives.*
  // ========================================
  archives: {
    // CBZ
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    cbzOpen: (filePath) => ipcRenderer.invoke(CHANNEL.CBZ_OPEN, filePath),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    cbzReadEntry: (sessionId, entryIndex) => ipcRenderer.invoke(CHANNEL.CBZ_READ_ENTRY, sessionId, entryIndex),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    cbzClose: (sessionId) => ipcRenderer.invoke(CHANNEL.CBZ_CLOSE, sessionId),

    // CBR
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    cbrOpen: (filePath) => ipcRenderer.invoke(CHANNEL.CBR_OPEN, filePath),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    cbrReadEntry: (sessionId, entryIndex) => ipcRenderer.invoke(CHANNEL.CBR_READ_ENTRY, sessionId, entryIndex),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    cbrClose: (sessionId) => ipcRenderer.invoke(CHANNEL.CBR_CLOSE, sessionId),
  },

  // ========================================
  // export.*
  // ========================================
  export: {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    saveEntry: (payload) => ipcRenderer.invoke(CHANNEL.EXPORT_SAVE_ENTRY, payload),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    copyEntry: (payload) => ipcRenderer.invoke(CHANNEL.EXPORT_COPY_ENTRY, payload),
  },

  // ========================================
  // files.*
  // ========================================
  files: {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    read: (path) => ipcRenderer.invoke(CHANNEL.FILE_READ, path),
  },

  // ========================================
  // clipboard.*
  // ========================================
  clipboard: {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    copyText: (text) => ipcRenderer.invoke(CHANNEL.CLIPBOARD_WRITE_TEXT, text),
  },

  // ========================================
  // progress.*
  // ========================================
  progress: {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    getAll: () => ipcRenderer.invoke(CHANNEL.PROGRESS_GET_ALL),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    get: (bookId) => ipcRenderer.invoke(CHANNEL.PROGRESS_GET, bookId),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    save: (bookId, progress) => ipcRenderer.invoke(CHANNEL.PROGRESS_SAVE, bookId, progress),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    clear: (bookId) => ipcRenderer.invoke(CHANNEL.PROGRESS_CLEAR, bookId),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    clearAll: () => ipcRenderer.invoke(CHANNEL.PROGRESS_CLEAR_ALL),
  },

  // ========================================
  // videoProgress.*
  // ========================================
  videoProgress: {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    getAll: () => ipcRenderer.invoke(CHANNEL.VIDEO_PROGRESS_GET_ALL),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    get: (videoId) => ipcRenderer.invoke(CHANNEL.VIDEO_PROGRESS_GET, videoId),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    save: (videoId, progress) => ipcRenderer.invoke(CHANNEL.VIDEO_PROGRESS_SAVE, videoId, progress),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    clear: (videoId) => ipcRenderer.invoke(CHANNEL.VIDEO_PROGRESS_CLEAR, videoId),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    clearAll: () => ipcRenderer.invoke(CHANNEL.VIDEO_PROGRESS_CLEAR_ALL),
    onUpdated: (cb) => {
      if (typeof cb !== 'function') return;
      ipcRenderer.on(EVENT.VIDEO_PROGRESS_UPDATED, (_evt, payload) => cb(payload));
    },
  },

  // ========================================
  // videoSettings.*
  // ========================================
  videoSettings: {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    get: () => ipcRenderer.invoke(CHANNEL.VIDEO_SETTINGS_GET),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    save: (settings) => ipcRenderer.invoke(CHANNEL.VIDEO_SETTINGS_SAVE, settings),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    clear: () => ipcRenderer.invoke(CHANNEL.VIDEO_SETTINGS_CLEAR),
  },

  // ========================================
  // videoUi.*
  // ========================================
  videoUi: {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    getState: () => ipcRenderer.invoke(CHANNEL.VIDEO_UI_GET),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    saveState: (ui) => ipcRenderer.invoke(CHANNEL.VIDEO_UI_SAVE, ui),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    clearState: () => ipcRenderer.invoke(CHANNEL.VIDEO_UI_CLEAR),
  },

  // ========================================
  // videoPoster.*
  // ========================================
  videoPoster: {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    get: (showId) => ipcRenderer.invoke(CHANNEL.VIDEO_POSTER_GET, showId),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    has: (showId) => ipcRenderer.invoke(CHANNEL.VIDEO_POSTER_HAS, showId),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    save: (showId, dataUrl) => ipcRenderer.invoke(CHANNEL.VIDEO_POSTER_SAVE, showId, dataUrl),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    delete: (showId) => ipcRenderer.invoke(CHANNEL.VIDEO_POSTER_DELETE, showId),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    paste: (showId) => ipcRenderer.invoke(CHANNEL.VIDEO_POSTER_PASTE, showId),
  },

  // ========================================
  // seriesSettings.*
  // ========================================
  seriesSettings: {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    get: (seriesId) => ipcRenderer.invoke(CHANNEL.SERIES_SETTINGS_GET, seriesId),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    save: (seriesId, settings) => ipcRenderer.invoke(CHANNEL.SERIES_SETTINGS_SAVE, seriesId, settings),
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
    clear: (seriesId) => ipcRenderer.invoke(CHANNEL.SERIES_SETTINGS_CLEAR, seriesId),
  },



// ========================================
// player.*
// ========================================
player: {
  start: async (mediaRef, opts) => {
    try {
      const res = await ipcRenderer.invoke(CHANNEL.PLAYER_START, mediaRef || null, (opts && typeof opts === 'object') ? opts : null);
      return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  },
  play: async () => {
    try {
      const res = await ipcRenderer.invoke(CHANNEL.PLAYER_PLAY);
      return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  },
  pause: async () => {
    try {
      const res = await ipcRenderer.invoke(CHANNEL.PLAYER_PAUSE);
      return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  },
  seek: async (secondsOrMs) => {
    try {
      const res = await ipcRenderer.invoke(CHANNEL.PLAYER_SEEK, secondsOrMs);
      return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  },
  stop: async (reason) => {
    try {
      const res = await ipcRenderer.invoke(CHANNEL.PLAYER_STOP, reason == null ? '' : String(reason));
      return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  },
  launchQt: async (args) => {
    try {
      const res = await ipcRenderer.invoke(CHANNEL.PLAYER_LAUNCH_QT, (args && typeof args === 'object') ? args : null);
      return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  },
  getState: async () => {
    try {
      const res = await ipcRenderer.invoke(CHANNEL.PLAYER_GET_STATE);
      return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  },
},

  // ========================================
  // build14.* (State Save/Restore for Hide-on-Play)
  // ========================================
  build14: {
    saveReturnState: async (stateData) => {
      try {
        const res = await ipcRenderer.invoke(CHANNEL.BUILD14_SAVE_RETURN_STATE, stateData || null);
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },
    getReturnState: async () => {
      try {
        const res = await ipcRenderer.invoke(CHANNEL.BUILD14_GET_RETURN_STATE);
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },
    clearReturnState: async () => {
      try {
        const res = await ipcRenderer.invoke(CHANNEL.BUILD14_CLEAR_RETURN_STATE);
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },
  },

  // ========================================
  // mpv.*
  // ========================================
  mpv: {
    isAvailable: async (opts) => {
      const detailed = !!(opts && typeof opts === 'object' && opts.detailed);
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.MPV_IS_AVAILABLE);
        if (detailed) {
          return (res && typeof res === 'object')
            ? res
            : { ok: true, available: false, error: 'Invalid response', path: null, source: null };
        }
        return !!(res && res.ok && res.available);
      } catch (e) {
        if (detailed) {
          return { ok: true, available: false, error: String(e && e.message ? e.message : e), path: null, source: null };
        }
        return false;
      }
    },

    create: async () => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.MPV_CREATE);
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    destroy: async (playerId) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.MPV_DESTROY, String(playerId || ''));
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    load: async (playerId, filePath) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.MPV_LOAD, String(playerId || ''), String(filePath || ''));
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    command: async (playerId, args) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.MPV_COMMAND, String(playerId || ''), args || []);
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    setProperty: async (playerId, name, value) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.MPV_SET_PROPERTY, String(playerId || ''), String(name || ''), value);
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    observeProperty: async (playerId, name) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.MPV_OBSERVE_PROPERTY, String(playerId || ''), String(name || ''));
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    onEvent: (playerId, handler) => {
      if (typeof handler !== 'function') return () => {};
      const pid = String(playerId || '');
      const channel = EVENT.mpvPlayerEvent(pid);
      const fn = (_evt, payload) => {
        try { handler(payload); } catch {}
      };
      ipcRenderer.on(channel, fn);
      return () => {
        try { ipcRenderer.removeListener(channel, fn); } catch {}
      };
    },

    probe: async (filePath) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.MPV_PROBE, String(filePath || ''));
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },
  },

  // ========================================
  // libmpv.*
  // ========================================
  libmpv: {
    probe: async () => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_PROBE);
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    create: async () => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_CREATE);
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    createRenderless: async () => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_CREATE_RENDERLESS);
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    destroy: async (handleId) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_DESTROY, String(handleId || ''));
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    command: async (handleId, args) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_COMMAND, String(handleId || ''), args || []);
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    setPropertyString: async (handleId, name, value) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_SET_PROPERTY_STRING, String(handleId || ''), String(name || ''), String(value || ''));
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    getPropertyString: async (handleId, name) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_GET_PROPERTY_STRING, String(handleId || ''), String(name || ''));
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    renderCreateContext: async (handleId) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_RENDER_CREATE_CONTEXT, String(handleId || ''));
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    renderFreeContext: async (handleId) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_RENDER_FREE_CONTEXT, String(handleId || ''));
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    renderFrameRGBA: async (handleId, width, height) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_RENDER_FRAME_RGBA, String(handleId || ''), Number(width || 0), Number(height || 0));
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    renderAttachSharedBuffer: async (handleId, sharedBuffer, width, height) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_RENDER_ATTACH_SHARED_BUFFER, String(handleId || ''), sharedBuffer, Number(width || 0), Number(height || 0));
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    renderDetachSharedBuffer: async (handleId) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_RENDER_DETACH_SHARED_BUFFER, String(handleId || ''));
        return (res && typeof res === 'object') ? res : { ok: true };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    renderToSharedBuffer: async (handleId) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_RENDER_TO_SHARED_BUFFER, String(handleId || ''));
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    renderEnableUpdateEvents: async (handleId) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_RENDER_ENABLE_UPDATE_EVENTS, String(handleId || ''));
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    renderDisableUpdateEvents: async (handleId) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_RENDER_DISABLE_UPDATE_EVENTS, String(handleId || ''));
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    onRenderUpdate: (handleId, handler) => {
      if (typeof handler !== 'function') return () => {};
      const hid = String(handleId || '');
      const channel = EVENT.libmpvRenderUpdate(hid);
      const fn = (_evt, payload) => {
        try { handler(payload); } catch {}
      };
      ipcRenderer.on(channel, fn);
      return () => {
        try { ipcRenderer.removeListener(channel, fn); } catch {}
      };
    },

    createEmbedded: async (bounds) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_CREATE_EMBEDDED, bounds || {});
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    setBounds: async (handleId, bounds) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_SET_BOUNDS, String(handleId || ''), bounds || {});
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    setVisible: async (handleId, visible) => {
      try {
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
        const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_SET_VISIBLE, String(handleId || ''), !!visible);
        return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },
  },
};

// ========================================
// LEGACY ALIASES (100% BACKWARD COMPATIBILITY)
// ========================================

const legacy = {
  // window
  isFullscreen: (...args) => api.window.isFullscreen(...args),
  toggleFullscreen: (...args) => api.window.toggleFullscreen(...args),
  setFullscreen: (...args) => api.window.setFullscreen(...args),
  isAlwaysOnTop: (...args) => api.window.isAlwaysOnTop(...args),
  toggleAlwaysOnTop: (...args) => api.window.toggleAlwaysOnTop(...args),
  takeScreenshot: (...args) => api.window.takeScreenshot(...args),
  openSubtitleDialog: (...args) => api.window.openSubtitleDialog(...args),
  minimize: (...args) => api.window.minimize(...args),
  close: (...args) => api.window.close(...args),
  openBookInNewWindow: (...args) => api.window.openBookInNewWindow(...args),
  openVideoShell: (...args) => api.window.openVideoShell(...args),

  // shell
  revealPath: (...args) => api.shell.revealPath(...args),

  // library
  getLibraryState: (...args) => api.library.getState(...args),
  onLibraryUpdated: (...args) => api.library.onUpdated(...args),
  onLibraryScanStatus: (...args) => api.library.onScanStatus(...args),
  scanLibrary: (...args) => api.library.scan(...args),
  cancelLibraryScan: (...args) => api.library.cancelScan(...args),
  setLibraryScanIgnore: (...args) => api.library.setScanIgnore(...args),
  addRootFolder: (...args) => api.library.addRootFolder(...args),
  addSeriesFolder: (...args) => api.library.addSeriesFolder(...args),
  removeSeriesFolder: (...args) => api.library.removeSeriesFolder(...args),
  removeRootFolder: (...args) => api.library.removeRootFolder(...args),
  unignoreSeries: (...args) => api.library.unignoreSeries(...args),
  clearIgnoredSeries: (...args) => api.library.clearIgnoredSeries(...args),
  openComicFileDialog: (...args) => api.library.openComicFileDialog(...args),
  bookFromPath: (...args) => api.library.bookFromPath(...args),
  onAppOpenFiles: (...args) => api.library.onAppOpenFiles(...args),

  // video
  getVideoState: (...args) => api.video.getState(...args),
  onVideoUpdated: (...args) => api.video.onUpdated(...args),
  onVideoShellPlay: (...args) => api.video.onShellPlay(...args),
  onVideoScanStatus: (...args) => api.video.onScanStatus(...args),
  scanVideoLibrary: (...args) => api.video.scan(...args),
  cancelVideoScan: (...args) => api.video.cancelScan(...args),
  addVideoFolder: (...args) => api.video.addFolder(...args),
  removeVideoFolder: (...args) => api.video.removeFolder(...args),
  hideVideoShow: (...args) => api.video.hideShow(...args),
  openVideoFileDialog: (...args) => api.video.openFileDialog(...args),
  openSubtitleFileDialog: (...args) => api.video.openSubtitleFileDialog(...args),
  getEpisodesForShow: (...args) => api.video.getEpisodesForShow(...args),
  getEpisodesForRoot: (...args) => api.video.getEpisodesForRoot(...args),
  generateVideoShowThumbnail: (...args) => api.video.generateShowThumbnail(...args),

  // thumbs
  hasThumb: (...args) => api.thumbs.has(...args),
  getThumb: (...args) => api.thumbs.get(...args),
  saveThumb: (...args) => api.thumbs.save(...args),
  deleteThumb: (...args) => api.thumbs.delete(...args),
  hasPageThumb: (...args) => api.thumbs.hasPage(...args),
  getPageThumb: (...args) => api.thumbs.getPage(...args),
  savePageThumb: (...args) => api.thumbs.savePage(...args),

  // archives
  cbzOpen: (...args) => api.archives.cbzOpen(...args),
  cbzReadEntry: (...args) => api.archives.cbzReadEntry(...args),
  cbzClose: (...args) => api.archives.cbzClose(...args),
  cbrOpen: (...args) => api.archives.cbrOpen(...args),
  cbrReadEntry: (...args) => api.archives.cbrReadEntry(...args),
  cbrClose: (...args) => api.archives.cbrClose(...args),

  // export
  exportSaveEntry: (...args) => api.export.saveEntry(...args),
  exportCopyEntry: (...args) => api.export.copyEntry(...args),

  // files
  readFile: (...args) => api.files.read(...args),

  // clipboard
  copyText: (...args) => api.clipboard.copyText(...args),

  // progress
  getAllProgress: (...args) => api.progress.getAll(...args),
  getProgress: (...args) => api.progress.get(...args),
  saveProgress: (...args) => api.progress.save(...args),
  clearProgress: (...args) => api.progress.clear(...args),
  clearAllProgress: (...args) => api.progress.clearAll(...args),

  // videoProgress
  getAllVideoProgress: (...args) => api.videoProgress.getAll(...args),
  getVideoProgress: (...args) => api.videoProgress.get(...args),
  saveVideoProgress: (...args) => api.videoProgress.save(...args),
  clearVideoProgress: (...args) => api.videoProgress.clear(...args),
  clearAllVideoProgress: (...args) => api.videoProgress.clearAll(...args),

  // videoSettings
  getVideoSettings: (...args) => api.videoSettings.get(...args),
  saveVideoSettings: (...args) => api.videoSettings.save(...args),
  clearVideoSettings: (...args) => api.videoSettings.clear(...args),

  // videoUi
  getVideoUiState: (...args) => api.videoUi.getState(...args),
  saveVideoUiState: (...args) => api.videoUi.saveState(...args),
  clearVideoUiState: (...args) => api.videoUi.clearState(...args),

  // videoPoster
  getVideoPoster: (...args) => api.videoPoster.get(...args),
  hasVideoPoster: (...args) => api.videoPoster.has(...args),
  saveVideoPoster: (...args) => api.videoPoster.save(...args),
  deleteVideoPoster: (...args) => api.videoPoster.delete(...args),
  pasteVideoPoster: (...args) => api.videoPoster.paste(...args),

  // seriesSettings
  getSeriesSettings: (...args) => api.seriesSettings.get(...args),
  saveSeriesSettings: (...args) => api.seriesSettings.save(...args),
  clearSeriesSettings: (...args) => api.seriesSettings.clear(...args),
  
  // BUILD 88 FIX 3.2: Health check ping
  // TRACE:IPC_OUT ipcRenderer.invoke @ index.js
  ping: () => ipcRenderer.invoke(CHANNEL.HEALTH_PING),
};

// ========================================
// EXPOSE TO RENDERER
// ========================================

// Merge grouped namespaces with legacy aliases
// This ensures both api.video.getState() and legacy getVideoState() work
const exposed = Object.assign({}, api, legacy);

// BUILD14: Add event listener support
exposed._setupBuild14EventForwarding = () => {
  // Set up IPC listener that will be called from the isolated preload
  ipcRenderer.on('build14:playerExited', (_evt, payload) => {
    try {
      // This callback executes in the preload's isolated context
      // We need to send it to the renderer via a mechanism that works with contextIsolation
      // The only way is to include a callback in the exposed API
      if (exposed._build14PlayerExitedCallback) {
        exposed._build14PlayerExitedCallback(payload);
      }
    } catch (e) {
      console.error('[BUILD14 Preload] Failed to forward playerExited event:', e);
    }
  });
};

exposed._registerBuild14Callback = (callback) => {
  exposed._build14PlayerExitedCallback = callback;
};

contextBridge.exposeInMainWorld('electronAPI', exposed);

// Set up the IPC listener immediately
exposed._setupBuild14EventForwarding();
