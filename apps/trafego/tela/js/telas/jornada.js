/* ============================================================================
   Tela Jornada: a torre de tempos. GET api/jornada (contrato §5.3).
   Uma linha por contato, colunas fixas e os mini-setores mostrando até onde
   cada um chegou. Filtros no polegar, busca, detalhe ao lado (no celular, no
   lugar da lista) e a porta de entrada do mutirão de pendências.
   O endereço guarda filtros, página e contato aberto: dá para mandar o link.
   ============================================================================ */

import { h, icone, trocar, $$, soLeitor } from '../dom.js';
import { montarRota, comParametros } from '../rotas.js';
import { filtrosDaRota, parametrosDaRota, consultaDaApi, mudar, alternar, contarAtivos, filtrosLigados, paginas, DESFECHOS, ORDENS } from '../filtros.js';
import { ETAPAS, PENDENCIAS, pendencia, situacao } from '../setores.js';
import { dinheiro, inteiro, contagem, dataCurta, ehNumero, PERIODO_PADRAO } from '../formato.js';
import { selo, setores, origem as marcaDaOrigem, vazio } from '../pecas.js';
import * as Estados from './estados.js';
import { mostrarAviso } from '../aviso.js';
import * as Detalhe from './detalhe.js';
import * as Fila from './fila.js';

/** Pendência que se resolve em fila abre o mutirão; o resto (e quem pediu "ver na lista") abre a torre. */
export function modoDe(rota) {
  const p = pendencia(filtrosDaRota(rota.params).pendencia);
  return p && p.fila && rota.params.modo !== 'lista' && !rota.params.contato ? 'fila' : 'lista';
}

export function mostrar(ctx) {
  return modoDe(ctx.rota) === 'fila' ? Fila.mostrar(ctx, modoDe) : torreDeContatos(ctx);
}

const estreito = () => typeof matchMedia === 'function' && matchMedia('(max-width: 61.99em)').matches;
const NOME_DA_PENDENCIA = { sem_valor: 'sem valor', sem_motivo: 'sem motivo', sem_origem: 'sem origem', sem_resposta: 'esperando resposta' };

function torreDeContatos(ctxInicial) {
  let ctx = ctxInicial;
  let saiu = false, vezLista = 0, consultaPedida = null, paginaPedida = 1, contatoAberto = '', detalhe = null, rolagem = 0, relogioDaBusca = null;
  const filtros = () => filtrosDaRota(ctx.rota.params);

  /* --- moldura fixa: só a lista e o detalhe são repintados quando o endereço muda --- */
  const opcao = (valor, rotulo) => h('option', { value: valor }, rotulo);
  const selects = {
    canal: h('select', { name: 'canal' }, opcao('', 'Todas as origens')),
    campanha: h('select', { name: 'campanha' }, opcao('', 'Todas as campanhas')),
    etapa: h('select', { name: 'etapa' }, opcao('', 'Qualquer etapa'), ETAPAS.map((e) => opcao(e.id, e.rotulo))),
    ordem: h('select', { name: 'ordem' }, ORDENS.map((o) => opcao(o.id, o.rotulo))),
  };
  const el = {
    resumo: h('p', { class: 'jornada-resumo' }),
    conversas: h('p', { class: 'apoio jornada-conversas', hidden: true }),
    pendencias: h('nav', { class: 'pendencias', 'aria-label': 'Pendências para resolver', hidden: true }),
    busca: h('input', { type: 'search', name: 'q', placeholder: 'Nome, telefone, placa ou carro', 'aria-label': 'Buscar contato por nome, telefone, placa ou carro', autocomplete: 'off', enterkeyhint: 'search', maxlength: '80' }),
    desfechos: h('div', { class: 'fichas', role: 'group', 'aria-label': 'Como terminou' }),
    anuncio: h('button', { class: 'ficha', type: 'button', 'aria-pressed': 'false' }, h('span', { class: 'marca-anuncio', 'aria-hidden': 'true' }), 'Só de anúncio'),
    contagemMais: h('span', { class: 'ficha-n', hidden: true }),
    ligados: h('p', { class: 'jornada-ligados', hidden: true }),
    lista: h('div', { class: 'jornada-lista' }),
    detalhe: h('aside', { class: 'jornada-detalhe', 'aria-label': 'Contato aberto', tabindex: '-1', hidden: true }),
  };
  el.mais = h('details', { class: 'jornada-mais' },
    h('summary', { class: 'ficha' }, icone('filtro'), 'Mais filtros', el.contagemMais),
    h('div', { class: 'jornada-campos' },
      h('label', { class: 'campo' }, h('span', null, 'Origem'), selects.canal),
      h('label', { class: 'campo' }, h('span', null, 'Campanha'), selects.campanha),
      h('label', { class: 'campo' }, h('span', null, 'Etapa em que está'), selects.etapa),
      h('label', { class: 'campo' }, h('span', null, 'Ordem da lista'), selects.ordem)));
  const raiz = h('div', { class: 'jornada' },
    h('div', { class: 'jornada-cabeca' },
      h('header', { class: 'jornada-topo' }, h('h1', { class: 'titulo-tela' }, 'Jornada'), el.resumo, el.conversas),
      el.pendencias),
    h('form', { class: 'jornada-filtros', role: 'search', on: { submit: (e) => { e.preventDefault(); buscarJa(); } } },
      h('label', { class: 'busca' }, icone('busca'), el.busca),
      h('div', { class: 'jornada-fichas' }, el.desfechos, el.anuncio),
      el.mais),
    el.ligados,
    h('div', { class: 'jornada-corpo' }, el.lista, el.detalhe));
  trocar(ctx.miolo, raiz);

  /* --- ir para um novo conjunto de filtros (o endereço manda; a tela obedece) --- */
  function irCom(novos, { substituir = false } = {}) {
    const params = parametrosDaRota(novos);
    if (ctx.periodo !== PERIODO_PADRAO) params.periodo = ctx.periodo;
    const p = pendencia(novos.pendencia);
    if (p && p.fila) params.modo = 'lista';
    if (ctx.rota.params.contato) params.contato = ctx.rota.params.contato;
    ctx.ir('jornada', params, { substituir });
  }
  const limparTudo = () => { el.busca.value = ''; irCom(filtrosDaRota({})); };
  function buscarJa() {
    clearTimeout(relogioDaBusca);
    if (el.busca.value.trim() !== filtros().q) irCom(mudar(filtros(), { q: el.busca.value }), { substituir: true });
  }
  el.busca.addEventListener('input', () => { clearTimeout(relogioDaBusca); relogioDaBusca = setTimeout(buscarJa, 350); });
  el.busca.addEventListener('search', buscarJa);
  el.anuncio.addEventListener('click', () => irCom(alternar(filtros(), 'paga', '1')));
  for (const [chave, select] of Object.entries(selects)) select.addEventListener('change', () => irCom(mudar(filtros(), { [chave]: select.value })));
  for (const d of DESFECHOS) {
    el.desfechos.appendChild(h('button', { class: 'ficha', type: 'button', 'aria-pressed': 'false', data: { id: d.id }, on: { click: () => irCom(mudar(filtros(), { desfecho: d.id })) } },
      d.rotulo, h('span', { class: 'ficha-n', hidden: true })));
  }
  // Quem abriu o contato pelo "Ver o contato inteiro" da fila volta para a fila (antes caía numa lista que nunca viu).
  const veioDaFila = () => ctx.rota.params.volta === 'fila';
  const fecharContato = () => ctx.ir('jornada', comParametros(ctx.rota.params, veioDaFila() ? { contato: '', modo: '', volta: '' } : { contato: '' }));
  el.detalhe.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (e.target && e.target.matches && e.target.matches('input, select, textarea')) return;
    fecharContato();
  });

  /* --- pintura --- */
  let opcoes = {};   // o bloco `filtros` da última resposta (rótulos e contagens de canal, campanha e desfecho)
  function pintarControles(f) {
    if (document.activeElement !== el.busca) el.busca.value = f.q;
    const contagens = new Map((opcoes.desfechos || []).map((x) => [x.id, x.n]));
    const total = [...contagens.values()].reduce((a, b) => a + b, 0);
    for (const b of $$('.ficha', el.desfechos)) {
      b.setAttribute('aria-pressed', String(b.dataset.id === f.desfecho));
      const n = b.querySelector('.ficha-n');
      const valor = !contagens.size ? null : b.dataset.id ? contagens.get(b.dataset.id) || 0 : total;
      n.hidden = !ehNumero(valor);
      if (ehNumero(valor)) n.textContent = inteiro(valor);
    }
    el.anuncio.setAttribute('aria-pressed', String(f.paga === '1'));
    trocar(selects.canal, opcao('', 'Todas as origens'), (opcoes.canais || []).map((c) => opcao(c.id, c.rotulo + ' (' + inteiro(c.n) + ')')));
    trocar(selects.campanha, opcao('', 'Todas as campanhas'), (opcoes.campanhas || []).map((c) => opcao(c.ext, c.nome + ' (' + inteiro(c.n) + ')')));
    // Filtro que veio pelo endereço e não está (ou ainda não está) nas opções continua aparecendo como escolhido.
    if (f.canal && !(opcoes.canais || []).some((c) => c.id === f.canal)) selects.canal.appendChild(opcao(f.canal, 'Origem escolhida'));
    if (f.campanha && !(opcoes.campanhas || []).some((c) => c.ext === f.campanha)) selects.campanha.appendChild(opcao(f.campanha, 'Campanha escolhida'));
    for (const [chave, select] of Object.entries(selects)) select.value = f[chave] || (chave === 'ordem' ? 'recentes' : '');
    const escondidos = ['canal', 'campanha', 'etapa'].filter((c) => f[c]).length + (f.ordem !== 'recentes' ? 1 : 0);
    el.contagemMais.hidden = !escondidos;
    el.contagemMais.textContent = String(escondidos);
    if (escondidos) el.mais.open = true;

    const ligados = filtrosLigados(f, opcoes);
    el.ligados.hidden = !ligados.length;
    if (ligados.length) {
      trocar(el.ligados, h('span', { class: 'apoio' }, 'Filtrando por'),
        ligados.map((x) => h('button', { class: 'ficha ficha-tira', type: 'button', 'aria-label': 'Tirar o filtro ' + x.rotulo, on: { click: () => { if (x.chave === 'q') el.busca.value = ''; irCom(mudar(filtros(), { [x.chave]: '' })); } } },
          h('span', { class: 'corta' }, x.rotulo), icone('fechar', 'icone-p'))),
        ligados.length > 1 ? h('button', { class: 'ligacao', type: 'button', on: { click: limparTudo } }, 'Limpar tudo') : null);
    }
  }

  function pintarResumo(d, f) {
    const t = d.totais || {};
    const filtrado = contarAtivos(f) > 0;
    const resto = [];
    if (ehNumero(t.de_anuncio)) resto.push(inteiro(t.de_anuncio) + ' de anúncio');
    if (ehNumero(t.fecharam)) resto.push(contagem(t.fecharam, 'fechou', 'fecharam'));
    if (ehNumero(t.nao_fecharam)) resto.push(contagem(t.nao_fecharam, 'não fechou', 'não fecharam'));
    if (ehNumero(t.abertos)) resto.push(inteiro(t.abertos) + ' em aberto');
    trocar(el.resumo,
      ehNumero(t.contatos) ? h('strong', null, contagem(t.contatos, 'contato', 'contatos')) : null,
      ehNumero(t.contatos) && filtrado ? ' com estes filtros' : null,
      ehNumero(t.contatos) && t.contatos > 0 && resto.length ? ': ' + resto.join(', ') + '.' : null);
    // Achado da rodada: nem toda conversa do WhatsApp vira contato. A tela põe os dois números lado a lado.
    const mostra = !filtrado && ehNumero(t.conversas_novas) && ehNumero(t.contatos);
    el.conversas.hidden = !mostra;
    if (mostra) {
      el.conversas.textContent = contagem(t.conversas_novas, 'conversa nova chegou', 'conversas novas chegaram') + ' no WhatsApp neste período'
        + (ehNumero(t.conversas_novas_anuncio) ? ', ' + inteiro(t.conversas_novas_anuncio) + ' de anúncio' : '')
        + '. Aqui aparecem só as que viraram contato cadastrado.';
    }
  }

  function pintarPendencias(p) {
    const itens = PENDENCIAS.map((x) => ({ ...x, n: p && p[x.id] ? p[x.id].n : null })).filter((x) => ehNumero(x.n) && x.n > 0);
    el.pendencias.hidden = !itens.length;
    if (!itens.length) return;
    trocar(el.pendencias,
      h('h2', { class: 'titulo-p' }, 'Para resolver'),
      h('ul', { class: 'pendencias-lista' }, itens.map((x) => h('li', null,
        h('a', { class: 'pendencia', href: ctx.hrefDaTela('jornada', { pendencia: x.id }) },
          h('span', { class: 'numero' }, inteiro(x.n)), ' ', h('span', { class: 'rotulo' }, NOME_DA_PENDENCIA[x.id]), soLeitor('. ' + x.verbo), icone('seta', 'icone-seta'))))));
  }

  const hrefDoContato = (id) => montarRota('jornada', comParametros(ctx.rota.params, { contato: id }));

  function linha(item, i = 0) {
    const s = situacao(item);
    const d = item.desfecho || {};
    const valor = d.tipo === 'fechou'
      ? (ehNumero(d.valor) ? h('span', { class: 'numero' }, dinheiro(d.valor)) : selo('atencao', 'sem valor'))
      : null;
    const detalheDaSituacao = s.tipo === 'fechou' ? null
      : s.pede === 'motivo' ? selo('atencao', s.detalhe)
        : s.detalhe ? h('span', { class: 'apoio' }, s.detalhe) : null;
    return h('div', { class: 'torre-linha', role: 'row', 'aria-current': item.lead_id === contatoAberto ? 'true' : null, data: { id: item.lead_id } },
      h('div', { class: 'torre-celula jl-contato', role: 'cell' },
        h('a', { class: 'torre-abre corta', href: hrefDoContato(item.lead_id) }, item.nome || 'Sem nome'),
        h('span', { class: 'apoio corta' }, [item.carro, item.servico].filter(Boolean).join(' · ') || 'Carro e serviço não informados')),
      h('div', { class: 'torre-celula jl-origem', role: 'cell' }, marcaDaOrigem(item.origem),
        item.origem && item.origem.detalhe ? h('span', { class: 'apoio corta' }, item.origem.detalhe) : null),
      h('div', { class: 'torre-celula jl-setores', role: 'cell' }, setores(item, { atraso: Math.min(i, 14) * 34 })),
      h('div', { class: 'torre-celula jl-situacao', role: 'cell' }, selo(s.tom, s.texto), detalheDaSituacao),
      h('div', { class: 'torre-celula jl-valor torre-direita', role: 'cell' }, valor),
      h('div', { class: 'torre-celula jl-chegou torre-direita', role: 'cell' }, h('span', { class: 'so-leitor' }, 'chegou em '), dataCurta(item.chegou_em)));
  }

  function paginacao(pg) {
    if (pg.ultima <= 1) return null;
    const href = (n) => montarRota('jornada', comParametros(ctx.rota.params, { pagina: n > 1 ? n : '', contato: '' }));
    return h('nav', { class: 'paginacao', 'aria-label': 'Páginas da lista' },
      h('span', { class: 'apoio' }, 'Mostrando ' + inteiro(pg.de) + ' a ' + inteiro(pg.ate) + ' de ' + inteiro(pg.total) + '.'),
      pg.temAnterior ? h('a', { class: 'botao', href: href(pg.atual - 1), rel: 'prev' }, icone('voltar'), 'Anteriores') : null,
      pg.temProxima ? h('a', { class: 'botao', href: href(pg.atual + 1), rel: 'next' }, 'Próximos', icone('seta', 'icone-seta')) : null);
  }

  function pintar(d, primeira) {
    const f = filtros();
    opcoes = d.filtros || {};
    ctx.demo(Boolean(d.estado && d.estado.demo));
    mostrarAviso(ctx, d.estado);
    pintarControles(f);
    pintarResumo(d, f);
    const itens = d.itens || [];
    if (!itens.length) {
      const filtrado = contarAtivos(f) > 0;
      trocar(el.lista, vazio(filtrado
        ? { titulo: 'Nenhum contato com estes filtros', texto: 'Tire um filtro ou troque o período lá em cima.', acao: h('button', { class: 'botao', type: 'button', on: { click: limparTudo } }, 'Limpar os filtros') }
        : { titulo: 'Nenhum contato neste período', texto: 'Quando alguém chamar no WhatsApp, preencher o formulário do site ou for cadastrado no CRM, aparece aqui com o caminho inteiro: de onde veio, até onde chegou e como terminou.' }));
      return;
    }
    const acender = primeira && ctx.estreia('jornada');
    trocar(el.lista,
      h('div', { class: 'torre torre-jornada' + (acender ? ' acender' : ''), role: 'table', 'aria-label': 'Contatos do período' },
        h('div', { class: 'torre-cabeca', role: 'row' },
          h('span', { role: 'columnheader' }, 'Contato'), h('span', { role: 'columnheader', class: 'jl-origem' }, 'De onde veio'), h('span', { role: 'columnheader' }, 'Etapas'),
          h('span', { role: 'columnheader' }, 'Situação'), h('span', { role: 'columnheader', class: 'torre-direita' }, 'Valor'), h('span', { role: 'columnheader', class: 'torre-direita jl-chegou' }, 'Chegou')),
        itens.map(linha)),
      paginacao(paginas(d.pagina)));
  }

  function carregar(consulta) {
    const minha = ++vezLista;
    const vivo = () => !saiu && minha === vezLista;
    const mesma = consulta === consultaPedida;
    const mudouPagina = !mesma && filtros().pagina !== paginaPedida;
    consultaPedida = consulta;
    paginaPedida = filtros().pagina;
    Estados.buscar(ctx, 'api/jornada?' + consulta, { alvo: el.lista, forma: 'lista', vivo, manter: true, mesma, pintar: (d, { primeira }) => pintar(d, primeira) })
      .then(() => { if (vivo() && mudouPagina && !contatoAberto) raiz.querySelector('.jornada-corpo').scrollIntoView({ block: 'start' }); });
    // Contagem das pendências do período inteiro (sem filtro): é a porta do mutirão.
    ctx.leitor.ler('api/pendencias?periodo=' + ctx.periodo, { forcar: ctx.forcar })
      .then((r) => { if (vivo()) pintarPendencias(r.dados); })
      .catch(() => { /* a faixa de pendências é apoio: sem ela a lista funciona igual */ });
  }

  /** Troca só a linha de um contato (o detalhe avisa o que acabou de mudar, antes mesmo de gravar). */
  function reverLinha(item) {
    if (saiu || !item) return;
    const velha = el.lista.querySelector('.torre-linha[data-id="' + CSS.escape(item.lead_id) + '"]');
    if (!velha) return;
    const nova = linha(item);
    nova.querySelector('.jl-situacao').classList.add('cravar');
    velha.replaceWith(nova);
  }

  function abrirOuFechar(id) {
    if (id === contatoAberto) return;
    const anterior = contatoAberto;
    contatoAberto = id;
    if (detalhe) { detalhe.sair(); detalhe = null; }
    raiz.toggleAttribute('data-aberto', Boolean(id));
    el.detalhe.hidden = !id;
    for (const l of $$('.torre-linha', el.lista)) { if (l.dataset.id === id) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current'); }
    if (id) {
      if (!anterior) rolagem = window.scrollY;
      detalhe = Detalhe.abrir(() => ctx, el.detalhe, id, {
        aoFechar: fecharContato,
        rotuloDaVolta: veioDaFila() ? 'Voltar para a fila' : 'Voltar para a lista',
        aoPrever: reverLinha,
        aoMudar: () => { if (!saiu && consultaPedida) carregar(consultaPedida); },
      });
      if (estreito()) window.scrollTo(0, 0);
      el.detalhe.focus({ preventScroll: true });
    } else if (anterior) {
      if (estreito()) window.scrollTo(0, rolagem);
      const link = el.lista.querySelector('.torre-linha[data-id="' + CSS.escape(anterior) + '"] .torre-abre');
      if (link) link.focus({ preventScroll: true });
    }
  }

  function aplicar() {
    const f = filtros();
    const consulta = consultaDaApi(f, ctx.periodo);
    pintarControles(f);
    if (consulta !== consultaPedida) carregar(consulta);
    abrirOuFechar(ctx.rota.params.contato || '');
  }
  aplicar();

  return {
    atualizar(novo) {
      if (modoDe(novo.rota) !== 'lista') return false;
      ctx = novo;
      aplicar();
      return true;
    },
    sair() {
      saiu = true;
      clearTimeout(relogioDaBusca);
      if (detalhe) detalhe.sair();
      ctx.desfazer.confirmarTudo();
    },
  };
}
