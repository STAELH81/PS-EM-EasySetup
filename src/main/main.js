const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const {
  inspectBiosFolder,
  detectUsbDrives,
  detectPcsx2,
  validatePcsx2Executable,
  getWorkspaceStatus,
  createGameFolder,
  copyBiosToPcsx2,
  detectControllers,
  installPcsx2WithWinget,
  prepareUsbWithBiosDrain,
  getPcsx2ConfigStatus,
  configurePcsx2GameLibrary,
  inspectPs1BiosFile,
  detectDuckStation,
  validateDuckStationExecutable,
  getPs1WorkspaceStatus,
  createPs1GameFolder,
  copyPs1BiosToDuckStation
} = require('./system');

function createWindow() {
  const win = new BrowserWindow({
    width: 1220,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#11141a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

ipcMain.handle('select-folder', async (_event, title) => {
  const result = await dialog.showOpenDialog({
    title: title || 'Select a folder',
    properties: ['openDirectory']
  });

  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle('select-ps1-bios', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select your PlayStation BIOS',
    properties: ['openFile'],
    filters: [
      { name: 'PlayStation BIOS', extensions: ['bin', 'rom'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePaths[0]) return null;
  return inspectPs1BiosFile(result.filePaths[0]);
});

ipcMain.handle('select-duckstation-exe', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Locate DuckStation',
    properties: ['openFile'],
    filters: [{ name: 'DuckStation executable', extensions: ['exe'] }]
  });

  if (result.canceled || !result.filePaths[0]) return null;
  return validateDuckStationExecutable(result.filePaths[0]);
});

ipcMain.handle('select-pcsx2-exe', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Locate PCSX2',
    properties: ['openFile'],
    filters: [
      { name: 'PCSX2 executable', extensions: ['exe'] }
    ]
  });

  if (result.canceled || !result.filePaths[0]) return null;
  return validatePcsx2Executable(result.filePaths[0]);
});

ipcMain.handle('inspect-bios-folder', async (_event, folderPath) => {
  return inspectBiosFolder(folderPath);
});

ipcMain.handle('detect-usb-drives', async () => {
  return detectUsbDrives();
});

ipcMain.handle('detect-pcsx2', async () => {
  return detectPcsx2();
});

ipcMain.handle('detect-duckstation', async () => {
  return detectDuckStation();
});

ipcMain.handle('ps1-workspace-status', async () => {
  return getPs1WorkspaceStatus(app.getPath('documents'));
});

ipcMain.handle('create-ps1-game-folder', async () => {
  return createPs1GameFolder(app.getPath('documents'));
});

ipcMain.handle('copy-ps1-bios', async (_event, sourceFile) => {
  return copyPs1BiosToDuckStation(sourceFile, app.getPath('documents'));
});

ipcMain.handle('workspace-status', async () => {
  return getWorkspaceStatus(app.getPath('documents'));
});

ipcMain.handle('pcsx2-config-status', async () => {
  return getPcsx2ConfigStatus(app.getPath('documents'));
});

ipcMain.handle('configure-pcsx2-game-library', async (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const confirmation = await dialog.showMessageBox(owner, {
    type: 'question',
    buttons: ['Configure PCSX2', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Configure PCSX2 game library',
    message: 'Add Documents\\Jeux PS2 to the PCSX2 game list?',
    detail: 'EasySetup will close nothing and overwrite nothing blindly. If PCSX2.ini needs a change, a timestamped backup will be created first.'
  });

  if (confirmation.response !== 0) {
    return { ok: false, cancelled: true };
  }

  return configurePcsx2GameLibrary(app.getPath('documents'));
});

ipcMain.handle('create-game-folder', async () => {
  return createGameFolder(app.getPath('documents'));
});

ipcMain.handle('copy-bios-to-pcsx2', async (_event, sourceFolder) => {
  return copyBiosToPcsx2(sourceFolder, app.getPath('documents'));
});

ipcMain.handle('detect-controllers', async () => {
  return detectControllers();
});

ipcMain.handle('install-pcsx2-winget', async (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const confirmation = await dialog.showMessageBox(owner, {
    type: 'question',
    buttons: ['Install PCSX2', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Install PCSX2 with WinGet',
    message: 'Install PCSX2 using Windows Package Manager?',
    detail: 'EasySetup will ask WinGet to install the official PCSX2 package (PCSX2Team.PCSX2). Windows may show an installer or UAC prompt.'
  });

  if (confirmation.response !== 0) {
    return { ok: false, cancelled: true };
  }

  return installPcsx2WithWinget();
});

ipcMain.handle('prepare-usb-biosdrain', async (event, root, forceReplace = false) => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const confirmation = await dialog.showMessageBox(owner, {
    type: forceReplace ? 'warning' : 'question',
    buttons: [forceReplace ? 'Replace BIOSDrain' : 'Prepare USB', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Prepare USB for BIOSDrain',
    message: forceReplace ? `Replace biosdrain.elf on ${root}?` : `Copy official BIOSDrain to ${root}?`,
    detail: forceReplace
      ? 'The existing biosdrain.elf will be backed up as biosdrain.elf.bak before replacement. No other files are changed.'
      : 'EasySetup will download BIOSDrain from its official GitHub release and copy biosdrain.elf to the selected removable FAT32 drive. The drive will not be formatted.'
  });

  if (confirmation.response !== 0) {
    return { ok: false, cancelled: true };
  }

  return prepareUsbWithBiosDrain(root, Boolean(forceReplace));
});

ipcMain.handle('open-path', async (_event, targetPath) => {
  if (!targetPath) return 'No path supplied.';
  return shell.openPath(targetPath);
});

ipcMain.handle('open-external', async (_event, url) => {
  await shell.openExternal(url);
  return true;
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
