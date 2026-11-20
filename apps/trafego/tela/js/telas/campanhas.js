/* ============================================================================
   Tela Campanhas: a classificação. GET api/campanhas e
   api/campanhas/:plataforma/:chave (API-base.md da T2a).
   Uma linha por campanha, em ordem, com a distância para a primeira escrita
   por extenso; na mesma linha, lado a lado, o que a plataforma diz e o que a
   oficina viu. Abrir a campanha troca a lista pelo detalhe (conjuntos e
   anúncios, palavras-chave, os contatos daquela campanha). Sem conta de anúncio
   ligada a tela segue útil: a classificação vem dos contatos e o gasto diz
   "sem gasto ligado", nunca zero.
   O endereço guarda a ordem e a campanha aberta: #/campanhas?ordem=contatos,
   #/campanhas?plataforma=meta&chave=1202.
   ============================================================================ */

import { h, icone, trocar, focar } from '../dom.js';
import { dinheiro, inteiro, contagem, plural, ehNumero } from '../formato.js';
import { selo, barra, vazio, semDado, escolhas, escolhaEmLista } from '../pecas.js';
import { classificar, criteriosComDado, criterioEfetivo, plataformaContraOficina } from '../campanhas-logica.js';
import { mapaDeHorarios } from '../mapa.js';
import { torreDeContatos } from '../contatos.js';
import { mostrarAviso } from '../aviso.js';
import * as Estados from './estados.js';

const NOME_DA_PLATAFORMA = { meta: 'Meta', google: 'Google', anuncio: 'Anúncio sem plataforma' };
const QUEM_DIZ = { meta: 'A Meta diz', google: 'O Google diz', anuncio: 'A plataforma diz' };
const LEITURA = { bom: ['bom', 'Bom'], atencao: ['atencao', 'Atenção'], ruim: ['grave', 'Ruim'] };
const SITUACAO = { ativa: 'ativa', pausada: 'pausada', encerrada: 'encerrada', em_analise: 'em análise', removida: 'removida' };

/** Para onde voltar o foco quando a pessoa fecha o detalhe (a linha que abriu). */
let ultimaAberta = null;

export function mostrar(ctx) {
  const p = ctx.rota.params;
  if (p.plataforma && p.chave) return detalhe(ctx, p.plataforma, p.chave);
  return lista(ctx);
}

/* ------------------------------ peças ------------------------------ */

const bloco = (id, titulo, apoio, ...filhos) => h('section', { class: 'bloco', 'aria-labelledby': id },
  h('div', { class: 'bloco-cab' }, h('h2', { class: 'titulo-bloco', id }, titulo), apoio ? h('p', null, apoio) : null),
  filhos);

/** O "não sei" de gasto: sem conta ligada é "sem gasto ligado"; com conta e sem número, "sem dado". */
const semGasto = (estado, c) => semDado((estado && estado.gasto === 'sem_conta') || (c && c.so_dos_contatos) ? 'sem gasto ligado' : 'sem dado');
const marcaDaPlataforma = (plataforma) => h('span', { class: 'camp-plat' }, h('span', { class: 'marca-anuncio', 'aria-hidden': 'true' }), NOME_DA_PLATAFORMA[plataforma] || 'Anúncio');

function seloDaLeitura(leitura) {
  const l = leitura && LEITURA[leitura.tom];
  return l ? selo(l[0], l[1]) : null;
}

/** Um par rótulo e número. `valor` já formatado (texto ou nó); null vira o "não sei" que vier em `falta`. */
const dado = (rotulo, valor, falta) => h('div', { class: 'camp-dado' }, h('dt', null, rotulo), h('dd', null, valor == null ? falta : valor));

/** O lado da plataforma e o lado da oficina, sem misturar. */
function lados(c, estado, { grande = false } = {}) {
  const dinheiroOu = (v) => (ehNumero(v) ? dinheiro(v) : null);
  const inteiroOu = (v) => (ehNumero(v) ? inteiro(v) : null);
  const google = c.plataforma === 'google';
  const faturado = ehNumero(c.faturado)
    ? [dinheiro(c.faturado), c.sem_valor > 0 ? h('span', { class: 'camp-falta' }, ' falta o valor de ' + inteiro(c.sem_valor)) : null]
    : null;
  const frase = plataformaContraOficina(c);
  // Sem nenhum número da plataforma (conta não ligada), três "sem gasto ligado" seguidos não dizem nada: uma frase só.
  const plataformaMuda = [c.gasto, c.cliques, c.contatos_plataforma].every((v) => !ehNumero(v));
  return h('div', { class: 'camp-lados' + (grande ? ' camp-lados-g' : '') },
    h('div', { class: 'camp-lado camp-lado-plataforma' },
      h('p', { class: 'camp-lado-titulo' }, QUEM_DIZ[c.plataforma] || 'A plataforma diz'),
      plataformaMuda ? h('p', { class: 'camp-lado-vazio' }, semGasto(estado, c), h('span', null, 'Gasto, cliques e ' + (google ? 'conversões' : 'conversas') + ' aparecem com a conta ligada.')) : h('dl', null,
        dado('Gasto', dinheiroOu(c.gasto), semGasto(estado, c)),
        dado('Cliques', inteiroOu(c.cliques), semGasto(estado, c)),
        dado(google ? 'Conversões' : 'Conversas', ehNumero(c.contatos_plataforma) ? String(Math.round(c.contatos_plataforma * 10) / 10).replace('.', ',') : null, semGasto(estado, c)))),
    h('div', { class: 'camp-lado camp-lado-oficina' },
      h('p', { class: 'camp-lado-titulo' }, 'A oficina viu'),
      h('dl', null,
        dado('Contatos', inteiroOu(c.contatos), semDado()),
        dado('Agendaram', inteiroOu(c.agendaram), semDado()),
        dado('Vieram', inteiroOu(c.vieram), semDado()),
        dado('Fecharam', inteiroOu(c.fecharam), semDado()),
        dado('Faturado', faturado, semDado()))),
    frase ? h('p', { class: 'camp-diferenca' },
      barra([{ v: frase.fracao }], 'camp-diferenca-barra'),
      h('span', null, frase.texto)) : null);
}

/** O número do critério de ordem, com a etiqueta do que ele é. */
function numeroDoCriterio(c, criterio) {
  const v = c[criterio.campo];
  if (!ehNumero(v)) return { valor: null, rotulo: criterio.falta };
  switch (criterio.id) {
    case 'retorno': return { valor: dinheiro(v, { centavos: true }), rotulo: 'cada R$ 1 virou' };
    case 'custo_servico': return { valor: dinheiro(v), rotulo: 'por serviço fechado' };
    case 'custo_contato': return { valor: dinheiro(v), rotulo: 'por contato' };
    case 'contatos': return { valor: inteiro(v), rotulo: plural(v, 'contato', 'contatos') };
    default: return { valor: dinheiro(v), rotulo: 'de gasto' };
  }
}

/* ------------------------------ a classificação ------------------------------ */

/** Só uma plataforma? (o "Ver campanhas" de um alerta do radar chega com ?plataforma=meta; antes era ignorado.) */
const plataformaDoFiltro = (ctx) => (ctx.rota.params.plataforma === 'meta' || ctx.rota.params.plataforma === 'google' ? ctx.rota.params.plataforma : null);
/** Os parâmetros da lista que valem ao trocar a ordem ou tirar o filtro. */
const paramsDaLista = (ctx, extra = {}) => ({ ...(ctx.periodo !== 'mes' ? { periodo: ctx.periodo } : {}), ...extra });

function lista(ctx) {
  const plataforma = plataformaDoFiltro(ctx);
  Estados.buscar(ctx, 'api/campanhas?periodo=' + ctx.periodo + (plataforma ? '&plataforma=' + plataforma : ''), { forma: 'jornada', pintar: (d, { primeira }) => pintarLista(ctx, d, primeira) });
  return null;
}

function avisoDoFiltro(ctx) {
  const plataforma = plataformaDoFiltro(ctx);
  if (!plataforma) return null;
  const ordem = ctx.rota.params.ordem ? { ordem: ctx.rota.params.ordem } : {};
  return h('p', { class: 'camp-filtro' }, 'Só as campanhas ' + (plataforma === 'meta' ? 'da Meta' : 'do Google') + '. ',
    h('a', { class: 'ligacao', href: ctx.hrefDaTela('campanhas', paramsDaLista(ctx, ordem)) }, 'Ver todas'));
}

function resumoDoTopo(d) {
  const t = d.totais || {};
  const estado = d.estado || {};
  const n = (d.campanhas || []).length;
  const partes = [contagem(n, estado.gasto === 'sem_conta' ? 'campanha conhecida pelos contatos' : 'campanha', estado.gasto === 'sem_conta' ? 'campanhas conhecidas pelos contatos' : 'campanhas')];
  if (ehNumero(t.gasto)) partes.push(dinheiro(t.gasto) + ' de gasto');
  if (ehNumero(t.contatos)) partes.push(contagem(t.contatos, 'contato de anúncio', 'contatos de anúncio'));
  if (ehNumero(t.fecharam)) partes.push(contagem(t.fecharam, 'serviço fechado', 'serviços fechados'));
  return partes.join(' · ');
}

function avisoSemConta(ctx, d) {
  const estado = d.estado || {};
  if (estado.gasto !== 'sem_conta' && estado.gasto !== 'sem_dados') return null;
  return h('div', { class: 'camp-semconta' },
    icone('info', 'icone-g'),
    h('div', null,
      h('p', { class: 'camp-semconta-titulo' }, 'Nenhuma conta de anúncio ligada'),
      h('p', null, 'Esta classificação vem dos contatos: cada um disse de qual campanha veio. Gasto, cliques e retorno entram quando a conta da Meta ou do Google for ligada.')),
    h('a', { class: 'botao', href: ctx.hrefDaTela('ajustes', { secao: 'conexoes' }) }, 'Ligar a conta', icone('seta', 'icone-seta')));
}

function controlesDeOrdem(ctx, campanhas, criterio) {
  const validos = criteriosComDado(campanhas);
  if (validos.length <= 1) {
    return h('p', { class: 'apoio camp-ordem-so' }, 'Em ordem de ' + criterio.rotulo.toLowerCase() + '. Sem gasto ligado não dá para ordenar por custo nem por retorno.');
  }
  const plataforma = plataformaDoFiltro(ctx);
  const aoEscolher = (id) => ctx.ir('campanhas', paramsDaLista(ctx, { ...(plataforma ? { plataforma } : {}), ...(id !== 'retorno' ? { ordem: id } : {}) }));
  const opcoes = validos.map((c) => ({ id: c.id, rotulo: c.rotulo }));
  return h('div', { class: 'camp-ordem' },
    h('span', { class: 'apoio camp-ordem-rotulo', 'aria-hidden': 'true' }, 'Ordenar por'),
    escolhas({ rotulo: 'Ordenar a classificação por', opcoes, atual: criterio.id, aoEscolher, classe: 'camp-ordem-largo' }),
    escolhaEmLista({ rotulo: 'Ordenar por', opcoes, atual: criterio.id, aoEscolher, classe: 'camp-ordem-estreito' }));
}

function linhaDaClassificacao(ctx, estado, { campanha: c, posicao, distancia: dist }, criterio) {
  const num = numeroDoCriterio(c, criterio);
  const situacao = SITUACAO[c.situacao];
  // Lista filtrada por plataforma: o detalhe guarda o filtro em "so" para voltar para a mesma lista.
  const filtro = plataformaDoFiltro(ctx);
  const href = ctx.hrefDaTela('campanhas', { plataforma: c.plataforma, chave: c.chave, ...(filtro ? { so: filtro } : {}) });
  return h('li', { class: 'camp-linha', data: { chave: c.plataforma + '|' + c.chave, lider: dist.tipo === 'lider' ? '1' : null } },
    h('span', { class: 'camp-pos', 'aria-hidden': posicao ? null : 'true' }, posicao ? [h('span', { class: 'so-leitor' }, 'Posição '), String(posicao)] : ''),
    h('div', { class: 'camp-nome' },
      h('a', { class: 'camp-abre torre-abre', href }, c.nome || 'Campanha sem nome'),
      h('p', { class: 'camp-sobre' }, marcaDaPlataforma(c.plataforma), situacao ? h('span', { class: 'apoio' }, situacao) : null),
      c.leitura && c.leitura.texto ? h('p', { class: 'camp-leitura' }, seloDaLeitura(c.leitura), h('span', null, c.leitura.texto)) : null),
    lados(c, estado),
    h('div', { class: 'camp-criterio' },
      num.valor != null ? h('span', { class: 'camp-criterio-valor numero' }, num.valor) : null,
      h('span', { class: num.valor != null ? 'camp-criterio-rotulo' : 'sem-dado' }, num.rotulo),
      h('span', { class: 'camp-distancia camp-distancia-' + dist.tipo }, dist.tipo === 'sem_dado' ? '' : dist.texto)));
}

function semCampanha(ctx, d) {
  const s = d.sem_campanha || {};
  if (!ehNumero(s.contatos) || s.contatos === 0) return null;
  return bloco('tSemCampanha', 'Contatos de anúncio sem campanha', null,
    h('div', { class: 'camp-sem' },
      h('p', { class: 'camp-sem-n' }, h('span', { class: 'numero' }, inteiro(s.contatos)),
        h('span', null, plural(s.contatos, 'contato veio de anúncio', 'contatos vieram de anúncio') + ' sem dizer de qual' + (ehNumero(s.fecharam) && s.fecharam ? ', ' + contagem(s.fecharam, 'fechou', 'fecharam') : ''))),
      h('div', { class: 'camp-sem-texto' },
        s.texto ? h('p', null, s.texto) : null,
        h('p', null, 'Para resolver: crie uma mensagem pronta para cada anúncio. Ela leva um código curto e a campanha passa a ser reconhecida sozinha.'),
        h('div', { class: 'acoes' },
          h('a', { class: 'botao botao-forte', href: ctx.hrefDaTela('ajustes', { secao: 'origem', parte: 'mensagem' }) }, 'Criar mensagem pronta', icone('seta', 'icone-seta')),
          h('a', { class: 'botao', href: ctx.hrefDaTela('jornada', { paga: '1' }) }, 'Ver os contatos de anúncio')))));
}

function horarios(d) {
  const hs = d.horarios;
  const total = hs && ehNumero(hs.total) ? hs.total : 0;
  const mapa = total ? mapaDeHorarios(hs, { nome: hs.base === 'anuncio' ? 'Contatos de anúncio por dia e hora' : 'Contatos por dia e hora' }) : null;
  return bloco('tHorarios', 'Quando chegam os contatos', hs && hs.base === 'anuncio' ? 'Contatos de anúncio no período, por dia da semana e hora.' : 'Todos os contatos do período, por dia da semana e hora.',
    hs && hs.leitura ? h('p', { class: 'camp-mapa-frase' }, hs.leitura) : null,
    mapa || h('p', { class: 'suave' }, 'O mapa aparece quando chegarem contatos com horário.'));
}

function metaContraGoogle(d) {
  const c = d.comparacao;
  if (!c || !Array.isArray(c.linhas) || c.linhas.length < 2) return null;
  return bloco('tComparacao', 'Meta e Google', null,
    c.destaque ? h('p', { class: 'texto-g' }, c.destaque) : null,
    h('ul', { class: 'camp-comparacao' }, c.linhas.map((l) => h('li', null,
      marcaDaPlataforma(l.plataforma),
      h('span', { class: 'camp-comparacao-n' }, ehNumero(l.custo_por_contato) ? [h('strong', { class: 'numero' }, dinheiro(l.custo_por_contato)), ' por contato'] : semDado('sem custo por contato')),
      h('span', { class: 'camp-comparacao-n' }, ehNumero(l.custo_por_servico) ? [h('strong', { class: 'numero' }, dinheiro(l.custo_por_servico)), ' por serviço fechado'] : semDado('nenhum serviço fechado'))))));
}

function porQueDifere(d) {
  const itens = Array.isArray(d.por_que_difere) ? d.por_que_difere.filter((t) => typeof t === 'string' && t) : [];
  if (!itens.length) return null;
  return h('details', { class: 'camp-porque' },
    h('summary', { class: 'ligacao' }, 'Por que a plataforma e a oficina contam diferente'),
    h('ul', null, itens.map((t) => h('li', null, t))));
}

function pintarLista(ctx, d, primeira) {
  const estado = d.estado || {};
  ctx.demo(Boolean(estado.demo));
  mostrarAviso(ctx, estado);
  const campanhas = Array.isArray(d.campanhas) ? d.campanhas : [];
  const criterio = criterioEfetivo(ctx.rota.params.ordem || 'retorno', campanhas);
  const comparacao = metaContraGoogle(d);
  const corrida = classificar(campanhas, criterio.id);
  const classificacao = campanhas.length
    ? h('ol', { class: 'camp-lista', 'aria-label': 'Classificação das campanhas por ' + criterio.rotulo.toLowerCase() },
      corrida.map((x) => linhaDaClassificacao(ctx, estado, x, criterio)))
    : vazio({
      titulo: estado.gasto === 'sem_dados' ? 'Nenhuma campanha ainda' : 'Nenhuma campanha neste período',
      texto: estado.gasto === 'sem_conta' || estado.gasto === 'sem_dados'
        ? 'Quando um contato disser de qual anúncio veio (pela mensagem pronta ou pelo site), a campanha aparece aqui. Com a conta de anúncio ligada, entram também as que não trouxeram contato.'
        : 'Troque o período lá em cima para ver outras semanas.',
    });
  trocar(ctx.miolo,
    h('header', { class: 'camp-topo' },
      h('h1', { class: 'titulo-tela' }, 'Campanhas'),
      h('p', { class: 'camp-resumo' }, resumoDoTopo(d)),
      avisoDoFiltro(ctx)),
    avisoSemConta(ctx, d),
    h('section', { class: 'bloco camp-classificacao', 'aria-labelledby': 'tClassificacao' },
      h('div', { class: 'bloco-cab camp-cab' },
        h('h2', { class: 'titulo-bloco', id: 'tClassificacao' }, 'Classificação'),
        campanhas.length ? controlesDeOrdem(ctx, campanhas, criterio) : null),
      classificacao,
      campanhas.length ? porQueDifere(d) : null),
    semCampanha(ctx, d),
    comparacao ? h('div', { class: 'duas camp-duas' }, horarios(d), comparacao) : horarios(d));
  if (ultimaAberta) {
    const link = ctx.miolo.querySelector('.camp-linha[data-chave="' + CSS.escape(ultimaAberta) + '"] .camp-abre');
    ultimaAberta = null;
    if (link) link.focus();
  }
}

/* ------------------------------ uma campanha aberta ------------------------------ */

function detalhe(ctx, plataforma, chave) {
  const so = ctx.rota.params.so === 'meta' || ctx.rota.params.so === 'google' ? ctx.rota.params.so : null;
  const destino = () => paramsDaLista(ctx, { ...(so ? { plataforma: so } : {}), ...(ctx.rota.params.ordem ? { ordem: ctx.rota.params.ordem } : {}) });
  const voltar = () => ctx.ir('campanhas', destino());
  voltar.href = () => ctx.hrefDaTela('campanhas', destino());
  ultimaAberta = plataforma + '|' + chave;
  const aoTeclar = (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (e.target && e.target.matches && e.target.matches('input, select, textarea')) return;
    if (e.target && e.target.closest && e.target.closest('details[open]') && e.target.matches('summary')) return;
    voltar();
  };
  document.addEventListener('keydown', aoTeclar);
  Estados.buscar(ctx, 'api/campanhas/' + encodeURIComponent(plataforma) + '/' + encodeURIComponent(chave) + '?periodo=' + ctx.periodo, {
    forma: 'jornada',
    pintar: (d) => pintarDetalhe(ctx, d, voltar),
  });
  return { sair: () => document.removeEventListener('keydown', aoTeclar) };
}

function miniatura(plataforma, anuncio) {
  const reserva = () => h('span', { class: 'camp-mini camp-mini-reserva', role: 'img', 'aria-label': 'Anúncio sem imagem' },
    h('span', { class: 'marca-anuncio', 'aria-hidden': 'true' }), h('span', { 'aria-hidden': 'true' }, 'sem imagem'));
  const url = anuncio && anuncio.miniatura_url;
  if (!url || !anuncio.ext) return reserva();
  // A tela só mostra imagem servida pelo próprio app (API-coleta.md): o endereço da plataforma vence e é de fora.
  const src = /^api[/]coleta[/]miniatura[/]/.test(url) ? url : 'api/coleta/miniatura/' + encodeURIComponent(plataforma) + '/' + encodeURIComponent(anuncio.ext);
  const img = h('img', { class: 'camp-mini', src, alt: 'Imagem do anúncio ' + (anuncio.nome || ''), width: '72', height: '72', loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', () => img.replaceWith(reserva()), { once: true });
  return img;
}

const numeroCurto = (rotulo, v, formato, falta) => h('div', { class: 'camp-dado' }, h('dt', null, rotulo),
  h('dd', null, ehNumero(v) ? (formato === 'dinheiro' ? dinheiro(v) : inteiro(v)) : falta));

function conjuntosEAnuncios(ctx, d) {
  const c = d.campanha || {};
  const estado = d.estado || {};
  const conjuntos = Array.isArray(d.conjuntos) ? d.conjuntos : [];
  if (c.plataforma === 'google') return null;
  if (!conjuntos.length) {
    return bloco('tConjuntos', 'Conjuntos e anúncios', null,
      h('p', { class: 'suave' }, estado.gasto === 'sem_conta' || c.so_dos_contatos
        ? 'Conjuntos e anúncios aparecem quando a conta da Meta estiver ligada. Por enquanto, a campanha é conhecida só pelos contatos.'
        : 'A plataforma não mandou conjuntos para esta campanha no período.'));
  }
  const falta = semGasto(estado, c);
  return bloco('tConjuntos', 'Conjuntos e anúncios', 'Os números da oficina por anúncio aparecem quando o contato diz de qual anúncio veio.',
    conjuntos.map((cj) => h('div', { class: 'camp-conjunto' },
      h('h3', { class: 'titulo-p' }, cj.nome || 'Conjunto sem nome'),
      h('dl', { class: 'camp-conjunto-dados' },
        numeroCurto('Gasto', cj.gasto, 'dinheiro', falta),
        numeroCurto('Conversas na plataforma', cj.contatos_plataforma, 'inteiro', falta),
        numeroCurto('Contatos na oficina', cj.contatos, 'inteiro', semDado()),
        numeroCurto('Fecharam', cj.fecharam, 'inteiro', semDado())),
      Array.isArray(cj.anuncios) && cj.anuncios.length
        ? h('ul', { class: 'camp-anuncios' }, cj.anuncios.map((a) => h('li', { class: 'camp-anuncio' },
          miniatura(c.plataforma, a),
          h('div', { class: 'camp-anuncio-corpo' },
            h('p', { class: 'camp-anuncio-nome' }, a.nome || 'Anúncio sem nome'),
            h('dl', { class: 'camp-anuncio-dados' },
              numeroCurto('Gasto', a.gasto, 'dinheiro', falta),
              numeroCurto('Conversas', a.contatos_plataforma, 'inteiro', falta),
              numeroCurto('Contatos', a.contatos, 'inteiro', semDado()),
              numeroCurto('Fecharam', a.fecharam, 'inteiro', semDado()))))))
        : null)));
}

function palavrasETermos(d) {
  const c = d.campanha || {};
  if (c.plataforma !== 'google') return null;
  const estado = d.estado || {};
  const palavras = Array.isArray(d.palavras) ? d.palavras : [];
  const termos = Array.isArray(d.termos) ? d.termos : [];
  if (estado.termos === 'sem_tabela' || (!palavras.length && !termos.length)) {
    return bloco('tPalavras', 'Palavras-chave e termos de busca', null,
      h('p', { class: 'suave' }, estado.gasto === 'sem_conta' || c.so_dos_contatos
        ? 'As palavras-chave e o que as pessoas buscaram aparecem quando a conta do Google estiver ligada.'
        : estado.termos === 'sem_tabela'
          ? 'Os termos de busca ainda não chegam: falta aplicar a atualização do banco. Avise quem cuida do sistema.'
          : 'O Google não mandou palavras-chave desta campanha no período.'));
  }
  const CORRESPONDENCIA = { exata: 'exata', frase: 'de frase', ampla: 'ampla' };
  return bloco('tPalavras', 'Palavras-chave e termos de busca', 'A palavra-chave é o que a oficina comprou; o termo é o que a pessoa digitou de verdade.',
    palavras.length ? h('div', { class: 'camp-tabela', role: 'region', 'aria-label': 'Palavras-chave', tabindex: '0' },
      h('table', null,
        h('caption', { class: 'so-leitor' }, 'Palavras-chave desta campanha'),
        h('thead', null, h('tr', null, ['Palavra-chave', 'Gasto', 'Cliques', 'Contatos', 'Fecharam'].map((t, i) => h('th', { scope: 'col', class: i ? 'torre-direita' : null }, t)))),
        h('tbody', null, palavras.map((p) => h('tr', null,
          h('th', { scope: 'row' }, h('span', { class: 'camp-palavra' }, p.palavra || p.texto || 'sem nome'), p.correspondencia ? h('span', { class: 'apoio' }, ' correspondência ' + (CORRESPONDENCIA[p.correspondencia] || p.correspondencia)) : null),
          h('td', { class: 'torre-direita' }, ehNumero(p.gasto) ? dinheiro(p.gasto) : semDado()),
          h('td', { class: 'torre-direita' }, ehNumero(p.cliques) ? inteiro(p.cliques) : semDado()),
          h('td', { class: 'torre-direita' }, ehNumero(p.contatos) ? inteiro(p.contatos) : semDado()),
          h('td', { class: 'torre-direita' }, ehNumero(p.fecharam) ? inteiro(p.fecharam) : semDado()))))))
      : null,
    termos.length ? h('div', { class: 'camp-termos' },
      h('h3', { class: 'titulo-p' }, 'O que as pessoas buscaram'),
      h('ul', null, termos.slice(0, 20).map((t) => h('li', null,
        h('span', { class: 'camp-termo' }, t.termo || t.texto || 'sem texto'),
        h('span', { class: 'apoio' }, [ehNumero(t.cliques) ? contagem(t.cliques, 'clique', 'cliques') : null, ehNumero(t.gasto) ? dinheiro(t.gasto) : null].filter(Boolean).join(' · ')))))) : null);
}

const CONTATOS_A_VISTA = 6;

function contatosDaCampanha(ctx, d) {
  const c = d.campanha || {};
  const itens = Array.isArray(d.contatos) ? d.contatos : [];
  const total = ehNumero(d.contatos_total) ? d.contatos_total : itens.length;
  const naJornada = ctx.hrefDaTela('jornada', c.ext ? { campanha: c.ext } : { paga: '1' });
  // Os 6 mais recentes à vista; o resto a um toque (no celular, 15 contatos davam três telas antes dos links).
  const caixa = h('div', { class: 'camp-contatos' });
  const pintarTorre = (todos) => {
    const mostra = todos ? itens : itens.slice(0, CONTATOS_A_VISTA);
    const resto = itens.length - mostra.length;
    trocar(caixa, torreDeContatos(ctx, mostra, { rotulo: 'Contatos da campanha ' + (c.nome || ''), campanha: c.nome }),
      resto > 0 ? h('button', { class: 'botao botao-quieto camp-contatos-mais', type: 'button', on: { click: () => {
        pintarTorre(true);
        const proximo = caixa.querySelectorAll('.torre-abre')[CONTATOS_A_VISTA];
        if (proximo) proximo.focus();
      } } }, icone('mais'), resto === 1 ? 'Ver o outro contato' : 'Ver os outros ' + inteiro(resto) + ' contatos') : null);
  };
  if (itens.length) pintarTorre(false);
  return bloco('tContatosCampanha', 'Contatos desta campanha', total > itens.length ? 'Os ' + inteiro(itens.length) + ' mais recentes de ' + inteiro(total) + '.' : null,
    itens.length ? caixa : h('p', { class: 'suave' }, 'Nenhum contato chegou por esta campanha no período.'),
    itens.length ? h('a', { class: 'ligacao', href: naJornada }, total > itens.length ? 'Ver todos os ' + inteiro(total) + ' na Jornada' : 'Ver na Jornada', icone('seta', 'icone-p')) : null);
}

function pintarDetalhe(ctx, d, voltar) {
  const estado = d.estado || {};
  const c = d.campanha || {};
  ctx.demo(Boolean(estado.demo));
  mostrarAviso(ctx, estado);
  const situacao = SITUACAO[c.situacao];
  const titulo = h('h1', { class: 'titulo-tela camp-det-titulo' }, c.nome || 'Campanha sem nome');
  trocar(ctx.miolo,
    h('header', { class: 'camp-det-topo' },
      h('nav', { class: 'camp-volta', 'aria-label': 'Caminho' },
        h('a', { class: 'ligacao', href: voltar.href(), on: { click: (e) => { e.preventDefault(); voltar(); } } },
          icone('voltar', 'icone-p'), 'Voltar para a classificação')),
      titulo,
      h('p', { class: 'camp-sobre' }, marcaDaPlataforma(c.plataforma), situacao ? h('span', { class: 'apoio' }, situacao) : null,
        c.objetivo ? h('span', { class: 'apoio' }, 'objetivo: ' + String(c.objetivo).toLowerCase()) : null),
      c.leitura && c.leitura.texto ? h('p', { class: 'camp-leitura camp-leitura-g' }, seloDaLeitura(c.leitura), h('span', null, c.leitura.texto)) : null),
    h('section', { class: 'bloco', 'aria-labelledby': 'tLados' },
      h('div', { class: 'bloco-cab' }, h('h2', { class: 'titulo-bloco', id: 'tLados' }, 'A plataforma e a oficina'),
        h('p', null, ehNumero(c.retorno) ? ['Cada R$ 1 investido virou ', h('strong', null, dinheiro(c.retorno, { centavos: true })), ' em serviço fechado.'] : ehNumero(c.custo_por_contato) ? ['Cada contato custou ', h('strong', null, dinheiro(c.custo_por_contato)), '.'] : null)),
      lados(c, estado, { grande: true }),
      ehNumero(c.taxa_clique) || ehNumero(c.custo_por_clique)
        ? h('p', { class: 'apoio' }, [ehNumero(c.taxa_clique) ? 'De cada 100 pessoas que viram, ' + (Math.round(c.taxa_clique * 1000) / 10).toString().replace('.', ',') + ' clicaram' : null, ehNumero(c.custo_por_clique) ? 'cada clique custou ' + dinheiro(c.custo_por_clique, { centavos: true }) : null].filter(Boolean).join('; ') + '.')
        : null),
    conjuntosEAnuncios(ctx, d),
    palavrasETermos(d),
    contatosDaCampanha(ctx, d));
  focar(titulo);
}

