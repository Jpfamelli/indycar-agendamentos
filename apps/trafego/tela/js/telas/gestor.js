/* ============================================================================
   Tela Gestor IA: o engenheiro no rádio.
   POST api/gestor/perguntar responde em fluxo (texto, ferramenta, proposta,
   fim, erro); a tela mostra o que ele está olhando, deixa parar no meio e
   guarda o que já chegou se a conversa cair. A resposta entra só por nó de
   texto (formatacao.js): parágrafo, lista e negrito, nada de HTML.
   Ao lado: o que pede decisão (aceitar, recusar, "já fiz"), o plano da semana,
   o diário de decisões com o antes e o depois, e as conversas anteriores.
   Nada é executado pela tela nem pelo Gestor: aceitar registra a decisão.
   Formatos: recado da T5b (API-gestor.md ainda não existe): a conferir na integração.
   ============================================================================ */

import { h, icone, trocar, focar, menosMovimento } from '../dom.js';
import { dinheiro, inteiro, numero, dataCurta, haQuanto, ehNumero } from '../formato.js';
import { selo, semDado, erroNoCampo } from '../pecas.js';
import { lerFluxo, olhando } from '../fluxo.js';
import { blocosDoTexto, montarBlocos } from '../formatacao.js';
import { separar, lerAcao, quemFaz, antesEDepois, perguntasProntas, quemNoDiario, anotacao, ONDE_ANOTAR, NOME_DO_TIPO, quandoMedeODepois } from '../acoes-logica.js';
import { fraseDoErro } from './estados.js';

const MAX_PERGUNTA = 2000;
const DIARIO_CURTO = 5;

export function mostrar(ctxInicial) {
  let ctx = ctxInicial;
  let conversaId = ctx.rota.params.conversa || null;
  let rodando = null;          // { controle: AbortController } enquanto o Gestor responde
  let saiu = false;
  let acoes = [];              // linhas cruas de trafego_acoes (a última lista lida)
  let temConta = false, temContatos = true;
  let diarioAberto = false;   // "Ver as outras decisões" já tocado

  /* --- moldura --- */
  const el = {
    fala: h('div', { class: 'gestor-fala', role: 'log', 'aria-label': 'Conversa com o Gestor', 'aria-live': 'polite' }),
    olhando: h('p', { class: 'gestor-olhando', role: 'status', hidden: true }),
    prontas: h('div', { class: 'gestor-prontas' }),
    pergunta: h('textarea', { id: 'gPergunta', name: 'pergunta', rows: '2', maxlength: String(MAX_PERGUNTA), autocomplete: 'off', placeholder: 'Ex.: qual campanha trouxe mais serviço fechado?' }),
    enviar: h('button', { class: 'botao botao-forte', type: 'submit' }, icone('enviar'), 'Perguntar'),
    contagem: h('span', { class: 'apoio gestor-contagem', 'aria-live': 'polite' }),
    decidir: h('div', { class: 'gestor-decidir' }),
    plano: h('div', { class: 'gestor-plano' }),
    diario: h('div', { class: 'gestor-diario' }),
    conversas: h('div', { class: 'gestor-conversas' }),
  };
  el.anotar = formularioDeAnotar();
  const parar = h('button', { class: 'botao botao-quieto', type: 'button', on: { click: () => pararResposta() } }, icone('parar'), 'Parar');
  const novaConversa = h('button', { class: 'botao botao-quieto', type: 'button', hidden: true, on: { click: () => comecarDeNovo() } }, icone('mais'), 'Conversa nova');
  const formulario = h('form', { class: 'campo gestor-perguntar', on: { submit: (e) => { e.preventDefault(); perguntar(el.pergunta.value); } } },
    h('label', { class: 'campo-rotulo', for: 'gPergunta' }, 'Sua pergunta'),
    el.pergunta,
    h('div', { class: 'gestor-perguntar-pe' }, el.contagem, el.enviar));
  el.pergunta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); formulario.requestSubmit(); }
  });
  el.pergunta.addEventListener('input', () => {
    const resta = MAX_PERGUNTA - el.pergunta.value.length;
    el.contagem.textContent = resta < 200 ? 'Restam ' + inteiro(resta) + ' letras' : '';
  });

  const secao = (id, titulo, apoio, ...filhos) => h('section', { class: 'bloco gestor-bloco', 'aria-labelledby': id },
    h('div', { class: 'bloco-cab' }, h('h2', { class: 'titulo-bloco', id }, titulo), apoio), filhos);

  trocar(ctx.miolo,
    h('header', { class: 'gestor-topo' },
      h('h1', { class: 'titulo-tela' }, 'Gestor IA'),
      h('p', { class: 'gestor-promessa' }, 'Ele lê os números da oficina, explica e sugere. ', h('strong', null, 'Nada muda nos anúncios sem você:'), ' aceitar uma sugestão só registra a decisão; quem mexe no gerenciador de anúncios é você.')),
    h('div', { class: 'gestor-corpo' },
      secao('tConversa', 'Conversa', novaConversa,
        el.fala,
        el.olhando,
        formulario,
        el.prontas),
      h('div', { class: 'gestor-lado' },
        secao('tDecidir', 'Para decidir', null, el.decidir),
        secao('tPlano', 'Plano da semana', null, el.plano),
        secao('tDiario', 'Diário de decisões', h('p', null, 'O que foi sugerido, o que você decidiu e como ficou.'), el.diario, el.anotar),
        secao('tConversas', 'Conversas anteriores', null, el.conversas))));

  /* --- a conversa --- */
  function falaDaPessoa(texto) {
    return h('div', { class: 'fala fala-pessoa' }, h('p', { class: 'fala-quem' }, 'Você'), h('p', { class: 'fala-texto' }, texto));
  }
  function falaDoGestor(texto) {
    const corpo = h('div', { class: 'fala-texto' });
    if (texto) montarBlocos(blocosDoTexto(texto), h).forEach((b) => corpo.appendChild(b));
    return { no: h('div', { class: 'fala fala-gestor' }, h('p', { class: 'fala-quem' }, h('span', { class: 'marca-anuncio', 'aria-hidden': 'true' }), 'Gestor'), corpo), corpo };
  }
  function pintarVazio() {
    if (el.fala.childElementCount) return;
    trocar(el.fala, h('p', { class: 'gestor-vazio' }, 'Pergunte como estão os anúncios, de onde vêm os contatos ou o que fazer esta semana. Ele responde com os números do período e diz quando um número não existe.'));
    el.fala.dataset.vazia = '1';
  }
  function limparVazio() {
    if (el.fala.dataset.vazia) { trocar(el.fala); delete el.fala.dataset.vazia; }
  }
  function pintarProntas() {
    trocar(el.prontas,
      h('p', { class: 'apoio' }, 'Perguntas prontas'),
      h('div', { class: 'fichas' }, perguntasProntas({ temConta, temContatos }).map((q) => h('button', { class: 'ficha', type: 'button', on: { click: () => perguntar(q) } }, q))));
  }
  function ocupado(sim) {
    el.enviar.disabled = sim;
    for (const b of el.prontas.querySelectorAll('button')) b.disabled = sim;
    el.fala.setAttribute('aria-busy', sim ? 'true' : 'false');
    if (!sim) { el.olhando.hidden = true; trocar(el.olhando); }
  }
  function mostrarOlhando(texto) {
    el.olhando.hidden = false;
    trocar(el.olhando, h('span', { class: 'gestor-olhando-ponto', 'aria-hidden': 'true' }), h('span', null, 'Gestor: ' + texto), parar);
  }
  function rolarAte(no) {
    no.scrollIntoView({ block: 'nearest', behavior: menosMovimento() ? 'auto' : 'smooth' });
  }

  async function perguntar(textoBruto) {
    const pergunta = String(textoBruto || '').trim();
    if (!pergunta || rodando) {
      if (!pergunta) el.pergunta.focus();
      return;
    }
    limparVazio();
    const pessoa = falaDaPessoa(pergunta);
    const gestor = falaDoGestor('');
    el.fala.append(pessoa, gestor.no);
    el.pergunta.value = '';
    el.contagem.textContent = '';
    novaConversa.hidden = false;
    rolarAte(pessoa);
    let texto = '';
    let fim = false;
    const pintarTexto = () => trocar(gestor.corpo, montarBlocos(blocosDoTexto(texto), h));
    const nota = (tom, conteudo, acao) => gestor.no.appendChild(h('p', { class: 'fala-nota fala-nota-' + tom }, icone(tom === 'grave' ? 'alerta' : 'info', 'icone-p'), h('span', null, conteudo), acao || null));
    const controle = new AbortController();
    rodando = { controle };
    ocupado(true);
    mostrarOlhando('pensando…');
    try {
      const resposta = await ctx.api.fluxo('api/gestor/perguntar', { pergunta, ...(conversaId ? { conversa_id: conversaId } : {}) }, { sinal: controle.signal });
      await lerFluxo(resposta.body, (ev) => {
        if (saiu) return;
        if (ev.tipo === 'texto') { texto += ev.texto; pintarTexto(); mostrarOlhando('escrevendo…'); }
        else if (ev.tipo === 'ferramenta') mostrarOlhando(olhando(ev));
        else if (ev.tipo === 'proposta') {
          const a = lerAcao(ev.proposta);
          if (a) {
            acoes = [ev.proposta, ...acoes.filter((x) => String(x.id) !== a.id)];
            pintarAcoes();
            nota('info', 'Sugestão registrada: ' + a.titulo + '. Está em "Para decidir".', h('a', { class: 'ligacao', href: '#tDecidir', on: { click: (e) => { e.preventDefault(); focar(document.getElementById('tDecidir')); } } }, 'Ver a sugestão'));
          }
        } else if (ev.tipo === 'fim') {
          fim = true;
          if (ev.conversa_id) conversaId = String(ev.conversa_id);
          if (ev.parou === 'max_tokens') nota('info', 'A resposta chegou ao tamanho máximo e foi cortada. Peça para ele continuar ou faça uma pergunta mais curta.');
          else if (ev.parou === 'voltas') nota('info', 'O Gestor respondeu com o que conseguiu olhar a tempo.');
          if (ev.aviso) nota('info', ev.aviso);
        } else if (ev.tipo === 'erro') {
          fim = true;
          if (ev.conversa_id) conversaId = String(ev.conversa_id);
          const motivo = String(ev.mensagem || 'erro sem explicação');
          nota('grave', (texto ? 'A resposta parou no meio: ' : 'O Gestor não conseguiu responder: ') + motivo.charAt(0).toLowerCase() + motivo.slice(1) + (texto ? ' O que chegou fica aqui.' : ''),
            h('button', { class: 'botao', type: 'button', on: { click: () => perguntar(pergunta) } }, icone('atualizar'), 'Perguntar de novo'));
        }
      });
      if (!fim && !saiu) nota('grave', 'A conversa caiu antes do fim. O que chegou fica aqui.', h('button', { class: 'botao', type: 'button', on: { click: () => perguntar(pergunta) } }, icone('atualizar'), 'Perguntar de novo'));
    } catch (erro) {
      if (saiu) return;
      if (erro && erro.name === 'AbortError') nota('info', texto ? 'Você parou a resposta aqui.' : 'Você parou antes da resposta chegar.');
      else if (erro && erro.status === 503) { nota('grave', fraseDoErro(erro)); pessoa.dataset.semResposta = '1'; }
      else if (erro && erro.status === 429) nota('grave', fraseDoErro(erro));
      else nota('grave', (texto ? 'A conversa caiu no meio. O que chegou fica aqui. ' : '') + fraseDoErro(erro), h('button', { class: 'botao', type: 'button', on: { click: () => perguntar(pergunta) } }, icone('atualizar'), 'Perguntar de novo'));
    } finally {
      rodando = null;
      if (!saiu) {
        ocupado(false);
        if (!texto && !gestor.no.querySelector('.fala-nota')) gestor.no.remove();
        ctx.leitor.esquecer('api/gestor/conversas');
        carregarConversas();
      }
    }
  }
  function pararResposta() {
    if (rodando) rodando.controle.abort();
    el.pergunta.focus();
  }
  function comecarDeNovo() {
    if (rodando) rodando.controle.abort();
    conversaId = null;
    trocar(el.fala);
    novaConversa.hidden = true;
    pintarVazio();
    pintarConversas(ultimasConversas);
    el.pergunta.focus();
  }

  /* --- para decidir e diário --- */
  async function decidir(a, decisao, botao) {
    const card = botao.closest('.proposta');
    for (const b of card.querySelectorAll('button')) b.disabled = true;
    try {
      const r = await ctx.api.gravar('api/acoes-trafego/' + encodeURIComponent(a.id) + '/' + (decisao === 'feita' ? 'feita' : 'decidir'), decisao === 'feita' ? {} : { decisao });
      const nova = r && (r.acao || r.registro || (r.id ? r : null));
      acoes = acoes.map((x) => (String(x.id) === a.id ? (nova || { ...x, status: decisao === 'aceitar' ? 'aceita' : decisao === 'recusar' ? 'recusada' : 'feita' }) : x));
      ctx.leitor.esquecer('api/acoes-trafego');
      ctx.avisar(r && r.aviso ? r.aviso
        : decisao === 'aceitar' ? 'Aceita. Quando fizer a mudança, marque "Já fiz".' : decisao === 'recusar' ? 'Recusada. Fica anotado no diário.' : 'Marcada como feita. O Tráfego mede o resultado na data combinada.');
      pintarAcoes();
      const mesmo = el.decidir.querySelector('.proposta[data-id="' + CSS.escape(a.id) + '"] button');
      focar(mesmo || document.getElementById('tDecidir'));
    } catch (erro) {
      for (const b of card.querySelectorAll('button')) b.disabled = false;
      ctx.avisar(fraseDoErro(erro));
      // Já decidida por outra pessoa ou vencida: a lista do servidor é a verdade.
      if (erro && erro.status === 409) { ctx.leitor.esquecer('api/acoes-trafego'); carregarAcoes(); }
    }
  }

  function cartao(a) {
    const idTitulo = 'p-' + a.id;
    const alto = a.risco === 'alto';
    const verba = a.verba && ehNumero(a.verba.atual) && ehNumero(a.verba.nova)
      ? h('p', { class: 'proposta-verba' }, 'Verba: de ', h('strong', null, dinheiro(a.verba.atual)), ' para ', h('strong', null, dinheiro(a.verba.nova)), a.verba.por === 'dia' ? ' por dia' : a.verba.por === 'mes' ? ' por mês' : '')
      : null;
    return h('article', { class: 'proposta' + (alto ? ' proposta-alto' : ''), 'aria-labelledby': idTitulo, data: { id: a.id } },
      h('div', { class: 'proposta-cab' },
        h('p', { class: 'proposta-tipo' }, a.nomeDoTipo),
        alto ? selo('grave', 'Risco alto', 'alerta') : null),
      h('h3', { class: 'proposta-titulo', id: idTitulo }, a.titulo),
      alto && a.riscoMotivo ? h('p', { class: 'proposta-risco' }, a.riscoMotivo) : null,
      verba,
      h('dl', { class: 'proposta-dados' },
        a.porque ? [h('dt', null, 'Por quê'), h('dd', null, a.porque)] : null,
        a.evidencias.length ? [h('dt', null, 'Os números'), h('dd', null, h('ul', null, a.evidencias.map((t) => h('li', null, t))))] : null,
        a.alvoRotulo || a.alvo.nome ? [h('dt', null, 'Onde'), h('dd', null, a.alvoRotulo || (a.alvo.nome + (a.alvo.plataforma ? ' (' + (a.alvo.plataforma === 'meta' ? 'Meta' : 'Google') + ')' : '')))] : null,
        a.medirEm ? [h('dt', null, 'Quando medir'), h('dd', null, dataCurta(a.medirEm) + ': o Tráfego compara a semana antes com a semana depois.')] : null,
        a.venceEm ? [h('dt', null, 'Prazo'), h('dd', null, 'Sem decisão até ' + dataCurta(a.venceEm) + ', a sugestão expira.')] : null),
      h('p', { class: 'proposta-nada' }, icone('info', 'icone-p'), h('span', null, quemFaz(a))),
      a.status === 'proposta'
        ? h('div', { class: 'proposta-botoes' },
          h('button', { class: 'botao ' + (alto ? '' : 'botao-forte'), type: 'button', on: { click: (e) => decidir(a, 'aceitar', e.currentTarget) } }, icone('certo'), alto ? 'Aceitar mesmo assim' : 'Aceitar'),
          h('button', { class: 'botao botao-quieto', type: 'button', on: { click: (e) => decidir(a, 'recusar', e.currentTarget) } }, icone('fechar'), 'Recusar'))
        : h('div', { class: 'proposta-botoes' },
          h('p', { class: 'apoio' }, 'Aceita' + (a.decididaPor ? ' por ' + a.decididaPor : '') + (a.decididaEm ? ' em ' + dataCurta(a.decididaEm) : '') + '. Falta fazer a mudança.'),
          h('button', { class: 'botao botao-forte', type: 'button', on: { click: (e) => decidir(a, 'feita', e.currentTarget) } }, icone('certo'), 'Já fiz')));
  }

  function valorDaMedida(m, v) {
    if (!ehNumero(v)) return semDado();
    if (m.formato === 'dinheiro') return dinheiro(v);
    if (m.formato === 'centavos') return dinheiro(v, { centavos: true });
    if (m.formato === 'decimal') return numero(v, 1);
    return inteiro(v);
  }

  function itemDoDiario(a) {
    const linhas = antesEDepois(a.antes, a.depois);
    const quando = a.feitaEm || a.decididaEm || a.criadaEm;
    let resultado = null;
    if (a.veredito) resultado = selo(a.veredito.tom, a.veredito.texto, a.veredito.icone);
    else if (a.status === 'feita' && a.medirEm) resultado = selo('espera', 'Medir em ' + dataCurta(a.medirEm));
    return h('li', { class: 'diario-item' },
      h('div', { class: 'diario-cab' },
        h('p', { class: 'diario-quando apoio' }, (quando ? dataCurta(quando) + ' · ' : '') + quemNoDiario(a)),
        selo(a.statusTexto.tom, a.statusTexto.texto)),
      h('p', { class: 'diario-titulo' }, a.titulo),
      resultado ? h('p', { class: 'diario-resultado' }, h('span', { class: 'apoio' }, 'Resultado: '), resultado) : null,
      a.vereditoTexto ? h('p', { class: 'diario-veredito' }, semRepetir(a.vereditoTexto, a.veredito)) : null,
      (a.antes && a.antes.base_rotulo) || (a.depois && a.depois.base_rotulo) ? h('p', { class: 'apoio' }, 'Comparando ' + ((a.depois && a.depois.base_rotulo) || a.antes.base_rotulo) + '.') : null,
      a.depois && a.depois.erro ? h('p', { class: 'apoio' }, a.depois.erro) : null,
      linhas.length ? h('table', { class: 'diario-medidas' },
        h('caption', { class: 'so-leitor' }, 'Antes e depois: ' + a.titulo),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, h('span', { class: 'so-leitor' }, 'Medida')),
          h('th', { scope: 'col' }, 'Antes', a.antes && a.antes.periodo ? h('span', { class: 'diario-periodo' }, a.antes.periodo) : null),
          a.depois ? h('th', { scope: 'col' }, 'Depois', a.depois.periodo ? h('span', { class: 'diario-periodo' }, a.depois.periodo) : null) : null)),
        h('tbody', null, linhas.map((m) => h('tr', null, h('th', { scope: 'row' }, m.rotulo), h('td', null, valorDaMedida(m, m.antes)), a.depois ? h('td', null, valorDaMedida(m, m.depois)) : null)))) : null,
      linhas.length && !a.depois && quandoMedeODepois(a) ? h('p', { class: 'apoio' }, quandoMedeODepois(a)) : null,
      a.nota ? h('p', { class: 'diario-nota apoio' }, 'Nota: ' + a.nota) : null);
  }

  function pintarAcoes() {
    const { abertas, diario } = separar(acoes);
    trocar(el.decidir, abertas.length
      ? abertas.map(cartao)
      : h('p', { class: 'suave' }, 'Nada esperando decisão. Quando o Gestor sugerir uma mudança, ela aparece aqui para você aceitar ou recusar.'));
    // As 5 mais novas aparecem; o resto fica a um toque (no celular o diário inteiro passava de 3 telas).
    const lista = h('ol', { class: 'diario' }, diario.slice(0, diarioAberto ? diario.length : DIARIO_CURTO).map(itemDoDiario));
    const resto = diario.length - DIARIO_CURTO;
    trocar(el.diario, diario.length
      ? [lista, !diarioAberto && resto > 0 ? h('button', { class: 'botao botao-quieto diario-mais', type: 'button', on: { click: () => {
        diarioAberto = true;
        pintarAcoes();
        const proximo = el.diario.querySelectorAll('.diario-item')[DIARIO_CURTO];
        if (proximo) { proximo.setAttribute('tabindex', '-1'); proximo.focus(); }
      } } }, icone('mais'), resto === 1 ? 'Ver a decisão mais antiga' : 'Ver as outras ' + inteiro(resto) + ' decisões') : null]
      : h('p', { class: 'suave' }, 'Ainda nenhuma decisão. Cada sugestão aceita, recusada ou feita fica anotada aqui, com o resultado medido depois.'));
  }

  /* --- anotar uma mudança feita por conta própria (POST api/acoes-trafego, API-gestor.md §3) --- */
  function formularioDeAnotar() {
    const opcao = (valor, rotulo) => h('option', { value: valor }, rotulo);
    const campos = {
      tipo: h('select', { id: 'anTipo', name: 'tipo' }, opcao('', 'Escolha'), Object.entries(NOME_DO_TIPO).map(([v, r]) => opcao(v, r))),
      titulo: h('input', { id: 'anTitulo', name: 'titulo', type: 'text', maxlength: '120', autocomplete: 'off', placeholder: 'Ex.: Desliguei os anúncios do Google no domingo' }),
      onde: h('select', { id: 'anOnde', name: 'onde' }, opcao('', 'Não sei dizer'), ONDE_ANOTAR.map((o) => opcao(o.id, o.rotulo))),
      campanha: h('input', { id: 'anCampanha', name: 'campanha', type: 'text', maxlength: '120', autocomplete: 'off', placeholder: 'Se foi numa campanha só, o nome dela' }),
      porque: h('textarea', { id: 'anPorque', name: 'porque', rows: '2', maxlength: '1000' }),
    };
    const gravar = h('button', { class: 'botao botao-forte', type: 'submit' }, icone('certo'), 'Anotar no diário');
    const rotulo = (id, texto, campo) => h('label', { class: 'campo', for: id }, h('span', null, texto), campo);
    const caixa = h('details', { class: 'anotar' });
    const form = h('form', { class: 'anotar-form', novalidate: true, on: { submit: async (e) => {
      e.preventDefault();
      for (const c of Object.values(campos)) erroNoCampo(c, null);
      const v = anotacao({ tipo: campos.tipo.value, titulo: campos.titulo.value, onde: campos.onde.value, campanha: campos.campanha.value, porque: campos.porque.value });
      if (!v.ok) { erroNoCampo(campos[v.campo], v.erro); campos[v.campo].focus(); return; }
      gravar.disabled = true;
      try {
        const r = await ctx.api.gravar('api/acoes-trafego', v.corpo);
        if (r && r.acao) acoes = [r.acao, ...acoes.filter((x) => String(x.id) !== String(r.acao.id))];
        ctx.leitor.esquecer('api/acoes-trafego');
        form.reset();
        caixa.open = false;
        pintarAcoes();
        const nova = r && r.acao ? lerAcao(r.acao) : null;
        ctx.avisar('Anotado no diário.' + (nova && nova.medirEm ? ' O Tráfego compara a semana antes com a semana depois em ' + dataCurta(nova.medirEm) + '.' : ''));
      } catch (erro) {
        const codigo = erro && erro.corpo && erro.corpo.codigo;
        const campo = codigo === 'alvo' ? campos.onde : campos[codigo] || null;
        if (campo) { erroNoCampo(campo, fraseDoErro(erro)); campo.focus(); } else ctx.avisar(fraseDoErro(erro));
      } finally {
        gravar.disabled = false;
      }
    } } },
      h('p', { class: 'apoio' }, 'Mexeu num anúncio ou no atendimento por conta própria? Anote aqui: o Tráfego mede a semana antes e a semana depois, igual faz com as sugestões do Gestor.'),
      rotulo('anTipo', 'Tipo da mudança', campos.tipo),
      rotulo('anTitulo', 'O que foi feito', campos.titulo),
      h('div', { class: 'anotar-dupla' }, rotulo('anOnde', 'Onde', campos.onde), rotulo('anCampanha', 'Campanha (se for uma só)', campos.campanha)),
      rotulo('anPorque', 'Por quê (se quiser)', campos.porque),
      h('div', { class: 'anotar-botoes' }, gravar));
    caixa.append(h('summary', { class: 'ligacao anotar-abrir' }, icone('mais', 'icone-p'), 'Anotar uma mudança que eu fiz'), form);
    return caixa;
  }

  /* --- plano da semana --- */
  let planoPedido = false;
  function pintarPlano(p, { erro = null, aviso = null } = {}) {
    const botao = h('button', { class: 'botao', type: 'button', on: { click: () => novoPlano(botao) } }, icone('atualizar'), 'Fazer um plano novo');
    if (!p) {
      trocar(el.plano,
        aviso ? h('p', { class: 'aviso-caixa' }, icone('info', 'icone-p'), h('span', null, aviso)) : null,
        h('p', { class: 'suave' }, 'Ainda não há plano. O Gestor olha os últimos 7 e 30 dias e diz o que fazer na semana.'),
        erro ? h('p', { class: 'campo-erro', role: 'alert' }, erro) : null,
        botao);
      return;
    }
    const corpo = h('div', { class: 'plano-texto' }, montarBlocos(blocosDoTexto(p.texto || ''), h));
    const base = p.baseado_em && p.baseado_em.rotulo ? ', olhando os ' + p.baseado_em.rotulo
      : p.baseado_em && p.baseado_em.de && p.baseado_em.ate ? ', olhando de ' + dataCurta(p.baseado_em.de) + ' a ' + dataCurta(p.baseado_em.ate) : '';
    const sugestoes = Array.isArray(p.propostas) ? p.propostas.length : 0;
    trocar(el.plano,
      h('p', { class: 'apoio' }, (p.feito_em ? 'Feito ' + haQuanto(p.feito_em) : 'Feito pelo Gestor') + (p.pedido_por ? ', a pedido de ' + p.pedido_por : p.feito_em ? ', pela rotina da semana' : '') + base + '.'),
      corpo,
      sugestoes ? h('p', { class: 'apoio' }, sugestoes === 1 ? 'A sugestão deste plano está em "Para decidir".' : 'As ' + inteiro(sugestoes) + ' sugestões deste plano estão em "Para decidir".') : null,
      erro ? h('p', { class: 'campo-erro', role: 'alert' }, erro) : null,
      botao);
  }
  let planoAtual = null;
  async function novoPlano(botao) {
    if (planoPedido) return;
    planoPedido = true;
    botao.disabled = true;
    trocar(botao, icone('relogio'), 'Montando o plano…');
    try {
      const p = await ctx.api.gravar('api/gestor/plano', {});
      planoAtual = p && p.texto ? p : p && p.plano ? p.plano : planoAtual;
      ctx.leitor.esquecer('api/gestor/plano', 'api/acoes-trafego');
      pintarPlano(planoAtual);
      carregarAcoes();
      ctx.avisar('Plano novo pronto.');
    } catch (erro) {
      // 502: a IA não terminou; o que chegou até ali vem junto e vale mostrar.
      const parcial = erro && erro.corpo && erro.corpo.plano && erro.corpo.plano.texto ? erro.corpo.plano : null;
      pintarPlano(parcial || planoAtual, { erro: (parcial ? 'O plano parou no meio. ' : '') + fraseDoErro(erro) });
    } finally {
      planoPedido = false;
    }
  }

  /* --- conversas anteriores --- */
  let ultimasConversas = [];
  function pintarConversas(lista) {
    ultimasConversas = lista;
    if (!lista.length) { trocar(el.conversas, h('p', { class: 'suave' }, 'As conversas ficam guardadas aqui para você voltar nelas.')); return; }
    trocar(el.conversas, h('ul', { class: 'conversas-lista' }, lista.slice(0, 12).map((c) => h('li', null,
      h('button', { class: 'conversa-item', type: 'button', 'aria-current': String(c.id) === conversaId ? 'true' : null, on: { click: () => abrirConversa(c.id) } },
        h('span', { class: 'conversa-titulo corta' }, c.titulo || 'Conversa sem título'),
        h('span', { class: 'apoio' }, [c.atualizada_em ? haQuanto(c.atualizada_em) : null, ehNumero(c.mensagens) ? inteiro(c.mensagens) + ' mensagens' : null].filter(Boolean).join(' · ')))))));
  }
  async function carregarConversas() {
    try {
      const d = (await ctx.leitor.ler('api/gestor/conversas')).dados;
      if (saiu) return;
      pintarConversas(Array.isArray(d) ? d : Array.isArray(d && d.conversas) ? d.conversas : []);
      if (d && d.ligado === false) el.conversas.prepend(h('p', { class: 'aviso-caixa' }, icone('info', 'icone-p'), h('span', null, d.aviso || 'As conversas ainda não ficam guardadas.')));
    } catch (erro) {
      if (!saiu) trocar(el.conversas, h('p', { class: 'campo-erro' }, fraseDoErro(erro)));
    }
  }
  async function abrirConversa(id) {
    if (rodando) rodando.controle.abort();
    try {
      const c = await ctx.api.ler('api/gestor/conversas/' + encodeURIComponent(id));
      if (saiu) return;
      conversaId = String(c.id || id);
      trocar(el.fala);
      delete el.fala.dataset.vazia;
      for (const m of Array.isArray(c.mensagens) ? c.mensagens : []) {
        const papel = m.papel || m.role;
        const texto = typeof m.texto === 'string' ? m.texto : typeof m.content === 'string' ? m.content : '';
        if (!texto) continue;
        if (papel === 'resumo') {
          el.fala.appendChild(h('div', { class: 'fala fala-resumo' },
            h('p', { class: 'fala-quem' }, 'Resumo' + (ehNumero(m.mensagens_resumidas) ? ' de ' + inteiro(m.mensagens_resumidas) + ' mensagens antigas' : ' das mensagens antigas')),
            h('div', { class: 'fala-texto' }, montarBlocos(blocosDoTexto(texto), h))));
          continue;
        }
        if (papel === 'pessoa' || papel === 'user') { el.fala.appendChild(falaDaPessoa(texto)); continue; }
        const g = falaDoGestor(texto);
        if (m.erro && (m.erro.erro || m.erro.codigo)) {
          const motivo = String(m.erro.erro || 'erro sem explicação');
          g.no.appendChild(h('p', { class: 'fala-nota fala-nota-grave' }, icone('alerta', 'icone-p'), h('span', null, 'Esta resposta parou no meio: ' + motivo.charAt(0).toLowerCase() + motivo.slice(1))));
        } else if (m.parou === 'max_tokens') {
          g.no.appendChild(h('p', { class: 'fala-nota fala-nota-info' }, icone('info', 'icone-p'), h('span', null, 'Esta resposta foi cortada no tamanho máximo.')));
        }
        el.fala.appendChild(g.no);
      }
      if (!el.fala.childElementCount) pintarVazio();
      novaConversa.hidden = false;
      pintarConversas(ultimasConversas);
      focar(document.getElementById('tConversa'));
    } catch (erro) {
      ctx.avisar(fraseDoErro(erro));
    }
  }

  /* --- leituras --- */
  const falhou = (alvo, erro, tentar) => trocar(alvo, h('p', { class: 'campo-erro' }, fraseDoErro(erro)), h('button', { class: 'botao', type: 'button', on: { click: tentar } }, 'Tentar de novo'));
  const carregando = (alvo) => trocar(alvo, h('span', { class: 'esqueleto esq-linha', 'aria-hidden': 'true' }), h('span', { class: 'so-leitor' }, 'Carregando'));
  async function carregarAcoes() {
    try {
      const d = (await ctx.leitor.ler('api/acoes-trafego')).dados;
      if (saiu) return;
      acoes = Array.isArray(d) ? d : Array.isArray(d && d.acoes) ? d.acoes : Array.isArray(d && d.itens) ? d.itens : [];
      pintarAcoes();
      el.anotar.hidden = Boolean(d && d.ligado === false);
      if (d && d.ligado === false) {
        trocar(el.decidir, h('p', { class: 'aviso-caixa' }, icone('info', 'icone-p'), h('span', null, d.aviso || 'O diário de decisões ainda não existe no banco.')));
        trocar(el.diario, h('p', { class: 'suave' }, 'Sem o diário no banco, as sugestões do Gestor ainda não ficam guardadas.'));
      }
    } catch (erro) {
      if (!saiu) { falhou(el.decidir, erro, carregarAcoes); trocar(el.diario); }
    }
  }
  async function carregarPlano() {
    try {
      const d = (await ctx.leitor.ler('api/gestor/plano')).dados;
      if (saiu) return;
      planoAtual = d && d.texto ? d : d && d.plano && d.plano.texto ? d.plano : null;
      pintarPlano(planoAtual, { aviso: d && d.ligado === false ? d.aviso || 'O plano ainda não fica guardado no banco.' : null });
    } catch (erro) {
      if (!saiu) pintarPlano(null, { erro: fraseDoErro(erro) });
    }
  }
  async function carregarConexoes() {
    try {
      const d = (await ctx.leitor.ler('api/conexoes')).dados;
      if (saiu) return;
      temConta = Boolean((d.meta && d.meta.ligado) || (d.google && d.google.ligado));
    } catch { temConta = false; }
    pintarProntas();
  }

  carregando(el.decidir); carregando(el.plano); carregando(el.conversas);
  pintarVazio();
  pintarProntas();
  carregarConexoes();
  carregarAcoes();
  carregarPlano();
  carregarConversas();
  if (conversaId) abrirConversa(conversaId);

  return {
    atualizar(novo) { ctx = novo; return true; },
    sair() { saiu = true; if (rodando) rodando.controle.abort(); },
  };
}

/** "Melhorou: o custo…" ao lado do selo "Melhorou" repete a palavra: fica só o porquê. */
function semRepetir(texto, ver) {
  const rotulo = ver && ver.texto ? ver.texto + ':' : null;
  if (!rotulo || !texto.toLowerCase().startsWith(rotulo.toLowerCase())) return texto;
  const resto = texto.slice(rotulo.length).trim();
  return resto ? resto.charAt(0).toUpperCase() + resto.slice(1) : texto;
}
