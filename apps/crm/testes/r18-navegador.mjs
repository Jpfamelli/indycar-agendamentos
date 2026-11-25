// Rodada 18: tarefas atrasadas em lote e agendados sem horário, SÓ com o servidor de mentira.
//   PORT=3618 MOCK_LEADS=560 npm run mock   e depois   node testes/r18-navegador.mjs [base] [pasta-das-capturas]
// Cada rodada de papel começa num servidor que já foi mexido pela anterior: as contas são relativas.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || 'C:/Users/USER/.claude/backups/indycar-ferramentas/node_modules/puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:3618';
const SAIDA = process.argv[3] || '';
if (SAIDA) fs.mkdirSync(SAIDA, { recursive: true });
const espera = ms => new Promise(r => setTimeout(r, ms));
const resultados = [];
const conferir = (nome, ok, detalhe = '') => { resultados.push({ nome, ok: !!ok }); console.log(`${ok ? 'ok ' : 'FALHOU'} · ${nome}${detalhe ? ' · ' + detalhe : ''}`); };
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const dialogos = [];
async function abrir(papel, w, tema) {
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('dialog', d => { dialogos.push(d.message()); d.accept(); });
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url(); if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:')) return r.abort(); r.continue(); });
  await page.setViewport({ width: w, height: w < 768 ? 812 : 900, isMobile: w < 768, hasTouch: w < 768 });
  await page.evaluateOnNewDocument(t => { try { localStorage.setItem('indycar_tema', t); localStorage.removeItem('indycar_crm_tarefas_lote_ultimo'); sessionStorage.removeItem('indycar_crm_aba'); } catch (e) { /* sem storage */ } }, tema);
  await page.goto(`${BASE}/?papel=${papel}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#r18Tarefas') && !document.querySelector('#r18Tarefas').hidden && document.querySelector('#hojeLista [data-h6="contato"]'), { timeout: 25000 });
  await espera(1200);
  return { page, erros };
}
const total = page => page.evaluate(() => T18.dados?.total ?? -1);
const marcar = (page, n) => page.evaluate(n => { const cs = [...document.querySelectorAll('#r18Tarefas .r18-lista input[type=checkbox]:not(:disabled)')].slice(0, n); cs.forEach(c => c.click()); return cs.map(c => c.value); }, n);
const esperarTotal = (page, alvo) => page.waitForFunction(a => T18.dados && T18.dados.total === a && !T18.gravando, { timeout: 10000 }, alvo).then(() => true, () => false);
async function foto(page, sel, nome) {
  if (!SAIDA) return;
  const el = await page.$(sel); if (!el) return;
  await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'start' }), sel); await espera(300);
  await page.screenshot({ path: `${SAIDA}/${nome}.png` });
}
try {
  for (const [papel, w, tema] of [['gestor', 1440, 'escuro'], ['gestor', 375, 'claro'], ['atendente', 375, 'escuro'], ['atendente', 1440, 'claro']]) {
    const { page, erros } = await abrir(papel, w, tema);
    const rot = `${papel} ${w} ${tema}`;
    const api = await page.evaluate(async p => (await (await fetch('/api/tarefas/atrasadas' + (p === 'gestor' ? '' : '?escopo=minhas'), { headers: { authorization: 'Bearer mock' } })).json()), papel);
    const pos = await page.evaluate(() => {
      const t = document.querySelector('#r18Tarefas'), a = document.querySelector('#r18Agendados'), fila = document.querySelector('#hojeLista').closest('.card');
      return { antes: t.previousElementSibling?.id || t.previousElementSibling?.className, agDepois: t.nextElementSibling === a, filaDepoisHeroi: document.querySelector('#r13Heroi').nextElementSibling === fila,
        qtd: Number(t.querySelector('.r18-qtd')?.textContent), linhas: t.querySelectorAll('.r18-lista li').length };
    });
    conferir(`${rot}: o cartão mostra a mesma contagem do servidor (${api.total})`, pos.qtd === api.total && api.total > 0, `${pos.qtd}`);
    if (papel === 'gestor') conferir(`${rot}: gestor vê as tarefas logo depois do aviso dos sem responsável`, pos.antes === 'r14Hoje' && pos.agDepois, pos.antes);
    else conferir(`${rot}: atendente continua com a fila no alto; tarefas depois dos retornos`, pos.antes === 'r7Retornos' && pos.filaDepoisHeroi && pos.agDepois, pos.antes);
    conferir(`${rot}: atendente só vê as dele`, papel === 'gestor' || api.itens.every(i => i.responsavel_id === 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001'));
    conferir(`${rot}: mostra 8 e guarda o resto em "Mostrar as outras"`, pos.linhas === Math.min(8, api.total));
    await foto(page, '#r18Tarefas', `depois-tarefas-${papel}-${w}-${tema}`);
    await foto(page, '#r18Agendados', `depois-agendados-${papel}-${w}-${tema}`);
    if (SAIDA) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${SAIDA}/depois-hoje-${papel}-${w}-${tema}.png`, fullPage: w > 768 }); }
    const barraAntes = await page.evaluate(() => document.querySelector('#r18Barra').hidden);
    const t0 = await total(page);

    // 1. concluir 3, conferir que pediu confirmação com a contagem e que o Desfazer do aviso volta
    const ids = await marcar(page, 3);
    const barra = await page.evaluate(() => ({ vis: !document.querySelector('#r18Barra').hidden, txt: document.querySelector('.r18-contagem').textContent }));
    conferir(`${rot}: a barra só aparece com algo marcado e conta`, barraAntes && barra.vis && barra.txt === '3 marcadas', barra.txt);
    if (w === 375) await foto(page, '#r18Barra', `depois-barra-${papel}-${w}-${tema}`);
    dialogos.length = 0;
    await page.click('[data-r18-acao="concluir"]');
    conferir(`${rot}: concluir pede confirmação dizendo quantas`, /^Concluir 3 tarefas atrasadas\?/.test(dialogos[0] || ''), dialogos[0]);
    conferir(`${rot}: concluir tira as 3 da lista`, await esperarTotal(page, t0 - 3));
    const toastTxt = await page.evaluate(() => ({ t: document.querySelector('#toast')?.textContent || '', b: !document.querySelector('#toastAcao').hidden }));
    conferir(`${rot}: aviso com Desfazer`, /3 tarefas concluídas/.test(toastTxt.t) && toastTxt.b, toastTxt.t);
    const ult = await page.evaluate(() => document.querySelector('.r18-ultimo')?.textContent || '');
    conferir(`${rot}: o cartão guarda o último lote com quem fez e quando`, /Último lote: 3 tarefas concluídas \(/.test(ult), ult);
    await page.click('#toastAcao');
    conferir(`${rot}: Desfazer do aviso reabre as 3`, await esperarTotal(page, t0));
    const voltaram = await page.evaluate(ids => ids.every(id => T18.dados.itens.some(i => i.id === id)), ids);
    conferir(`${rot}: são as mesmas 3`, voltaram);

    // 2. passar para amanhã e desfazer pelo link do cartão
    await marcar(page, 2); dialogos.length = 0;
    await page.click('[data-r18-acao="amanha"]');
    conferir(`${rot}: amanhã pede confirmação com a hora`, /para amanhã, 9h\?/.test(dialogos[0] || ''), dialogos[0]);
    conferir(`${rot}: as 2 saem das atrasadas`, await esperarTotal(page, t0 - 2));
    await page.evaluate(() => document.querySelector('#toast')?.classList.remove('show'));
    await page.click('#r18Tarefas [data-r18="desfazer"]');
    conferir(`${rot}: "Desfazer" do cartão volta o último lote`, await esperarTotal(page, t0));
    conferir(`${rot}: e o link some depois`, await page.evaluate(() => !document.querySelector('#r18Tarefas [data-r18="desfazer"]')));

    // 3. gestor: filtro por pessoa e passar para outra pessoa
    if (papel === 'gestor') {
      const antesBruno = await page.evaluate(() => T18.dados.itens.filter(i => i.responsavel_id === 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002').length);
      await page.evaluate(() => document.querySelector('[data-r18-filtro="minhas"]').click()); await espera(150);
      const soMinhas = await page.evaluate(() => [...document.querySelectorAll('#r18Tarefas .r18-i-m')].every(s => /Você/.test(s.textContent)));
      conferir(`${rot}: filtro "Minhas" mostra só as suas`, soMinhas);
      await marcar(page, 2);
      await page.select('#r18Para', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002'); dialogos.length = 0;
      await page.click('[data-r18-acao="reatribuir"]');
      conferir(`${rot}: passar pede confirmação com o nome e avisa da notificação`, /Passar 2 tarefas atrasadas para Bruno Vendas Fictício\? Ela recebe um aviso/.test(dialogos[0] || ''), dialogos[0]);
      await page.waitForFunction(n => T18.dados.itens.filter(i => i.responsavel_id === 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002').length === n, { timeout: 8000 }, antesBruno + 2).then(() => conferir(`${rot}: Bruno ficou com mais 2`, true), () => conferir(`${rot}: Bruno ficou com mais 2`, false));
      const aud = await page.evaluate(async () => (await (await fetch('/api/__mock/auditoria18', { headers: { authorization: 'Bearer mock' } })).json()));
      conferir(`${rot}: o servidor registra quem fez cada lote`, aud.filter(a => a.acao === 'tarefas_lote').length >= 3 && aud.some(a => a.detalhes.acao === 'reatribuir'), `${aud.length} registros`);
      await page.click('#toastAcao');
      await page.waitForFunction(n => T18.dados.itens.filter(i => i.responsavel_id === 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002').length === n, { timeout: 8000 }, antesBruno).then(() => conferir(`${rot}: Desfazer devolve para quem era`, true), () => conferir(`${rot}: Desfazer devolve para quem era`, false));
      await page.evaluate(() => document.querySelector('[data-r18-filtro=""]').click());
    }

    // 4. agendados sem horário
    const ag = await page.evaluate(() => { const a = document.querySelector('#r18Agendados'); const l = a.querySelector('a.btn'); return { vis: !a.hidden, n: a.querySelectorAll('.r18-ag').length, href: l ? l.getAttribute('href') : '' }; });
    conferir(`${rot}: agendados sem horário aparecem com o atalho da Agenda já com o cliente`, ag.vis && ag.n > 0 && /\?tel=\d{10,13}.*novo=1/.test(ag.href), `${ag.n} · ${ag.href}`);
    // o aviso do passo anterior some sozinho em alguns segundos; aqui ele sai na hora para não cobrir o botão
    await page.evaluate(() => { document.querySelector('#toast')?.classList.remove('show'); document.querySelector('#toastAcao').hidden = true; });
    await espera(600);                                       // o aviso some com transição
    const primeiro = await page.evaluate(() => document.querySelector('#r18Agendados [data-r18-voltar]').dataset.r18Voltar);
    await page.click(`#r18Agendados [data-r18-voltar="${primeiro}"]`);
    await page.waitForFunction(id => !document.querySelector(`#r18Agendados [data-r18-voltar="${id}"]`), { timeout: 8000 }, primeiro).then(() => conferir(`${rot}: "Voltar para Em contato" muda a etapa e tira da lista`, true), () => conferir(`${rot}: "Voltar para Em contato" muda a etapa e tira da lista`, false));
    const st = await page.evaluate(id => TODOS.find(l => l.id === id)?.status, primeiro);
    conferir(`${rot}: o contato ficou Em contato`, st === 'contato', `${st} · ${await page.evaluate(() => document.querySelector('#toast')?.textContent + ' · ' + document.querySelector('dialog[open]')?.id)}`);
    await page.click('#toastAcao');
    await page.waitForFunction(id => !!document.querySelector(`#r18Agendados [data-r18-voltar="${id}"]`), { timeout: 8000 }, primeiro).then(() => conferir(`${rot}: Desfazer devolve para Agendado e para a lista`, true), () => conferir(`${rot}: Desfazer devolve para Agendado e para a lista`, false));

    // 5. regras da tela
    await page.evaluate(() => scrollTo(0, 0));
    conferir(`${rot}: sem rolagem lateral`, !(await page.evaluate(w => Math.max(document.documentElement.scrollWidth, innerWidth) > w + 1, w)));
    await marcar(page, 1);
    const pequenos = await page.evaluate(() => [...document.querySelectorAll('#r18Tarefas button, #r18Tarefas a, #r18Tarefas select, #r18Tarefas label, #r18Agendados button, #r18Agendados a')].filter(b => b.offsetParent && b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().height < 44).map(b => (b.textContent || b.tagName).trim().slice(0, 24)));
    if (w === 375) conferir(`${rot}: nenhum toque menor que 44 px nos cartões novos`, pequenos.length === 0, pequenos.slice(0, 5).join(' | '));
    await marcar(page, 1);
    conferir(`${rot}: zero erro de console`, erros.length === 0, erros.slice(0, 3).join(' | '));
    await page.close();
  }

  // service worker de verdade, duas visitas
  const s = await abrir('atendente', 375, 'escuro');
  const reg = await s.page.evaluate(async () => { try { await navigator.serviceWorker.register('sw.js'); await Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error('sem ready')), 10000))]); return 'ok'; } catch (e) { return String(e.message || e); } });
  conferir('service worker registrado', reg === 'ok', reg); await espera(1500);
  await s.page.reload({ waitUntil: 'domcontentloaded' });
  await s.page.waitForFunction(() => document.querySelector('#r18Tarefas') && !document.querySelector('#r18Tarefas').hidden, { timeout: 25000 }); await espera(1000);
  const sw = await s.page.evaluate(async () => ({ ctrl: !!navigator.serviceWorker.controller, chaves: await caches.keys(), arquivos: await Promise.all(['r18.js', 'r18-casa.js', 'r18.css'].map(async f => !!(await caches.match(f)) || !!(await caches.match('/' + f)))) }));
  conferir('service worker: 2ª visita controlada, v22 e os 3 arquivos da R18 em cache', sw.ctrl && sw.chaves.some(c => /crm-v22$/.test(c)) && sw.arquivos.every(Boolean), JSON.stringify(sw));
  conferir('service worker: zero erro de console', s.erros.length === 0, s.erros.slice(0, 3).join(' | '));
  await s.page.close();
} finally { await browser.close(); }
const falhas = resultados.filter(r => !r.ok).length;
console.log(`\n${resultados.length - falhas} de ${resultados.length}`);
process.exit(falhas ? 1 : 0);
