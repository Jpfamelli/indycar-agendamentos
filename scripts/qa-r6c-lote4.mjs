// QA da Agenda (rodada 6, C1c, lote 4: links em aba nomeada, mesma pessoa, repetir, avisar pronto, atalhos) no navegador headless contra o servidor de MENTIRA (scripts/mock-server.mjs, porta própria,
// encerrado pelo PID guardado aqui). Nada toca o banco real.   node scripts/qa-r6c-lote4.mjs
import { spawn } from 'node:child_process';
import { abrirNavegador } from './qa-r6-lib.mjs';
import { conf, fim, dorme, SAIDA } from './qa-r6c-lib.mjs';

const PORT = 3097, BASE = `http://localhost:${PORT}`;
const GAB = '20000000-0000-4000-8000-000000000102', LEO = '20000000-0000-4000-8000-000000000101';
const srv = spawn(process.execPath, ['scripts/mock-server.mjs'], { cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const PID = srv.pid;
const sp = (d = new Date()) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
const hojeIso = () => { const p = sp(); return `${p.year}-${p.month}-${p.day}`; };
function diaUtil() { const d = new Date(hojeIso() + 'T12:00:00Z'); do { d.setUTCDate(d.getUTCDate() + 1); } while ([0, 6].includes(d.getUTCDay())); return d.toISOString().slice(0, 10); }
const DIA = diaUtil();

async function cenario(nome, largura, fn, url = '/?tour=0') {
  const { browser, page } = await abrirNavegador({ largura, altura: largura < 500 ? 800 : 950 });
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_FAILED/.test(m.text())) erros.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  try {
    await page.goto(BASE + url, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.nav-item', { timeout: 20000 }); await dorme(700);
    await fn(page);
  } catch (e) { conf(false, `${nome}: exceção — ${e.message}`); }
  conf(erros.length === 0, `${nome}: sem erro no console${erros.length ? ' — ' + erros.slice(0, 2).join(' | ') : ''}`);
  await browser.close();
}
const api = (page, metodo, rota, corpo) => page.evaluate(async (m, r, c) => {
  const x = await fetch(r, { method: m, headers: { 'Content-Type': 'application/json' }, body: c ? JSON.stringify(c) : undefined });
  return { status: x.status, j: await x.json().catch(() => null) };
}, metodo, rota, corpo);
const semear = async (page) => {
  await api(page, 'POST', '/api/__reset', {});
  const cria = (nome, hora, cons, tel, servico, extra = {}, data = DIA) => api(page, 'POST', '/api/agendamentos', {
    cliente_nome: nome, servico, data, hora, consultor_id: cons, consultor_nome: cons === GAB ? 'Gabriel' : 'Leonardo', telefone: tel, veiculo: 'Onix', ...extra });
  await cria('Teste Ana', '09:00', GAB, '12991110011', 'Freios');
  await cria('Teste Bia', '09:00', LEO, '12991110012', 'Revisão de Motor');
  await cria('Teste Caio', '10:00', GAB, null, 'Troca de óleo');
  await cria('Teste Atrasado', '08:00', LEO, '12991110055', 'Freios', {}, hojeIso());
};
const card = (n) => `.qd-card[data-nome="${n}"]`;
const irQuadro = async (page) => {
  await page.evaluate(() => route('quadro'));
  await page.waitForSelector('#qdCorpo .qd-grade', { timeout: 15000 });
  await page.$eval('#qdData', (e, d) => { e.value = d; e.dispatchEvent(new Event('change', { bubbles: true })); }, DIA);
  await page.waitForSelector('.qd-card', { timeout: 15000 });
  await dorme(500);
};

try {
  await dorme(900);
  await cenario('desktop', 1440, async (page) => {
    await semear(page);
    await page.evaluate(() => { try { localStorage.setItem('indycar_tour_quadro_v1', '1'); } catch {} });
    // a Ana ganha um segundo horário no mesmo dia (mesma pessoa, mesmo telefone)
    await api(page, 'POST', '/api/agendamentos', { cliente_nome: 'Teste Ana', servico: 'Alinhamento', data: DIA, hora: '14:00', consultor_id: LEO, consultor_nome: 'Leonardo', telefone: '12991110011', veiculo: 'Onix' });
    await irQuadro(page);
    // 1) mesma pessoa: o mouse num cartão destaca o outro
    await page.hover(card('Teste Ana')); await dorme(200);
    const destacados = await page.$$eval('.qd-card.mesmo', (cs) => cs.map((c) => c.dataset.nome));
    conf(destacados.length === 1 && destacados[0] === 'Teste Ana', 'Mesma pessoa: passar o mouse no cartão da Ana destaca o outro horário dela (' + destacados.join(',') + ')');
    await page.mouse.move(5, 5); await dorme(200);
    conf((await page.$$('.qd-card.mesmo')).length === 0, 'Mesma pessoa: tirar o mouse limpa o destaque');
    await page.hover(card('Teste Bia')); await dorme(200);
    conf((await page.$$('.qd-card.mesmo')).length === 0, 'Mesma pessoa: quem tem um horário só não destaca ninguém');
    // 2) repetir
    await page.click(card('Teste Ana') + ' [data-qd-repetir]'); await page.waitForSelector('#f_nome', { timeout: 8000 }); await dorme(500);
    const f = await page.evaluate(() => Object.fromEntries(['f_nome', 'f_tel', 'f_veic', 'f_serv', 'f_data'].map((k) => [k, document.getElementById(k).value])));
    conf(f.f_nome === 'Teste Ana' && f.f_tel.replace(/\D/g, '') === '12991110011' && f.f_veic === 'Onix' && f.f_serv && f.f_data, 'Repetir: o novo horário já vem com nome, telefone, carro e serviço ' + JSON.stringify(f));
    conf(/Já tem 2 horários marcados/.test(await page.$eval('#f_ctx6c', (e) => e.innerText).catch(() => '')), '🔗 Repetir: o aviso de contexto já mostra os horários que a Ana tem');
    // regressão (C1b): com a ficha aberta, as setas não podem trocar o dia do Quadro por trás
    const diaAntes = await page.evaluate(() => R6b.estado.data);
    await page.evaluate(() => document.querySelector('#modalOverlay .modal-close, #modalOverlay button')?.focus());
    await page.keyboard.press('ArrowRight'); await dorme(400);
    conf((await page.evaluate(() => R6b.estado.data)) === diaAntes, 'Bug da C1b: seta para a direita com a ficha aberta NÃO muda o dia do Quadro por trás');
    await page.keyboard.press('Escape'); await dorme(400);
    conf(!(await page.evaluate(() => modalAberto())), 'Esc fecha a ficha');
    // 3) atalhos
    await page.keyboard.press('/'); await dorme(200);
    conf(await page.evaluate(() => document.activeElement.id === 'qdBusca'), 'Atalho "/": o cursor vai para a busca do Quadro');
    await page.keyboard.press('Escape'); await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('n'); await page.waitForSelector('#f_nome', { timeout: 8000 });
    conf((await page.$eval('#f_data', (e) => e.value)) === DIA, 'Atalho "N": abre horário novo já no dia que está na tela');
    await page.keyboard.press('Escape'); await dorme(300);
    // 4) avisar: pronto
    const ana = await api(page, 'GET', `/api/agendamentos?data=${DIA}`);
    const idAna = ana.j.find((x) => x.cliente_nome === 'Teste Ana' && x.hora.startsWith('09')).id;
    await api(page, 'PATCH', `/api/agendamentos/${idAna}/status`, { status: 'compareceu' });
    await api(page, 'POST', '/api/__patio', { agendamento_id: idAna, etapa: 'pronto' });
    await page.evaluate(() => { try { window._patioCache && _patioCache.clear(); } catch {} });
    await page.$eval('#qdData', (e) => { e.dispatchEvent(new Event('change', { bubbles: true })); }); await dorme(1500);
    const av = await page.$$eval(card('Teste Ana') + ' .qd-avisar', (as) => as.map((a) => [a.getAttribute('href'), a.textContent.trim()]));
    conf(av.length === 1 && av[0][0].startsWith('https://wa.me/5512991110011?text=') && /Avisar/.test(av[0][1]), '🔗 Pátio→cliente: carro pronto ganha "Avisar: pronto" no WhatsApp ' + JSON.stringify(av).slice(0, 80));
    conf(/está pronto aqui na IndyCar/.test(decodeURIComponent(av[0]?.[0] || '')), '🔗 O recado diz que o carro está pronto');
    const outros = await page.$$eval('.qd-avisar', (as) => as.length);
    conf(outros === 1, 'Avisar: só o carro pronto tem o botão (' + outros + ')');
    // 5) links entre sistemas: aba nomeada
    const selo = await page.$(card('Teste Ana') + ' .selo-patio');
    if (selo) {
      await page.evaluate(() => { window.__abertos = []; window.open = (u, n) => { window.__abertos.push([u, n]); return { focus() {} }; }; });
      await selo.evaluate((e) => e.click()); await dorme(200);
      const ab = await page.evaluate(() => window.__abertos);
      conf(ab.length === 1 && ab[0][1] === 'indycar-patio', '🔗 Selo do Pátio abre a aba nomeada indycar-patio (' + JSON.stringify(ab) + ')');
      await page.$eval(card('Teste Ana') + ' .qd-avisar', (e) => e.click()); await dorme(200);
      const ab2 = await page.evaluate(() => window.__abertos);
      conf(ab2.length === 2 && ab2[1][1] === 'indycar-whatsapp', '🔗 Botão de WhatsApp abre a aba nomeada indycar-whatsapp');
    } else conf(false, 'Selo do Pátio não apareceu no cartão da Ana');
    await page.screenshot({ path: SAIDA + 'c1c-agenda-lote4-1440.png' });
  });

  await cenario('celular', 375, async (page) => {
    await semear(page);
    await irQuadro(page);
    const pequenos = await page.$$eval('.qd-card .qd-acoes .btn', (els) => els.filter((e) => e.offsetParent !== null).map((e) => [e.textContent.trim(), Math.round(e.getBoundingClientRect().height)]).filter((x) => x[1] < 44));
    conf(pequenos.length === 0, 'Celular 375 px: botões dos cartões (inclusive Repetir) com 44 px ou mais' + (pequenos.length ? ' → ' + JSON.stringify(pequenos.slice(0, 4)) : ''));
    const larg = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    conf(larg[0] <= larg[1] + 1, `Celular 375 px: sem rolagem lateral (${larg.join(' / ')})`);
  });
} finally { try { process.kill(PID); } catch { /* já saiu */ } }
fim();
