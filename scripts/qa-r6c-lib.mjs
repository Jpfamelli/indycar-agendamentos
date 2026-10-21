// Ferramentas do QA da Rodada 6 / C1c (Casa em 375 px, Casa do dono, Agenda): reaproveita o que o C1/C1b montaram
// (usuário de teste criado e APAGADO, navegador headless, RPCs de mentira) e acrescenta medições de tela.
import fs from 'node:fs';
import { criarContexto, abrirNavegador, entrarNaCasa, dadosAgora, dadosExtras, dadosDono, dadosBusca } from './qa-r6-lib.mjs';
export { criarContexto, abrirNavegador, entrarNaCasa, dadosAgora, dadosExtras, dadosDono, dadosBusca };

export const SAIDA = new URL('../capturas-r6/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
fs.mkdirSync(SAIDA, { recursive: true });

export const BASE = process.env.QA_BASE || 'http://localhost:3077';
export const placar = { ok: 0, falha: 0, falhas: [] };
export const conf = (c, t) => { c ? placar.ok++ : (placar.falha++, placar.falhas.push(t)); console.log((c ? '✔ ' : '✖ ') + t); };
export const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
export const visivel = (page, sel) => page.$eval(sel, (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; }).catch(() => false);
export const texto = (page, sel) => page.$eval(sel, (e) => e.innerText).catch(() => null);
export const iso = (min) => new Date(Date.now() - min * 60000).toISOString();
export function fim() {
  console.log(`\n${placar.ok} conferências ok, ${placar.falha} falharam.`);
  if (placar.falha) { console.log(placar.falhas.map((f) => ' - ' + f).join('\n')); process.exit(1); }
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const saudeOk = () => ({ verificado_em: Date.now(), apps: { patio: { fora: false, suspeito: false }, orcador: { fora: false, suspeito: false } } });
export const saudeFora = () => ({ verificado_em: Date.now(), apps: { patio: { fora: true, suspeito: false, desde: Date.now() - 9 * 60000, motivo: 'http_503' }, orcador: { fora: false, suspeito: false } } });

export function montarMocks(estado) {
  return (req) => {
    const u = req.url();
    const m = req.method();
    const json = (corpo, status = 200) => req.respond({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(corpo) });
    if (/\/api\/central\/saude-apps/.test(u)) { estado.saudeChamadas = (estado.saudeChamadas || 0) + 1; return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(estado.saude()) }); }
    const rpc = /\/rest\/v1\/rpc\/([a-z0-9_]+)/.exec(u);
    if (rpc && estado.rpc[rpc[1]] !== undefined) {
      if (m === 'OPTIONS') return req.respond({ status: 204, headers: CORS });
      const v = estado.rpc[rpc[1]];
      estado.chamadasRpc = estado.chamadasRpc || []; estado.chamadasRpc.push(rpc[1]);
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

export const TAREFAS = () => [
  { id: 't1', titulo: 'Ligar para o Marcos que pediu orçamento da revisão completa do Corolla', descricao: null, prioridade: 2, vence_em: iso(300), status: 'aberta', responsavel_id: null, origem: 'manual' },
  { id: 't2', titulo: 'Cobrar orçamento 12', descricao: null, prioridade: 1, vence_em: new Date(Date.now() + 5 * 36e5).toISOString(), status: 'aberta', responsavel_id: null, origem: 'manual' },
  { id: 't3', titulo: 'Sem prazo nenhum', descricao: null, prioridade: 2, vence_em: null, status: 'aberta', responsavel_id: null, origem: 'manual' },
];
export const NOTIFS = () => [1, 2, 3].map((i) => ({ id: 'n' + i, tipo: 'atraso', titulo: `Cliente ${i} está 35 min atrasado`, corpo: 'Revisão', link: null, app: 'agenda', lida_em: null, created_at: iso(10 + i) }))
  .concat([{ id: 'n9', tipo: 'extra', titulo: 'Extra esperando aprovação do cliente no carro HB20 do Carlos', corpo: null, link: null, app: 'patio', lida_em: null, created_at: iso(5) }]);

/** Abre um cenário na Casa com usuário de teste (criado e apagado) e mocks. `fn` recebe { page, browser, ctx, erros, estado }. */
export async function cenario(papel, largura, fn, { apps, ajustar, altura } = {}) {
  const ctx = criarContexto(papel, apps);
  const { browser, page } = await abrirNavegador({ largura, altura: altura || (largura < 500 ? 800 : 950) });
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  const agora = dadosAgora();
  const extras = dadosExtras();
  const estado = {
    saudeChamadas: 0, saude: saudeOk, escritas: [],
    rpc: { r6_agora: agora, r6_c1_agora_extras: extras, r6_c1_painel_dono: dadosDono(), r6_busca_global: dadosBusca(),
      r6_c1b_painel_consultores: { consultores: [{ nome: 'Gabriel', marcados: 20, vieram: 15, fecharam: 9, faltaram: 3, valor: 5400 }, { nome: null, marcados: 4, vieram: 2, fecharam: 1, faltaram: 1, valor: 300 }], origens: [{ origem: 'Google', marcados: 12, vieram: 9, fecharam: 6, valor: 3800 }, { origem: 'Instagram', marcados: 6, vieram: 4, fecharam: 2, valor: 900 }] } },
    rest: { tarefas: TAREFAS(), notificacoes: NOTIFS(), consultores: [], perfis: [] },
  };
  ajustar && ajustar(estado);
  let rotulo = `${papel}/${largura}px`;
  try {
    await ctx.criar();
    await page.setRequestInterception(true);
    page.on('request', montarMocks(estado));
    await entrarNaCasa(page, BASE, ctx);
    await fn({ page, browser, ctx, erros, estado });
    conf(erros.length === 0, `${rotulo}: nenhum erro de JS no console${erros.length ? ' → ' + erros.slice(0, 3).join(' | ') : ''}`);
  } catch (e) { conf(false, `${rotulo}: exceção ${e.message}`); }
  finally { await browser.close(); console.log(`  usuário de teste apagado: ${await ctx.apagar()}`); }
}

/** Mede a tela: rolagem lateral, o que passa da borda direita e alvos de toque menores que `min` px. */
export async function medirTela(page, { min = 44, ignorar = '' } = {}) {
  return page.evaluate((min, ignorar) => {
    const vw = document.documentElement.clientWidth;
    const visivel = (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && s.opacity !== '0'; };
    const nome = (e) => (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') || e.tagName.toLowerCase();
    const r = { rolagemLateral: document.documentElement.scrollWidth > vw + 1, larguraTotal: document.documentElement.scrollWidth, vw, passando: [], pequenos: [] };
    for (const e of document.querySelectorAll('body *')) {
      if (!visivel(e)) continue;
      if (ignorar && e.closest(ignorar)) continue;
      // dentro de um bloco com rolagem própria (tabela, grade) o que passa da borda é esperado
      let rolavel = false;
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const ov = getComputedStyle(p).overflowX; if (ov === 'auto' || ov === 'scroll' || ov === 'hidden') { if (p.scrollWidth > p.clientWidth + 1 || ov === 'hidden') rolavel = true; break; } }
      const b = e.getBoundingClientRect();
      if (!rolavel && b.right > vw + 1 && b.width > 0) r.passando.push(nome(e) + ' →' + Math.round(b.right));
    }
    const alvos = 'button, a[href], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, summary, [role=tab], [role=option], [role=menuitem], textarea, label.marcar, .switch, .tarefa > input[type=checkbox]';
    for (const e of document.querySelectorAll(alvos)) {
      if (!visivel(e) || e.disabled) continue;
      if (ignorar && e.closest(ignorar)) continue;
      if (e.matches('.pular')) continue;
      const b = e.getBoundingClientRect();
      if (b.height < min - 0.5 || b.width < min - 0.5) r.pequenos.push(nome(e) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
    }
    r.passando = [...new Set(r.passando)].slice(0, 12); r.pequenos = [...new Set(r.pequenos)].slice(0, 40);
    return r;
  }, min, ignorar);
}
