/* Gera public/logo-claro.png a partir da logo oficial (public/logo.png), sem biblioteca de imagem.
   A logo oficial tem fundo PRETO: no tema claro ela aparecia como uma placa preta. Aqui o preto vira
   transparente, o vermelho e a palavra INDY CAR (branca, dentro do vermelho) ficam como são, e o que
   é branco FORA do vermelho (a marca do pneu e "CENTRO AUTOMOTIVO") vira o escuro da casa (#0d1220),
   para aparecer sobre fundo claro. Nada é redesenhado: é a mesma arte, com outra cor de fundo.
   Uso: node scripts/gerar-logo-claro.cjs */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ENTRADA = path.join(__dirname, '..', 'public', 'logo.png');
const SAIDA = path.join(__dirname, '..', 'public', 'logo-claro.png');

function lerPng(buf) {
  let p = 8, ihdr = null, paleta = null; const idat = [];
  while (p < buf.length) {
    const tam = buf.readUInt32BE(p), tipo = buf.toString('latin1', p + 4, p + 8), dados = buf.subarray(p + 8, p + 8 + tam);
    if (tipo === 'IHDR') ihdr = { w: dados.readUInt32BE(0), h: dados.readUInt32BE(4), bits: dados[8], cor: dados[9], entrelacado: dados[12] };
    else if (tipo === 'PLTE') paleta = Buffer.from(dados);
    else if (tipo === 'IDAT') idat.push(dados);
    p += 12 + tam;
  }
  if (!ihdr || ihdr.bits !== 8 || ihdr.entrelacado) throw new Error('PNG fora do formato esperado (8 bits, sem entrelaçar)');
  const canais = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.cor];
  const bruto = zlib.inflateSync(Buffer.concat(idat));
  const linha = ihdr.w * canais, px = Buffer.alloc(ihdr.w * ihdr.h * 4);
  let ant = Buffer.alloc(linha);
  for (let y = 0; y < ihdr.h; y++) {
    const filtro = bruto[y * (linha + 1)], atual = Buffer.from(bruto.subarray(y * (linha + 1) + 1, (y + 1) * (linha + 1)));
    for (let i = 0; i < linha; i++) {
      const a = i >= canais ? atual[i - canais] : 0, b = ant[i], c = i >= canais ? ant[i - canais] : 0;
      let soma = 0;
      if (filtro === 1) soma = a; else if (filtro === 2) soma = b; else if (filtro === 3) soma = (a + b) >> 1;
      else if (filtro === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); soma = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      atual[i] = (atual[i] + soma) & 255;
    }
    for (let x = 0; x < ihdr.w; x++) {
      const o = (y * ihdr.w + x) * 4, i = x * canais;
      if (ihdr.cor === 3) { px[o] = paleta[atual[i] * 3]; px[o + 1] = paleta[atual[i] * 3 + 1]; px[o + 2] = paleta[atual[i] * 3 + 2]; px[o + 3] = 255; }
      else if (ihdr.cor === 0 || ihdr.cor === 4) { px[o] = px[o + 1] = px[o + 2] = atual[i]; px[o + 3] = ihdr.cor === 4 ? atual[i + 1] : 255; }
      else { px[o] = atual[i]; px[o + 1] = atual[i + 1]; px[o + 2] = atual[i + 2]; px[o + 3] = canais === 4 ? atual[i + 3] : 255; }
    }
    ant = atual;
  }
  return { w: ihdr.w, h: ihdr.h, px };
}

function gravarPng({ w, h, px }) {
  const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const bloco = (tipo, dados) => { const t = Buffer.from(tipo, 'latin1'), tam = Buffer.alloc(4), fim = Buffer.alloc(4); tam.writeUInt32BE(dados.length); fim.writeUInt32BE(crc(Buffer.concat([t, dados]))); return Buffer.concat([tam, t, dados, fim]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const linhas = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) px.copy(linhas, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(linhas, { level: 9 })), bloco('IEND', Buffer.alloc(0))]);
}

const img = lerPng(fs.readFileSync(ENTRADA));
const ESCURO = [13, 18, 32];
const vermelho = (r, g, b) => r > 120 && r > g * 1.8 && r > b * 1.8;
const fora = Buffer.alloc(img.w * img.h * 4);
for (let y = 0; y < img.h; y++) {
  // onde começa e termina o vermelho nesta linha: branco ali dentro é a palavra INDY CAR
  let ini = -1, fim = -1;
  for (let x = 0; x < img.w; x++) { const o = (y * img.w + x) * 4; if (vermelho(img.px[o], img.px[o + 1], img.px[o + 2])) { if (ini < 0) ini = x; fim = x; } }
  for (let x = 0; x < img.w; x++) {
    const o = (y * img.w + x) * 4, r = img.px[o], g = img.px[o + 1], b = img.px[o + 2];
    const dentro = ini >= 0 && x >= ini && x <= fim;
    if (dentro) {
      // dentro do retângulo: mantém a cor; a borda escura (serrilhado com o preto) some pela opacidade
      const claro = Math.max(r, g, b);
      fora[o] = r; fora[o + 1] = g; fora[o + 2] = b; fora[o + 3] = Math.min(255, Math.round(claro * 1.35));
    } else {
      // fora: quanto mais branco, mais do escuro da casa aparece; o preto vira transparente
      const luz = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      fora[o] = ESCURO[0]; fora[o + 1] = ESCURO[1]; fora[o + 2] = ESCURO[2]; fora[o + 3] = luz;
    }
  }
}
fs.writeFileSync(SAIDA, gravarPng({ w: img.w, h: img.h, px: fora }));
console.log(`logo-claro.png gravado (${img.w}x${img.h}, ${fs.statSync(SAIDA).size} bytes)`);
