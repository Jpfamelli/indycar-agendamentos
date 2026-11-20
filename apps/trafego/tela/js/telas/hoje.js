/* ============================================================================
   Tela Hoje: o muro dos boxes. GET api/hoje (contrato §5.2).
   Uma frase que responde a pergunta do dono, quatro números que se leem de
   longe, o que fazer agora e, abaixo, o caminho do contato até o serviço
   fechado. A tela não faz conta de negócio: mostra o que a API manda, e o que
   vem null vira palavra ("sem dado"), com o motivo ao lado.
   ============================================================================ */

import { h, icone, trocar } from '../dom.js';
import { linhasDaFrase, tamanhoDaFrase } from '../frase.js';
import { dinheiro, inteiro, porcento, duracao, valorPorFormato, comparacao, contagem, ehNumero, haQuanto, dataCurta } from '../formato.js';
import { selo, setores, origem as marcaDaOrigem, barra, botaoDaAcao, vazio, semDado, colunasPorDia } from '../pecas.js';
import { rotuloDaEtapa } from '../setores.js';
import * as Estados from './estados.js';
import { mostrarAviso } from '../aviso.js';
import { faltaLigar, seloDoRitmo } from '../hoje-logica.js';

const ICONE_DA_DIRECAO = { sobe: 'sobe', desce: 'desce', igual: 'igual' };
const LEITURA_DO_TOM = { bom: 'bom sinal', atencao: 'pede atenção' };
const anteriores = new Map();   // id do número → último valor pintado (para o número "cravar" quando muda)

export function mostrar(ctx) {
  Estados.buscar(ctx, 'api/hoje?periodo=' + ctx.periodo, { forma: 'hoje', pintar: (dados, { primeira }) => pintar(ctx, dados, primeira) });
  return null;
}

function pintar(ctx, d, primeira) {
  const estado = d.estado || {};
  ctx.demo(Boolean(estado.demo));
  mostrarAviso(ctx, estado);
  const estreia = primeira && ctx.estreia('hoje');
  trocar(ctx.miolo,
    muro(ctx, d),
    placar(d),
    h('div', { class: 'duas' }, fazer(ctx, d), h('div', { class: 'pilha' }, ritmo(d), agenda(ctx, d))),
    caminho(ctx, d),
    origens(ctx, d),
    h('div', { class: 'duas' }, deHoje(ctx, d, estreia), conexoes(ctx, d)));
  if (estreia) {
    ctx.miolo.classList.add('entrando');
    setTimeout(() => ctx.miolo.classList.remove('entrando'), 1200);
  }
}

const bloco = (id, titulo, apoio, ...filhos) => h('section', { class: 'bloco', 'aria-labelledby': id },
  h('div', { class: 'bloco-cab' }, h('h2', { class: 'titulo-bloco', id }, titulo), apoio ? h('p', null, apoio) : null),
  filhos);

/* ------------------------------ a frase ------------------------------ */

function muro(ctx, d) {
  const f = d.frase || {};
  return h('section', { class: 'muro' },
    h('h1', { class: 'muro-frase muro-frase-' + tamanhoDaFrase(f.texto) },
      linhasDaFrase(f).map((linha, i) => [i ? ' ' : null, h('span', { class: 'muro-linha' }, linha.map((p) => (p.destaque ? h('em', { class: 'destaque' }, p.texto) : p.texto)))])),
    h('div', { class: 'muro-pe' },
      f.apoio ? h('p', { class: 'muro-apoio' }, f.apoio) : null,
      botaoDaAcao(ctx, f.acao, 'botao botao-forte botao-g')));
}

/* ------------------------------ os quatro números e as contas ------------------------------ */

function numeroDoPlacar(n) {
  const texto = valorPorFormato(n.valor, n.formato);
  const c = ehNumero(n.valor) ? comparacao(n) : null;
  const mudou = anteriores.has(n.id) && anteriores.get(n.id) !== n.valor;
  anteriores.set(n.id, n.valor);
  return h('li', { class: 'numero-bloco' },
    h('span', { class: 'rotulo' }, n.rotulo),
    texto ? h('span', { class: 'numero' + (texto.length > 9 ? ' numero-longo' : '') + (mudou ? ' cravar' : '') }, texto) : semDado(),
    c && c.direcao ? h('span', { class: 'comparacao tom-' + c.tom },
      icone(ICONE_DA_DIRECAO[c.direcao]), c.texto,
      LEITURA_DO_TOM[c.tom] ? h('span', { class: 'so-leitor' }, ' (' + LEITURA_DO_TOM[c.tom] + ')') : null,
      c.detalhe ? h('small', null, c.detalhe) : null) : null,
    n.apoio ? h('span', { class: 'apoio' }, n.apoio) : null);
}

const CONTAS = [
  ['custo_por_contato', 'Custo por contato', (v) => dinheiro(v), 'custo por contato'],
  ['custo_por_servico', 'Custo por serviço fechado', (v) => dinheiro(v), 'custo por serviço fechado'],
  ['retorno', 'Cada R$ 1 virou', (v) => dinheiro(v, { centavos: true }), 'retorno de cada R$ 1'],
  ['ticket_medio', 'Valor médio do serviço', (v) => dinheiro(v), 'valor médio do serviço'],
  ['taxa_fechamento', 'Contatos que fecham', (v) => porcento(v), 'quantos contatos fecham'],
  ['tempo_resposta_min', 'Tempo até responder', (v) => duracao(v), 'tempo até responder'],
  ['taxa_falta', 'Faltas na agenda', (v) => porcento(v), 'faltas na agenda'],
];

/** Por que algumas contas vêm "sem dado": a tela diz com todas as letras. */
/** Desde quando não há registro de resposta: estado.respostas_desde (Jornada) ou, na Hoje do T2a, conexoes.whatsapp.desde. */
const desdeQuando = (d) => dataCurta((d.estado && d.estado.respostas_desde) || (d.conexoes && d.conexoes.whatsapp && d.conexoes.whatsapp.desde) || null);

function porQueFalta(estado, derivados, desde) {
  const motivos = [];
  const semCusto = derivados.custo_por_contato == null;
  if (semCusto && (estado.gasto === 'sem_conta' || estado.gasto === 'sem_dados')) motivos.push('custo e retorno aparecem quando a conta de anúncios estiver ligada');
  else if (derivados.retorno == null && estado.gasto === 'real') motivos.push('o retorno aparece quando os serviços fechados de anúncio tiverem valor');
  if (derivados.tempo_resposta_min == null && estado.respostas === 'sem_registro') {
    motivos.push('o tempo até responder não tem registro' + (desde ? ' desde ' + desde : '') + ', porque o WhatsApp automático parou');
  }
  if (!motivos.length) return null;
  const frase = motivos.join('; ') + '.';
  return frase[0].toUpperCase() + frase.slice(1);
}

function placar(d) {
  const derivados = d.derivados || {};
  const anterior = d.periodo && d.periodo.anterior;
  const temComparacao = (d.numeros || []).some((n) => ehNumero(n.variacao));
  const falta = porQueFalta(d.estado || {}, derivados, desdeQuando(d));
  // Conta sem dado e com o porquê explicado vira uma frase só, em vez de cinco blocos "sem dado": o que fazer agora sobe na tela.
  const todas = CONTAS.map(([chave, rotulo, formatar, nome]) => ({ rotulo, nome, texto: ehNumero(derivados[chave]) ? formatar(derivados[chave]) : null }));
  const contas = falta ? todas.filter((c) => c.texto) : todas;
  const faltam = falta ? todas.filter((c) => !c.texto) : [];
  return h('section', { class: 'placar', 'aria-labelledby': 'tPlacar' },
    h('h2', { class: 'so-leitor', id: 'tPlacar' }, 'Números do período'),
    h('ul', { class: 'placar-numeros' }, (d.numeros || []).map(numeroDoPlacar)),
    temComparacao && anterior ? h('p', { class: 'apoio placar-nota' }, 'Comparado com ' + dataCurta(anterior.de) + (anterior.ate !== anterior.de ? ' a ' + dataCurta(anterior.ate) : '') + '.') : null,
    contas.length ? h('dl', { class: 'contas' }, contas.map((c) => h('div', { class: 'conta' }, h('dt', null, c.rotulo), h('dd', { class: c.texto ? 'numero' : 'sem-dado' }, c.texto || 'sem dado')))) : null,
    faltam.length ? h('p', { class: 'apoio placar-nota placar-falta' }, h('strong', null, 'Ainda sem dado: ' + faltam.map((c) => c.nome).join(', ') + '. '), falta) : null);
}

/* ------------------------------ o que fazer agora ------------------------------ */

const GRAVIDADE = { alta: ['grave', 'Urgente', 'alerta'], media: ['atencao', 'Atenção', 'alerta'] };

function fazer(ctx, d) {
  const lista = d.fazer || [];
  return bloco('tFazer', 'O que fazer agora', lista.length > 1 ? 'Do mais importante para o menos.' : null,
    lista.length
      ? h('ol', { class: 'acoes' }, lista.map((f, i) => {
        const g = GRAVIDADE[f.gravidade];
        // A gravidade vem antes do título: "Urgente" é a primeira coisa que se lê (antes ficava ao lado ou embaixo do botão).
        return h('li', { class: 'acao' + (g ? ' acao-com-selo' : '') },
          h('span', { class: 'acao-ordem', 'aria-hidden': 'true' }, String(i + 1)),
          g ? h('p', { class: 'acao-selo' }, selo(g[0], g[1], g[2])) : null,
          h('p', { class: 'acao-titulo' }, f.titulo),
          f.porque ? h('p', { class: 'acao-porque' }, f.porque) : null,
          h('div', { class: 'acao-pe' }, botaoDaAcao(ctx, f.acao)));
      }))
      : vazio({ titulo: 'Nada pedindo ação agora', texto: 'Quando aparecer algo para resolver, entra aqui em ordem de importância.' }));
}

/* ------------------------------ ritmo ------------------------------ */


function ritmo(d) {
  const r = d.ritmo || {};
  const estado = d.estado || {};
  const doMes = !d.periodo || d.periodo.rotulo === 'Este mês';
  const dias = (r.dias || []).map((x) => ({ data: x.data, total: x.contatos, marca: x.contatos_anuncio }));
  const temVerba = ehNumero(r.orcamento_mes) && r.orcamento_mes > 0 && ehNumero(r.gasto_ate_hoje);
  const situacao = seloDoRitmo(r);
  const partes = [];
  if (temVerba) {
    const fracao = (v) => Math.max(0, Math.min(1, v / r.orcamento_mes));
    partes.push(h('div', { class: 'verba' },
      h('p', { class: 'verba-frase' },
        'Gastou ', h('strong', null, dinheiro(r.gasto_ate_hoje)), ' de ', dinheiro(r.orcamento_mes), ' de verba.',
        ehNumero(r.projecao) ? [' Nesse ritmo, o mês fecha em ', h('strong', null, dinheiro(r.projecao)), '.'] : null),
      h('div', { class: 'verba-trilho' },
        barra([{ v: fracao(r.gasto_ate_hoje), marca: true }], 'barra-g'),
        ehNumero(r.esperado_ate_hoje) ? h('span', { class: 'verba-risco', 'aria-hidden': 'true', style: { '--v': fracao(r.esperado_ate_hoje).toFixed(4) } }) : null),
      h('p', { class: 'verba-pe' },
        situacao ? selo(situacao[0], situacao[1]) : null,
        ehNumero(r.esperado_ate_hoje) ? h('span', { class: 'apoio' }, 'A marca na barra é o esperado até hoje: ' + dinheiro(r.esperado_ate_hoje) + '.') : null)));
  } else if (estado.gasto === 'sem_conta' || estado.gasto === 'sem_dados') {
    partes.push(h('p', { class: 'suave' }, 'Sem conta de anúncio ligada, não há gasto para acompanhar. Por enquanto, o ritmo é o dos contatos.'));
  } else if (ehNumero(r.gasto_ate_hoje)) {
    partes.push(h('p', { class: 'suave' }, 'Gasto no período: ', h('strong', null, dinheiro(r.gasto_ate_hoje)), '.'));
  }
  if (ehNumero(r.meta_contatos)) partes.push(h('p', { class: 'suave' }, 'Meta de contatos no mês: ', h('strong', null, inteiro(r.meta_contatos)), '.'));
  if (dias.length > 1) {
    const comNumero = dias.filter((x) => ehNumero(x.total));
    const temRecorde = comNumero.length >= 5 && comNumero.some((x) => x.total > 0);
    partes.push(
      colunasPorDia(dias, { nome: 'Contatos por dia' }),
      h('p', { class: 'legenda' },
        h('span', null, h('i', { class: 'de-marca' }), 'de anúncio'),
        h('span', null, h('i'), 'outros contatos'),
        temRecorde ? h('span', null, h('i', { class: 'de-recorde' }), 'melhor dia') : null));
  }
  return bloco('tRitmo', doMes ? 'Ritmo do mês' : 'Ritmo do período', null, partes);
}

/* ------------------------------ agenda ------------------------------ */

function agenda(ctx, d) {
  const a = d.agenda || {};
  const dias = a.dias || [];
  const link = ctx.linkDoApp('/agenda/');
  return bloco('tAgenda', 'Vagas na agenda', null,
    a.leitura ? h('p', { class: 'texto-g' }, a.leitura) : null,
    dias.length
      ? h('ul', { class: 'agenda-dias' }, dias.map((x) => h('li', { class: 'agenda-dia' },
        h('span', { class: 'agenda-rotulo' }, x.rotulo),
        ehNumero(x.ocupacao) ? barra([{ v: x.ocupacao }]) : h('span', { class: 'apoio' }, 'sem lotação cadastrada'),
        h('span', { class: 'agenda-vagas' },
          ehNumero(x.vagas) ? h('strong', null, x.vagas === 0 ? 'cheio' : contagem(x.vagas, 'vaga', 'vagas')) : null,
          ehNumero(x.marcados) ? h('span', { class: ehNumero(x.vagas) ? 'so-leitor' : '' }, (ehNumero(x.vagas) ? ', ' : '') + contagem(x.marcados, 'marcado', 'marcados')) : null))))
      : h('p', { class: 'suave' }, 'Ainda não há horários cadastrados na Agenda.'),
    link ? h('a', { class: 'ligacao', href: link.href, target: link.target, rel: link.rel }, 'Abrir a Agenda', icone('abre-fora', 'icone-p')) : null);
}

/* ------------------------------ do contato ao serviço fechado ------------------------------ */

function caminho(ctx, d) {
  const funil = d.funil || {};
  const etapas = funil.etapas || [];
  const maior = Math.max(1, ...etapas.map((e) => (ehNumero(e.total) ? e.total : 0)));
  const perdidos = funil.nao_fecharam || {};
  const motivos = perdidos.motivos || [];
  const maiorMotivo = Math.max(1, ...motivos.map((m) => m.n || 0), perdidos.sem_motivo || 0);
  const estado = d.estado || {};
  const semResposta = estado.respostas === 'sem_registro';
  // Sem nenhum contato, sete linhas de zero não dizem nada: o bloco explica o que vai aparecer.
  if (!etapas.length || etapas[0].total === 0) {
    return bloco('tCaminho', 'Do contato ao serviço fechado', null, vazio({ titulo: 'Nenhum contato no período', texto: 'Aqui aparece quantos contatos responderam, receberam orçamento, agendaram, vieram e fecharam, com a parte que veio de anúncio.' }));
  }
  return bloco('tCaminho', 'Do contato ao serviço fechado', 'Quantos chegaram a cada etapa. A parte vermelha veio de anúncio.',
    h('div', { class: 'caminho' },
      h('ol', { class: 'funil' }, etapas.map((e, i) => {
        const tem = ehNumero(e.total);
        const anuncio = ehNumero(e.anuncio) ? Math.min(e.anuncio, tem ? e.total : e.anuncio) : 0;
        return h('li', { class: 'funil-linha' },
          h('span', { class: 'funil-etapa' }, e.rotulo),
          h('span', { class: 'funil-total' }, tem ? h('span', { class: 'numero' }, inteiro(e.total)) : semDado()),
          tem ? barra([{ v: anuncio / maior, marca: true }, { v: (e.total - anuncio) / maior }], 'barra-g funil-barra') : h('span', { class: 'barra barra-g funil-barra', 'aria-hidden': 'true' }),
          h('span', { class: 'funil-info' },
            tem && ehNumero(e.anuncio) ? h('span', { class: 'funil-anuncio' }, h('span', { class: 'marca-anuncio', 'aria-hidden': 'true' }), inteiro(e.anuncio) + ' de anúncio') : null,
            i === 0 ? null : h('span', { class: 'funil-passagem' }, ehNumero(e.passagem) ? porcento(e.passagem) + ' da etapa anterior' : 'passagem sem dado')));
      })),
      h('div', { class: 'perdidos' },
        h('h3', { class: 'titulo-p' }, 'Não fecharam'),
        h('p', { class: 'perdidos-total' }, ehNumero(perdidos.total) ? h('span', { class: 'numero' }, inteiro(perdidos.total)) : semDado()),
        motivos.length ? h('ul', { class: 'perdidos-motivos' }, motivos.map((m) => h('li', null,
          h('span', null, m.rotulo), h('strong', null, inteiro(m.n)), barra([{ v: m.n / maiorMotivo }])))) : null,
        perdidos.sem_motivo ? h('p', { class: 'perdidos-falta' },
          h('span', null, contagem(perdidos.sem_motivo, 'ainda sem motivo', 'ainda sem motivo')),
          h('a', { class: 'ligacao', href: ctx.hrefDaTela('jornada', { pendencia: 'sem_motivo' }) }, 'Dizer o motivo', icone('seta', 'icone-p'))) : null,
        !perdidos.total ? h('p', { class: 'suave' }, 'Ninguém marcado como "não fechou" no período.') : null)),
    semResposta ? h('p', { class: 'apoio' }, selo('atencao', 'Sem registro'), ' ' + (typeof estado.respostas_texto === 'string' && estado.respostas_texto ? estado.respostas_texto : 'A etapa "Respondidos" está sem dado: ' + (desdeQuando(d) ? 'desde ' + desdeQuando(d) + ', ' : 'desde que o WhatsApp automático parou, ') + 'o sistema não enxerga o que a oficina responde pelo celular.')) : null);
}

/* ------------------------------ de onde vieram ------------------------------ */

/** Um dado de apoio da linha: a etiqueta aparece no celular; em tela larga quem diz é o cabeçalho da coluna. */
const dado = (etiqueta, valor) => h('span', { class: 'origens-dado' }, valor == null ? null : [h('span', { class: 'origens-etiqueta' }, etiqueta + ' '), valor]);

function origens(ctx, d) {
  const lista = d.origens || [];
  const maior = Math.max(1, ...lista.map((o) => o.contatos || 0));
  const temCusto = lista.some((o) => ehNumero(o.custo_por_contato) || ehNumero(o.retorno));
  const estado = d.estado || {};
  // "Ainda não sabemos" costuma ser a maior barra: o bloco leva direto para o mutirão que resolve.
  const semOrigem = lista.find((o) => o.id === 'desconhecida' && ehNumero(o.contatos) && o.contatos > 0) || null;
  if (!lista.length) return bloco('tOrigens', 'De onde vieram os contatos', null, vazio({ titulo: 'Nenhum contato no período', texto: 'Quando chegar o primeiro, ele aparece aqui com a origem: anúncio, site, indicação ou porta.' }));
  return bloco('tOrigens', 'De onde vieram os contatos', null,
    h('ul', { class: 'origens' + (temCusto ? ' origens-com-custo' : '') },
      h('li', { class: 'origens-cabeca', 'aria-hidden': 'true' },
        h('span', null, 'Origem'), h('span', null), h('span', null, 'Contatos'), h('span', null, 'Fecharam'), h('span', null, 'Faturado'),
        temCusto ? [h('span', null, 'Custo por contato'), h('span', null, 'Cada R$ 1 virou')] : null),
      lista.map((o) => h('li', { class: 'origens-linha' },
        h('a', { class: 'origens-nome torre-abre', href: ctx.hrefDaTela('jornada', { canal: o.id }) }, marcaDaOrigem(o)),
        barra([{ v: (o.contatos || 0) / maior, marca: o.paga === true }], 'origens-barra'),
        h('span', { class: 'origens-n numero' }, inteiro(o.contatos), h('span', { class: 'so-leitor' }, ' contatos')),
        h('span', { class: 'origens-dados' },
          dado('fecharam', ehNumero(o.fecharam) ? inteiro(o.fecharam) : 'sem dado'),
          dado('faturado', ehNumero(o.faturado) ? dinheiro(o.faturado) : 'sem dado'),
          temCusto ? dado('custo por contato', ehNumero(o.custo_por_contato) ? dinheiro(o.custo_por_contato) : o.paga === true ? 'sem dado' : null) : null,
          temCusto ? dado('cada R$ 1 virou', ehNumero(o.retorno) ? dinheiro(o.retorno, { centavos: true }) : o.paga === true ? 'sem dado' : null) : null)))),
    semOrigem ? h('p', { class: 'perdidos-falta origens-falta' },
      h('span', null, contagem(semOrigem.contatos, 'contato ainda sem origem', 'contatos ainda sem origem') + ': cada um que ganha origem melhora a conta de onde vem o serviço.'),
      h('a', { class: 'ligacao', href: ctx.hrefDaTela('jornada', { pendencia: 'sem_origem' }) }, 'Dizer de onde vieram', icone('seta', 'icone-p'))) : null,
    !temCusto && estado.gasto === 'sem_conta' ? h('p', { class: 'apoio' }, 'Custo por contato e retorno de cada origem entram quando a conta de anúncios estiver ligada.') : null);
}

/* ------------------------------ contatos de hoje ------------------------------ */

function deHoje(ctx, d, estreia) {
  const lista = d.hoje || [];
  return bloco('tHoje', 'Contatos de hoje', lista.length ? contagem(lista.length, 'até agora', 'até agora') : null,
    lista.length
      ? h('ul', { class: 'hoje-lista' + (estreia ? ' acender' : '') }, lista.map((c, i) => h('li', { class: 'hoje-linha' + (ehNumero(c.espera_min) ? ' hoje-linha-espera' : '') },
        h('span', { class: 'hoje-hora numero' }, c.hora),
        h('a', { class: 'hoje-nome torre-abre', href: ctx.hrefDaTela('jornada', { contato: c.lead_id }) }, c.nome),
        h('span', { class: 'hoje-origem' }, marcaDaOrigem(c.origem)),
        Array.isArray(c.etapas) ? setores(c, { tamanho: 'p', atraso: Math.min(i, 8) * 60 }) : null,
        h('span', { class: 'hoje-etapa' },
          ehNumero(c.espera_min) ? selo('atencao', 'esperando há ' + duracao(c.espera_min)) : h('span', { class: 'apoio' }, rotuloDaEtapa(c.etapa_atual) || 'Em aberto')))))
      : h('p', { class: 'suave' }, 'Nenhum contato chegou hoje ainda.'));
}

/* ------------------------------ conexões ------------------------------ */

const CONTA_DE_ANUNCIO = { ok: ['bom', 'Ligada'], nunca_ligou: ['neutro', 'Não ligada'], erro: ['grave', 'Com erro'], token_vencendo: ['atencao', 'Acesso vencendo'] };
const WHATSAPP = { ok: ['bom', 'Funcionando'], chave_recusada: ['grave', 'Chave recusada'], sem_aparelho: ['neutro', 'Sem aparelho ligado'], sem_noticia: ['atencao', 'Sem notícia'] };

function conexoes(ctx, d) {
  const c = d.conexoes || {};
  const linha = (nome, situacao, detalhe) => h('li', { class: 'conexao' },
    h('span', { class: 'conexao-nome' }, nome),
    situacao ? selo(situacao[0], situacao[1]) : selo('neutro', 'Sem informação'),
    detalhe ? h('span', { class: 'conexao-detalhe apoio' }, detalhe) : null);
  // `parada` (API-base.md, motor/conexoes-estado.js): mais de um dia e meio sem buscar os números.
  const coleta = (x) => (x && x.parada && !x.aviso ? 'A busca dos números está parada' + (x.ultima_coleta ? ': a última foi ' + haQuanto(x.ultima_coleta) : '') + '.'
    : x && x.ultima_coleta ? 'Números buscados ' + haQuanto(x.ultima_coleta) + '.' : null);
  const juntar = (...partes) => partes.filter(Boolean).join(' ') || null;
  const itens = [];
  if (c.meta) itens.push(linha('Anúncios da Meta', CONTA_DE_ANUNCIO[c.meta.situacao], juntar(c.meta.aviso, coleta(c.meta))));
  if (c.google) itens.push(linha('Anúncios do Google', CONTA_DE_ANUNCIO[c.google.situacao], juntar(c.google.aviso, coleta(c.google))));
  if (c.site) {
    itens.push(linha('Rastreio do site', c.site.rastreio ? ['bom', 'Funcionando'] : ['neutro', 'Não instalado'],
      c.site.rastreio ? juntar(c.site.ultimo_clique ? 'Último clique ' + haQuanto(c.site.ultimo_clique) + '.' : null, ehNumero(c.site.cliques_7d) ? contagem(c.site.cliques_7d, 'clique', 'cliques') + ' em 7 dias.' : null) : null));
  }
  if (c.whatsapp) {
    const desde = c.whatsapp.situacao !== 'ok' && c.whatsapp.desde ? 'Desde ' + dataCurta(c.whatsapp.desde) + '.' : null;
    itens.push(linha('WhatsApp da oficina', WHATSAPP[c.whatsapp.situacao], juntar(desde, c.whatsapp.aviso)));
  }
  return bloco('tConexoes', 'Conexões', null,
    itens.length ? h('ul', { class: 'conexoes' }, itens) : h('p', { class: 'suave' }, 'Sem informação das conexões agora.'),
    h('a', { class: 'ligacao', href: ctx.hrefDaTela('ajustes', { secao: 'conexoes' }) }, faltaLigar(c) ? 'Ver o que falta ligar' : 'Ver as conexões', icone('seta', 'icone-p')));
}

