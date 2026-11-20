/* ============================================================================
   Modo apresentação (#/apresentacao?periodo=), de GET /api/relatorios/apresentacao.
   Uma tela por vez, números grandes para a TV da oficina. A casca do app some;
   embaixo ficam Anterior, "2 de 6", Próxima, Passar sozinho, Tela cheia e Sair.
   Teclas: setas, espaço, Home, End; Esc sai. Passar sozinho para ao mexer.
   ============================================================================ */

import { h, icone, trocar, focar } from '../dom.js';
import { valorPorFormato, comparacao, dinheiro, inteiro, ehNumero, periodoValido } from '../formato.js';
import { selo } from '../pecas.js';
import { buscar } from './estados.js';
import { passoDaTecla, proximaSozinha, tempoDaTela, motivoDoVazio, marcaDaApresentacao } from '../relatorios-logica.js';

const LEITURA = { bom: ['bom', 'Bom'], atencao: ['atencao', 'Atenção'], ruim: ['grave', 'Ruim'] };
const PLATAFORMA = { meta: 'Meta', google: 'Google' };

export function mostrar(ctx) {
  const raiz = document.documentElement;
  raiz.classList.add('modo-apresentacao');
  let atual = 0;
  let telas = [];
  let dados = null;
  let relogio = null;
  let sozinha = false;
  let c = ctx;

  const palco = h('div', { class: 'apres-palco' });
  const anuncio = h('p', { class: 'so-leitor', 'aria-live': 'polite' });
  const contador = h('p', { class: 'apres-contador' });
  const bAnterior = h('button', { class: 'botao apres-botao', type: 'button', on: { click: () => ir(atual - 1, true) } }, icone('voltar'), h('span', null, 'Anterior'));
  const bProxima = h('button', { class: 'botao apres-botao', type: 'button', on: { click: () => ir(atual + 1, true) } }, h('span', null, 'Próxima'), icone('seta'));
  const bSozinha = h('button', { class: 'botao apres-botao', type: 'button', 'aria-pressed': 'false', on: { click: () => alternarSozinha() } });
  const bCheia = h('button', { class: 'botao apres-botao', type: 'button', on: { click: telaCheia } }, icone('tela-cheia'), h('span', null, 'Tela cheia'));
  const bSair = h('a', { class: 'botao apres-botao', href: ctx.hrefDaTela('ajustes', { secao: 'relatorios' }) }, icone('fechar'), h('span', null, 'Sair'));
  const controles = h('nav', { class: 'apres-controles', 'aria-label': 'Controles da apresentação' },
    bAnterior, contador, bProxima, bSozinha, typeof document.documentElement.requestFullscreen === 'function' ? bCheia : null, bSair);
  const moldura = h('div', { class: 'apres', role: 'region', 'aria-roledescription': 'apresentação', 'aria-label': 'Modo apresentação' }, palco, anuncio, controles);
  pintarSozinha();

  function aoTeclar(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') {
      if (document.fullscreenElement) return;   // o navegador sai da tela cheia; a segunda vez sai daqui
      e.preventDefault();
      c.ir('ajustes', { secao: 'relatorios' });
      return;
    }
    const alvo = e.target;
    if (e.key === ' ' && alvo && alvo.closest && alvo.closest('button, a')) return;   // espaço num botão é clique
    const proxima = passoDaTecla(e.key, atual, telas.length);
    if (proxima === null) return;
    e.preventDefault();
    ir(proxima, true);
  }
  document.addEventListener('keydown', aoTeclar);

  function carregar(novo) {
    c = novo;
    const periodo = periodoValido(c.rota.params.periodo);
    bSair.setAttribute('href', c.hrefDaTela('ajustes', { secao: 'relatorios' }));
    return buscar(c, 'api/relatorios/apresentacao?periodo=' + periodo, {
      forma: 'painel',
      pintar: (d) => {
        dados = d;
        telas = Array.isArray(d.telas) ? d.telas.filter((t) => t && t.id) : [];
        if (atual >= telas.length) atual = 0;
        trocar(c.miolo, moldura);
        desenhar(false);
        focar(palco);
      },
    });
  }

  function ir(n, pelaPessoa) {
    if (!telas.length) return;
    const proxima = Math.max(0, Math.min(telas.length - 1, n));
    if (pelaPessoa && sozinha) { sozinha = false; pararRelogio(); pintarSozinha(); }
    if (proxima === atual && pelaPessoa) return;
    atual = proxima;
    desenhar(true);
  }

  function desenhar(anunciar) {
    const t = telas[atual];
    if (!t) { trocar(palco, h('p', { class: 'apres-frase' }, 'Nada para mostrar neste período.')); return; }
    trocar(palco, h('section', { class: 'apres-tela', data: { tela: t.id }, 'aria-labelledby': 'apresTitulo' },
      h('p', { class: 'apres-marca' }, marcaDaApresentacao(dados && dados.periodo, t.titulo)),
      h('h1', { class: 'apres-titulo', id: 'apresTitulo' }, t.titulo || ''),
      conteudo(t)));
    contador.textContent = (atual + 1) + ' de ' + telas.length;
    bAnterior.disabled = atual === 0;
    bProxima.disabled = atual === telas.length - 1;
    if (anunciar) anuncio.textContent = 'Tela ' + (atual + 1) + ' de ' + telas.length + ': ' + (t.titulo || '');
    if (sozinha) agendar();
  }

  function conteudo(t) {
    const estado = (dados && dados.estado) || {};
    switch (t.id) {
      case 'resumo':
        return t.frase ? [h('p', { class: 'apres-frase' }, t.frase.texto), t.frase.apoio ? h('p', { class: 'apres-apoio' }, t.frase.apoio) : null] : null;
      case 'numeros':
        return h('div', { class: 'apres-numeros' }, (t.numeros || []).map((n) => {
          const v = valorPorFormato(n.valor, n.formato);
          const comp = v ? comparacao(n) : null;
          return h('div', { class: 'apres-numero' },
            h('p', { class: 'apres-rotulo' }, n.rotulo),
            v ? h('p', { class: 'apres-valor' }, v) : h('p', { class: 'apres-vazio' }, motivoDoVazio(n, estado)),
            comp && comp.direcao ? h('p', { class: 'apres-apoio' }, comp.texto + (comp.detalhe ? ' (' + comp.detalhe + ')' : '')) : null);
        }));
      case 'funil':
        return [h('ol', { class: 'apres-funil' }, (t.etapas || []).map((e) => h('li', { class: 'apres-etapa' },
          h('span', { class: 'apres-valor' }, ehNumero(e.total) ? inteiro(e.total) : 'sem dado'),
          h('span', { class: 'apres-rotulo' }, e.rotulo),
          ehNumero(e.anuncio) ? h('span', { class: 'apres-apoio' }, inteiro(e.anuncio) + ' de anúncio') : null))),
        t.nao_fecharam && t.nao_fecharam.total ? h('p', { class: 'apres-apoio' }, 'Não fecharam: ' + inteiro(t.nao_fecharam.total) + (t.nao_fecharam.motivos && t.nao_fecharam.motivos[0] ? '. O motivo que mais aparece: ' + t.nao_fecharam.motivos[0].rotulo.toLowerCase() + '.' : '.')) : null];
      case 'origens':
        return h('ol', { class: 'apres-lista' }, (t.origens || []).slice(0, 6).map((o) => h('li', { class: 'apres-item' },
          comUnidade(o.contatos),
          h('span', { class: 'apres-item-texto' }, h('span', { class: 'apres-rotulo' }, o.rotulo),
            h('span', { class: 'apres-apoio' }, [ehNumero(o.fecharam) ? inteiro(o.fecharam) + (Math.round(o.fecharam) === 1 ? ' fechou' : ' fecharam') : null, ehNumero(o.faturado) && o.faturado > 0 ? dinheiro(o.faturado) + ' faturados' : null].filter(Boolean).join(', '))))));
      case 'campanhas':
        return (t.campanhas || []).length ? h('ol', { class: 'apres-lista' }, t.campanhas.slice(0, 5).map((cp) => {
          const l = cp.leitura && LEITURA[cp.leitura.tom];
          return h('li', { class: 'apres-item' },
            comUnidade(cp.contatos),
            h('span', { class: 'apres-item-texto' },
              h('span', { class: 'apres-rotulo' }, (cp.nome || 'Campanha') + ' (' + (PLATAFORMA[cp.plataforma] || cp.plataforma || '') + ')'),
              h('span', { class: 'apres-apoio' }, l ? selo(l[0], l[1]) : null, ' ', ehNumero(cp.custo_por_contato) ? dinheiro(cp.custo_por_contato) + ' por contato' : 'sem gasto ligado')));
        })) : h('p', { class: 'apres-frase' }, 'Nenhuma campanha com contato neste período.');
      case 'proximos':
        return (t.itens || []).length ? h('ol', { class: 'apres-lista apres-fazer' }, t.itens.slice(0, 4).map((f, i) => h('li', { class: 'apres-item' },
          h('span', { class: 'apres-valor' }, String(i + 1)),
          h('span', { class: 'apres-item-texto' }, h('span', { class: 'apres-rotulo' }, f.titulo), f.porque ? h('span', { class: 'apres-apoio' }, f.porque) : null))))
          : h('p', { class: 'apres-frase' }, 'Nada pedindo ação agora.');
      default:
        return t.frase ? h('p', { class: 'apres-frase' }, t.frase.texto) : null;
    }
  }

  function agendar() {
    pararRelogio();
    relogio = setTimeout(() => { atual = proximaSozinha(atual, telas.length); desenhar(false); }, tempoDaTela(telas[atual]));
  }
  function pararRelogio() { if (relogio) clearTimeout(relogio); relogio = null; }
  function alternarSozinha() {
    sozinha = !sozinha;
    pintarSozinha();
    if (sozinha) agendar(); else pararRelogio();
  }
  function pintarSozinha() {
    bSozinha.setAttribute('aria-pressed', String(sozinha));
    trocar(bSozinha, icone(sozinha ? 'pausar' : 'tocar'), h('span', null, sozinha ? 'Parar' : 'Passar sozinho'));
  }
  async function telaCheia() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { c.avisar('O navegador não deixou abrir em tela cheia. Use a tecla F11.'); }
  }

  carregar(ctx);
  return {
    atualizar(novo) { carregar(novo); return true; },
    sair() {
      pararRelogio();
      document.removeEventListener('keydown', aoTeclar);
      raiz.classList.remove('modo-apresentacao');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    },
  };
}

/** Número grande com a palavra embaixo: na TV ninguém adivinha que "15" são contatos. */
function comUnidade(n) {
  return h('span', { class: 'apres-valor-caixa' },
    h('span', { class: 'apres-valor' }, ehNumero(n) ? inteiro(n) : 'sem dado'),
    h('span', { class: 'apres-unidade' }, Math.round(n) === 1 ? 'contato' : 'contatos'));
}
