'use strict';
/* Rodada 8 (T5a) — servidor MCP de duas eras (POST /mcp) e porta REST (/api/ia/v1) pelo servidor de verdade,
   com HTTP de verdade numa porta da faixa 3450-3459, banco de mentira e chaves criadas pelo módulo.
   Inclui o roteiro de fumaça da pesquisa 03 §2.5, a caixa preta pedida no recado e a ponte stdio. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const F = require('../ia/ferramentas');
const Chaves = require('../ia/chaves');
const Auditoria = require('../ia/auditoria');
const enderecos = require('../enderecos');
const db = require('../db');
const { ambienteDaPorta, ouvirNaFaixa, ondeAparece, ambienteDeFora, MARCA_DE_FORA, PEDACOS_DE_FORA, LEAD_UTM } = require('./apoio/ia-porta');

const NOVA = '2026-07-28';
let base, amb, servidor, chaveLer, chavePii, chavePropor;
const logOriginal = console.log, avisoOriginal = console.warn;

test.before(async () => {
  console.log = () => {}; console.warn = () => {};
  amb = ambienteDaPorta();
  db.sb = amb.sb;
  F.configurar({ sb: amb.sb, fonte: amb.fonte, jornada: amb.jornada, agora: amb.agora, auditoria: Auditoria.criarAuditoria({ sb: amb.sb, agora: amb.agora }) });
  Chaves.padrao().trocar({ sb: amb.sb });
  chaveLer = (await Chaves.padrao().criar({ nome: 'Claude Code', escopos: ['ler'] })).chave;
  chavePii = (await Chaves.padrao().criar({ nome: 'Codex', escopos: ['ler'], ver_pii: true })).chave;
  chavePropor = (await Chaves.padrao().criar({ nome: 'Gestor de fora', escopos: ['ler', 'propor'] })).chave;
  servidor = require('../server').servidor;
  base = `http://127.0.0.1:${await ouvirNaFaixa(servidor)}`;
});
test.after(() => { servidor.close(); console.log = logOriginal; console.warn = avisoOriginal; });

/** Pedido do protocolo novo: _meta no corpo e os três cabeçalhos iguais ao corpo. */
function moderno(method, params = {}, { meta = true } = {}) {
  const corpo = { jsonrpc: '2.0', id: 1, method, params: meta ? { ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': NOVA, 'io.modelcontextprotocol/clientCapabilities': {}, 'io.modelcontextprotocol/clientInfo': { name: 'teste', version: '1' } } } : params };
  const cab = { 'MCP-Protocol-Version': NOVA, 'Mcp-Method': method };
  if (params.name) cab['Mcp-Name'] = params.name;
  return { corpo, cab };
}
async function mcp(corpo, { chave = chaveLer, cab = {}, metodo = 'POST', bruto = null, caminho = '/mcp' } = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...cab };
  if (chave) headers.Authorization = `Bearer ${chave}`;
  const r = await fetch(`${base}${caminho}`, { method: metodo, headers, body: metodo === 'POST' ? (bruto ?? JSON.stringify(corpo)) : undefined });
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch { json = null; }
  return { status: r.status, cab: r.headers, json, texto };
}
const novo = (method, params, opcoes = {}) => { const m = moderno(method, params, opcoes); return mcp(m.corpo, { ...opcoes, cab: { ...m.cab, ...(opcoes.cab || {}) } }); };
const antigo = (method, params = {}, opcoes = {}) => mcp({ jsonrpc: '2.0', id: 7, method, params }, { ...opcoes, cab: { 'MCP-Protocol-Version': '2025-06-18', ...(opcoes.cab || {}) } });

test('fumaça da pesquisa 03 §2.5: 401 sem chave, GET 405, discover, tools/list, tools/call saude, Mcp-Name trocado 400, initialize antigo', async () => {
  const sem = await novo('tools/list', {}, { chave: null });
  assert.equal(sem.status, 401);
  assert.match(sem.cab.get('www-authenticate'), /^Bearer/);
  assert.equal(sem.json.error.code, -31401);

  for (const metodo of ['GET', 'DELETE']) assert.equal((await mcp(null, { metodo })).status, 405, metodo);

  const d = await novo('server/discover');
  assert.equal(d.status, 200);
  assert.ok(d.json.result.supportedVersions.includes(NOVA) && d.json.result.supportedVersions.includes('2025-06-18'));
  assert.equal(d.json.result.resultType, 'complete');
  assert.equal(d.json.result.cacheScope, 'private'); assert.ok(d.json.result.ttlMs > 0);
  assert.equal(d.json.result._meta['io.modelcontextprotocol/serverInfo'].name, 'indycar-trafego');
  assert.match(d.json.result.instructions, /texto_do_cliente/);
  assert.match(d.cab.get('content-type'), /^application\/json/);
  assert.equal(d.cab.get('mcp-session-id'), null);

  const l = await novo('tools/list');
  assert.equal(l.status, 200);
  const nomes = l.json.result.tools.map(t => t.name);
  assert.equal(nomes.length, 12, 'chave só de leitura e sem dado pessoal: sem conversa e sem proposta_criar');
  assert.ok(!nomes.includes('conversa') && !nomes.includes('proposta_criar'));
  assert.ok(l.json.result.tools.every(t => t.annotations.readOnlyHint === true && t.inputSchema.type === 'object'));
  assert.equal(l.json.result.resultType, 'complete'); assert.equal(l.json.result.cacheScope, 'private');

  const c = await novo('tools/call', { name: 'saude', arguments: {} });
  assert.equal(c.status, 200);
  const r = c.json.result;
  assert.equal(r.isError, false); assert.equal(r.resultType, 'complete');
  assert.equal(r.content[0].type, 'text');
  assert.ok(r.content[0].text.startsWith(r.structuredContent.resumo));
  assert.deepEqual(JSON.parse(r.content[0].text.slice(r.structuredContent.resumo.length).trim()), r.structuredContent);

  const trocado = await novo('tools/call', { name: 'saude', arguments: {} }, { cab: { 'Mcp-Name': 'agenda' } });
  assert.equal(trocado.status, 400); assert.equal(trocado.json.error.code, -32020);

  const i = await mcp({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'antigo', version: '1' } } });
  assert.equal(i.status, 200);
  assert.equal(i.json.result.protocolVersion, '2025-06-18');
  assert.deepEqual(i.json.result.capabilities, { tools: { listChanged: false } });
  assert.equal(i.json.result.serverInfo.name, 'indycar-trafego');
  assert.equal(i.cab.get('mcp-session-id'), null, 'sem sessão');
});

test('protocolo novo: _meta, versão e cabeçalhos conferidos; JSON inválido, lote, método e ferramenta desconhecidos', async () => {
  const semCap = moderno('tools/list');
  delete semCap.corpo.params._meta['io.modelcontextprotocol/clientCapabilities'];
  let r = await mcp(semCap.corpo, { cab: semCap.cab });
  assert.equal(r.status, 400); assert.equal(r.json.error.code, -32602);

  const velha = moderno('tools/list');
  velha.corpo.params._meta['io.modelcontextprotocol/protocolVersion'] = '2099-01-01';
  r = await mcp(velha.corpo, { cab: { ...velha.cab, 'MCP-Protocol-Version': '2099-01-01' } });
  assert.equal(r.status, 400); assert.equal(r.json.error.code, -32022);
  assert.deepEqual(r.json.error.data, { supported: [NOVA], requested: '2099-01-01' });

  const semCab = moderno('tools/list');
  r = await mcp(semCab.corpo, { cab: { 'Mcp-Method': 'tools/list' } });
  assert.equal(r.status, 400); assert.equal(r.json.error.code, -32020, 'MCP-Protocol-Version ausente com _meta novo');
  r = await novo('tools/list', {}, { cab: { 'Mcp-Method': 'tools/call' } });
  assert.equal(r.status, 400); assert.equal(r.json.error.code, -32020);
  r = await novo('tools/list', {}, { meta: false });
  assert.equal(r.status, 400); assert.equal(r.json.error.code, -32602, 'cabeçalho da versão nova sem _meta');

  const b64 = moderno('tools/call', { name: 'saude', arguments: {} });
  r = await mcp(b64.corpo, { cab: { ...b64.cab, 'Mcp-Name': `=?base64?${Buffer.from('saude').toString('base64')}?=` } });
  assert.equal(r.status, 200, 'Mcp-Name em base64 é decodificado');

  r = await mcp(null, { bruto: '{"jsonrpc":"2.0",' });
  assert.equal(r.status, 400); assert.equal(r.json.error.code, -32700);
  r = await mcp([moderno('tools/list').corpo]);
  assert.equal(r.status, 400); assert.equal(r.json.error.code, -32600);
  r = await novo('resources/list');
  assert.equal(r.status, 404); assert.equal(r.json.error.code, -32601);
  r = await novo('tools/call', { name: 'apagar_tudo', arguments: {} });
  assert.equal(r.status, 400); assert.equal(r.json.error.code, -32602); assert.match(r.json.error.message, /saude/);
  r = await novo('ping');
  assert.equal(r.status, 200); assert.deepEqual(r.json.result, { resultType: 'complete' });
});

test('clientes antigos no mesmo endereço: initialize sem sessão, notificação 202, ping, tools/list e tools/call; versão desconhecida 400', async () => {
  let r = await mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'velho', version: '0' } } });
  assert.equal(r.json.result.protocolVersion, '2025-11-25', 'versão não atendida: oferece a mais nova das antigas');
  r = await mcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, { cab: { 'MCP-Protocol-Version': '2025-11-25' } });
  assert.equal(r.status, 202); assert.equal(r.texto, '');
  r = await antigo('ping');
  assert.deepEqual(r.json, { jsonrpc: '2.0', id: 7, result: {} });
  r = await mcp({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} });   // sem cabeçalho de versão: vale 2025-03-26
  assert.equal(r.status, 200); assert.equal(r.json.result.tools.length, 12);
  r = await antigo('tools/call', { name: 'contatos', arguments: { periodo: 'mes', limite: 2 } });
  assert.equal(r.status, 200); assert.equal(r.json.result.structuredContent.itens.length, 2);
  r = await antigo('tools/list', {}, { cab: { 'MCP-Protocol-Version': '1999-01-01' } });
  assert.equal(r.status, 400);
  r = await antigo('prompts/list');
  assert.equal(r.status, 200); assert.equal(r.json.error.code, -32601, 'no protocolo antigo o erro vai com 200');
});

test('permissão e erro de negócio: escopo que falta 403 insufficient_scope; argumento errado 200 isError; proposta com a chave certa', async () => {
  let r = await novo('tools/call', { name: 'proposta_criar', arguments: {} });
  assert.equal(r.status, 403);
  assert.match(r.cab.get('www-authenticate'), /error="insufficient_scope", scope="propor"/);
  assert.equal(r.json.error.code, -31403);
  r = await novo('tools/call', { name: 'conversa', arguments: { lead_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' } });
  assert.equal(r.status, 403); assert.match(r.cab.get('www-authenticate'), /scope="ver_pii"/);

  r = await novo('tools/call', { name: 'contatos', arguments: { limite: 500 } });
  assert.equal(r.status, 200); assert.equal(r.json.result.isError, true);
  assert.match(r.json.result.content[0].text, /no máximo 100/);
  r = await novo('tools/call', { name: 'contato', arguments: { lead_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' } });
  assert.equal(r.json.result.isError, true); assert.match(r.json.result.content[0].text, /não encontrado/);

  r = await novo('tools/call', { name: 'conversa', arguments: { lead_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' } }, { chave: chavePii });
  assert.equal(r.json.result.isError, false); assert.equal(r.json.result.structuredContent.total, 3);

  const l = await novo('tools/list', {}, { chave: chavePropor });
  const proposta = l.json.result.tools.find(t => t.name === 'proposta_criar');
  assert.equal(proposta.annotations.readOnlyHint, false);
  r = await novo('tools/call', { name: 'proposta_criar', arguments: { tipo: 'pausar', alvo: { plataforma: 'meta', nivel: 'anuncio', ext: '555' }, titulo: 'Pausar o anúncio Vídeo 2', porque: 'Custo por contato acima de R$ 80 há três semanas.', evidencias: [{ fonte: 'campanhas', dado: 'R$ 84 por contato' }] } }, { chave: chavePropor });
  assert.equal(r.json.result.isError, false);
  assert.equal(r.json.result.structuredContent.nada_foi_executado, true);
  assert.equal(amb.sb.tabelas.trafego_acoes.length, 1);
});

test('Origin de fora da casa 403; da casa passa; chave na URL 400 com a frase que ensina o cabeçalho', async () => {
  let r = await novo('tools/list', {}, { cab: { Origin: 'https://site-malvado.example' } });
  assert.equal(r.status, 403);
  r = await novo('tools/list', {}, { cab: { Origin: enderecos.origens()[0] } });
  assert.equal(r.status, 200);
  const m = moderno('tools/list');
  r = await mcp(m.corpo, { cab: m.cab, caminho: `/mcp?chave=${chaveLer}` });
  assert.equal(r.status, 400); assert.match(r.json.error.message, /Authorization: Bearer/);
  assert.ok(!r.texto.includes(chaveLer));
  r = await fetch(`${base}/api/ia/v1/saude?token=${chaveLer}`, { headers: { Authorization: `Bearer ${chaveLer}` } });
  assert.equal(r.status, 400); assert.equal((await r.json()).codigo, 'chave_na_url');
});

test('porta REST: catálogo, GET com argumentos na consulta, POST com corpo, 401, 403, 404, 405, 422; mesmo resultado do MCP', async () => {
  const h = c => ({ Authorization: `Bearer ${c}`, 'Content-Type': 'application/json' });
  let r = await fetch(`${base}/api/ia/v1`);
  assert.equal(r.status, 401); assert.match(r.headers.get('www-authenticate'), /^Bearer/);
  r = await fetch(`${base}/api/ia/v1`, { headers: h(chavePropor) });
  const cat = await r.json();
  assert.equal(cat.ferramentas.length, 13);
  assert.ok(cat.ferramentas.find(f => f.nome === 'proposta_criar').metodos.includes('POST'));
  assert.match(cat.aviso, /texto_do_cliente/);

  r = await fetch(`${base}/api/ia/v1/contatos?periodo=mes&limite=2&paga=true`, { headers: h(chaveLer) });
  const g = await r.json();
  assert.equal(r.status, 200); assert.equal(g.itens.length, 2); assert.equal(g.filtros.paga, true);
  r = await fetch(`${base}/api/ia/v1/contatos`, { method: 'POST', headers: h(chaveLer), body: JSON.stringify({ periodo: 'mes', limite: 2, paga: true }) });
  assert.deepEqual(await r.json(), g, 'GET e POST dão o mesmo');

  const viaMcp = await novo('tools/call', { name: 'saude', arguments: {} });
  r = await fetch(`${base}/api/ia/v1/saude`, { headers: h(chaveLer) });
  assert.deepEqual(await r.json(), viaMcp.json.result.structuredContent, 'REST e MCP usam a mesma camada');

  r = await fetch(`${base}/api/ia/v1/proposta_criar`, { headers: h(chavePropor) });
  assert.equal(r.status, 405);
  r = await fetch(`${base}/api/ia/v1/proposta_criar`, { method: 'POST', headers: h(chaveLer), body: '{}' });
  assert.equal(r.status, 403); assert.equal((await r.json()).codigo, 'escopo');
  r = await fetch(`${base}/api/ia/v1/nao_existe`, { headers: h(chaveLer) });
  assert.equal(r.status, 404);
  r = await fetch(`${base}/api/ia/v1/contatos?limite=500`, { headers: h(chaveLer) });
  assert.equal(r.status, 422); assert.equal((await r.json()).codigo, 'args');
  r = await fetch(`${base}/api/ia/v1/contato?lead_id=ffffffff-ffff-4fff-8fff-ffffffffffff`, { headers: h(chaveLer) });
  assert.equal(r.status, 422); assert.equal((await r.json()).codigo, 'ferramenta');
});

test('caixa preta: chave criada pelo módulo; discover → tools/list → tools/call saude por HTTP; /api/ia/v1/saude; tudo auditado com a porta', async () => {
  const { chave, registro } = await Chaves.padrao().criar({ nome: 'Caixa preta', escopos: ['ler'] });
  const d = await novo('server/discover', {}, { chave });
  assert.equal(d.status, 200);
  const l = await novo('tools/list', {}, { chave });
  assert.ok(l.json.result.tools.some(t => t.name === 'saude'));
  const c = await novo('tools/call', { name: 'saude', arguments: {} }, { chave });
  assert.equal(c.json.result.isError, false);
  assert.ok(['ok', 'investigar'].includes(c.json.result.structuredContent.leitura));
  const rest = await fetch(`${base}/api/ia/v1/saude`, { headers: { Authorization: `Bearer ${chave}` } });
  assert.equal(rest.status, 200);
  assert.equal((await rest.json()).resumo, c.json.result.structuredContent.resumo);
  await F.auditoriasPendentes();
  const minhas = amb.sb.tabelas.ia_acoes.filter(a => a.entrada && a.entrada.chave && a.entrada.chave.id === registro.id);
  assert.deepEqual(minhas.map(a => [a.tipo, a.entrada.porta, a.status]), [['porta:saude', 'mcp', 'executada'], ['porta:saude', 'rest', 'executada']]);
  assert.ok(!JSON.stringify(amb.sb.tabelas.ia_acoes).includes(chave), 'a chave nunca vai para a auditoria');
  assert.equal(ondeAparece(amb.sb.tabelas.ia_acoes, 'ica_').length, 0);
  await Chaves.padrao().descarregar();
  assert.equal(amb.sb.tabelas.trafego_ia_chaves.find(k => k.id === registro.id).usos, 4, 'os quatro pedidos (discover, list, call e REST) contaram como uso');
});

test('ponte stdio: initialize, notificação, tools/list e tools/call pela linha de comando; sem chave ou com http de fora não sobe', async () => {
  const ponte = path.join(__dirname, '..', 'mcp', 'ponte-stdio.mjs');
  const rodar = (env, linhas) => new Promise(resolve => {
    const p = spawn(process.execPath, [ponte], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let saida = '', erro = '';
    p.stdout.on('data', c => { saida += c; });
    p.stderr.on('data', c => { erro += c; });
    p.on('close', codigo => resolve({ codigo, saida, erro }));
    for (const l of linhas) p.stdin.write(`${JSON.stringify(l)}\n`);
    p.stdin.end();
  });
  const env = { INDYCAR_TRAFEGO_URL: `${base}/mcp`, INDYCAR_TRAFEGO_CHAVE: chaveLer };
  const r = await rodar(env, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-desktop', version: '1' } } },
  ]);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(JSON.parse(r.saida.trim()).result.protocolVersion, '2025-06-18');
  const r2 = await rodar(env, [
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'saude', arguments: {} } },
  ]);
  const respostas = r2.saida.trim().split('\n').map(x => JSON.parse(x)).sort((a, b) => a.id - b.id);
  assert.deepEqual(respostas.map(x => x.id), [2, 3], 'a notificação não gera resposta');
  assert.equal(respostas[0].result.tools.length, 12);
  assert.equal(respostas[1].result.isError, false);
  assert.ok(!r2.saida.includes(chaveLer) && !r2.erro.includes(chaveLer), 'a ponte nunca imprime a chave');

  const semChave = await rodar({ INDYCAR_TRAFEGO_URL: `${base}/mcp`, INDYCAR_TRAFEGO_CHAVE: '' }, []);
  assert.equal(semChave.codigo, 1); assert.match(semChave.erro, /INDYCAR_TRAFEGO_CHAVE/);
  const aberto = await rodar({ INDYCAR_TRAFEGO_URL: 'http://exemplo.com.br/mcp', INDYCAR_TRAFEGO_CHAVE: chaveLer }, []);
  assert.equal(aberto.codigo, 1); assert.match(aberto.erro, /https/);
  const ruim = await rodar({ ...env, INDYCAR_TRAFEGO_CHAVE: `ica_${'Q'.repeat(40)}` }, [{ jsonrpc: '2.0', id: 9, method: 'tools/list', params: {} }]);
  const resp = JSON.parse(ruim.saida.trim());
  assert.equal(resp.id, 9); assert.ok(resp.error, 'chave errada vira erro JSON-RPC com o mesmo id');
});

test('injeção por fora da conversa (UTM forjada, termo de busca, rastreio do site): pelo MCP e pelo REST o texto só vem dentro de texto_do_cliente', async () => {
  const fora = ambienteDeFora();
  const { chave } = await Chaves.padrao().criar({ nome: 'Texto de fora', escopos: ['ler'] });
  F.configurar({ sb: fora.sb, fonte: fora.fonte, jornada: fora.jornada, agora: fora.agora });
  try {
    const cab = { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' };
    const pedidos = [
      ['contatos', { periodo: 'mes' }], ['contato', { lead_id: LEAD_UTM }], ['palavras_e_termos', { periodo: 'mes' }], ['campanhas', { periodo: 'mes' }],
      ['motivos_de_nao_fechar', { periodo: 'mes', por: 'campanha' }], ['resumo_do_periodo', { periodo: 'hoje' }],
    ];
    let vistos = 0;
    const pedacos = new Set();
    for (const [nome, args] of pedidos) {
      const m = await novo('tools/call', { name: nome, arguments: args }, { chave });
      assert.equal(m.status, 200, nome); assert.equal(m.json.result.isError, false, nome);
      const sc = m.json.result.structuredContent;
      assert.ok(m.json.result.content[0].text.startsWith(sc.resumo), nome);
      const r = await fetch(`${base}/api/ia/v1/${nome}`, { method: 'POST', headers: cab, body: JSON.stringify(args) });
      assert.equal(r.status, 200, nome);
      const rest = await r.json();
      assert.deepEqual(rest, sc, `${nome}: REST e MCP dão o mesmo`);
      for (const [porta, corpo] of [['mcp', sc], ['rest', rest]]) {
        for (const c of ondeAparece(corpo, MARCA_DE_FORA)) assert.match(c, /texto_do_cliente/, `${porta} ${nome}: texto de fora em ${c}`);
        assert.ok(!corpo.resumo.includes(MARCA_DE_FORA), `${porta} ${nome}: o resumo não leva texto de fora`);
      }
      vistos += ondeAparece(sc, MARCA_DE_FORA).length;
      for (const p of PEDACOS_DE_FORA) if (ondeAparece(sc, p).length) pedacos.add(p);
    }
    assert.ok(vistos >= 10, `o texto de fora chegou (como dado) ${vistos} vezes`);
    assert.deepEqual([...pedacos].sort(), [...PEDACOS_DE_FORA].sort());
    // GET com a consulta na URL: a mesma resposta
    const g = await fetch(`${base}/api/ia/v1/contato?lead_id=${LEAD_UTM}`, { headers: { Authorization: `Bearer ${chave}` } });
    const gj = await g.json();
    assert.ok(ondeAparece(gj, MARCA_DE_FORA).length >= 4);
    for (const c of ondeAparece(gj, MARCA_DE_FORA)) assert.match(c, /texto_do_cliente/, c);
    assert.ok(!ondeAparece(gj, '[historico]').length, 'campo a mais do histórico não passa');
  } finally {
    F.configurar({ sb: amb.sb, fonte: amb.fonte, jornada: amb.jornada, agora: amb.agora });
  }
});
