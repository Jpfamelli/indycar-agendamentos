// Rodada 13B · passagens entre apps, velocidade da tela de entrada e "Desfazer" (o roteiro de navegador de ponta a
// ponta é scripts/qa-r13b-passagens.mjs, com o servidor de mentira).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ler = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const app = ler('../public/app.js');

function appsNa(pathname) {
  const raiz = { location: { pathname, origin: 'https://central.exemplo' } };
  raiz.globalThis = raiz;
  vm.runInNewContext(ler('../public/apps.js'), raiz);
  return raiz.IndyApps;
}

test('na Central, os links para os outros apps são da mesma origem e levam o cliente certo (telefone sem 55)', () => {
  const { LINKS } = appsNa('/comunicar/');
  const id = '00000000-0000-4000-8000-000000000001';
  assert.equal(LINKS.conversaTel('5512999990001'), 'https://central.exemplo/atendimento/?tel=12999990001');
  assert.equal(LINKS.clienteCrm(id, '5512999990001'), `https://central.exemplo/crm/?cliente=${id}&tel=12999990001`);
  assert.equal(LINKS.clienteAgenda(id, '(12) 99999-0001'), `https://central.exemplo/agenda/?cliente=${id}&tel=12999990001`);
});

test('a tela usa os links de apps.js e abre os outros apps NA MESMA JANELA', () => {
  assert.doesNotMatch(app, /target="_blank"/, 'nenhum link do Comunicar abre outra aba');
  assert.match(app, /function linkCliente\(app, c\)[\s\S]{0,200}LINKS\.clienteCrm\?\.\(c\.id, c\.telefone\)/);
  assert.match(app, /function linkConversa\(tel\) \{ return LINKS\.conversaTel\?\.\(tel\)/);
  assert.match(app, /href="\$\{esc\(linkCliente\('crm', c\)\)\}"/);
  assert.match(app, /href="\$\{esc\(linkCliente\('agenda', c\)\)\}"/);
});

test('chegando por link de outro app, vai direto ao destino (sem desenhar as Réguas antes) e cai nas Réguas se não achar', () => {
  assert.match(app, /const comLink = \[\.\.\.new URLSearchParams\(location\.search\)\.keys\(\)\]\.some/);
  assert.match(app, /if \(!comLink\) await route\('reguas'\);\n  await abrirPorLink\(\);\n  if \(!state\._vez\) await route\('reguas'\);/);
});

test('tela de entrada leve: Réguas não pedem os prazos por serviço e a projeção é pedida uma vez só', () => {
  assert.match(app, /async function carregarConfig\(vez, \{ comRegras = false \} = \{\}\)/);
  assert.match(app, /carregarConfig\(vez, \{ comRegras: true \}\)/);
  assert.equal((app.match(/comRegras: true/g) || []).length, 1, 'só Ajustes pede os prazos');
  const r4 = ler('../public/rodada4.js');
  assert.match(r4, /if \(!forcar && _projecaoNoAr\) return _projecaoNoAr;/);
});

test('apagar um prazo por serviço oferece "Desfazer", que cria a regra de novo com os mesmos dados', () => {
  assert.match(app, /toastAcao\('Regra apagada\.', 'Desfazer', async \(\) => \{/);
  assert.match(app, /api\('POST', '\/regras-retorno', \{ rotulo, palavras: \(palavras \|\| \[\]\)\.join\(', '\), meses, mensagem: mensagem \|\| '', ativo, ordem \}\)/);
});

test('mesmos nomes do CRM: "contato" e "funil", não "lead" na tela', () => {
  assert.doesNotMatch(ler('../public/rodada4.js'), /lead\(s\)/);
  assert.doesNotMatch(app, /leads\/pipeline/);
});
