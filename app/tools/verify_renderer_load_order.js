// TankobanPlus — Renderer Load Order Verifier (Nirvana 10)
// Enforces a few critical "must be loaded before" relationships in app/src/index.html
// to keep the renderer splittable without relying on tribal knowledge.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..'); // app/
const INDEX_HTML = path.join(ROOT, 'src', 'index.html');

function read(p) { return fs.readFileSync(p, 'utf-8'); }

function extractScripts(html) {
  const out = [];
  const re = /<script\s+[^>]*src="([^"]+)"[^>]*><\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function idxOf(list, item) {
  const i = list.indexOf(item);
  return i;
}

function assertBefore(list, a, b, problems) {
  const ia = idxOf(list, a);
  const ib = idxOf(list, b);
  if (ia === -1 || ib === -1) return; // handled by existing smoke check for missing refs
  if (ia > ib) problems.push(`Load order violation: ${a} must load before ${b}`);
}

function main() {
  const problems = [];
  const html = read(INDEX_HTML);
  const scripts = extractScripts(html);

  // Split-safe order rules:
  assertBefore(scripts, './domains/video/video_utils.js', './domains/video/video.js', problems);
  // QT_ONLY: Embedded/canvas player adapter scripts were removed.

  // Gateway should be early (it defines window.tankoApi used by domains)
  assertBefore(scripts, './services/api_gateway.js', './domains/shell/core.js', problems);

  if (problems.length) {
    console.error('Renderer load order verification FAILED:');
    for (const p of problems) console.error(' - ' + p);
    process.exit(1);
  }
  console.log('OK: Renderer load order verification');
}

if (require.main === module) main();
module.exports = { main };
