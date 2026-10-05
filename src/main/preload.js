const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easySetup', {
  selectFolder: (title) => ipcRenderer.invoke('select-folder', title),
  selectPcsx2Exe: () => ipcRenderer.invoke('select-pcsx2-exe'),
  inspectBiosFolder: (folderPath) => ipcRenderer.invoke('inspect-bios-folder', folderPath),
  detectUsbDrives: () => ipcRenderer.invoke('detect-usb-drives'),
  detectPcsx2: () => ipcRenderer.invoke('detect-pcsx2'),
  workspaceStatus: () => ipcRenderer.invoke('workspace-status'),
  createGameFolder: () => ipcRenderer.invoke('create-game-folder'),
  copyBiosToPcsx2: (sourceFolder) => ipcRenderer.invoke('copy-bios-to-pcsx2', sourceFolder),
  detectControllers: () => ipcRenderer.invoke('detect-controllers'),
  openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  platform: process.platform
});
