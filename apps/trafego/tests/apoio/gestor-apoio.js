/* ============================================================
   Apoio dos testes do Gestor IA (rodada 8, frente T5b): o dublê do modelo (devolve tool_use e texto, sem rede),
   o banco de mentira com id uuid nas tabelas novas, o Gestor montado com a camada de ferramentas de verdade (T5a)
   e a subida do servidor na faixa da frente (3460 a 3469). Não é arquivo de teste.
   ============================================================ */
'use strict';

const crypto = require('node:crypto');
const F = require('../../ia/ferramentas');
const Auditoria = require('../../ia/auditoria');
const G = require('../../ia/gestor');
const Decisoes = require('../../ia/decisoes');
const Campanhas = require('../../motor/campanhas');
const { ambienteDaPorta, tabelasDaPorta, TD } = require('./ia-porta');

/** O banco de mentira dá id "novo-N"; as tabelas do Gestor e do diário usam uuid de verdade. */
function comUuid(sb, tabelas = ['trafego_ia_conversas', 'trafego_acoes']) {
  const from = sb.from;
  sb.from = tabela => {
    const q = from(tabela);
    if (tabelas.includes(tabela)) {
      const inserir = q.insert.bind(q);
      q.insert = linhas => inserir((Array.isArray(linhas) ? linhas : [linhas]).map(l => ({ id: crypto.randomUUID(), ...l })));
    }
    return q;
  };
  return sb;
}

/** Bloco de pedido de ferramenta. */
const usar = (nome, input = {}, id = `toolu_${crypto.randomBytes(6).toString('hex')}`) => ({ type: 'tool_use', id, name: nome, input });
/** Bloco de texto. */
const texto = t => ({ type: 'text', text: t });

/**
 * O dublê do modelo. `roteiro` é uma lista de passos, um por chamada:
 *   { content: [...blocos], stop_reason? }       resposta pronta (o texto sai em pedaços pelo evento 'text')
 *   { parcial: 'texto', erro: Error }             manda um pedaço de texto e quebra no meio
 *   { esperar: true }                            fica parado até o sinal abortar (prazo ou pessoa fechou)
 *   (corpo, opcoes) => passo                     decide na hora
 * Guarda cada corpo recebido (cópia) em `chamadas`.
 */
function clienteFalso(roteiro) {
  const chamadas = [];
  function stream(corpo, opcoes = {}) {
    const n = chamadas.length;
    chamadas.push({ corpo: structuredClone(corpo), canal: this === beta.messages ? 'beta' : 'messages', temSinal: !!opcoes.signal });
    const ouvintes = [];
    const obj = {
      on(ev, fn) { if (ev === 'text') ouvintes.push(fn); return obj; },
      async finalMessage() {
        let passo = roteiro[Math.min(n, roteiro.length - 1)];
        if (typeof passo === 'function') passo = await passo(corpo, opcoes, n);
        if (passo instanceof Error) throw passo;
        if (passo.esperar) {
          await new Promise((_, falhou) => {
            const abortar = () => falhou(Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' }));
            if (opcoes.signal.aborted) abortar(); else opcoes.signal.addEventListener('abort', abortar, { once: true });
          });
        }
        if (passo.parcial) { for (const fn of ouvintes) fn(passo.parcial, passo.parcial); }
        if (passo.erro) throw passo.erro;
        for (const b of passo.content) {
          if (b.type !== 'text') continue;
          const meio = Math.ceil(b.text.length / 2);
          for (const pedaco of [b.text.slice(0, meio), b.text.slice(meio)]) if (pedaco) for (const fn of ouvintes) fn(pedaco, pedaco);
        }
        return {
          id: `msg_${n}`, type: 'message', role: 'assistant', model: corpo.model,
          stop_reason: passo.stop_reason || (passo.content.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn'),
          usage: { input_tokens: 1200, output_tokens: 80, cache_read_input_tokens: n ? 1000 : 0, cache_creation_input_tokens: n ? 0 : 1000, ...(passo.usage || {}) },
          content: passo.content,
        };
      },
    };
    return obj;
  }
  const messages = { stream: (c, o) => stream.call(messages, c, o) };
  const beta = { messages: { stream: (c, o) => stream.call(beta.messages, c, o) } };
  return { chamadas, messages, beta };
}

/** Limitador igual ao do app (seguranca.criarLimitador), para os testes não dividirem estado. */
const limitador = () => require('../../seguranca').criarLimitador();

/**
 * Tudo montado: banco (com as tabelas da porta + conversas e ia_acoes), fonte, ferramentas (T5a de verdade, configuradas
 * para este banco), diário e Gestor com o dublê. `ia` muda o ia_config. `semTabelas` tira trafego_ia_conversas e trafego_acoes.
 */
function montar({ roteiro = [], ia = {}, semTabelas = false, tabelasExtra = {}, opcoesGestor = {}, cliente, itens } = {}) {
  const extra = { trafego_ia_conversas: [], ia_acoes: [], ...tabelasExtra };
  const tabelas = tabelasDaPorta(extra);
  if (semTabelas) { delete tabelas.trafego_ia_conversas; delete tabelas.trafego_acoes; }
  const amb = ambienteDaPorta(itens ? { tabelas, itens } : { tabelas });
  comUuid(amb.sb);
  F.configurar({ sb: amb.sb, fonte: amb.fonte, jornada: amb.jornada, agora: amb.agora, auditoria: Auditoria.criarAuditoria({ sb: amb.sb, agora: amb.agora }), hoje: null, campanhas: null, lerConversa: null });
  const diario = Decisoes.criarDiario({ sb: amb.sb, fonte: amb.fonte, campanhas: Campanhas, agora: amb.agora, nomesDosPerfis: async ids => new Map(ids.map(id => [id, { nome: 'Paulo' }])) });
  const api = cliente !== undefined ? cliente : clienteFalso(roteiro);
  const lim = limitador();
  const gestor = G.criarGestor({
    sb: amb.sb, cliente: api, ferramentas: F, diario, agora: amb.agora, limitador: lim, fallback: false,
    lerConfig: async () => ({ ativo: true, modelo_forte: 'claude-opus-5-5', limite_chamadas_dia: 2000, ...ia }),
    ...opcoesGestor,
  });
  return { ...amb, api, diario, gestor, limitador: lim };
}

/** Roda uma pergunta inteira e devolve os eventos na ordem, o retorno e o banco. */
async function perguntar(m, { usuario = PESSOA, corpo, ehAdmin = false, sinal = null } = {}) {
  const eventos = [];
  const pedido = await m.gestor.preparar({ usuario, corpo, ehAdmin });
  const out = await TD.calado(() => m.gestor.responder(pedido, { emitir: (tipo, dados) => eventos.push({ tipo, ...dados }), sinal }));
  await m.gestor.registrosPendentes();
  return { eventos, out, pedido };
}

const PESSOA = { id: '11111111-2222-4333-8444-555555555555', papel: 'gestor', nome: 'Paulo', apps: ['ads'], ativo: true };
const ADMIN = { id: '99999999-2222-4333-8444-555555555555', papel: 'admin', nome: 'João', apps: [], ativo: true };

/** Sobe o servidor numa porta livre da faixa 3460 a 3469 (a faixa da frente T5b). */
async function ouvirNaFaixa(servidor) {
  for (let porta = 3460; porta <= 3469; porta++) {
    try {
      await new Promise((ok, falhou) => {
        const erro = e => { servidor.off('listening', pronto); falhou(e); };
        const pronto = () => { servidor.off('error', erro); ok(); };
        servidor.once('error', erro); servidor.once('listening', pronto);
        servidor.listen(porta, '127.0.0.1');
      });
      return porta;
    } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  }
  throw new Error('nenhuma porta livre entre 3460 e 3469');
}

/** Lê um corpo text/event-stream inteiro e devolve [{ evento, dados }] (comentários contam à parte). */
function lerEventos(bruto) {
  const eventos = [];
  let comentarios = 0;
  for (const bloco of String(bruto).split('\n\n')) {
    if (!bloco.trim()) continue;
    let evento = 'message';
    const dados = [];
    for (const linha of bloco.split('\n')) {
      if (linha.startsWith(':')) { comentarios++; continue; }
      if (linha.startsWith('event: ')) evento = linha.slice(7);
      else if (linha.startsWith('data: ')) dados.push(linha.slice(6));
    }
    if (dados.length) eventos.push({ evento, dados: JSON.parse(dados.join('\n')) });
  }
  return { eventos, comentarios };
}

module.exports = { comUuid, usar, texto, clienteFalso, limitador, montar, perguntar, PESSOA, ADMIN, ouvirNaFaixa, lerEventos, TD };
