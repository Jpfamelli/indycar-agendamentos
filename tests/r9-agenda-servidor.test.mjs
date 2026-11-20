// Rodada 9 da Agenda: o server.js DE VERDADE por HTTP, com banco e porteiro de mentira (_injetar).
// Cobre o webhook de saída (endereço público, teto de tempo, recado sem detalhe de rede), as validações de
// serviço, modelo e dados da oficina, e o rastro de quem apaga. Nada aqui fala com o Supabase nem com a internet.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as real from '../dados.js';
import { _injetar, server } from '../server.js';
import { urlDeWebhookSegura, validarServico, validarModelo, validarEmpresa } from '../regras.js';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PESSOAS = {
  gestor:    { id: ID(902), email: 'gestor@teste', papel: 'gestor', ativo: true, apps: ['agenda'] },
  atendente: { id: ID(903), email: 'at@teste', papel: 'atendente', ativo: true, apps: ['agenda'] },
};
let gravado, auditoria, integracoes, base, chamadasFora, foraResponde;
const falso = {
  ...real,
  marcarUltimoAcesso: async () => {}, obterIaConfig: async () => ({}), templatePorGatilho: async () => null,
  auditar: async (perfil, acao, tabela, registro, detalhes) => { auditoria.push({ acao, tabela, registro, detalhes }); return true; },
  obterIntegracoes: async () => ({ ...integracoes }),
  salvarIntegracoes: async (c) => { gravado.integracoes = c; Object.assign(integracoes, c); return integracoes; },
  criarServico: async (s) => { gravado.servico = s; return { id: ID(301), ...s }; },
  atualizarServico: async (id, s) => { if (id !== ID(301)) return null; gravado.servico = s; return { id, ...s }; },
  removerServico: async (id) => { gravado.apagouServico = id; },
  criarTemplate: async (t) => { gravado.modelo = t; return { id: ID(401), ...t }; },
  atualizarTemplate: async (id, t) => { if (id !== ID(401)) return null; gravado.modelo = t; return { id, ...t }; },
  removerTemplate: async (id) => { gravado.apagouModelo = id; },
  removerConsultor: async (id) => id === ID(501),
  salvarEmpresa: async (e) => { gravado.empresa = e; return e; },
  criarAgendamento: async (a) => ({ id: ID(11), status: 'aguardando', ...a }),
  agendamentoDuplicado: async () => null, obterOuCriarCliente: async () => null, horariosLivresDoDia: async () => ({ aberto: true, horarios: [] }),
};
const fetchOriginal = globalThis.fetch;
before(async () => {
  globalThis.fetch = async (url, opt) => {
    if (String(url).startsWith(base)) return fetchOriginal(url, opt);
    chamadasFora.push({ url: String(url), opt });
    return foraResponde(url, opt);
  };
  _injetar({ dados: falso, usuarioLogado: async (req) => { const t = /Bearer (\S+)/.exec(req.headers.authorization || '')?.[1]; return PESSOAS[t] ? { usuario: { ...PESSOAS[t] } } : { usuario: null, motivo: 'sem_login' }; } });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { globalThis.fetch = fetchOriginal; server.close(); });
beforeEach(() => {
  gravado = {}; auditoria = []; chamadasFora = []; integracoes = { webhook_url: '', webhook_ativo: 0, ics_token: 'x' };
  foraResponde = async () => new Response('{}', { status: 200 });
  _injetar({});
});
async function chamar(quem, metodo, rota, corpo) {
  const r = await fetch(base + rota, { method: metodo, headers: { ...(quem ? { Authorization: `Bearer ${quem}` } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) };
}

test('R9 webhook: a regra aceita só https com domínio público', () => {
  assert.equal(urlDeWebhookSegura(' https://hooks.zapier.com/hooks/catch/1/abc ').url, 'https://hooks.zapier.com/hooks/catch/1/abc');
  for (const ruim of ['http://hooks.zapier.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://169.254.169.254/latest/meta-data',
    'https://[::1]/x', 'https://servidor/x', 'https://banco.internal/x', 'https://impressora.local/x', 'https://usuario:senha@exemplo.com/x', 'ftp://exemplo.com', 'javascript:alert(1)', '', null, { a: 1 }, 'https://exemplo.com/' + 'a'.repeat(500)]) {
    const r = urlDeWebhookSegura(ruim);
    assert.equal(r.ok, false, String(ruim).slice(0, 40));
    assert.ok(r.erro && !/undefined/.test(r.erro));
  }
});

test('R9 webhook: salvar recusa endereço interno (400) e guarda o endereço público já limpo; vazio desliga', async () => {
  for (const ruim of ['http://exemplo.com/gancho', 'https://192.168.0.10/gancho', 'https://localhost:3000/gancho']) {
    const r = await chamar('gestor', 'PUT', '/api/integracoes', { webhook_url: ruim, webhook_ativo: true });
    assert.equal(r.status, 400, ruim); assert.match(r.j.erro, /https|público/);
  }
  assert.equal(gravado.integracoes, undefined);
  const bom = await chamar('gestor', 'PUT', '/api/integracoes', { webhook_url: '  https://hook.make.com/abc  ', webhook_ativo: true });
  assert.equal(bom.status, 200); assert.equal(gravado.integracoes.webhook_url, 'https://hook.make.com/abc');
  const vazio = await chamar('gestor', 'PUT', '/api/integracoes', { webhook_url: '', webhook_ativo: false });
  assert.equal(vazio.status, 200); assert.equal(gravado.integracoes.webhook_url, '');
  assert.equal((await chamar('atendente', 'PUT', '/api/integracoes', { webhook_url: 'https://hook.make.com/abc' })).status, 403);
});

test('R9 webhook: o teste não chama endereço interno, não segue redirecionamento e tem teto de tempo', async () => {
  const interno = await chamar('gestor', 'POST', '/api/integracoes/testar-webhook', { webhook_url: 'https://169.254.169.254/latest' });
  assert.equal(interno.status, 400); assert.equal(chamadasFora.length, 0);
  const sem = await chamar('gestor', 'POST', '/api/integracoes/testar-webhook', {});
  assert.equal(sem.status, 400);
  const bom = await chamar('gestor', 'POST', '/api/integracoes/testar-webhook', { webhook_url: 'https://hook.make.com/abc' });
  assert.deepEqual(bom.j, { ok: true, status: 200 });
  assert.equal(chamadasFora[0].url, 'https://hook.make.com/abc');
  assert.equal(chamadasFora[0].opt.redirect, 'manual');
  assert.ok(chamadasFora[0].opt.signal instanceof AbortSignal);
});

test('R9 webhook: falha de rede vira recado em português, sem o detalhe técnico; demora vira "não respondeu"', async () => {
  foraResponde = async () => { throw new TypeError('fetch failed: connect ECONNREFUSED 203.0.113.9:443'); };
  const caiu = await chamar('gestor', 'POST', '/api/integracoes/testar-webhook', { webhook_url: 'https://hook.make.com/abc' });
  assert.equal(caiu.status, 200); assert.equal(caiu.j.ok, false);
  assert.match(caiu.j.erro, /Não consegui falar com esse endereço/); assert.doesNotMatch(caiu.j.erro, /ECONNREFUSED|203\.0|fetch failed/);
  foraResponde = async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); };
  const demorou = await chamar('gestor', 'POST', '/api/integracoes/testar-webhook', { webhook_url: 'https://hook.make.com/abc' });
  assert.match(demorou.j.erro, /não respondeu em 8 segundos/);
});

test('R9 webhook: o teste tem freio (10 por minuto por pessoa)', async () => {
  let ultimo;
  for (let i = 0; i < 11; i++) ultimo = await chamar('gestor', 'POST', '/api/integracoes/testar-webhook', { webhook_url: 'https://hook.make.com/abc' });
  assert.equal(ultimo.status, 429);
  assert.equal(chamadasFora.length, 10);
});

test('R9 webhook de saída: endereço interno que já estava salvo não é chamado; o público sai com teto e sem redirecionar', async () => {
  integracoes = { webhook_url: 'http://127.0.0.1:9000/gancho', webhook_ativo: 1 };
  const corpo = { cliente_nome: 'Teste Webhook', servico: 'Troca de óleo', data: real.hoje(), hora: '15:00' };
  const a = await chamar('gestor', 'POST', '/api/agendamentos', corpo);
  assert.ok([200, 201].includes(a.status), 'criou: ' + a.status + ' ' + JSON.stringify(a.j));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(chamadasFora.filter((c) => c.url.includes('9000')).length, 0);
  integracoes = { webhook_url: 'https://hook.make.com/abc', webhook_ativo: 1 };
  await chamar('gestor', 'POST', '/api/agendamentos', { ...corpo, hora: '16:00' });
  await new Promise((r) => setTimeout(r, 30));
  const saiu = chamadasFora.find((c) => c.url === 'https://hook.make.com/abc');
  assert.ok(saiu, 'o webhook público saiu');
  assert.equal(saiu.opt.redirect, 'manual'); assert.ok(saiu.opt.signal instanceof AbortSignal);
  assert.equal(JSON.parse(saiu.opt.body).evento, 'agendamento_criado');
});

test('R9 serviços: nome de verdade, preço que não é negativo e duração de 5 a 1440 min (criar e editar)', async () => {
  assert.equal(validarServico({ nome: ' Troca de óleo ', preco: '120.5', duracao_min: 40 }).campos.nome, 'Troca de óleo');
  for (const [corpo, re] of [[{ nome: '   ' }, /nome/], [{ nome: { a: 1 } }, /nome/], [{ nome: 'x'.repeat(121) }, /longo/], [{ nome: 'Freio', preco: -10 }, /Preço/],
    [{ nome: 'Freio', preco: 'abc' }, /Preço/], [{ nome: 'Freio', duracao_min: 0 }, /Duração/], [{ nome: 'Freio', duracao_min: 99999 }, /Duração/], [{ nome: 'Freio', duracao_min: 12.5 }, /Duração/]]) {
    const r = await chamar('gestor', 'POST', '/api/servicos', corpo);
    assert.equal(r.status, 400, JSON.stringify(corpo)); assert.match(r.j.erro, re);
  }
  assert.equal(gravado.servico, undefined);
  const ok = await chamar('gestor', 'POST', '/api/servicos', { nome: '  Alinhamento  ', preco: 90, duracao_min: 30 });
  assert.equal(ok.status, 200); assert.equal(gravado.servico.nome, 'Alinhamento');
  // editar: não dá para apagar o nome nem pôr preço negativo; mudar só o preço continua valendo
  assert.equal((await chamar('gestor', 'PUT', '/api/servicos/' + ID(301), { nome: '' })).status, 400);
  assert.equal((await chamar('gestor', 'PUT', '/api/servicos/' + ID(301), { preco: -1 })).status, 400);
  const so = await chamar('gestor', 'PUT', '/api/servicos/' + ID(301), { preco: 150 });
  assert.equal(so.status, 200); assert.equal(gravado.servico.preco, 150); assert.equal(gravado.servico.nome, undefined);
});

test('R9 modelos do WhatsApp: nome e texto obrigatórios e com limite; editar não deixa em branco', async () => {
  assert.equal(validarModelo({ nome: 'Oi', corpo: 'Olá {{nome}}' }).ok, true);
  for (const [corpo, re] of [[{ nome: 'Lembrete', corpo: '   ' }, /texto/], [{ nome: '', corpo: 'Oi' }, /nome/], [{ nome: ['a'], corpo: 'Oi' }, /nome/],
    [{ nome: 'x'.repeat(81), corpo: 'Oi' }, /longo/], [{ nome: 'A', corpo: 'x'.repeat(2001) }, /longo/], [{ nome: 'A', corpo: 'Oi', gatilho: 'DROP TABLE' }, /Gatilho/]]) {
    const r = await chamar('atendente', 'POST', '/api/whatsapp/templates', corpo);
    assert.equal(r.status, 400, JSON.stringify(corpo).slice(0, 60)); assert.match(r.j.erro, re);
  }
  assert.equal(gravado.modelo, undefined);
  const ok = await chamar('atendente', 'POST', '/api/whatsapp/templates', { nome: ' Retorno ', corpo: ' Oi {{nome}} ', gatilho: 'followup' });
  assert.equal(ok.status, 200); assert.deepEqual([gravado.modelo.nome, gravado.modelo.corpo], ['Retorno', 'Oi {{nome}}']);
  assert.equal((await chamar('atendente', 'PUT', '/api/whatsapp/templates/' + ID(401), { corpo: '' })).status, 400);
  assert.equal((await chamar('atendente', 'PUT', '/api/whatsapp/templates/' + ID(401), { ativo: false })).status, 200);
});

test('R9 rastro: apagar serviço e apagar modelo entram na auditoria; apagar consultor que não existe é 404 sem rastro falso', async () => {
  assert.equal((await chamar('gestor', 'DELETE', '/api/servicos/' + ID(301))).status, 200);
  assert.deepEqual(auditoria.at(-1), { acao: 'apagou_servico', tabela: 'servicos', registro: ID(301), detalhes: null });
  assert.equal((await chamar('gestor', 'DELETE', '/api/whatsapp/templates/' + ID(401))).status, 200);
  assert.equal(auditoria.at(-1).acao, 'apagou_modelo'); assert.equal(auditoria.at(-1).registro, ID(401));
  const antes = auditoria.length;
  assert.equal((await chamar('gestor', 'DELETE', '/api/consultores/' + ID(599))).status, 404);
  assert.equal(auditoria.length, antes);
  assert.equal((await chamar('gestor', 'DELETE', '/api/consultores/' + ID(501))).status, 200);
  assert.equal(auditoria.at(-1).acao, 'apagou_consultor');
});

test('R9 dados da oficina: tamanhos e telefone conferidos; só os quatro campos vão para o banco', async () => {
  assert.equal(validarEmpresa({ nome: 'IndyCar', telefone: '(12) 3633-0000' }).ok, true);
  for (const [corpo, re] of [[{ nome: '' }, /nome/], [{ nome: 'x'.repeat(121) }, /longo/], [{ nome: 'IndyCar', endereco: 'x'.repeat(201) }, /Endereço/],
    [{ nome: 'IndyCar', slogan: 'x'.repeat(121) }, /Frase/], [{ nome: 'IndyCar', telefone: '99999' }, /Telefone/]]) {
    const r = await chamar('gestor', 'PUT', '/api/empresa', corpo);
    assert.equal(r.status, 400, JSON.stringify(corpo).slice(0, 50)); assert.match(r.j.erro, re);
  }
  const ok = await chamar('gestor', 'PUT', '/api/empresa', { nome: ' IndyCar ', endereco: 'Av. Bandeirantes, 875', slogan: 'Quem conhece, indica!', telefone: '(12) 3633-0000', id: 'outra-coisa', admin: true });
  assert.equal(ok.status, 200);
  assert.deepEqual(gravado.empresa, { nome: 'IndyCar', endereco: 'Av. Bandeirantes, 875', slogan: 'Quem conhece, indica!', telefone: '(12) 3633-0000' });
});

test('R9 fontes: o servidor entrega a fonte do próprio app com o tipo certo e um dia de cache; a CSP não libera domínio de fonte de fora', async () => {
  const f = await fetch(base + '/fontes/archivo-variavel.woff2');
  assert.equal(f.status, 200);
  assert.equal(f.headers.get('content-type'), 'font/woff2');
  assert.match(f.headers.get('cache-control'), /public, max-age=86400/);
  assert.ok((await f.arrayBuffer()).byteLength > 10_000);
  assert.equal((await fetch(base + '/fontes/nao-existe.woff2')).status, 404);
  const pagina = await fetch(base + '/');
  const csp = pagina.headers.get('content-security-policy');
  assert.match(csp, /font-src 'self'(;|$)/);
  assert.doesNotMatch(csp, /fonts\.googleapis|fonts\.gstatic/);
  assert.doesNotMatch(await pagina.text(), /fonts\.googleapis|fonts\.gstatic/);
});

test('R9 API: toda resposta com dado de cliente sai com no-store (planilhas também); quem define outro cache continua mandando', async () => {
  _injetar({ dados: { ...falso,
    listarClientes: async () => [{ id: ID(801), nome: 'Maria', telefone: '12991110001', veiculo: 'HB20', placa: 'ABC1D23', modelo: '2019', origem: 'Google', created_at: '2026-01-01' }],
    listarTodosAgendamentos: async () => [{ id: ID(1), cliente_nome: 'Maria', telefone: '12991110001', veiculo: 'HB20', placa: 'ABC1D23', servico: 'Óleo', data: '2026-11-20', hora: '10:00', status: 'concluido', valor: 120 }],
    listarConsultores: async () => [], aniversariosProximos: async () => [],
  } });
  const h = { Authorization: 'Bearer gestor' };
  const cli = await fetch(base + '/api/export/clientes.csv', { headers: h });
  assert.equal(cli.status, 200); assert.equal(cli.headers.get('cache-control'), 'no-store');
  const linhas = (await cli.text()).split('\r\n');
  assert.equal(linhas[0].replace(/^﻿/, ''), '"id";"nome";"telefone";"carro";"placa";"modelo";"origem";"criado_em"');
  assert.match(linhas[1], /"Maria";"12991110001";"HB20";"ABC1D23"/);
  const ags = await fetch(base + '/api/export/agendamentos.csv', { headers: h });
  assert.equal(ags.headers.get('cache-control'), 'no-store');
  assert.match((await ags.text()).split('\r\n')[0], /"telefone";"carro";"placa"/);
  assert.equal((await fetch(base + '/api/consultores', { headers: h })).headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(base + '/api/nao-existe', { headers: h })).headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(base + '/api/aniversarios', { headers: h })).headers.get('cache-control'), 'private, max-age=300');
  // arquivo da tela não é API: continua conferindo a versão a cada abertura
  assert.equal((await fetch(base + '/styles.css')).headers.get('cache-control'), 'no-cache, must-revalidate');
});
