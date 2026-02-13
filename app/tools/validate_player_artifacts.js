#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const playerRoot = path.join(appRoot, 'player_qt', 'dist', 'TankobanPlayer');
const internalRoot = path.join(playerRoot, '_internal');

const requiredPaths = [
  path.join(playerRoot, 'TankobanPlayer.exe'),
  internalRoot,
  path.join(internalRoot, 'base_library.zip'),
  path.join(internalRoot, 'python3.dll')
];

function findMatches(pattern) {
  const dir = path.dirname(pattern);
  const base = path.basename(pattern);
  if (!fs.existsSync(dir)) {
    return [];
  }
  if (!base.includes('*')) {
    return fs.existsSync(pattern) ? [pattern] : [];
  }
  const regex = new RegExp(`^${base.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`, 'i');
  return fs.readdirSync(dir)
    .filter((entry) => regex.test(entry))
    .map((entry) => path.join(dir, entry));
}

const wildcardRequirements = [
  path.join(internalRoot, 'python3*.dll'),
  path.join(internalRoot, '*.dll'),
  path.join(internalRoot, '*.pyd')
];

const missing = [];
for (const requirement of requiredPaths) {
  if (!fs.existsSync(requirement)) {
    missing.push(requirement);
  }
}

for (const requirement of wildcardRequirements) {
  if (findMatches(requirement).length === 0) {
    missing.push(requirement);
  }
}

if (missing.length > 0) {
  console.error('[player-validate] ERROR: required player artifacts are missing.');
  for (const artifact of missing) {
    console.error(`  - ${path.relative(appRoot, artifact)}`);
  }
  console.error('[player-validate] Run "npm run build:player" before packaging.');
  process.exit(1);
}

console.log('[player-validate] OK: required player artifacts are present.');
