# PS2-EM EasySetup

A guided Windows setup assistant for dumping a PS2 BIOS and configuring PCSX2.

## Goal

PS2-EM EasySetup is meant to take a beginner from “I want to emulate my PS2 games” to a clean PCSX2 setup without requiring them to already understand BIOS dumping, FreeMcBoot, FreeDVDBoot, game folders, controller mapping, or RetroAchievements.

The application does **not** include or distribute Sony BIOS files or game images.

## v0.4 — USB preparation + first Windows installer

v0.4 pushes EasySetup closer to the original idea: launch one utility and let it handle the boring parts while keeping destructive operations out of the app.

### Prepare a PS2 USB with BIOSDrain

After selecting a removable drive, EasySetup can now:

- Verify that Windows still sees it as removable.
- Refuse to write if the drive is not FAT32.
- Query the official `F0bes/biosdrain` GitHub release.
- Download the latest official `biosdrain.elf`.
- Compute a SHA-256 of the downloaded file.
- Compare it with an existing `biosdrain.elf` on the USB.
- Leave an existing different file untouched unless the user explicitly chooses replacement.
- Back up a replaced file as `biosdrain.elf.bak`.
- Never format the USB drive.

The write action has its own confirmation dialog.

### PCSX2 installation assistance

If PCSX2 is missing, EasySetup now checks whether Windows Package Manager is available.

When WinGet is available, the user can explicitly ask EasySetup to install:

```text
PCSX2Team.PCSX2
```

EasySetup then rescans for PCSX2. Portable installations can still be located manually, and the official PCSX2 website remains available as a fallback.

### Existing PC-side automation

v0.4 keeps the v0.3 features:

- PCSX2 detection and launching.
- Verified BIOS copy to `Documents\PCSX2\bios`.
- No overwrite of different same-name BIOS files.
- Automatic creation of `Documents\Jeux PS2`.
- Controller detection.
- Final real-state dashboard.

### First real Windows installer

The project now uses `electron-builder` with an NSIS target.

Local build:

```powershell
npm install
npm run build
```

Expected output:

```text
dist\PS2-EM EasySetup-Setup-0.4.0.exe
```

A GitHub Actions workflow also builds the Windows installer and uploads it as the `PS2-EM-EasySetup-Windows` workflow artifact.

## Run from source

```powershell
git fetch origin
git checkout v0.4-usb-packaging
git pull
npm install
npm start
```

## Safety philosophy

EasySetup automates boring checks, not destructive disk operations.

Current rules:

- No BIOS files are bundled.
- No game images are bundled.
- USB formatting is never automatic.
- BIOSDrain comes from its official GitHub release at runtime.
- USB writes require an explicit user action and confirmation.
- A conflicting `biosdrain.elf` is not overwritten without another explicit confirmation.
- BIOS copies are user-triggered.
- Existing same-name BIOS files with different sizes are not overwritten.
- PCSX2 installation through WinGet requires confirmation.
- FreeDVDBoot compatibility is not guessed.

## Project structure

```text
src/
├── main/
│   ├── main.js
│   ├── preload.js
│   └── system.js
└── renderer/
    ├── index.html
    ├── styles.css
    └── app.js
```

## Roadmap

Likely next steps:

- Download/progress UI rather than waiting on a single action.
- More robust portable PCSX2 discovery.
- Optional helper for PCSX2 game-library configuration.
- French/English localization.
- Custom application/installer icon.
- Release automation with signed builds when the project is mature enough.

## License

MIT
