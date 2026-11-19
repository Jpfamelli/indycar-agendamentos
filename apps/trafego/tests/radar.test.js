'use strict';
/* Radar: regra dispara quando deve, pisos filtram ruído, cooldown segura
   repetição e a validação recusa regra mal formada. Tudo sem banco. */
const test = require('node:test');
const assert = require('node:assert/strict');
const radar = require('../radar');

const linha = (o = {}) => ({
  plataforma: 'meta', entidade_ext: 'c1', entidade_nome: 'Campanha 1', campanha_nome: 'Campanha 1',
  data: '2026-10-01', gasto: 100, impressoes: 10000, cliques: 100, conversoes: 1, valor_conversao: 200, frequencia: 0,
  ...o,
});
const regra = (o = {}) => ({
  id: 'r1', nome: 'CPA alto', nivel: 'campanha', plataforma: null, metrica: 'cpa', operador: '>', valor: 80,
  janela_dias: 3, min_gasto: 50, min_conversoes: 0, min_impressoes: 0, severidade: 'alerta', cooldown_horas: 24, mensagem: null,
  ...o,
});

test('janela termina ONTEM e tem o tamanho pedido', () => {
  const agora = Date.UTC(2026, 9, 9, 15);   // 09/10/2026 15:00Z
  const j = radar.janela(3, agora);
  assert.equal(j.ate, '2026-10-08');
  assert.equal(j.de, '2026-10-06');
  assert.equal(radar.janela(1, agora).de, '2026-10-08');
});

test('dispara quando a métrica passa do limite e os pisos são atendidos', () => {
  const r = radar.avaliarRegra(regra(), [linha()]);   // CPA 100 > 80
  assert.equal(r.novos.length, 1);
  assert.equal(r.suprimidos.length, 0);
  const a = r.novos[0];
  assert.equal(a.valor_medido, 100);
  assert.equal(a.valor_limite, 80);
  assert.equal(a.chave, 'r1|meta|c1');
  assert.ok(a.mensagem.includes('CPA alto'));
  assert.ok(a.mensagem.includes('Campanha 1'));
});

test('não dispara abaixo do limite nem com operador invertido', () => {
  assert.equal(radar.avaliarRegra(regra(), [linha({ gasto: 50 })]).novos.length, 0);          // CPA 50
  assert.equal(radar.avaliarRegra(regra({ operador: '<' }), [linha()]).novos.length, 0);       // 100 < 80? não
  assert.equal(radar.avaliarRegra(regra({ operador: '>=', valor: 100 }), [linha()]).novos.length, 1);
});

test('piso de gasto filtra campanha pequena; piso de impressões e conversões também', () => {
  assert.equal(radar.avaliarRegra(regra({ min_gasto: 500 }), [linha()]).novos.length, 0);
  assert.equal(radar.avaliarRegra(regra({ min_impressoes: 20000 }), [linha()]).novos.length, 0);
  assert.equal(radar.avaliarRegra(regra({ min_conversoes: 2 }), [linha()]).novos.length, 0);
});

test('métrica sem base (CPA sem conversão) não dispara', () => {
  const r = radar.avaliarRegra(regra(), [linha({ conversoes: 0 })]);
  assert.equal(r.novos.length, 0);
});

test('soma a janela por entidade ANTES de comparar', () => {
  // Dois dias de R$ 60 com 1 conversão cada: CPA da janela = 60, não 120.
  const ls = [linha({ data: '2026-10-01', gasto: 60 }), linha({ data: '2026-10-02', gasto: 60 })];
  assert.equal(radar.avaliarRegra(regra({ valor: 80 }), ls).novos.length, 0);
  assert.equal(radar.avaliarRegra(regra({ valor: 50 }), ls).novos.length, 1);
});

test('entidades diferentes são avaliadas separadas', () => {
  const ls = [linha(), linha({ entidade_ext: 'c2', entidade_nome: 'Campanha 2', gasto: 30 })];
  const r = radar.avaliarRegra(regra(), ls);
  assert.equal(r.novos.length, 1);
  assert.equal(r.novos[0].entidade_ext, 'c1');
});

test('cooldown segura a repetição; passado o prazo, dispara de novo', () => {
  const agora = Date.now();
  const recente = new Map([['r1|meta|c1', new Date(agora - 2 * 3600000).toISOString()]]);
  const r = radar.avaliarRegra(regra(), [linha()], { disparos: recente, agora });
  assert.equal(r.novos.length, 0);
  assert.equal(r.suprimidos.length, 1);
  assert.equal(r.suprimidos[0].chave, 'r1|meta|c1');

  const antigo = new Map([['r1|meta|c1', new Date(agora - 25 * 3600000).toISOString()]]);
  const r2 = radar.avaliarRegra(regra(), [linha()], { disparos: antigo, agora });
  assert.equal(r2.novos.length, 1);
});

test('mesma rodada: o mapa de disparos é atualizado e segura a segunda avaliação', () => {
  const disparos = new Map();
  radar.avaliarRegra(regra(), [linha()], { disparos });
  assert.ok(disparos.has('r1|meta|c1'));
  const r = radar.avaliarRegra(regra(), [linha()], { disparos });
  assert.equal(r.novos.length, 0);
  assert.equal(r.suprimidos.length, 1);
});

test('criativo traz a campanha ao lado no texto do aviso', () => {
  const r = radar.avaliarRegra(
    regra({ nivel: 'anuncio', metrica: 'frequencia', operador: '>', valor: 3, min_gasto: 0 }),
    [linha({ entidade_ext: 'ad1', entidade_nome: 'Vídeo depoimento', campanha_nome: 'Remarketing', frequencia: 4.2 })],
  );
  assert.equal(r.novos.length, 1);
  assert.ok(r.novos[0].mensagem.includes('Vídeo depoimento (em Remarketing)'));
  assert.ok(r.novos[0].mensagem.includes('4,20'));
});

test('montarMensagem substitui todas as variáveis do modelo', () => {
  const txt = radar.montarMensagem(
    regra({ mensagem: '{regra} | {entidade} | {plataforma} | {metrica} | {valor} | {limite} | {janela}d | {campanha}' }),
    { nome: 'X', plataforma: 'google', valor: 120.5, campanha: null },
  );
  assert.ok(txt.startsWith('CPA alto | X | Google | CPA | R$'));
  assert.ok(txt.includes('120,50 | R$'));
  assert.ok(txt.includes('80,00 | 3d | —'));
  assert.equal(txt.includes('{'), false);
});
test('textoDoAlerta ordena críticos primeiro e conta no cabeçalho', () => {
  const txt = radar.textoDoAlerta([
    { severidade: 'info', mensagem: 'info 1' },
    { severidade: 'critico', mensagem: 'critico 1' },
    { severidade: 'alerta', mensagem: 'alerta 1' },
    { severidade: 'critico', mensagem: 'critico 2' },
  ]);
  assert.ok(txt.startsWith('⚠️ *IndyCar · Radar de tráfego* — 2 itens críticos'));
  assert.ok(txt.indexOf('critico 1') < txt.indexOf('alerta 1'));
  assert.ok(txt.indexOf('alerta 1') < txt.indexOf('info 1'));
  assert.ok(txt.includes('dias fechados'));
  assert.ok(radar.textoDoAlerta([{ severidade: 'info', mensagem: 'x' }]).startsWith('📡'));
});

test('validarRegra normaliza e aceita uma regra boa', () => {
  const v = radar.validarRegra({
    nome: '  ROAS baixo ', metrica: 'roas', operador: '<', valor: '2.5', nivel: 'campanha', plataforma: '',
    janela_dias: '7', cooldown_horas: '', min_gasto: '100', severidade: 'critico', mensagem: '  ', ativa: true,
  });
  assert.equal(v.ok, true);
  assert.deepEqual(v.regra, {
    nome: 'ROAS baixo', nivel: 'campanha', plataforma: null, metrica: 'roas', operador: '<', valor: 2.5,
    janela_dias: 7, cooldown_horas: 24, min_gasto: 100, min_impressoes: 0, min_conversoes: 0,
    severidade: 'critico', mensagem: null, ativa: true,
  });
});

test('validarRegra recusa nome vazio, métrica, operador e valor ruins', () => {
  const base = { nome: 'x', metrica: 'cpa', operador: '>', valor: 10 };
  assert.equal(radar.validarRegra({ ...base, nome: '   ' }).ok, false);
  assert.equal(radar.validarRegra({ ...base, metrica: 'lucro' }).ok, false);
  assert.equal(radar.validarRegra({ ...base, operador: '==' }).ok, false);
  assert.equal(radar.validarRegra({ ...base, valor: 'abc' }).ok, false);
  assert.equal(radar.validarRegra({ ...base, valor: '' }).ok, false);
  assert.equal(radar.validarRegra({ ...base, valor: -1 }).ok, false);
  assert.equal(radar.validarRegra({ ...base, nivel: 'pais' }).ok, false);
  assert.equal(radar.validarRegra({ ...base, plataforma: 'tiktok' }).ok, false);
  assert.equal(radar.validarRegra({ ...base, severidade: 'urgente' }).ok, false);
  assert.equal(radar.validarRegra(null).ok, false);
});

test('validarRegra limita janela (1-90), cooldown (1-720), mínimos ≥ 0 e id', () => {
  const base = { nome: 'x', metrica: 'cpa', operador: '>', valor: 10 };
  assert.equal(radar.validarRegra({ ...base, janela_dias: 0 }).ok, false);
  assert.equal(radar.validarRegra({ ...base, janela_dias: 91 }).ok, false);
  assert.equal(radar.validarRegra({ ...base, janela_dias: 2.5 }).ok, false);
  assert.equal(radar.validarRegra({ ...base, cooldown_horas: 721 }).ok, false);
  assert.equal(radar.validarRegra({ ...base, min_gasto: -5 }).ok, false);
  assert.equal(radar.validarRegra({ ...base, id: 'abc' }).ok, false);
  const ok = radar.validarRegra({ ...base, id: '3f6c2e4a-1b2c-4d5e-8f90-123456789abc', janela_dias: 90, cooldown_horas: 720 });
  assert.equal(ok.ok, true);
  assert.equal(ok.regra.id, '3f6c2e4a-1b2c-4d5e-8f90-123456789abc');
  assert.equal(radar.validarRegra({ ...base, mensagem: 'm'.repeat(400) }).regra.mensagem.length, 300);
});
