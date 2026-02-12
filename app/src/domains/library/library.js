// FIND_THIS:AI_MAP_LIBRARY
/*
================================
AI MAP — src/domains/library/library.js
================================

What lives here:
- Library UI rendering: series grid + volumes list + thumbnails
- Library view switching + selection + search/sort controls

Hot search tokens:
- EDIT_ZONE:LIBRARY_RENDER
- EDIT_ZONE:LIBRARY_VIEW_SWITCH
- function renderLibrary
- function renderSeriesGrid
- function renderVolumes
*/

  // EDIT_ZONE:LIBRARY_RENDER
  // Build 1 — apply truncation utilities to prevent tile/list height shifts.
  // Build 2 — Continue Reading: YAC-style geometry (430px container; 0.65 ratio covers)
  // and subtle hover feel. Purely presentation: behavior/handlers unchanged.

  const continueGeom = { raf: 0, lastListH: 0 };
  function scheduleContinueGeometry() {
    if (continueGeom.raf) return;
    continueGeom.raf = requestAnimationFrame(() => {
      continueGeom.raf = 0;
      const row = el.continueRow;
      if (!row) return;
      const listH = row.clientHeight || 0;
      if (!listH) return;
      // Geometry formula (non-negotiable):
      // coverHeight = list.height - (verticalPadding * 2)
      // coverWidth  = floor(coverHeight * 0.65)
      const verticalPadding = 20;
      const coverH = Math.max(0, listH - (verticalPadding * 2));
      if (coverH === continueGeom.lastListH) return;
      continueGeom.lastListH = coverH;
      const coverW = Math.floor(coverH * 0.65);
      row.style.setProperty('--cont-cover-h', `${coverH}px`);
      row.style.setProperty('--cont-cover-w', `${coverW}px`);
    });
  }

  // FIND_THIS:CONTINUE_TILE_CONTEXT_MENU (Build 45E)
  function openContinueTileContextMenu(e, b, p) {
    e.preventDefault();
    e.stopPropagation();

    // Label depends on current state.
    const isFinished = !!p?.finished;
    const toggleLabel = isFinished ? 'Mark in progress' : 'Mark finished';

    // Find the series folder path for “Remove from library…”
    const seriesObj = (appState.library?.series || []).find(s => s.id === b.seriesId);
    const seriesPath = seriesObj?.path || null;

    showContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Continue reading',
          onClick: () => openBook(b),
        },
        {
          label: 'Open in new window',
          onClick: () => Tanko.api.window.openBookInNewWindow(b.id),
        },
        {
          label: toggleLabel,
          onClick: async () => {
            const cur = appState.progressAll?.[b.id] || (await Tanko.api.progress.get(b.id)) || {};
            const next = { ...cur, finished: !cur.finished };
            if (next.finished) next.finishedAt = Date.now();
            else delete next.finishedAt;

            await Tanko.api.progress.save(b.id, next);
            appState.progressAll = await Tanko.api.progress.getAll();
            renderContinue();
            toast(next.finished ? 'Marked finished' : 'Marked in progress');
          },
        },
        {
          label: 'Clear from Continue Reading',
          onClick: async () => {
            await Tanko.api.progress.clear(b.id);
            appState.progressAll = await Tanko.api.progress.getAll();
            renderContinue();
            toast('Removed from continue');
          },
        },
        { separator: true },
        {
          label: 'Reveal in File Explorer',
          // Check if the API bridge exists (from Build 45B)
          disabled: !Tanko.api.shell.revealPath,
          onClick: async () => {
            await Tanko.api.shell.revealPath(b.path);
          },
        },
        {
          label: 'Remove from library…',
          danger: true,
          disabled: !seriesPath,
          onClick: async () => {
            // Reuse the confirmation helper from Build 45C if available.
            const confirmFn = (typeof confirmRemoveSeriesFromLibrary === 'function')
              ? confirmRemoveSeriesFromLibrary
              : null;

            const ok = confirmFn
              ? await confirmFn()
              : window.confirm('Remove from library?\n\nThis removes it from the library. It does not delete files from disk.');

            if (!ok) return;

            const res = await Tanko.api.library.removeSeriesFolder(seriesPath);
            if (res?.state) {
              appState.library = res.state;
              bookById = new Map((appState.library.books || []).map(x => [x.id, x]));
              buildLibraryDerivedCaches();
              appState.progressAll = await Tanko.api.progress.getAll();
              renderLibrary();
              toast('Series removed');
            }
          },
        },
      ],
    });
  }

  function renderContinue() {
    el.continueRow.innerHTML = '';
    const bm = bookMap();
    const hideFinished = !!appState.ui.hideFinished;
    if (el.hideFinishedToggle) el.hideFinishedToggle.checked = hideFinished;

    if (el.libraryScanPill) {
      const on = !!appState.ui.libraryScanning;
      el.libraryScanPill.classList.toggle('hidden', !on);

      const p = appState.ui.libraryScanProgress;
      const done = Math.max(0, p?.seriesDone || 0);
      const total = Math.max(0, p?.seriesTotal || 0);
      const cur = String(p?.currentSeries || '').trim();

      if (el.libraryScanText) {
        el.libraryScanText.textContent = (total > 0)
          ? `Refreshing… ${done}/${total}`
          : 'Refreshing…';
      }

      // Helpful tooltip
      if (on) {
        el.libraryScanPill.title = cur
          ? `Refreshing library… (${done}/${total})\n${cur}`
          : `Refreshing library… (${done}/${total})`;
      } else {
        el.libraryScanPill.title = 'Refreshing library in background';
      }

      // Cancel button only when scanning
      if (el.libraryScanCancel) el.libraryScanCancel.classList.toggle('hidden', !on);
    }
    const seenSeries = new Set();
    const items = Object.entries(appState.progressAll || {})
      .map(([id, p]) => {
        const b0 = bm.get(id);
        if (b0) return { id, p, b: b0 };

        const m = p?.bookMeta;
        if (m && m.path) {
          return {
            id,
            p,
            b: { id, title: m.title || '—', series: m.series || '', seriesId: m.seriesId || '', path: m.path },
          };
        }
        return { id, p, b: null };
      })
      .filter(x => x.b && x.p && x.p.updatedAt)
      // BUILD16C_CONTINUE_REMOVE_READ: once a volume is finished/read, it should not appear in Continue Reading.
      .filter(x => !x.p.finished)
      .sort((a,b)=> (b.p.updatedAt||0)-(a.p.updatedAt||0))
      // BUILD36_CONTINUE_ONE_PER_SERIES (Build 36)
      // Keep only the most recently updated volume per series in Continue Reading.
      .filter((x) => {
        const b = x?.b;
        const sid0 = String(b?.seriesId || '').trim();
        const sname0 = String(b?.series || '').trim();
        const key = sid0 || sname0;
        if (!key) return true; // no series context → do not dedupe
        if (seenSeries.has(key)) return false;
        seenSeries.add(key);
        return true;
      })
      .slice(0, 10);

    el.continueEmpty.classList.toggle('hidden', items.length !== 0);

    for (const it of items) {
      const b = it.b;
      const p = it.p;
      const card = document.createElement('div');
      card.className = 'contTile' + (p.finished ? ' finished' : '');
      const finishLabel = p.finished ? '↺' : '✓';
      const finishTitle = p.finished ? 'Mark as in progress' : 'Mark as finished';
      const badges = [
        `<span class="badge">p${(p.pageIndex||0)+1}</span>`,
        p.finished ? `<span class="badge badge-finished">Finished</span>` : ''
      ].filter(Boolean).join(' ');

      // BUILD17_CONTINUE_PERCENT (Build 17)
      const pageCount = Number(p.pageCount) || 0;
      const maxSeen = Number.isFinite(Number(p.maxPageIndexSeen))
        ? Number(p.maxPageIndexSeen)
        : (p.pageIndex || 0);

      const pct = pageCount
        ? clamp(Math.round(((clamp(maxSeen, 0, pageCount - 1) + 1) / pageCount) * 100), 0, 100)
        : null;

      const pctBadge = (pct === null)
        ? ''
        : `<div class="contPctBadge"><span class="badge">${pct}%</span></div>`;

      card.innerHTML = `
        <div class="contCover">
          <img class="thumb contCoverImg" alt="cover">
          <button class="contFinish" title="${finishTitle}">${finishLabel}</button>
          <button class="contRemove" title="Remove from continue">×</button>
          <div class="contBadgeRow">${badges}</div>
          ${pctBadge}
        </div>
        <div class="contTitleWrap">
          <div class="contTileTitle u-clamp2" title="${escapeHtml(b.title)}">${escapeHtml(b.title)}</div>
        </div>
      `;

      const img = card.querySelector('img.thumb');
      attachThumb(img, b);

      card.querySelector('.contFinish').addEventListener('click', async (e) => {
        e.stopPropagation();
        const cur = appState.progressAll[b.id] || (await Tanko.api.progress.get(b.id)) || {};
        const next = { ...cur, finished: !cur.finished };
        if (next.finished) next.finishedAt = Date.now();
        else delete next.finishedAt;
        await Tanko.api.progress.save(b.id, next);
        appState.progressAll = await Tanko.api.progress.getAll();
        renderContinue();
        toast(next.finished ? 'Marked finished' : 'Marked in progress');
      });

      card.querySelector('.contRemove').addEventListener('click', async (e) => {
        e.stopPropagation();
        await Tanko.api.progress.clear(b.id);
        appState.progressAll = await Tanko.api.progress.getAll();
        renderContinue();
        toast('Removed from continue');
      });

      // FIND_THIS:CONTINUE_TILE_RIGHT_CLICK (Build 45E)
      card.addEventListener('contextmenu', (e) => {
        // Right-click must not trigger left-click navigation.
        openContinueTileContextMenu(e, b, p);
      });

      card.addEventListener('click', () => openBook(b));
      el.continueRow.appendChild(card);
    }

    scheduleContinueGeometry();
  }

  // Build 12: sidebar folders rendering
  function renderSidebarFolders() {
    const wrap = el.sidebarFoldersTree;
    if (!wrap) return;

    const roots = Array.isArray(appState.library?.rootFolders) ? appState.library.rootFolders : [];
    const series = Array.isArray(appState.library?.series) ? appState.library.series : [];

    const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/g, '');
    const baseName = (p) => {
      const x = norm(p);
      const parts = x.split('/').filter(Boolean);
      return parts.length ? parts[parts.length - 1] : x;
    };

    // Keep focus sane if roots change.
    const focusNorm = appState.ui.folderFocusRoot ? norm(appState.ui.folderFocusRoot).toLowerCase() : '';
    const rootNorms = new Set(roots.map(r => norm(r).toLowerCase()));
    if (focusNorm && !rootNorms.has(focusNorm)) appState.ui.folderFocusRoot = null;

    const selectedSeriesId = appState.selectedSeriesId;
    const focusRoot = appState.ui.folderFocusRoot;

    // Group series under roots when possible.
    const grouped = roots.map((r) => {
      const rn = norm(r).toLowerCase();
      const prefix = rn ? (rn + '/') : '';
      const children = series.filter(s => norm(s.path).toLowerCase().startsWith(prefix));
      return { root: r, children };
    });

    const seenSeries = new Set();
    for (const g of grouped) for (const s of g.children) seenSeries.add(s.id);
    const looseSeries = series.filter(s => !seenSeries.has(s.id));

    wrap.innerHTML = '';

    const mkBtn = ({ icon, label, title, count, cls, onClick, child }) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `folderItem${cls ? (' ' + cls) : ''}${child ? ' folderChild' : ''}`;
      if (title) b.title = title;
      b.innerHTML = `
        <span class="folderIcon">${escapeHtml(icon || '')}</span>
        <span class="folderLabel">${escapeHtml(label || '')}</span>
        ${Number.isFinite(count) ? `<span class="folderCount">${count}</span>` : ''}
      `;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.();
      });
      return b;
    };

    // Always include an easy escape back to the full library.
    wrap.appendChild(mkBtn({
      icon: '◻',
      label: 'All',
      title: 'Show all series',
      cls: (!focusRoot && !selectedSeriesId) ? 'active' : '',
      onClick: () => {
        appState.ui.folderFocusRoot = null;
        appState.selectedSeriesId = null;
        renderLibrary();
      },
    }));

    if (!roots.length && !series.length) {
      const empty = document.createElement('div');
      empty.className = 'folderTreeEmpty';
      empty.textContent = 'No folders yet';
      wrap.appendChild(empty);
      return;
    }

    for (const g of grouped) {
      const r = g.root;
      const active = focusRoot && norm(focusRoot).toLowerCase() === norm(r).toLowerCase();
      const rootBtn = mkBtn({
        icon: '▸',
        label: baseName(r),
        title: r,
        count: g.children.length,
        cls: active ? 'active' : '',
        onClick: () => {
          const isSame = active;
          appState.selectedSeriesId = null;
          appState.ui.folderFocusRoot = isSame ? null : r;
          renderLibrary();
        },
      });

      // Build 45B: right-click menu for root folders.
      // Right-click must NOT change selection automatically.
      rootBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();

        showContextMenu({
          x: e.clientX,
          y: e.clientY,
          items: [
            {
              label: 'Rescan this root',
              onClick: async () => {
                try { await Tanko.api.library.scan({ force: true }); } catch {}
                await refreshLibrary();
                toast('Refreshing…');
              },
            },
            {
              label: 'Reveal in File Explorer',
              disabled: (typeof Tanko?.api?.shell?.revealPath !== 'function'),
              onClick: async () => {
                try { await Tanko.api.shell.revealPath(r); } catch {}
              },
            },
            { separator: true },
            {
              label: 'Remove root folder…',
              danger: true,
              onClick: async () => {
                const ok = await confirmRemoveRootFolder();
                if (!ok) return;

                showLoading('Removing root folder');
                try {
                  const res = await Tanko.api.library.removeRootFolder(r);
                  if (res?.state) {
                    appState.library = res.state;
                    appState.progressAll = await Tanko.api.progress.getAll();
                    bookById = new Map((appState.library.books || []).map(b => [b.id, b]));
                    buildLibraryDerivedCaches();
                    appState.selectedSeriesId = null;
                    if (appState.ui.folderFocusRoot === r) appState.ui.folderFocusRoot = null;
                    renderLibrary();
                    toast('Root folder removed');
                  }
                } finally {
                  hideLoading();
                }
              },
            },
          ],
        });
      });

      wrap.appendChild(rootBtn);

      for (const s of g.children) {
        // FIND_THIS:SERIES_CONTEXT_MENU_SIDEBAR_CHILD (Build 45C)
        const seriesBtn = mkBtn({
          icon: '•',
          label: s.name,
          title: s.path,
          count: Number(s.count || 0),
          cls: (selectedSeriesId === s.id) ? 'active' : '',
          child: true,
          onClick: () => {
            appState.ui.folderFocusRoot = r;
            appState.selectedSeriesId = s.id;
            renderLibrary();
          },
        });
        seriesBtn.addEventListener('contextmenu', (e) => {
          // Do not change selection on right-click.
          openSeriesContextMenu(e, s, r);
        });

        wrap.appendChild(seriesBtn);
      }
    }

    if (looseSeries.length) {
      const hint = document.createElement('div');
      hint.className = 'folderTreeEmpty';
      hint.textContent = roots.length ? 'Standalone series' : 'Series folders';
      wrap.appendChild(hint);
      for (const s of looseSeries) {
        // FIND_THIS:SERIES_CONTEXT_MENU_SIDEBAR_LOOSE (Build 45C)
        const seriesBtn = mkBtn({
          icon: '•',
          label: s.name,
          title: s.path,
          count: Number(s.count || 0),
          cls: (selectedSeriesId === s.id) ? 'active' : '',
          onClick: () => {
            appState.ui.folderFocusRoot = null;
            appState.selectedSeriesId = s.id;
            renderLibrary();
          },
        });
        seriesBtn.addEventListener('contextmenu', (e) => {
          openSeriesContextMenu(e, s, null);
        });

        wrap.appendChild(seriesBtn);
      }
    }
  }

  function renderSeriesGrid() {
    el.seriesGrid.innerHTML = '';
    const focusRoot = appState.ui.folderFocusRoot;
    const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/g, '');
    let series = appState.library.series || [];
    if (focusRoot) {
      const rn = norm(focusRoot).toLowerCase();
      const prefix = rn ? (rn + '/') : '';
      series = series.filter(s => norm(s.path).toLowerCase().startsWith(prefix));
    }
    el.seriesEmpty.classList.toggle('hidden', series.length !== 0);

    for (const s of series) {
      const card = document.createElement('div');
      card.className = 'seriesCard';
      card.innerHTML = `
        <button class="seriesRemove" title="Remove series">×</button>
        <div class="seriesCoverWrap">
          <div class="thumbWrap"><img class="thumb" alt="thumb"></div>
        </div>
        <div class="seriesName" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>
        <div class="seriesInfo">
          <div class="seriesMeta">
          <span>${s.count || 0} volumes</span>
          <span class="mono u-ellipsis">${escapeHtml(s.path)}</span>
        </div>
        </div>
      `;
      const img = card.querySelector('img.thumb');
      const coverBook = seriesCoverBookBySeriesId.get(s.id);
      if (coverBook) attachThumb(img, coverBook);


      card.querySelector('.seriesRemove').addEventListener('click', async (e) => {
        e.stopPropagation();
        const res = await Tanko.api.library.removeSeriesFolder(s.path);
        if (res?.state) {
          appState.library = res.state;
          appState.progressAll = await Tanko.api.progress.getAll();
          bookById = new Map((appState.library.books || []).map(b => [b.id, b]));
          buildLibraryDerivedCaches();
          appState.selectedSeriesId = null;
          renderLibrary();
          toast('Series removed');
        }
      });

            // FIND_THIS:SERIES_CONTEXT_MENU_GRID (Build 45C)
      card.addEventListener('contextmenu', (e) => {
        // Do not let right-click trigger any left-click navigation.
        openSeriesContextMenu(e, s, null);
      });

      card.addEventListener('click', () => {
        appState.selectedSeriesId = s.id;
        renderLibrary();
      });

      el.seriesGrid.appendChild(card);
    }
  }

  function renderVolumes() {
    const sid = appState.selectedSeriesId;
    const s = (appState.library.series || []).find(x => x.id === sid);
    const books = (appState.library.books || []).filter(b => b.seriesId === sid);

    // EDIT_ZONE:LIBRARY_VIEW_SWITCH
    // Build 4.5 — SeriesView must replace HomeView so the split preview/table has full height.
    // Validate: enter a series on 1080p; Continue Reading must disappear; table should show ~8–15 rows.
    const inSeries = !!sid;
    el.homeView?.classList.toggle('hidden', inSeries);
    el.seriesView?.classList.toggle('hidden', !inSeries);

    el.crumb.classList.toggle('hidden', !inSeries);
    el.volumesWrap.classList.toggle('hidden', !inSeries);

    if (!sid) return;

    el.crumbText.textContent = s ? `${s.name} · ${books.length} volumes` : '';

    // Controls
    if (el.volSort) el.volSort.value = appState.ui.volSort || 'numerical';
    if (el.volHidePreviewToggle) el.volHidePreviewToggle.checked = !!appState.ui.volHidePreview;
    el.volumesWrap.classList.toggle('previewHidden', !!appState.ui.volHidePreview);

    const q = (appState.ui.volSearch || '').trim().toLowerCase();
    const qNums = (q.match(/\d+/g) || []).map(n => parseInt(n, 10)).filter(n => Number.isFinite(n));

    const getNum = (title) => {
      const m = String(title).match(/\d+/);
      return m ? parseInt(m[0], 10) : null;
    };

    const matchesSearch = (b) => {
      if (!q) return true;
      const t = String(b.title || '').toLowerCase();
      if (t.includes(q)) return true;
      if (qNums.length) {
        const n = getNum(b.title);
        if (Number.isFinite(n) && qNums.includes(n)) return true;
        for (const nn of qNums) {
          if (t.includes(String(nn))) return true;
        }
      }
      return false;
    };

    const sortMode = appState.ui.volSort || 'numerical';
    const getLastRead = (id) => (appState.progressAll?.[id]?.updatedAt || 0);

    const cmp = (a, b) => {
      if (sortMode === 'alphabetical') {
        return String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' });
      }
      if (sortMode === 'newest') {
        return (b.mtimeMs || 0) - (a.mtimeMs || 0) || naturalCompare(a.title, b.title);
      }
      if (sortMode === 'lastread') {
        return (getLastRead(b.id) - getLastRead(a.id)) || naturalCompare(a.title, b.title);
      }
      if (sortMode === 'numerical') {
        const na = getNum(a.title);
        const nb = getNum(b.title);
        if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
        if (Number.isFinite(na) && !Number.isFinite(nb)) return -1;
        if (!Number.isFinite(na) && Number.isFinite(nb)) return 1;
        return naturalCompare(a.title, b.title);
      }
      return naturalCompare(a.title, b.title);
    };

    const filtered = books.filter(matchesSearch);
    const sorted = [...filtered].sort(cmp);

    const fmtBytes = (n) => {
      const v = Number(n);
      if (!Number.isFinite(v) || v <= 0) return '—';
      const units = ['B','KB','MB','GB','TB'];
      let x = v;
      let u = 0;
      while (x >= 1024 && u < units.length - 1) { x /= 1024; u++; }
      const dp = (u <= 1) ? 0 : (u === 2 ? 1 : 2);
      return `${x.toFixed(dp)} ${units[u]}`;
    };

    const fmtDate = (ms) => {
      const d = new Date(ms);
      if (!Number.isFinite(d.getTime())) return '—';
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
    };

    const setPreview = async (book, idx, total) => {
      if (!el.volPreviewInfo || !el.volPreviewImg) return;
      if (!book) {
        el.volPreviewInfo.textContent = '—';
        el.volPreviewImg.src = '';
        el.volPreviewImg.dataset.bookid = '';
        return;
      }
      el.volPreviewInfo.textContent = `${idx + 1}/${total}`;
      el.volPreviewImg.dataset.bookid = book.id;

      const cached = thumbMem.get(book.id);
      if (cached) {
        el.volPreviewImg.src = cached;
        return;
      }

      // Generate/load a small cached thumbnail. This is lightweight and avoids decoding full-res images.
      try {
        const url = await getOrCreateThumb(book);
        if (el.volPreviewImg.dataset.bookid === book.id) el.volPreviewImg.src = url;
      } catch {}
    };

    // Empty state
    el.volTableHead?.classList.toggle('hidden', sorted.length === 0);
    el.volumesEmpty.classList.toggle('hidden', sorted.length !== 0);
    el.volumesGrid.innerHTML = '';

    if (sorted.length === 0) {
      setPreview(null, 0, 0);
      if (el.volOpenBtn) el.volOpenBtn.disabled = true;
      return;
    }

    // Ensure we always have a selected row.
    let selId = appState.ui.volSelBookId;
    if (!selId || !sorted.some(b => b.id === selId)) selId = sorted[0].id;
    appState.ui.volSelBookId = selId;

    const selIdx = sorted.findIndex(b => b.id === selId);
    const selBook = (selIdx >= 0) ? sorted[selIdx] : sorted[0];

    setPreview(selBook, (selIdx >= 0 ? selIdx : 0), sorted.length);
    if (el.volOpenBtn) el.volOpenBtn.disabled = !selBook;

    const applySelectionStyles = () => {
      const rows = el.volumesGrid.querySelectorAll('.volTrow');
      rows.forEach(r => r.classList.toggle('sel', r.dataset.bookid === appState.ui.volSelBookId));
    };

    for (let i = 0; i < sorted.length; i++) {
      const b = sorted[i];
      const p = appState.progressAll?.[b.id];
      const fileName = (b.path || '').split(/[\\/]/).pop() || '—';
      const size = fmtBytes(b.sizeBytes);
      const read = p?.finished ? '✓' : '—';
      const cur = (p && Number.isFinite(p.pageIndex)) ? String((p.pageIndex || 0) + 1) : '—';
      const date = fmtDate(b.mtimeMs);

      const row = document.createElement('div');
      row.className = `volTrow${(i % 2) ? ' alt' : ''}${(b.id === selId) ? ' sel' : ''}`;
      row.dataset.bookid = b.id;
      row.innerHTML = `
        <div class="cell num">${i + 1}</div>
        <div class="cell title" title="${escapeHtml(b.title || '')}">${escapeHtml(b.title || '—')}</div>
        <div class="cell file" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</div>
        <div class="cell pages">—</div>
        <div class="cell size">${escapeHtml(size)}</div>
        <div class="cell read">${read}</div>
        <div class="cell cur">${escapeHtml(cur)}</div>
        <div class="cell date">${escapeHtml(date)}</div>
      `;

      row.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        appState.ui.volSelBookId = b.id;
        applySelectionStyles();
        setPreview(b, i, sorted.length);
        if (el.volOpenBtn) el.volOpenBtn.disabled = false;
      });

      row.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openBook(b);
      });

      // FIND_THIS:VOLUME_ROW_TEST_MENU
      // BUILD21_MULTIWINDOW + BUILD21_EXPORT (Build 21)
      row.addEventListener('contextmenu', (e) => {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        e.stopPropagation();

        showContextMenu({
          x: e.clientX,
          y: e.clientY,
          items: [
            { label: 'Open', onClick: () => openBook(b) },
            { label: 'Open in new window', onClick: () => Tanko.api.window.openBookInNewWindow(b.id) },
            { separator: true },
            { label: 'Copy volume path', disabled: !b.path, onClick: () => b.path && Tanko.api.clipboard.copyText(b.path) },
            { label: 'Reveal volume in Explorer', disabled: !b.path, onClick: () => b.path && Tanko.api.shell.revealPath(b.path) },
          ],
        });
      });

      el.volumesGrid.appendChild(row);
    }
  }

  function renderLibrary() {
    // Keep the toolbar title in sync with the current library context.
    if (el.libTitle) {
      const sid = appState.selectedSeriesId;
      const s = (appState.library.series || []).find(x => x.id === sid);
      el.libTitle.textContent = s ? s.name : 'Library';
    }
    renderSidebarFolders();
    renderContinue();
    renderSeriesGrid();
    renderVolumes();
  }

  // -----------------------------
  // Global search (series + volumes)
  // -----------------------------

  let globalSearchItems = [];

  function normKey(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function matchText(text, query) {
    if (!query) return false;
    const q = query.toLowerCase().trim();
    if (!q) return false;
    const t = (text || '').toLowerCase();
    if (t.includes(q)) return true;
    const qn = normKey(query);
    if (qn && normKey(text).includes(qn)) return true;
    return false;
  }

  function buildGlobalSearch(query) {
    const q = (query || '').trim();
    if (!q) return { series: [], books: [] };

    const series = (appState.library.series || [])
      .filter(s => matchText(s.name, q))
      .sort((a, b) => naturalCompare(a.name, b.name))
      .slice(0, 24);

    const books = (appState.library.books || [])
      .filter(b => matchText(b.title, q) || matchText(b.series, q))
      .sort((a, b) => naturalCompare(a.title, b.title))
      .slice(0, 80);

    return { series, books };
  }

  function hideGlobalSearchResults() {
    globalSearchItems = [];
    if (el.globalSearchResults) {
      el.globalSearchResults.innerHTML = '';
      el.globalSearchResults.classList.add('hidden');
    }
  }

  function setGlobalSearchSelection(idx) {
    const max = globalSearchItems.length - 1;
    appState.ui.globalSearchSel = clamp(idx, 0, Math.max(0, max));
    if (!el.globalSearchResults) return;

    el.globalSearchResults.querySelectorAll('.resItem').forEach(node => {
      const i = parseInt(node.dataset.idx || '0', 10);
      node.classList.toggle('active', i === appState.ui.globalSearchSel);
    });

    const active = el.globalSearchResults.querySelector(`.resItem[data-idx="${appState.ui.globalSearchSel}"]`);
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  async function activateGlobalSearchSelection() {
    const it = globalSearchItems[appState.ui.globalSearchSel];
    if (!it) return;

    hideGlobalSearchResults();
    if (el.globalSearch) {
      el.globalSearch.value = '';
      appState.ui.globalSearch = '';
      el.globalSearch.blur();
    }

    if (it.type === 'series') {
      appState.selectedSeriesId = it.seriesId;
      renderLibrary();
      return;
    }
    if (it.type === 'book') {
      await openBook(it.book);
    }
  }

  function renderGlobalSearchResults() {
    if (!el.globalSearchResults || !el.globalSearch) return;

    const q = el.globalSearch.value || '';
    appState.ui.globalSearch = q;

    const { series, books } = buildGlobalSearch(q);
    const hasAny = (series.length + books.length) > 0;

    globalSearchItems = [];
    el.globalSearchResults.innerHTML = '';

    if (!q.trim()) {
      hideGlobalSearchResults();
      return;
    }

    if (!hasAny) {
      const empty = document.createElement('div');
      empty.className = 'resEmpty';
      empty.textContent = 'No matches';
      el.globalSearchResults.appendChild(empty);
      el.globalSearchResults.classList.remove('hidden');
      return;
    }

    let idx = 0;
    function addGroup(title, nodes) {
      if (!nodes.length) return;
      const g = document.createElement('div');
      g.className = 'resGroup';
      g.innerHTML = `<div class="resHead">${escapeHtml(title)}</div>`;
      for (const n of nodes) {
        const item = document.createElement('div');
        item.className = 'resItem';
        item.dataset.idx = String(idx);
        if (n.type === 'series') {
          item.innerHTML = `
            <div class="resType">S</div>
            <div class="resText">
              <div class="resMain">${escapeHtml(n.series.name)}</div>
              <div class="resSub">${(n.series.count || 0)} volumes</div>
            </div>
          `;
        } else {
          item.innerHTML = `
            <div class="resType">V</div>
            <div class="resText">
              <div class="resMain">${escapeHtml(n.book.title)}</div>
              <div class="resSub">${escapeHtml(n.book.series || '')}</div>
            </div>
          `;
        }
        item.addEventListener('mouseenter', () => setGlobalSearchSelection(parseInt(item.dataset.idx || '0', 10)));
        item.addEventListener('click', () => activateGlobalSearchSelection());
        g.appendChild(item);
        idx += 1;
      }
      el.globalSearchResults.appendChild(g);
    }

    addGroup('Matching series', series.map(s => ({ type: 'series', series: s })));
    addGroup('Matching volumes', books.map(b => ({ type: 'book', book: b })));

    // Build the flat list in the same order as rendered
    globalSearchItems = [
      ...series.map(s => ({ type: 'series', seriesId: s.id, series: s })),
      ...books.map(b => ({ type: 'book', book: b })),
    ];

    el.globalSearchResults.classList.remove('hidden');
    setGlobalSearchSelection(appState.ui.globalSearchSel || 0);
  }

  // -----------------------------
  // Player
  // -----------------------------

  // BUILD 8: Expose explicit hooks so other modules don't need to rely on
  // implicit globals when they want to trigger a library re-render.
  try {
    window.libraryHooks = window.libraryHooks || {};
    window.libraryHooks.renderLibrary = renderLibrary;
    window.libraryHooks.renderContinue = renderContinue;
  } catch {}

