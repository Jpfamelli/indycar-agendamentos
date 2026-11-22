'use strict';
/* Rodada 13 (22/11/2026): a entrada do Atendimento com o resumo de HOJE (hoje-regras.js + hoje.js + r13.css), a volta
   do Orçador para a conversa, a lista mais limpa no celular e nada de borda grossa de um lado só. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Hoje = require('../public/hoje-regras.js');

const pub = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const html = pub('index.html'), app = pub('app.js'), css = pub('r13.css'), tela = pub('hoje.js');

test('fraseDeHoje: os números do dia na frase, no plural certo; sem nada, "tudo em dia"', () => {
  const f = (c) => Hoje.fraseEmTexto(Hoje.fraseDeHoje(c));
  assert.equal(f({ novos: 3, esperando: 2, naMesa: 1 }), 'Hoje chegaram 3 conversas novas, 2 clientes esperam resposta e 1 orçamento está na mesa.');
  assert.equal(f({ novos: 1, esperando: 1 }), 'Hoje chegou 1 conversa nova e 1 cliente espera resposta.');
  assert.equal(f({ esperando: 0, naoLidas: 4, naMesa: 2 }), 'Hoje, 4 conversas estão sem ler e 2 orçamentos estão na mesa.');
  assert.equal(f({}), 'Hoje está tudo em dia: ninguém esperando resposta.');
  assert.equal(f({ novos: -2, esperando: 'x' }), 'Hoje está tudo em dia: ninguém esperando resposta.');
  // os números saem separados do texto (a tela pinta em vermelho, em Barlow Condensed)
  assert.deepEqual(Hoje.fraseDeHoje({ novos: 2 }).filter((p) => p.n !== undefined).map((p) => p.n), [2]);
});

test('chegadasPorHora: só as de HOJE no fuso da oficina, das 7h às 19h no mínimo, com o pico', () => {
  const agora = Date.parse('2026-11-22T15:00:00-03:00');
  const r = Hoje.chegadasPorHora(['2026-11-22T09:10:00-03:00', '2026-11-22T09:50:00-03:00', '2026-11-22T14:00:00-03:00',
    '2026-11-21T22:00:00-03:00', /* ontem */ '2026-11-22T02:00:00Z' /* 23h de ontem em SP */, 'lixo'], agora);
  assert.equal(r.total, 3);
  assert.equal(r.horas[0].hora, 7);
  assert.equal(r.horas.at(-1).hora, 19);
  assert.deepEqual(r.pico, { hora: 9, total: 2 });
  // quem chega às 6h ou às 21h estica o gráfico
  const cedo = Hoje.chegadasPorHora(['2026-11-22T06:20:00-03:00', '2026-11-22T21:05:00-03:00'], agora);
  assert.equal(cedo.horas[0].hora, 6);
  assert.equal(cedo.horas.at(-1).hora, 21);
  assert.equal(Hoje.chegadasPorHora([], agora).pico, null);
});

test('atenderAgora: a ordem da fila, sem as de colega para quem não é gestor, com selo e motivo', () => {
  const m = [
    { c: { id: 'a', nome: 'Camila', atribuida_a: 'joao' }, p: { nivel: 'agora', motivos: [{ texto: 'esperando há 2h' }] } },
    { c: { id: 'b', nome: '', telefone: '(12) 95555-4444', atribuida_a: null }, p: { nivel: 'logo', motivos: [] } },
    { c: { id: 'c', nome: 'Fora', atribuida_a: null }, p: { nivel: 'agora', fora: true } },
    { c: { id: 'd', nome: 'Normal', atribuida_a: null }, p: { nivel: 'normal' } },
    { c: { id: 'e', nome: 'Minha', atribuida_a: 'eu' }, p: { nivel: 'hoje', motivos: [{ texto: 'pediu horário' }] } },
  ];
  const at = Hoje.atenderAgora(m, { meuId: 'eu' });
  assert.deepEqual(at.map((x) => x.id), ['b', 'e']);
  assert.deepEqual(at[0].selo, { rotulo: 'Logo', tom: 'atencao' });
  assert.equal(at[1].motivo, 'pediu horário');
  assert.deepEqual(Hoje.atenderAgora(m, { meuId: 'eu', gestor: true }).map((x) => x.id), ['a', 'b', 'e']);
  assert.equal(Hoje.atenderAgora(m, { gestor: true, limite: 1 }).length, 1);
  assert.deepEqual(Hoje.atenderAgora(null ?? []), []);
});

test('tela: o resumo mora no meio (computador) e em cima da lista (celular), carregado depois do r7c4.js', () => {
  assert.match(html, /<div class="chat-vazio" id="chatVazio">\s*<!--[^>]*-->\s*<section class="hoje hoje-painel" id="hojePainel" aria-label="Resumo de hoje" hidden><\/section>/);
  assert.match(html, /<div class="lista-topo">\s*<section class="hoje hoje-mini" id="hojeMini" aria-label="Resumo de hoje" hidden><\/section>/);
  assert.ok(html.indexOf('src="hoje-regras.js"') < html.indexOf('src="app.js"'));
  assert.ok(html.indexOf('src="hoje.js"') > html.indexOf('src="r7c4.js"'));
  assert.ok(html.indexOf('href="r13.css"') > html.indexOf('href="r11.css"'), 'r13.css por último');
  const sw = pub('sw.js');
  for (const f of ['r13.css', 'hoje-regras.js', 'hoje.js']) assert.ok(sw.includes(`'${f}'`), f + ' no service worker');
});

test('tela: só lê (contagens e o que a fila já sabe); nada é enviado daqui', () => {
  assert.ok(!/\/api\/enviar|insert\(|update\(|delete\(|upsert\(|fetch\(/.test(tela), 'hoje.js não grava nem manda nada');
  assert.match(tela, /select\('id', head\)\.eq\('aguardando_consultor', true\)/, 'mesma conta do selo "Aguardando consultor"');
  // os números filtram a lista pelos mesmos chips de cima (e o filtro ligado volta para "Todas")
  for (const f of ['aguardando', 'nao_lidas', 'r6_urgentes', 'r6_orcamento']) {
    assert.ok(tela.includes(`'${f}'`), f);
    assert.match(html, new RegExp(`data-status="${f}"`), 'chip ' + f + ' existe');
  }
  assert.match(tela, /cod === atual \? '' : cod/);
});

test('acabamento: [hidden], Barlow nos números, sem borda grossa de um lado só, e o que é do Pátio fora da lista', () => {
  assert.match(css, /^\[hidden\]\{display:none!important\}/m);
  assert.match(css, /\.hoje-frase em\{font:700 1\.24em\/1 var\(--ic-titulo\)/);
  assert.match(css, /\.hoje-num b\{font:700 [^;]*var\(--ic-titulo\)/);
  assert.match(css, /#r7Agora,#c5Barra\{display:none!important\}/);
  assert.match(css, /\.toast,\.patio-bloco,[^{]*\.cop-proxima\{border-left-width:1px\}/);
  assert.ok(!/border-left:\s*[2-9]px/.test(css));
  assert.ok(!/fonts\.googleapis|DM Sans/.test(css));
});

test('celular: etapa e dono na LINHA da lista viram etiqueta (o toque abre a conversa); no topo da conversa seguem botões', () => {
  assert.match(app, /function etiquetaDaLinha\(html\) \{\s*if \(!window\.matchMedia\?\.\('\(max-width:900px\)'\)\.matches\) return html;/);
  assert.match(app, /\$\{etiquetaDaLinha\(plaquinhaHtml\(c\)\)\}/);
  assert.match(app, /const pl = t\.closest\('button\.plaquinha'\);/);
  // simula o celular
  const src = app.slice(app.indexOf('function etiquetaDaLinha'), app.indexOf('function renderConversas'));
  const f = new Function('window', src + '; return etiquetaDaLinha;')({ matchMedia: () => ({ matches: true }) });
  assert.equal(f('<button type="button" class="dono pegar" data-pegar="x" title="Ninguém responsável: um clique e o cliente é seu">★ Pegar</button>'),
    '<span class="dono pegar" title="Ninguém responsável: um clique e o cliente é seu">sem dono</span>');
  assert.equal(f('<button type="button" class="plaquinha" title="Etapa do funil: clique para trocar">Novo</button>'), '<span class="plaquinha" title="Etapa do funil">Novo</span>');
  const pc = new Function('window', src + '; return etiquetaDaLinha;')({ matchMedia: () => ({ matches: false }) });
  assert.equal(pc('<button type="button" class="plaquinha">x</button>'), '<button type="button" class="plaquinha">x</button>');
});

test('Orçador da aba volta para a conversa: só recado da própria moldura, do mesmo site, com id de conversa', () => {
  const i = app.indexOf("window.addEventListener('message'");
  assert.ok(i > 0);
  const trecho = app.slice(i, i + 700);
  assert.match(trecho, /ev\.source !== m\.contentWindow \|\| ev\.origin !== location\.origin/);
  assert.match(trecho, /d\.tipo !== 'indycar:abrir-conversa' \|\| !\/\^\[0-9a-f-\]\{36\}\$\/i\.test/);
  assert.match(trecho, /abrirConversa\(d\.conversa, \{ focarCampo: true \}\)/);
  assert.ok(!/enviar|sendMessage|\/api\//.test(trecho));
  // o "+ Nova" mora dentro da busca (não fica por cima do resumo no celular)
  assert.match(app, /\(\$\('\.lista-topo \.busca'\) \|\| \$\('\.lista-topo'\)\)\.appendChild\(btnNova\);/);
});

/* ---------------- Rodada B: tudo conversando ---------------- */
test('B: ?aba=orcador leva o resto do endereço (cliente ou orçamento) para o Orçador e não abre conversa', () => {
  assert.match(app, /if \(p\.get\('aba'\) === 'orcador'\) return;/, 'abrirPeloEndereco não usa o ?tel= do orçamento');
  const i = app.indexOf("if (aba === 'orcador') {");
  assert.ok(i > 0);
  const t = app.slice(i, i + 900);
  const m = /for \(const k of (\[[^\]]+\])\)/.exec(t);
  assert.ok(m, 'só o que o Orçador entende vai junto (papel/saude não)');
  const chaves = JSON.parse(m[1].replace(/'/g, '"'));
  // o "Novo orçamento" da Casa/Agenda manda carro, placa e serviço: tudo chega à cotação nova
  for (const k of ['tel', 'nome', 'cliente', 'carro', 'veiculo', 'placa', 'servico', 'conversa', 'agendamento', 'lead']) assert.ok(chaves.includes(k), k);
  for (const k of ['papel', 'saude', 'aba', 'utm_source']) assert.ok(!chaves.includes(k), k);
  assert.match(t, /const destino = \(resto\.toString\(\) \? '\?' \+ resto : ''\) \+ location\.hash;/);
  assert.match(t, /history\.replaceState\(null, '', location\.pathname\)/, 'o telefone sai da barra');
  assert.match(t, /AbaOrcador\.abrir\(destino\)/);
});

test('B: "Fazer orçamento" leva cliente, carro e placa da ficha', () => {
  const i = app.indexOf('function daConversa(conv)');
  const t = app.slice(i, i + 1400);
  for (const k of ["p.set('cliente'", "p.set('carro'", "p.set('placa'", "p.set('conversa'", "p.set('tel'", "p.set('nome'"]) assert.ok(t.includes(k), k);
  assert.match(t, /placaValida\(placa\)/);
});

test('B: links gravados com o endereço de produção da Central ficam no endereço em que a Central está (mesmo login)', () => {
  const carregar = (origin, basePath) => {
    const doc = { querySelector: () => ({ getAttribute: () => basePath }) };
    const loc = new URL(origin + basePath);
    const raiz = {};
    new Function('window', 'document', 'location', 'module', fs.readFileSync(path.join(__dirname, '..', 'public', 'apps.js'), 'utf8'))(raiz, doc, loc, undefined);
    return raiz.IndyCarApps;
  };
  const mock = carregar('http://localhost:3296', '/atendimento/');
  assert.equal(mock.naCentralAtual('https://indycar-agendamentos.onrender.com/crm/?lead=1'), 'http://localhost:3296/crm/?lead=1');
  assert.equal(mock.naCentralAtual('https://indycar-patio.netlify.app/?os=1'), 'https://indycar-patio.netlify.app/?os=1', 'o Pátio mora fora da Central');
  const prod = carregar('https://indycar-agendamentos.onrender.com', '/atendimento/');
  assert.equal(prod.naCentralAtual('https://indycar-agendamentos.onrender.com/crm/?lead=1'), 'https://indycar-agendamentos.onrender.com/crm/?lead=1');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'public', 'apps.js'), 'utf8'), /if \(endereco\) endereco = naCentralAtual\(endereco\);/);
});

test('B: rede caindo, o resumo de hoje guarda os números da última leitura boa e diz de quando são', () => {
  assert.match(tela, /H\.falhou = respostas\.some/);
  assert.match(tela, /Sem resposta do banco agora/);
  assert.match(tela, /if \(!H\.okEm && !H\.falhou\) return/, 'antes da primeira leitura: "Contando o dia…", não zeros');
  assert.match(tela, /data-hoje="recontar"/);
  assert.match(html, /title="Só as conversas que chegaram hoje"/, 'Novos hoje fala de conversa, não de lead');
});
