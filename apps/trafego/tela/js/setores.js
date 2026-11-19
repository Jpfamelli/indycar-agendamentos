/* ============================================================================
   Mini-setores e situação de um contato (lógica pura, testada em
   tela/_testes/setores.test.mjs). Recebe o item da jornada (contrato §5.3) e
   devolve o que a tela desenha. Nenhuma regra de negócio: as etapas, o
   desfecho e as pendências já vêm decididos pela API.
   ============================================================================ */

import { paradoHa, duracao, ehNumero } from './formato.js';

/** As sete etapas, na ordem fixa do contrato (§5.1). */
export const ETAPAS = [
  { id: 'contato', rotulo: 'Contato', plural: 'Contatos' },
  { id: 'respondido', rotulo: 'Respondido', plural: 'Respondidos' },
  { id: 'orcamento', rotulo: 'Orçamento', plural: 'Com orçamento' },
  { id: 'agendou', rotulo: 'Agendou', plural: 'Agendaram' },
  { id: 'veio', rotulo: 'Veio', plural: 'Vieram' },
  { id: 'oficina', rotulo: 'Carro na oficina', plural: 'Carro na oficina' },
  { id: 'fechou', rotulo: 'Fechou', plural: 'Fecharam' },
];
const INDICE = new Map(ETAPAS.map((e, i) => [e.id, i]));

export const MOTIVOS = [
  { id: 'caro', rotulo: 'Achou caro' },
  { id: 'concorrente', rotulo: 'Foi em outra oficina' },
  { id: 'sem_retorno', rotulo: 'Parou de responder' },
  { id: 'desistiu', rotulo: 'Desistiu do serviço' },
  { id: 'nao_fazemos', rotulo: 'Não fazemos o serviço' },
  { id: 'prazo', rotulo: 'Prazo não atendeu' },
  { id: 'sem_urgencia', rotulo: 'Não era urgente' },
  { id: 'sem_vaga', rotulo: 'Não tinha vaga' },
  { id: 'outro', rotulo: 'Outro' },
];
export const rotuloDoMotivo = (id) => MOTIVOS.find((m) => m.id === id)?.rotulo || null;

export const FONTES_DO_VALOR = { patio: 'ordem de serviço do Pátio', orcamento: 'orçamento aprovado', agenda: 'valor da Agenda', manual: 'lançado à mão' };

export const rotuloDaEtapa = (id) => ETAPAS.find((e) => e.id === id)?.rotulo || null;

/** Até onde o contato chegou: a etapa atual da API ou, na falta dela, a mais avançada da lista. */
export function indiceAtual(item) {
  const direto = INDICE.get(item?.etapa_atual);
  if (direto !== undefined) return direto;
  let maior = 0;
  for (const e of item?.etapas || []) {
    const i = INDICE.get(e.id);
    if (i !== undefined && i > maior) maior = i;
  }
  return maior;
}

/**
 * Os sete traços de um contato.
 * estado: 'feito' (passou) · 'atual' (está aqui, em aberto) · 'fechou' · 'parou' (não fechou aqui) ·
 *         'pulou' (não há registro desta etapa, mas o contato foi adiante) · 'vazio' (ainda não chegou).
 * tom (só no 'atual'): 'espera' ou 'atencao' (quando a API marca "sem_resposta").
 */
export function miniSetores(item) {
  const feitas = new Map((item?.etapas || []).map((e) => [e.id, e]));
  const tipo = item?.desfecho?.tipo || 'aberto';
  const atual = tipo === 'fechou' ? ETAPAS.length - 1 : indiceAtual(item);
  const pedeAtencao = (item?.pendencias || []).includes('sem_resposta');
  return ETAPAS.map((etapa, i) => {
    const feita = feitas.get(etapa.id) || null;
    let estado = 'vazio', tom = null;
    if (i < atual) estado = feita && feita.em ? 'feito' : 'pulou';
    else if (i === atual) {
      if (tipo === 'fechou') { estado = 'fechou'; tom = 'bom'; }
      else if (tipo === 'nao_fechou') { estado = 'parou'; tom = 'fora'; }
      else { estado = 'atual'; tom = pedeAtencao ? 'atencao' : 'espera'; }
    }
    return { id: etapa.id, rotulo: etapa.rotulo, estado, tom, em: feita?.em || null };
  });
}

const PALAVRA_DO_ESTADO = { feito: 'passou', atual: 'está aqui', fechou: 'fechou', parou: 'parou aqui', pulou: 'sem registro', vazio: 'ainda não' };
export const palavraDoEstado = (estado) => PALAVRA_DO_ESTADO[estado] || '';

/**
 * Situação em palavras (a coluna "Situação" da torre).
 * tom: 'bom' (fechou) · 'fora' (não fechou) · 'espera' (em aberto) · 'atencao' (pede ação).
 */
export function situacao(item) {
  const d = item?.desfecho || {};
  const pendencias = item?.pendencias || [];
  if (d.tipo === 'fechou') {
    const semValor = d.valor == null;
    return { tipo: 'fechou', texto: 'Fechou', detalhe: semValor ? 'falta lançar o valor' : null, tom: 'bom', pede: semValor ? 'valor' : null };
  }
  if (d.tipo === 'nao_fechou') {
    const motivo = d.motivo_rotulo || rotuloDoMotivo(d.motivo);
    return { tipo: 'nao_fechou', texto: 'Não fechou', detalhe: motivo || 'falta dizer o motivo', tom: 'fora', pede: motivo ? null : 'motivo' };
  }
  const semResposta = pendencias.includes('sem_resposta');
  return {
    tipo: 'aberto',
    texto: semResposta ? 'Esperando resposta' : rotuloDaEtapa(item?.etapa_atual) || 'Em aberto',
    detalhe: semResposta && ehNumero(item?.espera_min) ? 'há ' + duracao(item.espera_min) : paradoHa(d.parado_dias),
    tom: semResposta ? 'atencao' : 'espera',
    pede: semResposta ? 'resposta' : null,
  };
}

/** Frase para leitor de tela: "Chegou até Agendou, etapa 4 de 7. Em aberto, parado há 3 dias." */
export function descricaoDosSetores(item) {
  const tracos = miniSetores(item);
  const s = situacao(item);
  const i = s.tipo === 'fechou' ? ETAPAS.length - 1 : indiceAtual(item);
  const partes = ['Chegou até ' + ETAPAS[i].rotulo + ', etapa ' + (i + 1) + ' de ' + ETAPAS.length + '.'];
  if (s.tipo === 'fechou') partes.push('Serviço fechado.');
  else if (s.tipo === 'nao_fechou') partes.push('Não fechou' + (s.detalhe ? ': ' + s.detalhe.toLowerCase() : '') + '.');
  else partes.push((s.tom === 'atencao' ? 'Esperando resposta' : 'Em aberto') + (s.detalhe ? ', ' + s.detalhe : '') + '.');
  const semRegistro = tracos.filter((t) => t.estado === 'pulou').map((t) => t.rotulo);
  if (semRegistro.length) partes.push('Sem registro de: ' + semRegistro.join(', ') + '.');
  return partes.join(' ');
}

export const PENDENCIAS = [
  { id: 'sem_valor', rotulo: 'Sem valor', verbo: 'Lançar valor', fila: true, pergunta: 'Quanto foi o serviço?' },
  { id: 'sem_motivo', rotulo: 'Sem motivo', verbo: 'Dizer o motivo', fila: true, pergunta: 'Por que não fechou?' },
  { id: 'sem_origem', rotulo: 'Sem origem', verbo: 'Dizer a origem', fila: true, pergunta: 'De onde veio este contato?' },
  { id: 'sem_resposta', rotulo: 'Sem resposta', verbo: 'Ver quem espera', fila: false, pergunta: null },
];
export const pendencia = (id) => PENDENCIAS.find((p) => p.id === id) || null;

/** Origens que uma pessoa pode marcar à mão (POST …/origem). A ordem é a do uso na oficina. */
export const ORIGENS_MANUAIS = [
  { canal: 'meta', rotulo: 'Anúncio da Meta', apoio: 'Instagram ou Facebook' },
  { canal: 'google', rotulo: 'Anúncio do Google', apoio: 'busca ou mapa' },
  { canal: 'indicacao', rotulo: 'Indicação', apoio: 'alguém indicou' },
  { canal: 'passagem', rotulo: 'Passou na porta', apoio: 'viu a fachada' },
  { canal: 'instagram', rotulo: 'Instagram', apoio: 'perfil, link da bio' },
  { canal: 'site', rotulo: 'Site', apoio: 'achou o site' },
  { canal: 'telefone', rotulo: 'Telefone', apoio: 'ligou para a oficina' },
  { canal: 'whatsapp', rotulo: 'WhatsApp direto', apoio: 'já tinha o número' },
];
