// FIND_THIS:AI_MAP_CORE
/*
================================
AI MAP — src/domains/shell/core.js
================================

What lives here:
- External open + drag/drop handlers (queueing incoming files)
- Library shell DOM refs (el.*) + toasts + context menu + loading overlay
- Stress-safe async helpers, utility helpers
- ZIP reader + file IO helpers
- App state (appState) + library indexing + refreshLibrary() + persistence

Where to go next:
- Library UI rendering: src/modules/library.js (EDIT_ZONE:LIBRARY_RENDER)
- Reader/player logic + input: src/modules/reader/*.js (split reader; boot is in reader/boot.js)

Hot search tokens:
- EDIT_ZONE:EXTERNAL_OPEN_HANDLERS
- EDIT_ZONE:LIBRARY_SHELL
- EDIT_ZONE:ZIP_READER
- function refreshLibrary
- function scheduleRenderLibrary
*/

  const $ = (sel) => document.querySelector(sel);

  // BUILD26_OPENWITH_DND (Build 26)
  // INTENT: Allow OS "Open with Tankoban" + drag/drop open without redesigning the reader/library.
  let bootReady = false;
  let pendingExternalOpen = null; // { paths: string[], source: string }
  let externalOpenInFlight = false;

  const normalizeExternalPaths = (paths) => {
    const arr = Array.isArray(paths) ? paths : [];
    const out = [];
    for (const p of arr) {
      const s = String(p || '').trim();
      if (!s) continue;
      out.push(s);
    }
    // de-dupe, preserve order
    return [...new Set(out)];
  };

  const enqueueExternalOpen = (paths, source = 'unknown') => {
    const list = normalizeExternalPaths(paths);
    if (!list.length) return;
    pendingExternalOpen = { paths: list, source: String(source || 'unknown') };
    if (bootReady) flushPendingExternalOpen(); // fire-and-forget
  };

  async function openExternalFilePath(filePath, source = 'unknown') {
    try {
      const res = await Tanko.api.library.bookFromPath(filePath);
      const book = res?.book || null;
      if (!res?.ok || !book?.path) return false;

      // Save current progress before switching (matches Open File button behavior).
      try { await saveProgressNowSilent(); } catch {}
      await openBook(book);
      return true;
    } catch {
      return false;
    }
  }

  async function flushPendingExternalOpen() {
    if (!bootReady || !pendingExternalOpen || externalOpenInFlight) return false;
    externalOpenInFlight = true;
    try {
      const { paths, source } = pendingExternalOpen;
      pendingExternalOpen = null;

      const first = paths[0];
      const extra = Math.max(0, paths.length - 1);
      if (extra) toast(`Opening 1 of ${paths.length} files (others ignored)`);

      const ok = await openExternalFilePath(first, source);
      if (!ok) toast('Unsupported or missing comic file');
      return ok;
    } finally {
      externalOpenInFlight = false;
    }
  }

  // OS open-with / argv forwarding (main -> renderer)
  try {
    Tanko.api.library.onAppOpenFiles((payload) => {
      enqueueExternalOpen(payload?.paths, payload?.source || 'os');
    });
  } catch {}

  // Drag & Drop open (global, lightweight)
  const hasComicExt = (p) => /\.(cbz|cbr)$/i.test(String(p || ''));

  document.addEventListener('dragover', (e) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    const files = Array.from(dt.files || []);
    if (!files.length) return;
    if (!files.some(f => hasComicExt(f?.path))) return;
    e.preventDefault();
  });

  document.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    const files = Array.from(dt.files || []);
    if (!files.length) return;

    const f = files.find(ff => hasComicExt(ff?.path));
    if (!f?.path) return;

    e.preventDefault();
    e.stopPropagation();
    enqueueExternalOpen([f.path], 'drop');
  });

  // EDIT_ZONE:LIBRARY_SHELL
  // Build 1 — Library shell + density foundation (YAC-style). Keep library behavior identical.
  const el = {
    libMenuBtn: $('#libMenuBtn'),
    libBackBtn: $('#libBackBtn'),
    libForwardBtn: $('#libForwardBtn'),
    libTitle: $('#libTitle'),
    libraryView: $('#libraryView'),
    playerView: $('#playerView'),

    libDrawerBackdrop: $('#libDrawerBackdrop'),

    addSeriesBtn: $('#addSeriesBtn'),
    sidebarFoldersTree: $('#sidebarFoldersTree'),
    addRootBtn: $('#addRootBtn'),
    openFileBtn: $('#openFileBtn'),
    openSettingsBtn: $('#openSettingsBtn'),
    refreshBtn: $('#refreshBtn'),
    minimizeBtn: $('#minimizeBtn'),
    libFsBtn: $('#libFsBtn'),
    closeBtn: $('#closeBtn'),

    globalSearch: $('#globalSearch'),
    globalSearchResults: $('#globalSearchResults'),

  // Library Settings (Build 42A)
    librarySettingsOverlay: $('#librarySettingsOverlay'),
    settingsClose: $('#settingsClose'),
    settingsAutoBase: $('#settingsAutoBase'),
    settingsAutoStep: $('#settingsAutoStep'),
    settingsScanIgnore: $('#settingsScanIgnore'),
    settingsSave: $('#settingsSave'),
    settingsReset: $('#settingsReset'),

    // Hidden series (Build 45D)
    tileDensityBtn: $('#tileDensityBtn'),
    hiddenSeriesBtn: $('#hiddenSeriesBtn'),
    hiddenSeriesOverlay: $('#hiddenSeriesOverlay'),
    hiddenSeriesClose: $('#hiddenSeriesClose'),
    hiddenSeriesList: $('#hiddenSeriesList'),
    clearIgnoredBtn: $('#clearIgnoredBtn'),

    continueRow: $('#continueRow'),
    continueEmpty: $('#continueEmpty'),
    hideFinishedToggle: $('#hideFinishedToggle'),
    clearContinueBtn: $('#clearContinueBtn'),
    libraryScanPill: $('#libraryScanPill'),
    libraryScanText: $('#libraryScanText'),
    libraryScanCancel: $('#libraryScanCancel'),

    // Build 4.5 — HomeView vs SeriesView switch
    homeView: $('#homeView'),
    seriesView: $('#seriesView'),

    seriesPanel: $('#seriesPanel'),
    seriesDetailPanel: $('#seriesDetailPanel'),

    seriesGrid: $('#seriesGrid'),
    seriesEmpty: $('#seriesEmpty'),

    volumesWrap: $('#volumesWrap'),
    volPreviewPane: $('#volPreviewPane'),
    volPreviewImg: $('#volPreviewImg'),
    volPreviewInfo: $('#volPreviewInfo'),
    volOpenBtn: $('#volOpenBtn'),
    volHidePreviewToggle: $('#volHidePreviewToggle'),
    volTableHead: $('#volTableHead'),

    volumesGrid: $('#volumesGrid'),
    volumesEmpty: $('#volumesEmpty'),

    volSort: $('#volSort'),
    volSearch: $('#volSearch'),
    clearVolSearch: $('#clearVolSearch'),

    crumb: $('#crumb'),
    seriesBackBtn: $('#seriesBackBtn'),
    crumbText: $('#crumbText'),

    // Debug overlay (default-off)
    debugOverlay: $('#debugOverlay'),

    toast: $('#toast'),

    contextMenu: $('#contextMenu'),

    backBtn: $('#backBtn'),
    prevBtn: $('#prevBtn'),
    playBtn: $('#playBtn'),
    nextBtn: $('#nextBtn'),
    // Build 8: quick settings row
    quickSpeedBtn: $('#quickSpeedBtn'),
    quickModeBtn: $('#quickModeBtn'),
    speedSliderOverlay: $('#speedSliderOverlay'),
    speedSliderCard: $('#speedSliderCard'),
    speedSliderTrack: $('#speedSliderTrack'),
    speedSliderFill: $('#speedSliderFill'),
    speedSliderThumb: $('#speedSliderThumb'),
    speedSliderValue: $('#speedSliderValue'),
    quickScrollBtn: $('#quickScrollBtn'),
    quickWidthBtn: $('#quickWidthBtn'),
    quickSpreadsBtn: $('#quickSpreadsBtn'),
    quickKeysBtn: $('#quickKeysBtn'),
    volNavBtn: $('#volNavBtn'),
    quickClearResumeBtn: $('#quickClearResumeBtn'),
    quickResetSeriesBtn: $('#quickResetSeriesBtn'),

    // BUILD 7: minimalist player HUD launcher (ported from Build 23 UI)
    prefsCornerBtn: $('#prefsCornerBtn'),

    // Mega Settings (Build 6A)
    megaSettingsOverlay: $('#megaSettingsOverlay'),
    megaSettingsPanel: $('#megaSettingsPanel'),
    megaMainPanel: $('#megaMainPanel'),
    megaSubPanel: $('#megaSubPanel'),
    megaBackBtn: $('#megaBackBtn'),
    megaSubTitle: $('#megaSubTitle'),
    megaSubList: $('#megaSubList'),
    megaRowSpeed: $('#megaRowSpeed'),
    // BUILD 7: control-mode selector row (UI-only). This opens the existing mode dropdown.
    megaRowMode: $('#megaRowMode'),
    // BUILD16C_AUTOFIP_INTERVAL_PREF: only shown for Auto Flip
    megaRowAutoFlip: $('#megaRowAutoFlip'),
    // BUILD8_IMAGE_FIT_TOGGLE: shown only for Double Page flick modes
    megaRowImageFit: $('#megaRowImageFit'),
    megaRowScroll: $('#megaRowScroll'),
    megaRowWidth: $('#megaRowWidth'),
    megaRowSpreads: $('#megaRowSpreads'),
    megaRowTools: $('#megaRowTools'),
    megaRowProgress: $('#megaRowProgress'),

    // BUILD 19H overlays (Build 19H)
    // INTENT: Reader QoL overlays are explicit DOM nodes to keep behavior stable and avoid dynamic DOM churn.
    gotoOverlay: $('#gotoOverlay'),
    gotoInput: $('#gotoInput'),
    gotoHint: $('#gotoHint'),
    gotoClose: $('#gotoClose'),
    gotoGoBtn: $('#gotoGoBtn'),
    gotoCancelBtn: $('#gotoCancelBtn'),

    imgFxOverlay: $('#imgFxOverlay'),
    imgFxClose: $('#imgFxClose'),
    imgFxDone: $('#imgFxDone'),
    imgFxReset: $('#imgFxReset'),
    imgFxBrightness: $('#imgFxBrightness'),
    imgFxBrightnessVal: $('#imgFxBrightnessVal'),
    imgFxContrast: $('#imgFxContrast'),
    imgFxContrastVal: $('#imgFxContrastVal'),

    // BUILD21_IMGFX_EXT (Build 21)
    imgFxSaturate: $('#imgFxSaturate'),
    imgFxSaturateVal: $('#imgFxSaturateVal'),
    imgFxSepia: $('#imgFxSepia'),
    imgFxSepiaVal: $('#imgFxSepiaVal'),
    imgFxHue: $('#imgFxHue'),
    imgFxHueVal: $('#imgFxHueVal'),
    imgFxInvert: $('#imgFxInvert'),
    imgFxGrayscale: $('#imgFxGrayscale'),


    // BUILD21_SCALE_QUALITY (Build 21)
    imgFxScaleOff: $('#imgFxScaleOff'),
    imgFxScaleSmooth: $('#imgFxScaleSmooth'),
    imgFxScaleSharp: $('#imgFxScaleSharp'),
    imgFxScalePixel: $('#imgFxScalePixel'),
    imgFxPresets: $('#imgFxPresets'),
    loupeHud: $('#loupeHud'),
    loupeCanvas: $('#loupeCanvas'),

    // BUILD 20_LOUPE_ZOOM_OVERLAY (Build 20)
    // INTENT: Keep loupe tuning explicit so it remains stable even if Mega UI evolves.
    loupeZoomOverlay: $('#loupeZoomOverlay'),
    loupeZoomClose: $('#loupeZoomClose'),
    loupeZoomDone: $('#loupeZoomDone'),
    loupeZoomReset: $('#loupeZoomReset'),
    loupeZoomRange: $('#loupeZoomRange'),
    loupeZoomVal: $('#loupeZoomVal'),
    loupeSizeRange: $('#loupeSizeRange'),
    loupeSizeVal: $('#loupeSizeVal'),
    megaSpeedValue: $('#megaSpeedValue'),
    // BUILD 7: shows the current control mode label in the Mega main panel.
    megaModeValue: $('#megaModeValue'),
    // BUILD16C_AUTOFIP_INTERVAL_PREF: shows interval label (e.g., 30s)
    megaAutoFlipValue: $('#megaAutoFlipValue'),
    // BUILD8_IMAGE_FIT_TOGGLE: shows Fit Height / Fit Width for the active Double Page flick mode
    megaImageFitValue: $('#megaImageFitValue'),
    megaScrollValue: $('#megaScrollValue'),
    megaWidthValue: $('#megaWidthValue'),
    megaSpreadsValue: $('#megaSpreadsValue'),
    megaProgressValue: $('#megaProgressValue'),
    clearResumeBtn: $('#clearResumeBtn'),
    resetSeriesBtn: $('#resetSeriesBtn'),
    prevVolBtn: $('#prevVolBtn'),
    nextVolBtn: $('#nextVolBtn'),
    playerMinBtn: $('#playerMinBtn'),
    playerFsBtn: $('#playerFsBtn'),
    playerCloseBtn: $('#playerCloseBtn'),

    nowTitle: $('#nowTitle'),
    nowSub: $('#nowSub'),
    pageText: $('#pageText'),
    modeText: $('#modeText'),
    scrollText: $('#scrollText'),
    pwText: $('#pwText'),
    speedBtns: $('#speedBtns'),

    stage: $('#stage'),
    autoFlipCountdown: $('#autoFlipCountdown'),
    clickZones: $('#clickZones'),

    // Build 33: manual scroller (Weeb Central style)
    manualScroller: $('.manualScroller'),
    manualScrollerTrack: $('.manualScrollerTrack'),
    manualScrollerThumb: $('.manualScrollerThumb'),

    scrub: $('#scrub'),
    scrubFill: $('#scrubFill'),
    scrubThumb: $('#scrubThumb'),
    scrubBubble: $('#scrubBubble'),

    // Build 35: quick actions on the scrub bar
    scrubModeBtn: $('#scrubModeBtn'),
    scrubNavBtn: $('#scrubNavBtn'),
    scrubFitBtn: $('#scrubFitBtn'),
    scrubWidthBtn: $('#scrubWidthBtn'),

    twoPageScrollRowGapWrap: $('#twoPageScrollRowGapWrap'),
    twoPageScrollRowGapInput: $('#twoPageScrollRowGapInput'),

    endOverlay: $('#endOverlay'),
    endSubtitle: $('#endSubtitle'),
    endNextVolumeBtn: $('#endNextVolumeBtn'),
    endReplayBtn: $('#endReplayBtn'),
    endLibraryBtn: $('#endLibraryBtn'),

    keysOverlay: $('#keysOverlay'),
    keysClose: $('#keysClose'),

    mangaLibTipsOverlay: $('#mangaLibTipsOverlay'),
    mangaLibTipsClose: $('#mangaLibTipsClose'),

    // volume navigator
    volNavOverlay: $('#volNavOverlay'),
    volNavTitle: $('#volNavTitle'),
    volNavClose: $('#volNavClose'),
    volNavSearch: $('#volNavSearch'),
    volNavList: $('#volNavList'),

    // warm-up
    warmupBar: $('#warmupBar'),
    warmupText: $('#warmupText'),
    warmupCancel: $('#warmupCancel'),

    loadingOverlay: $('#loadingOverlay'),
    loadingTitle: $('#loadingTitle'),
    loadingSub: $('#loadingSub'),
    loadingBar: $('#loadingBar'),
  };

  // Back-compat: other renderer scripts expect window.el to exist.
  window.el = el;

  function toast(msg) {
    scheduleToastBottomOffsetSync();
    el.toast.textContent = msg;
    el.toast.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.toast.classList.add('hidden'), 1400);
  }

  // Small on-screen feedback during reading.
  // Uses the existing toast element but avoids spamming outside the player.
  function playerToast(msg) {
    if (!document.body.classList.contains('inPlayer')) return;
    toast(msg);
  }

  // Build 45B: confirmation dialog helper (no new markup).
  async function confirmRemoveRootFolder() {
    return await new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        try { d.close(); } catch {}
        try { d.remove(); } catch {}
        resolve(!!v);
      };

      const d = document.createElement('dialog');
      d.style.padding = '18px';
      d.style.borderRadius = '14px';
      d.style.border = '1px solid rgba(255,255,255,.14)';
      d.style.background = 'rgba(18,18,18,.98)';
      d.style.color = 'white';
      d.style.maxWidth = '420px';
      d.style.boxShadow = '0 18px 60px rgba(0,0,0,.55)';

      d.innerHTML = `
        <div style="font-size:16px; font-weight:700; margin-bottom:8px;">Remove root folder?</div>
        <div style="font-size:13px; line-height:1.35; opacity:.92; margin-bottom:16px;">
          This removes it from the library. It does not delete files from disk.
        </div>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button type="button" data-act="cancel" style="padding:8px 12px; border-radius:10px;">Cancel</button>
          <button type="button" data-act="remove" style="padding:8px 12px; border-radius:10px;">Remove</button>
        </div>
      `;

      d.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });
      d.querySelector('[data-act="cancel"]')?.addEventListener('click', () => finish(false));
      d.querySelector('[data-act="remove"]')?.addEventListener('click', () => finish(true));

      document.body.appendChild(d);
      try { d.showModal(); } catch { finish(false); }
    });
  }


  // Build 38D: the speed slider provides a UI sync hook. Keep a safe default.
  // (It is assigned in initScrollSpeedSlider once the DOM is ready.)
  let syncSpeedSliderUi = () => {};

// Build 27 — Toast polish: keep toast above bottom controls when HUD is visible.
const TOAST_DEFAULT_BOTTOM_PX = 18;
const TOAST_GAP_PX = 12;
let _toastPosRaf = 0;

function syncToastBottomOffset() {
  const root = document.documentElement;
  if (!root || !document.body) return;

  const inPlayer = document.body.classList.contains('inPlayer');
  const hudHidden = document.body.classList.contains('hudHidden');

  if (!inPlayer || hudHidden) {
    root.style.setProperty('--toastBottom', `${TOAST_DEFAULT_BOTTOM_PX}px`);
    return;
  }

  const footer = document.querySelector('.playerFooter');
  if (!footer) {
    root.style.setProperty('--toastBottom', `${TOAST_DEFAULT_BOTTOM_PX}px`);
    return;
  }

  const h = Math.max(0, footer.getBoundingClientRect().height || 0);
  const bottom = Math.round(h + TOAST_GAP_PX);
  root.style.setProperty('--toastBottom', `${bottom}px`);
}

function scheduleToastBottomOffsetSync() {
  if (_toastPosRaf) return;
  _toastPosRaf = window.requestAnimationFrame(() => {
    _toastPosRaf = 0;
    syncToastBottomOffset();
  });
}

// React to HUD visibility toggles (body.hudHidden) without changing the existing system.
if (document.body && window.MutationObserver) {
  const _toastClassObserver = new MutationObserver(() => scheduleToastBottomOffsetSync());
  _toastClassObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}
window.addEventListener('resize', () => scheduleToastBottomOffsetSync(), { passive: true });

// Initial sync after first layout.
scheduleToastBottomOffsetSync();


  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // -----------------------------
  // Build 45A: Reusable Library context menu
  // -----------------------------
  function isContextMenuOpen() {
    return !!el.contextMenu && !el.contextMenu.classList.contains('hidden');
  }

  function hideContextMenu() {
    if (!el.contextMenu) return;
    el.contextMenu.classList.add('hidden');
    el.contextMenu.setAttribute('aria-hidden', 'true');
    el.contextMenu.innerHTML = '';
  }

  function showContextMenu({ x, y, items }) {
    if (!el.contextMenu) return;

    const list = Array.isArray(items) ? items : [];
    el.contextMenu.innerHTML = '';

    for (const it of list) {
      if (it && it.separator) {
        const sep = document.createElement('div');
        sep.className = 'contextMenuSep';
        el.contextMenu.appendChild(sep);
        continue;
      }

      const label = String(it?.label || '');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'contextMenuItem';
      btn.textContent = label;

      if (it?.danger) btn.classList.add('danger');

      const disabled = !!it?.disabled;
      if (disabled) {
        btn.classList.add('disabled');
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
      }

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (disabled) return;
        hideContextMenu();
        try { it?.onClick?.(); } catch (err) { console.error(err); }
      });

      el.contextMenu.appendChild(btn);
    }

    // If the menu has no items (or only separators), do nothing.
    if (!el.contextMenu.querySelector('.contextMenuItem')) {
      hideContextMenu();
      return;
    }

    el.contextMenu.classList.remove('hidden');
    el.contextMenu.setAttribute('aria-hidden', 'false');

    el.contextMenu.style.left = `${Math.round(x)}px`;
    el.contextMenu.style.top = `${Math.round(y)}px`;

    const margin = 8;

    // Clamp after measuring the rendered size.
    requestAnimationFrame(() => {
      if (!isContextMenuOpen()) return;
      const r = el.contextMenu.getBoundingClientRect();
      const maxX = Math.max(margin, Math.round(window.innerWidth - r.width - margin));
      const maxY = Math.max(margin, Math.round(window.innerHeight - r.height - margin));
      const cx = clamp(Math.round(x), margin, maxX);
      const cy = clamp(Math.round(y), margin, maxY);
      el.contextMenu.style.left = `${cx}px`;
      el.contextMenu.style.top = `${cy}px`;
    });
  }

  // Close on outside *left click* only.
  document.addEventListener('mousedown', (e) => {
    if (!isContextMenuOpen()) return;
    if (e.button !== 0) return;
    if (el.contextMenu && el.contextMenu.contains(e.target)) return;
    hideContextMenu();
  }, true);

  // Build 29: Weeb Central sizing parity (no-upscale + centered).
  // Canvas dimensions are in device pixels; ImageBitmap dimensions are source pixels.
  // We cap draw width so the rendered size in CSS pixels never exceeds the bitmap's intrinsic width.
  function getNoUpscaleMetrics(bmp, spread, cw, pwFrac) {
    const dpr = window.devicePixelRatio || 1;
    const maxW = spread ? cw : Math.round(cw * pwFrac);
    const capW = Math.round(bmp.width * dpr);
    const drawW = Math.min(maxW, capW);
    const dx = Math.floor((cw - drawW) / 2);
    const scale = drawW / bmp.width;
    const scaledH = Math.round(bmp.height * scale);
    return { dpr, maxW, capW, drawW, dx, scale, scaledH };
  }


  // -----------------------------
  // Debug instrumentation (default-off)
  // -----------------------------
  const DEBUG = (new URLSearchParams(window.location.search)).get('debug') === '1';
  if (DEBUG && el.debugOverlay) {
    el.debugOverlay.classList.remove('hidden');
  }

  function updateDebugOverlay(extra = {}) {
    if (!DEBUG || !el.debugOverlay) return;
    const dpr = window.devicePixelRatio || 1;
    const inPlayer = document.body.classList.contains('inPlayer');

    let vw = 0, vh = 0;

    try {
      const v = getViewportCssSize();
      vw = v.vw; vh = v.vh;
    } catch {
      vw = Math.max(1, window.innerWidth || 1);
      vh = Math.max(1, window.innerHeight || 1);
    }

    const r = el.stage?.getBoundingClientRect ? el.stage.getBoundingClientRect() : { width: 0, height: 0 };
    const cssW = Math.round(r.width || 0);
    const cssH = Math.round(r.height || 0);
    const backingW = el.stage?.width || 0;
    const backingH = el.stage?.height || 0;

    // appState is defined later; guard for early calls.
    const mode = (typeof appState !== 'undefined' && appState && appState.mode) ? appState.mode : '—';
    const playing = (typeof appState !== 'undefined' && appState && typeof appState.playing === 'boolean') ? (appState.playing ? 'playing' : 'paused') : '—';
    const page = (typeof appState !== 'undefined' && appState && Number.isFinite(appState.pageIndex)) ? `${appState.pageIndex + 1}/${appState.pages?.length || 0}` : '—';

    const lines = [
      `debug=1  ${inPlayer ? 'player' : 'library'}`,
      `viewport(css): ${vw}×${vh}  dpr: ${Number(dpr).toFixed(2)}`,
      `canvas(css):   ${cssW}×${cssH}`,
      `canvas(buf):   ${backingW}×${backingH}`,
      `mode: ${mode}  ${playing}  page: ${page}`,
    ];

    if (typeof appState !== 'undefined' && appState) {
      lines.push(`y: ${Math.round(appState.y || 0)}  yMax: ${Math.round(appState.yMax || 0)}`);
    }
    for (const [k, v] of Object.entries(extra || {})) {
      lines.push(`${k}: ${v}`);
    }

    el.debugOverlay.textContent = lines.join('\n');
  }

  // Loading overlay helpers (spinner + optional progress)
  let loadingCount = 0;
  let loadingShowTimer = null;
  function showLoading(title, sub = '', pct = null) {
    loadingCount++;
    if (!el.loadingOverlay) return;
    if (el.loadingTitle) el.loadingTitle.textContent = title || 'Loading…';
    if (el.loadingSub) el.loadingSub.textContent = sub || '';
    if (el.loadingBar) el.loadingBar.style.width = (typeof pct === 'number' ? `${clamp(pct, 0, 100)}%` : '0%');

    clearTimeout(loadingShowTimer);
    // Delay a bit to avoid flicker for fast operations.
    loadingShowTimer = setTimeout(() => {
      if (loadingCount > 0) el.loadingOverlay.classList.remove('hidden');
    }, 140);
  }

  function updateLoading(sub = null, pct = null) {
    if (!el.loadingOverlay || el.loadingOverlay.classList.contains('hidden')) return;
    if (sub !== null && el.loadingSub) el.loadingSub.textContent = sub;
    if (typeof pct === 'number' && el.loadingBar) el.loadingBar.style.width = `${clamp(pct, 0, 100)}%`;
  }

  function hideLoading() {
    loadingCount = Math.max(0, loadingCount - 1);
    if (!el.loadingOverlay) return;
    if (loadingCount === 0) {
      clearTimeout(loadingShowTimer);
      el.loadingOverlay.classList.add('hidden');
      if (el.loadingBar) el.loadingBar.style.width = '0%';
      if (el.loadingSub) el.loadingSub.textContent = '';
    }
  }


    

  

  

  

  // Build 22: stress-safe async helpers (no UX changes)
  // INTENT: Prevent stale async completions (rapid nav / rapid volume switches) from mutating live state,
  // and catch impossible states during stress without crashing production.
  function makeStaleError(label = '') {
    const err = new Error('Stale async result');
    err.stale = true;
    err.label = label;
    return err;
  }
  function isStaleError(err) { return !!(err && err.stale === true); }

  function softAssert(cond, msg, extra = null) {
    if (cond) return true;
    try { console.warn('[softAssert]', msg, extra || ''); } catch {}
    return false;
  }

  // -----------------------------
  // ZIP reader (CBZ) - stored(0) + deflate(8)
  // -----------------------------
  const u16 = (d,o) => d[o] | (d[o+1] << 8);
  const u32 = (d,o) => (d[o] | (d[o+1] << 8) | (d[o+2] << 16) | (d[o+3] << 24)) >>> 0;

  function findEOCD(data) {
    const sig = 0x06054b50;
    const maxBack = Math.min(data.length, 0x10000 + 22);
    for (let i = data.length - 22; i >= data.length - maxBack; i--) {
      if (i < 0) break;
      if (u32(data, i) === sig) return i;
    }
    return -1;
  }

  async function inflateRaw(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    const ab = await new Response(stream).arrayBuffer();
    return new Uint8Array(ab);
  }

  async function readZipEntries(arrayBuffer) {
    const data = new Uint8Array(arrayBuffer);
    const eocd = findEOCD(data);
    if (eocd < 0) throw new Error('Not a valid CBZ (ZIP EOCD not found).');

    const cdOff  = u32(data, eocd + 16);
    const total  = u16(data, eocd + 10);

    let p = cdOff;
    const entries = [];

    for (let i = 0; i < total; i++) {
      if (u32(data, p) !== 0x02014b50) throw new Error('Corrupt ZIP central directory.');

      const method = u16(data, p + 10);
      const cSize  = u32(data, p + 20);
      const uSize  = u32(data, p + 24);
      const nLen   = u16(data, p + 28);
      const xLen   = u16(data, p + 30);
      const cLen   = u16(data, p + 32);
      const lOff   = u32(data, p + 42);

      const nameBytes = data.slice(p + 46, p + 46 + nLen);
      const name = new TextDecoder('utf-8').decode(nameBytes);

      p = p + 46 + nLen + xLen + cLen;

      if (!name.endsWith('/')) entries.push({ name, method, cSize, uSize, lOff });
    }

    async function getFileBytes(entry) {
      const off = entry.lOff;
      if (u32(data, off) !== 0x04034b50) throw new Error('Corrupt ZIP local header.');

      const method = u16(data, off + 8);
      const nLen   = u16(data, off + 26);
      const xLen   = u16(data, off + 28);
      const dataStart = off + 30 + nLen + xLen;

      const compressed = data.slice(dataStart, dataStart + entry.cSize);

      if (method === 0) return compressed;
      if (method === 8) return await inflateRaw(compressed);
      throw new Error(`Unsupported compression method: ${method} (need stored(0) or deflate(8)).`);
    }

    return { entries, getFileBytes };
  }

  // BUILD16B_NATURAL_SORT_CACHE: Memoize splitKey results to reduce sort-time allocations.
  // Safe because the returned array is treated as immutable by naturalCompare.
  const _splitKeyCache = new Map();

  function splitKey(str){
    const key = String(str || '');
    const cached = _splitKeyCache.get(key);
    if (cached) return cached;

    const parts = key.split('/');
    const out = [];
    for (const seg of parts){
      const chunks = seg.match(/(\d+)|(\D+)/g) || [seg];
      for (const c of chunks){
        if (/^\d+$/.test(c)) out.push({t:'n',v:parseInt(c,10)});
        else out.push({t:'s',v:c.toLowerCase()});
      }
      out.push({t:'sep',v:0});
    }

    if (_splitKeyCache.size > 8000) _splitKeyCache.clear();
    _splitKeyCache.set(key, out);
    return out;
  }

  function naturalCompare(a,b){
    const ka=splitKey(a), kb=splitKey(b);
    const n=Math.max(ka.length,kb.length);
    const rank={n:0,s:1,sep:2};
    for (let i=0;i<n;i++){
      const xa=ka[i], xb=kb[i];
      if (!xa) return -1;
      if (!xb) return 1;
      if (xa.t!==xb.t) return rank[xa.t]-rank[xb.t];
      if (xa.v<xb.v) return -1;
      if (xa.v>xb.v) return 1;
    }
    return 0;
  }

  // -----------------------------
  // App state
  // -----------------------------
  // -----------------------------
  // Scroll speed presets
  // -----------------------------
  // Build 20: scroll speed presets 1–10
  const SCROLL_SPEED_PRESETS = [80, 100, 125, 155, 190, 235, 290, 360, 450, 560];

  // Legacy aliases kept for backward compatibility with older saved settings / keybindings.
  const SPEED_ALIAS_TO_LEVEL = { relaxed: 4, normal: 5, fast: 7 };

  // FIND_THIS:VIEW_CONSTANTS (Tankoban Build 2)
  const VIEW_CONSTANTS = {
    // Spread / aspect thresholds
    WIDE_RATIO_1_15: 1.15,
    STITCHED_SPREAD_RATIO_PRIMARY: 1.25,
    STITCHED_SPREAD_RATIO_SECONDARY: 1.15,

    // Portrait max width cap (canvas px; clamped to canvas width)
    PORTRAIT_MAX_W: 1200,

    // Two-Page gutter (canvas px)
    TWO_PAGE_GUTTER_PX: 0,

    // Manual wheel smoothing (device px)
    MANUAL_WHEEL_BACKLOG_MIN: 2400,
    MANUAL_WHEEL_BACKLOG_MULT: 8,
    MANUAL_WHEEL_MAX_STEP_MIN: 70,
    MANUAL_WHEEL_MAX_STEP_MULT: 0.22,
    MANUAL_WHEEL_CONSUME_FRACTION: 0.38,

    // Library auto-scroll tuning (Preset 1 baseline + percentage ladder)
    LIB_AUTO_BASE_SEC_DEFAULT: 25,
    LIB_AUTO_STEP_PCT_DEFAULT: 15,
  };

  // Build 42B: Auto Scroll speed math uses Library Settings (Preset 1 baseline + percentage ladder).
  const LIB_AUTO_BASE_SEC_DEFAULT = VIEW_CONSTANTS.LIB_AUTO_BASE_SEC_DEFAULT;
  const LIB_AUTO_STEP_PCT_DEFAULT = VIEW_CONSTANTS.LIB_AUTO_STEP_PCT_DEFAULT;


  function readLibAutoScrollBaseSecondsPerScreen() {
    const raw = parseInt(localStorage.getItem('autoScrollBaseSecondsPerScreen') || '', 10);
    const v = Number.isFinite(raw) ? raw : LIB_AUTO_BASE_SEC_DEFAULT;
    return clamp(v, 5, 60);
  }

  function readLibAutoScrollStepPct() {
    const raw = parseInt(localStorage.getItem('autoScrollStepPct') || '', 10);
    const v = Number.isFinite(raw) ? raw : LIB_AUTO_STEP_PCT_DEFAULT;
    return clamp(v, 1, 50);
  }

  function autoScrollPresetScaleFactor() {
    try {
      if (!document.body.classList.contains('inPlayer')) return 1;
    } catch { return 1; }
    try {
      if (!isAutoLikeControlMode()) return 1;
    } catch { return 1; }

    const baseSec = readLibAutoScrollBaseSecondsPerScreen();
    let viewportH = 0;
    try { viewportH = (el.stage && (el.stage.clientHeight || el.stage.getBoundingClientRect().height)) || 0; } catch { viewportH = 0; }
    if (!Number.isFinite(viewportH) || viewportH <= 0) viewportH = window.innerHeight || 0;
    if (!Number.isFinite(viewportH) || viewportH <= 0) return 1;

    const basePx = viewportH / baseSec;
    if (!Number.isFinite(basePx) || basePx <= 0) return 1;
    return basePx / SCROLL_SPEED_PRESETS[0];
  }

  function clampSpeedLevel(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 5;
    return Math.max(1, Math.min(10, Math.round(v)));
  }

  function scrollSpeedPxForLevel(level) {
    const lvl = clampSpeedLevel(level);
    const k = autoScrollPresetScaleFactor();
    const kk = (Number.isFinite(k) && k > 0) ? k : 1;
    return SCROLL_SPEED_PRESETS[lvl - 1] * kk;
  }

  function scrollSpeedLevelFromPx(px) {
    const v = Number(px);
    if (!Number.isFinite(v)) return 5;
    const k = autoScrollPresetScaleFactor();
    const kk = (Number.isFinite(k) && k > 0) ? k : 1;
    let bestLevel = 5;
    let bestDist = Infinity;
    for (let i = 0; i < SCROLL_SPEED_PRESETS.length; i++) {
      const d = Math.abs(v - (SCROLL_SPEED_PRESETS[i] * kk));
      if (d < bestDist) { bestDist = d; bestLevel = i + 1; }
    }
    return bestLevel;
  }

  function normalizeSpeedPresetId(id) {
    if (id === null || id === undefined) return 5;
    if (typeof id === 'number') return clampSpeedLevel(id);
    const s = String(id).trim().toLowerCase();
    if (!s) return 5;
    const n = Number(s);
    if (Number.isFinite(n)) return clampSpeedLevel(n);
    if (SPEED_ALIAS_TO_LEVEL[s]) return SPEED_ALIAS_TO_LEVEL[s];
    return 5;
  }

  function setSpeedActive(level) {
    const lvl = clampSpeedLevel(level);
    document.querySelectorAll('.chip.speed').forEach(b => {
      b.classList.toggle('active', (b.dataset.speed || '') === String(lvl));
    });
  }

  function setScrollSpeedLevel(level, opts = {}) {
    const lvl = clampSpeedLevel(level);
    const px = scrollSpeedPxForLevel(lvl);
    appState.settings.scrollPxPerSec = px;
    setSpeedActive(lvl);
    scheduleProgressSave();
    // Build 38D: keep the always-visible HUD label in sync.
    syncSpeedHudText();
    syncSpeedSliderUi();
    if (opts.toast) toast(formatSpeedHudLabel(px));
  }

  function applySpeedPreset(id) {
    const lvl = normalizeSpeedPresetId(id);
    setScrollSpeedLevel(lvl, { toast: true });
  }
  // FIND_THIS:HOTSPOT_MODE_DEFS (Tankoban Build 2)

  // Build 35/43B: unified control mode UI + behavior (Manual / Auto)
  const CONTROL_MODE_DEFS = [
    // BUILD12_LABEL_ONLY_RENAME: 'Manual' here means the long vertical strip reader.
    { id: 'manual', label: 'Long Strip', glyph: '✋' },
    { id: 'auto', label: 'Auto', glyph: '▶' },

    // FIND_THIS:AUTO_FLIP_MODE_DEF (Tankoban Build 3)
    { id: 'autoFlip', label: 'Auto Flip', glyph: '⏱' },

    // FIND_THIS:TWO_PAGE_MODE_DEF (Build 47A1) (Build 47A1)
    // FIND_THIS:TWO_PAGE_MODE_DEF (Build 47A1) (Build 47A1)
    // BUILD12_LABEL_ONLY_RENAME: user-facing label only; internal id stays 'twoPage'.
    { id: 'twoPage', label: 'Double Page', glyph: '⧉' },
    // BUILD9_MANGAPLUS_MODE: same Double Page flick pipeline, but defaults to Fit Width for readability.
    { id: 'twoPageMangaPlus', label: 'Double Page (MangaPlus)', glyph: '⧉' },
    // FIND_THIS:TWO_PAGE_SCROLL_MODE_DEF (Build 47A6-1)
    // FIND_THIS:TWO_PAGE_SCROLL_MODE_DEF (Build 47A6-1)
    // BUILD12_LABEL_ONLY_RENAME: label only; behavior unchanged.
    { id: 'twoPageScroll', label: 'Double Page (Scroll)', glyph: '⇵' },
  ];

  // FIND_THIS:MODE_GUARD_HELPERS (Tankoban Build 2)
  // Single source of truth for controlMode checks (behavior-preserving).
  function isAutoMode(mode = getControlMode()) { return (mode === 'auto'); }
  // BUILD9_MANGAPLUS_MODE: both Double Page flick modes share the same renderer/pairing pipeline.
  // NOTE: Reading direction (if ever introduced) is layout-only; it must NOT flip navigation.
  function isTwoPageFlipMode(mode = getControlMode()) { return (mode === 'twoPage' || mode === 'twoPageMangaPlus'); }
  function isTwoPageMangaPlusMode(mode = getControlMode()) { return (mode === 'twoPageMangaPlus'); }
  function isTwoPageScrollMode(mode = getControlMode()) { return (mode === 'twoPageScroll'); }
  // Small readability helper for Build 8/10 logic.
  function isTwoPageFlickMode(mode = getControlMode()) { return isTwoPageFlipMode(mode); }
  function usesVerticalScroll(mode = getControlMode()) {
    return (mode === 'manual' || mode === 'auto' || mode === 'twoPageScroll');
  }
  function blocksVerticalScroll(mode = getControlMode()) { return isTwoPageFlipMode(mode); }

  function getControlModeLabel(id) {
    const def = CONTROL_MODE_DEFS.find(m => m.id === id);
    return def ? def.label : 'Manual';
  }
  // FIND_THIS:HOTSPOT_NORMALIZE_CONTROLMODE (Tankoban Build 2)
  function normalizeControlMode(m) {
    return (m === 'manual' || m === 'auto' || m === 'autoFlip' || m === 'twoPage' || m === 'twoPageMangaPlus' || m === 'twoPageScroll') ? m : 'manual';
  }

  function getControlMode() {
    return normalizeControlMode(appState.settings?.controlMode);
  }

  // BUILD 25 v2
  // appState.settings.imageScaleQuality: 'off'|'smooth'|'sharp'|'pixel'
  // INTENT: Build 25 makes "Off" a true reset of canvas scaling overrides.
  // Older builds may have missing/unknown values; treat those as 'off'.
  function normalizeImageScaleQuality(v) {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    if (s === 'off' || s === 'none' || s === 'default') return 'off';
    if (s === 'smooth' || s === 'smoother' || s === 'high') return 'smooth';
    if (s === 'sharp' || s === 'sharper' || s === 'low') return 'sharp';
    if (s === 'pixel' || s === 'nearest' || s === 'crisp') return 'pixel';
    return 'off';
  }

  function getImageScaleQuality() {
    const q = normalizeImageScaleQuality(appState.settings?.imageScaleQuality);
    // WHY: We persist per-series settings. Keeping this normalized prevents
    // legacy/typo values from reappearing on the next save.
    if (appState?.settings && appState.settings.imageScaleQuality !== q) {
      appState.settings.imageScaleQuality = q;
    }
    return q;
  }

  function clampInt(v, lo, hi) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
  }

  function isAutoLikeControlMode(mode = getControlMode()) {
    return isAutoMode(mode);
  }
  function getControlModeHudGlyph(mode) {
    const def = CONTROL_MODE_DEFS.find(m => m.id === mode);
    return def?.glyph || '✋';
  }

  // FIND_THIS:TWO_PAGE_SCROLL_ROW_GAP_UI (Tankoban Build 5)
  function clampTwoPageScrollRowGapPx(v) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return DEFAULTS.twoPageScrollRowGapPx;
    return clamp(n, 0, 64);
  }
  function getTwoPageScrollRowGapPx() {
    return clampTwoPageScrollRowGapPx(appState.settings?.twoPageScrollRowGapPx);
  }
  function syncTwoPageScrollRowGapUi() {
    if (!el.twoPageScrollRowGapWrap || !el.twoPageScrollRowGapInput) return;
    const show = isTwoPageScrollMode();
    el.twoPageScrollRowGapWrap.classList.toggle('hidden', !show);
    if (!show) return;
    const v = getTwoPageScrollRowGapPx();
    if (appState?.settings && appState.settings.twoPageScrollRowGapPx !== v) {
      appState.settings.twoPageScrollRowGapPx = v;
    }
    if (String(el.twoPageScrollRowGapInput.value || '') !== String(v)) {
      el.twoPageScrollRowGapInput.value = String(v);
    }
  }

  function syncControlModeUi() {
    const mode = getControlMode();
    const label = getControlModeLabel(mode);

    if (el.quickModeBtn) {
      // BUILD 7: Build 23's minimalist control uses text labels instead of emoji glyphs.
      // Why: the quick row is hidden for the minimalist HUD, but this button is still
      // the canonical anchor for the dropdown if the quick row is ever shown again.
      // We show the label so the UI matches Build 23 without touching any mode logic.
      el.quickModeBtn.textContent = label;
      el.quickModeBtn.title = `Mode: ${label} (M)`;
      try { el.quickModeBtn.setAttribute('aria-pressed', isAutoLikeControlMode(mode) ? 'true' : 'false'); } catch {}
    }

    // Build 35: scrub-bar quick actions (minimal symbols).
    // These are optional conveniences layered on top of existing menus.
    if (el.scrubModeBtn) {
      // BUILD39_SCRUB_MODE_GLYPH (Build 39)
      // Keep the Modes scrub button as a stable, user-chosen symbol (◫).
      // The current mode is reflected via tooltip/aria only.
      el.scrubModeBtn.textContent = '◫';
      el.scrubModeBtn.title = `Modes: ${label} (M)`;
      try { el.scrubModeBtn.setAttribute('aria-label', `Modes: ${label}`); } catch {}
    }
    if (el.scrubNavBtn) {
      el.scrubNavBtn.title = 'Navigate volumes';
    }

    // Image Fit only matters in the Double Page flick modes.
    if (el.scrubFitBtn) {
      const showFit = isTwoPageFlipMode(mode);
      el.scrubFitBtn.classList.toggle('hidden', !showFit);
      if (showFit) {
        {
        const fitLbl = twoPageImageFitLabel(getTwoPageImageFit(mode));
        if (isTwoPageMangaPlusMode(mode)) {
          const z = getTwoPageMangaPlusZoomPct();
          el.scrubFitBtn.title = `Image fit: ${fitLbl} • Zoom: ${z}%`;
        } else {
          el.scrubFitBtn.title = `Image fit: ${fitLbl}`;
        }
      }
      }
    }

    // Portrait width is only meaningful in the scrolling/strip modes.
    if (el.scrubWidthBtn) {
      const showWidth = usesVerticalScroll(mode);
      el.scrubWidthBtn.classList.toggle('hidden', !showWidth);
      if (showWidth) {
        const pw = Number(appState.settings?.portraitWidthPct) || 100;
        el.scrubWidthBtn.title = `Portrait width: ${pw}%`;
      }
    }

    // BUILD 7: keep the Mega Settings "Mode" row in sync with the active control mode.
    // This is UI-only; setControlMode() is still the single source of truth.
    if (el.megaModeValue) {
      el.megaModeValue.textContent = label;
    }

    // BUILD8_IMAGE_FIT_TOGGLE: show Image Fit only for the Double Page flick modes.
    // Why: this control only affects two-page flick rendering, and should not clutter other modes.
    if (el.megaRowImageFit) {
      const showFit = isTwoPageFlipMode(mode);
      el.megaRowImageFit.classList.toggle('hidden', !showFit);
      if (showFit && el.megaImageFitValue) {
        {
          const fitLbl = twoPageImageFitLabel(getTwoPageImageFit(mode));
          if (isTwoPageMangaPlusMode(mode)) {
            const z = getTwoPageMangaPlusZoomPct();
            el.megaImageFitValue.textContent = `${fitLbl} • Zoom ${z}%`;
          } else {
            el.megaImageFitValue.textContent = fitLbl;
          }
        }
      }
    }

    // Speed controls are irrelevant in Manual Scroll.
    if (el.quickSpeedBtn) {
      const disabled = (mode === 'manual' || mode === 'autoFlip' || mode === 'twoPage' || mode === 'twoPageMangaPlus' || mode === 'twoPageScroll');
      el.quickSpeedBtn.disabled = disabled;
      el.quickSpeedBtn.title = disabled ? 'Scroll speed (Auto only)' : 'Scroll speed';
    }

    // Build 38D: mode affects the speed readout (and whether it is clickable).
    syncSpeedHudText();

    syncTwoPageScrollRowGapUi();

  }

  // FIND_THIS:HOTSPOT_SET_CONTROLMODE (Tankoban Build 2)
  function setControlMode(nextMode, opts = {}) {
    if (!appState?.settings) return;

    const want = normalizeControlMode(nextMode);
    const cur = getControlMode();

    // FIND_THIS:AUTO_FLIP_MODE_TRANSITIONS (Tankoban Build 3)
    // Start/stop the fixed 30s Auto Flip timer only while controlMode === 'autoFlip'.
    const leavingAutoFlip = (cur === 'autoFlip' && want !== 'autoFlip');
    const enteringAutoFlip = (cur !== 'autoFlip' && want === 'autoFlip');

    if (leavingAutoFlip) {
      appState.autoFlipPaused = false;
      stopAutoFlipTimer();
    }
    if (enteringAutoFlip) {
      appState.autoFlipPaused = false;
    }

    if (cur === want) {
      syncControlModeUi();
      return;
    }

    appState.settings.controlMode = want;


// Build 22: mode token protects async partner decodes/redraws from racing across rapid mode switches.
const modeTok = ++appState.tokens.mode;

    // Keep transport button correct as modes change.
    try { syncTransportGlyph(); } catch {}

    // FIND_THIS:TANKOBAN_TWO_PAGE_SCROLL_MODE_TRANSITION (Tankoban Build 4)
    // Preserve reading position when switching between Two-Page (Flip) and Two-Page (Scroll).
    const leavingTwoPageScroll = (cur === 'twoPageScroll' && want !== 'twoPageScroll');
    const enteringTwoPageScroll = (cur !== 'twoPageScroll' && want === 'twoPageScroll');

    if (leavingTwoPageScroll) {
      // BUILD19A_TWOPAGE_SCROLL_EXIT_PRESERVE (Build 19A)
      // Two-Page (Scroll) doesn't continuously update pageIndex as you scroll,
      // so exiting the mode must derive a fresh index from the current y.
      try {
        const idx = twoPageScrollIndexForYDevPx(Number(appState.y) || 0);
        if (Number.isFinite(idx)) appState.pageIndex = snapTwoPageIndex(idx);
      } catch {}

      twoPageScrollHoldSingleRowUntilSync = false;
      twoPageScrollPendingSyncIndex = null;
      twoPageScrollPendingScrollProgress01 = null;
    }

    if (enteringTwoPageScroll) {
      // When coming from Two-Page (Flip), translate the current pair into the stacked-stream y offset.
      if (isTwoPageFlipMode(cur) || cur === 'autoFlip') { // BUILD9_MANGAPLUS_MODE
        const snapped = snapTwoPageIndex(appState.pageIndex);
        if (snapped !== appState.pageIndex) appState.pageIndex = snapped;

        // Start from the pair row, then sync to stacked rows once the layout is ready.
        appState.y = 0;
        appState.yMax = 0;
        twoPageScrollLastRowIdx = 0;

        const yStart = twoPageScrollYStartForIndex(appState.pageIndex);
        if (Number.isFinite(yStart)) {
          appState.y = Math.round(Number(yStart) || 0);
          twoPageScrollHoldSingleRowUntilSync = false;
          twoPageScrollPendingSyncIndex = null;
        } else {
          twoPageScrollHoldSingleRowUntilSync = true;
          twoPageScrollPendingSyncIndex = appState.pageIndex;
        }
      } else {
        // For other modes, keep existing behavior (no forced remap).
        twoPageScrollHoldSingleRowUntilSync = false;
        twoPageScrollPendingSyncIndex = null;
      }
    }

    if (enteringAutoFlip) {
      // Auto Flip is Two-Page (Flip) with a fixed timer; vertical scroll is always reset.
      appState.y = 0;
      appState.yMax = 0;
    }

    // Switching to Manual while playing should immediately pause so it doesn't fight wheel/keys.
    if (!isAutoMode(want) && appState.playing) {
      pauseLoop();
    }

    // If the speed slider is open, close it when entering Manual mode.
    if (!isAutoMode(want) && isSpeedSliderOpen()) {
      closeSpeedSlider(false);
    }
    syncControlModeUi();
    scheduleProgressSave();

    // FIND_THIS:TWO_PAGE_ENTRY_SNAP (Build 47A3)
    if (isTwoPageFlipMode(want) || want === 'autoFlip') {
      const snapped = snapTwoPageIndex(appState.pageIndex);
      if (snapped !== appState.pageIndex) {
        appState.pageIndex = snapped;
        appState.y = 0;
        appState.yMax = 0;

        // Ensure the snapped page is decoded and re-render once ready.
        clearCachedBmp(false);
        getBitmapAtIndex(snapped)
          .then(async ({ bmp, spread }) => {
            if (!document.body.classList.contains('inPlayer')) return;
            if (!(isTwoPageFlipMode(getControlMode()) || getControlMode() === 'autoFlip')) return;
            if (appState.pageIndex !== snapped) return;
            if ((appState.tokens.mode || 0) !== modeTok) return;
            cachedBmp = bmp;
            cachedSpread = spread;
            cachedIndex = snapped;

            // Prefetch the partner page before the first Two-Page draw (prevents pop-in).
            const pp = prefetchTwoPagePartner(snapped);
            if (pp) { try { await pp; } catch {} }

            if (!document.body.classList.contains('inPlayer')) return;
            if (!(isTwoPageFlipMode(getControlMode()) || getControlMode() === 'autoFlip')) return;
            if (appState.pageIndex !== snapped) return;
            if ((appState.tokens.mode || 0) !== modeTok) return;
            try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
          })
          .catch(() => {});
      }
    }

    if (isTwoPageFlipMode(want) || want === 'autoFlip') {
      // Kick off decoding for the paired page so Two-Page can render immediately.
      (async () => {
        const pair = getTwoPagePair(appState.pageIndex);
        const need = [];
        if (pair?.isSpread) {
          need.push(pair.rightIndex);
        } else if (pair?.coverAlone) {
          need.push(0);
        } else {
          need.push(pair.rightIndex);
          if (Number.isFinite(pair.leftIndexOrNull)) need.push(pair.leftIndexOrNull);
        }
    
        // Build 22: small safe parallelism (<=2 partner pages) reduces await-in-loop stalls.
        await Promise.all(
          need
            .filter((j) => Number.isFinite(j) && j !== appState.pageIndex)
            .map((j) => getBitmapAtIndex(j).catch(() => null))
        );
    
        if (!document.body.classList.contains('inPlayer')) return;
        if (!(isTwoPageFlipMode(getControlMode()) || getControlMode() === 'autoFlip')) return;
        if ((appState.tokens.mode || 0) !== modeTok) return;
        if (!cachedBmp) return;
        try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
      })();
    }

    // Redraw immediately so mode switches take effect visually.
    if (document.body.classList.contains('inPlayer') && cachedBmp) {
      if (isTwoPageFlipMode(want) || want === 'autoFlip') { // BUILD9_MANGAPLUS_MODE
        const pp = prefetchTwoPagePartner(appState.pageIndex, { redrawWhenReady: true });
        if (!pp) {
          try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
        }
        // If pp is pending, redraw happens when the partner is ready (avoids pop-in).
      } else {
        try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
      }
    }

    if (enteringAutoFlip) startAutoFlipTimer();
    try { syncTransportGlyph(); } catch {}

    const showToast = (opts.toast !== false);
    if (showToast) playerToast(`Mode: ${getControlModeLabel(want)}`);
  }

  function toggleControlMode(opts = {}) {
    const cur = getControlMode();
    // FIND_THIS:TWO_PAGE_MODE_CYCLE_M (Build 47A1)
    // FIND_THIS:TWO_PAGE_SCROLL_MODE_CYCLE_M (Build 47A6-1)
    // FIND_THIS:AUTO_FLIP_MODE_CYCLE_M (Tankoban Build 3)
    const idx = CONTROL_MODE_DEFS.findIndex(m => m.id === cur);
    const next = CONTROL_MODE_DEFS[(idx + 1 + CONTROL_MODE_DEFS.length) % CONTROL_MODE_DEFS.length].id;
    setControlMode(next, opts);
  }

  // --- Mode menu (YouTube-resolution style) ---
  let modeMenuEl = null;
  let modeMenuOpen = false;
  // BUILD 7: Build 23 uses the same dropdown pattern, but Build 7 can open it from
  // multiple UI anchors (the hidden quick button, or the Mega Settings "Mode" row).
  // Tracking the active anchor keeps click-outside and resize repositioning stable
  // without touching engine/key logic.
  let modeMenuAnchorEl = null;

  function closeModeMenu() {
    if (!modeMenuOpen) return;
    modeMenuOpen = false;
    try { modeMenuEl?.remove(); } catch {}
    modeMenuEl = null;
    modeMenuAnchorEl = null;
    window.removeEventListener('pointerdown', onModeMenuOutsidePointerDown, true);
    window.removeEventListener('keydown', onModeMenuKeyDown, true);
    window.removeEventListener('resize', onModeMenuResize, true);
  }

  function clampMenuToScreen(left, top, w, h, pad = 8) {
    const maxL = Math.max(pad, (window.innerWidth || 0) - w - pad);
    const maxT = Math.max(pad, (window.innerHeight || 0) - h - pad);
    return {
      left: clamp(left, pad, maxL),
      top: clamp(top, pad, maxT),
    };
  }

  function positionModeMenu(anchorEl) {
    if (!modeMenuEl || !anchorEl) return;
    const r = anchorEl.getBoundingClientRect();

    // Measure after it is in the DOM.
    const w = modeMenuEl.offsetWidth || 0;
    const h = modeMenuEl.offsetHeight || 0;

    // Prefer opening above the button (HUD is at the bottom).
    let left = r.left;
    let top = r.top - h - 8;

    // If there's no room above, open below.
    if (top < 8) top = r.bottom + 8;

    const c = clampMenuToScreen(left, top, w, h, 8);
    modeMenuEl.style.left = `${c.left}px`;
    modeMenuEl.style.top = `${c.top}px`;
  }

  function openModeMenu(anchorEl) {
    if (!document.body.classList.contains('inPlayer')) return;
    if (!anchorEl) return;

    // Toggle behavior
    if (modeMenuOpen) { closeModeMenu(); return; }

    closeModeMenu();
    modeMenuOpen = true;
    modeMenuAnchorEl = anchorEl;

    const cur = getControlMode();
    const menu = document.createElement('div');
    menu.className = 'modeMenu';
    menu.setAttribute('role', 'menu');

    // Build from definitions so future modes are trivial to add.
    menu.innerHTML = CONTROL_MODE_DEFS.map(d => {
      const active = (d.id === cur) ? ' active' : '';
      return `<button type="button" class="modeMenuItem${active}" role="menuitemradio" aria-checked="${d.id === cur ? 'true' : 'false'}" data-mode="${d.id}">${d.label}</button>`;
    }).join('');

    menu.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('.modeMenuItem');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-mode');
      if (id) setControlMode(id, { toast: true });
      closeModeMenu();
    });

    // Prevent clicks inside from bubbling into the reader click zones.
    menu.addEventListener('pointerdown', (e) => { e.stopPropagation(); }, true);

    document.body.appendChild(menu);
    modeMenuEl = menu;

    positionModeMenu(modeMenuAnchorEl);

    window.addEventListener('pointerdown', onModeMenuOutsidePointerDown, true);
    window.addEventListener('keydown', onModeMenuKeyDown, true);
    window.addEventListener('resize', onModeMenuResize, true);
  }

  function onModeMenuOutsidePointerDown(e) {
    const t = e.target;
    if (!modeMenuEl) { closeModeMenu(); return; }
    if (modeMenuEl.contains(t)) return;
    // Clicking the opener again should not immediately close the menu via the global
    // click-outside handler; the opener's own click toggles are handled elsewhere.
    if (t === modeMenuAnchorEl || t === el.quickModeBtn) return;
    closeModeMenu();
  }

  function onModeMenuKeyDown(e) {
    if (!modeMenuOpen) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeModeMenu();
    }
  }

  function onModeMenuResize() {
    if (!modeMenuOpen) return;
    // Keep the dropdown attached to whichever UI control opened it.
    try { positionModeMenu(modeMenuAnchorEl || el.quickModeBtn); } catch {}
  }


  // -----------------------------
  // BUILD8_IMAGE_FIT_TOGGLE: Double Page flick image fit menu (Fit Height / Fit Width).
  // BUILD9_MANGAPLUS_MODE: MangaPlus is the same renderer; it simply defaults to Fit Width.
  //
  // Key idea:
  // - Fit Height preserves the legacy "fit inside viewport" behavior.
  // - Fit Width is width-driven (never height-clamped). If the spread becomes taller than
  //   the viewport, we pan it vertically with the wheel (see wheelToScrubNavigation + drawTwoPageFrame).
  // -----------------------------
  let imageFitMenuEl = null;
  let imageFitMenuOpen = false;
  let imageFitMenuAnchorEl = null;

  function normalizeTwoPageImageFit(v) {
    return (v === 'width' || v === 'height') ? v : 'height';
  }


  // BUILD44_MANGAPLUS_ZOOM: setting helpers for MangaPlus zoom.
  function normalizeTwoPageMangaPlusZoomPct(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 100;
    return clamp(Math.round(n), 100, 260);
  }

  function getTwoPageMangaPlusZoomPct() {
    return normalizeTwoPageMangaPlusZoomPct(appState.settings?.twoPageMangaPlusZoomPct);
  }

  function setTwoPageMangaPlusZoomPct(pct) {
    if (!appState?.settings) return;
    const next = normalizeTwoPageMangaPlusZoomPct(pct);
    if (appState.settings.twoPageMangaPlusZoomPct === next) return;
    appState.settings.twoPageMangaPlusZoomPct = next;

    scheduleProgressSave();

    // Keep UI values in sync.
    try { syncMegaMainValues(); } catch {}
    try { syncControlModeUi(); } catch {}

    // Snap pan for MangaPlus zoom (reader owns the actual pan state).
    try {
      if (typeof window.resetTwoPageFlickPan === 'function') {
        window.resetTwoPageFlickPan({ redraw: false });
      }
    } catch {}

    // Re-render immediately if we are actively viewing MangaPlus two-page.
    if (document.body.classList.contains('inPlayer') && cachedBmp && isTwoPageMangaPlusMode(getControlMode())) {
      try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
    }
  }

  // Which per-series setting key is the source of truth depends on the active flick mode.
  function getTwoPageImageFitSettingKey(mode = getControlMode()) {
    return isTwoPageMangaPlusMode(mode) ? 'twoPageMangaPlusImageFit' : 'twoPageFlipImageFit';
  }

  function getTwoPageImageFit(mode = getControlMode()) {
    const key = getTwoPageImageFitSettingKey(mode);
    return normalizeTwoPageImageFit(appState.settings?.[key]);
  }

  function setTwoPageImageFit(mode, fit) {
    const key = getTwoPageImageFitSettingKey(mode);
    const next = normalizeTwoPageImageFit(fit);
    if (!appState.settings) return;
    if (appState.settings[key] === next) return;
    appState.settings[key] = next;

    // Build 8 requirement: the choice must persist across restarts.
    scheduleProgressSave();

    // If the Mega panel is open, keep the visible value in sync.
    try { syncMegaMainValues(); } catch {}

    // Build 35: keep scrub-bar Image Fit tooltip in sync, too.
    try { syncControlModeUi(); } catch {}

    // Re-render immediately if we are in a Double Page flick mode.
    if (document.body.classList.contains('inPlayer') && cachedBmp && isTwoPageFlipMode(getControlMode())) {
      try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
    }
  }

  function twoPageImageFitLabel(fit) {
    const v = normalizeTwoPageImageFit(fit);
    return (v === 'width') ? 'Fit Width' : 'Fit Height';
  }

  function closeImageFitMenu() {
    if (!imageFitMenuOpen) return;
    imageFitMenuOpen = false;
    try { imageFitMenuEl?.remove(); } catch {}
    imageFitMenuEl = null;
    imageFitMenuAnchorEl = null;
    window.removeEventListener('pointerdown', onImageFitMenuOutsidePointerDown, true);
    window.removeEventListener('keydown', onImageFitMenuKeyDown, true);
    window.removeEventListener('resize', onImageFitMenuResize, true);
  }

  function positionImageFitMenu(anchorEl) {
    if (!imageFitMenuEl || !anchorEl) return;
    const r = anchorEl.getBoundingClientRect();

    // Measure after it is in the DOM.
    const w = imageFitMenuEl.offsetWidth || 0;
    const h = imageFitMenuEl.offsetHeight || 0;

    // Prefer opening above (Mega panel sits at the bottom).
    let left = r.left;
    let top = r.top - h - 8;
    if (top < 8) top = r.bottom + 8;

    const c = clampMenuToScreen(left, top, w, h, 8);
    imageFitMenuEl.style.left = `${c.left}px`;
    imageFitMenuEl.style.top = `${c.top}px`;
  }

  function openImageFitMenu(anchorEl) {
    if (!document.body.classList.contains('inPlayer')) return;
    if (!anchorEl) return;

    // Only meaningful for the two Double Page flick modes.
    if (!isTwoPageFlipMode(getControlMode())) return;

    // Toggle behavior
    if (imageFitMenuOpen) { closeImageFitMenu(); return; }

    closeImageFitMenu();
    imageFitMenuOpen = true;
    imageFitMenuAnchorEl = anchorEl;

    const cur = getTwoPageImageFit(getControlMode());
    const menu = document.createElement('div');
    // Reuse the existing dropdown styling to keep diffs localized (no new CSS).
    menu.className = 'modeMenu';
    menu.setAttribute('role', 'menu');

    const mode = getControlMode();
    const isMp = isTwoPageMangaPlusMode(mode);
    const curZoom = isMp ? getTwoPageMangaPlusZoomPct() : 100;

    const fitDefs = [
      { id: 'height', label: 'Fit Height' },
      { id: 'width', label: 'Fit Width' },
    ];

    const zoomDefs = isMp ? [100, 125, 150, 200] : [];

    let html = '';
    html += fitDefs.map(d => {
      const active = (d.id === cur) ? ' active' : '';
      return `<button type="button" class="modeMenuItem${active}" role="menuitemradio" aria-checked="${d.id === cur ? 'true' : 'false'}" data-fit="${d.id}">${d.label}</button>`;
    }).join('');

    if (isMp) {
      // Inline separator to avoid CSS changes.
      html += `<div style="height:1px;background:rgba(255,255,255,0.12);margin:6px 0;"></div>`;
      html += zoomDefs.map(z => {
        const active = (z === curZoom) ? ' active' : '';
        return `<button type="button" class="modeMenuItem${active}" role="menuitemradio" aria-checked="${z === curZoom ? 'true' : 'false'}" data-zoom="${z}">Zoom ${z}%</button>`;
      }).join('');
      html += `<button type="button" class="modeMenuItem" role="menuitem" data-resetpan="1">Reset Pan</button>`;
    }

    menu.innerHTML = html;

    menu.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('.modeMenuItem');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const fit = btn.getAttribute('data-fit');
      const zoom = btn.getAttribute('data-zoom');
      const resetPan = btn.getAttribute('data-resetpan');

      if (fit) {
        setTwoPageImageFit(getControlMode(), fit);
      } else if (zoom && isTwoPageMangaPlusMode(getControlMode())) {
        setTwoPageMangaPlusZoomPct(parseInt(zoom, 10));
      } else if (resetPan) {
        try {
          if (typeof window.resetTwoPageFlickPan === 'function') {
            window.resetTwoPageFlickPan({ topY: true, redraw: true });
          }
        } catch {}
      }

      closeImageFitMenu();
    });

    // Prevent clicks inside from bubbling into the reader click zones.
    menu.addEventListener('pointerdown', (e) => { e.stopPropagation(); }, true);

    document.body.appendChild(menu);
    imageFitMenuEl = menu;

    positionImageFitMenu(imageFitMenuAnchorEl);

    window.addEventListener('pointerdown', onImageFitMenuOutsidePointerDown, true);
    window.addEventListener('keydown', onImageFitMenuKeyDown, true);
    window.addEventListener('resize', onImageFitMenuResize, true);
  }

  function onImageFitMenuOutsidePointerDown(e) {
    const t = e.target;
    if (!imageFitMenuEl) { closeImageFitMenu(); return; }
    if (imageFitMenuEl.contains(t)) return;
    if (t === imageFitMenuAnchorEl || t === el.megaRowImageFit) return;
    closeImageFitMenu();
  }

  function onImageFitMenuKeyDown(e) {
    if (!imageFitMenuOpen) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeImageFitMenu();
    }
  }

  function onImageFitMenuResize() {
    if (!imageFitMenuOpen) return;
    try { positionImageFitMenu(imageFitMenuAnchorEl || el.megaRowImageFit); } catch {}
  }


  function syncSettingsUi() {
    // Portrait width chips
    document.querySelectorAll('.chip[data-pw]').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.pw, 10) === appState.settings.portraitWidthPct);
    });
    if (el.pwText) el.pwText.textContent = `${appState.settings.portraitWidthPct}%`;

    // Speed chip highlight (legacy DOM; derived from continuous scrollPxPerSec)
    setSpeedActive(scrollSpeedLevelFromPx(appState.settings.scrollPxPerSec || DEFAULTS.scrollPxPerSec));

    // Control mode button + speed enable/disable
    syncControlModeUi();
  

    // BUILD 19H_IMAGE_FX (Build 19H)
    applyImageFxToStage();
    syncLoupeEnabled();
}

async function resetSeriesSettings() {
  if (!appState.book?.seriesId) {
    // No active series yet; just reset current settings.
    appState.settings = { ...DEFAULTS };
    syncSettingsUi();
    toast('Series settings reset');
    return;
  }

  await clearSeriesSettings(appState.book.seriesId);
  appState.settings = { ...DEFAULTS };
  syncSettingsUi();

  if (document.body.classList.contains('inPlayer') && appState.pages.length) {
    clearCachedBmp(false);
    await ensureCachedBmp(true);
    drawActiveFrame(cachedBmp, cachedSpread);
  }

  scheduleProgressSave();
  toast('Series settings reset');
}


  function resetToDefaults() {
    appState.settings = { ...DEFAULTS };
    syncSettingsUi();
    toast('Defaults reset');

    if (document.body.classList.contains('inPlayer') && appState.pages.length) {
      clearCachedBmp(false);
      ensureCachedBmp(true).then(() => {
        drawActiveFrame(cachedBmp, cachedSpread);
        scheduleProgressSave();
      });
    } else {
      // Library-only reset still persists
      scheduleProgressSave();
    }
  }
  function toggleSpreadFitMode() {
    // Build 31: spreads are fit-only (Weeb Central parity).
    if (!appState?.settings) return;
    const prev = appState.settings.spreadFitMode;
    appState.settings.spreadFitMode = 'fit';
    if (prev !== 'fit') scheduleProgressSave();
    toast('Spreads: fit');

    if (document.body.classList.contains('inPlayer') && cachedBmp && cachedSpread) {
      drawActiveFrame(cachedBmp, true);
    }
  }

// Build 14: single reading mode only (infinite strip).
// Keep the function for compatibility with older UI bindings, but make it a no-op.
async function toggleScrollMode() {
  if (!appState?.settings) return;
  appState.settings.scrollMode = 'infinite';

  playerToast('Infinite Scroll');
  scheduleProgressSave();
}

  const DEFAULTS = {
    portraitWidthPct: 100,
    scrollPxPerSec: 190,
    topHoldSec: 0.55,
    bottomHoldSec: 0.55,
    spreadHoldSec: 6.0,
    spreadFitMode: 'fit', // fit-only (no crop)

    // BUILD8_IMAGE_FIT_TOGGLE: image fit for Double Page flick rendering.
    // Why: Fit Height can make text unreadable on widescreen; Fit Width preserves readability
    // by allowing tall spreads to overflow vertically (panned via wheel).
    // Values: 'height' | 'width'.
    twoPageFlipImageFit: 'height',
    // BUILD9_MANGAPLUS_MODE: MangaPlus defaults to Fit Width for readability, but stays per-mode.
    twoPageMangaPlusImageFit: 'width',

    // BUILD44_MANGAPLUS_ZOOM: per-series zoom percent for MangaPlus Double Page mode.
    // UI presets: 100, 125, 150, 200. Reader clamps to a wider safe range.
    twoPageMangaPlusZoomPct: 100,

    // FIND_THIS:TWO_PAGE_SCROLL_ROW_GAP_SETTING (Tankoban Build 5)
    twoPageScrollRowGapPx: 16,

    // BUILD18_COUPLING_NUDGE: user toggle to shift two-page coupling by 1 when a volume drifts mid-book.
    // 0 = normal (Build 17 physical parity), 1 = shifted (flip parity after cover).
    twoPageCouplingNudge: 0,

    scrollMode: 'infinite', // 'infinite' | 'singlePage'
    controlMode: 'manual', // 'manual' | 'auto'
    // BUILD16C_AUTOFIP_INTERVAL: Auto Flip interval (seconds) for this volume/series settings.
    autoFlipIntervalSec: 30,
    autoScrollMode: 'normal', // legacy (Build 43A); kept only for older saved settings
    continuousScroll: true,


    // BUILD 19H_IMAGE_FX (Build 19H)
    // INTENT: Use primitive settings to avoid shared-reference bugs when defaults are spread/cloned.
    imageBrightnessPct: 100,   // 60..140
    imageContrastPct: 100,     // 60..140

    // BUILD21_IMGFX_EXT (Build 21)
    // SETTINGS SCHEMA (display-only filters + interpolation):
    // - imageBrightnessPct: number (50..150), percent.
    // - imageContrastPct:   number (50..150), percent.
    // - imageSaturatePct:   number (0..200), percent (100 = identity).
    // - imageSepiaPct:      number (0..100), percent (0 = identity).
    // - imageHueDeg:        number (0..360), degrees (0 = identity).
    // - imageInvert:        0/1 (checkbox).
    // - imageGrayscale:     0/1 (checkbox).
    // - imageScaleQuality:  'off' | 'smooth' | 'sharp' | 'pixel' (canvas interpolation choice).
    imageSaturatePct: 100,
    imageSepiaPct: 0,
    imageHueDeg: 0,
    // BUILD 25 v2
    // INTENT: Default must be neutral. 'off' means "do not override browser/canvas scaling defaults".
    imageScaleQuality: 'off',
    
    // BUILD28_ROTATE_CROP
    // Per-series render transforms (applied to all modes).

    // BUILD29_CACHE_BY_BYTES
    memorySaver: false,

    imageInvert: 0,            // 0/1 (checkbox)
    imageGrayscale: 0,         // 0/1 (checkbox)

    // BUILD 19H_GUTTER_SHADOW (Build 19H)
    // INTENT: Slight depth cue between pages without changing layout math. 0 disables.
    twoPageGutterShadow: 0.35, // 0..1

    // BUILD 19H_LOUPE (Build 19H)
    // INTENT: Toggleable magnifier HUD for fine text readability. No keybinding changes.
    loupeEnabled: false,
  loupeZoom: 2.0,
    loupeSizePx: 220,
  };

  function migrateLegacySpeedPreset(settings) {
    if (!settings || typeof settings !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(settings, 'speedPreset')) return false;

    // Fixed mapping used only for one-time migration of legacy preset levels (1–10) → px/s.
    const MIGRATION_PRESET_TO_PX = [80, 100, 125, 155, 190, 235, 290, 360, 450, 560];

    const lvl = clampSpeedLevel(normalizeSpeedPresetId(settings.speedPreset));
    const hasPx = Number.isFinite(Number(settings.scrollPxPerSec)) && Number(settings.scrollPxPerSec) > 0;

    if (!hasPx) {
      settings.scrollPxPerSec = MIGRATION_PRESET_TO_PX[lvl - 1] || DEFAULTS.scrollPxPerSec;
    }

    delete settings.speedPreset;
    return true;
  }

function pickSettings(obj) {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  }
  return out;
}

async function loadSeriesSettings(seriesId) {
  if (!seriesId) return null;
  try {
    const res = await Tanko.api.seriesSettings.get(seriesId);
    if (!res) return null;

    let raw = null;
    if (res.settings && typeof res.settings === 'object') raw = res.settings;
    else if (typeof res === 'object') raw = res;

    if (!raw || typeof raw !== 'object') return null;

    const next = { ...raw };
    const migratedA = migrateLegacySpeedPreset(next);
    const migrated = migratedA;
    if (migrated) {
      // Persist the cleaned settings so future loads are already on the new model.
      await saveSeriesSettings(seriesId, next);
    }

    const picked = pickSettings(next);
    try { lastSeriesSettingsSavedJson.set(seriesId, JSON.stringify(picked)); } catch {}
    return picked;
  } catch {
    return null;
  }
}

// BUILD19_SERIES_SETTINGS_DEDUP (Build 19)
// Avoid redundant disk writes by skipping saves when picked settings are unchanged.
const lastSeriesSettingsSavedJson = new Map(); // seriesId -> json

async function saveSeriesSettings(seriesId, settings) {
  if (!seriesId) return;
  try {
    const picked = pickSettings(settings);
    const sig = JSON.stringify(picked);
    if (lastSeriesSettingsSavedJson.get(seriesId) === sig) return;
    lastSeriesSettingsSavedJson.set(seriesId, sig);
    await Tanko.api.seriesSettings.save(seriesId, picked);
  } catch {}
}

async function clearSeriesSettings(seriesId) {
  if (!seriesId) return;
  try { lastSeriesSettingsSavedJson.delete(seriesId); } catch {}
  try { await Tanko.api.seriesSettings.clear(seriesId); } catch {}
}

  let appState = {
    library: { seriesFolders: [], series: [], books: [] },
    progressAll: {},
    selectedSeriesId: null,

    // active book
    book: null,
    zip: null,
    cbzSessionId: null, // BUILD 19D: main-process CBZ session for lazy page reads
    cbrSessionId: null, // BUILD 19E: main-process CBR session for lazy-ish page reads
    pages: [],
    pageIndex: 0,

    // Build 25: navigation busy flag (used to gate click-zone paging during in-flight loads)
    navBusy: false,
    
    
    // Build 22: request tokens (latest action wins).
    // INTENT: Protect against race conditions during rapid inputs / mode switches / volume opens.
    tokens: { volume: 0, nav: 0, mode: 0, open: 0 },
    
    // Build 22: coalesced navigation (only the latest pending request is applied).
    pendingNav: null,
    navDrainPromise: null,
    navDrainResolve: null,

    // playback
    playing: false,
    autoFlipPaused: false, // BUILD19B_AUTOFIP_TRANSPORT: pause/resume Auto Flip timer
    mode: 'portraitStrip', // 'portraitStrip' | 'spreadHold' | 'topHold' | 'scroll' | 'bottomHold'
    tMode: 0,
    y: 0,
    yMax: 0,
    settings: { ...DEFAULTS },

    // Build 33: manual scroller state + guardrails
    manualScrollerDragging: false,
    manualScrollerDragProgress: 0,

    // Build 33: expose scrub dragging state for guardrails
    scrubDragging: false,

    hudHidden: false,

    // Build 41C: Manual Scroll HUD can be pinned (no auto-hide).
    hudPinned: false,

    // Build 26: allow manual HUD hide (H / right-click) to stay pinned.
    // Auto-hide logic never overrides this; user must explicitly show HUD again.
    hudPinnedHidden: false,

    wasPlayingBeforeHud: false,

    megaOpen: false,
    megaSub: 'main',
    // BUILD 25 v2
    // appState.megaNavStack: Array<{ subId: string, title: string }>
    // INTENT: Track actual navigation history so Back cannot skip levels.
    megaNavStack: [],
    wasPlayingBeforeMega: false,

    // Build 25 — Mega Settings open mode.
    // INTENT: Reuse the same Mega Settings overlay and builders; only change positioning when invoked via right-click.
    // appState.megaOpenMode: 'corner'|'floater'
    megaOpenMode: 'corner',
    // appState.megaAnchor: { x:number, y:number } (cursor anchor for floater mode)
    megaAnchor: { x: 0, y: 0 },

    volNavOpen: false,
    volNavSel: 0,
    volNavQuery: "",
    volNavVisibleBooks: [],
    wasPlayingBeforeVolNav: false,

    // Build 23: carry play/pause intent across overlay switches (single-open rule)
    wasPlayingBeforeSpeedSlider: false,
    wasPlayingBeforeKeys: false,

    endOverlayOpen: false,
    endNextBook: null,
    wasPlayingBeforeEnd: false,

    ui: {
      volSort: (localStorage.getItem('volSort') || 'numerical'),
      volSearch: '',
      volHidePreview: (localStorage.getItem('volHidePreview') === '1'),
      volSelBookId: null,
      hideFinished: (localStorage.getItem('hideFinished') === '1'),

      // BUILD16C_SCAN_STATUS: true while library scan worker is refreshing cached index
      libraryScanning: false,
      libraryScanProgress: null,

      // Build 42A: Library Settings persistence (reader behavior unchanged in this build)
      autoScrollBaseSecondsPerScreen: (() => {
        const raw = parseInt(localStorage.getItem('autoScrollBaseSecondsPerScreen') || '', 10);
        const v = Number.isFinite(raw) ? raw : 25;
        return Math.min(60, Math.max(5, v));
      })(),
      autoScrollStepPct: (() => {
        const raw = parseInt(localStorage.getItem('autoScrollStepPct') || '', 10);
        const v = Number.isFinite(raw) ? raw : 15;
        return Math.min(50, Math.max(1, v));
      })(),
      globalSearch: '',
      globalSearchSel: 0,
      folderFocusRoot: null,
    },
  };

  // Fast lookup (used by thumbnail lazy-loader and continue reading)
  let bookById = new Map();

  // BUILD 19E_EXTERNAL_THUMBS (Build 19E)
  // INTENT: Continue Reading can include "Open File" books not present in the library index.
  // thumbObserver needs a fallback map for those books.
  let bookByIdExtra = new Map();

  // BUILD 16: avoid registering multiple library update listeners.
  let didHookLibraryUpdates = false;

  // BUILD16B_RENDER_COALESCE: coalesce multiple library rerenders into one animation frame.
  let renderLibraryScheduled = false;

  // BUILD 8: Prefer explicit hooks over implicit global cross-calls.
  function callRenderLibrary() {
    const fn = (window.libraryHooks && typeof window.libraryHooks.renderLibrary === 'function')
      ? window.libraryHooks.renderLibrary
      : (typeof renderLibrary === 'function' ? renderLibrary : null);
    try { if (fn) return fn(); } catch {}
  }
  function scheduleRenderLibrary() {
    if (renderLibraryScheduled) return;
    renderLibraryScheduled = true;
    requestAnimationFrame(() => {
      renderLibraryScheduled = false;
      callRenderLibrary();
    });
  }


  // BUILD 16: derived caches to avoid N×M filter/sort hot spots.
  // seriesCoverBookBySeriesId: seriesId -> cover book (first volume by natural title sort)
  let seriesCoverBookBySeriesId = new Map();
  // seriesBooksSortedBySeriesId: seriesId -> Book[] sorted by title (naturalCompare)
  let seriesBooksSortedBySeriesId = new Map();

  function buildLibraryDerivedCaches() {
    // BUILD 16: precompute per-series book lists once per library load.
    seriesCoverBookBySeriesId = new Map();
    seriesBooksSortedBySeriesId = new Map();

    const bySeries = new Map();
    for (const b of (appState.library.books || [])) {
      if (!b?.seriesId) continue;
      if (!bySeries.has(b.seriesId)) bySeries.set(b.seriesId, []);
      bySeries.get(b.seriesId).push(b);
    }

    for (const [sid, list] of bySeries.entries()) {
      list.sort((a,b)=> naturalCompare(a.title, b.title));
      seriesBooksSortedBySeriesId.set(sid, list);
      if (list[0]) seriesCoverBookBySeriesId.set(sid, list[0]);
    }

    try {
      const rebuild = window.libraryHooks && typeof window.libraryHooks.rebuildSearchIndex === 'function'
        ? window.libraryHooks.rebuildSearchIndex
        : null;
      if (rebuild) rebuild();
    } catch {}
  }

  // Modifier keys (for the "gas pedal" throttle)
  const modKeys = { shift: false, ctrl: false };
  function setModKey(code, down) {
    if (code === 'ShiftLeft' || code === 'ShiftRight') modKeys.shift = down;
    if (code === 'ControlLeft' || code === 'ControlRight') modKeys.ctrl = down;
  }


function setReaderMode(next) {
    if (appState.mode === next) return;
    appState.mode = next;
    appState.tMode = 0;
  }

  function isSpread(w,h) {
    return (w > h) || (w / h >= 1.08);
  }

  function isSinglePageMode() {
    const sm = (appState.settings?.scrollMode) || 'infinite';
    return sm === 'singlePage';
  }

  function setView(which) {
    const lib = which === 'library';
    el.libraryView.classList.toggle('hidden', !lib);
    el.playerView.classList.toggle('hidden', lib);
    document.body.classList.toggle('inPlayer', !lib);

    if (lib) {
      // BUILD 19D_CBZ_CLOSE_ON_LEAVE (Build 19D)
      // INTENT: Leaving the reader should release the open CBZ file handle in main.
      closeCurrentComicSession();
      hideEndOverlay();
      // Build 40: stop HUD auto-hide work while in the library.
      // BUILD 8: call into reader via explicit hook, with a back-compat fallback.
      const hook = (window.readerHooks && typeof window.readerHooks.onEnterLibrary === 'function')
        ? window.readerHooks.onEnterLibrary
        : null;
      if (hook) {
        try { hook(); } catch {}
      } else {
        hudCancelAutoHide();
        document.body.classList.remove('hudFreeze');
        try { setHudHiddenAuto(false); } catch {}
        hudHoverScrub = false;
        hudHoverHud = false;
      }
    } else {
      // Build 42A: Library-only overlays should never persist into the reader.
      if (el.librarySettingsOverlay) el.librarySettingsOverlay.classList.add('hidden');
      // Build 40: entering player view starts the HUD inactivity clock.
      // BUILD 8: call into reader via explicit hook, with a back-compat fallback.
      const hook = (window.readerHooks && typeof window.readerHooks.onEnterPlayer === 'function')
        ? window.readerHooks.onEnterPlayer
        : null;
      if (hook) {
        try { hook(); } catch {}
      } else {
        hudHoverScrub = false;
        hudHoverHud = false;
        try { recomputeManualScrollerMaxTopCache(); } catch {}
        try { setHudHiddenAuto(false); } catch {}
        hudSyncFreezeClass();
        hudScheduleAutoHide();
      }
    }
  }
  function closeCurrentComicSession() {
    // BUILD 19E_COMIC_CLOSE (Build 19E)
    // INTENT: Close any open archive session (CBZ or CBR) when leaving reader / switching volumes.
    const cbzSid = appState.cbzSessionId;
    const cbrSid = appState.cbrSessionId;

    appState.cbzSessionId = null;
    appState.cbrSessionId = null;

    if (cbzSid) {
      try { Promise.resolve(Tanko.api.archives.cbzClose(cbzSid)).catch(() => {}); } catch {}
    }
    if (cbrSid) {
      try { Promise.resolve(Tanko.api.archives.cbrClose(cbrSid)).catch(() => {}); } catch {}
    }
  }

  // Back-compat name (in case other code still calls it)
  function closeCurrentCbzSession() { closeCurrentComicSession(); }

  function sortedBooksInSeries(seriesId) {
    const list = seriesBooksSortedBySeriesId.get(seriesId);
    return list ? list.slice() : [];
  }

  function getNextBookInSeries(book) {
    if (!book?.seriesId) return null;
    const list = sortedBooksInSeries(book.seriesId);
    const i = list.findIndex(x => x.id === book.id);
    if (i < 0) return null;
    return list[i + 1] || null;
  }

  function showEndOverlay() {
    if (!document.body.classList.contains('inPlayer')) return;
    if (!el.endOverlay) return;
    if (appState.endOverlayOpen) return;

    appState.endOverlayOpen = true;
    appState.wasPlayingBeforeEnd = !!appState.playing;

    pauseLoop();
    // Keep the animation loop running only for drawing; it will early-return while paused.

    // BUILD16C_CONTINUE_REMOVE_READ: reaching the end counts as read/finished.
    // Mark finished before saving so it disappears from Continue Reading.
    try {
      if (appState.book?.id) {
        const id = appState.book.id;
        const prev = appState.progressAll[id] || {};
        appState.progressAll[id] = {
          ...prev,
          finished: true,
          finishedAt: prev.finishedAt || Date.now(),
        };
      }
    } catch {}

    // Make sure the final position is saved.
    scheduleProgressSave();

    appState.endNextBook = getNextBookInSeries(appState.book);
    el.endSubtitle.textContent = appState.endNextBook
      ? `Next: ${appState.endNextBook.title}`
      : 'No next volume found in this series.';
    el.endNextVolumeBtn.classList.toggle('hidden', !appState.endNextBook);

    el.endOverlay.classList.remove('hidden');
    try { hudRefreshAfterUiChange(); } catch {}
  }

  function hideEndOverlay() {
    appState.endOverlayOpen = false;
    appState.endNextBook = null;
    appState.wasPlayingBeforeEnd = false;
    if (el.endOverlay) el.endOverlay.classList.add('hidden');
    try { hudRefreshAfterUiChange(); } catch {}
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }


  // -----------------------------
  // Thumbnails (cached on disk in userData/thumbs)
  // -----------------------------
  const thumbMem = new Map(); // bookId -> dataURL
  const thumbInFlight = new Map();

  function withLimit(limit) {
    let active = 0;
    const q = [];
    const runNext = () => {
      if (active >= limit || q.length === 0) return;
      active++;
      const { fn, resolve, reject } = q.shift();
      Promise.resolve()
        .then(fn)
        .then(v => { active--; resolve(v); runNext(); })
        .catch(e => { active--; reject(e); runNext(); });
    };
    return (fn) => new Promise((resolve, reject) => { q.push({ fn, resolve, reject }); runNext(); });
  }

  // Keep this low: thumbnail decoding can stutter if it competes with the scroller.
  const thumbQueue = withLimit(3);

  async function generateThumbFromBook(book) {
    // Do not generate thumbs while in the player view (keeps volume open + paging smooth).
    if (document.body.classList.contains('inPlayer')) return null;

    // BUILD 19D_THUMB_LAZY_CBZ (Build 19D)
    // INTENT: Thumbnail generation should not read entire archives into memory.
    // Open a short-lived CBZ session in main and fetch only the needed entry bytes.
    let thumbSessionId = null;
    let thumbKind = 'cbz';
    try {
      const lower = String(book?.path || '').toLowerCase();
      thumbKind = lower.endsWith('.cbr') ? 'cbr' : 'cbz';

      const opened = (thumbKind === 'cbr')
        ? await Tanko.api.archives.cbrOpen(book.path)
        : await Tanko.api.archives.cbzOpen(book.path);

      thumbSessionId = opened.sessionId;

      const zip = {
        entries: (opened.entries || []).map((e, i) => ({ ...e, entryIndex: i })),
        getFileBytes: async (entry) => {
          const ab = (thumbKind === 'cbr')
            ? await Tanko.api.archives.cbrReadEntry(thumbSessionId, entry.entryIndex)
            : await Tanko.api.archives.cbzReadEntry(thumbSessionId, entry.entryIndex);
          return new Uint8Array(ab);
        },
      };

      const images = zip.entries
        .filter(e => /\.(png|jpe?g|webp)$/i.test(e.name))
        .sort((a,b)=>naturalCompare(a.name,b.name));

      if (!images.length) return null;

      // Try first few pages in case the first is blank/credits/corrupt
      const tryCount = Math.min(4, images.length);
      for (let i = 0; i < tryCount; i++) {
        try {
          const bytes = await zip.getFileBytes(images[i]);
          const ext = images[i].name.toLowerCase().match(/\.(png|jpe?g|webp)$/)?.[1] || 'jpeg';
          const mime = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');
          const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));

          const W = 180, H = 252;
          const c = document.createElement('canvas');
          c.width = W; c.height = H;
          const ctx = c.getContext('2d');

          ctx.fillStyle = '#000';
          ctx.fillRect(0,0,W,H);

          // cover-like crop (object-fit: cover)
          const s = Math.max(W / bmp.width, H / bmp.height);
          const dw = Math.round(bmp.width * s);
          const dh = Math.round(bmp.height * s);
          const dx = Math.floor((W - dw) / 2);
          const dy = Math.floor((H - dh) / 2);
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(bmp, 0,0,bmp.width,bmp.height, dx,dy,dw,dh);

          try { bmp.close?.(); } catch {}

          const dataUrl = c.toDataURL('image/jpeg', 0.78);
          await Tanko.api.thumbs.save(book.id, dataUrl);
          return dataUrl;
        } catch {
          // try next page
        }
      }
      return null;
    } finally {
      if (thumbSessionId) {
        try {
          if (thumbKind === 'cbr') await Tanko.api.archives.cbrClose(thumbSessionId);
          else await Tanko.api.archives.cbzClose(thumbSessionId);
        } catch {}
      }
    }
  }

  async function getOrCreateThumb(book) {
    if (!book?.id) return null;
    if (thumbMem.has(book.id)) return thumbMem.get(book.id);

    const cached = await Tanko.api.thumbs.get(book.id);
    if (cached) { thumbMem.set(book.id, cached); return cached; }

    // If we're playing, don't start new heavy work; we'll fill thumbs when back in library.
    if (document.body.classList.contains('inPlayer') && appState.playing) return null;

    if (thumbInFlight.has(book.id)) return thumbInFlight.get(book.id);

    const p = thumbQueue(async () => {
      try {
        const got = await generateThumbFromBook(book);
        if (got) thumbMem.set(book.id, got);
        return got;
      } finally {
        thumbInFlight.delete(book.id);
      }
    });

    thumbInFlight.set(book.id, p);
    return p;
  }

  // Lazy trigger: only generate when visible (helps big libraries)
  const thumbObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;

      const img = e.target;
      const bookId = img.getAttribute('data-bookid');

      // BUILD16B1_THUMBS: Never abort the whole batch because one entry is stale.
      const book = bookById?.get(bookId) || bookByIdExtra?.get(bookId);
      if (!book) continue;

      // BUILD16C_THUMBS_RETRY: if thumb generation returns null (unsupported/corrupt),
      // don't permanently strand this <img>. Retry a few times, then give up quietly.
      const tries = parseInt(img.dataset.thumbTry || '0', 10) || 0;
      if (tries >= 3) { try { thumbObserver.unobserve(img); } catch {} continue; }

      getOrCreateThumb(book)
        .then(src => {
          if (!src) {
            img.dataset.thumbTry = String(tries + 1);
            // Re-arm observer so a still-visible tile gets another attempt.
            setTimeout(() => {
              try { thumbObserver.unobserve(img); } catch {}
              try { thumbObserver.observe(img); } catch {}
            }, 250 * (tries + 1));
            return;
          }
          img.src = src;
          try { thumbObserver.unobserve(img); } catch {}
        })
        .catch(() => {});
    }
  }, { root: null, rootMargin: '600px', threshold: 0.01 });

  
  function attachThumb(imgEl, book) {
    if (!imgEl || !book) return;
    imgEl.setAttribute('data-bookid', book.id);

    // BUILD 19E_EXTERNAL_THUMBS: allow thumbs for books not in library index (Open File items)
    try {
      if (!bookById?.has(book.id)) bookByIdExtra.set(book.id, book);
    } catch {}


    // BUILD16C_THUMB_SELF_HEAL: if cached thumb file is corrupt, <img> error can strand a tile forever.
    // On first error: drop mem cache, delete cached jpg, and re-observe to regenerate.
    if (!imgEl.dataset.thumbHealHooked) {
      imgEl.dataset.thumbHealHooked = '1';
      imgEl.addEventListener('error', async () => {
        const bid = imgEl.getAttribute('data-bookid');
        if (!bid) return;
        if (imgEl.dataset.thumbHealedOnce === '1') return;
        imgEl.dataset.thumbHealedOnce = '1';
        try { thumbMem.delete(bid); } catch {}
        try { await Tanko.api.thumbs.delete(bid); } catch {}
        try { imgEl.removeAttribute('src'); } catch {}
        try { thumbObserver.observe(imgEl); } catch {}
      });
    }

    // Immediate memory cache hit
    if (thumbMem.has(book.id)) {
      imgEl.src = thumbMem.get(book.id);
      return;
    }

    // Only fetch or generate when the image becomes visible.
    thumbObserver.observe(imgEl);
  }


  // -----------------------------
  // Library (series + continue)
  // -----------------------------
  async function refreshLibrary() {
    showLoading('Loading library');
    try {
      console.log('[boot] refreshLibrary: calling library.getState...');
      appState.library = await Tanko.api.library.getState();
      console.log('[boot] refreshLibrary: getState returned', appState.library ? 'object with series=' + (appState.library.series?.length) + ' books=' + (appState.library.books?.length) : 'falsy');
      appState.progressAll = await Tanko.api.progress.getAll();
      console.log('[boot] refreshLibrary: progress loaded');
      bookById = new Map((appState.library.books || []).map(b => [b.id, b]));
      buildLibraryDerivedCaches();
      scheduleRenderLibrary();

      if (!didHookLibraryUpdates && typeof window.Tanko?.api?.library?.onUpdated === 'function') {
        didHookLibraryUpdates = true;

        Tanko.api.library.onUpdated((state) => {
          if (!state) return;
          appState.library = state;
          bookById = new Map((appState.library.books || []).map(b => [b.id, b]));
          buildLibraryDerivedCaches();
          scheduleRenderLibrary();
        });

        // BUILD16C_SCAN_STATUS: show an indicator while the scan worker is running
        if (typeof window.Tanko?.api?.library?.onScanStatus === 'function') {
          Tanko.api.library.onScanStatus((s) => {
            appState.ui.libraryScanning = !!(s && s.scanning);
  appState.ui.libraryScanProgress = (s && s.progress) ? s.progress : null;
            scheduleRenderLibrary();
          });
        }
      }
    } finally {
      hideLoading();
    }
  }


  // FIND_THIS:SERIES_CONTEXT_MENU_HELPERS (Build 45C)

  // Confirmation dialog for series removal (explicit: no disk deletion)
  async function confirmRemoveSeriesFromLibrary() {
    return await new Promise((resolve) => {
      // FIX_BATCH5: Added done guard and cancel event, matching confirmRemoveRootFolder pattern.
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        try { d.close(); } catch {}
        try { d.remove(); } catch {}
        resolve(!!v);
      };

      const d = document.createElement('dialog');
      d.style.padding = '18px';
      d.style.borderRadius = '14px';
      d.style.border = '1px solid rgba(255,255,255,.14)';
      d.style.background = 'rgba(20,20,20,.98)';
      d.style.color = 'white';
      d.style.maxWidth = '440px';

      d.innerHTML = `
        <div style="font-size:16px; font-weight:700; margin-bottom:8px;">Remove from library?</div>
        <div style="font-size:13px; line-height:1.35; opacity:.92; margin-bottom:16px;">
          This removes it from the library. It does not delete files from disk.
        </div>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button type="button" data-act="cancel" style="padding:8px 12px; border-radius:10px;">Cancel</button>
          <button type="button" data-act="remove" style="padding:8px 12px; border-radius:10px;">Remove</button>
        </div>
      `;

      d.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });
      d.querySelector('[data-act="cancel"]')?.addEventListener('click', () => finish(false));
      d.querySelector('[data-act="remove"]')?.addEventListener('click', () => finish(true));

      document.body.appendChild(d);
      try { d.showModal(); } catch { finish(false); }
    });
  }

  // Shared menu builder: use from sidebar rows and grid cards
  function openSeriesContextMenu(mouseEvent, series, rootHintPathOrNull) {
    // Don't steal native right-click from actual inputs.
    if (isTypingTarget(mouseEvent.target)) return;

    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();

    showContextMenu({
      x: mouseEvent.clientX,
      y: mouseEvent.clientY,
      items: [
        {
          label: 'Open',
          onClick: () => {
            if (rootHintPathOrNull) appState.ui.folderFocusRoot = rootHintPathOrNull;
            appState.selectedSeriesId = series.id;
            callRenderLibrary();
          },
        },
        {
          label: 'Reveal in File Explorer',
          disabled: (typeof Tanko?.api?.shell?.revealPath !== 'function'),
          onClick: async () => {
            try { await Tanko.api.shell.revealPath(series.path); } catch {}
          },
        },
        {
          // FIX_BATCH5: Renamed from "Rescan series" — action always triggers full library scan.
          label: 'Rescan library',
          onClick: async () => {
            try { await Tanko.api.library.scan({ force: true }); } catch (err) {
              console.error('[series-ctx] Rescan failed:', err);
              toast('Rescan failed', 2000);
              return;
            }
            await refreshLibrary();
            toast('Refreshing…');
          },
        },
        { separator: true },
        {
          label: 'Remove from library…',
          danger: true,
          onClick: async () => {
            const ok = await confirmRemoveSeriesFromLibrary();
            if (!ok) return;

            showLoading('Removing series');
            try {
              const res = await Tanko.api.library.removeSeriesFolder(series.path);
              if (res?.state) {
                appState.library = res.state;
                appState.progressAll = await Tanko.api.progress.getAll();
                bookById = new Map((appState.library.books || []).map(b => [b.id, b]));
                buildLibraryDerivedCaches();

                // If the removed series was selected, clear selection.
                if (appState.selectedSeriesId === series.id) appState.selectedSeriesId = null;
                callRenderLibrary();
                toast('Series removed');
              }
            } finally {
              hideLoading();
            }
          },
        },
      ],
    });
  }


  function bookMap() {
    const m = new Map();
    for (const b of (appState.library.books || [])) m.set(b.id, b);
    return m;
  }


// Minimal initial boot flow (library-first). Reader domain stays deferred until first openBook().
if (!window.__tankoInitialBootStarted) {
  window.__tankoInitialBootStarted = true;
  console.log('[boot] Starting refreshLibrary...');
  refreshLibrary().then(async () => {
    console.log('[boot] refreshLibrary completed OK');
    bootReady = true;

    // Prefer OS/DnD open over openBookId query when present.
    const openedExternal = await flushPendingExternalOpen();
    if (openedExternal) return;

    // Reader window startup support remains, but reader scripts are loaded lazily.
    // Read both current (?book=) and legacy (?openBookId=) query keys.
    const params = new URLSearchParams(window.location.search);
    const openId = params.get('book') || params.get('openBookId');
    if (!openId) return;

    const b =
      bookById.get(openId) ||
      bookByIdExtra.get(openId) ||
      (() => {
        const p = appState.progressAll?.[openId];
        const m = p?.bookMeta;
        if (!m?.path) return null;
        return { id: openId, title: m.title || '—', series: m.series || '', seriesId: m.seriesId || '', path: m.path };
      })();

    if (b?.path) {
      try { await openBook(b); } catch { toast('Failed to open in new window'); }
    } else {
      toast('Volume not found');
    }
  }).catch(err => { console.error('[boot] refreshLibrary FAILED:', err); toast(String(err)); }).finally(() => {
    try {
      const bt = window.Tanko && window.Tanko.bootTiming;
      if (bt && bt.initialBootDoneMs == null) {
        const now = (typeof performance !== 'undefined' && performance?.now) ? performance.now() : Date.now();
        bt.initialBootDoneMs = Math.round(now - Number(bt.initialStartMs || now));
        console.log(`[boot-timing] initial boot complete in ${bt.initialBootDoneMs}ms`);
      }
    } catch {}
    // FIX_BATCH8: Eagerly trigger reader module loading in the background so that
    // library-mode controls (add root/series, continue, volume sort/search, global search)
    // become responsive shortly after boot instead of waiting for the first openBook() call.
    // Addresses C06/C07/C08-P0 deferred binding issue.
    try {
      if (typeof window.Tanko?.deferred?.ensureReaderModulesLoaded === 'function') {
        window.Tanko.deferred.ensureReaderModulesLoaded().catch(() => {});
      }
    } catch {}
  });
}


// Phase 7: Single renderer state namespace (read-only references; no behavior impact)
try {
  window.Tanko = window.Tanko || {};
  window.Tanko.state = window.Tanko.state || {};
  // Keep legacy global bindings, but also provide a single discoverable state surface.
  window.Tanko.state.app = window.Tanko.state.app || appState;
  // FIX_BATCH8: Use getters so that .library and .settings always reflect the current
  // appState values even after refreshLibrary() or resetToDefaults() replace them (C04-P1-2).
  if (!Object.getOwnPropertyDescriptor(window.Tanko.state, 'library')?.get) {
    Object.defineProperty(window.Tanko.state, 'library', { get: () => appState.library, configurable: true });
  }
  if (!Object.getOwnPropertyDescriptor(window.Tanko.state, 'settings')?.get) {
    Object.defineProperty(window.Tanko.state, 'settings', { get: () => appState.settings, configurable: true });
  }
} catch {}
