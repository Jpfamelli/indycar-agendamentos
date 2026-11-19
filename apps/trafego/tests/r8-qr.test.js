'use strict';
/* Rodada 8 (T2b) — QR code feito aqui (rastreio/qr.js), conferido contra vetores conhecidos:
   1. vetores do padrão ISO/IEC 18004: correção de erro do "HELLO WORLD" 1-M, bits de formato e de versão;
   2. as 160 matrizes (versões 1 a 40, níveis L, M, Q e H, máscara fixa) comparadas com as de um gerador de
      referência (biblioteca qrcode 1.5.4, rodada uma vez fora da suíte em 19/11/2026, modo byte): aqui fica só o
      resumo sha256 (16 primeiros dígitos) de cada matriz, linha por linha, 1 = escuro;
   3. o SVG desenha exatamente a matriz e não leva texto nenhum. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const QR = require('../rastreio/qr');

const REFERENCIA = {
  L: [
    '90ba0fcef09af95e', '6251441de1964ecd', '29e5c19dbd86ebc6', '54ea5fcb484aca9d', '2339da2e2ac9ab18',
    '56e4aea100bfdb21', '0cdb77ec9fe84144', '353f0b0f86c00ef7', 'fd9e1f65d12d003f', 'c291210bcae74058',
    '4c1a4dfceb7e1802', 'f86cb543429b959d', '7657f2f1c07078fc', 'e5017d79abaf938f', 'ae070dfa7ed43167',
    '9012a511233921ab', '61c99272e84148b8', '310a105f9b506a2f', '38c18f22a63cd8a7', '16c4dcc4da98b65d',
    '16c4f970e22fa9b5', 'a7e24212789e6416', 'f4ed847810f6b89e', '90af12802a1c47b6', '2d158c826a22df17',
    'b41b95de04dff27b', 'e77722da9190f97a', '5e0ea27d0bca7d2e', 'b1f79c81cf29b340', '1e96190a9f6d8a06',
    'efe5ba56bced07e7', '35200d2a7848c447', '7a98c4b8aa4b7db4', '37e9d03e0555303b', '4e663c3c3945315e',
    '6f0396caa77fad98', '3240f2133d4aaab4', 'c9f6a6d4fe45a739', 'b97fda062e644ba1', '0a4df929195ac06c',
  ],
  M: [
    '0228a93ee60e7b92', '738a06f088eff735', '8d142989b71b98a0', 'eaa3ab36728b65f3', '920259db604c323e',
    'cfb5be13a7042870', '81790ec6d908e415', 'a78cf612355be991', '32d2985497be1943', '2a387762e1bf00ae',
    'b51dd4213489db32', '0ac00a415013fe48', '49847122a807f5f8', '6da04fc1897a289b', '805173cb8ba85a4c',
    'b950208d305abe26', 'c69bd117406a55ef', 'e073d0859d722600', '95222e87b2d41480', '3698db42c6e5d5ed',
    'e63256b56adab744', '13be8ae639e17645', '89207096c505b737', '992843c1021fbcca', '767172ae0cd8d935',
    'c60a8230c60e7776', '4cd035e818054e73', 'caadaa4c91761245', 'dbe23df113b02dec', '19f2371411f988b0',
    '42a5b9385a464aa9', '703415727cde6033', '54127538127fb3af', 'd1d4d7e1d01ceaf8', '40edef837b6dce4f',
    '14eda120d0a6b112', '86089ff1bd1627fc', 'd3553e53626f8c97', 'ef09d2c3dd8ca551', '72f333d81ca29191',
  ],
  Q: [
    '9de3c829c5c0e693', 'b6c7b01d11afda6d', 'b1d4fdbd5a67b1d5', '53b1bbfe7ef334b7', 'dd9b0772a181adfb',
    'df12e14fbb48b29e', '84c3fdede624b545', '99e954a2554b5da8', '9ff36ac6edebc450', '99ad6d0bd724ca1f',
    'b9fe8cb31d68b4cb', '2d3a895693e7f432', '71cbcdef285a88a5', '7774df528400c2e1', '9de7ced8daafbfab',
    '3a37c81f66bd8969', '8a8e2ea227067bbd', '34eb18b08fc2cb8a', '8686c74c7c14aee9', 'c2f685f024d4d4c2',
    'f17bc0e60e83de71', '67a6d5a6dc32d2c1', '81430174d4905ee2', '3bf93dba79475a4e', 'f9f4dfbb6bf5469f',
    '8be193d543688fe1', 'cd94a1eddea9434f', '0467dfa73cfaeb09', '32211f4c57ad85db', '2be63912b572d4a2',
    '7a33559eb7fc890b', 'ee9e824ff027c2e2', '6fca7b4829e28ebc', '2caa638084445cc8', '358e2ed741d3c123',
    '0f280491af579330', '0fd73827ed356c64', '711bc4b6faeea953', '3893427f2bc19d98', '77cc6db30ac5e75a',
  ],
  H: [
    'e69216a8a8b93f57', '38a59399cdc2eff6', 'b0c91b7dcfe27b6f', '3d1b09c2a6637bad', '858828ee3aa3bbdb',
    '54b3a8759c81e443', '3333281b88c30220', 'b0b649111fff54b9', '7ab599aeb5be1651', '50c6bed78f55e54f',
    '5cb94b57193f854e', '90471e8ac9821371', '8e11cf2fd0c347e1', '8573e43d6c541b61', 'd05ab09efc868334',
    '4da291a139d686e4', '1b3bba2d19bf85fb', 'a3b32c633a1f63d3', '827155de501044d9', 'e0cc37dc10cebe06',
    'bfb986e7a874862a', 'c4079b6b93c8ac73', 'fa2681c3cd97509f', '6435841dc8cc780b', '8775963263d103a5',
    '842cddf26a82c99c', 'ad6e9bf500881cd9', 'aa92cc6ac1f7de90', '63a57674b8768e2e', 'f884b8a3cf05fead',
    '5abbbbeb989d4bf3', '4961dd1d15a2d5f6', '92907582f6b52110', 'e7edffe804f7ab9d', '33a89ee74945e0ee',
    '34f875373a25a124', '3c8900722f6f982e', '6b46a0c60691ee08', '4b3dc9fb8bd43c58', '72f9e76ff9fcdbd6',
  ],
};

const BASE = 'https://wa.me/5512?text=Ol%C3%A1';
/* O mesmo conteúdo usado no gerador de referência (os 31 primeiros caracteres de BASE, repetidos): quase cheio em cada versão, máscara variando. */
const conteudo = (versao, nivel) => {
  const n = Math.max(1, QR.capacidade(versao, nivel) - (versao * 7) % 13);
  return Array.from({ length: n }, (_, i) => BASE[i % 31]).join('');
};
const mascaraDo = (versao, nivel) => (versao + nivel.charCodeAt(0)) % 8;
const resumo = m => crypto.createHash('sha256').update(m.map(l => l.map(b => (b ? '1' : '0')).join('')).join('')).digest('hex').slice(0, 16);

test('correção de erro do vetor do padrão (HELLO WORLD, versão 1, nível M)', () => {
  const dados = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(Array.from(QR.correcao(dados, 10)), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('bits de formato e de versão batem com as tabelas do padrão', () => {
  assert.equal(QR.bitsDeFormato('M', 0), 0b101010000010010);
  assert.equal(QR.bitsDeFormato('L', 0), 0b111011111000100);
  assert.equal(QR.bitsDeFormato('H', 7), 0b000100000111011);
  assert.equal(QR.bitsDeVersao(7), 0x07c94);
  assert.equal(QR.bitsDeVersao(40), 0x28c69);
});

test('as 160 matrizes (versões 1 a 40 nos quatro níveis) batem com o gerador de referência', () => {
  const erradas = [];
  for (const nivel of ['L', 'M', 'Q', 'H']) {
    for (let v = 1; v <= 40; v++) {
      const qr = QR.codificar(conteudo(v, nivel), { nivel, versaoMinima: v, versaoMaxima: v, mascara: mascaraDo(v, nivel), reforcar: false });
      assert.equal(qr.tamanho, 17 + 4 * v);
      if (resumo(qr.modulos) !== REFERENCIA[nivel][v - 1]) erradas.push(nivel + v);
    }
  }
  assert.deepEqual(erradas, []);
});

test('escolhe a menor versão que cabe, sobe a correção sem crescer e recusa conteúdo grande demais', () => {
  assert.equal(QR.codificar('a', { nivel: 'M', reforcar: false }).versao, 1);
  assert.equal(QR.codificar('a', { nivel: 'M' }).nivel, 'H');
  assert.equal(QR.codificar('x'.repeat(QR.capacidade(5, 'M') + 1), { nivel: 'M', reforcar: false }).versao, 6);
  assert.throws(() => QR.codificar('x'.repeat(3000), { nivel: 'H' }), RangeError);
});

test('o SVG desenha a matriz, tem margem clara e não leva texto', () => {
  const link = 'https://wa.me/5512990001234?text=' + encodeURIComponent('Olá! <script>alert(1)</script> [ref K7M2P]');
  const qr = QR.codificar(link, { nivel: 'M' });
  const svg = QR.svg(qr);
  assert.match(svg, /^<svg [^>]*viewBox="0 0 (\d+) \1"/);
  assert.equal(Number(/viewBox="0 0 (\d+)/.exec(svg)[1]), qr.tamanho + 8);
  assert.equal(svg.includes('script'), false);
  assert.equal(svg.includes('wa.me'), false);
  // lê o desenho de volta: cada retângulo "M x y h largura" pinta a linha y de x até x + largura
  const lido = Array.from({ length: qr.tamanho }, () => Array(qr.tamanho).fill(false));
  for (const [, x, y, w] of svg.split('fill="#000" d="')[1].matchAll(/M(\d+) (\d+)h(\d+)/g)) {
    for (let i = 0; i < Number(w); i++) lido[Number(y) - 4][Number(x) - 4 + i] = true;
  }
  assert.deepEqual(lido, qr.modulos);
});
