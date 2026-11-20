// Casa no Chrome de verdade (rodada 9): fotos e medidas em 1440 e 375 px, escuro e claro, com o Supabase de MENTIRA
// (tests/r9-casa-mock/). Nada sai para a rede: a página é servida pela interceptação do Chrome (porta 3520 só no nome,
// nenhum servidor sobe) e qualquer endereço de fora recebe resposta vazia; só as fontes do Google passam, para a foto
// do "antes" sair com a letra de antes.
//
//   node tests/r9-casa-browser.mjs                  → mede a Casa desta cópia (casa/) e guarda em qa-out/r9/depois/
//   node tests/r9-casa-browser.mjs --antes <pasta>  → mede a Casa de <pasta>/casa (ex.: `git archive 8b336c6 casa`) em qa-out/r9/antes/
//   CASA_AXE_PATH=<axe.min.js> liga o axe-core (violações sérias e críticas no relatório).
//   --so <nome,nome> roda só esses cenários.
//
// Cada cenário grava <nome>.png e o relatório geral relatorio.json: rolagem lateral, alvos de toque menores que 44 px,
// travessão e palavras proibidas no texto visível, erros de JavaScript e (com axe) as violações.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');
const puppeteer = require(resolve(RAIZ, '../indycar-ferramentas/node_modules/puppeteer-core'));
const args = process.argv.slice(2);
const pega = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const ANTES = pega('--antes');
const SO = (pega('--so') || '').split(',').filter(Boolean);
const FONTE = ANTES ? resolve(ANTES) : RAIZ;
const ROTULO = ANTES ? 'antes' : 'depois';
const SAIDA = resolve(RAIZ, 'qa-out/r9', ROTULO);
const BASE = 'http://localhost:3520';
const AXE = process.env.CASA_AXE_PATH && existsSync(process.env.CASA_AXE_PATH) ? process.env.CASA_AXE_PATH : null;
const MOCK = readFileSync(join(AQUI, 'r9-casa-mock/dados.js'), 'utf8') + '\n' + readFileSync(join(AQUI, 'r9-casa-mock/supabase-falso.js'), 'utf8');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
mkdirSync(SAIDA, { recursive: true });

/* o que a tela não pode ter (texto para gente): travessão e as palavras que o recado proíbe */
const PROIBIDO = [[/\u2014/, 'travessão'], [/\bve[íi]culos?\b/i, 'veículo'], [/\befetu/i, 'efetuar'], [/\bprezad/i, 'prezado'], [/\bcompare[cç]/i, 'comparecer'], [/\bleads?\b/i, 'lead']];

const CENARIOS = [
  { nome: 'entrada', cenario: { papel: 'admin', sessao: false }, larguras: [1440, 375] },
  { nome: 'casa', cenario: { papel: 'admin' }, larguras: [1440, 375], espera: ['WhatsApp recusado há', 'Urgente', 'Gere uma chave nova no CodeWords'] },
  { nome: 'dono', cenario: { papel: 'admin' }, larguras: [1440, 375], acao: 'dono', espera: ['Contatos que agendaram'] },
  { nome: 'sino', cenario: { papel: 'admin' }, larguras: [1440, 375], acao: 'sino', espera: ['não lido'] },
  { nome: 'busca', cenario: { papel: 'admin' }, larguras: [1440, 375], acao: 'busca' },
  { nome: 'ficha', cenario: { papel: 'admin' }, larguras: [1440, 375], acao: 'ficha' },
  { nome: 'falha', cenario: { papel: 'admin', falhar: ['r6_agora', 'notificacoes', 'tarefas', 'r7_c1_saude_sistemas', 'vigia_avisos_abertos', 'r6_c1c_manha'] }, larguras: [1440, 375], espera: ['Não consegui ler as tarefas agora'] },
  { nome: 'falhaop', cenario: { papel: 'admin', falhar: ['r6_agora', 'tarefas'] }, larguras: [375], acao: 'operacao', espera: ['sem dado', 'não deu para ler agora'] },
  { nome: 'sinofalha', cenario: { papel: 'admin', falhar: ['notificacoes'] }, larguras: [375], acao: 'sino', espera: ['Não consegui ler os avisos agora', 'tentar de novo'] },
  { nome: 'vazio', cenario: { papel: 'admin', vazio: true, zap: 'ok' }, larguras: [1440, 375], espera: ['Nenhum fechamento com valor nos últimos 7 dias', 'Ainda sem faturamento marcado neste mês'] },
  { nome: 'foradoar', cenario: { papel: 'admin', foraDoAr: ['patio', 'orcador'] }, larguras: [1440, 375], espera: ['verificar de novo'] },
  { nome: 'atendente', cenario: { papel: 'atendente', zap: 'ok' }, larguras: [375] },
  { nome: 'recepcao', cenario: { papel: 'agenda', zap: 'ok' }, larguras: [375] },
  { nome: 'mecanico', cenario: { papel: 'mecanico', zap: 'ok' }, larguras: [375] },
].filter((c) => !SO.length || SO.includes(c.nome));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  userDataDir: resolve(RAIZ, 'qa-out/r9/perfil-chrome'), args: ['--no-sandbox', '--disable-background-networking'],
});
const relatorio = { rotulo: ROTULO, fonte: FONTE, quando: new Date().toISOString(), cenarios: [] };

async function medir(page, largura) {
  return page.evaluate((largura, proibido) => {
    const visivel = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const nome = (el) => el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (el.textContent ? ' "' + el.textContent.trim().slice(0, 24) + '"' : '');
    const pequenos = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, summary, [tabindex="0"]')]
      .filter(visivel).filter((el) => !el.closest('[hidden]')).map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => (r.width < 43.5 || r.height < 43.5) && !(el.tagName === 'A' && el.closest('p, .dono-nota, small')))
      // caixinha de marcar dentro de um rótulo de 44 px: o alvo de toque é o rótulo inteiro
      .filter(({ el }) => { const l = el.type === 'checkbox' && el.closest('label'); return !(l && l.getBoundingClientRect().height >= 43.5); })
      .map(({ el, r }) => `${nome(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    const texto = document.body.innerText;
    const achados = proibido.map(([re, rot]) => [new RegExp(re.slice(1, re.lastIndexOf('/')), re.slice(re.lastIndexOf('/') + 1)), rot])
      .filter(([re]) => re.test(texto)).map(([re, rot]) => rot + ': "' + (texto.match(re.global ? re : new RegExp(re.source, re.flags + 'g')) || []).slice(0, 3).join(' | ') + '"');
    const linhasComProibido = proibido.flatMap(([re, rot]) => {
      const r = new RegExp(re.slice(1, re.lastIndexOf('/')), re.slice(re.lastIndexOf('/') + 1));
      return texto.split('\n').filter((l) => r.test(l)).slice(0, 4).map((l) => rot + ' → ' + l.trim().slice(0, 110));
    });
    return { rolagemLateral: document.documentElement.scrollWidth > largura ? document.documentElement.scrollWidth : 0, pequenos, proibidos: linhasComProibido, resumoProibidos: achados };
  }, largura, PROIBIDO.map(([re, rot]) => [String(re), rot]));
}

async function axe(page) {
  if (!AXE) return null;
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const { violations } = await window.axe.run(document, { resultTypes: ['violations'] });
    return violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => ({ regra: v.id, impacto: v.impact, alvos: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }));
  });
}

async function abrirPagina(cenario, largura, tema) {
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e.message).slice(0, 200)));
  // o service worker não registra sob a interceptação (sw.js dá 404 de propósito): esse erro é do teste, não da Casa
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|error occurred when fetching the script/.test(m.text())) erros.push('console: ' + m.text().slice(0, 200)); });
  await page.setViewport({ width: largura, height: largura < 500 ? 812 : 900 });
  await page.setBypassServiceWorker(true);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: tema === 'claro' ? 'light' : 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument((c, tema) => {
    window.__CENARIO = c;
    try { localStorage.setItem('indycar_tema', tema); localStorage.removeItem('indycar_central_visao'); localStorage.setItem('indycar_central_email', 'dono@oficina.test'); } catch { /* segue */ }
  }, cenario, tema);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.hostname === 'cdn.jsdelivr.net' && /supabase/.test(u.pathname)) return req.respond({ status: 200, contentType: TIPOS['.js'], headers: { 'Access-Control-Allow-Origin': '*' }, body: MOCK });
    if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return req.continue();
    if (u.origin !== BASE) return req.respond({ status: 204, body: '' });
    const json = (o, status = 200) => req.respond({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/api/central/config') return json({ supabaseUrl: 'https://mentira.supabase.co', supabaseAnonKey: 'chave-de-mentira', versao: 'r9 (dados inventados)', apps: {} });
    if (u.pathname === '/api/central/saude-apps') {
      const fora = (k) => (cenario.foraDoAr || []).includes(k) ? { fora: true, desde: Date.now() - 25 * 60000, motivo: 'sem_resposta' } : { fora: false };
      return json({ verificado_em: Date.now(), apps: { patio: fora('patio'), orcador: fora('orcador') }, internos: { agenda: { ok: true }, crm: { ok: true }, comunicar: { ok: true }, atendimento: { ok: true }, trafego: { ok: true } } });
    }
    if (u.pathname === '/api/central/links-cliente') return json({ ok: true, nome: 'Gabi Inventada', aceita_mensagens: true, minha: 'https://indycar-patio.netlify.app/minha/exemplo', indique: null, acompanhar: null, os: null });
    if (u.pathname.startsWith('/agenda/api/')) return json([]);
    if (u.pathname === '/sw.js') return req.respond({ status: 404, body: '' });
    const caminho = u.pathname === '/' || u.pathname === '/index.html' ? '/casa/index.html' : u.pathname === '/manifest.json' ? '/casa/manifest.json' : u.pathname;
    if (!/^\/casa\/[\w.-]+$/.test(caminho)) return req.respond({ status: 404, body: '' });
    const arq = join(FONTE, caminho);
    if (!existsSync(arq)) return req.respond({ status: 404, body: '' });
    // o Supabase de mentira não bate com o hash (integrity) da biblioteca de verdade: no teste o index vai sem o integrity
    const corpo = caminho.endsWith('/index.html') ? readFileSync(arq, 'utf8').replace(/ integrity="[^"]*"/g, '') : readFileSync(arq);
    return req.respond({ status: 200, contentType: TIPOS[caminho.slice(caminho.lastIndexOf('.'))] || 'application/octet-stream', body: corpo });
  });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  return { page, erros };
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (const c of CENARIOS) {
    for (const largura of c.larguras) {
      for (const tema of ['escuro', 'claro']) {
        if (largura === 375 && tema === 'claro' && !['casa', 'dono', 'sino', 'entrada'].includes(c.nome)) continue;
        const { page, erros } = await abrirPagina(c.cenario, largura, tema);
        const nome = `${c.nome}-${largura}-${tema}`;
        try {
          if (c.cenario.sessao === false) await page.waitForSelector('#fLogin:not([hidden])', { timeout: 8000 });
          else await page.waitForSelector('#casa:not([hidden])', { timeout: 8000 });
          await espera(900);
          if (c.acao === 'operacao') { await page.click('[data-visao="operacao"]'); await espera(500); }
          if (c.acao === 'dono') { await page.click('[data-visao="dono"]'); await espera(700); }
          if (c.acao === 'sino') { await page.click('#bSino'); await espera(500); }
          if (c.acao === 'busca' || c.acao === 'ficha') { await page.click('#bBusca'); await page.type('#buscaInput', 'gabi'); await espera(900); }
          if (c.acao === 'ficha') { const b = await page.$('#buscaLista [data-ficha]'); if (b) { await b.click(); await espera(800); } }
          await page.evaluate(() => document.fonts && document.fonts.ready);
          const medidas = await medir(page, largura);
          const violacoes = await axe(page);
          // textos que o cenário tem de mostrar (prova de que o conserto aparece na tela, não só no código)
          const visto = await page.evaluate(() => document.body.innerText);
          const faltou = (c.espera || []).filter((t) => !visto.toLowerCase().includes(t.toLowerCase()));   // innerText vem em CAIXA ALTA onde o CSS manda
          await page.screenshot({ path: join(SAIDA, nome + '.png'), fullPage: !['sino', 'busca', 'ficha'].includes(c.acao) });
          relatorio.cenarios.push({ nome, ...medidas, axe: violacoes, erros, faltou });
          console.log(`${nome}: lateral=${medidas.rolagemLateral} pequenos=${medidas.pequenos.length} proibidos=${medidas.proibidos.length} axe=${violacoes ? violacoes.length : '-'} erros=${erros.length}${c.espera ? ' faltou=' + faltou.length : ''}`);
        } catch (e) {
          relatorio.cenarios.push({ nome, falhou: String(e.message).slice(0, 200), erros });
          console.log(`${nome}: FALHOU ${String(e.message).slice(0, 120)}`);
          try { await page.screenshot({ path: join(SAIDA, nome + '-falhou.png') }); } catch { /* segue */ }
        } finally { await page.close(); }
      }
    }
  }
} finally {
  await browser.close();
  writeFileSync(join(SAIDA, 'relatorio.json'), JSON.stringify(relatorio, null, 2));
  console.log('relatório em', join(SAIDA, 'relatorio.json'));
}
