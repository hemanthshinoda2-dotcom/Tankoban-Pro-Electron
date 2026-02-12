/*
TankobanPlus — Comic Domain (Build 78D, Phase 4 Checkpoint D)

Open-file utilities and "book" object construction.
Lifted from Build 78C IPC registry with ZERO behavior changes.
*/

const fs = require('fs');
const path = require('path');
const { dialog, BrowserWindow } = require('electron');

let win = null; // Keep `win` only as a last-resort fallback (Build 21)

// Keep ctx.win in sync for winFromEvt() fallback.
function __bindCtx(ctx) {
  try { win = (ctx && ctx.win) ? ctx.win : win; } catch {}
}

// BUILD21_MULTI_WINDOW (Build 21)
// INTENT: Allow multiple independent reader windows without changing the renderer architecture.
// We keep `win` only as a last-resort fallback; all IPC should prefer the calling window.
function winFromEvt(evt) {
  // Prefer the calling window so dialogs/fullscreen affect the correct instance.
  try {
    const w = BrowserWindow.fromWebContents(evt?.sender);
    if (w && !w.isDestroyed()) return w;
  } catch {}
  try {
    const w2 = BrowserWindow.getFocusedWindow();
    if (w2 && !w2.isDestroyed()) return w2;
  } catch {}
  return win;
}

function seriesIdForFolder(folderPath) {
  return Buffer.from(folderPath).toString('base64url');
}

function bookIdForPath(p, st) {
  // Stable enough for resume: absolute path + size + modified time.
  return Buffer.from(`${p}::${st.size}::${st.mtimeMs}`).toString('base64url');
}

// ---------- IPC: Open File (no library add) ----------
// BUILD 19E_OPEN_FILE (Build 19E)
async function openFileDialog(ctx, evt) {
  __bindCtx(ctx);
  try {
    const w = winFromEvt(evt);
    const res = await dialog.showOpenDialog(w, {
      title: 'Open comic file',
      properties: ['openFile'],
      filters: [
        { name: 'Comic Book Archives', extensions: ['cbz', 'cbr'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (!res || res.canceled || !res.filePaths?.[0]) return { ok: false };

    const fp = res.filePaths[0];
    const st = await fs.promises.stat(fp);
    if (!st || !st.isFile()) return { ok: false };

    const folder = path.dirname(fp);
    const seriesId = seriesIdForFolder(folder);
    const series = path.basename(folder);
    const title = path.basename(fp).replace(/\.(cbz|cbr)$/i, '');
    const id = bookIdForPath(fp, st);

    return { ok: true, book: { id, title, seriesId, series, path: fp, size: st.size, mtimeMs: st.mtimeMs } };
  } catch {
    return { ok: false };
  }
}

// BUILD26_BOOK_FROM_PATH (Build 26)
// INTENT: Given an on-disk path, return the same "book" object shape used by Open File dialog.
async function bookFromPath(ctx, _evt, filePath) {
  __bindCtx(ctx);
  try {
    const fp = String(filePath || '');
    if (!fp || !/\.(cbz|cbr)$/i.test(fp)) return { ok: false };

    const st = await fs.promises.stat(fp);
    if (!st || !st.isFile()) return { ok: false };

    const folder = path.dirname(fp);
    const seriesId = seriesIdForFolder(folder);
    const series = path.basename(folder);
    const title = path.basename(fp).replace(/\.(cbz|cbr)$/i, '');
    const id = bookIdForPath(fp, st);

    return { ok: true, book: { id, title, seriesId, series, path: fp, size: st.size, mtimeMs: st.mtimeMs } };
  } catch {
    return { ok: false };
  }
}

module.exports = {
  openFileDialog,
  bookFromPath,
};
