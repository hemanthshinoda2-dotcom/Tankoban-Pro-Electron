// Identifier helpers shared by scan workers

const crypto = require('crypto');

function base64Url(s) {
  return Buffer.from(String(s || ''), 'utf8').toString('base64url');
}

function sha1Base64Url(s) {
  return crypto.createHash('sha1').update(String(s || ''), 'utf8').digest('base64url');
}

function seriesIdForFolder(folderPath) { return base64Url(folderPath); }

function bookIdForPath(p, st) {
  return base64Url(`${p}::${st.size}::${st.mtimeMs}`);
}

function rootIdForPath(rootPath) { return base64Url(rootPath); }

function showIdForPath(showPath) { return base64Url(showPath); }

function looseShowIdForRoot(rootPath) { return sha1Base64Url(`${String(rootPath || '')}::LOOSE_FILES`); }

function videoIdForPath(filePath, st) { return sha1Base64Url(`${filePath}::${st.size}::${st.mtimeMs}`); }

module.exports = {
  base64Url,
  sha1Base64Url,
  seriesIdForFolder,
  bookIdForPath,
  rootIdForPath,
  showIdForPath,
  looseShowIdForRoot,
  videoIdForPath,
};
