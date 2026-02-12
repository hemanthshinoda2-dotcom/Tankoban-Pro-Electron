// Build 21 - Folder Thumbnails IPC handlers

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  // Build 21: Folder thumbnail auto-generation
  ipcMain.handle('video:getFolderThumbnail', (e, ...args) => 
    domains.folderThumbsDomain.getFolderThumbnail(ctx, e, ...args));
  
  ipcMain.handle('video:requestFolderThumbnail', (e, ...args) => 
    domains.folderThumbsDomain.requestFolderThumbnail(ctx, e, ...args));
};
