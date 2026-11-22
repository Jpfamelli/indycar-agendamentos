// Casa, rodada 13B: as passagens da Central para os apps (Orçador em /orcador/, sem outro login), os mesmos nomes do
// CRM e "Pede atenção" com 5 e "Ver mais". Sem rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../casa/logica.js');
const L = globalThis.CasaLogica;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (f) => readFileSync(join(RAIZ, f), 'utf8');
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1').replace(/<!--[\s\S]*?-->/g, '');
const ID = '00000000-0000-4000-8000-000000000021';
const NETLIFY = { patio: 'https://indycar-patio.netlify.app', orcador: 'https://indycar-orcador.netlify.app' };

test('Orçador servido pela Central: todo link da Casa vai para /orcador/ (mesmo endereço, mesmo login)', () => {
  const b = L.bases(NETLIFY, false, true);
  assert.equal(b.orcador, '/orcador/');
  assert.equal(L.ORCADOR_NA_CENTRAL_URL, '/orcador/');
  const l = L.links(b);
  assert.equal(l.orcamento(ID), '/orcador/#/historico/' + ID, 'o orçamento certo');
  assert.equal(l.orcamentosLista(), '/orcador/#/historico');
  assert.equal(l.novoOrcamento({ telefone: '12 99123-4567', nome: 'Ana' }), '/orcador/?tel=5512991234567&nome=Ana', 'orçamento novo já com o cliente');
  assert.equal(L.appDoLink('/orcador/#/historico/' + ID, 'https://central.test/', b), 'orcador', 'abre na aba do Orçador');
  assert.equal(L.voltarSeguro('/orcador/#/historico/' + ID), '/orcador/#/historico/' + ID, 'depois do login volta para o Orçador');
});

test('sem o Orçador na Central (ou com a troca para o Atendimento), vale o que valia antes', () => {
  assert.equal(L.bases(NETLIFY).orcador, 'https://indycar-orcador.netlify.app/');
  assert.equal(L.bases(NETLIFY, false, 'sim').orcador, 'https://indycar-orcador.netlify.app/', 'só true liga');
  assert.equal(L.bases(NETLIFY, true, true).orcador, '/atendimento/?aba=orcador', 'a chave do Atendimento continua mandando');
});

test('aviso antigo com o endereço do Orçador no Netlify abre o mesmo orçamento em /orcador/', () => {
  const b = L.bases(NETLIFY, false, true);
  const o = 'https://central.test/';
  assert.equal(L.linkDaNotificacao({ app: 'orcador', link: 'https://indycar-orcador.netlify.app/#/historico/' + ID }, b, o), 'https://central.test/orcador/#/historico/' + ID);
  assert.equal(L.linkDaNotificacao({ app: 'orcador', link: 'https://indycar-orcador.netlify.app/?tel=5512991234567' }, b, o), 'https://central.test/orcador/?tel=5512991234567');
  assert.equal(L.linkDaNotificacao({ app: 'orcador', link: '#/historico/' + ID }, b, o), 'https://central.test/orcador/#/historico/' + ID);
  assert.equal(L.linkDaNotificacao({ app: 'orcador', link: 'https://outro-site.test/#/x' }, b, o), '/orcador/', 'site de fora não passa');
  // sem o Orçador na Central, o endereço do Netlify continua sendo dele
  assert.equal(L.linkDaNotificacao({ app: 'orcador', link: 'https://indycar-orcador.netlify.app/#/historico/' + ID }, L.bases(NETLIFY), o), 'https://indycar-orcador.netlify.app/#/historico/' + ID);
});

test('a Casa lê "orcadorNaCentral" da configuração e o servidor manda o valor', () => {
  assert.match(semComentarios(ler('casa/casa.js')), /bases = L\.bases\(cfg\.apps, undefined, cfg\.orcadorNaCentral === true\)/);
  assert.match(semComentarios(ler('central.js')), /orcadorNaCentral: orcadorLocal\(\),/);
});

test('mesmos nomes do CRM: "contatos novos sem responsável" (não "sem dono") nos textos da Casa', () => {
  const p = semComentarios(ler('casa/painel.js'));
  assert.match(p, /'contatos sem responsável'/);   // R13C: a regra virou a do CRM (em aberto, qualquer data): sai o "novos"
  for (const f of ['casa/painel.js', 'casa/logica.js', 'casa/logica5.js', 'casa/mes.js', 'casa/index.html']) {
    const textos = [...semComentarios(ler(f)).matchAll(/'([^'\n]*)'|`([^`\n]*)`|>([^<>\n]+)</g)].map((m) => m[1] || m[2] || m[3] || '');
    assert.ok(!textos.some((t) => / sem dono\b/.test(t)), f + ': "sem dono" na tela');
  }
});

test('"Pede atenção agora": 5 visíveis e "Ver mais" com a conta do resto (e "Ver menos")', () => {
  const html = ler('casa/index.html');
  assert.match(html, /<button id="atencaoMais" class="btn-link atencao-mais" type="button" aria-controls="atencaoLista" aria-expanded="false" hidden>/);
  const p = semComentarios(ler('casa/painel.js'));
  assert.match(p, /const ATENCAO_VISIVEIS = 5;/);
  assert.match(p, /idx >= ATENCAO_VISIVEIS && !atencaoAberta \? ' hidden' : ''/);
  assert.match(p, /`Ver mais \$\{escondidos\} \$\{escondidos === 1 \? 'aviso' : 'avisos'\}`/);
  assert.match(p, /if \(e\.target\.closest\('#atencaoMais'\)\) alternarAtencao\(\);/);
  assert.match(ler('casa/r13.css'), /\.atencao-mais \{[^}]*min-height: 44px;/);
});

test('tirar a meta tem "Desfazer" (grava a meta de antes de volta, sem novo "Desfazer")', () => {
  const m = semComentarios(ler('casa/mes.js'));
  assert.match(m, /const antes = meta;/);
  assert.match(m, /if \(!v && antes > 0 && !desfazendo\) C\.toast\('Meta do mês tirada\.', 'ok', \{ rotulo: 'Desfazer', fazer: \(\) => guardar\(String\(antes\), \{ desfazendo: true \}\) \}\);/);
});
