// Rodada 6 · passada do "atacante" no navegador: toda resposta nova da API vem recheada de HTML/JS
// malicioso (nome de cliente, motivo, texto de campanha, tipo, link…). Nada pode virar elemento nem executar.
// Também confere, a 375 px, que NENHUM modal novo passa da largura da tela.
// Mock no ar: `npm run mock` (porta 3511).   node scripts/navegador-rodada6-ataque.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
const DIR = process.env.PUPPETEER_DIR || 'C:/Users/USER/.claude/backups/indycar-ferramentas';
const puppeteer = createRequire(path.join(DIR, 'package.json'))('puppeteer-core');
const BASE = process.env.MOCK_URL || 'http://localhost:3511';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhou = 0;
const ok = (larg, nome, cond, extra = '') => { if (!cond) falhou++; console.log(`${cond ? '✔' : '✖'} [${larg}] ${nome}${extra ? ` — ${extra}` : ''}`); };
const P = '"><img src=x onerror="window.__xss=(window.__xss||0)+1"><svg onload="window.__xss=99"><b>';
const ID = '00000000-0000-4000-8000-0000000000aa';
const agora = new Date().toISOString();
const stats = { enviadas: 2, responderam: 1, agendaram: 1, voltaram: 1, aprovaram: 0, faturou: 120, taxaResposta: 50, taxaVoltou: 50, porMensagem: 60 };
const RESP = {
  '/api/conexoes': { em: agora, itens: [{ id: P, app: P, rotulo: P, valor: 3, detalhe: P, ligada: true, lido: true }] },
  '/api/resultados': { periodo: { de: P, ate: P }, janelaDias: 30, total: stats, porTipo: { [P]: stats }, porLote: { [ID]: { ...stats, tipo: P, quando: agora, texto: P } }, quemVoltou: [{ id: P, tipo: P, nome: P, telefone: P, enviado_em: agora, voltou: true, aprovou: true, faturou: 100 }], quantosVoltaram: 99, regra: P },
  '/api/agenda': { dias: [{ data: '2026-10-21', total: 1, atrasadas: 0, porTipo: { [P]: 1 }, porHora: {}, domingo: false, feriado: P, limite: 300, excede: false, itens: [{ id: P, nome: P, telefone: P, tipo: P, enviar_em: agora, corpo: P, motivo_pulado: P }] }], atrasadas: 0, total: 1, limite: 300, cfg: { hora_envio: P, envia_domingo: false, limite_por_dia: 300 } },
  porque: { envio: { id: ID, nome: P, tipo: P, status: 'pendente' }, quando: agora, passos: [{ nivel: P, texto: P }, { nivel: 'bloqueio', texto: P }], resumo: P, bloqueios: 1, esperas: 0 },
  '/api/rodada/simular': { simulado: true, bloqueado: false, aviso: P, retomada: { motivo: P, limite: 3 }, enviaria: [{ id: P, tipo: P, nome: P, telefone: P, corpo: P }], pularia: [{ id: P, tipo: P, nome: P, motivo: P }], adiaria: [{ id: P, tipo: P, nome: P, motivo: P, quando: P }], reagendaria: [{ id: P, tipo: P, nome: P, motivo: P }], atualizaria: [] },
  '/api/campanhas/previa': { simulado: true, total: 1, pulados: 1, puladosDetalhe: { nao_quer: 1 }, dias: 2, porDia: { '2026-10-21': 1, '2026-10-22': P }, limitePorDia: 300, linhas: [{ nome: P, telefone: P, corpo: P, enviar_em: agora }], linksForaDaCasa: [P] },
};
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
for (const larg of [1440, 375]) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
  const erros = []; page.on('pageerror', (e) => erros.push(String(e.message || e)));
  page.on('dialog', (d) => d.accept());
  await page.setViewport(larg === 375 ? { width: 375, height: 812, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url());
    const chave = /\/porque$/.test(u.pathname) ? 'porque' : u.pathname;
    if (RESP[chave] && !(chave === '/api/campanhas/previa' && req.method() !== 'POST') && !(chave === '/api/rodada/simular' && req.method() !== 'POST')) {
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(RESP[chave]) });
    }
    req.continue();
  });
  await page.goto(`${BASE}/?papel=gestor&semente=1&saude=ok&tour=0`, { waitUntil: 'networkidle0' }); await espera(1200);
  const limpo = async (rotulo) => {
    const r = await page.evaluate(() => ({ xss: window.__xss || 0, imgs: document.querySelectorAll('img[src="x"], svg[onload], [onerror]').length }));
    ok(larg, `${rotulo}: nada executou e nenhum elemento injetado`, r.xss === 0 && r.imgs === 0, JSON.stringify(r));
  };
  const cabe = async (rotulo) => { const r = await page.evaluate(() => { const m = document.querySelector('.modal'); const bom = document.documentElement.scrollWidth <= window.innerWidth + 1 && (!m || m.scrollWidth <= m.clientWidth + 1); const lim = (m || document.body).getBoundingClientRect().right; const ruins = bom ? [] : [...(m || document.body).querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > lim + 1).slice(0, 4).map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)} w${Math.round(r.width)} r${Math.round(r.right)}/${Math.round(lim)} ws:${cs.whiteSpace} txt:${(e.textContent || '').slice(0, 25)}`; }); return { bom, ruins }; }); ok(larg, `${rotulo}: cabe na largura da tela`, r.bom, r.ruins.join(' | ')); };
  await limpo('Início (ligações e funil)');
  ok(larg, 'Início mostra o texto malicioso como TEXTO', await page.evaluate(() => /<img src=x/.test(document.querySelector('#painelR6Con')?.textContent || '')));
  await cabe('Início');
  await page.evaluate(() => document.querySelector('.nav-item[data-route="mensagens"]').click()); await espera(900);
  await page.evaluate(() => document.querySelector('#r6Agenda').click()); await espera(900);
  await limpo('Agenda'); await cabe('Agenda');
  await page.evaluate(() => document.querySelector('.modal [data-r6-porque]')?.click()); await espera(500);
  await page.evaluate(() => document.querySelector('.modal [data-fechar]')?.click()); await espera(300);
  await page.evaluate(() => document.querySelector('#r6Simular').click()); await espera(900);
  await limpo('Simular rodada'); await cabe('Simular rodada');
  await page.evaluate(() => document.querySelector('.modal [data-fechar]')?.click()); await espera(300);
  await page.evaluate(() => document.querySelector('#r6Resultados').click()); await espera(1000);
  await limpo('Resultados'); await cabe('Resultados');
  ok(larg, 'Resultados: quem voltou mostra o nome malicioso como texto', await page.evaluate(() => /<img src=x/.test(document.querySelector('#r6ResModal .r6-itens')?.textContent || '')));
  await page.evaluate(() => document.querySelector('.modal [data-fechar]')?.click()); await espera(300);
  // "Por que" a partir de uma mensagem da lista
  await page.evaluate(() => document.querySelector('.pilula[data-filtro="pendente"]')?.click()); await espera(700);
  await page.evaluate(() => document.querySelector('#listaEnvios [data-r6-porque]').click()); await espera(900);
  await limpo('Por que não saiu'); await cabe('Por que não saiu');
  await page.evaluate(() => document.querySelector('.modal [data-fechar]')?.click()); await espera(300);
  await page.evaluate(() => document.querySelector('#listaEnvios [data-r6-adiar]').click()); await espera(500);
  await cabe('Adiar');
  await page.evaluate(() => document.querySelector('.modal [data-fechar]')?.click()); await espera(300);
  // campanha
  await page.evaluate(() => document.querySelector('.nav-item[data-route="campanhas"]').click()); await espera(900);
  await page.evaluate(() => document.querySelector('#btnNovaCamp').click()); await page.waitForSelector('#segPrevia .n', { timeout: 8000 }); await espera(300);
  await page.evaluate(() => document.querySelector('#campAvancar').click()); await espera(500);
  await page.evaluate(() => { const t = document.querySelector('#campCorpo'); t.value = 'Oi {primeiro_nome}'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.evaluate(() => document.querySelector('#campAvancar').click()); await espera(1400);
  await limpo('Campanha (prévia exata)'); await cabe('Campanha (passo 3)');
  ok(larg, 'Campanha: zero erro de console', !erros.length, erros.slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();
console.log(falhou ? `${falhou} falha(s)` : 'tudo ok');
process.exit(falhou ? 1 : 0);
