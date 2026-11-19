/* ============================================================
   QR code em SVG, feito aqui (rodada 8, frente T2b). Sem biblioteca de fora.

   Para que serve: a "mensagem pronta" (Ajustes › De onde vêm os contatos) vira um QR code
   que abre o WhatsApp da oficina com o texto e o código já escritos. Vai em cartaz, panfleto,
   cartão de indicação.

   O que faz: QR code modelo 2 (ISO/IEC 18004), modo byte, versões 1 a 40, níveis de correção
   L, M, Q e H, as 8 máscaras com a nota de penalidade do padrão. Só o modo byte porque o
   conteúdo é sempre um endereço (letras minúsculas, "%", "?"), que não cabe nos modos menores.

   Como se sabe que está certo (tests/r8-qr.test.js):
   - vetores do padrão: correção de erro do "HELLO WORLD" 1-M, bits de formato e de versão;
   - matrizes inteiras conferidas módulo a módulo com um gerador de referência, nas 40 versões
     e nos 4 níveis;
   - o desenho em SVG é lido de volta e bate com a matriz.

   Nada de texto de pessoa entra no SVG: ele é feito só de retângulos.
   ============================================================ */
'use strict';

/* Nível de correção: bits que vão no desenho e posição nas tabelas. */
const NIVEIS = { L: { bits: 1, i: 0 }, M: { bits: 0, i: 1 }, Q: { bits: 3, i: 2 }, H: { bits: 2, i: 3 } };
const ORDEM_DOS_NIVEIS = ['L', 'M', 'Q', 'H'];

/* Tabelas do padrão, por [nível][versão]: palavras de correção em cada bloco e quantos blocos.
   O resto (palavras de dados, blocos curtos e compridos) sai da conta com o total de palavras. */
const CORRECAO_POR_BLOCO = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const BLOCOS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const VERSAO_MAXIMA = 40;
const nivelDe = nome => {
  const n = NIVEIS[String(nome || '').toUpperCase()];
  if (!n) throw new RangeError('Nível de correção do QR code inválido (use L, M, Q ou H).');
  return n;
};
const conferirVersao = v => {
  if (!Number.isInteger(v) || v < 1 || v > VERSAO_MAXIMA) throw new RangeError('Versão do QR code inválida (de 1 a 40).');
  return v;
};

/* ---------------- quanto cabe ---------------- */

/** Módulos que sobram para dados e correção, tirando os desenhos fixos. */
function modulosLivres(versao) {
  let r = (16 * versao + 128) * versao + 64;
  if (versao >= 2) {
    const alinhamentos = Math.floor(versao / 7) + 2;
    r -= (25 * alinhamentos - 10) * alinhamentos - 55;
    if (versao >= 7) r -= 36;
  }
  return r;
}
const totalDePalavras = versao => Math.floor(modulosLivres(conferirVersao(versao)) / 8);
/** Palavras (bytes) de dados que cabem numa versão e nível. */
function palavrasDeDados(versao, nivel) {
  const i = nivelDe(nivel).i;
  return totalDePalavras(versao) - CORRECAO_POR_BLOCO[i][versao] * BLOCOS[i][versao];
}
const bitsDoTamanho = versao => (versao <= 9 ? 8 : 16);   // modo byte
/** Quantos bytes de conteúdo cabem (modo byte) numa versão e nível. */
function capacidade(versao, nivel) {
  return Math.floor((palavrasDeDados(versao, nivel) * 8 - 4 - bitsDoTamanho(versao)) / 8);
}

/* ---------------- correção de erro (Reed-Solomon sobre GF(256), polinômio 0x11D) ---------------- */

const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const vezes = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

const DIVISORES = new Map();
/** Polinômio gerador de grau `grau` (sem o termo de maior grau), do coeficiente mais alto ao mais baixo. */
function divisor(grau) {
  if (DIVISORES.has(grau)) return DIVISORES.get(grau);
  const r = new Array(grau).fill(0);
  r[grau - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grau; i++) {
    for (let j = 0; j < grau; j++) {
      r[j] = vezes(r[j], raiz);
      if (j + 1 < grau) r[j] ^= r[j + 1];
    }
    raiz = vezes(raiz, 2);
  }
  DIVISORES.set(grau, r);
  return r;
}
/** Palavras de correção de um bloco de dados. */
function correcao(dados, quantas) {
  const div = divisor(quantas), resto = new Array(quantas).fill(0);
  for (const b of dados) {
    const fator = b ^ resto.shift();
    resto.push(0);
    for (let i = 0; i < quantas; i++) resto[i] ^= vezes(div[i], fator);
  }
  return resto;
}

/* ---------------- do texto às palavras ---------------- */

/** Bytes do conteúdo → palavras de dados da versão (modo byte, terminador e enchimento do padrão). */
function palavrasDoConteudo(bytes, versao, nivel) {
  const total = palavrasDeDados(versao, nivel), bits = [];
  const por = (valor, n) => { for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1); };
  por(4, 4);                                   // modo byte
  por(bytes.length, bitsDoTamanho(versao));
  for (const b of bytes) por(b, 8);
  if (bits.length > total * 8) throw new RangeError('O conteúdo não cabe nessa versão do QR code.');
  por(0, Math.min(4, total * 8 - bits.length));                 // terminador
  while (bits.length % 8) bits.push(0);
  const palavras = [];
  for (let i = 0; i < bits.length; i += 8) palavras.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let enche = 0xec; palavras.length < total; enche ^= 0xec ^ 0x11) palavras.push(enche);
  return palavras;
}

/** Palavras de dados → sequência final (blocos de dados intercalados e, depois, os de correção). */
function intercalar(dados, versao, nivel) {
  const i = nivelDe(nivel).i, blocos = BLOCOS[i][versao], ec = CORRECAO_POR_BLOCO[i][versao], total = totalDePalavras(versao);
  if (dados.length !== total - ec * blocos) throw new RangeError('Quantidade de palavras de dados errada para essa versão.');
  const curtos = blocos - (total % blocos), dadosNoCurto = Math.floor(total / blocos) - ec;
  const partes = [];
  for (let b = 0, k = 0; b < blocos; b++) {
    const tamanho = dadosNoCurto + (b < curtos ? 0 : 1), d = dados.slice(k, k + tamanho);
    k += tamanho;
    partes.push({ d, e: correcao(d, ec) });
  }
  const saida = [];
  for (let c = 0; c <= dadosNoCurto; c++) for (const p of partes) if (c < p.d.length) saida.push(p.d[c]);
  for (let c = 0; c < ec; c++) for (const p of partes) saida.push(p.e[c]);
  return saida;
}

/* ---------------- o desenho ---------------- */

/** Centros dos quadradinhos de alinhamento de uma versão. */
function alinhamentos(versao) {
  if (versao === 1) return [];
  const quantos = Math.floor(versao / 7) + 2, tamanho = versao * 4 + 17;
  const passo = versao === 32 ? 26 : Math.ceil((versao * 4 + 4) / (quantos * 2 - 2)) * 2;
  const r = [6];
  for (let pos = tamanho - 7; r.length < quantos; pos -= passo) r.splice(1, 0, pos);
  return r;
}

/** Os 15 bits de formato (nível + máscara), já com a máscara fixa do padrão. */
function bitsDeFormato(nivel, mascara) {
  const dado = (nivelDe(nivel).bits << 3) | mascara;
  let resto = dado;
  for (let i = 0; i < 10; i++) resto = (resto << 1) ^ ((resto >>> 9) * 0x537);
  return ((dado << 10) | resto) ^ 0x5412;
}
/** Os 18 bits de versão (só existem da versão 7 em diante). */
function bitsDeVersao(versao) {
  let resto = versao;
  for (let i = 0; i < 12; i++) resto = (resto << 1) ^ ((resto >>> 11) * 0x1f25);
  return (versao << 12) | resto;
}

const MASCARAS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0,
  (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
];

/** Desenhos fixos (cantos, linhas de tempo, alinhamentos, reserva de formato e versão). Devolve { m, fixo }. */
function base(versao) {
  const n = versao * 4 + 17;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const fixo = Array.from({ length: n }, () => new Array(n).fill(false));
  const por = (x, y, escuro) => { m[y][x] = escuro; fixo[y][x] = true; };

  for (let i = 0; i < n; i++) { por(6, i, i % 2 === 0); por(i, 6, i % 2 === 0); }
  const canto = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < n && y >= 0 && y < n) por(x, y, d !== 2 && d !== 4);
    }
  };
  canto(3, 3); canto(n - 4, 3); canto(3, n - 4);
  const pos = alinhamentos(versao), ultimo = pos.length - 1;
  for (let i = 0; i <= ultimo; i++) for (let j = 0; j <= ultimo; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === ultimo) || (i === ultimo && j === 0)) continue;   // onde ficam os cantos
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) por(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  return { n, m, fixo, por };
}

function porFormato(d, nivel, mascara) {
  const bits = bitsDeFormato(nivel, mascara), n = d.n, bit = i => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) d.por(8, i, bit(i));
  d.por(8, 7, bit(6)); d.por(8, 8, bit(7)); d.por(7, 8, bit(8));
  for (let i = 9; i < 15; i++) d.por(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) d.por(n - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) d.por(8, n - 15 + i, bit(i));
  d.por(8, n - 8, true);                        // o módulo sempre escuro
}
function porVersao(d, versao) {
  if (versao < 7) return;
  const bits = bitsDeVersao(versao);
  for (let i = 0; i < 18; i++) {
    const escuro = ((bits >>> i) & 1) === 1, a = d.n - 11 + (i % 3), b = Math.floor(i / 3);
    d.por(a, b, escuro); d.por(b, a, escuro);
  }
}

/** Nota de penalidade do padrão (quanto menor, mais fácil de ler). */
function penalidade(m) {
  const n = m.length;
  let nota = 0, escuros = 0;
  const linha = lido => {
    // regra 1: cinco ou mais iguais em fila; regra 3: desenho parecido com o canto (1:1:3:1:1 com 4 claros de um lado)
    let igual = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && lido(i) === lido(i - 1)) { igual++; continue; }
      if (igual >= 5) nota += 3 + (igual - 5);
      igual = 1;
    }
    for (let i = 0; i + 10 < n; i++) {
      const p = k => lido(i + k);
      const miolo = k => p(k) && !p(k + 1) && p(k + 2) && p(k + 3) && p(k + 4) && !p(k + 5) && p(k + 6);
      if (miolo(0) && !p(7) && !p(8) && !p(9) && !p(10)) nota += 40;
      if (!p(0) && !p(1) && !p(2) && !p(3) && miolo(4)) nota += 40;
    }
  };
  for (let y = 0; y < n; y++) linha(x => m[y][x]);
  for (let x = 0; x < n; x++) linha(y => m[y][x]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (m[y][x]) escuros++;
    if (x + 1 < n && y + 1 < n && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) nota += 3;   // regra 2
  }
  const total = n * n;
  nota += (Math.ceil(Math.abs(escuros * 20 - total * 10) / total) - 1) * 10;   // regra 4: longe de metade escuro
  return nota;
}

/**
 * Matriz final a partir das palavras de dados. `mascara` de 0 a 7, ou null para escolher a de menor penalidade.
 * Devolve { versao, nivel, mascara, tamanho, modulos } (modulos[y][x] === true é escuro).
 */
function matriz(dados, versao, nivel, mascara = null) {
  conferirVersao(versao);
  const nome = String(nivel).toUpperCase();
  nivelDe(nome);
  if (mascara != null && (!Number.isInteger(mascara) || mascara < 0 || mascara > 7)) throw new RangeError('Máscara do QR code inválida (de 0 a 7).');
  const palavras = intercalar(dados, versao, nome);
  const d = base(versao), n = d.n;
  porFormato(d, nome, 0);                       // reserva o lugar; o valor certo entra depois da máscara
  porVersao(d, versao);

  // os bits sobem e descem em pares de colunas, da direita para a esquerda, pulando a coluna da linha de tempo
  let k = 0;
  for (let direita = n - 1; direita >= 1; direita -= 2) {
    if (direita === 6) direita = 5;
    for (let passo = 0; passo < n; passo++) for (let j = 0; j < 2; j++) {
      const x = direita - j, sobe = ((direita + 1) & 2) === 0, y = sobe ? n - 1 - passo : passo;
      if (d.fixo[y][x]) continue;
      if (k < palavras.length * 8) d.m[y][x] = ((palavras[k >>> 3] >>> (7 - (k & 7))) & 1) === 1;
      k++;
    }
  }

  const aplicar = qual => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!d.fixo[y][x] && MASCARAS[qual](x, y)) d.m[y][x] = !d.m[y][x]; };
  let escolhida = mascara;
  if (escolhida == null) {
    let menor = Infinity;
    for (let q = 0; q < 8; q++) {
      aplicar(q); porFormato(d, nome, q);
      const nota = penalidade(d.m);
      if (nota < menor) { menor = nota; escolhida = q; }
      aplicar(q);                                // desfaz (a máscara é um ou-exclusivo)
    }
  }
  aplicar(escolhida); porFormato(d, nome, escolhida);
  return { versao, nivel: nome, mascara: escolhida, tamanho: n, modulos: d.m };
}

/**
 * QR code de um texto. Escolhe a menor versão em que o conteúdo cabe.
 * opcoes: nivel ('M'), versaoMinima (1), versaoMaxima (40), mascara (null = a melhor),
 *         reforcar (true: sobe o nível de correção enquanto couber na mesma versão, sem aumentar o desenho).
 * Conteúdo que não cabe: RangeError.
 */
function codificar(texto, { nivel = 'M', versaoMinima = 1, versaoMaxima = VERSAO_MAXIMA, mascara = null, reforcar = true } = {}) {
  const bytes = Buffer.isBuffer(texto) ? texto : Buffer.from(String(texto == null ? '' : texto), 'utf8');
  let nome = String(nivel).toUpperCase();
  nivelDe(nome);
  conferirVersao(versaoMinima); conferirVersao(versaoMaxima);
  let versao = versaoMinima;
  while (versao <= versaoMaxima && capacidade(versao, nome) < bytes.length) versao++;
  if (versao > versaoMaxima) throw new RangeError('O conteúdo é comprido demais para um QR code.');
  if (reforcar) for (const maior of ORDEM_DOS_NIVEIS.slice(ORDEM_DOS_NIVEIS.indexOf(nome) + 1)) { if (capacidade(versao, maior) >= bytes.length) nome = maior; }
  return matriz(palavrasDoConteudo(bytes, versao, nome), versao, nome, mascara);
}

/**
 * O desenho em SVG: fundo branco, módulos pretos, margem clara em volta (4 módulos, como pede o padrão).
 * Aceita o texto ou o resultado de `codificar`. Só números entram no SVG.
 */
function svg(conteudo, { margem = 4, ponto = 8, ...opcoes } = {}) {
  const qr = conteudo && Array.isArray(conteudo.modulos) ? conteudo : codificar(conteudo, opcoes);
  const borda = Number.isInteger(margem) && margem >= 0 && margem <= 16 ? margem : 4;
  const px = Number.isInteger(ponto) && ponto >= 1 && ponto <= 64 ? ponto : 8;
  const lado = qr.tamanho + borda * 2;
  let d = '';
  for (let y = 0; y < qr.tamanho; y++) {
    for (let x = 0; x < qr.tamanho;) {
      if (!qr.modulos[y][x]) { x++; continue; }
      const inicio = x;
      while (x < qr.tamanho && qr.modulos[y][x]) x++;
      d += `M${inicio + borda} ${y + borda}h${x - inicio}v1h-${x - inicio}z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" width="${lado * px}" height="${lado * px}" shape-rendering="crispEdges" role="img" aria-label="QR code">`
    + `<path fill="#fff" d="M0 0h${lado}v${lado}h-${lado}z"/><path fill="#000" d="${d}"/></svg>`;
}

module.exports = {
  NIVEIS, VERSAO_MAXIMA, MASCARAS,
  totalDePalavras, palavrasDeDados, capacidade, correcao, palavrasDoConteudo, intercalar,
  alinhamentos, bitsDeFormato, bitsDeVersao, penalidade, matriz, codificar, svg,
};
