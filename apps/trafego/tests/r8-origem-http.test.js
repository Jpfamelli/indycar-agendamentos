'use strict';
/* Rodada 8 (T2b) — rotas da origem (Ajustes › De onde vêm os contatos) e do rastreio para sites de fora, pelo
   servidor de verdade com porteiro e banco de mentira: quem entra, o formato do que volta, o que fica gravado,
   o que vai para a auditoria, o banco sem a migração e a rota pública que nunca diz por que recusou. */
const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../auth');
const equipe = require('../equipe');
const db = require('../db');
const Origem = require('../origem');
const enderecos = require('../enderecos');
const { criarBanco } = require('./apoio/banco-falso');
const { servidor, ROTAS_COM_ERRO } = require('../server');
const { POR_IP } = require('../rotas/rastreio');

const ID = n => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const PAPEIS = {
  admin: { usuario: { id: ID(1), papel: 'admin', apps: [], ativo: true, nome: 'Marina Costa' } },
  outro: { usuario: { id: ID(2), papel: 'admin', apps: [], ativo: true, nome: 'Paulo Reis' } },
  gestor_sem_ads: { usuario: { id: ID(3), papel: 'gestor', apps: ['crm'], ativo: true } },
};
const FRASE_ID = ID('a'), NAO_EXISTE = ID('f');
const SEGREDO = 'IwAR-SEGREDO-Clique';

let base, sb;
const auditorias = [];
const orig = { identificar: auth.identificar, banco: equipe.banco, sb: db.sb };

function bancoCompleto() {
  return criarBanco({
    trafego_frases: [{ id: FRASE_ID, frase: 'ola! tenho interesse e queria mais informacoes', tipo: 'comeca', como: 'frase_padrao', paga: true, plataforma: 'meta', origem: null, ativa: true, acertos: 12, rotulo: 'Mensagem padrão de anúncio da Meta', created_at: '2026-11-19T10:00:00Z' }],
    trafego_rastreio: [
      { id: 'r1', codigo: 'AAAAA', evento: 'visita', permanente: false, pagina: '/servicos/oleo', criado_em: new Date(Date.now() - 2 * 86400000).toISOString(), atualizado_em: null },
      { id: 'r2', codigo: 'BBBBB', evento: 'clique', permanente: false, pagina: '/servicos/oleo', criado_em: new Date(Date.now() - 86400000).toISOString(), atualizado_em: new Date(Date.now() - 86000000).toISOString() },
      { id: 'r3', codigo: 'CCCCC', evento: 'visita', permanente: false, pagina: '/', criado_em: new Date(Date.now() - 20 * 86400000).toISOString(), atualizado_em: null },
      { id: 'r4', codigo: 'DDDDD', evento: 'link', permanente: true, rotulo: 'Bio', criado_em: new Date().toISOString() },
    ],
    empresa: [{ id: true, telefone: '(12) 99000-1234' }],
    perfis: [],
  }, {
    unicos: { trafego_frases: ['frase'], trafego_rastreio: ['codigo'] },
    rpc: {
      trafego_frases_candidatas: () => [
        { frase: 'vi o anuncio no instagram e quero orcamento', n: 5, exemplo: 'Vi o anúncio no Instagram e quero orçamento', ultima_em: '2026-11-18T12:00:00Z' },
        { frase: 'bom dia quero saber o preco da revisao', n: 3, exemplo: 'Bom dia, quero saber o preço da revisão', ultima_em: '2026-11-17T12:00:00Z' },
      ],
      trafego_origem_da_mensagem: ({ p_texto }) => (/\[ref k7m2p\]/i.test(p_texto)
        ? { como: 'ref', paga: true, plataforma: 'meta', codigo: 'K7M2P', permanente: true, campanha_nome: 'Óleo novembro', fbclid: SEGREDO, resolvido: true, canal: 'meta' }
        : null),
      trafego_reaplicar_origem: ({ p_simular }) => ({ analisados: 10, com_mensagem: 8, com_sinal: 3, [p_simular ? 'mudariam' : 'mudaram']: 3, por_origem: [{ rotulo: 'Anúncio da Meta', n: 3 }], por_frase: [{ frase: 'vi o anuncio', n: 2 }] }),
      trafego_rastreio_registrar: () => ({ ok: true, codigo: 'K7M2P' }),
    },
  });
}

test.before(async () => {
  auth.identificar = async req => PAPEIS[req.headers['x-papel']] || { motivo: 'sem_token' };
  equipe.banco = () => ({ tocarAcesso: async () => true, auditar: async (u, acao, o) => { auditorias.push({ quem: u.id, acao, ...o }); return true; } });
  sb = bancoCompleto(); db.sb = sb;
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
test.after(async () => {
  auth.identificar = orig.identificar; equipe.banco = orig.banco; db.sb = orig.sb;
  servidor.closeAllConnections?.();
  await new Promise(r => servidor.close(r));
});

async function pedir(caminho, { papel = 'admin', metodo = 'GET', corpo, cabecalhos = {} } = {}) {
  const r = await fetch(base + caminho, {
    method: metodo, body: corpo === undefined ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
    headers: { ...(papel ? { 'x-papel': papel } : {}), 'Content-Type': 'application/json', ...cabecalhos },
  });
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch { /* não é JSON */ }
  return { status: r.status, json, texto, headers: r.headers };
}

test('os arquivos de rotas da origem e do rastreio carregam sem erro', () => {
  assert.equal(ROTAS_COM_ERRO.includes('origem.js'), false);
  assert.equal(ROTAS_COM_ERRO.includes('rastreio.js'), false);
});

test('rotas da origem exigem login e o acesso ao app', async () => {
  assert.equal((await pedir('/api/origem/frases', { papel: null })).status, 401);
  assert.equal((await pedir('/api/origem/frases', { papel: 'gestor_sem_ads' })).status, 403);
  assert.equal((await pedir('/api/origem/link', { papel: null, metodo: 'POST', corpo: { rotulo: 'x' } })).status, 401);
});

test('GET /api/origem/frases: frases com a origem que cada uma dá e as escolhas da tela', async () => {
  const r = await pedir('/api/origem/frases');
  assert.equal(r.status, 200);
  assert.equal(r.json.ligado, true);
  const f = r.json.frases[0];
  assert.equal(f.id, FRASE_ID);
  assert.equal(f.acertos, 12);
  assert.deepEqual([f.vira.canal, f.vira.paga, f.vira.certeza, f.vira.como_rotulo], ['meta', true, 'provavel', 'pela mensagem padrão de anúncio']);
  assert.ok(r.json.destinos.some(d => d.id === 'a_confirmar'));
});

test('criar, editar e desligar frase: normaliza, valida, recusa repetida e audita sem o texto', async () => {
  const n = auditorias.length;
  const criada = await pedir('/api/origem/frases', { metodo: 'POST', corpo: { frase: '  Vi o ANÚNCIO da troca de óleo!! ', tipo: 'contem', canal: 'anuncio', campanha_nome: 'Óleo novembro' } });
  assert.equal(criada.status, 200);
  assert.equal(criada.json.frase.frase, 'vi o anuncio da troca de oleo');
  assert.deepEqual([criada.json.frase.paga, criada.json.frase.plataforma, criada.json.frase.vira.rotulo], [true, null, 'Anúncio (não sabemos de qual plataforma)']);
  const gravada = sb.tabelas.trafego_frases.find(x => x.frase === 'vi o anuncio da troca de oleo');
  assert.equal(gravada.criada_por, ID(1));
  assert.equal(gravada.como, 'frase');
  gravada.id = ID('b');                                    // o banco de verdade dá um uuid; o de mentira, não
  const a = auditorias[n];
  assert.equal(a.acao, 'trafego_frase_criada');
  assert.equal(JSON.stringify(a).includes('troca de oleo'), false, 'auditoria sem texto livre');

  assert.equal((await pedir('/api/origem/frases', { metodo: 'POST', corpo: { frase: 'Vi o anúncio da troca de óleo', canal: 'meta' } })).status, 409);
  const semCanal = await pedir('/api/origem/frases', { metodo: 'POST', corpo: { frase: 'outra frase comprida', canal: 'tv' } });
  assert.equal(semCanal.status, 422);
  assert.equal(semCanal.json.campo, 'canal');
  assert.ok(Array.isArray(semCanal.json.opcoes));
  assert.equal((await pedir('/api/origem/frases', { metodo: 'POST', corpo: { frase: 'curta', canal: 'meta' } })).status, 422);

  const editada = await pedir(`/api/origem/frases/${gravada.id}`, { metodo: 'POST', corpo: { canal: 'google' } });
  assert.equal(editada.status, 200);
  assert.deepEqual([editada.json.frase.plataforma, editada.json.frase.vira.canal], ['google', 'google']);
  const desligada = await pedir(`/api/origem/frases/${gravada.id}`, { metodo: 'DELETE' });
  assert.equal(desligada.status, 200);
  assert.equal(desligada.json.frase.ativa, false);
  assert.ok(sb.tabelas.trafego_frases.includes(gravada), 'desligar não apaga a linha');
  assert.equal((await pedir(`/api/origem/frases/${NAO_EXISTE}`, { metodo: 'DELETE' })).status, 404);
  assert.deepEqual(auditorias.slice(n).map(x => x.acao), ['trafego_frase_criada', 'trafego_frase_editada', 'trafego_frase_desligada']);
});

test('candidatas trazem quantas vezes, um exemplo e um palpite de origem', async () => {
  const r = await pedir('/api/origem/candidatas');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.candidatas.map(c => [c.n, c.sugestao && c.sugestao.canal]), [[5, 'meta'], [3, null]]);
  assert.equal(r.json.candidatas[0].exemplo, 'Vi o anúncio no Instagram e quero orçamento');
});

test('testar mensagem devolve a origem e nunca o identificador de clique', async () => {
  const r = await pedir('/api/origem/testar', { metodo: 'POST', corpo: { mensagem: 'Olá! Quero saber da troca de óleo. [ref K7M2P]' } });
  assert.equal(r.status, 200);
  assert.deepEqual([r.json.origem.canal, r.json.origem.certeza, r.json.origem.como_rotulo, r.json.codigo], ['meta', 'certa', 'pelo código da mensagem pronta', 'K7M2P']);
  assert.equal(r.texto.includes(SEGREDO), false);
  assert.equal(r.texto.includes('fbclid'), false);
  const nada = await pedir('/api/origem/testar', { metodo: 'POST', corpo: { mensagem: 'Bom dia' } });
  assert.deepEqual(nada.json, { origem: null, frase_id: null, codigo: null, rotulo: null });
  assert.equal((await pedir('/api/origem/testar', { metodo: 'POST', corpo: { mensagem: 'x'.repeat(2001) } })).status, 422);
  assert.equal((await pedir('/api/origem/testar', { metodo: 'POST', corpo: {} })).status, 422);
});

test('reaplicar: só aplica depois de simular, com a mesma data, pela mesma pessoa, uma vez', async () => {
  Origem.esquecerSimulacoes();
  const n = auditorias.length;
  const semSimular = await pedir('/api/origem/reaplicar', { metodo: 'POST', corpo: { simular: false, desde: '2026-08-01' } });
  assert.equal(semSimular.status, 409);
  assert.equal(semSimular.json.codigo, 'simule_primeiro');
  const sim = await pedir('/api/origem/reaplicar', { metodo: 'POST', corpo: { simular: true, desde: '2026-08-01' } });
  assert.equal(sim.status, 200);
  assert.deepEqual([sim.json.simulado, sim.json.mudariam, sim.json.por_origem[0].rotulo], [true, 3, 'Anúncio da Meta']);
  assert.ok(sim.json.aplicar_ate);
  assert.equal((await pedir('/api/origem/reaplicar', { metodo: 'POST', corpo: { simular: false, desde: '2026-07-01' } })).status, 409, 'outra data');
  assert.equal((await pedir('/api/origem/reaplicar', { papel: 'outro', metodo: 'POST', corpo: { simular: false, desde: '2026-08-01' } })).status, 409, 'outra pessoa');
  assert.equal(auditorias.length, n, 'simular não audita');
  // a recusa de data diferente não gasta a simulação
  const aplicou = await pedir('/api/origem/reaplicar', { metodo: 'POST', corpo: { simular: false, desde: '2026-08-01' } });
  assert.equal(aplicou.status, 200);
  assert.deepEqual([aplicou.json.simulado, aplicou.json.mudaram], [false, 3]);
  assert.equal(sb.chamadas.filter(c => c.nome === 'trafego_reaplicar_origem').at(-1).args.p_simular, false);
  assert.equal(auditorias.at(-1).acao, 'trafego_origem_reaplicada');
  assert.equal((await pedir('/api/origem/reaplicar', { metodo: 'POST', corpo: { simular: false, desde: '2026-08-01' } })).status, 409, 'cada simulação vale uma vez');
  assert.equal((await pedir('/api/origem/reaplicar', { metodo: 'POST', corpo: { desde: '2099-01-01' } })).status, 422);
  assert.equal((await pedir('/api/origem/reaplicar', { metodo: 'POST', corpo: { desde: '2026-02-30' } })).status, 422);
});

test('reaplicar: a simulação vence em 10 minutos', async () => {
  Origem.esquecerSimulacoes();
  const quem = PAPEIS.admin.usuario, t = Date.parse('2026-11-19T12:00:00Z');
  await Origem.reaplicar({ simular: true, desde: '2026-09-01', quem, sb, agora: t });
  await assert.rejects(Origem.reaplicar({ simular: false, desde: '2026-09-01', quem, sb, agora: t + Origem.DEZ_MINUTOS + 1 }), e => e.status === 409);
  await Origem.reaplicar({ simular: true, desde: '2026-09-01', quem, sb, agora: t });
  const r = await Origem.reaplicar({ simular: false, desde: '2026-09-01', quem, sb, agora: t + Origem.DEZ_MINUTOS - 1000 });
  assert.equal(r.mudaram, 3);
});

test('mensagem pronta: grava o código permanente e devolve texto, link do WhatsApp e QR code', async () => {
  const n = sb.tabelas.trafego_rastreio.length;
  const r = await pedir('/api/origem/link', { metodo: 'POST', corpo: { rotulo: 'Anúncio troca de óleo', plataforma: 'meta', campanha_nome: 'Óleo novembro', texto: 'Olá! Quero saber da troca de óleo.' } });
  assert.equal(r.status, 200);
  const nova = sb.tabelas.trafego_rastreio[n];
  assert.deepEqual([nova.evento, nova.permanente, nova.plataforma, nova.paga, nova.criado_por], ['link', true, 'meta', true, ID(1)]);
  assert.match(nova.codigo, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
  assert.equal(r.json.texto, `Olá! Quero saber da troca de óleo. [ref ${nova.codigo}]`);
  assert.equal(r.json.link_whatsapp, `https://wa.me/5512990001234?text=${encodeURIComponent(r.json.texto)}`);
  assert.match(r.json.qr_svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+"/);
  assert.deepEqual([r.json.frase.codigo, r.json.frase.origem.canal, r.json.frase.origem.certeza, r.json.frase.origem.como_rotulo], [nova.codigo, 'meta', 'certa', 'pelo código da mensagem pronta']);
  assert.equal(auditorias.at(-1).acao, 'trafego_mensagem_pronta_criada');

  const bio = await pedir('/api/origem/link', { metodo: 'POST', corpo: { rotulo: 'Bio do Instagram' } });
  assert.match(bio.json.texto, /^Olá! Quero saber mais\. \[ref [A-Z2-9]{5}\]$/);
  assert.equal(sb.tabelas.trafego_rastreio.at(-1).paga, false);
  assert.equal((await pedir('/api/origem/link', { metodo: 'POST', corpo: { rotulo: 'x' } })).status, 422);
  assert.equal((await pedir('/api/origem/link', { metodo: 'POST', corpo: { rotulo: 'Cartaz', texto: 'Oi [ref AAAAA]' } })).status, 422);
  assert.equal((await pedir('/api/origem/link', { metodo: 'POST', corpo: { rotulo: 'Cartaz', plataforma: 'tiktok' } })).status, 422);
});

test('mensagem pronta sem telefone da oficina: grava, devolve o texto e avisa (sem link e sem QR)', async () => {
  const banco = criarBanco({ trafego_rastreio: [], empresa: [] }, { unicos: { trafego_rastreio: ['codigo'] } });
  const r = await Origem.criarLink({ rotulo: 'Cartaz da oficina' }, { sb: banco });
  assert.equal(banco.tabelas.trafego_rastreio.length, 1);
  assert.equal(r.link_whatsapp, null);
  assert.equal(r.qr_svg, null);
  assert.match(r.aviso, /telefone da oficina/);
});

test('mensagem pronta sorteia outro código quando o primeiro já existe', async () => {
  let vezes = 0;
  const banco = criarBanco({ trafego_rastreio: [], empresa: [{ id: true, telefone: '12990001234' }] });
  const inserir = banco.from;
  banco.from = tabela => {
    const c = inserir(tabela);
    if (tabela !== 'trafego_rastreio') return c;
    const insert = c.insert.bind(c);
    c.insert = linha => { vezes++; if (vezes === 1) { c.executar = async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }); } return insert(linha); };
    return c;
  };
  const r = await Origem.criarLink({ rotulo: 'Anúncio', paga: true }, { sb: banco });
  assert.equal(vezes, 2);
  assert.equal(banco.tabelas.trafego_rastreio.length, 1);
  assert.equal(r.frase.origem.rotulo, 'Anúncio (não sabemos de qual plataforma)');
});

test('GET /api/origem/rastreio: situação do site e a linha para colar', async () => {
  const r = await pedir('/api/origem/rastreio');
  assert.equal(r.status, 200);
  assert.equal(r.json.script, `<script src="${enderecos.urlDoTrafego('rastreio.js')}" async></script>`);
  assert.equal(r.json.instalado_no_site, true);
  assert.equal(r.json.cliques_7d, 1);
  assert.equal(r.json.visitas_7d, 2);
  assert.deepEqual(r.json.por_pagina, [{ pagina: '/servicos/oleo', n: 2, cliques: 1 }], 'por página: visitas e, delas, quantas tocaram no WhatsApp (7 dias)');
  assert.ok(r.json.ultimo_clique);
});

test('banco sem a migração: leitura avisa (ligado: false) e escrita recusa com 503 explicado', async () => {
  db.sb = criarBanco({ empresa: [] });
  try {
    const frases = await pedir('/api/origem/frases');
    assert.equal(frases.status, 200);
    assert.deepEqual([frases.json.ligado, frases.json.frases.length], [false, 0]);
    assert.match(frases.json.aviso, /falta aplicar no banco/);
    assert.equal((await pedir('/api/origem/candidatas')).json.ligado, false);
    const ras = await pedir('/api/origem/rastreio');
    assert.deepEqual([ras.status, ras.json.ligado, ras.json.cliques_7d], [200, false, null]);
    for (const [caminho, corpo] of [['/api/origem/frases', { frase: 'vi o anuncio no google', canal: 'google' }], ['/api/origem/testar', { mensagem: 'oi' }],
      ['/api/origem/reaplicar', { simular: true, desde: '2026-08-01' }], ['/api/origem/link', { rotulo: 'Bio' }]]) {
      const r = await pedir(caminho, { metodo: 'POST', corpo });
      assert.equal(r.status, 503, caminho);
      assert.equal(r.json.codigo, 'sem_migracao', caminho);
      assert.match(r.json.erro, /rodada 8/, caminho);
    }
  } finally { db.sb = sb; }
});

/* ---------------- rotas públicas do rastreio ---------------- */

test('GET /rastreio.js: público, cache de 1 hora, liberado para qualquer site e menor que 4 KB', async () => {
  const r = await pedir('/rastreio.js', { papel: null });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/javascript/);
  assert.equal(r.headers.get('cache-control'), 'public, max-age=3600');
  assert.equal(r.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.ok(Buffer.byteLength(r.texto) < 4096);
  assert.match(r.texto, /^\(function\(w,d\)\{/);
});

test('POST /api/rastreio: repassa só os campos do contrato, com o IP de quem chamou, e devolve o código', async () => {
  const antes = sb.chamadas.length;
  const logs = [];
  const log = console.log;
  console.log = (...a) => { logs.push(a.join(' ')); };
  let r;
  try {
    r = await pedir('/api/rastreio', {
      papel: null, cabecalhos: { 'Content-Type': 'text/plain;charset=UTF-8', 'X-Forwarded-For': '203.0.113.9', 'User-Agent': 'Teste/1.0', Origin: 'https://site-de-fora.com.br' },
      metodo: 'POST', corpo: { evento: 'visita', gclid: 'AbC-12_xYz', utm_source: 'google', pagina: '/a?nome=Ze', nome: 'Zé', telefone: '12999990000', referencia_tipo: 'anuncio', ip: '1.1.1.1' },
    });
  } finally { console.log = log; }
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, codigo: 'K7M2P' });
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const chamada = sb.chamadas.slice(antes).find(c => c.nome === 'trafego_rastreio_registrar');
  assert.deepEqual(chamada.args.p_dados, { evento: 'visita', pagina: '/a', referencia_tipo: 'anuncio', utm_source: 'google', gclid: 'AbC-12_xYz', ip: '203.0.113.9', user_agent: 'Teste/1.0' });
  assert.equal(logs.join('\n').includes('AbC-12_xYz'), false, 'identificador de clique fora do log');
});

test('POST /api/rastreio: preflight de outro site passa', async () => {
  const r = await fetch(base + '/api/rastreio', { method: 'OPTIONS', headers: { Origin: 'https://site-de-fora.com.br', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
});

test('POST /api/rastreio: corpo grande, JSON ruim, lista ou banco sem a função respondem { ok: true } sem dizer o motivo', async () => {
  const antes = sb.chamadas.length;
  const casos = [JSON.stringify({ evento: 'visita', utm_campaign: 'x'.repeat(5000) }), '{isto não é json', '[1,2,3]', '"texto"', ''];
  for (const corpo of casos) {
    const r = await pedir('/api/rastreio', { papel: null, metodo: 'POST', corpo, cabecalhos: { 'X-Forwarded-For': '198.51.100.7' } });
    assert.equal(r.status, 200);
    assert.equal(r.texto, '{"ok":true}');
  }
  assert.equal(sb.chamadas.length, antes, 'nada disso chega ao banco');
  db.sb = criarBanco({});
  try {
    const r = await pedir('/api/rastreio', { papel: null, metodo: 'POST', corpo: { evento: 'visita' }, cabecalhos: { 'X-Forwarded-For': '198.51.100.8' } });
    assert.equal(r.texto, '{"ok":true}');
  } finally { db.sb = sb; }
});

test('POST /api/rastreio: acima do limite por IP responde { ok: true } sem código e não chama o banco', async () => {
  const ip = { 'X-Forwarded-For': '192.0.2.44' };
  for (let i = 0; i < POR_IP; i++) {
    const r = await pedir('/api/rastreio', { papel: null, metodo: 'POST', corpo: { evento: 'visita' }, cabecalhos: ip });
    assert.equal(r.json.codigo, 'K7M2P');
  }
  const antes = sb.chamadas.length;
  const r = await pedir('/api/rastreio', { papel: null, metodo: 'POST', corpo: { evento: 'visita' }, cabecalhos: ip });
  assert.equal(r.texto, '{"ok":true}');
  assert.equal(sb.chamadas.length, antes);
  const outro = await pedir('/api/rastreio', { papel: null, metodo: 'POST', corpo: { evento: 'visita' }, cabecalhos: { 'X-Forwarded-For': '192.0.2.45' } });
  assert.equal(outro.json.codigo, 'K7M2P', 'outro IP segue normal');
});
