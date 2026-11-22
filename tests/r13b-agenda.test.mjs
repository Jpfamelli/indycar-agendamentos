// Rodada 13B da Agenda: passagens entre apps, desfazer ao apagar, recado certo de leitura, Quadro enxuto e
// nada de pedido repetido. A ponta a ponta no navegador está em scripts/qa-r13b-passagens.mjs (servidor de mentira).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ler = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const app = ler('public/app.js');

/** Carrega public/apps.js como o navegador carregaria, numa página do endereço dado. */
function appsEm(href) {
  const u = new URL(href);
  const janela = { location: { href, origin: u.origin, pathname: u.pathname } };
  vm.runInNewContext(ler('public/apps.js'), { window: janela, globalThis: janela, self: janela, URL, ...janela }, { filename: 'apps.js' });
  return janela.IndyCarApps || globalThis.IndyCarApps;
}

test('na Central o Orçador é o /orcador/ do mesmo domínio (mesmo login, sem o Netlify antigo)', () => {
  const A = appsEm('https://indycar-agendamentos.onrender.com/agenda/');
  assert.equal(A.url('orcador', '?tel=5512991110002'), 'https://indycar-agendamentos.onrender.com/orcador/?tel=5512991110002');
  assert.equal(A.url('atendimento', '?tel=12991110002'), 'https://indycar-agendamentos.onrender.com/atendimento/?tel=12991110002');
  assert.equal(A.appDoLink('https://indycar-agendamentos.onrender.com/orcador/?tel=1'), 'orcador');
  // sozinha (fora da Central) continua o endereço de produção
  const B = appsEm('http://localhost:3011/');
  assert.match(B.url('orcador'), /indycar-orcador\.netlify\.app/);
});

test('Orçar leva carro, placa e serviço (o Orçador aceita no link) e descarta placa torta', () => {
  const r6 = ler('public/rodada6.js');
  const corpo = r6.slice(r6.indexOf('function linkNovoOrcamento'), r6.indexOf('async function blocoOrcamentoNaFicha'));
  assert.match(corpo, /p\.set\('carro', carro\)/);
  assert.match(corpo, /\^\[A-Z\]\{3\}\\d\[A-Z0-9\]\\d\{2\}\$/);
  assert.match(corpo, /p\.set\('servico', servico\)/);
});

test('apagar tem Desfazer: horário, cliente e espera somem na hora e só vão ao servidor depois de 8 s', () => {
  assert.ok(app.includes('function apagarComDesfazer(id, msg, apagar)'));
  assert.match(app, /const t = setTimeout\(ir, 8000\)/);
  assert.match(app, /rotulo: 'Desfazer'/);
  for (const rota of ['/agendamentos/${id}', '/clientes/${id}', '/espera/${id}']) {
    assert.ok(app.includes(`apagarComDesfazer(id, `) && app.includes(`() => api('DELETE', \`${rota}\`)`), rota);
  }
  assert.ok(!app.includes("confirm('Excluir este agendamento?')"));
  assert.ok(!app.includes("confirm('Apagar esta espera de vez?')"));
  // uma repintura no meio da espera não traz o item de volta
  assert.ok(app.includes('if (state._apagando.size) esconderApagando(view);'));
});

test('servidor fora numa LEITURA não diz "não conseguiu salvar"', () => {
  assert.ok(app.includes("new Error(method === 'GET' ? ERRO_FORA_LER : ERRO_FORA)"));
  assert.match(app, /const ERRO_FORA_LER = '[^']*não conseguiu carregar/);
});

test('Pátio: pedidos ao mesmo tempo esperam o que já está a caminho (o Quadro pedia os mesmos ids 2 vezes)', () => {
  const corpo = app.slice(app.indexOf('async function patioDe'), app.indexOf('const saida = {};', app.indexOf('async function patioDe')));
  assert.match(corpo, /if \(_patioVoo\) await _patioVoo/);
  assert.match(corpo, /_patioVoo = api\('GET', '\/patio\/agendamentos/);
});

test('Quadro enxuto: sem "na espera" (a aba já mostra), sem Imprimir (a folha do dia mora na Agenda) e sem o interruptor do Pátio', () => {
  const r6b = ler('public/rodada6b.js'), r6c = ler('public/rodada6c.js'), r7 = ler('public/rodada7.js');
  assert.ok(!r6b.includes('id="qdEspera"'));
  assert.ok(!r6b.includes('Teclas: ← → muda o dia'));
  assert.ok(!r6c.includes('id="qdImprimir"'));
  assert.ok(r6c.includes('id="qdCopiar"'));
  assert.ok(!/barra\.appendChild\(interruptorAuto\(\)\)/.test(r7));
  // a recepção continua com o "entrada do Pátio sozinha"
  assert.ok(app.includes('data-r7-auto'));
  // botões do cartão do Quadro sem emoji
  assert.ok(!ler('public/rodada6d.js').includes('🧾 Orçar'));
  assert.ok(!r7.includes("'🔧 Entrada'"));
});
