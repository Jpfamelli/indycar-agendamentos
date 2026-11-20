/* ============================================================================
   Detalhe de um contato (GET api/jornada/:id, contrato §5.3).
   A folha de tempos de um carro só: quem é, de onde veio e como sabemos, cada
   etapa com seu horário, como terminou, tudo o que aconteceu e os atalhos para
   os outros apps. As três pendências (valor, motivo, origem) se resolvem aqui
   mesmo, com desfazer por 5 segundos.
   Todo texto de cliente entra por nó de texto (dom.js): nada vira HTML.
   ============================================================================ */

import { h, icone, trocar, focar } from '../dom.js';
import { miniSetores, situacao, descricaoDosSetores, palavraDoEstado, FONTES_DO_VALOR } from '../setores.js';
import { dinheiro, telefone, dataHora, dataLonga, hora, ehNumero, contagem, duracao, chaveDoDia, partesDaData } from '../formato.js';
import { selo, setores, origem as marcaDaOrigem } from '../pecas.js';
import * as Estados from './estados.js';
import { gravarComDesfazer } from './gravar.js';
import { campoDeValor, escolhas, OPCOES_DE_MOTIVO, OPCOES_DE_ORIGEM, sugestaoDoOrcamento } from './respostas.js';

const CERTEZA = {
  certa: ['bom', 'Temos certeza'],
  provavel: ['neutro', 'É provável'],
  palpite: ['atencao', 'É um palpite'],
  nenhuma: ['atencao', 'Ainda não sabemos'],
};
const ATALHOS = [
  ['crm', 'Abrir no CRM'],
  ['atendimento', 'Abrir a conversa'],
  ['agenda', 'Ver na Agenda'],
  ['orcamento', 'Ver o orçamento'],
  ['patio', 'Ver no Pátio'],
];
const LINHA_CURTA = 10;   // linha do tempo: até aqui aparece inteira; acima disso, começo e fim, com o meio guardado

const maiuscula = (texto) => (texto ? texto[0].toUpperCase() + texto.slice(1) : texto);
const semPendencia = (lista, id) => (lista || []).filter((p) => p !== id);

/**
 * Abre o contato `id` dentro de `alvo`. `obterCtx()` devolve o contexto atual da tela (ele muda a cada filtro).
 * aoFechar(): a pessoa pediu para voltar à lista. aoPrever(item): o contato mudou na tela (antes de gravar).
 * aoMudar(): uma gravação chegou ao servidor (a lista precisa se atualizar).
 */
export function abrir(obterCtx, alvo, id, { aoFechar, aoPrever = () => {}, aoMudar = () => {}, rotuloDaVolta = 'Voltar para a lista' }) {
  let vivo = true;
  let dados = null;
  let modo = null;          // formulário aberto por escolha da pessoa: 'valor' | 'motivo' | 'origem'
  let linhaInteira = false;
  const caminho = 'api/jornada/' + encodeURIComponent(id);

  const corpo = h('div', { class: 'detalhe-corpo' });
  trocar(alvo,
    h('div', { class: 'detalhe-barra' },
      h('button', { class: 'ligacao detalhe-voltar', type: 'button', on: { click: aoFechar } }, icone('voltar'), rotuloDaVolta),
      h('button', { class: 'botao botao-quieto detalhe-fechar', type: 'button', on: { click: aoFechar } }, icone('fechar'), 'Fechar')),
    corpo);

  function carregar({ quieto = false } = {}) {
    return Estados.buscar(obterCtx(), caminho, {
      alvo: corpo, forma: 'painel', nivel: 'h2', vivo: () => vivo, manter: quieto, mesma: quieto,
      pintar: (d) => { dados = d; pintar(); },
    });
  }

  /* ------------------------------ quem é ------------------------------ */
  function cabeca() {
    const hist = dados.historico || {};
    const fatos = [];
    const chegou = dataHora(dados.chegou_em);
    if (chegou) fatos.push('Chegou em ' + chegou);
    if (dados.cliente_novo === true) fatos.push('Cliente novo');
    if (dados.cliente_novo === false) {
      const desde = hist.cliente_desde ? partesDaData(hist.cliente_desde) : null;
      fatos.push('Já era cliente' + (desde ? ' desde ' + desde.ano : ''));
    }
    if (ehNumero(hist.visitas_antes) && hist.visitas_antes > 0) fatos.push(contagem(hist.visitas_antes, 'visita antes', 'visitas antes'));
    if (ehNumero(hist.gasto_antes) && hist.gasto_antes > 0) fatos.push(dinheiro(hist.gasto_antes) + ' em serviços antes');
    if (dados.responsavel) fatos.push('Com ' + dados.responsavel);
    const fone = telefone(dados.telefone);
    return h('header', { class: 'detalhe-cabeca' },
      h('h2', { class: 'titulo-bloco detalhe-nome', tabindex: '-1' }, dados.nome || 'Sem nome'),
      h('p', { class: 'detalhe-quem' }, [fone, dados.carro, dados.servico].filter(Boolean).join(' · ') || 'Sem telefone, carro ou serviço informados'),
      fatos.length ? h('p', { class: 'apoio' }, fatos.join(' · ')) : null);
  }

  /* ------------------------------ a folha de tempos: cada etapa com seu horário ------------------------------ */
  function folhaDeTempos() {
    const tracos = miniSetores(dados);
    const porId = new Map((dados.etapas || []).map((e) => [e.id, e]));
    let anterior = null;   // instante da última etapa com horário, para o intervalo
    const linhas = tracos.map((t) => {
      const e = porId.get(t.id) || {};
      const instante = e.em ? Date.parse(e.em) : NaN;
      const extras = [];
      if (t.id === 'respondido' && ehNumero(e.minutos)) extras.push('respondeu em ' + duracao(e.minutos));
      else if (Number.isFinite(instante) && anterior != null && instante >= anterior) extras.push(duracao((instante - anterior) / 60000) + ' depois');
      if (t.id === 'orcamento' && ehNumero(e.valor)) extras.push(dinheiro(e.valor) + (e.numero != null ? ', orçamento nº ' + e.numero : ''));
      if (t.id === 'agendou' && e.para) extras.push('para ' + dataHora(e.para));
      if (t.id === 'oficina' && e.os != null) extras.push('ordem de serviço nº ' + e.os);
      if (Number.isFinite(instante)) anterior = instante;
      const quando = e.em ? dataHora(e.em)
        : t.estado === 'vazio' ? 'ainda não'
          : e.desconhecido ? 'não sabemos'
            : t.estado === 'pulou' ? 'sem registro'
              : 'sem horário';
      return h('li', { class: 'folha-linha', data: { estado: t.estado } },
        h('span', { class: 'setor', data: { estado: t.estado, tom: t.tom }, 'aria-hidden': 'true' }),
        h('span', { class: 'folha-etapa' }, t.rotulo, h('span', { class: 'so-leitor' }, ': ' + palavraDoEstado(t.estado) + '. ')),
        h('span', { class: 'folha-quando' }, quando),
        extras.length ? h('span', { class: 'folha-extra' }, extras.join(' · ')) : null);
    });
    return h('section', { class: 'detalhe-caminho', 'aria-label': 'Etapas do contato' },
      h('div', { class: 'detalhe-setores', 'aria-hidden': 'true' }, setores(dados, { tamanho: 'g' })),
      h('p', { class: 'detalhe-caminho-texto' }, descricaoDosSetores(dados)),
      h('ol', { class: 'folha' }, linhas));
  }

  /* ------------------------------ como terminou (e as pendências de valor e motivo) ------------------------------ */
  function blocoSituacao() {
    const s = situacao(dados);
    const d = dados.desfecho || {};
    const filhos = [h('h3', { class: 'titulo-p', tabindex: '-1' }, 'Situação')];
    const cancelar = h('button', { class: 'botao botao-quieto', type: 'button', on: { click: () => { modo = null; pintar({ foco: 'situacao' }); } } }, 'Cancelar');

    if (d.tipo === 'fechou') {
      const temValor = ehNumero(d.valor);
      filhos.push(h('p', { class: 'detalhe-situacao' }, selo('bom', 'Fechou'), temValor ? h('span', { class: 'numero detalhe-valor' }, dinheiro(d.valor)) : null));
      if (!temValor || modo === 'valor') {
        const campo = campoDeValor({
          rotulo: 'Valor do serviço de ' + (dados.nome || 'este contato'), sugestao: sugestaoDoOrcamento(dados), inicial: temValor ? d.valor : null,
          textoDoBotao: temValor ? 'Gravar o valor novo' : 'Lançar valor', aoGravar: lancarValor,
        });
        filhos.push(h('p', { class: 'detalhe-pergunta' }, temValor ? 'Qual é o valor certo?' : 'Quanto foi o serviço? Sem o valor não dá para saber o retorno.'), campo.no, temValor ? cancelar : null);
      } else {
        const fonte = FONTES_DO_VALOR[d.valor_fonte];
        if (fonte) filhos.push(h('p', { class: 'apoio' }, fonte));
        if (!d.valor_fonte || d.valor_fonte === 'manual') filhos.push(h('button', { class: 'ligacao', type: 'button', on: { click: () => { modo = 'valor'; pintar({ foco: 'valor' }); } } }, 'Corrigir o valor'));
      }
    } else if (d.tipo === 'nao_fechou') {
      const temMotivo = Boolean(d.motivo);
      filhos.push(h('p', { class: 'detalhe-situacao' }, selo('fora', 'Não fechou'), temMotivo ? h('strong', null, s.detalhe) : null));
      if (d.obs) filhos.push(h('p', { class: 'apoio detalhe-obs' }, d.obs));
      if (!temMotivo || modo === 'motivo') {
        filhos.push(h('p', { class: 'detalhe-pergunta' }, 'Por que não fechou?'),
          escolhas({ nome: 'Motivo de não ter fechado', opcoes: OPCOES_DE_MOTIVO, atual: d.motivo || null, aoEscolher: marcarMotivo }),
          temMotivo ? cancelar : null);
      } else {
        filhos.push(h('button', { class: 'ligacao', type: 'button', on: { click: () => { modo = 'motivo'; pintar({ foco: 'situacao' }); } } }, 'Trocar o motivo'));
      }
    } else {
      filhos.push(h('p', { class: 'detalhe-situacao' }, selo(s.tom, s.texto), s.detalhe ? h('span', { class: 'apoio' }, s.detalhe) : null));
      const conversa = s.pede === 'resposta' && dados.links ? obterCtx().linkDoApp(dados.links.atendimento) : null;
      if (conversa) filhos.push(h('a', { class: 'botao botao-forte', href: conversa.href, target: conversa.target, rel: conversa.rel }, 'Responder agora', icone('abre-fora')));
    }
    return h('section', { class: 'bloco detalhe-bloco', data: { bloco: 'situacao' } }, filhos);
  }

  /* ------------------------------ de onde veio e como sabemos ------------------------------ */
  function blocoOrigem() {
    const o = dados.origem || {};
    const [tom, palavra] = CERTEZA[o.certeza] || CERTEZA.nenhuma;
    const semOrigem = !o.certeza || o.certeza === 'nenhuma';
    const r = dados.rastreio || null;
    const fatos = [];
    const fato = (rotulo, valor) => { if (valor) fatos.push(h('div', { class: 'fato' }, h('dt', null, rotulo), h('dd', null, valor))); };
    fato('Como sabemos', maiuscula(o.como_rotulo));
    if (r) {
      fato('Página do site', r.pagina);
      fato('Código do site', r.codigo);
      fato('Clique', dataHora(r.clique_em));
      fato('Marcação do endereço', [r.utm_source, r.utm_medium, r.utm_campaign].filter(Boolean).join(' · '));
    }
    const filhos = [
      h('h3', { class: 'titulo-p', tabindex: '-1' }, 'De onde veio'),
      h('p', { class: 'detalhe-origem' }, marcaDaOrigem(o), selo(tom, palavra)),
      o.detalhe ? h('p', { class: 'detalhe-origem-detalhe' }, o.detalhe) : null,
      fatos.length ? h('dl', { class: 'fatos' }, fatos) : null,
      dados.primeira_mensagem
        ? h('figure', { class: 'detalhe-mensagem' }, h('figcaption', { class: 'apoio' }, 'Primeira mensagem do cliente'), h('blockquote', null, dados.primeira_mensagem))
        : null,
    ];
    if (semOrigem || modo === 'origem') {
      filhos.push(h('p', { class: 'detalhe-pergunta' }, semOrigem ? 'De onde veio este contato?' : 'Qual é a origem certa?'),
        escolhas({ nome: 'Origem do contato', opcoes: OPCOES_DE_ORIGEM, atual: semOrigem ? null : o.canal, aoEscolher: marcarOrigem }),
        semOrigem ? null : h('button', { class: 'botao botao-quieto', type: 'button', on: { click: () => { modo = null; pintar({ foco: 'origem' }); } } }, 'Cancelar'));
    } else {
      filhos.push(h('button', { class: 'ligacao', type: 'button', on: { click: () => { modo = 'origem'; pintar({ foco: 'origem' }); } } }, 'Corrigir a origem'));
    }
    return h('section', { class: 'bloco detalhe-bloco', data: { bloco: 'origem' } }, filhos);
  }

  /* ------------------------------ linha do tempo ------------------------------ */
  function blocoLinhaDoTempo() {
    const todos = Array.isArray(dados.linha_do_tempo) ? dados.linha_do_tempo : [];
    if (!todos.length) return null;
    const corta = !linhaInteira && todos.length > LINHA_CURTA + 2;
    const comeco = corta ? todos.slice(0, 4) : todos;
    const fim = corta ? todos.slice(todos.length - (LINHA_CURTA - 4)) : [];
    const guardados = todos.length - comeco.length - fim.length;
    let dia = null;
    const evento = (e) => {
      const nos = [];
      const chave = chaveDoDia(e.em);
      if (chave && chave !== dia) { dia = chave; nos.push(h('li', { class: 'tempo-dia' }, dataLonga(e.em))); }
      const ehMensagem = e.tipo === 'mensagem_cliente' || e.tipo === 'mensagem_oficina';
      // A primeira mensagem já está escrita no bloco da origem: aqui fica só o registro de que chegou.
      const repetida = e.tipo === 'mensagem_cliente' && e.detalhe && e.detalhe === dados.primeira_mensagem;
      nos.push(h('li', { class: 'tempo-item', data: { tipo: e.tipo || 'mudanca' } },
        h('time', { class: 'tempo-hora', datetime: e.em || null }, hora(e.em) || ''),
        h('div', { class: 'tempo-o-que' },
          h('p', { class: 'tempo-titulo' }, e.titulo || 'Registro'),
          e.detalhe && !repetida ? h('p', { class: ehMensagem ? 'tempo-fala' : 'tempo-detalhe' }, e.detalhe) : null)));
      return nos;
    };
    const nosDoComeco = comeco.map(evento);
    if (corta) dia = null;   // depois do corte, o dia aparece de novo
    const nosDoFim = fim.map(evento);
    const lista = h('ol', { class: 'tempo' },
      nosDoComeco,
      corta ? h('li', { class: 'tempo-meio' },
        h('button', { class: 'botao', type: 'button', on: { click: () => { linhaInteira = true; pintar({ foco: 'tempo' }); } } }, 'Mostrar os ' + guardados + ' registros do meio')) : null,
      nosDoFim);
    return h('section', { class: 'bloco detalhe-bloco', data: { bloco: 'tempo' } }, h('h3', { class: 'titulo-p', tabindex: '-1' }, 'Linha do tempo'), lista);
  }

  /* ------------------------------ atalhos para os outros apps ------------------------------ */
  function blocoAtalhos() {
    const links = dados.links || {};
    const botoes = ATALHOS.map(([chave, rotulo]) => {
      const d = links[chave] ? obterCtx().linkDoApp(links[chave]) : null;
      return d ? h('a', { class: 'botao', href: d.href, target: d.target, rel: d.rel }, rotulo, icone('abre-fora')) : null;
    }).filter(Boolean);
    if (!botoes.length) return null;
    return h('section', { class: 'bloco detalhe-bloco', data: { bloco: 'atalhos' } },
      h('h3', { class: 'titulo-p' }, 'Abrir em outro app'),
      h('div', { class: 'detalhe-atalhos' }, botoes),
      h('p', { class: 'apoio' }, 'A etapa do contato muda no CRM. Aqui você lança o valor, o motivo e a origem.'));
  }

  function pintar({ foco = null } = {}) {
    if (!vivo || !dados) return;
    trocar(corpo, cabeca(), folhaDeTempos(), blocoSituacao(), blocoOrigem(), blocoLinhaDoTempo(), blocoAtalhos());
    if (foco === 'valor') { const campo = corpo.querySelector('.resposta-valor input'); if (campo) { campo.focus(); campo.select(); } }
    else if (foco) focar(corpo.querySelector('[data-bloco="' + foco + '"] h3'));
  }

  /* ------------------------------ gravações (com desfazer por 5 segundos) ------------------------------ */
  function gravar({ tipo, corpo: envio, texto, previsto, bloco, aoResposta }) {
    const antes = { desfecho: dados.desfecho, origem: dados.origem, pendencias: dados.pendencias };
    dados = { ...dados, ...previsto };
    modo = null;
    pintar({ foco: bloco });
    aoPrever(dados);
    const voltar = () => { dados = { ...dados, ...antes }; pintar(); aoPrever(dados); };
    gravarComDesfazer(obterCtx(), {
      lead: id, tipo, corpo: envio, texto,
      aoDesfazer: voltar,
      aoFalhar: voltar,
      aoConfirmar: (resposta) => {
        if (resposta) aoResposta(resposta);
        aoPrever(dados);
        aoMudar();
        if (vivo) carregar({ quieto: true });
      },
    });
  }

  function lancarValor(valor) {
    gravar({
      tipo: 'valor', corpo: { valor }, texto: 'Valor de ' + dinheiro(valor) + ' lançado.', bloco: 'situacao',
      previsto: { desfecho: { ...dados.desfecho, valor, valor_fonte: 'manual' }, pendencias: semPendencia(dados.pendencias, 'sem_valor') },
      aoResposta: (r) => {
        if (r.desfecho) dados = { ...dados, desfecho: r.desfecho };
        // Fonte mais forte (Pátio, orçamento, Agenda) continua valendo: o servidor explica e a tela repete.
        if (r.aviso) obterCtx().avisar(r.aviso, { duracao: 9000 });
      },
    });
  }

  function marcarMotivo(opcao) {
    gravar({
      tipo: 'motivo', corpo: { motivo: opcao.id }, texto: 'Motivo marcado: ' + opcao.rotulo.toLowerCase() + '.', bloco: 'situacao',
      previsto: { desfecho: { ...dados.desfecho, motivo: opcao.id, motivo_rotulo: opcao.rotulo }, pendencias: semPendencia(dados.pendencias, 'sem_motivo') },
      aoResposta: (r) => { if (r.desfecho) dados = { ...dados, desfecho: r.desfecho }; },
    });
  }

  function marcarOrigem(opcao) {
    const pagas = new Set(['meta', 'google']);
    gravar({
      tipo: 'origem', corpo: { canal: opcao.id }, texto: 'Origem marcada: ' + opcao.rotulo.toLowerCase() + '.', bloco: 'origem',
      previsto: {
        origem: { canal: opcao.id, paga: pagas.has(opcao.id), rotulo: opcao.rotulo, detalhe: null, campanha: null, conjunto: null, anuncio: null, palavra_chave: null, como: 'manual', como_rotulo: 'marcado por você', certeza: 'certa' },
        pendencias: semPendencia(dados.pendencias, 'sem_origem'),
      },
      aoResposta: (r) => { if (r.origem) dados = { ...dados, origem: r.origem }; },
    });
  }

  // Esc dentro de um formulário aberto por escolha fecha o formulário, não o contato.
  corpo.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !modo) return;
    const bloco = modo === 'origem' ? 'origem' : 'situacao';
    e.preventDefault();
    e.stopPropagation();
    modo = null;
    pintar({ foco: bloco });
  });

  carregar();

  return {
    sair() { vivo = false; },
  };
}
