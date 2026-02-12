/*
TankobanPlus — Files Domain (Build 78D, Phase 4 Checkpoint D)

Lifted from Build 78C IPC registry with ZERO behavior changes.
*/

const fs = require('fs');

async function read(ctx, _evt, filePath) {
  const buf = await fs.promises.readFile(filePath);
  // Transferable ArrayBuffer (renderer-side)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

module.exports = { read };
