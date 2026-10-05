# PS2-EM EasySetup

A guided Windows setup assistant for dumping a PS2 BIOS and configuring PCSX2.

## Goal

PS2-EM EasySetup is meant to take a beginner from “I want to emulate my PS2 games” to a clean PCSX2 setup without requiring them to already understand BIOS dumping, FreeMcBoot, FreeDVDBoot, game folders, controller mapping, or RetroAchievements.

The application does **not** include or distribute Sony BIOS files or game images.

## v0.3 — PC-side automation

v0.3 keeps the real BIOS/USB inspection from v0.2 and starts preparing the Windows/PCSX2 side automatically.

### PCSX2 detection

EasySetup now:

- Checks common PCSX2 installation locations.
- Checks whether `pcsx2-qt.exe` is available through PATH.
- Lets portable-build users locate the executable manually.
- Can launch the detected PCSX2 executable directly.

### Workspace preparation

EasySetup can now prepare the standard Documents-side workspace:

- `Documents\PCSX2\bios`
- `Documents\Jeux PS2`

The user explicitly triggers every file-system change.

For the BIOS destination, EasySetup:

- Re-validates the source BIOS before copying.
- Creates the destination folder when needed.
- Copies only the BIOS files found in the selected dump.
- Skips same-size files that already exist.
- Refuses to overwrite same-name files with a different size.
- Re-scans the destination and only marks it ready if a usable ROM0 is present.

For the games folder, EasySetup can create `Documents\Jeux PS2` and open it in Explorer.

### Controller scan

On Windows, EasySetup now performs a best-effort controller scan using Windows device information and shows likely connected gamepads/controllers before the user enters PCSX2 controller mapping.

Final button mapping remains inside PCSX2 because device APIs and mappings vary between controllers.

### Final dashboard

The completion screen now summarizes real state for:

- Verified BIOS source.
- Prepared PCSX2 BIOS destination.
- PCSX2 detection.
- Game-library folder.
- Controller detection.
- USB usage.

## Existing v0.2 features

- BIOSDrain-style `.rom0`, `.rom1`, `.rom2`, `.nvm` and `.mec` validation.
- SCPH model extraction from dump filenames.
- ROM0 sanity checks.
- Removable USB detection.
- FAT32 / MBR detection.
- `biosdrain.elf` detection.
- BIOS detection at the USB root.
- FreeMcBoot and FreeDVDBoot guided paths.

## Run the prototype

Requirements:

- Windows
- Node.js / npm

```powershell
git fetch origin
git checkout v0.3-pcsx2-setup
git pull
npm install
npm start
```

> With recent Node versions, npm may ask you to approve Electron's install script. The repository pins a compatible `yauzl` override for the Electron installer path.

## Safety philosophy

EasySetup should automate boring checks, not silently make destructive decisions.

Current rules:

- No BIOS files are bundled.
- No game images are bundled.
- USB scanning is read-only.
- USB formatting is never automatic.
- BIOS copies are user-triggered.
- Existing same-name BIOS files with different sizes are not overwritten.
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

- More robust PCSX2 portable-install discovery.
- Optional helper for adding the game folder inside PCSX2.
- BIOSDrain copy/preparation helpers for the selected USB drive.
- Windows installer / portable release packaging.
- French/English language support.
- Troubleshooting and recovery screens.

## License

MIT
