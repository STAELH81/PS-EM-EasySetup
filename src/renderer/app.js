const state = {
  route: 'welcome',
  history: [],
  biosPath: '',
  biosScan: null,
  usbScan: {
    status: 'idle',
    result: null
  },
  selectedUsbRoot: '',
  ps2Model: '',
  dvdVersion: ''
};

const steps = [
  ['start', 'Start'],
  ['bios', 'BIOS'],
  ['pcsx2', 'PCSX2'],
  ['controller', 'Controller'],
  ['finish', 'Finish']
];

const screen = document.getElementById('screen');
const stepList = document.getElementById('stepList');
const backButton = document.getElementById('backButton');
const nextButton = document.getElementById('nextButton');

const officialLinks = {
  pcsx2: 'https://pcsx2.net/',
  biosdrain: 'https://github.com/F0bes/biosdrain/releases/latest',
  freedvdboot: 'https://github.com/CTurt/FreeDVDBoot'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function currentStage() {
  if (state.route === 'welcome') return 'start';
  if ([
    'bios-choice',
    'bios-existing',
    'dump-requirements',
    'usb-detect',
    'fmcb-check',
    'fmcb-help',
    'fmcb-guide',
    'freedvd-guide',
    'bios-backup'
  ].includes(state.route)) return 'bios';
  if (state.route === 'pcsx2') return 'pcsx2';
  if (state.route === 'controller') return 'controller';
  return 'finish';
}

function renderSteps() {
  const active = currentStage();
  const activeIndex = steps.findIndex(([id]) => id === active);

  stepList.innerHTML = steps.map(([id, label], index) => {
    const cls = index < activeIndex ? 'step done' : index === activeIndex ? 'step active' : 'step';
    const badge = index < activeIndex ? '✓' : index + 1;
    return `<div class="${cls}"><span class="step-index">${badge}</span><span>${label}</span></div>`;
  }).join('');
}

function go(route) {
  if (state.route !== route) state.history.push(state.route);
  state.route = route;
  render();

  if (route === 'usb-detect' && state.usbScan.status === 'idle') {
    refreshUsb();
  }
}

function back() {
  const previous = state.history.pop();
  if (!previous) return;
  state.route = previous;
  render();
}

function choice(title, description, action, extraClass = '') {
  return `
    <button class="choice ${extraClass}" data-action="${action}">
      <strong>${title}</strong>
      <span>${description}</span>
      <span class="choice-arrow">→</span>
    </button>
  `;
}

function statusPill(label, tone = 'neutral') {
  return `<span class="pill ${tone}">${label}</span>`;
}

function renderBiosScan() {
  if (!state.biosPath) {
    return `
      <div class="empty-state">
        <div class="empty-icon">ROM</div>
        <strong>No BIOS folder selected yet.</strong>
        <span>Select a folder and EasySetup will inspect it automatically.</span>
      </div>
    `;
  }

  if (state.biosScan?.loading) {
    return `
      <div class="scanner-card">
        <div class="spinner"></div>
        <div><strong>Inspecting BIOS files…</strong><span>${escapeHtml(state.biosPath)}</span></div>
      </div>
    `;
  }

  const scan = state.biosScan;
  if (!scan?.ok) {
    return `
      <div class="status-card danger">
        <div class="status-icon">!</div>
        <div>
          <strong>Couldn't inspect this folder</strong>
          <p>${escapeHtml(scan?.error || 'Unknown error')}</p>
        </div>
      </div>
    `;
  }

  const candidate = scan.best;
  if (!candidate) {
    return `
      <div class="status-card danger">
        <div class="status-icon">×</div>
        <div>
          <strong>No PS2 BIOS dump detected</strong>
          <p>EasySetup couldn't find a <code>.rom0</code>, <code>.rom1</code>, <code>.rom2</code>, <code>.nvm</code> or <code>.mec</code> set in this folder.</p>
        </div>
      </div>
    `;
  }

  const tone = candidate.completeBiosDrainSet ? 'success' : candidate.validForPcsx2 ? 'warning' : 'danger';
  const title = candidate.completeBiosDrainSet
    ? 'Complete BIOSDrain dump detected'
    : candidate.validForPcsx2
      ? 'PS2 ROM0 detected'
      : 'BIOS files detected, but ROM0 looks invalid';

  const fileRows = ['rom0', 'rom1', 'rom2', 'nvm', 'mec'].map((part) => {
    const file = candidate.files[part];
    return `
      <div class="bios-file ${file ? 'present' : 'missing'}">
        <span class="file-state">${file ? '✓' : '—'}</span>
        <span class="file-name">.${part}</span>
        <span class="file-size">${file ? escapeHtml(file.sizeLabel) : 'missing'}</span>
      </div>
    `;
  }).join('');

  const warnings = candidate.warnings?.length
    ? `<div class="mini-warnings">${candidate.warnings.map((warning) => `<span>⚠ ${escapeHtml(warning)}</span>`).join('')}</div>`
    : '';

  return `
    <div class="status-card ${tone}">
      <div class="status-icon">${candidate.validForPcsx2 ? '✓' : '!'}</div>
      <div class="status-body">
        <div class="status-title-row">
          <strong>${title}</strong>
          ${candidate.completeBiosDrainSet ? statusPill('FULL SET', 'success') : statusPill('ROM0', candidate.validForPcsx2 ? 'warning' : 'danger')}
        </div>
        <p>Detected as <strong>${escapeHtml(candidate.consoleModel)}</strong></p>
        <div class="bios-files">${fileRows}</div>
        ${warnings}
      </div>
    </div>
  `;
}

function renderUsbDrives() {
  if (state.usbScan.status === 'scanning') {
    return `
      <div class="scanner-card">
        <div class="spinner"></div>
        <div><strong>Scanning removable drives…</strong><span>Windows is checking connected USB storage.</span></div>
      </div>
    `;
  }

  if (state.usbScan.status === 'error') {
    return `
      <div class="status-card danger">
        <div class="status-icon">!</div>
        <div>
          <strong>Automatic USB detection failed</strong>
          <p>${escapeHtml(state.usbScan.result?.error || 'Unknown error')}</p>
        </div>
      </div>
    `;
  }

  const result = state.usbScan.result;
  const drives = result?.drives || [];

  if (state.usbScan.status === 'ready' && drives.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">USB</div>
        <strong>No removable USB drive detected.</strong>
        <span>Plug one in, wait a second, then press Refresh. You can also continue and prepare it manually later.</span>
      </div>
    `;
  }

  return drives.map((drive) => {
    const selected = state.selectedUsbRoot === drive.root;
    const biosBadge = drive.bios?.validForPcsx2 ? statusPill('BIOS FOUND', 'success') : '';
    const drainBadge = drive.hasBiosDrain ? statusPill('BIOSDRAIN.ELF', 'success') : '';
    const fatBadge = statusPill(drive.fileSystem || 'UNKNOWN FS', drive.fat32Ready ? 'success' : 'warning');
    const partitionBadge = statusPill(drive.partitionStyle || 'UNKNOWN', drive.mbrReady ? 'success' : 'neutral');

    return `
      <button class="drive-card ${selected ? 'selected' : ''}" data-action="select-usb" data-root="${escapeHtml(drive.root)}">
        <div class="drive-letter">${escapeHtml(drive.letter)}</div>
        <div class="drive-info">
          <div class="drive-title">
            <strong>${escapeHtml(drive.label || drive.friendlyName || 'USB drive')}</strong>
            <span>${escapeHtml(drive.sizeLabel)} · ${escapeHtml(drive.freeSpaceLabel)} free</span>
          </div>
          <div class="drive-badges">${fatBadge}${partitionBadge}${drainBadge}${biosBadge}</div>
        </div>
        <div class="drive-select">${selected ? '✓ Selected' : 'Select'}</div>
      </button>
    `;
  }).join('');
}

function selectedUsbNotice() {
  if (!state.selectedUsbRoot) return '';

  const drive = state.usbScan.result?.drives?.find((item) => item.root === state.selectedUsbRoot);
  if (!drive) return '';

  if (drive.fat32Ready && (drive.mbrReady || drive.partitionStyle === 'Unknown')) {
    return `
      <div class="info-box success-box">
        <strong>${escapeHtml(drive.letter)} looks PS2-friendly.</strong><br>
        FAT32 is detected${drive.mbrReady ? ' and the disk uses MBR' : ''}. EasySetup will never format it automatically.
      </div>
    `;
  }

  return `
    <div class="info-box warning">
      <strong>${escapeHtml(drive.letter)} may need preparation.</strong><br>
      PS2 homebrew is happiest with a FAT32 USB drive and commonly MBR partitioning. EasySetup only detects this — it will not erase or format the drive for you.
    </div>
  `;
}

const views = {
  welcome: () => ({
    html: `
      <div class="hero">
        <div>
          <div class="kicker">PS2-EM EasySetup · v0.2</div>
          <h2>From real PS2 to PCSX2.<br><span class="gradient-text">Without the nuclear reactor manual.</span></h2>
          <p class="lead">EasySetup checks your BIOS files, finds removable USB drives, guides the correct dumping path, and walks you through a clean PCSX2 setup.</p>
        </div>
        <div class="hero-orbit" aria-hidden="true">
          <span class="shape triangle">△</span>
          <span class="shape circle">○</span>
          <span class="shape cross">×</span>
          <span class="shape square">□</span>
          <div class="hero-core">PS2<br><small>READY</small></div>
        </div>
      </div>
      <div class="feature-grid">
        <div class="feature"><strong>BIOS validator</strong><span>Recognises BIOSDrain sets and flags missing files.</span></div>
        <div class="feature"><strong>USB scanner</strong><span>Detects removable drives, FAT32 and MBR status.</span></div>
        <div class="feature"><strong>Safe by design</strong><span>No BIOS redistribution and no automatic disk formatting.</span></div>
      </div>
    `,
    next: { label: 'Start EasySetup', onClick: () => go('bios-choice') }
  }),

  'bios-choice': () => ({
    html: `
      <div class="kicker">BIOS · Choose a path</div>
      <h2>Where are you starting from?</h2>
      <p class="lead">EasySetup adapts the rest of the wizard based on what you already have.</p>
      <div class="cards">
        ${choice('I already have my own PS2 BIOS dump', 'Pick the folder. EasySetup will validate it before you can continue.', 'bios-existing')}
        ${choice('I need to dump my PS2', 'Check your USB drive, then choose FreeMcBoot or FreeDVDBoot.', 'dump-requirements')}
      </div>
    `,
    next: null
  }),

  'bios-existing': () => {
    const ready = Boolean(state.biosScan?.best?.validForPcsx2);
    return {
      html: `
        <div class="kicker">BIOS · Smart validation</div>
        <h2>Show me your BIOS folder.</h2>
        <p class="lead">EasySetup now inspects the folder instead of blindly trusting that the right files are there.</p>
        <div class="path-box">
          <input value="${escapeHtml(state.biosPath)}" placeholder="No folder selected" readonly />
          <button class="button ghost" data-action="select-bios">Browse…</button>
        </div>
        <div class="scan-zone">${renderBiosScan()}</div>
      `,
      next: {
        label: ready ? 'BIOS looks good →' : 'Select a valid BIOS first',
        onClick: () => go('pcsx2'),
        disabled: !ready
      }
    };
  },

  'dump-requirements': () => ({
    html: `
      <div class="kicker">BIOS · Hardware</div>
      <h2>Build the tiny PS2 survival kit.</h2>
      <p class="lead">You do not need expensive modding hardware. These are the basics.</p>
      <div class="requirement-grid">
        <div class="requirement"><span>01</span><strong>PlayStation 2</strong><small>Fat or Slim, depending on the method.</small></div>
        <div class="requirement"><span>02</span><strong>Controller</strong><small>Enough to navigate the PS2 menus.</small></div>
        <div class="requirement"><span>03</span><strong>Video output</strong><small>TV/monitor + whatever adapters your setup needs.</small></div>
        <div class="requirement"><span>04</span><strong>USB drive</strong><small>Small is fine. BIOS files are tiny.</small></div>
        <div class="requirement"><span>05</span><strong>Windows PC</strong><small>For USB prep, dumping files and PCSX2.</small></div>
      </div>
      <div class="info-box">Next, EasySetup can actually look for your USB drive instead of just telling you to find one.</div>
    `,
    next: { label: 'Check my USB drive', onClick: () => go('usb-detect') }
  }),

  'usb-detect': () => ({
    html: `
      <div class="kicker">BIOS · USB scanner</div>
      <div class="title-row">
        <div>
          <h2>Connected removable drives</h2>
          <p class="lead">Pick the USB drive you plan to use with the PS2. Nothing is written or formatted here.</p>
        </div>
        <button class="button ghost compact" data-action="scan-usb">↻ Refresh</button>
      </div>
      <div class="drive-list">${renderUsbDrives()}</div>
      ${selectedUsbNotice()}
      <p class="small">Detection is read-only. If a drive needs FAT32/MBR preparation, the wizard will guide you later instead of formatting anything automatically.</p>
    `,
    next: { label: 'Continue to memory-card check', onClick: () => go('fmcb-check') }
  }),

  'fmcb-check': () => ({
    html: `
      <div class="kicker">BIOS · Choose dumping method</div>
      <h2>Does your memory card already have FreeMcBoot?</h2>
      <p class="lead">This decides whether we can launch BIOSDrain directly or need the FreeDVDBoot route.</p>
      <div class="cards">
        ${choice('Yes — FreeMcBoot is already there', 'I see Free McBoot, uLaunchELF/wLaunchELF, OPL, or similar homebrew entries.', 'fmcb-guide')}
        ${choice('No / I do not have a FreeMcBoot card', 'Use the DVD route if your console and DVD Player version are compatible.', 'freedvd-guide')}
        ${choice('I have no idea what FreeMcBoot is', 'Show me exactly how to check without deleting anything.', 'fmcb-help', 'subtle-choice')}
      </div>
    `,
    next: null
  }),

  'fmcb-help': () => ({
    html: `
      <div class="kicker">BIOS · FreeMcBoot check</div>
      <h2>This takes about thirty seconds.</h2>
      <div class="timeline">
        <div><span>1</span><p><strong>Remove any game disc.</strong><br>We want the PS2 to boot to its own menu.</p></div>
        <div><span>2</span><p><strong>Put the memory card in Slot 1.</strong><br>Do not format or delete anything.</p></div>
        <div><span>3</span><p><strong>Turn on the PS2.</strong><br>Look at the main menu.</p></div>
        <div><span>4</span><p><strong>Look for extra entries.</strong><br>Free McBoot, uLaunchELF/wLaunchELF, OPL and similar entries mean the card is prepared.</p></div>
      </div>
      <div class="cards two-column">
        ${choice('I found FreeMcBoot / uLaunchELF', 'Perfect. Use the memory-card route.', 'fmcb-guide')}
        ${choice('I only see the normal Sony menu', 'No problem. Move to FreeDVDBoot.', 'freedvd-guide')}
      </div>
    `,
    next: null
  }),

  'fmcb-guide': () => ({
    html: `
      <div class="kicker">BIOS · FreeMcBoot</div>
      <h2>The short route.</h2>
      <div class="timeline">
        <div><span>1</span><p><strong>Prepare USB as FAT32.</strong><br>BIOSDrain needs a PS2-friendly USB filesystem.</p></div>
        <div><span>2</span><p><strong>Put biosdrain.elf at the USB root.</strong><br>Not inside a ZIP or folder.</p></div>
        <div><span>3</span><p><strong>Open uLaunchELF.</strong><br>Go to <code>FileBrowser → mass:/ → biosdrain.elf</code>.</p></div>
        <div><span>4</span><p><strong>Wait for “Finished Everything”.</strong><br>Do not remove the USB drive or power off the PS2 first.</p></div>
      </div>
      <div class="inline-actions">
        <button class="button ghost" data-action="open-biosdrain">Open official BIOSDrain releases ↗</button>
      </div>
    `,
    next: { label: 'I finished the dump', onClick: () => go('bios-backup') }
  }),

  'freedvd-guide': () => ({
    html: `
      <div class="kicker">BIOS · FreeDVDBoot</div>
      <h2>The DVD route.</h2>
      <p class="lead">First identify the exact console and DVD Player version. FreeDVDBoot compatibility depends on those details.</p>

      <div class="field-grid">
        <label>
          <span>PS2 model</span>
          <input id="ps2Model" value="${escapeHtml(state.ps2Model)}" placeholder="Example: SCPH-70004" />
        </label>
        <label>
          <span>DVD Player version</span>
          <input id="dvdVersion" value="${escapeHtml(state.dvdVersion)}" placeholder="Example: 3.10E" />
        </label>
      </div>

      <div class="info-box">
        <strong>How to find it:</strong><br>
        The model is on the console label. For DVD Player version, open the PS2 main menu and use <strong>△ Version</strong>.
      </div>

      <div class="timeline compact-timeline">
        <div><span>1</span><p>Check your model/version against the official FreeDVDBoot project.</p></div>
        <div><span>2</span><p>Put <strong>biosdrain.elf</strong> on a FAT32 USB drive.</p></div>
        <div><span>3</span><p>Burn the matching FreeDVDBoot ISO <strong>as a disc image</strong>, not as a normal file.</p></div>
        <div><span>4</span><p>Boot the PS2 with the USB + DVD and launch <code>mass:/biosdrain.elf</code>.</p></div>
        <div><span>5</span><p>Wait for <strong>Finished Everything</strong>.</p></div>
      </div>

      <div class="info-box warning">EasySetup does not guess FreeDVDBoot compatibility. Always use the official project's compatibility information for the exact console/DVD version.</div>

      <div class="inline-actions">
        <button class="button ghost" data-action="open-freedvdboot">Open official FreeDVDBoot ↗</button>
        <button class="button ghost" data-action="open-biosdrain">Open BIOSDrain releases ↗</button>
      </div>
    `,
    next: { label: 'I finished the dump', onClick: () => go('bios-backup') }
  }),

  'bios-backup': () => {
    const ready = Boolean(state.biosScan?.best?.validForPcsx2);
    const usbButton = state.selectedUsbRoot
      ? `<button class="button ghost" data-action="use-usb-bios">Scan ${escapeHtml(state.selectedUsbRoot)} directly</button>`
      : '';

    return {
      html: `
        <div class="kicker">BIOS · Verify & back up</div>
        <h2>Now prove that the dump actually exists.</h2>
        <p class="lead">Select the folder where you copied the BIOSDrain files. EasySetup will verify the set before moving on.</p>
        <div class="path-box">
          <input value="${escapeHtml(state.biosPath)}" placeholder="Choose the BIOS folder" readonly />
          <button class="button ghost" data-action="select-bios">Browse…</button>
        </div>
        <div class="inline-actions">${usbButton}</div>
        <div class="scan-zone">${renderBiosScan()}</div>
        <div class="info-box">Keep this folder somewhere permanent and make a second backup if you can. Once the files are safe, your temporary USB drive is no longer required by EasySetup.</div>
      `,
      next: {
        label: ready ? 'BIOS verified — continue' : 'Verify a BIOS first',
        onClick: () => go('pcsx2'),
        disabled: !ready
      }
    };
  },

  pcsx2: () => ({
    html: `
      <div class="kicker">PCSX2</div>
      <h2>Turn the dump into a working emulator.</h2>
      <div class="timeline">
        <div><span>1</span><p><strong>Install PCSX2.</strong><br>Use the current official Windows release.</p></div>
        <div><span>2</span><p><strong>BIOS screen.</strong><br>Point PCSX2 to <code>${escapeHtml(state.biosPath || 'your BIOS folder')}</code>. Your ROM0 should appear in the list.</p></div>
        <div><span>3</span><p><strong>Create a games folder.</strong><br>Something simple like <code>Documents\\Jeux PS2</code> works well.</p></div>
        <div><span>4</span><p><strong>Add it to the game library.</strong><br>PCSX2 will scan supported game dumps there.</p></div>
      </div>
      <div class="inline-actions">
        <button class="button primary soft-primary" data-action="open-pcsx2">Open official PCSX2 site ↗</button>
      </div>
    `,
    next: { label: 'Controller setup', onClick: () => go('controller') }
  }),

  controller: () => ({
    html: `
      <div class="kicker">Controller</div>
      <h2>Make it feel like a console again.</h2>
      <div class="feature-grid controller-grid">
        <div class="feature"><strong>Player 1</strong><span>Port 1 → DualShock 2 → Automatic Mapping with your PC controller connected.</span></div>
        <div class="feature"><strong>Player 2</strong><span>Enable DualShock 2 on Port 2 and map the second physical controller separately.</span></div>
        <div class="feature"><strong>Achievements</strong><span>RetroAchievements is optional. Hardcore mode is also optional and disables some emulator conveniences.</span></div>
      </div>
    `,
    next: { label: 'Finish setup', onClick: () => go('finish') }
  }),

  finish: () => ({
    html: `
      <div class="completion">
        <div class="completion-ring">✓</div>
        <div class="kicker">Setup complete</div>
        <h2>Your PS2 emulation setup has a pulse.</h2>
        <p class="lead">EasySetup validated the BIOS path and walked you through the rest. Put your own game dumps in the PCSX2 game folder, refresh the library, and play.</p>
      </div>

      <div class="summary-grid">
        <div><span>BIOS</span><strong>${escapeHtml(state.biosScan?.best?.consoleModel || 'Verified')}</strong></div>
        <div><span>Dump</span><strong>${state.biosScan?.best?.completeBiosDrainSet ? 'Full BIOSDrain set' : 'ROM0 detected'}</strong></div>
        <div><span>USB</span><strong>${escapeHtml(state.selectedUsbRoot || 'Manual / not needed')}</strong></div>
        <div><span>PCSX2</span><strong>Ready for configuration</strong></div>
      </div>

      <div class="info-box success-box"><strong>v0.2 unlocked:</strong> real BIOS inspection + real removable-drive detection. No fake green checkmarks.</div>
    `,
    next: null
  })
};

async function scanBiosFolder(folder) {
  state.biosPath = folder;
  state.biosScan = { loading: true };
  render();

  const result = await window.easySetup.inspectBiosFolder(folder);
  state.biosScan = result;
  render();
}

async function refreshUsb() {
  state.usbScan = { status: 'scanning', result: null };
  render();

  try {
    const result = await window.easySetup.detectUsbDrives();
    state.usbScan = {
      status: result.ok ? 'ready' : 'error',
      result
    };
  } catch (error) {
    state.usbScan = {
      status: 'error',
      result: { error: error?.message || 'USB detection failed.' }
    };
  }

  render();
}

async function handleAction(action, dataset = {}) {
  if (views[action]) return go(action);

  if (action === 'select-bios') {
    const folder = await window.easySetup.selectFolder('Select your PS2 BIOS folder');
    if (folder) await scanBiosFolder(folder);
    return;
  }

  if (action === 'scan-usb') {
    await refreshUsb();
    return;
  }

  if (action === 'select-usb') {
    state.selectedUsbRoot = dataset.root || '';
    render();
    return;
  }

  if (action === 'use-usb-bios') {
    if (state.selectedUsbRoot) await scanBiosFolder(state.selectedUsbRoot);
    return;
  }

  if (action === 'open-pcsx2') await window.easySetup.openExternal(officialLinks.pcsx2);
  if (action === 'open-biosdrain') await window.easySetup.openExternal(officialLinks.biosdrain);
  if (action === 'open-freedvdboot') await window.easySetup.openExternal(officialLinks.freedvdboot);
}

function bindDynamicInputs() {
  const ps2Model = document.getElementById('ps2Model');
  const dvdVersion = document.getElementById('dvdVersion');

  if (ps2Model) {
    ps2Model.addEventListener('input', (event) => {
      state.ps2Model = event.target.value;
    });
  }

  if (dvdVersion) {
    dvdVersion.addEventListener('input', (event) => {
      state.dvdVersion = event.target.value;
    });
  }
}

function render() {
  renderSteps();

  const view = views[state.route]();
  screen.innerHTML = view.html;

  backButton.disabled = state.history.length === 0;
  backButton.onclick = back;

  if (view.next) {
    nextButton.style.display = '';
    nextButton.textContent = view.next.label;
    nextButton.disabled = Boolean(view.next.disabled);
    nextButton.onclick = view.next.onClick;
  } else {
    nextButton.style.display = 'none';
    nextButton.disabled = false;
    nextButton.onclick = null;
  }

  document.querySelectorAll('[data-action]').forEach((element) => {
    element.addEventListener('click', () => handleAction(element.dataset.action, element.dataset));
  });

  bindDynamicInputs();
}

render();
