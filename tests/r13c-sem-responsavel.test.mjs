// R13C — "contatos sem responsável": a Casa e o CRM contam com a MESMA regra (etapa em aberto e ninguém cuidando,
// de qualquer data) e o número da Casa abre /crm/?ver=sem-responsavel, que mostra a mesma lista.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../casa/logica.js');
const L = globalThis.CasaLogica;
const require = createRequire(import.meta.url);
const U = require('../apps/crm/public/crm-utils.js');
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (f) => readFileSync(join(RAIZ, f), 'utf8');

const P = '11111111-1111-4111-8111-111111111111';
const amostra = [
  { id: 1, status: 'novo', responsavel_id: null, created_at: '2025-01-01T10:00:00Z' },   // antigo: conta (qualquer data)
  { id: 2, status: 'contato', responsavel_id: null, created_at: '2026-11-21T10:00:00Z' },
  { id: 3, status: 'orcamento', responsavel_id: null },
  { id: 4, status: 'agendado', responsavel_id: null },
  { id: 5, status: 'em_servico', responsavel_id: null },
  { id: 6, status: 'concluido', responsavel_id: null },   // fechado: não conta
  { id: 7, status: 'perdido', responsavel_id: null },     // fechado: não conta
  { id: 8, status: 'novo', responsavel_id: P },           // tem dono: não conta
];

/** Banco de mentira só para a contagem da Casa: guarda os filtros e conta como o PostgREST. */
function sbFalso(linhas) {
  const pedido = { filtros: [] };
  const q = {
    select(cols, opts) { pedido.select = [cols, opts]; return q; },
    is(c, v) { pedido.filtros.push(['is', c, v]); return q; },
    in(c, v) { pedido.filtros.push(['in', c, [...v]]); return q; },
    then(ok) {
      const casa = (l) => pedido.filtros.every(([op, c, v]) => (op === 'is' ? (l[c] ?? null) === v : v.includes(l[c])));
      return Promise.resolve({ data: null, error: null, count: linhas.filter(casa).length }).then(ok);
    },
  };
  return { pedido, from(t) { pedido.tabela = t; return q; } };
}

test('a Casa usa exatamente as etapas em aberto do CRM', () => {
  assert.deepEqual([...L.ETAPAS_ABERTAS_CRM], U.ABERTAS);
});

test('a contagem da Casa dá o mesmo número que o filtro do CRM, com os mesmos contatos', async () => {
  const sb = sbFalso(amostra);
  const casa = await L.contarSemResponsavel(sb);
  const crm = amostra.filter(U.semResponsavelAberto).length;
  const listaDoCrm = amostra.filter((l) => U.filtroEtapa(l, 'abertos') && U.filtroResponsavel(l, 'sem', null)).length;
  assert.equal(casa, 5);
  assert.equal(crm, 5);
  assert.equal(listaDoCrm, 5, '/crm/?ver=sem-responsavel mostra a mesma lista');
  assert.equal(sb.pedido.tabela, 'leads');
  assert.deepEqual(sb.pedido.select, ['id', { count: 'exact', head: true }], 'só conta, não baixa contato nenhum');
});

test('contagem que falha vira null (a Casa esconde o número em vez de mostrar outro)', async () => {
  assert.equal(await L.contarSemResponsavel({ from() { throw new Error('rede'); } }), null);
  const comErro = { from: () => ({ select() { return this; }, is() { return this; }, in() { return this; }, then: (ok) => Promise.resolve({ error: { message: 'x' }, count: null }).then(ok) }) };
  assert.equal(await L.contarSemResponsavel(comErro), null);
});

test('o aviso da Casa leva a /crm/?ver=sem-responsavel e usa o número com a regra do CRM', () => {
  const l = L.links({ ...L.bases(), crm: '/crm/' });
  assert.equal(l.crmSemResponsavel(), '/crm/?ver=sem-responsavel');
  const v = L.visao({ papel: 'admin', ativo: true, apps: [] });
  const r = L.atencao({ leads: { novos_sem_dono: 0, sem_dono: 565 } }, v, l, Date.now());
  const item = r.find((x) => x.k === 'leads');
  assert.equal(item.url, '/crm/?ver=sem-responsavel');
  assert.match(item.texto, /^565 contatos sem responsável$/);
  assert.equal(L.atencao({ leads: { novos_sem_dono: 3, sem_dono: null } }, v, l, Date.now()).find((x) => x.k === 'leads'), undefined,
    'sem a contagem do CRM, a Casa não mostra o número velho de "novos dos últimos 7 dias"');
});

test('adaptarAgora leva a contagem do CRM (sem_dono) para o desenho', () => {
  assert.equal(L.adaptarAgora({}, { leads: { sem_dono: 7 } }).leads.sem_dono, 7);
  assert.equal(L.adaptarAgora({}, {}).leads.sem_dono, null);
});

test('o CRM abre ?ver=sem-responsavel em "Em aberto" + "sem responsável", e a Casa pede a contagem em paralelo', () => {
  assert.match(ler('apps/crm/public/r13.js'), /'sem-responsavel': \{resp: 'sem', status: 'abertos'\}/);
  assert.match(ler('apps/crm/public/app.js'), /opt\('abertos', 'Em aberto/);
  assert.match(ler('casa/painel.js'), /L\.contarSemResponsavel\(C\.sb\)/);
  assert.equal(U.filtroEtapa({ status: 'concluido' }, 'abertos'), false);
  assert.equal(U.filtroEtapa({ status: 'concluido' }, ''), true);
  assert.equal(U.filtroEtapa({ status: 'novo' }, 'novo'), true);
});
