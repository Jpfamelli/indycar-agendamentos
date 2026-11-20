// Casa, rodada 9 (R9-casa): lógica nova e conferências estáticas. Sem rede, sem banco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../casa/logica.js');
await import('../casa/logica2.js');
await import('../casa/logica4.js');
const L = globalThis.CasaLogica, M = globalThis.CasaLogica2, N = globalThis.CasaLogica4;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CASA = join(RAIZ, 'casa');
const ler = (f) => readFileSync(join(CASA, f), 'utf8');
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1').replace(/<!--[\s\S]*?-->/g, '');
/** textos que vão para a tela: literais com espaço (frases) dos .js e o texto do index.html */
function frasesDaTela() {
  const out = [];
  for (const f of readdirSync(CASA).filter((x) => x.endsWith('.js') && x !== 'sw.js')) {
    const s = semComentarios(ler(f));
    for (const m of s.matchAll(/'([^'\n]*\s[^'\n]*)'|`([^`]*\s[^`]*)`|"([^"\n]*\s[^"\n]*)"/g)) out.push([f, m[1] || m[2] || m[3]]);
  }
  const html = semComentarios(ler('index.html'));
  for (const m of html.matchAll(/>([^<>]+)</g)) if (m[1].trim()) out.push(['index.html', m[1]]);
  for (const m of html.matchAll(/(?:aria-label|title|placeholder)="([^"]+)"/g)) out.push(['index.html', m[1]]);
  for (const f of readdirSync(CASA).filter((x) => x.endsWith('.css'))) for (const m of semComentarios(ler(f)).matchAll(/content:\s*'([^']*)'/g)) out.push([f, m[1]]);
  return out;
}

test('aviso da Casa: "ok"/"err" não viram 0 ms (o aviso sumia na hora); com botão fica 6 s; número manda, até 20 s', () => {
  assert.equal(L.tempoDoAviso(), 3200);
  assert.equal(L.tempoDoAviso('ok'), 3200);
  assert.equal(L.tempoDoAviso('err'), 6000);
  assert.equal(L.tempoDoAviso(undefined, true), 6000);
  assert.equal(L.tempoDoAviso(1200), 1200);
  assert.equal(L.tempoDoAviso(9000, true), 9000);
  assert.equal(L.tempoDoAviso(999999), 20000);
  const casa = ler('casa.js');
  assert.match(casa, /L\.tempoDoAviso\(opcao, !!acao\)/);
  assert.match(casa, /t\.dataset\.tom = opcao === 'err'/);
  assert.doesNotMatch(ler('tarefas.js'), /desfazerTimer/, 'o "Desfazer" usa o relógio único do aviso');
});

test('sino: "marcar todas como lidas" só marca o que está na tela (filtro de app, busca, sem adiados)', () => {
  const vis = [{ id: 'a', app: 'agenda' }, { id: 'b', app: 'crm' }, { id: 'c', app: 'agenda', lida_em: '2026-11-19T10:00:00Z' }, { id: '', app: 'agenda' }, null];
  assert.deepEqual(M.idsParaLerTodas(vis), ['a', 'b']);
  assert.deepEqual(M.idsParaLerTodas(vis, 'agenda'), ['a']);
  assert.deepEqual(M.idsParaLerTodas([], 'crm'), []);
  assert.deepEqual(M.idsParaLerTodas(undefined), []);
  const sino = semComentarios(ler('sino.js'));
  assert.match(sino, /M2\(\)\.idsParaLerTodas\(visiveis\(\), filtro\)/);
});

test('sino: carregando, erro com "tentar de novo" e aviso sozinho sem a caixinha "1 aviso ·"', () => {
  const sino = semComentarios(ler('sino.js'));
  assert.match(sino, /Carregando os avisos/);
  assert.match(sino, /Não consegui ler os avisos agora/);
  assert.match(sino, /data-sino-de-novo/);
  assert.match(sino, /if \(itens\.length === 1\) \{ soltos\.push/);
  assert.doesNotMatch(sino, /'aviso · '/);
  assert.match(sino, /<span class="n-nova">não lido<\/span>/);
});

test('tarefas: carregando, erro com "tentar de novo", trava do Criar, título vazio explica, título editável pelo teclado', () => {
  const t = semComentarios(ler('tarefas.js'));
  assert.match(t, /Carregando suas tarefas/);
  assert.match(t, /Não consegui ler as tarefas agora/);
  assert.match(t, /data-tarefas-de-novo/);
  assert.match(t, /if \(criando\) return;/);
  assert.match(t, /botao\.disabled = true/);
  assert.match(t, /Escreva o que precisa ser feito/);
  assert.match(t, /<button type="button" class="t-texto" data-editar=/);
  assert.doesNotMatch(t, /<span class="t-texto" data-editar=/);
});

test('meta do mês: aceita como a pessoa escreve (R$ 80.000, 80 mil, 80k)', () => {
  for (const [txt, v] of [['80000', 80000], ['80.000', 80000], ['R$ 80.000', 80000], ['R$ 80.000,00', 80000], ['80 mil', 80000], ['80k', 80000], ['1,5 milhão', 1500000], ['95.500,50', 95501]]) assert.equal(M.valorDaMeta(txt), v, txt);
  assert.equal(M.valorDaMeta(''), '');
  assert.equal(M.valorDaMeta('   '), '');
  assert.equal(M.valorDaMeta('0'), '');
  assert.ok(Number.isNaN(M.valorDaMeta('abc')));
  assert.ok(Number.isNaN(M.valorDaMeta('-5')));
  assert.ok(Number.isNaN(M.valorDaMeta('999999999')));
  assert.match(ler('painel.js'), /window\.CasaLogica2\.valorDaMeta\(v\)/);
});

test('busca: contagem certa quando só acha pessoas (antes "2 resultados em 0 sistema")', () => {
  assert.equal(N.dicaDaBusca(0, 2, 0), '2 pessoas achadas');
  assert.equal(N.dicaDaBusca(0, 1, 0), '1 pessoa achada');
  assert.equal(N.dicaDaBusca(3, 0, 2), '3 resultados em 2 sistemas');
  assert.equal(N.dicaDaBusca(1, 0, 1), '1 resultado em 1 sistema');
  assert.equal(N.dicaDaBusca(4, 1, 3), '1 pessoa · 4 resultados em 3 sistemas');
  assert.equal(N.dicaDaBusca(0, 0, 0), '');
});

test('busca: sem a lista falsa de opções (axe acusava erro crítico); o item marcado é anunciado', () => {
  const b = semComentarios(ler('busca.js'));
  assert.doesNotMatch(b, /role="option"|aria-selected/);
  const html = ler('index.html');
  assert.doesNotMatch(html, /role="listbox"/);
  assert.match(html, /id="buscaAnuncio" class="sr-only" aria-live="polite"/);
  assert.match(html, /id="buscaDica" class="busca-dica" aria-live="polite"/);
  assert.match(b, /\$\('#buscaAnuncio'\)/);
  assert.match(b, /'orcador', 'ads'\]\.filter/, 'o Tráfego aparece no "Ir para"');
});

test('ficha: erro dos links em português, sem "Failed to fetch", com tentar de novo', () => {
  assert.equal(N.erroDosLinks(new TypeError('Failed to fetch')), 'A Central não respondeu. Tente de novo em instantes.');
  assert.equal(N.erroDosLinks(new Error('falhou')), 'A Central não respondeu. Tente de novo em instantes.');
  assert.equal(N.erroDosLinks(new Error('Muitos pedidos seguidos. Espere um minuto.')), 'Muitos pedidos seguidos. Espere um minuto.');
  assert.equal(N.erroDosLinks(new Error('x'), false), 'Sem internet agora. Confira a conexão e tente de novo.');
  assert.ok(N.erroDosLinks(new Error('a'.repeat(300))).length <= 140);
  assert.match(ler('ficha.js'), /N\.erroDosLinks\(e, navigator\.onLine\)[\s\S]{0,120}data-ficha-links>tentar de novo/);
});

const GRAVES = ['whatsapp-sem-config', 'codewords-chave-recusada', 'codewords-fora', 'whatsapp-desconectado', 'whatsapp-sem-receber', 'sincronia-parada', 'webhook-fora',
  'atendimento-fora', 'agenda-fora', 'comunicar-fora', 'crm-fora', 'orcador-fora', 'site-fora', 'exclusao-em-massa', 'admin-novo', 'anthropic-chave-recusada',
  'anthropic-sem-credito', 'anthropic-fora', 'comunicar-carteiro-parado', 'comunicar-fila-parada', 'patio-avisos-parados', 'backup-faltando', 'backup-ensaio-falhou'];

test('Vigia na Casa: os 23 avisos graves têm título curto e o que fazer (nada do texto cru como título)', () => {
  assert.equal(Object.keys(N.FAIXA_VIGIA).length, 23);
  for (const c of GRAVES) {
    const [a] = N.faixaDoVigia({ graves: [{ codigo: c, resumo: 'texto comprido do vigia '.repeat(30), dias: 2 }] });
    assert.ok(a.titulo.length > 5 && a.titulo.length <= 45, c + ': título curto → ' + a.titulo);
    assert.ok(a.passo.length > 20, c + ': tem o que fazer');
    assert.doesNotMatch(a.titulo + a.passo, /—|ve[ií]culo|lead|Configurações › Integrações|Configurações › IA/i, c);
    assert.equal(a.tempo, 'há 2 dias');
    assert.ok(a.detalhe.length <= 160, 'o texto do Vigia vira detalhe curto');
  }
  for (const c of ['whatsapp-sem-config', 'codewords-chave-recusada', 'sincronia-parada', 'webhook-fora']) assert.equal(N.faixaDoVigia({ graves: [{ codigo: c }] })[0].abrir.q, '?aba=integracoes', c);
  assert.equal(N.faixaDoVigia({ graves: [{ codigo: 'codewords-chave-recusada', dias: 1 }] })[0].tempo, 'há 1 dia');
  const [x] = N.faixaDoVigia({ graves: [{ codigo: 'codigo-novo-qualquer', resumo: '' }] });
  assert.equal(x.titulo, 'O monitor achou um problema. Avise o administrador');
  assert.equal(x.abrir, null);
  assert.deepEqual(N.faixaDoVigia(null), []);
  assert.deepEqual(N.faixaDoVigia({ graves: 'x' }), []);
});

test('Vigia parado: até 47 h em horas; de 48 h em diante em dias; sem data diz que não tem registro', () => {
  const p = (conf) => N.faixaDoVigia({ graves: [], vigia_parado: true, gerado_em: '2026-11-19T12:00:00Z', vigia_conferiu_em: conf }).at(-1).titulo;
  assert.equal(p('2026-11-18T00:00:00Z'), 'O Vigia não confere há 36 horas');
  assert.equal(p('2026-11-19T11:00:00Z'), 'O Vigia não confere há 1 hora');
  assert.equal(p('2026-11-17T12:00:00Z'), 'O Vigia não confere há 2 dias');
  assert.equal(p('2026-11-12T00:00:00Z'), 'O Vigia não confere há 7 dias');
  assert.equal(p(null), 'O Vigia está sem registro da última conferência');
});

test('saúde: a faixa do Vigia usa faixaDoVigia, selo "Urgente" com ícone e palavra', () => {
  const s = semComentarios(ler('saude.js'));
  assert.match(s, /N\.faixaDoVigia\(vigia\)/);
  assert.match(s, /class="vigia-selo"><span aria-hidden="true">⚠<\/span> Urgente/);
  assert.doesNotMatch(s, /aviso\.resumo \|\|/, 'o texto cru não é mais o título');
});

test('atalhos: 7 abre o Tráfego, e a ajuda diz isso', () => {
  assert.equal(M.ATALHOS_NUMERO[7], 'ads');
  assert.equal(M.ATALHOS_NUMERO[6], 'orcador');
  assert.match(semComentarios(ler('atalhos.js')), /\/\^\[1-7\]\$\/\.test\(k\)/);
  const ajuda = L.AJUDA_ATALHOS.find(([k]) => /^1 … /.test(k));
  assert.equal(ajuda[0], '1 … 7');
  assert.match(ajuda[1], /7 Tráfego/);
  for (let i = 1; i <= 7; i++) assert.ok(L.APPS[M.ATALHOS_NUMERO[i]], 'app da tecla ' + i);
});

test('textos da tela: sem travessão e sem "lead" (palavra que a oficina não usa)', () => {
  const ruins = [];
  for (const [f, t] of frasesDaTela()) {
    if (/—/.test(t)) ruins.push(f + ': travessão em "' + t.slice(0, 80) + '"');
    if (f !== 'index.html' && /[;{}]|=>| = /.test(t.replace(/\$\{[^}]*\}/g, ''))) continue;   // pedaço de código entre aspas, não frase
    if (/(?<![.\w$])leads?\b(?![_:.?])/i.test(t.replace(/\$\{[^}]*\}/g, ''))) ruins.push(f + ': lead em "' + t.slice(0, 80) + '"');
  }
  assert.deepEqual(ruins, []);
  assert.match(ler('index.html'), /<span class="agora-rotulo">Contatos novos<\/span>/);
  assert.equal(L.GRUPOS_BUSCA.find((g) => g.k === 'leads').nome, 'Contatos (CRM)');
});

test('"não sei" é "sem dado": cartão com erro e conversão sem base não mostram traço', () => {
  const p = semComentarios(ler('painel.js'));
  assert.match(p, /num: 'sem dado'/);
  assert.match(p, /v === null \? 'sem dado'/);
  assert.match(p, /classList\.toggle\('num-texto'/);
  assert.doesNotMatch(ler('index.html'), /data-num>—</);
});

test('"Ontem e amanhã": o bloco da manhã não repete a saudação', () => {
  assert.match(ler('index.html'), /<h2 id="manhaTitulo" class="atencao-titulo">Ontem e amanhã<\/h2>/);
  assert.match(semComentarios(ler('manha.js')), /\$\('#manhaTitulo'\)\.textContent = 'Ontem e amanhã'/);
});

test('acessibilidade: abas da visão com setas, ajuda prende o Tab, relógio não fala a cada 5 s, filtro de hoje dentro do item', () => {
  const html = ler('index.html');
  assert.match(html, /role="tab" id="abaOperacao"[^>]*aria-controls="visaoOperacao" tabindex="0"/);
  assert.match(html, /role="tab" id="abaDono"[^>]*aria-controls="visaoDono" tabindex="-1"/);
  assert.match(html, /id="visaoDono" class="dono" role="tabpanel" aria-labelledby="abaDono"/);
  assert.doesNotMatch(html, /class="vivo" aria-live/);
  assert.match(html, /id="vivoAviso" class="sr-only" role="status"/);
  const p = semComentarios(ler('painel.js'));
  assert.match(p, /\$\('#seletorVisao'\)\.onkeydown/);
  assert.match(p, /e\.key === 'ArrowRight'/);
  assert.match(p, /<li class="filtro-hoje"><div class="filtro-hoje-grupo" role="group"/);
  assert.match(p, /class="tabela-rolavel" tabindex="0" role="region"/);
  assert.match(p, /aria-label="Orçar: criar orçamento/);
  assert.match(semComentarios(ler('atalhos.js')), /if \(aberta && e\.key === 'Tab'\)/);
  assert.match(html, /aria-label="Buscar telefone, nome ou placa em todos os sistemas"/);
  assert.match(html, /<kbd class="kbd-css" aria-hidden="true" data-tecla="Ctrl K"><\/kbd>/);
});

test('fontes da casa: servidas pela Central, sem Google; @font-face para cada arquivo; no cache offline', () => {
  const html = ler('index.html');
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/);
  const css = ler('r9.css'), sw = ler('sw.js');
  for (const f of ['archivo-variavel', 'barlow-condensed-600', 'barlow-condensed-700', 'barlow-condensed-800-italic']) {
    assert.ok(existsSync(join(CASA, f + '.woff2')), f);
    assert.match(css, new RegExp(`url\\('/casa/${f}\\.woff2'\\)`), f + ' no @font-face');
    assert.ok(sw.includes(`'/casa/${f}.woff2'`), f + ' no service worker');
  }
  assert.match(ler('casa.css'), /--f: 'Archivo'/);
  for (const f of readdirSync(CASA).filter((x) => x.endsWith('.css'))) assert.doesNotMatch(ler(f), /'Inter'|Roboto|Fraunces|Geist|Plus Jakarta|Space Grotesk/, f);
  assert.ok(Number(/indycar-casa-v(\d+)/.exec(sw)[1]) >= 12);
  assert.ok(sw.includes("'/casa/r9.css'"));
});

test('visual: fundo liso, sem barra colorida de lado, barra de faturamento sem degradê; grave sempre com palavra', () => {
  const css = semComentarios(ler('r9.css'));
  assert.match(css, /body \{ background: var\(--bg\); \}/);
  assert.match(css, /\.agora-cartao::before \{ content: none;/);
  assert.match(css, /\.barra-fill \{ background: var\(--cor-dado\); \}/);
  assert.doesNotMatch(css, /gradient/);
  assert.match(css, /--cor-grave: #ff4d5e/); assert.match(css, /--cor-grave: #c20f22/);
  assert.match(semComentarios(ler('painel.js')), /\$\{b\.dia === hojeB \? 'hoje' :/);
  assert.match(semComentarios(ler('painel.js')), /a-selo-3"><span aria-hidden="true">⚠<\/span> Urgente/);
});

test('sino: botões ⏱ e ✓ com 44 px (antes herdavam 100% e espremiam o aviso num terço); no celular é folha de altura inteira', () => {
  const css = semComentarios(ler('r9.css'));
  assert.match(css, /\.lista-notif li \.notif-adiar, \.lista-notif li \.notif-ler \{ width: 44px; flex: 0 0 44px;/);
  assert.match(css, /\.painel-topo > strong \{ flex: 1 1 auto; \}/);
  const m = /@media \(max-width: 520px\) \{\s*\.painel-sino \{([^}]*)\}/.exec(css);
  assert.ok(m, 'regra do celular para o sino');
  assert.match(m[1], /bottom: 0/); assert.match(m[1], /width: 100%/);
  assert.match(css, /\.sino-filtros \{ flex-wrap: nowrap; overflow-x: auto;/);
});

test('menu do perfil: foco na primeira opção ao abrir, setas/Home/End andam, Tab fecha; avatar avisa que abre menu', () => {
  const c = semComentarios(ler('casa.js'));
  assert.match(c, /const primeiro = m\.querySelector\('\[role="menuitem"\]'\); if \(primeiro\) primeiro\.focus\(\);/);
  assert.match(c, /\$\('#menuPerfil'\)\.addEventListener\('keydown'/);
  assert.match(c, /e\.key === 'ArrowDown'/);
  assert.match(c, /if \(e\.key === 'Tab'\) \{ fecharMenus\(\); return; \}/);
  assert.match(ler('index.html'), /id="bPerfil"[^>]*aria-haspopup="menu"/);
});

test('app instalado: barra na cor do topo (escura, como a meta theme-color) e descrição com o Tráfego', () => {
  const m = JSON.parse(ler('manifest.json'));
  const meta = /<meta name="theme-color" content="([^"]+)"/.exec(ler('index.html'))[1];
  assert.equal(m.theme_color, meta);
  assert.equal(m.theme_color, '#070a14');
  assert.match(m.description, /Tráfego/);
});

test('visão do dono vazia: gráfico de 7 dias explica o vazio e a projeção não diz "fecha em R$ 0,00"', () => {
  const p = semComentarios(ler('painel.js'));
  assert.match(ler('index.html'), /<p id="donoBarrasVazio" class="vazio-mini" hidden>Nenhum fechamento com valor nos últimos 7 dias/);
  assert.match(p, /vazio7\.hidden = bs\.some\(\(b\) => b\.valor > 0\)/);
  assert.match(p, /Ainda sem faturamento marcado neste mês/);
  assert.match(semComentarios(ler('r9.css')), /\.conv-linha b \{ white-space: nowrap; \}/);
});

test('sair: buscas recentes (nome e telefone de cliente) e avisos adiados saem do aparelho; tema e e-mail lembrado ficam', () => {
  const s = semComentarios(ler('casa.js'));
  const lista = s.match(/LS_DA_PESSOA = \[([^\]]*)\]/);
  assert.ok(lista, 'lista do que é da pessoa');
  assert.match(lista[1], /'indycar_central_buscas'/);
  assert.match(lista[1], /'indycar_central_sino_adiados'/);
  assert.doesNotMatch(lista[1], /indycar_tema|indycar_central_email/);
  assert.match(ler('busca.js'), /LS_RECENTES = 'indycar_central_buscas'/, 'a chave da busca é a mesma');
  assert.match(ler('sino.js'), /LS_ADIADOS = 'indycar_central_sino_adiados'/, 'a chave do sino é a mesma');
  const sair = s.slice(s.indexOf('async function sair('), s.indexOf('async function depoisDoLogin('));
  assert.match(sair, /esquecerPessoa\(\)/, 'o botão Sair esquece');
  const saiuFora = s.slice(s.indexOf("evento === 'SIGNED_OUT'"), s.indexOf("evento === 'SIGNED_OUT'") + 200);
  assert.match(saiuFora, /esquecerPessoa\(\)/, 'saiu em outra aba/app também esquece');
});

test('cartões do Agora vazios: dica quebra linha (grade, sem nowrap) e coluna do cartão nunca passa da largura', () => {
  const css = ler('r9.css');
  assert.match(css, /\.agora-cartao \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.agora-lista li\.vazio-ensina \{ display: grid;/);
  assert.match(css, /\.agora-lista li\.vazio-ensina span \{ white-space: normal;/);
});

test('mecânico sem carro: texto dos carros dele (não o da oficina inteira, nem o "+ Nova entrada" que ele não tem)', () => {
  const v = M.VAZIOS.cPatioMeus;
  assert.ok(v && v.texto && v.dica);
  assert.match(v.texto, /para você/);
  assert.doesNotMatch(v.texto + v.dica, /Nova entrada|—/);
  const p = semComentarios(ler('painel.js'));
  assert.match(p, /vazio: V\.soMeusCarros \? 'cPatioMeus' : 'cPatio'/);
  assert.match(p, /VAZIOS\[vazio \|\| el\.id\]/);
});

test('listas dos cartões: coluna minmax(0, 1fr) (valor e tempo não saem do cartão) e nome desce de linha no celular', () => {
  const css = ler('r9.css');
  assert.match(css, /\.agora-lista \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /@media \(max-width: 520px\) \{ \.agora-lista \.linha \.l-a \{ white-space: normal;/);
});

test('gráfico de 7 dias: valor curto em cima da barra (cabe nos 40 px do celular), vazio quando o dia não tem valor', () => {
  assert.deepEqual([0, null, 850, 999.6, 1750, 12500, 1234567].map(N.rotuloDaBarra), ['', '', '850', '1 mil', '1,8 mil', '12,5 mil', '1,2 mi']);
  assert.match(semComentarios(ler('painel.js')), /rotuloDaBarra\(b\.valor\)/);
});

test('ligações entre sistemas: resumo diz "registros soltos para arrumar" (não "casos em 1 tipo") e explica o que é solto', () => {
  assert.equal(N.textoDasLigacoes({ total: 3, tipos: 1, alta: 0 }), '3 registros soltos para arrumar');
  assert.equal(N.textoDasLigacoes({ total: 1, tipos: 1, alta: 1 }), '1 registro solto para arrumar · 1 assunto grave');
  assert.equal(N.textoDasLigacoes({ total: 0 }), 'Nenhum registro solto.');
  assert.match(N.EXPLICA_LIGACOES, /não acha no outro/);
  const s = semComentarios(ler('saude.js'));
  assert.doesNotMatch(s, /tipo\$\{/);
  assert.match(s, /N\.textoDasLigacoes\(r\)/);
});

test('visão do dono sem palavra difícil: nada de "ticket" nem "subestimado" na tela', () => {
  const ruins = frasesDaTela().filter(([, t]) => /\bticket\b|subestimad/i.test(t));
  assert.deepEqual(ruins, []);
  assert.match(ler('painel.js'), /média de \$\{C\.esc\(L\.brl\(f\.ticket_semana\)\)\} por carro/);
});

test('busca: botão de fechar diz "Fechar" (não "Esc"); no toque some a cola de teclado', () => {
  assert.match(ler('index.html'), /<button id="buscaFechar" class="btn-link" type="button">Fechar<\/button>/);
  const css = ler('r9.css');
  const bloco = css.slice(css.indexOf('@media (hover: none) and (pointer: coarse)'));
  assert.match(bloco, /\.busca-pe, \.kbd-css, \.acao-busca kbd, \.busca-cmd kbd \{ display: none; \}/);
});

test('pede atenção e gargalos: horas por extenso (o "4 h" partia em "4" e "h" no celular) e "1 deles" no lugar de "1 há"', () => {
  const l = L.links(L.bases());
  const g = L.gargalos({ gargalos: { pronto_parado_4h: 1, conversas_2h: 2, orcamentos_24h: 1 } }, l).map((x) => x.texto);
  assert.ok(g.includes('1 carro pronto há mais de 4 horas sem retirar'));
  assert.ok(g.includes('2 conversas sem resposta há mais de 2 horas'));
  assert.ok(g.includes('1 orçamento enviado há mais de 24 horas sem resposta'));
  const velha = new Date(Date.now() - 5 * 36e5).toISOString(), nova = new Date().toISOString();
  const extra = (lista) => L.atencao({ patio: { prontos: lista.length, lista } }, { patio: true }, l).find((x) => x.k === 'prontos').extra;
  assert.equal(extra([{ etapa: 'pronto', etapa_em: velha }]), 'esperando há mais de 4 horas');
  assert.equal(extra([{ etapa: 'pronto', etapa_em: velha }, { etapa: 'pronto', etapa_em: nova }]), '1 deles há mais de 4 horas');
  assert.equal(extra([{ etapa: 'pronto', etapa_em: velha }, { etapa: 'pronto', etapa_em: velha }]), 'todos há mais de 4 horas');
});
