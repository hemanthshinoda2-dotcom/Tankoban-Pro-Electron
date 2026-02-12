/*
TankobanPlus — Shell Domain (Build 78B, Phase 4 Checkpoint B)

Handles shell operations: reveal path, open path, show item in folder.
Extracted from Build 78A IPC registry with ZERO behavior changes.
*/

const { shell } = require('electron');
const fs = require('fs');

// ========== HELPER FUNCTIONS ==========

/**
 * Safe stat helper.
 * This is used by shell handlers to check if path is directory or file.
 */
function statSafe(p) {
  try { return fs.statSync(p); } catch { return null; }
}

// ========== DOMAIN HANDLERS ==========

/**
 * Reveal path in file explorer.
 * For directories: opens the folder.
 * For files: reveals the file in its parent folder.
 * Lifted from Build 78A index.js lines 1517-1535.
 */
async function revealPath(ctx, _evt, targetPath) {
  try {
    const p = String(targetPath || '');
    if (!p) return { ok: false };

    const st = statSafe(p);
    if (st && st.isDirectory()) {
      // For folders: open the folder in the system file manager.
      const err = await shell.openPath(p);
      return err ? { ok: false, error: err } : { ok: true };
    }

    // For files (or unknown): reveal in the parent folder.
    shell.showItemInFolder(p);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

module.exports = {
  revealPath,
};
