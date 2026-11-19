'use strict';
/* Rodada 8 (frente T2a) — o estado das conexões que a tela mostra (contrato da API, §5.2 e §5.5):
   Meta, Google, rastreio do site e o WhatsApp da oficina. Funções puras: recebem o que veio do banco
   já sem segredo nenhum e devolvem o objeto pronto, com o aviso em português simples. */
const test = require('node:test');
const assert = require('node:assert/strict');

const C = require('../motor/conexoes-estado');
const T = require('../motor/texto');

const AGORA = Date.parse('2026-11-19T15:00:00Z');   // 12h de Brasília, quinta-feira
const linha = (extra = {}) => ({ canal: 'meta', ativo: true, tem_token: true, ultimo_sync_em: '2026-11-19T10:10:00Z', ultimo_sync_status: 'ok — 42 linhas', token_expira_em: null, ...extra });

test('plataforma que nunca foi ligada: sem linha, desligada ou sem acesso gravado', () => {
  const nunca = { ligado: false, situacao: 'nunca_ligou', ultima_coleta: null, aviso: null, parada: false };
  assert.deepEqual(C.situacaoDaPlataforma('meta', null, { agora: AGORA }), nunca);
  assert.deepEqual(C.situacaoDaPlataforma('meta', linha({ ativo: false }), { agora: AGORA }), nunca);
  assert.deepEqual(C.situacaoDaPlataforma('google', linha({ canal: 'google', tem_token: false }), { agora: AGORA }), nunca);
});

test('plataforma ligada e coletando: ok, com a hora da última coleta', () => {
  assert.deepEqual(C.situacaoDaPlataforma('meta', linha(), { agora: AGORA }),
    { ligado: true, situacao: 'ok', ultima_coleta: '2026-11-19T10:10:00Z', aviso: null, parada: false });
  const primeira = C.situacaoDaPlataforma('google', linha({ canal: 'google', ultimo_sync_em: null, ultimo_sync_status: null }), { agora: AGORA });
  assert.equal(primeira.situacao, 'ok');
  assert.equal(primeira.ultima_coleta, null);
  assert.match(primeira.aviso, /primeira coleta/);
});

test('coleta parada: ligada, sem erro, mas a última coleta tem mais de um dia e meio', () => {
  const r = C.situacaoDaPlataforma('meta', linha({ ultimo_sync_em: '2026-11-16T10:00:00Z' }), { agora: AGORA });
  assert.equal(r.situacao, 'ok');
  assert.equal(r.parada, true);
  assert.equal(r.aviso, 'A última coleta da Meta foi em 16/11. Ela deveria rodar todo dia.');
});

test('erro da plataforma vira aviso de gente, sem o texto técnico e sem pedaço de chave', () => {
  const recusada = C.situacaoDaPlataforma('meta', linha({ ultimo_sync_status: 'erro — Meta API 400: Malformed access token EAAB1234567890abcdef (código 190)' }), { agora: AGORA });
  assert.deepEqual(recusada, { ligado: false, situacao: 'erro', ultima_coleta: null, parada: true,
    aviso: 'A Meta recusou o acesso: a autorização venceu ou é inválida. Refaça a ligação em Ajustes.' });
  assert.doesNotMatch(JSON.stringify(recusada), /EAAB|190|token|Malformed/i);

  const casos = [
    ['erro — invalid_grant: Token has been expired or revoked', 'google', /^O Google recusou o acesso: a autorização venceu/],
    ['erro — (#200) Requires ads_read permission', 'meta', /falta permissão para ler os anúncios/],
    ['erro — CUSTOMER_NOT_ENABLED', 'google', /^A conta de anúncios do Google não foi encontrada/],
    ['erro — fetch failed', 'meta', /^A Meta não respondeu na última coleta/],
    ['erro — coisa nova que ninguém viu', 'meta', /^A última coleta da Meta deu erro/],
  ];
  for (const [status, canal, esperado] of casos) {
    const r = C.situacaoDaPlataforma(canal, linha({ canal, ultimo_sync_status: status }), { agora: AGORA });
    assert.equal(r.situacao, 'erro', status);
    assert.match(r.aviso, esperado, status);
  }
});

test('acesso vencendo: avisa com os dias que faltam; acesso vencido já é erro', () => {
  const vencendo = C.situacaoDaPlataforma('meta', linha({ token_expira_em: '2026-11-23T15:00:00Z' }), { agora: AGORA });
  assert.equal(vencendo.situacao, 'token_vencendo');
  assert.equal(vencendo.ligado, true);
  assert.equal(vencendo.aviso, 'O acesso da Meta vence em 4 dias (23/11). Renove antes para a coleta não parar.');
  assert.equal(C.situacaoDaPlataforma('meta', linha({ token_expira_em: '2026-11-20T10:00:00Z' }), { agora: AGORA }).aviso, 'O acesso da Meta vence amanhã (20/11). Renove antes para a coleta não parar.');
  assert.equal(C.situacaoDaPlataforma('meta', linha({ token_expira_em: '2026-12-25T15:00:00Z' }), { agora: AGORA }).situacao, 'ok', 'falta mais de uma semana');
  const vencido = C.situacaoDaPlataforma('meta', linha({ token_expira_em: '2026-11-18T15:00:00Z' }), { agora: AGORA });
  assert.equal(vencido.situacao, 'erro');
  assert.equal(vencido.aviso, 'O acesso da Meta venceu em 18/11. Refaça a ligação em Ajustes.');
});

test('rastreio do site: ligado quando já houve clique; tabela ausente não é zero, é "não sei"', () => {
  assert.deepEqual(C.situacaoDoSite({ existe: true, cliques_7d: 12, ultimo_clique: '2026-11-19T12:00:00Z' }), { rastreio: true, ultimo_clique: '2026-11-19T12:00:00Z', cliques_7d: 12 });
  assert.deepEqual(C.situacaoDoSite({ existe: true, cliques_7d: 0, ultimo_clique: '2026-10-01T12:00:00Z' }), { rastreio: true, ultimo_clique: '2026-10-01T12:00:00Z', cliques_7d: 0 });
  assert.deepEqual(C.situacaoDoSite({ existe: true, cliques_7d: 0, ultimo_clique: null }), { rastreio: false, ultimo_clique: null, cliques_7d: 0 });
  assert.deepEqual(C.situacaoDoSite({ existe: false }), { rastreio: false, ultimo_clique: null, cliques_7d: null });
  assert.deepEqual(C.situacaoDoSite(null), { rastreio: false, ultimo_clique: null, cliques_7d: null });
});

test('WhatsApp: chave recusada é o caso de hoje; "desde" é a última mensagem que saiu, não a hora do último erro', () => {
  const cfg = { ativo: true, device_id: 'aparelho-1', ultimo_evento_em: '2026-11-18T20:08:00Z', sincronia_erro: 'o CodeWords respondeu 401: Unauthorized',
    sincronia_erro_em: '2026-11-19T10:09:00Z', sincronia_falhas: 75585 };
  const r = C.situacaoDoWhatsapp(cfg, { agora: AGORA, ultimaSaida: '2026-09-30T19:32:24Z' });
  assert.deepEqual(r, { ligado: false, situacao: 'chave_recusada', desde: '2026-09-30',
    aviso: 'A chave do WhatsApp foi recusada. Lembretes e respostas não estão saindo desde 30/09. Só o dono da conta consegue gerar a chave nova.' });
  const semData = C.situacaoDoWhatsapp(cfg, { agora: AGORA, ultimaSaida: null });
  assert.equal(semData.desde, null, 'sem saber a última mensagem, não inventa data (o erro é regravado a cada tentativa)');
  assert.equal(semData.aviso, 'A chave do WhatsApp foi recusada. Lembretes e respostas não estão saindo. Só o dono da conta consegue gerar a chave nova.');
  assert.equal(C.situacaoDoWhatsapp({ ...cfg, sincronia_erro: 'A chave do CodeWords foi recusada (401).' }, { agora: AGORA }).situacao, 'chave_recusada');
});

test('WhatsApp: funcionando, sem aparelho, sem notícia e sem leitura', () => {
  const ok = { ativo: true, device_id: 'aparelho-1', ultimo_evento_em: '2026-11-19T14:00:00Z', sincronia_erro: null, sincronia_erro_em: null, sincronia_falhas: 0 };
  assert.deepEqual(C.situacaoDoWhatsapp(ok, { agora: AGORA }), { ligado: true, situacao: 'ok', desde: null, aviso: null });
  // uma falha só (piscada) ainda não acende nada
  assert.equal(C.situacaoDoWhatsapp({ ...ok, sincronia_falhas: 1 }, { agora: AGORA }).situacao, 'ok');

  assert.equal(C.situacaoDoWhatsapp(null, { agora: AGORA }).situacao, 'sem_aparelho');
  assert.equal(C.situacaoDoWhatsapp({ ...ok, device_id: null }, { agora: AGORA }).situacao, 'sem_aparelho');
  assert.equal(C.situacaoDoWhatsapp({ ...ok, ativo: false }, { agora: AGORA }).ligado, false);

  const mudo = C.situacaoDoWhatsapp({ ...ok, ultimo_evento_em: '2026-11-14T14:00:00Z' }, { agora: AGORA });
  assert.deepEqual(mudo, { ligado: false, situacao: 'sem_noticia', desde: '2026-11-14', aviso: 'Nenhuma mensagem chega pelo WhatsApp desde 14/11. Confira se o aparelho está ligado e com internet.' });
  const outroErro = C.situacaoDoWhatsapp({ ...ok, sincronia_erro: 'o CodeWords respondeu 500', sincronia_falhas: 12 }, { agora: AGORA });
  assert.equal(outroErro.situacao, 'sem_noticia');
  assert.match(outroErro.aviso, /não está conseguindo ler as conversas/);

  const semLeitura = C.situacaoDoWhatsapp(undefined, { agora: AGORA, indisponivel: true });
  assert.equal(semLeitura.situacao, 'sem_noticia');
  assert.match(semLeitura.aviso, /Não deu para ler/);
});

test('conexões juntas e os passos para ligar tudo: texto da casa, sem sigla e sem segredo', () => {
  const con = C.montarConexoes({
    integracoes: [linha({ ultimo_sync_status: 'erro — código 190' })], agora: AGORA,
    codewords: { ativo: true, device_id: 'aparelho-1', ultimo_evento_em: '2026-11-18T20:08:00Z', sincronia_erro: '401: Unauthorized', sincronia_falhas: 9 },
    ultimaSaida: '2026-09-30T19:32:24Z', rastreio: { existe: true, cliques_7d: 0, ultimo_clique: null },
  });
  assert.deepEqual(Object.keys(con), ['meta', 'google', 'site', 'whatsapp']);
  assert.equal(con.meta.situacao, 'erro');
  assert.equal(con.google.situacao, 'nunca_ligou');
  assert.equal(con.whatsapp.situacao, 'chave_recusada');

  const passos = C.passosDeConexao(con, { orcamento: null });
  assert.ok(passos.length >= 4);
  assert.ok(passos.every(p => typeof p.feito === 'boolean' && p.titulo && p.como && p.acao && p.acao.rotulo && p.acao.ir));
  assert.ok(passos.every(p => !p.feito), 'hoje nada está pronto');
  assert.equal(passos[0].acao.ir, '/atendimento/?aba=integracoes', 'o primeiro passo é o WhatsApp, que mora no Atendimento');
  assert.ok(passos.some(p => p.acao.ir === 'ajustes?secao=conexoes'));
  assert.deepEqual(T.textosRuins({ con, passos }), []);

  const tudoCerto = C.montarConexoes({
    integracoes: [linha(), linha({ canal: 'google' })], agora: AGORA,
    codewords: { ativo: true, device_id: 'a', ultimo_evento_em: '2026-11-19T14:00:00Z', sincronia_erro: null, sincronia_falhas: 0 },
    rastreio: { existe: true, cliques_7d: 3, ultimo_clique: '2026-11-19T12:00:00Z' },
  });
  assert.ok(C.passosDeConexao(tudoCerto, { orcamento: 3000 }).every(p => p.feito));
});
