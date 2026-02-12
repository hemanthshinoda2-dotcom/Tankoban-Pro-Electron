/*
Tankoban Build 21 - Folder Thumbnail Auto-Generation

Generates thumbnails for video folders that don't have custom thumbnails.
- Checks for custom thumbnails first (folder.jpg, poster.jpg, cover.jpg, thumbnail.jpg/png)
- Generates from first video in folder if no custom thumb exists
- Caches generated thumbnails in userData
- Throttles to 1 concurrent generation
*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

// ========== CUSTOM THUMBNAIL DETECTION ==========

const CUSTOM_THUMB_NAMES = ['folder', 'poster', 'cover', 'thumbnail'];
const IMG_EXTS = ['.jpg', '.jpeg', '.png'];

/**
 * Check if folder has a custom thumbnail (case-insensitive).
 * Returns the path if found, null otherwise.
 */
function findCustomThumbnail(folderPath) {
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    const files = entries
      .filter(e => e && e.isFile && e.isFile())
      .map(e => e.name);

    const lower = new Map();
    for (const f of files) {
      lower.set(String(f).toLowerCase(), f);
    }

    for (const base of CUSTOM_THUMB_NAMES) {
      for (const ext of IMG_EXTS) {
        const want = `${base}${ext}`;
        const hit = lower.get(want);
        if (hit) {
          const full = path.join(folderPath, hit);
          try {
            const st = fs.statSync(full);
            if (st.isFile() && st.size > 0) return full;
          } catch {}
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ========== GENERATED THUMBNAIL CACHE ==========

/**
 * Get cache directory for generated thumbnails.
 */
function getCacheDir(ctx) {
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'folder_thumbs_cache');
}

/**
 * Get deterministic cache filename for a folder.
 */
function getCachePath(ctx, folderPath) {
  try {
    const abs = path.resolve(folderPath);
    const hash = crypto.createHash('sha256').update(abs).digest('hex').substring(0, 16);
    const dir = getCacheDir(ctx);
    return path.join(dir, `${hash}.jpg`);
  } catch {
    return null;
  }
}

/**
 * Check if generated thumbnail exists in cache.
 */
function hasCachedThumb(ctx, folderPath) {
  try {
    const p = getCachePath(ctx, folderPath);
    if (!p) return false;
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/**
 * Get cached thumbnail path if it exists.
 */
function getCachedThumb(ctx, folderPath) {
  try {
    const p = getCachePath(ctx, folderPath);
    if (!p) return null;
    if (!fs.existsSync(p)) return null;
    const st = fs.statSync(p);
    if (!st.isFile() || st.size === 0) return null;
    return p;
  } catch {
    return null;
  }
}

// ========== VIDEO FILE DETECTION ==========

const VIDEO_EXTS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.m4v', '.webm',
  '.ts', '.m2ts', '.wmv', '.flv', '.mpeg', '.mpg', '.3gp'
]);

function isVideoFile(filename) {
  try {
    const ext = path.extname(filename).toLowerCase();
    return VIDEO_EXTS.has(ext);
  } catch {
    return false;
  }
}

/**
 * Find first video file in folder.
 */
function findFirstVideo(folderPath) {
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    const videos = entries
      .filter(e => e && e.isFile && e.isFile() && isVideoFile(e.name))
      .map(e => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    
    if (videos.length === 0) return null;
    
    const videoPath = path.join(folderPath, videos[0]);
    try {
      const st = fs.statSync(videoPath);
      if (st.isFile() && st.size > 0) return videoPath;
    } catch {}
    
    return null;
  } catch {
    return null;
  }
}

// ========== MPV FRAME EXTRACTION ==========

function resolveBundledMpvExe(ctx) {
  try {
    if (process.platform !== 'win32') return null;

    const { app } = require('electron');
    
    // Packaged locations
    if (app && app.isPackaged) {
      const c1 = path.join(process.resourcesPath, 'mpv', 'windows', 'mpv.exe');
      if (fs.existsSync(c1)) return c1;
      
      const c2 = path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'mpv', 'windows', 'mpv.exe');
      if (fs.existsSync(c2)) return c2;
    }

    // Development
    const c3 = path.join(ctx.APP_ROOT, 'resources', 'mpv', 'windows', 'mpv.exe');
    if (fs.existsSync(c3)) return c3;

    return null;
  } catch {
    return null;
  }
}

function spawnMpvGrabFrame(mpvExe, videoPath, outPath) {
  return new Promise((resolve) => {
    try {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
    } catch {}

    const args = [
      '--no-config',
      '--no-terminal',
      '--msg-level=all=no',
      '--ao=null',
      '--vo=image',
      '--frames=1',
      '--start=10',
      '--vo-image-format=jpg',
      `--vo-image-outdir=${path.dirname(outPath)}`,
      videoPath,
    ];

    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(ok);
    };

    const p = spawn(mpvExe, args, { windowsHide: true });
    p.on('error', () => finish(false));
    p.on('exit', (code) => {
      if (code !== 0) return finish(false);
      
      // mpv may use a numbered output name; normalize to the expected cache path.
      try {
        if (fs.existsSync(outPath)) {
          const st = fs.statSync(outPath);
          if (st.isFile() && st.size > 0) return finish(true);
        }

        const outDir = path.dirname(outPath);
        const files = fs.readdirSync(outDir)
          .filter(f => String(f).toLowerCase().endsWith('.jpg'))
          .map(f => path.join(outDir, f));
        if (files.length) {
          let best = null;
          let bestM = -1;
          for (const full of files) {
            let mt = 0;
            try {
              const st = fs.statSync(full);
              if (st && st.isFile() && st.size > 0) mt = Number(st.mtimeMs || 0);
            } catch {}
            if (mt > bestM) { bestM = mt; best = full; }
          }
          if (best) {
            try { fs.copyFileSync(best, outPath); } catch {}
            try {
              const st2 = fs.statSync(outPath);
              if (st2.isFile() && st2.size > 0) return finish(true);
            } catch {}
          }
        }
      } catch {}
      
      finish(false);
    });

    // Timeout safeguard
    setTimeout(() => finish(false), 15000);
  });
}

// ========== GENERATION QUEUE ==========

let generationQueue = [];
let isGenerating = false;

async function processQueue(ctx) {
  if (isGenerating || generationQueue.length === 0) return;
  
  isGenerating = true;
  
  while (generationQueue.length > 0) {
    const item = generationQueue.shift();
    try {
      await generateThumbnailForFolder(ctx, item.folderPath, item.callback);
    } catch (err) {
      if (item.callback) item.callback(null);
    }
  }
  
  isGenerating = false;
}

function queueGeneration(ctx, folderPath, callback) {
  generationQueue.push({ folderPath, callback });
  setImmediate(() => processQueue(ctx));
}

// ========== THUMBNAIL GENERATION ==========

async function generateThumbnailForFolder(ctx, folderPath, callback) {
  try {
    // 1. Check for custom thumbnail
    const customThumb = findCustomThumbnail(folderPath);
    if (customThumb) {
      if (callback) callback(customThumb);
      return customThumb;
    }

    // 2. Check cache
    const cachedThumb = getCachedThumb(ctx, folderPath);
    if (cachedThumb) {
      if (callback) callback(cachedThumb);
      return cachedThumb;
    }

    // 3. Find video to extract from
    const videoPath = findFirstVideo(folderPath);
    if (!videoPath) {
      if (callback) callback(null);
      return null;
    }

    // 4. Extract frame
    const mpvExe = resolveBundledMpvExe(ctx);
    if (!mpvExe) {
      if (callback) callback(null);
      return null;
    }

    const outPath = getCachePath(ctx, folderPath);
    if (!outPath) {
      if (callback) callback(null);
      return null;
    }

    const ok = await spawnMpvGrabFrame(mpvExe, videoPath, outPath);
    
    if (ok && fs.existsSync(outPath)) {
      if (callback) callback(outPath);
      return outPath;
    } else {
      if (callback) callback(null);
      return null;
    }
  } catch (err) {
    if (callback) callback(null);
    return null;
  }
}

// ========== PUBLIC API ==========

/**
 * Get thumbnail for a folder (custom or generated).
 * Returns immediately if already available, queues generation if not.
 */
async function getFolderThumbnail(ctx, _evt, folderPath, options = {}) {
  try {
    // 1. Custom thumbnail wins
    const customThumb = findCustomThumbnail(folderPath);
    if (customThumb) {
      return { ok: true, path: customThumb, type: 'custom' };
    }

    // 2. Check cache
    const cachedThumb = getCachedThumb(ctx, folderPath);
    if (cachedThumb) {
      return { ok: true, path: cachedThumb, type: 'generated' };
    }

    // 3. Queue generation if requested
    if (options.generate) {
      queueGeneration(ctx, folderPath, null);
      return { ok: true, path: null, type: 'pending' };
    }

    return { ok: true, path: null, type: 'none' };
  } catch {
    return { ok: false };
  }
}

/**
 * Request thumbnail generation for a folder.
 */
async function requestFolderThumbnail(ctx, _evt, folderPath) {
  return new Promise((resolve) => {
    queueGeneration(ctx, folderPath, (thumbPath) => {
      if (thumbPath) {
        resolve({ ok: true, path: thumbPath });
        
        // Notify renderer
        try {
          const { BrowserWindow } = require('electron');
          const win = BrowserWindow.getFocusedWindow();
          if (win) {
            win.webContents.send('video:folderThumbnailUpdated', {
              folderPath,
              thumbPath,
              timestamp: Date.now()
            });
          }
        } catch {}
      } else {
        resolve({ ok: false });
      }
    });
  });
}

module.exports = {
  getFolderThumbnail,
  requestFolderThumbnail,
  findCustomThumbnail,
  hasCachedThumb,
  getCachedThumb,
};
