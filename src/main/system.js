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

  try {
    const registryScript = [
      "$paths = @(",
      "  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
      "  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
      "  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'",
      ")",
      "$items = Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match '^PCSX2' } | Select-Object DisplayName, InstallLocation, DisplayIcon",
      "$items | ConvertTo-Json -Compress"
    ].join('\n');

    const { stdout } = await runPowerShell(registryScript, 8000);
    const trimmed = stdout.trim();
    const parsed = trimmed ? JSON.parse(trimmed) : [];
    const items = Array.isArray(parsed) ? parsed : [parsed];

    for (const item of items) {
      if (item?.InstallLocation) {
        candidates.push(path.join(String(item.InstallLocation), 'pcsx2-qt.exe'));
      }

      if (item?.DisplayIcon) {
        const iconPath = String(item.DisplayIcon)
          .replace(/^"/, '')
          .replace(/",?-?\d*$/, '')
          .replace(/,-?\d*$/, '');

        if (/pcsx2.*\.exe$/i.test(iconPath)) {
          candidates.push(iconPath);
        }
      }
    }
  } catch {
    // Registry discovery is best effort.
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
    "$pattern = 'controller|gamepad|xbox|dualshock|dualsense|wireless controller|8bitdo|gamesir|pro controller|joy-con|joystick'",
    "$ignore = 'mouse|keyboard|touchpad|consumer control|system control'",
    "$items = Get-CimInstance Win32_PnPEntity | Where-Object {",
    "  $_.Name -and $_.Status -eq 'OK' -and",
    "  $_.Name -match $pattern -and $_.Name -notmatch $ignore",
    "} | Select-Object Name, Manufacturer, PNPClass, DeviceID",
    "$items | ConvertTo-Json -Compress"
  ].join('\n');

  try {
    const { stdout } = await runPowerShell(script, 15000);
    const trimmed = stdout.trim();
    const parsed = trimmed ? JSON.parse(trimmed) : [];
    const items = Array.isArray(parsed) ? parsed : [parsed];

    const seen = new Set();
    const controllers = [];

    for (const item of items) {
      if (!item?.Name) continue;

      const name = String(item.Name || '').trim();
      const manufacturer = String(item.Manufacturer || '').trim();
      const pnpClass = String(item.PNPClass || '').trim();
      const deviceId = String(item.DeviceID || '').trim();
      const key = (deviceId || name).toLowerCase();

      if (!key || seen.has(key)) continue;
      seen.add(key);

      const haystack = `${name} ${manufacturer}`.toLowerCase();
      let type = 'generic';
      let profile = 'Generic Gamepad';

      if (/dualsense|wireless controller/.test(haystack) && /sony|playstation|dualsense/.test(haystack)) {
        type = 'dualsense';
        profile = 'DualSense';
      } else if (/dualshock|sony computer entertainment/.test(haystack)) {
        type = 'dualshock';
        profile = 'DualShock';
      } else if (/xbox|xinput/.test(haystack)) {
        type = 'xbox';
        profile = 'Xbox / XInput';
      } else if (/8bitdo/.test(haystack)) {
        type = '8bitdo';
        profile = '8BitDo';
      } else if (/gamesir/.test(haystack)) {
        type = 'gamesir';
        profile = 'GameSir';
      } else if (/joy-con|pro controller|nintendo/.test(haystack)) {
        type = 'nintendo';
        profile = 'Nintendo';
      }

      const id = deviceId.toUpperCase();
      const connection = id.startsWith('BTH') || id.includes('BLUETOOTH')
        ? 'Bluetooth'
        : id.startsWith('USB') || id.includes('VID_')
          ? 'USB'
          : 'Connected';

      controllers.push({
        name,
        manufacturer,
        pnpClass,
        deviceId,
        type,
        profile,
        connection
      });
    }

    controllers.sort((a, b) => {
      const score = (controller) => controller.type === 'generic' ? 1 : 0;
      return score(a) - score(b) || a.name.localeCompare(b.name);
    });

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
      'User-Agent': 'PS-EM-EasySetup'
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
      'User-Agent': 'PS-EM-EasySetup'
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



function normalizeWindowsPath(value) {
  return path.normalize(String(value || '')).replace(/[\\/]+$/, '').toLowerCase();
}

async function findPcsx2SettingsFile(documentsPath) {
  const root = path.join(documentsPath, 'PCSX2');
  const candidates = [
    path.join(root, 'inis', 'PCSX2.ini'),
    path.join(root, 'PCSX2.ini')
  ];

  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }

  return null;
}

function getIniSectionBounds(lines, sectionName) {
  const wanted = sectionName.toLowerCase();
  let start = -1;
  let end = lines.length;

  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^\s*\[([^\]]+)\]\s*$/);
    if (!match) continue;

    const section = match[1].trim().toLowerCase();
    if (section === wanted) {
      start = index;
      continue;
    }

    if (start >= 0) {
      end = index;
      break;
    }
  }

  return { start, end };
}

function getIniListValues(lines, sectionName, keys) {
  const bounds = getIniSectionBounds(lines, sectionName);
  if (bounds.start < 0) return [];

  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const values = [];

  for (let index = bounds.start + 1; index < bounds.end; index++) {
    const match = lines[index].match(/^\s*([^=;#]+?)\s*=\s*(.*?)\s*$/);
    if (!match) continue;

    const key = match[1].trim().toLowerCase();
    if (wanted.has(key)) values.push({ key, value: match[2].trim(), index });
  }

  return values;
}

function getIniValue(lines, sectionName, keyName) {
  const bounds = getIniSectionBounds(lines, sectionName);
  if (bounds.start < 0) return null;

  const wanted = keyName.toLowerCase();

  for (let index = bounds.start + 1; index < bounds.end; index++) {
    const match = lines[index].match(/^\s*([^=;#]+?)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    if (match[1].trim().toLowerCase() === wanted) return match[2].trim();
  }

  return null;
}

function addIniValueIfMissing(content, sectionName, key, value) {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const current = getIniValue(lines, sectionName, key);

  if (current !== null) {
    return { content, changed: false, existingValue: current };
  }

  const bounds = getIniSectionBounds(lines, sectionName);

  if (bounds.start < 0) {
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(`[${sectionName}]`);
    lines.push(`${key} = ${value}`);
  } else {
    lines.splice(bounds.end, 0, `${key} = ${value}`);
  }

  return {
    content: lines.join(newline),
    changed: true,
    existingValue: null
  };
}

function addIniListValue(content, sectionName, key, value) {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const existing = getIniListValues(lines, sectionName, ['Paths', 'RecursivePaths']);
  const wantedPath = normalizeWindowsPath(value);

  if (existing.some((entry) => normalizeWindowsPath(entry.value) === wantedPath)) {
    return { content, changed: false, alreadyPresent: true };
  }

  let bounds = getIniSectionBounds(lines, sectionName);

  if (bounds.start < 0) {
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(`[${sectionName}]`);
    lines.push(`${key} = ${value}`);
  } else {
    lines.splice(bounds.end, 0, `${key} = ${value}`);
  }

  return {
    content: lines.join(newline),
    changed: true,
    alreadyPresent: false
  };
}

async function isPcsx2Running() {
  if (process.platform !== 'win32') return false;

  try {
    const { stdout } = await execFileAsync(
      'tasklist.exe',
      ['/FI', 'IMAGENAME eq pcsx2-qt.exe', '/NH'],
      {
        windowsHide: true,
        timeout: 5000,
        maxBuffer: 128 * 1024
      }
    );

    return /pcsx2-qt\.exe/i.test(stdout);
  } catch {
    return false;
  }
}

async function getPcsx2ConfigStatus(documentsPath) {
  const gamesPath = path.join(documentsPath, 'Jeux PS2');
  const settingsPath = await findPcsx2SettingsFile(documentsPath);

  if (!settingsPath) {
    return {
      ok: true,
      settingsFound: false,
      settingsPath: null,
      gamesPath,
      gameListConfigured: false
    };
  }

  try {
    const content = await fs.readFile(settingsPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const values = getIniListValues(lines, 'GameList', ['Paths', 'RecursivePaths']);
    const wanted = normalizeWindowsPath(gamesPath);
    const gameListConfigured = values.some((entry) => normalizeWindowsPath(entry.value) === wanted);

    const biosPath = path.join(documentsPath, 'PCSX2', 'bios');
    const biosScan = await inspectBiosFolder(biosPath);
    const biosName = biosScan?.best?.files?.rom0?.name || null;
    const configuredBiosFolder = getIniValue(lines, 'Folders', 'Bios');
    const configuredBiosName = getIniValue(lines, 'Filenames', 'BIOS');

    const biosFolderConfigured = Boolean(
      biosName &&
      (!configuredBiosFolder || normalizeWindowsPath(configuredBiosFolder) === normalizeWindowsPath(biosPath))
    );

    const biosSelectionConfigured = Boolean(
      biosName &&
      configuredBiosName &&
      configuredBiosName.toLowerCase() === biosName.toLowerCase()
    );

    return {
      ok: true,
      settingsFound: true,
      settingsPath,
      gamesPath,
      gameListConfigured,
      biosPath,
      biosName,
      configuredBiosFolder,
      configuredBiosName,
      biosFolderConfigured,
      biosSelectionConfigured
    };
  } catch (error) {
    return {
      ok: false,
      settingsFound: true,
      settingsPath,
      gamesPath,
      gameListConfigured: false,
      error: error?.message || 'Unable to inspect PCSX2 configuration.'
    };
  }
}

async function configurePcsx2GameLibrary(documentsPath) {
  const gamesPath = path.join(documentsPath, 'Jeux PS2');
  await fs.mkdir(gamesPath, { recursive: true });

  if (await isPcsx2Running()) {
    return {
      ok: false,
      pcsx2Running: true,
      error: 'Close PCSX2 before EasySetup edits its configuration.'
    };
  }

  const settingsPath = await findPcsx2SettingsFile(documentsPath);

  if (!settingsPath) {
    return {
      ok: false,
      needsFirstLaunch: true,
      gamesPath,
      error: 'PCSX2 settings were not found yet. Launch PCSX2 once, finish its first-run wizard, then rescan.'
    };
  }

  try {
    const original = await fs.readFile(settingsPath, 'utf8');
    let updated = original;

    const gameListPatch = addIniListValue(updated, 'GameList', 'RecursivePaths', gamesPath);
    updated = gameListPatch.content;

    const biosPath = path.join(documentsPath, 'PCSX2', 'bios');
    const biosScan = await inspectBiosFolder(biosPath);
    const biosName = biosScan?.best?.files?.rom0?.name || null;

    let biosFolderPatch = { changed: false, existingValue: null };
    let biosSelectionPatch = { changed: false, existingValue: null };

    if (biosName) {
      biosFolderPatch = addIniValueIfMissing(updated, 'Folders', 'Bios', biosPath);
      updated = biosFolderPatch.content;

      biosSelectionPatch = addIniValueIfMissing(updated, 'Filenames', 'BIOS', biosName);
      updated = biosSelectionPatch.content;
    }

    const changed = updated !== original;

    if (!changed) {
      return {
        ok: true,
        changed: false,
        alreadyConfigured: true,
        settingsPath,
        gamesPath,
        biosPath,
        biosName,
        gameListConfigured: true,
        biosFolderConfigured: Boolean(biosName),
        biosSelectionConfigured: Boolean(biosName),
        existingBiosFolder: biosFolderPatch.existingValue,
        existingBiosSelection: biosSelectionPatch.existingValue,
        backupPath: null
      };
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${settingsPath}.psem-backup-${stamp}`;
    await fs.copyFile(settingsPath, backupPath);
    await fs.writeFile(settingsPath, updated, 'utf8');

    return {
      ok: true,
      changed: true,
      alreadyConfigured: false,
      settingsPath,
      gamesPath,
      biosPath,
      biosName,
      gameListConfigured: true,
      biosFolderConfigured: biosName ? (biosFolderPatch.changed || normalizeWindowsPath(biosFolderPatch.existingValue) === normalizeWindowsPath(biosPath)) : false,
      biosSelectionConfigured: biosName ? (biosSelectionPatch.changed || String(biosSelectionPatch.existingValue || '').toLowerCase() === biosName.toLowerCase()) : false,
      existingBiosFolder: biosFolderPatch.existingValue,
      existingBiosSelection: biosSelectionPatch.existingValue,
      backupPath
    };
  } catch (error) {
    return {
      ok: false,
      settingsPath,
      gamesPath,
      error: error?.message || 'Unable to update PCSX2 game-list configuration.'
    };
  }
}

function normalizePs1Model(fileName) {
  const match = String(fileName || '').match(/SCPH[-_ ]?(\d{3,5})/i);
  return match ? `SCPH-${match[1]}` : null;
}

async function inspectPs1BiosFile(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { ok: false, error: 'No BIOS file was selected.' };
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      return { ok: false, error: 'The selected path is not a file.' };
    }

    const ext = path.extname(filePath).toLowerCase();
    const size = stat.size;
    const expectedSize = 512 * 1024;
    const validSize = size === expectedSize;
    const allowedExtension = ['.bin', '.rom'].includes(ext);
    const sha256 = await sha256File(filePath);

    const warnings = [];
    if (!allowedExtension) {
      warnings.push('The file extension is unusual for a PS1 BIOS. DuckStation commonly uses .bin BIOS images.');
    }
    if (!validSize) {
      warnings.push('A standard retail PS1 BIOS image is expected to be 512 KB.');
    }

    return {
      ok: true,
      path: filePath,
      name: path.basename(filePath),
      size,
      sizeLabel: formatBytes(size),
      sha256,
      model: normalizePs1Model(path.basename(filePath)),
      validForDuckStation: validSize,
      warnings
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || 'Unable to inspect this PS1 BIOS file.'
    };
  }
}

async function findDuckStationExecutablesInDir(directory) {
  if (!directory || !(await exists(directory))) return [];

  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /^duckstation.*\.exe$/i.test(entry.name))
      .map((entry) => path.join(directory, entry.name));
  } catch {
    return [];
  }
}

async function detectDuckStation() {
  if (process.platform !== 'win32') {
    return { ok: true, supported: false, found: false, installations: [] };
  }

  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.ProgramFiles || '';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || '';

  const directories = [
    localAppData ? path.join(localAppData, 'Programs', 'DuckStation') : null,
    localAppData ? path.join(localAppData, 'DuckStation') : null,
    programFiles ? path.join(programFiles, 'DuckStation') : null,
    programFilesX86 ? path.join(programFilesX86, 'DuckStation') : null
  ].filter(Boolean);

  const candidates = [];

  for (const directory of directories) {
    candidates.push(...await findDuckStationExecutablesInDir(directory));
  }

  try {
    const registryScript = [
      "$paths = @(",
      "  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
      "  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
      "  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'",
      ")",
      "$items = Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match 'DuckStation' } | Select-Object DisplayName, InstallLocation, DisplayIcon",
      "$items | ConvertTo-Json -Compress"
    ].join('\n');

    const { stdout } = await runPowerShell(registryScript, 8000);
    const trimmed = stdout.trim();
    const parsed = trimmed ? JSON.parse(trimmed) : [];
    const items = Array.isArray(parsed) ? parsed : [parsed];

    for (const item of items) {
      if (item?.InstallLocation) {
        candidates.push(...await findDuckStationExecutablesInDir(String(item.InstallLocation)));
      }

      if (item?.DisplayIcon) {
        const iconPath = String(item.DisplayIcon)
          .replace(/^"/, '')
          .replace(/",?-?\d*$/, '')
          .replace(/,-?\d*$/, '');

        if (/duckstation.*\.exe$/i.test(iconPath)) candidates.push(iconPath);
      }
    }
  } catch {
    // Registry discovery is best effort.
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
    installations
  };
}

async function validateDuckStationExecutable(executablePath) {
  if (!executablePath || typeof executablePath !== 'string') {
    return { ok: false, error: 'No executable selected.' };
  }

  if (!(await exists(executablePath))) {
    return { ok: false, error: 'The selected file no longer exists.' };
  }

  const name = path.basename(executablePath);
  const looksLikeDuckStation = /^duckstation.*\.exe$/i.test(name);

  return {
    ok: looksLikeDuckStation,
    path: executablePath,
    directory: path.dirname(executablePath),
    error: looksLikeDuckStation ? null : 'This executable does not look like DuckStation.'
  };
}

async function getPs1WorkspaceStatus(documentsPath) {
  const gamesPath = path.join(documentsPath, 'Jeux PS1');
  const duckStationDocuments = path.join(documentsPath, 'DuckStation');
  const biosPath = path.join(duckStationDocuments, 'bios');

  let biosReady = false;
  let biosFile = null;

  if (await exists(biosPath)) {
    try {
      const entries = await fs.readdir(biosPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const candidate = await inspectPs1BiosFile(path.join(biosPath, entry.name));
        if (candidate.ok && candidate.validForDuckStation) {
          biosReady = true;
          biosFile = candidate;
          break;
        }
      }
    } catch {
      // Folder inspection is best effort.
    }
  }

  return {
    ok: true,
    documentsPath,
    gamesPath,
    gamesExists: await exists(gamesPath),
    duckStationDocuments,
    duckStationDocumentsExists: await exists(duckStationDocuments),
    biosPath,
    biosExists: await exists(biosPath),
    biosReady,
    biosFile
  };
}

async function createPs1GameFolder(documentsPath) {
  const gamesPath = path.join(documentsPath, 'Jeux PS1');

  try {
    await fs.mkdir(gamesPath, { recursive: true });
    return { ok: true, path: gamesPath, created: true };
  } catch (error) {
    return {
      ok: false,
      path: gamesPath,
      error: error?.message || 'Unable to create the PS1 games folder.'
    };
  }
}

async function copyPs1BiosToDuckStation(sourceFile, documentsPath) {
  const scan = await inspectPs1BiosFile(sourceFile);

  if (!scan.ok || !scan.validForDuckStation) {
    return {
      ok: false,
      error: 'No usable 512 KB PS1 BIOS was found in the selected file.'
    };
  }

  const destination = path.join(documentsPath, 'DuckStation', 'bios');
  const target = path.join(destination, scan.name);

  try {
    await fs.mkdir(destination, { recursive: true });

    if (path.resolve(sourceFile).toLowerCase() === path.resolve(target).toLowerCase()) {
      return { ok: true, destination, copied: [], skipped: [scan.name], conflict: false };
    }

    if (await exists(target)) {
      const targetHash = await sha256File(target);

      if (targetHash === scan.sha256) {
        return { ok: true, destination, copied: [], skipped: [scan.name], conflict: false };
      }

      return {
        ok: false,
        conflict: true,
        destination,
        error: 'A different BIOS file with the same name already exists. EasySetup did not overwrite it.'
      };
    }

    await fs.copyFile(sourceFile, target);

    return {
      ok: true,
      destination,
      copied: [scan.name],
      skipped: [],
      conflict: false
    };
  } catch (error) {
    return {
      ok: false,
      destination,
      error: error?.message || 'Unable to copy the PS1 BIOS file.'
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
  prepareUsbWithBiosDrain,
  getPcsx2ConfigStatus,
  configurePcsx2GameLibrary,
  inspectPs1BiosFile,
  detectDuckStation,
  validateDuckStationExecutable,
  getPs1WorkspaceStatus,
  createPs1GameFolder,
  copyPs1BiosToDuckStation
};
