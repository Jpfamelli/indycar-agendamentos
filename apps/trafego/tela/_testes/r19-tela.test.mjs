/* Rodada 19: sem conta de anúncios, a tela responde com o que existe (todos os contatos, de onde vieram, onde se perde). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { oficina, fraseDaPerda, diasDoPeriodo } from '../js/painel-logica.js';
import { criarMundo, responderHoje as hojeDoMock } from '../_mock/dados.mjs';

const TELA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => fs.readFileSync(path.join(TELA, rel), 'utf8');

const etapa = (id, total, anuncio = 0) => ({ id, total, anuncio });
const HOJE = {
  periodo: { de: '2026-11-13', ate: '2026-11-19' },
  funil: {
    etapas: [etapa('contato', 22, 1), etapa('respondido', null), etapa('orcamento', 7), etapa('agendou', 6, 0), etapa('veio', 4), etapa('oficina', 3), etapa('fechou', 4)],
    nao_fecharam: { total: 3, motivos: [{ id: 'caro', rotulo: 'Achou caro', n: 1 }, { id: 'x', rotulo: 'Parou de responder', n: 2 }, { id: 'z', rotulo: 'Zero', n: 0 }], sem_motivo: 0 },
  },
  numeros: [{ id: 'investido', valor: null, serie: [] }, { id: 'contatos', valor: 22, antes: 18, serie: [2, 3, 0, 5, 4, 6, 2] }],
  origens: [
    { id: 'google', rotulo: 'Anúncio do Google', paga: true, contatos: 1, agendaram: 0, vieram: 0, fecharam: 0, faturado: 0 },
    { id: 'desconhecida', rotulo: 'Ainda não sabemos', paga: null, contatos: 11, agendaram: 3, vieram: 2, fecharam: 2, faturado: null },
    { id: 'indicacao', rotulo: 'Indicação', paga: false, contatos: 10, agendaram: 3, vieram: 2, fecharam: 2, faturado: 760.5 },
    { id: 'meta', rotulo: 'Anúncio da Meta', paga: true, contatos: 0, fecharam: 0, faturado: 0 },
  ],
};

test('oficina: a frase e os três números contam TODOS os contatos, não só os de anúncio', () => {
  const O = oficina(HOJE);
  assert.deepEqual([O.contatos, O.agendaram, O.vieram, O.fecharam, O.de_anuncio, O.antes], [22, 6, 4, 4, 1, 18]);
  assert.equal(O.frase.map((p) => p.numero ?? p.texto).join(''), 'Chegaram 22 contatos, 6 marcaram horário e 4 vieram na oficina.');
  assert.deepEqual(O.etapas.map((e) => [e.rotulo, e.valor]), [['Contatos', 22], ['Marcaram horário', 6], ['Vieram na oficina', 4]]);
  assert.ok(Math.abs(O.etapas[1].passagem - 6 / 22) < 1e-9);
});

test('oficina: origens da maior para a menor, "não sabemos" por último, sem origem zerada e com a parte de cada uma', () => {
  const O = oficina(HOJE);
  assert.deepEqual(O.origens.map((o) => o.id), ['indicacao', 'google', 'desconhecida']);
  assert.ok(Math.abs(O.origens.reduce((s, o) => s + o.parte, 0) - 1) < 1e-9);
  assert.deepEqual([O.origens[0].agendaram, O.origens[0].vieram, O.origens[0].fecharam], [3, 2, 2]);
});

test('oficina: nada inventado. Sem o campo, fica null; sem valor lançado, o faturado é null; passagem impossível não entra', () => {
  const antigo = oficina({ ...HOJE, origens: [{ id: 'meta', rotulo: 'Anúncio da Meta', paga: true, contatos: 3, fecharam: 1, faturado: null }] });
  assert.equal(antigo.origens[0].agendaram, null, 'servidor antigo não manda agendaram por origem');
  assert.equal(antigo.faturado, null);
  assert.equal(oficina(HOJE).faturado, 760.5);
  const O = oficina(HOJE);
  // fecharam (4) cabe em vieram (4): entra com perda zero; a maior perda é a do horário
  assert.deepEqual(O.perdas.map((p) => [p.id, p.perdidos]), [['horario', 16], ['visita', 2], ['servico', 0]]);
  assert.equal(O.maior, 'horario');
  const estranho = oficina({ funil: { etapas: [etapa('contato', 5), etapa('agendou', 1), etapa('veio', 1), etapa('fechou', 3)] } });
  assert.deepEqual(estranho.perdas.map((p) => p.id), ['horario', 'visita'], 'fechou mais gente do que veio: essa passagem não dá para medir');
  assert.equal(oficina({}).contatos, null, 'sem leitura de api/hoje a tela cai na visão antiga');
  assert.equal(oficina(null).origens.length, 0);
});

test('oficina: motivos de quem não fechou em ordem, sem os zerados; dias só quando a série bate com o período', () => {
  const O = oficina(HOJE);
  assert.deepEqual(O.motivos, { total: 3, lista: [{ rotulo: 'Parou de responder', n: 2 }, { rotulo: 'Achou caro', n: 1 }], sem_motivo: 0 });
  assert.deepEqual(O.dias.map((d) => d.contatos), [2, 3, 0, 5, 4, 6, 2]);
  assert.equal(O.dias[0].data, '2026-11-13'); assert.equal(O.dias[6].data, '2026-11-19'); assert.equal(O.dias[0].gasto, null);
  assert.deepEqual(oficina({ ...HOJE, periodo: { de: '2026-11-01', ate: '2026-11-19' } }).dias, [], 'série de outro tamanho não vira gráfico');
  assert.deepEqual(diasDoPeriodo({ de: '2026-02-27', ate: '2026-03-01' }), ['2026-02-27', '2026-02-28', '2026-03-01']);
  assert.deepEqual(diasDoPeriodo({ de: '2026-03-02', ate: '2026-03-01' }), []);
  assert.deepEqual(diasDoPeriodo(null), []);
});

test('fraseDaPerda: diz quantos ficaram no caminho, com singular e plural; sem perda não diz nada', () => {
  assert.equal(fraseDaPerda({ id: 'horario', de: 22, para: 6, perdidos: 16 }), 'De 22 contatos, 16 ainda não marcaram horário.');
  assert.equal(fraseDaPerda({ id: 'visita', de: 1, para: 0, perdidos: 1 }), 'De 1 horário marcado, 1 ainda não veio.');
  assert.equal(fraseDaPerda({ id: 'servico', de: 4, para: 2, perdidos: 2 }), 'De 4 carros que vieram, 2 ainda não fecharam serviço.');
  assert.equal(fraseDaPerda({ id: 'servico', de: 4, para: 4, perdidos: 0 }), null);
  assert.equal(fraseDaPerda(null), null);
});

test('oficina com zero e com um: frase sem número e singular certo', () => {
  assert.equal(oficina({ funil: { etapas: [etapa('contato', 0)] } }).frase[0].texto, 'Nenhum contato novo neste período.');
  const um = oficina({ funil: { etapas: [etapa('contato', 1), etapa('agendou', 1), etapa('veio', 1), etapa('fechou', 0)] } });
  assert.equal(um.frase.map((p) => p.numero ?? p.texto).join(''), 'Chegou 1 contato, 1 marcou horário e 1 veio na oficina.');
});

test('servidor de mentira: cada origem traz agendaram, vieram, nao_fecharam e abertos, e a soma fecha com o funil', () => {
  const d = hojeDoMock(criarMundo('sem_conta'), '7d');
  const O = oficina(d);
  assert.ok(O.contatos > 0 && O.origens.length > 2);
  for (const o of d.origens) for (const k of ['agendaram', 'vieram', 'nao_fecharam', 'abertos']) assert.equal(typeof o[k], 'number', o.id + '.' + k);
  const soma = (k) => d.origens.reduce((s, o) => s + o[k], 0);
  assert.equal(soma('contatos'), O.contatos);
  assert.equal(soma('agendaram'), O.agendaram);
  assert.equal(soma('vieram'), O.vieram);
  assert.equal(soma('fecharam'), O.fecharam);
  for (const o of d.origens) assert.equal(o.fecharam + o.nao_fecharam + o.abertos, o.contatos, o.id);
  assert.equal(O.dias.length, 7);
  assert.equal(O.dias.reduce((s, x) => s + x.contatos, 0), O.contatos, 'o gráfico por dia soma o total do período');
});

test('telas: a Visão geral e a folha usam a visão da oficina só sem conta e sem filtro de fonte; Clientes mostra todos', () => {
  const geral = ler('js/telas/geral.js');
  assert.match(geral, /if \(semConta && !ctx\.fonte\) \{\s+const O = oficina\(hoje\);\s+if \(O\.contatos != null\) return pintarOficina/);
  assert.doesNotMatch(geral, /semConta \? ligarConta\(ctx\) : null/, 'o cartão grande de ligar a conta saiu do meio da tela');
  assert.match(geral, /ligarConta\(ctx, \{ compacto: true \}\)/);
  assert.match(geral, /Custo e retorno: sem dado/);
  const rel = ler('js/telas/relatorios.js');
  assert.match(rel, /const O = semConta && !ctx\.fonte \? oficina\(hoje\) : null;/);
  const cli = ler('js/telas/clientes.js');
  assert.match(cli, /else if \(!mostraTodos\(ctx\)\) q\.set\('paga', '1'\);/);
  assert.match(cli, /sabeSemConta\(ctx\) && !ctx\.fonte && !ctx\.rota\.params\.campanha/);
  assert.match(ler('sw.js'), /indycar-trafego-r19-1/);
  assert.match(ler('css/painel.css'), /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});
