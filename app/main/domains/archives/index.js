/*
TankobanPlus — Archives Domain (Build 78B, Phase 4 Checkpoint B)

Handles CBZ/CBR archive operations: open, read entry, close, session management.
Extracted from Build 78A IPC registry with ZERO behavior changes.

CRITICAL: Preserves all session state, eviction logic, and file handle lifecycle.
*/

const fs = require('fs');
const zlib = require('zlib');
const { createExtractorFromData } = require('node-unrar-js');

// ========== CBZ SESSION STATE (BUILD 19D/BUILD32) ==========

/**
 * CBZ session storage.
 * SCHEMA: { fh, entries, path, ownerId, openedAt, lastUsedAt }
 * entries[] items: { name: string, method: number, cSize: number, uSize: number, lOff: number }
 * 
 * Lifted from Build 78A index.js lines 128-129.
 */
const cbzSessions = new Map();
let cbzSessionSeq = 1;

/**
 * BUILD32_CBZ_SESSION_LIMIT (Build 32)
 * Lifted from Build 78A index.js line 133.
 */
const CBZ_OPEN_MAX = 3;

/**
 * Get current timestamp for session tracking.
 * Lifted from Build 78A index.js lines 135-138.
 */
function cbzNowMs() {
  try { return Date.now(); } catch {}
  return 0;
}

/**
 * Touch session to update lastUsedAt timestamp.
 * BUILD32_CBZ_TOUCH_ON_READ (Build 32)
 * Lifted from Build 78A index.js lines 140-142.
 */
function cbzTouchSession(s) {
  try { s.lastUsedAt = cbzNowMs(); } catch {}
}

/**
 * Close all CBZ sessions for a given owner (window).
 * BUILD32_CBZ_CLOSE_ALL_FOR_OWNER (Build 32)
 * Lifted from Build 78A index.js lines 145-157.
 */
async function cbzCloseAllForOwner(ownerId) {
  const oid = Number(ownerId) || 0;
  const toClose = [];
  try {
    for (const [sid, s] of cbzSessions.entries()) {
      if ((Number(s?.ownerId) || 0) === oid) toClose.push(String(sid));
    }
  } catch {}

  for (const sid of toClose) {
    try { await cbzCloseInternal(sid); } catch {}
  }
}

/**
 * Close all CBZ sessions.
 * BUILD32_CBZ_CLOSE_ALL (Build 32)
 * Lifted from Build 78A index.js lines 160-166.
 */
async function cbzCloseAll() {
  const toClose = [];
  try { for (const sid of cbzSessions.keys()) toClose.push(String(sid)); } catch {}
  for (const sid of toClose) {
    try { await cbzCloseInternal(sid); } catch {}
  }
}

/**
 * Evict least recently used sessions when limit exceeded.
 * BUILD32_CBZ_EVICT_IF_NEEDED (Build 32)
 * Lifted from Build 78A index.js lines 170-185.
 */
async function cbzEvictIfNeeded() {
  try {
    if (cbzSessions.size <= CBZ_OPEN_MAX) return;

    const items = [...cbzSessions.entries()].sort((a, b) => {
      const la = Number(a[1]?.lastUsedAt) || Number(a[1]?.openedAt) || 0;
      const lb = Number(b[1]?.lastUsedAt) || Number(b[1]?.openedAt) || 0;
      return la - lb;
    });

    while (cbzSessions.size > CBZ_OPEN_MAX && items.length) {
      const [sid] = items.shift();
      try { await cbzCloseInternal(sid); } catch {}
    }
  } catch {}
}

/**
 * Convert Buffer to ArrayBuffer.
 * Lifted from Build 78A index.js lines 188-190.
 */
function bufToArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/**
 * Inflate raw compressed data (async).
 * Lifted from Build 78A index.js lines 192-199.
 */
function inflateRawAsync(buf) {
  return new Promise((resolve, reject) => {
    zlib.inflateRaw(buf, (err, out) => {
      if (err) reject(err);
      else resolve(out);
    });
  });
}

/**
 * Find ZIP End of Central Directory in tail buffer.
 * Lifted from Build 78A index.js lines 201-209.
 */
function findEOCDInTail(tailBuf) {
  const sig = 0x06054b50;
  const min = Math.max(0, tailBuf.length - (0x10000 + 22));
  for (let i = tailBuf.length - 22; i >= min; i--) {
    if ((tailBuf.readUInt32LE(i) >>> 0) === sig) return i;
  }
  return -1;
}

// ========== CBR SESSION STATE (BUILD 19E) ==========

/**
 * CBR session storage.
 * SCHEMA: { dataAB, extractor, entries: string[], path, openedAt }
 * Lifted from Build 78A index.js lines 326-328.
 */
const cbrSessions = new Map();
let cbrSessionSeq = 1;
const CBR_OPEN_MAX = 3;

/**
 * Evict oldest CBR sessions when limit exceeded.
 * Lifted from Build 78A index.js lines 330-339.
 */
function cbrEvictIfNeeded() {
  try {
    if (cbrSessions.size <= CBR_OPEN_MAX) return;
    const items = [...cbrSessions.entries()].sort((a,b) => (a[1]?.openedAt||0) - (b[1]?.openedAt||0));
    while (cbrSessions.size > CBR_OPEN_MAX && items.length) {
      const [sid] = items.shift();
      cbrSessions.delete(sid);
    }
  } catch {}
}

// ========== CBZ INTERNAL FUNCTIONS ==========

/**
 * Open CBZ file and parse central directory.
 * BUILD 19D_CBZ_LAZY_IPC (Build 19D)
 * Lifted from Build 78A index.js lines 211-276.
 */
async function cbzOpenInternal(filePath, ownerId) {
  const fp = String(filePath || '');
  if (!fp) throw new Error('Missing CBZ path');

  const fh = await fs.promises.open(fp, 'r');
  try {
    const st = await fh.stat();
    const fileSize = Number(st.size || 0);

    const tailSize = Math.min(fileSize, 0x10000 + 22);
    const tailBuf = Buffer.alloc(tailSize);
    await fh.read(tailBuf, 0, tailSize, Math.max(0, fileSize - tailSize));

    const eocdRel = findEOCDInTail(tailBuf);
    if (eocdRel < 0) throw new Error('Not a valid CBZ (ZIP EOCD not found).');

    const total = tailBuf.readUInt16LE(eocdRel + 10);
    const cdSize = tailBuf.readUInt32LE(eocdRel + 12) >>> 0;
    const cdOff  = tailBuf.readUInt32LE(eocdRel + 16) >>> 0;

    const cdBuf = Buffer.alloc(cdSize);
    await fh.read(cdBuf, 0, cdSize, cdOff);

    let p0 = 0;
    const entries = [];
    for (let i = 0; i < total; i++) {
      if ((cdBuf.readUInt32LE(p0) >>> 0) !== 0x02014b50) throw new Error('Corrupt ZIP central directory.');

      const method = cdBuf.readUInt16LE(p0 + 10);
      const cSize  = cdBuf.readUInt32LE(p0 + 20) >>> 0;
      const uSize  = cdBuf.readUInt32LE(p0 + 24) >>> 0;
      const nLen   = cdBuf.readUInt16LE(p0 + 28);
      const xLen   = cdBuf.readUInt16LE(p0 + 30);
      const cLen   = cdBuf.readUInt16LE(p0 + 32);
      const lOff   = cdBuf.readUInt32LE(p0 + 42) >>> 0;

      const nameBuf = cdBuf.slice(p0 + 46, p0 + 46 + nLen);
      const name = nameBuf.toString('utf8');

      p0 = p0 + 46 + nLen + xLen + cLen;

      if (!name.endsWith('/')) entries.push({ name, method, cSize, uSize, lOff });
    }

    const now = cbzNowMs();
    const oid = Number(ownerId) || 0;

    const sessionId = String(cbzSessionSeq++);
    cbzSessions.set(sessionId, {
      fh,
      entries,
      path: fp,
      ownerId: oid,
      openedAt: now,
      lastUsedAt: now,
    });

    // BUILD32_CBZ_EVICT_ON_OPEN (Build 32)
    await cbzEvictIfNeeded();

    return { sessionId, entries };
  } catch (err) {
    try { await fh.close(); } catch {}
    throw err;
  }
}

/**
 * Read entry from CBZ session.
 * Lifted from Build 78A index.js lines 278-311.
 */
async function cbzReadEntryInternal(sessionId, entryIndex) {
  const sid = String(sessionId || '');
  const s = cbzSessions.get(sid);
  if (!s) throw new Error('CBZ session not found');

  // BUILD32_CBZ_TOUCH_ON_READ (Build 32)
  cbzTouchSession(s);

  const idx = Number(entryIndex);
  if (!Number.isFinite(idx) || idx < 0 || idx >= (s.entries || []).length) throw new Error('Invalid entry index');

  const entry = s.entries[idx];
  const off = entry.lOff >>> 0;

  // Read local header to find exact start of compressed data.
  const lh = Buffer.alloc(30);
  await s.fh.read(lh, 0, 30, off);
  if ((lh.readUInt32LE(0) >>> 0) !== 0x04034b50) throw new Error('Corrupt ZIP local header.');

  const method = lh.readUInt16LE(8);
  const nLen = lh.readUInt16LE(26);
  const xLen = lh.readUInt16LE(28);
  const dataStart = off + 30 + nLen + xLen;

  const comp = Buffer.alloc(entry.cSize >>> 0);
  await s.fh.read(comp, 0, comp.length, dataStart);

  if (method === 0) return bufToArrayBuffer(comp);
  if (method === 8) {
    const out = await inflateRawAsync(comp);
    return bufToArrayBuffer(out);
  }
  throw new Error(`Unsupported compression method: ${method} (need stored(0) or deflate(8)).`);
}

/**
 * Close CBZ session.
 * Lifted from Build 78A index.js lines 313-319.
 */
async function cbzCloseInternal(sessionId) {
  const sid = String(sessionId || '');
  const s = cbzSessions.get(sid);
  if (!s) return;
  cbzSessions.delete(sid);
  try { await s.fh.close(); } catch {}
}

// ========== CBR INTERNAL FUNCTIONS ==========

/**
 * Open CBR file and extract file list.
 * BUILD 19E_CBR_LAZY_MAIN_IPC (Build 19E)
 * Lifted from Build 78A index.js lines 341-370.
 */
async function cbrOpenInternal(filePath) {
  const fp = String(filePath || '');
  if (!fp) throw new Error('Missing CBR path');

  const st = await fs.promises.stat(fp);
  if (!st || !st.isFile()) throw new Error('CBR path is not a file');

  const buf = await fs.promises.readFile(fp);
  const dataAB = bufToArrayBuffer(buf);

  const extractor = await createExtractorFromData({ data: dataAB });
  const list = extractor.getFileList();

  const names = [];
  try {
    for (const h of (list?.fileHeaders || [])) {
      if (!h) continue;
      if (h?.flags?.directory) continue;
      const nm = String(h.name || '');
      if (!nm) continue;
      names.push(nm);
    }
  } catch {}

  const sessionId = String(cbrSessionSeq++);
  cbrSessions.set(sessionId, { dataAB, extractor, entries: names, path: fp, openedAt: Date.now() });
  cbrEvictIfNeeded();

  return { sessionId, entries: names.map(name => ({ name })) };
}

/**
 * Read entry from CBR session.
 * Lifted from Build 78A index.js lines 372-392.
 */
async function cbrReadEntryInternal(sessionId, entryIndex) {
  const sid = String(sessionId || '');
  const s = cbrSessions.get(sid);
  if (!s?.extractor) throw new Error('CBR session not found');

  const idx = Number(entryIndex);
  if (!Number.isFinite(idx) || idx < 0 || idx >= (s.entries || []).length) throw new Error('Invalid entry index');

  const entryName = String(s.entries[idx] || '');
  if (!entryName) throw new Error('Missing entry name');

  const extracted = s.extractor.extract({ files: [entryName] });
  for (const f of (extracted?.files || [])) {
    const nm = String(f?.fileHeader?.name || '');
    if (nm !== entryName) continue;
    if (!f?.extraction) continue;
    // f.extraction is a Uint8Array view
    return f.extraction.buffer.slice(f.extraction.byteOffset, f.extraction.byteOffset + f.extraction.byteLength);
  }
  throw new Error('CBR extraction failed');
}

/**
 * Close CBR session.
 * Lifted from Build 78A index.js lines 394-397.
 */
async function cbrCloseInternal(sessionId) {
  const sid = String(sessionId || '');
  cbrSessions.delete(sid);
}

// ========== DOMAIN HANDLERS ==========

/**
 * Open CBR file.
 * Lifted from Build 78A index.js lines 2202-2209.
 */
async function cbrOpen(ctx, _evt, filePath) {
  try {
    const out = await cbrOpenInternal(filePath);
    return { ok: true, sessionId: out.sessionId, entries: out.entries };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * Read entry from CBR file.
 * Lifted from Build 78A index.js lines 2211-2218.
 */
async function cbrReadEntry(ctx, _evt, sessionId, entryIndex) {
  try {
    const ab = await cbrReadEntryInternal(sessionId, entryIndex);
    return ab;
  } catch {
    return null;
  }
}

/**
 * Close CBR session.
 * Lifted from Build 78A index.js lines 2220-2223.
 */
async function cbrClose(ctx, _evt, sessionId) {
  try { await cbrCloseInternal(sessionId); } catch {}
  return { ok: true };
}

/**
 * Open CBZ file.
 * BUILD 19D_CBZ_LAZY_IPC (Build 19D)
 * Lifted from Build 78A index.js lines 2229-2232.
 */
async function cbzOpen(ctx, evt, filePath) {
  const ownerId = evt?.sender?.id;
  return cbzOpenInternal(filePath, ownerId);
}

/**
 * Read entry from CBZ file.
 * Lifted from Build 78A index.js lines 2234-2236.
 */
async function cbzReadEntry(ctx, _evt, sessionId, entryIndex) {
  return cbzReadEntryInternal(sessionId, entryIndex);
}

/**
 * Close CBZ session.
 * Lifted from Build 78A index.js lines 2238-2241.
 */
async function cbzClose(ctx, _evt, sessionId) {
  await cbzCloseInternal(sessionId);
  return { ok: true };
}

module.exports = {
  // CBR handlers
  cbrOpen,
  cbrReadEntry,
  cbrClose,
  
  // CBZ handlers
  cbzOpen,
  cbzReadEntry,
  cbzClose,
  
  // Utility exports (for window cleanup in main registry)
  cbzCloseAllForOwner,
};
