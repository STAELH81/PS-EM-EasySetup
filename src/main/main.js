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

function localized(language, english, french) {
  return language === 'fr' ? french : english;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1220,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#11141a',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
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

ipcMain.handle('select-ps1-bios', async (_event, language = 'en') => {
  const result = await dialog.showOpenDialog({
    title: localized(language, 'Select your PlayStation BIOS', 'Sélectionner votre BIOS PlayStation'),
    properties: ['openFile'],
    filters: [
      { name: 'PlayStation BIOS', extensions: ['bin', 'rom'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePaths[0]) return null;
  return inspectPs1BiosFile(result.filePaths[0]);
});

ipcMain.handle('select-duckstation-exe', async (_event, language = 'en') => {
  const result = await dialog.showOpenDialog({
    title: localized(language, 'Locate DuckStation', 'Localiser DuckStation'),
    properties: ['openFile'],
    filters: [{ name: 'DuckStation executable', extensions: ['exe'] }]
  });

  if (result.canceled || !result.filePaths[0]) return null;
  return validateDuckStationExecutable(result.filePaths[0]);
});

ipcMain.handle('select-pcsx2-exe', async (_event, language = 'en') => {
  const result = await dialog.showOpenDialog({
    title: localized(language, 'Locate PCSX2', 'Localiser PCSX2'),
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

ipcMain.handle('configure-pcsx2-game-library', async (event, language = 'en') => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const confirmation = await dialog.showMessageBox(owner, {
    type: 'question',
    buttons: [
      localized(language, 'Configure PCSX2', 'Configurer PCSX2'),
      localized(language, 'Cancel', 'Annuler')
    ],
    defaultId: 1,
    cancelId: 1,
    title: localized(language, 'Configure PCSX2 automatically', 'Configurer PCSX2 automatiquement'),
    message: localized(
      language,
      'Configure the BIOS selection and add Documents\\Jeux PS2 to the PCSX2 game list?',
      'Configurer la sélection du BIOS et ajouter Documents\\Jeux PS2 à la bibliothèque de jeux PCSX2 ?'
    ),
    detail: localized(
      language,
      'EasySetup only fills missing PS-EM defaults. Existing custom BIOS choices are preserved, PCSX2 must be closed, and a timestamped PCSX2.ini backup is created before any change.',
      'EasySetup complète uniquement les réglages PS-EM manquants. Les choix BIOS personnalisés existants sont conservés, PCSX2 doit être fermé, et une sauvegarde horodatée de PCSX2.ini est créée avant toute modification.'
    )
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

ipcMain.handle('install-pcsx2-winget', async (event, language = 'en') => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const confirmation = await dialog.showMessageBox(owner, {
    type: 'question',
    buttons: [
      localized(language, 'Install PCSX2', 'Installer PCSX2'),
      localized(language, 'Cancel', 'Annuler')
    ],
    defaultId: 1,
    cancelId: 1,
    title: localized(language, 'Install PCSX2 with WinGet', 'Installer PCSX2 avec WinGet'),
    message: localized(language, 'Install PCSX2 using Windows Package Manager?', 'Installer PCSX2 avec le gestionnaire de paquets Windows ?'),
    detail: localized(
      language,
      'EasySetup will ask WinGet to install the official PCSX2 package (PCSX2Team.PCSX2). Windows may show an installer or UAC prompt.',
      'EasySetup demandera à WinGet d’installer le paquet officiel PCSX2 (PCSX2Team.PCSX2). Windows peut afficher un installateur ou une demande UAC.'
    )
  });

  if (confirmation.response !== 0) {
    return { ok: false, cancelled: true };
  }

  return installPcsx2WithWinget();
});

ipcMain.handle('prepare-usb-biosdrain', async (event, root, forceReplace = false, language = 'en') => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const confirmation = await dialog.showMessageBox(owner, {
    type: forceReplace ? 'warning' : 'question',
    buttons: [
      forceReplace
        ? localized(language, 'Replace BIOSDrain', 'Remplacer BIOSDrain')
        : localized(language, 'Prepare USB', 'Préparer la clé USB'),
      localized(language, 'Cancel', 'Annuler')
    ],
    defaultId: 1,
    cancelId: 1,
    title: localized(language, 'Prepare USB for BIOSDrain', 'Préparer la clé USB pour BIOSDrain'),
    message: forceReplace
      ? localized(language, `Replace biosdrain.elf on ${root}?`, `Remplacer biosdrain.elf sur ${root} ?`)
      : localized(language, `Copy official BIOSDrain to ${root}?`, `Copier le BIOSDrain officiel sur ${root} ?`),
    detail: forceReplace
      ? localized(
          language,
          'The existing biosdrain.elf will be backed up as biosdrain.elf.bak before replacement. No other files are changed.',
          'Le biosdrain.elf existant sera sauvegardé sous biosdrain.elf.bak avant remplacement. Aucun autre fichier ne sera modifié.'
        )
      : localized(
          language,
          'EasySetup will download BIOSDrain from its official GitHub release and copy biosdrain.elf to the selected removable FAT32 drive. The drive will not be formatted.',
          'EasySetup téléchargera BIOSDrain depuis sa release GitHub officielle et copiera biosdrain.elf sur la clé FAT32 sélectionnée. La clé ne sera pas formatée.'
        )
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
