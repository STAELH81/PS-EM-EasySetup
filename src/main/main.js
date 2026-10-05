const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const { inspectBiosFolder, detectUsbDrives } = require('./system');

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 960,
    minHeight: 660,
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

ipcMain.handle('inspect-bios-folder', async (_event, folderPath) => {
  return inspectBiosFolder(folderPath);
});

ipcMain.handle('detect-usb-drives', async () => {
  return detectUsbDrives();
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
