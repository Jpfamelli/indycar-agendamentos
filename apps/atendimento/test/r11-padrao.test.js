'use strict';
/* Rodada 11 (21/11/2026): Atendimento no padrão IndyCar (topo .ic-topo, Archivo/Barlow), limpo (sem Ajuda, sino,
   seletor de apps, Funil, Tarefas e Relatórios no topo) e com a aba Orçador (o Orçador da Central numa moldura). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pub = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const html = pub('index.html'), app = pub('app.js'), tarefas = pub('tarefas.js');
const semComentario = (t) => t.replace(/<!--[\s\S]*?-->/g, '');

test('topo comum: .ic-topo com logo e "IndyCar Atendimento" que volta para a Central; padrão antes do CSS do app', () => {
  assert.match(html, /<header class="ic-topo topo-atd">/);
  assert.match(html, /<a class="ic-marca" href="\.\.\/" title="Voltar para a Central">/);
  assert.match(html, /<img src="\.\.\/casa\/logo\.png" alt="" width="32" height="32" \/>/);
  assert.match(html, /<span class="ic-nome">IndyCar <b>Atendimento<\/b><\/span>/);
  assert.ok(html.indexOf('href="../casa/indycar.css"') < html.indexOf('href="styles.css"'), 'indycar.css antes do CSS do app');
  assert.ok(html.indexOf('href="r11.css"') > html.indexOf('href="r7c4.css"'), 'r11.css por último');
  assert.ok(!/fonts\.googleapis|fonts\.gstatic|DM\+Sans/.test(html), 'nada de fonte do Google');
  assert.match(pub('r11.css'), /--fonte:var\(--ic-texto-f\);\s*--fonte-cond:var\(--ic-titulo\);/);
});

test('até 5 abas no topo: Conversas, Orçador e Ajustes; o resto de configurar fica na linha de Ajustes', () => {
  const topo = html.slice(html.indexOf('<nav class="ic-abas"'), html.indexOf('</nav>', html.indexOf('<nav class="ic-abas"')));
  const abas = [...topo.matchAll(/data-aba="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(abas, ['conversas', 'orcador', 'config']);
  assert.ok(abas.length <= 5);
  const ajustes = html.slice(html.indexOf('<nav class="ajustes-abas"'), html.indexOf('</nav>', html.indexOf('<nav class="ajustes-abas"')));
  /* rodada 20: embutido no CRM, a linha de Ajustes começa com "Voltar para as conversas" (escondido fora da moldura) */
  assert.deepEqual([...ajustes.matchAll(/data-aba="([a-z]+)"/g)].map((m) => m[1]), ['conversas', 'config', 'integracoes', 'ia', 'atalhos', 'etapas', 'equipe', 'auditoria']);
  assert.match(app, /const ABAS_AJUSTES = \['config', 'integracoes', 'ia', 'atalhos', 'etapas', 'equipe', 'auditoria'\];/);
  for (const fora of ['funil', 'tarefas', 'relatorios']) assert.ok(!new RegExp(`class="nav-item[^"]*" data-aba="${fora}"`).test(html), `${fora} saiu do topo (mora no CRM / na Central)`);
});

test('limpo: sem Ajuda, tour, lista de teclas, sino, seletor de apps, barra lateral e propaganda no login', () => {
  const tela = semComentario(html);
  for (const id of ['modalAjudaBg', 'btnSino', 'painelSino', 'ecoSeletor', 'btnVazioTour', 'btnVerAtalhosTeclado', 'listaTeclas', 'navGrupoEquipe']) {
    assert.ok(!tela.includes(`id="${id}"`), id);
  }
  assert.ok(!/class="sidebar"|class="login-lado"|data-mp="ajuda"|ajuda\.js/.test(tela));
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'public', 'ajuda.js')));
  assert.ok(!/window\.Ajuda|abrirAjudaTeclado|const TECLAS/.test(app), 'o "?" e a lista de teclas saíram');
  assert.ok(!/ecoSeletor/.test(app));
  assert.ok(!/'ajuda\.js'/.test(pub('sw.js')) && /'r11\.css'/.test(pub('sw.js')));
  // o sino saiu da tela, mas o código das tarefas não quebra sem ele
  assert.match(tarefas, /if \(\$\('#btnSino'\)\) ligarSino\(\);/);
  assert.match(tarefas, /if \(!num\) return;/);
  assert.match(tarefas, /if \(!b\) return;/);
});

test('aba Orçador: moldura do próprio site e "Fazer orçamento" na conversa aberta', () => {
  assert.match(html, /<section class="aba" id="aba-orcador">\s*<iframe id="orcadorMoldura" class="orcador-moldura" title="Orçador"/);
  assert.ok(!/<iframe[^>]*\ssrc=/.test(html), 'só carrega quando a aba abre');
  assert.match(html, /id="btnFazerOrcamento"[^>]*>\s*🧾 Fazer orçamento/);
  assert.match(app, /\$\('#btnFazerOrcamento'\)\?\.addEventListener\('click', \(\) => AbaOrcador\.daConversa\(conversaAtual\)\);/);
  assert.match(pub('apps.js'), /if \(app === 'orcador' && raiz\.AbaOrcador && raiz\.AbaOrcador\.abrir\(endereco \|\| ''\)\) return raiz;/, '"Criar orçamento" da ficha e Alt+O caem na aba');
  assert.match(pub('r7c4.js'), /rotulo === 'indycar-orcador' && url && window\.AbaOrcador\?\.abrir\(url\)/);
  const csp = require('../lib/seguranca.js').politicaCSP({ supabaseUrl: 'https://x.supabase.co' });
  assert.match(csp, /frame-src 'self'/);
  assert.match(csp, /frame-ancestors 'self'/, 'rodada 20: só o próprio site (o app CRM e Atendimento) emoldura o Atendimento');
  assert.ok(!/googleapis|gstatic/.test(csp));
});

/* roda o módulo AbaOrcador do app.js num navegador de mentira */
function abaOrcador({ telefone = true } = {}) {
  const ini = app.indexOf('const AbaOrcador = (() => {');
  const fim = app.indexOf('})();', ini) + 5;
  const cliques = [], avisos = [];
  const moldura = { src: '' };
  const ctx = {
    URL, URLSearchParams, location: new URL('https://central.exemplo/atendimento/'),
    window: { IndyCarApps: { apps: { orcador: { url: 'https://indycar-orcador.netlify.app' } } } },
    document: { getElementById: (id) => (id === 'orcadorMoldura' ? moldura : null) },
    $$: () => [{ dataset: { aba: 'orcador' }, click: () => cliques.push('orcador') }],
    toast: (t) => avisos.push(t),
  };
  vm.runInNewContext(app.slice(ini, fim) + '\nthis.AbaOrcador = AbaOrcador;', ctx);
  return { A: ctx.AbaOrcador, moldura, cliques, avisos, telefone };
}

test('AbaOrcador: só endereço do Orçador entra na moldura, sempre dentro da Central', () => {
  const { A } = abaOrcador();
  assert.equal(A.enderecoLocal('https://indycar-orcador.netlify.app/?tel=5512991821234&nome=Ana'), 'https://central.exemplo/orcador/?tel=5512991821234&nome=Ana');
  assert.equal(A.enderecoLocal('https://indycar-orcador.netlify.app/#/historico/2f1c9a7e-1111-4222-8333-444455556666'), 'https://central.exemplo/orcador/#/historico/2f1c9a7e-1111-4222-8333-444455556666');
  assert.equal(A.enderecoLocal('?tel=1299&nome=Bia'), 'https://central.exemplo/orcador/?tel=1299&nome=Bia');
  assert.equal(A.enderecoLocal(''), 'https://central.exemplo/orcador/');
  assert.equal(A.enderecoLocal('https://site-de-fora.com/?tel=1'), null);
  assert.equal(A.enderecoLocal('javascript:alert(1)'), null);
  assert.equal(A.enderecoLocal('/crm/?lead=1'), null, 'outro app da Central não entra na moldura');
});

test('AbaOrcador: "Fazer orçamento" abre a aba com nome, telefone e a conversa', () => {
  const { A, moldura, cliques } = abaOrcador();
  assert.equal(A.daConversa({ id: '2f1c9a7e-1111-4222-8333-444455556666', nome: 'Ana Souza', telefone_e164: '+55 (12) 99182-1234' }), true);
  const u = new URL(moldura.src);
  assert.equal(u.pathname, '/orcador/');
  assert.equal(u.searchParams.get('tel'), '5512991821234');
  assert.equal(u.searchParams.get('nome'), 'Ana Souza');
  assert.equal(u.searchParams.get('conversa'), '2f1c9a7e-1111-4222-8333-444455556666');
  assert.deepEqual(cliques, ['orcador']);
  const sem = abaOrcador();
  sem.A.daConversa({ id: 'x', nome: 'Sem número' });
  assert.equal(sem.moldura.src, 'https://central.exemplo/orcador/');
  assert.match(sem.avisos[0], /não tem telefone/);
  assert.equal(abaOrcador().A.daConversa(null), false);
});
