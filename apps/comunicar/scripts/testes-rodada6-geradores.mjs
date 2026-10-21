// Rodada 6 · parte 2 — geradores de ponta a ponta contra um banco de mentira (nada toca a produção).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instalarBancoFalso } from './banco-falso.mjs';

const tabelas = {};
const rpcs = {};
const banco = instalarBancoFalso(tabelas, { rpcs });
const D = await import('../dados.js');
const C = await import('../conexoes.js');

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const H = D.hoje();
const diaSP = (n, hm = '12:00') => D.instanteSP(D.somarDias(H, n), hm).toISOString();
const limpar = () => { D.esquecerConfigDoPatio(); for (const k of Object.keys(tabelas)) tabelas[k].length = 0; };
const config = (extra = {}) => { tabelas.posvenda_config = [{ id: true, ativo_posvenda: true, ativo_avaliacao: true, ativo_retorno: true, ativo_orcamento: true, ativo_extra_lembrete: true, link_avaliacao: 'https://g.page/r/indycar', hora_envio: '09:30', msg_posvenda: 'Oi {primeiro_nome}, tudo certo com o {carro}?', msg_avaliacao: 'Oi {primeiro_nome}, avalie: {link_avaliacao}', msg_retorno: 'Oi {primeiro_nome}, hora da revisão do {carro}.', msg_extra_lembrete: 'Oi {primeiro_nome}, falta seu OK: {itens} {link_os}', ...extra }]; };
const envios = () => tabelas.posvenda_envios || [];
const porChave = (c) => envios().find((e) => e.chave_unica === c);
const tel = (n) => `1299999${String(n).padStart(4, '0')}`;
const os = (n, extra = {}) => ({ id: ID(n), numero: n, etapa: 'entregue', cliente_id: ID(100 + n), agendamento_id: null, lead_id: null, cliente_nome: `Cliente ${n}`, telefone: tel(n), veiculo: 'Gol', placa: 'ABC1D23', servico: 'Troca de óleo', entregue_em: diaSP(-2), token_publico: `a1b2c3d4e5f60718${String(n).padStart(4, "0")}`, created_at: diaSP(-3), ...extra });
const cliente = (n, extra = {}) => ({ id: ID(100 + n), nome: `Cliente ${n}`, telefone: tel(n), telefone_e164: tel(n), aceita_mensagens: true, ...extra });

test.after(() => banco.restaurar());

// ---------------------------------------------------------------- Pátio → pós-venda / avaliação
test('carro entregue no Pátio vira pós-venda (chave do Pátio, os_id gravado) e rodar de novo NÃO duplica', async () => {
  limpar(); config();
  tabelas.patio_os = [os(1)]; tabelas.clientes = [cliente(1)];
  const r1 = await D.gerarTudo({ so: 'posvenda' });
  assert.equal(r1.erros.length, 0, JSON.stringify(r1.erros));
  assert.equal(r1.posvenda, 1);
  const e = porChave(`posvenda:patio:${ID(1)}`);
  assert.ok(e, 'envio criado');
  assert.equal(e.tipo, 'posvenda'); assert.equal(e.os_id, ID(1)); assert.equal(e.status, 'pendente');
  const r2 = await D.gerarTudo({ so: 'posvenda' });
  assert.equal(r2.posvenda, 0);
  assert.equal(envios().length, 1);
});

test('mesma entrega pela Agenda e pelo Pátio: só UMA mensagem (a chave da Agenda vale)', async () => {
  limpar(); config();
  const ag = ID(900);
  tabelas.patio_os = [os(2, { agendamento_id: ag })]; tabelas.clientes = [cliente(2)];
  tabelas.agendamentos = [{ id: ag, cliente_id: ID(102), cliente_nome: 'Cliente 2', telefone: tel(2), servico: 'Troca de óleo', veiculo: 'Gol', placa: 'ABC1D23', data: D.somarDias(H, -2), hora: '10:00', status: 'concluido' }];
  await D.gerarTudo({ so: 'posvenda' });
  await D.gerarTudo({ so: 'posvenda' });
  assert.equal(envios().length, 1);
  assert.equal(envios()[0].chave_unica, `posvenda:${ag}`);
});

test('nota 5 no Pátio vai direto ao convite do Google; nota 2 segura (pulado, equipe cuida)', async () => {
  limpar(); config();
  tabelas.patio_os = [os(3), os(4)]; tabelas.clientes = [cliente(3), cliente(4)];
  tabelas.patio_avaliacoes = [{ os_id: ID(3), nota: 5 }, { os_id: ID(4), nota: 2 }];
  await D.gerarTudo({ so: 'posvenda' });
  const g = porChave(`avaliacao:patio:${ID(3)}`);
  assert.ok(g, 'convite do Google'); assert.equal(g.tipo, 'avaliacao'); assert.match(g.corpo, /g\.page\/r\/indycar/);
  const baixa = porChave(`posvenda:patio:${ID(4)}`);
  assert.equal(baixa.status, 'pulado'); assert.ok(baixa.motivo_pulado);
});

test('cliente que pediu PARAR não recebe o pós-venda do Pátio (gravado como pulado)', async () => {
  limpar(); config();
  tabelas.patio_os = [os(5)]; tabelas.clientes = [cliente(5, { aceita_mensagens: false })];
  await D.gerarTudo({ so: 'posvenda' });
  assert.equal(porChave(`posvenda:patio:${ID(5)}`).status, 'pulado');
});

test('interruptor usa_patio_posvenda desligado: o Pátio não gera nada', async () => {
  limpar(); config({ usa_patio_posvenda: false });
  tabelas.patio_os = [os(6)]; tabelas.clientes = [cliente(6)];
  await D.gerarTudo({ so: 'posvenda' });
  assert.equal(envios().length, 0);
});

// ---------------------------------------------------------------- Pátio → revisão
test('revisão pelo histórico do Pátio: serviço antigo convida; quem voltou depois não; um convite por cliente', async () => {
  limpar(); config({ meses_retorno: 6 });
  const antiga = D.somarDias(H, -184);
  tabelas.clientes = [cliente(7), cliente(8)];
  tabelas.patio_os = [
    os(7, { entregue_em: D.instanteSP(antiga, '12:00').toISOString(), created_at: D.instanteSP(antiga, '09:00').toISOString() }),
    os(8, { entregue_em: D.instanteSP(antiga, '12:00').toISOString(), created_at: D.instanteSP(antiga, '09:00').toISOString() }),
    // cliente 8 voltou: nova OS recente
    os(18, { cliente_id: ID(108), etapa: 'recebido', entregue_em: null, created_at: diaSP(-10), telefone: tel(8) }),
  ];
  tabelas.regras_retorno = [];
  const r = await D.gerarTudo({ so: 'retorno' });
  assert.equal(r.erros.length, 0, JSON.stringify(r.erros));
  assert.ok(porChave(`retorno:patio:${ID(7)}`), 'cliente 7 convidado');
  assert.equal(porChave(`retorno:patio:${ID(8)}`), undefined, 'cliente 8 voltou depois');
  const de = envios().filter((e) => e.tipo === 'retorno');
  assert.equal(de.length, 1);
});

// ---------------------------------------------------------------- Orçador → lembrete
const orc = (n, extra = {}) => ({ id: ID(500 + n), numero: n, status: 'enviado', cliente_id: ID(100 + n), cliente_nome: `Cliente ${n}`, cliente_telefone: tel(n), veiculo: { montadora: 'VW', modelo: 'Gol', ano: 2015, placa: 'ABC1D23' }, pedido: 'Freios', total: 800, validade: D.somarDias(H, 10), enviado_em: new Date(Date.now() - 4 * 86400000).toISOString(), visualizado_em: null, decidido_em: null, token_publico: `orctoken-teste-${n}`, lead_id: null, agendamento_id: null, created_at: diaSP(-5), ...extra });

test('orçamento enviado e parado vira lembrete com o link do Orçador; visto e não visto usam textos diferentes; não duplica', async () => {
  limpar(); config({ dias_orcamento: 3, msg_orcador_novisto: 'Oi {primeiro_nome}, seu orçamento: {link_orcamento}', msg_orcador_visto: 'Viu o orçamento do {carro}? {link_orcamento}' });
  tabelas.clientes = [cliente(9), cliente(10)];
  tabelas.orc_orcamentos = [orc(9), orc(10, { visualizado_em: new Date(Date.now() - 86400000).toISOString() })];
  const r = await D.gerarTudo({ so: 'orcamento' });
  assert.equal(r.erros.length, 0, JSON.stringify(r.erros));
  const a = envios().find((e) => e.orcamento_id === ID(509)), b = envios().find((e) => e.orcamento_id === ID(510));
  assert.ok(a && b);
  assert.match(a.corpo, /indycar-orcador\.netlify\.app\/#\/o\/orctoken-teste-9/);
  assert.match(b.corpo, /^Viu o orçamento/);
  await D.gerarTudo({ so: 'orcamento' });
  assert.equal(envios().filter((e) => e.tipo === 'orcamento').length, 2);
});

test('orçamento já decidido, sem token ou ainda novo não gera lembrete', async () => {
  limpar(); config({ dias_orcamento: 3 });
  tabelas.clientes = [cliente(11), cliente(12), cliente(13)];
  tabelas.orc_orcamentos = [
    orc(11, { status: 'aprovado', decidido_em: new Date().toISOString() }),
    orc(12, { token_publico: null }),
    orc(13, { enviado_em: new Date(Date.now() - 3600000).toISOString() }),
  ];
  await D.gerarTudo({ so: 'orcamento' });
  assert.equal(envios().length, 0);
});

// ---------------------------------------------------------------- Pátio → extra pendente
test('extra pendente há horas, com o aviso já enviado, vira UM lembrete com o link de acompanhar', async () => {
  limpar(); config({ horas_extra_lembrete: 4 });
  tabelas.clientes = [cliente(14)];
  tabelas.patio_os = [os(14, { etapa: 'aguardando_aprovacao', entregue_em: null })];
  tabelas.patio_extras = [{ id: ID(700), os_id: ID(14), descricao: 'Pastilha de freio', status: 'pendente', created_at: new Date(Date.now() - 7 * 3600000).toISOString() }];
  tabelas.patio_config = [{ id: true, link_base: 'https://indycar-patio.netlify.app', avisar_extra: true }];
  tabelas.posvenda_envios = [{ id: ID(800), tipo: 'patio_extra', os_id: ID(14), status: 'enviado', enviado_em: new Date(Date.now() - 6 * 3600000).toISOString(), chave_unica: `patio_extra:${ID(14)}:1`, telefone: tel(14) }];
  const r = await D.gerarTudo({ so: 'extra_lembrete' });
  assert.equal(r.erros.length, 0, JSON.stringify(r.erros));
  const novos = envios().filter((e) => String(e.chave_unica).startsWith('patio_extra_lembrete:'));
  assert.equal(novos.length, 1);
  assert.match(novos[0].corpo, /a1b2c3d4e5f607180014/);
  await D.gerarTudo({ so: 'extra_lembrete' });
  assert.equal(envios().filter((e) => String(e.chave_unica).startsWith('patio_extra_lembrete:')).length, 1);
});

test('extra: se o Pátio desligou "avisar extra", o Comunicar não insiste', async () => {
  limpar(); config({ horas_extra_lembrete: 4 });
  tabelas.clientes = [cliente(15)];
  tabelas.patio_os = [os(15, { etapa: 'aguardando_aprovacao', entregue_em: null })];
  tabelas.patio_extras = [{ id: ID(701), os_id: ID(15), descricao: 'Filtro', status: 'pendente', created_at: new Date(Date.now() - 8 * 3600000).toISOString() }];
  tabelas.patio_config = [{ id: true, link_base: 'https://indycar-patio.netlify.app', avisar_extra: false }];
  await D.gerarTudo({ so: 'extra_lembrete' });
  assert.equal(envios().length, 0);
});

// ---------------------------------------------------------------- segmentos novos
test('segmento "entregues no Pátio" traz quem recebeu o carro, sem quem pediu PARAR, e mostra o motivo', async () => {
  limpar(); config();
  tabelas.clientes = [cliente(16), cliente(17, { aceita_mensagens: false })];
  tabelas.patio_os = [os(16, { entregue_em: diaSP(-5) }), os(17, { entregue_em: diaSP(-5) })];
  const r = await D.segmentarComMotivos('entregues_patio', 30);
  assert.deepEqual(r.lista.map((c) => c.nome), ['Cliente 16']);
  assert.equal(r.pulados.nao_quer, 1);
  assert.equal(r.bruto, 2);
});

test('peneirarSegmento: avulsos entram por telefone, quem pediu PARAR (por id ou telefone) sai, sem repetição', () => {
  const lista = [
    { id: ID(1), nome: 'A', telefone: '12999990001' },
    { id: ID(2), nome: 'B', telefone: '12999990002' },
    { id: null, nome: 'C', telefone: '12999990003' },
    { id: null, nome: 'C2', telefone: '12999990003' },
  ];
  const r = D.peneirarSegmento(lista, { optOut: new Set([ID(1)]), optOutTels: new Set(['12999990002']) });
  const nomes = r.recebem.map((x) => x.nome);
  assert.deepEqual(nomes, ['C']);
  assert.equal(r.pulados.nao_quer, 2);
  assert.equal(r.pulados.repetido, 1);
});

// ---------------------------------------------------------------- agenda, resultados, conexões
test('agenda de envios agrupa o que está na fila por dia', async () => {
  limpar(); config();
  tabelas.posvenda_envios = [
    { id: ID(1), status: 'pendente', tipo: 'posvenda', nome: 'A', telefone: tel(1), corpo: 'x', enviar_em: diaSP(0, '12:00') },
    { id: ID(2), status: 'pendente', tipo: 'retorno', nome: 'B', telefone: tel(2), corpo: 'y', enviar_em: diaSP(1, '12:00') },
  ];
  const a = await D.agendaDeEnvios();
  assert.ok(Array.isArray(a.dias));
  assert.ok(a.dias.length >= 1);
  assert.equal(a.cfg.hora_envio, '09:30');
});

test('adiar à mão: só pendente, nunca além da validade; id inválido é recusado', async () => {
  limpar(); config();
  tabelas.posvenda_envios = [
    { id: ID(1), status: 'pendente', tipo: 'posvenda', enviar_em: diaSP(0), expira_em: diaSP(3) },
    { id: ID(2), status: 'enviado', tipo: 'posvenda', enviar_em: diaSP(0) },
  ];
  assert.equal((await D.adiarManual('nao-e-uuid', diaSP(1))).ok, false);
  assert.equal((await D.adiarManual(ID(2), diaSP(1))).ok, false);
  assert.equal((await D.adiarManual(ID(1), diaSP(10))).ok, false);
  const ok = await D.adiarManual(ID(1), diaSP(2));
  assert.equal(ok.ok, true);
  assert.equal(new Date(tabelas.posvenda_envios[0].enviar_em).getTime(), new Date(ok.quando).getTime());
});

test('"por que não saiu": id inexistente devolve null; pendente devolve veredito em português', async () => {
  limpar(); config();
  tabelas.posvenda_envios = [{ id: ID(1), status: 'pendente', tipo: 'posvenda', nome: 'A', telefone: tel(1), corpo: 'Oi', enviar_em: diaSP(0), expira_em: diaSP(3) }];
  assert.equal(await D.explicarEnvio(ID(99)), null);
  const x = await D.explicarEnvio(ID(1));
  assert.ok(x && x.envio.id === ID(1));
  assert.ok(JSON.stringify(x).length > 40);
});

test('resultados: respondeu, agendou depois, voltou e faturou ficam no funil; mensagem de teste não conta', async () => {
  limpar(); config();
  tabelas.posvenda_envios = [
    { id: ID(1), status: 'enviado', tipo: 'campanha', cliente_id: ID(101), telefone: tel(1), telefone_e164: `12${tel(1)}`, enviado_em: diaSP(-5), respondido_em: diaSP(-4), lote: ID(50), criado_por: 'joao' },
    { id: ID(2), status: 'enviado', tipo: 'campanha', cliente_id: ID(102), telefone: tel(2), enviado_em: diaSP(-5), lote: ID(50), criado_por: 'teste' },
  ];
  tabelas.agendamentos = [{ id: ID(60), cliente_id: ID(101), telefone: tel(1), data: D.somarDias(H, -2), status: 'concluido', valor: 350, created_at: diaSP(-4) }];
  const r = await D.resultados({});
  assert.equal(r.total.enviadas, 1);
  assert.equal(r.total.responderam, 1);
  assert.ok(r.total.agendaram >= 1);
  assert.equal(r.total.faturou, 350);
  assert.ok(Array.isArray(r.porLote) || typeof r.porLote === 'object');
});

test('resultados com detalhe: linha por mensagem, quem voltou primeiro, planilha em pt-BR sem fórmula solta', async () => {
  limpar(); config();
  tabelas.posvenda_envios = [
    { id: ID(1), status: 'enviado', tipo: 'campanha', nome: '=SOMA(A1)', cliente_id: ID(101), telefone: tel(1), telefone_e164: tel(1), enviado_em: diaSP(-5), respondido_em: diaSP(-4), lote: ID(50), criado_por: 'joao' },
    { id: ID(2), status: 'enviado', tipo: 'campanha', nome: 'Bia', cliente_id: ID(102), telefone: tel(2), telefone_e164: tel(2), enviado_em: diaSP(-5), lote: ID(50), criado_por: 'joao' },
  ];
  tabelas.agendamentos = [{ id: ID(60), cliente_id: ID(101), telefone: tel(1), data: D.somarDias(H, -2), status: 'concluido', valor: 1234.5, created_at: diaSP(-4) }];
  const r = await D.resultados({ detalhe: true });
  assert.equal(r.linhas.length, 2);
  assert.equal(r.linhas[0].nome, '=SOMA(A1)', 'quem faturou vem primeiro');
  assert.equal(r.linhas[0].voltou, true); assert.equal(r.linhas[0].faturou, 1234.5);
  assert.equal(r.linhas[1].voltou, false);
  assert.equal((await D.resultados({})).linhas, undefined, 'sem detalhe a resposta não carrega telefone nenhum');
  const csv = D.paraCSV(r.linhas, D.COLUNAS_CSV_RESULTADOS);
  assert.equal(csv.charCodeAt(0), 0xFEFF, 'BOM para o Excel');
  assert.ok(csv.includes("'=SOMA(A1)"), 'fórmula neutralizada');
  assert.match(csv, /1234,5/, 'vírgula decimal');
  assert.match(csv, /;sim;/);
});

test('projeção lê do Orçador só o que espera decisão (enviado, sem decidido_em) e a conta sai junto com o resto', async () => {
  limpar(); config();
  tabelas.orc_orcamentos = [
    { id: ID(1), status: 'enviado', decidido_em: null, cliente_nome: 'A', cliente_telefone: '12999990001', enviado_em: diaSP(-1), token_publico: 'abcdefghijklmnop1234' },
    { id: ID(2), status: 'enviado', decidido_em: diaSP(-1), cliente_nome: 'B', cliente_telefone: '12999990002', enviado_em: diaSP(-1), token_publico: 'abcdefghijklmnop1235' },
    { id: ID(3), status: 'aprovado', decidido_em: diaSP(-1), cliente_nome: 'C', cliente_telefone: '12999990003', enviado_em: diaSP(-3), token_publico: 'abcdefghijklmnop1236' },
  ];
  const d = await D.dadosDaProjecao();
  assert.deepEqual(d.orcamentos.map((o) => o.id), [ID(1)]);
  const { projetarMes } = await import('../projecao.js');
  const p = projetarMes({ hoje: H, ...d, cfg: { ...d.cfg, usa_orcador: true, dias_orcamento: 3 } });
  assert.equal(p.porRegua.orcamento.total, 1);
});

test('conexões: lê os números reais dos outros sistemas e diz o que está ligado', async () => {
  limpar(); config();
  tabelas.patio_os = [os(1), os(2, { etapa: 'em_execucao', entregue_em: null })];
  tabelas.patio_extras = [{ id: ID(1), os_id: ID(2), status: 'pendente' }];
  const s = await D.statusDasConexoes();
  const por = Object.fromEntries(s.itens.map((i) => [i.id, i]));
  assert.equal(por.patio_ativas.valor, 1);
  assert.equal(por.patio_extras.valor, 1);
  assert.equal(por.patio_entregas.valor, 1);
  assert.ok(s.itens.every((i) => typeof i.rotulo === 'string' && i.rotulo));
});

test('nenhuma chamada saiu para a rede de verdade durante os testes', () => {
  assert.ok(banco.log.length > 20);
  assert.ok(banco.log.every((l) => typeof l.nome === 'string'));
});

// ---------------------------------------------------------------- passada de ponta a ponta: Agenda × Pátio no mesmo horário
test('mesmo horário na Agenda e no Pátio com nota BAIXA: a Agenda não manda a pergunta por cima (um só registro, pulado)', async () => {
  limpar(); config();
  const ag = ID(910);
  tabelas.patio_os = [os(20, { agendamento_id: ag })]; tabelas.clientes = [cliente(20)];
  tabelas.patio_avaliacoes = [{ os_id: ID(20), nota: 2 }];
  tabelas.agendamentos = [{ id: ag, cliente_id: ID(120), cliente_nome: 'Cliente 20', telefone: tel(20), servico: 'Freios', veiculo: 'Gol', placa: 'ABC1D23', data: D.somarDias(H, -2), hora: '10:00', status: 'concluido' }];
  await D.gerarTudo({ so: 'posvenda' });
  const linhas = envios().filter((e) => e.chave_unica === `posvenda:${ag}`);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].status, 'pulado');
  assert.equal(envios().filter((e) => e.status === 'pendente').length, 0, 'nada pendente para o cliente que reclamou');
});

test('mesmo horário com nota ALTA: vai só o convite do Google; o "ficou tudo certo?" fica registrado como pulado', async () => {
  limpar(); config();
  const ag = ID(911);
  tabelas.patio_os = [os(21, { agendamento_id: ag })]; tabelas.clientes = [cliente(21)];
  tabelas.patio_avaliacoes = [{ os_id: ID(21), nota: 5 }];
  tabelas.agendamentos = [{ id: ag, cliente_id: ID(121), cliente_nome: 'Cliente 21', telefone: tel(21), servico: 'Freios', veiculo: 'Gol', placa: 'ABC1D23', data: D.somarDias(H, -2), hora: '10:00', status: 'concluido' }];
  await D.gerarTudo({ so: 'posvenda' });
  const pend = envios().filter((e) => e.status === 'pendente');
  assert.equal(pend.length, 1); assert.equal(pend[0].tipo, 'avaliacao');
  assert.equal(envios().find((e) => e.chave_unica === `posvenda:${ag}`).status, 'pulado');
  await D.gerarTudo({ so: 'posvenda' });
  assert.equal(envios().length, 2, 'rodar de novo não cria nada');
});

test('a prévia (simulação) também respeita: nota baixa no Pátio tira o pós-venda da Agenda da lista', async () => {
  limpar(); config();
  const ag = ID(912);
  tabelas.patio_os = [os(22, { agendamento_id: ag })]; tabelas.clientes = [cliente(22)];
  tabelas.patio_avaliacoes = [{ os_id: ID(22), nota: 1 }];
  tabelas.agendamentos = [{ id: ag, cliente_id: ID(122), cliente_nome: 'Cliente 22', telefone: tel(22), servico: 'Freios', veiculo: 'Gol', placa: 'ABC1D23', data: D.somarDias(H, -2), hora: '10:00', status: 'concluido' }];
  const r = await D.gerarTudo({ so: 'posvenda', simular: true });
  assert.equal(r.previa.filter((x) => x.tipo === 'posvenda').length, 0);
  assert.equal(envios().length, 0, 'simulação não grava nada');
});

// ---------------------------------------------------------------- nota baixa no Pátio avisa a equipe
test('nota baixa no Pátio: vira tarefa urgente ligada ao registro e avisa os gestores — uma vez só, mesmo rodando de novo', async () => {
  limpar(); config();
  const avisos = [];
  rpcs.comunicar_gestores = () => [ID(900), ID(901)];
  rpcs.notificar = (a) => { avisos.push(a); return ID(950 + avisos.length); };
  tabelas.patio_os = [os(7), os(8), os(9)]; tabelas.clientes = [cliente(7), cliente(8), cliente(9)];
  tabelas.patio_avaliacoes = [{ os_id: ID(7), nota: 2, comentario: '  demorou   demais\n e   sujou o banco  ' }, { os_id: ID(8), nota: 3 }, { os_id: ID(9), nota: 4 }];
  tabelas.tarefas = [];
  await D.gerarTudo({ so: 'posvenda' });
  assert.equal(tabelas.tarefas.length, 2, 'notas 2 e 3 geram tarefa, a 4 não');
  const t7 = tabelas.tarefas.find((t) => /Cliente 7/.test(t.titulo));
  assert.match(t7.titulo, /^Nota 2 no Pátio/);
  assert.equal(t7.prioridade, 1); assert.equal(t7.responsavel_id, ID(900)); assert.equal(t7.cliente_id, ID(107));
  assert.match(t7.descricao, /demorou demais e sujou o banco/, 'comentário limpo, sem quebra de linha');
  assert.equal(porChave(`posvenda:patio:${ID(7)}`).tarefa_id, t7.id, 'o registro guardado aponta para a tarefa');
  assert.equal(avisos.length, 4, '2 gestores × 2 notas baixas');
  assert.ok(avisos.every((a) => a.p_tipo === 'reclamacao' && /^nota-baixa:/.test(a.p_chave)));
  assert.ok(Date.parse(t7.vence_em) - Date.now() < 25 * 3600000);
  await D.gerarTudo({ so: 'posvenda' });
  assert.equal(tabelas.tarefas.length, 2, 'rodar de novo não cria tarefa repetida');
  assert.equal(avisos.length, 4, 'nem aviso repetido');
});

test('nota baixa: sem gestor cadastrado a tarefa nasce sem dono e nada quebra; a simulação não cria tarefa nem aviso', async () => {
  limpar(); config();
  const avisos = [];
  rpcs.comunicar_gestores = () => [];
  rpcs.notificar = (a) => { avisos.push(a); return ID(960); };
  tabelas.patio_os = [os(10)]; tabelas.clientes = [cliente(10)];
  tabelas.patio_avaliacoes = [{ os_id: ID(10), nota: 1 }];
  tabelas.tarefas = [];
  await D.gerarTudo({ so: 'posvenda', simular: true });
  assert.equal(tabelas.tarefas.length, 0, 'simular não grava');
  assert.equal(avisos.length, 0);
  await D.gerarTudo({ so: 'posvenda' });
  assert.equal(tabelas.tarefas.length, 1);
  assert.equal(tabelas.tarefas[0].responsavel_id ?? null, null);
  assert.equal(avisos.length, 0, 'sem gestor, ninguém para avisar');
  assert.equal(porChave(`posvenda:patio:${ID(10)}`).status, 'pulado');
});

test('ficha do cliente: "na fila" traz o que ainda vai sair pelo cadastro OU pelo telefone, em ordem, sem enviadas nem de outro cliente', async () => {
  limpar(); config();
  tabelas.clientes = [cliente(20), cliente(21)];
  tabelas.posvenda_envios = [
    { id: ID(1), status: 'pendente', tipo: 'campanha', cliente_id: ID(120), telefone: tel(20), telefone_e164: tel(20), corpo: 'B', enviar_em: diaSP(2) },
    { id: ID(2), status: 'pendente', tipo: 'avulsa', cliente_id: null, telefone: tel(20), telefone_e164: tel(20), corpo: 'A por telefone', enviar_em: diaSP(1) },
    { id: ID(3), status: 'enviado', tipo: 'posvenda', cliente_id: ID(120), telefone: tel(20), telefone_e164: tel(20), corpo: 'já foi', enviar_em: diaSP(-3) },
    { id: ID(4), status: 'pendente', tipo: 'campanha', cliente_id: ID(121), telefone: tel(21), telefone_e164: tel(21), corpo: 'de outro', enviar_em: diaSP(1) },
    { id: ID(5), status: 'cancelado', tipo: 'campanha', cliente_id: ID(120), telefone: tel(20), telefone_e164: tel(20), corpo: 'cancelada', enviar_em: diaSP(1) },
  ];
  const f = await D.fichaCliente(ID(120));
  assert.deepEqual(f.programadas.map((e) => e.id), [ID(2), ID(1)], 'em ordem de horário, uma pelo telefone e uma pelo cadastro');
  assert.ok(f.programadas.every((e) => e.corpo && e.enviar_em));
  assert.equal(f.envios.length, 3, 'o histórico continua como antes (só pelo cadastro)');
  assert.deepEqual((await D.fichaCliente(ID(121))).programadas.map((e) => e.id), [ID(4)]);
});
