// Rodada 18 · capturas do Comunicar no servidor de mentira (npm run mock, porta 3511).
// Uso: node scripts/qa-r18.mjs <prefixo>   → qa-out/r18/<prefixo>-<aba>-<largura>-<tema>.png
// Rede externa bloqueada; falha se a página tiver erro, rolagem lateral no celular ou toque < 44 px no topo.
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const origem = process.env.ORIGEM || 'http://localhost:3511';
const prefixo = process.argv[2] || 'depois';
const abas = (process.env.ABAS || 'reguas,mensagens,campanhas,clientes,ajustes').split(',');
const busca = process.env.BUSCA || '?papel=admin';
const saida = path.join(aqui, '..', 'qa-out', 'r18');
await mkdir(saida, { recursive: true });

const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || path.join(aqui, '../../../../indycar-ferramentas/node_modules/puppeteer-core'));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--disable-background-networking'],
});
const problemas = [];
try {
  for (const largura of [1440, 375]) {
    for (const tema of ['escuro', 'claro']) {
      for (const aba of abas) {
        const page = await browser.newPage();
        const erros = [];
        page.on('pageerror', (e) => erros.push(String(e.message || e)));
        page.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(m.text())) erros.push(m.text()); });
        await page.setBypassServiceWorker(true);
        await page.setRequestInterception(true);
        page.on('request', (r) => (new URL(r.url()).origin !== origem ? r.abort('blockedbyclient') : r.continue()));
        await page.setViewport({ width: largura, height: largura < 500 ? 812 : 900 });
        await page.evaluateOnNewDocument((t) => localStorage.setItem('indycar_tema', t), tema);
        await page.goto(origem + '/' + busca, { waitUntil: 'networkidle0' });
        if (aba !== 'reguas') {
          await page.$eval(`.nav-item[data-route="${aba}"]`, (b) => b.click());
          await page.waitForNetworkIdle({ idleTime: 300 });
        }
        await new Promise((r) => setTimeout(r, 1400));
        const medida = await page.evaluate(() => ({
          lateral: document.documentElement.scrollWidth - window.innerWidth,
          quebrou: /Não deu para abrir esta tela/.test(document.querySelector('#view')?.textContent || ''),
          pequenos: [...document.querySelectorAll('.ic-topo button, .ic-topo a, .heroi button, .regua-acoes button, .sw')]
            .filter((el) => el.offsetParent && el.getBoundingClientRect().height < 44)
            .map((el) => (el.className || el.tagName) + ':' + Math.round(el.getBoundingClientRect().height)).slice(0, 6),
        }));
        const nome = `${prefixo}-${aba}-${largura}-${tema}.png`;
        await page.screenshot({ path: path.join(saida, nome), fullPage: true });
        if (largura < 500) await page.screenshot({ path: path.join(saida, nome.replace('.png', '-topo.png')) });
        if (medida.quebrou) problemas.push(`${nome}: a tela não abriu`);
        if (erros.length) problemas.push(`${nome}: erro ${erros.join(' | ')}`);
        if (largura < 500 && medida.lateral > 0) problemas.push(`${nome}: rolagem lateral de ${medida.lateral}px`);
        if (largura < 500 && medida.pequenos.length) problemas.push(`${nome}: toques pequenos ${medida.pequenos.join(', ')}`);
        console.log('ok', nome);
        await page.close();
      }
    }
  }
} finally { await browser.close(); }
if (problemas.length) { console.log('PROBLEMAS:\n' + problemas.join('\n')); process.exitCode = 1; } else console.log('sem problemas');
