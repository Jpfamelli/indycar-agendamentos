'use strict';
/* Rodada 20: o Atendimento dentro do app "CRM e Atendimento".
   Horário marcado pela conversa leva o cartão aberto do funil para "Agendado" (sem cartão duplicado), o desvio de
   quem abre a página direto, a segurança (só o próprio site emoldura) e o service worker. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../public/r20-regras.js');
const SEG = require('../lib/seguranca.js');

const pub = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');

/* banco de mentira mínimo: só o que moverCartaoParaAgendado usa */
function sbFalso(leads, { barrar = false, erroLeitura = false } = {}) {
  const pedidos = [];
  const from = (tabela) => {
    const q = { tabela, filtros: [], acao: 'select', campos: null };
    const api = {
      select() { if (q.acao === 'update') q.devolver = true; return api; },
      update(c) { q.acao = 'update'; q.campos = c; return api; },
      insert(c) { q.acao = 'insert'; q.campos = c; return api; },
      eq(k, v) { q.filtros.push((l) => l[k] === v); return api; },
      in(k, vs) { q.filtros.push((l) => vs.includes(l[k])); return api; },
      order() { return api; },
      limit() { return api; },
      then(ok, no) {
        pedidos.push({ tabela: q.tabela, acao: q.acao, campos: q.campos });
        let r;
        if (q.acao === 'select') r = erroLeitura ? { data: null, error: { message: 'caiu' } } : { data: leads.filter((l) => q.filtros.every((f) => f(l))).map((l) => ({ ...l })), error: null };
        else if (q.acao === 'update') {
          const alvo = barrar ? [] : leads.filter((l) => q.filtros.every((f) => f(l)));
          for (const l of alvo) Object.assign(l, q.campos);
          r = { data: alvo.map((l) => ({ ...l })), error: null };
        } else r = { data: null, error: null };
        return Promise.resolve(r).then(ok, no);
      },
    };
    return api;
  };
  return { from, pedidos };
}
const CLIENTE = '5f6c1a2e-0001-4abc-9def-000000000001';

test('telefonesIguais: as formas gravadas do mesmo telefone', () => {
  assert.deepEqual(R.telefonesIguais('+55 (12) 99683-0111'), ['12996830111', '5512996830111', '+5512996830111']);
  assert.deepEqual(R.telefonesIguais('1236330111'), ['1236330111', '551236330111', '+551236330111']);
  for (const ruim of ['', null, '123', 'abc']) assert.deepEqual(R.telefonesIguais(ruim), [], String(ruim));
});

test('escolherCartao: só cartão que ainda não tem horário; entre vários, o mexido por último', () => {
  const leads = [
    { id: 'a', status: 'agendado', updated_at: '2026-11-26T10:00:00Z' },
    { id: 'b', status: 'contato', updated_at: '2026-11-20T10:00:00Z' },
    { id: 'c', status: 'orcamento', updated_at: '2026-11-25T10:00:00Z' },
    { id: 'd', status: 'concluido', updated_at: '2026-11-26T12:00:00Z' },
    { id: 'e', status: 'perdido', updated_at: '2026-11-26T13:00:00Z' },
  ];
  assert.equal(R.escolherCartao(leads).id, 'c');
  assert.equal(R.escolherCartao(leads.filter((l) => !['b', 'c'].includes(l.id))), null, 'cartão já agendado é de outro horário: nasce um novo');
  assert.equal(R.escolherCartao([]), null);
  assert.equal(R.escolherCartao(null), null);
  assert.deepEqual(R.ANTES_DE_AGENDAR, ['novo', 'contato', 'orcamento']);
});

test('camposDoAgendado: muda a etapa, completa o que o horário trouxe e nunca toca na origem', () => {
  const m = R.camposDoAgendado({ valor_orcado: 300, servico: 'Freios' }, { servico: 'Alinhamento 3D', servico_id: 's1', valor_orcado: 0, carro_modelo: 'Corolla', placa: '', origem: 'whatsapp' });
  assert.deepEqual(m, { status: 'agendado', servico: 'Alinhamento 3D', servico_id: 's1', carro_modelo: 'Corolla' }, 'valor zerado não apaga o valor que o cartão já tinha; placa vazia não apaga a placa');
  assert.equal(R.camposDoAgendado({ valor_orcado: 300 }, { valor_orcado: 260 }).valor_orcado, 260);
  assert.equal(R.camposDoAgendado({ valor_orcado: 0 }, {}).valor_orcado, 0);
  assert.equal('origem' in R.camposDoAgendado({}, { origem: 'whatsapp' }), false);
});

test('moverCartaoParaAgendado: reaproveita o cartão aberto do cliente (não duplica)', async () => {
  const leads = [
    { id: 'l1', cliente_id: CLIENTE, status: 'concluido', origem: 'meta', telefone: '12996830111' },
    { id: 'l2', cliente_id: CLIENTE, status: 'orcamento', origem: 'meta', telefone: '12996830111', valor_orcado: 0 },
    { id: 'l9', cliente_id: 'outro', status: 'contato', origem: 'site', telefone: '12911112222' },
  ];
  const sb = sbFalso(leads);
  const r = await R.moverCartaoParaAgendado(sb, { cliente_id: CLIENTE, telefone_e164: '5512996830111' }, { servico: 'Alinhamento 3D', valor_orcado: 260 });
  assert.equal(r.id, 'l2');
  assert.equal(leads[1].status, 'agendado');
  assert.equal(leads[1].origem, 'meta', 'a origem do cartão continua dizendo de onde o cliente veio');
  assert.equal(leads[1].valor_orcado, 260);
  assert.equal(leads[0].status, 'concluido');
  assert.equal(leads[2].status, 'contato', 'cartão de outro cliente não é tocado');
  assert.equal(leads.length, 3);
  assert.equal(sb.pedidos.filter((p) => p.acao === 'insert').length, 0);
});

test('moverCartaoParaAgendado: sem cadastro de cliente, acha o cartão pelo telefone (com e sem 55)', async () => {
  const leads = [{ id: 'l5', cliente_id: null, status: 'novo', telefone: '5512977776666' }];
  const r = await R.moverCartaoParaAgendado(sbFalso(leads), { cliente_id: null, telefone_e164: '+55 12 97777-6666' }, {});
  assert.equal(r.id, 'l5');
  assert.equal(leads[0].status, 'agendado');
});

test('moverCartaoParaAgendado: devolve null (e quem chamou cria o cartão, como antes) quando não dá', async () => {
  assert.equal(await R.moverCartaoParaAgendado(sbFalso([]), { cliente_id: CLIENTE }, {}), null, 'sem cartão aberto');
  const colega = [{ id: 'l2', cliente_id: CLIENTE, status: 'contato' }];
  assert.equal(await R.moverCartaoParaAgendado(sbFalso(colega, { barrar: true }), { cliente_id: CLIENTE }, {}), null, 'o banco barrou (cartão de colega): 0 linhas');
  assert.equal(colega[0].status, 'contato');
  assert.equal(await R.moverCartaoParaAgendado(sbFalso(colega, { erroLeitura: true }), { cliente_id: CLIENTE }, {}), null, 'leitura falhou');
  assert.equal(await R.moverCartaoParaAgendado(sbFalso(colega), { cliente_id: null, telefone: '123' }, {}), null, 'sem cliente e sem telefone válido');
  assert.equal(await R.moverCartaoParaAgendado(null, { cliente_id: CLIENTE }, {}), null);
  assert.equal(await R.moverCartaoParaAgendado({ from() { throw new Error('quebrou'); } }, { cliente_id: CLIENTE }, {}), null, 'nunca lança: marcar o horário não para por causa disto');
});

/* ---------------- apps.js: quem abre a página direto vai para o app unificado ---------------- */
function rodarApps({ caminho = '/atendimento/', busca = '', hash = '', base = '/atendimento/', noTopo = true, solto = false } = {}) {
  const idas = [], recados = [], classes = [];
  const location = { href: 'https://central.example' + caminho + busca + hash, origin: 'https://central.example', pathname: caminho, search: busca, hash, replace: (u) => idas.push(u) };
  const document = { querySelector: (s) => (s === 'base[href]' ? { getAttribute: () => base } : null), documentElement: { classList: { add: (c) => classes.push(c) } } };
  const janela = { location, document, URL, URLSearchParams, parent: { postMessage: (d, o) => recados.push([d, o]) } };
  janela.self = janela; janela.top = noTopo ? janela : {}; janela.window = janela;
  if (solto) janela.INDYCAR_SOLTO = 1;
  vm.runInNewContext(pub('apps.js'), janela);
  return { A: janela.IndyCarApps, idas, recados, classes };
}

test('apps.js: aberto direto na Central, vai para /crm/ levando o endereço antigo', () => {
  assert.deepEqual(rodarApps().idas, ['/crm/?aba=conversas']);
  assert.deepEqual(rodarApps({ busca: '?conversa=abc' }).idas, ['/crm/?aba=conversas&atd=' + encodeURIComponent('conversa=abc')]);
  assert.deepEqual(rodarApps({ busca: '?aba=orcador&tel=12977776666', hash: '#/historico/1' }).idas, ['/crm/?aba=conversas&atd=' + encodeURIComponent('aba=orcador&tel=12977776666') + '#/historico/1']);
  assert.deepEqual(rodarApps({ busca: '?embutido=1' }).idas, ['/crm/?aba=conversas'], 'embutido=1 fora de moldura não engana: a página sozinha não existe mais na Central');
});

test('apps.js: dentro da moldura do CRM fica embutido, sem desvio, e fala só com o próprio site', () => {
  const e = rodarApps({ busca: '?embutido=1', noTopo: false });
  assert.deepEqual(e.idas, []);
  assert.equal(e.A.embutido, true);
  assert.equal(e.A.painel, false);
  assert.deepEqual(e.classes, ['embutido']);
  assert.equal(e.A.avisarPai('indycar:teste', { n: 1 }), true);
  assert.equal(JSON.stringify(e.recados), JSON.stringify([[{ tipo: 'indycar:teste', n: 1 }, 'https://central.example']]));
  const p = rodarApps({ busca: '?embutido=1&painel=1&tel=12977776666', noTopo: false });
  assert.equal(p.A.painel, true);
  assert.deepEqual(p.classes, ['embutido', 'embutido-painel']);
});

test('apps.js: fora da Central (servidor solto ou de mentira) nada muda', () => {
  for (const caso of [{ base: '/', caminho: '/' }, { solto: true }]) {
    const r = rodarApps(caso);
    assert.deepEqual(r.idas, [], JSON.stringify(caso));
    assert.equal(r.A.embutido, false);
    assert.equal(r.A.avisarPai('x'), false);
    assert.deepEqual(r.classes, []);
  }
});

/* ---------------- página, segurança e service worker ---------------- */
test('página: recado no lugar da tela de entrar, volta dos Ajustes, "sem conversa ainda" e os arquivos da rodada', () => {
  const html = pub('index.html');
  for (const id of ['r20Sessao', 'r20Entrar', 'r20SemConversa', 'r20SemConversaTxt', 'r20Comecar']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /class="[^"]*r20-voltar[^"]*"[^>]*data-aba="conversas"/);
  assert.match(html, /r20\.css/);
  assert.ok(html.indexOf('r20-regras.js') > 0 && html.indexOf('r20-regras.js') < html.indexOf('"app.js') || html.indexOf('r20-regras.js') < html.lastIndexOf('app.js'), 'as regras carregam antes do app.js');
  assert.ok(html.lastIndexOf('r20.js') > html.lastIndexOf('r18.js'), 'r20.js depois do r18.js');
  assert.match(html, /id="formLogin"/, 'a tela de entrar continua existindo para o servidor solto');
  const css = pub('r20.css');
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(css, /\.embutido \.app > \.ic-topo[^{]*\{display:none!important\}/);
  assert.match(css, /html\.embutido\.r18-zap-parado #faixaSaude\.r18-zap:not\(\[hidden\]\)/, 'a faixa do WhatsApp parado aparece uma vez só (no app de fora)');
  assert.doesNotMatch(css, /border-(left|right|top|bottom):\s*[3-9]px solid/);
});

test('app.js: horário marcado reaproveita o cartão e avisa o app de fora; nada é enviado sozinho', () => {
  const app = pub('app.js');
  assert.match(app, /R20Regras\.moverCartaoParaAgendado\(sb, conversaAtual/);
  assert.ok(app.includes("avisarPai?.('indycar:atd-agendou'"));
  assert.match(app, /avisarPai\('indycar:abrir-orcador'/);
  const tela = pub('r20.js');
  assert.match(tela, /ev\.source !== window\.parent \|\| ev\.origin !== location\.origin/, 'só ouve o app de fora, do mesmo endereço');
  assert.doesNotMatch(tela, /enviarMensagem|\/api\/mensagens|\/api\/enviar/, 'r20.js não envia nada a cliente');
  assert.match(tela, /abrirModalNova\(\)/, '"Começar conversa" abre a conversa nova para a pessoa escrever');
});

test('segurança: a página só pode ser emoldurada pelo próprio site', () => {
  const texto = SEG.politicaCSP({ supabaseUrl: 'https://abc.supabase.co', hashes: SEG.hashesDosScripts(pub('index.html')) });

  assert.match(texto, /frame-ancestors 'self'/);
  assert.doesNotMatch(texto, /frame-ancestors[^;]*(\*|https?:)/);
});

test('service worker: versão nova, casca guardada do modo embutido e redirecionamento entregue como veio', () => {
  const sw = pub('sw.js');
  assert.ok(Number(/indycar-atendimento-v(\d+)/.exec(sw)[1]) >= 32);
  for (const f of ['r20-regras.js', 'r20.js', 'r20.css']) assert.ok(sw.includes(f), f);
  assert.match(sw, /RAIZ \+ '\?embutido=1'/, 'a casca é pedida no modo embutido: um redirecionamento nunca entra no cache no lugar da página');
  assert.match(sw, /r\.type === 'opaqueredirect' \|\| r\.redirected/);
});
