'use strict';
/* R13C — Tráfego lento: a etapa "contatos" (jornada → Ciclo) faz as leituras independentes ao mesmo tempo.
   Banco de mentira com demora por ida; o resultado tem de ser idêntico ao de antes e o tempo cair. */
const test = require('node:test');
const assert = require('node:assert/strict');
const Ciclo = require('../ciclo');
const { criarBanco } = require('./apoio/banco-falso');

const dorme = ms => new Promise(r => setTimeout(r, ms));
function comAtraso(sb, ms) {
  const embrulhar = q => new Proxy(q, {
    get(alvo, k) {
      if (k === 'then') return (ok, falhou) => dorme(ms).then(() => alvo.then(ok, falhou));
      const v = alvo[k];
      return typeof v === 'function' ? (...a) => { const r = v.apply(alvo, a); return r === alvo ? embrulhar(alvo) : r; } : v;
    },
  });
  return { ...sb, from: t => embrulhar(sb.from(t)), rpc: async (...a) => { await dorme(ms); return sb.rpc(...a); } };
}

const L1 = '00000000-0000-4000-8000-000000000001', L2 = '00000000-0000-4000-8000-000000000002';
const banco = (leadDoOrc = null) => criarBanco({
  orc_orcamentos: [{ id: 'o1', numero: 7, lead_id: leadDoOrc, agendamento_id: 'ag2', status: 'aprovado', total: 900, total_aprovado: 800, rascunho: false, created_at: '2026-11-10T10:00:00Z' }],
  agendamentos: [{ id: 'ag1', lead_id: L1, data: '2026-11-12', hora: '08:00', status: 'concluido', valor: 300, created_at: '2026-11-09T10:00:00Z' },
    { id: 'ag2', lead_id: L2, data: '2026-11-13', hora: '09:00', status: 'concluido', valor: null, created_at: '2026-11-09T11:00:00Z' }],
  patio_os: [{ id: 'os1', numero: 1, lead_id: L1, orcamento_id: null, agendamento_id: 'ag1', etapa: 'entregue', created_at: '2026-11-12T10:00:00Z', orcamento_total: 350 },
    { id: 'os2', numero: 2, lead_id: null, orcamento_id: 'o1', agendamento_id: null, etapa: 'pronto', created_at: '2026-11-13T10:00:00Z', orcamento_total: 800 }],
  patio_extras: [{ os_id: 'os1', valor: 40, status: 'aprovado' }, { os_id: 'os2', valor: 60, status: 'pendente' }],
});

test('Ciclo.ler: mesmo resultado (OS, extras e ligação a cada contato) lendo em paralelo', async () => {
  const r = await Ciclo.ler([L1, L2], { sb: banco() });
  assert.equal(r.ok, true);
  assert.deepEqual(r.os.map(o => o.id), ['os1', 'os2'], 'ordem lead → orçamento → agendamento');
  assert.deepEqual(r.extras.map(e => e.os_id).sort(), ['os1', 'os2']);
  assert.deepEqual(r.porLead.get(L1).extras, { aprovado: 40, pendente: 0, recusado: 0, qtd_aprovado: 1 });
  assert.deepEqual(r.porLead.get(L2).os.map(o => o.id), ['os2']);
  assert.deepEqual(r.porLead.get(L2).orcamentos.map(o => o.id), ['o1']);
});

test('Ciclo.ler: no máximo 3 idas em fila (antes eram 4) com orçamento e OS', async () => {
  const LAT = 100, sb = comAtraso(banco(L2), LAT);
  const t0 = Date.now();
  const r = await Ciclo.ler([L1, L2], { sb });
  const ms = Date.now() - t0;
  assert.equal(r.os.length, 2);
  assert.ok(ms < 3.6 * LAT, `${ms} ms com ${LAT} ms por ida: deveria caber em 3 idas`);
});

test('Ciclo.ler: orçamento ligado só ao agendamento ainda acha a OS e os extras dela', async () => {
  const r = await Ciclo.ler([L1, L2], { sb: comAtraso(banco(), 5) });
  assert.deepEqual(r.porLead.get(L2).os.map(o => o.id), ['os2']);
  assert.deepEqual(r.porLead.get(L2).extras, { aprovado: 0, pendente: 60, recusado: 0, qtd_aprovado: 0 });
});

test('Ciclo.ler: Pátio fora deixa os orçamentos valendo e avisa (parcial), como antes', async () => {
  const sb = criarBanco({ orc_orcamentos: [], agendamentos: [], patio_extras: [] }, { falhas: { patio_os: 'caiu' } });
  const r = await Ciclo.ler([L1], { sb });
  assert.equal(r.ok, true);
  assert.equal(r.parcial, 'patio');
  assert.deepEqual(r.os, []);
});
