/* ============================================================================
   Propostas e diário de decisões do Gestor (lógica pura, testada em
   tela/_testes/gestor-e-campanhas.test.mjs).
   A linha vem de trafego_acoes (CONTRATO-TRAFEGO §1.2). A evidência pode vir
   como lista ou como { itens, verba, risco, risco_motivo } (formato que a T5a
   grava, API-ia.md); o veredito pode vir por extenso ("sem diferença clara")
   ou como código. Aqui tudo vira uma forma só, sem inventar número.
   ============================================================================ */

export const NOME_DO_TIPO = Object.freeze({
  pausar: 'Pausar', reativar: 'Reativar', aumentar_verba: 'Aumentar a verba', reduzir_verba: 'Reduzir a verba',
  trocar_criativo: 'Trocar o anúncio', mensagem_pronta: 'Mensagem pronta', negativar_termo: 'Tirar um termo de busca',
  ajustar_horario: 'Mudar o horário', corrigir_rastreio: 'Corrigir o rastreio', outro: 'Outra mudança',
});

const ONDE_SE_FAZ = { meta: 'no Gerenciador de Anúncios da Meta', google: 'no Google Ads' };

/** Status em palavra e tom de selo. */
export const STATUS = Object.freeze({
  proposta: { tom: 'espera', texto: 'Esperando você decidir' },
  aceita: { tom: 'atencao', texto: 'Aceita, falta fazer' },
  feita: { tom: 'bom', texto: 'Feita' },
  recusada: { tom: 'fora', texto: 'Recusada' },
  expirada: { tom: 'neutro', texto: 'Ninguém decidiu' },
});

const VEREDITOS = [
  { id: 'melhorou', tom: 'bom', texto: 'Melhorou', icone: 'sobe', parecidos: ['melhorou'] },
  { id: 'piorou', tom: 'grave', texto: 'Piorou', icone: 'desce', parecidos: ['piorou'] },
  { id: 'sem_diferenca', tom: 'neutro', texto: 'Sem diferença clara', icone: 'igual', parecidos: ['sem diferenca clara', 'sem diferenca', 'sem_diferenca', 'igual'] },
  { id: 'nao_mediu', tom: 'atencao', texto: 'Não deu para medir', icone: 'alerta', parecidos: ['nao deu para medir', 'nao_mediu', 'nao_deu', 'sem_medida', 'nao medido'] },
];
const ACENTO = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
const simples = (t) => String(t || '').normalize('NFD').replace(ACENTO, '').toLowerCase().replace(/[.!]+$/, '').trim();

/** "sem diferença clara" | "sem_diferenca" | … → { id, tom, texto, icone } ou null (ainda não medido). */
export function veredito(v) {
  if (v == null || v === '') return null;
  const s = simples(v).replace(/_/g, ' ');
  const achado = VEREDITOS.find((x) => x.parecidos.some((p) => simples(p).replace(/_/g, ' ') === s));
  if (achado) return { id: achado.id, tom: achado.tom, texto: achado.texto, icone: achado.icone };
  // Veredito novo do servidor: mostra como veio, sem cor de julgamento.
  const texto = String(v).trim();
  return { id: 'outro', tom: 'neutro', texto: texto.charAt(0).toUpperCase() + texto.slice(1), icone: 'ponto' };
}

function textoDaEvidencia(e) {
  if (typeof e === 'string') return e.trim() || null;
  if (!e || typeof e !== 'object') return null;
  const t = e.texto ?? e.dado ?? e.descricao ?? null;
  if (typeof t === 'string' && t.trim()) return t.trim();
  if (typeof e.rotulo === 'string' && e.valor != null) return e.rotulo + ': ' + e.valor + (e.periodo ? ' (' + e.periodo + ')' : '');
  return null;
}

/** Uma ação da API → a forma que a tela desenha. */
export function lerAcao(a) {
  if (!a || typeof a !== 'object') return null;
  const ev = a.evidencias;
  const lista = Array.isArray(ev) ? ev : ev && Array.isArray(ev.itens) ? ev.itens : [];
  const risco = a.risco || (ev && !Array.isArray(ev) ? ev.risco : null) || null;
  const riscoMotivo = a.risco_motivo || (ev && !Array.isArray(ev) ? ev.risco_motivo : null) || null;
  const verba = a.verba || (ev && !Array.isArray(ev) ? ev.verba : null) || null;
  const alvo = a.alvo && typeof a.alvo === 'object' ? a.alvo : {};
  const status = STATUS[a.status] ? a.status : 'proposta';
  return {
    id: String(a.id),
    tipo: a.tipo || 'outro',
    nomeDoTipo: NOME_DO_TIPO[a.tipo] || NOME_DO_TIPO.outro,
    titulo: typeof a.titulo === 'string' && a.titulo.trim() ? a.titulo.trim() : NOME_DO_TIPO[a.tipo] || 'Sugestão do Gestor',
    porque: typeof a.porque === 'string' ? a.porque.trim() : '',
    evidencias: lista.map(textoDaEvidencia).filter(Boolean),
    risco: risco === 'alto' ? 'alto' : risco === 'medio' ? 'medio' : 'baixo',
    riscoMotivo: typeof riscoMotivo === 'string' ? riscoMotivo.replace(/^Risco alto:\s*/i, '').trim() : null,
    verba,
    alvo: { plataforma: alvo.plataforma || null, nivel: alvo.nivel || null, nome: alvo.nome || null },
    status,
    statusTexto: STATUS[status],
    autor: a.origem === 'pessoa' ? a.autor || 'Alguém da oficina' : a.origem === 'externa' ? 'IA de fora' : 'Gestor IA',
    criadaEm: a.criada_em || null,
    decididaPor: a.decidida_por || null,
    decididaEm: a.decidida_em || null,
    feitaEm: a.feita_em || null,
    medirEm: a.medir_em || null,
    antes: a.antes && typeof a.antes === 'object' ? a.antes : null,
    depois: a.depois && typeof a.depois === 'object' ? a.depois : null,
    veredito: veredito(a.veredito),
    nota: typeof a.nota === 'string' && a.nota.trim() ? a.nota.trim() : null,
  };
}

/** A frase que deixa claro que nada é feito sozinho, com o lugar certo de fazer. */
export function quemFaz(acao) {
  const onde = acao && acao.alvo ? ONDE_SE_FAZ[acao.alvo.plataforma] : null;
  return 'Nada é feito sozinho: aceitar só registra a decisão. ' + (onde ? 'Quem muda é você, ' + onde + '.' : 'Quem faz é você.');
}

/** Números que o diário sabe escrever no antes e depois (o resto da linha fica de fora). */
export const MEDIDAS = Object.freeze([
  { id: 'contatos', rotulo: 'Contatos', formato: 'inteiro' },
  { id: 'fecharam', rotulo: 'Fecharam', formato: 'inteiro' },
  { id: 'custo_por_contato', rotulo: 'Custo por contato', formato: 'dinheiro' },
  { id: 'custo_por_servico', rotulo: 'Custo por serviço fechado', formato: 'dinheiro' },
  { id: 'gasto', rotulo: 'Gasto', formato: 'dinheiro' },
  { id: 'faturado', rotulo: 'Faturado', formato: 'dinheiro' },
  { id: 'retorno', rotulo: 'Cada R$ 1 virou', formato: 'centavos' },
]);

/** Linhas do antes e depois: só as medidas que aparecem em pelo menos um lado. */
export function antesEDepois(antes, depois) {
  const a = antes || {}, d = depois || {};
  return MEDIDAS.filter((m) => typeof a[m.id] === 'number' || typeof d[m.id] === 'number')
    .map((m) => ({ ...m, antes: typeof a[m.id] === 'number' ? a[m.id] : null, depois: typeof d[m.id] === 'number' ? d[m.id] : null }));
}

/** Separa o que pede decisão (proposta e aceita sem fazer) do que já é história. */
export function separar(acoes) {
  const lidas = (Array.isArray(acoes) ? acoes : []).map(lerAcao).filter(Boolean);
  return {
    abertas: lidas.filter((a) => a.status === 'proposta' || a.status === 'aceita'),
    diario: lidas.filter((a) => a.status !== 'proposta'),
  };
}

/** Perguntas prontas: mudam com o que está ligado. */
export function perguntasProntas({ temConta = false, temContatos = true } = {}) {
  if (!temContatos) {
    return ['O que preciso ligar para o Tráfego funcionar?', 'Como faço para saber de onde vem cada contato?', 'O que é a mensagem pronta por anúncio?'];
  }
  if (!temConta) {
    return ['De onde vêm os contatos que fecham?', 'Quem está esperando resposta?', 'Por que tantos contatos estão sem origem?', 'O que falta ligar para eu ver o custo?'];
  }
  return ['Qual campanha eu pauso?', 'Os anúncios estão se pagando este mês?', 'Onde vale pôr mais verba?', 'Por que a Meta conta mais conversas do que chegam?'];
}
