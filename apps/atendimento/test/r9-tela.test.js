'use strict';
/* Rodada 9 (Claude): conferências estáticas da tela (CSS, HTML e os geradores de gráfico).
   O comportamento no Chrome (axe-core, 44 px, alturas) é conferido por scripts/roteiro-r9.cjs,
   que só fala com o servidor de mentira. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pub = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const css = pub('styles.css'), r6 = pub('r6.css'), r7 = pub('r7c4.css'), cop = pub('copiloto.css'), c5 = pub('r6c5.css');
const html = pub('index.html'), app = pub('app.js'), tarefas = pub('tarefas.js');

/* devolve o texto de todos os blocos @media cuja condição casa com o padrão */
function blocosMedia(texto, padrao) {
  const out = [];
  const re = /@media([^{]+)\{/g;
  let m;
  while ((m = re.exec(texto))) {
    if (!padrao.test(m[1])) continue;
    let i = re.lastIndex, nivel = 1;
    while (i < texto.length && nivel) { if (texto[i] === '{') nivel++; else if (texto[i] === '}') nivel--; i++; }
    out.push(texto.slice(re.lastIndex, i - 1));
  }
  return out.join('\n');
}
const celular = [css, r6, cop, r7].map(t => blocosMedia(t, /max-width:\s*900px/)).join('\n') + blocosMedia(c5, /max-width/);

test('R9 celular: conversa aberta ocupa a tela toda e as mensagens têm altura garantida', () => {
  assert.match(celular, /\.app:has\(#aba-conversas\.ativa \.conversas-layout\.vendo-chat\) > \.sidebar\{display:none\}/);
  assert.match(celular, /\.conversas-layout\{height:calc\(100vh - var\(--topo-faixas,0px\)\);height:calc\(100dvh - var\(--topo-faixas,0px\)\)\}/);
  assert.match(celular, /\.mensagens-wrap\{min-height:160px\}/);
  assert.match(celular, /\.chat-acoes\{flex-wrap:nowrap\}/, 'ações do cabeçalho numa linha');
  assert.match(celular, /\.chat-linha-tags\{flex-wrap:nowrap;overflow-x:auto/, 'etapa, responsável e presença numa linha');
  assert.match(celular, /\.chat-propostas\{max-height:104px\}/, 'propostas da IA com teto');
  assert.match(celular, /\.r6-zap\{flex-wrap:nowrap\}/, 'aviso da conversa numa linha com o botão');
});

test('R9: um aviso só de WhatsApp parado dentro da conversa', () => {
  assert.match(r6, /\.r6-zap\.parado:not\(\[hidden\]\) ~ \.r7-retomada\.r7-parado\{display:none\}/);
  assert.match(celular, /body:has\(#aba-conversas\.ativa \.conversas-layout\.vendo-chat #r6Zap\.parado:not\(\[hidden\]\)\) #faixaSaude\.saude-codewords\{display:none\}/);
  assert.ok(html.indexOf('id="r6Zap"') < html.indexOf('id="chatPropostas"'));
});

test('R9 celular: tudo que se toca tem 44 px', () => {
  for (const s of ['.nav-item{min-width:44px;min-height:44px', '.sino{width:44px;height:44px}', '.tema-toggle{min-width:44px;min-height:44px',
    '.eco-seletor select{min-height:44px}', '.faixa-btn{min-height:44px', '.btn,.btn.sm,.config-pilula{min-height:44px}',
    '.chip{min-height:44px', '.seg{min-height:44px', '.link:not(.sair){display:inline-flex;align-items:center;min-height:44px}',
    '.chat-topo .plaquinha,.chat-topo .dono{min-height:44px', '.msg-reenviar{min-height:44px;min-width:64px',
    '.col-ficha .ficha-fechar{width:44px;height:44px}', '.inline-valor{min-height:44px}', 'summary{min-height:44px',
    '.tf-check{width:44px;height:44px}', '.atalho-fav{width:44px;height:44px}', '.fc-mover{min-height:44px}', '.cor-op{width:44px;height:44px}',
    'input[type="checkbox"],input[type="radio"]{width:24px;height:24px', '.cop-btn,.cop-chip{min-height:44px}',
    '.r6-chips-chat .r6-chip,.r6-sug,.r6-btn,.r6-acoes button,.r6-bloco-titulo,.r6-zap button,.r6-link{min-height:44px}',
    '.r7-retomada button, .r7-horas .chip, .r7-grupo > summary { min-height: 44px; }', '.c5-faixa .r6-btn,.c5-acao .r6-btn{flex:1 1 140px;min-height:44px}']) {
    assert.ok(celular.includes(s), `falta no celular: ${s}`);
  }
  assert.match(celular, /\.mini-select,\.mini-busca,[^}]*\{min-height:44px\}/);
  assert.match(celular, /\.ficha-links a,\.ficha-links button,\.ficha-link,\.ficha-editar,\.btn-editar-item,\.btn-patio\{min-height:44px\}/);
  // o botão Sair continua escondido no celular (mora no menu do perfil)
  assert.ok(!/\n\s*\.link\{display:inline-flex/.test(celular));
});

test('R9 computador: a triagem volta a ser compacta com mouse e as mensagens têm altura garantida', () => {
  assert.match(css, /@media \(max-width:900px\),\(pointer:coarse\)\{\s*#aba-conversas :is\(\.chip,\.seg,\.btn-icone,\.btn,\.chat-voltar,\.busca\) \{\s*min-height:44px;/);
  const pc = blocosMedia(r6, /min-width:\s*901px\)\s*$/);
  assert.match(pc, /\.mensagens-wrap\{min-height:150px\}/);
  assert.match(pc, /\.chat-propostas\{overflow-y:auto;min-height:52px;flex-shrink:1\}/);
  assert.match(pc, /\.r6-resumo\{flex-wrap:nowrap\}/);
  assert.match(pc, /\.r6-zap\{flex-wrap:nowrap\}/);
  assert.match(blocosMedia(r6, /max-height:\s*820px/), /\.r6-chips-chat\{flex-wrap:nowrap;overflow-x:auto/);
});

test('R9 celular: nome das telas continua existindo para o leitor de tela; faixa compacta', () => {
  assert.match(celular, /\.nav-item span\{display:block;position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset\(50%\)/);
  const fone = blocosMedia(css, /max-width:\s*600px/);
  assert.match(fone, /\.logo-caixa\{max-width:84px\}/);
  assert.match(fone, /\.fim-acoes \.tema-toggle\{display:none\}/);
  assert.match(pub('acesso.js'), /acao === 'tema'/, 'o tema continua no menu do perfil');
  assert.match(fone, /#faixaSaude\.saude-codewords\{font-size:\.84rem;padding:8px 10px;flex-wrap:nowrap/);
});

test('R9: faixas da retomada seguem o tema do app, não o do sistema', () => {
  assert.ok(!/prefers-color-scheme/.test(r7), 'nada de prefers-color-scheme no r7c4.css');
  assert.match(r7, /:root\[data-tema="claro"\] \.r7-parado \{ background: #fdecea; color: #8a1c14; \}/);
  assert.match(r7, /\n\.r7-parado \{ background: rgba\(220, 70, 60, \.18\); color: #ff8f86; \}/);
  assert.ok(!/var\(--texto-2/.test(r7), 'sem o token --texto-2, que o app não define');
});

test('R9 contraste: etiquetas, iniciais, selos e a conversa selecionada', () => {
  assert.match(css, /:root\[data-tema="claro"\]\{--vermelho-txt:#a30610;--verde-txt:#086b33;--verde-claro-txt:#0f6a31\}/);
  assert.match(css, /\.plaquinha\{color:color-mix\(in srgb,var\(--pl-cor,#8b8b96\) 40%,var\(--texto-forte\)\)\}/);
  assert.match(css, /\.dono\{color:color-mix\(in srgb,var\(--dn-cor,var\(--cinza\)\) 40%,var\(--texto-forte\)\)\}/);
  assert.match(css, /\.msg-autor b\{background:color-mix\(in srgb,var\(--autor,#3b82f6\) 62%,#fff\);color:#0b0f1a\}/);
  assert.match(css, /:root\[data-tema="claro"\] \.tag\.niver\{color:#9d174d\}/);
  assert.match(css, /:root\[data-tema="claro"\] \.conversa\.ativa :is\(\.conversa-hora,\.conversa-carro\)\{color:#4b4e57\}/);
  assert.ok(css.includes('.selo-espera.espera-alto{color:color-mix(in srgb,var(--espera-alto) 55%,var(--texto-forte))}'), 'selo de espera');
  assert.ok(css.includes(':root[data-tema="claro"]{--azul-txt:#075985;--azul-claro-txt:#075985}'), 'azul do tema claro');
  assert.match(tarefas, /class="avatar mini" aria-hidden="true" style="background:color-mix\(in srgb, /);
});

test('R9 acessibilidade: gráficos com resumo em texto e regiões que rolam com foco', () => {
  const svgs = app.match(/<svg viewBox="0 0 [^"]+" role="img"[^>]*>/g) || [];
  assert.equal(svgs.length, 5, 'cinco geradores de gráfico');
  for (const s of svgs) assert.match(s, /aria-label="\$\{desc/, s);
  assert.match(app, /const rolavel = rotulo => `tabindex="0" role="group" aria-label="/);
  assert.match(app, /<div class="tabela-caixa" \$\{rolavel\(/);
  assert.match(html, /id="chatAvisos" class="chat-avisos" hidden role="group" aria-label="Avisos deste cliente" tabindex="0"/);
});

test('R9 acessibilidade: cartão do funil e do atalho não são botão com botão dentro', () => {
  assert.ok(!/class="atalho-cartao[^>]*role="button"/.test(app));
  assert.ok(!/funil-cartao[\s\S]{0,160}role="button"/.test(app));
  assert.match(app, /role="group"\s+aria-label="Atalho \/\$\{esc\(a\.comando\)\}\. Enter abre para editar"/);
});

test('R9: o título do copiloto aparece inteiro', () => {
  assert.match(cop, /\n\.cop-titulo\{flex:1 0 auto;overflow:visible;text-overflow:clip\}/);
});

test('R9: os geradores de gráfico rodam e descrevem os dados', () => {
  // carrega só o trecho dos gráficos do app.js numa caixa de areia
  const ini = app.indexOf('const COR = { verde:');
  const fim = app.indexOf('const celulaCsv');
  assert.ok(ini > 0 && fim > ini);
  const caixa = { esc: t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) };
  vm.createContext(caixa);
  vm.runInContext(app.slice(ini, fim) + '\nthis.G = { graficoBarras, graficoLinha, graficoBarrasH, graficoRosca, mapaCalorSvg, tabelaHtml };', caixa);
  const { G } = caixa;
  const b = G.graficoBarras({ rotulos: ['01/11', '02/11'], series: [{ nome: 'Leads', cor: '#f00', valores: [3, 4] }] });
  assert.match(b, /aria-label="Gráfico de barras: Leads, total 7; de 01\/11 a 02\/11"/);
  assert.match(b, /tabindex="0" role="group"/);
  const l = G.graficoLinha({ rotulos: ['01/11', '02/11'], valores: [5, null], cor: '#f00', nome: 'espera média' });
  assert.match(l, /aria-label="Gráfico de linha: espera média; de 5 a 5; de 01\/11 a 02\/11"/);
  const vazio = G.graficoLinha({ rotulos: [], valores: [], cor: '#f00', nome: 'espera média' });
  assert.match(vazio, /sem dados no período/);
  assert.match(G.graficoBarrasH({ itens: [{ rotulo: 'Freio "ABS"', valor: 2 }] }), /aria-label="Gráfico de barras: Freio &quot;ABS&quot; 2"/);
  assert.match(G.graficoRosca({ fatias: [{ rotulo: 'WhatsApp', valor: 9, cor: '#0f0' }] }), /aria-label="Gráfico de rosca: WhatsApp 9; total 9"/);
  const matriz = Array.from({ length: 7 }, () => Array(24).fill(0)); matriz[2][14] = 6;
  assert.match(G.mapaCalorSvg({ matriz }), /pico em Terça às 14h, com 6 mensagens/);
  assert.match(G.tabelaHtml({ colunas: ['Pessoa', 'Leads'], linhas: [['Ana', 2]] }), /aria-label="Tabela: Pessoa, Leads \(role para o lado com as setas\)"/);
});

/* ---------------- lote 3 ---------------- */
test('R9 enxugar: código morto da lista antiga da equipe saiu da tela', () => {
  for (const nome of ['pintarCargaDaEquipe', 'traduzErroAuth', 'dataLonga']) assert.ok(!app.includes(nome), nome + ' ainda está no app.js');
  assert.ok(!html.includes('id="listaEquipe"'), 'a lista escondida saiu do HTML');
  for (const classe of ['.equipe-item', '.equipe-papel', '.equipe-rodizio', '.equipe-carga', '.chip-minhas', '.nav-externo', '.sub-titulo']) {
    assert.ok(!css.includes(classe), classe + ' ainda está no styles.css');
  }
  // o que está em uso continua
  assert.ok(html.includes('id="btnIrEquipe"') && css.includes('.carga-zero'));
});

test('R9: barra do celular e abertura do app instalado na cor do app', () => {
  assert.ok(html.includes('<meta name="theme-color" content="#0d1220" />'));
  assert.ok(app.includes("meta.setAttribute('content', claro ? '#f6f7f9' : '#0d1220');"));
  assert.equal(JSON.parse(pub('manifest.json')).background_color, '#070a14');
  assert.ok(pub('sw.js').includes('background:#070a14'));
  for (const f of [html, app, pub('sw.js'), pub('manifest.json')]) assert.ok(!f.includes('#0a0a0b'), 'sobrou a cor antiga');
});

test('R9: ícone da notificação acompanha a pasta onde o app está montado', () => {
  assert.ok(!app.includes("icon: '/icon-192.png'"));
  assert.equal(app.split("icon: new URL('icon-192.png', document.baseURI).href").length - 1, 2);
});

test('R9 texto: avisos de servidor antigo sem nome de rota e com o que fazer', () => {
  const telas = [pub('equipe.js'), tarefas, app].join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const linhasDeTela = telas.split('\n').map(l => l.replace(/(^|\s)\/\/\s.*$/, '')).filter(l => /(GET|POST|PATCH) \/api\//.test(l) && !/^\s*(\/\/|\*)/.test(l) && !/fetch\(|api\(/.test(l));
  assert.deepEqual(linhasDeTela.map(l => l.trim().slice(0, 80)), []);
  assert.ok(pub('equipe.js').includes('Peça a quem cuida do sistema para publicar a versão nova do servidor.'));
  assert.ok(pub('equipe.js').includes("avisoSemRota('A lista completa da equipe')"));
  assert.ok(tarefas.includes('Carga calculada aqui na tela, só com as conversas já carregadas.'));
});
