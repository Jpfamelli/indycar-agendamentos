/* ============================================================================
   Tela Resumo (rodada 11): o dono abre e entende em 5 segundos.
   Quatro números (gasto, contatos dos anúncios, clientes, custo por cliente)
   e um gráfico por semana. GET api/campanhas (totais) e GET api/hoje (dias).
   ============================================================================ */

import { h, icone, trocar } from '../dom.js';
import { dinheiro, inteiro, ehNumero, contagem } from '../formato.js';
import { porSemana } from '../resumo-logica.js';
import * as Estados from './estados.js';
import { periodos } from './periodo.js';

export function mostrar(ctx) {
  Estados.esqueleto(ctx.miolo, 'painel');
  const q = '?periodo=' + ctx.periodo;
  Promise.all([ctx.leitor.ler('api/campanhas' + q, { forcar: ctx.forcar }), ctx.leitor.ler('api/hoje' + q, { forcar: ctx.forcar }).catch(() => null)])
    .then(([camp, hoje]) => { if (ctx.vivo()) pintar(ctx, camp.dados || {}, hoje ? hoje.dados || {} : {}); },
      (erro) => { if (ctx.vivo()) Estados.falha(ctx.miolo, { mensagem: Estados.fraseDoErro(erro), aoTentar: () => ctx.recarregar() }); });
  return null;
}

function numeroGrande(rotulo, valor, apoio) {
  return h('li', { class: 'r-numero' },
    h('span', { class: 'r-rotulo' }, rotulo),
    valor ? h('span', { class: 'r-valor' }, valor) : h('span', { class: 'r-valor r-sem' }, 'sem dado'),
    apoio ? h('span', { class: 'r-apoio' }, apoio) : null);
}

function pintar(ctx, c, hoje) {
  const t = c.totais || {};
  const estado = c.estado || {};
  ctx.demo(Boolean(estado.demo));
  const semConta = estado.gasto === 'sem_conta' || estado.gasto === 'sem_dados';
  trocar(ctx.miolo,
    h('header', { class: 'r-cab' }, h('h1', { class: 'ic-titulo' }, 'Resumo'), periodos(ctx)),
    h('ul', { class: 'r-numeros' },
      numeroGrande('Gasto em anúncios', dinheiro(t.gasto, { centavos: false })),
      numeroGrande('Contatos dos anúncios', inteiro(t.contatos)),
      numeroGrande('Viraram serviço', inteiro(t.fecharam), ehNumero(t.faturado) && t.faturado > 0 ? dinheiro(t.faturado) + ' em serviços' : null),
      numeroGrande('Custo por cliente', dinheiro(t.custo_por_servico, { centavos: false }))),
    semConta ? h('p', { class: 'r-aviso' }, icone('info', 'icone-p'), 'Sem conta de anúncios ligada: o gasto aparece quando a Meta ou o Google forem ligados em Ajustes.') : null,
    problemaDeConexao(ctx, hoje.conexoes),
    grafico(hoje.ritmo && hoje.ritmo.dias));
}

/** Uma linha só quando alguma conexão pede atenção (o detalhe mora em Ajustes). */
function problemaDeConexao(ctx, c) {
  if (!c) return null;
  const ruim = ['erro', 'token_vencendo'];
  const nomes = [];
  if (c.meta && ruim.includes(c.meta.situacao)) nomes.push('Meta');
  if (c.google && ruim.includes(c.google.situacao)) nomes.push('Google');
  if (!nomes.length) return null;
  const admin = !ctx.eu || !ctx.eu.papel || ctx.eu.papel === 'admin' || ctx.eu.papel === 'dono';
  return h('p', { class: 'r-aviso r-aviso-forte' }, icone('alerta', 'icone-p'),
    'A conexão com ' + nomes.join(' e ') + ' pede atenção.',
    admin ? h('a', { class: 'ligacao', href: ctx.hrefDaTela('ajustes') }, 'Ver em Ajustes') : null);
}

function grafico(dias) {
  const semanas = porSemana(dias);
  if (!semanas.length) return null;
  const maior = Math.max(1, ...semanas.map((s) => s.contatos));
  const nenhum = semanas.every((s) => s.contatos === 0);
  return h('section', { class: 'r-grafico', 'aria-labelledby': 'tSemana' },
    h('h2', { class: 'r-subtitulo', id: 'tSemana' }, 'Contatos dos anúncios por semana'),
    nenhum ? h('p', { class: 'suave' }, 'Nenhum contato de anúncio neste período.') : h('ol', { class: 'r-semanas' }, semanas.map((s) => h('li', { class: 'r-semana' },
      h('span', { class: 'r-semana-nome' }, s.rotulo),
      h('span', { class: 'r-trilho', 'aria-hidden': 'true' }, h('i', { style: { '--v': (s.contatos / maior).toFixed(4) } })),
      h('span', { class: 'r-semana-n' }, contagem(s.contatos, 'contato', 'contatos')),
      h('span', { class: 'r-semana-gasto' }, ehNumero(s.gasto) ? dinheiro(s.gasto, { centavos: false }) + ' gastos' : '')))));
}
