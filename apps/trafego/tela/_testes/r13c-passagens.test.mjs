/* Rodada 13C: regra única da Central (cada app na aba nomeada "indycar-<app>") e o Orçador em /orcador/ da Central. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { linkSeguro, abaDoLink, listaDeApps, nomeDaAba } from '../js/ecossistema.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const enderecos = require('../../enderecos.js');
const ler = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const base = '/trafego/';

test('Orçador mora na Central: o link antigo do Netlify vira /orcador/ e o de produção fica neste endereço', () => {
  assert.equal(linkSeguro('https://indycar-orcador.netlify.app/#/historico/o1', { base }), '/orcador/#/historico/o1');
  assert.equal(linkSeguro('https://indycar-orcador.netlify.app/?tel=5512999990001', { base }), '/orcador/?tel=5512999990001');
  assert.equal(linkSeguro('/orcador/#/historico/o1', { base }), '/orcador/#/historico/o1');
  assert.equal(linkSeguro('https://indycar-agendamentos.onrender.com/crm/?lead=2', { base }), '/crm/?lead=2', 'mesmo login, sem sair para a produção');
  assert.equal(listaDeApps({ base }).find((a) => a.id === 'orcador').url, '/orcador/');
  assert.equal(listaDeApps({ base }).find((a) => a.id === 'orcador').fora, false);
  // servidor: o link do orçamento sai em /orcador/ e o Netlify continua aceito no CORS (abas antigas)
  assert.equal(enderecos.caminhoNaCentral('orcador'), '/orcador/');
  assert.ok(enderecos.origens().includes('https://indycar-orcador.netlify.app'));
  assert.match(ler('../../jornada.js'), /caminhoNaCentral\('orcador'\)\}#\/historico\//);
});

test('cada app abre na aba nomeada dele; link do próprio Tráfego fica nesta janela', () => {
  assert.equal(abaDoLink('/crm/?lead=1', { base }), 'indycar-crm');
  assert.equal(abaDoLink('/atendimento/?tel=1', { base }), 'indycar-atendimento');
  assert.equal(abaDoLink('/agenda/?tel=1', { base }), 'indycar-agenda');
  assert.equal(abaDoLink('/orcador/#/historico/o1', { base }), 'indycar-orcador');
  assert.equal(abaDoLink('https://indycar-patio.netlify.app/?os=1', { base }), 'indycar-patio');
  assert.equal(abaDoLink('/trafego/#/campanhas', { base }), null);
  assert.equal(nomeDaAba('trafego'), 'indycar-trafego', 'o mesmo nome que a Casa, o CRM e o Comunicar usam');
  for (const f of ['../js/telas/clientes.js', '../js/telas/radar.js']) assert.match(ler(f), /target: abaDoLink\(/, f);
});
