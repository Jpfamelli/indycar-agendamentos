// QA da Agenda (rodada 6, C1c, lote 5: operador apressado, Conversa e Orçar nos cartões) no navegador headless contra o servidor de MENTIRA (scripts/mock-server.mjs, porta própria,
// encerrado pelo PID guardado aqui). Nada toca o banco real.   node scripts/qa-r6c-lote5.mjs
import { spawn } from 'node:child_process';
import { abrirNavegador } from './qa-r6-lib.mjs';
import { conf, fim, dorme, SAIDA } from './qa-r6c-lib.mjs';

const PORT = 3096, BASE = `http://localhost:${PORT}`;
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

const contar = (page, regra) => { const n = { v: 0, urls: [] }; page.on('request', (r) => { if (regra(r)) { n.v++; n.urls.push(r.method() + ' ' + r.url().replace(BASE, '')); } }); return n; };
const semTour = (page) => page.evaluate(() => { try { localStorage.setItem('indycar_tour_quadro_v1', '1'); } catch {} });

try {
  await dorme(900);
  await cenario('apressado', 1440, async (page) => {
    await semear(page); await semTour(page);
    await irQuadro(page);
    // A) duplo clique em Salvar não pode criar dois horários
    const posts = contar(page, (r) => r.method() === 'POST' && /\/api\/agendamentos$/.test(r.url()));
    await page.keyboard.press('n'); await page.waitForSelector('#f_nome', { timeout: 8000 });
    conf((await page.$eval('#f_data', (e) => e.value)) === DIA, '"N" no Quadro abre o horário novo no dia que está na tela');
    await page.type('#f_nome', 'Teste Pressa'); await page.type('#f_tel', '12991119999'); await page.type('#f_serv', 'Freios');
    await page.$eval('#f_hora', (e) => { e.value = '11:00'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.select('#f_cons', GAB);
    await page.click('#f_save', { count: 2, delay: 10 }); await dorme(1500);
    console.log('toast:', await page.evaluate(() => document.querySelector('.toast, #toast')?.innerText));
    conf(posts.v === 1, `Apressado: duplo clique em Salvar manda UM pedido só (${posts.v}: ${posts.urls.join(', ')})`);
    const lista = await api(page, 'GET', `/api/agendamentos?data=${DIA}`);
    conf(lista.j.filter((x) => x.cliente_nome === 'Teste Pressa').length === 1, 'Apressado: só um horário "Teste Pressa" existe no dia');
    // B) duplo clique em Chegou
    await irQuadro(page);
    const patch = contar(page, (r) => r.method() === 'PATCH' && /\/status$/.test(r.url()));
    await page.click(card('Teste Ana') + ' [data-qd="chegou"]', { count: 2, delay: 5 }); await dorme(1500);
    conf(patch.v === 1, `Apressado: dois cliques em Chegou viram UM pedido (${patch.v})`);
    // B2) tecla Enter repetida num botão focado (cliques seguidos sem mouse)
    const antesB = patch.v;
    await page.$eval(card('Teste Caio') + ' [data-qd="chegou"]', (b) => { b.click(); b.click(); b.click(); }); await dorme(1500);
    conf(patch.v - antesB === 1, `Apressado: Enter repetido em Chegou (3 cliques seguidos) vira UM pedido (${patch.v - antesB})`);
    // C) duplo clique em Faltou
    const antes = patch.v;
    await page.click(card('Teste Bia') + ' [data-qd="faltou"]', { count: 2, delay: 5 }); await dorme(1500);
    conf(patch.v - antes === 1, `Apressado: dois cliques em Faltou viram UM pedido (${patch.v - antes})`);
  });

  await cenario('conversa-orcar', 1440, async (page) => {
    await semear(page); await semTour(page);
    await irQuadro(page);
    const conv = await page.$$eval(card('Teste Ana') + ' .qd-conversa', (as) => as.map((a) => a.getAttribute('href')));
    conf(conv.length === 1 && /\?tel=12991110011$/.test(conv[0]), '🔗 Cartão com telefone tem "Conversa" que abre o Atendimento nesse telefone (' + conv.join(',') + ')');
    conf((await page.$$(card('Teste Caio') + ' .qd-conversa')).length === 0, 'Cartão sem telefone não mostra "Conversa"');
    conf((await page.$$(card('Teste Ana') + ' .qd-orcar')).length === 0, 'Quem ainda não chegou não mostra "Orçar"');
    await page.evaluate(() => { window.__abertos = []; window.open = (u, n) => { window.__abertos.push([u, n]); return { focus() {} }; }; });
    await page.$eval(card('Teste Ana') + ' .qd-conversa', (e) => e.click()); await dorme(200);
    const ab = await page.evaluate(() => window.__abertos);
    conf(ab.length === 1 && ab[0][1] === 'indycar-atendimento', '🔗 "Conversa" abre a aba nomeada indycar-atendimento (' + JSON.stringify(ab) + ')');
    await page.$eval(card('Teste Ana') + ' [data-qd="chegou"]', (b) => b.click()); await dorme(1800);
    const orc = await page.$$eval(card('Teste Ana') + ' .qd-orcar', (as) => as.map((a) => a.getAttribute('href')));
    conf(orc.length === 1 && /orcador/.test(orc[0]) && /tel=5512991110011/.test(orc[0]) && /nome=Teste/.test(orc[0]), '🔗 Depois de "Chegou", aparece "Orçar" com telefone (55…) e nome no Orçador (' + orc.join(',').slice(0, 90) + ')');
    await page.$eval(card('Teste Ana') + ' .qd-orcar', (e) => e.click()); await dorme(200);
    const ab2 = await page.evaluate(() => window.__abertos);
    conf(ab2.length === 2 && ab2[1][1] === 'indycar-orcador', '🔗 "Orçar" abre a aba nomeada indycar-orcador');
  });

  await cenario('offline', 1440, async (page) => {
    await semear(page); await semTour(page);
    await irQuadro(page);
    const posts = contar(page, (r) => r.method() === 'POST' && /\/api\/agendamentos$/.test(r.url()));
    await page.keyboard.press('n'); await page.waitForSelector('#f_nome', { timeout: 8000 });
    let falhou = 0; page.on('requestfailed', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/agendamentos')) falhou++; });
    await page.type('#f_nome', 'Teste Sem Net'); await page.type('#f_tel', '12991118888'); await page.type('#f_serv', 'Freios');
    await page.$eval('#f_hora', (e) => { e.value = '12:00'; e.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.setOfflineMode(true);
    await page.select('#f_cons', GAB);
    await page.click('#f_save'); await dorme(1500);
    const fila = await page.evaluate(() => { try { return JSON.stringify(Object.entries(localStorage).filter(([k]) => /fila|offline/i.test(k)).map(([k, v]) => [k, v.length])); } catch { return '?'; } });
    conf(falhou === posts.v, `Sem internet: nenhum pedido chega ao servidor (${posts.v} tentados, ${falhou} falharam)`);
    conf(await page.evaluate(() => !!document.querySelector('#f_nome') && document.querySelector('#f_nome').value === 'Teste Sem Net'), 'Sem internet: a ficha continua aberta com tudo que foi digitado (nada se perde)');
    conf(await page.evaluate(() => { const t = document.querySelector('.toast, #toast'); return !!t && /internet|conex|conect|rede|servidor/i.test(t.innerText); }), 'Sem internet: avisa em português claro (' + (await page.evaluate(() => document.querySelector('.toast, #toast')?.innerText)) + ')');
    await page.setOfflineMode(false); await dorme(500);
    await page.click('#f_save'); await dorme(2000);
    const lista = await api(page, 'GET', `/api/agendamentos?data=${DIA}`);
    conf(lista.j.filter((x) => x.cliente_nome === 'Teste Sem Net').length === 1, 'Voltou a internet: o horário vai UMA vez (' + lista.j.filter((x) => x.cliente_nome === 'Teste Sem Net').length + ')');
  });
} finally { try { process.kill(PID); } catch { /* já saiu */ } }
fim();
