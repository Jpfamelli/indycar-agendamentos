// Rodada 5 — o server.js DE VERDADE por HTTP com banco e porteiro de mentira:
// horários livres como serviço, lista de espera, confirmação pelo cliente (rota
// pública por token), ficha 360, aniversários, recepção "na casa", OS no "Chegou",
// aviso de remarcação pela fila, handler exportado e caminhos relativos.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as real from '../dados.js';
import { _injetar, server, handler, iniciar, VERSAO } from '../server.js';
import { decidirAcesso } from '../regras.js';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PESSOAS = {
  gestor:    { id: ID(902), email: 'gestor@teste', papel: 'gestor', ativo: true, apps: ['agenda'] },
  atendente: { id: ID(903), email: 'at@teste', papel: 'atendente', ativo: true, apps: ['agenda'] },
  agenda:    { id: ID(904), email: 'franklin@teste', papel: 'agenda', ativo: true, apps: ['agenda'] },
};
let banco, espera, confirmacoes, tarefas, enfileirados, auditoria, base;
const ag = (n, o) => ({ id: ID(n), cliente_nome: 'Cliente ' + n, telefone: '1299111000' + n, servico: 'Troca de óleo', data: real.hoje(), hora: '10:00',
  status: 'confirmado', confirmado: 1, compareceu: null, no_show_notificado_em: null, valor: 0, consultor_id: null, lead_id: null, cliente_id: ID(800 + n), ...o });
function novoBanco() {
  banco = new Map([[ID(1), ag(1, { status: 'aguardando', confirmado: 0 })], [ID(2), ag(2, { status: 'concluido', compareceu: 1 })], [ID(3), ag(3, { status: 'compareceu', compareceu: 1, data: '2026-01-05' })]]);
  espera = new Map([[ID(601), { id: ID(601), status: 'aberta', cliente_nome: 'Joana', servico: 'Troca de óleo', de: null, ate: null, created_at: '2026-10-10T10:00:00Z' }]]);
  confirmacoes = new Map(); tarefas = []; enfileirados = []; auditoria = [];
}
const falso = {
  ...real,
  marcarUltimoAcesso: async () => {}, obterIntegracoes: async () => ({}), obterIaConfig: async () => ({}), templatePorGatilho: async () => null,
  auditar: async (perfil, acao, tabela, registro, detalhes) => { auditoria.push({ acao, registro, detalhes }); return true; },
  obterAgendamento: async (id) => (banco.has(id) ? { ...banco.get(id) } : null),
  atualizarAgendamento: async (id, campos) => { const a = banco.get(id); if (!a) return null; for (const [k, v] of Object.entries(campos)) if (v !== undefined) a[k] = v; return { ...a }; },
  listarAgendamentos: async () => [...banco.values()].filter((a) => a.data === real.hoje()).map((a) => ({ ...a })),
  naCasaDeOutrosDias: async () => [...banco.values()].filter((a) => a.data < real.hoje() && ['compareceu', 'em_atendimento'].includes(a.status)).map((a) => ({ ...a })),
  horariosLivresDoDia: async ({ data, servico }) => ({ data, aberto: true, motivo: null, duracao_min: servico ? 40 : 60, capacidade: 1, janelas: [], servico: servico || null, consultores: [],
    horarios: [{ hora: '08:00', fim: '08:40', livres: 1, consultores_livres: [], consultores: [] }, { hora: '09:00', fim: '09:40', livres: 1, consultores_livres: [], consultores: [] }] }),
  horariosProximosDias: async ({ desde, dias }) => ({ desde, dias, dias_livres: [{ data: '2026-10-19', motivo: null, horarios: ['08:00'], total: 1 }], capacidade: 1, duracao_min: 60 }),
  listarEspera: async ({ status }) => [...espera.values()].filter((e) => status === 'todas' || e.status === status),
  contarEspera: async () => [...espera.values()].filter((e) => e.status === 'aberta').length,
  criarEspera: async (c) => { const e = { id: ID(602), status: 'aberta', created_at: new Date().toISOString(), ...c }; espera.set(e.id, e); return e; },
  obterEspera: async (id) => espera.get(id) || null,
  atualizarEspera: async (id, c) => { const e = espera.get(id); Object.assign(e, c); return e; },
  removerEspera: async (id) => espera.delete(id),
  criarConfirmacao: async ({ agendamento_id }) => { const c = { id: ID(700), agendamento_id, token: 'ab12cd34ef56ab12cd34ef56', resposta: null, enviado_em: '2026-10-16T10:00:00Z' }; confirmacoes.set(c.token, c); return c; },
  confirmacaoPorToken: async (t) => { const c = confirmacoes.get(t); if (!c) return null; const a = banco.get(c.agendamento_id);
    return { token: t, resposta: c.resposta, respondido_em: c.respondido_em, agendamento: { id: a.id, primeiro_nome: 'Cliente', servico: a.servico, data: a.data, hora: a.hora, status: a.status, passou: false } }; },
  responderConfirmacao: async (t, resposta) => { const c = confirmacoes.get(t); if (!c) return null; c.resposta = resposta; c.respondido_em = new Date().toISOString();
    if (resposta === 'confirmou') { const a = banco.get(c.agendamento_id); a.confirmado = 1; a.status = 'confirmado'; } return c; },
  listarConsultores: async () => [], gestoresAtivos: async () => [{ id: ID(902) }],
  criarTarefa: async (t) => { tarefas.push(t); return { id: ID(900), ...t }; },
  patioDosAgendamentos: async (ids) => (ids.includes(ID(1)) ? { [ID(1)]: { os_id: ID(555), numero: 123, etapa: 'recebido', etapa_rotulo: 'Recebido', abrir: 'https://indycar-patio.netlify.app/?os=' + ID(555) } } : {}),
  cliente360: async (tel) => ({ telefone: real.telefoneNacional(tel), cliente: { nome: 'Maria' }, resumo: { total_gasto: 10 } }),
  aniversariosProximos: async (dias) => [{ id: ID(801), nome: 'Ana', em: 0, dias }],
  enfileirarAvisoDeRemarcacao: async (a, texto) => { enfileirados.push({ id: a.id, texto }); return { ok: true }; },
  contarFollowup: async () => 0, contarConcluidosSemValor: async () => 0, contarPendenciasAntigas: async () => 0, entreguesNoPatioSemDesfecho: async () => [],
};
const fetchOriginal = globalThis.fetch;
before(async () => {
  globalThis.fetch = async (url, opt) => { if (String(url).startsWith(base)) return fetchOriginal(url, opt); throw new Error('rede proibida no teste: ' + url); };
  _injetar({ dados: falso, usuarioLogado: async (req) => { const t = /Bearer (\S+)/.exec(req.headers.authorization || '')?.[1]; return PESSOAS[t] ? { usuario: { ...PESSOAS[t] } } : { usuario: null, motivo: 'sem_login' }; } });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { globalThis.fetch = fetchOriginal; server.close(); });
beforeEach(() => { novoBanco(); _injetar({}); });
async function chamar(quem, metodo, rota, corpo, extra = {}) {
  const r = await fetch(base + rota, { method: metodo, headers: { ...(quem ? { Authorization: `Bearer ${quem}` } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...extra }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { status: r.status, j: await r.json().catch(() => null), h: r.headers };
}

test('módulo: exporta handler, iniciar e a versão; importar não abre porta nem liga timer', () => {
  assert.equal(typeof handler, 'function'); assert.equal(typeof iniciar, 'function'); assert.equal(VERSAO, '2026-10-16-r5');
});

test('horários livres como serviço: /dia exige data válida; devolve a grade com resumo; /proximos aceita desde/dias', async () => {
  assert.equal((await chamar('atendente', 'GET', '/api/horarios-livres/dia')).status, 400);
  assert.equal((await chamar('atendente', 'GET', '/api/horarios-livres/dia?data=2026-13-99')).status, 400);
  const r = await chamar('atendente', 'GET', '/api/horarios-livres/dia?data=2026-10-17&servico=Troca%20de%20%C3%B3leo');
  assert.equal(r.status, 200); assert.equal(r.j.duracao_min, 40); assert.equal(r.j.horarios.length, 2); assert.match(r.j.resumo, /08:00, 09:00/);
  const p = await chamar('atendente', 'GET', '/api/horarios-livres/proximos?desde=2026-10-17&dias=3');
  assert.equal(p.status, 200); assert.equal(p.j.dias_livres[0].data, '2026-10-19'); assert.match(p.j.resumo, /seg 19\/10: 08:00/);
  assert.equal((await chamar('atendente', 'GET', '/api/horarios-livres/proximos?desde=lixo')).status, 400);
  // o papel agenda (Franklin) não oferece horário; sem login 401
  assert.equal((await chamar('agenda', 'GET', '/api/horarios-livres/dia?data=2026-10-17')).status, 403);
  assert.equal((await chamar(null, 'GET', '/api/horarios-livres/dia?data=2026-10-17')).status, 401);
});

test('lista de espera: equipe lista/cria/edita; apagar é do gestor; validações; contagem no /api/contagens', async () => {
  assert.equal((await chamar('atendente', 'GET', '/api/espera')).j.length, 1);
  assert.equal((await chamar('atendente', 'POST', '/api/espera', { cliente_nome: '', servico: 'x' })).status, 400);
  assert.equal((await chamar('atendente', 'POST', '/api/espera', { cliente_nome: 'Zé', servico: 'Freios', telefone: '123' })).status, 400);
  assert.equal((await chamar('atendente', 'POST', '/api/espera', { cliente_nome: 'Zé', servico: 'Freios', de: '2026-99-99' })).status, 400);
  const c = await chamar('atendente', 'POST', '/api/espera', { cliente_nome: 'Zé', servico: 'Freios', telefone: '(12) 99999-0000', preferencia: 'Manhã' });
  assert.equal(c.status, 201); assert.equal(c.j.criado_por, ID(903));
  const e = await chamar('atendente', 'PATCH', `/api/espera/${ID(601)}`, { status: 'agendada', agendamento_id: ID(1) });
  assert.equal(e.status, 200); assert.equal(e.j.status, 'agendada');
  assert.ok(auditoria.some((x) => x.acao === 'espera_agendada'));
  assert.equal((await chamar('atendente', 'PATCH', `/api/espera/${ID(999)}`, { status: 'cancelada' })).status, 404);
  assert.equal((await chamar('atendente', 'DELETE', `/api/espera/${ID(601)}`)).status, 403);
  assert.equal((await chamar('gestor', 'DELETE', `/api/espera/${ID(601)}`)).status, 200);
  assert.equal((await chamar('agenda', 'GET', '/api/espera')).status, 403);
  const cont = await chamar('atendente', 'GET', '/api/contagens');
  assert.equal(cont.j.espera, 1);
});

test('confirmação: POST gera link+texto+whatsapp (base da requisição + prefixo); horário com desfecho recusa (409)', async () => {
  const r = await chamar('atendente', 'POST', `/api/agendamentos/${ID(1)}/confirmacao`, { canal: 'whatsapp' }, { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'indycar-agendamentos.onrender.com' });
  assert.equal(r.status, 200);
  assert.equal(r.j.link, 'https://indycar-agendamentos.onrender.com/confirmar/?t=ab12cd34ef56ab12cd34ef56');
  assert.match(r.j.texto, /Oi Cliente! Aqui é da IndyCar/); assert.match(r.j.whatsapp, /^https:\/\/wa\.me\/5512991110001\?text=/);
  assert.doesNotMatch(r.j.texto, /prezad|veículo|efetuar|comparecer/i);
  assert.equal((await chamar('atendente', 'POST', `/api/agendamentos/${ID(2)}/confirmacao`, {})).status, 409);
  assert.equal((await chamar('agenda', 'POST', `/api/agendamentos/${ID(1)}/confirmacao`, {})).status, 403);
});

test('rota pública do cliente: lê pelo token sem login, responde, "confirmou" liga confirmado; "remarcar" vira tarefa; token errado 404; freio por IP', async () => {
  await chamar('atendente', 'POST', `/api/agendamentos/${ID(1)}/confirmacao`, {});
  const g = await chamar(null, 'GET', '/api/publico/confirmacao?t=ab12cd34ef56ab12cd34ef56');
  assert.equal(g.status, 200); assert.equal(g.j.agendamento.servico, 'Troca de óleo'); assert.equal(g.j.agendamento.telefone, undefined);
  assert.equal((await chamar(null, 'GET', '/api/publico/confirmacao?t=naoexiste0000000000000000')).status, 404);
  assert.equal((await chamar(null, 'POST', '/api/publico/confirmacao', { t: 'ab12cd34ef56ab12cd34ef56', resposta: 'sim' })).status, 400);
  const ok = await chamar(null, 'POST', '/api/publico/confirmacao', { t: 'ab12cd34ef56ab12cd34ef56', resposta: 'remarcar', observacao: 'só à tarde' });
  assert.equal(ok.status, 200); assert.equal(ok.j.resposta, 'remarcar');
  assert.equal(tarefas.length, 1); assert.equal(tarefas[0].titulo, 'Remarcar'); assert.match(tarefas[0].descricao, /só à tarde/); assert.equal(tarefas[0].responsavel_id, ID(902));
  const ok2 = await chamar(null, 'POST', '/api/publico/confirmacao', { t: 'ab12cd34ef56ab12cd34ef56', resposta: 'confirmou' });
  assert.equal(ok2.status, 200); assert.equal(banco.get(ID(1)).confirmado, 1); assert.equal(banco.get(ID(1)).status, 'confirmado');
  assert.equal(tarefas.length, 1, 'confirmou não cria tarefa');
  // freio: 40 por 10 min por IP
  let ultimo = 200;
  for (let i = 0; i < 45; i++) ultimo = (await chamar(null, 'GET', '/api/publico/confirmacao?t=ab12cd34ef56ab12cd34ef56')).status;
  assert.equal(ultimo, 429);
});

test('"Chegou" devolve a OS do Pátio; "Não veio" diz quem da espera cabe (não para a presença)', async () => {
  const r = await chamar('agenda', 'PATCH', `/api/agendamentos/${ID(1)}/status`, { status: 'compareceu' });
  assert.equal(r.status, 200); assert.equal(r.j.patio.numero, 123); assert.match(r.j.patio.abrir, /\?os=/);
  novoBanco(); _injetar({});
  const n = await chamar('atendente', 'PATCH', `/api/agendamentos/${ID(1)}/status`, { status: 'nao_veio' });
  assert.equal(n.status, 200); assert.equal(n.j.espera.length, 1); assert.equal(n.j.espera[0].cliente_nome, 'Joana');
  novoBanco(); _injetar({});
  const p = await chamar('agenda', 'PATCH', `/api/agendamentos/${ID(1)}/status`, { status: 'nao_veio' });
  assert.equal(p.j.espera, undefined, 'a presença não vê a espera');
});

test('recepção (papel agenda) vê hoje + quem está na casa de outro dia, sempre sem telefone', async () => {
  const r = await chamar('agenda', 'GET', '/api/agendamentos');
  assert.equal(r.status, 200);
  assert.ok(r.j.some((a) => a.id === ID(3)), 'o carro que chegou em janeiro e não saiu aparece');
  assert.ok(r.j.every((a) => !('telefone' in a) && !('telefone_e164' in a)));
});

test('ficha 360 e aniversários: equipe sim, presença não; telefone curto 400', async () => {
  assert.equal((await chamar('atendente', 'GET', '/api/clientes/360?tel=129')).status, 400);
  const r = await chamar('atendente', 'GET', '/api/clientes/360?tel=5512991110001');
  assert.equal(r.status, 200); assert.equal(r.j.telefone, '12991110001');
  assert.equal((await chamar('agenda', 'GET', '/api/clientes/360?tel=12991110001')).status, 403);
  const a = await chamar('atendente', 'GET', '/api/aniversarios?dias=3');
  assert.equal(a.status, 200); assert.equal(a.j.itens[0].nome, 'Ana'); assert.equal(a.j.dias, 3);
  assert.equal((await chamar('agenda', 'GET', '/api/aniversarios')).status, 403);
});

test('aviso de remarcação: entra na fila do Comunicar e é auditado; sem telefone devolve o motivo', async () => {
  const r = await chamar('atendente', 'POST', `/api/agendamentos/${ID(1)}/avisar-remarcacao`, {});
  assert.equal(r.status, 200); assert.equal(r.j.enfileirado, true); assert.match(enfileirados[0].texto, /remarcado para/);
  assert.doesNotMatch(enfileirados[0].texto, /prezad|veículo/i);
  assert.ok(auditoria.some((x) => x.acao === 'avisou_remarcacao'));
  banco.get(ID(1)).telefone = null;
  const s = await chamar('atendente', 'POST', `/api/agendamentos/${ID(1)}/avisar-remarcacao`, {});
  assert.equal(s.j.enfileirado, false); assert.match(s.j.motivo, /telefone/);
});

test('regras: espera e confirmação fora da allowlist da presença; apagar espera é de gestor', () => {
  const p = (papel) => ({ papel, ativo: true, apps: ['agenda'] });
  assert.equal(decidirAcesso({ perfil: p('agenda'), metodo: 'GET', rota: '/api/espera' }).codigo, 'so_presenca');
  assert.equal(decidirAcesso({ perfil: p('atendente'), metodo: 'DELETE', rota: `/api/espera/${ID(1)}` }).codigo, 'so_gestor');
  assert.equal(decidirAcesso({ perfil: p('gestor'), metodo: 'DELETE', rota: `/api/espera/${ID(1)}` }), null);
  assert.equal(decidirAcesso({ perfil: p('atendente'), metodo: 'POST', rota: `/api/agendamentos/${ID(1)}/confirmacao` }), null);
});

test('estáticos: /confirmar/ serve a página do cliente; a casca não tem caminho absoluto; o service worker é relativo', async () => {
  const pg = await (await fetch(base + '/confirmar/?t=abc')).text();
  assert.match(pg, /Confirmar horário/); assert.match(pg, /\.\.\/api\/publico\/confirmacao/);
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /(href|src)="\/[a-z]/, 'index.html só com caminhos relativos');
  assert.match(html, /apps\.js/); assert.match(html, /rodada5\.css/);
  const sw = await (await fetch(base + '/sw.js')).text();
  assert.match(sw, /self\.registration\.scope/); assert.match(sw, /indycar-agenda-v\d+/); assert.doesNotMatch(sw, /'\/api\/'/);
  const man = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'));
  assert.equal(man.start_url, './'); assert.equal(man.scope, './');
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /fetch\('\/api/); assert.doesNotMatch(app, /register\('\/sw\.js'\)/);
  assert.doesNotMatch(app, /onrender\.com|netlify\.app/, 'nenhum endereço fixo fora do apps.js');
});

test('2ª leva: contagens com "sem confirmação" de amanhã; resumo das confirmações só gestor; espera na busca; CSV com confirmado', async () => {
  const c = await chamar('atendente', 'GET', '/api/contagens');
  assert.equal(typeof c.j.proximoDia, 'string'); assert.ok('semConfirmacao' in c.j);
  assert.equal((await chamar('atendente', 'GET', '/api/confirmacoes/resumo')).status, 403);
  _injetar({ dados: { ...falso, resumoDasConfirmacoes: async (dias) => ({ dias, enviadas: 3, confirmaram: 2, remarcar: 0, nao_vem: 0, sem_resposta: 1, abertas: 2, taxa_resposta: 67 }),
    buscaGlobal: async () => ({ agendamentos: [], clientes: [] }), buscarEspera: async (q) => [{ id: ID(601), cliente_nome: 'Joana ' + q }],
    listarTodosAgendamentos: async () => [{ id: ID(1), cliente_nome: 'X', confirmado: 1, valor: 100, status: 'confirmado' }] } });
  const r = await chamar('gestor', 'GET', '/api/confirmacoes/resumo?dias=7');
  assert.equal(r.status, 200); assert.equal(r.j.dias, 7); assert.equal(r.j.taxa_resposta, 67);
  const b = await chamar('atendente', 'GET', '/api/busca?q=joa');
  assert.equal(b.j.espera[0].cliente_nome, 'Joana joa');
  const csv = await fetch(base + '/api/export/agendamentos.csv', { headers: { Authorization: 'Bearer gestor' } });
  const txt = await csv.text();
  assert.match(txt, /"confirmado";"valor"/); assert.match(txt, /"sim";"100"/);
});

test('2ª leva: a página pública traz a oficina (como chegar / falar), nunca o telefone do cliente; o sino toca para quem cuida', async () => {
  const notificadas = [];
  _injetar({ dados: { ...falso, obterEmpresa: async () => ({ nome: 'IndyCar', endereco: 'Av. Bandeirantes, 875' }), notificar: async (n) => { notificadas.push(n); return 1; } } });
  await chamar('atendente', 'POST', `/api/agendamentos/${ID(1)}/confirmacao`, {});
  const g = await chamar(null, 'GET', '/api/publico/confirmacao?t=ab12cd34ef56ab12cd34ef56');
  assert.equal(g.j.oficina.nome, 'IndyCar'); assert.match(g.j.oficina.mapa, /maps/); assert.match(g.j.oficina.whatsapp, /wa\.me\/55/);
  assert.doesNotMatch(JSON.stringify(g.j), /1299111000/);
  await chamar(null, 'POST', '/api/publico/confirmacao', { t: 'ab12cd34ef56ab12cd34ef56', resposta: 'nao_vem' });
  assert.equal(notificadas.length, 1); assert.equal(notificadas[0].perfil_id, ID(902)); assert.match(notificadas[0].titulo, /não vem/); assert.equal(notificadas[0].chave, `confirmacao:${ID(1)}:nao_vem`);
  assert.equal((await chamar('atendente', 'GET', '/api/horarios-livres/dia?data=2026-10-17')).j.proximo, '08:00');
});
