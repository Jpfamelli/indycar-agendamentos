/* ============================================================================
   Comportamentos da rodada 9 no navegador (servidor de mentira, nada real).

     PORTA=3532 node tela/_mock/r9-comportamentos.mjs [nome…]   (de apps/trafego)

   Cada caso abre a tela, faz o que a pessoa faria e confere o resultado.
   Sai com código 1 se algum caso falhar. Capturas em qa-out/r9/comportamentos/.
   ============================================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { subir } from './servidor.mjs';
import { carregarPuppeteer, CHROME } from './navegador.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.resolve(AQUI, '..', '..', 'qa-out', 'r9', 'comportamentos');
const PORTA = Number(process.env.PORTA) || 3532;
const filtro = process.argv.slice(2);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function texto(pagina, seletor) { return pagina.$eval(seletor, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => ''); }
function conferir(cond, msg) { if (!cond) throw new Error(msg); }

export const CASOS = {
  /* Gestor › Diário: anotar uma mudança feita por conta própria. */
  async 'gestor-anotar'(pagina, endereco) {
    await pagina.goto(endereco + '?cenario=cheio#/gestor', { waitUntil: 'networkidle0' });
    await pagina.click('.anotar-abrir');
    await pagina.click('.anotar-form button[type="submit"]');
    conferir((await texto(pagina, '#anTipo-erro')) === 'Escolha o tipo da mudança.', 'sem tipo, o erro aparece no campo');
    conferir(await pagina.$eval('#anTipo', (el) => document.activeElement === el), 'o foco vai para o campo com erro');
    await pagina.select('#anTipo', 'ajustar_horario');
    await pagina.type('#anTitulo', 'Desliguei os anúncios do Google no domingo');
    await pagina.select('#anOnde', 'google');
    await pagina.click('.anotar-form button[type="submit"]');
    await pagina.waitForSelector('.toast');
    conferir(/Anotado no diário/.test(await texto(pagina, '.toast')), 'aviso de anotado');
    const primeiro = await texto(pagina, '.diario-item');
    conferir(/anotou/.test(primeiro) && /Desliguei os anúncios do Google no domingo/.test(primeiro), 'o diário mostra a anotação no topo: ' + primeiro.slice(0, 120));
    conferir(!(await pagina.$eval('.anotar', (el) => el.open)), 'o formulário fecha depois de anotar');
  },

  /* Gestor › Diário: as 5 decisões mais novas aparecem; o resto fica a um toque. */
  async 'gestor-diario-curto'(pagina, endereco) {
    await pagina.goto(endereco + '?cenario=cheio#/gestor', { waitUntil: 'networkidle0' });
    const antes = await pagina.$$eval('.diario-item', (l) => l.length);
    conferir(antes === 5, 'mostra 5 de início (mostrou ' + antes + ')');
    const rotulo = await texto(pagina, '.diario-mais');
    conferir(/Ver as outras \d+ decisões|Ver a decisão mais antiga/.test(rotulo), 'botão diz quantas faltam: ' + rotulo);
    await pagina.click('.diario-mais');
    const depois = await pagina.$$eval('.diario-item', (l) => l.length);
    conferir(depois > 5, 'abre o resto');
    conferir(await pagina.$eval('.diario-item:nth-child(6)', (el) => document.activeElement === el), 'o foco vai para a primeira que estava escondida');
  },

  /* Gestor › Para decidir: recusar pede o segundo toque, aceita o porquê e o diário mostra a nota. */
  async 'gestor-recusar'(pagina, endereco) {
    await pagina.goto(endereco + '?cenario=cheio#/gestor', { waitUntil: 'networkidle0' });
    const recusar = await pagina.$('.proposta .proposta-botoes .botao-quieto');
    await recusar.click();
    conferir(await pagina.$eval('.proposta-recusa textarea', (el) => document.activeElement === el), 'o foco vai para o porquê');
    await pagina.keyboard.press('Escape');
    conferir(!(await pagina.$('.proposta-recusa')), 'Esc volta sem recusar');
    conferir(await pagina.evaluate(() => document.activeElement && document.activeElement.textContent.trim() === 'Recusar'), 'o foco volta para Recusar');
    const titulo = await texto(pagina, '.proposta .proposta-titulo');
    await pagina.click('.proposta .proposta-botoes .botao-quieto');
    await pagina.type('.proposta-recusa textarea', 'Freio dá mais margem que óleo');
    await pagina.click('.proposta-recusa .botao-forte');
    await pagina.waitForSelector('.toast');
    conferir(/Recusada/.test(await texto(pagina, '.toast')), 'aviso de recusada');
    const itens = await pagina.$$eval('.diario-item', (l) => l.map((li) => li.textContent.replace(/\s+/g, ' ')));
    const doDiario = itens.find((t) => t.includes(titulo));
    conferir(doDiario && doDiario.includes('Recusada') && doDiario.includes('Nota: Freio dá mais margem que óleo'), 'o diário mostra a recusa com a nota');
  },

  /* Gestor › pergunta pronta: no celular o toque não cai na barra de baixo, e o foco vai para a resposta (não some). */
  async 'gestor-pergunta-pronta'(pagina, endereco) {
    await pagina.goto(endereco + '?cenario=cheio#/gestor', { waitUntil: 'networkidle0' });
    const fichas = await pagina.$$('.gestor-prontas .ficha');
    conferir(fichas.length === 4, 'quatro perguntas prontas');
    await fichas[1].click();
    await esperar(300);
    conferir((await pagina.evaluate(() => location.hash)).startsWith('#/gestor'), 'continua no Gestor (o toque não caiu na barra de baixo)');
    conferir(await pagina.evaluate(() => document.activeElement && document.activeElement.classList.contains('fala-gestor')), 'o foco vai para a resposta');
    await pagina.waitForFunction(() => document.querySelector('.gestor-fala')?.getAttribute('aria-busy') === 'false', { timeout: 15000 });
    conferir(await pagina.evaluate(() => document.activeElement !== document.body), 'depois da resposta o foco continua num lugar que existe');
  },

  /* Campanha aberta: 6 contatos à vista, sem "Anúncio da Meta" repetido; o resto a um toque, com o foco no sétimo. */
  async 'campanha-contatos'(pagina, endereco) {
    await pagina.goto(endereco + '?cenario=cheio#/campanhas?chave=120211450001&plataforma=meta', { waitUntil: 'networkidle0' });
    const antes = await pagina.$$eval('.camp-contatos .torre-linha', (l) => l.length);
    conferir(antes === 6, 'mostra 6 de início (mostrou ' + antes + ')');
    const origens = await pagina.$$eval('.camp-contatos .jl-origem[role="cell"]', (l) => l.map((c) => c.textContent));
    conferir(origens.every((t) => !t.includes('Anúncio da Meta')), 'a marca da origem não se repete: ' + origens[0]);
    const rotulo = await texto(pagina, '.camp-contatos-mais');
    conferir(rotulo.startsWith('Ver os outros ') && rotulo.endsWith(' contatos'), 'botão diz quantos faltam: ' + rotulo);
    await pagina.click('.camp-contatos-mais');
    const depois = await pagina.$$eval('.camp-contatos .torre-linha', (l) => l.length);
    conferir(depois > 6, 'abre o resto');
    conferir(await pagina.$eval('.camp-contatos .torre-linha:nth-child(8) .torre-abre', (el) => document.activeElement === el), 'o foco vai para o sétimo contato');
    conferir(!(await pagina.$('.camp-contatos-mais')), 'o botão some depois de abrir');
  },

  /* Ajustes › Devolver as vendas: o arquivo do Google diz quantas vendas levou; a Meta mostra primeiro as do prazo. */
  async 'devolucao'(pagina, endereco) {
    await pagina.goto(endereco + '?cenario=cheio#/ajustes?secao=devolucao', { waitUntil: 'networkidle0' });
    const cliente = await pagina.target().createCDPSession();
    await cliente.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
    await pagina.click('.devolucao-bloco .botao-forte');
    await pagina.waitForFunction(() => /Arquivo pronto|Nada para subir/.test(document.querySelector('.devolucao-saida')?.textContent || ''));
    const google = await texto(pagina, '.devolucao-saida');
    conferir(google.includes('2 vendas em vendas-google-central'), 'diz quantas vendas foram no arquivo: ' + google);
    const visiveis = await pagina.$$eval('.devolucao-meta > .devolucao-lista .devolucao-item', (l) => l.map((li) => li.dataset.prazo || ''));
    conferir(visiveis.length === 1 && visiveis[0] === '1', 'à vista só a venda no prazo: ' + visiveis.join(','));
    const resumo = await texto(pagina, '.devolucao-fora > summary');
    conferir(resumo === '1 venda fora do prazo (só para conferir)', 'a fora do prazo fica a um toque: ' + resumo);
    conferir(!(await pagina.$eval('.devolucao-fora', (el) => el.open)), 'fechada de início');
  },

  /* Copiar o texto (relatórios): o aviso aparece, o foco fica no botão e a página não dá erro (antes: e.currentTarget nulo depois do await). */
  async 'copiar'(pagina, endereco) {
    await pagina.goto(endereco + '?cenario=cheio#/ajustes?secao=relatorios', { waitUntil: 'networkidle0' });
    await pagina.waitForSelector('.relatorio-botoes button');
    await pagina.click('.relatorio-botoes button');
    await pagina.waitForSelector('.toast');
    conferir(/copiado|copiar sozinho/i.test(await texto(pagina, '.toast')), 'aviso da cópia');
    conferir(await pagina.evaluate(() => document.activeElement && document.activeElement.textContent.trim() === 'Copiar o texto'), 'o foco fica no botão');
  },

  /* Relatórios: ao trocar de semana para dia, o texto antigo não pode ser copiado enquanto o novo chega. */
  async 'relatorio-trocar'(pagina, endereco) {
    await pagina.goto(endereco + '?cenario=cheio&lento=1200#/ajustes?secao=relatorios', { waitUntil: 'networkidle0' });
    await pagina.waitForFunction(() => { const b = document.querySelector('.relatorio-botoes button'); return b && !b.disabled; });
    await pagina.click('.relatorio-escolha input[value="diario"]');
    conferir(await pagina.$eval('.relatorio-botoes button', (b) => b.disabled), 'o copiar fica desligado enquanto o dia chega');
    conferir((await texto(pagina, '.relatorio-titulo')) === 'Buscando o relatório…', 'o título não diz mais "semana"');
    await pagina.waitForFunction(() => document.querySelector('.relatorio-saida')?.getAttribute('aria-busy') === 'false', { timeout: 8000 });
    conferir(!(await pagina.$eval('.relatorio-botoes button', (b) => b.disabled)), 'volta a copiar com o texto novo');
    conferir(!/semana/i.test(await texto(pagina, '.relatorio-titulo')), 'o título é o do dia');
  },

  /* Relatórios: se o texto não vem, há um "Tentar de novo" ali mesmo (antes era preciso trocar de relatório e voltar). */
  async 'relatorio-falha'(pagina, endereco) {
    await pagina.goto(endereco + '?cenario=cheio&falha=relatorio#/ajustes?secao=relatorios', { waitUntil: 'networkidle0' });
    await pagina.waitForSelector('.relatorio-saida .campo-erro');
    const botao = await pagina.$('.relatorio-saida .relatorio-botoes button');
    conferir(botao && /Tentar de novo/.test(await botao.evaluate((b) => b.textContent)), 'tem o botão Tentar de novo');
    let pedidos = 0;
    pagina.on('request', (r) => { if (r.url().includes('api/relatorios/texto')) pedidos++; });
    await botao.click();
    await pagina.waitForFunction(() => document.querySelector('.relatorio-saida')?.getAttribute('aria-busy') === 'false');
    conferir(pedidos === 1, 'o toque pede o texto de novo (' + pedidos + ')');
  },

  /* Conexões › Buscar os números agora: os cartões de cima são relidos (sem a memória do servidor) e o foco volta ao botão. */
  async 'conexoes-buscar'(pagina, endereco) {
    await pagina.goto(endereco + '?cenario=cheio#/ajustes?secao=conexoes', { waitUntil: 'networkidle0' });
    const lidas = [];
    pagina.on('request', (r) => { if (r.url().includes('api/conexoes')) lidas.push(r.url()); });
    await pagina.click('.coleta .botao');
    await pagina.waitForSelector('.toast');
    await pagina.waitForFunction(() => document.activeElement && document.activeElement.matches('.coleta .botao'), { timeout: 8000 });
    conferir(lidas.some((u) => u.includes('fresco=1')), 'releu as conexões sem memória: ' + lidas.join(', '));
    conferir(/pedida na tela/.test(await texto(pagina, '.coleta-resultado')), 'a última busca é a pedida agora');
  },

  /* Gestor sem nenhum contato: as perguntas prontas são as de quem está começando (antes nunca mudavam). */
  async 'gestor-prontas-comeco'(pagina, endereco) {
    await pagina.goto(endereco + '?cenario=comeco#/gestor', { waitUntil: 'networkidle0' });
    const comeco = await pagina.$$eval('.gestor-prontas .ficha', (l) => l.map((b) => b.textContent.trim()));
    conferir(comeco.includes('O que preciso ligar para o Tráfego funcionar?'), 'pergunta de quem começa: ' + comeco.join(' | '));
    conferir(!comeco.some((t) => /sem origem|esperando resposta/.test(t)), 'nada sobre contatos que não existem');
    await pagina.goto(endereco + '?cenario=cheio#/gestor', { waitUntil: 'networkidle0' });
    const cheio = await pagina.$$eval('.gestor-prontas .ficha', (l) => l.map((b) => b.textContent.trim()));
    conferir(!cheio.includes('O que preciso ligar para o Tráfego funcionar?'), 'com contatos, as de sempre: ' + cheio.join(' | '));
  },

  /* Hoje sem nenhum contato no mês: o ritmo diz isso numa frase, sem gráfico vazio nem legenda de nada. */
  async 'hoje-ritmo-vazio'(pagina, endereco) {
    await pagina.goto(endereco + '?cenario=comeco#/hoje', { waitUntil: 'networkidle0' });
    const bloco = await pagina.$('[aria-labelledby="tRitmo"]');
    conferir(bloco, 'tem o bloco do ritmo');
    conferir(!(await bloco.$('.colunas')) && !(await bloco.$('.legenda')), 'sem gráfico vazio e sem legenda');
    conferir(/Nenhum contato neste mês ainda/.test(await bloco.evaluate((el) => el.textContent)), 'a frase diz que não chegou contato');
    await pagina.goto(endereco + '?cenario=cheio#/hoje', { waitUntil: 'networkidle0' });
    conferir(await pagina.$('[aria-labelledby="tRitmo"] .colunas'), 'com contatos, o gráfico continua');
  },

  /* Sem acesso ao app: a navegação (que não abriria nada) some; com acesso, continua. */
  async 'sem-acesso-nav'(pagina, endereco) {
    await pagina.goto(endereco + '?acesso=nao#/hoje', { waitUntil: 'networkidle0' });
    await pagina.waitForFunction(() => /não tem acesso/i.test(document.querySelector('#miolo')?.textContent || ''));
    const visiveis = await pagina.$$eval('.navbaixo a, .casca-nav a, .casca-acoes a[data-tela]', (l) => l.filter((a) => a.getClientRects().length > 0).length);
    conferir(visiveis === 0, 'nenhum link de tela à vista (' + visiveis + ')');
    const iniciais = await texto(pagina, '#contaIniciais');
    conferir(iniciais && iniciais !== '?', 'o botão da conta mostra as iniciais de quem entrou: ' + iniciais);
    await pagina.goto(endereco + '?cenario=cheio#/hoje', { waitUntil: 'networkidle0' });
    const comAcesso = await pagina.$$eval('.navbaixo a, .casca-nav a', (l) => l.filter((a) => a.getClientRects().length > 0).length);
    conferir(comAcesso >= 4, 'com acesso, a navegação aparece (' + comAcesso + ')');
  },

  /* Campanhas › "Ver campanhas" de um alerta da Meta (?plataforma=meta): só as da Meta, com o aviso e o "Ver todas". */
  async 'campanhas-plataforma'(pagina, endereco) {
    await pagina.goto(endereco + '?cenario=cheio#/campanhas?plataforma=google', { waitUntil: 'networkidle0' });
    const so = await pagina.$$eval('.camp-linha', (l) => l.map((li) => li.dataset.chave.split('|')[0]));
    conferir(so.length > 0 && so.every((p) => p === 'google'), 'só campanhas do Google: ' + so.join(','));
    conferir(/Só as campanhas do Google/.test(await texto(pagina, '.camp-filtro')), 'o aviso diz o filtro');
    await pagina.click('.camp-filtro a');
    await pagina.waitForFunction(() => !document.querySelector('.camp-filtro') && document.querySelectorAll('.camp-linha').length > 0);
    const todas = await pagina.$$eval('.camp-linha', (l) => [...new Set(l.map((li) => li.dataset.chave.split('|')[0]))]);
    conferir(todas.includes('meta') && todas.includes('google'), 'Ver todas volta às duas: ' + todas.join(','));
  },
};

const puppeteer = await carregarPuppeteer();
fs.mkdirSync(SAIDA, { recursive: true });
const { endereco, fechar } = await subir({ porta: PORTA });
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--force-prefers-reduced-motion', '--no-first-run'] });
let falhas = 0;
try {
  for (const [nome, caso] of Object.entries(CASOS)) {
    if (filtro.length && !filtro.some((f) => nome.startsWith(f))) continue;
    for (const largura of [1440, 375]) {
      const pagina = await navegador.newPage();
      await pagina.setViewport({ width: largura, height: largura < 768 ? 812 : 900 });
      await fetch(endereco + '_mock/reiniciar').catch(() => {});
      const erros = [];
      pagina.on('pageerror', (e) => erros.push(String(e.message || e)));
      try {
        await caso(pagina, endereco, largura);
        await esperar(200);
        if (erros.length) throw new Error('erro na página: ' + erros[0]);
        console.log('ok       ' + nome + '-' + largura);
      } catch (e) {
        falhas++;
        console.log('FALHOU   ' + nome + '-' + largura + '  ' + e.message);
      } finally {
        await pagina.screenshot({ path: path.join(SAIDA, nome + '-' + largura + '.png'), fullPage: true }).catch(() => {});
        await pagina.close();
      }
    }
  }
} finally {
  await navegador.close();
  await fechar();
}
process.exitCode = falhas ? 1 : 0;
