// Ignore rules shared by scan workers

function normLower(s) { return String(s || '').toLowerCase(); }

function makeIgnoreConfig(ignore) {
  const dirNames = new Set((ignore?.dirNames || []).map(normLower).filter(Boolean));
  const substrings = (ignore?.substrings || []).map(normLower).filter(Boolean);
  return { dirNames, substrings };
}

function shouldIgnorePath(fullPath, name, isDir, cfg) {
  const n = normLower(name);
  if (isDir) {
    // Always ignore hidden directories
    if (name && name.startsWith('.')) return true;
    if (cfg.dirNames.has(n)) return true;
  }
  const p = normLower(fullPath);
  for (const sub of cfg.substrings) {
    if (sub && p.includes(sub)) return true;
  }
  return false;
}

module.exports = { normLower, makeIgnoreConfig, shouldIgnorePath };
