const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const BIOS_PARTS = ['rom0', 'rom1', 'rom2', 'nvm', 'mec'];

function formatBytes(value) {
  if (!Number.isFinite(value)) return 'Unknown';
  if (value === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const number = value / (1024 ** index);

  return `${number >= 10 || index === 0 ? number.toFixed(0) : number.toFixed(1)} ${units[index]}`;
}

function normalizeModel(stem) {
  const match = stem.match(/SCPH[-_ ]?(\d{5})/i);
  return match ? `SCPH-${match[1]}` : stem;
}

async function inspectBiosFolder(folderPath) {
  if (!folderPath || typeof folderPath !== 'string') {
    return {
      ok: false,
      error: 'No folder was selected.',
      candidates: [],
      best: null
    };
  }

  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const groups = new Map();

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).slice(1).toLowerCase();
      if (!BIOS_PARTS.includes(ext)) continue;

      const stem = path.basename(entry.name, path.extname(entry.name));
      const key = stem.toLowerCase();

      if (!groups.has(key)) {
        groups.set(key, {
          stem,
          consoleModel: normalizeModel(stem),
          files: {}
        });
      }

      const fullPath = path.join(folderPath, entry.name);
      const stat = await fs.stat(fullPath);

      groups.get(key).files[ext] = {
        name: entry.name,
        path: fullPath,
        size: stat.size,
        sizeLabel: formatBytes(stat.size)
      };
    }

    const candidates = [...groups.values()].map((candidate) => {
      const present = BIOS_PARTS.filter((part) => candidate.files[part]);
      const missing = BIOS_PARTS.filter((part) => !candidate.files[part]);
      const hasRom0 = Boolean(candidate.files.rom0);
      const rom0Size = candidate.files.rom0?.size ?? 0;
      const rom0LooksSane = !hasRom0 || (rom0Size >= 2 * 1024 * 1024 && rom0Size <= 8 * 1024 * 1024);
      const complete = BIOS_PARTS.every((part) => candidate.files[part]);

      const warnings = [];
      if (hasRom0 && !rom0LooksSane) {
        warnings.push('ROM0 has an unusual size. Verify that this is really a PS2 BIOS dump.');
      }
      if (hasRom0 && !complete) {
        warnings.push('PCSX2 can detect ROM0, but this is not a complete BIOSDrain file set.');
      }

      return {
        ...candidate,
        present,
        missing,
        validForPcsx2: hasRom0 && rom0LooksSane,
        completeBiosDrainSet: complete && rom0LooksSane,
        warnings
      };
    }).sort((a, b) => {
      const score = (candidate) =>
        (candidate.completeBiosDrainSet ? 100 : 0) +
        (candidate.validForPcsx2 ? 50 : 0) +
        candidate.present.length;

      return score(b) - score(a);
    });

    return {
      ok: true,
      folderPath,
      candidates,
      best: candidates[0] ?? null
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || 'Unable to inspect this folder.',
      folderPath,
      candidates: [],
      best: null
    };
  }
}

async function getDriveExtraInfo(root) {
  const result = {
    hasBiosDrain: false,
    bios: null
  };

  try {
    await fs.access(path.join(root, 'biosdrain.elf'));
    result.hasBiosDrain = true;
  } catch {
    // File is optional.
  }

  const bios = await inspectBiosFolder(root);
  if (bios.ok && bios.best) {
    result.bios = bios.best;
  }

  return result;
}

async function detectUsbDrives() {
  if (process.platform !== 'win32') {
    return {
      ok: true,
      supported: false,
      drives: [],
      message: 'Automatic removable-drive detection is currently available on Windows only.'
    };
  }

  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$volumes = Get-Volume | Where-Object { $_.DriveType -eq 'Removable' -and $_.DriveLetter }",
    "$items = foreach ($v in $volumes) {",
    "  $partition = Get-Partition -DriveLetter $v.DriveLetter -ErrorAction SilentlyContinue | Select-Object -First 1",
    "  $disk = if ($partition) { $partition | Get-Disk -ErrorAction SilentlyContinue } else { $null }",
    "  [PSCustomObject]@{",
    "    DriveLetter = [string]$v.DriveLetter",
    "    FileSystemLabel = [string]$v.FileSystemLabel",
    "    FileSystem = [string]$v.FileSystem",
    "    Size = [UInt64]$v.Size",
    "    SizeRemaining = [UInt64]$v.SizeRemaining",
    "    PartitionStyle = if ($disk) { [string]$disk.PartitionStyle } else { '' }",
    "    FriendlyName = if ($disk) { [string]$disk.FriendlyName } else { '' }",
    "  }",
    "}",
    "$items | ConvertTo-Json -Compress"
  ].join('\\n');

  try {
    const encodedScript = Buffer.from(script, 'utf16le').toString('base64');

    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript],
      {
        windowsHide: true,
        timeout: 12000,
        maxBuffer: 1024 * 1024
      }
    );

    const trimmed = stdout.trim();
    const parsed = trimmed ? JSON.parse(trimmed) : [];
    const items = Array.isArray(parsed) ? parsed : [parsed];

    const drives = [];

    for (const item of items) {
      if (!item?.DriveLetter) continue;

      const root = `${item.DriveLetter}:\\`;
      const extra = await getDriveExtraInfo(root);

      drives.push({
        letter: `${item.DriveLetter}:`,
        root,
        label: item.FileSystemLabel || '',
        fileSystem: item.FileSystem || 'Unknown',
        partitionStyle: item.PartitionStyle || 'Unknown',
        friendlyName: item.FriendlyName || 'Removable drive',
        size: Number(item.Size) || 0,
        sizeLabel: formatBytes(Number(item.Size) || 0),
        freeSpace: Number(item.SizeRemaining) || 0,
        freeSpaceLabel: formatBytes(Number(item.SizeRemaining) || 0),
        fat32Ready: String(item.FileSystem || '').toUpperCase() === 'FAT32',
        mbrReady: String(item.PartitionStyle || '').toUpperCase() === 'MBR',
        ...extra
      });
    }

    return {
      ok: true,
      supported: true,
      drives
    };
  } catch (error) {
    return {
      ok: false,
      supported: true,
      drives: [],
      error: error?.message || 'USB detection failed.'
    };
  }
}

module.exports = {
  inspectBiosFolder,
  detectUsbDrives
};
