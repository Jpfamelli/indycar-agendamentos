// Rodada 13B · passagens entre apps do Comunicar, de ponta a ponta, no servidor de mentira (npm run mock).
// O Comunicar abre em /comunicar/ (como na Central); /agenda/, /crm/ e /atendimento/ são páginas de mentira que só
// mostram o endereço recebido. Confere: chegar por link de outro app (telefone com 55, tela filtrada), sair para a
// conversa, o CRM e a Agenda com o cliente certo, na MESMA janela, e a tela de entrada sem pedido repetido.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const origem = process.env.ORIGEM || 'http://localhost:3511';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || path.join(aqui, '../../../../indycar-ferramentas/node_modules/puppeteer-core'));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--disable-background-networking'] });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
const passo = (nome) => { ok++; console.log('ok', nome); };

async function abrir(caminho) {
  const page = await browser.newPage();
  const erros = [], pedidos = [];
  page.on('pageerror', (e) => erros.push(String(e.message)));
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== origem) return r.abort('blockedbyclient');
    if (u.pathname.includes('/api/')) pedidos.push(r.method() + ' ' + u.pathname);
    r.continue();
  });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(origem + caminho, { waitUntil: 'networkidle0' });
  await espera(600);
  return { page, erros, pedidos };
}
const destino = async (page) => { await page.waitForSelector('#destino', { timeout: 8000 }); return page.$eval('#destino', (el) => ({ app: el.dataset.app, url: el.textContent })); };

try {
  // 1. Central/CRM/Atendimento mandam ?tel= com o 55: abre a ficha certa direto, sem desenhar as Réguas antes
  {
    const { page, erros, pedidos } = await abrir('/comunicar/?papel=admin&tel=5512999990001');
    await page.waitForSelector('#gaveta h3');
    assert.equal(await page.$eval('#gavetaTitulo', (el) => el.textContent.trim()), 'Maria Aparecida Souza');
    assert.equal(await page.$eval('.nav-item[aria-current="page"]', (el) => el.dataset.route), 'clientes');
    assert.equal(new URL(page.url()).search, '', 'o telefone sai da barra de endereço');
    assert.ok(!pedidos.includes('GET /api/projecao') && !pedidos.includes('GET /api/resumo'), 'não carregou o resumo das Réguas à toa: ' + pedidos.join(', '));
    passo('chegar com ?tel=55… abre a ficha da Maria em Clientes, sem carregar as Réguas');

    // 2. da ficha para a conversa, o CRM e a Agenda: mesma janela, mesma origem, cliente certo, telefone sem 55
    const links = await page.$$eval('.eco-links a', (as) => as.map((a) => ({ txt: a.textContent.trim(), href: a.href, alvo: a.target })));
    assert.equal(links.length, 3);
    for (const l of links) assert.equal(l.alvo, '', `${l.txt} abre na mesma janela`);
    const id = new URL(links.find((l) => /CRM/.test(l.txt)).href).searchParams.get('cliente');
    assert.match(id, /^[0-9a-f-]{36}$/);
    const esperado = { Conversa: `/atendimento/?tel=12999990001`, CRM: `/crm/?cliente=${id}&tel=12999990001`, Agenda: `/agenda/?cliente=${id}&tel=12999990001` };
    for (const [txt, caminho] of Object.entries(esperado)) {
      const l = links.find((x) => x.txt.includes(txt));
      assert.equal(l.href, origem + caminho, txt);
    }
    await Promise.all([page.waitForNavigation(), page.$$eval('.eco-links a', (as) => as.find((a) => /CRM/.test(a.textContent)).click())]);
    const d = await destino(page);
    assert.equal(d.app, 'crm'); assert.equal(d.url, `/crm/?cliente=${id}&tel=12999990001`);
    passo('ficha → CRM / Agenda / Conversa: mesma janela, cliente e telefone certos');

    // 3. voltar do outro app cai no Comunicar sem pedir login de novo
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => null);
    await page.waitForSelector('.view .toolbar, #gaveta h3', { timeout: 10000 });
    assert.equal(await page.$('#telaLogin:not([hidden]) #formLogin:not([hidden])'), null, 'não pediu login de novo');
    passo('voltar do CRM: o Comunicar abre sem pedir login');
    assert.deepEqual(erros, []);
    await page.close();
  }

  // 4. link da Central para as mensagens com falha: abre Mensagens filtrada, e "Abrir conversa" vai ao Atendimento
  {
    const { page, erros } = await abrir('/comunicar/?papel=admin&tela=mensagens&status=enviado');
    await page.waitForSelector('.envio');
    assert.equal(await page.$eval('.nav-item[aria-current="page"]', (el) => el.dataset.route), 'mensagens');
    const status = await page.$$eval('.envio .envio-chips', (cs) => cs.map((c) => c.textContent));
    assert.ok(status.length && status.every((t) => /Enviada/.test(t)), 'só as enviadas: ' + status.slice(0, 3).join(' | '));
    const conversa = await page.$eval('.envio a[href*="/atendimento/?tel="]', (a) => ({ href: a.href, alvo: a.target }));
    assert.equal(conversa.alvo, '');
    assert.match(conversa.href, new RegExp('^' + origem + '/atendimento/\\?tel=\\d{10,11}$'));
    await Promise.all([page.waitForNavigation(), page.$eval('.envio a[href*="/atendimento/?tel="]', (a) => a.click())]);
    const d = await destino(page);
    assert.equal(d.app, 'atendimento');
    passo('?tela=mensagens&status=enviado abre filtrada; "Abrir conversa" leva ao Atendimento na mesma janela');
    assert.deepEqual(erros, []);
    await page.close();
  }

  // 5. telefone que não existe: avisa e cai nas Réguas (não fica tela em branco)
  {
    const { page, erros } = await abrir('/comunicar/?papel=admin&tel=11900000000');
    await page.waitForSelector('#heroiHoje');
    assert.match(await page.$eval('#toast', (t) => t.textContent), /não encontrado/);
    passo('telefone desconhecido: aviso e Réguas');
    // 6. a tela de entrada pede cada coisa uma vez só e não pede os prazos por serviço (só Ajustes usa)
    assert.deepEqual(erros, []);
    await page.close();
  }
  {
    const { page, pedidos } = await abrir('/comunicar/?papel=admin');
    await page.waitForSelector('#heroiHoje:not([aria-busy])');
    await espera(800);
    const conta = pedidos.reduce((m, p) => ((m[p] = (m[p] || 0) + 1), m), {});
    for (const [p, n] of Object.entries(conta)) assert.equal(n, 1, `${p} pedido ${n} vezes`);
    assert.ok(!conta['GET /api/regras-retorno'], 'Réguas não pedem os prazos por serviço');
    const central = await page.$eval('#heroiHoje a[href]', (a) => a.getAttribute('href')).catch(() => null);
    if (central !== null) assert.equal(central, '/', '"Ver o aviso na Central" vai para a Central');
    passo('Réguas: cada pedido uma vez, sem os prazos por serviço; aviso aponta para a Central');
    await page.close();
  }
  // 7. apagar um prazo por serviço tem "Desfazer" (a regra volta com o mesmo nome)
  {
    const { page, erros } = await abrir('/comunicar/?papel=admin');
    page.on('dialog', (d) => d.accept());
    await page.$eval('.nav-item[data-route="ajustes"]', (b) => b.click());
    await page.waitForSelector('#regrasBox [data-apagar]');
    const antes = await page.$$eval('#regrasBox .regra[data-id]', (ls) => ls.map((l) => l.querySelector('[data-campo="rotulo"]').value));
    const nome = antes[antes.length - 1];
    await page.$$eval('#regrasBox .regra[data-id] [data-apagar]', (bs) => bs[bs.length - 1].click());
    await page.waitForSelector('#toast .toast-acao');
    assert.equal(await page.$$eval('#regrasBox .regra[data-id]', (ls) => ls.length), antes.length - 1);
    await page.$eval('#toast .toast-acao', (b) => b.click());
    await page.waitForFunction((n) => [...document.querySelectorAll('#regrasBox .regra[data-id] [data-campo="rotulo"]')].some((i) => i.value === n), {}, nome);
    assert.equal(await page.$$eval('#regrasBox .regra[data-id]', (ls) => ls.length), antes.length);
    passo(`apagar "${nome}" e Desfazer: a regra volta`);
    assert.deepEqual(erros, []);
    await page.close();
  }
} finally { await browser.close(); }
console.log(`${ok} passagens conferidas`);
