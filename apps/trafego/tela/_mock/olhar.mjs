/* ============================================================================
   Olhar rápido (rodada 9): fotografa uma lista de telas no servidor de mentira
   e mede o que o roteiro cobra (rolagem lateral, alvo pequeno, axe sério,
   erro de console, texto proibido), sem o roteiro inteiro de 15 minutos.

     PORTA=3531 node tela/_mock/olhar.mjs antes hoje jornada …   (de apps/trafego)
     PORTA=3531 node tela/_mock/olhar.mjs depois                 (todas)
     LARGURAS=375 TEMAS=escuro,claro node tela/_mock/olhar.mjs …

   O primeiro argumento é a pasta dentro de qa-out/r9/ (antes, depois…); os
   outros filtram as paradas pelo começo do nome. Duas capturas por parada
   (a primeira tela e a página inteira); resumo em qa-out/r9/<pasta>/olhar.txt.
   Sai com código 1 se alguma parada tiver problema.
   ============================================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { subir } from './servidor.mjs';
import { carregarPuppeteer, caminhoDoAxe, CHROME } from './navegador.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.env.PORTA) || 3531;
const [pasta = 'olhar', ...filtros] = process.argv.slice(2);
const SAIDA = path.resolve(AQUI, '..', '..', 'qa-out', 'r9', pasta);

export const PARADAS = [
  ['hoje', '?cenario=sem_conta', '#/hoje'], ['hoje-cheio', '?cenario=cheio', '#/hoje'], ['hoje-comeco', '?cenario=comeco', '#/hoje'],
  ['hoje-demo', '?cenario=demo', '#/hoje'], ['hoje-falta', '?cenario=falta_valor', '#/hoje'],
  ['jornada', '?cenario=sem_conta', '#/jornada'], ['jornada-cheio', '?cenario=cheio', '#/jornada'], ['jornada-comeco', '?cenario=comeco', '#/jornada'],
  ['fila-valor', '?cenario=sem_conta', '#/jornada?pendencia=sem_valor'], ['fila-origem', '?cenario=sem_conta', '#/jornada?pendencia=sem_origem'],
  ['fila-motivo', '?cenario=sem_conta', '#/jornada?pendencia=sem_motivo'],
  ['campanhas', '?cenario=sem_conta', '#/campanhas'], ['campanhas-cheio', '?cenario=cheio', '#/campanhas'], ['campanhas-comeco', '?cenario=comeco', '#/campanhas'],
  ['campanha-meta', '?cenario=cheio', '#/campanhas?chave=120211450001&plataforma=meta'],
  ['campanha-google', '?cenario=cheio', '#/campanhas?chave=20881330001&plataforma=google'],
  ['gestor', '?cenario=sem_conta', '#/gestor'], ['gestor-cheio', '?cenario=cheio', '#/gestor'], ['gestor-comeco', '?cenario=comeco', '#/gestor'],
  ['ajustes', '?cenario=sem_conta', '#/ajustes'],
  ['aj-conexoes', '?cenario=sem_conta', '#/ajustes?secao=conexoes'], ['aj-conexoes-cheio', '?cenario=cheio', '#/ajustes?secao=conexoes'],
  ['aj-origem', '?cenario=cheio', '#/ajustes?secao=origem'],
  ['aj-metas', '?cenario=cheio', '#/ajustes?secao=metas'], ['aj-ia', '?cenario=cheio', '#/ajustes?secao=ia'],
  ['aj-relatorios', '?cenario=cheio', '#/ajustes?secao=relatorios'], ['aj-devolucao', '?cenario=cheio', '#/ajustes?secao=devolucao'],
  ['folha', '?cenario=cheio', '#/folha?mes=2026-10'], ['apresentacao', '?cenario=cheio', '#/apresentacao'],
  ['erro-hoje', '?cenario=sem_conta&falha=hoje', '#/hoje'], ['erro-jornada', '?cenario=sem_conta&falha=jornada', '#/jornada'],
  ['sem-acesso', '?acesso=nao', '#/hoje'], ['sem-sessao', '?sessao=nao', '#/hoje'],
];
const LARGURAS = (process.env.LARGURAS || '1440,375').split(',').map(Number);
const TEMAS = (process.env.TEMAS || 'escuro').split(',');
const PROIBIDOS = [[/—/, 'travessão'], [/\bundefined\b/, 'undefined'], [/\bNaN\b/, 'NaN'], [/\bnull\b/, 'null'], [/\blead(s)?\b/i, 'lead'],
  [/ve[ií]culo/i, 'veículo'], [/\bROAS\b|\bCPA\b|\bCTR\b/, 'sigla'], [/efetuar|prezado|comparecer/i, 'palavra proibida']];

const escolhidas = PARADAS.filter(([nome]) => !filtros.length || filtros.some((f) => nome === f || nome.startsWith(f)));
const puppeteer = await carregarPuppeteer();
const axe = fs.readFileSync(caminhoDoAxe(), 'utf8');
fs.mkdirSync(SAIDA, { recursive: true });
const { endereco, fechar } = await subir({ porta: PORTA });
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--force-prefers-reduced-motion', '--no-first-run'] });
const linhas = [];
let ruins = 0;
try {
  for (const [nome, busca, hash] of escolhidas) {
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
        await new Promise((r) => setTimeout(r, 400));
        const medida = await pagina.evaluate(() => {
          const largo = document.documentElement.scrollWidth > window.innerWidth + 1;
          const pequenos = [];
          for (const el of document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="radio"], [role="button"], [role="tab"]')) {
            if (el.closest('[hidden], .pular, .so-leitor')) continue;
            const cs = getComputedStyle(el);
            // Mesma régua do roteiro.mjs: link esticado mede a linha; rádio dentro do rótulo mede o rótulo; link no meio da frase não conta.
            const depois = getComputedStyle(el, '::after');
            let alvo = el;
            if (depois.content !== 'none' && depois.position === 'absolute') { let p = el.parentElement; while (p && getComputedStyle(p).position === 'static') p = p.parentElement; if (p) alvo = p; }
            if (el.matches('input[type="radio"], input[type="checkbox"]') && el.closest('label')) alvo = el.closest('label');
            const r = alvo.getBoundingClientRect();
            if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
            if (cs.display === 'inline' && el.closest('p')) continue;
            const min = window.innerWidth < 768 ? 44 : 24;
            if (r.width < min || r.height < min) pequenos.push((el.textContent || el.getAttribute('aria-label') || el.name || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
          }
          return { largo, pequenos: pequenos.slice(0, 8), texto: document.body.innerText };
        });
        await pagina.evaluate(axe);
        const violacoes = await pagina.evaluate(async () => {
          const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] });
          return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id + ' (' + v.nodes.length + ': ' + v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ') + ')');
        });
        const proibidos = PROIBIDOS.filter(([re]) => re.test(medida.texto)).map(([, n]) => n);
        await pagina.screenshot({ path: path.join(SAIDA, id + '-tela1.png') });
        await pagina.screenshot({ path: path.join(SAIDA, id + '.png'), fullPage: true });
        if (process.env.PEDACOS) {   // página inteira em pedaços legíveis (PEDACOS=1400 px de altura)
          const alto = await pagina.evaluate(() => document.documentElement.scrollHeight);
          const passo = Number(process.env.PEDACOS) || 1400;
          for (let y = 0, n = 1; y < alto; y += passo, n++) await pagina.screenshot({ path: path.join(SAIDA, id + '-p' + n + '.png'), clip: { x: 0, y, width: largura, height: Math.min(passo, alto - y) }, captureBeyondViewport: true });
        }
        const problemas = [medida.largo ? 'rolagem lateral' : '', medida.pequenos.length ? 'alvo pequeno: ' + medida.pequenos.join('; ') : '',
          violacoes.length ? 'axe: ' + violacoes.join(', ') : '', erros.length ? 'console: ' + erros.slice(0, 3).join(' | ') : '', proibidos.length ? 'texto: ' + proibidos.join(', ') : ''].filter(Boolean);
        if (problemas.length) ruins++;
        linhas.push((problemas.length ? 'PROBLEMA ' : 'ok       ') + id + (problemas.length ? '  ' + problemas.join(' · ') : ''));
        console.log(linhas[linhas.length - 1]);
        await pagina.close();
      }
    }
  }
} finally {
  fs.writeFileSync(path.join(SAIDA, 'olhar.txt'), linhas.join('\n') + '\n');
  await navegador.close();
  await fechar();
}
process.exitCode = ruins ? 1 : 0;
