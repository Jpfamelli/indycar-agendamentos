// Casa (rodada 6, C1b): regras puras de casa/logica2.js + saúde do Pátio/Orçador no servidor da Central.
import { test } from 'node:test';
import assert from 'node:assert/strict';
await import('../casa/logica.js');
await import('../casa/logica2.js');
const L = globalThis.CasaLogica, M = globalThis.CasaLogica2;
const EU = '11111111-1111-4111-8111-111111111111';
const perfil = (papel, apps) => ({ id: EU, papel, ativo: true, apps });

test('saúde: uma falha só marca suspeito, a segunda seguida vira fora do ar, sucesso zera', async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'; process.env.SUPABASE_ANON_KEY = 'x'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'y';
  const c = await import('../central.js');
  const a = c.proximoEstadoApp(null, { ok: false, motivo: 'sem_resposta' }, 1000);
  assert.equal(a.fora, false); assert.equal(a.suspeito, true);
  const b = c.proximoEstadoApp(a, { ok: false, motivo: 'http_503' }, 2000);
  assert.equal(b.fora, true); assert.equal(b.desde, 1000); assert.equal(b.motivo, 'http_503');
  const d = c.proximoEstadoApp(b, { ok: true, status: 200, ms: 90 }, 3000);
  assert.deepEqual([d.fora, d.suspeito, d.falhas, d.desde], [false, false, 0, null]);
});
test('sondarApp: 200 e 404 contam como no ar, 503 e erro de rede como fora, tempo esgotado é reconhecido', async () => {
  const c = await import('../central.js');
  const fake = (status) => async () => ({ status, body: { cancel() {} } });
  assert.equal((await c.sondarApp('https://x', fake(200))).ok, true);
  assert.equal((await c.sondarApp('https://x', fake(404))).ok, true);
  const r = await c.sondarApp('https://x', fake(503));
  assert.equal(r.ok, false); assert.equal(r.motivo, 'http_503');
  assert.equal((await c.sondarApp('https://x', async () => { throw new TypeError('fetch failed'); })).motivo, 'sem_resposta');
  const t = await c.sondarApp('https://x', async () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; });
  assert.equal(t.motivo, 'tempo_esgotado');
});
test('saudeDosApps: cache de 40 s (uma sondagem por app), coalesce chamadas juntas e guarda o desde', async () => {
  const c = await import('../central.js');
  let n = 0; let vivo = false;
  c.definirSondaParaTeste(async (url, k) => { n++; await new Promise((r) => setTimeout(r, 15)); return vivo || k === 'orcador' ? { ok: true, status: 200, ms: 5 } : { ok: false, motivo: 'sem_resposta' }; });
  const [x, y] = await Promise.all([c.saudeDosApps(), c.saudeDosApps()]);
  assert.equal(n, 2); assert.deepEqual(x, y);
  assert.equal(x.apps.patio.suspeito, true);
  await c.saudeDosApps(Date.now());
  assert.equal(n, 2, 'dentro dos 40 s não sonda de novo');
  const depois = await c.saudeDosApps(Date.now() + 41_000);
  assert.equal(n, 4); assert.equal(depois.apps.patio.fora, true);
  vivo = true;
  const volta = await c.saudeDosApps(Date.now() + 90_000);
  assert.equal(volta.apps.patio.fora, false);
  c.definirSondaParaTeste(null);
});
test('avisosDeApps: só quem está fora aparece, com a hora e o motivo em português', () => {
  const agora = Date.parse('2026-10-21T17:00:00Z');
  const saude = { apps: { patio: { fora: true, desde: agora - 12 * 60000, motivo: 'http_503' }, orcador: { fora: false, suspeito: true } } };
  const av = M.avisosDeApps(saude, agora);
  assert.equal(av.length, 1);
  assert.equal(av[0].app, 'patio'); assert.equal(av[0].minutos, 12);
  assert.match(av[0].texto, /Pátio.*manutenção.*12 min/);
  assert.equal(M.avisosDeApps(null).length, 0);
  assert.match(M.rotuloMotivo('http_418'), /erro 418/);
});
test('voltaramAoAr nomeia quem saiu do "fora" entre duas leituras', () => {
  const a = { apps: { patio: { fora: true }, orcador: { fora: true } } }, b = { apps: { patio: { fora: false }, orcador: { fora: true } } };
  assert.deepEqual(M.voltaramAoAr(a, b), ['Pátio']);
  assert.deepEqual(M.voltaramAoAr(null, b), []);
});
test('paleta: comandos por papel (mecânico não vê Novo orçamento) e busca sem acento', () => {
  const dono = M.comandos(perfil('gestor', ['agenda', 'patio', 'orcador', 'crm', 'atendimento', 'comunicar']));
  const ids = dono.map((c) => c.id);
  for (const k of ['novo-horario', 'nova-entrada', 'novo-orcamento', 'visao-dono', 'abrir-patio', 'sair', 'tema']) assert.ok(ids.includes(k), k);
  const mec = M.comandos(perfil('mecanico', ['patio'])).map((c) => c.id);
  assert.ok(!mec.includes('novo-orcamento') && !mec.includes('novo-horario') && !mec.includes('nova-entrada'));
  assert.ok(mec.includes('modo-tv'));
  assert.equal(M.filtrarComandos(dono, 'orcamento')[0].id, 'novo-orcamento');
  assert.equal(M.filtrarComandos(dono, '> televisao')[0].id, 'modo-tv');
  assert.equal(M.filtrarComandos(dono, 'zzzz').length, 0);
  assert.equal(M.filtrarComandos(dono, '').length, dono.length);
});
test('ordem dos cartões muda por papel e papel desconhecido cai na do gestor', () => {
  assert.equal(M.ordemDosCartoes('atendente')[0], 'cConversas');
  assert.deepEqual(M.ordemDosCartoes('mecanico'), ['cPatio']);
  assert.equal(M.ordemDosCartoes('qualquer')[0], 'cPatio');
});
test('meuDia: só o que é da pessoa; sem dono vira convite', () => {
  const dados = { conversas: { lista: [{ atribuida_a: EU }, { atribuida_a: 'outro' }, { atribuida_a: null }] },
    agenda: { lista: [{ consultor_id: 'c1', status: 'aguardando', hora: '23:00', nome: 'Ana' }, { consultor_id: 'c2', status: 'aguardando', hora: '23:30' }] } };
  const tar = [{ status: 'aberta', responsavel_id: EU, vence_em: '2020-01-01T00:00:00Z' }, { status: 'feita', responsavel_id: EU }];
  const r = M.meuDia({ perfil: perfil('atendente'), dados, tarefas: tar, consultorId: 'c1', agoraMs: Date.parse('2026-10-21T15:00:00Z') });
  assert.deepEqual(r.itens.map((i) => i.k), ['conversas', 'vencidas', 'horarios']);
  assert.match(r.itens[2].extra, /23:00.*Ana/);
  const r2 = M.meuDia({ perfil: perfil('atendente'), dados: { conversas: { lista: [{ atribuida_a: null }] } }, tarefas: [] });
  assert.equal(r2.itens[0].k, 'sem-dono');
  assert.equal(M.meuDia({ perfil: null, dados }), null);
});
test('prazo da tarefa: depois das 17h30 "hoje" vira amanhã 9h e domingo pula para segunda', () => {
  const sex = new Date('2026-10-23T16:00:00Z');   // sexta 13h
  assert.equal(M.prazoDaTarefa('hoje', sex), '2026-10-23T17:30:00-03:00');
  const sexTarde = new Date('2026-10-23T21:30:00Z'); // sexta 18h30
  assert.equal(M.prazoDaTarefa('hoje', sexTarde), '2026-10-24T09:00:00-03:00');
  const sab = new Date('2026-10-24T21:30:00Z');       // sábado 18h30 -> domingo -> segunda
  assert.equal(M.prazoDaTarefa('hoje', sab), '2026-10-26T09:00:00-03:00');
  assert.equal(M.prazoDaTarefa('semana', sex), '2026-10-30T09:00:00-03:00');
  assert.equal(M.prazoDaTarefa('', sex), null);
});
test('adiar tarefa: +1 dia útil às 9h, nunca domingo, parte do prazo se ainda não venceu', () => {
  const agora = new Date('2026-10-23T16:00:00Z'); // sexta
  assert.equal(M.adiarTarefa(null, agora), '2026-10-24T09:00:00-03:00');
  assert.equal(M.adiarTarefa('2026-10-24T20:00:00Z', agora), '2026-10-26T09:00:00-03:00');
  assert.equal(M.adiarTarefa('2020-01-01T00:00:00Z', agora), '2026-10-24T09:00:00-03:00');
  assert.equal(M.adiarTarefa(null, agora, 2), '2026-10-26T09:00:00-03:00');
});
test('tarefas: situação, filtros e contagens (urgente = prioridade 1)', () => {
  const agora = new Date('2026-10-21T15:00:00Z');
  const t = (id, o) => ({ id, status: 'aberta', responsavel_id: EU, prioridade: 2, ...o });
  const lista = [t('a', { vence_em: '2026-10-20T12:00:00Z' }), t('b', { vence_em: '2026-10-21T20:30:00Z' }), t('c', { vence_em: '2026-10-25T12:00:00Z', prioridade: 1 }),
    t('d', {}), t('e', { responsavel_id: 'outro' }), t('f', { status: 'feita' })];
  assert.equal(M.situacaoDaTarefa(lista[0], agora), 'vencida');
  assert.equal(M.situacaoDaTarefa(lista[1], agora), 'hoje');
  assert.equal(M.situacaoDaTarefa(lista[2], agora), 'proxima');
  assert.equal(M.situacaoDaTarefa(lista[3], agora), 'sem-prazo');
  assert.deepEqual(M.filtrarTarefas(lista, 'todas', { id: EU }, agora).map((x) => x.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(M.filtrarTarefas(lista, 'hoje', { id: EU }, agora).map((x) => x.id), ['a', 'b']);
  assert.deepEqual(M.filtrarTarefas(lista, 'urgentes', { id: EU }, agora).map((x) => x.id), ['c']);
  assert.deepEqual(M.filtrarTarefas(lista, 'equipe', { id: EU }, agora).map((x) => x.id), ['e']);
  assert.deepEqual(M.contagemDeTarefas(lista, { id: EU }, agora), { todas: 4, hoje: 2, vencidas: 1, urgentes: 1, equipe: 1 });
});
test('textoDoPrazo fala em hoje/ontem/amanhã no fuso da oficina', () => {
  const agora = new Date('2026-10-21T15:00:00Z');
  assert.equal(M.textoDoPrazo('2026-10-21T20:30:00Z', agora), 'hoje 17:30');
  assert.equal(M.textoDoPrazo(null, agora), '');
  assert.equal(M.textoDoPrazo('lixo', agora), '');
});
test('sino: três ou mais do mesmo tipo viram um grupo; adiados voltam só depois da hora', () => {
  const n = (id, tipo) => ({ id, app: 'agenda', tipo, titulo: 'x' + id, created_at: '2026-10-21T1' + id + ':00:00Z' });
  const g = M.agruparAvisos([n('1', 'atraso'), n('2', 'atraso'), n('3', 'atraso'), n('4', 'extra'), { id: '5', app: 'crm', lida_em: 'x', tipo: 'atraso' }]);
  assert.equal(g.filter((x) => x.grupo).length, 1);
  assert.equal(g.find((x) => x.grupo).grupo.length, 3);
  assert.match(g.find((x) => x.grupo).titulo, /3 avisos: atrasos/);
  assert.equal(g.length, 3);
  assert.deepEqual(M.aindaAdiados({ a: 5000, b: 1000 }, 2000), { a: 5000 });
  assert.equal(M.iconeDoAviso({ tipo: 'atraso' }), '⏰');
  assert.equal(M.iconeDoAviso({ app: 'patio' }), '🔧');
});
test('dono: projeção do mês por dias úteis (seg–sáb), meta e ranking de consultores', () => {
  const p = M.projecaoDoMes(10000, '2026-10-15');
  assert.equal(p.total, 27); assert.equal(p.passados, 13); assert.equal(p.projecao, 20769);
  assert.equal(M.projecaoDoMes(0, '2026-10-01').projecao, 0);
  assert.deepEqual(M.progressoDaMeta(5000, 20000), { pct: 25, falta: 15000, batida: false });
  assert.equal(M.progressoDaMeta(5000, 0), null);
  assert.equal(M.progressoDaMeta(25000, 20000).batida, true);
  const r = M.rankingConsultores([{ nome: 'A', vieram: 10, fecharam: 5, faltaram: 2, valor: 100 }, { nome: null, vieram: 4, fecharam: 4, faltaram: 0, valor: 900 }]);
  assert.equal(r[0].nome, 'Sem consultor'); assert.equal(r[1].taxaFalta, 17); assert.equal(r[1].taxaFecha, 50);
});
test('resumo do dia para WhatsApp só existe para o dono e usa os números certos', () => {
  const dono = { faturamento: { hoje: 980, fechados_hoje: 1, semana: 5600, mes: 18450.5 } };
  const agora = { patio: { total: 3, prontos: 1 }, agenda: { total: 6, chegaram: 2 }, orcamentos: { esperando: 2, aprovados_sem_horario: 1 }, conversas: { esperando: 4 } };
  const t = M.resumoDoDia({ dono, agora, hojeIso: '2026-10-21' });
  assert.match(t, /resumo de 21\/10\/2026/); assert.match(t, /Carros no pátio: 3 \(1 pronto p\/ retirar\)/); assert.match(t, /1 fechamento\)/);
  assert.equal(M.resumoDoDia({ dono: null, agora }), '');
});
test('clima da oficina: antes, aberta, fechando, depois e domingo', () => {
  assert.equal(M.climaDaOficina(new Date('2026-10-21T10:00:00Z')).estado, 'antes');   // 07h
  assert.equal(M.climaDaOficina(new Date('2026-10-21T15:00:00Z')).estado, 'aberta');   // 12h
  assert.equal(M.climaDaOficina(new Date('2026-10-21T19:45:00Z')).estado, 'fechando'); // 16h45
  assert.equal(M.climaDaOficina(new Date('2026-10-21T21:00:00Z')).estado, 'depois');   // 18h
  assert.equal(M.climaDaOficina(new Date('2026-10-25T15:00:00Z')).estado, 'fechada');
});
test('vazios que ensinam existem para todos os cartões do Agora', () => {
  for (const k of ['cPatio', 'cOrc', 'cConversas', 'cHoje', 'cLeads']) { assert.ok(M.VAZIOS[k].texto && M.VAZIOS[k].dica.length > 20, k); }
  assert.equal(M.ATALHOS_NUMERO[5], 'patio');
});

test('avisos do Orçador: aprovado e recusado têm ícone e rótulo; o link abre dentro do Orçador', () => {
  assert.equal(M.iconeDoAviso({ tipo: 'orcamento_aprovado', app: 'orcador' }), '✅');
  assert.equal(M.iconeDoAviso({ tipo: 'orcamento_recusado', app: 'orcador' }), '❌');
  assert.match(M.rotuloTipo('orcamento_aprovado'), /aprovados/);
  const id = '12345678-1234-4234-8234-123456789012';
  const u = L.linkDaNotificacao({ app: 'orcador', link: `https://indycar-orcador.netlify.app/#/historico/${id}` }, L.bases(), 'https://central.exemplo/');
  assert.equal(u, `https://indycar-orcador.netlify.app/#/historico/${id}`);
  assert.equal(L.appDoLink(u, 'https://central.exemplo/', L.bases()), 'orcador');
});

test('Meu dia: pré-agendamento do Orçador vira item com ligação à Agenda (só quando há)', () => {
  assert.equal(M.itemPreAgendamento(0), null);
  assert.equal(M.itemPreAgendamento(undefined), null);
  const um = M.itemPreAgendamento(1), dois = M.itemPreAgendamento(2);
  assert.match(um.texto, /^1 pré-agendamento do Orçador esperando confirmação/);
  assert.match(dois.texto, /^2 pré-agendamentos/);
  assert.equal(um.app, 'agenda');
});
