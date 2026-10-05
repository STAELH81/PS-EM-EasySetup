const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easySetup', {
  selectFolder: (title) => ipcRenderer.invoke('select-folder', title),
  selectPcsx2Exe: (language) => ipcRenderer.invoke('select-pcsx2-exe', language),
  selectPs1Bios: (language) => ipcRenderer.invoke('select-ps1-bios', language),
  selectDuckStationExe: (language) => ipcRenderer.invoke('select-duckstation-exe', language),
  inspectBiosFolder: (folderPath) => ipcRenderer.invoke('inspect-bios-folder', folderPath),
  detectUsbDrives: () => ipcRenderer.invoke('detect-usb-drives'),
  detectPcsx2: () => ipcRenderer.invoke('detect-pcsx2'),
  detectDuckStation: () => ipcRenderer.invoke('detect-duckstation'),
  ps1WorkspaceStatus: () => ipcRenderer.invoke('ps1-workspace-status'),
  createPs1GameFolder: () => ipcRenderer.invoke('create-ps1-game-folder'),
  copyPs1Bios: (sourceFile) => ipcRenderer.invoke('copy-ps1-bios', sourceFile),
  workspaceStatus: () => ipcRenderer.invoke('workspace-status'),
  pcsx2ConfigStatus: () => ipcRenderer.invoke('pcsx2-config-status'),
  configurePcsx2GameLibrary: (language) => ipcRenderer.invoke('configure-pcsx2-game-library', language),
  createGameFolder: () => ipcRenderer.invoke('create-game-folder'),
  copyBiosToPcsx2: (sourceFolder) => ipcRenderer.invoke('copy-bios-to-pcsx2', sourceFolder),
  detectControllers: () => ipcRenderer.invoke('detect-controllers'),
  installPcsx2Winget: (language) => ipcRenderer.invoke('install-pcsx2-winget', language),
  prepareUsbBiosDrain: (root, forceReplace = false, language = 'en') => ipcRenderer.invoke('prepare-usb-biosdrain', root, forceReplace, language),
  openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  platform: process.platform
});
