/* ============================================================================
   Radar (rodada 12): o que pede atenção, do mais grave para o mais leve, em
   linguagem de oficina: o que aconteceu e o que fazer (um botão que leva lá).
   Ao lado, o radar desenhado e como o aviso chega no WhatsApp do dono;
   embaixo, se a Meta, o Google, o site e o WhatsApp estão funcionando.
   GET api/hoje (campos fazer e conexoes: os alertas do radar.js entram ali).
   ============================================================================ */

import { h, icone, trocar } from '../dom.js';
import { haQuanto, inteiro } from '../formato.js';
import { selo } from '../pecas.js';
import { radar } from '../painel-logica.js';
import { destinoDoIr, ehAdmin } from '../rotas.js';
import { linkSeguro } from '../ecossistema.js';
import * as Estados from './estados.js';
import { cabeca } from './cabeca.js';

const GRAVIDADE = { alta: ['grave', 'Urgente'], media: ['atencao', 'Atenção'], baixa: ['neutro', 'Para ver'] };

export function mostrar(ctx) {
  Estados.buscar(ctx, 'api/hoje?periodo=' + ctx.periodo, { forma: 'lista', pintar: (d) => pintar(ctx, d) });
  return null;
}

function botaoDoAviso(ctx, acao) {
  if (!acao || !acao.rotulo) return null;
  const destino = destinoDoIr(acao.ir);
  if (!destino) return null;
  if (destino.fora) {
    const href = linkSeguro(destino.fora, { base: ctx.base });
    return href ? h('a', { class: 'botao', href }, acao.rotulo, icone('abre-fora', 'icone-p')) : null;
  }
  if (destino.tela === 'ajustes' && !ehAdmin(ctx.eu && ctx.eu.papel)) return null;
  return h('a', { class: 'botao', href: ctx.hrefDaTela(destino.tela, destino.params) }, acao.rotulo, icone('seta', 'icone-p'));
}

function desenho(r) {
  // um ponto por aviso, espalhados pela tela do radar (o lugar não quer dizer nada; a cor diz a gravidade)
  const lugares = [[64, 30], [30, 58], [70, 66], [44, 28], [24, 40], [58, 80], [80, 46], [40, 74]];
  return h('div', { class: 'radar-tela', 'aria-hidden': 'true' },
    h('i', { class: 'radar-anel a1' }), h('i', { class: 'radar-anel a2' }), h('i', { class: 'radar-anel a3' }),
    h('i', { class: 'radar-cruz' }), h('i', { class: 'radar-varre' }),
    r.lista.slice(0, lugares.length).map((a, i) => h('i', { class: 'radar-ponto g-' + (a.gravidade || 'baixa'), style: { '--x': lugares[i][0] + '%', '--y': lugares[i][1] + '%', '--i': i } })));
}

function whatsapp(r) {
  const principais = r.lista.filter((a) => a.gravidade !== 'baixa').slice(0, 3);
  return h('div', { class: 'fone fone-zap', role: 'img', 'aria-label': 'Exemplo de como o aviso chega no WhatsApp do dono' },
    h('div', { class: 'fone-tela' },
      h('span', { class: 'fone-ilha', 'aria-hidden': 'true' }),
      h('p', { class: 'zap-cab' }, h('b', null, 'IndyCar · Radar'), h('span', null, 'aviso automático')),
      h('div', { class: 'zap-bolha' },
        h('p', null, h('b', null, 'Radar do tráfego')),
        principais.length
          ? principais.map((a) => h('p', null, '• ', a.titulo))
          : h('p', null, 'Nada urgente hoje. Os anúncios estão rodando dentro do esperado.'))));
}

function aviso(ctx, a) {
  const g = GRAVIDADE[a.gravidade] || GRAVIDADE.baixa;
  return h('li', { class: 'aviso g-' + (a.gravidade || 'baixa') },
    h('span', { class: 'aviso-ponto', 'aria-hidden': 'true' }),
    h('div', { class: 'aviso-corpo' },
      h('div', { class: 'aviso-cab' }, h('h3', null, a.titulo), selo(g[0], g[1])),
      a.porque ? h('p', null, h('span', { class: 'mini' }, 'Por que importa '), a.porque) : null,
      botaoDoAviso(ctx, a.acao)));
}

const SITUACAO = {
  ok: ['bom', 'Funcionando'], nunca_ligou: ['neutro', 'Não ligada'], erro: ['grave', 'Com erro'], token_vencendo: ['atencao', 'Acesso vencendo'],
  chave_recusada: ['grave', 'Parado'], sem_aparelho: ['neutro', 'Sem aparelho'], sem_noticia: ['atencao', 'Sem notícia'],
};
function conexoes(ctx, c) {
  if (!c) return null;
  const item = (nome, x, extra) => {
    const s = x ? SITUACAO[x.situacao] || (x.ligado === false ? SITUACAO.nunca_ligou : ['neutro', 'Sem informação']) : ['neutro', 'Sem informação'];
    return h('li', { class: 'conx' }, h('p', { class: 'conx-nome' }, nome), selo(s[0], s[1]),
      h('p', { class: 'conx-sub' }, x && x.aviso ? x.aviso : extra || (x && x.ultima_coleta ? 'Números buscados ' + haQuanto(x.ultima_coleta) + '.' : '')));
  };
  const site = c.site || {};
  return h('section', { class: 'cartao' },
    h('header', { class: 'cartao-cab' }, h('h2', null, 'O que alimenta o radar'), h('p', { class: 'sub' }, 'Se uma destas parar, os números ficam incompletos.')),
    h('ul', { class: 'conxs' },
      item('Meta (Facebook e Instagram)', c.meta),
      item('Google Ads', c.google),
      item('WhatsApp', c.whatsapp),
      h('li', { class: 'conx' }, h('p', { class: 'conx-nome' }, 'Site'), selo(site.rastreio ? 'bom' : 'neutro', site.rastreio ? 'Rastreando' : 'Sem rastreio'),
        h('p', { class: 'conx-sub' }, site.rastreio && site.cliques_7d != null ? inteiro(site.cliques_7d) + ' cliques no botão do WhatsApp em 7 dias.' : ''))),
    ehAdmin(ctx.eu && ctx.eu.papel) ? h('a', { class: 'ligacao', href: ctx.hrefDaTela('ajustes') }, 'Mexer nas conexões em Ajustes') : null);
}

function pintar(ctx, d) {
  ctx.demo(Boolean(d.estado && d.estado.demo));
  const r = radar(d.fazer);
  const resumo = r.lista.length
    ? [r.urgentes ? inteiro(r.urgentes) + (r.urgentes === 1 ? ' urgente' : ' urgentes') : null, r.atencao ? inteiro(r.atencao) + ' pedindo atenção' : null, r.leves ? inteiro(r.leves) + ' para ver' : null].filter(Boolean).join(' · ')
    : 'Nenhum aviso agora';
  trocar(ctx.miolo,
    cabeca(ctx, { linha: 'Vigia automático dos anúncios e da oficina', titulo: 'Radar', fonte: false }),
    h('div', { class: 'radar-grade' },
      h('div', { class: 'radar-lado' },
        h('section', { class: 'cartao radar-cartao' },
          h('header', { class: 'cartao-cab' }, h('h2', null, 'Varredura'), h('p', { class: 'sub' }, 'Confere gasto, conversas, respostas e conexões o dia todo.')),
          desenho(r),
          h('p', { class: 'radar-legenda' }, h('span', { class: 'g-alta' }, h('i'), 'urgente'), h('span', { class: 'g-media' }, h('i'), 'atenção'), h('span', { class: 'g-baixa' }, h('i'), 'para ver')),
          h('p', { class: 'radar-resumo' }, resumo)),
        h('section', { class: 'cartao' },
          h('header', { class: 'cartao-cab' }, h('h2', null, 'Como o aviso chega'), h('p', { class: 'sub' }, 'No WhatsApp do dono, quando aparece algo urgente.')),
          whatsapp(r))),
      h('section', { class: 'cartao radar-avisos', 'aria-labelledby': 'tAvisos' },
        h('header', { class: 'cartao-cab' }, h('h2', { id: 'tAvisos' }, 'Avisos'), h('p', { class: 'sub' }, 'O que aconteceu e o que fazer.')),
        r.lista.length
          ? h('ol', { class: 'avisos' }, r.lista.map((a) => aviso(ctx, a)))
          : h('div', { class: 'tudo-certo' }, icone('certo', 'icone-g'), h('p', null, h('b', null, 'Tudo em ordem.'), ' Nenhum anúncio gastando sem trazer conversa e ninguém esperando resposta.')))),
    conexoes(ctx, d.conexoes));
}
