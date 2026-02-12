/**
 * TankobanPlus — Renderer API Gateway (Build 80, Phase 6)
 * 
  // TRACE:IPC_OUT * OWNERSHIP: Gateway abstraction over window.electronAPI.
 * OWNERSHIP: Gateway abstraction over window.electronAPI.
 * This is the ONLY renderer file allowed to touch window.electronAPI directly.
 * All other renderer code must use Tanko.api.* instead.
 * 
 * Phase 6 Goals:
 * - Create single point of control for renderer->preload communication
 * - Enable future evolution (migration to contextBridge alternatives, etc.)
 * - Maintain 100% compatibility with preload API surface
 * 
 * HARD RULE: This file must not contain:
 * - DOM manipulation
 * - UI logic
 * - Application state
 * - Any logic beyond thin wrappers
 */

(function() {
  'use strict';

  // Reference to the preload-exposed API
  const ea = window.electronAPI;

  if (!ea) {
    console.error('TankobanPlus: window.electronAPI not available! Preload may have failed.');
    // Provide empty stubs to prevent crashes
    window.Tanko = window.Tanko || {};
    window.Tanko.api = {};
    return;
  }

  // ========================================
  // INITIALIZE TANKO NAMESPACE
  // ========================================
  window.Tanko = window.Tanko || {};

  // ========================================
  // API GATEWAY IMPLEMENTATION
  // ========================================
  window.Tanko.api = {
    
    // ========================================
    // window.*
    // ========================================
    window: {
      isFullscreen: (...a) => ea.window?.isFullscreen ? ea.window.isFullscreen(...a) : ea.isFullscreen(...a),
      toggleFullscreen: (...a) => ea.window?.toggleFullscreen ? ea.window.toggleFullscreen(...a) : ea.toggleFullscreen(...a),
      setFullscreen: (...a) => ea.window?.setFullscreen ? ea.window.setFullscreen(...a) : ea.setFullscreen(...a),
      isAlwaysOnTop: (...a) => ea.window?.isAlwaysOnTop ? ea.window.isAlwaysOnTop(...a) : ea.isAlwaysOnTop(...a),
      toggleAlwaysOnTop: (...a) => ea.window?.toggleAlwaysOnTop ? ea.window.toggleAlwaysOnTop(...a) : ea.toggleAlwaysOnTop(...a),
      takeScreenshot: (...a) => ea.window?.takeScreenshot ? ea.window.takeScreenshot(...a) : ea.takeScreenshot(...a),
      openSubtitleDialog: (...a) => ea.window?.openSubtitleDialog ? ea.window.openSubtitleDialog(...a) : ea.openSubtitleDialog(...a),
      minimize: (...a) => ea.window?.minimize ? ea.window.minimize(...a) : ea.minimize(...a),
      close: (...a) => ea.window?.close ? ea.window.close(...a) : ea.close(...a),
      openBookInNewWindow: (...a) => ea.window?.openBookInNewWindow ? ea.window.openBookInNewWindow(...a) : ea.openBookInNewWindow(...a),
      openVideoShell: (...a) => ea.window?.openVideoShell ? ea.window.openVideoShell(...a) : ea.openVideoShell(...a),
    },

    // ========================================
    // shell.*
    // ========================================
    shell: {
      revealPath: (...a) => ea.shell?.revealPath ? ea.shell.revealPath(...a) : ea.revealPath(...a),
    },

    // ========================================
    // library.*
    // ========================================
    library: {
      getState: (...a) => ea.library?.getState ? ea.library.getState(...a) : ea.getLibraryState(...a),
      onUpdated: (cb) => ea.library?.onUpdated ? ea.library.onUpdated(cb) : ea.onLibraryUpdated(cb),
      onScanStatus: (cb) => ea.library?.onScanStatus ? ea.library.onScanStatus(cb) : ea.onLibraryScanStatus(cb),
      scan: (...a) => ea.library?.scan ? ea.library.scan(...a) : ea.scanLibrary(...a),
      cancelScan: (...a) => ea.library?.cancelScan ? ea.library.cancelScan(...a) : ea.cancelLibraryScan(...a),
      setScanIgnore: (...a) => ea.library?.setScanIgnore ? ea.library.setScanIgnore(...a) : ea.setLibraryScanIgnore(...a),
      addRootFolder: (...a) => ea.library?.addRootFolder ? ea.library.addRootFolder(...a) : ea.addRootFolder(...a),
      addSeriesFolder: (...a) => ea.library?.addSeriesFolder ? ea.library.addSeriesFolder(...a) : ea.addSeriesFolder(...a),
      removeSeriesFolder: (...a) => ea.library?.removeSeriesFolder ? ea.library.removeSeriesFolder(...a) : ea.removeSeriesFolder(...a),
      removeRootFolder: (...a) => ea.library?.removeRootFolder ? ea.library.removeRootFolder(...a) : ea.removeRootFolder(...a),
      unignoreSeries: (...a) => ea.library?.unignoreSeries ? ea.library.unignoreSeries(...a) : ea.unignoreSeries(...a),
      clearIgnoredSeries: (...a) => ea.library?.clearIgnoredSeries ? ea.library.clearIgnoredSeries(...a) : ea.clearIgnoredSeries(...a),
      openComicFileDialog: (...a) => ea.library?.openComicFileDialog ? ea.library.openComicFileDialog(...a) : ea.openComicFileDialog(...a),
      bookFromPath: (...a) => ea.library?.bookFromPath ? ea.library.bookFromPath(...a) : ea.bookFromPath(...a),
      onAppOpenFiles: (cb) => ea.library?.onAppOpenFiles ? ea.library.onAppOpenFiles(cb) : ea.onAppOpenFiles(cb),
    },

    // ========================================
    // video.*
    // ========================================
    video: {
      getState: (...a) => ea.video?.getState ? ea.video.getState(...a) : ea.getVideoState(...a),
      onUpdated: (cb) => ea.video?.onUpdated ? ea.video.onUpdated(cb) : ea.onVideoUpdated(cb),
      onShellPlay: (cb) => ea.video?.onShellPlay ? ea.video.onShellPlay(cb) : ea.onVideoShellPlay(cb),
      onScanStatus: (cb) => ea.video?.onScanStatus ? ea.video.onScanStatus(cb) : ea.onVideoScanStatus(cb),
      scan: (...a) => ea.video?.scan ? ea.video.scan(...a) : ea.scanVideos(...a),
      cancelScan: (...a) => ea.video?.cancelScan ? ea.video.cancelScan(...a) : ea.cancelVideoScan(...a),
      addFolder: (...a) => ea.video?.addFolder ? ea.video.addFolder(...a) : ea.addVideoFolder(...a),
      addShowFolder: (...a) => ea.video?.addShowFolder ? ea.video.addShowFolder(...a)
        : (ea.addVideoShowFolder ? ea.addVideoShowFolder(...a) : undefined),
      removeFolder: (...a) => ea.video?.removeFolder ? ea.video.removeFolder(...a) : ea.removeVideoFolder(...a),
      hideShow: (...a) => ea.video?.hideShow ? ea.video.hideShow(...a) : ea.hideVideoShow(...a),
      openFileDialog: (...a) => ea.video?.openFileDialog ? ea.video.openFileDialog(...a) : ea.openVideoFileDialog(...a),
      openSubtitleFileDialog: (...a) => ea.video?.openSubtitleFileDialog ? ea.video.openSubtitleFileDialog(...a) : ea.openVideoSubtitleFileDialog(...a),
      generateShowThumbnail: (...a) => ea.video?.generateShowThumbnail ? ea.video.generateShowThumbnail(...a)
        : (ea.generateVideoShowThumbnail ? ea.generateVideoShowThumbnail(...a) : undefined),

      // BUILD 93+: Added-files + restore-hidden helpers (renderer gateway wrappers)
      addFiles: (...a) => ea.video?.addFiles ? ea.video.addFiles(...a)
        : (ea.addVideoFiles ? ea.addVideoFiles(...a) : (ea.addFiles ? ea.addFiles(...a) : undefined)),
      removeFile: (...a) => ea.video?.removeFile ? ea.video.removeFile(...a)
        : (ea.removeVideoFile ? ea.removeVideoFile(...a) : (ea.removeFile ? ea.removeFile(...a) : undefined)),
      restoreAllHiddenShows: (...a) => ea.video?.restoreAllHiddenShows ? ea.video.restoreAllHiddenShows(...a)
        : (ea.restoreAllHiddenVideoShows ? ea.restoreAllHiddenVideoShows(...a) : undefined),
      restoreHiddenShowsForRoot: (...a) => ea.video?.restoreHiddenShowsForRoot ? ea.video.restoreHiddenShowsForRoot(...a)
        : (ea.restoreHiddenVideoShowsForRoot ? ea.restoreHiddenVideoShowsForRoot(...a) : undefined),

      getEpisodesForShow: (...a) => ea.video?.getEpisodesForShow ? ea.video.getEpisodesForShow(...a) : ea.getEpisodesForShow(...a),
      getEpisodesForRoot: (...a) => ea.video?.getEpisodesForRoot ? ea.video.getEpisodesForRoot(...a) : ea.getEpisodesForRoot(...a),
      getEpisodesByIds: (...a) => ea.video?.getEpisodesByIds ? ea.video.getEpisodesByIds(...a) : ea.getEpisodesByIds?.(...a),
    },

    // ========================================
    // thumbs.*
    // ========================================
    thumbs: {
      has: (...a) => ea.thumbs?.has ? ea.thumbs.has(...a) : ea.hasThumb(...a),
      get: (...a) => ea.thumbs?.get ? ea.thumbs.get(...a) : ea.getThumb(...a),
      save: (...a) => ea.thumbs?.save ? ea.thumbs.save(...a) : ea.saveThumb(...a),
      delete: (...a) => ea.thumbs?.delete ? ea.thumbs.delete(...a) : ea.deleteThumb(...a),
      hasPage: (...a) => ea.thumbs?.hasPage ? ea.thumbs.hasPage(...a) : ea.hasPageThumb(...a),
      getPage: (...a) => ea.thumbs?.getPage ? ea.thumbs.getPage(...a) : ea.getPageThumb(...a),
      savePage: (...a) => ea.thumbs?.savePage ? ea.thumbs.savePage(...a) : ea.savePageThumb(...a),
    },

    // ========================================
    // archives.*
    // ========================================
    archives: {
      cbzOpen: (...a) => ea.archives?.cbzOpen ? ea.archives.cbzOpen(...a) : ea.cbzOpen(...a),
      cbzReadEntry: (...a) => ea.archives?.cbzReadEntry ? ea.archives.cbzReadEntry(...a) : ea.cbzReadEntry(...a),
      cbzClose: (...a) => ea.archives?.cbzClose ? ea.archives.cbzClose(...a) : ea.cbzClose(...a),
      cbrOpen: (...a) => ea.archives?.cbrOpen ? ea.archives.cbrOpen(...a) : ea.cbrOpen(...a),
      cbrReadEntry: (...a) => ea.archives?.cbrReadEntry ? ea.archives.cbrReadEntry(...a) : ea.cbrReadEntry(...a),
      cbrClose: (...a) => ea.archives?.cbrClose ? ea.archives.cbrClose(...a) : ea.cbrClose(...a),
    },

    // ========================================
    // export.*
    // ========================================
    export: {
      saveEntry: (...a) => ea.export?.saveEntry ? ea.export.saveEntry(...a) : ea.exportSaveEntry(...a),
      copyEntry: (...a) => ea.export?.copyEntry ? ea.export.copyEntry(...a) : ea.exportCopyEntry(...a),
    },

    // ========================================
    // files.*
    // ========================================
    files: {
      read: (...a) => ea.files?.read ? ea.files.read(...a) : ea.readFile(...a),
    },

    // ========================================
    // clipboard.*
    // ========================================
    clipboard: {
      copyText: (...a) => ea.clipboard?.copyText ? ea.clipboard.copyText(...a) : ea.setClipboardText(...a),
    },

    // ========================================
    // progress.*
    // ========================================
    progress: {
      getAll: (...a) => ea.progress?.getAll ? ea.progress.getAll(...a) : ea.getAllProgress(...a),
      get: (...a) => ea.progress?.get ? ea.progress.get(...a) : ea.getProgress(...a),
      save: (...a) => ea.progress?.save ? ea.progress.save(...a) : ea.saveProgress(...a),
      clear: (...a) => ea.progress?.clear ? ea.progress.clear(...a) : ea.clearProgress(...a),
      clearAll: (...a) => ea.progress?.clearAll ? ea.progress.clearAll(...a) : ea.clearAllProgress(...a),
    },

    // ========================================
    // videoProgress.*
    // ========================================
    videoProgress: {
      getAll: (...a) => ea.videoProgress?.getAll ? ea.videoProgress.getAll(...a) : ea.getAllVideoProgress(...a),
      get: (...a) => ea.videoProgress?.get ? ea.videoProgress.get(...a) : ea.getVideoProgress(...a),
      save: (...a) => ea.videoProgress?.save ? ea.videoProgress.save(...a) : ea.saveVideoProgress(...a),
      clear: (...a) => ea.videoProgress?.clear ? ea.videoProgress.clear(...a) : ea.clearVideoProgress(...a),
      clearAll: (...a) => ea.videoProgress?.clearAll ? ea.videoProgress.clearAll(...a) : ea.clearAllVideoProgress(...a),
      onUpdated: (cb) => ea.videoProgress?.onUpdated ? ea.videoProgress.onUpdated(cb) : null,
    },

    // ========================================
    // videoSettings.*
    // ========================================
    videoSettings: {
      get: (...a) => ea.videoSettings?.get ? ea.videoSettings.get(...a) : ea.getVideoSettings(...a),
      save: (...a) => ea.videoSettings?.save ? ea.videoSettings.save(...a) : ea.saveVideoSettings(...a),
      clear: (...a) => ea.videoSettings?.clear ? ea.videoSettings.clear(...a) : ea.clearVideoSettings(...a),
    },

    // ========================================
    // videoUi.*
    // ========================================
    videoUi: {
      getState: (...a) => ea.videoUi?.getState ? ea.videoUi.getState(...a) : ea.getVideoUiState(...a),
      saveState: (...a) => ea.videoUi?.saveState ? ea.videoUi.saveState(...a) : ea.saveVideoUiState(...a),
      clearState: (...a) => ea.videoUi?.clearState ? ea.videoUi.clearState(...a) : ea.clearVideoUiState(...a),
    },

    // ========================================
    // videoPoster.*
    // ========================================
    videoPoster: {
      get: (...a) => ea.videoPoster?.get ? ea.videoPoster.get(...a) : ea.getVideoPoster(...a),
      has: (...a) => ea.videoPoster?.has ? ea.videoPoster.has(...a) : ea.hasVideoPoster(...a),
      save: (...a) => ea.videoPoster?.save ? ea.videoPoster.save(...a) : ea.saveVideoPoster(...a),
      delete: (...a) => ea.videoPoster?.delete ? ea.videoPoster.delete(...a) : ea.deleteVideoPoster(...a),
      paste: (...a) => ea.videoPoster?.paste ? ea.videoPoster.paste(...a) : ea.pasteVideoPoster(...a),
    },

    // ========================================
    // seriesSettings.*
    // ========================================
    seriesSettings: {
      get: (...a) => ea.seriesSettings?.get ? ea.seriesSettings.get(...a) : ea.getSeriesSettings(...a),
      save: (...a) => ea.seriesSettings?.save ? ea.seriesSettings.save(...a) : ea.saveSeriesSettings(...a),
      clear: (...a) => ea.seriesSettings?.clear ? ea.seriesSettings.clear(...a) : ea.clearSeriesSettings(...a),
    },

    // ========================================
    // player.* (main process player domain)
    // ========================================
    // NOTE: The renderer should never reach into window.electronAPI directly.
    // The Videos module expects Tanko.api.player.launchQt to exist.
    player: {
      start: (...a) => ea.player?.start ? ea.player.start(...a) : (ea.playerStart ? ea.playerStart(...a) : undefined),
      play: (...a) => ea.player?.play ? ea.player.play(...a) : (ea.playerPlay ? ea.playerPlay(...a) : undefined),
      pause: (...a) => ea.player?.pause ? ea.player.pause(...a) : (ea.playerPause ? ea.playerPause(...a) : undefined),
      seek: (...a) => ea.player?.seek ? ea.player.seek(...a) : (ea.playerSeek ? ea.playerSeek(...a) : undefined),
      stop: (...a) => ea.player?.stop ? ea.player.stop(...a) : (ea.playerStop ? ea.playerStop(...a) : undefined),
      getState: (...a) => ea.player?.getState ? ea.player.getState(...a) : (ea.playerGetState ? ea.playerGetState(...a) : undefined),
      launchQt: (...a) => ea.player?.launchQt ? ea.player.launchQt(...a) : (ea.playerLaunchQt ? ea.playerLaunchQt(...a) : undefined),
    },

    // ========================================
    // mpv.*
    // ========================================
    mpv: {
      isAvailable: (...a) => ea.mpv?.isAvailable ? ea.mpv.isAvailable(...a) : ea.isMpvAvailable(...a),
      create: (...a) => ea.mpv?.create ? ea.mpv.create(...a) : ea.createMpvPlayer(...a),
      destroy: (...a) => ea.mpv?.destroy ? ea.mpv.destroy(...a) : ea.destroyMpvPlayer(...a),
      load: (...a) => ea.mpv?.load ? ea.mpv.load(...a) : ea.mpvLoad(...a),
      command: (...a) => ea.mpv?.command ? ea.mpv.command(...a) : ea.mpvCommand(...a),
      setProperty: (...a) => ea.mpv?.setProperty ? ea.mpv.setProperty(...a) : ea.mpvSetProperty(...a),
      observeProperty: (...a) => ea.mpv?.observeProperty ? ea.mpv.observeProperty(...a) : ea.mpvObserveProperty(...a),
      onEvent: (playerId, handler) => ea.mpv?.onEvent ? ea.mpv.onEvent(playerId, handler) : ea.onMpvPlayerEvent(playerId, handler),
      probe: (...a) => ea.mpv?.probe ? ea.mpv.probe(...a) : ea.mpvProbe(...a),
    },

    // ========================================
    // libmpv.*
    // ========================================
    libmpv: {
      probe: (...a) => ea.libmpv?.probe ? ea.libmpv.probe(...a) : (ea.libmpvProbe ? ea.libmpvProbe(...a) : undefined),
      createRenderless: (...a) => ea.libmpv?.createRenderless ? ea.libmpv.createRenderless(...a) : ea.libmpvCreateRenderless(...a),
      destroy: (...a) => ea.libmpv?.destroy ? ea.libmpv.destroy(...a) : ea.libmpvDestroy(...a),
      command: (...a) => ea.libmpv?.command ? ea.libmpv.command(...a) : ea.libmpvCommand(...a),
      setPropertyString: (...a) => ea.libmpv?.setPropertyString ? ea.libmpv.setPropertyString(...a) : ea.libmpvSetPropertyString(...a),
      getPropertyString: (...a) => ea.libmpv?.getPropertyString ? ea.libmpv.getPropertyString(...a) : ea.libmpvGetPropertyString(...a),
      renderCreateContext: (...a) => ea.libmpv?.renderCreateContext ? ea.libmpv.renderCreateContext(...a) : ea.libmpvRenderCreateContext(...a),
      renderFreeContext: (...a) => ea.libmpv?.renderFreeContext ? ea.libmpv.renderFreeContext(...a) : ea.libmpvRenderFreeContext(...a),
      renderFrameRGBA: (...a) => ea.libmpv?.renderFrameRGBA ? ea.libmpv.renderFrameRGBA(...a) : ea.libmpvRenderFrameRGBA(...a),
      renderAttachSharedBuffer: (...a) => ea.libmpv?.renderAttachSharedBuffer ? ea.libmpv.renderAttachSharedBuffer(...a) : ea.libmpvRenderAttachSharedBuffer(...a),
      renderDetachSharedBuffer: (...a) => ea.libmpv?.renderDetachSharedBuffer ? ea.libmpv.renderDetachSharedBuffer(...a) : ea.libmpvRenderDetachSharedBuffer(...a),
      renderToSharedBuffer: (...a) => ea.libmpv?.renderToSharedBuffer ? ea.libmpv.renderToSharedBuffer(...a) : ea.libmpvRenderToSharedBuffer(...a),
      renderEnableUpdateEvents: (...a) => ea.libmpv?.renderEnableUpdateEvents ? ea.libmpv.renderEnableUpdateEvents(...a) : ea.libmpvRenderEnableUpdateEvents(...a),
      renderDisableUpdateEvents: (...a) => ea.libmpv?.renderDisableUpdateEvents ? ea.libmpv.renderDisableUpdateEvents(...a) : ea.libmpvRenderDisableUpdateEvents(...a),
      onRenderUpdate: (handleId, handler) => ea.libmpv?.onRenderUpdate ? ea.libmpv.onRenderUpdate(handleId, handler) : ea.onLibmpvRenderUpdate(handleId, handler),
      createEmbedded: (...a) => ea.libmpv?.createEmbedded ? ea.libmpv.createEmbedded(...a) : ea.libmpvCreateEmbedded(...a),
      setBounds: (...a) => ea.libmpv?.setBounds ? ea.libmpv.setBounds(...a) : ea.libmpvSetBounds(...a),
      setVisible: (...a) => ea.libmpv?.setVisible ? ea.libmpv.setVisible(...a) : ea.libmpvSetVisible(...a),
    },
    
    // ========================================
    // Health check (BUILD 88 FIX 3.2)
    // ========================================
    ping: () => ea.ping ? ea.ping() : Promise.resolve({ ok: true, timestamp: Date.now() }),
  };

  // Log successful initialization (console-friendly)
  console.log('TankobanPlus: Tanko.api gateway initialized');
})();
