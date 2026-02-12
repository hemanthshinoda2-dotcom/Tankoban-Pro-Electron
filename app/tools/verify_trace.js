// TankobanPlus — Trace Verifier (Nirvana Pass 2)
// Minimal enforcement that "boundary TRACE markers" exist in key files.
// This is intentionally conservative: it checks only a small set of boundary files
// that should *always* contain TRACE markers, without requiring full coverage everywhere.

const fs = require('fs');
const path = require('path');

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function verifyTrace({ appRoot }) {
  const mustHave = [
    { rel: 'preload/index.js', token: 'TRACE:IPC_OUT' },
    { rel: 'main/ipc/index.js', token: 'TRACE:IPC_IN' },
    { rel: 'main/lib/storage.js', token: 'TRACE:PERSIST_WRITE' },
    { rel: 'src/services/api_gateway.js', token: 'TRACE:IPC_OUT' },
    { rel: 'workers/library_scan_worker_impl.js', token: 'TRACE:PERSIST_WRITE' },
    { rel: 'workers/video_scan_worker_impl.js', token: 'TRACE:PERSIST_WRITE' },
  ];

  const errors = [];
  for (const req of mustHave) {
    const abs = path.join(appRoot, req.rel);
    if (!fs.existsSync(abs)) {
      errors.push({ rel: req.rel, why: 'missing file' });
      continue;
    }
    const txt = read(abs);
    if (!txt.includes(req.token)) {
      errors.push({ rel: req.rel, why: `missing token ${req.token}` });
    }
  }

  return { ok: errors.length === 0, errors };
}

if (require.main === module) {
  const appRoot = path.resolve(__dirname, '..'); // app/
  const res = verifyTrace({ appRoot });
  if (!res.ok) {
    console.error('TRACE VERIFY FAIL: missing required TRACE markers');
    for (const e of res.errors) console.error(`- ${e.rel}: ${e.why}`);
    process.exit(1);
  }
  console.log('OK: TRACE markers present in required boundary files');
}

module.exports = { verifyTrace };
