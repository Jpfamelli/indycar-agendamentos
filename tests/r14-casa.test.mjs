// Casa, rodada 14: a primeira tela de cada papel (recepção e mecânico ganham a deles), o sino que abre nas não lidas e a
// abertura mais rápida (configuração pedida cedo, faturamento do mês na memória por 45 s). Sem rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarFaturamento } from '../casa-servidor.js';

await import('../casa/logica.js');
await import('../casa/logica2.js');
await import('../casa/logica5.js');
const L = globalThis.CasaLogica, L5 = globalThis.CasaLogica5;
const CASA = join(dirname(fileURLToPath(import.meta.url)), '..', 'casa');
const ler = (f) => readFileSync(join(CASA, f), 'utf8');
const perfil = (papel, apps) => ({ papel, apps, ativo: true });

const AGORA = new Date('2026-11-24T17:00:00-03:00');
const ag = (hora, status, extra = {}) => ({ data: '2026-11-24', hora: hora + ':00', status, compareceu: 0, ...extra });

test('recepção: horários de hoje, quem já chegou, quem passou da hora e a hora do primeiro', () => {
  const r = L5.agendaDaRecepcao([
    ag('09:00', 'confirmado'), ag('10:00', 'compareceu', { compareceu: 1 }), ag('13:00', 'concluido'), ag('16:50', 'aguardando'),
    ag('18:00', 'confirmado'), ag('08:00', 'cancelado'), ag('11:00', 'nao_veio'), { ...ag('10:00', 'compareceu'), data: '2026-11-23' },
  ], AGORA, '2026-11-24');
  assert.deepEqual(r, { total: 6, chegaram: 2, faltam: 3, atrasados: 1, mais_atrasado: '09:00' }, 'cancelado e outro dia ficam fora; 16:50 ainda está na tolerância de 15 min; "não veio" não é "falta chegar"');
});

test('recepção: lista vazia ou torta nunca quebra e dá zeros', () => {
  assert.deepEqual(L5.agendaDaRecepcao([], AGORA, '2026-11-24'), { total: 0, chegaram: 0, faltam: 0, atrasados: 0, mais_atrasado: null });
  assert.equal(L5.agendaDaRecepcao(null, AGORA, '2026-11-24').total, 0);
  assert.equal(L5.agendaDaRecepcao([null, { data: 'x' }], AGORA, '2026-11-24').total, 0);
});

test('recepção: o herói traz horários, quem chegou e o pátio; o aviso "passou da hora" leva à Agenda', () => {
  const v = L.visao(perfil('agenda', ['agenda', 'patio']));
  assert.equal(v.recepcao, true); assert.equal(v.agenda, false, 'a Agenda dela não vem do banco da equipe');
  const d = { agenda: { total: 5, chegaram: 1, faltam: 3, atrasados: 2, mais_atrasado: '09:30' }, patio: { total: 4, prontos: 0, atrasados: 0, extras_pendentes: 0, lista: [] } };
  const itens = L5.numerosDoDia(d, v);
  assert.deepEqual(itens.map((i) => [i.k, i.n]), [['agenda', 5], ['chegaram', 1], ['patio', 4]]);
  assert.equal(L5.fraseEmTexto(L5.fraseDoDia(itens)), 'Hoje tem 5 horários na Agenda, 1 cliente já chegou e 4 carros no pátio.');
  const a = L.atencao(d, v, L.links()).find((x) => x.k === 'atrasados-hora');
  assert.equal(a.n, 2); assert.equal(a.extra, 'o primeiro era às 09:30'); assert.equal(a.app, 'agenda');
  assert.match(a.texto, /2 clientes passaram da hora e ainda não chegaram/);
  assert.equal(L.atencao({ ...d, agenda: { ...d.agenda, atrasados: 0 } }, v, L.links()).some((x) => x.k === 'atrasados-hora'), false);
});

test('recepção: sem a leitura da Agenda o herói não inventa "nenhum horário" (só deixa a Agenda de fora)', () => {
  const v = L.visao(perfil('agenda', ['agenda', 'patio']));
  const itens = L5.numerosDoDia({ agenda: null, patio: { total: 2 } }, v);
  assert.deepEqual(itens.map((i) => i.k), ['patio']);
});

test('quem não é recepção não ganha o aviso nem o "já chegou" (dono e atendente seguem como na R13)', () => {
  const dono = L.visao(perfil('admin', ['agenda', 'patio']));
  const d = { agenda: { total: 4, chegaram: 2, atrasados: 3 } };
  assert.deepEqual(L5.numerosDoDia(d, dono).map((i) => i.k), ['agenda']);
  assert.equal(L.atencao(d, dono, L.links()).some((x) => x.k === 'atrasados-hora'), false);
});

test('mecânico: os carros dele, pronto primeiro e depois o mais antigo na etapa, com o tom da etapa', () => {
  const agoraMs = Date.parse('2026-11-24T17:00:00-03:00');
  const min = (m) => new Date(agoraMs - m * 60000).toISOString();
  const lista = [
    { id: 'a', placa: 'CCC2C22', veiculo: 'Corolla', nome: 'Carla', etapa: 'diagnostico', etapa_em: min(20), previsao_entrega: null },
    { id: 'b', placa: 'BBB1B11', veiculo: 'HB20', nome: 'Bruno', etapa: 'em_execucao', etapa_em: min(500), previsao_entrega: new Date(agoraMs + 30 * 60000).toISOString() },
    { id: 'c', placa: 'AAA0A00', veiculo: 'Onix', cliente_nome: 'Ana', etapa: 'pronto', etapa_em: min(70), previsao_entrega: null },
  ];
  const r = L5.carrosDoMecanico(lista, agoraMs);
  assert.deepEqual(r.map((c) => c.id), ['c', 'b', 'a']);
  assert.equal(r[0].titulo, 'AAA-0A00 · Onix'); assert.equal(r[0].cliente, 'Ana');
  assert.equal(r[1].tom, 'atrasado', 'em execução há 8 h passa do limite');
  assert.equal(r[2].tom, 'ok');
  assert.deepEqual(L5.carrosDoMecanico(null), []);
  assert.equal(L5.carrosDoMecanico([{ id: 'z', etapa: 'recebido', etapa_em: 'lixo' }], agoraMs)[0].titulo, 'Carro sem placa');
});

test('a tela: o mecânico vê "Seus carros" (sem repetir a lista de atenção); recepção e mecânico não têm a busca', () => {
  const html = ler('index.html'), painel = ler('painel.js'), casa = ler('casa.js'), busca = ler('busca.js');
  assert.match(html, /id="meusCarros"/);
  assert.match(painel, /desenharMeusCarros\(d\)/);
  assert.match(painel, /sec\.hidden = !!V\.soMeusCarros && \(/, 'o mecânico com carros não vê a lista de atenção repetida');
  assert.match(painel, /\/agenda\/api\/agendamentos/, 'a recepção lê a Agenda pela própria Agenda');
  assert.match(casa, /\$\('#bBusca'\)\.hidden = !L\.visao\(perfil\)\.equipe/);
  assert.match(busca, /!C\.visao\(\)\.equipe\) return/);
  assert.equal(L.visao(perfil('mecanico', ['patio'])).equipe, false);
});

test('sino: abre nas não lidas, com Não lidas | Todas, e as não lidas vêm numa leitura só delas', () => {
  const html = ler('index.html'), sino = ler('sino.js');
  assert.match(html, /id="sinoModoNovas"[^>]*aria-pressed="true"/);
  assert.match(html, /id="sinoModoTodas"[^>]*aria-pressed="false"/);
  assert.doesNotMatch(html, /sinoSoNovas/, 'a caixinha "só não lidas" saiu');
  assert.match(sino, /soNovas = true/);
  assert.match(sino, /b\.is\('lida_em', null\)/, 'as não lidas não dependem de estarem entre as 60 mais novas');
  assert.match(sino, /Tudo lido\. Nenhum aviso novo\./);
  assert.match(sino, /Ver também os já lidos/);
});

test('abertura: a configuração do login sai do <head> e casa.js usa essa resposta uma vez', () => {
  const tema = ler('tema.js'), casa = ler('casa.js'), html = ler('index.html');
  assert.match(tema, /__cfgCedo = fetch\('\/api\/central\/config'/);
  assert.match(casa, /const cedo = window\.__cfgCedo; window\.__cfgCedo = null;/);
  assert.ok(html.indexOf('/casa/tema.js') < html.indexOf('/casa/indycar.css'), 'o pedido começa antes dos estilos');
});

/* ---- faturamento do mês na memória ---- */
function bancoDeConta() {
  const n = { contas: 0 };
  const sb = { from: () => { const b = { select: () => b, eq: () => b, or: () => b, order: () => b, range: () => b, then: (ok) => ok({ data: [], error: null }) }; return b; } };
  let falhar = false;
  const VS = { valoresDosFechados: async () => { n.contas += 1; if (falhar) throw new Error('banco'); return new Map(); }, faturamento: () => ({ total: 0, fechados: 0, com_valor: 0, sem_valor: 0 }), fechadoEm: () => 0, fechou: () => false };
  return { n, sb, VS, falhar: (v) => { falhar = v; } };
}
test('faturamento: a conta fica 45 s na memória, pedidos juntos dividem a mesma conta e erro nunca fica guardado', async () => {
  const { n, sb, VS, falhar } = bancoDeConta();
  let t = Date.parse('2026-11-24T17:00:00-03:00');
  const f = criarFaturamento({ quemE: async () => ({ usuario: { id: 'g', papel: 'gestor' } }), sb, VS, agora: () => t });
  const pede = () => f.tratar({ method: 'GET', headers: {} });
  const [a, b] = await Promise.all([pede(), pede()]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(n.contas, 1, 'dois pedidos juntos, uma conta');
  t += 30_000; await pede();
  assert.equal(n.contas, 1, 'com 30 s ainda vale a memória');
  t += 20_000; await pede();
  assert.equal(n.contas, 2, 'passou de 45 s: conta de novo');
  falhar(true); t += 60_000;
  assert.equal((await pede()).status, 502);
  falhar(false);
  assert.equal((await pede()).status, 200, 'depois do erro a conta refaz, não repete o erro');
  assert.equal(n.contas, 4);
});

test('sino: "N tarefas vencidas" repetido só vale o mais novo; os antigos não lidos saem das não lidas', () => {
  const n = (id, tipo, quando, lida) => ({ id, tipo, created_at: quando, lida_em: lida ? quando : null });
  const lista = [n('a', 'tarefas_vencidas', '2026-11-22T10:00:00Z'), n('b', 'tarefas_vencidas', '2026-11-24T10:00:00Z'), n('c', 'tarefas_vencidas', '2026-11-23T10:00:00Z'), n('d', 'tarefas_vencidas', '2026-11-21T10:00:00Z', true),
    n('e', 'espera', '2026-11-20T10:00:00Z'), n('f', 'espera', '2026-11-24T11:00:00Z')];
  assert.deepEqual(L5.avisosSubstituidos(lista).sort(), ['a', 'c'], 'o mais novo (b) fica; o já lido (d) não entra; "espera" é de clientes diferentes e nunca é substituído');
  assert.deepEqual(L5.avisosSubstituidos(null), []);
  assert.ok(ler('sino.js').includes('avisosSubstituidos(lista)'));
});
