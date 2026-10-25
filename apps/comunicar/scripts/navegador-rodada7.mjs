// Roteiro de navegador da Rodada 7 (25/10/2026): cuidado com o cliente no Início, prévia exata, por hora, retomada,
// Repetir, Reabordar recusados, eventos reais nas Réguas e o ataque (HTML dentro dos dados).
// Mock no ar: `PORT=3951 node scripts/mock-server.mjs`   MOCK_URL=http://localhost:3951 node scripts/navegador-rodada7.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
const DIR = process.env.PUPPETEER_DIR || 'C:/Users/USER/.claude/backups/indycar-ferramentas';
const puppeteer = createRequire(path.join(DIR, 'package.json'))('puppeteer-core');
const BASE = process.env.MOCK_URL || 'http://localhost:3951';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhou = 0;
const ok = (larg, nome, cond, extra = '') => { if (!cond) falhou++; console.log(`${cond ? '✔' : '✖'} [${larg}] ${nome}${extra ? ` — ${extra}` : ''}`); };
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
async function abrir(larg, papel) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
  const erros = []; page.on('pageerror', (e) => erros.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.setViewport(larg === 375 ? { width: 375, height: 812, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
  await page.goto(`${BASE}/?papel=${papel}&semente=1&saude=ok&retomada=1&tour=0`, { waitUntil: 'networkidle0' }); await espera(1200);
  return { ctx, page, erros };
}
const semRolagem = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const ir = async (page, rota) => { await page.evaluate((r) => document.querySelector(`.nav-item[data-route="${r}"]`)?.click(), rota); await espera(1100); };
const visivel = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; }, sel);
const texto = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText || '', sel);
const clicar = async (page, sel) => { await page.evaluate((s) => document.querySelector(s)?.click(), sel); await espera(1000); };
const fecharModal = async (page) => { await page.evaluate(() => document.querySelector('.modal [data-fechar], .modal .modal-close')?.click()); await espera(300); };

for (const larg of [1440, 375]) {
  for (const papel of ['gestor', 'atendente']) {
    const { ctx, page, erros } = await abrir(larg, papel);
    const t = `${papel} `;
    const painel = await texto(page, '#painelR7');
    ok(larg, t + 'Início: painel Cuidado com o cliente com a taxa de PARAR', /Cuidado com o cliente/.test(painel) && /taxa de PARAR/.test(painel));
    ok(larg, t + 'Início: resposta sem atender aparece e o HTML do dado não vira elemento', (await texto(page, '#r7Pend')).includes('Marcos') && await page.evaluate(() => !document.querySelector('#r7Pend img, #r7Pend li b > b')));
    ok(larg, t + 'Início: aviso de retomada com o plano', /voltou/.test(await texto(page, '#r7Retomada')));
    ok(larg, t + 'Início: sem rolagem lateral', await semRolagem(page));
    await ir(page, 'mensagens');
    ok(larg, t + 'Mensagens: botões Prévia exata, Por hora e Retomada', await visivel(page, '#r7Exata') && await visivel(page, '#r7Hora') && await visivel(page, '#r7Ret'));
    await clicar(page, '#r7Exata');
    const ex = await texto(page, '.modal');
    ok(larg, t + 'Prévia exata: hora de saída e rodapé PARAR; script do dado não roda', /hoje às 14:20/.test(ex) && /responda PARAR/.test(ex) && await page.evaluate(() => !document.querySelector('.modal script')));
    ok(larg, t + 'Prévia exata: sem rolagem lateral', await semRolagem(page));
    await fecharModal(page);
    await clicar(page, '#r7Hora');
    ok(larg, t + 'Por hora: barras e total', /37 mensagem/.test(await texto(page, '.modal')) && await page.evaluate(() => document.querySelectorAll('.modal .r7-hora').length === 2));
    ok(larg, t + 'Por hora: planilha só para quem exporta', (await visivel(page, '#r7AgendaCsv')) === (papel === 'gestor'));
    await fecharModal(page);
    await clicar(page, '#r7Ret');
    ok(larg, t + 'Retomada: plano e triagem', /meia hora/.test(await texto(page, '.modal')) && await visivel(page, '[data-r7-tri]'));
    ok(larg, t + 'Retomada: só o gestor cancela', (await visivel(page, '#r7Triar')) === (papel === 'gestor'));
    ok(larg, t + 'Retomada: sem rolagem lateral', await semRolagem(page));
    await fecharModal(page);
    await ir(page, 'campanhas');
    ok(larg, t + 'Campanhas: Reabordar recusados disponível', await visivel(page, '#r7Reab'));
    await clicar(page, '#r7Reab');
    const rb = await texto(page, '.modal');
    ok(larg, t + 'Reabordar: total, valor em jogo e motivo', /3\s*\n?\s*podem receber/.test(rb) && /4\.200/.test(rb) && /o valor/.test(rb), rb.slice(0, 80).replace(/\n/g, ' '));
    ok(larg, t + 'Reabordar: enfileirar só para gestor', (await visivel(page, '#r7ReabEnviar')) === (papel === 'gestor'));
    if (papel === 'gestor') {
      await page.evaluate(() => { const x = document.querySelector('[data-r7-texto="preco"]'); x.value = 'Oi {primeiro_nome}, faço por R$ 90 com desconto no seu carro.'; });
      await clicar(page, '#r7ReabEnviar');
      ok(larg, t + 'Reabordar: texto com preço é recusado e o erro aparece no campo', await visivel(page, '[data-r7-erro="preco"]'));
    }
    ok(larg, t + 'Reabordar: sem rolagem lateral', await semRolagem(page));
    await fecharModal(page);
    if (await visivel(page, '.r7-repetir')) {
      await clicar(page, '.r7-repetir');
      await espera(900); await clicar(page, '#campAvancar'); await espera(600);
      const v = await page.evaluate(() => [...document.querySelectorAll('.modal textarea')].map((x) => x.value).join('|'));
      ok(larg, t + 'Repetir: abre a campanha com o MODELO ({primeiro_nome}), não o texto de um cliente', /\{primeiro_nome\}/.test(v), v.slice(0, 60));
      await fecharModal(page);
    } else console.log(`(sem campanha com lote no mock: ${papel}/${larg})`);
    await ir(page, 'reguas');
    ok(larg, t + 'Réguas: 4 eventos reais com texto', await page.evaluate(() => document.querySelectorAll('#painelR7Reguas textarea[data-r7cfg]').length === 4));
    ok(larg, t + 'Réguas: sem rolagem lateral', await semRolagem(page));
    if (papel === 'gestor') {
      await page.evaluate(() => { const e = document.querySelector('#r7t_msg_vencendo'); e.value = 'Seu orçamento vence logo, sem link.'; e.dispatchEvent(new Event('input', { bubbles: true })); });
      await espera(200);
      ok(larg, t + 'Réguas: texto sem o link obrigatório mostra o erro na hora', await visivel(page, '#r7e_msg_vencendo'));
    } else ok(larg, t + 'Réguas: atendente só lê (campos desativados)', await page.evaluate(() => [...document.querySelectorAll('#painelR7Reguas [data-r7cfg]')].every((x) => x.disabled)));
    ok(larg, t + 'sem erro de console', erros.length === 0, erros.slice(0, 2).join(' | '));
    await ctx.close();
  }
}
await browser.close();
console.log(falhou ? `\n${falhou} falha(s)` : '\nTudo certo');
process.exit(falhou ? 1 : 0);
