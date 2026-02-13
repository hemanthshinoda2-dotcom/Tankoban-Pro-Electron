// Build 9: moved from src/modules/reader_40_hud.js into src/modules/reader/*
// NOTE: Mechanical split. Logic is unchanged.
  // Volume navigator overlay (in-player)
  // -----------------------------
  function isVolNavOpen() {
    return el.volNavOverlay && !el.volNavOverlay.classList.contains('hidden');
  }

  function formatTimeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (!Number.isFinite(diff) || diff < 0) return '';

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < 45 * 1000) return 'just now';
    if (diff < hour) {
      const m = Math.max(1, Math.round(diff / minute));
      return `${m} minute${m === 1 ? '' : 's'} ago`;
    }
    if (diff < day) {
      const h = Math.max(1, Math.round(diff / hour));
      return `${h} hour${h === 1 ? '' : 's'} ago`;
    }
    const d = Math.max(1, Math.round(diff / day));
    return `${d} day${d === 1 ? '' : 's'} ago`;
  }

  function getVolNavBooks() {
    if (!appState.book?.seriesId) return [];
    return sortedBooksInSeries(appState.book.seriesId);
  }

  function setVolNavSelection(idx, opts = {}) {
    const list = (appState.volNavVisibleBooks || []);
    const max = Math.max(0, list.length - 1);
    appState.volNavSel = clamp(idx, 0, max);
    const shouldScroll = (opts && opts.scroll !== false);

    if (!el.volNavList) return;
    el.volNavList.querySelectorAll('.volNavItem').forEach(node => {
      const i = parseInt(node.dataset.idx || '0', 10);
      node.classList.toggle('active', i === appState.volNavSel);
    });

    const active = el.volNavList.querySelector(`.volNavItem[data-idx="${appState.volNavSel}"]`);
    if (shouldScroll && active) active.scrollIntoView({ block: 'nearest' });
  }

  function volNavMatches(book, query) {
    const q = (query || '').trim();
    if (!q) return true;

    if (matchText(book.title, q) || matchText(book.series, q)) return true;

    const qLower = q.toLowerCase();
    const t = String(book.title || '').toLowerCase();
    const qNums = (qLower.match(/\d+/g) || []).map(n => parseInt(n, 10)).filter(n => Number.isFinite(n));

    if (qNums.length) {
      for (const nn of qNums) {
        if (t.includes(String(nn))) return true;
      }
      const m = String(book.title || '').match(/\d+/);
      if (m) {
        const n = parseInt(m[0], 10);
        if (Number.isFinite(n) && qNums.includes(n)) return true;
      }
    }

    // Basic "vol12" style matching
    const qn = normKey(q);
    if (qn && normKey(book.title).includes(qn)) return true;

    return false;
  }

  function renderVolNav() {
    if (!el.volNavOverlay || !el.volNavList) return;
    if (!appState.book?.seriesId) return;

    const all = getVolNavBooks();
    const q = (appState.volNavQuery || '').trim();
    const books = all.filter(b => volNavMatches(b, q));

    appState.volNavVisibleBooks = books;

    const s = (appState.library.series || []).find(x => x.id === appState.book.seriesId);
    if (el.volNavTitle) el.volNavTitle.textContent = s ? `${s.name} · ${all.length} volumes` : 'Volumes';

    el.volNavList.innerHTML = '';

    if (!books.length) {
      const empty = document.createElement('div');
      empty.className = 'muted tiny';
      empty.textContent = 'No matches.';
      el.volNavList.appendChild(empty);
      return;
    }

    // Default selection: keep current volume in view when not searching.
    if (!q) {
      const curIdx = books.findIndex(b => b.id === appState.book.id);
      if (curIdx >= 0) appState.volNavSel = curIdx;
    } else {
      appState.volNavSel = clamp(appState.volNavSel || 0, 0, Math.max(0, books.length - 1));
    }

    let idx = 0;
    for (const b of books) {
      const p = appState.progressAll?.[b.id] || null;
      const isCur = b.id === appState.book.id;

      let meta = '';
      if (p && Number.isFinite(p.pageIndex)) {
        meta = `Continue · page ${p.pageIndex + 1}`;
      }

      const last = p?.updatedAt ? formatTimeAgo(p.updatedAt) : '';

      const rowIdx = idx;

      const row = document.createElement('div');
      row.className = 'volNavItem' + (isCur ? ' current' : '');
      row.dataset.idx = String(rowIdx);
      row.innerHTML = `
        <div class="volNavInfo">
          <div class="volNavMain">${escapeHtml(b.title)}</div>
          <div class="volNavMeta">${escapeHtml(meta)}</div>
        </div>
        <div class="volNavRight">
          ${isCur ? '<span class="volNavPill">Current</span>' : (last ? `<span class="volNavPill">Last read ${escapeHtml(last)}</span>` : '')}
        </div>
      `;

      // NOTE: rowIdx must be captured per-row (avoid loop index closure bugs).
      row.addEventListener('mouseenter', () => setVolNavSelection(rowIdx, { scroll: false }));
      row.addEventListener('click', async (e) => {
        try { e.preventDefault(); } catch {}
        try { e.stopPropagation(); } catch {}
        setVolNavSelection(rowIdx);
        // Use the per-iteration `b` reference so row clicks can't be broken by
        // index/closure mismatches during quick search re-renders.
        await selectVolNavBook(b);
      });

      el.volNavList.appendChild(row);
      idx += 1;
    }

    // Sync highlight and scroll
    requestAnimationFrame(() => setVolNavSelection(appState.volNavSel || 0));
  }

  function openVolNav(force, wasPlayingOverride) {
    if (!document.body.classList.contains('inPlayer')) return;
    if (!appState.book) return;
    if (!el.volNavOverlay) return;

    const open = isVolNavOpen();
    const next = typeof force === 'boolean' ? force : !open;

    if (!next) {
      closeVolNav(true);
      return;
    }

    const carry = getOverlayCarryWasPlaying();
    closeOtherOverlays('volNav');

    // Opening pauses auto-scroll immediately.
    appState.wasPlayingBeforeVolNav = (typeof wasPlayingOverride === 'boolean')
      ? wasPlayingOverride
      : carry;
    if (appState.playing) pauseLoop();

    appState.volNavOpen = true;
    appState.volNavQuery = '';
    appState.volNavSel = 0;

    if (el.volNavSearch) el.volNavSearch.value = '';

    renderVolNav();
    el.volNavOverlay.classList.remove('hidden');
    try { hudRefreshAfterUiChange(); } catch {}

    // Focus search for quick typing.
    setTimeout(() => { try { el.volNavSearch?.focus(); } catch {} }, 0);
  }

  function closeVolNav(resume) {
    if (!el.volNavOverlay) return;
    if (!isVolNavOpen()) return;

    el.volNavOverlay.classList.add('hidden');
    appState.volNavOpen = false;

    const shouldResume = (resume !== false) && appState.wasPlayingBeforeVolNav;
    appState.wasPlayingBeforeVolNav = false;

    if (shouldResume) startLoop().catch(()=>{});
    try { hudRefreshAfterUiChange(); } catch {}
  }

  async function selectVolNavBook(book) {
    if (!book) return;

    // Selecting the current volume should behave like cancel.
    if (appState.book && book.id === appState.book.id) {
      closeVolNav(true);
      return;
    }

    const auto = !!appState.wasPlayingBeforeVolNav;

    // Save current volume progress first.
    try { await saveProgressNowSilent(); } catch {}

    // Close the overlay while we do heavier work.
    closeVolNav(false);

    await openBook(book);
    if (auto) await startLoop();
  }

  // -----------------------------
  // Series prev/next volume buttons (Build 38)
  // -----------------------------
  function getAdjacentBooksInSeries() {
    const b = appState.book;
    const seriesId = b?.seriesId;
    if (!b || !seriesId) return { prev: null, next: null };

    const books = sortedBooksInSeries(seriesId) || [];
    const i = books.findIndex(x => x && x.id === b.id);
    if (i < 0) return { prev: null, next: null };

    return {
      prev: (i > 0) ? books[i - 1] : null,
      next: (i < books.length - 1) ? books[i + 1] : null,
    };
  }

  function syncPrevNextVolButtons() {
    const inPlayer = document.body.classList.contains('inPlayer');
    const inVideoPlayer = document.body.classList.contains('inVideoPlayer');
    if (inVideoPlayer) return;
    const { prev, next } = getAdjacentBooksInSeries();

    if (el.prevVolBtn) {
      const show = inPlayer && !!prev;
      el.prevVolBtn.classList.toggle('hidden', !show);
      el.prevVolBtn.disabled = !show;
      el.prevVolBtn.title = prev ? `Previous volume: ${prev.title}` : 'Previous volume';
    }
    if (el.nextVolBtn) {
      const show = inPlayer && !!next;
      el.nextVolBtn.classList.toggle('hidden', !show);
      el.nextVolBtn.disabled = !show;
      el.nextVolBtn.title = next ? `Next volume: ${next.title}` : 'Next volume';
    }
  }

  async function openAdjacentVolume(dir) {
    const { prev, next } = getAdjacentBooksInSeries();
    const target = (dir < 0) ? prev : next;
    if (!target) {
      playerToast(dir < 0 ? 'No previous volume' : 'No next volume');
      return;
    }

    // Match overlay behavior: avoid leaving popovers open while switching volumes.
    try { closeOtherOverlays(null); } catch {}

    const wasPlaying = !!appState.playing;

    try { if (wasPlaying) pauseLoop(); } catch {}
    try { await saveProgressNowSilent(); } catch {}

    try {
      await openBook(target);
    } finally {
      try { syncPrevNextVolButtons(); } catch {}
    }

    if (wasPlaying) {
      try { await startLoop(); } catch {}
    }
  }

  // -----------------------------
  // Thumbnail warm-up when idle
  // -----------------------------
  let idleTimer = null;
  let warmup = null;

  function warmupVisible(v) {
    if (!el.warmupBar) return;
    el.warmupBar.classList.toggle('hidden', !v);
  }

  function updateWarmupText(text) {
    if (!el.warmupText) return;
    el.warmupText.textContent = text;
  }

  function cancelWarmup(silent=false) {
    if (warmup?.running) {
      warmup.cancel = true;
      warmup.running = false;
    }
    warmupVisible(false);
    if (!silent) toast('Warm-up cancelled');
  }

  el.warmupCancel?.addEventListener('click', () => cancelWarmup(true));

  // BUILD34: volume_nav_overlay is shared across views; provide a safe view resolver so this file
  // does not crash when reader-only helpers are not present (e.g., video shell).

function getThumbWarmupMode(){
  // Build 85: avoid noisy "Generating thumbnails" toasts/overlays unless explicitly enabled.
  // Modes:
  //  - 'off'    : disable warm-up entirely
  //  - 'silent' : generate in background with no overlay/text
  //  - 'show'   : show progress overlay text (previous behavior)
  try {
    const v = String(localStorage.getItem('thumbWarmupMode') || '').trim().toLowerCase();
    if (v === 'off' || v === 'silent' || v === 'show') return v;
  } catch {}
  return 'silent';
}

  function getViewSafe() {
    try {
      if (typeof getView === 'function') return getView();
    } catch {}
    try {
      if (document.body.classList.contains('inVideoMode') || document.body.classList.contains('inVideoPlayer')) return 'player';
    } catch {}
    return 'library';
  }

  function noteActivity() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;

    // Any user activity ends warm-up (idle-only).
    if (warmup?.running) cancelWarmup(true);

    const delay = (getViewSafe() === 'library') ? 9000 : 14000;

    idleTimer = setTimeout(() => {
      maybeStartWarmup().catch(()=>{});
    }, delay);
  }

  // Consider the view and play state when starting warm-up.
  async function maybeStartWarmup() {
    if (warmup?.running) return;

    // Never during playback.
    if (appState.playing) return;

    if (getViewSafe() === 'library') {
      const mode = getThumbWarmupMode();
      if (mode === 'off') return;
      await warmupCovers({ mode });
      return;
    }
  }

  async function warmupCovers({ mode } = {}) {
    const books = (appState.library?.books || []);
    if (!books.length) return;

    // Build a list of missing cover thumbs.
    const missing = [];
    for (const b of books) {
      if (warmup?.cancel) break;
      let has = false;
      try { has = await Tanko.api.thumbs.has(b.id); } catch { has = false; }
      if (!has) missing.push(b);
    }
    if (!missing.length) return;

    warmup = { running: true, cancel: false, kind: 'covers', done: 0, total: missing.length };
    const showUi = (String(mode || '').toLowerCase() === 'show');
    if (showUi) {
      warmupVisible(true);
      updateWarmupText(`Generating thumbnails… (0 / ${warmup.total})`);
    }

    for (const b of missing) {
      if (warmup.cancel) break;
      if (getViewSafe() !== 'library') break;
      // Creates and caches the thumbnail; uses existing code paths.
      try { await getOrCreateThumb(b); } catch {}
      warmup.done++;
      if (String(mode || '').toLowerCase() === 'show') {
        updateWarmupText(`Generating thumbnails… (${warmup.done} / ${warmup.total})`);
      }
      await new Promise(r => setTimeout(r, 35));
    }

    if (String(mode || '').toLowerCase() === 'show') warmupVisible(false);
    warmup.running = false;
  }

  // Track user activity to decide when "idle" begins.
  ['pointerdown', 'wheel', 'keydown', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, noteActivity, { passive: true });
  });

  // Start idle timer after initial load.
  setTimeout(noteActivity, 500);


  // -----------------------------

  // Library Settings (Build 42A)
  // -----------------------------
  const LIB_DEFAULT_AUTO_BASE = 25;
  const LIB_DEFAULT_AUTO_STEP = 15;

  function isLibrarySettingsOpen() {
    return !!el.librarySettingsOverlay && !el.librarySettingsOverlay.classList.contains('hidden');
  }

  function syncLibrarySettingsInputs() {
    if (el.settingsAutoBase) el.settingsAutoBase.value = String(appState.ui.autoScrollBaseSecondsPerScreen ?? LIB_DEFAULT_AUTO_BASE);
    if (el.settingsAutoStep) el.settingsAutoStep.value = String(appState.ui.autoScrollStepPct ?? LIB_DEFAULT_AUTO_STEP);

    if (el.settingsScanIgnore) {
      const arr = Array.isArray(appState.library?.scanIgnore) ? appState.library.scanIgnore : [];
      el.settingsScanIgnore.value = arr.join('\n');
    }
  }

  function openLibrarySettingsOverlay() {
    if (!el.librarySettingsOverlay) return;
    if (document.body.classList.contains('inPlayer')) return;
    syncLibrarySettingsInputs();
    el.librarySettingsOverlay.classList.remove('hidden');
  }

  function closeLibrarySettingsOverlay() {
    if (!el.librarySettingsOverlay) return;
    el.librarySettingsOverlay.classList.add('hidden');
  }

  function readSettingsNumber(inputEl, def, min, max) {
    const raw = parseInt(String(inputEl?.value || ''), 10);
    const v = Number.isFinite(raw) ? raw : def;
    return clamp(v, min, max);
  }

  function persistLibrarySettings(baseSecondsPerScreen, stepPct) {
    try { localStorage.setItem('autoScrollBaseSecondsPerScreen', String(baseSecondsPerScreen)); } catch {}
    try { localStorage.setItem('autoScrollStepPct', String(stepPct)); } catch {}
  }

  async function saveLibrarySettings() {
    const base = readSettingsNumber(el.settingsAutoBase, appState.ui.autoScrollBaseSecondsPerScreen ?? LIB_DEFAULT_AUTO_BASE, 5, 60);
    const step = readSettingsNumber(el.settingsAutoStep, appState.ui.autoScrollStepPct ?? LIB_DEFAULT_AUTO_STEP, 1, 50);
    appState.ui.autoScrollBaseSecondsPerScreen = base;
    appState.ui.autoScrollStepPct = step;
    persistLibrarySettings(base, step);

    // BUILD27: save scan ignore patterns to main process config
    if (typeof Tanko?.api?.library?.setScanIgnore === 'function' && el.settingsScanIgnore) {
      const lines = String(el.settingsScanIgnore.value || '')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
      try {
        const res = await Tanko.api.library.setScanIgnore(lines);
        if (res?.ok && res?.state) appState.library = res.state;
      } catch {}
    }

    syncLibrarySettingsInputs();
    toast('Settings saved');
  }

  function resetLibrarySettings() {
    appState.ui.autoScrollBaseSecondsPerScreen = LIB_DEFAULT_AUTO_BASE;
    appState.ui.autoScrollStepPct = LIB_DEFAULT_AUTO_STEP;
    persistLibrarySettings(LIB_DEFAULT_AUTO_BASE, LIB_DEFAULT_AUTO_STEP);
    syncLibrarySettingsInputs();
    toast('Settings reset');
  }

  // -----------------------------
  // Hidden series manager (Build 45D)
  // -----------------------------
  function isHiddenSeriesOpen() {
    return !!el.hiddenSeriesOverlay && !el.hiddenSeriesOverlay.classList.contains('hidden');
  }

  function closeHiddenSeriesOverlay() {
    if (!el.hiddenSeriesOverlay) return;
    el.hiddenSeriesOverlay.classList.add('hidden');
  }

  function renderHiddenSeriesList() {
    const wrap = el.hiddenSeriesList;
    if (!wrap) return;
    wrap.innerHTML = '';
    const ignored = (appState.library?.ignoredSeries || []);

    if (!ignored.length) {
      const empty = document.createElement('div');
      empty.className = 'muted tiny';
      empty.textContent = 'No hidden series.';
      wrap.appendChild(empty);
      return;
    }

    for (const folderPath of ignored) {
      const row = document.createElement('div');
      row.className = 'hiddenSeriesRow';

      const text = document.createElement('div');
      text.className = 'hiddenSeriesText';

      const name = document.createElement('div');
      name.className = 'hiddenSeriesName';
      name.textContent = (folderPath || '').split(/[\\/]/).filter(Boolean).pop() || folderPath;

      const sub = document.createElement('div');
      sub.className = 'hiddenSeriesPath';
      sub.textContent = folderPath;

      text.appendChild(name);
      text.appendChild(sub);

      const btn = document.createElement('button');
      btn.className = 'btn btn-ghost btn-sm';
      btn.textContent = 'Restore';
      btn.addEventListener('click', async () => {
        const res = await Tanko.api.library.unignoreSeries(folderPath);
        if (res?.ok && res.state) {
          appState.library = res.state;
          appState.progressAll = await Tanko.api.progress.getAll();
          bookById = new Map((appState.library.books || []).map(b => [b.id, b]));
          buildLibraryDerivedCaches();
          renderLibrary();
          renderHiddenSeriesList();
          toast('Restored');
        }
      });

      row.appendChild(text);
      row.appendChild(btn);
      wrap.appendChild(row);
    }
  }

  function openHiddenSeriesOverlay() {
    if (!el.hiddenSeriesOverlay) return;
    if (document.body.classList.contains('inPlayer')) return;
    renderHiddenSeriesList();
    el.hiddenSeriesOverlay.classList.remove('hidden');
  }

  async function confirmClearIgnoreList() {
    return await new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.style.padding = '18px';
      d.style.borderRadius = '14px';
      d.style.border = '1px solid rgba(255,255,255,.14)';
      d.style.background = 'rgba(20,20,20,.98)';
      d.style.color = 'white';
      d.style.maxWidth = '460px';

      d.innerHTML = `
        <div style="font-size:16px; font-weight:700; margin-bottom:8px;">Clear ignore list?</div>
        <div style="font-size:13px; line-height:1.35; opacity:.92; margin-bottom:16px;">
          This will restore all hidden series back into the library scan.
        </div>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button type="button" data-act="cancel" style="padding:8px 12px; border-radius:10px;">Cancel</button>
          <button type="button" data-act="clear" style="padding:8px 12px; border-radius:10px;">Clear</button>
        </div>
      `;

      const finish = (v) => {
        try { d.close(); } catch {}
        try { d.remove(); } catch {}
        resolve(v);
      };

      d.querySelector('[data-act="cancel"]')?.addEventListener('click', () => finish(false));
      d.querySelector('[data-act="clear"]')?.addEventListener('click', () => finish(true));

      document.body.appendChild(d);
      try { d.showModal(); } catch { finish(false); }
    });
  }


// -----------------------------
  // Wire UI
  // -----------------------------
  el.addSeriesBtn.addEventListener('click', async () => {
    showLoading('Adding series folder');
    try {
      const res = await Tanko.api.library.addSeriesFolder();
      if (res?.ok) {
        appState.library = res.state;
        appState.progressAll = await Tanko.api.progress.getAll();
        bookById = new Map((appState.library.books || []).map(b => [b.id, b]));
        buildLibraryDerivedCaches();
        appState.selectedSeriesId = null;
        renderLibrary();
        toast('Series added');
      }
    } finally {
      hideLoading();
    }
  });

  el.addRootBtn?.addEventListener('click', async () => {
    showLoading('Adding root library folder');
    try {
      const res = await Tanko.api.library.addRootFolder();
      if (res?.ok) {
        appState.library = res.state;
        appState.progressAll = await Tanko.api.progress.getAll();
        bookById = new Map((appState.library.books || []).map(b => [b.id, b]));
        buildLibraryDerivedCaches();
        appState.selectedSeriesId = null;
        renderLibrary();
        toast('Root added');
      }
    } finally {
      hideLoading();
    }
  });

  el.openFileBtn?.addEventListener('click', async () => {
    try {
      const res = await Tanko.api.library.openComicFileDialog();
      const book = res?.book || null;
      if (!res?.ok || !book?.path) return;

      // Save current progress before switching.
      try { await saveProgressNowSilent(); } catch {}

      await openBook(book);
    } catch {}
  });
  // Library Settings (Build 42A)
  el.openSettingsBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openLibrarySettingsOverlay();
  });
  el.settingsClose?.addEventListener('click', () => closeLibrarySettingsOverlay());
  el.settingsSave?.addEventListener('click', () => saveLibrarySettings());
  el.settingsReset?.addEventListener('click', () => resetLibrarySettings());
  el.librarySettingsOverlay?.addEventListener('click', (e) => {
    if (e.target === el.librarySettingsOverlay) closeLibrarySettingsOverlay();
  });

  // Hidden series manager (Build 45D)
  el.hiddenSeriesBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openHiddenSeriesOverlay();
  });

  el.hiddenSeriesClose?.addEventListener('click', () => closeHiddenSeriesOverlay());

  el.hiddenSeriesOverlay?.addEventListener('click', (e) => {
    if (e.target === el.hiddenSeriesOverlay) closeHiddenSeriesOverlay();
  });

  el.clearIgnoredBtn?.addEventListener('click', async () => {
    const ok = await confirmClearIgnoreList();
    if (!ok) return;

    const res = await Tanko.api.library.clearIgnoredSeries();
    if (res?.ok && res.state) {
      appState.library = res.state;
      appState.progressAll = await Tanko.api.progress.getAll();
      bookById = new Map((appState.library.books || []).map(b => [b.id, b]));
      buildLibraryDerivedCaches();
      renderLibrary();
      renderHiddenSeriesList();
      toast('Ignore list cleared');
    }
  });

  // Volumes controls
  el.volSort?.addEventListener('change', () => {
    const v = el.volSort.value || 'numerical';
    appState.ui.volSort = v;
    try { localStorage.setItem('volSort', v); } catch {}
    renderVolumes();
  });

  el.volSearch?.addEventListener('input', () => {
    appState.ui.volSearch = el.volSearch.value || '';
    renderVolumes();
  });

  el.clearVolSearch?.addEventListener('click', () => {
    if (el.volSearch) el.volSearch.value = '';
    appState.ui.volSearch = '';
    renderVolumes();
  });

  el.volOpenBtn?.addEventListener('click', () => {
    const id = appState.ui.volSelBookId;
    const b = id ? bookById.get(id) : null;
    if (b) openBook(b);
  });

  el.volHidePreviewToggle?.addEventListener('change', () => {
    appState.ui.volHidePreview = !!el.volHidePreviewToggle.checked;
    try { localStorage.setItem('volHidePreview', appState.ui.volHidePreview ? '1' : '0'); } catch {}
    el.volumesWrap?.classList.toggle('previewHidden', !!appState.ui.volHidePreview);
  });

  // BUILD40_VIDEO_MODE_DETECT: volume_nav_overlay is shared across Comics + Videos;
  // detect the current app mode safely without relying on reader-only state.
  function isVideoTopBarMode() {
    try { if (typeof appState !== 'undefined' && appState && appState.mode === 'videos') return true; } catch {}
    try { return document.body.classList.contains('inVideoMode') || document.body.classList.contains('inVideoPlayer'); } catch {}
    return false;
  }

  // Continue controls
  el.hideFinishedToggle?.addEventListener('change', () => {
    appState.ui.hideFinished = !!el.hideFinishedToggle.checked;
    try { localStorage.setItem('hideFinished', appState.ui.hideFinished ? '1' : '0'); } catch {}
    renderContinue();
  });

  el.clearContinueBtn?.addEventListener('click', async () => {
    const isVideo = isVideoTopBarMode();
    const msg = isVideo
      ? 'Clear all Continue items for videos? This will remove saved resume points.'
      : 'Clear all Continue items? This will remove saved resume points.';
    const ok = window.confirm(msg);
    if (!ok) return;

    if (isVideo) {
      await Tanko.api.videoProgress.clearAll();
      try { window.videoApp?.setAllProgress?.({}); } catch {}
      toast('Continue cleared');
      return;
    }

    await Tanko.api.progress.clearAll();
    appState.progressAll = {};
    renderLibrary();
    toast('Continue cleared');
  });

  // Global search (series + volumes)
  // BUILD16B_SEARCH_DEBOUNCE: Avoid recomputing results on every keystroke in large libraries.
  let globalSearchInputTimer = 0;

  function callGlobalSearchRender() {
    if (isVideoTopBarMode()) {
      try { window.videoApp?.renderGlobalSearchResults?.(); } catch {}
      return;
    }
    try { renderGlobalSearchResults(); } catch {}
  }

  function callGlobalSearchHide() {
    if (isVideoTopBarMode()) {
      try { window.videoApp?.hideGlobalSearchResults?.(); } catch {}
      return;
    }
    try { hideGlobalSearchResults(); } catch {}
  }

  function callGlobalSearchSetSelection(idx) {
    if (isVideoTopBarMode()) {
      try { window.videoApp?.setGlobalSearchSelection?.(idx); } catch {}
      return;
    }
    try { setGlobalSearchSelection(idx); } catch {}
  }

  function callGlobalSearchActivateSelection() {
    if (isVideoTopBarMode()) {
      try { window.videoApp?.activateGlobalSearchSelection?.(); } catch {}
      return;
    }
    try { activateGlobalSearchSelection(); } catch {}
  }

  el.globalSearch?.addEventListener('input', () => {
    appState.ui.globalSearchSel = 0;
    if (globalSearchInputTimer) clearTimeout(globalSearchInputTimer);
    globalSearchInputTimer = setTimeout(() => {
      globalSearchInputTimer = 0;
      callGlobalSearchRender();
    }, 70);
  });

  el.globalSearch?.addEventListener('keydown', (e) => {
    const key = e.key;
    if (key === 'ArrowDown') {
      e.preventDefault(); e.stopPropagation();
      callGlobalSearchRender();
      callGlobalSearchSetSelection((appState.ui.globalSearchSel || 0) + 1);
    } else if (key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      callGlobalSearchRender();
      callGlobalSearchSetSelection((appState.ui.globalSearchSel || 0) - 1);
    } else if (key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      callGlobalSearchActivateSelection();
    } else if (key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (el.globalSearch) el.globalSearch.value = '';
      appState.ui.globalSearch = '';
      callGlobalSearchHide();
      el.globalSearch?.blur();
    }
  });

  // Click outside closes search results
  window.addEventListener('mousedown', (e) => {
    if (!el.globalSearchResults || el.globalSearchResults.classList.contains('hidden')) return;
    const t = e.target;
    if (t === el.globalSearch) return;
    if (el.globalSearchResults.contains(t)) return;
    callGlobalSearchHide();
  });

  // Keys overlay
  el.keysClose?.addEventListener('click', () => toggleKeysOverlay(false));
  el.keysOverlay?.addEventListener('click', (e) => {
    if (e.target === el.keysOverlay) toggleKeysOverlay(false);
  });

  // Manga library tips overlay
  el.mangaLibTipsClose?.addEventListener('click', () => toggleMangaLibTipsOverlay(false));
  el.mangaLibTipsOverlay?.addEventListener('click', (e) => {
    if (e.target === el.mangaLibTipsOverlay) toggleMangaLibTipsOverlay(false);
  });

  // Build 8: quick settings row
  el.quickSpeedBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Build 19: scroll speed slider overlay
    if (!isAutoLikeControlMode()) return;
    openSpeedSlider();
  });

  // Build 35: visible mode toggle (matches Key M)
  el.quickModeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!document.body.classList.contains('inPlayer')) return;
    openModeMenu(el.quickModeBtn);
  });

  el.quickScrollBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await toggleScrollMode();
  });

  el.quickWidthBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!appState?.settings) return;
    // BUILD39_PORTRAIT_WIDTH_PRESETS (Build 39)
    // Keep the quick-cycler in sync with the visible portrait width chips.
    const allow = [50, 60, 70, 74, 78, 90, 100];
    const cur = Number(appState.settings.portraitWidthPct || 100);
    const idx = allow.indexOf(cur);
    const next = allow[(idx + 1 + allow.length) % allow.length];
    await applyPortraitWidthPct(next);
  });

  el.quickSpreadsBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleSpreadFitMode();
  });

  el.quickKeysBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleKeysOverlay(true);
  });

  el.twoPageScrollRowGapInput?.addEventListener('input', (e) => {
    if (!appState?.settings) return;
    const v = clampTwoPageScrollRowGapPx(el.twoPageScrollRowGapInput.value);
    appState.settings.twoPageScrollRowGapPx = v;
    el.twoPageScrollRowGapInput.value = String(v);
    scheduleProgressSave();
    if (document.body.classList.contains('inPlayer') && isTwoPageScrollMode()) {
      scheduleTwoPageScrollRedraw();
    }
  });


  // Build 15: progress actions on scrub bar
  el.quickClearResumeBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await clearResumeAndRestart();
  });

  el.quickResetSeriesBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await resetSeriesAndRestart();
  });

  // Mega Settings overlay (Build 6A)
  // Build 15: removed gear button (settings are on the scrub bar).
  //
  // BUILD 7: Build 23-style minimalist HUD entry point.
  // Why: we hide the always-on quick row for cleanliness, so the player needs a
  // single obvious preferences launcher that does not touch the reader engine.
  el.prefsCornerBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    appState.megaOpenMode = 'corner';
    openMegaSettings(true);
    // Build 31: Preferences/Tools opens the same Tools surface as reader right-click.
    openMegaSub('tools');
  });

  // Close the Mega Settings overlay by tapping/clicking the dark backdrop.
  // This mirrors Build 23 and is UI-only (it does not affect reading logic).
  el.megaSettingsOverlay?.addEventListener('pointerdown', (e) => {
    if (e.target !== el.megaSettingsOverlay) return;
    e.preventDefault();
    closeMegaSettings(true);
  });
  // Prevent backdrop-close when the pointerdown begins inside the settings panel.
  el.megaSettingsPanel?.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.megaBackBtn?.addEventListener('click', () => megaNavBack());

  el.megaRowSpeed?.addEventListener('click', () => openMegaSub('speed'));
  // BUILD 7: control mode selector lives in Mega Settings for the minimalist HUD.
  // We reuse the existing dropdown menu pattern (modeMenu) instead of inventing a new UI.
  el.megaRowMode?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openModeMenu(el.megaRowMode);
  });

  el.megaRowAutoFlip?.addEventListener('click', () => openMegaSub('autoflip'));

  // BUILD8_IMAGE_FIT_TOGGLE: Image Fit selector (Fit Height / Fit Width) for Double Page flick modes.
  // We keep this compact and only show it when it is meaningful.
  el.megaRowImageFit?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openImageFitMenu(el.megaRowImageFit);
  });
el.megaRowScroll?.addEventListener('click', () => openMegaSub('scroll'));
  el.megaRowWidth?.addEventListener('click', () => openMegaSub('width'));
  el.megaRowSpreads?.addEventListener('click', () => openMegaSub('spreads'));
  el.megaRowTools?.addEventListener('click', () => openMegaSub('tools'));
  el.megaRowProgress?.addEventListener('click', () => openMegaSub('progress'));

  // Volume navigator overlay
  el.volNavBtn?.addEventListener('click', () => openVolNav());

  // Build 35: scrub-bar quick actions (minimal symbols)
  el.scrubModeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { openModeMenu(el.scrubModeBtn); } catch {}
  });
  el.scrubNavBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openVolNav();
  });
  el.scrubFitBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { openImageFitMenu(el.scrubFitBtn); } catch {}
  });
  el.scrubWidthBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      openMegaSettings(true);
      openMegaSub('width');
    } catch {}
  });
  el.volNavClose?.addEventListener('click', () => closeVolNav(true));
  el.volNavOverlay?.addEventListener('click', (e) => {
    if (e.target === el.volNavOverlay) closeVolNav(true);
  });
  el.volNavSearch?.addEventListener('input', () => {
    appState.volNavQuery = el.volNavSearch.value || '';
    renderVolNav();
  });
  el.volNavSearch?.addEventListener('keydown', async (e) => {
    const key = e.key;
    if (key === 'ArrowDown') {
      e.preventDefault(); e.stopPropagation();
      setVolNavSelection((appState.volNavSel || 0) + 1);
    } else if (key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      setVolNavSelection((appState.volNavSel || 0) - 1);
    } else if (key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      const b = (appState.volNavVisibleBooks || [])[appState.volNavSel || 0];
      await selectVolNavBook(b);
    } else if (key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      closeVolNav(true);
    }
  });


  // Build 7: shell bindings moved to src/modules/shell_bindings.js


  el.backBtn.addEventListener('click', async () => {
    // Stop motion immediately, then flush saves.
    pauseLoop();
    stopLoop();
    await saveProgressNowSilent();
    clearCachedBmp();
    hideEndOverlay();
    setView('library');
    toast('Library');
  });

  el.prevBtn.addEventListener('click', async () => {
    if (!appState.pages.length) return;
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
  el.nextBtn.addEventListener('click', async () => {
    if (!appState.pages.length) return;
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
  });
  el.playBtn.addEventListener('click', async () => {
    await userTogglePlayPause();
  });
  el.clearResumeBtn.addEventListener('click', clearResumeAndRestart);
if (el.resetSeriesBtn) el.resetSeriesBtn.addEventListener('click', () => resetSeriesAndRestart());
  if (el.prevVolBtn) {
    el.prevVolBtn.addEventListener('click', async (e) => {
      try { e.preventDefault(); } catch {}
      try { e.stopPropagation(); } catch {}
      await openAdjacentVolume(-1);
    });
  }
  if (el.nextVolBtn) {
    el.nextVolBtn.addEventListener('click', async (e) => {
      try { e.preventDefault(); } catch {}
      try { e.stopPropagation(); } catch {}
      await openAdjacentVolume(1);
    });
  }

  // Build 7: player window controls + fullscreen sync moved to src/modules/shell_bindings.js


  // End-of-volume overlay actions
  el.endLibraryBtn.addEventListener('click', () => {
    hideEndOverlay();
    el.backBtn.click();
  });

  el.endReplayBtn.addEventListener('click', async () => {
    const auto = appState.wasPlayingBeforeEnd;
    hideEndOverlay();
    await goToPage(0, auto);
    syncHudPageCounter(true);
  });

  el.endNextVolumeBtn.addEventListener('click', async () => {
    const nextBook = appState.endNextBook;
    const auto = appState.wasPlayingBeforeEnd;
    hideEndOverlay();
    if (!nextBook) return;
    await openBook(nextBook);
    if (auto) await startLoop();
  });

  // Portrait width chips
  document.querySelectorAll('.chip[data-pw]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip[data-pw]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const pw = parseInt(btn.dataset.pw, 10);
      appState.settings.portraitWidthPct = pw;
      el.pwText.textContent = `${pw}%`;
      if (cachedBmp && !cachedSpread) {
        ensureCachedBmp(true).then(() => {
          drawActiveFrame(cachedBmp, false);
          scheduleProgressSave();
        });
      }
    });
  });

  // BUILD 19H_GOTO + IMAGE_FX bindings (Build 19H)
  // INTENT: Hook overlay controls into existing init without altering key maps or scrub behavior.
  el.gotoClose?.addEventListener('click', (e) => { e.preventDefault(); closeGotoOverlay(); });
  el.gotoCancelBtn?.addEventListener('click', (e) => { e.preventDefault(); closeGotoOverlay(); });
  el.gotoGoBtn?.addEventListener('click', (e) => { e.preventDefault(); commitGotoOverlay(); });
  el.gotoInput?.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); commitGotoOverlay(); }
  });

  el.imgFxClose?.addEventListener('click', (e) => { e.preventDefault(); closeImgFxOverlay(); });
  el.imgFxDone?.addEventListener('click', (e) => { e.preventDefault(); closeImgFxOverlay(); });
  // BUILD21_IMGFX_EXT bindings (Build 21)
  // INTENT: Extend existing Image FX overlay without changing any hotkeys or reader behavior.
  el.imgFxReset?.addEventListener('click', (e) => {
    e.preventDefault();
    setImgFxSetting({
      imageBrightnessPct: 100,
      imageContrastPct: 100,
      imageSaturatePct: 100,
      imageSepiaPct: 0,
      imageHueDeg: 0,
      imageInvert: 0,
      imageGrayscale: 0,
    });
  });

  function onImgFxInput() {
    const b = clamp(Number(el.imgFxBrightness?.value || 100), 50, 150);
    const c = clamp(Number(el.imgFxContrast?.value || 100), 50, 150);
    const sat = clamp(Number(el.imgFxSaturate?.value || 100), 0, 200);
    const sep = clamp(Number(el.imgFxSepia?.value || 0), 0, 100);
    const hue = clamp(Number(el.imgFxHue?.value || 0), 0, 360);

    const inv = !!el.imgFxInvert?.checked;
    const gray = !!el.imgFxGrayscale?.checked;

    setImgFxSetting({
      imageBrightnessPct: b,
      imageContrastPct: c,
      imageSaturatePct: sat,
      imageSepiaPct: sep,
      imageHueDeg: hue,
      imageInvert: inv ? 1 : 0,
      imageGrayscale: gray ? 1 : 0,
    });
  }

  el.imgFxBrightness?.addEventListener('input', onImgFxInput);
  el.imgFxContrast?.addEventListener('input', onImgFxInput);
  el.imgFxSaturate?.addEventListener('input', onImgFxInput);
  el.imgFxSepia?.addEventListener('input', onImgFxInput);
  el.imgFxHue?.addEventListener('input', onImgFxInput);
  el.imgFxInvert?.addEventListener('change', onImgFxInput);
  el.imgFxGrayscale?.addEventListener('change', onImgFxInput);

  // BUILD21_SCALE_QUALITY (Build 21)
  function setScaleQuality(q) {
    if (!appState.settings) return;
    // BUILD 25 v2
    // INTENT: Keep one persisted setting. Normalize so legacy/unknown values become a safe 'off'.
    appState.settings.imageScaleQuality = normalizeImageScaleQuality(q); // appState.settings.imageScaleQuality: 'off'|'smooth'|'sharp'|'pixel'
    syncImgFxOverlayUiFromSettings();
    try {
      if (cachedBmp) drawActiveFrame(cachedBmp, cachedSpread);
    } catch {}
    scheduleProgressSave();
  }

  el.imgFxScaleOff?.addEventListener('click', (e) => { e.preventDefault(); setScaleQuality('off'); });
  el.imgFxScaleSmooth?.addEventListener('click', (e) => { e.preventDefault(); setScaleQuality('smooth'); });
  el.imgFxScaleSharp?.addEventListener('click', (e) => { e.preventDefault(); setScaleQuality('sharp'); });
  el.imgFxScalePixel?.addEventListener('click', (e) => { e.preventDefault(); setScaleQuality('pixel'); });

  // BUILD21_IMGFX_PRESETS (Build 21)
  function applyImgFxPreset(name) {
    const presets = {
      none:   { b: 100, c: 100, sat: 100, sep: 0,  hue: 0,   inv: 0, gray: 0 },
      night:  { b: 90,  c: 120, sat: 85,  sep: 0,  hue: 210, inv: 0, gray: 0 },
      soft:   { b: 105, c: 95,  sat: 110, sep: 10, hue: 10,  inv: 0, gray: 0 },
      washfix:{ b: 95,  c: 130, sat: 125, sep: 0,  hue: 0,   inv: 0, gray: 0 },
    };

    const p = presets[name] || presets.none;
    setImgFxSetting({
      imageBrightnessPct: p.b,
      imageContrastPct: p.c,
      imageSaturatePct: p.sat,
      imageSepiaPct: p.sep,
      imageHueDeg: p.hue,
      imageInvert: p.inv,
      imageGrayscale: p.gray,
    });
  }

  try {
    el.imgFxPresets?.querySelectorAll?.('button[data-preset]')?.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        applyImgFxPreset(btn.dataset.preset || 'none');
      });
    });
  } catch {}

  // BUILD 20_LOUPE_ZOOM_BINDINGS (Build 20)
  // INTENT: Make loupe zoom adjustment available without new keybindings.
  el.loupeZoomClose?.addEventListener('click', (e) => { e.preventDefault(); closeLoupeZoomOverlay(); });
  el.loupeZoomDone?.addEventListener('click', (e) => { e.preventDefault(); closeLoupeZoomOverlay(); });
  el.loupeZoomReset?.addEventListener('click', (e) => {
    e.preventDefault();
    setLoupeZoom(2.0);
    setLoupeSize(220);
    syncLoupeZoomOverlayUiFromSettings();
  });
  el.loupeZoomRange?.addEventListener('input', (e) => {
    setLoupeZoom(e.target.value);
  });
  el.loupeSizeRange?.addEventListener('input', (e) => {
    setLoupeSize(e.target.value);
  });

  // BUILD 19H_GOTO (Build 19H)
  // INTENT: Provide precise jump without touching existing scrub/keys.
  // Clicking the scrub bubble is optional UI (was inert) and doesn't change drag behavior.
  el.scrubBubble?.addEventListener('click', (e) => {
    if (!document.body.classList.contains('inPlayer')) return;
    e.preventDefault(); e.stopPropagation();
    openGotoOverlay();
  });

  // Speed preset chips
  document.querySelectorAll('.chip.speed').forEach(btn => {
    btn.addEventListener('click', () => {
      applySpeedPreset(btn.dataset.speed);
    });
  });


  // Speed preset buttons
  document.querySelectorAll('.speedChip').forEach(btn => {
    btn.addEventListener('click', () => applySpeedPreset(btn.dataset.speed || 'normal'));
  });


  // === INPUT / HOTKEYS ===
