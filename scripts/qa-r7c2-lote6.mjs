// QA da Agenda (rodada 7, C2, lote 6): relatórios do dono no navegador.
// Navegador headless contra o servidor de MENTIRA em porta própria.   node scripts/qa-r7c2-lote6.mjs
import { iniciarMock, cenario, conf, fim, dorme, api, GAB, LEO, SAIDA } from './qa-r7c2-lib.mjs';

const mock = iniciarMock(3212);
const D1 = '2026-10-19', D2 = '2026-10-20', D3 = '2026-10-21';      // seg, ter, qua (já passaram)
const semear = async (page) => {
  await api(page, 'POST', '/api/__reset', {});
  const cria = (nome, data, hora, cons, status, extra = {}) => api(page, 'POST', '/api/agendamentos', {
    cliente_nome: nome, servico: extra.servico || 'Troca de óleo', data, hora, consultor_id: cons, consultor_nome: cons === GAB ? 'Gabriel' : 'Leonardo',
    telefone: '12991110000', status, origem: 'Google', ...extra });
  await cria('R Um', D1, '08:00', GAB, 'concluido', { valor: 200, compareceu: 1 });
  await cria('R Dois', D1, '09:00', LEO, 'concluido', { valor: 400, compareceu: 1, servico: 'Freios', confirmado: 1 });
  await cria('R Tres', D1, '10:00', GAB, 'nao_veio', { origem: 'Instagram', compareceu: 0, motivo_falta: 'esqueceu' });
  await cria('R Quatro', D2, '08:00', GAB, 'nao_veio', { origem: 'Instagram', compareceu: 0 });
  await cria('R Cinco', D2, '09:00', LEO, 'compareceu', { compareceu: 1, servico: 'Freios', confirmado: 1 });
  await cria('R Seis', D2, '10:00', LEO, 'cancelado');
  await cria('R Sete', D3, '08:00', GAB, 'concluido', { valor: 300, compareceu: 1 });
};
const abrir = async (page) => {
  await page.evaluate((d1, d3) => { localStorage.setItem('indycar_r7_rel_periodo', JSON.stringify({ inicio: d1, fim: d3 })); route('dono'); }, D1, D3);
  await page.waitForSelector('.r7r-kpis', { timeout: 15000 }); await dorme(500);
};
const kpis = (page) => page.$$eval('.r7r-kpi', (l) => Object.fromEntries(l.map((k) => [k.querySelector('.r7r-kpi-rot').textContent.trim(), k.querySelector('.r7r-kpi-val').textContent.trim()])));

try {
  await dorme(900);
  await cenario(mock.base, 'desktop', 1440, async (page) => {
    await semear(page);
    conf(await page.$eval('.nav-item[data-route="dono"]', (e) => e.offsetParent !== null).catch(() => false), 'Relatórios: o item do menu aparece para o gestor');
    await abrir(page);
    const k = await kpis(page);
    conf(Object.keys(k).length === 6, 'Relatórios: 6 números no topo (' + Object.keys(k).join(', ') + ')');
    conf(k['Horários marcados'] === '6', 'Relatórios: 6 horários marcados (o cancelado não conta) — ' + k['Horários marcados']);
    conf(k['Faltaram'] === '33,3%', 'Relatórios: faltaram 33,3% (2 de 6) — ' + k['Faltaram']);
    conf(k['Vieram'] === '66,7%', 'Relatórios: vieram 66,7% — ' + k['Vieram']);
    conf(/900,00/.test(k['Fechado']), 'Relatórios: fechado R$ 900,00 (200+400+300) — ' + k['Fechado']);
    conf(/^\d+(,\d)?%$/.test(k['Ocupação da agenda']), 'Relatórios: ocupação da agenda em % (' + k['Ocupação da agenda'] + ')');
    const dest = await page.$$eval('.r7r-dest li', (l) => l.map((x) => x.textContent.trim()));
    conf(dest.some((t) => /Faltaram 2 \(33,?3?\.?3?% de quem já teve desfecho\)/.test(t) || /Faltaram 2/.test(t)), '🔗 Relatórios: "Em poucas palavras" fala das faltas (' + dest.length + ' frases)');
    conf(dest.some((t) => /Fechou R\$\s?900,00 em 3 serviços/.test(t)), 'Relatórios: e do que foi fechado');
    const dias = await page.$$eval('.r7r-dias li', (l) => l.map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
    conf(dias.length === 3 && /seg 19\/10/.test(dias[0]) && /1 falta/.test(dias[0]), 'Relatórios: ocupação dia a dia, com as faltas de cada dia (' + dias[0] + ')');
    const tabela = await page.$$eval('.r7r-sec table.r7r-tab', (t) => t.map((x) => x.innerText.replace(/\s+/g, ' ')));
    conf(tabela.some((t) => /Gabriel/.test(t) && /Leonardo/.test(t)), '🔗 Relatórios: tabela por consultor com os dois');
    const gab = await page.$$eval('.r7r-tab tbody tr', (l) => l.map((x) => x.innerText.replace(/\s+/g, ' ').trim()).find((t) => /^Gabriel/.test(t)) || '');
    conf(/^Gabriel 4 .*2 \(50%\)/.test(gab), 'Relatórios: Gabriel 4 horários e 2 faltas (' + gab + ')');
    const mot = await page.$$eval('.r7r-sec .r7r-lista li', (l) => l.map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
    conf(mot.some((t) => /^Esqueceu/.test(t)) && mot.some((t) => /Sem motivo anotado/.test(t)), '🔗 Relatórios: motivos das faltas (o anotado e o que falta anotar)');
    conf(await page.$eval('.r7r-conf', (e) => /confirmou.*faltou/.test(e.textContent)).catch(() => false), 'Relatórios: compara quem confirmou com quem não confirmou');
    const sub = await page.$eval('.r7r-sub', (e) => e.textContent);
    conf(/19\/10 a 21\/10 · comparado com 16\/10 a 18\/10/.test(sub), 'Relatórios: diz com qual período está comparando (' + sub.trim() + ')');
    // atalhos de período
    await page.evaluate(() => document.querySelector('[data-r7r-p="7"]').click()); await page.waitForSelector('.r7r-kpis'); await dorme(900);
    conf((await page.evaluate(() => localStorage.getItem('indycar_r7_rel_periodo'))) === '7', 'Relatórios: o período escolhido fica lembrado');
    conf(await page.$eval('[data-r7r-p="7"]', (b) => b.getAttribute('aria-pressed') === 'true'), 'Relatórios: o atalho ativo avisa o leitor de tela');
    // período livre
    await page.$eval('#r7rDe', (e, v) => { e.value = v; }, D1); await page.$eval('#r7rAte', (e, v) => { e.value = v; }, D3);
    await page.evaluate(() => document.querySelector('[data-r7r-aplicar]').click()); await page.waitForSelector('.r7r-kpis'); await dorme(900);
    conf((await kpis(page))['Horários marcados'] === '6', 'Relatórios: período livre (De/até) funciona');
    // copiar
    await page.evaluate(() => { window.__copiado = null; navigator.clipboard.writeText = async (t) => { window.__copiado = t; }; });
    await page.evaluate(() => document.querySelector('[data-r7r-copiar]').click()); await dorme(700);
    const copiado = await page.evaluate(() => window.__copiado);
    conf(!!copiado && /agenda de 19\/10 a 21\/10/.test(copiado) && /• Gabriel: 4 horários/.test(copiado), '🔗 Relatórios: "Copiar resumo" põe o texto pronto para o WhatsApp do dono');
    await page.screenshot({ path: SAIDA + 'c2-r7-lote6-1440.png', fullPage: true });
    // quem não é gestor
    const r403 = await page.evaluate(async () => (await fetch('/api/relatorios/dono?papel=agenda')).status);
    conf(r403 === 200, 'Relatórios: o servidor de mentira responde ao gestor');
  });

  await cenario(mock.base, 'recepção', 1280, async (page) => {
    const st = await page.evaluate(async () => (await fetch('/api/relatorios/dono')).status);
    conf(st === 403, '🔗 Relatórios: a recepção (papel agenda) leva 403 — é só do gestor (' + st + ')');
  }, '/?tour=0&papel=agenda');

  await cenario(mock.base, 'celular 375', 375, async (page) => {
    await semear(page);
    await abrir(page);
    const med = await page.evaluate(() => ({ lw: document.documentElement.scrollWidth, vw: innerWidth,
      peq: [...document.querySelectorAll('.r7r-filtros button, .r7r-acoes button, .r7r-livre button')].filter((e) => e.offsetParent !== null).map((e) => [e.textContent.trim().slice(0, 14), Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < 44) }));
    conf(med.lw <= med.vw + 1, `Celular 375 px: relatórios sem rolagem lateral (${med.lw}/${med.vw})`);
    conf(med.peq.length === 0, 'Celular 375 px: botões com 44 px ou mais ' + JSON.stringify(med.peq));
    await page.screenshot({ path: SAIDA + 'c2-r7-lote6-375.png' });
  });
} finally { mock.parar(); }
fim();
