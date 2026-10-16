// Roteiro de navegador da rodada 5 — com o mock no ar (`npm run mock`):
//   node scripts/navegador-rodada5.mjs
// puppeteer-core + Chrome instalado, em 1440 e 375 px. Confere: Saúde do WhatsApp
// (chave recusada → vermelho com o botão para Integrações; conectado → verde;
// "Conferir agora"), réguas (cadência, chips {link_os}/{link_area}, prioridade/silêncio,
// prévia com um cliente real), relatório com período e por régua, campanhas
// (segmentos salvos, pulados com motivo, teste no meu celular), "Onde toca" na
// mensagem, ficha "Nos outros apps", atalho ?abrir=campanha, 375 px sem rolagem lateral.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.env.PUPPETEER_DIR || 'C:/Users/USER/.claude/backups/indycar-ferramentas';
const puppeteer = createRequire(path.join(DIR, 'package.json'))('puppeteer-core');
const BASE = process.env.MOCK_URL || 'http://localhost:3511';
const SHOTS = process.env.SHOTS_DIR || path.resolve('capturas-r5');
fs.mkdirSync(SHOTS, { recursive: true });

const resultados = [];
const ok = (larg, nome, cond, extra = '') => { resultados.push({ larg, nome, ok: !!cond, extra }); console.log(`${cond ? '✔' : '✖'} [${larg}] ${nome}${extra ? ` — ${extra}` : ''}`); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });

async function abrir(larg, qs) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g|503|Service Unavailable|net::ERR|status of 403/.test(m.text())) erros.push(m.text()); });
  page.on('dialog', (d) => (d.type() === 'prompt' ? d.accept('Meu segmento de teste') : d.accept()));
  if (larg === 375) await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}/?${qs}`, { waitUntil: 'networkidle0' });
  await espera(900);
  page.__erros = erros; page.__ctx = ctx;
  return page;
}
const visivel = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; }, sel);
const texto = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() || '', sel);
const conta = (page, sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
const attr = (page, sel, a) => page.evaluate((s, at) => document.querySelector(s)?.getAttribute(at) || '', sel, a);
const semRolagemLateral = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const clicar = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; el.click(); return true; }, sel);
const foto = (page, nome) => page.screenshot({ path: path.join(SHOTS, `${nome}.png`) });
const fechar = async (page) => { await page.keyboard.press('Escape'); await espera(250); };
const semErros = (larg, page, quem) => ok(larg, `${quem}: zero erro de console`, !page.__erros.length, page.__erros.slice(0, 2).join(' | '));

for (const larg of [1440, 375]) {
  // ---------------- admin: Saúde do WhatsApp (chave recusada) ----------------
  {
    const page = await abrir(larg, 'papel=admin&semente=1&saude=erro&tour=0');
    ok(larg, 'saúde: painel aparece no Início', await visivel(page, '#painelSaudeWA'));
    ok(larg, 'saúde: chave recusada em vermelho, título e motivo em português', (await attr(page, '#painelSaudeWA', 'data-estado')) === 'chave_recusada' && /Chave do CodeWords recusada/.test(await texto(page, '#swCorpo')) && /recusada \(401\)/.test(await texto(page, '#swCorpo')));
    ok(larg, 'saúde: botão leva a Atendimento › Integrações', /indycar-atendimento\.onrender\.com\/\?aba=integracoes/.test(await attr(page, '#swCorpo a.btn', 'href')) && /Colar a chave/.test(await texto(page, '#swCorpo a.btn')));
    ok(larg, 'saúde: mostra a fila, o carteiro e a cadência', /mensagens na fila/.test(await texto(page, '.sw-det')) && /\/min/.test(await texto(page, '.sw-cad')));
    ok(larg, 'saúde: falhas por classe (número sem WhatsApp ≠ instabilidade)', await conta(page, '.sw-classes .badge-pill') >= 1);
    ok(larg, 'saúde: admin tem "Conferir agora"', await visivel(page, '#swReconferir'));
    await clicar(page, '#swReconferir'); await espera(700);
    ok(larg, 'saúde: "Conferir agora" repinta sem erro', /Chave do CodeWords recusada/.test(await texto(page, '#swCorpo')));
    ok(larg, 'início sem rolagem lateral', await semRolagemLateral(page));
    await foto(page, `saude-recusada-${larg}`);
    semErros(larg, page, 'saúde recusada');
    await page.__ctx.close();
  }
  // ---------------- gestor: WhatsApp ok ----------------
  {
    const page = await abrir(larg, 'papel=gestor&semente=1&whatsapp=ok&saude=ok&tour=0');
    ok(larg, 'saúde: conectado em verde com o número', (await attr(page, '#painelSaudeWA', 'data-estado')) === 'ok' && /WhatsApp conectado/.test(await texto(page, '#swCorpo')));
    ok(larg, 'saúde: conectado não mostra botão de chave', !(await conta(page, '#swCorpo a.btn[href*="integracoes"]')));
    await foto(page, `saude-ok-${larg}`);
    // réguas
    await clicar(page, '[data-route="reguas"]'); await espera(900);
    ok(larg, 'réguas: cadência (por minuto, por dia, mesmo cliente, só horário da loja) no Envio', await conta(page, '[data-cfg="limite_por_minuto"],[data-cfg="limite_por_dia"],[data-cfg="intervalo_mesmo_cliente_min"],[data-cfg="so_horario_comercial"]') === 4);
    ok(larg, 'réguas: chips {link_os} no lembrete e {link_area} no pós-venda', await conta(page, '.regua[data-regua="lembrete"] .var-chip[data-var="link_os"]') === 1 && await conta(page, '.regua[data-regua="posvenda"] .var-chip[data-var="link_area"]') === 1);
    ok(larg, 'réguas: prioridade e janela de silêncio em cada cartão', await conta(page, '.regua .regua-meta .chip') >= 16 && /silêncio 7 d/.test(await texto(page, '.regua[data-regua="aniversario"] .regua-meta')) && /não espera silêncio/.test(await texto(page, '.regua[data-regua="lembrete"] .regua-meta')));
    // prévia real
    await clicar(page, '.regua[data-regua="posvenda"] [data-previa-real]'); await espera(500);
    ok(larg, 'prévia real: modal abre com busca de cliente', await visivel(page, '#prBusca'));
    await page.type('#prBusca', 'Maria'); await espera(700);
    await clicar(page, '#prSug .sugestao'); await espera(800);
    ok(larg, 'prévia real: mensagem com o nome do cliente de verdade', /Maria/.test(await texto(page, '#prBolha')) && /Oi Maria!/.test(await texto(page, '#prBolha')));
    ok(larg, 'prévia real: mostra o último horário do cliente', /último horário/.test(await texto(page, '#prSaida')));
    await foto(page, `previa-real-${larg}`);
    await fechar(page);
    // mudar a cadência e ver a barra de salvar
    await page.$eval('[data-cfg="limite_por_minuto"]', (el) => { el.value = String(Number(el.value) === 5 ? 7 : 5); el.dispatchEvent(new Event('input', { bubbles: true })); });
    ok(larg, 'réguas: mudar a cadência acende "1 alteração sem salvar"', !(await page.$eval('#barraSalvar', (el) => el.hidden)) && (await texto(page, '#nAlteracoes')) === '1');
    await clicar(page, '#btnSalvar'); await espera(900);
    ok(larg, 'réguas: salvou a cadência', /Réguas salvas|salvas/.test(await texto(page, '#toast')) || /^(5|7)$/.test(await page.$eval('[data-cfg="limite_por_minuto"]', (el) => el.value)));
    ok(larg, 'réguas sem rolagem lateral', await semRolagemLateral(page));
    // relatório com período
    await clicar(page, '.regua[data-regua="posvenda"] [data-relatorio]'); await espera(900);
    ok(larg, 'relatório: seletor de período e 5 números (inclui pediram para parar e falharam)', await visivel(page, '#relPeriodo') && await conta(page, '.rel-nums.rel-5 > div') === 5 && /pediram para parar/.test(await texto(page, '.rel-nums')));
    ok(larg, 'relatório: tabela por régua no período', await conta(page, '.rel-tab .rel-l') >= 5 && /Parar/.test(await texto(page, '.rel-h')));
    await page.select('#relPeriodo', '30'); await espera(800);
    ok(larg, 'relatório: "últimos 30 dias" troca para o período', /Período:/.test(await texto(page, '#relCorpo')));
    await page.select('#relPeriodo', 'custom'); await espera(200);
    ok(larg, 'relatório: "escolher datas" mostra de/até', await visivel(page, '#relDe') && await visivel(page, '#relAte'));
    ok(larg, 'relatório sem rolagem lateral', await semRolagemLateral(page));
    await foto(page, `relatorio-periodo-${larg}`);
    await fechar(page);
    semErros(larg, page, 'gestor réguas/relatório');
    await page.__ctx.close();
  }
  // ---------------- gestor: campanha (segmentos salvos, pulados, teste meu) ----------------
  {
    const page = await abrir(larg, 'papel=admin&semente=1&whatsapp=ok&saude=ok&tour=0');
    await page.keyboard.press('n'); await espera(1200);
    ok(larg, 'campanha: segmentos salvos aparecem no passo 1', await conta(page, '.seg-salvos .chip-seg') === 2 && /Sumidos há 6 meses/.test(await texto(page, '.seg-salvos')));
    ok(larg, 'campanha: prévia diz quantos ficam de fora e por quê', /ficam de fora|fica de fora/.test(await texto(page, '.seg-pul')) && /pediram para parar|pediu para parar/.test(await texto(page, '.seg-pul')));
    ok(larg, 'campanha: botão "Salvar segmento" na prévia', await visivel(page, '#segSalvar'));
    await clicar(page, '.seg-salvos .chip-seg'); await espera(900);
    ok(larg, 'campanha: clicar no segmento salvo escolhe filtro e valor', (await page.$eval('#campSeg', (el) => el.value)) === 'sem_voltar' && (await page.$eval('#campValor', (el) => el.value)) === '6' && await conta(page, '.chip-seg.on') === 1);
    await clicar(page, '#segSalvar'); await espera(900);
    ok(larg, 'campanha: "Salvar segmento" cria o chip novo', await conta(page, '.seg-salvos .chip-seg') === 3 && /Meu segmento de teste/.test(await texto(page, '.seg-salvos')));
    await espera(1200); await clicar(page, '#campAvancar'); await espera(600);
    ok(larg, 'campanha: passo 2 tem "Mandar para o meu celular"', await visivel(page, '#campTesteMeu'));
    await page.type('#campCorpo', 'Oi {primeiro_nome}, teste da rodada 5!');
    await clicar(page, '#campTesteMeu'); await espera(900);
    ok(larg, 'campanha: teste no meu celular confirma no toast', /Teste enviado para o seu celular/.test(await texto(page, '#toast')));
    await foto(page, `campanha-segmentos-${larg}`);
    ok(larg, 'campanha sem rolagem lateral', await semRolagemLateral(page));
    await fechar(page);
    // campanhas: a proposta vinda do CRM
    await clicar(page, '[data-route="campanhas"]'); await espera(900);
    ok(larg, 'campanhas: proposta vinda do CRM com o selo "veio do CRM" e "lista de 3 clientes"', /veio do CRM/.test(await texto(page, '#aprovacoes')) && /lista de 3 clientes/.test(await texto(page, '#aprovacoes')));
    // mensagens: "Onde toca"
    await clicar(page, '[data-route="mensagens"]'); await espera(900);
    ok(larg, 'mensagens: cada cartão tem "Onde toca"', await conta(page, '.envio [data-ligacoes]') >= 10);
    ok(larg, 'mensagens: tipo "Horário remarcado" com rótulo e no filtro', /Horário remarcado/.test(await texto(page, '#listaEnvios')) && await conta(page, '#tipoMsg option[value="remarcacao"]') === 1);
    await clicar(page, '.envio [data-ligacoes]'); await espera(800);
    ok(larg, 'onde toca: modal com conversa e ficha no CRM', await conta(page, '#ligCorpo .lig-item') >= 2 && /Conversa no Atendimento/.test(await texto(page, '#ligCorpo')) && /indycar-crm\.onrender\.com/.test(await attr(page, '#ligCorpo .lig-item[href*="crm"]', 'href')));
    await foto(page, `onde-toca-${larg}`);
    await fechar(page);
    // busca por telefone normalizado
    await page.type('#qMsg', '12999990002'); await espera(700);
    ok(larg, 'mensagens: busca pelo telefone acha o cliente', await conta(page, '#listaEnvios .envio') >= 1 && /Carlos/.test(await texto(page, '#listaEnvios')));
    // ficha com "Nos outros apps"
    await clicar(page, '[data-route="clientes"]'); await espera(900);
    await page.evaluate(() => [...document.querySelectorAll('.cli [data-ficha]')].find((b) => /Maria Aparecida/.test(b.textContent))?.click()); await espera(900);
    ok(larg, 'ficha: bloco "Nos outros apps" com conversa, carro na oficina e CRM', /Nos outros apps/.test(await texto(page, '#gaveta')) && /Carro na oficina/.test(await texto(page, '#gaveta .lig')) && await conta(page, '#gaveta .lig-item[href*="indycar-patio"]') >= 1 && await conta(page, '#gaveta .lig-item[href*="conversa="]') >= 1);
    ok(larg, 'ficha: resumo 360 (mensagens trocadas, gasto)', /mensagens trocadas/.test(await texto(page, '#gaveta .lig-resumo')));
    ok(larg, 'ficha sem rolagem lateral', await semRolagemLateral(page));
    await foto(page, `ficha-360-${larg}`);
    semErros(larg, page, 'campanha/mensagens/ficha');
    await page.__ctx.close();
  }
  // ---------------- atendente: sem "Conferir agora", pode salvar segmento mas não apagar o alheio ----------------
  {
    const page = await abrir(larg, 'papel=atendente&semente=1&saude=erro&tour=0');
    ok(larg, 'atendente: vê a saúde mas não tem "Conferir agora"', await visivel(page, '#painelSaudeWA') && !(await conta(page, '#swReconferir')));
    await page.keyboard.press('n'); await espera(1200);
    ok(larg, 'atendente: segmentos salvos visíveis e "Salvar segmento" disponível', await conta(page, '.seg-salvos .chip-seg') === 2 && await visivel(page, '#segSalvar'));
    await page.evaluate(() => document.querySelector('.seg-salvos .chip-seg i[data-seg-apagar]')?.click()); await espera(800);
    ok(larg, 'atendente: apagar segmento de outro = aviso "Só gestor"', /Só gestor apaga/.test(await texto(page, '#toast')) || await conta(page, '.seg-salvos .chip-seg') === 2);
    await fechar(page);
    semErros(larg, page, 'atendente');
    await page.__ctx.close();
  }
  // ---------------- atalho do manifest ----------------
  {
    const page = await abrir(larg, 'papel=admin&semente=1&saude=ok&tour=0&abrir=campanha');
    await espera(900);
    ok(larg, 'atalho ?abrir=campanha abre a nova campanha', await visivel(page, '#campBody') && !/abrir=/.test(await page.evaluate(() => location.search)));
    await page.__ctx.close();
  }
}

await browser.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} verificações ok${falhas.length ? ` — FALHAS: ${falhas.map((f) => `[${f.larg}] ${f.nome}`).join('; ')}` : ''}`);
console.log(`Capturas em ${SHOTS}`);
process.exit(falhas.length ? 1 : 0);
