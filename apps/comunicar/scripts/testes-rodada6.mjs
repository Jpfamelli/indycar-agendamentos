// Rodada 6 (21/10/2026) — o Comunicar ligado aos eventos do Pátio e do Orçador, anti-spam, resultados.
// Parte 1: regras puras de conexoes.js. (As partes 2+ — geradores, rodada do carteiro e API — vêm abaixo.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../conexoes.js';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// terça-feira 20/10/2026 às 11:00 em São Paulo
const AGORA = Date.parse('2026-10-20T14:00:00Z');
const dias = (n) => new Date(AGORA - n * 86400000).toISOString();

// ---------------------------------------------------------------- Pátio → pós-venda
test('pós-venda do Pátio: entregue há 2 dias entra; fora da janela de 5 dias não; sem entrega não', () => {
  const os = { id: ID(1), etapa: 'entregue', entregue_em: dias(2), telefone: '12999990001', agendamento_id: null };
  assert.equal(C.decidirPosvendaPatio(os, { hojeIso: '2026-10-20', diasPosvenda: 2 }).acao, 'posvenda');
  assert.equal(C.decidirPosvendaPatio({ ...os, entregue_em: dias(9) }, { hojeIso: '2026-10-20', diasPosvenda: 2 }).acao, 'ignorar');
  assert.equal(C.decidirPosvendaPatio({ ...os, entregue_em: dias(0) }, { hojeIso: '2026-10-20', diasPosvenda: 2 }).acao, 'ignorar');
  assert.equal(C.decidirPosvendaPatio({ ...os, etapa: 'pronto' }, { hojeIso: '2026-10-20' }).acao, 'ignorar');
  assert.equal(C.decidirPosvendaPatio({ ...os, telefone: '' }, { hojeIso: '2026-10-20' }).acao, 'ignorar');
});

test('pós-venda do Pátio usa a MESMA chave da Agenda quando a ordem veio de um horário (nunca dois)', () => {
  const ag = ID(77);
  const d = C.decidirPosvendaPatio({ id: ID(1), etapa: 'entregue', entregue_em: dias(2), telefone: '12999990001', agendamento_id: ag }, { hojeIso: '2026-10-20' });
  assert.equal(d.chave, `posvenda:${ag}`);
  assert.equal(C.decidirPosvendaPatio({ id: ID(1), etapa: 'entregue', entregue_em: dias(2), telefone: '12999990001' }, { hojeIso: '2026-10-20' }).chave, `posvenda:patio:${ID(1)}`);
});

test('avaliação do Pátio: nota ≤ 3 segura o pós-venda; nota ≥ 4 vai direto ao convite do Google', () => {
  const os = { id: ID(1), etapa: 'entregue', entregue_em: dias(2), telefone: '12999990001' };
  const base = { hojeIso: '2026-10-20' };
  const baixa = C.decidirPosvendaPatio(os, { ...base, avaliacao: { nota: 2 } });
  assert.equal(baixa.acao, 'pular'); assert.match(baixa.motivo, /nota 2/);
  const alta = C.decidirPosvendaPatio(os, { ...base, avaliacao: { nota: 5 }, avaliacaoLigada: true, linkAvaliacao: 'https://g.page/r/x' });
  assert.equal(alta.acao, 'avaliacao'); assert.equal(alta.chave, `avaliacao:patio:${ID(1)}`);
  // nota alta mas régua de avaliação desligada ou sem link: segue o pós-venda normal
  assert.equal(C.decidirPosvendaPatio(os, { ...base, avaliacao: { nota: 5 }, avaliacaoLigada: false, linkAvaliacao: 'https://g.page/r/x' }).acao, 'posvenda');
  assert.equal(C.decidirPosvendaPatio(os, { ...base, avaliacao: { nota: 5 }, avaliacaoLigada: true, linkAvaliacao: '' }).acao, 'posvenda');
});

// ---------------------------------------------------------------- Pátio → revisão
test('revisão pelo histórico do Pátio: vence na janela de 7 dias, regra por serviço, chave igual à do gatilho', () => {
  const regras = [{ rotulo: 'Óleo', palavras: ['óleo'], meses: 6, ativo: true }];
  const os = { id: ID(2), etapa: 'entregue', telefone: '12999990002', servico: 'Troca de óleo', entregue_em: '2026-04-20T15:00:00Z' };
  const r = C.revisaoDoPatio(os, regras, 12, '2026-10-20');
  assert.equal(r.meses, 6); assert.equal(r.vence, '2026-10-17'); assert.equal(r.regra.rotulo, 'Óleo');
  assert.equal(C.revisaoDoPatio({ ...os, entregue_em: '2026-09-20T15:00:00Z' }, regras, 12, '2026-10-20'), null);
  assert.equal(C.revisaoDoPatio({ ...os, entregue_em: '2026-01-02T15:00:00Z' }, regras, 12, '2026-10-20'), null, 'já passou da janela');
  assert.equal(C.chaveRetornoPatio(os), `retorno:patio:${ID(2)}`);
  assert.equal(C.chaveRetornoPatio({ ...os, agendamento_id: ID(9) }), `retorno:${ID(9)}`);
});

test('revisão: se o cliente voltou depois da entrega, não incomoda', () => {
  assert.equal(C.conferirRetorno({}, null).acao, 'enviar');
  const c = C.conferirRetorno({}, '2026-08-03');
  assert.equal(c.acao, 'pular'); assert.match(c.motivo, /03\/08\/2026/);
});

// ---------------------------------------------------------------- Orçador
const orc = (o = {}) => ({ id: ID(30), status: 'enviado', cliente_telefone: '12999990003', enviado_em: dias(4), visualizado_em: null, decidido_em: null, validade: '2026-11-30', ...o });

test('Orçador: enviado há 4 dias e sem resposta → lembrete; abriu há 5 h → espera; já decidiu/rascunho/vencido → não', () => {
  const ctx = { agora: AGORA, dias: 3, hojeIso: '2026-10-20' };
  assert.deepEqual(C.decidirOrcamentoParado(orc(), ctx), { elegivel: true, visto: false });
  assert.equal(C.decidirOrcamentoParado(orc({ visualizado_em: dias(2) }), ctx).visto, true);
  assert.equal(C.decidirOrcamentoParado(orc({ visualizado_em: new Date(AGORA - 5 * 3600000).toISOString() }), ctx).elegivel, false);
  assert.equal(C.decidirOrcamentoParado(orc({ enviado_em: dias(1) }), ctx).elegivel, false, 'cedo');
  assert.equal(C.decidirOrcamentoParado(orc({ enviado_em: dias(15) }), ctx).elegivel, false, 'tarde demais');
  assert.equal(C.decidirOrcamentoParado(orc({ status: 'aprovado' }), ctx).elegivel, false);
  assert.equal(C.decidirOrcamentoParado(orc({ decidido_em: dias(1) }), ctx).elegivel, false);
  assert.equal(C.decidirOrcamentoParado(orc({ validade: '2026-10-01' }), ctx).elegivel, false);
  assert.equal(C.decidirOrcamentoParado(orc({ cliente_telefone: '' }), ctx).elegivel, false);
});

test('Orçador: na hora de enviar o lembrete, orçamento decidido/apagado/rascunho cancela', () => {
  assert.equal(C.conferirOrcamento({}, orc()).acao, 'enviar');
  assert.match(C.conferirOrcamento({}, null).motivo, /apagado/);
  assert.match(C.conferirOrcamento({}, orc({ status: 'aprovado' })).motivo, /já aprovou/);
  assert.match(C.conferirOrcamento({}, orc({ status: 'recusado' })).motivo, /já recusou/);
  assert.match(C.conferirOrcamento({}, orc({ status: 'expirado' })).motivo, /expirou/);
  assert.match(C.conferirOrcamento({}, orc({ status: 'aberto' })).motivo, /rascunho/);
  assert.match(C.conferirOrcamento({}, orc({ decidido_em: dias(1) })).motivo, /já decidiu/);
});

test('link público do orçamento: só https e token sem lixo', () => {
  assert.equal(C.linkOrcamentoCliente('https://indycar-orcador.netlify.app/', 'abcDEF123456xyz'), 'https://indycar-orcador.netlify.app/#/o/abcDEF123456xyz');
  assert.equal(C.linkOrcamentoCliente('http://x.com', 'abcDEF123456xyz'), null);
  assert.equal(C.linkOrcamentoCliente(undefined, 'curto'), null);
  assert.equal(C.linkOrcamentoCliente(undefined, 'abc DEF 123456 xyz'), null);
  assert.match(C.linkOrcamentoCliente(undefined, 'abcDEF123456xyz'), /^https:\/\/indycar-orcador\.netlify\.app\/#\/o\//);
});

// ---------------------------------------------------------------- extra do Pátio
test('lembrete do extra: só depois do aviso inicial SAIR e passar N horas sem decisão; um por ordem', () => {
  const os = { id: ID(40), etapa: 'aguardando_aprovacao', telefone: '12999990004' };
  const extras = [{ status: 'pendente', descricao: 'Pastilha de freio', created_at: new Date(AGORA - 5 * 3600000).toISOString() }];
  const aviso = (h, status = 'enviado') => [{ status, enviado_em: new Date(AGORA - h * 3600000).toISOString() }];
  const ctx = { agora: AGORA, horas: 3 };
  assert.equal(C.decidirExtraLembrete(os, extras, aviso(4), ctx).elegivel, true);
  assert.equal(C.decidirExtraLembrete(os, extras, aviso(1), ctx).elegivel, false, 'aviso saiu há pouco');
  assert.equal(C.decidirExtraLembrete(os, extras, aviso(4, 'pendente'), ctx).elegivel, false, 'aviso nunca saiu');
  assert.equal(C.decidirExtraLembrete(os, extras, [], ctx).elegivel, false);
  assert.equal(C.decidirExtraLembrete(os, [{ status: 'aprovado' }], aviso(4), ctx).elegivel, false);
  assert.equal(C.decidirExtraLembrete({ ...os, etapa: 'entregue' }, extras, aviso(4), ctx).elegivel, false);
  const ok = C.decidirExtraLembrete(os, extras, aviso(4), ctx);
  assert.equal(ok.chave, `patio_extra_lembrete:${ID(40)}`); assert.equal(ok.n, 1);
});

test('listarItens: um, dois e vários', () => {
  assert.equal(C.listarItens([]), 'um item extra');
  assert.equal(C.listarItens(['Pastilha']), 'o item "Pastilha"');
  assert.equal(C.listarItens(['A', 'B']), '2 itens (A e B)');
  assert.equal(C.listarItens(['A', 'B', 'C', 'D']), '4 itens (A, B e mais 2)');
});

// ---------------------------------------------------------------- lembrete × oficina
test('lembrete de horário não sai se o carro já está na oficina (ordem aberta ou entregue)', () => {
  assert.equal(C.conferirLembreteComOrdem({}, null).acao, 'enviar');
  assert.equal(C.conferirLembreteComOrdem({}, { etapa: 'cancelado' }).acao, 'enviar');
  const c = C.conferirLembreteComOrdem({}, { numero: 12, etapa: 'em_execucao' });
  assert.equal(c.acao, 'pular'); assert.match(c.motivo, /ordem 12 em execução/);
  assert.equal(C.conferirLembreteComOrdem({}, { numero: 3, etapa: 'entregue' }).acao, 'pular');
});

// ---------------------------------------------------------------- bloqueios de relacionamento
test('relacionamento automático espera enquanto o carro está na oficina ou há reclamação sem resolver', () => {
  const cfg = { bloquear_com_carro_na_oficina: true, bloquear_com_reclamacao: true, dias_reclamacao_aberta: 14 };
  const sit = { os: { numero: 9, etapa: 'teste' } };
  const b = C.bloqueioDeRelacionamento({ tipo: 'reativacao' }, sit, cfg, AGORA);
  assert.equal(b.acao, 'adiar'); assert.equal(b.causa, 'oficina'); assert.match(b.motivo, /ordem 9, em teste/);
  assert.equal(C.bloqueioDeRelacionamento({ tipo: 'posvenda' }, sit, cfg, AGORA).acao, 'seguir', 'pós-venda não é relacionamento automático');
  assert.equal(C.bloqueioDeRelacionamento({ tipo: 'campanha' }, sit, cfg, AGORA).acao, 'seguir', 'campanha é decisão de gente');
  assert.equal(C.bloqueioDeRelacionamento({ tipo: 'aniversario' }, { os: { etapa: 'entregue' } }, cfg, AGORA).acao, 'seguir');
  assert.equal(C.bloqueioDeRelacionamento({ tipo: 'aniversario' }, sit, { ...cfg, bloquear_com_carro_na_oficina: false }, AGORA).acao, 'seguir');
  const r = C.bloqueioDeRelacionamento({ tipo: 'aniversario' }, { reclamacao: { em: dias(3), tarefaAberta: true } }, cfg, AGORA);
  assert.equal(r.acao, 'adiar'); assert.equal(r.causa, 'reclamacao');
  assert.equal(C.bloqueioDeRelacionamento({ tipo: 'aniversario' }, { reclamacao: { em: dias(3), tarefaAberta: false } }, cfg, AGORA).acao, 'seguir', 'equipe resolveu');
  assert.equal(C.bloqueioDeRelacionamento({ tipo: 'aniversario' }, { reclamacao: { em: dias(20), tarefaAberta: true } }, cfg, AGORA).acao, 'seguir', 'passou o prazo');
});

// ---------------------------------------------------------------- texto repetido
test('texto repetido: ignora acento, emoji e link; frase quase igual conta; texto diferente não', () => {
  const a = 'Oi Maria, aqui é da IndyCar! Conseguiu dar uma olhada no orçamento do HB20? https://indycar-orcador.netlify.app/#/o/abc 🔧';
  const b = 'oi maria aqui e da indycar conseguiu dar uma olhada no orcamento do hb20 https://outro.com/x';
  assert.equal(C.textosParecidos(a, b), true);
  assert.equal(C.textosParecidos(a, 'Seu carro está pronto! Pode vir buscar até as 17h30.'), false);
  assert.equal(C.textosParecidos('ok', 'ok'), true);
  assert.equal(C.textosParecidos('', 'ok'), false);
  const antes = [{ corpo: a, quando: AGORA - 5 * 3600000, origem: 'atendimento' }];
  assert.equal(C.repetidoRecente(b, antes, { horas: 48, agora: AGORA }).origem, 'atendimento');
  assert.equal(C.repetidoRecente(b, antes, { horas: 2, agora: AGORA }), null, 'fora da janela');
  assert.equal(C.repetidoRecente(b, antes, { horas: 0, agora: AGORA }), null, 'recurso desligado');
});

// ---------------------------------------------------------------- retomada gradual
test('retomada gradual: WhatsApp voltou de uma queda → 8 nos primeiros 30 min, 25 até 2 h, depois livre; desconta o que já saiu', () => {
  const base = { ligada: true, estado: 'ok', anterior: 'chave_recusada', agora: AGORA };
  const em = (min) => new Date(AGORA - min * 60000).toISOString();
  assert.equal(C.limiteDeRetomada({ ...base, estadoEm: em(5) }).maximo, 8);
  assert.equal(C.limiteDeRetomada({ ...base, estadoEm: em(5), enviadasDesde: 3 }).limite, 5);
  assert.equal(C.limiteDeRetomada({ ...base, estadoEm: em(5), enviadasDesde: 20 }).limite, 0);
  assert.equal(C.limiteDeRetomada({ ...base, estadoEm: em(45) }).maximo, 25);
  assert.equal(C.limiteDeRetomada({ ...base, estadoEm: em(200) }), null);
  assert.equal(C.limiteDeRetomada({ ...base, estadoEm: em(5), anterior: 'ok' }), null, 'não houve queda');
  assert.equal(C.limiteDeRetomada({ ...base, estadoEm: em(5), anterior: null }), null);
  assert.equal(C.limiteDeRetomada({ ...base, estadoEm: em(5), ligada: false }), null);
  assert.equal(C.limiteDeRetomada({ ...base, estadoEm: em(5), estado: 'desconectado' }), null);
});

test('estadoDoWhatsapp traduz o status do CodeWords para o que o banco aceita', () => {
  assert.equal(C.estadoDoWhatsapp({ ok: true, conectado: true }), 'ok');
  assert.equal(C.estadoDoWhatsapp({ ok: false, chaveRecusada: true, classe: 'chave_recusada' }), 'chave_recusada');
  assert.equal(C.estadoDoWhatsapp({ ok: true, conectado: false, classe: 'desconectado' }), 'desconectado');
  assert.equal(C.estadoDoWhatsapp({ ok: true, conectado: false, classe: 'sem_aparelho' }), 'sem_aparelho');
  assert.equal(C.estadoDoWhatsapp({ ok: false, classe: 'limite' }), 'limite');
  assert.equal(C.estadoDoWhatsapp({ ok: false, classe: 'instabilidade' }), 'instabilidade');
  assert.equal(C.estadoDoWhatsapp({ classe: 'sem_chave' }), 'sem_chave');
  assert.equal(C.estadoDoWhatsapp(null), null);
});

// ---------------------------------------------------------------- links de fora
test('links fora da casa: Google/Maps/WhatsApp/Instagram e os apps da IndyCar passam; o resto é apontado', () => {
  assert.deepEqual(C.linksForaDaCasa('Veja https://indycar-patio.netlify.app/minha/?c=1 e https://g.page/r/abc e https://maps.app.goo.gl/x'), []);
  assert.deepEqual(C.linksForaDaCasa('Clique: http://bit.ly/promo ou www.sorteio-gratis.com/x'), ['http://bit.ly/promo', 'www.sorteio-gratis.com/x']);
  assert.deepEqual(C.linksForaDaCasa('sem link nenhum'), []);
  assert.deepEqual(C.linksForaDaCasa('https://indycar-patio.netlify.app.golpe.com/x').length, 1, 'subdomínio enganoso não passa');
  assert.deepEqual(C.linksForaDaCasa('https://notindycar-patio.netlify.app/x').length, 1);
});

// ---------------------------------------------------------------- por que não saiu
test('por que não saiu: lista cada trava na ordem em que o carteiro decide', () => {
  const cfg = { janela_inicio: 8, janela_fim: 20, pausa_geral: false, envia_domingo: false, limite_por_hora: 60, limite_por_dia: 300, intervalo_mesmo_cliente_min: 60 };
  const hoje = { data: '2026-10-20', hora: 11, minuto: 0, diaSemana: 2 };
  const e = { id: ID(50), status: 'pendente', tipo: 'campanha', telefone: '12999990005', enviar_em: new Date(AGORA - 3600000).toISOString() };
  const livre = C.explicarPendente(e, { cfg, agora: AGORA, hoje });
  assert.equal(livre.passos[0].nivel, 'ok'); assert.equal(livre.bloqueios, 0);
  const pausa = C.explicarPendente(e, { cfg: { ...cfg, pausa_geral: true }, agora: AGORA, hoje });
  assert.match(pausa.passos.map((p) => p.texto).join(' '), /PAUSA GERAL/); assert.equal(pausa.bloqueios, 1);
  const wa = C.explicarPendente(e, { cfg, agora: AGORA, hoje, whatsapp: { estado: 'chave_recusada' } });
  assert.match(wa.passos.map((p) => p.texto).join(' '), /chave recusada.*NÃO é perdida/);
  const limite = C.explicarPendente(e, { cfg, agora: AGORA, hoje, enviadasHora: 60, aFrente: 7, ultimoDoCliente: AGORA - 10 * 60000, hojeDoCliente: 3 });
  const t = limite.passos.map((p) => p.texto).join(' | ');
  assert.match(t, /60 mensagens por hora/); assert.match(t, /7 mensagem\(ns\) .* na frente/); assert.match(t, /há 10 min/); assert.match(t, /já recebeu 3 mensagens hoje/);
  const dom = C.explicarPendente(e, { cfg, agora: AGORA, hoje: { data: '2026-10-25', hora: 11, minuto: 0, diaSemana: 0 } });
  assert.match(dom.passos.map((p) => p.texto).join(' '), /domingo/);
  const fora = C.explicarPendente(e, { cfg, agora: AGORA, hoje: { ...hoje, hora: 21 } });
  assert.match(fora.passos.map((p) => p.texto).join(' '), /Fora da janela/);
  const oper = C.explicarPendente({ ...e, tipo: 'patio_pronto' }, { cfg, agora: AGORA, hoje, ultimoDoCliente: AGORA - 60000, hojeDoCliente: 9 });
  assert.equal(oper.passos[0].nivel, 'ok', 'aviso operacional ignora intervalo e teto');
  const naoPendente = C.explicarPendente({ ...e, status: 'enviado' }, { cfg });
  assert.equal(naoPendente.passos[0].nivel, 'info');
  const optout = C.explicarPendente(e, { cfg, agora: AGORA, hoje, clienteFora: true });
  assert.match(optout.passos[0].texto, /pediu para não receber/);
  const seg = C.explicarPendente({ ...e, tipo: 'reativacao' }, { cfg: { ...cfg, bloquear_com_carro_na_oficina: true }, agora: AGORA, hoje, situacao: { os: { numero: 4, etapa: 'em_execucao' } } });
  assert.match(seg.passos.map((p) => p.texto).join(' '), /Segurada de propósito/);
  const lem = C.explicarPendente({ ...e, tipo: 'lembrete' }, { cfg, agora: AGORA, hoje, osDoLembrete: { numero: 4, etapa: 'recebido' } });
  assert.match(lem.passos.map((p) => p.texto).join(' '), /Será pulada/);
});

// ---------------------------------------------------------------- agenda de envios
test('agenda de envios: agrupa por dia (fuso de SP), marca atrasadas, domingo, feriado e estouro do teto', () => {
  const mk = (i, quando, tipo = 'campanha') => ({ id: ID(100 + i), tipo, enviar_em: quando, nome: `C${i}`, telefone: '1299999000' + i, corpo: 'x' });
  const lista = [
    mk(1, '2026-10-20T10:00:00Z'),            // atrasada (07:00 de hoje, há 4 h)
    mk(2, '2026-10-20T17:00:00Z', 'posvenda'), // hoje 14h
    mk(3, '2026-10-21T12:30:00Z'),            // amanhã 09:30
    mk(4, '2026-10-25T12:30:00Z'),            // domingo
    mk(5, '2026-11-02T12:30:00Z'),            // feriado
  ];
  const a = C.montarAgendaDeEnvios(lista, { limite_por_dia: 300, envia_domingo: false }, '2026-10-20', { feriado: (d) => (d === '2026-11-02' ? 'Finados' : null), agora: AGORA });
  assert.equal(a.total, 5); assert.equal(a.atrasadas, 1);
  assert.deepEqual(a.dias.map((d) => d.data), ['2026-10-20', '2026-10-21', '2026-10-25', '2026-11-02']);
  assert.equal(a.dias[0].total, 2); assert.equal(a.dias[0].atrasadas, 1);
  assert.equal(a.dias[2].domingo, true); assert.equal(a.dias[2].seguraPorCalendario, true);
  assert.equal(a.dias[3].feriado, 'Finados');
  assert.equal(a.dias[1].porHora['09'], 1);
  const tight = C.montarAgendaDeEnvios(lista, { limite_por_dia: 1 }, '2026-10-20', { agora: AGORA });
  assert.equal(tight.dias[0].excede, true);
});

test('adiar: não passa da validade, não vai ao passado, não mexe no que está sendo enviado', () => {
  const e = { status: 'pendente', expira_em: '2026-10-22T02:59:00Z' };
  assert.equal(C.validarAdiamento(e, '2026-10-21T12:00:00Z', AGORA).ok, true);
  assert.match(C.validarAdiamento(e, '2026-10-23T12:00:00Z', AGORA).erro, /validade/);
  assert.match(C.validarAdiamento(e, '2026-10-19T12:00:00Z', AGORA).erro, /não passou/);
  assert.match(C.validarAdiamento(e, 'xx', AGORA).erro, /válidas/);
  assert.match(C.validarAdiamento({ status: 'enviado' }, '2026-10-21T12:00:00Z', AGORA).erro, /ainda não saiu/);
  assert.match(C.validarAdiamento({ status: 'pendente', enviando_em: 'x' }, '2026-10-21T12:00:00Z', AGORA).erro, /sendo enviada/);
  assert.match(C.validarAdiamento({ status: 'pendente' }, '2027-03-01T12:00:00Z', AGORA).erro, /60 dias/);
});

// ---------------------------------------------------------------- resultados
test('resultados: o crédito vai para a ÚLTIMA mensagem antes do evento; faturou = o maior entre agenda, lead e orçamento', () => {
  const envios = [
    { id: 'e1', tipo: 'retorno', cliente_id: 'c1', telefone: '12999990001', enviado_em: '2026-10-01T13:00:00Z', respondido_em: '2026-10-01T14:00:00Z' },
    { id: 'e2', tipo: 'campanha', cliente_id: 'c1', telefone: '12999990001', enviado_em: '2026-10-08T13:00:00Z' },
    { id: 'e3', tipo: 'orcamento', cliente_id: null, telefone: '12999990002', enviado_em: '2026-10-05T13:00:00Z' },
    { id: 'e4', tipo: 'aniversario', cliente_id: 'c9', telefone: '12999990009', enviado_em: '2026-10-05T13:00:00Z' },
  ];
  const eventos = {
    agendamentos: [
      { id: 'a1', cliente_id: 'c1', telefone: '12999990001', data: '2026-10-12', status: 'concluido', valor: 400, created_at: '2026-10-09T13:00:00Z' },
      { id: 'a2', cliente_id: 'c1', telefone: '12999990001', data: '2026-10-15', status: 'cancelado', valor: 90, created_at: '2026-10-09T13:00:00Z' },
    ],
    os: [{ id: 'o1', cliente_id: null, telefone: '5512999990002', created_at: '2026-10-10T13:00:00Z' }],
    orcamentos: [
      { id: 'q1', cliente_id: null, cliente_telefone: '(12) 99999-0002', status: 'aprovado', total: 1500, decidido_em: '2026-10-11T13:00:00Z' },
      { id: 'q2', cliente_id: null, cliente_telefone: '12999990009', status: 'aprovado', total: 70, decidido_em: '2026-12-31T13:00:00Z' },
    ],
    leads: [{ id: 'l1', cliente_id: 'c1', telefone: '12999990001', status: 'concluido', valor_pago: 380, closed_at: '2026-10-13T13:00:00Z' }],
  };
  const r = C.atribuirResultados({ envios, eventos });
  assert.equal(r.get('e1').agendou, false, 'o agendamento veio depois de e2, que é a última mensagem');
  assert.equal(r.get('e2').agendou, true); assert.equal(r.get('e2').voltou, true);
  assert.equal(r.get('e2').faturou, 400, 'maior entre agenda 400 e lead 380 (não soma em dobro)');
  assert.equal(r.get('e1').respondeu, true);
  assert.equal(r.get('e3').aprovou, true); assert.equal(r.get('e3').faturou, 1500); assert.equal(r.get('e3').voltou, true);
  assert.equal(r.get('e4').faturou, 0, 'evento fora da janela de 30 dias não conta');
  const porTipo = C.resumirResultados(envios, r);
  assert.equal(porTipo.campanha.faturou, 400); assert.equal(porTipo.campanha.taxaVoltou, 100);
  assert.equal(porTipo.retorno.taxaResposta, 100);
  const porLote = C.resumirResultados(envios, r, (e) => (e.tipo === 'campanha' ? 'lote1' : null));
  assert.deepEqual(Object.keys(porLote), ['lote1']);
});

// ---------------------------------------------------------------- passada do atacante: link de fora
test('links de fora: pega https, www e endereço "pelado" (bit.ly/x, evil.com/oferta) — e não confunde com e-mail ou domínio da casa', () => {
  const fora = (t) => C.linksForaDaCasa(t);
  assert.equal(fora('Veja https://indycar-orcador.netlify.app/#/o/abcdefabcdef12 e https://g.page/r/indycar').length, 0);
  assert.equal(fora('Avalie em g.page/r/indycar/review e fale com wa.me/5512999990001 ou instagram.com/indycar').length, 0);
  assert.deepEqual(fora('Olha: evil.com/oferta').map((x) => x.split('/')[0]), ['evil.com']);
  assert.equal(fora('encurtado bit.ly/3abcde').length, 1);
  assert.equal(fora('www.promo-estranha.xyz/ganhe').length, 1);
  assert.equal(fora('HTTPS://EVIL.COM/x').length, 1);
  assert.equal(fora('https://indycar-patio.netlify.app.evil.com/acompanhar').length, 1, 'domínio da casa como prefixo de um golpe');
  assert.equal(fora('https://google.com.evil.com').length, 1);
  assert.equal(fora('https://evilgoogle.com').length, 1);
  assert.equal(fora('https://g.page.evil.net/r').length, 1);
  assert.equal(fora('https://google.com@evil.com/x').length, 1, 'o endereço de verdade vem depois do @');
  assert.equal(fora('https://gооgle.com/x').length, 1, 'letra russa no lugar do o');
  assert.equal(fora('fale pelo contato@oficina.com.br').length, 0, 'e-mail não é link');
  assert.equal(fora('Seu {link_orcamento} e {link_os} estão prontos. R$ 1.500,00 em 3x. Chegue às 09.30h.').length, 0);
  assert.equal(fora('Frase com ponto final em evil.com.').length, 1);
  assert.equal(fora('').length + fora(null).length, 0);
});

// ---------------------------------------------------------------- orçamento aberto segura "sumiu" e "não fechou"
test('orçamento esperando resposta no Orçador segura reativação e não-fechou por 48 h (aniversário e revisão seguem)', () => {
  const sit = { orcamento: { numero: 37, validade: '2026-12-01' } };
  const r = C.bloqueioDeRelacionamento({ tipo: 'reativacao' }, sit, {}, AGORA);
  assert.equal(r.acao, 'adiar'); assert.equal(r.causa, 'orcamento'); assert.match(r.motivo, /orçamento nº 37/);
  assert.equal(Date.parse(r.ate) - AGORA, 48 * 3600000);
  assert.equal(C.bloqueioDeRelacionamento({ tipo: 'nao_fechou' }, sit, {}, AGORA).acao, 'adiar');
  assert.equal(C.bloqueioDeRelacionamento({ tipo: 'aniversario' }, sit, {}, AGORA).acao, 'seguir', 'parabéns não atrapalha a negociação');
  assert.equal(C.bloqueioDeRelacionamento({ tipo: 'retorno' }, sit, {}, AGORA).acao, 'seguir');
  assert.equal(C.bloqueioDeRelacionamento({ tipo: 'orcamento' }, sit, {}, AGORA).acao, 'seguir', 'o próprio lembrete do orçamento sai');
});

test('orçamento aberto: vencido não segura; interruptor desligado não segura; sem número ainda explica', () => {
  assert.equal(C.bloqueioDeRelacionamento({ tipo: 'reativacao' }, { orcamento: { numero: 1, validade: '2026-10-01' } }, {}, AGORA).acao, 'seguir', 'validade já passou');
  assert.equal(C.bloqueioDeRelacionamento({ tipo: 'reativacao' }, { orcamento: { numero: 1, validade: '2026-12-01' } }, { bloquear_com_orcamento_aberto: false }, AGORA).acao, 'seguir');
  assert.match(C.bloqueioDeRelacionamento({ tipo: 'nao_fechou' }, { orcamento: { numero: null, validade: null } }, {}, AGORA).motivo, /esperando resposta no Orçador/);
  const por = C.explicarPendente({ tipo: 'reativacao', status: 'pendente', telefone: '12999990001', enviar_em: new Date(AGORA - 3600000).toISOString() }, { cfg: { janela_inicio: 0, janela_fim: 24 }, agora: AGORA, hoje: { data: '2026-10-20', hora: 11, minuto: 0, diaSemana: 2 }, situacao: { orcamento: { numero: 5, validade: null } } });
  assert.ok(por.passos.some((p) => /orçamento nº 5/.test(p.texto)), 'o "por que não saiu" também explica');
});

// ---------------------------------------------------------------- "Pronto para ligar" com as ligações novas
import { montarProntidao } from '../prontidao.js';
const BASE_PRONTO = {
  cfg: { ativo_posvenda: true, ativo_lembrete: true, msg_posvenda: 'x', msg_lembrete: 'x', link_avaliacao: 'https://g.page/r/x', telefone_teste: '12999990000', carteiro_configurado: true, cfg: {},
    usa_orcador: true, usa_patio_posvenda: true, ativo_orcamento: true,
    msg_extra_lembrete: 'Oi {primeiro_nome}, falta seu OK em {itens}: {link_os}', msg_orcador_novisto: 'Oi {primeiro_nome}: {link_orcamento}', msg_orcador_visto: 'Oi {primeiro_nome}, dúvida? {link_orcamento}' },
  whatsapp: { ok: true, conectado: true }, carteiro: {}, aniversarios: { comData: 10, total: 20 }, ia: {}, teste: {}, agora: Date.parse('2026-10-20T14:00:00Z'),
};
const itensR6 = (extra = []) => [{ id: 'patio_entregas', rotulo: 'Carros entregues', valor: 4, lido: true }, { id: 'orc_parados', rotulo: 'Orçamentos esperando decisão', valor: 2, lido: true }, ...extra];
const ach = (r, id) => r.itens.find((i) => i.id === id);

test('prontidão R6: sem os fatos novos nada muda (os testes antigos continuam valendo)', () => {
  assert.ok(!montarProntidao(BASE_PRONTO).itens.some((i) => i.id.startsWith('r6_')));
});
test('prontidão R6: textos novos com erro viram "falta" com o nome do texto; certos, "ok"', () => {
  let r = montarProntidao({ ...BASE_PRONTO, r6: { itens: itensR6(), semLink: 0 } });
  assert.equal(ach(r, 'r6_textos').estado, 'ok');
  r = montarProntidao({ ...BASE_PRONTO, cfg: { ...BASE_PRONTO.cfg, msg_orcador_visto: 'Oi, ficou alguma dúvida do orçamento? Estou aqui.' }, r6: { itens: itensR6(), semLink: 0 } });
  assert.equal(ach(r, 'r6_textos').estado, 'falta'); assert.match(ach(r, 'r6_textos').texto, /cliente abriu e não decidiu/);
  assert.equal(r.pronto, montarProntidao(BASE_PRONTO).pronto, 'texto novo ruim não derruba o "pronto" das réguas antigas');
});
test('prontidão R6: orçamento parado com o lembrete desligado avisa; sem link público avisa; ligado e certo é ok', () => {
  let r = montarProntidao({ ...BASE_PRONTO, cfg: { ...BASE_PRONTO.cfg, ativo_orcamento: false }, r6: { itens: itensR6(), semLink: 0 } });
  assert.equal(ach(r, 'r6_orcamentos').estado, 'aviso'); assert.match(ach(r, 'r6_orcamentos').texto, /2 orçamento\(s\) esperando resposta/);
  r = montarProntidao({ ...BASE_PRONTO, r6: { itens: itensR6(), semLink: 3 } });
  assert.equal(ach(r, 'r6_orcamentos').estado, 'aviso'); assert.match(ach(r, 'r6_orcamentos').texto, /3 orçamento\(s\) enviado\(s\) sem link/);
  r = montarProntidao({ ...BASE_PRONTO, r6: { itens: itensR6(), semLink: 0 } });
  assert.equal(ach(r, 'r6_orcamentos').estado, 'ok');
  r = montarProntidao({ ...BASE_PRONTO, cfg: { ...BASE_PRONTO.cfg, ativo_orcamento: false }, r6: { itens: [{ id: 'orc_parados', valor: 0, lido: true }], semLink: 0 } });
  assert.ok(!ach(r, 'r6_orcamentos'), 'nada parado e régua desligada: não incomoda');
});
test('prontidão R6: carro entregue com o pós-venda desligado, ou pós-venda sem olhar o Pátio, avisa', () => {
  let r = montarProntidao({ ...BASE_PRONTO, cfg: { ...BASE_PRONTO.cfg, ativo_posvenda: false }, r6: { itens: itensR6(), semLink: 0 } });
  assert.match(ach(r, 'r6_posvenda_patio').texto, /4 carro\(s\) entregue\(s\)/);
  r = montarProntidao({ ...BASE_PRONTO, cfg: { ...BASE_PRONTO.cfg, usa_patio_posvenda: false }, r6: { itens: itensR6(), semLink: 0 } });
  assert.equal(ach(r, 'r6_posvenda_patio').estado, 'aviso'); assert.match(ach(r, 'r6_posvenda_patio').texto, /só olha a Agenda/);
  r = montarProntidao({ ...BASE_PRONTO, r6: { itens: itensR6(), semLink: 0 } });
  assert.ok(!ach(r, 'r6_posvenda_patio'));
});
test('prontidão R6: sistema que não respondeu e retomada gradual aparecem como aviso', () => {
  const r = montarProntidao({ ...BASE_PRONTO, r6: { itens: itensR6([{ id: 'orc_enviados', rotulo: 'Orçamentos enviados (7 dias)', valor: null, lido: false }]), semLink: 0, retomada: { motivo: 'no máximo 8 mensagens nos primeiros 30 min' } } });
  assert.match(ach(r, 'r6_leitura').texto, /Orçamentos enviados/);
  assert.equal(ach(r, 'r6_retomada').estado, 'aviso'); assert.match(ach(r, 'r6_retomada').texto, /de propósito/);
});

// ---------------------------------------------------------------- datas que não existem no calendário
import { dataBanco } from '../dados.js';
test('datas: 31/02, mês 13 e dia 45 viram null em vez de estourar no banco (dataBanco e diaValido)', () => {
  for (const ruim of ['2026-13-45', '2026-02-31', '2026-00-10', '31/02/2026', '31/04', '30/02', '0/5/2026', '2026-10-32']) assert.equal(dataBanco(ruim), null, ruim);
  assert.equal(dataBanco('2026-10-20'), '2026-10-20');
  assert.equal(dataBanco('20/10/2026'), '2026-10-20');
  assert.equal(dataBanco('29/02/2028'), '2028-02-29', 'bissexto');
  assert.equal(dataBanco('29/02'), '1904-02-29', 'dia/mês de planilha usa o ano bissexto de marcação');
  assert.equal(dataBanco('2026-10-20T14:00:00Z'), '2026-10-20', 'aceita ISO completo');
  assert.equal(C.diaValido('2026-02-31'), null); assert.equal(C.diaValido('2026-10-20'), '2026-10-20'); assert.equal(C.diaValido("2026-10-20'--"), null); assert.equal(C.diaValido(null), null);
});

// ---------------------------------------------------------------- projeção do mês com o Orçador
import { projetarMes } from '../projecao.js';
const CFG_PROJ = { envia_domingo: true, dias_orcamento: 3, usa_orcador: true, ativo_orcamento: true, intervalo_minimo_dias: 0, horas_lembrete: 20, limite_por_hora: 60, janela_inicio: 8, janela_fim: 20 };
const ORC = (n, extra = {}) => ({ id: ID(n), status: 'enviado', cliente_id: ID(500 + n), cliente_nome: `Cli ${n}`, cliente_telefone: `(12) 99999-${String(1000 + n)}`, enviado_em: '2026-10-20T14:00:00Z', decidido_em: null, validade: '2026-11-30', token_publico: 'abcdefghijklmnop1234', lead_id: null, ...extra });

test('projeção: orçamento do Orçador entra no dia certo (enviado + N dias), com a origem marcada', () => {
  const p = projetarMes({ hoje: '2026-10-21', cfg: CFG_PROJ, orcamentos: [ORC(1)], agora: new Date('2026-10-21T14:00:00Z') });
  assert.equal(p.porRegua.orcamento.total, 1);
  const item = p.itens.find((i) => i.tipo === 'orcamento');
  assert.equal(item.data, '2026-10-23');
  assert.equal(item.origem, 'orcador');
});

test('projeção: sem link público não entra (avisa), decidido não entra, validade vencida não entra, Orçador desligado ignora tudo', () => {
  const orcs = [ORC(1, { token_publico: null }), ORC(2, { decidido_em: '2026-10-21T10:00:00Z' }), ORC(3, { validade: '2026-10-22' }), ORC(4, { status: 'aprovado' })];
  const p = projetarMes({ hoje: '2026-10-21', cfg: CFG_PROJ, orcamentos: orcs, agora: new Date('2026-10-21T14:00:00Z') });
  assert.equal(p.porRegua.orcamento.total, 0);
  assert.ok(p.avisos.some((a) => /sem link público/.test(a)));
  const desligado = projetarMes({ hoje: '2026-10-21', cfg: { ...CFG_PROJ, usa_orcador: false }, orcamentos: [ORC(5)], agora: new Date('2026-10-21T14:00:00Z') });
  assert.equal(desligado.porRegua.orcamento.total, 0);
});

test('projeção: o lead do CRM que nasceu de um orçamento do Orçador não conta em dobro', () => {
  const lead = { id: ID(900), cliente_id: ID(501), nome: 'Cli 1', telefone: '(12) 99999-1001', status: 'orcamento', updated_at: '2026-10-20T14:00:00Z' };
  const com = projetarMes({ hoje: '2026-10-21', cfg: CFG_PROJ, leads: [lead], orcamentos: [ORC(1, { lead_id: ID(900) })], agora: new Date('2026-10-21T14:00:00Z') });
  assert.equal(com.porRegua.orcamento.total, 1, 'um só lembrete');
  const sem = projetarMes({ hoje: '2026-10-21', cfg: CFG_PROJ, leads: [lead], orcamentos: [], agora: new Date('2026-10-21T14:00:00Z') });
  assert.equal(sem.porRegua.orcamento.total, 1, 'sem Orçador o lead continua valendo');
  const desligado = projetarMes({ hoje: '2026-10-21', cfg: { ...CFG_PROJ, usa_orcador: false }, leads: [lead], orcamentos: [ORC(1, { lead_id: ID(900) })], agora: new Date('2026-10-21T14:00:00Z') });
  assert.equal(desligado.porRegua.orcamento.total, 1, 'com o Orçador desligado o lead volta a valer');
});

test('projeção: cliente que não aceita mensagens fica fora, também no Orçador', () => {
  const clientes = [{ id: ID(501), nome: 'Cli 1', telefone: '(12) 99999-1001', aceita_mensagens: false }];
  const p = projetarMes({ hoje: '2026-10-21', cfg: CFG_PROJ, clientes, orcamentos: [ORC(1)], agora: new Date('2026-10-21T14:00:00Z') });
  assert.equal(p.porRegua.orcamento.total, 0);
});

test('por que não saiu: o teto por cliente no dia mostrado é o que está configurado (1 vira "1 mensagem", não "1 mensagens")', () => {
  const cfg = { janela_inicio: 8, janela_fim: 20, pausa_geral: false, envia_domingo: false, limite_por_hora: 60, limite_por_dia: 300, intervalo_mesmo_cliente_min: 0 };
  const hoje = { data: '2026-10-20', hora: 11, minuto: 0, diaSemana: 2 };
  const e = { id: ID(51), status: 'pendente', tipo: 'campanha', telefone: '12999990006', enviar_em: new Date(AGORA - 3600000).toISOString() };
  const um = C.explicarPendente(e, { cfg, agora: AGORA, hoje, hojeDoCliente: 1, maxPorDia: 1 }).passos.map((p) => p.texto).join(' | ');
  assert.match(um, /já recebeu 1 mensagem hoje \(o teto é 1\)/);
  const dois = C.explicarPendente(e, { cfg, agora: AGORA, hoje, hojeDoCliente: 1, maxPorDia: 2 });
  assert.equal(dois.bloqueios + dois.esperas, 0, 'com teto 2, uma mensagem hoje não segura');
});
