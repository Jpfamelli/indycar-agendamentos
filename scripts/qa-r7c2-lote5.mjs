// QA da Agenda (rodada 7, C2, lote 5): o carro ao vivo no Início e no Quadro (filtros, previsão, tempo na etapa, extras).
// Navegador headless contra o servidor de MENTIRA em porta própria.   node scripts/qa-r7c2-lote5.mjs
import { iniciarMock, cenario, conf, fim, dorme, api, hojeIso, irQuadro, GAB, LEO, SAIDA } from './qa-r7c2-lib.mjs';

const mock = iniciarMock(3211);
const HOJE = hojeIso();
const ONTEM_MS = () => new Date(Date.now() - 2 * 3600e3).toISOString();
const semear = async (page) => {
  await api(page, 'POST', '/api/__reset', {});
  for (const x of ((await api(page, 'GET', '/api/patio/agora')).j.itens || [])) await api(page, 'POST', '/api/__patio', { agendamento_id: x.agendamento_id, etapa: 'cancelado' });
  const cria = (nome, hora, cons, tel) => api(page, 'POST', '/api/agendamentos', {
    cliente_nome: nome, servico: 'Revisão', data: HOJE, hora, consultor_id: cons, consultor_nome: cons === GAB ? 'Gabriel' : 'Leonardo', telefone: tel, veiculo: 'Onix', placa: 'ABC1D23', status: 'compareceu', compareceu: 1 });
  const ids = {};
  for (const [nome, hora, cons, tel] of [['Carro A', '08:00', GAB, '12991110011'], ['Carro B', '08:30', LEO, '12991110012'], ['Carro C', '09:00', GAB, '12991110013'], ['Carro D', '09:30', LEO, '12991110014'], ['Carro E', '10:00', GAB, '12991110015']]) {
    ids[nome] = (await cria(nome, hora, cons, tel)).j.id;
  }
  const os = (nome, o) => api(page, 'POST', '/api/__patio', { agendamento_id: ids[nome], ...o });
  await os('Carro A', { etapa: 'pronto', minutos_na_etapa: 40 });
  await os('Carro B', { etapa: 'pronto', minutos_na_etapa: 2000 });
  await os('Carro C', { etapa: 'aguardando_aprovacao', minutos_na_etapa: 300, extras_pendentes: 1 });
  await os('Carro D', { etapa: 'em_execucao', minutos_na_etapa: 20, previsao_entrega: ONTEM_MS() });
  await os('Carro E', { etapa: 'diagnostico', minutos_na_etapa: 10 });
};
const recarregar = async (page) => { await page.reload({ waitUntil: 'networkidle2' }); await page.waitForSelector('.nav-item'); await dorme(1800); };
const linhas = (page) => page.$$eval('#r6Faixas li.r6-li', (ls) => ls.map((l) => l.innerText.replace(/\s+/g, ' ').trim()));

try {
  await dorme(900);
  await cenario(mock.base, 'desktop', 1440, async (page) => {
    await semear(page);
    await recarregar(page);
    const chips = await page.$$eval('#r6Faixas [data-r7-fpatio]', (b) => b.map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
    conf(chips.length >= 4 && /^Todos 5/.test(chips[0]), '🔗 Início: o pátio ganha filtros com a contagem de cada um (' + chips.join(' | ') + ')');
    conf(chips.some((c) => /^Prontos 2/.test(c)) && chips.some((c) => /^Parados 1/.test(c)) && chips.some((c) => /^Esperando o cliente 1/.test(c)) && chips.some((c) => /^Entrega atrasada 1/.test(c)), 'Início: prontos 2, parados 1, esperando o cliente 1, entrega atrasada 1');
    let l = await linhas(page);
    conf(l.length === 5 && /pronto/i.test(l[0]) && /pronto/i.test(l[1]), 'Início: todos os 5 carros, prontos primeiro (' + l.length + ')');
    conf(/entrega atrasada há/.test(l.join(' ')), '🔗 Início: o carro com previsão vencida mostra "entrega atrasada há…"');
    conf(l.some((t) => /pronto há 1 d/.test(t)) && l.some((t) => /Lembrar de retirar/.test(t)), 'Início: pronto há mais de um dia é destacado com "💬 Lembrar de retirar"');
    const waLembrar = await page.$eval('#r6Faixas a[title^="Lembrar o cliente"]', (a) => decodeURIComponent(a.href));
    conf(/^https:\/\/wa\.me\/5512991110012\?text=/.test(waLembrar) && /pronto aqui na IndyCar desde (ontem|\S+ \d\d\/\d\d)\./.test(waLembrar), '🔗 Início: o recado de retirar diz "desde ontem" e vai para o telefone certo (' + waLembrar.slice(0, 120) + ')');
    const waCobrar = await page.$eval('#r6Faixas a[title^="Cobrar a aprovação"]', (a) => decodeURIComponent(a.href)).catch(() => '');
    conf(/^https:\/\/wa\.me\/5512991110013\?text=/.test(waCobrar) && /serviço extra/.test(waCobrar) && /https:\/\/indycar-patio\.netlify\.app/.test(waCobrar), '🔗 Início: "💬 Cobrar aprovação" leva o link de acompanhar do Pátio no recado');
    // filtros
    await page.evaluate(() => document.querySelector('[data-r7-fpatio="prontos"]').click()); await dorme(400);
    l = await linhas(page);
    conf(l.length === 2 && l.every((t) => /Pronto/.test(t)), 'Filtro "Prontos": só os 2 prontos (' + l.length + ')');
    conf((await page.evaluate(() => localStorage.getItem('indycar_r7_filtro_patio'))) === 'prontos', 'O filtro escolhido fica lembrado neste aparelho');
    conf(await page.$eval('[data-r7-fpatio="prontos"]', (b) => b.getAttribute('aria-pressed') === 'true'), 'O chip ativo avisa o leitor de tela (aria-pressed)');
    await page.evaluate(() => document.querySelector('[data-r7-fpatio="extras"]').click()); await dorme(400);
    l = await linhas(page);
    conf(l.length === 1 && /Carro C|Onix/.test(l[0]) && /Cobrar aprovação/.test(l[0]), 'Filtro "Esperando o cliente": só o carro com extra pendente');
    await recarregar(page);
    conf((await linhas(page)).length === 1, 'Depois de recarregar a página o filtro continua');
    await page.evaluate(() => document.querySelector('[data-r7-fpatio="todos"]').click()); await dorme(400);
    conf((await linhas(page)).length === 5, 'Filtro "Todos" volta a mostrar tudo');
    await page.screenshot({ path: SAIDA + 'c2-r7-lote5-inicio-1440.png' });

    // Quadro
    await irQuadro(page, HOJE); await dorme(1800);
    const tempos = await page.$$eval('#qdCorpo .qd-card .r7-tempo', (e) => e.map((x) => x.textContent.trim()));
    conf(tempos.length >= 5, '🔗 Quadro: cada carro com OS mostra há quanto tempo está na etapa (' + tempos.join(', ') + ')');
    conf(tempos.includes('1 d') || tempos.some((t) => /^33h|^1 d|^1d/.test(t)) || tempos.some((t) => /d$|h$/.test(t)), 'Quadro: o tempo vem em forma curta (min, h, d)');
    const tom = await page.$$eval('#qdCorpo .qd-card .r7-tempo.r7-tom-ruim, #qdCorpo .qd-card .r7-tempo.r7-tom-aviso', (e) => e.length);
    conf(tom >= 2, 'Quadro: o tempo parado fica laranja/vermelho quando passa do limite da etapa (' + tom + ')');
    conf(await page.$eval('#qdCorpo .qd-card .r7-prev.ruim', (e) => /atrasada/.test(e.textContent)).catch(() => false), 'Quadro: a previsão de entrega vencida aparece em vermelho');
    const resumo = await page.$eval('#r7PatioResumo', (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
    conf(/5 no pátio/.test(resumo) && /2 prontos/.test(resumo) && /1 parado/.test(resumo), 'Quadro: o resumo do dia diz "5 no pátio · 2 prontos · 1 parado" (' + resumo + ')');
    await page.screenshot({ path: SAIDA + 'c2-r7-lote5-quadro-1440.png' });
  });

  await cenario(mock.base, 'celular 375', 375, async (page) => {
    await semear(page);
    await recarregar(page);
    const med = await page.evaluate(() => ({ lw: document.documentElement.scrollWidth, vw: innerWidth,
      peq: [...document.querySelectorAll('#r6Faixas [data-r7-fpatio], #r6Faixas .r7-patio-extra .btn')].filter((e) => e.offsetParent !== null).map((e) => [e.textContent.trim().slice(0, 14), Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < 44) }));
    conf(med.lw <= med.vw + 1, `Celular 375 px: pátio com filtros sem rolagem lateral (${med.lw}/${med.vw})`);
    conf(med.peq.length === 0, 'Celular 375 px: chips e botões do pátio com 44 px ou mais ' + JSON.stringify(med.peq));
    await page.screenshot({ path: SAIDA + 'c2-r7-lote5-inicio-375.png' });
  });
} finally { mock.parar(); }
fim();
