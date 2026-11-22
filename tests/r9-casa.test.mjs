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
  assert.ok(!existsSync(join(CASA, 'tarefas.js')), 'rodada 11: a lista de tarefas saiu da Casa');
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

test('rodada 11: a lista de tarefas saiu da Casa; o aviso de tarefas vencidas abre a aba Tarefas do Atendimento', () => {
  assert.ok(!existsSync(join(CASA, 'tarefas.js')));
  const html = ler('index.html');
  assert.doesNotMatch(html, /id="tTarefas"|id="fTarefa"|id="listaTarefas"|Minhas tarefas/);
  assert.deepEqual(N.acaoDoAviso({ tipo: 'tarefas_vencidas' }, L.bases(), 'http://central.local/'), { acao: 'abrir', url: '/atendimento/?tarefas' });
  for (const f of ['casa.js', 'sino.js', 'painel.js', 'comando.js']) assert.doesNotMatch(semComentarios(ler(f)), /#tTarefas|C\.tarefas/, f);
});

test('meta do mês: aceita como a pessoa escreve (R$ 80.000, 80 mil, 80k)', () => {
  for (const [txt, v] of [['80000', 80000], ['80.000', 80000], ['R$ 80.000', 80000], ['R$ 80.000,00', 80000], ['80 mil', 80000], ['80k', 80000], ['1,5 milhão', 1500000], ['95.500,50', 95501]]) assert.equal(M.valorDaMeta(txt), v, txt);
  assert.equal(M.valorDaMeta(''), '');
  assert.equal(M.valorDaMeta('   '), '');
  assert.equal(M.valorDaMeta('0'), '');
  assert.ok(Number.isNaN(M.valorDaMeta('abc')));
  assert.ok(Number.isNaN(M.valorDaMeta('-5')));
  assert.ok(Number.isNaN(M.valorDaMeta('999999999')));
  assert.doesNotMatch(ler('painel.js'), /valorDaMeta|donoMeta/, 'rodada 11: a meta do mês saiu com a visão do dono');
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
  assert.doesNotMatch(b, /Ir para|blocoComandos|C\.comandos/, 'rodada 11: sem "Ir para" (repetia os cartões) e sem paleta de comandos');
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
  'anthropic-sem-credito', 'anthropic-fora', 'comunicar-carteiro-parado', 'comunicar-fila-parada', 'patio-avisos-parados', 'backup-faltando', 'backup-ensaio-falhou', 'patio-fora'];

test('Vigia na Casa: os 24 avisos graves têm título curto e o que fazer (nada do texto cru como título)', () => {
  assert.equal(Object.keys(N.FAIXA_VIGIA).length, 24);
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

test('rodada 11: sem ajuda de atalhos e sem teclas de letra ou número; Ctrl+K e "/" abrem a busca', () => {
  assert.ok(!existsSync(join(CASA, 'atalhos.js')));
  assert.equal(L.AJUDA_ATALHOS, undefined); assert.equal(L.ATALHOS_G, undefined); assert.equal(M.ATALHOS_NUMERO, undefined);
  const html = ler('index.html');
  assert.doesNotMatch(html, /id="ajuda"|id="bAjuda"|Atalhos do teclado|class="busca-pe"|<kbd/);
  const b = semComentarios(ler('busca.js'));
  assert.match(b, /String\(e\.key\)\.toLowerCase\(\) === 'k'/);
  assert.match(b, /e\.key === '\/'[^\n]*!L\.ehCampo\(e\.target\)/);
  assert.match(b, /document\.removeEventListener\('keydown', teclado\)/);
});

test('textos da tela: sem travessão e sem "lead" (palavra que a oficina não usa)', () => {
  const ruins = [];
  for (const [f, t] of frasesDaTela()) {
    if (/—/.test(t)) ruins.push(f + ': travessão em "' + t.slice(0, 80) + '"');
    if (f !== 'index.html' && /[;{}]|=>| = /.test(t.replace(/\$\{[^}]*\}/g, ''))) continue;   // pedaço de código entre aspas, não frase
    if (/(?<![.\w$])leads?\b(?![_:.?])/i.test(t.replace(/\$\{[^}]*\}/g, ''))) ruins.push(f + ': lead em "' + t.slice(0, 80) + '"');
  }
  assert.deepEqual(ruins, []);
  assert.match(semComentarios(ler('painel.js')), /'contatos novos sem responsável'/);   // rodada 13B: o mesmo nome do CRM
  assert.equal(L.GRUPOS_BUSCA.find((g) => g.k === 'leads').nome, 'Contatos (CRM)');
});

test('"não sei" não vira traço nem zero: cartão de app sem número esconde o número (rodada 11)', () => {
  const p = semComentarios(ler('painel.js'));
  assert.match(p, /if \(!v \|\| !Number\.isFinite\(Number\(v\[0\]\)\)\) \{ el\.hidden = true;/);
  assert.doesNotMatch(ler('index.html'), /data-num>—</);
});

test('rodada 11: o bloco "Ontem e amanhã" saiu da Casa (repetia a Agenda)', () => {
  assert.ok(!existsSync(join(CASA, 'manha.js')));
  assert.doesNotMatch(ler('index.html'), /manhaTitulo|Ontem e amanhã/);
});

test('acessibilidade: a Casa enxuta não tem abas de visão nem relógio falante; a busca do topo tem nome', () => {
  const html = ler('index.html');
  assert.doesNotMatch(html, /role="tab"|id="visaoDono"|id="vivoAviso"|class="vivo"/);
  assert.match(html, /aria-label="Buscar telefone, nome ou placa em todos os sistemas"/);
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
  assert.doesNotMatch(ler('index.html'), /donoBarras/, 'rodada 11: o gráfico de faturamento saiu com a visão do dono');
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

test('rodada 11: a visão do dono saiu da Casa (faturamento, conversão, meta e desempenho moram nos apps)', () => {
  assert.doesNotMatch(ler('index.html'), /visaoDono|seletorVisao|donoTiles|donoConv|donoConsultores|donoGargalos|donoLigacoes/);
  assert.doesNotMatch(semComentarios(ler('painel.js')), /r6_c1_painel_dono|r6_c1b_painel_consultores|casa_metas/);
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
  assert.match(semComentarios(ler('painel.js')), /V\.soMeusCarros \? plural\(d\.patio\.total, 'carro seu no pátio', 'carros seus no pátio'\)/, 'rodada 11: o cartão do Pátio conta os carros dele');
});

test('listas dos cartões: coluna minmax(0, 1fr) (valor e tempo não saem do cartão) e nome desce de linha no celular', () => {
  const css = ler('r9.css');
  assert.match(css, /\.agora-lista \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /@media \(max-width: 520px\) \{ \.agora-lista \.linha \.l-a \{ white-space: normal;/);
});

test('gráfico de 7 dias: valor curto em cima da barra (cabe nos 40 px do celular), vazio quando o dia não tem valor', () => {
  assert.deepEqual([0, null, 850, 999.6, 1750, 12500, 1234567].map(N.rotuloDaBarra), ['', '', '850', '1 mil', '1,8 mil', '12,5 mil', '1,2 mi']);
});

test('ligações entre sistemas: resumo diz "registros soltos para arrumar" (não "casos em 1 tipo") e explica o que é solto', () => {
  assert.equal(N.textoDasLigacoes({ total: 3, tipos: 1, alta: 0 }), '3 registros soltos para arrumar');
  assert.equal(N.textoDasLigacoes({ total: 1, tipos: 1, alta: 1 }), '1 registro solto para arrumar · 1 assunto grave');
  assert.equal(N.textoDasLigacoes({ total: 0 }), 'Nenhum registro solto.');
  assert.match(N.EXPLICA_LIGACOES, /não acha no outro/);
  assert.doesNotMatch(semComentarios(ler('saude.js')), /r7_x3_ligacoes_quebradas/, 'rodada 11: as ligações saíram da Casa com a visão do dono');
});

test('visão do dono sem palavra difícil: nada de "ticket" nem "subestimado" na tela', () => {
  const ruins = frasesDaTela().filter(([, t]) => /\bticket\b|subestimad/i.test(t));
  assert.deepEqual(ruins, []);
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

test('esqueci a senha: espera a resposta (botão desligado) e não pede de novo o mesmo e-mail no mesmo minuto', () => {
  const s = semComentarios(ler('casa.js'));
  const f = s.slice(s.indexOf('async function esqueci('), s.indexOf('async function confirmarMfa('));
  assert.match(f, /if \(b\.disabled\) return;/);
  assert.match(f, /resetPedido\.email === email && Date\.now\(\) - resetPedido\.em < 60_000/);
  assert.match(f, /finally \{ b\.disabled = false;/);
});

test('aviso do pé: usa a largura da tela no celular (antes era metade, por causa do left 50%)', () => {
  assert.match(ler('r9.css'), /\.toast \{ left: 16px; right: 16px; transform: none; width: fit-content; max-width: min\(560px, calc\(100vw - 32px\)\);/);
});

test('ficha: orçamento diz "esperando resposta há 1 dia" (antes "esperando resposta · Onix · esperando há 1 dia")', () => {
  assert.equal(N.situacaoDoOrc({ status: 'esperando resposta', esperandoHoras: 26 }), 'esperando resposta há ' + L.duracao(26 * 36e5));
  assert.equal(N.situacaoDoOrc({ status: 'esperando resposta', esperandoHoras: 2 }), 'esperando resposta');
  assert.equal(N.situacaoDoOrc({ status: 'em aberto', esperandoHoras: 10 }), 'em aberto · esperando há ' + L.duracao(10 * 36e5));
  assert.doesNotMatch(semComentarios(ler('ficha.js')), /· esperando há/);
});

test('logo do topo: leitor de tela ouve o problema dos sistemas; o ponto de problema tem "!" (não só cor)', () => {
  assert.equal(N.rotuloDoLogo({ tom: 'ok', texto: 'Todos os sistemas em ordem' }), 'IndyCar Central, início');
  assert.equal(N.rotuloDoLogo({ tom: 'ruim', texto: 'WhatsApp com problema' }), 'IndyCar Central, início. WhatsApp com problema');
  assert.equal(N.rotuloDoLogo({ tom: 'aviso', texto: 'Pátio pede atenção' }), 'IndyCar Central, início. Pátio pede atenção');
  assert.match(semComentarios(ler('saude.js')), /topo\.setAttribute\('aria-label', N\.rotuloDoLogo\(r\)\)/);
  assert.match(ler('r9.css'), /\.ic-marca\[data-saude="ruim"\]::after \{ content: '!';/);
});

test('seus apps: número de pendências no canto do cartão (o nome comprido não desce de linha por causa dele)', () => {
  const css = ler('r9.css');
  assert.match(css, /\.app \.app-selo \{ position: absolute; top: 10px; right: 10px; margin: 0; \}/);
  assert.match(css, /\.app \{ position: relative; \}/);
});

test('busca com erro: aviso falado (role alert) e botão "tentar de novo" que busca outra vez', () => {
  const s = semComentarios(ler('busca.js'));
  assert.match(s, /<p class="vazio vazio-erro" role="alert">\$\{navigator\.onLine \? 'A busca não respondeu agora\.' : 'Sem internet\.'\} <button type="button" class="btn-link" data-busca-de-novo>tentar de novo<\/button><\/p>/);
  assert.match(s, /if \(e\.target\.closest\('\[data-busca-de-novo\]'\)\) \{ buscar\(inp\.value\); inp\.focus\(\); return; \}/);
});

test('rodada 11: sem o campo da meta do mês na Casa (e nunca window.prompt)', () => {
  const s = semComentarios(ler('painel.js'));
  assert.doesNotMatch(s, /window\.prompt\(|metaValor/);
});

test('rodada 11: comando.js só confere se o Pátio e o Orçador estão no ar (saíram clima, Meu dia, recolher, paleta e resumo)', () => {
  const s = semComentarios(ler('comando.js'));
  assert.doesNotMatch(s, /recolher|pintarMeuDia|climaDaOficina|C\.comandos|copiarResumo/);
  assert.match(s, /fetch\('\/api\/central\/saude-apps'/);
});

test('entrada: erro aponta o campo (aria-invalid, foco e texto selecionado) e o campo lê a mensagem de erro', () => {
  const s = semComentarios(ler('casa.js'));
  assert.match(s, /function apontar\(form, sel\)/);
  assert.match(s, /apontar\('#fLogin', !email \? '#lEmail' : '#lSenha'\)/);
  assert.match(s, /apontar\('#fLogin', '#lSenha'\); \}/, 'senha errada volta para a senha');
  assert.match(s, /apontar\('#fSenha', '#sRepete'\)/);
  assert.match(s, /apontar\('#fMfa', '#mCodigo'\)/);
  const h = ler('index.html');
  for (const [id, err] of [['lEmail', 'lErro'], ['lSenha', 'lErro lCaps'], ['mCodigo', 'mErro'], ['sNova', 'sErro'], ['sRepete', 'sErro']]) assert.match(h, new RegExp(`id="${id}"[^>]*aria-describedby="${err}"`), id);
  assert.match(ler('r9.css'), /\.campo input\[aria-invalid="true"\]/);
});

test('biblioteca do Supabase (CDN) com integrity sha384: arquivo trocado no CDN não roda na Casa', () => {
  const tag = ler('index.html').match(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\.117\.2\/dist\/umd\/supabase\.min\.js"[^>]*>/);
  assert.ok(tag, 'versão fixa no endereço');
  assert.match(tag[0], /integrity="sha384-[A-Za-z0-9+/]{64}"/);
  assert.match(tag[0], /crossorigin="anonymous"/);
  for (const f of ['r9-casa-browser.mjs', 'r9-casa-interacoes.mjs']) assert.match(readFileSync(join(RAIZ, 'tests', f), 'utf8'), /replace\(\/ integrity="\[\^"\]\*"\/g, ''\)/, f + ': o teste tira o integrity só para usar o Supabase de mentira');
});

test('rodada 11: sem "dispensar por hoje" (o bloco Ontem e amanhã saiu); o miolo continua alvo de foco', () => {
  assert.ok(!existsSync(join(CASA, 'manha.js')));
  assert.match(ler('index.html'), /<main id="miolo" class="miolo" tabindex="-1">/);
});

test('sino pelo teclado: ⏱ leva às opções, adiar e ✓ deixam o foco na lista (antes caía no começo da página)', () => {
  const s = semComentarios(ler('sino.js'));
  assert.match(s, /function vizinhoDe\(id\)/);
  assert.match(s, /function focarAviso\(id, reserva\)/);
  assert.match(s, /if \(ids\.length === 1\) \{ focarAviso\(ids\[0\], viz\); return; \}/);
  assert.match(s, /desenhar\(\); focarAviso\(null, viz\);/);
  assert.match(s, /adiarAberto \? `#listaNotif \[data-adiar-id="\$\{seguro\(id\)\}"\]` : `#listaNotif \[data-adiar-sino="\$\{seguro\(id\)\}"\]`/);
  assert.match(s, /!b\.closest\('details:not\(\[open\]\)'\)/, 'vizinho é um aviso que dá para alcançar (fora de grupo fechado)');
});

test('janelas da busca e da ficha sem marco duplicado (o pé e o cabeçalho delas eram footer/header: o leitor de tela ouvia dois rodapés e dois topos)', () => {
  const h = ler('index.html');
  const busca = h.slice(h.indexOf('<div id="busca"'), h.indexOf('<!-- ======================= FICHA'));
  const ficha = h.slice(h.indexOf('<div id="ficha"'), h.indexOf('</div>\n  </div>', h.indexOf('<div id="ficha"')) + 20);
  assert.doesNotMatch(busca, /<footer|<header/);
  assert.doesNotMatch(ficha, /<footer|<header/);
  assert.doesNotMatch(busca, /busca-pe/, 'rodada 11: a cola de teclas saiu');
  assert.match(ficha, /<div class="ficha-cab">/);
});

test('"ir para" leva o foco junto e só anima a rolagem para quem não pediu menos movimento', () => {
  const c = semComentarios(ler('casa.js'));
  assert.match(c, /function irPara\(alvo, \{ bloco = 'start' \} = \{\}\)/);
  assert.match(c, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/);
  assert.match(c, /behavior: calmo \? 'auto' : 'smooth'/);
  assert.match(c, /el\.setAttribute\('tabindex', '-1'\)/);
  assert.match(c, /el\.focus\(\{ preventScroll: true \}\)/);
  assert.match(c, /\$: \(s\) => document\.querySelector\(s\), irPara,/);
  for (const f of ['comando.js', 'sino.js']) assert.doesNotMatch(semComentarios(ler(f)), /#tTarefas/, f + ': rodada 11, sem lista de tarefas na Casa');
  for (const f of readdirSync(CASA).filter((x) => x.endsWith('.js') && x !== 'casa.js')) {
    assert.doesNotMatch(semComentarios(ler(f)), /behavior: 'smooth'/, f + ': rolagem animada fixa ignorava o "menos movimento"');
  }
});

test('rodada 11: sem "g depois letra" (atalho escondido que ninguém usava)', () => {
  assert.equal(L.ATALHOS_G, undefined);
  assert.doesNotMatch(semComentarios(ler('busca.js')), /esperandoG|dicaDoG/);
});

test('atalho de app fora do ar diz "fora do ar" (antes só a borda tracejada mostrava)', () => {
  assert.match(ler('r9.css'), /\.acao-fora::after \{ content: '· fora do ar';/);
  assert.match(semComentarios(ler('comando.js')), /el\.title = f \? 'Este app não está respondendo agora\. Clique só se precisar\.' : '';/);
  assert.match(readFileSync(join(RAIZ, 'tests', 'r9-casa-browser.mjs'), 'utf8'), /nome: 'foradoar', cenario: \{ papel: 'admin', foraDoAr: \['patio', 'orcador'\] \}/, 'o Chrome mede a tela com Pátio e Orçador fora');
});

test('ficha: erro ao montar e respostas dos links são faladas ao leitor de tela (antes só o "carregando" era)', () => {
  const s = semComentarios(ler('ficha.js'));
  assert.match(s, /<p class="vazio vazio-erro" role="alert">\$\{navigator\.onLine \? 'Não consegui montar a ficha agora\.'/);
  assert.match(s, /<p class="vazio" role="status">\$\{d\.motivo === 'cliente_nao_encontrado'/);
  assert.match(s, /<p class="vazio" role="status">Sem links para este cliente agora\.<\/p>/);
  assert.doesNotMatch(s, /<p class="vazio">/, 'nenhuma mensagem da ficha sem papel de aviso');
});

test('faturamento da semana: a comparação diz "a mais" / "a menos" em palavras (antes só a seta e a cor), sem "vs." nem "novo"', () => {
  assert.equal(N.textoDaVariacao(null), null);
  assert.deepEqual(N.textoDaVariacao(L.variacao(1120, 1000)), { classe: 'bom', seta: '▲', texto: '12% a mais' });
  assert.deepEqual(N.textoDaVariacao(L.variacao(950, 1000)), { classe: 'ruim', seta: '▼', texto: '5% a menos' });
  assert.deepEqual(N.textoDaVariacao(L.variacao(1000, 1000)), { classe: '', seta: '', texto: 'igual' });
  assert.equal(N.textoDaVariacao(L.variacao(500, 0)).texto, 'a semana passada estava zerada');
  assert.equal(N.textoDaVariacao(L.variacao(0, 0)), null, 'as duas zeradas: não compara');
});

test('saúde: sistemas que mudam juntos viram um aviso só (antes um por sistema, e só o último ficava na tela)', () => {
  const itens = (tons) => Object.entries(tons).map(([k, tom]) => ({ k, nome: { patio: 'Pátio', orcador: 'Orçador', zap: 'WhatsApp', ia: 'IA' }[k], tom }));
  assert.equal(N.avisoDeMudancas(null, itens({ patio: 'ruim' })), null, 'primeira leitura não avisa');
  assert.deepEqual(N.avisoDeMudancas({ patio: 'ok', orcador: 'ok' }, itens({ patio: 'ruim', orcador: 'ruim' })), { texto: 'Pátio e Orçador ficaram com problema.', ruim: true });
  assert.deepEqual(N.avisoDeMudancas({ patio: 'ruim' }, itens({ patio: 'ok' })), { texto: 'Pátio voltou ao normal.', ruim: false });
  assert.equal(N.avisoDeMudancas({ patio: 'ok', orcador: 'aviso', zap: 'ok', ia: 'ruim' }, itens({ patio: 'ruim', orcador: 'ruim', zap: 'ruim', ia: 'ok' })).texto,
    'Pátio, Orçador e WhatsApp ficaram com problema. IA voltou ao normal.');
  assert.equal(N.avisoDeMudancas({ patio: 'ruim' }, itens({ patio: 'aviso' })), null, 'de problema para atenção não avisa');
  const s = semComentarios(ler('saude.js'));
  assert.match(s, /const aviso = N\.avisoDeMudancas\(antes, s\.itens\);/);
  assert.doesNotMatch(s, /for \(const i of s\.itens\) \{\s*if \(antes/);
});

test('busca reaberta: a pesquisa da vez anterior não trava o Enter da tela inicial', () => {
  const s = semComentarios(ler('busca.js'));
  const abrir = s.slice(s.indexOf('function abrir('), s.indexOf('function abrir(') + 600);
  assert.match(abrir, /ultimaBusca = '';\s*if \(inp\.value\) buscar\(inp\.value\); else telaInicial\(\);/);
  assert.match(readFileSync(join(RAIZ, 'tests', 'r9-casa-interacoes.mjs'), 'utf8'), /busca reaberta: setas até "Agenda" e Enter abrem a Agenda/);
});

test('busca: as buscas recentes entram nas setas (antes pulavam direto para os comandos) e têm nome falado', () => {
  const s = semComentarios(ler('busca.js'));
  assert.match(s, /class="busca-rec" data-linha id="br-\$\{i\}" data-recente="\$\{C\.esc\(x\)\}" aria-label="Buscar de novo: \$\{C\.esc\(x\)\}"/);
  assert.match(ler('r9.css'), /\.busca-rec\.ativa \{ background: var\(--panel-2\); box-shadow: inset 0 0 0 1px var\(--red\); \}/);
});

test('filtros das tarefas e do sino: depois de filtrar, o foco fica no filtro escolhido (antes ia para o começo da página)', () => {
  assert.match(semComentarios(ler('sino.js')), /filtro = f\.dataset\.filtro; desenhar\(\); \[\.\.\.document\.querySelectorAll\('#sinoFiltros \[data-filtro\]'\)\]\.find\(\(x\) => x\.dataset\.filtro === filtro\)\?\.focus\(\); return;/);
});

test('busca: "limpar" as recentes devolve o foco ao campo e avisa o leitor de tela', () => {
  const s = semComentarios(ler('busca.js'));
  assert.match(s, /localStorage\.removeItem\(LS_RECENTES\);[^]*?telaInicial\(\);\s*\$\('#buscaInput'\)\.focus\(\);\s*const an = \$\('#buscaAnuncio'\); if \(an\) an\.textContent = 'Buscas recentes apagadas\.';/);
});

test('"tentar de novo" das tarefas e do sino deixa o foco perto da lista (antes o botão sumia e o foco ia para o corpo da página)', () => {
  assert.match(semComentarios(ler('sino.js')), /\[data-sino-de-novo\]'\)\) \{ leitura = 'carregando'; desenhar\(\); carregar\(\); \$\('#sinoBusca'\)\?\.focus\(\); return; \}/);
});
