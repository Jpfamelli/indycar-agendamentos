// Testa o server.js DE VERDADE (HTTP de verdade, numa porta livre) com um
// banco e um porteiro de mentira injetados (_injetar). Cobre os papéis, o
// bloqueio do aviso de falta pela edição, a auditoria, CORS e erros.
// Nada aqui fala com o Supabase nem com o WhatsApp: o fetch de fora é dublê.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as real from '../dados.js';
import { _injetar, server } from '../server.js';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PESSOAS = {
  admin:      { id: ID(901), email: 'admin@teste', papel: 'admin', ativo: true, apps: ['agenda'] },
  gestor:     { id: ID(902), email: 'gestor@teste', papel: 'gestor', ativo: true, apps: ['agenda', 'crm'] },
  atendente:  { id: ID(903), email: 'at@teste', papel: 'atendente', ativo: true, apps: ['agenda', 'crm'] },
  agenda:     { id: ID(904), email: 'franklin@teste', papel: 'agenda', ativo: true, apps: ['agenda'] },
  semapp:     { id: ID(905), email: 'semapp@teste', papel: 'atendente', ativo: true, apps: ['crm'] },
};

let banco, auditoria, enviosWhats, base, modoWhats = 'ok';
function novoBanco() {
  banco = {
    ags: new Map([
      [ID(1), { id: ID(1), cliente_nome: 'Maria', telefone: '12991110001', servico: 'Troca de óleo', data: real.hoje(), hora: '10:00', status: 'confirmado', confirmado: 1, compareceu: null, no_show_notificado_em: null }],
      [ID(2), { id: ID(2), cliente_nome: 'João', telefone: '12991110002', servico: 'Freio', data: real.hoje(), hora: '11:00', status: 'concluido', confirmado: 1, compareceu: 1, no_show_notificado_em: null }],
    ]),
    tarefas: new Map([[ID(50), { id: ID(50), titulo: 'De outra pessoa', responsavel_id: ID(902), criado_por: ID(902), status: 'aberta' }]]),
    lidas: [],
  };
  auditoria = []; enviosWhats = [];
}

const falso = {
  ...real,
  marcarUltimoAcesso: async () => {},
  obterIntegracoes: async () => ({}),
  obterIaConfig: async () => ({ cw_api_key: 'chave-de-teste', cw_device_id: 'aparelho-teste' }),
  templatePorGatilho: async () => null,
  registrarMensagem: async () => ({ id: 'm1' }),
  auditar: async (perfil, acao, tabela, registro, detalhes) => { auditoria.push({ perfil, acao, tabela, registro, detalhes }); return true; },
  obterAgendamento: async (id) => (banco.ags.has(id) ? { ...banco.ags.get(id) } : null),
  atualizarAgendamento: async (id, campos) => {
    const a = banco.ags.get(id); if (!a) return null;
    for (const [k, v] of Object.entries(campos)) if (v !== undefined && k in a || ['no_show_notificado_em', 'consultor_id'].includes(k)) a[k] = v;
    return { ...a };
  },
  removerAgendamento: async (id) => banco.ags.delete(id),
  listarAgendamentos: async () => [...banco.ags.values()].map((a) => ({ ...a })),
  obterPerfil: async (id) => ({ id, nome: 'Fulano', papel: Object.values(PESSOAS).find((p) => p.id === id)?.papel, pode_agenda: true }),
  listarClientes: async () => [],
  listarNotificacoes: async (perfil) => ({ itens: [{ id: ID(70), titulo: `para ${perfil}` }], naoLidas: 1 }),
  marcarNotificacoesLidas: async (perfil, ids) => { banco.lidas.push({ perfil, ids }); return 1; },
  listarTarefasDe: async (perfil) => [...banco.tarefas.values()].filter((t) => t.responsavel_id === perfil),
  obterTarefa: async (id) => banco.tarefas.get(id) || null,
  mudarStatusTarefa: async (id, status) => ({ ...banco.tarefas.get(id), status }),
  criarTarefa: async (t) => { const n = { id: ID(60), ...t, status: 'aberta' }; banco.tarefas.set(n.id, n); return n; },
  listarTodosAgendamentos: async () => [],
  buscaGlobal: async () => { throw Object.assign(new Error('relation "xyz" does not exist — detalhe interno'), { name: 'ErroSupabase', status: 400 }); },
  resumoDoPerfil: async (id) => ({ papel: Object.values(PESSOAS).find((p) => p.id === id)?.papel || 'atendente', ativo: true }),
  contarAdminsAtivos: async () => 2,
  definirPapel: async () => {},
};

const fetchOriginal = globalThis.fetch;
before(async () => {
  // o aviso de falta sai pelo CodeWords: aqui o dublê só anota e diz "success"
  globalThis.fetch = async (url, opt) => {
    if (String(url).includes('/proxy/send/message')) {
      // 16/10: 'timeout' e 'caiu' = o pedido chegou ao CodeWords e a resposta não voltou; 'recusou' = nada saiu
      if (modoWhats === 'recusou') throw new TypeError('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) });
      enviosWhats.push({ url: String(url), corpo: String(opt?.body || '') });
      if (modoWhats === 'timeout') throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      if (modoWhats === 'caiu') throw new TypeError('fetch failed', { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) });
      if (modoWhats === '500') return new Response('{"detail":"internal"}', { status: 500 });
      return new Response('{"code":"SUCCESS","message":"success"}', { status: 200 });
    }
    if (String(url).startsWith(base)) return fetchOriginal(url, opt);
    throw new Error('rede proibida no teste: ' + url);
  };
  _injetar({
    dados: falso,
    usuarioLogado: async (req) => {
      const t = /Bearer (\S+)/.exec(req.headers.authorization || '')?.[1];
      if (t === 'desativado') return { usuario: null, motivo: 'desativado' };
      return PESSOAS[t] ? { usuario: { ...PESSOAS[t] } } : { usuario: null, motivo: 'sem_login' };
    },
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { globalThis.fetch = fetchOriginal; server.close(); });
beforeEach(() => { novoBanco(); _injetar({}); });

async function chamar(quem, metodo, rota, corpo, extra = {}) {
  const r = await fetch(base + rota, {
    method: metodo,
    headers: { ...(quem ? { Authorization: `Bearer ${quem}` } : {}), 'Content-Type': 'application/json', ...extra },
    body: corpo === undefined ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
  });
  let j = null; try { j = await r.json(); } catch { /* sem corpo */ }
  return { status: r.status, j, h: r.headers };
}

test('sem login → 401; desativado no meio do uso → 403 com código', async () => {
  assert.equal((await chamar(null, 'GET', '/api/agendamentos')).status, 401);
  const d = await chamar('desativado', 'GET', '/api/agendamentos');
  assert.equal(d.status, 403);
  assert.equal(d.j.codigo, 'desativado');
});

test('sem a Agenda em perfis.apps → 403 sem_acesso_app, mas lê o próprio perfil', async () => {
  const r = await chamar('semapp', 'GET', '/api/agendamentos');
  assert.equal(r.status, 403);
  assert.equal(r.j.codigo, 'sem_acesso_app');
  assert.equal((await chamar('semapp', 'GET', '/api/perfil')).status, 200);
});

test('papel agenda (Franklin): só presença — sem telefone, sem clientes, sem desfecho comercial', async () => {
  const lista = await chamar('agenda', 'GET', '/api/agendamentos');
  assert.equal(lista.status, 200);
  assert.ok(lista.j.every((a) => !('telefone' in a)));
  assert.equal((await chamar('agenda', 'GET', '/api/clientes')).j.codigo, 'so_presenca');
  assert.equal((await chamar('agenda', 'GET', '/api/busca?q=ma')).status, 403);
  assert.equal((await chamar('agenda', 'PATCH', `/api/agendamentos/${ID(1)}/status`, { status: 'concluido' })).status, 403);
  assert.equal((await chamar('agenda', 'PATCH', `/api/agendamentos/${ID(2)}/status`, { status: 'compareceu' })).status, 403, 'não desfaz "Veio e fechou"');
  assert.equal((await chamar('agenda', 'PATCH', `/api/agendamentos/${ID(1)}/status`, { status: 'compareceu' })).status, 200);
  // sino e minhas tarefas valem para ele também
  assert.equal((await chamar('agenda', 'GET', '/api/notificacoes')).status, 200);
  assert.equal((await chamar('agenda', 'GET', '/api/tarefas')).status, 200);
  assert.equal((await chamar('agenda', 'POST', '/api/tarefas', { titulo: 'x' })).status, 403);
});

test('atendente não apaga nem exporta; gestor apaga e fica na auditoria', async () => {
  const r = await chamar('atendente', 'DELETE', `/api/agendamentos/${ID(1)}`);
  assert.equal(r.status, 403);
  assert.equal(r.j.codigo, 'so_gestor');
  assert.equal((await chamar('atendente', 'GET', '/api/export/agendamentos.csv')).status, 403);
  assert.equal((await chamar('atendente', 'PUT', '/api/whatsapp/ia/config', { cw_api_key: 'x' })).status, 403);
  assert.equal(banco.ags.has(ID(1)), true);
  const g = await chamar('gestor', 'DELETE', `/api/agendamentos/${ID(1)}`);
  assert.equal(g.status, 200);
  assert.equal(banco.ags.has(ID(1)), false);
  assert.deepEqual(auditoria.map((a) => [a.perfil, a.acao]), [[ID(902), 'apagou_agendamento']]);
});

test('exportar CSV é auditado', async () => {
  const r = await fetch(base + '/api/export/agendamentos.csv', { headers: { Authorization: 'Bearer gestor' } });
  assert.equal(r.status, 200);
  assert.equal(auditoria[0].acao, 'exportou_csv');
});

test('"Não veio" pela EDIÇÃO sem resposta → 409 pedindo confirmação, nada gravado, nada enviado', async () => {
  const r = await chamar('atendente', 'PUT', `/api/agendamentos/${ID(1)}`, { status: 'nao_veio' });
  assert.equal(r.status, 409);
  assert.equal(r.j.codigo, 'confirmar_aviso');
  assert.equal(banco.ags.get(ID(1)).status, 'confirmado');
  assert.equal(enviosWhats.length, 0);
});

test('"Não veio" pela edição com avisar_cliente=false → carimba junto (o gatilho do banco não dispara)', async () => {
  const r = await chamar('atendente', 'PUT', `/api/agendamentos/${ID(1)}`, { status: 'nao_veio', avisar_cliente: false });
  assert.equal(r.status, 200);
  const a = banco.ags.get(ID(1));
  assert.equal(a.status, 'nao_veio');
  assert.ok(a.no_show_notificado_em, 'carimbo gravado no mesmo update do status');
  assert.equal(enviosWhats.length, 0);
});

test('"Não veio" pela edição com avisar_cliente=true → mesmo fluxo do cartão: envia UMA vez e carimba', async () => {
  const r = await chamar('atendente', 'PUT', `/api/agendamentos/${ID(1)}`, { status: 'nao_veio', avisar_cliente: true, observacoes: 'faltou' });
  assert.equal(r.status, 200);
  assert.equal(r.j.aviso_ausencia?.ok, true);
  assert.equal(enviosWhats.length, 1);
  assert.ok(banco.ags.get(ID(1)).no_show_notificado_em);
  // clicar de novo não reenvia
  await chamar('atendente', 'PATCH', `/api/agendamentos/${ID(1)}/status`, { status: 'nao_veio' });
  assert.equal(enviosWhats.length, 1);
});

for (const modo of ['timeout', 'caiu']) {
  test(`"Não veio" com o WhatsApp sem resposta (${modo}): avisa "não sabemos se chegou" e o próximo clique NÃO reenvia`, async () => {
    modoWhats = modo;
    try {
      const r = await chamar('atendente', 'PATCH', `/api/agendamentos/${ID(1)}/status`, { status: 'nao_veio' });
      assert.equal(r.status, 200);
      assert.equal(r.j.aviso_ausencia?.ok, false); assert.equal(r.j.aviso_ausencia?.semConfirmacao, true);
      assert.match(r.j.aviso_ausencia.erro, /não sabemos se chegou/);
      assert.ok(banco.ags.get(ID(1)).no_show_notificado_em, 'o carimbo fica: pode ter chegado');
      modoWhats = 'ok';
      await chamar('atendente', 'PATCH', `/api/agendamentos/${ID(1)}/status`, { status: 'nao_veio' });
      assert.equal(enviosWhats.length, 1, 'nada de segundo aviso');
    } finally { modoWhats = 'ok'; }
  });
}
for (const modo of ['recusou', '500']) {
  test(`"Não veio" com falha que garantidamente não enviou (${modo}): solta o carimbo e o próximo clique tenta de novo`, async () => {
    modoWhats = modo;
    try {
      const r = await chamar('atendente', 'PATCH', `/api/agendamentos/${ID(1)}/status`, { status: 'nao_veio' });
      assert.equal(r.j.aviso_ausencia?.ok, false); assert.ok(!r.j.aviso_ausencia?.semConfirmacao);
      assert.equal(banco.ags.get(ID(1)).no_show_notificado_em, null);
      modoWhats = 'ok';
      const r2 = await chamar('atendente', 'PATCH', `/api/agendamentos/${ID(1)}/status`, { status: 'nao_veio' });
      assert.equal(r2.j.aviso_ausencia?.ok, true);
    } finally { modoWhats = 'ok'; }
  });
}

test('mudar um desfecho já registrado vai para a auditoria', async () => {
  await chamar('atendente', 'PATCH', `/api/agendamentos/${ID(2)}/status`, { status: 'nao_fechou' });
  const a = auditoria.find((x) => x.acao === 'mudou_desfecho');
  assert.ok(a);
  assert.deepEqual([a.detalhes.de, a.detalhes.para], ['concluido', 'nao_fechou']);
  // marcar o primeiro desfecho NÃO é mudança
  auditoria.length = 0;
  await chamar('atendente', 'PATCH', `/api/agendamentos/${ID(1)}/status`, { status: 'concluido' });
  assert.equal(auditoria.length, 0);
});

test('CORS só para o ecossistema; preflight responde 204', async () => {
  const fora = await chamar('admin', 'GET', '/api/perfil', undefined, { Origin: 'https://site-malicioso.example' });
  assert.equal(fora.status, 403);
  const crm = await chamar('admin', 'GET', '/api/perfil', undefined, { Origin: 'https://indycar-crm.onrender.com' });
  assert.equal(crm.status, 200);
  assert.equal(crm.h.get('access-control-allow-origin'), 'https://indycar-crm.onrender.com');
  const pre = await fetch(base + '/api/perfil', { method: 'OPTIONS', headers: { Origin: 'https://indycar-crm.onrender.com' } });
  assert.equal(pre.status, 204);
});

test('cabeçalhos de segurança, JSON inválido 400, UUID validado, erro interno sem detalhe', async () => {
  const r = await chamar('admin', 'GET', '/api/perfil');
  assert.match(r.h.get('strict-transport-security') || '', /max-age=31536000/);
  assert.match(r.h.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.equal(r.h.get('x-content-type-options'), 'nosniff');
  assert.equal((await chamar('admin', 'PUT', '/api/perfil', '{quebrado')).status, 400);
  assert.equal((await chamar('admin', 'GET', '/api/agendamentos?consultor_id=1%20or%201=1')).status, 400);
  assert.equal((await chamar('admin', 'GET', '/api/whatsapp/mensagens?agendamento_id=abc')).status, 400);
  const e = await chamar('admin', 'GET', '/api/busca?q=maria');
  assert.equal(e.status, 500);
  assert.doesNotMatch(e.j.erro, /relation|xyz|interno —/);
  assert.match(e.j.erro, /código/);
});

test('notificações e tarefas: sempre as DA PESSOA do token; tarefa de outro não se conclui', async () => {
  const n = await chamar('atendente', 'GET', '/api/notificacoes');
  assert.equal(n.j.itens[0].titulo, `para ${ID(903)}`);
  await chamar('atendente', 'POST', '/api/notificacoes/lidas', { todas: true, perfil_id: ID(901) });
  assert.equal(banco.lidas[0].perfil, ID(903), 'perfil_id do corpo é ignorado');
  assert.equal((await chamar('atendente', 'PATCH', `/api/tarefas/${ID(50)}`, { status: 'feita' })).status, 403);
  assert.equal((await chamar('gestor', 'PATCH', `/api/tarefas/${ID(50)}`, { status: 'feita' })).status, 200);
  const nova = await chamar('atendente', 'POST', '/api/tarefas', { titulo: 'Ligar para a Maria', agendamento_id: ID(1) });
  assert.equal(nova.status, 201);
  assert.equal(nova.j.responsavel_id, ID(903));
  assert.equal(nova.j.criado_por, ID(903));
  assert.equal((await chamar('atendente', 'POST', '/api/tarefas', { titulo: 'x', agendamento_id: 'nao-e-uuid' })).status, 400);
});

test('equipe: só admin muda papel (gestor existe) e a troca é auditada', async () => {
  assert.equal((await chamar('gestor', 'POST', '/api/equipe/papel', { id: ID(903), papel: 'gestor' })).status, 403);
  const r = await chamar('admin', 'POST', '/api/equipe/papel', { id: ID(903), papel: 'gestor' });
  assert.equal(r.status, 200);
  assert.equal(r.j.papel, 'gestor');
  assert.equal(auditoria.at(-1).acao, 'mudou_papel');
  assert.equal((await chamar('admin', 'POST', '/api/equipe/apps', { id: ID(904), apps: ['crm'] })).status, 400, 'papel agenda fica só com a Agenda');
});

test('perfil: não deixa mudar papel pelo "Meu perfil" e valida a cor', async () => {
  let gravado = null;
  _injetar({ dados: { ...falso, atualizarMeuPerfil: async (id, campos) => { gravado = { id, campos }; return { id }; } } });
  await chamar('atendente', 'PUT', '/api/perfil', { nome: 'Gabi', papel: 'admin', apps: ['ads'], cargo: 'Consultora' });
  assert.deepEqual(Object.keys(gravado.campos).sort(), ['cargo', 'nome']);
  assert.equal(gravado.id, ID(903));
  assert.equal((await chamar('atendente', 'PUT', '/api/perfil', { avatar_cor: 'red;x' })).status, 400);
  _injetar({ dados: falso });
});
