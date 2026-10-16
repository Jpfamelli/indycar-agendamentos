/* Roteiro de navegador (16/10): lead de colega travado na ficha e mensagem SEM CONFIRMAÇÃO
   (o CodeWords não respondeu a tempo depois do pedido) com "Chegou" / "Reenviar".
   Uso: PORT=3227 node scripts/mock-server.mjs   (em outro terminal)
        BASE=http://localhost:3227 node scripts/roteiro-r5c-dono-confirmacao.cjs */
const puppeteer = require('C:/Users/USER/.claude/backups/indycar-ferramentas/node_modules/puppeteer-core');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:3227';
const OUT = path.join(__dirname, 'shots-tela', 'r5c-');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const espera = ms => new Promise(r => setTimeout(r, ms));
const CAMILA = 'c0000000-0000-4000-8000-000000000001';
let total = 0, bons = 0;
const ok = (nome, cond, extra = '') => { total++; if (cond) bons++; console.log(`${cond ? 'OK  ' : 'FALHOU'} ${nome}${cond ? '' : ' — ' + extra}`); };

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  for (const largura of [1440, 375]) {
    for (const papel of ['atendente', 'gestor']) {
      const ctx = await browser.createBrowserContext(); const p = await ctx.newPage();
      const erros = [];
      p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) erros.push(m.text()); });
      p.on('pageerror', e => erros.push('PAGEERROR ' + e.message));
      let confirmou = 0; p.on('dialog', d => { confirmou++; d.dismiss(); });
      await p.setViewport(largura < 600 ? { width: largura, height: 812, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { width: largura, height: 900 });
      await p.goto(`${BASE}/?papel=${papel}&saude=ok&conversa=${CAMILA}`, { waitUntil: 'networkidle0' });
      await espera(1200);
      // o mock guarda o estado entre rodadas: volta a mensagem para "sem confirmação" e recarrega
      await p.evaluate(() => sb.from('whatsapp_mensagens').update({ status: 'falhou', erro: 'Sem confirmação: o CodeWords não respondeu em 60 s — não sabemos se a mensagem chegou. Confira na conversa do WhatsApp antes de mandar de novo.' }).eq('id', 'm9'));
      await p.reload({ waitUntil: 'networkidle0' }); await espera(1500);
      const w = `[${papel} ${largura}]`;
      // mensagem sem confirmação
      const msg = await p.evaluate(() => { const b = document.querySelector('[data-chegou]'); const bolha = b?.closest('[data-msg], .msg, .bolha') || b?.parentElement; return { chegou: !!b, reenviar: !!document.querySelector('[data-reenviar][data-forcar]'), txt: bolha?.textContent || '' }; });
      ok(`${w} mensagem sem confirmação: "não sabemos se chegou — confira no WhatsApp" com Chegou e Reenviar`, msg.chegou && msg.reenviar && /não sabemos se chegou/.test(msg.txt), JSON.stringify(msg).slice(0, 200));
      await p.evaluate(() => document.querySelector('[data-reenviar][data-forcar]').click()); await espera(300);
      ok(`${w} "Reenviar" pede confirmação antes (cancelado: nada sai)`, confirmou === 1 && !!(await p.$('[data-chegou]')));
      await p.screenshot({ path: OUT + `${papel}-${largura}-conversa.png` });
      await p.evaluate(() => document.querySelector('[data-chegou]').click()); await espera(800);
      ok(`${w} "Chegou" marca como entregue (some o aviso)`, !(await p.$('[data-chegou]')));
      // ficha: lead de colega travado para o atendente
      await p.evaluate(() => { const b = document.querySelector('#btnFicha, [data-acao="ficha"], #abrirFicha'); if (b && getComputedStyle(b).display !== 'none') b.click(); });
      await espera(900);
      const f = await p.evaluate(() => ({ selo: [...document.querySelectorAll('.item-lead')].map(i => ({ txt: i.textContent.replace(/\s+/g, ' ').trim(), editar: !!i.querySelector('[data-editar-lead]') })) }));
      const colega = f.selo.find(x => /Revisão dos 60 mil/.test(x.txt)), meu = f.selo.find(x => /Alinhamento 3D/.test(x.txt));
      if (papel === 'atendente') {
        ok(`${w} ficha: lead da colega com selo "🔒 de Maria" e sem Editar`, colega && /🔒 de Maria/.test(colega.txt) && !colega.editar, JSON.stringify(f).slice(0, 300));
        ok(`${w} ficha: lead sem dono continua com Editar`, meu && meu.editar);
      } else {
        ok(`${w} gestor: edita lead de qualquer um (sem selo)`, colega && colega.editar && !/🔒/.test(colega.txt), JSON.stringify(f).slice(0, 300));
      }
      ok(`${w} sem rolagem lateral`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      await p.screenshot({ path: OUT + `${papel}-${largura}-ficha.png` });
      ok(`${w} zero erro de console`, !erros.length, erros.slice(0, 2).join(' | '));
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`\n${bons}/${total} verificações ok`);
  process.exit(bons === total ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
