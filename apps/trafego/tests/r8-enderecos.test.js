'use strict';
/* Rodada 8 (frente T2a) — endereços do ecossistema num módulo do SERVIDOR.
   O servidor não pode depender de arquivo da pasta de tela (public/ ou tela/) para saber
   quem pode chamar a API: a pasta de tela muda de dono e vai ser enxugada. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const End = require('../enderecos');
const seg = require('../seguranca');

test('enderecos: a lista de origens traz a Central, o Pátio e o Orçador, só https://host e sem repetição', () => {
  const o = End.origens();
  assert.ok(o.includes('https://indycar-agendamentos.onrender.com'), 'Central');
  assert.ok(o.includes('https://indycar-patio.netlify.app'), 'Pátio');
  assert.ok(o.includes('https://indycar-orcador.netlify.app'), 'Orçador');
  assert.ok(o.every(x => /^https:\/\/[^/]+$/.test(x)), 'nenhuma origem com caminho');
  assert.equal(new Set(o).size, o.length);
});

test('enderecos: nada que a tela antiga liberava ficou de fora (enquanto public/ existir)', t => {
  const antigo = path.join(__dirname, '..', 'public', 'ecossistema.js');
  if (!fs.existsSync(antigo)) return t.skip('public/ já foi enxugada');
  const novas = new Set(End.origens());
  for (const o of require(antigo).origens()) assert.ok(novas.has(o), `faltou ${o}`);
});

test('seguranca.js não lê arquivo de pasta de tela e usa a lista do servidor', () => {
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'seguranca.js'), 'utf8');
  assert.doesNotMatch(fonte, /require\(\s*['"]\.\/(public|tela)\//, 'seguranca.js não pode importar de public/ nem de tela/');
  assert.deepEqual([...seg.ORIGENS].sort(), [...End.origens()].sort());
});

test('CORS: a Central, o Pátio e o Orçador chamam a API; site de fora e domínio parecido não', () => {
  const host = 'indycar-agendamentos.onrender.com';
  assert.equal(seg.origemPermitida('https://indycar-agendamentos.onrender.com', 'outro-host'), true);
  assert.equal(seg.origemPermitida('https://indycar-patio.netlify.app', host), true);
  assert.equal(seg.origemPermitida('https://indycar-orcador.netlify.app', host), true);
  assert.equal(seg.origemPermitida('https://indycar-agendamentos.onrender.com.golpe.com', host), false);
  assert.equal(seg.origemPermitida('https://qualquer-site.com.br', host), false);
});

test('enderecos: caminho de outro app dentro da Central é relativo à raiz dela e nunca leva para fora', () => {
  assert.equal(End.caminhoNaCentral('atendimento'), '/atendimento/');
  assert.equal(End.caminhoNaCentral('atendimento', { aba: 'integracoes' }), '/atendimento/?aba=integracoes');
  assert.equal(End.caminhoNaCentral('crm', { lead: 'a b', vazio: '' }), '/crm/?lead=a%20b');
  assert.equal(End.caminhoNaCentral('patio'), null, 'o Pátio mora em outro domínio');
  assert.equal(End.caminhoNaCentral('inventado'), null);
});

test('enderecos: o endereço do Tráfego para link em WhatsApp aponta para /trafego/ na Central (ou para TRAFEGO_URL)', () => {
  const antes = process.env.TRAFEGO_URL;
  try {
    delete process.env.TRAFEGO_URL;
    assert.equal(End.urlDoTrafego(), 'https://indycar-agendamentos.onrender.com/trafego/');
    assert.equal(End.urlDoTrafego('jornada?pendencia=sem_valor'), 'https://indycar-agendamentos.onrender.com/trafego/jornada?pendencia=sem_valor');
    process.env.TRAFEGO_URL = 'http://localhost:3410/';
    assert.equal(End.urlDoTrafego('hoje'), 'http://localhost:3410/hoje');
    process.env.TRAFEGO_URL = 'javascript:alert(1)';
    assert.equal(End.urlDoTrafego(), 'https://indycar-agendamentos.onrender.com/trafego/', 'endereço estranho no ambiente é ignorado');
  } finally {
    if (antes === undefined) delete process.env.TRAFEGO_URL; else process.env.TRAFEGO_URL = antes;
  }
});
