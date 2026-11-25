// R15: fluxo no servidor de MENTIRA com o service worker LIGADO e DUAS visitas: Chegou no cartão "Próximo",
// Chegou na tela Agenda, atualização silenciosa que falha sem apagar a lista, celular 375 px.
// node scripts/qa-r15-fluxo.mjs
import fs from 'node:fs';
import { iniciarMock, abrirNavegador, dorme } from './qa-r7c2-lib.mjs';
const SAIDA = new URL('../qa-out/r15/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'); fs.mkdirSync(SAIDA, { recursive: true });
const mock = iniciarMock(Number(process.env.QA_PORTA || 3585)); await dorme(1500);
let falhas = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FALHOU ') + m); if (!c) falhas++; };
try {
  for (const largura of [1440, 375]) {
    const { browser, page } = await abrirNavegador({ largura, altura: largura < 500 ? 812 : 900 });
    const erros = []; page.on('pageerror', (e) => erros.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_FAILED/.test(m.text())) erros.push(m.text()); });
    const patchs = []; page.on('request', (r) => { if (r.method() === 'PATCH' && /status/.test(r.url())) patchs.push(r.postData()); });
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('indycar_tour_visto_v1', '1'); localStorage.setItem('indycar_tour_quadro_v1', '1'); } catch {} });
    // duas visitas, service worker ligado
    await page.goto(mock.base + '/?tour=0', { waitUntil: 'networkidle2' }); await dorme(2500);
    await page.goto(mock.base + '/?tour=0', { waitUntil: 'networkidle2' }); await dorme(2000);
    ok(await page.evaluate(async () => { const r = await navigator.serviceWorker?.getRegistration(); return !!(r && (r.active || r.waiting)); }), `${largura}: service worker ativo na 2ª visita`);
    // Chegou no cartão Próximo
    const caixa = await page.evaluate(() => { const b = document.querySelector('[data-prox-chegou]'); if (!b) return null; const r = b.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) }; });
    ok(!!caixa && caixa.h >= 44, `${largura}: Próximo tem Chegou com toque de 44 px ou mais ${JSON.stringify(caixa)}`);
    await page.screenshot({ path: `${SAIDA}depois-prox-${largura}.png` });
    const nomeProx = await page.evaluate(() => document.querySelector('.r13-prox-nome')?.textContent);
    await page.evaluate(() => document.querySelector('[data-prox-chegou]').click()); await dorme(1500);
    ok(patchs.length === 1 && /compareceu/.test(patchs[0]), `${largura}: Chegou do Próximo manda um PATCH compareceu (${nomeProx})`);
    ok(await page.evaluate((n) => document.querySelector('.r13-prox-nome')?.textContent !== n, nomeProx), `${largura}: o Próximo passa para outro cliente`);
    // atualização silenciosa que falha: a lista fica
    await page.setRequestInterception(true);
    const bloquear = (r) => (/\/api\//.test(r.url()) && r.method() === 'GET' ? r.respond({ status: 500, contentType: 'application/json', body: '{"erro":"Erro interno"}' }) : r.continue());
    page.on('request', bloquear);
    const antes = await page.evaluate(() => document.querySelectorAll('#agendaHoje .appt').length);
    await page.evaluate(() => { window.route(); }); await dorme(2500);
    ok(await page.evaluate(() => !document.querySelector('.erro-tela')) && (await page.evaluate(() => document.querySelectorAll('#agendaHoje .appt').length)) === antes, `${largura}: falha na atualização silenciosa não apaga a lista (${antes} cartões)`);
    ok(await page.evaluate(() => /Não consegui atualizar agora/.test(document.getElementById('toast').textContent)), `${largura}: aviso "Não consegui atualizar agora" com Atualizar`);
    page.off('request', bloquear); await page.setRequestInterception(false);
    // Chegou na tela Agenda (horários de hoje)
    await page.evaluate(() => window.route('agenda')); await dorme(1800);
    const agendaChegou = await page.evaluate(() => document.querySelectorAll('#agendaList .appt [data-act="compareceu"]').length);
    ok(agendaChegou >= 1, `${largura}: tela Agenda mostra Chegou nos horários de hoje (${agendaChegou})`);
    await page.screenshot({ path: `${SAIDA}depois-agenda-${largura}.png` });
    ok(erros.length === 0, `${largura}: sem erro de console/página ${erros.slice(0, 2).join('|')}`);
    await browser.close();
  }
} finally { mock.parar(); }
console.log(falhas ? falhas + ' falharam' : 'tudo ok'); process.exit(falhas ? 1 : 0);
