// Agenda (rodada 7 / C2, lote 1): "Chegou" abre a ENTRADA PRONTA no Pátio — regras puras, rotas por HTTP e rodada7.js lida de verdade.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
Object.assign(process.env, { SUPABASE_URL: 'http://supabase.falso', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste', SUPABASE_ANON_KEY: 'anon' });
const { linkEntradaPatio, entradaDoChegou, orcamentoParaEntrada } = await import('../patio.js');
const real = await import('../dados.js');
const { _injetar, server } = await import('../server.js');
const { decidirAcesso } = await import('../regras.js');

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const URLP = (s) => new URL(s);

/* ------------------------------ puro: patio.js ------------------------------ */
test('linkEntradaPatio: monta o contrato do Pátio com agendamento e orçamento', () => {
  const u = URLP(linkEntradaPatio({ agendamento_id: ID(1), orcamento_id: ID(2), cliente_id: ID(3), placa: 'abc-1d23', veiculo: 'Onix 1.0', servico: 'Troca de óleo' }));
  assert.equal(u.origin, 'https://indycar-patio.netlify.app');
  assert.equal(u.searchParams.get('entrada'), '1');
  assert.equal(u.searchParams.get('agendamento'), ID(1));
  assert.equal(u.searchParams.get('orcamento'), ID(2));
  assert.equal(u.searchParams.get('cliente'), ID(3));
  assert.equal(u.searchParams.get('placa'), 'ABC1D23');
  assert.equal(u.searchParams.get('carro'), 'Onix 1.0');
});
test('linkEntradaPatio: telefone e nome do cliente NUNCA vão na barra de endereço', () => {
  const l = linkEntradaPatio({ agendamento_id: ID(1), telefone: '12991821234', nome: 'Ana Souza', cliente_nome: 'Ana', tel: '123' });
  assert.ok(!/tel|nome|9918|Ana/i.test(URLP(l).search.replace('entrada', '')), l);
});
test('linkEntradaPatio: id torto, placa torta e texto hostil são descartados', () => {
  const u = URLP(linkEntradaPatio({ agendamento_id: "x' or 1=1", orcamento_id: '../../etc', cliente_id: 'javascript:alert(1)', placa: 'AB', veiculo: '<img src=x onerror=1>Gol' + String.fromCharCode(0), servico: 'a'.repeat(900) }));
  assert.equal(u.searchParams.get('agendamento'), null);
  assert.equal(u.searchParams.get('orcamento'), null);
  assert.equal(u.searchParams.get('cliente'), null);
  assert.equal(u.searchParams.get('placa'), null);
  assert.ok(!/[<>]/.test(u.searchParams.get('carro')), u.searchParams.get('carro'));
  assert.ok(u.searchParams.get('servico').length <= 200);
  assert.equal(u.searchParams.get('entrada'), '1');
});
test('linkEntradaPatio: base só https; lixo cai no endereço do Pátio', () => {
  for (const ruim of ['http://evil.com', 'javascript:alert(1)', 'https://u:p@evil.com', '', null, 'ftp://x', 'https://a.com/x?y']) {
    assert.equal(URLP(linkEntradaPatio({ agendamento_id: ID(1) }, ruim)).origin, 'https://indycar-patio.netlify.app', String(ruim));
  }
  assert.equal(URLP(linkEntradaPatio({}, 'https://patio.teste.app/')).origin, 'https://patio.teste.app');
});
test('orcamentoParaEntrada: só aprovado, enviado ou em aberto; recusado e vencido ficam de fora', () => {
  for (const s of ['aprovado', 'enviado', 'aberto']) assert.ok(orcamentoParaEntrada({ id: ID(5), status: s }), s);
  for (const s of ['recusado', 'expirado', '', undefined]) assert.equal(orcamentoParaEntrada({ id: ID(5), status: s }), null, String(s));
  assert.equal(orcamentoParaEntrada({ id: 'nao-uuid', status: 'aprovado' }), null);
  assert.equal(orcamentoParaEntrada(null), null);
});
test('entradaDoChegou: devolve o link e o orçamento que foi junto (para o recado dizer)', () => {
  const e = entradaDoChegou({ id: ID(1), cliente_id: ID(3), placa: 'GFK3H26', veiculo: 'Corolla', servico: 'Óleo' }, { id: ID(7), status: 'aprovado', numero_rotulo: '#0042', status_rotulo: 'aprovado', total: 1990 });
  assert.equal(URLP(e.link).searchParams.get('orcamento'), ID(7));
  assert.deepEqual(e.orcamento, { id: ID(7), numero_rotulo: '#0042', status: 'aprovado', status_rotulo: 'aprovado', total: 1990 });
  const sem = entradaDoChegou({ id: ID(1) }, { id: ID(7), status: 'recusado' });
  assert.equal(sem.orcamento, null);
  assert.equal(URLP(sem.link).searchParams.get('orcamento'), null);
});

/* ------------------------------ puro: rodada7.js (vm) ------------------------------ */
const ctx = vm.createContext({ globalThis: null, URL });
ctx.globalThis = ctx;
vm.runInContext(readFileSync(new URL('../public/rodada7.js', import.meta.url), 'utf8'), ctx);
const P = ctx.R7Puro;
const arr = (v) => JSON.parse(JSON.stringify(v));
const appDe = (h) => (/indycar-patio\.netlify\.app/.test(h) ? 'patio' : null);

test('rotuloDaEntrada diz quando o orçamento vai junto', () => {
  assert.equal(arr(P.rotuloDaEntrada({ orcamento: { numero_rotulo: '#0042' } })).comOrcamento, true);
  assert.match(P.rotuloDaEntrada({ orcamento: { numero_rotulo: '#0042' } }).titulo, /#0042/);
  assert.equal(P.rotuloDaEntrada({ orcamento: null }).comOrcamento, false);
  assert.equal(P.rotuloDaEntrada(null).texto, 'Dar entrada');
});
test('"Orçar" só aparece quando o carro chegou sem orçamento', () => {
  assert.equal(P.deveOferecerOrcar({ orcamento: null }), true);
  assert.equal(P.deveOferecerOrcar(null), true);
  assert.equal(P.deveOferecerOrcar({ orcamento: { id: ID(1) } }), false);
});
test('linkDeEntradaSeguro: só https do Pátio com entrada=1', () => {
  const ok = 'https://indycar-patio.netlify.app/?entrada=1&agendamento=' + ID(1);
  assert.equal(P.linkDeEntradaSeguro(ok, appDe), ok);
  for (const ruim of ['javascript:alert(1)', 'http://indycar-patio.netlify.app/?entrada=1', 'https://evil.com/?entrada=1', 'https://indycar-patio.netlify.app/?x=1', 'https://u:p@indycar-patio.netlify.app/?entrada=1', '', null, 'data:text/html,x'])
    assert.equal(P.linkDeEntradaSeguro(ruim, appDe), null, String(ruim));
});
test('tempo parado: minutosDesde, tempoCurto e tom por etapa', () => {
  const agora = Date.parse('2026-10-25T15:00:00Z');
  assert.equal(P.minutosDesde('2026-10-25T14:00:00Z', agora), 60);
  assert.equal(P.minutosDesde('2026-10-25T16:00:00Z', agora), null, 'futuro não vale');
  assert.equal(P.minutosDesde('lixo', agora), null);
  assert.deepEqual(['agora', '5 min', '1h15', '2h', '1 d'], [P.tempoCurto(0), P.tempoCurto(5), P.tempoCurto(75), P.tempoCurto(120), P.tempoCurto(1500)]);
  assert.equal(P.tempoCurto(null), '');
  assert.equal(P.tomDaEtapa('pronto', 10), 'ok'); assert.equal(P.tomDaEtapa('pronto', 45), 'aviso'); assert.equal(P.tomDaEtapa('pronto', 200), 'ruim');
  assert.equal(P.tomDaEtapa('em_execucao', 100), 'ok'); assert.equal(P.tomDaEtapa('desconhecida', 9999), 'ok'); assert.equal(P.tomDaEtapa('pronto', null), 'ok');
});
test('ordenarPatio: pronto primeiro (o que espera há mais tempo), depois aguardando aprovação, depois o resto', () => {
  const agora = Date.parse('2026-10-25T15:00:00Z');
  const l = [{ id: 'a', etapa: 'em_execucao', etapa_em: '2026-10-25T10:00:00Z' }, { id: 'b', etapa: 'pronto', etapa_em: '2026-10-25T14:50:00Z' },
    { id: 'c', etapa: 'pronto', etapa_em: '2026-10-25T13:00:00Z' }, { id: 'd', etapa: 'aguardando_aprovacao', etapa_em: '2026-10-25T14:00:00Z' }, { id: 'e', etapa: 'diagnostico', etapa_em: '2026-10-25T14:30:00Z' }];
  assert.deepEqual(arr(P.ordenarPatio(l, agora).map((x) => x.id)), ['c', 'b', 'd', 'a', 'e']);
  assert.deepEqual(arr(P.ordenarPatio(null)), []);
  assert.equal(l[0].id, 'a', 'não mexe na lista original');
});
test('mensagemProntoOS e linkWhatsApp: primeiro nome limpo, carro e placa, telefone válido', () => {
  assert.match(P.mensagemProntoOS({ cliente_nome: 'ana souza', veiculo: 'Onix', placa: 'ABC1D23' }), /^Oi Ana! Seu Onix ABC1D23 está pronto/);
  assert.match(P.mensagemProntoOS({ cliente_nome: '<b>', veiculo: '' }), /^Olá! Seu carro/);
  assert.match(P.linkWhatsApp('(12) 99182-1234', 'oi'), /^https:\/\/wa\.me\/5512991821234\?text=oi$/);
  assert.equal(P.linkWhatsApp('123', 'oi'), null);
  assert.equal(P.linkWhatsApp(null, 'oi'), null);
});
test('avisadoDe: lembra o aviso por um dia e ignora lixo', () => {
  const agora = Date.parse('2026-10-25T15:00:00Z');
  assert.equal(P.avisadoDe({ x: agora - 3600e3 }, 'x', agora), agora - 3600e3);
  assert.equal(P.avisadoDe({ x: agora - 2 * 864e5 }, 'x', agora), null);
  assert.equal(P.avisadoDe({ x: 'lixo' }, 'x', agora), null);
  assert.equal(P.avisadoDe(null, 'x', agora), null);
});

/* ------------------------------ rotas por HTTP ------------------------------ */
const PESSOAS = {
  gestor: { id: ID(902), email: 'g@teste', papel: 'gestor', ativo: true, apps: ['agenda'] },
  atendente: { id: ID(903), email: 'a@teste', papel: 'atendente', ativo: true, apps: ['agenda'] },
  agenda: { id: ID(904), email: 'f@teste', papel: 'agenda', ativo: true, apps: ['agenda'] },
};
let base;
const AG = { id: ID(11), cliente_id: ID(33), cliente_nome: 'Ana Souza', telefone: '12991821234', placa: 'GFK3H26', veiculo: 'Corolla', servico: 'Revisão', data: '2026-10-25', hora: '09:00', status: 'aguardando', compareceu: null, confirmado: false };
const falso = {
  ...real,
  marcarUltimoAcesso: async () => {}, obterIntegracoes: async () => ({}), obterIaConfig: async () => ({}), templatePorGatilho: async () => null,
  obterAgendamento: async (id) => (id === AG.id ? { ...AG } : null),
  atualizarAgendamento: async (id, c) => ({ ...AG, ...c }),
  auditar: async () => {},
  patioDosAgendamentos: async () => ({}),
  linkBaseDoPatio: async () => 'https://indycar-patio.netlify.app',
  orcamentosDosAgendamentos: async (ids) => (ids.includes(AG.id) ? { [AG.id]: { id: ID(77), numero: 42, numero_rotulo: '#0042', status: 'aprovado', status_rotulo: 'aprovado', total: 1990 } } : {}),
  listarEspera: async () => [],
};
before(async () => {
  _injetar({ dados: falso, usuarioLogado: async (req) => { const t = /Bearer (\S+)/.exec(req.headers.authorization || '')?.[1]; return PESSOAS[t] ? { usuario: { ...PESSOAS[t] } } : { usuario: null, motivo: 'sem_login' }; } });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
async function chamar(quem, metodo, rota, corpo) {
  const r = await fetch(base + rota, { method: metodo, headers: { ...(quem ? { Authorization: `Bearer ${quem}` } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* html */ }
  return { status: r.status, j };
}

test('PATCH status "compareceu" devolve a ENTRADA pronta (com o orçamento) e nada de telefone no link', async () => {
  const r = await chamar('atendente', 'PATCH', `/api/agendamentos/${AG.id}/status`, { status: 'compareceu' });
  assert.equal(r.status, 200);
  const u = URLP(r.j.entrada.link);
  assert.equal(u.searchParams.get('entrada'), '1');
  assert.equal(u.searchParams.get('agendamento'), AG.id);
  assert.equal(u.searchParams.get('orcamento'), ID(77));
  assert.ok(!/12991821234|Ana/.test(r.j.entrada.link));
  assert.equal(r.j.entrada.orcamento.numero_rotulo, '#0042');
});
test('PATCH "nao_veio" e "confirmado" não trazem entrada', async () => {
  for (const status of ['nao_veio', 'confirmado', 'cancelado']) {
    const r = await chamar('atendente', 'PATCH', `/api/agendamentos/${AG.id}/status`, { status });
    assert.equal(r.status, 200, status); assert.equal(r.j.entrada, undefined, status);
  }
});
test('recepção (papel agenda) também recebe a entrada ao marcar Chegou', async () => {
  const r = await chamar('agenda', 'PATCH', `/api/agendamentos/${AG.id}/status`, { status: 'compareceu' });
  assert.equal(r.status, 200); assert.ok(r.j.entrada.link.includes('entrada=1'));
});
test('GET entrada-patio: sem login 401; atendente, gestor e recepção 200; id desconhecido 404', async () => {
  const rota = `/api/agendamentos/${AG.id}/entrada-patio`;
  assert.equal((await chamar(null, 'GET', rota)).status, 401);
  for (const q of ['atendente', 'gestor', 'agenda']) { const r = await chamar(q, 'GET', rota); assert.equal(r.status, 200, q); assert.ok(r.j.link.includes(AG.id)); assert.equal(r.j.chegou, false); }
  assert.equal((await chamar('atendente', 'GET', `/api/agendamentos/${ID(999)}/entrada-patio`)).status, 404);
});
test('GET entrada-patio: a resposta não carrega telefone nem nome (serve à recepção)', async () => {
  const r = await chamar('agenda', 'GET', `/api/agendamentos/${AG.id}/entrada-patio`);
  const txt = JSON.stringify(r.j);
  assert.ok(!/12991821234|Ana Souza/.test(txt), txt);
});
test('regras: recepção só passa em GET (nunca POST/PUT) na rota da entrada', () => {
  const p = (metodo) => decidirAcesso({ perfil: PESSOAS.agenda, metodo, rota: `/api/agendamentos/${AG.id}/entrada-patio` });
  assert.equal(p('GET'), null);
  assert.equal(p('POST')?.status, 403); assert.equal(p('PUT')?.status, 403); assert.equal(p('DELETE')?.status, 403);
});
