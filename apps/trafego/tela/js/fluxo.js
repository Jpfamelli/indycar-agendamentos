/* ============================================================================
   Fluxo de eventos do Gestor IA (lógica pura, testada em tela/_testes/fluxo.test.mjs).
   POST api/gestor/perguntar responde em text/event-stream: blocos separados por
   linha em branco, com "event: <tipo>" e uma ou mais linhas "data: <json>".
   Tipos conhecidos: texto, ferramenta, proposta, fim, erro. O que vier diferente
   é ignorado sem quebrar a conversa.
   O pedaço que chega pela rede pode cortar uma linha (ou um "\r\n") no meio:
   o leitor guarda a sobra até a próxima chegada.
   ============================================================================ */

const QUEBRA = /\r\n|\r|\n/;

/** Leitor incremental: empurrar(pedaço) devolve os eventos completos; fim() solta o que sobrou. */
export function criarLeitorDeEventos() {
  let sobra = '';
  let evento = '';
  let dados = [];
  const prontos = [];

  function linha(l) {
    if (l === '') {
      if (dados.length || evento) prontos.push({ evento: evento || 'message', dados: dados.join('\n') });
      evento = '';
      dados = [];
      return;
    }
    if (l[0] === ':') return;                       // comentário (o servidor manda para manter a conexão viva)
    const i = l.indexOf(':');
    const campo = i < 0 ? l : l.slice(0, i);
    let valor = i < 0 ? '' : l.slice(i + 1);
    if (valor[0] === ' ') valor = valor.slice(1);
    if (campo === 'event') evento = valor.trim();
    else if (campo === 'data') dados.push(valor);
  }

  return {
    empurrar(pedaco) {
      sobra += String(pedaco == null ? '' : pedaco);
      // Um "\r" no fim pode ser metade de um "\r\n": fica guardado até o próximo pedaço.
      const corte = sobra.endsWith('\r') ? sobra.length - 1 : sobra.length;
      const linhas = sobra.slice(0, corte).split(QUEBRA);
      sobra = linhas.pop() + sobra.slice(corte);
      for (const l of linhas) linha(l);
      return prontos.splice(0);
    },
    fim() {
      if (sobra) { for (const l of sobra.split(QUEBRA)) linha(l); sobra = ''; }
      linha('');
      return prontos.splice(0);
    },
  };
}

function lerJson(texto) {
  try { return JSON.parse(texto); } catch { return undefined; }
}
const textoDe = (v) => (typeof v === 'string' ? v : null);

/**
 * { evento, dados } cru → evento da conversa:
 *   { tipo: 'texto', texto } · { tipo: 'ferramenta', nome, rotulo } · { tipo: 'proposta', proposta }
 *   { tipo: 'fim', conversa_id, uso } · { tipo: 'erro', mensagem, codigo } · { tipo: 'desconhecido', evento }
 */
export function interpretar(cru) {
  const bruto = cru && typeof cru.dados === 'string' ? cru.dados : '';
  const json = lerJson(bruto);
  const obj = json && typeof json === 'object' && !Array.isArray(json) ? json : null;
  let tipo = cru && cru.evento && cru.evento !== 'message' ? cru.evento : (obj && typeof obj.tipo === 'string' ? obj.tipo : 'message');
  tipo = String(tipo).toLowerCase();
  if (tipo === 'texto') {
    // JSON com { texto } (o combinado), texto em JSON ("…") ou o texto cru da linha (um número solto também é texto).
    const texto = obj ? (textoDe(obj.texto) ?? textoDe(obj.delta) ?? textoDe(obj.t)) : (textoDe(json) ?? (Array.isArray(json) ? null : bruto));
    return texto == null ? { tipo: 'desconhecido', evento: tipo } : { tipo: 'texto', texto };
  }
  if (tipo === 'ferramenta') {
    const nome = obj ? textoDe(obj.nome) : textoDe(json);
    return { tipo: 'ferramenta', nome: nome || null, rotulo: (obj && textoDe(obj.rotulo)) || null };
  }
  if (tipo === 'proposta') {
    const proposta = obj && obj.proposta && typeof obj.proposta === 'object' ? obj.proposta : obj;
    return proposta ? { tipo: 'proposta', proposta } : { tipo: 'desconhecido', evento: tipo };
  }
  if (tipo === 'fim') {
    return { tipo: 'fim', conversa_id: obj && obj.conversa_id != null ? String(obj.conversa_id) : null, uso: obj && obj.uso ? obj.uso : null };
  }
  if (tipo === 'erro') {
    const mensagem = (obj && (textoDe(obj.erro) || textoDe(obj.mensagem))) || textoDe(json) || (json === undefined && bruto ? bruto : null);
    return { tipo: 'erro', mensagem: mensagem || 'A resposta parou no meio.', codigo: (obj && textoDe(obj.codigo)) || null };
  }
  return { tipo: 'desconhecido', evento: tipo };
}

/* O que o Gestor está olhando, em palavras do dono. A API pode mandar o rótulo pronto; senão, este. */
const OLHANDO = {
  saude: 'conferindo o que está ligado',
  resumo_do_periodo: 'lendo o resumo do período',
  funil_por_origem: 'olhando o caminho dos contatos',
  campanhas: 'olhando as campanhas',
  palavras_e_termos: 'olhando as palavras de busca',
  contatos: 'olhando os contatos',
  contato: 'abrindo um contato',
  conversa: 'lendo uma conversa',
  motivos_de_nao_fechar: 'vendo por que não fecharam',
  agenda: 'olhando a agenda',
  horarios: 'olhando os horários',
  metas: 'conferindo as metas',
  diario_de_decisoes: 'relendo as decisões anteriores',
  proposta_criar: 'escrevendo uma sugestão',
};

/** "olhando as campanhas…" (sempre com reticências e começando em minúscula, para caber depois de "Gestor:"). */
export function olhando({ nome, rotulo } = {}) {
  let t = String(rotulo || OLHANDO[nome] || 'consultando os números').trim();
  t = t.replace(/[.…]+$/, '');
  return t.charAt(0).toLowerCase() + t.slice(1) + '…';
}

/**
 * Lê o corpo da resposta (ReadableStream de bytes) e chama aoEvento(evento interpretado) para cada um.
 * Devolve quando o fluxo acaba. Erro de rede no meio é relançado (quem chamou decide o que mostrar).
 */
export async function lerFluxo(corpo, aoEvento) {
  const leitor = corpo.getReader();
  const decodificador = new TextDecoder('utf-8');
  const eventos = criarLeitorDeEventos();
  try {
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      for (const cru of eventos.empurrar(decodificador.decode(value, { stream: true }))) aoEvento(interpretar(cru));
    }
    for (const cru of eventos.empurrar(decodificador.decode())) aoEvento(interpretar(cru));
    for (const cru of eventos.fim()) aoEvento(interpretar(cru));
  } finally {
    try { leitor.releaseLock(); } catch { /* já solto */ }
  }
}
