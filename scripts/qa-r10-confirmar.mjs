// Rodada 10: mede a página pública /confirmar/ (a que o CLIENTE abre pelo link do WhatsApp), que nunca tinha sido medida.
// Sobe o server.js DE VERDADE numa porta livre, com a camada de dados de MENTIRA (_injetar): nada toca o banco, nada manda WhatsApp.
//   node scripts/qa-r10-confirmar.mjs [antes|depois]     → qa-out/r10/confirmar-<rótulo>.json e capturas
// Mede, em 375 e 1440 px, claro e escuro: rolagem lateral, alvo de toque menor que 44 px, violações sérias do axe-core,
// texto fora da regra (travessão, inglês cru) e, numa rede 4G lenta, bytes, pedidos e tempo até a pergunta aparecer.
import fs from 'node:fs';
import * as real from '../dados.js';
import { _injetar, server } from '../server.js';
import { abrirNavegador } from './qa-r6-lib.mjs';

const rotulo = process.argv[2] || 'depois';
const SAIDA = new URL('../qa-out/r10/', import.meta.url);
fs.mkdirSync(SAIDA, { recursive: true });
const AXE = fs.readFileSync('C:/Users/USER/.claude/backups/indycar-landing/node_modules/axe-core/axe.min.js', 'utf8');
const T = { aberto: 'a'.repeat(24), confirmou: 'b'.repeat(24), passou: 'c'.repeat(24), invalido: 'd'.repeat(24) };
const amanha = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
const horario = (extra) => ({ primeiro_nome: 'Maria', servico: 'Troca de óleo e filtro', data: amanha, hora: '09:30', status: 'aguardando', veiculo: 'HB20', consultor: 'Leonardo', passou: false, ...extra });
const consultas = { empresa: 0 };
const falso = {
  ...real,
  confirmacaoPorToken: async (t) => (t === T.aberto ? { token: t, resposta: null, respondido_em: null, agendamento: horario() }
    : t === T.confirmou ? { token: t, resposta: 'confirmou', respondido_em: new Date().toISOString(), agendamento: horario({ status: 'confirmado' }) }
    : t === T.passou ? { token: t, resposta: null, respondido_em: null, agendamento: horario({ passou: true }) } : null),
  responderConfirmacao: async (t, resposta) => (t === T.aberto ? { resposta, respondido_em: new Date().toISOString(), agendamento_id: null } : null),
  obterAgendamento: async () => null,
  obterEmpresa: async () => { consultas.empresa++; return { nome: 'IndyCar Centro Automotivo', endereco: 'Av. Charles Schnneider, 875, Parque Paduan, Taubaté' }; },
};
_injetar({ dados: falso, usuarioLogado: async () => ({ usuario: null, motivo: 'sem_login' }) });
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));

const medir = () => page_medir();
function page_medir() {
  const vis = (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const pequenos = [...document.querySelectorAll('a,button,textarea,input,select')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { alvo: (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : '')) + ' "' + (e.textContent || '').trim().slice(0, 24) + '"', l: Math.round(r.width), a: Math.round(r.height) }; }).filter((x) => x.a < 44 || x.l < 44);
  const texto = document.body.innerText;
  return { rolagemLateral: document.documentElement.scrollWidth > window.innerWidth, pequenos,
    travessao: (texto.match(/[^\n]*[—–][^\n]*/g) || []).slice(0, 5), ingles: (texto.match(/Failed to fetch|NetworkError|Load failed|undefined|\[object/g) || []), titulo: document.querySelector('h1,.pronto b')?.textContent || '', texto: texto.slice(0, 400) };
}

const achados = [], desempenho = [];
for (const largura of [375, 1440]) for (const tema of ['dark', 'light']) {
  const { browser, page } = await abrirNavegador({ largura, altura: largura < 500 ? 800 : 900 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: tema }]);
  const cenas = [['pergunta', T.aberto], ['respondido', T.confirmou], ['passou', T.passou], ['link-invalido', T.invalido], ['sem-token', '']];
  for (const [cena, token] of cenas) {
    await page.goto(`${base}/confirmar/${token ? '?t=' + token : ''}`, { waitUntil: 'networkidle2' });
    await dorme(450);
    await page.evaluate(AXE);
    const axe = await page.evaluate(async () => { const r = await window.axe.run(document, { resultTypes: ['violations'] }); return r.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => ({ id: v.id, n: v.nodes.length, alvo: v.nodes.slice(0, 4).map((n) => n.target.join(' ')) })); });
    achados.push({ largura, tema, cena, ...(await page.evaluate(page_medir)), axe });
    await page.screenshot({ path: new URL(`${rotulo}-confirmar-${cena}-${largura}-${tema === 'dark' ? 'escuro' : 'claro'}.png`, SAIDA).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
  }
  // "preciso remarcar": o recado opcional
  await page.goto(`${base}/confirmar/?t=${T.aberto}`, { waitUntil: 'networkidle2' }); await dorme(300);
  await page.click('[data-r="remarcar"]'); await dorme(200);
  await page.evaluate(AXE);
  const axeObs = await page.evaluate(async () => { const r = await window.axe.run(document, { resultTypes: ['violations'] }); return r.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => ({ id: v.id, n: v.nodes.length, alvo: v.nodes.slice(0, 4).map((n) => n.target.join(' ')) })); });
  achados.push({ largura, tema, cena: 'recado', ...(await page.evaluate(page_medir)), axe: axeObs, foco: await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName) });
  // sem rede na hora de responder: o POST cai
  await page.goto(`${base}/confirmar/?t=${T.aberto}`, { waitUntil: 'networkidle2' }); await dorme(300);
  await page.setRequestInterception(true);
  const derruba = (r) => (r.method() === 'POST' ? r.abort('internetdisconnected') : r.continue());
  page.on('request', derruba);
  await page.click('[data-r="confirmou"]'); await dorme(700);
  achados.push({ largura, tema, cena: 'sem-rede-ao-responder', ...(await page.evaluate(page_medir)), axe: [], erroNaTela: await page.evaluate(() => { const e = document.getElementById('erro'); return e && !e.hidden ? e.textContent : null; }),
    botoesLigados: await page.evaluate(() => [...document.querySelectorAll('[data-r]')].every((b) => !b.disabled)) });
  page.off('request', derruba); await page.setRequestInterception(false);
  // sem rede ao abrir: o GET cai
  await page.setRequestInterception(true);
  const derrubaApi = (r) => (r.url().includes('/api/') ? r.abort('internetdisconnected') : r.continue());
  page.on('request', derrubaApi);
  await page.goto(`${base}/confirmar/?t=${T.aberto}`, { waitUntil: 'networkidle2' }); await dorme(500);
  achados.push({ largura, tema, cena: 'sem-rede-ao-abrir', ...(await page.evaluate(page_medir)), axe: [], temTentarDeNovo: await page.evaluate(() => !![...document.querySelectorAll('button')].find((b) => /tentar de novo/i.test(b.textContent))) });
  await browser.close();
}

// desempenho: primeira visita numa rede 4G lenta (400 ms de ida e volta, 1,6 Mbps de descida), 3 passadas
for (let i = 0; i < 3; i++) {
  const { browser, page } = await abrirNavegador({ largura: 375, altura: 800 });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  let bytes = 0, pedidos = 0; const lista = [];
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; pedidos++; });
  cdp.on('Network.responseReceived', (e) => lista.push(`${e.response.status} ${e.response.url.replace(base, '')}`));
  const t0 = Date.now();
  await page.goto(`${base}/confirmar/?t=${T.aberto}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-r="confirmou"]', { timeout: 20000 });
  const ate_pergunta_ms = Date.now() - t0;
  await dorme(1500);
  desempenho.push({ ate_pergunta_ms, bytes, pedidos, lista });
  await browser.close();
}
const mediana = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const resumo = {
  rotulo, medidas: achados.length,
  comRolagemLateral: achados.filter((a) => a.rolagemLateral).length,
  comAlvoPequeno375: achados.filter((a) => a.largura === 375 && a.pequenos.length).length,
  alvosPequenos: [...new Set(achados.filter((a) => a.largura === 375).flatMap((a) => a.pequenos.map((p) => `${p.alvo} ${p.l}x${p.a}`)))],
  comAxeSerio: achados.filter((a) => a.axe.length).length,
  axe: [...new Set(achados.flatMap((a) => a.axe.flatMap((v) => v.alvo.map((x) => `${a.tema} ${v.id}: ${x}`))))],
  travessao: [...new Set(achados.flatMap((a) => a.travessao))],
  ingles: [...new Set(achados.flatMap((a) => a.ingles))],
  semRedeAoResponder: [...new Set(achados.filter((a) => a.cena === 'sem-rede-ao-responder').map((a) => `${a.erroNaTela} | botões religados: ${a.botoesLigados}`))],
  semRedeAoAbrir: [...new Set(achados.filter((a) => a.cena === 'sem-rede-ao-abrir').map((a) => `${a.titulo} | tentar de novo: ${a.temTentarDeNovo}`))],
  desempenho4gLento: { ate_pergunta_ms: mediana(desempenho.map((d) => d.ate_pergunta_ms)), bytes: mediana(desempenho.map((d) => d.bytes)), pedidos: desempenho[0].pedidos, lista: desempenho[0].lista },
  consultasDaOficina: consultas.empresa,
};
fs.writeFileSync(new URL(`confirmar-${rotulo}.json`, SAIDA), JSON.stringify({ resumo, achados }, null, 1));
console.log(JSON.stringify(resumo, null, 1));
server.close();
process.exit(0);
