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
  assert.equal(horariosLivres({ desde: '2026-10-09', agora, agendamentos: l, consultor_id: 'c2' })[0].hora, '08:00');
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
