/* ============================================================================
   Mutirão de pendências (GET api/pendencias, contrato §5.3).
   Um contato por vez, a pergunta sempre no mesmo lugar: quanto foi o serviço,
   por que não fechou ou de onde veio. Responde com um toque ou com o teclado
   (1 a 9 escolhe, Enter grava, P pula, Z desfaz), e cada resposta espera
   5 segundos antes de ir para o servidor: dá tempo de desfazer.
   ============================================================================ */

import { h, icone, trocar, focar } from '../dom.js';
import { filtrosDaRota } from '../filtros.js';
import { PENDENCIAS, pendencia, situacao, rotuloDaEtapa } from '../setores.js';
import { dinheiro, inteiro, contagem, dataCurta, dataHora, ehNumero } from '../formato.js';
import { selo, setores, origem as marcaDaOrigem, barra } from '../pecas.js';
import * as Estados from './estados.js';
import { gravarComDesfazer } from './gravar.js';
import { campoDeValor, escolhas, tecla, OPCOES_DE_MOTIVO, OPCOES_DE_ORIGEM, sugestaoDoOrcamento } from './respostas.js';

const TEXTO = {
  sem_valor: {
    resumo: (n) => contagem(n, 'serviço fechado está sem valor', 'serviços fechados estão sem valor') + ' neste período.',
    porque: 'Sem o valor não dá para saber quanto cada anúncio trouxe.',
    feito: (n) => contagem(n, 'valor lançado', 'valores lançados'),
    nada: 'Todo serviço fechado deste período já tem valor.',
  },
  sem_motivo: {
    resumo: (n) => contagem(n, 'contato não fechou e ninguém disse por quê', 'contatos não fecharam e ninguém disse por quê') + '.',
    porque: 'O motivo mostra onde a oficina perde serviço: preço, prazo ou demora para responder.',
    feito: (n) => contagem(n, 'motivo marcado', 'motivos marcados'),
    nada: 'Todo contato que não fechou neste período já tem motivo.',
  },
  sem_origem: {
    resumo: (n) => contagem(n, 'contato chegou e não sabemos de onde', 'contatos chegaram e não sabemos de onde') + '.',
    porque: 'Leia a primeira mensagem: ela costuma dizer se veio de anúncio, de indicação ou da rua.',
    feito: (n) => contagem(n, 'origem marcada', 'origens marcadas'),
    nada: 'Todo contato deste período já tem origem.',
  },
};
const MAXIMO_DE_TRACOS = 60;
/** Tem mouse e teclado de verdade? No toque, focar o campo abre o teclado em cima do contato antes de a pessoa ler. */
const comMouse = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

export function mostrar(ctxInicial, modoDe) {
  let ctx = ctxInicial;
  const tipo = pendencia(filtrosDaRota(ctx.rota.params).pendencia);
  const texto = TEXTO[tipo.id];
  const caminho = 'api/pendencias?periodo=' + ctx.periodo;
  let saiu = false;
  let fila = [];              // contatos que faltam: o primeiro é o da vez
  let feitos = [];            // { item, resumo, valor, chave, estado: 'esperando' | 'gravando' | 'gravado' }
  let total = 0;              // quantos a API disse que existem no período
  const pulados = new Map();  // lead_id → item (pulou nesta rodada)
  let outras = [];            // as outras pendências com fila, para oferecer no fim
  let esperandoLote = false;  // a fila acabou, mas a API tem mais: espera as gravações saírem para buscar
  let campo = null;           // o campo de dinheiro da vez (para o foco e os atalhos)
  let opcoesDaVez = null;     // as escolhas numeradas da vez

  const el = {
    resumo: h('p', { class: 'fila-resumo' }),
    progresso: h('div', { class: 'fila-progresso' }),
    vez: h('section', { class: 'fila-vez' }),
    feitos: h('section', { class: 'fila-feitos', hidden: true }),
  };
  const hrefDaJornada = () => ctx.hrefDaTela('jornada');
  const raiz = h('div', { class: 'fila' },
    h('header', { class: 'fila-topo' },
      h('a', { class: 'ligacao', href: hrefDaJornada() }, icone('voltar'), 'Jornada'),
      h('h1', { class: 'titulo-tela' }, tipo.verbo),
      el.resumo,
      el.progresso),
    el.vez,
    el.feitos);

  const nomeDe = (item) => item.nome || 'Sem nome';
  const resolvidos = () => feitos.length;

  /* ------------------------------ progresso ------------------------------ */
  function pintarProgresso() {
    const n = resolvidos();
    if (!total) { trocar(el.progresso); return; }
    const frase = h('p', { class: 'fila-conta' }, h('strong', { class: 'numero' }, inteiro(n)), ' de ' + inteiro(total) + (n === 1 ? ' resolvido' : ' resolvidos'),
      pulados.size ? h('span', { class: 'apoio' }, ' · ' + contagem(pulados.size, 'pulado', 'pulados')) : null);
    const desenho = total <= MAXIMO_DE_TRACOS
      ? h('span', { class: 'setores setores-p fila-tracos', 'aria-hidden': 'true' },
        Array.from({ length: total }, (_, i) => h('span', { class: 'setor', data: { estado: i < n ? 'feito' : i === n && fila.length ? 'atual' : 'vazio', tom: 'espera' } })))
      : barra([{ v: n / total }], 'barra-g');
    trocar(el.progresso, desenho, frase);
  }

  /* ------------------------------ o contato da vez ------------------------------ */
  function contexto(item) {
    const s = situacao(item);
    const d = item.desfecho || {};
    const linhas = [];
    const quando = d.em ? dataCurta(d.em) : null;
    if (tipo.id === 'sem_valor') linhas.push(['Fechou', quando ? 'em ' + quando : 'sem data registrada']);
    if (tipo.id === 'sem_motivo') {
      linhas.push(['Parou em', rotuloDaEtapa(item.etapa_atual) || 'sem etapa registrada']);
      const orcado = sugestaoDoOrcamento(item);
      if (orcado) linhas.push(['Orçamento', dinheiro(orcado.valor)]);
      if (quando) linhas.push(['Marcado como não fechou', 'em ' + quando]);
    }
    if (tipo.id === 'sem_origem') linhas.push(['Situação', s.texto + (s.detalhe ? ', ' + s.detalhe : '')]);
    linhas.push(['Chegou', dataHora(item.chegou_em) || 'sem data registrada']);
    if (tipo.id !== 'sem_origem') linhas.push(['De onde veio', marcaDaOrigem(item.origem)]);
    if (item.responsavel) linhas.push(['Com', item.responsavel]);
    return h('dl', { class: 'fatos fila-fatos' }, linhas.map(([rotulo, valor]) => h('div', { class: 'fato' }, h('dt', null, rotulo), h('dd', null, valor))));
  }

  function resposta(item) {
    campo = null;
    opcoesDaVez = null;
    if (tipo.id === 'sem_valor') {
      campo = campoDeValor({
        rotulo: 'Valor do serviço de ' + nomeDe(item), sugestao: sugestaoDoOrcamento(item), atalhoDaSugestao: true,
        aoGravar: (valor) => responder(item, { tipo: 'valor', corpo: { valor }, resumo: dinheiro(valor), valor, aviso: dinheiro(valor) + ' lançado para ' + nomeDe(item) + '.' }),
      });
      return campo.no;
    }
    const opcoes = tipo.id === 'sem_motivo' ? OPCOES_DE_MOTIVO : OPCOES_DE_ORIGEM;
    opcoesDaVez = opcoes;
    return escolhas({
      nome: tipo.pergunta, opcoes, numeradas: true,
      aoEscolher: (o) => responder(item, {
        tipo: tipo.id === 'sem_motivo' ? 'motivo' : 'origem',
        corpo: tipo.id === 'sem_motivo' ? { motivo: o.id } : { canal: o.id },
        resumo: o.rotulo, aviso: nomeDe(item) + ': ' + o.rotulo.toLowerCase() + '.',
      }),
    });
  }

  /** foco: 'campo' (vai para o campo de dinheiro, se houver), 'titulo' (anuncia o próximo nome) ou null (não mexe). */
  function pintarVez({ foco = 'titulo' } = {}) {
    pintarProgresso();
    const item = fila[0];
    if (!item) { pintarFim(); return; }
    esperandoLote = false;
    const titulo = h('h2', { class: 'titulo-bloco fila-nome', tabindex: '-1' }, nomeDe(item));
    trocar(el.vez,
      h('div', { class: 'fila-quem' },
        titulo,
        h('p', { class: 'fila-carro' }, [item.carro, item.servico].filter(Boolean).join(' · ') || 'Carro e serviço não informados',
          item.telefone_final ? h('span', { class: 'apoio' }, ' · telefone final ' + item.telefone_final) : null),
        h('div', { class: 'fila-setores' }, setores(item)),
        contexto(item),
        tipo.id === 'sem_origem' && item.primeira_mensagem
          ? h('figure', { class: 'detalhe-mensagem' }, h('figcaption', { class: 'apoio' }, 'Primeira mensagem do cliente'), h('blockquote', null, item.primeira_mensagem))
          : null),
      h('div', { class: 'fila-pergunta' },
        h('p', { class: 'fila-pergunta-texto' }, tipo.pergunta),
        resposta(item),
        h('div', { class: 'fila-apoio' },
          h('button', { class: 'botao', type: 'button', on: { click: pular } }, tecla('P'), 'Pular'),
          h('a', { class: 'ligacao', href: ctx.hrefDaTela('jornada', { pendencia: tipo.id, modo: 'lista', contato: item.lead_id }) }, 'Ver o contato inteiro'))));
    if (foco === 'campo' && campo) campo.focar();
    else if (foco) focar(titulo);
  }

  /* ------------------------------ respostas ------------------------------ */
  function responder(item, { tipo: acao, corpo, resumo, valor = null, aviso }) {
    if (fila[0] !== item) return;
    const noCampo = Boolean(campo && document.activeElement === campo.campo);
    fila.shift();
    pulados.delete(item.lead_id);
    const feito = { item, resumo, valor, chave: null, estado: 'esperando' };
    feitos.unshift(feito);
    feito.chave = gravarComDesfazer(ctx, {
      lead: item.lead_id, tipo: acao, corpo, texto: aviso,
      aoConfirmar: (r) => {
        feito.estado = 'gravado';
        if (r && r.aviso) ctx.avisar(r.aviso, { duracao: 9000 });
        if (!saiu) { pintarFeitos(); aoEsvaziar(); }
      },
      aoDesfazer: () => devolver(feito, { naFrente: true }),
      aoFalhar: () => devolver(feito, { naFrente: false }),
    });
    pintarVez({ foco: comMouse() || noCampo ? 'campo' : 'titulo' });
    pintarFeitos();
  }

  /** A resposta não valeu (a pessoa desfez ou o servidor recusou): o contato volta para a fila. */
  function devolver(feito, { naFrente }) {
    feitos = feitos.filter((f) => f !== feito);
    if (saiu) return;
    const eraFim = fila.length === 0;
    if (naFrente) fila.unshift(feito.item); else fila.push(feito.item);
    pintarFeitos();
    if (naFrente || eraFim) pintarVez({ foco: comMouse() ? 'campo' : 'titulo' }); else pintarProgresso();
  }

  function pular() {
    const item = fila.shift();
    if (!item) return;
    pulados.set(item.lead_id, item);
    pintarVez({ foco: comMouse() ? 'campo' : 'titulo' });
  }

  function desfazerUltimo() {
    const ultimo = feitos.find((f) => f.estado === 'esperando');
    if (ultimo) { ctx.fecharAviso(); ctx.desfazer.desfazer(ultimo.chave); }
  }

  function pintarFeitos() {
    el.feitos.hidden = !feitos.length;
    if (!feitos.length) return;
    trocar(el.feitos,
      h('h2', { class: 'titulo-p' }, 'Feitos nesta rodada'),
      h('ol', { class: 'fila-lista' }, feitos.map((f) => h('li', { class: 'fila-feito' },
        h('span', { class: 'fila-feito-nome corta' }, nomeDe(f.item)),
        h('span', { class: 'fila-feito-resumo' }, f.resumo),
        f.estado === 'esperando'
          ? h('button', { class: 'botao', type: 'button', 'aria-label': 'Desfazer a resposta de ' + nomeDe(f.item), on: { click: () => { ctx.fecharAviso(); ctx.desfazer.desfazer(f.chave); } } }, icone('desfazer'), 'Desfazer')
          : f.estado === 'gravando' ? selo('espera', 'gravando') : selo('bom', 'gravado')))));
  }

  /* ------------------------------ fim da fila ------------------------------ */
  const haMaisNoServidor = () => total > resolvidos() + pulados.size;

  function pintarFim() {
    campo = null;
    opcoesDaVez = null;
    if (haMaisNoServidor()) {
      // A fila veio em lote de até 30: os próximos só chegam certos depois que as respostas saírem.
      esperandoLote = true;
      Estados.esqueleto(el.vez, 'painel');
      aoEsvaziar();
      return;
    }
    const n = resolvidos();
    const soma = tipo.id === 'sem_valor' ? feitos.reduce((s, f) => s + (ehNumero(f.valor) ? f.valor : 0), 0) : 0;
    const proxima = outras.find((o) => o.n > 0);
    const titulo = h('h2', { class: 'titulo-bloco', tabindex: '-1' }, n ? texto.feito(n) : pulados.size ? 'Nada foi gravado' : 'Nada para resolver aqui');
    trocar(el.vez,
      h('div', { class: 'fila-fim' },
        titulo,
        h('p', null,
          !n && !pulados.size ? texto.nada : null,
          n && soma > 0 ? 'Somam ' + dinheiro(soma) + '. ' : null,
          pulados.size ? contagem(pulados.size, 'contato ficou para depois', 'contatos ficaram para depois') + '.' : n ? 'A fila deste período acabou.' : null),
        h('div', { class: 'fila-fim-botoes' },
          proxima ? h('a', { class: 'botao botao-forte botao-g', href: ctx.hrefDaTela('jornada', { pendencia: proxima.id }) }, proxima.verbo + ' (' + inteiro(proxima.n) + ')', icone('seta', 'icone-seta')) : null,
          pulados.size ? h('button', { class: 'botao botao-g', type: 'button', on: { click: reverPulados } }, 'Rever os pulados') : null,
          h('a', { class: proxima ? 'botao botao-g' : 'botao botao-forte botao-g', href: hrefDaJornada() }, 'Voltar para a Jornada'))));
    focar(titulo);
  }

  function reverPulados() {
    fila = [...pulados.values()];
    pulados.clear();
    pintarVez({ foco: comMouse() ? 'campo' : 'titulo' });
  }

  /** Quando nenhuma resposta está mais esperando, busca o próximo lote (se a fila acabou e a API tem mais). */
  function aoEsvaziar() {
    if (saiu || !esperandoLote || fila.length) return;
    if (feitos.some((f) => f.estado !== 'gravado')) return;
    esperandoLote = false;
    carregar({ continuar: true });
  }

  /* ------------------------------ carga ------------------------------ */
  async function carregar({ continuar = false } = {}) {
    if (!continuar) Estados.esqueleto(el.vez, 'painel');
    el.vez.setAttribute('aria-busy', 'true');
    try {
      const lido = await ctx.leitor.ler(caminho, { forcar: true });
      if (saiu) return;
      const p = lido.dados || {};
      const grupo = p[tipo.id] || { n: 0, itens: [] };
      const jaFeitos = new Set(feitos.map((f) => f.item.lead_id));
      fila = (grupo.itens || []).filter((i) => !pulados.has(i.lead_id) && !jaFeitos.has(i.lead_id));
      // O total da rodada é o que existia ao abrir; num lote seguinte, o que já foi feito não conta de novo.
      total = continuar ? Math.max(total, resolvidos() + (ehNumero(grupo.n) ? grupo.n : 0)) : (ehNumero(grupo.n) ? grupo.n : fila.length);
      if (!fila.length && haMaisNoServidor()) total = resolvidos() + pulados.size;   // a API não mandou mais nada: a conta fecha aqui
      outras = PENDENCIAS.filter((x) => x.fila && x.id !== tipo.id).map((x) => ({ ...x, n: p[x.id] && ehNumero(p[x.id].n) ? p[x.id].n : 0 }));
      ctx.marcarAtualizado(lido.em);
      el.resumo.textContent = total ? texto.resumo(total) + ' ' + texto.porque : '';
      pintarVez({ foco: comMouse() ? 'campo' : continuar ? 'titulo' : null });
      pintarFeitos();
    } catch (erro) {
      if (saiu) return;
      if (!(erro && erro.name === 'ErroApi')) console.error(erro);
      Estados.falha(el.vez, { mensagem: Estados.fraseDoErro(erro), aoTentar: () => carregar({ continuar }), nivel: 'h2' });
    } finally {
      if (!saiu) el.vez.removeAttribute('aria-busy');
    }
  }

  /* ------------------------------ teclado ------------------------------ */
  function aoTeclar(e) {
    if (saiu || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const alvo = e.target;
    if (alvo && alvo.closest && alvo.closest('.casca, .menu, .sessao, .navbaixo, .toast')) return;
    const letra = e.key.length === 1 ? e.key.toLowerCase() : '';
    const emCampo = alvo && alvo.matches && alvo.matches('input, textarea, select');
    if (emCampo && !(campo && alvo === campo.campo)) return;
    // No campo de dinheiro as letras não são valor: viram atalho. Fora dele, os números escolhem.
    if (letra === 'p' && fila.length) { e.preventDefault(); pular(); return; }
    if (letra === 'z') { e.preventDefault(); desfazerUltimo(); return; }
    if (letra === 'u' && campo && campo.usarSugestao) { e.preventDefault(); campo.usarSugestao(); return; }
    if (!emCampo && opcoesDaVez && letra >= '1' && letra <= '9') {
      const botao = el.vez.querySelectorAll('.escolha')[Number(letra) - 1];
      if (botao) { e.preventDefault(); botao.click(); }
    }
  }
  document.addEventListener('keydown', aoTeclar);

  // Resposta que saiu da espera (os 5 segundos passaram) deixa de poder ser desfeita: a lista mostra "gravando".
  const pararDeOuvir = ctx.aoMudarDesfazer((pendentes) => {
    if (saiu) return;
    const esperando = new Set(pendentes.map((p) => p.id));
    let mudou = false;
    for (const f of feitos) if (f.estado === 'esperando' && !esperando.has(f.chave)) { f.estado = 'gravando'; mudou = true; }
    if (mudou) pintarFeitos();
  });

  trocar(ctx.miolo, raiz);
  carregar();

  return {
    atualizar(novo) {
      if (modoDe(novo.rota) !== 'fila') return false;
      if (filtrosDaRota(novo.rota.params).pendencia !== tipo.id || novo.periodo !== ctx.periodo) return false;
      ctx = novo;
      return true;
    },
    sair() {
      saiu = true;
      document.removeEventListener('keydown', aoTeclar);
      pararDeOuvir();
      ctx.fecharAviso();
      ctx.desfazer.confirmarTudo();
    },
  };
}
