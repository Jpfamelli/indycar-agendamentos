/* Roteiro da RODADA 9 (Claude) no Chrome, contra o servidor de MENTIRA (scripts/mock-server.mjs).
   Nada sai desta máquina: toda chamada que não seja para localhost é abortada (Supabase real,
   CodeWords, fontes). Nenhuma mensagem é enviada e nada é gravado em banco de verdade.

   Confere, em 375 e 1440 px, nos temas escuro e claro, em todas as telas:
     - axe-core sem violação séria ou crítica;
     - no celular, tudo que se toca tem 44 px;
     - sem rolagem lateral da página;
     - conversa aberta no celular com o WhatsApp parado: sobra altura para ler as mensagens.
   Uso: node scripts/roteiro-r9.cjs   (capturas em qa-out/r9/, fora do git)
   AXE=caminho/axe.min.js troca a cópia do axe-core (padrão: a de indycar-ads). */
const puppeteer = require('C:/Users/USER/.claude/backups/indycar-ferramentas/node_modules/puppeteer-core');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const AXE = fs.readFileSync(process.env.AXE || 'C:/Users/USER/.claude/backups/indycar-ads/node_modules/axe-core/axe.min.js', 'utf8');
const PORT = process.env.PORT || '3473';
const SAIDA = path.join(__dirname, '..', 'qa-out', 'r9');
const ABAS = ['conversas', 'funil', 'atalhos', 'tarefas', 'ia', 'relatorios', 'equipe', 'auditoria', 'integracoes', 'etapas', 'config'];
const espera = ms => new Promise(r => setTimeout(r, ms));
let total = 0, bons = 0;
const ok = (nome, cond, extra = '') => { total++; if (cond) bons++; console.log(`${cond ? 'OK    ' : 'FALHOU'} ${nome}${cond ? '' : ' :: ' + extra}`); };

async function novaPagina(browser, largura, tema, consulta = '') {
  const p = await browser.newPage();
  await p.setViewport({ width: largura, height: largura < 500 ? 812 : 900 });
  await p.setRequestInterception(true);
  p.on('request', r => {
    const u = new URL(r.url());
    if (['localhost', '127.0.0.1'].includes(u.hostname) || u.protocol === 'data:' || u.protocol === 'blob:') r.continue(); else r.abort();
  });
  p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  await p.evaluateOnNewDocument(t => { try { localStorage.setItem('indycar_tema', t); } catch {} }, tema);
  await p.goto(`http://localhost:${PORT}/?papel=admin${consulta}`, { waitUntil: 'networkidle2' });
  await espera(800);
  return p;
}

/* roda dentro da página (o axe já foi injetado) */
async function medir(w) {
  const ax = await axe.run(document, { resultTypes: ['violations'] });
  const serias = ax.violations.filter(v => ['serious', 'critical'].includes(v.impact))
    .map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
  const visivel = el => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0 && el.offsetParent !== null; };
  const pequenos = [];
  const raiz = document.querySelector('.modal-bg.aberto') || document;
  if (w < 500) for (const el of raiz.querySelectorAll('button, a[href], select, input:not([type=hidden]), textarea, [role=button], summary')) {
    if (!visivel(el) || getComputedStyle(el).pointerEvents === 'none') continue;   // etiqueta que não recebe toque não é alvo
    const b = el.getBoundingClientRect();
    if (el.type === 'checkbox' || el.type === 'radio') { const l = el.closest('label'); if (l && l.getBoundingClientRect().height >= 43.5) continue; }
    if (b.height < 43.5 || b.width < 43.5) pequenos.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(' ')[0]} ${Math.round(b.width)}x${Math.round(b.height)}`);
  }
  const lateral = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  return { serias, pequenos: [...new Set(pequenos)], lateral };
}

(async () => {
  fs.mkdirSync(SAIDA, { recursive: true });
  const mock = spawn(process.execPath, [path.join(__dirname, 'mock-server.mjs')], { env: { ...process.env, PORT }, stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await espera(250); } }
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });

    for (const largura of [375, 1440]) for (const tema of ['escuro', 'claro']) {
      const p = await novaPagina(browser, largura, tema);
      for (const aba of ABAS) {
        await p.evaluate(a => document.querySelector(`[data-aba="${a}"]`)?.click(), aba);
        await espera(700);
        if (aba === 'conversas') { await p.evaluate(() => document.querySelector('.conversa')?.click()); await espera(1000); }
        await p.evaluate(AXE);
        const r = await p.evaluate(medir, largura);
        const onde = `${aba} ${largura}px ${tema}`;
        ok(`${onde}: axe-core sem violação séria`, r.serias.length === 0, r.serias.join(' || '));
        if (largura < 500) ok(`${onde}: tudo que se toca tem 44 px`, r.pequenos.length === 0, r.pequenos.slice(0, 8).join(' | '));
        ok(`${onde}: sem rolagem lateral da página`, !r.lateral);
        await p.screenshot({ path: path.join(SAIDA, `depois-${aba}-${largura}-${tema}.png`) });
      }
      ok(`${largura}px ${tema}: nenhum erro de JavaScript na tela`, p.erros.length === 0, p.erros.slice(0, 3).join(' | '));
      await p.close();
    }

    /* Conversa aberta no celular com o WhatsApp parado (o estado de hoje) */
    for (const altura of [812, 667]) {
      const p = await novaPagina(browser, 375, 'escuro');
      await p.setViewport({ width: 375, height: altura });
      await p.evaluate(() => document.querySelector('.conversa')?.click());
      await espera(1200);
      const m = await p.evaluate(() => {
        const h = s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : -1; };
        const vis = s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; };
        return { mensagens: h('#mensagensWrap'), barra: vis('.sidebar'), faixa: vis('#faixaSaude'), zap: vis('#r6Zap'), r7: vis('#r7Retomada'),
          acoes: h('#chatAcoes'), fim: Math.round(document.querySelector('.chat-envio').getBoundingClientRect().bottom), tela: innerHeight };
      });
      ok(`conversa 375x${altura}: sobra altura para ler as mensagens (>= 120 px)`, m.mensagens >= 120, `${m.mensagens} px`);
      ok(`conversa 375x${altura}: o campo de resposta termina dentro da tela`, m.fim <= m.tela + 1, `${m.fim} > ${m.tela}`);
      ok(`conversa 375x${altura}: a barra de telas dá lugar à conversa`, !m.barra);
      ok(`conversa 375x${altura}: um aviso só de WhatsApp parado (o da conversa)`, m.zap && !m.r7 && !m.faixa, JSON.stringify(m));
      ok(`conversa 375x${altura}: ações do cabeçalho numa linha só`, m.acoes <= 46, `${m.acoes} px`);
      await p.screenshot({ path: path.join(SAIDA, `depois-conversa-aberta-375x${altura}.png`) });
      await p.evaluate(() => document.querySelector('#btnVoltarLista')?.click());
      await espera(500);
      const volta = await p.evaluate(() => {
        const f = document.querySelector('#faixaSaude');
        return { barra: getComputedStyle(document.querySelector('.sidebar')).display !== 'none',
          faixa: !f.hidden && getComputedStyle(f).display !== 'none', hFaixa: Math.round(f.getBoundingClientRect().height) };
      });
      ok(`lista 375x${altura}: a seta devolve a barra de telas e a faixa de aviso`, volta.barra && volta.faixa, JSON.stringify(volta));
      ok(`lista 375x${altura}: a faixa do WhatsApp parado ocupa no máximo 96 px`, volta.hFaixa <= 96, `${volta.hFaixa} px`);
      await p.screenshot({ path: path.join(SAIDA, `depois-lista-375x${altura}.png`) });
      await p.close();
    }

    /* Celular: a lista (sem conversa aberta), as janelas e as telas de entrar */
    {
      const p = await novaPagina(browser, 375, 'escuro');
      await p.evaluate(AXE);
      let r = await p.evaluate(medir, 375);
      ok('lista 375px: tudo que se toca tem 44 px', r.pequenos.length === 0, r.pequenos.slice(0, 8).join(' | '));
      ok('lista 375px: axe-core sem violação séria', r.serias.length === 0, r.serias.join(' || '));
      const etiqueta = await p.evaluate(() => { const e = document.querySelector('.conversa .plaquinha'); return e ? getComputedStyle(e).pointerEvents : 'sem etiqueta'; });
      ok('lista 375px: tocar na etiqueta de etapa abre a conversa (a etiqueta não é alvo próprio)', etiqueta === 'none', etiqueta);
      const ids = await p.evaluate(() => [...document.querySelectorAll('.modal-bg')].map(b => b.id));
      for (const id of ids) {
        await p.evaluate(i => { document.querySelectorAll('.modal-bg.aberto').forEach(b => b.classList.remove('aberto')); document.getElementById(i).classList.add('aberto'); }, id);
        await espera(300);
        r = await p.evaluate(medir, 375);
        ok('janela ' + id + ' 375px: tudo que se toca tem 44 px e sem violação séria', r.pequenos.length === 0 && r.serias.length === 0, r.pequenos.concat(r.serias).slice(0, 6).join(' | '));
      }
      await p.evaluate(() => document.querySelectorAll('.modal-bg.aberto').forEach(b => b.classList.remove('aberto')));

      /* Nova conversa: telefone errado não cria nada e diz o porquê; o certo passa */
      await p.evaluate(() => { window.__gravou = 0; const f0 = window.fetch; window.fetch = function (u, o) { if (o && o.method && o.method !== 'GET' && String(u).includes('conversas')) window.__gravou++; return f0.apply(this, arguments); }; });
      await p.evaluate(() => document.getElementById('modalNovaBg').classList.add('aberto'));
      const tipo = await p.evaluate(() => { const c = document.getElementById('novaTelefone'); return c.type + '/' + c.inputMode; });
      ok('Nova conversa: o campo abre o teclado de telefone', tipo === 'tel/tel', tipo);
      await p.type('#novaTelefone', '9999-8888');
      await p.evaluate(() => document.getElementById('formNovaConversa').requestSubmit());
      await espera(400);
      const erro = await p.evaluate(() => { const e = document.getElementById('novaTelefoneErro'); return { visivel: !e.hidden, texto: e.textContent, invalido: document.getElementById('novaTelefone').getAttribute('aria-invalid'), aberto: document.getElementById('modalNovaBg').classList.contains('aberto') }; });
      ok('Nova conversa: telefone sem DDD mostra o porquê e a janela continua aberta', erro.visivel && /DDD/.test(erro.texto) && erro.invalido === 'true' && erro.aberto, JSON.stringify(erro));
      await p.type('#novaTelefone', '1');
      const sumiu = await p.evaluate(() => document.getElementById('novaTelefoneErro').hidden);
      ok('Nova conversa: o aviso some quando a pessoa volta a digitar', sumiu);
      await p.close();

      for (const papel of ['deslogado', 'trocarsenha', 'mfa', 'semapp', 'agenda']) {
        const q = await novaPagina(browser, 375, 'escuro', '');
        await q.goto('http://localhost:' + PORT + '/?papel=' + papel, { waitUntil: 'networkidle2' });
        await espera(700);
        await q.evaluate(AXE);
        const x = await q.evaluate(medir, 375);
        ok('tela de ' + papel + ' 375px: 44 px e sem violação séria', x.pequenos.length === 0 && x.serias.length === 0, x.pequenos.concat(x.serias).slice(0, 6).join(' | '));
        await q.close();
      }
    }

    /* Computador da recepção (1366 x 768) com o WhatsApp parado e proposta da IA: o pior caso */
    {
      const p = await novaPagina(browser, 1366, 'escuro');
      await p.setViewport({ width: 1366, height: 768 });
      await p.evaluate(() => document.querySelector('.conversa')?.click());
      await espera(1200);
      const m = await p.evaluate(() => {
        const r = s => document.querySelector(s)?.getBoundingClientRect();
        return { mensagens: Math.round(r('#mensagensWrap').height), fim: Math.round(r('.chat-envio').bottom), tela: innerHeight,
          lista: Math.round(r('#listaConversas').top), r7: !!document.querySelector('#r7Retomada') && getComputedStyle(document.querySelector('#r7Retomada')).display !== 'none',
          titulo: (() => { const t = document.querySelector('.cop-titulo'); return !t || t.scrollWidth <= t.clientWidth + 1; })() };
      });
      ok('conversa 1366x768: sobra altura para ler as mensagens (>= 150 px)', m.mensagens >= 150, m.mensagens + ' px');
      ok('conversa 1366x768: o campo de resposta termina dentro da tela', m.fim <= m.tela + 1, m.fim + ' > ' + m.tela);
      ok('lista 1366x768: as conversas começam antes de 560 px (era 658)', m.lista <= 560, m.lista + ' px');
      ok('conversa 1366x768: um aviso só de WhatsApp parado na conversa', !m.r7);
      ok('ficha 1366x768: o título do copiloto aparece inteiro', m.titulo);
      await p.screenshot({ path: path.join(SAIDA, 'depois-conversa-aberta-1366x768.png') });
      await p.close();
    }
  } finally {
    if (browser) await browser.close();
    mock.kill();
  }
  console.log(`\n${bons}/${total} conferências passaram`);
  process.exit(bons === total ? 0 : 1);
})();
