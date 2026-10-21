'use strict';
/* Rodada 6 (C3): rotas HTTP /api/r6/* — login obrigatório, validação de id, limite, papéis e formato. */
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { criarSbFalso } = require('./apoio/sb-falso.js');
const { criarR6 } = require('../lib/r6-dados.js');
const { criarZap } = require('../lib/zap-estado.js');
const { criarRotasR6 } = require('../lib/rotas-r6.js');

const CLI = '0bf5de3c-669d-41db-a0f8-6f76343a490b';
const CONV = '33b965a4-65e0-4562-a1b0-952466991b2c';
const MSG = '66b965a4-65e0-4562-a1b0-952466991b2c';
const AGORA = new Date('2026-10-21T15:00:00Z');
const iso = (min) => new Date(AGORA.getTime() - min * 60000).toISOString();
const ATENDENTE = { id: 'p1', nome: 'Ana', papel: 'atendente' };
const GESTOR = { id: 'p2', nome: 'Gui', papel: 'gestor' };

async function subir({ quem = ATENDENTE, semBanco = false, limite = null } = {}) {
  const sb = criarSbFalso({
    conversas: [{ id: CONV, cliente_id: CLI, nome: 'Camila', telefone: '5512988660661', telefone_e164: '5512988660661', tipo: 'atendimento', desfecho: null, nao_lidas: 1, ultima_mensagem_em: iso(10), atribuida_a: null }],
    whatsapp_mensagens: [
      { id: 'm2', conversa_id: CONV, direcao: 'entrada', corpo: 'meu carro já ficou pronto?', created_at: iso(10), status: 'recebido' },
      { id: '66b965a4-65e0-4562-a1b0-952466991b2c', conversa_id: CONV, direcao: 'saida', corpo: 'Oi', status: 'falhou', erro: 'WhatsApp parado', created_at: iso(40) },
    ],
    clientes: [{ id: CLI, nome: 'Camila', telefone: '12988660661', telefone_e164: '12988660661', carro_modelo: 'Onix', carro_ano: 2020, placa: 'ABC1D23' }],
    patio_os: [], patio_extras: [], orc_orcamentos: [], tarefas: [], r6_c3_marcas: [],
  }, { relogio: () => AGORA, rpc: { r6_cliente_360: () => ({ data: { orcamentos: [], patio: [], agendamentos: [], leads: [], linha_do_tempo: [], links: {}, resumo: {} }, error: null }) } });
  const zap = criarZap({ agora: () => AGORA.getTime() });
  const dados = criarR6({ sb, agora: () => AGORA, log: () => {} });
  const chamadas = {};
  const rotas = criarRotasR6({
    getSb: () => (semBanco ? null : sb), usuarioLogado: async (req) => (req.headers.authorization ? quem : null),
    dentroDoLimite: (k) => { chamadas[k] = (chamadas[k] || 0) + 1; return limite ? chamadas[k] <= limite : true; },
    readBody: async (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok({}); } }); }),
    dados, zap, auditar: async () => ({ ok: true }),
  });
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!(await rotas(req, res, url.pathname))) { res.writeHead(404); res.end('{}'); }
  });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const chamar = async (caminho, { metodo = 'GET', corpo, logado = true } = {}) => {
    const r = await fetch(base + caminho, { method: metodo, headers: { ...(logado ? { Authorization: 'Bearer x' } : {}), 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    return { status: r.status, cab: r.headers, j: await r.json() };
  };
  return { chamar, zap, sb, fechar: () => { srv.closeAllConnections?.(); srv.close(); } };
}

test('toda rota exige login (401) e responde sem cache', async () => {
  const s = await subir();
  for (const [m, c] of [['GET', '/api/r6/fila'], ['GET', `/api/r6/cliente/${CLI}`], ['GET', `/api/r6/patio/${CLI}`], ['GET', `/api/r6/sugestoes/${CONV}`],
    ['GET', `/api/r6/conversas/${CONV}/ia`], ['POST', `/api/r6/conversas/${CONV}/passar-consultor`], ['GET', '/api/r6/zap'], ['GET', '/api/r6/nao-sairam'],
    ['POST', '/api/r6/nao-sairam/resolver'], ['POST', '/api/r6/testar-mensagem']]) {
    const r = await s.chamar(c, { metodo: m, logado: false, corpo: m === 'POST' ? {} : undefined });
    assert.strictEqual(r.status, 401, `${m} ${c}`);
  }
  const ok = await s.chamar('/api/r6/zap');
  assert.strictEqual(ok.cab.get('cache-control'), 'no-store');
  s.fechar();
});

test('id inválido vira 400 e rota desconhecida 404 (sem tocar no banco)', async () => {
  const s = await subir();
  assert.strictEqual((await s.chamar('/api/r6/cliente/abc')).status, 400);
  assert.strictEqual((await s.chamar('/api/r6/patio/1;drop')).status, 400);
  assert.strictEqual((await s.chamar('/api/r6/sugestoes/x')).status, 400);
  assert.strictEqual((await s.chamar('/api/r6/conversas/x/ia')).status, 400);
  assert.strictEqual((await s.chamar('/api/r6/nada')).status, 404);
  s.fechar();
});

test('sem a chave de serviço do banco: 503 em português, nunca 500', async () => {
  const s = await subir({ semBanco: true });
  const r = await s.chamar('/api/r6/fila');
  assert.strictEqual(r.status, 503);
  assert.match(r.j.erro, /SUPABASE_SERVICE_ROLE_KEY/);
  s.fechar();
});

test('fila e painel devolvem o formato que a tela espera', async () => {
  const s = await subir();
  const f = await s.chamar('/api/r6/fila');
  assert.strictEqual(f.status, 200);
  assert.ok(f.j.conversas[CONV].pedidos.includes('estado_carro'));
  const p = await s.chamar(`/api/r6/cliente/${CLI}`);
  assert.strictEqual(p.status, 200);
  assert.ok(Array.isArray(p.j.orcamentos) && Array.isArray(p.j.proximos) && p.j.agendamentos && p.j.links.novo_orcamento.includes('#/cotacao?origem=atendimento'));
  s.fechar();
});

test('sugestões: nenhuma resposta pronta contém preço, e o pedido do cliente aparece', async () => {
  const s = await subir();
  const r = await s.chamar(`/api/r6/sugestoes/${CONV}`);
  assert.strictEqual(r.status, 200);
  assert.ok(r.j.pedidos.includes('estado_carro'));
  assert.ok(r.j.respostas.length > 0);
  for (const x of r.j.respostas) assert.ok(!/R\$\s?\d|\d+\s*reais/i.test(x.texto), x.texto);
  s.fechar();
});

test('zap: parado depois de 401 e conta as mensagens que não saíram; reenvio nunca é automático', async () => {
  const s = await subir();
  assert.strictEqual((await s.chamar('/api/r6/zap')).j.parado, false);
  s.zap.marcar('codewords-401');
  const z = await s.chamar('/api/r6/zap');
  assert.strictEqual(z.j.parado, true);
  assert.strictEqual(z.j.codigo, 'codewords-401');
  assert.strictEqual(z.j.nao_saiu, 1);
  assert.match(z.j.texto, /WhatsApp parado/);
  s.fechar();
});

test('resolver: marca como resolvida fora do WhatsApp, some da contagem e rejeita mensagem inexistente', async () => {
  const s = await subir();
  const r = await s.chamar('/api/r6/nao-sairam/resolver', { metodo: 'POST', corpo: { mensagemId: MSG, nota: 'liguei para o cliente' } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.j));
  assert.strictEqual((await s.chamar('/api/r6/zap')).j.nao_saiu, 0);
  const msg = s.sb.db.whatsapp_mensagens.find((m) => m.id === MSG);
  assert.match(msg.erro, /Resolvido fora do WhatsApp por Ana/);
  const x = await s.chamar('/api/r6/nao-sairam/resolver', { metodo: 'POST', corpo: { mensagemId: '77b965a4-65e0-4562-a1b0-952466991b2c' } });
  assert.ok(x.status >= 400);
  s.fechar();
});

test('passar ao consultor: marca a conversa, cria UMA tarefa e a segunda chamada não duplica', async () => {
  const s = await subir();
  const a = await s.chamar(`/api/r6/conversas/${CONV}/passar-consultor`, { metodo: 'POST', corpo: { motivo: 'preco' } });
  assert.strictEqual(a.status, 200, JSON.stringify(a.j));
  const b = await s.chamar(`/api/r6/conversas/${CONV}/passar-consultor`, { metodo: 'POST', corpo: { motivo: 'preco' } });
  assert.strictEqual(b.j.ja_estava, true);
  assert.strictEqual(s.sb.db.tarefas.length, 1);
  assert.strictEqual(s.sb.db.conversas[0].aguardando_consultor, true);
  s.fechar();
});

test('motivo inventado cai em "preco" (sem injetar texto na tarefa)', async () => {
  const s = await subir();
  await s.chamar(`/api/r6/conversas/${CONV}/passar-consultor`, { metodo: 'POST', corpo: { motivo: '<script>x</script>' } });
  assert.ok(!/script/i.test(s.sb.db.tarefas[0].titulo + s.sb.db.tarefas[0].descricao));
  s.fechar();
});

test('testar mensagem: só gestor/admin, e mostra o que o sistema faria sem falar preço', async () => {
  const at = await subir({ quem: ATENDENTE });
  assert.strictEqual((await at.chamar('/api/r6/testar-mensagem', { metodo: 'POST', corpo: { texto: 'quanto custa?' } })).status, 403);
  at.fechar();
  const g = await subir({ quem: GESTOR });
  const r = await g.chamar('/api/r6/testar-mensagem', { metodo: 'POST', corpo: { texto: 'quanto custa a pastilha?' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.j.passa_para_gente, true);
  assert.strictEqual(r.j.motivo, 'preco');
  assert.ok(!/R\$\s?\d/.test(r.j.resposta_do_sistema));
  assert.strictEqual((await g.chamar('/api/r6/testar-mensagem', { metodo: 'POST', corpo: { texto: '   ' } })).status, 400);
  g.fechar();
});

test('limite de pedidos: passou do teto devolve 429 em português', async () => {
  const s = await subir({ limite: 2 });
  await s.chamar('/api/r6/zap'); await s.chamar('/api/r6/zap');
  const r = await s.chamar('/api/r6/zap');
  assert.strictEqual(r.status, 429);
  assert.match(r.j.erro, /Muitos pedidos/);
  s.fechar();
});
