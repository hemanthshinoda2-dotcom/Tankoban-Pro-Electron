/* 
AI_NAV: video_utils.js
OWNERSHIP: Small pure helper utilities extracted from video.js to keep the main Videos module readable.
SAFE TO EDIT: Yes, but preserve function signatures and return types (video.js depends on them).

Exports:
- window.tankobanVideoUtils._videoGsNorm
- window.tankobanVideoUtils._videoMatchText
- window.tankobanVideoUtils._videoNatCmp
- window.tankobanVideoUtils._videoEscHtml
*/

(function(){
  const api = window.tankobanVideoUtils = window.tankobanVideoUtils || {};
  function _videoGsNorm(s){ return String(s || '').toLowerCase(); }
  function _videoMatchText(hay, needle){
    try { if (typeof matchText === 'function') return !!matchText(hay, needle); } catch {}
    return _videoGsNorm(hay).includes(_videoGsNorm(needle));
  }
  function _videoNatCmp(a, b){
    try { if (typeof naturalCompare === 'function') return naturalCompare(String(a||''), String(b||'')); } catch {}
    return String(a||'').localeCompare(String(b||''), undefined, { numeric: true, sensitivity: 'base' });
  }
  function _videoEscHtml(s){
    try { if (typeof escapeHtml === 'function') return escapeHtml(String(s || '')); } catch {}
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  
  function videoHideGlobalSearchResults(){
    const resultsEl = document.getElementById('globalSearchResults');
    if (resultsEl) {
      resultsEl.classList.add('hidden');
      resultsEl.innerHTML = '';
    }
    videoGlobalSearchItems = [];
  }
  
  function videoSetGlobalSearchSelection(idx){
    const resultsEl = document.getElementById('globalSearchResults');
    const items = Array.from(resultsEl?.querySelectorAll?.('.resItem') || []);
    if (!items.length) {
      if (appState?.ui) appState.ui.globalSearchSel = 0;
      return;
    }
    const max = items.length - 1;
    const next = Math.max(0, Math.min(max, Number(idx || 0)));
    if (appState?.ui) appState.ui.globalSearchSel = next;
  
    for (const it of items) {
      it.classList.toggle('sel', Number(it.dataset.idx) === next);
    }
    const sel = items.find(it => Number(it.dataset.idx) === next);
    try { sel?.scrollIntoView?.({ block: 'nearest' }); } catch {}
  }
  
  async function videoActivateGlobalSearchSelection(){
    const sel = Number(appState?.ui?.globalSearchSel || 0);
    const item = videoGlobalSearchItems[sel];
  
    const gs = document.getElementById('globalSearch');
    if (gs) {
      gs.value = '';
      gs.blur();
    }
    if (appState?.ui) appState.ui.globalSearch = '';
  
    videoHideGlobalSearchResults();
  
    if (!item) return;
  
    if (item.type === 'show') {
      openVideoShow(item.showId);
      return;
    }
  
    if (item.type === 'episode') {
      const ep = getEpisodeById(item.episodeId);
      if (ep) await openVideo(ep);
      return;
    }
  }

  api._videoGsNorm = _videoGsNorm;
  api._videoMatchText = _videoMatchText;
  api._videoNatCmp = _videoNatCmp;
  api._videoEscHtml = _videoEscHtml;
})(); 
