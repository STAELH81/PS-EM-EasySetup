const state = {
  route: 'welcome',
  history: [],
  biosPath: ''
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

function currentStage() {
  if (state.route === 'welcome') return 'start';
  if (['bios-choice', 'bios-existing', 'dump-requirements', 'fmcb-check', 'fmcb-guide', 'freedvd-guide', 'bios-backup'].includes(state.route)) return 'bios';
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
}

function back() {
  const previous = state.history.pop();
  if (!previous) return;
  state.route = previous;
  render();
}

function choice(title, description, action) {
  return `<button class="choice" data-action="${action}"><strong>${title}</strong><span>${description}</span></button>`;
}

const views = {
  welcome: () => ({
    html: `
      <div class="kicker">PS2-EM EasySetup</div>
      <h2>Set up PS2 emulation without getting lost.</h2>
      <p class="lead">This assistant guides you through obtaining a BIOS from your own PlayStation 2, backing it up, and configuring PCSX2 cleanly on Windows.</p>
      <div class="info-box">This project does not include or distribute Sony BIOS files or game images.</div>
    `,
    next: ['Get started', () => go('bios-choice')]
  }),

  'bios-choice': () => ({
    html: `
      <div class="kicker">BIOS</div>
      <h2>Do you already have a PS2 BIOS dump?</h2>
      <p class="lead">Choose the path that matches your situation.</p>
      <div class="cards">
        ${choice('Yes, I already have my BIOS', 'Select the folder containing your own dump and continue to PCSX2 setup.', 'bios-existing')}
        ${choice('No, I want to dump my PS2', 'We will check what hardware you have and choose the simplest dumping method.', 'dump-requirements')}
      </div>
    `,
    next: null
  }),

  'bios-existing': () => ({
    html: `
      <div class="kicker">BIOS</div>
      <h2>Select your BIOS folder.</h2>
      <p class="lead">A typical BIOSDrain dump contains ROM0 plus companion files such as ROM1, ROM2, NVM and MEC.</p>
      <div class="path-box">
        <input value="${state.biosPath}" placeholder="No folder selected" readonly />
        <button class="button ghost" data-action="select-bios">Browse…</button>
      </div>
      <div class="info-box">Keep a second backup somewhere safe before changing or cleaning up your USB drive.</div>
    `,
    next: ['Continue', () => go('pcsx2')]
  }),

  'dump-requirements': () => ({
    html: `
      <div class="kicker">BIOS · Dump</div>
      <h2>Before we start, make sure you have the basics.</h2>
      <div class="checklist">
        <div class="check-item">✓ A PlayStation 2</div>
        <div class="check-item">✓ A PS2 controller</div>
        <div class="check-item">✓ A way to display the PS2 on a screen</div>
        <div class="check-item">✓ A USB drive</div>
        <div class="check-item">✓ A Windows PC</div>
      </div>
      <p class="lead">Next, we will check whether your memory card already contains FreeMcBoot.</p>
    `,
    next: ['I have these', () => go('fmcb-check')]
  }),

  'fmcb-check': () => ({
    html: `
      <div class="kicker">BIOS · Method</div>
      <h2>Does your memory card have FreeMcBoot?</h2>
      <div class="cards">
        ${choice('Yes', 'FreeMcBoot, uLaunchELF/wLaunchELF or Open PS2 Loader appears in the PS2 menu.', 'fmcb-guide')}
        ${choice('No', 'The PS2 only shows the normal Browser / System Configuration menu.', 'freedvd-guide')}
      </div>
      <div class="info-box"><strong>How to check:</strong><br>Start the PS2 without a game, insert the memory card in Slot 1, and look at the main menu. If you only see the normal Sony menu, choose No.</div>
    `,
    next: null
  }),

  'fmcb-guide': () => ({
    html: `
      <div class="kicker">BIOS · FreeMcBoot</div>
      <h2>Use uLaunchELF to start BIOSDrain.</h2>
      <div class="checklist">
        <div class="check-item">1. Format a USB drive as MBR + FAT32.</div>
        <div class="check-item">2. Put <strong>biosdrain.elf</strong> at the root of the USB drive.</div>
        <div class="check-item">3. Start uLaunchELF / wLaunchELF.</div>
        <div class="check-item">4. Open <strong>mass:/</strong> and launch <strong>biosdrain.elf</strong>.</div>
        <div class="check-item">5. Wait for <strong>Finished Everything</strong>.</div>
      </div>
      <div class="inline-actions">
        <button class="button ghost" data-action="open-biosdrain">Open BIOSDrain releases</button>
      </div>
    `,
    next: ['I finished the dump', () => go('bios-backup')]
  }),

  'freedvd-guide': () => ({
    html: `
      <div class="kicker">BIOS · FreeDVDBoot</div>
      <h2>No FreeMcBoot? Use the DVD method.</h2>
      <p class="lead">Check compatibility before burning anything: from the PS2 main menu press Triangle on the Version screen and note the console model and DVD Player version.</p>
      <div class="checklist">
        <div class="check-item">1. Download FreeDVDBoot from its official project page.</div>
        <div class="check-item">2. Prepare a MBR + FAT32 USB drive with <strong>biosdrain.elf</strong>.</div>
        <div class="check-item">3. Burn the correct FreeDVDBoot ISO as a disc image.</div>
        <div class="check-item">4. Boot the PS2 with the DVD and USB connected.</div>
        <div class="check-item">5. In uLaunchELF: <strong>FileBrowser → mass:/ → biosdrain.elf</strong>.</div>
        <div class="check-item">6. Wait for <strong>Finished Everything</strong>.</div>
      </div>
      <div class="info-box warning">Do not remove the USB drive or power off the PS2 while BIOSDrain is writing files.</div>
      <div class="inline-actions">
        <button class="button ghost" data-action="open-freedvdboot">Open FreeDVDBoot</button>
        <button class="button ghost" data-action="open-biosdrain">Open BIOSDrain releases</button>
      </div>
    `,
    next: ['I finished the dump', () => go('bios-backup')]
  }),

  'bios-backup': () => ({
    html: `
      <div class="kicker">BIOS · Backup</div>
      <h2>Back up your dump before doing anything else.</h2>
      <p class="lead">Copy every file created by BIOSDrain to a permanent folder on your PC. Keep a second copy if possible.</p>
      <div class="path-box">
        <input value="${state.biosPath}" placeholder="Choose where you saved your BIOS" readonly />
        <button class="button ghost" data-action="select-bios">Browse…</button>
      </div>
      <div class="info-box">Once the files are safely copied, your USB drive can be reformatted and reused.</div>
    `,
    next: ['Continue to PCSX2', () => go('pcsx2')]
  }),

  pcsx2: () => ({
    html: `
      <div class="kicker">PCSX2</div>
      <h2>Install and configure PCSX2.</h2>
      <div class="checklist">
        <div class="check-item">1. Install the current PCSX2 release.</div>
        <div class="check-item">2. During first setup, point PCSX2 to your BIOS folder.</div>
        <div class="check-item">3. Create a dedicated games folder, for example <strong>Documents\\Jeux PS2</strong>.</div>
        <div class="check-item">4. Add that folder to PCSX2's game library.</div>
      </div>
      <div class="inline-actions">
        <button class="button ghost" data-action="open-pcsx2">Open official PCSX2 site</button>
      </div>
    `,
    next: ['Controller setup', () => go('controller')]
  }),

  controller: () => ({
    html: `
      <div class="kicker">Controller</div>
      <h2>Set up your controller.</h2>
      <p class="lead">Use a virtual DualShock 2 on Port 1 and map your PC controller automatically. For local two-player games, enable DualShock 2 on Port 2 and map a second controller separately.</p>
      <div class="info-box">RetroAchievements are optional. Enable them if you like achievements; Hardcore mode is also optional.</div>
    `,
    next: ['Finish setup', () => go('finish')]
  }),

  finish: () => ({
    html: `
      <div class="kicker">Done</div>
      <h2>PS2-EM EasySetup is complete.</h2>
      <p class="lead">Your next step is simply to place your own PS2 game dumps in the game folder and refresh the PCSX2 library.</p>
      <div class="checklist">
        <div class="check-item">✓ BIOS backed up</div>
        <div class="check-item">✓ PCSX2 configured</div>
        <div class="check-item">✓ Game folder ready</div>
        <div class="check-item">✓ Controller guidance complete</div>
      </div>
      <p class="small">This is the first interactive prototype. Hardware detection, BIOS validation and deeper automation come next.</p>
    `,
    next: null
  })
};

async function handleAction(action) {
  if (views[action]) return go(action);

  if (action === 'select-bios') {
    const folder = await window.easySetup.selectFolder('Select your PS2 BIOS folder');
    if (folder) {
      state.biosPath = folder;
      render();
    }
  }

  if (action === 'open-pcsx2') await window.easySetup.openExternal(officialLinks.pcsx2);
  if (action === 'open-biosdrain') await window.easySetup.openExternal(officialLinks.biosdrain);
  if (action === 'open-freedvdboot') await window.easySetup.openExternal(officialLinks.freedvdboot);
}

function render() {
  renderSteps();

  const view = views[state.route]();
  screen.innerHTML = view.html;

  backButton.disabled = state.history.length === 0;
  backButton.onclick = back;

  if (view.next) {
    nextButton.style.display = '';
    nextButton.textContent = view.next[0];
    nextButton.onclick = view.next[1];
  } else {
    nextButton.style.display = 'none';
    nextButton.onclick = null;
  }

  document.querySelectorAll('[data-action]').forEach((element) => {
    element.addEventListener('click', () => handleAction(element.dataset.action));
  });
}

render();
