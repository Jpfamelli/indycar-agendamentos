// Roteiro de navegador da rodada 3 — `npm run navegador` com o mock no ar (`npm run mock`).
// puppeteer-core + Chrome instalado, em 1440 e 375 px, um papel por vez (?papel=).
// O puppeteer-core NÃO é dependência deste app: vem de PUPPETEER_DIR (padrão: a pasta
// indycar-ferramentas, que já o tem). Capturas em SHOTS_DIR (padrão: ./capturas-r3, fora do git).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.env.PUPPETEER_DIR || 'C:/Users/USER/.claude/backups/indycar-ferramentas';
const puppeteer = createRequire(path.join(DIR, 'package.json'))('puppeteer-core');
const BASE = process.env.MOCK_URL || 'http://localhost:3511';
const SHOTS = process.env.SHOTS_DIR || path.resolve('capturas-r3');
fs.mkdirSync(SHOTS, { recursive: true });

const resultados = [];
const ok = (larg, nome, cond, extra = '') => { resultados.push({ larg, nome, ok: !!cond, extra }); console.log(`${cond ? '✔' : '✖'} [${larg}] ${nome}${extra ? ` — ${extra}` : ''}`); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });

async function abrir(larg, qs) {
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text())) erros.push(m.text()); });
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Esta semana não' : undefined));
  if (larg === 375) await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}/?${qs}&tour=0`, { waitUntil: 'networkidle0' }); // rodada 4: sem o tour de boas-vindas
  await espera(600);
  page.__erros = erros;
  return page;
}
const visivel = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; }, sel);
const texto = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent?.trim() || '', sel);
const semRolagemLateral = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const clicar = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; el.click(); return true; }, sel);
const foto = (page, nome) => page.screenshot({ path: path.join(SHOTS, `${nome}.png`) });

for (const larg of [1440, 375]) {
  // ---------------- admin: sino, tarefas, menu, perfil, aprovação ----------------
  {
    const page = await abrir(larg, 'papel=admin&saude=ok&semente=1');
    ok(larg, 'admin: app aberto (login escondido)', !(await visivel(page, '#telaLogin')) && await visivel(page, '.hero-dia'));
    ok(larg, 'admin: sino com contador', await visivel(page, '#btnSino') && Number(await texto(page, '#contSino')) >= 1, await texto(page, '#contSino'));
    ok(larg, 'admin: faixa "para você" com aprovação', await visivel(page, '#faixaEquipe .fe-item.roxo'));
    ok(larg, 'admin: Rodar agora visível', await visivel(page, '#btnRodar'));
    await foto(page, `admin-inicio-${larg}`);
    await clicar(page, '#btnSino'); await espera(400);
    ok(larg, 'sino abre com a reclamação', await visivel(page, '#sinoPop') && /reclamou/.test(await texto(page, '#sinoPop')));
    ok(larg, 'sino sem rolagem lateral', await semRolagemLateral(page));
    await foto(page, `admin-sino-${larg}`);
    await page.keyboard.press('Escape'); await espera(200);
    ok(larg, 'Esc fecha o sino', !(await visivel(page, '#sinoPop')));
    await clicar(page, '#btnSino'); await espera(300);
    await clicar(page, '.sino-item.nova'); await espera(900);
    ok(larg, 'notificação de reclamação abre a ficha do cliente', await visivel(page, '#gaveta') && /Donizetti/.test(await texto(page, '#gavetaTitulo')));
    ok(larg, 'ficha tem botão Tarefa', await visivel(page, '#gTarefa'));
    await clicar(page, '#gTarefa'); await espera(500);
    ok(larg, 'Tarefa da ficha abre "Minhas tarefas" ligada ao cliente', await visivel(page, '#formTarefa') && /Donizetti/.test(await page.$eval('#tf_titulo', (e) => e.value)));
    await page.evaluate(() => document.querySelector('#formTarefa').requestSubmit()); await espera(600);
    ok(larg, 'tarefa criada aparece na lista', /Falar com Donizetti/.test(await texto(page, '#listaTarefas')));
    await clicar(page, '#listaTarefas [data-concluir]'); await espera(900);
    ok(larg, 'concluir tarefa', /concluída/.test(await texto(page, '#toast')));
    await page.keyboard.press('Escape'); await espera(200); await page.keyboard.press('Escape'); await espera(200);
    // menu da conta
    await clicar(page, '#avatarPerfil'); await espera(350);
    ok(larg, 'menu da conta abre', await visivel(page, '#contaPop') && /Sair de todos os aparelhos/.test(await texto(page, '#contaPop')));
    await foto(page, `admin-menu-${larg}`);
    await clicar(page, '[data-conta="perfil"]'); await espera(400);
    ok(larg, 'Meu perfil: e-mail só leitura', await page.$eval('#pf_email', (e) => e.readOnly));
    await clicar(page, '.cor[data-cor="#22c55e"]');
    await page.$eval('#pf_cargo', (e) => { e.value = 'Dono da oficina'; });
    await clicar(page, '#pf_salvar'); await espera(500);
    ok(larg, 'Meu perfil salva e pinta o avatar', (await page.$eval('#avatarPerfil', (e) => e.style.background)).includes('34, 197, 94'));
    await clicar(page, '#avatarPerfil'); await espera(300); await clicar(page, '[data-conta="mfa"]'); await espera(500);
    ok(larg, 'duas etapas: mostra Ligar', await visivel(page, '#mfaLigar'));
    await clicar(page, '#mfaLigar'); await espera(500);
    ok(larg, 'duas etapas: QR e chave', await visivel(page, '.mfa-qr img') && /JBSWY3DP/.test(await texto(page, '.mfa-chave')));
    await page.type('#mfaNovo', '000000'); await clicar(page, '#mfaConfirmar'); await espera(300);
    ok(larg, 'duas etapas: código errado avisa', await visivel(page, '#mfaErro'));
    await page.$eval('#mfaNovo', (e) => { e.value = ''; }); await page.type('#mfaNovo', '123456'); await clicar(page, '#mfaConfirmar'); await espera(400);
    ok(larg, 'duas etapas: ligada', /ligada/i.test(await texto(page, '#toast')));
    await clicar(page, '#avatarPerfil'); await espera(300); await clicar(page, '[data-conta="senha"]'); await espera(400);
    await page.type('#ts_1', 'curta'); await page.type('#ts_2', 'curta'); await clicar(page, '#ts_ok'); await espera(200);
    ok(larg, 'trocar senha: barra senha curta', /8 caracteres/.test(await texto(page, '#ts_erro')));
    await page.keyboard.press('Escape'); await espera(200);
    // aprovação
    await clicar(page, '[data-route="campanhas"]'); await espera(900);
    ok(larg, 'Campanhas: painel "Para aprovar"', /Para aprovar/.test(await texto(page, '#aprovacoes')) && await visivel(page, '[data-aprovar]'));
    ok(larg, 'Campanhas sem rolagem lateral', await semRolagemLateral(page));
    await foto(page, `admin-aprovar-${larg}`);
    await clicar(page, '[data-aprovar]'); await espera(1100);
    ok(larg, 'aprovar coloca na fila', /Aprovada:/.test(await texto(page, '#toast')), await texto(page, '#toast'));
    await clicar(page, '[data-route="mensagens"]'); await espera(900);
    ok(larg, 'Mensagens: exportar CSV visível para admin', await visivel(page, '#btnCSV'));
    ok(larg, 'Mensagens: "✍ Leonardo" mostra quem mandou', /✍ Leonardo/.test(await texto(page, '#listaEnvios')));
    ok(larg, 'admin: zero erro de console', page.__erros.length === 0, page.__erros.slice(0, 2).join(' | '));
    await page.close();
  }

  // ---------------- atendente: avulsa sim, massa vira pedido de aprovação ----------------
  {
    const page = await abrir(larg, 'papel=atendente&saude=ok');
    ok(larg, 'atendente: sem "Rodar agora"', !(await visivel(page, '#btnRodar')));
    ok(larg, 'atendente: tarefas com contador', Number(await texto(page, '#contTarefas')) >= 1);
    ok(larg, 'atendente: faixa mostra tarefa vencida', await visivel(page, '#faixaEquipe .fe-item.alerta'));
    await foto(page, `atendente-inicio-${larg}`);
    await clicar(page, '[data-route="mensagens"]'); await espera(900);
    ok(larg, 'atendente: sem exportar CSV', !(await visivel(page, '#btnCSV')));
    const cancelaveis = await page.evaluate(() => [...document.querySelectorAll('.envio')].filter((c) => !/✍ você/.test(c.textContent) && c.querySelector('[data-cancelar],[data-reenviar]')).length);
    ok(larg, 'atendente: não cancela/reenvia mensagem de régua ou de outra pessoa', cancelaveis === 0, `${cancelaveis} cartões`);
    ok(larg, 'atendente: cancela a campanha que ele propôs (aprovada pelo gestor)', await page.evaluate(() => [...document.querySelectorAll('.envio')].some((c) => /✍ você/.test(c.textContent) && c.querySelector('[data-cancelar]'))));
    await clicar(page, '[data-route="reguas"]'); await espera(900);
    ok(larg, 'atendente: réguas travadas', await page.evaluate(() => [...document.querySelectorAll('[data-cfg]')].every((e) => e.disabled)));
    await clicar(page, '[data-route="clientes"]'); await espera(900);
    ok(larg, 'atendente: sem importar planilha', !(await visivel(page, '#btnImportar')));
    ok(larg, 'atendente: não religa quem saiu da lista', await page.evaluate(() => [...document.querySelectorAll('.cli.fora [data-aceita]')].every((e) => e.disabled)));
    // campanha por segmento → pedir aprovação
    await clicar(page, '#btnNova'); await espera(1500);
    await clicar(page, '#campAvancar'); await espera(600);
    await page.$eval('#campCorpo', (e) => { e.value = 'Oi {primeiro_nome}! Semana do check-up gratuito na IndyCar. Quer um horário? 🏁'; e.dispatchEvent(new Event('input')); });
    await clicar(page, '#campAvancar'); await espera(400);
    ok(larg, 'atendente: passo 3 avisa da aprovação', await visivel(page, '.dica.aprovacao') && /Pedir aprovação/.test(await texto(page, '#campAvancar')));
    await foto(page, `atendente-pedir-aprovacao-${larg}`);
    await clicar(page, '#campAvancar'); await espera(1200);
    ok(larg, 'atendente: campanha vai para aprovação', /aprovação/.test(await texto(page, '#toast')), await texto(page, '#toast'));
    ok(larg, 'atendente: "Suas campanhas" com o pedido', /Suas campanhas/.test(await texto(page, '#aprovacoes')) && await visivel(page, '[data-cancelar-camp]'));
    await clicar(page, '[data-cancelar-camp]'); await espera(900);
    ok(larg, 'atendente: cancela o próprio pedido', /cancelado/.test(await texto(page, '#toast')));
    // deixa um pedido aguardando para o gestor (pelo mesmo caminho da tela)
    await page.evaluate(() => api('POST', '/envios', { corpo: 'Oi {primeiro_nome}! Revisão de férias com 10% na mão de obra.', segmento: { filtro: 'todos' } }));
    // avulsa para um cliente
    await clicar(page, '#btnNova'); await espera(800);
    await clicar(page, '[data-alvo="cliente"]'); await espera(300);
    await page.type('#campBusca', 'Maria'); await espera(700);
    await clicar(page, '#campSug .sugestao'); await espera(300);
    await clicar(page, '#campAvancar'); await espera(300);
    await page.$eval('#campCorpo', (e) => { e.value = 'Oi {primeiro_nome}, seu carro está pronto!'; e.dispatchEvent(new Event('input')); });
    await clicar(page, '#campAvancar'); await espera(300);
    ok(larg, 'atendente: avulsa não pede aprovação', /Colocar na fila/.test(await texto(page, '#campAvancar')));
    await clicar(page, '#campAvancar'); await espera(900);
    ok(larg, 'atendente: avulsa na fila', /na fila/.test(await texto(page, '#toast')), await texto(page, '#toast'));
    await clicar(page, '[data-route="mensagens"]'); await espera(900);
    ok(larg, 'atendente: cancela a própria avulsa', await page.evaluate(() => document.querySelectorAll('[data-cancelar]').length) >= 1);
    ok(larg, 'atendente: "✍ você" na própria mensagem', /✍ você/.test(await texto(page, '#listaEnvios')));
    ok(larg, 'atendente: sem rolagem lateral', await semRolagemLateral(page));
    ok(larg, 'atendente: zero erro de console', page.__erros.length === 0, page.__erros.slice(0, 2).join(' | '));
    await page.close();
  }

  // ---------------- gestor recebe o aviso e recusa ----------------
  {
    const page = await abrir(larg, 'papel=gestor&saude=ok');
    await clicar(page, '[data-route="campanhas"]'); await espera(900);
    ok(larg, 'gestor: vê a campanha para aprovar', await visivel(page, '[data-recusar]'));
    await clicar(page, '[data-recusar]'); await espera(900);
    ok(larg, 'gestor: recusa com motivo', /recusada/.test(await texto(page, '#toast')));
    await page.close();
  }

  // ---------------- acesso: sem app, agenda, desativado ----------------
  for (const [papel, esperado] of [['sem_app', 'Atendimento'], ['agenda', 'Agenda']]) {
    const page = await abrir(larg, `papel=${papel}`);
    ok(larg, `${papel}: tela "sem acesso" com o link certo`, await visivel(page, '#painelSemAcesso') && (await texto(page, '#semAcessoApps')).includes(esperado), await texto(page, '#semAcessoApps'));
    ok(larg, `${papel}: app escondido`, !(await visivel(page, '.hero-dia')));
    if (papel === 'sem_app') await foto(page, `sem-acesso-${larg}`);
    await page.close();
  }
  {
    const page = await abrir(larg, 'papel=desativado');
    ok(larg, 'desativado: volta ao login com o aviso', await visivel(page, '#formLogin') && /desativado/i.test(await texto(page, '#erroLogin')));
    await page.close();
  }

  // ---------------- troca obrigatória de senha ----------------
  {
    const page = await abrir(larg, 'papel=trocar_senha');
    ok(larg, 'trocar_senha: abre a tela de senha nova', await visivel(page, '#formNovaSenha') && /Troque/.test(await texto(page, '#novaSenhaTitulo')));
    await foto(page, `trocar-senha-${larg}`);
    await page.type('#novaSenha', 'nova@indycartaubate.com'); await page.type('#novaSenha2', 'nova@indycartaubate.com');
    await clicar(page, '#btnNovaSenha'); await espera(300);
    ok(larg, 'trocar_senha: não aceita igual ao e-mail', /e-mail/.test(await texto(page, '#erroNovaSenha')));
    await page.$eval('#novaSenha', (e) => { e.value = ''; }); await page.$eval('#novaSenha2', (e) => { e.value = ''; });
    await page.type('#novaSenha', 'Oficina#2026'); await page.type('#novaSenha2', 'Oficina#2027');
    await clicar(page, '#btnNovaSenha'); await espera(300);
    ok(larg, 'trocar_senha: senhas diferentes avisam', /iguais/.test(await texto(page, '#erroNovaSenha')));
    await page.$eval('#novaSenha2', (e) => { e.value = 'Oficina#2026'; });
    await clicar(page, '#btnNovaSenha'); await espera(1500);
    ok(larg, 'trocar_senha: depois de salvar abre o app', await visivel(page, '.hero-dia') && !(await visivel(page, '#telaLogin')));
    await page.close();
  }

  // ---------------- duas etapas no login ----------------
  {
    const page = await abrir(larg, 'papel=mfa');
    ok(larg, 'mfa: pede o código depois da senha', await visivel(page, '#formMfa'));
    await page.type('#mfaCodigo', '111111'); await espera(600);
    ok(larg, 'mfa: código errado avisa', /errado/.test(await texto(page, '#erroMfa')));
    await page.$eval('#mfaCodigo', (e) => { e.value = ''; }); await page.type('#mfaCodigo', '123456'); await espera(1500);
    ok(larg, 'mfa: código certo abre o app', await visivel(page, '.hero-dia'));
    await page.close();
  }

  // ---------------- login: olho, caps, erros e espera, esqueci ----------------
  {
    const page = await abrir(larg, 'papel=admin&logado=0');
    await page.evaluate(() => { try { localStorage.removeItem('indycar_comunicar_erros_login'); } catch {} });
    ok(larg, 'login: tela de entrar', await visivel(page, '#formLogin'));
    await foto(page, `login-${larg}`);
    await page.type('#loginSenha', 'abc');
    await clicar(page, '[data-olho="loginSenha"]');
    ok(larg, 'login: mostrar senha', (await page.$eval('#loginSenha', (e) => e.type)) === 'text');
    if (larg === 375) ok(larg, 'login: e-mail lembrado já vem preenchido', (await page.$eval('#loginEmail', (e) => e.value)) === 'joao@indycartaubate.com');
    await page.$eval('#loginEmail', (e) => { e.value = ''; });
    await page.type('#loginEmail', 'joao@indycartaubate.com');
    for (let i = 0; i < 5; i++) {
      await page.$eval('#loginSenha', (e) => { e.value = 'errada'; });
      await page.evaluate(() => document.querySelector('#formLogin').requestSubmit()); await espera(250);
    }
    ok(larg, 'login: senha errada explica', /incorretos/.test(await texto(page, '#erroLogin')));
    ok(larg, 'login: 5 erros → espera progressiva', /AGUARDE/.test(await texto(page, '#btnEntrar')) && await page.$eval('#btnEntrar', (b) => b.disabled), await texto(page, '#btnEntrar'));
    await page.evaluate(() => { try { localStorage.removeItem('indycar_comunicar_erros_login'); } catch {} });
    await clicar(page, '#linkEsqueci'); await espera(200);
    ok(larg, 'esqueci: e-mail preenchido', (await page.$eval('#esqueciEmail', (e) => e.value)) === 'joao@indycartaubate.com');
    await page.evaluate(() => document.querySelector('#formEsqueci').requestSubmit()); await espera(400);
    ok(larg, 'esqueci: confirma o envio e avisa do limite do plano', await visivel(page, '#okEsqueci') && /senha temporária/.test(await texto(page, '#formEsqueci')));
    await clicar(page, '[data-voltar-login]'); await espera(200);
    await page.$eval('#loginSenha', (e) => { e.value = 'Certa#2026'; });
    await page.evaluate(() => { document.querySelector('#lembrarEmail').checked = true; document.querySelector('#formLogin').requestSubmit(); }); await espera(1500);
    ok(larg, 'login: senha certa abre o app', await visivel(page, '.hero-dia'));
    ok(larg, 'login: lembrou o e-mail', (await page.evaluate(() => localStorage.getItem('indycar_email_lembrado'))) === 'joao@indycartaubate.com');
    ok(larg, 'login: sem rolagem lateral', await semRolagemLateral(page));
    await page.close();
  }
}
await browser.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} verificações ok${falhas.length ? ` — falharam: ${falhas.map((f) => `[${f.larg}] ${f.nome}`).join('; ')}` : ''}`);
process.exit(falhas.length ? 1 : 0);
