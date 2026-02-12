// Build 9: moved from src/modules/reader_50_input_and_boot.js into src/modules/reader/*
// NOTE: Mechanical split. Logic is unchanged.
  // Start
  initScrollSpeedSlider();
  refreshLibrary().then(async () => {
    bootReady = true;

    // Prefer OS/DnD open over openBookId query when present.
    const openedExternal = await flushPendingExternalOpen();
    if (openedExternal) return;

    // BUILD21_MULTI_WINDOW_STARTUP (Build 21)
    // INTENT: A new reader window can boot straight into a volume via query string.
    const openId = (new URLSearchParams(window.location.search)).get('openBookId');
    if (!openId) return;

  // Prefer library index; fall back to Continue Reading meta for “Open File” volumes.
  const b =
    bookById.get(openId) ||
    bookByIdExtra.get(openId) ||
    (() => {
      const p = appState.progressAll?.[openId];
      const m = p?.bookMeta;
      if (!m?.path) return null;
      return { id: openId, title: m.title || '—', series: m.series || '', seriesId: m.seriesId || '', path: m.path };
    })();

  if (b?.path) {
    try { await openBook(b); } catch { toast('Failed to open in new window'); }
  } else {
    toast('Volume not found');
  }
}).catch(err => toast(String(err)));
