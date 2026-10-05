# PS2-EM EasySetup

A guided Windows setup assistant for dumping a PS2 BIOS and configuring PCSX2.

## Goal

PS2-EM EasySetup is meant to take a beginner from “I want to emulate my PS2 games” to a clean PCSX2 setup without requiring them to already understand BIOS dumping, FreeMcBoot, FreeDVDBoot, game folders, controller mapping, or RetroAchievements.

The application does **not** include or distribute Sony BIOS files or game images.

## v0.1 prototype

The first prototype includes:

- A Windows/Electron setup wizard.
- A branch for users who already have their own BIOS dump.
- A guided BIOS dumping path.
- FreeMcBoot / uLaunchELF instructions.
- FreeDVDBoot instructions.
- Official links to BIOSDrain, FreeDVDBoot and PCSX2.
- BIOS backup reminders.
- PCSX2 setup guidance.
- Controller and local multiplayer guidance.
- RetroAchievements guidance.

Planned next steps include BIOS file validation, USB detection, safer helper tooling, PCSX2 detection, game-folder automation, and packaging as a Windows installer.

## Run the prototype

Requirements:

- Windows
- Node.js / npm

Clone the repository, then run:

```bash
npm install
npm start
```

## Project structure

```text
src/
├── main/
│   ├── main.js
│   └── preload.js
└── renderer/
    ├── index.html
    ├── styles.css
    └── app.js
```

## Safety

The project intentionally avoids destructive automation in the first version. In particular, USB formatting is not automated yet because selecting the wrong disk could erase unrelated data.

## License

MIT
