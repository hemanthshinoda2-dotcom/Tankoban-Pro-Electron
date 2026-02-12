// TankobanPlus — Renderer State Namespace Bootstrap (Build 81, Phase 7)
//
// OWNERSHIP: Creates the single global state namespace for the renderer.
// This file must be side-effect light: it should only ensure namespaces exist.

(function() {
  'use strict';
  window.Tanko = window.Tanko || {};
  window.Tanko.state = window.Tanko.state || {};
  
  // BUILD14: Simple event emitter for internal events
  if (!window.Tanko._eventListeners) {
    window.Tanko._eventListeners = {};
  }
  
  if (!window.Tanko.on) {
    window.Tanko.on = function(eventName, callback) {
      if (!window.Tanko._eventListeners[eventName]) {
        window.Tanko._eventListeners[eventName] = [];
      }
      window.Tanko._eventListeners[eventName].push(callback);
    };
  }
  
  if (!window.Tanko.emit) {
    window.Tanko.emit = function(eventName, ...args) {
      const listeners = window.Tanko._eventListeners[eventName] || [];
      listeners.forEach(callback => {
        try {
          callback(...args);
        } catch (e) {
          console.error(`[Tanko.emit] Error in listener for ${eventName}:`, e);
        }
      });
    };
  }
  
  // BUILD14: Register callback with preload to receive player exit events
  if (window.electronAPI && typeof window.electronAPI._registerBuild14Callback === 'function') {
    window.electronAPI._registerBuild14Callback((payload) => {
      window.Tanko.emit('build14:playerExited', payload);
    });
  }
})();
