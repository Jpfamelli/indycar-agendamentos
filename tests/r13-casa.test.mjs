// Casa, rodada 13: o herói da Central (o dia da oficina numa frase, números grandes que levam ao app, relógio) e o bloco
// "Mês da oficina" só para o dono. Sem rede: regras puras de casa/logica5.js e leitura dos arquivos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../casa/logica.js');
await import('../casa/logica2.js');
await import('../casa/logica5.js');
const L = globalThis.CasaLogica, L5 = globalThis.CasaLogica5;
const CASA = join(dirname(fileURLToPath(import.meta.url)), '..', 'casa');
const ler = (f) => readFileSync(join(CASA, f), 'utf8');
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1').replace(/<!--[\s\S]*?-->/g, '');

const dados = { conversas: { esperando: 3 }, agenda: { total: 4 }, patio: { total: 4 }, orcamentos: { esperando: 2 }, leads: { novos_sem_dono: 2 } };
const perfil = (papel, apps) => ({ papel, apps, ativo: true });
const dono = L.visao(perfil('admin', ['agenda', 'atendimento', 'crm', 'patio', 'orcador']));

test('herói: a frase do dia com conversas, horários, pátio e orçamentos, nessa ordem, e o último número sublinhado', () => {
  const itens = L5.numerosDoDia(dados, dono);
  assert.deepEqual(itens.map((i) => [i.app, i.n]), [['atendimento', 3], ['agenda', 4], ['patio', 4], ['orcador', 2]]);
  const partes = L5.fraseDoDia(itens);
  assert.equal(L5.fraseEmTexto(partes), 'Hoje tem 3 conversas esperando, 4 horários na Agenda, 4 carros no pátio e 2 orçamentos esperando resposta.');
  assert.equal(partes.filter((p) => p.n != null).length, 4, 'quatro números em vermelho');
});

test('herói: singular, zero por extenso e tudo zero vira uma frase calma', () => {
  const um = L5.numerosDoDia({ conversas: { esperando: 1 }, agenda: { total: 0 }, patio: { total: 1 }, orcamentos: { esperando: 0 } }, dono);
  assert.equal(L5.fraseEmTexto(L5.fraseDoDia(um)), 'Hoje tem 1 conversa esperando, nenhum horário na Agenda, 1 carro no pátio e nenhum orçamento esperando resposta.');
  const zero = L5.numerosDoDia({ conversas: { esperando: 0 }, agenda: { total: 0 }, patio: { total: 0 }, orcamentos: { esperando: 0 } }, dono);
  assert.equal(L5.fraseEmTexto(L5.fraseDoDia(zero)), 'Dia calmo até agora: nada esperando por você.');
  assert.equal(L5.fraseDoDia([]), null, 'sem nada para ver: só a saudação');
  assert.deepEqual(L5.numerosDoDia(null, dono), []);
});

test('herói: cada um vê só o que pode (mecânico: só os carros dele; atendente sem Orçador não vê orçamento)', () => {
  const mec = L.visao(perfil('mecanico', ['patio']));
  const m = L5.numerosDoDia({ patio: { total: 2 } }, mec);
  assert.deepEqual(m.map((i) => i.app), ['patio']);
  assert.equal(L5.fraseEmTexto(L5.fraseDoDia(m, { mecanico: true })), 'Você tem 2 carros seus no pátio.');
  assert.equal(L5.fraseEmTexto(L5.fraseDoDia(L5.numerosDoDia({ patio: { total: 0 } }, mec), { mecanico: true })), 'Nenhum carro seu no pátio agora. Dia calmo por aqui.');
  const at = L.visao(perfil('atendente', ['atendimento', 'agenda']));
  assert.deepEqual(L5.numerosDoDia(dados, at).map((i) => i.app), ['atendimento', 'agenda']);
});

test('mês da oficina: faturamento, meta, projeção pelo ritmo, falta por dia e o selo Boa / Atenção / Ruim', () => {
  const r = L5.resumoDoMes({ mes: 31450, sem_valor_semana: 3 }, 60000, '2026-11-22');
  assert.equal(r.mesNome, 'novembro');
  assert.equal(r.valor, 31450);
  assert.equal(r.pct, 52);
  assert.equal(r.barra, 52);
  assert.equal(r.falta, 28550);
  assert.equal(r.passados, 18); assert.equal(r.total, 25); assert.equal(r.faltamDias, 7);
  assert.equal(r.projecao, Math.round((31450 / 18) * 25));
  assert.equal(r.porDia, Math.ceil(28550 / 7));
  assert.deepEqual(r.selo, { tom: 'ruim', texto: 'Ruim' });
  assert.equal(r.semValor, 3);
  assert.deepEqual(L5.resumoDoMes({ mes: 45000 }, 60000, '2026-11-22').selo, { tom: 'bom', texto: 'Boa' });
  assert.deepEqual(L5.resumoDoMes({ mes: 38000 }, 60000, '2026-11-22').selo, { tom: 'atencao', texto: 'Atenção' });
  const batida = L5.resumoDoMes({ mes: 70000 }, 60000, '2026-11-22');
  assert.equal(batida.batida, true); assert.equal(batida.barra, 100); assert.equal(batida.porDia, null);
  assert.deepEqual(batida.selo, { tom: 'bom', texto: 'Meta batida' });
});

test('mês da oficina: sem meta não tem selo nem barra; sem faturamento não tem projeção', () => {
  const s = L5.resumoDoMes({ mes: 10000 }, 0, '2026-11-22');
  assert.equal(s.meta, 0); assert.equal(s.pct, null); assert.equal(s.selo, null);
  const z = L5.resumoDoMes({}, 60000, '2026-11-02');
  assert.equal(z.valor, 0); assert.equal(z.projecao, null); assert.equal(z.selo, null);
  assert.equal(L5.mesChave('2026-11-22'), '2026-11');
});

test('relógio da oficina: aberta, fechando, antes de abrir e fechada (domingo e sábado à noite)', () => {
  const sp = (iso) => new Date(iso + '-03:00');
  assert.equal(L5.horaAgora(sp('2026-11-23T10:03:00')), '10:03');
  assert.deepEqual(L5.linhaDaOficina(sp('2026-11-23T10:00:00')), { tom: 'bom', texto: 'Oficina aberta até 17h30' });
  assert.equal(L5.linhaDaOficina(sp('2026-11-23T17:00:00')).tom, 'atencao');
  assert.equal(L5.linhaDaOficina(sp('2026-11-23T07:00:00')).texto, 'Abre às 8h');
  assert.equal(L5.linhaDaOficina(sp('2026-11-22T10:00:00')).texto, 'Fechada · abre segunda às 8h');
  assert.equal(L5.linhaDaOficina(sp('2026-11-28T18:00:00')).texto, 'Fechada · abre segunda às 8h');
  assert.equal(L5.linhaDaOficina(sp('2026-11-24T18:00:00')).texto, 'Fechada · abre amanhã às 8h');
});

test('tela: herói com saudação, frase, números e relógio; "Mês da oficina" num bloco só; arquivos novos no cache', () => {
  const html = ler('index.html');
  for (const id of ['heroi', 'heroiFrase', 'heroiNums', 'heroiHora', 'heroiOficina', 'mesOficina', 'mesCorpo', 'atencaoVazio', 'hoje', 'ola', 'nomeCurto']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /<section id="mesOficina"[^>]*hidden>/, 'o mês nasce escondido (só o dono abre)');
  assert.ok(html.indexOf('/casa/r13.css') > html.indexOf('/casa/r11.css'), 'r13.css por último');
  assert.ok(html.indexOf('/casa/logica5.js') < html.indexOf('/casa/painel.js') && html.indexOf('/casa/mes.js') < html.indexOf('/casa/casa.js'));
  const sw = ler('sw.js');
  for (const f of ['r13.css', 'logica5.js', 'mes.js']) assert.ok(sw.includes(`'/casa/${f}'`), f + ' no cache');
});

test('mês da oficina: só gestor e administrador, um bloco enxuto (sem dia, semana, conversão, consultores ou barras de 7 dias)', () => {
  const m = semComentarios(ler('mes.js'));
  assert.match(m, /if \(!casa\.visao\(\)\.dono\) \{ sec\.hidden = true; return; \}/);
  assert.match(m, /\/api\/central\/faturamento/);   // R13C: o faturamento sai pela regra única do valor do serviço (servidor da Central)
  assert.match(m, /casa_metas/);
  assert.doesNotMatch(m, /r6_c1b_painel_consultores|serie7|semana_passada|conversao|f\.hoje|f\.semana\b|ticket/);
  assert.doesNotMatch(m, /style="/, 'a CSP não deixa style no HTML');
  assert.equal(L.visao(perfil('gestor', ['agenda'])).dono, true);
  assert.equal(L.visao(perfil('atendente', ['agenda'])).dono, false);
  assert.equal(L.visao(perfil('mecanico', ['patio'])).dono, false);
});

test('sem repetição: o número que está no herói sai do cartão do app; ao sair, o faturamento não fica na página', () => {
  const p = semComentarios(ler('painel.js'));
  assert.match(p, /for \(const k of noHeroi\) delete nums\[k\];/);
  assert.match(p, /desenharNumeros\(d, noHeroi\)/);
  const c = semComentarios(ler('casa.js'));
  assert.match(c, /'#mesCorpo'/);
  assert.match(c, /for \(const s of \['#heroiNums', '#mesOficina', '#atencao'\]\)/);
});

test('r13.css: [hidden] com !important, toques de 44 px no topo e nada de borda grossa de um lado só', () => {
  const css = semComentarios(ler('r13.css'));
  assert.match(css, /\[hidden\] \{ display: none !important; \}/);
  assert.match(css, /\.ic-acoes \.btn-ico, \.ic-acoes \.avatar \{[^}]*width: 44px; height: 44px;/);
  assert.doesNotMatch(css, /border-(left|right):\s*[2-9]px/);
  assert.match(css, /\.atencao-item, \.grav-3 \.atencao-item, \.grav-1 \.atencao-item \{ border: 0;/);
  assert.doesNotMatch(css, /font-family:\s*['"]?(Inter|Roboto)/);
});
