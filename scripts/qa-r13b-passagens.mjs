// Rodada 13B da Agenda: as passagens entre apps de ponta a ponta, no servidor de MENTIRA.
//   node scripts/qa-r13b-passagens.mjs
// ENTRADA: os links que a Casa, o Atendimento, o CRM e o aviso de atraso usam para abrir a Agenda
//   (?novo=1&tel=55…, ?tel=, ?agendamento=) abrem o lugar certo, com o cliente certo, e o telefone sai da barra.
// SAÍDA: cada botão que leva a outro app aponta para o app certo, com o cliente/carro certo, e abre na aba
//   NOMEADA daquele app (indycar-<app>), a mesma que a Casa usa: clicar de novo volta para ela, sem login novo.
// Nada sai do navegador: window.open é trocado por um gravador.
import fs from 'node:fs';
import { iniciarMock, abrirNavegador, dorme, conf, fim } from './qa-r7c2-lib.mjs';

const SAIDA = new URL('../qa-out/r13/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
fs.mkdirSync(SAIDA, { recursive: true });
const PORTA = Number(process.env.QA_PORTA || 3476);
const mock = iniciarMock(PORTA);
await dorme(1500);
const relato = [];
const anota = (ok, txt) => { conf(ok, txt); relato.push((ok ? 'ok   ' : 'FALHA') + ' ' + txt); };

async function abrir(url) {
  const { browser, page } = await abrirNavegador({ largura: 1440, altura: 900 });
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_FAILED/.test(m.text())) erros.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.evaluateOnNewDocument(() => {
    window.__abertos = [];
    window.open = (u, n) => { window.__abertos.push([String(u), n]); return { focus() {}, opener: null }; };
  });
  await page.goto(mock.base + url, { waitUntil: 'networkidle2' });
  await dorme(2200);
  return { browser, page, erros };
}
const modal = (page) => page.evaluate(() => {
  const m = document.querySelector('#modalOverlay.open #modal');
  if (!m) return null;
  const v = (id) => document.getElementById(id)?.value || '';
  return { titulo: m.querySelector('h3')?.textContent.trim(), nome: v('f_nome'), tel: v('f_tel'), veic: v('f_veic'), placa: v('f_placa'), barra: location.href };
});

try {
  // ---------------- ENTRADA ----------------
  {
    const { browser, page, erros } = await abrir('/?novo=1&tel=5512991110002&nome=Carlos');
    const m = await modal(page);
    anota(!!m && /Novo/i.test(m.titulo || ''), `Casa/Atendimento "Agendar" (?novo=1&tel=55…) abre o Novo agendamento: ${m && m.titulo}`);
    anota(!!m && /99111-0002/.test(m.tel) && m.nome === 'Carlos Eduardo Nogueira', `… com o cliente da ficha (nome "${m && m.nome}", tel "${m && m.tel}")`);
    anota(!!m && m.veic === 'Corolla' && m.placa === 'GFK3H26', `… e o carro dele (${m && m.veic} ${m && m.placa})`);
    anota(!!m && !/tel=|nome=/.test(m.barra), `… e o telefone sai da barra de endereço (${m && m.barra.replace(mock.base, '')})`);
    anota(!erros.length, `sem erro de console (${erros.slice(0, 2).join(' | ')})`);
    await page.screenshot({ path: SAIDA + 'b-entrada-novo-1440.png' });
    await browser.close();
  }
  {
    const { browser, page } = await abrir('/?tel=12991110001');
    const m = await modal(page);
    anota(!!m && m.nome === 'Maria Aparecida' && /Editar|agendamento/i.test(m.titulo || ''), `CRM/Comunicar (?tel=) abre o horário marcado da pessoa: "${m && m.titulo}" de ${m && m.nome}`);
    await browser.close();
  }
  {
    const { browser, page } = await abrir('/');
    const id = await page.evaluate(async () => (await (await fetch('/api/dashboard')).json()).agendaHoje.find((a) => a.cliente_nome === 'Donizetti').id);
    await browser.close();
    const b2 = await abrir('/?agendamento=' + id);
    const m = await modal(b2.page);
    anota(!!m && m.nome === 'Donizetti', `aviso de atraso da Casa (?agendamento=<id>) abre o horário certo: ${m && m.nome}`);
    await b2.browser.close();
  }

  // ---------------- SAÍDA ----------------
  {
    const { browser, page, erros } = await abrir('/');
    const app = (h) => page.evaluate((x) => IndyCarApps.appDoLink(x), h);
    // Hoje: conversa no Atendimento (Maria)
    const conv = await page.$eval('.appt[data-nome="Maria Aparecida"] a.act[href*="tel="]', (a) => a.href).catch(() => null);
    anota(!!conv && (await app(conv)) === 'atendimento' && /tel=12991110001/.test(conv), `Hoje › conversa: ${conv}`);
    // o clique vai para a aba nomeada do Atendimento
    await page.click('.appt[data-nome="Maria Aparecida"] a.act[href*="tel="]');
    await dorme(300);
    let ab = await page.evaluate(() => window.__abertos.slice(-1)[0]);
    anota(!!ab && ab[1] === 'indycar-atendimento', `… e abre na aba nomeada "${ab && ab[1]}"`);
    // Quadro: Orçar (quem já chegou e não tem orçamento) e Pátio
    await page.evaluate(() => route('quadro')); await dorme(3000);
    const orcar = await page.$$eval('#qdCorpo a.qd-orcar', (l) => l.map((a) => a.href));
    const o = orcar.find((h) => /Patr%C3%ADcia|Patricia/.test(h)) || orcar[0];
    const uo = o ? new URL(o) : null;
    anota(!!o && (await app(o)) === 'orcador', `Quadro › Orçar leva ao Orçador: ${o}`);
    anota(!!uo && uo.searchParams.get('nome') && uo.searchParams.get('carro'), `… com nome e carro (${uo && uo.searchParams.get('nome')}, ${uo && uo.searchParams.get('carro')})`);
    const patio = await page.$$eval('#qdCorpo a[href*="os="], #qdCorpo a.selo-patio', (l) => l.map((a) => a.href));
    anota(patio.length > 0 && (await app(patio[0])) === 'patio', `Quadro › selo do Pátio abre a OS: ${patio[0]}`);
    // Ficha do cliente (contexto): CRM e Comunicar
    await page.evaluate(() => route('clientes')); await dorme(1500);
    await page.evaluate(() => document.querySelector('#cliBody tr[data-id] [data-act="edit"]')?.click()); await dorme(2500);
    const fichaLinks = await page.$$eval('#modal a[href]', (l) => l.map((a) => a.href).filter((h) => !/^tel:|wa\.me/.test(h)));
    const apps = [];
    for (const h of fichaLinks) apps.push(await app(h));
    relato.push('     ficha do cliente leva a: ' + [...new Set(apps.filter(Boolean))].join(', '));
    anota(fichaLinks.every((h, i) => apps[i]), `ficha: todo link sai para um app do ecossistema (${fichaLinks.length} links)`);
    await page.screenshot({ path: SAIDA + 'b-ficha-links-1440.png' });
    anota(!erros.length, `sem erro de console nas saídas (${erros.slice(0, 2).join(' | ')})`);
    await browser.close();
  }
  // Desfazer ao apagar (gestor): some na hora, "Desfazer" traz de volta e nada vai ao servidor
  {
    const { browser, page } = await abrir('/');
    await page.evaluate(() => route('clientes')); await dorme(1500);
    const id = await page.$eval('#cliBody tr[data-id]', (tr) => tr.dataset.id);
    await page.evaluate((i) => document.querySelector(`#cliBody tr[data-id="${i}"] [data-act="del"]`).click(), id); await dorme(400);
    const sumiu = await page.evaluate((i) => document.querySelector(`#cliBody tr[data-id="${i}"]`).hidden, id);
    const recado = await page.evaluate(() => document.querySelector('#toast')?.innerText || '');
    anota(sumiu && /Desfazer/.test(recado), `Clientes › Excluir: a linha some e o recado traz Desfazer ("${recado.replace(/\s+/g, ' ')}")`);
    await page.evaluate(() => document.querySelector('#toast .toast-acao').click()); await dorme(9000);
    const volta = await page.evaluate((i) => !document.querySelector(`#cliBody tr[data-id="${i}"]`).hidden, id);
    const noServidor = await page.evaluate(async (i) => (await (await fetch('/api/clientes')).json()).some((c) => c.id === i), id);
    anota(volta && noServidor, 'Desfazer: a linha volta e, 9 s depois, o cliente continua no servidor');
    // sem desfazer: apaga de verdade depois dos 8 s
    await page.evaluate((i) => document.querySelector(`#cliBody tr[data-id="${i}"] [data-act="del"]`).click(), id); await dorme(9500);
    const foi = await page.evaluate(async (i) => !(await (await fetch('/api/clientes')).json()).some((c) => c.id === i), id);
    anota(foi, 'sem Desfazer: depois de 8 s o cliente sai do servidor');
    await browser.close();
  }
  // Chegou → Pátio (entrada pronta)
  {
    const { browser, page } = await abrir('/?papel=agenda');
    const antes = await page.evaluate(() => window.__abertos.length);
    await page.evaluate(() => { const b = document.querySelector('.appt[data-nome="Maria Aparecida"] [data-marca="compareceu"]'); b && b.click(); });
    await dorme(2500);
    const toast = await page.evaluate(() => document.querySelector('#toast')?.innerText || '');
    relato.push('     recado do Chegou: ' + toast.replace(/\s+/g, ' '));
    await page.evaluate(() => document.querySelector('[data-hoje-tab="chegaram"], #tabsHoje [role=tab]:nth-child(2)')?.click()); await dorme(800);
    await page.evaluate(() => { const b = document.querySelector('.appt[data-nome="Maria Aparecida"] [data-marca="entrada"]'); b && b.click(); });
    await dorme(2000);
    const ab = await page.evaluate((n) => window.__abertos.slice(n), antes);
    const ent = ab.find(([u]) => /entrada=1/.test(u));
    anota(!!ent && /agendamento=/.test(ent[0]) && ent[1] === 'indycar-patio', `recepção › Chegou › Dar entrada abre a entrada pronta no Pátio: ${ent ? ent[0] + ' (aba ' + ent[1] + ')' : JSON.stringify(ab)}`);
    await browser.close();
  }
} finally { mock.parar(); }
fs.writeFileSync(SAIDA + 'passagens.txt', relato.join('\n') + '\n');
fim();
