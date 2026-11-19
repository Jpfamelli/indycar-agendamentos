import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oportunidadesDeHorario } from '../dados.js';

test('horário no WhatsApp sugere um contato por telefone e exclui agendados e mensagens genéricas', () => {
  const m = (telefone_e164, corpo, nome = 'Nome fictício') => ({ telefone_e164, corpo, nome });
  const msgs = [
    m('12910000001', 'Tem horário na sexta?'), m('12910000001', 'Pode ser às 14h?'),
    m('12910000002', 'Obrigado!'), m('12910000003', 'Posso marcar amanhã?'),
    m('12910000004', 'Quero remarcar a revisão')
  ];
  assert.deepEqual(oportunidadesDeHorario(msgs, [{telefone_e164:'12910000003'}]), [
    { telefone: '12910000001', nome: 'Nome fictício' }, { telefone: '12910000004', nome: 'Nome fictício' }
  ]);
});
