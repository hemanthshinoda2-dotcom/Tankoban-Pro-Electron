/*
TankobanPlus — Video Progress Domain (Build 78A, Phase 4 Checkpoint A)

Handles video playback progress persistence.
Extracted from Build 77 IPC registry lines 2287-2420 with ZERO behavior changes.
*/

// ========== MODULE STATE ==========

/**
 * Tankoban Plus Build 1: video progress cache.
 * Lifted from Build 77 index.js line 2287.
 */
let videoProgressMem = null;

/**
 * Get cached video progress data, loading from disk if needed.
 * Lifted from Build 77 index.js lines 2296-2300.
 */
function getVideoProgressMem(ctx) {
  if (videoProgressMem) return videoProgressMem;
  videoProgressMem = ctx.storage.readJSON(ctx.storage.dataPath('video_progress.json'), {});
  return videoProgressMem;
}

// ========== DOMAIN HANDLERS ==========

/**
 * Get all video progress.
 * Lifted from Build 77 index.js lines 2388-2391.
 */
async function getAll(ctx) {
  const all = getVideoProgressMem(ctx);
  return { ...all };
}

/**
 * Get progress for a specific video.
 * Lifted from Build 77 index.js lines 2393-2396.
 */
async function get(ctx, _evt, videoId) {
  const all = getVideoProgressMem(ctx);
  return all[videoId] || null;
}

/**
 * Save progress for a video.
 * Lifted from Build 77 index.js lines 2398-2404.
 */
async function save(ctx, _evt, videoId, progress) {
  const p = ctx.storage.dataPath('video_progress.json');
  const all = getVideoProgressMem(ctx);
  const prev = (all && all[videoId] && typeof all[videoId] === 'object') ? all[videoId] : {};
  const next = {};
  if (progress && typeof progress === 'object') {
    for (const [k, v] of Object.entries(progress)) {
      if (v !== undefined) next[k] = v;
    }
  }
  all[videoId] = { ...prev, ...next, updatedAt: Date.now() };
  ctx.storage.writeJSONDebounced(p, all);
  return { ok: true, value: all[videoId] };
}

/**
 * Clear progress for a video.
 * Lifted from Build 77 index.js lines 2406-2412.
 */
async function clear(ctx, _evt, videoId) {
  const p = ctx.storage.dataPath('video_progress.json');
  const all = getVideoProgressMem(ctx);
  delete all[videoId];
  ctx.storage.writeJSONDebounced(p, all);
  return { ok: true };
}

/**
 * Clear all video progress.
 * Lifted from Build 77 index.js lines 2414-2420.
 */
async function clearAll(ctx) {
  const p = ctx.storage.dataPath('video_progress.json');
  const all = getVideoProgressMem(ctx);
  for (const k of Object.keys(all)) delete all[k];
  ctx.storage.writeJSONDebounced(p, all);
  return { ok: true };
}

module.exports = {
  getAll,
  get,
  save,
  clear,
  clearAll,
};
