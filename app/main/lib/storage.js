/*
TankobanPlus — Storage Library (Build 78A, Phase 4 Checkpoint A)

OWNERSHIP: Centralized persistence utilities.
Lift-and-place from Build 77 IPC registry with ZERO semantic changes.

Rules:
- File names, paths, merge logic, debounce timing MUST match Build 77 exactly
- No "improvements" or refactoring
- All behavior preserved bit-for-bit
*/

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// ========== DATA PATH ==========

/**
 * Build file path in app's userData directory.
 * Lifted from Build 77 index.js line 380-382.
 */
function dataPath(file) {
  return path.join(app.getPath('userData'), file);
}

// ========== JSON I/O ==========

/**
 * Read JSON file safely with fallback.
 * Lifted from Build 77 index.js line 384-386.
 */
function readJSON(p, fallback) {
  const bakPath = `${p}.bak`;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    // Improvement 2 (Build 86): attempt last-known-good backup restore
    try {
      const bak = JSON.parse(fs.readFileSync(bakPath, 'utf-8'));
      try { writeJSON(p, bak); } catch {}
      return bak;
    } catch {
      return fallback;
    }
  }
}

/**
 * Write JSON file safely with directory creation.
 * BUILD 88 FIX 2.1: Made async to prevent blocking main process.
 * BUILD 88 FIX 3.1: Added performance timing for slow writes.
 * Lifted from Build 77 index.js line 388-391.
 */
async function writeJSON(p, obj) {
  const startTime = Date.now();
  fs.mkdirSync(path.dirname(p), { recursive: true });

  // Improvement 2 (Build 86): atomic JSON writes + last-known-good backup
  const json = JSON.stringify(obj, null, 2);
  const dir = path.dirname(p);
  const tmp = path.join(dir, `.${path.basename(p)}.${process.pid}.${Date.now()}.tmp`);
  const bakPath = `${p}.bak`;

  // BUILD 88 FIX 2.1: Use async file operations with retry logic
  let retries = 3;
  while (retries > 0) {
    try {
      // Write temp file
  // TRACE:PERSIST_WRITE await fs.promises.writeFile(tmp, json, 'utf-8');
      await fs.promises.writeFile(tmp, json, 'utf-8');
      
      // Replace target (prefer atomic rename)
      try {
        await fs.promises.rename(tmp, p);
      } catch (e) {
        // Fallback: some environments may not replace existing files via rename
        try { await fs.promises.copyFile(tmp, p); } catch {}
        try { await fs.promises.unlink(tmp); } catch {}
      }

      // Update last-known-good backup
      try { await fs.promises.copyFile(p, bakPath); } catch {}
      
      // BUILD 88 FIX 3.1: Log slow writes
      const duration = Date.now() - startTime;
      if (duration > 10) {
        console.log(`[PERF] writeJSON(${path.basename(p)}): ${duration}ms`);
      }
      
      return; // Success
    } catch (error) {
      retries--;
      if (retries === 0) throw error;
      // Wait a bit before retry
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

// ========== DEBOUNCED WRITES ==========

/**
 * BUILD 16: debounce frequent JSON writes (progress/settings) to reduce disk churn.
 * Lifted from Build 77 index.js line 393-410.
 * Map: filePath -> { timer, latestObj }
 */
const debouncedJSONWrites = new Map();

/**
 * Write JSON with debounce to reduce disk churn.
 * BUILD 88 FIX 2.1: writeJSON is now async.
 * Preserves exact delay and flush behavior from Build 77.
 */
function writeJSONDebounced(p, obj, delayMs = 150) {
  const prev = debouncedJSONWrites.get(p);
  if (prev?.timer) clearTimeout(prev.timer);

  debouncedJSONWrites.set(p, {
    latestObj: obj,
    timer: setTimeout(async () => {
      const cur = debouncedJSONWrites.get(p);
      if (!cur) return;
      try { await writeJSON(p, cur.latestObj); } catch (err) {
        // FIX_BATCH4: Log debounced write failures instead of silently swallowing
        try { console.error('[storage] Debounced write failed:', p, err?.message || err); } catch {}
      }
      debouncedJSONWrites.delete(p);
    }, delayMs),
  });
}

/**
 * Flush all pending debounced writes immediately.
 * BUILD 88 FIX 2.1: writeJSON is now async.
 * Used during app shutdown or critical save points.
 */
async function flushAllWrites() {
  const promises = [];
  for (const [p, entry] of debouncedJSONWrites.entries()) {
    if (entry.timer) clearTimeout(entry.timer);
    promises.push(writeJSON(p, entry.latestObj).catch(() => {}));
  }
  await Promise.all(promises);
  debouncedJSONWrites.clear();
}

module.exports = {
  dataPath,
  readJSON,
  writeJSON,
  writeJSONDebounced,
  flushAllWrites,
};
