/* Lógica pura da tela que continua na rodada 11: rede, links do ecossistema e recusa da casca.
   As rotas das três abas estão em r11-tela.test.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Rede from '../js/rede.js';
import { linkSeguro, baseDaPagina, raizDaCentral, enderecoDeEntrada, listaDeApps, CENTRAL_PUBLICA } from '../js/ecossistema.js';

/* ------------------------------ rede ------------------------------ */

test('rede: servidor acordando repete leitura; gravação nunca repete sozinha', async () => {
  assert.equal(Rede.passageiro(503), true);
  assert.equal(Rede.passageiro(500), false);
  assert.equal(Rede.podeRepetir('get'), true);
  assert.equal(Rede.podeRepetir('POST'), false);
  assert.equal(Rede.textoDaEspera(2000), 'em 2 s');
  assert.equal(Rede.textoDaEspera(90000), 'em 1 min 30 s');
  assert.match(Rede.mensagem(503, true), /acordando/);
  assert.equal(Rede.mensagem(500, true), null);
  let tentativas = 0;
  const esperas = [];
  const r = await Rede.comNovasTentativas(async () => { tentativas++; if (tentativas < 3) throw Object.assign(new Error('x'), { status: 503 }); return 'ok'; },
    { dormir: async () => {}, aoEsperar: (ms) => esperas.push(ms) });
  assert.equal(r, 'ok');
  assert.deepEqual(esperas, [2000, 5000]);
  await assert.rejects(Rede.comNovasTentativas(async () => { throw Object.assign(new Error('banco sem atualização'), { status: 503, respondeu: true }); }, { dormir: async () => {} }), /banco/);
});

/* ------------------------------ ecossistema ------------------------------ */

test('links: só para dentro do ecossistema, sempre relativos à Central', () => {
  const base = '/trafego/';
  assert.equal(baseDaPagina('/trafego/'), '/trafego/');
  assert.equal(baseDaPagina('/trafego/index.html'), '/trafego/');
  assert.equal(raizDaCentral(base), '/');
  assert.equal(raizDaCentral('/'), null);
  assert.equal(linkSeguro('/crm/?lead=1', { base }), '/crm/?lead=1');
  assert.equal(linkSeguro('agenda/', { base }), '/agenda/');
  assert.equal(linkSeguro('https://indycar-patio.netlify.app/os/12', { base }), 'https://indycar-patio.netlify.app/os/12');
  for (const ruim of ['javascript:alert(1)', '//mal.example/x', 'https://mal.example/', 'http://indycar-patio.netlify.app/', '/crm/ x', '/a\\b']) assert.equal(linkSeguro(ruim, { base }), null, ruim);
  assert.equal(linkSeguro('/crm/', { base: '/' }), CENTRAL_PUBLICA + 'crm/');
  assert.equal(enderecoDeEntrada({ base, hash: '#/campanhas' }), '/?voltar=' + encodeURIComponent('/trafego/#/campanhas'));
  assert.equal(listaDeApps({ base }).find((a) => a.aqui).id, 'trafego');
});

test('recusaDaCasca: só 401 e 403 que falam da pessoa param o app inteiro (rodada 9)', () => {
  assert.equal(Rede.recusaDaCasca(401, null), true);
  for (const codigo of ['sem_acesso', 'desativado', 'sem_perfil', 'mfa', 'trocar_senha']) assert.equal(Rede.recusaDaCasca(403, codigo), true, codigo);
  // "Só o administrador cria chaves": recusa de uma ação, a gaveta mostra a frase e o app segue.
  assert.equal(Rede.recusaDaCasca(403, 'so_admin'), false);
  assert.equal(Rede.recusaDaCasca(403, null), false);
  assert.equal(Rede.recusaDaCasca(500, 'sem_acesso'), false);
});
