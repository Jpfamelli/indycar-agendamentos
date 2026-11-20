/* Roteiro da RODADA 10 (Claude) no Chrome, contra o servidor de MENTIRA (scripts/mock-server.mjs).
   Nada sai desta máquina: toda chamada que não seja para o servidor local é abortada. Nenhuma
   mensagem é enviada e nada é gravado em banco de verdade.

   Confere, em 375 e 1440 px:
     - as perguntas da tela (excluir conversa, excluir atalho, marcar como lidas, resolvi por outro meio)
       abrem na janela do próprio app, e o confirm()/prompt() do navegador não aparece mais;
     - ação que apaga abre com o foco em Cancelar e Esc fecha só a pergunta;
     - excluir conversa só libera o botão quando o nome digitado confere;
     - a janela da pergunta fica por cima da janela "não saíram";
     - no tema claro a logo não é mais uma placa preta (arte com fundo transparente).
   Uso: node scripts/roteiro-r10.cjs   (capturas em qa-out/r10/, fora do git) */
const puppeteer = require('C:/Users/USER/.claude/backups/indycar-ferramentas/node_modules/puppeteer-core');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { permiteRequisicao } = require('./barreira-navegador.cjs');

const PORT = process.env.PORT || '3474';
const SAIDA = path.join(__dirname, '..', 'qa-out', 'r10');
const CAMILA = 'c0000000-0000-4000-8000-000000000001';
const espera = ms => new Promise(r => setTimeout(r, ms));
let total = 0, bons = 0;
const ok = (nome, cond, extra = '') => { total++; if (cond) bons++; console.log(`${cond ? 'OK    ' : 'FALHOU'} ${nome}${cond ? '' : ' :: ' + extra}`); };

async function novaPagina(browser, largura, tema, consulta = '') {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: largura, height: largura < 500 ? 812 : 900 });
  await p.setRequestInterception(true);
  p.on('request', r => (permiteRequisicao(r.url(), 'http://localhost:' + PORT) ? r.continue() : r.abort()));
  p.nativos = [];
  p.on('dialog', d => { p.nativos.push(d.message()); d.dismiss(); });   // se aparecer janela do navegador, o roteiro acusa
  p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  await p.evaluateOnNewDocument(t => { try { localStorage.setItem('indycar_tema', t); } catch {} }, tema);
  await p.goto(`http://localhost:${PORT}/?papel=admin&saude=ok${consulta}`, { waitUntil: 'networkidle2' });
  await espera(1000);
  p.ctx = ctx;
  return p;
}
const pergunta = p => p.evaluate(() => {
  const bg = document.getElementById('modalConfirmarBg'), okb = document.getElementById('btnConfirmarOk');
  const b = okb.getBoundingClientRect();
  const noTopo = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  return { aberta: bg.classList.contains('aberto'), marca: bg.dataset.pergunta || '', titulo: document.getElementById('confirmarTitulo').textContent,
    texto: document.getElementById('confirmarTexto').textContent, campo: !document.getElementById('confirmarCampoRotulo').hidden,
    valor: document.getElementById('confirmarCampo').value, okDesligado: okb.disabled, okTexto: okb.textContent, foco: document.activeElement?.id || '',
    porCima: noTopo === okb, altura: Math.round(b.height), alturaNao: Math.round(document.getElementById('btnConfirmarNao').getBoundingClientRect().height) };
});
const digitar = (p, v) => p.evaluate(v => { const c = document.getElementById('confirmarCampo'); c.value = v; c.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const cancelar = async p => { await p.evaluate(() => document.getElementById('btnConfirmarNao').click()); await espera(250); };

(async () => {
  fs.mkdirSync(SAIDA, { recursive: true });
  const mock = spawn(process.execPath, [path.join(__dirname, 'mock-server.mjs')], { env: { ...process.env, PORT }, stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await espera(250); } }
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });

    for (const largura of [1440, 375]) {
      const w = `[${largura}]`;
      /* ---------- excluir conversa: nome digitado ---------- */
      let p = await novaPagina(browser, largura, 'escuro', `&conversa=${CAMILA}`);
      await espera(800);
      const nome = await p.evaluate(() => (typeof conversaAtual !== 'undefined' && conversaAtual ? (conversaAtual.nome || conversaAtual.telefone) : ''));
      await p.evaluate(() => document.getElementById('btnExcluirConversa').click());
      await espera(350);
      let q = await pergunta(p);
      ok(`${w} excluir conversa pergunta na janela do app, com campo para digitar o nome`, q.aberta && q.marca === 'pergunta' && q.campo && /Excluir a conversa de/.test(q.titulo), JSON.stringify(q));
      ok(`${w} excluir conversa: botão desligado até o nome conferir`, q.okDesligado === true);
      await digitar(p, 'outro nome');
      ok(`${w} excluir conversa: nome errado continua desligado`, (await pergunta(p)).okDesligado === true);
      await digitar(p, String(nome).toUpperCase());
      ok(`${w} excluir conversa: nome certo (sem ligar para maiúscula) libera o botão`, (await pergunta(p)).okDesligado === false, nome);
      if (largura < 500) ok(`${w} botões da pergunta têm 44 px no celular`, q.altura >= 44 && q.alturaNao >= 44, `${q.altura} / ${q.alturaNao}`);
      await p.screenshot({ path: path.join(SAIDA, `depois-excluir-conversa-${largura}.png`) });
      await cancelar(p);
      ok(`${w} cancelar não apaga: a conversa segue aberta`, await p.evaluate(() => !document.getElementById('modalConfirmarBg').classList.contains('aberto') && typeof conversaAtual !== 'undefined' && !!conversaAtual));
      ok(`${w} excluir conversa: nenhuma janela do navegador`, p.nativos.length === 0, p.nativos.join(' | '));
      await p.ctx.close();

      /* ---------- excluir atalho: foco em Cancelar, Esc fecha só a pergunta ---------- */
      p = await novaPagina(browser, largura, 'escuro');
      await p.evaluate(() => document.querySelector('[data-aba="atalhos"]')?.click());
      await espera(700);
      await p.evaluate(() => { if (typeof ATALHOS !== 'undefined' && ATALHOS.length) abrirModalAtalho(ATALHOS[0]); });
      await espera(300);
      await p.evaluate(() => document.getElementById('btnExcluirAtalho').click());
      await espera(350);
      q = await pergunta(p);
      ok(`${w} excluir atalho pergunta na janela do app`, q.aberta && /Excluir o atalho/.test(q.titulo) && !q.campo, JSON.stringify(q));
      ok(`${w} ação que apaga abre com o foco em Cancelar`, q.foco === 'btnConfirmarNao', q.foco);
      await p.keyboard.press('Escape');
      await espera(300);
      ok(`${w} Esc fecha só a pergunta: a janela do atalho continua aberta e nada foi apagado`, await p.evaluate(() => !document.getElementById('modalConfirmarBg').classList.contains('aberto') && document.getElementById('modalAtalhoBg').classList.contains('aberto')));
      ok(`${w} excluir atalho: nenhuma janela do navegador`, p.nativos.length === 0, p.nativos.join(' | '));
      await p.ctx.close();

      /* ---------- marcar como lidas (não apaga: foco no botão de confirmar) ---------- */
      p = await novaPagina(browser, largura, 'escuro');
      const havia = await p.evaluate(() => (typeof conversas !== 'undefined' ? conversas.filter(c => c.nao_lidas > 0).length : 0));
      await p.evaluate(() => { window.R6C5.marcarVisiveisComoLidas(); });   // sem devolver a promessa: ela só termina quando a pergunta é respondida
      await espera(350);
      q = await pergunta(p);
      ok(`${w} marcar como lidas pergunta na janela do app`, havia === 0 ? true : (q.aberta && /como lida/.test(q.titulo) && q.foco === 'btnConfirmarOk'), JSON.stringify(q));
      if (q.aberta) await cancelar(p);
      ok(`${w} marcar como lidas: nenhuma janela do navegador`, p.nativos.length === 0, p.nativos.join(' | '));
      await p.ctx.close();

      /* ---------- não saíram: "Resolvi por outro meio" pede a nota na janela do app, por cima ---------- */
      p = await novaPagina(browser, largura, 'escuro');
      await p.evaluate(() => document.querySelector('#r6Zap [data-r6="nao-sairam"]')?.click());
      await espera(900);
      const temCartao = await p.evaluate(() => !!document.querySelector('#r6NaoSairam [data-r6="ns-resolvi"]'));
      if (temCartao) {
        await p.evaluate(() => document.querySelector('#r6NaoSairam [data-r6="ns-resolvi"]').click());
        await espera(350);
        q = await pergunta(p);
        ok(`${w} "Resolvi por outro meio" pede a nota na janela do app, já preenchida`, q.aberta && q.campo && q.valor === 'liguei para o cliente', JSON.stringify(q));
        ok(`${w} a pergunta fica por cima da janela "não saíram"`, q.porCima === true);
        await p.screenshot({ path: path.join(SAIDA, `depois-resolvi-por-outro-meio-${largura}.png`) });
        await cancelar(p);
        ok(`${w} cancelar a nota não marca nada: a janela "não saíram" continua aberta`, await p.evaluate(() => document.getElementById('r6NaoSairam').classList.contains('aberto')));
      } else ok(`${w} o servidor de mentira tem mensagem que não saiu`, false);
      ok(`${w} não saíram: nenhuma janela do navegador`, p.nativos.length === 0, p.nativos.join(' | '));
      ok(`${w} sem erro de script`, p.erros.length === 0, p.erros.join(' | '));
      await p.ctx.close();

      /* ---------- logo no tema claro ---------- */
      for (const tema of ['claro', 'escuro']) {
        p = await novaPagina(browser, largura, tema);
        const logo = await p.evaluate(async () => {
          const img = [...document.querySelectorAll('.logo-img')].find(i => i.getBoundingClientRect().width > 0);
          const cs = getComputedStyle(img);
          const arte = new Image(); arte.src = 'logo-claro.png'; await arte.decode().catch(() => {});
          const c = document.createElement('canvas'); c.width = arte.naturalWidth || 1; c.height = arte.naturalHeight || 1;
          const g = c.getContext('2d'); g.drawImage(arte, 0, 0);
          return { conteudo: cs.content, mistura: cs.mixBlendMode, largura: arte.naturalWidth, cantoAlfa: g.getImageData(2, 2, 1, 1).data[3], meioAlfa: g.getImageData(Math.floor(c.width * 0.6), Math.floor(c.height / 2) - 8, 1, 1).data[3] };
        });
        if (tema === 'claro') {
          ok(`${w} tema claro: a logo usa a arte de fundo transparente, sem mistura de cor`, /logo-claro\.png/.test(logo.conteudo) && logo.mistura === 'normal', JSON.stringify(logo));
          ok(`${w} tema claro: o fundo da arte é transparente (sem placa preta) e o vermelho está inteiro`, logo.largura > 0 && logo.cantoAlfa === 0 && logo.meioAlfa > 200, JSON.stringify(logo));
          const caixa = await p.evaluate(() => { const b = [...document.querySelectorAll('.logo-caixa')].find(i => i.getBoundingClientRect().width > 0).getBoundingClientRect(); return { x: Math.max(0, b.x - 8), y: Math.max(0, b.y - 8), width: b.width + 16, height: b.height + 16 }; });
          await p.screenshot({ path: path.join(SAIDA, `depois-logo-claro-${largura}.png`), clip: caixa });
        } else ok(`${w} tema escuro: a logo continua a de sempre`, !/logo-claro/.test(logo.conteudo) && logo.mistura === 'screen', JSON.stringify(logo));
        await p.ctx.close();
      }
    }
  } catch (e) { ok('roteiro rodou', false, e.stack || e.message); }
  finally { await browser?.close(); mock.kill(); }
  console.log(`\n${bons}/${total} OK`);
  process.exit(bons === total ? 0 : 1);
})();
