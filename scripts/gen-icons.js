// Gera os ícones PNG do PWA (sem dependências): fundo vermelho IndyCar,
// círculo branco central e faixa quadriculada (tema corrida).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public');

// ---------- mini codificador PNG (RGBA, sem filtro) ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filtro none
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- desenho ----------
function desenhar(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b) => { const i = (y * size + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; };
  const cx = size / 2, cy = size * 0.44;
  const R1 = size * 0.30, R2 = size * 0.22;
  const stripTop = Math.floor(size * 0.78);
  const sq = Math.max(8, Math.floor(size / 10));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // fundo vermelho com leve vinheta
      const dx = x - cx, dyAll = y - size / 2;
      const vin = Math.min(1, Math.hypot(dx, dyAll) / (size * 0.75));
      let r = Math.round(230 - 50 * vin), g = Math.round(25 - 10 * vin), b = Math.round(46 - 16 * vin);
      if (y >= stripTop) { // faixa quadriculada
        const cxi = Math.floor(x / sq), cyi = Math.floor((y - stripTop) / sq);
        const preto = (cxi + cyi) % 2 === 0;
        r = preto ? 16 : 245; g = preto ? 16 : 245; b = preto ? 20 : 245;
      } else {
        const dy = y - cy, d = Math.hypot(dx, dy);
        if (d < R1 && d > R2) { r = 255; g = 255; b = 255; }           // anel branco
        else if (d <= R2) { r = 18; g = 18; b = 26; }                  // miolo escuro
        if (d <= R2 * 0.45) { r = 230; g = 25; b = 46; }               // ponto vermelho central
      }
      set(x, y, r, g, b);
    }
  }
  return encodePNG(size, size, px);
}

mkdirSync(OUT, { recursive: true });
for (const s of [192, 512]) {
  writeFileSync(join(OUT, `icon-${s}.png`), desenhar(s));
  console.log(`icon-${s}.png ok`);
}
