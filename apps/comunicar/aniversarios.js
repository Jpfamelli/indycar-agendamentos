// -----------------------------------------------------------------------------
// Aniversários (rodada 4) — tudo PURO, testado em `npm test`.
//   • lerData: entende 12/05/1980, 12/05/80, 12-05, 1980-05-12, "12 de maio",
//     "12 mai 1980", 12/05/1980 00:00:00 (Excel)… e confere se a data existe
//   • lerLista: texto colado ou CSV, com ou sem cabeçalho, separador qualquer
//   • casarComClientes: acha o cliente pelo telefone (melhor) ou pelo nome
//   • procurarDatas: acha "meu aniversário é 12/05" em observações e conversas
// Nada aqui grava no banco: a tela mostra a prévia e a pessoa confirma.
// -----------------------------------------------------------------------------
import { semAcento, soDigitos, telefoneNacional } from './dados.js';

const MESES = {
  jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, abr: 4, abril: 4, mai: 5, maio: 5,
  jun: 6, junho: 6, jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9, out: 10, outubro: 10,
  nov: 11, novembro: 11, dez: 12, dezembro: 12,
};
const BOM = new RegExp('^' + String.fromCharCode(0xfeff));
const p2 = (n) => String(n).padStart(2, '0');

/** A data existe? (29/02 só em ano bissexto; 1904 é bissexto = marcador de "só dia/mês"). */
export function dataExiste(ano, mes, dia) {
  if (!(mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31)) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** Ano de 2 dígitos: 80 → 1980; 05 → 2005 (se não passar do ano atual). */
function anoCompleto(aa, anoAtual) {
  const n = Number(aa);
  if (String(aa).length === 4) return n;
  const corte = anoAtual % 100;
  return n > corte ? 1900 + n : 2000 + n;
}

/**
 * Lê uma data de nascimento escrita de qualquer jeito comum no Brasil.
 * Devolve 'AAAA-MM-DD' (ano 1904 quando só veio dia/mês) ou null.
 * Ano no futuro, antes de 1900 ou idade acima de 110 → null (provável erro).
 */
export function lerData(texto, { anoAtual = new Date().getFullYear() } = {}) {
  if (texto === null || texto === undefined) return null;
  let t = semAcento(String(texto)).trim();
  if (!t) return null;
  t = t.replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*$/, ''); // "12/05/1980 00:00:00"
  const montar = (ano, mes, dia) => {
    if (ano === null) return dataExiste(1904, mes, dia) ? `1904-${p2(mes)}-${p2(dia)}` : null;
    if (ano < 1900 || ano > anoAtual || anoAtual - ano > 110) return null;
    return dataExiste(ano, mes, dia) ? `${ano}-${p2(mes)}-${p2(dia)}` : null;
  };
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:t.*)?$/);
  if (m) return montar(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2}|\d{4})$/);
  if (m) return montar(anoCompleto(m[3], anoAtual), Number(m[2]), Number(m[1]));
  m = t.match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})$/);
  if (m) return montar(null, Number(m[2]), Number(m[1]));
  // "12 de maio de 1980", "12 maio", "12/mai/80", "12-mai"
  m = t.match(/^(\d{1,2})\s*(?:de\s+|[/.\-]\s*)?([a-z]{3,9})\.?\s*(?:(?:de\s+|[/.\-]\s*)?(\d{2}|\d{4}))?$/);
  if (m && MESES[m[2]]) return montar(m[3] ? anoCompleto(m[3], anoAtual) : null, MESES[m[2]], Number(m[1]));
  return null;
}

/* Data dentro de um texto maior (a coluna inteira ou uma frase). */
const RE_DATA_SOLTA = /(?<!\d)(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s*[/.\-]\s*\d{1,2}(?:\s*[/.\-]\s*(?:\d{4}|\d{2}))?|\d{1,2}\s+de\s+[a-z]{3,9}(?:\s+de\s+\d{4})?)(?!\d)/g;

/** Primeira data que existe de verdade dentro do texto (pula pedaços de telefone). */
function primeiraData(texto, anoAtual) {
  const t = semAcento(texto);
  RE_DATA_SOLTA.lastIndex = 0;
  let m;
  while ((m = RE_DATA_SOLTA.exec(t))) {
    const iso = lerData(m[1], { anoAtual });
    if (iso) return { iso, txt: m[1], index: m.index, tam: m[0].length };
  }
  return null;
}

const CABECALHOS = {
  nome: /^(nome|cliente|nome do cliente|nome completo)$/,
  telefone: /^(telefone|celular|whatsapp|fone|tel|contato|numero)$/,
  nascimento: /^(nascimento|data de nascimento|aniversario|data de aniversario|dt nasc|dt nascimento|nasc|niver|data)$/,
};

function separadorDa(linha) {
  if (linha.includes('\t')) return '\t';
  if (linha.includes(';')) return ';';
  if (linha.includes('|')) return '|';
  if ((linha.match(/,/g) || []).length >= 1 && !/\d,\d/.test(linha)) return ',';
  return null;
}

function partirCSV(linha, sep) {
  const out = []; let atual = '', aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (ch === '"') { if (aspas && linha[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas; continue; }
    if (ch === sep && !aspas) { out.push(atual.trim()); atual = ''; continue; }
    atual += ch;
  }
  out.push(atual.trim());
  return out;
}

/** Uma linha sem cabeçalho: acha a data, o telefone e o que sobra é o nome. */
function lerLinhaSolta(bruto, anoAtual) {
  let resto = ` ${bruto} `;
  let data = null, dataTxt = null;
  const md = primeiraData(resto, anoAtual);
  if (md) { data = md.iso; dataTxt = md.txt; resto = resto.slice(0, md.index) + ' ' + resto.slice(md.index + md.tam); }
  else {
    // tem cara de data mas não existe (31/02): guarda o texto para dizer "não entendi a data"
    RE_DATA_SOLTA.lastIndex = 0;
    const cara = RE_DATA_SOLTA.exec(semAcento(resto));
    if (cara && /[/.]/.test(cara[1])) { dataTxt = cara[1]; resto = resto.slice(0, cara.index) + ' ' + resto.slice(cara.index + cara[0].length); }
  }
  let telefone = null;
  const mt = resto.match(/(\+?\d[\d\s().\-]{7,18}\d)/);
  if (mt && soDigitos(mt[1]).length >= 8 && soDigitos(mt[1]).length <= 13) {
    telefone = soDigitos(mt[1]);
    resto = resto.replace(mt[1], ' ');
  }
  const nome = resto.replace(/[;,|\t()[\]"]+/g, ' ').replace(/\s*[-–:]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return { nome: nome || null, telefone, data, dataTxt };
}

/**
 * Texto colado ou conteúdo de um CSV → linhas { linha, nome, telefone, data, bruto, erro }.
 * Com cabeçalho (nome/telefone/nascimento…) usa as colunas; sem, adivinha por linha.
 */
export function lerLista(texto, { anoAtual = new Date().getFullYear(), limite = 3000 } = {}) {
  const linhas = String(texto ?? '').replace(BOM, '').split(/\r?\n/).map((l) => l.trim());
  const naoVazias = linhas.map((l, i) => ({ l, i })).filter((x) => x.l && !/^[;,|\t\s]+$/.test(x.l)).slice(0, limite + 1);
  if (!naoVazias.length) return { linhas: [], cabecalho: false };
  const sep = separadorDa(naoVazias[0].l);
  let mapa = null;
  if (sep) {
    const cab = partirCSV(naoVazias[0].l, sep).map((c) => semAcento(c).replace(/[^a-z ]/g, '').trim());
    const idx = {};
    cab.forEach((c, i) => { for (const [k, re] of Object.entries(CABECALHOS)) if (idx[k] === undefined && re.test(c)) idx[k] = i; });
    if (idx.nascimento !== undefined && (idx.nome !== undefined || idx.telefone !== undefined)) mapa = idx;
  }
  const corpo = mapa ? naoVazias.slice(1) : naoVazias;
  const saida = corpo.slice(0, limite).map(({ l, i }) => {
    let r;
    if (mapa) {
      const col = partirCSV(l, sep);
      const bruta = col[mapa.nascimento] ?? '';
      r = {
        nome: mapa.nome !== undefined ? (col[mapa.nome] || null) : null,
        telefone: mapa.telefone !== undefined ? (soDigitos(col[mapa.telefone]) || null) : null,
        data: lerData(bruta, { anoAtual }), dataTxt: bruta || null,
      };
    } else {
      r = lerLinhaSolta(l, anoAtual);
    }
    let erro = null;
    if (!r.data) erro = r.dataTxt ? `não entendi a data "${r.dataTxt}"` : 'sem data de nascimento';
    else if (!r.nome && !r.telefone) erro = 'sem nome nem telefone';
    return { linha: i + 1, nome: r.nome, telefone: r.telefone, data: r.data, bruto: l.slice(0, 200), erro };
  });
  return { linhas: saida, cabecalho: !!mapa, cortado: corpo.length > limite };
}

const normNome = (s) => semAcento(s).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Casa cada linha com um cliente da base. Ordem: telefone igual → últimos 8
 * dígitos (sem o 9 da frente) com um só cliente → nome igual com um só cliente
 * → primeiro + último nome com um só cliente. Mais de um candidato = "ambíguo".
 */
export function casarComClientes(linhas, clientes) {
  const porTel = new Map(), por8 = new Map(), porNome = new Map(), porPU = new Map();
  const add = (mapa, k, c) => { if (!k) return; const l = mapa.get(k) || []; if (!l.includes(c)) l.push(c); mapa.set(k, l); };
  for (const c of clientes) {
    const t = telefoneNacional(c.telefone);
    if (t) { add(porTel, t, c); add(por8, t.slice(-8), c); }
    const n = normNome(c.nome);
    if (n) {
      add(porNome, n, c);
      const p = n.split(' ');
      if (p.length >= 2) add(porPU, `${p[0]} ${p[p.length - 1]}`, c);
    }
  }
  const unico = (l) => (l && l.length === 1 ? l[0] : null);
  return linhas.map((l) => {
    if (l.erro) return { ...l, status: 'invalida' };
    let achado = null, como = null, candidatos = [];
    const t = l.telefone ? telefoneNacional(l.telefone) : '';
    if (t && unico(porTel.get(t))) { achado = unico(porTel.get(t)); como = 'telefone'; }
    else if (t && t.length >= 8 && unico(por8.get(t.slice(-8)))) { achado = unico(por8.get(t.slice(-8))); como = 'telefone'; }
    else if (t && (porTel.get(t)?.length > 1)) candidatos = porTel.get(t);
    if (!achado && l.nome) {
      const n = normNome(l.nome);
      const p = n.split(' ');
      if (unico(porNome.get(n))) { achado = unico(porNome.get(n)); como = 'nome'; }
      else if (porNome.get(n)?.length > 1) candidatos = porNome.get(n);
      else if (p.length >= 2 && unico(porPU.get(`${p[0]} ${p[p.length - 1]}`))) { achado = unico(porPU.get(`${p[0]} ${p[p.length - 1]}`)); como = 'nome'; }
      else if (p.length >= 2 && porPU.get(`${p[0]} ${p[p.length - 1]}`)?.length > 1) candidatos = porPU.get(`${p[0]} ${p[p.length - 1]}`);
    }
    if (achado) {
      const atual = achado.nascimento ? String(achado.nascimento).slice(0, 10) : null;
      return {
        ...l, status: 'casou', como, cliente_id: achado.id, cliente_nome: achado.nome,
        atual, igual: atual === l.data, troca: !!atual && atual !== l.data,
      };
    }
    if (candidatos.length) return { ...l, status: 'ambiguo', candidatos: candidatos.slice(0, 5).map((c) => ({ id: c.id, nome: c.nome, telefone: c.telefone })) };
    return { ...l, status: 'nao_achou' };
  });
}

/** Números da análise para a tela. */
export function resumirAnalise(itens) {
  const r = { total: itens.length, casou: 0, novos: 0, iguais: 0, trocas: 0, ambiguos: 0, nao_achou: 0, invalidas: 0 };
  for (const i of itens) {
    if (i.status === 'casou') { r.casou++; if (i.igual) r.iguais++; else if (i.troca) r.trocas++; else r.novos++; }
    else if (i.status === 'ambiguo') r.ambiguos++;
    else if (i.status === 'nao_achou') r.nao_achou++;
    else r.invalidas++;
  }
  return r;
}

/**
 * O que gravar: só as que casaram, sem repetir cliente, e só troca uma data que
 * já existe se `substituir` estiver marcado.
 */
export function escolherGravacoes(itens, { substituir = false } = {}) {
  const vistos = new Set(), saida = [];
  for (const i of itens) {
    if (i.status !== 'casou' || !i.data || i.igual) continue;
    if (i.troca && !substituir) continue;
    if (vistos.has(i.cliente_id)) continue;
    vistos.add(i.cliente_id);
    saida.push({ cliente_id: i.cliente_id, nascimento: i.data });
  }
  return saida;
}

/* Frases que costumam trazer a data: "meu aniversário é 12/05", "nasci em 3 de maio". */
const RE_GATILHO = /(anivers[a-z]*|nasc[a-z]*|niver|data de nascimento|dt\.? ?nasc)/g;

/**
 * Procura datas de nascimento num texto livre (observação da ficha, do lead ou
 * mensagem do cliente). Só aceita a data que está a até 40 letras da palavra-chave.
 */
export function procurarDatas(texto, { anoAtual = new Date().getFullYear() } = {}) {
  const t = semAcento(String(texto ?? ''));
  const achados = [];
  let g;
  RE_GATILHO.lastIndex = 0;
  while ((g = RE_GATILHO.exec(t))) {
    const janela = t.slice(g.index, g.index + g[0].length + 40);
    const md = primeiraData(janela.slice(g[0].length), anoAtual);
    if (!md) continue;
    const iso = md.iso;
    const ini = Math.max(0, g.index - 30);
    achados.push({ data: iso, trecho: String(texto).slice(ini, g.index + g[0].length + 45).replace(/\s+/g, ' ').trim() });
  }
  return achados;
}

/**
 * Sugestões de aniversário tiradas dos textos (ficha, lead do CRM, conversa).
 * `clientes` = Map id → { id, nome, telefone, nascimento } dos citados.
 * Um por cliente (a ficha vence o lead, que vence a conversa); quem já tem a
 * MESMA data fica de fora.
 */
export function montarSugestoes({ fichas = [], leads = [], mensagens = [] }, clientes = new Map(), opcoes = {}) {
  const porCliente = new Map();
  const add = (cid, fonte, texto, extra = {}) => {
    if (!cid || porCliente.has(cid)) return;
    const achado = procurarDatas(texto, opcoes)[0];
    if (!achado) return;
    const c = clientes.get(cid) || extra.cliente || null;
    if (!c) return;
    const atual = c.nascimento ? String(c.nascimento).slice(0, 10) : null;
    if (atual === achado.data) return;
    porCliente.set(cid, { cliente_id: cid, nome: c.nome, telefone: c.telefone, data: achado.data, trecho: achado.trecho, fonte, atual, troca: !!atual });
  };
  for (const f of fichas) add(f.id, 'ficha', f.observacoes, { cliente: f });
  for (const l of leads) add(l.cliente_id, 'crm', l.observacoes);
  for (const m of mensagens) add(m.conversa?.cliente_id, 'conversa', m.corpo);
  return [...porCliente.values()];
}
