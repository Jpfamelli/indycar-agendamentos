/* Roteiro de navegador da RODADA 7 (C4): retomada calma do WhatsApp, links prontos, Agendar com horários reais, busca global, faixa "agora".
   Uso: PORT=3470 node scripts/mock-server.mjs   (outro terminal)   ·   BASE=http://localhost:3470 node scripts/roteiro-r7c4.cjs
   Confere em 1440 e 375 px. */
const puppeteer = require('C:/Users/USER/.claude/backups/indycar-ferramentas/node_modules/puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:3470';
const OUT = path.join(__dirname, 'shots-tela', 'r7c4-');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const espera = ms => new Promise(r => setTimeout(r, ms));
let total = 0, bons = 0;
const ok = (nome, cond, extra = '') => { total++; if (cond) bons++; console.log(`${cond ? 'OK  ' : 'FALHOU'} ${nome}${cond ? '' : ' — ' + extra}`); };
let browser;

async function abrir(papel, largura = 1440, extra = '') {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  p.erros = [];
  p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) p.erros.push(m.text()); });
  p.on('pageerror', e => p.erros.push('PAGEERROR ' + e.message));
  p.on('dialog', d => d.accept('ok'));
  await p.setViewport(largura < 600 ? { width: largura, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: largura, height: 900 });
  await p.goto(`${BASE}/?papel=${papel}&saude=ok${extra}`, { waitUntil: 'networkidle0' });
  await espera(1000);
  await p.evaluate(() => { window.__abertos = []; window.open = (u, n) => { window.__abertos.push({ u, n }); return { opener: null, focus() {} }; }; });
  p.ctx = ctx;
  return p;
}
const semRolagemX = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const ate = async (p, fn, arg, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await espera(150); } return false; };
const visivelEl = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; }, sel);
const abrirConv = (p, nome) => p.evaluate(n => [...document.querySelectorAll('.conversa')].find(c => c.textContent.includes(n))?.click(), nome);
const campo = p => p.evaluate(() => document.getElementById('campoMensagem').value);
const foto = async (p, nome) => { try { await p.screenshot({ path: OUT + nome + '.png' }); } catch { /* sem foto */ } };

(async () => {
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
  try {
    /* ---------- WhatsApp parado: aviso claro, nada sai sozinho ---------- */
    {
      const p = await abrir('admin', 1440);
      ok('[parado] faixa da retomada aparece dizendo que está parado e que nada sai sozinho', await ate(p, () => { const e = document.getElementById('r7Retomada'); return e && !e.hidden && /parado/.test(e.textContent) && /nada se perde/.test(e.textContent) && /h|min/.test(e.textContent); }));
      ok('[parado] a faixa "agora" mostra o resumo do dia', await ate(p, () => { const e = document.getElementById('r7Agora'); return e && !e.hidden && /pátio/.test(e.textContent); }));
      ok('[parado] sem erro no console', p.erros.length === 0, p.erros.join(' | '));
      await foto(p, 'parado-1440');
      await p.ctx.close();
    }

    /* ---------- A chave voltou: plano, reenvio com calma, progresso ---------- */
    {
      const p = await abrir('admin', 1440, '&envio=ok&retomada=1');
      ok('[voltou] o endereço ?retomada=1 abre o modal da retomada e sai da barra de endereço', await ate(p, () => document.getElementById('r7Modal')?.classList.contains('aberto') && !location.search.includes('retomada')));
      ok('[voltou] o resumo diz quantas saem, quantas precisam de olho e quantas ficam de fora', await ate(p, () => /2 podem sair agora/.test(document.getElementById('r7Corpo')?.textContent || '') && /1 precisa do seu olho/.test(document.getElementById('r7Corpo')?.textContent || '') && /1 fica de fora/.test(document.getElementById('r7Corpo')?.textContent || '')));
      ok('[voltou] item para revisar mostra o motivo (preço) e o de fora também (velha)', await p.evaluate(() => /Menciona preço/.test(document.getElementById('r7Corpo').textContent) && /mais de um dia/.test(document.getElementById('r7Corpo').textContent)));
      ok('[voltou] botão diz "Reenviar 2 com calma" e explica que é uma por vez', await p.evaluate(() => /Reenviar 2 com calma/.test(document.getElementById('r7Corpo').textContent) && /Uma por vez/.test(document.getElementById('r7Corpo').textContent)));
      await foto(p, 'retomada-1440');
      await p.evaluate(() => document.querySelector('[data-r7="ret-iniciar"]').click());
      ok('[voltou] depois do clique mostra o andamento "Reenviando"', await ate(p, () => /Reenviando|Último reenvio/.test(document.getElementById('r7Corpo')?.textContent || '')));
      ok('[voltou] ao terminar, o botão fica desligado (nada mais para enviar)', await ate(p, () => { const b = document.querySelector('[data-r7="ret-iniciar"]'); return b && b.disabled; }, null, 15000));
      await p.evaluate(() => document.querySelector('[data-r7="ret-fechar"]').click());
      ok('[voltou] fechar esconde o modal', !(await p.evaluate(() => document.getElementById('r7Modal').classList.contains('aberto'))));
      ok('[voltou] sem erro no console', p.erros.length === 0, p.erros.join(' | '));
      await p.ctx.close();
    }

    /* ---------- Links prontos na ficha ---------- */
    {
      const p = await abrir('admin', 1440, '&envio=ok');
      await abrirConv(p, 'Camila');
      ok('[links] a ficha ganha Entrada no Pátio, Minha IndyCar e Indique', await ate(p, () => !!document.querySelector('#r6Painel [data-r7="entrada"]') && !!document.querySelector('#r6Painel [data-r7="minha"]') && !!document.querySelector('#r6Painel [data-r7="indique"]')));
      ok('[links] mostra o que o cliente pediu (serviço do catálogo)', await ate(p, () => /Troca de óleo/.test(document.getElementById('r7Citados')?.textContent || '')));
      ok('[links] "Orçar com IA" aparece quando há pedido', await visivelEl(p, '#r6Painel [data-r7="orc-ia"]'));
      await p.evaluate(() => document.querySelector('#r6Painel [data-r7="entrada"]').click());
      await espera(600);
      const ab = await p.evaluate(() => window.__abertos);
      ok('[links] Entrada no Pátio abre o Pátio com entrada=1, placa, telefone e conversa', ab.length === 1 && /indycar-patio\.netlify\.app\/\?entrada=1/.test(ab[0].u) && /placa=ABC1D23/.test(ab[0].u) && /tel=55/.test(ab[0].u) && /conversa=/.test(ab[0].u), JSON.stringify(ab));
      await p.evaluate(() => { window.__abertos = []; document.querySelector('#r6Painel [data-r6="criar-orc"]').click(); });
      await espera(600);
      const ab2 = await p.evaluate(() => window.__abertos);
      ok('[links] Criar orçamento abre o Orçador com carro, ano e pedido preenchidos', ab2.length === 1 && /#\/cotacao\?/.test(ab2[0].u) && /ano=2020/.test(ab2[0].u) && /pedido=/.test(ab2[0].u), JSON.stringify(ab2));
      await p.evaluate(() => { window.__abertos = []; document.querySelector('#r6Painel [data-r7="orc-ia"]').click(); });
      await espera(600);
      ok('[links] Orçar com IA leva ia=1', (await p.evaluate(() => window.__abertos)).some(x => /ia=1/.test(x.u)));
      await p.evaluate(() => document.querySelector('#r6Painel [data-r7="minha"]').click());
      ok('[links] Minha IndyCar cai no campo para revisar (não envia)', await ate(p, () => /indycar\.example\/minha/.test(document.getElementById('campoMensagem').value)));
      await foto(p, 'links-1440');
      ok('[links] sem erro no console', p.erros.length === 0, p.erros.join(' | '));
      await p.ctx.close();
    }

    /* ---------- Agendar com horários reais ---------- */
    {
      const p = await abrir('admin', 1440, '&envio=ok');
      await abrirConv(p, 'Camila');
      await ate(p, () => !!document.getElementById('btnAgendar') && !document.getElementById('btnAgendar').disabled);
      await p.evaluate(() => document.getElementById('btnAgendar').click());
      ok('[agendar] os horários vêm por dia, da Agenda real', await ate(p, () => document.querySelectorAll('#agendarHorariosLista .r7-dia').length >= 3 && document.querySelectorAll('#agendarHorariosLista .chip.horario').length >= 6));
      ok('[agendar] mostra a sugestão de duas opções para oferecer', await ate(p, () => /Sugestão para oferecer/.test(document.getElementById('agendarHorariosLista')?.textContent || '')));
      await p.evaluate(() => document.querySelector('#agendarHorariosLista .chip.horario').click());
      ok('[agendar] tocar num horário preenche data e hora do formulário', await p.evaluate(() => { const f = document.getElementById('formAgendar'); return !!f.data.value && /^\d\d:\d\d/.test(f.hora.value); }));
      await foto(p, 'agendar-1440');
      await p.ctx.close();
    }

    /* ---------- Filtros novos da fila ---------- */
    {
      const p = await abrir('admin', 1440, '&envio=ok&filtro=r7_chegou');
      ok('[fila] os 4 filtros novos existem (Chegou, Negociando, Suspeitas, Nota ruim)', await p.evaluate(() => ['r7_chegou', 'r7_negociacao', 'r7_suspeita', 'r7_nota_ruim'].every(k => !!document.querySelector('.chip[data-status="' + k + '"]'))));
      ok('[fila] ?filtro=r7_chegou abre direto o filtro marcado', await ate(p, () => document.querySelector('.chip[data-status="r7_chegou"]')?.classList.contains('ativo')));
      await p.ctx.close();
    }

    /* ---------- Busca global ---------- */
    {
      const p = await abrir('admin', 1440, '&envio=ok');
      await p.type('#buscaConversa', 'Marcos Lima');
      ok('[busca] acha gente em toda a IndyCar além das conversas', await ate(p, () => /Marcos Lima/.test(document.getElementById('r7Busca')?.textContent || '') && !document.getElementById('r7Busca').hidden));
      await p.ctx.close();
    }

    /* ---------- 375 px ---------- */
    {
      const p = await abrir('admin', 375, '&retomada=1&envio=ok');
      ok('[375] modal da retomada abre sem rolagem lateral', await ate(p, () => document.getElementById('r7Modal')?.classList.contains('aberto')) && await semRolagemX(p));
      ok('[375] botão de reenviar cabe na tela', await p.evaluate(() => { const b = document.querySelector('[data-r7="ret-iniciar"]'); if (!b) return false; const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.height >= 36; }));
      await foto(p, 'retomada-375');
      await p.evaluate(() => document.querySelector('[data-r7="ret-fechar"]').click());
      ok('[375] lista com a faixa de aviso sem rolagem lateral', await semRolagemX(p));
      await abrirConv(p, 'Camila');
      await espera(1200);
      await p.evaluate(() => document.getElementById('btnAgendar')?.click());
      ok('[375] Agendar: horários em fichas tocáveis sem rolagem lateral', await ate(p, () => document.querySelectorAll('#agendarHorariosLista .chip.horario').length >= 6) && await semRolagemX(p));
      await foto(p, 'agendar-375');
      ok('[375] sem erro no console', p.erros.length === 0, p.erros.join(' | '));
      await p.ctx.close();
    }
  } catch (e) {
    console.error('ERRO NO ROTEIRO', e);
    total++;
  } finally {
    await browser.close();
  }
  console.log(`\n${bons}/${total} conferências`);
  process.exit(bons === total ? 0 : 1);
})();
