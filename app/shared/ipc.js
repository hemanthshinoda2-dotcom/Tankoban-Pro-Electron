/**
 * TankobanPlus — IPC Contract (Build 76, Phase 2)
 * 
 * Single source of truth for ALL IPC channel names.
 * This file is the ONLY place where IPC channel strings are defined.
 * 
 * Usage:
 *   - CHANNEL: Request channels (ipcMain.handle/on AND ipcRenderer.invoke)
 *   - EVENT: Push/event channels (webContents.send AND ipcRenderer.on)
 */

/**
 * CHANNEL — Request channels
 * Used for: ipcMain.handle(...) and ipcRenderer.invoke(...)
 */
const CHANNEL = {
  // ========================================
  // Window
  // ========================================
  
  /** Set fullscreen state. Returns: success boolean */
  WINDOW_SET_FULLSCREEN: 'window:setFullscreen',
  
  /** Toggle fullscreen state. Returns: new state boolean */
  WINDOW_TOGGLE_FULLSCREEN: 'window:toggleFullscreen',
  
  /** Get fullscreen state. Returns: boolean */
  WINDOW_IS_FULLSCREEN: 'window:isFullscreen',
  
  /** Open a book in a new window. Returns: success boolean */
  WINDOW_OPEN_BOOK_IN_NEW_WINDOW: 'window:openBookInNewWindow',
  
  /** Open video shell window. Returns: success boolean */
  WINDOW_OPEN_VIDEO_SHELL: 'window:openVideoShell',
  
  /** Minimize window. Returns: void */
  WINDOW_MINIMIZE: 'window:minimize',
  
  /** Close window. Returns: void */
  WINDOW_CLOSE: 'window:close',
  
  /** BUILD14: Hide window. Returns: void */
  WINDOW_HIDE: 'window:hide',
  
  /** BUILD14: Show window. Returns: void */
  WINDOW_SHOW: 'window:show',
  
  /** Get always-on-top state. Returns: boolean */
  WINDOW_IS_ALWAYS_ON_TOP: 'window:isAlwaysOnTop',
  
  /** Toggle always-on-top state. Returns: new state boolean */
  WINDOW_TOGGLE_ALWAYS_ON_TOP: 'window:toggleAlwaysOnTop',
  
  /** Take a screenshot. Returns: { success: boolean, path?: string } */
  WINDOW_TAKE_SCREENSHOT: 'window:takeScreenshot',
  
  /** Open subtitle file dialog. Returns: { canceled: boolean, filePath?: string } */
  WINDOW_OPEN_SUBTITLE_DIALOG: 'window:openSubtitleDialog',

  // ========================================
  // Health
  // ========================================

  /** Simple ping to check main process responsiveness */
  HEALTH_PING: 'health:ping',


  // ========================================
  // Shell
  // ========================================
  
  /** Reveal path in file explorer. Returns: void */
  SHELL_REVEAL_PATH: 'shell:revealPath',

  // ========================================
  // Clipboard
  // ========================================
  
  /** Copy text to clipboard. Returns: void */
  CLIPBOARD_WRITE_TEXT: 'clipboard:writeText',

  // ========================================
  // Library
  // ========================================
  
  /** Get library state snapshot. Returns: library state object */
  LIBRARY_GET_STATE: 'library:getState',
  
  /** Start library scan. Returns: void */
  LIBRARY_SCAN: 'library:scan',
  
  /** Cancel library scan. Returns: void */
  LIBRARY_CANCEL_SCAN: 'library:cancelScan',
  
  /** Set scan ignore patterns. Returns: void */
  LIBRARY_SET_SCAN_IGNORE: 'library:setScanIgnore',
  
  /** Add root folder via dialog. Returns: { canceled: boolean, path?: string } */
  LIBRARY_ADD_ROOT_FOLDER: 'library:addRootFolder',
  
  /** Remove root folder. Returns: void */
  LIBRARY_REMOVE_ROOT_FOLDER: 'library:removeRootFolder',
  
  /** Add series folder via dialog. Returns: { canceled: boolean, path?: string } */
  LIBRARY_ADD_SERIES_FOLDER: 'library:addSeriesFolder',
  
  /** Remove series folder. Returns: void */
  LIBRARY_REMOVE_SERIES_FOLDER: 'library:removeSeriesFolder',
  
  /** Unignore a series. Returns: void */
  LIBRARY_UNIGNORE_SERIES: 'library:unignoreSeries',
  
  /** Clear all ignored series. Returns: void */
  LIBRARY_CLEAR_IGNORED_SERIES: 'library:clearIgnoredSeries',

  // ========================================
  // Video
  // ========================================
  
  /** Get video state snapshot. Returns: video state object */
  VIDEO_GET_STATE: 'video:getState',
  
  /** Get episodes for a show. Returns: array of episode objects */
  VIDEO_GET_EPISODES_FOR_SHOW: 'video:getEpisodesForShow',
  
  /** Get episodes for a root folder. Returns: array of episode objects */
  VIDEO_GET_EPISODES_FOR_ROOT: 'video:getEpisodesForRoot',
  
  
  /** Get episode objects for a list of episode IDs. Returns: { ok, episodes } */
  VIDEO_GET_EPISODES_BY_IDS: 'video:getEpisodesByIds',
  /** Start video library scan. Returns: void */
  VIDEO_SCAN: 'video:scan',

  /** Generate auto thumbnail for a specific show. Returns: { ok, generated, reason?, path? } */
  VIDEO_GENERATE_SHOW_THUMBNAIL: 'video:generateShowThumbnail',
  
  /** Cancel video scan. Returns: void */
  VIDEO_CANCEL_SCAN: 'video:cancelScan',
  
  /** Add video folder via dialog. Returns: { canceled: boolean, path?: string } */
  VIDEO_ADD_FOLDER: 'video:addFolder',

  /** Add a single show folder (one show) via dialog. Returns: { ok: boolean, state?: object } */
  VIDEO_ADD_SHOW_FOLDER: 'video:addShowFolder',
  
  /** Remove video folder. Returns: void */
  VIDEO_REMOVE_FOLDER: 'video:removeFolder',
  
  /** Hide a video show. Returns: void */
  VIDEO_HIDE_SHOW: 'video:hideShow',
  
  /** Open video file dialog. Returns: { canceled: boolean, filePath?: string } */
  VIDEO_OPEN_FILE_DIALOG: 'video:openFileDialog',
  
  /** Open subtitle file dialog. Returns: { canceled: boolean, filePath?: string } */
  VIDEO_OPEN_SUBTITLE_FILE_DIALOG: 'video:openSubtitleFileDialog',

  
  /** Add individual video files to the video library. Returns: { ok: boolean, state?: object } */
  VIDEO_ADD_FILES: 'video:addFiles',
  
  /** Remove an individual video file from the video library. Returns: { ok: boolean, state?: object } */
  VIDEO_REMOVE_FILE: 'video:removeFile',
  
  /** Restore all hidden (removed) video shows. Returns: { ok: boolean, state?: object } */
  VIDEO_RESTORE_ALL_HIDDEN_SHOWS: 'video:restoreAllHiddenShows',
  
  /** Restore hidden (removed) video shows for a specific rootId. Returns: { ok: boolean, state?: object } */
  VIDEO_RESTORE_HIDDEN_SHOWS_FOR_ROOT: 'video:restoreHiddenShowsForRoot',

  // ========================================
  // Comic
  // ========================================
  
  /** Open comic file dialog. Returns: { canceled: boolean, filePaths?: string[] } */
  COMIC_OPEN_FILE_DIALOG: 'comic:openFileDialog',
  
  /** Get book metadata from file path. Returns: book object */
  COMIC_BOOK_FROM_PATH: 'comic:bookFromPath',

  // ========================================
  // Thumbnails
  // ========================================
  
  /** Get thumbnail for book. Returns: data URL or null */
  THUMBS_GET: 'thumbs:get',
  
  /** Delete thumbnail for book. Returns: void */
  THUMBS_DELETE: 'thumbs:delete',
  
  /** Check if thumbnail exists. Returns: boolean */
  THUMBS_HAS: 'thumbs:has',
  
  /** Save thumbnail for book. Returns: void */
  THUMBS_SAVE: 'thumbs:save',

  // ========================================
  // Video Posters
  // ========================================
  
  /** Get video poster for show. Returns: data URL or null */
  VIDEO_POSTER_GET: 'videoPoster:get',
  
  /** Check if video poster exists. Returns: boolean */
  VIDEO_POSTER_HAS: 'videoPoster:has',
  
  /** Delete video poster for show. Returns: void */
  VIDEO_POSTER_DELETE: 'videoPoster:delete',
  
  /** Save video poster for show. Returns: void */
  VIDEO_POSTER_SAVE: 'videoPoster:save',
  
  /** Paste video poster from clipboard. Returns: void */
  VIDEO_POSTER_PASTE: 'videoPoster:paste',

  // ========================================
  // Page Thumbnails
  // ========================================
  
  /** Check if page thumbnail exists. Returns: boolean */
  PAGE_THUMBS_HAS: 'pageThumbs:has',
  
  /** Get page thumbnail. Returns: data URL or null */
  PAGE_THUMBS_GET: 'pageThumbs:get',
  
  /** Save page thumbnail. Returns: void */
  PAGE_THUMBS_SAVE: 'pageThumbs:save',

  // ========================================
  // File Access
  // ========================================
  
  /** Read file contents. Returns: Buffer */
  FILE_READ: 'file:read',

  // ========================================
  // CBR (RAR archives)
  // ========================================
  
  /** Open CBR file. Returns: { sessionId: string, entryCount: number } */
  CBR_OPEN: 'cbr:open',
  
  /** Read entry from CBR. Returns: Buffer */
  CBR_READ_ENTRY: 'cbr:readEntry',
  
  /** Close CBR session. Returns: void */
  CBR_CLOSE: 'cbr:close',

  // ========================================
  // CBZ (ZIP archives)
  // ========================================
  
  /** Open CBZ file. Returns: { sessionId: string, entryCount: number } */
  CBZ_OPEN: 'cbz:open',
  
  /** Read entry from CBZ. Returns: Buffer */
  CBZ_READ_ENTRY: 'cbz:readEntry',
  
  /** Close CBZ session. Returns: void */
  CBZ_CLOSE: 'cbz:close',

  // ========================================
  // Export
  // ========================================
  
  /** Save entry to disk via dialog. Returns: { canceled: boolean, path?: string } */
  EXPORT_SAVE_ENTRY: 'export:saveEntry',
  
  /** Copy entry to clipboard. Returns: void */
  EXPORT_COPY_ENTRY: 'export:copyEntry',

  // ========================================
  // Comic Progress
  // ========================================
  
  /** Get all comic progress. Returns: object with bookId keys */
  PROGRESS_GET_ALL: 'progress:getAll',
  
  /** Get progress for a book. Returns: progress object or null */
  PROGRESS_GET: 'progress:get',
  
  /** Save progress for a book. Returns: void */
  PROGRESS_SAVE: 'progress:save',
  
  /** Clear progress for a book. Returns: void */
  PROGRESS_CLEAR: 'progress:clear',
  
  /** Clear all comic progress. Returns: void */
  PROGRESS_CLEAR_ALL: 'progress:clearAll',

  // ========================================
  // Video Progress
  // ========================================
  
  /** Get all video progress. Returns: object with videoId keys */
  VIDEO_PROGRESS_GET_ALL: 'videoProgress:getAll',
  
  /** Get progress for a video. Returns: progress object or null */
  VIDEO_PROGRESS_GET: 'videoProgress:get',
  
  /** Save progress for a video. Returns: void */
  VIDEO_PROGRESS_SAVE: 'videoProgress:save',
  
  /** Clear progress for a video. Returns: void */
  VIDEO_PROGRESS_CLEAR: 'videoProgress:clear',
  
  /** Clear all video progress. Returns: void */
  VIDEO_PROGRESS_CLEAR_ALL: 'videoProgress:clearAll',

  // ========================================
  // Video Settings
  // ========================================
  
  /** Get video settings. Returns: settings object */
  VIDEO_SETTINGS_GET: 'videoSettings:get',
  
  /** Save video settings. Returns: void */
  VIDEO_SETTINGS_SAVE: 'videoSettings:save',
  
  /** Clear video settings. Returns: void */
  VIDEO_SETTINGS_CLEAR: 'videoSettings:clear',

  // ========================================
  // Video UI State
  // ========================================
  
  /** Get video UI state. Returns: UI state object */
  VIDEO_UI_GET: 'videoUi:get',
  
  /** Save video UI state. Returns: void */
  VIDEO_UI_SAVE: 'videoUi:save',
  
  /** Clear video UI state. Returns: void */
  VIDEO_UI_CLEAR: 'videoUi:clear',

  // ========================================
  // mpv (external process bridge)
  // ========================================
  
  /** Check if mpv is available. Returns: boolean */
  MPV_IS_AVAILABLE: 'mpv:isAvailable',
  
  /** Create mpv player instance. Returns: { playerId: string } */
  MPV_CREATE: 'mpv:create',
  
  /** Destroy mpv player. Returns: void */
  MPV_DESTROY: 'mpv:destroy',
  
  /** Load file in mpv. Returns: void */
  MPV_LOAD: 'mpv:load',
  
  /** Send command to mpv. Returns: void */
  MPV_COMMAND: 'mpv:command',
  
  /** Set mpv property. Returns: void */
  MPV_SET_PROPERTY: 'mpv:setProperty',
  
  /** Observe mpv property. Returns: void */
  MPV_OBSERVE_PROPERTY: 'mpv:observeProperty',
  
  /** Set mpv player bounds. Returns: void */
  MPV_SET_BOUNDS: 'mpv:setBounds',
  
  /** Set mpv player visibility. Returns: void */
  MPV_SET_VISIBLE: 'mpv:setVisible',

  // ========================================
  // libmpv (native addon bridge)
  // ========================================
  
  /** Probe libmpv availability. Returns: { available: boolean } */
  LIBMPV_PROBE: 'libmpv:probe',
  
  /** Create libmpv instance. Returns: { handleId: string } */
  LIBMPV_CREATE: 'libmpv:create',
  
  /** Create renderless libmpv instance. Returns: { handleId: string } */
  LIBMPV_CREATE_RENDERLESS: 'libmpv:createRenderless',
  
  /** Destroy libmpv instance. Returns: void */
  LIBMPV_DESTROY: 'libmpv:destroy',
  
  /** Send command to libmpv. Returns: void */
  LIBMPV_COMMAND: 'libmpv:command',
  
  /** Set libmpv property as string. Returns: void */
  LIBMPV_SET_PROPERTY_STRING: 'libmpv:setPropertyString',
  
  /** Get libmpv property as string. Returns: string value */
  LIBMPV_GET_PROPERTY_STRING: 'libmpv:getPropertyString',
  
  /** Create render context. Returns: void */
  LIBMPV_RENDER_CREATE_CONTEXT: 'libmpv:renderCreateContext',
  
  /** Free render context. Returns: void */
  LIBMPV_RENDER_FREE_CONTEXT: 'libmpv:renderFreeContext',
  
  /** Render frame to RGBA. Returns: { buffer: Buffer, width: number, height: number } */
  LIBMPV_RENDER_FRAME_RGBA: 'libmpv:renderFrameRGBA',
  
  /** Attach shared buffer for rendering. Returns: void */
  LIBMPV_RENDER_ATTACH_SHARED_BUFFER: 'libmpv:renderAttachSharedBuffer',
  
  /** Detach shared buffer. Returns: void */
  LIBMPV_RENDER_DETACH_SHARED_BUFFER: 'libmpv:renderDetachSharedBuffer',
  
  /** Render to shared buffer. Returns: void */
  LIBMPV_RENDER_TO_SHARED_BUFFER: 'libmpv:renderToSharedBuffer',
  
  /** Enable render update events. Returns: void */
  LIBMPV_RENDER_ENABLE_UPDATE_EVENTS: 'libmpv:renderEnableUpdateEvents',
  
  /** Disable render update events. Returns: void */
  LIBMPV_RENDER_DISABLE_UPDATE_EVENTS: 'libmpv:renderDisableUpdateEvents',
  
  /** Create embedded libmpv instance. Returns: { handleId: string } */
  LIBMPV_CREATE_EMBEDDED: 'libmpv:createEmbedded',
  
  /** Set libmpv bounds. Returns: void */
  LIBMPV_SET_BOUNDS: 'libmpv:setBounds',
  
  /** Set libmpv visibility. Returns: void */
  LIBMPV_SET_VISIBLE: 'libmpv:setVisible',

  // ========================================
  // Player Core (Tankoban Pro)
  // ========================================

  /** Start playback session. Args: mediaRef, opts. Returns: { ok, state? } */
  PLAYER_START: 'player:start',

  /** Play/resume. Returns: { ok, state? } */
  PLAYER_PLAY: 'player:play',

  /** Pause. Returns: { ok, state? } */
  PLAYER_PAUSE: 'player:pause',

  /** Seek to absolute position (seconds or milliseconds). Returns: { ok, state? } */
  PLAYER_SEEK: 'player:seek',

  /** Stop playback. Args: reason?. Returns: { ok, state? } */
  PLAYER_STOP: 'player:stop',

  /** Get current Player Core state. Returns: { ok, state } */
  PLAYER_GET_STATE: 'player:getState',

  /** Launch external Qt player. Args: { filePath, startSeconds, sessionId, progressFile }. Returns: { ok } */
  PLAYER_LAUNCH_QT: 'player:launchQt',

  // ========================================
  // BUILD14: State Save/Restore for Hide-on-Play
  // ========================================

  /** Save return state before hiding. Args: { mode, showRootPath, currentFolderPath, scrollTop, selectedItemId, selectedItemPath }. Returns: { ok, statePath } */
  BUILD14_SAVE_RETURN_STATE: 'build14:saveReturnState',

  /** Get saved return state. Returns: { ok, state } */
  BUILD14_GET_RETURN_STATE: 'build14:getReturnState',

  /** Clear saved return state. Returns: { ok } */
  BUILD14_CLEAR_RETURN_STATE: 'build14:clearReturnState',

  // ========================================
  // Series Settings
  // ========================================
  
  /** Get all series settings. Returns: object with seriesId keys */
  SERIES_SETTINGS_GET_ALL: 'seriesSettings:getAll',
  
  /** Get settings for a series. Returns: settings object or null */
  SERIES_SETTINGS_GET: 'seriesSettings:get',
  
  /** Save settings for a series. Returns: void */
  SERIES_SETTINGS_SAVE: 'seriesSettings:save',
  
  /** Clear settings for a series. Returns: void */
  SERIES_SETTINGS_CLEAR: 'seriesSettings:clear',
};

/**
 * EVENT — Push/event channels
 * Used for: webContents.send(...) and ipcRenderer.on(...)
 */
const EVENT = {
  // ========================================
  // Library Events
  // ========================================
  
  /** Library state has been updated. Payload: library state object */
  LIBRARY_UPDATED: 'library:updated',
  
  /** Library scan status update. Payload: { scanning: boolean, progress?: object } */
  LIBRARY_SCAN_STATUS: 'library:scanStatus',

  // ========================================
  // App Events
  // ========================================
  
  /** App received open files event. Payload: { paths: string[], source: string } */
  APP_OPEN_FILES: 'app:openFiles',

  // ========================================
  // Video Events
  // ========================================
  
  /** Video state has been updated. Payload: video state object */
  VIDEO_UPDATED: 'video:updated',

  /** Video progress updated (save/clear). Payload: { videoId: string, progress: object|null } or { allCleared: true } */
  VIDEO_PROGRESS_UPDATED: 'videoProgress:updated',
  
  /** Video shell should play content. Payload: play configuration object */
  VIDEO_SHELL_PLAY: 'videoShell:play',
  
  /** Video scan status update. Payload: { scanning: boolean, progress?: object } */
  VIDEO_SCAN_STATUS: 'video:scanStatus',

  // ========================================
  // Dynamic/Templated Events
  // ========================================
  
  /**
   * mpv event channel (dynamic per player).
   * @param {string} playerId - The mpv player ID
   * @returns {string} Channel name like 'mpv:event:player_1'
   */
  mpvEvent: (playerId) => `mpv:event:${playerId}`,
  
  /**
   * libmpv render update event (dynamic per handle).
   * @param {string|number} handleId - The libmpv handle ID
   * @returns {string} Channel name like 'libmpv:renderUpdate:42'
   */
  libmpvRenderUpdate: (handleId) => `libmpv:renderUpdate:${handleId}`,
};

// Export as CommonJS for Build 74/75 compatibility
module.exports = {
  CHANNEL,
  EVENT,
};
