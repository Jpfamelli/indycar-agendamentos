'use strict';
/* Rodada 7 (C4), lote 3: o dia em que a chave do CodeWords voltar.
   Banco, WhatsApp e relógio de mentira: nada sai para a rede e ninguém espera de verdade. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarRetomada, classificar, ERRO_RESERVA } = require('../lib/r7-retomada.js');
const { criarEntregador } = require('../lib/entrega.js');
const { criarZap } = require('../lib/zap-estado.js');
const { criarSbFalso } = require('./apoio/sb-falso.js');

const AGORA = new Date('2026-10-26T13:00:00Z');        // segunda 10h em Taubaté
const C1 = '11111111-1111-4111-8111-111111111111', C2 = '11111111-1111-4111-8111-111111111112', C3 = '11111111-1111-4111-8111-111111111113';
const EU = '88888888-8888-4888-8888-888888888888', COLEGA = '88888888-8888-4888-8888-888888888889';
const uid = (n) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const min = (m) => new Date(AGORA - m * 60000).toISOString();
const falhou = (n, conversa, corpo, minAtras, extra = {}) => ({ id: uid(n), conversa_id: conversa, direcao: 'saida', corpo, status: 'falhou', erro: 'WhatsApp parado: a chave do CodeWords foi recusada (401).', created_at: min(minAtras), gerada_por_ia: false, telefone: '5512988887777', ...extra });

function cenario({ mensagens = [], conversas, bloqueados = [], zapParado = false, enviar } = {}) {
  const sb = criarSbFalso({
    whatsapp_mensagens: mensagens,
    conversas: conversas || [
      { id: C1, nome: 'Camila', telefone: '5512988887777', telefone_e164: '12988887777', tipo: 'atendimento', atribuida_a: EU },
      { id: C2, nome: 'Zé do Gol', telefone: '5512977776666', telefone_e164: '12977776666', tipo: 'atendimento', atribuida_a: null },
      { id: C3, nome: 'Dani', telefone: '5512966665555', telefone_e164: '12966665555', tipo: 'atendimento', atribuida_a: COLEGA },
    ],
    numeros_bloqueados: bloqueados, r7_c4_retomadas: [],
  }, { relogio: () => AGORA });
  const enviados = [];
  const zap = criarZap({ agora: () => AGORA.getTime() });
  if (zapParado) zap.marcar('codewords-401');
  const entregador = criarEntregador({ banco: () => sb, enviar: enviar || (async (d) => { enviados.push(d); return { ok: true }; }), agora: () => AGORA.getTime() });
  const dormidos = [];
  const auditoria = [];
  const r = criarRetomada({ sb, entregar: (d, id) => entregador.entregar(d, id), zap, agora: () => AGORA, dormir: async (ms) => { dormidos.push(ms); }, intervaloMs: 4000, jitterMs: 0,
    auditar: async (a) => { auditoria.push(a); return { ok: true }; }, log: () => {} });
  return { sb, db: sb.db, r, enviados, zap, dormidos, auditoria };
}
const gestor = { id: COLEGA, papel: 'gestor', nome: 'Gabriel' };
const eu = { id: EU, papel: 'atendente', nome: 'Raquel' };

/* ---------------- classificação ---------------- */
test('R7 retomada: classificar — recente sai; velha, horário no texto, IA com cliente que escreveu depois vão para revisão', () => {
  const m = (extra = {}) => ({ id: 'x', corpo: 'Oi Camila, seu carro ficou pronto!', erro: 'x', created_at: min(30), gerada_por_ia: false, ...extra });
  assert.deepEqual(classificar(m(), { agora: AGORA }), { acao: 'enviar', motivo: null, idade_min: 30 });
  assert.equal(classificar(m({ created_at: min(60 * 30) }), { agora: AGORA }).motivo, 'velha');
  assert.equal(classificar(m({ corpo: 'Te espero hoje às 9h', created_at: min(5 * 60) }), { agora: AGORA }).motivo, 'horario_no_texto');
  assert.equal(classificar(m({ corpo: 'Te espero hoje às 9h', created_at: min(20) }), { agora: AGORA }).acao, 'enviar', 'recém-escrita ainda vale');
  assert.equal(classificar(m({ gerada_por_ia: true }), { agora: AGORA, depoisEntrou: true }).motivo, 'cliente_escreveu');
  assert.equal(classificar(m({ gerada_por_ia: false }), { agora: AGORA, depoisEntrou: true }).acao, 'enviar', 'resposta de atendente continua valendo');
  assert.equal(classificar(m(), { agora: AGORA, depoisSaiu: true }).motivo, 'conversa_seguiu');
});

test('R7 retomada: classificar — sem confirmação e reservada NUNCA saem; resolvida, preço da IA, disparo e bloqueado ficam de fora', () => {
  const base = { id: 'x', corpo: 'Oi!', created_at: min(10), gerada_por_ia: false };
  assert.equal(classificar({ ...base, erro: 'Sem confirmação: o CodeWords não respondeu em 60 s' }, { agora: AGORA }).motivo, 'sem_confirmacao');
  assert.equal(classificar({ ...base, erro: ERRO_RESERVA }, { agora: AGORA }).motivo, 'reservada');
  assert.equal(classificar({ ...base, erro: 'Resolvido fora do WhatsApp por Gabriel' }, { agora: AGORA }).motivo, 'resolvida');
  assert.equal(classificar({ ...base, erro: 'x', gerada_por_ia: true, corpo: 'Sai por R$ 120' }, { agora: AGORA }).motivo, 'preco');
  assert.equal(classificar({ ...base, erro: 'x', gerada_por_ia: true, corpo: 'Fica pronto amanhã sem falta' }, { agora: AGORA }).motivo, 'promessa');
  assert.equal(classificar({ ...base, erro: 'x' }, { agora: AGORA, conversa: { tipo: 'disparo' } }).motivo, 'disparo');
  assert.equal(classificar({ ...base, erro: 'x' }, { agora: AGORA, conversa: { tipo: 'atendimento', bloqueado: true } }).motivo, 'bloqueado');
  assert.equal(classificar({ ...base, erro: 'x' }, { agora: AGORA, repetida: true }).motivo, 'duplicada');
});

/* ---------------- plano ---------------- */
test('R7 retomada: planejar separa enviar / revisar / pular com o motivo em português e a conversa certa', async () => {
  const ms = [
    falhou(1, C1, 'Oi Camila, seu carro ficou pronto!', 30),
    falhou(2, C1, 'Oi Camila, seu carro ficou pronto!', 25),                                   // igual: duplicada
    falhou(3, C2, 'Bom dia! Qual é o carro?', 60 * 30, { gerada_por_ia: true }),                // velha
    falhou(4, C2, 'Tem horário hoje às 14h', 5 * 60),                                            // horário no texto
    falhou(5, C1, 'Confirmado!', 20, { erro: 'Sem confirmação: timeout' }),                      // não saberemos
    falhou(6, C2, 'Sai por R$ 90', 40, { gerada_por_ia: true }),                                 // preço da IA
    { id: uid(90), conversa_id: C2, direcao: 'entrada', corpo: 'oi', status: null, created_at: min(100) },
  ];
  const { r } = cenario({ mensagens: ms });
  const p = await r.planejar({ papel: 'gestor', perfilId: COLEGA });
  const motivos = Object.fromEntries(['enviar', 'revisar', 'pular'].map(k => [k, p[k].map(i => [i.id.slice(-2), i.motivo])]));
  assert.deepEqual(motivos.enviar, [['01', null]]);
  assert.deepEqual(motivos.revisar.map(x => x[1]).sort(), ['horario_no_texto', 'sem_confirmacao', 'velha'].sort());
  assert.deepEqual(motivos.pular.map(x => x[1]).sort(), ['duplicada', 'preco']);
  assert.equal(p.total, 6);
  assert.equal(p.por_conversa, 1);
  assert.ok(p.revisar.every(i => i.motivo_rotulo && i.ajuda));
  assert.equal(p.enviar[0].nome, 'Camila');
});

test('R7 retomada: conversa que já seguiu (saiu outra mensagem depois) vai para revisão, não é reenviada', async () => {
  const ms = [falhou(1, C1, 'Seu carro ficou pronto!', 120), { id: uid(50), conversa_id: C1, direcao: 'saida', corpo: 'Já te respondi por telefone', status: 'enviado', created_at: min(60) }];
  const { r } = cenario({ mensagens: ms });
  const p = await r.planejar({ papel: 'gestor' });
  assert.equal(p.revisar[0].motivo, 'conversa_seguiu');
  assert.equal(p.enviar.length, 0);
});

test('R7 retomada: atendente só enxerga o que é dele ou sem dono; gestor vê tudo', async () => {
  const ms = [falhou(1, C1, 'a', 10), falhou(2, C2, 'b', 10), falhou(3, C3, 'c', 10)];
  const { r } = cenario({ mensagens: ms });
  const a = await r.planejar({ papel: 'atendente', perfilId: EU });
  assert.deepEqual(a.enviar.map(i => i.conversa_id).sort(), [C1, C2].sort());
  assert.equal(a.pular.find(i => i.conversa_id === C3).motivo, 'de_outro');
  const g = await r.planejar({ papel: 'gestor', perfilId: COLEGA });
  assert.equal(g.enviar.length, 3);
});

test('R7 retomada: número bloqueado e grupo ficam de fora', async () => {
  const ms = [falhou(1, C1, 'oi', 10)];
  const { r } = cenario({ mensagens: ms, bloqueados: [{ telefone: '12988887777' }] });
  const p = await r.planejar({ papel: 'gestor' });
  assert.equal(p.pular[0].motivo, 'bloqueado');
});

/* ---------------- execução ---------------- */
test('R7 retomada: reenvia UMA por vez, com intervalo, na ordem do mais antigo — e só o que está em ENVIAR', async () => {
  const ms = [falhou(1, C1, 'primeira', 50), falhou(2, C2, 'segunda', 40), falhou(3, C3, 'terceira', 30), falhou(4, C2, 'velha', 60 * 30)];
  const { r, enviados, dormidos, db, auditoria } = cenario({ mensagens: ms });
  const res = await r.iniciar({ perfil: gestor, aguardar: true });
  assert.equal(res.ok, true);
  assert.deepEqual(enviados.map(e => e.corpo), ['primeira', 'segunda', 'terceira']);
  assert.deepEqual(dormidos, [4000, 4000], 'espera entre uma e outra, não depois da última');
  const est = r.estado().trabalho;
  assert.equal(est.enviadas, 3);
  assert.equal(est.concluido, true);
  assert.equal(est.parou_por, null);
  assert.equal(db.whatsapp_mensagens.filter(m => m.status === 'enviado').length, 3);
  assert.equal(db.whatsapp_mensagens.find(m => m.corpo === 'velha').status, 'falhou', 'a velha continua esperando revisão');
  assert.deepEqual(auditoria.map(a => a.acao), ['whatsapp.retomada_inicio', 'whatsapp.retomada_fim']);
  const reg = db.r7_c4_retomadas[0];
  assert.equal(reg.enviadas, 3);
  assert.ok(reg.terminou_em);
});

test('R7 retomada: NUNCA reenvia duas vezes — rodar de novo não manda nada', async () => {
  const { r, enviados } = cenario({ mensagens: [falhou(1, C1, 'a', 10), falhou(2, C2, 'b', 10)] });
  await r.iniciar({ perfil: gestor, aguardar: true });
  assert.equal(enviados.length, 2);
  const outra = await r.iniciar({ perfil: gestor, aguardar: true });
  assert.equal(outra.ok, false);
  assert.equal(outra.codigo, 'nada_para_enviar');
  assert.equal(enviados.length, 2);
});

test('R7 retomada: WhatsApp ainda parado → não começa (409) e diz por quê', async () => {
  const { r, enviados } = cenario({ mensagens: [falhou(1, C1, 'a', 10)], zapParado: true });
  const res = await r.iniciar({ perfil: gestor, aguardar: true });
  assert.equal(res.ok, false);
  assert.equal(res.status, 409);
  assert.equal(res.codigo, 'whatsapp_parado');
  assert.match(res.erro, /WhatsApp parado/);
  assert.equal(enviados.length, 0);
});

test('R7 retomada: o WhatsApp para DE NOVO no meio → o trabalho para na hora, o resto fica esperando e nada se perde', async () => {
  let n = 0;
  const enviar = async () => { n++; return n === 2 ? { ok: false, erro: 'WhatsApp parado: a chave do CodeWords foi recusada (401).', codigo: 'whatsapp_parado', parado: true } : { ok: true }; };
  const ms = [falhou(1, C1, 'um', 50), falhou(2, C2, 'dois', 40), falhou(3, C3, 'tres', 30)];
  const { r, db } = cenario({ mensagens: ms, enviar });
  await r.iniciar({ perfil: gestor, aguardar: true });
  const est = r.estado().trabalho;
  assert.equal(est.enviadas, 1);
  assert.equal(est.parou_por, 'whatsapp_parado');
  assert.equal(n, 2, 'a terceira nem foi tentada');
  const por = Object.fromEntries(db.whatsapp_mensagens.map(m => [m.corpo, m.status]));
  assert.deepEqual(por, { um: 'enviado', dois: 'falhou', tres: 'falhou' });
  // a que parou volta a ser uma falha comum (pode ser reenviada depois), não "sem confirmação"
  assert.doesNotMatch(db.whatsapp_mensagens.find(m => m.corpo === 'dois').erro, /Sem confirmação/);
});

test('R7 retomada: servidor cai NO MEIO do envio → a mensagem fica reservada ("sem confirmação") e a próxima rodada não manda de novo', async () => {
  const enviar = async () => { throw new Error('processo morreu'); };
  const { r, db } = cenario({ mensagens: [falhou(1, C1, 'a', 10)], enviar });
  await r.iniciar({ perfil: gestor, aguardar: true });
  assert.equal(r.estado().trabalho.falhas, 1);
  const linha = db.whatsapp_mensagens[0];
  assert.equal(linha.status, 'falhou');
  assert.ok(linha.erro, 'ficou marcada');
  // simula o servidor reiniciando com a reserva ainda gravada (a falha acima foi gravada pelo entregador; aqui forçamos o estado da queda)
  linha.erro = ERRO_RESERVA;
  const p = await r.planejar({ papel: 'gestor' });
  assert.equal(p.enviar.length, 0);
  assert.equal(p.revisar[0].motivo, 'reservada');
});

test('R7 retomada: reserva atômica — dois servidores (ou duas abas) não mandam a mesma mensagem', async () => {
  const ms = [falhou(1, C1, 'a', 10)];
  const { r, enviados, db } = cenario({ mensagens: ms });
  // outro processo reservou entre o plano e o envio
  const plano = await r.planejar({ papel: 'gestor' });
  db.whatsapp_mensagens[0].erro = ERRO_RESERVA;
  assert.equal(plano.enviar.length, 1);
  const res = await r.iniciar({ perfil: gestor, aguardar: true });
  assert.equal(res.ok, false, 'com a reserva de outro, não há mais nada pronto');
  assert.equal(enviados.length, 0);
});

test('R7 retomada: dois cliques seguidos em "Reenviar com calma" — o segundo recebe 409 e nada duplica', async () => {
  const { r, enviados } = cenario({ mensagens: [falhou(1, C1, 'a', 10), falhou(2, C2, 'b', 10)] });
  const [x, y] = await Promise.all([r.iniciar({ perfil: gestor }), r.iniciar({ perfil: gestor })]);
  assert.equal([x, y].filter(z => z.ok).length, 1);
  assert.equal([x, y].find(z => !z.ok).codigo, 'ja_rodando');
  await new Promise(res => setTimeout(res, 50));
  assert.equal(enviados.length, 2);
});

test('R7 retomada: três falhas seguidas (que não são o WhatsApp parado) param o trabalho', async () => {
  const enviar = async () => ({ ok: false, erro: 'CodeWords respondeu 500' });
  const ms = [1, 2, 3, 4, 5].map(n => falhou(n, C1, 'msg ' + n, 100 - n));
  const { r } = cenario({ mensagens: ms, enviar });
  await r.iniciar({ perfil: gestor, aguardar: true });
  const est = r.estado().trabalho;
  assert.equal(est.falhas, 3);
  assert.equal(est.parou_por, 'muitas_falhas');
});

test('R7 retomada: "parar" interrompe antes da próxima; sem trabalho em andamento responde 409', async () => {
  const { r, enviados } = cenario({ mensagens: [1, 2, 3, 4].map(n => falhou(n, C1, 'm' + n, 100 - n)) });
  assert.equal(r.parar().status, 409);
  const res = await r.iniciar({ perfil: gestor });
  assert.equal(res.ok, true);
  assert.equal(r.parar().ok, true);
  await new Promise(res2 => setTimeout(res2, 60));
  assert.equal(r.estado().trabalho.parou_por, 'pedido');
  assert.ok(enviados.length < 4);
});

test('R7 retomada: "ids" restringe o trabalho a algumas mensagens do plano; id de fora do plano é ignorado', async () => {
  const ms = [falhou(1, C1, 'a', 30), falhou(2, C2, 'b', 20), falhou(3, C3, 'c', 10)];
  const { r, enviados } = cenario({ mensagens: ms });
  await r.iniciar({ perfil: gestor, ids: [uid(2), uid(99), 'não-é-uuid'], aguardar: true });
  assert.deepEqual(enviados.map(e => e.corpo), ['b']);
});

test('R7 retomada: o trabalho tem teto (40 por vez) e avisa quantas ficaram para a próxima', async () => {
  const ms = Array.from({ length: 45 }, (_, i) => falhou(i + 1, i % 2 ? C1 : C2, 'mensagem número ' + i, 200 - i));
  const { r, enviados } = cenario({ mensagens: ms });
  const res = await r.iniciar({ perfil: gestor, aguardar: true });
  assert.equal(res.trabalho.cortada, true);
  assert.equal(enviados.length, 40);
  assert.equal(r.estado().trabalho.restantes_no_plano, 5);
});

test('R7 retomada: mensagem que saiu por outro caminho entre o plano e o envio é pulada, não repetida', async () => {
  const ms = [falhou(1, C1, 'a', 30), falhou(2, C2, 'b', 20)];
  const base = cenario({ mensagens: ms });
  const plano = await base.r.planejar({ papel: 'gestor' });
  assert.equal(plano.enviar.length, 2);
  base.db.whatsapp_mensagens[0].status = 'enviado';          // alguém clicou "Tentar de novo" na tela
  await base.r.iniciar({ perfil: gestor, aguardar: true });
  assert.deepEqual(base.enviados.map(e => e.corpo), ['b']);
});

test('R7 retomada: atendente reenvia só o que é dele; as de colega não saem', async () => {
  const ms = [falhou(1, C1, 'minha', 10), falhou(2, C3, 'do colega', 10), falhou(3, C2, 'sem dono', 10)];
  const { r, enviados } = cenario({ mensagens: ms });
  await r.iniciar({ perfil: eu, aguardar: true });
  assert.deepEqual(enviados.map(e => e.corpo).sort(), ['minha', 'sem dono']);
});

test('R7 retomada: o corpo reenviado é o texto inteiro do banco (o plano mostra só um recorte de 280 caracteres)', async () => {
  const longo = 'Oi! ' + 'x'.repeat(600);
  const { r, enviados } = cenario({ mensagens: [falhou(1, C1, longo, 10)] });
  const p = await r.planejar({ papel: 'gestor' });
  assert.equal(p.enviar[0].corpo.length, 280);
  await r.iniciar({ perfil: gestor, aguardar: true });
  assert.equal(enviados[0].corpo, longo);
});
