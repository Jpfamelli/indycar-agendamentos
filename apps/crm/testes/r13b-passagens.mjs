// Rodada 13B: as passagens do CRM para os outros apps, de ponta a ponta, com o CRM montado em /crm/ como na Central.
// SÓ com o servidor de mentira:  MOCK_PREFIXO=crm PORT=3614 npm run mock   e depois   node testes/r13b-passagens.mjs [base]
// Os outros apps (/atendimento/, /agenda/, /comunicar/, /orcador/) são respondidos aqui por uma página de mentira que
// só registra o endereço: confere que a passagem abre o lugar certo, com o cliente certo, na MESMA janela.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || 'C:/Users/USER/.claude/backups/indycar-ferramentas/node_modules/puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:3614';
const CRM = BASE + '/crm/';
const espera = ms => new Promise(r => setTimeout(r, ms));
const resultados = [];
const conferir = (nome, ok, detalhe = '') => { resultados.push({ nome, ok: !!ok }); console.log(`${ok ? 'ok ' : 'FALHOU'} · ${nome}${detalhe ? ' · ' + detalhe : ''}`); };
const OUTRO_APP = /^\/(atendimento|agenda|comunicar|orcador|trafego)\//;

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
let abasNovas = 0;
browser.on('targetcreated', t => { if (t.type() === 'page') abasNovas++; });
async function abrir(caminho = '?papel=gestor', { erroLeads = false } = {}) {
  const page = await browser.newPage();
  const erros = [], confirms = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('dialog', d => { confirms.push(d.message()); d.dismiss(); });   // "Sair mesmo assim?" -> fica
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.origin !== BASE) return r.abort();
    if (erroLeads && u.pathname === '/crm/api/leads') return r.respond({ status: 400, contentType: 'application/json', body: '{"erro":"falha de teste"}' });
    if (OUTRO_APP.test(u.pathname)) return r.respond({ status: 200, contentType: 'text/html', body: `<!doctype html><title>outro app</title><p id="alvo">${u.pathname}${u.search}</p>` });
    r.continue();
  });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(CRM + caminho, { waitUntil: 'domcontentloaded' });
  if (!erroLeads) await page.waitForFunction(() => typeof TODOS !== 'undefined' && TODOS.length && document.querySelector('.view.active'), { timeout: 20000 });
  await espera(1200);
  return { page, erros, confirms };
}
const destino = page => page.evaluate(() => location.pathname + location.search + location.hash);
async function clicarEEsperar(page, seletor) {
  const antes = abasNovas;
  await Promise.all([page.waitForNavigation({ timeout: 8000 }).catch(() => null), page.evaluate(s => document.querySelector(s).click(), seletor)]);
  return { destino: await destino(page), novaAba: abasNovas > antes };
}

try {
  // 1) ficha do contato -> Atendimento, Agenda, Comunicar
  let ctx = await abrir();
  const lead = await ctx.page.evaluate(() => { const l = TODOS.find(x => U.telE164(x.telefone)); return { id: String(l.id), tel: U.telE164(l.telefone) }; });
  for (const [rotulo, app] of [['Abrir conversa', 'atendimento'], ['Agendar', 'agenda'], ['Mandar mensagem', 'comunicar']]) {
    if (ctx.page.url().indexOf('/crm/') < 0) { await ctx.page.close(); ctx = await abrir(); }
    await ctx.page.evaluate(id => abrirModal(id), lead.id); await espera(800);
    const sel = await ctx.page.evaluate(r => { const a = [...document.querySelectorAll('#lfAcoes a')].find(x => x.textContent.includes(r)); if (!a) return null; a.id = 'alvoTeste'; return '#alvoTeste'; }, rotulo);
    if (!sel) { conferir(`ficha: "${rotulo}" existe`, false); continue; }
    const r = await clicarEEsperar(ctx.page, sel);
    conferir(`ficha → ${rotulo}: abre /${app}/ com o telefone, na mesma janela`, r.destino.startsWith(`/${app}/`) && r.destino.includes('tel=' + lead.tel) && !r.novaAba, JSON.stringify(r));
    await ctx.page.close(); ctx = await abrir();
  }

  // 2) ficha do cliente -> Agenda (horário) e Orçador (orçamento), pelos links que o servidor monta com o prefixo da Central
  const cli = await ctx.page.evaluate(() => { const l = TODOS.find(x => x.cliente_id && U.telE164(x.telefone)); return l && { id: String(l.cliente_id), tel: U.telE164(l.telefone) }; });
  if (cli) {
    for (const [rotulo, filtro, app, conferirDestino] of [
      ['Agendar', a => a.textContent.includes('Agendar'), 'agenda', d => /tel=(55)?\d{10,11}/.test(d)],
      ['orçamento da lista', a => /orcador\/#\/historico\//.test(a.getAttribute('href') || ''), 'orcador', d => /#\/historico\/\w+/.test(d)],
    ]) {
      await ctx.page.evaluate(id => abrirFichaCliente(id), cli.id); await espera(1500);
      const sel = await ctx.page.evaluate(f => { const a = [...document.querySelectorAll('#fichaCliente a')].find(new Function('a', 'return (' + f + ')(a)')); if (!a) return null; a.id = 'alvoFc'; return '#alvoFc'; }, filtro.toString());
      if (!sel) { conferir(`ficha do cliente: "${rotulo}" existe`, false); continue; }
      const r = await clicarEEsperar(ctx.page, sel);
      conferir(`ficha do cliente → ${rotulo}: /${app}/ certo, na mesma janela`, r.destino.startsWith(`/${app}/`) && conferirDestino(r.destino) && !r.novaAba, JSON.stringify(r));
      await ctx.page.close(); ctx = await abrir();
    }
  }
  // 2b) ficha do contato -> "Criar orçamento (tudo preenchido)": Orçador com o telefone e o contato
  await ctx.page.evaluate(id => abrirModal(id), lead.id); await espera(1500);
  const temOrc = await ctx.page.evaluate(() => { const b = document.querySelector('#modalBg a[data-r7a="orcamento"]'); if (!b) return false; b.id = 'alvoCriarOrc'; return true; });
  if (temOrc) {
    const r = await clicarEEsperar(ctx.page, '#alvoCriarOrc');
    conferir('ficha → Criar orçamento: /orcador/ com telefone e contato, na mesma janela', r.destino.startsWith('/orcador/') && /tel=55\d{10,11}/.test(r.destino) && /lead=/.test(r.destino) && !r.novaAba, JSON.stringify(r));
    await ctx.page.close(); ctx = await abrir();
  } else conferir('ficha: "Criar orçamento" existe', false);

  // 3) ficha com alteração não salva: sair pede confirmação e, se a pessoa desiste, fica no CRM
  await ctx.page.evaluate(id => abrirModal(id), lead.id); await espera(800);
  await ctx.page.evaluate(() => { document.querySelector('#abaDados').click(); const o = document.querySelector('#fObs'); o.value += ' anotação não salva'; o.dispatchEvent(new Event('input', { bubbles: true })); });
  await ctx.page.evaluate(() => { const a = [...document.querySelectorAll('#lfAcoes a')].find(x => x.textContent.includes('Abrir conversa')); a.click(); });
  await espera(800);
  conferir('ficha suja: pergunta antes de sair e fica no CRM ao desistir', ctx.confirms.some(m => /não foram salvas/.test(m)) && (await destino(ctx.page)).startsWith('/crm/'), JSON.stringify(ctx.confirms));
  await ctx.page.close();

  // 4) chegando no CRM por link de outro app: ?lead= e ?tel= abrem a ficha certa (a entrada continua sendo Hoje)
  ctx = await abrir(`?papel=gestor&lead=${encodeURIComponent(lead.id)}`);
  conferir('?lead= abre a ficha do contato', await ctx.page.evaluate(id => document.querySelector('#modalBg').classList.contains('open') && String(LEAD_ABERTO) === id, lead.id));
  conferir('?lead= sai da barra de endereço', !(await destino(ctx.page)).includes('lead='));
  await ctx.page.close();
  ctx = await abrir(`?papel=gestor&tel=55${lead.tel}`);
  conferir('?tel=55… (formato do Atendimento) abre a ficha do contato', await ctx.page.evaluate(t => document.querySelector('#modalBg').classList.contains('open') && U.telE164(TODOS.find(x => String(x.id) === String(LEAD_ABERTO))?.telefone) === t, lead.tel));
  conferir('?tel= não fica na barra de endereço', !(await destino(ctx.page)).includes('tel='));
  conferir('chegando por link: nenhum erro de página', !ctx.erros.length, ctx.erros.join(' | '));
  await ctx.page.close();

  // 4b) a Central abre a lista já filtrada: ?ver=sem-responsavel (ou ?filtro=…)
  for (const q of ['ver=sem-responsavel', 'filtro=sem-responsavel']) {
    ctx = await abrir(`?papel=gestor&${q}`);
    const r = await ctx.page.evaluate(() => ({ aba: document.querySelector('.view.active')?.id, resp: document.querySelector('#fResp').value, n: LEADS.length, todosSem: LEADS.every(l => !l.responsavel_id), url: location.search }));
    conferir(`?${q} abre Contatos só com os sem responsável`, r.aba === 'view-leads' && r.resp === 'sem' && r.n > 0 && r.todosSem && !/ver=|filtro=/.test(r.url), JSON.stringify(r));
    await ctx.page.close();
  }
  ctx = await abrir('?papel=gestor&ver=sem-valor');
  conferir('?ver=sem-valor abre Contatos só com os concluídos sem valor', await ctx.page.evaluate(() => document.querySelector('.view.active')?.id === 'view-leads' && LEADS.length > 0 && LEADS.every(l => CrmR13.semValor(l))));
  await ctx.page.close();
  ctx = await abrir('?papel=gestor&ver=funil');
  conferir('?ver=funil abre o Funil', await ctx.page.evaluate(() => document.querySelector('.view.active')?.id === 'view-pipeline'));
  await ctx.page.close();

  // 5) rede caindo ao abrir: Hoje diz que não carregou e oferece tentar de novo (nada de "0 contatos" falso)
  ctx = await abrir('?papel=gestor', { erroLeads: true });
  await ctx.page.waitForFunction(() => /Não consegui carregar/.test(document.querySelector('#r13Frase').textContent), { timeout: 20000 }).catch(() => null);
  conferir('erro ao carregar: Hoje avisa e tem "Tentar de novo"', await ctx.page.evaluate(() => /Não consegui carregar/.test(document.querySelector('#r13Frase').textContent) && !!document.querySelector('[data-r13-tentar]') && document.querySelector('.view.active')?.id === 'view-hoje'));
  conferir('erro ao carregar: não mostra números inventados', await ctx.page.evaluate(() => !document.querySelector('#r13Nums').textContent.trim()));
  await ctx.page.close();
} finally { await browser.close(); }
const falhas = resultados.filter(x => !x.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações passaram`);
process.exit(falhas ? 1 : 0);
