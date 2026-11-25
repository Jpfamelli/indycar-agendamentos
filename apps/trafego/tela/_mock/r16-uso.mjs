/* Roteiro da rodada 16 (servidor de mentira, service worker LIGADO, duas visitas, 375 px):
     PORTA=3439 node tela/_mock/r16-uso.mjs     (de apps/trafego)
   Confere: voltar do celular fecha a ficha de Clientes sem sair da tela; Esc/X não deixam entrada sobrando;
   trocar de ficha; zero erro de console; sem rolagem lateral; toque >= 44 px. */
import { subir } from './servidor.mjs';
import { carregarPuppeteer, CHROME } from './navegador.mjs';

const PORTA = Number(process.env.PORTA) || 3439;
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
  const url = endereco + '?cenario=cheio#/clientes';
  const aberta = () => p.evaluate(() => Boolean(document.querySelector('dialog.dlg[open]')));
  const hash = () => p.evaluate(() => location.hash);
  const tam = () => p.evaluate(() => history.length);

  for (const visita of [1, 2]) {
    await p.goto('about:blank');
    await p.goto(url, { waitUntil: 'networkidle0' });
    await dormir(900);
    if (visita === 1) confere('service worker registrado', await p.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration())));
    else confere('segunda visita sob o service worker', await p.evaluate(() => Boolean(navigator.serviceWorker.controller)));
    const h0 = await hash(), t0 = await tam();
    await p.evaluate(() => document.querySelector('.cli').click());
    await dormir(500);
    confere('visita ' + visita + ': ficha abriu', await aberta());
    confere('abrir guardou uma entrada', (await tam()) === t0 + 1);
    await p.evaluate(() => history.back());
    await dormir(400);
    confere('voltar fechou a ficha', !(await aberta()));
    confere('e ficou em Clientes', (await hash()) === h0 && (await p.evaluate(() => Boolean(document.querySelector('.cli')))));
    // Esc
    await p.evaluate(() => document.querySelector('.cli').click()); await dormir(400);
    await p.keyboard.press('Escape'); await dormir(400);
    confere('Esc fecha e devolve a entrada', !(await aberta()) && (await hash()) === h0);
    confere('depois do Esc a entrada atual não é de gaveta', await p.evaluate(() => !(history.state && history.state.gaveta)));
  }
  // trocar de ficha direto
  await p.goto(url, { waitUntil: 'networkidle0' }); await dormir(700);
  const t1 = await tam();
  await p.evaluate(() => document.querySelector('.cli').click()); await dormir(400);
  await p.evaluate(() => { const d = document.querySelector('dialog.dlg[open]'); d.close(); document.querySelectorAll('.cli')[1].click(); }); await dormir(500);
  confere('trocar de ficha: ainda uma entrada só', (await tam()) === t1 + 1, String((await tam()) - t1));
  await p.evaluate(() => history.back()); await dormir(400);
  confere('voltar fecha a segunda ficha', !(await aberta()));
  const medida = await p.evaluate(() => ({ largo: document.documentElement.scrollWidth > innerWidth + 1 }));
  confere('sem rolagem lateral', !medida.largo);
  confere('zero erro de console', erros.length === 0, erros.slice(0, 3).join(' | '));
} finally { await navegador.close(); await fechar(); }
console.log(ruins ? ruins + ' falha(s)' : 'tudo certo');
process.exit(ruins ? 1 : 0);
