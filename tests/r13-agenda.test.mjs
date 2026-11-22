// Rodada 13 da Agenda: o Hoje no molde do Tráfego (frase grande, números, barra e gráfico por hora),
// cartões sem faixa de lado, abas inteiras no celular e Clientes em cartões. Regras puras de public/hoje.js
// e o que a tela promete no código. Nada toca banco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../public/hoje.js';

const H = globalThis.HojeResumo;
const ler = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const app = ler('public/app.js');
const css = ler('public/rodada13.css');
const html = ler('public/index.html');
const a = (o) => ({ hora: '09:00', status: 'aguardando', compareceu: null, ...o });

test('resumo: separa chegaram, ainda vêm e não vieram com a mesma regra do grupoDoDia', () => {
  const r = H.resumo([
    a({ status: 'confirmado', hora: '08:00' }),               // ainda vem, atrasado às 10:00
    a({ status: 'aguardando', hora: '11:00' }),               // ainda vem
    a({ status: 'compareceu', compareceu: 1 }),               // chegou
    a({ status: 'concluido' }),                               // chegou (já teve desfecho)
    a({ status: 'nao_veio', compareceu: 0 }),                 // faltou
    a({ status: 'cancelado' }),                               // não conta
    a({ status: 'confirmado', compareceu: 1 }),               // bit compareceu: chegou
  ], '10:00');
  assert.deepEqual(
    { total: r.total, chegaram: r.chegaram, vem: r.vem, faltaram: r.faltaram, atrasados: r.atrasados, confirmados: r.confirmados },
    { total: 6, chegaram: 3, vem: 2, faltaram: 1, atrasados: 1, confirmados: 1 });
  assert.equal(r.pctChegaram, 50);
  assert.equal(r.pctFaltaram, 17);
});

test('frase: plural, singular, só o que existe e dia vazio', () => {
  const t = (lista, o) => H.fraseTexto(H.resumo(lista, '07:00'), o);
  assert.equal(t([a({}), a({}), a({ status: 'compareceu', compareceu: 1 }), a({ status: 'nao_veio' })]),
    'Hoje são 4 horários: 1 já chegou, 2 ainda vêm e 1 não veio.');
  assert.equal(t([a({})]), 'Hoje é 1 horário: 1 ainda vem.');
  assert.equal(t([a({ status: 'compareceu', compareceu: 1 }), a({ status: 'concluido' })]), 'Hoje são 2 horários: 2 já chegaram.');
  assert.equal(t([]), 'Nenhum horário marcado para hoje ainda.');
  assert.equal(t([], { fechado: true }), 'Hoje a oficina não abre. Nenhum horário marcado.');
  // os números vão como pedaços próprios (a tela pinta em vermelho grande)
  const p = H.frase(H.resumo([a({}), a({})], '07:00'));
  assert.deepEqual(p.filter((x) => x.n != null).map((x) => x.n), [2, 2]);
});

test('porHora: 8 h às 17 h, estica para horário fora e empilha por situação', () => {
  const g = H.porHora([a({ hora: '08:10' }), a({ hora: '08:50', status: 'compareceu', compareceu: 1 }), a({ hora: '18:30', status: 'nao_veio' }), a({ hora: '09:00', status: 'cancelado' }), a({ hora: '' })]);
  assert.equal(g.de, 8);
  assert.equal(g.ate, 18);
  assert.equal(g.barras.length, 11);
  assert.deepEqual(g.barras[0], { h: 8, chegou: 1, vem: 1, faltou: 0, total: 2 });
  assert.equal(g.barras[1].total, 0);                       // o cancelado das 9 h não entra
  assert.equal(g.barras[10].faltou, 1);
  assert.equal(g.maximo, 2);
  assert.equal(H.porHora([]).barras.length, 10);
});

test('Hoje: herói no lugar dos três cartões, com frase, números, barra, gráfico e próximo cliente', () => {
  assert.ok(app.includes('function heroiDoHoje('));
  assert.ok(app.includes('${heroiDoHoje(d, prox, relProx, agora, opts)}'));
  assert.ok(!app.includes('<div class="stat-grid row2 tres">'));
  for (const c of ['r13-frase', 'r13-numeros', 'r13-barra', 'r13-grafico', 'r13-prox', 'hero-chips', 'chipsGestor']) assert.ok(app.includes(c), c);
  // os números pulsam pela chave, não pela posição
  assert.ok(app.includes("$$('.num[data-chave]', view)"));
  assert.ok(html.indexOf('./hoje.js') > 0 && html.indexOf('./hoje.js') < html.indexOf('./app.js'));
  assert.ok(html.includes('./rodada13.css'));
  const sw = ler('public/sw.js');
  assert.ok(sw.includes("'hoje.js'") && sw.includes("'rodada13.css'"));
});

test('acabamento: [hidden] vence display, sem faixa colorida de lado, Barlow nos números', () => {
  assert.match(css, /\[hidden\]\{display:none!important\}/);
  assert.match(css, /\.appt::before,\.cols-dia \.appt::before\{display:none\}/);
  assert.doesNotMatch(css, /border-left:\s*[2-9]px/);
  assert.match(css, /\.r13-num\{font:700[^}]*var\(--ic-titulo\)/);
  assert.match(css, /\.r13-heroi::after/);
  // lembretes sem emoji no título nem no botão
  const r6b = ler('public/rodada6b.js');
  assert.ok(!r6b.includes('📨'));
});

test('celular: abas inteiras, pendências empilhadas, Clientes em cartões com toque de 44 px', () => {
  const cel = css.slice(css.indexOf('@media (max-width:600px){\n  .ic-abas'));
  assert.match(cel, /\.ic-abas \.nav-item\{flex:1 1 0/);
  assert.match(css, /\.r13-heroi \.hero-chips\{flex-direction:column/);
  assert.ok(app.includes('<table class="table cli-tabela">'));
  assert.match(css, /\.cli-tabela \.icon-btn\{width:44px;height:44px\}/);
  assert.match(css, /\.r7-esp-resumo\{display:flex/);
});
