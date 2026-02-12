/*
TankobanPro Build 14 - State Save/Restore for Hide-on-Play

This module handles:
1. Capturing UI state before hiding window
2. Restoring UI state after player exits
3. Coordinating with main process for window hide/show
*/

// BUILD14: Export state capture and restore API
const Build14State = {
  
  /**
   * Capture current video library state before hiding window
   * @param {Object} videoState - Current video domain state
   * @returns {Object} State object to save
   */
  captureState(videoState) {
    const state = {
      mode: 'videos',
      showRootPath: '',
      currentFolderPath: '',
      scrollTop: 0,
      selectedItemId: '',
      selectedItemPath: '',
    };
    
    try {
      // Capture current show root
      if (videoState && videoState._openShowId) {
        const sid = String(videoState._openShowId);
        const show = videoState.showsById && videoState.showsById.get ? videoState.showsById.get(sid) : null;
        if (show && show.rootPath) {
          state.showRootPath = String(show.rootPath);
        }
      }
      
      // Capture current folder (season folder if applicable)
      if (videoState && videoState._openShowId) {
        // For now, use the show's folder as the current folder
        const sid = String(videoState._openShowId);
        const show = videoState.showsById && videoState.showsById.get ? videoState.showsById.get(sid) : null;
        if (show && show.folderPath) {
          state.currentFolderPath = String(show.folderPath);
        }
      }
      
      // Capture scroll position from the video library container
      const container = document.querySelector('.videoLibraryContainer') || 
                       document.querySelector('.video-library') ||
                       document.querySelector('[data-video-library]');
      if (container && typeof container.scrollTop === 'number') {
        state.scrollTop = Math.round(container.scrollTop);
      }
      
      // Capture selected episode/tile
      if (videoState && videoState.now && videoState.now.id) {
        state.selectedItemId = String(videoState.now.id);
        if (videoState.now.path) {
          state.selectedItemPath = String(videoState.now.path);
        }
      }
      
    } catch (e) {
      console.error('[BUILD14] Error capturing state:', e);
    }
    
    return state;
  },
  
  /**
   * Restore video library state after window is shown
   * @param {Object} savedState - State object loaded from file
   * @param {Function} setMode - Function to set app mode
   * @param {Function} openVideoShow - Function to open a show
   * @param {Function} scrollToPosition - Function to scroll to position
   */
  async restoreState(savedState, videoState, helpers) {
    if (!savedState || typeof savedState !== 'object') {
      console.log('[BUILD14] No saved state to restore');
      return;
    }
    
    try {
      console.log('[BUILD14] Restoring state:', savedState);
      
      // 1. Ensure we're in videos mode
      if (savedState.mode === 'videos' && helpers.setMode) {
        try {
          helpers.setMode('videos');
        } catch (e) {
          console.error('[BUILD14] Failed to set mode:', e);
        }
      }
      
      // 2. Re-open the show if we have a showRootPath
      if (savedState.showRootPath && videoState && videoState.shows && helpers.openVideoShow) {
        try {
          // Find the show by rootPath
          const shows = Array.isArray(videoState.shows) ? videoState.shows : [];
          const show = shows.find(s => s && s.rootPath === savedState.showRootPath);
          if (show && show.id) {
            console.log('[BUILD14] Reopening show:', show.id);
            helpers.openVideoShow(show.id);
          }
        } catch (e) {
          console.error('[BUILD14] Failed to reopen show:', e);
        }
      }
      
      // 3. Restore scroll position (with a small delay to ensure DOM is ready)
      if (savedState.scrollTop && typeof savedState.scrollTop === 'number') {
        setTimeout(() => {
          try {
            const container = document.querySelector('.videoLibraryContainer') || 
                             document.querySelector('.video-library') ||
                             document.querySelector('[data-video-library]');
            if (container) {
              console.log('[BUILD14] Restoring scroll to:', savedState.scrollTop);
              container.scrollTop = savedState.scrollTop;
            }
          } catch (e) {
            console.error('[BUILD14] Failed to restore scroll:', e);
          }
        }, 100);
      }
      
      // 4. Restore selection highlight
      if (savedState.selectedItemId) {
        setTimeout(() => {
          try {
            // Try to find and highlight the selected episode tile
            const tileSelector = `[data-episode-id="${savedState.selectedItemId}"]`;
            const tile = document.querySelector(tileSelector);
            if (tile) {
              console.log('[BUILD14] Restoring selection to:', savedState.selectedItemId);
              // Add a temporary highlight class
              tile.classList.add('build14-restored-selection');
              // Remove after a few seconds
              setTimeout(() => {
                tile.classList.remove('build14-restored-selection');
              }, 3000);
            }
          } catch (e) {
            console.error('[BUILD14] Failed to restore selection:', e);
          }
        }, 150);
      }
      
    } catch (e) {
      console.error('[BUILD14] Error restoring state:', e);
    }
  }
};

// Export for use in video.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Build14State;
}
if (typeof window !== 'undefined') {
  window.Build14State = Build14State;
}
