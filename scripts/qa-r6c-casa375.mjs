// QA da Casa em 375 px (C1c): TODAS as telas e janelas — sem rolagem lateral, nada passando da borda, alvos de toque >= 44 px.
//   node scripts/qa-r6c-casa375.mjs   (servidor local: PORT=3077 AUTOMACOES=0 node central.js; QA_BASE muda o endereço)
import { cenario, conf, fim, dorme, medirTela, texto, visivel, SAIDA } from './qa-r6c-lib.mjs';

const EXCECOES = '#toast';
async function conferirTela(page, nome, opts = {}) {
  const m = await medirTela(page, { ignorar: EXCECOES, ...opts });
  conf(!m.rolagemLateral && m.passando.length === 0, `375 px · ${nome}: sem rolagem lateral e nada passa da borda${m.rolagemLateral ? ' (largura ' + m.larguraTotal + ')' : ''}${m.passando.length ? ' → ' + m.passando.join(', ') : ''}`);
  conf(m.pequenos.length === 0, `375 px · ${nome}: alvos de toque com 44 px ou mais${m.pequenos.length ? ' → ' + m.pequenos.join(' | ') : ''}`);
  return m;
}

await cenario('gestor', 375, async ({ page }) => {
  await page.waitForSelector('#cPatio:not([hidden])', { timeout: 20000 });
  await dorme(800);
  await page.evaluate(() => window.Casa.painel.trocarVisao('operacao'));
  await conferirTela(page, 'Casa (operação)');
  await page.screenshot({ path: SAIDA + 'c1c-casa-375-operacao.png', fullPage: true });
  await page.evaluate(() => window.Casa.painel.trocarVisao('dono'));
  await page.waitForSelector('#donoTiles .tile', { timeout: 10000 }); await dorme(500);
  await conferirTela(page, 'visão do dono');
  await page.screenshot({ path: SAIDA + 'c1c-casa-375-dono.png', fullPage: true });
  await page.evaluate(() => window.Casa.painel.trocarVisao('operacao'));
  // sino
  await page.click('#bSino'); await page.waitForSelector('#listaNotif li', { timeout: 8000 });
  await conferirTela(page, 'sino aberto');
  await page.screenshot({ path: SAIDA + 'c1c-casa-375-sino.png' });
  await page.keyboard.press('Escape');
  // menu do perfil
  await page.click('#bPerfil'); await dorme(200);
  await conferirTela(page, 'menu do perfil');
  await page.keyboard.press('Escape');
  // busca com resultado
  await page.click('#bBusca'); await page.waitForSelector('#busca:not([hidden])');
  await conferirTela(page, 'busca vazia (recentes e atalhos)');
  await page.type('#buscaInput', 'marcos'); await page.waitForSelector('#buscaLista [data-linha]', { timeout: 8000 }); await dorme(400);
  await conferirTela(page, 'busca com resultados');
  await page.screenshot({ path: SAIDA + 'c1c-casa-375-busca.png' });
  await page.$eval('#buscaInput', (i) => { i.value = ''; });
  await page.type('#buscaInput', '>'); await dorme(400);
  await conferirTela(page, 'paleta de comandos');
  await page.keyboard.press('Escape'); await dorme(200);
  // no celular o botão de atalhos de teclado não existe (não há teclado): a janela abre pela tecla ? só no computador
  conf(!(await visivel(page, '#bAjuda')), '375 px · o botão de atalhos de teclado fica escondido no celular');
}, { ajustar: (e) => {} });

await cenario('atendente', 375, async ({ page }) => {
  await page.waitForSelector('#cConversas:not([hidden])', { timeout: 20000 }); await dorme(600);
  await page.waitForSelector('#listaTarefas .tarefa', { timeout: 10000 });
  await conferirTela(page, 'Casa do atendente (tarefas e Meu dia)');
  await page.evaluate(() => document.querySelector('[data-editar="t3"]').click());
  await page.waitForSelector('[data-edita="t3"]');
  await conferirTela(page, 'tarefa em edição');
  await page.screenshot({ path: SAIDA + 'c1c-casa-375-atendente.png', fullPage: true });
});

await cenario('mecanico', 375, async ({ page }) => {
  await page.waitForSelector('#cPatio:not([hidden])', { timeout: 20000 }); await dorme(500);
  await conferirTela(page, 'Casa do mecânico');
}, { apps: ['patio'] });

await cenario('agenda', 375, async ({ page }) => {
  await page.waitForSelector('#cHoje:not([hidden])', { timeout: 20000 }); await dorme(500);
  await conferirTela(page, 'Casa da recepção (papel agenda)');
}, { apps: ['agenda'] });

// pátio fora do ar: a faixa com o plano B também precisa caber
import { saudeFora } from './qa-r6c-lib.mjs';
await cenario('gestor', 375, async ({ page }) => {
  await page.waitForSelector('#avisoApps:not([hidden])', { timeout: 15000 });
  await conferirTela(page, 'faixa de app fora do ar');
}, { ajustar: (e) => { e.saude = saudeFora; } });

// telas de entrada (sem login)
import { abrirNavegador, BASE } from './qa-r6c-lib.mjs';
{
  const { browser, page } = await abrirNavegador({ largura: 375, altura: 800 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.waitForSelector('#lEmail', { visible: true, timeout: 30000 });
  await conferirTela(page, 'tela de login');
  await page.screenshot({ path: SAIDA + 'c1c-casa-375-login.png' });
  await page.click('#lEntrar'); await dorme(200);
  await conferirTela(page, 'login com erro');
  await browser.close();
}
fim();
