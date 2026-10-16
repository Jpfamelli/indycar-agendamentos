// Roteiro de navegador da rodada 4 — com o mock no ar (`npm run mock`):
//   node scripts/navegador-rodada4.mjs
// puppeteer-core + Chrome instalado, em 1440 e 375 px. Confere: "Pronto para
// ligar", carteiro, próximos 30 dias, alcance nas réguas, aniversários (colar,
// CSV, procurar), rascunho das réguas, paginação, ajuda/tour por papel,
// "pedir ao gestor", tela "acordando" (?dormir=) e acessibilidade básica.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = process.env.PUPPETEER_DIR || 'C:/Users/USER/.claude/backups/indycar-ferramentas';
const puppeteer = createRequire(path.join(DIR, 'package.json'))('puppeteer-core');
const BASE = process.env.MOCK_URL || 'http://localhost:3511';
const SHOTS = process.env.SHOTS_DIR || path.resolve('capturas-r4');
fs.mkdirSync(SHOTS, { recursive: true });

const resultados = [];
const ok = (larg, nome, cond, extra = '') => { resultados.push({ larg, nome, ok: !!cond, extra }); console.log(`${cond ? '✔' : '✖'} [${larg}] ${nome}${extra ? ` — ${extra}` : ''}`); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });

async function abrir(larg, qs, { contexto = null } = {}) {
  const ctx = contexto || await browser.createBrowserContext();
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g|503|Service Unavailable/.test(m.text())) erros.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  if (larg === 375) await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}/?${qs}`, { waitUntil: 'networkidle0' });
  await espera(700);
  page.__erros = erros; page.__ctx = ctx;
  return page;
}
const visivel = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; }, sel);
const texto = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() || '', sel);
const conta = (page, sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
const semRolagemLateral = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const clicar = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; el.click(); return true; }, sel);
const foto = (page, nome) => page.screenshot({ path: path.join(SHOTS, `${nome}.png`) });
const fechar = async (page) => { await page.keyboard.press('Escape'); await espera(250); };
const semErros = (larg, page, quem) => ok(larg, `${quem}: zero erro de console`, !page.__erros.length, page.__erros.slice(0, 2).join(' | '));

const csv = path.join(os.tmpdir(), 'aniversarios-teste.csv');
fs.writeFileSync(csv, 'Nome;Telefone;Nascimento\nDiogo Barros;12999990005;05/06/1991\nMarcos Vinícius;12999990010;17/08\nNinguém Daqui;11911112222;01/01/1990\n', 'latin1');

for (const larg of [1440, 375]) {
  // ---------------- admin: pronto, carteiro, 30 dias, aniversários ----------------
  {
    const page = await abrir(larg, 'papel=admin&semente=1&saude=erro&tour=0');
    ok(larg, 'admin: "Pronto para ligar" aparece no Início', await visivel(page, '#painelPronto .pronto'));
    ok(larg, 'pronto: 12 itens, a chave recusada é "falta" com o link do Atendimento', await conta(page, '.pronto-lista .pi') === 12
      && await page.evaluate(() => !!document.querySelector('.pi.falta a[href*="indycar-atendimento"]')));
    ok(larg, 'pronto: anel com a contagem acessível', /de 12 itens prontos/.test(await page.$eval('.pronto-anel', (e) => e.getAttribute('aria-label'))));
    ok(larg, 'indicadores por pessoa (Equipe · 30 dias)', await visivel(page, '#painelPessoas') && /Equipe/.test(await texto(page, '#painelPessoas h2')));
    ok(larg, 'início sem rolagem lateral', await semRolagemLateral(page));
    await foto(page, `admin-pronto-${larg}`);
    // carteiro
    await clicar(page, '#btnCarteiro'); await espera(700);
    ok(larg, 'carteiro: modal com 4 números e a linha do tempo', await conta(page, '.modal .rel-nums > div') === 4 && await conta(page, '.cart-linha i') > 10);
    ok(larg, 'carteiro: mostra chamadas com "servidor dormindo (503)"', /servidor dormindo \(503\)/.test(await texto(page, '#cartCorpo')));
    ok(larg, 'carteiro: modal sem rolagem lateral', await semRolagemLateral(page));
    await foto(page, `admin-carteiro-${larg}`);
    await fechar(page);
    // próximos 30 dias
    await clicar(page, '#btnMes'); await espera(700);
    ok(larg, '30 dias: 8 réguas e 30 dias no calendário', await conta(page, '.mes-reguas .mr') === 8 && await conta(page, '.mes-cal .mc-d') === 30);
    await clicar(page, '.mc-d.n4, .mc-d.n3, .mc-d.n2, .mc-d.n1'); await espera(250);
    ok(larg, '30 dias: clicar num dia lista quem recebe', await conta(page, '#mesDia .ag-linha') >= 1, await texto(page, '#mesDia .lista-sep'));
    ok(larg, '30 dias: sem rolagem lateral', await semRolagemLateral(page));
    await foto(page, `admin-mes-${larg}`);
    await fechar(page);
    // aniversários a partir do checklist
    await page.evaluate(() => { const d = document.querySelector('#painelPronto details'); if (d) d.open = true; });
    await clicar(page, '[data-pronto-acao="modal:aniversarios"]'); await espera(500);
    ok(larg, 'checklist abre o cadastro de aniversários', await visivel(page, '#anTexto'));
    await page.type('#anTexto', 'Diogo Barros; (12) 99999-0005; 05/06/1991\nCarlos Eduardo 12 99999-0002 02/03/1975\nFulano de Tal 11/11\nMarcos 31/02');
    await clicar(page, '#anConferir'); await espera(700);
    ok(larg, 'colar: conferência mostra achados, iguais e para conferir', await conta(page, '.an-tabela .an-l:not(.an-h)') === 4 && /1\s*datas novas/.test(await texto(page, '.an-nums')), await texto(page, '.an-nums'));
    ok(larg, 'colar: botão "Gravar 1 data"', /Gravar 1 data/.test(await texto(page, '#anGravar')));
    ok(larg, 'aniversários: sem rolagem lateral', await semRolagemLateral(page));
    await foto(page, `admin-aniv-colar-${larg}`);
    await clicar(page, '#anGravar'); await espera(800);
    ok(larg, 'colar: gravou e avisou', /1 aniversário gravado/.test(await texto(page, '#toast')), await texto(page, '#toast'));
    // CSV
    await page.evaluate(() => R4.abrirAniversarios('arquivo')); await espera(400);
    const input = await page.$('#anArq'); await input.uploadFile(csv); await espera(900);
    ok(larg, 'CSV (Excel em latin1): lê o cabeçalho e acha 2 de 3', /2\s*datas novas|1\s*datas novas/.test(await texto(page, '.an-nums')) && /Ninguém Daqui/.test(await texto(page, '.an-tabela')), await texto(page, '.an-nums'));
    await foto(page, `admin-aniv-csv-${larg}`);
    await fechar(page);
    // procurar nas conversas
    await page.evaluate(() => R4.abrirAniversarios('procurar')); await espera(700);
    ok(larg, 'procurar: 3 sugestões com o trecho', await conta(page, '.an-item') === 3 && await conta(page, '.an-item q') === 3);
    await clicar(page, '#anGravarSug'); await espera(800);
    ok(larg, 'procurar: grava as marcadas', /gravado/.test(await texto(page, '#toast')), await texto(page, '#toast'));
    semErros(larg, page, 'admin');
    await page.__ctx.close();
  }

  // ---------------- gestor: réguas (alcance + rascunho), mensagens, ajuda/tour ----------------
  {
    const page = await abrir(larg, 'papel=gestor&saude=ok&tour=0');
    await clicar(page, '[data-route="reguas"]'); await espera(1100);
    ok(larg, 'réguas: cada régua mostra o alcance em 30 dias', await conta(page, '.regua .alcance') === 8, await texto(page, '.regua[data-regua="posvenda"] .alcance'));
    ok(larg, 'título da aba muda com a tela', /^Réguas · IndyCar Comunicar/.test(await page.title()));
    ok(larg, 'leitor de tela é avisado da tela nova', /Réguas/.test(await texto(page, '#anuncioTela')));
    await page.evaluate(() => { const ta = document.querySelector('#msg_lembrete'); ta.value += ' Rascunho de teste'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
    await espera(300);
    await page.reload({ waitUntil: 'networkidle0' }); await espera(700);
    await clicar(page, '[data-route="reguas"]'); await espera(1200);
    ok(larg, 'rascunho das réguas volta depois de recarregar', /Rascunho de teste/.test(await page.$eval('#msg_lembrete', (e) => e.value)) && await visivel(page, '#barraSalvar'), await texto(page, '#toast'));
    await clicar(page, '#btnSalvar'); await espera(900);
    await page.reload({ waitUntil: 'networkidle0' }); await espera(500);
    await clicar(page, '[data-route="reguas"]'); await espera(1000);
    ok(larg, 'depois de salvar, o rascunho some', !(await visivel(page, '#barraSalvar')));
    await foto(page, `gestor-reguas-${larg}`);
    // mensagens: paginação
    await clicar(page, '[data-route="mensagens"]'); await espera(900);
    ok(larg, 'mensagens: abas acessíveis (aria-selected)', await page.evaluate(() => document.querySelector('.pilula.ativa')?.getAttribute('aria-selected') === 'true'));
    ok(larg, 'mensagens: "Carregar mais" escondido quando cabe tudo numa página', !(await visivel(page, '#maisMsg')));
    // ajuda
    await clicar(page, '#btnAjuda'); await espera(400);
    ok(larg, 'ajuda por papel (gestor vê "Ligar o Comunicar")', /Ligar o Comunicar/.test(await texto(page, '#ajLista')) && !/Não consigo mudar uma régua/.test(await texto(page, '#ajLista')));
    await page.type('#ajBusca', 'aprovar'); await espera(200);
    ok(larg, 'ajuda: busca filtra', await page.evaluate(() => [...document.querySelectorAll('#ajLista .aj')].filter((d) => !d.hidden).length) === 1);
    await foto(page, `gestor-ajuda-${larg}`);
    await clicar(page, '#ajTour'); await espera(500);
    ok(larg, 'rever o tour: cartão com "1 de N"', await visivel(page, '.tour-card') && /^1 de \d/.test(await texto(page, '.tour-n')));
    ok(larg, 'tour: foco no botão do cartão', await page.evaluate(() => document.activeElement?.dataset?.t === 'prox'));
    await foto(page, `gestor-tour-${larg}`);
    await page.keyboard.press('Enter'); await espera(300);
    ok(larg, 'tour: Enter vai para o passo 2', /^2 de/.test(await texto(page, '.tour-n')));
    await page.keyboard.press('Escape'); await espera(300);
    ok(larg, 'tour: Esc fecha', !(await visivel(page, '.tour-card')));
    ok(larg, 'gestor: tela sem rolagem lateral', await semRolagemLateral(page));
    semErros(larg, page, 'gestor');
    await page.__ctx.close();
  }

  // ---------------- atendente: tour automático, pedir ao gestor ----------------
  {
    const page = await abrir(larg, 'papel=atendente&saude=ok&semente=1');
    await espera(900);
    ok(larg, 'atendente: tour de boas-vindas abre sozinho na 1ª vez', await visivel(page, '.tour-card') && /Seu dia/.test(await texto(page, '.tour-card h3')), await texto(page, '.tour-card h3'));
    await foto(page, `atendente-tour-${larg}`);
    await clicar(page, '[data-t="pular"]'); await espera(300);
    await page.reload({ waitUntil: 'networkidle0' }); await espera(1800);
    ok(larg, 'atendente: o tour não volta depois de pular', !(await visivel(page, '.tour-card')));
    ok(larg, 'atendente: checklist oferece "Pedir ao gestor" no lugar de "Ligar réguas"', await page.evaluate(() => !!document.querySelector('.pronto [data-pedir]') && !document.querySelector('.pronto [data-pronto-acao="rota:reguas"]')));
    await clicar(page, '[data-route="reguas"]'); await page.waitForSelector('.toolbar [data-pedir="reguas"]', { timeout: 8000 }).catch(() => {});
    ok(larg, 'réguas do atendente: botão "Pedir ao gestor"', await visivel(page, '.toolbar [data-pedir="reguas"]'));
    await clicar(page, '.toolbar [data-pedir="reguas"]'); await espera(600);
    ok(larg, 'pedir ao gestor: avisa no sino dos gestores', /Pedido enviado: [0-9]+ gestores avisados/.test(await texto(page, '#toast')), await texto(page, '#toast'));
    await page.evaluate(() => R4.abrirAniversarios('colar')); await espera(400);
    await page.type('#anTexto', 'Diogo Barros 12999990005 05/06/1991\nMarcos Vinícius 12999990010 17/08');
    await clicar(page, '#anConferir'); await espera(700);
    ok(larg, 'atendente: lista com 2 datas pede ao gestor para gravar', await visivel(page, '#anPe [data-pedir="importar"]'));
    await clicar(page, '#btnAjuda'); await page.keyboard.press('Escape'); await espera(200);
    await page.evaluate(() => { closeModal(); abrirAjuda(); }); await espera(400);
    ok(larg, 'ajuda do atendente explica o "Pedir ao gestor"', /Não consigo mudar uma régua/.test(await texto(page, '#ajLista')));
    semErros(larg, page, 'atendente');
    await page.__ctx.close();
  }

  // ---------------- Render dormindo: tela "acordando" e volta sozinha ----------------
  {
    const ctx = await browser.createBrowserContext();
    const aquece = await abrir(larg, 'papel=admin&saude=ok&tour=0', { contexto: ctx }); // guarda a config no aparelho
    await aquece.close();
    const page = await abrir(larg, 'papel=admin&saude=ok&tour=0&dormir=7', { contexto: ctx });
    ok(larg, 'dormindo: faixa "O sistema está acordando…"', await visivel(page, '#faixaAcordando') && /acordando/.test(await texto(page, '#faixaAcordando .fa-txt')), await texto(page, '#faixaAcordando .fa-txt'));
    ok(larg, 'dormindo: faixa com "Tentar agora" e aria-live', await visivel(page, '#faixaAcordando .fa-btn') && await page.$eval('#faixaAcordando', (e) => e.getAttribute('aria-live')) === 'polite');
    await foto(page, `acordando-${larg}`);
    let voltou = false;
    for (let i = 0; i < 30 && !voltou; i++) { await espera(500); voltou = await visivel(page, '.hero-dia'); }
    ok(larg, 'dormindo: quando o servidor volta, o app abre sozinho', voltou);
    ok(larg, 'dormindo: avisa "Voltou!"', /Voltou/.test(await texto(page, '#faixaAcordando .fa-txt')) || !(await visivel(page, '#faixaAcordando')));
    await foto(page, `acordou-${larg}`);
    semErros(larg, page, 'acordando');
    await ctx.close();
  }

  // ---------------- acessibilidade básica ----------------
  {
    const page = await abrir(larg, 'papel=admin&saude=ok&tour=0');
    await page.keyboard.press('Tab'); await espera(150);
    ok(larg, 'Tab: o primeiro foco é "Pular para o conteúdo"', await page.evaluate(() => document.activeElement?.classList.contains('pular')));
    ok(larg, 'skip link aparece com o foco', await page.evaluate(() => document.activeElement.getBoundingClientRect().top >= 0));
    await clicar(page, '[data-route="clientes"]'); await espera(900);
    ok(larg, 'trocar de tela leva o foco ao título', await page.evaluate(() => document.activeElement?.tagName === 'H2'));
    ok(larg, 'clientes: botão Aniversários', await visivel(page, '#btnAniv'));
    await page.__ctx.close();
  }
}

await browser.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} verificações ok${falhas.length ? ` — ${falhas.length} falharam` : ''}`);
process.exit(falhas.length ? 1 : 0);
