/* Roteiro de navegador da RODADA 6, segunda leva (C5): Orçador ao vivo, pré-agendamento, carros sem conversa, teclado, estados.
   Uso: PORT=3360 node scripts/mock-server.mjs   (outro terminal)   ·   BASE=http://localhost:3360 node scripts/roteiro-r6c5.cjs
   Confere em 1440 e 375 px (admin) e como atendente. Inclui a conferência permanente de ?aba=integracoes. */
const puppeteer = require('C:/Users/USER/.claude/backups/indycar-ferramentas/node_modules/puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:3360';
const OUT = path.join(__dirname, 'shots-tela', 'r6c5-');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const espera = ms => new Promise(r => setTimeout(r, ms));
let total = 0, bons = 0;
const ok = (nome, cond, extra = '') => { total++; if (cond) bons++; console.log(`${cond ? 'OK  ' : 'FALHOU'} ${nome}${cond ? '' : ' — ' + extra}`); };
let browser;
const c5 = (corpo) => fetch(BASE + '/api/_c5', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(r => r.json());

async function abrir(papel, largura = 1440, extra = '') {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  p.erros = [];
  p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) p.erros.push(m.text()); });
  p.on('pageerror', e => p.erros.push('PAGEERROR ' + e.message));
  p.on('dialog', d => d.accept('liguei para o cliente'));
  await p.setViewport(largura < 600 ? { width: largura, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: largura, height: 900 });
  await p.goto(`${BASE}/?papel=${papel}&saude=ok${extra}`, { waitUntil: 'networkidle0' });
  await espera(900);
  await p.evaluate(() => { window.__abertos = []; window.open = (u, n) => { window.__abertos.push({ u, n }); return { opener: null, focus() {} }; }; });
  p.ctx = ctx;
  return p;
}
const semRolagemX = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const ate = async (p, fn, arg, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await espera(150); } return false; };
const abrirConv = (p, nome) => p.evaluate(n => [...document.querySelectorAll('.conversa')].find(c => c.textContent.includes(n))?.click(), nome);
const painelTem = (p, re) => p.evaluate(r => new RegExp(r).test(document.getElementById('r6Painel')?.textContent || ''), re);
const recarregarC5 = (p, silencioso = false) => p.evaluate(s => window.R6C5.carregar(conversaAtual, { silencioso: s }), silencioso);
const limparCampo = p => p.evaluate(() => { const c = document.getElementById('campoMensagem'); c.value = ''; c.dispatchEvent(new Event('input')); c.blur(); });
const campo = p => p.evaluate(() => document.getElementById('campoMensagem').value);
const atalho = async (p, codigo) => { await p.keyboard.down('Alt'); await p.keyboard.press(codigo); await p.keyboard.up('Alt'); };

(async () => {
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
  try {
    /* ---------- ?aba=integracoes (pedido do Comunicar; conferência permanente) ---------- */
    {
      const p = await abrir('admin', 1440, '&aba=integracoes');
      ok('[?aba=integracoes] abre direto a aba Integrações para o administrador', await ate(p, () => { const a = document.getElementById('aba-integracoes'); return a && getComputedStyle(a).display !== 'none' && !a.hidden; }));
      ok('[?aba=integracoes] o campo da chave nova recebe o foco e a caixa é destacada', await ate(p, () => document.activeElement && document.activeElement.id === 'chaveNova' && document.getElementById('chaveBox').classList.contains('destaque-chave')));
      ok('[?aba=integracoes] o parâmetro sai do endereço (não reabre ao recarregar)', await p.evaluate(() => !location.search.includes('aba=')));
      await p.ctx.close();
      const q = await abrir('atendente', 1440, '&aba=integracoes');
      ok('[?aba=integracoes] atendente não ganha a tela de administrador: recebe o aviso', await ate(q, () => /administrador|não está disponível/i.test(document.getElementById('toast')?.textContent || document.body.innerText), null, 6000));
      await q.ctx.close();
    }

    for (const w of [1440, 375]) {
      await c5({ reset: true });
      await fetch(BASE + '/api/_r6_etapa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etapa: 'em_execucao', reset: true }) });
      const p = await abrir('admin', w);

      /* ---------- fila: pediu horário, recusou ---------- */
      ok(`[${w}] linha da Camila ganha o chip "pediu horário" (pré-agendamento do Orçador)`, await ate(p, () => { const l = [...document.querySelectorAll('.conversa')].find(c => c.textContent.includes('Camila')); return l && /pediu horário/i.test(l.textContent); }));
      ok(`[${w}] o pedido de horário aparece uma vez só na linha (sem chip repetido)`, await p.evaluate(() => { const l = [...document.querySelectorAll('.conversa')].find(c => c.textContent.includes('Camila')); return l && (l.textContent.match(/pediu horário/gi) || []).length === 1; }));
      ok(`[${w}] filtro "Pediu horário" mostra só quem pediu`, await (async () => {
        await p.evaluate(() => document.querySelector('.chip[data-status="r6_pre"]').click());
        await espera(500);
        return p.evaluate(() => { const l = [...document.querySelectorAll('.conversa')]; return l.length === 1 && l[0].textContent.includes('Camila'); });
      })());
      ok(`[${w}] filtro "Recusou" vazio explica por quê (não cai no texto genérico)`, await (async () => {
        await p.evaluate(() => document.querySelector('.chip[data-status="r6_recusou"]').click());
        await espera(500);
        return p.evaluate(() => /Ninguém recusou orçamento nos últimos 14 dias/.test(document.getElementById('listaConversas').textContent));
      })());
      ok(`[${w}] os outros filtros da fila também têm texto próprio quando vazios`, await p.evaluate(async () => {
        const falta = [];
        for (const f of ['r6_urgentes', 'r6_patio', 'r6_orcamento', 'r6_falhas', 'r6_recusou', 'r6_pre']) if (!TEXTO_VAZIO_FILTRO[f]) falta.push(f);
        return falta.length === 0;
      }));
      await c5({ orc: 'recusado' });
      await p.evaluate(() => window.R6Tela.atualizarFila({ forcar: true }));
      ok(`[${w}] depois que o cliente recusa, o filtro "Recusou" mostra a Camila`, await ate(p, () => { const l = [...document.querySelectorAll('.conversa')]; return l.length === 1 && l[0].textContent.includes('Camila') && /Recusou|Recusado/.test(l[0].textContent); }));
      await p.evaluate(() => document.querySelector('.chip[data-status=""]').click());
      await c5({ orc: 'visto' });
      await p.evaluate(() => window.R6Tela.atualizarFila({ forcar: true }));
      await espera(400);

      /* ---------- ficha: Orçador ao vivo ---------- */
      await abrirConv(p, 'Camila');
      ok(`[${w}] faixa "Pediu horário pela página do orçamento" com o dia, a hora e o número do orçamento`, await ate(p, () => { const f = document.querySelector('#r6Painel .c5-pre'); return f && /Pediu horário pela página do orçamento/.test(f.textContent) && /09:00/.test(f.textContent) && /orçamento nº 87/.test(f.textContent); }));
      ok(`[${w}] faixa "Abriu o orçamento nº 87 (viu há 3 h) e não respondeu"`, await ate(p, () => { const f = document.querySelector('#r6Painel .c5-visto'); return f && /Abriu o orçamento nº 87/.test(f.textContent) && /viu há 3 h/.test(f.textContent); }));
      ok(`[${w}] bloco Orçamentos mostra "ao vivo", o valor, "viu há" e deixa o antigo em "Anteriores"`, await ate(p, () => { const b = document.querySelector('#r6Painel [data-bloco="orcamentos"]'); return b && /ao vivo/.test(b.textContent) && /1\.180,00/.test(b.textContent) && /viu há 3 h/.test(b.textContent) && /Anteriores \(1\)/.test(b.textContent); }));
      ok(`[${w}] chip do cabeçalho do chat fala do orçamento ("viu há 3 h") e do pedido de horário`, await ate(p, () => { const c = document.getElementById('r6ChipsChat'); return c && !c.hidden && /Nº 87/.test(c.textContent) && /viu há 3 h/.test(c.textContent) && /pediu/.test(c.textContent); }));
      ok(`[${w}] o servidor recebeu o token de quem está logado (nunca vazio) ao pedir o Orçador`, await (async () => { const e = await c5({}); return e.chamadas >= 1 && e.tokens.every(t => /^Bearer mock-/.test(t)); })());
      if (w === 1440) await p.screenshot({ path: OUT + 'ficha-1440.png' });

      /* ---------- botões da faixa e dos cartões ---------- */
      await p.evaluate(() => { window.__abertos = []; });
      await p.evaluate(() => document.querySelector('#r6Painel [data-c5="pre-agenda"]').click());
      ok(`[${w}] "Confirmar na Agenda" abre a Agenda em aba nomeada com o agendamento`, await p.evaluate(() => { const a = window.__abertos[0]; return a && a.n === 'indycar-agenda' && /agendamento=a-pre-1/.test(a.u) && /^https:\/\/indycar-agendamentos\.onrender\.com/.test(a.u); }), JSON.stringify(await p.evaluate(() => window.__abertos)));
      await limparCampo(p);
      await p.evaluate(() => document.querySelector('#r6Painel [data-c5="pre-responder"]').click());
      const resp = await campo(p);
      ok(`[${w}] "Responder" ao pré-agendamento põe o texto no campo, sem preço e sem enviar`, /pedido de horário/.test(resp) && !/R\$\s?\d/.test(resp) && /Camila, /.test(resp), resp);
      await p.evaluate(() => { const c = document.getElementById('campoMensagem'); c.value = 'Camila, só um minuto que já volto'; c.dispatchEvent(new Event('input')); });
      await p.evaluate(() => document.querySelector('#r6Painel .c5-visto [data-c5="retorno"]').click());
      const dep = await campo(p);
      ok(`[${w}] com rascunho no campo, o texto pronto entra EMBAIXO e o rascunho fica`, dep.startsWith('Camila, só um minuto que já volto') && /olhou o orçamento nº 87/.test(dep), dep);
      await limparCampo(p);
      await p.evaluate(() => { window.__abertos = []; document.querySelector('#r6Painel [data-c5="abrir-orc"]').click(); });
      ok(`[${w}] "Abrir no Orçador" vai para #/historico/<id> na aba indycar-orcador`, await p.evaluate(() => { const a = window.__abertos[0]; return a && a.n === 'indycar-orcador' && /#\/historico\/c5000000-0000-4000-8000-000000000087$/.test(a.u); }));
      await p.evaluate(() => document.querySelector('#r6Painel [data-c5="link-orc"]').click());
      ok(`[${w}] "Colar link do cliente" põe o link da página do orçamento no campo`, /indycar-orcador\.netlify\.app\/#\/o\/tok12345678/.test(await campo(p)));
      await limparCampo(p);
      ok(`[${w}] bloco "O sistema sugere" lista as ações do 360 (sem a de não-mandar-mensagens)`, await p.evaluate(() => { const b = document.querySelector('#r6Painel .c5-sug'); return b && b.querySelectorAll('.c5-acao').length === 2 && /Dar um retorno sobre o orçamento/.test(b.textContent) && !/Pediu para não receber/.test(b.textContent); }));
      await p.evaluate(() => { window.__abertos = []; document.querySelector('#r6Painel [data-c5="acao-abrir"]').click(); });
      ok(`[${w}] "Abrir ↗" de uma sugestão respeita a aba nomeada e o domínio da casa`, await p.evaluate(() => window.__abertos[0] && window.__abertos[0].n === 'indycar-orcador'));
      await p.evaluate(() => document.querySelector('#r6Painel [data-c5="acao-texto"]').click());
      ok(`[${w}] "Colar texto" de uma sugestão põe a frase no campo`, /conseguiu ver o orçamento/.test(await campo(p)));
      await limparCampo(p);

      /* ---------- teclado ---------- */
      await p.evaluate(() => { window.__abertos = []; });
      await atalho(p, 'KeyO');
      ok(`[${w}] Alt+O abre o orçamento do cliente no Orçador`, await ate(p, () => window.__abertos[0] && /#\/historico\//.test(window.__abertos[0].u), null, 3000));
      await atalho(p, 'KeyL');
      ok(`[${w}] Alt+L cola o link para o cliente acompanhar o carro`, await ate(p, () => /indycar-patio\.netlify\.app\/c\/abc123/.test(document.getElementById('campoMensagem').value), null, 3000));
      await limparCampo(p);
      const antesEm = await p.evaluate(() => window.R6C5.estado.em);
      await atalho(p, 'KeyR');
      ok(`[${w}] Alt+R atualiza a ficha na hora`, await ate(p, (a) => window.R6C5.estado.em > a, antesEm, 4000));
      await p.evaluate(() => { document.body.focus(); });
      await p.keyboard.press('?');
      ok(`[${w}] a lista de atalhos (?) traz Alt+O, Alt+L, Alt+R e Alt+G`, await ate(p, () => { const t = document.getElementById('listaTeclas')?.textContent || ''; return /Alt\s*\+\s*O|AltO|Alt.*Orçador/.test(t) && /Alt.*link para o cliente acompanhar/.test(t) && /Alt.*Atualizar a ficha/.test(t) && /Alt.*carros da oficina/.test(t); }, null, 4000));
      await p.keyboard.press('Escape');
      await p.evaluate(() => document.querySelectorAll('.modal-bg.aberto').forEach(m => m.classList.remove('aberto')));

      /* ---------- mudanças com a conversa aberta (avisos) ---------- */
      await c5({ orc: 'enviado' });
      await recarregarC5(p);
      await ate(p, () => !document.querySelector('#r6Painel .c5-visto'));
      await c5({ orc: 'visto', vistoNovo: true });
      await recarregarC5(p, true);
      ok(`[${w}] aviso na tela quando o cliente abre o orçamento com a conversa aberta`, await ate(p, () => /abriu o orçamento nº 87/.test(document.getElementById('toast')?.textContent || ''), null, 4000));
      await c5({ orc: 'recusado', vistoNovo: false });
      await recarregarC5(p, true);
      ok(`[${w}] aviso na tela quando o cliente recusa`, await ate(p, () => /recusou o orçamento nº 87/.test(document.getElementById('toast')?.textContent || ''), null, 4000));
      ok(`[${w}] faixa "Recusou" mostra o motivo escrito pelo cliente`, await ate(p, () => { const f = document.querySelector('#r6Painel .c5-recusou'); return f && /achei caro, vou pesquisar/.test(f.textContent); }));
      ok(`[${w}] chip do chat vira "recusou"`, await p.evaluate(() => /🙅 Nº 87 recusou/.test(document.getElementById('r6ChipsChat').textContent)));
      await p.evaluate(() => document.querySelector('#r6Painel .c5-recusou [data-c5="motivo"]').click());
      const mot = await campo(p);
      ok(`[${w}] "Perguntar o motivo" não promete desconto nem cita preço`, /não fez sentido/.test(mot) && !/desconto|R\$\s?\d/i.test(mot) && (mot.match(/\?/g) || []).length === 1, mot);
      await limparCampo(p);
      if (w === 375) await p.screenshot({ path: OUT + 'ficha-recusou-375.png' });
      await c5({ orc: 'aprovado' });
      await recarregarC5(p, true);
      ok(`[${w}] aprovado em parte mostra só o valor aprovado`, await ate(p, () => { const b = document.querySelector('#r6Painel [data-bloco="orcamentos"]'); return b && /Aprovado em parte/.test(b.textContent) && /400,00/.test(b.textContent) && !/1\.180,00/.test(b.textContent); }));
      await c5({ orc: 'visto', semPreco: true });
      await recarregarC5(p);
      ok(`[${w}] papel que não vê preço: o cartão não mostra valor nenhum`, await ate(p, () => { const b = document.querySelector('#r6Painel [data-bloco="orcamentos"]'); return b && /Nº 87/.test(b.textContent) && !/R\$/.test(b.textContent); }));
      await c5({ semPreco: false });

      /* ---------- erros e avisos claros ---------- */
      await c5({ negado: true });
      await recarregarC5(p);
      ok(`[${w}] sem permissão no Orçador: aviso em português e o resto da ficha continua`, await ate(p, () => { const f = document.querySelector('#r6Painel .c5-aviso'); return f && /Seu acesso não enxerga o Orçador/.test(f.textContent) && /Em execução|Pronto/.test(document.getElementById('r6Painel').textContent); }));
      await c5({ negado: false, caiu: true });
      await recarregarC5(p);
      ok(`[${w}] servidor fora do ar: aviso sem texto técnico e botão "Tentar de novo"`, await ate(p, () => { const f = document.querySelector('#r6Painel .c5-aviso'); return f && /Não consegui ler o Orçador agora/.test(f.textContent) && !/SUPABASE|SERVICE_ROLE/.test(f.textContent) && !!f.querySelector('[data-c5="recarregar"]'); }));
      await c5({ caiu: false });
      await p.evaluate(() => document.querySelector('#r6Painel [data-c5="recarregar"]').click());
      ok(`[${w}] "Tentar de novo" volta ao normal quando o servidor volta`, await ate(p, () => !document.querySelector('#r6Painel .c5-aviso') && !!document.querySelector('#r6Painel [data-bloco="orcamentos"] .r6-card')));
      await c5({ xss: true, orc: 'recusado' });
      await recarregarC5(p);
      ok(`[${w}] texto do cliente com HTML aparece como texto e não executa`, await ate(p, () => /achei caro/.test(document.getElementById('r6Painel').textContent) && /<img/.test(document.querySelector('#r6Painel .c5-recusou').textContent)) && await p.evaluate(() => window.__xss !== 1 && !document.querySelector('#r6Painel img')));
      await c5({ xss: false, orc: 'visto' });
      await recarregarC5(p);

      /* ---------- troca rápida de conversa não deixa faixa da outra ---------- */
      await abrirConv(p, 'Vocês fazem');
      ok(`[${w}] ao trocar de conversa, a faixa e o chip de pedido de horário da Camila somem`, await ate(p, () => !document.querySelector('#r6Painel .c5-pre') && !/pediu/.test(document.getElementById('r6ChipsChat').textContent)));
      await abrirConv(p, 'Camila');
      ok(`[${w}] ao voltar, tudo reaparece`, await ate(p, () => !!document.querySelector('#r6Painel .c5-pre') && !!document.querySelector('#r6Painel .c5-visto')));

      /* ---------- carros sem conversa ---------- */
      ok(`[${w}] barra "carros sem conversa" mostra 2 carros e 1 pronto`, await ate(p, () => { const b = document.getElementById('c5Barra'); return b && !b.hidden && /2 carros sem conversa/.test(b.textContent) && /1 pronto/.test(b.textContent); }));
      await p.evaluate(() => document.querySelector('#c5Barra [data-c5="carros"]').click());
      ok(`[${w}] a janela lista o carro pronto primeiro, com nome, carro, placa e etapa`, await ate(p, () => { const m = document.getElementById('c5Carros'); const c = m && m.querySelector('.c5-carro'); return m && m.classList.contains('aberto') && c && /José Lima/.test(c.textContent) && /Pronto para retirar/.test(c.textContent) && /Gol 2015/.test(c.textContent) && /XYZ9K88/.test(c.textContent); }));
      ok(`[${w}] carro sem telefone: "Abrir conversa" desabilitado e sem "Copiar telefone"`, await p.evaluate(() => { const c = document.querySelectorAll('#c5Carros .c5-carro')[1]; return c && /Cliente sem nome/.test(c.textContent) && c.querySelector('[data-c5="carro-conversa"]').disabled && !c.querySelector('[data-c5="carro-copiar"]'); }));
      if (w === 375) await p.screenshot({ path: OUT + 'carros-375.png' });
      ok(`[${w}] a janela cabe na tela (sem rolagem lateral)`, await p.evaluate(() => { const m = document.querySelector('#c5Carros .modal').getBoundingClientRect(); return m.left >= 0 && m.right <= innerWidth + 1; }));
      await p.evaluate(() => { window.__abertos = []; document.querySelector('#c5Carros [data-c5="carro-patio"]').click(); });
      ok(`[${w}] "Abrir no Pátio" vai para a OS na aba indycar-patio`, await p.evaluate(() => { const a = window.__abertos[0]; return a && a.n === 'indycar-patio' && /\?os=d0000000/.test(a.u) && /^https:\/\/indycar-patio\.netlify\.app/.test(a.u); }));
      await p.evaluate(() => document.querySelector('#c5Carros [data-c5="carro-conversa"]:not([disabled])').click());
      ok(`[${w}] "Abrir conversa" sem conversa antiga abre "Nova conversa" já com o telefone e o nome`, await ate(p, () => { const m = document.getElementById('modalNovaBg'); return m.classList.contains('aberto') && /99123/.test(document.getElementById('novaTelefone').value) && document.getElementById('novaNome').value === 'José Lima'; }));
      await p.evaluate(() => document.getElementById('modalNovaBg').classList.remove('aberto'));
      await atalho(p, 'KeyG');
      ok(`[${w}] Alt+G abre a janela dos carros e Esc fecha`, await ate(p, () => document.getElementById('c5Carros').classList.contains('aberto'), null, 3000));
      await p.keyboard.press('Escape');
      ok(`[${w}] Esc fecha a janela dos carros`, await ate(p, () => !document.getElementById('c5Carros').classList.contains('aberto'), null, 3000));
      await c5({ carros: 'nenhum' });
      await p.evaluate(() => window.R6C5.carregarCarros({ forcar: true }));
      ok(`[${w}] sem carros soltos a barra some (não ocupa espaço)`, await ate(p, () => document.getElementById('c5Barra').hidden));
      await atalho(p, 'KeyG');
      ok(`[${w}] Alt+G sem carros avisa em vez de abrir janela vazia`, await ate(p, () => /Todos os carros na oficina já têm conversa/.test(document.getElementById('toast')?.textContent || ''), null, 3000));
      await c5({ carros: 'erro' });
      await p.evaluate(() => window.R6C5.carregarCarros({ forcar: true }));
      await c5({ carros: 'dois' });

      /* ---------- marcar visíveis como lidas ---------- */
      await p.evaluate(async () => { const ids = conversasFiltradas().slice(0, 3).map(c => c.id); await sb.from('conversas').update({ nao_lidas: 2 }).in('id', ids); conversasFiltradas().slice(0, 3).forEach(c => { c.nao_lidas = 2; }); renderConversas(); });
      const naoLidasAntes = await p.evaluate(() => conversasFiltradas().filter(c => c.nao_lidas > 0).length);
      await p.evaluate(() => document.getElementById('c5Lidas').click());
      ok(`[${w}] "✓✓" marca como lidas as conversas visíveis (eram ${naoLidasAntes})`, naoLidasAntes > 0 && await ate(p, () => conversasFiltradas().every(c => !(c.nao_lidas > 0)), null, 4000));

      ok(`[${w}] sem rolagem lateral`, await semRolagemX(p));
      ok(`[${w}] botões novos têm pelo menos 36 px de altura (dedo no celular)`, await p.evaluate(() => [...document.querySelectorAll('#r6Painel .c5-faixa .r6-btn, #r6Painel .c5-acao .r6-btn')].every(b => b.getBoundingClientRect().height >= 35)));
      if (w === 1440) await p.screenshot({ path: OUT + 'tela-1440.png' });
      ok(`[${w}] sem erro de console`, p.erros.length === 0, p.erros.join(' | '));
      await p.ctx.close();
    }

    /* ---------- atendente ---------- */
    {
      await c5({ reset: true });
      const p = await abrir('atendente', 1440);
      await abrirConv(p, 'Camila');
      ok('[atendente] vê o Orçador ao vivo, o pré-agendamento e a barra de carros', await ate(p, () => !!document.querySelector('#r6Painel .c5-pre') && !!document.querySelector('#r6Painel .c5-visto') && !document.getElementById('c5Barra').hidden));
      ok('[atendente] sem erro de console', p.erros.length === 0, p.erros.join(' | '));
      await p.ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${bons}/${total} OK`);
  process.exit(bons === total ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
