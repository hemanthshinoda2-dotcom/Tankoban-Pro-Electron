// Build 9: moved from src/modules/reader_30_state_machine.js
// NOTE: Mechanical move. Logic is unchanged.
// Split from the original src/modules/reader.js — STATE_MACHINE section (Build 6, Phase 1)
  // EDIT_ZONE:STATE_MACHINE
  // -----------------------------
  // Playback loop
  // -----------------------------
  let raf = 0;
  let last = 0;

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  }

  async function startLoop() {
    if (!appState.pages.length) return;
    await ensureCachedBmp(true);
    appState.playing = true;
    syncTransportGlyph();
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function pauseLoop() {
    appState.playing = false;
    syncTransportGlyph();
  }

  // BUILD19B_TRANSPORT_GLYPH (Build 19B)
  // Keep the Play/Pause glyph honest across Auto (scroll) and Auto Flip (timer).
  function syncTransportGlyph() {
    if (!el.playBtn) return;
    const mode = getControlMode();

    if (mode === 'auto') {
      el.playBtn.textContent = appState.playing ? '⏸' : '▶';
      return;
    }

    if (mode === 'autoFlip') {
      // Show pause only if the timer is actually running and not paused.
      const running = !!autoFlipTimeoutId;
      el.playBtn.textContent = (running && !appState.autoFlipPaused) ? '⏸' : '▶';
      return;
    }

    el.playBtn.textContent = '▶';
  }


  // FIND_THIS:AUTO_FLIP_TIMER_CORE (Tankoban Build 3)
  // BUILD16C_AUTOFIP_INTERVAL + COUNTDOWN: interval is configurable; show countdown (top-left).
  let autoFlipTimeoutId = null;
  let autoFlipCountdownId = null;
  let autoFlipNextAtMs = 0;

  function readAutoFlipIntervalSec() {
    const raw = Number(appState.settings?.autoFlipIntervalSec ?? DEFAULTS.autoFlipIntervalSec);
    const sec = Math.round(raw);
    return clamp(sec, 5, 600); // 5s–10m bounds
  }

  function syncAutoFlipCountdown() {
    if (!el.autoFlipCountdown) return;

    const active = document.body.classList.contains('inPlayer')
      && getControlMode() === 'autoFlip'
      && (appState.playing || autoFlipTimeoutId);

    if (!active || !autoFlipNextAtMs) {
      el.autoFlipCountdown.classList.add('hidden');
      return;
    }

    const msLeft = Math.max(0, autoFlipNextAtMs - Date.now());
    const sLeft = Math.ceil(msLeft / 1000);
    el.autoFlipCountdown.textContent = `${sLeft}s`;
    el.autoFlipCountdown.classList.remove('hidden');
  }

  function stopAutoFlipTimer() {
    if (autoFlipTimeoutId) {
      try { clearTimeout(autoFlipTimeoutId); } catch {}
    }
    autoFlipTimeoutId = null;

    if (autoFlipCountdownId) {
      try { clearInterval(autoFlipCountdownId); } catch {}
    }
    autoFlipCountdownId = null;

    autoFlipNextAtMs = 0;
    syncAutoFlipCountdown();
  }

  function startAutoFlipTimer() {
    stopAutoFlipTimer();

    if (!document.body.classList.contains('inPlayer')) return;
    if (getControlMode() !== 'autoFlip') return;
    if (appState.autoFlipPaused) return;
    if (!appState.pages.length) return;

    const delayMs = readAutoFlipIntervalSec() * 1000;
    autoFlipNextAtMs = Date.now() + delayMs;

    autoFlipCountdownId = window.setInterval(syncAutoFlipCountdown, 200);
    syncAutoFlipCountdown();

    autoFlipTimeoutId = window.setTimeout(() => {
      autoFlipTimeoutId = null;
      Promise.resolve().then(autoFlipTimerTick);
    }, delayMs);
  }

  async function autoFlipTimerTick() {
    if (!document.body.classList.contains('inPlayer')) { stopAutoFlipTimer(); return; }
    if (getControlMode() !== 'autoFlip') { stopAutoFlipTimer(); return; }
    if (!appState.pages.length) { stopAutoFlipTimer(); return; }

    // Avoid stacking navigation while a decode is already in-flight.
    if (appState.navBusy) { startAutoFlipTimer(); return; }

    const before = appState.pageIndex;
    try { await nextTwoPage(); } catch {}

    if (!document.body.classList.contains('inPlayer')) { stopAutoFlipTimer(); return; }
    if (getControlMode() !== 'autoFlip') { stopAutoFlipTimer(); return; }

    const after = appState.pageIndex;

    // If we couldn't advance (likely end-of-book), stop advancing and keep view.
    if (after === before) { stopAutoFlipTimer(); return; }

    startAutoFlipTimer();
  }

  // FIND_THIS:HOTSPOT_PAGE_LABEL (Tankoban Build 2)
  function pageLabel(idx = appState.pageIndex) {
    const n = appState.pages.length || 0;
    if (!n) return '';
    return `Page ${idx + 1}/${n}`;
  }

  async function userTogglePlayPause() {
    if (!appState.pages.length) return;

    const cm = getControlMode();

    // Auto scroll transport (existing behavior)
    if (cm === 'auto') {
      if (!appState.playing) {
        await startLoop();
        playerToast('Playing');
      } else {
        pauseLoop();
        playerToast('Paused');
      }
      return;
    }

    // BUILD19B_AUTOFIP_TRANSPORT (Build 19B)
    // Auto Flip: Play/Pause should pause/resume the timer (Space/Enter uses Play button).
    if (cm === 'autoFlip') {
      if (appState.autoFlipPaused) {
        appState.autoFlipPaused = false;
        startAutoFlipTimer();
        syncTransportGlyph();
        playerToast('Playing');
      } else {
        appState.autoFlipPaused = true;
        stopAutoFlipTimer();
        syncTransportGlyph();
        playerToast('Paused');
      }
      return;
    }

    playerToast('Manual');
  }

  // FIND_THIS:HOTSPOT_AUTO_SCROLL_TICK (Tankoban Build 2)
  async function tick(ts) {
  raf = requestAnimationFrame(tick);
  if (!appState.playing) { last = ts; return; }
  if (!cachedBmp) { last = ts; return; }

  // FIND_THIS:TANKOBAN_AUTOSCROLL_MODE_GUARD (Tankoban Build 1)
  // FIND_THIS:TWO_PAGE_STRIP_DISABLE (Build 47A2)
  // Two-Page mode: no auto-scroll strip movement.
  if (blocksVerticalScroll(getControlMode())) {
    appState.y = 0;
    appState.yMax = 0;
    drawActiveFrame(cachedBmp, cachedSpread);
    last = ts;
    return;
  }

  // Keep canvas backing size synced to the viewport before any scroll math.
  try { resizeCanvasToDisplaySize(cachedBmp, cachedSpread); } catch {}

  const dt = last ? (ts - last) / 1000 : 0;
  last = ts;

  appState.tMode += dt;

  const sm = (appState.settings?.scrollMode) || 'infinite';

  // Build 14: no special spread fullscreen scene. Spreads are part of the strip.
  if (appState.mode === 'spreadHold') setReaderMode('portraitStrip');

  // Single-page mode (v16 behavior): topHold -> scroll -> bottomHold
  if (sm === 'singlePage') {
    const cw = el.stage.width, ch = el.stage.height;
    const pwFrac = getPortraitWidthFrac();
    const m0 = getNoUpscaleMetrics(cachedBmp, false, cw, pwFrac);
    const drawW = m0.drawW;
    const scale = m0.scale;
    const scaledH = m0.scaledH;
    const yMax = Math.max(0, scaledH - ch);
    appState.yMax = yMax;

    // Dynamic speed throttle ("gas pedal")
    let speed = Number(appState.settings.scrollPxPerSec || 0);
    if (modKeys.shift) speed *= 2.5;
    if (modKeys.ctrl) speed *= 0.2;

    if (appState.mode === 'topHold') {
      if (appState.tMode >= appState.settings.topHoldSec) setReaderMode('scroll');
      drawActiveFrame(cachedBmp, false);
      scheduleProgressSave();
      return;
    }

    if (appState.mode === 'bottomHold') {
      if (appState.tMode >= appState.settings.bottomHoldSec) {
        if (appState.pageIndex >= appState.pages.length - 1) {
          showEndOverlay();
          return;
        }
        await nextPage(true);
        return;
      }
      drawActiveFrame(cachedBmp, false);
      scheduleProgressSave();
      return;
    }

    // Default: scrolling
    if (appState.mode !== 'scroll') setReaderMode('scroll');

    const dy = speed * dt; // v16: no DPR multiplier
    appState.y = clamp(Math.round(appState.y + dy), 0, yMax);

    if (appState.y >= yMax - 0.5) {
      appState.y = yMax;
      setReaderMode('bottomHold');
    }

    drawActiveFrame(cachedBmp, false);
    scheduleProgressSave();
    return;
  }

  // Infinite strip mode (default): long-strip layout (portraits + spreads inline).
  // Build 14: no spread interrupt. A spread is just a wider page in the same strip.
  const cw = el.stage.width, ch = el.stage.height;
  const pwFrac = getPortraitWidthFrac();
  const m0 = getNoUpscaleMetrics(cachedBmp, cachedSpread, cw, pwFrac);
  const drawW0 = m0.drawW;
  const scale0 = m0.scale;
  const scaledH0 = m0.scaledH;
  const yMax0 = Math.max(0, scaledH0 - ch);
  appState.yMax = yMax0;

  const dpr = window.devicePixelRatio || 1;

  // Dynamic speed throttle ("gas pedal")
  let speed = Number(appState.settings.scrollPxPerSec || 0);
  if (modKeys.shift) speed *= 2.5;
  // Ctrl is a brake (slower, more precise)
  if (modKeys.ctrl) speed *= 0.2;

  // FIND_THIS:TANKOBAN_AUTOSCROLL_REPAIR (Tankoban Build 1)
  // Restore Auto Scroll strip movement (device-pixel units).
  const dy = speed * dt;
  const nextY = (Number(appState.y) || 0) + dy;
  appState.y = Math.round(nextY);

  const nextIdx = appState.pageIndex + 1;

  // End of volume
  if (nextIdx >= appState.pages.length) {
    if (appState.y >= yMax0 - 0.5) {
      appState.y = yMax0;
      drawActiveFrame(cachedBmp, cachedSpread);
      showEndOverlay();
      return;
    }
    appState.y = clamp(appState.y, 0, yMax0);
    drawActiveFrame(cachedBmp, cachedSpread);
    scheduleProgressSave();
    return;
  }

  const nextCache = pageCache.get(nextIdx);

  // Prefetch the next page when we're nearing the end of the current page.
  const nearEnd = appState.y >= (yMax0 - Math.round(ch * 0.35));
  if (nearEnd && !nextCache?.bmp && !nextCache?.promise) {
    getBitmapAtIndex(nextIdx).catch(() => {});
  }

  // Only allow seamless bridging once the next bitmap is ready.
  // Otherwise we'd scroll into a black region while the decode is still pending.
  if (!nextCache?.bmp) {
    appState.y = clamp(appState.y, 0, yMax0);
    drawActiveFrame(cachedBmp, cachedSpread);
    scheduleProgressSave();
    return;
  }

  // Allow y to move beyond yMax so the next page (portrait or spread) connects seamlessly.
  appState.y = clamp(appState.y, 0, scaledH0);

  // Once the top of the viewport has moved past the end of the current page,
  // advance to the next page and keep the leftover y.
  if (appState.y >= scaledH0) {
    appState.y = appState.y - scaledH0;
    await goToPage(nextIdx, true, true);
    return;
  }

  drawActiveFrame(cachedBmp, cachedSpread);
  scheduleProgressSave();
  return;
}

  // -----------------------------
  // Navigation
  // -----------------------------

async function goToPage(idx, keepPlaying = false, keepScroll = false) {
  if (!appState.pages.length) return;

  // PERF_HOTSPOT: rapid next/prev can overlap decoding and allow older completions to draw the wrong page
  // → FIX: coalesce requests + nav token loop (latest action wins) and discard stale results.

  idx = clamp(idx, 0, appState.pages.length - 1);
  const navTok = ++appState.tokens.nav;
  appState.pendingNav = { idx, keepPlaying: !!keepPlaying, keepScroll: !!keepScroll, navTok };

  // If a navigation drain is already running, just wait for it to settle.
  if (appState.navBusy) {
    if (!appState.navDrainPromise) {
      appState.navDrainPromise = new Promise((res) => { appState.navDrainResolve = res; });
    }
    return appState.navDrainPromise;
  }

  appState.navBusy = true;
  if (!appState.navDrainPromise) {
    appState.navDrainPromise = new Promise((res) => { appState.navDrainResolve = res; });
  }

  // FIND_THIS:BUILD17_AUTOFILP_RESET_ON_MANUAL_NAV (Build 17)
  // Cancel any pending tick immediately so it can't fire during a manual page change.
  const shouldResetAutoFlipTimer = (getControlMode() === 'autoFlip');
  if (shouldResetAutoFlipTimer) stopAutoFlipTimer();

  let opened = false;
  let loadingTimer = null;

  try {
    // Drain loop: apply the last requested nav; if new requests arrive mid-decode, loop again.
    while (appState.pendingNav) {
      const req = appState.pendingNav;
      appState.pendingNav = null;

      const volTok = Number(appState.tokens?.volume) || 0;
      const targetIdx = clamp(Number(req.idx) || 0, 0, appState.pages.length - 1);

      // No-op guard: if nothing changes and we already have the frame, skip heavy work.
      if (targetIdx === appState.pageIndex && cachedBmp) {
        continue;
      }

      appState.pageIndex = targetIdx;
      if (!req.keepScroll) appState.y = 0;

      // Two-Page: request the partner page early so it is ready by draw time.
      if (isTwoPageFlipMode(getControlMode()) || getControlMode() === 'autoFlip') {
        prefetchTwoPagePartner(appState.pageIndex);
      }

      // Stale guard for this specific iteration.
      const myNavTok = req.navTok;
      const isStale = () => ((Number(appState.tokens?.volume) || 0) !== volTok) || (appState.tokens.nav !== myNavTok);

      // Delay spinner slightly to avoid flicker for fast page hits.
      if (loadingTimer) clearTimeout(loadingTimer);
      opened = false;
      loadingTimer = setTimeout(() => {
        if (isStale()) return;
        opened = true;
        showLoading('Loading page', `Page ${appState.pageIndex + 1}/${appState.pages.length}`);
      }, 120);

      try {
        clearCachedBmp(false);
        await ensureCachedBmp(true);

        // If superseded mid-decode, do not draw/update UI for this iteration.
        if (isStale()) continue;

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

          // Build 22: small safe parallelism (<=2 partner pages) reduces "await-in-loop" stalls.
          await Promise.all(
            need
              .filter((j) => Number.isFinite(j) && j !== appState.pageIndex)
              .map((j) => getBitmapAtIndex(j).catch(() => null))
          );

          if (isStale()) continue;
        }

        // Update UI/draw only if we are still the latest requested navigation.
        updateNowPlaying();
        updateScrubber();

        // BUILD42_NAV_PRESENT_RAF (Build 42)
        // Ensure the new page presents immediately (fixes cases where the image
        // doesn't visually update until the next wheel/scroll event).
        try {
          const bmpRef = cachedBmp;
          const spreadRef = cachedSpread;

          if (!bmpRef) {
            try { scheduleDraw(); } catch {}
          } else {
            requestAnimationFrame(() => {
              if (appState.tokens.volume !== volTok) return;
              if (appState.tokens.nav !== myNavTok) return;
              try { resizeCanvasToDisplaySize(bmpRef, spreadRef); } catch {}
              try { drawActiveFrame(bmpRef, spreadRef); } catch {}
            });
          }
        } catch {
          try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
        }

        scheduleProgressSave();

        if (req.keepPlaying && !appState.playing) await startLoop();
      } finally {
        if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
        if (opened) hideLoading();
      }
    }
  } finally {
    appState.navBusy = false;
    const r = appState.navDrainResolve;
    appState.navDrainResolve = null;
    const p = appState.navDrainPromise;
    appState.navDrainPromise = null;
    try { r && r(); } catch {}

    // BUILD18A_AUTOFILP_ALWAYS_RESTART (Build 18A)
    // If page decoding fails, goToPage would previously exit early and leave AutoFlip stopped.
    if (shouldResetAutoFlipTimer && document.body.classList.contains('inPlayer') && getControlMode() === 'autoFlip') {
      startAutoFlipTimer();
    }
  }
}


  async function nextPage(keepPlaying=false) {
    if (appState.pageIndex >= appState.pages.length - 1) {
      showEndOverlay();
      return;
    }
    const idx = clamp(appState.pageIndex + 1, 0, appState.pages.length - 1);
    await goToPage(idx, keepPlaying);
  }

  async function prevPage() {
    const idx = clamp(appState.pageIndex - 1, 0, appState.pages.length - 1);
    await goToPage(idx, appState.playing);
  }

  // FIND_THIS:TWO_PAGE_NAV_CORE (Build 47A4)
  async function nextTwoPage() {
    if (!appState.pages.length) return;
    const n = appState.pages.length;
    const idx = clamp(appState.pageIndex, 0, Math.max(0, n - 1));

    let target = 0;
    // Cover special: 0→1 on next.
    if (idx === 0) target = 1;
    else if (isStitchedSpread(idx)) target = idx + 1;
    else target = idx + 2;

    if (!Number.isFinite(target) || target >= n) {
      playerToast('End');
      showEndOverlay();
      return;
    }

    target = snapTwoPageIndex(target);

    await goToPage(target, appState.playing);
    syncHudPageCounter(true);
    playerToast(`Next • ${pageLabel()}`);
  }

  async function prevTwoPage() {
    if (!appState.pages.length) return;
    const n = appState.pages.length;
    const idx = clamp(appState.pageIndex, 0, Math.max(0, n - 1));

    // Cover special: 1→0 on prev.
    if (idx === 1) {
      await goToPage(0, appState.playing);
      syncHudPageCounter(true);
      playerToast(`Prev • ${pageLabel()}`);
      return;
    }

    if (idx <= 0) {
      playerToast('Start');
      await prevPage();
      syncHudPageCounter(true);
      return;
    }

    let target = 0;
    if (isStitchedSpread(idx)) target = idx - 1;
    else target = idx - 2;

    if (!Number.isFinite(target) || target < 0) target = 0;

    target = snapTwoPageIndex(target);

    await goToPage(target, appState.playing);
    syncHudPageCounter(true);
    playerToast(`Prev • ${pageLabel()}`);
  }


  // Instant Replay (Backtrack): jump up by 30% of the viewport height.
  // If the reader was playing, it should auto-resume when the replay lands.
  async function instantReplay() {
    if (!appState.pages.length) return;

    const wasPlaying = appState.playing;
    const shouldResume = wasPlaying && isAutoLikeControlMode();

    // Pause momentarily to avoid the loop fighting the seek; we may restore state at the end.
    if (wasPlaying) pauseLoop();

    try {
      await ensureCachedBmp(false);
      // Make sure the canvas size matches the viewport before we compute a replay distance.
      try { resizeCanvasToDisplaySize(cachedBmp, cachedSpread); } catch {}

      const ch = el.stage.height || Math.floor((window.innerHeight || 0) * (window.devicePixelRatio || 1));
      const dist = Math.round(ch * 0.30);

      // Build 14: spreads are part of the strip. Replay is a pure vertical backtrack.

      let newY = Math.round(appState.y - dist);

      // Same page backtrack
      if (newY >= 0) {
        appState.y = newY;
        drawActiveFrame(cachedBmp, cachedSpread);
        scheduleProgressSave();
        return;
      }

      // Cross-page backtrack into previous page (if possible).
      if (appState.pageIndex <= 0) {
        appState.y = 0;
        drawActiveFrame(cachedBmp, cachedSpread);
        scheduleProgressSave();
        return;
      }

      const prevIdx = appState.pageIndex - 1;
      const prev = await getBitmapAtIndex(prevIdx);

      // Compute where to land near the bottom of the previous page (portrait or spread).
      resizeCanvasToDisplaySize(cachedBmp, cachedSpread);
      const cw = el.stage.width;
      const pwFrac = getPortraitWidthFrac();

      const mPrev = getNoUpscaleMetrics(prev.bmp, prev.spread, cw, pwFrac);
      const scaledHPrev = mPrev.scaledH;

      // newY is negative, so scaledHPrev + newY is "from bottom".
      const chNow = el.stage.height;
      const yMaxPrev = Math.max(0, scaledHPrev - chNow);
      const upper = isSinglePageMode() ? yMaxPrev : scaledHPrev;
      appState.y = clamp(Math.round(scaledHPrev + newY), 0, upper);

      await goToPage(prevIdx, shouldResume, true);
    } finally {
      // Make this robust even if we exit early; only resume if we were playing in Auto Scroll mode.
      if (shouldResume && !appState.playing) {
        try { await startLoop(); } catch {}
      }
    }
  }

  // -----------------------------
  // Scrubber (custom drag widget)
  // -----------------------------
  // Build 28: bubble clamping so it never clips at the extremes.
  // Keep scrub math unchanged; this is purely visual.
  let scrubBubbleW = 0;
  let scrubBubbleSig = '';
  function setScrubBubbleLeftClamped(t, pctFallback) {
    if (!el.scrubBubble) return;
    if (!el.scrub) { el.scrubBubble.style.left = pctFallback; return; }
    const w = el.scrub.clientWidth || 0;
    if (!w) { el.scrubBubble.style.left = pctFallback; return; }

    // Measure bubble width only when its rendered text likely changes its width.
    const sig = String((el.scrubBubble.textContent || '').length);
    if (!scrubBubbleW || sig !== scrubBubbleSig) {
      scrubBubbleSig = sig;
      scrubBubbleW = el.scrubBubble.getBoundingClientRect().width || el.scrubBubble.offsetWidth || 0;
    }
    const bw = scrubBubbleW;
    if (!bw || bw >= w) { el.scrubBubble.style.left = pctFallback; return; }

    const half = bw / 2;
    const x = clamp(t * w, half, w - half);
    el.scrubBubble.style.left = `${x.toFixed(2)}px`;
  }

function updateScrubber() {
  const n = appState.pages.length || 1;
  const t = (n <= 1) ? 0 : (appState.pageIndex / (n - 1));
  const pct = `${(t * 100).toFixed(4)}%`;

  // Build 22: avoid redundant DOM writes during rapid navigation.
  if (el.scrubFill.style.width !== pct) el.scrubFill.style.width = pct;
  if (el.scrubThumb.style.left !== pct) el.scrubThumb.style.left = pct;

  const bubbleText = String(appState.pageIndex + 1);
  if (el.scrubBubble.textContent !== bubbleText) el.scrubBubble.textContent = bubbleText;

  setScrubBubbleLeftClamped(t, pct);
}

function pageFromClientX(clientX) {
  // Build 22: cache rect during drag to avoid layout reads on every pointermove.
  let left = 0;
  let width = 0;
  if (dragging && scrubDragWidth > 0) {
    left = scrubDragLeft;
    width = scrubDragWidth;
  } else {
    const rect = el.scrub.getBoundingClientRect();
    left = rect.left;
    width = rect.width;
  }

  const x = clamp(clientX - left, 0, width);
  const t = width ? (x / width) : 0;
  const n = appState.pages.length || 1;
  const idx = Math.round(t * (n - 1));
  return clamp(idx, 0, n - 1);
}

  let dragging = false;
  let lastScrubClientX = 0;


// PERF_HOTSPOT: pointermove calls getBoundingClientRect + multiple DOM writes per event (layout thrash)
// → FIX: cache scrub geometry for the drag + rAF-gate updates (one per frame, same visuals).
let scrubDragLeft = 0;
let scrubDragWidth = 0;
let scrubMoveRaf = 0;
let scrubPendingClientX = null;

  function scrubTo(clientX, commit=false) {
    if (!appState.pages.length) return;
    if (typeof clientX === 'number') lastScrubClientX = clientX;
    const idx = pageFromClientX(clientX);
    // show bubble while dragging
    el.scrubBubble.textContent = String(idx + 1);

    // move thumb immediately for feel
    const n = appState.pages.length || 1;
    const t = (n <= 1) ? 0 : (idx / (n - 1));
    const pct = `${(t * 100).toFixed(4)}%`;
    el.scrubFill.style.width = pct;
    el.scrubThumb.style.left = pct;
    setScrubBubbleLeftClamped(t, pct);

    if (commit) {
      playerToast(`Page ${idx + 1}/${appState.pages.length || 0}`);
      goToPage(idx, appState.playing);
    }
  }

  function endScrubDrag({ commit=false, clientX=null } = {}) {
    if (!dragging) return;
    dragging = false;
    appState.scrubDragging = false;

// Build 22: clear cached geometry + pending rAF.
scrubDragLeft = 0;
scrubDragWidth = 0;
scrubPendingClientX = null;
if (scrubMoveRaf) { cancelAnimationFrame(scrubMoveRaf); scrubMoveRaf = 0; }
    el.scrub.classList.remove('dragging');
    const x = (typeof clientX === 'number') ? clientX : lastScrubClientX;
    if (commit && typeof x === 'number') scrubTo(x, true);
    else updateScrubber();
    hudSyncFreezeClass();
  }

  el.scrub.addEventListener('pointerdown', (e) => {
    if (!appState.pages.length) return;
    dragging = true;

// Build 22: cache geometry for this drag (avoids forced layout on every move).
try {
  const rect = el.scrub.getBoundingClientRect();
  scrubDragLeft = rect.left;
  scrubDragWidth = rect.width || 1;
} catch {
  scrubDragLeft = 0;
  scrubDragWidth = 0;
}
    appState.scrubDragging = true;
    el.scrub.classList.add('dragging');
    try { el.scrub.setPointerCapture(e.pointerId); } catch {}
    scrubTo(e.clientX, true);
    hudSyncFreezeClass();
    hudCancelAutoHide();
  });

el.scrub.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  // Build 22: coalesce move bursts to one update per frame.
  scrubPendingClientX = e.clientX;
  if (scrubMoveRaf) return;
  scrubMoveRaf = requestAnimationFrame(() => {
    scrubMoveRaf = 0;
    if (!dragging) return;
    if (typeof scrubPendingClientX === 'number') scrubTo(scrubPendingClientX, false);
  });
});
  el.scrub.addEventListener('pointerup', (e) => {
    endScrubDrag({ commit: true, clientX: e.clientX });
  });
  el.scrub.addEventListener('pointercancel', (e) => {
    try { el.scrub.releasePointerCapture(e.pointerId); } catch {}
    endScrubDrag({ commit: false });
  });
  el.scrub.addEventListener('lostpointercapture', () => {
    // Treat a lost capture like a completed drag so it can't get stuck.
    endScrubDrag({ commit: true });
  });
  window.addEventListener('blur', () => { endScrubDrag({ commit: false }); });

  // Build 26: keep HUD visible while hovering the scrub region (player-like feel).
  const scrubWrap = document.querySelector('.ytScrubWrap');
  if (scrubWrap) {
    scrubWrap.addEventListener('pointerenter', () => {
      hudHoverScrub = true;
      hudSyncFreezeClass();
      hudCancelAutoHide();
    });
    scrubWrap.addEventListener('pointerleave', () => {
      hudHoverScrub = false;
      hudSyncFreezeClass();
      hudScheduleAutoHide();
    });
  }

  // Build 40: keep HUD visible while hovering the HUD itself (prevents flicker while clicking).
  const hudBar = document.querySelector('.playerBar');
  const hudFooter = document.querySelector('.playerFooter');
  const hudHoverEnter = () => { hudHoverHud = true; hudSyncFreezeClass(); hudCancelAutoHide(); };
  const hudHoverLeave = () => { hudHoverHud = false; hudSyncFreezeClass(); hudScheduleAutoHide(); };
  [hudBar, hudFooter].forEach(node => {
    if (!node) return;
    node.addEventListener('pointerenter', hudHoverEnter);
    node.addEventListener('pointerleave', hudHoverLeave);
  });

  // -----------------------------
  // Manual scroller (Build 33)
  // -----------------------------
  let manualScrollerMaxTopCache = null;
  function recomputeManualScrollerMaxTopCache() {
    if (!el.manualScroller || !el.manualScrollerThumb) {
      manualScrollerMaxTopCache = 0;
      return;
    }
    // Manual scroller geometry is in CSS pixels.
    const h = el.manualScroller.clientHeight || 0;
    const th = el.manualScrollerThumb.offsetHeight || 0;
    manualScrollerMaxTopCache = Math.max(0, Math.round(h - th));
  }
  function manualScrollerCanStartDrag() {
    if (!document.body.classList.contains('inPlayer')) return false;
    if (!appState.pages.length) return false;
    if (appState.navBusy) return false;
    if (isKeysOpen() || isVolNavOpen() || isSpeedSliderOpen() || isMegaOpen() || appState.endOverlayOpen) return false;
    if (appState.scrubDragging || (el.scrub && el.scrub.classList.contains('dragging'))) return false;
    return true;
  }

  function manualScrollerThumbMaxTopPx() {
    if (manualScrollerMaxTopCache === null) recomputeManualScrollerMaxTopCache();
    return manualScrollerMaxTopCache || 0;
  }

  function setManualScrollerProgress(progress01) {
    if (!el.manualScrollerThumb) return;
    const maxTop = manualScrollerThumbMaxTopPx();
    const t = clamp(progress01, 0, 1);
    const top = Math.round(t * maxTop);
    el.manualScrollerThumb.style.top = `${top}px`;
  }

  function manualScrollerProgressFromClientY(clientY) {
    if (!el.manualScroller || !el.manualScrollerThumb) return 0;
    const rect = el.manualScroller.getBoundingClientRect();
    const h = rect.height || 1;
    const th = el.manualScrollerThumb.offsetHeight || 0;
    const maxTop = Math.max(1, h - th);
    const y = clamp(clientY - rect.top - (th / 2), 0, maxTop);
    return clamp(y / maxTop, 0, 1);
  }

  let manualPointerId = null;


// Build 22: cache manual scroller geometry during drag to avoid layout reads per pointermove.
let manualDragTop = 0;
let manualDragHeight = 0;
let manualDragThumbH = 0;
let manualDragMoveRaf = 0;
let manualDragPendingY = null;

  function beginManualScrollerDrag(e) {
    if (!manualScrollerCanStartDrag()) return;

// Build 22: cache geometry once per drag (prevents forced layout churn on move).
try {
  const rect = el.manualScroller.getBoundingClientRect();
  manualDragTop = rect.top;
  manualDragHeight = rect.height || 1;
  manualDragThumbH = el.manualScrollerThumb.offsetHeight || 0;
} catch {
  manualDragTop = 0;
  manualDragHeight = 0;
  manualDragThumbH = 0;
}
    manualPointerId = e.pointerId;
    appState.manualScrollerDragging = true;
    appState.manualScrollerDragProgress = manualScrollerProgressFromClientY(e.clientY);
    el.manualScroller?.classList.add('dragging');
    setManualScrollerProgress(appState.manualScrollerDragProgress);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    hudSyncFreezeClass();
    hudCancelAutoHide();
  }

function moveManualScrollerDrag(e) {
  if (!appState.manualScrollerDragging) return;
  if (manualPointerId !== null && e.pointerId !== manualPointerId) return;

  manualDragPendingY = e.clientY;
  if (manualDragMoveRaf) return;

  manualDragMoveRaf = requestAnimationFrame(() => {
    manualDragMoveRaf = 0;
    if (!appState.manualScrollerDragging) return;
    const clientY = (typeof manualDragPendingY === 'number') ? manualDragPendingY : 0;

    // Build 22: compute progress using cached geometry (no getBoundingClientRect in the hot loop).
    const h = manualDragHeight || 1;
    const th = manualDragThumbH || 0;
    const maxTop = Math.max(1, h - th);
    const y = clamp(clientY - manualDragTop - (th / 2), 0, maxTop);
    appState.manualScrollerDragProgress = clamp(y / maxTop, 0, 1);
    setManualScrollerProgress(appState.manualScrollerDragProgress);
  });
}

  function endManualScrollerDrag(e, { commit = true } = {}) {
    if (!appState.manualScrollerDragging) return;
    if (manualPointerId !== null && e && e.pointerId !== manualPointerId) return;

    const keepPlaying = appState.playing;
    const p = clamp(appState.manualScrollerDragProgress, 0, 1);

    appState.manualScrollerDragging = false;

manualDragTop = 0;
manualDragHeight = 0;
manualDragThumbH = 0;
manualDragPendingY = null;
if (manualDragMoveRaf) { cancelAnimationFrame(manualDragMoveRaf); manualDragMoveRaf = 0; }
    manualPointerId = null;
    el.manualScroller?.classList.remove('dragging');
    hudSyncFreezeClass();
    hudScheduleAutoHide();

    if (!commit || !appState.pages.length) return;

    // FIND_THIS:TANKOBAN_TWO_PAGE_SCROLL_SCROLLER_DRAG (Tankoban Build 4)
    // In Two-Page (Scroll), the scroller should move within the stacked stream (appState.y), not jump by page index.
    if (isTwoPageScrollMode()) {
      const ch = el.stage?.height || 1;

      // BUILD18_TWOPAGE_SCROLL_DRAG_LOCAL_DURING_HOLD:
      // During entry-sync hold, appState.y is local-to-row. Make drag work immediately using row height.
      if (twoPageScrollHoldSingleRowUntilSync) {
        const rowH = Number(twoPageScrollRowContentHeightDevPx) || 0;
        const maxY = Math.max(0, rowH - ch);
        appState.y = clamp(Math.round(p * maxY), 0, maxY);
        appState.yMax = maxY;
        try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
        scheduleProgressSave();
        return;
      }

      // Kick off layout build if needed so totalH/maxY become available.
      try { startTwoPageScrollRowsBuildIfNeeded(el.stage?.width || 0); } catch {}
      const totalH = Number(twoPageScrollTotalHeightDevPx) || 0;
      const maxY = Math.max(0, totalH - ch);

      if (maxY <= 0 || !(twoPageScrollRows || []).length) {
        // Layout not ready yet; remember the progress fraction and apply on the next stacked draw.
        twoPageScrollPendingScrollProgress01 = p;
        scheduleTwoPageScrollRedraw();
      } else {
        appState.y = clamp(Math.round(p * maxY), 0, maxY);
        appState.yMax = maxY;
        try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
        scheduleProgressSave();
      }
      return;
    }

    const total = appState.pages.length;
    const targetIndex = clamp(Math.floor(p * total), 0, total - 1);
    goToPage(targetIndex, keepPlaying);
  }

  if (el.manualScrollerTrack && el.manualScrollerThumb) {
    // Enable pointer events only on the thin hit area.
    el.manualScrollerTrack.addEventListener('pointerdown', beginManualScrollerDrag);
    el.manualScrollerThumb.addEventListener('pointerdown', beginManualScrollerDrag);

    const move = (e) => moveManualScrollerDrag(e);
    const up = (e) => endManualScrollerDrag(e, { commit: true });
    const cancel = (e) => endManualScrollerDrag(e, { commit: false });

    el.manualScrollerTrack.addEventListener('pointermove', move);
    el.manualScrollerThumb.addEventListener('pointermove', move);
    el.manualScrollerTrack.addEventListener('pointerup', up);
    el.manualScrollerThumb.addEventListener('pointerup', up);
    el.manualScrollerTrack.addEventListener('pointercancel', cancel);
    el.manualScrollerThumb.addEventListener('pointercancel', cancel);
    el.manualScrollerTrack.addEventListener('lostpointercapture', up);
    el.manualScrollerThumb.addEventListener('lostpointercapture', up);
    window.addEventListener('blur', () => { if (appState.manualScrollerDragging) endManualScrollerDrag(null, { commit: false }); });
  }

  // -----------------------------
  // Playback memory
  // -----------------------------
  let saveTimer = 0;
  let saveTimerBookId = '';

  // FIND_THIS:BUILD17_PROGRESS_MAX_SEEN_HELPER (Build 17)
  // Used for Continue Reading percent without opening archives in the Library.
  function computeMaxPageIndexSeenNow() {
    const n = appState.pages.length || 0;
    if (!n) return 0;

    const idx = clamp(appState.pageIndex, 0, n - 1);
    const mode = getControlMode();

    // In Two-Page (Flip) and AutoFlip, “reading this view” covers both pages.
    if (isTwoPageFlipMode(mode) || mode === 'autoFlip') {
      const pair = getTwoPagePair(idx);
      const a = Number(pair?.rightIndex);
      const b = Number.isFinite(pair?.leftIndexOrNull) ? Number(pair.leftIndexOrNull) : a;
      return clamp(Math.max(a, b), 0, n - 1);
    }

    return idx;
  }

  function scheduleProgressSave() {
    if (!appState.book) return;
    // Autosave too frequently can cause visible stutter on some PCs/TV setups.
    const delay = appState.playing ? 1500 : 450; // slower while playing, snappier when paused
    const bid = appState.book.id;
    if (saveTimer) {
      // BUILD42_PROGRESS_SAVE_TIMER_PER_BOOK (Build 42)
      // Don't let a pending autosave for a different volume block this one.
      if (saveTimerBookId === bid) return;
      try { clearTimeout(saveTimer); } catch {}
      saveTimer = 0;
    }
    saveTimerBookId = bid;
    saveTimer = window.setTimeout(async () => {
      saveTimer = 0;
      const myBid = bid;
      saveTimerBookId = '';
      try {
        if (!appState.book || appState.book.id !== myBid) return;
        const prev = appState.progressAll[myBid] || {};

        const pageCount = appState.pages.length || 0;
        const maxNow = computeMaxPageIndexSeenNow();
        const prevMax = Number(prev.maxPageIndexSeen) || 0;
        const maxEver = Math.max(prevMax, maxNow);

        // BUILD19_PROGRESS_KNOWN_SPREADS (Build 19)
        const knownSpreadsArr = (() => {
          try { return Array.from(knownSpreadIndexSet).filter(Number.isFinite).sort((a,b)=>a-b); } catch { return []; }
        })();


        const knownNormalsArr = (() => {
          try { return Array.from(knownNormalIndexSet).filter(Number.isFinite).sort((a,b)=>a-b); } catch { return []; }
        })();

        const payload = {
          ...prev, // preserve finished/finishedAt and any future progress metadata
          pageIndex: appState.pageIndex,
          y: appState.y,
          settings: appState.settings,
          pageCount,
          // BUILD 19E_EXTERNAL_BOOK_META
          // Store enough metadata so Continue Reading can render books not in the library index.
          bookMeta: appState.book ? {
            title: appState.book.title,
            series: appState.book.series,
            seriesId: appState.book.seriesId,
            path: appState.book.path,
          } : null,
          // BUILD 19E_EXTERNAL_BOOK_META
          // Store enough metadata so Continue Reading can render books not in the library index.
          bookMeta: appState.book ? {
            title: appState.book.title,
            series: appState.book.series,
            seriesId: appState.book.seriesId,
            path: appState.book.path,
          } : null,
          maxPageIndexSeen: maxEver,
          knownSpreadIndices: knownSpreadsArr,
          knownNormalIndices: knownNormalsArr,
          updatedAt: Date.now(),
        };

        // Auto-finish once we've covered the last page at least once.
        if (pageCount && maxEver >= (pageCount - 1) && !payload.finished) {
          payload.finished = true;
          payload.finishedAt = prev.finishedAt || Date.now();
        }
        if (!appState.book || appState.book.id !== myBid) return;
        await Tanko.api.progress.save(myBid, payload);
        if (!appState.book || appState.book.id !== myBid) return;
        appState.progressAll[myBid] = { ...payload, updatedAt: Date.now() };
        await saveSeriesSettings(appState.book.seriesId, appState.settings);
      } catch {}
    }, delay);
  }

async function saveProgressNowSilent() {
  if (!appState.book) return;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
  const prev = (await Tanko.api.progress.get(appState.book.id)) || {};

  const pageCount = appState.pages.length || 0;
  const maxNow = computeMaxPageIndexSeenNow();
  const prevMax = Number(prev.maxPageIndexSeen) || 0;
  const maxEver = Math.max(prevMax, maxNow);

  const knownSpreadsArr = (() => {
    try { return Array.from(knownSpreadIndexSet).filter(Number.isFinite).sort((a,b)=>a-b); } catch { return []; }
  })();


  const knownNormalsArr = (() => {
    try { return Array.from(knownNormalIndexSet).filter(Number.isFinite).sort((a,b)=>a-b); } catch { return []; }
  })();

  const payload = {
    ...prev,
    pageIndex: appState.pageIndex,
    y: appState.y,
    settings: appState.settings,
    pageCount,
          // BUILD 19E_EXTERNAL_BOOK_META
          // Store enough metadata so Continue Reading can render books not in the library index.
          bookMeta: appState.book ? {
            title: appState.book.title,
            series: appState.book.series,
            seriesId: appState.book.seriesId,
            path: appState.book.path,
          } : null,
    maxPageIndexSeen: maxEver,
    knownSpreadIndices: knownSpreadsArr,
    knownNormalIndices: knownNormalsArr,
    updatedAt: Date.now(),
  };

  if (pageCount && maxEver >= (pageCount - 1) && !payload.finished) {
    payload.finished = true;
    payload.finishedAt = prev.finishedAt || Date.now();
  }
  try {
    await Tanko.api.progress.save(appState.book.id, payload);
    appState.progressAll[appState.book.id] = { ...payload, updatedAt: Date.now() };
    await saveSeriesSettings(appState.book.seriesId, appState.settings);
  } catch {}
}


  async function saveProgressNow() {
    if (!appState.book) return;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
    const prev = (await Tanko.api.progress.get(appState.book.id)) || {};

    const pageCount = appState.pages.length || 0;
    const maxNow = computeMaxPageIndexSeenNow();
    const prevMax = Number(prev.maxPageIndexSeen) || 0;
    const maxEver = Math.max(prevMax, maxNow);

    const knownSpreadsArr = (() => {
      try { return Array.from(knownSpreadIndexSet).filter(Number.isFinite).sort((a,b)=>a-b); } catch { return []; }
    })();

    const knownNormalsArr = (() => {
      try { return Array.from(knownNormalIndexSet).filter(Number.isFinite).sort((a,b)=>a-b); } catch { return []; }
    })();

    const payload = {
      ...prev,
      pageIndex: appState.pageIndex,
      y: appState.y,
      settings: appState.settings,
      pageCount,
      maxPageIndexSeen: maxEver,
      knownSpreadIndices: knownSpreadsArr,
      knownNormalIndices: knownNormalsArr,
      updatedAt: Date.now(),
    };

    if (pageCount && maxEver >= (pageCount - 1) && !payload.finished) {
      payload.finished = true;
      payload.finishedAt = prev.finishedAt || Date.now();
    }
    await Tanko.api.progress.save(appState.book.id, payload);
    appState.progressAll[appState.book.id] = { ...payload, updatedAt: Date.now() };
    await saveSeriesSettings(appState.book.seriesId, appState.settings);
    toast('Checkpoint saved');
  }


  async function clearResume() {
    if (!appState.book) return;
    await Tanko.api.progress.clear(appState.book.id);
    delete appState.progressAll[appState.book.id];
    toast('Resume cleared');
  }


  // Build 15: convenience actions for scrub-bar buttons
  async function clearResumeAndRestart() {
    if (!appState.book) return;
    const wasPlaying = !!appState.playing;
    await clearResume();
    if (document.body.classList.contains('inPlayer') && appState.pages.length) {
      try { await goToPage(0, wasPlaying); }
      catch {}
    }
  }

  async function resetSeriesAndRestart() {
    if (!appState.book) return;
    const sid = appState.book.seriesId;
    const ok = window.confirm('Reset this series? This clears resume points for all volumes in the series and resets series settings.');
    if (!ok) return;

    // Clear progress for all books in this series (if we know them).
    const books = sid ? (appState.library.books || []).filter(b => b.seriesId === sid) : [];
    for (const b of books) {
      try { await Tanko.api.progress.clear(b.id); } catch {}
      if (appState.progressAll) delete appState.progressAll[b.id];
    }

    // Reset series settings to defaults.
    if (sid) {
      try { await Tanko.api.seriesSettings.clear(sid); } catch {}
    }
    appState.settings = { ...DEFAULTS };
    syncSettingsUi();

    // Restart current volume at the beginning.
    const wasPlaying = !!appState.playing;
    if (document.body.classList.contains('inPlayer') && appState.pages.length) {
      try { await goToPage(0, wasPlaying); }
      catch {}
    }

    toast('Series reset');
  }
  function markSpeedCustom() {
    // Legacy helper: keep the (now-hidden) speed chip highlight snapped to the nearest level.
    const lvl = scrollSpeedLevelFromPx(appState.settings.scrollPxPerSec);
    setSpeedActive(lvl);
  }

  function adjustPauseHold(delta) {
    const cur = Number(appState.settings.topHoldSec || 0);
    const next = clamp(cur + delta, 0, 1.8);
    appState.settings.topHoldSec = next;
    appState.settings.bottomHoldSec = next;
    markSpeedCustom();
    scheduleProgressSave();
    toast(`Pause hold: ${next.toFixed(2)}s`);
  }

  // Build 38C: continuous scroll speed nudges (px/s) via comma/period.
  // Applies only in Auto Scroll; Manual Scroll ignores comma/period.
  const SCROLL_PX_PER_SEC_MIN = 5;
  const SCROLL_PX_PER_SEC_MAX = 5000;

  function getCanvasHeightPx() {
    let viewportH = 0;
    try {
      viewportH = (el.stage && (el.stage.clientHeight || el.stage.getBoundingClientRect().height)) || 0;
    } catch {
      viewportH = 0;
    }
    if (!Number.isFinite(viewportH) || viewportH <= 0) viewportH = window.innerHeight || 0;
    return viewportH;
  }

  function baselinePxPerSecForHud() {
    const h = getCanvasHeightPx();
    if (!Number.isFinite(h) || h <= 0) return NaN;
    const baseSec = readLibAutoScrollBaseSecondsPerScreen();
    const px = h / baseSec;
    if (!Number.isFinite(px) || px <= 0) return NaN;
    return px;
  }

  function formatSpeedHudLabel(pxPerSec) {
    const v = Number(pxPerSec);
    if (!Number.isFinite(v) || v <= 0) return '⏱ —';
    const basePx = baselinePxPerSecForHud();
    if (!Number.isFinite(basePx) || basePx <= 0) return `⏱ ${Math.round(v)} px/s`;

    const pct = Math.max(1, Math.round((v / basePx) * 100));
    return `⏱ ${pct}%`;

  }

  function syncSpeedHudText() {
    if (!el.quickSpeedBtn) return;
    const px = Number(appState?.settings?.scrollPxPerSec || DEFAULTS.scrollPxPerSec);
    el.quickSpeedBtn.textContent = formatSpeedHudLabel(px);
  }

  function adjustScrollSpeed(multiplier) {
    if (!appState?.settings) return;
    const m = Number(multiplier);
    if (!Number.isFinite(m) || m <= 0) return;

    const cur = Number(appState.settings.scrollPxPerSec || DEFAULTS.scrollPxPerSec);
    const curSafe = Number.isFinite(cur) && cur > 0 ? cur : DEFAULTS.scrollPxPerSec;

    let next = curSafe * m;
    next = clamp(next, SCROLL_PX_PER_SEC_MIN, SCROLL_PX_PER_SEC_MAX);

    // Avoid churn if the clamp results in no real change.
    if (Math.abs(next - curSafe) < 0.00001) return;

    appState.settings.scrollPxPerSec = next;
    markSpeedCustom();
    scheduleProgressSave();
    syncSpeedHudText();
    syncSpeedSliderUi();
    toast(formatSpeedHudLabel(next));
  }


  // Build 19: scroll speed slider overlay
  let isSpeedSliderOpen = () => false;
  let openSpeedSlider = () => {};
  let closeSpeedSlider = () => {};

  function initScrollSpeedSlider() {
    if (!el.speedSliderOverlay || !el.speedSliderCard || !el.speedSliderTrack || !el.quickSpeedBtn) return;

    // Build 43B: speed slider overlay is speed-only.

    // Build 38D: continuous log-scale slider controlling scrollPxPerSec.

    const MIN_PX = SCROLL_PX_PER_SEC_MIN;
    const MAX_PX = SCROLL_PX_PER_SEC_MAX;
    const RANGE_RATIO = MAX_PX / MIN_PX;

    const st = {
      dragging: false,
      pointerId: null,
    };

    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    const clampPx = (px) => clamp(Number(px), MIN_PX, MAX_PX);

    const pxFromT = (t) => MIN_PX * Math.pow(RANGE_RATIO, clamp01(t));
    const tFromPx = (px) => {
      const v = clampPx(px);
      if (!Number.isFinite(v) || v <= 0) return 0;
      return clamp01(Math.log(v / MIN_PX) / Math.log(RANGE_RATIO));
    };

    const getCurPx = () => clampPx(appState?.settings?.scrollPxPerSec || DEFAULTS.scrollPxPerSec);

    const updateUiPx = (px) => {
      const v = clampPx(px);
      const t = tFromPx(v);
      const pct = `${Math.round(t * 100)}%`;

      if (el.speedSliderValue) {
        el.speedSliderValue.textContent = `${formatSpeedHudLabel(v)}  ·  ${Math.round(v)} pixels per second`;
      }
      if (el.speedSliderFill) el.speedSliderFill.style.width = pct;
      if (el.speedSliderThumb) el.speedSliderThumb.style.left = pct;

      try {
        el.speedSliderTrack.setAttribute('aria-valuemin', '0');
        el.speedSliderTrack.setAttribute('aria-valuemax', '1');
        el.speedSliderTrack.setAttribute('aria-valuenow', String(t.toFixed(3)));
      } catch {}
    };

    const setPx = (px) => {
      if (!appState?.settings) return;
      const next = clampPx(px);
      const cur = Number(appState.settings.scrollPxPerSec || DEFAULTS.scrollPxPerSec);
      if (Number.isFinite(cur) && Math.abs(cur - next) < 0.00001) {
        updateUiPx(next);
        syncSpeedHudText();
        return;
      }

      appState.settings.scrollPxPerSec = next;
      markSpeedCustom();
      scheduleProgressSave();
      syncSpeedHudText();
      updateUiPx(next);
    };

    const positionCard = () => {
      const r = el.quickSpeedBtn.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top - 10;
      const card = el.speedSliderCard;
      // Clamp broadly so it doesn't jump off-screen in small windows.
      const cx = clamp(x, 120, window.innerWidth - 120);
      const cy = clamp(y, 20, window.innerHeight - 20);
      card.style.left = `${cx}px`;
      card.style.top = `${cy}px`;
    };

    const open = (force) => {
      if (!document.body.classList.contains('inPlayer')) return;
      if (!isAutoLikeControlMode()) return;
      const already = !el.speedSliderOverlay.classList.contains('hidden');
      const wantOpen = (typeof force === 'boolean') ? force : !already;
      if (!wantOpen) { close(true); return; }

      const carry = getOverlayCarryWasPlaying();
      closeOtherOverlays('speed');

      // Pause on open (match Mega Settings / VolNav overlays)
      appState.wasPlayingBeforeSpeedSlider = carry;
      if (appState.playing) pauseLoop();

      // Show first so layout is measurable, then position.
      el.speedSliderOverlay.classList.remove('hidden');
      el.speedSliderOverlay.setAttribute('aria-hidden', 'false');
      updateUiPx(getCurPx());
      positionCard();
      try { hudRefreshAfterUiChange(); } catch {}

      setTimeout(() => { try { el.speedSliderTrack.focus(); } catch {} }, 0);
    };

    const close = (resume) => {
      if (!el.speedSliderOverlay || el.speedSliderOverlay.classList.contains('hidden')) return;
      st.dragging = false;
      st.pointerId = null;

      el.speedSliderOverlay.classList.add('hidden');
      el.speedSliderOverlay.setAttribute('aria-hidden', 'true');
      try { hudRefreshAfterUiChange(); } catch {}

      const shouldResume = (resume !== false) && appState.wasPlayingBeforeSpeedSlider;
      appState.wasPlayingBeforeSpeedSlider = false;
      if (shouldResume) startLoop().catch(()=>{});
    };

    const valueFromPointer = (e) => {
      const rect = el.speedSliderTrack.getBoundingClientRect();
      const t = clamp01((e.clientX - rect.left) / rect.width);
      return pxFromT(t);
    };

    const onPointerDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      el.speedSliderTrack.setPointerCapture?.(e.pointerId);
      st.dragging = true;
      st.pointerId = e.pointerId;
      // Jump-to-position on press
      setPx(valueFromPointer(e));
    };

    const onPointerMove = (e) => {
      if (!st.dragging) return;
      if (st.pointerId !== null && e.pointerId !== st.pointerId) return;
      e.preventDefault();
      setPx(valueFromPointer(e));
    };

    const onPointerUp = (e) => {
      if (!st.dragging) return;
      if (st.pointerId !== null && e.pointerId !== st.pointerId) return;
      e.preventDefault();
      st.dragging = false;
      st.pointerId = null;
    };

    // Click-outside closes
    el.speedSliderOverlay.addEventListener('click', (e) => {
      if (e.target === el.speedSliderOverlay) close(true);
    });
    el.speedSliderCard.addEventListener('click', (e) => e.stopPropagation());

    // Drag handler
    el.speedSliderTrack.addEventListener('pointerdown', onPointerDown);
    el.speedSliderTrack.addEventListener('pointermove', onPointerMove);
    el.speedSliderTrack.addEventListener('pointerup', onPointerUp);
    el.speedSliderTrack.addEventListener('pointercancel', onPointerUp);

    window.addEventListener('resize', () => {
      if (isSpeedSliderOpen()) {
        positionCard();
        updateUiPx(getCurPx());
      }
    });

    // Export a small sync hook so key-driven speed changes can refresh the slider.
    syncSpeedSliderUi = () => {
      try { updateUiPx(getCurPx()); } catch {}
    };

    // Export minimal hooks
    isSpeedSliderOpen = () => !el.speedSliderOverlay.classList.contains('hidden');
    openSpeedSlider = (force) => open(force);
    closeSpeedSlider = (resume) => close(resume);
  }


  function adjustSpreadHold(delta) {
    const cur = Number(appState.settings.spreadHoldSec || 0);
    const next = clamp(cur + delta, 0.5, 20);
    appState.settings.spreadHoldSec = next;
    markSpeedCustom();
    scheduleProgressSave();
    toast(`Spread hold: ${next.toFixed(1)}s`);
  }

  // === HUD / OVERLAYS (must not affect viewport) ===
