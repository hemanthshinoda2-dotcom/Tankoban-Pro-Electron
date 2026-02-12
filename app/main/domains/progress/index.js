/*
TankobanPlus — Progress Domain (Build 78A, Phase 4 Checkpoint A)

Handles comic book reading progress persistence.
Extracted from Build 77 IPC registry lines 2284-2386 with ZERO behavior changes.
*/

// ========== MODULE STATE ==========

/**
 * BUILD16B_MEM_CACHE: Avoid sync disk reads + JSON parse on every progress IPC call.
 * Lifted from Build 77 index.js line 2284.
 */
let progressMem = null;

/**
 * Get cached progress data, loading from disk if needed.
 * Lifted from Build 77 index.js lines 2290-2294.
 */
function getProgressMem(ctx) {
  if (progressMem) return progressMem;
  progressMem = ctx.storage.readJSON(ctx.storage.dataPath('progress.json'), {});
  return progressMem;
}

// ========== DOMAIN HANDLERS ==========

/**
 * Get all comic progress.
 * Lifted from Build 77 index.js lines 2353-2356.
 */
async function getAll(ctx) {
  const all = getProgressMem(ctx);
  return { ...all }; // defensive copy
}

/**
 * Get progress for a specific book.
 * Lifted from Build 77 index.js lines 2358-2361.
 */
async function get(ctx, _evt, bookId) {
  const all = getProgressMem(ctx);
  return all[bookId] || null;
}

/**
 * Save progress for a book.
 * Lifted from Build 77 index.js lines 2363-2369.
 */
async function save(ctx, _evt, bookId, progress) {
  const p = ctx.storage.dataPath('progress.json');
  const all = getProgressMem(ctx);
  all[bookId] = { ...progress, updatedAt: Date.now() };
  ctx.storage.writeJSONDebounced(p, all);
  return { ok: true };
}

/**
 * Clear progress for a book.
 * Lifted from Build 77 index.js lines 2371-2377.
 */
async function clear(ctx, _evt, bookId) {
  const p = ctx.storage.dataPath('progress.json');
  const all = getProgressMem(ctx);
  delete all[bookId];
  ctx.storage.writeJSONDebounced(p, all);
  return { ok: true };
}

/**
 * Clear all comic progress.
 * Lifted from Build 77 index.js lines 2379-2385.
 */
async function clearAll(ctx) {
  const p = ctx.storage.dataPath('progress.json');
  const all = getProgressMem(ctx);
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
  // Internal accessor for library domain's progress pruning
  _getProgressMem: getProgressMem,
};
