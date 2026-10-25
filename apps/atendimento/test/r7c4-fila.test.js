'use strict';
/* Rodada 7 (C4): a fila sabe quem deu nota ruim, quem tentou manipular a IA e quem é primeiro contato. */
const test = require('node:test');
const assert = require('node:assert');
const { criarSbFalso } = require('./apoio/sb-falso.js');
const { criarR6 } = require('../lib/r6-dados.js');
const R6 = require('../public/r6-regras.js');

const AGORA = new Date('2026-10-26T15:00:00Z');
const iso = (min) => new Date(AGORA.getTime() - min * 60000).toISOString();
const C1 = '33b965a4-65e0-4562-a1b0-952466991b01', C2 = '33b965a4-65e0-4562-a1b0-952466991b02', C3 = '33b965a4-65e0-4562-a1b0-952466991b03';
const K1 = '0bf5de3c-669d-41db-a0f8-6f76343a4901';

function montar() {
  const sb = criarSbFalso({
    conversas: [
      { id: C1, cliente_id: K1, telefone: '12911110001', telefone_e164: '5512911110001', tipo: 'atendimento', desfecho: null, nao_lidas: 1, ultima_mensagem_em: iso(5) },
      { id: C2, cliente_id: null, telefone: '12911110002', telefone_e164: '5512911110002', tipo: 'atendimento', desfecho: null, nao_lidas: 1, ultima_mensagem_em: iso(6) },
      { id: C3, cliente_id: null, telefone: '12911110003', telefone_e164: '5512911110003', tipo: 'atendimento', desfecho: null, nao_lidas: 1, ultima_mensagem_em: iso(7) },
    ],
    whatsapp_mensagens: [
      { id: 'a', conversa_id: C1, direcao: 'entrada', corpo: 'oi', created_at: iso(5) },
      { id: 'b', conversa_id: C2, direcao: 'entrada', corpo: 'Boa tarde, queria saber de alinhamento', created_at: iso(6) },
      { id: 'c', conversa_id: C3, direcao: 'saida', corpo: 'Olá!', created_at: iso(30) },
      { id: 'd', conversa_id: C3, direcao: 'entrada', corpo: 'ok', created_at: iso(7) },
    ],
    patio_os: [], patio_extras: [], orc_orcamentos: [], agendamentos: [],
    patio_avaliacoes: [{ cliente_id: K1, nota: 2, created_at: iso(600), respondido_em: null }, { cliente_id: 'x', nota: 5, created_at: iso(600), respondido_em: null }],
    ia_acoes: [{ conversa_id: C2, tipo: 'bloqueio_manipulacao', created_at: iso(10) }],
  }, { relogio: () => AGORA });
  return criarR6({ sb, agora: () => AGORA, log: () => {} });
}

test('fila: nota ruim sem resposta, manipulação e primeiro contato chegam no contexto', async () => {
  const r = await montar().filaContexto({ forcar: true });
  assert.deepStrictEqual(r.conversas[C1].avaliacao_ruim, { nota: 2 });
  assert.strictEqual(r.conversas[C2].manipulacao, true);
  assert.strictEqual(r.conversas[C2].primeiro_contato, true);
  assert.ok(!r.conversas[C3].primeiro_contato, 'já recebeu resposta nossa');
  assert.ok(!r.conversas[C1].manipulacao);
});

test('fila: a nota ruim sobe a conversa e a manipulação aparece como motivo', async () => {
  const r = await montar().filaContexto({ forcar: true });
  const p1 = R6.pontuarConversa({ id: C1, nao_lidas: 1, ultima_mensagem_em: iso(5), telefone: '1' }, r.conversas[C1], {});
  assert.ok(p1.motivos.some((m) => m.cod === 'avaliacao_ruim'));
  const p2 = R6.pontuarConversa({ id: C2, nao_lidas: 1, ultima_mensagem_em: iso(6), telefone: '2' }, r.conversas[C2], {});
  assert.ok(p2.motivos.some((m) => m.cod === 'manipulacao' || m.cod === 'primeiro_contato'));
});
