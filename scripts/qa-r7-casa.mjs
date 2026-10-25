// QA da Casa (rodada 7, C1) no navegador de verdade (puppeteer-core + Chrome) contra a Central LOCAL (porta 3171, automações desligadas).
//   node scripts/qa-r7-casa.mjs        (QA_BASE muda o endereço)
// Usuário de teste criado e APAGADO no fim; RPCs, tabelas, wa.me e o servidor de links são simulados (nada é gravado no banco real).
import { cenario7, conf, dorme, visivel, texto, fim, medirTela, abaNova, estadoPadrao, U, RPC_SAUDE, dadosAgora, iso, BASE } from './qa-r7-lib.mjs';

const aguardaOrc = async (page) => { await page.waitForSelector('#cPatio:not([hidden])', { timeout: 25000 }); };
const dadosComTelefones = () => {
  const a = dadosAgora();
  // orçamento parado há 50 h da Paula (telefone que vai pedir PARAR) e o aprovado do Rui
  a.orcamentos.esperando[0].telefone_55 = '5512988887777';
  a.orcamentos.esperando[1].telefone_55 = '5512977776666'; a.orcamentos.esperando[1].enviado_em = iso(600);
  return a;
};

// =============================================================== gestor 1440: saúde, PARAR, tarefas, sino, busca/ficha, dono, teclado, abas
await cenario7('gestor', 1440, async ({ page, browser, estado }) => {
  await aguardaOrc(page);
  await page.evaluate(() => window.Casa.painel.trocarVisao('operacao'));

  /* ---------- saúde dos sistemas ---------- */
  await page.waitForSelector('#saudeSist:not([hidden])', { timeout: 15000 });
  conf(/WhatsApp com problema/.test(await texto(page, '#saudeTxt') || ''), 'saúde: a faixa diz "WhatsApp com problema" (código real do monitor): ' + (await texto(page, '#saudeTxt')));
  conf((await page.$eval('#saudeSist', (e) => e.dataset.tom)) === 'ruim', 'saúde: faixa em tom de problema');
  conf(!(await visivel(page, '#saudePainel')), 'saúde: o detalhe começa fechado');
  conf((await page.$eval('.topo-marca', (e) => e.dataset.saude)) === 'ruim', 'saúde: o logo do topo ganha ponto de alerta');
  await page.click('#saudeBotao');
  conf(await visivel(page, '#saudePainel'), 'saúde: clicar abre o detalhe');
  const sistemas = await page.$$eval('#saudeLista .saude-item', (l) => l.map((e) => e.dataset.sistema));
  conf(['whatsapp', 'patio', 'orcador', 'comunicar', 'movere'].every((k) => sistemas.includes(k)), 'saúde: lista os 5 sistemas principais: ' + sistemas.join(','));
  conf(/seu WhatsApp/.test(await texto(page, '[data-sistema="whatsapp"] .saude-plano') || ''), 'saúde: o WhatsApp traz o "enquanto isso" (usar o próprio WhatsApp)');
  conf(/Ainda sem acesso real ao Movere/.test(await texto(page, '[data-sistema="movere"]') || ''), 'saúde: Movere sem acesso real aparece como neutro, não como erro');
  conf((await page.$eval('[data-sistema="movere"]', (e) => e.className)).includes('tom-neutro'), 'saúde: Movere em tom neutro');
  const abrir = await page.$eval('[data-sistema="comunicar"] .saude-abrir', (a) => [a.getAttribute('target'), a.getAttribute('href')]);
  conf(abrir[0] === 'indycar-comunicar', 'saúde: "Abrir Comunicar" vai para a aba indycar-comunicar');
  conf(estado.chamadasRpc.some((c) => c.nome === 'r7_x3_saude'), 'saúde: o gestor também lê as rotinas do banco (r7_x3_saude)');
  await page.keyboard.press('h');
  conf(!(await visivel(page, '#saudePainel')), 'tecla h fecha o detalhe');
  await page.keyboard.press('h');
  conf(await visivel(page, '#saudePainel'), 'tecla h abre o detalhe');
  await page.keyboard.press('h');
  // problema novo e recuperação avisam
  estado.rpc.r7_c1_saude_sistemas = RPC_SAUDE({ whatsapp: { estado: 'ok' }, vigia: [] });
  await page.evaluate(() => window.Casa.saude.atualizar());
  await page.waitForFunction(() => /Todos os sistemas em ordem|Movere|pedem/.test(document.querySelector('#saudeTxt').textContent), { timeout: 8000 });
  conf(/Todos os sistemas em ordem/.test(await texto(page, '#saudeTxt') || ''), 'saúde: quando o monitor limpa, a faixa diz "Todos os sistemas em ordem"');
  estado.rpc.r7_c1_saude_sistemas = RPC_SAUDE({ whatsapp: { estado: 'chave_recusada', desde: iso(30) } });
  await page.evaluate(() => window.Casa.saude.atualizar());
  await page.waitForFunction(() => /WhatsApp com problema/.test(document.querySelector('#saudeTxt').textContent), { timeout: 8000 });
  conf(/chave recusada/.test(await texto(page, '[data-sistema="whatsapp"]') || ''), 'saúde: estado chave_recusada do banco aparece com o motivo');
  await page.keyboard.press('h');
  await page.keyboard.press('h');
  await page.screenshot({ path: new URL('../capturas-r7/saude.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') }).catch(() => {});
}, { ajustar: (e) => { e.rpc.r6_agora = dadosComTelefones(); } });

// =============================================================== PARAR: botões de WhatsApp
await cenario7('gestor', 1440, async ({ page, browser, estado }) => {
  await aguardaOrc(page);
  await page.evaluate(() => window.Casa.painel.trocarVisao('operacao'));
  await page.waitForSelector('.wa-parar', { timeout: 15000 }).catch(() => {});
  const rpcsParar = () => estado.chamadasRpc.filter((c) => c.nome === 'r7_c1_parar');
  conf((await page.$$eval('.wa-parar', (l) => l.length)) >= 1, 'PARAR: quem pediu para parar tem o botão trocado por aviso');
  const txt = await page.$eval('.wa-parar', (e) => e.innerText).catch(() => '');
  conf(/Pediu para parar/.test(txt), 'PARAR: o aviso diz "Pediu para parar": ' + JSON.stringify(txt));
  conf((await page.$eval('.wa-parar', (e) => e.tagName).catch(() => '')) === 'SPAN', 'PARAR: o aviso não é link');
  conf((await page.$eval('.wa-parar .wa-parar-ver', (a) => a.getAttribute('target')).catch(() => '')) === 'indycar-comunicar', 'PARAR: "Comunicar" abre a aba indycar-comunicar');
  const livres = await page.$$eval('a.wa-mini[href^="https://wa.me/"]', (l) => l.length);
  conf(livres >= 1, 'PARAR: quem não pediu continua com o botão (' + livres + ')');
  conf(rpcsParar().length >= 1 && rpcsParar().length <= 3, 'PARAR: telefones perguntados em lote (' + rpcsParar().length + ' chamadas)');
  const corpo = JSON.parse(rpcsParar()[0].corpo);
  conf(Array.isArray(corpo.p_telefones) && corpo.p_telefones.every((t) => /^\d{10,11}$/.test(t)) && new Set(corpo.p_telefones).size === corpo.p_telefones.length, 'PARAR: só DDD+número, sem repetir: ' + corpo.p_telefones.join(','));
  const antes = rpcsParar().length;
  await page.evaluate(() => window.Casa.painel.redesenhar && window.Casa.painel.redesenhar());
  await dorme(600);
  conf(rpcsParar().length === antes, 'PARAR: redesenhar não pergunta de novo (cache)');
  const urlBloq = await abaNova(browser, () => page.click('.wa-parar'), 1500);
  conf(urlBloq === null, 'PARAR: clicar no aviso não abre aba');
  const urlLivre = await abaNova(browser, () => page.click('a.wa-mini[href^="https://wa.me/"]'));
  conf(!!urlLivre && /(wa\.me\/|phone=)55/.test(urlLivre), 'PARAR: clicar no livre abre o WhatsApp: ' + urlLivre);
  await page.bringToFront();
}, { ajustar: (e) => { e.rpc.r6_agora = dadosComTelefones(); e.rpc.r7_c1_parar = (req) => { const t = (JSON.parse(req.postData() || '{}').p_telefones) || []; return Object.fromEntries(t.filter((x) => x === '12988887777').map((x) => [x, 'optout'])); }; } });

// =============================================================== tarefas do Orçador
await cenario7('gestor', 1440, async ({ page, browser, estado }) => {
  await aguardaOrc(page);
  await page.waitForSelector('#listaTarefas .tarefa', { timeout: 15000 });
  await page.waitForSelector('#listaTarefas .pil-orc', { timeout: 10000 }).catch(() => {});
  const itens = await page.$$eval('#listaTarefas .tarefa', (l) => l.map((e) => ({ id: e.dataset.tid, origem: e.dataset.origem, ico: e.querySelector('.t-ico')?.textContent, selo: e.querySelector('.pil-orc')?.textContent || '', tit: e.querySelector('.t-texto')?.textContent })));
  const rea = itens.find((i) => /Reabordar Marcos/.test(i.tit));
  conf(!!rea && rea.selo === 'Reabordar', 'tarefas: reabordar do Orçador tem o selo "Reabordar": ' + JSON.stringify(rea));
  conf(!!itens.find((i) => /Acompanhar orçamento/.test(i.tit) && i.selo === 'Acompanhar'), 'tarefas: acompanhar tem o selo');
  conf(itens.every((i) => !!i.ico), 'tarefas: toda tarefa tem ícone de origem');
  conf(new Set(itens.map((i) => i.ico)).size >= 2, 'tarefas: origens diferentes têm ícones diferentes');
  const abrirOrc = await page.$eval('[data-tid="' + U(101) + '"] .t-abrir', (a) => [a.getAttribute('target'), a.getAttribute('href')]).catch(() => []);
  conf(abrirOrc[0] === 'indycar-orcador' && (abrirOrc[1] || '').endsWith('/historico/' + U(12)), 'tarefas: "abrir orçamento" leva ao orçamento na aba indycar-orcador: ' + abrirOrc.join(' | '));
  const desc = (await texto(page, '[data-tid="' + U(101) + '"] .t-desc')) || '';
  conf(/Recusou por preço/.test(desc) && !/https?:/.test(desc), 'tarefas: descrição sem o endereço solto');
  const wa = await page.$eval('[data-tid="' + U(101) + '"] .wa-tarefa', (a) => decodeURIComponent(a.getAttribute('href'))).catch(() => '');
  conf(/wa\.me\/5512991821234\?text=/.test(wa) && !/ve[ií]culo/i.test(wa), 'tarefas: botão Reabordar abre o WhatsApp do cliente sem "veículo"');
  conf((await page.$$eval('[data-tid="' + U(103) + '"] .wa-tarefa', (l) => l.length)) === 0, 'tarefas: tarefa de outra origem não oferece WhatsApp');
  const chips = await page.$$eval('#tFiltros button', (b) => b.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  conf(chips.some((c) => /Do Orçador/.test(c)), 'tarefas: filtro "Do Orçador": ' + chips.join(' | '));
  await page.click('#tFiltros [data-filtro-t="orcador"]');
  const so = await page.$$eval('#listaTarefas .tarefa', (l) => l.map((e) => e.dataset.origem));
  conf(so.length >= 2 && so.every((o) => o === 'orcador'), 'tarefas: o filtro mostra só as do Orçador');
  await page.click('[data-tid="' + U(102) + '"] [data-adiar-mais]');
  await dorme(400);
  conf(estado.escritas.some((w) => w.tabela === 'tarefas' && w.metodo === 'PATCH' && /vence_em/.test(w.corpo || '')), 'tarefas: "+3 dias" grava o novo prazo');
  const aba = await abaNova(browser, () => page.click('[data-tid="' + U(101) + '"] .wa-tarefa'));
  conf(!!aba && /(wa\.me\/|phone=)5512991821234/.test(aba), 'tarefas: o botão abre o WhatsApp');
  await page.bringToFront();
  await page.waitForFunction(() => /Concluir a tarefa/.test(document.querySelector('#toast')?.textContent || ''), { timeout: 4000 }).then(() => conf(true, 'tarefas: oferta "Concluir a tarefa" depois do WhatsApp'), () => conf(false, 'tarefas: oferta de concluir'));
}, { ajustar: (e) => { e.rpc.r6_agora = dadosComTelefones(); } });

fim();
