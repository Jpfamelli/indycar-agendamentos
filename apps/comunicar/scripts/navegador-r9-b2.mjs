import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { confereMock } from './confere-mock-r10.mjs';

// Rode os dois scripts mock-server.mjs nas portas abaixo antes de abrir o Chrome.
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || 'puppeteer-core');
const portas = [
  ['atendimento', Number(process.env.PORTA_MOCK_ATD || 3470)],
  ['comunicar', Number(process.env.PORTA_MOCK_COM || 3471)],
];
for (const [app, port] of portas) {
  await confereMock(`http://localhost:${port}`, app);
}
const browser = await puppeteer.launch({
  protocolTimeout: 45_000,
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--disable-background-networking'],
});

try {
  for (const [app, port] of portas) {
    const origem = `http://localhost:${port}`;
    const dir = new URL(`../../${app}/qa-out/r9/`, import.meta.url);
    await mkdir(dir, { recursive: true });
    const cenarios = [375, 1440].flatMap(largura => ['claro', 'escuro'].map(tema => ({ largura, tema })));
    for (const { largura, tema } of cenarios) {
      const page = await browser.newPage();
      try {
        await page.setBypassServiceWorker(true);
        await page.setRequestInterception(true);
        page.on('request', request => {
          const { origin, protocol } = new URL(request.url());
          const permitido = origin === origem || protocol === 'data:' || protocol === 'blob:';
          return permitido ? request.continue() : request.abort('blockedbyclient');
        });
        await page.setViewport({ width: largura, height: 900 });
        await page.evaluateOnNewDocument(tema => localStorage.setItem('indycar_tema', tema), tema);
        await page.goto(`${origem}/?papel=admin`, { waitUntil: 'networkidle0' });
        const pularTour = await page.$('button[data-tour="pular"], button[data-t="pular"]');
        if (pularTour) await pularTour.click();
        const seletor = app === 'atendimento' ? '#filtrosExtras' : '.inicio-detalhes';
        await page.waitForSelector(`${seletor} > summary`, { visible: true });
        assert.equal(await page.$eval(seletor, el => el.open), false);
        const temaVisivel = await page.evaluate(() => document.documentElement.getAttribute('data-tema') || 'escuro');
        assert.equal(temaVisivel, tema);
        await page.screenshot({ path: fileURLToPath(new URL(`depois-${largura}-${tema}.png`, dir)) });
        const summary = `${seletor} > summary`;
        await page.$eval(summary, el => el.scrollIntoView({ block:'center' }));
        await page.click(summary);
        await page.waitForSelector(`${seletor}[open]`);
        await page.focus(summary);
        await page.keyboard.press('Enter');
        await page.waitForSelector(`${seletor}:not([open])`);
        await page.keyboard.press('Enter');
        await page.waitForSelector(`${seletor}[open]`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
          `${app} tem rolagem lateral em ${largura}px`);
        console.log(`${app} ${largura}px ${tema}: painel abre e cabe na tela`);
        if (app === 'comunicar') {
          const resultado = await page.evaluate(async () => {
            const fetchOriginal = window.fetch;
            let liberar;
            const bloqueio = new Promise(resolve => { liberar = resolve; });
            window.fetch = async (url, opcoes) => {
              if (new URL(url, location.href).pathname.endsWith('/envios')) await bloqueio;
              return fetchOriginal(url, opcoes);
            };
            try {
              const mensagens = route('mensagens');
              await route('inicio');
              liberar();
              await mensagens;
              const ficouNoInicio = Boolean(document.querySelector('.inicio-detalhes'));
              await route('clientes');
              const conteudo = document.querySelector('#cliLista');
              window.fetch = (url, opcoes) => new URL(url, location.href).pathname.endsWith('/clientes')
                ? Promise.resolve(Response.json({ erro: 'Falha simulada' }, { status: 500 }))
                : fetchOriginal(url, opcoes);
              await route(null, { quieto: true });
              const preservouClientes = Boolean(conteudo?.isConnected);
              await route('mensagens');
              const de = document.querySelector('#deMsg');
              const ate = document.querySelector('#ateMsg');
              de.value = '2026-11-19';
              ate.value = '2026-11-18';
              ate.dispatchEvent(new Event('change'));
              const mantevePeriodo = !state.msg.de && !state.msg.ate;
              const podeLimparPeriodo = !document.querySelector('#limparPeriodo').hidden;
              return { ficouNoInicio, preservouClientes, mantevePeriodo, podeLimparPeriodo };
            } finally {
              window.fetch = fetchOriginal;
            }
          });
          assert.deepEqual(resultado, {
            ficouNoInicio: true, preservouClientes: true, mantevePeriodo: true, podeLimparPeriodo: true,
          });
          console.log(`comunicar ${largura}px ${tema}: resposta atrasada, falha em atualização e período inválido`);
        }
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
