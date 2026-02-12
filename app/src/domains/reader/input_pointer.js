// Build 9: moved from src/modules/reader_50_input_and_boot.js into src/modules/reader/*
// NOTE: Mechanical split. Logic is unchanged.
// Split from the original src/modules/reader.js — INPUT + BOOT section (Build 6, Phase 1)
  // EDIT_ZONE:INPUT
  // Click zones
  const leftZone = el.clickZones.querySelector('.left');
  const midZone = el.clickZones.querySelector('.mid');
  const rightZone = el.clickZones.querySelector('.right');

  function isNavBusy() {
    // Build 25: prefer the explicit flag (set inside goToPage), but keep loading overlay as a backup signal.
    if (appState.navBusy) return true;
    if (typeof loadingCount === 'number' && loadingCount > 0) return true;
    if (el.loadingOverlay && !el.loadingOverlay.classList.contains('hidden')) return true;
    return false;
  }

  function flashClickZone(zoneEl, blocked = false) {
    if (!zoneEl) return;
    const okCls = 'zoneFlash';
    const blockedCls = 'zoneFlashBlocked';
    zoneEl.classList.remove(okCls, blockedCls);
    // Re-trigger reliably on rapid clicks.
    void zoneEl.offsetWidth;
    zoneEl.classList.add(blocked ? blockedCls : okCls);
    clearTimeout(zoneEl._flashT);
    zoneEl._flashT = setTimeout(() => {
      zoneEl.classList.remove(okCls, blockedCls);
    }, 90);
  }

  // FIND_THIS:TWO_PAGE_NAV_CLICK_ZONES (Build 47A4)
  // BUILD10_DBLPAGE_NAV_ENFORCE: In both Double Page flick modes, navigation is always:
  // - Right half click = NEXT
  // - Left half click  = PREVIOUS
  // BUILD16A_MANGAPLUS_NAV_FLIP: In two-page flick modes, KeyI can invert these sides; default remains Right=NEXT.
  // regardless of any reading direction setting (reading direction is layout-only).
  //
  // Why we compute zones dynamically:
  // Using clientX relative to the shared container's getBoundingClientRect() keeps behavior stable even if
  // CSS changes the visual size/position of the click overlays.
  async function handleTwoPageFlickNavClick(e) {
    if (!appState.pages.length) return;
    if (appState.navBusy) {
      // BUILD13_STABILIZATION_FIX: Keep busy-click feedback safe (avoid throwing if the DOM is in transition).
      // Still flash the intended side so the user gets feedback even while we are busy.
      try {
        const r = el.clickZones.getBoundingClientRect();
        const x = e.clientX - r.left;
        const cm = getControlMode();
        let goNext = x >= (r.width / 2);
        if (isTwoPageFlipMode(cm) && twoPageMangaPlusNextOnLeft) goNext = !goNext;
        flashClickZone(goNext ? rightZone : leftZone, true);
      } catch {}
      return;
    }

    const r = el.clickZones.getBoundingClientRect();
    const x = e.clientX - r.left;
    const cm = getControlMode();
    let goNext = x >= (r.width / 2);
    if (isTwoPageFlipMode(cm) && twoPageMangaPlusNextOnLeft) goNext = !goNext;

    flashClickZone(goNext ? rightZone : leftZone, false);

    if (goNext) await nextTwoPage();
    else await prevTwoPage();
  }
  // BUILD42_CLICKZONES_MIDDLE_ONLY (Build 42)
  // Single-click (HUD toggle / play-pause) + double-click fullscreen are handled by the middle zone only.
  // Left/right zones are reserved for page turning across all modes.
  leftZone.addEventListener('click', async (e) => {
    if (!document.body.classList.contains('inPlayer')) return;
    if (hudFreezeActive()) return;

    const cm = getControlMode();

    // BUILD44_DISABLE_SIDE_CLICKS_IN_SCROLL: side zones should do nothing in scroll modes.
    if (cm === 'manual' || cm === 'auto' || cm === 'twoPageScroll') {
      const busy = true;
      flashClickZone(leftZone, busy);
      return;
    }

    // Two-Page (Flip): use the existing flick-nav logic.
    if (isTwoPageFlipMode(cm)) { try { await handleTwoPageFlickNavClick(e); } catch {} return; }

    const busy = isNavBusy() || !appState.pages.length;
    flashClickZone(leftZone, busy);
    if (busy || !appState.pages.length) return;

    if (cm === 'autoFlip') {
      if (appState.pageIndex <= 0) {
        playerToast('Start');
        await prevPage();
        syncHudPageCounter(true);
        return;
      }
      await prevPage();
      syncHudPageCounter(true);
      playerToast(`Prev • ${pageLabel()}`);
      return;
    }

    if (appState.pageIndex <= 0) {
      playerToast('Start');
      await prevPage();
      syncHudPageCounter(true);
      return;
    }
    await prevPage();
    syncHudPageCounter(true);
    playerToast(`Prev • ${pageLabel()}`);
  });

  rightZone.addEventListener('click', async (e) => {
    if (!document.body.classList.contains('inPlayer')) return;
    if (hudFreezeActive()) return;

    const cm = getControlMode();

    // BUILD44_DISABLE_SIDE_CLICKS_IN_SCROLL: side zones should do nothing in scroll modes.
    if (cm === 'manual' || cm === 'auto' || cm === 'twoPageScroll') {
      const busy = true;
      flashClickZone(rightZone, busy);
      return;
    }

    // Two-Page (Flip): use the existing flick-nav logic.
    if (isTwoPageFlipMode(cm)) { try { await handleTwoPageFlickNavClick(e); } catch {} return; }

    const busy = isNavBusy() || !appState.pages.length;
    flashClickZone(rightZone, busy);
    if (busy || !appState.pages.length) return;

    const n = appState.pages.length;

    if (cm === 'autoFlip') {
      if (appState.pageIndex >= n - 1) {
        playerToast('End');
        await nextPage(appState.playing);
        syncHudPageCounter(true);
        return;
      }
      await nextPage(appState.playing);
      syncHudPageCounter(true);
      playerToast(`Next • ${pageLabel()}`);
      return;
    }

    if (appState.pageIndex >= n - 1) {
      playerToast('End');
      await nextPage(appState.playing);
      syncHudPageCounter(true);
      return;
    }
    await nextPage(appState.playing);
    syncHudPageCounter(true);
    playerToast(`Next • ${pageLabel()}`);
  });

  // BUILD40_SINGLE_VS_DBLCLICK (Build 40)
  // Prevent a double click (fullscreen toggle) from also triggering the mid-zone single-click action.
  let _midClickTimer = null;

  async function _handleMidClick(e) {
    const cm = getControlMode();

    // BUILD21_CLICKZONES (Build 21): In non-scroll modes, the middle zone is always HUD toggle.
    if (isTwoPageFlipMode(cm) || cm === 'autoFlip') {
      if (hudFreezeActive()) return;
      if (appState.hudHidden) { toggleHud(false); return; }
      toggleHud(true);
      return;
    }


    // Build 42: Manual Scroll — middle-click toggles HUD show/hide and always swallows clicks.
    // Do not toggle while overlays/dragging/hover-interactions are active (prevents flicker).
    if (getControlMode() === 'manual') {
      if (hudFreezeActive()) return;
      if (appState.hudHidden) { toggleHud(false); return; }
      toggleHud(true);
      return;
    }

    // Build 42: Auto Scroll — first click pauses + wakes/shows HUD (no play/pause).
    if (appState.hudHidden) { if (appState.playing) pauseLoop(); toggleHud(false); return; }
    await userTogglePlayPause();
  }



  // BUILD44_MANGAPLUS_DRAG_PAN: drag on the middle zone pans when MangaPlus zoom is active.
  // This must not trigger HUD toggle or fullscreen.
  let _mpPanDragging = false;
  let _mpPanMoved = false;
  let _mpPanLastX = 0;
  let _mpPanLastY = 0;

  function isMangaPlusZoomActive() {
    try {
      const cm = getControlMode();
      if (cm !== 'twoPageMangaPlus') return false;
      const z = Number(appState.settings?.twoPageMangaPlusZoomPct ?? 100);
      return Number.isFinite(z) && z > 100;
    } catch { return false; }
  }

  function mpPanApplyDelta(dxCss, dyCss) {
    const dpr = window.devicePixelRatio || 1;
    const devDx = Math.round(dxCss * dpr);
    const devDy = Math.round(dyCss * dpr);

    let changed = false;

    if (Number.isFinite(twoPageFlickPanMaxX) && twoPageFlickPanMaxX > 0) {
      const prev = twoPageFlickPanX;
      twoPageFlickPanX = clamp(twoPageFlickPanX - devDx, 0, twoPageFlickPanMaxX);
      if (twoPageFlickPanX !== prev) changed = true;
    }

    if (Number.isFinite(twoPageFlickPanMax) && twoPageFlickPanMax > 0) {
      const prev = twoPageFlickPanY;
      twoPageFlickPanY = clamp(twoPageFlickPanY - devDy, 0, twoPageFlickPanMax);
      if (twoPageFlickPanY !== prev) changed = true;
    }

    if (changed && cachedBmp) {
      try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
    }
  }

  midZone?.addEventListener('pointerdown', (e) => {
    if (!document.body.classList.contains('inPlayer')) return;
    if (typeof e?.button === 'number' && e.button !== 0) return;
    if (!isMangaPlusZoomActive()) return;

    try { if (_midClickTimer) { clearTimeout(_midClickTimer); _midClickTimer = null; } } catch {}

    _mpPanDragging = true;
    _mpPanMoved = false;
    _mpPanLastX = e.clientX;
    _mpPanLastY = e.clientY;

    try { midZone.setPointerCapture(e.pointerId); } catch {}
    try { e.preventDefault(); e.stopPropagation(); } catch {}
  }, { passive: false });

  midZone?.addEventListener('pointermove', (e) => {
    if (!_mpPanDragging) return;
    if (!isMangaPlusZoomActive()) return;

    const dx = (e.clientX - _mpPanLastX);
    const dy = (e.clientY - _mpPanLastY);
    _mpPanLastX = e.clientX;
    _mpPanLastY = e.clientY;

    if (!_mpPanMoved) {
      if (Math.abs(dx) + Math.abs(dy) < 4) return;
      _mpPanMoved = true;
    }

    mpPanApplyDelta(dx, dy);

    try { e.preventDefault(); e.stopPropagation(); } catch {}
  }, { passive: false });

  midZone?.addEventListener('pointerup', (e) => {
    if (!_mpPanDragging) return;
    _mpPanDragging = false;
    if (_mpPanMoved) {
      midZone._swallowNextClick = true;
    }
    try { e.preventDefault(); e.stopPropagation(); } catch {}
  }, { passive: false });

  midZone?.addEventListener('pointercancel', () => {
    _mpPanDragging = false;
  });
  midZone?.addEventListener('click', (e) => {
    if (!document.body.classList.contains('inPlayer')) return;

    if (midZone?._swallowNextClick) { midZone._swallowNextClick = false; return; }

    // If this is the 2nd click of a double-click, ignore it and let the dblclick handler run.
    if ((Number(e?.detail) || 0) > 1) return;

    try { if (_midClickTimer) clearTimeout(_midClickTimer); } catch {}
    _midClickTimer = setTimeout(() => {
      _midClickTimer = null;
      _handleMidClick(e).catch(() => {});
    }, 220);
  });


  // Mouse quality-of-life
  // BUILD37_DBLCLICK_FULLSCREEN (Build 37)
  // Double left click in the reader toggles fullscreen.
  // Note: `#clickZones` overlays the canvas, so listen on it (and keep a canvas listener as fallback).
  const _dblFsHandler = async (e) => {
    if (!document.body.classList.contains('inPlayer')) return;
    if (midZone?._swallowNextClick) return;
    // Primary button only
    if (typeof e?.button === 'number' && e.button !== 0) return;
    // BUILD40_CANCEL_PENDING_SINGLE_CLICK (Build 40)
    try { if (_midClickTimer) { clearTimeout(_midClickTimer); _midClickTimer = null; } } catch {}
    try { e.preventDefault(); } catch {}
    try { e.stopPropagation(); } catch {}
    try { await Tanko.api.window.toggleFullscreen(); } catch {}
  };
  try { midZone?.addEventListener('dblclick', _dblFsHandler); } catch {}
  // BUILD42_DBLCLICK_MIDDLE_ONLY (Build 42)
  // Double-click fullscreen is intentionally restricted to the middle click-zone.
  // BUILD 20_READER_CONTEXT_MENU (Build 20)
  // INTENT: Surface reader QoL actions via right-click without redesigning the HUD.
  // Reuses the existing global context menu (used in Library) so we don't invent a new menu system.
  function showReaderContextMenuFromEvent(e) {
    if (!document.body.classList.contains('inPlayer')) return;
    e.preventDefault();

    const hasPages = !!appState.pages?.length;
    const idx = (appState.pageIndex|0);
    const starred = hasPages && isBookmarked(idx);

    const items = [];

    items.push({
      label: 'Go to page…',
      disabled: !hasPages,
      onClick: () => openGotoOverlay(),
    });

    // BUILD21_MULTIWINDOW (Build 21)
    items.push({
      label: 'Open in new window',
      disabled: !appState.book?.id,
      onClick: () => { if (appState.book?.id) Tanko.api.window.openBookInNewWindow(appState.book.id); },
    });

    items.push({ separator: true });

    // BUILD21_EXPORT (Build 21) — uses existing session readers in main. No re-encode, no rescans.
    items.push({
      label: 'Export: Save current page…',
      disabled: !hasPages,
      onClick: async () => {
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
      },
    });

    items.push({
      label: 'Export: Copy current page to clipboard',
      disabled: !hasPages,
      onClick: async () => {
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
      },
    });

    items.push({
      label: 'Copy volume path',
      disabled: !appState.book?.path,
      onClick: () => { if (appState.book?.path) Tanko.api.clipboard.copyText(appState.book.path); },
    });

    items.push({
      label: 'Reveal volume in Explorer',
      disabled: !appState.book?.path,
      onClick: () => { if (appState.book?.path) Tanko.api.shell.revealPath(appState.book.path); },
    });

    items.push({ separator: true });

    // BUILD21_SCALE_QUALITY (Build 21)
    const scaleGlyph = (on) => (on ? '[  .]' : '[.  ]');
    // INTENT: Context menu is label-only; glyph makes state visible without adding UI components.

  const qScale = getImageScaleQuality();

    items.push({ label: 'Scaling', disabled: true });

    const scaleRowLabel = (name, on) => {
      // Keep the glyph column aligned so this reads like a tiny sub-settings group.
      return `${`  ${name}`.padEnd(12, ' ')}${scaleGlyph(on)}`;
    };

    items.push({
      label: scaleRowLabel('Off', qScale === 'off'),
      onClick: () => {
        if (!appState.settings) return;
        appState.settings.imageScaleQuality = 'off'; // appState.settings.imageScaleQuality: 'off'|'smooth'|'sharp'|'pixel'
        syncImgFxOverlayUiFromSettings();
        try { if (cachedBmp) drawActiveFrame(cachedBmp, cachedSpread); } catch {}
        scheduleProgressSave();
      },
    });

    items.push({
      label: scaleRowLabel('Smoother', qScale === 'smooth'),
      onClick: () => {
        if (!appState.settings) return;
        appState.settings.imageScaleQuality = 'smooth';
        syncImgFxOverlayUiFromSettings();
        try { if (cachedBmp) drawActiveFrame(cachedBmp, cachedSpread); } catch {}
        scheduleProgressSave();
      },
    });

    items.push({
      label: scaleRowLabel('Sharper', qScale === 'sharp'),
      onClick: () => {
        if (!appState.settings) return;
        appState.settings.imageScaleQuality = 'sharp';
        syncImgFxOverlayUiFromSettings();
        try { if (cachedBmp) drawActiveFrame(cachedBmp, cachedSpread); } catch {}
        scheduleProgressSave();
      },
    });

    items.push({
      label: scaleRowLabel('Pixel', qScale === 'pixel'),
      onClick: () => {
        if (!appState.settings) return;
        appState.settings.imageScaleQuality = 'pixel';
        syncImgFxOverlayUiFromSettings();
        try { if (cachedBmp) drawActiveFrame(cachedBmp, cachedSpread); } catch {}
        scheduleProgressSave();
      },
    });

    items.push({ separator: true });

    items.push({
      label: starred ? '✓ Remove bookmark' : 'Bookmark this page',
      disabled: !hasPages,
      onClick: () => toggleBookmarkOnCurrentPage(),
    });

    items.push({
      label: 'Bookmarks…',
      disabled: !hasPages,
      onClick: () => { openMegaSettings(true); openMegaSub('bookmarks'); },
    });

    // Keep bookmark jump list short so the menu stays usable.
    const bms = hasPages ? getBookmarksForActiveBook().slice(0, 6) : [];
    if (bms.length) {
      items.push({ separator: true });
      for (const bi of bms) {
        items.push({
          label: `Go to bookmark: Page ${bi + 1}`,
          onClick: () => goToPage(bi, appState.playing),
        });
      }
    }

    items.push({ separator: true });

    const lOn = !!appState.settings?.loupeEnabled;
    items.push({
      label: lOn ? '✓ Loupe' : 'Loupe',
      disabled: !hasPages,
      onClick: () => {
        appState.settings.loupeEnabled = !appState.settings.loupeEnabled;
        syncLoupeEnabled();
        scheduleProgressSave();
        playerToast(appState.settings.loupeEnabled ? 'Loupe on' : 'Loupe off');
      },
    });

    const z = clamp(Number(appState.settings?.loupeZoom ?? 2.0), 0.5, 3.5);
    items.push({
      label: `Loupe zoom… (${z.toFixed(2)}×)`,
      disabled: !hasPages,
      onClick: () => openLoupeZoomOverlay(),
    });

    items.push({ separator: true });

    items.push({
      label: 'Image filters…',
      disabled: !hasPages,
      onClick: () => openImgFxOverlay(),
    });

    items.push({ separator: true });

    const curSh = clamp(Number(appState.settings?.twoPageGutterShadow ?? 0.35), 0, 1);
    const presets = [
      { label: 'Shadow: Off', v: 0.0 },
      { label: 'Shadow: Subtle', v: 0.22 },
      { label: 'Shadow: Medium', v: 0.35 },
      { label: 'Shadow: Strong', v: 0.55 },
    ];
    for (const p of presets) {
      const on = Math.abs(curSh - p.v) < 0.02;
      items.push({
        label: on ? `✓ ${p.label}` : p.label,
        onClick: () => {
          appState.settings.twoPageGutterShadow = p.v;
          scheduleProgressSave();
          if (cachedBmp) drawActiveFrame(cachedBmp, cachedSpread);
        },
      });
    }

    hideContextMenu();
    showContextMenu({ x: e.clientX, y: e.clientY, items });
  }

  // Right-click should work even if clickZones sits above the canvas.
  el.stage.addEventListener('contextmenu', openMegaSettingsFloaterFromEvent);
  el.clickZones?.addEventListener('contextmenu', openMegaSettingsFloaterFromEvent);


  // Build 34: Manual Scroll mode (mouse wheel + Up/Down keys) updates strip y directly.
  // This keeps scrolling smooth and allows seamless page boundary transitions when neighbors are cached.
  let manualScrollChain = Promise.resolve();

  // BUILD18A_TWOPAGE_SCROLL_HOLD_STEP (Build 18A)
  // When entering Two-Page (Scroll) mid-volume, the stacked layout may still be building from the start.
  // While that "entry-sync hold" is active, scrolling can feel dead if the current row fits in the viewport.
  // In that case, treat scroll input as a row-step so the user can keep reading immediately.
  let twoPageScrollHoldNavInFlight = false;

  function queueTwoPageScrollHoldStep(dir) {
    if (!dir) return;
    if (twoPageScrollHoldNavInFlight) return;
    if (!document.body.classList.contains('inPlayer')) return;
    if (getControlMode() !== 'twoPageScroll') return;
    if (!appState.pages.length) return;
    if (appState.navBusy) return;

    const n = appState.pages.length || 0;
    const cur = clamp(appState.pageIndex, 0, n - 1);

    let target = cur;
    if (dir > 0) {
      if (cur >= n - 1) return;
      target = (cur <= 0) ? 1 : (isStitchedSpread(cur) ? (cur + 1) : (cur + 2));
      target = clamp(target, 1, n - 1);
    } else {
      if (cur <= 0) return;
      if (cur === 1) target = 0;
      else target = isStitchedSpread(cur) ? (cur - 1) : (cur - 2);
      target = clamp(target, 0, n - 1);
    }

    if (target === cur) return;
    target = snapTwoPageIndex(target);

    // Keep entry-sync hold behavior, but move the held row target.
    twoPageScrollHoldNavInFlight = true;
    twoPageScrollHoldSingleRowUntilSync = true;
    twoPageScrollPendingSyncIndex = target;
    appState.y = 0;
    appState.yMax = 0;

    Promise.resolve()
      .then(() => goToPage(target, false, false))
      .catch(() => {})
      .finally(() => { twoPageScrollHoldNavInFlight = false; });
  }

  // FIND_THIS:TWO_PAGE_SCROLL_SINGLE_SCROLL (Build 47A6-3)
  function twoPageScrollBy(dyDevPx) {
    if (!document.body.classList.contains('inPlayer')) return;
    if (!appState.pages.length) return;
    if (!cachedBmp) return;
    if (getControlMode() !== 'twoPageScroll') return;
    if (!Number.isFinite(dyDevPx) || dyDevPx === 0) return;

    // Keep canvas backing size synced before any clamp math.
    const _yKeep = Number(appState.y) || 0;
    try { resizeCanvasToDisplaySize(cachedBmp, false); } catch {}
    appState.y = _yKeep;

    const ch = Number(el.stage?.height) || 0;

    // FIND_THIS:BUILD18_TWOPAGE_SCROLL_HOLD_LOCAL_CLAMP (Build 18)
    // During entry-sync hold, appState.y is local-to-row. Clamping against the stacked total height
    // (which may not include the target row yet) can freeze scrolling.
    let maxY = 0;
    if (twoPageScrollHoldSingleRowUntilSync) {
      const rowH = Number(twoPageScrollRowContentHeightDevPx) || 0;
      maxY = Math.max(0, rowH - ch);
    } else {
      const contentH = Number(twoPageScrollTotalHeightDevPx) || 0;
      maxY = Math.max(0, contentH - ch);
    }

    // BUILD18A_TWOPAGE_SCROLL_HOLD_STEP
    // If the held row fits (maxY==0), there's nothing to scroll locally yet.
    // Treat wheel/ArrowUp/Down as a row-step so navigation works immediately.
    if (twoPageScrollHoldSingleRowUntilSync && maxY <= 0) {
      if (dyDevPx > 0) queueTwoPageScrollHoldStep(+1);
      else if (dyDevPx < 0) queueTwoPageScrollHoldStep(-1);
      appState.yMax = maxY;
      return;
    }

    appState.y = clamp(Math.round((Number(appState.y) || 0) + dyDevPx), 0, maxY);
    appState.yMax = maxY;

    drawActiveFrame(cachedBmp, cachedSpread);
    scheduleProgressSave();
  }
  // BUILD16C_TWOPAGE_SCROLL_SMOOTH: consume scroll deltas over a few frames
  // to reduce chunkiness (keyboard + trackpad sideways wheel).
  let twoPageScrollPendingDevPx = 0;
  let twoPageScrollPumpActive = false;

  function stopTwoPageScrollSmooth() {
    twoPageScrollPendingDevPx = 0;
    twoPageScrollPumpActive = false;
  }

  function queueTwoPageScrollSmooth(dyDevPx) {
    if (!Number.isFinite(dyDevPx) || dyDevPx === 0) return;
    if (getControlMode() !== 'twoPageScroll') return;

    twoPageScrollPendingDevPx += dyDevPx;

    // prevent huge backlog from spikes
    const ch = Number(el.stage?.height) || 0;
    const cap = Math.max(2400, Math.round(ch * 8));
    twoPageScrollPendingDevPx = clamp(twoPageScrollPendingDevPx, -cap, cap);

    if (twoPageScrollPumpActive) return;
    twoPageScrollPumpActive = true;

    const pump = () => {
      if (getControlMode() !== 'twoPageScroll') { stopTwoPageScrollSmooth(); return; }
      if (!twoPageScrollPendingDevPx) { twoPageScrollPumpActive = false; return; }

      const ch2 = Number(el.stage?.height) || 0;
      const maxStep = Math.max(70, Math.round(ch2 * 0.22));
      const take = clamp(twoPageScrollPendingDevPx * 0.38, -maxStep, maxStep);

      twoPageScrollPendingDevPx -= take;
      twoPageScrollBy(take);

      requestAnimationFrame(pump);
    };

    requestAnimationFrame(pump);
  }

  // Build 39: Manual Scroll wheel smoothing (Auto Scroll wheel behavior is unchanged).
  // We accumulate wheel deltas and consume them over a few animation frames.
  let manualWheelPendingDevPx = 0;
  let manualWheelPumpActive = false;

  function stopManualWheelSmooth() {
    manualWheelPendingDevPx = 0;
    manualWheelPumpActive = false;
  }

  function queueManualWheelSmooth(dyDevPx) {
    if (!Number.isFinite(dyDevPx) || dyDevPx === 0) return;
    // Only applies in Manual Scroll mode.
    if (getControlMode() !== 'manual') return;

    manualWheelPendingDevPx += dyDevPx;

    // Prevent extreme backlog from trackpad spikes.
    const ch = Number(el.stage?.height) || 0;
    const cap = Math.max(VIEW_CONSTANTS.MANUAL_WHEEL_BACKLOG_MIN, Math.round(ch * VIEW_CONSTANTS.MANUAL_WHEEL_BACKLOG_MULT));
    manualWheelPendingDevPx = clamp(manualWheelPendingDevPx, -cap, cap);

    if (!manualWheelPumpActive) {
      manualWheelPumpActive = true;
      requestAnimationFrame(pumpManualWheelSmooth);
    }
  }

  function pumpManualWheelSmooth() {
    if (!manualWheelPumpActive) return;

    // Stop conditions
    if (!document.body.classList.contains('inPlayer')) { stopManualWheelSmooth(); return; }
    if (getControlMode() !== 'manual') { stopManualWheelSmooth(); return; }

    if (!Number.isFinite(manualWheelPendingDevPx) || Math.abs(manualWheelPendingDevPx) < 0.75) {
      stopManualWheelSmooth();
      return;
    }

    // Consume a fraction of the pending delta each frame for a smoother feel.
    const ch = Number(el.stage?.height) || 0;
    const MAX_STEP = Math.max(VIEW_CONSTANTS.MANUAL_WHEEL_MAX_STEP_MIN, Math.round(ch * VIEW_CONSTANTS.MANUAL_WHEEL_MAX_STEP_MULT));
    let step = manualWheelPendingDevPx * VIEW_CONSTANTS.MANUAL_WHEEL_CONSUME_FRACTION;
    step = clamp(step, -MAX_STEP, MAX_STEP);
    if (Math.abs(step) < 2) step = manualWheelPendingDevPx;

    manualWheelPendingDevPx -= step;

    // Chain into the existing manual scroll pipeline so we preserve all safety rules.
    manualScrollChain = manualScrollChain
      .then(() => manualScrollBy(step))
      .catch(() => {})
      .finally(() => {
        if (!manualWheelPumpActive) return;
        if (!document.body.classList.contains('inPlayer')) { stopManualWheelSmooth(); return; }
        if (getControlMode() !== 'manual') { stopManualWheelSmooth(); return; }

        if (Number.isFinite(manualWheelPendingDevPx) && Math.abs(manualWheelPendingDevPx) >= 0.75) {
          requestAnimationFrame(pumpManualWheelSmooth);
        } else {
          stopManualWheelSmooth();
        }
      });
  }

  function queueManualScroll(dyDevPx) {
    manualScrollChain = manualScrollChain
      .then(() => manualScrollBy(dyDevPx))
      .catch(() => {});
  }

  async function manualScrollBy(dyDevPx) {
    if (!document.body.classList.contains('inPlayer')) return;
    if (!appState.pages.length) return;
    if (!cachedBmp) return;
    if (!Number.isFinite(dyDevPx) || dyDevPx === 0) return;
    if (isTwoPageFlipMode(getControlMode()) || getControlMode() === 'autoFlip') return;

    // Keep canvas backing size synced before any scroll math.
    try { resizeCanvasToDisplaySize(cachedBmp, cachedSpread); } catch {}

    const cw = el.stage.width;
    const ch = el.stage.height;
    if (!cw || !ch) return;

    const pwFrac = getPortraitWidthFrac();
    const n = appState.pages.length;

    // Work in device pixels (same units as appState.y).
    let idx = appState.pageIndex;
    let y = (Number(appState.y) || 0) + dyDevPx;

    const NEAR_PX = Math.round(ch * 0.35);
    const MAX_JUMPS = 3;
    let jumps = 0;

    while (jumps <= MAX_JUMPS) {
      const curEntry = (idx === appState.pageIndex) ? null : pageCache.get(idx);
      const bmp = (idx === appState.pageIndex) ? cachedBmp : (curEntry?.bmp || null);
      const spread = (idx === appState.pageIndex) ? cachedSpread : !!curEntry?.spread;
      if (!bmp) break;

      const m = getNoUpscaleMetrics(bmp, spread, cw, pwFrac);
      const scaledH = m.scaledH;
      const yMax = Math.max(0, scaledH - ch);

      const nextIdx = idx + 1;
      const prevIdx = idx - 1;
      const nextReady = (nextIdx < n) ? !!pageCache.get(nextIdx)?.bmp : false;
      const prevReady = (prevIdx >= 0) ? !!pageCache.get(prevIdx)?.bmp : false;

      // Prefetch neighbors when approaching boundaries (best-effort, non-blocking).
      if (y >= (yMax - NEAR_PX) && nextIdx < n) {
        const e = pageCache.get(nextIdx);
        if (!e?.bmp && !e?.promise) getBitmapAtIndex(nextIdx).catch(() => {});
      }
      if (y <= NEAR_PX && prevIdx >= 0) {
        const e = pageCache.get(prevIdx);
        if (!e?.bmp && !e?.promise) getBitmapAtIndex(prevIdx).catch(() => {});
      }

      // Downward boundary crossing: only if the next page is already decoded.
      if (y >= scaledH) {
        if (nextIdx >= n) {
          y = clamp(y, 0, nextReady ? scaledH : yMax);
          appState.yMax = yMax;
          break;
        }
        if (!nextReady) {
          // Do not allow blank scroll into unloaded space.
          y = clamp(y, 0, yMax);
          appState.yMax = yMax;
          break;
        }
        y = y - scaledH;
        idx = nextIdx;
        jumps += 1;
        continue;
      }

      // Upward boundary crossing: only if the previous page is already decoded.
      if (y < 0) {
        if (prevIdx < 0) {
          y = 0;
          appState.yMax = yMax;
          break;
        }
        if (!prevReady) {
          // Do not allow blank scroll into unloaded space.
          y = 0;
          appState.yMax = yMax;
          break;
        }
        const prevEntry = pageCache.get(prevIdx);
        const prevBmp = prevEntry?.bmp;
        if (!prevBmp) {
          y = 0;
          appState.yMax = yMax;
          break;
        }
        const mPrev = getNoUpscaleMetrics(prevBmp, !!prevEntry?.spread, cw, pwFrac);
        y = mPrev.scaledH + y;
        idx = prevIdx;
        jumps += 1;
        continue;
      }

      // Within-page movement: clamp range depends on whether the next page is ready (bridging).
      const maxY = nextReady ? scaledH : yMax;
      y = clamp(y, 0, maxY);
      appState.yMax = yMax;
      break;
    }

    // Commit page change (lands at the computed within-page y).
    if (idx !== appState.pageIndex) {
      appState.y = Math.max(0, y);
      await goToPage(idx, false, true);
      scheduleProgressSave();
      return;
    }

    // Same page: update y and redraw immediately.
    appState.y = y;
    drawActiveFrame(cachedBmp, cachedSpread);
    scheduleProgressSave();
  }

  // Build 21: map wheel to scrub navigation

  // FIND_THIS:HOTSPOT_WHEEL_HANDLER (Tankoban Build 2)
  function wheelToScrubNavigation(e) {
    // Reader only
    if (!document.body.classList.contains('inPlayer')) return;

    // Gate: never scrub while overlays/menus are open
    if (isKeysOpen() || isVolNavOpen() || isSpeedSliderOpen() || isMegaOpen() || appState.endOverlayOpen) return;

    // Build 22: never hijack system/browser zoom gestures (Ctrl / Cmd + wheel)
    if (e.ctrlKey || e.metaKey) return;

    // Gate: do not hijack wheel while interacting with inputs/sliders
    const active = document.activeElement;
    if (isTypingTarget(e.target) || isTypingTarget(active)) return;

    // Gate: if the scrubber is actively being dragged, let it be
    if (dragging) return;

    const n = appState.pages.length || 0;
    const mode = getControlMode();
    // Manual: wheel scrolls content even for single-page volumes. Auto: wheel scrubs pages.
    if (mode !== 'manual' && !isTwoPageFlipMode(mode) && !isTwoPageScrollMode(mode) && n <= 1) return;

    // Pick the dominant axis (trackpads can emit both)
    let d = (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) ? e.deltaY : e.deltaX;
    if (!Number.isFinite(d) || d === 0) return;

    // Normalize delta into a rough "pixel" unit
    if (e.deltaMode === 1) d *= 16;      // lines
    else if (e.deltaMode === 2) d *= 800; // pages

    if (isTwoPageScrollMode(mode)) {
      const dpr = window.devicePixelRatio || 1;
      const maxCss = Math.max(1200, Math.round((el.stage.height / dpr) * 3));
      const dEff = clamp(d, -maxCss, maxCss);

      // BUILD16C_TWOPAGE_SCROLL_WHEEL_SMOOTH: stabilize sideways trackpad noise.
      const now = performance.now();
      const ACCUM_RESET_MS = 140;
      const NOISE_PX = 6;
      const FILTER_ALPHA = 0.72;

      const lastT = wheelToScrubNavigation._tpsLastT || 0;
      if ((now - lastT) > ACCUM_RESET_MS) {
        wheelToScrubNavigation._tpsFilt = 0;
        wheelToScrubNavigation._tpsAcc = 0;
      }
      wheelToScrubNavigation._tpsLastT = now;

      const prevF = wheelToScrubNavigation._tpsFilt;
      const filt = Number.isFinite(prevF) ? (prevF * FILTER_ALPHA + dEff * (1 - FILTER_ALPHA)) : dEff;
      wheelToScrubNavigation._tpsFilt = filt;

      const prevAcc = wheelToScrubNavigation._tpsAcc;
      let acc = (Number.isFinite(prevAcc) ? prevAcc : 0) + filt;
      wheelToScrubNavigation._tpsAcc = acc;

      if (Math.abs(acc) < NOISE_PX) return;

      const consume = clamp(acc, -maxCss, maxCss);
      wheelToScrubNavigation._tpsAcc = acc - consume;

      e.preventDefault();
      queueTwoPageScrollSmooth(consume * dpr);
      return;
    }

    // Build 34: Manual control mode uses the wheel for direct scrolling (not scrub navigation).
    // BUILD8_IMAGE_FIT_TOGGLE: In Double Page flick + Fit Width, the wheel pans vertically ONLY when overflow exists.
    // Option B overflow rule: wheel-based vertical panning (no mode change, no height-clamp).
    if (mode === 'manual' || isTwoPageFlipMode(mode) || mode === 'autoFlip') {
      const dpr = window.devicePixelRatio || 1;
      const maxCss = Math.max(1200, Math.round((el.stage.height / dpr) * 3));
      const dEff = clamp(d, -maxCss, maxCss);
      const devDy = dEff * dpr;

      if (isTwoPageFlipMode(mode)) {
        const fit = getTwoPageImageFit(mode);

        const zoomPctRaw = (mode === 'twoPageMangaPlus')
          ? Number(appState.settings?.twoPageMangaPlusZoomPct ?? 100)
          : 100;
        const zoomPct = clamp(Number.isFinite(zoomPctRaw) ? zoomPctRaw : 100, 100, 260);
        const zoomed = (mode === 'twoPageMangaPlus' && zoomPct > 100);

        // Fit Width overflow: vertical pan. MangaPlus zoom: 2D pan (X or Y depending on dominant axis).
        const canPanY = ((fit === 'width') || zoomed) && Number.isFinite(twoPageFlickPanMax) && twoPageFlickPanMax > 0;
        const canPanX = zoomed && Number.isFinite(twoPageFlickPanMaxX) && twoPageFlickPanMaxX > 0;

        if (canPanX || canPanY) {
          // Decide axis using raw deltas (trackpads emit both).
          let dx = e.deltaX, dy = e.deltaY;
          if (e.deltaMode === 1) { dx *= 16; dy *= 16; }
          else if (e.deltaMode === 2) { dx *= 800; dy *= 800; }

          const dominantX = Math.abs(dx) > Math.abs(dy);
          const devDx = clamp(dx, -2000, 2000) * dpr;
          const devDy2 = clamp(dy, -2000, 2000) * dpr;

          if (dominantX && canPanX) {
            e.preventDefault();
            const prevX = twoPageFlickPanX;
            twoPageFlickPanX = clamp(twoPageFlickPanX + devDx, 0, twoPageFlickPanMaxX);
            if (twoPageFlickPanX !== prevX && cachedBmp) {
              try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
            }
            return;
          }

          if (canPanY) {
            e.preventDefault();
            const prevY = twoPageFlickPanY;
            twoPageFlickPanY = clamp(twoPageFlickPanY + devDy2, 0, twoPageFlickPanMax);
            if (twoPageFlickPanY !== prevY && cachedBmp) {
              try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
            }
            return;
          }
        }
      }
      // BUILD44_WHEEL_2D_PAN

      e.preventDefault();
      queueManualWheelSmooth(devDy);
      return;
    }

    const now = performance.now();

    // Build 22: lightweight smoothing + tiny-delta noise threshold
    // Trackpad wheels can spike (one big delta) and can also emit micro-noise near zero.
    // We low-pass the delta and accumulate until it crosses a small threshold before scrubbing.
    const NOISE_PX = 6;
    const FILTER_ALPHA = 0.72; // higher = smoother / more damping
    const ACCUM_RESET_MS = 140;
    const MAX_STEP_PX = 1400;

    const lastWheelT = wheelToScrubNavigation._lastWheelT || 0;
    if ((now - lastWheelT) > ACCUM_RESET_MS) {
      wheelToScrubNavigation._filt = 0;
      wheelToScrubNavigation._acc = 0;
    }
    wheelToScrubNavigation._lastWheelT = now;

    const prevF = wheelToScrubNavigation._filt;
    const filt = Number.isFinite(prevF) ? (prevF * FILTER_ALPHA + d * (1 - FILTER_ALPHA)) : d;
    wheelToScrubNavigation._filt = filt;

    const prevAcc = wheelToScrubNavigation._acc;
    let acc = (Number.isFinite(prevAcc) ? prevAcc : 0) + filt;
    wheelToScrubNavigation._acc = acc;

    // Ignore tiny movement/noise: do not scrub and do not prevent default.
    if (Math.abs(acc) < NOISE_PX) return;

    // Consume a bounded chunk from the accumulator so bursts feel controlled.
    const dEff = clamp(acc, -MAX_STEP_PX, MAX_STEP_PX);
    wheelToScrubNavigation._acc = acc - dEff;

    const last = wheelToScrubNavigation._lastT || 0;

    // If the user pauses wheel input briefly, reset our virtual scrub position to the current page.
    if (!Number.isFinite(wheelToScrubNavigation._t) || (now - last) > 250) {
      wheelToScrubNavigation._t = (n <= 1) ? 0 : (appState.pageIndex / (n - 1));
    }
    wheelToScrubNavigation._lastT = now;

    // Mapping note:
    // - Small wheel deltas move ~1 page over a couple notches.
    // - Larger/faster deltas accelerate naturally.
    const absd = Math.abs(dEff);
    let deltaT = dEff / 20000; // baseline sensitivity
    if (absd > 600) deltaT *= 2.0;
    else if (absd > 240) deltaT *= 1.4;

    wheelToScrubNavigation._t = clamp(wheelToScrubNavigation._t + deltaT, 0, 1);
    const idx = clamp(Math.round(wheelToScrubNavigation._t * (n - 1)), 0, n - 1);

    // Throttle commits so trackpad bursts don't spam async page loads.
    wheelToScrubNavigation._pendingIdx = idx;

    // Prevent the browser's default scroll behavior when we are actively scrubbing.
    e.preventDefault();

    if (wheelToScrubNavigation._timer) return;
    wheelToScrubNavigation._timer = window.setTimeout(() => {
      wheelToScrubNavigation._timer = 0;
      const target = wheelToScrubNavigation._pendingIdx;
      wheelToScrubNavigation._pendingIdx = null;
      if (!Number.isFinite(target)) return;

      const commit = (toIdx) => {
        if (wheelToScrubNavigation._inFlight) {
          wheelToScrubNavigation._queuedIdx = toIdx;
          return;
        }
        wheelToScrubNavigation._inFlight = true;
        goToPage(toIdx, appState.playing)
          .catch(() => {})
          .finally(() => {
            wheelToScrubNavigation._inFlight = false;
            const q = wheelToScrubNavigation._queuedIdx;
            wheelToScrubNavigation._queuedIdx = null;
            if (Number.isFinite(q) && q !== toIdx) {
              // Commit the latest queued target immediately.
              commit(q);
            }
          });
      };

      commit(target);
    }, 40);
  }

  // Capture at the window level so wheel scrubbing works anywhere in the reader.
  window.addEventListener('wheel', wheelToScrubNavigation, { passive: false, capture: true });

  // Build 26: HUD auto-hide refinement hooks.
  // Purely observational: no preventDefault and no reading-logic changes.
  // Build 41C: Click-only wake. Do not auto-wake the HUD on pointerdown when hidden,
  // otherwise the first click would also trigger navigation/play.
  function hudNoteActivityOnPointerDown(e) {
    if (!document.body.classList.contains('inPlayer')) return;
    if (appState.hudHidden) return;
    hudNoteActivity(e);
  }

  // Build 41E: In Auto Scroll, keyboard input must not wake the HUD.
  function hudNoteActivityOnKeydown(e) {
    if (!document.body.classList.contains('inPlayer')) return;
    const mode = getControlMode();
    if ((mode === 'manual' || isTwoPageFlipMode(mode) || mode === 'autoFlip') && appState.hudHidden) return;
    // Auto: never wake from keyboard when hidden.
    if (isAutoLikeControlMode(mode) && appState.hudHidden) return;
    hudNoteActivity(e);
  }

  window.addEventListener('pointerdown', hudNoteActivityOnPointerDown, { passive: true, capture: true });
  window.addEventListener('keydown', hudNoteActivityOnKeydown, true);
  window.addEventListener('blur', hudCancelAutoHide, true);

