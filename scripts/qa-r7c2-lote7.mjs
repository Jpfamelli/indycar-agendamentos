// QA da Agenda (rodada 7, C2, lote 7): lista de espera com idade, vaga que abre, fila do Comunicar, nomes hostis e varredura em 375 px.
// Navegador headless contra o servidor de MENTIRA em porta própria.   node scripts/qa-r7c2-lote7.mjs
import { iniciarMock, cenario, conf, fim, dorme, api, diaUtil, irQuadro, hojeIso, GAB, LEO, SAIDA } from './qa-r7c2-lib.mjs';

const mock = iniciarMock(3213);
const DIA = diaUtil(1);
const HOSTIL = '<img src=x onerror="window.__xss=1">Zé "Aspas" & <b>Cia</b>';
const semear = async (page) => {
  await api(page, 'POST', '/api/__reset', {});
  const cria = (o) => api(page, 'POST', '/api/agendamentos', { servico: 'Troca de óleo', veiculo: 'Onix', data: DIA, ...o });
  await cria({ cliente_nome: 'Vaga Vera', hora: '10:30', consultor_id: GAB, consultor_nome: 'Gabriel', telefone: '12991110031' });
  await cria({ cliente_nome: 'Conf Caio', hora: '09:00', consultor_id: LEO, consultor_nome: 'Leonardo', telefone: '12991110032' });
  await api(page, 'POST', '/api/espera', { cliente_nome: 'Velha Ana', servico: 'Freios', telefone: '12991110033', created_at: new Date(Date.now() - 9 * 864e5).toISOString() });
};
const itensEspera = (page) => page.$$eval('.espera-item.aberta', (l) => l.map((x) => ({ nome: x.dataset.nome, cls: x.className, dias: x.dataset.dias })));

try {
  await dorme(900);
  await cenario(mock.base, 'desktop', 1440, async (page) => {
    await semear(page);
    // ---- espera com idade ----
    await page.evaluate(() => route('espera')); await page.waitForSelector('.espera-item', { timeout: 15000 }); await dorme(600);
    let it = await itensEspera(page);
    const velha = it.find((x) => x.nome === 'Velha Ana'), joana = it.find((x) => x.nome === 'Joana Ribeiro');
    conf(velha && /r7-esp-ruim/.test(velha.cls), 'Espera: quem espera há 7 dias ou mais ganha a faixa vermelha (' + (velha && velha.dias) + ' d)');
    conf(joana && !/r7-esp-ruim|r7-esp-aviso/.test(joana.cls), 'Espera: quem entrou há 2 dias fica sem alerta');
    const resumo = await page.$eval('#r7EsperaResumo', (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
    conf(/1 esperando há 7 dias ou mais/.test(resumo) && /9 d/.test(resumo), '🔗 Espera: o resumo conta quem passou de 7 dias e a mais antiga (' + resumo + ')');
    await page.evaluate(() => document.querySelector('[data-r7-esp-ord]').click()); await dorme(500);
    it = await itensEspera(page);
    conf(it[0].nome === 'Velha Ana', 'Espera: "Mais antigas primeiro" põe a de 9 dias no topo (' + it.map((x) => x.nome).join(', ') + ')');
    conf((await page.evaluate(() => localStorage.getItem('indycar_r7_espera_antigas'))) === '1', 'Espera: a ordem escolhida fica lembrada neste aparelho');
    await page.evaluate(() => document.querySelector('[data-r7-esp-ord]').click()); await dorme(900);
    conf((await itensEspera(page))[0].nome !== 'Velha Ana', 'Espera: desligar volta à ordem de antes');
    // 💬 nos horários livres
    await page.evaluate(() => document.querySelector('.espera-item[data-nome="Joana Ribeiro"] [data-r6b-slots]').click()); await page.waitForSelector('.r6b-slot', { timeout: 10000 }); await dorme(700);
    const ofertas = await page.$$eval('.espera-item[data-nome="Joana Ribeiro"] [data-r7-oferta]', (l) => l.map((a) => decodeURIComponent(a.href)));
    conf(ofertas.length >= 1 && ofertas.every((u) => /^https:\/\/wa\.me\/5512991110099\?text=Oi Joana! .*Abriu um horário/.test(u)), '🔗 Espera: cada horário livre sugerido tem o 💬 que o oferece à pessoa (' + ofertas.length + ')');

    // ---- vaga que abre quando alguém falta ----
    await irQuadro(page, DIA);
    await page.evaluate(() => document.querySelector('.qd-card[data-nome="Vaga Vera"] [data-qd="faltou"]').click()); await dorme(2500);
    const vaga = await page.$eval('#r7Motivo .r7m-vaga', (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
    conf(/A vaga de .* às 10:30 abriu/.test(vaga) && /Joana/.test(vaga), '🔗 Falta: a folha avisa que a vaga abriu e quem da espera serve (' + vaga.slice(0, 100) + ')');
    conf(/Velha.*Joana/.test(vaga) && !/Pedro/.test(vaga), 'Falta: a mais antiga da espera vem primeiro; Pedro (alinhamento só até 10h) não serve às 10:30 e não é oferecido');
    const waV = await page.$eval('#r7Motivo .r7m-vaga a[href^="https://wa.me/"]', (a) => decodeURIComponent(a.href)).catch(() => '');
    conf(/^https:\/\/wa\.me\/5512991110033\?text=/.test(waV) && /Abriu um horário/.test(waV) && /10:30/.test(waV), '🔗 Falta: 💬 oferece a vaga à primeira da espera com o recado pronto');
    await page.evaluate(() => document.querySelectorAll('#r7Motivo [data-r7m-encaixar]')[1].click());
    await page.waitForSelector('#f_nome', { timeout: 8000 }); await dorme(500);
    const f = await page.evaluate(() => ({ n: f_nome.value, h: f_hora.value, d: f_data.value }));
    conf(f.n === 'Joana Ribeiro' && f.h === '10:30' && f.d === DIA, '🔗 Falta: "Encaixar" abre o horário novo já com Joana, 10:30 e o dia (' + JSON.stringify(f) + ')');
    conf(!(await page.$('#r7Motivo')), 'Falta: a folha fecha ao encaixar');
    await page.keyboard.press('Escape'); await dorme(300);

    // ---- fila do Comunicar ----
    await irQuadro(page, DIA);
    await page.evaluate(() => localStorage.setItem('indycar_r7_conf_aberto', '1')); await page.evaluate(() => R6b.redesenhar()); await dorme(600);
    await page.evaluate(() => document.querySelector('#qdConf [data-r7c-fila]').click()); await dorme(1200);
    const fila = await page.$eval('#qdConf [data-r7c-fila]', (b) => b.textContent.trim()).catch(() => '');
    conf(/Na fila/.test(fila), '🔗 Confirmação: "📨 Fila" põe o lembrete na fila do Comunicar e vira "Na fila"');

    // ---- nomes hostis ----
    await api(page, 'POST', '/api/agendamentos', { cliente_nome: HOSTIL, servico: 'Troca de óleo', data: DIA, hora: '11:00', consultor_id: GAB, consultor_nome: 'Gabriel', telefone: '12991110034',
      observacoes: 'PRÉ-AGENDAMENTO pedido pelo cliente — Orçamento nº 0099 (Orçador)', origem: 'Google' });
    await api(page, 'POST', '/api/espera', { cliente_nome: HOSTIL, servico: 'Freios', telefone: '12991110035' });
    await irQuadro(page, DIA); await dorme(1500);
    await page.evaluate(() => { localStorage.setItem('indycar_r7_pre_aberto', '1'); R6b.redesenhar(); }); await dorme(1200);
    const nPre = await page.$$eval('#qdPre li, #qdConf li', (l) => l.length);
    conf(nPre >= 2, 'Hostil: o nome com HTML aparece nos painéis de pré-agendamento e confirmação (' + nPre + ')');
    await page.evaluate(() => { const c = [...document.querySelectorAll('.qd-card')].find((x) => /Aspas/.test(x.dataset.nome)); c && c.querySelector('[data-qd="faltou"]').click(); }); await dorme(2200);
    await page.evaluate(() => route('espera')); await page.waitForSelector('.espera-item'); await dorme(700);
    const xss = await page.evaluate(() => ({ exec: window.__xss === 1, img: document.querySelectorAll('img[src="x"]').length, tags: document.querySelectorAll('#qdConf b, #qdPre b, .espera-item b').length >= 0 }));
    conf(!xss.exec && xss.img === 0, '🔗 Hostil: nenhum script rodou e nenhuma imagem do atacante entrou na tela (painéis, folha do motivo e espera)');
    const texto = await page.$eval('.espera-item[data-nome*="Aspas"] .quem', (e) => e.innerText).catch(() => '');
    conf(/<img src=x onerror/.test(texto), 'Hostil: o texto do atacante aparece como texto puro, não como HTML (' + texto.slice(0, 60).replace(/\n/g, ' ') + ')');

    // ---- varredura de telas: sem erro e sem rolagem lateral ----
    for (const tela of ['inicio', 'agenda', 'quadro', 'espera', 'dono', 'semana']) {
      await page.evaluate((t) => route(t), tela); await dorme(1500);
      const lw = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      conf(lw <= 1, `Varredura 1440 px: tela "${tela}" sem rolagem lateral (${lw})`);
    }
    await page.screenshot({ path: SAIDA + 'c2-r7-lote7-1440.png' });
  });

  // ---- relatório: planilha e atalho R ----
  await cenario(mock.base, 'relatório', 1440, async (page) => {
    await semear(page);
    await page.keyboard.press('r'); await dorme(1800);
    conf(await page.$('.r7r-kpis') !== null, 'Atalho: a tecla R abre os relatórios do dono');
    await page.evaluate(() => { window.__csv = null; const orig = URL.createObjectURL; URL.createObjectURL = (b) => { b.arrayBuffer().then((ab) => { const u = new Uint8Array(ab); window.__bom = u[0] === 0xEF && u[1] === 0xBB && u[2] === 0xBF; window.__csv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(ab); }); return orig.call(URL, b); }; HTMLAnchorElement.prototype.click = function () { window.__baixou = this.download; }; });
    await page.evaluate(() => document.querySelector('[data-r7r-csv]').click()); await dorme(800);
    const csv = await page.evaluate(() => window.__csv), nome = await page.evaluate(() => window.__baixou);
    conf(/^relatorio-agenda-\d{4}-\d{2}-\d{2}-a-\d{4}-\d{2}-\d{2}\.csv$/.test(nome || ''), '🔗 Relatórios: "Baixar planilha" baixa um .csv com o período no nome (' + nome + ')');
    conf(!!csv && (await page.evaluate(() => window.__bom)) && /Dia;Data;Horários;Ocupação %/.test(csv) && /Consultor;Horários;Vieram/.test(csv), 'Relatórios: a planilha abre no Excel em português (BOM, separador ;, tabelas por dia e por consultor)');
  });

  // ---- recepção: o motivo da falta também é anotado por quem só marca presença ----
  await cenario(mock.base, 'recepção', 390, async (page) => {
    await api(page, 'POST', '/api/__reset', {});
    const a = await api(page, 'POST', '/api/agendamentos', { cliente_nome: 'Rec Rita', servico: 'Troca de óleo', data: hojeIso(), hora: '16:00', consultor_id: GAB, consultor_nome: 'Gabriel', telefone: '12991110036', veiculo: 'Onix' });
    await page.goto(mock.base + '/?tour=0&papel=agenda', { waitUntil: 'networkidle2' }); await page.waitForSelector('.nav-item', { timeout: 20000 }); await dorme(1500);
    await page.waitForSelector('[data-marca="nao_veio"]', { timeout: 15000 });
    await page.evaluate((id) => document.querySelector('.rec-card[data-id="' + id + '"] [data-marca="nao_veio"], [data-id="' + id + '"] [data-marca="nao_veio"]').click(), a.j.id); await dorme(500);
    await page.evaluate(() => document.querySelector('[data-sim]').click()); await dorme(2000);
    conf(!!(await page.$('#r7Motivo')), 'Recepção: depois de "Não veio" abre a folha do motivo (também para o papel agenda)');
    conf(!(await page.$('#r7Motivo .r7m-vaga')), 'Recepção: sem consulta à espera (só marca presença)');
    await page.evaluate(() => document.querySelector('#r7Motivo [data-r7m="sem_resposta"]').click()); await dorme(1200);
    const x = (await api(page, 'GET', '/api/agendamentos')).j.find((q) => q.id === a.j.id);
    conf(x && x.motivo_falta === 'sem_resposta', '🔗 Recepção: o motivo fica gravado pelo papel agenda');
  });

  await cenario(mock.base, 'celular 375', 375, async (page) => {
    await semear(page);
    for (const tela of ['inicio', 'agenda', 'quadro', 'espera', 'dono', 'semana']) {
      await page.evaluate((t) => route(t), tela); await dorme(1700);
      const m = await page.evaluate(() => ({ lw: document.documentElement.scrollWidth - innerWidth,
        peq: [...document.querySelectorAll('#view .r7-esp-resumo .btn, #view .r7-oferta, #view .r7r-filtros button, #view .r7-conf button, #view .r7-pre button')].filter((e) => e.offsetParent !== null).map((e) => [e.textContent.trim().slice(0, 12), Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < 44) }));
      conf(m.lw <= 1, `Varredura 375 px: tela "${tela}" sem rolagem lateral (${m.lw})`);
      conf(m.peq.length === 0, `Varredura 375 px: "${tela}" com botões novos de 44 px ou mais ` + JSON.stringify(m.peq));
    }
    await page.evaluate(() => route('espera')); await page.waitForSelector('.espera-item'); await dorme(700);
    await page.screenshot({ path: SAIDA + 'c2-r7-lote7-375-espera.png' });
  });
} finally { mock.parar(); }
fim();
