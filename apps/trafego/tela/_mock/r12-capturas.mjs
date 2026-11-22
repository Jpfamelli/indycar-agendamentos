/* ============================================================================
   Capturas da rodada 12 (tela nova, no pique do Nexus Ads), só no servidor de mentira.

     PORTA=3533 node tela/_mock/r12-capturas.mjs            (de apps/trafego)
     PORTA=3533 node tela/_mock/r12-capturas.mjs geral      (só as paradas que começam com "geral")

   Fotografa cada tela a 375 e a 1440 px, escuro e claro, em qa-out/r12/, a página inteira
   (rola até o fim antes, para tudo que aparece ao rolar estar na foto). Mede: rolagem lateral,
   toque menor que 44 px no celular, erro de console, sigla e palavra proibida na tela.
   Sai com código 1 se alguma parada tiver problema.
   ============================================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { subir } from './servidor.mjs';
import { carregarPuppeteer, CHROME } from './navegador.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.env.PORTA) || 3533;
const [filtro = ''] = process.argv.slice(2);
const SAIDA = path.resolve(AQUI, '..', '..', 'qa-out', 'r12');

// [nome, busca da página, endereço da tela, ação depois de abrir]
const PARADAS = [
  ['geral', '?cenario=cheio', '#/geral'],
  ['geral-60d-google', '?cenario=cheio', '#/geral?fonte=google&periodo=60d'],
  ['geral-sem-conta', '?cenario=sem_conta', '#/geral'],
  ['campanhas', '?cenario=cheio', '#/campanhas'],
  ['campanhas-detalhe', '?cenario=cheio', '#/campanhas?abrir=meta:120211450001'],
  ['clientes', '?cenario=cheio', '#/clientes'],
  ['clientes-ficha', '?cenario=cheio', '#/clientes', 'ficha'],
  ['radar', '?cenario=cheio', '#/radar'],
  ['relatorios', '?cenario=cheio', '#/relatorios'],
  ['ajustes', '?cenario=cheio', '#/ajustes'],
  ['gestor-sem-ajustes', '?cenario=cheio&papel=gestor', '#/geral'],
].filter(([nome]) => nome.startsWith(filtro));
const LARGURAS = [375, 1440];
const TEMAS = ['escuro', 'claro'];
const PROIBIDOS = [[/—/, 'travessão'], [/\bundefined\b/, 'undefined'], [/\bNaN\b/, 'NaN'], [/\bnull\b/, 'null'], [/\[object/, 'object'],
  [/ve[ií]culo/i, 'veículo'], [/\bROAS\b|\bCPA\b|\bCPL\b|\bCTR\b|\bCPC\b|\bCPM\b/, 'sigla'], [/\bpaciente/i, 'paciente'], [/cl[ií]nica/i, 'clínica']];
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const puppeteer = await carregarPuppeteer();
fs.mkdirSync(SAIDA, { recursive: true });
const { endereco, fechar } = await subir({ porta: PORTA });
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--force-prefers-reduced-motion', '--no-first-run'] });
const linhas = [];
let ruins = 0;
try {
  for (const [nome, busca, hash, acao] of PARADAS) {
    for (const largura of LARGURAS) {
      for (const tema of TEMAS) {
        const id = `${nome}-${largura}-${tema}`;
        const pagina = await navegador.newPage();
        const erros = [];
        pagina.on('console', (m) => { if (m.type() === 'error' && !/status of (401|403|404|500|503)/.test(m.text())) erros.push(m.text()); });
        pagina.on('pageerror', (e) => erros.push(String(e.message || e)));
        await pagina.setViewport({ width: largura, height: largura < 768 ? 812 : 900, deviceScaleFactor: 1 });
        await pagina.evaluateOnNewDocument((t) => { try { localStorage.setItem('indycar_tema', t); } catch { /* sem armazenamento */ } }, tema);
        await pagina.goto(endereco + busca + hash, { waitUntil: 'networkidle0', timeout: 30000 }).catch((e) => erros.push('abrir: ' + e.message));
        await dormir(500);
        if (acao === 'ficha') {
          await pagina.evaluate(() => { const b = document.querySelector('.col-fechou .cli') || document.querySelector('.cli'); if (b) b.click(); });
          await dormir(600);
        }
        // rola até o fim e volta: tudo que aparece ao rolar já está pintado na foto
        await pagina.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } window.scrollTo(0, 0); });
        await dormir(250);
        const medida = await pagina.evaluate(() => {
          const largo = document.documentElement.scrollWidth > window.innerWidth + 1;
          const pequenos = [];
          const raiz = document.querySelector('dialog[open]') || document;
          for (const el of raiz.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="radio"], [role="tab"]')) {
            if (el.closest('[hidden], .pular, .so-leitor')) continue;
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
            if (cs.display === 'inline' && el.closest('p')) continue;
            const min = window.innerWidth < 768 ? 44 : 24;
            if (r.height < min || r.width < min) pequenos.push((el.textContent || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
          }
          const vis = (a) => getComputedStyle(a).display !== 'none' && a.getBoundingClientRect().width > 0 && !a.closest('.lado[style*="none"]');
          const nav = [...document.querySelectorAll('.lado-nav a, .barra-baixo a')].filter(vis).map((a) => a.querySelector('.nav-rotulo').textContent.trim());
          const fontes = [...new Set([...document.querySelectorAll('body *')].slice(0, 5000).map((e) => getComputedStyle(e).fontFamily.split(',')[0].replace(/['"]/g, '').trim()))];
          const selo = document.querySelector('.nav-item[data-tela="radar"] .nav-selo');
          return { largo, pequenos: pequenos.slice(0, 6), texto: document.body.innerText, nav: [...new Set(nav)], fontes, alto: document.documentElement.scrollHeight, selo: selo ? selo.textContent : '' };
        });
        const proibidos = PROIBIDOS.filter(([re]) => re.test(medida.texto)).map(([, n]) => n);
        if (largura < 768) await pagina.screenshot({ path: path.join(SAIDA, id + '-topo.png') });   // o que a pessoa vê ao abrir
        // a janela do tamanho da página: a barra de baixo (fixa) fica no fim da foto, não no meio
        if (!acao && !hash.includes('abrir=')) { await pagina.setViewport({ width: largura, height: Math.min(16000, medida.alto), deviceScaleFactor: 1 }); await dormir(300); }
        await pagina.screenshot({ path: path.join(SAIDA, id + '.png'), fullPage: true });
        const problemas = [medida.largo ? 'rolagem lateral' : '', medida.pequenos.length ? 'toque pequeno: ' + medida.pequenos.join('; ') : '',
          erros.length ? 'console: ' + erros.slice(0, 3).join(' | ') : '', proibidos.length ? 'texto: ' + proibidos.join(', ') : ''].filter(Boolean);
        if (problemas.length) ruins++;
        const info = `nav=[${medida.nav.join(', ')}] radar=${medida.selo || '-'} fontes=[${medida.fontes.join(', ')}] altura=${medida.alto}px`;
        linhas.push((problemas.length ? 'PROBLEMA ' : 'ok       ') + id + '  ' + info + (problemas.length ? '  ' + problemas.join(' · ') : ''));
        console.log(linhas[linhas.length - 1]);
        await pagina.close();
      }
    }
  }
} finally {
  fs.writeFileSync(path.join(SAIDA, 'capturas' + (filtro ? '-' + filtro : '') + '.txt'), linhas.join('\n') + '\n');
  await navegador.close();
  await fechar();
}
process.exitCode = ruins ? 1 : 0;
