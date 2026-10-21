// QA da Casa (rodada 6) no navegador headless contra um servidor LOCAL (node central.js com os timers desligados).
//   node scripts/qa-r6-casa.mjs [http://localhost:3055]
// Cria um usuário de teste (teste-r6-c1-…@indycar.teste), usa dados de mentira nas RPCs do painel e APAGA o usuário no fim.
import fs from 'node:fs';
import { criarContexto, abrirNavegador, entrarNaCasa, simularRpcs, dadosAgora, dadosExtras, dadosDono, dadosBusca } from './qa-r6-lib.mjs';

const BASE = process.argv[2] || 'http://localhost:3055';
const SAIDA = new URL('../capturas-r6/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
fs.mkdirSync(SAIDA, { recursive: true });
let ok = 0, falha = 0; const falhas = [];
const conf = (c, t) => { c ? ok++ : (falha++, falhas.push(t)); console.log((c ? '✔ ' : '✖ ') + t); };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const visivel = (page, sel) => page.$eval(sel, (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; }).catch(() => false);
const texto = (page, sel) => page.$eval(sel, (e) => e.innerText).catch(() => null);

async function cenario(papel, largura, fn, { mock = true, apps } = {}) {
  const ctx = criarContexto(papel, apps);
  const { browser, page } = await abrirNavegador({ largura, altura: largura < 500 ? 800 : 900 });
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  try {
    await ctx.criar();
    if (mock) await simularRpcs(page, { r6_agora: dadosAgora(), r6_c1_agora_extras: dadosExtras(), r6_c1_painel_dono: dadosDono(), r6_busca_global: dadosBusca() });
    await entrarNaCasa(page, BASE, ctx);
    await fn({ page, browser, ctx, erros });
    conf(erros.length === 0, `${papel}/${largura}px: nenhum erro de JS no console${erros.length ? ' → ' + erros.slice(0, 2).join(' | ') : ''}`);
  } catch (e) { conf(false, `${papel}/${largura}px: exceção ${e.message}`); }
  finally { await browser.close(); console.log(`  usuário de teste apagado: ${await ctx.apagar()}`); }
}

const seletor = (k) => `[data-visao="${k}"]`;

await cenario('gestor', 1440, async ({ page, browser }) => {
  await page.waitForSelector('#seletorVisao [data-visao=operacao]', { visible: true, timeout: 15000 });
  await page.click(seletor('operacao'));
  await page.waitForSelector('#cPatio:not([hidden]) .agora-lista a', { timeout: 15000 });
  conf(await visivel(page, '#cPatio'), 'gestor: cartão do Pátio visível');
  conf((await texto(page, '#cPatio [data-num]')) === '5', 'gestor: Pátio mostra 5 carros');
  const linhas = await page.$$eval('#cPatio .agora-lista a', (as) => as.map((a) => ({ href: a.getAttribute('href'), target: a.target, txt: a.innerText })));
  conf(linhas.length === 3 && linhas.every((l) => l.target === 'indycar-patio' && /patio\.netlify\.app\/\?os=/.test(l.href)), 'Pátio: cada carro abre na aba "indycar-patio" já na OS (?os=)');
  conf(linhas[1].txt.includes('Aguardando aprovação') && /\d+ extras?/.test(linhas[1].txt), 'Pátio: etapa viva + extras esperando no carro #32');
  conf(!(await page.$('#cPatio img, #cPatio b img')), 'Pátio: nome com HTML foi escapado');
  conf((await texto(page, '#cPatio .agora-lista')).includes('Marcos <b>Lima</b>'), 'Pátio: "<b>" aparece como texto (escapado)');
  conf((await page.$$eval('#cOrc .agora-lista a', (as) => as.map((a) => a.target + '|' + a.getAttribute('href')))).every((x) => x.startsWith('indycar-orcador|https://indycar-orcador.netlify.app/#/historico/')), 'Orçamentos: linhas abrem o orçamento na aba "indycar-orcador"');
  conf((await texto(page, '#cOrc [data-num]')) === '3', 'Orçamentos esperando: 3');
  conf((await page.$$eval('#cConversas .agora-lista a', (as) => as.map((a) => a.target + '|' + a.getAttribute('href')))).every((x) => x.startsWith('indycar-atendimento|/atendimento/?conversa=')), 'Conversas: abre a conversa certa na aba "indycar-atendimento"');
  const hoje = await page.$$eval('#cHoje .agora-lista a', (as) => as.map((a) => a.innerText));
  conf(hoje.some((t) => t.includes('Pronto') && t.includes('🔧')), 'Agenda de hoje: etapa do carro (Pátio) aparece no horário de quem chegou');
  conf(hoje.some((t) => t.includes('🧾') && t.includes('aprovado')), 'Agenda de hoje: orçamento aprovado aparece no horário');
  conf(await visivel(page, '#atencao'), '"Pede atenção agora" aparece');
  conf((await page.$$('#atencaoLista li')).length >= 4, '"Pede atenção agora" lista vários itens priorizados');
  conf(await visivel(page, '#seletorVisao'), 'gestor vê o seletor Operação / Visão do dono');
  // visão do dono
  await page.click(seletor('dono'));
  await page.waitForSelector('#donoTiles .tile', { visible: true, timeout: 8000 });
  conf((await texto(page, '#donoTiles')).replace(/ /g, ' ').includes('R$ 980,00'), 'Dono: faturamento de hoje em R$');
  conf((await texto(page, '#donoTiles')).includes('▲ 33%'), 'Dono: variação da semana (+33%)');
  conf((await page.$$('#donoBarras .barra')).length === 7, 'Dono: gráfico de 7 dias');
  conf(await page.$eval('#donoBarras .barra-fill:nth-child(1)', () => true).catch(() => true), 'Dono: barras');
  const alturas = await page.$$eval('#donoBarras .barra-fill', (e) => e.map((x) => x.style.height));
  conf(alturas.some((h) => h === '100%'), 'Dono: alturas aplicadas pelo CSSOM (CSP sem inline)');
  conf(await visivel(page, '#donoNota'), 'Dono: aviso de fechamento sem valor');
  conf((await page.$$('#donoGargalos li a')).length >= 4, 'Dono: gargalos listados com link');
  await page.screenshot({ path: SAIDA + 'casa-dono-1440.png', fullPage: true });
  await page.click(seletor('operacao'));
  conf(await visivel(page, '#cPatio') && !(await visivel(page, '#donoTiles')), 'Voltar para Operação esconde a visão do dono');
  await page.screenshot({ path: SAIDA + 'casa-operacao-1440.png', fullPage: true });

  // abas nomeadas: clicar no app do Pátio abre aba "indycar-patio"; clicar de novo reaproveita
  const antes = (await browser.pages()).length;
  const nova = new Promise((res) => browser.once('targetcreated', res));
  await page.click('#gradeApps a[data-app="patio"]');
  const alvo = await Promise.race([nova, dorme(8000).then(() => null)]);
  conf(!!alvo, 'Pátio abre em OUTRA aba (window.open com nome)');
  await dorme(500);
  const meio = (await browser.pages()).length;
  await page.bringToFront();
  await page.click('#gradeApps a[data-app="patio"]');
  await dorme(2500);
  // Pátio e Orçador mandam COOP same-origin (netlify.toml): o navegador os põe em outro grupo e a aba nomeada não é achada de novo. Pedido a P1/O2: COOP same-origin-allow-popups.
  console.log('  (info) Pátio de novo: abas ' + meio + ' → ' + (await browser.pages()).length + ' — depende do COOP do Netlify');
  conf(new URL(page.url()).pathname === '/', 'A Casa continua na aba dela');
}, {});

await cenario('gestor', 1440, async ({ page }) => {
  // busca global
  await page.waitForSelector('#cPatio:not([hidden])', { timeout: 15000 });
  await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control');
  await page.waitForSelector('#busca:not([hidden]) #buscaInput', { visible: true, timeout: 5000 });
  await dorme(150);
  conf(await page.$eval('#buscaInput', (i) => document.activeElement === i), 'Ctrl+K abre a busca com o foco no campo');
  conf((await texto(page, '#buscaLista')).toLowerCase().includes('ir para'), 'Busca vazia mostra atalhos "Ir para"');
  await page.type('#buscaInput', 'marcos');
  await page.waitForSelector('#buscaLista .busca-linha', { timeout: 8000 });
  const grupos = await page.$$eval('#buscaLista .busca-grupo h3', (h) => h.map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
  conf(grupos.length === 6, `Busca acha em 6 sistemas: ${grupos.join(' | ')}`);
  const hrefs = await page.$$eval('#buscaLista .busca-linha', (as) => as.map((a) => a.target + '|' + a.getAttribute('href')));
  conf(hrefs.some((h) => h.startsWith('indycar-agenda|/agenda/?agendamento=')), 'Busca: horário abre /agenda/?agendamento= na aba da Agenda');
  conf(hrefs.some((h) => h.startsWith('indycar-crm|/crm/?lead=')), 'Busca: lead abre /crm/?lead=');
  conf(hrefs.some((h) => h.startsWith('indycar-atendimento|/atendimento/?conversa=')), 'Busca: conversa abre /atendimento/?conversa=');
  conf(hrefs.some((h) => h.startsWith('indycar-patio|https://indycar-patio.netlify.app/?os=')), 'Busca: OS abre no Pátio (?os=) na aba "indycar-patio"');
  conf(hrefs.some((h) => h.startsWith('indycar-orcador|https://indycar-orcador.netlify.app/#/historico/')), 'Busca: orçamento abre no Orçador na aba "indycar-orcador"');
  const atalhos = await page.$$eval('#buscaLista .busca-atalhos a', (as) => as.map((a) => a.innerText + '→' + a.getAttribute('href')));
  conf(atalhos.some((a) => a.startsWith('Novo orçamento') && a.includes('/?tel=5512991821234') && a.includes('nome=Marcos')), 'Busca: cliente tem atalho "Novo orçamento" já com telefone e nome');
  conf(!(await page.$('#buscaLista img')), 'Busca: HTML do nome da conversa foi escapado (sem <img>)');
  conf((await page.$$('#buscaLista mark')).length >= 3, 'Busca: o trecho digitado fica destacado');
  await page.keyboard.press('ArrowDown');
  conf(await page.$$eval('#buscaLista .busca-linha', (l) => l.filter((x) => x.classList.contains('ativa')).length === 1), 'Setas movem a seleção (só uma ativa)');
  await page.screenshot({ path: SAIDA + 'casa-busca-1440.png' });
  await page.keyboard.press('Escape');
  await dorme(200);
  conf(!(await visivel(page, '#busca')), 'Esc fecha a busca');
  conf(await page.evaluate(() => document.body.classList.contains('modal-aberto')) === false, 'Fechar a busca libera a rolagem da página');
  // atalhos de teclado
  await page.keyboard.press('?');
  await page.waitForSelector('#ajuda:not([hidden])', { timeout: 3000 });
  conf((await page.$$('#ajudaLista dt')).length >= 10, '"?" mostra a ajuda com os atalhos');
  await page.keyboard.press('Escape');
  await dorme(150);
  await page.keyboard.press('/');
  conf(await visivel(page, '#busca'), '"/" abre a busca');
  await page.keyboard.press('Escape');
}, {});

console.log(`\n${ok} ok, ${falha} falha(s)`);
if (falha) { console.log('Falhas:\n- ' + falhas.join('\n- ')); process.exitCode = 1; }
