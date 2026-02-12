// TankobanPlus — Smoke Check (Build 81 / Phase 7)
//
// FAST + deterministic sanity + enforcement. No Electron launch.
//
// HARD ENFORCEMENTS (Phase 7):
// 1) IPC channel strings: NO string-literal channel registrations/invocations anywhere except app/shared/ipc.js
// 2) One IPC registry: ipcMain.handle/on ONLY in app/main/ipc/ (index.js + register/*.js)
// 3) Renderer gateway: window.electronAPI and electronAPI.* ONLY in app/src/services/api_gateway.js
// 4) Preload: app/preload.js must delegate to app/preload/index.js and index.js must expose electronAPI
// 5) Baseline: key entry files exist + parse, and renderer HTML script refs resolve

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..'); // app/
const SRC = path.join(ROOT, 'src');

function fail(msg) {
  console.error(`SMOKE FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function exists(p) {
  return fs.existsSync(p);
}

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function parseJS(p) {
  const code = readText(p);
  try {
    new vm.Script(code, { filename: p, displayErrors: true });
    return true;
  } catch (e) {
    fail(`JS parse error in ${path.relative(ROOT, p)}: ${e.message}`);
    return false;
  }
}

function checkFile(rel, { parse = false } = {}) {
  const p = path.join(ROOT, rel);
  if (!exists(p)) return fail(`Missing: ${rel}`);
  ok(`Exists: ${rel}`);
  if (parse && rel.endsWith('.js')) parseJS(p);
}

function walkJsFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        // Skip node_modules + build-ish dirs for speed and to avoid scanning compiled artifacts.
        if (e.name === 'node_modules' || e.name === 'build' || e.name.startsWith('.')) continue;
        stack.push(full);
      } else if (e.isFile() && e.name.endsWith('.js')) {
        out.push(full);
      }
    }
  }
  return out;
}

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*');
}

function checkRendererHtml(relHtml) {
  const p = path.join(ROOT, relHtml);
  if (!exists(p)) return fail(`Missing renderer HTML: ${relHtml}`);
  ok(`Exists: ${relHtml}`);

  const html = readText(p);
  const scriptSrcs = [];
  const re = /<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) scriptSrcs.push(m[1]);

  if (!scriptSrcs.length) return fail(`No <script src="..."> tags found in ${relHtml}`);

  for (const src of scriptSrcs) {
    const resolved = path.resolve(path.dirname(p), src);
    if (!exists(resolved)) {
      fail(`Missing script referenced by ${relHtml}: ${src}`);
      continue;
    }
    ok(`Script ref resolves: ${path.relative(ROOT, resolved)}`);
    if (resolved.endsWith('.js')) parseJS(resolved);
  }
}

function enforceIpcStringLiteralsOnlyInShared(allJs, ipcSharedPath) {
  const patterns = [
    /ipcMain\.(handle|on)\(\s*['"`]/,
    /ipcRenderer\.(invoke|on|removeListener|removeAllListeners)\(\s*['"`]/,
    /webContents\.send\(\s*['"`]/,
  ];

  let bad = 0;
  for (const file of allJs) {
    if (path.resolve(file) === path.resolve(ipcSharedPath)) continue;

    const lines = readText(file).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isCommentLine(line)) continue;
      for (const pat of patterns) {
        if (pat.test(line)) {
          fail(`${path.relative(ROOT, file)}:${i + 1} contains IPC channel string literal (must use constants from shared/ipc.js)`);
          bad++;
          i = lines.length; // one report per file is enough
          break;
        }
      }
    }
  }

  if (!bad) ok('Enforcement: IPC channel string literals appear only in shared/ipc.js');
}

function enforceOneIpcRegistry(allJs, ipcRegistryDir) {
  let bad = 0;
  const pat = /ipcMain\.(handle|on)\s*\(/;

  const allowed = [
    path.resolve(ipcRegistryDir, 'index.js'),
    path.resolve(ipcRegistryDir, 'register'),
  ];

  function isAllowed(file) {
    const abs = path.resolve(file);
    if (abs === allowed[0]) return true;
    // allow anything under main/ipc/register/
    if (abs.startsWith(allowed[1] + path.sep)) return true;
    return false;
  }

  for (const file of allJs) {
    if (isAllowed(file)) continue;

    const lines = readText(file).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isCommentLine(line)) continue;
      if (pat.test(line)) {
        fail(`${path.relative(ROOT, file)}:${i + 1} contains ipcMain.handle/on (ONLY allowed in main/ipc/ (index.js + register/*.js))`);
        bad++;
        break;
      }
    }
  }

  if (!bad) ok('Enforcement: ipcMain registrations exist only in main/ipc/ (index.js + register/*.js)');
}

function enforceRendererGateway(srcDir, apiGatewayPath) {
  const files = walkJsFiles(srcDir).filter(f => path.resolve(f) !== path.resolve(apiGatewayPath));

  const patDot = /\belectronAPI\s*\./;          // electronAPI.*
  const patWindow = /\bwindow\.electronAPI\b/; // window.electronAPI

  let bad = 0;
  for (const file of files) {
    const lines = readText(file).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isCommentLine(line)) continue;

      // Allow identifiers named electronAPI (params/destructuring), but NOT property access.
      if (patWindow.test(line) || patDot.test(line)) {
        fail(`${path.relative(ROOT, file)}:${i + 1} contains direct electronAPI access (renderer must use Tanko.api; only src/services/api_gateway.js may touch electronAPI)`);
        bad++;
        break;
      }
    }
  }

  if (!bad) ok(`Enforcement: renderer touches electronAPI only in gateway (checked ${files.length} files)`);
}

function main() {
  // package.json sanity
  const pkgPath = path.join(ROOT, 'package.json');
  if (!exists(pkgPath)) return fail('Missing: package.json');
  ok('Exists: package.json');

  let pkg;
  try {
    pkg = JSON.parse(readText(pkgPath));
  } catch (e) {
    return fail(`package.json not valid JSON: ${e.message}`);
  }

  // ===== Baseline exists + parse =====
  checkFile('main.js', { parse: true });
  checkFile('preload.js', { parse: true });
  checkFile('src/index.html');
  checkFile('shared/ipc.js', { parse: true });

  // package.json main entry must parse too
  const mainRel = (pkg && pkg.main) ? pkg.main : 'main.js';
  checkFile(mainRel, { parse: true });

  // worker entrypoints
  checkFile('library_scan_worker.js', { parse: true });
  checkFile('video_scan_worker.js', { parse: true });

  // IPC registry must exist + parse
  const ipcRegistryDir = path.join(ROOT, 'main', 'ipc');
  const ipcRegistryPath = path.join(ipcRegistryDir, 'index.js');
  checkFile('main/ipc/index.js', { parse: true });

  // Renderer gateway must exist + parse
  const apiGatewayPath = path.join(SRC, 'services', 'api_gateway.js');
  checkFile('src/services/api_gateway.js', { parse: true });

  // Renderer domains/state expected folders
  const requiredDirs = [
    path.join(SRC, 'domains', 'library'),
    path.join(SRC, 'domains', 'video'),
    path.join(SRC, 'domains', 'reader'),
    path.join(SRC, 'domains', 'player'),
    path.join(SRC, 'domains', 'shell'),
    path.join(SRC, 'state'),
  ];
  for (const d of requiredDirs) {
    if (!exists(d)) fail(`Missing required renderer folder: ${path.relative(ROOT, d)}`);
    else ok(`Exists: ${path.relative(ROOT, d)}`);
  }

  // Renderer entry HTML + script ref sanity
  checkRendererHtml('src/index.html');

  // ===== Enforcement scans =====
  const allJs = walkJsFiles(ROOT);
  const ipcSharedPath = path.join(ROOT, 'shared', 'ipc.js');
  enforceIpcStringLiteralsOnlyInShared(allJs, ipcSharedPath);
  enforceOneIpcRegistry(allJs, ipcRegistryDir);
  enforceRendererGateway(SRC, apiGatewayPath);

  // ===== Preload sanity =====
  const preloadEntryPath = path.join(ROOT, 'preload.js');
  const preloadImplPath = path.join(ROOT, 'preload', 'index.js');

  if (!exists(preloadImplPath)) {
    fail('Missing: preload/index.js');
  } else {
    ok('Exists: preload/index.js');
    parseJS(preloadImplPath);
  }

  try {
    const preloadEntry = readText(preloadEntryPath);
    if (!preloadEntry.includes("require('./preload/index.js')")) {
      fail("Preload: preload.js must delegate to preload/index.js via require('./preload/index.js')");
    } else {
      ok('Preload: preload.js delegates to preload/index.js');
    }
  } catch {
    // already failed parse earlier
  }

  try {
    const preloadImpl = readText(preloadImplPath);
    if (!preloadImpl.includes("exposeInMainWorld('electronAPI'")) {
      fail("Preload: preload/index.js must exposeInMainWorld('electronAPI', ...)");
    } else {
      ok("Preload: preload/index.js exposes 'electronAPI'");
    }
  } catch {}


  // ===== Nirvana Pass: Doc + Trace verification =====
  try {
    const { verifyMaps } = require('./verify_maps');
    const repoRoot = path.resolve(ROOT, '..'); // repo root
    const mapsDir = path.join(repoRoot, 'docs', 'maps');
    const res = verifyMaps({ repoRoot, mapsDir });
    if (!res.ok) {
      fail('Docs maps: referenced path does not exist (see errors above).');
      for (const e of res.errors) console.error(`MAP REF MISSING: ${e.file} -> ${e.ref}`);
    } else {
      ok('Docs maps: all referenced paths exist');
    }
  } catch (e) {
    fail(`Docs maps: verifier crashed: ${e.message}`);
  }

  try {
    const { verifyTrace } = require('./verify_trace');
    const res = verifyTrace({ appRoot: ROOT });
    if (!res.ok) {
      fail('TRACE markers: missing required boundary markers (see errors above).');
      for (const e of res.errors) console.error(`TRACE MISSING: ${e.rel} (${e.why})`);
    } else {
      ok('TRACE markers: required boundary markers present');
    }
  } catch (e) {
    fail(`TRACE markers: verifier crashed: ${e.message}`);
  }


try {
  const verify = require('./verify_renderer_load_order');
  // if module exports main, call it; otherwise require will have run nothing.
  if (verify && typeof verify.main === 'function') {
    // It will exit(1) on failure.
    verify.main();
    ok('Renderer load order: verified');
  }
} catch (e) {
  fail(`Renderer load order: verifier crashed: ${e.message}`);
}

  // ===== Done =====
  if (process.exitCode) {
    console.error('Smoke check failed.');
    process.exit(process.exitCode);
  }
  console.log('Smoke check passed.');
}

main();
