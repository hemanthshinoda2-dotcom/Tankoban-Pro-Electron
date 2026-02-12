// Build 9: moved from src/modules/reader_*.js into src/modules/reader/*
// NOTE: This is a mechanical split. Logic is unchanged.
  // BUILD29E_CACHE_BY_BYTES (Build 29E)
  // INTENT: Evict by estimated memory instead of "N pages". High-res pages
  // can vary wildly; count-based eviction is unstable.
  const PAGE_CACHE_BUDGET_MB = 512;
  const PAGE_CACHE_BUDGET_MB_SAVER = 256;

  // Keep-set cap is still count-based to avoid un-evictable windows (esp. Two-Page Scroll).
  const PAGE_CACHE_KEEP_MAX = 12;

  const pageCache = new Map(); // idx -> { bmp, spread, promise, lastUsed, lastFailAt?, failCount?, lastFailMsg? }
  const pageDecodeQueue = withLimit(2);

  function _closeBmp(bmp) {
    try { bmp?.close?.(); } catch {}
  }

  // BUILD29C_CACHE_BY_BYTES_HELPERS (Build 29C)
  // INTENT: Used by Build 29E+ to evict by estimated bytes. Kept inert in 29C.
  function estimateBmpBytes(bmp) {
    try {
      const w = Number(bmp?.width) || 0;
      const h = Number(bmp?.height) || 0;
      if (!w || !h) return 0;
      return w * h * 4;
    } catch { return 0; }
  }

  function pageCacheBudgetBytes() {
    const mb = appState.settings?.memorySaver ? PAGE_CACHE_BUDGET_MB_SAVER : PAGE_CACHE_BUDGET_MB;
    return Math.max(32, Number(mb) || PAGE_CACHE_BUDGET_MB) * 1024 * 1024;
  }

  function computePageCacheBytes() {
    let sum = 0;
    for (const e of pageCache.values()) {
      sum += estimateBmpBytes(e?.bmp);
}
    return sum;
  }

  function clearPageCache() {
    for (const e of pageCache.values()) {
if (e?.bmp) _closeBmp(e.bmp);
    }
    pageCache.clear();
  }

    function prunePageCache() {
    const budget = pageCacheBudgetBytes();
    let bytes = computePageCacheBytes();
    if (bytes <= budget) return;

    const keep = new Set([appState.pageIndex, appState.pageIndex - 1, appState.pageIndex + 1]);

    // BUILD19G_TWOPAGE_SCROLL_CACHE_KEEP (Build 19G)
    // Keep a bounded near-viewport window so Two-Page Scroll doesn't thrash.
    if (document.body.classList.contains('inPlayer') && getControlMode() === 'twoPageScroll') {
      const rows = twoPageScrollRows || [];
      const ch = Number(el.stage?.height) || 0;

      const keepLimit = Math.max(3, PAGE_CACHE_KEEP_MAX);

      const addKeep = (idx) => {
        if (!Number.isFinite(idx)) return;
        if (keep.size >= keepLimit) return;
        keep.add(idx);
      };

      // Keep indices within current viewport span (plus small margin)
      const y0 = Number(appState.twoPageScrollY || 0);
      const p0 = Math.max(0, y0 - ch * 0.25);
      const p1 = y0 + ch * 1.25;

      for (const r of rows) {
        if (!r) continue;
        if ((r.yEnd || 0) < p0) continue;
        if ((r.yStart || 0) > p1) break;

        if (r.type === 'pair') {
          addKeep(r.rightIndex);
          addKeep(r.leftIndex);
        } else {
          addKeep(r.index);
        }
      }
    }

    // First pass: evict non-keep LRU
    let candidates = [...pageCache.entries()].filter(([i]) => !keep.has(i));
    candidates.sort((a, b) => (a[1].lastUsed || 0) - (b[1].lastUsed || 0));

    while (bytes > budget && candidates.length) {
      const [idx, e] = candidates.shift();
bytes -= estimateBmpBytes(e?.bmp);
if (e?.bmp) _closeBmp(e.bmp);
      pageCache.delete(idx);
    }

    // Fallback: if keep-set is too big, evict keep LRU except the current page.
    if (bytes > budget) {
      const pin = new Set([appState.pageIndex]);
      const keepCandidates = [...pageCache.entries()].filter(([i]) => !pin.has(i));
      keepCandidates.sort((a, b) => (a[1].lastUsed || 0) - (b[1].lastUsed || 0));

      while (bytes > budget && keepCandidates.length && pageCache.size > 1) {
        const [idx, e] = keepCandidates.shift();
bytes -= estimateBmpBytes(e?.bmp);
if (e?.bmp) _closeBmp(e.bmp);
        pageCache.delete(idx);
      }
    }
  }


  async function decodePageAtIndex(idx) {
    const entry = appState.pages[idx];
    const bytes = await appState.zip.getFileBytes(entry);
    const ext = entry.name.toLowerCase().match(/\.(png|jpe?g|webp)$/)?.[1] || 'jpeg';
    const mime = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');
    const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
    const spread = isSpread(bmp.width, bmp.height);
    // BUILD19_KNOWN_SPREAD_LEARN (Build 19)
    // Learn wide/spread pages as we decode them.
    if (spread) {
      // Don't re-learn as spread if user manually forced Normal.
      try { if (!knownNormalIndexSet?.has(idx)) knownSpreadIndexSet.add(idx); } catch {}
    }
    return { bmp, spread };
  }

async function getBitmapAtIndex(idx) {
  // PERF_HOTSPOT: decode promises can outlive a volume switch and later poison caches / state
  // → FIX: snapshot the active volume token + references; discard stale decode results silently.
  if (!appState.pages.length) throw new Error('No pages loaded');
  idx = clamp(idx, 0, appState.pages.length - 1);

  const hit = pageCache.get(idx);
  if (hit?.bmp) {
    hit.lastUsed = performance.now();

    // BUILD29: spread overrides must apply even on cached hits.
    const effectiveSpread = getEffectiveSpreadStatus(idx, hit.spread);
    return { bmp: hit.bmp, spread: effectiveSpread };
  }
  if (hit?.promise) {
    hit.lastUsed = performance.now();
    return hit.promise;
  }

  // Snapshot the current volume identity (token + object refs) for stale-result detection.
  const volTok = Number(appState.tokens?.volume) || 0;
  const zipRef = appState.zip;
  const pagesRef = appState.pages;

  const promise = pageDecodeQueue(async () => {
    // Fast-stale gate: drop work bursts that are already irrelevant.
    if ((Number(appState.tokens?.volume) || 0) != volTok || appState.zip !== zipRef || appState.pages !== pagesRef) {
      throw makeStaleError('decodePageAtIndex(pre)');
    }

    const { bmp, spread } = await decodePageAtIndex(idx);

    // Late-stale gate: ensure we never commit decoded bitmaps into a newer volume session.
    if ((Number(appState.tokens?.volume) || 0) != volTok || appState.zip !== zipRef || appState.pages !== pagesRef) {
      try { _closeBmp(bmp); } catch {}
      throw makeStaleError('decodePageAtIndex(post)');
    }

    pageCache.set(idx, { bmp, spread, promise: null, lastUsed: performance.now() });
    prunePageCache();

    // BUILD29: spread overrides apply to decoded results too.
    const effectiveSpread = getEffectiveSpreadStatus(idx, spread);
    return { bmp, spread: effectiveSpread };
  });

  pageCache.set(idx, { bmp: null, spread: false, promise, lastUsed: performance.now(), lastFailAt: 0, failCount: 0 });

  // BUILD19_DECODE_FAIL_RECOVERY (Build 19)
  // If a decode fails, do NOT keep a permanently rejected promise in cache (it "bricks" the page).
  // Clear the promise and record a fail timestamp so callers can throttle retries.
  promise.catch((err) => {
    try {
      const cur = pageCache.get(idx);
      if (!cur || cur.promise !== promise) return;

      // Build 22: stale decode is not a failure — it was superseded (avoid cooldown + logs).
      if (isStaleError(err)) {
        pageCache.delete(idx);
        return;
      }

      const fc = (Number(cur.failCount) || 0) + 1;
      pageCache.set(idx, {
        bmp: null,
        spread: false,
        promise: null,
        lastUsed: performance.now(),
        lastFailAt: performance.now(),
        failCount: fc,
        lastFailMsg: (err && err.message) ? String(err.message) : String(err || 'decode failed'),
      });
    } catch {}
  });

  return promise;
}

