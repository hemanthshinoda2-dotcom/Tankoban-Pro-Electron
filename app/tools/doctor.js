#!/usr/bin/env node
/*
  doctor.js
  - Lightweight sanity checks for repo health and reproducibility.

  Usage:
    npm run doctor
*/

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function readJSON(rel) {
  const p = path.join(ROOT, rel);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function warn(msg) {
  console.log(`\x1b[33mWARN\x1b[0m ${msg}`);
}

function ok(msg) {
  console.log(`\x1b[32mOK\x1b[0m   ${msg}`);
}

function info(msg) {
  console.log(`INFO ${msg}`);
}

function isFloating(ver) {
  return typeof ver === 'string' && (ver.startsWith('^') || ver.startsWith('~'));
}

function main() {
  info(`Node: ${process.version}`);
  info(`Platform: ${process.platform} ${process.arch}`);

  if (!exists('package.json')) {
    console.error('ERROR package.json missing');
    process.exit(1);
  }
  ok('package.json present');

  const expected = ['main.js', 'preload.js', 'src/index.html', 'src/renderer.js', 'src/styles.css'];
  for (const f of expected) {
    if (!exists(f)) {
      console.error(`ERROR missing expected file: ${f}`);
      process.exit(1);
    }
  }
  ok('expected entry files present');

  const hasLock = exists('package-lock.json') || exists('yarn.lock') || exists('pnpm-lock.yaml');
  if (!hasLock) {
    warn('No lockfile found. Dependency resolution may drift between machines.');
    warn('If you have network access, run: npm install --package-lock-only');
  } else {
    ok('lockfile present');
  }

  const pkg = readJSON('package.json');
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const critical = ['electron', 'electron-builder', 'electron-packager'];
  for (const name of critical) {
    if (!deps[name]) continue;
    if (isFloating(deps[name])) {
      warn(`${name} uses a floating version range (${deps[name]}). Pin it for reproducibility.`);
    }
  }
  ok('doctor completed');
}

main();
