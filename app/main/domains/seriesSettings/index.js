/*
TankobanPlus — Series Settings Domain (Build 78A, Phase 4 Checkpoint A)

Handles per-series reading preferences persistence.
Extracted from Build 77 IPC registry lines 2345-2131 with ZERO behavior changes.
*/

// ========== MODULE STATE ==========

/**
 * Series settings cache.
 * Lifted from Build 77 index.js line 2345.
 */
let seriesSettingsMem = null;

/**
 * Get cached series settings data, loading from disk if needed.
 * Lifted from Build 77 index.js lines 2346-2350.
 */
function getSeriesSettingsMem(ctx) {
  if (seriesSettingsMem) return seriesSettingsMem;
  seriesSettingsMem = ctx.storage.readJSON(ctx.storage.dataPath('series_settings.json'), {});
  return seriesSettingsMem;
}

// ========== DOMAIN HANDLERS ==========

/**
 * Get all series settings.
 * Lifted from Build 77 index.js lines 4105-4108.
 */
async function getAll(ctx) {
  const all = getSeriesSettingsMem(ctx);
  return { ...all };
}

/**
 * Get settings for a specific series.
 * Lifted from Build 77 index.js lines 4110-4113.
 */
async function get(ctx, _evt, seriesId) {
  const all = getSeriesSettingsMem(ctx);
  return (seriesId && all[seriesId]) ? all[seriesId] : null;
}

/**
 * Save settings for a series.
 * Lifted from Build 77 index.js lines 4115-4122.
 */
async function save(ctx, _evt, seriesId, settings) {
  if (!seriesId) return { ok: false };
  const p = ctx.storage.dataPath('series_settings.json');
  const all = getSeriesSettingsMem(ctx);
  all[seriesId] = { settings: (settings && typeof settings === 'object') ? settings : {}, updatedAt: Date.now() };
  ctx.storage.writeJSONDebounced(p, all);
  return { ok: true };
}

/**
 * Clear settings for a series.
 * Lifted from Build 77 index.js lines 4124-4131.
 */
async function clear(ctx, _evt, seriesId) {
  if (!seriesId) return { ok: false };
  const p = ctx.storage.dataPath('series_settings.json');
  const all = getSeriesSettingsMem(ctx);
  delete all[seriesId];
  ctx.storage.writeJSONDebounced(p, all);
  return { ok: true };
}

module.exports = {
  getAll,
  get,
  save,
  clear,
};
