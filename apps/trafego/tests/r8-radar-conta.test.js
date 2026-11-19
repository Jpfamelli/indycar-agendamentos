'use strict';
/* Rodada 8 (frente T2a) — regras da conta inteira trazidas do núcleo do Nexus Ads para o radar.js (r5: o investimento
   parou de repente; r6: conversas da Meta que não chegam à oficina). Puro, sem banco. */
const test = require('node:test');
const assert = require('node:assert/strict');

const Radar = require('../radar');
const Ad = require('../motor/adaptador');
const T = require('../motor/texto');

const dia = n => new Date(Date.parse('2026-11-18T12:00:00Z') - n * 86400000).toISOString().slice(0, 10);   // dia(0) = ontem (quarta)
const linha = (n, gasto, o = {}) => ({ data: dia(n), plataforma: 'meta', nivel: 'campanha', campanha_ext: 'c1', gasto, conversoes: 0, fonte: 'api', ...o });

test('o núcleo segue com as regras de conta desligadas (um radar só)', () => {
  assert.ok(Ad.REGRAS_DO_NUCLEO.includes('r5') && Ad.REGRAS_DO_NUCLEO.includes('r6'));
});

test('gasto_parou: média de R$ 100 por dia e ontem R$ 10 dispara um aviso crítico; 24 h sem repetir', () => {
  const linhas = [1, 2, 3, 4, 5, 6, 7].map(n => linha(n, 100)).concat(linha(0, 10));
  const disparos = new Map();
  const r = Radar.alertasDaConta(linhas, { ontem: dia(0), disparos, agora: Date.parse('2026-11-19T12:00:00Z') });
  assert.equal(r.novos.length, 1);
  const a = r.novos[0];
  assert.deepEqual([a.regra_nome, a.severidade, a.nivel, a.metrica, a.chave, a.valor_medido], ['O investimento parou de repente', 'critico', 'conta', 'conta_gasto', 'conta|gasto_parou', 10]);
  assert.equal(a.mensagem, 'O investimento caiu de R$ 100 por dia (média dos 7 dias anteriores) para R$ 10,00 em 18/11: cartão recusado, anúncio reprovado ou saldo zerado?');
  assert.deepEqual(T.textosRuins({ texto: a.mensagem, titulo: a.regra_nome }), []);
  const de_novo = Radar.alertasDaConta(linhas, { ontem: dia(0), disparos, agora: Date.parse('2026-11-19T13:00:00Z') });
  assert.deepEqual([de_novo.novos.length, de_novo.suprimidos.length], [0, 1]);
});

test('gasto_parou não dispara: gasto pequeno, poucos dias com gasto, domingo ou só demonstração', () => {
  const agora = Date.parse('2026-11-19T12:00:00Z');
  assert.equal(Radar.alertasDaConta([1, 2, 3, 4, 5, 6, 7].map(n => linha(n, 15)).concat(linha(0, 0)), { ontem: dia(0), agora }).novos.length, 0, 'média abaixo de R$ 20');
  assert.equal(Radar.alertasDaConta([1, 2, 3, 4].map(n => linha(n, 200)).concat(linha(0, 0)), { ontem: dia(0), agora }).novos.length, 0, 'só 4 de 7 dias com gasto');
  const domingo = '2026-11-15';
  const doDomingo = [1, 2, 3, 4, 5, 6, 7].map(n => ({ ...linha(0, 100), data: new Date(Date.parse(`${domingo}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10) }));
  assert.equal(Radar.alertasDaConta(doDomingo, { ontem: domingo, agora }).novos.length, 0, 'domingo a oficina não abre');
  const demo = [1, 2, 3, 4, 5, 6, 7].map(n => linha(n, 100, { fonte: 'demo' })).concat(linha(0, 0, { fonte: 'demo' }));
  assert.equal(Radar.alertasDaConta(demo, { ontem: dia(0), agora }).novos.length, 0, 'demonstração não vira alerta');
});

test('gasto_parou por plataforma: o Google zerado com a Meta firme avisa só do Google', () => {
  const linhas = [];
  for (let n = 0; n <= 7; n++) { linhas.push(linha(n, 300)); linhas.push(linha(n, n === 0 ? 0 : 60, { plataforma: 'google' })); }
  const r = Radar.alertasDaConta(linhas, { ontem: dia(0), agora: Date.parse('2026-11-19T12:00:00Z') });
  assert.deepEqual(r.novos.map(a => [a.chave, a.plataforma]), [['conta|gasto_parou|google', 'google']]);
  assert.match(r.novos[0].mensagem, /^O investimento no Google caiu de R\$ 60,00 por dia para R\$ 0,00 em 18\/11/);
});

test('contatos_sumiram: a Meta conta conversas que pararam de chegar à oficina (só avisa queda)', () => {
  const linhas = [], contatos = new Map();
  for (let n = 0; n <= 16; n++) {
    linhas.push(linha(n, 50, { conversoes: 3, conversas: 3 }));
    contatos.set(dia(n), n <= 2 ? 0 : 2);
  }
  const r = Radar.alertasDaConta(linhas, { contatosMeta: contatos, ontem: dia(0), agora: Date.parse('2026-11-19T12:00:00Z') });
  const a = r.novos.find(x => x.metrica === 'conta_contatos');
  assert.ok(a, 'disparou');
  assert.equal(a.mensagem, 'Nos últimos 3 dias a Meta contou 9 conversas, mas só 0 chegaram à oficina (antes chegavam 67%). Confira se o WhatsApp do anúncio é o da oficina e se o aparelho está ligado.');
  assert.deepEqual(T.textosRuins({ texto: a.mensagem }), []);
  // quem nunca recebia (antes também abaixo de 40%) não recebe aviso todo dia
  const nunca = new Map([...contatos].map(([d]) => [d, 0]));
  assert.equal(Radar.alertasDaConta(linhas, { contatosMeta: nunca, ontem: dia(0) }).novos.filter(x => x.metrica === 'conta_contatos').length, 0);
});

test('rodar: as regras da conta entram na rodada e a falha na leitura dos contatos não derruba o radar', async () => {
  const db = require('../db');
  const orig = { lerConfig: db.lerConfig, listarRegras: db.listarRegras, ultimosDisparos: db.ultimosDisparos, lerMetricas: db.lerMetricas, leitor: Radar.rodar.leitorContatosMeta };
  try {
    db.lerConfig = async () => ({ alertas_ativos: false, whatsapp_destinos: [] });
    db.listarRegras = async () => [];
    db.ultimosDisparos = async () => new Map();
    const ontem = Radar.janela(1).ate;   // o mesmo "ontem" que a rodada usa
    db.lerMetricas = async () => [1, 2, 3, 4, 5, 6, 7].map(n => ({ data: new Date(Date.parse(`${ontem}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10), plataforma: 'meta', gasto: 100, fonte: 'api' }));
    Radar.rodar.leitorContatosMeta = async () => { throw new Error('jornada fora'); };
    const r = await Radar.rodar({ enviar: false, gravar: false, crm: false, ciclo: false, conta: true });
    assert.equal(r.erro_conta, 'jornada fora');
    Radar.rodar.leitorContatosMeta = async () => new Map();
    const ok = await Radar.rodar({ enviar: false, gravar: false, crm: false, ciclo: false, conta: true });
    assert.equal(ok.erro_conta, null);
    const domingo = new Date(`${ontem}T12:00:00Z`).getUTCDay() === 0;
    assert.equal(ok.alertas.filter(a => a.metrica === 'conta_gasto').length, domingo ? 0 : 1);
    const sem = await Radar.rodar({ enviar: false, gravar: false, crm: false, ciclo: false });
    assert.equal(sem.alertas.length, 0, 'crm: false (os testes antigos) também deixa a conta de fora');
  } finally {
    Object.assign(db, { lerConfig: orig.lerConfig, listarRegras: orig.listarRegras, ultimosDisparos: orig.ultimosDisparos, lerMetricas: orig.lerMetricas });
    Radar.rodar.leitorContatosMeta = orig.leitor;
  }
});
