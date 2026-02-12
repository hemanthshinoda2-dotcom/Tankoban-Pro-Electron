/*
TankobanPlus — Main Entry (Build 77, Phase 3)

OWNERSHIP: Electron's main entrypoint (package.json "main" field points here).
This file is now thin and delegates immediately to app/main/index.js.

CRITICAL: APP_ROOT must remain __dirname to preserve all path resolution behavior.
Workers, native bridge, renderer HTML, and preload all depend on this being app/.
*/

const path = require('path');

// Establish APP_ROOT as the absolute path to app/
// This MUST be __dirname to maintain compatibility with Build 76 path resolution.
const APP_ROOT = __dirname;

// Delegate all boot logic to app/main/index.js
require('./main/index')({ APP_ROOT });
