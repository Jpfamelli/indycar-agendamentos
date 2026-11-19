// Chrome com respostas simuladas. Nenhuma requisição sai para os serviços reais.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const puppeteer = require('../../indycar-ferramentas/node_modules/puppeteer-core');
const base = 'http://localhost:3490';
const baselineDir = process.env.CASA_BASELINE_DIR;
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  userDataDir: resolve('qa-out/casa-r8-perfil'), args: ['--no-sandbox', '--disable-background-networking'],
});
mkdirSync('qa-out', { recursive: true });
try {
  for (const [largura, tema, papel, ads] of [
    [1440, 'dark', 'gestor', true], [375, 'light', 'admin', false],
    [1440, 'light', 'gestor', false], [375, 'dark', 'atendente', true],
  ]) {
    const page = await browser.newPage();
    const erros = [];
    page.on('pageerror', (e) => erros.push(e.message));
    await page.setViewport({ width: largura, height: 900 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: tema }]);
    await page.setBypassServiceWorker(true);
    await page.evaluateOnNewDocument((papel, ads) => {
      const agora = new Date().toISOString();
      const perfil = { id: 'perfil-falso', nome: 'Equipe Teste', papel, apps: ['atendimento', 'agenda', 'crm', ...(ads ? ['ads'] : [])], ativo: true };
      const avisos = [
        { id: 'a', tipo: 'espera', app: 'atendimento', titulo: 'Ana está esperando', created_at: agora },
        { id: 'b', tipo: 'espera', app: 'atendimento', titulo: 'Bia está esperando', created_at: agora },
      ];
      const tarefa = { id: 't1', titulo: 'Conferir oficina', prioridade: 1, status: 'aberta', origem: 'atendimento', responsavel_id: perfil.id };
      const sessao = { user: { id: perfil.id, email: 'teste@example.invalid' }, access_token: 'simulado' };
      let entrou = false;
      window.supabase = { createClient: () => ({
        auth: {
          getSession: async () => ({ data: { session: entrou ? sessao : null } }),
          signInWithPassword: async ({ password }) => {
            if (password !== 'senha-simulada') return { error: new Error('Invalid login credentials') };
            entrou = true;
            return {};
          },
          onAuthStateChange() {},
        },
        rpc: async (nome, args) => {
          if (nome === 'vigia_avisos_abertos') {
            return { data: { graves: [{ codigo: 'codewords-chave-recusada', dias: 48 }], vigia_parado: false } };
          }
          if (nome === 'r6_busca_global') {
            if (args.p_termo === 'offline') return { error: new Error('sem resposta') };
            return { data: { total: 1, grupos: { conversas: [{
              id: '66666666-6666-4666-8666-666666666666', nome: 'Cliente Teste', telefone_55: '5512999990000', detalhe: 'Olá', status: 'aberta',
            }] } } };
          }
          return { data: {} };
        },
        from(tabela) {
          let mudanca, ids;
          const consulta = {
            select: () => consulta, eq: () => consulta, order: () => consulta, limit: () => consulta, is: () => consulta,
            in: (_, grupo) => { ids = grupo; return consulta; },
            update: (valores) => { mudanca = valores; return consulta; },
            maybeSingle: async () => ({ data: tabela === 'perfis' ? perfil : null }),
            then(ok) {
              if (tabela === 'notificacoes' && mudanca) avisos.filter((a) => ids.includes(a.id)).forEach((a) => Object.assign(a, mudanca));
              if (tabela === 'tarefas' && mudanca) Object.assign(tarefa, mudanca);
              return Promise.resolve({ data: tabela === 'notificacoes' ? avisos : tabela === 'tarefas' && tarefa.status === 'aberta' ? [tarefa] : [] }).then(ok);
            },
          };
          return consulta;
        },
      }) };
    }, papel, ads);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.origin !== base) return req.respond({ status: 200, contentType: 'text/javascript', body: '' });
      if (url.pathname === '/api/central/config') return req.respond({ contentType: 'application/json', body: JSON.stringify({ supabaseUrl: base, supabaseAnonKey: 'simulado' }) });
      if (url.pathname.startsWith('/api/')) return req.respond({ contentType: 'application/json', body: '{}' });
      const caminho = url.pathname === '/' ? '/casa/index.html' : url.pathname;
      if (!/^\/casa\/[\w.-]+$/.test(caminho)) return req.respond({ status: 204 });
      try {
        const ext = caminho.slice(caminho.lastIndexOf('.'));
        return req.respond({ contentType: tipos[ext] || 'application/octet-stream', body: readFileSync(resolve(baselineDir || '.', '.' + caminho)) });
      } catch { return req.respond({ status: 404 }); }
    });
    await page.goto(base);
    await page.waitForSelector('#fLogin', { visible: true });
    await page.type('#lEmail', 'teste@example.invalid');
    await page.type('#lSenha', 'incorreta');
    await page.click('#lEntrar');
    await page.waitForFunction(() => document.querySelector('#lErro').textContent.trim());
    await page.$eval('#lSenha', (el) => { el.value = ''; });
    await page.type('#lSenha', 'senha-simulada');
    await page.click('#lEntrar');
    await page.waitForSelector('#bSino', { visible: true });
    const lerTema = () => page.evaluate(() => document.documentElement.dataset.tema || 'escuro');
    const temaEsperado = tema === 'light' ? 'claro' : 'escuro';
    if (await lerTema() !== temaEsperado) await page.click('#bTema');
    assert.equal(await lerTema(), temaEsperado);
    await page.evaluate(() => document.fonts.ready);
    if (baselineDir) {
      assert.equal(await page.$('[data-avisos-vigia]'), null);
      await page.screenshot({ path: `qa-out/r8-antes-casa-${largura}-${tema}.png` });
      await page.click('#bSino');
      await page.waitForSelector('#listaNotif [data-notif]');
      assert.equal(await page.$('[data-grupo-tipo]'), null);
      await page.screenshot({ path: `qa-out/r8-antes-sino-${largura}-${tema}.png` });
      console.log(`BASE ${largura}px ${tema} ${papel}: faixa e controle de grupo ausentes`);
      await page.close();
      continue;
    }
    const gestor = papel === 'admin' || papel === 'gestor';
    if (gestor) {
      await page.waitForSelector('section[data-avisos-vigia]:not([hidden])');
      const aviso = await page.$eval('section[data-avisos-vigia]', (el) => el.textContent);
      assert.match(aviso, /WhatsApp recusado há 48 dias/);
    } else {
      assert.equal(await page.$eval('section[data-avisos-vigia]', (el) => el.hidden), true);
    }
    await page.screenshot({ path: `qa-out/r8-casa-${largura}-${tema}.png` });
    const trafego = await page.evaluate(() => document.querySelector('a[href="/trafego/"]')?.target || null);
    assert.equal(trafego, papel === 'admin' || (papel === 'gestor' && ads) ? 'indycar-ads' : null);
    await page.click('#bSino');
    const grupo = '[data-grupo-tipo="espera"]';
    await page.waitForSelector(grupo);
    await page.click(grupo + ' summary');
    await page.waitForSelector(grupo + '[open]');
    await page.click(grupo + ' > button');
    await page.waitForFunction((s) => !document.querySelector(s + ' > button'), {}, grupo);
    assert.equal(await page.$eval('#painelSino', (el) => el.hidden), false);
    assert.ok(await page.evaluate((s) => document.activeElement.matches(s + ' summary'), grupo));
    assert.equal(await page.$eval('#bSino', (el) => el.getAttribute('aria-label')), 'Notificações');
    if (process.env.CASA_AXE_PATH) {
      await page.addScriptTag({ path: process.env.CASA_AXE_PATH });
      const falhas = await page.evaluate(async () => {
        const { violations } = await window.axe.run({ include: ['section[data-avisos-vigia]', '#painelSino'] });
        return violations.filter((v) => ['serious', 'critical'].includes(v.impact))
          .map((v) => ({ regra: v.id, alvos: v.nodes.map((n) => n.target) }));
      });
      assert.deepEqual(falhas, [], 'axe-core na faixa do Vigia e no sino');
    }
    await page.screenshot({ path: `qa-out/r8-sino-${largura}-${tema}.png` });
    await page.click('#bSino');
    await page.click('#bBusca');
    await page.type('#buscaInput', 'Cliente');
    const resultado = await page.waitForSelector('#buscaLista a[href*="?conversa="]');
    assert.equal(await resultado.evaluate((a) => a.target), 'indycar-atendimento');
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.type('#buscaInput', 'offline');
    await page.waitForSelector('#buscaLista .vazio-erro');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-tarefa="t1"]', { visible: true });
    await page.click('[data-tarefa="t1"]');
    await page.waitForSelector('[data-tarefa="t1"]', { hidden: true });
    await page.click('#toast .toast-btn');
    await page.waitForSelector('[data-tarefa="t1"]', { visible: true });
    if (gestor) {
      await page.click('[data-visao="dono"]');
      await page.waitForSelector('#visaoDono', { visible: true });
    }
    const larguraReal = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(larguraReal <= largura, `rolagem lateral em ${largura}: ${larguraReal}`);
    assert.deepEqual(erros, []);
    console.log(`OK ${largura}px ${tema} ${papel}: login, Vigia, Tráfego, sino, busca, tarefas e largura`);
    await page.close();
  }
} finally {
  await browser.close();
}
