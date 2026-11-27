/* Rodada 11 (21/11/2026): o CRM no padrão IndyCar e enxuto, e o que ficou das rodadas 9 e 10 na tela.
   Lê os arquivos da tela (public/) sem navegador. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const pub = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const html = pub('index.html');
const JS = fs.readdirSync(path.join(__dirname, '..', 'public')).filter(f => f.endsWith('.js') && f !== 'sw.js').map(f => [f, pub(f)]);
const CSS = fs.readdirSync(path.join(__dirname, '..', 'public')).filter(f => f.endsWith('.css')).map(f => [f, pub(f)]);
// texto visível do HTML: sem scripts, estilos, comentários e etiquetas
const textoVisivel = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');

test('rodada 11: topo .ic-topo com a marca do app (rodada 20: "IndyCar CRM e Atendimento") que volta para a Central', () => {
  assert.match(html, /<link rel="stylesheet" href="\/casa\/indycar\.css" \/>/);
  assert.ok(html.indexOf('/casa/indycar.css') < html.indexOf('styles.css'), 'o padrão vem antes do CSS do app');
  assert.match(html, /<header class="ic-topo">\s*<a class="ic-marca" href="\/"[^>]*>\s*<img src="\/casa\/logo\.png"[^>]*>\s*<span class="ic-nome">IndyCar <b>CRM e Atendimento<\/b><\/span>/);
  assert.equal((html.match(/class="ic-topo"/g) || []).length, 1);
  for (const velho of ['class="sidebar"', 'brand-mark', 'bm-indy', 'id="ecossistema"', 'CRM · CENTRO AUTOMOTIVO']) assert.ok(!html.includes(velho), velho);
});

test('rodada 11: até 5 abas no topo; o resto do gestor fica no menu da pessoa', () => {
  const nav = html.match(/<nav class="ic-abas"[\s\S]*?<\/nav>/)[0];
  const abas = [...nav.matchAll(/data-view="(\w+)"[^>]*>([^<]+)</g)].map(m => m[2]);
  /* rodada 20: CRM e Atendimento num app só. Contatos e Painel foram para o menu da pessoa; entraram Conversas e Orçador */
  assert.deepEqual([...abas].sort(), ['Clientes', 'Conversas', 'Funil', 'Hoje', 'Orçador'], 'continuam 5 abas no topo');
  const menu = html.match(/<div class="pop pop-direita menu-perfil" id="menuPerfil"[\s\S]*?<\/header>/)[0];
  assert.match(menu, /data-view="equipe" hidden>Equipe e metas</);
  assert.match(menu, /data-view="distribuir" hidden>Contatos sem responsável</);
  assert.match(menu, /data-view="servicos">Serviços</);
  assert.match(menu, /data-mp="sair">Sair</);
  // as telas que saíram não têm mais seção nem título
  for (const v of ['dono', 'origem', 'relatorios', 'integracoes', 'ia', 'configuracoes']) assert.ok(!html.includes(`id="view-${v}"`), v);
  assert.doesNotMatch(pub('app.js'), /\b(origem|integracoes|relatorios|configuracoes|ia):\s*\[/);
});

test('rodada 11: só as fontes do padrão (Archivo e Barlow Condensed) e nada do Google', () => {
  assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(html + pub('sw.js')), 'sem fontes do Google na página nem no service worker');
  for (const [f, s] of CSS) {
    assert.ok(!/DM Sans|'Inter'|Roboto/.test(s), f);
    for (const m of s.matchAll(/font-family:([^;}]+)/g)) assert.match(m[1], /var\(--|monospace|inherit|Archivo|Barlow/, `${f}: ${m[1]}`);
  }
  const seg = require('../lib/seguranca.js');
  const csp = (seg.cspPagina || (() => ''))({});
  if (csp) assert.ok(!/fonts\.g/.test(csp), 'a política de segurança também não libera o Google Fonts');
  assert.match(pub('r11.css'), /--font:\s*var\(--ic-texto-f\)/);
  assert.match(pub('r11.css'), /\[hidden\]\{display:none!important\}/);
});

test('rodada 11: sem ajuda, tour, atalhos, sino, busca global, filtros salvos e colunas', () => {
  for (const id of ['btnAjuda', 'dlgAjuda', 'tour', 'dlgAtalhos', 'btnAtalhos', 'btnSino', 'painelSino', 'btnBuscaGlobal', 'dlgBusca', 'filtrosSalvos', 'btnSalvarFiltro', 'dlgFiltro', 'btnColunas', 'painelColunas', 'saudeSistema', 'cardTarefas', 'voceHoje', 'cardPrevisao', 'listaParados', 'tblRecent', 'cliKpis', 'loteExportar', 'hojeAtualizar'])
    assert.ok(!html.includes(`id="${id}"`), id);
  for (const [f, s] of JS) {
    assert.ok(!/abrirAjuda|iniciarTour|passosTour|perguntasAjuda/.test(s), `${f}: ajuda/tour`);
    assert.ok(!/from\('notificacoes'\)/.test(s), `${f}: sino (mora na Central)`);
    assert.ok(!/api\/busca-tudo\?q=' \+ encodeURIComponent\(q\) \+ '&limite=4'/.test(s), `${f}: busca global (mora na Central)`);
  }
  assert.ok(!/Ajuda|Atalhos de teclado|Rever o tour/.test(textoVisivel));
});

test('rodada 11: "lead" virou "contato" e "follow-up" virou "retorno" no texto da tela', () => {
  assert.ok(!/\bleads?\b|follow-?up/i.test(textoVisivel), 'HTML');
  for (const [f, s] of JS) {
    // textos de toast, botões e títulos (entre aspas) não falam mais "lead"
    const achados = [...s.matchAll(/(?:toast|toastAcao|confirm)\(\s*(['`])([^'`]*)\1/g)].map(m => m[2]).filter(t => /\b[Ll]eads?\b|[Ff]ollow-?up/.test(t));
    assert.deepEqual(achados, [], f);
    assert.ok(!/>\s*(Novo |Criar |Abrir )?[Ll]eads?\s*</.test(s), `${f}: rótulo com "lead"`);
  }
  assert.match(pub('melhorias.js'), /kpi\('Contatos novos'/);
  assert.match(pub('equipe.js'), /leads: 'Contatos novos'/, 'a chave do banco continua "leads"; só o rótulo muda');
});

test('rodada 11: a ficha do contato não repete o Atendimento (sem WhatsApp direto nem copiar telefone)', () => {
  const m = pub('melhorias.js');
  assert.ok(!/'WhatsApp', '🟢'/.test(m) && !/>Copiar telefone</.test(m));
  assert.match(m, /'Abrir conversa', '💬'/);
  assert.match(m, /Ficha do cliente/);
  assert.ok(!/'WhatsApp', '🟢'/.test(pub('rodada5.js')) && !/'WhatsApp', '🟢'/.test(pub('app.js')));
});

test('rodada 11: cada coisa mora num lugar só (anúncios no Tráfego, conta na Central, equipe no Atendimento)', () => {
  assert.ok(!/Meta Ads|Google Ads|Access Token|Developer Token/.test(html), 'credenciais de anúncio saíram do CRM');
  assert.ok(!/Trocar minha senha|Verificação em duas etapas|Cadastrar funcionário/.test(html));
  assert.ok(!/\bcarregarIntegracoes|carregarROI|carregarConfiguracoes|carregarRelatorios|carregarDono6|carregarRoiOrigem6|r7Origens\b/.test(JS.map(x => x[1]).join('\n')));
});

/* ---- rodadas 9 e 10 (pendência do Codex): o que continua na tela, agora com teste ---- */
test('R9-CRM: atributos de teclado, leitor de tela e celular que continuam na tela', () => {
  const tem = (re, rot) => assert.match(html, re, rot);
  tem(/<button class="btn btn-primary" id="btnNovo">\+ Novo contato<\/button>/, 'R9-CRM-006');
  tem(/<option value="">Todas as etapas<\/option>/, 'R9-CRM-012');
  tem(/<table class="table" id="tblLeads" aria-label="Contatos">/, 'R9-CRM-014');
  tem(/id="pagLeads" aria-label="Páginas de contatos"/, 'R9-CRM-015');
  tem(/aria-label="Buscar contatos" id="search" type="search" enterkeyhint="search" placeholder="Nome, telefone ou placa"/, 'R9-CRM-016/023/030');
  tem(/aria-label="Nova tarefa para este contato"/, 'R9-CRM-017');
  tem(/id="buscaServico" type="search" enterkeyhint="search" aria-label="Buscar serviço ou categoria"/, 'R9-CRM-018/032');
  tem(/id="fTelefone" autocomplete="tel" type="tel" inputmode="tel"/, 'R9-CRM-020');
  tem(/id="fPlaca" spellcheck="false"/, 'R9-CRM-021');
  tem(/<label>Etapa<select id="fStatusForm">/, 'R9-CRM-022');
  tem(/id="loginSenha" enterkeyhint="go"/, 'R9-CRM-025');
  tem(/id="esqEmail" enterkeyhint="send"/, 'R9-CRM-026');
  tem(/id="mfaCodigo" enterkeyhint="done"/, 'R9-CRM-027');
  tem(/id="buscaCliente" type="search" enterkeyhint="search"/, 'R9-CRM-031');
  tem(/id="tarefaLeadTexto" enterkeyhint="done"/, 'R9-CRM-034');
  tem(/id="nsSenha2"|id="senhaNova2"/, 'R9-CRM-035 (senha nova no login)');
  tem(/id="dsIdade" aria-label="Tempo desde a abertura do contato"/, 'R9-CRM-039');
  tem(/<section class="card card-sem-dono r14-rodizio" id="cardSemDono" aria-labelledby="sdTitulo2">/, 'R9-CRM-042/115 (rodada 14: o título virou o herói e o rodízio ganhou o próprio título)');
  tem(/id="fCampanha" autocapitalize="none" maxlength="200" placeholder="Ex.: troca-de-oleo"/, 'R9-CRM-048/054');
  tem(/id="tarefaLeadData" type="date" aria-label="Data da tarefa"/, 'R9-CRM-051');
  tem(/id="fCarro" autocapitalize="words"/, 'R9-CRM-053');
  tem(/id="campCorpo" aria-describedby="campAjuda"/, 'R9-CRM-055');
  tem(/<div class="table-wrap" tabindex="0" role="region" aria-label="Lista de clientes">/, 'R9-CRM-114');
  assert.ok(CSS.some(([, s]) => /prefers-reduced-motion/.test(s)), 'R9-CRM-010/063');
});

test('R9-CRM: comportamentos da tela que continuam (primeira visita, contagem, clientes, fila Hoje, ficha)', () => {
  const app = pub('app.js'), eq = pub('equipe.js'), r7 = pub('rodada7.js');
  assert.match(app, /irPara\(atalho && !atalho\.hidden \? aba : 'hoje'\)/, 'R9-CRM-002 (mudou na rodada 13): primeira visita abre Hoje, o resumo do dia');
  assert.match(app, /\$\('#leadCount'\)\.textContent = `\$\{LEADS\.length\} contato/, 'R9-CRM-011 + rodada 11: a contagem aparece já no carregamento');
  assert.match(app, /const pedido = \+\+pedidoClientes;[\s\S]*if \(!atual\(\)\) return;/, 'R9-CRM-065: busca de clientes descarta respostas antigas');
  assert.match(app, /alvo\.setAttribute\('aria-busy', 'true'\)/, 'R9-CRM-066');
  assert.match(app, /id="clientesTentar">Tentar novamente/, 'R9-CRM-067');
  assert.match(app, /id="catalogoTentar"/, 'R9-CRM-069');
  assert.match(r7, /let pedidoHoje = 0;/, 'R9-CRM-071: fila Hoje descarta respostas atrasadas');
  assert.match(eq, /estadoTarefasContato === estado/, 'R9-CRM-098: resposta atrasada não troca as tarefas da ficha');
  assert.match(eq, /Carregando tarefas…/, 'R9-CRM-099');
  assert.match(eq, /data-tarefa-tentar="contato">Tentar novamente/, 'R9-CRM-100');
  assert.match(eq, /controle\.disabled = true;/, 'R9-CRM-105');
});
