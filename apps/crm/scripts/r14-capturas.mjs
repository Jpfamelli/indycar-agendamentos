// Rodada 14: capturas do CRM no servidor de mentira (1440 e 375, escuro e claro) + conferência
// de rolagem lateral, toques menores que 44 px no celular e erros de console.
// Uso:  PORT=3614 MOCK_LEADS=560 npm run mock   e depois   node scripts/r14-capturas.mjs [prefixo-do-arquivo] [base]
// Grava em qa-out/r14/. Bloqueia todo endereço fora de 127.0.0.1. Usa o Chrome instalado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || 'C:/Users/USER/.claude/backups/indycar-ferramentas/node_modules/puppeteer-core');
const PREFIXO = process.argv[2] || 'depois';
const BASE = process.argv[3] || 'http://127.0.0.1:3614';
const SAIDA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../qa-out/r14');
fs.mkdirSync(SAIDA, { recursive: true });
const espera = ms => new Promise(r => setTimeout(r, ms));

// telas: nome, como chegar lá (dentro da página)
const TELAS = [
  ['entrada', null],
  ['sem-responsavel', async () => { irPara('distribuir'); await new Promise(r => setTimeout(r, 1500)); }],
  ['faxina-lista', async () => { irPara('distribuir'); const d = document.querySelector('#r14Detalhe'); if (d && !d.hidden) d.open = true; }],
];
const relatorio = [];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
try {
  for (const tema of ['escuro', 'claro']) for (const [w, h] of [[1440, 900], [375, 812]]) {
    const page = await browser.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
    await page.setRequestInterception(true);
    page.on('request', r => { const u = r.url(); if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:')) return r.abort(); r.continue(); });
    await page.setViewport({ width: w, height: h, isMobile: w < 768, hasTouch: w < 768 });
    await page.evaluateOnNewDocument(t => { try { localStorage.setItem('indycar_tema', t); sessionStorage.removeItem('indycar_crm_aba'); } catch {} }, tema);
    await page.goto(BASE + '/?papel=gestor', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.classList.contains('deslogado') && typeof TODOS !== 'undefined' && TODOS.length, { timeout: 20000 });
    await espera(1500);
    for (const [nome, ir] of TELAS) {
      if (ir) { await page.evaluate(ir); await espera(1500); }
      const medida = await page.evaluate((movel, largura) => {
        const lateral = Math.max(document.documentElement.scrollWidth, window.innerWidth) > largura + 1;
        const pequenos = [];
        if (movel) for (const el of document.querySelectorAll('button, a[href], select, input:not([type=hidden]), [role=tab]')) {
          const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
          if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('[hidden], .sr, .pular, dialog:not([open])')) continue;
          if (el.closest('.modal-bg:not(.open)')) continue;
          if (r.height < 44 || r.width < 44) {
            if (el.type === 'checkbox' || el.type === 'radio') { const lab = el.closest('label, td'); const lr = lab?.getBoundingClientRect(); if (lr && lr.height >= 44) continue; }
            pequenos.push((el.id || el.className || el.tagName).toString().slice(0, 40) + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
        }
        return { lateral, pequenos: [...new Set(pequenos)].slice(0, 12) };
      }, w < 768, w);
      const arq = `${PREFIXO}-${nome}-${w}-${tema}.png`;
      await page.screenshot({ path: path.join(SAIDA, arq), fullPage: true });
      relatorio.push(`${arq} · lateral ${medida.lateral ? 'SIM' : 'não'} · toques pequenos ${medida.pequenos.length}${medida.pequenos.length ? ' (' + medida.pequenos.join('; ') + ')' : ''}`);
      
    }
    relatorio.push(`[${tema} ${w}] erros de console: ${erros.length}${erros.length ? ' · ' + erros.slice(0, 5).join(' | ') : ''}`);
    await page.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(SAIDA, `${PREFIXO}-capturas.txt`), relatorio.join('\n') + '\n');
console.log(relatorio.join('\n'));
