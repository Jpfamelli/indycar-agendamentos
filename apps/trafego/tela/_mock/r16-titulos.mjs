/* Confere a ordem dos títulos (h1, h2, h3) de cada tela e das gavetas/fichas, no servidor de mentira.
   PORTA=3438 node tela/_mock/r16-titulos.mjs   (de apps/trafego). Sai com 1 se algum título pular nível. */
import { subir } from './servidor.mjs';
import { carregarPuppeteer, CHROME } from './navegador.mjs';

const PORTA = Number(process.env.PORTA) || 3438;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const puppeteer = await carregarPuppeteer();
const { endereco, fechar } = await subir({ porta: PORTA });
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
let ruins = 0;
const ordem = () => {
  const out = []; let ult = 0;
  for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    if (el.closest('[hidden]') || !el.getClientRects().length) continue;
    const n = Number(el.tagName[1]);
    out.push({ n, t: el.textContent.trim().slice(0, 40), pula: n > ult + 1 });
    ult = n;
  }
  return out;
};
try {
  const p = await navegador.newPage();
  await p.setViewport({ width: 1100, height: 900 });
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e.message || e)));
  const ABRIR = { campanhas: 'table a, .camp, [data-camp]', clientes: '.cli', ajustes: 'button.cartao-link, .ajuste button, main button.linha' };
  for (const tela of ['geral', 'campanhas', 'clientes', 'radar', 'relatorios', 'ajustes']) {
    await p.goto(endereco + '?cenario=cheio#/' + tela, { waitUntil: 'networkidle0' });
    await dormir(700);
    const lista = await p.evaluate(ordem);
    const pulos = lista.filter((x) => x.pula);
    console.log(tela.padEnd(11), lista.map((x) => 'h' + x.n).join(' '), pulos.length ? 'PULA: ' + pulos.map((x) => x.t).join(' | ') : 'ok');
    if (pulos.length) ruins++;
    const alvo = ABRIR[tela] ? await p.$(ABRIR[tela]) : null;
    if (alvo) {
      await alvo.click().catch(() => {}); await dormir(700);
      const dentro = await p.evaluate(() => {
        const d = document.querySelector('dialog[open]'); if (!d) return null;
        const out = []; let ult = 0;
        for (const el of d.querySelectorAll('h1,h2,h3,h4')) { const n = Number(el.tagName[1]); out.push((ult && n > ult + 1 ? '!' : '') + 'h' + n); ult = n; }
        return out;
      });
      console.log('   gaveta/ficha:', dentro ? dentro.join(' ') : '(nao abriu)');
      if (dentro && dentro.some((x) => x[0] === '!')) ruins++;
      await p.keyboard.press('Escape'); await dormir(200);
    }
  }
  console.log('erros de página:', erros.length);
} finally { await navegador.close(); await fechar(); }
process.exit(ruins ? 1 : 0);
