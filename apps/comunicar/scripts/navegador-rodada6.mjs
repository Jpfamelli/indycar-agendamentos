// Roteiro de navegador da Rodada 6 (21/10/2026): ligações no Início, agenda de envios, "por que não saiu",
// adiar, simular a rodada, resultados, painel das Réguas e a prévia exata da campanha (link de fora, não repetir).
// Mock no ar: `npm run mock` (porta 3511).   node scripts/navegador-rodada6.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
const DIR = process.env.PUPPETEER_DIR || 'C:/Users/USER/.claude/backups/indycar-ferramentas';
const puppeteer = createRequire(path.join(DIR, 'package.json'))('puppeteer-core');
const BASE = process.env.MOCK_URL || 'http://localhost:3511';
const SAIDA = process.env.RELATORIO_DIR || path.join(process.env.TEMP || '.', 'comunicar-rodada6');
mkdirSync(SAIDA, { recursive: true });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhou = 0;
const ok = (larg, nome, cond, extra = '') => { if (!cond) falhou++; console.log(`${cond ? '✔' : '✖'} [${larg}] ${nome}${extra ? ` — ${extra}` : ''}`); };
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });

async function abrir(larg, papel) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
  const erros = []; page.on('pageerror', (e) => erros.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.setViewport(larg === 375 ? { width: 375, height: 812, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
  await page.goto(`${BASE}/?papel=${papel}&semente=1&saude=ok&tour=0`, { waitUntil: 'networkidle0' }); await espera(900);
  return { ctx, page, erros };
}
const semRolagem = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const ir = async (page, rota) => { await page.evaluate((r) => document.querySelector(`.nav-item[data-route="${r}"]`)?.click(), rota); await espera(900); };
const visivel = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; }, sel);
const texto = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent || '', sel);

for (const larg of [1440, 375]) {
  // ------------------------------------------------------------ gestor
  {
    const { ctx, page, erros } = await abrir(larg, 'gestor');
    // Início
    const ini = await page.evaluate(() => ({ cons: document.querySelectorAll('#painelR6Con .r6-con').length, funil: document.querySelectorAll('#painelR6Con .r6-passo').length, sem: [...document.querySelectorAll('#painelR6Con .r6-con')].filter((c) => /sem leitura/.test(c.textContent)).length }));
    ok(larg, 'gestor Início: 7 ligações com os outros apps, funil de 5 passos e a que não leu diz "sem leitura"', ini.cons === 7 && ini.funil === 5 && ini.sem === 1, JSON.stringify(ini));
    ok(larg, 'gestor Início: sem rolagem lateral', await semRolagem(page));
    await page.screenshot({ path: path.join(SAIDA, `inicio-${larg}.png`) });

    // Mensagens
    await ir(page, 'mensagens');
    ok(larg, 'gestor Mensagens: botões Agenda, Resultados e Simular rodada', (await visivel(page, '#r6Agenda')) && (await visivel(page, '#r6Resultados')) && (await visivel(page, '#r6Simular')));
    await page.evaluate(() => document.querySelector('.pilula[data-filtro="pendente"]')?.click()); await espera(700);
    const botoes = await page.evaluate(() => ({ porque: document.querySelectorAll('#listaEnvios [data-r6-porque]').length, adiar: document.querySelectorAll('#listaEnvios [data-r6-adiar]').length }));
    ok(larg, 'gestor: cada mensagem na fila tem "Por que não saiu?" e "Adiar"', botoes.porque > 0 && botoes.adiar === botoes.porque, JSON.stringify(botoes));
    // Por que não saiu
    await page.evaluate(() => document.querySelector('#listaEnvios [data-r6-porque]').click()); await espera(900);
    const pq = await page.evaluate(() => ({ veredito: document.querySelector('.r6-veredito')?.textContent || '', passos: document.querySelectorAll('.r6-passos li').length }));
    ok(larg, 'gestor: "Por que não saiu?" mostra o veredito e os passos', pq.veredito.length > 5 && pq.passos >= 1, JSON.stringify(pq));
    await page.screenshot({ path: path.join(SAIDA, `porque-${larg}.png`) });
    await page.evaluate(() => document.querySelector('.modal [data-fechar]')?.click()); await espera(300);
    // Adiar
    await page.evaluate(() => document.querySelector('#listaEnvios [data-r6-adiar]').click()); await espera(500);
    ok(larg, 'gestor: Adiar abre as opções de horário', (await page.evaluate(() => document.querySelectorAll('[data-r6-quando]').length)) >= 1);
    await page.evaluate(() => document.querySelector('[data-r6-quando]').click()); await espera(900);
    ok(larg, 'gestor: Adiar fecha o modal e avisa', !(await visivel(page, '.modal [data-r6-quando]')) && /Horário mudado/.test(await texto(page, '#toasts, .toast, body')));
    // Agenda
    await page.evaluate(() => document.querySelector('#r6Agenda').click()); await espera(900);
    const ag = await page.evaluate(() => ({ dias: document.querySelectorAll('.r6-dia').length, itens: document.querySelectorAll('.r6-itens li').length, rolagem: document.querySelector('.modal').scrollWidth <= document.querySelector('.modal').clientWidth + 1 }));
    ok(larg, 'gestor: Agenda de envios lista os dias com mensagens e cabe na tela', ag.dias >= 1 && ag.itens >= 1 && ag.rolagem, JSON.stringify(ag));
    await page.screenshot({ path: path.join(SAIDA, `agenda-${larg}.png`) });
    const diaBtn = await page.evaluate(() => document.querySelectorAll('[data-r6-adiar-dia]').length);
    ok(larg, 'gestor: cada dia da Agenda tem "Adiar o dia todo"', diaBtn === (await page.evaluate(() => document.querySelectorAll('.r6-dia').length)) && diaBtn >= 1, String(diaBtn));
    await page.evaluate(() => document.querySelector('[data-r6-adiar-dia]').click()); await espera(500);
    const adDia = await page.evaluate(() => ({ ops: document.querySelectorAll('.modal [data-r6-quando]').length, cabe: document.querySelector('.modal').scrollWidth <= document.querySelector('.modal').clientWidth + 1 }));
    ok(larg, 'gestor: Adiar o dia todo oferece 3 atalhos, escolha livre e cabe na tela', adDia.ops === 3 && adDia.cabe, JSON.stringify(adDia));
    await page.evaluate(() => document.querySelector('.modal [data-r6-quando]').click()); await espera(900);
    ok(larg, 'gestor: Adiar o dia todo avisa quantas foram e volta para a agenda', /adiada/.test(await texto(page, 'body')) && (await page.evaluate(() => document.querySelectorAll('.r6-dia').length)) >= 1);
    await page.evaluate(() => document.querySelector('.modal [data-fechar]')?.click()); await espera(300);
    // Simular
    await page.evaluate(() => document.querySelector('#r6Simular').click()); await espera(1000);
    const sim = await page.evaluate(() => ({ blocos: document.querySelectorAll('.r6-sim-bloco').length, txt: document.querySelector('#r6SimCorpo')?.textContent || '' }));
    ok(larg, 'gestor: Simular a rodada separa sairiam / puladas / adiadas e diz que nada foi enviado', sim.blocos >= 3 && /Nada foi enviado/.test(sim.txt), `${sim.blocos} blocos`);
    await page.screenshot({ path: path.join(SAIDA, `simular-${larg}.png`) });
    await page.evaluate(() => document.querySelector('.modal [data-fechar]')?.click()); await espera(300);
    // Resultados
    await page.evaluate(() => document.querySelector('#r6Resultados').click()); await espera(1000);
    const rs = await page.evaluate(() => ({ linhas: document.querySelectorAll('.r6-res-linha').length, funil: document.querySelectorAll('#r6ResModal .r6-passo').length }));
    ok(larg, 'gestor: Resultados mostra o funil e uma linha por tipo/campanha', rs.linhas >= 2 && rs.funil === 5, JSON.stringify(rs));
    ok(larg, 'gestor: Resultados lista quem voltou e oferece a planilha', (await page.evaluate(() => document.querySelectorAll('#r6ResModal .r6-itens li').length)) >= 1 && (await visivel(page, '#r6ResCsv')));
    await page.screenshot({ path: path.join(SAIDA, `resultados-${larg}.png`) });
    await page.evaluate(() => { const d = document.querySelector('#r6ResDe'); d.value = '2030-01-01'; d.dispatchEvent(new Event('change', { bubbles: true })); }); await espera(500);
    ok(larg, 'Resultados: período invertido avisa em vez de calcular', /antes do/.test(await texto(page, '#r6ResModal')));
    await page.evaluate(() => document.querySelector('.modal [data-fechar]')?.click()); await espera(300);
    const cid = await page.evaluate(async () => { const r = await api('GET', '/envios?status=pendente&limite=80'); return (r.find((e) => e.cliente_id) || {}).cliente_id || null; });
    if (cid) {
      await page.evaluate((id) => abrirFicha(id), cid); await espera(1100);
      const fi = await page.evaluate(() => ({ bloco: document.querySelectorAll('.r6-programadas .mini-envio').length, porque: document.querySelectorAll('.r6-programadas [data-r6-porque]').length }));
      ok(larg, 'gestor Ficha: "Na fila para este cliente" com "Por que não saiu?" em cada mensagem', fi.bloco >= 1 && fi.porque === fi.bloco, JSON.stringify(fi));
      ok(larg, 'gestor Ficha: sem rolagem lateral', await semRolagem(page));
      await page.evaluate(() => document.querySelector('#gavetaOverlay, .gaveta-fechar, [data-fechar]')?.click());
      await page.keyboard.press('Escape'); await espera(300);
    } else ok(larg, 'gestor Ficha: o mock tem cliente com mensagem na fila', false);
    ok(larg, 'gestor Mensagens: filtro por origem com 5 opções', (await page.evaluate(() => document.querySelectorAll('#origemMsg option').length)) === 5);
    ok(larg, 'gestor Mensagens: sem rolagem lateral', await semRolagem(page));

    // Réguas
    await ir(page, 'reguas');
    const rg = await page.evaluate(() => ({ painel: !!document.querySelector('#painelR6Reguas'), sw: document.querySelectorAll('#painelR6Reguas input[type=checkbox][data-r6cfg]').length, textos: document.querySelectorAll('#painelR6Reguas textarea').length, bolhas: [...document.querySelectorAll('#painelR6Reguas .bolha')].map((b) => b.textContent.length > 20) }));
    ok(larg, 'gestor Réguas: 8 interruptores, 3 textos com prévia', rg.painel && rg.sw === 8 && rg.textos === 3 && rg.bolhas.every(Boolean), JSON.stringify(rg));
    await page.evaluate(() => { const t = document.querySelector('#r6t_msg_orcador_visto'); t.value = 'Oi, ficou alguma dúvida do orçamento? Estou aqui.'; t.dispatchEvent(new Event('input', { bubbles: true })); }); await espera(300);
    const er = await page.evaluate(() => ({ erro: document.querySelector('#r6e_msg_orcador_visto')?.textContent || '', visivel: !document.querySelector('#r6e_msg_orcador_visto').hidden, barra: !document.querySelector('#barraSalvar').hidden }));
    ok(larg, 'gestor Réguas: texto sem {link_orcamento} avisa na hora e liga a barra de salvar', er.visivel && /link_orcamento/.test(er.erro) && er.barra, er.erro);
    await page.evaluate(() => { const t = document.querySelector('#r6t_msg_orcador_visto'); t.value = 'Oi {primeiro_nome}, ficou alguma dúvida? {link_orcamento}'; t.dispatchEvent(new Event('input', { bubbles: true })); }); await espera(300);
    ok(larg, 'gestor Réguas: texto corrigido limpa o aviso', !(await page.evaluate(() => !document.querySelector('#r6e_msg_orcador_visto').hidden)));
    await page.evaluate(() => { const c = document.querySelector('[data-r6cfg="usa_orcador"]'); c.click(); }); await espera(200);
    ok(larg, 'gestor Réguas: desligar uma ligação muda o rótulo e conta como alteração', /Desligado/.test(await page.evaluate(() => document.querySelector('[data-r6cfg="usa_orcador"]').closest('.sw').textContent)));
    const teto = await page.evaluate(() => { const i = document.querySelector('input[type=number][data-r6cfg="max_mensagens_cliente_dia"]'); return i ? { v: i.value, min: i.min, max: i.max, off: i.disabled } : null; });
    ok(larg, 'gestor Réguas: teto de mensagens por cliente no dia (1 a 10, vem com 3, editável)', !!teto && teto.v === '3' && teto.min === '1' && teto.max === '10' && !teto.off, JSON.stringify(teto));
    await page.screenshot({ path: path.join(SAIDA, `reguas-${larg}.png`), fullPage: false });
    ok(larg, 'gestor Réguas: sem rolagem lateral', await semRolagem(page));

    // Campanha com link de fora
    await ir(page, 'campanhas');
    await page.evaluate(() => document.querySelector('#btnNovaCamp').click()); await page.waitForSelector('#segPrevia .n', { timeout: 8000 }); await espera(300);
    await page.evaluate(() => document.querySelector('#campAvancar').click()); await espera(500);
    await page.evaluate(() => { const t = document.querySelector('#campCorpo'); t.value = 'Oi {primeiro_nome}, olha essa oferta: https://promo-estranha.example.net/oferta'; t.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.evaluate(() => document.querySelector('#campAvancar').click()); await espera(1400);
    const pc = await page.evaluate(() => ({ exata: document.querySelectorAll('.r6-linhas li').length, aviso: !!document.querySelector('.r6-linkfora'), caixa: !!document.querySelector('#r6ConfirmaLink'), evitar: !!document.querySelector('#r6Evitar') }));
    ok(larg, 'gestor Campanha: prévia exata com linhas reais, "não repetir" e aviso de link de fora', pc.exata >= 1 && pc.aviso && pc.caixa && pc.evitar, JSON.stringify(pc));
    await page.screenshot({ path: path.join(SAIDA, `campanha-${larg}.png`) });
    await page.evaluate(() => document.querySelector('#campAvancar').click()); await espera(400);
    ok(larg, 'gestor Campanha: sem confirmar o link, não envia', /Marque que conhece o link/.test(await texto(page, 'body')) && (await visivel(page, '#campAvancar')));
    ok(larg, 'gestor Campanha: modal cabe na tela', await semRolagem(page));
    ok(larg, 'gestor: zero erro de console', !erros.length, erros.slice(0, 3).join(' | '));
    await ctx.close();
  }
  // ------------------------------------------------------------ atendente
  {
    const { ctx, page, erros } = await abrir(larg, 'atendente');
    await ir(page, 'mensagens');
    ok(larg, 'atendente Mensagens: vê Agenda e Resultados, não vê Simular rodada', (await visivel(page, '#r6Agenda')) && (await visivel(page, '#r6Resultados')) && !(await page.evaluate(() => !!document.querySelector('#r6Simular'))));
    await page.evaluate(() => document.querySelector('#r6Resultados').click()); await espera(900);
    ok(larg, 'atendente: Resultados abre mas sem o botão da planilha (só gestor exporta)', (await page.evaluate(() => document.querySelectorAll('#r6ResModal .r6-passo').length)) === 5 && !(await page.evaluate(() => !!document.querySelector('#r6ResCsv'))));
    await page.evaluate(() => document.querySelector('.modal [data-fechar]')?.click()); await espera(300);
    await page.evaluate(() => document.querySelector('#r6Agenda').click()); await espera(900);
    ok(larg, 'atendente: Agenda sem "Adiar o dia todo"', (await page.evaluate(() => document.querySelectorAll('.r6-dia').length)) >= 1 && !(await page.evaluate(() => !!document.querySelector('[data-r6-adiar-dia]'))));
    await page.evaluate(() => document.querySelector('.modal [data-fechar]')?.click()); await espera(300);
    await ir(page, 'reguas');
    ok(larg, 'atendente Réguas: painel novo aparece só para olhar (tudo desabilitado)', await page.evaluate(() => { const c = [...document.querySelectorAll('#painelR6Reguas [data-r6cfg]')]; return c.length >= 11 && c.every((x) => x.disabled); }));
    await ir(page, 'campanhas');
    await page.evaluate(() => document.querySelector('#btnNovaCamp').click()); await page.waitForSelector('#segPrevia .n', { timeout: 8000 }); await espera(300);
    await page.evaluate(() => document.querySelector('#campAvancar').click()); await espera(500);
    await page.evaluate(() => { const t = document.querySelector('#campCorpo'); t.value = 'Veja https://promo-estranha.example.net/oferta'; t.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.evaluate(() => document.querySelector('#campAvancar').click()); await espera(1400);
    ok(larg, 'atendente Campanha: link de fora só o gestor envia (sem caixa de confirmação)', (await page.evaluate(() => !!document.querySelector('.r6-linkfora'))) && !(await page.evaluate(() => !!document.querySelector('#r6ConfirmaLink'))));
    await page.evaluate(() => document.querySelector('#campAvancar').click()); await espera(400);
    ok(larg, 'atendente Campanha: o envio é barrado com o motivo', /Só o gestor pode enviar/.test(await texto(page, 'body')));
    ok(larg, 'atendente: zero erro de console', !erros.length, erros.slice(0, 3).join(' | '));
    await ctx.close();
  }
}
await browser.close();
console.log(falhou ? `${falhou} falha(s)` : 'tudo ok', '· capturas em', SAIDA);
process.exit(falhou ? 1 : 0);
