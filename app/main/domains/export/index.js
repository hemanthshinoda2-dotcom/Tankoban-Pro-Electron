/*
TankobanPlus — Export Domain (Build 78B, Phase 4 Checkpoint B)

Handles export operations: save entry to disk, copy entry to clipboard.
Extracted from Build 78A IPC registry with ZERO behavior changes.

BUILD21_EXPORT_UTILS (Build 21)
INTENT: Export must reuse existing CBZ/CBR session readers.
*/

const { dialog, clipboard, nativeImage } = require('electron');
const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// ========== HELPER FUNCTIONS ==========

/**
 * Get window from IPC event sender.
 * Duplicated from window domain for independence.
 */
function winFromEvt(evt) {
  try {
    const w = BrowserWindow.fromWebContents(evt?.sender);
    if (w && !w.isDestroyed()) return w;
  } catch {}
  try {
    const w2 = BrowserWindow.getFocusedWindow();
    if (w2 && !w2.isDestroyed()) return w2;
  } catch {}
  return null;
}

/**
 * Read comic entry bytes from CBZ/CBR session.
 * This requires access to archives domain functions.
 * For now, we'll need to import from archives or handle differently.
 * 
 * Lifted from Build 78A index.js lines 2248-2252.
 */
async function readComicEntryBytes(kind, sessionId, entryIndex, archivesDomain) {
  const k = String(kind || '');
  if (k === 'cbr') {
    const ab = await archivesDomain.cbrReadEntry(null, null, sessionId, entryIndex);
    return Buffer.from(ab);
  }
  const ab = await archivesDomain.cbzReadEntry(null, null, sessionId, entryIndex);
  return Buffer.from(ab);
}

// ========== DOMAIN HANDLERS ==========

/**
 * Save entry to disk via save dialog.
 * BUILD21_EXPORT_UTILS (Build 21)
 * Lifted from Build 78A index.js lines 2254-2281.
 */
async function saveEntry(ctx, evt, payload) {
  try {
    const w = winFromEvt(evt) || ctx.win;

    const kind = String(payload?.kind || 'cbz'); // 'cbz' | 'cbr'
    const sessionId = String(payload?.sessionId || '');
    const entryIndex = Number(payload?.entryIndex);

    if (!sessionId || !Number.isFinite(entryIndex)) return { ok: false };

    const suggestedNameRaw = String(payload?.suggestedName || 'page.png');
    const suggestedName = path.basename(suggestedNameRaw);

    const ext = (suggestedName.toLowerCase().match(/\.(png|jpe?g|webp)$/)?.[1]) || 'png';
    const res = await dialog.showSaveDialog(w, {
      title: 'Save current page',
      defaultPath: suggestedName,
      filters: [{ name: 'Image', extensions: [ext === 'jpg' ? 'jpg' : ext] }, { name: 'All Files', extensions: ['*'] }],
    });
    if (!res || res.canceled || !res.filePath) return { ok: false };

    // Need access to archives domain to read entry
    // For now, we'll import it
    const archives = require('../archives');
    const buf = await readComicEntryBytes(kind, sessionId, entryIndex, archives);
    await fs.promises.writeFile(res.filePath, buf);
    return { ok: true, filePath: res.filePath };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * Copy entry to clipboard.
 * Lifted from Build 78A index.js lines 2283-2300.
 */
async function copyEntry(ctx, _evt, payload) {
  try {
    const kind = String(payload?.kind || 'cbz');
    const sessionId = String(payload?.sessionId || '');
    const entryIndex = Number(payload?.entryIndex);
    if (!sessionId || !Number.isFinite(entryIndex)) return { ok: false };

    // Need access to archives domain to read entry
    const archives = require('../archives');
    const buf = await readComicEntryBytes(kind, sessionId, entryIndex, archives);

    // nativeImage supports PNG/JPEG reliably. WebP support can vary; treat failure as non-fatal.
    const img = nativeImage.createFromBuffer(buf);
    if (!img || img.isEmpty()) return { ok: false };
    clipboard.writeImage(img);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

module.exports = {
  saveEntry,
  copyEntry,
};
