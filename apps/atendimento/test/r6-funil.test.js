'use strict';
/* Rodada 6 (C3): a IA do funil com WhatsApp parado, trava de laço, encaminhamento garantido e novos motivos de humano. */
const test = require('node:test');
const assert = require('node:assert/strict');
const IA = require('../lib/ia-copiloto.js');
const CTX = require('../lib/contexto.js');
const FUN = require('../lib/ia-funil.js');
const { criarSbFalso } = require('./apoio/sb-falso.js');
const { ID, AGORA, tabelas, criarIAFalsa, usa, fim } = require('./apoio/dados.js');

const basico = () => [
  ['classificar', { intencao: 'orcamento', temperatura: 'morno', motivo: 'teste' }],
  ['resumir', { resumo: 'Cliente.', pendencias: [] }],
];

function montar(roteiro, { zap = { parado: false }, ajustar, enviarFunil = true } = {}) {
  const t = tabelas();
  t.ia_config[0].autonomia = 'automatico';
  t.ia_config[0].funil_autonomia = {};
  t.ia_config[0].funil_ativo = true;
  t.at_ia_fila = [];
  if (ajustar) ajustar(t);
  const sb = criarSbFalso(t, { relogio: () => AGORA, rpc: { notificar: () => ({ data: 'n', error: null }) } });
  const ia = criarIAFalsa(roteiro);
  const enviadas = [];
  const enviarMensagem = async ({ conversa, texto }) => {
    const id = 'msg-ia-' + (enviadas.length + 1);
    enviadas.push({ conversa_id: conversa.id, texto });
    sb.db.whatsapp_mensagens.push({ id, conversa_id: conversa.id, direcao: 'saida', corpo: texto, gerada_por_ia: true, created_at: AGORA.toISOString() });
    return { ok: true, mensagem_id: id };
  };
  const contexto = CTX.criarContexto({ sb, agora: () => AGORA });
  const cop = IA.criarCopiloto({ sb, contexto, criarIA: async () => ia, persona: 'P', agora: () => AGORA, enviarMensagem });
  const funil = FUN.criarFunil({ sb, copiloto: cop, contexto, agora: () => AGORA, log: () => {}, zapParado: () => zap, ...(enviarFunil ? { enviarMensagem } : {}) });
  return { sb, db: sb.db, funil, enviadas, ia };
}
const entrada = (texto) => t => t.whatsapp_mensagens.push({ id: 'mx' + Math.random(), conversa_id: ID.conversaSemCliente, direcao: 'entrada', corpo: texto, created_at: '2026-10-14T12:40:00Z' });

test('novos motivos de humano: ligação, só áudio, nota fiscal, cancelar', () => {
  assert.equal(FUN.precisaHumano(['pode me ligar?']), 'ligacao');
  assert.equal(FUN.precisaHumano(['[áudio]']), 'so_midia');
  assert.equal(FUN.precisaHumano(['preciso da nota fiscal']), 'nota_fiscal');
  assert.equal(FUN.precisaHumano(['quero cancelar o serviço']), 'cancelar');
  assert.equal(FUN.precisaHumano(['quero falar com o gerente']), 'pediu_pessoa');
  assert.equal(FUN.precisaHumano(['oi, tem horário amanhã?']), null);
});

test('WhatsApp parado: a IA não manda nada sozinha, a resposta vira proposta para a equipe', async () => {
  const { funil, db, enviadas } = montar([usa(...basico(), ['responder', { texto: 'Qual é o carro?' }]), fim],
    { zap: { parado: true, codigo: 'codewords-401' }, ajustar: entrada('oi') });
  const r = await funil.conduzir(ID.conversaSemCliente);
  assert.equal(r.zap_parado, true);
  assert.equal(r.podeResponder, false);
  assert.equal(enviadas.length, 0);
  assert.equal(db.ia_acoes.find(a => a.tipo === 'responder').status, 'proposta');
});

test('trava de laço: depois de 6 mensagens da IA na última hora, a sétima vira proposta', async () => {
  const { funil, db, enviadas } = montar([usa(...basico(), ['responder', { texto: 'Qual é o carro?' }]), fim], {
    ajustar: t => {
      entrada('oi')(t);
      for (let i = 0; i < 6; i++) t.whatsapp_mensagens.push({ id: 'ia' + i, conversa_id: ID.conversaSemCliente, direcao: 'saida', corpo: 'x' + i, gerada_por_ia: true, created_at: new Date(AGORA.getTime() - 600000).toISOString() });
      t.whatsapp_mensagens.push({ id: 'cl', conversa_id: ID.conversaSemCliente, direcao: 'entrada', corpo: 'oi de novo', created_at: new Date(AGORA.getTime() - 60000).toISOString() });
    } });
  const r = await funil.conduzir(ID.conversaSemCliente);
  assert.equal(r.limite_hora, true);
  assert.equal(enviadas.length, 0);
  assert.equal(db.ia_acoes.find(a => a.tipo === 'responder').status, 'proposta');
});

test('cliente pediu valor e a IA ficou calada: sai o encaminhamento do sistema (sem preço) e a conversa fica aguardando consultor', async () => {
  const { funil, db, enviadas } = montar([usa(...basico()), fim], { ajustar: entrada('Quanto custa a pastilha?') });
  const r = await funil.conduzir(ID.conversaSemCliente);
  assert.equal(r.humano, 'preco');
  assert.ok(r.encaminhou);
  assert.equal(enviadas.length, 1);
  assert.equal(IA.revisarTexto(enviadas[0].texto).temPreco, false);
  assert.match(enviadas[0].texto, /consultor/);
  assert.equal(db.conversas.find(c => c.id === ID.conversaSemCliente).aguardando_consultor, true);
  const acao = db.ia_acoes.find(a => a.tipo === 'responder' && a.entrada?.fallback === 'encaminhamento');
  assert.ok(acao && acao.saida.enviada);
});

test('encaminhamento não duplica quando a IA já respondeu o cliente', async () => {
  const { funil, enviadas } = montar([usa(...basico(), ['marcar_aguardando_consultor', { motivo: 'valor' }], ['responder', { texto: 'O consultor confirma o valor certinho, já estou chamando. Quer ver um horário para o diagnóstico gratuito?' }]), fim],
    { ajustar: entrada('Quanto custa a pastilha?') });
  const r = await funil.conduzir(ID.conversaSemCliente);
  assert.equal(r.encaminhou, null);
  assert.equal(enviadas.length, 1);
});

test('a guarda de preço do copiloto pega o que a regra antiga deixava passar', () => {
  for (const t of ['sai trezentos reais', 'fica 3x de 120', 'o total é 1.250,00'])
    assert.equal(IA.revisarTexto(t).temPreco, true, t);
  assert.equal(IA.revisarTexto('A garantia é de 12 meses. Te espero às 9h30.').temPreco, false);
});
