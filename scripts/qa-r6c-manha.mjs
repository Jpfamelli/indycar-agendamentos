// QA da Casa (C1c): "Bom dia" (ontem/amanhã) e botões de WhatsApp com recado pronto nas linhas.
//   node scripts/qa-r6c-manha.mjs   (servidor local: PORT=3077 AUTOMACOES=0 node central.js)
import { cenario, conf, fim, dorme, medirTela, texto, visivel, iso, SAIDA } from './qa-r6c-lib.mjs';

const ajustarDados = (e) => {
  const a = e.rpc.r6_agora;
  a.orcamentos.aprovados_sem_horario_total = 1;
  a.orcamentos.aprovados_sem_horario = [{ id: '44444444-4444-4444-8444-444444444499', numero: 20, cliente: 'Caio Prado', telefone_55: '5512977776666', total: 900, decidido_em: iso(300) }];
  a.orcamentos.esperando[0].telefone_55 = '5512911112222';   // Paula, 50 h
  a.orcamentos.esperando[1].telefone_55 = '5512933334444';   // Rui, 1h30 (ainda cedo para cobrar)
  a.agendamentos_hoje.itens[1].telefone_55 = '5512966665555'; // Beatriz, aguardando sem confirmar
  a.agendamentos_hoje.itens[0].telefone_55 = '5512900001111'; // Marcos, já chegou
};
const hrefs = (page, sel) => page.$$eval(sel, (as) => as.map((a) => ({ href: a.getAttribute('href'), alvo: a.getAttribute('target'), t: a.textContent.trim(), aria: a.getAttribute('aria-label') })));

await cenario('gestor', 1280, async ({ page, estado }) => {
  await page.waitForSelector('#manha:not([hidden])', { timeout: 20000 });
  conf(/^(Bom dia|Boa tarde|Boa noite)/i.test(await texto(page, '#manhaTitulo')), 'Bom dia: saudação certa para a hora');
  conf(/Ontem: 6 de 8 vieram · 4 fecharam \(R\$.*5\.400.*\) · 1 não veio\./.test(await texto(page, '#manhaOntem')), 'Bom dia (dono): ontem com quantos vieram, fecharam e o valor');
  conf(/Amanhã: 3 horários, o primeiro às 08:00 · 2 sem confirmar\./.test(await texto(page, '#manhaAmanha')), 'Bom dia: amanhã com total, primeiro horário e sem confirmar');
  const pend = await page.$$eval('#manhaPend li', (l) => l.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  conf(pend.length === 5, `Bom dia: 5 pendências (${pend.length})`);
  conf(/horário de ontem sem baixa/.test(pend[0]), 'Bom dia: a mais grave (sem baixa) vem primeiro');
  const links = await hrefs(page, '#manhaPend a');
  conf(links.length === 5 && links.every((l) => /^indycar-(agenda|patio)$/.test(l.alvo)), 'Bom dia: cada pendência abre o app certo em aba nomeada');
  // lembrar quem não confirmou
  const wa = await hrefs(page, '#manhaLembrar a.wa-mini');
  conf(wa.length === 1 && (await page.$$('#manhaLembrar .wa-sem')).length === 1, `Bom dia: 1 botão de WhatsApp e 1 aviso de sem telefone (${wa.length})`);
  conf(wa[0] && wa[0].href.startsWith('https://wa.me/5512933332222?text=') && wa[0].alvo === 'indycar-whatsapp', 'Bom dia: WhatsApp do cliente certo, em aba nomeada');
  const msg = decodeURIComponent(wa[0].href.split('text=')[1]);
  conf(/^Oi Img! Passando para lembrar do seu horário amanhã às 10:30 na IndyCar \(Revisão\)/.test(msg), 'Bom dia: recado pronto cita o dia e o serviço (' + msg.slice(0, 60) + ')');
  conf(await page.$eval('#manhaLembrar .wa-sem', (e) => /sem telefone/.test(e.textContent)).catch(() => false), 'Bom dia: horário sem telefone mostra "sem telefone" em vez de botão quebrado');
  conf(await page.evaluate(() => window.__xss === undefined), 'Bom dia: nome com HTML não executa nada');
  // ontem sem baixa
  const baixaWa = await hrefs(page, '#manhaBaixa a.wa-mini');
  conf(baixaWa.length === 1 && baixaWa[0].href.includes('5512955554444') && /Ontem você tinha um horário/.test(decodeURIComponent(baixaWa[0].href)), '🔗 Ontem sem baixa: WhatsApp neutro ("deu tudo certo?") para o cliente certo');
  const baixaAg = await hrefs(page, '#manhaBaixa a.linha');
  conf(baixaAg.length === 1 && /agendamento=a0000000-0000-4000-8000-000000000001/.test(baixaAg[0].href) && baixaAg[0].alvo === 'indycar-agenda', '🔗 Ontem sem baixa: abre o horário na Agenda (aba nomeada) para marcar o desfecho');
  // linhas do Agora
  await page.waitForSelector('#cPatio .wa-mini', { timeout: 10000 });
  const pat = await hrefs(page, '#cPatio .wa-mini');
  conf(pat.length === 1 && /Avisar/.test(pat[0].t) && pat[0].href.startsWith('https://wa.me/5512991821234?text='), 'Pátio: só o carro pronto tem "Avisar" no WhatsApp');
  conf(/Gol 1\.0 ABC1D23 está pronto/.test(decodeURIComponent(pat[0].href)), 'Pátio: recado cita o carro e a placa');
  const orc = await hrefs(page, '#cOrc .wa-mini');
  conf(orc.some((o) => /Cobrar/.test(o.t) && o.href.includes('5512911112222')), 'Orçamentos: orçamento parado há 50 h tem "Cobrar"');
  conf(!orc.some((o) => o.href.includes('5512933334444')), 'Orçamentos: o de 1h30 ainda não pede cobrança');
  conf(orc.some((o) => /Chamar/.test(o.t) && o.href.includes('5512977776666')), 'Orçamentos: aprovado sem horário tem "Chamar"');
  const marcar = await hrefs(page, '#cOrc .wa-agenda');
  conf(marcar.length === 1 && /tel=5512977776666/.test(marcar[0].href) && marcar[0].alvo === 'indycar-agenda', '🔗 Orçador→Agenda: "Marcar" abre a Agenda já com o telefone');
  const hoje = await hrefs(page, '#cHoje .wa-mini:not(.wa-orcar)');
  conf(hoje.length === 1 && hoje[0].href.includes('5512966665555') && /Lembrar/.test(hoje[0].t), 'Hoje: só quem não confirmou tem "Lembrar"');
  const orcar = await hrefs(page, '#cHoje .wa-orcar');
  conf(orcar.length === 1 && /tel=5512900001111/.test(orcar[0].href) && /nome=Marcos/.test(orcar[0].href) && orcar[0].alvo === 'indycar-orcador', '🔗 Hoje: quem já chegou e não tem orçamento ganha "Orçar" (Orçador com telefone e nome)');
  await page.screenshot({ path: SAIDA + 'c1c-manha-1280.png', fullPage: true });
  // dispensar
  await page.click('#manhaFechar'); await dorme(200);
  conf(!(await visivel(page, '#manha')), 'Bom dia: "dispensar por hoje" esconde a faixa');
  const gravou = await page.evaluate(() => Object.keys(localStorage).some((k) => /^indycar_manha_/.test(k)));
  conf(gravou, 'Bom dia: a dispensa fica guardada só por hoje (chave com a data)');
}, { ajustar: ajustarDados });

await cenario('gestor', 375, async ({ page }) => {
  await page.waitForSelector('#manha:not([hidden])', { timeout: 20000 }); await dorme(900);
  const m = await medirTela(page, { ignorar: '#toast' });
  conf(!m.rolagemLateral && m.passando.length === 0, `375 px · Bom dia e botões: sem rolagem lateral${m.passando.length ? ' → ' + m.passando.join(', ') : ''}`);
  conf(m.pequenos.length === 0, `375 px · Bom dia e botões: alvos de 44 px${m.pequenos.length ? ' → ' + m.pequenos.join(' | ') : ''}`);
  await page.screenshot({ path: SAIDA + 'c1c-manha-375.png', fullPage: true });
}, { ajustar: ajustarDados });

await cenario('agenda', 1280, async ({ page }) => {
  await page.waitForSelector('#manha:not([hidden])', { timeout: 20000 });
  const ontem = await texto(page, '#manhaOntem');
  conf(/Ontem: 6 de 8 vieram · 4 fecharam · 1 não veio\./.test(ontem) && !/R\$/.test(ontem), 'Recepção: vê o Bom dia, mas sem valor em dinheiro');
  conf((await page.$$('#manhaLembrar a.wa-mini')).length === 1, 'Recepção: lembra quem não confirmou pelo WhatsApp');
}, { apps: ['agenda'], ajustar: (e) => { e.rpc.r6_c1c_manha.ontem.valor = null; } });

await cenario('mecanico', 1280, async ({ page }) => {
  await page.waitForSelector('#cPatio:not([hidden])', { timeout: 20000 }); await dorme(600);
  conf(!(await visivel(page, '#manha')), 'Mecânico: não vê o Bom dia da agenda');
}, { apps: ['patio'] });

await cenario('gestor', 1280, async ({ page }) => {
  await dorme(2500);
  conf(!(await visivel(page, '#manha')), 'Bom dia: dia sem horário e sem pendência não mostra faixa');
}, { ajustar: (e) => { e.rpc.r6_c1c_manha = { hoje: e.rpc.r6_c1c_manha.hoje, ontem: { total: 0 }, amanha: { total: 0 }, patio: {} }; } });

fim();
