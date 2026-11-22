/* ============================================================================
   Relatórios (rodada 12): a folha do período pronta para ler, mostrar e
   imprimir (o que os anúncios trouxeram, o caminho até o serviço, Meta ×
   Google, as campanhas e o que fazer), e ao lado a mensagem da semana ou do
   mês do jeito que vai para o WhatsApp, com o botão de copiar.
   GET api/campanhas, GET api/hoje e GET api/relatorios/texto.
   ============================================================================ */

import { h, icone, trocar } from '../dom.js';
import { dinheiro, inteiro, porcento, ehNumero, dataLonga } from '../formato.js';
import { heroi, ordenarCampanhas, radar, linhasDoRelatorio } from '../painel-logica.js';
import * as Estados from './estados.js';
import { cabeca, datasDoPeriodo } from './cabeca.js';

const TIPOS = [{ id: 'semanal', rotulo: 'Semana' }, { id: 'mensal', rotulo: 'Mês' }];
const NOME_DO_PERIODO = { '7d': 'últimos 7 dias', '30d': 'últimos 30 dias', '60d': 'últimos 60 dias' };
const r0 = (v) => (ehNumero(v) ? dinheiro(v, { centavos: false }) : 'sem dado');

export function mostrar(ctx) {
  Estados.esqueleto(ctx.miolo, 'painel');
  const p = '?periodo=' + ctx.periodo;
  const ler = (c) => ctx.leitor.ler(c, { forcar: ctx.forcar });
  Promise.all([ler('api/campanhas' + p + (ctx.fonte ? '&plataforma=' + ctx.fonte : '')), ler('api/hoje' + p).catch(() => null)])
    .then(([camp, hoje]) => { if (ctx.vivo()) pintar(ctx, camp.dados || {}, hoje ? hoje.dados || {} : {}); },
      (erro) => { if (ctx.vivo()) Estados.falha(ctx.miolo, { mensagem: Estados.fraseDoErro(erro), aoTentar: () => ctx.recarregar() }); });
  return null;
}

function linhaDoRelatorio(l) {
  const partes = l.partes.map((p) => (p.forte ? h('b', null, p.texto) : p.texto));
  if (l.tipo === 'titulo') return h('p', { class: 'zap-titulo' }, partes);
  if (l.tipo === 'secao') return h('p', { class: 'zap-secao' }, partes);
  if (l.tipo === 'item') return h('p', { class: 'zap-item' }, partes);
  return h('p', null, partes);
}

function mensagem(ctx) {
  const tipo = TIPOS.some((t) => t.id === ctx.rota.params.tipo) ? ctx.rota.params.tipo : 'semanal';
  const alvo = h('div', { class: 'zap-corpo', 'aria-live': 'polite' }, h('p', { class: 'suave' }, 'Montando a mensagem…'));
  const copiar = h('button', { class: 'botao', type: 'button', disabled: true }, icone('copiar', 'icone-p'), 'Copiar a mensagem');
  let texto = '';
  copiar.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(texto); ctx.avisar('Mensagem copiada. É só colar no WhatsApp.'); } catch { ctx.avisar('Não deu para copiar daqui. Selecione o texto e copie.'); }
  });
  ctx.leitor.ler('api/relatorios/texto?tipo=' + tipo).then((r) => {
    if (!ctx.vivo()) return;
    const d = r.dados || {};
    texto = typeof d.texto === 'string' ? d.texto : '';
    trocar(alvo, texto ? linhasDoRelatorio(texto).map(linhaDoRelatorio) : h('p', { class: 'suave' }, 'Ainda não há relatório para este período.'));
    copiar.disabled = !texto;
  }, (erro) => { if (ctx.vivo()) trocar(alvo, h('p', { class: 'campo-erro', role: 'alert' }, Estados.fraseDoErro(erro))); });
  return h('aside', { class: 'cartao rel-zap', 'aria-labelledby': 'tZap' },
    h('header', { class: 'cartao-cab' }, h('h2', { id: 'tZap' }, 'Mensagem pronta'), h('p', { class: 'sub' }, 'O resumo que vai para o WhatsApp do dono.')),
    h('div', { class: 'seg seg-p', role: 'group', 'aria-label': 'Qual relatório' },
      TIPOS.map((t) => h('a', { class: 'seg-op', href: ctx.hrefDaTela('relatorios', { ...ctx.rota.params, tipo: t.id === 'semanal' ? null : t.id }), 'aria-current': t.id === tipo ? 'true' : null }, t.rotulo))),
    h('div', { class: 'zap-papel' }, alvo),
    copiar);
}

function folha(ctx, c, hoje) {
  const t = c.totais || {};
  const H = heroi(t, ctx.fonte);
  const campanhas = ordenarCampanhas(c.campanhas, 'clientes').slice(0, 6);
  const origens = Array.isArray(hoje.origens) ? hoje.origens.filter((o) => o && (o.id === 'meta' || o.id === 'google')) : [];
  const fazer = radar(hoje.fazer).lista.filter((a) => a.gravidade !== 'baixa').slice(0, 3);
  const quando = (NOME_DO_PERIODO[ctx.periodo] || 'período') + (datasDoPeriodo(c.periodo) ? ' · ' + datasDoPeriodo(c.periodo) : '');
  const grande = (rotulo, valor) => h('div', null, h('dt', null, rotulo), h('dd', null, valor));
  return h('article', { class: 'cartao folha', 'aria-labelledby': 'tFolha' },
    h('header', { class: 'folha-cab' },
      h('img', { src: '../casa/logo.png', alt: '', width: '40', height: '40' }),
      h('div', null, h('p', { class: 'mini' }, 'IndyCar · Relatório de tráfego'), h('h2', { id: 'tFolha' }, 'Os anúncios nos ' + quando)),
      h('p', { class: 'folha-data' }, c.periodo && c.periodo.ate ? 'até ' + dataLonga(c.periodo.ate) : '')),
    h('p', { class: 'folha-frase' }, H.frase.map((p) => (p.numero != null ? h('b', null, p.numero) : p.texto))),
    h('dl', { class: 'folha-grandes' },
      grande('Investido', r0(H.gasto)),
      grande('Em serviços', r0(H.faturado)),
      grande('Custo por cliente', r0(H.custo_por_cliente)),
      grande('Cada R$ 1 virou', ehNumero(H.retorno) ? dinheiro(H.retorno, { centavos: true }) : 'sem dado')),
    h('section', { class: 'folha-parte' }, h('h3', null, 'Do anúncio ao serviço'),
      h('ol', { class: 'folha-funil' },
        [['Conversas no WhatsApp', t.contatos, null], ['Agendaram', t.agendaram, t.contatos], ['Vieram na oficina', t.vieram, t.agendaram], ['Fecharam serviço', t.fecharam, t.vieram]]
          .map(([rotulo, n, de]) => h('li', null, h('b', null, ehNumero(n) ? inteiro(n) : 'sem dado'), h('span', null, rotulo), ehNumero(n) && ehNumero(de) && de > 0 ? h('small', null, porcento(n / de)) : null)))),
    origens.length ? h('section', { class: 'folha-parte' }, h('h3', null, 'Meta × Google'),
      h('div', { class: 'tabela-rola' }, h('table', { class: 'tabela' },
        h('thead', null, h('tr', null, ['', 'Investido', 'Conversas', 'Clientes', 'Cada R$ 1 virou'].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, origens.map((o) => h('tr', null, h('th', { scope: 'row' }, o.id === 'meta' ? 'Meta' : 'Google'),
          h('td', null, r0(o.gasto)), h('td', null, inteiro(o.contatos) || '0'), h('td', null, inteiro(o.fecharam) || '0'),
          h('td', null, ehNumero(o.retorno) ? dinheiro(o.retorno, { centavos: true }) : 'sem dado'))))))) : null,
    campanhas.length ? h('section', { class: 'folha-parte' }, h('h3', null, 'Campanhas'),
      h('div', { class: 'tabela-rola' }, h('table', { class: 'tabela' },
        h('thead', null, h('tr', null, ['Campanha', 'Gasto', 'Conversas', 'Clientes', 'Custo por cliente'].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, campanhas.map((x) => h('tr', null, h('th', { scope: 'row' }, x.nome || 'Campanha'),
          h('td', null, r0(x.gasto)), h('td', null, inteiro(x.contatos) || '0'), h('td', null, inteiro(x.fecharam) || '0'), h('td', null, x.fecharam === 0 ? 'nenhum cliente' : r0(x.custo_por_servico)))))))) : null,
    fazer.length ? h('section', { class: 'folha-parte' }, h('h3', null, 'O que fazer agora'),
      h('ol', { class: 'folha-fazer' }, fazer.map((a) => h('li', null, h('b', null, a.titulo + (a.porque ? ':' : '')), a.porque ? ' ' + a.porque : '')))) : null,
    h('p', { class: 'folha-pe' }, 'IndyCar Tráfego · números do anúncio (Meta e Google) juntos com o que aconteceu na oficina.'));
}

function pintar(ctx, c, hoje) {
  ctx.demo(Boolean(c.estado && c.estado.demo));
  const imprimir = h('button', { class: 'botao botao-forte', type: 'button', on: { click: () => window.print() } }, icone('imprimir', 'icone-p'), 'Imprimir');
  trocar(ctx.miolo,
    cabeca(ctx, { linha: 'Pronto para ler, mostrar e imprimir', titulo: 'Relatórios', acoes: imprimir }),
    h('div', { class: 'rel-grade' }, folha(ctx, c, hoje), mensagem(ctx)));
}
