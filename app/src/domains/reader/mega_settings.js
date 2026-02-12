// Build 9: moved from src/modules/reader_40_hud.js into src/modules/reader/*
// NOTE: Mechanical split. Logic is unchanged.
  // Mega Settings overlay (Build 6A)
  // -----------------------------
  function isMegaOpen() {
    return !!appState.megaOpen;
  }

  

  function syncMegaOverlayPositioningFromState() {
    if (!el.megaSettingsOverlay) return;

    const mode = (appState.megaOpenMode === 'floater') ? 'floater' : 'corner';
    if (mode !== appState.megaOpenMode) appState.megaOpenMode = mode;

    if (mode === 'floater') {
      el.megaSettingsOverlay.classList.add('floater');

      const ax = clamp(Number(appState.megaAnchor?.x ?? 0), 0, window.innerWidth);
      const ay = clamp(Number(appState.megaAnchor?.y ?? 0), 0, window.innerHeight);

      el.megaSettingsOverlay.style.setProperty('--megaX', `${ax}px`);
      el.megaSettingsOverlay.style.setProperty('--megaY', `${ay}px`);
    } else {
      el.megaSettingsOverlay.classList.remove('floater');
      el.megaSettingsOverlay.style.removeProperty('--megaX');
      el.megaSettingsOverlay.style.removeProperty('--megaY');
    }
  }

  function clampMegaFloaterOnce() {
    if (appState.megaOpenMode !== 'floater') return;
    if (!el.megaSettingsOverlay || !el.megaSettingsPanel) return;

    const margin = 10;
    const rect = el.megaSettingsPanel.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    let x = Number(appState.megaAnchor?.x ?? margin);
    let y = Number(appState.megaAnchor?.y ?? margin);

    x = clamp(x, margin, Math.max(margin, window.innerWidth - rect.width - margin));
    y = clamp(y, margin, Math.max(margin, window.innerHeight - rect.height - margin));

    appState.megaAnchor = { x, y };
    el.megaSettingsOverlay.style.setProperty('--megaX', `${x}px`);
    el.megaSettingsOverlay.style.setProperty('--megaY', `${y}px`);
  }

  function openMegaSettingsFloaterFromEvent(e) {
    if (!document.body.classList.contains('inPlayer')) return;
    e.preventDefault();
    e.stopPropagation();

    // INTENT: Right-click should open the same Mega Settings UI, but near the cursor for faster access.
    appState.megaOpenMode = 'floater';
    const off = 12;
    appState.megaAnchor = { x: (e.clientX || 0) + off, y: (e.clientY || 0) + off };

    openMegaSettings(true);
    openMegaSub('tools');

    // INTENT: Clamp once so the floater never spawns off-screen and doesn’t cause layout thrash.
    requestAnimationFrame(() => clampMegaFloaterOnce());
  }
function speedPresetLabel(val) {
    const n = Number(val);
    if (Number.isFinite(n)) {
      // If a legacy preset level sneaks in (1–10), use it; otherwise treat it as px/s.
      const lvl = (n >= 1 && n <= 10) ? clampSpeedLevel(n) : scrollSpeedLevelFromPx(n);
      return `Speed ${clampSpeedLevel(lvl)}`;
    }

    // Back-compat for older saved settings
    const s = String(val || '').toLowerCase();
    if (s === 'relaxed') return 'Speed 4';
    if (s === 'fast') return 'Speed 7';
    if (s === 'normal') return 'Speed 5';
    return 'Speed 5';
  }

  function scrollModeLabel() {
    const sm = (appState.settings?.scrollMode) || 'infinite';
    return sm === 'singlePage' ? 'Single page' : 'Infinite';
  }

  function spreadsLabel() {
    return 'Fit';
  }

  function syncMegaMainValues() {
    if (!el.megaSpeedValue) return;
    el.megaSpeedValue.textContent = speedPresetLabel(appState.settings?.scrollPxPerSec || DEFAULTS.scrollPxPerSec);
    // BUILD 7: show the currently active control mode next to the new "Mode" row.
    // Why: the quick row is hidden for the minimalist HUD, so the Mega Settings
    // panel becomes the primary place to confirm or change modes.
    if (el.megaModeValue) el.megaModeValue.textContent = getControlModeLabel(getControlMode());

    // BUILD16C_AUTOFIP_INTERVAL_PREF: show interval only for Auto Flip mode
    if (el.megaRowAutoFlip) {
      const show = (getControlMode() === 'autoFlip');
      el.megaRowAutoFlip.classList.toggle('hidden', !show);
      if (show && el.megaAutoFlipValue) {
        const sec = clamp(Math.round(Number(appState.settings?.autoFlipIntervalSec ?? DEFAULTS.autoFlipIntervalSec)), 5, 600);
        el.megaAutoFlipValue.textContent = `${sec}s`;
      }
    }

    // BUILD8_IMAGE_FIT_TOGGLE: Mega panel value + visibility for Image Fit
    // (only relevant in Double Page flick modes).
    if (el.megaRowImageFit) {
      const mode = getControlMode();
      const showFit = isTwoPageFlipMode(mode);
      el.megaRowImageFit.classList.toggle('hidden', !showFit);
      if (showFit && el.megaImageFitValue) {
        el.megaImageFitValue.textContent = twoPageImageFitLabel(getTwoPageImageFit(mode));
      }
    }


    if (el.megaScrollValue) el.megaScrollValue.textContent = scrollModeLabel();
    if (el.megaWidthValue) el.megaWidthValue.textContent = `${appState.settings?.portraitWidthPct || 100}%`;
    if (el.megaSpreadsValue) el.megaSpreadsValue.textContent = spreadsLabel();
    if (el.megaProgressValue) el.megaProgressValue.textContent = 'Actions';
  }

  function showMegaMain() {
    appState.megaSub = 'main';
    // BUILD 25 v2
    // INTENT: The main panel is the root of navigation. When we show it, we are at depth 0.
    appState.megaNavStack = [];
    el.megaSubPanel?.classList.add('hidden');
    el.megaMainPanel?.classList.remove('hidden');
    syncMegaMainValues();
    // Build 31: keyboard navigation. Focus the first row when opening or returning to main.
    requestAnimationFrame(() => {
      try {
        if (!isMegaOpen()) return;
        el.megaMainPanel?.querySelector('button.megaRow:not([disabled])')?.focus();
      } catch {}
    });
  }

  function buildMegaSpeedSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'Scroll speed';
    el.megaSubList.innerHTML = '';

    // Build 43B: control modes are selected via the mode button (or M).
    const cur = clampSpeedLevel(scrollSpeedLevelFromPx(appState.settings?.scrollPxPerSec || DEFAULTS.scrollPxPerSec));
    for (let i = 1; i <= 10; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'megaOption';
      btn.dataset.speed = String(i);
      const right = (i === cur) ? '<span class="megaCheck">✓</span>' : '';
      btn.innerHTML = `<span>Speed ${i}</span><span class="megaOptionRight">${right}</span>`;
      btn.addEventListener('click', () => {
        applySpeedPreset(i);
        syncMegaMainValues();
        buildMegaSpeedSubmenu();
      });
      el.megaSubList.appendChild(btn);
    }
  }
  function buildMegaAutoFlipSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'Auto Flip interval';
    el.megaSubList.innerHTML = '';

    const cur = clamp(Math.round(Number(appState.settings?.autoFlipIntervalSec ?? DEFAULTS.autoFlipIntervalSec)), 5, 600);
    const options = [5, 10, 15, 20, 30, 45, 60, 90, 120];

    for (const sec of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'megaOption' + (sec === cur ? ' active' : '');
      btn.innerHTML = `<span>${sec}s</span><span class="megaOptionRight">${sec === cur ? '<span class="megaCheck">✓</span>' : ''}</span>`;
      btn.addEventListener('click', () => {
        appState.settings.autoFlipIntervalSec = sec;
        scheduleProgressSave();

        // Apply immediately if Auto Flip is active
        if (document.body.classList.contains('inPlayer') && getControlMode() === 'autoFlip' && appState.playing) {
          stopAutoFlipTimer();
          startAutoFlipTimer();
        }

        syncMegaMainValues();
        showMegaMain();
      });
      el.megaSubList.appendChild(btn);
    }
  }


  async function applyScrollMode(nextMode) {
    const want = (nextMode === 'singlePage') ? 'singlePage' : 'infinite';
    const cur = (appState.settings?.scrollMode) || 'infinite';
    if (cur === want) return;
    await toggleScrollMode();
  }

  async function applyPortraitWidthPct(pct) {
    const pw = Number(pct);
    if (!Number.isFinite(pw)) return;
    appState.settings.portraitWidthPct = pw;
    syncSettingsUi();
    scheduleProgressSave();
    if (document.body.classList.contains('inPlayer') && cachedBmp && !cachedSpread) {
      await ensureCachedBmp(true);
      drawActiveFrame(cachedBmp, false);
    }
  }
  function applySpreadsMode(_mode) {
    // Build 31: spreads are fit-only. Ignore older 'fill' values.
    const cur = (appState.settings?.spreadFitMode) || 'fit';
    if (cur !== 'fit') {
      appState.settings.spreadFitMode = 'fit';
      toast('Spreads: fit');
      scheduleProgressSave();
      if (document.body.classList.contains('inPlayer') && cachedBmp && cachedSpread) {
        drawActiveFrame(cachedBmp, true);
      }
    }
  }

  function buildMegaScrollSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'Scroll mode';
    el.megaSubList.innerHTML = '';
    const cur = (appState.settings?.scrollMode) || 'infinite';
    const items = [
      { id: 'infinite', label: 'Infinite' },
      { id: 'singlePage', label: 'Single page' },
    ];
    for (const it of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'megaOption';
      const right = (it.id === cur) ? '<span class="megaCheck">✓</span>' : '';
      btn.innerHTML = `<span>${it.label}</span><span class="megaOptionRight">${right}</span>`;
      btn.addEventListener('click', async () => {
        await applyScrollMode(it.id);
        syncMegaMainValues();
        showMegaMain();
      });
      el.megaSubList.appendChild(btn);
    }
  }

  function buildMegaWidthSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'Portrait width';
    el.megaSubList.innerHTML = '';
    const cur = Number(appState.settings?.portraitWidthPct || 100);
    // Build 35: expanded portrait width presets, including narrower options.
    const allow = [50, 60, 70, 74, 78, 90, 100];
    const fromDom = Array.from(document.querySelectorAll('.chip[data-pw]'))
      .map(b => Number(b.dataset.pw))
      .filter(n => Number.isFinite(n));
    const widths = (fromDom.length ? fromDom : allow)
      .filter(n => allow.includes(n))
      .sort((a,b)=>a-b);

    for (const pw of widths) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'megaOption';
      const right = (pw === cur) ? '<span class="megaCheck">✓</span>' : '';
      btn.innerHTML = `<span>${pw}%</span><span class="megaOptionRight">${right}</span>`;
      btn.addEventListener('click', async () => {
        await applyPortraitWidthPct(pw);
        syncMegaMainValues();
        showMegaMain();
      });
      el.megaSubList.appendChild(btn);
    }
  }
  function buildMegaSpreadsSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'Spreads';
    el.megaSubList.innerHTML = '';

    // Build 31: spreads are fit-only.
    const cur = 'fit';
    const items = [
      { id: 'fit', label: 'Fit' },
    ];

    for (const it of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'megaOption';
      const right = (it.id === cur) ? '<span class="megaCheck">✓</span>' : '';
      btn.innerHTML = `<span>${it.label}</span><span class="megaOptionRight">${right}</span>`;
      btn.addEventListener('click', () => {
        applySpreadsMode(it.id);
        syncMegaMainValues();
        showMegaMain();
      });
      el.megaSubList.appendChild(btn);
    }

    // BUILD29_SPREAD_OVERRIDE_TOOLS (Build 29)
    const hasPages = !!(appState.pages && appState.pages.length);
    const idx = clamp(appState.pageIndex || 0, 0, Math.max(0, (appState.pages?.length || 1) - 1));
    const st = spreadOverrideState(idx);

    const sep = document.createElement('div');
    sep.className = 'contextMenuSep';
    el.megaSubList.appendChild(sep);

    const markSpreadBtn = document.createElement('button');
    markSpreadBtn.type = 'button';
    markSpreadBtn.className = 'megaOption';
    markSpreadBtn.disabled = !hasPages;
    markSpreadBtn.innerHTML = `<span>Mark this page as Spread</span><span class="megaOptionRight">${st === 'spread' ? '<span class="megaCheck">✓</span>' : 'Apply'}</span>`;
    markSpreadBtn.addEventListener('click', async () => {
      if (!hasPages) return;
      await applySpreadOverride(idx, 'spread');
      openMegaSub('spreads', { replace: true });
    });
    el.megaSubList.appendChild(markSpreadBtn);

    const markNormalBtn = document.createElement('button');
    markNormalBtn.type = 'button';
    markNormalBtn.className = 'megaOption';
    markNormalBtn.disabled = !hasPages;
    markNormalBtn.innerHTML = `<span>Mark this page as Normal</span><span class="megaOptionRight">${st === 'normal' ? '<span class="megaCheck">✓</span>' : 'Apply'}</span>`;
    markNormalBtn.addEventListener('click', async () => {
      if (!hasPages) return;
      await applySpreadOverride(idx, 'normal');
      openMegaSub('spreads', { replace: true });
    });
    el.megaSubList.appendChild(markNormalBtn);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'megaOption';
    resetBtn.disabled = !hasPages;
    resetBtn.innerHTML = '<span>Reset spread markers for this volume</span><span class="megaOptionRight">Run</span>';
    resetBtn.addEventListener('click', async () => {
      if (!hasPages) return;
      await resetSpreadOverridesForVolume();
      openMegaSub('spreads', { replace: true });
    });
    el.megaSubList.appendChild(resetBtn);
  }

  

  // BUILD 19H_IMAGE_FX (Build 19H)
  // INTENT: Keep filters purely visual by applying CSS filter on the canvas element only.
  // This avoids touching file IO, decoding, or the library pipeline.

  function applyImageFxToStage() {
    if (!el.stage) return;

    const b = clamp(Number(appState.settings?.imageBrightnessPct ?? 100), 0, 300);
    const c = clamp(Number(appState.settings?.imageContrastPct ?? 100), 0, 300);

    // BUILD21_IMGFX_EXT (Build 21)
    // INTENT: Keep everything in CSS filter-space so it never affects decoding/caching.
    const sat = clamp(Number(appState.settings?.imageSaturatePct ?? 100), 0, 500);
    const sep = clamp(Number(appState.settings?.imageSepiaPct ?? 0), 0, 100);
    const hue = Number(appState.settings?.imageHueDeg ?? 0);

    const inv = (Number(appState.settings?.imageInvert) ? 1 : 0);
    const gray = (Number(appState.settings?.imageGrayscale) ? 1 : 0);

    // Note: order matters slightly; keep stable so future tweaks are predictable.
    const parts = [];
    parts.push(`brightness(${b}%)`);
    parts.push(`contrast(${c}%)`);
    parts.push(`saturate(${sat}%)`);
    parts.push(`sepia(${sep}%)`);
    parts.push(`hue-rotate(${((hue % 360) + 360) % 360}deg)`);
    if (inv) parts.push('invert(100%)');
    if (gray) parts.push('grayscale(100%)');

    el.stage.style.filter = parts.join(' ');
  }


  // BUILD21_SCALE_QUALITY (Build 21)
  // INTENT: Expose native interpolation knobs (smoothing + smoothingQuality) consistently across draw paths.
  // BUILD 25 v2: "Off" must restore the original per-canvas defaults (no guessing, no forced mode).
  const nativeScaleQualityDefaultsByCtx = new WeakMap();

  function getNativeScaleQualityDefaults(ctx) {
    // WHY: Different canvases can have different defaults. Capture per-context, once, *before* any override.
    if (!ctx || typeof ctx !== 'object') return { smoothingEnabled: true, smoothingQuality: 'low' };

    const cached = nativeScaleQualityDefaultsByCtx.get(ctx);
    if (cached) return cached;

    let smoothingEnabled = true;
    let smoothingQuality = 'low';
    try { smoothingEnabled = !!ctx.imageSmoothingEnabled; } catch {}
    try { smoothingQuality = String(ctx.imageSmoothingQuality || 'low'); } catch {}

    const d = { smoothingEnabled, smoothingQuality };
    try { nativeScaleQualityDefaultsByCtx.set(ctx, d); } catch {}
    return d;
  }

  function applyScaleQualityToCtx(ctx) {
    // INTENT: Ensure "Off" is always able to restore defaults even if the first draw uses Smooth/Sharp/Pixel.
    const d = getNativeScaleQualityDefaults(ctx);
    const q = getImageScaleQuality(); // appState.settings.imageScaleQuality: 'off'|'smooth'|'sharp'|'pixel'

    if (q === 'off') {
      try { ctx.imageSmoothingEnabled = !!d.smoothingEnabled; } catch {}
      // Guard: imageSmoothingQuality may not exist on all contexts.
      try { if (d.smoothingQuality) ctx.imageSmoothingQuality = d.smoothingQuality; } catch {}
      return;
    }

    if (q === 'pixel') {
      try { ctx.imageSmoothingEnabled = false; } catch {}
      return;
    }

    try { ctx.imageSmoothingEnabled = true; } catch {}

    // 'sharp' trades some smoothness for edge definition; 'smooth' pushes quality.
    try { ctx.imageSmoothingQuality = (q === 'sharp') ? 'low' : 'high'; } catch {}
  }

// BUILD21_HQ_DOWNSCALE (Build 21)
  // INTENT: Two-page viewing usually downsamples large source pages into a smaller viewport.
  // A single drawImage downscale can look softer (and sometimes introduces moiré on screentones).
  // This stays dependency-free by doing a multi-step half-downscale only when it will help.
  let hqDownscaleA = null;
  let hqDownscaleB = null;

  function ensureHqDownscaleCanvases() {
    if (hqDownscaleA && hqDownscaleB) return;
    // OffscreenCanvas isn't available everywhere; use plain canvases so behavior is consistent.
    hqDownscaleA = document.createElement('canvas');
    hqDownscaleB = document.createElement('canvas');
  }

  function resizeCanvas(c, w, h) {
    // WHY: Resizing resets the drawing state, but it also clears the buffer and avoids stale pixels.
    if (c.width != w) c.width = w;
    if (c.height != h) c.height = h;
  }

  function maxInt(a, b) {
    const aa = Number.isFinite(a) ? Math.floor(a) : 0;
    const bb = Number.isFinite(b) ? Math.floor(b) : 0;
    return Math.max(1, aa, bb);
  }

  function drawImageDownscaleMultiStep(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh) {
    ensureHqDownscaleCanvases();

    // Guard: if the request is degenerate, fall back to a normal draw.
    if (!(Number.isFinite(dw) && Number.isFinite(dh)) || dw <= 0 || dh <= 0) {
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
      return;
    }

    // Multi-step only helps for meaningful shrink. For tiny shrinks, the normal path is fine.
    const scale = Math.min(dw / Math.max(1e-6, sw), dh / Math.max(1e-6, sh));
    if (!(scale < 0.85) || !(dw < sw || dh < sh)) {
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
      return;
    }

    // Ping-pong canvases to avoid drawing a canvas onto itself.
    let src = img;
    let curW = Math.max(1, Math.round(sw));
    let curH = Math.max(1, Math.round(sh));
    let flip = false;

    // WHY: Repeated half-downscales reduce aliasing vs one big downscale.
    while ((curW / 2) > dw && (curH / 2) > dh) {
      const nextW = maxInt(dw, Math.floor(curW / 2));
      const nextH = maxInt(dh, Math.floor(curH / 2));

      const dst = flip ? hqDownscaleA : hqDownscaleB;
      resizeCanvas(dst, nextW, nextH);
      const dctx = dst.getContext('2d');

      dctx.setTransform(1, 0, 0, 1, 0, 0);
      dctx.clearRect(0, 0, nextW, nextH);
      dctx.imageSmoothingEnabled = true;
      try { dctx.imageSmoothingQuality = 'high'; } catch {}

      if (src === img) {
        dctx.drawImage(img, sx, sy, sw, sh, 0, 0, nextW, nextH);
      } else {
        dctx.drawImage(src, 0, 0, curW, curH, 0, 0, nextW, nextH);
      }

      src = dst;
      curW = nextW;
      curH = nextH;
      flip = !flip;

      // After the first step, the source is already cropped; future steps are full-canvas.
      sx = 0; sy = 0; sw = curW; sh = curH;
    }

    // Final step into the destination.
    if (src === img) ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    else ctx.drawImage(src, 0, 0, curW, curH, dx, dy, dw, dh);
  }

  function drawImageScaled(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh) {
    const q = getImageScaleQuality();

    // PERF_HOTSPOT: scaling mode can look "sticky" if ctx smoothing state drifts between draw paths → FIX: re-apply the chosen quality right before any scaled draw.
    applyScaleQualityToCtx(ctx);

    // WHY: Keep 'sharp' and 'pixel' cheap; multi-step downscale is reserved for 'smooth' only.
    if (q === 'smooth') {
      drawImageDownscaleMultiStep(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh);
      return;
    }

    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  }


  function isGotoOpen() {
    return !!el.gotoOverlay && !el.gotoOverlay.classList.contains('hidden');
  }
  function isImgFxOpen() {
    return !!el.imgFxOverlay && !el.imgFxOverlay.classList.contains('hidden');
  }
  function isLoupeZoomOpen() {
    return !!el.loupeZoomOverlay && !el.loupeZoomOverlay.classList.contains('hidden');
  }

  // BUILD 19H_BOOKMARKS (Build 19H)
  // SCHEMA: bookmarks are stored in progress payload per book as sorted unique page indices: number[]
  function getBookmarksForActiveBook() {
    if (!appState.book) return [];
    const p = appState.progressAll?.[appState.book.id] || {};
    const arr = Array.isArray(p.bookmarks) ? p.bookmarks : [];
    return arr.filter(Number.isFinite).map(n => clamp(n|0, 0, Math.max(0, (appState.pages.length||1)-1)))
              .sort((a,b)=>a-b)
              .filter((v,i,a)=> i===0 || v!==a[i-1]);
  }

  function setBookmarksForActiveBook(nextArr) {
    if (!appState.book) return;
    const prev = appState.progressAll?.[appState.book.id] || {};
    const clean = (Array.isArray(nextArr) ? nextArr : []).filter(Number.isFinite)
      .map(n => clamp(n|0, 0, Math.max(0, (appState.pages.length||1)-1)))
      .sort((a,b)=>a-b)
      .filter((v,i,a)=> i===0 || v!==a[i-1]);

    // INTENT: scheduleProgressSave() merges from appState.progressAll[bookId], so we must update it first.
    appState.progressAll[appState.book.id] = { ...prev, bookmarks: clean };
    scheduleProgressSave();
  }

  function isBookmarked(idx) {
    const a = getBookmarksForActiveBook();
    return a.includes(idx|0);
  }

  function toggleBookmarkOnCurrentPage() {
    if (!appState.book || !appState.pages.length) return;
    const idx = appState.pageIndex|0;
    const a = getBookmarksForActiveBook();
    const next = a.includes(idx) ? a.filter(n => n !== idx) : [...a, idx];
    setBookmarksForActiveBook(next);
    toast(a.includes(idx) ? 'Bookmark removed' : 'Bookmarked');
  }


  // BUILD 19H_GOTO (Build 19H)
  // INTENT: Provide precise jump without touching existing scrub/keys.
  function openGotoOverlay() {
    if (!el.gotoOverlay || !appState.pages.length) return;
    el.gotoOverlay.classList.remove('hidden');
    const max = appState.pages.length || 1;
    if (el.gotoHint) el.gotoHint.textContent = `1 … ${max}`;
    if (el.gotoInput) {
      el.gotoInput.max = String(max);
      el.gotoInput.value = String(clamp((appState.pageIndex|0) + 1, 1, max));
      setTimeout(() => { try { el.gotoInput.focus(); el.gotoInput.select(); } catch {} }, 0);
    }
  }

  function closeGotoOverlay() {
    el.gotoOverlay?.classList.add('hidden');
  }

  function commitGotoOverlay() {
    const max = appState.pages.length || 1;
    const v = Number(el.gotoInput?.value || 1);
    const idx = clamp((Math.round(v) - 1)|0, 0, max - 1);
    closeGotoOverlay();
    goToPage(idx, appState.playing);
  }

  // BUILD 19H_IMAGE_FX_OVERLAY (Build 19H)
  // INTENT: UI wrapper around applyImageFxToStage(), with settings persisted via existing save flow.
  function openImgFxOverlay() {
    if (!el.imgFxOverlay) return;
    el.imgFxOverlay.classList.remove('hidden');
    syncImgFxOverlayUiFromSettings();
  }

  function closeImgFxOverlay() {
    el.imgFxOverlay?.classList.add('hidden');
  }


  function syncImgFxOverlayUiFromSettings() {
    if (!el.imgFxOverlay) return;

    const b = clamp(Number(appState.settings?.imageBrightnessPct ?? 100), 50, 150);
    const c = clamp(Number(appState.settings?.imageContrastPct ?? 100), 50, 150);

    const sat = clamp(Number(appState.settings?.imageSaturatePct ?? 100), 0, 200);
    const sep = clamp(Number(appState.settings?.imageSepiaPct ?? 0), 0, 100);
    const hue = clamp(Number(appState.settings?.imageHueDeg ?? 0), 0, 360);

    const inv = !!Number(appState.settings?.imageInvert);
    const gray = !!Number(appState.settings?.imageGrayscale);

    if (el.imgFxBrightness) el.imgFxBrightness.value = String(b);
    if (el.imgFxBrightnessVal) el.imgFxBrightnessVal.textContent = `${Math.round(b)}%`;

    if (el.imgFxContrast) el.imgFxContrast.value = String(c);
    if (el.imgFxContrastVal) el.imgFxContrastVal.textContent = `${Math.round(c)}%`;

    if (el.imgFxSaturate) el.imgFxSaturate.value = String(sat);
    if (el.imgFxSaturateVal) el.imgFxSaturateVal.textContent = `${Math.round(sat)}%`;

    if (el.imgFxSepia) el.imgFxSepia.value = String(sep);
    if (el.imgFxSepiaVal) el.imgFxSepiaVal.textContent = `${Math.round(sep)}%`;

    if (el.imgFxHue) el.imgFxHue.value = String(hue);
    if (el.imgFxHueVal) el.imgFxHueVal.textContent = `${Math.round(hue)}°`;

    if (el.imgFxInvert) el.imgFxInvert.checked = inv;
    if (el.imgFxGrayscale) el.imgFxGrayscale.checked = gray;

    // BUILD21_SCALE_QUALITY (Build 21)
    const q = getImageScaleQuality();
    // INTENT: Keep the chip text/layout stable, but expose active state for CSS and accessibility.
    const setActive = (btn, on) => { try { btn?.classList.toggle('active', !!on); btn?.setAttribute('aria-pressed', on ? 'true' : 'false'); } catch {} };
    setActive(el.imgFxScaleOff, q === 'off');
    setActive(el.imgFxScaleSmooth, q === 'smooth');
    setActive(el.imgFxScaleSharp, q === 'sharp');
    setActive(el.imgFxScalePixel, q === 'pixel');
  }


  function setImgFxSetting(keyOrPatch, maybeValue) {
    // BUILD 20_IMAGE_FX_FIX (Build 20)
    // INTENT: The UI calls this as (key,value), but the original helper expected an object.
    // Accept both forms so the feature can't silently “do nothing” again if call sites drift.
    const patch = (typeof keyOrPatch === 'string')
      ? { [keyOrPatch]: maybeValue }
      : (keyOrPatch || {});

    appState.settings = { ...appState.settings, ...patch };
    applyImageFxToStage();
    scheduleProgressSave();
  }

  // BUILD 20_LOUPE_ZOOM_OVERLAY (Build 20)
  // INTENT: Simple slider overlay to tune loupe zoom without changing navigation or zoom/pan modes.
  function openLoupeZoomOverlay() {
    if (!el.loupeZoomOverlay) return;
    el.loupeZoomOverlay.classList.remove('hidden');
    syncLoupeZoomOverlayUiFromSettings();
  }

  function closeLoupeZoomOverlay() {
    el.loupeZoomOverlay?.classList.add('hidden');
  }

  function syncLoupeZoomOverlayUiFromSettings() {
    if (!el.loupeZoomRange) return;
    const z = clamp(Number(appState.settings?.loupeZoom ?? 2.0), 0.5, 3.5);
    el.loupeZoomRange.value = String(z);
    if (el.loupeZoomVal) el.loupeZoomVal.textContent = `${z.toFixed(2)}×`;

    // BUILD 20A_LOUPE_SIZE (Build 20A)
    // INTENT: Let users tune HUD size without affecting page layout math or any click zones.
    const s = clamp(Number(appState.settings?.loupeSizePx ?? 220), 140, 640);
    if (el.loupeSizeRange) el.loupeSizeRange.value = String(s);
    if (el.loupeSizeVal) el.loupeSizeVal.textContent = `${Math.round(s)}px`;
  }

  function setLoupeZoom(v) {
    // INTENT: Keep this separate from loupeEnabled toggle so future AIs don’t couple behaviors.
    const z = clamp(Number(v), 0.5, 3.5);
    appState.settings.loupeZoom = z;
    if (el.loupeZoomVal) el.loupeZoomVal.textContent = `${z.toFixed(2)}×`;
    scheduleProgressSave();
  }

  function setLoupeSize(v) {
    // BUILD 20A_LOUPE_SIZE (Build 20A)
    // INTENT: Make HUD size adjustable while preserving mapping stability (cursor→source mapping stays unchanged).
    const s = clamp(Number(v), 140, 640);
    appState.settings.loupeSizePx = s;
    if (el.loupeSizeVal) el.loupeSizeVal.textContent = `${Math.round(s)}px`;
    syncLoupeHudSize();
    scheduleProgressSave();
  }

  function syncLoupeHudSize() {
    // BUILD 20B_LOUPE_SIZE_APPLY (Build 20B)
    // INTENT: The HUD element was styled with a fixed 220px box in CSS.
    // Use a CSS variable to apply the user setting without touching any click-zone layout.
    if (!el.loupeHud) return;
    const s = clamp(Number(appState.settings?.loupeSizePx ?? 220), 140, 640);
    el.loupeHud.style.setProperty('--loupeSize', `${Math.round(s)}px`);
  }

  // BUILD 19H_LOUPE (Build 19H)
  // INTENT: Keep listeners off unless enabled to avoid overhead during normal reading.
  function syncLoupeEnabled() {
    const on = !!appState.settings?.loupeEnabled;
    if (!el.loupeHud || !el.loupeCanvas) return;

    if (!on) {
      el.loupeHud.classList.add('hidden');
      window.removeEventListener('mousemove', onLoupeMouseMove, true);
      window.removeEventListener('mouseleave', onLoupeMouseLeave, true);
      return;
    }

    // INTENT: Apply size immediately so the HUD matches settings before the first mousemove paint.
    syncLoupeHudSize();

    window.addEventListener('mousemove', onLoupeMouseMove, true);
    window.addEventListener('mouseleave', onLoupeMouseLeave, true);
  }

  function onLoupeMouseLeave() {
    el.loupeHud?.classList.add('hidden');
  }

  function onLoupeMouseMove(e) {
    if (!document.body.classList.contains('inPlayer')) return;
    if (!appState.settings?.loupeEnabled) return;
    if (isMegaOpen?.() || isGotoOpen() || isImgFxOpen() || isLoupeZoomOpen() || isContextMenuOpen()) {
      el.loupeHud?.classList.add('hidden');
      return;
    }

    const rect = el.stage?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    // Cursor in canvas CSS space
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find which drawn rect we’re hovering
    const hit = (lastFrameRects || []).find(r =>
      x >= r.dstCss.x && x <= (r.dstCss.x + r.dstCss.w) &&
      y >= r.dstCss.y && y <= (r.dstCss.y + r.dstCss.h)
    );
    if (!hit || !hit.bmp) { el.loupeHud?.classList.add('hidden'); return; }

    // Map to source pixel coordinates
    const u = hit.dstCss.w ? ((x - hit.dstCss.x) / hit.dstCss.w) : 0;
    const v = hit.dstCss.h ? ((y - hit.dstCss.y) / hit.dstCss.h) : 0;
    const sx = hit.src.x + u * hit.src.w;
    const sy = hit.src.y + v * hit.src.h;

    const zoom = clamp(Number(appState.settings?.loupeZoom ?? 2.0), 0.5, 3.5);
    const outCss = clamp(Number(appState.settings?.loupeSizePx ?? 220), 140, 640);
    const dpr = window.devicePixelRatio || 1;
    const outDev = Math.max(1, Math.round(outCss * dpr));
    const sampleW = outDev / zoom;
    const sampleH = outDev / zoom;

    // BUILD 20C_LOUPE_ZOOM_OUT (Build 20C)
    // INTENT: When zoom < 1, the sample box can exceed the bitmap bounds and cause empty edges.
    // Cap the source sample size so mapping stays predictable even when "zooming out".
    const srcSampleW = Math.min(sampleW, hit.bmp.width);
    const srcSampleH = Math.min(sampleH, hit.bmp.height);

    // Position HUD near bottom-right by default (CSS already anchors it),
    // but ensure it’s visible when enabled.
    syncLoupeHudSize();
    el.loupeHud.classList.remove('hidden');

    // BUILD 20B_LOUPE_THROTTLE (Build 20B)
    // INTENT: Large HUD sizes increase per-event draw cost; throttle paints to reduce stutter.
    const now = (window.performance && performance.now) ? performance.now() : Date.now();
    if (now - loupeLastPaintTs < 33) return;
    loupeLastPaintTs = now;

    const c = el.loupeCanvas;
    if (c.width !== outDev || c.height !== outDev) { c.width = outDev; c.height = outDev; }

    const ctx = c.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0);
    ctx.imageSmoothingEnabled = false;

    // Clamp sample box in source space
    const bx = clamp(sx - srcSampleW/2, 0, Math.max(0, hit.bmp.width - srcSampleW));
    const by = clamp(sy - srcSampleH/2, 0, Math.max(0, hit.bmp.height - srcSampleH));
    ctx.clearRect(0,0,outDev,outDev);
    ctx.drawImage(hit.bmp, bx, by, srcSampleW, srcSampleH, 0, 0, outDev, outDev);

    // Optional subtle crosshair for reading; keep minimal and non-distracting if added.
  }
  function buildMegaToolsSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'Tools';
    el.megaSubList.innerHTML = '';

    const gotoBtn = document.createElement('button');
    gotoBtn.type = 'button';
    gotoBtn.className = 'megaOption';
    gotoBtn.innerHTML = '<span>Go to page…</span><span class="megaOptionRight">Open</span>';
    gotoBtn.addEventListener('click', () => {
      closeMegaSettings(false);
      openGotoOverlay();
    });
    el.megaSubList.appendChild(gotoBtn);

    const fxBtn = document.createElement('button');
    fxBtn.type = 'button';
    fxBtn.className = 'megaOption';
    fxBtn.innerHTML = '<span>Image filters…</span><span class="megaOptionRight">Open</span>';
    fxBtn.addEventListener('click', () => {
      closeMegaSettings(false);
      openImgFxOverlay();
    });
    el.megaSubList.appendChild(fxBtn);

    const loupeBtn = document.createElement('button');
    loupeBtn.type = 'button';
    loupeBtn.className = 'megaOption';
    loupeBtn.innerHTML = '<span>Loupe…</span><span class="megaOptionRight">Open</span>';
    loupeBtn.addEventListener('click', () => {
      closeMegaSettings(false);
      openLoupeZoomOverlay();
    });
    el.megaSubList.appendChild(loupeBtn);

    // Build 31: reader Tools is a minimal top-level with organized submenus.
    const mkNav = (label, subId) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'megaOption';
      btn.innerHTML = `<span>${label}</span><span class="megaOptionRight">▶</span>`;
      btn.addEventListener('click', () => openMegaSub(subId));
      el.megaSubList.appendChild(btn);
    };

    mkNav('Modes', 'tools_modes');
    mkNav('Navigate', 'tools_navigate');
    mkNav('View', 'tools_view');
    mkNav('Bookmarks', 'tools_bookmarks');
    mkNav('Performance', 'tools_performance');
    mkNav('More', 'tools_more');
  }

  function buildMegaToolsModesSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'Modes';
    el.megaSubList.innerHTML = '';

    const cur = getControlMode();
    for (const def of CONTROL_MODE_DEFS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'megaOption';
      const on = (def.id === cur);
      btn.innerHTML = `<span>${def.label}</span><span class="megaOptionRight">${on ? '<span class="megaCheck">✓</span>' : ''}</span>`;
      btn.addEventListener('click', () => {
        setControlMode(def.id, { toast: true });
        closeMegaSettings(true);
      });
      el.megaSubList.appendChild(btn);
    }
  }

  function buildMegaToolsNavigateSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'Navigate';
    el.megaSubList.innerHTML = '';

    const volumesBtn = document.createElement('button');
    volumesBtn.type = 'button';
    volumesBtn.className = 'megaOption';
    volumesBtn.innerHTML = '<span>Volumes…</span><span class="megaOptionRight">Open</span>';
    volumesBtn.addEventListener('click', () => {
      const was = !!appState.wasPlayingBeforeMega;
      closeMegaSettings(false);
      openVolNav(true, was);
    });
    el.megaSubList.appendChild(volumesBtn);

    const gotoBtn = document.createElement('button');
    gotoBtn.type = 'button';
    gotoBtn.className = 'megaOption';
    gotoBtn.innerHTML = '<span>Go to page…</span><span class="megaOptionRight">Open</span>';
    gotoBtn.addEventListener('click', () => {
      closeMegaSettings(false);
      openGotoOverlay();
    });
    el.megaSubList.appendChild(gotoBtn);
  }

  function buildMegaToolsViewSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'View';
    el.megaSubList.innerHTML = '';

    const loupeNav = document.createElement('button');
    loupeNav.type = 'button';
    loupeNav.className = 'megaOption';
    loupeNav.innerHTML = '<span>Loupe</span><span class="megaOptionRight">▶</span>';
    loupeNav.addEventListener('click', () => openMegaSub('tools_view_loupe'));
    el.megaSubList.appendChild(loupeNav);

    const fxBtn = document.createElement('button');
    fxBtn.type = 'button';
    fxBtn.className = 'megaOption';
    fxBtn.innerHTML = '<span>Image filters…</span><span class="megaOptionRight">Open</span>';
    fxBtn.addEventListener('click', () => {
      closeMegaSettings(false);
      openImgFxOverlay();
    });
    el.megaSubList.appendChild(fxBtn);

    const shBtn = document.createElement('button');
    shBtn.type = 'button';
    shBtn.className = 'megaOption';
    shBtn.innerHTML = '<span>Double-page shadow…</span><span class="megaOptionRight">Open</span>';
    shBtn.addEventListener('click', () => openMegaSub('shadow'));
    el.megaSubList.appendChild(shBtn);
  }

  function buildMegaToolsViewLoupeSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'Loupe';
    el.megaSubList.innerHTML = '';

    const lOn = !!appState.settings?.loupeEnabled;
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'megaOption';
    toggleBtn.innerHTML = `<span>Toggle Loupe</span><span class="megaOptionRight">${lOn ? '<span class="megaCheck">✓</span>' : ''}</span>`;
    toggleBtn.addEventListener('click', () => {
      appState.settings.loupeEnabled = !appState.settings.loupeEnabled;
      syncLoupeEnabled();
      scheduleProgressSave();
      openMegaSub('tools_view_loupe', { replace: true });
    });
    el.megaSubList.appendChild(toggleBtn);

    const z = clamp(Number(appState.settings?.loupeZoom ?? 2.0), 0.5, 3.5);
    const zoomBtn = document.createElement('button');
    zoomBtn.type = 'button';
    zoomBtn.className = 'megaOption';
    zoomBtn.innerHTML = `<span>Loupe zoom…</span><span class="megaOptionRight">${z.toFixed(2)}×</span>`;
    zoomBtn.addEventListener('click', () => {
      closeMegaSettings(false);
      openLoupeZoomOverlay();
    });
    el.megaSubList.appendChild(zoomBtn);
  }

  function buildMegaToolsBookmarksSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'Bookmarks';
    el.megaSubList.innerHTML = '';

    const starred = isBookmarked(appState.pageIndex|0);
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'megaOption';
    toggleBtn.innerHTML = `<span>${starred ? 'Remove bookmark' : 'Bookmark this page'}</span><span class="megaOptionRight">${starred ? '<span class="megaCheck">✓</span>' : ''}</span>`;
    toggleBtn.addEventListener('click', () => {
      toggleBookmarkOnCurrentPage();
      openMegaSub('tools_bookmarks', { replace: true });
    });
    el.megaSubList.appendChild(toggleBtn);

    const bmBtn = document.createElement('button');
    bmBtn.type = 'button';
    bmBtn.className = 'megaOption';
    bmBtn.innerHTML = '<span>Bookmarks…</span><span class="megaOptionRight">Open</span>';
    bmBtn.addEventListener('click', () => openMegaSub('bookmarks'));
    el.megaSubList.appendChild(bmBtn);
  }

  function buildMegaToolsPerformanceSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'Performance';
    el.megaSubList.innerHTML = '';

    // BUILD29_CACHE_BY_BYTES: Memory Saver toggle
    const ms = !!appState.settings?.memorySaver;
    const msBtn = document.createElement('button');
    msBtn.type = 'button';
    msBtn.className = 'megaOption';
    msBtn.innerHTML = `<span>Memory Saver (smaller cache)</span><span class="megaOptionRight">${ms ? '<span class="megaCheck">✓</span>' : ''}</span>`;
    msBtn.addEventListener('click', () => {
      try { if (!appState.settings) appState.settings = {}; } catch {}
      appState.settings.memorySaver = !ms;
      scheduleProgressSave();
      prunePageCache(); // apply immediately
      openMegaSub('tools_performance', { replace: true });
    });
    el.megaSubList.appendChild(msBtn);
  }

  function buildMegaToolsMoreSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'More';
    el.megaSubList.innerHTML = '';

    const mkNav = (label, subId) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'megaOption';
      btn.innerHTML = `<span>${label}</span><span class="megaOptionRight">▶</span>`;
      btn.addEventListener('click', () => openMegaSub(subId));
      el.megaSubList.appendChild(btn);
    };

    mkNav('Export', 'tools_more_export');
    mkNav('File', 'tools_more_file');
    mkNav('Window', 'tools_more_window');
    mkNav('Help', 'tools_more_help');
  }

  function buildMegaToolsMoreExportSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'Export';
    el.megaSubList.innerHTML = '';

    const hasPages = !!appState.pages?.length;

    const expSaveBtn = document.createElement('button');
    expSaveBtn.type = 'button';
    expSaveBtn.className = 'megaOption';
    expSaveBtn.disabled = !hasPages;
    expSaveBtn.innerHTML = '<span>Save current page…</span><span class="megaOptionRight">Run</span>';
    expSaveBtn.addEventListener('click', async () => {
      const idx = clamp(Number(appState.pageIndex || 0), 0, (appState.pages?.length || 1) - 1);
      const p = appState.pages?.[idx];
      const entryIndex = p?.entryIndex;
      const entryName = p?.name || `page-${idx + 1}.jpg`;
      const kind = appState.cbzSessionId ? 'cbz' : (appState.cbrSessionId ? 'cbr' : null);
      const sessionId = appState.cbzSessionId || appState.cbrSessionId;
      if (!kind || !sessionId || entryIndex == null) { toast('No active page to export.'); return; }
      const r = await Tanko.api.export.saveEntry({ kind, sessionId, entryIndex, suggestedName: entryName });
      if (!r?.ok) { toast(r?.error || 'Export failed.'); return; }
      toast('Saved.');
    });
    el.megaSubList.appendChild(expSaveBtn);

    const expCopyBtn = document.createElement('button');
    expCopyBtn.type = 'button';
    expCopyBtn.className = 'megaOption';
    expCopyBtn.disabled = !hasPages;
    expCopyBtn.innerHTML = '<span>Copy current page to clipboard</span><span class="megaOptionRight">Run</span>';
    expCopyBtn.addEventListener('click', async () => {
      const idx = clamp(Number(appState.pageIndex || 0), 0, (appState.pages?.length || 1) - 1);
      const p = appState.pages?.[idx];
      const entryIndex = p?.entryIndex;
      const entryName = p?.name || `page-${idx + 1}.jpg`;
      const kind = appState.cbzSessionId ? 'cbz' : (appState.cbrSessionId ? 'cbr' : null);
      const sessionId = appState.cbzSessionId || appState.cbrSessionId;
      if (!kind || !sessionId || entryIndex == null) { toast('No active page to export.'); return; }
      const r = await Tanko.api.export.copyEntry({ kind, sessionId, entryIndex, suggestedName: entryName });
      if (!r?.ok) { toast(r?.error || 'Copy failed.'); return; }
      toast('Copied to clipboard.');
    });
    el.megaSubList.appendChild(expCopyBtn);
  }

  function buildMegaToolsMoreFileSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'File';
    el.megaSubList.innerHTML = '';

    const copyPathBtn = document.createElement('button');
    copyPathBtn.type = 'button';
    copyPathBtn.className = 'megaOption';
    copyPathBtn.disabled = !appState.book?.path;
    copyPathBtn.innerHTML = '<span>Copy volume path</span><span class="megaOptionRight">Copy</span>';
    copyPathBtn.addEventListener('click', () => { if (appState.book?.path) Tanko.api.clipboard.copyText(appState.book.path); });
    el.megaSubList.appendChild(copyPathBtn);

    const revealBtn = document.createElement('button');
    revealBtn.type = 'button';
    revealBtn.className = 'megaOption';
    revealBtn.disabled = !appState.book?.path;
    revealBtn.innerHTML = '<span>Reveal volume in Explorer</span><span class="megaOptionRight">Open</span>';
    revealBtn.addEventListener('click', () => { if (appState.book?.path) Tanko.api.shell.revealPath(appState.book.path); });
    el.megaSubList.appendChild(revealBtn);
  }

  function buildMegaToolsMoreWindowSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'Window';
    el.megaSubList.innerHTML = '';

    const openWinBtn = document.createElement('button');
    openWinBtn.type = 'button';
    openWinBtn.className = 'megaOption';
    openWinBtn.disabled = !appState.book?.id;
    openWinBtn.innerHTML = '<span>Open in new window</span><span class="megaOptionRight">Open</span>';
    openWinBtn.addEventListener('click', () => { if (appState.book?.id) Tanko.api.window.openBookInNewWindow(appState.book.id); });
    el.megaSubList.appendChild(openWinBtn);
  }

  function buildMegaToolsMoreHelpSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'Help';
    el.megaSubList.innerHTML = '';

    const keysBtn = document.createElement('button');
    keysBtn.type = 'button';
    keysBtn.className = 'megaOption';
    keysBtn.innerHTML = '<span>Keys</span><span class="megaOptionRight">Open</span>';
    keysBtn.addEventListener('click', () => {
      closeMegaSettings(true);
      toggleKeysOverlay(true);
    });
    el.megaSubList.appendChild(keysBtn);
  }

  

  function buildMegaBookmarksSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'Bookmarks';
    el.megaSubList.innerHTML = '';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'megaOption';
    const starred = isBookmarked(appState.pageIndex|0);
    toggleBtn.innerHTML = `<span>${starred ? 'Remove bookmark' : 'Bookmark this page'}</span><span class="megaOptionRight">${starred ? '<span class="megaCheck">✓</span>' : ''}</span>`;
    toggleBtn.addEventListener('click', () => {
      toggleBookmarkOnCurrentPage();
      openMegaSub('bookmarks'); // rebuild
    });
    el.megaSubList.appendChild(toggleBtn);

    const items = getBookmarksForActiveBook();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'muted tiny';
      empty.style.padding = '10px 6px';
      empty.textContent = 'No bookmarks yet.';
      el.megaSubList.appendChild(empty);
      return;
    }

    for (const idx of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'megaOption';
      const right = (idx === (appState.pageIndex|0)) ? '<span class="megaCheck">✓</span>' : 'Go';
      b.innerHTML = `<span>Page ${idx + 1}</span><span class="megaOptionRight">${right}</span>`;
      b.addEventListener('click', () => {
        const was = !!appState.wasPlayingBeforeMega;
        closeMegaSettings(false);
        goToPage(idx, was);
      });
      el.megaSubList.appendChild(b);
    }

    const clearAll = document.createElement('button');
    clearAll.type = 'button';
    clearAll.className = 'megaOption';
    clearAll.innerHTML = '<span>Clear all bookmarks</span><span class="megaOptionRight">Run</span>';
    clearAll.addEventListener('click', () => {
      setBookmarksForActiveBook([]);
      openMegaSub('bookmarks');
    });
    el.megaSubList.appendChild(clearAll);
  }

function buildMegaShadowSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'Double-page shadow';
    el.megaSubList.innerHTML = '';

    const presets = [
      { id: 'off', label: 'Off', v: 0.0 },
      { id: 'subtle', label: 'Subtle', v: 0.22 },
      { id: 'medium', label: 'Medium', v: 0.35 },
      { id: 'strong', label: 'Strong', v: 0.55 },
    ];
    const cur = clamp(Number(appState.settings?.twoPageGutterShadow ?? 0.35), 0, 1);

    for (const it of presets) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'megaOption';
      const on = Math.abs(cur - it.v) < 0.02;
      btn.innerHTML = `<span>${it.label}</span><span class="megaOptionRight">${on ? '<span class="megaCheck">✓</span>' : ''}</span>`;
      btn.addEventListener('click', async () => {
        appState.settings.twoPageGutterShadow = it.v;
        scheduleProgressSave();
        if (cachedBmp) drawActiveFrame(cachedBmp, cachedSpread);
        openMegaSub('shadow');
      });
      el.megaSubList.appendChild(btn);
    }
  }
function buildMegaProgressSubmenu() {
    if (!el.megaSubTitle || !el.megaSubList) return;
    el.megaSubTitle.textContent = 'Progress';
    el.megaSubList.innerHTML = '';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'megaOption';
    clearBtn.innerHTML = '<span>Clear resume</span><span class="megaOptionRight">Run</span>';
    clearBtn.addEventListener('click', () => {
      el.clearResumeBtn?.click();
      showMegaMain();
    });
    el.megaSubList.appendChild(clearBtn);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'megaOption';
    resetBtn.innerHTML = '<span>Reset series</span><span class="megaOptionRight">Run</span>';
    resetBtn.addEventListener('click', () => {
      el.resetSeriesBtn?.click();
      syncMegaMainValues();
      showMegaMain();
    });
    el.megaSubList.appendChild(resetBtn);
  }


  // Redraw helper
  // INTENT: Trigger a fresh draw without forcing navigation. Used when settings
  // change or when we need to recompute spread flags.
  let _drawRaf = 0;
  let _drawQueued = false;
  function scheduleDraw() {
    if (!document.body.classList.contains('inPlayer')) return;
    _drawQueued = true;
    if (_drawRaf) return;
    _drawRaf = requestAnimationFrame(() => {
      _drawRaf = 0;
      if (!_drawQueued) return;
      _drawQueued = false;

      // Clear cached "fast path" so changes take effect.
      try { clearCachedBmp(false); } catch {}

      ensureCachedBmp(true)
        .then(() => {
          if (!cachedBmp) return;
          try { resizeCanvasToDisplaySize(cachedBmp, cachedSpread); } catch {}
          try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
        })
        .catch(() => {});
    });
  }

  // BUILD 25 v2
  // INTENT: Predictable Mega Settings navigation.
  // - Back: go back exactly one level
  // - Close (Escape / click-outside): close Mega entirely
  // appState.megaNavStack: Array<{ subId: string, title: string }>
  function megaTitleForSub(subId) {
    const id = String(subId || 'main');
    // WHY: Titles are kept in the stack for future debugging and "context-blind" readability.
    // The stack itself is the source of truth for Back behavior.
    const map = {
      main: 'Settings',
      speed: 'Scroll speed',
      autoflip: 'Auto flip',
      scroll: 'Scroll',
      width: 'Page width',
      spreads: 'Spreads',
      tools: 'Tools',
      tools_modes: 'Modes',
      tools_navigate: 'Navigate',
      tools_view: 'View',
      tools_view_loupe: 'Loupe',
      tools_bookmarks: 'Bookmarks',
      tools_performance: 'Performance',
      tools_more: 'More',
      tools_more_export: 'Export',
      tools_more_file: 'File',
      tools_more_window: 'Window',
      tools_more_help: 'Help',
      bookmarks: 'Bookmarks',
      shadow: 'Double-page shadow',
      progress: 'Progress',
};
    return map[id] || id;
  }

  function megaNavBack() {
    // Guard against races: users can close Mega while a click is still in-flight.
    if (!isMegaOpen()) return;
    if (!Array.isArray(appState.megaNavStack) || appState.megaNavStack.length === 0) {
      showMegaMain();
      return;
    }

    const prev = appState.megaNavStack.pop();
    const target = String(prev?.subId || 'main');
    if (target === 'main') {
      showMegaMain();
    } else {
      openMegaSub(target, { replace: true });
    }
  }

  function openMegaSub(kind, opts = {}) {
    const next = String(kind || 'main');
    if (next === 'main') { showMegaMain(); return; }

    const replace = !!opts.replace;
    const cur = String(appState.megaSub || 'main');

    if (!replace && next !== cur) {
      if (!Array.isArray(appState.megaNavStack)) appState.megaNavStack = [];
      appState.megaNavStack.push({ subId: cur, title: megaTitleForSub(cur) });
    }

    appState.megaSub = next;
    el.megaMainPanel?.classList.add('hidden');
    el.megaSubPanel?.classList.remove('hidden');

    if (next === 'speed') buildMegaSpeedSubmenu();
    else if (next === 'autoflip') buildMegaAutoFlipSubmenu();
    else if (next === 'scroll') buildMegaScrollSubmenu();
    else if (next === 'width') buildMegaWidthSubmenu();
    else if (next === 'spreads') buildMegaSpreadsSubmenu();
    else if (next === 'tools') buildMegaToolsSubmenu();
    else if (next === 'tools_modes') buildMegaToolsModesSubmenu();
    else if (next === 'tools_navigate') buildMegaToolsNavigateSubmenu();
    else if (next === 'tools_view') buildMegaToolsViewSubmenu();
    else if (next === 'tools_view_loupe') buildMegaToolsViewLoupeSubmenu();
    else if (next === 'tools_bookmarks') buildMegaToolsBookmarksSubmenu();
    else if (next === 'tools_performance') buildMegaToolsPerformanceSubmenu();
    else if (next === 'tools_more') buildMegaToolsMoreSubmenu();
    else if (next === 'tools_more_export') buildMegaToolsMoreExportSubmenu();
    else if (next === 'tools_more_file') buildMegaToolsMoreFileSubmenu();
    else if (next === 'tools_more_window') buildMegaToolsMoreWindowSubmenu();
    else if (next === 'tools_more_help') buildMegaToolsMoreHelpSubmenu();
    else if (next === 'bookmarks') buildMegaBookmarksSubmenu();
    else if (next === 'shadow') buildMegaShadowSubmenu();
    else if (next === 'progress') buildMegaProgressSubmenu();
    else {
      // Unknown submenu: show empty
      if (el.megaSubTitle) el.megaSubTitle.textContent = '—';
      if (el.megaSubList) el.megaSubList.innerHTML = '';
    }

    // Build 31: keyboard navigation. Focus the first option in the active submenu.
    requestAnimationFrame(() => {
      try {
        if (!isMegaOpen()) return;
        el.megaSubList?.querySelector('button.megaOption:not([disabled])')?.focus();
      } catch {}
    });
  }

  function openMegaSettings(force) {
    if (!document.body.classList.contains('inPlayer')) return;
    if (!el.megaSettingsOverlay) return;

    const open = isMegaOpen();
    const next = typeof force === 'boolean' ? force : !open;
    if (!next) { closeMegaSettings(true); return; }

    const carry = getOverlayCarryWasPlaying();
    closeOtherOverlays('mega');

    // Opening pauses auto-scroll immediately.
    appState.wasPlayingBeforeMega = carry;
    if (appState.playing) pauseLoop();

    appState.megaOpen = true;
    el.megaSettingsOverlay.classList.add('open');
    syncMegaOverlayPositioningFromState();
    showMegaMain();
    try { hudRefreshAfterUiChange(); } catch {}
  }

  function closeMegaSettings(resume) {
    if (!el.megaSettingsOverlay) return;
    if (!isMegaOpen()) return;

    el.megaSettingsOverlay.classList.remove('open');
    appState.megaOpen = false;
    appState.megaSub = 'main';
    // BUILD 25 v2
    // INTENT: Closing Mega is an unconditional exit; drop navigation history.
    appState.megaNavStack = [];

    // BUILD 7: the Mode dropdown can be opened from inside Mega Settings.
    // If the panel is dismissed (Escape or click-outside), ensure the dropdown
    // isn't left floating on screen.
    try { closeModeMenu(); } catch {}
    // BUILD8_IMAGE_FIT_TOGGLE: if the Image Fit dropdown was open, close it too.
    try { closeImageFitMenu(); } catch {}

    const shouldResume = (resume !== false) && appState.wasPlayingBeforeMega;
    appState.wasPlayingBeforeMega = false;
    if (shouldResume) startLoop().catch(()=>{});
    try { hudRefreshAfterUiChange(); } catch {}
  }

  // -----------------------------
