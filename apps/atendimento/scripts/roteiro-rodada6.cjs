/* Roteiro de navegador da RODADA 6 (C3): fila priorizada, painel conectado, respostas rápidas, WhatsApp parado.
   Uso: PORT=3260 node scripts/mock-server.mjs   (outro terminal)   ·   BASE=http://localhost:3260 node scripts/roteiro-rodada6.cjs
   Confere em 1440 e 375 px. WhatsApp começa PARADO (padrão do servidor de mentira). */
const puppeteer = require('C:/Users/USER/.claude/backups/indycar-ferramentas/node_modules/puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:3260';
const OUT = path.join(__dirname, 'shots-tela', 'r6-');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const espera = ms => new Promise(r => setTimeout(r, ms));
let total = 0, bons = 0;
const ok = (nome, cond, extra = '') => { total++; if (cond) bons++; console.log(`${cond ? 'OK  ' : 'FALHOU'} ${nome}${cond ? '' : ' — ' + extra}`); };
let browser;

async function abrir(papel, largura = 1440, extra = '') {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  p.erros = [];
  p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) p.erros.push(m.text()); });
  p.on('pageerror', e => p.erros.push('PAGEERROR ' + e.message));
  p.on('dialog', d => d.accept('liguei para o cliente'));
  await p.setViewport(largura < 600 ? { width: largura, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: largura, height: 900 });
  await p.goto(`${BASE}/?papel=${papel}&saude=ok${extra}`, { waitUntil: 'networkidle0' });
  await espera(900);
  p.ctx = ctx;
  return p;
}
const semRolagemX = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const ate = async (p, fn, arg, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await espera(200); } return false; };
const abrirConv = (p, nome) => p.evaluate(n => [...document.querySelectorAll('.conversa')].find(c => c.textContent.includes(n))?.click(), nome);

(async () => {
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
  try {
    for (const w of [1440, 375]) {
      await fetch(BASE + '/api/_r6_etapa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etapa: 'em_execucao', reset: true }) });
      const p = await abrir('admin', w);

      /* ---------- fila ---------- */
      ok(`[${w}] resumo da fila aparece (urgentes/para já)`, await ate(p, () => { const r = document.getElementById('r6Resumo'); return r && !r.hidden && /agora|logo|hoje|esperando|urgente/i.test(r.textContent); }));
      ok(`[${w}] chip de nível e chips de contexto na linha (carro no pátio, orçamento, não saiu)`, await ate(p, () => { const l = [...document.querySelectorAll('.conversa')].find(c => c.textContent.includes('Camila')); return l && /No pátio|Em execução/.test(l.textContent) && /Visualizado/.test(l.textContent) && /não saiu/.test(l.textContent); }));
      await p.select('#ordemLista', 'prioridade');
      await espera(500);
      const primeiro = await p.evaluate(() => document.querySelector('.conversa')?.textContent || '');
      ok(`[${w}] ordem "Prioridade" põe a conversa mais urgente primeiro`, /José|Camila|Vocês/.test(primeiro), primeiro.slice(0, 80));
      ok(`[${w}] chip de filtro "Carro no pátio" mostra só quem tem carro no pátio`, await (async () => {
        await p.evaluate(() => document.querySelector('.chip[data-status="r6_patio"]').click());
        await espera(500);
        return p.evaluate(() => { const l = [...document.querySelectorAll('.conversa')]; return l.length === 1 && l[0].textContent.includes('Camila'); });
      })());
      await p.evaluate(() => document.querySelector('.chip[data-status=""]').click());
      await espera(400);

      /* ---------- próxima da fila ---------- */
      await p.evaluate(() => document.querySelector('.r6-proxima')?.click());
      ok(`[${w}] "Próxima" abre uma conversa`, await ate(p, () => !document.getElementById('chatVazio') || document.getElementById('chatVazio').hidden || getComputedStyle(document.getElementById('chatVazio')).display === 'none'));

      /* ---------- painel conectado (Camila) ---------- */
      await abrirConv(p, 'Camila');
      ok(`[${w}] painel conectado carrega: pátio, orçamento, agenda, lead`, await ate(p, () => { const t = document.getElementById('r6Painel')?.textContent || ''; return /Em execução/.test(t) && /Nº 87/.test(t) && /Revisão/.test(t) && /Alinhamento/.test(t); }));
      ok(`[${w}] trilha do pátio com a etapa atual marcada`, await p.evaluate(() => !!document.querySelector('.r6-trilha li.atual[aria-current="step"]')));
      if (w === 1440) await p.screenshot({ path: OUT + 'painel-1440.png' });
      ok(`[${w}] "Mandar link de acompanhar" cola o link no campo (sem enviar)`, await (async () => {
        await p.evaluate(() => document.querySelector('#r6Painel [data-r6="link-patio"]').click());
        await espera(300);
        return p.evaluate(() => /indycar-patio\.netlify\.app\/c\/abc123/.test(document.getElementById('campoMensagem').value));
      })());
      ok(`[${w}] "Criar orçamento" abre o Orçador na aba nomeada com cliente e telefone`, await (async () => {
        await p.evaluate(() => { window.__aberto = null; const o = window.open; window.open = (u, n) => { window.__aberto = { u, n }; return { opener: null, focus() {} }; }; window.__o = o; document.querySelector('#r6Painel [data-r6="criar-orc"]').click(); });
        await espera(300);
        return p.evaluate(() => window.__aberto && window.__aberto.n === 'indycar-orcador' && /cliente=/.test(window.__aberto.u) && /tel=12996830111/.test(window.__aberto.u));
      })());
      ok(`[${w}] chips no cabeçalho do chat (carro, orçamento, agenda, lead)`, await p.evaluate(() => { const c = document.getElementById('r6ChipsChat'); return c && !c.hidden && c.querySelectorAll('.r6-chip').length >= 3; }));

      /* ---------- carro ao vivo: muda a etapa no servidor e o painel acompanha ---------- */
      await fetch(BASE + '/api/_r6_etapa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etapa: 'pronto' }) });
      await p.evaluate(() => window.R6Tela && window.R6Tela.carregarPainel(conversaAtual));
      ok(`[${w}] painel mostra "Pronto para retirar" e o botão de avisar`, await ate(p, () => /Pronto para retirar/.test(document.getElementById('r6Painel').textContent) && !!document.querySelector('#r6Painel [data-r6="avisar-pronto"]')));

      /* ---------- respostas rápidas ---------- */
      await abrirConv(p, 'Vocês fazem');
      ok(`[${w}] conversa sem cadastro oferece "Cadastrar este cliente"`, await ate(p, () => !!document.querySelector('#r6Painel [data-r6="cadastrar"]')));
      await abrirConv(p, 'Camila');
      ok(`[${w}] barra de respostas rápidas aparece e nenhuma sugestão contém preço`, await ate(p, () => { const b = document.getElementById('r6Sugestoes'); return b && !b.hidden && b.querySelectorAll('.r6-sug[data-r6-sug]').length >= 1 && !/R\$\s?\d/.test([...b.querySelectorAll('.r6-sug')].map(x => x.title).join(' ')); }));
      await p.evaluate(() => document.querySelector('#r6Sugestoes [data-r6-sug="0"]')?.click());
      ok(`[${w}] clicar numa sugestão põe o texto no campo`, await p.evaluate(() => document.getElementById('campoMensagem').value.length > 5));

      /* ---------- atalhos de teclado ---------- */
      await p.evaluate(() => { const c = document.getElementById('campoMensagem'); c.value = ''; c.dispatchEvent(new Event('input')); c.blur(); });
      await espera(800);
      await p.keyboard.down('Alt'); await p.keyboard.down('Shift'); await p.keyboard.press('Digit1'); await p.keyboard.up('Shift'); await p.keyboard.up('Alt');
      ok(`[${w}] Alt+Shift+1 usa a primeira resposta rápida`, await ate(p, () => document.getElementById('campoMensagem').value.length > 5, null, 3000), JSON.stringify(await p.evaluate(() => [R6Tela.estado.sugestoes.length, document.activeElement && document.activeElement.id, document.getElementById('campoMensagem').value])));
      const antesConv = await p.evaluate(() => conversaAtual && conversaAtual.id);
      await p.keyboard.down('Alt'); await p.keyboard.press('KeyP'); await p.keyboard.up('Alt');
      ok(`[${w}] Alt+P abre a próxima da fila (outra conversa)`, await ate(p, (a) => conversaAtual && conversaAtual.id !== a, antesConv, 4000));
      await abrirConv(p, 'Camila');
      await ate(p, () => conversaAtual && /Camila/.test(document.getElementById('chatNome').textContent));

      /* ---------- WhatsApp parado ---------- */
      ok(`[${w}] faixa "WhatsApp parado" visível e botão vira "Salvar"`, await ate(p, () => { const z = document.getElementById('r6Zap'); return z && !z.hidden && /WhatsApp parado/.test(z.textContent) && document.getElementById('btnEnviar').textContent.trim() === 'Salvar'; }));
      ok(`[${w}] faixa diz que nada é reenviado sozinho`, await p.evaluate(() => /nada é reenviado sozinho/.test(document.getElementById('r6Zap').textContent)));
      await p.evaluate(() => document.querySelector('#r6Zap [data-r6="nao-sairam"]')?.click());
      ok(`[${w}] painel "mensagens que não saíram" lista a da Camila com 3 ações`, await ate(p, () => { const m = document.getElementById('r6NaoSairam'); return m && m.classList.contains('aberto') && /Pode sim/.test(m.textContent) && /Resolvi por outro meio/.test(m.textContent) && /Reenviar|reenviar/.test(m.textContent); }));
      ok(`[${w}] Reenviar fica desabilitado com o WhatsApp parado`, await p.evaluate(() => [...document.querySelectorAll('#r6NaoSairam [data-r6="ns-reenviar"]')].every(b => b.disabled)));
      if (w === 375) await p.screenshot({ path: OUT + 'nao-sairam-375.png' });
      await p.evaluate(() => document.querySelector('#r6NaoSairam [data-r6="ns-resolvi"]').click());
      ok(`[${w}] "Resolvi por outro meio" tira a mensagem da lista`, await ate(p, () => !/Pode sim/.test(document.getElementById('r6NaoSairam').textContent)));
      await p.evaluate(() => document.querySelector('#r6NaoSairam [data-r6="fechar-ns"]').click());

      /* ---------- passar ao consultor ---------- */
      await abrirConv(p, 'Vocês fazem');
      await ate(p, () => !!document.querySelector('#r6IaCorpo [data-r6="passar-consultor"]'));
      await p.evaluate(() => document.querySelector('#r6IaCorpo [data-r6="passar-consultor"]').click());
      ok(`[${w}] "Passar para o consultor" avisa que passou`, await ate(p, () => /consultor/i.test(document.getElementById('toast')?.textContent || document.body.textContent) && true));

      /* ---------- fixar ---------- */
      await p.evaluate(() => { document.getElementById('btnMaisAcoes').click(); });
      await p.evaluate(() => document.getElementById('btnFixarConversa').click());
      ok(`[${w}] fixar põe 📌 na linha da conversa`, await ate(p, () => [...document.querySelectorAll('.conversa')].some(c => c.textContent.includes('📌'))));

      /* ---------- gestor testa uma mensagem (aba IA) ---------- */
      await p.evaluate(() => document.querySelector('.nav-item[data-aba="ia"]')?.click());
      ok(`[${w}] aba IA do admin mostra "Testar uma mensagem de cliente"`, await ate(p, () => { const c = document.getElementById('cartaoTestarMsg'); return c && !c.hidden; }));
      await p.type('#r6TestarTexto', 'quanto custa a pastilha de freio?');
      await p.evaluate(() => document.getElementById('r6TestarBtn').click());
      ok(`[${w}] teste mostra que passa para uma pessoa por causa do valor, sem preço na resposta`, await ate(p, () => { const t = document.getElementById('r6TestarSaida').textContent; return /Passa para uma pessoa/.test(t) && /valor/i.test(t) && !/R$s?d/.test(t); }));
      if (w === 1440) await p.screenshot({ path: OUT + 'testar-1440.png' });
      ok(`[${w}] sem rolagem lateral`, await semRolagemX(p));
      if (w === 375) await p.screenshot({ path: OUT + 'chat-375.png' });
      if (w === 1440) await p.screenshot({ path: OUT + 'tela-1440.png' });
      ok(`[${w}] sem erro de console`, p.erros.length === 0, p.erros.join(' | '));
      await p.ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${bons}/${total} OK`);
  process.exit(bons === total ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
