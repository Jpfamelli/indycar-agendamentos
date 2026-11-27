/* Rodada 20: CRM + Atendimento + Orçador num app só ("CRM e Atendimento").
   Regras puras (public/r20-regras.js), a página, a segurança (o CRM emoldura só o próprio site) e o service worker. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../public/r20-regras.js');
const SEG = require('../lib/seguranca.js');

const pub = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const pode = (...apps) => (a) => apps.includes(a);

test('R20: o que cada login vê (quem tinha só um dos dois continua entrando)', () => {
  assert.deepEqual(R.modoDaPessoa(pode('crm', 'atendimento'), true), { crm: true, conversas: true, orcador: true, entra: true, inicio: 'hoje' });
  assert.deepEqual(R.modoDaPessoa(pode('atendimento'), true), { crm: false, conversas: true, orcador: true, entra: true, inicio: 'conversas' }, 'só Atendimento: entra direto nas Conversas');
  assert.deepEqual(R.modoDaPessoa(pode('crm'), true), { crm: true, conversas: false, orcador: true, entra: true, inicio: 'hoje' }, 'só CRM: sem Conversas');
  assert.equal(R.modoDaPessoa(pode('agenda'), true).entra, false, 'recepção continua de fora');
  const solto = R.modoDaPessoa(pode('crm', 'atendimento'), false);
  assert.equal(solto.conversas, false, 'fora da Central não existe /atendimento/ para emoldurar');
  assert.equal(solto.orcador, false);
  assert.equal(R.modoDaPessoa(pode('atendimento'), false).entra, false, 'CRM solto: quem não tem o CRM não entra, como sempre');
});

test('R20: telefone do jeito que o CRM compara', () => {
  assert.equal(R.tel('+55 (12) 99683-0111'), '12996830111');
  assert.equal(R.tel('5512996830111'), '12996830111');
  assert.equal(R.tel('1236330111'), '1236330111');
  for (const ruim of ['', null, undefined, '123', '55129968301112222', 'abc']) assert.equal(R.tel(ruim), '', String(ruim));
});

test('R20: endereço de entrada: abas pelo "#", links antigos do Atendimento pelo "atd"', () => {
  assert.deepEqual(R.lerEntrada('', '#conversas'), { aba: 'conversas', moldura: null, orcador: null, limpar: false });
  assert.equal(R.lerEntrada('', '#funil').aba, 'pipeline');
  assert.equal(R.lerEntrada('', '#contatos').aba, 'leads', 'a lista de contatos continua tendo endereço');
  assert.equal(R.lerEntrada('', '#access_token=abc&type=recovery').aba, null, 'o link de senha nova não é confundido com aba');
  assert.equal(R.lerEntrada('?lead=1', '').aba, null, 'os links de sempre do CRM seguem com o CRM');

  const conv = R.lerEntrada('?aba=conversas&atd=' + encodeURIComponent('conversa=c0000000-0000-4000-8000-000000000002'), '');
  assert.deepEqual(conv, { aba: 'conversas', moldura: 'conversa=c0000000-0000-4000-8000-000000000002', orcador: null, limpar: true });
  const tel = R.lerEntrada('?aba=conversas&atd=' + encodeURIComponent('tel=12977776666&nome=Renata Souza'), '');
  assert.equal(new URLSearchParams(tel.moldura).get('nome'), 'Renata Souza');
  assert.equal(tel.limpar, true, 'o telefone sai da barra de endereço depois de lido');
  assert.equal(R.lerEntrada('?aba=conversas', '').moldura, null);

  assert.equal(R.lerEntrada('?aba=conversas&atd=' + encodeURIComponent('aba=integracoes'), '').moldura, 'aba=integracoes', 'Ajustes do Atendimento continuam alcançáveis por link');
  assert.equal(R.lerEntrada('?aba=conversas&atd=' + encodeURIComponent('aba=qualquer&tel=12977776666'), '').moldura, 'tel=12977776666', 'tela desconhecida é ignorada');
  assert.equal(R.lerEntrada('?aba=conversas&atd=' + encodeURIComponent('embutido=1&painel=1&tel=12977776666'), '').moldura, 'tel=12977776666');

  const orc = R.lerEntrada('?aba=conversas&atd=' + encodeURIComponent('aba=orcador&tel=12977776666&nome=Renata'), '#/historico/11111111-1111-4111-8111-111111111111');
  assert.equal(orc.aba, 'orcador');
  assert.equal(orc.orcador, '?tel=12977776666&nome=Renata#/historico/11111111-1111-4111-8111-111111111111', 'o orçamento pedido abre na aba Orçador');
  assert.deepEqual(R.lerEntrada('?aba=orcador', ''), { aba: 'orcador', moldura: null, orcador: '', limpar: true });
});

test('R20: o que vai para as molduras é só o que elas sabem ler', () => {
  assert.equal(R.enderecoDaMoldura('/atendimento/', ''), '/atendimento/?embutido=1');
  assert.equal(R.enderecoDaMoldura('/atendimento/', 'tel=12977776666', { painel: true }), '/atendimento/?embutido=1&painel=1&tel=12977776666');
  assert.equal(R.enderecoDaMoldura('/atendimento/', 'embutido=0&painel=0&conversa=x'), '/atendimento/?embutido=1&conversa=x', 'ninguém desliga o modo embutido pelo endereço');
  assert.equal(R.enderecoDaMoldura('/atendimento/', 'a-b=1&ok=2&grande=' + 'x'.repeat(300)), '/atendimento/?embutido=1&ok=2');

  assert.equal(R.enderecoDoOrcador(''), '');
  assert.equal(R.enderecoDoOrcador('#/historico/abc'), '#/historico/abc');
  assert.equal(R.enderecoDoOrcador('?tel=12977776666&nome=Renata&lixo=1#/cotacao'), '?tel=12977776666&nome=Renata#/cotacao');
  for (const ruim of ['//site-de-fora.example', 'https://x.example/', 'javascript:alert(1)', '?a=<script>', '?' + 'a'.repeat(700), '/../crm/']) assert.equal(R.enderecoDoOrcador(ruim), null, ruim.slice(0, 30));
});

test('R20: o cartão do funil de um telefone é o aberto mais novo', () => {
  const leads = [
    { id: 'a', telefone: '(12) 99683-0111', status: 'concluido', created_at: '2026-11-20T10:00:00Z' },
    { id: 'b', telefone: '5512996830111', status: 'contato', created_at: '2026-10-01T10:00:00Z' },
    { id: 'c', telefone: '12996830111', status: 'orcamento', created_at: '2026-11-01T10:00:00Z' },
    { id: 'd', telefone: '12911112222', status: 'novo', created_at: '2026-11-25T10:00:00Z' },
  ];
  assert.equal(R.cartaoDoTelefone(leads, '+55 12 99683-0111').id, 'c');
  assert.equal(R.cartaoDoTelefone(leads.filter((l) => l.id === 'a'), '12996830111').id, 'a', 'sem cartão aberto, vale o mais novo de todos');
  assert.equal(R.cartaoDoTelefone(leads, '12900000000'), null);
  assert.equal(R.cartaoDoTelefone(leads, ''), null);
  assert.equal(R.cartaoDoTelefone(null, '12996830111'), null);
});

test('R20: só o link de conversa do próprio site vira painel', () => {
  const o = 'https://central.example';
  assert.equal(R.telDoLink('/atendimento/?tel=5512996830111', '/atendimento/', o), '12996830111');
  assert.equal(R.telDoLink('https://central.example/atendimento/?tel=12996830111', '/atendimento/', o), '12996830111');
  assert.equal(R.telDoLink('/atendimento/?aba=orcador&tel=12996830111', '/atendimento/', o), '', 'link do Orçador não é conversa');
  assert.equal(R.telDoLink('https://outro.example/atendimento/?tel=12996830111', '/atendimento/', o), '');
  assert.equal(R.telDoLink('/agenda/?tel=12996830111', '/atendimento/', o), '');
  assert.equal(R.telDoLink('tel:+5512996830111', '/atendimento/', o), '');
  assert.equal(R.telDoLink('/atendimento/?tel=12996830111', null, o), '', 'CRM solto: nada vira painel');
});

test('R20: "abrir no CRM" pedido pela conversa embutida só leva o que o CRM sabe abrir', () => {
  assert.equal(R.pedidoDoCrm('/crm/?lead=42', 'https://c.example').get('lead'), '42');
  assert.equal(R.pedidoDoCrm('/crm/?tel=5512996830111', 'https://c.example').get('tel'), '12996830111');
  assert.equal(R.pedidoDoCrm('/crm/?cliente=5f6c1a2e-0001-4abc-9def-000000000001', 'https://c.example').get('cliente'), '5f6c1a2e-0001-4abc-9def-000000000001');
  assert.equal(R.pedidoDoCrm('/crm/?lead=<x>&cliente=1', 'https://c.example'), null);
  assert.equal(R.pedidoDoCrm('/crm/', 'https://c.example'), null);
});

test('R20: a faixa "WhatsApp parado" repete o que o Atendimento responde', () => {
  assert.equal(R.textoZap(null), null);
  assert.equal(R.textoZap({ parado: false }), null);
  assert.deepEqual(R.textoZap({ parado: true, titulo: 'WhatsApp parado desde ter 24/11 às 08:24', situacao: 'o CodeWords recusou a chave.', acao: 'Cole a chave nova.' }),
    { titulo: 'WhatsApp parado desde ter 24/11 às 08:24', situacao: 'O CodeWords recusou a chave.', acao: 'Cole a chave nova.' });
  assert.equal(R.textoZap({ parado: true }).titulo, 'WhatsApp parado');
});

test('R20: a página — nome novo, abas Hoje · Funil · Conversas · Clientes · Orçador, sem a aba Contatos', () => {
  const html = pub('index.html');
  assert.match(html, /<title>[^<]*CRM e Atendimento/);
  assert.match(html, /class="ic-nome"[^>]*>IndyCar <b>CRM e Atendimento<\/b>/);
  const abas = /<nav[^>]*class="[^"]*ic-abas[^"]*"[\s\S]*?<\/nav>/.exec(html)[0];
  const views = [...abas.matchAll(/data-view="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(views, ['hoje', 'pipeline', 'conversas', 'clientes', 'orcador']);
  assert.match(abas, /id="navConversas"[^>]*hidden/, 'Conversas e Orçador nascem escondidas: só aparecem para quem pode');
  assert.match(abas, /id="navOrcador"[^>]*hidden/);
  assert.doesNotMatch(abas, /data-view="leads"/, 'a aba Contatos saiu do topo');
  const iMenu = html.indexOf('id="menuPerfil"');
  const menu = html.slice(iMenu, iMenu + 3000);
  assert.match(menu, /data-view="leads"[^>]*>[^<]*Lista de contatos/, 'a lista completa (filtros, exportar, lote) continua no menu da pessoa');
  assert.match(menu, /data-view="dashboard"/);
  assert.match(menu, /data-r20="ajustes"/, 'Ajustes do WhatsApp alcançáveis pelo menu');
  for (const id of ['view-conversas', 'view-orcador', 'r20MolduraConversas', 'r20MolduraOrcador', 'r20Painel', 'r20MolduraPainel', 'r20EtapaPainel', 'r20EtapaConversas', 'r20Zap', 'r20PainelFechar']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /id="view-leads"/, 'a tela da lista não foi apagada');
  assert.match(html, /id="r20MolduraPainel"[^>]*allow="[^"]*microphone/, 'a conversa embutida pode gravar áudio');
  assert.ok(html.indexOf('r20-regras.js') < html.indexOf('r20.js"') || html.indexOf('r20-regras.js') < html.lastIndexOf('r20.js'), 'as regras carregam antes da tela');
  assert.doesNotMatch(html, /<iframe[^>]+src="https?:/, 'nenhuma moldura para fora do site');
});

test('R20: estilos — [hidden] vale, sem borda grossa colorida de um lado só, toques de 44 px no celular', () => {
  const css = pub('r20.css');
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.doesNotMatch(css, /border-(left|right|top|bottom):\s*[3-9]px solid/, 'sem borda grossa colorida de um lado só');
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /body\.r20-vendo-chat \.ic-topo,body\.r20-vendo-chat \.ic-abas[^{]*\{display:none\}/, 'no celular a conversa aberta fica com a tela inteira');
  assert.match(pub('r20.js'), /el\('r20DicaConversas'\)\.hidden = !modo\(\)\.crm \|\|/, 'a dica do funil não aparece para quem só tem o Atendimento');
});

test('R20: segurança — o CRM emoldura só o próprio site e continua sem poder ser emoldurado', () => {
  const csp = SEG.cspPagina(pub('index.html'));
  const parte = (n) => csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(n + ' '));
  assert.equal(parte('frame-src'), "frame-src 'self'");
  assert.equal(parte('frame-ancestors'), "frame-ancestors 'none'");
  assert.match(SEG.PERMISSOES_PAGINA, /microphone=\(self\)/);
  assert.match(SEG.PERMISSOES_PAGINA, /camera=\(\)/);
  assert.match(SEG.CSP_API, /frame-ancestors 'none'/);
});

test('R20: service worker com versão nova e os arquivos da rodada', () => {
  const sw = pub('sw.js');
  const v = Number(/indycar-crm-v(\d+)/.exec(sw)[1]);
  assert.ok(v >= 23, 'cache novo: quem tinha o app antigo recebe as abas novas');
  for (const f of ['r20-regras.js', 'r20.js', 'r20.css']) assert.ok(sw.includes(f), f);
  const man = JSON.parse(pub('manifest.json'));
  assert.match(man.name, /CRM e Atendimento/);
});

test('R20: o código antigo passa a abrir conversa e orçamento dentro do app', () => {
  const r6 = pub('rodada6.js');
  assert.match(r6, /function abrirNomeada6\(u, app\) \{\s*if \(window\.R20Tela\?\.abrirDentro\(u\)\) return null;/);
  assert.match(r6, /if \(window\.R20Tela\?\.soConversas\(\)\) return;/, 'quem só tem o Atendimento não pede os sinais do funil');
  const m = pub('melhorias.js');
  assert.match(m, /R20Tela\?\.botaoDoCartao\(l\)/, 'todo cartão do funil ganha "Ver conversa"');
  const tela = pub('r20.js');
  assert.match(tela, /await moverEtapa\(l\.id, b\.dataset\.etapa\)/, 'mudar a etapa pela conversa usa a mesma função do arrastar');
  assert.doesNotMatch(tela, /fetch\([^)]*enviar|\/api\/mensagens/, 'o CRM não tem lógica de envio: quem envia é o Atendimento embutido');
});
