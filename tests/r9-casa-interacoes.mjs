// Casa no Chrome (rodada 9): roteiro de TECLADO e de cliques com o Supabase de mentira (tests/r9-casa-mock/).
// Confere o que a foto não mostra: para onde vai o foco, o que o leitor de tela ouve e o que seria gravado.
// Nada sai para a rede (interceptação do Chrome, como em tests/r9-casa-browser.mjs).
//
//   node tests/r9-casa-interacoes.mjs                 → imprime cada conferência (ok/FALHOU) e sai com 1 se alguma falhar
//   node tests/r9-casa-interacoes.mjs --antes <pasta>  → o mesmo roteiro na Casa de <pasta>/casa
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');
const puppeteer = require(resolve(RAIZ, '../indycar-ferramentas/node_modules/puppeteer-core'));
const BASE = 'http://localhost:3521';
const iAntes = process.argv.indexOf('--antes');
const FONTE = iAntes > 0 ? resolve(process.argv[iAntes + 1]) : RAIZ;   // --antes <pasta>: a mesma conferência na Casa de antes (git archive)
const MOCK = readFileSync(join(AQUI, 'r9-casa-mock/dados.js'), 'utf8') + '\n' + readFileSync(join(AQUI, 'r9-casa-mock/supabase-falso.js'), 'utf8');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', userDataDir: resolve(RAIZ, 'qa-out/r9/perfil-chrome-teclado'), args: ['--no-sandbox', '--disable-background-networking'] });
const resultados = [];
const conferir = (nome, ok, detalhe = '') => { resultados.push({ nome, ok: !!ok, detalhe }); console.log(`${ok ? 'ok     ' : 'FALHOU '} ${nome}${detalhe ? '  (' + detalhe + ')' : ''}`); };

async function abrir(cenario, largura = 1440, toque = false) {
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e.message)));
  await page.setViewport({ width: largura, height: 900, hasTouch: toque, isMobile: toque });
  await page.setBypassServiceWorker(true);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument((c) => {
    window.__CENARIO = c; window.__ABAS = [];
    window.open = (url, nome) => { window.__ABAS.push([String(url), String(nome)]); return { focus() {} }; };
    window.prompt = () => window.__RESPOSTA_PROMPT ?? null;
    // cada aba nova começa sem o que a rodada anterior deixou no perfil do Chrome (avisos adiados, bloco dispensado, buscas)
    try { if (!sessionStorage.getItem('__aba_limpa')) { localStorage.clear(); sessionStorage.setItem('__aba_limpa', '1'); } } catch { /* segue */ }
    try { localStorage.setItem('indycar_tema', 'escuro'); localStorage.setItem('indycar_central_visao', 'operacao'); } catch { /* segue */ }
  }, cenario);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.hostname === 'cdn.jsdelivr.net' && /supabase/.test(u.pathname)) return req.respond({ status: 200, contentType: TIPOS['.js'], headers: { 'Access-Control-Allow-Origin': '*' }, body: MOCK });
    if (u.origin !== BASE) return req.respond({ status: 204, body: '' });
    const json = (o) => req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/api/central/config') return json({ supabaseUrl: 'https://mentira.supabase.co', supabaseAnonKey: 'chave-de-mentira', versao: 'r9', apps: {} });
    if (u.pathname === '/api/central/saude-apps') return json({ verificado_em: Date.now(), apps: {}, internos: {} });
    if (u.pathname.startsWith('/agenda/api/')) return json([]);
    const caminho = u.pathname === '/' ? '/casa/index.html' : u.pathname;
    const arq = join(FONTE, caminho);
    if (!/^\/casa\/[\w.-]+$/.test(caminho) || !existsSync(arq)) return req.respond({ status: 404, body: '' });
    // o Supabase de mentira não bate com o hash (integrity) da biblioteca de verdade: no teste o index vai sem o integrity
    const corpo = caminho.endsWith('/index.html') ? readFileSync(arq, 'utf8').replace(/ integrity="[^"]*"/g, '') : readFileSync(arq);
    return req.respond({ status: 200, contentType: TIPOS[caminho.slice(caminho.lastIndexOf('.'))] || 'application/octet-stream', body: corpo });
  });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(cenario.sessao === false ? '#fLogin:not([hidden])' : '#casa:not([hidden])', { timeout: 8000 });
  await espera(900);
  return { page, erros };
}
const foco = (page) => page.evaluate(() => { const a = document.activeElement; return a ? (a.id ? '#' + a.id : a.tagName.toLowerCase() + (a.dataset.acao ? '[' + a.dataset.acao + ']' : a.dataset.visao ? '[' + a.dataset.visao + ']' : a.dataset.editar ? '[editar]' : '')) : ''; });

const passo = async (nome, fn) => { try { await fn(); } catch (e) { conferir(nome, false, 'quebrou: ' + String(e.message).slice(0, 90)); } };
try {
  const { page, erros } = await abrir({ papel: 'admin' });

  // 1. menu do perfil: abre com foco na 1ª opção, setas andam, Esc devolve o foco e fecha
  await passo("1. menu do perfil: abre com foco na 1ª opção, setas andam, Esc devolve o foco e fecha", async () => {
  await page.click('#bPerfil'); await espera(80);
  conferir('perfil: ao abrir, o foco vai para "Trocar senha"', (await foco(page)) === 'button[trocar-senha]', await foco(page));
  await page.keyboard.press('ArrowDown');
  conferir('perfil: seta para baixo vai para "Sair"', (await foco(page)) === 'button[sair]', await foco(page));
  await page.keyboard.press('End');
  conferir('perfil: End vai para a última opção', (await foco(page)) === 'button[sair-todos]', await foco(page));
  await page.keyboard.press('Escape'); await espera(50);
  conferir('perfil: Esc fecha e devolve o foco ao avatar', (await foco(page)) === '#bPerfil' && await page.$eval('#menuPerfil', (m) => m.hidden) && (await page.$eval('#bPerfil', (b) => b.getAttribute('aria-expanded'))) === 'false');
  });

  // 2. abas da visão
  await passo("2. abas da visão", async () => {
  await page.focus('#seletorVisao [data-visao="operacao"]'); await page.keyboard.press('ArrowRight'); await espera(300);
  conferir('abas: seta para a direita abre a Visão do dono e leva o foco', (await page.evaluate(() => document.activeElement.dataset.visao)) === 'dono' && !(await page.$eval('#visaoDono', (s) => s.hidden)) && (await page.$eval('#seletorVisao [data-visao="dono"]', (b) => b.tabIndex)) === 0);
  await page.keyboard.press('Home'); await espera(200);
  conferir('abas: Home volta para Operação', (await page.evaluate(() => document.activeElement.dataset.visao)) === 'operacao' && (await page.$eval('#visaoDono', (s) => s.hidden)));
  });

  // 3. ajuda prende o Tab
  await passo("3. ajuda prende o Tab", async () => {
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('?'); await espera(100);
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  conferir('ajuda: o Tab não sai da janela de atalhos', (await foco(page)) === '#ajudaFechar', await foco(page));
  await page.keyboard.press('Escape'); await espera(50);
  });

  // 4. tecla 7 abre o Tráfego na aba dele
  await passo("4. tecla 7 abre o Tráfego na aba dele", async () => {
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('7'); await espera(50);
  const abas = await page.evaluate(() => window.__ABAS);
  conferir('tecla 7 abre o Tráfego na aba indycar-trafego', abas.some(([u, n]) => /\/trafego\/$/.test(u) && n === 'indycar-trafego'), JSON.stringify(abas));
  });

  // 5. busca: o item marcado pelas setas é anunciado; Tráfego no "Ir para"
  await passo("5. busca: o item marcado pelas setas é anunciado; Tráfego no \"Ir para\"", async () => {
  await page.click('#bBusca'); await espera(150);
  conferir('busca: Tráfego aparece no "Ir para"', !!(await page.$('#bl-ir-ads')));
  await page.type('#buscaInput', 'gabi'); await espera(900);
  await page.keyboard.press('ArrowDown'); await espera(50);
  const anuncio = await page.$eval('#buscaAnuncio', (p) => p.textContent);
  conferir('busca: leitor de tela ouve o item marcado', anuncio.length > 3, anuncio);
  conferir('busca: nenhum role="option" nem listbox', (await page.$$('#busca [role="option"], #busca [role="listbox"]')).length === 0);
  await page.keyboard.press('Escape'); await espera(100);
  });

  // 6. tarefa: título editável pelo teclado; Esc volta o foco ao título
  await passo("6. tarefa: título editável pelo teclado; Esc volta o foco ao título", async () => {
  const btn = await page.$('#listaTarefas [data-editar]');
  await btn.focus(); await page.keyboard.press('Enter'); await espera(80);
  conferir('tarefa: Enter no título abre o campo de edição focado', (await foco(page)) === 'input');
  await page.keyboard.press('Escape'); await espera(80);
  conferir('tarefa: Esc cancela e devolve o foco ao título', (await foco(page)) === 'button[editar]', await foco(page));
  });

  // 7. concluir tarefa → aviso com "Desfazer"; a dica do "g" não apaga o botão
  await passo("7. concluir tarefa → aviso com \"Desfazer\"; a dica do \"g\" não apaga o botão", async () => {
  await page.click('#listaTarefas input[type="checkbox"]'); await espera(150);
  conferir('tarefa concluída mostra "Desfazer"', !!(await page.$('#toast:not([hidden]) .toast-btn')));
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('g'); await espera(100);
  conferir('a dica do "g" não apaga o "Desfazer"', !!(await page.$('#toast:not([hidden]) .toast-btn')));
  await page.keyboard.press('Escape');
  await espera(1600);
  conferir('aviso com botão continua depois de 1,6 s (relógio de 6 s)', !!(await page.$('#toast:not([hidden]) .toast-btn')));
  });

  // 8. sino: "marcar todas" com busca só marca o que está na tela
  await passo("8. sino: \"marcar todas\" com busca só marca o que está na tela", async () => {
  await page.evaluate(() => { window.__GRAVADO.length = 0; });
  await page.click('#bSino'); await espera(400);
  await page.type('#sinoBusca', 'HB20'); await espera(400);
  await page.click('#bLerTodas'); await espera(300);
  const gravou = await page.evaluate(() => window.__GRAVADO.filter((g) => g.tabela === 'notificacoes'));
  const ids = gravou.flatMap((g) => (g.filtros || []).filter((f) => f[0] === 'in').flatMap((f) => f[2]));
  conferir('sino: "marcar todas" com a busca "HB20" marca só 1 aviso', ids.length === 1, JSON.stringify(ids));
  });

  // 9. Esc no sino devolve o foco ao sino
  await passo("9. Esc no sino devolve o foco ao sino", async () => {
  await page.keyboard.press('Escape'); await espera(80);
  conferir('sino: Esc fecha e devolve o foco ao botão do sino', (await foco(page)) === '#bSino' && (await page.$eval('#painelSino', (p) => p.hidden)));
  });

  // 10. meta: "R$ 80.000" é aceito
  await passo("10. meta: \"R$ 80.000\" é aceito", async () => {
  await page.click('#seletorVisao [data-visao="dono"]'); await espera(700);
  await page.evaluate(() => { window.__GRAVADO.length = 0; window.__RESPOSTA_PROMPT = 'R$ 80.000'; });
  const meta = await page.$('[data-meta]');
  if (meta) { await meta.click(); await espera(300); }
  const campo = await page.evaluate(() => ({ aberto: !!document.querySelector('#metaValor'), foco: document.activeElement && document.activeElement.id }));
  if (campo.aberto) {   // rodada 9: campo no próprio bloco (antes window.prompt)
    conferir('meta: abre um campo no bloco, com o foco nele (sem janela do navegador)', campo.foco === 'metaValor', JSON.stringify(campo));
    await page.keyboard.press('Escape'); await espera(150);
    const fechou = await page.evaluate(() => [!document.querySelector('#metaValor'), document.activeElement && document.activeElement.hasAttribute('data-meta')]);
    conferir('meta: Esc cancela e devolve o foco ao botão', fechou[0] && fechou[1], JSON.stringify(fechou));
    await page.click('[data-meta]'); await espera(200);
    await page.type('#metaValor', 'oitenta'); await page.keyboard.press('Enter'); await espera(200);
    const erro = await page.evaluate(() => ({ alerta: (document.querySelector('#metaErro') || {}).textContent || '', invalido: document.querySelector('#metaValor').getAttribute('aria-invalid'), foco: document.activeElement.id, gravou: window.__GRAVADO.length }));
    conferir('meta: valor que não dá para ler mostra o erro no campo e não grava', /Não entendi/.test(erro.alerta) && erro.invalido === 'true' && erro.foco === 'metaValor' && erro.gravou === 0, JSON.stringify(erro));
    const ficou = await page.$eval('#metaValor', (i) => i.value);
    conferir('meta: com erro, o que foi digitado continua no campo para corrigir', ficou === 'oitenta', ficou);
    await page.$eval('#metaValor', (i) => i.select()); await page.type('#metaValor', 'R$ 80.000'); await page.keyboard.press('Enter'); await espera(400);
  }
  const metaGravada = await page.evaluate(() => window.__GRAVADO.find((g) => g.tabela === 'casa_metas'));
  conferir('meta: "R$ 80.000" grava 80000', metaGravada && metaGravada.valor && metaGravada.valor.valor === 80000, JSON.stringify(metaGravada && metaGravada.valor));
  });

  // 11. botão do tema diz o estado
  await passo("11. botão do tema diz o estado", async () => {
  const tema = await page.$eval('#bTema', (b) => [b.getAttribute('aria-pressed'), b.getAttribute('aria-label')]);
  conferir('tema: botão diz qual tema está ligado', /ligado/.test(tema[1] || '') && tema[0] !== null, JSON.stringify(tema));

  conferir('nenhum erro de JavaScript na página', !erros.length, erros.join(' | ').slice(0, 200));
  await page.close();
  });

  // 12. Criar tarefa: dois cliques não gravam duas vezes (banco lento)
  await passo("12. Criar tarefa: dois cliques não gravam duas vezes (banco lento)", async () => {
  const lenta = await abrir({ papel: 'admin', atraso: 700 });
  await lenta.page.evaluate(() => { window.__GRAVADO.length = 0; });
  await lenta.page.type('#tTitulo', 'Ligar para o fornecedor de pneus');
  await lenta.page.click('#fTarefa [type="submit"]');
  await lenta.page.click('#fTarefa [type="submit"]').catch(() => {});
  await espera(900);
  const criadas = await lenta.page.evaluate(() => window.__GRAVADO.filter((g) => g.tabela === 'tarefas' && g.acao === 'insert').length);
  conferir('tarefa: dois cliques em Criar com banco lento gravam uma vez só', criadas === 1, 'gravou ' + criadas);
  await lenta.page.close();
  });

  // 13. Sair: o próximo no mesmo computador não vê as buscas (nome e telefone) nem os avisos adiados de quem saiu
  await passo("13. Sair limpa as buscas recentes e os adiados; tema e e-mail lembrado ficam", async () => {
  const s = await abrir({ papel: 'admin' });
  await s.page.evaluate(() => { localStorage.setItem('indycar_central_buscas', JSON.stringify(['gabi', '12 99999-0000'])); localStorage.setItem('indycar_central_sino_adiados', JSON.stringify({ x: Date.now() + 3600000 })); localStorage.setItem('indycar_central_email', 'balcao@oficina.test'); });
  await s.page.click('#bPerfil'); await espera(100);
  await s.page.click('#menuPerfil [data-acao="sair"]');
  await s.page.waitForSelector('#fLogin:not([hidden])', { timeout: 4000 });
  const sobra = await s.page.evaluate(() => ['indycar_central_buscas', 'indycar_central_sino_adiados', 'indycar_tema', 'indycar_central_email'].map((k) => localStorage.getItem(k) !== null));
  conferir('sair: buscas recentes e avisos adiados apagados do aparelho', !sobra[0] && !sobra[1], JSON.stringify(sobra));
  conferir('sair: tema e e-mail lembrado continuam (são do aparelho)', sobra[2] && sobra[3], JSON.stringify(sobra));
  await s.page.close();
  });

  // 14. cartões vazios: a dica quebra linha e nada passa da largura do cartão; o mecânico tem o texto dele
  await passo("14. cartões do Agora vazios cabem no cartão (375 e 1440); mecânico com texto próprio", async () => {
  for (const larg of [375, 1440]) {
    const v = await abrir({ papel: 'admin', vazio: true }, larg);
    const largos = await v.page.evaluate(() => [...document.querySelectorAll('.agora-cartao')].filter((c) => !c.hidden && c.scrollWidth > c.clientWidth + 1).map((c) => c.id + ' ' + c.scrollWidth + '/' + c.clientWidth));
    conferir(`cartões vazios em ${larg} px: nenhum passa da largura`, !largos.length, largos.join(', '));
    await v.page.close();
  }
  const cheio = await abrir({ papel: 'admin' }, 375);
  const cortados = await cheio.page.evaluate(() => [...document.querySelectorAll('.agora-cartao')].filter((c) => !c.hidden && c.scrollWidth > c.clientWidth + 1).map((c) => c.id + ' ' + c.scrollWidth + '/' + c.clientWidth));
  conferir('cartões com lista em 375 px: valor e tempo não saem do cartão', !cortados.length, cortados.join(', '));
  const selo = await cheio.page.$$eval('#cOrc .pil-bom', (ss) => { const s = ss.find((x) => /aprovado/.test(x.textContent)); if (!s) return false; const r = s.getBoundingClientRect(), c = s.closest('.agora-cartao').getBoundingClientRect(), a = s.closest('.l-a').getBoundingClientRect(); return r.width > 60 && r.right <= Math.min(c.right, a.right) + 1; });
  conferir('selo "aprovado · sem horário" aparece inteiro no celular', !!selo, String(selo));
  await cheio.page.close();
  const m = await abrir({ papel: 'mecanico', vazio: true }, 375);
  const txt = await m.page.$eval('#cPatio [data-lista]', (l) => l.innerText);
  conferir('mecânico sem carro: fala dos carros dele, sem "+ Nova entrada"', /passado para você/.test(txt) && !/Nova entrada/.test(txt), txt.slice(0, 80));
  await m.page.close();
  });

  // 15. celular de toque: sem cola de teclado; a busca fecha num botão "Fechar"
  await passo("15. celular de toque: some Ctrl K e o pé de teclas da busca; botão Fechar", async () => {
  const t = await abrir({ papel: 'admin' }, 375, true);
  const ctrlK = await t.page.$$eval('.kbd-css, .acao-busca kbd', (ks) => ks.filter((k) => k.getClientRects().length).length);
  conferir('toque: nenhum "Ctrl K" na tela', ctrlK === 0, String(ctrlK));
  await t.page.tap('#bBusca'); await espera(200);
  const pe = await t.page.$eval('.busca-pe', (p) => p.getClientRects().length);
  const fechar = await t.page.$eval('#buscaFechar', (b) => b.textContent.trim());
  conferir('toque: sem o pé "↑ ↓ · Enter · Esc" na busca; botão diz Fechar', pe === 0 && fechar === 'Fechar', `pe=${pe} botão=${fechar}`);
  await t.page.tap('#buscaFechar'); await espera(150);
  conferir('toque: Fechar fecha a busca', await t.page.$eval('#busca', (b) => b.hidden));
  await t.page.close();
  const d = await abrir({ papel: 'admin' }, 1440);
  const kd = await d.page.$$eval('.kbd-css', (ks) => ks.filter((k) => k.getClientRects().length).length);
  conferir('computador com mouse: o "Ctrl K" continua', kd > 0, String(kd));
  await d.page.close();
  });

  // 16. Esqueci a senha: dois toques seguidos pedem um link só; pedir de novo no mesmo minuto só avisa
  await passo("16. Esqueci a senha não gasta dois envios com dois toques", async () => {
  const e = await abrir({ papel: 'admin', sessao: false, atraso: 600 }, 375);
  await e.page.evaluate(() => { document.querySelector('#lEmail').value = 'balcao@oficina.test'; });
  await e.page.click('#lEsqueci');
  await e.page.click('#lEsqueci').catch(() => {});
  await espera(900);
  const pedidos = () => e.page.evaluate(() => window.__GRAVADO.filter((g) => g.acao === 'link-de-senha').length);
  conferir('esqueci: dois toques seguidos pedem um link só', (await pedidos()) === 1, 'pedidos ' + (await pedidos()));
  const caixa = await e.page.evaluate(() => { const t = document.querySelector('#toast').getBoundingClientRect(), b = document.querySelector('#lEsqueci').getBoundingClientRect(); return { larg: Math.round(t.width), cobre: t.top < b.bottom && t.bottom > b.top }; });
  conferir('aviso no celular usa a largura da tela e não cobre o "Esqueci a senha"', caixa.larg >= 300 && !caixa.cobre, JSON.stringify(caixa));
  await e.page.$eval('#lEsqueci', (b) => b.click()); await espera(800);   // (o aviso do 1º pedido fica por cima do botão no celular)
  const aviso = await e.page.$eval('#toast', (t) => t.textContent);
  conferir('esqueci: pedir de novo no mesmo minuto não envia e diz para olhar o spam', (await pedidos()) === 1 && /spam/.test(aviso), aviso.slice(0, 70));
  await e.page.close();
  });

  // 18. tarefas pelo teclado: depois de concluir o foco vai para a próxima; depois de adiar fica na mesma
  await passo("18. tarefas: o foco não se perde ao concluir nem ao adiar", async () => {
  const t = await abrir({ papel: 'admin' }, 1440);
  const ids = await t.page.$$eval('#listaTarefas li[data-tid]', (lis) => lis.map((li) => li.dataset.tid));
  await t.page.focus(`[data-tarefa="${ids[0]}"]`); await t.page.keyboard.press('Space'); await espera(500);
  const foco1 = await t.page.evaluate(() => { const a = document.activeElement; return a ? (a.dataset.tarefa || a.id || a.tagName) : ''; });
  conferir('concluir pelo teclado: o foco vai para a tarefa seguinte', foco1 === ids[1], foco1 + ' (esperado ' + ids[1] + ')');
  await t.page.focus(`[data-adiar="${ids[1]}"]`); await t.page.keyboard.press('Enter'); await espera(400);
  const foco2 = await t.page.evaluate(() => { const a = document.activeElement; return a ? (a.dataset.adiar || a.id || a.tagName) : ''; });
  conferir('adiar pelo teclado: o foco fica no adiar da mesma tarefa', foco2 === ids[1], foco2);
  await t.page.close();
  });

  // 19. "dispensar por hoje" tem Desfazer e o foco não cai no começo da página
  await passo("19. Ontem e amanhã: dispensar tem Desfazer", async () => {
  const m = await abrir({ papel: 'admin' }, 1440);
  await m.page.evaluate(() => { localStorage.setItem('indycar_manha_2020-01-01', '1'); });
  const visivel = await m.page.$eval('#manha', (s) => !s.hidden);
  if (!visivel) { conferir('Ontem e amanhã aparece para o dono', false); await m.page.close(); return; }
  await m.page.click('#manhaFechar'); await espera(200);
  const depois = await m.page.evaluate(() => ({ escondido: document.querySelector('#manha').hidden, foco: document.activeElement && document.activeElement.id, botao: (document.querySelector('#toast .toast-btn') || {}).textContent, velha: localStorage.getItem('indycar_manha_2020-01-01') }));
  conferir('dispensar: some, o foco vai para o conteúdo e o aviso tem Desfazer; marca de dia velho apagada', depois.escondido && depois.foco === 'miolo' && depois.botao === 'Desfazer' && depois.velha === null, JSON.stringify(depois));
  await m.page.click('#toast .toast-btn'); await espera(200);
  const voltou = await m.page.evaluate(() => ({ visivel: !document.querySelector('#manha').hidden, foco: document.activeElement && document.activeElement.id, marcas: Object.keys(localStorage).filter((k) => k.startsWith('indycar_manha_')).length }));
  conferir('Desfazer: o bloco volta, o foco volta ao botão e nada fica marcado', voltou.visivel && voltou.foco === 'manhaFechar' && voltou.marcas === 0, JSON.stringify(voltou));
  await m.page.close();
  });

  // 20. sino pelo teclado: ⏱ leva às opções; escolher uma ou marcar ✓ deixa o foco na lista (não no começo da página)
  await passo("20. sino: o foco fica na lista depois de adiar e de marcar como lida", async () => {
  const s = await abrir({ papel: 'admin' }, 1440);
  await s.page.click('#bSino'); await espera(500);
  const qual = () => s.page.evaluate(() => { const a = document.activeElement; return a ? (a.dataset.adiarPor ? 'opção' : a.dataset.notif ? 'aviso' : a.dataset.adiarSino ? 'adiar' : a.id || a.tagName) : ''; });
  const focarVisivel = (sel) => s.page.evaluate((q) => { const b = [...document.querySelectorAll(q)].find((x) => !x.closest('details:not([open])')); if (b) b.focus(); return !!b; }, sel);
  await focarVisivel('#listaNotif [data-adiar-sino]'); await s.page.keyboard.press('Enter'); await espera(150);
  conferir('sino: Enter no ⏱ leva o foco para a 1ª opção de adiar', (await qual()) === 'opção', await qual());
  await s.page.keyboard.press('Enter'); await espera(200);
  conferir('sino: depois de adiar, o foco vai para o aviso vizinho', (await qual()) === 'aviso', await qual());
  await focarVisivel('#listaNotif [data-ler]'); await s.page.keyboard.press('Enter'); await espera(200);
  conferir('sino: depois do ✓, o foco fica no aviso (ou no vizinho)', (await qual()) === 'aviso', await qual());
  await s.page.close();
  });

  // 21. tecla t: vai para as tarefas COM o foco; sem animação para quem pediu menos movimento (o roteiro pede)
  await passo("21. tecla t leva o foco às tarefas, sem animar com menos movimento", async () => {
  const t = await abrir({ papel: 'admin' }, 1440);
  await t.page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
  await t.page.keyboard.press('t'); await espera(30);
  const r = await t.page.evaluate(() => ({ foco: document.activeElement && document.activeElement.id, y: Math.round(window.scrollY) }));
  await espera(700);
  r.yDepois = await t.page.evaluate(() => Math.round(window.scrollY));
  conferir('tecla t: o foco vai para "Minhas tarefas" e a página já está lá (sem rolar devagar)', r.foco === 'tTarefas' && r.y > 300 && r.y === r.yDepois, JSON.stringify(r));
  await t.page.close();
  });

  // 17. busca que falhou tem "tentar de novo" (antes só apagando e digitando de novo)
  await passo("17. busca com erro oferece tentar de novo", async () => {
  const b = await abrir({ papel: 'admin', falhar: ['r6_busca_global'] }, 1440);
  await b.page.click('#bBusca'); await espera(150);
  await b.page.type('#buscaInput', 'gabi'); await espera(900);
  const erro = await b.page.$eval('#buscaLista', (l) => ({ texto: l.innerText, alerta: !!l.querySelector('[role="alert"]'), botao: !!l.querySelector('[data-busca-de-novo]') }));
  conferir('busca com erro: aviso falado e botão tentar de novo', erro.alerta && erro.botao, erro.texto.slice(0, 60));
  await b.page.click('[data-busca-de-novo]'); await espera(600);
  const depois = await b.page.evaluate(() => [document.activeElement && document.activeElement.id, !!document.querySelector('#buscaLista [data-busca-de-novo]')]);
  conferir('tentar de novo busca outra vez e o foco volta ao campo', depois[0] === 'buscaInput' && depois[1], JSON.stringify(depois));
  await b.page.close();
  });

  // 22. "g": a dica só lista os apps da pessoa; "g f" abre o Tráfego (antes só o 7)
  await passo("22. g mostra só os apps da pessoa; g f abre o Tráfego", async () => {
  const g = await abrir({ papel: 'admin' }, 1440);
  await g.page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.__ABAS.length = 0; });
  await g.page.keyboard.press('g'); await espera(60);
  const dicaAdmin = await g.page.$eval('#toast', (t) => t.textContent);
  await g.page.keyboard.press('f'); await espera(100);
  const abas = await g.page.evaluate(() => window.__ABAS.slice());
  conferir('g f abre o Tráfego na aba indycar-trafego', abas.length === 1 && abas[0][0] === '/trafego/' && abas[0][1] === 'indycar-trafego', JSON.stringify(abas));
  conferir('dica do g (dono): tem o Tráfego', /f Tráfego/.test(dicaAdmin), dicaAdmin);
  await g.page.close();
  const m = await abrir({ papel: 'agenda' }, 1440);
  await m.page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
  await m.page.keyboard.press('g'); await espera(60);
  const dicaAgenda = await m.page.$eval('#toast', (t) => t.textContent);
  conferir('dica do g (agenda): só Agenda e Pátio, sem app sem acesso', /a Agenda/.test(dicaAgenda) && /p Pátio/.test(dicaAgenda) && !/CRM|Tráfego|Orçador|Atendimento|Comunicar/.test(dicaAgenda), dicaAgenda);
  await m.page.close();
  });

  // 23. ficha que não abriu: o leitor de tela ouve o erro e "tentar de novo" deixa o foco na janela
  await passo("23. ficha com erro é anunciada", async () => {
  const f = await abrir({ papel: 'admin', falhar: ['r6_cliente_360'] }, 1440);
  await f.page.click('#bBusca'); await espera(150);
  await f.page.type('#buscaInput', 'gabi'); await espera(900);
  await f.page.click('#buscaLista [data-ficha]'); await espera(700);
  const erro = await f.page.$eval('#fichaCorpo', (c) => ({ alerta: !!c.querySelector('[role="alert"] [data-ficha-de-novo]'), texto: c.innerText.slice(0, 50) }));
  conferir('ficha com erro: aviso falado (role alert) com tentar de novo', erro.alerta, erro.texto);
  await f.page.click('[data-ficha-de-novo]'); await espera(500);
  const foco = await f.page.evaluate(() => document.activeElement && document.activeElement.id);
  conferir('ficha: tentar de novo deixa o foco dentro da janela', foco === 'fichaFechar', foco);
  await f.page.close();
  });

  // 24. busca reaberta depois de uma pesquisa: setas + Enter na tela inicial abrem o item (antes só redesenhava a tela)
  await passo("24. busca reaberta: Enter abre o item marcado", async () => {
  const b = await abrir({ papel: 'admin' }, 1440);
  await b.page.click('#bBusca'); await espera(150);
  await b.page.type('#buscaInput', 'gabi'); await espera(900);
  await b.page.keyboard.press('Escape'); await espera(150);
  await b.page.evaluate(() => {
    window.__CLIQUES = [];   // link com target abriria outra aba: aqui só anota para onde ia
    document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a[target]'); if (a) { window.__CLIQUES.push(a.getAttribute('href')); e.preventDefault(); } }, true);
    document.activeElement && document.activeElement.blur();
  });
  await b.page.keyboard.press('/'); await espera(200);
  const ir = await b.page.evaluate(() => [...document.querySelectorAll('#buscaLista [data-linha]')].findIndex((el) => el.id === 'bl-ir-agenda'));
  for (let i = 0; i <= ir; i++) await b.page.keyboard.press('ArrowDown');
  await b.page.keyboard.press('Enter'); await espera(200);
  const cliques = await b.page.evaluate(() => window.__CLIQUES.slice());
  conferir('busca reaberta: setas até "Agenda" e Enter abrem a Agenda', cliques.includes('/agenda/'), JSON.stringify({ cliques, ir }));
  await b.page.close();
  });

  // 25. buscas recentes pelas setas (antes as setas pulavam direto para os comandos)
  await passo("25. buscas recentes entram nas setas", async () => {
  const b = await abrir({ papel: 'admin' }, 1440);
  await b.page.evaluate(() => { localStorage.setItem('indycar_central_buscas', JSON.stringify(['HB20'])); document.activeElement && document.activeElement.blur(); });
  await b.page.keyboard.press('/'); await espera(200);
  await b.page.keyboard.press('ArrowDown'); await espera(50);
  const r = await b.page.evaluate(() => ({ ativo: document.querySelector('#buscaLista .ativa')?.id || '', desc: document.querySelector('#buscaInput').getAttribute('aria-activedescendant'), ouve: document.querySelector('#buscaAnuncio')?.textContent || '' }));
  conferir('busca: a 1ª seta marca a busca recente e o leitor ouve "Buscar de novo: HB20"', r.ativo === 'br-0' && r.desc === 'br-0' && /Buscar de novo: HB20/.test(r.ouve), JSON.stringify(r));
  await b.page.keyboard.press('Enter'); await espera(900);
  const depois = await b.page.evaluate(() => ({ campo: document.querySelector('#buscaInput').value, achou: document.querySelectorAll('#buscaLista [data-linha]').length }));
  conferir('busca: Enter na recente busca de novo', depois.campo === 'HB20' && depois.achou > 0, JSON.stringify(depois));
  // "limpar": a lista some, o foco volta ao campo e o leitor ouve que apagou
  await b.page.evaluate(() => { const i = document.querySelector('#buscaInput'); i.value = ''; i.dispatchEvent(new Event('input')); });
  await espera(500);
  await b.page.focus('[data-limpar-recentes]');
  await b.page.keyboard.press('Enter'); await espera(150);
  const limpo = await b.page.evaluate(() => ({ foco: document.activeElement?.id || document.activeElement?.tagName, recentes: document.querySelectorAll('#buscaLista [data-recente]').length, ouve: document.querySelector('#buscaAnuncio')?.textContent || '' }));
  conferir('busca: "limpar" as recentes devolve o foco ao campo e avisa', limpo.foco === 'buscaInput' && limpo.recentes === 0 && /apagadas/.test(limpo.ouve), JSON.stringify(limpo));
  await b.page.close();
  });

  // 26. filtros das tarefas e do sino pelo teclado: o foco fica no filtro escolhido (antes caía no começo da página)
  await passo("26. filtros mantêm o foco", async () => {
  const f = await abrir({ papel: 'admin' }, 1440);
  await f.page.focus('#tFiltros [data-filtro-t="vencidas"]');
  await f.page.keyboard.press('Enter'); await espera(150);
  const t = await f.page.evaluate(() => ({ foco: document.activeElement?.dataset?.filtroT || document.activeElement?.tagName, marcado: document.querySelector('#tFiltros [aria-pressed="true"]')?.dataset.filtroT }));
  conferir('tarefas: Enter no filtro "Vencidas" filtra e o foco fica nele', t.foco === 'vencidas' && t.marcado === 'vencidas', JSON.stringify(t));
  await f.page.click('#bSino'); await espera(500);
  const alvo = await f.page.evaluate(() => [...document.querySelectorAll('#sinoFiltros [data-filtro]')].map((b) => b.dataset.filtro).find((x) => x));
  await f.page.evaluate((a) => [...document.querySelectorAll('#sinoFiltros [data-filtro]')].find((b) => b.dataset.filtro === a).focus(), alvo);
  await f.page.keyboard.press('Enter'); await espera(150);
  const s = await f.page.evaluate(() => ({ foco: document.activeElement?.dataset?.filtro ?? document.activeElement?.tagName, aberto: !document.querySelector('#painelSino').hidden }));
  conferir('sino: Enter num filtro de app filtra e o foco fica nele', s.foco === alvo && s.aberto, JSON.stringify({ ...s, alvo }));
  await f.page.close();
  });

  // 27. "tentar de novo" das tarefas e do sino: o foco fica perto da lista (antes caía no corpo da página)
  await passo("27. tentar de novo mantém o foco", async () => {
  const f = await abrir({ papel: 'admin', falhar: ['tarefas', 'notificacoes'] }, 1440);
  await f.page.focus('[data-tarefas-de-novo]');
  await f.page.keyboard.press('Enter'); await espera(300);
  const t = await f.page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  conferir('tarefas: "tentar de novo" deixa o foco no título "Minhas tarefas"', t === 'tTarefas', t);
  await f.page.click('#bSino'); await espera(500);
  await f.page.focus('[data-sino-de-novo]');
  await f.page.keyboard.press('Enter'); await espera(300);
  const s = await f.page.evaluate(() => ({ foco: document.activeElement?.id || document.activeElement?.tagName, aberto: !document.querySelector('#painelSino').hidden }));
  conferir('sino: "tentar de novo" deixa o foco dentro do sino', s.foco === 'sinoBusca' && s.aberto, JSON.stringify(s));
  await f.page.close();
  });
} finally {
  await browser.close();
}
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} conferências ok`);
process.exit(falhas.length ? 1 : 0);
