#!/usr/bin/env node
/*
  repo_map.js
  - Generates repo_map.json at the repo root.
  - Purpose: make future AI-assisted edits safer by giving a quick, machine-readable overview.

  Usage:
    npm run map
*/

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'repo_map.json');

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.vscode',
  '.idea',
  'build',
]);

const PURPOSE_HINTS = {
  'main.js': { purpose: 'Electron main process (window + IPC + persistence).', danger: 'medium', notes: 'Avoid behavior changes unless needed; IPC contracts must stay stable.' },
  'preload.js': { purpose: 'Secure IPC bridge (exposes electronAPI).', danger: 'high', notes: 'Keep minimal; do not expand attack surface.' },
  'src/renderer.js': { purpose: 'Core app logic: state, UI, rendering, playback loop.', danger: 'high', notes: 'Single biggest danger zone; use edit-zone markers.' },
  'src/index.html': { purpose: 'UI markup for library/player/overlays.', danger: 'low', notes: 'Overlays must not affect viewport sizing.' },
  'src/styles.css': { purpose: 'App styling.', danger: 'low', notes: 'Keep overlays position-fixed/absolute so viewport math stays stable.' },
  'tools/doctor.js': { purpose: 'Sanity checks for repo health and reproducibility.', danger: 'low', notes: 'Development-only.' },
  'tools/repo_map.js': { purpose: 'Generates repo_map.json.', danger: 'low', notes: 'Development-only.' },
};

function isTextFile(fp) {
  return /\.(js|cjs|mjs|html|css|md|json|txt)$/i.test(fp);
}

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      out.push(...walk(path.join(dir, ent.name)));
    } else if (ent.isFile()) {
      const fp = path.join(dir, ent.name);
      const rel = path.relative(ROOT, fp).replace(/\\/g, '/');
      out.push(rel);
    }
  }
  return out;
}

function extractSymbols(text) {
  const functions = new Set();
  const classes = new Set();
  const arrows = new Set();

  // function foo(...) {}
  for (const m of text.matchAll(/\bfunction\s+([A-Za-z0-9_$]+)\s*\(/g)) functions.add(m[1]);
  // class Foo {...}
  for (const m of text.matchAll(/\bclass\s+([A-Za-z0-9_$]+)\b/g)) classes.add(m[1]);
  // const foo = (...) =>
  for (const m of text.matchAll(/\bconst\s+([A-Za-z0-9_$]+)\s*=\s*\([^)]*\)\s*=>/g)) arrows.add(m[1]);
  // const foo = function(
  for (const m of text.matchAll(/\bconst\s+([A-Za-z0-9_$]+)\s*=\s*function\s*\(/g)) functions.add(m[1]);

  const key = {
    functions: Array.from(functions).sort().slice(0, 80),
    classes: Array.from(classes).sort().slice(0, 40),
    arrowFns: Array.from(arrows).sort().slice(0, 80),
  };
  return key;
}

function buildEntry(rel) {
  const hint = PURPOSE_HINTS[rel] || PURPOSE_HINTS[path.basename(rel)] || null;
  const danger = hint?.danger || (rel.includes('src/renderer') ? 'high' : 'low');
  const purpose = hint?.purpose || 'Project file.';
  const notes = hint?.notes || '';

  let symbols = { functions: [], classes: [], arrowFns: [] };
  try {
    const abs = path.join(ROOT, rel);
    if (isTextFile(abs)) {
      const text = fs.readFileSync(abs, 'utf8');
      if (/\.(js|cjs|mjs)$/i.test(abs)) symbols = extractSymbols(text);
    }
  } catch {
    // ignore
  }

  return {
    path: rel,
    purpose,
    danger,
    ...symbols,
    notes,
  };
}

function main() {
  const files = walk(ROOT)
    .filter((rel) => !rel.startsWith('dist/'))
    .filter((rel) => rel !== 'repo_map.json');

  // Prefer a stable, “major files first” ordering.
  const major = Object.keys(PURPOSE_HINTS);
  const majorSet = new Set(major);

  const ordered = [
    ...major.filter((m) => files.includes(m)),
    ...files.filter((f) => !majorSet.has(f)).sort(),
  ];

  const entries = ordered.map(buildEntry);

  const out = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    entries,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)} with ${entries.length} entries.`);
}

main();
