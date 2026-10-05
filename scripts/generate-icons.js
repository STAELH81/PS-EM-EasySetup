const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const pngToIcoModule = await import('png-to-ico');
  const pngToIco = pngToIcoModule.default || pngToIcoModule;

  const root = path.resolve(__dirname, '..');
  const buildDir = path.join(root, 'build');
  await fs.mkdir(buildDir, { recursive: true });

  const svg = Buffer.from(`
    <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#151d2b"/>
          <stop offset="1" stop-color="#080b11"/>
        </linearGradient>
        <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#9ab6ff"/>
          <stop offset="1" stop-color="#527cff"/>
        </linearGradient>
      </defs>
      <rect x="20" y="20" width="472" height="472" rx="104" fill="url(#bg)" stroke="#5d86ff" stroke-width="16"/>
      <path d="M105 128 L150 82 L195 128" fill="none" stroke="#9ab6ff" stroke-width="15" stroke-linejoin="round"/>
      <circle cx="397" cy="111" r="29" fill="none" stroke="#9ab6ff" stroke-width="15"/>
      <path d="M118 392 L182 456 M182 392 L118 456" stroke="#9ab6ff" stroke-width="15" stroke-linecap="round"/>
      <rect x="363" y="390" width="68" height="68" rx="8" fill="none" stroke="#9ab6ff" stroke-width="15"/>
      <text x="256" y="306" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="180" font-weight="900" letter-spacing="-18" fill="url(#accent)">PS</text>
      <text x="256" y="350" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="8" fill="#b7c8f8">EASYSETUP</text>
    </svg>
  `);

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];

  for (const size of sizes) {
    const buffer = await sharp(svg)
      .resize(size, size)
      .png()
      .toBuffer();

    pngBuffers.push(buffer);

    if (size === 256) {
      await fs.writeFile(path.join(buildDir, 'icon.png'), buffer);
    }
  }

  const ico = await pngToIco(pngBuffers);
  await fs.writeFile(path.join(buildDir, 'icon.ico'), ico);

  await fs.writeFile(path.join(buildDir, 'icon.svg'), svg);

  process.stdout.write('Generated PS-EM icon assets.\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
