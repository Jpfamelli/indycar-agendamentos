'use strict';
/* Rodada 8, frente T7b (integração) — os ajustes de servidor da lista "Para a integração" do plano:
   1. régua do retorno pela margem (motor/campanhas.js);
   6. Google sem developer token ("tem acesso" = google.temAcesso em db.js e motor/fonte.js; tela antiga e .env.exemplo);
   7. miniatura do anúncio pelo próprio app no detalhe da campanha;
   9. /api/hoje manda as etapas (mini-setores) de quem chegou hoje;
   e a chave das rotinas também no cabeçalho X-Cron-Chave (o pg_cron usa esse caminho).
   O item 3 (conversas novas pela função do banco) está em tests/r8-jornada.test.js. Sem rede e sem banco. */
process.env.ADS_CRON_TOKEN = process.env.ADS_CRON_TOKEN || 'chave-de-teste-t7b';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../motor/campanhas');
const Hoje = require('../motor/hoje');
const F = require('../motor/fonte');
const Est = require('../motor/conexoes-estado');
const T = require('../motor/texto');
const db = require('../db');
const google = require('../google');
const coletor = require('../coletor');
const Guia = require('../public/guia-conexao.js');
const D = require('./apoio/trafego-dados');

const q = (s = '') => new URLSearchParams(s);
const limpo = r => { assert.deepEqual(T.naoFinitos(r), []); assert.deepEqual(T.textosRuins(r), []); };
const dia = d => `2026-11-${String(d).padStart(2, '0')}`;

/* ---------------- 1. régua do retorno pela margem ---------------- */

test('régua: ruim abaixo de 1/margem, atenção até 2/margem, bom acima; sem margem (nula, 0 ou 100%) vale 45% como premissa', () => {
  assert.deepEqual(C.reguaDoRetorno(null), { margem_pct: 45, premissa: true, ruim_abaixo: 2.22, bom_acima: 4.44 });
  assert.deepEqual(C.reguaDoRetorno(0), C.reguaDoRetorno(null));
  assert.deepEqual(C.reguaDoRetorno(100), C.reguaDoRetorno(null), '100% é o valor antigo de quando o campo ficava vazio');
  assert.deepEqual(C.reguaDoRetorno('abc'), C.reguaDoRetorno(null));
  assert.deepEqual(C.reguaDoRetorno('45.00'), { margem_pct: 45, premissa: false, ruim_abaixo: 2.22, bom_acima: 4.44 });
  assert.deepEqual(C.reguaDoRetorno(30), { margem_pct: 30, premissa: false, ruim_abaixo: 3.33, bom_acima: 6.67 });
  assert.equal(C.MARGEM_PREMISSA, 45);

  const n = retorno => ({ gasto: 300, contatos: 10, fecharam: 2, faturado: Math.round(retorno * 300), sem_valor: 0, custo_por_contato: 30, retorno });
  const cadastrada = C.reguaDoRetorno(45), premissa = C.reguaDoRetorno(null);
  const tom = (r, regua) => C.leituraDaCampanha(n(r), { tipo: 'real', regua }).tom;
  assert.deepEqual([2.21, 2.22, 3, 4.44, 4.45, 9].map(r => tom(r, cadastrada)), ['ruim', 'atencao', 'atencao', 'atencao', 'bom', 'bom']);
  assert.equal(tom(2, C.reguaDoRetorno(30)), 'ruim', 'com 30% de margem R$ 2 não paga (precisa de R$ 3,33)');
  assert.equal(tom(5, C.reguaDoRetorno(30)), 'atencao');

  const semPremissa = C.leituraDaCampanha(n(1.5), { tipo: 'real', regua: cadastrada });
  assert.equal(semPremissa.texto, 'Ainda não se paga: cada R$ 1 virou R$ 1,50 em serviço fechado. Para se pagar, precisa passar de R$ 2,22.');
  const comPremissa = C.leituraDaCampanha(n(5), { tipo: 'real', regua: premissa });
  assert.equal(comPremissa.texto, 'Se paga bem: cada R$ 1 virou R$ 5,00 em serviço fechado. Conta feita com margem de 45%, uma premissa: cadastre a margem da oficina em Ajustes.');
  assert.equal(C.leituraDaCampanha(n(5), { tipo: 'real' }).texto, comPremissa.texto, 'sem régua informada vale a premissa');
  for (const r of [1.5, 3, 5]) limpo(C.leituraDaCampanha(n(r), { tipo: 'real', regua: premissa }));
});

/** Meta: campanha 1202 com 10 dias de R$ 50, um conjunto e um anúncio com imagem; contatos ligados que fecharam R$ 1.920. */
function cenarioComGasto(config = {}) {
  const linhas = [];
  for (let d = 1; d <= 10; d++) {
    linhas.push(D.metrica(`m${d}`, { data: dia(d), campanha_ext: '1202' }));
    linhas.push(D.metrica(`cj${d}`, { nivel: 'conjunto', data: dia(d), campanha_ext: '1202', conjunto_ext: 'cj1', conjunto_nome: 'Taubaté 30 km' }));
    linhas.push(D.metrica(`an${d}`, { nivel: 'anuncio', data: dia(d), campanha_ext: '1202', conjunto_ext: 'cj1', anuncio_ext: '23851', anuncio_nome: 'Vídeo 2', miniatura_url: 'https://scontent.xx.fbcdn.net/v/t45/a.jpg?oe=1' }));
  }
  linhas.push(D.metrica('an-sem', { nivel: 'anuncio', data: dia(3), campanha_ext: '1202', conjunto_ext: 'cj1', anuncio_ext: '23852', anuncio_nome: 'Foto', miniatura_url: null, gasto: 0 }));
  const itens = [...D.contatosDeHoje(),
    D.item(20, { dia: dia(8), canal: 'meta', campanha: { ext: null, nome: 'TROCA DE ÓLEO r$ 169' }, etapas: ['contato', 'respondido', 'fechou'], desfecho: 'fechou', valor: 1500 })];
  const tabelas = D.tabelasDeHoje({ ads_metricas_dia: linhas, ads_config: [{ id: true, cpa_alvo: null, orcamento_mensal: null, ticket_medio: null, extras: {}, ...config }] });
  return D.fonteDeTeste({ itens, tabelas });
}

test('GET /api/campanhas: a margem cadastrada em ads_config manda na leitura, sem a frase de premissa', async () => {
  const { fonte } = cenarioComGasto({ margem_pct: '30.00' });
  const r = await D.calado(() => C.responderLista({ q: q(), fonte }));
  limpo(r);
  assert.deepEqual(r.regua_retorno, { margem_pct: 30, premissa: false, ruim_abaixo: 3.33, bom_acima: 6.67 });
  const c = r.campanhas.find(x => x.ext === '1202');
  assert.equal(c.retorno, 3.84);
  assert.equal(c.leitura.tom, 'atencao');
  assert.doesNotMatch(c.leitura.texto, /premissa/);
  assert.match(c.leitura.texto, /Fica bom acima de R\$ 6,67/);

  const { fonte: semMargem } = cenarioComGasto({ margem_pct: 100 });
  const s = await D.calado(() => C.responderLista({ q: q(), fonte: semMargem }));
  assert.equal(s.regua_retorno.premissa, true);
  assert.match(s.campanhas.find(x => x.ext === '1202').leitura.texto, /margem de 45%, uma premissa/);
});

/* ---------------- 7. miniatura pelo próprio app ---------------- */

test('detalhe da campanha: miniatura_url é o endereço do app (img-src self); anúncio sem imagem fica null', async () => {
  const { fonte } = cenarioComGasto({ margem_pct: 45 });
  const det = await D.calado(() => C.responderDetalhe({ plataforma: 'meta', chave: '1202', fonte }));
  limpo(det);
  const anuncios = det.conjuntos[0].anuncios;
  assert.deepEqual(anuncios.map(a => [a.ext, a.miniatura_url]), [['23851', 'api/coleta/miniatura/meta/23851'], ['23852', null]]);
  assert.equal(anuncios[0].miniatura_url, coletor.enderecoMiniatura('meta', '23851'), 'o mesmo endereço que a rota da coleta serve');
  assert.ok(!JSON.stringify(det).includes('fbcdn'), 'o endereço cru da Meta não vai para a tela');
  assert.deepEqual(det.regua_retorno, { margem_pct: 45, premissa: false, ruim_abaixo: 2.22, bom_acima: 4.44 });
  // a rota da miniatura só aceita identificador simples: fora disso não há imagem (em vez de um <img> quebrado)
  assert.equal(C.miniaturaDoApp('meta', '../x', 'https://scontent.xx.fbcdn.net/a.jpg'), null);
  assert.equal(C.miniaturaDoApp('anuncio', '123', 'https://scontent.xx.fbcdn.net/a.jpg'), null);
  assert.equal(C.miniaturaDoApp('google', '123', ''), null);
  assert.equal(C.miniaturaDoApp('google', '123', 'https://tpc.googlesyndication.com/x.png'), 'api/coleta/miniatura/google/123');
});

/* ---------------- 9. etapas de quem chegou hoje ---------------- */

test('GET /api/hoje: a lista hoje[] traz as etapas, o desfecho e as pendências da jornada (mini-setores)', async () => {
  const hojeCedo = D.item(30, { dia: '2026-11-19', hora: '07:10', canal: 'google', etapas: ['contato', 'respondido', 'agendou'], minutos: 12 });
  const { fonte } = D.fonteDeTeste({ itens: [...D.contatosDeHoje(), hojeCedo] });
  const r = await D.calado(() => Hoje.responder({ q: q(), fonte }));
  limpo(r);
  assert.deepEqual(r.hoje.map(h => h.lead_id), ['lead-06', 'lead-30']);
  const [espera, agendou] = r.hoje;
  assert.deepEqual(espera.etapas, [{ id: 'contato', em: '2026-11-19T08:20:00-03:00' }]);
  assert.deepEqual(espera.pendencias, ['sem_resposta']);
  assert.equal(espera.desfecho.tipo, 'aberto');
  assert.deepEqual(agendou.etapas.map(e => e.id), ['contato', 'respondido', 'agendou']);
  assert.equal(agendou.etapas[1].minutos, 12);
  assert.equal(agendou.etapa_atual, 'agendou');
  assert.ok(r.hoje.every(h => Array.isArray(h.etapas) && Array.isArray(h.pendencias) && 'desfecho' in h));
});

/* ---------------- 6. Google sem developer token ---------------- */

const CHAVE_PRIVADA = '-----BEGIN PRIVATE KEY-----\nMIIEfalso\n-----END PRIVATE KEY-----\n';
const contaDeServico = { canal: 'google', ativo: true, google_customer_id: '1234567890', google_client_id: 'leitor@projeto.iam.gserviceaccount.com', google_client_secret: CHAVE_PRIVADA };
const oauthSemDev = { canal: 'google', ativo: true, google_customer_id: '1234567890', google_client_id: 'c.apps.googleusercontent.com', google_client_secret: 'segredo-falso', google_refresh_token: 'refresh-falso' };
const soDeveloper = { canal: 'google', ativo: true, google_customer_id: '1234567890', google_developer_token: 'DEV-ANTIGO', google_refresh_token: 'refresh-falso' };

test('Google: "tem acesso" é conta de serviço ou OAuth completo com o cliente, sem developer token (db.js e motor/fonte.js)', () => {
  for (const linha of [contaDeServico, oauthSemDev]) {
    assert.equal(google.temAcesso(linha), true);
    const m = db.mascararIntegracao(linha);
    assert.equal(m.tem_google_token, true);
    assert.equal(db.classificarChave(linha), 'ok');
    assert.equal(db.classificarChave({ ...linha, ultimo_sync_status: 'erro: Google Ads 401' }), 'recusada');
    const s = F.semSegredo(linha);
    assert.equal(s.tem_token, true);
    assert.notEqual(Est.situacaoDaPlataforma('google', s).situacao, 'nunca_ligou', 'Google ligado só com conta de serviço não aparece como "não ligada"');
    const texto = JSON.stringify([m, s]);
    for (const segredo of ['PRIVATE KEY', 'segredo-falso', 'refresh-falso']) assert.equal(texto.includes(segredo), false, segredo);
  }
  // developer token sozinho (com refresh, sem client) não liga nada; e sem o número do cliente também não
  assert.equal(db.mascararIntegracao(soDeveloper).tem_google_token, false);
  assert.equal(db.classificarChave(soDeveloper), 'sem_token');
  assert.equal(F.semSegredo(soDeveloper).tem_token, false);
  assert.equal(F.semSegredo({ ...oauthSemDev, google_customer_id: '' }).tem_token, false);
  // a Meta continua como era
  assert.equal(F.semSegredo({ canal: 'meta', ativo: true, meta_access_token: 'EAAx' }).tem_token, true);
});

test('tela antiga e .env.exemplo: sem developer token; META_APP_SECRET documentado; conta de serviço completa o guia', () => {
  const passos = Guia.passosGoogle({ tem_google_cliente: true, tem_google_oauth: true, tem_google_refresh: false, tem_google_token: true, ultimo_sync_status: 'ok — 10 linhas' });
  assert.equal(passos.some(p => p.id === 'developer'), false);
  assert.equal(Guia.resumo(passos).pronto, true, 'conta de serviço não precisa de refresh token');
  assert.equal(Guia.resumo(Guia.passosGoogle({ tem_google_cliente: true, tem_google_oauth: true })).proximo.id, 'refresh', 'OAuth sem refresh ainda falta');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.equal(/name="google_developer_token"/.test(html), false, 'o campo do developer token saiu do formulário');
  const env = fs.readFileSync(path.join(__dirname, '..', '.env.exemplo'), 'utf8');
  assert.match(env, /^META_APP_SECRET=$/m);
  assert.equal(/^\s*[A-Z_]*DEVELOPER[A-Z_]*=/mi.test(env), false);
  assert.match(env, /X-Cron-Chave/);
});

/* ---------------- chave das rotinas no cabeçalho ---------------- */

test('rotinas: a chave vale no cabeçalho X-Cron-Chave ou em ?chave=; errada, vazia ou ausente dá 401', async () => {
  const { servidor, ctxRotas } = require('../server');
  ctxRotas.rotaPublica('GET', '/api/cron/_t7b', ({ q: consulta, req }) => { ctxRotas.exigirCron(consulta, req); return { ok: true }; });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const CHAVE = process.env.ADS_CRON_TOKEN;
  try {
    const pedir = async (caminho, cabecalhos = {}) => (await fetch(base + caminho, { headers: cabecalhos })).status;
    assert.equal(await pedir('/api/cron/_t7b', { 'X-Cron-Chave': CHAVE }), 200);
    assert.equal(await pedir(`/api/cron/_t7b?chave=${encodeURIComponent(CHAVE)}`), 200, 'o jeito antigo continua valendo');
    assert.equal(await pedir('/api/cron/_t7b', { 'X-Cron-Chave': CHAVE + 'x' }), 401);
    assert.equal(await pedir('/api/cron/_t7b', { 'X-Cron-Chave': '' }), 401);
    assert.equal(await pedir('/api/cron/_t7b'), 401);
    // as rotinas de verdade (novas e antiga) recusam sem gastar nada
    for (const rota of ['/api/cron/cliques', '/api/cron/plano', '/api/cron/medir', '/api/cron/sync']) {
      assert.equal(await pedir(rota, { 'X-Cron-Chave': 'errada' }), 401, rota);
    }
    // a rota chamada sem `req` (como nos testes antigos da coleta) segue lendo ?chave=
    assert.doesNotThrow(() => ctxRotas.exigirCron(q(`chave=${CHAVE}`)));
    assert.throws(() => ctxRotas.exigirCron(q('chave=outra')), e => e.status === 401);
  } finally {
    servidor.closeAllConnections?.();
    await new Promise(r => servidor.close(r));
  }
});
