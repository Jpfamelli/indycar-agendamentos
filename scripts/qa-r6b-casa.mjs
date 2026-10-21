// QA da Casa (rodada 6, C1b) no navegador headless contra o servidor LOCAL (node central.js, timers desligados).
//   node scripts/qa-r6b-casa.mjs [http://localhost:3066]
// Usuário de teste criado e APAGADO no fim. RPCs do painel, tarefas, avisos e a saúde dos apps são simulados por
// interceptação (nada é gravado no banco real; escritas simuladas são só registradas).
import fs from 'node:fs';
import { criarContexto, abrirNavegador, entrarNaCasa, dadosAgora, dadosExtras, dadosDono, dadosBusca } from './qa-r6-lib.mjs';

const BASE = process.argv[2] || 'http://localhost:3066';
const SAIDA = new URL('../capturas-r6/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
fs.mkdirSync(SAIDA, { recursive: true });
let ok = 0, falha = 0; const falhas = [];
const conf = (c, t) => { c ? ok++ : (falha++, falhas.push(t)); console.log((c ? '✔ ' : '✖ ') + t); };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const visivel = (page, sel) => page.$eval(sel, (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; }).catch(() => false);
const texto = (page, sel) => page.$eval(sel, (e) => e.innerText).catch(() => null);
const iso = (min) => new Date(Date.now() - min * 60000).toISOString();
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

function montarMocks(estado) {
  return (req) => {
    const u = req.url();
    const m = req.method();
    const json = (corpo, status = 200) => req.respond({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(corpo) });
    if (/\/api\/central\/saude-apps/.test(u)) { estado.saudeChamadas++; return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(estado.saude()) }); }
    const rpc = /\/rest\/v1\/rpc\/(r6_[a-z0-9_]+)/.exec(u);
    if (rpc && estado.rpc[rpc[1]] !== undefined) {
      if (m === 'OPTIONS') return req.respond({ status: 204, headers: CORS });
      const v = estado.rpc[rpc[1]];
      return json(typeof v === 'function' ? v(req) : v);
    }
    const rest = /\/rest\/v1\/(tarefas|notificacoes|consultores)(\?|$)/.exec(u);
    if (rest && estado.rest[rest[1]] !== undefined) {
      if (m === 'OPTIONS') return req.respond({ status: 204, headers: CORS });
      if (m === 'GET') return json(estado.rest[rest[1]]);
      estado.escritas.push({ tabela: rest[1], metodo: m, url: u, corpo: req.postData() });
      return req.respond({ status: 204, headers: CORS });
    }
    req.continue();
  };
}
const saudeOk = () => ({ verificado_em: Date.now(), apps: { patio: { fora: false, suspeito: false }, orcador: { fora: false, suspeito: false } } });
const saudeFora = () => ({ verificado_em: Date.now(), apps: { patio: { fora: true, suspeito: false, desde: Date.now() - 9 * 60000, motivo: 'http_503' }, orcador: { fora: false, suspeito: false } } });

async function cenario(papel, largura, fn, { apps, ajustar } = {}) {
  const ctx = criarContexto(papel, apps);
  const { browser, page } = await abrirNavegador({ largura, altura: largura < 500 ? 800 : 950 });
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  const agora = dadosAgora();
  const extras = dadosExtras(); extras.leads = { novos_sem_dono: 0, novos_hoje: 0 };
  const estado = {
    saudeChamadas: 0, saude: saudeOk, escritas: [],
    rpc: { r6_agora: agora, r6_c1_agora_extras: extras, r6_c1_painel_dono: dadosDono(), r6_busca_global: dadosBusca(),
      r6_c1b_painel_consultores: { consultores: [{ nome: 'Gabriel', marcados: 20, vieram: 15, fecharam: 9, faltaram: 3, valor: 5400 }, { nome: null, marcados: 4, vieram: 2, fecharam: 1, faltaram: 1, valor: 300 }], origens: [{ origem: 'Google', marcados: 12, vieram: 9, fecharam: 6, valor: 3800 }, { origem: 'Instagram', marcados: 6, vieram: 4, fecharam: 2, valor: 900 }] } },
    rest: {},
  };
  ajustar && ajustar(estado);
  try {
    await ctx.criar();
    await page.setRequestInterception(true);
    page.on('request', montarMocks(estado));
    await entrarNaCasa(page, BASE, ctx);
    await fn({ page, browser, ctx, erros, estado });
    conf(erros.length === 0, `${papel}/${largura}px: nenhum erro de JS no console${erros.length ? ' → ' + erros.slice(0, 3).join(' | ') : ''}`);
  } catch (e) { conf(false, `${papel}/${largura}px: exceção ${e.message}`); }
  finally { await browser.close(); console.log(`  usuário de teste apagado: ${await ctx.apagar()}`); }
}

const TAREFAS = () => [
  { id: 't1', titulo: 'Ligar para o Marcos', descricao: null, prioridade: 2, vence_em: iso(300), status: 'aberta', responsavel_id: null, origem: 'manual' },
  { id: 't2', titulo: 'Cobrar orçamento 12', descricao: null, prioridade: 1, vence_em: new Date(Date.now() + 5 * 36e5).toISOString(), status: 'aberta', responsavel_id: null, origem: 'manual' },
  { id: 't3', titulo: 'Sem prazo nenhum', descricao: null, prioridade: 2, vence_em: null, status: 'aberta', responsavel_id: null, origem: 'manual' },
];

// ---------------------------------------------------------------- gestor 1440
await cenario('gestor', 1440, async ({ page, browser, estado }) => {
  await page.waitForSelector('#cPatio:not([hidden])', { timeout: 20000 });
  await page.evaluate(() => window.Casa.painel.trocarVisao('operacao'));
  conf(!(await visivel(page, '#avisoApps')), 'saúde ok: o aviso do Pátio/Orçador fica escondido');
  conf(estado.saudeChamadas >= 1, 'a Casa pergunta a saúde dos apps ao abrir');
  conf(/oficina|expediente|Domingo/i.test(await texto(page, '#clima') || ''), 'clima da oficina aparece sob a saudação: ' + (await texto(page, '#clima')));
  const ordem = await page.$$eval('#agora .agora-cartao:not([hidden])', (els) => els.map((e) => [e.id, Number(e.style.order)]).sort((a, b) => a[1] - b[1]).map((x) => x[0]));
  conf(ordem[0] === 'cMeuDia' || ordem[0] === 'cPatio', 'gestor: o Pátio vem primeiro (ordem ' + ordem.join(',') + ')');
  // estado vazio que ensina
  conf(/Todo lead novo tem responsável/.test(await texto(page, '#cLeads [data-lista]') || ''), 'cartão de leads vazio ensina o que aparece ali');
  // recolher
  await page.click('[data-recolher="cOrc"]');
  conf(!(await visivel(page, '#cOrc [data-lista]')), 'recolher esconde a lista do cartão');
  conf(await page.$eval('[data-recolher="cOrc"]', (b) => b.getAttribute('aria-expanded')) === 'false', 'o botão de recolher informa aria-expanded=false');
  await page.reload({ waitUntil: 'networkidle2' }); await page.waitForSelector('#cOrc:not([hidden])', { timeout: 20000 });
  await page.evaluate(() => window.Casa.painel.trocarVisao('operacao'));
  conf(!(await visivel(page, '#cOrc [data-lista]')), 'o cartão recolhido continua recolhido depois de recarregar');
  await page.click('[data-recolher="cOrc"]');
  conf(await visivel(page, '#cOrc [data-lista]'), 'clicar de novo mostra a lista');
  // paleta de comandos
  await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control');
  await page.waitForSelector('#busca:not([hidden])');
  const cmdsIniciais = await page.$$eval('#buscaLista [data-cmd]', (b) => b.map((x) => x.dataset.cmd));
  conf(cmdsIniciais.includes('novo-horario') && cmdsIniciais.length <= 5, 'busca vazia mostra poucos comandos úteis: ' + cmdsIniciais.join(','));
  await page.type('#buscaInput', '>tema');
  await page.waitForSelector('#buscaLista [data-cmd="tema"]');
  const temaAntes = await page.evaluate(() => document.documentElement.getAttribute('data-tema'));
  await page.keyboard.press('Enter');
  await dorme(400);
  const temaDepois = await page.evaluate(() => document.documentElement.getAttribute('data-tema'));
  conf(temaAntes !== temaDepois, `comando "tema" troca o tema (${temaAntes} → ${temaDepois})`);
  conf(!(await visivel(page, '#busca')), 'a paleta fecha depois de executar o comando');
  await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control');
  await page.type('#buscaInput', '>');
  await page.waitForFunction(() => document.querySelectorAll('#buscaLista [data-cmd]').length > 6);
  const todos = await page.$$eval('#buscaLista [data-cmd]', (b) => b.length);
  conf(todos >= 12, `">" sozinho lista todos os comandos (${todos})`);
  await page.keyboard.press('Escape');
  const recentes = await page.evaluate(() => localStorage.getItem('indycar_central_buscas'));
  conf(!recentes || !recentes.includes('>'), 'comando digitado não vira "busca recente"');
  // atalho numérico abre o app na aba nomeada
  const nova = new Promise((res) => browser.once('targetcreated', res));
  await page.keyboard.press('5');
  const alvo = await Promise.race([nova, dorme(6000).then(() => null)]);
  conf(!!alvo, 'tecla 5 abre o Pátio em outra aba');
  if (alvo) { const pg = await alvo.page().catch(() => null); if (pg) await pg.close().catch(() => {}); }
  await page.bringToFront();
  // d alterna a visão do dono
  await page.keyboard.press('d');
  await page.waitForSelector('#donoTiles .tile', { timeout: 10000 });
  conf(await visivel(page, '#visaoDono'), 'tecla d vai para a visão do dono');
  // ranking por consultor
  await page.waitForSelector('#donoConsultores table', { timeout: 10000 });
  const linhas = await page.$$eval('#donoConsultores tbody tr', (t) => t.map((r) => r.innerText.replace(/\s+/g, ' ')));
  conf(linhas.length === 2 && /Gabriel/.test(linhas[0]) && /Sem consultor/.test(linhas[1]), 'desempenho por consultor desenhado: ' + linhas[0]);
  conf(/Google/.test(await texto(page, '#donoConsultores .origens') || ''), 'origem que mais fecha aparece');
  // ritmo + meta
  conf(/fecha em/.test(await texto(page, '#donoMeta') || ''), 'ritmo do mês mostra a projeção');
  page.once('dialog', (d) => d.accept('20.000'));
  await page.click('[data-meta]');
  await dorme(300);
  const mt = (await texto(page, '#donoMeta')) || ''; conf(/Meta de R\$\s?20\.000/.test(mt), 'meta definida aparece com a barra: ' + JSON.stringify(mt));
  await page.evaluate(() => navigator.clipboard.writeText = async (t) => { window.__copiado = t; });
  await page.click('[data-copiar-resumo]');
  await dorme(300);
  const resumo = await page.evaluate(() => window.__copiado || '');
  conf(/Faturado hoje: R\$\s?980/.test(resumo) && /Carros no pátio/.test(resumo), 'resumo do dia copiado com os números do painel');
  await page.screenshot({ path: SAIDA + 'c1b-casa-dono-1440.png', fullPage: true });
}, { ajustar: (e) => { e.rest = { tarefas: [], notificacoes: [], consultores: [], perfis: [] }; } });

// ---------------------------------------------------------------- saúde dos apps
await cenario('gestor', 1440, async ({ page, estado }) => {
  await page.waitForSelector('#avisoApps:not([hidden])', { timeout: 15000 });
  const txt = await texto(page, '#avisoApps');
  conf(/Pátio.*manutenção|Pátio.*503/.test(txt) && /Desde as/.test(txt) && /anote o carro/i.test(txt), 'Pátio fora do ar: aviso com motivo, hora e plano B');
  conf(await page.$eval('.grade-apps .app[data-app="patio"]', (a) => a.classList.contains('app-fora-do-ar')), 'o atalho do Pátio fica marcado "fora do ar"');
  conf(!(await page.$eval('.grade-apps .app[data-app="orcador"]', (a) => a.classList.contains('app-fora-do-ar'))), 'o Orçador (no ar) não é marcado');
  conf(await page.$eval('#cPatio [data-det]', (d) => d.classList.contains('det-fora')), 'o cartão do Pátio avisa que os números são do banco');
  const antes = estado.saudeChamadas;
  estado.saude = saudeOk;
  await page.click('[data-verificar-apps]');
  await page.waitForFunction(() => document.querySelector('#avisoApps').hidden, { timeout: 8000 });
  conf(estado.saudeChamadas > antes, '"verificar de novo" pergunta outra vez e o aviso some quando volta');
  conf(/voltou ao ar/.test(await texto(page, '#toast') || ''), 'aparece "Pátio voltou ao ar"');
  await page.screenshot({ path: SAIDA + 'c1b-casa-saude.png' });
}, { ajustar: (e) => { e.saude = saudeFora; e.rest = { tarefas: [], notificacoes: [], consultores: [], perfis: [] }; } });

// ---------------------------------------------------------------- tarefas e sino (atendente, 375 px)
await cenario('atendente', 375, async ({ page, estado }) => {
  await page.waitForSelector('#cConversas:not([hidden])', { timeout: 20000 });
  const ordem = await page.$$eval('#agora .agora-cartao:not([hidden])', (els) => els.map((e) => [e.id, Number(e.style.order)]).sort((a, b) => a[1] - b[1]).map((x) => x[0]));
  conf(ordem.indexOf('cConversas') < ordem.indexOf('cPatio'), 'atendente: Conversas vem antes do Pátio (' + ordem.join(',') + ')');
  conf(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '375 px: sem rolagem horizontal na Casa');
  await page.waitForSelector('#listaTarefas .tarefa', { timeout: 10000 });
  conf((await page.$$('#listaTarefas .tarefa')).length === 3, 'três tarefas abertas na lista (Minhas)');
  const primeiro = await texto(page, '#listaTarefas .tarefa');
  conf(/Ligar para o Marcos/.test(primeiro) && /venceu/.test(primeiro), 'vencida vem primeiro, com "venceu …"');
  await page.evaluate(() => document.querySelector('[data-filtro-t="vencidas"]').click());
  conf((await page.$$('#listaTarefas .tarefa')).length === 1, 'filtro Vencidas mostra só 1');
  await page.evaluate(() => document.querySelector('[data-filtro-t="urgentes"]').click());
  conf(/Cobrar orçamento 12/.test(await texto(page, '#listaTarefas') || ''), 'filtro Urgentes mostra a de prioridade 1');
  await page.evaluate(() => document.querySelector('[data-filtro-t="todas"]').click());
  await page.evaluate(() => document.querySelector('[data-adiar="t1"]').click());
  await dorme(300);
  const adiou = estado.escritas.find((w) => w.tabela === 'tarefas' && w.metodo === 'PATCH' && /vence_em/.test(w.corpo || ''));
  conf(!!adiou, 'adiar grava só o novo prazo (PATCH vence_em)');
  conf(/Desfazer/.test(await texto(page, '#toast') || ''), 'adiar oferece Desfazer');
  await page.evaluate(() => document.querySelector('[data-editar="t3"]').click());
  await page.waitForSelector('[data-edita="t3"]');
  await page.$eval('[data-edita="t3"]', (i) => { i.value = 'Já com prazo agora'; });
  await page.keyboard.press('Enter');
  await dorme(300);
  conf(estado.escritas.some((w) => w.metodo === 'PATCH' && /Já com prazo agora/.test(w.corpo || '')), 'editar o título no lugar grava o título novo');
  conf(/Já com prazo agora/.test(await texto(page, '#listaTarefas') || ''), 'a lista já mostra o título novo');
  // sino
  await page.click('#bSino');
  await page.waitForSelector('#listaNotif .notif-grupo', { timeout: 10000 });
  const sinoTxt = await texto(page, '#listaNotif');
  conf(/3 avisos: atrasos/.test(sinoTxt), 'três avisos de atraso viram um grupo');
  conf((await page.$$('#listaNotif [data-adiar-sino]')).length >= 1, 'cada aviso tem o botão de adiar por 1 hora');
  const antesN = await page.$$eval('#listaNotif li', (l) => l.length);
  await page.evaluate(() => document.querySelector('#listaNotif [data-adiar-sino]').click());
  const depoisN = await page.$$eval('#listaNotif li', (l) => l.length);
  conf(depoisN < antesN, 'adiar esconde o aviso neste aparelho');
  conf(/mostrar agora/.test(await texto(page, '#sinoRodape') || ''), 'o rodapé do sino oferece "mostrar agora" para os adiados');
  const naoLidos = await page.$$eval('#listaNotif .nova', (l) => l.length);
  await page.screenshot({ path: SAIDA + 'c1b-casa-375.png', fullPage: true });
  // alvos de toque
  await page.keyboard.press('Escape');
  const pequenos = await page.$$eval('.t-filtros button, .recolher, .t-adiar, .btn-link', (els) => els.filter((e) => e.offsetParent !== null).map((e) => [e.className || e.tagName, Math.round(e.getBoundingClientRect().height)]).filter((x) => x[1] < 40));
  conf(pequenos.length === 0, '375 px: botões e links de toque com 40 px ou mais' + (pequenos.length ? ' → ' + JSON.stringify(pequenos.slice(0, 4)) : ''));
  void naoLidos;
}, { ajustar: (e) => {
  e.rest = { tarefas: TAREFAS(), consultores: [], perfis: [],
    notificacoes: [1, 2, 3].map((i) => ({ id: 'n' + i, tipo: 'atraso', titulo: `Cliente ${i} está 35 min atrasado`, corpo: 'Revisão', link: null, app: 'agenda', lida_em: null, created_at: iso(10 + i) }))
      .concat([{ id: 'n9', tipo: 'extra', titulo: 'Extra esperando', corpo: null, link: null, app: 'patio', lida_em: null, created_at: iso(5) }]) };
} });

// ---------------------------------------------------------------- Meu dia (atendente) + mecânico
await cenario('atendente', 1280, async ({ page, ctx }) => {
  await page.waitForSelector('#cMeuDia:not([hidden])', { timeout: 20000 });
  const t = await texto(page, '#cMeuDia');
  conf(/tarefa/.test(t) && /Meu dia/i.test(t), 'Meu dia aparece para o atendente com as tarefas dele: ' + t.replace(/\s+/g, ' ').slice(0, 90));
  conf(await page.$eval('#cMeuDia', (e) => Number(e.style.order) === 0), 'Meu dia é o primeiro cartão');
}, { ajustar: (e) => { e.rest = { tarefas: TAREFAS().map((t) => ({ ...t, responsavel_id: null })), notificacoes: [], consultores: [], perfis: [] }; } });

await cenario('mecanico', 375, async ({ page }) => {
  await page.waitForSelector('#cPatio:not([hidden])', { timeout: 20000 });
  conf(!(await visivel(page, '#cMeuDia')), 'mecânico não vê "Meu dia"');
  conf(!(await visivel(page, '#seletorVisao')), 'mecânico não vê o seletor da visão do dono');
  const cmds = await page.evaluate(() => window.Casa.comandos.lista().map((c) => c.id));
  conf(!cmds.includes('novo-horario') && !cmds.includes('novo-orcamento') && cmds.includes('modo-tv'), 'mecânico só tem comandos do pátio: ' + cmds.join(','));
}, { apps: ['patio'], ajustar: (e) => { e.rest = { tarefas: [], notificacoes: [], consultores: [], perfis: [] }; } });

console.log(`\n${ok} conferências ok, ${falha} falharam.`);
if (falha) { console.log(falhas.map((f) => ' - ' + f).join('\n')); process.exit(1); }
