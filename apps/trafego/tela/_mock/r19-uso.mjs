/* Roteiro da rodada 19 (servidor de mentira, service worker LIGADO, duas visitas, 375 px):
     PORTA=3539 node tela/_mock/r19-uso.mjs     (de apps/trafego)
   Sem conta de anúncios: a Visão geral conta todos os contatos, mostra de onde vieram e onde se perde; os atalhos
   "Marcar a origem" e "Marcar o motivo" chegam em Clientes; Clientes mostra todos (o número bate com a Visão geral)
   e, com o filtro Meta, volta a mostrar só os de anúncio; a folha de Relatórios segue a mesma conta.
   Com conta (cenário cheio) nada disso aparece. Zero erro de console, sem rolagem lateral. */
import { subir } from './servidor.mjs';
import { carregarPuppeteer, CHROME } from './navegador.mjs';

const PORTA = Number(process.env.PORTA) || 3539;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let ruins = 0;
const confere = (nome, ok, extra = '') => { if (!ok) ruins++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + nome + (extra ? ' · ' + extra : '')); };
const puppeteer = await carregarPuppeteer();
const { endereco, fechar } = await subir({ porta: PORTA });
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run', '--force-prefers-reduced-motion'] });
try {
  const ctx = await navegador.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  const erros = [];
  p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  p.on('pageerror', (e) => erros.push(String(e.message || e)));
  const texto = (sel) => p.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; }, sel);
  const ir = async (hash, busca = '?cenario=sem_conta') => { await p.goto('about:blank'); await p.goto(endereco + busca + hash, { waitUntil: 'networkidle0' }); await dormir(900); };
  const numero = (t) => Number(String(t || '').replace(/\D/g, ''));

  let contatos = null;
  for (const visita of [1, 2]) {
    await ir('#/geral?periodo=7d');
    if (visita === 1) confere('service worker registrado', await p.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration())));
    else confere('segunda visita sob o service worker', await p.evaluate(() => Boolean(navigator.serviceWorker.controller)));
    const frase = await texto('.heroi-frase');
    confere('visita ' + visita + ': o herói conta os contatos', /^Chegaram \d+ contatos, \d+ marcaram horário e \d+ vieram na oficina\.$/.test(frase || ''), frase || '');
    contatos = numero((frase || '').match(/Chegaram (\d+)/)?.[1]);
    const origens = await p.evaluate(() => [...document.querySelectorAll('.origem')].map((li) => Number(li.querySelector('.origem-n b').textContent.replace(/\D/g, ''))));
    confere('origens somam o total do herói', origens.length > 2 && origens.reduce((s, n) => s + n, 0) === contatos, origens.join('+') + ' = ' + contatos);
    confere('diz onde se perde', /A maior perda é/.test((await texto('.perda')) || ''), (await texto('.perda')) || '');
    confere('o que depende do gasto não aparece', await p.evaluate(() => !document.querySelector('.cartao-mg, .regua, .ligar:not(.ligar-compacto)')));
    confere('custo e retorno dizem "sem dado"', /sem dado/.test((await texto('.heroi-conta')) || ''));
    confere('uma linha só para ligar a conta, no fim', await p.evaluate(() => { const l = document.querySelectorAll('.ligar'); return l.length === 1 && l[0].classList.contains('ligar-compacto') && !l[0].nextElementSibling; }));
  }

  // atalhos e Clientes
  await p.evaluate(() => [...document.querySelectorAll('.link-toque')].find((a) => /origem/.test(a.textContent)).click());
  await dormir(900);
  confere('"Marcar a origem" abre Clientes com a pendência', /#\/clientes\?.*pendencia=sem_origem/.test(await p.evaluate(() => location.hash)), await p.evaluate(() => location.hash));
  await ir('#/clientes?periodo=7d');
  const tot = await texto('.tot div:first-child');
  confere('Clientes sem conta mostra todos os contatos', /^Contatos/i.test(tot || '') && numero(tot) === contatos, tot || '');
  await ir('#/clientes?periodo=7d&fonte=meta');
  const totMeta = await texto('.tot div:first-child');
  confere('com o filtro Meta, só os de anúncio', /anúncio/i.test(totMeta || '') && numero(totMeta) < contatos, totMeta || '');
  // entrar direto em Clientes numa visita nova (nada na memória): pergunta de novo sozinho e chega em todos
  const p2 = await (await navegador.createBrowserContext()).newPage();
  await p2.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  p2.on('pageerror', (e) => erros.push(String(e.message || e)));
  await p2.goto(endereco + '?cenario=sem_conta#/clientes?periodo=7d', { waitUntil: 'networkidle0' }); await dormir(1200);
  const totFrio = await p2.evaluate(() => document.querySelector('.tot div:first-child').innerText.replace(/\s+/g, ' ').trim());
  confere('entrando direto em Clientes também mostra todos', /^Contatos/i.test(totFrio) && numero(totFrio) === contatos, totFrio);
  await p2.close();

  await ir('#/relatorios?periodo=7d');
  const folha = await texto('.folha-frase');
  confere('a folha de Relatórios conta os mesmos contatos', numero((folha || '').match(/Chegaram (\d+)/)?.[1]) === contatos, folha || '');
  confere('a folha tem a tabela "De onde vieram"', await p.evaluate(() => [...document.querySelectorAll('.folha h3')].some((t) => /De onde vieram/i.test(t.textContent))));

  // com conta de anúncios, a tela de antes
  await ir('#/geral', '?cenario=cheio');
  confere('com conta ligada o herói fala dos anúncios', /^Os anúncios trouxeram/.test((await texto('.heroi-frase')) || ''));
  confere('com conta ligada não há cartão de origens nem convite', await p.evaluate(() => !document.querySelector('.cartao-origens, .ligar') && Boolean(document.querySelector('.cartao-mg'))));
  await ir('#/clientes', '?cenario=cheio');
  confere('com conta ligada Clientes segue só com os de anúncio', /anúncio/i.test((await texto('.tot div:first-child')) || ''));

  await ir('#/geral?periodo=7d');
  const medida = await p.evaluate(() => {
    const pequenos = [...document.querySelectorAll('.miolo a[href], .miolo button, main a[href], main button')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.height && (r.height < 44 || r.width < 44) && !(getComputedStyle(el).display === 'inline' && el.closest('p')); }).map((el) => el.textContent.trim().slice(0, 20));
    return { largo: document.documentElement.scrollWidth > innerWidth + 1, pequenos };
  });
  confere('sem rolagem lateral', !medida.largo);
  confere('toques de 44 px ou mais', medida.pequenos.length === 0, medida.pequenos.join('; '));
  confere('zero erro de console', erros.length === 0, erros.slice(0, 3).join(' | '));
} finally { await navegador.close(); await fechar(); }
console.log(ruins ? ruins + ' falha(s)' : 'tudo certo');
process.exit(ruins ? 1 : 0);
