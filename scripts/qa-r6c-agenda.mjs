// QA da Agenda (rodada 6, C1c) no navegador headless contra o servidor de MENTIRA (scripts/mock-server.mjs, porta própria,
// encerrado pelo PID guardado aqui). Nada toca o banco real.   node scripts/qa-r6c-agenda.mjs
import { spawn } from 'node:child_process';
import { abrirNavegador } from './qa-r6-lib.mjs';
import { conf, fim, dorme, SAIDA } from './qa-r6c-lib.mjs';

const PORT = 3098, BASE = `http://localhost:${PORT}`;
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
    await page.evaluate(() => { try { localStorage.removeItem('indycar_tour_quadro_v1'); } catch {} });
    await irQuadro(page);
    // duração no cartão
    conf(/~1h30 · até 10:30/.test(await page.$eval(`${card('Teste Ana')} .qd-dur`, (e) => e.innerText)), 'Quadro: cartão mostra a duração do serviço e a hora em que termina (Freios ~1h30 · até 10:30)');
    conf(/~6h · até 15:00/.test(await page.$eval(`${card('Teste Bia')} .qd-dur`, (e) => e.innerText)), 'Quadro: serviço longo mostra ~6h · até 15:00');
    // cauda: Ana (90 min) é cortada pelo cartão do Caio às 10:00 → só 09:30; Bia (6 h) ocupa 11 linhas de baixo
    const cauda = await page.$$eval('.qd-cel.cauda', (c) => c.map((x) => x.dataset.slot + '|' + x.dataset.cons));
    conf(cauda.includes(`570|${GAB}`) && !cauda.includes(`600|${GAB}`), 'Quadro: o serviço da Ana marca a linha de 09:30 e para antes do cartão do Caio (10:00)');
    conf(cauda.filter((x) => x.endsWith(LEO)).length === 11, 'Quadro: o serviço de 6 h da Bia marca as 11 linhas seguintes (' + cauda.filter((x) => x.endsWith(LEO)).length + ')');
    conf(!!(await page.$(`.qd-cel.cauda[data-slot="570"][data-cons="${GAB}"] .qd-cauda-txt`)), 'Quadro: a primeira linha da cauda diz de quem é ("↳ Teste")');
    conf((await page.$$eval('.qd-carga', (e) => e.map((x) => x.innerText))).some((t) => /h/.test(t)), 'Quadro: cabeçalho da coluna mostra a carga do consultor em horas');
    // a cauda não impede de marcar/mover: célula livre embaixo continua aceitando o clique "+"
    conf((await page.$$eval('.qd-cel.cauda .qd-mais', (b) => b.length)) >= 1, 'Quadro: células da cauda continuam livres para novo horário (o "+" existe)');
    // faixa da semana
    await page.waitForSelector('#qdSemana .qd-dia', { timeout: 10000 });
    conf((await page.$$('#qdSemana .qd-dia')).length === 7, 'Quadro: faixa da semana com 7 dias');
    await page.waitForFunction((d) => document.querySelector('.qd-dia.atual')?.dataset.qdDia === d, { timeout: 8000 }, DIA).catch(() => {});
    conf(await page.$eval(`#qdSemana .qd-dia[data-qd-dia="${DIA}"]`, (b) => b.classList.contains('atual') && /\d/.test(b.innerText)), 'Quadro: o dia aberto está destacado com a contagem de horários');
    const outro = await page.$$eval('#qdSemana .qd-dia', (b) => b.map((x) => x.dataset.qdDia).filter((d) => d > document.querySelector('#qdData').value)[0]);
    await page.click(`#qdSemana .qd-dia[data-qd-dia="${outro}"]`); await dorme(900);
    conf((await page.$eval('#qdData', (e) => e.value)) === outro, 'Quadro: tocar num dia da faixa muda o dia do quadro');
    await page.$eval('#qdData', (e, d) => { e.value = d; e.dispatchEvent(new Event('change', { bubbles: true })); }, DIA); await page.waitForSelector(card('Teste Ana'));
    // busca
    await page.type('#qdBusca', 'bia'); await dorme(300);
    conf((await page.$$('.qd-card')).length === 1, 'Quadro: "achar no quadro" mostra só quem combina');
    await page.$eval('#qdBusca', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.type('#qdBusca', '991110'); await dorme(300);
    const porTel = await page.$$eval('.qd-card', (c) => c.map((x) => x.dataset.nome));
    conf(porTel.includes('Teste Ana') && porTel.includes('Teste Bia') && porTel.length <= 3, 'Quadro: achar pelo telefone parcial (991110 = Ana e Bia) → ' + porTel.join(', '));
    await page.$eval('#qdBusca', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('#qdSoFalta'); await dorme(200);
    const vivosApi = (await api(page, 'GET', `/api/agendamentos?data=${DIA}`)).j.filter((a) => ['aguardando', 'confirmado'].includes(a.status)).length;
    conf((await page.$$('.qd-card')).length === vivosApi && vivosApi >= 3, `Quadro: "só quem falta chegar" mostra só quem ainda não chegou (${vivosApi})`);
    await page.click('#qdSoFalta');
    // copiar o dia
    await page.evaluate(() => { navigator.clipboard.writeText = async (t) => { window.__copiado = t; }; });
    await page.click('#qdCopiar'); await dorme(300);
    const txt = await page.evaluate(() => window.__copiado || '');
    conf(/\*Gabriel\* \(\d+\)/.test(txt) && /09:00 Teste Ana — Freios .* · 1h30/.test(txt) && /\*Leonardo\* \(\d+\)/.test(txt) && /09:00 Teste Bia — Revisão de Motor .* · 6h/.test(txt), 'Copiar o dia: texto por consultor com a duração');
    // tour: aparece na primeira vez, some depois de "Entendi", volta no botão
    conf(!!(await page.$('#tour')), 'Tour do Quadro aparece na primeira vez');
    const passos = await page.$eval('#tour .tour-passo', (e) => e.innerText);
    for (let i = 0; i < 6 && (await page.$('#tqProx')); i++) await page.click('#tqProx');
    conf(!(await page.$('#tour')), 'Tour do Quadro termina e some (' + passos + ')');
    await page.evaluate(() => route('inicio')); await dorme(300); await irQuadro(page);
    conf(!(await page.$('#tour')), 'Tour não volta sozinho depois de visto');
    await page.click('#qdTour'); await page.waitForSelector('#tour', { timeout: 3000 }).then(() => conf(true, 'Botão "? Tour" mostra de novo'), () => conf(false, 'Botão "? Tour" mostra de novo'));
    await page.keyboard.press('Escape');
    await page.screenshot({ path: SAIDA + 'c1c-agenda-quadro-1440.png' });
    // atrasados (hoje)
    await page.click('#qdHoje'); await page.waitForSelector(card('Teste Atrasado'), { timeout: 10000 }); await dorme(600);
    const atr = await page.$eval('#qdAtrasados', (b) => ({ oculto: b.hidden, t: b.innerText })).catch(() => null);
    conf(atr && !atr.oculto && /atrasado/.test(atr.t), 'Atrasados: botão "⏰ N atrasados" aparece no dia de hoje ' + JSON.stringify(atr));
    await page.click('#qdAtrasados');
    const href = await page.$eval('#qdPainelAtrasados a[href^="https://wa.me/"]', (a) => decodeURIComponent(a.href)).catch(() => '');
    conf(/wa\.me\/5512991110055\?text=Oi Teste, tudo bem\?/.test(href), 'Atrasados: link do WhatsApp com a mensagem pronta para o cliente certo');
    // Novo agendamento: marcar rápido
    await page.click('#qdNovo'); await page.waitForSelector('#f_rapido_txt', { visible: true });
    await dorme(250);
    await dorme(250);
    conf(await page.evaluate(() => document.activeElement.id === 'f_rapido_txt'), 'Marcar rápido: o cursor já está na linha rápida (' + await page.evaluate(() => document.activeElement.id || document.activeElement.tagName) + ')');
    await page.type('#f_rapido_txt', 'Marta Dias 12 99111-4455 freios amanhã 14h polo abc1d23'); await page.keyboard.press('Enter'); await dorme(400);
    const f = await page.evaluate(() => Object.fromEntries(['f_nome', 'f_tel', 'f_serv', 'f_data', 'f_hora', 'f_placa', 'f_veic'].map((k) => [k, document.getElementById(k).value])));
    conf(f.f_nome === 'Marta Dias' && f.f_tel.replace(/\D/g, '') === '12991114455' && f.f_serv === 'Freios' && f.f_hora === '14:00' && f.f_placa === 'ABC1D23' && f.f_veic === 'Polo' && /^\d{4}-\d\d-\d\d$/.test(f.f_data), 'Marcar rápido: a linha preenche nome, telefone, serviço, dia, hora, placa e carro ' + JSON.stringify(f));
    conf(/Tudo preenchido/.test(await page.$eval('#f_rapido_dica', (e) => e.innerText)), 'Marcar rápido: diz que está tudo preenchido');
    // contexto: telefone da Ana (tem horário futuro)
    await page.$eval('#f_tel', (e) => { e.value = ''; }); await page.type('#f_tel', '12991110011'); await dorme(900);
    conf(/Já tem um horário marcado/.test(await page.$eval('#f_ctx6c', (e) => e.innerText).catch(() => '')), 'Contexto: telefone de quem já tem horário avisa "já tem um horário marcado"');
    await page.screenshot({ path: SAIDA + 'c1c-agenda-novo-1440.png' });
    await page.keyboard.press('Escape');
  });

  await cenario('celular', 375, async (page) => {
    await semear(page);
    await irQuadro(page);
    const larg = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    conf(larg[0] <= larg[1] + 1, `Celular 375 px: sem rolagem lateral na página (${larg.join(' / ')})`);
    const pequenos = await page.$$eval('#qdFerr input[type=search], #qdFerr .btn, #qdSemana .qd-dia, #qdFerr .qd-opt', (els) => els.filter((e) => e.offsetParent !== null).map((e) => [e.id || e.className, Math.round(e.getBoundingClientRect().height)]).filter((x) => x[1] < 44));
    conf(pequenos.length === 0, 'Celular 375 px: busca, botões e dias da faixa com 44 px ou mais' + (pequenos.length ? ' → ' + JSON.stringify(pequenos) : ''));
    await page.screenshot({ path: SAIDA + 'c1c-agenda-quadro-375.png', fullPage: true });
  });

  await cenario('recepcao', 1280, async (page) => {
    await page.evaluate(() => route('quadro')); await dorme(500);
    conf((await page.evaluate(() => state.route)) === 'dia', 'Papel "agenda": o Quadro continua redirecionando para a Recepção');
    conf(!(await page.$('#qdFerr, #f_rapido')), 'Papel "agenda": nenhuma ferramenta nova aparece');
  }, '/?papel=agenda&tour=0');
} finally { try { process.kill(PID); } catch { /* já saiu */ } }
fim();
