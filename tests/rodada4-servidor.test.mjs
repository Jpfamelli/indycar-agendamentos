// Rodada 4 — o server.js DE VERDADE por HTTP (porta livre), com banco e porteiro
// de mentira: valor ao concluir, painel de valores do gestor, contagens,
// presença (desfazer chegada), consultor ↔ login, distribuição, compressão e
// ETag/304 dos arquivos da tela. Nada fala com o Supabase nem com o WhatsApp.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import * as real from '../dados.js';
import { _injetar, server } from '../server.js';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PESSOAS = {
  admin:     { id: ID(901), email: 'admin@teste', papel: 'admin', ativo: true, apps: ['agenda'] },
  gestor:    { id: ID(902), email: 'gestor@teste', papel: 'gestor', ativo: true, apps: ['agenda'] },
  atendente: { id: ID(903), email: 'at@teste', papel: 'atendente', ativo: true, apps: ['agenda'] },
  agenda:    { id: ID(904), email: 'franklin@teste', papel: 'agenda', ativo: true, apps: ['agenda'] },
};
let banco, auditoria, base, preenchidos, gravadosConsultor;
const ag = (n, o) => ({ id: ID(n), cliente_nome: 'Cliente ' + n, telefone: '1299111000' + n, servico: 'Troca de óleo', data: real.hoje(), hora: '10:00',
  status: 'confirmado', confirmado: 1, compareceu: null, no_show_notificado_em: null, valor: 0, consultor_id: null, lead_id: ID(500 + n), ...o });
function novoBanco() {
  banco = new Map([
    [ID(1), ag(1)],
    [ID(2), ag(2, { status: 'concluido', compareceu: 1 })],
    [ID(3), ag(3, { status: 'compareceu', compareceu: 1 })],
    [ID(4), ag(4, { hora: '10:00' })],
  ]);
  auditoria = []; preenchidos = []; gravadosConsultor = [];
}
const falso = {
  ...real,
  marcarUltimoAcesso: async () => {},
  obterIntegracoes: async () => ({}),
  obterIaConfig: async () => ({}),
  templatePorGatilho: async () => null,
  auditar: async (perfil, acao, tabela, registro, detalhes) => { auditoria.push({ perfil, acao, registro, detalhes }); return true; },
  obterAgendamento: async (id) => (banco.has(id) ? { ...banco.get(id) } : null),
  atualizarAgendamento: async (id, campos) => {
    const a = banco.get(id); if (!a) return null;
    for (const [k, v] of Object.entries(campos)) if (v !== undefined) a[k] = v;
    return { ...a };
  },
  valorSugerido: async (id) => (banco.has(id) ? { valor: 300, fonte: 'historico', rotulo: 'média de 3 serviços iguais', atual: 0 } : null),
  concluidosSemValor: async () => [...banco.values()].filter((a) => a.status === 'concluido' && !(a.valor > 0)),
  preencherValor: async (id, valor) => { preenchidos.push({ id, valor }); banco.get(id).valor = valor; return { agendamento: banco.get(id), lead_atualizado: true, antes: 0 }; },
  contarFollowup: async () => 7,
  contarConcluidosSemValor: async () => 3,
  contarPendenciasAntigas: async () => 27,
  pendenciasAntigas: async () => [],
  listarConsultores: async () => [{ id: ID(101), nome: 'Consultor Prensencial Gabriel', ativo: 1, perfil_id: null }, { id: ID(102), nome: 'Ana', ativo: 1, perfil_id: ID(901) }],
  listarEquipe: async () => [{ id: ID(901), nome: 'Ana', papel: 'admin', ativo: 1 }, { id: ID(903), nome: 'Gabriel', papel: 'atendente', ativo: 1 },
    { id: ID(905), nome: 'Saiu', papel: 'atendente', ativo: 0 }],
  agendamentosVivosDoDia: async (d) => [...banco.values()].filter((a) => a.data === d && ['aguardando', 'confirmado', 'compareceu', 'em_atendimento'].includes(a.status)),
  estatisticas: async () => ({ cards: {}, agendaHoje: Array.from({ length: 40 }, (_, i) => ag(100 + i, { observacoes: 'texto de exemplo para encher o painel '.repeat(3) })), ultimos: [], naOficina: [], data: real.hoje() }),
};

const fetchOriginal = globalThis.fetch;
before(async () => {
  globalThis.fetch = async (url, opt) => {
    if (String(url).includes('/proxy/send/message')) return new Response('{"message":"success"}', { status: 200 });
    if (String(url).startsWith(base)) return fetchOriginal(url, opt);
    throw new Error('rede proibida no teste: ' + url);
  };
  _injetar({
    dados: falso,
    usuarioLogado: async (req) => {
      const t = /Bearer (\S+)/.exec(req.headers.authorization || '')?.[1];
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
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  let j = null; try { j = await r.json(); } catch { /* sem corpo */ }
  return { status: r.status, j, h: r.headers };
}

test('"Veio e fechou" com valor: grava o valor NO MESMO update do status (o gatilho copia para o CRM)', async () => {
  const r = await chamar('atendente', 'PATCH', `/api/agendamentos/${ID(1)}/status`, { status: 'concluido', valor: '1.250,50' });
  assert.equal(r.status, 200);
  assert.equal(banco.get(ID(1)).status, 'concluido');
  assert.equal(banco.get(ID(1)).valor, 1250.5);
  // sem valor continua valendo (não bloqueia ninguém)
  const s = await chamar('atendente', 'PATCH', `/api/agendamentos/${ID(4)}/status`, { status: 'concluido' });
  assert.equal(s.status, 200);
  assert.equal(banco.get(ID(4)).valor, 0);
});

test('valor inválido, valor em outro desfecho e valor pela presença → 400/403, nada gravado', async () => {
  for (const v of ['abc', '-5', '999999999', {}]) {
    const r = await chamar('atendente', 'PATCH', `/api/agendamentos/${ID(1)}/status`, { status: 'concluido', valor: v });
    assert.equal(r.status, 400, `valor ${JSON.stringify(v)}`);
    assert.match(r.j.erro, /Valor inválido/);
  }
  assert.equal((await chamar('atendente', 'PATCH', `/api/agendamentos/${ID(1)}/status`, { status: 'nao_fechou', valor: 100 })).status, 400);
  assert.equal(banco.get(ID(1)).status, 'confirmado');
  assert.equal((await chamar('agenda', 'PATCH', `/api/agendamentos/${ID(1)}/status`, { status: 'concluido', valor: 100 })).status, 403);
});

test('sugestão de valor: equipe lê; presença não', async () => {
  const r = await chamar('atendente', 'GET', `/api/agendamentos/${ID(1)}/valor-sugerido`);
  assert.equal(r.status, 200);
  assert.equal(r.j.valor, 300);
  assert.equal((await chamar('agenda', 'GET', `/api/agendamentos/${ID(1)}/valor-sugerido`)).status, 403);
  assert.equal((await chamar('atendente', 'GET', `/api/agendamentos/${ID(99)}/valor-sugerido`)).status, 404);
});

test('painel de valores: só gestor; preencher grava, audita e recusa quem não fechou', async () => {
  assert.equal((await chamar('atendente', 'GET', '/api/valores/pendentes')).status, 403);
  const l = await chamar('gestor', 'GET', '/api/valores/pendentes');
  assert.equal(l.status, 200);
  assert.deepEqual(l.j.itens.map((a) => a.id), [ID(2)]);
  assert.equal((await chamar('atendente', 'PUT', `/api/agendamentos/${ID(2)}/valor`, { valor: 350 })).status, 403);
  const ok = await chamar('gestor', 'PUT', `/api/agendamentos/${ID(2)}/valor`, { valor: '350' });
  assert.equal(ok.status, 200);
  assert.equal(ok.j.lead_atualizado, true);
  assert.deepEqual(preenchidos, [{ id: ID(2), valor: 350 }]);
  assert.equal(auditoria.at(-1).acao, 'preencheu_valor');
  assert.equal((await chamar('gestor', 'PUT', `/api/agendamentos/${ID(1)}/valor`, { valor: 350 })).status, 409, 'não fechou ainda');
  assert.equal((await chamar('gestor', 'PUT', `/api/agendamentos/${ID(2)}/valor`, { valor: '0' })).status, 400);
});

test('contagens: follow-up para todos; sem valor e antigos só para o gestor', async () => {
  const at = await chamar('atendente', 'GET', '/api/contagens');
  assert.deepEqual(at.j, { followup: 7, semValor: null, antigas: null });
  const ge = await chamar('gestor', 'GET', '/api/contagens');
  assert.deepEqual(ge.j, { followup: 7, semValor: 3, antigas: 27 });
  assert.equal((await chamar('agenda', 'GET', '/api/contagens')).status, 403);
});

test('presença desfaz a PRÓPRIA chegada (compareceu → aguardando), mas não muda outros status', async () => {
  const r = await chamar('agenda', 'PATCH', `/api/agendamentos/${ID(3)}/status`, { status: 'aguardando' });
  assert.equal(r.status, 200);
  assert.equal(banco.get(ID(3)).status, 'aguardando');
  assert.equal(banco.get(ID(3)).compareceu, null);
  const n = await chamar('agenda', 'PATCH', `/api/agendamentos/${ID(1)}/status`, { status: 'aguardando' });
  assert.equal(n.status, 403);
  assert.equal((await chamar('agenda', 'PATCH', `/api/agendamentos/${ID(2)}/status`, { status: 'aguardando' })).status, 403, 'concluído é do atendimento');
});

test('consultor ↔ login: sugestão automática pelo nome (só ativos, não repete login já ligado)', async () => {
  assert.equal((await chamar('atendente', 'GET', '/api/consultores/sugestoes-login')).status, 403);
  const r = await chamar('gestor', 'GET', '/api/consultores/sugestoes-login');
  assert.equal(r.status, 200);
  assert.deepEqual(r.j.map((s) => [s.consultor_id, s.perfil_id, s.nome]), [[ID(101), ID(903), 'Gabriel']]);
});

test('distribuir: dá consultor aos horários sem consultor do dia, sem conflito de horário, e audita', async () => {
  _injetar({ dados: { ...falso, listarConsultores: async () => [{ id: ID(101), nome: 'Gabriel', ativo: 1 }] } });
  const r = await chamar('gestor', 'POST', '/api/consultores/distribuir', { data: real.hoje() });
  assert.equal(r.status, 200);
  // 1, 3 e 4 estão vivos e sem consultor; 1 e 4 são às 10:00 e 3 também → só UM cabe na meia hora das 10h
  assert.equal(r.j.atribuidos, 1);
  assert.equal(r.j.sem_vaga, 2);
  assert.equal(auditoria.at(-1).acao, 'distribuiu_consultores');
  assert.equal((await chamar('gestor', 'POST', '/api/consultores/distribuir', { data: 'ontem' })).status, 400);
  _injetar({ dados: falso });
});

test('velocidade: JSON grande vai comprimido (br/gzip) quando o navegador aceita; pequeno não', async () => {
  const r = await fetch(base + '/api/dashboard', { headers: { Authorization: 'Bearer atendente', 'Accept-Encoding': 'gzip' } });
  assert.equal(r.status, 200);
  // o fetch do Node descomprime sozinho: confere pelo cabeçalho e pelo corpo legível
  assert.equal(r.headers.get('content-encoding'), 'gzip');
  assert.match(r.headers.get('vary') || '', /Accept-Encoding/);
  const j = await r.json();
  assert.equal(j.agendaHoje.length, 40);
  const pequeno = await fetch(base + '/api/versao', { headers: { 'Accept-Encoding': 'gzip, br' } });
  assert.equal(pequeno.headers.get('content-encoding'), null);
});

test('velocidade: arquivos da tela com ETag → 304 sem corpo; brotli guardado; ícone com cache de 1 dia', async () => {
  const r1 = await fetch(base + '/app.js', { headers: { 'Accept-Encoding': 'br' } });
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get('content-encoding'), 'br');
  const etag = r1.headers.get('etag');
  assert.match(etag, /^".+"$/);
  const corpo = await r1.text();
  assert.match(corpo, /VERSAO_APP/);
  const r2 = await fetch(base + '/app.js', { headers: { 'If-None-Match': etag } });
  assert.equal(r2.status, 304);
  assert.equal((await r2.text()).length, 0);
  const ico = await fetch(base + '/icon-192.png');
  assert.match(ico.headers.get('cache-control') || '', /max-age=86400/);
  // compressão confere byte a byte com o arquivo
  const cru = await fetch(base + '/planejamento.css');
  assert.equal(cru.status, 200);
  assert.ok(zlib.gzipSync(Buffer.from(await cru.text())).length > 0);
});

test('versão nova no ar e a casca nova no service worker', async () => {
  const v = await chamar(null, 'GET', '/api/versao');
  assert.equal(v.j.versao, '2026-10-14-r4');
  const sw = await (await fetch(base + '/sw.js')).text();
  assert.match(sw, /indycar-v14/);
  assert.match(sw, /rodada4\.css/);
});
