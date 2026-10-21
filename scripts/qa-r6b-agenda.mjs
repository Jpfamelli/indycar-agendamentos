// QA da Agenda (rodada 6, C1b) no navegador headless contra o servidor de MENTIRA (scripts/mock-server.mjs,
// sobe numa porta própria e é encerrado pelo PID guardado aqui). Nada toca o banco real.
//   node scripts/qa-r6b-agenda.mjs
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { abrirNavegador } from './qa-r6-lib.mjs';

const PORT = 3097, BASE = `http://localhost:${PORT}`;
const SAIDA = new URL('../capturas-r6/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
fs.mkdirSync(SAIDA, { recursive: true });
let ok = 0, falha = 0; const falhas = [];
const conf = (c, t) => { c ? ok++ : (falha++, falhas.push(t)); console.log((c ? '✔ ' : '✖ ') + t); };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const GAB = '20000000-0000-4000-8000-000000000102', LEO = '20000000-0000-4000-8000-000000000101';

const srv = spawn(process.execPath, ['scripts/mock-server.mjs'], { cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const PID = srv.pid;

/** próximo dia útil (seg-sex) a partir de amanhã, em horário de São Paulo */
function diaUtil() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const d = new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`);
  do { d.setUTCDate(d.getUTCDate() + 1); } while ([0, 6].includes(d.getUTCDay()));
  return d.toISOString().slice(0, 10);
}
const DIA = diaUtil();

async function cenario(nome, largura, fn, url = '/') {
  const { browser, page } = await abrirNavegador({ largura, altura: largura < 500 ? 800 : 950 });
  const erros = []; const dialogos = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_FAILED/.test(m.text())) erros.push(m.text()); });
  page.on('dialog', (d) => { dialogos.push(d.message()); d.accept(); });
  try {
    await page.goto(BASE + url, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.nav-item', { timeout: 20000 }); await dorme(700);
    await fn(page, { dialogos });
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
  const cria = (nome, hora, cons, tel, servico = 'Troca de óleo de motor') => api(page, 'POST', '/api/agendamentos', {
    cliente_nome: nome, servico, data: DIA, hora, consultor_id: cons, consultor_nome: cons === GAB ? 'Gabriel' : 'Leonardo', telefone: tel, veiculo: 'Onix' });
  await cria('Teste Ana', '09:00', GAB, '12991110011');
  await cria('Teste Bia', '09:00', LEO, '12991110012');
  await cria('Teste Caio', '10:00', GAB, null);
  await api(page, 'POST', '/api/agendamentos', { cliente_nome: 'Teste Pre', servico: 'Alinhamento 3D', data: DIA, hora: '15:00', consultor_id: LEO, consultor_nome: 'Leonardo', telefone: '12991110077', observacoes: 'PRÉ-AGENDAMENTO — Orçamento #12 aprovado pelo cliente' });
};
const irQuadro = async (page) => {
  await page.evaluate(() => route('quadro'));
  await page.waitForSelector('#qdCorpo .qd-grade', { timeout: 15000 });
  await page.$eval('#qdData', (e, d) => { e.value = d; e.dispatchEvent(new Event('change', { bubbles: true })); }, DIA);
  await page.waitForSelector('.qd-card[data-nome="Teste Ana"]', { timeout: 15000 });
};
const card = (nome) => `.qd-card[data-nome="${nome}"]`;
const dados = async (page) => (await api(page, 'GET', `/api/agendamentos?data=${DIA}`)).j;

try {
  await dorme(900);
  /* ---------------- desktop ---------------- */
  await cenario('desktop', 1440, async (page, { dialogos }) => {
    await semear(page);
    await page.evaluate(() => route('inicio')); await dorme(500);
    await irQuadro(page);
    const heads = await page.$$eval('.qd-th b', (b) => b.map((x) => x.innerText));
    conf(heads.includes('Leonardo') && heads.includes('Gabriel') && !heads.includes('Antigo'), 'Quadro: uma coluna por consultor ativo (o inativo não aparece): ' + heads.join(', '));
    const cels = await page.$$eval('.qd-cel', (c) => c.length);
    conf(cels === 19 * (await page.$$eval('.qd-th b', (b) => b.length)), 'Quadro: 19 linhas de 30 min (08:00 até 17:00, o último que cabe) × colunas');
    const naCol = await page.$eval(`${card('Teste Ana')}`, (c) => ({ cons: c.closest('.qd-cel').dataset.cons, slot: c.closest('.qd-cel').dataset.slot }));
    conf(naCol.cons === GAB && naCol.slot === '540', 'Cartão da Ana cai em Gabriel às 09:00');
    conf((await page.$eval('#qdResumo', (e) => e.innerText)).includes('horários'), 'Resumo do dia: ' + await page.$eval('#qdResumo', (e) => e.innerText));
    conf(!!(await page.$(`${card('Teste Caio')} .badge-pill.sem-tel, ${card('Teste Caio')} .qd-selos .badge-pill`)), 'Cartão sem telefone ganha o selo "sem telefone"');
    conf(!(await page.$(`${card('Teste Caio')} [data-qd="lembrar"]`)), 'Sem telefone não oferece "mandar lembrete"');
    conf(!!(await page.$(`${card('Teste Ana')} [data-qd="lembrar"]`)), 'Com telefone oferece 📨 (lembrete automático desligado no Comunicar)');
    await page.screenshot({ path: SAIDA + 'agenda-quadro-1440.png' });

    conf((await page.$$eval('.qd-prox', (e) => e.length)) >= 1, 'Cabeçalho mostra o próximo horário livre de cada consultor');
    const velho = await api(page, 'POST', `/api/agendamentos/${(await dados(page)).find((a) => a.cliente_nome === 'Teste Bia').id}/mover`, { data: DIA, hora: '09:00', consultor_id: GAB });
    conf(velho.status === 409 && velho.j.codigo === 'horario_ocupado', 'Servidor recusa mover para vaga que já foi ocupada (409), mesmo sem a tela saber');

    // mover: alvos verdes só onde cabe
    await page.click(`${card('Teste Ana')} [data-qd="mover"]`);
    await page.waitForSelector('.qd-cel.alvo-ok', { timeout: 8000 });
    const ocupada = await page.$eval(`.qd-cel[data-slot="540"][data-cons="${LEO}"]`, (c) => c.classList.contains('alvo-ok'));
    const livre = await page.$eval(`.qd-cel[data-slot="660"][data-cons="${GAB}"]`, (c) => c.classList.contains('alvo-ok'));
    conf(!ocupada && livre, 'Mover: célula ocupada não fica verde; célula livre (11:00 Gabriel) fica verde');
    conf(await page.$eval('#qdAviso', (e) => !e.hidden), 'Mover: aviso "escolha uma célula livre" aparece');
    await page.click(`.qd-cel[data-slot="660"][data-cons="${GAB}"]`);
    await page.waitForFunction(() => document.querySelector('.qd-card[data-nome="Teste Ana"]')?.closest('.qd-cel')?.dataset.slot === '660', { timeout: 10000 });
    conf((await dados(page)).find((a) => a.cliente_nome === 'Teste Ana').hora === '11:00', 'Mover: o servidor gravou 11:00');
    const toastMover = await page.$$eval('.toast', (t) => t.map((x) => x.innerText).join(' | '));
    conf(/11:00/.test(toastMover) && /Desfazer/.test(toastMover) && /Avisar o cliente/.test(toastMover), 'Mover: recado com "Avisar o cliente" e "Desfazer"');
    // desfazer
    await page.evaluate(() => [...document.querySelectorAll('.toast button')].find((b) => /Desfazer/.test(b.innerText))?.click());
    await page.waitForFunction(() => document.querySelector('.qd-card[data-nome="Teste Ana"]')?.closest('.qd-cel')?.dataset.slot === '540', { timeout: 10000 });
    conf(true, 'Desfazer volta a Ana para 09:00');

    // mover para célula inválida: nada é gravado
    await page.click(`${card('Teste Bia')} [data-qd="mover"]`);
    await page.waitForSelector('.qd-cel.alvo-nao', { timeout: 8000 });
    await page.click(`.qd-cel[data-slot="600"][data-cons="${GAB}"]`);
    await dorme(500);
    conf((await dados(page)).find((a) => a.cliente_nome === 'Teste Bia').hora === '09:00', 'Mover para célula ocupada: nada muda no servidor');
    conf(/não cabe/.test(await page.$$eval('.toast', (t) => t.map((x) => x.innerText).join(' | '))), 'Mover para célula ocupada: recado explica');
    await page.keyboard.press('Escape');
    conf(await page.$eval('#qdAviso', (e) => e.hidden), 'Esc cancela o modo mover');

    // mudar de consultor no mesmo horário
    await page.click(`${card('Teste Caio')} [data-qd="mover"]`);
    await page.waitForSelector('.qd-cel.alvo-ok', { timeout: 8000 });
    await page.click(`.qd-cel[data-slot="600"][data-cons="${LEO}"]`);
    await page.waitForFunction((l) => document.querySelector('.qd-card[data-nome="Teste Caio"]')?.closest('.qd-cel')?.dataset.cons === l, { timeout: 10000 }, LEO);
    conf((await dados(page)).find((a) => a.cliente_nome === 'Teste Caio').consultor_id === LEO, 'Trocar de consultor no mesmo horário grava o novo consultor');

    // pré-agendamento do Orçador
    conf(!!(await page.$(`${card('Teste Pre')} .selo-pre`)) && !!(await page.$(`${card('Teste Pre')} [data-qd="confirmarpre"]`)), 'Pré-agendamento: selo e botão Confirmar no cartão');
    await page.click(`${card('Teste Pre')} [data-qd="confirmarpre"]`);
    await page.waitForFunction(() => document.querySelector('.qd-card[data-nome="Teste Pre"]')?.dataset.status === 'confirmado', { timeout: 10000 });
    conf(!(await page.$(`${card('Teste Pre')} .selo-pre`)), 'Pré-agendamento: depois de confirmado o selo some');

    // lembrar
    await page.click(`${card('Teste Ana')} [data-qd="lembrar"]`);
    await page.waitForFunction(() => /na fila/.test(document.querySelector('.qd-card[data-nome="Teste Ana"] .qd-selos')?.innerText || ''), { timeout: 10000 });
    conf(true, 'Lembrar: o cartão passa a mostrar "lembrete na fila"');
    conf(!(await page.$(`${card('Teste Ana')} [data-qd="lembrar"]`)), 'Depois de lembrado, o botão 📨 some');

    // chegou
    await page.click(`${card('Teste Bia')} [data-qd="chegou"]`);
    await page.waitForFunction(() => document.querySelector('.qd-card[data-nome="Teste Bia"]')?.dataset.status === 'compareceu', { timeout: 10000 });
    conf(/OS nº/.test(await page.$$eval('.toast', (t) => t.map((x) => x.innerText).join(' | '))), 'Chegou: recado com o nº da OS do Pátio');
    conf(!(await page.$(`${card('Teste Bia')} [data-qd="chegou"]`)), 'Quem já chegou não tem mais "Chegou"');
    await page.waitForSelector(`${card('Teste Bia')} .selo-patio`, { timeout: 8000 }).then(() => conf(true, 'Chegou: etapa do Pátio aparece no cartão'), () => conf(false, 'Chegou: etapa do Pátio aparece no cartão'));

    // faltou pede confirmação
    const antes = dialogos.length;
    await page.click(`${card('Teste Caio')} [data-qd="faltou"]`);
    await page.waitForFunction(() => document.querySelector('.qd-card[data-nome="Teste Caio"]')?.dataset.status === 'nao_veio', { timeout: 10000 });
    conf(dialogos.length === antes + 1 && /avisa o cliente/.test(dialogos.at(-1)), 'Faltou: pede confirmação antes de avisar o cliente');

    // ficha: bloco do lembrete
    await page.click(`${card('Teste Ana')} [data-qd="abrir"]`);
    await page.waitForSelector('#f_lembrete:not([hidden]) .r6b-lembrete', { timeout: 10000 });
    const ficha = await page.$eval('#f_lembrete', (e) => e.innerText.replace(/\s+/g, ' '));
    conf(/na fila do Comunicar/.test(ficha), 'Ficha: lembrete "na fila do Comunicar": ' + ficha.slice(0, 80));
    await page.screenshot({ path: SAIDA + 'agenda-ficha-lembrete.png' });
    await page.evaluate(() => closeModal());

    // dia seguinte e teclas
    await page.keyboard.press('ArrowRight'); await dorme(700);
    conf((await page.$eval('#qdData', (e) => e.value)) > DIA, 'Seta → muda para o dia seguinte');
    await page.keyboard.press('t'); await dorme(700);
    conf((await page.$eval('#qdData', (e) => e.value)) <= DIA, 'T volta para hoje');
  });

  /* ---------------- Início: faixa de lembretes ---------------- */
  await cenario('inicio', 1440, async (page, { dialogos }) => {
    await semear(page);
    await page.evaluate(() => route('inicio'));
    await page.waitForSelector('.r6b-lembretes', { timeout: 15000 });
    const t = await page.$eval('.r6b-lembretes', (e) => e.innerText.replace(/\s+/g, ' '));
    conf(/Lembretes de/.test(t), 'Início: faixa de lembretes: ' + t.slice(0, 120));
    conf(/desligado no Comunicar/.test(t), 'Início: avisa que o lembrete automático está desligado');
    const botao = await page.$('[data-r6b-lote]');
    conf(!!botao, 'Início: botão "Lembrar os que faltam"');
    await page.evaluate(() => api('POST', '/lembretes/lote', { data: new Date(Date.now() + 864e5 * 400).toISOString().slice(0, 10) }).catch(() => 0));
  });

  /* ---------------- espera com horários livres ---------------- */
  await cenario('espera', 1440, async (page) => {
    await semear(page);
    await api(page, 'POST', '/api/espera', { cliente_nome: 'Teste Dani', servico: 'Troca de óleo de motor', telefone: '12991110099', preferencia: 'Tarde' });
    await page.evaluate(() => route('espera'));
    await page.waitForSelector('.espera-item[data-nome="Teste Dani"] [data-r6b-slots]', { timeout: 15000 });
    await page.click('.espera-item[data-nome="Teste Dani"] [data-r6b-slots]');
    await page.waitForSelector('.espera-item[data-nome="Teste Dani"] .r6b-slot', { timeout: 15000 });
    const chips = await page.$$eval('.espera-item[data-nome="Teste Dani"] .r6b-slot', (c) => c.map((x) => x.innerText.replace(/\s+/g, ' ')));
    conf(chips.length > 0 && chips.length <= 6, 'Espera: chips de horários livres: ' + chips.slice(0, 3).join(' | '));
    conf(chips.every((c) => { const h = Number(/(\d{2}):/.exec(c)?.[1]); return h >= 12; }), 'Espera: preferência "Tarde" respeitada (todos a partir das 12h)');
    await page.click('.espera-item[data-nome="Teste Dani"] .r6b-slot');
    await page.waitForSelector('#f_nome', { timeout: 10000 });
    const pre = await page.evaluate(() => ({ nome: document.querySelector('#f_nome').value, data: document.querySelector('#f_data')?.value, hora: document.querySelector('#f_hora')?.value }));
    conf(pre.nome === 'Teste Dani' && /^\d{4}-/.test(pre.data || '') && /^1[2-7]:/.test(pre.hora || ''), 'Espera: o chip abre o Novo agendamento já com nome, dia e hora: ' + JSON.stringify(pre));
    await page.screenshot({ path: SAIDA + 'agenda-espera-chips.png' });
  });

  /* ---------------- celular 375 ---------------- */
  await cenario('celular-375', 375, async (page) => {
    await semear(page);
    await irQuadro(page).catch(async () => { await dorme(800); });
    await page.waitForSelector('.qd-chips', { timeout: 15000 });
    const colunas = await page.$$eval('.qd-th b', (b) => b.length);
    conf(colunas === 1, 'Celular: uma coluna de consultor por vez (' + colunas + ')');
    const chips = await page.$$eval('.qd-chips .pilula', (c) => c.map((x) => x.innerText));
    conf(chips.length >= 3, 'Celular: chips para trocar de consultor: ' + chips.join(', '));
    const rolagem = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    conf(rolagem <= 1, 'Celular: página sem rolagem horizontal (' + rolagem + 'px)');
    await dorme(1000); await page.click('.qd-chips .pilula:nth-child(2)'); await dorme(600);
    conf((await page.$$eval('.qd-th b', (b) => b.map((x) => x.innerText)))[0].toLowerCase() === chips[1].trim().toLowerCase(), 'Celular: chip troca a coluna ' + JSON.stringify([await page.$$eval('.qd-th b', (b) => b.map((x) => x.innerText)), chips]));
    await page.click('.qd-chips .pilula:nth-child(2)').catch(() => {});
    const altos = await page.$$eval('.qd-card [data-qd]', (bs) => bs.map((b) => b.getBoundingClientRect().height));
    conf(altos.length === 0 || altos.every((h) => h >= 36), 'Celular: botões do cartão com pelo menos 36 px de altura');
    await page.screenshot({ path: SAIDA + 'agenda-quadro-375.png' });
  });

  /* ---------------- recepção (papel agenda) ---------------- */
  await cenario('recepcao', 1280, async (page) => {
    await page.evaluate(() => route('quadro')); await dorme(500);
    const rota = await page.evaluate(() => state.route);
    conf(rota === 'dia', 'Papel "agenda": o Quadro redireciona para a Recepção (' + rota + ')');
    const r = await api(page, 'GET', '/api/lembretes');
    conf(r.status === 403, 'Papel "agenda": GET /api/lembretes é 403');
  }, '/?papel=agenda');
} finally {
  try { process.kill(PID); } catch { /* já saiu */ }
}
console.log(`\n${ok} ok, ${falha} falha(s)`);
if (falha) { console.log(falhas.join('\n')); process.exit(1); }
