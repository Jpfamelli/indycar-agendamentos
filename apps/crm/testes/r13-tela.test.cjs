// Rodada 13: tela Hoje com o resumo do dia, valor do serviço fechado fácil de lançar e o CRM no celular.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R13 = require('../public/r13-resumo.js');
const pub = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const html = pub('index.html'), js = pub('r13.js'), css = pub('r13.css');

const AGORA = new Date(2026, 10, 22, 15, 0).getTime();
const h = (horas) => new Date(AGORA - horas * 3600000).toISOString();
const leads = [
  {id: 'a', status: 'novo', created_at: h(2), responsavel_id: 'eu', valor_orcado: 300},
  {id: 'b', status: 'novo', created_at: h(3), responsavel_id: null},
  {id: 'c', status: 'contato', created_at: h(80), responsavel_id: 'outro', valor_orcado: 500},
  {id: 'd', status: 'concluido', created_at: h(100), closed_at: h(1), responsavel_id: 'eu', valor_pago: 450},
  {id: 'e', status: 'concluido', created_at: h(100), closed_at: h(5), responsavel_id: 'eu', valor_pago: 0},
  {id: 'f', status: 'concluido', created_at: h(200), closed_at: h(60), responsavel_id: 'outro', valor_pago: null},
  {id: 'g', status: 'concluido', created_at: h(200), closed_at: h(60), responsavel_id: 'eu', valor_pago: 0, observacoes: 'Cortesia: sem cobrança'},
  {id: 'h', status: 'perdido', created_at: h(2), closed_at: h(1), responsavel_id: 'eu'},
];

test('resumo do dia (gestor): novos, fechados hoje, faltando valor e em aberto', () => {
  const r = R13.resumoHoje(leads, AGORA, {gestor: true});
  assert.equal(r.novos, 3, 'a, b e h entraram hoje');
  assert.equal(r.fechados, 2, 'd e e fecharam hoje');
  assert.equal(r.faturouHoje, 450);
  assert.deepEqual(r.faltaValor.map(l => l.id), ['e', 'f'], 'cortesia não conta como sem valor; mais recente primeiro');
  assert.equal(r.abertos, 3);
  assert.equal(r.emAberto, 800);
  assert.equal(r.porEtapa.find(x => x.etapa === 'novo').qtd, 2);
});

test('resumo do dia (atendente): só o que é dele, e os novos sem responsável', () => {
  const r = R13.resumoHoje(leads, AGORA, {euId: 'eu', gestor: false});
  assert.equal(r.novos, 3);
  assert.deepEqual(r.faltaValor.map(l => l.id), ['e'], 'o sem valor do colega não aparece para o atendente');
  assert.equal(r.abertos, 1);
});

test('frase do herói: números em destaque e concordância', () => {
  const r = R13.resumoHoje(leads, AGORA);
  const p = R13.fraseHoje(r, 5), txt = p.map(x => 'n' in x ? x.n : x.t).join('');
  assert.equal(txt, 'Hoje entraram 3 contatos novos, 5 pedem retorno e 2 serviços fechados estão sem valor.');
  assert.deepEqual(p.filter(x => 'n' in x).map(x => x.n), [3, 5, 2]);
  const um = R13.fraseHoje({novos: 1, abertos: 1, faltaValor: []}, 1).map(x => 'n' in x ? x.n : x.t).join('');
  assert.equal(um, 'Hoje entrou 1 contato novo, 1 pede retorno e todo serviço fechado já tem valor.');
  const semFila = R13.fraseHoje({novos: 0, abertos: 4, faltaValor: [{}]}, null).map(x => 'n' in x ? x.n : x.t).join('');
  assert.equal(semFila, 'Hoje entraram 0 contatos novos, 4 estão em aberto e 1 serviço fechado está sem valor.');
});

test('contatos por dia: 14 dias, hoje por último, entraram e fecharam', () => {
  const d = R13.entradasPorDia(leads, AGORA, 14);
  assert.equal(d.length, 14);
  assert.equal(d.at(-1).hoje, true);
  assert.equal(d.at(-1).entraram, 3);
  assert.equal(d.at(-1).fecharam, 2);
  assert.equal(d.reduce((s, x) => s + x.entraram, 0), leads.length);
});

test('frase do Painel e rótulo do período', () => {
  const p = R13.frasePeriodo({entradas: 13, ganhos: 4, faturamento: 2990}, R13.rotuloPeriodo('7'));
  assert.equal(p.map(x => 'n' in x ? x.n : x.t).join(''), 'Nos últimos 7 dias, entraram 13 contatos, 4 fecharam serviço e o caixa registrou 2990.');
  assert.ok(p.some(x => x.moeda && x.n === 2990), 'o faturamento sai como moeda na tela');
  assert.equal(R13.rotuloPeriodo('hoje'), 'Hoje');
  assert.equal(R13.rotuloPeriodo('xyz'), 'No período');
});

test('Hoje é a primeira aba e a tela de entrada', () => {
  const nav = html.match(/<nav class="ic-abas"[\s\S]*?<\/nav>/)[0];
  assert.deepEqual([...nav.matchAll(/data-view="(\w+)">([^<]+)</g)].map(m => m[2]), ['Hoje', 'Contatos', 'Funil', 'Clientes', 'Painel']);
  assert.match(pub('app.js'), /irPara\(atalho && !atalho\.hidden \? aba : 'hoje'\)/);
  for (const id of ['r13Heroi', 'r13Frase', 'r13Nums', 'r13Caixa', 'r13Valores', 'r13Grafico', 'r13Etapas', 'r13FrasePainel']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.ok(html.indexOf('id="r13Heroi"') < html.indexOf('id="hojeLista"'), 'o resumo vem antes da fila');
  assert.ok(html.indexOf('r13-resumo.js') < html.indexOf('r13.js"') && html.indexOf('rodada7.js') < html.indexOf('r13-resumo.js'), 'r13 carrega por último');
  assert.match(html, /href="r13\.css"/);
  assert.match(pub('sw.js'), /'r13\.css', 'r13-resumo\.js', 'r13\.js'/);
  assert.match(pub('sw.js'), /indycar-crm-v(1[6-9]|2[0-9])/);
});

test('valor do serviço fechado: Hoje, lista, funil e ficha', () => {
  assert.match(js, /data-lancar=/, 'botão "Lançar valor" na lista e no funil');
  assert.match(js, /celula = function/);
  assert.match(js, /cartaoKanban = function/);
  assert.match(js, /Falta o valor deste serviço/);
  assert.match(js, /patchLead\(l\.id, corpo\)/, 'grava pelo mesmo caminho da ficha (fila quando o servidor dorme)');
  assert.match(js, /'Desfazer'/, 'lançar valor pode ser desfeito');
  assert.match(js, /travaLead\(l\)/, 'contato de colega não é alterado');
  assert.match(js, /comCortesia/, 'cortesia grava a marca na observação');
  assert.match(js, /abrirValores\(\)/, 'gestor ainda lança vários de uma vez');
  assert.ok(!/wa\.me|api\.whatsapp|fetch\(/.test(js), 'r13 não fala com WhatsApp nem chama rede por fora do api()');
});

test('CSS: [hidden], sem borda grossa de um lado, toques de 44 px e celular sem rolagem lateral', () => {
  assert.match(css, /\[hidden\]\{display:none!important\}/);
  assert.ok(!/border-left:\s*[2-9]px|border-left-width:\s*[2-9]px/.test(css), 'sem borda grossa lateral');
  assert.match(css, /min-height:44px!important/);
  assert.match(css, /#tblLeads,#tblLeads tbody\{display:block;min-width:0!important/);
  assert.match(css, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/, 'barra de baixo com as 5 abas');
  assert.ok(!/fonts\.googleapis|font-family:\s*['"]?(Inter|DM Sans)/.test(css), 'só as fontes do padrão');
});
