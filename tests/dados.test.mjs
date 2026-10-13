// Testes das funções PURAS da camada de dados (sem banco, sem rede).
//   npm test   →  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ordenarPorProximidade, montarUltimos, dataBanco, horaBanco, telefoneNacional,
  nascimentoBanco, nascimentoTela, somarMeses, prazoDeRetorno, PRAZO_PADRAO,
  paraBool, paraBoolOuNulo, origemBanco, origemTela, horaCurta, soDigitos,
} from '../dados.js';

// ---- datas e horas ----------------------------------------------------------
test('dataBanco aceita ISO, DD/MM/AAAA e recusa lixo', () => {
  assert.equal(dataBanco('2026-10-09'), '2026-10-09');
  assert.equal(dataBanco('2026-10-09T15:00:00Z'), '2026-10-09');
  assert.equal(dataBanco('9/10/2026'), '2026-10-09');
  assert.equal(dataBanco('09/10/2026'), '2026-10-09');
  assert.equal(dataBanco(''), null);
  assert.equal(dataBanco(null), null);
  assert.equal(dataBanco('amanhã'), null);
});

test('horaBanco normaliza para HH:MM:SS', () => {
  assert.equal(horaBanco('9:00'), '09:00:00');
  assert.equal(horaBanco('09:30'), '09:30:00');
  assert.equal(horaBanco('14h'), '14:00:00');
  assert.equal(horaBanco('14h30'), '14:30:00');
  assert.equal(horaBanco('08:15:45'), '08:15:45');
  assert.equal(horaBanco('25:00'), null);
  assert.equal(horaBanco('09:75'), null);
  assert.equal(horaBanco(''), null);
  assert.equal(horaCurta('09:00:00'), '09:00');
});

// ---- telefone ---------------------------------------------------------------
test('telefoneNacional tira máscara e o DDI 55 só quando é DDI', () => {
  assert.equal(telefoneNacional('(12) 99141-5355'), '12991415355');
  assert.equal(telefoneNacional('+55 12 99141-5355'), '12991415355');
  assert.equal(telefoneNacional('5512991415355'), '12991415355');
  // celular do RS (DDD 55) com 11 dígitos: o 55 é DDD, fica
  assert.equal(telefoneNacional('55999887766'), '55999887766');
  assert.equal(telefoneNacional(''), null);
  assert.equal(soDigitos('a1b2'), '12');
});

// ---- booleanos e origem -----------------------------------------------------
test('paraBool trata string "0"/"false" como falso', () => {
  assert.equal(paraBool('0'), false);
  assert.equal(paraBool('false'), false);
  assert.equal(paraBool('não'), false);
  assert.equal(paraBool(1), true);
  assert.equal(paraBool('sim'), true);
  assert.equal(paraBoolOuNulo(''), null);
  assert.equal(paraBoolOuNulo(0), false);
});

test('origem vai e volta entre a tela e o enum do banco', () => {
  assert.equal(origemBanco('Instagram'), 'meta');
  assert.equal(origemBanco('Indicação'), 'indicacao');
  assert.equal(origemBanco('qualquer coisa'), 'organico');
  assert.equal(origemTela('meta'), 'Instagram');
  assert.equal(origemTela('whatsapp'), 'WhatsApp');
});

// ---- ordem do painel --------------------------------------------------------
const ag = (data, hora, extra = {}) => ({ data, hora, ...extra });

test('ordenarPorProximidade: o mais perto de acontecer primeiro, depois o passado do mais novo ao mais velho', () => {
  const lista = [ag('2026-10-09', '08:00'), ag('2026-10-10', '09:00'), ag('2026-10-09', '15:00'), ag('2026-10-02', '10:00'), ag('2026-10-09', '11:30')];
  const r = ordenarPorProximidade(lista, '2026-10-09', '10:00');
  assert.deepEqual(r.map(a => `${a.data} ${a.hora} ${a.secao}`), [
    '2026-10-09 11:30 proximos', '2026-10-09 15:00 proximos', '2026-10-10 09:00 proximos',
    '2026-10-09 08:00 passados', '2026-10-02 10:00 passados',
  ]);
});

test('ordenarPorProximidade aceita hora com segundos', () => {
  const r = ordenarPorProximidade([ag('2026-10-09', '10:00:00'), ag('2026-10-09', '09:00:00')], '2026-10-09', '09:30');
  assert.equal(r[0].hora, '10:00:00');
  assert.equal(r[1].secao, 'passados');
});

test('montarUltimos reserva vagas para quem já passou mesmo com a agenda cheia', () => {
  const prox = Array.from({ length: 15 }, (_, i) => ag('2026-10-10', `${String(8 + i).padStart(2, '0')}:00`));
  const pass = Array.from({ length: 6 }, (_, i) => ag('2026-10-08', `${String(8 + i).padStart(2, '0')}:00`));
  const r = montarUltimos([...prox, ...pass], '2026-10-09', '10:00');
  assert.equal(r.length, 10);
  assert.equal(r.filter(a => a.secao === 'passados').length, 4);   // reserva
  assert.equal(r.filter(a => a.secao === 'proximos').length, 6);
});

test('montarUltimos: com pouco futuro, o passado ocupa o resto', () => {
  const prox = [ag('2026-10-10', '09:00')];
  const pass = Array.from({ length: 12 }, (_, i) => ag('2026-10-08', `${String(8 + i).padStart(2, '0')}:00`));
  const r = montarUltimos([...prox, ...pass], '2026-10-09', '10:00');
  assert.equal(r.length, 10);
  assert.equal(r.filter(a => a.secao === 'passados').length, 9);
});

// ---- aniversário (Comunicar) ------------------------------------------------
test('nascimentoBanco: DD/MM vira ano 1904 (só dia e mês); DD/MM/AAAA guarda o ano', () => {
  assert.equal(nascimentoBanco('15/03'), '1904-03-15');
  assert.equal(nascimentoBanco('5/3'), '1904-03-05');
  assert.equal(nascimentoBanco('29/02'), '1904-02-29');          // 1904 é bissexto: cabe
  assert.equal(nascimentoBanco('15/03/1980'), '1980-03-15');
  assert.equal(nascimentoBanco('15/03/80'), '1980-03-15');
  assert.equal(nascimentoBanco('15/03/05'), '2005-03-15');
  assert.equal(nascimentoBanco('1980-03-15'), '1980-03-15');
  assert.equal(nascimentoBanco(''), null);                      // vazio = limpar
  assert.equal(nascimentoBanco(null), null);
});

test('nascimentoBanco recusa data que não existe', () => {
  assert.equal(nascimentoBanco('31/02'), undefined);
  assert.equal(nascimentoBanco('32/01'), undefined);
  assert.equal(nascimentoBanco('10/13'), undefined);
  assert.equal(nascimentoBanco('abc'), undefined);
  assert.equal(nascimentoBanco('15/03/1850'), undefined);
  assert.equal(nascimentoBanco('15/03/2999'), undefined);
});

test('nascimentoTela esconde o ano 1904', () => {
  assert.equal(nascimentoTela('1904-03-15'), '15/03');
  assert.equal(nascimentoTela('1980-03-15'), '15/03/1980');
  assert.equal(nascimentoTela(null), '');
});

// ---- próxima revisão --------------------------------------------------------
test('somarMeses respeita o fim do mês e a virada de ano', () => {
  assert.equal(somarMeses('2026-01-31', 1), '2026-02-28');
  assert.equal(somarMeses('2026-10-09', 6), '2027-04-09');
  assert.equal(somarMeses('2026-08-31', 6), '2027-02-28');
  assert.equal(somarMeses('2026-10-09', 12), '2027-10-09');
  assert.equal(somarMeses('lixo', 6), null);
});

test('prazoDeRetorno casa palavra no serviço sem ligar para maiúscula ou acento', () => {
  const regras = [
    { rotulo: 'Troca de óleo', palavras: ['oleo', 'óleo'], meses: 6, ativo: true, ordem: 1 },
    { rotulo: 'Freios', palavras: ['pastilha', 'freio'], meses: 12, ativo: true, ordem: 2 },
    { rotulo: 'Desligada', palavras: ['pneu'], meses: 3, ativo: false, ordem: 3 },
  ];
  assert.deepEqual(prazoDeRetorno('TROCA DE ÓLEO DE MOTOR', regras), { meses: 6, rotulo: 'Troca de óleo' });
  assert.deepEqual(prazoDeRetorno('Pastilha de freio dianteira', regras), { meses: 12, rotulo: 'Freios' });
  assert.deepEqual(prazoDeRetorno('Montagem de pneus', regras), PRAZO_PADRAO);   // regra inativa não vale
  assert.deepEqual(prazoDeRetorno('Alinhamento 3D', regras), PRAZO_PADRAO);
  assert.deepEqual(prazoDeRetorno('Qualquer coisa', []), PRAZO_PADRAO);
  assert.deepEqual(prazoDeRetorno('', regras), PRAZO_PADRAO);
});

test('prazoDeRetorno aceita palavras como texto separado por vírgula', () => {
  const r = prazoDeRetorno('Revisão de suspensão', [{ rotulo: 'Suspensão', palavras: 'amortecedor, suspensao', meses: 18 }]);
  assert.deepEqual(r, { meses: 18, rotulo: 'Suspensão' });
});

// ---- rodada 2: horários livres, telefone com máscara, rótulos do Comunicar ----
import { horariosLivres, padraoTelefone, variantesTelefone, rotuloEnvio, EXPEDIENTE } from '../dados.js';

test('horariosLivres: pula o que está ocupado, o que já passou e o domingo; espalha as sugestões', () => {
  const agora = { data: '2026-10-09', min: 10 * 60 };          // sexta, 10h
  const ocupados = [{ data: '2026-10-09', hora: '10:30', status: 'confirmado' },
    { data: '2026-10-09', hora: '11:00', status: 'nao_veio' }];   // falta não ocupa
  const s = horariosLivres({ desde: '2026-10-09', agora, agendamentos: ocupados, capacidade: 1 });
  assert.equal(s.length, 3);
  assert.deepEqual(s.map((x) => `${x.data} ${x.hora}`), ['2026-10-09 11:00', '2026-10-09 12:30', '2026-10-10 08:00']);
  // sábado cheio de manhã → pula; domingo nunca
  const sab = horariosLivres({ desde: '2026-10-10', agora, quantos: 4,
    agendamentos: ['08:00', '08:30', '09:00'].map((h) => ({ data: '2026-10-10', hora: h, status: 'aguardando' })) });
  assert.equal(sab[0].hora, '09:30');
  assert.ok(sab.every((x) => x.data !== '2026-10-11'));
  assert.ok(sab.every((x) => x.hora <= '17:00' && x.hora >= '08:00'));
});

test('horariosLivres: capacidade = consultores; com consultor só a agenda dele; ignora o próprio ao remarcar', () => {
  const agora = { data: '2026-10-08', min: 0 };
  const l = [{ id: 'a', data: '2026-10-09', hora: '08:00', status: 'confirmado', consultor_id: 'c1' }];
  assert.equal(horariosLivres({ desde: '2026-10-09', agora, agendamentos: l, capacidade: 1 })[0].hora, '08:30');
  assert.equal(horariosLivres({ desde: '2026-10-09', agora, agendamentos: l, capacidade: 2 })[0].hora, '08:00');
  // rodada 3: com consultor, a recepção também precisa ter vaga (capacidade = consultores ativos)
  assert.equal(horariosLivres({ desde: '2026-10-09', agora, agendamentos: l, consultor_id: 'c2', capacidade: 2 })[0].hora, '08:00');
  assert.equal(horariosLivres({ desde: '2026-10-09', agora, agendamentos: l, consultor_id: 'c2', capacidade: 1 })[0].hora, '08:30');
  assert.equal(horariosLivres({ desde: '2026-10-09', agora, agendamentos: l, consultor_id: 'c1', capacidade: 2 })[0].hora, '08:30');
  assert.equal(horariosLivres({ desde: '2026-10-09', agora, agendamentos: l, ignorar: 'a' })[0].hora, '08:00');
  assert.deepEqual(horariosLivres({ desde: 'ontem' }), []);
  assert.equal(EXPEDIENTE.ultimoInicio, 17 * 60);
});

test('padraoTelefone acha número com e sem máscara; variantes com e sem 55', () => {
  assert.equal(padraoTelefone('(12) 99141-5355'), '*9141*5355*');
  assert.equal(padraoTelefone('5355'), '*5355*');
  assert.equal(padraoTelefone('12'), null);
  assert.deepEqual(variantesTelefone('+55 12 99141-5355'), ['12991415355', '5512991415355']);
  assert.deepEqual(variantesTelefone('123'), []);
  assert.equal(rotuloEnvio('lembrete'), 'Lembrete do horário');
  assert.equal(rotuloEnvio('novo_tipo'), 'novo tipo');
});

// ============================ Rodada 3 (13/10/2026) ============================
import { padraoSemAcento, filtrosDeBusca, casaBusca, cargaDoDia, sugerirConsultor, perfilParaTela, gerarSenhaTemporaria } from '../dados.js';

test('busca sem acento: forma larga no ilike e conferência em JS ("oleo" acha "Óleo")', () => {
  assert.equal(padraoSemAcento('oleo'), '"*_l__*"');
  assert.equal(padraoSemAcento('Óleo'), '"*_l__*"', 'com acento digitado dá o mesmo padrão');
  assert.equal(padraoSemAcento('ao'), null, 'só curinga pegaria a tabela inteira');
  assert.equal(padraoSemAcento('x'), null);
  assert.equal(padraoSemAcento('Conceição*'), '"*__n______*"');
  const f = filtrosDeBusca('oleo', ['servico', 'placa']);
  assert.deepEqual(f, ['servico.ilike."*oleo*"', 'servico.ilike."*_l__*"', 'placa.ilike."*oleo*"', 'placa.ilike."*_l__*"']);
  assert.equal(casaBusca(['Troca de Óleo de motor'], 'oleo'), true);
  assert.equal(casaBusca(['Troca de oleo'], 'ÓLEO'), true);
  assert.equal(casaBusca(['José Antônio'], 'jose antonio'), true);
  assert.equal(casaBusca(['Conceição'], 'conceicao'), true);
  assert.equal(casaBusca(['Altamir'], 'oleo'), false, 'o que a forma larga trouxe a mais sai aqui');
  assert.equal(casaBusca(['Maria'], '9111-0001', '(12) 99111-0001'), true, 'telefone com máscara pelos dígitos');
  assert.equal(casaBusca(['Maria'], '5512991110001', '12991110001'), true, 'com 55 na frente');
});

test('carga por consultor no dia: só horários ativos, menor carga primeiro, "sem consultor" à parte', () => {
  const cons = [{ id: 'c1', nome: 'Gabriel', ativo: 1 }, { id: 'c2', nome: 'Ana', ativo: 1 }, { id: 'c3', nome: 'Saiu', ativo: 0 }];
  const ags = [
    { data: '2026-10-14', hora: '08:00', status: 'confirmado', consultor_id: 'c1' },
    { data: '2026-10-14', hora: '09:00', status: 'aguardando', consultor_id: 'c1' },
    { data: '2026-10-14', hora: '09:00', status: 'nao_veio', consultor_id: 'c2' },
    { data: '2026-10-14', hora: '10:00', status: 'aguardando', consultor_id: null },
    { data: '2026-10-15', hora: '10:00', status: 'aguardando', consultor_id: 'c2' },
  ];
  const c = cargaDoDia(cons, ags, '2026-10-14');
  assert.deepEqual(c.consultores.map((x) => [x.nome, x.total]), [['Ana', 0], ['Gabriel', 2]]);
  assert.equal(c.sem_consultor, 1);
});

test('sugerirConsultor: menor carga e livre na meia hora; ninguém livre → null (não bloqueia)', () => {
  const cons = [{ id: 'c1', nome: 'Gabriel', ativo: 1 }, { id: 'c2', nome: 'Ana', ativo: 1 }];
  const ags = [
    { id: 'x', data: '2026-10-14', hora: '08:00', status: 'confirmado', consultor_id: 'c2' },
    { id: 'y', data: '2026-10-14', hora: '09:00', status: 'confirmado', consultor_id: 'c1' },
    { id: 'z', data: '2026-10-14', hora: '10:00', status: 'confirmado', consultor_id: 'c1' },
  ];
  assert.equal(sugerirConsultor({ consultores: cons, agendamentos: ags, data: '2026-10-14', hora: '11:00' }).nome, 'Ana');
  assert.equal(sugerirConsultor({ consultores: cons, agendamentos: ags, data: '2026-10-14', hora: '08:15' }).nome, 'Gabriel');
  assert.equal(sugerirConsultor({ consultores: cons, agendamentos: ags, data: '2026-10-14', hora: '08:00', ignorar: 'x' }).nome, 'Ana');
  const lotado = [...ags, { id: 'w', data: '2026-10-14', hora: '09:00', status: 'confirmado', consultor_id: 'c2' }];
  assert.equal(sugerirConsultor({ consultores: cons, agendamentos: lotado, data: '2026-10-14', hora: '09:00' }), null);
  assert.equal(sugerirConsultor({ consultores: [], agendamentos: [], data: '2026-10-14' }), null);
  assert.match(sugerirConsultor({ consultores: cons, agendamentos: [], data: '2026-10-14' }).motivo, /livre o dia todo/);
});

test('horariosLivres: diz quais consultores estão livres em cada sugestão', () => {
  const agora = { data: '2026-10-13', min: 0 };
  const l = [{ id: 'a', data: '2026-10-14', hora: '08:00', status: 'confirmado', consultor_id: 'c1' }];
  const s = horariosLivres({ desde: '2026-10-14', agora, agendamentos: l, capacidade: 2, consultores: ['c1', 'c2'] });
  assert.equal(s[0].hora, '08:00');
  assert.deepEqual(s[0].consultores_livres, ['c2']);
  assert.deepEqual(s[1].consultores_livres, ['c1', 'c2']);
});

test('perfilParaTela: papel agenda só tem a Agenda; acesso, gestor e cor', () => {
  const franklin = perfilParaTela({ papel: 'agenda', apps: ['crm', 'agenda'], ativo: true }, 'id1');
  assert.deepEqual(franklin.apps, ['agenda']);
  assert.equal(franklin.pode_agenda, true);
  assert.equal(franklin.gestor, false);
  const semApp = perfilParaTela({ papel: 'atendente', apps: ['crm'], ativo: true }, 'id2');
  assert.equal(semApp.pode_agenda, false);
  assert.equal(perfilParaTela({ papel: 'admin', apps: [] }, 'id3').pode_agenda, true);
  assert.equal(perfilParaTela({ papel: 'gestor', apps: ['agenda'], avatar_cor: 'javascript:' }, 'id4').avatar_cor, '#e50914');
  assert.equal(perfilParaTela({ papel: 'gestor', precisa_trocar_senha: true }, 'id5').precisa_trocar_senha, true);
});

test('senha temporária: 12 caracteres sem 0/O/1/l e diferente a cada vez', () => {
  const a = gerarSenhaTemporaria(), b = gerarSenhaTemporaria();
  assert.equal(a.length, 12);
  assert.doesNotMatch(a, /[0O1lI]/);
  assert.notEqual(a, b);
});
