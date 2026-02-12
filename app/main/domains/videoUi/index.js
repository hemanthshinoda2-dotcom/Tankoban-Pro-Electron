/*
TankobanPlus — Video UI State Domain (Build 78A, Phase 4 Checkpoint A)

Handles video player UI state persistence.
Extracted from Build 77 IPC registry lines 2289-2466 with ZERO behavior changes.
*/

// ========== MODULE STATE ==========

/**
 * Tankoban Plus Build 3.5: video UI state cache.
 * Lifted from Build 77 index.js line 2289.
 */
let videoUiStateMem = null;

/**
 * Normalize video UI state structure.
 * Lifted from Build 77 index.js lines 2330-2336.
 */
function normalizeVideoUiState(raw) {
  if (raw && typeof raw === 'object') {
    if (raw.ui && typeof raw.ui === 'object') return raw;
    return { ui: { ...raw }, updatedAt: Date.now() };
  }
  return { ui: {}, updatedAt: 0 };
}

/**
 * Get cached video UI state data, loading from disk if needed.
 * Lifted from Build 77 index.js lines 2338-2343.
 */
function getVideoUiStateMem(ctx) {
  if (videoUiStateMem) return videoUiStateMem;
  const p = ctx.storage.dataPath('video_ui_state.json');
  videoUiStateMem = normalizeVideoUiState(ctx.storage.readJSON(p, {}));
  return videoUiStateMem;
}

// ========== DOMAIN HANDLERS ==========

/**
 * Get video UI state.
 * Lifted from Build 77 index.js lines 2446-2449.
 */
async function get(ctx) {
  const v = getVideoUiStateMem(ctx);
  return { ui: { ...(v.ui || {}) }, updatedAt: v.updatedAt || 0 };
}

/**
 * Save video UI state with merge.
 * Lifted from Build 77 index.js lines 2451-2459.
 */
async function save(ctx, _evt, ui) {
  const p = ctx.storage.dataPath('video_ui_state.json');
  const v = getVideoUiStateMem(ctx);
  const next = (ui && typeof ui === 'object') ? ui : {};
  v.ui = { ...(v.ui || {}), ...next };
  v.updatedAt = Date.now();
  ctx.storage.writeJSONDebounced(p, v);
  return { ok: true, value: { ui: { ...(v.ui || {}) }, updatedAt: v.updatedAt } };
}

/**
 * Clear video UI state.
 * Lifted from Build 77 index.js lines 2461-2466.
 */
async function clear(ctx) {
  const p = ctx.storage.dataPath('video_ui_state.json');
  videoUiStateMem = { ui: {}, updatedAt: Date.now() };
  ctx.storage.writeJSONDebounced(p, videoUiStateMem);
  return { ok: true };
}

module.exports = {
  get,
  save,
  clear,
};
