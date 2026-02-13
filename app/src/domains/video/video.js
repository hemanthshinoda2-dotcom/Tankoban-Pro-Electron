/* 
AI_NAV: video.js
OWNERSHIP: Renderer-side Videos module. Owns Videos library UI + playback launch into the external Qt player. Talks to main via Tanko.api.

HOW TO NAVIGATE
- Search: AI_ANCHOR:
- Search: AI_STATE_READ / AI_STATE_WRITE / AI_IPC / AI_EXIT_PATH / AI_PERF_HOT / AI_MPV_WIRING / AI_UI_RENDER
- This file is "prepped" for future assistants: comments are navigation only; behavior must remain identical unless explicitly changed.

COMMON ANCHORS
- AI_ANCHOR: Videos mode entry + initial load
- AI_ANCHOR: Video sidebar rendering (folder/show rows)
- AI_ANCHOR: Continue Watching shelf rendering
- AI_ANCHOR: Progress save/resume lifecycle (poll + final save on exit)
- AI_ANCHOR: Audio/subtitle preference persistence + application
- AI_ANCHOR: Play/pause center flash and HUD overlays
*/

/*
OWNERSHIP (renderer / Videos):
- Videos-mode UI (library + player) and all player interactions (click/dblclick, HUD, fullscreen)
- Progress saving/resume and 
// AI_STATE_WRITE: video progress persistence boundary. Look for save/load IPC calls 'videoProgress:*'.
videoProgress IPC calls
- 
// QT_ONLY: Embedded/canvas player has been removed. This renderer launches the external Qt player.
*/

// Tankoban Plus Build 3.3 — Video library navigation (show grid + show view) + existing player adapter
// INTENT: Keep comic reader untouched; improve video playback feel and introduce a player adapter layer for mpv.

(function(){
  // AI_SPLIT: helpers extracted to ./video_utils.js (loaded before this file via index.html)
  const __vutil = (window.tankobanVideoUtils || {});
  const _videoGsNorm = __vutil._videoGsNorm || (s => String(s || '').toLowerCase());
  const _videoMatchText = __vutil._videoMatchText || ((hay, needle) => String(hay || '').toLowerCase().includes(String(needle || '').toLowerCase()));
  const _videoNatCmp = __vutil._videoNatCmp || ((a, b) => String(a||'').localeCompare(String(b||''), undefined, { numeric:true, sensitivity:'base' }));
  const _videoEscHtml = __vutil._videoEscHtml || (s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c)));
  const safe = (fn) => {
    try {
      const r = fn();
      if (r && typeof r.then === 'function') r.catch(() => {});
    } catch {}
  };
  const qs = (id) => document.getElementById(id);

  const el = {
    modeComicsBtn: qs('modeComicsBtn'),
    modeVideosBtn: qs('modeVideosBtn'),
    qtPlayerToggleBtn: qs('qtPlayerToggleBtn'),
    libTitle: qs('libTitle'),

    libraryView: qs('libraryView'),
    playerView: qs('playerView'),
    videoLibraryView: qs('videoLibraryView'),
    videoPlayerView: qs('videoPlayerView'),

    // Video library views (Build 3.3)
    videoHomeView: qs('videoHomeView'),
    videoShowView: qs('videoShowView'),

    // Sidebar
    videoAddFolderBtn: qs('videoAddFolderBtn'),
    videoAddShowFolderBtn: qs('videoAddShowFolderBtn'),
    videoAddFilesBtn: qs('videoAddFilesBtn'),
    videoRestoreHiddenBtn: qs('videoRestoreHiddenBtn'),
    videoOpenFileBtn: qs('videoOpenFileBtn'),
    videoRefreshBtn: qs('videoRefreshBtn'),
    videoFoldersList: qs('videoFoldersList'),

    // Home (show grid)
    videoRootLabel: qs('videoRootLabel'),
    videoShowsGrid: qs('videoShowsGrid'),
    videoShowsEmpty: qs('videoShowsEmpty'),

    // Show view (episode list + preview)
    videoCrumb: qs('videoCrumb'),
    videoShowBackBtn: qs('videoShowBackBtn'),
    videoCrumbText: qs('videoCrumbText'),
    videoEpisodesWrap: qs('videoEpisodesWrap'),
    videoEpisodesGrid: qs('videoEpisodesGrid'),
    videoEpisodesEmpty: qs('videoEpisodesEmpty'),
    videoEpPreviewInfo: qs('videoEpPreviewInfo'),
    videoEpPreviewImg: qs('videoEpPreviewImg'),
    videoFolderContinue: qs('videoFolderContinue'),

    // Scan status
    videoScanPill: qs('videoScanPill'),
    videoScanText: qs('videoScanText'),
    videoScanCancel: qs('videoScanCancel'),

    // Continue row
    videoContinuePanel: qs('videoContinuePanel'),
    videoContinueList: qs('videoContinueList'),

    videoContinueEmpty: qs('videoContinueEmpty'),
    videoHideWatchedToggle: qs('videoHideWatchedToggle'),

    // Episode list controls (Build 3.4)
    videoEpSearch: qs('videoEpSearch'),
    clearVideoEpSearch: qs('clearVideoEpSearch'),
    videoEpOpenBtn: qs('videoEpOpenBtn'),
    videoEpSort: qs('videoEpSort'),
    videoEpHidePreviewToggle: qs('videoEpHidePreviewToggle'),

    // Player
    videoBackBtn: qs('videoBackBtn'),
    videoNowTitle: qs('videoNowTitle'),
    videoStage: qs('videoStage'),
    videoEl: qs('videoEl'),
    mpvHost: qs('mpvHost'),
    mpvDetachedPlaceholder: qs('mpvDetachedPlaceholder'),

    videoHud: qs('videoHud'),
    videoPrevHudBtn: qs('videoPrevHudBtn'),
    videoPlayBtn: qs('videoPlayBtn'),
    videoNextHudBtn: qs('videoNextHudBtn'),
    videoMuteBtn: qs('videoMuteBtn'),
    videoScrub: qs('videoScrub'),
    videoScrubTrack: qs('videoScrubTrack'),
    videoScrubChapters: qs('videoScrubChapters'),
    videoScrubFill: qs('videoScrubFill'),
    videoScrubThumb: qs('videoScrubThumb'),
    videoScrubBubble: qs('videoScrubBubble'),
    videoVol: qs('videoVol'),
    videoTimeNow: qs('videoTimeNow'),
    videoTimeDur: qs('videoTimeDur'),

    videoSpeedBtn: qs('videoSpeedBtn'),
    videoTracksBtn: qs('videoTracksBtn'),
    videoTracksBtnTop: qs('videoTracksBtnTop'), // Build 67: Merged tracks button
    videoSubsBtn: qs('videoSubsBtn'),
    videoAudioBtn: qs('videoAudioBtn'),
    videoFullscreenBtn: qs('videoFullscreenBtn'),
    videoPlaylistBtn: qs('videoPlaylistBtn'),
    videoPlaylistPanel: qs('videoPlaylistPanel'),
    videoPlaylistCloseBtn: qs('videoPlaylistCloseBtn'),
    videoPlaylistFolder: qs('videoPlaylistFolder'),
    videoPlaylistList: qs('videoPlaylistList'),
    videoPrevEpBtn: qs('videoPrevEpBtn'),
    videoNextEpBtn: qs('videoNextEpBtn'),
    videoAutoAdvanceToggle: qs('videoAutoAdvanceToggle'),

    videoSpeedBtnTop: qs('videoSpeedBtnTop'),

    videoQualityBtnTop: qs('videoQualityBtnTop'),
    videoInfoBtnTop: qs('videoInfoBtnTop'),
    videoDiagnostics: qs('videoDiagnostics'),

    // BUILD 101: Fullscreen HUD exit arrow
    videoExitFullscreenBtn: qs('videoExitFullscreenBtn'),

    videoCtxMenu: qs('videoCtxMenu'),
    // Quick tools row additions (Build 24 prompt 4)
    videoSubDelayBtn: qs('videoSubDelayBtn'),

    videoVolPanel: qs('videoVolPanel'),
    videoVolCloseBtn: qs('videoVolCloseBtn'),
    videoVolMuteToggleBtn: qs('videoVolMuteToggleBtn'),
    videoVolPct: qs('videoVolPct'),

    videoSpeedPanel: qs('videoSpeedPanel'),
    videoSpeedCloseBtn: qs('videoSpeedCloseBtn'),
    videoSpeedDownBtn: qs('videoSpeedDownBtnPanel'),
    videoSpeedUpBtn: qs('videoSpeedUpBtnPanel'),
    videoSpeedPanelValue: qs('videoSpeedPanelValueSeparate'),
    videoFullscreenBtnTop: qs('videoFullscreenBtnTop'),

    videoToast: qs('videoToast'),

    // Tankoban Plus Build 5.4A: track selectors (mpv only)
    videoTracksPanel: qs('videoTracksPanel'),
    videoTracksCloseBtn: qs('videoTracksCloseBtn'),
    videoAudioTrackSelect: qs('videoAudioTrackSelect'),
    videoSubtitleTrackSelect: qs('videoSubtitleTrackSelect'),
    videoRespectSubStylesToggle: qs('videoRespectSubStylesToggle'),
    videoLoadSubtitleBtn: qs('videoLoadSubtitleBtn'),
    // Tankoban Plus Build 5.4B: delay controls (mpv only)
    videoAudioDelayControls: qs('videoAudioDelayControls'),
    videoAudioDelayMinusBtn: qs('videoAudioDelayMinusBtn'),
    videoAudioDelayPlusBtn: qs('videoAudioDelayPlusBtn'),
    videoAudioDelayValue: qs('videoAudioDelayValue'),
    videoSubtitleDelayControls: qs('videoSubtitleDelayControls'),
    videoSubtitleDelayMinusBtn: qs('videoSubtitleDelayMinusBtn'),
    videoSubtitleDelayPlusBtn: qs('videoSubtitleDelayPlusBtn'),
    videoSubtitleDelayValue: qs('videoSubtitleDelayValue'),

    // Tankoban Plus Build 5.4C: transforms (mpv only)
    videoTransformsBlock: qs('videoTransformsBlock'),
    videoAspectSelect: qs('videoAspectSelect'),
    videoCropSelect: qs('videoCropSelect'),
    videoResetTransformsBtn: qs('videoResetTransformsBtn'),


    videoResumePrompt: qs('videoResumePrompt'),
    videoResumeText: qs('videoResumeText'),
    videoResumeBtn: qs('videoResumeBtn'),
    videoRestartBtn: qs('videoRestartBtn'),

    // Tips overlay (video library)
    videoLibTipsOverlay: qs('videoLibTipsOverlay'),
    videoLibTipsClose: qs('videoLibTipsClose'),
  };

  let __modeButtonsBound = false;
  function bindModeButtons(){
    if (__modeButtonsBound) return;
    __modeButtonsBound = true;
    try { el.modeComicsBtn?.addEventListener('click', () => setMode('comics')); } catch {}
    try { el.modeVideosBtn?.addEventListener('click', () => setMode('videos')); } catch {}
  }
  // Bind as early as possible so mode switch works even if later video init fails.
  try { bindModeButtons(); } catch {}

  const IS_VIDEO_SHELL = (new URLSearchParams(window.location.search)).get('videoShell') === '1';

  // Build 57: PotPlayer-style reveal zone configuration
  const REVEAL_ZONE_HEIGHT = 32;  // Bottom N pixels that trigger control reveal (tune: 24-40px)
  const HIDE_TIMEOUT_MS = 3000;   // Build 61: Idle time before hiding controls (3 seconds)
  const HYSTERESIS_PX = 8;        // Must move up this many px from zone to deactivate

  const state = {
    mode: 'comics',
    videoFolders: [],
    roots: [],
    shows: [],
    videos: [], // Build 3.2+: videos = episodes (kept for compatibility)
    progress: {},

    // Build 3.4: library-grade view controls
    hideWatchedShows: false,
    epSearch: '',
    epSort: 'title_asc',
    epHidePreview: false,

    // Build 8.5/10.5: show tiles can hide thumbnails (Video-only).
    showThumbs: true,

    // Build 22: inside-show explorer-like browser state (current folder within the show)
    // Stored as a normalized relative path ("" = show root), using forward slashes.
    epFolderRel: '',

    // Build 20: Continue Watching can be dismissed per show (like Continue Reading remove).
    // Schema: { [showId: string]: dismissedAtMs: number }
    dismissedContinueShows: {},

    // Build 104a: track the most recently opened episode per show (Continue Watching can point to it even if <10s watched).
    // Schema: { [showId: string]: { episodeId: string, atMs: number } }
    lastActiveEpisodeByShowId: {},

    // Library navigation (Build 3.3)
    selectedRootId: null,
    videoSubView: 'home', // 'home' | 'show'
    selectedShowId: null,
    selectedEpisodeId: null,
    episodesByShowId: new Map(),

    // Stage 2: sidebar tree expand/collapse state (rootId -> boolean)
    videoTreeExpanded: {},

    // Stage 2: derived sidebar counts (rebuilt per snapshot)
    rootShowCount: new Map(),
    showEpisodeCount: new Map(),
    showProgressSummary: new Map(),


    // Playback
    now: null,
    lastSaveAt: 0,

    // Build 56B: YouTube-like overlay behavior helpers
    _pointerOverControls: false,

    // Build 57: PotPlayer-style reveal zone state
    _revealZoneLastMouseY: -1,
    _revealZoneInZone: false,
    _revealZoneActive: false,

    // Build 33: hide UI toggle (video player)
    videoUiHidden: false,

    // Build 19: periodic progress polling (3–5s) so progress survives mpv shutdown/app quit.
    _progressPollTimer: null,
    _progressPollIntervalMs: 4000,
    player: null,
    mpvAvailable: false,
    // BUILD31: native embedded libmpv availability (separate from mpv.exe path)
    libmpvAvailable: false,
    libmpvAvailError: '',
    mpvWindowMode: '',
    mpvDetached: false,
    _playerDomBound: false,
    _playerEventsBoundFor: null,

    // Step 7: canvas default + automatic fallback notification (session-scoped)
    _canvasFallbackNotified: false,

    _retryPending: null,
    _retryAvailable: false,
    _retrying: false,
    _suppressResumePromptOnce: false,
    _resumeOverridePosSec: null,
    _pendingShellPlay: null,

    settings: {
      playerEngine: 'mpv', // 'mpv' | 'browser'
      renderMode: 'canvas', // 'hwnd' | 'canvas'
      // Build 54: render surface quality preset (caps total pixels)
      renderQuality: 'auto',
      // BUILD110: Optional mpv pacing mode (advanced). When true: video-sync=display-resample.
      videoSyncDisplayResample: false,
      volume: 1,
      muted: false,
      speed: 1,
      seekSmallSec: 10,
      seekBigSec: 30,
      volumeStep: 0.05,

      // Tankoban Plus Build 5.4B: preferred languages for track selection (mpv only)
      preferredAudioLanguage: null,
      preferredSubtitleLanguage: null,
      autoAdvance: true,

      // Build 33: UI hidden state is session-scoped (not persisted)
      uiHidden: false,

    },

    seekDragging: false,
    seekPreviewSec: null,
    _seekCommitGuardAt: 0,

    // Build 14: coalesce rapid seek nudges (keyboard)
    _nudgeSeekTimer: null,
    _nudgeSeekBaseSec: null,
    _nudgeSeekDeltaSec: 0,
    _nudgeSeekPreviewSec: null,
    _nudgeSeekPreviewing: false,

    // Build 14: throttle volume writes while dragging the slider
    _volDragActive: false,
    _volPending: null,
    _volTimer: null,
    _volLastSentAt: 0,
    _volUnmutedSent: false,

    hudHideTimer: null,
    toastTimer: null,
    libraryToastTimer: null,
    pendingResumePos: null,
    playlist: { showId: null, episodes: [], currentKey: null },
    _autoAdvanceTriggeredForKey: null,
    _autoAdvanceCountdownTimer: null,  // BUILD63: countdown interval
    _autoAdvancePlayTimer: null,       // BUILD63: delayed play timeout
    _manualStop: false,

    // Build 41A: progress-resume safety + debug (session-scoped)
    _vpCanSave: true,
    _vpResumeInProgressForId: null,
    _vpResumeCompletedForId: null,
    _vpResumeCompletedAt: 0,
    _vpLoadedProgressForId: null,
    _vpLoadedProgress: null,
    _vpFirstPollTickLoggedForId: null,
    _vpFirstNonForceCallLoggedForId: null,
    _vpFirstSavedLoggedForId: null,
    _vpLogCount: 0,
    _vpLastPrefsProbeAt: 0,

  };

  // BUILD 104c: Alias-aware progress lookup (rename/move resilience).
  // Progress keys are episode IDs; when a file is renamed/moved, its ID changes.
  // Episodes may include aliasIds[] pointing to prior IDs.
  function getProgressForEpisode(ep) {
    const prog = (state.progress && typeof state.progress === 'object') ? state.progress : {};
    const id = String(ep && ep.id || '');
    if (id && prog[id]) return { idUsed: id, progress: prog[id] };

    const aliases = Array.isArray(ep && ep.aliasIds) ? ep.aliasIds : [];
    for (const a of aliases) {
      const aid = String(a || '');
      if (!aid) continue;
      if (prog[aid]) return { idUsed: aid, progress: prog[aid] };
    }

    return { idUsed: id, progress: null };
  }
  // Build 104e: robust "finished" detection. Avoid treating a scrub near the end as watched.
  // A progress record is considered finished when:
  // - explicitly marked finished (p.finished === true), OR
  // - completedAtMs is set (new), OR
  // - (near end) AND (watchedSecApprox indicates real watch time)
  function isProgressFinished(p){
    const pr = (p && typeof p === 'object') ? p : null;
    if (!pr) return false;
    if (pr.finished === true) return true;

    const completedAt = Number(pr.completedAtMs || 0);
    if (Number.isFinite(completedAt) && completedAt > 0) return true;

    const pos = Number(pr.positionSec);
    const dur = Number(pr.durationSec);
    const maxPos = Number(pr.maxPositionSec);
    const watched = Number(pr.watchedSecApprox);

    if (Number.isFinite(dur) && dur > 0) {
      const nearEnd = (Number.isFinite(pos) && (pos / dur) >= 0.98) || (Number.isFinite(maxPos) && (maxPos / dur) >= 0.98);
      if (nearEnd && Number.isFinite(watched) && watched >= 0 && (watched / dur) >= 0.80) return true;
    }

    return false;
  }


  function getProgressForVideoId(id) {
    const pid = String(id || '');
    if (!pid) return null;
    const prog = (state.progress && typeof state.progress === 'object') ? state.progress : {};
    if (prog[pid]) return prog[pid];

    const byId = state.episodeById;
    const ep = (byId && typeof byId.get === 'function') ? byId.get(pid) : null;
    if (ep && Array.isArray(ep.aliasIds)) {
      for (const a of ep.aliasIds) {
        const aid = String(a || '');
        if (!aid) continue;
        if (prog[aid]) return prog[aid];
      }
    }
    return null;
  }

  // Build 41A: gated debug logs for progress pipeline.
  const vpDebugEnabled = () => {
    try {
      return (window && window.__videoProgressDebug === true) || (localStorage && localStorage.getItem('videoProgressDebug') === '1');
    } catch { return false; }
  };
  function vpLog(...args){
    if (!vpDebugEnabled()) return;
    try {
      state._vpLogCount = Number(state._vpLogCount || 0) + 1;
      if (state._vpLogCount > 200) return;
      console.log('[video-progress]', ...args);
    } catch {}
  }

  const EMPTY_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

  // Build 3.4: lightweight in-memory thumbnail URL + preload cache
  const thumbUrlCache = new Map();
  const thumbPreload = new Map();
  const THUMB_CACHE_MAX = 400;

  // Build 21: per-show custom posters (stored in userData via main process)
  const showPosterCache = new Map(); // showId -> file:// url | null
  const showPosterInFlight = new Map();

  // Build 24: cache-bust + instant refresh for posters.
  // Chromium can aggressively cache file:// images; after paste/save, posters may appear "late".
  // We track a per-show revision and append ?rev=N to poster URLs so the <img> reloads immediately.
  const showPosterRev = new Map(); // showId -> integer

  function _cssEsc(s){
    try { return (window.CSS && CSS.escape) ? CSS.escape(String(s)) : String(s).replace(/[^a-zA-Z0-9_\-]/g, '\\$&'); }
    catch { return String(s || ''); }
  }

  function bumpShowPosterRev(showId){
    const sid = String(showId || '');
    if (!sid) return 0;
    const next = (showPosterRev.get(sid) || 0) + 1;
    showPosterRev.set(sid, next);
    return next;
  }

  function withPosterRev(showId, url){
    const sid = String(showId || '');
    const u = url ? String(url) : '';
    if (!sid || !u) return u || null;
    // Do not decorate data/blob URLs.
    if (u.startsWith('data:') || u.startsWith('blob:')) return u;
    const rev = showPosterRev.get(sid) || 0;
    if (!rev) return u;
    const sep = u.includes('?') ? '&' : '?';
    return u + sep + 'rev=' + encodeURIComponent(String(rev));
  }

  function safeVideoPosterIdLocal(showId){
    try { return String(showId || 'unknown').replace(/[^a-z0-9_-]/gi, '_'); } catch { return 'unknown'; }
  }

  function isUserPosterPathForShow(showId, p){
    try {
      const sid = safeVideoPosterIdLocal(showId).toLowerCase();
      if (!sid) return false;
      let s = String(p || '').trim();
      if (!s) return false;
      if (/^file:\/\//i.test(s)) {
        try { s = decodeURIComponent(s.replace(/^file:\/+/, '/')); } catch {}
      }
      s = s.replace(/\\/g, '/').toLowerCase();
      return s.endsWith(`/video_posters/${sid}.jpg`) || s.endsWith(`/video_posters/${sid}.png`);
    } catch { return false; }
  }

  function refreshMountedPosters(showId){
    const sid = String(showId || '');
    if (!sid) return;
    const cached = showPosterCache.get(sid);
    if (!cached) return;
    try {
      const q = `img[data-poster-for="${_cssEsc(sid)}"]`;
      document.querySelectorAll(q).forEach((img) => {
        try {
          if (!img || !img.isConnected) return;
          img.src = cached;
        } catch {}
      });
    } catch {}
  }

  function setShowPosterCacheImmediate(showId, url){
    const sid = String(showId || '');
    if (!sid) return;
    showPosterInFlight.delete(sid);
    showPosterCache.set(sid, withPosterRev(sid, url));
    refreshMountedPosters(sid);
  }


  async function getShowPosterUrl(showId) {
    const sid = String(showId || '');
    if (!sid) return null;
    if (!Tanko.api.videoPoster.get) return null;

    if (showPosterCache.has(sid)) return showPosterCache.get(sid);
    if (showPosterInFlight.has(sid)) return showPosterInFlight.get(sid);

    const p = (async () => {
      try {
        const url = await Tanko.api.videoPoster.get(sid);
        const v0 = url ? String(url) : null;
        const v = v0 ? withPosterRev(sid, v0) : null;
        showPosterCache.set(sid, v);
        return v;
      } catch {
        showPosterCache.set(sid, null);
        return null;
      } finally {
        showPosterInFlight.delete(sid);
      }
    })();

    showPosterInFlight.set(sid, p);
    return p;
  }

  function invalidateShowPoster(showId) {
    const sid = String(showId || '');
    if (!sid) return;
    showPosterCache.delete(sid);
    showPosterInFlight.delete(sid);
  }

  function attachShowPoster(imgEl, showId) {
    const sid = String(showId || '');
    if (!imgEl || !sid) return;
    imgEl.dataset.posterFor = sid;
    getShowPosterUrl(sid).then((url) => {
      if (!imgEl.isConnected) return;
      if (imgEl.dataset.posterFor !== sid) return;
      if (url) imgEl.src = url;
    });
  }

  function thumbUrl(fp){
    if (!fp) return EMPTY_IMG;
    const key = String(fp);
    const hit = thumbUrlCache.get(key);
    if (hit) return hit;
    const url = toFileUrl(key);
    thumbUrlCache.set(key, url);
    // simple LRU-ish trim
    if (thumbUrlCache.size > THUMB_CACHE_MAX) {
      const k0 = thumbUrlCache.keys().next().value;
      if (k0) thumbUrlCache.delete(k0);
    }
    // warm decode
    if (!thumbPreload.has(url)) {
      const im = new Image();
      im.decoding = 'async';
      im.loading = 'eager';
      im.src = url;
      thumbPreload.set(url, im);
      if (thumbPreload.size > THUMB_CACHE_MAX) {
        const k0 = thumbPreload.keys().next().value;
        if (k0) thumbPreload.delete(k0);
      }
    }
    return url;
  }

  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
    return `${m}:${String(ss).padStart(2,'0')}`;
  }

  function clamp(n, a, b){
    const x = Number(n);
    if (!Number.isFinite(x)) return a;
    return Math.max(a, Math.min(b, x));
  }

  // Reader-style scrub bubble clamping (prevents clipping at extremes)
  let videoScrubBubbleW = 0;
  let videoScrubBubbleSig = '';
  function setVideoScrubBubbleLeftClamped(t, pctFallback) {
    if (!el.videoScrubBubble) return;
    const track = el.videoScrubTrack || el.videoScrub;
    if (!track) { el.videoScrubBubble.style.left = pctFallback; return; }
    const w = track.clientWidth || 0;
    if (!w) { el.videoScrubBubble.style.left = pctFallback; return; }

    const sig = String((el.videoScrubBubble.textContent || '').length);
    if (!videoScrubBubbleW || sig !== videoScrubBubbleSig) {
      videoScrubBubbleSig = sig;
      videoScrubBubbleW = el.videoScrubBubble.getBoundingClientRect().width || el.videoScrubBubble.offsetWidth || 0;
    }
    const bw = videoScrubBubbleW;
    if (!bw || bw >= w) { el.videoScrubBubble.style.left = pctFallback; return; }

    const half = bw / 2;
    const x = clamp(t * w, half, w - half);
    el.videoScrubBubble.style.left = `${x.toFixed(2)}px`;
  }

  function setVideoScrubUI(timeSec, durationSec) {
    const dur = Number(durationSec) || 0;
    const t = (!dur || dur <= 0) ? 0 : clamp((Number(timeSec) || 0) / dur, 0, 1);
    const pct = `${(t * 100).toFixed(4)}%`;

    if (el.videoScrubFill && el.videoScrubFill.style.width !== pct) el.videoScrubFill.style.width = pct;
    if (el.videoScrubThumb && el.videoScrubThumb.style.left !== pct) el.videoScrubThumb.style.left = pct;

    const bubbleText = fmtTime(Number(timeSec) || 0);
    if (el.videoScrubBubble && el.videoScrubBubble.textContent !== bubbleText) el.videoScrubBubble.textContent = bubbleText;
    setVideoScrubBubbleLeftClamped(t, pct);

    if (el.videoScrub) {
      el.videoScrub.setAttribute('aria-valuemin', '0');
      el.videoScrub.setAttribute('aria-valuemax', String(Math.max(0, Math.floor(dur))));
      el.videoScrub.setAttribute('aria-valuenow', String(Math.max(0, Math.floor(Number(timeSec) || 0))));
      el.videoScrub.setAttribute('aria-valuetext', bubbleText);
    }


// Build 85: re-render chapter markers only when needed (duration/chapters change).
try {
  const chapters = Array.isArray(state.videoChapters) ? state.videoChapters : [];
  const sig = `${Math.floor(dur)}|${chapters.length}|${chapters.length ? Math.round((chapters[0].timeSec||0)*1000) : 0}|${chapters.length ? Math.round((chapters[chapters.length-1].timeSec||0)*1000) : 0}`;
  if (sig !== state._chaptersRenderSig) {
    state._chaptersRenderSig = sig;
    renderScrubChapters(dur);
  }
} catch {}

  }



// Build 87: Chapter markers on the timeline with tooltips and click-to-seek.
function renderScrubChapters(durationSec){
  const wrap = el.videoScrubChapters;
  if (!wrap) return;
  wrap.innerHTML = '';
  const dur = Number(durationSec) || 0;
  const chapters = Array.isArray(state.videoChapters) ? state.videoChapters : [];
  
  // BUILD 89 FIX 2: Add debug logging
  console.log('[BUILD89 CHAPTERS] renderScrubChapters called:', {
    duration: dur,
    chapterCount: chapters.length,
    chapters: chapters
  });
  
  if (!dur || dur <= 0 || !chapters.length) {
    console.log('[BUILD89 CHAPTERS] No chapters to render:', { dur, chapterCount: chapters.length });
    return;
  }

  for (const ch of chapters) {
    const t = Number(ch && (ch.timeSec ?? ch.time ?? ch.start ?? ch.startTime));
    if (!Number.isFinite(t) || t < 0 || t > dur) continue;
    const pct = clamp(t / dur, 0, 1) * 100;
    const mark = document.createElement('div');
    mark.className = 'scrubChapterMark';
    mark.style.left = `${pct.toFixed(4)}%`;
    mark.style.cursor = 'pointer'; // BUILD 87: Indicate clickable
    
    // BUILD 89 FIX 2: Force bright red and high z-index for visibility
    mark.style.background = '#FFFFFF';
    mark.style.width = '2px';
    mark.style.zIndex = '9999';
    mark.style.position = 'absolute';
    mark.style.top = '0';
    mark.style.bottom = '0';
    
    // BUILD 87: Add tooltip with chapter title + timestamp
    const title = String(ch.title || '').trim() || 'Chapter';
    const timeStr = fmtTime(t);
    mark.title = `${title} (${timeStr})`;
    
    console.log('[BUILD89 CHAPTERS] Creating marker:', {
      time: t,
      percent: pct,
      title: title,
      left: mark.style.left
    });
    
    // BUILD 87: Click to seek to chapter
    mark.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault(); // Prevent timeline scrub from interfering
      if (state.player && typeof state.player.seekTo === 'function') {
        safe(async () => {
          await state.player.seekTo(t);
          showHud();
          hudNotice(`Jumped to: ${title}`);
        });
      }
    });
    
    wrap.appendChild(mark);
  }
  
  console.log('[BUILD89 CHAPTERS] Rendered', wrap.children.length, 'chapter markers');
}

async function refreshChaptersFromPlayer(){
  console.log('[BUILD89 CHAPTERS] refreshChaptersFromPlayer called');
  state.videoChapters = [];
  try {
    if (!state.player || typeof state.player.getChapters !== 'function') {
      console.log('[BUILD89 CHAPTERS] No player or getChapters not supported');
      renderScrubChapters(state.player?.getState?.()?.durationSec || 0);
      return;
    }
    console.log('[BUILD89 CHAPTERS] Fetching chapters from player...');
    const r = await state.player.getChapters();
    console.log('[BUILD89 CHAPTERS] getChapters result:', r);
    
    const list = (r && r.ok && Array.isArray(r.chapters)) ? r.chapters : [];
    console.log('[BUILD89 CHAPTERS] CHAPTER DATA RECEIVED:', list);
    
    // Normalize shape: { timeSec, title }
    const out = [];
    for (const c of list) {
      const t = Number(c && (c.time ?? c.timeSec ?? c.start_time ?? c.start));
      if (!Number.isFinite(t)) continue;
      out.push({ timeSec: t, title: String(c.title || c.name || '') });
    }
    out.sort((a, b) => a.timeSec - b.timeSec);
    state.videoChapters = out;
    console.log('[BUILD89 CHAPTERS] Normalized chapters:', out);
  } catch (err) {
    console.error('[BUILD89 CHAPTERS] Error fetching chapters:', err);
    state.videoChapters = [];
  }
  try {
    const st = state.player?.getState?.() || {};
    console.log('[BUILD89 CHAPTERS] Calling renderScrubChapters with duration:', st.durationSec);
    renderScrubChapters(st.durationSec || 0);
  } catch (err) {
    console.error('[BUILD89 CHAPTERS] Error rendering chapters:', err);
  }
}

  // BUILD100v7: Video metadata can come from multiple sources.
  // - The indexed episode object may have durationSec/width/height
  // - The progress store can have durationSec after a file has been played
  // Treat 0/NaN as missing.
  function bestDurationSec(v) {
    const d0 = Number(v && (v.durationSec ?? v.duration ?? v.durSec ?? v.lengthSec));
    if (Number.isFinite(d0) && d0 > 0) return d0;
    const p = (v && v.id) ? (getProgressForEpisode(v).progress) : null;
    const d1 = Number(p && p.durationSec);
    if (Number.isFinite(d1) && d1 > 0) return d1;
    return null;
  }

  function bestResolution(v) {
    const w0 = Number(v && (v.width ?? v.videoWidth ?? v.w));
    const h0 = Number(v && (v.height ?? v.videoHeight ?? v.h));
    if (Number.isFinite(w0) && w0 > 0 && Number.isFinite(h0) && h0 > 0) return { width: w0, height: h0 };
    return null;
  }

  function videoTechLine(v) {
    const bits = [];
    const dur = bestDurationSec(v);
    if (dur) bits.push(fmtTime(dur));
    const r = bestResolution(v);
    if (r) bits.push(`${r.width}×${r.height}`);
    if (v && v.ext) bits.push(String(v.ext));
    return bits.join(' • ');
  }

  function toast(msg, ms){
    const dur = Number(ms);
    const timeoutMs = Number.isFinite(dur) && dur > 0 ? dur : 900;
    const inPlayer = !!document.body.classList.contains('inVideoPlayer');

    // Library mode: use a floating transient toast independent of player layout.
    if (!inPlayer) {
      try {
        let libToast = document.getElementById('videoLibraryToast');
        if (!libToast) {
          libToast = document.createElement('div');
          libToast.id = 'videoLibraryToast';
          libToast.className = 'videoLibraryToast hidden';
          libToast.setAttribute('role', 'status');
          libToast.setAttribute('aria-live', 'polite');
          document.body.appendChild(libToast);
        }
        libToast.textContent = String(msg || '');
        libToast.classList.remove('hidden');
        if (state.libraryToastTimer) clearTimeout(state.libraryToastTimer);
        state.libraryToastTimer = setTimeout(() => {
          try { libToast.classList.add('hidden'); } catch {}
        }, timeoutMs);
        return;
      } catch {}
    }

    if (!el.videoToast) return;
    el.videoToast.textContent = String(msg || '');
    el.videoToast.classList.remove('hidden');
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      el.videoToast?.classList.add('hidden');
    }, timeoutMs);
  }

  // BUILD100v7: Hydrate missing duration/resolution metadata for episodes.
  // The scan/index layer doesn't always populate durationSec/width/height. To avoid regressions,
  // we never block UI. We probe only the current folder's visible episodes, with a small
  // concurrency cap, and we update rows in place.
  const epMetaHydrate = {
    q: [],
    inFlight: 0,
    max: 2,
    scheduled: false,
    seen: new Set(),
  };

  function pathToFileUrl(p) {
    const s = String(p || '');
    if (!s) return '';
    if (/^(file:|https?:)/i.test(s)) return s;

    // Windows paths: C:\foo\bar.mkv -> file:///C:/foo/bar.mkv
    if (/^[a-zA-Z]:[\\/]/.test(s)) {
      const norm = s.replace(/\\/g, '/');
      return 'file:///' + encodeURI(norm);
    }

    // POSIX absolute paths: /home/... -> file:///home/...
    if (s.startsWith('/')) return 'file://' + encodeURI(s);

    // Relative: let the runtime resolve.
    return encodeURI(s);
  }

  function episodeNeedsMeta(ep) {
    if (!ep) return false;
    const d = bestDurationSec(ep);
    const r = bestResolution(ep);
    // If we have both duration and resolution, we are done.
    if (d && r) return false;

    // If duration is already known from progress, only probe if resolution is missing.
    // Probing everything is expensive on large lists.
    if (d && !r) return true;
    if (!d) return true;
    return false;
  }

  async function probeEpisodeMetaHtml5(ep) {
    try {
      const src = pathToFileUrl(ep?.path);
      if (!src) return null;
      return await new Promise((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.muted = true;
        v.playsInline = true;
        v.style.position = 'fixed';
        v.style.left = '-99999px';
        v.style.top = '-99999px';
        document.body.appendChild(v);

        let done = false;
        const finish = (meta) => {
          if (done) return;
          done = true;
          try { v.pause(); } catch {}
          try { v.removeAttribute('src'); v.load(); } catch {}
          try { v.remove(); } catch {}
          resolve(meta || null);
        };

        const timer = setTimeout(() => finish(null), 12000);
        v.onloadedmetadata = () => {
          clearTimeout(timer);
          const dur = Number(v.duration);
          const w = Number(v.videoWidth);
          const h = Number(v.videoHeight);
          const meta = {
            durationSec: (Number.isFinite(dur) && dur > 0) ? dur : null,
            width: (Number.isFinite(w) && w > 0) ? w : null,
            height: (Number.isFinite(h) && h > 0) ? h : null,
          };
          finish(meta);
        };
        v.onerror = () => {
          clearTimeout(timer);
          finish(null);
        };

        try { v.src = src; } catch { finish(null); }
      });
    } catch {
      return null;
    }
  }

  async function probeEpisodeMeta(ep) {
    // Prefer a backend API if available (keeps this fast and consistent).
    try {
      const api = Tanko?.api?.video;
      const fn = api?.getMediaInfo || api?.probe || api?.getMeta;
      if (typeof fn === 'function') {
        const r = await fn(ep?.path);
        if (r) return r;
      }
    } catch {}
    // Fallback: HTML5 metadata probe.
    return await probeEpisodeMetaHtml5(ep);
  }

  function applyEpisodeMeta(ep, meta) {
    if (!ep || !meta) return;
    const d = Number(meta.durationSec);
    if (Number.isFinite(d) && d > 0) ep.durationSec = d;
    const w = Number(meta.width);
    const h = Number(meta.height);
    if (Number.isFinite(w) && w > 0) ep.width = w;
    if (Number.isFinite(h) && h > 0) ep.height = h;
  }

  function updateEpisodeRowCells(ep) {
    try {
      const id = String(ep?.id || '');
      if (!id) return;
      const row = el.videoEpisodesGrid?.querySelector?.(`.volTrow[data-id="${CSS.escape(id)}"]`);
      if (!row) return;
      const dur = bestDurationSec(ep);
      const r = bestResolution(ep);
      const durCell = row.querySelector('.cell.duration');
      const resCell = row.querySelector('.cell.resolution');
      if (durCell) durCell.textContent = dur ? fmtTime(dur) : '';
      if (resCell) resCell.textContent = r ? `${r.width}×${r.height}` : '';
    } catch {}
  }

  function scheduleEpisodeMetaHydration(list) {
    try {
      if (!Array.isArray(list) || !list.length) return;
      for (const ep of list) {
        const id = String(ep?.id || '');
        if (!id || epMetaHydrate.seen.has(id)) continue;
        if (!episodeNeedsMeta(ep)) continue;
        epMetaHydrate.seen.add(id);
        epMetaHydrate.q.push(ep);
      }
      if (epMetaHydrate.scheduled) return;
      epMetaHydrate.scheduled = true;
      const kick = () => {
        epMetaHydrate.scheduled = false;
        drainEpisodeMetaQueue();
      };
      if (typeof requestIdleCallback !== 'undefined') requestIdleCallback(kick, { timeout: 250 });
      else setTimeout(kick, 0);
    } catch {}
  }

  async function drainEpisodeMetaQueue() {
    try {
      if (epMetaHydrate.inFlight >= epMetaHydrate.max) return;
      if (!epMetaHydrate.q.length) return;
      while (epMetaHydrate.inFlight < epMetaHydrate.max && epMetaHydrate.q.length) {
        const ep = epMetaHydrate.q.shift();
        if (!ep) continue;
        epMetaHydrate.inFlight++;
        (async () => {
          try {
            const meta = await probeEpisodeMeta(ep);
            applyEpisodeMeta(ep, meta);
            updateEpisodeRowCells(ep);
            // If the hydrated episode is currently selected, refresh the preview.
            if (String(state.selectedEpisodeId || '') === String(ep.id || '')) {
              try { updateEpisodePreview(ep); } catch {}
            }
          } catch {} finally {
            epMetaHydrate.inFlight--;
            // Keep draining until the queue is empty.
            if (epMetaHydrate.q.length) {
              if (typeof requestIdleCallback !== 'undefined') requestIdleCallback(drainEpisodeMetaQueue, { timeout: 250 });
              else setTimeout(drainEpisodeMetaQueue, 0);
            }
          }
        })();
      }
    } catch {}
  }

  // BUILD40B: The HTML toast is intentionally hidden in fullscreen.
  // Use mpv's native OSD (show-text) while in fullscreen so the user still
  // gets feedback for volume/speed/subtitle actions.
  function hudNotice(msg, ms){
    const text = String(msg || '');
    const dur = Number(ms);
    const timeoutMs = Number.isFinite(dur) && dur > 0 ? Math.round(dur) : 900;

    const inFs = document.body.classList.contains('videoFullscreen');
    const canOsd = !!(inFs && state.player && typeof state.player.command === 'function');
    if (canOsd) {
      try {
        state.player.command(['show-text', text, String(timeoutMs)]);
        return;
      } catch {}
    }
    toast(text, timeoutMs);
  }

  // Build 21: custom show posters (file picker + clipboard paste)
  async function fileToJpegDataUrl(file) {
    try {
      if (!file) return null;
      const maxDim = 900; // keep posters lightweight
      const bmp = await createImageBitmap(file);
      const w = Number(bmp.width) || 0;
      const h = Number(bmp.height) || 0;
      if (!w || !h) return null;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.drawImage(bmp, 0, 0, cw, ch);
      try { bmp.close && bmp.close(); } catch {}
      return canvas.toDataURL('image/jpeg', 0.82);
    } catch {
      return null;
    }
  }

  // Build 25: turn a local image URL (file://) into a lightweight JPEG data URL.
  // Used for auto-posters (episode scan thumbs -> show poster).
  async function imageUrlToJpegDataUrl(url) {
    try {
      const u = url ? String(url) : '';
      if (!u) return null;
      // If already a data URL, normalize size once (also ensures JPEG output).
      const img = new Image();
      img.decoding = 'async';
      img.loading = 'eager';
      img.src = u;
      if (img.decode) await img.decode();
      const w = Number(img.naturalWidth || img.width) || 0;
      const h = Number(img.naturalHeight || img.height) || 0;
      if (!w || !h) return null;

      const maxDim = 900;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.drawImage(img, 0, 0, cw, ch);
      return canvas.toDataURL('image/jpeg', 0.82);
    } catch {
      return null;
    }
  }


  function pickImageFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      input.onchange = () => {
        const f = input.files && input.files[0] ? input.files[0] : null;
        resolve(f);
        try { input.remove(); } catch {}
      };
      document.body.appendChild(input);
      input.click();
      // If the dialog is cancelled, onchange won't fire in some edge cases.
      setTimeout(() => {
        if (document.body.contains(input)) {
          try { input.remove(); } catch {}
        }
      }, 120000);
    });
  }

  async function setShowPosterFromPicker(showId) {
    if (!Tanko.api.videoPoster.save) { toast('Poster system unavailable'); return; }
    const f = await pickImageFile();
    if (!f) return;
    const dataUrl = await fileToJpegDataUrl(f);
    if (!dataUrl) { toast('Invalid image'); return; }
    const r = await Tanko.api.videoPoster.save(String(showId), dataUrl);
    if (!r || r.ok === false) { toast('Failed to set poster'); return; }
    bumpShowPosterRev(showId);
    // Show the new poster immediately (avoid file:// cache delays).
    setShowPosterCacheImmediate(showId, dataUrl);
    rerenderVideoAfterProgress();
    // Replace the temporary data URL with the stored poster URL after the save settles.
    setTimeout(() => {
      try {
        invalidateShowPoster(showId);
        getShowPosterUrl(showId).then((u) => { if (u) setShowPosterCacheImmediate(showId, u); });
      } catch {}
    }, 150);
  }

  // Build 23: optional drag-and-drop poster set on show tiles.
  function firstImageFileFromDataTransfer(dt) {
    try {
      if (!dt) return null;
      const files = dt.files ? Array.from(dt.files) : [];
      for (const f of files) {
        const t = String(f?.type || '').toLowerCase();
        if (t.startsWith('image/')) return f;
      }
      // Fallback: some platforms omit type; accept common extensions.
      for (const f of files) {
        const n = String(f?.name || '').toLowerCase();
        if (n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.bmp') || n.endsWith('.webp')) return f;
      }
    } catch {}
    return null;
  }

  async function setShowPosterFromDroppedFile(showId, file) {
    try {
      if (!Tanko.api.videoPoster.save) { toast('Poster system unavailable'); return; }
      if (!file) return;
      const dataUrl = await fileToJpegDataUrl(file);
      if (!dataUrl) { toast('Invalid image'); return; }
      const r = await Tanko.api.videoPoster.save(String(showId), dataUrl);
      if (!r || r.ok === false) { toast('Failed to set poster'); return; }
      bumpShowPosterRev(showId);
      setShowPosterCacheImmediate(showId, dataUrl);
      rerenderVideoAfterProgress();
      setTimeout(() => {
        try {
          invalidateShowPoster(showId);
          getShowPosterUrl(showId).then((u) => { if (u) setShowPosterCacheImmediate(showId, u); });
        } catch {}
      }, 150);
    } catch {
      toast('Failed to set poster');
    }
  }

  async function removeShowPoster(showId) {
    if (!Tanko.api.videoPoster.delete) return;
    const sid = String(showId || '');
    const r = await Tanko.api.videoPoster.delete(sid);
    if (!r || r.ok === false) { toast('Failed to remove poster'); return; }

    // If this show was using an auto-generated userData poster as thumbPath,
    // clear it immediately so the UI falls back to folder poster / episode thumb.
    let removedPath = '';
    try {
      const sh = (Array.isArray(state.shows) ? state.shows : []).find(s => String(s?.id || '') === sid);
      if (sh && isUserPosterPathForShow(sid, sh.thumbPath)) {
        removedPath = String(sh.thumbPath || '');
        sh.thumbPath = null;
      }
    } catch {}

    // Drop stale thumbnail URL caches for the removed on-disk file.
    try {
      if (removedPath) {
        thumbUrlCache.delete(removedPath);
        const u = toFileUrl(removedPath);
        if (u) thumbPreload.delete(u);
      }
    } catch {}

    bumpShowPosterRev(sid);
    invalidateShowPoster(sid);
    try { showPosterCache.delete(sid); showPosterInFlight.delete(sid); } catch {}

    // Force currently-mounted poster <img> nodes to refresh immediately.
    try {
      const sh = (Array.isArray(state.shows) ? state.shows : []).find(s => String(s?.id || '') === sid) || null;
      const fallback = sh ? pickShowThumb(sh) : EMPTY_IMG;
      const q = `img[data-poster-for="${_cssEsc(sid)}"]`;
      document.querySelectorAll(q).forEach((img) => {
        try {
          if (!img || !img.isConnected) return;
          img.src = fallback || EMPTY_IMG;
        } catch {}
      });
    } catch {}

    if (state.mode === 'videos') {
      if (state.videoSubView === 'home') renderVideoHome();
      else if (state.videoSubView === 'show') renderVideoShowView();
      renderContinue();
    } else {
      rerenderVideoAfterProgress();
    }
    toast('Poster removed', 1200);
  }


  async function pasteShowPosterFromClipboard(showId) {
    if (!Tanko.api.videoPoster.paste) { toast('Clipboard posters unavailable'); return; }
    const r = await Tanko.api.videoPoster.paste(String(showId));
    if (!r || r.ok === false) {
      const why = r && r.reason ? String(r.reason) : '';
      if (why === 'no_image') toast('No image in clipboard');
      else toast('Failed to paste poster');
      return;
    }
    bumpShowPosterRev(showId);
    invalidateShowPoster(showId);
    // Pull the new stored poster URL and force-refresh mounted <img> tags.
    getShowPosterUrl(showId).then((u) => { if (u) setShowPosterCacheImmediate(showId, u); });
    rerenderVideoAfterProgress();
    // Follow-up refresh to defeat file:// caching on some platforms.
    setTimeout(() => {
      try {
        invalidateShowPoster(showId);
        getShowPosterUrl(showId).then((u) => { if (u) setShowPosterCacheImmediate(showId, u); });
      } catch {}
    }, 200);
  }

  async function generateAutoThumbnailForShow(showId, opts = {}) {
    const sid = String(showId || '');
    if (!sid) return;
    if (!Tanko.api.video || typeof Tanko.api.video.generateShowThumbnail !== 'function') {
      toast('Auto-thumbnail generator unavailable');
      return;
    }

    toast('Generating auto thumbnail...', 1300);
    const r = await Tanko.api.video.generateShowThumbnail(sid, opts);
    if (!r || r.ok === false) {
      const err = (r && r.error) ? `: ${String(r.error)}` : '';
      toast(`Failed to generate thumbnail${err}`);
      return;
    }

    if (r.generated) {
      bumpShowPosterRev(sid);
      invalidateShowPoster(sid);
      try { showPosterCache.delete(sid); showPosterInFlight.delete(sid); } catch {}
      try {
        const u = await getShowPosterUrl(sid);
        if (u) setShowPosterCacheImmediate(sid, u);
      } catch {}
      rerenderVideoAfterProgress();
      toast('Auto thumbnail generated', 1800);
      return;
    }

    const why = String(r.reason || '');
    if (why === 'folder_poster_exists') { toast('Show already has a folder poster'); return; }
    if (why === 'user_poster_exists') { toast('Show already has a custom poster'); return; }
    if (why === 'no_episode_file') { toast('No playable episode file found for this show'); return; }
    if (why === 'show_not_found') { toast('Show not found'); return; }
    if (why === 'invalid_show_id') { toast('Invalid show'); return; }
    if (why === 'generation_failed') { toast('Auto thumbnail generation failed'); return; }
    toast('No thumbnail generated');
  }


  function showRetryToast(summary, logPath){
    // Persist a single clear failure message with a manual retry action.
    state._retryAvailable = true;
    const lp = logPath ? ` See mpv.log: ${logPath}` : ' See mpv.log in the app data folder.';
    const msg = `${summary} Click to retry.${lp}`;

    if (state.toastTimer){
      clearTimeout(state.toastTimer);
      state.toastTimer = null;
    }

    if (el.videoToast){
      el.videoToast.textContent = msg;
      el.videoToast.classList.remove('hidden');
    }
  }

  function clearRetryToast(){
    state._retryAvailable = false;
    state._retryPending = null;

    if (state.toastTimer){
      clearTimeout(state.toastTimer);
      state.toastTimer = null;
    }

    if (el.videoToast){
      el.videoToast.classList.add('hidden');
    }
  }

  async function teardownMpvPlayer(){
    if (!state.player || state.player.kind !== 'mpv') return;

    stopProgressPoll();

    try { await 
// AI_EXIT_PATH: final save should be triggered during teardown / before leaving player to avoid missing the last poll tick.
saveNow(true); } catch {}
    try { await state.player.destroy(); } catch {}

    state.player = null;
    state._playerEventsBoundFor = null;
    document.body.classList.remove('mpvEngine');
        document.body.classList.remove('mpvDetached');
  }

  async function retryLastMpvFailure(){
    if (state._retrying) return;

    const payload = state._retryPending;
    const v = (payload && payload.video) ? payload.video : state.now;
    if (!v || !v.path) return;

    // Tankoban Pro V2: Optional external Qt player (file-based progress bridge).
    // Enable by setting localStorage key: tankobanUseQtPlayer = '1'
    try {
      const useQt = (typeof localStorage !== 'undefined' && localStorage.getItem('tankobanUseQtPlayer') === '1');
      const api = (window && window.Tanko && window.Tanko.api) ? window.Tanko.api : null;
      if (useQt && api && api.player && typeof api.player.launchQt === 'function') {
        const sessionId = String(Date.now());
        const start = (opts && Number.isFinite(Number(opts.resumeOverridePosSec))) ? Number(opts.resumeOverridePosSec) : 0;
        try { toast('Opening in Qt player…', 1200); } catch {}
        await api.player.launchQt({ filePath: String(v.path), startSeconds: start, sessionId });
        return;
      }
    } catch {}

    state._retrying = true;
    try {
      const resumePosSec = (payload && Number.isFinite(Number(payload.resumePosSec))) ? Number(payload.resumePosSec) : 0;
      state._suppressResumePromptOnce = true;
      state._resumeOverridePosSec = resumePosSec;

      clearRetryToast();
      await teardownMpvPlayer();
      await openVideo(v);
    } finally {
      state._retrying = false;
    }
  }

  // Build 11: show mpv errors once per failure
  let lastMpvErrorSig = '';
  let lastMpvErrorAt = 0;

  // Tankoban Plus Build 5.4A: track selectors (mpv only)
  let tracksPanelOpen = false;

  // Build 24 — quick tools mini panels (Volume + Speed)
  let volPanelOpen = false;

  function closeVolPanel(){
    volPanelOpen = false;
    el.videoVolPanel?.classList.add('hidden');
  }

  function closeAllToolPanels(){
    if (tracksPanelOpen) closeTracksPanel();
    if (speedPanelOpen) closeSpeedPanel(); // Build 60
    setDiagnosticsVisible(false);
    if (volPanelOpen) closeVolPanel();
    if (playlistPanelOpen) closePlaylistPanel();
    closeVideoCtxMenu();
  }

  // Build 56C: right-click context menu (custom, consistent across platforms)
  let ctxMenuOpen = false;

  // BUILD64: Submenu state
  let ctxActiveSubmenu = null;

  function populateContextMenuSubmenus() {
    // BUILD 65 FIX: Work even if no player is loaded yet
    const hasPlayer = !!state.player;
    
    // BUILD 88 FIX 2.3: Cache menu HTML and only rebuild when state changes
    const st = hasPlayer ? (state.player.getState?.() || {}) : {};
    const subsVisible = (st && typeof st.subtitlesVisible === 'boolean') ? st.subtitlesVisible : true;

    const pickSelectedId = (tracks) => {
      try {
        const sel = Array.isArray(tracks) ? tracks.find(t => t && t.selected) : null;
        if (sel && sel.id != null) return String(sel.id);
      } catch {}
      return '';
    };

    const currentAudioId = hasPlayer ? pickSelectedId(lastAudioTracks) : '';
    const currentSubId = hasPlayer ? (subsVisible ? (pickSelectedId(lastSubtitleTracks) || '') : 'no') : '';
    const currentSpeed = hasPlayer
      ? (st.speed ?? state.settings.speed ?? 1)
      : (state.settings.speed ?? 1);
    const audioTracksHash = JSON.stringify(lastAudioTracks.map(t => t.id));
    const subTracksHash = JSON.stringify(lastSubtitleTracks.map(t => t.id));
    
    const newState = {
      hasPlayer,
      currentAudioId,
      currentSubId,
      currentSpeed,
      audioTracksHash,
      subTracksHash,
      aspectMode: cachedAspectMode
    };
    
    // Check if we can use cached HTML
    const stateChanged = !menuCacheState || 
      menuCacheState.hasPlayer !== newState.hasPlayer ||
      menuCacheState.currentAudioId !== newState.currentAudioId ||
      menuCacheState.currentSubId !== newState.currentSubId ||
      Math.abs(menuCacheState.currentSpeed - newState.currentSpeed) >= 0.01 ||
      menuCacheState.audioTracksHash !== newState.audioTracksHash ||
      menuCacheState.subTracksHash !== newState.subTracksHash ||
      menuCacheState.aspectMode !== newState.aspectMode;
    
    if (!stateChanged && menuCacheState) {
      // Use cached HTML
      const audioContainer = document.getElementById('ctxAudioTracks');
      const subContainer = document.getElementById('ctxSubtitleTracks');
      const aspectContainer = document.getElementById('ctxAspectRatios');
      
      if (audioContainer && menuCacheHTML.audio) audioContainer.innerHTML = menuCacheHTML.audio;
      if (subContainer && menuCacheHTML.subtitle) subContainer.innerHTML = menuCacheHTML.subtitle;
      if (aspectContainer && menuCacheHTML.aspect) aspectContainer.innerHTML = menuCacheHTML.aspect;
      
      // Update speed markers (always needs fresh update since it's inline)
      try {
        el.videoCtxMenu?.querySelectorAll('[data-act="speed"]').forEach((btn) => {
          const speed = Number(btn.getAttribute('data-speed'));
          btn.classList.toggle('active', Math.abs(speed - currentSpeed) < 0.01);
        });
      } catch {}
      return;
    }
    
    // Rebuild and cache

    // Populate audio tracks
    const audioContainer = document.getElementById('ctxAudioTracks');
    if (audioContainer) {
      audioContainer.innerHTML = '';
      const tracks = hasPlayer ? (lastAudioTracks || []) : [];
      console.log('[CONTEXT] Populating audio tracks:', tracks.length, 'tracks');
      if (tracks.length > 0) {
        tracks.forEach((track) => {
          const btn = document.createElement('button');
          btn.className = 'ctxItem';
          btn.setAttribute('role', 'menuitem');
          btn.setAttribute('data-act', 'selectAudioTrack');
          btn.setAttribute('data-track-id', String(track.id));
          if (String(track.id) === currentAudioId) btn.classList.add('active');
          btn.textContent = track.title || `Track ${track.id}`;
          audioContainer.appendChild(btn);
        });
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'ctxItem';
        placeholder.style.opacity = '0.5';
        placeholder.style.cursor = 'default';
        placeholder.textContent = hasPlayer ? 'No audio tracks' : 'Load a video first';
        audioContainer.appendChild(placeholder);
      }
      menuCacheHTML.audio = audioContainer.innerHTML;
    }

    // Populate subtitle tracks
    const subContainer = document.getElementById('ctxSubtitleTracks');
    if (subContainer) {
      subContainer.innerHTML = '';
      const tracks = hasPlayer ? (lastSubtitleTracks || []) : [];
      console.log('[CONTEXT] Populating subtitle tracks:', tracks.length, 'tracks');
      
      // "Disabled" option
      const disabledBtn = document.createElement('button');
      disabledBtn.className = 'ctxItem';
      disabledBtn.setAttribute('role', 'menuitem');
      disabledBtn.setAttribute('data-act', 'selectSubtitleTrack');
      disabledBtn.setAttribute('data-track-id', 'no');
      if (currentSubId === 'no' || currentSubId === '' || currentSubId === 'false') {
        disabledBtn.classList.add('active');
      }
      disabledBtn.textContent = 'Disabled';
      subContainer.appendChild(disabledBtn);
      
      if (tracks.length > 0) {
        tracks.forEach((track) => {
          const btn = document.createElement('button');
          btn.className = 'ctxItem';
          btn.setAttribute('role', 'menuitem');
          btn.setAttribute('data-act', 'selectSubtitleTrack');
          btn.setAttribute('data-track-id', String(track.id));
          if (String(track.id) === currentSubId) btn.classList.add('active');
          btn.textContent = track.title || `Track ${track.id}`;
          subContainer.appendChild(btn);
        });
      }
      menuCacheHTML.subtitle = subContainer.innerHTML;
    }

    // Populate aspect ratios
    const aspectContainer = document.getElementById('ctxAspectRatios');
    if (aspectContainer) {
      aspectContainer.innerHTML = '';
      const ratios = [
        { mode: 'auto', label: 'Auto' },
        { mode: 'reset', label: 'Reset' },
        { mode: '16:9', label: '16:9' },
        { mode: '4:3', label: '4:3' },
        { mode: '2.35:1', label: '2.35:1' },
        { mode: '1:1', label: '1:1' }
      ];
      const current = cachedAspectMode || 'auto';
      ratios.forEach((ratio) => {
        const btn = document.createElement('button');
        btn.className = 'ctxItem';
        btn.setAttribute('role', 'menuitem');
        btn.setAttribute('data-act', 'aspectRatio');
        btn.setAttribute('data-aspect', ratio.mode);
        if (ratio.mode === current) btn.classList.add('active');
        btn.textContent = ratio.label;
        aspectContainer.appendChild(btn);
      });
      menuCacheHTML.aspect = aspectContainer.innerHTML;
    }

    // Update current speed marking
    try {
      el.videoCtxMenu?.querySelectorAll('[data-act="speed"]').forEach((btn) => {
        const speed = Number(btn.getAttribute('data-speed'));
        btn.classList.toggle('active', Math.abs(speed - currentSpeed) < 0.01);
      });
    } catch {}
    
    // Save cache state
    menuCacheState = newState;
  }

  async function updateAlwaysOnTopUI() {
    try {
      const isOnTop = await Tanko.api.window.isAlwaysOnTop?.();
      const check = document.getElementById('ctxAlwaysOnTopCheck');
      if (check) {
        check.classList.toggle('visible', !!isOnTop);
      }
    } catch {}
  }

  function closeVideoCtxMenu(){
    ctxMenuOpen = false;
    ctxActiveSubmenu = null;
    try {
      el.videoCtxMenu?.classList.add('hidden');
      try { if (el.videoCtxMenu) el.videoCtxMenu.style.pointerEvents = 'none'; } catch {}
      const panels = el.videoCtxMenu?.querySelectorAll?.('.ctxSubmenuPanel');
      if (panels) panels.forEach((p) => p.classList.add('hidden'));
    } catch {}
  }

  function openVideoCtxMenu(clientX, clientY){
    console.log('[CONTEXT] Opening menu at', clientX, clientY);

    if (state.mode !== 'videos') {
      console.log('[CONTEXT] Blocked: not in videos mode');
      return;
    }

    if (!el.videoCtxMenu) {
      console.error('[CONTEXT] Menu element not found');
      return;
    }

    // Close other panels so the menu never stacks weirdly.
    closeAllToolPanels();

    // Populate dynamic submenus (should work even without a player)
    try { populateContextMenuSubmenus(); } catch {}

    ctxMenuOpen = true;
    ctxActiveSubmenu = null;
    el.videoCtxMenu.classList.remove('hidden');
    try { el.videoCtxMenu.style.pointerEvents = 'auto'; } catch {}

    // Hide any submenu panels by default on open
    try {
      el.videoCtxMenu.querySelectorAll('.ctxSubmenuPanel').forEach((p) => p.classList.add('hidden'));
    } catch {}

    // Position menu (clamped to viewport)
    const menu = el.videoCtxMenu;
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;

    let x = Number(clientX) || 0;
    let y = Number(clientY) || 0;

    const rect = menu.getBoundingClientRect();
    const mw = rect.width || 240;
    const mh = rect.height || 300;

    x = Math.max(8, Math.min(x, Math.max(8, vw - mw - 8)));
    y = Math.max(8, Math.min(y, Math.max(8, vh - mh - 8)));

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // Enable/disable items based on current state and capabilities
    try {
      const hasPlayer = !!state.player;
      const { prev, next } = hasPlayer ? getPrevNextEpisodes() : { prev: null, next: null };

      menu.querySelectorAll('button.ctxItem').forEach((b) => {
        const act = String(b.getAttribute('data-act') || '');

        // Always enabled
        if (act === 'openFile' || act === 'alwaysOnTop' || act === 'toggleFullscreen') {
          b.disabled = false;
          return;
        }

        // Requires player
        if (!hasPlayer) {
          b.disabled = true;
          return;
        }

        // Playlist navigation
        if (act === 'prevEpisode') {
          b.disabled = !prev;
          b.title = prev ? `Play: ${prev.title || 'Previous episode'}` : 'No previous episode';
          return;
        }
        if (act === 'nextEpisode') {
          b.disabled = !next;
          b.title = next ? `Play: ${next.title || 'Next episode'}` : 'No next episode';
          return;
        }

        // Everything else requires player
        b.disabled = false;
      });

      // Update always-on-top checkmark
      updateAlwaysOnTopUI();

      // Refresh dynamic submenu state (tracks) on open so labels/checkmarks stay accurate.
      safe(() => {
        try {
          return refreshTracksFromPlayer().then(() => { try { populateContextMenuSubmenus(); } catch {} });
        } catch {}
      });
    } catch (err) {
      console.error('[CONTEXT] Error updating menu items:', err);
    }

    // Always show HUD when opening context menu
    showHud();
  }

  // Build 67: Anchored volume popover
  function openVolPanel(){
    if (!el.videoVolPanel || !el.videoMuteBtn) return;
    if (!state.player) return;

    closeAllToolPanels();
    volPanelOpen = true;

    // Position panel below mute button
    const rect = el.videoMuteBtn.getBoundingClientRect();
    el.videoVolPanel.style.position = 'fixed';
    el.videoVolPanel.style.left = `${rect.left}px`;
    el.videoVolPanel.style.top = `${rect.bottom + 4}px`;

    el.videoVolPanel.classList.remove('hidden');

    // Sync volume display
    try {
      const st = state.player.getState();
      const vol = Math.round(Number(st.volume) || 100);
      if (el.videoVolPct) el.videoVolPct.textContent = `${vol}%`;
      if (el.videoVol) el.videoVol.value = String(vol);
    } catch {}

    setTimeout(() => el.videoVol?.focus?.(), 0);
    showHud();
  }


  // Tankoban Plus Build 5.4B: delay controls + preferred languages
  const DELAY_STEP_SEC = 0.05;
  const DELAY_CLAMP_SEC = 30;
  let lastAudioTracks = [];
  let lastSubtitleTracks = [];
  let lastSubtitleTrackIdForToggle = null;
  let cachedAudioDelaySec = 0;
  let cachedSubtitleDelaySec = 0;
  let preferredTracksAppliedForVideoId = null;
  
  // BUILD 88 FIX 2.3: Cache for context menu submenus
  let menuCacheState = null;
  let menuCacheHTML = {
    audio: '',
    subtitle: '',
    aspect: '',
    speed: ''
  };
  
// Tankoban Plus Build 5.4C: transforms (mpv only)
let cachedAspectMode = 'auto';
let cachedCropMode = 'none';


  function fmtDelay(sec){
    const v = Number(sec);
    const n = Number.isFinite(v) ? v : 0;
    const s = Math.round(n * 100) / 100;
    const sign = s > 0 ? '+' : '';
    return `${sign}${s.toFixed(2)}s`;
  }

  function langEq(a, b){
    if (!a || !b) return false;
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  }

  function setDelayUiVisible(visible){
    const show = !!visible;
    if (el.videoAudioDelayControls) el.videoAudioDelayControls.classList.toggle('hidden', !show);
    if (el.videoSubtitleDelayControls) el.videoSubtitleDelayControls.classList.toggle('hidden', !show);
  }

  function setTrackSelectUiVisible(visible){
    const show = !!visible;
    try {
      const aLabel = el.videoTracksPanel?.querySelector?.('label[for="videoAudioTrackSelect"]');
      const sLabel = el.videoTracksPanel?.querySelector?.('label[for="videoSubtitleTrackSelect"]');
      if (aLabel) aLabel.classList.toggle('hidden', !show);
      if (sLabel) sLabel.classList.toggle('hidden', !show);
    } catch {}
    if (el.videoAudioTrackSelect) el.videoAudioTrackSelect.classList.toggle('hidden', !show);
    if (el.videoSubtitleTrackSelect) el.videoSubtitleTrackSelect.classList.toggle('hidden', !show);
  }

  function syncDelayUi(){
    if (el.videoAudioDelayValue) el.videoAudioDelayValue.textContent = fmtDelay(cachedAudioDelaySec);
    if (el.videoSubtitleDelayValue) el.videoSubtitleDelayValue.textContent = fmtDelay(cachedSubtitleDelaySec);
  }

  async function refreshTracksFromPlayer(){
    try {
      if (!state.player) {
        lastAudioTracks = [];
        lastSubtitleTracks = [];
        return { ok: false, audioTracks: [], subtitleTracks: [] };
      }

      const caps = state.player?.capabilities || {};
      const canTracks = !!(caps.tracks && typeof state.player.getAudioTracks === 'function' && typeof state.player.getSubtitleTracks === 'function');
      if (!canTracks) {
        lastAudioTracks = [];
        lastSubtitleTracks = [];
        return { ok: false, audioTracks: [], subtitleTracks: [] };
      }

      const retry = async (fn, tries = 8, delayMs = 80) => {
        let last = null;
        for (let i = 0; i < tries; i++) {
          try {
            const r = await fn();
            last = r;
            if (r && r.ok && Array.isArray(r.tracks)) return r;
          } catch (e) {
            last = { ok: false, error: String(e && e.message ? e.message : e) };
          }
          await new Promise(res => setTimeout(res, delayMs));
        }
        return last || { ok: false, tracks: [] };
      };

      const ar = await retry(() => state.player.getAudioTracks(), 10, 90);
      const sr = await retry(() => state.player.getSubtitleTracks(), 10, 90);

      lastAudioTracks = Array.isArray(ar?.tracks) ? ar.tracks : [];
      lastSubtitleTracks = Array.isArray(sr?.tracks) ? sr.tracks : [];

      // Keep the last-selected subtitle id handy for toggle behavior
      try {
        const selSub = lastSubtitleTracks.find(t => t && t.selected);
        if (selSub && selSub.id != null) lastSubtitleTrackIdForToggle = String(selSub.id);
      } catch {}

      return { ok: true, audioTracks: lastAudioTracks, subtitleTracks: lastSubtitleTracks };
    } catch (err) {
      console.error('[video] refreshTracksFromPlayer failed', err);
      lastAudioTracks = [];
      lastSubtitleTracks = [];
      return { ok: false, audioTracks: [], subtitleTracks: [] };
    }
  }

  async function refreshDelaysFromPlayer(){
    if (!state.player) return;
    const caps = state.player?.capabilities || {};
    if (!caps.delays) return;

    try {
      if (typeof state.player.getAudioDelay === 'function') {
        const r = await state.player.getAudioDelay();
        if (r && r.ok) cachedAudioDelaySec = Number(r.value) || 0;
      }
    } catch {}

    try {
      if (typeof state.player.getSubtitleDelay === 'function') {
        const r = await state.player.getSubtitleDelay();
        if (r && r.ok) cachedSubtitleDelaySec = Number(r.value) || 0;
      }
    } catch {}

    // If bridge getters fail, fall back to the adapter state.
    const st = state.player?.getState?.();
    if (st && Number.isFinite(Number(st.audioDelaySec))) cachedAudioDelaySec = Number(st.audioDelaySec);
    if (st && Number.isFinite(Number(st.subtitleDelaySec))) cachedSubtitleDelaySec = Number(st.subtitleDelaySec);
    syncDelayUi();
  }

  async function nudgeDelay(kind, dir){
    if (!state.player) return;
    const caps = state.player?.capabilities || {};
    if (!caps.delays) return;

    await refreshDelaysFromPlayer();
    const delta = (Number(dir) || 0) * DELAY_STEP_SEC;
    if (kind === 'audio' && typeof state.player.setAudioDelay === 'function') {
      const next = clamp((Number(cachedAudioDelaySec) || 0) + delta, -DELAY_CLAMP_SEC, DELAY_CLAMP_SEC);
      const r = await state.player.setAudioDelay(next);
      if (r && r.ok === false && !r.alreadyRunning) { hudNotice(r.error || 'Failed to set audio delay'); return; }
      cachedAudioDelaySec = next;
      syncDelayUi();
      hudNotice(`Audio delay ${fmtDelay(next)}`);
      // Build 58: persist delay setting per episode
      schedulePlaybackPreferencesSave();
      return;
    }
    if (kind === 'subtitle' && typeof state.player.setSubtitleDelay === 'function') {
      const next = clamp((Number(cachedSubtitleDelaySec) || 0) + delta, -DELAY_CLAMP_SEC, DELAY_CLAMP_SEC);
      const r = await state.player.setSubtitleDelay(next);
      if (r && r.ok === false) { hudNotice(r.error || 'Failed to set subtitle delay'); return; }
      cachedSubtitleDelaySec = next;
      syncDelayUi();
      hudNotice(`Subtitle delay ${fmtDelay(next)}`);
      // Build 58: persist delay setting per episode
      schedulePlaybackPreferencesSave();
    }
  }



// Tankoban Plus Build 5.4C: basic aspect/crop presets + reset (mpv only)
function setTransformsUiVisible(visible){
  const show = !!visible;
  if (el.videoTransformsBlock) el.videoTransformsBlock.classList.toggle('hidden', !show);
}

function normalizeAspectMode(raw){
  const v = (raw == null) ? '' : String(raw).trim();
  if (!v || v === 'no' || v === '-1' || v === '0') return 'auto';
  const known = ['16:9','4:3','1:1','21:9'];
  for (const k of known) {
    if (v === k) return k;
    if (v.replace(/\s+/g,'') === k) return k;
  }
  return 'custom';
}

function normalizeCropMode(raw){
  const v = (raw == null) ? '' : String(raw).trim();
  if (!v || v === 'no' || v === '-1' || v === '0') return 'none';
  // If we set a preset this session, keep it; otherwise show "Custom".
  if (cachedCropMode && cachedCropMode !== 'none' && cachedCropMode !== 'custom') return cachedCropMode;
  return 'custom';
}

function syncTransformsUi(){
  if (el.videoAspectSelect) el.videoAspectSelect.value = cachedAspectMode || 'auto';
  if (el.videoCropSelect) el.videoCropSelect.value = cachedCropMode || 'none';
}

async function refreshTransformsFromPlayer(){
  if (!state.player) return;
  const caps = state.player?.capabilities || {};
  if (!caps.transforms) return;

  try {
    if (typeof state.player.getAspectRatio === 'function') {
      const r = await state.player.getAspectRatio();
      if (r && r.ok) cachedAspectMode = normalizeAspectMode(r.value);
    }
  } catch {}

  try {
    if (typeof state.player.getCrop === 'function') {
      const r = await state.player.getCrop();
      if (r && r.ok) cachedCropMode = normalizeCropMode(r.value);
    }
  } catch {}

  syncTransformsUi();
}

  function trackLabel(t){
    const id = (t && (t.id ?? t.trackId)) != null ? String(t.id ?? t.trackId) : '';
    const title = t && (t.title || t.name) ? String(t.title || t.name) : '';
    const lang = t && t.lang ? String(t.lang) : '';
    const base = title || (lang ? lang.toUpperCase() : (id ? `Track ${id}` : 'Track'));
    const extra = [];
    if (lang && title && !title.toLowerCase().includes(lang.toLowerCase())) extra.push(lang.toUpperCase());
    if (t && t.external) extra.push('External');
    return extra.length ? `${base} (${extra.join(', ')})` : base;
  }

  function fillSelect(selectEl, tracks, opts){
    if (!selectEl) return;
    const options = [];
    const allowOff = !!(opts && opts.allowOff);
    const offLabel = (opts && opts.offLabel) ? String(opts.offLabel) : 'Off';
    if (allowOff) options.push({ value: 'no', label: offLabel, selected: false });
    for (const t of (Array.isArray(tracks) ? tracks : [])) {
      const id = (t && (t.id ?? t.trackId)) != null ? String(t.id ?? t.trackId) : '';
      if (!id) continue;
      options.push({ value: id, label: trackLabel(t), selected: !!t.selected });
    }

    // render
    selectEl.innerHTML = '';
    let selectedValue = '';
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      if (o.selected) selectedValue = o.value;
      selectEl.appendChild(opt);
    }

    // default selection
    if (selectedValue) {
      selectEl.value = selectedValue;
    } else if (allowOff) {
      // Default-to-ON: if subtitles exist, pick the first real track instead of Off.
      const firstReal = options.find(o => o && o.value && o.value !== 'no');
      selectEl.value = firstReal ? firstReal.value : 'no';
    }
  }

  async function openTracksPanel(focus){
    if (!el.videoTracksPanel) return;
    if (!state.player) return;

    const caps = (state.player && state.player.capabilities) ? state.player.capabilities : {};
    const showTracks = !!(caps.tracks && typeof state.player.getAudioTracks === 'function' && typeof state.player.getSubtitleTracks === 'function');
    const showDelay = !!(caps.delays && (typeof state.player.getAudioDelay === 'function' || typeof state.player.getSubtitleDelay === 'function' || typeof state.player.setAudioDelay === 'function' || typeof state.player.setSubtitleDelay === 'function'));
    const showTransforms = !!(caps.transforms);
    const showExternalSubs = !!(caps.externalSubtitles && typeof state.player.addExternalSubtitle === 'function' && window.Tanko && window.Tanko.api && typeof window.Tanko.api.window.openSubtitleFileDialog === 'function');

    if (!showTracks && !showDelay && !showTransforms) {
      toast('Tracks/delays are unavailable in this mode');
      return;
    }

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const fetchTracksWithRetry = async (fn, { tries = 3, delayMs = 250 } = {}) => {
      let lastErr = null;
      for (let i = 0; i < tries; i += 1) {
        try {
          const res = await fn();
          // MPV can take a moment to populate track-list right after load.
          if (res && typeof res === 'object' && Array.isArray(res.tracks) && res.tracks.length) return res;
          if (i < tries - 1) await wait(delayMs);
          return (res && typeof res === 'object') ? res : { tracks: [], selectedId: null };
        } catch (err) {
          lastErr = err;
          if (i < tries - 1) await wait(delayMs);
        }
      }
      throw lastErr || new Error('Track fetch failed');
    };

    tracksPanelOpen = true;
    el.videoTracksPanel.classList.remove('hidden');

    setTrackSelectUiVisible(showTracks);
    setDelayUiVisible(showDelay);
    setTransformsUiVisible(showTransforms);

    try { if (el.videoRespectSubStylesToggle) el.videoRespectSubStylesToggle.checked = !!state.settings.respectSubtitleStyles; } catch {}

    try {
      const eLabel = el.videoTracksPanel?.querySelector?.('label[for="videoLoadSubtitleBtn"]');
      if (eLabel) eLabel.classList.toggle('hidden', !showExternalSubs);
    } catch {}
    if (el.videoLoadSubtitleBtn) el.videoLoadSubtitleBtn.classList.toggle('hidden', !showExternalSubs);

    if (showTracks) {
      let ar = null;
      let sr = null;
      try { ar = await fetchTracksWithRetry(() => state.player.getAudioTracks()); }
      catch (err) { console.error('[video] getAudioTracks failed', err); toast('Audio tracks unavailable'); }

      try { sr = await fetchTracksWithRetry(() => state.player.getSubtitleTracks()); }
      catch (err) { console.error('[video] getSubtitleTracks failed', err); toast('Subtitle tracks unavailable'); }

      const aTracks = (ar && typeof ar === 'object' && Array.isArray(ar.tracks)) ? ar.tracks : [];
      const sTracks = (sr && typeof sr === 'object' && Array.isArray(sr.tracks)) ? sr.tracks : [];
      lastAudioTracks = aTracks;
      lastSubtitleTracks = sTracks;
      fillSelect(el.videoAudioTrackSelect, aTracks, { allowOff: false });
      fillSelect(el.videoSubtitleTrackSelect, sTracks, { allowOff: true, offLabel: 'Off' });
    } else {
      // Clear selects when not supported so stale values don't linger.
      lastAudioTracks = [];
      lastSubtitleTracks = [];
      if (el.videoAudioTrackSelect) el.videoAudioTrackSelect.innerHTML = '';
      if (el.videoSubtitleTrackSelect) el.videoSubtitleTrackSelect.innerHTML = '';
    }

    if (showDelay) await refreshDelaysFromPlayer();
    if (showTransforms) await refreshTransformsFromPlayer();

    // Build 60: Focus logic (speed removed - has its own panel)
    if (focus === 'subDelay' && showDelay) el.videoSubtitleDelayMinusBtn?.focus();
    else if (focus === 'subs' && showTracks) el.videoSubtitleTrackSelect?.focus();
    else if (focus === 'audio' && showTracks) el.videoAudioTrackSelect?.focus();
    else if (showDelay) el.videoSubtitleDelayMinusBtn?.focus();
    else el.videoTracksCloseBtn?.focus();
    showHud();
}

function closeTracksPanel(){
    if (!el.videoTracksPanel) return;
    tracksPanelOpen = false;
    el.videoTracksPanel.classList.add('hidden');
  }

  // Build 67: Anchored speed popover
  let speedPanelOpen = false;

  function openSpeedPanel() {
    if (!el.videoSpeedPanel || !el.videoSpeedBtnTop) return;
    if (!state.player) return;

    speedPanelOpen = true;
    
    // Position panel below button
    const rect = el.videoSpeedBtnTop.getBoundingClientRect();
    el.videoSpeedPanel.style.position = 'fixed';
    el.videoSpeedPanel.style.left = `${rect.left}px`;
    el.videoSpeedPanel.style.top = `${rect.bottom + 4}px`;
    
    el.videoSpeedPanel.classList.remove('hidden');

    // Sync speed display
    try {
      const st = state.player.getState();
      const speed = Number(st.speed) || 1.0;
      if (el.videoSpeedPanelValue) el.videoSpeedPanelValue.textContent = `${speed.toFixed(2)}×`;
    } catch {}

    showHud();
  }

  function closeSpeedPanel() {
    if (!el.videoSpeedPanel) return;
    speedPanelOpen = false;
    el.videoSpeedPanel.classList.add('hidden');
  }

  function toggleSpeedPanel() {
    if (speedPanelOpen) {
      closeSpeedPanel();
    } else {
      closeAllToolPanels();
      openSpeedPanel();
    }
  }


  // Build 54: diagnostics overlay for canvas rendering.
  let diagnosticsTimer = null;

  function setDiagnosticsVisible(visible){
    const on = !!visible;
    if (el.videoDiagnostics) el.videoDiagnostics.classList.toggle('hidden', !on);

    if (!on) {
      if (diagnosticsTimer) { try { window.clearInterval(diagnosticsTimer); } catch {} }
      diagnosticsTimer = null;
      return;
    }

    // Update twice per second while visible.
    if (diagnosticsTimer) return;
    diagnosticsTimer = window.setInterval(() => {
      try {
        const s = state.player?.getRenderStats?.();
        if (!el.videoDiagnostics) return;
        if (!s || typeof s !== 'object') {
          el.videoDiagnostics.textContent = 'Player information unavailable';
          return;
        }
        const qLabel = (s.quality === 'auto') ? 'Auto' : (s.quality === 'high') ? 'High' : (s.quality === 'extreme') ? 'Extreme' : 'Balanced';
        const lines = [
          `Render mode: Canvas`,
          `Render quality: ${qLabel}`,
          `Shared memory buffer: ${s.sharedBufferEnabled ? 'On' : 'Off'}`,
          `Surface: ${Math.round(Number(s.surfaceWidth) || 0)} × ${Math.round(Number(s.surfaceHeight) || 0)}`,
          `${(Number(s.sourceWidth)||0) && (Number(s.sourceHeight)||0) ? `Source: ${Math.round(Number(s.sourceWidth)||0)} × ${Math.round(Number(s.sourceHeight)||0)}` : ''}`,
          `${Number(s.effectiveMaxPixelsCap)||0 ? `Effective max pixels: ${Math.round(Number(s.effectiveMaxPixelsCap)||0)}` : ''}`,
          `Device pixel ratio: ${(Number(s.devicePixelRatio) || 1).toFixed(2)}`,
          `Update events per second: ${(Number(s.updatesPerSecond) || 0).toFixed(1)}`,
          `Draws per second: ${(Number(s.drawsPerSecond) || 0).toFixed(1)}`,
          `Average draw time: ${(Number(s.averageDrawTimeMs) || 0).toFixed(2)} milliseconds`,
          `Last draw time: ${(Number(s.lastDrawTimeMs) || 0).toFixed(2)} milliseconds`,
        ];
        el.videoDiagnostics.textContent = lines.filter(Boolean).join('\n');
      } catch {}
    }, 500);
  }

  function toggleDiagnosticsOverlay(){
    const isHidden = !!(el.videoDiagnostics && el.videoDiagnostics.classList.contains('hidden'));
    setDiagnosticsVisible(isHidden);
  }

  // Tankoban Plus Build 5.4B: apply preferred track languages when a new file is loaded (mpv only)
  async function applyPreferredTracksForVideo(videoId){
    if (!state.player) return;
    const caps = (state.player && state.player.capabilities) ? state.player.capabilities : {};
    if (!caps.tracks) return;
    if (!videoId) return;
    if (preferredTracksAppliedForVideoId === String(videoId)) return;

    // BUILD 68: This function should only be called when there are NO per-episode preferences
    // The check for per-episode preferences is now done in openVideo() before scheduling

    const prefA = state.settings.preferredAudioLanguage;
    const prefS = state.settings.preferredSubtitleLanguage;
    const prefAId = state.settings.preferredAudioTrackId;
    const prefSId = state.settings.preferredSubtitleTrackId;

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    const parseTrackId = (pref) => {
      if (pref === null || pref === undefined) return null;
      if (typeof pref === 'number' && Number.isFinite(pref)) return String(pref);
      if (typeof pref !== 'string') return null;
      const s = pref.trim();
      if (!s) return null;
      const m = /^trackid:(.+)$/i.exec(s);
      return m ? m[1] : null;
    };

    let aTracks = [];
    let sTracks = [];
    // Track lists can appear a moment after load; retry briefly so we don't lock in an empty cache.
    for (let i = 0; i < 6; i++) {
      try {
        const ar = await state.player.getAudioTracks();
        aTracks = (ar && Array.isArray(ar.tracks)) ? ar.tracks : [];
      } catch {}
      try {
        const sr = await state.player.getSubtitleTracks();
        sTracks = (sr && Array.isArray(sr.tracks)) ? sr.tracks : [];
      } catch {}
      if ((aTracks && aTracks.length) || (sTracks && sTracks.length)) break;
      if (i < 5) await wait(200);
    }

    // Cache for later change handlers
    lastAudioTracks = aTracks;
    lastSubtitleTracks = sTracks;

    // Audio (id-first, then language; supports legacy `trackid:` encoding)
    if (typeof state.player.setAudioTrack === 'function') {
      const tid = (prefAId !== null && prefAId !== undefined && prefAId !== 'no')
        ? String(prefAId)
        : parseTrackId(prefA);

      const wantById = (tid !== null)
        ? aTracks.find(t => t && String(t.id) === String(tid))
        : null;

      const wantByLang = (!wantById && typeof prefA === 'string' && prefA && !/^trackid:/i.test(prefA))
        ? aTracks.find(t => t && langEq(t.lang, prefA))
        : null;

      const want = wantById || wantByLang;
      const cur = aTracks.find(t => t && t.selected);
      if (want && (!cur || Number(want.id) !== Number(cur.id))) {
        try { await state.player.setAudioTrack(want.id); } catch {}
      }
    }

    // Subtitles (explicit off wins; otherwise id-first then language; supports legacy `trackid:` encoding)
    if (typeof state.player.setSubtitleTrack === 'function') {
      const off = (prefSId === 'no') || (typeof prefS === 'string' && prefS.trim().toLowerCase() === 'off');
      if (off) {
        try { await state.player.setSubtitleTrack(null); } catch {}
      } else {
        const tid = (prefSId !== null && prefSId !== undefined)
          ? String(prefSId)
          : parseTrackId(prefS);

        const wantById = (tid !== null)
          ? sTracks.find(t => t && String(t.id) === String(tid))
          : null;

        const wantByLang = (!wantById && typeof prefS === 'string' && prefS && !/^trackid:/i.test(prefS))
          ? sTracks.find(t => t && langEq(t.lang, prefS))
          : null;

        const want = wantById || wantByLang;
        const cur = sTracks.find(t => t && t.selected);
        if (want && (!cur || Number(want.id) !== Number(cur.id))) {
          try { await state.player.setSubtitleTrack(want.id); } catch {}
        }
      }
    }

    // Mark applied after we've attempted with a populated (or retried) track list.
    preferredTracksAppliedForVideoId = String(videoId);
  }

  // Apply preferred tracks only after mpv reports ready (prevents mpv overriding early selections).
  let _prefTracksApplyUnsub = null;

  function scheduleApplyPreferredTracksForVideo(videoId){
    try { _prefTracksApplyUnsub && _prefTracksApplyUnsub(); } catch {}
    _prefTracksApplyUnsub = null;

    if (!state.player) return;
    const caps = (state.player && state.player.capabilities) ? state.player.capabilities : {};
    if (!caps.tracks) return;
    if (!videoId) return;

    const run = () => safe(async () => {
      try { await applyPreferredTracksForVideo(videoId); } catch {}
    });

    const st = (typeof state.player.getState === 'function') ? state.player.getState() : null;
    if (st && st.ready) {
      setTimeout(run, 0);
      return;
    }

    _prefTracksApplyUnsub = state.player.on('ready', () => {
      setTimeout(run, 0);
      try { _prefTracksApplyUnsub && _prefTracksApplyUnsub(); } catch {}
      _prefTracksApplyUnsub = null;
    });
  }

  // Build 67: Auto-enable subtitles if available (default to ON)
  async function autoEnableSubtitlesIfAvailable(video) {
    if (!state.player) return;
    
    try {
      const caps = state.player.capabilities || {};
      if (!caps.tracks || typeof state.player.getSubtitleTracks !== 'function') return;
      
      // Wait a moment for tracks to populate
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const tracksResult = await state.player.getSubtitleTracks();
      const tracks = (tracksResult && tracksResult.tracks) ? tracksResult.tracks : [];
      if (!tracks || tracks.length === 0) return;
      
      // Check if user has a saved track preference for this video
      const key = video ? epKey(video) : null;
      const hasSavedPreference = !!(key && state.trackPreferences && state.trackPreferences[key] && state.trackPreferences[key].subtitleTrackId);
      
      if (hasSavedPreference) {
        // User has explicit preference - respect it
        return;
      }
      
      // Check current subtitle state
      const st = state.player.getState?.();
      const currentSubId = st?.subtitleTrackId;
      
      if (!currentSubId || currentSubId === 'no' || currentSubId === '' || currentSubId === 'false') {
        // Subtitles are off - enable first available track
        const firstTrack = tracks[0];
        if (firstTrack) {
          // Prefer the canonical adapter API (setSubtitleTrack), fallback to legacy (selectSubtitleTrack).
          if (typeof state.player.setSubtitleTrack === 'function') {
            await state.player.setSubtitleTrack(firstTrack.id);
          } else if (typeof state.player.selectSubtitleTrack === 'function') {
            await state.player.selectSubtitleTrack(firstTrack.id);
          } else {
            return;
          }
          console.log('[video] Auto-enabled subtitles:', firstTrack.title || firstTrack.id);

          // Update UI if tracks panel is open
          if (el.videoSubtitleTrackSelect) {
            el.videoSubtitleTrackSelect.value = String(firstTrack.id);
          }
        }
      }
    } catch (err) {
      console.error('[video] Auto-enable subtitles error:', err);
    }
  }



  function showHud(){
    if (document.body.classList.contains('videoUiHidden')) return;
    if (!el.videoStage) return;
    el.videoStage.classList.add('showHud');

    // YouTube-like: whenever controls are shown, always show the cursor.
    try { el.videoStage.classList.remove('hideCursor'); } catch {}

    // Non-canvas mpv surfaces can block overlays; keep controls visible in that case.
    if (document.body.classList.contains('mpvEngine') && !document.body.classList.contains('libmpvCanvas')) {
      if (state.hudHideTimer) clearTimeout(state.hudHideTimer);
      return;
    }

    const diagnosticsOn = !!(el.videoDiagnostics && !el.videoDiagnostics.classList.contains('hidden'));
    // BUILD71: Don't close context menu - just skip hide timer when it's open
    if (ctxMenuOpen || playlistPanelOpen || tracksPanelOpen || volPanelOpen || diagnosticsOn || state.seekDragging || state._pointerOverControls) {
      if (state.hudHideTimer) clearTimeout(state.hudHideTimer);
      return;
    }

    if (state.hudHideTimer) clearTimeout(state.hudHideTimer);
    const st = state.player?.getState?.();
    const playing = st ? !st.paused : false;
    if (playing) {
      state.hudHideTimer = setTimeout(() => {
        el.videoStage?.classList.remove('showHud');

        // YouTube-like: in fullscreen while playing, hide the cursor once controls fade.
        const fullscreen = document.body.classList.contains('videoFullscreen');
        const stillPlaying = (() => {
          try {
            const s2 = state.player?.getState?.();
            return s2 ? !s2.paused : false;
          } catch { return false; }
        })();
        const anyOverlay = playlistPanelOpen || tracksPanelOpen || volPanelOpen || diagnosticsOn || state.seekDragging || state._pointerOverControls;
        if (fullscreen && stillPlaying && !anyOverlay) {
          try { el.videoStage?.classList.add('hideCursor'); } catch {}
        }
      }, HIDE_TIMEOUT_MS);
    }
  }

  function hideHudSoon(){
    if (document.body.classList.contains('videoUiHidden')) return;
    // Non-canvas mpv surfaces can block overlays; keep controls visible in that case.
    if (document.body.classList.contains('mpvEngine') && !document.body.classList.contains('libmpvCanvas')) return;

    const diagnosticsOn = !!(el.videoDiagnostics && !el.videoDiagnostics.classList.contains('hidden'));
    // BUILD71: Don't close context menu - just skip hiding when it's open
    if (ctxMenuOpen || playlistPanelOpen || tracksPanelOpen || volPanelOpen || diagnosticsOn || state.seekDragging || state._pointerOverControls) return;

    if (state.hudHideTimer) clearTimeout(state.hudHideTimer);
    state.hudHideTimer = setTimeout(() => {
      el.videoStage?.classList.remove('showHud');
      const fullscreen = document.body.classList.contains('videoFullscreen');
      const st = state.player?.getState?.();
      const playing = st ? !st.paused : false;
      const anyOverlay = playlistPanelOpen || tracksPanelOpen || volPanelOpen || diagnosticsOn || state.seekDragging || state._pointerOverControls;
      if (fullscreen && playing && !anyOverlay) {
        try { el.videoStage?.classList.add('hideCursor'); } catch {}
      }
    }, HIDE_TIMEOUT_MS);
  }

  // BUILD37:  // BUILD37: keep embedded libmpv surface bounds in sync when the layout changes.
  function scheduleMpvBoundsUpdate(){
    try {
      if (state.player?.kind !== 'mpv') return;
      if (typeof state.player.setBounds !== 'function') return;
      requestAnimationFrame(() => {
        setTimeout(() => {
          try { state.player.setBounds(); } catch {}
        }, 0);
      });
    } catch {}
  }

  // Build 33: Reader-style hide UI toggle for video player
  function setVideoUiHidden(on) {
    const next = !!on;
    state.videoUiHidden = next;
    try { state.settings.uiHidden = next; } catch {}
    document.body.classList.toggle('videoUiHidden', next);

    if (next) {
      try { closeTracksPanel(); } catch {}
      try { closeVolPanel(); } catch {}      try { closePlaylistPanel(); } catch {}
      try { el.videoStage?.classList.remove('showHud'); } catch {}
    } else {
      try { showHud(); } catch {}
    }

    scheduleMpvBoundsUpdate();
  }

  function toggleVideoUiHidden() {
    const next = !document.body.classList.contains('videoUiHidden');
    setVideoUiHidden(next);
    // Build 61: Removed toast notification for control panel toggle
  }

  // Build 61: Proper HUD visibility toggle for single-click
  function toggleHudVisibility(){
    if (!el.videoStage) return;
    const isShown = el.videoStage.classList.contains('showHud');
    
    if (isShown) {
      // Hide the HUD
      el.videoStage.classList.remove('showHud');
      if (state.hudHideTimer) {
        clearTimeout(state.hudHideTimer);
        state.hudHideTimer = null;
      }
    } else {
      // Show the HUD (with auto-hide)
      showHud();
    }
    // Build 61: No mpv bounds update needed - we're only toggling CSS visibility
  }

  // Build 60: Shorter alias for single-click toggle
  const toggleHud = toggleHudVisibility;

  function pctForVideoId(id) {
    const p = getProgressForVideoId(id);
    if (!p) return null;
    const pos = Number(p.positionSec);
    const dur = Number(p.durationSec);
    if (!Number.isFinite(pos) || !Number.isFinite(dur) || dur <= 0) return null;
    const pct = Math.max(0, Math.min(100, Math.round((pos / dur) * 100)));
    return pct;
  }

  function setMode(next) {
    state.mode = next;

    // Ensure the video context menu can't linger and block clicks when switching views.
    try { closeVideoCtxMenu(); } catch {}

    const isVideo = next === 'videos';
    document.body.classList.toggle('inVideoMode', isVideo);

    if (el.modeComicsBtn) el.modeComicsBtn.classList.toggle('active', !isVideo);
    if (el.modeVideosBtn) el.modeVideosBtn.classList.toggle('active', isVideo);

    if (el.libraryView) el.libraryView.classList.toggle('hidden', isVideo);
    if (el.playerView) el.playerView.classList.add('hidden');

    // BUILD 69: Show video library UI immediately for instant feedback
    if (el.videoLibraryView) el.videoLibraryView.classList.toggle('hidden', !isVideo);
    if (el.videoPlayerView) el.videoPlayerView.classList.add('hidden');
    document.body.classList.remove('inVideoPlayer');

    // Leaving video mode: destroy mpv surface so it cannot linger above the UI.
    if (!isVideo && state.player?.kind === 'mpv') {
      safe(() => state.player?.destroy?.());
      state.player = null;
      state._playerEventsBoundFor = null;
      document.body.classList.remove('mpvEngine');
        document.body.classList.remove('mpvDetached');
    }

    if (!isVideo) {
      state.videoUiHidden = false;
      try { state.settings.uiHidden = false; } catch {}
      document.body.classList.remove('videoUiHidden');
    }

    if (el.libTitle) el.libTitle.textContent = isVideo ? 'Videos' : 'Library';

    // Build 10.5: keep the shared top-bar button repurposed for Videos only.
    syncVideoThumbToggleBtn();
    applyVideoThumbsClass();

    if (isVideo) {
      // BUILD 97: Load video library + player with full UI support
            safe(async () => {
              const loadStart = Date.now();
              console.log('[video-load] Starting video library and player bootstrap');

              // Load library data + progress + settings + mpv capability checks in parallel
              const [idxRes, progRes, vs, uiState, libmpvResult, mpvResult] = await Promise.all([
                Tanko.api.video.getState().catch(() => ({ idx: { roots: [], shows: [], episodes: [] } })),
                Tanko.api.videoProgress.getAll().catch(() => ({})),
                Tanko.api.videoSettings.get?.().catch(() => ({})),
                Tanko.api.videoUi.getState?.().catch(() => ({})),
                Promise.resolve({ ok: false, error: 'embedded_disabled' }),
                Promise.resolve({ available: false, error: 'embedded_disabled' }),
              ]);

              // Apply library index
              const idx = (idxRes && typeof idxRes === 'object' && idxRes.idx) ? idxRes.idx : idxRes;
              if (idx && typeof idx === 'object') {
                state.roots = Array.isArray(idx.roots) ? idx.roots : [];
                state.shows = Array.isArray(idx.shows) ? idx.shows : [];
                state.videos = Array.isArray(idx.episodes) ? idx.episodes : [];
                state.episodes = state.videos; 
            // AUTOPOSTER FIX: poster cache may contain nulls from before scan; clear so newly-generated posters show up
            try { showPosterCache.clear(); showPosterInFlight.clear(); } catch {}
// Alias for compatibility
                buildEpisodesByShowId();
                rebuildVideoSearchIndex();
                rebuildVideoProgressSummaryCache();
              }

              // Apply UI state
              if (uiState && typeof uiState === 'object') {
                applyVideoUiState(uiState);
                // Build 10.5: ensure Video-only toolbar + classes are synced after restoring UI state.
                applyVideoThumbsClass();
                syncVideoThumbToggleBtn();
              }

              // Apply progress
              const prog = (progRes && typeof progRes === 'object' && Object.prototype.hasOwnProperty.call(progRes, 'progress'))
                ? progRes.progress
                : progRes;
              state.progress = (prog && typeof prog === 'object') ? prog : {};

              // Apply settings
              if (vs && typeof vs === 'object') {
                const s = vs.settings && typeof vs.settings === 'object' ? vs.settings : vs;
                applyVideoSettings(s);
              }

              // Apply libmpv availability
              state.libmpvAvailable = !!(libmpvResult && typeof libmpvResult === 'object' ? libmpvResult.ok : libmpvResult);
              state.libmpvAvailError = (libmpvResult && typeof libmpvResult === 'object' && libmpvResult.error) ? String(libmpvResult.error) : '';

              // Apply mpv availability
              state.mpvAvailable = false;
              state.mpvWindowMode = '';
              state.mpvDetached = false;
              state.mpvAvailError = '';
              state.mpvResolvedPath = '';

              if (mpvResult && typeof mpvResult === 'object' && Object.prototype.hasOwnProperty.call(mpvResult, 'available')) {
                state.mpvAvailable = !!mpvResult.available;
                state.mpvAvailError = mpvResult.error ? String(mpvResult.error) : '';
                state.mpvResolvedPath = mpvResult.path ? String(mpvResult.path) : '';
                state.mpvWindowMode = (mpvResult && typeof mpvResult.windowMode === 'string') ? mpvResult.windowMode : '';
                state.mpvDetached = !!(mpvResult && mpvResult.detached);
              } else if (mpvResult) {
                state.mpvAvailable = !!mpvResult;
              }

              // Warn only if nothing is available (libmpv is preferred anyway).
              const _useQt = true; // Qt-only line: embedded backends deprecated
              if (!_useQt && !state.libmpvAvailable && !state.mpvAvailable) {
                const msg = state.libmpvAvailError
                  ? `libmpv not available: ${state.libmpvAvailError}`
                  : `mpv not available${state.mpvAvailError ? ': ' + state.mpvAvailError : ''}`;
                toast(msg);
              }

              // Render video library UI
              syncVideoSubViews();
              renderVideoFolders();
              renderContinue();
              if (state.videoSubView === 'home') {
                renderVideoHome();
              } else if (state.videoSubView === 'show' && state.selectedShowId) {
                safe(() => ensureShowEpisodesLoaded(state.selectedShowId).then(() => {
                  if (state.selectedShowId) renderVideoShowView();
                }));
              }

              // If we were launched via "shell play", start it now.
              tryStartPendingShellPlay();

              const totalTime = Date.now() - loadStart;
              console.log(`[video-load] Video library and player bootstrap complete in ${totalTime}ms`);
            });
    }
  }


  // Build 10.5: Video-only thumbnail toggle (do not affect Comics).
  function applyVideoThumbsClass(){
    try { document.body.classList.toggle('videoThumbsOff', state.showThumbs === false); } catch {}
  }

  function syncVideoThumbToggleBtn(){
    try {
      if (!el || !el.hiddenSeriesBtn) return;
      if (!document.body.classList.contains('inVideoMode')) {
        // Restore default label for Comics mode.
        el.hiddenSeriesBtn.textContent = 'Hidden';
        el.hiddenSeriesBtn.title = 'Hidden series';
        return;
      }
      const on = (state.showThumbs !== false);
      el.hiddenSeriesBtn.textContent = on ? 'Thumbs: On' : 'Thumbs: Off';
      el.hiddenSeriesBtn.title = 'Toggle show thumbnails (Videos only)';
    } catch {}
  }

  function setVideoShowThumbs(next, { persist = true } = {}){
    state.showThumbs = (next !== false);
    applyVideoThumbsClass();
    syncVideoThumbToggleBtn();
    if (persist) persistVideoUiState();
    // Re-render only the show grid view; show view episode table unaffected.
    if (state.videoSubView === 'home') renderVideoHome();
  }

  function toggleVideoShowThumbs(){
    setVideoShowThumbs(!(state.showThumbs !== false));
  }

  function applyVideoSettings(s){
    if (!s || typeof s !== 'object') return;
    // Build 5.4D: mpv-only (ignore any stored engine setting)
    state.settings.playerEngine = 'mpv';
    // Build 52: Canvas-only libmpv surface (ignore any stored render mode)
    state.settings.renderMode = 'canvas';
    if (Number.isFinite(Number(s.volume))) state.settings.volume = clamp(Number(s.volume), 0, 1);
    if (typeof s.muted === 'boolean') state.settings.muted = s.muted;
    if (Number.isFinite(Number(s.speed))) state.settings.speed = clamp(Number(s.speed), 0.25, 4);
    {
      const loadedSeekSmall = Number(s.seekSmallSec);
      if (Number.isFinite(loadedSeekSmall)) {
        state.settings.seekSmallSec = clamp(loadedSeekSmall, 1, 120);
        // Migration: older builds defaulted to 5s; bump to 10s unless user had set something else.
        if (state.settings.seekSmallSec === 5) state.settings.seekSmallSec = 10;
      }
    }
    if (Number.isFinite(Number(s.seekBigSec))) state.settings.seekBigSec = clamp(Number(s.seekBigSec), 5, 600);
    if (Number.isFinite(Number(s.volumeStep))) state.settings.volumeStep = clamp(Number(s.volumeStep), 0.01, 0.2);

    // Tankoban Plus Build 5.4B: preferred audio/subtitle languages (mpv only)
    if (typeof s.preferredAudioLanguage === 'string' || s.preferredAudioLanguage === null) {
      state.settings.preferredAudioLanguage = (typeof s.preferredAudioLanguage === 'string' && s.preferredAudioLanguage.trim()) ? s.preferredAudioLanguage.trim() : null;
    }
    if (typeof s.preferredSubtitleLanguage === 'string' || s.preferredSubtitleLanguage === null) {
      state.settings.preferredSubtitleLanguage = (typeof s.preferredSubtitleLanguage === 'string' && s.preferredSubtitleLanguage.trim()) ? s.preferredSubtitleLanguage.trim() : null;
    }
// Back-compat: older builds stored subtitle preference under preferredSubLanguage.
if (!Object.prototype.hasOwnProperty.call(s, 'preferredSubtitleLanguage') &&
    (typeof s.preferredSubLanguage === 'string' || s.preferredSubLanguage === null)) {
  state.settings.preferredSubtitleLanguage =
    (typeof s.preferredSubLanguage === 'string' && s.preferredSubLanguage.trim()) ? s.preferredSubLanguage.trim() : null;
}
  if (typeof s.autoAdvance === 'boolean') state.settings.autoAdvance = s.autoAdvance;

    // Build 56A: subtitle style preference (UI only; mpv wiring comes later)
    if (typeof s.respectSubtitleStyles === 'boolean') state.settings.respectSubtitleStyles = s.respectSubtitleStyles;

    if (typeof s.renderQuality === 'string') {
      const q = String(s.renderQuality || '').trim().toLowerCase();
      state.settings.renderQuality = (q === 'auto') ? 'auto' : (q === 'high') ? 'high' : (q === 'extreme') ? 'extreme' : 'balanced';
    }

    if (typeof s.videoSyncDisplayResample === 'boolean') state.settings.videoSyncDisplayResample = s.videoSyncDisplayResample;

  try { if (el.videoAutoAdvanceToggle) el.videoAutoAdvanceToggle.checked = !!state.settings.autoAdvance; } catch {}


    syncHudFromSettings();
  }

  function persistVideoSettings(partial){
    safe(async () => {
      if (!Tanko.api.videoSettings.save) return;
      await Tanko.api.videoSettings.save(partial || {});
    });
  }

// Build 45: small helper for preference persistence.
function saveSetting(key, value){
  const k = String(key || '');
  const vRaw = (value === undefined) ? null : value;

  const norm = () => {
    if (vRaw === null) return null;
    if (typeof vRaw === 'string') {
      const t = vRaw.trim();
      return t ? t : null;
    }
    if (typeof vRaw === 'number' && Number.isFinite(vRaw)) return `trackid:${String(vRaw)}`;
    return null;
  };

  if (k === 'preferredAudioLanguage') {
    const v = norm();
    try { state.settings.preferredAudioLanguage = v; } catch {}
    persistVideoSettings({ preferredAudioLanguage: v });
    return;
  }

  if (k === 'preferredSubtitleLanguage') {
    const v = norm();
    try { state.settings.preferredSubtitleLanguage = v; } catch {}
    // Back-compat write-through: some older paths may still read preferredSubLanguage.
    persistVideoSettings({ preferredSubtitleLanguage: v, preferredSubLanguage: v });
    return;
  }
}


  // Tankoban Plus Build 3.5: persist video library UI state (selection, filters, view)
  let videoUiPersistTimer = null;
  function videoUiSnapshot(){
    return {
      selectedRootId: state.selectedRootId || null,
      videoTreeExpanded: (state.videoTreeExpanded && typeof state.videoTreeExpanded === 'object') ? state.videoTreeExpanded : {},
      videoSubView: state.videoSubView || 'home',
      selectedShowId: state.selectedShowId || null,
      selectedEpisodeId: state.selectedEpisodeId || null,
      epFolderRel: state.epFolderRel || '',
      epSearch: state.epSearch || '',
      epSort: state.epSort || 'title_asc',
      epHidePreview: !!state.epHidePreview,
      showThumbs: (typeof state.showThumbs === "boolean") ? state.showThumbs : true,
      hideWatchedShows: !!state.hideWatchedShows,
      dismissedContinueShows: (state.dismissedContinueShows && typeof state.dismissedContinueShows === 'object') ? state.dismissedContinueShows : {},
      lastActiveEpisodeByShowId: (state.lastActiveEpisodeByShowId && typeof state.lastActiveEpisodeByShowId === 'object') ? state.lastActiveEpisodeByShowId : {},
    };
  }

  function applyVideoUiState(ui){
    const s = (ui && typeof ui === 'object') ? ui : {};
    if (typeof s.selectedRootId === 'string' || s.selectedRootId === null) state.selectedRootId = s.selectedRootId || null;
    if (s.videoSubView === 'home' || s.videoSubView === 'show') state.videoSubView = s.videoSubView;
    if (typeof s.selectedShowId === 'string' || s.selectedShowId === null) state.selectedShowId = s.selectedShowId || null;
    if (typeof s.selectedEpisodeId === 'string' || s.selectedEpisodeId === null) state.selectedEpisodeId = s.selectedEpisodeId || null;
    if (typeof s.epFolderRel === 'string') state.epFolderRel = s.epFolderRel;
    if (typeof s.epSearch === 'string') state.epSearch = s.epSearch;
    if (typeof s.epSort === 'string') state.epSort = s.epSort;
    if (typeof s.epHidePreview === 'boolean') state.epHidePreview = s.epHidePreview;
    if (typeof s.showThumbs === 'boolean') state.showThumbs = s.showThumbs;
    if (typeof s.hideWatchedShows === 'boolean') state.hideWatchedShows = s.hideWatchedShows;
    if (typeof s.hideWatched === 'boolean') state.hideWatchedShows = s.hideWatched; // backward compat

    if (s.dismissedContinueShows && typeof s.dismissedContinueShows === 'object') {
      state.dismissedContinueShows = s.dismissedContinueShows;
    }

    if (s.lastActiveEpisodeByShowId && typeof s.lastActiveEpisodeByShowId === 'object') {
      state.lastActiveEpisodeByShowId = s.lastActiveEpisodeByShowId;
    }


    // Stage 2: restore sidebar tree expand/collapse state
    if (s.videoTreeExpanded && typeof s.videoTreeExpanded === 'object') {
      state.videoTreeExpanded = s.videoTreeExpanded;
    }
  }

  function schedulePersistVideoUiState(){
    if (!Tanko.api.videoUi.saveState) return;
    if (videoUiPersistTimer) clearTimeout(videoUiPersistTimer);
    videoUiPersistTimer = setTimeout(() => {
      videoUiPersistTimer = null;
      safe(async () => {
        await Tanko.api.videoUi.saveState(videoUiSnapshot());
      });
    }, 250);
  }

  // Backward-compat: older call-sites use this name.
  function persistVideoUiState(){
    schedulePersistVideoUiState();
  }

  function syncHudFromSettings(){
    if (el.videoVol) el.videoVol.value = String(Math.round(clamp(state.settings.volume, 0, 1) * 100));
    if (el.videoMuteBtn) el.videoMuteBtn.textContent = state.settings.muted ? '🔇' : '🔊';
    setSpeedLabels(state.settings.speed);
    setQualityLabels(state.settings.renderQuality);
  }

  function setSpeedLabels(sp){
    const txt = `${Number(sp).toFixed(2).replace(/\.00$/,'.0').replace(/\.(\d)0$/,'.$1')}×`;
    if (el.videoSpeedBtn) el.videoSpeedBtn.textContent = txt;
    if (el.videoSpeedBtnTop) el.videoSpeedBtnTop.textContent = txt;
  }

  function setQualityLabels(mode){
    const m = String(mode || '').trim().toLowerCase();
    const label = (m === 'auto') ? 'Auto' : (m === 'high') ? 'High' : (m === 'extreme') ? 'Extreme' : 'Balanced';
    if (el.videoQualityBtnTop) el.videoQualityBtnTop.textContent = label;
  }

  function applyRenderQuality(mode, { persist = true, announce = false } = {}){
    const m = String(mode || '').trim().toLowerCase();
    const norm = (m === 'auto') ? 'auto' : (m === 'high') ? 'high' : (m === 'extreme') ? 'extreme' : 'balanced';
    state.settings.renderQuality = norm;
    setQualityLabels(norm);

    try { state.player?.setRenderQuality?.(norm); } catch {}

    if (persist) persistVideoSettings({ renderQuality: norm });
    if (announce) toast(`Render quality: ${norm === 'auto' ? 'Auto' : norm === 'balanced' ? 'Balanced' : norm === 'high' ? 'High' : 'Extreme'}`);
  }

  function buildEpisodesByShowId(){
    const byShow = new Map();
    const byId = new Map();

    for (const ep of state.videos) {
      if (!ep || !ep.id) continue;
      byId.set(String(ep.id), ep);

      // BUILD 104c: allow lookups by previous IDs (aliasIds)
      const aliases = Array.isArray(ep.aliasIds) ? ep.aliasIds : [];
      for (const a of aliases) {
        const aid = String(a || '');
        if (!aid) continue;
        if (!byId.has(aid)) byId.set(aid, ep);
      }

      const sid = ep && ep.showId ? String(ep.showId) : '';
      if (!sid) continue;
      let arr = byShow.get(sid);
      if (!arr) { arr = []; byShow.set(sid, arr); }
      arr.push(ep);
    }

    // Natural-ish title sort (real natural sorting + other modes in renderVideoShowView)
    for (const [sid, arr] of byShow.entries()) {
      arr.sort((a, b) => {
        return String(a.title || '').localeCompare(String(b.title || ''), undefined, { numeric: true, sensitivity: 'base' })
          || String(a.path || '').localeCompare(String(b.path || ''));
      });
    }

    state.episodesByShowId = byShow;
    state.episodeById = byId;
  }

  function syncVideoSubViews(){
    const which = state.videoSubView || 'home';
    el.videoHomeView?.classList.toggle('hidden', which !== 'home');
    el.videoShowView?.classList.toggle('hidden', which !== 'show');
  }

  function goVideoHome(){
    state.videoSubView = 'home';
    state.selectedShowId = null;
    state.selectedEpisodeId = null;
    state.epFolderRel = '';
    syncVideoSubViews();
    renderVideoHome();
    persistVideoUiState();
  }



async function ensureShowEpisodesLoaded(showId){
  const sid = String(showId || '');
  if (!sid) return;
  // Already have episodes for this show?
  const existing = state.episodesByShowId?.get?.(sid);
  if (Array.isArray(existing) && existing.length) return;

  // If the show advertises 0 episodes, nothing to load.
  const sh = getShowById(sid);
  const advertised = (sh && typeof sh.episodeCount === 'number') ? sh.episodeCount : (state.showEpisodeCount?.get?.(sid) || 0);
  if (!advertised) return;

  // Show a lightweight loading hint in the table region.
  try {
    if (el.videoEpisodesEmpty) {
      el.videoEpisodesEmpty.textContent = 'Loading episodes…';
      el.videoEpisodesEmpty.classList.remove('hidden');
    }
  } catch {}
  try { if (el.videoEpisodesGrid) el.videoEpisodesGrid.innerHTML = ''; } catch {}

  try {
    const res = await Tanko.api.video.getEpisodesForShow(sid);
    const eps = (res && typeof res === 'object' && Array.isArray(res.episodes)) ? res.episodes : [];
    if (eps.length) {
      // Merge into the global list so Continue Watching / playlist helpers keep working.
      const seen = new Set((state.videos || []).map(v => String(v && v.id || '')));
      for (const ep of eps) {
        const id = String(ep && ep.id || '');
        if (!id || seen.has(id)) continue;
        state.videos.push(ep);
        seen.add(id);
      }
      buildEpisodesByShowId();
      rebuildVideoSearchIndex();
      // Rebuild minimal caches that depend on episodes.
      rebuildVideoProgressSummaryCache();
    }
  } catch {}
  finally {
    try { if (el.videoEpisodesEmpty) el.videoEpisodesEmpty.classList.add('hidden'); } catch {}
  }
}


// BUILD 104b: Continue Watching should not depend on the lite snapshot's capped episodes list.
// Fetch episode objects on-demand for the most recently updated progress keys (and lastActive IDs),
// then merge them into state.videos so existing helpers (getEpisodeById, etc.) keep working.
const continueEpisodesLoad = { inFlight: null, lastKey: '', lastAt: 0, sortHash: '', sortedKeys: [] };

function ensureContinueEpisodesLoaded() {
  try {
    if (!Tanko?.api?.video?.getEpisodesByIds) return;
    const prog = (state.progress && typeof state.progress === 'object') ? state.progress : {};
    const keys = Object.keys(prog || {});
    const lastActive = (state.lastActiveEpisodeByShowId && typeof state.lastActiveEpisodeByShowId === 'object')
      ? state.lastActiveEpisodeByShowId
      : {};

    if (!keys.length && (!lastActive || !Object.keys(lastActive).length)) return;

    const now = Date.now();
    // Light throttle to avoid spamming during rapid UI rerenders.
    if (continueEpisodesLoad.inFlight) return;
    if ((now - (continueEpisodesLoad.lastAt || 0)) < 350) return;

    // Sort progress keys by updatedAt (desc), with a cheap hash to avoid resorting every time.
    let sorted = continueEpisodesLoad.sortedKeys;
    const hash = keys.length + '_' + keys.slice(0, 10).join('_');
    if (continueEpisodesLoad.sortHash !== hash) {
      sorted = keys.slice().sort((a, b) => Number((prog[b] && prog[b].updatedAt) || 0) - Number((prog[a] && prog[a].updatedAt) || 0));
      continueEpisodesLoad.sortHash = hash;
      continueEpisodesLoad.sortedKeys = sorted;
    }

    const wantIds = [];

    // Take the top N progress keys (large enough to cover many shows without getting silly).
    const cap = Math.max(0, Math.min(200, sorted.length));
    for (let i = 0; i < cap; i++) {
      const id = String(sorted[i] || '');
      if (id) wantIds.push(id);
    }

    // Also include "last opened" episode IDs (even if no progress exists yet).
    for (const info of Object.values(lastActive || {})) {
      const id = String(info && info.episodeId || '');
      if (id) wantIds.push(id);
    }

    // Unique + filter out ones we already have.
    const unique = [];
    const seen = new Set();
    for (const id of wantIds) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      unique.push(id);
    }

    const haveMap = state.episodeById;
    const missing = [];
    for (const id of unique) {
      const have = (haveMap && typeof haveMap.get === 'function') ? haveMap.get(String(id)) : null;
      if (!have) missing.push(String(id));
    }
    if (!missing.length) return;

    // Prevent repeated identical requests.
    const key = missing.length + '_' + missing.slice(0, 30).join('_');
    if (key === continueEpisodesLoad.lastKey && (now - (continueEpisodesLoad.lastAt || 0)) < 2500) return;

    continueEpisodesLoad.lastKey = key;
    continueEpisodesLoad.lastAt = now;

    continueEpisodesLoad.inFlight = (async () => {
      try {
        const res = await Tanko.api.video.getEpisodesByIds(missing);
        const eps = (res && typeof res === 'object' && Array.isArray(res.episodes)) ? res.episodes : [];
        if (!eps.length) return;

        // Merge into global list so Continue Watching and other helpers keep working.
        const all = Array.isArray(state.videos) ? state.videos : [];
        const seenIds = new Set(all.map(v => String(v && v.id || '')));
        let addedAny = false;

        for (const ep of eps) {
          const id = String(ep && ep.id || '');
          if (!id || seenIds.has(id)) continue;
          all.push(ep);
          seenIds.add(id);
          addedAny = true;
        }

        if (addedAny) {
          state.videos = all;
          state.episodes = state.videos;
          buildEpisodesByShowId();
          rebuildVideoSearchIndex();
          rebuildVideoProgressSummaryCache();
          if (state.videoSubView === 'home') renderVideoHome();
          renderContinue();
        }
      } catch {}
      finally { continueEpisodesLoad.inFlight = null; }
    })();
  } catch {}
}


  function openVideoShow(showId){
    const prevSid = state.selectedShowId;
    const sid = showId || null;
    state.videoSubView = 'show';
    state.selectedShowId = sid;

    // Build 22: entering a different show resets the inside-show folder browser to the show root.
    if (String(prevSid || '') !== String(sid || '')) {
      state.epFolderRel = '';
    }

        // Build 85: Load episodes on-demand for this show.
    safe(() => ensureShowEpisodesLoaded(sid).then(() => { if (state.selectedShowId === sid) renderVideoShowView(); }));

    // Keep selection when re-entering the same show; otherwise default to resume/next.
    let keep = null;
    if (sid && state.selectedEpisodeId) {
      const ep = getEpisodeById(state.selectedEpisodeId);
      if (ep && String(ep.showId) === String(sid)) keep = state.selectedEpisodeId;
    }

    if (keep) {
      state.selectedEpisodeId = keep;
    } else {
      const r = sid ? pickResumeEpisode(sid) : null;
      state.selectedEpisodeId = r?.id || null;
    }

    syncVideoSubViews();
    renderVideoShowView();
    persistVideoUiState();
  }

  function applyVideoSnapshot(snap) {
    const snapStart = Date.now();
    console.log('[video-load] Applying snapshot');

    if (!snap || typeof snap !== 'object') return;
    state.videoFolders = Array.isArray(snap.videoFolders) ? snap.videoFolders : [];
    state.roots = Array.isArray(snap.roots) ? snap.roots : [];
    state.shows = Array.isArray(snap.shows) ? snap.shows : [];
    // Build 3.2: indexer provides episodes[]; keep state.videos as compatibility alias.
    state.videos = Array.isArray(snap.episodes)
      ? snap.episodes
      : (Array.isArray(snap.videos) ? snap.videos : []);
    // Progress is persisted separately (video_progress.json). Keep current progress unless the snapshot explicitly carries it.
    if (snap.progress && typeof snap.progress === 'object') state.progress = snap.progress;
    else if (!state.progress || typeof state.progress !== 'object') state.progress = {};

    const buildStart = Date.now();
    buildEpisodesByShowId();
    rebuildVideoSearchIndex();
    console.log(`[video-load] Episode index built in ${Date.now() - buildStart}ms`);

// Stage 2: minimal derived caches for sidebar counts (item 1 + the minimal pieces of item 8)
// Rebuilt once per snapshot to avoid O(N^2) rendering loops.
{
  const cacheStart = Date.now();
  const showEp = new Map();      // showId -> episodeCount
  const rootCounts = new Map();  // rootId -> showCount

  // BUILD73: Use episodeCounts from snapshot if episodes array is empty (on-demand loading)
  // This fixes the "0 episodes" bug at initial load
  const useSnapshotCounts = state.videos.length === 0 && snap.episodeCounts && typeof snap.episodeCounts === 'object';

  for (const sh of state.shows) {
    if (!sh || !sh.id) continue;
    const sid = String(sh.id);
    
    // Prefer counts from the show object itself (main process pre-computed), then snapshot counts, then actual episodes
    let count = 0;
    if (typeof sh.episodeCount === 'number' && sh.episodeCount >= 0) {
      count = sh.episodeCount;
    } else if (useSnapshotCounts && snap.episodeCounts[sid]) {
      count = snap.episodeCounts[sid];
    } else {
      const eps = state.episodesByShowId?.get?.(sid) || [];
      count = Array.isArray(eps) ? eps.length : 0;
    }
    
    showEp.set(sid, count);

    const rid = sh.rootId ? String(sh.rootId) : '';
    if (rid) rootCounts.set(rid, (rootCounts.get(rid) || 0) + 1);
  }

  state.showEpisodeCount = showEp;
  state.rootShowCount = rootCounts;
  console.log(`[video-load] Sidebar caches built in ${Date.now() - cacheStart}ms`);
}

    // Stage 3: derived per-show progress summaries (Item 8)
    const progressStart = Date.now();
    rebuildVideoProgressSummaryCache();
    console.log(`[video-load] Progress summaries built in ${Date.now() - progressStart}ms`);

    // Guard selection against rescans
    if (state.selectedRootId && !state.roots.some(r => r.id === state.selectedRootId)) state.selectedRootId = null;
    if (state.selectedShowId && !state.shows.some(s => s.id === state.selectedShowId)) state.selectedShowId = null;

    // BUILD 69: Progressive loading optimization
    // Show UI immediately, then render content in next frame to prevent blocking
    if (el.videoLibraryView) el.videoLibraryView.classList.remove('hidden');
    
    // Render sidebar immediately (it's lightweight)
    const sidebarStart = Date.now();
    renderVideoFolders();
    console.log(`[video-load] Sidebar rendered in ${Date.now() - sidebarStart}ms`);
    
    // Defer heavy rendering to next frame for instant UI response
    requestAnimationFrame(() => {
      const renderStart = Date.now();
      renderContinue();
      console.log(`[video-load] Continue shelf rendered in ${Date.now() - renderStart}ms`);

      const viewStart = Date.now();
      if (state.selectedShowId) {
        // Build 85: episodes are loaded on-demand. Kick off a fetch for the selected show.
        safe(() => ensureShowEpisodesLoaded(state.selectedShowId).then(() => { if (state.selectedShowId) renderVideoShowView(); }));
        state.videoSubView = 'show';
        syncVideoSubViews();
        renderVideoShowView();
      } else {
        state.videoSubView = 'home';
        syncVideoSubViews();
        renderVideoHome();
      }
      console.log(`[video-load] View rendered in ${Date.now() - viewStart}ms`);

      tryStartPendingShellPlay();
      persistVideoUiState();

      console.log(`[video-load] Snapshot applied in ${Date.now() - snapStart}ms total`);
    });
  }

  async function removeVideoRootFolder(root){
    const p = root && root.path ? String(root.path || '') : String(root || '');
    if (!p) return;

    const ok = (typeof confirmRemoveRootFolder === 'function')
      ? await confirmRemoveRootFolder()
      : false;
    if (!ok) return;

    const res = await Tanko.api.video.removeFolder(p);
    if (res && res.state) applyVideoSnapshot(res.state);
    toast('Root folder removed');
  }


  function renderVideoFolders() {
  if (!el.videoFoldersList) return;
  el.videoFoldersList.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'navBtn';
  allBtn.textContent = 'All videos';
  allBtn.onclick = () => { state.selectedRootId = null; goVideoHome(); };
  el.videoFoldersList.appendChild(allBtn);

  // Render from structured roots (stable ids computed off-thread / in main process).
  const roots = Array.isArray(state.roots) && state.roots.length
    ? state.roots
    : (Array.isArray(state.videoFolders) ? state.videoFolders.map((fp) => ({
        id: null,
        name: fp.split(/[\/]/).filter(Boolean).slice(-1)[0] || fp,
        path: fp,
        displayPath: String(fp || '').replace(/\\/g, '/'),
      })) : []);

  const selectedRid = state.selectedRootId ? String(state.selectedRootId) : '';

  const hasOwn = (obj, k) => !!(obj && Object.prototype.hasOwnProperty.call(obj, k));
  const getExpandedDefault = (rid) => {
    // If we have an explicit saved state, respect it.
    if (rid && hasOwn(state.videoTreeExpanded, rid)) return !!state.videoTreeExpanded[rid];
    // Otherwise: if a root is selected, expand only that one; if none selected, expand all.
    if (selectedRid) return rid === selectedRid;
    return true;
  };

  const getRootShowCount = (rootObj) => {
    const rid = rootObj && rootObj.id ? String(rootObj.id) : '';
    if (rid && state.rootShowCount && typeof state.rootShowCount.get === 'function') {
      // Some snapshots provide a partial rootShowCount map (missing keys default to 0).
      // For sidebar correctness, fall back to derived counts when the cached value is
      // missing or suspiciously 0 while we can prove children exist.
      const n = state.rootShowCount.get(rid);
      const nn = Number(n);
      if (Number.isFinite(nn) && nn > 0) return nn;
      // Fallback: compute from shows list (cheap; O(#shows) once per render).
      const fallback = state.shows.filter(s => String(s.rootId || '') === rid).length;
      return fallback || (Number.isFinite(nn) ? nn : 0);
    }
    // Fallback if ids aren’t available.
    if (rid) return state.shows.filter(s => String(s.rootId || '') === rid).length;
    return 0;
  };

  const getShowEpisodeCount = (showObj) => {
    const sid = showObj && showObj.id ? String(showObj.id) : '';
    if (sid && state.showEpisodeCount && typeof state.showEpisodeCount.get === 'function') {
      // Similar to rootShowCount: allow fallback when cached counts are missing/0
      // but we already have episode index entries (or progress implies episodes exist).
      const n = state.showEpisodeCount.get(sid);
      const nn = Number(n);
      if (Number.isFinite(nn) && nn > 0) return nn;
      const eps = state.episodesByShowId?.get?.(sid) || [];
      const fallback = Array.isArray(eps) ? eps.length : 0;
      return fallback || (Number.isFinite(nn) ? nn : 0);
    }
    const eps = state.episodesByShowId?.get?.(sid) || [];
    return Array.isArray(eps) ? eps.length : 0;
  };

  for (const r of roots) {
    const rid = r && r.id ? String(r.id) : '';
    const expanded = getExpandedDefault(rid);

    // Sidebar parity: use the Comic Library folder item markup + tokens.
    // IMPORTANT: keep underlying click/expand/remove behavior identical.
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `folderItem${(rid && String(state.selectedRootId || '') === rid) ? ' active' : ''}`;

    // Twisty in the icon slot: expand/collapse (persisted via video UI state)
    const twisty = document.createElement('span');
    twisty.className = 'folderIcon';
    twisty.textContent = expanded ? '▾' : '▸';
    twisty.title = expanded ? 'Collapse' : 'Expand';
    twisty.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!rid) return;
      if (!state.videoTreeExpanded || typeof state.videoTreeExpanded !== 'object') state.videoTreeExpanded = {};
      state.videoTreeExpanded[rid] = !expanded;
      renderVideoFolders();
      persistVideoUiState();
    });

    const label = document.createElement('span');
    label.className = 'folderLabel';
    label.textContent = r.name || (r.displayPath || r.path || 'Folder');

    // Count: shows under this root
    const showCount = getRootShowCount(r);
    const count = document.createElement('span');
    count.className = 'folderCount';
    count.textContent = String(showCount);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'videoRootRemove';
    remove.textContent = 'Remove';
    remove.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      safe(() => removeVideoRootFolder(r));
    });

    row.appendChild(twisty);
    row.appendChild(label);
    row.appendChild(count);
    row.appendChild(remove);

    row.addEventListener('click', () => {
      // IMPORTANT: do not recompute ids in renderer; use stable ids produced upstream.
      state.selectedRootId = r.id || null;
      if (rid) {
        if (!state.videoTreeExpanded || typeof state.videoTreeExpanded !== 'object') state.videoTreeExpanded = {};
        state.videoTreeExpanded[rid] = true; // selecting a root should reveal its children
      }
      goVideoHome();
      renderVideoFolders();
      persistVideoUiState();
    });

    // Stage 1: Root folder context menu (Rescan / Reveal / Remove).
    // Guard: do not steal right click from inputs/editables.
    row.addEventListener('contextmenu', (e) => {
      const t = e.target;
      const tag = (t && t.tagName) ? String(t.tagName).toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;

      openCtxMenu(e, [
        {
          label: 'Rescan',
          onClick: async () => {
            try { await Tanko.api.video.scan({ force: true }); } catch {}
            toast('Refreshing…');
          },
        },
        {
          label: 'Reveal',
          disabled: (typeof Tanko?.api?.shell?.revealPath !== 'function'),
          onClick: async () => {
            try { await Tanko.api.shell.revealPath(r.path); } catch {}
          },
        },
        { separator: true },
        {
          label: 'Remove…',
          danger: true,
          onClick: () => { safe(() => removeVideoRootFolder(r)); },
        },
      ]);
    });

    el.videoFoldersList.appendChild(row);

    // === Nested shows under this root (tree) ===
    if (!expanded) continue;

    const children = rid
      ? state.shows.filter(s => String(s.rootId || '') === rid)
      : [];

    children.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { numeric: true, sensitivity: 'base' }));

    for (const sh of children) {
      if (!sh || !sh.id) continue;
      const sid = String(sh.id);

      const srow = document.createElement('button');
      srow.type = 'button';
      srow.className = `folderItem folderChild${(sid && String(state.selectedShowId || '') === sid) ? ' active' : ''}`;

      const sicon = document.createElement('span');
      sicon.className = 'folderIcon';
      sicon.textContent = '';

      const slabel = document.createElement('span');
      slabel.className = 'folderLabel';
      slabel.textContent = sh.name || basename(sh.path || '') || 'Show';

      const epCount = getShowEpisodeCount(sh);
      const scount = document.createElement('span');
      scount.className = 'folderCount';
      scount.textContent = String(epCount);

      srow.appendChild(sicon);
      srow.appendChild(slabel);
      srow.appendChild(scount);

      srow.addEventListener('click', () => {
        state.selectedRootId = r.id || null;
        openVideoShow(sid);
        // openVideoShow already persists, but keep the tree state sticky
        persistVideoUiState();
      });
      el.videoFoldersList.appendChild(srow);
    }
  }
  }

  

  function touchLastActiveEpisode(v){
    try {
      const sid = String((v && (v.showId || v.folderId)) || '');
      const eid = String((v && v.id) || '');
      if (!sid || !eid) return;
      if (!state.lastActiveEpisodeByShowId || typeof state.lastActiveEpisodeByShowId !== 'object') {
        state.lastActiveEpisodeByShowId = {};
      }
      const prev = state.lastActiveEpisodeByShowId[sid];
      const now = Date.now();
      if (prev && String(prev.episodeId || '') === eid && (now - Number(prev.atMs || 0)) < 2000) return;
      state.lastActiveEpisodeByShowId[sid] = { episodeId: eid, atMs: now };
      persistVideoUiState();
    } catch {}
  }

function getContinueVideos() {
    // Build 20: one Continue Watching tile per show (like Continue Reading).
    // Each tile points to the most recently watched in-progress episode in that show.
    const prog = (state.progress && typeof state.progress === 'object') ? state.progress : {};
    const dismissed = (state.dismissedContinueShows && typeof state.dismissedContinueShows === 'object')
      ? state.dismissedContinueShows
      : {};

    const byShow = new Map(); // showId -> { episode, updatedAt }

    for (const v of state.videos) {
      if (!v || !v.id) continue;
      const gp = getProgressForEpisode(v);
      const p = gp.progress;
      if (!p) continue;

      const sid = String(v.showId || v.folderId || '');
      if (!sid) continue;

      const at = Number(p.updatedAt || 0);
      const dismissedAt = Number(dismissed[sid] || 0);
      if (dismissedAt > 0 && at <= dismissedAt) continue;

      const pos = Number(p.positionSec);
      const dur = Number(p.durationSec);
      if (!Number.isFinite(pos) || pos < 10) continue;
      if (isProgressFinished(p)) continue;

      const existing = byShow.get(sid);
      if (!existing || at > Number(existing.updatedAt || 0)) {
        byShow.set(sid, { episode: v, updatedAt: at });
      }
    }

    const lastActive = (state.lastActiveEpisodeByShowId && typeof state.lastActiveEpisodeByShowId === 'object')
      ? state.lastActiveEpisodeByShowId
      : {};

    for (const [sidRaw, info] of Object.entries(lastActive)) {
      const sid = String(sidRaw || '');
      if (!sid) continue;

      const at = Number((info && info.atMs) || 0);
      if (!at) continue;

      const dismissedAt = Number(dismissed[sid] || 0);
      if (dismissedAt > 0 && at <= dismissedAt) continue;

      const epId = info && info.episodeId;
      const ep = epId ? getEpisodeById(String(epId)) : null;
      if (!ep || !ep.id) continue;

      // Don't pin Continue Watching to a finished (or near-finished) episode.
      const p = getProgressForEpisode(ep).progress;
      if (p) {
        const pos = Number(p.positionSec);
        const dur = Number(p.durationSec);
        if (isProgressFinished(p)) continue;
      }

      const existing = byShow.get(sid);
      if (!existing || at > Number(existing.updatedAt || 0)) {
        byShow.set(sid, { episode: ep, updatedAt: at });
      }
    }

    const out = [];
    for (const [sid, entry] of byShow.entries()) {
      const show = getShowById(sid);
      if (!show) continue;
      out.push({ show, episode: entry.episode, updatedAt: Number(entry.updatedAt || 0) });
    }

    out.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    return out;
  }

  // BUILD105: Videos — Continue Watching tile size must match the Shows grid.
  // The shelf previously capped posters at 240px tall, which made Continue Watching look tiny
  // next to the Shows cards. Use the same cover geometry as the Shows grid:
  // - Comfortable tiles: ~210px wide => ~323px tall (65/100 aspect)
  // - Compact tiles:     ~170px wide => ~261px tall
  const videoContinueGeom = { raf: 0, lastCoverH: 0 };
  function scheduleVideoContinueGeometry() {
    if (videoContinueGeom.raf) return;
    videoContinueGeom.raf = requestAnimationFrame(() => {
      videoContinueGeom.raf = 0;
      if (state.mode !== 'videos') return;
      const row = el.videoContinuePanel || el.videoContinueList;
      if (!row) return;
      const listH = row.clientHeight || 0;
      if (!listH) return;

      // Guard rail: if the row collapses (layout not ready / min-height chain broken),
      // don't push tiny CSS vars that shrink tiles into postage stamps.
      // Let the CSS fallbacks (160x240) win until we can measure a sane height.
      if (listH < 220) {
        if (videoContinueGeom.lastCoverH && videoContinueGeom.lastCoverH < 180) {
          try {
            row.style.removeProperty('--cont-cover-h');
            row.style.removeProperty('--cont-cover-w');
          } catch {}
          videoContinueGeom.lastCoverH = 0;
        }
        return;
      }

      const verticalPadding = 20;

      // Match Shows tile density (Tiles: Large/Medium) by using the same
      // stable target heights as the grid card aspect ratio.
      const density = (document.body && document.body.getAttribute('data-tile-density')) || 'comfortable';
      const maxH = (density === 'compact') ? 261 : 323;
      const minH = (density === 'compact') ? 210 : 240;

      // Use available row height (minus padding), but clamp to the target.
      const coverH = Math.min(maxH, Math.max(minH, listH - (verticalPadding * 2)));
      if (coverH === videoContinueGeom.lastCoverH) return;
      videoContinueGeom.lastCoverH = coverH;
      const coverW = Math.floor(coverH * 0.65);
      row.style.setProperty('--cont-cover-h', `${coverH}px`);
      row.style.setProperty('--cont-cover-w', `${coverW}px`);
    });
  }

  function renderContinue() {
    if (!el.videoContinuePanel || !el.videoContinueList) return;
    // Build 104b: ensure Continue Watching has episode metadata even when the main snapshot is lite-capped.
    ensureContinueEpisodesLoaded();

    // UI parity + layout fix: the HTML contains two containers (panel + list).
    // The panel uses the Comic Library's shelf classes; the list was a legacy container.
    // If both participate in flex layout, the tiles get pushed/clipped.
    // Keep the legacy list in the DOM for compatibility, but render into the panel.
    el.videoContinueList.classList.add('hidden');

    const row = el.videoContinuePanel;
    row.innerHTML = '';

    // Build 20: Continue Watching uses a horizontal shelf of tiles.
    row.classList.remove('videoList', 'videoContinueRow');
    row.classList.add('continueRow', 'continueYacRow');

    if (el.videoHideWatchedToggle) el.videoHideWatchedToggle.checked = !!state.hideWatchedShows;

    const items = getContinueVideos().slice(0, 10);
    row.classList.toggle('hidden', !items.length);
    if (el.videoContinueEmpty) el.videoContinueEmpty.classList.toggle('hidden', !!items.length);
    if (!items.length) return;

    for (const it of items) row.appendChild(makeContinueShowTile(it));
    scheduleVideoContinueGeometry();
  }

  async function clearContinueShow(showId, episodeId){
    const sid = String(showId || '');
    if (!sid) return;

    // Dismiss the show tile so it stays hidden until new watching activity occurs.
    state.dismissedContinueShows = (state.dismissedContinueShows && typeof state.dismissedContinueShows === 'object')
      ? state.dismissedContinueShows
      : {};
    state.dismissedContinueShows[sid] = Date.now();
    persistVideoUiState();

    // Clear the resume entry for the current episode.
    const vid = String(episodeId || '');
    if (vid) {
      try { await Tanko.api.videoProgress.clear(vid); } catch {}
      if (state.progress && typeof state.progress === 'object') delete state.progress[vid];
    }

    rerenderVideoAfterProgress();
  }

  function makeContinueShowTile(item){
    const show = item && item.show;
    const ep = item && item.episode;
    if (!show || !ep) return document.createElement('div');

    const tile = document.createElement('div');
    tile.className = 'contTile';

    const cover = document.createElement('div');
    cover.className = 'contCover';

    const img = document.createElement('img');
    img.className = 'thumb contCoverImg';
    img.alt = '';
    const thumb = pickShowThumb(show);
    // pickShowThumb already returns a usable URL (or EMPTY_IMG). Do not wrap it again.
    img.src = thumb || EMPTY_IMG;
    attachShowPoster(img, show.id);
    cover.appendChild(img);

    const remove = document.createElement('button');
    remove.className = 'contRemove';
    remove.title = 'Clear from Continue Watching';
    remove.textContent = '✕';
    remove.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await clearContinueShow(show.id, ep.id);
    };
    cover.appendChild(remove);

    // Build 100v5 — Continue Watching density parity:
    // Comic tiles show only essential overlays (progress), not a redundant "Continue" chip.
    // Keep the right-side progress badge when we have a computed percent; otherwise omit.
    const pct = pctForVideoId(ep.id);
    if (pct !== null) {
      const pctWrap = document.createElement('div');
      pctWrap.className = 'contPctBadge';
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = pct >= 99 ? 'Finished' : (pct + '%');
      pctWrap.appendChild(b);
      cover.appendChild(pctWrap);
    }

    tile.appendChild(cover);

    const titleWrap = document.createElement('div');
    titleWrap.className = 'contTitleWrap';

    const title = document.createElement('div');
    title.className = 'contTileTitle u-clamp2';
    title.title = show.name || '';
    title.textContent = show.name || 'Show';

    // Build 100v2 — UI parity: Video Continue Watching should match Comic Continue Reading.
    // Comics shows ONE concise label under the tile; Video file names are often noisy (fansub tags, codec info).
    // Keep the show title only to avoid congestion. (Do not affect click / resume behavior.)
    titleWrap.appendChild(title);
    tile.appendChild(titleWrap);

    tile.onclick = () => safe(() => playViaShell(ep));
    tile.addEventListener('contextmenu', (e) => openContinueShowContextMenu(e, show, ep));

    // Build 23: optional drag-and-drop poster on Continue Watching tiles too.
    const _posterDropHover2 = (on) => { try { tile.classList.toggle('posterDropTarget', !!on); } catch {} };
    const _posterDragOver2 = (e) => {
      try {
        const f = firstImageFileFromDataTransfer(e.dataTransfer);
        if (!f) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        _posterDropHover2(true);
      } catch {}
    };
    const _posterDragLeave2 = (_e) => { _posterDropHover2(false); };
    const _posterDrop2 = async (e) => {
      try {
        const f = firstImageFileFromDataTransfer(e.dataTransfer);
        if (!f) return;
        e.preventDefault();
        e.stopPropagation();
        _posterDropHover2(false);
        await setShowPosterFromDroppedFile(show.id, f);
      } catch {}
    };
    cover.addEventListener('dragenter', _posterDragOver2);
    cover.addEventListener('dragover', _posterDragOver2);
    cover.addEventListener('dragleave', _posterDragLeave2);
    cover.addEventListener('drop', _posterDrop2);
    return tile;
  }

  function makeVideoRow(v, isContinue) {
    const row = document.createElement('div');
    row.className = 'videoRow';

    const left = document.createElement('div');
    left.className = 'videoRowLeft';

    const img = document.createElement('img');
    img.className = 'videoThumb';
    img.alt = '';
    img.src = v.thumbPath ? thumbUrl(v.thumbPath) : EMPTY_IMG;
    left.appendChild(img);

    const main = document.createElement('div');
    main.className = 'videoRowMain';

    const title = document.createElement('div');
    title.className = 'videoRowTitle';
    title.textContent = v.title || 'Untitled';

    const metaLines = document.createElement('div');
    metaLines.className = 'videoRowMetaLines';

    const meta1 = document.createElement('div');
    meta1.className = 'videoRowMeta';
    meta1.textContent = videoTechLine(v) || '';

    const meta2 = document.createElement('div');
    meta2.className = 'videoRowMeta';
    const where = v.showName || v.folderName || '';
    meta2.textContent = (where ? (where + ' • ') : '') + (v.path || '');

    metaLines.appendChild(meta1);
    metaLines.appendChild(meta2);

    main.appendChild(title);
    main.appendChild(metaLines);

    const pct = pctForVideoId(v.id);
    if (pct !== null && pct < 99) {
      const bar = document.createElement('div');
      bar.className = 'videoProgressBar';
      const fill = document.createElement('div');
      fill.className = 'videoProgressFill';
      fill.style.setProperty('--pct', pct + '%');
      bar.appendChild(fill);
      main.appendChild(bar);
    }

    left.appendChild(main);

    const right = document.createElement('div');
    right.className = 'videoRowRight';

    if (pct !== null) {
      const badge = document.createElement('div');
      badge.className = 'videoBadge';
      badge.textContent = pct >= 99 ? 'Finished' : (pct + '%');
      right.appendChild(badge);
    } else if (isContinue) {
      const badge = document.createElement('div');
      badge.className = 'videoBadge';
      badge.textContent = 'Resume';
      right.appendChild(badge);
    }

    row.appendChild(left);
    row.appendChild(right);

    row.ondblclick = () => safe(() => playViaShell(v));
    return row;
  }

  function humanBytes(n){
    const b = Number(n);
    if (!Number.isFinite(b) || b <= 0) return '';
    const units = ['B','KB','MB','GB','TB'];
    let x = b;
    let i = 0;
    while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
    const dp = x >= 100 ? 0 : (x >= 10 ? 1 : 2);
    return `${x.toFixed(dp)} ${units[i]}`;
  }

  function fmtDate(ms){
    const t = Number(ms);
    if (!Number.isFinite(t) || t <= 0) return '';
    const d = new Date(t);
    try { return d.toLocaleDateString(); } catch { return d.toISOString().slice(0,10); }
  }

  function basename(fp){
    const s = String(fp || '').replace(/\\/g, '/');
    return s.split('/').filter(Boolean).slice(-1)[0] || s;
  }

  // BUILD100v3: Video folder view text density parity.
  // Comic folder views are intentionally minimal and rely on the preview image as identity.
  // Video library names often contain release-group / codec / resolution tags; strip those
  // aggressively for DISPLAY ONLY (never for IDs or logic) to keep the UI calm.
  function prettyShowName(show){
    const raw = String((show && (show.displayName || show.name || show.title)) || '').trim();
    if (!raw) return 'Show';

    // Drop leading bracketed release-group tags: "[Group] Foo" -> "Foo"
    let s = raw.replace(/^(\s*\[[^\]]+\]\s*)+/g, '').trim();

    // If the name already includes a breadcrumb-like path ("Show / Season 01"),
    // keep only the first segment; folder navigation already communicates location.
    if (s.includes(' / ')) s = s.split(' / ')[0].trim();

    // Remove bracket/paren groups that look like technical tags (resolution/codec/etc).
    const techRe = /(1080p|720p|480p|hevc|x265|x264|aac|flac|bd|blu\-?ray|web\-?dl|webrip|hdr|10bit|dual\s*audio|eng\s*sub|subbed|dubbed)/i;
    // Remove any [ ... ] groups containing tech.
    s = s.replace(/\s*\[[^\]]+\]\s*/g, (m) => (techRe.test(m) ? ' ' : m));
    // Remove any ( ... ) groups containing tech.
    s = s.replace(/\s*\([^\)]+\)\s*/g, (m) => (techRe.test(m) ? ' ' : m));

    s = s.replace(/\s{2,}/g, ' ').trim();
    return s || raw;
  }

  function rebuildVideoProgressSummaryCache() {
    try {
      const shows = Array.isArray(state.shows) ? state.shows : [];
      const epsMap = state.episodesByShowId;
      const prog = (state.progress && typeof state.progress === 'object') ? state.progress : {};
      const out = new Map();

      for (const sh of shows) {
        const sid = String(sh && sh.id ? sh.id : '');
        if (!sid) continue;

        const eps = (epsMap && typeof epsMap.get === 'function') ? (epsMap.get(sid) || []) : [];
        const total = Array.isArray(eps) ? eps.length : 0;

        let watched = 0;
        let inProgress = 0;
        let sum = 0; // 0..total

        if (total) {
          for (const e of eps) {
            if (!e) continue;
            const vid = e.id ? String(e.id) : '';
            if (!vid) continue;

            const p = prog[vid] || null;
            if (p && p.finished) {
              watched++;
              sum += 1;
              continue;
            }

            const pos = Number(p && p.positionSec);
            const dur = Number(p && p.durationSec);
            if (!Number.isFinite(pos) || pos < 10) continue;

            inProgress++;
            if (Number.isFinite(dur) && dur > 0) sum += clamp(pos / dur, 0, 1);
          }
        }

        const percent = total ? clamp(Math.round((sum / total) * 100), 0, 100) : 0;
        out.set(sid, { total, watched, inProgress, percent });
      }

      state.showProgressSummary = out;
    } catch {
      state.showProgressSummary = new Map();
    }
  }

  function showProgressForShowId(showId){
    const sid = String(showId || '');
    const cached = (state.showProgressSummary && typeof state.showProgressSummary.get === 'function')
      ? state.showProgressSummary.get(sid)
      : null;
    if (cached && typeof cached === 'object') return cached;
    const eps = state.episodesByShowId?.get?.(sid) || [];
    const total = eps.length;
    if (!total) return { total: 0, watched: 0, inProgress: 0, percent: 0 };

    let watched = 0;
    let inProgress = 0;
    let sum = 0; // 0..total

    for (const e of eps) {
      if (!e) continue;
      const p = state.progress?.[e.id] || null;
      const finished = !!p?.finished;
      if (finished) {
        watched++;
        sum += 1;
        continue;
      }

      const pos = Number(p?.positionSec);
      const dur = Number(p?.durationSec);
      if (Number.isFinite(pos) && pos >= 10) {
        inProgress++;
        if (Number.isFinite(dur) && dur > 0) {
          sum += Math.max(0, Math.min(1, pos / dur));
        }
      }
    }

    const percent = Math.max(0, Math.min(100, Math.round((sum / total) * 100)));
    return { total, watched, inProgress, percent };
  }

  let progressUiRefreshTimer = null;
  let progressUiNeedsFullRebuild = false;
  let progressUiChanged = false;
  const progressUiTouchedShowIds = new Set();

  function recomputeShowProgressSummary(showId){
    const sid = String(showId || '');
    if (!sid) return;
    const eps = state.episodesByShowId?.get?.(sid) || [];
    const total = Array.isArray(eps) ? eps.length : 0;

    let watched = 0;
    let inProgress = 0;
    let sum = 0;

    if (total) {
      for (const e of eps) {
        if (!e) continue;
        const p = state.progress?.[e.id] || null;
        const finished = !!p?.finished;
        if (finished) {
          watched++;
          sum += 1;
          continue;
        }

        const pos = Number(p?.positionSec);
        const dur = Number(p?.durationSec);
        if (Number.isFinite(pos) && pos >= 10) {
          inProgress++;
          if (Number.isFinite(dur) && dur > 0) {
            sum += Math.max(0, Math.min(1, pos / dur));
          }
        }
      }
    }

    if (!(state.showProgressSummary instanceof Map)) state.showProgressSummary = new Map();
    const percent = total ? Math.max(0, Math.min(100, Math.round((sum / total) * 100))) : 0;
    state.showProgressSummary.set(sid, { total, watched, inProgress, percent });
  }

  function scheduleProgressUiRefresh({ needsFull = false, showId = '' } = {}){
    progressUiChanged = true;
    if (needsFull) progressUiNeedsFullRebuild = true;
    const sid = String(showId || '');
    if (sid) progressUiTouchedShowIds.add(sid);
    if (progressUiRefreshTimer) return;

    progressUiRefreshTimer = setTimeout(() => {
      progressUiRefreshTimer = null;
      const doFull = !!progressUiNeedsFullRebuild;
      const touched = Array.from(progressUiTouchedShowIds);
      const touchedSet = new Set(touched);
      const hadChanges = !!progressUiChanged;

      progressUiNeedsFullRebuild = false;
      progressUiChanged = false;
      progressUiTouchedShowIds.clear();

      if (!hadChanges) return;

      if (doFull) {
        rebuildVideoProgressSummaryCache();
      } else {
        for (const oneSid of touched) recomputeShowProgressSummary(oneSid);
      }

      if (state.mode !== 'videos') return;

      if (state.videoSubView === 'home') {
        if (doFull || touched.length) renderVideoHome();
      } else if (state.videoSubView === 'show') {
        const currentSid = String(state.selectedShowId || '');
        if (doFull || (currentSid && touchedSet.has(currentSid))) renderVideoShowView();
      }

      // Continue shelf is small; keep it fresh on each coalesced progress batch.
      renderContinue();
    }, 120);
  }

  function folderProgressForEpisodes(eps){
    const list = Array.isArray(eps) ? eps : [];
    const total = list.length;
    if (!total) return { total: 0, watched: 0, inProgress: 0, percent: 0 };

    let watched = 0;
    let inProgress = 0;
    let sum = 0; // 0..total

    for (const e of list) {
      if (!e) continue;
      const p = state.progress?.[e.id] || null;
      const finished = !!p?.finished;
      if (finished) {
        watched++;
        sum += 1;
        continue;
      }

      const pos = Number(p?.positionSec);
      const dur = Number(p?.durationSec);
      if (Number.isFinite(pos) && pos >= 10) {
        inProgress++;
        if (Number.isFinite(dur) && dur > 0) {
          sum += Math.max(0, Math.min(1, pos / dur));
        }
      }
    }

    const percent = Math.max(0, Math.min(100, Math.round((sum / total) * 100)));
    return { total, watched, inProgress, percent };
  }

  function folderLabelForShow(show, folderRelPath, epsInFolder){
    const rp = String(folderRelPath || '').replace(/\\/g, '/');
    if (rp) return rp;
    if (show?.isLoose) return 'Files';
    if (show?.isMovie) return 'Movie';
    const n = Array.isArray(epsInFolder) ? epsInFolder.length : 0;
    if (n === 1) return 'Movie';
    return 'Root';
  }

  function getVisibleShows(){
    const rootId = state.selectedRootId;
    let list = rootId ? state.shows.filter(s => s.rootId === rootId) : state.shows.slice();

    // Build 3.4: optional shelf filter
    if (state.hideWatchedShows) {
      list = list.filter(s => {
        const pr = showProgressForShowId(s.id);
        return !(pr.total > 0 && pr.watched >= pr.total);
      });
    }
    list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' }));
    return list;
  }

  function pickShowThumb(show){
    // 1) Prefer an explicit poster/cover from the show folder.
    if (show && show.thumbPath) return thumbUrl(show.thumbPath);

    // 2) Fall back to a representative episode thumbnail.
    const eps = (show && state.episodesByShowId?.get?.(String(show.id))) || [];
    let best = null;
    let bestAt = -1;
    for (const e of eps) {
      if (!e || !e.thumbPath) continue;
      const at = Number(state.progress?.[e.id]?.updatedAt || 0);
      if (at > bestAt) { bestAt = at; best = e; }
    }
    const rep = best || eps.find(e => e && e.thumbPath) || eps[0] || null;
    return rep && rep.thumbPath ? thumbUrl(rep.thumbPath) : EMPTY_IMG;


  // ============================================================
  // Build 26: Auto-generate show posters for folders with no custom poster.
  // Source: a scanned episode thumbnail inside the show (seasons supported via episodes list).
  // Goal: as soon as scan thumbs exist, create a stable folder poster immediately.
  // ============================================================

  const autoPosterTried = new Set();          // showId we've evaluated (avoid repeat sweeps)
  const autoPosterInFlight = new Map();       // showId -> Promise
  let autoPosterSweepTimer = null;

  function scheduleAutoPosterSweep() {
    if (autoPosterSweepTimer) return;
    autoPosterSweepTimer = setTimeout(() => {
      autoPosterSweepTimer = null;
      safe(() => maybeAutoGenerateShowPosters());
    }, 120);
  }

  function pickRepresentativeEpisodeWithThumb(showId){
    const sid = String(showId || '');
    const eps = (sid && state.episodesByShowId?.get?.(sid)) ? state.episodesByShowId.get(sid) : [];
    if (!eps || !eps.length) return null;
    let best = null;
    let bestAt = -1;
    for (const e of eps) {
      if (!e || !e.thumbPath) continue;
      const at = Number(state.progress?.[e.id]?.updatedAt || 0);
      if (at > bestAt) { bestAt = at; best = e; }
    }
    return best || eps.find(e => e && e.thumbPath) || null;
  }

  async function maybeAutoGenerateShowPosters() {
    try {
      if (!Tanko.api.videoPoster || !Tanko.api.videoPoster.save) return;

      const shows = Array.isArray(state.shows) ? state.shows : [];
      if (!shows.length) return;

      // Limit work per sweep to keep UI responsive.
      const candidates = [];
      for (const show of shows) {
        const sid = String(show?.id || '');
        if (!sid) continue;
        if (autoPosterTried.has(sid)) continue;

        // If there's already an explicit thumb in the folder, treat it as set.
        if (show?.thumbPath) { autoPosterTried.add(sid); continue; }

        const rep = pickRepresentativeEpisodeWithThumb(sid);
        if (!rep || !rep.thumbPath) continue;

        candidates.push({ sid, repThumbPath: rep.thumbPath });
        if (candidates.length >= 3) break;
      }

      if (!candidates.length) return;

      for (const c of candidates) {
        const sid = c.sid;
        if (autoPosterInFlight.has(sid)) continue;

        const p = (async () => {
          try {
            // Double-check: if a custom poster already exists, skip.
            if (Tanko.api.videoPoster.has) {
              const has = await Tanko.api.videoPoster.has(String(sid));
              if (has) { autoPosterTried.add(sid); return; }
            } else {
              const existing = await getShowPosterUrl(sid);
              if (existing) { autoPosterTried.add(sid); return; }
            }

            const u = thumbUrl(c.repThumbPath);
            if (!u || u === EMPTY_IMG) { autoPosterTried.add(sid); return; }

            const dataUrl = await imageUrlToJpegDataUrl(u);
            if (!dataUrl) { autoPosterTried.add(sid); return; }

            // Re-check right before writing (race with user paste/set).
            if (Tanko.api.videoPoster.has) {
              const has2 = await Tanko.api.videoPoster.has(String(sid));
              if (has2) { autoPosterTried.add(sid); return; }
            }

            const r = await Tanko.api.videoPoster.save(String(sid), dataUrl);
            if (!r || r.ok === false) { autoPosterTried.add(sid); return; }

            bumpShowPosterRev(sid);
            setShowPosterCacheImmediate(sid, dataUrl);
            rerenderVideoAfterProgress();
            autoPosterTried.add(sid);
          } catch {
            autoPosterTried.add(sid);
          } finally {
            autoPosterInFlight.delete(sid);
          }
        })();

        autoPosterInFlight.set(sid, p);
      }
    } catch {}
  }
  }


  function openCtxMenu(e, items){
    e.preventDefault();
    e.stopPropagation();
    const fn = (typeof showContextMenu === 'function') ? showContextMenu : (window && window.showContextMenu ? window.showContextMenu : null);
    if (!fn) return;
    fn({ x: e.clientX, y: e.clientY, items: items || [] });
  }

  function openCtxMenuAt(x, y, items){
  const fn = (typeof showContextMenu === 'function') ? showContextMenu : (window && window.showContextMenu ? window.showContextMenu : null);
  if (!fn) return;
  fn({ x: x || 0, y: y || 0, items: items || [] });
}

  function isPlayerInteractiveTarget(t){
  if (!t || !(t instanceof Element)) return false;
  // anything inside HUD / panels / controls should not trigger the left-click menu
  return !!t.closest(
    '#videoHud,' +
    '#videoTracksPanel,' +
    '#videoScrub,' +
    '#videoPlaylistPanel,' +
    '#videoVolPanel,#videoSpeedPanel,' +
    'button,input,select,textarea,' +
    '[role="button"],[role="slider"],[role="listbox"],[role="option"]'
  );
}

  function closeOrBackFromPlayer(){
  // mirrors the behavior of the existing Back button handler
  safe(async () => {
    await saveNow(true);
    if (IS_VIDEO_SHELL) { safe(() => showVideoLibrary()); safe(() => Tanko.api.window.close()); return; }
    showVideoLibrary();
  });
}

  function getPrevNextEpisodeFromNow(){
  const ep = state.now;
  const sid = String(ep?.showId || '');
  const eid = String(ep?.id || '');
  if (!sid || !eid) return { prev: null, next: null };

  const eps = canonicalEpisodesForShow(sid) || [];
  const i = eps.findIndex(e => String(e?.id || '') === eid);
  return {
    prev: (i > 0) ? eps[i - 1] : null,
    next: (i >= 0 && i < eps.length - 1) ? eps[i + 1] : null,
  };
}


  function resetSubtitleDelay(){
  safe(async () => {
    if (!state.player || typeof state.player.setSubtitleDelay !== 'function') return;
    const r = await state.player.setSubtitleDelay(0);
    if (r && r.ok === false) { toast(r.error || 'Failed to reset subtitle delay'); return; }
    cachedSubtitleDelaySec = 0;
    syncDelayUi();
    toast('Subtitle delay reset');
    // Build 61: persist delay reset per episode
    schedulePlaybackPreferencesSave();
  });
}

function applyAspectMode(v){
  safe(async () => {
    if (!state.player || typeof state.player.setAspectRatio !== 'function') return;
    const mode = String(v || 'auto');
    const r = await state.player.setAspectRatio(mode);
    if (r && r.ok === false) { toast(r.error || 'Failed to set aspect'); return; }
    cachedAspectMode = mode;
    syncTransformsUi();
    toast(mode === 'auto' ? 'Aspect reset' : `Aspect ${mode}`);
  });
}

function applyCropMode(v){
  safe(async () => {
    if (!state.player || typeof state.player.setCrop !== 'function') return;
    const mode = String(v || 'none');
    const r = await state.player.setCrop(mode);
    if (r && r.ok === false) { toast(r.error || 'Failed to set crop'); return; }
    cachedCropMode = mode;
    syncTransformsUi();
    toast(mode === 'none' ? 'Crop cleared' : `Crop ${mode}`);
  });
}

function buildPotLikeLeftClickMenuItems(){
  const st = state.player?.getState?.() || {};
  const paused = !!st.paused;
  const muted = !!st.muted;
  const speed = Number.isFinite(st.speed) ? st.speed : Number(state.settings.speed || 1);

  const { prev, next } = getPrevNextEpisodeFromNow();

  const items = [];

  // === Playback ===
  items.push({ label: paused ? 'Play' : 'Pause', onClick: () => { state.player?.togglePlay(); showHud(); } });
  items.push({ label: 'Stop', onClick: () => { closeOrBackFromPlayer(); } });
  items.push({ separator: true });

  items.push({ label: 'Seek Back 10s', onClick: () => { safe(() => seekBy(-10)); showHud(); } });
  items.push({ label: 'Seek Back 30s', onClick: () => { safe(() => seekBy(-30)); showHud(); } });
  items.push({ label: 'Seek Forward 10s', onClick: () => { safe(() => seekBy(10)); showHud(); } });
  items.push({ label: 'Seek Forward 30s', onClick: () => { safe(() => seekBy(30)); showHud(); } });

  items.push({ separator: true });

  items.push({ label: `Speed Up  (+)  [${speed.toFixed(2)}×]`, onClick: () => { cycleSpeed(1); showHud(); } });
  items.push({ label: `Speed Down (−)  [${speed.toFixed(2)}×]`, onClick: () => { cycleSpeed(-1); showHud(); } });

  // Presets (real mpv setSpeed + persist)
  items.push({ label: 'Speed 0.50×', onClick: () => { setSpeedExact(0.5); showHud(); } });
  items.push({ label: 'Speed 1.00×', onClick: () => { setSpeedExact(1.0); showHud(); } });
  items.push({ label: 'Speed 1.25×', onClick: () => { setSpeedExact(1.25); showHud(); } });
  items.push({ label: 'Speed 1.50×', onClick: () => { setSpeedExact(1.5); showHud(); } });
  items.push({ label: 'Speed 2.00×', onClick: () => { setSpeedExact(2.0); showHud(); } });

  items.push({ separator: true });

  // === Playlist (episode navigation) ===
  items.push({ label: 'Previous Episode', disabled: !prev, onClick: () => {
    if (!prev) return;
    if (typeof playViaShell === 'function') safe(() => playViaShell(prev));
    else safe(() => openVideo(prev));
  } });
  items.push({ label: 'Next Episode', disabled: !next, onClick: () => {
    if (!next) return;
    if (typeof playViaShell === 'function') safe(() => playViaShell(next));
    else safe(() => openVideo(next));
  } });

  items.push({
    label: 'Open Playlist Panel',
    disabled: !(typeof togglePlaylistPanel === 'function' && el.videoPlaylistPanel),
    onClick: () => { try { togglePlaylistPanel(); } catch {} showHud(); }
  });

  items.push({ separator: true });

  // === Audio ===
  items.push({ label: muted ? 'Unmute' : 'Mute', onClick: () => { toggleMute(); showHud(); } });

  items.push({
    label: 'Volume +',
    onClick: () => {
      const cur = Number.isFinite(st.volume) ? Number(st.volume) : Number(state.settings.volume || 1);
      const nextV = clamp(cur + 0.05, 0, 1);
      if (typeof queueVolumeToPlayer === 'function') queueVolumeToPlayer(nextV);
      else state.player?.setVolume?.(nextV);
      state.settings.volume = nextV;
      if (el.videoVol) el.videoVol.value = String(Math.round(nextV * 100));
      persistVideoSettings({ volume: nextV, muted: false });
      showHud();
    }
  });

  items.push({
    label: 'Volume −',
    onClick: () => {
      const cur = Number.isFinite(st.volume) ? Number(st.volume) : Number(state.settings.volume || 1);
      const nextV = clamp(cur - 0.05, 0, 1);
      if (typeof queueVolumeToPlayer === 'function') queueVolumeToPlayer(nextV);
      else state.player?.setVolume?.(nextV);
      state.settings.volume = nextV;
      if (el.videoVol) el.videoVol.value = String(Math.round(nextV * 100));
      persistVideoSettings({ volume: nextV });
      showHud();
    }
  });

  items.push({
    label: 'Volume Panel…',
    onClick: () => {
      if (typeof openVolPanel === 'function') return openVolPanel();
      showHud();
      el.videoVol?.focus?.();
    }
  });

  items.push({ separator: true });

  items.push({
    label: 'Audio Track…',
    onClick: () => { if (tracksPanelOpen) closeTracksPanel(); openTracksPanel(); showHud(); }
  });

  items.push({ separator: true });

  // === Subtitles ===
  items.push({
    label: 'Subtitle Track…',
    onClick: () => { if (tracksPanelOpen) closeTracksPanel(); openTracksPanel('subs'); showHud(); }
  });

  items.push({ label: 'Subtitle Delay −', onClick: () => { safe(() => nudgeDelay('subtitle', -1)); showHud(); } });
  items.push({ label: 'Subtitle Delay +', onClick: () => { safe(() => nudgeDelay('subtitle', 1)); showHud(); } });
  items.push({ label: 'Subtitle Delay Reset', onClick: () => { resetSubtitleDelay(); showHud(); } });

  items.push({
    label: 'Subtitle Delay Controls…',
    onClick: () => { if (tracksPanelOpen) closeTracksPanel(); openTracksPanel('subDelay'); showHud(); }
  });

  items.push({ separator: true });

  // === Video / Display ===
  const aspectOpts = Array.from(el.videoAspectSelect?.options || []).map(o => ({ v: o.value, t: o.textContent || o.value }));
  const cropOpts = Array.from(el.videoCropSelect?.options || []).map(o => ({ v: o.value, t: o.textContent || o.value }));

  for (const o of aspectOpts) items.push({ label: `Aspect: ${o.t}`, onClick: () => applyAspectMode(o.v) });
  items.push({ separator: true });
  for (const o of cropOpts) items.push({ label: `Crop: ${o.t}`, onClick: () => applyCropMode(o.v) });

  items.push({
    label: 'Reset Transforms',
    disabled: !(state.player && typeof state.player.resetVideoTransforms === 'function'),
    onClick: () => { el.videoResetTransformsBtn?.click?.(); }
  });

  items.push({ separator: true });

  // === Preferences / Advanced ===
  items.push({
    label: 'Show File in Explorer',
    disabled: !(state.now?.path && Tanko.api?.shell?.revealPath),
    onClick: () => { if (state.now?.path) Tanko.api.shell.revealPath?.(state.now.path); }
  });

  items.push({
    label: 'Copy File Path',
    disabled: !(state.now?.path && Tanko.api?.clipboard?.copyText),
    onClick: () => { if (state.now?.path) Tanko.api.clipboard.copyText?.(String(state.now.path)); toast('Path copied'); }
  });

  items.push({
    label: 'Key Mapping…',
    disabled: !(typeof openKeymapMenuFromVideo === 'function'),
    onClick: () => { try { openKeymapMenuFromVideo(); } catch {} }
  });

  items.push({ label: 'Close Player', onClick: () => closeOrBackFromPlayer() });

  return items;
}

function openPotLikeLeftClickMenuAt(x, y){
  if (!state.player) return;
  const items = buildPotLikeLeftClickMenuItems();
  openCtxMenuAt(x, y, items);
}

function getEpisodeById(epId){
    if (!epId) return null;
    return state.episodeById?.get?.(String(epId)) || null;
  }

  function getShowById(showId){
    if (!showId) return null;
    return state.shows.find(s => String(s.id) === String(showId)) || null;
  }

  // Canonical order for a show: folder order (natural), then episode title (natural).
  // This is intentionally independent of the UI's sort dropdown, so actions like
  // "Play next unwatched" behave like a real library.
  function canonicalEpisodesForShow(showId){
    const eps = (state.episodesByShowId?.get?.(String(showId)) || []).slice();
    const folderOf = (e) => String(e?.folderRelPath || '').replace(/\\/g, '/');
    const titleOf = (e) => String(e?.title || basename(e?.path || '') || '');

    eps.sort((a, b) => {
      const fa = folderOf(a);
      const fb = folderOf(b);
      const c1 = fa.localeCompare(fb, undefined, { numeric: true, sensitivity: 'base' });
      if (c1) return c1;
      const c2 = titleOf(a).localeCompare(titleOf(b), undefined, { numeric: true, sensitivity: 'base' });
      if (c2) return c2;
      return String(a?.path || '').localeCompare(String(b?.path || ''));
    });
    return eps;
  }

  function sortedEpisodesForShow(showId){
    // Keep the existing helper name, but make it canonical.
    return canonicalEpisodesForShow(showId);
  }

  function pickNextUnwatchedEpisode(showId, afterEpisodeId){
    const eps = sortedEpisodesForShow(showId);
    if (!eps.length) return null;

    const prog = state.progress || {};
    const isUnwatched = (ep) => !(prog && prog[ep.id] && prog[ep.id].finished);

    let start = -1;
    if (afterEpisodeId) start = eps.findIndex(e => String(e.id) === String(afterEpisodeId));

    for (let i = start + 1; i < eps.length; i++) {
      if (isUnwatched(eps[i])) return eps[i];
    }
    for (let i = 0; i <= start; i++) {
      if (isUnwatched(eps[i])) return eps[i];
    }
    // all watched — fall back to first
    return eps[0];
  }

  function pickResumeEpisode(showId){
    const eps = sortedEpisodesForShow(showId);
    if (!eps.length) return null;

    const prog = state.progress || {};
    let best = null;
    let bestAt = -1;

    for (const ep of eps) {
      const p = prog && prog[ep.id];
      if (!p || p.finished) continue;
      const pos = Number(p.positionSec);
      if (!Number.isFinite(pos) || pos < 10) continue;
      const at = Number(p.updatedAt || 0);
      if (at > bestAt) { bestAt = at; best = ep; }
    }

    return best || pickNextUnwatchedEpisode(showId, null) || eps[0];
  }


  // Item 7: Coalesce progress-driven renders (one render per frame) to avoid render storms.
  let _videoRenderScheduled = false;
  let _videoRenderPending = false;
  let _videoDerivedDirty = false;

    function scheduleRenderVideoLibrary() {
    // Video library disabled: keep view intentionally blank.
    return;
  }

    function rerenderVideoAfterProgress(){
    // Video library disabled: no library UI to rerender.
    return;
  }


  async function setEpisodeWatched(ep, watched, opts){
    const o = (opts && typeof opts === 'object') ? opts : {};
    if (!ep || !ep.id) return;
    if (!Tanko.api.videoProgress.save) return;

    const prev = state.progress?.[ep.id] || {};
    const dur0 = Number(ep.durationSec);
    const dur1 = Number(prev.durationSec);
    const dur = Number.isFinite(dur0) ? dur0 : (Number.isFinite(dur1) ? dur1 : null);

    const payload = watched ? {
      positionSec: Number.isFinite(Number(dur)) && Number(dur) > 0 ? Number(dur) : 0,
      durationSec: Number.isFinite(Number(dur)) && Number(dur) > 0 ? Number(dur) : null,
      finished: true,
      completedAtMs: Date.now(),
      maxPositionSec: Number.isFinite(Number(dur)) && Number(dur) > 0 ? Number(dur) : 0,
      watchedSecApprox: Number.isFinite(Number(dur)) && Number(dur) > 0 ? Number(dur) : 0,
    } : {
      positionSec: 0,
      durationSec: Number.isFinite(Number(dur)) && Number(dur) > 0 ? Number(dur) : null,
      finished: false,
      completedAtMs: null,
      maxPositionSec: 0,
      watchedSecApprox: 0,
    };
    await Tanko.api.videoProgress.save(ep.id, payload);
    state.progress = (state.progress && typeof state.progress === 'object') ? state.progress : {};
    state.progress[ep.id] = { ...payload, updatedAt: Date.now() };
    if (!o.noRerender) rerenderVideoAfterProgress();
    if (!o.silent) toast(watched ? 'Marked watched' : 'Marked unwatched');
  }

  async function clearEpisodeProgress(ep, opts){
    const o = (opts && typeof opts === 'object') ? opts : {};
    if (!ep || !ep.id) return;
    if (!Tanko.api.videoProgress.clear) return;

    await Tanko.api.videoProgress.clear(ep.id);
    if (state.progress && typeof state.progress === 'object') delete state.progress[ep.id];
    if (!o.noRerender) rerenderVideoAfterProgress();
    if (!o.silent) toast('Progress cleared');
  }

  async function markShowWatched(showId, watched){
    const eps = sortedEpisodesForShow(showId);
    if (!eps.length) return;

    for (const ep of eps) {
      // eslint-disable-next-line no-await-in-loop
      await setEpisodeWatched(ep, watched, { silent: true, noRerender: true });
    }

    rerenderVideoAfterProgress();
    toast(watched ? 'Marked show watched' : 'Marked show unwatched');
  }

  async function clearShowProgress(showId){
    const eps = sortedEpisodesForShow(showId);
    if (!eps.length) return;

    for (const ep of eps) {
      // eslint-disable-next-line no-await-in-loop
      await clearEpisodeProgress(ep, { silent: true, noRerender: true });
    }

    rerenderVideoAfterProgress();
    toast('Show progress cleared');
  }

  async function removeShowFromLibrary(show){
    if (!show || !show.id) return;
    const ok = (typeof confirmRemoveSeriesFromLibrary === 'function')
      ? await confirmRemoveSeriesFromLibrary()
      : false;
    if (!ok) return;

    const res = await Tanko.api.video.hideShow(show.id);
    if (res && res.state) applyVideoSnapshot(res.state);
    toast('Show removed');
  }

  function openShowContextMenu(e, show){
    const sid = show && show.id ? String(show.id) : '';
    const eps = sid ? (state.episodesByShowId?.get?.(sid) || []) : [];

    const pr = sid ? showProgressForShowId(sid) : { total: 0, watched: 0, inProgress: 0, percent: 0 };
    const showFinished = pr.total > 0 && pr.watched >= pr.total;

    openCtxMenu(e, [
      {
        label: 'Play / Continue',
        disabled: eps.length === 0,
        onClick: () => {
          const ep = pickResumeEpisode(sid) || eps[0];
          if (!ep) return;
          const p = state.progress?.[ep.id] || null;
          const pos = Number(p?.positionSec);
          if (p && !p.finished && Number.isFinite(pos) && pos >= 10) {
            state._suppressResumePromptOnce = true;
            state._resumeOverridePosSec = pos;
          }
          safe(() => playViaShell(ep, {
            suppressResumePromptOnce: !!state._suppressResumePromptOnce,
            resumeOverridePosSec: Number(state._resumeOverridePosSec || 0),
          }));
        },
      },
      {
        label: 'Play from beginning',
        disabled: eps.length === 0,
        onClick: () => {
          const ep = eps[0];
          if (!ep) return;
          state._suppressResumePromptOnce = true;
          state._resumeOverridePosSec = 0;
          safe(() => playViaShell(ep, {
            suppressResumePromptOnce: !!state._suppressResumePromptOnce,
            resumeOverridePosSec: Number(state._resumeOverridePosSec || 0),
          }));
        },
      },
      { separator: true },
      {
        label: showFinished ? 'Mark as in progress' : 'Mark as finished',
        disabled: eps.length === 0,
        onClick: () => { safe(() => markShowWatched(sid, !showFinished)); },
      },
      {
        label: 'Clear from Continue Watching',
        disabled: eps.length === 0,
        onClick: () => {
          const ep = pickResumeEpisode(sid) || eps[0];
          safe(() => clearContinueShow(sid, ep ? ep.id : null));
        },
      },
      { separator: true },
      {
        label: 'Reveal in File Explorer',
        disabled: (typeof Tanko?.api?.shell?.revealPath !== 'function'),
        onClick: async () => {
          try { await Tanko.api.shell.revealPath(show.path); } catch {}
        },
      },
      {
        label: 'Copy path',
        disabled: (typeof Tanko?.api?.clipboard?.copyText !== 'function'),
        onClick: async () => {
          try { await Tanko.api.clipboard.copyText(show.path); toast('Copied'); } catch {}
        },
      },
      { separator: true },
      {
        label: 'Set poster…',
        disabled: (typeof Tanko?.api?.videoPoster?.save !== 'function'),
        onClick: () => { safe(() => setShowPosterFromPicker(sid)); },
      },
      {
        label: 'Remove poster',
        disabled: (typeof Tanko?.api?.videoPoster?.delete !== 'function'),
        onClick: () => { safe(() => removeShowPoster(sid)); },
      },
      {
        label: 'Paste image as poster',
        disabled: (typeof Tanko?.api?.videoPoster?.paste !== 'function'),
        onClick: () => { safe(() => pasteShowPosterFromClipboard(sid)); },
      },
      {
        label: 'Generate auto thumbnail',
        disabled: (typeof Tanko?.api?.video?.generateShowThumbnail !== 'function') || eps.length === 0,
        onClick: () => { safe(() => generateAutoThumbnailForShow(sid)); },
      },
      { separator: true },
      {
        label: 'Remove show from library…',
        danger: true,
        onClick: () => { safe(() => removeShowFromLibrary(show)); },
      },
    ]);
  }

  function openContinueShowContextMenu(e, show, ep){
    if (!show || !ep) return;
    const sid = String(show.id || ep.showId || '');
    const p = state.progress?.[ep.id] || null;
    const finished = !!p?.finished;

    openCtxMenu(e, [
      {
        label: 'Play / Continue',
        onClick: () => {
          const pos = Number(p?.positionSec);
          if (p && !p.finished && Number.isFinite(pos) && pos >= 10) {
            state._suppressResumePromptOnce = true;
            state._resumeOverridePosSec = pos;
          }
          safe(() => playViaShell(ep, {
            suppressResumePromptOnce: !!state._suppressResumePromptOnce,
            resumeOverridePosSec: Number(state._resumeOverridePosSec || 0),
          }));
        },
      },
      {
        label: 'Play from beginning',
        onClick: () => {
          state._suppressResumePromptOnce = true;
          state._resumeOverridePosSec = 0;
          safe(() => playViaShell(ep, {
            suppressResumePromptOnce: !!state._suppressResumePromptOnce,
            resumeOverridePosSec: Number(state._resumeOverridePosSec || 0),
          }));
        },
      },
      { separator: true },
      {
        label: finished ? 'Mark as in progress' : 'Mark as finished',
        onClick: () => { safe(() => setEpisodeWatched(ep, !finished)); },
      },
      {
        label: 'Clear from Continue Watching',
        onClick: () => { safe(() => clearContinueShow(sid, ep.id)); },
      },
      { separator: true },
      {
        label: 'Reveal in File Explorer',
        disabled: (typeof Tanko?.api?.shell?.revealPath !== 'function'),
        onClick: async () => {
          try { await Tanko.api.shell.revealPath(ep.path); } catch {}
        },
      },
      { separator: true },
      {
        label: 'Set poster…',
        disabled: (typeof Tanko?.api?.videoPoster?.save !== 'function'),
        onClick: () => { safe(() => setShowPosterFromPicker(sid)); },
      },
      {
        label: 'Remove poster',
        disabled: (typeof Tanko?.api?.videoPoster?.delete !== 'function'),
        onClick: () => { safe(() => removeShowPoster(sid)); },
      },
      {
        label: 'Paste image as poster',
        disabled: (typeof Tanko?.api?.videoPoster?.paste !== 'function'),
        onClick: () => { safe(() => pasteShowPosterFromClipboard(sid)); },
      },
      {
        label: 'Generate auto thumbnail',
        disabled: (typeof Tanko?.api?.video?.generateShowThumbnail !== 'function'),
        onClick: () => { safe(() => generateAutoThumbnailForShow(sid)); },
      },
    ]);
  }

  function openEpisodeContextMenu(e, ep){
    if (!ep) return;

    // On right-click, adopt selection so actions are predictable.
    selectEpisode(ep.id);

    const p = state.progress?.[ep.id] || null;
    const finished = !!p?.finished;

    openCtxMenu(e, [
      {
        label: 'Play / Continue',
        onClick: () => {
          const pos = Number(p?.positionSec);
          if (p && !p.finished && Number.isFinite(pos) && pos >= 10) {
            state._suppressResumePromptOnce = true;
            state._resumeOverridePosSec = pos;
          }
          safe(() => playViaShell(ep, {
            suppressResumePromptOnce: !!state._suppressResumePromptOnce,
            resumeOverridePosSec: Number(state._resumeOverridePosSec || 0),
          }));
        },
      },
      {
        label: 'Play from beginning',
        onClick: () => {
          state._suppressResumePromptOnce = true;
          state._resumeOverridePosSec = 0;
          safe(() => playViaShell(ep, {
            suppressResumePromptOnce: !!state._suppressResumePromptOnce,
            resumeOverridePosSec: Number(state._resumeOverridePosSec || 0),
          }));
        },
      },
      { separator: true },
      {
        label: finished ? 'Mark as in progress' : 'Mark as finished',
        onClick: () => { safe(() => setEpisodeWatched(ep, !finished)); },
      },
      {
        label: 'Clear from Continue Watching',
        onClick: () => { safe(() => clearContinueShow(String(ep.showId), ep.id)); },
      },
      {
        label: 'Clear progress',
        disabled: !p,
        onClick: () => { safe(() => clearEpisodeProgress(ep)); },
      },
      {
        label: 'Remove from Added Files',
        disabled: String(ep?.rootId || '') !== '__added_files__',
        onClick: async () => {
          try {
            const r = await Tanko.api.video.removeFile(ep.path);
            if (r && r.ok && r.state) applyVideoSnapshot(r.state);
          } catch {}
        },
      },
      { separator: true },
      {
        label: 'Reveal in File Explorer',
        disabled: (typeof Tanko?.api?.shell?.revealPath !== 'function'),
        onClick: async () => {
          try { await Tanko.api.shell.revealPath(ep.path); } catch {}
        },
      },
      {
        label: 'Copy path',
        disabled: (typeof Tanko?.api?.clipboard?.copyText !== 'function'),
        onClick: async () => {
          try { await Tanko.api.clipboard.copyText(ep.path); toast('Copied'); } catch {}
        },
      },
      { separator: true },
      {
        label: 'Set poster…',
        disabled: (typeof Tanko?.api?.videoPoster?.save !== 'function'),
        onClick: () => { safe(() => setShowPosterFromPicker(String(ep.showId))); },
      },
      {
        label: 'Remove poster',
        disabled: (typeof Tanko?.api?.videoPoster?.delete !== 'function'),
        onClick: () => { safe(() => removeShowPoster(String(ep.showId))); },
      },
      {
        label: 'Paste image as poster',
        disabled: (typeof Tanko?.api?.videoPoster?.paste !== 'function'),
        onClick: () => { safe(() => pasteShowPosterFromClipboard(String(ep.showId))); },
      },
      {
        label: 'Generate auto thumbnail',
        disabled: (typeof Tanko?.api?.video?.generateShowThumbnail !== 'function'),
        onClick: () => { safe(() => generateAutoThumbnailForShow(String(ep.showId))); },
      },
    ]);
  }

  function makeShowCard(show){
    const card = document.createElement('div');
    card.className = 'seriesCard';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'seriesRemove';
    removeBtn.title = 'Remove show';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      safe(() => removeShowFromLibrary(show));
    });
    card.appendChild(removeBtn);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');

    const coverWrap = document.createElement('div');
    coverWrap.className = 'seriesCoverWrap';

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'thumbWrap';

    const img = document.createElement('img');
    img.className = 'thumb';
    img.alt = '';

    const thumbsOn = (state.showThumbs !== false);
    const picked = thumbsOn ? pickShowThumb(show) : EMPTY_IMG;
    img.src = picked;

    // Build 10.5: render folder-tile placeholder if no thumbnail (or if thumbnails are hidden).
    if (!thumbsOn || picked === EMPTY_IMG) {
      thumbWrap.classList.add('noThumb');
    }

    // Respect custom poster overrides unless thumbs are explicitly hidden.
    if (thumbsOn) {
      attachShowPoster(img, show.id);
      // If a poster loads asynchronously (custom poster), drop placeholder styling.
      img.addEventListener('load', () => {
        try {
          const cur = String(img.currentSrc || img.src || '');
          if (cur && cur !== String(EMPTY_IMG || '')) thumbWrap.classList.remove('noThumb');
        } catch {}
      });
    }

    thumbWrap.appendChild(img);
    coverWrap.appendChild(thumbWrap);

    const name = document.createElement('div');
    name.className = 'seriesName';
    name.textContent = show?.name || 'Show';
    const sid = String(show?.id || '');
    const epCount = Number(state.showEpisodeCount?.get?.(sid) || 0) || (state.episodesByShowId?.get?.(sid) || []).length;
    const pr = showProgressForShowId(sid);
    const prBits = [];
    if (pr.watched > 0) prBits.push(`${pr.watched} watched`);
    if (pr.inProgress > 0) prBits.push(`${pr.inProgress} in progress`);
    if (pr.percent > 0) prBits.push(`${pr.percent}%`);

    const info = document.createElement('div');
    info.className = 'seriesInfo';
    const meta = document.createElement('div');
    meta.className = 'seriesMeta';

    const s1 = document.createElement('span');
    s1.textContent = `${epCount} episode${epCount === 1 ? '' : 's'}`;
    const s2 = document.createElement('span');
    s2.className = 'mono u-ellipsis';
    s2.textContent = prBits.length ? prBits.join(' · ') : (show?.displayPath || show?.path || '');

    meta.appendChild(s1);
    meta.appendChild(s2);
    info.appendChild(meta);

    card.appendChild(coverWrap);
    card.appendChild(name);
    card.appendChild(info);

    const open = () => openVideoShow(show.id);
    card.onclick = open;

    // Build 21: right-click context menu (mirror Comics style)
    card.addEventListener('contextmenu', (e) => openShowContextMenu(e, show));
    card.onkeydown = (e) => {
      const k = String(e.key || '');
      if (k === 'Enter' || k === ' ') { e.preventDefault(); open(); }
    };


    // Build 23: optional drag-and-drop poster (drop an image file onto the show tile).
    const _posterDropHover = (on) => { try { card.classList.toggle('posterDropTarget', !!on); } catch {} };
    const _posterDragOver = (e) => {
      try {
        const f = firstImageFileFromDataTransfer(e.dataTransfer);
        if (!f) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        _posterDropHover(true);
      } catch {}
    };
    const _posterDragLeave = (_e) => { _posterDropHover(false); };
    const _posterDrop = async (e) => {
      try {
        const f = firstImageFileFromDataTransfer(e.dataTransfer);
        if (!f) return;
        e.preventDefault();
        e.stopPropagation();
        _posterDropHover(false);
        await setShowPosterFromDroppedFile(show.id, f);
      } catch {}
    };
    // Attach to the cover area so drops feel intentional.
    coverWrap.addEventListener('dragenter', _posterDragOver);
    coverWrap.addEventListener('dragover', _posterDragOver);
    coverWrap.addEventListener('dragleave', _posterDragLeave);
    coverWrap.addEventListener('drop', _posterDrop);
    return card;
  }

  function renderVideoHome() {
    if (!el.videoShowsGrid || !el.videoShowsEmpty) return;

    if (el.videoRootLabel) {
      if (state.selectedRootId) {
        const r = state.roots.find(x => x.id === state.selectedRootId);
        el.videoRootLabel.textContent = r?.name || r?.displayPath || r?.path || 'Filtered folder';
      } else {
        el.videoRootLabel.textContent = 'All folders';
      }
    }

    const shows = getVisibleShows();

    // Build 90C: Chunk large show grids so the UI stays responsive on huge libraries.
    // Order and content must remain identical.
    // Cancellation token prevents interleaved renders when the view updates rapidly.
    renderVideoHome._token = (renderVideoHome._token || 0) + 1;
    const token = renderVideoHome._token;

    // Clear existing content.
    el.videoShowsGrid.textContent = '';

    el.videoShowsEmpty.classList.toggle('hidden', !!shows.length);
    if (!shows.length) return;

    const CHUNK = 60;
    const appendChunk = (startIdx) => {
      if (token !== renderVideoHome._token) return;
      const frag = document.createDocumentFragment();
      const end = Math.min(startIdx + CHUNK, shows.length);
      for (let i = startIdx; i < end; i++) frag.appendChild(makeShowCard(shows[i]));
      el.videoShowsGrid.appendChild(frag);
      if (end >= shows.length) return;

      const schedule = (cb) => {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(cb, { timeout: 120 });
        } else {
          requestAnimationFrame(() => cb());
        }
      };
      schedule(() => appendChunk(end));
    };

    // Small grids: render immediately (keeps behavior identical for common cases).
    if (shows.length <= CHUNK) {
      const frag = document.createDocumentFragment();
      for (const s of shows) frag.appendChild(makeShowCard(s));
      el.videoShowsGrid.appendChild(frag);
      return;
    }

    // Large grids: first chunk immediately, rest progressively.
    appendChunk(0);
  }


  function updateEpisodePreview(ep){
    if (!el.videoEpPreviewInfo || !el.videoEpPreviewImg) return;

    // BUILD100v6: Preview pane should never be empty in show view.
    // Comic parity behavior: the show-level poster/thumbnail anchors the right pane.
    const show = state.selectedShowId ? state.shows.find(s => String(s.id) === String(state.selectedShowId)) : null;
    const showLabel = show ? prettyShowName(show) : '—';
    const showSrc = show ? pickShowThumb(show) : EMPTY_IMG;

    const setShowPoster = () => {
      el.videoEpPreviewImg.src = showSrc || EMPTY_IMG;
      // Respect custom poster overrides (same behavior as show cards).
      if (show) attachShowPoster(el.videoEpPreviewImg, show.id);
    };

    if (!ep) {
      // No episode selected yet: show the show poster + show title (Comic folder-view parity).
      el.videoEpPreviewInfo.textContent = showLabel || '—';
      el.videoEpPreviewInfo.title = show ? (show.displayPath || show.path || show.name || showLabel) : '';
      setShowPoster();
      return;
    }

    const tech = videoTechLine(ep);
    const size = humanBytes(ep.sizeBytes ?? ep.size);
    const meta = [tech, size].filter(Boolean).join(' • ');

    // BUILD100v3: Keep preview copy minimal (Comic parity).
    // Put the verbose technical metadata into the tooltip instead.
    const label = (ep.title || basename(ep.path || '') || '—');
    el.videoEpPreviewInfo.textContent = label;
    el.videoEpPreviewInfo.title = meta ? (label + ' — ' + meta) : label;

    // BUILD100v6: Match Comic folder-view feel — the preview pane represents the show,
    // not the individual file row. Keep the poster stable and let the table selection carry the details.
    setShowPoster();
  }


  function selectEpisode(epId){
    state.selectedEpisodeId = epId || null;

    const rows = el.videoEpisodesGrid ? Array.from(el.videoEpisodesGrid.querySelectorAll('.volTrow')) : [];
    let selectedRow = null;
    for (const r of rows) {
      const isSel = String(r.dataset.id || '') === String(state.selectedEpisodeId || '');
      r.classList.toggle('sel', isSel);
      if (isSel) selectedRow = r;
    }

    // If the selection lives inside a collapsed folder section, expand it.
    if (selectedRow) {
      const section = selectedRow.closest('.vidFolderSection');
      if (section) {
        section.classList.remove('collapsed');
        const hdr = section.querySelector('.vidFolderHeader');
        if (hdr) hdr.setAttribute('aria-expanded', 'true');
      }
      try { selectedRow.scrollIntoView({ block: 'nearest' }); } catch {}
    }

    let ep = getEpisodeById(state.selectedEpisodeId);
    if (ep && state.selectedShowId && String(ep.showId) !== String(state.selectedShowId)) ep = null;

    updateEpisodePreview(ep);
    persistVideoUiState();
  }
  function makeEpisodeRow(ep, idx){
    const row = document.createElement('div');
    row.className = 'volTrow' + ((idx % 2) ? ' alt' : '');
    row.dataset.id = String(ep.id || '');

    if (String(ep.id || '') === String(state.selectedEpisodeId || '')) row.classList.add('sel');

    const mkCell = (cls, txt) => {
      const d = document.createElement('div');
      d.className = 'cell ' + cls;
      d.textContent = txt || '';
      return d;
    };

    const pct = pctForVideoId(ep.id);
    const pctTxt = (pct !== null) ? (pct >= 100 ? '100%' : (pct + '%')) : '';

    const sizeTxt = humanBytes(ep.sizeBytes ?? ep.size);
    const dur = bestDurationSec(ep);
    const durTxt = dur ? fmtTime(dur) : '';
    const r = bestResolution(ep);
    const resTxt = r ? `${r.width}×${r.height}` : '';

    row.appendChild(mkCell('num', String(idx + 1)));
    const __fileBase = basename(ep.path || '');
    const tFull = String(ep.title || 'Untitled');

    // Build 10: richer title cell (main title + filename subline) for scanability
    const titleCell = document.createElement('div');
    titleCell.className = 'cell title';
    const tMain = document.createElement('div');
    tMain.className = 'videoEpTitleMain';
    tMain.textContent = tFull;
    titleCell.appendChild(tMain);

    const baseForSub = __fileBase ? String(__fileBase) : '';
    // Build 10.5: Only show the file name subline when it adds information.
    // Many libraries derive the title from the filename (with or without extension).
    // Avoid repeating the same text twice.
    const _norm = (s) => String(s || '').toLowerCase().replace(/\s+/g,' ').trim();
    const _stem = baseForSub ? baseForSub.replace(/\.[^/.]+$/, '') : '';
    const showSub = !!(baseForSub && _norm(baseForSub) && _norm(baseForSub) !== _norm(tFull) && _norm(_stem) !== _norm(tFull));
    if (showSub) {
      const tSub = document.createElement('div');
      tSub.className = 'videoEpTitleSub';
      tSub.textContent = baseForSub;
      titleCell.appendChild(tSub);
    }

    titleCell.title = __fileBase ? (tFull + "\n" + __fileBase) : tFull;
    row.appendChild(titleCell);
    row.appendChild(mkCell('size', sizeTxt));
    row.appendChild(mkCell('duration', durTxt));
    row.appendChild(mkCell('resolution', resTxt));
    // Build 10: visual progress bar (text + bar), video-only
    const progressCell = document.createElement('div');
    progressCell.className = 'cell progress';

    const track = document.createElement('div');
    track.className = 'videoEpProgressTrack';
    const fill = document.createElement('div');
    fill.className = 'videoEpProgressFill';
    fill.style.width = (pct !== null) ? Math.max(0, Math.min(100, pct)) + '%' : '0%';
    track.appendChild(fill);

    const label = document.createElement('div');
    label.className = 'videoEpProgressLabel';
    label.textContent = pctTxt || '—';

    progressCell.appendChild(track);
    progressCell.appendChild(label);
    row.appendChild(progressCell);
    row.appendChild(mkCell('date', fmtDate(ep.mtimeMs)));

    row.onclick = () => { selectEpisode(ep.id); };
    row.ondblclick = () => { selectEpisode(ep.id); safe(() => playViaShell(ep)); };
    row.addEventListener('contextmenu', (e) => openEpisodeContextMenu(e, ep));

    return row;
  }

  // Build 22: explorer-like folder row inside a show
  function makeFolderRow(opts, altIdx){
    const o = (opts && typeof opts === 'object') ? opts : {};
    const row = document.createElement('div');
    row.className = 'volTrow folderRow' + ((altIdx % 2) ? ' alt' : '');
    row.dataset.kind = 'folder';
    row.dataset.folderRelPath = String(o.relPath || '');

    const mkCell = (cls, txt) => {
      const d = document.createElement('div');
      d.className = 'cell ' + cls;
      d.textContent = txt || '';
      return d;
    };

    row.appendChild(mkCell('num', ''));
    row.appendChild(mkCell('title', (o.isUp ? '↩ ' : '📁 ') + String(o.name || 'Folder')));
    row.appendChild(mkCell('size', ''));
    row.appendChild(mkCell('duration', ''));
    row.appendChild(mkCell('resolution', ''));
    row.appendChild(mkCell('progress', ''));
    row.appendChild(mkCell('date', Number.isFinite(Number(o.mtimeMs)) ? fmtDate(Number(o.mtimeMs)) : ''));

    row.onclick = () => {
      navigateShowFolder(String(o.relPath || ''));
    };

    return row;
  }

  // Build 22: explorer-like episode row (filename natural sort; numbering counts files only)
  function makeEpisodeRowExplorer(ep, altIdx, displayNum){
    const row = document.createElement('div');
    row.className = 'volTrow' + ((altIdx % 2) ? ' alt' : '');
    row.dataset.id = String(ep.id || '');

    if (String(ep.id || '') === String(state.selectedEpisodeId || '')) row.classList.add('sel');

    const mkCell = (cls, txt) => {
      const d = document.createElement('div');
      d.className = 'cell ' + cls;
      d.textContent = txt || '';
      return d;
    };

    const pct = pctForVideoId(ep.id);
    const pctTxt = (pct !== null) ? (pct >= 100 ? '100%' : (pct + '%')) : '';

    const sizeTxt = humanBytes(ep.sizeBytes ?? ep.size);
    const dur = bestDurationSec(ep);
    const durTxt = dur ? fmtTime(dur) : '';
    const r = bestResolution(ep);
    const resTxt = r ? `${r.width}×${r.height}` : '';

    row.appendChild(mkCell('num', String(displayNum || '')));
    const __fileBase = basename(ep.path || '');
    const tFull = String(ep.title || 'Untitled');

    // Build 10: richer title cell (main title + filename subline) for scanability
    const titleCell = document.createElement('div');
    titleCell.className = 'cell title';
    const tMain = document.createElement('div');
    tMain.className = 'videoEpTitleMain';
    tMain.textContent = tFull;
    titleCell.appendChild(tMain);

    const baseForSub = __fileBase ? String(__fileBase) : '';
    // Build 10.5: Only show the file name subline when it adds information.
    // Many libraries derive the title from the filename (with or without extension).
    // Avoid repeating the same text twice.
    const _norm = (s) => String(s || '').toLowerCase().replace(/\s+/g,' ').trim();
    const _stem = baseForSub ? baseForSub.replace(/\.[^/.]+$/, '') : '';
    const showSub = !!(baseForSub && _norm(baseForSub) && _norm(baseForSub) !== _norm(tFull) && _norm(_stem) !== _norm(tFull));
    if (showSub) {
      const tSub = document.createElement('div');
      tSub.className = 'videoEpTitleSub';
      tSub.textContent = baseForSub;
      titleCell.appendChild(tSub);
    }

    titleCell.title = __fileBase ? (tFull + "\n" + __fileBase) : tFull;
    row.appendChild(titleCell);
    row.appendChild(mkCell('size', sizeTxt));
    row.appendChild(mkCell('duration', durTxt));
    row.appendChild(mkCell('resolution', resTxt));
    // Build 10: visual progress bar (text + bar), video-only
    const progressCell = document.createElement('div');
    progressCell.className = 'cell progress';

    const track = document.createElement('div');
    track.className = 'videoEpProgressTrack';
    const fill = document.createElement('div');
    fill.className = 'videoEpProgressFill';
    fill.style.width = (pct !== null) ? Math.max(0, Math.min(100, pct)) + '%' : '0%';
    track.appendChild(fill);

    const label = document.createElement('div');
    label.className = 'videoEpProgressLabel';
    label.textContent = pctTxt || '—';

    progressCell.appendChild(track);
    progressCell.appendChild(label);
    row.appendChild(progressCell);
    row.appendChild(mkCell('date', fmtDate(ep.mtimeMs)));

    row.onclick = () => { selectEpisode(ep.id); };
    row.ondblclick = () => { selectEpisode(ep.id); safe(() => playViaShell(ep)); };
    row.addEventListener('contextmenu', (e) => openEpisodeContextMenu(e, ep));

    return row;
  }

  // Build 22: navigate within the current show's folder hierarchy (no global explorer feel).
  function navigateShowFolder(relPath){
    const normRel = (s) => String(s || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    state.epFolderRel = normRel(relPath || '');
    state.selectedEpisodeId = null;
    updateEpisodePreview(null);
    if (state.videoSubView === 'show') renderVideoShowView();
    persistVideoUiState();
  }

  function renderVideoShowView(){
    const show = state.selectedShowId ? state.shows.find(s => String(s.id) === String(state.selectedShowId)) : null;
    if (!show) { goVideoHome(); return; }

    if (!el.videoEpisodesGrid || !el.videoEpisodesWrap || !el.videoEpisodesEmpty) return;

    // Build 11: Episode search UI removed (Videos). Ensure no hidden persisted filter.
    if (state.epSearch) {
      state.epSearch = '';
      persistVideoUiState();
    }

    // Build 22: inside-show explorer sort options
    const allowedSort = new Set(['title_asc', 'modified_desc', 'modified_asc']);
    if (!allowedSort.has(String(state.epSort || ''))) {
      state.epSort = 'title_asc';
      persistVideoUiState();
    }
    if (el.videoEpSort) {
      el.videoEpSort.disabled = false;
      el.videoEpSort.title = 'Inside-show view supports Name (natural) and Modified date sorting';
      for (const opt of Array.from(el.videoEpSort.options || [])) {
        const v = String(opt.value || '');
        opt.disabled = !allowedSort.has(v);
      }
      el.videoEpSort.value = String(state.epSort || 'title_asc');
    }

    if (el.videoEpHidePreviewToggle) el.videoEpHidePreviewToggle.checked = !!state.epHidePreview;
    el.videoEpisodesWrap.classList.toggle('previewHidden', !!state.epHidePreview);

    // Build 22: explorer-like folder navigation
    const normRel = (s) => String(s || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const parentRel = (rel) => {
      const parts = normRel(rel).split('/').filter(Boolean);
      if (parts.length <= 1) return '';
      return parts.slice(0, -1).join('/');
    };
    const baseNameRel = (rel) => {
      const parts = normRel(rel).split('/').filter(Boolean);
      return parts.length ? parts[parts.length - 1] : '';
    };
    const naturalCmp = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });

    const epsAll = sortedEpisodesForShow(show.id).slice();
    if (!epsAll.length) {
      el.videoEpisodesWrap.classList.add('hidden');
      el.videoEpisodesEmpty.classList.remove('hidden');
      el.videoEpisodesEmpty.textContent = 'No videos found in this show.';
      updateEpisodePreview(null);
      return;
    }

    // Build a folder set including ancestors, plus a latest-modified map for folder sorting.
    const allFolders = new Set(['']);
    const folderLatest = new Map();
    for (const ep of epsAll) {
      const rel = normRel(ep?.folderRelPath || '');
      const ms = Number(ep?.mtimeMs || 0);
      // include self + ancestors
      const parts = rel.split('/').filter(Boolean);
      let cur = '';
      for (let i = 0; i < parts.length; i++) {
        cur = cur ? (cur + '/' + parts[i]) : parts[i];
        allFolders.add(cur);
      }
      // update latest mtime for root and ancestors
      const up = [''];
      if (parts.length) {
        let acc = '';
        for (const p of parts) {
          acc = acc ? (acc + '/' + p) : p;
          up.push(acc);
        }
      }
      for (const f of up) {
        const prev = Number(folderLatest.get(f) || 0);
        if (ms > prev) folderLatest.set(f, ms);
      }
    }

    let curFolder = normRel(state.epFolderRel || '');
    if (curFolder && !allFolders.has(curFolder)) {
      curFolder = '';
      state.epFolderRel = '';
      persistVideoUiState();
    }

    // Breadcrumb (BUILD100v3): Keep it minimal like Comics.
    // - Display: pretty show name + current folder basename (not full rel path)
    // - Tooltip: full raw path for power-users
    if (el.videoCrumb) el.videoCrumb.classList.remove('hidden');
    if (el.videoCrumbText) {
      const displayShow = prettyShowName(show);
      const displayFolder = curFolder ? baseNameRel(curFolder) : '';
      el.videoCrumbText.textContent = displayFolder ? `${displayShow} / ${displayFolder}` : displayShow;
      el.videoCrumbText.title = curFolder ? `${show.name || displayShow} / ${curFolder}` : (show.name || displayShow);
    }

    const q = '';

    // Build 11: Folder-level "Continue watching" panel.
    // Show the most recently watched (in-progress) episode within the current folder subtree.
    const _normRel = normRel; // alias for clarity
    const curPrefix = curFolder ? (curFolder + '/') : '';
    const inFolderTree = (ep) => {
      const rel = _normRel(ep?.folderRelPath || '');
      if (!curFolder) return true;
      return rel === curFolder || rel.startsWith(curPrefix);
    };
    const pickFolderContinue = () => {
      let best = null;
      let bestAt = -1;
      for (const ep of epsAll) {
        if (!inFolderTree(ep)) continue;
        const p = state.progress?.[ep.id];
        if (!p || p.finished) continue;
        const pos = Number(p.positionSec);
        if (!Number.isFinite(pos) || pos < 10) continue;
        const at = Number(p.updatedAt || 0);
        if (at > bestAt) { bestAt = at; best = ep; }
      }
      return best;
    };
    const placeFolderContinueCard = () => {
      if (!el.videoFolderContinue || el.videoFolderContinue.classList.contains('hidden')) return;
      const card = el.videoFolderContinue;
      const pane = document.getElementById('videoEpPreviewPane') || card.parentElement;
      const poster = el.videoEpPreviewImg;
      if (!pane) return;

      card.classList.remove('isLeft', 'isRight');
      let side = 'right';

      try {
        const paneRect = pane.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const cardW = (cardRect && cardRect.width > 1) ? cardRect.width : Math.min(360, paneRect.width * 0.4);
        const pad = 16;

        if (poster && poster.offsetWidth > 4 && poster.offsetHeight > 4) {
          const posterRect = poster.getBoundingClientRect();
          const leftGap = Math.max(0, posterRect.left - paneRect.left - pad);
          const rightGap = Math.max(0, paneRect.right - posterRect.right - pad);
          const leftFits = leftGap >= cardW;
          const rightFits = rightGap >= cardW;

          if (leftFits && !rightFits) side = 'left';
          else if (rightFits && !leftFits) side = 'right';
          else side = (rightGap >= leftGap) ? 'right' : 'left';
        }
      } catch {}

      card.classList.add(side === 'left' ? 'isLeft' : 'isRight');
    };
    try {
      if (el.videoEpPreviewImg && !el.videoEpPreviewImg.dataset.continuePlaceBound) {
        el.videoEpPreviewImg.addEventListener('load', () => {
          try { placeFolderContinueCard(); } catch {}
        });
        el.videoEpPreviewImg.dataset.continuePlaceBound = '1';
      }
    } catch {}
    if (!state._videoFolderContinueResizeBound) {
      state._videoFolderContinueResizeBound = true;
      window.addEventListener('resize', () => {
        try { placeFolderContinueCard(); } catch {}
      });
    }
    const renderFolderContinue = () => {
      if (!el.videoFolderContinue) return;
      const ep = pickFolderContinue();
      if (!ep) {
        el.videoFolderContinue.classList.add('hidden');
        el.videoFolderContinue.classList.remove('isLeft', 'isRight');
        el.videoFolderContinue.innerHTML = '';
        return;
      }

      const p = state.progress?.[ep.id] || null;
      const pct = pctForVideoId(ep.id);
      const pctTxt = (pct !== null) ? (pct >= 100 ? '100%' : (pct + '%')) : '';
      const file = basename(ep.path || '');
      const title = String(ep.title || file || 'Episode');

      el.videoFolderContinue.classList.remove('hidden');
      el.videoFolderContinue.innerHTML = '';

      const titleRow = document.createElement('div');
      titleRow.className = 'videoFolderContinueRow';
      const left = document.createElement('div');
      left.className = 'videoFolderContinueMeta';
      const h = document.createElement('div');
      h.className = 'videoFolderContinueTitle';
      h.textContent = 'Continue watching';
      const epMain = document.createElement('div');
      epMain.className = 'videoFolderContinueEp';
      epMain.textContent = title;

      // Only show filename when it adds info (avoid repeats).
      const _norm = (s) => String(s || '').toLowerCase().replace(/\s+/g,' ').trim();
      const _stem = file ? file.replace(/\.[^/.]+$/, '') : '';
      const showFile = !!(file && _norm(file) && _norm(file) !== _norm(title) && _norm(_stem) !== _norm(title));
      const epFile = document.createElement('div');
      epFile.className = 'videoFolderContinueFile';
      epFile.textContent = file;
      epFile.style.display = showFile ? '' : 'none';

      left.appendChild(h);
      left.appendChild(epMain);
      left.appendChild(epFile);

      const btn = document.createElement('button');
      btn.className = 'btn btn-sm';
      btn.textContent = 'Play';
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { selectEpisode(ep.id); } catch {}
        safe(() => playViaShell(ep));
      };
      titleRow.appendChild(left);
      titleRow.appendChild(btn);

      const bar = document.createElement('div');
      bar.className = 'videoFolderContinueBar';
      const fill = document.createElement('div');
      fill.style.width = (pct !== null) ? Math.max(0, Math.min(100, pct)) + '%' : '0%';
      bar.appendChild(fill);

      const hint = document.createElement('div');
      hint.className = 'videoFolderContinueHint';
      const posTxt = (p && Number.isFinite(Number(p.positionSec))) ? fmtTime(Number(p.positionSec)) : '';
      const durTxt = bestDurationSec(ep) ? fmtTime(bestDurationSec(ep)) : '';
      const t = (posTxt && durTxt) ? `${posTxt} / ${durTxt}` : (pctTxt ? pctTxt : '');
      hint.textContent = t;

      el.videoFolderContinue.appendChild(titleRow);
      el.videoFolderContinue.appendChild(bar);
      el.videoFolderContinue.appendChild(hint);
      requestAnimationFrame(() => {
        placeFolderContinueCard();
        setTimeout(placeFolderContinueCard, 80);
      });
    };
    renderFolderContinue();

    // Direct children folders
    let folders = Array.from(allFolders.values()).filter(f => f && parentRel(f) === curFolder);
    folders = folders.map(f => ({ relPath: f, name: baseNameRel(f), mtimeMs: Number(folderLatest.get(f) || 0) }));

    // Direct files (episodes in the current folder)
    let files = epsAll.filter(ep => normRel(ep?.folderRelPath || '') === curFolder);

    // Search filter (folders + files)
    if (q) {
      folders = folders.filter(f => String(f.name || '').toLowerCase().includes(q));

      // Item 6: numeric-aware episode search (digit matching like the Comics volume matcher).
      const qNums = (q.match(/\d+/g) || [])
        .map(n => parseInt(n, 10))
        .filter(n => Number.isFinite(n));

      const matchesEpisodeQuery = (ep) => {
        const t = String(ep?.title || '').toLowerCase();
        const f = basename(ep?.path || '').toLowerCase();

        // Fast path: plain substring
        if ((t && t.includes(q)) || (f && f.includes(q))) return true;

        // Digit-aware path: treat numeric tokens as episode identifiers.
        if (qNums.length) {
          const both = (t ? (t + ' ') : '') + (f || '');

          for (const nn of qNums) {
            if (both.includes(String(nn))) return true;
          }

          // Fallback: match the first number found in the title/filename.
          const m = both.match(/\d+/);
          if (m) {
            const n = parseInt(m[0], 10);
            if (Number.isFinite(n) && qNums.includes(n)) return true;
          }

          // Multi-number queries: allow "S01E02" / "1 2" style matching.
          if (qNums.length >= 2) {
            const candNums = (both.match(/\d+/g) || [])
              .map(n => parseInt(n, 10))
              .filter(n => Number.isFinite(n));
            if (candNums.length >= 2) {
              let ok = true;
              for (const nn of qNums) {
                if (!candNums.includes(nn)) { ok = false; break; }
              }
              if (ok) return true;
            }
          }
        }

        return false;
      };

      files = files.filter(matchesEpisodeQuery);
    }

    // Sort
    const sortMode = String(state.epSort || 'title_asc');
    if (sortMode === 'modified_desc' || sortMode === 'modified_asc') {
      const dir = (sortMode === 'modified_asc') ? 1 : -1;
      folders.sort((a, b) => (Number(a.mtimeMs || 0) - Number(b.mtimeMs || 0)) * dir || naturalCmp(a.name, b.name));
      files.sort((a, b) => (Number(a?.mtimeMs || 0) - Number(b?.mtimeMs || 0)) * dir
        || naturalCmp(basename(a?.path || ''), basename(b?.path || '')));
    } else {
      folders.sort((a, b) => naturalCmp(a.name, b.name));
      files.sort((a, b) => naturalCmp(basename(a?.path || ''), basename(b?.path || '')));
    }

    // Empty view message
    if (!folders.length && !files.length) {
      el.videoEpisodesWrap.classList.add('hidden');
      el.videoEpisodesEmpty.classList.remove('hidden');
      el.videoEpisodesEmpty.textContent = q ? 'No matching items.' : 'This folder is empty.';
      updateEpisodePreview(null);
      return;
    }

    el.videoEpisodesEmpty.classList.add('hidden');
    el.videoEpisodesWrap.classList.remove('hidden');
    el.videoEpisodesGrid.innerHTML = '';

    let stripe = 0;

    // Up row
    if (curFolder) {
      const up = parentRel(curFolder);
      el.videoEpisodesGrid.appendChild(makeFolderRow({ name: '..', relPath: up, isUp: true, mtimeMs: Number(folderLatest.get(curFolder) || 0) }, stripe));
      stripe++;
    }

    // Folder rows first
    for (const f of folders) {
      el.videoEpisodesGrid.appendChild(makeFolderRow(f, stripe));
      stripe++;
    }

    // File rows
    // BUILD 88 FIX 2.2: Chunk rendering for better perceived performance
    const CHUNK_SIZE = 50;
    let fileNum = 1;
    
    if (files.length <= CHUNK_SIZE) {
      // Small list: render all immediately
      for (const ep of files) {
        el.videoEpisodesGrid.appendChild(makeEpisodeRowExplorer(ep, stripe, fileNum));
        stripe++;
        fileNum++;
      }
    } else {
      // Large list: render first chunk immediately, rest progressively
      const firstChunk = files.slice(0, CHUNK_SIZE);
      for (const ep of firstChunk) {
        el.videoEpisodesGrid.appendChild(makeEpisodeRowExplorer(ep, stripe, fileNum));
        stripe++;
        fileNum++;
      }
      
      // Add loading placeholder
      const placeholder = document.createElement('div');
      placeholder.className = 'videoEpisodePlaceholder';
      placeholder.textContent = `Loading ${files.length - CHUNK_SIZE} more episodes...`;
      placeholder.style.cssText = 'padding: 20px; text-align: center; opacity: 0.6; font-style: italic;';
      el.videoEpisodesGrid.appendChild(placeholder);
      
      // Render remaining chunks progressively
      let currentIndex = CHUNK_SIZE;
      const renderNextChunk = () => {
        if (currentIndex >= files.length) {
          // Done - remove placeholder
          if (placeholder.parentNode) placeholder.remove();
          return;
        }
        
        const endIndex = Math.min(currentIndex + CHUNK_SIZE, files.length);
        const chunk = files.slice(currentIndex, endIndex);
        
        // Remove placeholder temporarily
        if (placeholder.parentNode) placeholder.remove();
        
        // Render chunk
        for (const ep of chunk) {
          el.videoEpisodesGrid.appendChild(makeEpisodeRowExplorer(ep, stripe, fileNum));
          stripe++;
          fileNum++;
        }
        
        // Update/re-add placeholder if more to come
        currentIndex = endIndex;
        if (currentIndex < files.length) {
          placeholder.textContent = `Loading ${files.length - currentIndex} more episodes...`;
          el.videoEpisodesGrid.appendChild(placeholder);
          
          // Schedule next chunk
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(renderNextChunk, { timeout: 100 });
          } else {
            setTimeout(renderNextChunk, 0);
          }
        }
      };
      
      // Start progressive rendering
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(renderNextChunk, { timeout: 100 });
      } else {
        setTimeout(renderNextChunk, 0);
      }
    }

    // Selection: keep if visible; otherwise pick most recent in-progress in this folder, else first.
    const visibleIds = new Set(files.map(e => String(e.id)));
    if (!state.selectedEpisodeId || !visibleIds.has(String(state.selectedEpisodeId))) {
      let best = null;
      let bestAt = -1;
      for (const ep of files) {
        const p = state.progress?.[ep.id];
        if (!p || p.finished) continue;
        const pos = Number(p.positionSec);
        if (!Number.isFinite(pos) || pos < 10) continue;
        const at = Number(p.updatedAt || 0);
        if (at > bestAt) { bestAt = at; best = ep; }
      }
      state.selectedEpisodeId = (best ? best.id : (files[0] ? files[0].id : null));
    }

    if (state.selectedEpisodeId) selectEpisode(state.selectedEpisodeId);
    else updateEpisodePreview(null);

    // BUILD100v7: Fill in missing duration/resolution values without blocking UI.
    // Keep scope to the current (filtered) folder view for performance.
    scheduleEpisodeMetaHydration(files.slice(0, 120));
  }

  function toFileUrl(fp) {
    const raw = String(fp || '');
    if (!raw) return '';

    let p = raw.replace(/\\/g, '/');
    if (/^[A-Za-z]:\//.test(p)) return 'file:///' + encodeURI(p);
    if (!p.startsWith('/')) p = '/' + p;
    return 'file://' + encodeURI(p);
  }

  function ensurePlayer(){
    // Track panel should never survive engine swaps.
    closeTracksPanel();

    // Build 52: Canvas-only libmpv. Embedded/native child-window and mpv.exe paths are disabled.
    const canLibMpv = !!(state.libmpvAvailable
      && window.videoPlayerAdapters?.createLibMpvCanvasVideoAdapter
      && Tanko.api?.libmpv);

    const setEngineUi = (isMpv, isCanvas) => {
      const mpvOn = !!isMpv;
      const canvasOn = !!isCanvas;
      document.body.classList.toggle('mpvEngine', mpvOn);
      document.body.classList.toggle('libmpvEmbedded', mpvOn);
      document.body.classList.toggle('libmpvCanvas', mpvOn && canvasOn);

      if (!mpvOn) {
        // (kept for completeness; build is mpv-only anyway)
        document.body.classList.remove('mpvDetached');
        el.videoEl?.classList.remove('hidden');
        el.mpvHost?.classList.add('hidden');
        el.mpvDetachedPlaceholder?.classList.add('hidden');
        return;
      }

      // mpv is active (canvas):
      el.videoEl?.classList.add('hidden');
      el.mpvDetachedPlaceholder?.classList.add('hidden');
      document.body.classList.remove('mpvDetached');
      el.mpvHost?.classList.remove('hidden');
    };

    if (!canLibMpv) {
      setEngineUi(false, false);
      toast(state.libmpvAvailError ? `libmpv not available: ${state.libmpvAvailError}` : 'libmpv not available');
      return null;
    }

    const requestedRenderMode = 'canvas';

    // Reuse an existing player if it's already libmpv+canvas.
    if (state.player && state.player.kind === 'mpv') {
      const wm = String(state.player.windowMode || '');
      const lastRenderMode = String(state._activeRenderMode || '');
      if (wm === 'embedded-libmpv' && lastRenderMode === requestedRenderMode) {
        state.mpvWindowMode = wm;
        state.mpvDetached = false;
        state._activeRenderMode = requestedRenderMode;
        setEngineUi(true, true);
        try { bindPlayerUi(); } catch {}
        return state.player;
      }
    }

    // Swap engines (best-effort cleanup)
    try { state.player?.destroy?.(); } catch {}
    state.player = null;
    state._playerEventsBoundFor = null;

    try {
      state.player = window.videoPlayerAdapters.createLibMpvCanvasVideoAdapter({ hostEl: el.mpvHost || null, renderQuality: state.settings.renderQuality, videoSyncDisplayResample: !!state.settings.videoSyncDisplayResample });
      try { applyRenderQuality(state.settings.renderQuality, { persist: false, announce: false }); } catch {}
      try { state.player?.setRespectSubtitleStyles?.(!!state.settings.respectSubtitleStyles); } catch {}
    } catch (e) {
      setEngineUi(false, false);
      toast(`Canvas player failed to start${e && e.message ? ': ' + e.message : ''}`);
      return null;
    }

    state._activeRenderMode = requestedRenderMode;

    // Normalize window mode flags for UI.
    try {
      state.mpvWindowMode = String(state.player?.windowMode || '');
      state.mpvDetached = false;
    } catch {}

    setEngineUi(true, true);
    try { bindPlayerUi(); } catch {}
    return state.player;
  }

  function updateHudFromPlayer(){
    if (!state.player) return;
    const st = state.player.getState();
    vpWatchTickFromPlayerState(st);

    // play label
    if (el.videoPlayBtn) el.videoPlayBtn.textContent = st.paused ? '⏵' : '⏸';

    // time labels - ALWAYS show current/total format for clarity
    if (el.videoTimeNow) {
      const currentTime = state.seekDragging && typeof state.seekPreviewSec === 'number' 
        ? state.seekPreviewSec
        : (state._nudgeSeekPreviewing && typeof state._nudgeSeekPreviewSec === 'number')
        ? state._nudgeSeekPreviewSec
        : st.timeSec;
      
      const durationTime = st.durationSec || 0;
      // YouTube-style: "current / total" always visible
      el.videoTimeNow.textContent = `${fmtTime(currentTime)} / ${fmtTime(durationTime)}`;
    }
    // Remove redundant duration label if we're showing it in the combined format
    if (el.videoTimeDur) el.videoTimeDur.style.display = 'none';

    // timeline scrub (reader-style)
    if (el.videoScrub && !state.seekDragging && !state._nudgeSeekPreviewing) {
      setVideoScrubUI(st.timeSec, st.durationSec);
    }

    // volume
    if (el.videoVol && !document.activeElement?.isSameNode(el.videoVol)) {
      const v = clamp(st.volume, 0, 1);
      el.videoVol.value = String(Math.round(v * 100));
    }
    if (el.videoMuteBtn) el.videoMuteBtn.textContent = st.muted ? '🔇' : '🔊';

    // speed
    setSpeedLabels(st.speed);

    // Quick tools panels (Build 24 prompt 4)
    if (volPanelOpen && el.videoVolPct) {
      const v = clamp(Number(st.volume), 0, 1);
      el.videoVolPct.textContent = `${Math.round(v * 100)}%`;
      if (el.videoVolMuteToggleBtn) el.videoVolMuteToggleBtn.textContent = st.muted ? 'Unmute' : 'Mute';
    }

    if (el.videoSpeedPanelValue) {
      const sp = Number.isFinite(st.speed) ? st.speed : Number(state.settings.speed || 1);
      const label = Number(sp).toFixed(2).replace(/\.00$/,'.0').replace(/\.(\d)0$/,'.$1');
      el.videoSpeedPanelValue.textContent = `${label}×`;
    }
  }

  function applySettingsToPlayer(){
    if (!state.player) return;
    state.player.setVolume(state.settings.volume);
    state.player.setMuted(state.settings.muted);
    state.player.setSpeed(state.settings.speed);
    syncHudFromSettings();
  }


async function playViaShell(v, extra) {
  if (!v || !v.path) return;
  return openVideo(v, extra && typeof extra === 'object' ? extra : {});
}

let playlistPanelOpen = false;

function openPlaylistPanel() {
  closeTracksPanel();
  closeVolPanel();  playlistPanelOpen = true;
  try { el.videoPlaylistPanel?.classList.remove('hidden'); } catch {}
  try { renderPlaylistList(); syncPlaylistNavButtons(); } catch {}
  showHud();
}

function closePlaylistPanel() {
  playlistPanelOpen = false;
  try { el.videoPlaylistPanel?.classList.add('hidden'); } catch {}
}

function togglePlaylistPanel() {
  const hidden = !!el.videoPlaylistPanel?.classList.contains('hidden');
  if (hidden) openPlaylistPanel(); else closePlaylistPanel();
}

// ── Tips overlay (video library) ─────────────────────────────
let videoLibTipsOpen = false;

function toggleVideoLibTipsOverlay(force) {
  if (!el.videoLibTipsOverlay) return;
  const next = typeof force === 'boolean' ? force : !videoLibTipsOpen;
  videoLibTipsOpen = next;
  el.videoLibTipsOverlay.classList.toggle('hidden', !next);
}

// Bind close button + backdrop click for video library tips overlay
el.videoLibTipsClose?.addEventListener('click', () => toggleVideoLibTipsOverlay(false));
el.videoLibTipsOverlay?.addEventListener('click', (e) => { if (e.target === el.videoLibTipsOverlay) toggleVideoLibTipsOverlay(false); });

function epKey(ep) {
  if (!ep) return '';
  if (ep.id != null) return String(ep.id);
  if (ep.path) return String(ep.path);
  return '';
}

function folderLabelFromEpisode(ep) {
  const showId = ep && ep.showId != null ? String(ep.showId) : null;
  const show = showId ? getShowById(showId) : null;
  if (show && show.name) return String(show.name);
  if (show && show.path) return basename(show.path);

  const p = String((ep && ep.path) || '').replace(/\\/g, '/');
  const parts = p.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? parts[parts.length - 1] : '';
}

// Build 67: Playlist filtered to current season folder only
function rebuildPlaylistForEpisode(ep) {
  const showId = ep && ep.showId != null ? String(ep.showId) : null;
  let episodes = showId ? canonicalEpisodesForShow(showId) : (ep ? [ep] : []);
  
  // Filter to current season folder if episode has a folder path
  if (ep && ep.folderRelPath) {
    const currentSeasonFolder = String(ep.folderRelPath).replace(/\\/g, '/');
    episodes = episodes.filter(e => {
      const epFolder = String(e.folderRelPath || '').replace(/\\/g, '/');
      return epFolder === currentSeasonFolder;
    });
  }
  
  state.playlist.showId = showId;
  state.playlist.episodes = episodes;
  state.playlist.currentKey = epKey(ep);

  if (el.videoPlaylistFolder) {
    // Show season folder name in playlist header
    const seasonName = ep && ep.folderRelPath 
      ? basename(ep.folderRelPath) 
      : folderLabelFromEpisode(ep);
    el.videoPlaylistFolder.textContent = seasonName;
  }

  renderPlaylistList();
  syncPlaylistNavButtons();
}

// Helper: Extract folder/file name from path
function basename(path) {
  if (!path) return '';
  const normalized = String(path).replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function renderPlaylistList() {
  if (!el.videoPlaylistList) return;

  const cur = state.playlist.currentKey;
  el.videoPlaylistList.innerHTML = '';

  for (const ep of (state.playlist.episodes || [])) {
    const key = epKey(ep);
    const row = document.createElement('div');
    row.className = 'videoPlaylistItem' + (key && key === cur ? ' isCurrent' : '');
    row.setAttribute('role', 'option');
    row.setAttribute('tabindex', '0');

    const name = document.createElement('div');
    name.className = 'epName';
    name.textContent = basename(ep && ep.path) || (ep && ep.title) || key || 'Episode';

    const meta = document.createElement('div');
    meta.className = 'epMeta mono';
    meta.textContent = '';

    row.appendChild(name);
    row.appendChild(meta);

    row.onclick = () => safe(() => openEpisodeFromPlaylist(ep));
    row.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); safe(() => openEpisodeFromPlaylist(ep)); }
    };

    el.videoPlaylistList.appendChild(row);
  }

  try {
    const curEl = el.videoPlaylistList.querySelector('.videoPlaylistItem.isCurrent');
    curEl?.scrollIntoView({ block: 'nearest' });
  } catch {}
}

function openEpisodeFromPlaylist(ep) {
  if (!ep) return;
  closePlaylistPanel();
  if (typeof playViaShell === 'function') return playViaShell(ep);
  return openVideo(ep);
}

function getPlaylistIndexByKey(key) {
  const eps = state.playlist.episodes || [];
  const k = String(key || '');
  return eps.findIndex(e => epKey(e) === k);
}

function getPrevNextEpisodes() {
  const eps = state.playlist.episodes || [];
  const i = getPlaylistIndexByKey(state.playlist.currentKey);
  return {
    prev: (i > 0) ? eps[i - 1] : null,
    next: (i >= 0 && i < eps.length - 1) ? eps[i + 1] : null,
  };
}

function syncPlaylistNavButtons() {
  const { prev, next } = getPrevNextEpisodes();
  if (el.videoPrevEpBtn) el.videoPrevEpBtn.disabled = !prev;
  if (el.videoNextEpBtn) el.videoNextEpBtn.disabled = !next;
  if (el.videoPrevHudBtn) el.videoPrevHudBtn.disabled = !prev;
  if (el.videoNextHudBtn) el.videoNextHudBtn.disabled = !next;
}

function maybeAutoAdvanceOnFinish() {
  if (!state.settings.autoAdvance) return;
  if (state._manualStop) return;

  const curKey = state.playlist.currentKey;
  if (curKey && state._autoAdvanceTriggeredForKey === curKey) return;
  state._autoAdvanceTriggeredForKey = curKey || state._autoAdvanceTriggeredForKey;

  const { next } = getPrevNextEpisodes();
  if (!next) return;

  // BUILD63: Show countdown notice with cancel option
  const countdownSec = 5;
  let remaining = countdownSec;
  
  // Clear any existing countdown
  if (state._autoAdvanceCountdownTimer) {
    clearInterval(state._autoAdvanceCountdownTimer);
    state._autoAdvanceCountdownTimer = null;
  }
  if (state._autoAdvancePlayTimer) {
    clearTimeout(state._autoAdvancePlayTimer);
    state._autoAdvancePlayTimer = null;
  }
  
  const updateCountdown = () => {
    if (remaining > 0) {
      hudNotice(`Next episode in ${remaining}s (Space to cancel)`, 3500);
      remaining--;
    }
  };
  
  // Show initial countdown
  updateCountdown();
  showHud();
  
  // Update countdown every second
  state._autoAdvanceCountdownTimer = setInterval(() => {
    updateCountdown();
    showHud();
  }, 1000);
  
  // Trigger advance after countdown
  state._autoAdvancePlayTimer = setTimeout(() => {
    if (state._autoAdvanceCountdownTimer) {
      clearInterval(state._autoAdvanceCountdownTimer);
      state._autoAdvanceCountdownTimer = null;
    }
    state._autoAdvancePlayTimer = null;
    safe(() => openEpisodeFromPlaylist(next));
  }, countdownSec * 1000);
}



function tryStartPendingShellPlay() {
  if (!IS_VIDEO_SHELL) return;
  const p = state._pendingShellPlay;
  if (!p) return;

  // Transfer overrides
  if (p && typeof p === 'object') {
    if (p.suppressResumePromptOnce) state._suppressResumePromptOnce = true;
    if (Number.isFinite(Number(p.resumeOverridePosSec))) state._resumeOverridePosSec = Number(p.resumeOverridePosSec);
  }

  let v = null;
  if (p.video && typeof p.video === 'object') v = p.video;
  else if (p.videoId) v = getEpisodeById(String(p.videoId));

  if (!v || !v.path) return; // state may not be loaded yet
  state._pendingShellPlay = null;
  safe(() => openVideo(v, p));
}

async function openVideo(v, opts = {}) {
  // QT_ONLY: Videos always open in the external Python/Qt player.
  // The Electron window may hide during playback and will be restored by the main process.

  // Apply one-shot overrides if provided (e.g., Play from beginning / Continue Watching).
  try {
    if (opts && typeof opts === 'object') {
      if (opts.suppressResumePromptOnce) state._suppressResumePromptOnce = true;
      if (Number.isFinite(Number(opts.resumeOverridePosSec))) state._resumeOverridePosSec = Number(opts.resumeOverridePosSec);
    }
  } catch {}

  if (!v || !v.path) return;

  const api = (window && window.Tanko && window.Tanko.api) ? window.Tanko.api : null;
  if (!api || !api.player || typeof api.player.launchQt !== 'function') {
    try { toast('Qt player launcher not available (Tanko.api.player.launchQt missing).', 2400); } catch {}
    return;
  }

  // If play is requested from outside Videos mode, switch first (best-effort).
  try {
    if (!IS_VIDEO_SHELL && state.mode !== 'videos') setMode('videos');
  } catch {}

  // BUILD14: Capture state before hiding window (best-effort).
  try {
    const stateModule = window.Build14State;
    if (stateModule && typeof stateModule.captureState === 'function') {
      const capturedState = stateModule.captureState(state);
      if (api.build14 && typeof api.build14.saveReturnState === 'function') {
        await api.build14.saveReturnState(capturedState);
      }
    }
  } catch (e) {
    try { console.error('[BUILD14] Failed to capture/save state:', e); } catch {}
  }

  const sessionId = String(Date.now());

  // Start time: explicit override > library progress (best-effort).
  let start = 0;
  try {
    const override = (opts && Number.isFinite(Number(opts.resumeOverridePosSec))) ? Number(opts.resumeOverridePosSec) : 0;
    if (override > 0) start = override;
    else {
      const gp = getProgressForEpisode(v);
      const p = (gp && gp.progress && typeof gp.progress === 'object') ? gp.progress : null;
      if (p && !isProgressFinished(p)) {
        const pos = Number(p.positionSec);
        const maxPos = Number(p.maxPositionSec);
        const cand = (Number.isFinite(pos) && pos > 2) ? pos : ((Number.isFinite(maxPos) && maxPos > 2) ? maxPos : 0);
        start = Number.isFinite(cand) ? cand : 0;
      }
    }
  } catch {}

  // Build a show-local playlist in library order (best-effort).
  let playlistPaths = null;
  let playlistIds = null;
  let playlistIndex = -1;
  try {
    const sid = String((v && v.showId) || '');
    const vPath = String((v && v.path) || '');
    const norm = (s) => String(s || '').replace(/\\/g, '/');
    const seasonFolder = vPath ? norm(vPath).replace(/\/[^\/]*$/, '') : '';

    if (sid && seasonFolder && state.episodesByShowId && typeof state.episodesByShowId.get === 'function') {
      const eps = state.episodesByShowId.get(sid) || [];
      if (Array.isArray(eps) && eps.length) {
        const maxItems = 800; // safety: avoid huge IPC payloads
        const paths = [];
        const ids = [];
        for (let i = 0; i < eps.length && paths.length < maxItems; i++) {
          const ep = eps[i];
          if (!ep || !ep.path) continue;
          const epPath = String(ep.path);
          const epFolder = norm(epPath).replace(/\/[^\/]*$/, '');
          if (epFolder !== seasonFolder) continue;
          paths.push(epPath);
          ids.push(String(ep.id || ''));
        }
        playlistPaths = paths;
        playlistIds = ids;

        const vid = String((v && v.id) || '');
        playlistIndex = vid ? ids.indexOf(vid) : -1;
        if (playlistIndex < 0 && vPath) {
          const vp = norm(vPath);
          for (let j = 0; j < paths.length; j++) {
            if (norm(paths[j]) === vp) { playlistIndex = j; break; }
          }
        }
      }
    }
  } catch {}

  const launchArgs = {
    filePath: String(v.path),
    startSeconds: start,
    sessionId,
    videoId: String((v && v.id) || ''),
    showId: String((v && v.showId) || ''),
  };

  if (Array.isArray(playlistPaths) && playlistPaths.length) {
    launchArgs.playlistPaths = playlistPaths;
    launchArgs.playlistIds = Array.isArray(playlistIds) ? playlistIds : [];
    launchArgs.playlistIndex = Number.isFinite(Number(playlistIndex)) ? Number(playlistIndex) : -1;
  }

  try { toast('Opening in Qt player…', 1200); } catch {}

  let r = null;
  try {
    r = await api.player.launchQt(launchArgs);
  } catch (e) {
    try { toast('Failed to launch Qt player: ' + String(e && e.message ? e.message : e), 3200); } catch {}
    return;
  }

  // BUILD14: Hide window after successful launch (best-effort).
  const keepLibraryVisible = !!(r && r.keepLibraryVisible);
  if (r && r.ok === true && !keepLibraryVisible) {
    try {
      if (api.window && typeof api.window.hide === 'function') {
        await api.window.hide();
      }
    } catch (e) {
      try { console.error('[BUILD14] Failed to hide window:', e); } catch {}
    }
  }

  if (r && r.ok === false) {
    const lp = (r && r.logPath) ? String(r.logPath) : '';
    const extra = lp ? (' (see ' + lp + ')') : '';
    try { toast('Qt player failed: ' + String(r.error || 'unknown error') + extra, 6200); } catch {}
  }
}

  function showVideoLibrary() {
    state._manualStop = true;
    try { closeAllToolPanels(); } catch {}
    closePlaylistPanel();
    document.body.classList.remove('inVideoPlayer');
    document.body.classList.remove('videoFullscreen');
    document.body.classList.remove('videoUiHidden');
    try { const p = saveNow(true); if (p && typeof p.then === 'function') p.catch(() => {}); } catch {}

    stopProgressPoll();
    hideResumePrompt();
    closeTracksPanel();

    if (el.videoPlayerView) el.videoPlayerView.classList.add('hidden');
    if (el.videoLibraryView) el.videoLibraryView.classList.remove('hidden');

    safe(() => state.player?.pause());
    safe(() => state.player?.unload());

    // Prevent orphan mpv surface windows when leaving the player view.
    if (state.player?.kind === 'mpv') {
      safe(() => state.player?.destroy?.());
      state.player = null;
      state._playerEventsBoundFor = null;
      document.body.classList.remove('mpvEngine');
        document.body.classList.remove('mpvDetached');
    }

    state.now = null;
    // Video library disabled.
  }

  

// Build 19: progress polling is required even if mpv's time events get sparse.
function stopProgressPoll(){
  try {
    if (state._progressPollTimer) clearInterval(state._progressPollTimer);
  } catch {}
  state._progressPollTimer = null;
  
  // BUILD63: Clean up auto-advance timers
  try {
    if (state._autoAdvanceCountdownTimer) clearInterval(state._autoAdvanceCountdownTimer);
    if (state._autoAdvancePlayTimer) clearTimeout(state._autoAdvancePlayTimer);
  } catch {}
  state._autoAdvanceCountdownTimer = null;
  state._autoAdvancePlayTimer = null;
}


// Build 104e: track approximate watch-time so scrubbing near the end doesn't mark "finished".
function vpGetExistingProgressForId(id) {
  let existing = null;
  try {
    if (state.progress && typeof state.progress === 'object' && id && state.progress[id]) {
      existing = state.progress[id];
    } else if (state._vpLoadedProgressForId === id && state._vpLoadedProgress) {
      existing = state._vpLoadedProgress;
    }
  } catch {}
  return existing;
}

function vpEnsureWatchStatsForId(id) {
  state._vpWatchStats = (state._vpWatchStats && typeof state._vpWatchStats === 'object') ? state._vpWatchStats : {};
  let ws = state._vpWatchStats[id];
  if (ws && typeof ws === 'object') return ws;

  const existing = vpGetExistingProgressForId(id) || {};
  const w0 = Number(existing.watchedSecApprox);
  const m0 = Number(existing.maxPositionSec);

  ws = {
    watchedSecApprox: (Number.isFinite(w0) && w0 >= 0) ? w0 : 0,
    maxPositionSec: (Number.isFinite(m0) && m0 >= 0) ? m0 : 0,
    lastWallMs: 0,
    lastPosSec: NaN,
  };

  state._vpWatchStats[id] = ws;
  return ws;
}

function vpWatchTickFromPlayerState(st) {
  try {
    const id = state.now && state.now.id;
    if (!id || !st) return;

    const pos = Number(st.timeSec);
    if (!Number.isFinite(pos)) return;

    const nowMs = Date.now();
    const ws = vpEnsureWatchStatsForId(id);

    // Always track max position (even when paused/seeking) for UI heuristics.
    ws.maxPositionSec = Number.isFinite(Number(ws.maxPositionSec)) ? Math.max(Number(ws.maxPositionSec), pos) : pos;

    const paused = !!st.paused;
    const seeking = !!state.seekDragging || !!state._nudgeSeekPreviewing;

    if (paused || seeking) {
      ws.lastWallMs = nowMs;
      ws.lastPosSec = pos;
      return;
    }

    if (!Number.isFinite(ws.lastPosSec) || !ws.lastWallMs) {
      ws.lastWallMs = nowMs;
      ws.lastPosSec = pos;
      return;
    }

    const dt = (nowMs - ws.lastWallMs) / 1000;
    const dpos = pos - ws.lastPosSec;

    ws.lastWallMs = nowMs;
    ws.lastPosSec = pos;

    if (!Number.isFinite(dt) || dt <= 0) return;
    if (!Number.isFinite(dpos) || dpos <= 0) return;

    const sp = Number(st.speed);
    const speed = (Number.isFinite(sp) && sp > 0) ? sp : 1;
    const maxCount = Math.max(3, (dt * speed * 1.75) + 1); // tolerate faster playback

    // Large jumps are almost certainly seeks/scrubs — don't count as watched time.
    if (dpos > maxCount) return;

    ws.watchedSecApprox = Number.isFinite(Number(ws.watchedSecApprox)) ? Number(ws.watchedSecApprox) : 0;
    ws.watchedSecApprox += dpos;
  } catch {}
}

function vpShouldMarkFinishedNow(pos, dur, watchedSecApprox, maxPositionSec, ended, existingFinished) {
  if (existingFinished) return true;
  if (ended) return true;
  if (!Number.isFinite(dur) || dur <= 0) return false;

  const p = Number(pos);
  const m = Number(maxPositionSec);
  const w = Number(watchedSecApprox);

  const nearEnd = (Number.isFinite(p) && (p / dur) >= 0.98) || (Number.isFinite(m) && (m / dur) >= 0.98);
  if (!nearEnd) return false;
  if (!Number.isFinite(w) || w < 0) return false;

  return (w / dur) >= 0.80;
}

function startProgressPoll(){
  if (state._progressPollTimer) return;
  const interval = Number(state._progressPollIntervalMs);
  const ms = Number.isFinite(interval) && interval >= 3000 && interval <= 5000 ? interval : 4000;
  state._progressPollIntervalMs = ms;

  vpLog('startProgressPoll', (state.now && state.now.id) || '');

  state._progressPollTimer = setInterval(() => {
    if (!state.player || !state.now) return;
    if (state._vpCanSave === false) return;
    let st = null;
    try { st = state.player.getState ? state.player.getState() : null; } catch { return; }
    if (st && st.paused) return;

    // Log only the first poll tick per episode for debugging.
    try {
      const curId = state.now && state.now.id;
      if (curId && state._vpFirstPollTickLoggedForId !== curId) {
        state._vpFirstPollTickLoggedForId = curId;
        vpLog('poll tick', curId);
      }
    } catch {}

    // saveNow() is internally throttled; this tick is just the "poll" trigger.
    saveNow(false);
  }, ms);
}

async function saveNow(force) {
    if (!state.now || !state.player) return;

    const id = state.now.id;

    // Build 41A: never allow early/tiny saves to clobber a real resume point.
    // During openVideo(), saving stays disabled until resume (if any) is applied.
    if (!force && state._vpCanSave === false) return;

    // Debug: log the first non-force call per episode (when enabled).
    try {
      if (!force && id && state._vpFirstNonForceCallLoggedForId !== id) {
        state._vpFirstNonForceCallLoggedForId = id;
        vpLog('saveNow(false) first call', id);
      }
    } catch {}

    const nowMs = Date.now();
    // BUILD 88 FIX 1.4: Increased throttle from 4s to 10s to reduce disk I/O
    if (!force && (nowMs - state.lastSaveAt) < 10000) return;

    let st;
    try {
      st = state.player.getState();
    } catch {
      return;
    }

    const posRaw = Number(st.timeSec);
    let dur = Number(st.durationSec);
    if (!Number.isFinite(posRaw)) return;
    if (!Number.isFinite(dur) || dur <= 0) dur = 0;

    // Resolve existing progress (from in-memory list or the value loaded at openVideo).
    let existing = null;
    try {
      if (state.progress && typeof state.progress === 'object' && id && state.progress[id]) {
        existing = state.progress[id];
      } else if (state._vpLoadedProgressForId === id && state._vpLoadedProgress) {
        existing = state._vpLoadedProgress;
      }
    } catch {}

    const existingPos = existing ? Number(existing.positionSec) : NaN;
    const existingHasResume = Number.isFinite(existingPos) && existingPos >= 10;

    // If we already have a meaningful resume point, never overwrite it with a tiny position
    // (this happens when polling/time events fire before the resume seek takes effect).
    if (posRaw < 10 && existingHasResume) {
      vpLog('skip save: tiny pos would clobber resume', id, { pos: posRaw, existingPos, force: !!force });
      return;
    }

    state.lastSaveAt = nowMs;

    let pos = posRaw;
    if (pos < 10) pos = 0;

    const endedOnce = (state._vpEndedOnceForId != null && String(state._vpEndedOnceForId) === String(id));
    if (endedOnce) state._vpEndedOnceForId = null;

    const ws = vpEnsureWatchStatsForId(id);
    const watchedSecApprox = (ws && Number.isFinite(Number(ws.watchedSecApprox)) && Number(ws.watchedSecApprox) >= 0) ? Number(ws.watchedSecApprox) : 0;
    const maxPositionSec = (ws && Number.isFinite(Number(ws.maxPositionSec)) && Number(ws.maxPositionSec) >= 0) ? Number(ws.maxPositionSec) : pos;

    const finished = vpShouldMarkFinishedNow(pos, dur, watchedSecApprox, maxPositionSec, endedOnce, !!existing?.finished);

    // Build 58: capture current audio/subtitle tracks and delays for persistence.
    // PERF: avoid expensive bridge queries on periodic saves; use cached values unless this
    // is a force save and we have not sampled recently.
    let selectedAudioTrackId = null;
    let selectedAudioTrackLang = null;
    let selectedSubtitleTrackId = null;
    let selectedSubtitleTrackLang = null;
    let audioDelaySec = null;
    let subtitleDelaySec = null;
    try {
      const canReadTracks = !!(state.player && state.player.capabilities && state.player.capabilities.tracks);
      const canReadDelays = !!(state.player && state.player.capabilities && state.player.capabilities.delays);
      const lastProbeAt = Number(state._vpLastPrefsProbeAt) || 0;
      const allowSlowProbe = !!force && ((nowMs - lastProbeAt) >= 15000);
      if (allowSlowProbe) state._vpLastPrefsProbeAt = nowMs;

      if (state.player && state.player.capabilities && state.player.capabilities.tracks) {
        if (allowSlowProbe && typeof state.player.getAudioTracks === 'function') {
          const a = await state.player.getAudioTracks();
          if (a && a.ok && Array.isArray(a.tracks)) {
            lastAudioTracks = a.tracks;
          }
        }
        if (allowSlowProbe && typeof state.player.getSubtitleTracks === 'function') {
          const s = await state.player.getSubtitleTracks();
          if (s && s.ok && Array.isArray(s.tracks)) {
            lastSubtitleTracks = s.tracks;
          }
        }

        const selA = Array.isArray(lastAudioTracks) ? lastAudioTracks.find(t => t && t.selected) : null;
        if (selA) {
          selectedAudioTrackId = selA.id;
          selectedAudioTrackLang = (selA.lang !== undefined && selA.lang !== null) ? String(selA.lang) : null;
        }

        const selS = Array.isArray(lastSubtitleTracks) ? lastSubtitleTracks.find(t => t && t.selected) : null;
        if (selS) {
          selectedSubtitleTrackId = selS.id;
          selectedSubtitleTrackLang = (selS.lang !== undefined && selS.lang !== null) ? String(selS.lang) : null;
        }
      }

      // Get delays if supported
      if (canReadDelays) {
        if (allowSlowProbe && typeof state.player.getAudioDelay === 'function') {
          const aDelay = await state.player.getAudioDelay();
          if (aDelay && aDelay.ok && Number.isFinite(Number(aDelay.value))) {
            audioDelaySec = Number(aDelay.value);
            cachedAudioDelaySec = audioDelaySec;
          }
        }
        if (allowSlowProbe && typeof state.player.getSubtitleDelay === 'function') {
          const sDelay = await state.player.getSubtitleDelay();
          if (sDelay && sDelay.ok && Number.isFinite(Number(sDelay.value))) {
            subtitleDelaySec = Number(sDelay.value);
            cachedSubtitleDelaySec = subtitleDelaySec;
          }
        }
        if (!Number.isFinite(Number(audioDelaySec)) && Number.isFinite(Number(cachedAudioDelaySec))) {
          audioDelaySec = Number(cachedAudioDelaySec);
        }
        if (!Number.isFinite(Number(subtitleDelaySec)) && Number.isFinite(Number(cachedSubtitleDelaySec))) {
          subtitleDelaySec = Number(cachedSubtitleDelaySec);
        }
      }
    } catch {}

    const payload = {
      positionSec: pos,
      durationSec: dur > 0 ? dur : null,
      finished,
      lastWatchedAtMs: nowMs,
      completedAtMs: finished ? nowMs : undefined,
      maxPositionSec,
      watchedSecApprox,
      // Build 58: playback preferences
      selectedAudioTrackId,
      selectedAudioTrackLang,
      selectedSubtitleTrackId,
      selectedSubtitleTrackLang,
      audioDelaySec,
      subtitleDelaySec,
    };

    // Never clobber saved track prefs with null observations (common during early open/restore).
    try {
      if (existing && typeof existing === 'object') {
        if ((payload.selectedAudioTrackId === null || payload.selectedAudioTrackId === undefined) && existing.selectedAudioTrackId != null) {
          payload.selectedAudioTrackId = existing.selectedAudioTrackId;
          payload.selectedAudioTrackLang = existing.selectedAudioTrackLang ?? payload.selectedAudioTrackLang;
        }
        if ((payload.selectedSubtitleTrackId === null || payload.selectedSubtitleTrackId === undefined) && existing.selectedSubtitleTrackId != null) {
          payload.selectedSubtitleTrackId = existing.selectedSubtitleTrackId;
          payload.selectedSubtitleTrackLang = existing.selectedSubtitleTrackLang ?? payload.selectedSubtitleTrackLang;
        }
      }
    } catch {}

    // Debug: keep logs short and capped.
    if (force) {
      vpLog('saveNow(true) write', id, { pos: payload.positionSec, dur: payload.durationSec, finished });
    } else {
      try {
        if (id && state._vpFirstSavedLoggedForId !== id) {
          state._vpFirstSavedLoggedForId = id;
          vpLog('saveNow(false) first write', id, { pos: payload.positionSec, dur: payload.durationSec });
        }
      } catch {}
    }

    try {
      await Tanko.api.videoProgress.save(id, payload);

      if (state.progress && typeof state.progress === 'object') {
        state.progress[id] = { ...payload, updatedAt: Date.now() };
      }

      // Advance next-episode pointer when finishing an episode.
      try {
        if (finished && state.now && state.now.showId) {
          const next = pickNextUnwatchedEpisode(String(state.now.showId), String(state.now.id));
          if (next && next.id) state.selectedEpisodeId = next.id;
        }
      } catch {}

      rerenderVideoAfterProgress();
    } catch (err) {
      vpLog('saveVideoProgress failed', id, String((err && err.message) || err || ''));
    }
  }

  // Build 58: Save playback preferences (tracks + delays) immediately when changed
  let savePlaybackPrefsTimer = null;
  async function savePlaybackPreferencesNow() {
    // Clear any pending debounced save
    if (savePlaybackPrefsTimer) {
      clearTimeout(savePlaybackPrefsTimer);
      savePlaybackPrefsTimer = null;
    }

    if (!state.now || !state.now.id) return;
    if (!Tanko.api.videoProgress.save) return;

    const id = state.now.id;
    
    try {
      // Get existing progress to merge with
      const existingRes = await Tanko.api.videoProgress.get(id);
      const existing = (existingRes && typeof existingRes === 'object' && Object.prototype.hasOwnProperty.call(existingRes, 'progress'))
        ? existingRes.progress
        : existingRes;

      let selectedAudioTrackId = null;
      let selectedAudioTrackLang = null;
      let selectedSubtitleTrackId = null;
      let selectedSubtitleTrackLang = null;
      let audioDelaySec = null;
      let subtitleDelaySec = null;
      // Capture current tracks and delays
      if (state.player && state.player.capabilities && state.player.capabilities.tracks) {
        if (typeof state.player.getAudioTracks === 'function') {
          const a = await state.player.getAudioTracks();
          if (a && a.ok && Array.isArray(a.tracks)) {
            const selA = a.tracks.find(t => t && t.selected);
            if (selA) {
              selectedAudioTrackId = selA.id;
              selectedAudioTrackLang = (selA.lang !== undefined && selA.lang !== null) ? String(selA.lang) : null;
            }
          }
        }

        if (typeof state.player.getSubtitleTracks === 'function') {
          const s = await state.player.getSubtitleTracks();
          if (s && s.ok && Array.isArray(s.tracks)) {
            const selS = s.tracks.find(t => t && t.selected);
            if (selS) {
              selectedSubtitleTrackId = selS.id;
              selectedSubtitleTrackLang = (selS.lang !== undefined && selS.lang !== null) ? String(selS.lang) : null;
            } else {
              // In the prefs-change path, treat "no selected subtitle" as an explicit OFF.
              selectedSubtitleTrackId = 'no';
              selectedSubtitleTrackLang = null;
            }
          }
        }
      }

      if (state.player && state.player.capabilities && state.player.capabilities.delays) {
        if (typeof state.player.getAudioDelay === 'function') {
          const aDelay = await state.player.getAudioDelay();
          if (aDelay && aDelay.ok && Number.isFinite(Number(aDelay.value))) {
            audioDelaySec = Number(aDelay.value);
          }
        }
        if (typeof state.player.getSubtitleDelay === 'function') {
          const sDelay = await state.player.getSubtitleDelay();
          if (sDelay && sDelay.ok && Number.isFinite(Number(sDelay.value))) {
            subtitleDelaySec = Number(sDelay.value);
          }
        }
      }

      // Merge with existing progress data
      const payload = {
        ...(existing || {}),
        selectedAudioTrackId,
        selectedAudioTrackLang,
        selectedSubtitleTrackId,
        selectedSubtitleTrackLang,
        audioDelaySec,
        subtitleDelaySec,
        updatedAt: Date.now(),
      };

      await Tanko.api.videoProgress.save(id, payload);

      if (state.progress && typeof state.progress === 'object') {
        state.progress[id] = { ...state.progress[id], ...payload };
      }

      vpLog('saved playback prefs', id, { selectedAudioTrackId, selectedAudioTrackLang, selectedSubtitleTrackId, selectedSubtitleTrackLang, audioDelaySec, subtitleDelaySec });
    } catch (err) {
      vpLog('savePlaybackPreferences failed', id, String((err && err.message) || err || ''));
    }
  }

  function schedulePlaybackPreferencesSave() {
    // Debounce: save 500ms after last change
    if (savePlaybackPrefsTimer) clearTimeout(savePlaybackPrefsTimer);
    savePlaybackPrefsTimer = setTimeout(() => {
      savePlaybackPreferencesNow().catch(() => {});
    }, 500);
  }

  async function syncFullscreenUi(forceValue){
    // BUILD40A: In embedded mode, fullscreen must be truly edge-to-edge:
    // - hide Tankoban chrome + player chrome
    // - video fills the window (aspect bars only when required)
    let isFs = !!forceValue;
    if (forceValue === undefined) {
      try { isFs = !!(await Tanko.api.window.isFullscreen()); } catch {}
    }

    document.body.classList.toggle('videoFullscreen', isFs);

    // Build 56B: never keep the cursor hidden when leaving fullscreen.
    if (!isFs) {
      try { el.videoStage?.classList.remove('hideCursor'); } catch {}
    }

    // No alternate "hide UI" mode (only normal vs fullscreen).
    document.body.classList.remove('videoUiHidden');

    // Fullscreen/layout changes require a bounds resync for embedded mpv.
    // Do it immediately + a couple delayed passes to catch the final layout (prevents brief blank frames).
    try { scheduleMpvBoundsUpdate(); } catch {}
    setTimeout(() => { try { scheduleMpvBoundsUpdate(); } catch {} }, 60);
    setTimeout(() => { try { scheduleMpvBoundsUpdate(); } catch {} }, 220);
  }

  async function toggleFullscreen(){
    // Fullscreen is handled by the window itself; we mirror state into CSS.
    try {
      const r = await Tanko.api.window.toggleFullscreen();
      const v = (r && typeof r === 'object' && Object.prototype.hasOwnProperty.call(r, 'value')) ? !!r.value : undefined;
      await syncFullscreenUi(v);
    } catch {
      // Best-effort fallback: still attempt to resync.
      safe(() => syncFullscreenUi());
    }
  }

  function cycleSpeed(dir) {
  safe(async () => {
    if (!state.player) return;

    const steps = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
    const st = state.player.getState?.() || {};
    const current = Number.isFinite(st.speed) ? st.speed : Number(state.settings.speed || 1);

    let idx = steps.findIndex((s) => Math.abs(s - current) < 1e-6);
    if (idx < 0) {
      idx = steps.findIndex((s) => s >= current);
      if (idx < 0) idx = steps.length - 1;
    }

    const step = dir === -1 ? -1 : 1;
    const nextIdx = clamp(idx + step, 0, steps.length - 1);
    const nextSpeed = steps[nextIdx];

    try {
      await state.player.setSpeed(nextSpeed);
      state.settings.speed = nextSpeed;
      setSpeedLabels(nextSpeed);
      hudNotice(`Speed ${nextSpeed}×`);
      persistVideoSettings({ speed: nextSpeed });
    } catch (err) {
      console.error('[video] setSpeed failed', err);
      const fallback = Number.isFinite(current) ? current : 1;
      state.settings.speed = fallback;
      setSpeedLabels(fallback);
      hudNotice('Speed change failed');
    }
  });
}




  // Build 24 prompt 4: speed presets set an exact value (not cycle)
  function setSpeedExact(sp){
    safe(async () => {
      if (!state.player) return;
      const next = clamp(Number(sp) || 1, 0.25, 4);
      try {
        await state.player.setSpeed(next);
        state.settings.speed = next;
        setSpeedLabels(next);
        persistVideoSettings({ speed: next });
        hudNotice(`Speed ${next}×`);
      } catch (err) {
        console.error('[video] setSpeedExact failed', err);
        hudNotice('Speed change failed');
      }
    });
  }

// Build 14: throttle mpv volume writes while dragging slider (UI updates instantly)
function _writeVolumeNow(v){
  if (!state.player) return;
  const vv = clamp(Number(v), 0, 1);

  // Unmute once per slider interaction (avoid spamming mpv)
  if (!state._volUnmutedSent) {
    try { state.player.setMuted(false); } catch {}
    state._volUnmutedSent = true;
  }

  try { state.player.setVolume(vv); } catch {}
  state._volLastSentAt = Date.now();
}

function queueVolumeToPlayer(v){
  if (!state.player) return;
  const vv = clamp(Number(v), 0, 1);
  state._volPending = vv;

  // Ensure unmute is applied promptly (once), even if volume writes are throttled
  if (!state._volUnmutedSent) {
    try { state.player.setMuted(false); } catch {}
    state._volUnmutedSent = true;
  }

  const now = Date.now();
  const minInterval = 90; // ~11 updates/sec max
  const since = now - (state._volLastSentAt || 0);

  if (since >= minInterval) {
    _writeVolumeNow(vv);
    state._volPending = null;
    if (state._volTimer) { clearTimeout(state._volTimer); state._volTimer = null; }
    return;
  }

  if (!state._volTimer) {
    const wait = Math.max(10, minInterval - since);
    state._volTimer = setTimeout(() => {
      state._volTimer = null;
      if (state._volPending == null) return;
      _writeVolumeNow(state._volPending);
      state._volPending = null;
    }, wait);
  }
}

function flushVolumeToPlayer(){
  if (!state.player) return;
  if (state._volTimer) { clearTimeout(state._volTimer); state._volTimer = null; }
  if (state._volPending != null) {
    _writeVolumeNow(state._volPending);
    state._volPending = null;
  } else {
    if (!state._volUnmutedSent && state._volDragActive) {
      try { state.player.setMuted(false); } catch {}
      state._volUnmutedSent = true;
    }
  }
}

function adjustVolume(delta){
    if (!state.player) return;
    const st = state.player.getState();
    const next = clamp(Number(st.volume) + Number(delta), 0, 1);
    state.settings.volume = next;
    state.settings.muted = false;
    state.player.setMuted(false);
    state.player.setVolume(next);
    if (el.videoVol) el.videoVol.value = String(Math.round(next * 100));
    persistVideoSettings({ volume: next, muted: false });
    
    // Show prominent volume OSD indicator
    showVolumeOSD(next);
  }
  
  // Build 69: Volume OSD indicator for immediate visual feedback
  let volumeOSDTimer = null;
  function showVolumeOSD(volume) {
    const volumePct = Math.round(clamp(volume, 0, 1) * 100);
    
    // Create or reuse OSD element
    let osd = document.getElementById('videoVolumeOSD');
    if (!osd) {
      osd = document.createElement('div');
      osd.id = 'videoVolumeOSD';
      osd.className = 'videoVolumeOSD';
      document.body.appendChild(osd);
    }
    
    // Update content with volume bars (visual representation)
    const barCount = 20;
    const filledBars = Math.round((volumePct / 100) * barCount);
    const bars = '█'.repeat(filledBars) + '░'.repeat(barCount - filledBars);
    osd.innerHTML = `
      <div class="volumeOSDIcon">${volumePct === 0 ? '🔇' : volumePct < 50 ? '🔉' : '🔊'}</div>
      <div class="volumeOSDBars">${bars}</div>
      <div class="volumeOSDPercent">${volumePct}%</div>
    `;
    
    // Show with animation
    osd.classList.remove('hidden');
    osd.classList.add('visible');
    
    // Auto-hide after 1 second
    if (volumeOSDTimer) clearTimeout(volumeOSDTimer);
    volumeOSDTimer = setTimeout(() => {
      osd.classList.remove('visible');
      setTimeout(() => osd.classList.add('hidden'), 300); // Wait for fade animation
    }, 1000);
  }

  function toggleMute(){
    if (!state.player) return;
    const st = state.player.getState();
    const next = !st.muted;
    state.settings.muted = next;
    state.player.setMuted(next);
    if (el.videoMuteBtn) el.videoMuteBtn.textContent = next ? '🔇' : '🔊';
    persistVideoSettings({ muted: next });
    hudNotice(next ? 'Muted' : 'Unmuted');
  }
  function commitSeekFromScrub(reason) {
    if (!state.player) return;

    // cancel any pending nudge seek so it can't "win" after a drag commit
    if (state._nudgeSeekTimer) { clearTimeout(state._nudgeSeekTimer); state._nudgeSeekTimer = null; }
    state._nudgeSeekPreviewing = false;
    state._nudgeSeekBaseSec = null;
    state._nudgeSeekDeltaSec = 0;
    state._nudgeSeekPreviewSec = null;

    const v = Number(state.seekPreviewSec);
    if (!isFinite(v)) return;

    const now = Date.now();
    // guard against double-commit (pointerup + lostpointercapture, etc.)
    if (now - (state._seekCommitGuardAt || 0) < 120) {
      state.seekDragging = false;
      state.seekPreviewSec = null;
      showHud();
      return;
    }
    state._seekCommitGuardAt = now;

    try { (state.player.seekToFast ? state.player.seekToFast(v) : state.player.seekTo(v)); } catch {}
    state.seekDragging = false;
    state.seekPreviewSec = null;
    showHud();
  }

  function seekBy(delta){
    if (!state.player) return;
    if (state.seekDragging) return;

    const st = state.player.getState();
    const dur = Number(st.durationSec) || 0;

    if (!state._nudgeSeekPreviewing) {
      state._nudgeSeekBaseSec = Number(st.timeSec) || 0;
      state._nudgeSeekDeltaSec = 0;
      state._nudgeSeekPreviewing = true;
    }

    state._nudgeSeekDeltaSec = Number(state._nudgeSeekDeltaSec || 0) + Number(delta || 0);
    const target = clamp((Number(state._nudgeSeekBaseSec) || 0) + Number(state._nudgeSeekDeltaSec || 0), 0, dur || 1e12);
    state._nudgeSeekPreviewSec = target;

    // UI preview (don't spam mpv while keys repeat)
    if (el.videoTimeNow) el.videoTimeNow.textContent = fmtTime(target);
    setVideoScrubUI(target, dur);
    showHud();

    if (state._nudgeSeekTimer) clearTimeout(state._nudgeSeekTimer);
    state._nudgeSeekTimer = setTimeout(() => {
      const total = Number(state._nudgeSeekDeltaSec || 0);
      const preview = state._nudgeSeekPreviewSec;

      state._nudgeSeekTimer = null;
      state._nudgeSeekPreviewing = false;

      // reset preview state first, so normal HUD updates resume even if seek throws
      state._nudgeSeekBaseSec = null;
      state._nudgeSeekDeltaSec = 0;
      state._nudgeSeekPreviewSec = null;

      if (!state.player || !total) return;

      try { state.player.seekBy(total); } catch {}
      if (typeof preview === 'number') toast(`${total >= 0 ? '+' : ''}${total}s • ${fmtTime(preview)}`);
      showHud();
    }, 100);
  }


  // Timeline scrub drag state (reader-style)
  let videoScrubDragging = false;
  let videoScrubDragLeft = 0;
  let videoScrubDragWidth = 0;
  let videoScrubMoveRaf = 0;
  let videoScrubPendingClientX = null;

  // Light throttled “live seek” while dragging
  let videoScrubLiveSeekTimer = null;
  let videoScrubLiveSeekSec = null;

  function videoTimeFromClientX(clientX) {
    const st = state.player ? state.player.getState() : null;
    const dur = Number(st && st.durationSec) || 0;
    if (!dur) return 0;

    // Build 56B: use the actual visible scrub track bounds (not the container),
    // so click-to-time matches the real timeline.
    const track = el.videoScrubTrack || el.videoScrub;
    const left = videoScrubDragLeft || (track?.getBoundingClientRect().left || 0);
    const width = videoScrubDragWidth || (track?.getBoundingClientRect().width || 1);
    const t = clamp((Number(clientX) - left) / (width || 1), 0, 1);
    return t * dur;
  }

  function previewScrubAtClientX(clientX) {
    if (!state.player) return;
    const st = state.player.getState();
    const dur = Number(st.durationSec) || 0;

    const sec = videoTimeFromClientX(clientX);
    state.seekPreviewSec = sec;

    // Update UI instantly (document-like feel)
    setVideoScrubUI(sec, dur);
    if (el.videoTimeNow) el.videoTimeNow.textContent = fmtTime(sec);
    showHud();

    // Throttled live seek while dragging (keeps it smooth without spamming mpv)
    videoScrubLiveSeekSec = sec;
    if (videoScrubLiveSeekTimer) return;
    videoScrubLiveSeekTimer = setTimeout(() => {
      videoScrubLiveSeekTimer = null;
      if (!state.player || !state.seekDragging) return;
      const v = Number(videoScrubLiveSeekSec);
      if (!isFinite(v)) return;
      try { (state.player.seekToFast ? state.player.seekToFast(v) : state.player.seekTo(v)); } catch {}
    }, 120);
  }


  function bindPlayerUi(){
    if (!state.player) return;

    // Rebind player event listeners if the underlying adapter is swapped (mpv <-> browser).
    if (state._playerEventsBoundFor !== state.player) {
      state.player.on('time', () => {
        updateHudFromPlayer();
        saveNow(false);
      });
      state.player.on('play', () => { updateHudFromPlayer(); hideHudSoon(); });
      state.player.on('pause', () => { updateHudFromPlayer(); showHud(); saveNow(true); });
      state.player.on('ended', () => { updateHudFromPlayer(); showHud(); state._vpEndedOnceForId = (state.now && state.now.id) ? state.now.id : null; saveNow(true); maybeAutoAdvanceOnFinish(); });
      state.player.on('shutdown', () => { updateHudFromPlayer(); stopProgressPoll(); saveNow(true); safe(() => teardownMpvPlayer()); });
      state.player.on('loadedmetadata', () => { updateHudFromPlayer(); safe(() => refreshChaptersFromPlayer()); });
      state.player.on('duration', () => { updateHudFromPlayer(); safe(() => refreshChaptersFromPlayer()); });
      
      // BUILD 89 FIX 2: Also try refreshing chapters on file-loaded with a slight delay
      // to ensure mpv has fully parsed the file metadata
      state.player.on('file-loaded', () => {
        console.log('[BUILD89 CHAPTERS] file-loaded event received');
        updateHudFromPlayer();
        safe(() => {
          // Small delay to let mpv finish loading all metadata
          setTimeout(() => {
            console.log('[BUILD89 CHAPTERS] Delayed chapter refresh after file-loaded');
            refreshChaptersFromPlayer();
          }, 500);
        });
      });
      
      state.player.on('volume', () => { updateHudFromPlayer(); });
      state.player.on('speed', () => { updateHudFromPlayer(); });

      // Build 15: clean recovery for mpv failures (early exit / ipc timeout / not-ready).
      state.player.on('error', (info) => {
        const p = (info && typeof info === 'object') ? info : {};
        const msg = String(p.message || p.error || p.reason || 'mpv failed');
        const reason = String(p.reason || '');
        const logPath = String(p.logPath || '');

        const sig = reason + '|' + String(p.code || '') + '|' + String(p.signal || '') + '|' + String(p.ipcPath || '') + '|' + msg;
        const now = Date.now();
        if (sig && sig === lastMpvErrorSig && (now - lastMpvErrorAt) < 1500) return;
        lastMpvErrorSig = sig;
        lastMpvErrorAt = now;

        const fatal = (
          reason === 'ipc-timeout' ||
          reason === 'exit-early' ||
          /inter-process communication/i.test(msg) ||
          /ipc connect timeout/i.test(msg) ||
          /failed to start/i.test(msg) ||
          /did not become ready/i.test(msg)
        );

        if (!fatal) {
          toast(msg, 8000);
          return;
        }

        // Best-effort resume: capture last known position before we reset.
        let resumePosSec = 0;
        try {
          const st = state.player && state.player.getState ? state.player.getState() : null;
          const t = st ? Number(st.timeSec) : 0;
          resumePosSec = Number.isFinite(t) ? t : 0;
        } catch {}

        state._retryPending = { video: state.now, resumePosSec };
        showRetryToast(msg, logPath);

        // Reset player state now so Retry can spawn a fresh mpv.
        safe(async () => { await teardownMpvPlayer(); });
      });

      // Tankoban Plus Build 5.4B: keep delay values fresh when mpv updates them.
      state.player.on('delays', () => { safe(() => refreshDelaysFromPlayer()); });
      // Tankoban Plus Build 5.4C: keep transform selectors in sync (mpv only).
      state.player.on('transforms', () => { safe(() => refreshTransformsFromPlayer()); });
      state._playerEventsBoundFor = state.player;
    }

    if (state._playerDomBound) return;
    state._playerDomBound = true;

    // Stage interactions

    // Build 15: retry stays inside the existing toast system (click the toast).
    el.videoToast?.addEventListener('click', () => {
      if (!state._retryAvailable) return;
      retryLastMpvFailure();
    });

        // Build 56C: right-click context menu on the video surface (custom, consistent across platforms)
    // Canvas embedded mode (libmpvCanvas): mpvHost is a normal <div> containing a <canvas>,
    // so bind directly to the DOM surfaces (no detached-window special-casing needed).
    let lastContextMenuTime = 0;
    const CONTEXT_MENU_COOLDOWN_MS = 300; // Prevent rapid re-opening

    // BUILD 67: Enhanced diagnostics for right-click context menu debugging
    function handleCanvasContextMenu(e) {
      console.log('[BUILD69 CTX] handleCanvasContextMenu called');
      if (!e) {
        console.log('[BUILD69 CTX] No event object');
        return;
      }
      if (state.mode !== 'videos') {
        console.log('[BUILD69 CTX] Not in videos mode, mode =', state.mode);
        return;
      }
      if (el.videoPlayerView && el.videoPlayerView.classList.contains('hidden')) {
        console.log('[BUILD69 CTX] Player view is hidden');
        return;
      }

      console.log('[video] BUILD67 contextmenu event:', {
        target: e.target ? (e.target.id || e.target.className || e.target.tagName) : 'null',
        currentTarget: e.currentTarget ? (e.currentTarget.id || e.currentTarget.className) : 'null',
        clientX: e.clientX,
        clientY: e.clientY,
        button: e.button,
        buttons: e.buttons,
        defaultPrevented: e.defaultPrevented,
        bubbles: e.bubbles,
        cancelable: e.cancelable
      });

      // Let native behavior win for actual form controls
      const t = e.target;
      const tag = t && t.tagName ? String(t.tagName).toUpperCase() : '';
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        console.log('[BUILD69 CTX] Ignoring - target is form control');
        return;
      }

      // Cooldown guard (and avoids multi-trigger when multiple surfaces are bound)
      const now = Date.now();
      if (now - lastContextMenuTime < CONTEXT_MENU_COOLDOWN_MS) {
        console.log('[video] Rejected: cooldown active');
        return;
      }
      lastContextMenuTime = now;

      try {
        e.preventDefault();
        e.stopPropagation();
        console.log('[BUILD69 CTX] Event prevented successfully');
      } catch (err) {
        console.error('[video] Failed to prevent default:', err);
      }

      // Always show HUD when opening the menu
      showHud();

      console.log('[BUILD69 CTX] Calling openVideoCtxMenu at', e.clientX, e.clientY);
      openVideoCtxMenu(e.clientX || 0, e.clientY || 0);
      console.log('[video] Context menu opened at:', e.clientX, e.clientY);
    }

    function attachContextMenuCanvas() {
      console.log('[video] BUILD67 Attaching context menu handlers (canvas mode)');
      
      // Clean up any existing listeners (safe even if never bound)
      try {
        el.videoStage?.removeEventListener('contextmenu', handleCanvasContextMenu);
        el.mpvHost?.removeEventListener('contextmenu', handleCanvasContextMenu);
        el.videoPlayerView?.removeEventListener('contextmenu', handleCanvasContextMenu);
        const c = el.mpvHost?.querySelector?.('canvas');
        c?.removeEventListener?.('contextmenu', handleCanvasContextMenu);
      } catch {}

      const attach = (node, label) => {
        if (!node) {
          console.log(`[video] Skipping ${label}: element not found`);
          return;
        }
        try {
          node.addEventListener('contextmenu', handleCanvasContextMenu, { 
            passive: false,
            capture: true  // Build 67: Use capture to catch early
          });
          console.log(`[video] Attached contextmenu to ${label}:`, node.id || node.className || node.tagName);
        } catch (err) {
          console.error(`[video] Failed to attach to ${label}:`, err);
        }
      };

      // Attach to all relevant elements in canvas mode
      attach(el.videoStage, 'videoStage');
      attach(el.mpvHost, 'mpvHost');
      attach(el.videoPlayerView, 'videoPlayerView');
      const canvas = el.mpvHost?.querySelector?.('canvas');
      attach(canvas, 'canvas');
      
      // Build 67: Also try HUD overlay (might be intercepting)
      attach(el.videoHud, 'videoHud');
      
      // BUILD 69: Add fallback document-level handler to ensure it works everywhere
      document.addEventListener('contextmenu', (e) => {
        // Only handle if we're in videos mode and in player
        if (state.mode !== 'videos') return;
        if (!document.body.classList.contains('inVideoPlayer')) return;
        
        // Check if the event target is within the video player view
        const target = e.target;
        if (!target) return;
        
        // Don't intercept clicks on the actual context menu itself
        if (el.videoCtxMenu && el.videoCtxMenu.contains(target)) return;
        
        // Check if target is inside video player
        const inPlayerView = el.videoPlayerView && el.videoPlayerView.contains(target);
        const inStage = el.videoStage && el.videoStage.contains(target);
        
        if (inPlayerView || inStage) {
          console.log('[BUILD69 CTX] Document-level handler triggered');
          handleCanvasContextMenu(e);
        }
      }, { capture: true, passive: false });
      
      console.log('[video] Context menu attachment complete');
    }

    const isCanvasMode = !!(document.body && document.body.classList && document.body.classList.contains('libmpvCanvas'));
    if (isCanvasMode) {
      attachContextMenuCanvas();
    } else {
      // Non-canvas mpv can swallow bubbling events; keep a capture + document fallback there.
      const handleVideoContextMenu = (e) => {
        if (!e) return;

        // Cooldown guard
        const now = Date.now();
        if (now - lastContextMenuTime < CONTEXT_MENU_COOLDOWN_MS) return;
        lastContextMenuTime = now;

        // Let native behavior win for actual form controls
        const t = e.target;
        const tag = t && t.tagName ? String(t.tagName).toUpperCase() : '';
        if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

        if (e.__videoCtxHandled) return;
        e.__videoCtxHandled = true;

        try { e.preventDefault(); e.stopPropagation(); } catch {}
        openVideoCtxMenu(e.clientX || 0, e.clientY || 0);
        showHud();
      };

      const attachContextMenu = (element) => {
        if (!element) return;
        try {
          element.addEventListener('contextmenu', handleVideoContextMenu, { capture: true, passive: false });
        } catch (err) {
          console.error('[video] Failed to attach context menu:', err);
        }
      };

      attachContextMenu(el.videoStage);
      attachContextMenu(el.videoPlayerView);
      attachContextMenu(el.videoEl);
      attachContextMenu(el.mpvHost);

      if (!state._videoCtxMenuDocBound) {
        state._videoCtxMenuDocBound = true;
        document.addEventListener('contextmenu', (e) => {
          if (!e || state.mode !== 'videos') return;
          const target = e.target;
          if (!target) return;
          if (el.videoCtxMenu && el.videoCtxMenu.contains(target)) return;
          if (el.videoPlayerView && el.videoPlayerView.contains(target)) {
            handleVideoContextMenu(e);
          }
        }, { capture: true, passive: false });
      }
    }

    // Click-away close (capture phase so it works even if other handlers stop propagation)
    document.addEventListener('mousedown', (e) => {
      if (!ctxMenuOpen) return;
      const t = e.target;
      if (el.videoCtxMenu && t && el.videoCtxMenu.contains(t)) return;
      closeVideoCtxMenu();
    }, true);

// BUILD64: Enhanced context menu with submenus and comprehensive actions
    el.videoCtxMenu?.addEventListener('click', async (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('button.ctxItem, button.ctxExpandable') : null;
      if (!btn) return;
      
      const act = String(btn.getAttribute('data-act') || '');
      const submenu = String(btn.getAttribute('data-submenu') || '');
      
      // Handle submenu expansion
      if (submenu && btn.classList.contains('ctxExpandable')) {
        e.stopPropagation();
        const panel = el.videoCtxMenu?.querySelector(`[data-submenu-id="${submenu}"]`);
        if (!panel) return;
        
        // Close other submenus
        el.videoCtxMenu?.querySelectorAll('.ctxSubmenuPanel').forEach((p) => {
          if (p !== panel) p.classList.add('hidden');
        });
        
        // Toggle this submenu
        const wasHidden = panel.classList.contains('hidden');
        panel.classList.toggle('hidden');
        
        if (wasHidden) {
          // BUILD74: Position submenu AFTER it's visible and content is rendered
          // Use requestAnimationFrame to ensure DOM has updated with populated content
          requestAnimationFrame(() => {
            const menuRect = el.videoCtxMenu.getBoundingClientRect();
            const btnRect = btn.getBoundingClientRect();
            
            // Get accurate panel dimensions now that it's visible and populated
            const panelRect = panel.getBoundingClientRect();
            const pw = panelRect.width || 200;
            const ph = panelRect.height || 150;
            
            // Position to the right of the parent menu, aligned with the button
            let vx = menuRect.right + 4;
            let vy = btnRect.top;

            // Viewport dimensions
            const vw = window.innerWidth || 0;
            const vh = window.innerHeight || 0;

            // If submenu would go off right edge, flip to left side
            if (vx + pw > vw - 8) {
              vx = menuRect.left - pw - 4;
            }

            // Clamp Y to viewport (keep submenu fully visible)
            vy = Math.max(8, Math.min(vy, vh - ph - 8));

            // Apply position (panel is positioned relative to the menu)
            const relLeft = vx - menuRect.left;
            const relTop = vy - menuRect.top;
            panel.style.left = `${relLeft}px`;
            panel.style.top = `${relTop}px`;
          });
        }
        
        return;
      }
      
      // Close menu for regular actions
      closeVideoCtxMenu();
      
      // Execute action
      if (act === 'togglePlay') {
        safe(() => togglePlay());
        showHud();
        return;
      }
      
      if (act === 'stop') {
        if (state.player) {
          try {
            await state.player.pause?.();
            await state.player.seekTo?.(0);
            showHud();
          } catch {}
        }
        return;
      }
      
      if (act === 'restart') {
        if (state.player) {
          try {
            await state.player.seekTo?.(0);
            hudNotice('Restarted from beginning');
            showHud();
          } catch {}
        }
        return;
      }
      
      if (act === 'seekBack10') {
        seekBy(-10);
        showHud();
        return;
      }
      
      if (act === 'seekForward10') {
        seekBy(10);
        showHud();
        return;
      }
      
      if (act === 'seekBack30') {
        seekBy(-30);
        showHud();
        return;
      }
      
      if (act === 'seekForward30') {
        seekBy(30);
        showHud();
        return;
      }
      
      if (act === 'prevEpisode') {
        const { prev } = getPrevNextEpisodes();
        if (prev) {
          safe(() => openEpisodeFromPlaylist(prev));
          hudNotice('Previous episode');
        }
        return;
      }
      
      if (act === 'nextEpisode') {
        const { next } = getPrevNextEpisodes();
        if (next) {
          safe(() => openEpisodeFromPlaylist(next));
          hudNotice('Next episode');
        }
        return;
      }
      
      if (act === 'speed') {
        const speed = Number(btn.getAttribute('data-speed'));
        if (Number.isFinite(speed) && speed > 0) {
          safe(() => setSpeedExact(speed));
        }
        return;
      }
      
      if (act === 'selectAudioTrack') {
        const trackId = btn.getAttribute('data-track-id');
        if (trackId && state.player && typeof state.player.setAudioTrack === 'function') {
          try {
            await state.player.setAudioTrack(trackId);
            // BUILD 87: Refresh track list after change to update active state
            await refreshTracksFromPlayer();
            hudNotice('Audio track changed');
            showHud();
          } catch (err) {
            console.error('[ctx-menu] Audio track change failed:', err);
            hudNotice('Failed to change audio track');
          }
        }
        return;
      }
      
      if (act === 'selectSubtitleTrack') {
        const trackId = btn.getAttribute('data-track-id');
        if (state.player && typeof state.player.setSubtitleTrack === 'function') {
          try {
            await state.player.setSubtitleTrack(trackId);
            // BUILD 87: Refresh track list after change to update active state
            await refreshTracksFromPlayer();
            if (trackId === 'no' || trackId === 'false') {
              hudNotice('Subtitles disabled');
            } else {
              hudNotice('Subtitle track changed');
            }
            showHud();
          } catch (err) {
            console.error('[ctx-menu] Subtitle track change failed:', err);
            hudNotice('Failed to change subtitle track');
          }
        }
        return;
      }
      
      if (act === 'audioDelayInc') {
        safe(() => nudgeDelay('audio', +1));
        return;
      }
      
      if (act === 'audioDelayDec') {
        safe(() => nudgeDelay('audio', -1));
        return;
      }
      
      if (act === 'audioDelayReset') {
        if (state.player && typeof state.player.setAudioDelay === 'function') {
          try {
            await state.player.setAudioDelay(0);
            cachedAudioDelaySec = 0;
            hudNotice('Audio delay reset');
            showHud();
          } catch {}
        }
        return;
      }
      
      if (act === 'subDelayInc') {
        safe(() => nudgeDelay('subtitle', +1));
        return;
      }
      
      if (act === 'subDelayDec') {
        safe(() => nudgeDelay('subtitle', -1));
        return;
      }
      
      if (act === 'subDelayReset') {
        if (state.player && typeof state.player.setSubtitleDelay === 'function') {
          try {
            await state.player.setSubtitleDelay(0);
            cachedSubtitleDelaySec = 0;
            hudNotice('Subtitle delay reset');
            showHud();
          } catch {}
        }
        return;
      }
      
      if (act === 'loadSubtitle') {
  try {
    const result = await Tanko.api.window.openSubtitleDialog?.();
    if (result && result.filePath && state.player && typeof state.player.addExternalSubtitle === 'function') {
      await state.player.addExternalSubtitle(result.filePath);
      hudNotice('Subtitle loaded');
      showHud();
    }
  } catch {}
  return;
}
      
      if (act === 'aspectRatio') {
  const aspect = btn.getAttribute('data-aspect');
  if (aspect && state.player && typeof state.player.setAspectRatio === 'function') {
    try {
      await state.player.setAspectRatio(aspect);
      cachedAspectMode = aspect;
      hudNotice(`Aspect: ${aspect}`);
      showHud();
    } catch {}
  }
  return;
}
      
      if (act === 'screenshot') {
        try {
          await Tanko.api.window.takeScreenshot?.();
          hudNotice('Screenshot saved');
          showHud();
        } catch (err) {
          hudNotice('Screenshot failed');
          showHud();
        }
        return;
      }
      
      if (act === 'openFile') {
        const res = await Tanko.api.video.openFileDialog();
        if (res && res.ok && res.video) {
          const v = { ...res.video, folderName: '', folderId: '' };
          safe(() => playViaShell(v, { video: v }));
        }
        return;
      }
      
      if (act === 'alwaysOnTop') {
        try {
          await Tanko.api.window.toggleAlwaysOnTop?.();
          updateAlwaysOnTopUI();
        } catch {}
        return;
      }
      
      if (act === 'toggleFullscreen') {
        safe(async () => {
          try {
            if (typeof toggleFullscreen === 'function') await toggleFullscreen();
            else await Tanko.api.window.toggleFullscreen();
          } catch {}
        });
        showHud();
        return;
      }
    });

    // BUILD74: Improved submenu hover handling with event delegation
    // Use a delay before closing submenus so users can move mouse to them
    let submenuCloseTimer = null;
    
    const scheduleSubmenuClose = () => {
      if (submenuCloseTimer) clearTimeout(submenuCloseTimer);
      submenuCloseTimer = setTimeout(() => {
        submenuCloseTimer = null;
        // Only close if mouse is not over menu or any submenu
        if (!el.videoCtxMenu?.matches(':hover')) {
          const anySubmenuHovered = Array.from(el.videoCtxMenu?.querySelectorAll('.ctxSubmenuPanel') || [])
            .some(p => p.matches(':hover'));
          if (!anySubmenuHovered) {
            el.videoCtxMenu?.querySelectorAll('.ctxSubmenuPanel').forEach((p) => {
              p.classList.add('hidden');
            });
          }
        }
      }, 300); // 300ms delay allows user to move to submenu
    };
    
    const cancelSubmenuClose = () => {
      if (submenuCloseTimer) {
        clearTimeout(submenuCloseTimer);
        submenuCloseTimer = null;
      }
    };
    
    // Use event delegation for main menu hover
    el.videoCtxMenu?.addEventListener('mouseleave', (e) => {
      // Only schedule close if we're not moving to a submenu
      const relatedTarget = e.relatedTarget;
      if (relatedTarget && relatedTarget.closest && relatedTarget.closest('.ctxSubmenuPanel')) {
        // Moving to a submenu, don't close
        return;
      }
      scheduleSubmenuClose();
    });
    
    el.videoCtxMenu?.addEventListener('mouseenter', () => {
      cancelSubmenuClose();
    });
    
    // Use event delegation for submenu panels (works for dynamically created content)
    document.addEventListener('mouseenter', (e) => {
      const submenuPanel = e.target.closest('.ctxSubmenuPanel');
      if (submenuPanel && el.videoCtxMenu?.contains(submenuPanel)) {
        cancelSubmenuClose();
      }
    }, true);
    
    document.addEventListener('mouseleave', (e) => {
      const submenuPanel = e.target.closest('.ctxSubmenuPanel');
      if (submenuPanel && el.videoCtxMenu?.contains(submenuPanel)) {
        // Only schedule close if not moving to main menu
        const relatedTarget = e.relatedTarget;
        if (relatedTarget && relatedTarget.closest && relatedTarget.closest('.videoCtxMenu')) {
          // Moving back to main menu, don't close
          return;
        }
        scheduleSubmenuClose();
      }
    }, true);

    // Build 57: PotPlayer-style reveal zone overlay behavior
    // Concept: bottom edge of video container summons controls; mouse over controls keeps them visible
    
    const _updateRevealZone = (e) => {
      if (!el.videoStage) return;
      // Build 85: in fullscreen, any mouse movement should immediately reveal the cursor,
      // even if you're not hovering the bottom reveal zone.
      try {
        if (document.body.classList.contains('videoFullscreen')) {
          el.videoStage.classList.remove('hideCursor');
        }
      } catch {}
      
      const rect = el.videoStage.getBoundingClientRect();
      const mouseY = e.clientY;
      state._revealZoneLastMouseY = mouseY;
      
      // Check if in bottom reveal zone
      const bottomEdge = rect.bottom;
      const revealZoneTop = bottomEdge - REVEAL_ZONE_HEIGHT;
      const nowInZone = mouseY >= revealZoneTop && mouseY <= bottomEdge;
      
      // Hysteresis: once in zone, require moving up HYSTERESIS_PX to "leave"
      if (nowInZone) {
        state._revealZoneInZone = true;
        state._revealZoneActive = true;
      } else if (state._revealZoneActive) {
        // Check if moved far enough up to deactivate
        if (mouseY < (revealZoneTop - HYSTERESIS_PX)) {
          state._revealZoneInZone = false;
          state._revealZoneActive = false;
        }
      } else {
        state._revealZoneInZone = false;
      }
      
      // Show HUD if in reveal zone or over controls
      if (state._revealZoneInZone || state._pointerOverControls) {
        showHud();
      } else {
        hideHudSoon();
      }
    };
    
    el.videoStage?.addEventListener('mousemove', _updateRevealZone);
    el.videoStage?.addEventListener('mouseleave', () => {
      state._revealZoneInZone = false;
      state._revealZoneActive = false;
      state._revealZoneLastMouseY = -1;
      hideHudSoon();
    });

    const _markOverControls = (on) => {
      state._pointerOverControls = !!on;
      if (on) showHud();
      else {
        // Only hide if not in reveal zone
        if (!state._revealZoneInZone && !state._revealZoneActive) {
          hideHudSoon();
        }
      }
    };

    el.videoHud?.addEventListener('mouseenter', () => _markOverControls(true));
    el.videoHud?.addEventListener('mouseleave', () => _markOverControls(false));
    el.videoPlaylistPanel?.addEventListener('mouseenter', () => _markOverControls(true));
    el.videoPlaylistPanel?.addEventListener('mouseleave', () => _markOverControls(false));
    el.videoTracksPanel?.addEventListener('mouseenter', () => _markOverControls(true));
    el.videoTracksPanel?.addEventListener('mouseleave', () => _markOverControls(false));
    el.videoVolPanel?.addEventListener('mouseenter', () => _markOverControls(true));
    el.videoVolPanel?.addEventListener('mouseleave', () => _markOverControls(false));
    el.videoDiagnostics?.addEventListener('mouseenter', () => _markOverControls(true));
    el.videoDiagnostics?.addEventListener('mouseleave', () => _markOverControls(false));

    // Mouse wheel: volume by default, seek while holding Shift.
    el.videoStage?.addEventListener('wheel', (e) => {
      if (!state.player) return;
      const t = e.target;
      // Allow normal scrolling in list panels.
      if (el.videoPlaylistList && el.videoPlaylistList.contains(t)) return;
      // The scrub bar has its own wheel behavior.
      if (el.videoScrub && el.videoScrub.contains(t)) return;

      e.preventDefault();
      const dir = (e.deltaY > 0) ? 1 : -1;

      if (e.shiftKey) {
        seekBy(dir * 10);
        showHud();
        return;
      }

      const cur = clamp(Number(state.settings.volume ?? 1), 0, 1);
      const step = 0.05;
      const next = clamp(cur + (-dir * step), 0, 1);
      state.settings.volume = next;
      state.settings.muted = false;
      if (el.videoVol) el.videoVol.value = String(Math.round(next * 100)); // keep slider responsive
      if (el.videoVolPct) el.videoVolPct.textContent = `${Math.round(next * 100)}%`;
      if (el.videoMuteBtn) el.videoMuteBtn.textContent = '🔊';
      queueVolumeToPlayer(next);
      persistVideoSettings({ volume: next, muted: false });
      
      // Show volume OSD
      showVolumeOSD(next);
      showHud();
    }, { passive: false });

    // Left click menu (PotPlayer-style) on empty player background
    // BUILD41B: disabled by default (distracting). To re-enable for debugging:
    //   localStorage.setItem('tb_video_left_menu', '1'); location.reload();
    let _leftMenuTimer = null;
    const _leftClickMenuEnabled = (() => {
      try { return localStorage.getItem('tb_video_left_menu') === '1'; } catch { return false; }
    })();

    if (_leftClickMenuEnabled) {
        el.videoStage?.addEventListener('click', (e) => {
          if (e.button !== 0) return;          // left click only
          if (!state.player) return;
          if (state.seekDragging) return;      // don’t interrupt scrub drag
          const t = e.target;
          if (isPlayerInteractiveTarget(t)) return;

          // Delay slightly to avoid firing on double-click (fullscreen)
          if (_leftMenuTimer) { clearTimeout(_leftMenuTimer); _leftMenuTimer = null; }
          const x = e.clientX, y = e.clientY;
          _leftMenuTimer = setTimeout(() => {
            _leftMenuTimer = null;
            // close any open panels first
            if (typeof closeAllToolPanels === 'function') closeAllToolPanels();
            openPotLikeLeftClickMenuAt(x, y);
            showHud();
          }, 180);
        });

    }

    // Build 60: Single-click toggles HUD visibility (not play/pause)
    // If the left-click menu is enabled, that handler owns single-click instead.
    let _clickHudToggleTimer = null;
    if (!_leftClickMenuEnabled) {
      el.videoStage?.addEventListener('click', (e) => {
        if (e.button !== 0) return;
        if (!state.player) return;
        if (state.seekDragging) return;
        const t = e.target;
        if (isPlayerInteractiveTarget(t)) return;

        // Delay slightly to avoid firing on double-click (fullscreen)
        if (_clickHudToggleTimer) { clearTimeout(_clickHudToggleTimer); _clickHudToggleTimer = null; }
        _clickHudToggleTimer = setTimeout(() => {
          _clickHudToggleTimer = null;
          toggleHud(); // Build 60: toggle HUD instead of play/pause
        }, 180);
      });
    }

    el.videoStage?.addEventListener('dblclick', (e) => {
      // cancel pending single-click actions
      if (_leftMenuTimer) { clearTimeout(_leftMenuTimer); _leftMenuTimer = null; }
      if (_clickHudToggleTimer) { clearTimeout(_clickHudToggleTimer); _clickHudToggleTimer = null; } // Build 60
      const t = e.target;
      if (isPlayerInteractiveTarget(t)) return;
      toggleFullscreen();
    });

    showHud();

// Buttons
    el.videoPlayBtn?.addEventListener('click', () => { state.player?.togglePlay(); showHud(); });
    // BUILD 65: Removed fullscreen/mute/speed/tracks/playlist buttons from control bar
    // All functionality now accessible via right-click context menu
    // el.videoFullscreenBtn?.addEventListener('click', () => { toggleFullscreen(); showHud(); });
    el.videoFullscreenBtnTop?.addEventListener('click', () => { toggleFullscreen(); showHud(); });

    // BUILD 101: Fullscreen HUD exit arrow uses the existing fullscreen toggle path.
    el.videoExitFullscreenBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFullscreen();
      showHud();
    });

// BUILD 65: Control bar buttons removed - functionality in context menu
// el.videoMuteBtn?.addEventListener('click', () => {
//       if (volPanelOpen) closeVolPanel();
//       else openVolPanel();
//       showHud();
//     });
    el.videoVolMuteToggleBtn?.addEventListener('click', () => { toggleMute(); showHud(); });
    el.videoVolCloseBtn?.addEventListener('click', () => { closeVolPanel(); showHud(); });
    el.videoSpeedCloseBtn?.addEventListener('click', () => { closeSpeedPanel(); showHud(); }); // Build 60

    // Build 60: Speed button opens separate speed panel
    // BUILD 65: Removed from control bar, but keep functionality for keyboard shortcuts
    const _toggleSpeedPanel = () => {
      safe(() => {
        if (!state.player) return;
        toggleSpeedPanel();
      });
    };
    // Build 67: Unified tracks button in top bar
    el.videoTracksBtnTop?.addEventListener('click', () => {
      safe(async () => {
        if (!state.player) return;
        if (tracksPanelOpen) {
          closeTracksPanel();
        } else {
          closeAllToolPanels();
          await openTracksPanel('audio'); // Default to audio tab
        }
        showHud();
      });
    });

    // BUILD 65: Speed button removed from control bar
    // el.videoSpeedBtn?.addEventListener('click', _toggleSpeedPanel);
    el.videoSpeedBtnTop?.addEventListener('click', _toggleSpeedPanel);
    el.videoQualityBtnTop?.addEventListener('click', () => {
      const cur = String(state.settings.renderQuality || 'auto');
      const next = (cur === 'auto') ? 'balanced' : (cur === 'balanced') ? 'high' : (cur === 'high') ? 'extreme' : 'auto';
      applyRenderQuality(next, { persist: true, announce: true });
    });
    el.videoInfoBtnTop?.addEventListener('click', () => {
      toggleDiagnosticsOverlay();
    });    el.videoSpeedDownBtn?.addEventListener('click', () => { cycleSpeed(-1); showHud(); });
    el.videoSpeedUpBtn?.addEventListener('click', () => { cycleSpeed(1); showHud(); });

    // Build 60: Wire up speed preset chips in the separate speed panel
    try {
      const speedPanelScope = el.videoSpeedPanel || document;
      speedPanelScope.querySelectorAll('.speedChipPanel')?.forEach((btn) => {
        btn.addEventListener('click', () => {
          const sp = Number(btn.getAttribute('data-speed'));
          if (Number.isFinite(sp)) setSpeedExact(sp);
          showHud();
        });
      });
    } catch {}

    // Wire up old speed chips in tracks panel (now removed, but keep for safety)
    try {
      const scope = el.videoTracksPanel || document;
      scope.querySelectorAll('.speedChip')?.forEach((btn) => {
        btn.addEventListener('click', () => {
          const sp = Number(btn.getAttribute('data-speed'));
          if (Number.isFinite(sp)) setSpeedExact(sp);
          showHud();
        });
      });
    } catch {}

    // Build 60: Single Tracks button opens unified tracks panel
    // BUILD 65: Removed from control bar - use context menu instead
    // el.videoTracksBtn?.addEventListener('click', () => {
    //   safe(async () => {
    //     if (!state.player) return;
    //     if (tracksPanelOpen) {
    //       closeTracksPanel();
    //     } else {
    //       closeAllToolPanels();
    //       await openTracksPanel('audio'); // Default focus on audio
    //     }
    //     showHud();
    //   });
    // });

    // Build 60: Keep old buttons for backwards compatibility / fallback paths
    el.videoSubsBtn?.addEventListener('click', () => {
      safe(async () => {
        if (!state.player) return;
        const caps = state.player?.capabilities || {};
        const hasTrackUi = !!(caps.tracks && typeof state.player.getSubtitleTracks === 'function');

        if (hasTrackUi) {
          if (tracksPanelOpen) closeTracksPanel();
          else { closeAllToolPanels(); await openTracksPanel('subs'); }
          showHud();
          return;
        }

        // Embedded libmpv fallback: toggle subtitles directly.
        if (typeof state.player.toggleSubtitles === 'function') {
          await state.player.toggleSubtitles();
          const st = state.player.getState?.();
          const on = (st && typeof st.subtitlesVisible === 'boolean') ? st.subtitlesVisible : null;
          hudNotice(on === null ? 'Subtitles toggled' : (on ? 'Subtitles on' : 'Subtitles off'));
          showHud();
          return;
        }

        if (typeof state.player.cycleSubtitleTrack === 'function') {
          await state.player.cycleSubtitleTrack();
          hudNotice('Subtitles: next');
          showHud();
          return;
        }

        hudNotice('Subtitles control unavailable');
        showHud();
      });
    });

    el.videoAudioBtn?.addEventListener('click', () => {
      safe(async () => {
        if (!state.player) return;
        const caps = state.player?.capabilities || {};
        const hasTrackUi = !!(caps.tracks && typeof state.player.getAudioTracks === 'function');

        if (hasTrackUi) {
          if (tracksPanelOpen) closeTracksPanel();
          else { closeAllToolPanels(); await openTracksPanel('audio'); }
          showHud();
          return;
        }

        // Embedded libmpv fallback: cycle audio tracks directly.
        if (typeof state.player.cycleAudioTrack === 'function') {
          await state.player.cycleAudioTrack();
          hudNotice('Audio: next');
          showHud();
          return;
        }

        hudNotice('Audio track switching unavailable');
        showHud();
      });
    });
    el.videoSubDelayBtn?.addEventListener('click', () => {
      safe(async () => {
        if (tracksPanelOpen) closeTracksPanel();
        else { closeAllToolPanels(); await openTracksPanel('subDelay'); }
        showHud();
      });
    });

    // Playlist button (restored)
    el.videoPlaylistBtn?.addEventListener('click', () => {
      togglePlaylistPanel();
      showHud();
    });
    el.videoPlaylistCloseBtn?.addEventListener('click', closePlaylistPanel);

    // Build 55: click outside any open panel closes it (prevents sticky overlays)
    document.addEventListener('mousedown', (e) => {
      const t = e.target;
      if (!t) return;

      const isInside = (node) => {
        try { return !!(node && node.contains && node.contains(t)); } catch { return false; }
      };

      // Playlist (big overlay)
      if (playlistPanelOpen) {
        if (isInside(el.videoPlaylistPanel) || isInside(el.videoPlaylistBtn)) return;
        closePlaylistPanel();
        showHud();
        return;
      }

      // Tracks panel
      if (tracksPanelOpen) {
        if (isInside(el.videoTracksPanel) || isInside(el.videoTracksBtn) || isInside(el.videoSubsBtn) || isInside(el.videoAudioBtn) || isInside(el.videoSubDelayBtn)) return;
        closeTracksPanel();
        showHud();
        return;
      }

      // Speed panel (Build 60)
      if (speedPanelOpen) {
        if (isInside(el.videoSpeedPanel) || isInside(el.videoSpeedBtn) || isInside(el.videoSpeedBtnTop)) return;
        closeSpeedPanel();
        showHud();
        return;
      }

      // Volume panel
      if (volPanelOpen) {
        if (isInside(el.videoVolPanel) || isInside(el.videoMuteBtn)) return;
        closeVolPanel();
        showHud();
        return;
      }
    }, true);


    if (el.videoAutoAdvanceToggle) {
      el.videoAutoAdvanceToggle.checked = !!state.settings.autoAdvance;
      el.videoAutoAdvanceToggle.addEventListener('change', () => {
        state.settings.autoAdvance = !!el.videoAutoAdvanceToggle.checked;
        persistVideoSettings({ autoAdvance: state.settings.autoAdvance });
      });
    }

    el.videoPrevEpBtn?.addEventListener('click', () => {
      const { prev } = getPrevNextEpisodes();
      if (prev) safe(() => openEpisodeFromPlaylist(prev));
    });
    el.videoNextEpBtn?.addEventListener('click', () => {
      const { next } = getPrevNextEpisodes();
      if (next) safe(() => openEpisodeFromPlaylist(next));
    });


    // Prev/Next buttons (restored)
    el.videoPrevHudBtn?.addEventListener('click', () => {
      const { prev } = getPrevNextEpisodes();
      if (prev) safe(() => openEpisodeFromPlaylist(prev));
      showHud();
    });
    el.videoNextHudBtn?.addEventListener('click', () => {
      const { next } = getPrevNextEpisodes();
      if (next) safe(() => openEpisodeFromPlaylist(next));
      showHud();
    });

    

    el.videoTracksCloseBtn?.addEventListener('click', () => { closeTracksPanel(); showHud(); });

    el.videoRespectSubStylesToggle?.addEventListener('change', () => {
      const on = !!el.videoRespectSubStylesToggle.checked;
      try { state.settings.respectSubtitleStyles = on; } catch {}
      persistVideoSettings({ respectSubtitleStyles: on });
      toast(on ? 'Subtitle styles: embedded' : 'Subtitle styles: clean');
      try { state.player?.setRespectSubtitleStyles?.(on); } catch {}
      showHud();
    });

    el.videoAudioTrackSelect?.addEventListener('change', () => {
  safe(async () => {
    if (!state.player || typeof state.player.setAudioTrack !== 'function') return;
    const selected = el.videoAudioTrackSelect.value;
    const id = (selected === '' || selected === 'auto') ? null : selected;

    try {
      await state.player.setAudioTrack(id);

      if (id === null) {
        // "Auto" selection clears the preference.
        saveSetting('preferredAudioLanguage', null);
      } else {
        const chosen = lastAudioTracks.find((t) => String(t.id) === String(id));
        if (chosen && typeof chosen.lang === 'string' && chosen.lang.trim()) {
          saveSetting('preferredAudioLanguage', chosen.lang.trim());
        } else {
          // Fallback for files whose tracks have no lang metadata.
          saveSetting('preferredAudioLanguage', `trackid:${String(id)}`);
        }
      }

      // Build 58: persist track selection per episode
      schedulePlaybackPreferencesSave();
    } catch (err) {
      console.error('[video] setAudioTrack failed', err);
      toast('Audio track change failed');
      await openTracksPanel('audio'); // re-sync UI to actual player state
    }
  });
  showHud();
});

    el.videoSubtitleTrackSelect?.addEventListener('change', () => {
  safe(async () => {
    if (!state.player || typeof state.player.setSubtitleTrack !== 'function') return;
    const selected = el.videoSubtitleTrackSelect.value;
    const id = (selected === '' || selected === 'auto' || selected === 'no') ? null : selected;

    try {
      await state.player.setSubtitleTrack(id);
      if (id !== null && id !== undefined) lastSubtitleTrackIdForToggle = id;
      if (id === null) toast('Subtitles off');
      else toast('Subtitles on');

      if (id === null) {
        // Persist explicit "off" (distinct from "no preference").
        saveSetting('preferredSubtitleLanguage', 'off');
      } else {
        const chosen = lastSubtitleTracks.find((t) => String(t.id) === String(id));
        if (chosen && typeof chosen.lang === 'string' && chosen.lang.trim()) {
          saveSetting('preferredSubtitleLanguage', chosen.lang.trim());
        } else {
          // Fallback for files whose tracks have no lang metadata.
          saveSetting('preferredSubtitleLanguage', `trackid:${String(id)}`);
        }
      }

      // Build 58: persist track selection per episode
      schedulePlaybackPreferencesSave();
    } catch (err) {
      console.error('[video] setSubtitleTrack failed', err);
      toast('Subtitle track change failed');
      await openTracksPanel('subs'); // re-sync UI to actual player state
    }
  });
  showHud();
});

    // Build 46 Step 1: render mode selection (hwnd vs canvas)
    // Tankoban Plus Build 5.4B: audio/subtitle delay nudges (mpv only)
    el.videoAudioDelayMinusBtn?.addEventListener('click', () => { safe(() => nudgeDelay('audio', -1)); showHud(); });
    el.videoAudioDelayPlusBtn?.addEventListener('click', () => { safe(() => nudgeDelay('audio', +1)); showHud(); });
    el.videoSubtitleDelayMinusBtn?.addEventListener('click', () => { safe(() => nudgeDelay('subtitle', -1)); showHud(); });
    el.videoSubtitleDelayPlusBtn?.addEventListener('click', () => { safe(() => nudgeDelay('subtitle', +1)); showHud(); });


// Tankoban Plus Build 5.4C: aspect/crop presets + reset (mpv only)
el.videoAspectSelect?.addEventListener('change', () => {
  safe(async () => {
    if (!state.player || typeof state.player.setAspectRatio !== 'function') return;
    const v = String(el.videoAspectSelect.value || 'auto');
    const r = await state.player.setAspectRatio(v);
    if (r && r.ok === false) { toast(r.error || 'Failed to set aspect'); return; }
    cachedAspectMode = v;
    syncTransformsUi();
    toast(v === 'auto' ? 'Aspect reset' : `Aspect ${v}`);
  });
  showHud();
});

el.videoCropSelect?.addEventListener('change', () => {
  safe(async () => {
    if (!state.player || typeof state.player.setCrop !== 'function') return;
    const v = String(el.videoCropSelect.value || 'none');
    const r = await state.player.setCrop(v);
    if (r && r.ok === false) { toast(r.error || 'Failed to set crop'); return; }
    cachedCropMode = v;
    syncTransformsUi();
    toast(v === 'none' ? 'Crop cleared' : `Crop ${v}`);
  });
  showHud();
});

el.videoResetTransformsBtn?.addEventListener('click', () => {
  safe(async () => {
    if (!state.player || typeof state.player.resetVideoTransforms !== 'function') return;
    const r = await state.player.resetVideoTransforms();
    if (r && r.ok === false) { toast(r.error || 'Failed to reset transforms'); return; }
    cachedAspectMode = 'auto';
    cachedCropMode = 'none';
    syncTransformsUi();
    toast('Transforms reset');
  });
  showHud();
});

    // Timeline scrub (reader-style)
    el.videoScrub?.addEventListener('pointerdown', (e) => {
      if (!state.player) return;

      // cache geometry for this drag
      try {
        const track = el.videoScrubTrack || el.videoScrub;
        const rect = track.getBoundingClientRect();
        videoScrubDragLeft = rect.left;
        videoScrubDragWidth = rect.width || 1;
      } catch {
        videoScrubDragLeft = 0;
        videoScrubDragWidth = 0;
      }

      videoScrubDragging = true;
      state.seekDragging = true;
      state._nudgeSeekPreviewing = false; // cancel key nudge preview

      try { el.videoScrub.classList.add('dragging'); } catch {}
      try { el.videoScrub.setPointerCapture(e.pointerId); } catch {}
      previewScrubAtClientX(e.clientX);
    });

    el.videoScrub?.addEventListener('pointermove', (e) => {
      if (!videoScrubDragging) return;
      videoScrubPendingClientX = e.clientX;
      if (videoScrubMoveRaf) return;
      videoScrubMoveRaf = requestAnimationFrame(() => {
        videoScrubMoveRaf = 0;
        if (!videoScrubDragging) return;
        if (typeof videoScrubPendingClientX === 'number') previewScrubAtClientX(videoScrubPendingClientX);
      });
    });

    el.videoScrub?.addEventListener('pointerup', (e) => {
      if (!videoScrubDragging) return;
      videoScrubDragging = false;
      try { el.videoScrub.releasePointerCapture(e.pointerId); } catch {}
      try { el.videoScrub.classList.remove('dragging'); } catch {}

      // final preview at release position, then commit
      previewScrubAtClientX(e.clientX);
      commitSeekFromScrub('pointerup');
    });

    el.videoScrub?.addEventListener('pointercancel', (e) => {
      if (!videoScrubDragging) return;
      videoScrubDragging = false;
      try { el.videoScrub.releasePointerCapture(e.pointerId); } catch {}
      try { el.videoScrub.classList.remove('dragging'); } catch {}

      // cancel: revert HUD sync on next poll
      state.seekDragging = false;
      state.seekPreviewSec = null;
      showHud();
    });

    el.videoScrub?.addEventListener('lostpointercapture', () => {
      if (!videoScrubDragging) return;
      videoScrubDragging = false;
      try { el.videoScrub.classList.remove('dragging'); } catch {}
      commitSeekFromScrub('lostpointercapture');
    });

    window.addEventListener('blur', () => {
      if (!videoScrubDragging) return;
      videoScrubDragging = false;
      try { el.videoScrub.classList.remove('dragging'); } catch {}
      state.seekDragging = false;
      state.seekPreviewSec = null;
    });

    // Optional: wheel seeking on the scrub bar
    el.videoScrub?.addEventListener('wheel', (e) => {
      if (!state.player) return;
      e.preventDefault();
      const dir = (e.deltaY > 0) ? 1 : -1;
      seekBy(dir * 10);
    }, { passive: false });

    // Volume (Build 14: UI updates instantly; mpv writes are throttled while dragging)
    el.videoVol?.addEventListener('pointerdown', () => {
      state._volDragActive = true;
      state._volUnmutedSent = false;
      showHud();
    });
    el.videoVol?.addEventListener('pointerup', () => {
      state._volDragActive = false;
      flushVolumeToPlayer();
      showHud();
    });
    el.videoVol?.addEventListener('input', () => {
      if (!state.player) return;
      const v = clamp(Number(el.videoVol.value) / 100, 0, 1);
      state.settings.volume = v;
      state.settings.muted = false;
      if (el.videoMuteBtn) el.videoMuteBtn.textContent = '🔊';
      queueVolumeToPlayer(v);
      persistVideoSettings({ volume: v, muted: false });
      showHud();
    });
    el.videoVol?.addEventListener('change', () => {
      state._volDragActive = false;
      flushVolumeToPlayer();
      showHud();
    });

    // Resume prompt buttons
    el.videoResumeBtn?.addEventListener('click', () => resumeChoice('resume'));
    el.videoRestartBtn?.addEventListener('click', () => resumeChoice('restart'));
  }

  
function bindKeyboard(){
    const parseTimeToSeconds = (raw) => {
      const s = String(raw || '').trim();
      if (!s) return null;

      // seconds (integer/float)
      if (/^\d+(?:\.\d+)?$/.test(s)) {
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
      }

      // mm:ss or hh:mm:ss
      if (/^\d+\s*:\s*\d{1,2}(?:\s*:\s*\d{1,2})?$/.test(s)) {
        const parts = s.split(':').map(p => Number(String(p).trim()));
        if (parts.some(n => !Number.isFinite(n))) return null;
        if (parts.length === 2) return (parts[0] * 60) + parts[1];
        if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
      }

      return null;
    };

    const cycleAudioTrackHotkey = async () => {
      if (!state.player) return;
      try {
        if (typeof state.player.cycleAudioTrack === 'function') {
          const r = await state.player.cycleAudioTrack();
          if (r && r.ok === false) hudNotice('Audio track cycle failed');
          else hudNotice('Audio track: next');
          return;
        }

        if (typeof state.player.getAudioTracks === 'function' && typeof state.player.getCurrentAudioTrack === 'function' && typeof state.player.setAudioTrack === 'function') {
          const a = await state.player.getAudioTracks();
          const tracks = (a && a.tracks) ? a.tracks : [];
          if (!tracks.length) { hudNotice('No alternate audio tracks'); return; }

          const cur = await state.player.getCurrentAudioTrack();
          const curId = (cur && typeof cur === 'object' && 'value' in cur) ? cur.value : cur;

          const ids = tracks.map(t => String(t.id));
          const curIdx = ids.findIndex(id => String(id) === String(curId));
          const nextIdx = (curIdx < 0 ? 0 : (curIdx + 1) % ids.length);
          const nextId = ids[nextIdx];

          await state.player.setAudioTrack(nextId);
          const chosen = tracks.find(t => String(t.id) === String(nextId));
          if (chosen && chosen.lang) saveSetting('preferredAudioLanguage', chosen.lang);
          hudNotice(`Audio: ${chosen ? (chosen.label || chosen.lang || nextId) : nextId}`);
          return;
        }

        hudNotice('Audio track cycling unavailable in this mode');
      } catch (err) {
        console.error('[video] cycleAudioTrack failed', err);
        hudNotice('Audio track cycle failed');
      }
    };

    const cycleSubtitleTrackHotkey = async () => {
      if (!state.player) return;
      try {
        if (typeof state.player.cycleSubtitleTrack === 'function') {
          const r = await state.player.cycleSubtitleTrack();
          if (r && r.ok === false) hudNotice('Subtitle track cycle failed');
          else hudNotice('Subtitles: next');
          return;
        }

        if (typeof state.player.getSubtitleTracks === 'function' && typeof state.player.getCurrentSubtitleTrack === 'function' && typeof state.player.setSubtitleTrack === 'function') {
          const s = await state.player.getSubtitleTracks();
          const tracks = (s && s.tracks) ? s.tracks : [];
          const cur = await state.player.getCurrentSubtitleTrack();
          const curId = (cur && typeof cur === 'object' && 'value' in cur) ? cur.value : cur;

          // Include "off" (null) as the first step in the cycle.
          const ids = ['__off__'].concat(tracks.map(t => String(t.id)));
          const curKey = (curId === null || curId === undefined) ? '__off__' : String(curId);
          const curIdx = ids.findIndex(id => id === curKey);
          const nextIdx = (curIdx < 0 ? 0 : (curIdx + 1) % ids.length);
          const nextKey = ids[nextIdx];

          if (nextKey === '__off__') {
            if (curId !== null && curId !== undefined) lastSubtitleTrackIdForToggle = curId;
            await state.player.setSubtitleTrack(null);
            hudNotice('Subtitles off');
            return;
          }

          const nextId = nextKey;
          await state.player.setSubtitleTrack(nextId);
          lastSubtitleTrackIdForToggle = nextId;

          const chosen = tracks.find(t => String(t.id) === String(nextId));
          if (chosen && chosen.lang) saveSetting('preferredSubtitleLanguage', chosen.lang);
          hudNotice(`Subs: ${chosen ? (chosen.label || chosen.lang || nextId) : nextId}`);
          return;
        }

        hudNotice('Subtitle track cycling unavailable in this mode');
      } catch (err) {
        console.error('[video] cycleSubtitleTrack failed', err);
        hudNotice('Subtitle track cycle failed');
      }
    };

    const toggleSubtitlesHotkey = async () => {
      if (!state.player) return;
      try {
        if (typeof state.player.toggleSubtitles === 'function') {
          const r = await state.player.toggleSubtitles();
          if (r && r.ok === false) hudNotice('Subtitles toggle failed');
          else hudNotice('Subtitles toggled');
          return;
        }

        if (typeof state.player.getCurrentSubtitleTrack === 'function' && typeof state.player.setSubtitleTrack === 'function') {
          const cur = await state.player.getCurrentSubtitleTrack();
          const curId = (cur && typeof cur === 'object' && 'value' in cur) ? cur.value : cur;

          if (curId !== null && curId !== undefined) {
            lastSubtitleTrackIdForToggle = curId;
            await state.player.setSubtitleTrack(null);
            hudNotice('Subtitles off');
            return;
          }

          // turn back on: prefer last selected track; fallback to first available track
          let target = lastSubtitleTrackIdForToggle;
          if ((target === null || target === undefined) && typeof state.player.getSubtitleTracks === 'function') {
            const s = await state.player.getSubtitleTracks();
            const tracks = (s && s.tracks) ? s.tracks : [];
            if (tracks.length) target = String(tracks[0].id);
          }

          if (target === null || target === undefined) { hudNotice('No subtitles available'); return; }
          await state.player.setSubtitleTrack(target);
          lastSubtitleTrackIdForToggle = target;
          hudNotice('Subtitles on');
          return;
        }

        hudNotice('Subtitles toggle unavailable in this mode');
      } catch (err) {
        console.error('[video] toggleSubtitles failed', err);
        hudNotice('Subtitles toggle failed');
      }
    };

    const resetSubtitleDelayHotkey = async () => {
      if (!state.player) return;
      const caps = state.player.capabilities || {};
      if (!caps.delays || typeof state.player.setSubtitleDelay !== 'function') {
        hudNotice('Subtitle sync not supported in this mode');
        return;
      }
      try {
        await state.player.setSubtitleDelay(0);
        cachedSubtitleDelaySec = 0;
        hudNotice('Subtitle delay reset');
        // Build 61: persist delay reset per episode
        schedulePlaybackPreferencesSave();
      } catch (err) {
        console.error('[video] resetSubtitleDelay failed', err);
        hudNotice('Subtitle delay reset failed');
      }
    };

    // BUILD40B: Arrow keys call nudgeVolume; keep it explicit and local.
    const nudgeVolume = (delta) => {
      try { adjustVolume(delta); } catch (err) { console.error('[video] nudgeVolume failed', err); }
    };

    const onKeyDown = async (e) => {
      if (state.mode !== 'videos') return;

      const tag = (e.target && e.target.tagName) ? String(e.target.tagName).toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;

      const key = String(e.key || '');
      const lower = key.toLowerCase();
      
      // BUILD 69: Backspace navigation - works everywhere in video mode
      if (key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        
        const inPlayer = document.body.classList.contains('inVideoPlayer');
        
        // If in player, go back to library/show
        if (inPlayer) {
          closeOrBackFromPlayer();
          return;
        }
        
        // If in show view, go back to home
        if (state.videoSubView === 'show') {
          goVideoHome();
          return;
        }
        
        // Already at library home, do nothing
        return;
      }

      const inPlayer = document.body.classList.contains('inVideoPlayer');

      // Video library tips overlay (K when NOT in player)
      if (!inPlayer) {
        if (lower === 'k') { e.preventDefault(); e.stopPropagation(); toggleVideoLibTipsOverlay(); return; }
        if (videoLibTipsOpen) {
          if (key === 'Escape') { e.preventDefault(); e.stopPropagation(); toggleVideoLibTipsOverlay(false); return; }
          return; // swallow keys while open
        }
        return;
      }

      if (key === 'Escape') {
        // BUILD41B: Escape must exit fullscreen (and never toggle into fullscreen).
        let isFs = false;
        try { isFs = !!(await Tanko.api.window.isFullscreen()); } catch {}
        if (isFs) {
          e.preventDefault();
          e.stopPropagation();
          try {
            if (typeof toggleFullscreen === 'function') await toggleFullscreen();
            else await Tanko.api.window.toggleFullscreen();
          } catch {}
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        const diagnosticsOn = !!(el.videoDiagnostics && !el.videoDiagnostics.classList.contains('hidden'));
        if (ctxMenuOpen) { closeVideoCtxMenu(); showHud(); return; }
        if (diagnosticsOn) { setDiagnosticsVisible(false); showHud(); return; }
        if (playlistPanelOpen) { closePlaylistPanel(); showHud(); return; }
        if (tracksPanelOpen) { closeTracksPanel(); showHud(); return; }        if (volPanelOpen) { closeVolPanel(); showHud(); return; }
        closeHud();
        return;
      }

      if (!state.player) return;

      // Alt hotkeys (do these before plain-letter keys like 'h' / 'l')
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (lower === 'a') {
          e.preventDefault(); e.stopPropagation();
          await cycleAudioTrackHotkey();
          showHud();
          return;
        }
        if (lower === 'h') {
          e.preventDefault(); e.stopPropagation();
          await toggleSubtitlesHotkey();
          showHud();
          return;
        }
        if (lower === 'l') {
          e.preventDefault(); e.stopPropagation();
          await cycleSubtitleTrackHotkey();
          showHud();
          return;
        }
      }


      // BUILD41C: quick track cycling keys (only when not typing in inputs)
      // A = next audio track, S = next subtitle track
      if (!e.altKey && !e.ctrlKey && !e.metaKey) {
        if (lower === 'a') {
          e.preventDefault(); e.stopPropagation();
          await cycleAudioTrackHotkey();
          showHud();
          return;
        }
        if (lower === 's') {
          e.preventDefault(); e.stopPropagation();
          await cycleSubtitleTrackHotkey();
          showHud();
          return;
        }
      }
      // Jump to time (G)
      if (!e.altKey && !e.ctrlKey && !e.metaKey && lower === 'g') {
        e.preventDefault(); e.stopPropagation();
        const input = window.prompt('Go to time (seconds, mm:ss, or hh:mm:ss):', '');
        const sec = parseTimeToSeconds(input);
        if (sec === null) { hudNotice('Invalid time'); showHud(); return; }
        let dur = null;
        if (typeof state.player.getDuration === 'function') {
          try {
            const d = await state.player.getDuration();
            dur = (d && typeof d === 'object' && 'value' in d) ? d.value : d;
          } catch {}
        }
        const target = (Number.isFinite(Number(dur)) && Number(dur) > 0) ? Math.min(Math.max(0, sec), Number(dur)) : Math.max(0, sec);
        try {
          await state.player.seekTo(target);
          hudNotice(`Jumped to ${fmtTime(target)}`);
        } catch (err) {
          console.error('[video] seekTo failed', err);
          hudNotice('Jump failed');
        }
        showHud();
        return;
      }

      // Playback speed (C/X/Z)
      if (!e.altKey && !e.ctrlKey && !e.metaKey) {
        if (lower === 'c') { e.preventDefault(); e.stopPropagation(); cycleSpeed(+1); return; }
        if (lower === 'x') { e.preventDefault(); e.stopPropagation(); cycleSpeed(-1); return; }
        if (lower === 'z') { e.preventDefault(); e.stopPropagation(); setSpeedExact(1.0); return; }
      }

      // Subtitle sync (>, <, /)
      if (!e.altKey && !e.ctrlKey && !e.metaKey) {
        if (key === '>') { e.preventDefault(); e.stopPropagation(); nudgeDelay('subtitle', +1); return; }
        if (key === '<') { e.preventDefault(); e.stopPropagation(); nudgeDelay('subtitle', -1); return; }
        if (key === '/') { e.preventDefault(); e.stopPropagation(); await resetSubtitleDelayHotkey(); showHud(); return; }
      }

      if (key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        
        // BUILD63: Cancel auto-advance countdown if active
        if (state._autoAdvanceCountdownTimer || state._autoAdvancePlayTimer) {
          if (state._autoAdvanceCountdownTimer) {
            clearInterval(state._autoAdvanceCountdownTimer);
            state._autoAdvanceCountdownTimer = null;
          }
          if (state._autoAdvancePlayTimer) {
            clearTimeout(state._autoAdvancePlayTimer);
            state._autoAdvancePlayTimer = null;
          }
          hudNotice('Auto-advance cancelled');
          showHud();
          return;
        }
        
        await state.player.togglePlay();
        showHud();
        return;
      }

      if (key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        const big = !!(e.ctrlKey || e.metaKey || e.shiftKey);
        seekBy(-(big ? state.settings.seekBigSec : state.settings.seekSmallSec));
        return;
      }
      if (key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        const big = !!(e.ctrlKey || e.metaKey || e.shiftKey);
        seekBy(+(big ? state.settings.seekBigSec : state.settings.seekSmallSec));
        return;
      }

      if (key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        nudgeVolume(+0.05);
        return;
      }
      if (key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        nudgeVolume(-0.05);
        return;
      }

      if (lower === 'm') {
        e.preventDefault();
        e.stopPropagation();
        toggleMute();
        return;
      }

      if (key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof toggleFullscreen === 'function') toggleFullscreen();
        return;
      }

      if (lower === 'f') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof toggleFullscreen === 'function') toggleFullscreen();
        return;
      }

      // BUILD40A: no separate "hide UI" mode. Only normal vs fullscreen.

      // Speed quick keys (keep as alternates)
      if (key === ']') { e.preventDefault(); e.stopPropagation(); cycleSpeed(+1); return; }
      if (key === '[') { e.preventDefault(); e.stopPropagation(); cycleSpeed(-1); return; }
      if (key === '\\') { e.preventDefault(); e.stopPropagation(); setSpeedExact(1.0); return; }

      if (lower === 'j') { e.preventDefault(); e.stopPropagation(); seekBy(-10); return; }
      if (lower === 'l') { e.preventDefault(); e.stopPropagation(); seekBy(+10); return; }

      // BUILD62: Playlist navigation (N = next episode, P = previous episode)
      if (!e.altKey && !e.ctrlKey && !e.metaKey) {
        if (lower === 'n') {
          e.preventDefault(); e.stopPropagation();
          const { next } = getPrevNextEpisodes();
          if (next) {
            safe(() => openEpisodeFromPlaylist(next));
            hudNotice('Next episode');
          } else {
            hudNotice('No next episode');
          }
          showHud();
          return;
        }
        if (lower === 'p') {
          e.preventDefault(); e.stopPropagation();
          const { prev } = getPrevNextEpisodes();
          if (prev) {
            safe(() => openEpisodeFromPlaylist(prev));
            hudNotice('Previous episode');
          } else {
            hudNotice('No previous episode');
          }
          showHud();
          return;
        }
      }

    };

    const onKeyUp = (e) => {
      if (state.mode !== 'videos') return;
      const inPlayer = document.body.classList.contains('inVideoPlayer');
      if (!inPlayer) return;

      const tag = (e.target && e.target.tagName) ? String(e.target.tagName).toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;

      const key = String(e.key || '');
      if (key === ' ' || key === 'Enter') {
        // Prevent default "button click" activation when controls have focus.
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);

    // BUILD40A: if fullscreen is toggled outside our key path (menu/OS), keep CSS in sync.
    window.addEventListener('resize', () => {
      if (!document.body.classList.contains('inVideoPlayer')) return;
      safe(() => syncFullscreenUi());
    }, { passive: true });
  }

    function updateQtToggleUi() {
      // QT_ONLY: Embedded player is retired. Keep the UI indicator, but disable toggling.
      try {
        if (el.qtPlayerToggleBtn) {
          el.qtPlayerToggleBtn.classList.add('active');
          el.qtPlayerToggleBtn.textContent = 'Qt';
          el.qtPlayerToggleBtn.title = 'Qt player (always on)';
          try { el.qtPlayerToggleBtn.setAttribute('disabled', 'disabled'); } catch {}
          try { el.qtPlayerToggleBtn.style.pointerEvents = 'none'; } catch {}
        }
      } catch {}
    }

    function bind() {
    bindModeButtons();
    // BUILD14: Listen for player exit event to restore state
    try {
      if (window.Tanko && window.Tanko.on && typeof window.Tanko.on === 'function') {
        window.Tanko.on('build14:playerExited', async (payload) => {
          console.log('[BUILD14] Player exited, restoring state...', payload);
          
          try {
            // Get saved state from main process
            const api = (window && window.Tanko && window.Tanko.api) ? window.Tanko.api : null;
            if (api && api.build14 && typeof api.build14.getReturnState === 'function') {
              const result = await api.build14.getReturnState();
              if (result && result.ok && result.state) {
                // Restore state using Build14State module
                const stateModule = window.Build14State;
                if (stateModule && typeof stateModule.restoreState === 'function') {
                  const helpers = {
                    setMode: (m) => setMode(m),
                    openVideoShow: (sid) => openVideoShow(sid),
                  };
                  await stateModule.restoreState(result.state, state, helpers);
                }
              }
            }
            // BUILD16: If main process synced Qt progress on exit, merge it into renderer cache immediately.
            try {
              const s = payload && payload.synced ? payload.synced : null;
              if (s && s.videoId && s.progress) {
                state.progress = (state.progress && typeof state.progress === 'object') ? state.progress : {};
                state.progress[String(s.videoId)] = { ...s.progress, updatedAt: Date.now() };
              }
            } catch {}

            // FIX19: Refresh progress-driven UI immediately (Continue Watching + current view)
            try {
              rebuildVideoProgressSummaryCache();
            } catch {}
            try { renderContinue(); } catch {}
            try {
              if (state && state.videoSubView === 'show') renderVideoShowView();
              else if (state && state.videoSubView === 'home') renderVideoHome();
            } catch {}
          } catch (e) {
            console.error('[BUILD14] Failed to restore state after player exit:', e);
          }
        });
      }
    } catch (e) {
      console.error('[BUILD14] Failed to setup player exit listener:', e);
    }
    
    // Mode buttons
    el.modeComicsBtn?.addEventListener('click', () => setMode('comics'));
    el.modeVideosBtn?.addEventListener('click', () => setMode('videos'));

    // QT_ONLY: toggle disabled (embedded player retired)
    updateQtToggleUi();

    // Video library UI bindings (BUILD 97)
    el.videoAddFolderBtn?.addEventListener('click', async () => {
      safe(async () => {
        const r = await Tanko.api.video.addFolder();
        if (r && r.idx) {
          state.roots = r.idx.roots || [];
          state.shows = r.idx.shows || [];
          state.videos = r.idx.episodes || [];
          state.episodes = state.videos;
          buildEpisodesByShowId();
          rebuildVideoSearchIndex();
          rebuildVideoProgressSummaryCache();
          renderVideoFolders();
          renderVideoHome();
          renderContinue();
          toast('Root folder added');
        }
      });
    });

    el.videoAddShowFolderBtn?.addEventListener('click', async () => {
      safe(async () => {
        const r = await Tanko.api.video.addShowFolder();
        if (r && r.idx) {
          state.roots = r.idx.roots || [];
          state.shows = r.idx.shows || [];
          state.videos = r.idx.episodes || [];
          state.episodes = state.videos;
          buildEpisodesByShowId();
          rebuildVideoSearchIndex();
          rebuildVideoProgressSummaryCache();
          renderVideoFolders();
          renderVideoHome();
          renderContinue();
          toast('Show folder added');
        }
      });
    });

    el.videoAddFilesBtn?.addEventListener('click', async () => {
      safe(async () => {
        const r = await Tanko.api.video.addFiles();
        if (r && r.idx) {
          state.roots = r.idx.roots || [];
          state.shows = r.idx.shows || [];
          state.videos = r.idx.episodes || [];
          state.episodes = state.videos;
          buildEpisodesByShowId();
          rebuildVideoSearchIndex();
          rebuildVideoProgressSummaryCache();
          renderVideoFolders();
          renderVideoHome();
          renderContinue();
          toast('Files added');
        }
      });
    });

    el.videoRestoreHiddenBtn?.addEventListener('click', async () => {
      safe(async () => {
        const r = await Tanko.api.video.restoreAllHiddenShows();
        if (r && r.idx) {
          state.roots = r.idx.roots || [];
          state.shows = r.idx.shows || [];
          state.videos = r.idx.episodes || [];
          state.episodes = state.videos;
          buildEpisodesByShowId();
          rebuildVideoSearchIndex();
          rebuildVideoProgressSummaryCache();
          renderVideoFolders();
          renderVideoHome();
          renderContinue();
          toast('Hidden shows restored');
        }
      });
    });

    el.videoOpenFileBtn?.addEventListener('click', async () => {
      safe(async () => {
        const res = await Tanko.api.video.openFileDialog();
        if (res && res.video) openVideo(res.video);
      });
    });

    el.videoRefreshBtn?.addEventListener('click', () => {
      toast('Rescanning videos...', 1200);
      safe(() => Tanko.api.video.scan({ force: true }));
    });

    el.videoShowBackBtn?.addEventListener('click', () => {
      goVideoHome();
    });

    el.videoEpOpenBtn?.addEventListener('click', () => {
      if (!state.selectedEpisodeId) return;
      const ep = getEpisodeById(state.selectedEpisodeId);
      if (ep) safe(() => openVideo(ep));
    });

    el.videoEpSearch?.addEventListener('input', () => {
      state.epSearch = String(el.videoEpSearch.value || '');
      renderVideoShowView();
      persistVideoUiState();
    });

    el.clearVideoEpSearch?.addEventListener('click', () => {
      state.epSearch = '';
      if (el.videoEpSearch) el.videoEpSearch.value = '';
      renderVideoShowView();
      persistVideoUiState();
    });

    el.videoEpSort?.addEventListener('change', () => {
      state.epSort = String(el.videoEpSort.value || 'title_asc');
      renderVideoShowView();
      persistVideoUiState();
    });

    el.videoEpHidePreviewToggle?.addEventListener('change', () => {
      state.epHidePreview = !!el.videoEpHidePreviewToggle.checked;
      if (el.videoEpisodesWrap) el.videoEpisodesWrap.classList.toggle('previewHidden', state.epHidePreview);
      persistVideoUiState();
    });

    el.videoHideWatchedToggle?.addEventListener('change', () => {
      state.hideWatchedShows = !!el.videoHideWatchedToggle.checked;
      renderContinue();
      persistVideoUiState();
    });

    el.videoScanCancel?.addEventListener('click', () => {
      safe(() => Tanko.api.video.cancelScan());
    });

    // Listen to video scan events
    safe(() => {
      if (Tanko.api.video.onScanStatus) {
        let _scanWasRunning = false;
        let _scanLastPhase = '';
        let _thumbSummaryToastKey = '';
        Tanko.api.video.onScanStatus((status) => {
          const scanningNow = !!(status && status.scanning);
          const phase = String((status && status.phase) || 'scan');

          if (scanningNow && !_scanWasRunning) {
            toast('Rescanning videos...', 1200);
          }
          if (scanningNow && phase === 'thumbnails' && _scanLastPhase !== 'thumbnails') {
            toast('Generating show thumbnails...', 1600);
          }
          if (scanningNow && phase === 'thumbnails' && status && status.completed) {
            const gen = Number(status.generated || 0);
            const cand = Number(status.candidates || 0);
            const key = `${gen}/${cand}`;
            if (key !== _thumbSummaryToastKey) {
              _thumbSummaryToastKey = key;
              toast(`Show thumbnails: ${gen}/${cand} generated`, 2200);
            }
          }
          if (!scanningNow && _scanWasRunning) {
            toast('Video rescan complete', 1200);
          }

          _scanWasRunning = scanningNow;
          _scanLastPhase = scanningNow ? phase : '';

          if (el.videoScanPill && el.videoScanText) {
            // Toast-only UX: keep the persistent scan pill hidden to avoid sticky layout noise.
            el.videoScanPill.classList.add('hidden');
          }
        });
      }

      if (Tanko.api.video.onUpdated) {
        let pendingVideoUpdate = null;
        let videoUpdateTimer = null;

        const flushVideoUpdate = () => {
          videoUpdateTimer = null;
          const result = pendingVideoUpdate;
          pendingVideoUpdate = null;
          if (!result || !result.idx) return;

          // Coalesce rapid scan/update bursts into one heavy rebuild + render pass.
          state.roots = result.idx.roots || [];
          state.shows = result.idx.shows || [];
          state.videos = result.idx.episodes || [];
          state.episodes = state.videos;
          buildEpisodesByShowId();
          rebuildVideoSearchIndex();
          rebuildVideoProgressSummaryCache();
          if (state.mode === 'videos') {
            renderVideoFolders();
            if (state.videoSubView === 'home') renderVideoHome();
            else if (state.videoSubView === 'show' && state.selectedShowId) renderVideoShowView();
            renderContinue();
          }
          scheduleAutoPosterSweep();
        };

        Tanko.api.video.onUpdated((result) => {
          if (!result || !result.idx) return;
          pendingVideoUpdate = result;
          if (videoUpdateTimer) return;
          videoUpdateTimer = setTimeout(flushVideoUpdate, 140);
        });

      if (Tanko.api.videoProgress.onUpdated) {
        Tanko.api.videoProgress.onUpdated((payload) => {
          if (!payload) return;
          if (!state.progress || typeof state.progress !== 'object') state.progress = {};
          let touchedShowId = '';
          let needsFullRebuild = false;
          if (payload.allCleared) {
            state.progress = {};
            needsFullRebuild = true;
          } else if (payload.videoId) {
            const vid = String(payload.videoId);
            if (payload.progress) state.progress[vid] = payload.progress;
            else delete state.progress[vid];
            try {
              const ep = state.episodeById?.get?.(vid) || null;
              touchedShowId = String(ep?.showId || '');
            } catch { touchedShowId = ''; }
          }
          scheduleProgressUiRefresh({ needsFull: needsFullRebuild, showId: touchedShowId });
        });
      }

      }
    });

    // Player
    el.videoBackBtn?.addEventListener('click', () => {
      // Build 56C: do not block navigation on save attempts
      try { const p = saveNow(true); if (p && typeof p.then === 'function') p.catch(() => {}); } catch {}
      setDiagnosticsVisible(false);
      if (IS_VIDEO_SHELL) { safe(() => showVideoLibrary()); safe(() => Tanko.api.window.close()); return; }
      showVideoLibrary();
    });

    // Main-process events: keep only shell play (player entry).
    safe(() => {
      if (Tanko.api.video.onShellPlay) {
        Tanko.api.video.onShellPlay((payload) => {
          if (IS_VIDEO_SHELL) {
            state._pendingShellPlay = payload && typeof payload === 'object' ? payload : { video: payload };
            tryStartPendingShellPlay();
            return;
          }

          const p = payload && typeof payload === 'object' ? payload : { video: payload };
          const v = (p.video && typeof p.video === 'object') ? p.video : null;
          if (!v || !v.path) return;

          // Tankoban Pro V2: Optional external Qt player (file-based progress bridge).
          // Enable by setting localStorage key: tankobanUseQtPlayer = '1'
          // NOTE: This handler is not async; do not use await here.
          try {
            const useQt = (typeof localStorage !== 'undefined' && localStorage.getItem('tankobanUseQtPlayer') === '1');
            const api = (window && window.Tanko && window.Tanko.api) ? window.Tanko.api : null;
            if (useQt && api && api.player && typeof api.player.launchQt === 'function') {
              const sessionId = String(Date.now());
              const start = (p && Number.isFinite(Number(p.resumeOverridePosSec))) ? Number(p.resumeOverridePosSec) : 0;
              try { toast('Opening in Qt player…', 1200); } catch {}
              try { api.player.launchQt({ filePath: String(v.path), startSeconds: start, sessionId }); } catch {}
              return;
            }
          } catch {}
          safe(() => openVideo(v, p));
        });
      }
    });

    // QT_ONLY: No embedded player UI wiring.
    bindKeyboard();
  }




  // BUILD40_S5_VIDEO_GLOBAL_SEARCH: Top-bar global search support while in Videos mode.
  // volume_nav_overlay.js branches the existing global search input to these handlers.
  let videoGlobalSearchItems = [];
  let videoSearchIndex = null;
  let videoSearchIndexGeneration = 0;

  function videoSearchNorm(s) {
    return String(s || '').toLowerCase();
  }

  function videoTokenize(s) {
    return videoSearchNorm(s).split(/[^a-z0-9]+/g).filter(Boolean);
  }

  function videoIndexAdd(map, key, id) {
    if (!key) return;
    let set = map.get(key);
    if (!set) { set = new Set(); map.set(key, set); }
    set.add(id);
  }

  function videoIndexEntry(id, item, fields) {
    const tokens = new Set();
    for (const f of fields) for (const t of videoTokenize(f)) tokens.add(t);
    return {
      id,
      item,
      tokens,
      showNorm: videoSearchNorm(fields[0]),
      titleNorm: videoSearchNorm(fields[1]),
      fileNorm: videoSearchNorm(fields[2]),
      pathNorm: videoSearchNorm(fields[3]),
    };
  }

  function rebuildVideoSearchIndex() {
    videoSearchIndexGeneration += 1;
    const shows = Array.isArray(state.shows) ? state.shows : [];
    const episodes = Array.isArray(state.videos) ? state.videos : [];

    const next = {
      generation: videoSearchIndexGeneration,
      showById: new Map(),
      episodeById: new Map(),
      showTokenMap: new Map(),
      showPrefixMap: new Map(),
      episodeTokenMap: new Map(),
      episodePrefixMap: new Map(),
    };

    for (const s of shows) {
      const id = String(s?.id || '');
      if (!id) continue;
      const entry = videoIndexEntry(id, s, [s?.name, '', '', s?.path]);
      next.showById.set(id, entry);
      for (const t of entry.tokens) {
        videoIndexAdd(next.showTokenMap, t, id);
        for (let i = 1, m = Math.min(t.length, 12); i <= m; i++) videoIndexAdd(next.showPrefixMap, t.slice(0, i), id);
      }
    }

    for (const ep of episodes) {
      const id = String(ep?.id || '');
      if (!id) continue;
      const file = basename(String(ep?.path || ''));
      const showName = String(getShowById(ep?.showId)?.name || '');
      const entry = videoIndexEntry(id, ep, [showName, ep?.title, file, ep?.path]);
      next.episodeById.set(id, entry);
      for (const t of entry.tokens) {
        videoIndexAdd(next.episodeTokenMap, t, id);
        for (let i = 1, m = Math.min(t.length, 12); i <= m; i++) videoIndexAdd(next.episodePrefixMap, t.slice(0, i), id);
      }
    }

    videoSearchIndex = next;
  }

  function videoIntersect(sets) {
    if (!sets.length) return null;
    const sorted = sets.slice().sort((a, b) => a.size - b.size);
    const out = new Set(sorted[0]);
    for (let i = 1; i < sorted.length; i++) {
      const cur = sorted[i];
      for (const id of out) if (!cur.has(id)) out.delete(id);
      if (!out.size) break;
    }
    return out;
  }

  function videoSearchFromIndex({ q, tokenMap, prefixMap, byId, limit, rank }) {
    const qNorm = videoSearchNorm(q).trim();
    if (!qNorm) return [];
    const qTokens = qNorm.split(/[^a-z0-9]+/g).filter(Boolean);
    const postingSets = [];
    for (const t of qTokens) {
      const set = prefixMap.get(t) || tokenMap.get(t);
      if (!set || !set.size) return [];
      postingSets.push(set);
    }
    const candidates = videoIntersect(postingSets);
    if (!candidates || !candidates.size) return [];

    const cap = Math.max(limit * 3, limit + 6);
    const top = [];
    const put = (entry, score) => {
      if (score <= 0) return;
      if (top.length < cap) { top.push({ entry, score }); return; }
      let minIdx = 0;
      for (let i = 1; i < top.length; i++) if (top[i].score < top[minIdx].score) minIdx = i;
      if (score > top[minIdx].score) top[minIdx] = { entry, score };
    };

    for (const id of candidates) {
      const entry = byId.get(id);
      if (!entry) continue;
      put(entry, rank(entry, qNorm, qTokens));
    }

    top.sort((a, b) => b.score - a.score);
    return top.slice(0, limit).map(x => x.entry.item);
  }

  function videoRenderGlobalSearchResults(){
    const gs = document.getElementById('globalSearch');
    const resultsEl = document.getElementById('globalSearchResults');
    if (!gs || !resultsEl) return;

    const raw = String(gs.value || '');
    if (appState?.ui) appState.ui.globalSearch = raw;

    const q = raw.trim();
    if (!q) { videoHideGlobalSearchResults(); return; }

    const maxShows = 20;
    const maxEpisodes = 64;
    if (!videoSearchIndex) rebuildVideoSearchIndex();
    const searchIdx = videoSearchIndex;

    const shows = videoSearchFromIndex({
      q,
      tokenMap: searchIdx.showTokenMap,
      prefixMap: searchIdx.showPrefixMap,
      byId: searchIdx.showById,
      limit: maxShows,
      rank: (entry, qNorm, qTokens) => {
        let score = 0;
        if (entry.showNorm.includes(qNorm)) score += 140;
        if (entry.pathNorm.includes(qNorm)) score += 45;
        for (const t of qTokens) if (entry.tokens.has(t)) score += 12;
        return score;
      },
    }).sort((a, b) => _videoNatCmp(String(a?.name || ''), String(b?.name || '')));

    const episodes = videoSearchFromIndex({
      q,
      tokenMap: searchIdx.episodeTokenMap,
      prefixMap: searchIdx.episodePrefixMap,
      byId: searchIdx.episodeById,
      limit: maxEpisodes,
      rank: (entry, qNorm, qTokens) => {
        let score = 0;
        if (entry.titleNorm.includes(qNorm)) score += 160;
        if (entry.showNorm.includes(qNorm)) score += 100;
        if (entry.fileNorm.includes(qNorm)) score += 85;
        if (entry.pathNorm.includes(qNorm)) score += 35;
        for (const t of qTokens) if (entry.tokens.has(t)) score += 10;
        return score;
      },
    }).sort((a, b) => {
      const asn = String(getShowById(a?.showId)?.name || '');
      const bsn = String(getShowById(b?.showId)?.name || '');
      const c1 = _videoNatCmp(asn, bsn);
      if (c1) return c1;
      const at = String(a?.title || basename(String(a?.path || '')));
      const bt = String(b?.title || basename(String(b?.path || '')));
      const c2 = _videoNatCmp(at, bt);
      if (c2) return c2;
      return String(a?.path || '').localeCompare(String(b?.path || ''));
    });

    resultsEl.innerHTML = '';
    videoGlobalSearchItems = [];

    if (!shows.length && !episodes.length) {
      resultsEl.innerHTML = '<div class="resEmpty">No matches</div>';
      resultsEl.classList.remove('hidden');
      if (appState?.ui) appState.ui.globalSearchSel = 0;
      return;
    }

    const addGroup = (label) => {
      const g = document.createElement('div');
      g.className = 'resGroup';
      const h = document.createElement('div');
      h.className = 'resGroupTitle';
      h.textContent = label;
      g.appendChild(h);
      resultsEl.appendChild(g);
      return g;
    };

    let idx = 0;

    if (shows.length) {
      const g = addGroup('Matching shows');
      for (const s of shows) {
        const row = document.createElement('div');
        row.className = 'resItem';
        row.dataset.idx = String(idx);
        row.innerHTML = `<div class="resType">S</div><div class="resTitle">${_videoEscHtml(s?.name || 'Show')}</div><div class="resSub">Show</div>`;
        row.addEventListener('mouseenter', () => videoSetGlobalSearchSelection(idx));
        row.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (appState?.ui) appState.ui.globalSearchSel = idx;
          videoSetGlobalSearchSelection(idx);
        });
        row.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (appState?.ui) appState.ui.globalSearchSel = idx;
          videoActivateGlobalSearchSelection();
        });
        g.appendChild(row);
        videoGlobalSearchItems.push({ type: 'show', showId: String(s?.id || '') });
        idx++;
      }
    }

    if (episodes.length) {
      const g = addGroup('Matching episodes');
      for (const ep of episodes) {
        const showName = String(getShowById(ep?.showId)?.name || '');
        const title = String(ep?.title || basename(String(ep?.path || '')) || 'Episode');
        const sub = showName ? showName : 'Episode';
        const row = document.createElement('div');
        row.className = 'resItem';
        row.dataset.idx = String(idx);
        row.innerHTML = `<div class="resType">E</div><div class="resTitle">${_videoEscHtml(title)}</div><div class="resSub">${_videoEscHtml(sub)}</div>`;
        row.addEventListener('mouseenter', () => videoSetGlobalSearchSelection(idx));
        row.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (appState?.ui) appState.ui.globalSearchSel = idx;
          videoSetGlobalSearchSelection(idx);
        });
        row.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (appState?.ui) appState.ui.globalSearchSel = idx;
          videoActivateGlobalSearchSelection();
        });
        g.appendChild(row);
        videoGlobalSearchItems.push({ type: 'episode', episodeId: String(ep?.id || '') });
        idx++;
      }
    }

    resultsEl.classList.remove('hidden');
    videoSetGlobalSearchSelection(appState?.ui?.globalSearchSel || 0);
  }

  // Item 5: Allow the shared Clear Continue button to refresh video resume state.
  function setAllVideoProgress(next){
    state.progress = (next && typeof next === 'object') ? next : {};
    rerenderVideoAfterProgress();
  }
  // Expose a tiny bridge so the existing top bar Refresh button can work in video mode.
  window.videoApp = {
    setMode: (mode) => {
      safe(() => setMode(mode));
    },
    refresh: () => {
      if (state.mode === 'videos') safe(() => Tanko.api.video.scan({ force: true }));
    },
    back: () => {
      if (state.mode !== 'videos') { setMode('comics'); return; }
      if (document.body.classList.contains('inVideoPlayer')) { try { const p = saveNow(true); if (p && typeof p.then === 'function') p.catch(() => {}); } catch {} showVideoLibrary(); return; }
      if (state.videoSubView === 'show') { goVideoHome(); return; }
      setMode('comics');
    },
    toggleThumbs: () => {
      if (state.mode === 'videos') safe(() => toggleVideoShowThumbs());
    },
    // Build 12: allow the shell to force-refresh the Videos-only thumbs button label.
    syncThumbsBtn: () => {
      if (state.mode === 'videos') safe(() => syncVideoThumbToggleBtn());
    },
    renderGlobalSearchResults: () => {
      if (state.mode === 'videos') safe(() => videoRenderGlobalSearchResults());
    },
    hideGlobalSearchResults: () => {
      if (state.mode === 'videos') safe(() => videoHideGlobalSearchResults());
    },
    setGlobalSearchSelection: (idx) => {
      if (state.mode === 'videos') safe(() => videoSetGlobalSearchSelection(idx));
    },
    activateGlobalSearchSelection: () => {
      if (state.mode === 'videos') safe(() => videoActivateGlobalSearchSelection());
    },
    setAllProgress: (p) => {
      if (state.mode === 'videos') safe(() => setAllVideoProgress(p));
    },
  };

  // Deferred mode loader expects a global setMode bridge.
  window.setMode = (mode) => {
    safe(() => setMode(mode));
  };

  try { bindModeButtons(); } catch {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
