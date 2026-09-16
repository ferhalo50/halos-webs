import { createRequire } from 'node:module';
import { deflateSync, inflateSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const qrcode = require('qrcode-generator');
const jsQR = require('jsqr');
const TARGET = 'https://app.haloswebs.com/hermanitos/';
const OUTPUT = fileURLToPath(new URL('../public/hermanitos/assets/hermanea-qr.png', import.meta.url));
const WIDTH = 1200;
const HEIGHT = 1500;
const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
const palette = {
  background: '#0d0e10', panel: '#17181b', gold: '#d8b96e',
  goldLight: '#f3dca3', muted: '#a7a59f', qr: '#111214', white: '#ffffff'
};

function rgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}
function fill(color) {
  const c = rgb(color);
  for (let i = 0; i < pixels.length; i += 4) pixels.set(c, i);
}
function rect(x, y, w, h, color) {
  const c = rgb(color);
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(WIDTH, Math.round(x + w)), y1 = Math.min(HEIGHT, Math.round(y + h));
  for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) pixels.set(c, (py * WIDTH + px) * 4);
}
function frame(x, y, w, h, thickness, color) {
  rect(x, y, w, thickness, color); rect(x, y + h - thickness, w, thickness, color);
  rect(x, y, thickness, h, color); rect(x + w - thickness, y, thickness, h, color);
}
function circle(cx, cy, radius, color) {
  const c = rgb(color), r2 = radius * radius;
  for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
    if (x*x + y*y <= r2) pixels.set(c, ((cy+y)*WIDTH+(cx+x))*4);
  }
}

const glyphs = {
  ' ':['00000','00000','00000','00000','00000','00000','00000'],
  A:['01110','10001','10001','11111','10001','10001','10001'],
  C:['01111','10000','10000','10000','10000','10000','01111'],
  D:['11110','10001','10001','10001','10001','10001','11110'],
  E:['11111','10000','10000','11110','10000','10000','11111'],
  H:['10001','10001','10001','11111','10001','10001','10001'],
  I:['11111','00100','00100','00100','00100','00100','11111'],
  M:['10001','11011','10101','10101','10001','10001','10001'],
  N:['10001','11001','10101','10011','10001','10001','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'],
  P:['11110','10001','10001','11110','10000','10000','10000'],
  R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'],
  T:['11111','00100','00100','00100','00100','00100','00100']
};
function textWidth(text, scale, spacing = 2) { return text.length * 5 * scale + (text.length - 1) * spacing * scale; }
function drawText(text, y, scale, color, spacing = 2) {
  text = text.toUpperCase();
  const width = textWidth(text, scale, spacing), start = Math.round((WIDTH - width) / 2);
  for (let i = 0; i < text.length; i++) {
    const glyph = glyphs[text[i]];
    if (!glyph) throw new Error(`Missing glyph: ${text[i]}`);
    const ox = start + i * (5 + spacing) * scale;
    glyph.forEach((row, gy) => [...row].forEach((on, gx) => { if (on === '1') rect(ox + gx*scale, y + gy*scale, scale, scale, color); }));
  }
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBytes = Buffer.from(type), payload = Buffer.from(data);
  const out = Buffer.alloc(12 + payload.length);
  out.writeUInt32BE(payload.length, 0); typeBytes.copy(out, 4); payload.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBytes, payload])), 8 + payload.length);
  return out;
}
function encodePng() {
  const raw = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    const row = y * (WIDTH * 4 + 1); raw[row] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * WIDTH * 4, WIDTH * 4).copy(raw, row + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0); header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8; header[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function decodeOwnPng(file) {
  let offset = 8, width, height, compressed = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset), type = file.toString('ascii', offset + 4, offset + 8), data = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
    if (type === 'IDAT') compressed.push(data);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(compressed)), rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    if (raw[row] !== 0) throw new Error('Unexpected PNG filter.');
    rgba.set(raw.subarray(row + 1, row + 1 + width * 4), y * width * 4);
  }
  return { width, height, rgba };
}

fill(palette.background);
frame(35, 35, WIDTH - 70, HEIGHT - 70, 3, palette.gold);
frame(51, 51, WIDTH - 102, HEIGHT - 102, 1, '#594a2e');
// Art-deco corners and title rule.
for (const [x, y, sx, sy] of [[70,70,1,1],[WIDTH-70,70,-1,1],[70,HEIGHT-70,1,-1],[WIDTH-70,HEIGHT-70,-1,-1]]) {
  rect(x, y, 150*sx, 3*sy, palette.gold); rect(x, y, 3*sx, 150*sy, palette.gold);
}
drawText('HERMANEA', 114, 18, palette.goldLight, 2);
drawText('HERMANITOS CARD', 260, 5, palette.gold, 2);
rect(210, 318, 780, 2, '#594a2e');
circle(600, 319, 7, palette.gold);

const qr = qrcode(0, 'H');
qr.addData(TARGET); qr.make();
const modules = qr.getModuleCount(), quiet = 4, cell = Math.floor(900 / (modules + quiet * 2));
const qrSize = (modules + quiet * 2) * cell, qrX = Math.floor((WIDTH - qrSize) / 2), qrY = 375;
rect(qrX - 28, qrY - 28, qrSize + 56, qrSize + 56, palette.panel);
frame(qrX - 28, qrY - 28, qrSize + 56, qrSize + 56, 3, palette.gold);
rect(qrX, qrY, qrSize, qrSize, palette.white);
for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) {
  if (qr.isDark(row, col)) rect(qrX + (col + quiet) * cell, qrY + (row + quiet) * cell, cell, cell, palette.qr);
}

const footerY = qrY + qrSize + 70;
drawText('ESCANEA PARA ENTRAR', footerY, 6, palette.goldLight, 2);
drawText('HERMANITOS CARD', footerY + 88, 4, palette.muted, 2);

await writeFile(OUTPUT, encodePng());
const file = await readFile(OUTPUT), decoded = decodeOwnPng(file), result = jsQR(decoded.rgba, decoded.width, decoded.height, { inversionAttempts: 'attemptBoth' });
if (!result || result.data !== TARGET) throw new Error(`QR verification failed: ${result?.data || 'nothing decoded'}`);
console.log(JSON.stringify({ output: OUTPUT, width: decoded.width, height: decoded.height, target: result.data, modules, cell, verified: true }));
