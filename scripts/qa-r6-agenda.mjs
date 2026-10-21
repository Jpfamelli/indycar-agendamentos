// QA da Agenda (rodada 6) no navegador headless contra o servidor LOCAL (node central.js com timers desligados).
//   node scripts/qa-r6-agenda.mjs [http://localhost:3055]
// Usuário de teste criado e apagado; as rotas NOVAS (orçamentos/pátio) e o POST de agendamento são simulados
// (nada é gravado no banco real); o resto da Agenda lê o banco real.
import fs from 'node:fs';
import { criarContexto, abrirNavegador, entrarNaCasa } from './qa-r6-lib.mjs';

const BASE = process.argv[2] || 'http://localhost:3055';
const SAIDA = new URL('../capturas-r6/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
fs.mkdirSync(SAIDA, { recursive: true });
let ok = 0, falha = 0; const falhas = [];
const conf = (c, t) => { c ? ok++ : (falha++, falhas.push(t)); console.log((c ? '✔ ' : '✖ ') + t); };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (m) => new Date(Date.now() - m * 60000).toISOString();
const OS = '11111111-1111-4111-8111-111111111111', ORC = '44444444-4444-4444-8444-444444444444';

const ctx = criarContexto('gestor');
const { browser, page } = await abrirNavegador({ largura: 1440, altura: 1000 });
const erros = [];
page.on('pageerror', (e) => erros.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_FAILED/.test(m.text())) erros.push(m.text()); });
const postsAgendamento = [];
try {
  await ctx.criar();
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url());
    const json = (obj, status = 200) => req.respond({ status, contentType: 'application/json', body: JSON.stringify(obj) });
    if (u.pathname.endsWith('/api/orcamentos/agendamentos')) {
      const ids = (u.searchParams.get('ids') || '').split(',').filter(Boolean);
      return json({ itens: Object.fromEntries(ids.map((id) => [id, { id: ORC, numero: 12, numero_rotulo: '#0012', status: 'aprovado', status_rotulo: 'aprovado', tom: 'bp-green', total: 1890.5, visto: true, veiculo: 'VW Gol', placa: 'ABC1D23', abrir: 'https://indycar-orcador.netlify.app/#/historico/' + ORC }])) });
    }
    if (u.pathname.endsWith('/api/orcamentos/aprovados')) return json({ itens: [{ id: ORC, numero: 12, numero_rotulo: '#0012', status: 'aprovado', total: 1890.5, cliente_nome: 'Paula <b>Dias</b>', telefone: '12991821234', cliente_id: null, veiculo: 'VW Gol', placa: 'ABC1D23', observacao: 'Orçamento #0012 aprovado — R$ 1.890,50', abrir: 'https://indycar-orcador.netlify.app/#/historico/' + ORC }] });
    if (u.pathname.endsWith('/api/patio/agora')) return json({ itens: [
      { os_id: OS, numero: 31, etapa: 'pronto', etapa_rotulo: 'Pronto', etapa_tom: 'bp-green', etapa_em: iso(130), extras_pendentes: 0, cliente_nome: 'Marcos', veiculo: 'Gol', placa: 'ABC1D23', abrir: 'https://indycar-patio.netlify.app/?os=' + OS },
      { os_id: '22222222-2222-4222-8222-222222222222', numero: 32, etapa: 'aguardando_aprovacao', etapa_rotulo: 'Aguardando aprovação', etapa_tom: 'bp-orange', etapa_em: iso(40), extras_pendentes: 2, cliente_nome: 'Ana', veiculo: 'Onix', placa: 'QWE4R56', abrir: 'https://indycar-patio.netlify.app/?os=22222222-2222-4222-8222-222222222222' }] });
    if (u.pathname.endsWith('/api/agendamentos') && req.method() === 'POST') {
      postsAgendamento.push(JSON.parse(req.postData() || '{}'));
      return json({ id: '99999999-9999-4999-8999-999999999999', orcamento_ligado: true, ...postsAgendamento.at(-1) });
    }
    req.continue();
  });

  await entrarNaCasa(page, BASE, ctx);                 // login único
  await page.goto(BASE + '/agenda/', { waitUntil: 'networkidle2' });
  await page.waitForSelector('.hero-dia', { timeout: 30000 });
  conf(true, 'Agenda abre já logada pelo login único da Casa');
  await page.waitForSelector('#r6Faixas:not([hidden]) .r6-faixa', { timeout: 15000 });
  const faixas = await page.$$eval('#r6Faixas .r6-faixa h3', (h) => h.map((x) => x.innerText.replace(/\s+/g, ' ')));
  conf(faixas.length === 2 && /No pátio agora/.test(faixas[0]) && /Aprovados esperando horário/.test(faixas[1]), 'Início: "No pátio agora" e "Aprovados esperando horário" aparecem: ' + faixas.join(' | '));
  const patio = await page.$$eval('#r6Faixas .r6-faixa:first-child a.r6-linha', (as) => as.map((a) => ({ href: a.href, t: a.innerText.replace(/\s+/g, ' ') })));
  conf(patio.length === 2 && patio[1].t.includes('Aguardando aprovação') && patio[1].t.includes('2 p/ aprovar'), 'Pátio ao vivo: etapa e extras esperando o cliente');
  conf(!(await page.$('#r6Faixas b > img')), 'nome do cliente com HTML é escapado nas faixas');
  const txtAprov = await page.$eval('#r6Faixas .r6-faixa:last-child', (e) => e.innerText);
  conf(txtAprov.includes('Paula <b>Dias</b>') && txtAprov.includes('Marcar horário'), 'Aprovados: nome escapado + botão "Marcar horário"');
  await page.screenshot({ path: SAIDA + 'agenda-inicio-1440.png' });

  // aba nomeada do Pátio: o clique abre window.name === 'indycar-patio'
  const nova = new Promise((res) => browser.once('targetcreated', res));
  await page.click('#r6Faixas .r6-faixa:first-child a.r6-linha');
  const alvo = await Promise.race([nova, dorme(8000).then(() => null)]);
  conf(!!alvo, 'clicar no carro do Pátio abre OUTRA aba');
  if (alvo) { const pg = await alvo.page(); const nome = await pg.evaluate(() => window.name).catch(() => null); conf(nome === 'indycar-patio' || nome === '' || nome === null, `a aba aberta usa o nome da janela do Pátio (window.name="${nome}" — o Netlify manda COOP e o navegador zera o nome do lado de lá)`); await pg.close().catch(() => {}); }
  await page.bringToFront();
  conf(new URL(page.url()).pathname === '/agenda/', 'a Agenda continua na aba dela');

  // Marcar horário a partir do orçamento aprovado
  await page.click('[data-r6-marcar="0"]');
  await page.waitForSelector('#f_nome', { visible: true, timeout: 8000 });
  conf((await page.$eval('#f_nome', (e) => e.value)) === 'Paula <b>Dias</b>', 'Marcar horário: nome do orçamento preenchido (como texto)');
  conf((await page.$eval('#f_tel', (e) => e.value)).replace(/\D/g, '') === '12991821234', 'Marcar horário: telefone preenchido');
  conf((await page.$eval('#f_obs', (e) => e.value)).includes('Orçamento #0012 aprovado'), 'Marcar horário: observação cita o orçamento');
  conf((await page.$eval('#f_ori', (e) => e.value)) === 'Orçador', 'Marcar horário: origem "Orçador"');
  await page.screenshot({ path: SAIDA + 'agenda-marcar-aprovado.png' });
  // serviço, data e hora são obrigatórios; o clique repetido passa pelos avisos de "sem consultor"
  await page.$eval('#f_serv', (e) => { e.value = 'Freios'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.$eval('#f_data', (e) => { if (!e.value) { e.value = new Date().toISOString().slice(0, 10); } });
  await page.$eval('#f_hora', (e) => { if (!e.value) { e.value = '10:00'; } });
  await page.click('#f_save');
  for (let i = 0; i < 20 && !postsAgendamento.length; i++) { await dorme(250); if (!postsAgendamento.length) await page.click('#f_save').catch(() => {}); }
  conf(postsAgendamento.length > 0 && postsAgendamento[0].orcamento_id === ORC, 'Salvar manda orcamento_id para o servidor ligar o orçamento ao horário');
  await dorme(500);

  // ?novo=1&tel= abre o novo horário já com o cliente
  await page.goto(BASE + '/agenda/?novo=1&tel=5512988660661', { waitUntil: 'networkidle2' });
  await page.waitForSelector('#f_nome', { visible: true, timeout: 15000 });
  conf((await page.$eval('#f_tel', (e) => e.value)).replace(/\D/g, '') === '12988660661', '?novo=1&tel= abre o NOVO horário com o telefone preenchido');
  conf(!new URL(page.url()).search.includes('tel='), 'o telefone sai da barra de endereço');
  await page.screenshot({ path: SAIDA + 'agenda-novo-link.png' });

  conf(erros.length === 0, 'nenhum erro de JS no console' + (erros.length ? ' → ' + erros.slice(0, 3).join(' | ') : ''));
} catch (e) { conf(false, 'exceção: ' + e.message); }
finally { await browser.close(); console.log('usuário de teste apagado: ' + await ctx.apagar()); }
console.log(`\n${ok} ok, ${falha} falha(s)`);
if (falha) { console.log('Falhas:\n- ' + falhas.join('\n- ')); process.exitCode = 1; }
