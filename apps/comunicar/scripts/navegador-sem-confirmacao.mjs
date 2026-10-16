// Roteiro de navegador (16/10): mensagem SEM CONFIRMAÇÃO (CodeWords não respondeu a tempo depois
// do pedido). Saúde do WhatsApp avisa e leva ao filtro; o cartão diz "não sabemos se chegou" com
// "Chegou" e "Reenviar". Mock no ar: `npm run mock` (porta 3511).
//   node scripts/navegador-sem-confirmacao.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
const DIR = process.env.PUPPETEER_DIR || 'C:/Users/USER/.claude/backups/indycar-ferramentas';
const puppeteer = createRequire(path.join(DIR, 'package.json'))('puppeteer-core');
const BASE = process.env.MOCK_URL || 'http://localhost:3511';
const SAIDA = process.env.RELATORIO_DIR || path.join(process.env.TEMP || '.', 'comunicar-sem-confirmacao');
import { mkdirSync } from 'node:fs'; mkdirSync(SAIDA, { recursive: true });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhou = 0;
const ok = (larg, nome, cond, extra = '') => { if (!cond) falhou++; console.log(`${cond ? '✔' : '✖'} [${larg}] ${nome}${extra ? ` — ${extra}` : ''}`); };
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
for (const larg of [1440, 375]) {
  for (const papel of ['gestor', 'atendente']) {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    const erros = []; page.on('pageerror', (e) => erros.push(String(e.message || e)));
    let confirmou = 0; page.on('dialog', (d) => { if (d.type() === 'confirm') confirmou++; d.dismiss(); });
    await page.setViewport(larg === 375 ? { width: 375, height: 812, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
    await page.goto(`${BASE}/?papel=${papel}&semente=1&saude=ok&tour=0`, { waitUntil: 'networkidle0' }); await espera(900);
    const saude = await page.evaluate(() => ({ txt: document.getElementById('painelSaudeWA')?.textContent || '', botao: !!document.querySelector('[data-sw-filtro="sem_confirmacao"]') }));
    ok(larg, `${papel}: Saúde do WhatsApp avisa "sem confirmação" e leva ao filtro`, /sem confirmação/i.test(saude.txt) && saude.botao, saude.txt.slice(0, 160));
    await page.evaluate(() => document.querySelector('[data-sw-filtro="sem_confirmacao"]').click()); await espera(900);
    const lista = await page.evaluate(() => ({ cards: [...document.querySelectorAll('#listaEnvios .envio')].map((c) => ({ duvida: c.querySelector('.envio-duvida')?.textContent || '', chegou: !!c.querySelector('[data-chegou]'), reenviar: !!c.querySelector('[data-reenviar][data-duvida]'), conversa: /Abrir conversa/.test(c.textContent) })), pilula: document.querySelector('.pilulas [aria-selected="true"], .pilulas .on, .pilulas .ativo')?.textContent || '' }));
    const c = lista.cards[0] || {};
    ok(larg, `${papel}: filtro mostra só a sem confirmação com "Não sabemos se chegou — confira no WhatsApp"`, lista.cards.length === 1 && /Não sabemos se chegou/.test(c.duvida) && /confira no WhatsApp/.test(c.duvida) && c.conversa, JSON.stringify(lista));
    ok(larg, `${papel}: sem rolagem lateral`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: path.join(SAIDA, `${papel}-${larg}.png`) });
    if (papel === 'gestor') {
      ok(larg, 'gestor vê "Chegou" e "Reenviar"', c.chegou && c.reenviar);
      await page.evaluate(() => document.querySelector('[data-reenviar][data-duvida]').click()); await espera(500);
      ok(larg, '"Reenviar" pede confirmação (cancelado = nada muda)', confirmou === 1 && (await page.evaluate(() => document.querySelectorAll('#listaEnvios .envio').length)) === 1);
      await page.evaluate(() => document.querySelector('[data-chegou]').click()); await espera(1000);
      ok(larg, '"Chegou" marca como entregue e ela sai do filtro', (await page.evaluate(() => document.querySelectorAll('#listaEnvios .envio').length)) === 0);
    } else {
      ok(larg, 'atendente não marca "Chegou" em mensagem de régua (não é dele)', !c.chegou);
    }
    ok(larg, `${papel}: zero erro de console`, !erros.length, erros.slice(0, 2).join(' | '));
    await ctx.close();
  }
}
await browser.close();
console.log(falhou ? `${falhou} falha(s)` : 'tudo ok', '· capturas em', SAIDA);
process.exit(falhou ? 1 : 0);
