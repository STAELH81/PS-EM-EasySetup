# PS2-EM EasySetup

A guided Windows setup assistant for dumping a PS2 BIOS and configuring PCSX2.

## Goal

PS2-EM EasySetup is meant to take a beginner from “I want to emulate my PS2 games” to a clean PCSX2 setup without requiring them to already understand BIOS dumping, FreeMcBoot, FreeDVDBoot, game folders, controller mapping, or RetroAchievements.

The application does **not** include or distribute Sony BIOS files or game images.

## v0.2 — hardware-aware prototype

v0.2 turns the first static wizard into an assistant that can actually inspect the local machine.

### BIOS validation

When a BIOS folder is selected, EasySetup now:

- Scans for BIOSDrain-style `.rom0`, `.rom1`, `.rom2`, `.nvm` and `.mec` files.
- Groups matching files by dump name/model.
- Extracts a recognizable `SCPH-xxxxx` model when present.
- Checks that ROM0 has a plausible PS2 BIOS size.
- Distinguishes a full BIOSDrain set from a partial-but-usable ROM0 folder.
- Prevents the wizard from continuing when no usable ROM0 is detected.

### USB detection

On Windows, EasySetup can now:

- Detect connected removable drives.
- Display drive letter, label, capacity and free space.
- Detect FAT32.
- Detect MBR when Windows exposes the disk partition style.
- Detect `biosdrain.elf` at the USB root.
- Detect a BIOS dump placed at the USB root.
- Let the user select the USB they intend to use.

USB inspection is deliberately read-only. EasySetup **does not format drives automatically**.

### Guided dumping

The BIOS path now includes:

- Hardware checklist.
- USB detection before the dumping method.
- FreeMcBoot detection help.
- FreeMcBoot / uLaunchELF path.
- FreeDVDBoot path with fields for PS2 model and DVD Player version.
- Final BIOS verification after the dump.
- Reminder to store the dump somewhere permanent before reusing the USB drive.

### PCSX2 guidance

The wizard still covers:

- PCSX2 download/setup.
- BIOS folder selection.
- Game library folder.
- Controller mapping.
- Local two-player setup.
- Optional RetroAchievements.

## Run the prototype

Requirements:

- Windows
- Node.js / npm

Clone the repository, switch to the development branch, then run:

```powershell
git checkout v0.2-bios-usb
npm install
npm start
```

> With recent Node versions, npm may ask you to approve Electron's install script. The repository also pins a compatible `yauzl` override for the Electron installer path.

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

## Safety philosophy

EasySetup should automate boring checks, not dangerous disk operations.

Current rules:

- No BIOS files are bundled.
- No game images are bundled.
- BIOS/USB inspection is read-only.
- USB formatting is not automatic.
- FreeDVDBoot compatibility is not guessed; users are pointed to the official project for their exact console/DVD version.

## Roadmap

Likely next steps:

- PCSX2 installation detection.
- Automatic game-folder creation.
- Optional PCSX2 configuration helpers.
- Better USB preparation guidance.
- Windows installer / portable release packaging.
- French/English language support.
- More detailed troubleshooting screens.

## License

MIT
