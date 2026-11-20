// Casa no Chrome, rodada 10: PROVAS de conexão, falha de rede, clique duplo e duas abas, com o Supabase de mentira
// (tests/r10-casa-mock/supabase-falso.js + os dados inventados de tests/r9-casa-mock/dados.js). Nada sai para a rede:
// todo pedido é respondido pela interceptação do Chrome, e nada é gravado em banco nenhum.
//
//   node tests/r10-casa-browser.mjs                  → roda todas as provas (ok/FALHOU) e sai com 1 se alguma falhar
//   node tests/r10-casa-browser.mjs --antes <pasta>  → as mesmas provas na Casa de <pasta>/casa (git archive de um commit)
//   node tests/r10-casa-browser.mjs --so <pedaço>    → só as provas cujo nome contém o pedaço
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');
const puppeteer = require(resolve(RAIZ, '../indycar-ferramentas/node_modules/puppeteer-core'));
const BASE = 'http://localhost:3522';
const arg = (nome) => { const i = process.argv.indexOf(nome); return i > 0 ? process.argv[i + 1] : ''; };
const FONTE = arg('--antes') ? resolve(arg('--antes')) : RAIZ;
const SO = arg('--so');
const MOCK = readFileSync(join(AQUI, 'r9-casa-mock/dados.js'), 'utf8') + '\n' + readFileSync(join(AQUI, 'r10-casa-mock/supabase-falso.js'), 'utf8');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', userDataDir: resolve(RAIZ, 'qa-out/r10/perfil-chrome'), args: ['--no-sandbox', '--disable-background-networking'] });
const resultados = [];
const conferir = (nome, ok, detalhe = '') => { resultados.push({ nome, ok: !!ok, detalhe }); console.log(`${ok ? 'ok     ' : 'FALHOU '} ${nome}${detalhe ? '  (' + detalhe + ')' : ''}`); };

/**
 * Abre a Casa num cenário. Além do que o Supabase de mentira entende (papel, sessao, falhar, pendurar, erros, atraso, mfa,
 * semRenovar), o cenário aceita: configFalha (quantas vezes /api/central/config responde 500), saudeFalha (a saúde dos
 * apps responde 500), linksPendurado (os links do cliente nunca respondem), ls ({ chave: valor } no localStorage).
 */
async function abrir(cenario = {}, { esperar = null } = {}) {
  const page = await browser.newPage();
  const erros = [];
  const rede = { config: 0, saude: 0, links: 0, configFalha: Number(cenario.configFalha) || 0, saudeFalha: !!cenario.saudeFalha };
  page.on('pageerror', (e) => erros.push(String(e.message)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.setBypassServiceWorker(true);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument((c) => {
    window.__CENARIO = c; window.__ABAS = [];
    window.open = (url, nome) => { window.__ABAS.push([String(url), String(nome)]); return { focus() {} }; };
    try { if (!sessionStorage.getItem('__aba_limpa')) { localStorage.clear(); sessionStorage.setItem('__aba_limpa', '1'); for (const [k, v] of Object.entries(c.ls || {})) localStorage.setItem(k, v); } } catch { /* segue */ }
    try { localStorage.setItem('indycar_tema', 'escuro'); if (!localStorage.getItem('indycar_central_visao')) localStorage.setItem('indycar_central_visao', 'operacao'); } catch { /* segue */ }
  }, cenario);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.hostname === 'cdn.jsdelivr.net' && /supabase/.test(u.pathname)) return req.respond({ status: 200, contentType: TIPOS['.js'], headers: { 'Access-Control-Allow-Origin': '*' }, body: MOCK });
    if (u.origin !== BASE) return req.respond({ status: 204, body: '' });
    const json = (o, status = 200) => req.respond({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/api/central/config') { rede.config++; return rede.config <= rede.configFalha ? json({ erro: 'fora' }, 500) : json({ supabaseUrl: 'https://mentira.supabase.co', supabaseAnonKey: 'chave-de-mentira', versao: 'r10', apps: {} }); }
    if (u.pathname === '/api/central/saude-apps') { rede.saude++; return rede.saudeFalha ? json({ erro: 'fora' }, 500) : json({ verificado_em: Date.now(), apps: {}, internos: {} }); }
    if (u.pathname === '/api/central/links-cliente') { rede.links++; if (cenario.linksPendurado) return; return json({ ok: true, nome: 'Gabi Inventada', aceita_mensagens: true, minha: 'https://indycar-patio.netlify.app/minha/?c=tok', indique: null, acompanhar: null, os: null }); }
    if (u.pathname.startsWith('/agenda/api/')) return json([]);
    if (u.pathname === '/sw.js') return req.respond({ status: 404, body: '' });
    const caminho = u.pathname === '/' ? '/casa/index.html' : u.pathname;
    const arq = join(FONTE, caminho);
    if (!/^\/casa\/[\w.-]+$/.test(caminho) || !existsSync(arq)) return req.respond({ status: 404, body: '' });
    const corpo = caminho.endsWith('/index.html') ? readFileSync(arq, 'utf8').replace(/ integrity="[^"]*"/g, '') : readFileSync(arq);
    return req.respond({ status: 200, contentType: TIPOS[caminho.slice(caminho.lastIndexOf('.'))] || 'application/octet-stream', body: corpo });
  });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(esperar || (cenario.sessao === false ? '#fLogin:not([hidden])' : cenario.mfa ? '#fMfa:not([hidden])' : '#casa:not([hidden])'), { timeout: 8000 });
  await espera(700);
  return { page, erros, rede };
}
const lidas = (page, nome) => page.evaluate((n) => window.__LIDO.filter((x) => x === n).length, nome);
const gravadas = (page, tabela, acao) => page.evaluate((t, a) => window.__GRAVADO.filter((x) => x.tabela === t && (!a || x.acao === a)).length, tabela, acao || '');
const visivel = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.offsetParent !== null; }, sel);
const texto = (page, sel) => page.evaluate((s) => (document.querySelector(s)?.textContent || '').replace(/\s+/g, ' ').trim(), sel);
/** a aba "voltou a ficar visível" (o Chrome sem tela não troca de aba de verdade) */
const voltarParaAAba = (page) => page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
/** adianta o relógio da página (Date.now) sem esperar de verdade */
const adiantar = (page, ms) => page.evaluate((d) => { const real = Date.now.bind(Date); const base = (window.__ADIANTADO || 0) + d; window.__ADIANTADO = base; const orig = window.__AGORA_REAL || (window.__AGORA_REAL = real); Date.now = () => orig() + base; }, ms);

const PROVAS = [];
const prova = (nome, fn) => PROVAS.push([nome, fn]);

/* ---------- lote 2: tarefas e sino (clique duplo, tempo real em rajada, rede e aba que voltam) ---------- */
prova('r10-adiar-duplo', async (abrir) => {
  const { page } = await abrir({ papel: 'admin', atraso: 250 });
  const antes = await gravadas(page, 'tarefas', 'update');
  // dois toques seguidos em "adiar 1 dia" da mesma tarefa, sem esperar o banco responder
  const id = await page.evaluate(() => {
    const b = document.querySelector('#listaTarefas [data-adiar]'); const id = b.dataset.adiar;
    b.click(); document.querySelector('#listaTarefas [data-adiar="' + id + '"]').click();
    return id;
  });
  await espera(900);
  const escritas = await page.evaluate((i) => window.__GRAVADO.filter((x) => x.tabela === 'tarefas' && x.acao === 'update' && x.valor && x.valor.vence_em && x.filtros.some((f) => f[2] === i)).map((x) => x.valor.vence_em), id);
  conferir('r10-adiar-duplo: dois toques em "adiar 1 dia" gravam uma vez só', escritas.length === 1 && (await gravadas(page, 'tarefas', 'update')) - antes === 1, escritas.length + ' gravações');
  // depois que o banco respondeu, adiar de novo volta a valer
  await page.evaluate((i) => document.querySelector('#listaTarefas [data-adiar="' + i + '"]').click(), id);
  await espera(600);
  conferir('r10-adiar-duplo: passado o primeiro, um novo toque adia de novo', (await gravadas(page, 'tarefas', 'update')) - antes === 2);
});

prova('r10-rajada', async (abrir) => {
  const { page } = await abrir({ papel: 'admin' });
  const t0 = await lidas(page, 'tarefas'), n0 = await lidas(page, 'notificacoes');
  await page.evaluate(() => { window.__EMITIR('tarefas', 8); window.__EMITIR('notificacoes', 8); });
  await espera(1200);
  const t = (await lidas(page, 'tarefas')) - t0, n = (await lidas(page, 'notificacoes')) - n0;
  conferir('r10-rajada: 8 mudanças juntas nas tarefas viram 1 leitura', t === 1, t + ' leituras');
  conferir('r10-rajada: 8 avisos juntos no sino viram 1 leitura', n === 1, n + ' leituras');
});

prova('r10-rede-voltou', async (abrir) => {
  const { page } = await abrir({ papel: 'admin', falhar: ['tarefas', 'notificacoes'] });
  conferir('r10-rede-voltou: com a leitura falhando, as tarefas dizem que não leram', /Não consegui ler as tarefas/.test(await texto(page, '#listaTarefas')));
  await page.evaluate(() => { window.__R10.falhar.clear(); window.dispatchEvent(new Event('online')); });
  await espera(700);
  conferir('r10-rede-voltou: a internet voltou e as tarefas aparecem sozinhas', (await page.$$('#listaTarefas li[data-tid]')).length > 0, await texto(page, '#listaTarefas').then((x) => x.slice(0, 60)));
  const n = await page.evaluate(() => window.Casa.sino.lista().length);
  conferir('r10-rede-voltou: o sino também relê na hora', n > 0, n + ' avisos');
});

prova('r10-tarefas-aba', async (abrir) => {
  const { page } = await abrir({ papel: 'admin' });
  const t0 = await lidas(page, 'tarefas');
  await voltarParaAAba(page);
  await espera(400);
  conferir('r10-tarefas-aba: voltar à aba logo depois de ler não relê', (await lidas(page, 'tarefas')) - t0 === 0);
  await adiantar(page, 61_000);
  await voltarParaAAba(page);
  await espera(500);
  conferir('r10-tarefas-aba: voltar à aba depois de mais de 1 minuto relê as tarefas', (await lidas(page, 'tarefas')) - t0 === 1, ((await lidas(page, 'tarefas')) - t0) + ' leituras');
});

/* ---------- lote 3: sessão vencida, duas abas, código de verificação e senha nova ---------- */
prova('r10-sessao-vencida', async (abrir) => {
  const vencido = { message: 'JWT expired', code: 'PGRST301' };
  const { page } = await abrir({ papel: 'admin', semRenovar: true, erros: { r6_agora: vencido, tarefas: vencido, notificacoes: vencido } }, { esperar: 'body' });
  await espera(900);
  conferir('r10-sessao-vencida: login vencido e sem renovar volta para a tela de entrar', await visivel(page, '#fLogin') && !(await visivel(page, '#casa')));
  conferir('r10-sessao-vencida: a tela diz o motivo', /Sua sessão venceu\. Entre de novo/.test(await texto(page, '#lErro')), await texto(page, '#lErro'));
  conferir('r10-sessao-vencida: tentou renovar uma vez só', (await gravadas(page, 'auth', 'renovar')) === 1, (await gravadas(page, 'auth', 'renovar')) + ' tentativas');

  // a sessão renova: a Casa continua aberta e relê
  const b = await abrir({ papel: 'admin' });
  const antes = await lidas(b.page, 'tarefas');
  await b.page.evaluate((v) => { window.__R10.erros.r6_agora = v; window.Casa.painel.atualizar(); setTimeout(() => { delete window.__R10.erros.r6_agora; }, 30); }, vencido);
  await espera(900);
  conferir('r10-sessao-vencida: quando a sessão renova, a Casa fica aberta e relê as tarefas', await visivel(b.page, '#casa') && (await gravadas(b.page, 'auth', 'renovar')) === 1 && (await lidas(b.page, 'tarefas')) > antes);
  await b.page.close();

  // erro que não é de sessão (rede, banco fora) não mexe no login
  const c = await abrir({ papel: 'admin', falhar: ['r6_agora'] });
  conferir('r10-sessao-vencida: falha comum de leitura não tenta renovar nem tira ninguém da Casa', await visivel(c.page, '#casa') && (await gravadas(c.page, 'auth', 'renovar')) === 0);
  await c.page.close();
});

prova('r10-entrou-em-outra-aba', async (abrir) => {
  const { page } = await abrir({ papel: 'admin', sessao: false });
  conferir('r10-entrou-em-outra-aba: começa na tela de entrar', await visivel(page, '#fLogin'));
  await page.evaluate(() => window.__AUTH('SIGNED_IN', window.__NOVA_SESSAO()));
  await espera(900);
  conferir('r10-entrou-em-outra-aba: o login feito em outra aba abre a Casa nesta', await visivel(page, '#casa') && !(await visivel(page, '#fLogin')));
});

prova('r10-outra-pessoa', async (abrir) => {
  const { page } = await abrir({ papel: 'admin', ls: { indycar_central_buscas: '["Ana Exemplo 12999900011"]' } });
  conferir('r10-outra-pessoa: a Casa está com o dono', (await texto(page, '#nomeCurto')) === 'Paulo' && await visivel(page, '#seletorVisao'));
  await page.evaluate(() => {
    const outra = '00000000-0000-4000-8000-0000000000a7';
    window.__DADOS.tabelas.perfis = [{ id: outra, nome: 'Rita Exemplo', email: 'rita@oficina.test', papel: 'atendente', apps: ['atendimento', 'agenda'], ativo: true, precisa_trocar_senha: false }];
    window.__AUTH('SIGNED_IN', window.__NOVA_SESSAO({ id: outra, email: 'rita@oficina.test' }));
  });
  await espera(1000);
  conferir('r10-outra-pessoa: outra pessoa entrou em outra aba e a Casa passa a ser a dela', (await texto(page, '#nomeCurto')) === 'Rita', await texto(page, '#nomeCurto'));
  conferir('r10-outra-pessoa: a visão do dono some para a atendente', !(await visivel(page, '#seletorVisao')));
  conferir('r10-outra-pessoa: as buscas de quem estava antes saem do aparelho', (await page.evaluate(() => localStorage.getItem('indycar_central_buscas'))) === null);
  conferir('r10-outra-pessoa: a mesma pessoa de novo (aba que voltou) não desmonta nada', await page.evaluate(async () => {
    const antes = window.__LIDO.length;
    window.__AUTH('SIGNED_IN', window.__NOVA_SESSAO({ id: '00000000-0000-4000-8000-0000000000a7', email: 'rita@oficina.test' }));
    await new Promise((r) => setTimeout(r, 400));
    return window.__LIDO.filter((x, i) => i >= antes && x === 'perfis').length === 0;
  }));
});

prova('r10-codigo', async (abrir) => {
  const { page } = await abrir({ papel: 'admin', mfa: true, atraso: 300 });
  await page.type('#mCodigo', '123456');
  await page.evaluate(() => { const f = document.querySelector('#fMfa'); f.requestSubmit(); f.requestSubmit(); });
  await espera(200);
  conferir('r10-codigo: enquanto confere, o botão diz "Conferindo…" e fica travado', await page.evaluate(() => { const b = document.querySelector('#fMfa [type="submit"]'); return b.disabled && /Conferindo/.test(b.textContent); }));
  await page.waitForSelector('#casa:not([hidden])', { timeout: 5000 });
  conferir('r10-codigo: dois toques em "Confirmar" mandam o código uma vez só', (await gravadas(page, 'auth', 'codigo')) === 1, (await gravadas(page, 'auth', 'codigo')) + ' envios');

  const b = await abrir({ papel: 'admin', mfa: true });
  await b.page.evaluate(() => { window.__R10.semRede = true; });
  await b.page.type('#mCodigo', '123456');
  await b.page.evaluate(() => document.querySelector('#fMfa').requestSubmit());
  await espera(400);
  const msg = await texto(b.page, '#mErro');
  conferir('r10-codigo-rede: sem internet a tela não diz que o código está errado', /Sem internet/.test(msg) && !/não confere/.test(msg), msg);
  await b.page.evaluate(() => { window.__R10.semRede = false; document.querySelector('#mCodigo').value = '999999'; document.querySelector('#fMfa').requestSubmit(); });
  await espera(400);
  conferir('r10-codigo-rede: código errado de verdade continua dizendo que não confere', /Código não confere/.test(await texto(b.page, '#mErro')));
  await b.page.close();
});

prova('r10-senha-dupla', async (abrir) => {
  const { page } = await abrir({ papel: 'admin', atraso: 300 });
  await page.evaluate(() => document.querySelector('[data-acao="trocar-senha"]').click());
  await page.waitForSelector('#fSenha:not([hidden])', { timeout: 3000 });
  await page.type('#sNova', 'senha-nova-123'); await page.type('#sRepete', 'senha-nova-123');
  await page.evaluate(() => { const f = document.querySelector('#fSenha'); f.requestSubmit(); f.requestSubmit(); });
  await espera(1100);
  conferir('r10-senha-dupla: dois toques em gravar trocam a senha uma vez só', (await gravadas(page, 'auth', 'senha')) === 1, (await gravadas(page, 'auth', 'senha')) + ' trocas');
  conferir('r10-senha-dupla: depois de gravar, volta para a Casa', await visivel(page, '#casa'));
});

/* ---------- lote 4: resposta lenta, volta à aba e conferência que falha ---------- */
prova('r10-painel-pendurado', async (abrir) => {
  const { page } = await abrir({ papel: 'admin' });
  const n0 = await lidas(page, 'r6_agora');
  await page.evaluate(() => { window.__R10.pendurar.add('r6_agora'); window.Casa.painel.atualizar(); });   // esta leitura nunca volta
  await espera(200);
  await page.evaluate(() => { window.__R10.pendurar.clear(); window.Casa.painel.atualizar(); });
  await espera(300);
  conferir('r10-painel-pendurado: com uma leitura em andamento há pouco, não dispara outra', (await lidas(page, 'r6_agora')) - n0 === 1);
  await adiantar(page, 26_000);
  await page.evaluate(() => window.Casa.painel.atualizar());
  await espera(600);
  conferir('r10-painel-pendurado: leitura pendurada há mais de 25 s não trava o painel (uma nova leitura sai)', (await lidas(page, 'r6_agora')) - n0 === 2, ((await lidas(page, 'r6_agora')) - n0) + ' leituras');
  conferir('r10-painel-pendurado: e o painel volta a dizer que está atualizado', /atualizado agora/.test(await texto(page, '#vivoTxt')), await texto(page, '#vivoTxt'));
});

prova('r10-volta-da-aba', async (abrir) => {
  const { page, rede } = await abrir({ papel: 'admin' });
  const contar = async () => ({ agora: await lidas(page, 'r6_agora'), extras: await lidas(page, 'r6_c1_agora_extras'), avisos: await lidas(page, 'notificacoes'), saude: rede.saude });
  const a = await contar();
  await voltarParaAAba(page);
  await espera(500);
  const b = await contar();
  const feitos = (b.agora - a.agora) + (b.extras - a.extras) + (b.avisos - a.avisos) + (b.saude - a.saude);
  conferir('r10-volta-da-aba: voltar para a aba segundos depois de ler não refaz nenhum pedido', feitos === 0, feitos + ' pedidos');
  await adiantar(page, 31_000);
  await voltarParaAAba(page);
  await espera(600);
  const c = await contar();
  conferir('r10-volta-da-aba: passado o tempo, a volta relê o painel, o sino e a saúde dos apps', c.agora - b.agora === 1 && c.avisos - b.avisos === 1 && c.saude - b.saude === 1, JSON.stringify({ agora: c.agora - b.agora, avisos: c.avisos - b.avisos, saude: c.saude - b.saude }));
});

prova('r10-saude-sem-leitura', async (abrir) => {
  const { page, rede } = await abrir({ papel: 'admin', saudeFalha: true });
  conferir('r10-saude-sem-leitura: uma falha só não alarma', !(await visivel(page, '#avisoApps')));
  await page.evaluate(() => window.Casa.verificarApps());
  await espera(400);
  conferir('r10-saude-sem-leitura: na segunda falha seguida a Casa diz que não conseguiu conferir', await visivel(page, '#avisoApps') && /Não consegui conferir se o Pátio e o Orçador estão no ar/.test(await texto(page, '#avisoApps')), await texto(page, '#avisoApps').then((x) => x.slice(0, 70)));
  rede.saudeFalha = false;
  await page.click('#avisoApps [data-verificar-apps]');
  await espera(500);
  conferir('r10-saude-sem-leitura: conferiu de novo com sucesso e o aviso some', !(await visivel(page, '#avisoApps')));
});

/* ---------- lote 5: links do cliente, configuração do login e meta do mês ---------- */
prova('r10-links-tempo', async (abrir) => {
  const { page, rede } = await abrir({ papel: 'admin', linksPendurado: true });
  // o tempo limite de verdade é 15 s; na prova ele é encurtado para não esperar
  await page.evaluate(() => { const real = AbortSignal.timeout.bind(AbortSignal); AbortSignal.timeout = (ms) => real(Math.min(ms, 400)); window.Casa.ficha.abrir({ tel55: '5512999900031', nome: 'Gabi Inventada' }); });
  await page.waitForSelector('[data-ficha-links]', { timeout: 4000 });
  await page.click('[data-ficha-links]');
  await espera(1300);
  const t = await texto(page, '#fichaLinks');
  conferir('r10-links-tempo: links do cliente sem resposta param de esperar e dizem o porquê', /Não consegui gerar os links\. A Central demorou demais para responder/.test(t), t.slice(0, 90));
  conferir('r10-links-tempo: e o botão volta a funcionar para tentar de novo', await page.evaluate(() => !document.querySelector('.ficha-barra [data-ficha-links]').disabled) && rede.links === 1);
});

prova('r10-config-de-novo', async (abrir) => {
  const { page, rede } = await abrir({ papel: 'admin', sessao: false, configFalha: 1 });
  conferir('r10-config-de-novo: a configuração do login falhou e a tela oferece "Tentar de novo"', await visivel(page, '#lTentar') && /Tentar de novo/.test(await texto(page, '#lErro')), await texto(page, '#lErro'));
  await page.click('#lTentar');
  await espera(600);
  conferir('r10-config-de-novo: tentou de novo, o erro some e o botão também', !(await visivel(page, '#lTentar')) && !(await visivel(page, '#lErro')) && rede.config === 2);
  await page.type('#lEmail', 'dono@oficina.test'); await page.type('#lSenha', 'senha-de-mentira');
  await page.click('#lEntrar');
  await page.waitForSelector('#casa:not([hidden])', { timeout: 5000 });
  conferir('r10-config-de-novo: e dá para entrar sem recarregar a página', await visivel(page, '#casa'));

  const b = await abrir({ papel: 'admin', configFalha: 1 }, { esperar: '#fLogin:not([hidden])' });
  await b.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await b.page.waitForSelector('#casa:not([hidden])', { timeout: 5000 }).catch(() => {});
  conferir('r10-config-de-novo: quando a internet volta, a Casa tenta sozinha e abre', await visivel(b.page, '#casa'));
  await b.page.close();
});

prova('r10-meta', async (abrir) => {
  const mes = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
  // este aparelho já acertou a meta com o banco neste mês; depois o dono tirou a meta em outro aparelho (o banco está sem meta)
  const { page } = await abrir({ papel: 'admin', vazio: true, ls: { indycar_central_meta_mes: '50000', indycar_central_meta_sinc: mes, indycar_central_visao: 'dono' } });
  await espera(700);
  conferir('r10-meta: meta tirada em outro aparelho não volta para o banco por este', (await gravadas(page, 'casa_metas')) === 0, (await gravadas(page, 'casa_metas')) + ' gravações');
  conferir('r10-meta: e este aparelho passa a mostrar "sem meta", como o banco', (await page.evaluate(() => localStorage.getItem('indycar_central_meta_mes'))) === '');

  // aparelho que nunca acertou com o banco: a meta que só existia nele sobe uma vez (como já era)
  const b = await abrir({ papel: 'admin', vazio: true, ls: { indycar_central_meta_mes: '50000', indycar_central_visao: 'dono' } });
  await espera(700);
  conferir('r10-meta: a meta que só existia no aparelho ainda sobe na primeira vez', (await gravadas(b.page, 'casa_metas', 'upsert')) === 1 && (await b.page.evaluate(() => localStorage.getItem('indycar_central_meta_sinc'))) === mes);
  await b.page.close();
});

prova('r10-meta-sair', async (abrir) => {
  // o dono guardou a meta neste computador (ela fica também no aparelho)
  const { page } = await abrir({ papel: 'admin', ls: { indycar_central_visao: 'dono', indycar_central_meta_mes: '60000' } });
  await espera(500);
  const antes = await page.evaluate(() => localStorage.getItem('indycar_central_meta_mes'));
  await page.evaluate(() => document.querySelector('[data-acao="sair"]').click());
  await page.waitForSelector('#fLogin:not([hidden])', { timeout: 4000 });
  const depois = await page.evaluate(() => [localStorage.getItem('indycar_central_meta_mes'), localStorage.getItem('indycar_central_meta_sinc'), localStorage.getItem('indycar_tema')]);
  conferir('r10-meta-sair: ao sair, a meta do mês não fica guardada no computador da oficina (o tema fica)', antes === '60000' && depois[0] === null && depois[1] === null && depois[2] === 'escuro', JSON.stringify([antes, depois]));
});

// === FIM DAS PROVAS ===
try {
  for (const [nome, fn] of PROVAS) {
    if (SO && !nome.includes(SO)) continue;
    let aberta = null;
    try { await fn((...a) => abrir(...a).then((x) => (aberta = x))); }
    catch (e) { conferir(nome, false, 'quebrou: ' + String(e.message).slice(0, 110)); }
    try { if (aberta) await aberta.page.close(); } catch { /* já fechou */ }
  }
} finally { await browser.close(); }
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} conferências ok` + (falhas.length ? ` · FALHARAM: ${falhas.map((f) => f.nome).join(' | ')}` : ''));
process.exit(falhas.length ? 1 : 0);
