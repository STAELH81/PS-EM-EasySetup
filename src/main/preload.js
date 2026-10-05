const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easySetup', {
  selectFolder: (title) => ipcRenderer.invoke('select-folder', title),
  inspectBiosFolder: (folderPath) => ipcRenderer.invoke('inspect-bios-folder', folderPath),
  detectUsbDrives: () => ipcRenderer.invoke('detect-usb-drives'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  platform: process.platform
});
