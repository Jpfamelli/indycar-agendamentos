// Banco de mentira para os testes: um PostgREST em memória atrás do fetch global.
// Entende o que o Comunicar usa: select, filtros (eq neq gt gte lt lte in is like ilike not.*), or=(...),
// order, limit/offset, POST (com chave_unica única → 409), PATCH, DELETE, HEAD com count e rpc/<nome>.
// Nunca fala com a rede de verdade: qualquer outra URL falha o teste.
import { randomUUID } from 'node:crypto';

export const URL_FALSA = 'http://banco-falso.local';
process.env.SUPABASE_URL = URL_FALSA;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-falsa-de-teste';

const ehData = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
function comparar(a, b) {
  if (a === null || a === undefined) return -1;
  if (ehData(a) && ehData(String(b))) {
    if (String(a).length > 10 && String(b).length > 10) return Date.parse(a) - Date.parse(b);
    if (String(a).length > 10 !== String(b).length > 10) {
      // data × instante: compara pelo dia
      return String(a).slice(0, 10) < String(b).slice(0, 10) ? -1 : String(a).slice(0, 10) > String(b).slice(0, 10) ? 1 : 0;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof a === 'number' || (!Number.isNaN(Number(a)) && !Number.isNaN(Number(b)) && a !== '' && b !== '')) return Number(a) - Number(b);
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
const valorLiteral = (t) => (t === 'null' ? null : t === 'true' ? true : t === 'false' ? false : t);

function testar(linha, coluna, expr) {
  let neg = false, e = expr;
  if (e.startsWith('not.')) { neg = true; e = e.slice(4); }
  const i = e.indexOf('.');
  const op = e.slice(0, i), arg = e.slice(i + 1);
  const v = linha[coluna];
  let r;
  switch (op) {
    case 'eq': r = v !== null && v !== undefined && String(v) === String(valorLiteral(arg)); break;
    case 'neq': r = !(v !== null && v !== undefined && String(v) === String(arg)); break;
    case 'gt': r = v !== null && v !== undefined && comparar(v, arg) > 0; break;
    case 'gte': r = v !== null && v !== undefined && comparar(v, arg) >= 0; break;
    case 'lt': r = v !== null && v !== undefined && comparar(v, arg) < 0; break;
    case 'lte': r = v !== null && v !== undefined && comparar(v, arg) <= 0; break;
    case 'is': { const l = valorLiteral(arg); r = l === null ? (v === null || v === undefined) : v === l; break; }
    case 'in': {
      const itens = arg.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''));
      r = v !== null && v !== undefined && itens.includes(String(v)); break;
    }
    case 'like': case 'ilike': {
      const pad = arg.replace(/^"|"$/g, '').replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      r = v !== null && v !== undefined && new RegExp(`^${pad}$`, op === 'ilike' ? 'i' : '').test(String(v)); break;
    }
    default: throw new Error(`banco-falso: operador ${op} não suportado`);
  }
  return neg ? !r : r;
}

function filtrar(linhas, params) {
  let r = linhas;
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    if (k === 'or') {
      const partes = v.replace(/^\(|\)$/g, '').split(/,(?=[a-z_0-9]+\.)/);
      r = r.filter((l) => partes.some((p) => { const j = p.indexOf('.'); return testar(l, p.slice(0, j), p.slice(j + 1)); }));
      continue;
    }
    r = r.filter((l) => testar(l, k, v));
  }
  return r;
}
function ordenar(linhas, ordem) {
  if (!ordem) return linhas;
  const regras = ordem.split(',').map((x) => { const [c, ...resto] = x.split('.'); return { c, desc: resto.includes('desc'), nullsFirst: resto.includes('nullsfirst') }; });
  return [...linhas].sort((a, b) => {
    for (const { c, desc } of regras) {
      const x = a[c], y = b[c];
      if ((x === null || x === undefined) && (y === null || y === undefined)) continue;
      if (x === null || x === undefined) return desc ? -1 : 1;
      if (y === null || y === undefined) return desc ? 1 : -1;
      const d = comparar(x, y);
      if (d) return desc ? -d : d;
    }
    return 0;
  });
}
function projetar(linha, select) {
  if (!select || select === '*' || select.includes('(')) return { ...linha };
  const out = {};
  for (const c of select.split(',')) out[c.trim()] = linha[c.trim()] ?? null;
  return out;
}

/** tabelas = { nome: [linhas] } (referências vivas: o teste lê o que o código gravou). rpcs = { nome: (args) => valor }. */
export function instalarBancoFalso(tabelas = {}, { rpcs = {}, unicas = { posvenda_envios: ['chave_unica'] } } = {}) {
  const original = globalThis.fetch;
  const log = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url));
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return original(url, opts); // o próprio servidor de teste
    if (!String(url).startsWith(URL_FALSA)) throw new Error(`banco-falso: rede de verdade bloqueada (${u.origin})`);
    const nome = u.pathname.replace('/rest/v1/', '');
    const metodo = opts.method || 'GET';
    log.push({ metodo, nome, consulta: u.search });
    const resp = (status, corpo, cab = {}) => new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...cab } });
    if (nome.startsWith('rpc/')) {
      const f = rpcs[nome.slice(4)];
      return resp(200, f ? await f(opts.body ? JSON.parse(opts.body) : {}) : null);
    }
    const tab = (tabelas[nome] ||= []);
    const params = [...u.searchParams];
    const get = (k) => u.searchParams.get(k);
    if (metodo === 'GET' || metodo === 'HEAD') {
      let r = ordenar(filtrar(tab, params), get('order'));
      const total = r.length;
      const off = Number(get('offset')) || 0, lim = get('limit') ? Number(get('limit')) : r.length;
      r = r.slice(off, off + lim);
      if (metodo === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': `0-0/${total}` } });
      return resp(200, r.map((l) => projetar(l, get('select'))));
    }
    if (metodo === 'POST') {
      const novas = JSON.parse(opts.body);
      const criadas = [];
      for (const n of Array.isArray(novas) ? novas : [novas]) {
        for (const col of unicas[nome] || []) {
          if (n[col] !== null && n[col] !== undefined && tab.some((l) => l[col] === n[col])) return resp(409, { message: 'duplicate key value violates unique constraint' });
        }
        const linha = { id: randomUUID(), created_at: new Date().toISOString(), ...n };
        // o gatilho do banco que preenche os_id/orcamento_id pela chave
        const m = /^orcamento:orc:([0-9a-f-]{36})/i.exec(linha.chave_unica || ''); if (m && !linha.orcamento_id) linha.orcamento_id = m[1];
        const o = /^(?:patio_[a-z_]+:|[a-z_]+:patio:|avaliacao:patio:)([0-9a-f-]{36})/i.exec(linha.chave_unica || ''); if (o && !linha.os_id) linha.os_id = o[1];
        tab.push(linha); criadas.push(linha);
      }
      return resp(201, criadas.map((l) => projetar(l, get('select'))));
    }
    if (metodo === 'PATCH') {
      const campos = JSON.parse(opts.body);
      const alvo = filtrar(tab, params);
      for (const l of alvo) Object.assign(l, campos);
      return resp(200, alvo.map((l) => projetar(l, get('select'))));
    }
    if (metodo === 'DELETE') {
      const alvo = filtrar(tab, params);
      for (const l of alvo) tab.splice(tab.indexOf(l), 1);
      return resp(200, alvo);
    }
    return resp(405, { message: 'método' });
  };
  return { tabelas, log, restaurar() { globalThis.fetch = original; } };
}
