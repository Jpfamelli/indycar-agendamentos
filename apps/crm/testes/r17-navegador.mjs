// Rodada 17: o fluxo da atendente (SÓ com o servidor de mentira), service worker ligado e duas visitas.
//   PORT=3617 MOCK_LEADS=560 npm run mock   e depois   node testes/r17-navegador.mjs [base] [pasta-das-capturas]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || 'C:/Users/USER/.claude/backups/indycar-ferramentas/node_modules/puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:3617';
const SAIDA = process.argv[3] || '';
if (SAIDA) fs.mkdirSync(SAIDA, { recursive: true });
const espera = ms => new Promise(r => setTimeout(r, ms));
const resultados = [];
const conferir = (nome, ok, detalhe = '') => { resultados.push({ nome, ok: !!ok }); console.log(`${ok ? 'ok ' : 'FALHOU'} · ${nome}${detalhe ? ' · ' + detalhe : ''}`); };
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
async function abrir(papel, w, tema = 'escuro') {
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url(); if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:')) return r.abort(); r.continue(); });
  await page.setViewport({ width: w, height: w < 768 ? 812 : 900, isMobile: w < 768, hasTouch: w < 768 });
  await page.evaluateOnNewDocument(t => { try { localStorage.setItem('indycar_tema', t); localStorage.removeItem('indycar_crm_ultimo_tipo'); sessionStorage.removeItem('indycar_crm_aba'); } catch (e) { /* sem storage */ } }, tema);
  await page.goto(`${BASE}/?papel=${papel}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#hojeLista [data-h6="contato"]') && document.querySelector('#r13Frase').textContent, { timeout: 20000 });
  await espera(1500);
  return { page, erros };
}
const lateral = (page, w) => page.evaluate(w => Math.max(document.documentElement.scrollWidth, innerWidth) > w + 1, w);
try {
  for (const [papel, w, tema] of [['atendente', 375, 'escuro'], ['atendente', 375, 'claro'], ['gestor', 375, 'claro'], ['gestor', 1440, 'escuro'], ['atendente', 1440, 'claro']]) {
    const { page, erros } = await abrir(papel, w, tema);
    const rot = `${papel} ${w} ${tema}`;
    const pos = await page.evaluate(() => {
      const y = el => Math.round(el.getBoundingClientRect().top + scrollY);
      const fila = document.querySelector('#hojeLista').closest('.card');
      return { heroiAntes: document.querySelector('#r13Heroi').nextElementSibling === fila, fila: y(fila), funil: y(document.querySelector('.r13-funil')), ret: document.querySelector('#r7Retornos') ? fila.nextElementSibling?.id === 'r7Retornos' : null,
        rotulo: document.querySelector('#r13Nums [data-r13-ir="retorno"] span')?.textContent || '', sem: H6.dados?.sem_responsavel };
    });
    if (papel === 'atendente') {
      conferir(`${rot}: a Fila do dia vem logo depois do resumo`, pos.heroiAntes && pos.fila < pos.funil, `fila ${pos.fila}px, funil ${pos.funil}px`);
      conferir(`${rot}: retornos combinados logo depois da fila`, pos.ret !== false);
      // o servidor de mentira divide os sem responsável depois de um tempo; o rótulo acompanha o que a fila trouxe
      conferir(`${rot}: "pedem retorno" diz quantos são sem responsável (fila trouxe ${pos.sem})`, pos.sem > 0 ? new RegExp(`${pos.sem} sem responsável|todos sem responsável`).test(pos.rotulo) : /^pedem? retorno$/.test(pos.rotulo), pos.rotulo);
    } else {
      conferir(`${rot}: gestor continua com o resumo, o gráfico e o funil antes da fila`, !pos.heroiAntes && pos.fila > pos.funil);
      conferir(`${rot}: gestor vê "pedem retorno" sem o recorte`, /^pedem? retorno$/.test(pos.rotulo), pos.rotulo);
    }
    // recarga automática: sem esqueleto, sem pulo, "Mensagem sugerida" continua aberta
    const rec = await page.evaluate(async () => {
      const alvo = [...document.querySelectorAll('#hojeLista .r6-linha')][3]; alvo.scrollIntoView({ block: 'start' });
      const d = alvo.querySelector('details'); if (d) d.open = true;
      const antesY = scrollY, id = alvo.dataset.lead;
      const p = carregarHoje6(); const esq = !!document.querySelector('#hojeLista .skeleton'), yDurante = scrollY;
      await p; await new Promise(r => setTimeout(r, 200));
      return { esq, pulo: Math.round(Math.abs(yDurante - antesY)) + Math.round(Math.abs(scrollY - antesY)), aberto: !!document.querySelector(`#hojeLista .r6-linha[data-lead="${CSS.escape(id)}"] details`)?.open };
    });
    conferir(`${rot}: a fila se atualiza sem esqueleto, sem pular e sem fechar a mensagem`, !rec.esq && rec.pulo === 0 && rec.aberto, JSON.stringify(rec));
    // registrar com um toque no resultado
    await page.evaluate(() => { scrollTo(0, 0); document.querySelector('#hojeLista [data-h6="contato"]').scrollIntoView({ block: 'center' }); });
    const antesFeitos = await page.evaluate(() => H6.dados.feitos_hoje);
    await page.click('#hojeLista [data-h6="contato"]');
    await page.waitForSelector('#dlgContato6[open]');
    const dlg = await page.evaluate(() => ({ chips: [...document.querySelectorAll('#r17Res [data-r17res]')].map(b => Math.round(b.getBoundingClientRect().height)), lista: !document.querySelector('#ct6Res').closest('label').hidden ? 'visível' : 'escondida' }));
    conferir(`${rot}: 9 botões de resultado com 44 px e a lista antiga escondida`, dlg.chips.length === 9 && dlg.chips.every(h => h >= 44) && dlg.lista === 'escondida', dlg.chips.join(','));
    await page.click('#ct6Ok'); await espera(200);
    const erroVazio = await page.evaluate(() => document.querySelector('#ct6Erro').textContent);
    conferir(`${rot}: sem resultado nem anotação, pede para escolher`, /Diga o que aconteceu/.test(erroVazio));
    await page.click('[data-r17res="atendeu"]');
    const marcado = await page.evaluate(() => ({ sel: document.querySelector('#ct6Res').value, press: document.querySelector('[data-r17res="atendeu"]').getAttribute('aria-pressed'), erro: document.querySelector('#ct6Erro').textContent }));
    conferir(`${rot}: um toque marca "Atendeu" e limpa o aviso`, marcado.sel === 'atendeu' && marcado.press === 'true' && !marcado.erro, JSON.stringify(marcado));
    if (SAIDA && w === 375) await page.screenshot({ path: `${SAIDA}/depois-registrar-${papel}-${w}-${tema}.png` });
    await page.click('#ct6Ok');
    await page.waitForFunction(() => !document.querySelector('#dlgContato6[open]'), { timeout: 8000 });
    await page.waitForFunction(n => H6.dados && H6.dados.feitos_hoje > n, { timeout: 8000 }, antesFeitos).catch(() => {});
    const depoisFeitos = await page.evaluate(() => H6.dados.feitos_hoje);
    conferir(`${rot}: salvar registra o contato (3 toques: Registrar, Atendeu, Salvar)`, depoisFeitos === antesFeitos + 1, `${antesFeitos} → ${depoisFeitos}`);
    // abrir de novo: o botão volta desmarcado; "Adiar" chega com "Pediu um prazo" marcado
    await page.evaluate(() => document.querySelector('#hojeLista [data-h6="adiar"]').click());
    await page.waitForSelector('#dlgContato6[open]');
    const adiar = await page.evaluate(() => [...document.querySelectorAll('#r17Res [aria-pressed="true"]')].map(b => b.dataset.r17res).join(','));
    conferir(`${rot}: "Adiar" abre com "Pediu um prazo" marcado`, adiar === 'pediu_prazo', adiar);
    await page.evaluate(() => document.querySelector('#dlgContato6').close());
    await espera(300);
    if (SAIDA) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${SAIDA}/depois-hoje-${papel}-${w}-${tema}.png` }); }
    conferir(`${rot}: sem rolagem lateral`, !(await lateral(page, w)));
    const pequenos = await page.evaluate(() => [...document.querySelectorAll('#view-hoje button, #view-hoje a.acao')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 44 && b.getBoundingClientRect().width > 0).map(b => b.textContent.trim().slice(0, 20)));
    if (w === 375) conferir(`${rot}: nenhum toque menor que 44 px na tela Hoje`, pequenos.length === 0, pequenos.slice(0, 5).join(' | '));
    conferir(`${rot}: zero erro de console`, erros.length === 0, erros.slice(0, 3).join(' | '));
    await page.close();
  }
  const s = await abrir('atendente', 375);
  // o servidor de mentira desliga o registro da página; aqui registramos o sw.js de verdade, como no ar
  const reg = await s.page.evaluate(async () => { try { await navigator.serviceWorker.register('sw.js'); await Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error('sem ready')), 10000))]); return 'ok'; } catch (e) { return String(e.message || e); } });
  conferir('service worker registrado', reg === 'ok', reg); await espera(1500);
  await s.page.reload({ waitUntil: 'domcontentloaded' });
  await s.page.waitForFunction(() => document.querySelector('#hojeLista [data-h6="contato"]'), { timeout: 20000 }); await espera(1500);
  const sw = await s.page.evaluate(async () => ({ ctrl: !!navigator.serviceWorker.controller, chaves: await caches.keys(), r17: !!(await caches.match('r17.js')) || !!(await caches.match('/r17.js')), css: !!(await caches.match('r17.css')) || !!(await caches.match('/r17.css')), filaNoAlto: document.querySelector('#r13Heroi').nextElementSibling === document.querySelector('#hojeLista').closest('.card') }));
  conferir('service worker: 2ª visita controlada, v21 e r17 em cache, fila no alto', sw.ctrl && sw.chaves.some(c => /v21$/.test(c)) && sw.r17 && sw.css && sw.filaNoAlto, JSON.stringify(sw));
  conferir('service worker: zero erro de console', s.erros.length === 0, s.erros.slice(0, 3).join(' | '));
  await s.page.close();
} finally { await browser.close(); }
const falhas = resultados.filter(r => !r.ok).length;
console.log(`\n${resultados.length - falhas} de ${resultados.length}`);
process.exit(falhas ? 1 : 0);
