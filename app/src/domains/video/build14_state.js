/*
Build14 state capture/restore helpers for hide-on-play.

This module intentionally stays renderer-only and uses the legacy return_state
schema consumed by main/player_core:
  - mode
  - showRootPath
  - currentFolderPath
  - scrollTop
  - selectedItemId
  - selectedItemPath
*/

(function() {
  'use strict';

  function normRelPath(p) {
    return String(p || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  }

  function normPath(p) {
    let out = String(p || '').replace(/\\/g, '/').replace(/\/+$/g, '');
    if (typeof process !== 'undefined' && process && process.platform === 'win32') out = out.toLowerCase();
    return out;
  }

  function relFromSavedFolder(savedFolderPath, showRootPath) {
    const raw = String(savedFolderPath || '');
    if (!raw) return '';

    const rawNorm = normPath(raw);
    const rootNorm = normPath(showRootPath);
    if (rootNorm && rawNorm && rawNorm.indexOf(rootNorm) === 0) {
      const rest = rawNorm.slice(rootNorm.length);
      return normRelPath(rest);
    }
    return normRelPath(raw);
  }

  function getShowById(videoState, showId) {
    const sid = String(showId || '');
    if (!sid) return null;
    const shows = Array.isArray(videoState && videoState.shows) ? videoState.shows : [];
    return shows.find((s) => String(s && s.id || '') === sid) || null;
  }

  function getScrollContainer(videoState) {
    const subView = String(videoState && videoState.videoSubView || 'home');
    if (subView === 'show') {
      return (
        document.getElementById('videoEpisodesGrid') ||
        document.getElementById('videoEpisodesWrap') ||
        document.querySelector('#videoShowView .volTableBody')
      );
    }
    return (
      document.getElementById('videoShowsGrid') ||
      document.getElementById('videoHomeView') ||
      document.getElementById('videoLibraryView')
    );
  }

  const Build14State = {
    captureState(videoState) {
      const out = {
        mode: 'videos',
        showRootPath: '',
        currentFolderPath: '',
        scrollTop: 0,
        selectedItemId: '',
        selectedItemPath: '',
      };

      try {
        const selectedShowId = String(videoState && videoState.selectedShowId || '');
        if (selectedShowId) {
          const show = getShowById(videoState, selectedShowId);
          if (show && show.path) out.showRootPath = String(show.path);
          out.currentFolderPath = normRelPath(videoState && videoState.epFolderRel || '');
        }

        const selectedEpisodeId = String(videoState && videoState.selectedEpisodeId || '');
        if (selectedEpisodeId) {
          out.selectedItemId = selectedEpisodeId;
          const byId = videoState && videoState.episodeById && typeof videoState.episodeById.get === 'function'
            ? videoState.episodeById.get(selectedEpisodeId)
            : null;
          if (byId && byId.path) out.selectedItemPath = String(byId.path);
        }

        const container = getScrollContainer(videoState);
        if (container && Number.isFinite(Number(container.scrollTop))) {
          out.scrollTop = Math.max(0, Math.round(Number(container.scrollTop)));
        }
      } catch (e) {
        try { console.error('[BUILD14] captureState failed:', e); } catch {}
      }

      return out;
    },

    async restoreState(savedState, videoState, helpers) {
      if (!savedState || typeof savedState !== 'object') return;

      try {
        if (savedState.mode === 'videos' && helpers && typeof helpers.setMode === 'function') {
          helpers.setMode('videos');
        }

        let targetShowPath = String(savedState.showRootPath || '');
        if (targetShowPath && helpers && typeof helpers.openVideoShow === 'function') {
          const shows = Array.isArray(videoState && videoState.shows) ? videoState.shows : [];
          const show = shows.find((s) => normPath(s && s.path || '') === normPath(targetShowPath));
          if (show && show.id) {
            helpers.openVideoShow(String(show.id));
          }
        }

        const targetFolderRel = relFromSavedFolder(savedState.currentFolderPath, targetShowPath);
        if (targetFolderRel && helpers && typeof helpers.navigateShowFolder === 'function') {
          setTimeout(() => {
            try { helpers.navigateShowFolder(targetFolderRel); } catch {}
          }, 60);
        }

        if (savedState.selectedItemId && helpers && typeof helpers.selectEpisode === 'function') {
          setTimeout(() => {
            try { helpers.selectEpisode(String(savedState.selectedItemId)); } catch {}
          }, 140);
        }

        if (Number.isFinite(Number(savedState.scrollTop)) && Number(savedState.scrollTop) > 0) {
          const targetTop = Math.max(0, Math.round(Number(savedState.scrollTop)));
          setTimeout(() => {
            try {
              const container = getScrollContainer(videoState);
              if (container) container.scrollTop = targetTop;
            } catch {}
          }, 170);
        }
      } catch (e) {
        try { console.error('[BUILD14] restoreState failed:', e); } catch {}
      }
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Build14State;
  if (typeof window !== 'undefined') window.Build14State = Build14State;
})();
