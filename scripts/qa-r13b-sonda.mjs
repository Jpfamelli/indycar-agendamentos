// Sonda da Rodada 13B da Agenda: pedidos feitos ao abrir cada tela (repetidos? em laço?) e o que acontece
// quando o servidor cai. Servidor de MENTIRA; nada toca o banco real.
//   node scripts/qa-r13b-sonda.mjs
import { iniciarMock, abrirNavegador, dorme } from './qa-r7c2-lib.mjs';

const PORTA = Number(process.env.QA_PORTA || 3475);
const mock = iniciarMock(PORTA);
await dorme(1500);
try {
  const { browser, page } = await abrirNavegador({ largura: 1440, altura: 900 });
  const pedidos = [];
  const erros = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) pedidos.push(r.method() + ' ' + u.pathname + u.search); });
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_FAILED/.test(m.text())) erros.push(m.text()); });
  await page.goto(mock.base + '/?tour=0', { waitUntil: 'networkidle2' });
  await dorme(2500);
  console.log('== abrir (Hoje):', pedidos.length, 'pedidos');
  const conta = (l) => Object.entries(l.reduce((m, p) => (m[p] = (m[p] || 0) + 1, m), {})).map(([p, n]) => `${n}x ${p}`).join('\n  ');
  console.log('  ' + conta(pedidos));
  for (const rota of ['agenda', 'quadro', 'espera', 'clientes', 'inicio']) {
    pedidos.length = 0;
    await page.evaluate((r) => route(r), rota); await dorme(2500);
    console.log(`== ${rota}:`, pedidos.length, 'pedidos\n  ' + conta(pedidos));
  }
  pedidos.length = 0;
  await dorme(Number(process.env.QA_PARADO || 20000));
  console.log('== parado 20 s no Hoje:', pedidos.length, 'pedidos', pedidos.length ? '\n  ' + conta(pedidos) : '');
  // servidor caindo: todo /api responde 503
  await page.setRequestInterception(true);
  page.on('request', (r) => { if (new URL(r.url()).pathname.startsWith('/api/')) r.respond({ status: 503, contentType: 'application/json', body: '{"erro":"fora"}' }); else r.continue(); });
  for (const rota of ['agenda', 'clientes', 'inicio']) {
    await page.evaluate((r) => { route(r); }, rota); await dorme(6000);
    const txt = await page.evaluate(() => document.querySelector('#view').innerText.slice(0, 200).replace(/\s+/g, ' '));
    const faixa = await page.evaluate(() => { const f = document.querySelector('#faixaAcordando'); return f && !f.hidden ? f.innerText : ''; });
    console.log(`== fora do ar, ${rota}: faixa="${faixa}" tela="${txt}"`);
  }
  console.log('erros de console:', erros.length, erros.slice(0, 4).join(' | '));
  await browser.close();
} catch (e) { console.log('EXCEÇÃO', e.message); } finally { mock.parar(); }
