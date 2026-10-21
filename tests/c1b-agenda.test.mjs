// Agenda (rodada 6, C1b): lembretes ligados ao Comunicar, encaixe com horários livres reais, rotas novas por HTTP
// (banco falso) e a fila do Comunicar simulada em memória (nada vai ao Supabase de verdade).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://supabase.falso', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste', SUPABASE_ANON_KEY: 'anon' });
const { quandoRelativo, textoDoLembrete, situacaoDoLembrete, chaveDoLembrete, validadeDoLembrete, resumoDosLembretes, instanteDoHorario } = await import('../lembretes.js');
const { casaComPreferencia, candidatosDaEspera } = await import('../horarios.js');
const real = await import('../dados.js');
const { _injetar, server } = await import('../server.js');

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AGORA = Date.parse('2026-10-21T15:00:00Z');   // quarta 12h em Taubaté
const HOJE = '2026-10-21';
const ag = (o = {}) => ({ id: ID(1), data: '2026-10-22', hora: '14:00', status: 'aguardando', telefone: '12991821234', cliente_nome: 'Ana Souza', servico: 'Revisão', veiculo: 'Onix', placa: 'ABC1D23', cliente_id: ID(50), ...o });
const CFG = { ativo_lembrete: true, horas_lembrete: 20, pausa_geral: false };

test('quando relativo: hoje, amanhã e dia da semana com data', () => {
  assert.equal(quandoRelativo('2026-10-21', '14:00:00', HOJE), 'hoje às 14:00');
  assert.equal(quandoRelativo('2026-10-22', '09:30', HOJE), 'amanhã às 09:30');
  assert.equal(quandoRelativo('2026-10-24', '08:00', HOJE), 'sábado (24/10) às 08:00');
  assert.equal(quandoRelativo('2026-10-24', '', HOJE), 'sábado (24/10)');
});
test('texto do lembrete usa o modelo do Comunicar e cai num padrão quando não há modelo', () => {
  const t = textoDoLembrete('Oi {primeiro_nome}! {servico} {quando} no {carro} {placa}.', ag(), HOJE);
  assert.equal(t, 'Oi Ana! Revisão amanhã às 14:00 no Onix ABC1D23.');
  assert.match(textoDoLembrete(null, ag(), HOJE), /Oi Ana! Lembrete da IndyCar: seu horário para Revisão é amanhã às 14:00/);
  assert.equal(textoDoLembrete('{coisa_inexistente}ok', ag(), HOJE), 'ok');
  assert.match(textoDoLembrete('Oi {primeiro_nome}', ag({ cliente_nome: '' }), HOJE), /^Oi$/);
});
test('situação: automático ligado e longe do horário "sai sozinho", com a hora exata (20 h antes)', () => {
  const s = situacaoDoLembrete({ a: ag(), cfg: CFG, agora: AGORA });
  assert.equal(s.codigo, 'agendado'); assert.equal(s.podeMandar, true);
  assert.equal(s.saiEm, instanteDoHorario('2026-10-22', '14:00') - 20 * 3600_000);
});
test('situação: automático desligado avisa e ainda deixa mandar à mão', () => {
  const s = situacaoDoLembrete({ a: ag(), cfg: { ...CFG, ativo_lembrete: false }, agora: AGORA });
  assert.equal(s.codigo, 'automatico_desligado'); assert.equal(s.podeMandar, true); assert.match(s.motivo, /desligado/);
});
test('situação: sem telefone, cliente que pediu para parar e pausa geral não deixam mandar', () => {
  assert.equal(situacaoDoLembrete({ a: ag({ telefone: '' }), cfg: CFG, agora: AGORA }).podeMandar, false);
  assert.equal(situacaoDoLembrete({ a: ag({ telefone: '123' }), cfg: CFG, agora: AGORA }).codigo, 'sem_telefone');
  const n = situacaoDoLembrete({ a: ag(), cfg: CFG, cliente: { aceita_mensagens: false }, agora: AGORA });
  assert.deepEqual([n.codigo, n.podeMandar], ['nao_aceita', false]);
  const p = situacaoDoLembrete({ a: ag(), cfg: { ...CFG, pausa_geral: true }, agora: AGORA });
  assert.deepEqual([p.codigo, p.podeMandar], ['pausa_geral', false]);
});
test('situação: enviado, na fila, falhou, pulado e as respostas do cliente', () => {
  const um = (envio) => situacaoDoLembrete({ a: ag(), envio, cfg: CFG, agora: AGORA });
  assert.deepEqual([um({ status: 'enviado' }).codigo, um({ status: 'enviado' }).podeMandar], ['enviado', false]);
  assert.equal(um({ status: 'pendente' }).codigo, 'na_fila');
  const f = um({ status: 'falhou', erro: 'sem sinal' });
  assert.deepEqual([f.codigo, f.podeMandar, f.motivo], ['falhou', true, 'sem sinal']);
  assert.match(um({ status: 'pulado', motivo_pulado: 'janela fechada' }).rotulo, /janela fechada/);
  assert.equal(um({ status: 'respondido', resposta_tipo: 'positiva' }).codigo, 'respondeu_sim');
  assert.equal(um({ status: 'respondido', resposta_tipo: 'negativa' }).tom, 'ruim');
  assert.equal(um({ status: 'respondido', resposta_tipo: 'parar' }).codigo, 'parar');
});
test('situação: horário que já teve desfecho ou já passou não tem lembrete', () => {
  assert.equal(situacaoDoLembrete({ a: ag({ status: 'concluido' }), cfg: CFG, agora: AGORA }).codigo, 'encerrado');
  assert.equal(situacaoDoLembrete({ a: ag({ compareceu: true }), cfg: CFG, agora: AGORA }).codigo, 'encerrado');
  assert.equal(situacaoDoLembrete({ a: ag({ data: '2026-10-21', hora: '09:00' }), cfg: CFG, agora: AGORA }).codigo, 'passou');
});
test('chave e validade: o 1º lembrete usa a chave do gerador do Comunicar; reenvio ganha sufixo por hora', () => {
  assert.equal(chaveDoLembrete(ID(1)), `lembrete:${ID(1)}`);
  assert.equal(chaveDoLembrete(ID(1), { reenvio: true, agora: 7200_000 }), `lembrete:${ID(1)}:r2`);
  assert.equal(chaveDoLembrete(ID(1), { reenvio: true, agora: 7200_000 + 1800_000 }), `lembrete:${ID(1)}:r2`, 'clique duplo na mesma hora não duplica');
  assert.equal(validadeDoLembrete(ag()), '2026-10-22T17:30:00.000Z');
});
test('resumo dos lembretes do dia conta cada situação', () => {
  const s = (codigo, podeMandar = false) => ({ situacao: { codigo, podeMandar } });
  const r = resumoDosLembretes([s('enviado'), s('respondeu_sim'), s('na_fila'), s('sem_telefone'), s('parar'), s('falhou', true), s('agendado', true), s('automatico_desligado', true)]);
  assert.deepEqual(r, { total: 8, enviados: 1, respondeu: 1, na_fila: 1, sem_telefone: 1, bloqueados: 1, pendentes: 2, falhou: 1, podeMandar: 3 });
});

test('preferência da espera: manhã, tarde, começo, fim do dia e sábado', () => {
  assert.equal(casaComPreferencia('Manhã', '09:30', '2026-10-22'), true);
  assert.equal(casaComPreferencia('Manhã', '12:00', '2026-10-22'), false);
  assert.equal(casaComPreferencia('Tarde', '12:00', '2026-10-22'), true);
  assert.equal(casaComPreferencia('Começo do dia', '10:00', '2026-10-22'), true);
  assert.equal(casaComPreferencia('Começo do dia', '10:30', '2026-10-22'), false);
  assert.equal(casaComPreferencia('Fim do dia', '15:00', '2026-10-22'), true);
  assert.equal(casaComPreferencia('Fim do dia', '14:30', '2026-10-22'), false);
  assert.equal(casaComPreferencia('Sábado', '09:00', '2026-10-24'), true);
  assert.equal(casaComPreferencia('Sábado', '09:00', '2026-10-23'), false);
  assert.equal(casaComPreferencia('Qualquer horário', '09:00', '2026-10-23'), true);
  assert.equal(casaComPreferencia(null, '09:00', '2026-10-23'), true);
  assert.equal(casaComPreferencia('Tarde', 'lixo', '2026-10-23'), false);
});
test('candidatos da espera: respeita preferência e janela de datas, no máximo 3 por dia e 6 no total', () => {
  const dia = (data, horas, aberto = true) => ({ data, aberto, horarios: horas.map((h) => ({ hora: h, consultores_livres: [ID(7)] })) });
  const dias = [dia('2026-10-22', ['08:00', '09:00', '09:30', '10:00', '14:00']), dia('2026-10-23', ['08:30', '15:00'], true), dia('2026-10-25', ['09:00'], false), dia('2026-10-26', ['09:00', '16:00'])];
  const manha = candidatosDaEspera({ dias, preferencia: 'Manhã' });
  assert.deepEqual(manha.map((c) => c.data + ' ' + c.hora), ['2026-10-22 08:00', '2026-10-22 09:00', '2026-10-22 09:30', '2026-10-23 08:30', '2026-10-26 09:00']);
  assert.equal(manha[0].consultor_id, ID(7));
  const janela = candidatosDaEspera({ dias, preferencia: 'Tarde', de: '2026-10-23', ate: '2026-10-25' });
  assert.deepEqual(janela.map((c) => c.data + ' ' + c.hora), ['2026-10-23 15:00']);
  assert.equal(candidatosDaEspera({ dias, max: 2 }).length, 2);
  assert.deepEqual(candidatosDaEspera({}), []);
});

/* ---------------- fila do Comunicar em memória (PostgREST falso) ---------------- */
let envios, cfgComunicar, clientes, fetchOriginal;
const nextId = (() => { let n = 900; return () => ID(++n); })();
function postgrest(url, opt = {}) {
  const u = new URL(url);
  const tabela = u.pathname.replace('/rest/v1/', '');
  const metodo = (opt.method || 'GET').toUpperCase();
  const q = u.searchParams;
  const resp = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
  const eq = (k) => (q.get(k) || '').replace(/^eq\./, '');
  if (tabela === 'posvenda_config') return resp([cfgComunicar]);
  if (tabela === 'clientes') return resp(clientes);
  if (tabela === 'posvenda_envios') {
    if (metodo === 'GET') {
      let l = envios.slice();
      if (q.get('tipo')) l = l.filter((e) => e.tipo === eq('tipo'));
      if (q.get('chave_unica')) l = l.filter((e) => e.chave_unica === decodeURIComponent(eq('chave_unica')));
      if (q.get('agendamento_id')) { const ids = q.get('agendamento_id').replace(/^in\.\(|\)$/g, '').split(','); l = l.filter((e) => ids.includes(e.agendamento_id)); }
      return resp(l.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));
    }
    if (metodo === 'POST') { const b = JSON.parse(opt.body); const novas = (Array.isArray(b) ? b : [b]).map((c) => ({ id: nextId(), created_at: new Date().toISOString(), ...c })); envios.push(...novas); return resp(novas, 201); }
    if (metodo === 'PATCH') { const id = eq('id'); const e = envios.find((x) => x.id === id); if (e) Object.assign(e, JSON.parse(opt.body)); return resp(e ? [e] : []); }
  }
  return resp([]);
}
beforeEach(() => {
  envios = []; clientes = [{ id: ID(50), aceita_mensagens: true }];
  cfgComunicar = { ativo_lembrete: true, horas_lembrete: 20, pausa_geral: false, msg_lembrete: 'Oi {primeiro_nome}! {servico} {quando}.' };
});
fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, opt) => (String(url).startsWith('http://supabase.falso') ? postgrest(String(url), opt) : fetchOriginal(url, opt));

test('enfileirar lembrete: entra na fila com a chave do Comunicar, texto do modelo e validade', async () => {
  const r = await real.enfileirarLembrete(ag(), { id: ID(9), email: 'g@x' }, { hojeIso: HOJE, agora: AGORA });
  assert.equal(r.ok, true);
  assert.equal(envios.length, 1);
  const e = envios[0];
  assert.equal(e.tipo, 'lembrete'); assert.equal(e.status, 'pendente'); assert.equal(e.chave_unica, `lembrete:${ID(1)}`);
  assert.equal(e.corpo, 'Oi Ana! Revisão amanhã às 14:00.'); assert.equal(e.telefone, '12991821234'); assert.match(e.criado_por, /^agenda \(g@x\)$/);
  assert.equal(e.expira_em, '2026-10-22T17:30:00.000Z');
});
test('enfileirar lembrete: o segundo clique não duplica', async () => {
  await real.enfileirarLembrete(ag(), null, { hojeIso: HOJE, agora: AGORA });
  const r = await real.enfileirarLembrete(ag(), null, { hojeIso: HOJE, agora: AGORA });
  assert.equal(r.ok, true); assert.equal(r.repetido, true);
  assert.equal(envios.length, 1);
});
test('enfileirar lembrete: já enviado pede confirmação; com reenviar sai com chave nova', async () => {
  envios.push({ id: ID(800), agendamento_id: ID(1), tipo: 'lembrete', status: 'enviado', chave_unica: `lembrete:${ID(1)}`, created_at: '2026-10-21T10:00:00Z' });
  const a = await real.enfileirarLembrete(ag(), null, { hojeIso: HOJE, agora: AGORA });
  assert.equal(a.ok, false); assert.equal(a.jaEnviado, true); assert.equal(envios.length, 1);
  const b = await real.enfileirarLembrete(ag(), null, { reenviar: true, hojeIso: HOJE, agora: AGORA });
  assert.equal(b.ok, true); assert.equal(b.reenvio, true); assert.equal(envios.length, 2);
  assert.match(envios[1].chave_unica, new RegExp(`^lembrete:${ID(1)}:r\\d+$`));
  const c = await real.enfileirarLembrete(ag(), null, { reenviar: true, hojeIso: HOJE, agora: AGORA });
  assert.equal(c.repetido, true); assert.equal(envios.length, 2, 'clique duplo no reenvio não duplica');
});
test('enfileirar lembrete: falhou/pulado renasce com o texto de agora, sem criar linha nova', async () => {
  envios.push({ id: ID(801), agendamento_id: ID(1), tipo: 'lembrete', status: 'falhou', erro: 'x', chave_unica: `lembrete:${ID(1)}`, created_at: '2026-10-21T10:00:00Z' });
  const r = await real.enfileirarLembrete(ag(), null, { hojeIso: HOJE, agora: AGORA });
  assert.equal(r.ok, true); assert.equal(r.reativado, true);
  assert.equal(envios.length, 1); assert.equal(envios[0].status, 'pendente'); assert.equal(envios[0].erro, null); assert.equal(envios[0].tentativas, 0);
});
test('enfileirar lembrete: respeita telefone, opt-out, pausa geral e horário encerrado (nada entra na fila)', async () => {
  assert.equal((await real.enfileirarLembrete(ag({ telefone: '' }), null, { hojeIso: HOJE, agora: AGORA })).ok, false);
  clientes = [{ id: ID(50), aceita_mensagens: false }];
  const r = await real.enfileirarLembrete(ag(), null, { hojeIso: HOJE, agora: AGORA });
  assert.equal(r.ok, false); assert.match(r.motivo, /não receber mensagem/);
  clientes = [{ id: ID(50), aceita_mensagens: true }];
  cfgComunicar.pausa_geral = true;
  assert.match((await real.enfileirarLembrete(ag(), null, { hojeIso: HOJE, agora: AGORA })).motivo, /pausa geral/);
  cfgComunicar.pausa_geral = false;
  assert.equal((await real.enfileirarLembrete(ag({ status: 'concluido' }), null, { hojeIso: HOJE, agora: AGORA })).ok, false);
  assert.equal(envios.length, 0);
});
test('enfileirar lembrete: automático desligado não impede o envio manual', async () => {
  cfgComunicar.ativo_lembrete = false;
  const r = await real.enfileirarLembrete(ag(), null, { hojeIso: HOJE, agora: AGORA });
  assert.equal(r.ok, true); assert.equal(envios.length, 1);
});
test('lembrete respondido (cliente disse que vem) não é cutucado de novo', async () => {
  envios.push({ id: ID(802), agendamento_id: ID(1), tipo: 'lembrete', status: 'respondido', resposta_tipo: 'positiva', chave_unica: `lembrete:${ID(1)}`, created_at: '2026-10-21T10:00:00Z' });
  const r = await real.enfileirarLembrete(ag(), null, { hojeIso: HOJE, agora: AGORA });
  assert.equal(r.ok, false); assert.equal(envios.length, 1);
});

/* ---------------- rotas ---------------- */
const PESSOAS = {
  gestor: { id: ID(902), email: 'gestor@teste', papel: 'gestor', ativo: true, apps: ['agenda'] },
  atendente: { id: ID(903), email: 'at@teste', papel: 'atendente', ativo: true, apps: ['agenda'] },
  agenda: { id: ID(904), email: 'franklin@teste', papel: 'agenda', ativo: true, apps: ['agenda'] },
};
let base, auditorias;
const AMANHA = '2026-10-22';
const falso = {
  ...real,
  marcarUltimoAcesso: async () => {}, obterIntegracoes: async () => ({}), obterIaConfig: async () => ({}), templatePorGatilho: async () => null,
  auditar: async (...a) => { auditorias.push(a); return true; },
  obterAgendamento: async (id) => (id === ID(1) ? ag({ data: '2099-12-31' }) : id === ID(2) ? ag({ id: ID(2), data: '2099-12-31', telefone: '' }) : null),
  listarAgendamentos: async () => [ag({ data: AMANHA }), ag({ id: ID(2), data: AMANHA, telefone: '' })],
  obterEspera: async (id) => (id === ID(60) ? { id, status: 'aberta', servico: 'Revisão', preferencia: 'Manhã', de: null, ate: null } : id === ID(61) ? { id, status: 'agendada' } : null),
  lembretesDoDia: async (data) => { const lista = [ag({ data }), ag({ id: ID(2), data, telefone: '' })]; const itens = lista.map((a) => ({ id: a.id, hora: a.hora, cliente_nome: a.cliente_nome, situacao: situacaoDoLembrete({ a, envio: null, cfg: CFG, cliente: null, agora: AGORA }) })); return { data, itens, cfg: CFG }; },
  horariosLivresDoDia: async ({ consultor_id }) => ({ aberto: true, horarios: [{ hora: '09:00', livres: 1, consultores_livres: [ID(7)] }, { hora: '09:30', livres: 1, consultores_livres: [] }] }),
  atualizarAgendamento: async (id, novo) => ({ ...novo, id }),
  listarAgendamentos: async () => [ag({ data: AMANHA }), ag({ id: ID(2), data: AMANHA, telefone: '' })],
  horariosDaEspera: async () => ({ itens: [{ data: AMANHA, hora: '09:00', consultor_id: ID(7), consultor_nome: 'Gabriel' }], motivo: null }),
};
before(async () => {
  _injetar({ dados: falso, usuarioLogado: async (req) => { const t = /Bearer (\S+)/.exec(req.headers.authorization || '')?.[1]; return PESSOAS[t] ? { usuario: { ...PESSOAS[t] } } : { usuario: null, motivo: 'sem_login' }; } });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { globalThis.fetch = fetchOriginal; server.close(); });
beforeEach(() => { auditorias = []; });
async function chamar(quem, metodo, rota, corpo) {
  const r = await fetchOriginal(base + rota, { method: metodo, headers: { ...(quem ? { Authorization: `Bearer ${quem}` } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  const texto = await r.text(); let j = null; try { j = JSON.parse(texto); } catch { /* html */ }
  return { status: r.status, j };
}

test('rota do lembrete: sem login 401, recepção 403, atendente lê a situação', async () => {
  assert.equal((await chamar(null, 'GET', `/api/agendamentos/${ID(1)}/lembrete`)).status, 401);
  assert.equal((await chamar('agenda', 'GET', `/api/agendamentos/${ID(1)}/lembrete`)).status, 403);
  assert.equal((await chamar('agenda', 'POST', `/api/agendamentos/${ID(1)}/lembrete`, {})).status, 403);
  const r = await chamar('atendente', 'GET', `/api/agendamentos/${ID(1)}/lembrete`);
  assert.equal(r.status, 200); assert.equal(r.j.situacao.codigo, 'agendado'); assert.equal(r.j.cfg.horas_lembrete, 20);
  assert.equal((await chamar('atendente', 'GET', `/api/agendamentos/${ID(99)}/lembrete`)).status, 404);
  assert.equal((await chamar('atendente', 'GET', '/api/agendamentos/lixo/lembrete')).status, 404);
});
test('rota do lembrete: POST enfileira, audita e o segundo POST devolve "repetido" sem auditar de novo', async () => {
  const a = await chamar('atendente', 'POST', `/api/agendamentos/${ID(1)}/lembrete`, {});
  assert.equal(a.status, 200); assert.equal(a.j.ok, true); assert.equal(envios.length, 1);
  assert.equal(a.j.situacao.codigo, 'na_fila');
  assert.equal(auditorias.filter((x) => x[1] === 'pediu_lembrete').length, 1);
  const b = await chamar('atendente', 'POST', `/api/agendamentos/${ID(1)}/lembrete`, {});
  assert.equal(b.j.repetido, true); assert.equal(envios.length, 1);
  assert.equal(auditorias.filter((x) => x[1] === 'pediu_lembrete').length, 1);
});
test('rota do lembrete: já enviado dá 409 e só reenvia com reenviar:true', async () => {
  envios.push({ id: ID(810), agendamento_id: ID(1), tipo: 'lembrete', status: 'enviado', chave_unica: `lembrete:${ID(1)}`, created_at: '2026-10-21T10:00:00Z' });
  const a = await chamar('atendente', 'POST', `/api/agendamentos/${ID(1)}/lembrete`, {});
  assert.equal(a.status, 409); assert.equal(a.j.jaEnviado, true);
  const b = await chamar('atendente', 'POST', `/api/agendamentos/${ID(1)}/lembrete`, { reenviar: true });
  assert.equal(b.status, 200); assert.equal(auditorias.some((x) => x[1] === 'reenviou_lembrete'), true);
  envios.splice(1);
  const c = await chamar('atendente', 'POST', `/api/agendamentos/${ID(1)}/lembrete`, { reenviar: 'sim' });
  assert.equal(c.status, 409, 'reenviar só vale com o booleano true (string é ignorada)');
});
test('rota do lembrete: sem telefone devolve o motivo e nada entra na fila', async () => {
  const r = await chamar('atendente', 'POST', `/api/agendamentos/${ID(2)}/lembrete`, {});
  assert.equal(r.j.ok, false); assert.match(r.j.motivo, /telefone/); assert.equal(envios.length, 0);
});
test('GET /api/lembretes: situação de cada horário do dia e o resumo; data inválida 400; recepção 403', async () => {
  const r = await chamar('atendente', 'GET', `/api/lembretes?data=${AMANHA}`);
  assert.equal(r.status, 200); assert.equal(r.j.itens.length, 2);
  assert.equal(r.j.resumo.sem_telefone, 1); assert.equal(r.j.resumo.podeMandar, 1);
  assert.equal((await chamar('atendente', 'GET', '/api/lembretes?data=32/13')).status, 400);
  assert.equal((await chamar('agenda', 'GET', '/api/lembretes')).status, 403);
  assert.equal((await chamar(null, 'GET', '/api/lembretes')).status, 401);
});
test('POST /api/lembretes/lote: lembra só quem pode, conta o resto e audita uma vez', async () => {
  const r = await chamar('atendente', 'POST', '/api/lembretes/lote', { data: '2099-12-31' });
  assert.equal(r.status, 200);
  assert.equal(r.j.pulados, 1);
  assert.equal(r.j.pedidos, 1);
  assert.equal(auditorias.filter((x) => x[1] === 'lembrou_o_dia').length, 1);
  assert.equal((await chamar('atendente', 'POST', '/api/lembretes/lote', { data: '2020-01-01' })).status, 400);
  assert.equal((await chamar('atendente', 'POST', '/api/lembretes/lote', {})).status, 400);
  assert.equal((await chamar('agenda', 'POST', '/api/lembretes/lote', { data: '2099-12-31' })).status, 403);
});
test('GET /api/espera/:id/horarios: devolve candidatos reais; espera encerrada ou inexistente não quebra', async () => {
  const r = await chamar('atendente', 'GET', `/api/espera/${ID(60)}/horarios`);
  assert.equal(r.status, 200); assert.equal(r.j.itens[0].hora, '09:00'); assert.equal(r.j.itens[0].consultor_nome, 'Gabriel');
  const enc = await chamar('atendente', 'GET', `/api/espera/${ID(61)}/horarios`);
  assert.deepEqual(enc.j.itens, []); assert.match(enc.j.motivo, /já saiu/);
  assert.equal((await chamar('atendente', 'GET', `/api/espera/${ID(62)}/horarios`)).status, 404);
  assert.equal((await chamar('agenda', 'GET', `/api/espera/${ID(60)}/horarios`)).status, 403);
});

test('GET /api/quadro: lista, vagas e lembretes numa ida só; recepção 403', async () => {
  const r = await chamar('atendente', 'GET', `/api/quadro?data=${AMANHA}`);
  assert.equal(r.status, 200); assert.equal(r.j.lista.length, 2); assert.equal(r.j.livres.horarios.length, 2); assert.equal(r.j.lembretes.resumo.total, 2);
  assert.equal((await chamar('agenda', 'GET', '/api/quadro')).status, 403);
  assert.equal((await chamar(null, 'GET', '/api/quadro')).status, 401);
});
test('POST /mover: confere a vaga no servidor (409 se ocupou), valida entrada, audita e recepção 403', async () => {
  const ok = await chamar('atendente', 'POST', `/api/agendamentos/${ID(1)}/mover`, { data: '2099-12-31', hora: '09:00', consultor_id: ID(7) });
  assert.equal(ok.status, 200); assert.equal(ok.j.hora, '09:00');
  assert.equal(auditorias.filter((x) => x[1] === 'moveu_no_quadro').length, 1);
  const cheio = await chamar('atendente', 'POST', `/api/agendamentos/${ID(1)}/mover`, { data: '2099-12-31', hora: '09:30', consultor_id: ID(7) });
  assert.equal(cheio.status, 409); assert.equal(cheio.j.codigo, 'horario_ocupado');
  const semCons = await chamar('atendente', 'POST', `/api/agendamentos/${ID(1)}/mover`, { data: '2099-12-31', hora: '09:30' });
  assert.equal(semCons.status, 200, 'sem consultor basta haver vaga no horário');
  assert.equal((await chamar('atendente', 'POST', `/api/agendamentos/${ID(1)}/mover`, { data: '2099-12-31', hora: '9h' })).status, 400);
  assert.equal((await chamar('atendente', 'POST', `/api/agendamentos/${ID(1)}/mover`, { data: '2099-12-31', hora: '09:00', consultor_id: 'x' })).status, 400);
  assert.equal((await chamar('atendente', 'POST', `/api/agendamentos/${ID(99)}/mover`, { data: '2099-12-31', hora: '09:00' })).status, 404);
  assert.equal((await chamar('agenda', 'POST', `/api/agendamentos/${ID(1)}/mover`, { data: '2099-12-31', hora: '09:00' })).status, 403);
});
