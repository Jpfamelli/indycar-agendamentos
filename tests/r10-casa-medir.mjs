// Casa, rodada 10: MEDIÇÃO de desempenho no Chrome, com a Central de verdade subindo aqui mesmo (sem banco: o Supabase
// aponta para uma porta fechada e nada sai para a internet; pedido para fora é respondido vazio pela interceptação).
// Abre a Casa duas vezes na mesma aba e conta o que chegou ao servidor em cada abertura.
//
//   node tests/r10-casa-medir.mjs        → imprime um JSON com os números
import http from 'node:http';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const puppeteer = require(resolve(RAIZ, '../indycar-ferramentas/node_modules/puppeteer-core'));
Object.assign(process.env, {
  SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_ANON_KEY: 'anon-de-teste', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste',
  ANTHROPIC_API_KEY: '', RUNNER_TOKEN: 'token-de-teste',
  CRM_AUTOMACOES: '0', CARTEIRO_DESLIGADO: '1', SINCRONIA: '0', AUTOMACOES: '0', IA_FUNIL: '0', IMPORT_DISABLED: '1',
});
delete process.env.RENDER;
const silencio = console.log; console.log = () => {};
const central = await import('../central.js');
await central.iniciarCentral({ ouvir: false });
console.log = silencio;

const chegou = [];
const srv = http.createServer((req, res) => {
  const fim = res.end.bind(res);
  res.end = (...a) => { chegou.push({ url: req.url, status: res.statusCode, bytes: Number(res.getHeader('content-length')) || 0 }); return fim(...a); };
  return central.handler(req, res);
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${srv.address().port}`;

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--disable-background-networking'] });
const saida = {};
try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => (new URL(r.url()).origin === base ? r.continue() : r.respond({ status: 204, body: '' })));
  const abrir = async () => {
    chegou.length = 0;
    await page.goto(base + '/', { waitUntil: 'networkidle0' });
    const daCasa = chegou.filter((c) => /^\/casa\/[\w.-]+\.(css|js)(\?|$)/.test(c.url));
    if (process.env.MEDIR_LISTA) for (const c of chegou) console.error(c.status, c.url);
    return { pedidos_ao_servidor: chegou.length, css_e_js: daCasa.length, css_e_js_304: daCasa.filter((c) => c.status === 304).length, bytes_css_e_js: daCasa.reduce((n, c) => n + c.bytes, 0) };
  };
  saida.primeira_abertura = await abrir();
  saida.segunda_abertura = await abrir();
} finally { await browser.close(); srv.close(); }
console.log(JSON.stringify(saida, null, 1));
setTimeout(() => process.exit(0), 100).unref();
