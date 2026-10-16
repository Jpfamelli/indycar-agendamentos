// Rodada 5 · Onda C · C7 (Agenda e recepção) — cada bug achado na verificação vira teste.
// Banco: um PostgREST de mentira (fetch trocado); servidor: o server.js de verdade por HTTP.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'http://postgrest.falso';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-falsa-de-teste';

const real = await import('../dados.js');
const { _injetar, server } = await import('../server.js');
const { livresDoDia } = await import('../horarios.js');
const { presencaPodeMarcar } = await import('../regras.js');
const P = (await import('../public/planejamento.js')).default ?? globalThis.Planejamento;

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/* ---------- PostgREST de mentira ---------- */
let linhas, chamadas;
const fetchOriginal = globalThis.fetch;
function postgrestFalso(url, opt = {}) {
  const u = new URL(url);
  const tabela = u.pathname.replace('/rest/v1/', '');
  const metodo = opt.method || 'GET';
  chamadas.push({ metodo, tabela, q: u.search, corpo: opt.body ? JSON.parse(opt.body) : undefined });
  const resp = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json' } });
  const lista = linhas[tabela] || [];
  const casa = (x) => {
    for (const [c, v] of u.searchParams) {
      if (['select', 'order', 'limit', 'offset', 'or', 'and'].includes(c)) continue;
      const val = x[c];
      if (v.startsWith('eq.') && String(val) !== v.slice(3)) return false;
      if (v.startsWith('neq.') && String(val) === v.slice(4)) return false;
      if (v.startsWith('like.') && !String(val ?? '').startsWith(v.slice(5).replace(/[*]$/, ''))) return false;
      if (v === 'is.null' && val != null) return false;
    }
    return true;
  };
  if (metodo === 'GET') return resp(lista.filter(casa));
  if (metodo === 'PATCH') {
    const r = lista.filter(casa);
    const corpo = JSON.parse(opt.body);
    for (const x of r) Object.assign(x, corpo);
    return resp(r.map((x) => ({ ...x })));
  }
  if (metodo === 'POST') { const corpoP = JSON.parse(opt.body); const novo = { id: ID(9000 + (linhas[tabela]?.length || 0)), ...(Array.isArray(corpoP) ? corpoP[0] : corpoP) }; (linhas[tabela] ||= []).push(novo); return resp([novo], 201); }
  return resp([]);
}
before(() => { globalThis.fetch = async (url, opt) => (String(url).startsWith('http://postgrest.falso') ? postgrestFalso(url, opt) : fetchOriginal(url, opt)); });
after(() => { globalThis.fetch = fetchOriginal; });
beforeEach(() => { chamadas = []; linhas = {}; });

/* ---------- 1. horários livres seguem o índice do banco ---------- */
test('horários livres: quem já foi "Veio e fechou"/"não fechou" ainda segura a casa do consultor (índice agendamentos_slot_uk), mas não lota a recepção', () => {
  const consultores = [{ id: 'c1', nome: 'Ana', ativo: true }, { id: 'c2', nome: 'Beto', ativo: true }];
  const dia = (agendamentos, consultor_id = null) => livresDoDia({ data: '2026-10-17', agora: { data: '2026-10-16', min: 600 }, agendamentos, consultores, duracao: 30, consultor_id });
  const concl = { id: 'a', data: '2026-10-17', hora: '14:00', status: 'concluido', consultor_id: 'c1' };
  const h14 = (d) => d.horarios.find((h) => h.hora === '14:00');
  // sem consultor escolhido: a Ana está presa às 14:00, o Beto livre; a recepção (capacidade 2) ainda tem vaga
  assert.deepEqual(h14(dia([concl])).consultores_livres, ['c2']);
  assert.equal(h14(dia([concl])).livres, 2, 'concluído não ocupa lugar físico na recepção');
  // pedindo a Ana: 14:00 não é oferecido (o banco recusaria com 23505)
  assert.equal(h14(dia([concl], 'c1')), undefined);
  assert.ok(h14(dia([concl], 'c2')));
  // nao_fechou idem; cancelado e nao_veio liberam
  assert.equal(h14(dia([{ ...concl, status: 'nao_fechou' }], 'c1')), undefined);
  assert.ok(h14(dia([{ ...concl, status: 'cancelado' }], 'c1')));
  assert.ok(h14(dia([{ ...concl, status: 'nao_veio' }], 'c1')));
  // os dois consultores presos (um concluído, outro nao_fechou) → ninguém livre naquela hora
  assert.equal(h14(dia([concl, { ...concl, id: 'b', consultor_id: 'c2', status: 'nao_fechou' }])), undefined);
});

test('sugerirConsultor e distribuirSemConsultor também respeitam o índice', () => {
  const consultores = [{ id: 'c1', nome: 'Ana', ativo: 1 }, { id: 'c2', nome: 'Beto', ativo: 1 }];
  const concl = { id: 'a', data: '2026-10-17', hora: '14:00', status: 'concluido', consultor_id: 'c1' };
  assert.equal(real.sugerirConsultor({ consultores, agendamentos: [concl], data: '2026-10-17', hora: '14:00' }).id, 'c2');
  const sem = { id: 's', data: '2026-10-17', hora: '14:00', status: 'aguardando', consultor_id: null };
  const dist = real.distribuirSemConsultor({ consultores, agendamentos: [concl, sem] });
  assert.equal(dist[0].consultor_id, 'c2', 'não põe um carro novo na casa que o concluído ainda segura');
});

/* ---------- 2. dedupe do balcão ---------- */
test('agendamentoDuplicado (balcão): cancelado/faltou liberou a hora; mesmo nome com telefone diferente não é duplicado; importador mantém a regra antiga', async () => {
  linhas.agendamentos = [
    { id: ID(1), cliente_nome: 'João Silva', telefone: '12991110001', data: '2026-10-17', hora: '10:00:00', status: 'cancelado' },
    { id: ID(2), cliente_nome: 'Maria Souza', telefone: '12991110002', data: '2026-10-17', hora: '10:00:00', status: 'aguardando' },
  ];
  // balcão: o cancelado não conta — vira agendamento novo
  assert.equal(await real.agendamentoDuplicado('2026-10-17', '10:00', '12991110001', 'João Silva', { soVivos: true }), null);
  // balcão: mesma Maria (telefone igual) → duplicado; outra "Maria Souza" com outro telefone → NÃO
  assert.equal((await real.agendamentoDuplicado('2026-10-17', '10:00', '12991110002', 'Maria Souza', { soVivos: true }))?.id, ID(2));
  assert.equal(await real.agendamentoDuplicado('2026-10-17', '10:00', '12988887777', 'Maria Souza', { soVivos: true }), null);
  // sem telefone digitado, o nome igual ainda vale
  assert.equal((await real.agendamentoDuplicado('2026-10-17', '10:00', '', 'maria souza', { soVivos: true }))?.id, ID(2));
  // importador (sem a opção): regra antiga, intacta
  assert.equal((await real.agendamentoDuplicado('2026-10-17', '10:00', '12991110001', 'João Silva'))?.id, ID(1));
  assert.equal((await real.agendamentoDuplicado('2026-10-17', '10:00', '12988887777', 'Maria Souza'))?.id, ID(2));
});

/* ---------- 3. confirmação pelo link ---------- */
const TOKEN = 'ab12cd34ef56ab12cd34ef56';
const confBase = () => ({ id: ID(700), agendamento_id: ID(1), token: TOKEN, canal: 'whatsapp', resposta: null, respondido_em: null, observacao: null, created_at: '2026-10-16T10:00:00Z' });

test('responderConfirmacao: horário com desfecho ou de dia que passou não aceita; mesma resposta de novo é "repetido" e não regrava', async () => {
  const futuro = '2099-01-05';
  linhas.ag_confirmacoes = [confBase()];
  linhas.agendamentos = [{ id: ID(1), status: 'concluido', data: futuro }];
  assert.equal((await real.responderConfirmacao(TOKEN, 'nao_vem')).encerrado, true);
  assert.equal(chamadas.filter((c) => c.metodo === 'PATCH').length, 0, 'nada gravado');
  linhas.agendamentos = [{ id: ID(1), status: 'aguardando', data: '2020-01-01' }];
  assert.equal((await real.responderConfirmacao(TOKEN, 'nao_vem')).encerrado, true, 'dia que já passou');
  linhas.agendamentos = [{ id: ID(1), status: 'aguardando', data: futuro }];
  const a = await real.responderConfirmacao(TOKEN, 'remarcar', 'sexta');
  assert.equal(a.resposta, 'remarcar'); assert.ok(!a.repetido);
  const n = chamadas.filter((c) => c.metodo === 'PATCH').length;
  const b = await real.responderConfirmacao(TOKEN, 'remarcar');
  assert.equal(b.repetido, true);
  assert.equal(chamadas.filter((c) => c.metodo === 'PATCH').length, n, 'não regravou');
  // mudar de ideia (remarcar → confirmou) continua valendo
  const c = await real.responderConfirmacao(TOKEN, 'confirmou');
  assert.equal(c.resposta, 'confirmou'); assert.ok(!c.repetido);
  assert.equal(await real.responderConfirmacao('ffffffffffffffffffffffff', 'confirmou'), null);
});

/* ---------- servidor: rota pública ---------- */
const PESSOAS = { gestor: { id: ID(902), email: 'g@teste', papel: 'gestor', ativo: true, apps: ['agenda'] }, agenda: { id: ID(904), email: 'f@teste', papel: 'agenda', ativo: true, apps: ['agenda'] } };
let base, tarefas, sinos, banco;
const falso = {
  ...real,
  marcarUltimoAcesso: async () => {}, obterIntegracoes: async () => ({}), obterIaConfig: async () => ({}), templatePorGatilho: async () => null,
  auditar: async () => true,
  obterAgendamento: async (id) => (banco.has(id) ? { ...banco.get(id) } : null),
  atualizarAgendamento: async (id, campos) => { const a = banco.get(id); if (!a) return null; for (const [k, v] of Object.entries(campos)) if (v !== undefined) a[k] = v; return { ...a }; },
  obterEmpresa: async () => ({ nome: 'IndyCar', endereco: '' }),
  listarConsultores: async () => [], gestoresAtivos: async () => [{ id: ID(902) }],
  criarTarefa: async (t) => { tarefas.push(t); return t; }, notificar: async (n) => { sinos.push(n); return true; },
  listarEspera: async () => [], dispararWebhook: async () => {},
  patioDosAgendamentos: async (ids) => (ids.includes(ID(1)) ? { [ID(1)]: { os_id: ID(555), numero: 77, etapa: 'recebido', abrir: 'https://indycar-patio.netlify.app/?os=' + ID(555) } } : {}),
};
before(async () => {
  _injetar({ dados: falso, usuarioLogado: async (req) => { const t = /Bearer (\S+)/.exec(req.headers.authorization || '')?.[1]; return PESSOAS[t] ? { usuario: { ...PESSOAS[t] } } : { usuario: null, motivo: 'sem_login' }; } });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
async function chamar(quem, metodo, rota, corpo) {
  const r = await fetch(base + rota, { method: metodo, headers: { ...(quem ? { Authorization: `Bearer ${quem}` } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) };
}

test('rota pública: duas respostas iguais = UMA tarefa e UM sino; link de horário encerrado devolve 409 sem tarefa', async () => {
  tarefas = []; sinos = [];
  const fut = '2099-01-05';
  banco = new Map([[ID(1), { id: ID(1), cliente_nome: 'Ana', servico: 'Freios', data: fut, hora: '09:00', status: 'aguardando', consultor_id: null, cliente_id: null }]]);
  linhas.ag_confirmacoes = [confBase()];
  linhas.agendamentos = [{ id: ID(1), status: 'aguardando', data: fut }];
  const r1 = await chamar(null, 'POST', '/api/publico/confirmacao', { t: TOKEN, resposta: 'nao_vem' });
  const r2 = await chamar(null, 'POST', '/api/publico/confirmacao', { t: TOKEN, resposta: 'nao_vem' });
  assert.equal(r1.status, 200); assert.equal(r2.status, 200); assert.equal(r2.j.repetido, true);
  assert.equal(tarefas.length, 1, 'uma tarefa só'); assert.equal(sinos.length, 1, 'um sino só');
  // horário que já teve desfecho
  linhas.ag_confirmacoes = [confBase()]; linhas.agendamentos = [{ id: ID(1), status: 'concluido', data: fut }]; tarefas = [];
  const r3 = await chamar(null, 'POST', '/api/publico/confirmacao', { t: TOKEN, resposta: 'remarcar' });
  assert.equal(r3.status, 409); assert.match(r3.j.erro, /já passou|atendido/); assert.equal(tarefas.length, 0);
});

/* ---------- 4. aviso de remarcação ---------- */
test('aviso de remarcação: o novo cancela os pendentes antigos do mesmo horário (3 remarcações seguidas = 1 mensagem); tipo "remarcacao"; voltar a um horário antigo reativa', async () => {
  const ag = (hora) => ({ id: ID(1), cliente_id: null, lead_id: null, telefone: '12991110001', cliente_nome: 'Ana', data: '2026-10-17', hora });
  linhas.posvenda_envios = [
    { id: ID(51), chave_unica: `agenda:remarcado:${ID(1)}:2026-10-17:09:00`, status: 'pendente' },
    { id: ID(52), chave_unica: `agenda:remarcado:${ID(1)}:2026-10-17:10:00`, status: 'cancelado' },
  ];
  const r = await real.enfileirarAvisoDeRemarcacao(ag('11:00'), 'Oi Ana, remarcado para 11:00');
  assert.equal(r.ok, true);
  const cancel = chamadas.find((c) => c.metodo === 'PATCH' && c.corpo?.status === 'cancelado');
  assert.ok(cancel, 'cancelou os pendentes de outros horários');
  assert.match(decodeURIComponent(cancel.q), /chave_unica=like\.agenda:remarcado:00000000-0000-4000-8000-000000000001:\*/);
  assert.match(decodeURIComponent(cancel.q), /status=eq\.pendente/); assert.match(cancel.q, /enviando_em=is\.null/);
  const novo0 = chamadas.find((c) => c.metodo === 'POST' && c.tabela === 'posvenda_envios');
  const novo = { corpo: Array.isArray(novo0.corpo) ? novo0.corpo[0] : novo0.corpo };
  assert.equal(novo.corpo.tipo, 'remarcacao'); assert.equal(novo.corpo.chave_unica, `agenda:remarcado:${ID(1)}:2026-10-17:11:00`);
  // repetir o mesmo horário não duplica
  linhas.posvenda_envios.push({ id: ID(53), chave_unica: `agenda:remarcado:${ID(1)}:2026-10-17:11:00`, status: 'pendente' });
  assert.equal((await real.enfileirarAvisoDeRemarcacao(ag('11:00'), 'x')).repetido, true);
  // voltou a 10:00 (aviso antigo foi cancelado): renasce com o texto de agora
  const volta = await real.enfileirarAvisoDeRemarcacao(ag('10:00'), 'Oi Ana, de volta para 10:00');
  assert.equal(volta.reativado, true);
  assert.equal(linhas.posvenda_envios.find((e) => e.id === ID(52)).status, 'pendente');
  assert.equal(linhas.posvenda_envios.find((e) => e.id === ID(52)).corpo, 'Oi Ana, de volta para 10:00');
});

/* ---------- 5. edição só manda o que mudou ---------- */
test('soMudancas: a edição só envia o que a pessoa mudou (não desfaz o "Chegou" da recepção)', () => {
  const antes = { cliente_nome: 'Ana', telefone: '12991110001', veiculo: 'HB20', placa: 'ABC1D23', servico: 'Freios', data: '2026-10-17', hora: '09:00', consultor_id: null,
    origem: 'WhatsApp', status: 'aguardando', confirmado: 0, observacoes: '', cliente_id: ID(800) };
  const payload = { cliente_nome: 'Ana', telefone: '(12) 99111-0001', veiculo: 'HB20', placa: 'ABC-1D23', servico: 'Freios', data: '2026-10-17', hora: '09:00', consultor_id: null,
    origem: 'WhatsApp', status: 'aguardando', confirmado: 0, observacoes: 'Trazer o estepe', cliente_id: ID(800) };
  assert.deepEqual(P.soMudancas(payload, antes), { observacoes: 'Trazer o estepe' });
  // trocou a situação: vai a situação e a confirmação
  assert.deepEqual(P.soMudancas({ ...payload, status: 'confirmado', confirmado: 1 }, antes), { observacoes: 'Trazer o estepe', status: 'confirmado', confirmado: 1 });
  // trocou a hora e o consultor
  assert.deepEqual(P.soMudancas({ ...payload, observacoes: '', hora: '10:30', consultor_id: ID(5) }, antes), { hora: '10:30', consultor_id: ID(5) });
  // "Não veio" pela edição leva a resposta do aviso junto
  assert.deepEqual(P.soMudancas({ ...payload, observacoes: '', status: 'nao_veio', avisar_cliente: false }, antes), { status: 'nao_veio', avisar_cliente: false });
  // nada mudou → corpo vazio
  assert.deepEqual(P.soMudancas({ ...payload, observacoes: '' }, antes), {});
});

/* ---------- 6. presença (Franklin) e o Pátio ---------- */
test('presença: quem já chegou não vira "Não veio" (o WhatsApp de falta sairia para quem está na oficina); desfazer continua valendo', () => {
  assert.match(presencaPodeMarcar('compareceu', 'nao_veio'), /já chegou/);
  assert.match(presencaPodeMarcar('em_atendimento', 'nao_veio'), /já chegou/);
  assert.equal(presencaPodeMarcar('compareceu', 'aguardando'), null);
  assert.equal(presencaPodeMarcar('aguardando', 'nao_veio'), null);
  assert.equal(presencaPodeMarcar('nao_veio', 'compareceu'), null, '"Chegou mesmo assim"');
});

test('PATCH /status: desfazer a chegada devolve a OS do Pátio que continua aberta (o banco não a cancela)', async () => {
  banco = new Map([[ID(1), { id: ID(1), cliente_nome: 'Ana', servico: 'Freios', data: '2026-10-16', hora: '09:00', status: 'compareceu', compareceu: 1, confirmado: 1, telefone: '12991110001' }]]);
  const r = await chamar('agenda', 'PATCH', `/api/agendamentos/${ID(1)}/status`, { status: 'confirmado' });
  assert.equal(r.status, 200);
  assert.equal(r.j.patio_aberta.numero, 77); assert.match(r.j.patio_aberta.abrir, /\?os=/);
  assert.equal(r.j.patio, undefined);
  // Franklin não marca "Não veio" em quem já chegou
  banco.get(ID(1)).status = 'compareceu';
  assert.equal((await chamar('agenda', 'PATCH', `/api/agendamentos/${ID(1)}/status`, { status: 'nao_veio' })).status, 403);
});

/* ---------- 7. automação 16h × resposta do cliente pelo link ---------- */
test('automação 16h: quem já respondeu "remarcar"/"não vem" pelo link (e tem tarefa) não ganha também "Confirmar com o cliente"', async () => {
  const { planejar } = await import('../automacoes.js');
  const agora = new Date('2026-10-16T19:30:00Z');   // sexta 16:30 em São Paulo → alvo = sábado 17/10
  const ags = [
    { id: 'a1', data: '2026-10-17', hora: '09:00', status: 'aguardando', confirmado: false, cliente_nome: 'Ana', servico: 'Freios', consultor_id: 'c1' },
    { id: 'a2', data: '2026-10-17', hora: '10:00', status: 'aguardando', confirmado: false, cliente_nome: 'Beto', servico: 'Freios', consultor_id: 'c1' },
    { id: 'a3', data: '2026-10-17', hora: '11:00', status: 'aguardando', confirmado: false, cliente_nome: 'Caio', servico: 'Freios', consultor_id: 'c1' },
  ];
  const tarefas = [{ agendamento_id: 'a1', titulo: 'Remarcar' }, { agendamento_id: 'a2', titulo: 'Cliente avisou que não vem' }];
  const plano = planejar({ agora, agendamentos: ags, tarefas, consultores: [{ id: 'c1', perfil_id: 'p1' }], gestores: [{ id: 'g1' }] });
  assert.deepEqual(plano.tarefas.filter((t) => t.titulo === 'Confirmar com o cliente').map((t) => t.agendamento_id), ['a3']);
});

/* ---------- 8. lista de espera: dois encaixes ---------- */
test('lista de espera: o segundo encaixe do mesmo cliente não troca o horário do primeiro (409); o mesmo agendamento repetido passa', async () => {
  banco = new Map();
  const esp = { id: ID(601), status: 'agendada', agendamento_id: ID(10), cliente_nome: 'Joana', servico: 'Freios' };
  _injetar({ dados: { ...falso, obterEspera: async () => ({ ...esp }), atualizarEspera: async (id, c) => ({ ...esp, ...c }) } });
  const r = await chamar('gestor', 'PATCH', `/api/espera/${ID(601)}`, { status: 'agendada', agendamento_id: ID(11) });
  assert.equal(r.status, 409); assert.match(r.j.erro, /já foi encaixada/);
  assert.equal((await chamar('gestor', 'PATCH', `/api/espera/${ID(601)}`, { status: 'agendada', agendamento_id: ID(10) })).status, 200);
  _injetar({ dados: falso });
});

/* ---------- 9. campos do agendamento vindos de fora ---------- */
test('POST/PUT agendamento: nome/serviço só com espaços ou objeto → 400; valor "1.250,50" vira 1250.5 (não 1,25); valor inválido → 400', async () => {
  linhas = {};
  const base0 = { data: '2099-01-05', hora: '09:00', telefone: '(12) 99111-0099' };
  assert.equal((await chamar('gestor', 'POST', '/api/agendamentos', { ...base0, cliente_nome: '   ', servico: 'Freios' })).status, 400);
  assert.equal((await chamar('gestor', 'POST', '/api/agendamentos', { ...base0, cliente_nome: { x: 1 }, servico: 'Freios' })).status, 400);
  assert.equal((await chamar('gestor', 'POST', '/api/agendamentos', { ...base0, cliente_nome: 'Ana', servico: ['a'] })).status, 400);
  assert.equal((await chamar('gestor', 'POST', '/api/agendamentos', { ...base0, cliente_nome: 'Ana', servico: 'Freios', valor: 'abc' })).status, 400);
  assert.equal((await chamar('gestor', 'POST', '/api/agendamentos', { ...base0, cliente_nome: 'Ana', servico: 'Freios', valor: 9999999 })).status, 400);
  const ok1 = await chamar('gestor', 'POST', '/api/agendamentos', { ...base0, cliente_nome: '  Ana Paula  ', servico: 'Freios', valor: '1.250,50' });
  assert.equal(ok1.status, 200);
  const gravado = chamadas.filter((c) => c.metodo === 'POST' && c.tabela === 'agendamentos').map((c) => (Array.isArray(c.corpo) ? c.corpo[0] : c.corpo)).at(-1);
  assert.equal(gravado.valor, 1250.5); assert.equal(gravado.cliente_nome, 'Ana Paula');
  // edição: nome em branco recusado; valor com vírgula entendido; sem valor não mexe
  banco = new Map([[ID(1), { id: ID(1), cliente_nome: 'Ana', servico: 'Freios', data: '2099-01-05', hora: '09:00', status: 'aguardando', telefone: '12991110001' }]]);
  assert.equal((await chamar('gestor', 'PUT', `/api/agendamentos/${ID(1)}`, { cliente_nome: '  ' })).status, 400);
  const pu = await chamar('gestor', 'PUT', `/api/agendamentos/${ID(1)}`, { valor: '350,50' });
  assert.equal(pu.status, 200); assert.equal(pu.j.valor, 350.5);
});

test('CSV: valor sai com vírgula decimal (planilha BR) e em branco quando zero', async () => {
  _injetar({ dados: { ...falso, listarTodosAgendamentos: async () => [{ id: ID(1), cliente_nome: 'A', status: 'concluido', valor: 1250.5 }, { id: ID(2), cliente_nome: 'B', status: 'concluido', valor: 100 }, { id: ID(3), cliente_nome: 'C', status: 'confirmado', valor: 0 }] } });
  const r = await fetch(base + '/api/export/agendamentos.csv', { headers: { Authorization: 'Bearer gestor' } });
  const txt = await r.text();
  assert.match(txt, /"concluido";"não";"1250,50"/); assert.match(txt, /"concluido";"não";"100"/); assert.doesNotMatch(txt, /1250\.5/);
  assert.match(txt, /"confirmado";"não";"";/);
  _injetar({ dados: falso });
});

/* ---------- 10. sair em outro app da Central ---------- */
test('app.js: SIGNED_OUT (saiu em outro app) volta ao login, para os relógios e fecha o modal', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const bloco = src.slice(src.indexOf("onAuthStateChange((evento)"), src.indexOf('if (voltaDeRecuperacao) return;'));
  assert.match(bloco, /evento === 'SIGNED_OUT'/);
  assert.match(bloco, /clearInterval\(state\._cxTimer\)/);
  assert.match(bloco, /state\._repintar = null/);
  assert.match(bloco, /closeModal\(\)/);
  assert.match(bloco, /mostrarLogin\(/);
});
