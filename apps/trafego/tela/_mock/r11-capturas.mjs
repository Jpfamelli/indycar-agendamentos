/* ============================================================================
   Capturas da rodada 11 (antes e depois da limpeza), só no servidor de mentira.

     PORTA=3532 node tela/_mock/r11-capturas.mjs antes     (de apps/trafego)
     PORTA=3532 node tela/_mock/r11-capturas.mjs depois

   Fotografa cada aba a 375 e a 1440 px (tema escuro; no "depois" também o claro)
   em qa-out/r11/<pasta>/ e mede o que a rodada cobra: rolagem lateral, toque
   menor que 44 px no celular, erro de console e sigla na tela.
   Sai com código 1 se alguma parada tiver problema.
   ============================================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { subir } from './servidor.mjs';
import { carregarPuppeteer, CHROME } from './navegador.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.env.PORTA) || 3532;
const [pasta = 'depois'] = process.argv.slice(2);
const SAIDA = path.resolve(AQUI, '..', '..', 'qa-out', 'r11', pasta);

const PARADAS = pasta === 'antes'
  ? [['hoje', '?cenario=cheio', '#/hoje'], ['jornada', '?cenario=cheio', '#/jornada'], ['campanhas', '?cenario=cheio', '#/campanhas'],
    ['gestor', '?cenario=cheio', '#/gestor'], ['ajustes', '?cenario=cheio', '#/ajustes']]
  : [['resumo', '?cenario=cheio', '#/resumo'], ['resumo-sem-conta', '?cenario=sem_conta', '#/resumo'], ['campanhas', '?cenario=cheio', '#/campanhas'],
    ['campanhas-detalhe', '?cenario=cheio', '#/campanhas?abrir=1'], ['ajustes', '?cenario=cheio', '#/ajustes'],
    ['gestor-sem-ajustes', '?cenario=cheio&papel=gestor', '#/ajustes']];
const LARGURAS = [375, 1440];
const TEMAS = pasta === 'antes' ? ['escuro'] : ['escuro', 'claro'];
const PROIBIDOS = [[/—/, 'travessão'], [/\bundefined\b/, 'undefined'], [/\bNaN\b/, 'NaN'], [/\bnull\b/, 'null'],
  [/ve[ií]culo/i, 'veículo'], [/\bROAS\b|\bCPA\b|\bCPL\b|\bCTR\b|\bCPC\b/, 'sigla']];

const puppeteer = await carregarPuppeteer();
fs.mkdirSync(SAIDA, { recursive: true });
const { endereco, fechar } = await subir({ porta: PORTA });
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--force-prefers-reduced-motion', '--no-first-run'] });
const linhas = [];
let ruins = 0;
try {
  for (const [nome, busca, hash] of PARADAS) {
    for (const largura of LARGURAS) {
      for (const tema of TEMAS) {
        const id = `${nome}-${largura}-${tema}`;
        const pagina = await navegador.newPage();
        const erros = [];
        pagina.on('console', (m) => { if (m.type() === 'error' && !/status of (401|403|404|500|503)/.test(m.text())) erros.push(m.text()); });
        pagina.on('pageerror', (e) => erros.push(String(e.message || e)));
        await pagina.setViewport({ width: largura, height: largura < 768 ? 812 : 900, deviceScaleFactor: 1 });
        await pagina.evaluateOnNewDocument((t) => { try { localStorage.setItem('indycar_tema', t); } catch { /* sem armazenamento */ } }, tema);
        const [rota, consulta] = hash.split('?');
        await pagina.goto(endereco + busca + rota, { waitUntil: 'networkidle0', timeout: 30000 }).catch((e) => erros.push('abrir: ' + e.message));
        await new Promise((r) => setTimeout(r, 400));
        if (consulta === 'abrir=1') {   // abre o "ver detalhes" da primeira campanha
          await pagina.evaluate(() => { const d = document.querySelector('details.camp-detalhes'); if (d) d.open = true; });
          await new Promise((r) => setTimeout(r, 200));
        }
        const medida = await pagina.evaluate(() => {
          const largo = document.documentElement.scrollWidth > window.innerWidth + 1;
          const pequenos = [];
          for (const el of document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="radio"], [role="tab"]')) {
            if (el.closest('[hidden], .pular, .so-leitor')) continue;
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
            if (cs.display === 'inline' && el.closest('p')) continue;
            const min = window.innerWidth < 768 ? 44 : 24;
            if (r.height < min || r.width < min) pequenos.push((el.textContent || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
          }
          const abas = [...document.querySelectorAll('.ic-abas a, .casca-nav a, .navbaixo a, .casca-acoes a[data-tela]')]
            .filter((a) => getComputedStyle(a).display !== 'none' && a.getBoundingClientRect().width > 0).map((a) => a.textContent.trim());
          const fontes = [...new Set([...document.querySelectorAll('body *')].slice(0, 4000).map((e) => getComputedStyle(e).fontFamily.split(',')[0].replace(/['"]/g, '').trim()))];
          return { largo, pequenos: pequenos.slice(0, 6), texto: document.body.innerText, abas: [...new Set(abas)], fontes, alto: document.documentElement.scrollHeight };
        });
        const proibidos = PROIBIDOS.filter(([re]) => re.test(medida.texto)).map(([, n]) => n);
        await pagina.screenshot({ path: path.join(SAIDA, id + '.png'), fullPage: true });
        const problemas = [medida.largo ? 'rolagem lateral' : '', pasta !== 'antes' && medida.pequenos.length ? 'toque pequeno: ' + medida.pequenos.join('; ') : '',
          erros.length ? 'console: ' + erros.slice(0, 3).join(' | ') : '', pasta !== 'antes' && proibidos.length ? 'texto: ' + proibidos.join(', ') : ''].filter(Boolean);
        if (problemas.length) ruins++;
        const info = `abas=[${medida.abas.join(', ')}] fontes=[${medida.fontes.join(', ')}] altura=${medida.alto}px palavras=${medida.texto.split(/\s+/).filter(Boolean).length}`;
        linhas.push((problemas.length ? 'PROBLEMA ' : 'ok       ') + id + '  ' + info + (problemas.length ? '  ' + problemas.join(' · ') : ''));
        console.log(linhas[linhas.length - 1]);
        await pagina.close();
      }
    }
  }
} finally {
  fs.writeFileSync(path.join(SAIDA, 'capturas.txt'), linhas.join('\n') + '\n');
  await navegador.close();
  await fechar();
}
process.exitCode = ruins ? 1 : 0;
