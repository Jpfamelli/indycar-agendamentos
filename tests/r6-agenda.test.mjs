// Rodada 6 (C1) — Agenda ligada ao Orçador e ao Pátio: funções puras (orcador.js) e rotas novas por HTTP
// com banco e porteiro de mentira (mesmo desenho de tests/rodada5-servidor.test.mjs).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as real from '../dados.js';
import { _injetar, server } from '../server.js';
import {
  baseDoOrcador, linkOrcamento, linkNovoOrcamento, resumoDoOrcamento, aprovadoParaAgendar, orcamentoPorAgendamento, veiculoDoOrcamento, numeroDoOrcamento,
} from '../orcador.js';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/* ---------------- puras ---------------- */
test('orcador: endereço só https sem credencial; link abre a rota real #/historico/<id>', () => {
  assert.equal(baseDoOrcador('http://x.com'), 'https://indycar-orcador.netlify.app');
  assert.equal(baseDoOrcador('https://u:p@x.com'), 'https://indycar-orcador.netlify.app');
  assert.equal(baseDoOrcador('https://orc.exemplo.com/qualquer/coisa'), 'https://orc.exemplo.com');
  assert.equal(linkOrcamento(ID(1)), `https://indycar-orcador.netlify.app/#/historico/${ID(1)}`);
  assert.equal(linkOrcamento('lixo'), 'https://indycar-orcador.netlify.app/#/historico');
  assert.equal(numeroDoOrcamento(12), '#0012');
});
test('orcador: "novo orçamento" leva cliente, telefone com 55 e nome limpo', () => {
  assert.equal(linkNovoOrcamento({ cliente_id: ID(2), telefone: '(12) 99182-1234', nome: '  Ana <b>Lima  ' }),
    `https://indycar-orcador.netlify.app/?cliente=${ID(2)}&tel=5512991821234&nome=Ana+bLima`);
  assert.equal(linkNovoOrcamento({ telefone: '123' }), 'https://indycar-orcador.netlify.app/');
  assert.match(linkNovoOrcamento({ telefone: '5512991821234' }), /tel=5512991821234$/);
});
test('orcador: veículo jsonb, resumo e aprovado para agendar', () => {
  assert.deepEqual(veiculoDoOrcamento({ montadora: 'VW', modelo: 'Gol', ano: 2018, placa: 'abc-1d23' }), { texto: 'VW Gol 2018', placa: 'ABC1D23' });
  assert.deepEqual(veiculoDoOrcamento(null), { texto: '', placa: '' });
  const r = resumoDoOrcamento({ id: ID(3), numero: 7, status: 'enviado', total: '1890.5', visualizado_em: '2026-10-21T10:00:00Z', veiculo: { modelo: 'Onix' } });
  assert.equal(r.numero_rotulo, '#0007'); assert.equal(r.tom, 'bp-orange'); assert.equal(r.visto, true); assert.equal(r.total, 1890.5); assert.equal(r.status_rotulo, 'esperando resposta');
  assert.equal(resumoDoOrcamento(null), null);
  const a = aprovadoParaAgendar({ id: ID(4), numero: 9, status: 'aprovado', total: 500, cliente_nome: ' Rui ', cliente_telefone: '12988887777', cliente_id: ID(5), veiculo: { modelo: 'HB20', placa: 'QWE4R56' } });
  assert.equal(a.cliente_nome, 'Rui'); assert.equal(a.cliente_id, ID(5)); assert.equal(a.placa, 'QWE4R56'); assert.match(a.observacao, /Orçamento #0009 aprovado — R\$\s500,00/);
});
test('orcador: com vários orçamentos no horário vale o aprovado', () => {
  const m = orcamentoPorAgendamento([
    { id: ID(10), numero: 1, status: 'recusado', agendamento_id: ID(50) },
    { id: ID(11), numero: 2, status: 'aprovado', agendamento_id: ID(50) },
    { id: ID(12), numero: 3, status: 'enviado', agendamento_id: ID(50) },
    { id: ID(13), numero: 4, status: 'enviado', agendamento_id: null },
  ]);
  assert.deepEqual(Object.keys(m), [ID(50)]);
  assert.equal(m[ID(50)].id, ID(11));
});

/* ---------------- rotas ---------------- */
const PESSOAS = {
  gestor: { id: ID(902), email: 'gestor@teste', papel: 'gestor', ativo: true, apps: ['agenda'] },
  agenda: { id: ID(904), email: 'franklin@teste', papel: 'agenda', ativo: true, apps: ['agenda'] },
};
let base, ligacoes, criados, falhaOrc;
const falso = {
  ...real,
  marcarUltimoAcesso: async () => {}, obterIntegracoes: async () => ({}), obterIaConfig: async () => ({}), templatePorGatilho: async () => null,
  auditar: async () => true,
  orcamentosDosAgendamentos: async (ids) => { if (falhaOrc) throw new Error('fora'); return ids.includes(ID(1)) ? { [ID(1)]: resumoDoOrcamento({ id: ID(20), numero: 5, status: 'aprovado', total: 300 }) } : {}; },
  orcamentosAprovadosSemHorario: async () => { if (falhaOrc) throw new Error('fora'); return [aprovadoParaAgendar({ id: ID(21), numero: 6, status: 'aprovado', total: 100, cliente_nome: 'Bia', cliente_telefone: '12977776666' })]; },
  patioAgora: async () => [{ os_id: ID(30), numero: 31, etapa: 'pronto', etapa_rotulo: 'Pronto', abrir: 'https://indycar-patio.netlify.app/?os=' + ID(30) }],
  ligarOrcamentoAoAgendamento: async (o, a) => { ligacoes.push([o, a]); return true; },
  agendamentoDuplicado: async () => null, obterOuCriarCliente: async () => ID(800),
  criarAgendamento: async (c) => { criados.push(c); return { id: ID(77), ...c }; },
};
const fetchOriginal = globalThis.fetch;
before(async () => {
  globalThis.fetch = async (url, opt) => { if (String(url).startsWith(base)) return fetchOriginal(url, opt); throw new Error('rede proibida no teste: ' + url); };
  _injetar({ dados: falso, usuarioLogado: async (req) => { const t = /Bearer (\S+)/.exec(req.headers.authorization || '')?.[1]; return PESSOAS[t] ? { usuario: { ...PESSOAS[t] } } : { usuario: null, motivo: 'sem_login' }; } });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { globalThis.fetch = fetchOriginal; server.close(); });
beforeEach(() => { ligacoes = []; criados = []; falhaOrc = false; });
async function chamar(quem, metodo, rota, corpo) {
  const r = await fetch(base + rota, { method: metodo, headers: { ...(quem ? { Authorization: `Bearer ${quem}` } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  const texto = await r.text();
  let j = null; try { j = JSON.parse(texto); } catch { /* html */ }
  return { status: r.status, j, h: r.headers, texto };
}

test('GET /api/orcamentos/agendamentos: mapa por horário; id inválido ignorado; sem login 401; recepção 403', async () => {
  const r = await chamar('gestor', 'GET', `/api/orcamentos/agendamentos?ids=${ID(1)},lixo,${ID(2)}`);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.j.itens), [ID(1)]);
  assert.equal(r.j.itens[ID(1)].abrir, `https://indycar-orcador.netlify.app/#/historico/${ID(20)}`);
  assert.equal(r.h.get('cache-control'), 'no-store');
  assert.deepEqual((await chamar('gestor', 'GET', '/api/orcamentos/agendamentos?ids=lixo')).j.itens, {});
  assert.equal((await chamar(null, 'GET', '/api/orcamentos/agendamentos?ids=' + ID(1))).status, 401);
  assert.equal((await chamar('agenda', 'GET', '/api/orcamentos/agendamentos?ids=' + ID(1))).status, 403, 'a recepção só marca presença');
});
test('Orçador fora do ar não derruba a tela: 200 com aviso e lista vazia', async () => {
  falhaOrc = true;
  const a = await chamar('gestor', 'GET', '/api/orcamentos/agendamentos?ids=' + ID(1));
  assert.equal(a.status, 200); assert.deepEqual(a.j.itens, {}); assert.match(a.j.erro, /indispon/i);
  const b = await chamar('gestor', 'GET', '/api/orcamentos/aprovados');
  assert.equal(b.status, 200); assert.deepEqual(b.j.itens, []);
});
test('GET /api/orcamentos/aprovados e /api/patio/agora', async () => {
  const a = await chamar('gestor', 'GET', '/api/orcamentos/aprovados?limite=3');
  assert.equal(a.j.itens[0].cliente_nome, 'Bia'); assert.match(a.j.itens[0].observacao, /#0006/);
  const p = await chamar('gestor', 'GET', '/api/patio/agora');
  assert.equal(p.j.itens[0].numero, 31);
  assert.equal((await chamar('agenda', 'GET', '/api/patio/agora')).status, 403);
});
test('POST /api/agendamentos com orcamento_id: liga o orçamento ao horário novo e não grava o campo no agendamento', async () => {
  const corpo = { cliente_nome: 'Bia', servico: 'Freios', data: real.hoje(), hora: '10:00', telefone: '12977776666', orcamento_id: ID(21) };
  const r = await chamar('gestor', 'POST', '/api/agendamentos', corpo);
  assert.equal(r.status, 200);
  assert.equal(r.j.orcamento_ligado, true);
  assert.deepEqual(ligacoes, [[ID(21), ID(77)]]);
  assert.equal('orcamento_id' in criados[0], false);
});
test('POST /api/agendamentos: orcamento_id inválido é ignorado; sem ele nada muda', async () => {
  await chamar('gestor', 'POST', '/api/agendamentos', { cliente_nome: 'X', servico: 'Y', data: real.hoje(), hora: '11:00', orcamento_id: 'nao-e-uuid' });
  const r = await chamar('gestor', 'POST', '/api/agendamentos', { cliente_nome: 'X', servico: 'Y', data: real.hoje(), hora: '11:30' });
  assert.deepEqual(ligacoes, []);
  assert.equal(r.j.orcamento_ligado, undefined);
});
test('estáticos: arquivo com extensão inexistente é 404 (não index.html); rodada6.js existe; rota sem extensão segue o SPA', async () => {
  const a = await chamar(null, 'GET', '/rodada99.js');
  assert.equal(a.status, 404);
  assert.doesNotMatch(a.h.get('content-type') || '', /html/);
  const b = await chamar(null, 'GET', '/rodada6.js');
  assert.equal(b.status, 200); assert.match(b.h.get('content-type'), /javascript/);
  assert.equal((await chamar(null, 'GET', '/rodada6.css')).status, 200);
  const c = await chamar(null, 'GET', '/alguma-tela');
  assert.equal(c.status, 200); assert.match(c.h.get('content-type'), /html/);
});
