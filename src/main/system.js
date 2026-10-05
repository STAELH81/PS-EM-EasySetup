const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');

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

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
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

async function runPowerShell(script, timeout = 12000) {
  const encodedScript = Buffer.from(script, 'utf16le').toString('base64');

  return execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript],
    {
      windowsHide: true,
      timeout,
      maxBuffer: 1024 * 1024
    }
  );
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
  ].join('\n');

  try {
    const { stdout } = await runPowerShell(script);
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

async function detectPcsx2() {
  if (process.platform !== 'win32') {
    return {
      ok: true,
      supported: false,
      found: false,
      installations: []
    };
  }

  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.ProgramFiles || '';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || '';

  const candidates = [
    localAppData ? path.join(localAppData, 'Programs', 'PCSX2', 'pcsx2-qt.exe') : null,
    localAppData ? path.join(localAppData, 'PCSX2', 'pcsx2-qt.exe') : null,
    programFiles ? path.join(programFiles, 'PCSX2', 'pcsx2-qt.exe') : null,
    programFilesX86 ? path.join(programFilesX86, 'PCSX2', 'pcsx2-qt.exe') : null
  ].filter(Boolean);

  try {
    const { stdout } = await execFileAsync('where.exe', ['pcsx2-qt.exe'], {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 128 * 1024
    });

    for (const line of stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
      candidates.push(line);
    }
  } catch {
    // PCSX2 is commonly portable and therefore absent from PATH.
  }

  const installations = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const normalized = path.normalize(candidate);
    const key = normalized.toLowerCase();
    if (seen.has(key) || !(await exists(normalized))) continue;
    seen.add(key);

    installations.push({
      path: normalized,
      directory: path.dirname(normalized),
      source: normalized.toLowerCase().includes('program files') ? 'installed' : 'detected'
    });
  }

  return {
    ok: true,
    supported: true,
    found: installations.length > 0,
    installations,
    wingetAvailable: await hasWinget()
  };
}

async function validatePcsx2Executable(executablePath) {
  if (!executablePath || typeof executablePath !== 'string') {
    return { ok: false, error: 'No executable selected.' };
  }

  const name = path.basename(executablePath).toLowerCase();
  const looksLikePcsx2 = name === 'pcsx2-qt.exe' || /^pcsx2.*\.exe$/.test(name);

  if (!(await exists(executablePath))) {
    return { ok: false, error: 'The selected file no longer exists.' };
  }

  return {
    ok: looksLikePcsx2,
    path: executablePath,
    directory: path.dirname(executablePath),
    error: looksLikePcsx2 ? null : 'This executable does not look like PCSX2.'
  };
}

async function getWorkspaceStatus(documentsPath) {
  const gamesPath = path.join(documentsPath, 'Jeux PS2');
  const pcsx2Documents = path.join(documentsPath, 'PCSX2');
  const biosPath = path.join(pcsx2Documents, 'bios');

  const biosExists = await exists(biosPath);
  const biosScan = biosExists ? await inspectBiosFolder(biosPath) : null;
  const biosReady = Boolean(biosScan?.best?.validForPcsx2);

  return {
    ok: true,
    documentsPath,
    gamesPath,
    gamesExists: await exists(gamesPath),
    pcsx2Documents,
    pcsx2DocumentsExists: await exists(pcsx2Documents),
    biosPath,
    biosExists,
    biosReady,
    biosModel: biosScan?.best?.consoleModel || null
  };
}

async function createGameFolder(documentsPath) {
  const gamesPath = path.join(documentsPath, 'Jeux PS2');

  try {
    await fs.mkdir(gamesPath, { recursive: true });
    return {
      ok: true,
      path: gamesPath,
      created: true
    };
  } catch (error) {
    return {
      ok: false,
      path: gamesPath,
      error: error?.message || 'Unable to create the games folder.'
    };
  }
}

async function copyBiosToPcsx2(sourceFolder, documentsPath) {
  const scan = await inspectBiosFolder(sourceFolder);
  const candidate = scan.best;

  if (!scan.ok || !candidate?.validForPcsx2) {
    return {
      ok: false,
      error: 'No usable PS2 BIOS was found in the selected source folder.'
    };
  }

  const destination = path.join(documentsPath, 'PCSX2', 'bios');

  try {
    await fs.mkdir(destination, { recursive: true });

    const copied = [];
    const skipped = [];
    const conflicts = [];

    for (const part of BIOS_PARTS) {
      const source = candidate.files[part];
      if (!source) continue;

      const target = path.join(destination, source.name);

      if (path.resolve(source.path).toLowerCase() === path.resolve(target).toLowerCase()) {
        skipped.push({ name: source.name, reason: 'already-in-place' });
        continue;
      }

      if (await exists(target)) {
        const targetStat = await fs.stat(target);

        if (targetStat.size === source.size) {
          skipped.push({ name: source.name, reason: 'same-size-file-exists' });
        } else {
          conflicts.push({
            name: source.name,
            sourceSize: source.size,
            destinationSize: targetStat.size
          });
        }

        continue;
      }

      await fs.copyFile(source.path, target);
      copied.push(source.name);
    }

    return {
      ok: conflicts.length === 0,
      partial: conflicts.length > 0,
      destination,
      consoleModel: candidate.consoleModel,
      copied,
      skipped,
      conflicts,
      error: conflicts.length
        ? 'Some BIOS filenames already exist with different sizes. EasySetup did not overwrite them.'
        : null
    };
  } catch (error) {
    return {
      ok: false,
      destination,
      error: error?.message || 'Unable to copy BIOS files.'
    };
  }
}

async function detectControllers() {
  if (process.platform !== 'win32') {
    return {
      ok: true,
      supported: false,
      controllers: []
    };
  }

  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$pattern = 'controller|gamepad|xbox|dualshock|dualsense|wireless controller|8bitdo|gamesir|pro controller'",
    "$items = Get-CimInstance Win32_PnPEntity | Where-Object {",
    "  $_.Name -and $_.Status -eq 'OK' -and $_.Name -match $pattern",
    "} | Select-Object -Unique Name, Manufacturer, PNPClass, DeviceID",
    "$items | ConvertTo-Json -Compress"
  ].join('\n');

  try {
    const { stdout } = await runPowerShell(script, 15000);
    const trimmed = stdout.trim();
    const parsed = trimmed ? JSON.parse(trimmed) : [];
    const items = Array.isArray(parsed) ? parsed : [parsed];

    const controllers = items
      .filter((item) => item?.Name)
      .map((item) => ({
        name: String(item.Name || ''),
        manufacturer: String(item.Manufacturer || ''),
        pnpClass: String(item.PNPClass || ''),
        deviceId: String(item.DeviceID || '')
      }));

    return {
      ok: true,
      supported: true,
      controllers
    };
  } catch (error) {
    return {
      ok: false,
      supported: true,
      controllers: [],
      error: error?.message || 'Controller detection failed.'
    };
  }
}


async function hasWinget() {
  if (process.platform !== 'win32') return false;

  try {
    await execFileAsync('where.exe', ['winget.exe'], {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 64 * 1024
    });
    return true;
  } catch {
    return false;
  }
}

async function installPcsx2WithWinget() {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      error: 'WinGet installation is only available on Windows.'
    };
  }

  if (!(await hasWinget())) {
    return {
      ok: false,
      error: 'WinGet was not found on this Windows installation.'
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      'winget.exe',
      [
        'install',
        '--id', 'PCSX2Team.PCSX2',
        '--exact',
        '--source', 'winget',
        '--accept-source-agreements',
        '--accept-package-agreements'
      ],
      {
        windowsHide: false,
        timeout: 10 * 60 * 1000,
        maxBuffer: 4 * 1024 * 1024
      }
    );

    return {
      ok: true,
      stdout: stdout || '',
      stderr: stderr || ''
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || 'WinGet could not install PCSX2.',
      stdout: error?.stdout || '',
      stderr: error?.stderr || ''
    };
  }
}

async function sha256File(filePath) {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function fetchLatestBiosDrainAsset() {
  const response = await fetch('https://api.github.com/repos/F0bes/biosdrain/releases/latest', {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'PS2-EM-EasySetup'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub returned HTTP ${response.status} while checking BIOSDrain.`);
  }

  const release = await response.json();
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const asset = assets.find((item) => {
    const name = String(item?.name || '').toLowerCase();
    return name === 'biosdrain.elf' || (name.includes('biosdrain') && name.endsWith('.elf'));
  });

  if (!asset?.browser_download_url) {
    throw new Error('The latest BIOSDrain release does not contain a biosdrain.elf asset.');
  }

  return {
    releaseName: release.name || release.tag_name || 'Latest release',
    tag: release.tag_name || '',
    assetName: asset.name,
    downloadUrl: asset.browser_download_url,
    size: Number(asset.size) || 0
  };
}

async function downloadBiosDrainBytes() {
  const asset = await fetchLatestBiosDrainAsset();
  const response = await fetch(asset.downloadUrl, {
    headers: {
      'User-Agent': 'PS2-EM-EasySetup'
    },
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`BIOSDrain download returned HTTP ${response.status}.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);

  if (!bytes.length || bytes.length > 16 * 1024 * 1024) {
    throw new Error('Downloaded BIOSDrain file has an unexpected size.');
  }

  return {
    asset,
    bytes,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  };
}

async function prepareUsbWithBiosDrain(root, forceReplace = false) {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      error: 'Automatic USB preparation is currently available on Windows only.'
    };
  }

  const drivesResult = await detectUsbDrives();
  if (!drivesResult.ok) {
    return {
      ok: false,
      error: drivesResult.error || 'Could not verify the selected USB drive.'
    };
  }

  const selected = drivesResult.drives.find(
    (drive) => drive.root.toLowerCase() === String(root || '').toLowerCase()
  );

  if (!selected) {
    return {
      ok: false,
      error: 'The selected path is not currently detected as a removable USB drive.'
    };
  }

  if (!selected.fat32Ready) {
    return {
      ok: false,
      needsFat32: true,
      error: 'This USB drive is not FAT32. EasySetup will not format it automatically.'
    };
  }

  const target = path.join(selected.root, 'biosdrain.elf');

  try {
    const download = await downloadBiosDrainBytes();

    if (await exists(target)) {
      const currentHash = await sha256File(target);

      if (currentHash === download.sha256) {
        return {
          ok: true,
          alreadyReady: true,
          target,
          release: download.asset,
          sha256: download.sha256
        };
      }

      if (!forceReplace) {
        return {
          ok: false,
          conflict: true,
          target,
          currentSha256: currentHash,
          latestSha256: download.sha256,
          release: download.asset,
          error: 'biosdrain.elf already exists but differs from the latest official release. EasySetup did not overwrite it.'
        };
      }
    }

    const temporaryTarget = path.join(selected.root, 'biosdrain.elf.download');
    await fs.writeFile(temporaryTarget, download.bytes);

    let backup = null;
    if (await exists(target)) {
      backup = path.join(selected.root, 'biosdrain.elf.bak');
      await fs.copyFile(target, backup);
      await fs.rm(target, { force: true });
    }

    await fs.rename(temporaryTarget, target);

    return {
      ok: true,
      alreadyReady: false,
      target,
      backup,
      release: download.asset,
      sha256: download.sha256
    };
  } catch (error) {
    try {
      await fs.rm(path.join(selected.root, 'biosdrain.elf.download'), { force: true });
    } catch {
      // Best-effort cleanup.
    }

    return {
      ok: false,
      target,
      error: error?.message || 'Unable to prepare BIOSDrain on the USB drive.'
    };
  }
}

module.exports = {
  inspectBiosFolder,
  detectUsbDrives,
  detectPcsx2,
  validatePcsx2Executable,
  getWorkspaceStatus,
  createGameFolder,
  copyBiosToPcsx2,
  detectControllers,
  hasWinget,
  installPcsx2WithWinget,
  prepareUsbWithBiosDrain
};
