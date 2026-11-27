// Rodada 13B: passagens entre apps na mesma janela (Central), Orçador e Tráfego como irmãos, Hoje sem número falso
// enquanto carrega ou quando a rede cai, e textos com o vocabulário da casa.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const APPS = require('../lib/apps.js');
const pub = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');

function appsDaTela(pathname) {
  const ctx = { location: { pathname, origin: 'https://indycar-agendamentos.onrender.com' }, document: {} };
  ctx.window = ctx;
  vm.runInNewContext(pub('apps.js'), ctx);
  return ctx.IndyCarApps;
}

test('Central: Orçador e Tráfego são irmãos (mesma origem e mesma sessão); solto, continuam no próprio endereço', () => {
  const c = appsDaTela('/crm/'), s = appsDaTela('/');
  assert.equal(c.urlApp('orcador', '/?tel=5512999990001&lead=x'), '/orcador/?tel=5512999990001&lead=x');
  assert.equal(c.urlApp('orcador', '/#/historico/abc'), '/orcador/#/historico/abc');
  assert.equal(c.urlApp('trafego', '/'), '/trafego/');
  assert.equal(c.urlApp('patio', '/?os=1'), 'https://indycar-patio.netlify.app/?os=1', 'o Pátio mora em outro endereço');
  assert.equal(s.urlApp('orcador', '/'), 'https://indycar-orcador.netlify.app/');
  assert.equal(APPS.linkApp('orcador', '/#/historico/1', { prefixo: '/crm' }), '/orcador/#/historico/1');
  assert.equal(APPS.linkApp('trafego', '/', { prefixo: '/crm' }), '/trafego/');
  assert.equal(APPS.linkApp('patio', '/?os=1', { prefixo: '/crm' }), 'https://indycar-patio.netlify.app/?os=1');
});

test('links para outros apps (rodada 13C: aba nomeada; aba bloqueada sai nesta janela sem perder o que foi digitado)', () => {
  const r6 = pub('rodada6.js');
  assert.match(r6, /const mesmaJanela6 = \(\) => false;/);
  assert.match(r6, /function abrirNomeada6\(u, app\) \{\n  if \(window\.R20Tela\?\.abrirDentro\(u\)\) return null;[^\n]*\n  const w = window\.open\(u, 'indycar-' \+ app\);/);   // rodada 20: Atendimento e Orçador abrem dentro do app; os outros, na aba nomeada
  assert.match(r6, /sairPara6\(u\);   \/\/ aba bloqueada/);
  assert.match(r6, /formSujo\(\)[\s\S]{0,120}não foram salvas/, 'ficha com alteração não salva pergunta antes de sair');
  assert.match(r6, /FILA_MEM\.length[\s\S]{0,200}esperando o sistema voltar/, 'mudança na fila pergunta antes de sair');
  assert.match(r6, /location\.assign\(href\)/);
  assert.match(r6, /\['patio', 'orcador', 'atendimento', 'agenda', 'comunicar', 'trafego', 'site'\]/);
});

test('Hoje: nada de número inventado enquanto carrega ou quando a rede cai', () => {
  const js = pub('r13.js'), html = pub('index.html');
  assert.match(js, /Montando o resumo do dia…/);
  assert.match(js, /Não consegui carregar os contatos agora/);
  assert.match(js, /data-r13-tentar/);
  assert.match(js, /if \(!R13_PRONTO \|\| typeof TODOS === 'undefined'\) \{ esperaHoje13\(\); return; \}/);
  assert.match(js, /carregarLeads = async function/);
  assert.match(html, /<section class="view active" id="view-hoje">/, 'Hoje já é a tela ativa antes de carregar (antes era o Painel)');
  assert.match(html, /<h1 id="viewTitle" class="ic-titulo">Hoje<\/h1>/);
});

test('mesmos nomes: "contato" no lugar de "lead" e o caminho certo do valor pendente', () => {
  const m = pub('melhorias.js');
  assert.match(m, /`Contato: \$\{lead\.nome/);
  assert.ok(!/`Lead: \$\{|lead\(s\) selecionado|Valores pendentes/.test(m));
  assert.match(m, /Hoje › Valor dos serviços fechados/);
});

test('servidor de mentira monta os links com o prefixo da Central (como o servidor real)', () => {
  const mock = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'mock-server.mjs'), 'utf8');
  assert.match(mock, /R5\.linksFicha\(ficha, \{prefixo: PREFIXO\}\)/);
  assert.match(mock, /equipeDe: equipe, prefixo: PREFIXO\}/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'mock-r7.mjs'), 'utf8'), /atalhosDoLead\([\s\S]*\{ prefixo: ctx\.prefixo \|\| '' \}\)/);
});

test('endereço com filtro: ?ver=sem-responsavel (e ?filtro=) abre Contatos filtrado; o parâmetro sai da barra', () => {
  const js = pub('r13.js');
  assert.match(js, /'sem-responsavel': \{resp: 'sem', status: 'abertos'\}/);   // R13C: mesma regra da Casa (em aberto)
  assert.match(js, /'sem-valor': \{semValor: true\}/);
  assert.match(js, /p\.get\('ver'\) \|\| p\.get\('filtro'\)/);
  assert.match(js, /history\.replaceState/);
  const r = js.indexOf('abrirPorLink = async function'), ir = js.indexOf("irPara('leads'); refiltrarTela();", r);
  assert.ok(r > 0 && ir > r, 'vai para Contatos e refiltra');
});

test('IA da ficha: link com endereço antigo de app irmão vira o caminho da Central (rodada 13C: na aba nomeada do app)', () => {
  const ia = pub('crm-ia.js');
  assert.match(ia, /function naCentral\(u\)/);
  assert.match(ia, /const c = naCentral\(u\); return c \? `<a href="\$\{esc\(c\)\}">/);
  assert.match(ia, /const c = naCentral\(url\); if \(c\) \{ const app = typeof appDoLink6 === 'function' \? appDoLink6\(c\) : null; if \(app && typeof abrirNomeada6 === 'function'\) abrirNomeada6\(c, app\)/);
});

test('?ver=: todos os filtros do endereço existem, cada um na sua linha (um comentário já engoliu "meus" e "sem-valor")', () => {
  const fonte = pub('r13.js');
  const bloco = fonte.slice(fonte.indexOf('const VER13 = {'), fonte.indexOf('};', fonte.indexOf('const VER13 = {')));
  for (const chave of ['sem-responsavel', 'meus', 'sem-valor', 'funil', 'painel', 'hoje', 'contatos']) {
    const linha = bloco.split('\n').find(l => l.includes(`'${chave}'`));
    assert.ok(linha, `falta o filtro ${chave}`);
    assert.ok(!/\/\/.*'(meus|sem-valor)'/.test(linha), `${chave}: está dentro de um comentário`);
  }
});
