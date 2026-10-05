# PS-EM EasySetup

A guided Windows setup assistant for PlayStation and PlayStation 2 emulation.

## Goal

PS-EM EasySetup is meant to take a beginner from “I own the console / BIOS and want to emulate my games” to a clean emulator setup without requiring them to already understand BIOS formats, emulator folders, controller mapping, FreeMcBoot or FreeDVDBoot.

The application does **not** include or distribute Sony BIOS files or game images.

## v0.5 — PS1 + PS2

v0.5 turns the old PS2-only project into a multi-console PlayStation setup utility and adds the first real "finished app" polish pass.

### Finished-app polish

- Persistent **French / English** language switcher.
- First-run onboarding rewritten around three simple steps: console → BIOS → emulator.
- Custom **PS-EM application / installer icon** generated at build time with pure Node.
- Improved Windows controller detection with device classification (Xbox/XInput, DualShock, DualSense, 8BitDo, GameSir, Nintendo, generic) and USB/Bluetooth hints.
- Native confirmation dialogs are localized in FR/EN.
- Safer PCSX2 auto-configuration:
  - detects `PCSX2.ini`;
  - refuses to edit while PCSX2 is running;
  - creates a timestamped backup before changes;
  - adds `Documents\Jeux PS2` to the recursive game list;
  - fills missing BIOS folder/selection defaults when a verified BIOS is available;
  - preserves existing custom BIOS choices.

### PlayStation (PS1)

The new PS1 path includes:

- A console selector on startup.
- Local PS1 BIOS selection.
- BIOS validation using the expected 512 KB retail BIOS size.
- SHA-256 calculation shown locally for the selected BIOS.
- SCPH model extraction when the filename contains one.
- DuckStation detection from common Windows install locations and the registry.
- Manual DuckStation executable selection for portable builds.
- Official DuckStation download link.
- User-triggered BIOS copy to `Documents\DuckStation\bios`.
- Protection against silently overwriting a different same-name BIOS.
- Automatic creation of `Documents\Jeux PS1`.
- Shared Windows controller scan.
- A PS1-specific final setup dashboard.

### PlayStation 2 (PS2)

The complete v0.4 PS2 flow remains available:

- BIOSDrain dump validation.
- Removable USB detection.
- FAT32 / MBR checks.
- Official BIOSDrain download + USB preparation.
- FreeMcBoot / FreeDVDBoot guidance.
- PCSX2 detection.
- Optional PCSX2 installation through WinGet.
- BIOS copy to `Documents\PCSX2\bios`.
- Automatic creation of `Documents\Jeux PS2`.
- Controller detection.
- Final setup dashboard.

## Run the v0.5 branch

```powershell
git fetch origin
git checkout v0.5-multiconsole
git pull
npm install
npm start
```

Because the repository was renamed, existing clones can update their remote with:

```powershell
git remote set-url origin https://github.com/STAELH81/PS-EM-EasySetup.git
```

## Windows installer

```powershell
npm run build
```

The installer name is versioned automatically, for example:

```text
PS-EM EasySetup-Setup-0.5.0.exe
```

GitHub Actions builds the Windows installer for pull requests and the release workflow publishes a versioned GitHub Release when a new package version reaches `main`.

## Safety philosophy

PS-EM automates repetitive checks, not destructive decisions.

- No Sony BIOS is bundled.
- No game image is bundled.
- BIOS inspection happens locally.
- USB formatting is never automatic.
- BIOSDrain comes from its official GitHub release.
- USB writes require explicit confirmation.
- Existing conflicting BIOS files are not overwritten silently.
- PCSX2 installation requires explicit confirmation.
- FreeDVDBoot compatibility is not guessed.

## Current emulator targets

| Console | Emulator |
| --- | --- |
| PlayStation | DuckStation |
| PlayStation 2 | PCSX2 |

## Roadmap

- Better PS1 BIOS metadata / region display.
- More robust DuckStation portable discovery.
- Optional DuckStation installation automation.
- Shared console modules instead of console-specific logic living in the main renderer.
- French / English localization.
- Custom application and installer icon.
- More PlayStation generations later.

## License

MIT
