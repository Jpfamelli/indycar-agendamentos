// Rodada 6 · parte 3 — a rodada do carteiro com as conferências novas (Orçador, Pátio, Atendimento, retomada),
// usando os dados REAIS do Comunicar atrás de um banco de mentira e um WhatsApp de mentira.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instalarBancoFalso } from './banco-falso.mjs';

const tabelas = {};
const banco = instalarBancoFalso(tabelas);
const real = await import('../dados.js');
const carteiro = await import('../carteiro.js');
const patio = await import('../patio.js');
const { enviarFila, simularRodada } = await import('../rodada.js');

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AGORA = new Date();
const H = real.hoje();
const horas = (n) => new Date(AGORA.getTime() + n * 3600000).toISOString();
const dados = { ...real, agoraSP: () => ({ data: H, hora: 11, minuto: 0, diaSemana: 2 }), feriado: () => null };
const CFG = { janela_inicio: 8, janela_fim: 20, pausa_geral: false, envia_domingo: true, so_horario_comercial: false, limite_por_hora: 60, limite_por_minuto: 10, limite_por_dia: 300,
  intervalo_mesmo_cliente_min: 60, hora_envio: '09:30', horas_lembrete: 20, bloquear_com_carro_na_oficina: true, bloquear_com_reclamacao: true, dias_reclamacao_aberta: 14, evitar_texto_repetido_h: 48, retomada_gradual: true };
const tel = (n) => `1299999${String(n).padStart(4, '0')}`;
const limpar = () => { for (const k of Object.keys(tabelas)) tabelas[k].length = 0; };
let n = 0;
function envio(e) {
  const x = { id: ID(1000 + ++n), status: 'pendente', enviando_em: null, tentativas: 0, enviar_em: horas(-1), created_at: horas(-1), expira_em: horas(30), chave_unica: `k${n}`, cliente_id: null, agendamento_id: null, telefone: tel(n), nome: `N${n}`, corpo: `texto ${n}`, ...e };
  (tabelas.posvenda_envios ||= []).push(x); return x;
}
const wa = () => { const saiu = []; return { saiu, enviar: async (t, c) => { saiu.push({ t, c }); return { ok: true }; } }; };
const rodar = async (extra = {}) => { const w = wa(); const r = await enviarFila({ cfg: { ...CFG, ...extra }, dados, wa: w, patio, carteiro, dormir: async () => {}, agora: AGORA, log: { error() {} } }); return { r, w }; };
const status = (e) => tabelas.posvenda_envios.find((x) => x.id === e.id);

test.after(() => banco.restaurar());

test('lembrete de orçamento NÃO sai se o cliente já aprovou no Orçador (pulado, com o motivo)', async () => {
  limpar();
  tabelas.orc_orcamentos = [{ id: ID(501), status: 'aprovado', decidido_em: horas(-2), numero: 1 }, { id: ID(502), status: 'enviado', decidido_em: null, numero: 2 }];
  const a = envio({ tipo: 'orcamento', orcamento_id: ID(501) }), b = envio({ tipo: 'orcamento', orcamento_id: ID(502) });
  const { r, w } = await rodar();
  assert.equal(status(a).status, 'pulado'); assert.match(status(a).motivo_pulado, /aprovou/);
  assert.equal(status(b).status, 'enviado');
  assert.equal(w.saiu.length, 1); assert.equal(r.pulados, 1);
});

test('orçamento apagado do Orçador: o lembrete é pulado, nunca enviado às cegas', async () => {
  limpar(); tabelas.orc_orcamentos = [];
  const a = envio({ tipo: 'orcamento', orcamento_id: ID(509) });
  await rodar();
  assert.equal(status(a).status, 'pulado');
});

test('revisão não sai se o cliente voltou (nova ordem no Pátio) depois do convite ser criado', async () => {
  limpar();
  const cli = ID(301);
  tabelas.patio_os = [{ id: ID(31), cliente_id: cli, etapa: 'recebido', created_at: horas(-0.5) }];
  const a = envio({ tipo: 'retorno', cliente_id: cli, created_at: new Date(AGORA.getTime() - 3 * 86400000).toISOString() });
  const b = envio({ tipo: 'retorno', cliente_id: ID(302), created_at: new Date(AGORA.getTime() - 3 * 86400000).toISOString() });
  await rodar();
  assert.equal(status(a).status, 'pulado'); assert.match(status(a).motivo_pulado, /voltou/i);
  assert.equal(status(b).status, 'enviado');
});

test('carro na oficina: aniversário e reativação esperam (adiadas, não perdidas); pós-venda e avisos do Pátio não são seguros por isso', async () => {
  limpar();
  const t = tel(900);
  tabelas.patio_os = [{ id: ID(41), numero: 41, etapa: 'em_execucao', telefone: t }];
  const a = envio({ tipo: 'aniversario', telefone: t, cliente_id: ID(311) });
  const b = envio({ tipo: 'reativacao', telefone: t, cliente_id: ID(311), enviar_em: horas(-2) });
  const { w } = await rodar();
  assert.equal(w.saiu.length, 0);
  assert.equal(status(a).status, 'pendente'); assert.match(status(a).motivo_pulado || '', /oficina|carro/i);
  assert.ok(Date.parse(status(a).enviar_em) > AGORA.getTime());
  assert.equal(status(b).status, 'pendente');
});

test('com reclamação aberta (resposta negativa sem tarefa resolvida) a régua de relacionamento espera', async () => {
  limpar();
  const t = tel(901);
  tabelas.posvenda_envios = [{ id: ID(70), status: 'enviado', tipo: 'posvenda', telefone: t, telefone_e164: t, resposta_tipo: 'negativa', respondido_em: horas(-24), resposta: 'Ficou barulho no freio', tarefa_id: null, enviado_em: horas(-30), corpo: 'outra coisa', created_at: horas(-30) }];
  const a = envio({ tipo: 'reativacao', telefone: t, cliente_id: ID(312), telefone_e164: t });
  const { w } = await rodar();
  assert.equal(w.saiu.length, 0);
  assert.match(status(a).motivo_pulado || '', /reclamou/i);
});

test('texto idêntico ao que acabou de ir para o mesmo número é pulado (não repete)', async () => {
  limpar();
  const t = tel(902);
  tabelas.posvenda_envios = [{ id: ID(71), status: 'enviado', tipo: 'campanha', telefone: t, telefone_e164: t, corpo: 'Oi João, promoção de óleo esta semana!', enviado_em: horas(-5), enviar_em: horas(-5), created_at: horas(-5) }];
  const a = envio({ tipo: 'campanha', telefone: t, corpo: 'Oi João, promoção de óleo esta semana!', enviar_em: horas(-0.2) });
  const { w } = await rodar({ intervalo_mesmo_cliente_min: 0 });
  assert.equal(w.saiu.length, 0);
  assert.equal(status(a).status, 'pulado'); assert.match(status(a).motivo_pulado, /mesmo texto/);
});

test('retomada gradual: acabou de voltar do erro, só uma amostra sai e o resto espera', async () => {
  limpar();
  for (let i = 0; i < 12; i++) envio({ tipo: 'campanha', telefone: tel(2000 + i), enviar_em: horas(-3) });
  const { r, w } = await rodar({ whatsapp: { estado: 'ok', em: new Date(AGORA.getTime() - 60000).toISOString(), anterior: 'chave_recusada' } });
  assert.ok(r.retomada, 'retomada ativa');
  assert.ok(w.saiu.length > 0 && w.saiu.length < 12, `saíram ${w.saiu.length}`);
});

test('simular a rodada: diz o que sairia/pularia SEM enviar nem alterar nada no banco', async () => {
  limpar();
  tabelas.orc_orcamentos = [{ id: ID(501), status: 'aprovado', decidido_em: horas(-2), numero: 1 }];
  const a = envio({ tipo: 'orcamento', orcamento_id: ID(501) }), b = envio({ tipo: 'campanha' });
  const antes = JSON.stringify(tabelas.posvenda_envios);
  const s = await simularRodada({ cfg: CFG, dados, patio, carteiro, agora: AGORA });
  assert.equal(s.simulado, true);
  assert.equal(s.enviaria.length, 1); assert.equal(s.enviaria[0].id, b.id);
  assert.equal(s.pularia.length, 1); assert.equal(s.pularia[0].id, a.id);
  assert.equal(JSON.stringify(tabelas.posvenda_envios), antes, 'o banco ficou intacto');
});

test('sem confirmação nunca reenvia sozinho: a rodada para e o envio sai da fila como falhou/sem_confirmacao', async () => {
  limpar();
  const a = envio({ tipo: 'campanha' }), b = envio({ tipo: 'campanha', enviar_em: horas(-0.5) });
  const w = { saiu: [], enviar: async (t, c) => { w.saiu.push({ t, c }); return { ok: false, classe: 'sem_confirmacao', erro: 'sem resposta a tempo' }; } };
  const r = await enviarFila({ cfg: { ...CFG, intervalo_mesmo_cliente_min: 0 }, dados, wa: w, patio, carteiro, dormir: async () => {}, agora: AGORA, log: { error() {} } });
  assert.equal(r.semConfirmacao, 1);
  assert.equal(w.saiu.length, 1, 'só tentou uma vez e parou');
  assert.equal(status(a).status, 'falhou'); assert.equal(status(a).erro_classe, 'sem_confirmacao');
  assert.equal(status(b).status, 'pendente');
  const r2 = await enviarFila({ cfg: { ...CFG, intervalo_mesmo_cliente_min: 0 }, dados, wa: { enviar: async () => ({ ok: true }) }, patio, carteiro, dormir: async () => {}, agora: AGORA, log: { error() {} } });
  assert.equal(status(a).status, 'falhou', 'a rodada seguinte não reenviou o que ficou sem confirmação');
  assert.ok(r2.enviados >= 1);
});

test('orçamento aberto no Orçador: reativação e não-fechou esperam (adiadas), o aniversário do mesmo cliente sai', async () => {
  limpar();
  const t = tel(903);
  tabelas.orc_orcamentos = [{ id: ID(551), numero: 12, status: 'enviado', decidido_em: null, cliente_telefone: `(12) ${t.slice(2, 7)}-${t.slice(7)}`, validade: real.somarDias(H, 5), enviado_em: horas(-30) }];
  const a = envio({ tipo: 'reativacao', telefone: t, cliente_id: ID(313), enviar_em: horas(-3) });
  const b = envio({ tipo: 'nao_fechou', telefone: t, cliente_id: ID(313), enviar_em: horas(-2) });
  const c = envio({ tipo: 'aniversario', telefone: t, cliente_id: ID(313), enviar_em: horas(-1) });
  const { w } = await rodar({ intervalo_mesmo_cliente_min: 0 });
  assert.equal(w.saiu.length, 1);
  assert.equal(status(c).status, 'enviado');
  for (const x of [a, b]) { assert.equal(status(x).status, 'pendente'); assert.match(status(x).motivo_pulado || '', /orçamento nº 12/); assert.ok(Date.parse(status(x).enviar_em) > AGORA.getTime()); }
});

test('orçamento aberto com o interruptor desligado: a reativação sai normalmente', async () => {
  limpar();
  const t = tel(904);
  tabelas.orc_orcamentos = [{ id: ID(552), numero: 13, status: 'enviado', decidido_em: null, cliente_telefone: t, validade: null, enviado_em: horas(-30) }];
  const a = envio({ tipo: 'reativacao', telefone: t, cliente_id: ID(314), enviar_em: horas(-3) });
  await rodar({ bloquear_com_orcamento_aberto: false });
  assert.equal(status(a).status, 'enviado');
});
