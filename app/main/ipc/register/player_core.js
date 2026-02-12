// TankobanPro — IPC: Player Core (Pro V1half)
// Foundation only. Renderer is NOT rerouted yet.

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  // Strict Player Core API
  ipcMain.handle(CHANNEL.PLAYER_START, (e, ...args) => domains.playerCoreDomain.start(ctx, e, ...args));
  ipcMain.handle(CHANNEL.PLAYER_PLAY, (e, ...args) => domains.playerCoreDomain.play(ctx, e, ...args));
  ipcMain.handle(CHANNEL.PLAYER_PAUSE, (e, ...args) => domains.playerCoreDomain.pause(ctx, e, ...args));
  ipcMain.handle(CHANNEL.PLAYER_SEEK, (e, ...args) => domains.playerCoreDomain.seek(ctx, e, ...args));
  ipcMain.handle(CHANNEL.PLAYER_STOP, (e, ...args) => domains.playerCoreDomain.stop(ctx, e, ...args));
  ipcMain.handle(CHANNEL.PLAYER_GET_STATE, (e, ...args) => domains.playerCoreDomain.getState(ctx, e, ...args));
  ipcMain.handle(CHANNEL.PLAYER_LAUNCH_QT, (e, ...args) => domains.playerCoreDomain.launchQt(ctx, e, ...args));
  
  // BUILD14: State save/restore handlers
  ipcMain.handle(CHANNEL.BUILD14_SAVE_RETURN_STATE, (e, ...args) => domains.playerCoreDomain.saveReturnState(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BUILD14_GET_RETURN_STATE, (e, ...args) => domains.playerCoreDomain.getReturnState(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BUILD14_CLEAR_RETURN_STATE, (e, ...args) => domains.playerCoreDomain.clearReturnState(ctx, e, ...args));
};
