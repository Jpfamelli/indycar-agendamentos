/* ============================================================
   Banco de mentira para os testes da rodada 8 (frente T2b).
   Imita o cliente do Supabase só no que a jornada, a origem e o rastreio usam:
   from().select/insert/update/delete com filtros, ordem, limite e faixa; rpc().
   Guarda toda consulta feita (para o teste que conta consultas) e devolve os
   mesmos erros que o PostgREST devolve quando a migração ainda não está no banco.
   Não é arquivo de teste (o nome não termina em .test.js).
   ============================================================ */
'use strict';

const DATA = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}|$)/;

/** Valor comparável: instante (ms) para data ISO, número para número, texto para o resto. */
function comparavel(v) {
  if (v == null) return null;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v);
  if (DATA.test(s)) { const t = Date.parse(s); if (Number.isFinite(t)) return t; }
  return s;
}
const igual = (a, b) => comparavel(a) === comparavel(b);

function literal(txt) {
  if (txt === 'null') return null;
  if (txt === 'true') return true;
  if (txt === 'false') return false;
  return txt;
}

function casa(linha, f) {
  const [op, col, val] = f;
  if (op === 'ou') return val.some(termo => casa(linha, termo));
  const a = comparavel(linha[col]);
  if (op === 'eq') return val !== null && a !== null && igual(linha[col], val);
  if (op === 'neq') return a !== null && !igual(linha[col], val);
  if (op === 'is') return val === null ? linha[col] == null : linha[col] === val;
  if (op === 'naoE') return val === null ? linha[col] != null : linha[col] !== val;
  if (op === 'in') return a !== null && val.some(x => igual(linha[col], x));
  if (a === null) return false;
  const b = comparavel(val);
  if (op === 'gt') return a > b;
  if (op === 'gte') return a >= b;
  if (op === 'lt') return a < b;
  if (op === 'lte') return a <= b;
  if (op === 'ilike') return new RegExp('^' + String(val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i').test(String(linha[col]));
  throw new Error('banco-falso: filtro desconhecido ' + op);
}

/** "rascunho.is.null,rascunho.eq.false" → lista de filtros. */
function termosDoOu(expr) {
  return String(expr).split(',').map(parte => {
    const [col, op, ...resto] = parte.trim().split('.');
    const val = literal(resto.join('.'));
    return [op, col, val];
  });
}

const colunasDe = cols => (cols === '*' ? [] : String(cols).split(',').map(c => c.trim()).filter(Boolean));

/**
 * criarBanco({ leads: [...], agendamentos: [...] }, { rpc: { nome: (args, sb) => dado }, colunasAusentes: { leads: ['origem_paga'] }, unicos: { trafego_rastreio: ['codigo'] } })
 * Tabela que não está no objeto não existe (erro de tabela inexistente, como no banco sem a migração).
 */
function criarBanco(tabelas = {}, { rpc = {}, colunasAusentes = {}, unicos = {}, falhas = {} } = {}) {
  const consultas = [];
  const chamadas = [];
  let serie = 0;

  class Consulta {
    constructor(tabela) {
      this.tabela = tabela; this.op = 'select'; this.cols = '*'; this.opts = {}; this.filtros = []; this.ordens = [];
      this.lim = null; this.faixa = null; this.unico = null; this.patch = null; this.novas = null; this.devolver = false;
    }
    select(cols = '*', opts = {}) {
      if (this.op === 'select') { this.cols = cols; this.opts = opts || {}; } else { this.devolver = true; this.cols = cols; }
      return this;
    }
    insert(linhas) { this.op = 'insert'; this.novas = Array.isArray(linhas) ? linhas : [linhas]; return this; }
    update(patch) { this.op = 'update'; this.patch = patch; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.filtros.push(['eq', c, v]); return this; }
    neq(c, v) { this.filtros.push(['neq', c, v]); return this; }
    gt(c, v) { this.filtros.push(['gt', c, v]); return this; }
    gte(c, v) { this.filtros.push(['gte', c, v]); return this; }
    lt(c, v) { this.filtros.push(['lt', c, v]); return this; }
    lte(c, v) { this.filtros.push(['lte', c, v]); return this; }
    in(c, v) { this.filtros.push(['in', c, [...v]]); return this; }
    is(c, v) { this.filtros.push(['is', c, v]); return this; }
    ilike(c, v) { this.filtros.push(['ilike', c, v]); return this; }
    not(c, op, v) {
      if (op !== 'is') throw new Error('banco-falso: not() só aceita "is"');
      this.filtros.push(['naoE', c, v]); return this;
    }
    or(expr) { this.filtros.push(['ou', null, termosDoOu(expr)]); return this; }
    order(c, { ascending = true } = {}) { this.ordens.push([c, ascending]); return this; }
    limit(n) { this.lim = n; return this; }
    range(a, b) { this.faixa = [a, b]; return this; }
    maybeSingle() { this.unico = 'talvez'; return this; }
    single() { this.unico = 'um'; return this; }
    then(ok, falhou) { return this.executar().then(ok, falhou); }

    async executar() {
      consultas.push({ tabela: this.tabela, op: this.op, cols: this.cols, filtros: this.filtros.map(f => [f[0], f[1]]) });
      if (falhas[this.tabela]) return { data: null, error: { message: falhas[this.tabela] }, count: null };
      const linhas = tabelas[this.tabela];
      if (!Array.isArray(linhas)) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${this.tabela}' in the schema cache` }, count: null };
      const ausentes = colunasAusentes[this.tabela] || [];
      const usadas = [...colunasDe(this.cols), ...this.filtros.map(f => f[1]).filter(Boolean), ...Object.keys(this.patch || {})];
      const falta = usadas.find(c => ausentes.includes(c));
      if (falta) return { data: null, error: { code: '42703', message: `column ${this.tabela}.${falta} does not exist` }, count: null };

      const filtra = l => this.filtros.every(f => casa(l, f));
      const projeta = l => {
        const cols = colunasDe(this.cols);
        if (!cols.length) return { ...l };
        const o = {};
        for (const c of cols) o[c] = l[c] === undefined ? null : l[c];
        return o;
      };

      if (this.op === 'insert') {
        const chaves = unicos[this.tabela] || [];
        for (const n of this.novas) {
          const repetida = chaves.find(k => n[k] != null && linhas.some(l => l[k] === n[k]));
          if (repetida) return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint "${this.tabela}_${repetida}_key"` }, count: null };
        }
        const gravadas = this.novas.map(n => ({ id: n.id || `novo-${++serie}`, ...n }));
        linhas.push(...gravadas);
        return this.fechar(this.devolver ? gravadas.map(projeta) : null);
      }
      if (this.op === 'update') {
        const alvo = linhas.filter(filtra);
        for (const l of alvo) Object.assign(l, this.patch);
        return this.fechar(this.devolver ? alvo.map(projeta) : null);
      }
      if (this.op === 'delete') {
        const alvo = linhas.filter(filtra);
        for (const l of alvo) linhas.splice(linhas.indexOf(l), 1);
        return this.fechar(this.devolver ? alvo.map(projeta) : null);
      }

      let saida = linhas.filter(filtra);
      const total = saida.length;
      for (const [c, asc] of [...this.ordens].reverse()) {
        saida = [...saida].sort((x, y) => {
          const a = comparavel(x[c]), b = comparavel(y[c]);
          if (a === b) return 0;
          if (a === null) return 1;
          if (b === null) return -1;
          return (a < b ? -1 : 1) * (asc ? 1 : -1);
        });
      }
      if (this.faixa) saida = saida.slice(this.faixa[0], this.faixa[1] + 1);
      if (this.lim != null) saida = saida.slice(0, this.lim);
      const r = this.fechar(this.opts.head ? null : saida.map(projeta));
      if (this.opts.count) r.count = total;
      return r;
    }

    fechar(data) {
      if (!this.unico) return { data, error: null, count: null };
      const lista = data || [];
      if (lista.length > 1) return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, count: null };
      if (!lista.length && this.unico === 'um') return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, count: null };
      return { data: lista[0] || null, error: null, count: null };
    }
  }

  const sb = {
    tabelas, consultas, chamadas,
    from: tabela => new Consulta(tabela),
    rpc(nome, args = {}) {
      chamadas.push({ nome, args });
      const fn = rpc[nome];
      const promessa = (async () => {
        if (typeof fn !== 'function') return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${nome} in the schema cache` } };
        const r = await fn(args, sb);
        if (r && typeof r === 'object' && !Array.isArray(r) && ('error' in r) && ('data' in r)) return r;
        return { data: r === undefined ? null : r, error: null };
      })();
      return promessa;
    },
    /** Quantas idas ao banco (consultas + funções) desde o último zerar(). */
    idas: () => consultas.length + chamadas.length,
    zerar() { consultas.length = 0; chamadas.length = 0; },
  };
  return sb;
}

module.exports = { criarBanco, comparavel };
