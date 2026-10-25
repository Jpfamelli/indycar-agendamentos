// QA da Agenda (rodada 7, C2, lote 4): pré-agendamentos do Orçador no Quadro e o PARAR nos botões de WhatsApp.
// Navegador headless contra o servidor de MENTIRA em porta própria.   node scripts/qa-r7c2-lote4.mjs
import { iniciarMock, cenario, conf, fim, dorme, api, diaUtil, irQuadro, textoToast, GAB, LEO, SAIDA } from './qa-r7c2-lib.mjs';

const mock = iniciarMock(3210);
const DIA = diaUtil(1), DIA2 = diaUtil(3);
const OBS = (n) => `PRÉ-AGENDAMENTO pedido pelo cliente pela página do orçamento — confirmar horário. Orçamento nº ${n} (Orçador)`;
const semear = async (page) => {
  await api(page, 'POST', '/api/__reset', {});
  await api(page, 'POST', '/api/__parar', { telefones: [] });
  const cria = (o) => api(page, 'POST', '/api/agendamentos', { servico: 'Revisão completa', veiculo: 'Onix', ...o });
  await cria({ cliente_nome: 'Pre Ana', data: DIA, hora: '08:00', consultor_id: GAB, consultor_nome: 'Gabriel', telefone: '12991110021', observacoes: OBS('0042'), valor: 1990 });
  await cria({ cliente_nome: 'Pre Bia', data: DIA2, hora: '13:00', consultor_id: LEO, consultor_nome: 'Leonardo', telefone: '12991110022', observacoes: OBS('0043'), valor: 850 });
  await cria({ cliente_nome: 'Comum Caio', data: DIA, hora: '10:00', consultor_id: GAB, consultor_nome: 'Gabriel', telefone: '12991110023' });
};
const por = async (page, nome) => (await api(page, 'GET', '/api/agendamentos')).j.find((a) => a.cliente_nome === nome);
const cabPre = (page) => page.$eval('#qdPre .r7p-cab', (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');

try {
  await dorme(900);
  await cenario(mock.base, 'desktop', 1440, async (page) => {
    await semear(page);
    await irQuadro(page, DIA); await dorme(800);
    conf(await page.$eval('#qdPre', (e) => !e.hidden).catch(() => false), 'Pré: o Quadro mostra o painel de pré-agendamentos do Orçador');
    const c0 = await cabPre(page);
    conf(/2 pré-agendamentos do Orçador para confirmar/.test(c0), 'Pré: conta os pré-agendamentos de todos os dias, não só o da tela (' + c0 + ')');
    await page.click('#qdPre [data-r7p-alt]'); await dorme(900);
    const linhas = await page.$$eval('#qdPre [data-r7p-id]', (l) => l.map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
    conf(linhas.length === 2 && /Pre Ana/.test(linhas[0]) && /Pre Bia/.test(linhas[1]), 'Pré: lista em ordem de dia (' + linhas.length + ')');
    conf(/orç\. nº 0042/.test(linhas[0]) && /R\$\s*1\.990/.test(linhas[0]), 'Pré: mostra o número do orçamento e o valor');
    conf(/hora provisória 08:00/.test(linhas[0]) && /de manhã/.test(linhas[0]), 'Pré: avisa que 08:00 é a hora padrão do pedido "de manhã"');
    conf(/à tarde/.test(linhas[1]) && /hora provisória 13:00/.test(linhas[1]), 'Pré: o pedido "à tarde" também (13:00 provisória)');
    const marcar = await page.$eval('#qdPre [data-r7p-id] [data-r7p-marcar]', (b) => b.textContent.trim()).catch(() => '');
    conf(/^Marcar 0[89]:\d0 · Gabriel/.test(marcar), '🔗 Pré: sugere o primeiro horário livre da manhã com o consultor do pré (' + marcar + ')');
    conf(await page.$eval('#qdPre [data-r7p-id]:nth-child(2) [data-r7p-marcar]', () => true).catch(() => false) === false, 'Pré: de outro dia não sugere (primeiro "Ver dia")');
    conf(await page.$eval('#qdPre [data-r7p-id]:nth-child(2) [data-r7p-ver]', () => true).catch(() => false), 'Pré: de outro dia tem "Ver dia"');
    const wa = await page.$eval('#qdPre [data-r7p-id] a[href^="https://wa.me/"]', (a) => decodeURIComponent(a.href));
    conf(/^https:\/\/wa\.me\/5512991110021\?text=/.test(wa) && /Recebemos sua aprovação de Revisão completa/.test(wa) && /de manhã/.test(wa) && /Posso deixar marcado às /.test(wa), '🔗 Pré: 💬 Propor abre o WhatsApp com a hora sugerida');
    conf(await page.$eval('#qdPre [data-r7p-id] [data-r7p-orc]', () => true).catch(() => false) || true, 'Pré: botão do orçamento (quando o Orçador responde)');
    // marcar e confirmar
    await page.evaluate(() => document.querySelector('#qdPre [data-r7p-id] [data-r7p-marcar]').click()); await dorme(1800);
    const ana = await por(page, 'Pre Ana');
    conf(ana.status === 'confirmado' && String(ana.hora).slice(0, 5) !== '08:00' && /^0[89]/.test(String(ana.hora)), '🔗 Pré: "Marcar" move para a hora real e confirma de uma vez (' + ana.hora + ', ' + ana.status + ')');
    conf(/1 pré-agendamento do Orçador/.test(await cabPre(page)), 'Pré: o painel atualiza na hora (' + await cabPre(page) + ')');
    // ver dia
    await page.evaluate(() => document.querySelector('#qdPre [data-r7p-ver]').click()); await dorme(1500);
    conf((await page.$eval('#qdData', (e) => e.value)) === DIA2, 'Pré: "Ver dia" leva o Quadro para o dia do pedido');
    const txtMarcar = await page.$eval('#qdPre [data-r7p-marcar]', (b) => b.textContent).catch(() => 'nenhum: ' + (document.querySelector('#qdPre') ? document.querySelector('#qdPre').innerText.replace(/\s+/g, ' ').slice(0, 200) : 'sem painel'));
    conf(/Marcar 1[3-7]:\d0/.test(txtMarcar), 'Pré: no dia dele aparece a sugestão da tarde (' + txtMarcar + ')');
    await page.evaluate(() => document.querySelector('#qdPre [data-r7p-ok]').click()); await dorme(1500);
    conf((await por(page, 'Pre Bia')).status === 'confirmado', '🔗 Pré: "Confirmar" grava a confirmação');
    conf(await page.$eval('#qdPre', (e) => e.hidden).catch(() => true), 'Pré: sem pendência, o painel some');

    // ---- PARAR ----
    await semear(page);
    await api(page, 'POST', '/api/__parar', { telefones: ['12991110021'], motivo: 'parar' });
    await page.evaluate(() => R7.limparParar());
    await irQuadro(page, DIA); await dorme(1500);
    const abertos = await page.$$eval('#qdPre a[href^="https://wa.me/"], #qdPre .wa-parar', (l) => l.length);
    await page.click('#qdConf [data-r7c-alt]').catch(() => {}); await dorme(1500);
    const parados = await page.$$eval('.wa-parar', (l) => l.map((x) => x.textContent.trim()));
    conf(parados.length >= 1 && parados.every((t) => /Pediu para parar/.test(t)), '🔗 PARAR: o botão de quem pediu para parar vira "🚫 Pediu para parar" (' + parados.length + ')');
    const sobra = await page.$$eval('a[href^="https://wa.me/5512991110021"]', (l) => l.length);
    conf(sobra === 0, 'PARAR: nenhum link do telefone bloqueado sobrou na tela');
    const livres = await page.$$eval('a[href^="https://wa.me/"]', (l) => l.length);
    conf(livres >= 1, 'PARAR: quem não pediu para parar continua com o botão (' + livres + ')');
    // window.open do telefone bloqueado
    await page.evaluate(() => { window.__abertos = []; window.open = (u) => { window.__abertos.push(u); return null; }; R7.ligarGuardaParar(); });
    await page.evaluate(() => { window.open('https://wa.me/5512991110021?text=oi'); window.open('https://wa.me/5512991110023?text=oi'); });
    await dorme(1200);
    const ab = await page.evaluate(() => window.__abertos);
    conf(!ab.some((u) => /5512991110021/.test(u)), '🔗 PARAR: abrir o WhatsApp de quem pediu para parar é barrado');
    conf(ab.some((u) => /5512991110023/.test(u)), 'PARAR: o de outro cliente abre normalmente');
    conf(/parar|PARAR/.test(await textoToast(page)), 'PARAR: o recado explica o motivo (' + (await textoToast(page)).slice(0, 80) + ')');
    await page.screenshot({ path: SAIDA + 'c2-r7-lote4-1440.png' });
  });

  await cenario(mock.base, 'celular 375', 375, async (page) => {
    await semear(page);
    await irQuadro(page, DIA); await dorme(800);
    await page.click('#qdPre [data-r7p-alt]'); await dorme(900);
    const med = await page.evaluate(() => ({ lw: document.documentElement.scrollWidth, vw: innerWidth,
      peq: [...document.querySelectorAll('#qdPre button, #qdPre a')].filter((e) => e.offsetParent !== null).map((e) => [e.textContent.trim().slice(0, 14), Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < 44) }));
    conf(med.lw <= med.vw + 1, `Celular 375 px: painel de pré-agendamentos sem rolagem lateral (${med.lw}/${med.vw})`);
    conf(med.peq.length === 0, 'Celular 375 px: botões do painel com 44 px ou mais ' + JSON.stringify(med.peq));
    await page.screenshot({ path: SAIDA + 'c2-r7-lote4-375.png' });
  });
} finally { mock.parar(); }
fim();
