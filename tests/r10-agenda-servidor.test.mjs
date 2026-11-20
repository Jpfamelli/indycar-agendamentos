// Rodada 10 da Agenda (conexões, segurança e desempenho): o server.js DE VERDADE por HTTP, com banco e porteiro
// de mentira (_injetar). Cada teste aqui falhava no código de antes. Nada fala com o Supabase, a Meta ou o CodeWords.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import net from 'node:net';
import * as real from '../dados.js';
import { _injetar, server } from '../server.js';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PESSOAS = {
  admin:     { id: ID(901), email: 'admin@teste', papel: 'admin', ativo: true, apps: ['agenda'] },
  gestor:    { id: ID(902), email: 'gestor@teste', papel: 'gestor', ativo: true, apps: ['agenda'] },
  atendente: { id: ID(903), email: 'at@teste', papel: 'atendente', ativo: true, apps: ['agenda'] },
};
let gravado, mensagens, recibos, wa, ia, base, chamadasFora, foraResponde, consultas, integracoes, agendamentos, falhas;
const falso = {
  ...real,
  marcarUltimoAcesso: async () => {}, auditar: async () => true, templatePorGatilho: async () => null,
  obterWaConfig: async () => ({ ...wa }),
  salvarWaConfig: async (c) => { gravado.wa = c; Object.assign(wa, c); return { ...wa }; },
  obterIaConfig: async () => ({ ...ia }),
  salvarIaConfig: async (c) => { gravado.ia = c; Object.assign(ia, c); return { ...ia }; },
  registrarMensagem: async (m) => { mensagens.push(m); return { id: ID(700 + mensagens.length), ...m }; },
  atualizarStatusPorWamid: async (wamid, status) => { recibos.push({ wamid, status }); return true; },
  atualizarStatusMensagem: async (id, status) => { gravado.statusMensagem = { id, status }; return true; },
  obterTemplate: async (id) => (id === ID(401) ? { id, nome: 'Lembrete', corpo: 'Oi {nome}, seu {servico} é {data} às {hora}.' } : null),
  obterAgendamento: async (id) => (agendamentos[id] ? { ...agendamentos[id] } : null),
  atualizarAgendamento: async (id, c) => { gravado.agendamento = c; return { ...agendamentos[id], ...c, id }; },
  obterEmpresa: async () => { consultas.empresa++; return { nome: 'IndyCar Centro Automotivo', endereco: 'Av. Um, 875', telefone: '1236000000' }; },
  listarJanelas: async () => { consultas.janelas++; return [{ dia: 1, abre: '08:00', fecha: '17:30' }]; },
  obterIntegracoes: async () => ({ ...integracoes }),
  agendamentosParaICS: async () => Object.values(agendamentos),
  duracoesDeServicos: async () => ({ porId: new Map(), porNome: new Map() }),
  criarCliente: async (c) => { gravado.cliente = c; return { id: ID(601), ...c }; },
  atualizarCliente: async (id, c) => { gravado.cliente = c; return { id, ...c }; },
  criarConfirmacao: async () => ({ token: 'a1b2c3d4e5f6a7b8c9d0e1f2', canal: 'whatsapp', resposta: null, enviado_em: null }),
  enfileirarLembrete: async () => { if (falhas.lembrete) throw new Error(falhas.lembrete); return { ok: true }; },
  lembreteDoAgendamento: async () => ({ situacao: { codigo: 'na_fila' } }),
  enfileirarAvisoDeRemarcacao: async () => { if (falhas.remarcacao) throw new Error(falhas.remarcacao); return { ok: true }; },
  criarMembro: async () => { throw new Error(falhas.cadastro || 'A user with this email address has already been registered'); },
  contarPerfis: async () => 3,
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
  gravado = {}; mensagens = []; recibos = []; chamadasFora = []; consultas = { empresa: 0, janelas: 0 }; falhas = {};
  wa = { ativo: 0, phone_number_id: '', access_token: '', verify_token: '', api_version: 'v21.0' };
  ia = { ativo: 0, cw_api_key: 'cw-chave-guardada-1234', cw_service_id: 'fluxo_principal', cw_base_url: 'https://runtime.codewords.ai' };
  integracoes = { webhook_url: '', webhook_ativo: 0, ics_token: 'a'.repeat(32) };
  agendamentos = { [ID(11)]: { id: ID(11), cliente_nome: 'Maria Souza', telefone: '12991110001', servico: 'Troca de óleo', data: '2099-12-30', hora: '09:00', status: 'aguardando', veiculo: 'HB20', placa: 'ABC1D23' } };
  foraResponde = async () => new Response('{}', { status: 200 });
  delete process.env.WHATSAPP_VERIFY_TOKEN; delete process.env.WHATSAPP_APP_SECRET; delete process.env.AGENDA_URL_PUBLICA;
  _injetar({});
});
async function chamar(quem, metodo, rota, corpo, cab = {}) {
  const r = await fetch(base + rota, { method: metodo, headers: { ...(quem ? { Authorization: `Bearer ${quem}` } : {}), ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}), ...cab }, body: corpo === undefined ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)) });
  const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch { /* texto puro */ }
  return { status: r.status, j, txt, cab: r.headers };
}
/** Pedido HTTP escrito à mão (para endereço e Host que o fetch não deixa mandar). Devolve a primeira linha da resposta. */
const cru = (texto, ms = 1500) => new Promise((ok) => {
  const s = net.connect(server.address().port, '127.0.0.1', () => s.write(texto)); let b = '';
  s.on('data', (d) => { b += d; }); s.on('end', () => ok(b.split('\r\n')[0])); s.on('error', () => ok('ERRO'));
  setTimeout(() => { s.destroy(); ok('SEM RESPOSTA ' + b.split('\r\n')[0]); }, ms).unref();
});
const entradaDaMeta = (msg, extra = {}) => ({ entry: [{ changes: [{ value: { contacts: [{ profile: { name: 'Maria' } }], messages: msg ? [msg] : undefined, ...extra } }] }] });
const ligarCloud = () => Object.assign(wa, { ativo: 1, phone_number_id: '123456789012345', access_token: 'tok-da-meta' });

/* ------------------------------------------------------------------ webhook da Meta (WhatsApp Cloud API) ---- */
test('R10-AGE-005: a verificação do webhook não aceita mais o token padrão "indycar" nem token curto', async () => {
  const v = (t) => chamar(null, 'GET', `/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(t)}&hub.challenge=12345`);
  assert.equal((await v('indycar')).status, 403, 'sem token salvo, o padrão antigo não abre');
  wa.verify_token = 'indycar';
  assert.equal((await v('indycar')).status, 403, 'o padrão antigo salvo no banco também não abre');
  wa.verify_token = 'curto';
  assert.equal((await v('curto')).status, 403);
  wa.verify_token = 'um-token-comprido-de-verdade';
  const bom = await v('um-token-comprido-de-verdade');
  assert.equal(bom.status, 200); assert.equal(bom.txt, '12345');
  assert.equal((await v('um-token-comprido-de-verdadeX')).status, 403);
  wa.verify_token = '';
  process.env.WHATSAPP_VERIFY_TOKEN = 'token-do-ambiente-123456';
  assert.equal((await v('token-do-ambiente-123456')).status, 200, 'o token do ambiente continua valendo');
});

test('R10-AGE-006: com a Cloud API desligada, o webhook não grava "mensagem recebida" de quem bater na porta', async () => {
  const r = await chamar(null, 'POST', '/api/whatsapp/webhook', entradaDaMeta({ from: '5512991110001', type: 'text', text: { body: 'Agendamento: sexta 9h' } }, { statuses: [{ id: 'wamid.X', status: 'read' }] }));
  assert.equal(r.status, 200, 'a Meta sempre recebe 200');
  assert.equal(mensagens.length, 0); assert.equal(recibos.length, 0);
  ligarCloud();
  await chamar(null, 'POST', '/api/whatsapp/webhook', entradaDaMeta({ from: '5512991110001', type: 'text', text: { body: 'Oi, quero marcar' } }));
  assert.equal(mensagens.length, 1); assert.equal(mensagens[0].corpo, 'Oi, quero marcar'); assert.equal(mensagens[0].direcao, 'entrada');
});

test('R10-AGE-007: com WHATSAPP_APP_SECRET, só entra o que vem assinado pela Meta (X-Hub-Signature-256)', async () => {
  ligarCloud();
  process.env.WHATSAPP_APP_SECRET = 'segredo-do-app';
  const corpo = JSON.stringify(entradaDaMeta({ from: '5512991110001', type: 'text', text: { body: 'Olá' } }));
  await chamar(null, 'POST', '/api/whatsapp/webhook', corpo);
  await chamar(null, 'POST', '/api/whatsapp/webhook', corpo, { 'X-Hub-Signature-256': 'sha256=' + '0'.repeat(64) });
  assert.equal(mensagens.length, 0, 'sem assinatura ou com assinatura errada nada é gravado');
  const certa = 'sha256=' + createHmac('sha256', 'segredo-do-app').update(corpo).digest('hex');
  const r = await chamar(null, 'POST', '/api/whatsapp/webhook', corpo, { 'X-Hub-Signature-256': certa });
  assert.equal(r.status, 200); assert.equal(mensagens.length, 1);
});

test('R10-AGE-008: o webhook só grava telefone de verdade, com texto e nome cortados', async () => {
  ligarCloud();
  for (const from of ['abc', { $ne: 1 }, '12', '1'.repeat(30), null]) await chamar(null, 'POST', '/api/whatsapp/webhook', entradaDaMeta({ from, type: 'text', text: { body: 'x' } }));
  assert.equal(mensagens.length, 0);
  const longo = entradaDaMeta({ from: '5512991110001', type: 'text', text: { body: 'a'.repeat(9000) } });
  longo.entry[0].changes[0].value.contacts[0].profile.name = 'N'.repeat(500);
  await chamar(null, 'POST', '/api/whatsapp/webhook', longo);
  assert.equal(mensagens[0].corpo.length, 4096); assert.equal(mensagens[0].nome.length, 120);
  await chamar(null, 'POST', '/api/whatsapp/webhook', entradaDaMeta({ from: '5512991110001', type: '<img src=x onerror=alert(1)>' }));
  assert.equal(mensagens[1].corpo, '[mensagem]', 'tipo estranho não vira texto gravado');
  await chamar(null, 'POST', '/api/whatsapp/webhook', entradaDaMeta({ from: '5512991110001', type: 'image' }));
  assert.equal(mensagens[2].corpo, '[image]');
  await chamar(null, 'POST', '/api/whatsapp/webhook', entradaDaMeta({ from: '5512991110001', type: 'text', text: { body: { a: 1 } } }));
  assert.equal(mensagens[3].corpo, '[text]', 'objeto no lugar do texto não vira [object Object]');
});

test('R10-AGE-009: recibo da Meta só muda a mensagem para uma situação conhecida', async () => {
  ligarCloud();
  for (const [status, esperado] of [['delivered', 'entregue'], ['read', 'lido'], ['sent', 'enviado'], ['failed', 'falhou']]) {
    await chamar(null, 'POST', '/api/whatsapp/webhook', entradaDaMeta(null, { statuses: [{ id: 'wamid.ABC', status }] }));
    assert.deepEqual(recibos.at(-1), { wamid: 'wamid.ABC', status: esperado });
  }
  const antes = recibos.length;
  for (const st of [{ id: 'wamid.ABC', status: '<img src=x onerror=alert(1)>' }, { id: 'wamid.ABC', status: 'qualquer' }, { id: { a: 1 }, status: 'read' }, { id: 'w'.repeat(400), status: 'read' }])
    await chamar(null, 'POST', '/api/whatsapp/webhook', entradaDaMeta(null, { statuses: [st] }));
  assert.equal(recibos.length, antes, 'situação inventada ou id estranho não chega ao banco');
});

test('R10-AGE-010: mudar a situação de uma mensagem pela API só aceita a lista conhecida', async () => {
  for (const ruim of ['<img src=x onerror=alert(1)>', 'qualquer', '', null, { a: 1 }, 7]) {
    const r = await chamar('atendente', 'PATCH', `/api/whatsapp/mensagens/${ID(701)}`, { status: ruim });
    assert.equal(r.status, 400, JSON.stringify(ruim)); assert.match(r.j.erro, /Situação inválida/);
  }
  assert.equal(gravado.statusMensagem, undefined);
  const bom = await chamar('atendente', 'PATCH', `/api/whatsapp/mensagens/${ID(701)}`, { status: 'lido' });
  assert.equal(bom.status, 200); assert.deepEqual(gravado.statusMensagem, { id: ID(701), status: 'lido' });
});

/* ------------------------------------------------------------------ envio e configuração do WhatsApp ---- */
test('R10-AGE-011: "Enviar WhatsApp" confere telefone, tamanho do texto e os identificadores antes de gravar', async () => {
  const bom = { telefone: '(12) 99111-0001', nome: 'Maria', corpo: '  Oi Maria, tudo certo?  ' };
  for (const [ruim, recado] of [
    [{ ...bom, telefone: '123' }, /Telefone incompleto/],
    [{ ...bom, telefone: { a: 1 } }, /Telefone incompleto|Informe telefone/],
    [{ ...bom, corpo: { a: 1 } }, /Informe telefone e mensagem/],
    [{ ...bom, corpo: 'a'.repeat(4097) }, /longa demais/],
    [{ ...bom, agendamento_id: 'abc' }, /Agendamento inválido/],
    [{ ...bom, template_id: '1 or 1=1' }, /Modelo inválido/],
    [{ ...bom, nome: { a: 1 } }, /Nome inválido/],
  ]) {
    const r = await chamar('atendente', 'POST', '/api/whatsapp/enviar', ruim);
    assert.equal(r.status, 400, JSON.stringify(ruim).slice(0, 60)); assert.match(r.j.erro, recado);
  }
  assert.equal(mensagens.length, 0, 'nada foi gravado');
  const r = await chamar('atendente', 'POST', '/api/whatsapp/enviar', bom);
  assert.equal(r.status, 200); assert.equal(mensagens[0].corpo, 'Oi Maria, tudo certo?'); assert.equal(mensagens[0].telefone, '(12) 99111-0001');
  const preparar = await chamar('atendente', 'POST', '/api/whatsapp/preparar', { template_id: ID(401), agendamento_id: 'abc' });
  assert.equal(preparar.status, 400); assert.match(preparar.j.erro, /Agendamento inválido/);
});

test('R10-AGE-012: "Enviar WhatsApp" tem freio de 30 por minuto por pessoa', async () => {
  let ultimo;
  for (let i = 0; i < 31; i++) ultimo = await chamar('atendente', 'POST', '/api/whatsapp/enviar', { telefone: '12991110001', corpo: 'Oi ' + i });
  assert.equal(ultimo.status, 429); assert.match(ultimo.j.erro, /Muitas mensagens seguidas/);
  assert.equal(mensagens.length, 30);
  assert.equal((await chamar('gestor', 'POST', '/api/whatsapp/enviar', { telefone: '12991110001', corpo: 'Oi' })).status, 200, 'o freio é por pessoa');
});

test('R10-AGE-013: a configuração do WhatsApp só grava versão, ids e token no formato certo', async () => {
  const bom = { ativo: true, phone_number_id: '123456789012345', business_account_id: '998877665544', api_version: 'v21.0', verify_token: 'um-token-comprido-de-verdade', numero_exibicao: '(12) 99683-0272' };
  for (const [campo, valor, recado] of [
    ['api_version', '../../me?fields=id', /Versão da API inválida/], ['api_version', { a: 1 }, /Versão da API inválida/],
    ['phone_number_id', '123/../456', /ID do número inválido/], ['business_account_id', 'abc', /ID da conta do WhatsApp inválido/],
    ['verify_token', 'curto', /Token de verificação fraco/], ['verify_token', 'tem espaço no meio do token', /Token de verificação fraco/],
    ['numero_exibicao', '<b>12</b>', /Número exibido inválido/], ['access_token', 'tem espaço', /Token de acesso inválido/],
  ]) {
    const r = await chamar('gestor', 'PUT', '/api/whatsapp/config', { ...bom, [campo]: valor });
    assert.equal(r.status, 400, campo + ' ' + JSON.stringify(valor)); assert.match(r.j.erro, recado);
  }
  assert.equal(gravado.wa, undefined);
  const ok = await chamar('gestor', 'PUT', '/api/whatsapp/config', bom);
  assert.equal(ok.status, 200); assert.equal(gravado.wa.api_version, 'v21.0'); assert.equal(gravado.wa.phone_number_id, '123456789012345');
  // o padrão antigo que ficou salvo vira "sem token" em vez de travar a tela
  const legado = await chamar('gestor', 'PUT', '/api/whatsapp/config', { ...bom, verify_token: 'indycar' });
  assert.equal(legado.status, 200); assert.equal(gravado.wa.verify_token, '');
  // e o teste de conexão não monta endereço com o que veio torto
  const teste = await chamar('gestor', 'POST', '/api/whatsapp/testar', { phone_number_id: '123', access_token: 'EAAGtokendeteste1234567890', api_version: '../../me' });
  assert.equal(teste.status, 400); assert.equal(chamadasFora.length, 0);
});

test('R10-AGE-014: "Testar conexão" tem teto de tempo e não mostra o detalhe da rede', async () => {
  ligarCloud();
  foraResponde = async () => { throw new TypeError('fetch failed: connect ECONNREFUSED 157.240.0.1:443'); };
  const caiu = await chamar('gestor', 'POST', '/api/whatsapp/testar', {});
  assert.equal(caiu.status, 200); assert.equal(caiu.j.ok, false);
  assert.match(caiu.j.erro, /Não consegui falar com a Meta/); assert.doesNotMatch(caiu.j.erro, /ECONNREFUSED|157\.240|fetch failed/);
  assert.ok(chamadasFora[0].opt.signal instanceof AbortSignal, 'o pedido tem teto de tempo');
  foraResponde = async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); };
  assert.match((await chamar('gestor', 'POST', '/api/whatsapp/testar', {})).j.erro, /não respondeu em 10 segundos/);
});

test('R10-AGE-015: envio pela Cloud API tem teto de tempo e a falha de rede vira recado em português (na tela e no histórico)', async () => {
  ligarCloud();
  foraResponde = async () => { throw new TypeError('fetch failed: getaddrinfo ENOTFOUND graph.facebook.com'); };
  const r = await chamar('atendente', 'POST', '/api/whatsapp/enviar', { telefone: '12991110001', corpo: 'Oi' });
  assert.equal(r.status, 200); assert.equal(r.j.status, 'falhou');
  assert.match(r.j.erro, /Não consegui falar com a Meta/); assert.doesNotMatch(r.j.erro + mensagens[0].erro, /ENOTFOUND|getaddrinfo|fetch failed/);
  assert.ok(chamadasFora[0].opt.signal instanceof AbortSignal);
  assert.match(chamadasFora[0].url, /^https:\/\/graph\.facebook\.com\/v21\.0\/123456789012345\/messages$/);
});

test('R10-AGE-016: quem não é gestor não recebe o token de verificação nem o id da conta do WhatsApp', async () => {
  Object.assign(wa, { ativo: 1, phone_number_id: '123456789012345', access_token: 'tok-da-meta-abcd', verify_token: 'um-token-comprido-de-verdade', business_account_id: '998877' });
  const at = await chamar('atendente', 'GET', '/api/whatsapp/config');
  assert.equal(at.status, 200);
  assert.equal(at.j.verify_token, undefined); assert.equal(at.j.business_account_id, undefined); assert.equal(at.j.access_token, undefined);
  assert.equal(at.j.token_mask, undefined, 'nem o fim do token de acesso');
  assert.equal(!!at.j.ativo, true); assert.equal(at.j.tem_token, true); assert.ok(at.j.phone_number_id, 'a janela de envio continua sabendo que a Cloud API está ligada');
  const ge = await chamar('gestor', 'GET', '/api/whatsapp/config');
  assert.equal(ge.j.verify_token, 'um-token-comprido-de-verdade'); assert.equal(ge.j.business_account_id, '998877'); assert.equal(ge.j.access_token, undefined);
});
