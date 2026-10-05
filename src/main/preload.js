const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easySetup', {
  selectFolder: (title) => ipcRenderer.invoke('select-folder', title),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  platform: process.platform
});
