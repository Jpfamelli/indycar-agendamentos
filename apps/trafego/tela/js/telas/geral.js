/* ============================================================================
   Visão geral (rodada 12): o herói do Nexus Ads com a cara da IndyCar.
   "Os anúncios trouxeram 61 conversas no WhatsApp, 24 agendamentos e 14
   clientes na oficina", o funil de três números com a passagem entre eles,
   o dinheiro na oficina e o retorno; embaixo os números do período, o
   gráfico por dia, o funil inteiro, Meta × Google e as melhores campanhas.
   GET api/campanhas (com e sem a fonte) e GET api/hoje.
   ============================================================================ */

import { h, icone, trocar, menosMovimento } from '../dom.js';
import { dinheiro, inteiro, porcento, ehNumero, dataLonga } from '../formato.js';
import { heroi, somarDias, melhoresCampanhas, seloDaCampanha, fracao } from '../painel-logica.js';
import { graficoDiario, faisca, funil } from '../graficos.js';
import { selo } from '../pecas.js';
import * as Estados from './estados.js';
import { cabeca, datasDoPeriodo } from './cabeca.js';

const NOME_DO_PERIODO = { '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', '60d': 'Últimos 60 dias' };

export function mostrar(ctx) {
  Estados.esqueleto(ctx.miolo, 'painel');
  const p = '?periodo=' + ctx.periodo;
  const ler = (c) => ctx.leitor.ler(c, { forcar: ctx.forcar });
  Promise.all([
    ler('api/campanhas' + p + (ctx.fonte ? '&plataforma=' + ctx.fonte : '')),
    ctx.fonte ? ler('api/campanhas' + p).catch(() => null) : null,
    ler('api/hoje' + p).catch(() => null),
  ]).then(([camp, todas, hoje]) => {
    if (!ctx.vivo()) return;
    pintar(ctx, camp.dados || {}, todas ? todas.dados || {} : camp.dados || {}, hoje ? hoje.dados || {} : {});
  }, (erro) => { if (ctx.vivo()) Estados.falha(ctx.miolo, { mensagem: Estados.fraseDoErro(erro), aoTentar: () => ctx.recarregar() }); });
  return null;
}

/* ------------------------------ peças ------------------------------ */

/** Número que sobe do zero até o valor (uma vez, rápido). Quem pediu menos movimento vê o número pronto. */
function contar(el, valor, formatar) {
  el.textContent = formatar(valor);
  if (!ehNumero(valor) || valor <= 0 || menosMovimento() || typeof requestAnimationFrame !== 'function') return el;
  const ini = performance.now(), dura = 900;
  const passo = (t) => {
    const f = Math.min(1, (t - ini) / dura), suave = 1 - (1 - f) ** 3;
    el.textContent = formatar(f >= 1 ? valor : Math.round(valor * suave * 100) / 100);
    if (f < 1 && el.isConnected) requestAnimationFrame(passo);
  };
  el.textContent = formatar(0);
  requestAnimationFrame(passo);
  return el;
}
const numeroVivo = (valor, formatar, classe) => contar(h('b', { class: classe }), valor, formatar);
const n0 = (v) => inteiro(Math.round(v));
const r0 = (v) => dinheiro(Math.round(v), { centavos: false });
const r2 = (v) => dinheiro(v, { centavos: true });

function fraseDoHeroi(H) {
  return h('p', { class: 'heroi-frase' }, H.frase.map((parte, i) => (parte.numero != null
    ? numeroVivo(parte.valor, n0, 'heroi-n' + (i === H.frase.length - 2 ? ' heroi-n-fim' : ''))
    : parte.texto)));
}

function trilha(H) {
  return h('div', { class: 'trilha' },
    h('div', { class: 'trilha-risco', 'aria-hidden': 'true' }),
    h('ol', { class: 'trilha-etapas' }, H.etapas.map((e) => h('li', { class: 'trilha-etapa' },
      ehNumero(e.passagem) ? h('span', { class: 'trilha-passa' }, porcento(e.passagem), h('span', { class: 'so-leitor' }, ' passaram')) : null,
      h('strong', { class: 'trilha-n' }, ehNumero(e.valor) ? inteiro(e.valor) : 'sem dado'),
      h('span', { class: 'trilha-rotulo' }, e.rotulo)))));
}

function contaDoHeroi(H, semConta) {
  return h('div', { class: 'heroi-conta' },
    h('div', { class: 'heroi-conta-item' },
      h('p', { class: 'mini' }, 'Na oficina'),
      ehNumero(H.faturado) && H.faturado > 0
        ? h('p', { class: 'heroi-conta-v' }, numeroVivo(H.faturado, r0, 'conta-n'), ' em serviços')
        : h('p', { class: 'heroi-conta-v heroi-conta-sem' }, 'Nenhum valor lançado ainda'),
      h('p', { class: 'heroi-conta-apoio' }, ehNumero(H.vieram) ? inteiro(H.vieram) + (H.vieram === 1 ? ' carro veio' : ' carros vieram') + ' para a oficina' : null)),
    h('div', { class: 'heroi-conta-item' },
      h('p', { class: 'mini' }, 'O que voltou'),
      ehNumero(H.retorno)
        ? h('p', { class: 'heroi-conta-v' }, 'Cada R$ 1 investido virou ', numeroVivo(H.retorno, r2, 'conta-n conta-n-forte'))
        : h('p', { class: 'heroi-conta-v heroi-conta-sem' }, semConta ? 'Ligue a conta de anúncios para ver o retorno' : 'Falta o valor dos serviços para saber o retorno'),
      h('p', { class: 'heroi-conta-apoio' }, ehNumero(H.gasto) ? r0(H.gasto) + ' investidos em anúncio' : null)));
}

/** O celular com as conversas que chegaram hoje pelo anúncio (como a notificação do WhatsApp). */
function celular(hoje, ate) {
  const doAnuncio = (Array.isArray(hoje) ? hoje : []).filter((c) => c && c.origem && c.origem.paga).slice(0, 3);
  const relogio = doAnuncio.length && doAnuncio[0].hora ? doAnuncio[0].hora : null;
  return h('div', { class: 'fone', 'aria-label': 'Conversas de hoje que vieram do anúncio', role: 'img' },
    h('div', { class: 'fone-tela' },
      h('span', { class: 'fone-ilha', 'aria-hidden': 'true' }),
      h('p', { class: 'fone-hora' }, relogio || 'Hoje'),
      h('p', { class: 'fone-data' }, ate ? dataLonga(ate) : ''),
      doAnuncio.length
        ? doAnuncio.map((c, i) => h('div', { class: 'notif', style: { '--i': i } },
          h('span', { class: 'notif-app', 'aria-hidden': 'true' }, icone('conversa')),
          h('div', { class: 'notif-txt' },
            h('p', null, h('b', null, c.nome || 'Contato'), ' · via anúncio'),
            h('p', null, 'Chamou pelo anúncio ', h('q', null, (c.origem.campanha && c.origem.campanha.nome) || c.origem.rotulo || 'da oficina')),
            h('p', { class: 'notif-quando' }, c.hora ? 'hoje, ' + c.hora : 'hoje'))))
        : h('div', { class: 'notif notif-vazia' }, h('div', { class: 'notif-txt' }, h('p', null, 'Nenhuma conversa de anúncio hoje ainda.')))));
}

function instrumento(rotulo, valor, apoio, serie) {
  return h('li', { class: 'instr' },
    h('p', { class: 'mini' }, rotulo),
    h('p', { class: 'instr-v' + (valor ? '' : ' instr-sem') }, valor || 'sem dado'),
    apoio ? h('p', { class: 'instr-apoio' }, apoio) : null,
    serie ? faisca(serie) : null);
}

function regua(H, dias, semConta) {
  const gastos = dias.map((d) => d.gasto), conversas = dias.map((d) => d.contatos);
  const temGasto = gastos.some(ehNumero);
  return h('section', { class: 'cartao regua', 'aria-label': 'Números do período' }, h('ul', { class: 'regua-in' },
    instrumento('Investido em anúncio', temGasto || ehNumero(H.gasto) ? r0(H.gasto || 0) : null, semConta ? 'conta de anúncios não ligada' : 'Meta e Google juntos', temGasto ? gastos : null),
    instrumento('Custo por conversa', ehNumero(H.custo_por_conversa) ? r2(H.custo_por_conversa) : null, 'quanto custou cada conversa no WhatsApp', null),
    instrumento('Conversas no WhatsApp', ehNumero(H.etapas[0].valor) ? inteiro(H.etapas[0].valor) : null, 'que vieram dos anúncios', conversas),
    instrumento('Agendaram', ehNumero(H.etapas[1].valor) ? inteiro(H.etapas[1].valor) : null, ehNumero(H.etapas[1].passagem) ? porcento(H.etapas[1].passagem) + ' das conversas' : null, null),
    instrumento('Clientes novos', ehNumero(H.etapas[2].valor) ? inteiro(H.etapas[2].valor) : null, ehNumero(H.etapas[2].passagem) ? porcento(H.etapas[2].passagem) + ' de quem agendou' : null, null),
    instrumento('Custo por cliente', ehNumero(H.custo_por_cliente) ? r0(H.custo_por_cliente) : null, 'investido ÷ clientes que fecharam', null)));
}

function cartao(titulo, sub, corpo, classe = '') {
  return h('section', { class: ('cartao ' + classe).trim() },
    h('header', { class: 'cartao-cab' }, h('h2', null, titulo), sub ? h('p', { class: 'sub' }, sub) : null), corpo);
}

function diario(dias, fonte) {
  if (!dias.length) return null;
  const temGasto = dias.some((d) => ehNumero(d.gasto));
  return cartao(temGasto ? 'Investimento e conversas por dia' : 'Conversas por dia',
    temGasto ? 'Barras: quanto foi investido. Linha: conversas no WhatsApp (média de 7 dias).' : 'Linha: conversas no WhatsApp que vieram dos anúncios (média de 7 dias).',
    [h('p', { class: 'legenda-g' },
      temGasto && fonte !== 'google' ? h('span', null, h('i', { class: 'lg lg-meta' }), 'Meta') : null,
      temGasto && fonte !== 'meta' ? h('span', null, h('i', { class: 'lg lg-google' }), 'Google') : null,
      h('span', null, h('i', { class: 'lg lg-linha' }), 'Conversas')),
    graficoDiario(dias, { fonte })], 'cartao-dia');
}

function funilCompleto(t) {
  const etapas = [
    { rotulo: 'Viram o anúncio', apoio: 'vezes na tela', valor: t.impressoes, cor: 'frio' },
    { rotulo: 'Tocaram no anúncio', apoio: 'abriram o anúncio', valor: t.cliques, cor: 'frio', passa: (n) => 'de cada 100 que viram, ' + n + ' tocaram', quem: 'viu' },
    { rotulo: 'Chamaram no WhatsApp', apoio: 'conversas', valor: t.contatos, cor: 'frio', passa: (n) => n + '% de quem tocou chamou' },
    { rotulo: 'Agendaram', apoio: 'horário marcado', valor: t.agendaram, cor: 'quente', passa: (n) => n + '% das conversas' },
    { rotulo: 'Vieram na oficina', apoio: 'carro chegou', valor: t.vieram, cor: 'quente', passa: (n) => n + '% de quem agendou' },
    { rotulo: 'Fecharam serviço', apoio: 'viraram clientes', valor: t.fecharam, cor: 'quente', passa: (n) => n + '% de quem veio' },
  ];
  return cartao('Do anúncio ao serviço fechado', 'O caminho de quem viu o anúncio até sair com o carro pronto.', funil(etapas), 'cartao-funil');
}

function metaGoogle(origens, comparacao) {
  const da = (id) => (Array.isArray(origens) ? origens : []).find((o) => o && o.id === id) || null;
  const linhaCmp = (id) => (comparacao && Array.isArray(comparacao.linhas) ? comparacao.linhas.find((l) => l.plataforma === id) : null) || {};
  const coluna = (id, nome) => {
    const o = da(id) || {};
    const custo = ehNumero(linhaCmp(id).custo_por_servico) ? linhaCmp(id).custo_por_servico : null;
    return h('div', { class: 'mg-col mg-' + id },
      h('p', { class: 'mg-nome' }, nome),
      h('dl', { class: 'mg-dados' },
        h('div', null, h('dt', null, 'Investido'), h('dd', null, ehNumero(o.gasto) ? r0(o.gasto) : 'sem dado')),
        h('div', null, h('dt', null, 'Conversas'), h('dd', null, ehNumero(o.contatos) ? inteiro(o.contatos) : 'sem dado')),
        h('div', null, h('dt', null, 'Clientes'), h('dd', null, ehNumero(o.fecharam) ? inteiro(o.fecharam) : 'sem dado')),
        h('div', null, h('dt', null, 'Custo por cliente'), h('dd', null, custo ? r0(custo) : 'sem dado')),
        h('div', { class: 'mg-forte' }, h('dt', null, 'Cada R$ 1 virou'), h('dd', null, ehNumero(o.retorno) ? r2(o.retorno) : 'sem dado'))));
  };
  const m = da('meta') || {}, g = da('google') || {};
  const total = (m.contatos || 0) + (g.contatos || 0);
  const parteMeta = fracao(m.contatos || 0, total);
  return cartao('Meta × Google', comparacao && comparacao.destaque ? comparacao.destaque : 'Quem trouxe conversa e quem trouxe cliente.',
    [ehNumero(parteMeta) ? h('div', { class: 'mg-barra', role: 'img', 'aria-label': 'Conversas: Meta ' + porcento(parteMeta) + ', Google ' + porcento(1 - parteMeta) },
      h('span', { class: 'mg-barra-meta', style: { '--v': parteMeta.toFixed(4) } }, 'Meta ' + porcento(parteMeta)),
      h('span', { class: 'mg-barra-google' }, 'Google ' + porcento(1 - parteMeta))) : null,
    h('div', { class: 'mg' }, coluna('meta', 'Meta · Facebook e Instagram'), coluna('google', 'Google · pesquisa'))], 'cartao-mg');
}

function melhores(ctx, campanhas) {
  const top = melhoresCampanhas(campanhas, 3);
  const maior = Math.max(1, ...top.map((c) => c.fecharam));
  return cartao('Melhores campanhas', 'As que trouxeram cliente mais barato.',
    top.length ? h('ol', { class: 'podio' }, top.map((c, i) => {
      const s = seloDaCampanha(c);
      return h('li', { class: 'podio-item' },
        h('span', { class: 'podio-pos', 'aria-hidden': 'true' }, String(i + 1)),
        h('div', { class: 'podio-corpo' },
          h('a', { class: 'podio-nome', href: ctx.hrefDaTela('campanhas', { abrir: c.plataforma + ':' + c.chave }) }, c.nome || 'Campanha sem nome'),
          h('p', { class: 'podio-sub' }, (c.plataforma === 'google' ? 'Google' : 'Meta') + ' · ' + inteiro(c.fecharam) + (c.fecharam === 1 ? ' cliente' : ' clientes') + (ehNumero(c.custo_por_servico) ? ' · ' + r0(c.custo_por_servico) + ' cada' : '')),
          h('span', { class: 'podio-trilho', 'aria-hidden': 'true' }, h('i', { style: { '--v': (c.fecharam / maior).toFixed(4) } }))),
        s ? selo(s[0], s[1]) : null);
    })) : h('p', { class: 'suave' }, 'Nenhuma campanha trouxe cliente neste período ainda.'), 'cartao-podio');
}

function leituraDoPeriodo(ctx, campanhas, comparacao) {
  const itens = [];
  if (comparacao && comparacao.destaque) itens.push([null, comparacao.destaque]);
  for (const c of campanhas.slice(0, 4)) if (c.leitura && c.leitura.texto) itens.push([c.nome, c.leitura.texto]);
  if (!itens.length) return null;
  return cartao('Leitura do período', 'O que os números estão dizendo.',
    h('ol', { class: 'leitura' }, itens.map(([nome, texto], i) => h('li', null,
      h('span', { class: 'leitura-n', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
      h('p', null, nome ? h('b', null, nome + ': ') : null, texto)))), 'cartao-leitura');
}

/* ------------------------------ tela ------------------------------ */

function pintar(ctx, c, todas, hoje) {
  const estado = c.estado || {};
  ctx.demo(Boolean(estado.demo));
  const t = c.totais || {};
  const semConta = estado.gasto === 'sem_conta' || estado.gasto === 'sem_dados';
  const H = heroi(t, ctx.fonte);
  const dias = somarDias(c.campanhas);
  const campanhas = Array.isArray(c.campanhas) ? c.campanhas : [];
  const comparacao = (todas && todas.comparacao) || null;

  trocar(ctx.miolo,
    cabeca(ctx, { linha: 'Anúncios → WhatsApp → oficina', titulo: 'Visão geral' }),
    h('section', { class: 'cartao heroi', 'aria-labelledby': 'tHeroi', on: { pointermove: luz } },
      h('div', { class: 'heroi-in' },
        h('p', { class: 'mini', id: 'tHeroi' }, (NOME_DO_PERIODO[ctx.periodo] || 'Período') + (datasDoPeriodo(c.periodo) ? ' · ' + datasDoPeriodo(c.periodo) : '') + (H.nome_da_fonte ? ' · só ' + H.nome_da_fonte : '')),
        fraseDoHeroi(H),
        trilha(H),
        contaDoHeroi(H, semConta)),
      celular(hoje.hoje, c.periodo && c.periodo.ate)),
    semConta ? h('p', { class: 'aviso-linha' }, icone('info', 'icone-p'), 'A conta de anúncios ainda não está ligada: dá para ver as conversas e os clientes, mas não o quanto custaram.') : null,
    regua(H, dias, semConta),
    diario(dias, ctx.fonte),
    h('div', { class: 'grade-2' }, funilCompleto(t), h('div', { class: 'coluna-d' }, metaGoogle(hoje.origens, comparacao), melhores(ctx, campanhas))),
    leituraDoPeriodo(ctx, campanhas, ctx.fonte ? null : comparacao));
}

/** O brilho vermelho do herói segue o dedo ou o mouse (só enfeite: sem ele a tela é igual). */
function luz(e) {
  const caixa = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--lx', (((e.clientX - caixa.left) / caixa.width) * 100).toFixed(1) + '%');
  e.currentTarget.style.setProperty('--ly', (((e.clientY - caixa.top) / caixa.height) * 100).toFixed(1) + '%');
}
