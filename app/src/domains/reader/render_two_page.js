// Build 9: moved from src/modules/reader_20_viewport.js into src/modules/reader/*
// NOTE: Mechanical split. Logic is unchanged.
// FIND_THIS:TWO_PAGE_RENDER_PATH (Build 47A2)
// FIND_THIS:TWO_PAGE_PAIRING (Build 47A3)
function isStitchedSpread(index) {
  const n = appState.pages.length || 0;
  if (!n) return false;
  const i = clamp(index, 0, n - 1);

  // BUILD29_SPREAD_OVERRIDE_PRECEDENCE (Build 29)
  // Manual overrides must win over any cached/auto spread flags.
  try { if (knownNormalIndexSet && knownNormalIndexSet.has(i)) return false; } catch {}
  try { if (knownSpreadIndexSet && knownSpreadIndexSet.has(i)) return true; } catch {}

  // Prefer existing spread metadata (decode-time spread flag).
  if (i === cachedIndex && cachedBmp) return !!cachedSpread;

  const e = pageCache.get(i);
  if (e && e.bmp && typeof e.spread === 'boolean') return !!e.spread;

  // (auto/dims fallback continues below)

  // BUILD19_DIMS_CACHE_FALLBACK (Build 19)
  // If Two-Page Scroll dims cache already computed it, use that synchronously.
  const dh = twoPageScrollDimsCache.get(i);
  if (dh && typeof dh.spread === 'boolean') {
    if (dh.spread) {
      // Don't re-learn as spread if user manually forced Normal.
      try { if (!knownNormalIndexSet?.has(i)) knownSpreadIndexSet.add(i); } catch {}
    }
    return !!dh.spread;
  }

  // If we don't know yet, kick off an async dims compute (throttled) and return false for now.
  // This avoids blocking while still improving parity as the cache warms.
  getTwoPageScrollDimsAtIndex(i)
    .then((d) => {
        if (d?.spread) {
          try { if (!knownNormalIndexSet?.has(i)) knownSpreadIndexSet.add(i); } catch {}
        }
      })
    .catch(() => {});
  return false;
}

// FIND_THIS:BUILD17_TWO_PAGE_PHYSICAL_PARITY (Build 17)
// WeebCentral-style coupling: stitched spreads represent TWO physical pages but only ONE index.
// That causes parity to drift unless we treat each stitched spread as consuming an extra “slot”
// for the purposes of pairing AFTER it.
//
// IMPORTANT: we intentionally ignore page 0 (cover) so beginning-of-volume pairing stays identical.
function twoPageExtraSlotsBefore(idx) {
  const n = appState.pages.length || 0;
  if (!n) return 0;
  const stop = clamp(Math.round(Number(idx) || 0), 0, n);
  let extra = 0;
  for (let j = 1; j < stop; j++) {
    if (isStitchedSpread(j)) extra++;
  }
  return extra;
}

function twoPageEffectiveIndex(idx) {
  const n = appState.pages.length || 0;
  if (!n) return 0;
  const i = clamp(Math.round(Number(idx) || 0), 0, n - 1);
  if (i <= 0) return i; // cover stays special
  return i + twoPageExtraSlotsBefore(i);
}

function snapTwoPageIndex(i) {
  const n = appState.pages.length || 0;
  if (!n) return 0;
  let idx = clamp(Math.round(Number(i) || 0), 0, n - 1);
  if (idx === 0) return 0;

  if (isStitchedSpread(idx)) return idx;

  // Prefer physical pair-start based on effective parity (Build 17 helper).
  // BUILD18_COUPLING_NUDGE: allow user to flip parity when coupling drifts mid-volume.
  const nudge = (appState.settings?.twoPageCouplingNudge ? 1 : 0);
  const eff = twoPageEffectiveIndex(idx) + nudge;

  if ((eff % 2) === 0) {
    const odd = idx - 1;

    // Never snap onto cover as a “pair start”.
    if (odd <= 0) return idx;

    if (odd >= 1 && isStitchedSpread(odd)) return idx;
    return odd;
  }
  return idx;
}

function getTwoPagePair(i) {
  const n = appState.pages.length || 0;
  const idx = clamp(Math.round(Number(i) || 0), 0, Math.max(0, n - 1));
  const s = snapTwoPageIndex(idx);

  // Cover (page 0) is always alone (unless it is a stitched spread).
  if (s === 0) {
    const spread0 = isStitchedSpread(0);
    return {
      isSpread: spread0,
      coverAlone: !spread0,
      rightIndex: 0,
      leftIndexOrNull: null,
      unpairedSingle: false,
    };
  }

  // A stitched spread renders alone, full width.
  if (isStitchedSpread(s)) {
    return {
      isSpread: true,
      coverAlone: false,
      rightIndex: s,
      leftIndexOrNull: null,
      unpairedSingle: false,
    };
  }

  // Normal pairing using physical parity (Build 17): pair-start is “effective odd”.
  // BUILD18_COUPLING_NUDGE: flip parity on demand.
  const nudge = (appState.settings?.twoPageCouplingNudge ? 1 : 0);
  if (((twoPageEffectiveIndex(s) + nudge) % 2) === 1) {
    const rightIndex = s;
    const leftIndex = s + 1;
    if (leftIndex >= n) {
      return {
        isSpread: false,
        coverAlone: false,
        rightIndex,
        leftIndexOrNull: null,
        unpairedSingle: true,
      };
    }
    if (isStitchedSpread(leftIndex)) {
      return {
        isSpread: false,
        coverAlone: false,
        rightIndex,
        leftIndexOrNull: null,
        unpairedSingle: true,
      };
    }
    return {
      isSpread: false,
      coverAlone: false,
      rightIndex,
      leftIndexOrNull: leftIndex,
      unpairedSingle: false,
    };
  }

  // Even index that cannot snap to an odd pair-start (usually because the odd is a spread).
  return {
    isSpread: false,
    coverAlone: false,
    rightIndex: s,
    leftIndexOrNull: null,
    unpairedSingle: true,
  };
}

// FIND_THIS:TWO_PAGE_PREFETCH (Build 47A5)
function prefetchTwoPagePartner(idx, opts = {}) {
  if (!(isTwoPageFlipMode(getControlMode()) || getControlMode() === 'autoFlip')) return null;
  const pair = getTwoPagePair(idx);
  if (!pair || pair.isSpread || pair.coverAlone || pair.unpairedSingle) return null;
  const leftIdx = pair.leftIndexOrNull;
  if (!Number.isFinite(leftIdx)) return null;

  const e = pageCache.get(leftIdx);
  if (e?.bmp) return null;

  // Request decode early so Two-Page renders as a true pair (no partner pop-in).
  const prom = e?.promise || getBitmapAtIndex(leftIdx);

  if (opts.redrawWhenReady) {
    Promise.resolve(prom)
      .then(() => {
        if (!document.body.classList.contains('inPlayer')) return;
        if (!(isTwoPageFlipMode(getControlMode()) || getControlMode() === 'autoFlip')) return;
        if (!cachedBmp) return;
        try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
      })
      .catch(() => {
        if (!document.body.classList.contains('inPlayer')) return;
        if (!(isTwoPageFlipMode(getControlMode()) || getControlMode() === 'autoFlip')) return;
        if (!cachedBmp) return;
        // Partner missing/failed: keep a clean single-page fallback (no crash).
        try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
      });
  }

  return prom;
}

// FIND_THIS:TWO_PAGE_RENDER_CORE (Build 47A3)
function drawTwoPageFrame(bmp) {
  // FIND_THIS:TWO_PAGE_FLIP_HIDPI_CANVAS (Tankoban Build 6)
  // Two-Page (Flip): ensure the canvas backing store matches CSS size × DPR,
  // and keep drawing coordinates in CSS pixels for predictable sharpness.
  const dpr = window.devicePixelRatio || 1;
  const r = el.stage.getBoundingClientRect();

  // BUILD19G_TWO_PAGE_FRACTIONAL_DPI (Build 19G)
  // INTENT: On fractional scaling (Windows 125%/150% or Chromium zoom), r.width/r.height can be non-integer.
  // If we Math.round CSS size and then assume transform=dpr, we can introduce a tiny resample step → softness.
  // Fix: treat CSS size as float, size backing store from it, and set transform from the *actual* ratio.
  const cwCss = Math.max(1, Number(r.width || window.innerWidth || 1));
  const chCss = Math.max(1, Number(r.height || window.innerHeight || 1));
  const cwDev = Math.max(1, Math.round(cwCss * dpr));
  const chDev = Math.max(1, Math.round(chCss * dpr));

  if (el.stage.width !== cwDev || el.stage.height !== chDev) {
    el.stage.width = cwDev;
    el.stage.height = chDev;
    try { recomputeManualScrollerMaxTopCache(); } catch {}
  }

  const ctx = el.stage.getContext('2d');
  const cw = cwCss, ch = chCss;

  // Exact realized backing-store ratio (can differ slightly from devicePixelRatio on fractional scaling).
  const sx = (el.stage.width || cwDev) / Math.max(1e-6, cwCss);
  const sy = (el.stage.height || chDev) / Math.max(1e-6, chCss);
  ctx.setTransform(sx, 0, 0, sy, 0, 0);

  // FIND_THIS:TWO_PAGE_FLIP_DOWNSCALE_QUALITY (Tankoban Build 6)
  applyScaleQualityToCtx(ctx);

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);

  // Force strip scroll off in Two-Page.
  appState.y = 0;
  appState.yMax = 0;

  const gutter = VIEW_CONSTANTS.TWO_PAGE_GUTTER_PX;
  const leftW = Math.floor((cw - gutter) / 2);
  const rightW = cw - gutter - leftW;

  const pair = getTwoPagePair(appState.pageIndex);

  const mode = getControlMode();
  const imageFit = getTwoPageImageFit(mode);
  const fitWidth = (imageFit === 'width');

  // BUILD44_MANGAPLUS_ZOOM: apply extra zoom multiplier only in MangaPlus mode.
  const zoomPctRaw = (mode === 'twoPageMangaPlus')
    ? Number(appState.settings?.twoPageMangaPlusZoomPct ?? 100)
    : 100;
  const zoomPct = clamp(Number.isFinite(zoomPctRaw) ? zoomPctRaw : 100, 100, 260);
  const zoomed = (mode === 'twoPageMangaPlus' && zoomPct > 100);
  const zoomFactor = zoomPct / 100;

  const requestTwoPageDecode = (idx) => {
    if (!Number.isFinite(idx)) return;
    const e = pageCache.get(idx);
    if (e?.bmp || e?.promise) return;
    getBitmapAtIndex(idx)
      .then(() => {
        if (!document.body.classList.contains('inPlayer')) return;
        if (!(isTwoPageFlipMode(getControlMode()) || getControlMode() === 'autoFlip')) return;
        if (!cachedBmp) return;
        try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
      })
      .catch(() => {});
  };

  const getBmpSync = (idx) => {
    if (!Number.isFinite(idx)) return null;
    if (idx === appState.pageIndex) return bmp;
    const e = pageCache.get(idx);
    if (e?.bmp) return e.bmp;
    requestTwoPageDecode(idx);
    return null;
  };

  // Helpers: store pan in device pixels, apply as CSS offsets using sx/sy.
  const panYCss = () => (sy > 0 ? (twoPageFlickPanY / sy) : 0);
  const panXCss = () => (sx > 0 ? (twoPageFlickPanX / sx) : 0);

  const applyPanState = ({ sig, allowY, maxYCss, allowX, maxXCss }) => {
    const maxYDev = (allowY && maxYCss > 0) ? Math.max(0, Math.round(maxYCss * sy)) : 0;
    const maxXDev = (allowX && maxXCss > 0) ? Math.max(0, Math.round(maxXCss * sx)) : 0;

    const sigChanged = (twoPageFlickPanSig !== sig);

    twoPageFlickPanSig = sig;
    twoPageFlickPanMax = maxYDev;
    twoPageFlickPanMaxX = maxXDev;

    if (sigChanged) {
      // Vertical: Fit Width starts at top; MangaPlus zoom overflow starts centered (more intuitive).
      if (maxYDev > 0) {
        twoPageFlickPanY = (zoomed && !fitWidth) ? Math.round(maxYDev / 2) : 0;
      } else {
        twoPageFlickPanY = 0;
      }

      // Horizontal: in MangaPlus zoom, snap to reading-start edge; otherwise start centered.
      if (maxXDev > 0) {
        if (mode === 'twoPageMangaPlus' && zoomed) {
          // RTL (next on left) starts at right edge; LTR starts at left edge.
          twoPageFlickPanX = twoPageMangaPlusNextOnLeft ? maxXDev : 0;
        } else {
          twoPageFlickPanX = Math.round(maxXDev / 2);
        }
      } else {
        twoPageFlickPanX = 0;
      }
    }

    if (maxYDev > 0) twoPageFlickPanY = clamp(twoPageFlickPanY, 0, maxYDev);
    else twoPageFlickPanY = 0;

    if (maxXDev > 0) twoPageFlickPanX = clamp(twoPageFlickPanX, 0, maxXDev);
    else twoPageFlickPanX = 0;

    return { maxYDev, maxXDev };
  };

  // Loupe mapping: always populate at least one rect.
  const setLastFrameRectSingle = (b, dx, dy, dw, dh) => {
    try {
      lastFrameRects = [
        { bmp: b, dstCss: { x: dx, y: dy, w: dw, h: dh }, src: { x: 0, y: 0, w: b.width, h: b.height } },
      ];
    } catch {}
  };

  if (pair.isSpread) {
    const b = getBmpSync(pair.rightIndex) || bmp;
    if (!b) return;

    const scaleByWidth = cw / Math.max(1e-6, b.width);
    const scaleByHeight = ch / Math.max(1e-6, b.height);
    const baseScale = fitWidth ? scaleByWidth : Math.min(scaleByWidth, scaleByHeight);
    const scale = baseScale * (zoomed ? zoomFactor : 1);

    const dw = Math.round(b.width * scale);
    const dh = Math.round(b.height * scale);

    const dxBase = Math.round((cw - dw) / 2);
    const dyCenter = Math.round((ch - dh) / 2);

    const allowY = fitWidth || (zoomed && dh > ch);
    const allowX = zoomed && dw > cw;

    const sig = `${mode}|${imageFit}|z${zoomPct}|spread|${pair.rightIndex}`;
    applyPanState({
      sig,
      allowY,
      maxYCss: Math.max(0, dh - ch),
      allowX,
      maxXCss: Math.max(0, dw - cw),
    });

    // BUILD44_SPREAD_PAN_MAPPING_FIX:
    // PanX should map to edges (panX=0 => left edge visible; panX=max => right edge visible).
    const minX = dxBase;
    const shiftX = allowX ? Math.round(-minX - panXCss()) : 0;
    const dx = dxBase + shiftX;
    const dy = (allowY && (dh > ch))
      ? Math.round(-panYCss())
      : dyCenter;

    drawImageScaled(ctx, b, 0, 0, b.width, b.height, dx, dy, dw, dh);
    setLastFrameRectSingle(b, dx, dy, dw, dh);
  } else if (pair.coverAlone) {
    const b = getBmpSync(0) || bmp;
    if (!b) return;

    const scaleByWidth = leftW / Math.max(1e-6, b.width);
    const scaleByHeight = ch / Math.max(1e-6, b.height);
    const baseScale = fitWidth ? scaleByWidth : Math.min(scaleByWidth, scaleByHeight);
    const scale = baseScale * (zoomed ? zoomFactor : 1);

    const dw = Math.round(b.width * scale);
    const dh = Math.round(b.height * scale);

    // cover is flush to the center line (left page)
    const dxBase = Math.round(leftW - dw);
    const dyCenter = Math.round((ch - dh) / 2);

    const allowY = fitWidth || (zoomed && dh > ch);
    // In MangaPlus zoom, allow horizontal pan when the left page overflows viewport bounds.
    const minX = dxBase;
    const maxX = dxBase + dw;
    const groupW = maxX - minX;
    const allowX = zoomed && groupW > cw;
    const maxXCss = allowX ? Math.max(0, groupW - cw) : 0;

    const sig = `${mode}|${imageFit}|z${zoomPct}|cover|0`;
    applyPanState({
      sig,
      allowY,
      maxYCss: Math.max(0, dh - ch),
      allowX,
      maxXCss,
    });

    // Shift whole content group; panX is “how far from left edge” in CSS units.
    const shiftX = allowX ? Math.round(-minX - panXCss()) : 0;
    const dx = dxBase + shiftX;
    const dy = (allowY && (dh > ch))
      ? Math.round(-panYCss())
      : dyCenter;

    drawImageScaled(ctx, b, 0, 0, b.width, b.height, dx, dy, dw, dh);
    setLastFrameRectSingle(b, dx, dy, dw, dh);
  } else if (pair.unpairedSingle || !pair.leftIndexOrNull) {
    const b = getBmpSync(pair.rightIndex) || bmp;
    if (!b) return;

    const scaleByWidth = rightW / Math.max(1e-6, b.width);
    const scaleByHeight = ch / Math.max(1e-6, b.height);
    const baseScale = fitWidth ? scaleByWidth : Math.min(scaleByWidth, scaleByHeight);
    const scale = baseScale * (zoomed ? zoomFactor : 1);

    const dw = Math.round(b.width * scale);
    const dh = Math.round(b.height * scale);

    // single is flush to the center line (right page)
    const dxBase = Math.round(leftW + gutter);
    const dyCenter = Math.round((ch - dh) / 2);

    const allowY = fitWidth || (zoomed && dh > ch);
    const minX = dxBase;
    const maxX = dxBase + dw;
    const groupW = maxX - minX;
    const allowX = zoomed && groupW > cw;
    const maxXCss = allowX ? Math.max(0, groupW - cw) : 0;

    const sig = `${mode}|${imageFit}|z${zoomPct}|single|${pair.rightIndex}`;
    applyPanState({
      sig,
      allowY,
      maxYCss: Math.max(0, dh - ch),
      allowX,
      maxXCss,
    });

    const shiftX = allowX ? Math.round(-minX - panXCss()) : 0;
    const dx = dxBase + shiftX;
    const dy = (allowY && (dh > ch))
      ? Math.round(-panYCss())
      : dyCenter;

    drawImageScaled(ctx, b, 0, 0, b.width, b.height, dx, dy, dw, dh);
    setLastFrameRectSingle(b, dx, dy, dw, dh);
  } else {
    const bR = getBmpSync(pair.rightIndex) || bmp;
    const bL = getBmpSync(pair.leftIndexOrNull);

    if (!bL) {
      // Right page only (partner missing)
      const scaleByWidth = rightW / Math.max(1e-6, bR.width);
      const scaleByHeight = ch / Math.max(1e-6, bR.height);
      const baseScale = fitWidth ? scaleByWidth : Math.min(scaleByWidth, scaleByHeight);
      const scale = baseScale * (zoomed ? zoomFactor : 1);

      const dw = Math.round(bR.width * scale);
      const dh = Math.round(bR.height * scale);

      const dxBase = Math.round(leftW + gutter);
      const dyCenter = Math.round((ch - dh) / 2);

      const allowY = fitWidth || (zoomed && dh > ch);
      const minX = dxBase;
      const maxX = dxBase + dw;
      const groupW = maxX - minX;
      const allowX = zoomed && groupW > cw;
      const maxXCss = allowX ? Math.max(0, groupW - cw) : 0;

      const sig = `${mode}|${imageFit}|z${zoomPct}|pairR|${pair.rightIndex}`;
      applyPanState({
        sig,
        allowY,
        maxYCss: Math.max(0, dh - ch),
        allowX,
        maxXCss,
      });

      const shiftX = allowX ? Math.round(-minX - panXCss()) : 0;
      const dx = dxBase + shiftX;
      const dy = (allowY && (dh > ch))
        ? Math.round(-panYCss())
        : dyCenter;

      drawImageScaled(ctx, bR, 0, 0, bR.width, bR.height, dx, dy, dw, dh);
      setLastFrameRectSingle(bR, dx, dy, dw, dh);
    } else {
      // Both pages present
      const scaleRByWidth = rightW / Math.max(1e-6, bR.width);
      const scaleLByWidth = leftW / Math.max(1e-6, bL.width);
      const scaleRByHeight = ch / Math.max(1e-6, bR.height);
      const scaleLByHeight = ch / Math.max(1e-6, bL.height);

      const baseScaleR = fitWidth ? scaleRByWidth : Math.min(scaleRByWidth, scaleRByHeight);
      const baseScaleL = fitWidth ? scaleLByWidth : Math.min(scaleLByWidth, scaleLByHeight);
      const baseScale = Math.min(baseScaleR, baseScaleL);
      const scale = baseScale * (zoomed ? zoomFactor : 1);

      const dwR = Math.round(bR.width * scale);
      const dhR = Math.round(bR.height * scale);
      const dwL = Math.round(bL.width * scale);
      const dhL = Math.round(bL.height * scale);

      const contentH = Math.max(dhR, dhL);

      const dxRBase = Math.round(leftW + gutter);
      const dxLBase = Math.round(leftW - dwL);

      const minX = Math.min(dxLBase, dxRBase);
      const maxX = Math.max(dxLBase + dwL, dxRBase + dwR);
      const groupW = maxX - minX;

      const allowY = fitWidth || (zoomed && contentH > ch);
      const allowX = zoomed && groupW > cw;

      const sig = `${mode}|${imageFit}|z${zoomPct}|pair|${pair.rightIndex}|${pair.leftIndexOrNull}`;
      applyPanState({
        sig,
        allowY,
        maxYCss: Math.max(0, contentH - ch),
        allowX,
        maxXCss: allowX ? Math.max(0, groupW - cw) : 0,
      });

      const shiftX = allowX ? (-minX - panXCss()) : 0;

      // Whole-group horizontal shift (keeps gutter spacing intact)
      const dxR = Math.round(dxRBase + shiftX);
      const dxL = Math.round(dxLBase + shiftX);

      const dyCommon = (allowY && contentH > ch) ? Math.round(-panYCss()) : null;
      const dyR = (dyCommon != null) ? dyCommon : Math.round((ch - dhR) / 2);
      const dyL = (dyCommon != null) ? dyCommon : Math.round((ch - dhL) / 2);

      drawImageScaled(ctx, bL, 0, 0, bL.width, bL.height, dxL, dyL, dwL, dhL);
      drawImageScaled(ctx, bR, 0, 0, bR.width, bR.height, dxR, dyR, dwR, dhR);

      // BUILD 19H_LOUPE (Build 19H)
      lastFrameRects = [
        { bmp: bL, dstCss: { x: dxL, y: dyL, w: dwL, h: dhL }, src: { x: 0, y: 0, w: bL.width, h: bL.height } },
        { bmp: bR, dstCss: { x: dxR, y: dyR, w: dwR, h: dhR }, src: { x: 0, y: 0, w: bR.width, h: bR.height } },
      ];

      // BUILD 19H_GUTTER_SHADOW (Build 19H)
      const sh = clamp(Number(appState.settings?.twoPageGutterShadow ?? 0), 0, 1);
      if (sh > 0 && gutter > 0) {
        const x0 = Math.round(leftW + shiftX);
        const w = Math.round(gutter);
        const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
        const aMid = 0.28 * sh;
        const aEdge = 0.10 * sh;
        g.addColorStop(0.00, `rgba(0,0,0,${aEdge})`);
        g.addColorStop(0.45, `rgba(0,0,0,${aMid})`);
        g.addColorStop(0.55, `rgba(0,0,0,${aMid})`);
        g.addColorStop(1.00, `rgba(0,0,0,${aEdge})`);
        ctx.save();
        ctx.fillStyle = g;
        ctx.fillRect(x0, 0, w, ch);
        ctx.restore();
      }
    }
  }

  // HUD bits
  el.modeText.textContent = 'portrait';
  el.scrollText.textContent = '0/0';
  syncHudPageCounter();
  updateManualScrollerThumb(bmp, false);
  updateDebugOverlay();
}

let twoPageScrollRowContentHeightDevPx = 0;

// FIND_THIS:TWO_PAGE_SCROLL_FIT_WIDTH_SINGLE (Build 47A6-2)
function drawTwoPageScrollSingleRow(bmp) {
  resizeCanvasToDisplaySize(bmp, false);

  const ctx = el.stage.getContext('2d');
  const cw = el.stage.width, ch = el.stage.height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // BUILD19G_TWOPAGE_SCROLL_DOWNSCALE_QUALITY (Build 19G)
  // INTENT: Two-Page (Scroll) spends a lot of time downscaling large bitmaps.
  // Use the highest-quality downscale filter available to reduce extra softness beyond unavoidable shrink.
  applyScaleQualityToCtx(ctx);

  // Clear to the stage background color (device pixels).
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);

  // Two-Page (Scroll) uses appState.y like Manual mode.
  if (!Number.isFinite(appState.y)) appState.y = 0;

  const gutter = VIEW_CONSTANTS.TWO_PAGE_GUTTER_PX;
  const leftW = Math.floor((cw - gutter) / 2);
  const rightW = cw - gutter - leftW;

  const pair = getTwoPagePair(appState.pageIndex);

  const requestDecode = (idx) => {
    if (!Number.isFinite(idx)) return;
    const e = pageCache.get(idx);
    if (e?.bmp || e?.promise) return;
    getBitmapAtIndex(idx)
      .then(() => {
        if (!document.body.classList.contains('inPlayer')) return;
        if (getControlMode() !== 'twoPageScroll') return;
        if (!cachedBmp) return;
        try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
      })
      .catch(() => {});
  };

  const getBmpSync = (idx) => {
    if (!Number.isFinite(idx)) return null;
    if (idx === appState.pageIndex) return bmp;
    const e = pageCache.get(idx);
    if (e?.bmp) return e.bmp;
    requestDecode(idx);
    return null;
  };

  const drawRowAligned = (items) => {
    const rowH = Math.max(0, ...items.map(it => it.dh || 0));
    twoPageScrollRowContentHeightDevPx = rowH;

    const maxY = Math.max(0, rowH - ch);
    appState.yMax = maxY;
    appState.y = clamp(Math.round(Number(appState.y) || 0), 0, maxY);

    const overflow = (rowH > ch);
    const baseY = overflow
      ? (-appState.y)
      : ((rowH > 0 && rowH < ch) ? Math.round((ch - rowH) / 2) : 0);

    for (const it of items) {
      const dy = baseY + Math.round((rowH - it.dh) / 2);
      drawImageScaled(ctx, it.b, 0, 0, it.b.width, it.b.height, it.dx, dy, it.dw, it.dh);
    }
  };

  if (pair.isSpread) {
    const b = getBmpSync(pair.rightIndex) || bmp;
    const scale = cw / Math.max(1e-6, b.width);
    const dw = cw;
    const dh = Math.round(b.height * scale);
    drawRowAligned([{ b, dx: 0, dw, dh }]);
  } else if (pair.coverAlone) {
    const b = getBmpSync(0) || bmp;
    const scale = leftW / Math.max(1e-6, b.width);
    const dw = leftW;
    const dh = Math.round(b.height * scale);
    drawRowAligned([{ b, dx: 0, dw, dh }]);
  } else if (pair.unpairedSingle || !pair.leftIndexOrNull) {
    const b = getBmpSync(pair.rightIndex) || bmp;
    const scale = rightW / Math.max(1e-6, b.width);
    const dw = rightW;
    const dh = Math.round(b.height * scale);
    drawRowAligned([{ b, dx: leftW + gutter, dw, dh }]);
  } else {
    const bR = getBmpSync(pair.rightIndex) || bmp;
    const bL = getBmpSync(pair.leftIndexOrNull);

    // If the partner isn't decoded yet, draw the right page only (blank left).
    if (!bL) {
      const scale = rightW / Math.max(1e-6, bR.width);
      const dw = rightW;
      const dh = Math.round(bR.height * scale);
      drawRowAligned([{ b: bR, dx: leftW + gutter, dw, dh }]);
    } else {
      const scaleR = rightW / Math.max(1e-6, bR.width);
      const scaleL = leftW / Math.max(1e-6, bL.width);

      const dwR = rightW;
      const dhR = Math.round(bR.height * scaleR);
      const dwL = leftW;
      const dhL = Math.round(bL.height * scaleL);

      const dxR = Math.round(leftW + gutter);
      const dxL = 0;

      drawRowAligned([
        { b: bL, dx: dxL, dw: dwL, dh: dhL },
        { b: bR, dx: dxR, dw: dwR, dh: dhR },
      ]);
    }
  }

  // HUD bits
  el.modeText.textContent = 'portrait';
  el.scrollText.textContent = '0/0';
  syncHudPageCounter();
  updateManualScrollerThumb(bmp, false);
  updateDebugOverlay();
}

// FIND_THIS:TWO_PAGE_SCROLL_STACKED_ROWS (Build 47A6-4)
let twoPageScrollRows = [];
let twoPageScrollTotalHeightDevPx = 0;
let twoPageScrollRowsKey = '';
let twoPageScrollRowsBuildToken = 0;
let twoPageScrollRowsBuilding = false;
let twoPageScrollLastRowIdx = 0;
let twoPageScrollRedrawScheduled = false;

// BUILD19G_TWOPAGE_SCROLL_PREFETCH_STATE (Build 19G)
// INTENT: Prefetch decode work is throttled so fast scroll doesn’t spam decode requests every frame.
// These are in dev-px space because Two-Page (Scroll) uses device-pixel canvas coordinates.
let twoPageScrollLastPrefetchYDevPx = null;
let twoPageScrollLastPrefetchAtMs = 0;
// FIND_THIS:TANKOBAN_TWO_PAGE_SCROLL_STATE (Tankoban Build 4)
// Pending sync helpers for Two-Page (Scroll) entry and scroller interactions.
let twoPageScrollHoldSingleRowUntilSync = false;
let twoPageScrollPendingSyncIndex = null;
let twoPageScrollPendingScrollProgress01 = null;

// (BUILD 19B1 HOTFIX) Duplicate block removed — keep the single copy below.

// BUILD19A_TWOPAGE_SCROLL_VOLUME_TOKEN (Build 19A)
// Used to ignore stale async dims results and force per-volume cache isolation.
let twoPageScrollVolumeToken = 0;

// BUILD19A_TWOPAGE_SCROLL_RESET (Build 19A)
// Clear all per-volume Two-Page (Scroll) caches/state so layouts/dims never leak across books.
function resetTwoPageScrollCaches(reason = '') {
  try { twoPageScrollVolumeToken++; } catch {}

  try { twoPageScrollDimsCache.clear(); } catch {}

  twoPageScrollRowsKey = '';
  twoPageScrollRows = [];
  twoPageScrollTotalHeightDevPx = 0;
  twoPageScrollLastRowIdx = 0;

  // Cancel any in-flight row build steps.
  twoPageScrollRowsBuildToken++;
  twoPageScrollRowsBuilding = false;
  twoPageScrollRedrawScheduled = false;

  // Clear entry-sync state so we never "hold" across volumes.
  twoPageScrollHoldSingleRowUntilSync = false;
  twoPageScrollPendingSyncIndex = null;
  twoPageScrollPendingScrollProgress01 = null;
}


// FIND_THIS:TANKOBAN_TWO_PAGE_SCROLL_ROW_LOOKUP (Tankoban Build 4)
function twoPageScrollYStartForIndex(idx) {
  const rows = twoPageScrollRows || [];
  if (!rows.length || !Number.isFinite(idx)) return null;
  for (const r of rows) {
    if (!r) continue;
    if (r.type === 'pair') {
      if (idx === r.rightIndex || idx === r.leftIndex) return Number(r.yStart) || 0;
    } else if (idx === r.index) {
      return Number(r.yStart) || 0;
    }
  }
  return null;
}

// BUILD19A_TWOPAGE_SCROLL_INDEX_FROM_Y (Build 19A)
// When exiting Two-Page (Scroll), compute a stable pageIndex from the current scroll y.
function twoPageScrollIndexForYDevPx(yDevPx) {
  const rows = twoPageScrollRows || [];
  if (!rows.length || !Number.isFinite(yDevPx)) return null;

  const y = Math.max(0, Number(yDevPx) || 0);
  let prev = null;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;

    const ys = Number(r.yStart) || 0;
    const ye = Number(r.yEnd) || ys;

    // If we're in the gap before this row, prefer the previous row.
    if (y < ys) break;

    if (y >= ys && y < ye) { prev = r; break; }
    prev = r;
  }

  const r = prev || rows[rows.length - 1];
  if (!r) return null;

  if (r.type === 'pair') return Number.isFinite(r.leftIndex) ? r.leftIndex : null;
  if (r.type === 'spread') return Number.isFinite(r.index) ? r.index : null;
  if (r.type === 'cover') return Number.isFinite(r.index) ? r.index : 0;
  return Number.isFinite(r.index) ? r.index : null;
}


const twoPageScrollDimsCache = new Map(); // idx -> { w, h, spread } or { promise }
const twoPageScrollDimsQueue = withLimit(6);

function _parsePngDims(u8) {
  try {
    if (!u8 || u8.length < 24) return null;
    // PNG signature
    if (u8[0] !== 0x89 || u8[1] !== 0x50 || u8[2] !== 0x4E || u8[3] !== 0x47) return null;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const w = dv.getUint32(16, false);
    const h = dv.getUint32(20, false);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return { w, h };
  } catch {
    return null;
  }
}

function _parseJpegDims(u8) {
  try {
    if (!u8 || u8.length < 4) return null;
    if (u8[0] !== 0xFF || u8[1] !== 0xD8) return null; // SOI
    let i = 2;
    while (i + 3 < u8.length) {
      // Find next marker
      if (u8[i] !== 0xFF) { i++; continue; }
      let marker = u8[i + 1];
      i += 2;

      // Standalone markers
      if (marker === 0xD9 || marker === 0xDA) break; // EOI / SOS

      if (i + 1 >= u8.length) break;
      const segLen = (u8[i] << 8) | u8[i + 1];
      if (segLen < 2) break;

      // SOF markers (baseline/progressive/etc)
      const isSOF =
        (marker >= 0xC0 && marker <= 0xC3) ||
        (marker >= 0xC5 && marker <= 0xC7) ||
        (marker >= 0xC9 && marker <= 0xCB) ||
        (marker >= 0xCD && marker <= 0xCF);

      if (isSOF) {
        if (i + 7 >= u8.length) break;
        const h = (u8[i + 3] << 8) | u8[i + 4];
        const w = (u8[i + 5] << 8) | u8[i + 6];
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
        return { w, h };
      }

      i += segLen;
    }
    return null;
  } catch {
    return null;
  }
}

function _parseGifDims(u8) {
  try {
    if (!u8 || u8.length < 10) return null;
    // GIF87a / GIF89a
    if (u8[0] !== 0x47 || u8[1] !== 0x49 || u8[2] !== 0x46) return null;
    const w = u8[6] | (u8[7] << 8);
    const h = u8[8] | (u8[9] << 8);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return { w, h };
  } catch {
    return null;
  }
}

function _parseWebpDims(u8) {
  try {
    if (!u8 || u8.length < 30) return null;
    // RIFF....WEBP
    if (u8[0] !== 0x52 || u8[1] !== 0x49 || u8[2] !== 0x46 || u8[3] !== 0x46) return null;
    if (u8[8] !== 0x57 || u8[9] !== 0x45 || u8[10] !== 0x42 || u8[11] !== 0x50) return null;

    const chunkType = String.fromCharCode(u8[12], u8[13], u8[14], u8[15]);
    // Chunk data starts at offset 20
    const dataOff = 20;

    if (chunkType === 'VP8X') {
      // Width/Height stored as 24-bit little endian, minus 1
      const w = 1 + (u8[24] | (u8[25] << 8) | (u8[26] << 16));
      const h = 1 + (u8[27] | (u8[28] << 8) | (u8[29] << 16));
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
      return { w, h };
    }

    if (chunkType === 'VP8 ') {
      // Start code 0x9d 0x01 0x2a at dataOff+3..+5
      if (u8[dataOff + 3] !== 0x9d || u8[dataOff + 4] !== 0x01 || u8[dataOff + 5] !== 0x2a) return null;
      const w = (u8[dataOff + 6] | (u8[dataOff + 7] << 8)) & 0x3fff;
      const h = (u8[dataOff + 8] | (u8[dataOff + 9] << 8)) & 0x3fff;
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
      return { w, h };
    }

    if (chunkType === 'VP8L') {
      // Signature byte 0x2f then 4 bytes with width/height
      if (u8[dataOff] !== 0x2f) return null;
      const bits = (u8[dataOff + 1]) | (u8[dataOff + 2] << 8) | (u8[dataOff + 3] << 16) | (u8[dataOff + 4] << 24);
      const w = 1 + (bits & 0x3fff);
      const h = 1 + ((bits >> 14) & 0x3fff);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
      return { w, h };
    }

    return null;
  } catch {
    return null;
  }
}


function _parseImageDimsFromBytes(bytesU8, entryName) {
  const u8 = bytesU8;
  // Try signature-based parsing first (more robust than extensions).
  return (
    _parsePngDims(u8) ||
    _parseGifDims(u8) ||
    _parseWebpDims(u8) ||
    _parseJpegDims(u8) ||
    null
  );
}

async function getTwoPageScrollDimsAtIndex(idx) {
  if (!appState.pages.length) return { w: 1, h: 1, spread: false };
  idx = clamp(idx, 0, appState.pages.length - 1);

  const hit = twoPageScrollDimsCache.get(idx);
  if (hit?.w && hit?.h) return hit;
  if (hit?.promise) return hit.promise;

  // BUILD19A_TWOPAGE_SCROLL_DIMS_GUARD (Build 19A)
  // Capture per-volume refs so async dims reads can't "land" into a different book.
  const tok = twoPageScrollVolumeToken;
  const bookId = appState.book?.id || '';
  const zipRef = appState.zip;
  const entryRef = appState.pages[idx];

  const promise = twoPageScrollDimsQueue(async () => {
    // Prefer decoded bitmap dims if available.
    const e = pageCache.get(idx);
    if (e?.bmp) {
      const w = e.bmp.width || 1;
      const h = e.bmp.height || 1;
      let spread = isSpread(w, h);

      // BUILD29: apply overrides to layout.
      try { if (knownNormalIndexSet?.has(idx)) spread = false; } catch {}
      try { if (knownSpreadIndexSet?.has(idx)) spread = true; } catch {}

      return { w, h, spread };
    }

    const entry = entryRef;
    const zip = zipRef;
    if (!zip || !entry) return { w: 1, h: 1, spread: false };

    const bytes = await zip.getFileBytes(entry);
    const u8 = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
    const d = _parseImageDimsFromBytes(u8, entry?.name);
    const w = d?.w || 1;
    const h = d?.h || 1;
    let spread = isSpread(w, h);

    // BUILD29: apply overrides to layout.
    try { if (knownNormalIndexSet?.has(idx)) spread = false; } catch {}
    try { if (knownSpreadIndexSet?.has(idx)) spread = true; } catch {}

    return { w, h, spread };
  });

  twoPageScrollDimsCache.set(idx, { promise });
  promise
    .then((d) => {
      if (tok !== twoPageScrollVolumeToken) return;
      if ((appState.book?.id || '') !== bookId) return;
      if (appState.zip !== zipRef) return;
      twoPageScrollDimsCache.set(idx, d);
    })
    .catch(() => {
      if (tok !== twoPageScrollVolumeToken) return;
      if ((appState.book?.id || '') !== bookId) return;
      if (appState.zip !== zipRef) return;
      twoPageScrollDimsCache.delete(idx);
    });

  return promise;
}

function prewarmTwoPageScrollDimsAll() {
  if (!appState.pages.length) return;

  // BUILD 16: avoid prewarming the entire book (can trigger massive decompression).
  const limit = Math.min(appState.pages.length, 40);
  for (let i = 0; i < limit; i++) {
    // Fire-and-forget; queue limits concurrency.
    getTwoPageScrollDimsAtIndex(i).catch(() => {});
  }
}

function scheduleTwoPageScrollRedraw() {
  if (twoPageScrollRedrawScheduled) return;
  twoPageScrollRedrawScheduled = true;
  requestAnimationFrame(() => {
    twoPageScrollRedrawScheduled = false;
    if (!document.body.classList.contains('inPlayer')) return;
    if (getControlMode() !== 'twoPageScroll') return;
    if (!cachedBmp) return;
    try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
  });
}

function startTwoPageScrollRowsBuildIfNeeded(cw) {
  const rowGapPx = clampTwoPageScrollRowGapPx(appState.settings?.twoPageScrollRowGapPx);
  const nudge = (appState.settings?.twoPageCouplingNudge ? 1 : 0);
  const bookId = appState.book?.id || '';
  const key = `${bookId}:${cw}:${appState.pages.length}:${rowGapPx}:${nudge}`;
  if (twoPageScrollRowsKey === key && (twoPageScrollRowsBuilding || (twoPageScrollRows && twoPageScrollRows.length))) return;

  twoPageScrollRowsKey = key;
  twoPageScrollRows = [];
  twoPageScrollTotalHeightDevPx = 0;
  twoPageScrollLastRowIdx = 0;

  prewarmTwoPageScrollDimsAll();

  const token = ++twoPageScrollRowsBuildToken;
  twoPageScrollRowsBuilding = true;

  (async () => {
    const gutter = VIEW_CONSTANTS.TWO_PAGE_GUTTER_PX;
    const leftW = Math.floor((cw - gutter) / 2);
    const rightW = cw - gutter - leftW;

    let y = 0;
    let rowsAdded = 0;

    // FIND_THIS:BUILD17_TWOPAGE_SCROLL_PHYSICAL_PARITY (Build 17)
    // Track stitched spreads encountered so pairing parity stays “physical” after them.
    // Cover (i===0) is excluded on purpose.
    let extraSlots = 0;

    // BUILD18_COUPLING_NUDGE_SCROLL: same parity flip option for the stacked stream builder.
    const couplingNudge = (appState.settings?.twoPageCouplingNudge ? 1 : 0);

    const pushRow = (row) => {
      row.yStart = y;
      row.yEnd = y + row.rowH;
      // FIND_THIS:TWO_PAGE_SCROLL_ROW_GAP_LAYOUT (Tankoban Build 5)
      y = row.yEnd + rowGapPx;
      twoPageScrollRows.push(row);
      // BUILD19A_TWOPAGE_SCROLL_TOTALH_NO_TRAILING_GAP (Build 19A)
    // Include internal row gaps, but never include a trailing gap after the last built row.
    twoPageScrollTotalHeightDevPx = Math.max(0, y - rowGapPx);
      rowsAdded++;

      // FIND_THIS:TANKOBAN_TWO_PAGE_SCROLL_ENTRY_Y_SYNC (Tankoban Build 4)
      // Preserve position when entering Two-Page (Scroll) from Two-Page (Flip) by syncing appState.y
      // as soon as the layout builder reaches the active pair/spread row.
      if (twoPageScrollHoldSingleRowUntilSync && Number.isFinite(twoPageScrollPendingSyncIndex)) {
        const tIdx = twoPageScrollPendingSyncIndex;
        const hit = (row.type === 'pair')
          ? (tIdx === row.rightIndex || tIdx === row.leftIndex)
          : (tIdx === row.index);
        if (hit) {
          const localY = Number(appState.y) || 0;
          appState.y = (Number(row.yStart) || 0) + localY;
          twoPageScrollHoldSingleRowUntilSync = false;
          twoPageScrollPendingSyncIndex = null;
          scheduleTwoPageScrollRedraw();
        }
      }
    };

    const n = appState.pages.length || 0;
    if (!n) return;

    // Cover row: page 0 alone (cover on left) unless it's a spread.
    const d0 = await getTwoPageScrollDimsAtIndex(0);
    if (token !== twoPageScrollRowsBuildToken) return;

    if (d0.spread) {
      const dh = Math.round((d0.h || 1) * (cw / Math.max(1e-6, d0.w || 1)));
      pushRow({ type: 'spread', index: 0, rowH: dh });
    } else {
      const dh = Math.round((d0.h || 1) * (leftW / Math.max(1e-6, d0.w || 1)));
      pushRow({ type: 'cover', index: 0, rowH: dh });
    }

    // Pair rows: (1,2), (3,4)...; spreads are standalone; unpaired pages show on the right.
    for (let i = 1; i < n; ) {
      if (token !== twoPageScrollRowsBuildToken) return;

      const di = await getTwoPageScrollDimsAtIndex(i);
      if (token !== twoPageScrollRowsBuildToken) return;

      // Spread page => its own full-width row.
      if (di.spread) {
        const dh = Math.round((di.h || 1) * (cw / Math.max(1e-6, di.w || 1)));
        pushRow({ type: 'spread', index: i, rowH: dh });

        // A stitched spread represents 2 physical pages but only 1 index → flip parity after it.
        if (i >= 1) extraSlots += 1;

        i += 1;
      } else if (((i + extraSlots + couplingNudge) % 2) === 1) {
        // Odd index: normal right page; try to pair with next even page.
        const j = i + 1;
        if (j >= n) {
          const dh = Math.round((di.h || 1) * (rightW / Math.max(1e-6, di.w || 1)));
          pushRow({ type: 'unpaired', index: i, rowH: dh });
          i += 1;
        } else {
          const dj = await getTwoPageScrollDimsAtIndex(j);
          if (token !== twoPageScrollRowsBuildToken) return;

          // If partner is a spread, never pair; right page becomes an unpaired row.
          if (dj.spread) {
            const dh = Math.round((di.h || 1) * (rightW / Math.max(1e-6, di.w || 1)));
            pushRow({ type: 'unpaired', index: i, rowH: dh });
            i += 1; // next loop handles the spread page j
          } else {
            const dhR = Math.round((di.h || 1) * (rightW / Math.max(1e-6, di.w || 1)));
            const dhL = Math.round((dj.h || 1) * (leftW / Math.max(1e-6, dj.w || 1)));
            const rowH = Math.max(dhR, dhL);
            pushRow({ type: 'pair', rightIndex: i, leftIndex: j, rowH });
            i += 2;
          }
        }
      } else {
        // Even index (can't be a left partner): show as a single page on the right.
        const dh = Math.round((di.h || 1) * (rightW / Math.max(1e-6, di.w || 1)));
        pushRow({ type: 'unpaired', index: i, rowH: dh });
        i += 1;
      }

      // Yield and redraw in chunks to keep UI responsive.
      if ((rowsAdded % 24) === 0) {
        scheduleTwoPageScrollRedraw();
        await new Promise(r => requestAnimationFrame(r));
      }
    }

    scheduleTwoPageScrollRedraw();
  })()
    .catch(() => {})
    .finally(() => {
      if (token === twoPageScrollRowsBuildToken) twoPageScrollRowsBuilding = false;
    });
}

function drawTwoPageScrollStackedRows(bmp) {
  // Prevent resizeCanvasToDisplaySize from "helpfully" scaling appState.y (it assumes per-page scroll).
  const _yKeep = Number(appState.y) || 0;
  resizeCanvasToDisplaySize(bmp, false);
  appState.y = _yKeep;

  const ctx = el.stage.getContext('2d');
  const cw = el.stage.width, ch = el.stage.height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // BUILD19G_TWOPAGE_SCROLL_DOWNSCALE_QUALITY (Build 19G)
  // INTENT: Same quality rule as single-row path; stacked rows also downscale heavily.
  applyScaleQualityToCtx(ctx);

  // Clear to the stage background color (device pixels).
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);

  if (!Number.isFinite(appState.y)) appState.y = 0;

  startTwoPageScrollRowsBuildIfNeeded(cw);

  const rows = twoPageScrollRows || [];
  if (!rows.length) {
    // Layout is still being built; fall back to the single-row draw for this frame.
    const _yTmp = Number(appState.y) || 0;
    drawTwoPageScrollSingleRow(bmp);
    appState.y = _yTmp;
    return;
  }
  // FIND_THIS:TANKOBAN_TWO_PAGE_SCROLL_ENTRY_PRESERVE_POSITION (Tankoban Build 4)
  // When switching from Two-Page (Flip) to Two-Page (Scroll), keep the reader on the same pair.
  // We temporarily treat appState.y as per-row scroll (single-row draw), then translate it to the stacked-stream y.
  if (twoPageScrollHoldSingleRowUntilSync && Number.isFinite(twoPageScrollPendingSyncIndex)) {
    const yStart = twoPageScrollYStartForIndex(twoPageScrollPendingSyncIndex);
    if (Number.isFinite(yStart)) {
      const localY = Number(appState.y) || 0;
      appState.y = Math.round((Number(yStart) || 0) + localY);
      twoPageScrollHoldSingleRowUntilSync = false;
      twoPageScrollPendingSyncIndex = null;
    } else {
      const _yTmp = Number(appState.y) || 0;
      drawTwoPageScrollSingleRow(bmp);
      appState.y = _yTmp;
      return;
    }
  }


  const totalH = Number(twoPageScrollTotalHeightDevPx) || 0;
  const maxY = Math.max(0, totalH - ch);
  appState.yMax = maxY;

  // FIND_THIS:TANKOBAN_TWO_PAGE_SCROLL_SCROLLER_PENDING_APPLY (Tankoban Build 4)
  // If the right-side scroller was dragged before the stacked layout was fully ready, apply the pending
  // progress fraction now that we know maxY.
  if (Number.isFinite(twoPageScrollPendingScrollProgress01)) {
    const p01 = clamp(Number(twoPageScrollPendingScrollProgress01), 0, 1);
    twoPageScrollPendingScrollProgress01 = null;
    appState.y = Math.round(p01 * maxY);
  }

  appState.y = clamp(Math.round(Number(appState.y) || 0), 0, maxY);

  const v0 = appState.y;
  const v1 = v0 + ch;

  const gutter = VIEW_CONSTANTS.TWO_PAGE_GUTTER_PX;
  const leftW = Math.floor((cw - gutter) / 2);
  const rightW = cw - gutter - leftW;

  const requestDecode = (idx) => {
    if (!Number.isFinite(idx)) return;
    const e = pageCache.get(idx);
    if (e?.bmp || e?.promise) return;
    getBitmapAtIndex(idx)
      .then(() => {
        if (!document.body.classList.contains('inPlayer')) return;
        if (getControlMode() !== 'twoPageScroll') return;
        if (!cachedBmp) return;
        scheduleTwoPageScrollRedraw();
      })
      .catch(() => {});
  };

  const getBmpSync = (idx) => {
    if (!Number.isFinite(idx)) return null;
    if (idx === appState.pageIndex) return bmp;
    const e = pageCache.get(idx);
    if (e?.bmp) return e.bmp;
    requestDecode(idx);
    return null;
  };

  // BUILD19G_TWOPAGE_SCROLL_PREFETCH (Build 19G)
  // INTENT: The current renderer is lazy: rows draw only after their bitmaps are decoded.
  // That causes visible “pop-in” while scrolling (blank row → suddenly appears).
  // Fix: request decode slightly ahead/behind the viewport so images are ready by the time
  // they enter view. This is bounded + throttled to avoid turning into “decode the whole book”.
  const PREFETCH = {
    behindPx: Math.round(ch * 0.60),   // small back-buffer helps when reversing direction
    aheadPx:  Math.round(ch * 1.60),   // primary lookahead to eliminate pop-in on steady scroll
    maxUniquePages: 9,                 // bounded to avoid cache thrash + excess RAM
    minDeltaYPx: Math.round(ch * 0.25),
    minIntervalMs: 90,
  };

  function maybePrefetchRowsFrom(startRowIdx) {
    const now = performance.now();
    const yNow = Number(appState.y) || 0;

    const yLast = Number.isFinite(twoPageScrollLastPrefetchYDevPx) ? twoPageScrollLastPrefetchYDevPx : null;
    const tLast = Number(twoPageScrollLastPrefetchAtMs) || 0;

    // Throttle: if the viewport hasn’t meaningfully moved and we ran recently, don’t spam requests.
    if (yLast !== null) {
      const dy = Math.abs(yNow - yLast);
      if (dy < PREFETCH.minDeltaYPx && (now - tLast) < PREFETCH.minIntervalMs) return;
    }

    twoPageScrollLastPrefetchYDevPx = yNow;
    twoPageScrollLastPrefetchAtMs = now;

    const p0 = Math.max(0, yNow - PREFETCH.behindPx);
    const p1 = Math.min(totalH, yNow + ch + PREFETCH.aheadPx);

    const seen = new Set();

    const pushIdx = (idx) => {
      if (!Number.isFinite(idx)) return;
      if (seen.has(idx)) return;
      if (seen.size >= PREFETCH.maxUniquePages) return;
      seen.add(idx);
      requestDecode(idx);
    };

    const pushRow = (r) => {
      if (!r) return;
      if (r.type === 'pair') {
        pushIdx(r.rightIndex);
        pushIdx(r.leftIndex);
        return;
      }
      pushIdx(r.index);
    };

    // Forward scan: preload what’s about to enter view.
    for (let j = startRowIdx; j < rows.length && seen.size < PREFETCH.maxUniquePages; j++) {
      const r = rows[j];
      if (!r) continue;
      if ((r.yStart || 0) > p1) break;
      if ((r.yEnd || 0) < p0) continue;
      pushRow(r);
    }

    // Backward scan: small buffer for upward scroll.
    for (let j = startRowIdx - 1; j >= 0 && seen.size < PREFETCH.maxUniquePages; j--) {
      const r = rows[j];
      if (!r) continue;
      if ((r.yEnd || 0) < p0) break;
      if ((r.yStart || 0) > p1) continue;
      pushRow(r);
    }
  }

  let i = twoPageScrollLastRowIdx;
  if (i >= rows.length) i = 0;

  while (i > 0 && (rows[i]?.yStart || 0) > v0) i--;
  while (i < rows.length && (rows[i]?.yEnd || 0) <= v0) i++;
  twoPageScrollLastRowIdx = i;

  // BUILD19G_TWOPAGE_SCROLL_PREFETCH (Build 19G)
  // INTENT: Prefetch around the *current* viewport anchor row so decode completes before the row is drawn.
  maybePrefetchRowsFrom(i);

  for (; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    if (r.yStart >= v1) break;
    if (r.yEnd <= v0) continue;

    const rowTop = Math.round(r.yStart - v0);
    const rowH = Math.round(r.rowH || 0);

    if (r.type === 'spread') {
      const b = getBmpSync(r.index);
      if (!b) continue;
      const scale = cw / Math.max(1e-6, b.width);
      const dw = cw;
      const dh = Math.round(b.height * scale);
      drawImageScaled(ctx, b, 0, 0, b.width, b.height, 0, rowTop, dw, dh);
      continue;
    }

    if (r.type === 'cover') {
      const b = getBmpSync(r.index);
      if (!b) continue;
      const scale = leftW / Math.max(1e-6, b.width);
      const dw = leftW;
      const dh = Math.round(b.height * scale);
      const dy = rowTop + Math.round((rowH - dh) / 2);
      drawImageScaled(ctx, b, 0, 0, b.width, b.height, 0, dy, dw, dh);
      continue;
    }

    if (r.type === 'unpaired') {
      const b = getBmpSync(r.index);
      if (!b) continue;
      const scale = rightW / Math.max(1e-6, b.width);
      const dw = rightW;
      const dh = Math.round(b.height * scale);
      const dy = rowTop + Math.round((rowH - dh) / 2);
      drawImageScaled(ctx, b, 0, 0, b.width, b.height, leftW + gutter, dy, dw, dh);
      continue;
    }

    if (r.type === 'pair') {
      const bR = getBmpSync(r.rightIndex);
      const bL = getBmpSync(r.leftIndex);

      if (bL) {
        const scaleL = leftW / Math.max(1e-6, bL.width);
        const dwL = leftW;
        const dhL = Math.round(bL.height * scaleL);
        const dyL = rowTop + Math.round((rowH - dhL) / 2);
        drawImageScaled(ctx, bL, 0, 0, bL.width, bL.height, 0, dyL, dwL, dhL);
      }

      if (bR) {
        const scaleR = rightW / Math.max(1e-6, bR.width);
        const dwR = rightW;
        const dhR = Math.round(bR.height * scaleR);
        const dyR = rowTop + Math.round((rowH - dhR) / 2);
        drawImageScaled(ctx, bR, 0, 0, bR.width, bR.height, leftW + gutter, dyR, dwR, dhR);
      }
      continue;
    }
  }

  // HUD bits
  el.modeText.textContent = 'portrait';
  el.scrollText.textContent = `${Math.round(appState.y)}/${Math.round(appState.yMax)}`;
  syncHudPageCounter();
  updateManualScrollerThumb(bmp, false);
  updateDebugOverlay();
}


// Draw helper that respects the current scroll mode.
