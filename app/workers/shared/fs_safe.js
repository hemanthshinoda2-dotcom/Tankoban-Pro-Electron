// Worker-safe filesystem helpers (CommonJS)

const fs = require('fs');

function statSafe(p) {
  try { return fs.statSync(p); } catch { return null; }
}

module.exports = { statSafe };
