/** TankobanPlus — Renderer Health Monitor (Build 88) 
 * OWNERSHIP: Monitors main process responsiveness from renderer via window.Tanko API.
 * NOTE: This file is browser-safe (no CommonJS exports).
 */

;(function(){
  'use strict';

/**
 * TankobanPlus — Main Process Health Check (Build 88)
 * 
 * BUILD 88 FIX 3.2: Monitor main process responsiveness from renderer.
 * Pings main process every 5 seconds and logs warnings/errors based on response time.
 */

let healthCheckInterval = null;
let lastPingTime = 0;
let consecutiveTimeouts = 0;

/**
 * Start health check monitoring
 */
function startHealthCheck() {
  if (healthCheckInterval) return; // Already running
  
  console.log('[HEALTH] Starting main process health check');
  
  // Ping immediately, then every 5 seconds
  performHealthCheck();
  healthCheckInterval = setInterval(performHealthCheck, 5000);
}

/**
 * Stop health check monitoring
 */
function stopHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    console.log('[HEALTH] Stopped health check');
  }
}

/**
 * Perform a single health check ping
 */
async function performHealthCheck() {
  const pingStart = Date.now();
  lastPingTime = pingStart;
  
  try {
    // Simple IPC call that should be fast
    // Using a minimal operation to test main process responsiveness
    const response = await window.Tanko?.api?.ping?.();
    const duration = Date.now() - pingStart;
    
    // Reset timeout counter on success
    if (duration < 1000) {
      consecutiveTimeouts = 0;
    }
    
    // Log based on response time
    if (duration > 1000) {
      // Freeze detected
      consecutiveTimeouts++;
      console.error(`[HEALTH] Main process response: ${duration}ms (FREEZE DETECTED, count: ${consecutiveTimeouts})`);
    } else if (duration > 100) {
      // Slow response
      console.warn(`[HEALTH] Main process response: ${duration}ms (slow)`);
    } else if (duration > 50) {
      // Slightly elevated
      console.log(`[HEALTH] Main process response: ${duration}ms`);
    }
    // Don't log fast responses to avoid spam
    
  } catch (error) {
    const duration = Date.now() - pingStart;
    consecutiveTimeouts++;
    console.error(`[HEALTH] Main process ping failed after ${duration}ms:`, error.message);
  }
}

/**
 * Get health check status
 */
function getHealthStatus() {
  return {
    running: healthCheckInterval !== null,
    lastPingTime,
    consecutiveTimeouts
  };
}

// Auto-start health check when module loads
if (typeof window !== 'undefined' && window.Tanko) {
  // Delay start to avoid interfering with initial app load
  setTimeout(() => startHealthCheck(), 3000);
}


  // Expose API for diagnostics (optional)
  if (typeof window !== 'undefined') {
    window.Tanko = window.Tanko || {};
    window.Tanko.health = window.Tanko.health || {};
    window.Tanko.health.monitor = {
      start: startHealthCheck,
      stop: stopHealthCheck,
      ping: performHealthCheck,
      status: getHealthStatus
    };
  }
})();
