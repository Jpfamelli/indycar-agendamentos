// Rodada 13C: passagens, endereços e sessão na Central — Tráfego na aba indycar-trafego, Orçador em /orcador/ (a ficha
// da Casa e os links que o servidor da Agenda monta), e 404 para arquivo oculto/pasta interna em vez da página do app.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

Object.assign(process.env, {
  SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_ANON_KEY: 'anon-de-teste', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste',
  ANTHROPIC_API_KEY: '', RUNNER_TOKEN: 'token-de-teste',
  CRM_AUTOMACOES: '0', CARTEIRO_DESLIGADO: '1', SINCRONIA: '0', AUTOMACOES: '0', IA_FUNIL: '0', IMPORT_DISABLED: '1',
});
delete process.env.RENDER;
delete process.env.ORCADOR_URL;

await import('../casa/logica.js');
await import('../casa/logica4.js');
const L = globalThis.CasaLogica;
const N = globalThis.CasaLogica4;
const ID = '00000000-0000-4000-8000-000000000021';
const ORIGEM = 'https://central.exemplo/';

test('Casa: o Tráfego abre na aba indycar-trafego (o mesmo nome do CRM, do Comunicar e do Tráfego); os outros, indycar-<app>', () => {
  assert.equal(L.nomeDaAba('ads'), 'indycar-trafego');
  for (const k of ['agenda', 'crm', 'atendimento', 'comunicar', 'orcador', 'patio']) assert.equal(L.nomeDaAba(k), 'indycar-' + k);
});

test('Casa: link do Orçador no Netlify (banco) vira /orcador/; a ficha não perde mais o "Novo orçamento" nem os orçamentos', () => {
  const b = L.bases({ orcador: 'https://indycar-orcador.netlify.app' }, false, true);
  assert.equal(L.orcadorNaCentral('https://indycar-orcador.netlify.app/#/historico/' + ID, b, ORIGEM), 'https://central.exemplo/orcador/#/historico/' + ID);
  assert.equal(L.orcadorNaCentral('https://indycar-patio.netlify.app/?os=1', b, ORIGEM), 'https://indycar-patio.netlify.app/?os=1');
  assert.equal(L.orcadorNaCentral('lixo', b, ORIGEM), 'lixo');
  const f = N.fichaDe({
    cliente: { nome: 'Ana', telefone_55: '5512991821234' },
    orcamentos: [{ numero: 12, status: 'enviado', total: 100, link_equipe: 'https://indycar-orcador.netlify.app/#/historico/' + ID }],
    links: { nova_cotacao: 'https://indycar-orcador.netlify.app/#/cotacao?tel=5512991821234', crm: 'https://central.exemplo/crm/?cliente=' + ID },
  }, b, ORIGEM);
  assert.equal(f.links.cotacao, 'https://central.exemplo/orcador/#/cotacao?tel=5512991821234', 'antes vinha vazio: o endereço do Netlify não era de nenhum app da Central');
  assert.equal(f.orcamentos[0].link, 'https://central.exemplo/orcador/#/historico/' + ID);
  assert.equal(L.appDoLink(f.links.cotacao, ORIGEM, b), 'orcador');
  // sem o Orçador na Central (bases do Netlify), o link do Netlify continua valendo como antes
  const bn = L.bases({ orcador: 'https://indycar-orcador.netlify.app' });
  assert.equal(N.fichaDe({ links: { nova_cotacao: 'https://indycar-orcador.netlify.app/#/cotacao?tel=1' } }, bn, ORIGEM).links.cotacao, 'https://indycar-orcador.netlify.app/#/cotacao?tel=1');
});

test('Agenda (servidor): na Central os links do orçamento saem em /orcador/; solta, segue o Netlify', async () => {
  const O = await import('../orcador.js');
  const antes = O.baseAtualDoOrcador() === '/orcador';   // a Central (before) já pode ter ligado
  O.usarOrcadorDaCentral(false);
  assert.equal(O.baseAtualDoOrcador(undefined), 'https://indycar-orcador.netlify.app');
  assert.equal(O.resumoDoOrcamento({ id: ID, status: 'enviado' }, O.baseAtualDoOrcador(undefined)).abrir, 'https://indycar-orcador.netlify.app/#/historico/' + ID);
  O.usarOrcadorDaCentral(true);
  assert.equal(O.baseAtualDoOrcador('https://outro.exemplo'), '/orcador');
  assert.equal(O.resumoDoOrcamento({ id: ID, status: 'enviado' }, O.baseAtualDoOrcador()).abrir, '/orcador/#/historico/' + ID);
  assert.equal(O.linkNovoOrcamento({ telefone: '12991821234', nome: 'Ana' }, '/orcador'), '/orcador/?tel=5512991821234&nome=Ana');
  assert.equal(O.baseDoOrcador('/outra-coisa'), 'https://indycar-orcador.netlify.app', 'só o caminho da Central é aceito como relativo');
  O.usarOrcadorDaCentral(antes);
});

test('Agenda: caminhoQueNaoEPagina separa arquivo oculto, nome com ponto e pasta interna das telas', async () => {
  const S = await import('../server.js');
  for (const p of ['/.env', '/.git/config', '/x/.htaccess', '/README.md', '/backup.zip', '/scripts/', '/tests', '/node_modules/a', '/apps/crm/server.js', '/%E0%A4%A']) assert.equal(S.caminhoQueNaoEPagina(p), true, p);
  for (const p of ['/', '/hoje', '/agenda/semana', '/qualquer-tela']) assert.equal(S.caminhoQueNaoEPagina(p), false, p);
});

test('Agenda (tela, na Central): link do Orçador no Netlify abre o mesmo orçamento em /orcador/, na aba indycar-orcador', async () => {
  const vm = await import('node:vm');
  const { readFileSync } = await import('node:fs');
  const abertas = [];
  const ctx = { location: new URL('https://central.exemplo/agenda/'), URL, open: (u, n) => { abertas.push([u, n]); return { focus() {} }; } };
  ctx.globalThis = ctx;
  vm.runInNewContext(readFileSync(new URL('../public/apps.js', import.meta.url), 'utf8'), ctx);
  const A = ctx.IndyCarApps;
  assert.equal(A.naCentral('https://indycar-orcador.netlify.app/#/historico/' + ID), 'https://central.exemplo/orcador/#/historico/' + ID);
  assert.equal(A.appDoLink('https://indycar-orcador.netlify.app/?tel=1'), 'orcador');
  assert.equal(A.appDoLink('/orcador/#/historico/' + ID), 'orcador', 'o link que o servidor monta na Central');
  A.abrir('https://indycar-orcador.netlify.app/#/historico/' + ID);
  A.abrir('/crm/?tel=1');
  assert.deepEqual(abertas, [['https://central.exemplo/orcador/#/historico/' + ID, 'indycar-orcador'], ['/crm/?tel=1', 'indycar-crm']]);
  assert.equal(A.naCentral('https://indycar-patio.netlify.app/?os=1'), 'https://indycar-patio.netlify.app/?os=1');
});

let srv, base;
before(async () => {
  const c = await import('../central.js');
  await c.iniciarCentral({ ouvir: false });
  srv = http.createServer(c.handler);
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => new Promise((ok) => { srv.close(ok); setTimeout(() => process.exit(0), 50).unref(); }));
const pega = (p) => fetch(base + p, { redirect: 'manual' });

test('Central: /.env, /.git/config, /scripts/ e afins (raiz, /agenda/, /comunicar/) dão 404; as páginas continuam', async () => {
  for (const p of ['/.env', '/.git/config', '/scripts/', '/tests/', '/README.md', '/agenda/.env', '/agenda/.git/config', '/agenda/scripts/', '/agenda/README.md',
    '/comunicar/.env', '/comunicar/.git/config', '/comunicar/scripts/', '/comunicar/README.md']) {
    const r = await pega(p);
    assert.equal(r.status, 404, p);
    assert.doesNotMatch(await r.text(), /<html/i, p + ' não devolve a página');
  }
  for (const p of ['/', '/agenda/', '/comunicar/', '/agenda/confirmar/', '/crm/', '/atendimento/?embutido=1']) assert.equal((await pega(p)).status, 200, p);
  assert.equal((await pega('/atendimento/')).status, 302, 'rodada 20: a página do Atendimento aberta direto vai para o app CRM e Atendimento');
  assert.equal((await pega('/agenda/qualquer-tela')).status, 200, 'tela sem ponto continua com a página da Agenda');
  assert.equal((await pega('/?agendamento=x')).status, 308, 'link antigo da Agenda na raiz continua indo para /agenda/');
});

test('Central: com o build do Orçador aqui, a Agenda monta os links em /orcador/ (não no Netlify)', async () => {
  const c = await import('../central.js');
  const O = await import('../orcador.js');
  assert.equal(O.baseAtualDoOrcador(undefined), c.orcadorLocal() ? '/orcador' : 'https://indycar-orcador.netlify.app');
});
