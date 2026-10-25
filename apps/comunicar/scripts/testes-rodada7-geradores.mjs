// Rodada 7 · parte 2 — as réguas dos eventos reais de ponta a ponta contra um banco de mentira (nada toca a produção).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instalarBancoFalso } from './banco-falso.mjs';

const tabelas = {};
const rpcs = { orc_recusados_recuperaveis: () => tabelas.__recusados || [], comunicar_gestores: () => [ID(7)], notificar: () => 'n1', registrar_auditoria: () => null };
const banco = instalarBancoFalso(tabelas, { rpcs });
const D = await import('../dados.js');

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const H = D.hoje();
const tel = (n) => `1299888${String(n).padStart(4, '0')}`;
const limpar = () => { D.esquecerConfigDoPatio(); for (const k of Object.keys(tabelas)) tabelas[k] = []; };
const MSG = {
  msg_aprovou: 'Oi {primeiro_nome}! Aprovou o {carro}, falta o horário.',
  msg_faltou: 'Oi {primeiro_nome}! Sentimos sua falta. Remarcamos o {servico}?',
  msg_vencendo: 'Oi {primeiro_nome}! Vale até {validade}: {link_orcamento}',
  msg_pronto_lembrete: 'Oi {primeiro_nome}! O {carro} está pronto: {link_os}',
};
const config = (extra = {}) => { tabelas.posvenda_config = [{ id: true, hora_envio: '09:30', ativo_aprovou: true, ativo_faltou: true, ativo_vencendo: true, ativo_pronto_lembrete: true, ...MSG, ...extra }]; };
const envios = () => tabelas.posvenda_envios || [];
const porChave = (c) => envios().find((e) => e.chave_unica === c);
const horasAtras = (h) => new Date(Date.now() - h * 3600000).toISOString();
const orc = (n, extra = {}) => ({ id: ID(n), numero: n, status: 'aprovado', cliente_id: ID(100 + n), cliente_nome: `Cliente ${n}`, cliente_telefone: tel(n), veiculo: { modelo: 'Gol', placa: 'ABC1D23' }, pedido: 'Freios', total: 900, validade: D.somarDias(H, 5), enviado_em: horasAtras(30), visualizado_em: null, decidido_em: horasAtras(6), token_publico: `tok${String(n).padStart(4, '0')}abcdefghijklmn`, lead_id: null, agendamento_id: null, created_at: horasAtras(30), ...extra });

test.after(() => banco.restaurar());

test('aprovou: orçamento aprovado há 6 h sem horário vira convite (chave, orçamento ligado, validade de 5 dias) e rodar de novo não duplica', async () => {
  limpar(); config({ horas_aprovou: 4 });
  tabelas.orc_orcamentos = [orc(1)];
  const r = await D.gerarTudo({ so: 'aprovou' });
  assert.equal(r.erros.length, 0, JSON.stringify(r.erros));
  const e = porChave(`aprovou:orc:${ID(1)}`);
  assert.ok(e, 'convite criado');
  assert.equal(e.tipo, 'aprovou'); assert.equal(e.orcamento_id, ID(1)); assert.match(e.corpo, /Cliente/); assert.match(e.corpo, /Gol/);
  assert.ok(Date.parse(e.expira_em) > Date.now() + 4 * 86400000);
  await D.gerarTudo({ so: 'aprovou' });
  assert.equal(envios().length, 1);
});

test('aprovou: não convida se já marcou horário depois, se tem ordem no Pátio, se aprovou há pouco, se a régua está desligada', async () => {
  limpar(); config({ horas_aprovou: 4 });
  tabelas.orc_orcamentos = [orc(1), orc(2), orc(3, { decidido_em: horasAtras(1) }), orc(4, { agendamento_id: ID(900) }), orc(5)];
  tabelas.agendamentos = [{ id: ID(901), cliente_id: ID(101), telefone: tel(1), status: 'aguardando', created_at: horasAtras(2), data: D.somarDias(H, 2) }];
  tabelas.patio_os = [{ id: ID(902), cliente_id: ID(102), telefone: tel(2), orcamento_id: ID(2), created_at: horasAtras(1), etapa: 'recebido' }];
  await D.gerarTudo({ so: 'aprovou' });
  assert.deepEqual(envios().map((e) => e.chave_unica), [`aprovou:orc:${ID(5)}`]);
  limpar(); config({ ativo_aprovou: false }); tabelas.orc_orcamentos = [orc(1)];
  await D.gerarTudo();   // modo real: régua desligada não gera
  assert.equal(envios().filter((e) => e.tipo === 'aprovou').length, 0);
  const prev = await D.gerarTudo({ simular: true, so: 'aprovou' });
  assert.equal(prev.previa.length, 1, 'na prévia roda mesmo desligada');
});

test('aprovou: PARAR e celular que não é celular não recebem (pulado, com o motivo)', async () => {
  limpar(); config();
  tabelas.orc_orcamentos = [orc(1), orc(2, { cliente_telefone: '1232211234' })];
  tabelas.clientes = [{ id: ID(101), nome: 'Cliente 1', telefone: tel(1), telefone_e164: tel(1), aceita_mensagens: false }];
  await D.gerarTudo({ so: 'aprovou' });
  const a = porChave(`aprovou:orc:${ID(1)}`), b = porChave(`aprovou:orc:${ID(2)}`);
  assert.equal(a.status, 'pulado'); assert.match(a.motivo_pulado, /não receber/);
  assert.equal(b.status, 'pulado'); assert.match(b.motivo_pulado, /fixo/);
});

test('faltou: duas horas depois do horário perdido convida a remarcar; quem remarcou ou veio não recebe', async () => {
  limpar(); config({ horas_faltou: 2 });
  const hora = (h) => `${String(h).padStart(2, '0')}:00:00`;
  const passou = Math.max(0, new Date().getHours() - 5);
  const ag = (n, extra = {}) => ({ id: ID(800 + n), cliente_id: ID(100 + n), cliente_nome: `Cliente ${n}`, telefone: tel(n), servico: 'Revisão', veiculo: 'Gol', placa: 'ABC1D23', data: D.somarDias(H, -1), hora: hora(9), status: 'nao_veio', created_at: horasAtras(60), ...extra });
  tabelas.agendamentos = [ag(1), ag(2), ag(3, { status: 'concluido' }), ag(4, { data: H, hora: hora(23) }), ag(5, { data: D.somarDias(H, -9) })];
  tabelas.agendamentos.push({ id: ID(850), cliente_id: ID(102), telefone: tel(2), status: 'aguardando', data: D.somarDias(H, 3), hora: hora(10), created_at: horasAtras(1) });   // o 2 já remarcou
  const r = await D.gerarTudo({ so: 'faltou' });
  assert.equal(r.erros.length, 0, JSON.stringify(r.erros));
  assert.deepEqual(envios().map((e) => e.chave_unica), [`faltou:${ID(801)}`]);
  assert.equal(envios()[0].tipo, 'faltou'); assert.equal(envios()[0].agendamento_id, ID(801)); assert.match(envios()[0].corpo, /Revisão/);
  void passou;
});

test('vencendo: orçamento que vence amanhã ganha aviso com o link e a data; decidido, vencido ou longe não; não repete o "parado" de hoje', async () => {
  limpar(); config({ dias_vencendo: 1 });
  tabelas.orc_orcamentos = [
    orc(1, { status: 'enviado', decidido_em: null, validade: D.somarDias(H, 1) }),
    orc(2, { status: 'enviado', decidido_em: null, validade: D.somarDias(H, 6) }),
    orc(3, { status: 'aprovado', validade: D.somarDias(H, 1) }),
    orc(4, { status: 'enviado', decidido_em: null, validade: D.somarDias(H, -1) }),
    orc(5, { status: 'enviado', decidido_em: null, validade: D.somarDias(H, 1) }),
    orc(6, { status: 'enviado', decidido_em: null, validade: D.somarDias(H, 1), token_publico: null }),
  ];
  tabelas.posvenda_envios = [{ id: ID(990), chave_unica: `orcamento:orc:${ID(5)}`, status: 'enviado', enviado_em: horasAtras(2), telefone: tel(5), tipo: 'orcamento', corpo: 'x' }];
  const r = await D.gerarTudo({ so: 'vencendo' });
  const novos = envios().filter((e) => e.chave_unica?.startsWith('orcamento:vencendo:'));
  assert.deepEqual(novos.map((e) => e.orcamento_id), [ID(1)]);
  const dia = D.somarDias(H, 1);
  assert.match(novos[0].corpo, new RegExp(`${dia.slice(8, 10)}/${dia.slice(5, 7)}`));
  assert.match(novos[0].corpo, /indycar-orcador\.netlify\.app\/#\/o\/tok0001/);
  assert.equal(novos[0].tipo, 'orcamento');
  assert.ok(r.pulados === 1 || r.porRegua.vencendo.pulados === 1, 'o sem link aparece como pulado na prévia/relatório');
});

test('carro pronto esperando: só depois do aviso de pronto ter saído, 24 h depois, com o link de acompanhar', async () => {
  limpar(); config({ horas_pronto_lembrete: 24 });
  const os = (n, extra = {}) => ({ id: ID(600 + n), numero: n, etapa: 'pronto', etapa_em: horasAtras(30), cliente_id: ID(100 + n), agendamento_id: null, lead_id: null, cliente_nome: `Cliente ${n}`, telefone: tel(n), veiculo: 'Gol', placa: 'ABC1D23', servico: 'Freios', entregue_em: null, token_publico: `a1b2c3d4e5f60718${String(n).padStart(4, '0')}`, created_at: horasAtras(50), ...extra });
  tabelas.patio_os = [os(1), os(2), os(3, { etapa_em: horasAtras(5) }), os(4, { etapa: 'entregue' })];
  tabelas.posvenda_envios = [
    { id: ID(991), os_id: ID(601), tipo: 'patio_pronto', status: 'enviado', chave_unica: `patio_pronto:${ID(601)}`, telefone: tel(1), corpo: 'x' },
    { id: ID(992), os_id: ID(602), tipo: 'patio_pronto', status: 'pendente', chave_unica: `patio_pronto:${ID(602)}`, telefone: tel(2), corpo: 'x' },
    { id: ID(993), os_id: ID(603), tipo: 'patio_pronto', status: 'enviado', chave_unica: `patio_pronto:${ID(603)}`, telefone: tel(3), corpo: 'x' },
  ];
  tabelas.patio_config = [{ id: true, avisar_pronto: true, link_base: 'https://indycar-patio.netlify.app' }];
  const r = await D.gerarTudo({ so: 'pronto_lembrete' });
  assert.equal(r.erros.length, 0, JSON.stringify(r.erros));
  const e = porChave(`patio_pronto_lembrete:${ID(601)}`);
  assert.ok(e); assert.equal(e.tipo, 'patio_pronto'); assert.equal(e.os_id, ID(601));
  assert.match(e.corpo, /indycar-patio\.netlify\.app\/acompanhar\/\?t=a1b2c3d4e5f607180001/);
  assert.equal(envios().filter((x) => x.chave_unica?.startsWith('patio_pronto_lembrete:')).length, 1);
  // Pátio com "avisar pronto" desligado: nada
  limpar(); config(); tabelas.patio_os = [os(1)]; tabelas.patio_config = [{ id: true, avisar_pronto: false }];
  tabelas.posvenda_envios = [{ id: ID(991), os_id: ID(601), tipo: 'patio_pronto', status: 'enviado', chave_unica: `patio_pronto:${ID(601)}`, telefone: tel(1), corpo: 'x' }];
  await D.gerarTudo({ so: 'pronto_lembrete' });
  assert.equal(envios().length, 1);
});

test('configuração: as réguas novas, os limites e o rodapé são lidos e gravados com validação', async () => {
  limpar(); tabelas.posvenda_config = [{ id: true }];
  const c0 = await D.obterConfig();
  assert.equal(c0.ativo_aprovou, false); assert.equal(c0.horas_aprovou, 4); assert.equal(c0.max_campanhas_30d, 3); assert.equal(c0.marketing_fim, 18);
  assert.equal(c0.rodape_parar, true); assert.equal(c0.validar_celular, true); assert.equal(c0.retomada_max_30min, 8); assert.equal(c0.retomada_so_essencial, true);
  const c1 = await D.salvarConfig({ ativo_aprovou: true, horas_aprovou: 6, max_campanhas_30d: 0, marketing_fim: 17, retomada_max_30min: 5, rodape_parar: false, msg_aprovou: 'Oi {primeiro_nome}, falta marcar o horário do {carro}!' });
  assert.equal(c1.ativo_aprovou, true); assert.equal(c1.horas_aprovou, 6); assert.equal(c1.max_campanhas_30d, 0); assert.equal(c1.marketing_fim, 17);
  assert.equal(c1.retomada_max_30min, 5); assert.equal(c1.rodape_parar, false); assert.match(c1.msg_aprovou, /falta marcar/);
  const c2 = await D.salvarConfig({ horas_aprovou: 200, marketing_fim: 3, retomada_max_2h: 0, freio_optout_pct: 99, msg_vencendo: 'sem link nenhum aqui', texto_rodape_parar: 'sem a palavra certa' });
  assert.equal(c2.horas_aprovou, 6, 'fora da faixa é ignorado'); assert.equal(c2.marketing_fim, 17); assert.equal(c2.retomada_max_2h, 25); assert.equal(c2.freio_optout_pct, 5);
  assert.notEqual(c2.msg_vencendo, 'sem link nenhum aqui');
  assert.notEqual(c2.texto_rodape_parar, 'sem a palavra certa');
  const c3 = await D.salvarConfig({ texto_rodape_parar: 'Se não quiser mais, responda PARAR.' });
  assert.equal(c3.texto_rodape_parar, 'Se não quiser mais, responda PARAR.');
});
