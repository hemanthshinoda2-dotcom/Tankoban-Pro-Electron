// Build 9: moved from src/modules/reader_40_hud.js into src/modules/reader/*
// NOTE: Mechanical split. Logic is unchanged.
// Split from the original src/modules/reader.js — HUD section (Build 6, Phase 1)
  // EDIT_ZONE:HUD
  // -----------------------------
  // HUD hide
  // -----------------------------
  
function toggleHud(force) {
  if (!document.body.classList.contains('inPlayer')) return;
  const wasHidden = !!appState.hudHidden;
  const nextHidden = (typeof force === 'boolean') ? force : !wasHidden;

  // Build 41C: Manual Scroll = click-toggled pinned HUD (no auto-hide).
  // Auto Scroll = YouTube/VLC-style auto-hide after inactivity.
  const mode = getControlMode();
  if (mode === 'manual' || isTwoPageFlipMode(mode) || mode === 'autoFlip') {
    if (nextHidden) {
      appState.hudPinned = false;
      setHudHiddenAuto(true);
      hudCancelAutoHide();
    } else {
      appState.hudPinned = true;
      setHudHiddenAuto(false);
      hudCancelAutoHide();
    }
    return;
  }

  // Auto Scroll: keep existing timer-based behavior (do not set hudPinned).
  setHudHiddenAuto(nextHidden);
  if (!nextHidden) hudNoteActivity();
  else hudCancelAutoHide();
}

// -----------------------------
// Build 40: Reader HUD auto-show / auto-hide (YouTube/VLC style)
// - Shows on activity (mousemove/wheel/pointerdown/keydown) in player
// - Hides after inactivity (~3 seconds)
// - Never hides while interacting (scrub drag, manual scroller drag, overlays)
// - When hidden, HUD does not intercept clicks (CSS pointer-events: none)
// -----------------------------
const HUD_INACTIVITY_MS = 3000;

let hudAutoTimer = 0;
let hudHoverScrub = false;
let hudHoverHud = false;

function setHudHiddenAuto(hidden) {
  const next = !!hidden;
  if (!!appState.hudHidden === next) return;
  appState.hudHidden = next;
  document.body.classList.toggle('hudHidden', appState.hudHidden);
}

function hudFreezeActive() {
  if (!document.body.classList.contains('inPlayer')) return false;

  // Do not auto-hide while any overlay or interaction is active.
  if (appState.endOverlayOpen) return true;
  if (appState.manualScrollerDragging) return true;
  if (appState.scrubDragging || (el.scrub && el.scrub.classList.contains('dragging'))) return true;

  if (isKeysOpen()) return true;
  if (isVolNavOpen()) return true;
  if (isMegaOpen()) return true;
  if (isSpeedSliderOpen()) return true;

  // Keep visible while hovering the HUD or scrub area.
  if (hudHoverScrub) return true;
  if (hudHoverHud) return true;

  return false;
}

function hudSyncFreezeClass() {
  const freeze = hudFreezeActive();
  document.body.classList.toggle('hudFreeze', freeze);

  // Build 41E: In Auto Scroll, interactions/overlays must not auto-wake the HUD.
  // Keep the freeze flag correct and stop the hide timer while active.
  if (freeze) hudCancelAutoHide();
  return freeze;
}

function hudCancelAutoHide() {
  if (hudAutoTimer) clearTimeout(hudAutoTimer);
  hudAutoTimer = 0;
}

function hudScheduleAutoHide() {
  if (!document.body.classList.contains('inPlayer')) return;
  // Build 41C: Manual Scroll never auto-hides.
  if (getControlMode() === 'manual' || isTwoPageFlipMode(getControlMode()) || getControlMode() === 'autoFlip') return;
  if (hudFreezeActive()) return;

  hudCancelAutoHide();
  hudAutoTimer = window.setTimeout(() => {
    hudAutoTimer = 0;
    if (!document.body.classList.contains('inPlayer')) return;
    if (hudSyncFreezeClass()) return;
    setHudHiddenAuto(true);
  }, HUD_INACTIVITY_MS);
}

// BUILD 8: Explicit view-change hooks used by core.js.
// This avoids hidden cross-module calls like core -> hudCancelAutoHide directly.
try {
  window.readerHooks = window.readerHooks || {};
  window.readerHooks.onEnterLibrary = () => {
    try { hudCancelAutoHide(); } catch {}
    try { document.body.classList.remove('hudFreeze'); } catch {}
    try { setHudHiddenAuto(false); } catch {}
    try { hudHoverScrub = false; } catch {}
    try { hudHoverHud = false; } catch {}
  };
  window.readerHooks.onEnterPlayer = () => {
    try { hudHoverScrub = false; } catch {}
    try { hudHoverHud = false; } catch {}
    try { recomputeManualScrollerMaxTopCache(); } catch {}
    try { setHudHiddenAuto(false); } catch {}
    try { hudSyncFreezeClass(); } catch {}
    try { hudScheduleAutoHide(); } catch {}
  };
} catch {}

function hudNoteActivity(_e) {
  if (!document.body.classList.contains('inPlayer')) return;

  // Build 41C: Manual Scroll never auto-hides. Keep visible if already shown.
  if (getControlMode() === 'manual' || isTwoPageFlipMode(getControlMode()) || getControlMode() === 'autoFlip') {
    if (appState.hudHidden) setHudHiddenAuto(false);
    hudCancelAutoHide();
    return;
  }

  // Any activity shows HUD.
  if (appState.hudHidden) setHudHiddenAuto(false);

  // If we are interacting, keep visible and do not start the hide timer.
  const freeze = hudSyncFreezeClass();
  if (freeze) return;

  hudScheduleAutoHide();
}

// Call when overlays open/close or when interaction states end, to avoid flicker.
function hudRefreshAfterUiChange() {
  if (!document.body.classList.contains('inPlayer')) return;

  // Build 41C: Manual Scroll does not auto-show the HUD after UI changes.
  if (getControlMode() === 'manual' || isTwoPageFlipMode(getControlMode()) || getControlMode() === 'autoFlip') {
    // Still keep the freeze flag correct.
    try { hudSyncFreezeClass(); } catch {}
    hudCancelAutoHide();
    return;
  }

  // Build 41E: Do not auto-wake the HUD in Auto Scroll just because UI state changed.
  // If the HUD is hidden, keep it hidden.
  if (appState.hudHidden) {
    try { hudSyncFreezeClass(); } catch {}
    hudCancelAutoHide();
    return;
  }

  const freeze = hudSyncFreezeClass();
  if (freeze) return;

  // Restart the inactivity timer from "now".
  setHudHiddenAuto(false);
  hudScheduleAutoHide();
}

async function syncPlayerFullscreenBtn() {
  if (!el.playerFsBtn) return;
  if (!document.body.classList.contains('inPlayer')) return;
  let fs = false;
  try { fs = await Tanko.api.window.isFullscreen(); } catch {}
  el.playerFsBtn.title = fs ? 'Exit fullscreen' : 'Enter fullscreen';
}

async function syncLibraryFullscreenBtn() {
  if (!el.libFsBtn) return;
  if (document.body.classList.contains('inPlayer')) return;
  let fs = false;
  try { fs = await Tanko.api.window.isFullscreen(); } catch {}
  el.libFsBtn.title = fs ? 'Exit fullscreen' : 'Enter fullscreen';
}

  // -----------------------------
  // Keys overlay
  // -----------------------------
  function isTypingTarget(t) {
    const eln = t && (t.tagName || '').toLowerCase();
    if (!eln) return false;
    if (eln === 'input' || eln === 'textarea' || eln === 'select') return true;
    return !!t.isContentEditable;
  }

  function isKeysOpen() {
    return el.keysOverlay && !el.keysOverlay.classList.contains('hidden');
  }

  // Build 23: single-open rule for overlays
  // When opening an overlay, close any others first (without resuming playback).
  // Important: do not change Esc priority handling; this is only for open actions.
  let overlayCascadeClosing = false;
  function getOverlayCarryWasPlaying() {
    return !!appState.playing
      || !!appState.wasPlayingBeforeVolNav
      || !!appState.wasPlayingBeforeSpeedSlider
      || !!appState.wasPlayingBeforeMega
      || !!appState.wasPlayingBeforeKeys;
  }

  function closeOtherOverlays(except) {
    overlayCascadeClosing = true;
    try {
      if (except !== 'keys' && isKeysOpen()) toggleKeysOverlay(false);
      if (except !== 'volNav' && isVolNavOpen()) closeVolNav(false);
      if (except !== 'speed' && isSpeedSliderOpen()) closeSpeedSlider(false);
      if (except !== 'mega' && isMegaOpen()) closeMegaSettings(false);
    } finally {
      overlayCascadeClosing = false;
    }
  }

  function toggleKeysOverlay(force) {
    if (!el.keysOverlay) return;
    const open = isKeysOpen();
    const next = typeof force === 'boolean' ? force : !open;

    if (next) {
      const carry = getOverlayCarryWasPlaying();
      closeOtherOverlays('keys');
      appState.wasPlayingBeforeKeys = carry;
    }

    el.keysOverlay.classList.toggle('hidden', !next);
    if (next) toast('Keys');
    else {
      const shouldResume = !overlayCascadeClosing && appState.wasPlayingBeforeKeys && !appState.playing;
      appState.wasPlayingBeforeKeys = false;
      if (shouldResume) startLoop().catch(()=>{});
    }
    try { hudRefreshAfterUiChange(); } catch {}
  }

  // Manga library tips overlay
  function isMangaLibTipsOpen() {
    return el.mangaLibTipsOverlay && !el.mangaLibTipsOverlay.classList.contains('hidden');
  }

  function toggleMangaLibTipsOverlay(force) {
    if (!el.mangaLibTipsOverlay) return;
    const next = typeof force === 'boolean' ? force : !isMangaLibTipsOpen();
    el.mangaLibTipsOverlay.classList.toggle('hidden', !next);
  }

  


  // -----------------------------
