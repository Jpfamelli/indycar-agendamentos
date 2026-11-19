/* ============================================================================
   Roteiro de navegador da tela nova do IndyCar Tráfego (rodada 8, frente T3).

     node tela/_mock/roteiro.mjs              (de apps/trafego)
     SO=sem_conta node tela/_mock/roteiro.mjs (só os casos que têm "sem_conta" no nome)

   Sobe o servidor de mentira (porta 3431; PORTA troca, só 3430 a 3439), abre o
   Chrome instalado e percorre os cenários (sem_conta, falta_valor, cheio,
   comeco, demo) nas telas Hoje e Jornada, em 1440 e 375 px, tema escuro e
   claro; depois o detalhe do contato, o mutirão de pendências (lança um valor
   pelo teclado e confere o "desfazer"), as telas de espera e os estados
   (carregando, erro, sem acesso, servidor acordando).

   Em cada parada falha se houver:
     - erro no console ou na página (fora o erro esperado do caso);
     - rolagem lateral;
     - alvo de toque menor que 44 px em 375 px (24 px em 1440 px, mouse);
     - violação séria ou crítica do axe-core (inclui contraste abaixo de 4,5:1);
     - texto proibido: travessão, "lead", "ROAS", "CPA", "CTR", "dashboard",
       "insight", "undefined", "NaN", "null".
   Capturas e o resumo (roteiro.txt) vão para apps/trafego/qa-out/ (não versionado).
   Movimento reduzido ligado: as capturas saem no estado final, sem meio de animação.
   ============================================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { subir } from './servidor.mjs';
import { carregarPuppeteer, caminhoDoAxe, CHROME } from './navegador.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.resolve(AQUI, '..', '..', 'qa-out');
const GUIA = path.resolve(AQUI, '..', '_guia');   // fotos do GUIA-VISUAL.md (só com GUIA=1)
const PORTA = Number(process.env.PORTA) || 3431;
const SO = process.env.SO || '';

const PROIBIDOS = [
  [/—/, 'travessão'], [/\blead(s)?\b/i, '"lead"'], [/\bROAS\b/, '"ROAS"'], [/\bCPA\b/, '"CPA"'], [/\bCTR\b/, '"CTR"'],
  [/\bdashboard\b/i, '"dashboard"'], [/\binsights?\b/i, '"insight"'], [/\bundefined\b/, '"undefined"'], [/\bNaN\b/, '"NaN"'], [/\bnull\b/, '"null"'],
];

/* ------------------------------ os casos ------------------------------ */

const CENARIOS = ['sem_conta', 'falta_valor', 'cheio', 'comeco', 'demo'];
const LARGURAS = [1440, 375];
const TEMAS = ['escuro', 'claro'];

function casos() {
  const lista = [];
  for (const cenario of CENARIOS) {
    for (const tela of ['hoje', 'jornada']) {
      for (const largura of LARGURAS) {
        for (const tema of TEMAS) lista.push({ nome: `${cenario}-${tela}-${largura}-${tema}`, busca: `?cenario=${cenario}`, hash: `#/${tela}`, largura, tema });
      }
    }
  }
  for (const largura of LARGURAS) {
    lista.push({ nome: `sem_conta-detalhe-${largura}-escuro`, busca: '?cenario=sem_conta', hash: '#/jornada', largura, tema: 'escuro', depois: abrirContato });
    lista.push({ nome: `cheio-detalhe-${largura}-claro`, busca: '?cenario=cheio', hash: '#/jornada', largura, tema: 'claro', depois: abrirContato });
    lista.push({ nome: `sem_conta-fila-valor-${largura}-escuro`, busca: '?cenario=sem_conta', hash: '#/jornada?pendencia=sem_valor', largura, tema: 'escuro', depois: lancarValor });
    lista.push({ nome: `sem_conta-fila-origem-${largura}-escuro`, busca: '?cenario=sem_conta', hash: '#/jornada?pendencia=sem_origem', largura, tema: 'escuro' });
    for (const tela of ['campanhas', 'gestor', 'ajustes']) lista.push({ nome: `sem_conta-${tela}-${largura}-escuro`, busca: '?cenario=sem_conta', hash: `#/${tela}`, largura, tema: 'escuro' });
  }
  lista.push({ nome: 'cheio-campanhas-1440-claro', busca: '?cenario=cheio', hash: '#/campanhas', largura: 1440, tema: 'claro' });
  lista.push({ nome: 'sem_conta-jornada-anuncio-375-claro', busca: '?cenario=sem_conta', hash: '#/jornada?paga=1', largura: 375, tema: 'claro' });
  lista.push({ nome: 'estado-carregando-375-escuro', busca: '?cenario=sem_conta&lento=5000', hash: '#/hoje', largura: 375, tema: 'escuro', semEsperar: '.esq' });
  lista.push({ nome: 'estado-carregando-jornada-1440-claro', busca: '?cenario=sem_conta&lento=5000', hash: '#/jornada', largura: 1440, tema: 'claro', semEsperar: '.esq' });
  lista.push({ nome: 'estado-erro-375-escuro', busca: '?cenario=sem_conta&falha=hoje', hash: '#/hoje', largura: 375, tema: 'escuro', espera: '.falha', erroEsperado: /status of 500/ });
  lista.push({ nome: 'estado-erro-1440-claro', busca: '?cenario=sem_conta&falha=jornada', hash: '#/jornada', largura: 1440, tema: 'claro', espera: '.falha', erroEsperado: /status of 500/ });
  lista.push({ nome: 'estado-sem-acesso-375-escuro', busca: '?acesso=nao', hash: '#/hoje', largura: 375, tema: 'escuro', espera: '.vazio', erroEsperado: /status of 403/ });
  lista.push({ nome: 'estado-acordando-375-escuro', busca: '?cenario=sem_conta&acordando=2r' + Date.now(), hash: '#/hoje', largura: 375, tema: 'escuro', erroEsperado: /status of 503/ });
  lista.push({ nome: 'estado-gravar-falha-375-escuro', busca: '?cenario=sem_conta&falha=migracao', hash: '#/jornada?pendencia=sem_origem', largura: 375, tema: 'escuro', depois: escolherOrigem, erroEsperado: /status of 503/ });
  // Fotos do GUIA-VISUAL.md (só com GUIA=1): [seletor, nome do arquivo, altura máxima].
  const FOTOS = {
    'sem_conta-hoje-1440-escuro': [['.muro', 'muro'], ['.placar', 'placar'], ['section[aria-labelledby="tFazer"]', 'acoes', 700], ['section[aria-labelledby="tCaminho"]', 'caminho']],
    'sem_conta-hoje-1440-claro': [['.muro', 'muro-claro']],
    'sem_conta-jornada-1440-escuro': [['.torre-jornada', 'torre', 560]],
    'sem_conta-jornada-375-escuro': [['.jornada-filtros', 'filtros-375']],
    'sem_conta-fila-origem-1440-escuro': [['.fila', 'fila', 760]],
  };
  for (const c of lista) if (FOTOS[c.nome]) c.fotos = FOTOS[c.nome];
  return SO ? lista.filter((c) => c.nome.includes(SO)) : lista;
}

/* ------------------------------ ações dos casos ------------------------------ */

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperarPronta(pagina, seletor) {
  await pagina.waitForFunction((sel) => {
    const miolo = document.querySelector('#miolo');
    if (!miolo || miolo.getAttribute('aria-busy') === 'true' || document.querySelector('#abrindo') || document.querySelector('.esq')) return false;
    return sel ? Boolean(document.querySelector(sel)) : miolo.childElementCount > 0;
  }, { timeout: 20000 }, seletor || null);
  await pausa(250);
}

async function abrirContato(pagina, caso, notas) {
  const id = await pagina.$eval('.torre-linha[data-id]', (l) => l.dataset.id);
  const link = await pagina.$('.torre-linha[data-id] .torre-abre');
  await link.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await link.click();
  await pagina.waitForFunction((x) => location.hash.includes('contato=' + encodeURIComponent(x)) || location.hash.includes('contato=' + x), { timeout: 5000 }, id);
  await pagina.waitForSelector('.jornada-detalhe .detalhe-nome', { timeout: 10000 });
  await esperarPronta(pagina);
  notas.push('abriu o contato ' + id);
}

async function lancarValor(pagina, caso, notas) {
  await pagina.waitForSelector('.resposta-valor input', { timeout: 10000 });
  await pagina.screenshot({ path: path.join(SAIDA, caso.nome + '-antes.png'), fullPage: true });
  const nomeAntes = await pagina.$eval('.fila-nome', (n) => n.textContent);
  await pagina.focus('.resposta-valor input');
  await pagina.keyboard.type('750');
  await pagina.keyboard.press('Enter');
  await pagina.waitForFunction(() => /Desfazer/.test((document.querySelector('#avisos') || {}).textContent || ''), { timeout: 5000 });
  const nomeDepois = await pagina.$eval('.fila-nome', (n) => n.textContent).catch(() => '(fim da fila)');
  if (nomeDepois === nomeAntes) throw new Error('a fila não andou depois de lançar o valor');
  notas.push('lançou R$ 750 para ' + nomeAntes + ' pelo teclado; aviso com "Desfazer" apareceu; próximo: ' + nomeDepois);
}

async function escolherOrigem(pagina, caso, notas) {
  await pagina.waitForSelector('.fila-pergunta button', { timeout: 10000 });
  await pagina.keyboard.press('1');
  await pagina.waitForFunction(() => /banco ainda não recebeu|Não consegui|atualização/i.test(document.body.innerText), { timeout: 8000 });
  notas.push('escolheu a origem pela tecla 1 com o banco sem migração: a tela explicou o erro');
}

/* ------------------------------ capturas ------------------------------ */

/**
 * Duas fotos por parada: a primeira tela (o que a pessoa vê sem rolar) e a página inteira.
 * A inteira é tirada com a janela do tamanho da página (e depois volta): assim a barra de cima e a do
 * polegar ficam no lugar delas, em vez de aparecerem no meio, como sai no fullPage com elemento fixo.
 */
async function capturar(pagina, caso) {
  const janela = pagina.viewport();
  await pagina.screenshot({ path: path.join(SAIDA, caso.nome + '-tela1.png') });
  const altura = await pagina.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
  if (altura > janela.height) {
    await pagina.setViewport({ ...janela, height: Math.min(altura, 15000) });
    await pausa(200);
  }
  await pagina.screenshot({ path: path.join(SAIDA, caso.nome + '.png') });
  if (process.env.GUIA && caso.fotos) {
    for (const [seletor, nome, maximo = 900] of caso.fotos) {
      const caixa = await pagina.$eval(seletor, (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height }; }).catch(() => null);
      if (!caixa) continue;
      const m = 16;
      await pagina.screenshot({ path: path.join(GUIA, nome + '.png'), clip: { x: Math.max(0, caixa.x - m), y: Math.max(0, caixa.y - m), width: Math.min(caixa.width + 2 * m, janela.width), height: Math.min(caixa.height + 2 * m, maximo) } });
    }
  }
  await pagina.setViewport(janela);
  await pausa(150);
}

/* ------------------------------ conferências ------------------------------ */

async function conferir(pagina, caso, axe) {
  const problemas = [];
  const medidas = await pagina.evaluate((largura) => {
    const raiz = document.documentElement;
    const lateral = Math.max(raiz.scrollWidth, document.body.scrollWidth) - window.innerWidth;
    const minimo = largura < 768 ? 44 : 24;
    const pequenos = [];
    for (const el of document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="radio"], [role="button"], [role="tab"]')) {
      if (el.closest('[hidden], .pular, .so-leitor')) continue;
      const cs = getComputedStyle(el);
      // Link esticado (::after cobrindo a linha inteira, como na torre): o alvo é a linha, não o texto.
      const depois = getComputedStyle(el, '::after');
      let alvo = el;
      if (depois.content !== 'none' && depois.position === 'absolute') { let p = el.parentElement; while (p && getComputedStyle(p).position === 'static') p = p.parentElement; if (p) alvo = p; }
      const r = alvo.getBoundingClientRect();
      if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (cs.display === 'inline' && el.closest('p')) continue;   // link no meio da frase: exceção da regra de alvo
      if (r.width < minimo || r.height < minimo) pequenos.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const atributos = [...document.querySelectorAll('[aria-label], [title], [placeholder], [alt]')]
      .map((el) => ['aria-label', 'title', 'placeholder', 'alt'].map((a) => el.getAttribute(a) || '').join(' ')).join(' ');
    return { lateral, pequenos, texto: document.body.innerText + ' ' + atributos + ' ' + document.title, minimo };
  }, caso.largura);
  if (medidas.lateral > 1) problemas.push(`rolagem lateral de ${medidas.lateral}px`);
  if (medidas.pequenos.length) problemas.push(`${medidas.pequenos.length} alvo(s) menor(es) que ${medidas.minimo}px: ${medidas.pequenos.slice(0, 6).join('; ')}`);
  for (const [re, nome] of PROIBIDOS) {
    const m = re.exec(medidas.texto);
    if (m) problemas.push(`texto proibido ${nome}: "…${medidas.texto.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, ' ')}…"`);
  }
  await pagina.evaluate(axe);
  const resultado = await pagina.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] }));
  for (const v of resultado.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) {
    problemas.push(`axe ${v.id} (${v.impact}) em ${v.nodes.length} lugar(es): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ') + (n.any[0] && n.any[0].data && n.any[0].data.contrastRatio ? ' contraste ' + n.any[0].data.contrastRatio : '')).join(' | ')}`);
  }
  return problemas;
}

/* ------------------------------ a corrida ------------------------------ */

async function rodar() {
  fs.mkdirSync(SAIDA, { recursive: true });
  if (process.env.GUIA) fs.mkdirSync(GUIA, { recursive: true });
  const axe = fs.readFileSync(caminhoDoAxe(), 'utf8');
  const puppeteer = await carregarPuppeteer();
  const servidor = await subir({ porta: PORTA });
  const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run', '--no-default-browser-check'] });
  const linhas = [];
  let falhas = 0;
  const lista = casos();
  try {
    for (const caso of lista) {
      const contexto = await navegador.createBrowserContext();
      const pagina = await contexto.newPage();
      const erros = [];
      const notas = [];
      pagina.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
      pagina.on('pageerror', (e) => erros.push('erro na página: ' + e.message));
      await pagina.setViewport({ width: caso.largura, height: caso.largura < 768 ? 812 : 900, deviceScaleFactor: 1 });
      await pagina.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await pagina.evaluateOnNewDocument((tema) => { try { localStorage.setItem('indycar_tema', tema); } catch { /* sem armazenamento */ } }, caso.tema);
      let problemas = [];
      try {
        await pagina.goto(servidor.endereco + caso.busca + caso.hash, { waitUntil: 'domcontentloaded' });
        if (caso.semEsperar) await pagina.waitForSelector(caso.semEsperar, { timeout: 8000 });
        else await esperarPronta(pagina, caso.espera);
        if (caso.depois) await caso.depois(pagina, caso, notas);
        await pagina.evaluate(() => window.scrollTo(0, 0));
        await pausa(150);
        await capturar(pagina, caso);
        problemas = await conferir(pagina, caso, axe);
      } catch (erro) {
        problemas.push('o caso não terminou: ' + erro.message.split('\n')[0]);
        await pagina.screenshot({ path: path.join(SAIDA, caso.nome + '-quebrou.png'), fullPage: true }).catch(() => {});
      }
      const inesperados = erros.filter((t) => !(caso.erroEsperado && caso.erroEsperado.test(t)));
      if (inesperados.length) problemas.push('console: ' + inesperados.slice(0, 4).join(' | '));
      if (problemas.length) falhas++;
      const linha = (problemas.length ? 'FALHOU ' : 'ok     ') + caso.nome + (notas.length ? '  (' + notas.join('; ') + ')' : '') + (problemas.length ? '\n        - ' + problemas.join('\n        - ') : '');
      console.log(linha);
      linhas.push(linha);
      await contexto.close();
    }
  } finally {
    await navegador.close();
    await servidor.fechar();
  }
  const resumo = `${lista.length} casos, ${lista.length - falhas} ok, ${falhas} com problema (${new Date().toISOString()})`;
  console.log('\n' + resumo);
  fs.writeFileSync(path.join(SAIDA, 'roteiro.txt'), linhas.join('\n') + '\n\n' + resumo + '\n');
  process.exitCode = falhas ? 1 : 0;
}

rodar().catch((erro) => { console.error(erro); process.exitCode = 1; });
