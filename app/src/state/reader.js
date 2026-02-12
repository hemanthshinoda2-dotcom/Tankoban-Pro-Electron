// Build 9: moved from src/modules/reader_*.js into src/modules/reader/*
// NOTE: This is a mechanical split. Logic is unchanged.
  // Current page references (points into cache)
  let cachedBmp = null;
  let cachedSpread = false;
  let cachedIndex = -1;

  // BUILD 19H_LOUPE (Build 19H)
  // SCHEMA: lastFrameRects = [{ bmp: ImageBitmap, dstCss:{x,y,w,h}, src:{x,y,w,h} }]
  let lastFrameRects = [];

  // BUILD 20B_LOUPE_THROTTLE (Build 20B)
  // SCHEMA: loupeLastPaintTs = number (performance.now ms)
  // INTENT: Avoid jank when the loupe HUD is large by capping paints to ~30fps.
  let loupeLastPaintTs = 0;

  // BUILD19_DECODE_FAIL_COOLDOWN (Build 19)
  // Prevent hot-loop retries on a page that keeps failing to decode.
  let cachedDecodeFailIndex = -1;
  let cachedDecodeFailAt = 0;
  const DECODE_FAIL_COOLDOWN_MS = 900;

  // BUILD19_KNOWN_SPREAD_SET (Build 19)
  // Persisted per-book: indices we already learned are wide/spread pages.
  // Used to stabilize Two-Page parity even when earlier pages aren't decoded in this session.
  let knownSpreadIndexSet = new Set();

  // BUILD29_KNOWN_NORMAL_SET (Build 29)
  // INTENT: Manual override to force "not spread" even if auto-detection says spread.
  // Needed so "Mark as Normal" sticks and doesn't get re-learned.
  let knownNormalIndexSet = new Set();

  // BUILD29_SPREAD_OVERRIDE_HELPERS (Build 29)
  function getEffectiveSpreadStatus(index, originalSpreadValue) {
    const i = Number(index);
    // Default to Normal if both lanes somehow contain the index.
    try { if (knownNormalIndexSet && knownNormalIndexSet.has(i)) return false; } catch {}
    try { if (knownSpreadIndexSet && knownSpreadIndexSet.has(i)) return true; } catch {}
    return !!originalSpreadValue;
  }

  function spreadOverrideState(idx) {
    try { if (knownNormalIndexSet?.has(idx)) return 'normal'; } catch {}
    try { if (knownSpreadIndexSet?.has(idx)) return 'spread'; } catch {}
    return 'auto';
  }

  async function applySpreadOverride(idx, mode /* 'spread' | 'normal' */) {
    const max = Math.max(0, (appState.pages?.length || 1) - 1);
    idx = clampInt(idx, 0, max);
    if (!Number.isFinite(idx)) return;

    if (mode === 'spread') {
      try { knownNormalIndexSet.delete(idx); } catch {}
      try { knownSpreadIndexSet.add(idx); } catch {}
      toast('Marked as Spread');
    } else {
      try { knownSpreadIndexSet.delete(idx); } catch {}
      try { knownNormalIndexSet.add(idx); } catch {}
      toast('Marked as Normal');
    }

    // Layout/pairing caches depend on spread flags.
    resetTwoPageScrollCaches('spreadOverride');

    // Avoid drawing stale cachedSpread immediately after override.
    try { clearCachedBmp(false); } catch {}
    try { scheduleDraw(); } catch {}

    // Persist immediately so it sticks even if you close right away.
    try { await saveProgressNowSilent(); } catch {}
  }

  async function resetSpreadOverridesForVolume() {
    try { knownSpreadIndexSet = new Set(); } catch {}
    try { knownNormalIndexSet = new Set(); } catch {}
    toast('Spread markers reset');

    resetTwoPageScrollCaches('spreadOverrideReset');
    try { clearCachedBmp(false); } catch {}
    try { scheduleDraw(); } catch {}
    try { await saveProgressNowSilent(); } catch {}
  }

  // BUILD8_IMAGE_FIT_TOGGLE: Two-page flick Fit Width overflow panning state.
  // Why: Fit Width is allowed to overflow vertically; we keep this mode as a 'flick' (no strip scrolling)
  // by storing a small vertical pan offset that the wheel can adjust *only when overflow exists*.
  //
  // State schema:
  // - twoPageFlickPanSig: string fingerprint of the currently drawn frame (mode+fit+pair/spread+indices).
  //   If this changes, we reset panning to 0 so each new page starts at the top.
  // - twoPageFlickPanY: current vertical pan offset in device pixels (0 = top).
  // - twoPageFlickPanMax: maximum allowed pan offset for the current frame in device pixels.
  let twoPageFlickPanSig = '';
  let twoPageFlickPanY = 0;
  let twoPageFlickPanMax = 0;

  // BUILD44_MANGAPLUS_ZOOM_PAN_X: horizontal pan state (device pixels) for MangaPlus zoom overflow.
  let twoPageFlickPanX = 0;
  let twoPageFlickPanMaxX = 0;

  // BUILD44_RESET_PAN_HOOK: UI can call this after changing Image Fit / Zoom to re-center safely.
  window.resetTwoPageFlickPan = (opts = {}) => {
    try {
      const o = (opts && typeof opts === 'object') ? opts : {};
      const redraw = (o.redraw !== false);
      const topY = (o.topY === true); // default false; only snap top when asked

      // Default behavior in MangaPlus zoom: snap X to the reading-start edge.
      // You can force center via { centerX:true }.
      const forceCenter = (o.centerX === true);

      if (topY) twoPageFlickPanY = 0;

      const cm = (typeof getControlMode === 'function') ? getControlMode() : '';
      const zRaw = (cm === 'twoPageMangaPlus')
        ? Number(appState.settings?.twoPageMangaPlusZoomPct ?? 100)
        : 100;
      const z = clamp(Number.isFinite(zRaw) ? zRaw : 100, 100, 260);
      const zoomed = (cm === 'twoPageMangaPlus' && z > 100);

      if (Number.isFinite(twoPageFlickPanMaxX) && twoPageFlickPanMaxX > 0) {
        if (forceCenter) {
          twoPageFlickPanX = Math.round(twoPageFlickPanMaxX / 2);
        } else if (zoomed) {
          // Reading-start edge: RTL (next on left) starts on the right side.
          twoPageFlickPanX = twoPageMangaPlusNextOnLeft ? twoPageFlickPanMaxX : 0;
        } else {
          twoPageFlickPanX = Math.round(twoPageFlickPanMaxX / 2);
        }
      } else {
        twoPageFlickPanX = 0;
      }

      if (Number.isFinite(twoPageFlickPanMax) && twoPageFlickPanMax > 0) twoPageFlickPanY = clamp(twoPageFlickPanY, 0, twoPageFlickPanMax);
      else twoPageFlickPanY = 0;

      if (Number.isFinite(twoPageFlickPanMaxX) && twoPageFlickPanMaxX > 0) twoPageFlickPanX = clamp(twoPageFlickPanX, 0, twoPageFlickPanMaxX);
      else twoPageFlickPanX = 0;

      if (redraw && document.body.classList.contains('inPlayer') && cachedBmp) {
        try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
      }
    } catch {}
  };



  // BUILD16A_MANGAPLUS_NAV_FLIP: Two-page flick nav inversion (KeyI). Originally MangaPlus-only; now also applies to standard Two-Page flick mode.
  // When true: LEFT side (click/ArrowLeft) becomes NEXT, RIGHT becomes PREV (MangaPlus only).
  let twoPageMangaPlusNextOnLeft = false;


  function clearCachedBmp(alsoClearCache = false) {
    cachedBmp = null;
    cachedSpread = false;
    cachedIndex = -1;

    // BUILD19B2_RESET_DECODE_FAIL (Build 19B2)
    // Decode-fail cooldown must not leak across volumes. If it does,
    // openBook() can skip decoding page 0 and later blow up with cachedBmp=null.
    try { cachedDecodeFailIndex = -1; } catch {}
    try { cachedDecodeFailAt = 0; } catch {}

    if (alsoClearCache) clearPageCache();
  }

  function maybePrefetchNeighbors() {
    if (!appState.pages.length) return;
    // Avoid heavy work during active scrolling playback.
    if (appState.playing) {
      const sm = (appState.settings?.scrollMode) || 'infinite';
      if ((sm === 'infinite' && appState.mode === 'portraitStrip') || (sm === 'singlePage' && appState.mode === 'scroll')) return;
    }
    const targets = [appState.pageIndex + 1, appState.pageIndex - 1, appState.pageIndex + 2];
    for (const t of targets) {
      if (t < 0 || t >= appState.pages.length) continue;
      const e = pageCache.get(t);
      if (e?.bmp || e?.promise) continue;
      getBitmapAtIndex(t).catch(() => {});
    }
  }

  async function ensureCachedBmp(recomputeY = false) {
    if (cachedIndex !== appState.pageIndex || !cachedBmp) {
      const now = performance.now();

      // If this page just failed, don't retry every frame.
      if (cachedDecodeFailIndex === appState.pageIndex && (now - cachedDecodeFailAt) < DECODE_FAIL_COOLDOWN_MS) {
        // keep cachedBmp null for now; caller will keep rendering without crashing
      } else {
        try {
          const { bmp, spread } = await getBitmapAtIndex(appState.pageIndex);
          cachedBmp = bmp;
          cachedSpread = spread;
          cachedIndex = appState.pageIndex;
          cachedDecodeFailIndex = -1;
          cachedDecodeFailAt = 0;
        } catch {
          cachedBmp = null;
          cachedSpread = false;
          cachedIndex = appState.pageIndex;
          cachedDecodeFailIndex = appState.pageIndex;
          cachedDecodeFailAt = now;
        }
      }
    }

    if (recomputeY && cachedBmp) {
      // Keep the canvas backing size synced before computing scroll limits.
      try { resizeCanvasToDisplaySize(cachedBmp, cachedSpread); } catch {}

      const cw = el.stage.width;
      const ch = el.stage.height;

      // Build 14: spreads are part of the same infinite strip.
      // Spread pages use full viewport width; portrait pages use portraitWidthPct.
      const pwFrac = getPortraitWidthFrac();
      const m0 = getNoUpscaleMetrics(cachedBmp, cachedSpread, cw, pwFrac);
      const scaledH = m0.scaledH;

      appState.yMax = Math.max(0, scaledH - ch);

      if (isSinglePageMode()) {
        appState.y = clamp(appState.y, 0, appState.yMax);
      } else {
        // Continuous strip: allow y to extend beyond yMax so the next page can connect seamlessly.
        appState.y = clamp(appState.y, 0, scaledH);
      }

      setReaderMode(isSinglePageMode() ? 'topHold' : 'portraitStrip');
      // Heads-up display label is set by the draw functions, but keep this synced for immediate feedback.
      el.modeText.textContent = 'portrait';
    }

    maybePrefetchNeighbors();
  }

  // === VIEWPORT / DPR / RESIZE (danger zone) ===
// Phase 7: Expose reader runtime state under Tanko.state (debug/ownership only; no behavior impact)
try {
  window.Tanko = window.Tanko || {};
  window.Tanko.state = window.Tanko.state || {};
  // This is intentionally shallow: reader modules still use legacy global bindings.
  window.Tanko.state.reader = window.Tanko.state.reader || {};
  window.Tanko.state.reader.__loaded = true;
} catch {}
