// Build 9: moved from src/modules/reader_20_viewport.js into src/modules/reader/*
// NOTE: Mechanical split. Logic is unchanged.
// Split from the original src/modules/reader.js — VIEWPORT section (Build 6, Phase 1)
  // EDIT_ZONE:VIEWPORT
  function getViewportCssSize() {
    const inPlayer = document.body.classList.contains('inPlayer');
    const inVideoPlayer = document.body.classList.contains('inVideoPlayer');
    if (inVideoPlayer) return;
    if (inPlayer) {
      return {
        vw: Math.max(1, window.innerWidth || 1),
        vh: Math.max(1, window.innerHeight || 1),
      };
    }
    const r = el.stage.getBoundingClientRect();
    return {
      vw: Math.max(1, Math.round(r.width || 1)),
      vh: Math.max(1, Math.round(r.height || 1)),
    };
  }

  function resizeCanvasToDisplaySize(bmp, spread) {
    const dpr = window.devicePixelRatio || 1;
    const { vw, vh } = getViewportCssSize();
    const w = Math.max(1, Math.round(vw * dpr));
    const h = Math.max(1, Math.round(vh * dpr));
    if (el.stage.width === w && el.stage.height === h) return;

    // Preserve scroll position across resizes (portrait + spreads).
    if (bmp) {
      // IMPORTANT: use the exact same no-upscale sizing rule as the strip renderer.
      const pwFrac = getPortraitWidthFrac();
      const capW = Math.round(bmp.width * dpr);

      const cwOld = el.stage.width || 1;
      const maxWOld = spread ? cwOld : Math.round(cwOld * pwFrac);
      const drawWOld = Math.min(maxWOld, capW);
      const scaleOld = drawWOld / Math.max(1e-6, bmp.width);
      const sySrc = appState.y / Math.max(1e-6, scaleOld);

      el.stage.width = w;
      el.stage.height = h;

      // Keep manual scroller geometry in sync with viewport resizes.
      try { recomputeManualScrollerMaxTopCache(); } catch {}

      const maxWNew = spread ? w : Math.round(w * pwFrac);
      const drawWNew = Math.min(maxWNew, capW);
      const scaleNew = drawWNew / Math.max(1e-6, bmp.width);
      const scaledHNew = Math.round(bmp.height * scaleNew);

      appState.y = sySrc * scaleNew;
      appState.yMax = Math.max(0, scaledHNew - h);
      return;
    }

    el.stage.width = w;
    el.stage.height = h;

    // Keep manual scroller geometry in sync with viewport resizes.
    try { recomputeManualScrollerMaxTopCache(); } catch {}
  }

  // Build 33: manual scroller progress sync (thumb reflects current progress).
  function updateManualScrollerThumb(bmp, spread) {
    if (!el.manualScroller || !el.manualScrollerThumb) return;
    if (!document.body.classList.contains('inPlayer')) return;
    if (appState.manualScrollerDragging) return;
    // FIND_THIS:TANKOBAN_TWO_PAGE_SCROLL_SCROLLER_THUMB (Tankoban Build 4)
    // In Two-Page (Scroll), the right-side scroller represents the stacked-stream y progress (not page index).
    if (isTwoPageScrollMode()) {
      const ch = el.stage.height || 1;

      // BUILD18_TWOPAGE_SCROLL_THUMB_LOCAL_DURING_HOLD:
      // During entry-sync hold, appState.y is local-to-row, so the thumb should reflect that.
      let maxY = 0;
      if (twoPageScrollHoldSingleRowUntilSync) {
        const rowH = Number(twoPageScrollRowContentHeightDevPx) || 0;
        maxY = Math.max(0, rowH - ch);
      } else {
        const totalH = Number(twoPageScrollTotalHeightDevPx) || 0;
        maxY = Math.max(0, totalH - ch);
      }

      const progress = (maxY > 0) ? clamp((Number(appState.y) || 0) / maxY, 0, 1) : 0;
      setManualScrollerProgress(progress);
      return;
    }

    const total = appState.pages.length || 0;
    if (!total || !bmp) return;

    const cw = el.stage.width || 1;
    const pwFrac = getPortraitWidthFrac();
    const m0 = getNoUpscaleMetrics(bmp, !!spread, cw, pwFrac);
    const scaledH0 = Math.max(1e-6, m0.scaledH);
    const local = clamp(appState.y / scaledH0, 0, 1);
    const progress = clamp((appState.pageIndex + local) / total, 0, 1);
    setManualScrollerProgress(progress);
  }

function drawFrame(bmp, spread) {
    resizeCanvasToDisplaySize(bmp, spread);

    const cw = el.stage.width, ch = el.stage.height;
    const ctx = el.stage.getContext('2d');

    // Always start from identity so transforms from spread rendering never leak.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    applyScaleQualityToCtx(ctx);

    // Clear to black (device pixels).
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);

    // Build 14: spreads are part of the same infinite strip.
    // The `spread` flag now only affects per-page width/scale.

    // === PORTRAIT STRIP RENDER ===
    // EDIT_ZONE:PORTRAIT_RENDER
    // Portrait Strip Mode: continuous vertical strip (webtoon-style)
    const pwFrac = getPortraitWidthFrac();

    const m0 = getNoUpscaleMetrics(bmp, spread, cw, pwFrac);

    // Current page metrics (spread pages use full viewport width, but never upscale).
    const drawW0 = m0.drawW;
    const dx0 = m0.dx;
    const scale0 = m0.scale;
    const scaledH0 = m0.scaledH;
    appState.yMax = Math.max(0, scaledH0 - ch);

    const scrollY = Math.round(appState.y);
    let yDest = -scrollY;

    // BUILD 19H_LOUPE (Build 19H)
    // INTENT: Capture draw rects so the loupe can sample the correct bitmap under the cursor.
    const loupeRectsDev = [];

    // Draw current page + following pages (portrait + spreads) until the screen is filled.
    for (let k = 0; k < 6; k++) {
      const idx = appState.pageIndex + k;
      if (idx >= appState.pages.length) break;

      let bmpK = null;
      let spreadK = null;

      if (k === 0) {
        bmpK = bmp;
        spreadK = spread;
      } else {
        const e = pageCache.get(idx);
        if (e?.bmp) {
          bmpK = e.bmp;
          spreadK = !!e.spread;
        }
      }

      if (!bmpK) break;

      const mK = getNoUpscaleMetrics(bmpK, spreadK, cw, pwFrac);
      const drawWK = mK.drawW;
      const dxK = mK.dx;
      const scaleK = mK.scale;
      const h = mK.scaledH;
      const yHere = Math.round(yDest);

      // PERF_HOTSPOT: portrait mode draws multiple cached bitmaps per frame; ensure mode switches cannot leave stale smoothing → FIX: re-apply right before each drawImage.
      applyScaleQualityToCtx(ctx);
      ctx.drawImage(bmpK, 0, 0, bmpK.width, bmpK.height, dxK, yHere, drawWK, h);

      // BUILD 19H_LOUPE (Build 19H)
      // INTENT: Keep a lightweight mapping for whichever pages are currently drawn in the viewport.
      loupeRectsDev.push({
        bmp: bmpK,
        dstDev: { x: dxK, y: yHere, w: drawWK, h },
        src: { x: 0, y: 0, w: bmpK.width, h: bmpK.height },
      });

      yDest += h;
      if (yDest >= ch) break;
    }


    // BUILD 19H_LOUPE (Build 19H)
    // INTENT: Convert device-pixel draw rects into canvas CSS-space for accurate cursor mapping.
    try {
      const r = el.stage.getBoundingClientRect();
      const sxCss = (r && r.width) ? (r.width / (cw || 1)) : 1;
      const syCss = (r && r.height) ? (r.height / (ch || 1)) : 1;
      lastFrameRects = (loupeRectsDev || []).map(rr => ({
        bmp: rr.bmp,
        dstCss: { x: rr.dstDev.x * sxCss, y: rr.dstDev.y * syCss, w: rr.dstDev.w * sxCss, h: rr.dstDev.h * syCss },
        src: rr.src,
      }));
    } catch {
      lastFrameRects = [];
    }
    el.scrollText.textContent = `${Math.round(appState.y)}/${Math.round(appState.yMax)}`;
    el.modeText.textContent = 'portrait';
    syncHudPageCounter();
    updateManualScrollerThumb(bmp, spread);
    updateDebugOverlay();
  }


// Single-page portrait render (v16 math): draw exactly one page slice at a time.
function drawSinglePageFrame(bmp) {
  resizeCanvasToDisplaySize(bmp, false);

  const ctx = el.stage.getContext('2d');
  const cw = el.stage.width, ch = el.stage.height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  applyScaleQualityToCtx(ctx);

  // Clear to black (device pixels).
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);

  // FIND_THIS:TANKOBAN_PORTRAIT_MARGINS (Tankoban Build 1)
  // Single-page scroll: keep portrait pages centered with side margins (WeebCentral-style),
  // while wide spreads go full width.
  const PORTRAIT_MAX_W = VIEW_CONSTANTS.PORTRAIT_MAX_W; // canvas px
  const isWide = (bmp.width >= (bmp.height * VIEW_CONSTANTS.WIDE_RATIO_1_15));
  const targetW = isWide ? cw : Math.min(cw, PORTRAIT_MAX_W);
  const drawW = targetW;
  const dx = Math.floor((cw - drawW) / 2);

  const scale = drawW / bmp.width;
  const scaledH = Math.round(bmp.height * scale);
  const yMax = Math.max(0, scaledH - ch);
  appState.yMax = yMax;
  appState.y = clamp(appState.y, 0, yMax);

  // Source crop (image pixels).
  const sy = Math.round(appState.y / scale);
  const sh = Math.ceil(ch / scale);
  const sy2 = clamp(sy, 0, Math.max(0, bmp.height - sh));

  // PERF_HOTSPOT: ctx state resets easily after canvas resizes; enforce the selected scale mode on the final draw → FIX: re-apply before drawImage.
  applyScaleQualityToCtx(ctx);
  ctx.drawImage(bmp, 0, sy2, bmp.width, sh, dx, 0, drawW, ch);

  // Bottom padding if we run out of source rows (device pixels).
  const usedH = Math.round(sh * scale);
  if (usedH < ch) {
    ctx.fillStyle = '#000';
    ctx.fillRect(dx, usedH, drawW, ch - usedH);
  }

  // BUILD 19H_LOUPE (Build 19H)
  // INTENT: Loupe needs stable mapping from cursor (CSS px) to source bitmap px.
  try {
    const r = el.stage.getBoundingClientRect();
    const sxCss = (r && r.width) ? (r.width / (cw || 1)) : 1;
    const syCss = (r && r.height) ? (r.height / (ch || 1)) : 1;
    lastFrameRects = [{
      bmp,
      dstCss: { x: dx * sxCss, y: 0, w: drawW * sxCss, h: ch * syCss },
      src: { x: 0, y: sy2, w: bmp.width, h: sh },
    }];
  } catch {
    lastFrameRects = [];
  }

  // HUD bits
  el.modeText.textContent = 'portrait';
  el.scrollText.textContent = `${Math.round(appState.y)}/${Math.round(appState.yMax)}`;
  syncHudPageCounter();
  updateManualScrollerThumb(bmp, false);
  updateDebugOverlay();
}

