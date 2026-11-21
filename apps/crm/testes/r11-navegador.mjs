// Rodada 11: jornadas de navegador que o Codex deixou pendentes na rodada 10 (cancelar o diálogo de perda,
// fechar em lote, rede caindo ao mover a etapa) e a passada por todas as abas do topo novo.
// SÓ com o servidor de mentira:  PORT=3132 npm run mock   e depois   node testes/r11-navegador.mjs [base]
// Usa o Chrome instalado (puppeteer-core da pasta indycar-ferramentas). Bloqueia todo endereço fora de 127.0.0.1.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || 'C:/Users/USER/.claude/backups/indycar-ferramentas/node_modules/puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:3132';
const espera = ms => new Promise(r => setTimeout(r, ms));
const resultados = [];
const conferir = (nome, ok, detalhe = '') => { resultados.push({ nome, ok: !!ok, detalhe }); console.log(`${ok ? 'ok ' : 'FALHOU'} · ${nome}${detalhe ? ' · ' + detalhe : ''}`); };

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
try {
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('dialog', d => d.accept());                       // confirm() do fechamento em lote
  let derrubarPatch = false;
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:')) return r.abort();
    if (derrubarPatch && r.method() === 'PATCH' && /\/api\/leads\//.test(u)) return r.abort('internetdisconnected');
    r.continue();
  });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(BASE + '/?papel=gestor', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.body.classList.contains('deslogado') && document.querySelector('#tblLeads tbody tr[data-id]'), { timeout: 20000 });
  await espera(600);

  // topo novo: as 5 abas e as telas do menu abrem sem erro
  for (const v of ['leads', 'pipeline', 'hoje', 'clientes', 'dashboard', 'equipe', 'distribuir', 'servicos']) {
    await page.evaluate(v => irPara(v), v); await espera(500);
    conferir(`abre ${v}`, await page.evaluate(v => document.querySelector('.view.active')?.id === 'view-' + v, v));
  }
  await page.evaluate(() => irPara('leads')); await espera(400);
  conferir('contagem aparece no carregamento', await page.evaluate(() => /^\d+ contatos?$/.test(document.querySelector('#leadCount').textContent)), await page.evaluate(() => document.querySelector('#leadCount').textContent));

  // 1) cancelar o diálogo "Por que perdemos?" não muda a etapa
  const alvo = await page.evaluate(() => { const l = TODOS.find(x => ['novo', 'contato', 'orcamento'].includes(x.status) && !travaLead(x)); return l && { id: String(l.id), status: l.status }; });
  await page.evaluate(id => abrirModal(id), alvo.id); await espera(700);
  await page.evaluate(() => document.querySelector('#lfEtapas [data-etapa="perdido"]').click()); await espera(400);
  conferir('diálogo de perda abre', await page.evaluate(() => document.querySelector('#dlgPerda').open));
  await page.evaluate(() => document.querySelector('#dlgPerda [data-fechar]').click()); await espera(500);
  conferir('cancelar o diálogo de perda mantém a etapa', await page.evaluate(a => !document.querySelector('#dlgPerda').open && TODOS.find(x => String(x.id) === a.id).status === a.status, alvo));
  await page.evaluate(() => fecharModal(true)); await espera(300);

  // 2) fechar em lote: dois contatos selecionados viram "Concluído"
  const ids = await page.evaluate(() => {
    const linhas = [...document.querySelectorAll('#tblLeads tbody tr[data-id]')].filter(tr => { const l = TODOS.find(x => String(x.id) === tr.dataset.id); return l && !['concluido', 'perdido'].includes(l.status) && !travaLead(l); }).slice(0, 2);
    linhas.forEach(tr => tr.querySelector('.sel-lead').click());
    return linhas.map(tr => tr.dataset.id);
  });
  await espera(300);
  conferir('barra de seleção aparece', await page.evaluate(() => !document.querySelector('#barraLote').hidden));
  await page.evaluate(() => { const s = document.querySelector('#loteStatus'); s.value = 'concluido'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await espera(1500);
  conferir('fechar em lote conclui os dois', await page.evaluate(ids => ids.every(id => TODOS.find(x => String(x.id) === id)?.status === 'concluido'), ids), ids.length + ' contatos');

  // 3) rede cai ao mover a etapa: nada se perde (fila ou aviso) e a etapa volta quando a rede volta
  const m = await page.evaluate(() => { const l = TODOS.find(x => x.status === 'novo' && !travaLead(x)); return l && String(l.id); });
  derrubarPatch = true;
  const r = await page.evaluate(async id => { try { await moverEtapa(id, 'contato'); } catch (e) { return 'erro: ' + e.message; } return 'ok'; }, m);
  await espera(800);
  const depoisQueda = await page.evaluate(id => ({ status: TODOS.find(x => String(x.id) === id)?.status, fila: !document.querySelector('#filaChip').hidden, toast: document.querySelector('#toastTxt').textContent }), m);
  conferir('rede caiu: a tela avisa (fila ou mensagem) e não trava', depoisQueda.fila || /⚠️|internet|fila|tent/i.test(depoisQueda.toast), JSON.stringify({ r, ...depoisQueda }));
  derrubarPatch = false;
  await page.evaluate(() => { document.dispatchEvent(new Event('indycar:voltou')); window.dispatchEvent(new Event('online')); });
  await espera(2500);
  const final = await page.evaluate(id => TODOS.find(x => String(x.id) === id)?.status, m);
  conferir('rede voltou: a etapa fica certa (gravada ou de volta à original)', ['contato', 'novo'].includes(final), final);

  conferir('nenhum erro de página', !erros.length, erros.join(' | '));
} finally { await browser.close(); }
const falhas = resultados.filter(x => !x.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações passaram`);
process.exit(falhas ? 1 : 0);
