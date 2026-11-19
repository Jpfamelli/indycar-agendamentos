/* ============================================================================
   Roteiro de navegador da tela nova do IndyCar Tráfego (rodada 8, frente T3).

     node tela/_mock/roteiro.mjs              (de apps/trafego)
     SO=sem_conta node tela/_mock/roteiro.mjs (só os casos que têm "sem_conta" no nome)

   Sobe o servidor de mentira (porta 3431; PORTA troca, só 3430 a 3439), abre o
   Chrome instalado e percorre os cenários (sem_conta, falta_valor, cheio,
   comeco, demo) nas telas Hoje e Jornada, em 1440 e 375 px, tema escuro e
   claro; depois o detalhe do contato, o mutirão de pendências (lança um valor
   pelo teclado e confere o "desfazer") e os estados (carregando, erro, sem
   acesso, servidor acordando).
   Segunda parte (T3b): Campanhas (lista e campanha aberta), Gestor IA, as seis
   gavetas dos Ajustes, a folha do mês e o modo apresentação, nos cenários
   sem_conta, cheio, comeco e demo, 1440 e 375, escuro e claro; e as conversas
   com a tela: perguntar ao Gestor (em fluxo, parar, quebrar no meio, IA
   desligada, limite), aceitar uma sugestão, criar e revogar chave, simular e
   aplicar a origem no passado, mensagem pronta com QR, teclado (Esc fecha e
   o foco volta para quem abriu) e a folha impressa em uma página A4.

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
  }
  // T3b: todas as telas e gavetas da segunda parte, 4 cenários x 2 larguras x 2 temas.
  const TELAS_T3B = [
    ['campanhas', '#/campanhas'], ['campanha', '#/campanhas?chave=120211450001&plataforma=meta'], ['gestor', '#/gestor'],
    ['aj-conexoes', '#/ajustes?secao=conexoes'], ['aj-origem', '#/ajustes?secao=origem'], ['aj-metas', '#/ajustes?secao=metas'],
    ['aj-ia', '#/ajustes?secao=ia'], ['aj-relatorios', '#/ajustes?secao=relatorios'], ['aj-devolucao', '#/ajustes?secao=devolucao'],
    ['folha', '#/folha?mes=2026-10'], ['apresentacao', '#/apresentacao'],
  ];
  for (const cenario of ['sem_conta', 'cheio', 'comeco', 'demo']) {
    for (const [tela, hash] of TELAS_T3B) {
      for (const largura of LARGURAS) {
        for (const tema of TEMAS) {
          // Campanha aberta: no "comeco" não há campanha; vale o 404 sem_campanha (erro esperado).
          const extra = tela === 'campanha' && cenario === 'comeco' ? { erroEsperado: /status of 404/ } : {};
          lista.push({ nome: `${cenario}-${tela}-${largura}-${tema}`, busca: `?cenario=${cenario}`, hash, largura, tema, ...extra });
        }
      }
    }
  }
  lista.push({ nome: 'sem_conta-ajustes-lista-375-escuro', busca: '?cenario=sem_conta', hash: '#/ajustes', largura: 375, tema: 'escuro' });
  lista.push({ nome: 'cheio-campanha-google-375-claro', busca: '?cenario=cheio', hash: '#/campanhas?chave=20881330001&plataforma=google', largura: 375, tema: 'claro' });
  // T3b: conversas com a tela.
  lista.push({ nome: 'cheio-gestor-pergunta-1440-escuro', busca: '?cenario=cheio', hash: '#/gestor', largura: 1440, tema: 'escuro', depois: perguntarAoGestor });
  lista.push({ nome: 'sem_conta-gestor-pergunta-375-claro', busca: '?cenario=sem_conta', hash: '#/gestor', largura: 375, tema: 'claro', depois: perguntarAoGestor });
  lista.push({ nome: 'cheio-gestor-parar-375-escuro', busca: '?cenario=cheio', hash: '#/gestor', largura: 375, tema: 'escuro', depois: pararOGestor });
  lista.push({ nome: 'cheio-gestor-quebra-375-escuro', busca: '?cenario=cheio&ia=quebra', hash: '#/gestor', largura: 375, tema: 'escuro', depois: gestorQuebra });
  lista.push({ nome: 'cheio-gestor-desligado-1440-claro', busca: '?cenario=cheio&ia=desligada', hash: '#/gestor', largura: 1440, tema: 'claro', depois: gestorRecusa(/desligado/), erroEsperado: /status of 503/ });
  lista.push({ nome: 'cheio-gestor-limite-375-escuro', busca: '?cenario=cheio&ia=limite', hash: '#/gestor', largura: 375, tema: 'escuro', depois: gestorRecusa(/30 perguntas/), erroEsperado: /status of 429/ });
  lista.push({ nome: 'cheio-gestor-aceitar-1440-escuro', busca: '?cenario=cheio', hash: '#/gestor', largura: 1440, tema: 'escuro', depois: aceitarSugestao });
  lista.push({ nome: 'cheio-campanhas-teclado-1440-escuro', busca: '?cenario=cheio', hash: '#/campanhas', largura: 1440, tema: 'escuro', depois: campanhaPeloTeclado });
  lista.push({ nome: 'sem_conta-ajustes-teclado-375-escuro', busca: '?cenario=sem_conta', hash: '#/ajustes', largura: 375, tema: 'escuro', depois: gavetaPeloTeclado });
  lista.push({ nome: 'cheio-chaves-criar-revogar-1440-claro', busca: '?cenario=cheio', hash: '#/ajustes?secao=ia', largura: 1440, tema: 'claro', depois: criarERevogarChave });
  lista.push({ nome: 'cheio-origem-reaplicar-375-escuro', busca: '?cenario=cheio', hash: '#/ajustes?secao=origem&parte=reaplicar', largura: 375, tema: 'escuro', depois: reaplicarOrigem });
  lista.push({ nome: 'cheio-origem-mensagem-1440-escuro', busca: '?cenario=cheio', hash: '#/ajustes?secao=origem&parte=mensagem', largura: 1440, tema: 'escuro', depois: mensagemPronta });
  lista.push({ nome: 'sem_conta-conexoes-testar-375-claro', busca: '?cenario=sem_conta', hash: '#/ajustes?secao=conexoes', largura: 375, tema: 'claro', depois: testarConexao });
  lista.push({ nome: 'cheio-apresentacao-teclas-1440-escuro', busca: '?cenario=cheio', hash: '#/apresentacao', largura: 1440, tema: 'escuro', depois: apresentacaoPeloTeclado });
  lista.push({ nome: 'cheio-folha-impressa-1440-escuro', busca: '?cenario=cheio', hash: '#/folha?mes=2026-10', largura: 1440, tema: 'escuro', depois: folhaImpressa });
  lista.push({ nome: 'estado-erro-campanhas-375-escuro', busca: '?cenario=cheio&falha=campanhas', hash: '#/campanhas', largura: 375, tema: 'escuro', espera: '.falha', erroEsperado: /status of 500/ });
  lista.push({ nome: 'estado-sem-migracao-origem-1440-escuro', busca: '?cenario=cheio&falha=migracao', hash: '#/ajustes?secao=origem', largura: 1440, tema: 'escuro' });
  lista.push({ nome: 'estado-incompleto-hoje-375-claro', busca: '?cenario=sem_conta&incompleto=1', hash: '#/hoje', largura: 375, tema: 'claro', espera: '.faixa' });
  // 320 px: a tela mais estreita que ainda precisa caber sem rolagem lateral.
  for (const [tela, hash] of [['hoje', '#/hoje'], ['jornada', '#/jornada'], ['fila', '#/jornada?pendencia=sem_motivo'], ['ajustes', '#/ajustes'],
    ['campanhas', '#/campanhas'], ['gestor', '#/gestor'], ['origem', '#/ajustes?secao=origem'], ['apresentacao', '#/apresentacao']]) {
    lista.push({ nome: 'sem_conta-' + tela + '-320-escuro', busca: '?cenario=sem_conta', hash, largura: 320, tema: 'escuro' });
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

/* ------------------------------ ações da segunda parte (T3b) ------------------------------ */

const textoDe = (pagina, sel) => pagina.$eval(sel, (e) => e.textContent).catch(() => '');
const focoEm = (pagina) => pagina.evaluate(() => { const a = document.activeElement; return a ? (a.className || a.tagName) + ' ' + (a.textContent || '').trim().slice(0, 40) : ''; });

async function perguntarAoGestor(pagina, caso, notas) {
  await pagina.waitForSelector('.gestor-perguntar textarea');
  await pagina.focus('.gestor-perguntar textarea');
  await pagina.keyboard.type('Qual campanha eu pauso?');
  await pagina.keyboard.press('Enter');
  await pagina.waitForFunction(() => document.querySelector('.gestor-fala') && document.querySelector('.gestor-fala').getAttribute('aria-busy') === 'true', { timeout: 5000 });
  const olhando = await pagina.waitForFunction(() => { const o = document.querySelector('.gestor-olhando'); return o && !o.hidden && o.textContent.trim(); }, { timeout: 5000 }).then(() => textoDe(pagina, '.gestor-olhando'));
  await pagina.waitForFunction(() => document.querySelector('.gestor-fala').getAttribute('aria-busy') === 'false', { timeout: 15000 });
  const resposta = await textoDe(pagina, '.fala-gestor:last-of-type .fala-texto');
  if (resposta.length < 80) throw new Error('a resposta do Gestor não chegou inteira');
  notas.push('perguntou pelo teclado; viu "' + olhando.trim().slice(0, 40) + '"; resposta de ' + resposta.length + ' letras');
}

async function pararOGestor(pagina, caso, notas) {
  await pagina.waitForSelector('.gestor-perguntar textarea');
  await pagina.type('.gestor-perguntar textarea', 'Qual campanha eu pauso?');
  await pagina.keyboard.press('Enter');
  await pausa(900);
  const [botao] = await pagina.$$('xpath/.//button[normalize-space(.)="Parar"]');
  if (!botao) throw new Error('sem o botão Parar durante a resposta');
  // No celular a barra de baixo fica por cima da borda da tela: o botão vem para o meio antes do clique.
  await botao.evaluate((b) => b.scrollIntoView({ block: 'center' }));
  await botao.click();
  await pagina.waitForFunction(() => /Você parou/.test(document.querySelector('.gestor-fala').textContent), { timeout: 5000 });
  notas.push('parou no meio: a nota "Você parou" apareceu e o que chegou ficou');
}

async function gestorQuebra(pagina, caso, notas) {
  await pagina.waitForSelector('.gestor-perguntar textarea');
  await pagina.type('.gestor-perguntar textarea', 'Qual campanha eu pauso?');
  await pagina.keyboard.press('Enter');
  await pagina.waitForFunction(() => /parou no meio/.test(document.querySelector('.gestor-fala').textContent), { timeout: 10000 });
  const texto = await textoDe(pagina, '.fala-gestor .fala-texto');
  if (!texto.trim()) throw new Error('o texto que chegou antes do erro sumiu');
  notas.push('erro no meio: o texto que chegou ficou e apareceu "Perguntar de novo"');
}

function gestorRecusa(re) {
  return async function (pagina, caso, notas) {
    await pagina.waitForSelector('.gestor-perguntar textarea');
    await pagina.type('.gestor-perguntar textarea', 'Como estão os anúncios?');
    await pagina.keyboard.press('Enter');
    await pagina.waitForFunction((fonte) => new RegExp(fonte).test(document.querySelector('.gestor-fala').textContent), { timeout: 8000 }, re.source);
    notas.push('a recusa do servidor virou frase na conversa');
  };
}

async function aceitarSugestao(pagina, caso, notas) {
  await pagina.waitForSelector('.proposta');
  const [aceitar] = await pagina.$$('xpath/.//article[contains(@class,"proposta")]//button[normalize-space(.)="Aceitar"]');
  if (!aceitar) throw new Error('sem o botão Aceitar');
  await aceitar.click();
  await pagina.waitForFunction(() => /Já fiz/.test(document.querySelector('.gestor-decidir').textContent), { timeout: 5000 });
  const [jaFiz] = await pagina.$$('xpath/.//article[contains(@class,"proposta")]//button[normalize-space(.)="Já fiz"]');
  await jaFiz.click();
  await pagina.waitForFunction(() => /medição|Marcada como feita/.test((document.querySelector('#avisos') || {}).textContent || ''), { timeout: 5000 });
  notas.push('aceitou a sugestão e marcou "Já fiz"; o aviso da medição apareceu');
}

async function campanhaPeloTeclado(pagina, caso, notas) {
  await pagina.waitForSelector('.camp-abre');
  const nome = await pagina.$eval('.camp-abre', (a) => { a.focus(); return a.textContent; });
  await pagina.keyboard.press('Enter');
  await pagina.waitForFunction(() => location.hash.includes('chave='), { timeout: 5000 });
  await esperarPronta(pagina);
  await pausa(300);
  await pagina.keyboard.press('Escape');
  await pagina.waitForFunction(() => !location.hash.includes('chave='), { timeout: 5000 });
  await esperarPronta(pagina, '.camp-abre');
  await pausa(400);
  const foco = await focoEm(pagina);
  if (!foco.includes(nome.trim().slice(0, 20))) throw new Error('o foco não voltou para a campanha aberta (está em: ' + foco + ')');
  notas.push('abriu "' + nome.trim() + '" com Enter, Esc voltou e o foco ficou nela');
}

async function gavetaPeloTeclado(pagina, caso, notas) {
  await pagina.waitForSelector('.ajustes-item[data-id="metas"]');
  await pagina.focus('.ajustes-item[data-id="metas"]');
  await pagina.keyboard.press('Enter');
  await pagina.waitForFunction(() => location.hash.includes('secao=metas'), { timeout: 5000 });
  await pagina.waitForSelector('.metas-form');
  await pausa(300);
  const titulo = await focoEm(pagina);
  await pagina.keyboard.press('Escape');
  await pagina.waitForFunction(() => !location.hash.includes('secao='), { timeout: 5000 });
  await pausa(400);
  const foco = await focoEm(pagina);
  if (!/ajustes-item/.test(foco) || !/Metas/.test(foco)) throw new Error('Esc não devolveu o foco ao item "Metas e verba" (está em: ' + foco + ')');
  notas.push('Enter abriu a gaveta (foco no título: ' + titulo.trim().slice(0, 40) + '); Esc fechou e o foco voltou para o item');
}

async function criarERevogarChave(pagina, caso, notas) {
  await pagina.waitForSelector('.chave-form input[type="text"]');
  await pagina.type('.chave-form input[type="text"]', 'Codex do teste');
  await pagina.keyboard.press('Enter');
  await pagina.waitForSelector('.chave-valor', { timeout: 5000 });
  const chave = await textoDe(pagina, '.chave-valor');
  if (!/^ica_[A-Za-z0-9]{20,}/.test(chave)) throw new Error('a chave criada não apareceu');
  const [revogar] = await pagina.$$('xpath/.//li[contains(@class,"chave")]//button[normalize-space(.)="Revogar"]');
  await revogar.click();
  await pagina.waitForSelector('.chave-confirmar');
  await pagina.keyboard.press('Escape');
  await pagina.waitForFunction(() => !document.querySelector('.chave-confirmar'), { timeout: 3000 });
  const [revogar2] = await pagina.$$('xpath/.//li[contains(@class,"chave")]//button[normalize-space(.)="Revogar"]');
  await revogar2.click();
  const [sim] = await pagina.$$('xpath/.//button[normalize-space(.)="Revogar a chave"]');
  await sim.click();
  await pagina.waitForFunction(() => /Revogada/.test(document.querySelector('.chaves-lista-caixa').textContent), { timeout: 5000 });
  const [guardei] = await pagina.$$('xpath/.//button[normalize-space(.)="Já guardei"]');
  if (guardei) await guardei.click();
  await pausa(200);
  const aindaNaTela = await pagina.evaluate((k) => document.body.innerText.includes(k), chave);
  if (aindaNaTela) throw new Error('a chave continua na tela depois de "Já guardei"');
  notas.push('criou a chave (mostrada uma vez), Esc cancelou a revogação, revogou com confirmação e a chave sumiu da tela');
}

async function reaplicarOrigem(pagina, caso, notas) {
  await pagina.waitForSelector('.reaplicar-form');
  await pagina.$eval('.reaplicar-form', (f) => f.requestSubmit());
  await pagina.waitForSelector('.reaplicar-saida .reaplicar-tabela', { timeout: 5000 });   // o rastreio também usa a tabela
  const total = await textoDe(pagina, '.reaplicar-total');
  const [aplicar] = await pagina.$$('xpath/.//button[starts-with(normalize-space(.),"Aplicar nos")]');
  await aplicar.click();
  await pagina.waitForFunction(() => /ganhar/.test(document.querySelector('.reaplicar-saida').textContent), { timeout: 5000 });
  notas.push('simulou (' + total.trim().slice(0, 60) + ') e só então aplicou');
}

async function mensagemPronta(pagina, caso, notas) {
  await pagina.waitForSelector('.mensagem-form input');
  await pagina.type('.mensagem-form input', 'Anúncio troca de óleo novembro');
  await pagina.$eval('.mensagem-form', (f) => f.requestSubmit());
  await pagina.waitForSelector('.mensagem-qr', { timeout: 5000 });
  const ok = await pagina.$eval('.mensagem-qr', (i) => i.complete && i.naturalWidth > 0);
  if (!ok) throw new Error('o QR não carregou');
  notas.push('mensagem pronta com código, link e QR');
}

async function testarConexao(pagina, caso, notas) {
  await pagina.waitForSelector('.conexao-form input[type="password"]');
  await pagina.type('.conexao-form input[type="text"]', 'act_1234567890');
  await pagina.type('.conexao-form input[type="password"]', 'EAAB-teste-token');
  const [testar] = await pagina.$$('xpath/.//button[normalize-space(.)="Testar"]');
  await testar.click();
  await pagina.waitForSelector('.conexao-teste', { timeout: 6000 });
  const resultado = await textoDe(pagina, '.conexao-teste');
  notas.push('testou a Meta antes de salvar: "' + resultado.trim().slice(0, 50) + '"');
}

async function apresentacaoPeloTeclado(pagina, caso, notas) {
  await pagina.waitForSelector('.apres-tela');
  await pagina.keyboard.press('ArrowRight');
  await pagina.keyboard.press('ArrowRight');
  const c1 = await textoDe(pagina, '.apres-contador');
  await pagina.keyboard.press('End');
  const c2 = await textoDe(pagina, '.apres-contador');
  if (c1 !== '3 de 6' || c2 !== '6 de 6') throw new Error('as teclas não andaram certo (' + c1 + ', ' + c2 + ')');
  await pagina.keyboard.press('Home');
  await pagina.keyboard.press('Escape');
  await pagina.waitForFunction(() => location.hash.includes('ajustes'), { timeout: 5000 });
  const casca = await pagina.evaluate(() => getComputedStyle(document.querySelector('.casca')).display);
  if (casca === 'none') throw new Error('a casca não voltou depois de sair da apresentação');
  await pagina.goBack();
  await esperarPronta(pagina, '.apres-tela');
  notas.push('setas e End andaram (3 de 6, 6 de 6); Esc saiu para os Ajustes e a casca voltou');
}

async function folhaImpressa(pagina, caso, notas) {
  await pagina.waitForSelector('.papel');
  const pdf = await pagina.pdf({ preferCSSPageSize: true, printBackground: true });
  const paginas = (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  if (paginas !== 1) throw new Error('a folha impressa deu ' + paginas + ' páginas');
  await pagina.emulateMediaType('print');
  const cores = await pagina.evaluate(() => { const s = getComputedStyle(document.querySelector('.papel')); return s.backgroundColor + ' ' + s.color + ' ' + getComputedStyle(document.querySelector('.casca')).display; });
  await pagina.emulateMediaType(null);
  if (cores !== 'rgb(255, 255, 255) rgb(0, 0, 0) none') throw new Error('impressão fora do preto no branco: ' + cores);
  notas.push('impressa: 1 página A4, preto no branco, sem a casca');
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
      // Rádio ou caixa de marcar dentro do rótulo (.opcao): tocar em qualquer parte do rótulo marca, então o alvo é o rótulo.
      if (el.matches('input[type="radio"], input[type="checkbox"]') && el.closest('label')) alvo = el.closest('label');
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
    // O Chrome às vezes não fecha sozinho depois de centenas de contextos (Windows): dá 15 s e encerra o processo dele.
    await Promise.race([navegador.close().catch(() => {}), pausa(15000)]);
    const proc = navegador.process();
    if (proc && proc.exitCode === null) { try { proc.kill('SIGKILL'); } catch { /* já saiu */ } }
    await Promise.race([servidor.fechar(), pausa(5000)]);
  }
  const resumo = `${lista.length} casos, ${lista.length - falhas} ok, ${falhas} com problema (${new Date().toISOString()})`;
  console.log('\n' + resumo);
  fs.writeFileSync(path.join(SAIDA, 'roteiro.txt'), linhas.join('\n') + '\n\n' + resumo + '\n');
  process.exitCode = falhas ? 1 : 0;
  setTimeout(() => process.exit(), 2000).unref();   // se algo ainda segurar o processo, sai mesmo assim
}

rodar().catch((erro) => { console.error(erro); process.exitCode = 1; });
