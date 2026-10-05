const fs = require('fs/promises');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const scanlines = Buffer.alloc((width * 4 + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    scanlines[rowStart] = 0;
    rgba.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(scanlines, { level: 9 });

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function createCanvas() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);

  function setPixel(x, y, r, g, b, a = 255) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;

    const index = (y * SIZE + x) * 4;
    pixels[index] = r;
    pixels[index + 1] = g;
    pixels[index + 2] = b;
    pixels[index + 3] = a;
  }

  function fillRect(x, y, width, height, color) {
    for (let py = y; py < y + height; py++) {
      for (let px = x; px < x + width; px++) setPixel(px, py, ...color);
    }
  }

  function line(x0, y0, x1, y1, color, thickness = 3) {
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;

    while (true) {
      const half = Math.floor(thickness / 2);
      fillRect(x0 - half, y0 - half, thickness, thickness, color);
      if (x0 === x1 && y0 === y1) break;
      const twice = 2 * error;
      if (twice >= dy) {
        error += dy;
        x0 += sx;
      }
      if (twice <= dx) {
        error += dx;
        y0 += sy;
      }
    }
  }

  function circle(cx, cy, radius, color, thickness = 3) {
    const outer = radius;
    const inner = Math.max(0, radius - thickness);

    for (let y = cy - outer; y <= cy + outer; y++) {
      for (let x = cx - outer; x <= cx + outer; x++) {
        const distance = Math.hypot(x - cx, y - cy);
        if (distance <= outer && distance >= inner) setPixel(x, y, ...color);
      }
    }
  }

  return { pixels, setPixel, fillRect, line, circle };
}

function drawIcon() {
  const { pixels, setPixel, fillRect, line, circle } = createCanvas();

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const t = (x + y) / (SIZE * 2);
      const r = Math.round(21 * (1 - t) + 8 * t);
      const g = Math.round(29 * (1 - t) + 11 * t);
      const b = Math.round(43 * (1 - t) + 17 * t);
      setPixel(x, y, r, g, b, 255);
    }
  }

  const accent = [125, 158, 255, 255];
  const accentBright = [165, 187, 255, 255];

  const radius = 44;
  const left = 8;
  const top = 8;
  const right = SIZE - 9;
  const bottom = SIZE - 9;
  const border = 5;

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const cx = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
      const cy = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
      const distance = Math.hypot(x - cx, y - cy);
      const insideOuter = distance <= radius;
      const innerRadius = radius - border;
      const insideInner = distance <= innerRadius &&
        x >= left + border && x <= right - border &&
        y >= top + border && y <= bottom - border;

      if (insideOuter && !insideInner) setPixel(x, y, ...accent);
    }
  }

  // PlayStation button symbols.
  line(43, 47, 57, 31, accentBright, 4);
  line(57, 31, 71, 47, accentBright, 4);
  line(71, 47, 43, 47, accentBright, 4);

  circle(204, 40, 12, accentBright, 4);

  line(39, 204, 59, 224, accentBright, 4);
  line(59, 204, 39, 224, accentBright, 4);

  line(193, 199, 219, 199, accentBright, 4);
  line(219, 199, 219, 225, accentBright, 4);
  line(219, 225, 193, 225, accentBright, 4);
  line(193, 225, 193, 199, accentBright, 4);

  // Geometric PS monogram.
  const glyph = [101, 137, 255, 255];

  // P
  fillRect(61, 86, 14, 89, glyph);
  fillRect(75, 86, 46, 14, glyph);
  fillRect(107, 100, 14, 34, glyph);
  fillRect(75, 127, 40, 14, glyph);

  // S
  fillRect(137, 86, 54, 14, glyph);
  fillRect(137, 100, 14, 31, glyph);
  fillRect(137, 127, 54, 14, glyph);
  fillRect(177, 141, 14, 34, glyph);
  fillRect(137, 161, 54, 14, glyph);

  // Small separator / brand line.
  fillRect(89, 190, 78, 3, accentBright);

  return pixels;
}

function createIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = 0;
  entry[1] = 0;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);

  return Buffer.concat([header, entry, png]);
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const buildDir = path.join(root, 'build');
  await fs.mkdir(buildDir, { recursive: true });

  const rgba = drawIcon();
  const png = encodePng(SIZE, SIZE, rgba);
  const ico = createIco(png);

  await fs.writeFile(path.join(buildDir, 'icon.png'), png);
  await fs.writeFile(path.join(buildDir, 'icon.ico'), ico);

  process.stdout.write('Generated PS-EM icon assets.\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
