import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = join(process.cwd(), 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

const crc32 = (buffers) => {
  let c = 0xffffffff;
  for (const buffer of buffers) {
    for (let i = 0; i < buffer.length; i += 1) c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32([typeBuffer, data]));
  return Buffer.concat([length, typeBuffer, data, checksum]);
};

const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
const insideRoundRect = (x, y, size, radius) => {
  const left = radius;
  const right = size - radius - 1;
  const top = radius;
  const bottom = size - radius - 1;
  const cx = x < left ? left : x > right ? right : x;
  const cy = y < top ? top : y > bottom ? bottom : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
};

const drawIcon = (size, maskable = false) => {
  const pixels = Buffer.alloc(size * size * 4);
  const safePad = maskable ? Math.floor(size * 0.16) : Math.floor(size * 0.08);
  const cardX = safePad + Math.floor(size * 0.12);
  const cardY = safePad + Math.floor(size * 0.06);
  const cardW = size - cardX * 2;
  const cardH = size - safePad * 2;
  const radius = Math.floor(size * 0.19);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const bg = insideRoundRect(x, y, size, radius);
      let r = 15;
      let g = 23;
      let b = 42;
      if (!bg && !maskable) {
        pixels[i + 3] = 0;
        continue;
      }
      if (maskable && !bg) {
        r = 15;
        g = 23;
        b = 42;
      }
      const inCard = x >= cardX && x <= cardX + cardW && y >= cardY && y <= cardY + cardH;
      if (inCard) {
        r = 15;
        g = 118;
        b = 110;
      }
      const screen = x >= cardX + cardW * 0.12 && x <= cardX + cardW * 0.88 && y >= cardY + cardH * 0.09 && y <= cardY + cardH * 0.42;
      if (screen) {
        r = 236;
        g = 254;
        b = 255;
      }
      const buttonSize = cardW * 0.19;
      for (const [bx, by] of [
        [0.18, 0.55],
        [0.42, 0.55],
        [0.66, 0.55],
        [0.18, 0.76],
        [0.42, 0.76],
        [0.66, 0.76]
      ]) {
        if (x >= cardX + cardW * bx && x <= cardX + cardW * bx + buttonSize && y >= cardY + cardH * by && y <= cardY + cardH * by + buttonSize) {
          r = 204;
          g = 251;
          b = 241;
        }
      }
      const rail = y >= size * 0.79 && y <= size * 0.87 && x >= size * 0.18 && x <= size * 0.82;
      if (rail) {
        r = 132;
        g = 204;
        b = 22;
      }
      if (screen && x >= cardX + cardW * 0.24 && x <= cardX + cardW * 0.76 && y >= cardY + cardH * 0.2 && y <= cardY + cardH * 0.25) {
        r = 15;
        g = 23;
        b = 42;
      }
      if (screen && x >= cardX + cardW * 0.24 && x <= cardX + cardW * 0.58 && y >= cardY + cardH * 0.3 && y <= cardY + cardH * 0.34) {
        r = 15;
        g = 23;
        b = 42;
      }
      const shade = 1 - (x + y) / (size * 7);
      pixels[i] = clamp(r + shade * 16);
      pixels[i + 1] = clamp(g + shade * 16);
      pixels[i + 2] = clamp(b + shade * 16);
      pixels[i + 3] = 255;
    }
  }
  return pixels;
};

const createPng = (size, maskable = false) => {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const pixels = drawIcon(size, maskable);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
};

writeFileSync(join(outDir, 'icon-192.png'), createPng(192));
writeFileSync(join(outDir, 'icon-512.png'), createPng(512));
writeFileSync(join(outDir, 'maskable-512.png'), createPng(512, true));
console.log('Generated Nexus POS PWA icons.');
