// QA da Rodada 9 da Agenda, parte 2: janelas, popovers, login e modo presença no servidor de MENTIRA.
// Mede o mesmo que scripts/qa-r9-agenda.mjs (rolagem lateral, toque de 44 px, axe-core, travessão). Nada toca o banco real.
//   node scripts/qa-r9-modais.mjs [--fotos depois]
import fs from 'node:fs';
import { iniciarMock, abrirNavegador, dorme } from './qa-r7c2-lib.mjs';
import { medirTela } from './qa-r6c-lib.mjs';
const AXE = fs.readFileSync('C:/Users/USER/.claude/backups/indycar-landing/node_modules/axe-core/axe.min.js', 'utf8');
const iF = process.argv.indexOf('--fotos'); const FOTOS = iF > 0 ? process.argv[iF + 1] : null;
const SAIDA = new URL('../qa-out/r9/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
fs.mkdirSync(SAIDA, { recursive: true });
const mock = iniciarMock(Number(process.env.QA_PORTA || 3463)); await dorme(1500);
const fecha = 'if (typeof closeModal === "function") closeModal(); document.querySelectorAll(".pop-conta,.eco-pop").forEach((p) => { p.hidden = true; });';
/* cada cena: [nome, rota, js que abre, seletor que deve aparecer, papel] */
const CENAS = [
  ['novo-agendamento', 'inicio', 'openAgendamentoModal()', '#modal .modal-body'],
  ['editar-agendamento', 'agenda', 'document.querySelector(".appt [data-act=editar], .appt .act.ico")?.click()', '#modal .modal-body'],
  ['valor-ao-concluir', 'agenda', 'document.querySelector(".appt [data-act=concluido]")?.click()', '#modal .modal-body'],
  ['nao-veio', 'agenda', 'document.querySelector(".appt [data-act=nao_veio]")?.click()', '#modal .modal-body'],
  ['remarcar', 'agenda', 'abrirRemarcar(document.querySelector(".appt[data-id]")?.dataset.id)', '#modal .modal-body'],
  ['cliente-novo', 'clientes', 'openClienteModal()', '#modal .modal-body'],
  ['cliente-ficha', 'clientes', 'document.querySelector("#view table tbody tr [data-ficha], #view table tbody tr button")?.click()', '#modal .modal-body'],
  ['consultor', 'equipe', 'openConsultorModal()', '#modal .modal-body'],
  ['espera-nova', 'espera', 'openEsperaModal()', '#modal .modal-body'],
  ['whatsapp-enviar', 'followup', 'document.querySelector(".appt [data-act=whatsapp]")?.click()', '#modal .modal-body'],
  ['modelo', 'whatsapp', 'openTemplateModal()', '#modal .modal-body'],
  ['busca', 'inicio', 'abrirBuscaGlobal()', '#modal'],
  ['sino', 'inicio', 'document.getElementById("btnSino").click()', '#popSino:not([hidden])'],
  ['tarefas', 'inicio', 'document.getElementById("btnTarefas").click()', '#popTarefas:not([hidden])'],
  ['perfil', 'inicio', 'document.getElementById("avatarPerfil").click()', '#popPerfil:not([hidden])'],
  ['apps', 'inicio', 'document.getElementById("btnEco").click()', '#ecoPop:not([hidden])'],
  ['aniversarios', 'inicio', 'abrirAniversarios()', '#modal .modal-body'],
  ['login', 'inicio', 'const t = document.getElementById("telaLogin"); t.hidden = false; t.style.display = ""; document.querySelectorAll("#telaLogin form").forEach((f) => { f.hidden = f.id !== "formLogin"; })', '#formLogin'],
  ['login-primeiro', 'inicio', 'const t = document.getElementById("telaLogin"); t.hidden = false; t.style.display = ""; document.querySelectorAll("#telaLogin form").forEach((f) => { f.hidden = f.id !== "formPrimeiro"; })', '#formPrimeiro'],
  ['presenca', 'dia', '1', '#view', 'agenda'],
];
const achados = [];
try {
  for (const largura of [375, 1440]) for (const tema of ['escuro', 'claro']) {
    for (const [nome, rota, js, sel, papel] of CENAS) {
      const { browser, page } = await abrirNavegador({ largura, altura: largura < 500 ? 800 : 950 });
      const erros = []; page.on('pageerror', (e) => erros.push(String(e))); page.on('dialog', (d) => d.accept());
      try {
        await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('indycar_tema', t); localStorage.setItem('indycar_tour_quadro_v1', '1'); } catch { /* sem armazenamento */ } }, tema);
        await page.goto(mock.base + '/?tour=0' + (papel ? '&papel=' + papel : ''), { waitUntil: 'networkidle2' });
        await page.waitForSelector('.nav-item', { timeout: 20000 }); await dorme(500);
        await page.evaluate((r) => window.route(r), rota).catch(() => {}); await dorme(800);
        await page.evaluate(`(async () => { ${js} })()`).catch((e) => erros.push('abrir: ' + e.message)); await dorme(900);
        const abriu = await page.$(sel).then((e) => !!e);
        const m = await medirTela(page, { min: 44 });
        const texto = await page.evaluate((s) => { const el = document.querySelector(s); const t = (el?.closest('#modal, .pop-conta, .eco-pop, #telaLogin, #view') || document.body).innerText; return (t.match(/[^\n]{0,40} — [^\n]{0,30}/g) || []).slice(0, 8); }, sel);
        await page.evaluate(AXE);
        const axe = await page.evaluate(async () => { const r = await window.axe.run(document, { resultTypes: ['violations'] }); return r.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => ({ id: v.id, n: v.nodes.length, alvo: v.nodes.slice(0, 4).map((x) => x.target.join(' ') + ' :: ' + (x.any[0]?.message || x.failureSummary || '').slice(0, 110)) })); });
        achados.push({ largura, tema, rota: nome, abriu, rolagem: m.rolagemLateral, passando: m.passando, pequenos: largura < 500 ? m.pequenos : [], axe, travessao: texto, erros: erros.length ? erros : undefined });
        if (FOTOS && tema === 'escuro') await page.screenshot({ path: `${SAIDA}${FOTOS}-janela-${nome}-${largura}.png` });
      } catch (e) { achados.push({ largura, tema, rota: nome, abriu: false, erros: [e.message] }); }
      await browser.close();
    }
  }
} finally { mock.parar(); }
fs.writeFileSync(SAIDA + 'medida-janelas.json', JSON.stringify(achados, null, 1));
console.log('não abriram:', [...new Set(achados.filter((a) => !a.abriu).map((a) => a.rota))].join(', ') || 'nenhuma');
console.log(achados.filter((a) => a.rolagem || a.pequenos?.length || a.axe?.length || a.travessao?.length || a.erros).length, 'cena(s) com achado em', achados.length);
