/* Sonda da rodada 10 (não é teste; mede, não confere). Servidor de mentira, nada real.
     PORTA=3537 node tela/_mock/r10-sonda.mjs pedidos [telas]   → pedidos à API por tela (e os repetidos)
     PORTA=3537 node tela/_mock/r10-sonda.mjs abertura          → tempo até a primeira tela, com 150 ms de latência por pedido (rede de celular) */
import { subir } from './servidor.mjs';
import { carregarPuppeteer, CHROME } from './navegador.mjs';

const PORTA = Number(process.env.PORTA) || 3537;
const modo = process.argv[2] || 'pedidos';
const puppeteer = await carregarPuppeteer();
const { endereco, fechar } = await subir({ porta: PORTA });
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--force-prefers-reduced-motion', '--no-first-run'] });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  if (modo === 'pedidos') {
    for (const tela of (process.argv[3] || 'hoje,jornada,campanhas,gestor,ajustes').split(',')) {
      const pagina = await navegador.newPage();
      await pagina.setViewport({ width: 1440, height: 900 });
      const api = [];
      pagina.on('request', (r) => { const u = new URL(r.url()); const rel = u.pathname.replace('/trafego/', ''); if (rel.startsWith('api/')) api.push(r.method() + ' ' + rel + u.search); });
      await pagina.goto(endereco + '?cenario=cheio#/' + tela, { waitUntil: 'networkidle0' });
      await esperar(300);
      const repetidos = api.filter((a, i) => api.indexOf(a) !== i);
      console.log(tela.padEnd(12), 'pedidos à API:', api.length, repetidos.length ? 'REPETIDOS: ' + repetidos.join(' | ') : '');
      await pagina.close();
    }
  } else {
    const tempos = [];
    for (let i = 0; i < 5; i++) {
      const contexto = await navegador.createBrowserContext();   // sem cache nem service worker: a primeira visita
      const pagina = await contexto.newPage();
      await pagina.setViewport({ width: 375, height: 812 });
      const cdp = await pagina.createCDPSession();
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (Number(process.env.MBPS) || 1.6) * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
      const t = Date.now();
      await pagina.goto(endereco + '?cenario=cheio#/hoje', { waitUntil: 'domcontentloaded' });
      await pagina.waitForFunction(() => document.querySelector('#miolo h1, #miolo .titulo-tela, #miolo .frase'), { timeout: 60000 });
      tempos.push(Date.now() - t);
      await contexto.close();
    }
    tempos.sort((a, b) => a - b);
    console.log('abertura fria até a primeira tela (ms), 5 medidas:', tempos.join(', '), '· mediana', tempos[2]);
  }
} finally { await navegador.close(); await fechar(); }
