// Rodada 7 · parte 1 — as regras puras (r7.js): celular, rodapé PARAR, teto, freio, reabordar, réguas de eventos, quando sai, retomada, A/B.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R7 from '../r7.js';

const H = '2026-10-26';   // segunda-feira
const em = (dia, hm) => new Date(`${dia}T${hm}:00-03:00`).getTime();

test('validarCelular: aceita celular, recusa fixo, DDD que não existe, número curto e de mentira', () => {
  assert.equal(R7.validarCelular('(12) 99123-4567').ok, true);
  assert.equal(R7.validarCelular('5512991234567').ok, true);
  assert.equal(R7.validarCelular('+55 12 99123-4567').tipo, 'celular');
  assert.equal(R7.validarCelular('1291234567').tipo, 'celular_sem_9');          // 10 dígitos, começa com 9: celular antigo
  assert.equal(R7.validarCelular('1232211234').tipo, 'fixo');
  assert.match(R7.validarCelular('1232211234').motivo, /fixo/);
  assert.match(R7.validarCelular('(20) 99123-4567').motivo, /DDD 20 não existe/);
  assert.match(R7.validarCelular('99123456').motivo, /curto/);
  assert.match(R7.validarCelular('551299123456789').motivo, /longo/);
  assert.match(R7.validarCelular('12999999999').motivo, /todos iguais/);
  assert.match(R7.validarCelular('12912345678').motivo, /sequência/);
  assert.match(R7.validarCelular('12987654321').motivo, /sequência/);
  assert.match(R7.validarCelular('12811112222').motivo, /11 dígitos precisa começar com 9/);
  assert.equal(R7.validarCelular('').ok, false);
  assert.equal(R7.validarCelular(null).ok, false);
});

test('aplicarRodape: só marketing, uma vez, sem duplicar e sem estourar 2.000 letras', () => {
  const cfg = { rodape_parar: true, texto_rodape_parar: 'Para sair, responda PARAR.' };
  assert.equal(R7.aplicarRodape('Oi!', 'campanha', cfg).corpo, 'Oi!\n\nPara sair, responda PARAR.');
  assert.equal(R7.aplicarRodape('Oi!', 'lembrete', cfg).aplicou, false);                 // operacional não leva
  assert.equal(R7.aplicarRodape('Oi!', 'patio_pronto', cfg).aplicou, false);
  assert.equal(R7.aplicarRodape('Oi! Responda PARAR para sair', 'campanha', cfg).aplicou, false);   // já tem
  assert.equal(R7.aplicarRodape('Oi!', 'campanha', { rodape_parar: false }).aplicou, false);
  const grande = R7.aplicarRodape('x'.repeat(2000), 'reativacao', cfg).corpo;
  assert.ok(grande.length <= 2000); assert.ok(grande.endsWith('responda PARAR.'));
  assert.ok(R7.aplicarRodape('Oi', 'aniversario', {}).corpo.endsWith(R7.RODAPE_PADRAO));   // sem texto próprio usa o padrão
  assert.equal(R7.aplicarRodape('Oi', 'nao_fechou', { texto_rodape_parar: '   ' }).corpo.endsWith(R7.RODAPE_PADRAO), true);
});

test('horário de marketing, teto de campanhas e freio automático', () => {
  assert.equal(R7.decidirHorarioMarketing({ tipo: 'campanha', hora: 18, fim: 18 }).segura, true);
  assert.equal(R7.decidirHorarioMarketing({ tipo: 'campanha', hora: 17, fim: 18 }).segura, false);
  assert.equal(R7.decidirHorarioMarketing({ tipo: 'lembrete', hora: 19, fim: 18 }).segura, false);   // operacional sai até 20h
  assert.equal(R7.decidirTetoCampanhas({ tipo: 'campanha', recebidas: 3, max: 3 }).segura, true);
  assert.match(R7.decidirTetoCampanhas({ tipo: 'campanha', recebidas: 1, max: 1 }).motivo, /1 campanha nos/);
  assert.equal(R7.decidirTetoCampanhas({ tipo: 'campanha', recebidas: 2, max: 3 }).segura, false);
  assert.equal(R7.decidirTetoCampanhas({ tipo: 'campanha', recebidas: 99, max: 0 }).segura, false);   // 0 = sem teto
  assert.equal(R7.decidirTetoCampanhas({ tipo: 'posvenda', recebidas: 99, max: 1 }).segura, false);
  assert.equal(R7.freioDaCampanha({ enviadas: 100, pararam: 5, minEnvios: 20, pct: 5 }).freiar, true);
  assert.equal(R7.freioDaCampanha({ enviadas: 100, pararam: 4, minEnvios: 20, pct: 5 }).freiar, false);
  assert.equal(R7.freioDaCampanha({ enviadas: 10, pararam: 5, minEnvios: 20, pct: 5 }).freiar, false);   // amostra pequena
  assert.equal(R7.freioDaCampanha({ enviadas: 100, pararam: 50, pct: 0 }).freiar, false);                  // freio desligado
  assert.match(R7.freioDaCampanha({ enviadas: 40, pararam: 4, minEnvios: 20, pct: 5 }).motivo, /4 de 40 \(10%\)/);
});

test('mensagem duplicada (duplo clique) e pedido de VOLTAR', () => {
  const agora = Date.now();
  const rec = [{ telefone: '5512991234567', corpo: 'Oi, tudo bem?', quando: agora - 3 * 60000 }];
  assert.ok(R7.ehMensagemDuplicada({ telefone: '12991234567', corpo: ' oi,  tudo bem? ', recentes: rec, agora }));
  assert.equal(R7.ehMensagemDuplicada({ telefone: '12991234567', corpo: 'outra coisa', recentes: rec, agora }), null);
  assert.equal(R7.ehMensagemDuplicada({ telefone: '12991234999', corpo: 'Oi, tudo bem?', recentes: rec, agora }), null);
  assert.equal(R7.ehMensagemDuplicada({ telefone: '12991234567', corpo: 'Oi, tudo bem?', recentes: [{ ...rec[0], quando: agora - 20 * 60000 }], agora }), null);
  assert.equal(R7.ehMensagemDuplicada({ telefone: '12991234567', corpo: 'Oi, tudo bem?', recentes: rec, minutos: 0, agora }), null);
  for (const t of ['VOLTAR', 'voltar!', ' Quero receber ', 'pode mandar 👍', 'reativar']) assert.equal(R7.ehPedidoDeVoltar(t), true, t);
  for (const t of ['voltar amanhã com o carro', 'quero receber o orçamento por aqui', 'não pode mandar', '', 'ok']) assert.equal(R7.ehPedidoDeVoltar(t), false, t);
});

test('reabordar recusados: motivo, já reabordado, sem telefone, repetido, valor em jogo', () => {
  const lista = [
    { id: 'o1', numero: 10, nome: 'Ana Souza', telefone_55: '5512991234567', motivo: 'preco', valor: 1200.5, dias_desde: 5, carro: 'HB20', placa: 'ABC1D23', link: 'x' },
    { id: 'o2', numero: 11, nome: 'Bruno', telefone_55: '5512991230000', motivo: 'prazo', valor: 800, dias_desde: 9 },
    { id: 'o3', numero: 12, nome: 'Carla', telefone_55: '5512991230001', motivo: 'sem_urgencia', valor: 300 },
    { id: 'o4', numero: 13, nome: 'Duda', telefone_55: '', motivo: 'preco', valor: 50 },
    { id: 'o5', numero: 14, nome: 'Ana de novo', telefone_55: '5512991234567', motivo: 'preco', valor: 70 },
    { id: 'o6', numero: 15, nome: 'Eva', telefone_55: '5512991230006', motivo: 'inventado', valor: 90 },
    { id: 'o7', numero: 16, nome: 'Fred', telefone_55: '5512991230007', motivo: 'preco', valor: 10 },
    null, 'lixo',
  ];
  const r = R7.prepararRecusados(lista, { jaReabordados: new Set(['o7']) });
  assert.equal(r.candidatos.length, 4);
  assert.deepEqual(r.fora, { sem_telefone: 1, ja_reabordado: 1, repetido: 1 });
  assert.equal(r.porMotivo.preco.n, 1);
  assert.equal(r.porMotivo.preco.valor, 1200.5);
  assert.equal(r.porMotivo.sem_motivo.n, 1);              // motivo desconhecido vira "sem motivo informado"
  assert.equal(r.valorTotal, 1200.5 + 800 + 300 + 90);
  assert.equal(r.candidatos[0].chave_unica, 'reabordar:orc:o1');
  assert.equal(r.candidatos[0].telefone, '12991234567');
  assert.deepEqual(R7.prepararRecusados(null).candidatos, []);
});

test('textos de reabordagem: os 4 modelos passam; preço, desconto e variável inventada não', () => {
  for (const [m, t] of Object.entries(R7.MODELOS_REABORDAR)) assert.equal(R7.validarTextoReabordar(t), null, m);
  assert.match(R7.validarTextoReabordar('Oi {primeiro_nome}, o valor sai por R$ 500 no seu carro, topa?'), /preço/);
  assert.match(R7.validarTextoReabordar('Oi {primeiro_nome}, tenho 10% de desconto no seu carro hoje'), /preço, desconto/);
  assert.match(R7.validarTextoReabordar('Oi {sobrenome}, vamos retomar o orçamento do seu carro?'), /não existe/);
  assert.match(R7.validarTextoReabordar('Prezado {nome}, vamos retomar o orçamento do seu carro?'), /prezado/i);
  assert.match(R7.validarTextoReabordar('curto'), /uma frase/);
  assert.match(R7.validarTextoReabordar('Oi {nome}, vamos retomar o orçamento do carro? }'), /solta/);
});

test('textos das réguas novas: variável obrigatória, vocabulário e promessa de preço', () => {
  assert.equal(R7.validarTextoR7('msg_vencendo', 'Oi {primeiro_nome}! Vale até {validade}: {link_orcamento}'), null);
  assert.match(R7.validarTextoR7('msg_vencendo', 'Oi {primeiro_nome}! Vale até {validade}.'), /link_orcamento/);
  assert.match(R7.validarTextoR7('msg_pronto_lembrete', 'Seu carro está pronto para retirar, venha!'), /link_os/);
  assert.match(R7.validarTextoR7('msg_aprovou', 'Oi {primeiro_nome}, só falta marcar com {consultor}.'), /não existe/);
  assert.match(R7.validarTextoR7('msg_aprovou', 'Oi {primeiro_nome}, fecha agora com R$ 50 de desconto.'), /preço/);
  assert.match(R7.validarTextoR7('msg_faltou', 'Prezado cliente, vamos remarcar?'), /prezado/i);
  assert.equal(R7.validarTextoR7('msg_faltou', 'Oi {primeiro_nome}! Sentimos sua falta. Remarcamos o {servico}?'), null);
  assert.equal(R7.validarTextoR7('campo_que_nao_existe', ''), null);
});

test('aprovou sem horário: espera N horas, some se marcou, se tem ordem ou se passou de 7 dias', () => {
  const agora = em(H, '14:00');
  const orc = (h, extra = {}) => ({ id: 'o1', status: 'aprovado', decidido_em: new Date(agora - h * 3600000).toISOString(), agendamento_id: null, ...extra });
  assert.equal(R7.decidirAprovou(orc(5), { agora, horas: 4 }).elegivel, true);
  assert.equal(R7.decidirAprovou(orc(5), { agora, horas: 4 }).chave, 'aprovou:orc:o1');
  assert.equal(R7.decidirAprovou(orc(2), { agora, horas: 4 }).elegivel, false);
  assert.equal(R7.decidirAprovou(orc(5, { agendamento_id: 'a1' }), { agora }).elegivel, false);
  assert.equal(R7.decidirAprovou(orc(5), { agora, temAgendamentoDepois: true }).elegivel, false);
  assert.equal(R7.decidirAprovou(orc(5), { agora, temOrdem: true }).elegivel, false);
  assert.equal(R7.decidirAprovou(orc(24 * 8), { agora }).elegivel, false);
  assert.equal(R7.decidirAprovou(orc(5, { status: 'enviado' }), { agora }).elegivel, false);
  assert.equal(R7.decidirAprovou(null).elegivel, false);
  assert.equal(R7.conferirAprovou({}, orc(5)).acao, 'enviar');
  assert.match(R7.conferirAprovou({}, orc(5), { temAgendamentoDepois: true }).motivo, /marcou/);
  assert.match(R7.conferirAprovou({}, orc(5, { status: 'recusado', numero: 7 })).motivo, /nº 7 não está mais aprovado/);
  assert.match(R7.conferirAprovou({}, null).motivo, /apagado/);
});

test('faltou ao horário: N horas depois da hora marcada, até 48 h, e não se já remarcou', () => {
  const ag = { id: 'a1', status: 'nao_veio', data: H, hora: '10:00:00' };
  assert.equal(R7.decidirFaltou(ag, { agora: em(H, '13:00'), horas: 2 }).elegivel, true);
  assert.equal(R7.decidirFaltou(ag, { agora: em(H, '11:00'), horas: 2 }).elegivel, false);
  assert.equal(R7.decidirFaltou(ag, { agora: em('2026-10-29', '10:00'), horas: 2 }).elegivel, false);
  assert.equal(R7.decidirFaltou(ag, { agora: em(H, '13:00'), remarcou: true }).elegivel, false);
  assert.equal(R7.decidirFaltou({ ...ag, status: 'concluido' }, { agora: em(H, '13:00') }).elegivel, false);
  assert.equal(R7.decidirFaltou(ag, { agora: em(H, '13:00') }).chave, 'faltou:a1');
  assert.equal(R7.conferirFaltou({}, ag).acao, 'enviar');
  assert.match(R7.conferirFaltou({}, { ...ag, status: 'concluido' }).motivo, /apareceu/);
  assert.match(R7.conferirFaltou({}, ag, { remarcou: true }).motivo, /outro horário/);
  assert.match(R7.conferirFaltou({}, null).motivo, /apagado/);
});

test('orçamento vencendo: só dentro de N dias, sem decisão, sem repetir o lembrete de parado', () => {
  const o = (validade, extra = {}) => ({ id: 'o1', status: 'enviado', validade, decidido_em: null, ...extra });
  assert.equal(R7.decidirVencendo(o('2026-10-27'), { hojeIso: H, dias: 1 }).elegivel, true);
  assert.equal(R7.decidirVencendo(o('2026-10-26'), { hojeIso: H, dias: 1 }).elegivel, true);     // vence hoje
  assert.equal(R7.decidirVencendo(o('2026-10-25'), { hojeIso: H, dias: 1 }).motivo, 'já venceu');
  assert.match(R7.decidirVencendo(o('2026-10-30'), { hojeIso: H, dias: 1 }).motivo, /depois de 1 dia/);
  assert.equal(R7.decidirVencendo(o('2026-10-30'), { hojeIso: H, dias: 5 }).elegivel, true);
  assert.equal(R7.decidirVencendo(o(null), { hojeIso: H }).elegivel, false);
  assert.equal(R7.decidirVencendo(o('2026-10-27', { status: 'aprovado' }), { hojeIso: H }).elegivel, false);
  const agora = em(H, '10:00');
  assert.equal(R7.decidirVencendo(o('2026-10-27'), { hojeIso: H, lembreteParadoEm: new Date(agora - 3600000).toISOString(), agora }).elegivel, false);
  assert.equal(R7.decidirVencendo(o('2026-10-27'), { hojeIso: H, lembreteParadoEm: new Date(agora - 30 * 3600000).toISOString(), agora }).elegivel, true);
  assert.equal(R7.conferirVencendo({}, o('2026-10-27'), H).acao, 'enviar');
  assert.match(R7.conferirVencendo({}, o('2026-10-27', { status: 'aprovado', numero: 3 }), H).motivo, /nº 3 já foi decidido/);
  assert.match(R7.conferirVencendo({}, o('2026-10-20'), H).motivo, /venceu/);
});

test('carro pronto esperando: só depois do aviso de pronto sair, uma vez, entre N horas e 14 dias', () => {
  const agora = em(H, '12:00');
  const os = (h, etapa = 'pronto') => ({ id: 'os1', etapa, etapa_em: new Date(agora - h * 3600000).toISOString() });
  const enviado = [{ status: 'enviado', chave_unica: 'patio_pronto:os1' }];
  assert.equal(R7.decidirProntoLembrete(os(30), enviado, { agora, horas: 24 }).elegivel, true);
  assert.equal(R7.decidirProntoLembrete(os(30), enviado, { agora, horas: 24 }).chave, 'patio_pronto_lembrete:os1');
  assert.equal(R7.decidirProntoLembrete(os(10), enviado, { agora, horas: 24 }).elegivel, false);
  assert.equal(R7.decidirProntoLembrete(os(30), [], { agora }).motivo, 'o aviso de pronto ainda não saiu');
  assert.equal(R7.decidirProntoLembrete(os(30), [{ status: 'pendente', chave_unica: 'patio_pronto:os1' }], { agora }).elegivel, false);
  assert.equal(R7.decidirProntoLembrete(os(30, 'entregue'), enviado, { agora }).elegivel, false);
  assert.equal(R7.decidirProntoLembrete(os(24 * 15), enviado, { agora }).elegivel, false);
  // o próprio lembrete enviado não conta como "aviso de pronto"
  assert.equal(R7.decidirProntoLembrete(os(30), [{ status: 'enviado', chave_unica: 'patio_pronto_lembrete:os1' }], { agora }).elegivel, false);
});

test('quando sai: rodadas de 15 em 15 min, lote de 25, janela, domingo e teto do dia', () => {
  const agora = em(H, '09:00');
  const fila = Array.from({ length: 60 }, (_, i) => ({ id: `e${i}`, tipo: 'posvenda', telefone: `1299900${String(i).padStart(4, '0')}`, enviar_em: new Date(agora - 60000).toISOString() }));
  const cfg = { janela_inicio: 8, janela_fim: 20, limite_por_hora: 60, limite_por_dia: 300, limite_por_minuto: 10, envia_domingo: false };
  const { saidas } = R7.simularSaidas(fila, { agora, cfg });
  assert.equal(saidas.size, 60);
  assert.equal(saidas.get('e0').rodada, new Date(em(H, '09:05')).toISOString());       // próxima rodada do carteiro
  assert.equal(saidas.get('e24').rodada, saidas.get('e0').rodada);                      // lote de 25 por rodada
  assert.notEqual(saidas.get('e25').rodada, saidas.get('e0').rodada);
  // limite de 60 por hora: a quarta rodada da hora não cabe
  const naHora = [...saidas.values()].filter((s) => Date.parse(s.saiEm) < em(H, '10:05'));
  assert.ok(naHora.length <= 60 + 0, `saíram ${naHora.length} na primeira hora`);
  // fora da janela: sexta 19:55 → o resto vai para sábado de manhã; domingo pulado
  const tarde = [{ id: 'z', tipo: 'campanha', telefone: '12999001234', enviar_em: new Date(em('2026-10-30', '19:30')).toISOString() }];
  const r = R7.simularSaidas(tarde, { agora: em('2026-10-30', '19:30'), cfg });
  assert.equal(r.saidas.get('z').dia, '2026-10-31');                                  // campanha depois das 18h espera o dia seguinte (sábado)
  const sab = R7.simularSaidas([{ id: 'w', tipo: 'posvenda', telefone: '12999001234', enviar_em: new Date(em('2026-10-31', '20:10')).toISOString() }], { agora: em('2026-10-31', '20:10'), cfg });
  assert.equal(sab.saidas.get('w').dia, '2026-11-02');                                // sábado à noite → segunda (domingo fechado; 02/11 é Finados, mas não segura posvenda nesta simulação sem feriado)
  const comDomingo = R7.simularSaidas([{ id: 'w', tipo: 'posvenda', telefone: '12999001234', enviar_em: new Date(em('2026-10-31', '20:10')).toISOString() }], { agora: em('2026-10-31', '20:10'), cfg: { ...cfg, envia_domingo: true } });
  assert.equal(comDomingo.saidas.get('w').dia, '2026-11-01');
});

test('quando sai: prioridade, feriado, teto por cliente no dia e limite diário', () => {
  const agora = em(H, '09:00');
  const cfg = { janela_inicio: 8, janela_fim: 20, limite_por_hora: 500, limite_por_dia: 3, limite_por_minuto: 60, intervalo_mesmo_cliente_min: 0, max_mensagens_cliente_dia: 2 };
  const base = (id, tipo, tel) => ({ id, tipo, telefone: tel, enviar_em: new Date(agora - 60000).toISOString() });
  // prioridade: o pátio pronto sai antes da campanha na mesma rodada
  const p = R7.simularSaidas([base('camp', 'campanha', '12999001111'), base('pronto', 'patio_pronto', '12999002222')], { agora, cfg: { ...cfg, limite_por_dia: 300 } });
  assert.ok(p.saidas.get('pronto').saiEm < p.saidas.get('camp').saiEm);
  // teto por cliente no dia (2): o lembrete (operacional, sai primeiro) e o orçamento hoje; as duas de venda que sobram, amanhã
  const t = R7.simularSaidas([base('a', 'campanha', '12999003333'), base('b', 'orcamento', '12999003333'), base('c', 'nao_fechou', '12999003333'), base('l', 'lembrete', '12999003333')], { agora, cfg: { ...cfg, limite_por_dia: 300 } });
  assert.equal(t.saidas.get('l').dia, H); assert.equal(t.saidas.get('b').dia, H);
  assert.equal(t.saidas.get('c').dia, '2026-10-27'); assert.equal(t.saidas.get('a').dia, '2026-10-27');
  // limite do dia (3): a quarta mensagem de pessoas diferentes sai no dia seguinte
  const d = R7.simularSaidas([1, 2, 3, 4].map((n) => base(`m${n}`, 'posvenda', `1299900444${n}`)), { agora, cfg });
  assert.equal([...d.saidas.values()].filter((s) => s.dia === H).length, 3);
  assert.equal(d.saidas.get('m4').dia, '2026-10-27');
  // feriado: pós-venda espera, lembrete não
  const f = R7.simularSaidas([base('pv', 'posvenda', '12999005555'), base('lb', 'lembrete', '12999006666')], { agora, cfg: { ...cfg, limite_por_dia: 300 }, feriado: (dia) => (dia === H ? 'Feriado' : null) });
  assert.equal(f.saidas.get('pv').dia, '2026-10-27');
  assert.equal(f.saidas.get('lb').dia, H);
  // já passou da validade antes de sair
  const v = R7.simularSaidas([{ ...base('v', 'posvenda', '12999007777'), expira_em: new Date(agora + 60000).toISOString() }], { agora, cfg });
  assert.equal(v.saidas.has('v'), false); assert.match(v.sem[0].motivo, /validade/);
});

test('plano da retomada: 8 na primeira meia hora, 25 até 2 h, só o essencial no começo', () => {
  const agora = em(H, '09:00');
  const cfg = { janela_inicio: 8, janela_fim: 20, limite_por_hora: 60, limite_por_dia: 300, limite_por_minuto: 10, retomada_gradual: true, retomada_max_30min: 8, retomada_max_2h: 25, retomada_so_essencial: false };
  const fila = Array.from({ length: 80 }, (_, i) => ({ id: `e${i}`, tipo: 'posvenda', telefone: `129990${String(i).padStart(5, '0')}`, enviar_em: new Date(agora - 3600000).toISOString() }));
  const plano = R7.planoDeRetomada(fila, { cfg, agora, desde: agora });
  assert.equal(plano.total, 80);
  assert.equal(plano.primeiraMeiaHora, 8);
  assert.equal(plano.primeiraMeiaHora + plano.ateDuasHoras, 25);
  assert.ok(plano.depois >= 40);
  assert.equal(plano.comRetomada, true);
  // sem retomada sai muito mais rápido
  const sem = R7.planoDeRetomada(fila, { cfg: { ...cfg, retomada_gradual: false }, agora, desde: agora });
  assert.ok(sem.primeiraMeiaHora > 8);
  // já saíram 5 desde a volta: só cabem mais 3 na primeira meia hora
  const j = R7.planoDeRetomada(fila, { cfg, agora, desde: agora, jaSairam: 5 });
  assert.equal(j.primeiraMeiaHora, 3);
  // só o essencial: campanha espera a retomada passar (2 h)
  const mix = [{ id: 'camp', tipo: 'campanha', telefone: '12999008888', enviar_em: new Date(agora - 3600000).toISOString() }, { id: 'pv', tipo: 'posvenda', telefone: '12999009999', enviar_em: new Date(agora - 3600000).toISOString() }];
  const ess = R7.simularSaidas(mix, { agora, cfg: { ...cfg, retomada_so_essencial: true }, retomada: { desde: agora, max30: 8, max120: 25, jaSairam: 0, soEssencial: true } });
  assert.ok(ess.saidas.get('pv').saiEm < ess.saidas.get('camp').saiEm);
  assert.ok(Date.parse(ess.saidas.get('camp').saiEm) - agora >= 15 * 60000);
});

test('triagem da fila acumulada: o que perdeu o sentido depois da queda', () => {
  const agora = em(H, '10:00');
  const h = (n) => new Date(agora - n * 3600000).toISOString();
  const fila = [
    { id: '1', tipo: 'campanha', enviar_em: h(60) }, { id: '2', tipo: 'campanha', enviar_em: h(2) },
    { id: '3', tipo: 'aniversario', enviar_em: h(30) }, { id: '4', tipo: 'patio_pronto', enviar_em: h(80) },
    { id: '5', tipo: 'lembrete', enviar_em: h(3) }, { id: '6', tipo: 'posvenda', enviar_em: h(10), expira_em: h(1) },
  ];
  const t = R7.triarFila(fila, agora);
  const por = Object.fromEntries(t.map((g) => [g.tipo, g]));
  assert.equal(por.campanha.perderamSentido, 1); assert.deepEqual(por.campanha.ids_perderam, ['1']); assert.equal(por.campanha.sugestao, 'cancelar');
  assert.equal(por.aniversario.perderamSentido, 1);
  assert.equal(por.lembrete.perderamSentido, 1);                 // lembrete atrasado 3 h: o horário já foi
  assert.equal(por.patio_pronto.perderamSentido, 0);              // aviso de pronto continua útil (o carteiro confere a ordem)
  assert.equal(por.posvenda.perderamSentido, 1);                  // passou da validade
  assert.equal(t[0].tipo, 'campanha');                            // quem merece atenção vem primeiro
  assert.equal(R7.triarFila([], agora).length, 0);
});

test('melhor horário, tempo de resposta e comparação entre períodos', () => {
  const env = [];
  for (let i = 0; i < 20; i++) env.push({ enviado_em: `2026-10-20T13:00:00Z`, respondido_em: i < 10 ? `2026-10-20T13:${String(10 + i).padStart(2, '0')}:00Z` : null });   // 10h SP: 50 %
  for (let i = 0; i < 20; i++) env.push({ enviado_em: `2026-10-21T19:00:00Z`, respondido_em: i < 2 ? '2026-10-21T20:00:00Z' : null });                                  // 16h SP: 10 %
  const m = R7.melhorHorario(env, { minimo: 15 });
  assert.equal(m.melhorHora.hora, 10);
  assert.equal(m.melhorHora.taxaResposta, 50);
  assert.equal(m.melhorDia.rotulo, 'terça');
  assert.equal(m.suficiente, true);
  assert.equal(R7.melhorHorario(env.slice(0, 3), { minimo: 15 }).melhorHora, null);   // amostra pequena: não opina
  assert.equal(R7.tempoMedianoDeResposta(env), 16);                                    // mediana de 10..19 (dez respostas) e 60, 60 min
  assert.equal(R7.tempoMedianoDeResposta([]), null);
  assert.deepEqual(R7.compararPeriodos(120, 100), { atual: 120, anterior: 100, delta: 20, pct: 20 });
  assert.equal(R7.compararPeriodos(5, 0).pct, null);
});

test('A/B: divisão estável e equilibrada; vencedor só com amostra e diferença que não é sorte', () => {
  const destinos = Array.from({ length: 200 }, (_, i) => ({ nome: `C${i}`, telefone: `1299${String(1000000 + i * 7)}` }));
  const d = R7.dividirAB(destinos);
  assert.equal(d.A.length + d.B.length, 200);
  assert.ok(Math.abs(d.A.length - d.B.length) <= 20);
  const tels = new Set([...d.A, ...d.B].map((x) => x.telefone));
  assert.equal(tels.size, 200);                                                         // ninguém repetido
  const d2 = R7.dividirAB(destinos);
  assert.deepEqual(d2.A.map((x) => x.telefone), d.A.map((x) => x.telefone));            // estável
  assert.equal(R7.compararAB({ enviadas: 100, responderam: 40 }, { enviadas: 100, responderam: 20 }).vencedor, 'A');
  assert.equal(R7.compararAB({ enviadas: 100, responderam: 20 }, { enviadas: 100, responderam: 40 }).vencedor, 'B');
  assert.equal(R7.compararAB({ enviadas: 100, responderam: 22 }, { enviadas: 100, responderam: 20 }).vencedor, null);
  assert.match(R7.compararAB({ enviadas: 10, responderam: 9 }, { enviadas: 10, responderam: 1 }).motivo, /poucos envios/);
});

test('respostas que ninguém atendeu e resumo anti-spam', () => {
  const agora = Date.now();
  const envios = [
    { id: '1', nome: 'Ana', telefone: '12991234567', tipo: 'campanha', respondido_em: new Date(agora - 5 * 3600000).toISOString(), resposta: 'Quero saber o preço', resposta_tipo: 'neutra' },
    { id: '2', nome: 'Bia', telefone: '12991230000', tipo: 'campanha', respondido_em: new Date(agora - 5 * 3600000).toISOString(), resposta: 'ok', resposta_tipo: 'positiva' },
    { id: '3', nome: 'Caio', telefone: '12991230001', tipo: 'campanha', respondido_em: new Date(agora - 30 * 60000).toISOString(), resposta: 'oi' },
    { id: '4', nome: 'Davi', telefone: '12991230002', tipo: 'campanha', respondido_em: new Date(agora - 5 * 3600000).toISOString(), resposta: 'PARAR', resposta_tipo: 'parar' },
  ];
  const conversas = new Map([['12991230000', { id: 'c2', ultimaSaidaEm: new Date(agora - 3600000).toISOString() }]]);
  const lista = R7.respostasSemAtender(envios, conversas, { agora, horas: 2 });
  assert.deepEqual(lista.map((x) => x.id), ['1']);          // Bia já foi atendida, Caio é recente, Davi pediu para parar
  assert.equal(lista[0].horas, 5);
  assert.equal(R7.resumoAntispam({ enviadas30: 1000, pararam30: 40 }).nivel, 'alto');
  assert.equal(R7.resumoAntispam({ enviadas30: 1000, pararam30: 20 }).nivel, 'atencao');
  assert.equal(R7.resumoAntispam({ enviadas30: 1000, pararam30: 5 }).nivel, 'ok');
  assert.equal(R7.resumoAntispam({}).taxaParar, 0);
  assert.equal(R7.resumoAntispam({ barrados: { celular: 3, repetido: 2 } }).totalBarrados, 5);
});

test('rótulo da saída e modelo já preenchido', () => {
  assert.equal(R7.rotuloDeSaida(new Date(em(H, '14:20')).toISOString(), H), 'hoje às 14:20');
  assert.equal(R7.rotuloDeSaida(new Date(em('2026-10-27', '09:35')).toISOString(), H), 'amanhã às 09:35');
  assert.equal(R7.rotuloDeSaida(new Date(em('2026-10-30', '09:35')).toISOString(), H), 'sexta (30/10) às 09:35');
  assert.equal(R7.modeloPareceJaPreenchido('Oi Mariana, tudo bem?', [{ nome: 'Mariana Souza' }]), true);
  assert.equal(R7.modeloPareceJaPreenchido('Oi {primeiro_nome}, tudo bem?', [{ nome: 'Mariana Souza' }]), false);
  const saida = R7.saidasPorHora([{ id: 'a', tipo: 'posvenda' }, { id: 'b', tipo: 'campanha' }], new Map([['a', { saiEm: new Date(em(H, '09:10')).toISOString(), dia: H }], ['b', { saiEm: new Date(em(H, '09:40')).toISOString(), dia: H }]]), H);
  assert.deepEqual(saida, [{ hora: 9, total: 2, porTipo: { posvenda: 1, campanha: 1 } }]);
});
