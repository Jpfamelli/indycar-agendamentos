'use strict';
/* Rodada 9: "a Meta" (a empresa) e "o Google" nas frases do servidor; antes saía "o Meta trouxe…" e "o Meta inteiro". */
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../ia/decisoes');
const { criarBanco } = require('./apoio/banco-falso');
const { comUuid, PESSOA, TD } = require('./apoio/gestor-apoio');

const ID = 'abababab-aaaa-4aaa-8aaa-abababababab';
function diarioCom(plataforma) {
  const acao = { id: ID, criada_em: '2026-11-18T12:00:00.000Z', origem: 'ia', autor: 'gestor', tipo: 'pausar', titulo: 'Pausar', porque: 'Gasta e não fecha.',
    alvo: { plataforma, nivel: 'campanha', ext: 'c1', nome: 'c1' }, evidencias: { itens: [{ fonte: 'campanhas', dado: 'custo', valor: 50 }], verba: null, risco: 'normal', risco_motivo: null },
    status: 'proposta', decidida_por: null, decidida_em: null, feita_em: null, nota: null, medir_em: '2026-11-26', antes: null, depois: null, veredito: null };
  const sb = comUuid(criarBanco({ trafego_acoes: [acao], trafego_ia_chaves: [] }));
  const campanhas = { async responderLista() { return { estado: { gasto: 'real' }, totais: { gasto: 300, contatos: 7 }, campanhas: [] }; } };
  return D.criarDiario({ sb, fonte: { contatos: async () => ({ itens: [] }) }, campanhas, agora: TD.relogio(), nomesDosPerfis: async () => new Map() });
}

test('diário: pausar se mede na plataforma inteira, "a Meta inteira" e "o Google inteiro"', async () => {
  const meta = await diarioCom('meta').decidir(ID, { decisao: 'aceitar' }, PESSOA);
  assert.equal(meta.antes.base_rotulo, 'a Meta inteira');
  const google = await diarioCom('google').decidir(ID, { decisao: 'aceitar' }, PESSOA);
  assert.equal(google.antes.base_rotulo, 'o Google inteiro');
});

const Radar = require('../radar');
test('radar: "O investimento na Meta caiu", não "no Meta"', () => {
  const dia = (n) => new Date(Date.parse('2026-11-18T12:00:00Z') - n * 86400000).toISOString().slice(0, 10);
  const linha = (n, gasto, o = {}) => ({ data: dia(n), plataforma: 'meta', nivel: 'campanha', campanha_ext: 'c1', gasto, conversoes: 0, fonte: 'api', ...o });
  const linhas = [];
  for (let n = 0; n <= 7; n++) { linhas.push(linha(n, n === 0 ? 0 : 60)); linhas.push(linha(n, 300, { plataforma: 'google' })); }
  const r = Radar.alertasDaConta(linhas, { ontem: dia(0), agora: Date.parse('2026-11-19T12:00:00Z') });
  assert.deepEqual(r.novos.map((a) => a.plataforma), ['meta']);
  assert.match(r.novos[0].mensagem, /^O investimento na Meta caiu de/);
});
