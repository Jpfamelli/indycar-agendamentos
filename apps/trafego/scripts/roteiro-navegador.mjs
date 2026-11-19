// Roteiro de navegador (rodada 4, 14/10/2026 · ampliado na rodada 5, 16/10/2026): `npm run e2e:tela`.
// Sobe o servidor de mentira (scripts/mock-server.mjs, porta própria), abre no Chrome instalado em 1440 e 375 px e
// confere: servidor acordando (503 do Render) com a faixa, a contagem e o aviso de volta; guia de conexão em passos;
// fontes do próprio app; sem rolagem lateral; axe-core (WCAG 2.1 AA) nas abas principais; sem erro de JavaScript.
// Ninguém digita senha: o mock entra já logado. Capturas em qa-out/ (fora do git).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SAIDA = path.join(raiz, 'qa-out');
fs.mkdirSync(SAIDA, { recursive: true });
const PORTA = 3419;
const BASE = `http://127.0.0.1:${PORTA}`;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const mock = spawn(process.execPath, [path.join(raiz, 'scripts', 'mock-server.mjs')], { env: { ...process.env, PORT: String(PORTA) }, stdio: 'ignore' });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(BASE + '/api/ping')).ok) break; } catch {}
  await espera(200);
}

const resultados = [];
const confere = (nome, ok, detalhe = '') => {
  resultados.push(ok);
  console.log(`${ok ? '✔' : '✖'} ${nome}${!ok && detalhe ? ' — ' + detalhe : ''}`);
};
const texto = (p) => p.evaluate(() => document.body.innerText.toLowerCase());
const semRolagemLateral = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
async function axe(p) {
  await p.evaluate(AXE);
  return p.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }, resultTypes: ['violations'] });
    return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 12).map((n) => n.target.join(' ') + ' «' + (n.any[0]?.message || '').replace(/Element has insufficient color contrast of /, '').slice(0, 110) + '»').join(' | ')}`);
  });
}

const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
try {
  for (const [w, h] of [[1440, 900], [375, 812]]) {
    const ctx = await navegador.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport({ width: w, height: h, isMobile: w < 700, hasTouch: w < 700 });
    const erros = [];
    p.on('pageerror', (e) => erros.push(String(e)));
    // Guarda todo aviso flutuante que aparecer (ele some sozinho depois de alguns segundos).
    await p.evaluateOnNewDocument(() => {
      window.__avisos = [];
      document.addEventListener('DOMContentLoaded', () => {
        const el = document.getElementById('aviso');
        if (el) new MutationObserver(() => window.__avisos.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true });
      });
    });
    const fontesExternas = [];
    p.on('request', (r) => { if (/fonts\.(googleapis|gstatic)/.test(r.url())) fontesExternas.push(r.url()); });

    // 1) Servidor acordando: as 3 primeiras chamadas de /api voltam 503 (como o Render dormindo).
    await p.goto(`${BASE}/?acordando=3`, { waitUntil: 'domcontentloaded' });
    await espera(900);
    let t = await texto(p);
    confere(`[${w}] faixa "o sistema está acordando" com contagem e "tentar agora"`, t.includes('o sistema está acordando') && t.includes('tentativa') && t.includes('tentar agora'), t.slice(0, 300));
    confere(`[${w}] nada de "erro 503" cru na tela`, !/erro 503|hibernate|service unavailable/.test(t));
    await p.screenshot({ path: path.join(SAIDA, `r4-acordando-${w}.png`) });
    confere(`[${w}] faixa sem rolagem lateral`, await semRolagemLateral(p));
    await p.evaluate(() => document.getElementById('btn-tentar-agora')?.click());
    await espera(800);
    await p.evaluate(() => document.getElementById('btn-tentar-agora')?.click());
    await espera(800);
    await p.evaluate(() => document.getElementById('btn-tentar-agora')?.click());
    await espera(2500);
    t = await texto(p);
    const faixaSumiu = await p.evaluate(() => document.getElementById('faixa-acordando').hidden);
    confere(`[${w}] servidor acordou: faixa some e o painel aparece`, faixaSumiu && (t.includes('investimento') || t.includes('painel')), t.slice(0, 300));
    const avisos = await p.evaluate(() => window.__avisos.join(' | '));
    confere(`[${w}] aviso "o sistema acordou"`, /o sistema acordou/i.test(avisos), avisos);

    // 2) Ajustes: guia de conexão em passos
    await p.evaluate(() => document.querySelector('[data-aba="ajustes"]').click());
    await espera(900);
    await p.evaluate(() => document.querySelectorAll('details.guia').forEach((d) => (d.open = true)));
    await espera(200);
    t = await texto(p);
    confere(`[${w}] guia Meta mostra o progresso (2 de 4: conta e token ok, teste com erro, token vencendo)`, /ligar a meta.*2 de 4 passos/.test(t), t.match(/ligar a meta[^\n]*/)?.[0]);
    confere(`[${w}] guia Google mostra o progresso (1 de 5 passos)`, /ligar o google ads.*1 de 5 passos/.test(t), t.match(/ligar o google[^\n]*/)?.[0]);
    confere(`[${w}] guia diz o próximo passo e oferece a mensagem pronta`, t.includes('token com a permissão ads_read') && t.includes('copiar mensagem pedindo o que falta'));
    await p.screenshot({ path: path.join(SAIDA, `r4-guia-${w}.png`), fullPage: true });
    confere(`[${w}] ajustes sem rolagem lateral`, await semRolagemLateral(p));

    // 3) Fontes do próprio app, nada do Google
    const fontes = await p.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px "DM Sans"'); });
    confere(`[${w}] fontes do próprio app carregadas, nenhuma do Google`, fontes && !fontesExternas.length, fontesExternas.join(','));

    // 4) Acessibilidade nas abas principais
    for (const aba of ['painel', 'leads', 'resultados', 'campanhas', 'radar', 'ajustes']) {
      await p.evaluate((a) => document.querySelector(`[data-aba="${a}"]`).click(), aba);
      await espera(900);
      const v = await axe(p);
      confere(`[${w}] axe sem violação séria/crítica em ${aba}`, !v.length, v.join(' ;; '));
    }

    // 5) Rodada 5: leads do anúncio ao CRM, campanhas × CRM, interruptor de regra, fila do Comunicar, busca, atalhos, modo sem chaves
    await p.evaluate(() => document.querySelector('[data-aba="painel"]').click());
    await espera(900);
    t = await texto(p);
    confere(`[${w}] painel: cartão "leads de hoje" e faixa de modo demonstração (sem chaves)`, t.includes('leads de hoje no crm') && t.includes('modo demonstração'));
    confere(`[${w}] selo "demo" no título enquanto não há chave real`, await p.evaluate(() => !document.getElementById('selo-demo').hidden));
    await p.evaluate(() => document.querySelector('[data-aba="leads"]').click());
    await espera(1200);
    const linhasLeads = await p.evaluate(() => document.querySelectorAll('.tabela-leads tbody tr').length);
    confere(`[${w}] aba leads: tabela com links CRM/WhatsApp/Agenda e URL com ?aba=leads`, linhasLeads > 3 && (await p.evaluate(() => location.search.includes('aba=leads') && !!document.querySelector('.acoes-lead a[href*="?lead="]'))));
    await p.screenshot({ path: path.join(SAIDA, `r5-leads-${w}.png`), fullPage: w > 700 });
    confere(`[${w}] leads sem rolagem lateral`, await semRolagemLateral(p));
    await p.select('#leads-canal', 'site');
    await espera(700);
    confere(`[${w}] filtro por canal (site) deixa só leads do site`, await p.evaluate(() => [...document.querySelectorAll('.tabela-leads tbody tr .selo-canal')].every((s) => s.textContent === 'Site')));
    await p.select('#leads-canal', '');
    await p.select('#leads-ordem', 'nome');
    await espera(700);
    confere(`[${w}] ordem "Nome A–Z" reordena a lista`, await p.evaluate(() => { const n = [...document.querySelectorAll('.tabela-leads tbody th')].map((t) => t.firstChild.textContent.trim()); return n.length > 2 && n[0].localeCompare(n[n.length - 1], 'pt-BR') <= 0; }));
    await p.evaluate(() => document.querySelector('#lista-leads [data-leads-status]').click());
    await espera(700);
    confere(`[${w}] chip de status filtra a lista`, await p.evaluate(() => document.getElementById('leads-status').value !== '' && [...document.querySelectorAll('.tabela-leads tbody tr')].length > 0));
    await p.evaluate(() => document.querySelector('[data-tarefa-lead]').click());
    await espera(400);
    confere(`[${w}] "Tarefa" abre Minhas tarefas com o título pronto e o lead ligado`, await p.evaluate(() => document.getElementById('modal-tarefas').open && /^Ligar para /.test(document.getElementById('tarefa-titulo').value) && !!document.getElementById('tarefa-titulo').dataset.leadId));
    await p.evaluate(() => document.getElementById('modal-tarefas').close());
    await p.evaluate(() => document.getElementById('leads-limpar').click());
    await espera(600);
    // Rodada 6: ciclo anúncio -> orçamento -> pátio
    confere(`[${w}] leads: chips do Orçador e do Pátio abrem a tela deles (links com #/historico e ?os=)`, await p.evaluate(() => !!document.querySelector('.chips-ciclo a[href*="#/historico/"]') && !!document.querySelector('.chips-ciclo a[href*="?os="]')));
    confere(`[${w}] leads: link para o CRM abre na Central (/crm/) e a placa aparece`, await p.evaluate(() => !!document.querySelector('.acoes-lead a[href*="/crm/?lead="]') && !!document.querySelector('.placa')));
    await p.select('#leads-etapa', 'patio');
    await espera(800);
    confere(`[${w}] filtro "carro no pátio agora" deixa só leads com chip do Pátio`, await p.evaluate(() => { const l = [...document.querySelectorAll('.tabela-leads tbody tr')]; return l.length > 0 && l.every((tr) => tr.querySelector('.chip-patio-agora')); }));
    confere(`[${w}] leads sem rolagem lateral com os chips`, await semRolagemLateral(p));
    await p.screenshot({ path: path.join(SAIDA, `r6-leads-ciclo-${w}.png`), fullPage: w > 700 });
    await p.select('#leads-etapa', '');
    await p.evaluate(() => document.querySelector('[data-aba="painel"]').click());
    await espera(900);
    confere(`[${w}] painel: cartão "Oficina agora" com carros e orçamentos`, await p.evaluate(() => { const b = document.getElementById('bloco-oficina'); return /Carros no pátio/.test(b.textContent) && !!b.querySelector('a[href*="?os="]'); }));
    await p.evaluate(() => document.querySelector('[data-aba="resultados"]').click());
    await espera(1200);
    confere(`[${w}] resultados: cartão "Do anúncio ao carro entregue" com custo por carro`, await p.evaluate(() => { const c = document.getElementById('crm-ciclo'); return /Custo por carro/.test(c.textContent) && c.querySelectorAll('tbody tr').length > 0; }));
    confere(`[${w}] resultados: "ver os leads" do aviso do ciclo abre a aba Leads filtrada`, await p.evaluate(async () => { const b = document.querySelector('#crm-ciclo [data-leads-etapa]'); if (!b) return true; b.click(); await new Promise((r) => setTimeout(r, 400)); return document.getElementById('leads-etapa').value === b.dataset.leadsEtapa && !document.getElementById('aba-leads').hidden; }));
    await p.screenshot({ path: path.join(SAIDA, `r6-ciclo-${w}.png`), fullPage: false });
    await p.evaluate(() => document.getElementById('leads-limpar').click());
    await espera(500);
    await p.evaluate(() => document.querySelector('[data-aba="campanhas"]').click());
    await espera(1000);
    confere(`[${w}] campanhas: 7 colunas do CRM e da oficina com números`, await p.evaluate(() => document.querySelectorAll('#tabela-campanhas thead .col-crm').length === 7 && [...document.querySelectorAll('#tabela-campanhas tbody .col-crm')].some((td) => /\d/.test(td.textContent))));
    await p.evaluate(() => document.querySelector('[data-aba="radar"]').click());
    await espera(1000);
    const antes = await p.evaluate(() => document.querySelector('[data-ativa]').getAttribute('aria-checked'));
    await p.evaluate(() => document.querySelector('[data-ativa]').click());
    await espera(900);
    confere(`[${w}] radar: interruptor liga/desliga a regra sem abrir o modal`, antes !== (await p.evaluate(() => document.querySelector('[data-ativa]').getAttribute('aria-checked'))));
    await p.select('#filtro-severidade', 'critico');
    await espera(700);
    confere(`[${w}] radar: filtro de severidade`, await p.evaluate(() => document.querySelectorAll('#lista-alertas .alerta').length === 1));
    await p.evaluate(() => document.querySelector('[data-aba="relatorios"]').click());
    await espera(800);
    await p.evaluate(() => document.getElementById('btn-previa').click());
    await espera(900);
    confere(`[${w}] relatórios: prévia mostra "Copiar texto" e o histórico tem "ver texto"`, await p.evaluate(() => !document.getElementById('btn-copiar-relatorio').hidden && !document.getElementById('previa-relatorio').hidden));
    await p.evaluate(() => document.querySelector('[data-aba="ajustes"]').click());
    await espera(1200);
    t = await texto(p);
    confere(`[${w}] ajustes: canal de envio = fila do Comunicar, guia "onde pegar cada chave"`, t.includes('fila do comunicar') && t.includes('onde pegar cada chave'));
    confere(`[${w}] ajustes: chave da Meta marcada como recusada; faixa do vigia lista o 2º problema`, t.includes('chave recusada') && t.includes('também em aberto'));
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    await p.keyboard.press('1');
    await espera(500);
    confere(`[${w}] atalho "1" abre o painel`, await p.evaluate(() => !document.getElementById('aba-painel').hidden));
    await p.keyboard.down('Control'); await p.keyboard.press('k'); await p.keyboard.up('Control');
    await espera(300);
    confere(`[${w}] Ctrl+K abre a busca global`, await p.evaluate(() => document.getElementById('modal-busca').open));
    await p.type('#busca-q', 'suspens');
    await espera(900);
    const busca = await p.evaluate(() => document.getElementById('busca-lista').innerText.toLowerCase());
    confere(`[${w}] busca acha campanha e lead pelo nome`, busca.includes('campanha') && busca.includes('lead'), busca.slice(0, 200));
    await p.keyboard.press('Escape');
    await espera(200);
    await p.keyboard.press('?');
    await espera(300);
    confere(`[${w}] "?" abre a ajuda com a lista de atalhos`, await p.evaluate(() => document.getElementById('modal-ajuda').open && document.querySelectorAll('#lista-atalhos li').length > 10));
    await p.keyboard.press('Escape');
    await p.keyboard.press('t');
    await espera(200);
    confere(`[${w}] "t" troca para o tema claro`, await p.evaluate(() => document.documentElement.getAttribute('data-tema') === 'claro'));
    await p.screenshot({ path: path.join(SAIDA, `r5-claro-${w}.png`) });
    await p.keyboard.press('t');
    confere(`[${w}] sem erro de JavaScript`, !erros.length, erros.join(' | '));
    await ctx.close();
  }

  // 4b) Rodada 7: fila "o que fazer agora", alertas que viram ação, do teste ao real, fechamento do mês
  for (const [w, h] of [[1440, 900], [375, 812]]) {
    const ctx = await navegador.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport({ width: w, height: h, isMobile: w < 700, hasTouch: w < 700 });
    const erros = [];
    p.on('pageerror', (e) => erros.push(String(e)));
    await p.evaluateOnNewDocument(() => {
      window.__abertas = [];
      window.open = (u, n) => { window.__abertas.push([u, n]); return null; };
      window.__avisos = [];
      document.addEventListener('DOMContentLoaded', () => {
        const el = document.getElementById('aviso');
        if (el) new MutationObserver(() => window.__avisos.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true });
      });
    });
    await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await espera(2500);
    confere(`[${w}] r7 painel: cartão "O que fazer agora" com clientes e frase-resumo`, await p.evaluate(() => document.querySelectorAll('#bloco-acoes .acao').length > 0 && /esperando você/.test(document.getElementById('bloco-acoes').innerText)));
    confere(`[${w}] r7 painel: cada item tem motivo e botões`, await p.evaluate(() => [...document.querySelectorAll('#bloco-acoes .acao')].every((a) => a.querySelector('.mini') && a.querySelector('button'))));
    await p.evaluate(() => document.querySelector('#bloco-acoes [data-abrir-app]').click());
    const abertas = await p.evaluate(() => window.__abertas);
    confere(`[${w}] r7 painel: o botão abre o app na aba nomeada dele`, abertas.length === 1 && /^indycar-(crm|atendimento|orcador|patio|agenda)$/.test(abertas[0][1]), JSON.stringify(abertas));
    await p.evaluate(() => document.querySelector('#bloco-acoes [data-acao-filtro]').click());
    await espera(200);
    const tipos = await p.evaluate(() => new Set([...document.querySelectorAll('#bloco-acoes .acao[data-tipo]')].map((x) => x.dataset.tipo)).size);
    confere(`[${w}] r7 painel: o chip filtra a fila por tipo`, tipos === 1, String(tipos));
    await p.evaluate(() => document.querySelector('#bloco-acoes [data-acao-filtro]').click());
    await p.evaluate(() => document.querySelector('#bloco-acoes [data-copiar-texto]')?.click());
    await espera(400);
    confere(`[${w}] r7 painel: "copiar recado" responde (copiou ou explicou)`, await p.evaluate(() => window.__avisos.some((a) => /recado copiado|não consegui copiar/i.test(a))));
    confere(`[${w}] r7 painel: sem rolagem lateral`, await semRolagemLateral(p));
    await p.evaluate(() => document.getElementById('cartao-acoes').scrollIntoView());
    await p.screenshot({ path: path.join(SAIDA, `r7-acoes-${w}.png`) });
    const v = await axe(p);
    confere(`[${w}] r7 painel: axe sem violação séria`, !v.length, v.join(' || ').slice(0, 400));

    const nAntes = await p.evaluate(() => document.querySelectorAll('#bloco-acoes .acao').length);
    await p.evaluate(() => document.querySelector('#bloco-acoes [data-acao-tratei]').click());
    await espera(300);
    confere(`[${w}] r7 painel: "Já tratei" esconde o item e avisa quantos estão escondidos`, await p.evaluate((n) => document.querySelectorAll('#bloco-acoes .acao').length <= n && /marcado\(s\) como tratado\(s\) hoje/.test(document.getElementById('bloco-acoes').innerText), nAntes));
    await p.evaluate(() => document.querySelector('#bloco-acoes [data-acoes-tratados]').click());
    await espera(200);
    confere(`[${w}] r7 painel: "mostrar" traz o item de volta`, await p.evaluate((n) => document.querySelectorAll('#bloco-acoes .acao').length === n, nAntes));
    await p.evaluate(() => { document.querySelector('#bloco-acoes [data-acoes-tratados]').click(); try { localStorage.clear(); } catch {} });
    await p.evaluate(() => document.getElementById('acoes-csv').click());
    await espera(600);
    confere(`[${w}] r7 painel: "Baixar CSV" da fila responde`, await p.evaluate(() => window.__avisos.some((a) => /CSV da fila baixado/i.test(a))));
    await p.keyboard.down('Control'); await p.keyboard.press('k'); await p.keyboard.up('Control');
    await espera(300);
    await p.type('#busca-q', 'desconto');
    await espera(500);
    confere(`[${w}] r7 busca: a fila "o que fazer agora" aparece no Ctrl+K`, await p.evaluate(() => /pediu desconto/i.test(document.getElementById('busca-lista').innerText)));
    await p.keyboard.press('Escape');
    await p.evaluate(() => document.querySelector('[data-aba="leads"]').click());
    await espera(900);
    await p.evaluate(() => { document.getElementById('leads-quando').value = '30'; document.getElementById('leads-etapa').value = 'orc_quente'; document.getElementById('leads-etapa').dispatchEvent(new Event('change', { bubbles: true })); });
    await espera(1200);
    confere(`[${w}] r7 leads: filtro "Abriu o orçamento e não respondeu" só mostra leads com o sinal`, await p.evaluate(() => { const l = [...document.querySelectorAll('#lista-leads .chips-ciclo')]; return l.length > 0 && l.every((c) => /sem resposta/.test(c.innerText)); }));
    confere(`[${w}] r7 leads: KPIs "Abriram e não responderam" e "Pediram desconto"`, await p.evaluate(() => /abriram e não responderam/i.test(document.getElementById('leads-kpis').innerText) && /pediram desconto/i.test(document.getElementById('leads-kpis').innerText)));
    await p.evaluate(() => { document.getElementById('leads-etapa').value = ''; document.getElementById('leads-etapa').dispatchEvent(new Event('change', { bubbles: true })); });
    confere(`[${w}] r7 painel: o pino do Painel mostra quantos esperam o consultor`, await p.evaluate(() => { const n = document.getElementById('pino-acoes'); return !n.hidden && Number(n.textContent) > 0; }));
    await p.evaluate(() => document.querySelector('[data-aba="radar"]').click());
    await espera(600);
    confere(`[${w}] r7 painel: o pino continua visível em outra aba`, await p.evaluate(() => !document.getElementById('pino-acoes').hidden));
    await p.keyboard.down('Control'); await p.keyboard.press('k'); await p.keyboard.up('Control');
    await espera(300);
    await p.type('#busca-q', 'fechamento');
    await espera(500);
    confere(`[${w}] r7 busca: a ação "Fechamento do mês" existe e abre Relatórios com o texto gerado`, await p.evaluate(async () => {
      const el = [...document.querySelectorAll('#busca-lista [role="option"], #busca-lista li, #busca-lista button')].find((x) => /fechamento do mês/i.test(x.innerText));
      if (!el) return false;
      el.click();
      await new Promise((r) => setTimeout(r, 1200));
      return !document.getElementById('aba-relatorios').hidden && !document.getElementById('fech-texto').hidden;
    }));
    await p.evaluate(() => document.getElementById('fech-csv').click());
    await espera(600);
    confere(`[${w}] r7 relatórios: CSV do fechamento baixa`, await p.evaluate(() => window.__avisos.some((a) => /CSV do fechamento baixado/i.test(a))));
    await p.evaluate(() => document.querySelector('[data-aba="ajustes"]').click());
    await espera(1000);
    confere(`[${w}] r7 ajustes: o passo que falta tem botão que leva à aba certa`, await p.evaluate(async () => { const b = document.querySelector('#bloco-preparo [data-ir-aba]'); if (!b) return false; b.click(); await new Promise((r) => setTimeout(r, 300)); return !document.getElementById('aba-' + b.dataset.irAba).hidden; }));
    await p.evaluate(() => document.querySelector('[data-aba="radar"]').click());
    await espera(1000);
    confere(`[${w}] r7 radar: alerta do ciclo tem botão "Ver quem está esperando"`, await p.evaluate(() => [...document.querySelectorAll('#lista-alertas [data-acao-alerta]')].some((b) => /quem está esperando/i.test(b.textContent))));
    await p.evaluate(() => [...document.querySelectorAll('#lista-alertas [data-acao-alerta]')].find((b) => /quem está esperando/i.test(b.textContent)).click());
    await espera(500);
    confere(`[${w}] r7 radar: o botão leva ao Painel`, await p.evaluate(() => !document.getElementById('aba-painel').hidden));
    await p.evaluate(() => document.querySelector('[data-aba="radar"]').click());
    await espera(600);
    await p.evaluate(() => [...document.querySelectorAll('#lista-alertas [data-acao-alerta]')].find((b) => /campanha/i.test(b.textContent)).click());
    await espera(400);
    confere(`[${w}] r7 radar: alerta de campanha leva à aba Campanhas filtrada`, await p.evaluate(() => !document.getElementById('aba-campanhas').hidden && document.getElementById('busca-campanhas').value.length > 0));

    await p.evaluate(() => document.querySelector('[data-aba="resultados"]').click());
    await espera(1500);
    confere(`[${w}] r7 resultados: linha da qualidade da ligação`, await p.evaluate(() => /ligação/i.test(document.getElementById('ciclo-ligacao').innerText)));
    confere(`[${w}] r7 resultados: "Depois do orçamento" e aviso de investimento de demonstração`, await p.evaluate(() => /depois do orçamento/i.test(document.getElementById('crm-ciclo').innerText) && /demonstração/i.test(document.getElementById('crm-ciclo').innerText)));
    confere(`[${w}] r7 resultados: o aviso mostra nomes e abre o lead na aba do CRM`, await p.evaluate(() => { const b = document.querySelector('#crm-ciclo [data-abrir-app]'); if (!b) return false; window.__abertas.length = 0; b.click(); return window.__abertas[0]?.[1] === 'indycar-crm'; }));

    await p.evaluate(() => document.querySelector('[data-aba="relatorios"]').click());
    await espera(800);
    await p.evaluate(() => document.getElementById('fech-gerar').click());
    await espera(900);
    confere(`[${w}] r7 relatórios: fechamento do mês gerado, com botão de copiar`, await p.evaluate(() => !document.getElementById('fech-texto').hidden && /fechamento/i.test(document.getElementById('fech-texto').textContent) && !document.getElementById('fech-copiar').hidden));
    await p.evaluate(() => document.getElementById('fech-enviar').click());
    await espera(700);
    confere(`[${w}] r7 relatórios: envio do fechamento com investimento de demonstração é recusado com frase`, await p.evaluate(() => window.__avisos.some((a) => /demonstração/i.test(a))));
    await p.evaluate(() => { document.getElementById('fech-mes').value = '2999-01'; document.getElementById('fech-gerar').click(); });
    await espera(700);
    confere(`[${w}] r7 relatórios: mês futuro vira frase, não erro`, await p.evaluate(() => /mês que já começou/i.test(document.getElementById('fech-estado').textContent)));

    await p.evaluate(() => document.querySelector('[data-aba="ajustes"]').click());
    await espera(1200);
    confere(`[${w}] r7 ajustes: "Do teste ao real" diz demonstração e mostra o passo da Meta`, await p.evaluate(() => { const t = document.getElementById('bloco-preparo').innerText.toLowerCase(); return t.includes('demonstração') && t.includes('conectar meta'); }));
    confere(`[${w}] r7 ajustes: sem rolagem lateral`, await semRolagemLateral(p));
    await p.screenshot({ path: path.join(SAIDA, `r7-preparo-${w}.png`) });
    confere(`[${w}] r7 sem erro de JavaScript`, !erros.length, erros.join(' | '));
    await ctx.close();
  }

  // 4c) Rodada 7: Orçador/Pátio fora do ar -> a fila diz isso e o resto do painel segue
  {
    const ctx = await navegador.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport({ width: 1440, height: 900 });
    await p.setRequestInterception(true);
    p.on('request', (rq) => { if (rq.url().includes('/api/acoes')) rq.continue({ url: rq.url() + (rq.url().includes('?') ? '&' : '?') + 'falha=1' }); else rq.continue(); });
    await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await espera(2500);
    confere('[r7] Orçador/Pátio fora: a fila avisa em frase e os KPIs do painel aparecem', await p.evaluate(() => /não responderam/i.test(document.getElementById('bloco-acoes').innerText) && document.querySelectorAll('.cartoes .kpi').length > 0));
    await ctx.close();
  }

  // 5) Tela de entrar com o servidor acordando (config-publica volta 503 duas vezes)
  {
    const ctx = await navegador.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await p.goto(`${BASE}/?logado=0&acordando=2`, { waitUntil: 'domcontentloaded' });
    await espera(900);
    const t1 = await texto(p);
    confere('[login] a tela de entrar também mostra "acordando"', t1.includes('o sistema está acordando'), t1.slice(0, 200));
    await p.evaluate(() => document.getElementById('btn-tentar-agora')?.click());
    await espera(700);
    await p.evaluate(() => document.getElementById('btn-tentar-agora')?.click());
    await espera(1500);
    const t2 = await texto(p);
    confere('[login] depois que acorda, aparece o formulário de entrar', t2.includes('e-mail') && t2.includes('senha') && !t2.includes('o sistema está acordando'), t2.slice(0, 300));
    await ctx.close();
  }

  // 6) Rodada 5: com chave real colada, a faixa e o selo de demonstração somem
  {
    const ctx = await navegador.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport({ width: 1440, height: 900 });
    await p.goto(`${BASE}/?chaves=1`, { waitUntil: 'domcontentloaded' });
    await espera(1500);
    confere('[chaves] com chave real a faixa e o selo "demo" somem', await p.evaluate(() => document.getElementById('faixa-demo').hidden && document.getElementById('selo-demo').hidden));
    await ctx.close();
  }
} finally {
  await navegador.close();
  mock.kill();
}
const falhas = resultados.filter((x) => !x).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} conferências ok. Capturas em ${SAIDA}`);
process.exit(falhas ? 1 : 0);
