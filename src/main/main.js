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
  detectControllers
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

ipcMain.handle('workspace-status', async () => {
  return getWorkspaceStatus(app.getPath('documents'));
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
