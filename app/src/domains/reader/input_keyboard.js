// Build 9: moved from src/modules/reader_50_input_and_boot.js into src/modules/reader/*
// NOTE: Mechanical split. Logic is unchanged.
  // Keyboard

  // Track Shift/Ctrl even when other handlers early-return.
  window.addEventListener('keydown', (e) => setModKey(e.code, true), true);
  window.addEventListener('keyup', (e) => setModKey(e.code, false), true);
  window.addEventListener('blur', () => { modKeys.shift = false; modKeys.ctrl = false; }, true);


// PERF_HOTSPOT: resize fires in bursts; repeated synchronous redraws can stall the main thread
// → FIX: rAF-gate resize work so we do at most one redraw per frame (same visuals).
let resizeRaf = 0;
function scheduleMainResizeWork() {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    scheduleContinueGeometry();
    if (cachedBmp) drawActiveFrame(cachedBmp, cachedSpread);
    else updateDebugOverlay();
    syncPlayerFullscreenBtn().catch(()=>{});
    // Build 38D: keep speed readouts consistent when the viewport height changes.
    try { syncSpeedHudText(); } catch {}
    try { syncSpeedSliderUi(); } catch {}
    // Build 28: scrub bubble uses a clamped pixel position; re-sync on resize.
    if (document.body.classList.contains('inPlayer')) { scrubBubbleW = 0; updateScrubber(); }
  });
}

window.addEventListener('resize', () => {
  scheduleMainResizeWork();
});


window.addEventListener('keydown', async (e) => {
    const inPlayer = document.body.classList.contains('inPlayer');
    const inVideoPlayer = document.body.classList.contains('inVideoPlayer');
    if (inVideoPlayer) return;
    const typing = isTypingTarget(e.target);

    // Build 45A: Context menu closes on Escape (highest priority).
    if (isContextMenuOpen() && e.code === 'Escape') {
      e.preventDefault();
      hideContextMenu();
      return;
    }

    // BUILD 19H_OVERLAY_GATES (Build 19H)
    // INTENT: When text inputs/overlays are open, prevent navigation keys from leaking through.
    // This does not change key mapping; it only blocks background actions while modal UI is active.
    if (inPlayer && (isGotoOpen() || isImgFxOpen() || isLoupeZoomOpen())) {
      if (e.code === 'Escape') {
        e.preventDefault();
        if (isGotoOpen()) closeGotoOverlay();
        if (isImgFxOpen()) closeImgFxOverlay();
        if (isLoupeZoomOpen()) closeLoupeZoomOverlay();
        return;
      }
      // Go-to: Enter commits when focus is inside its input.
      if (isGotoOpen() && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
        const t = e.target;
        const inGoto = !!el.gotoOverlay && el.gotoOverlay.contains(t);
        if (inGoto) { e.preventDefault(); commitGotoOverlay(); return; }
      }
      // Block all other shortcuts while the modal is open.
      e.preventDefault(); e.stopPropagation();
      return;
    }

    // Library Settings overlay takes priority (library only).
    if (!inPlayer && isLibrarySettingsOpen()) {
      const inSettings = !!el.librarySettingsOverlay && el.librarySettingsOverlay.contains(e.target);
      if (e.code === 'Escape') { e.preventDefault(); closeLibrarySettingsOverlay(); return; }
      // Avoid browser/default shortcuts while Settings is open (ex: Ctrl+R).
      if (inSettings && (e.ctrlKey || e.metaKey || e.altKey)) { e.preventDefault(); e.stopPropagation(); return; }
      // Block background/library shortcuts while Settings is open.
      if (!inSettings) { e.preventDefault(); e.stopPropagation(); }
      return;
    }

    // Hidden series overlay takes priority (library only).
    if (!inPlayer && isHiddenSeriesOpen()) {
      const inHidden = !!el.hiddenSeriesOverlay && el.hiddenSeriesOverlay.contains(e.target);
      if (e.code === 'Escape') { e.preventDefault(); closeHiddenSeriesOverlay(); return; }
      // Avoid browser/default shortcuts while open (ex: Ctrl+R).
      if (inHidden && (e.ctrlKey || e.metaKey || e.altKey)) { e.preventDefault(); e.stopPropagation(); return; }
      // Block background/library shortcuts while open.
      if (!inHidden) { e.preventDefault(); e.stopPropagation(); }
      return;
    }

    // Keys overlay takes priority
    if (!typing) {
      if (e.code === 'KeyK') { e.preventDefault(); toggleKeysOverlay(); return; }
    }
    if (isKeysOpen()) {
      if (e.code === 'Escape') { e.preventDefault(); toggleKeysOverlay(false); return; }
      // Swallow other keys while the overlay is open to avoid accidental actions.
      return;
    }

    // Volume navigator overlay takes priority
    if (isVolNavOpen()) {
      if (e.code === 'Escape' || e.code === 'KeyO') { e.preventDefault(); closeVolNav(true); return; }
      if (e.code === 'Enter') { e.preventDefault(); await selectVolNavBook((appState.volNavVisibleBooks || [])[appState.volNavSel || 0]); return; }
      if (e.code === 'ArrowDown') { e.preventDefault(); setVolNavSelection((appState.volNavSel || 0) + 1); return; }
      if (e.code === 'ArrowUp') { e.preventDefault(); setVolNavSelection((appState.volNavSel || 0) - 1); return; }
      // Swallow other keys while open
      return;
    }

    // Scroll speed slider overlay takes priority
    if (isSpeedSliderOpen()) {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSpeedSlider(true); return; }
      // Swallow other keys while open to avoid accidental actions.
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Mega Settings overlay takes priority
    if (isMegaOpen()) {
      const inSub = !!el.megaSubPanel && !el.megaSubPanel.classList.contains('hidden');
      const host = inSub ? el.megaSubPanel : el.megaMainPanel;
      const sel = inSub ? 'button.megaOption' : 'button.megaRow';
      const btns = Array.from(host?.querySelectorAll(sel) || [])
        .filter((b) => b && !b.disabled && b.offsetParent !== null && !b.classList.contains('hidden'));

      const active = document.activeElement;
      const idx = btns.indexOf(active);
      const wrap = (i) => (btns.length ? ((i % btns.length) + btns.length) % btns.length : 0);
      const focusAt = (i) => { try { btns[wrap(i)]?.focus(); } catch {} };
      const clickActive = () => {
        const b = (active && active.tagName === 'BUTTON') ? active : (btns[0] || null);
        try { b?.click(); } catch {}
      };

      if (e.code === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        closeMegaSettings(true);
        return;
      }
      if (e.code === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); focusAt((idx >= 0 ? idx : 0) + 1); return; }
      if (e.code === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); focusAt((idx >= 0 ? idx : 0) - 1); return; }
      if (e.code === 'Home') { e.preventDefault(); e.stopPropagation(); focusAt(0); return; }
      if (e.code === 'End') { e.preventDefault(); e.stopPropagation(); focusAt(btns.length - 1); return; }
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault(); e.stopPropagation();
        clickActive();
        return;
      }
      if (e.code === 'ArrowLeft' || e.code === 'Backspace') {
        e.preventDefault(); e.stopPropagation();
        if (inSub && Array.isArray(appState.megaNavStack) && appState.megaNavStack.length) megaNavBack();
        else closeMegaSettings(true);
        return;
      }

      // Swallow other keys while the menu is open to avoid accidental actions.
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Global
    if (e.ctrlKey && e.code === 'KeyM') { e.preventDefault(); Tanko.api.window.minimize(); return; }
    if (e.ctrlKey && e.code === 'KeyQ') { e.preventDefault(); Tanko.api.window.close(); return; }
    if (e.ctrlKey && e.code === 'KeyR') {
      e.preventDefault();
      try { await Tanko.api.library.scan({ force: true }); } catch {}
      refreshLibrary();
      return;
    }
    if (e.ctrlKey && (e.code === 'Digit0' || e.code === 'Numpad0')) { e.preventDefault(); resetToDefaults(); return; }
    // Fullscreen toggles
    if (e.code === 'F11') { e.preventDefault(); try { await Tanko.api.window.toggleFullscreen(); } catch {} return; }
    // Build 17: fix library fullscreen hotkey (F)
    if (e.code === 'KeyF' && (inPlayer || (!inPlayer && !typing))) { e.preventDefault(); try { await Tanko.api.window.toggleFullscreen(); } catch {} return; }

    // Escape: overlays are handled above. If none are open, Manual Scroll uses Escape to
    // hide/unpin the HUD. Otherwise, keep the existing fullscreen-exit behavior.
    if (e.code === 'Escape') {
      if (inPlayer && (getControlMode() === 'manual' || isTwoPageFlipMode(getControlMode()) || getControlMode() === 'autoFlip') && !appState.hudHidden) {
        e.preventDefault();
        appState.hudPinned = false;
        setHudHiddenAuto(true);
        hudCancelAutoHide();
        return;
      }

      const fs = await Tanko.api.window.isFullscreen();
      if (fs) { e.preventDefault(); try { await Tanko.api.window.toggleFullscreen(); } catch {} }
      return;
    }

    // If the user is typing in a search box or input, do not hijack keys like Backspace/Arrows.
    if (typing) return;

    // Library-specific
    if (!inPlayer) {
      if (e.code === 'KeyA') { e.preventDefault(); el.addSeriesBtn.click(); return; }
      if (e.code === 'Backspace') {
        if (appState.selectedSeriesId) {
          e.preventDefault();
          appState.selectedSeriesId = null;
          renderLibrary();
          toast('Series');
        }
        return;
      }
      return;
    }

    // Player-specific
    if (appState.endOverlayOpen) {
      // While the end overlay is open, keep controls simple and predictable.
      if (e.code === 'Backspace') { e.preventDefault(); el.endLibraryBtn.click(); return; }
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight' || e.code === 'PageDown') {
        e.preventDefault();
        if (appState.endNextBook) el.endNextVolumeBtn.click();
        else el.endReplayBtn.click();
        return;
      }
      return;
    }

    if (e.code === 'Backspace') { e.preventDefault(); el.backBtn.click(); return; }
    if (e.code === 'KeyH') { e.preventDefault(); toggleHud(); return; }
    if (e.code === 'KeyO') { e.preventDefault(); openVolNav(true); return; }
// Build 14: spreads are inline; no spread fit/fill toggle.
    // Build 14: one-mode reader; no scroll mode toggle.
    if (e.code === 'KeyZ') {
      e.preventDefault();
      playerToast('Replay');
      await instantReplay();
      return;
    }

    // Build 34/35: toggle Manual Scroll vs Auto Scroll control mode
    if (e.code === 'KeyM') {
      e.preventDefault();
      toggleControlMode({ toast: true });
      return;
    }
    // BUILD16A_TWO_PAGE_NAV_FLIP_TOGGLE:
    // INTENT: Two-page flick modes intentionally enforce Right=NEXT / Left=PREVIOUS for predictable muscle memory.
    // Some volumes are left-to-right, so this opt-in toggle flips the zones/arrow mapping without touching pairing or rendering.
    if (e.code === 'KeyI') {
      const cm0 = getControlMode();
      if (isTwoPageFlipMode(cm0)) {
        e.preventDefault();
        twoPageMangaPlusNextOnLeft = !twoPageMangaPlusNextOnLeft;

        // Keep the existing MangaPlus phrasing, but clarify when the standard Two-Page flick mode is active.
        const modeLabel = (cm0 === 'twoPageMangaPlus') ? 'MangaPlus' : 'Two-Page';
        playerToast(twoPageMangaPlusNextOnLeft ? `${modeLabel}: Left→Next` : `${modeLabel}: Right→Next`);
        return;
      }
    }

    // BUILD18_COUPLING_NUDGE_TOGGLE:
    // Press P to shift the two-page coupling by one page when pairing drifts mid-volume.
    if (e.code === 'KeyP') {
      const cm0 = getControlMode();
      if (isTwoPageFlipMode(cm0) || cm0 === 'autoFlip' || cm0 === 'twoPageScroll') {
        e.preventDefault();

        const prev = (appState.settings?.twoPageCouplingNudge ? 1 : 0);
        const next = prev ? 0 : 1;

        // Remember the current view so the toggle “overlaps” what you’re reading.
        const pair0 = (cm0 === 'twoPageScroll') ? null : getTwoPagePair(appState.pageIndex);
        const right0 = Number(pair0?.rightIndex);

        if (appState.settings) appState.settings.twoPageCouplingNudge = next;
        playerToast(next ? 'Coupling: shifted' : 'Coupling: normal');

        if (cm0 === 'twoPageScroll') {
          // Rebuild stacked layout under the new parity; keep entry-sync behavior safe.
          twoPageScrollRowsKey = '';
          twoPageScrollRows = [];
          twoPageScrollTotalHeightDevPx = 0;
          twoPageScrollLastRowIdx = 0;
          twoPageScrollRowsBuilding = false;
          twoPageScrollPendingScrollProgress01 = null;
          twoPageScrollHoldSingleRowUntilSync = true;
          twoPageScrollPendingSyncIndex = appState.pageIndex;
          ++twoPageScrollRowsBuildToken;
          scheduleTwoPageScrollRedraw();
        } else {
          // Flip/AutoFlip: shift by ±1 so the alternate pairing overlaps the current page.
          const n = appState.pages.length || 0;
          if (n && Number.isFinite(right0) && right0 > 0) {
            const delta = next ? -1 : 1;
            const target = clamp(right0 + delta, 1, n - 1);
            await goToPage(target, appState.playing, false);
          } else {
            try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
          }
        }

        scheduleProgressSave();
        return;
      }
    }
    // BUILD23_LOUPE_KEY_TOGGLE (Build 23)
    // INTENT: Keep this handler after overlay + typing gates so L never steals focus from inputs,
    // and never fires while modal overlays (Keys/Settings/filters) temporarily own the keyboard.
    if (e.code === 'KeyL') {
      // No-op unless the player has a loaded page list; avoids toggling a Heads Up Display feature on an empty stage.
      if (!appState.settings || !appState.pages?.length) return;
      e.preventDefault();
      appState.settings.loupeEnabled = !appState.settings.loupeEnabled;
      syncLoupeEnabled();
      scheduleProgressSave();
      playerToast(appState.settings.loupeEnabled ? 'Loupe on' : 'Loupe off');
      return;
    }


    // BUILD44_MANGAPLUS_ZOOM_KEYMAP:
    // When MangaPlus zoom is active: arrows pan (X/Y), Space flips spreads (Shift+Space = back).
    {
      const cm = getControlMode();
      const zoomPctRaw = (cm === 'twoPageMangaPlus')
        ? Number(appState.settings?.twoPageMangaPlusZoomPct ?? 100)
        : 100;
      const zoomPct = clamp(Number.isFinite(zoomPctRaw) ? zoomPctRaw : 100, 100, 260);
      const zoomed = (cm === 'twoPageMangaPlus' && zoomPct > 100);

      if (zoomed && document.body.classList.contains('inPlayer')) {
        const dpr = window.devicePixelRatio || 1;
        const stepDev = Math.round(160 * dpr);

        if (e.code === 'Space') {
          e.preventDefault();
          if (e.shiftKey) await prevTwoPage();
          else await nextTwoPage();
          return;
        }
        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
          const dpr2 = window.devicePixelRatio || 1;
          const eps = Math.max(1, Math.round(2 * dpr2));

          const hasX = Number.isFinite(twoPageFlickPanMaxX) && twoPageFlickPanMaxX > 0;
          const hasY = Number.isFinite(twoPageFlickPanMax) && twoPageFlickPanMax > 0;

          // Next direction follows the MangaPlus inversion toggle.
          const nextKey = twoPageMangaPlusNextOnLeft ? 'ArrowLeft' : 'ArrowRight';
          const atBottom = (!hasY) || (twoPageFlickPanY >= (twoPageFlickPanMax - eps));

          // "End corner" means: bottom + the edge you would reach when progressing in reading direction.
          const atNextEdge = (!hasX)
            ? true
            : (twoPageMangaPlusNextOnLeft
                ? (twoPageFlickPanX <= eps)
                : (twoPageFlickPanX >= (twoPageFlickPanMaxX - eps)));

          // Flip only when you're at the bottom-end corner.
          if (e.code === nextKey && atBottom && atNextEdge) {
            e.preventDefault();
            await nextTwoPage();
            return;
          }

          // Otherwise: pan (and swallow the event so arrows don't flip pages early).
          if (hasX) {
            e.preventDefault();
            const dir = (e.code === 'ArrowRight') ? 1 : -1;
            const prev = twoPageFlickPanX;
            twoPageFlickPanX = clamp(twoPageFlickPanX + dir * stepDev, 0, twoPageFlickPanMaxX);
            if (twoPageFlickPanX !== prev && cachedBmp) {
              try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
            }
            return;
          }

          // No horizontal overflow: swallow arrows (Space is the primary flip key).
          e.preventDefault();
          return;
        }

        if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
          if (Number.isFinite(twoPageFlickPanMax) && twoPageFlickPanMax > 0) {
            e.preventDefault();
            const dir = (e.code === 'ArrowDown') ? 1 : -1;
            const prev = twoPageFlickPanY;
            twoPageFlickPanY = clamp(twoPageFlickPanY + dir * stepDev, 0, twoPageFlickPanMax);
            if (twoPageFlickPanY !== prev && cachedBmp) {
              try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
            }
            return;
          }
        }
      }
    }


    // FIND_THIS:TWO_PAGE_NAV_KEYS (Build 47A4)
    {
      const cm = getControlMode();
      if (isTwoPageFlipMode(cm)) {
        // BUILD10_DBLPAGE_NAV_ENFORCE: In both Double Page flick modes, ArrowRight is always NEXT and ArrowLeft is always PREVIOUS.
        // Reading direction (if present) is layout-only and must not invert navigation direction.
        // BUILD16A_MANGAPLUS_NAV_FLIP: In two-page flick modes, KeyI can invert ArrowLeft/ArrowRight; default remains ArrowRight=NEXT.
        const flipped = isTwoPageFlipMode(cm) && !!twoPageMangaPlusNextOnLeft;

        if (!flipped) {
          if (e.code === 'ArrowLeft') { e.preventDefault(); await prevTwoPage(); return; }
          if (e.code === 'ArrowRight') { e.preventDefault(); await nextTwoPage(); return; }
        } else {
          if (e.code === 'ArrowLeft') { e.preventDefault(); await nextTwoPage(); return; }
          if (e.code === 'ArrowRight') { e.preventDefault(); await prevTwoPage(); return; }
        }
      } else if (cm === 'autoFlip') {
        // Preserve Auto Flip's legacy mapping (do not change cadence/feel).
        if (e.code === 'ArrowLeft') { e.preventDefault(); await nextTwoPage(); return; }
        if (e.code === 'ArrowRight') { e.preventDefault(); await prevTwoPage(); return; }
      }
    }


    // Transport
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); el.playBtn.click(); return; }


    // Page navigation
    if (e.code === 'ArrowRight' || e.code === 'PageDown') {
      e.preventDefault();
      const n = appState.pages.length;
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
    if (e.code === 'ArrowLeft' || e.code === 'PageUp') {
      e.preventDefault();
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
    if (e.code === 'Home') {
      e.preventDefault();
      await goToPage(0, appState.playing);
      syncHudPageCounter(true);
      playerToast(`Start • ${pageLabel()}`);
      return;
    }
    if (e.code === 'End') {
      e.preventDefault();
      await goToPage(appState.pages.length - 1, appState.playing);
      syncHudPageCounter(true);
      playerToast(`End • ${pageLabel()}`);
      return;
    }

    // Build 34: Arrow Up / Down scroll smoothly in Manual Scroll (and scroll within the row in Two-Page Scroll).
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      const cm = getControlMode();
      if (cm === 'manual' || cm === 'twoPageScroll') {
        const ch = el.stage.height || 0;
        // BUILD16C_TWOPAGE_SCROLL_KEYS: smaller step in Two-Page Scroll feels smoother.
        const baseFrac = (cm === 'twoPageScroll') ? 0.08 : 0.12;
        const frac = e.shiftKey ? 0.25 : baseFrac;
        const step = Math.max(64, Math.round(ch * frac));
        const dy = (e.code === 'ArrowDown') ? step : -step;
        if (cm === 'manual') queueManualWheelSmooth(dy);
        else queueTwoPageScrollSmooth(dy);
      }

      // BUILD13_PATCH_MANGAPLUS_UPDOWN_PAN: In Double Page (MangaPlus) + Fit Width overflow, ArrowUp/ArrowDown pan vertically.
      // Why this lives here: ArrowUp/ArrowDown are already reserved for vertical navigation in the reader (Manual + Two-Page Scroll).
      // We extend that same "vertical intent" to MangaPlus ONLY when the spread is taller than the viewport, mirroring the wheel-pan path.
      if (cm === 'twoPageMangaPlus') {
        const fit = getTwoPageImageFit(cm);
        const canPan = (fit === 'width') && Number.isFinite(twoPageFlickPanMax) && twoPageFlickPanMax > 0;
        if (canPan) {
          // Match the wheel handler’s coordinate system: device pixels, so HiDPI scaling stays consistent.
          const dpr = window.devicePixelRatio || 1;

          // Fixed per-press step in CSS pixels (128px) keeps behavior predictable and roughly comparable to a typical wheel notch.
          // We avoid acceleration/timers so one keypress always maps to one pan step.
          const stepDev = Math.round( 128 * dpr);
          const dyDev = (e.code === 'ArrowDown') ? stepDev : -stepDev;

          const prevY = twoPageFlickPanY;
          twoPageFlickPanY = clamp(twoPageFlickPanY + dyDev, 0, twoPageFlickPanMax);

          // Redraw immediately so the pan feels responsive; only redraw on actual movement to avoid redundant work.
          if (twoPageFlickPanY != prevY && cachedBmp) {
            try { drawActiveFrame(cachedBmp, cachedSpread); } catch {}
          }
        }
      }

      return;
    }

    // Auto scroll speed tweaks. Disabled in Manual Scroll.
    if (e.code === 'Comma' || e.code === 'Period') {
      e.preventDefault();
      if (isAutoLikeControlMode()) {
        const isComma = (e.code === 'Comma');
        const stepPct = readLibAutoScrollStepPct();
        const step = e.shiftKey ? clamp(stepPct * 2, 1, 50) : stepPct;
        const factor = 1 + (step / 100);
        const mult = isComma ? (1 / factor) : factor;
        adjustScrollSpeed(mult);
      }
      return;
    }

    // Resume / checkpoint
    if (e.code === 'KeyR') { e.preventDefault(); await clearResume(); return; }
    if (e.code === 'KeyS') { e.preventDefault(); await saveProgressNow(); return; }
  });


