// Casa, rodada 11: o topo comum (.ic-topo), a Casa enxuta e o ponto único do Orçador dentro do Atendimento. Sem rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../casa/logica.js');
await import('../casa/logica2.js');
await import('../casa/logica4.js');
const L = globalThis.CasaLogica, N = globalThis.CasaLogica4;
const CASA = join(dirname(fileURLToPath(import.meta.url)), '..', 'casa');
const ler = (f) => readFileSync(join(CASA, f), 'utf8');
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1').replace(/<!--[\s\S]*?-->/g, '');

test('topo comum: .ic-topo com logo, "IndyCar Central" e volta para a Central; indycar.css antes do CSS da Casa', () => {
  const html = ler('index.html');
  assert.match(html, /<header class="ic-topo">\s*<a class="ic-marca" href="\/" title="Voltar para a Central">\s*<img src="\/casa\/logo\.png" alt="" width="32" height="32" \/>\s*<span class="ic-nome">IndyCar <b>Central<\/b><\/span>/);
  assert.ok(html.indexOf('/casa/indycar.css') > 0 && html.indexOf('/casa/indycar.css') < html.indexOf('/casa/casa.css'), 'indycar.css vem antes');
  assert.doesNotMatch(html, /class="topo"|topo-marca|topo-nome/);
  assert.ok(ler('sw.js').includes("'/casa/indycar.css'") && ler('sw.js').includes("'/casa/r11.css'"));
});

test('Casa enxuta: saudação curta, avisos, "Pede atenção agora" e os apps; nada de listas, tarefas, ajuda, clima ou visão do dono', () => {
  const html = ler('index.html');
  const casa = html.slice(html.indexOf('<div id="casa"'), html.indexOf('<!-- ======================= BUSCA'));
  for (const id of ['hoje', 'ola', 'nomeCurto', 'avisoRede', 'avisoApps', 'saudeSist', 'atencao', 'gradeApps', 'bSino', 'bBusca']) assert.match(casa, new RegExp(`id="${id}"`), id);
  for (const fora of ['agora', 'cPatio', 'cOrc', 'cConversas', 'cHoje', 'cLeads', 'cMeuDia', 'visaoDono', 'manha', 'tTarefas', 'acoes', 'clima', 'bAjuda', 'seletorVisao', 'vivoTxt', 'sinoAtencao']) {
    assert.doesNotMatch(casa, new RegExp(`id="${fora}"`), fora + ' saiu');
  }
  assert.doesNotMatch(casa, /Quem conhece, Indyca|Comece por aqui|Atalhos|Seus apps/);
  for (const f of ['manha.js', 'tarefas.js', 'atalhos.js']) assert.ok(!existsSync(join(CASA, f)), f + ' saiu');
});

test('cartão de app: o número que importa (painel.js preenche) e a frase curta quando não há número', () => {
  const c = semComentarios(ler('casa.js'));
  assert.match(c, /<span class="app-num" data-app-num="\$\{esc\(a\.num\)\}" hidden><\/span>/);   // rodada 20: o cartão único "CRM e Atendimento" mostra o número das conversas
  assert.match(c, /data-app-desc="\$\{esc\(a\.num\)\}" data-padrao="\$\{esc\(a\.desc\)\}"/);
  const p = semComentarios(ler('painel.js'));
  for (const t of ['conversas esperando', 'carros no pátio', 'orçamentos esperando resposta', 'horários hoje', 'contatos sem responsável']) assert.ok(p.includes(t), t);
  assert.doesNotMatch(p, /agora-cartao|desenharHoje|desenharDono|carregarChegadas/);
});

test('Orçador dentro do Atendimento: um ponto só (ORCADOR_NO_ATENDIMENTO) troca o cartão, a busca e os links', () => {
  assert.equal(L.ORCADOR_NO_ATENDIMENTO, false, 'hoje o Orçador ainda mora no endereço dele');
  assert.match(L.bases().orcador, /^https:\/\/indycar-orcador\.netlify\.app\/$/);
  const b = L.bases(null, true);
  assert.equal(b.orcador, '/atendimento/?aba=orcador');
  assert.equal(b.orcador, L.ORCADOR_NO_ATENDIMENTO_URL);
  const l = L.links(b);
  assert.equal(l.novoOrcamento({ telefone: '12 99123-4567', nome: 'Ana' }), '/atendimento/?aba=orcador&tel=5512991234567&nome=Ana');
  assert.equal(l.novoOrcamento(), '/atendimento/?aba=orcador');
  assert.equal(L.appDoLink(b.orcador, 'http://central.local/', b), 'atendimento', 'abre na aba do Atendimento');
  assert.equal(L.links(L.bases()).novoOrcamento({ telefone: '12991234567' }), 'https://indycar-orcador.netlify.app/?tel=5512991234567');
  assert.equal((semComentarios(ler('logica.js')).match(/ORCADOR_NO_ATENDIMENTO\s*=/g) || []).length, 1, 'um lugar só');
});

test('aviso de tarefas vencidas: leva para a aba Tarefas do Atendimento', () => {
  assert.deepEqual(N.acaoDoAviso({ tipo: 'tarefas_vencidas' }, L.bases(), 'http://central.local/'), { acao: 'abrir', url: '/atendimento/?tarefas' });
});

test('r11.css: [hidden] com !important, só as fontes do padrão e sem gradiente', () => {
  const css = ler('r11.css');
  assert.match(css, /\[hidden\] \{ display: none !important; \}/);
  assert.doesNotMatch(css, /gradient|font-family:\s*['"]?(Inter|Roboto)/);
  assert.match(css, /var\(--ic-titulo\)/);
});
