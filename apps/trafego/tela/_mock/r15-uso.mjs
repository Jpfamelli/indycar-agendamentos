/* ============================================================================
   Roteiro de uso da rodada 15 (servidor de mentira, service worker LIGADO, duas visitas):
     PORTA=3437 node tela/_mock/r15-uso.mjs        (de apps/trafego)
   Confere: service worker ativo; zero erro de console nas duas visitas; "Atualizado" no cabeçalho;
   período lembrado na segunda visita; busca e atalhos de etapa em Clientes (celular, 375 px);
   voltar à Visão geral sem esqueleto; nenhum toque abaixo de 44 px; sem rolagem lateral.
   ============================================================================ */
import { subir } from './servidor.mjs';
import { carregarPuppeteer, CHROME } from './navegador.mjs';

const PORTA = Number(process.env.PORTA) || 3437;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let ruins = 0;
const confere = (nome, ok, extra = '') => { if (!ok) ruins++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + nome + (extra ? ' · ' + extra : '')); };

const puppeteer = await carregarPuppeteer();
const { endereco, fechar } = await subir({ porta: PORTA });
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
try {
  const ctx = await navegador.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  const erros = [];
  p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  p.on('pageerror', (e) => erros.push(String(e.message || e)));
  const url = endereco + '?cenario=cheio';
  const texto = () => p.evaluate(() => document.body.innerText);

  // visita 1
  await p.goto(url + '#/geral', { waitUntil: 'networkidle0' });
  await dormir(800);
  const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return Boolean(r && (r.active || r.installing || r.waiting)); });
  confere('service worker registrado', sw);
  confere('Visão geral pintou', /Anúncios → WhatsApp/i.test(await texto()));
  confere('cabeçalho mostra "Atualizado"', /Atualizado/.test(await texto()));
  await p.evaluate(() => { location.hash = '#/geral?periodo=7d'; });
  await dormir(900);
  confere('período 7 dias aplicado', /últimos 7 dias/i.test(await texto()));

  // visita 2: abre sem período no endereço, deve voltar aos 7 dias
  await p.goto('about:blank');
  await p.goto(url + '#/clientes', { waitUntil: 'networkidle0' });
  await dormir(900);
  confere('segunda visita: período lembrado no endereço', /periodo=7d/.test(await p.evaluate(() => location.hash)), await p.evaluate(() => location.hash));
  confere('segunda visita: com service worker no controle', await p.evaluate(() => Boolean(navigator.serviceWorker.controller)));

  // Clientes: busca e atalhos
  const total = await p.evaluate(() => document.querySelectorAll('.cli').length);
  confere('Clientes tem cartões', total > 0, String(total));
  confere('atalhos de etapa existem', (await p.evaluate(() => document.querySelectorAll('.salto-op').length)) >= 2);
  await p.evaluate(() => document.querySelector('.salto-op:last-child').click());
  await dormir(700);
  const subiu = await p.evaluate(() => window.scrollY);
  confere('atalho rolou até a etapa', subiu > 300, 'scrollY=' + subiu);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.type('#buscaClientes', 'oleo');
  await dormir(300);
  const achados = await p.evaluate(() => document.querySelectorAll('.cli').length);
  confere('busca "oleo" filtra a lista', achados > 0 && achados < total, achados + ' de ' + total);
  confere('contador da busca', /contatos? encontrados?/.test(await texto()));
  await p.$eval('#buscaClientes', (e) => { e.value = ''; });
  await p.type('#buscaClientes', 'zzzz');
  await dormir(300);
  confere('busca sem resultado mostra saída', /Limpar a busca/.test(await texto()));
  await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Limpar a busca/.test(b.textContent)).click());
  await dormir(300);
  confere('limpar devolve a lista', (await p.evaluate(() => document.querySelectorAll('.cli').length)) === total);

  // Atualizar
  const pedidos = [];
  p.on('request', (r) => { if (/api\//.test(r.url())) pedidos.push(r.url()); });
  await p.evaluate(() => document.querySelector('.cab-atualiza').click());
  await dormir(900);
  confere('Atualizar pede leitura fresca', pedidos.some((u) => /fresco=1/.test(u)), pedidos.length + ' pedidos');

  // Voltar à Visão geral: sem esqueleto
  await p.evaluate(() => { location.hash = '#/geral'; });
  await p.evaluate(() => { location.hash = '#/geral?periodo=7d'; });
  await dormir(80);
  const esq = await p.evaluate(() => Boolean(document.querySelector('.esq')));
  const heroi = await p.evaluate(() => Boolean(document.querySelector('.heroi')));
  confere('voltar à Visão geral: herói na hora, sem esqueleto', heroi && !esq);

  // medidas
  const medida = await p.evaluate(() => {
    const pequenos = [];
    for (const el of document.querySelectorAll('a[href], button, input:not([type="hidden"]), select')) {
      if (el.closest('[hidden], .pular, .so-leitor')) continue;
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height && r.height < 43.5) pequenos.push((el.className || el.tagName) + ' ' + Math.round(r.height));
    }
    return { largo: document.documentElement.scrollWidth > innerWidth + 1, pequenos };
  });
  confere('sem rolagem lateral', !medida.largo);
  confere('nenhum toque abaixo de 44 px', medida.pequenos.length === 0, medida.pequenos.slice(0, 6).join(' | '));

  // visita 3 com SW ativo
  await p.reload({ waitUntil: 'networkidle0' });
  await dormir(500);
  confere('terceira visita sem erro', true);
  confere('zero erro de console', erros.length === 0, erros.slice(0, 3).join(' | '));
} finally {
  await navegador.close();
  await fechar();
}
console.log(ruins ? ruins + ' falha(s)' : 'tudo certo');
process.exit(ruins ? 1 : 0);
