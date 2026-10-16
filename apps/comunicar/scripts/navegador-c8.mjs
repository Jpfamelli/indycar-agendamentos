// Roteiro de navegador da verificação C8 — cancelar a campanha NO MEIO (mock no ar: `npm run mock`).
//   node scripts/navegador-c8.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
const DIR = process.env.PUPPETEER_DIR || 'C:/Users/USER/.claude/backups/indycar-ferramentas';
const puppeteer = createRequire(path.join(DIR, 'package.json'))('puppeteer-core');
const BASE = process.env.MOCK_URL || 'http://localhost:3511';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhou = 0;
const ok = (larg, nome, cond, extra = '') => { if (!cond) falhou++; console.log(`${cond ? '✔' : '✖'} [${larg}] ${nome}${extra ? ` — ${extra}` : ''}`); };
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
for (const larg of [1440, 375]) {
  for (const papel of ['gestor', 'atendente']) {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    const erros = []; page.on('pageerror', (e) => erros.push(String(e.message || e)));
    let confirmou = 0; page.on('dialog', (d) => { if (d.type() === 'confirm') confirmou++; d.accept(); });
    await page.setViewport(larg === 375 ? { width: 375, height: 812, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
    await page.goto(`${BASE}/?papel=${papel}&semente=1&saude=ok&tour=0`, { waitUntil: 'networkidle0' }); await espera(700);
    await page.evaluate(() => document.querySelector('[data-route="campanhas"]')?.click()); await espera(900);
    const n = () => page.evaluate(() => document.querySelectorAll('[data-cancelar-lote]').length);
    if (papel === 'atendente') {
      ok(larg, 'atendente NÃO vê "Cancelar o que falta"', (await n()) === 0);
    } else {
      ok(larg, 'gestor vê o botão com a contagem de pendentes', (await n()) === 1 && /Cancelar o que falta \(3\)/.test(await page.evaluate(() => document.querySelector('[data-cancelar-lote]').textContent)));
      await page.evaluate(() => document.querySelector('[data-cancelar-lote]').click()); await espera(1100);
      ok(larg, 'pede confirmação, cancela e o botão some (nada mais pendente)', confirmou === 1 && (await n()) === 0);
      const sem = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      ok(larg, 'sem rolagem lateral', sem);
    }
    ok(larg, `${papel}: zero erro de console`, !erros.length, erros.slice(0, 2).join(' | '));
    await ctx.close();
  }
}
await browser.close(); process.exit(falhou ? 1 : 0);
