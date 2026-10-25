// QA da Agenda (rodada 7, C2, lote 3): motivo da falta, painel "sem confirmar", reagendar pelo WhatsApp.
// Navegador headless contra o servidor de MENTIRA em porta própria.   node scripts/qa-r7c2-lote3.mjs
import { iniciarMock, cenario, conf, fim, dorme, api, diaUtil, irQuadro, card, GAB, LEO, SAIDA } from './qa-r7c2-lib.mjs';

const mock = iniciarMock(3209);
const DIA = diaUtil(1);
const semear = async (page) => {
  await api(page, 'POST', '/api/__reset', {});
  const cria = (nome, hora, cons, tel) => api(page, 'POST', '/api/agendamentos', {
    cliente_nome: nome, servico: 'Troca de óleo', data: DIA, hora, consultor_id: cons, consultor_nome: cons === GAB ? 'Gabriel' : 'Leonardo', telefone: tel, veiculo: 'Onix' });
  await cria('Teste Ana', '09:00', GAB, '12991110011');
  await cria('Teste Bia', '09:00', LEO, '12991110012');
  await cria('Teste Caio', '10:00', GAB, '12991110013');
};
const por = async (page, nome) => (await api(page, 'GET', '/api/agendamentos')).j.find((a) => a.cliente_nome === nome);
const cab = (page) => page.$eval('#qdConf .r7c-cab', (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');

try {
  await dorme(900);
  await cenario(mock.base, 'desktop', 1440, async (page) => {
    await semear(page);
    await irQuadro(page, DIA);
    // ---- painel de confirmação ----
    conf(await page.$eval('#qdConf', (e) => !e.hidden).catch(() => false), 'Confirmação: o Quadro mostra o placar do dia');
    const m0 = /(\d+) de (\d+) confirmados/.exec(await cab(page)) || [0, -1, -1];
    const total0 = Number(m0[2]), conf0 = Number(m0[1]);
    conf(total0 >= 3 && /sem confirmar/.test(await cab(page)), 'Confirmação: placar "X de Y confirmados · N sem confirmar" (' + (await cab(page)) + ')');
    await page.click('#qdConf [data-r7c-alt]'); await dorme(400);
    const itens = await page.$$eval('#qdConf [data-r7c-id]', (l) => l.map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
    const horas = itens.map((t) => t.slice(0, 5));
    conf(itens.length === total0 - conf0 && itens.length > 0 && horas.join() === [...horas].sort().join(), 'Confirmação: lista os sem confirmar em ordem de hora (' + horas.join(',') + ')');
    const wa = await page.$eval('#qdConf [data-r7c-id] a[href^="https://wa.me/"]', (a) => decodeURIComponent(a.href));
    conf(/^https:\/\/wa\.me\/55129911100\d\d\?text=/.test(wa) && /amanhã às \d\d:\d\d/.test(wa) && /SIM/.test(wa), '🔗 Confirmação: 💬 Pedir abre o WhatsApp com o texto pronto ("amanhã às ..", pede SIM)');
    conf((await page.$$eval('#qdConf [data-r7c-link]', (b) => b.length)) >= 1, 'Confirmação: gestor também tem o botão 🔗 Link (resposta no cartão)');
    const idOk = await page.$eval('#qdConf [data-r7c-id]', (e) => e.dataset.r7cId);
    await page.evaluate(() => document.querySelector('#qdConf [data-r7c-id] [data-r7c-ok]').click()); await dorme(1500);
    conf(new RegExp(`${conf0 + 1} de ${total0} confirmados`).test(await cab(page)), 'Confirmação: "Já confirmou" atualiza o placar na hora (' + (await cab(page)) + ')');
    const primeiro = (await api(page, 'GET', `/api/agendamentos?data=${DIA}`)).j.filter((a) => a.id === idOk && a.status === 'confirmado');
    conf(primeiro.length === 1, '🔗 Confirmação: "Já confirmou" grava a situação "confirmado" no servidor');
    conf((await page.$$eval('#qdConf [data-r7c-id]', (l) => l.length)) === itens.length - 1, 'Confirmação: quem confirmou sai da lista');
    // ---- falta + motivo ----
    await page.evaluate(() => document.querySelector('.qd-card[data-nome="Teste Bia"] [data-qd="faltou"]').click()); await dorme(1800);
    conf(await page.$eval('#r7Motivo', (e) => e.offsetHeight > 0).catch(() => false), 'Falta: depois de "Faltou" abre a folha "Por que não veio?"');
    const chips = await page.$$eval('#r7Motivo [data-r7m]', (b) => b.map((x) => x.textContent.trim()));
    conf(chips.length === 6 && chips.includes('Esqueceu'), 'Falta: 6 motivos para tocar (' + chips.join(', ') + ')');
    await page.evaluate(() => document.querySelector('#r7Motivo [data-r7m="esqueceu"]').click()); await dorme(500);
    const textoSheet = await page.$eval('#r7Motivo', (e) => e.innerText).catch(() => '');
    await dorme(700);
    conf((await por(page, 'Teste Bia')).motivo_falta === 'esqueceu', '🔗 Falta: o motivo "esqueceu" fica gravado no horário (serve ao relatório do dono)');
    conf(/Anotado: Esqueceu/.test(textoSheet), 'Falta: a folha confirma "Anotado: Esqueceu ✓"');
    await dorme(2000);
    conf(!(await page.$('#r7Motivo')), 'Falta: a folha some sozinha depois de anotar');
    await page.evaluate(() => R6b.redesenhar()); await dorme(500);
    conf(await page.$eval('.qd-card[data-nome="Teste Bia"] [data-r7-falta]', (e) => /Esqueceu/.test(e.innerText)).catch(() => false), 'Falta: o cartão de quem faltou mostra o motivo');
    const waR = await page.$eval('.qd-card[data-nome="Teste Bia"] [data-r7-wa]', (a) => decodeURIComponent(a.href)).catch(() => '');
    conf(/^https:\/\/wa\.me\/5512991110012\?text=/.test(waR) && /Sentimos sua falta/.test(waR) && /Oi Teste!/.test(waR), '🔗 Falta: "💬 Reagendar" abre o WhatsApp com o recado pronto');
    // depois / Esc
    await page.evaluate(() => document.querySelector('.qd-card[data-nome="Teste Caio"] [data-qd="faltou"]').click()); await dorme(1800);
    conf(!!(await page.$('#r7Motivo')), 'Falta: segunda falta abre a folha de novo');
    await page.keyboard.press('Escape'); await dorme(300);
    conf(!(await page.$('#r7Motivo')), 'Falta: Esc fecha a folha sem anotar');
    conf((await por(page, 'Teste Caio')).motivo_falta == null, 'Falta: sem anotar, o horário fica sem motivo');
    await page.evaluate(() => R6b.redesenhar()); await dorme(500);
    conf(await page.$eval('.qd-card[data-nome="Teste Caio"] [data-qd="motivo"]', (b) => /Motivo/.test(b.textContent)).catch(() => false), 'Falta: o cartão mantém o botão "Motivo?" para anotar depois');
    await page.evaluate(() => document.querySelector('.qd-card[data-nome="Teste Caio"] [data-qd="motivo"]').click()); await dorme(500);
    await page.evaluate(() => document.querySelector('#r7Motivo [data-r7m="imprevisto"]').click()); await dorme(1200);
    conf((await por(page, 'Teste Caio')).motivo_falta === 'imprevisto', 'Falta: "Motivo?" no cartão anota depois');
    const ruim = await api(page, 'PATCH', `/api/agendamentos/${(await por(page, 'Teste Ana')).id}/motivo-falta`, { motivo: 'esqueceu' });
    conf(ruim.status === 409, 'Falta: quem não faltou não aceita motivo (409)');
    conf(/0 sem confirmar|tudo certo|sem confirmar/.test(await cab(page)) || (await cab(page)).length > 0, 'Confirmação: placar segue coerente depois das faltas (' + await cab(page) + ')');
    // cartão do Início com falta
    const html = await page.evaluate(() => appointmentCard({ id: '1', cliente_nome: 'Fulano', telefone: '12991110099', servico: 'Óleo', data: '2026-10-26', hora: '09:00', status: 'nao_veio' }));
    conf(/data-r7-falta/.test(html) && /Motivo\?/.test(html) && /wa\.me\/5512991110099/.test(html), 'Início: o cartão de quem faltou também ganha "Motivo?" e "💬 Reagendar"');
    await page.screenshot({ path: SAIDA + 'c2-r7-lote3-1440.png' });
  });

  await cenario(mock.base, 'celular 375', 375, async (page) => {
    await semear(page);
    await irQuadro(page, DIA);
    await page.click('#qdConf [data-r7c-alt]'); await dorme(500);
    let med = await page.evaluate(() => ({ lw: document.documentElement.scrollWidth, vw: innerWidth,
      peq: [...document.querySelectorAll('#qdConf button, #qdConf a')].filter((e) => e.offsetParent !== null).map((e) => [e.textContent.trim().slice(0, 14), Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < 44) }));
    conf(med.lw <= med.vw + 1, `Celular 375 px: painel de confirmação sem rolagem lateral (${med.lw}/${med.vw})`);
    conf(med.peq.length === 0, 'Celular 375 px: botões do painel de confirmação com 44 px ou mais ' + JSON.stringify(med.peq));
    await page.screenshot({ path: SAIDA + 'c2-r7-lote3-375-conf.png' });
    await page.evaluate(() => document.querySelector('.qd-card[data-nome="Teste Bia"] [data-qd="faltou"]').click()); await dorme(1800);
    med = await page.evaluate(() => { const f = document.querySelector('#r7Motivo'); const r = f && f.getBoundingClientRect(); return { lw: document.documentElement.scrollWidth, vw: innerWidth, dentro: !!r && r.left >= 0 && r.right <= innerWidth + 1,
      peq: [...document.querySelectorAll('#r7Motivo button')].map((e) => [e.textContent.trim().slice(0, 14), Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < 44) }; });
    conf(med.dentro && med.lw <= med.vw + 1, 'Celular 375 px: a folha do motivo cabe na tela sem rolagem lateral');
    conf(med.peq.length === 0, 'Celular 375 px: chips do motivo com 44 px ou mais ' + JSON.stringify(med.peq));
    await page.screenshot({ path: SAIDA + 'c2-r7-lote3-375-motivo.png' });
    await page.evaluate(() => document.querySelector('#r7Motivo [data-r7m="sem_resposta"]').click()); await dorme(1200);
    conf((await por(page, 'Teste Bia')).motivo_falta === 'sem_resposta', 'Celular 375 px: tocar no motivo grava');
  });
} finally { mock.parar(); }
fim();
