/* ============================================================
   Ações — "o que fazer agora" (rodada 7, 25/10/2026).
   Transforma os avisos do ciclo (orçamento parado, cliente que abriu e
   não respondeu, desconto pedido, carro pronto sem retirar…) e os alertas
   do radar numa FILA ordenada, com os atalhos de cada item: abrir o lead
   no CRM, a conversa no Atendimento, o orçamento no Orçador, a OS no Pátio
   ou a Agenda — sempre em aba nomeada. Tudo puro e testável; a leitura do
   banco vem do ciclo.js (que já tolera Orçador/Pátio fora do ar).
   ============================================================ */
'use strict';

const Eco = require('./public/ecossistema.js');
const Vocab = require('./vocabulario');

const brl = v => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const primeiroNome = n => String(n || '').trim().split(/\s+/)[0] || '';

/* Peso de cada tipo na fila (quanto maior, antes) e os botões, na ordem em que fazem sentido. */
const TIPOS = {
  desconto_pedido:   { peso: 90, titulo: 'Cliente pediu desconto', botoes: ['orcamento', 'conversa'] },
  horario_pedido:    { peso: 88, titulo: 'Aprovou e pediu horário', botoes: ['agenda', 'orcamento'] },
  orc_quente:        { peso: 85, titulo: 'Abriu o orçamento e não respondeu', botoes: ['conversa', 'orcamento'] },
  pronto_parado:     { peso: 80, titulo: 'Carro pronto esperando retirada', botoes: ['os', 'conversa'] },
  follow_vencido:    { peso: 75, titulo: 'Retorno combinado venceu', botoes: ['conversa', 'orcamento'] },
  validade_vencendo: { peso: 70, titulo: 'Orçamento perto de vencer', botoes: ['orcamento', 'conversa'] },
  aprovado_sem_os:   { peso: 65, titulo: 'Aprovado e o carro não entrou', botoes: ['agenda', 'orcamento', 'conversa'] },
  orcamento_parado:  { peso: 60, titulo: 'Orçamento sem resposta', botoes: ['conversa', 'orcamento'] },
  lead_parado:       { peso: 55, titulo: 'Lead novo sem primeiro toque', botoes: ['crm', 'conversa'] },
  orc_nao_aberto:    { peso: 50, titulo: 'Cliente nem abriu o orçamento', botoes: ['conversa', 'orcamento'] },
  sem_orcamento:     { peso: 40, titulo: 'Agendado sem orçamento', botoes: ['orcar', 'crm'] },
  valor_sugerido:    { peso: 30, titulo: 'Entregue sem valor lançado', botoes: ['crm', 'os'] },
};
const ROTULO_BOTAO = {
  crm: ['Abrir o lead', 'crm'], conversa: ['Abrir a conversa', 'atendimento'], orcamento: ['Abrir o orçamento', 'orcador'],
  os: ['Abrir a OS', 'patio'], agenda: ['Abrir a Agenda', 'agenda'], orcar: ['Fazer o orçamento', 'orcador'],
};

/** Recado pronto para o consultor mandar (vocabulário da casa; nunca inventa valor nem prazo). */
function recadoDo(tipo, it) {
  const nome = primeiroNome(it.nome), v = it.valor > 0 ? brl(it.valor) : null;
  const ola = nome ? `Olá, ${nome}!` : 'Olá!';
  const carro = it.carro ? ` do seu ${it.carro}` : '';
  const frases = {
    orc_quente: `${ola} Vi que você abriu o orçamento${carro}${v ? ` (${v})` : ''}. Ficou alguma dúvida? Posso te ajudar a fechar.`,
    orcamento_parado: `${ola} Passando para saber se deu para olhar o orçamento${carro}${v ? ` de ${v}` : ''}. Qualquer dúvida é só falar.`,
    orc_nao_aberto: `${ola} Mandei o orçamento${carro}, mas não sei se chegou direitinho. Conseguiu abrir o link?`,
    follow_vencido: `${ola} Como combinado, volto a falar sobre o orçamento${carro}. Conseguiu decidir?`,
    validade_vencendo: `${ola} O orçamento${carro}${v ? ` de ${v}` : ''} vence em breve. Quer que eu segure o valor para você?`,
    horario_pedido: `${ola} Recebi a aprovação do orçamento${carro}! Vou confirmar o horário que você pediu e já te aviso.`,
    aprovado_sem_os: `${ola} Seu orçamento${carro} está aprovado. Qual dia fica bom para trazer o carro?`,
    pronto_parado: `${ola} Seu carro já está pronto aqui na IndyCar. Quando você consegue vir buscar?`,
    lead_parado: `${ola} Aqui é da IndyCar, vi que você nos procurou. Como posso ajudar com o seu carro?`,
    sem_orcamento: null, desconto_pedido: null, valor_sugerido: null,
  };
  const t = frases[tipo];
  return t ? Vocab.limpar(t) : null;
}

/** Botões do item: só os que têm link, com o nome da aba do app (window.open(link, alvo)). */
function botoesDo(tipo, it) {
  const cfg = TIPOS[tipo];
  const links = it.links || {};
  return (cfg ? cfg.botoes : ['crm']).map(k => {
    const [rotulo, app] = ROTULO_BOTAO[k] || [k, 'crm'];
    return links[k] ? { chave: k, rotulo, app, alvo: Eco.alvo(app), link: links[k] } : null;
  }).filter(Boolean);
}

/** Pontuação: peso do tipo + valor em jogo (até 15) + tempo parado (até 10). */
function pontuar(tipo, it) {
  const peso = TIPOS[tipo]?.peso ?? 20;
  const valor = Math.min(15, Math.max(0, Number(it.valor) || 0) / 500);
  const tempo = Math.min(10, Math.max(0, Number(it.horas) || 0) / 12);
  return Math.round((peso + valor + tempo) * 10) / 10;
}

/** Uma frase do porquê, com número (puro). */
function motivoDo(tipo, it) {
  const h = it.horas != null ? Math.round(it.horas) : null;
  const dias = h != null && h >= 48 ? `${Math.floor(h / 24)} dias` : h != null ? `${h} h` : null;
  const v = it.valor > 0 ? brl(it.valor) : null;
  const partes = {
    desconto_pedido: `pediu desconto há ${dias || 'pouco'}${v ? ` · ${v}` : ''}`,
    horario_pedido: `aprovou${v ? ` ${v}` : ''} e pediu horário`,
    orc_quente: `abriu há ${dias || 'pouco'} e não respondeu${v ? ` · ${v}` : ''}`,
    pronto_parado: `pronto há ${dias || 'tempo'} sem retirar`,
    follow_vencido: `retorno venceu há ${dias || 'pouco'}${v ? ` · ${v}` : ''}`,
    validade_vencendo: `vence em ${dias || 'breve'}${v ? ` · ${v}` : ''}`,
    aprovado_sem_os: `aprovado há ${dias || 'dias'}, sem OS${v ? ` · ${v}` : ''}`,
    orcamento_parado: `sem resposta há ${dias || 'dias'}${v ? ` · ${v}` : ''}`,
    lead_parado: `lead novo há ${dias || 'dias'} sem contato`,
    orc_nao_aberto: `enviado há ${dias || 'dias'}, nunca aberto${v ? ` · ${v}` : ''}`,
    sem_orcamento: `já está ${it.status_nome || 'agendado'} e não tem orçamento`,
    valor_sugerido: `entregue sem valor${v ? `; orçamento aprovado soma ${v}` : ''}`,
  };
  return partes[tipo] || '';
}

/**
 * Fila ordenada (pura). Recebe o ciclo consolidado (consolidarCiclo) e devolve itens prontos para a tela.
 * Um mesmo lead pode aparecer por motivos diferentes; só o de maior pontuação fica (a pessoa quer a próxima ação, não cinco).
 */
function fila(ciclo, { limite = 40 } = {}) {
  const todos = [];
  for (const a of ciclo?.alertas || []) {
    if (!TIPOS[a.tipo]) continue;
    const lista = a.itens || [];
    // Alerta antigo sem itens (ex.: banco de teste) ainda aparece, como um item sem nome.
    if (!lista.length) { todos.push({ tipo: a.tipo, titulo: TIPOS[a.tipo].titulo, nome: null, motivo: a.texto, valor: a.valor || 0, pontos: pontuar(a.tipo, { valor: a.valor }), botoes: [], recado: null, quantidade: a.quantidade }); continue; }
    for (const it of lista) {
      todos.push({
        tipo: a.tipo, titulo: TIPOS[a.tipo].titulo, lead_id: it.lead_id, nome: it.nome, telefone: it.telefone, canal: it.canal, campanha: it.campanha,
        carro: it.carro, placa: it.placa, sem_responsavel: !!it.sem_responsavel, valor: it.valor || 0, horas: it.horas ?? null, motivo: motivoDo(a.tipo, it),
        pontos: pontuar(a.tipo, it), botoes: botoesDo(a.tipo, it), recado: recadoDo(a.tipo, it), links: it.links || {}, orcamento_id: it.orcamento_id || null, os_id: it.os_id || null,
      });
    }
  }
  const melhor = new Map();
  for (const x of todos) {
    const chave = x.lead_id || `${x.tipo}:${x.quantidade}`;
    const atual = melhor.get(chave);
    if (!atual || x.pontos > atual.pontos) melhor.set(chave, x);
  }
  const itens = [...melhor.values()].sort((a, b) => b.pontos - a.pontos || (b.valor - a.valor) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  return {
    total: itens.length,
    valor_em_jogo: itens.reduce((s, x) => s + (x.valor || 0), 0),
    por_tipo: Object.fromEntries(Object.keys(TIPOS).map(t => [t, itens.filter(x => x.tipo === t).length]).filter(([, n]) => n)),
    itens: itens.slice(0, limite),
  };
}

/* Colunas do CSV da fila (sem observações; links para abrir cada registro). */
const CAMPOS_CSV = [['pontos', 'Prioridade'], ['nome', 'Cliente'], ['telefone', 'Telefone'], ['titulo', 'O que fazer'], ['motivo', 'Motivo'], ['valor', 'Valor'], ['horas', 'Horas paradas'],
  ['canal', 'Canal'], ['campanha', 'Campanha'], ['carro', 'Carro'], ['placa', 'Placa'], ['dono', 'Responsável'], ['link_crm', 'Link no CRM'], ['link_conversa', 'Link da conversa'], ['link_orcamento', 'Link do orçamento'], ['link_os', 'Link da OS'], ['recado', 'Recado sugerido']];
/** Linhas do CSV (puro): quem não tem responsável no CRM sai marcado. */
function linhasCSV(f) {
  return (f?.itens || []).map(x => ({ ...x, dono: x.sem_responsavel ? 'sem responsável' : '', link_crm: x.links?.crm || '', link_conversa: x.links?.conversa || '', link_orcamento: x.links?.orcamento || '', link_os: x.links?.os || '' }));
}

/** Alertas do radar (campanha) que pedem ação: críticos e não lidos primeiro. Puro. */
function acoesDoRadar(alertas = []) {
  return alertas.filter(a => !a.lido_em && ['critico', 'alerta'].includes(a.severidade) && !String(a.entidade_ext || '').startsWith('ciclo:'))
    .sort((a, b) => (a.severidade === 'critico' ? 0 : 1) - (b.severidade === 'critico' ? 0 : 1) || String(b.criado_em).localeCompare(String(a.criado_em)))
    .slice(0, 6)
    .map(a => ({ id: a.id, severidade: a.severidade, campanha: a.nivel === 'campanha' ? a.entidade_nome : (a.campanha_nome || a.entidade_nome), plataforma: a.plataforma, mensagem: a.mensagem, criado_em: a.criado_em }));
}

/**
 * Para onde o alerta do radar leva (puro). A tela só interpreta: aba do próprio Ads + filtro.
 *  - alerta do ciclo (entidade ciclo:<tipo>) -> o cartão "O que fazer agora" no Painel;
 *  - alerta do CRM (crm:<campanha>) -> a aba Leads filtrada pela campanha;
 *  - alerta de campanha/conjunto/criativo -> Campanhas ou Criativos filtrada pelo nome.
 */
function acaoDoAlerta(a) {
  const ext = String(a?.entidade_ext || '');
  if (ext.startsWith('ciclo:')) return { rotulo: 'Ver quem está esperando', aba: 'painel', ancora: 'cartao-acoes', tipo: ext.slice(6) };
  if (ext.startsWith('crm:')) return { rotulo: 'Ver os leads da campanha', aba: 'leads', q: String(a.entidade_nome || ext.slice(4)).slice(0, 80), canal: a.plataforma || '' };
  if (a?.nivel === 'anuncio') return { rotulo: 'Ver o criativo', aba: 'criativos', q: String(a.entidade_nome || '').slice(0, 80) };
  if (a?.nivel === 'conta') return { rotulo: 'Ver o painel', aba: 'painel' };
  const nome = a?.nivel === 'campanha' ? a.entidade_nome : (a?.campanha_nome || a?.entidade_nome);
  return { rotulo: 'Ver a campanha', aba: 'campanhas', q: String(nome || '').slice(0, 80) };
}

/** Resumo de uma linha para o topo do cartão e para o relatório do dono (puro). */
function frase(f) {
  if (!f || !f.total) return null;
  const grandes = Object.entries(f.por_tipo).sort((a, b) => (TIPOS[b[0]]?.peso || 0) - (TIPOS[a[0]]?.peso || 0)).slice(0, 3)
    .map(([t, n]) => `${n} ${TIPOS[t].titulo.toLowerCase()}`);
  return `${f.total} cliente(s) esperando você${f.valor_em_jogo > 0 ? ` (${brl(f.valor_em_jogo)} em jogo)` : ''}: ${grandes.join(', ')}.`;
}

module.exports = { CAMPOS_CSV, linhasCSV, acaoDoAlerta, TIPOS, fila, acoesDoRadar, frase, recadoDo, botoesDo, pontuar, motivoDo };
