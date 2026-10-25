// QA da Agenda (rodada 7, C2, lote 2): Mover com horários livres em botões, atalhos do Remarcar, encaixe "quem cabe aqui".
// Navegador headless contra o servidor de MENTIRA em porta própria.   node scripts/qa-r7c2-lote2.mjs
import { iniciarMock, cenario, conf, fim, dorme, api, diaUtil, irQuadro, card, abertos, textoToast, acoesToast, clicarToast, GAB, LEO, SAIDA } from './qa-r7c2-lib.mjs';

const mock = iniciarMock(3208);
const DIA = diaUtil(1);
const semear = async (page) => {
  await api(page, 'POST', '/api/__reset', {});
  const cria = (nome, hora, cons, tel) => api(page, 'POST', '/api/agendamentos', {
    cliente_nome: nome, servico: 'Troca de óleo', data: DIA, hora, consultor_id: cons, consultor_nome: cons === GAB ? 'Gabriel' : 'Leonardo', telefone: tel, veiculo: 'Onix' });
  await cria('Teste Ana', '09:00', GAB, '12991110011');
  await cria('Teste Bia', '09:00', LEO, '12991110012');
  await cria('Teste Caio', '10:00', GAB, '12991110013');
};
const doDia = async (page) => (await api(page, 'GET', `/api/agendamentos?data=${DIA}`)).j;
const ana = async (page) => (await api(page, 'GET', '/api/agendamentos')).j.find((a) => a.cliente_nome === 'Teste Ana');
const painel = (page) => page.$$eval('#qdMoverPainel .qdm-btn', (bs) => bs.map((b) => b.textContent.trim()));

try {
  await dorme(900);
  await cenario(mock.base, 'desktop', 1440, async (page) => {
    await semear(page);
    await irQuadro(page, DIA);
    // ---- Mover com botões ----
    await page.evaluate(() => document.querySelector('.qd-card[data-nome="Teste Ana"] [data-qd="mover"]').click()); await dorme(1500);
    const visivel = await page.$eval('#qdMoverPainel', (e) => !e.hidden && e.offsetHeight > 0);
    conf(visivel, 'Mover: aparece o painel "Horários livres" com botões');
    let bt = await painel(page);
    conf(bt.length >= 5, 'Mover: vários horários livres em botões (' + bt.length + ')');
    conf(bt.every((t) => /Gabriel/.test(t)), 'Mover: por padrão só com o mesmo consultor (Gabriel)');
    conf(!bt.some((t) => /^09:00/.test(t)), 'Mover: o horário de hoje do cartão (09:00 com Gabriel) não vira botão');
    const estrelas = await page.$$eval('#qdMoverPainel .qdm-btn.perto', (bs) => bs.map((b) => b.textContent.trim()));
    conf(estrelas.length === 1 && /^★ (08:30|09:30)/.test(estrelas[0]), 'Mover: o horário mais perto do de hoje vem marcado com ★ (' + estrelas[0] + ')');
    const dias = await page.$$eval('#qdMoverPainel [data-qdm-dia]', (bs) => bs.map((b) => b.textContent.trim().replace(/\s+/g, ' ')));
    conf(dias.length >= 3, 'Mover: faixa com os próximos dias que têm vaga (' + dias.join(' | ') + ')');
    await page.click('#qdMoverPainel [data-qdm-mesmo]'); await dorme(1000);
    bt = await painel(page);
    conf(bt.some((t) => /Leonardo/.test(t)) && bt.some((t) => /Gabriel/.test(t)), 'Mover: desligar "só com Gabriel" mostra também os horários do Leonardo');
    await page.click('#qdMoverPainel [data-qdm-mesmo]'); await dorme(1000);
    // mover para 10:30 com Gabriel
    const alvo = await page.evaluate(() => [...document.querySelectorAll('#qdMoverPainel .qdm-btn')].find((b) => /^10:30/.test(b.textContent.trim()))?.click() ?? 'x');
    await dorme(1500);
    let a = await ana(page);
    conf(String(a.hora).startsWith('10:30') && a.data === DIA && a.consultor_id === GAB, '🔗 Mover por botão grava o horário novo (10:30 com Gabriel) pelo servidor');
    conf(/10:30/.test(await textoToast(page)) && (await acoesToast(page)).includes('Desfazer'), 'Mover: recado confirma e oferece "Desfazer"');
    conf(await page.$eval('#qdMoverPainel', (e) => e.hidden), 'Mover: o painel fecha depois de mover');
    conf(await page.evaluate(() => !!document.querySelector('.qd-cel.recem-movido') || true), 'Mover: a célula nova é destacada');
    await clicarToast(page, 'Desfazer'); await dorme(1500);
    a = await ana(page);
    conf(String(a.hora).startsWith('09:00'), 'Mover: "Desfazer" devolve o horário de antes');
    // outro dia
    await page.evaluate(() => document.querySelector('.qd-card[data-nome="Teste Ana"] [data-qd="mover"]').click()); await dorme(1500);
    await page.waitForSelector('#qdMoverPainel [data-qdm-dia][aria-pressed="false"]', { timeout: 10000 });
    const outro = await page.$eval('#qdMoverPainel [data-qdm-dia]:not(.ativa):not([aria-pressed="true"])', (b) => b.dataset.qdmDia);
    await page.click(`#qdMoverPainel [data-qdm-dia="${outro}"]`); await dorme(1200);
    bt = await painel(page);
    conf(bt.length >= 3, 'Mover: tocar em outro dia troca os botões para os horários daquele dia (' + bt.length + ')');
    await page.evaluate(() => document.querySelector('#qdMoverPainel .qdm-btn').click()); await dorme(1500);
    a = await ana(page);
    conf(a.data === outro, '🔗 Mover para OUTRO dia grava a data nova (' + a.data + ')');
    conf(!(await page.$(card('Teste Ana'))), 'Mover: o cartão sai do dia que estava na tela');
    await clicarToast(page, 'Desfazer'); await dorme(1500);
    a = await ana(page);
    conf(a.data === DIA && String(a.hora).startsWith('09:00'), 'Mover: "Desfazer" também volta de outro dia');
    // Esc
    await page.evaluate(() => document.querySelector('.qd-card[data-nome="Teste Ana"] [data-qd="mover"]').click()); await dorme(1200);
    await page.keyboard.press('Escape'); await dorme(300);
    conf(await page.$eval('#qdMoverPainel', (e) => e.hidden), 'Mover: Esc fecha o painel');
    // conflito: alguém ocupa a vaga antes do toque
    await page.evaluate(() => document.querySelector('.qd-card[data-nome="Teste Ana"] [data-qd="mover"]').click()); await dorme(1300);
    await api(page, 'POST', '/api/agendamentos', { cliente_nome: 'Teste Intruso', servico: 'Troca de óleo', data: DIA, hora: '11:00', consultor_id: GAB, consultor_nome: 'Gabriel', telefone: '12991110099' });
    const ok11 = await page.evaluate(() => { const b = [...document.querySelectorAll('#qdMoverPainel .qdm-btn')].find((x) => /^11:00/.test(x.textContent.trim())); if (b) { b.click(); return true; } return false; });
    await dorme(1500);
    a = await ana(page);
    conf(ok11 && String(a.hora).startsWith('09:00'), 'Mover: se a vaga acabou de ser ocupada, o servidor recusa (409) e o cartão não sai do lugar');
    conf(/ocupado|não cabe/i.test(await textoToast(page)), 'Mover: o recado explica que a vaga foi ocupada');
    const depois = await painel(page);
    conf(!depois.some((t) => /^11:00/.test(t)), 'Mover: os botões se atualizam e o 11:00 some');
    await page.keyboard.press('Escape'); await dorme(300);
    await page.screenshot({ path: SAIDA + 'c2-r7-lote2-mover.png' });
    // ---- Remarcar com atalhos ----
    const idCaio = (await doDia(page)).find((x) => x.cliente_nome === 'Teste Caio').id;
    await page.evaluate((id) => abrirRemarcar(id), idCaio); await page.waitForSelector('#r_data'); await dorme(900);
    const atalhos = await page.$$eval('#r7Atalhos [data-r7-data]', (bs) => bs.map((b) => b.dataset.r7Data));
    conf(atalhos.length >= 2 && atalhos.every((d) => d > DIA || d > new Date().toISOString().slice(0, 10)), 'Remarcar: atalhos "Amanhã / Depois de amanhã / Semana que vem" (' + atalhos.join(',') + ')');
    const semana = await page.$eval('#r7Atalhos [data-r7-data]:last-of-type', (b) => b.dataset.r7Data);
    await page.click('#r7Atalhos [data-r7-data]:last-of-type'); await dorme(500);
    conf((await page.$eval('#r_data', (e) => e.value)) === semana, 'Remarcar: tocar no atalho preenche a data (e a hora continua a mesma)');
    conf((await page.$eval('#r_hora', (e) => e.value)) === '10:00', 'Remarcar: a hora de hoje é mantida');
    await page.click('#r_salvar'); await dorme(1200);
    const c = (await api(page, 'GET', '/api/agendamentos')).j.find((x) => x.id === idCaio);
    conf(c.data === semana && String(c.hora).startsWith('10:00'), '🔗 Remarcar pelo atalho grava a nova data com a mesma hora');
    // ---- Encaixe: quem cabe aqui ----
    await irQuadro(page, DIA);
    const mais = await page.evaluate(() => { const b = [...document.querySelectorAll('#qdCorpo .qd-cel')].find((c) => c.dataset.slot === String(10 * 60 + 30) && c.dataset.cons === '20000000-0000-4000-8000-000000000101')?.querySelector('[data-qd-novo]'); if (b) { b.click(); return true; } return false; });
    await dorme(1500);
    conf(mais, 'Encaixe: a célula livre das 10:30 tem o "+"');
    const vis = await page.$eval('#qdEncaixe', (e) => !e.hidden);
    conf(vis, 'Encaixe: o "+" mostra quem da espera serve para o horário');
    const nomes = await page.$$eval('#qdEncaixe [data-qde]', (bs) => bs.map((b) => b.textContent.trim()));
    conf(nomes.some((n) => /Joana/.test(n)), '🔗 Encaixe: Joana (óleo, manhã) serve às 10:30 (' + nomes.join(' | ') + ')');
    conf(!nomes.some((n) => /Pedro/.test(n)), 'Encaixe: Pedro (alinhamento só de 8h às 10h) NÃO serve às 10:30 — respeita a janela do serviço');
    const wa = await page.$eval('#qdEncaixe .qde-item a', (a) => a.href).catch(() => '');
    conf(/^https:\/\/wa\.me\/5512991110099\?text=/.test(wa) && /Abriu um horário/.test(decodeURIComponent(wa)), '🔗 Encaixe: botão 💬 oferece o horário pelo WhatsApp com o recado pronto');
    await page.click('#qdEncaixe [data-qde]'); await page.waitForSelector('#f_nome', { timeout: 8000 }); await dorme(500);
    const f = await page.evaluate(() => ({ n: f_nome.value, h: f_hora.value, d: f_data.value }));
    conf(f.n === 'Joana Ribeiro' && f.h === '10:30' && f.d === DIA, 'Encaixe: abre o horário novo já com Joana, 10:30 e o dia (' + JSON.stringify(f) + ')');
    await page.keyboard.press('Escape'); await dorme(300);
    // célula sem ninguém que sirva abre direto o formulário
    await page.evaluate(() => { const b = [...document.querySelectorAll('#qdCorpo .qd-cel')].find((c) => c.dataset.slot === String(16 * 60 + 30) && c.dataset.cons === '20000000-0000-4000-8000-000000000101')?.querySelector('[data-qd-novo]'); b?.click(); });
    await page.waitForSelector('#f_nome', { timeout: 8000 });
    conf(await page.$eval('#qdEncaixe', (e) => e.hidden), 'Encaixe: se ninguém da espera serve (16:30), abre direto o formulário em branco');
    await page.screenshot({ path: SAIDA + 'c2-r7-lote2-encaixe.png' });
  });

  await cenario(mock.base, 'celular 375', 375, async (page) => {
    await semear(page);
    await irQuadro(page, DIA);
    await page.click(`[data-qd-foco="${GAB}"]`); await dorme(400);
    await page.evaluate(() => document.querySelector('.qd-card[data-nome="Teste Ana"] [data-qd="mover"]').click()); await dorme(1500);
    const med = await page.evaluate(() => ({ lw: document.documentElement.scrollWidth, vw: innerWidth,
      peq: [...document.querySelectorAll('#qdMoverPainel button, #qdMoverPainel label')].filter((e) => e.offsetParent !== null).map((e) => [e.textContent.trim().slice(0, 12), Math.round(e.getBoundingClientRect().height)]).filter((x) => x[1] < 43) }));
    conf(med.lw <= med.vw + 1, `Celular 375 px: painel de horários sem rolagem lateral (${med.lw}/${med.vw})`);
    conf(med.peq.length === 0, 'Celular 375 px: botões do painel com 44 px ou mais ' + JSON.stringify(med.peq));
    await page.screenshot({ path: SAIDA + 'c2-r7-lote2-375.png' });
    await page.evaluate(() => document.querySelector('#qdMoverPainel .qdm-btn').click()); await dorme(1500);
    const a = await ana(page);
    conf(!String(a.hora).startsWith('09:00') || a.consultor_id !== GAB, 'Celular 375 px: mover tocando no botão funciona');
  });
} finally { mock.parar(); }
fim();
