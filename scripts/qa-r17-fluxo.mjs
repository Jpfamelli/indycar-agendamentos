// R17 · Agenda: o fluxo real "mensagem no Atendimento → Novo agendamento → salvo" no servidor de MENTIRA,
// com o service worker LIGADO e DUAS visitas, 1440 e 375 px, escuro e claro. Mede tempo até o formulário,
// rolagem até o Salvar e toques; confere foco no Serviço, hora padrão, aviso de horário passado e o recado.
//   node scripts/qa-r17-fluxo.mjs [antes|depois]      (antes = só mede e fotografa, sem conferir o que é novo)
import fs from 'node:fs';
import { iniciarMock, abrirNavegador, dorme } from './qa-r7c2-lib.mjs';
const FASE = process.argv[2] || 'depois';
const SAIDA = new URL('../qa-out/r17/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'); fs.mkdirSync(SAIDA, { recursive: true });
const mock = iniciarMock(Number(process.env.QA_PORTA || 3586)); await dorme(1500);
let falhas = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FALHOU ') + m); if (!c) falhas++; };
const novo = FASE === 'depois';
const LINK = '/?novo=1&tel=12991110004';          // como o Atendimento abre a Agenda
try {
  for (const tema of ['escuro', 'claro']) for (const largura of [1440, 375]) {
    const tag = `${largura}-${tema}`;
    const { browser, page } = await abrirNavegador({ largura, altura: largura < 500 ? 812 : 900 });
    const erros = []; page.on('pageerror', (e) => erros.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_FAILED/.test(m.text())) erros.push(m.text()); });
    await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('indycar_tema', t); localStorage.setItem('indycar_tour_visto_v1', '1'); localStorage.setItem('indycar_tour_quadro_v1', '1'); } catch {} }, tema);
    // 1ª visita (instala o service worker), 2ª visita pelo link do Atendimento
    await page.goto(mock.base + '/?tour=0', { waitUntil: 'networkidle2' }); await dorme(2500);
    const t0 = Date.now();
    await page.goto(mock.base + LINK, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#f_save', { timeout: 20000 });
    await page.waitForFunction(() => document.getElementById('f_nome')?.value, { timeout: 10000 });
    const ms = Date.now() - t0; await dorme(900);
    ok(await page.evaluate(async () => { const r = await navigator.serviceWorker?.getRegistration(); return !!(r && r.active); }), `${tag}: service worker ativo na 2ª visita`);
    const m = await page.evaluate(() => {
      const r = document.getElementById('f_save').getBoundingClientRect();
      const P = window.Planejamento;
      const esperado = P.inicioDoNovo ? P.inicioDoNovo((() => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value])); return { data: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute }; })()) : null;
      return { salvarVisivel: r.top >= 0 && r.bottom <= innerHeight, salvarTopo: Math.round(r.top), vh: innerHeight, foco: document.activeElement?.id,
        rapido: !document.getElementById('f_rapido')?.hidden, data: f_data.value, hora: f_hora.value, esperado,
        larguraOk: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        rolagemAteSalvar: Math.max(0, Math.round(r.bottom - innerHeight)),
        pequenos: [...document.querySelectorAll('#modal .modal-foot button')].map((b) => { const q = b.getBoundingClientRect(); return [b.textContent.trim(), Math.round(q.height)]; }).filter(([, h]) => h < 44) };
    });
    console.log(`  ${tag}: formulário em ${ms} ms · Salvar a ${m.rolagemAteSalvar}px de rolagem · foco ${m.foco} · hora ${m.data} ${m.hora}`);
    await page.screenshot({ path: `${SAIDA}${FASE}-form-${tag}.png` });
    ok(m.larguraOk, `${tag}: sem rolagem lateral`);
    if (novo) {
      ok(m.salvarVisivel, `${tag}: Salvar à vista sem rolar (topo ${m.salvarTopo}px de ${m.vh})`);
      ok(m.foco === 'f_serv', `${tag}: veio com o cliente, o foco já está no Serviço (${m.foco})`);
      ok(!m.rapido, `${tag}: "Marcar rápido" some quando o cliente já veio preenchido`);
      ok(m.esperado && m.data === m.esperado.data && m.hora === m.esperado.hora, `${tag}: data e hora padrão = próxima meia hora (${m.data} ${m.hora})`);
      ok(!m.pequenos.length || largura > 500, `${tag}: botões do rodapé com 44 px ou mais ${JSON.stringify(m.pequenos)}`);
      // horário que já passou: avisa (sem bloquear)
      await page.evaluate(() => { const d = new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10); f_data.value = d; f_data.dispatchEvent(new Event('change')); });
      await dorme(300);
      ok(await page.evaluate(() => !document.getElementById('f_expediente').hidden && /já passou/.test(document.getElementById('f_expediente').textContent)), `${tag}: data passada mostra "Esse dia já passou"`);
      // recado com a janela aberta não cobre o rodapé
      await page.evaluate(() => toast('Recado de teste com a janela aberta')); await dorme(500);
      ok(await page.evaluate(() => { const t = document.getElementById('toast').getBoundingClientRect(), f = document.querySelector('#modal .modal-foot').getBoundingClientRect(); return t.bottom <= f.top + 1; }), `${tag}: recado aparece acima do rodapé da janela`);
      await page.screenshot({ path: `${SAIDA}${FASE}-form-aviso-${tag}.png` });
      // volta para o padrão, preenche o serviço e salva
      await page.evaluate((d, h) => { f_data.value = d; f_data.dispatchEvent(new Event('change')); f_hora.value = h; f_hora.dispatchEvent(new Event('input')); }, m.data, m.hora);
    }
    await page.type('#f_serv', 'Troca de óleo'); await dorme(300);
    let toques = 0;
    if (!m.salvarVisivel) await page.evaluate(() => document.getElementById('f_save').scrollIntoView({ block: 'end' }));
    await page.click('#f_save'); toques++; await dorme(400);
    if (await page.evaluate(() => /assim mesmo|sem consultor/.test(document.getElementById('f_save')?.textContent || ''))) { await page.click('#f_save'); toques++; }
    await page.waitForFunction(() => !document.getElementById('modalOverlay')?.classList.contains('open') || !document.getElementById('f_save'), { timeout: 8000 }).catch(() => {});
    await dorme(500);
    const recado = await page.evaluate(() => document.getElementById('toast')?.textContent || '');
    console.log(`  ${tag}: toques no Salvar ${toques} · recado "${recado.replace(/\s+/g, ' ').slice(0, 80)}"`);
    if (novo) ok(/Agendamento salvo: Patrícia Lemos, (hoje|amanhã|\w{3} \d\d\/\d\d) às \d\d:\d\d/.test(recado), `${tag}: recado diz quem e quando`);
    await page.screenshot({ path: `${SAIDA}${FASE}-salvo-${tag}.png` });
    ok(erros.length === 0, `${tag}: sem erro de console/página ${erros.slice(0, 2).join('|')}`);
    await browser.close();
  }
} finally { mock.parar(); }
console.log(falhas ? falhas + ' falharam' : 'tudo ok'); process.exit(falhas ? 1 : 0);
