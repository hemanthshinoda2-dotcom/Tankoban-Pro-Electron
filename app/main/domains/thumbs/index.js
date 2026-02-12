/*
TankobanPlus — Thumbs Domain (Build 78C, Phase 4 Checkpoint C)

Handles thumbnail and poster management:
- Page thumbnails (comic book pages)
- Video posters (show cover images)

Extracted from Build 78B IPC registry with ZERO behavior changes.
*/

const fs = require('fs');
const path = require('path');
const { clipboard, nativeImage } = require('electron');
const { pathToFileURL } = require('url');

// ========== PAGE THUMBNAILS ==========

/**
 * Get path for a page thumbnail.
 * Lifted from Build 78B index.js lines 1743-1747.
 */
function pageThumbPath(ctx, bookId, pageIndex) {
  const { app } = require('electron');
  const safeBook = String(bookId || 'unknown');
  const safeIdx = String(pageIndex || 0);
  return path.join(app.getPath('userData'), 'page_thumbs', safeBook, `${safeIdx}.jpg`);
}

/**
 * Check if page thumbnail exists.
 * Lifted from Build 78B index.js lines 1749-1755.
 */
async function pageThumbsHas(ctx, _evt, bookId, pageIndex) {
  try {
    return fs.existsSync(pageThumbPath(ctx, bookId, pageIndex));
  } catch {
    return false;
  }
}

/**
 * Get page thumbnail as file URL.
 * Lifted from Build 78B index.js lines 1757-1766.
 */
async function pageThumbsGet(ctx, _evt, bookId, pageIndex) {
  try {
    const p = pageThumbPath(ctx, bookId, pageIndex);
    if (!fs.existsSync(p)) return null;
    // BUILD16B_PAGE_THUMBS_FILE_URL: Avoid base64 + IPC bloat.
    return pathToFileURL(p).toString();
  } catch {
    return null;
  }
}

/**
 * Save page thumbnail from data URL.
 * Lifted from Build 78B index.js lines 1768-1781.
 */
async function pageThumbsSave(ctx, _evt, bookId, pageIndex, dataUrl) {
  try {
    if (!dataUrl || typeof dataUrl !== 'string') return { ok: false };
    const m = dataUrl.match(/^data:image\/(jpeg|jpg);base64,(.+)$/);
    if (!m) return { ok: false };
    const bytes = Buffer.from(m[2], 'base64');
    const p = pageThumbPath(ctx, bookId, pageIndex);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, bytes);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ========== VIDEO POSTERS ==========

/**
 * Sanitize show ID for safe filesystem use.
 * Lifted from Build 78B index.js lines 1637-1643.
 */
function safeVideoPosterId(showId) {
  try {
    return String(showId || 'unknown').replace(/[^a-z0-9_-]/gi, '_');
  } catch {
    return 'unknown';
  }
}

/**
 * Get poster file paths for a show.
 * Lifted from Build 78B index.js lines 1645-1653.
 */
function videoPosterPaths(showId) {
  const { app } = require('electron');
  const safeId = safeVideoPosterId(showId);
  const dir = path.join(app.getPath('userData'), 'video_posters');
  return {
    dir,
    jpg: path.join(dir, `${safeId}.jpg`),
    png: path.join(dir, `${safeId}.png`),
  };
}

/**
 * Get existing poster path (jpg or png).
 * Lifted from Build 78B index.js lines 1655-1664.
 */
function getExistingVideoPosterPath(showId) {
  try {
    const p = videoPosterPaths(showId);
    if (fs.existsSync(p.jpg)) return p.jpg;
    if (fs.existsSync(p.png)) return p.png;
    return null;
  } catch {
    return null;
  }
}

/**
 * Get video poster as file URL.
 * Lifted from Build 78B index.js lines 1666-1674.
 */
async function videoPosterGet(ctx, _evt, showId) {
  try {
    const p = getExistingVideoPosterPath(showId);
    if (!p) return null;
    return pathToFileURL(p).toString();
  } catch {
    return null;
  }
}

/**
 * Check if video poster exists.
 * Lifted from Build 78B index.js lines 1676-1682.
 */
async function videoPosterHas(ctx, _evt, showId) {
  try {
    return !!getExistingVideoPosterPath(showId);
  } catch {
    return false;
  }
}

/**
 * Delete video poster.
 * Lifted from Build 78B index.js lines 1684-1693.
 */
async function videoPosterDelete(ctx, _evt, showId) {
  try {
    const p = videoPosterPaths(showId);
    if (fs.existsSync(p.jpg)) fs.unlinkSync(p.jpg);
    if (fs.existsSync(p.png)) fs.unlinkSync(p.png);

    // If this poster was an auto-generated show thumbPath persisted in video_index.json,
    // clear that stale reference so "Remove poster" survives app restart.
    try {
      const { app } = require('electron');
      const idxPath = path.join(app.getPath('userData'), 'video_index.json');
      if (fs.existsSync(idxPath)) {
        const idx = JSON.parse(fs.readFileSync(idxPath, 'utf-8'));
        const shows = Array.isArray(idx?.shows) ? idx.shows : null;
        if (shows) {
          const norm = (v) => String(v || '').replace(/\\/g, '/').toLowerCase();
          const tJ = norm(p.jpg);
          const tP = norm(p.png);
          let changed = false;
          for (const s of shows) {
            const tp = norm(s?.thumbPath);
            if (!tp) continue;
            if (tp === tJ || tp === tP) {
              s.thumbPath = null;
              changed = true;
            }
          }
          if (changed) fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2), 'utf-8');
        }
      }
    } catch {}

    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Save video poster from data URL.
 * Lifted from Build 78B index.js lines 1695-1710.
 */
async function videoPosterSave(ctx, _evt, showId, dataUrl) {
  try {
    if (!dataUrl || typeof dataUrl !== 'string') return { ok: false };
    const m = dataUrl.match(/^data:image\/jpeg;base64,(.+)$/);
    if (!m) return { ok: false };
    const bytes = Buffer.from(m[1], 'base64');
    const p = videoPosterPaths(showId);
    fs.mkdirSync(p.dir, { recursive: true });
    fs.writeFileSync(p.jpg, bytes);
    // Remove any old png variant so get() is deterministic.
    if (fs.existsSync(p.png)) fs.unlinkSync(p.png);
    return { ok: true, url: pathToFileURL(p.jpg).toString() };
  } catch {
    return { ok: false };
  }
}

/**
 * Paste video poster from clipboard.
 * Lifted from Build 78B index.js lines 1712-1739.
 */
async function videoPosterPaste(ctx, _evt, showId) {
  try {
    const img = clipboard.readImage();
    if (!img || img.isEmpty()) return { ok: false, reason: 'no_image' };

    const p = videoPosterPaths(showId);
    fs.mkdirSync(p.dir, { recursive: true });

    let bytes = null;
    let outPath = p.jpg;

    try { bytes = img.toJPEG(82); } catch {}
    if (!bytes || !bytes.length) {
      try { bytes = img.toPNG(); outPath = p.png; } catch {}
    }

    if (!bytes || !bytes.length) return { ok: false, reason: 'encode_failed' };

    fs.writeFileSync(outPath, Buffer.from(bytes));
    // If we wrote png, remove jpg (and vice versa) so get() stays predictable.
    if (outPath.endsWith('.png') && fs.existsSync(p.jpg)) fs.unlinkSync(p.jpg);
    if (outPath.endsWith('.jpg') && fs.existsSync(p.png)) fs.unlinkSync(p.png);

    return { ok: true, url: pathToFileURL(outPath).toString() };
  } catch {
    return { ok: false, reason: 'error' };
  }
}


// ========== BOOK THUMBNAILS ==========

// ---------- IPC: Thumbnails (book cover thumbs) ----------

async function thumbsGet(ctx, _evt, bookId) {
  try {
    const { app } = require('electron');
    const p = path.join(app.getPath('userData'), 'thumbs', `${bookId}.jpg`);
    if (!fs.existsSync(p)) return null;
    // BUILD16B_THUMBS_FILE_URL: Avoid base64 + IPC bloat. Let <img> load from file:// URL.
    return pathToFileURL(p).toString();
  } catch {
    return null;
  }
}

async function thumbsDelete(ctx, _evt, bookId) {
  try {
    const { app } = require('electron');
    const p = path.join(app.getPath('userData'), 'thumbs', `${bookId}.jpg`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function thumbsHas(ctx, _evt, bookId) {
  try {
    const { app } = require('electron');
    const p = path.join(app.getPath('userData'), 'thumbs', `${bookId}.jpg`);
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

async function thumbsSave(ctx, _evt, bookId, dataUrl) {
  try {
    const { app } = require('electron');
    if (!dataUrl || typeof dataUrl !== 'string') return { ok: false };
    const m = dataUrl.match(/^data:image\/jpeg;base64,(.+)$/);
    if (!m) return { ok: false };
    const bytes = Buffer.from(m[1], 'base64');
    const dir = path.join(app.getPath('userData'), 'thumbs');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${bookId}.jpg`), bytes);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}


module.exports = {
  // Book thumbnails
  thumbsGet,
  thumbsDelete,
  thumbsHas,
  thumbsSave,

  // Page thumbnails
  pageThumbsHas,
  pageThumbsGet,
  pageThumbsSave,
  
  // Video posters
  videoPosterGet,
  videoPosterHas,
  videoPosterDelete,
  videoPosterSave,
  videoPosterPaste,
};
