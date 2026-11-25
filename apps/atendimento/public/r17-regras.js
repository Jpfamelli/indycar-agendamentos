/* ============================================================
   IndyCar Atendimento · r17-regras.js (Rodada 17, 25/11/2026)
   Regras PURAS do fluxo "conversa -> Agendar -> confirmação" (sem rede, sem DOM).
   Carregado no navegador (window.R17) e no Node. Testado em test/r17-fluxo.test.js.
     · horarioTexto: o horário da confirmação como gente fala ("quarta-feira, 26/11, às 09:00")
     · variaveisCruas: o que ficou {assim} na mensagem, para não ir para o cliente
     · avisoAgendado: o aviso depois de agendar, com o dia e o próximo passo
   ============================================================ */
(function (raiz) {
  'use strict';
  const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  // as variáveis que o app troca (aba Atalhos); chave entre chaves fora desta lista não é variável
  const VARIAVEIS = ['nome', 'primeiro_nome', 'carro', 'placa', 'servico', 'horario', 'consultor', 'atendente', 'ultimo_servico', 'proxima_revisao'];

  function partes(data, hora) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data ?? '').trim());
    if (!m) return null;
    const h = /^(\d{1,2}):(\d{2})/.exec(String(hora ?? '').trim());
    // meio-dia em UTC: o dia da semana não muda com o fuso de quem abre
    const dia = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).getUTCDay();
    return { dia, ddmm: `${m[3]}/${m[2]}`, hora: h ? `${h[1].padStart(2, '0')}:${h[2]}` : '' };
  }

  /** "2026-11-26", "09:00" -> "quinta-feira, 26/11, às 09:00". Sem hora: "quinta-feira, 26/11". Data ruim: ''. */
  function horarioTexto(data, hora) {
    const p = partes(data, hora);
    if (!p) return '';
    return `${DIAS[p.dia]}, ${p.ddmm}${p.hora ? `, às ${p.hora}` : ''}`;
  }

  /** As variáveis que ficaram sem trocar ({placa} quando o cliente não tem placa). Sem repetição, na ordem. */
  function variaveisCruas(texto) {
    const achadas = [];
    for (const m of String(texto ?? '').matchAll(/\{(\w+)\}/g)) if (VARIAVEIS.includes(m[1]) && !achadas.includes(m[1])) achadas.push(m[1]);
    return achadas;
  }

  /** O aviso que fica na tela depois de agendar: quando ficou e o que fazer agora. */
  function avisoAgendado(data, hora, { temConfirmacao = true } = {}) {
    const p = partes(data, hora);
    const quando = p ? `${CURTO[p.dia]} ${p.ddmm}${p.hora ? ' às ' + p.hora : ''}` : '';
    return `📅 Agendado${quando ? ' para ' + quando : ''}. ${temConfirmacao ? 'A confirmação está no campo: revise e envie.' : 'Já está na Agenda e no CRM.'}`;
  }

  const R17 = { horarioTexto, variaveisCruas, avisoAgendado, VARIAVEIS };
  if (typeof module === 'object' && module.exports) module.exports = R17;
  else raiz.R17 = R17;
})(typeof window !== 'undefined' ? window : globalThis);
