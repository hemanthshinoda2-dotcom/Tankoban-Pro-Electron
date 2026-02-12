// TankobanPlus — Map Verifier (Nirvana Pass 1)
// Ensures docs/maps/*.md do not reference non-existent repo paths.
// Used by smoke_check.js to prevent documentation drift.

const fs = require('fs');
const path = require('path');

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith('.md'))
    .map(f => path.join(dir, f));
}

function extractPaths(mdText) {
  // Extract likely repo paths:
  // - backticked paths: `app/main/ipc/index.js`
  // - markdown inline code fragments are the primary source of file paths
  // - also accept plain "app/..." tokens
  const out = new Set();

  const codeTicks = mdText.match(/`[^`]+`/g) || [];
  for (const token of codeTicks) {
    const inner = token.slice(1, -1).trim();
    if (inner.startsWith('app/') || inner.startsWith('docs/') || inner.startsWith('patches/')) out.add(inner);
  }

  const bare = mdText.match(/\b(app|docs|patches)\/[A-Za-z0-9_\-./]+\b/g) || [];
  for (const t of bare) out.add(t);

  return Array.from(out);
}

function verifyMaps({ repoRoot, mapsDir }) {
  const errors = [];
  const files = listMarkdownFiles(mapsDir);

  for (const mdFile of files) {
    const text = fs.readFileSync(mdFile, 'utf8');
    const refs = extractPaths(text);

    for (const rel of refs) {
      // Resolve relative to repo root (NOT app/)
      // Allow glob/pattern refs in docs (e.g., app/main/domains/video/*)
      if (rel.includes('*')) continue;
      const abs = path.join(repoRoot, rel);
      if (!fs.existsSync(abs)) {
        errors.push({
          file: path.relative(repoRoot, mdFile),
          ref: rel
        });
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

if (require.main === module) {
  const repoRoot = path.resolve(__dirname, '..', '..'); // repo root
  const mapsDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(repoRoot, 'docs', 'maps');

  const res = verifyMaps({ repoRoot, mapsDir });
  if (!res.ok) {
    console.error('MAP VERIFY FAIL: referenced path does not exist');
    for (const e of res.errors) {
      console.error(`- ${e.file}: ${e.ref}`);
    }
    process.exit(1);
  }
  console.log(`OK: docs maps verified (${mapsDir})`);
}

module.exports = { verifyMaps };
