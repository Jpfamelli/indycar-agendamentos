// QA da Agenda (rodada 7, C2, lote 1): "Chegou" → entrada pronta no Pátio, "Orçar", "Avisar: pronto" no Início.
// Navegador headless contra o servidor de MENTIRA em porta própria.   node scripts/qa-r7-lote1.mjs
import { iniciarMock, cenario, conf, fim, dorme, api, hojeIso, horaAgora, irQuadro, card, abertos, textoToast, acoesToast, clicarToast, GAB, LEO, SAIDA } from './qa-r7c2-lib.mjs';

const mock = iniciarMock(3207);
const HOJE = hojeIso();
const semear = async (page) => {
  await api(page, 'POST', '/api/__reset', {});
  const cria = (nome, hora, cons, tel, extra = {}) => api(page, 'POST', '/api/agendamentos', {
    cliente_nome: nome, servico: 'Revisão de suspensão', data: HOJE, hora, consultor_id: cons, consultor_nome: cons === GAB ? 'Gabriel' : 'Leonardo', telefone: tel, veiculo: 'Onix', placa: 'ABC1D23', ...extra });
  await cria('Teste Ana', '09:00', GAB, '12991110011');
  await cria('Teste Bia', '09:30', LEO, '12991110012', { orcamento: { status: 'aprovado', numero: 12, total: 900 } });
  await cria('Teste Caio', '10:00', GAB, '12991110013');
  await cria('Teste Duda', '10:30', LEO, '12991110014');
};
const idDe = async (page, nome) => (await api(page, 'GET', `/api/agendamentos?data=${HOJE}`)).j.find((a) => a.cliente_nome === nome)?.id;
const reabrir = async (page) => { await page.evaluate(() => route('quadro')); await dorme(300); await page.$eval('#qdData', (e, d) => { e.value = d; e.dispatchEvent(new Event('change', { bubbles: true })); }, HOJE); await dorme(900); };

try {
  await dorme(900);
  await cenario(mock.base, 'desktop', 1440, async (page) => {
    await semear(page);
    await irQuadro(page, HOJE);
    // 1) Chegou sem orçamento: "Dar entrada" e "Orçar" no recado
    await page.click(card('Teste Ana') + ' [data-qd="chegou"]'); await dorme(900);
    let ac = await acoesToast(page);
    conf(ac.includes('Dar entrada'), '🔗 Chegou: o recado oferece "Dar entrada" ' + JSON.stringify(ac));
    conf(ac.includes('Orçar'), '🔗 Chegou sem orçamento: o recado oferece "Orçar" (pendência da R6 conferida no navegador)');
    const idAna = await idDe(page, 'Teste Ana');
    await clicarToast(page, 'Dar entrada'); await dorme(300);
    let ab = await abertos(page);
    const u = new URL(ab[0][0]);
    conf(ab.length === 1 && ab[0][1] === 'indycar-patio' && u.origin === 'https://indycar-patio.netlify.app', '🔗 "Dar entrada" abre a aba nomeada indycar-patio (' + JSON.stringify(ab[0]).slice(0, 110) + ')');
    conf(u.searchParams.get('entrada') === '1' && u.searchParams.get('agendamento') === idAna, '🔗 O link leva ?entrada=1 e o agendamento do cartão');
    conf(u.searchParams.get('orcamento') === null, 'Sem orçamento ligado, o link não leva ?orcamento');
    conf(u.searchParams.get('placa') === 'ABC1D23' && u.searchParams.get('carro') === 'Onix', 'O link leva placa e carro (preenche a entrada)');
    conf(!/1299111|Teste/.test(ab[0][0]), 'Telefone e nome do cliente NÃO estão no link');
    // "Orçar" do recado de novo (o recado fechou ao clicar): refaz o Chegou em outro cartão e clica em Orçar
    await page.click(card('Teste Caio') + ' [data-qd="chegou"]'); await dorme(900);
    await clicarToast(page, 'Orçar'); await dorme(300);
    ab = await abertos(page);
    const o = new URL(ab.at(-1)[0]);
    conf(ab.at(-1)[1] === 'indycar-orcador' && o.origin === 'https://indycar-orcador.netlify.app', '🔗 "Orçar" abre a aba nomeada indycar-orcador');
    conf(o.searchParams.get('tel') === '5512991110013' && o.searchParams.get('nome') === 'Teste Caio', '🔗 "Orçar" leva o telefone (55…) e o nome do cliente certo');
    // 2) Chegou COM orçamento: leva ?orcamento e NÃO oferece "Orçar"
    await page.click(card('Teste Bia') + ' [data-qd="chegou"]'); await dorme(900);
    ac = await acoesToast(page);
    conf(ac.includes('Dar entrada') && !ac.includes('Orçar'), '🔗 Chegou com orçamento: "Dar entrada" sim, "Orçar" não (não duplica orçamento) ' + JSON.stringify(ac));
    await clicarToast(page, 'Dar entrada'); await dorme(300);
    const u2 = new URL((await abertos(page)).at(-1)[0]);
    conf(/^[0-9a-f-]{36}$/.test(u2.searchParams.get('orcamento') || ''), '🔗 O link da entrada leva o ?orcamento do orçamento aprovado');
    // 3) botão fixo "Entrada" nos cartões de quem chegou
    await dorme(500);
    const btns = await page.$$eval('.qd-card [data-qd-entrada]', (bs) => bs.map((b) => b.closest('.qd-card').dataset.nome));
    conf(['Teste Ana', 'Teste Bia', 'Teste Caio'].every((n) => btns.includes(n)) && !btns.includes('Teste Duda'), '🔗 Quem chegou ganha o botão fixo "Entrada" no cartão (' + btns.join(',') + ')');
    const antes = (await abertos(page)).length;
    await page.click(card('Teste Ana') + ' [data-qd-entrada]'); await dorme(500);
    ab = await abertos(page);
    conf(ab.length === antes + 1 && ab.at(-1)[1] === 'indycar-patio' && ab.at(-1)[0].includes(idAna), '🔗 O botão fixo reabre a entrada da Ana na aba do Pátio');
    // 4) "abrir sozinho"
    conf(await page.$eval('.r7-auto input', (c) => !c.checked), 'O interruptor "abrir a entrada sozinho" começa desligado');
    await page.click('.r7-auto input'); await dorme(200);
    conf((await page.evaluate(() => localStorage.getItem('indycar_r7_entrada_auto'))) === '1', 'Ligar o interruptor fica lembrado neste aparelho');
    const n0 = (await abertos(page)).length;
    await page.click(card('Teste Duda') + ' [data-qd="chegou"]'); await dorme(1000);
    ab = await abertos(page);
    conf(ab.length === n0 + 1 && ab.at(-1)[1] === 'indycar-patio', '🔗 Com o interruptor ligado, o Chegou abre a entrada sozinho na aba do Pátio');
    conf(/entrada aberta no Pátio/.test(await textoToast(page)), 'O recado diz que a entrada foi aberta');
    conf(!(await acoesToast(page)).includes('Dar entrada'), 'E não repete o botão "Dar entrada"');
    await page.screenshot({ path: SAIDA + 'c2-r7-lote1-quadro.png' });
    await page.click('.r7-auto input');                                    // volta ao padrão
    // 5) Início: carro pronto ganha "Avisar"
    await api(page, 'POST', '/api/__patio', { agendamento_id: idAna, etapa: 'pronto' });
    await api(page, 'POST', '/api/__patio', { agendamento_id: await idDe(page, 'Teste Caio'), etapa: 'em_execucao' });
    await page.reload({ waitUntil: 'networkidle2' }); await page.waitForSelector('.nav-item'); await dorme(1800);
    const linhas = await page.$$eval('#r6Faixas li', (ls) => ls.map((l) => ({ pronto: l.classList.contains('r7-pronto'), avisar: !!l.querySelector('[data-r7-avisar]'), href: l.querySelector('[data-r7-avisar]')?.getAttribute('href') || '' })));
    conf(linhas.length >= 2 && linhas[0].pronto, 'Início: o carro pronto vem primeiro em "No pátio agora" ' + JSON.stringify(linhas.map((l) => l.pronto)));
    conf(linhas[0].avisar && linhas[0].href.startsWith('https://wa.me/5512991110011?text='), '🔗 Início: carro pronto ganha "Avisar: pronto" com o WhatsApp do cliente');
    conf(/Teste%20Ana|Ana/.test(decodeURIComponent(linhas[0].href)) === false || /pronto/.test(decodeURIComponent(linhas[0].href)), 'O recado de pronto está montado');
    conf(linhas.filter((l) => l.avisar).length === 1, 'Só o pronto tem o botão (o que está em execução não)');
    await page.$eval('[data-r7-avisar]', (a) => a.addEventListener('click', (e) => e.preventDefault(), { once: true }));
    await page.click('[data-r7-avisar]'); await dorme(300);
    const marc = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('indycar_r7_avisados') || '{}')).length);
    conf(marc === 1, 'Clicar em "Avisar" lembra que a pessoa foi avisada (neste aparelho)');
    await page.reload({ waitUntil: 'networkidle2' }); await page.waitForSelector('.nav-item'); await dorme(1800);
    const txt = await page.$eval('[data-r7-avisar]', (a) => a.textContent.trim()).catch(() => '');
    conf(/Avisar de novo/.test(txt) && (await page.$('.r7-avisado')), 'Depois de avisar, o botão vira "Avisar de novo" e mostra a hora do aviso');
    await page.screenshot({ path: SAIDA + 'c2-r7-lote1-inicio.png' });
  });

  await cenario(mock.base, 'semeando para a recepção', 1024, async (page) => { await semear(page); });
  await cenario(mock.base, 'recepção (Franklin)', 1024, async (page) => {
    await page.evaluate(() => route('dia')); await dorme(1200);
    const alvo = await page.$('.rec-cartao[data-nome="Teste Ana"] [data-marca="compareceu"]');
    conf(!!alvo, 'Recepção: o cartão da Ana tem o botão Chegou');
    await alvo.click(); await dorme(1200);
    const ac = await acoesToast(page);
    conf(ac.includes('Dar entrada'), '🔗 Recepção: o recado do Chegou também oferece "Dar entrada" ' + JSON.stringify(ac));
    await clicarToast(page, 'Dar entrada'); await dorme(300);
    const ab = await abertos(page);
    conf(ab.length === 1 && ab[0][1] === 'indycar-patio' && !/1299111/.test(ab[0][0]), '🔗 Recepção: abre a aba do Pátio, sem telefone no link');
    await page.click('[data-hoje-tab="chegaram"]'); await dorme(500);
    const ent = await page.$('.rec-cartao[data-nome="Teste Ana"] [data-marca="entrada"]');
    conf(!!ent, 'Recepção: em "Já chegaram" o cartão ganha "Dar entrada" fixo');
    await ent.click(); await dorme(500);
    conf((await abertos(page)).length === 2, '🔗 Recepção: o botão fixo reabre a entrada');
    conf(await page.$eval('.r7-auto-rec input', (c) => !c.checked), 'Recepção: interruptor "entrada do Pátio sozinha" presente e desligado');
    await page.screenshot({ path: SAIDA + 'c2-r7-lote1-recepcao.png' });
  }, '/?papel=agenda&tour=0');

  await cenario(mock.base, 'celular 375', 375, async (page) => {
    await semear(page);
    await irQuadro(page, HOJE);
    await page.click(`[data-qd-foco="${GAB}"]`); await dorme(400);
    await page.click(card('Teste Ana') + ' [data-qd="chegou"]'); await dorme(1000);
    const med = await page.evaluate(() => ({ lw: document.documentElement.scrollWidth, vw: innerWidth,
      peq: [...document.querySelectorAll('.qd-card .qd-acoes .btn, .r7-auto')].filter((e) => e.offsetParent !== null).map((e) => [e.textContent.trim().slice(0, 14), Math.round(e.getBoundingClientRect().height)]).filter((x) => x[1] < 44) }));
    conf(med.lw <= med.vw + 1, `Celular 375 px: sem rolagem lateral (${med.lw}/${med.vw})`);
    conf(med.peq.length === 0, 'Celular 375 px: botões do cartão (inclusive "Entrada") e o interruptor com 44 px ou mais ' + JSON.stringify(med.peq));
    await page.screenshot({ path: SAIDA + 'c2-r7-lote1-375.png' });
  });
} finally { mock.parar(); }
fim();
