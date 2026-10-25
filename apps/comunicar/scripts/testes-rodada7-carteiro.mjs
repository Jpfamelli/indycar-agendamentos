// Rodada 7 · parte 3 — o carteiro com o anti-spam novo (rodapé PARAR, celular, horário de marketing, teto de campanhas,
// retomada configurável, conferências dos eventos reais, freio automático), com banco e WhatsApp de mentira.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instalarBancoFalso } from './banco-falso.mjs';

const tabelas = {};
const notificacoes = [];
const rpcs = { comunicar_gestores: () => [ID(7), ID(8)], notificar: (a) => { notificacoes.push(a); return ID(500 + notificacoes.length); }, registrar_auditoria: () => null };
const banco = instalarBancoFalso(tabelas, { rpcs });
const real = await import('../dados.js');
const carteiro = await import('../carteiro.js');
const patio = await import('../patio.js');
const { enviarFila, simularRodada } = await import('../rodada.js');

function ID(n) { return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`; }
const AGORA = new Date();
const H = real.hoje();
const horas = (n) => new Date(AGORA.getTime() + n * 3600000).toISOString();
const dadosEm = (hora = 11) => ({ ...real, agoraSP: () => ({ data: H, hora, minuto: 0, diaSemana: 2 }), feriado: () => null });
const CFG = { janela_inicio: 8, janela_fim: 20, pausa_geral: false, envia_domingo: true, so_horario_comercial: false, limite_por_hora: 60, limite_por_minuto: 10, limite_por_dia: 300,
  intervalo_mesmo_cliente_min: 60, hora_envio: '09:30', horas_lembrete: 20, bloquear_com_carro_na_oficina: true, bloquear_com_reclamacao: true, dias_reclamacao_aberta: 14, evitar_texto_repetido_h: 48, retomada_gradual: true,
  rodape_parar: true, texto_rodape_parar: 'Para não receber mais, responda PARAR.', max_campanhas_30d: 3, marketing_fim: 18, validar_celular: true };
const tel = (n) => `1299888${String(n).padStart(4, '0')}`;
const limpar = () => { notificacoes.length = 0; for (const k of Object.keys(tabelas)) tabelas[k] = []; };
let n = 0;
function envio(e) {
  const x = { id: ID(1000 + ++n), status: 'pendente', enviando_em: null, tentativas: 0, enviar_em: horas(-1), created_at: horas(-1), expira_em: horas(30), chave_unica: `k${n}`, cliente_id: null, agendamento_id: null, telefone: tel(n), nome: `N${n}`, corpo: `texto numero ${n} da oficina`, ...e };
  x.telefone_e164 = real.telefoneNacional(x.telefone);   // no banco de verdade é uma coluna gerada
  (tabelas.posvenda_envios ||= []).push(x); return x;
}
const wa = () => { const saiu = []; return { saiu, enviar: async (t, c) => { saiu.push({ t, c }); return { ok: true }; } }; };
const rodar = async (extra = {}, hora = 11) => { const w = wa(); const r = await enviarFila({ cfg: { ...CFG, ...extra }, dados: dadosEm(hora), wa: w, patio, carteiro, dormir: async () => {}, agora: AGORA, log: { error() {} } }); return { r, w }; };
const status = (e) => tabelas.posvenda_envios.find((x) => x.id === e.id);

test.after(() => banco.restaurar());

test('rodapé PARAR: a campanha sai com o rodapé, o lembrete não, e o texto guardado na fila continua o original', async () => {
  limpar();
  const c = envio({ tipo: 'campanha', corpo: 'Oi, temos novidade na oficina!' });
  const l = envio({ tipo: 'lembrete', corpo: 'Seu horário é amanhã às 9h.' });
  const { w } = await rodar();
  const enviada = w.saiu.find((x) => x.c.startsWith('Oi, temos'));
  assert.ok(enviada.c.endsWith('Para não receber mais, responda PARAR.'));
  assert.equal(w.saiu.find((x) => x.c.startsWith('Seu horário')).c, 'Seu horário é amanhã às 9h.');
  assert.equal(status(c).corpo, 'Oi, temos novidade na oficina!');
  void l;
});

test('rodapé desligado ou texto que já tem PARAR: nada é acrescentado', async () => {
  limpar();
  envio({ tipo: 'campanha', corpo: 'Promoção! Responda PARAR para sair.' });
  envio({ tipo: 'reativacao', corpo: 'Sumiu! Venha ver o carro.' });
  const { w } = await rodar({ rodape_parar: false });
  assert.deepEqual(w.saiu.map((x) => x.c).sort(), ['Promoção! Responda PARAR para sair.', 'Sumiu! Venha ver o carro.']);
  limpar(); envio({ tipo: 'campanha', corpo: 'Promoção! Responda PARAR para sair.' });
  const dois = await rodar();
  assert.equal(dois.w.saiu[0].c, 'Promoção! Responda PARAR para sair.');
});

test('celular ruim: fixo, DDD que não existe e número que já falhou como inexistente são pulados com o motivo, antes de gastar cadência', async () => {
  limpar();
  const fixo = envio({ tipo: 'posvenda', telefone: '1232211234' });
  const ddd = envio({ tipo: 'posvenda', telefone: '20991234567' });
  const ruim = envio({ tipo: 'posvenda', telefone: '12991234111' });
  const bom = envio({ tipo: 'posvenda', telefone: '12991234222' });
  tabelas.posvenda_envios.push({ id: ID(2000), status: 'falhou', erro_classe: 'numero_invalido', telefone: '12991234111', telefone_e164: '12991234111', tipo: 'campanha', created_at: horas(-100), corpo: 'x' });
  const { r, w } = await rodar();
  assert.match(status(fixo).motivo_pulado, /fixo/); assert.equal(status(fixo).status, 'pulado');
  assert.match(status(ddd).motivo_pulado, /DDD 20/);
  assert.match(status(ruim).motivo_pulado, /já falhou antes/);
  assert.equal(status(bom).status, 'enviado');
  assert.equal(w.saiu.length, 1); assert.equal(r.pulados, 3);
  // desligado: a validação não age
  limpar(); const f2 = envio({ tipo: 'posvenda', telefone: '1232211234' });
  await rodar({ validar_celular: false });
  assert.equal(status(f2).status, 'enviado');
});

test('horário de marketing: às 19h a campanha espera o dia seguinte; o pós-venda sai', async () => {
  limpar();
  const camp = envio({ tipo: 'campanha' }), pos = envio({ tipo: 'posvenda' }), niver = envio({ tipo: 'aniversario' });
  const { r, w } = await rodar({}, 19);
  assert.equal(w.saiu.length, 1);
  assert.equal(status(pos).status, 'enviado');
  assert.equal(status(camp).status, 'pendente'); assert.ok(Date.parse(status(camp).enviar_em) > AGORA.getTime()); assert.match(status(camp).motivo_pulado, /depois das 18h/);
  assert.match(status(niver).motivo_pulado, /depois das 18h/);
  assert.equal(r.adiados, 2);
  // às 17h tudo sai; com marketing_fim 20 às 19h também
  limpar(); envio({ tipo: 'campanha' });
  assert.equal((await rodar({}, 17)).w.saiu.length, 1);
  limpar(); envio({ tipo: 'campanha' });
  assert.equal((await rodar({ marketing_fim: 20 }, 19)).w.saiu.length, 1);
});

test('teto de campanhas por cliente em 30 dias: a 4ª é pulada com o motivo; 0 desliga o teto', async () => {
  limpar();
  const t = '12991234567';
  for (let i = 0; i < 3; i++) tabelas.posvenda_envios.push({ id: ID(3000 + i), status: 'enviado', tipo: 'campanha', telefone: t, telefone_e164: t, created_at: horas(-24 * (i + 2)), enviado_em: horas(-24 * (i + 2)), corpo: `c${i}` });
  const nova = envio({ tipo: 'campanha', telefone: t });
  const outro = envio({ tipo: 'campanha', telefone: '12991230000' });
  const { w } = await rodar();
  assert.equal(status(nova).status, 'pulado'); assert.match(status(nova).motivo_pulado, /3 campanhas nos últimos 30 dias/);
  assert.equal(status(outro).status, 'enviado'); assert.equal(w.saiu.length, 1);
  tabelas.posvenda_envios = tabelas.posvenda_envios.filter((x) => x.id !== outro.id);
  const sem = envio({ tipo: 'campanha', telefone: t, corpo: 'outra campanha bem diferente' });
  await rodar({ max_campanhas_30d: 0 });
  assert.equal(status(sem).status, 'enviado');
  void nova;
});

test('retomada do WhatsApp: o dia a dia sai, campanha espera 2 h, e os limites são os do gestor', async () => {
  limpar();
  for (let i = 0; i < 10; i++) envio({ tipo: 'posvenda' });
  const camp = envio({ tipo: 'campanha' });
  const volta = { estado: 'ok', em: new Date(AGORA.getTime() - 60000).toISOString(), anterior: 'chave_recusada' };
  const { r, w } = await rodar({ whatsapp: volta, retomada_max_30min: 3 });
  assert.equal(w.saiu.length, 3, 'só 3 na primeira meia hora (limite do gestor)');
  assert.equal(r.retomada.maximo, 3);
  assert.equal(status(camp).status, 'pendente');
  // com vaga sobrando, a campanha continua esperando (só o essencial)
  limpar(); const c2 = envio({ tipo: 'campanha' }), p2 = envio({ tipo: 'avaliacao' });
  const r2 = await rodar({ whatsapp: volta });
  assert.equal(r2.w.saiu.length, 1); assert.equal(status(p2).status, 'enviado');
  assert.match(status(c2).motivo_pulado, /retomada do WhatsApp/);
  assert.ok(Date.parse(status(c2).enviar_em) > Date.parse(volta.em) + 120 * 60000);
  // gestor liberou a campanha na retomada
  limpar(); const c3 = envio({ tipo: 'campanha' });
  await rodar({ whatsapp: volta, retomada_so_essencial: false });
  assert.equal(status(c3).status, 'enviado');
});

test('aprovou: o convite não sai se o cliente já marcou horário enquanto esperava; sai se não marcou', async () => {
  limpar();
  tabelas.orc_orcamentos = [{ id: ID(51), status: 'aprovado', numero: 5, agendamento_id: null }, { id: ID(52), status: 'aprovado', numero: 6, agendamento_id: null }, { id: ID(53), status: 'recusado', numero: 7 }];
  const marcou = envio({ tipo: 'aprovou', orcamento_id: ID(51), telefone: '12991234111', cliente_id: ID(901), created_at: horas(-3) });
  const livre = envio({ tipo: 'aprovou', orcamento_id: ID(52), telefone: '12991234222', cliente_id: ID(902), created_at: horas(-3) });
  const mudou = envio({ tipo: 'aprovou', orcamento_id: ID(53), telefone: '12991234333' });
  tabelas.agendamentos = [{ id: ID(60), cliente_id: ID(901), telefone: '12991234111', telefone_e164: '12991234111', status: 'aguardando', created_at: horas(-1) }];
  const { w } = await rodar();
  assert.equal(status(marcou).status, 'pulado'); assert.match(status(marcou).motivo_pulado, /marcou o horário/);
  assert.equal(status(livre).status, 'enviado');
  assert.equal(status(mudou).status, 'pulado'); assert.match(status(mudou).motivo_pulado, /nº 7 não está mais aprovado/);
  assert.equal(w.saiu.length, 1);
});

test('faltou: não sai se o cliente remarcou ou apareceu; sai se continua faltoso', async () => {
  limpar();
  tabelas.agendamentos = [
    { id: ID(71), status: 'nao_veio', data: H, hora: '08:00:00' }, { id: ID(72), status: 'nao_veio', data: H, hora: '08:00:00' }, { id: ID(73), status: 'concluido', data: H, hora: '08:00:00' },
    { id: ID(74), cliente_id: ID(912), telefone: '12991234222', telefone_e164: '12991234222', status: 'aguardando', created_at: horas(-1), data: H, hora: '15:00:00' },
  ];
  const livre = envio({ tipo: 'faltou', agendamento_id: ID(71), telefone: '12991234111', cliente_id: ID(911), created_at: horas(-3) });
  const remarcou = envio({ tipo: 'faltou', agendamento_id: ID(72), telefone: '12991234222', cliente_id: ID(912), created_at: horas(-3) });
  const veio = envio({ tipo: 'faltou', agendamento_id: ID(73), telefone: '12991234333' });
  await rodar();
  assert.equal(status(livre).status, 'enviado');
  assert.match(status(remarcou).motivo_pulado, /outro horário/);
  assert.match(status(veio).motivo_pulado, /apareceu/);
});

test('reabordar recusados: não sai se o cliente já recebeu um orçamento novo depois; sem isso sai', async () => {
  limpar();
  tabelas.orc_orcamentos = [{ id: ID(81), status: 'enviado', numero: 90, cliente_telefone: '(12) 99123-4111', created_at: horas(-1) }];
  const sobra = envio({ tipo: 'campanha', telefone: '12991234111', chave_unica: `reabordar:orc:${ID(80)}`, created_at: horas(-5) });
  const vai = envio({ tipo: 'campanha', telefone: '12991234222', chave_unica: `reabordar:orc:${ID(82)}`, created_at: horas(-5) });
  await rodar();
  assert.equal(status(sobra).status, 'pulado'); assert.match(status(sobra).motivo_pulado, /orçamento novo \(nº 90\)/);
  assert.equal(status(vai).status, 'enviado');
});

test('simular a rodada mostra o rodapé e não grava nada', async () => {
  limpar();
  envio({ tipo: 'campanha', corpo: 'Oi, novidade!' });
  const antes = JSON.stringify(tabelas.posvenda_envios);
  const s = await simularRodada({ cfg: CFG, dados: dadosEm(), patio, carteiro, agora: AGORA });
  assert.match(s.enviaria[0].corpo, /responda PARAR\.$/);
  assert.equal(JSON.stringify(tabelas.posvenda_envios), antes);
});

test('freio automático: campanha em que muita gente pediu PARAR é cancelada no meio, marca o lote e chama os gestores (uma vez)', async () => {
  limpar();
  const lote = ID(700);
  tabelas.comunicar_lotes = [{ lote, modelo: 'Oi {primeiro_nome}, promoção!', criado_por_id: ID(8), criado_por_nome: 'Leo', created_at: horas(-2), freado_em: null }];
  for (let i = 0; i < 40; i++) tabelas.posvenda_envios.push({ id: ID(4000 + i), lote, status: 'enviado', tipo: 'campanha', telefone: tel(i), resposta_tipo: i < 4 ? 'parar' : null, enviado_em: horas(-1), corpo: 'x' });
  for (let i = 0; i < 25; i++) tabelas.posvenda_envios.push({ id: ID(4100 + i), lote, status: 'pendente', tipo: 'campanha', telefone: tel(100 + i), enviando_em: null, enviar_em: horas(5), corpo: 'x' });
  const f = await real.avaliarFreios({ ...CFG, freio_optout_pct: 5, freio_min_envios: 20 });
  assert.equal(f.length, 1); assert.equal(f[0].cancelados, 25); assert.equal(f[0].enviadas, 40); assert.equal(f[0].pararam, 4);
  assert.equal(tabelas.posvenda_envios.filter((e) => e.status === 'cancelado').length, 25);
  assert.ok(tabelas.comunicar_lotes[0].freado_em); assert.match(tabelas.comunicar_lotes[0].freio_motivo, /4 de 40/);
  assert.ok(notificacoes.length >= 2); assert.equal(notificacoes[0].p_tipo, 'campanha_freada');
  assert.deepEqual(await real.avaliarFreios({ ...CFG, freio_optout_pct: 5, freio_min_envios: 20 }), [], 'lote freado não é freado de novo');
  // abaixo do limite: nada
  limpar(); tabelas.comunicar_lotes = [{ lote, modelo: 'x', created_at: horas(-2), freado_em: null }];
  for (let i = 0; i < 40; i++) tabelas.posvenda_envios.push({ id: ID(4000 + i), lote, status: 'enviado', tipo: 'campanha', telefone: tel(i), resposta_tipo: i < 1 ? 'parar' : null, corpo: 'x' });
  assert.deepEqual(await real.avaliarFreios({ ...CFG, freio_optout_pct: 5, freio_min_envios: 20 }), []);
  assert.deepEqual(await real.avaliarFreios({ ...CFG, freio_optout_pct: 0 }), [], 'freio desligado');
});

test('aviso do WhatsApp: queda com fila avisa os gestores; volta de queda avisa o plano; WhatsApp normal não avisa; a chave evita repetir', async () => {
  limpar();
  const em = horas(-1);
  assert.equal(await real.avisarWhatsapp({ ...CFG, whatsapp: { estado: 'desconectado', em, motivo: 'aparelho offline' } }), null, 'sem nada na fila não incomoda');
  tabelas.posvenda_envios.push({ id: ID(6000), status: 'pendente', tipo: 'lembrete', telefone: tel(1), enviar_em: horas(1), corpo: 'x' });
  let r = await real.avisarWhatsapp({ ...CFG, whatsapp: { estado: 'desconectado', em, motivo: 'aparelho offline' } });
  assert.equal(r.tipo, 'whatsapp_caiu'); assert.equal(r.avisados, 2);
  assert.equal(notificacoes.at(-1).p_chave, `whatsapp_caiu:${em}`, 'a mesma queda tem a mesma chave: o sino não repete');
  r = await real.avisarWhatsapp({ ...CFG, retomada_max_30min: 8, retomada_max_2h: 25, retomada_so_essencial: true, whatsapp: { estado: 'ok', anterior: 'desconectado', em } });
  assert.equal(r.tipo, 'whatsapp_voltou'); assert.match(notificacoes.at(-1).p_corpo, /8/);
  assert.equal(await real.avisarWhatsapp({ ...CFG, whatsapp: { estado: 'ok', anterior: 'ok', em } }), null);
});

test('reabordar: a lista do Orçador é peneirada (PARAR e celular ruim) e o que já foi enfileirado não repete', async () => {
  limpar();
  const t = (n) => `1299777${String(n).padStart(4, '0')}`;
  const base = (id, n, extra = {}) => ({ id, numero: id, cliente_id: ID(9000 + id), nome: `Cliente ${id}`, telefone_55: `55${t(n)}`, motivo: 'preco', valor: 1000, decidido_em: horas(-24 * 5), dias_desde: 5, carro: 'Gol', placa: 'AAA1A11', link: null, ...extra });
  const lista = [base(1, 1), base(2, 2), base(3, 3), base(4, 4), { ...base(5, 5), telefone_55: '551236211234' }];
  banco.restaurar();
  const b2 = instalarBancoFalso(tabelas, { rpcs: { ...rpcs, orc_recusados_recuperaveis: () => lista } });
  tabelas.posvenda_config = [{ id: true }];
  tabelas.clientes = [{ id: ID(9002), telefone_e164: t(2), aceita_mensagens: false }];
  tabelas.patio_os = [];
  const r = await real.reabordarRecusados({ dias: 30, limite: 100 });
  assert.equal(r.fora.nao_quer, 1, 'cliente 2 pediu para não receber');
  assert.equal(r.fora.celular_ruim, 1, 'o fixo fica de fora');
  assert.deepEqual(r.candidatos.map((c) => c.nome).sort(), ['Cliente 1', 'Cliente 3', 'Cliente 4']);
  const cand = r.candidatos.slice(0, 1);
  const textos = { preco: 'Oi, {primeiro_nome}! O orçamento do {carro} ainda está com a gente.' };
  const a = await real.enfileirarReabordagem({ candidatos: cand, textos, enviarEm: horas(1), criador: { id: ID(2), nome: 'Gi' }, lote: ID(777), cfg: CFG });
  const b = await real.enfileirarReabordagem({ candidatos: cand, textos, enviarEm: horas(1), criador: { id: ID(2), nome: 'Gi' }, lote: ID(778), cfg: CFG });
  assert.equal(a.enfileirados, 1); assert.equal(b.enfileirados, 0); assert.equal(b.repetidos, 1);
  assert.match(tabelas.posvenda_envios[0].corpo, /Oi, Cliente! O orçamento do Gol|Oi, Cliente/);
  const r2 = await real.reabordarRecusados({ dias: 30, limite: 100 });
  assert.equal(r2.fora.ja_reabordado, 1);
  b2.restaurar();
});
