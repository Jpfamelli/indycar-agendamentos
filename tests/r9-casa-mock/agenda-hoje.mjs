// R14: a lista que a Agenda dá à recepção (papel "agenda") em GET /agenda/api/agendamentos: hoje, sem telefone. Dados inventados,
// com as horas relativas a "agora" (assim "passou da hora" sempre tem o mesmo desenho, a qualquer hora do dia).
const fuso = 'America/Sao_Paulo';
export function agendaDeHoje(agora = Date.now()) {
  const dia = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date(ms));
  const hora = (ms) => new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
  const item = (n, min, status, extra = {}) => ({ id: String(n).padStart(8, '0') + '-0000-4000-8000-000000000000', cliente_nome: ['Ana Exemplo', 'Bruno Teste', 'Carla Modelo', 'Diego Inventado', 'Eva Fictícia', 'Fábio Teste'][n % 6], servico: 'Revisão', data: dia(agora + min * 60000), hora: hora(agora + min * 60000) + ':00', status, compareceu: status === 'compareceu' ? 1 : 0, ...extra });
  return [
    item(1, -90, 'confirmado'), item(2, -40, 'compareceu'), item(3, -10, 'aguardando'), item(4, 60, 'confirmado'), item(5, 150, 'aguardando'),
    item(6, 30, 'cancelado'), item(7, -26 * 60, 'compareceu'),
  ];
}
