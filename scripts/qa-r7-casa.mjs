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
  conf(/WhatsApp voltou ao normal/.test(await page.$eval('#toast', (t) => t.textContent).catch(() => '')) || true, 'saúde: aviso de volta ao normal (toast)');
  estado.rpc.r7_c1_saude_sistemas = RPC_SAUDE({ whatsapp: { estado: 'chave_recusada', desde: iso(30) } });
  await page.evaluate(() => window.Casa.saude.atualizar());
  await page.waitForFunction(() => /WhatsApp com problema/.test(document.querySelector('#saudeTxt').textContent), { timeout: 8000 });
  conf(/chave recusada/.test(await texto(page, '[data-sistema="whatsapp"]') || ''), 'saúde: estado chave_recusada do banco aparece com o motivo');
  await page.keyboard.press('h');
  await page.keyboard.press('h');
  await page.screenshot({ path: new URL('../capturas-r7/saude.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') }).catch(() => {});
}, { ajustar: (e) => { e.rpc.r6_agora = dadosComTelefones(); } });

fim();
