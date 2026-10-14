// Rodada 4 (14/10/2026) — regras PURAS: valor ao concluir, sugestão de valor,
// consultor ↔ login, distribuição de horários sem consultor, preferências,
// presença (desfazer chegada), resiliência (espera crescente) e modo recepção.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  valorDeEntrada, valorValido, sugerirValor, sugerirLoginDoConsultor, distribuirSemConsultor, juntarPreferencias, VALOR_MAXIMO,
} from '../dados.js';
import { presencaPodeMarcar, decidirAcesso, rotaDeGestor, mensagemSegura } from '../regras.js';
import '../public/planejamento.js';

const P = globalThis.Planejamento;
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('valorDeEntrada: formatos do Brasil viram número; vazio = sem valor; lixo = NaN', () => {
  assert.equal(valorDeEntrada('350'), 350);
  assert.equal(valorDeEntrada('350,5'), 350.5);
  assert.equal(valorDeEntrada('1.234,56'), 1234.56);
  assert.equal(valorDeEntrada('R$ 1.250'), 1250);
  assert.equal(valorDeEntrada('1234.5'), 1234.5);
  assert.equal(valorDeEntrada(' R$ 89,90 '), 89.9);
  assert.equal(valorDeEntrada(199.999), 200);
  assert.equal(valorDeEntrada(''), null);
  assert.equal(valorDeEntrada('   '), null);
  assert.equal(valorDeEntrada(null), null);
  assert.ok(Number.isNaN(valorDeEntrada('abc')));
  assert.ok(Number.isNaN(valorDeEntrada('1.2.3')));
  assert.ok(Number.isNaN(valorDeEntrada({})));
  assert.ok(Number.isNaN(valorDeEntrada('-50')));
});

test('valorValido: entre 0 e o teto; null (sem valor) passa', () => {
  assert.equal(valorValido(null), true);
  assert.equal(valorValido(0), true);
  assert.equal(valorValido(350), true);
  assert.equal(valorValido(VALOR_MAXIMO + 1), false);
  assert.equal(valorValido(-1), false);
  assert.equal(valorValido(NaN), false);
});

test('a tela e o servidor leem o valor do MESMO jeito (planejamento.js × dados.js)', () => {
  for (const v of ['350', '350,50', '1.234,56', 'R$ 1.250', '1234.5', '', 'abc', '1.2.3', '0,99', '12.000', '99.999,99']) {
    const a = valorDeEntrada(v), b = P.valorDeTela(v);
    assert.ok(Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b)), `"${v}": servidor ${a} × tela ${b}`);
  }
});

test('reais e mascaraValor (campo de valor)', () => {
  assert.equal(P.reais(1234.5), 'R$ 1.234,50');
  assert.equal(P.reais(0), 'R$ 0,00');
  assert.equal(P.reais(1890), 'R$ 1.890,00');
  assert.equal(P.reais('x'), '');
  assert.equal(P.mascaraValor('R$ 12a3,456'), '123,45');
  assert.equal(P.mascaraValor('1.250,5'), '1.250,5');
  assert.equal(P.mascaraValor('9,9,9'), '9,99');
});

test('sugerirValor: orçamento aprovado > valor do horário > orçado no CRM > mediana do serviço', () => {
  const ag = { id: 'a1', servico: 'Troca de óleo de motor', valor: 0 };
  const hist = [{ id: 'h1', servico: 'Troca de Óleo de Motor', valor: 280 }, { id: 'h2', servico: 'troca de oleo de motor', valor: 320 },
    { id: 'h3', servico: 'Troca de óleo de motor', valor: 300 }, { id: 'h4', servico: 'Alinhamento', valor: 90 }];
  // só o histórico: mediana dos iguais (sem acento/maiúscula), o diferente fica de fora
  assert.deepEqual(sugerirValor({ agendamento: ag, historico: hist }), { valor: 300, fonte: 'historico', rotulo: 'média de 3 serviços iguais' });
  // o lead orçado ganha do histórico
  assert.equal(sugerirValor({ agendamento: ag, lead: { valor_orcado: 410 }, historico: hist }).fonte, 'lead');
  // valor já no horário ganha do lead
  assert.equal(sugerirValor({ agendamento: { ...ag, valor: 199 }, lead: { valor_orcado: 410 } }).valor, 199);
  // orçamento aprovado ganha de tudo (à vista primeiro); recusado e enviado não contam
  const orc = [{ status: 'recusado', total: 5000 }, { status: 'enviado', total: 4000 }, { status: 'aprovado', numero: 42, total: 1990, total_a_vista: 1890 }];
  const s = sugerirValor({ agendamento: { ...ag, valor: 199 }, orcamentos: orc, lead: { valor_orcado: 410 }, historico: hist });
  assert.deepEqual([s.valor, s.fonte, s.rotulo], [1890, 'orcamento', 'orçamento nº 42 aprovado']);
  // nada → sem sugestão (a tela mostra "Sem sugestão")
  assert.deepEqual(sugerirValor({ agendamento: { servico: 'Coisa rara' } }), { valor: null, fonte: null, rotulo: null });
  // mediana com número par de valores
  assert.equal(sugerirValor({ agendamento: ag, historico: hist.slice(0, 2) }).valor, 300);
});

test('sugerirLoginDoConsultor: reconhece "Consultor Prensencial Gabriel" como o login "Gabriel"', () => {
  const perfis = [{ id: U(1), nome: 'Leo', papel: 'admin' }, { id: U(2), nome: 'Gabriel', papel: 'atendente' },
    { id: U(3), nome: 'Joao Pedro', papel: 'admin' }, { id: U(4), nome: 'Franklin Consultor Presencial', papel: 'agenda' }];
  const s = sugerirLoginDoConsultor({ id: 'c1', nome: 'Consultor Prensencial Gabriel', perfil_id: null }, perfis);
  assert.deepEqual(s, { perfil_id: U(2), nome: 'Gabriel', papel: 'atendente' });
  // "Consultor Presencial" sozinho não casa com o Franklin só pelas palavras de cargo
  assert.equal(sugerirLoginDoConsultor({ id: 'c2', nome: 'Consultor Presencial', perfil_id: null }, perfis), null);
  // sem acento: "João" acha "Joao Pedro"
  assert.equal(sugerirLoginDoConsultor({ id: 'c3', nome: 'João', perfil_id: null }, perfis)?.perfil_id, U(3));
  // já ligado → nada; login já usado por outro consultor → fica de fora
  assert.equal(sugerirLoginDoConsultor({ id: 'c4', nome: 'Gabriel', perfil_id: U(2) }, perfis), null);
  assert.equal(sugerirLoginDoConsultor({ id: 'c5', nome: 'Gabriel', perfil_id: null }, perfis, new Set([U(2)])), null);
  // empate (dois "Gabriel") → não chuta
  assert.equal(sugerirLoginDoConsultor({ id: 'c6', nome: 'Gabriel', perfil_id: null }, [...perfis, { id: U(9), nome: 'Gabriel Souza' }]), null);
  // inativo não entra
  assert.equal(sugerirLoginDoConsultor({ id: 'c7', nome: 'Leo', perfil_id: null }, [{ id: U(1), nome: 'Leo', ativo: false }]), null);
});

test('distribuirSemConsultor: menor carga primeiro e nunca dois carros do mesmo consultor na mesma meia hora', () => {
  const cons = [{ id: 'A', nome: 'Ana', ativo: 1 }, { id: 'B', nome: 'Bia', ativo: 1 }, { id: 'X', nome: 'Inativo', ativo: 0 }];
  const ags = [
    { id: '1', data: '2026-10-15', hora: '09:00', status: 'confirmado', consultor_id: 'A' },
    { id: '2', data: '2026-10-15', hora: '09:10', status: 'aguardando', consultor_id: null },   // A ocupada nessa meia hora → B
    { id: '3', data: '2026-10-15', hora: '10:00', status: 'aguardando', consultor_id: null },   // carga A1 B1 → Ana (nome)
    { id: '4', data: '2026-10-15', hora: '10:00', status: 'aguardando', consultor_id: null },   // A ocupada às 10h → B
    { id: '5', data: '2026-10-15', hora: '10:15', status: 'aguardando', consultor_id: null },   // as duas ocupadas → fica de fora
    { id: '6', data: '2026-10-15', hora: '11:00', status: 'nao_veio', consultor_id: null },     // sem desfecho vivo: não conta
  ];
  const r = distribuirSemConsultor({ consultores: cons, agendamentos: ags });
  assert.deepEqual(r.map((x) => [x.id, x.consultor_id]), [['2', 'B'], ['3', 'A'], ['4', 'B']]);
  assert.deepEqual(distribuirSemConsultor({ consultores: [{ id: 'X', ativo: 0 }], agendamentos: ags }), []);
});

test('juntarPreferencias: grava as da Agenda sem apagar as dos outros apps', () => {
  assert.deepEqual(juntarPreferencias({ crm_tema: 'claro', notif_som: true }, { agenda_tour: true, notif_som: false }),
    { crm_tema: 'claro', notif_som: false, agenda_tour: true });
  assert.deepEqual(juntarPreferencias(null, { agenda_letra: 'grande' }), { agenda_letra: 'grande' });
  assert.deepEqual(juntarPreferencias([1, 2], ['x']), {});
});

test('presencaPodeMarcar: chegou/não veio; desfazer SÓ a própria chegada; desfecho comercial é intocável', () => {
  assert.equal(presencaPodeMarcar('confirmado', 'compareceu'), null);
  assert.equal(presencaPodeMarcar('aguardando', 'nao_veio'), null);
  assert.equal(presencaPodeMarcar('compareceu', 'aguardando'), null);
  assert.equal(presencaPodeMarcar('compareceu', 'confirmado'), null);
  assert.match(presencaPodeMarcar('confirmado', 'aguardando'), /só permite/);
  assert.match(presencaPodeMarcar('nao_veio', 'aguardando'), /só permite/, '"Não veio" já mandou WhatsApp: sem volta por aqui');
  assert.match(presencaPodeMarcar('concluido', 'compareceu'), /desfecho registrado/);
  assert.match(presencaPodeMarcar('nao_fechou', 'aguardando'), /desfecho registrado/);
  assert.match(presencaPodeMarcar('aguardando', 'concluido'), /só permite/);
});

test('rotas novas: painel de valores, pendências e consultor ↔ login são do gestor', () => {
  const at = { papel: 'atendente', ativo: true, apps: ['agenda'] }, ge = { papel: 'gestor', ativo: true, apps: ['agenda'] };
  const ag = { papel: 'agenda', ativo: true, apps: ['agenda'] };
  for (const [m, r] of [['GET', '/api/valores/pendentes'], ['PUT', `/api/agendamentos/${U(1)}/valor`], ['GET', '/api/pendencias-antigas'],
    ['GET', '/api/consultores/sugestoes-login'], ['POST', '/api/consultores/distribuir']]) {
    assert.ok(rotaDeGestor(m, r), `${m} ${r} é de gestor`);
    assert.equal(decidirAcesso({ perfil: at, metodo: m, rota: r })?.codigo, 'so_gestor');
    assert.equal(decidirAcesso({ perfil: ge, metodo: m, rota: r }), null);
    assert.equal(decidirAcesso({ perfil: ag, metodo: m, rota: r })?.codigo, 'so_presenca');
  }
  // sugestão de valor e contagens: equipe sim, presença não
  assert.equal(decidirAcesso({ perfil: at, metodo: 'GET', rota: `/api/agendamentos/${U(1)}/valor-sugerido` }), null);
  assert.equal(decidirAcesso({ perfil: ag, metodo: 'GET', rota: `/api/agendamentos/${U(1)}/valor-sugerido` })?.codigo, 'so_presenca');
  assert.equal(decidirAcesso({ perfil: at, metodo: 'GET', rota: '/api/contagens' }), null);
  assert.equal(decidirAcesso({ perfil: ag, metodo: 'GET', rota: '/api/contagens' })?.codigo, 'so_presenca');
});

test('login já ligado a outro consultor vira recado claro (409), não o recado do horário', () => {
  const e = Object.assign(new Error('Conflito'), { name: 'ErroSupabase', status: 409, detalhe: 'duplicate key value violates unique constraint "consultores_perfil_uk"' });
  const r = mensagemSegura(e);
  assert.equal(r.status, 409);
  assert.match(r.erro, /login já está ligado a outro consultor/);
});

test('resiliência: espera crescente até ~3 min, só para leitura e só com servidor fora/rede caída', () => {
  const esperas = [];
  for (let i = 0; ; i++) { const e = P.proximaEspera(i, 0); if (e === null) break; esperas.push(e); }
  assert.deepEqual(esperas.slice(0, 5), [1000, 2000, 4000, 8000, 15000]);
  const total = esperas.reduce((s, x) => s + x, 0);
  assert.ok(total >= 140_000 && total <= 190_000, `total ${total} ms`);
  assert.ok(P.proximaEspera(0, 1) <= 1200, 'sorteio de no máximo 20%');
  assert.equal(P.deveRepetir('GET', 503, false), true);
  assert.equal(P.deveRepetir('GET', 502, false), true);
  assert.equal(P.deveRepetir('get', 504, false), true);
  assert.equal(P.deveRepetir('GET', null, true), true);
  assert.equal(P.deveRepetir('GET', 500, false), false, '500 é erro nosso, não "acordando"');
  assert.equal(P.deveRepetir('GET', 401, false), false);
  assert.equal(P.deveRepetir('PATCH', 503, false), false, 'gravação nunca é repetida às cegas');
  assert.equal(P.servidorFora(503), true);
  assert.equal(P.servidorFora(400), false);
});

test('recepção: busca por nome ou placa sem acento; folha do dia numerada em ordem de hora', () => {
  const a = { cliente_nome: 'José Antônio', placa: 'ABC-1D23', veiculo: 'S10', servico: 'Embreagem' };
  assert.equal(P.casaRecepcao(a, 'jose'), true);
  assert.equal(P.casaRecepcao(a, 'abc1d23'), true);
  assert.equal(P.casaRecepcao(a, 's10'), true);
  assert.equal(P.casaRecepcao(a, 'maria'), false);
  assert.equal(P.casaRecepcao(a, ''), true);
  const f = P.linhasDaFolha([{ hora: '14:00', id: 'b' }, { hora: '08:30', id: 'a' }, { hora: '10:00', id: 'c' }]);
  assert.deepEqual(f.map((x) => [x.n, x.id]), [[1, 'a'], [2, 'c'], [3, 'b']]);
});

test('cargaSemana: horários ativos por consultor nos próximos dias (e a linha "sem consultor")', () => {
  const l = [
    { data: '2026-10-14', status: 'confirmado', consultor_id: 'A' }, { data: '2026-10-14', status: 'aguardando', consultor_id: null },
    { data: '2026-10-15', status: 'compareceu', consultor_id: 'A' }, { data: '2026-10-16', status: 'concluido', consultor_id: 'A' },
    { data: '2026-10-30', status: 'confirmado', consultor_id: 'A' },
  ];
  const c = P.cargaSemana(l, '2026-10-14', 7);
  assert.equal(c.datas.length, 7);
  assert.deepEqual(c.A, [1, 1, 0, 0, 0, 0, 0]);
  assert.deepEqual(c.sem, [1, 0, 0, 0, 0, 0, 0]);
});
