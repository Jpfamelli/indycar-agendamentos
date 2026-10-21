// Agenda (rodada 6 / C1c): regras puras do Quadro e do balcão (public/rodada6c.js lido de verdade num sandbox),
// o contexto de quem está sendo marcado (contexto.js) e as rotas novas por HTTP (banco falso).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
Object.assign(process.env, { SUPABASE_URL: 'http://supabase.falso', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste', SUPABASE_ANON_KEY: 'anon' });
const { resumoDoContexto, semanaDoQuadro, duracoesDaLista, nacional, placaLimpa } = await import('../contexto.js');

const ctx = vm.createContext({ globalThis: null });
ctx.globalThis = ctx;
vm.runInContext(readFileSync(new URL('../public/rodada6c.js', import.meta.url), 'utf8'), ctx);
const P = ctx.R6cPuro;
const plano = (v) => JSON.parse(JSON.stringify(v));
const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('duração em texto: minutos, hora cheia e hora e meia', () => {
  assert.equal(P.duracaoLabel(45), '45 min'); assert.equal(P.duracaoLabel(60), '1h'); assert.equal(P.duracaoLabel(90), '1h30');
  assert.equal(P.duracaoLabel(300), '5h'); assert.equal(P.duracaoLabel(0), ''); assert.equal(P.duracaoLabel('x'), '');
});
test('fim do serviço: soma a duração e marca "+" quando passa do fechamento', () => {
  assert.equal(P.fimDoServico('09:00', 90), '10:30'); assert.equal(P.fimDoServico('16:30', 120), '17:30+'); assert.equal(P.fimDoServico('', 60), '');
});
test('cauda do cartão: linhas de 30 min depois da primeira, sem passar do próximo cartão nem das 17h30', () => {
  assert.equal(P.caudaDoCartao(9 * 60, 90, []), 2);
  assert.equal(P.caudaDoCartao(9 * 60, 30, []), 0);
  assert.equal(P.caudaDoCartao(9 * 60, 300, [10 * 60 + 30]), 2, 'para antes do próximo cartão da coluna');
  assert.equal(P.caudaDoCartao(17 * 60, 300, []), 0, 'serviço que começa no fim do expediente não invade');
  assert.equal(P.caudaDoCartao(16 * 60, 300, []), 2);
  assert.equal(P.caudaDoCartao(9 * 60, 45, []), 1, '45 min ocupam a linha e meia seguinte');
});
test('carga do consultor soma só o que conta e usa 60 min quando a duração é desconhecida', () => {
  const l = [{ id: 'a', consultor_id: 'c1', status: 'aguardando' }, { id: 'b', consultor_id: 'c1', status: 'cancelado' }, { id: 'c', consultor_id: 'c1', status: 'concluido' }, { id: 'd', consultor_id: null, status: 'aguardando' }];
  assert.equal(P.cargaEmMin(l, { a: 90 }, 'c1'), 150); assert.equal(P.cargaEmMin(l, {}, null), 60);
});
test('filtro do Quadro: nome sem acento, placa com hífen, telefone parcial e "só quem falta"', () => {
  const l = [{ id: 1, cliente_nome: 'João Pedro', placa: 'ABC1D23', veiculo: 'Gol', servico: 'Revisão', telefone: '12991821234', status: 'aguardando' },
    { id: 2, cliente_nome: 'Ana', placa: 'XYZ9K88', veiculo: 'Onix', servico: 'Freios', telefone: null, status: 'compareceu' }];
  assert.deepEqual(P.filtrarCartoes(l, { busca: 'joao' }).map((x) => x.id), [1]);
  assert.deepEqual(P.filtrarCartoes(l, { busca: 'abc-1d23' }).map((x) => x.id), [1]);
  assert.deepEqual(P.filtrarCartoes(l, { busca: '1821' }).map((x) => x.id), [1]);
  assert.deepEqual(P.filtrarCartoes(l, { busca: 'freio onix' }).map((x) => x.id), [2]);
  assert.deepEqual(P.filtrarCartoes(l, { soFalta: true }).map((x) => x.id), [1]);
  assert.deepEqual(P.filtrarCartoes(l, { busca: 'zzz' }), []);
});
test('texto do dia: agrupa por consultor, mostra duração e marca quem chegou ou faltou', () => {
  const l = [{ id: 'a', hora: '09:00:00', cliente_nome: 'Ana', servico: 'Revisão', consultor_nome: 'Gabriel', status: 'aguardando', veiculo: 'Onix', placa: 'ABC1D23' },
    { id: 'b', hora: '08:30', cliente_nome: 'Beto', servico: 'Óleo', consultor_nome: null, status: 'compareceu' },
    { id: 'c', hora: '10:00', cliente_nome: 'Caio', servico: 'Freios', consultor_nome: 'Gabriel', status: 'nao_veio' },
    { id: 'd', hora: '11:00', cliente_nome: 'Cancelado', servico: 'x', status: 'cancelado' }];
  const t = P.textoDoDia(l, '2026-10-21', { duracoes: { a: 90 }, nomeOficina: 'IndyCar' });
  assert.match(t, /^\*IndyCar — agenda de quarta, 21\/10\*\n3 horários/);
  assert.match(t, /\*Gabriel\* \(2\)\n09:00 Ana — Revisão \(Onix ABC1D23\) · 1h30\n10:00 Caio — Freios ✖ não veio/);
  assert.match(t, /\*Sem consultor\* \(1\)\n08:30 Beto — Óleo ✔/);
  assert.doesNotMatch(t, /Cancelado/);
  assert.match(P.textoDoDia([], '2026-10-22'), /Nenhum horário marcado\./);
});
test('WhatsApp do atrasado: só número brasileiro válido, texto cortado e codificado', () => {
  assert.match(P.linkWhatsApp('(12) 99182-1234', 'oi & tchau'), /^https:\/\/wa\.me\/5512991821234\?text=oi%20%26%20tchau$/);
  assert.match(P.linkWhatsApp('5512991821234', 'x'), /wa\.me\/5512991821234/);
  assert.equal(P.linkWhatsApp('123', 'x'), null); assert.equal(P.linkWhatsApp(null, 'x'), null);
  assert.ok(decodeURIComponent(P.linkWhatsApp('12991821234', 'a'.repeat(2000)).split('text=')[1]).length <= 900);
});
test('atrasados: passou de 10 min, ainda não chegou, do mais atrasado para o menos', () => {
  const l = [{ id: 1, hora: '09:00', status: 'aguardando' }, { id: 2, hora: '08:00', status: 'confirmado' }, { id: 3, hora: '09:55', status: 'aguardando' }, { id: 4, hora: '08:30', status: 'compareceu' }, { id: 5, hora: '08:30', status: 'aguardando', compareceu: 1 }];
  const r = P.atrasados(l, 10 * 60 + 5);
  assert.deepEqual(r.map((x) => [x.a.id, x.atraso]), [[2, 125], [1, 65]]);
  assert.match(P.textoDoAtrasado({ cliente_nome: 'Ana Souza', servico: 'Revisão', hora: '09:00:00' }, 65), /^Oi Ana, tudo bem\?.*era às 09:00 \(já passou 65 min\)/);
  assert.doesNotMatch(P.textoDoAtrasado({ cliente_nome: 'Ana', servico: 'x', hora: '09:00' }, 2), /já passou/);
});

const CAT = [{ nome: 'Troca de óleo de motor' }, { nome: 'Alinhamento 3D' }, { nome: 'Revisão completa' }, { nome: 'Freios' }, { nome: 'Diagnóstico com scanner' }];
const HOJE = '2026-10-21';   // quarta
test('marcar rápido: nome, telefone, serviço, dia e hora numa linha só', () => {
  const r = plano(P.parseRapido('Ana Souza 12 99182-1234 óleo amanhã 10h30 gol abc-1d23', HOJE, CAT));
  assert.deepEqual(r, { cliente_nome: 'Ana Souza', telefone: '12991821234', placa: 'ABC1D23', hora: '10:30', data: '2026-10-22', servico: 'Troca de óleo de motor', veiculo: 'Gol' });
  assert.deepEqual(plano(P.faltaNoRapido(r)), []);
});
test('marcar rápido: dia da semana (próxima ocorrência), dd/mm e "depois de amanhã"', () => {
  assert.equal(P.parseRapido('Beto freios sexta 14h', HOJE, CAT).data, '2026-10-23');
  assert.equal(P.parseRapido('Beto freios quarta 14h', HOJE, CAT).data, '2026-10-28', 'quarta numa quarta = a da semana que vem');
  assert.equal(P.parseRapido('Beto freios hoje 14h', HOJE, CAT).data, HOJE);
  assert.equal(P.parseRapido('Beto freios 05/11 9:00', HOJE, CAT).data, '2026-11-05');
  assert.equal(P.parseRapido('Beto freios 02/01 9:00', HOJE, CAT).data, '2027-01-02', 'dd/mm que já passou vale para o ano que vem');
  assert.equal(P.parseRapido('Beto freios depois de amanhã 9h', HOJE, CAT).data, '2026-10-23');
});
test('marcar rápido: hora em vários jeitos e o que falta é dito em voz alta', () => {
  assert.equal(P.parseRapido('x às 9h', HOJE, CAT).hora, '09:00'); assert.equal(P.parseRapido('x 15:45', HOJE, CAT).hora, '15:45'); assert.equal(P.parseRapido('x 8h15', HOJE, CAT).hora, '08:15');
  const r = P.parseRapido('Carlos 12991821234', HOJE, CAT);
  assert.deepEqual(plano(P.faltaNoRapido(r)), ['serviço', 'dia', 'hora']);
  assert.equal(r.telefone, '12991821234'); assert.equal(r.cliente_nome, 'Carlos');
  assert.equal(P.parseRapido('+55 (12) 99182-1234 Dani scanner', HOJE, CAT).telefone, '12991821234');
  assert.equal(P.parseRapido('', HOJE, CAT).cliente_nome, '');
});
test('marcar rápido: serviço pela palavra-chave do catálogo e texto estranho não derruba', () => {
  assert.equal(P.parseRapido('Eva alinhamento terça 11h', HOJE, CAT).servico, 'Alinhamento 3D');
  assert.equal(P.parseRapido('Eva revisao terça 11h', HOJE, CAT).servico, 'Revisão completa');
  assert.equal(P.parseRapido('Eva qualquercoisa', HOJE, CAT).servico, '');
  assert.doesNotThrow(() => P.parseRapido('<img src=x onerror=alert(1)> ((( 99/99', HOJE, CAT));
  assert.doesNotThrow(() => P.parseRapido(null, HOJE, null));
});

/* ---------------- contexto.js (servidor) ---------------- */
test('contexto: telefone com e sem máscara/55 casa; placa com hífen casa', () => {
  assert.equal(nacional('+55 (12) 99182-1234'), '12991821234'); assert.equal(nacional('5512991821234'), '12991821234'); assert.equal(placaLimpa('abc-1d23'), 'ABC1D23'); assert.equal(placaLimpa('123'), '');
});
test('contexto: horário futuro vivo, carro no pátio e orçamento esperando viram avisos', () => {
  const r = resumoDoContexto({ tel: '(12) 99182-1234', placa: 'abc-1d23', ignorar: ID(9), hojeIso: HOJE,
    agendamentos: [{ id: ID(1), data: '2026-10-23', hora: '10:00:00', servico: 'Freios', status: 'aguardando', telefone: '12991821234' },
      { id: ID(9), data: '2026-10-24', hora: '09:00', status: 'aguardando', telefone: '12991821234' },       // o que está aberto: ignora
      { id: ID(2), data: '2026-10-20', hora: '09:00', status: 'aguardando', telefone: '12991821234' },       // passado
      { id: ID(3), data: '2026-10-25', hora: '09:00', status: 'cancelado', telefone: '12991821234' },        // cancelado
      { id: ID(4), data: '2026-10-25', hora: '09:00', status: 'aguardando', telefone: '12900000000' }],      // outro cliente
    os: [{ os_id: ID(30), numero: 31, etapa: 'em_execucao', placa: 'ABC1D23', telefone: null }, { os_id: ID(31), numero: 32, etapa: 'entregue', placa: 'ABC1D23' }, { os_id: ID(32), numero: 33, etapa: 'pronto', placa: 'QQQ0Q00' }],
    orcamentos: [{ id: ID(40), numero: 12, status: 'aprovado', total: 900, cliente_telefone: '5512991821234', agendamento_id: null }, { id: ID(41), numero: 13, status: 'enviado', total: 50, cliente_telefone: '12991821234' },
      { id: ID(42), numero: 14, status: 'aprovado', cliente_telefone: '12991821234', agendamento_id: ID(1) }, { id: ID(43), numero: 15, status: 'recusado', cliente_telefone: '12991821234' }] });
  assert.deepEqual(r.futuros.map((x) => [x.id, x.hora]), [[ID(1), '10:00']]);
  assert.deepEqual(r.patio.map((x) => [x.numero, x.etapa_rotulo]), [[31, 'Em execução']]);
  assert.deepEqual(r.orcamentos.map((x) => [x.numero, x.status]), [[12, 'aprovado'], [13, 'enviado']]);
  assert.deepEqual(r.avisos.map((a) => a.tipo), ['futuro', 'patio', 'orcamento', 'orcamento']);
  assert.match(r.avisos[0].texto, /23\/10 às 10:00 \(Freios\)/);
  assert.match(r.avisos[2].texto, /#0012 aprovado e ainda sem horário/);
  assert.match(r.patio[0].abrir, /\?os=/);
});
test('contexto: sem telefone nem placa válidos não acha nada', () => {
  const r = resumoDoContexto({ tel: '123', placa: 'x', hojeIso: HOJE, agendamentos: [{ id: ID(1), data: HOJE, hora: '10:00', status: 'aguardando', telefone: '123' }], os: [{ etapa: 'pronto', placa: '' }], orcamentos: [] });
  assert.deepEqual([r.futuros.length, r.patio.length, r.avisos.length], [0, 0, 0]);
});
test('semana do Quadro: conta por dia, ignora cancelados, domingo fechado e lotação limitada a 100%', () => {
  const l = [{ data: '2026-10-21', status: 'aguardando' }, { data: '2026-10-21', status: 'nao_veio' }, { data: '2026-10-21', status: 'cancelado' }, { data: '2026-10-22', status: 'confirmado' }];
  const d = semanaDoQuadro({ desde: '2026-10-21', n: 6, agendamentos: l, capacidadePorDia: 2 });
  assert.deepEqual(d.map((x) => [x.data.slice(8), x.total, x.vivos, x.faltaram]).slice(0, 2), [['21', 2, 1, 1], ['22', 1, 1, 0]]);
  assert.equal(d[0].lotacao, 100); assert.equal(d[1].lotacao, 50);
  assert.equal(d[4].data, '2026-10-25'); assert.equal(d[4].aberto, false); assert.equal(d[4].lotacao, null, 'domingo');
});
test('duração de cada horário: limites de 15 min a 8 h', () => {
  assert.deepEqual(duracoesDaLista([{ id: 'a', servico: 'x' }, { id: 'b', servico: 'y' }, { id: 'c', servico: 'z' }], (s) => ({ x: 5, y: 9999, z: 90 }[s])), { a: 15, b: 480, c: 90 });
});
