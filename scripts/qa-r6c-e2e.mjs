// QA ponta a ponta (C1c): Casa (servidor local, banco de mentira) -> botão "Marcar" -> Agenda (servidor de mentira) abre o horário NOVO
// já com o cliente e avisa que ele tem horário; "Orçar" leva ao Orçador com telefone 55…; nada disso toca o banco real.
//   node scripts/qa-r6c-e2e.mjs   (precisa da Casa em PORT=3077: PORT=3077 AUTOMACOES=0 node central.js)
import { spawn } from 'node:child_process';
import { cenario, conf, fim, dorme, SAIDA, iso } from './qa-r6c-lib.mjs';

const PORT = 3095, MOCK = `http://localhost:${PORT}`;
const srv = spawn(process.execPath, ['scripts/mock-server.mjs'], { cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const PID = srv.pid;
const amanha = (() => { const d = new Date(); do { d.setUTCDate(d.getUTCDate() + 1); } while ([0, 6].includes(d.getUTCDay())); return d.toISOString().slice(0, 10); })();
try {
  await dorme(1200);
  await cenario('gestor', 1280, async ({ page, browser }) => {
    await page.waitForSelector('#cOrc .wa-agenda', { timeout: 20000 });
    const marcar = await page.$eval('#cOrc .wa-agenda', (a) => ({ href: a.getAttribute('href'), alvo: a.getAttribute('target') }));
    conf(marcar.alvo === 'indycar-agenda', 'E2E: o "Marcar" da Casa abre a aba nomeada indycar-agenda');
    const consulta = new URL(marcar.href, 'https://central.test').search;
    conf(/novo=1/.test(consulta) && /tel=5512977776666/.test(consulta), 'E2E: o link da Casa leva "novo=1" e o telefone do cliente (' + consulta + ')');
    // a Agenda (mock) recebe exatamente essa consulta
    const p2 = await browser.newPage();
    await p2.setViewport({ width: 1280, height: 900 });
    const erros = []; p2.on('pageerror', (e) => erros.push(String(e)));
    p2.on('dialog', (d) => d.accept());
    await p2.goto(MOCK + '/', { waitUntil: 'networkidle2' });
    await p2.waitForSelector('.nav-item', { timeout: 20000 });
    const api = (m, r, c) => p2.evaluate(async (m, r, c) => { const x = await fetch(r, { method: m, headers: { 'Content-Type': 'application/json' }, body: c ? JSON.stringify(c) : undefined }); return x.json().catch(() => null); }, m, r, c);
    await api('POST', '/api/__reset', {});
    await api('POST', '/api/agendamentos', { cliente_nome: 'Caio Prado', servico: 'Freios', data: amanha, hora: '10:00', telefone: '12977776666', veiculo: 'Gol', placa: 'GOL1A11' });
    await p2.evaluate(() => { try { localStorage.setItem('indycar_tour_visto', '1'); localStorage.setItem('indycar_tour_quadro_v1', '1'); } catch {} });
    await p2.goto(MOCK + '/' + consulta + '&tour=0', { waitUntil: 'networkidle2' });
    await p2.waitForSelector('#f_nome', { timeout: 20000 }); await dorme(1500);
    const f = await p2.evaluate(() => Object.fromEntries(['f_nome', 'f_tel', 'f_veic', 'f_placa'].map((k) => [k, document.getElementById(k).value])));
    conf(soDig(f.f_tel) === '12977776666', 'E2E: a Agenda abre o NOVO horário com o telefone já preenchido (' + f.f_tel + ')');
    conf(f.f_nome === 'Caio Prado' && f.f_veic === 'Gol', 'E2E: e puxa nome e carro do cadastro (' + JSON.stringify(f) + ')');
    const ctx = await p2.$eval('#f_ctx6c', (e) => e.innerText).catch(() => '');
    conf(/Já tem um horário marcado/.test(ctx), 'E2E: o aviso de contexto diz que o Caio já tem horário (' + ctx.replace(/\s+/g, ' ').slice(0, 80) + ')');
    const href = await p2.evaluate(() => (location.search || '') + (location.hash || ''));
    conf(!/tel=/.test(href), 'E2E: o telefone sai da barra de endereço depois de usado (' + href + ')');
    await p2.screenshot({ path: SAIDA + 'c1c-e2e-agenda.png' });
    conf(erros.length === 0, 'E2E: Agenda sem erro de JS' + (erros.length ? ' → ' + erros[0] : ''));
    await p2.close();
  }, { ajustar: (e) => {
    const a = e.rpc.r6_agora;
    a.orcamentos.aprovados_sem_horario_total = 1;
    a.orcamentos.aprovados_sem_horario = [{ id: '44444444-4444-4444-8444-444444444499', numero: 20, cliente: 'Caio Prado', telefone_55: '5512977776666', total: 900, decidido_em: iso(300) }];
  } });
} finally { try { process.kill(PID); } catch { /* já saiu */ } }
function soDig(t) { return String(t || '').replace(/\D/g, ''); }
fim();
