// Shell (top bar / window controls) bindings extracted from reader HUD
// Build 7 (Phase 2): keep behavior identical, just relocate wiring.

(function bindShellBindings(){
  if (typeof el === 'undefined') return;

  // Build 8 (UI): Tile density (thumbnail size). Default is Large.
  const applyTileDensity = (density) => {
    const d = (density === 'compact') ? 'compact' : 'comfortable';
    try { document.body.dataset.tileDensity = d; } catch {}
    try { localStorage.setItem('tileDensity', d); } catch {}
    // Button label: keep it simple and visible.
    try {
      if (el.tileDensityBtn) el.tileDensityBtn.textContent = (d === 'compact') ? 'Tiles: Medium' : 'Tiles: Large';
    } catch {}
  };
  const toggleTileDensity = () => {
    const cur = (document.body.dataset.tileDensity || 'comfortable');
    applyTileDensity(cur === 'compact' ? 'comfortable' : 'compact');
  };

  // Initialize from persistence before first render.
  try { applyTileDensity(localStorage.getItem('tileDensity') || 'comfortable'); } catch { applyTileDensity('comfortable'); }

  if (el.tileDensityBtn) {
    el.tileDensityBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleTileDensity();
    });
  }

  // Build 10.5: In Videos mode, the existing "Hidden" top-bar button becomes a thumbnails toggle.
  // We bind in CAPTURE phase and stop propagation so the Comics hidden-series overlay wiring remains untouched.
  if (el.hiddenSeriesBtn) {
    el.hiddenSeriesBtn.addEventListener('click', (e) => {
      try {
        if (!document.body.classList.contains('inVideoMode')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        try { window.videoApp && window.videoApp.toggleThumbs && window.videoApp.toggleThumbs(); } catch {}
        // Keep label in sync even if other code re-renders the top bar.
        try { window.videoApp && window.videoApp.syncThumbsBtn && window.videoApp.syncThumbsBtn(); } catch {}
      } catch {}
    }, true);
  }

  // Build 12: keep the shared top-bar button label correct when switching between Comics/Videos.
  try {
    const mo = new MutationObserver(() => {
      try { window.videoApp && window.videoApp.syncThumbsBtn && window.videoApp.syncThumbsBtn(); } catch {}
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  } catch {}

  // Build 7 (UI): Sidebar -> off-canvas drawer. Keep existing sidebar DOM + buttons, just toggle visibility.
  const setDrawerOpen = (open) => {
    const isOpen = !!open;
    document.body.classList.toggle('libDrawerOpen', isOpen);
    try { if (el.libMenuBtn) el.libMenuBtn.setAttribute('aria-expanded', String(isOpen)); } catch {}
  };

  const toggleDrawer = () => {
    const open = !document.body.classList.contains('libDrawerOpen');
    setDrawerOpen(open);
    if (open) {
      // Focus the first actionable item inside the drawer for keyboard users.
      try {
        const first = document.querySelector('.libSidebar button, .libSidebar [tabindex]');
        first && first.focus && first.focus();
      } catch {}
    }
  };

  if (el.libMenuBtn) {
    el.libMenuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Drawer is only relevant in library/video library views (not during reader/player).
      if (document.body.classList.contains('inPlayer')) return;
      toggleDrawer();
    });
  }

  if (el.libDrawerBackdrop) {
    el.libDrawerBackdrop.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDrawerOpen(false);
    });
  }

  // Escape closes drawer.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.body.classList.contains('libDrawerOpen')) return;
    if (document.body.classList.contains('inPlayer')) return;
    e.preventDefault();
    setDrawerOpen(false);
  });

  // FIX_BATCH5: Added null guard (matching libBackBtn, libFsBtn, playerFsBtn pattern).
  if (el.refreshBtn) {
    el.refreshBtn.addEventListener('click', () => {
      if (document.body.classList.contains('inVideoMode')) {
        try { window.videoApp && window.videoApp.refresh && window.videoApp.refresh(); } catch {}
        return;
      }
      refreshLibrary();
    });
  }

  // BUILD27: cancel running scan
  el.libraryScanCancel?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await Tanko.api.library.cancelScan();
      if (res?.ok) toast('Scan canceled');
    } catch {}
  });

  // Library top toolbar back button (YAC-style shell). Keep behavior identical to the existing back affordance.
  if (el.libBackBtn) {
    el.libBackBtn.addEventListener('click', () => {
      if (document.body.classList.contains('inVideoMode')) {
        try { window.videoApp && window.videoApp.back && window.videoApp.back(); } catch {}
        return;
      }
      if (appState.selectedSeriesId && el.seriesBackBtn) el.seriesBackBtn.click();
    });
  }

  el.minimizeBtn.addEventListener('click', () => Tanko.api.window.minimize());
  if (el.libFsBtn) {
    el.libFsBtn.addEventListener('click', async () => {
      try { await Tanko.api.window.toggleFullscreen(); } catch {}
      try { if (typeof syncLibraryFullscreenBtn === 'function') syncLibraryFullscreenBtn().catch(()=>{}); } catch {}
      try { if (typeof syncPlayerFullscreenBtn === 'function') syncPlayerFullscreenBtn().catch(()=>{}); } catch {}
    });
  }
  el.closeBtn.addEventListener('click', () => Tanko.api.window.close());

  // FIX_BATCH5: Added null guards to prevent IIFE crash cascade if elements are missing.
  if (el.seriesBackBtn) {
    el.seriesBackBtn.addEventListener('click', () => {
      appState.selectedSeriesId = null;
      renderLibrary();
    });
  }

  if (el.playerMinBtn) el.playerMinBtn.addEventListener('click', () => Tanko.api.window.minimize());
  if (el.playerFsBtn) {
    el.playerFsBtn.addEventListener('click', async () => {
      try { await Tanko.api.window.toggleFullscreen(); } catch {}
      // Fullscreen toggles usually trigger a resize, but sync anyway.
      try { if (typeof syncPlayerFullscreenBtn === 'function') syncPlayerFullscreenBtn().catch(()=>{}); } catch {}
    });
  }
  if (el.playerCloseBtn) el.playerCloseBtn.addEventListener('click', () => Tanko.api.window.close());

  // Sync fullscreen button titles at least once on startup.
  try { if (typeof syncPlayerFullscreenBtn === 'function') syncPlayerFullscreenBtn().catch(()=>{}); } catch {}
  try { if (typeof syncLibraryFullscreenBtn === 'function') syncLibraryFullscreenBtn().catch(()=>{}); } catch {}

})();
