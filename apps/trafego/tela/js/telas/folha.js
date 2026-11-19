/* ============================================================================
   Folha do mês (#/folha?mes=AAAA-MM), de GET /api/relatorios/folha.
   Na tela, uma folha branca com a barra de cima (voltar, mês, imprimir).
   Na impressão, só a folha: A4 em pé, preto no branco, uma página.
   ============================================================================ */

import { h, icone, trocar, focar } from '../dom.js';
import { valorPorFormato, comparacao, dinheiro, inteiro, porcento, dataCurta, dataHora, ehNumero } from '../formato.js';
import { buscar } from './estados.js';
import { mesesParaEscolher, motivoDoVazio } from '../relatorios-logica.js';

const DERIVADOS = [
  { id: 'custo_por_contato', rotulo: 'Custo por contato', f: (v) => dinheiro(v) },
  { id: 'custo_por_servico', rotulo: 'Custo por serviço fechado', f: (v) => dinheiro(v) },
  { id: 'retorno', rotulo: 'Retorno', f: (v) => 'cada R$ 1 virou ' + dinheiro(v, { centavos: true }) },
  { id: 'ticket_medio', rotulo: 'Valor médio do serviço', f: (v) => dinheiro(v) },
  { id: 'taxa_fechamento', rotulo: 'Fecharam', f: (v) => porcento(v) + ' dos contatos' },
];
const PLATAFORMA = { meta: 'Meta', google: 'Google' };

export function mostrar(ctx) {
  const raiz = document.documentElement;
  raiz.classList.add('modo-folha');
  let vez = 0;
  const pintar = (c) => {
    const minha = ++vez;
    const mes = /^\d{4}-\d{2}$/.test(c.rota.params.mes || '') ? c.rota.params.mes : '';
    return buscar(c, 'api/relatorios/folha' + (mes ? '?mes=' + mes : ''), {
      forma: 'painel',
      pintar: (d) => { if (minha === vez) desenhar(c, d); },
    });
  };
  pintar(ctx);
  return {
    atualizar(novo) { pintar(novo); return true; },
    sair() { raiz.classList.remove('modo-folha'); },
  };
}

function desenhar(ctx, d) {
  const meses = mesesParaEscolher(new Date());
  const mesAtual = d.mes && d.mes.mes;
  const sel = h('select', { id: 'folhaMes', on: { change: () => ctx.ir('folha', { mes: sel.value }) } }, meses.map((m) => h('option', { value: m.id }, m.rotulo)));
  if (mesAtual) sel.value = mesAtual;
  const barra = h('div', { class: 'papel-barra' },
    h('a', { class: 'ligacao', href: ctx.hrefDaTela('ajustes', { secao: 'relatorios' }) }, icone('voltar', 'icone-p'), 'Voltar aos relatórios'),
    h('label', { class: 'campo papel-mes', for: 'folhaMes' }, h('span', null, 'Mês'), sel),
    h('button', { class: 'botao botao-forte', type: 'button', on: { click: () => window.print() } }, icone('imprimir'), 'Imprimir'));
  const titulo = h('h1', { class: 'papel-titulo', tabindex: '-1' }, d.titulo || 'Folha do mês');
  const estado = d.estado || {};
  const folha = h('article', { class: 'papel', 'aria-labelledby': 'folhaTitulo' },
    h('header', { class: 'papel-cab' },
      h('p', { class: 'papel-marca' }, 'Relatório do mês'),
      Object.assign(titulo, { id: 'folhaTitulo' }),
      h('p', { class: 'papel-periodo' }, periodoDaFolha(d))),
    d.frase ? h('section', { class: 'papel-frase' },
      h('p', { class: 'papel-frase-texto' }, d.frase.texto),
      d.frase.apoio ? h('p', { class: 'papel-apoio' }, d.frase.apoio) : null) : null,
    estado.aviso ? h('p', { class: 'papel-aviso' }, estado.aviso) : null,
    numeros(d.numeros || [], estado),
    derivados(d.derivados || {}),
    h('div', { class: 'papel-duas' }, funil(d.funil), origens(d.origens || [])),
    campanhas(d.campanhas || [], d.sem_campanha),
    d.horarios && d.horarios.leitura ? h('p', { class: 'papel-nota' }, h('strong', null, 'Horários. '), d.horarios.leitura) : null,
    h('footer', { class: 'papel-pe' }, 'Feita em ' + (d.gerado_em ? dataHora(d.gerado_em) : 'hoje') + '. Contatos e serviços vêm da oficina; gasto vem da Meta e do Google.'));
  trocar(ctx.miolo, h('div', { class: 'papel-pagina' }, barra, folha));
  ctx.marcarAtualizado && ctx.marcarAtualizado();
  focar(titulo);
}

function periodoDaFolha(d) {
  const m = d.mes || {};
  if (!m.de) return '';
  return (m.fechado ? 'Mês fechado: ' : 'Até agora: ') + dataCurta(m.de) + ' a ' + dataCurta(m.ate) + '.';
}

function numeros(lista, estado) {
  return h('section', { class: 'papel-numeros', 'aria-label': 'Os números do mês' },
    lista.map((n) => {
      const valor = valorPorFormato(n.valor, n.formato);
      const comp = valor ? comparacao(n) : null;
      return h('div', { class: 'papel-numero' },
        h('p', { class: 'papel-numero-rotulo' }, n.rotulo),
        valor ? h('p', { class: 'papel-numero-valor' }, valor) : h('p', { class: 'papel-numero-vazio' }, motivoDoVazio(n, estado)),
        valor && n.apoio ? h('p', { class: 'papel-apoio' }, n.apoio) : null,
        comp && comp.direcao ? h('p', { class: 'papel-apoio' }, 'Contra o mês anterior: ' + comp.texto + (comp.detalhe ? ' (' + comp.detalhe + ')' : '') + '.') : null);
    }));
}

function derivados(d) {
  const com = DERIVADOS.filter((x) => ehNumero(d[x.id]));
  if (!com.length) return null;
  return h('dl', { class: 'papel-derivados' }, com.map((x) => h('div', null, h('dt', null, x.rotulo), h('dd', null, x.f(d[x.id])))));
}

function funil(f) {
  const etapas = ((f && f.etapas) || []).filter((e) => ehNumero(e.total));
  if (!etapas.length) return null;
  const nao = f.nao_fecharam;
  return h('section', { class: 'papel-bloco' },
    h('h2', { class: 'papel-subtitulo' }, 'Do contato ao serviço fechado'),
    h('table', { class: 'papel-tabela' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Etapa'), h('th', { scope: 'col' }, 'Todos'), h('th', { scope: 'col' }, 'De anúncio'))),
      h('tbody', null, etapas.map((e) => h('tr', null, h('th', { scope: 'row' }, e.rotulo), h('td', null, inteiro(e.total)), h('td', null, ehNumero(e.anuncio) ? inteiro(e.anuncio) : 'sem dado'))))),
    nao && ehNumero(nao.total) && nao.total > 0 ? h('p', { class: 'papel-apoio' }, 'Não fecharam: ' + inteiro(nao.total) + (nao.motivos && nao.motivos[0] ? '. O motivo que mais aparece: ' + nao.motivos[0].rotulo.toLowerCase() + '.' : '.')) : null);
}

function origens(lista) {
  if (!lista.length) return null;
  return h('section', { class: 'papel-bloco' },
    h('h2', { class: 'papel-subtitulo' }, 'De onde vieram'),
    h('table', { class: 'papel-tabela' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Origem'), h('th', { scope: 'col' }, 'Contatos'), h('th', { scope: 'col' }, 'Fecharam'), h('th', { scope: 'col' }, 'Faturado'))),
      h('tbody', null, lista.map((o) => h('tr', null,
        h('th', { scope: 'row' }, o.rotulo),
        h('td', null, inteiro(o.contatos)),
        h('td', null, ehNumero(o.fecharam) ? inteiro(o.fecharam) : 'sem dado'),
        h('td', null, ehNumero(o.faturado) ? dinheiro(o.faturado) : 'sem dado'))))));
}

function campanhas(lista, semCampanha) {
  if (!lista.length && !(semCampanha && semCampanha.contatos)) return null;
  const top = lista.slice(0, 8);
  return h('section', { class: 'papel-bloco' },
    h('h2', { class: 'papel-subtitulo' }, 'Campanhas'),
    top.length ? h('div', { class: 'papel-rolagem', role: 'region', 'aria-label': 'Tabela das campanhas', tabindex: '0' }, h('table', { class: 'papel-tabela' },
      h('thead', null, h('tr', null, ...['Campanha', 'Gasto', 'Contatos', 'Fecharam', 'Custo por contato', 'Cada R$ 1 virou'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', null, top.map((c) => h('tr', null,
        h('th', { scope: 'row' }, c.nome || 'Sem nome', h('span', { class: 'papel-plataforma' }, ' (' + (PLATAFORMA[c.plataforma] || c.plataforma || '') + ')')),
        h('td', null, ehNumero(c.gasto) ? dinheiro(c.gasto) : 'sem gasto ligado'),
        h('td', null, inteiro(c.contatos)),
        h('td', null, ehNumero(c.fecharam) ? inteiro(c.fecharam) : 'sem dado'),
        h('td', null, ehNumero(c.custo_por_contato) ? dinheiro(c.custo_por_contato) : 'sem dado'),
        h('td', null, ehNumero(c.retorno) ? dinheiro(c.retorno, { centavos: true }) : 'sem dado')))))) : null,
    lista.length > top.length ? h('p', { class: 'papel-apoio' }, 'Mais ' + inteiro(lista.length - top.length) + ' campanhas na tela Campanhas.') : null,
    semCampanha && semCampanha.texto ? h('p', { class: 'papel-apoio' }, semCampanha.texto) : null);
}
