/* ============================================================================
   Filtros da Jornada (lógica pura, testada em tests/tela-filtros.test.mjs).
   O endereço da tela guarda os filtros; daqui sai a consulta para a API
   (contrato §5.3). Tudo que vem do endereço é conferido antes de ir adiante.
   ============================================================================ */

import { periodoValido } from './formato.js';

export const DESFECHOS = [
  { id: '', rotulo: 'Todos' },
  { id: 'aberto', rotulo: 'Em aberto' },
  { id: 'fechou', rotulo: 'Fecharam' },
  { id: 'nao_fechou', rotulo: 'Não fecharam' },
];
export const ORDENS = [
  { id: 'recentes', rotulo: 'Mais recentes primeiro' },
  { id: 'parados', rotulo: 'Parados há mais tempo' },
  { id: 'valor', rotulo: 'Maior valor' },
];
const PENDENCIAS = ['sem_origem', 'sem_valor', 'sem_motivo', 'sem_resposta'];
const ETAPAS = ['contato', 'respondido', 'orcamento', 'agendou', 'veio', 'oficina', 'fechou'];
const CANAIS = ['meta', 'google', 'site', 'instagram', 'indicacao', 'passagem', 'telefone', 'whatsapp', 'desconhecida'];
export const TAMANHO_PAGINA = 50;

export const FILTROS_PADRAO = Object.freeze({ desfecho: '', paga: '', canal: '', campanha: '', etapa: '', pendencia: '', q: '', ordem: 'recentes', pagina: 1 });

const um = (valor, lista) => (lista.includes(valor) ? valor : '');
const limpo = (valor, max) => String(valor == null ? '' : valor).replace(/[<>]/g, '').trim().slice(0, max);

/** Parâmetros do endereço → filtros conferidos (o que não é válido volta ao padrão). */
export function filtrosDaRota(params = {}) {
  const pagina = Number.parseInt(params.pagina, 10);
  return {
    desfecho: um(params.desfecho, ['aberto', 'fechou', 'nao_fechou']),
    paga: um(params.paga, ['1', '0']),
    canal: um(params.canal, CANAIS),
    campanha: limpo(params.campanha, 120),
    etapa: um(params.etapa, ETAPAS),
    pendencia: um(params.pendencia, PENDENCIAS),
    q: limpo(params.q, 80),
    ordem: um(params.ordem, ['recentes', 'parados', 'valor']) || 'recentes',
    pagina: Number.isFinite(pagina) && pagina > 1 ? Math.min(pagina, 9999) : 1,
  };
}

/** Filtros → só o que foge do padrão (é o que vai para o endereço). */
export function parametrosDaRota(filtros) {
  const f = { ...FILTROS_PADRAO, ...filtros };
  const saida = {};
  for (const chave of Object.keys(FILTROS_PADRAO)) {
    if (f[chave] !== FILTROS_PADRAO[chave] && f[chave] !== '' && f[chave] != null) saida[chave] = String(f[chave]);
  }
  return saida;
}

/** Consulta para GET /api/jornada. */
export function consultaDaApi(filtros, periodo, { tamanho = TAMANHO_PAGINA } = {}) {
  const f = filtrosDaRota(filtros);
  const q = new URLSearchParams();
  q.set('periodo', periodoValido(periodo));
  for (const chave of ['canal', 'paga', 'campanha', 'desfecho', 'etapa', 'pendencia', 'q']) if (f[chave]) q.set(chave, f[chave]);
  q.set('ordem', f.ordem);
  q.set('pagina', String(f.pagina));
  q.set('tamanho', String(Math.min(200, Math.max(1, tamanho))));
  return q.toString();
}

/** Muda um ou mais filtros; qualquer mudança que não seja de página volta para a página 1. */
export function mudar(filtros, mudancas) {
  const novo = filtrosDaRota({ ...filtros, ...mudancas });
  if (!('pagina' in mudancas)) novo.pagina = 1;
  return novo;
}

/** Liga ou desliga um valor (ficha de um toque). */
export function alternar(filtros, chave, valor) {
  return mudar(filtros, { [chave]: filtros[chave] === valor ? '' : valor });
}

/** Quantos filtros estão ligados (ordem e página não contam). */
export function contarAtivos(filtros) {
  const f = filtrosDaRota(filtros);
  return ['desfecho', 'paga', 'canal', 'campanha', 'etapa', 'pendencia', 'q'].filter((c) => f[c]).length;
}

const ROTULO_PENDENCIA = { sem_origem: 'Sem origem', sem_valor: 'Sem valor', sem_motivo: 'Sem motivo', sem_resposta: 'Sem resposta' };
const ROTULO_ETAPA = { contato: 'Contato', respondido: 'Respondido', orcamento: 'Orçamento', agendou: 'Agendou', veio: 'Veio', oficina: 'Carro na oficina', fechou: 'Fechou' };

/**
 * Lista dos filtros ligados, com o nome que a pessoa lê (para a linha "filtrando por…").
 * `opcoes` é o objeto `filtros` da resposta da API (canais e campanhas com rótulo).
 */
export function filtrosLigados(filtros, opcoes = {}) {
  const f = filtrosDaRota(filtros);
  const saida = [];
  if (f.q) saida.push({ chave: 'q', rotulo: 'Busca: ' + f.q });
  if (f.desfecho) saida.push({ chave: 'desfecho', rotulo: DESFECHOS.find((d) => d.id === f.desfecho).rotulo });
  if (f.paga) saida.push({ chave: 'paga', rotulo: f.paga === '1' ? 'Só de anúncio' : 'Fora de anúncio' });
  if (f.canal) saida.push({ chave: 'canal', rotulo: (opcoes.canais || []).find((c) => c.id === f.canal)?.rotulo || f.canal });
  if (f.campanha) saida.push({ chave: 'campanha', rotulo: (opcoes.campanhas || []).find((c) => c.ext === f.campanha)?.nome || 'Campanha' });
  if (f.etapa) saida.push({ chave: 'etapa', rotulo: 'Etapa: ' + ROTULO_ETAPA[f.etapa] });
  if (f.pendencia) saida.push({ chave: 'pendencia', rotulo: ROTULO_PENDENCIA[f.pendencia] });
  return saida;
}

/** Conta de páginas a partir do bloco `pagina` da API. */
export function paginas({ atual = 1, tamanho = TAMANHO_PAGINA, total = 0 } = {}) {
  const t = Math.max(1, Number(tamanho) || TAMANHO_PAGINA);
  const n = Math.max(0, Number(total) || 0);
  const ultima = Math.max(1, Math.ceil(n / t));
  const a = Math.min(Math.max(1, Number(atual) || 1), ultima);
  return { atual: a, ultima, de: n ? (a - 1) * t + 1 : 0, ate: Math.min(n, a * t), total: n, temAnterior: a > 1, temProxima: a < ultima };
}
