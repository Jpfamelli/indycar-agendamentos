// R19 · Agenda: um dia real no servidor de MENTIRA, com o relógio parado às 13h20 (o resultado não depende da hora
// em que o roteiro roda). Mede toques e rolagem de: encaixe de última hora, remarcar, ver o dia de amanhã e o
// Quadro no celular. Service worker LIGADO e DUAS visitas; 375 e 1440 px; claro e escuro.
//   node scripts/qa-r19-fluxo.mjs [antes|depois]      (antes = só mede e fotografa, sem conferir o que é novo)
import fs from 'node:fs';
import { iniciarMock, abrirNavegador, dorme } from './qa-r7c2-lib.mjs';
const FASE = process.argv[2] || 'depois';
const novo = FASE === 'depois';
const SAIDA = new URL('../qa-out/r19/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'); fs.mkdirSync(SAIDA, { recursive: true });
// 13h20 de hoje em Brasília
const sp = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
const DESLOCA = Date.UTC(+sp.year, +sp.month - 1, +sp.day, 16, 20) - Date.now();
process.env.QA_DESLOCA_MS = String(DESLOCA);
process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} --import ${new URL('./qa-relogio.mjs', import.meta.url).href}`.trim();
const mock = iniciarMock(Number(process.env.QA_PORTA || 3593)); await dorme(1800);
let falhas = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FALHOU ') + m); if (!c) falhas++; };
const medidas = {};
try {
  for (const tema of ['claro', 'escuro']) for (const largura of [375, 1440]) {
    const tag = `${largura}-${tema}`; const cel = largura < 500;
    const { browser, page } = await abrirNavegador({ largura, altura: cel ? 812 : 900 });
    const erros = []; page.on('pageerror', (e) => erros.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_FAILED/.test(m.text())) erros.push(m.text()); });
    page.on('dialog', (d) => d.accept());
    await page.evaluateOnNewDocument((t, desloca) => {
      const Real = Date;
      class Falso extends Real { constructor(...a) { if (a.length) super(...a); else super(Real.now() + desloca); } static now() { return Real.now() + desloca; } }
      window.Date = Falso;
      try { localStorage.setItem('indycar_tema', t); localStorage.setItem('indycar_tour_visto_v1', '1'); localStorage.setItem('indycar_tour_quadro_v1', '1'); } catch { /* sem armazenamento */ }
    }, tema, DESLOCA);
    const foto = (n, full = false) => page.screenshot({ path: `${SAIDA}${FASE}-${n}-${tag}.png`, fullPage: full });
    const semLateral = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    const pequenos = (raiz) => page.evaluate((r) => [...document.querySelectorAll(r + ' button, ' + r + ' a.btn, ' + r + ' input:not([type=checkbox])')].filter((b) => b.offsetParent)
      .map((b) => { const q = b.getBoundingClientRect(); return [(b.textContent.trim() || b.getAttribute('aria-label') || b.id || '').slice(0, 24), Math.round(q.width), Math.round(q.height)]; }).filter(([, w, h]) => h < 44 || w < 44), raiz);
    // 1ª visita instala o service worker; a 2ª é a que vale
    await page.goto(mock.base + '/?tour=0', { waitUntil: 'networkidle2' }); await dorme(2500);
    await page.goto(mock.base + '/?tour=0', { waitUntil: 'networkidle2' }); await page.waitForSelector('.nav-item'); await dorme(1500);
    await page.evaluate(() => fetch('/api/__reset', { method: 'POST' }).catch(() => {})); await dorme(300);
    await page.goto(mock.base + '/?tour=0', { waitUntil: 'networkidle2' }); await page.waitForSelector('#agendaHoje .appt'); await dorme(2200);
    ok(await page.evaluate(async () => { const r = await navigator.serviceWorker?.getRegistration(); return !!(r && r.active); }), `${tag}: service worker ativo`);
    ok(await page.evaluate(() => /^13:2/.test(agoraSP().hm)), `${tag}: relógio de mentira às 13h20 (${await page.evaluate(() => agoraSP().hm)})`);
    await foto('inicio', true);
    ok(await semLateral(), `${tag}: Início sem rolagem lateral`);

    /* ---- 1. ENCAIXE de última hora: "tem vaga hoje?" ---- */
    const vaga = await page.evaluate(() => { const b = document.querySelector('[data-r19-vaga]'); if (!b) return null; const q = b.getBoundingClientRect();
      return { topo: Math.round(q.top + scrollY), n: document.querySelectorAll('[data-r19-vaga]').length, txt: [...document.querySelectorAll('[data-r19-vaga]')].map((x) => x.textContent.trim().replace(/\s+/g, ' ')), vh: innerHeight }; });
    // caminho de antes: aba Quadro, rolar até a primeira célula livre de hoje, tocar no +
    await page.evaluate(() => route('quadro')); await page.waitForSelector('#qdCorpo .qd-grade'); await dorme(2200);
    const q = await page.evaluate(() => { const m = document.querySelector('#qdCorpo .qd-mais'), g = document.querySelector('#qdCorpo .qd-grade'), c = document.querySelector('#qdCorpo .qd-card');
      const y = (e) => (e ? Math.round(e.getBoundingClientRect().top + scrollY) : null);
      return { pagina: document.documentElement.scrollHeight, alturaGrade: g ? Math.round(g.getBoundingClientRect().height) : 0, primeiroLivre: y(m), primeiroCartao: y(c), vh: innerHeight,
        recolhidas: document.querySelectorAll('#qdCorpo [data-qd-rec]').length, linhas: document.querySelectorAll('#qdCorpo .qd-hh').length }; });
    const rolar = (y, vh) => (y == null ? null : Math.max(0, y - (vh - 140)));
    medidas[tag] = { encaixe: vaga ? { toques: 1, rolagem: rolar(vaga.topo, vaga.vh), vagas: vaga.txt } : { toques: 2, rolagem: rolar(q.primeiroLivre, q.vh), obs: 'aba Quadro, rolar até o primeiro + de hoje' },
      quadro: { pagina: q.pagina, alturaGrade: q.alturaGrade, linhas: q.linhas, recolhidas: q.recolhidas, rolagemAtePrimeiroCartao: rolar(q.primeiroCartao, q.vh), rolagemAtePrimeiroLivre: rolar(q.primeiroLivre, q.vh) } };
    await foto('quadro', true);
    ok(await semLateral(), `${tag}: Quadro sem rolagem lateral`);
    if (novo) {
      ok(vaga && vaga.n >= 1, `${tag}: Início mostra as próximas vagas (${vaga ? vaga.txt.join(' | ') : 'nada'})`);
      if (cel) {
        // abre em "Todos": o dia inteiro numa coluna (antes só a coluna de um consultor: 1 dos 7 horários)
        const t = await page.evaluate(() => ({ pilulas: [...document.querySelectorAll('#qdChips .pilula')].map((b) => b.textContent.trim().replace(/\s+/g, ' ')), ativa: document.querySelector('#qdChips .pilula.ativa')?.textContent.trim().replace(/\s+/g, ' '),
          cartoes: document.querySelectorAll('#qdCorpo .qd-card').length, comCons: [...document.querySelectorAll('#qdCorpo .qd-card .qd-serv')].filter((x) => /· com (Leonardo|Gabriel)/.test(x.textContent)).length }));
        medidas[tag].quadro.cartoesNaTela = t.cartoes;
        ok(/^Todos 7/.test(t.ativa || '') && t.cartoes === 7, `${tag}: Quadro no celular abre em "Todos" com os 7 horários do dia (${t.ativa}, ${t.cartoes} cartões)`);
        ok(t.comCons === 2, `${tag}: em "Todos" o cartão diz com qual consultor é (${t.comCons})`);
        ok(t.pilulas.some((x) => /^Sem consultor 5/.test(x)) && t.pilulas.some((x) => /^Leonardo 1/.test(x)), `${tag}: cada pílula mostra quantos horários tem (${t.pilulas.join(' | ')})`);
        // mover em "Todos" mantém o consultor do cartão
        await page.evaluate(() => document.querySelector('.qd-card[data-nome="Carlos Eduardo Nogueira"] [data-qd="mover"]').click());
        await page.waitForSelector('#qdCorpo .qd-cel.alvo-ok', { timeout: 8000 }); await dorme(400);
        const alvo = await page.evaluate(() => { const c = [...document.querySelectorAll('#qdCorpo .qd-cel.alvo-ok')].find((x) => !x.querySelector('.qd-card')); const s = Number(c.dataset.slot); c.click(); return s; });
        await page.waitForFunction(() => /Carlos/.test(document.getElementById("toast")?.innerText || ''), { timeout: 8000 }); await dorme(1200);
        const mov = await page.evaluate(async () => { const l = await (await fetch('/api/agendamentos?data=' + agoraSP().data)).json(); const m = l.find((x) => x.cliente_nome === "Carlos Eduardo Nogueira" && x.data === agoraSP().data); return { hora: m.hora, cons: m.consultor_nome }; });
        ok(mov.cons === "Gabriel" && mov.hora === `${String(Math.floor(alvo / 60)).padStart(2, '0')}:${String(alvo % 60).padStart(2, '0')}`, `${tag}: mover em "Todos" muda a hora e mantém o consultor (${mov.hora}, ${mov.cons})`);
        await page.evaluate(() => [...document.querySelectorAll('#toast .toast-acao')].find((x) => x.textContent.trim() === 'Desfazer')?.click()); await dorme(1500);
        // na coluna de um consultor as horas vazias que já passaram viram uma faixa
        await page.evaluate(() => [...document.querySelectorAll('#qdChips .pilula')].find((b) => /^Leonardo/.test(b.textContent.trim())).click()); await dorme(500);
        const l = await page.evaluate(() => ({ recolhidas: document.querySelectorAll('#qdCorpo [data-qd-rec]').length, linhas: document.querySelectorAll('#qdCorpo .qd-hh').length, txt: document.querySelector('#qdCorpo [data-qd-rec]')?.textContent.trim().replace(/\s+/g, ' '),
          grade: Math.round(document.querySelector('#qdCorpo .qd-grade').getBoundingClientRect().height) }));
        medidas[tag].quadro.colunaDeUmConsultor = l;
        await page.screenshot({ path: `${SAIDA}${FASE}-quadro-leonardo-${tag}.png`, fullPage: true });
        ok(l.recolhidas === 1 && l.linhas < 19 && /^08:00 às 13:00, nada marcado/.test(l.txt || ''), `${tag}: na coluna de um consultor as horas vazias que já passaram viram uma faixa (${l.linhas} linhas: "${l.txt}")`);
        await page.evaluate(() => document.querySelector('#qdCorpo [data-qd-rec]').click()); await dorme(500);
        ok(await page.evaluate(() => document.querySelectorAll('#qdCorpo .qd-hh').length === 19 && !document.querySelector('#qdCorpo [data-qd-rec]')), `${tag}: tocar na faixa mostra as 19 meias horas de novo`);
        // outro dia: nada recolhido (todas as horas servem para marcar)
        await page.evaluate(() => document.getElementById('qdProx').click()); await dorme(1800);
        ok(await page.evaluate(() => document.querySelectorAll('#qdCorpo .qd-hh').length === 19 && !document.querySelector('#qdCorpo [data-qd-rec]')), `${tag}: no dia seguinte o Quadro mostra todas as horas`);
      } else ok(q.recolhidas === 0 && q.linhas === 19, `${tag}: no computador o Quadro segue com as 19 meias horas`);
      // a vaga abre o Novo agendamento já com dia e hora
      await page.evaluate(() => route('inicio')); await page.waitForSelector('[data-r19-vaga]'); await dorme(600);
      await page.evaluate(() => document.getElementById('r19Vagas').scrollIntoView({ block: 'center' })); await dorme(300); await foto('vagas');
      const peqV = await pequenos('#r19Vagas');
      ok(!cel || !peqV.length, `${tag}: vagas com 44 px ou mais ${JSON.stringify(peqV)}`);
      const alvo = await page.evaluate(() => { const b = document.querySelector('[data-r19-vaga]'); const o = { data: b.dataset.data, hora: b.dataset.hora }; b.click(); return o; });
      await page.waitForSelector('#f_save'); await dorme(900);
      const f = await page.evaluate(() => ({ data: document.getElementById('f_data').value, hora: document.getElementById('f_hora').value }));
      ok(f.data === alvo.data && f.hora === alvo.hora, `${tag}: tocar na vaga abre o Novo agendamento em ${alvo.data} ${alvo.hora} (${f.data} ${f.hora})`);
      await page.evaluate(() => closeModal()); await dorme(400);
    }

    /* ---- 2. REMARCAR para amanhã de manhã (o cliente avisou que não vem hoje) ---- */
    await page.evaluate(() => route('inicio')); await page.waitForSelector('#agendaHoje .appt'); await dorme(900);
    let toques = 0;
    await page.evaluate(() => { const c = [...document.querySelectorAll('#agendaHoje .appt')].find((x) => /Donizetti/.test(x.textContent)); c.querySelector('[data-act="remarcar"]').click(); }); toques++;
    await page.waitForSelector('#r_salvar'); await page.waitForSelector('#r7Atalhos [data-r7-data]'); await dorme(1200);
    await foto('remarcar');
    await page.evaluate(() => document.querySelector('#r7Atalhos [data-r7-data]').click()); toques++;
    await page.waitForFunction(() => document.querySelector('#r_grade')?.dataset.data === document.getElementById('r_data').value && document.querySelector('#r_grade [data-hora]'), { timeout: 8000 }); await dorme(500);
    const r = await page.evaluate(() => { const b = [...document.querySelectorAll('#r_grade [data-hora]')].find((x) => x.dataset.hora === '09:00') || document.querySelector('#r_grade [data-hora]');
      const pe = document.querySelector('#modal .modal-foot').getBoundingClientRect(), qb = b.getBoundingClientRect(), u = [...document.querySelectorAll('#r_grade [data-hora]')].pop().getBoundingClientRect();
      return { hora: b.dataset.hora, rolagem: Math.max(0, Math.round(qb.bottom - pe.top + 8)), rolagemAteUltima: Math.max(0, Math.round(u.bottom - pe.top + 8)),
        atalhosAlt: Math.round(document.getElementById('r7Atalhos').getBoundingClientRect().height), corpo: document.querySelector('#modal .modal-body').scrollHeight }; });
    await foto('remarcar-amanha');
    await page.evaluate((h) => { const b = [...document.querySelectorAll('#r_grade [data-hora]')].find((x) => x.dataset.hora === h); b.scrollIntoView({ block: 'nearest' }); b.click(); }, r.hora); toques++;
    await dorme(500);
    const rotulo = await page.evaluate(() => document.getElementById('r_salvar').textContent.trim().replace(/\s+/g, ' '));
    await foto('remarcar-escolhido');
    ok(await semLateral(), `${tag}: Remarcar sem rolagem lateral`);
    const peq = cel ? await pequenos('#modal') : [];
    await page.evaluate(() => document.getElementById('r_salvar').click()); toques++;
    await page.waitForFunction(() => /remarcado/.test(document.getElementById('toast')?.innerText || ''), { timeout: 8000 });
    const recado = await page.$eval('#toast', (e) => e.innerText.replace(/\s+/g, ' '));
    medidas[tag].remarcar = { toques, rolagemAteAHora: r.rolagem, rolagemAteUltimaHora: r.rolagemAteUltima, alturaAtalhos: r.atalhosAlt, alturaCorpo: r.corpo, botao: rotulo, pequenos: peq };
    ok(/Donizetti: remarcado para amanhã às 09:00/i.test(recado), `${tag}: remarcou para amanhã 09:00 (${recado.slice(0, 70)})`);
    if (novo) {
      if (cel) ok(r.rolagem === 0, `${tag}: a hora de amanhã aparece sem rolar depois do atalho (faltavam ${r.rolagem}px)`);
      ok(/amanhã/i.test(rotulo) && /09:00/.test(rotulo), `${tag}: o botão diz para onde vai ("${rotulo}")`);
      if (cel) ok(!peq.length, `${tag}: toques do Remarcar com 44 px ou mais ${JSON.stringify(peq)}`);
    }
    // Desfazer volta ao que era
    await page.evaluate(() => [...document.querySelectorAll('#toast .toast-acao')].find((x) => x.textContent.trim() === 'Desfazer').click());
    await page.waitForFunction(() => /Desfeito/.test(document.getElementById('toast')?.innerText || ''), { timeout: 8000 }); await dorme(1200);
    ok(await page.evaluate(() => [...document.querySelectorAll('#agendaHoje .appt')].some((x) => /Donizetti/.test(x.textContent))), `${tag}: Desfazer devolve o Donizetti para hoje`);

    /* ---- 3. VER O DIA DE AMANHÃ ---- */
    await page.evaluate(() => route('inicio')); await page.waitForSelector('.r6b-lembretes', { timeout: 8000 }).catch(() => {}); await dorme(900);
    const am = await page.evaluate(() => { const l = [...document.querySelectorAll('[data-r19-ag]')]; const fx = document.querySelector('.r6b-lembretes');
      return { linhas: l.map((x) => x.textContent.trim().replace(/\s+/g, ' ')), faixa: fx ? Math.round(fx.getBoundingClientRect().height) : 0 }; });
    medidas[tag].amanha = am.linhas.length ? { toques: 0, linhas: am.linhas, alturaFaixa: am.faixa } : { toques: 1, obs: 'só a contagem; a lista exige abrir o Quadro e rolar', alturaFaixa: am.faixa };
    await page.evaluate(() => document.querySelector('.r6b-lembretes')?.scrollIntoView({ block: 'center' })); await dorme(300); await foto('amanha');
    if (novo) {
      ok(am.linhas.length === 2 && /08:30/.test(am.linhas[0]) && /Renata/.test(am.linhas[0]) && /14:00/.test(am.linhas[1]), `${tag}: o Início lista os horários de amanhã (${am.linhas.join(' | ')})`);
      const peqA = await pequenos('.r6b-lembretes');
      if (cel) ok(!peqA.length, `${tag}: toques da faixa de amanhã com 44 px ou mais ${JSON.stringify(peqA)}`);
      await page.evaluate(() => document.querySelector('[data-r19-ag]').click()); await page.waitForSelector('#f_save'); await dorme(700);
      ok(await page.evaluate(() => /Renata/.test(document.getElementById('f_nome').value)), `${tag}: tocar na linha abre o horário da Renata`);
      await page.evaluate(() => closeModal()); await dorme(300);
    }
    ok(await semLateral(), `${tag}: sem rolagem lateral no fim`);
    ok(erros.length === 0, `${tag}: zero erro de console${erros.length ? ' — ' + erros.slice(0, 2).join(' | ') : ''}`);
    await browser.close();
  }
} catch (e) { ok(false, 'exceção no roteiro: ' + (e && e.message)); } finally { mock.parar(); }
console.log('\nMEDIDAS ' + FASE + '\n' + JSON.stringify(medidas, null, 1));
fs.writeFileSync(`${SAIDA}${FASE}-medidas.json`, JSON.stringify(medidas, null, 1));
console.log(falhas ? `\n${falhas} conferência(s) falharam` : '\ntudo ok');
process.exit(falhas ? 1 : 0);
