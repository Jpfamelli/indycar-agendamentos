// QA da Rodada 9 da Agenda: percorre todas as telas no servidor de MENTIRA (scripts/mock-server.mjs),
// em 375 e 1440 px, claro e escuro, e mede: rolagem lateral, alvo de toque menor que 44 px, violações
// sérias do axe-core e texto fora da regra (travessão, "veículo"). Nada toca o banco real.
//   node scripts/qa-r9-agenda.mjs [--fotos antes|depois] [--rotas inicio,agenda]
import fs from 'node:fs';
import { iniciarMock, abrirNavegador, dorme } from './qa-r7c2-lib.mjs';
import { medirTela } from './qa-r6c-lib.mjs';

const AXE = fs.readFileSync('C:/Users/USER/.claude/backups/indycar-landing/node_modules/axe-core/axe.min.js', 'utf8');
const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const FOTOS = arg('fotos');
const ROTAS = (arg('rotas') || 'inicio,agenda,semana,espera,pendencias,ajuda,quadro,clientes,servicos,whatsapp,followup,crm,dono,historico,equipe,conectores,configuracoes,dia').split(',');
const SAIDA = new URL('../qa-out/r9/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
fs.mkdirSync(SAIDA, { recursive: true });
const PORTA = Number(process.env.QA_PORTA || 3461);
const mock = iniciarMock(PORTA);
await dorme(1500);
const achados = [];
try {
  for (const largura of [375, 1440]) for (const tema of ['escuro', 'claro']) {
    const { browser, page } = await abrirNavegador({ largura, altura: largura < 500 ? 800 : 950 });
    const erros = [];
    page.on('pageerror', (e) => erros.push(String(e)));
    page.on('dialog', (d) => d.accept());
    await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('indycar_tema', t); localStorage.setItem('indycar_tour_quadro_v1', '1'); } catch { /* sem armazenamento */ } }, tema);
    await page.goto(mock.base + '/?tour=0', { waitUntil: 'networkidle2' });
    await page.waitForSelector('.nav-item', { timeout: 20000 }); await dorme(600);
    for (const rota of ROTAS) {
      await page.evaluate((r) => window.route(r), rota).catch(() => {});
      await dorme(900);
      const m = await medirTela(page, { min: 44 });
      const texto = await page.evaluate(() => { const t = document.body.innerText; return { travessao: (t.match(/[^\n]{0,40}—[^\n]{0,30}/g) || []).slice(0, 8), veiculo: (t.match(/[^\n]{0,30}ve[íi]culo[^\n]{0,20}/gi) || []).slice(0, 5) }; });
      await page.evaluate(AXE);
      const axe = await page.evaluate(async () => { const r = await window.axe.run(document, { resultTypes: ['violations'] }); return r.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => ({ id: v.id, n: v.nodes.length, alvo: v.nodes.slice(0, 4).map((x) => x.target.join(' ') + ' :: ' + (x.any[0]?.message || x.failureSummary || '').slice(0, 110)) })); });
      achados.push({ largura, tema, rota, rolagem: m.rolagemLateral, passando: m.passando, pequenos: largura < 500 ? m.pequenos : [], axe, ...texto });
      if (FOTOS) await page.screenshot({ path: `${SAIDA}${FOTOS}-${rota}-${largura}-${tema}.png` });
    }
    if (erros.length) achados.push({ largura, tema, rota: '(console)', erros: erros.slice(0, 5) });
    await browser.close();
  }
} finally { mock.parar(); }
fs.writeFileSync(SAIDA + (FOTOS ? `medida-${FOTOS}.json` : 'medida.json'), JSON.stringify(achados, null, 1));
let total = 0;
for (const a of achados) {
  const linhas = [];
  if (a.rolagem) linhas.push('  ROLAGEM LATERAL ' + a.passando.join(', '));
  if (a.pequenos?.length) linhas.push('  pequenos: ' + a.pequenos.join(' | '));
  for (const v of a.axe || []) linhas.push(`  axe ${v.id} (${v.n}): ${v.alvo.join(' || ')}`);
  if (a.travessao?.length) linhas.push('  travessão: ' + a.travessao.join(' | '));
  if (a.veiculo?.length) linhas.push('  veículo: ' + a.veiculo.join(' | '));
  if (a.erros) linhas.push('  erros: ' + a.erros.join(' | '));
  if (linhas.length) { total += linhas.length; console.log(`${a.rota} ${a.largura} ${a.tema}\n${linhas.join('\n')}`); }
}
console.log(`\n${total} achado(s) em ${achados.length} medidas`);
