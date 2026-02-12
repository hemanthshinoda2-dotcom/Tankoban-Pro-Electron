/*
TankobanPlus — Clipboard Domain (Build 78D, Phase 4 Checkpoint D)

Lifted from Build 78C IPC registry with ZERO behavior changes.
*/

const { clipboard } = require('electron');

async function writeText(ctx, _evt, text) {
  try {
    clipboard.writeText(String(text || ''));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

module.exports = { writeText };
