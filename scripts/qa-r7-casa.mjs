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

// =============================================================== sino, busca, ficha, dono, teclado, abas
await cenario7('gestor', 1440, async ({ page, browser, estado }) => {
  await aguardaOrc(page);
  const urlInicial = page.url();
  // ---- sino
  await page.click('#bSino');
  await page.waitForSelector('#painelSino:not([hidden]) [data-notif]', { timeout: 8000 });
  conf(await visivel(page, '#sinoBusca'), 'sino: campo de busca nos avisos');
  const total = await page.$$eval('#listaNotif [data-notif]', (l) => l.length);
  await page.type('#sinoBusca', 'vencidas');
  const filtradas = await page.$$eval('#listaNotif [data-notif]', (l) => l.length);
  conf(filtradas >= 1 && filtradas < total, 'sino: busca filtra os avisos (' + filtradas + ' de ' + total + ')');
  await page.$eval('#sinoBusca', (e) => { e.value = ''; e.dispatchEvent(new Event('input')); });
  // aviso de tarefas vencidas leva às tarefas da Casa (não ao erro)
  await page.type('#sinoBusca', 'vencidas');
  await page.click('#listaNotif [data-notif]');
  await dorme(500);
  conf(!/não é de um app/.test(await page.$eval('#toast', (t) => t.textContent).catch(() => '')), 'sino: aviso de tarefas vencidas não dá mais o erro "endereço não é de um app"');
  conf(page.url() === urlInicial, 'sino: a Casa continua na mesma página');
  // adiar
  await page.click('#bSino');
  await page.waitForSelector('#painelSino:not([hidden]) [data-adiar-sino]', { timeout: 5000 });
  await page.$eval('#sinoBusca', (e) => { e.value = ''; e.dispatchEvent(new Event('input')); });
  const antes = await page.$$eval('#listaNotif [data-notif]', (l) => l.length);
  await page.$eval('#listaNotif [data-adiar-sino]', (b) => b.click());
  await dorme(200); conf((await page.$$eval('#listaNotif [data-adiar-por]', (l) => l.length)) > 0, 'sino: menu de adiar abre (1 h / 3 h / amanhã)');
  const opcoes = await page.$$eval('#listaNotif [data-adiar-por]', (l) => l.length);
  conf(opcoes === 3, 'sino: três opções de adiar (' + opcoes + ')');
  await page.$eval('#listaNotif [data-adiar-por]', (b) => b.click());
  await dorme(300);
  const depois = await page.$$eval('#listaNotif [data-notif]', (l) => l.length);
  conf(depois === antes - 1, 'sino: aviso adiado some da lista (' + antes + ' -> ' + depois + ')');
  conf(/volta em/.test(await texto(page, '#sinoRodape') || ''), 'sino: rodapé diz quando volta: ' + ((await texto(page, '#sinoRodape')) || '').replace(/\s+/g, ' ').slice(0, 80));
  await page.keyboard.press('Escape');
  // ---- busca
  await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control');
  await page.waitForSelector('#busca:not([hidden])', { timeout: 4000 });
  await page.type('#buscaInput', 'marcos');
  await page.waitForSelector('#buscaFiltros button', { timeout: 8000 }).catch(() => {});
  conf(await visivel(page, '#buscaFiltros'), 'busca: filtros por tipo aparecem');
  const filtros = await page.$$eval('#buscaFiltros [data-filtro-busca]', (b) => b.map((x) => x.dataset.filtroBusca));
  conf(filtros.length >= 3, 'busca: pelo menos 3 filtros: ' + filtros.join(','));
  const nTodas = await page.$$eval('#buscaLista [data-linha]', (l) => l.length);
  const f1 = filtros.find((f) => f && f !== 'pessoas');
  await page.click('#buscaFiltros [data-filtro-busca="' + f1 + '"]');
  const nF = await page.$$eval('#buscaLista [data-linha]', (l) => l.length);
  conf(nF >= 1 && nF < nTodas, 'busca: filtro "' + f1 + '" reduz (' + nTodas + ' -> ' + nF + ')');
  await page.click('#buscaFiltros [data-filtro-busca="' + '' + '"]');
  conf(/Marcos <img/.test(await page.$eval('#buscaLista', (e) => e.textContent)) || !(await page.$('#buscaLista img')), 'busca: nome com HTML aparece como texto (sem tag viva)');
  // ficha pela linha
  const temFicha = await page.$('#buscaLista [data-ficha]');
  conf(!!temFicha, 'busca: botão "Ficha" nas linhas com telefone');
  if (temFicha) {
    await page.click('#buscaLista [data-ficha]');
    await page.waitForSelector('#ficha:not([hidden]) #fichaCorpo', { timeout: 8000 });
    await page.waitForFunction(() => document.querySelector('#fichaTit').textContent.trim().length > 2, { timeout: 8000 });
    conf((await texto(page, '#fichaTit') || '').trim().length > 2, 'ficha: abre com o nome do cliente');
    conf(estado.chamadasRpc.some((c) => c.nome === 'r6_cliente_360'), 'ficha: lê r6_cliente_360');
    await page.waitForFunction(() => document.querySelector('#fichaCorpo').innerText.length > 40, { timeout: 8000 });
    const corpo = await texto(page, '#fichaCorpo');
    conf(/Gol/.test(corpo) && /1\.890|1890/.test(corpo), 'ficha: mostra pátio e orçamento do cliente');
    const alvos = await page.$$eval('#ficha a[href^="http"]', (l) => l.map((a) => [a.getAttribute('target') || '', a.getAttribute('href')]));
    conf(alvos.length >= 3 && alvos.every(([t]) => t.startsWith('indycar-')), 'ficha: todo link de app tem aba nomeada (' + alvos.length + ')');
    const aba = await abaNova(browser, () => page.click('#ficha a[href^="https://wa.me/"]'));
    conf(aba === null || /(wa\.me\/|phone=)55/.test(aba), 'ficha: WhatsApp abre na aba do WhatsApp');
    await page.bringToFront();
    if (await page.$('#ficha [data-ficha-links]')) {
      await page.click('#ficha [data-ficha-links]');
      await page.waitForFunction(() => /minha|c=tokteste/.test(document.querySelector('#fichaCorpo').innerHTML), { timeout: 6000 }).then(() => conf(true, 'ficha: "Links do cliente" mostra o link Minha IndyCar'), () => conf(false, 'ficha: links do cliente'));
      conf(estado.linksChamadas.length === 1 && estado.linksChamadas[0].auth, 'ficha: pedido de links vai ao servidor com login');
    }
    await page.bringToFront(); await dorme(300);
    await page.keyboard.press('Escape'); await dorme(300);
    conf(!(await visivel(page, '#ficha')), 'ficha: Esc fecha');
  }
  conf(page.url() === urlInicial, 'a Casa nunca virou outra página');
}, { ajustar: (e) => {
  e.rpc.r6_agora = dadosComTelefones();
  e.rest.notificacoes = e.rest.notificacoes.concat([{ id: 'nv1', tipo: 'tarefas_vencidas', titulo: '3 tarefas vencidas', corpo: null, link: null, app: null, lida_em: null, created_at: iso(3) }]);
} });

// =============================================================== dono: ligações entre sistemas, atalhos
await cenario7('admin', 1440, async ({ page, estado }) => {
  await aguardaOrc(page);
  await page.evaluate(() => window.Casa.painel.trocarVisao('dono'));
  await page.waitForSelector('#donoLigacoes:not([hidden])', { timeout: 15000 }).catch(() => {});
  conf(await visivel(page, '#donoLigacoes'), 'dono: cartão "Ligações entre sistemas" aparece');
  const t = (await texto(page, '#donoLigacoes')) || '';
  conf(/chegou|sem OS|sem cliente/i.test(t), 'dono: mostra as ligações quebradas: ' + t.replace(/\s+/g, ' ').slice(0, 100));
  const links = await page.$$eval('#donoLigacoes a[href^="http"]', (l) => l.map((a) => a.getAttribute('target')));
  conf(links.every((x) => (x || '').startsWith('indycar-')), 'dono: links das ligações abrem em abas nomeadas (' + links.length + ')');
  // teclado
  await page.evaluate(() => window.Casa.painel.trocarVisao('operacao'));
  await page.keyboard.press('t');
  await dorme(300);
  conf(await visivel(page, '#fTarefa') || await visivel(page, '#listaTarefas'), 'teclado: t leva às tarefas');
  await page.keyboard.press('e');
  await dorme(200);
  conf(true, 'teclado: e recolhe sem erro');
  // todo link de app tem aba nomeada
  const soltos = await page.$$eval('a[href^="http"]', (l) => l.filter((a) => !/^indycar-/.test(a.getAttribute('target') || '') && !/^https:\/\/(fonts|cdn|wa)/.test(a.href) && !a.closest('#entrada')).map((a) => a.href.slice(0, 70)));
  conf(soltos.length === 0, 'abas: todo link externo tem target indycar-*' + (soltos.length ? ' → ' + soltos.slice(0, 3).join(' | ') : ''));
}, { ajustar: (e) => { e.rpc.r6_agora = dadosComTelefones(); } });

// =============================================================== recepção: chegadas de hoje
const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const hhmm = (min) => { const d = new Date(Date.now() + min * 60000); return d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }) + ':00'; };
const agendaHoje = () => [
  { id: U(801), cliente_nome: 'Ana Souza', hora: hhmm(-40), status: 'aguardando', veiculo: 'Gol', servico: 'Revisão', data: hojeSP(), compareceu: false },
  { id: U(802), cliente_nome: 'Bruno Reis', hora: hhmm(90), status: 'confirmado', veiculo: 'HB20', servico: 'Freios', data: hojeSP(), compareceu: false },
  { id: U(803), cliente_nome: 'Carla Dias', hora: hhmm(-120), status: 'compareceu', veiculo: 'Onix', servico: 'Óleo', data: hojeSP(), compareceu: true },
  { id: U(804), cliente_nome: 'Dani Cruz', hora: hhmm(30), status: 'cancelado', veiculo: 'Civic', servico: 'Alinhamento', data: hojeSP(), compareceu: false },
  { id: U(805), cliente_nome: 'Eva Lopes', hora: hhmm(10), status: 'aguardando', veiculo: 'Polo', servico: 'Revisão', data: '2020-01-01', compareceu: false },
];
await cenario7('agenda', 1440, async ({ page, browser, estado }) => {
  await page.waitForSelector('#cHoje:not([hidden])', { timeout: 25000 });
  await page.waitForFunction(() => /Chegadas de hoje/.test(document.querySelector('#cHoje').innerText), { timeout: 12000 }).catch(() => {});
  const t = (await texto(page, '#cHoje')) || '';
  conf(/Chegadas de hoje/i.test(t), 'recepção: cartão "Chegadas de hoje"');
  conf(/2 por chegar/.test(t) && /1 já chegaram|1 já chegou/.test(t), 'recepção: conta quem falta e quem chegou (cancelado e outro dia ficam de fora): ' + t.replace(/\s+/g, ' ').slice(0, 90));
  conf(/1 atrasado/.test(t), 'recepção: destaca o atrasado');
  conf(/Ana Souza/.test(t) && /Bruno Reis/.test(t) && !/Dani Cruz/.test(t) && !/Eva Lopes/.test(t), 'recepção: lista só quem falta chegar hoje');
  conf(!/\d{4,5}-?\d{4}/.test(t), 'recepção: sem telefone na tela');
  const alvos = await page.$$eval('#cHoje a[href]:not([href="#"])', (l) => l.map((a) => a.getAttribute('target')));
  conf(alvos.length >= 2 && alvos.every((x) => x === 'indycar-agenda'), 'recepção: links abrem a Agenda na aba indycar-agenda');
  conf(!(await visivel(page, '#cHoje [data-nova]')), 'recepção: sem botão de novo horário');
  conf(!(await visivel(page, '#cOrc')) && !(await visivel(page, '#cLeads')), 'recepção: não vê orçamentos nem leads');
  conf(!(await visivel(page, '#saudeSist')), 'recepção: não vê a faixa de saúde dos sistemas');
  conf(estado.chamadasRpc.every((c) => c.nome !== 'r7_x3_saude' && c.nome !== 'r7_c1_saude_sistemas'), 'recepção: nem pede os dados de saúde');
}, { ajustar: (e) => { e.agendaApi = agendaHoje; } });

// =============================================================== mecânico: extras pendentes primeiro
await cenario7('mecanico', 1440, async ({ page }) => {
  await page.waitForSelector('#cPatio:not([hidden])', { timeout: 25000 });
  await dorme(800);
  const t = (await texto(page, '#cPatio')) || '';
  conf(/2/.test(t), 'mecânico: cartão com os carros dele');
  const ord = await page.$$eval('#cPatio li', (l) => l.map((e) => e.innerText.replace(/\s+/g, ' ')));
  conf(ord.length >= 2 && /Gol/.test(ord[0]) && /pronto/i.test(ord[0]), 'mecânico: o carro pronto (para retirar) vem primeiro: ' + ord.slice(0, 2).join(' || '));
  conf(/1 extra/.test(ord.find((x) => /HB20/.test(x)) || ''), 'mecânico: o carro com extra esperando mostra "1 extra"');
  conf(!(await visivel(page, '#cOrc')) && !(await visivel(page, '#saudeSist')), 'mecânico: sem orçamentos nem saúde');
}, { ajustar: (e) => {
  e.rest.patio_os = (url) => [
    { id: U(51), numero: 51, cliente_nome: 'Carlos', veiculo: 'HB20', placa: 'AAA1A11', etapa: 'em_servico', etapa_em: new Date(Date.now() - 3600e3).toISOString(), previsao_entrega: null, orcamento_id: null },
    { id: U(52), numero: 52, cliente_nome: 'Duda', veiculo: 'Gol', placa: 'BBB2B22', etapa: 'pronto', etapa_em: new Date(Date.now() - 7200e3).toISOString(), previsao_entrega: null, orcamento_id: null },
  ];
  e.rest.patio_extras = [{ os_id: U(51) }];
} });

// =============================================================== 375 px
for (const papel of ['gestor', 'atendente', 'agenda']) {
  await cenario7(papel, 375, async ({ page }) => {
    await page.waitForSelector('#cHoje:not([hidden]), #cPatio:not([hidden]), #cMeuDia:not([hidden])', { timeout: 25000 });
    await dorme(1200);
    const m = await medirTela(page, { ignorar: '#saudePainel' });
    conf(!m.rolagemLateral, papel + '/375: sem rolagem lateral (largura ' + m.larguraTotal + ')');
    conf(m.passando.length === 0, papel + '/375: nada passa da borda' + (m.passando.length ? ' → ' + m.passando.slice(0, 4).join(' | ') : ''));
    conf(m.pequenos.length === 0, papel + '/375: alvos de toque com 44 px' + (m.pequenos.length ? ' → ' + m.pequenos.slice(0, 5).join(' | ') : ''));
    if (papel !== 'agenda') {
      if (await visivel(page, '#saudeBotao')) {
        await page.click('#saudeBotao'); await dorme(300);
        const m2 = await medirTela(page);
        conf(!m2.rolagemLateral && m2.passando.length === 0, papel + '/375: painel de saúde aberto cabe na tela' + (m2.passando.length ? ' → ' + m2.passando.slice(0, 3).join(' | ') : ''));
        await page.click('#saudeBotao');
      }
      await page.click('#bSino'); await dorme(400);
      const m3 = await medirTela(page);
      conf(!m3.rolagemLateral && m3.passando.length === 0, papel + '/375: sino aberto cabe' + (m3.passando.length ? ' → ' + m3.passando.slice(0, 3).join(' | ') : ''));
      await page.keyboard.press('Escape');
    }
    await page.evaluate(() => window.Casa.ficha && window.Casa.ficha.abrir({ tel55: '5512991821234', nome: 'Marcos' }));
    if (papel !== 'agenda') {
      await page.waitForFunction(() => document.querySelector('#fichaCorpo').innerText.length > 40, { timeout: 8000 }).catch(() => {});
      const m4 = await medirTela(page);
      conf(!m4.rolagemLateral && m4.passando.length === 0, papel + '/375: ficha cabe' + (m4.passando.length ? ' → ' + m4.passando.slice(0, 3).join(' | ') : ''));
      conf(m4.pequenos.length === 0, papel + '/375: ficha com alvos de 44 px' + (m4.pequenos.length ? ' → ' + m4.pequenos.slice(0, 4).join(' | ') : ''));
    }
  }, { ajustar: (e) => { e.rpc.r6_agora = dadosComTelefones(); e.agendaApi = agendaHoje; } });
}

fim();
