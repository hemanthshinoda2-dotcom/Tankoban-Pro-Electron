// Build 9: moved from src/modules/reader_*.js into src/modules/reader/*
// NOTE: This is a mechanical split. Logic is unchanged.
// FIND_THIS:AI_MAP_READER
/*
================================
AI MAP — reader (split across src/modules/reader/*.js)
================================

What lives here:
- Open pipeline: src/modules/reader/open.js
- Bitmap cache + decode: src/modules/reader/bitmaps.js
- Shared state + prefetch: src/modules/reader/state.js
- Rendering (portrait): src/modules/reader/render_portrait.js
- Rendering (two-page): src/modules/reader/render_two_page.js
- Rendering switch (drawActiveFrame): src/modules/reader/render_core.js
- State machine + control modes: src/modules/reader/state_machine.js
- HUD base: src/modules/reader/hud_core.js
- Mega Settings: src/modules/reader/mega_settings.js
- Volume navigator + volume controls: src/modules/reader/volume_nav_overlay.js
- Input (pointer/wheel): src/modules/reader/input_pointer.js
- Input (keyboard): src/modules/reader/input_keyboard.js
- Boot: src/modules/reader/boot.js

Hot search tokens:
- EDIT_ZONE:BOOK_OPEN
- EDIT_ZONE:VIEWPORT
- EDIT_ZONE:STATE_MACHINE
- EDIT_ZONE:HUD
- EDIT_ZONE:INPUT
*/

  async function openBook(book) {

// PERF_HOTSPOT: openBook has long awaits; rapid volume switches can let stale completions overwrite UI/state
// → FIX: open/volume request tokens; stale opens close their own session and exit without mutating active state.
const openTok = ++appState.tokens.open;
const volumeTok = ++appState.tokens.volume;
const isStale = () => ((appState.tokens.open !== openTok) || (appState.tokens.volume !== volumeTok));
let openedSid = null;
let openedIsCbr = false;
    hideEndOverlay();
    stopAutoFlipTimer(); // Auto Flip: always stop while changing volumes
    appState.book = book;

    // BUILD19A_TWOPAGE_SCROLL_RESET_PER_VOLUME (Build 19A)
    resetTwoPageScrollCaches('openBook');


    showLoading('Opening volume', book?.title || '');
    try {
      const saved = await Tanko.api.progress.get(book.id);
      if (isStale()) return;

    // BUILD42_CONTINUE_READING_TOUCH_ON_OPEN (Build 42)
    // Continue Reading shows one in-progress volume per series (most recently updated).
    // If you jump to a newer volume without "finishing" the previous one, we must bump this volume's
    // updatedAt immediately on open (and persist it) so it reliably replaces the older entry.
    try {
      const now = Date.now();
      const prevMem = (appState.progressAll && appState.progressAll[book.id]) ? appState.progressAll[book.id] : {};
      const base = { ...(saved || {}), ...(prevMem || {}) }; // in-memory wins if it exists
      const meta = book ? { title: book.title, series: book.series, seriesId: book.seriesId, path: book.path } : null;
      const touched = { ...base, ...(meta ? { bookMeta: meta } : {}), updatedAt: now };

      appState.progressAll = appState.progressAll || {};
      appState.progressAll[book.id] = touched;

      // Persist the touch immediately (safe: keeps existing pageIndex/y/finished flags).
      try { Tanko.api.progress.save(book.id, touched).catch(() => {}); } catch {}
    } catch {}
      // BUILD19_KNOWN_SPREAD_SET_SEED (Build 19)
      // Restore known spread indices to stabilize Two-Page parity across sessions.
      try {
        const arr = saved?.knownSpreadIndices || saved?.spreadIndices || saved?.stitchedSpreadIndices || [];
        knownSpreadIndexSet = new Set(Array.isArray(arr) ? arr.map(n => Number(n)).filter(Number.isFinite) : []);
      } catch {
        knownSpreadIndexSet = new Set();
      }

      try {
        const arrN = saved?.knownNormalIndices || [];
        knownNormalIndexSet = new Set(Array.isArray(arrN) ? arrN.map(n => Number(n)).filter(Number.isFinite) : []);
      } catch {
        knownNormalIndexSet = new Set();
      }

// Per-series remembered settings (reading feel)
let seriesSettings = await loadSeriesSettings(book.seriesId);

if (isStale()) return;

// Migration: if this series has no saved settings yet, seed it from the last-saved volume settings.
if (!seriesSettings && saved?.settings) {
  const seed = { ...saved.settings };
  migrateLegacySpeedPreset(seed);
  seriesSettings = pickSettings(seed);
  await saveSeriesSettings(book.seriesId, seed);
}

appState.settings = { ...DEFAULTS, ...(seriesSettings || {}) };
// BUILD 25 v2
// INTENT: Keep one persisted scaling setting and normalize it early so:
// - Missing/legacy values behave as 'off' (no override)
// - Future saves do not reintroduce unknown values
appState.settings.imageScaleQuality = normalizeImageScaleQuality(appState.settings.imageScaleQuality);
// Build 14: one-mode reader. Always force infinite strip, regardless of older saved settings.
appState.settings.scrollMode = 'infinite';

      // Build 31: defensive migration — spreads are fit-only. Coerce older saved 'fill'.
      if (appState.settings.spreadFitMode !== 'fit') {
        appState.settings.spreadFitMode = 'fit';
        saveSeriesSettings(book.seriesId, appState.settings);
      }

      syncTwoPageScrollRowGapUi();

      // Update portrait width chips
      const pw = clampPortraitWidthPct(appState.settings.portraitWidthPct);
      if (appState.settings.portraitWidthPct !== pw) appState.settings.portraitWidthPct = pw;
      document.querySelectorAll('.chip[data-pw]').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.pw, 10) === pw);
      });
      el.pwText.textContent = `${pw}%`;
      if (el.scrubWidthBtn) el.scrubWidthBtn.title = `Portrait width: ${pw}%`;

      // Scroll speed (continuous model)
      const px = Number(appState.settings.scrollPxPerSec);
      if (!Number.isFinite(px) || px <= 0) appState.settings.scrollPxPerSec = DEFAULTS.scrollPxPerSec;
      setSpeedActive(scrollSpeedLevelFromPx(appState.settings.scrollPxPerSec));

      updateLoading('Reading file…');

      // BUILD 19D_CBZ_OPEN (Build 19D)
      // INTENT: Avoid loading the entire CBZ into renderer memory.
      // We open a main-process CBZ session (central directory only) and read pages lazily.
      closeCurrentComicSession();

      const lower = String(book?.path || '').toLowerCase();
      const isCbr = lower.endsWith('.cbr');

      const opened = isCbr
        ? await Tanko.api.archives.cbrOpen(book.path)
        : await Tanko.api.archives.cbzOpen(book.path);

      // FIX_BATCH6: Check opened.ok before using sessionId (C09-P0-1).
      if (opened && opened.ok === false) {
        toast(opened.error || 'Failed to open archive');
        updateLoading('');
        return;
      }

      const sid = opened.sessionId;

openedSid = sid;
openedIsCbr = isCbr;
if (isStale()) {
  try {
    if (openedSid) Promise.resolve(openedIsCbr ? Tanko.api.archives.cbrClose(openedSid) : Tanko.api.archives.cbzClose(openedSid)).catch(() => {});
  } catch {}
  return;
}
      appState.cbzSessionId = isCbr ? null : sid;
      appState.cbrSessionId = isCbr ? sid : null;

      updateLoading('Indexing pages…');

      // BUILD 19D_CBZ_ZIP_SHIM (Build 19D)
      // INTENT: Keep renderer expectations stable: appState.zip is { entries, getFileBytes(entry)->Uint8Array }.
      // entries include an entryIndex so we can request bytes by index via IPC.
      appState.zip = {
        entries: (opened.entries || []).map((e, i) => ({ ...e, entryIndex: i })),
        getFileBytes: async (entry) => {
          const ab = isCbr
            ? await Tanko.api.archives.cbrReadEntry(sid, entry.entryIndex)
            : await Tanko.api.archives.cbzReadEntry(sid, entry.entryIndex);
          return new Uint8Array(ab);
        },
      };

      const images = appState.zip.entries
        .filter(e => /\.(png|jpe?g|webp)$/i.test(e.name))
        .sort((a, b) => naturalCompare(a.name, b.name));

      if (!images.length) {
        toast('No images found');

        // BUILD19B_OPENBOOK_FAIL_RESET (Build 19B)
        // Avoid leaving partial book state around (prevents phantom "player opened but blank").
        try { appState.book = null; } catch {}
        try { appState.zip = null; } catch {}
        try { closeCurrentComicSession(); } catch {}
        try { appState.pages = []; } catch {}
        try { appState.pageIndex = 0; } catch {}
        try { updateNowPlaying(); } catch {}
        try { updateScrubber(); } catch {}
        return;
      }

      appState.pages = images;
      appState.pageIndex = saved?.pageIndex ? clamp(saved.pageIndex, 0, images.length - 1) : 0;

      if (getControlMode() === 'autoFlip') {
        // Auto Flip is Two-Page (Flip): always enter on a valid pair start/spread index.
        appState.pageIndex = snapTwoPageIndex(appState.pageIndex);
        appState.y = 0;
        appState.yMax = 0;
      }

      // Two-Page: request the partner page early so the first paired frame is instant.
      if (isTwoPageFlipMode(getControlMode()) || getControlMode() === 'autoFlip') {
        prefetchTwoPagePartner(appState.pageIndex);
      }
      appState.playing = false;
      appState.mode = 'portraitStrip';
      appState.tMode = 0;

      appState.y = Number.isFinite(saved?.y) ? Math.max(0, saved.y) : 0;

      clearCachedBmp(true); // also clears page cache from previous volume
      await ensureCachedBmp(true);
      // BUILD19B2_OPENBOOK_FIRST_DECODE (Build 19B2)
      // If the first decode failed, don't proceed to drawActiveFrame(null) and then blame "open".
      if (!cachedBmp) {
        throw new Error('Failed to decode first page.');
      }

      if (isTwoPageFlipMode(getControlMode()) || getControlMode() === 'autoFlip') {
        // Ensure paired pages are decoded before the first Two-Page frame draws.
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
      }

      if (isStale()) {
        try {
          if (openedSid) Promise.resolve(openedIsCbr ? Tanko.api.archives.cbrClose(openedSid) : Tanko.api.archives.cbzClose(openedSid)).catch(() => {});
        } catch {}
        return;
      }

      setView('player');
      hideEndOverlay();
      updateNowPlaying();
      drawActiveFrame(cachedBmp, cachedSpread);

      // BUILD 19E_OPENFILE_PERSIST (Build 19E)
      // Ensure at least one progress snapshot is scheduled so Open File books land in Continue Reading.
      scheduleProgressSave();
      if (getControlMode() === 'autoFlip') {
        startAutoFlipTimer();
      }

      updateScrubber();
      toast(saved ? 'Resumed' : 'Ready');
    } catch (err) {

// Build 22: if a newer open started, this completion is stale — do not toast/reset the active session.
if (isStale()) {
  try {
    if (openedSid) Promise.resolve(openedIsCbr ? Tanko.api.archives.cbrClose(openedSid) : Tanko.api.archives.cbzClose(openedSid)).catch(() => {});
  } catch {}
  return;
}
      try { console.error(err); } catch {}
      // BUILD19B2_OPENBOOK_ERROR_TOAST (Build 19B2)
      // Show the real cause (truncated) so we can fix issues like ZIP parse errors, IO errors, decode failures, etc.
      try {
        const msg = (err && err.message) ? String(err.message) : String(err || 'error');
        toast('Failed to open volume: ' + msg.slice(0, 160));
      } catch {
        toast('Failed to open volume');
      }

      // BUILD19B_OPENBOOK_FAIL_RESET (Build 19B)
      try { stopAutoFlipTimer(); } catch {}
      try { pauseLoop(); } catch {}

      try { appState.book = null; } catch {}
      try { appState.zip = null; } catch {}
      try { closeCurrentComicSession(); } catch {}
      try { appState.pages = []; } catch {}
      try { appState.pageIndex = 0; } catch {}

      try { setView('library'); } catch {}
      try { updateNowPlaying(); } catch {}
      try { updateScrubber(); } catch {}
    } finally {
      hideLoading();
    }
  }

  function updateNowPlaying() {
    const b = appState.book;
    el.nowTitle.textContent = b ? b.title : '—';
    try { syncPrevNextVolButtons(); } catch {}
    syncHudPageCounter(true);
  }

  // In continuous mode, the "current page" should be the page that occupies the
  // middle of the viewport (feels natural vs. "top-of-viewport").
  let lastHudIdx = -1;
  let lastHudBookId = null;

  // Build 24: batch HUD page counter updates during rapid navigation.
  // Notes: We keep page math identical by still using computePageInView().
  // Discrete navigation actions can force an immediate sync via syncHudPageCounter(true).
  const HUD_COUNTER_BATCH_MS = 100;
  let hudCounterRaf = 0;
  let hudCounterTimer = 0;
  let hudCounterLastFlush = 0;

  function flushHudPageCounter(force = false) {
    if (hudCounterRaf) cancelAnimationFrame(hudCounterRaf);
    hudCounterRaf = 0;
    if (hudCounterTimer) {
      clearTimeout(hudCounterTimer);
      hudCounterTimer = 0;
    }

    if (!document.body.classList.contains('inPlayer')) return;

    const b = appState.book;
    const total = appState.pages.length || 0;
    const idx = computePageInView();
    const bookId = (b?.id || null);

    if (!force && idx === lastHudIdx && lastHudBookId === bookId) {
      hudCounterLastFlush = performance.now();
      return;
    }

    lastHudIdx = idx;
    lastHudBookId = bookId;

    const nowSubText = b ? `${b.series || ''} · ${idx + 1} / ${total}` : '—';
    const pageText = b ? `${idx + 1} / ${total}` : '—';

    // Avoid redundant writes if the text already matches.
    if (el.nowSub.textContent !== nowSubText) el.nowSub.textContent = nowSubText;
    if (el.pageText.textContent !== pageText) el.pageText.textContent = pageText;

    hudCounterLastFlush = performance.now();
  }

  function scheduleHudPageCounter() {

    // BUILD19B3_HUD_COUNTER_SAFETY (Build 19B3)
    // scheduleHudPageCounter() is HUD-only. Wheel handling (and its locals) live in onWheel().

    const now = performance.now();
    const since = now - (hudCounterLastFlush || 0);
    const wait = Math.max(0, HUD_COUNTER_BATCH_MS - since);

    if (wait === 0) {
      if (!hudCounterRaf) hudCounterRaf = requestAnimationFrame(() => flushHudPageCounter(false));
      return;
    }

    if (hudCounterTimer) return;
    hudCounterTimer = window.setTimeout(() => {
      hudCounterTimer = 0;
      if (!hudCounterRaf) hudCounterRaf = requestAnimationFrame(() => flushHudPageCounter(false));
    }, wait);
  }

  // Build 35: expanded portrait width presets.
  // We allow narrower portrait widths (down to 50%) while keeping math consistent.
  const PORTRAIT_WIDTH_MIN_PCT = 50;
  const PORTRAIT_WIDTH_MAX_PCT = 100;

  function clampPortraitWidthPct(v) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return PORTRAIT_WIDTH_MAX_PCT;
    return clamp(n, PORTRAIT_WIDTH_MIN_PCT, PORTRAIT_WIDTH_MAX_PCT);
  }

  function getPortraitWidthFrac() {
    const pct = clampPortraitWidthPct(appState.settings?.portraitWidthPct ?? PORTRAIT_WIDTH_MAX_PCT);
    // Normalize the persisted setting so UI + layout stay in sync.
    if (appState?.settings && appState.settings.portraitWidthPct !== pct) {
      appState.settings.portraitWidthPct = pct;
    }
    return pct / 100;
  }

  function computePageInView() {
    if (!document.body.classList.contains('inPlayer')) return appState.pageIndex;
    if (isSinglePageMode()) return appState.pageIndex;
    if (!appState.pages.length) return appState.pageIndex;
    if (!cachedBmp) return appState.pageIndex;
    // Build 14: spreads are part of the strip, so we include them in the in-view calculation.

    // Ensure stage dimensions are current (device pixels).
    resizeCanvasToDisplaySize(cachedBmp, cachedSpread);

    const cw = el.stage.width, ch = el.stage.height;
    const pwFrac = getPortraitWidthFrac();

    const centerY = Math.round(appState.y + (ch / 2));

    let acc = 0;
    for (let k = 0; k < 6; k++) {
      const idx = appState.pageIndex + k;
      if (idx >= appState.pages.length) break;

      let bmpK = null;
      let spreadK = null;

      if (k === 0) {
        bmpK = cachedBmp;
        spreadK = cachedSpread;
      } else {
        const e = pageCache.get(idx);
        if (e?.bmp) {
          bmpK = e.bmp;
          spreadK = !!e.spread;
        }
      }

      // Stop at unknown pages.
      if (!bmpK) break;

      const mK = getNoUpscaleMetrics(bmpK, spreadK, cw, pwFrac);
      const h = mK.scaledH;

      if (centerY < acc + h) return idx;
      acc += h;
    }

    return appState.pageIndex;
  }

  function syncHudPageCounter(force = false) {
    if (!document.body.classList.contains('inPlayer')) return;

    // Force = immediate (used for discrete navigation actions and book changes).
    if (force) {
      flushHudPageCounter(true);
      return;
    }

    // Non-forced calls are batched to reduce DOM churn during rapid movement.
    scheduleHudPageCounter();
  }

