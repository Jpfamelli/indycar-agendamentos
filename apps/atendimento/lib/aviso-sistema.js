/* ============================================================
   AVISO DO SISTEMA gravado como mensagem recebida (rodada 10)
   O robô do WhatsApp grava no chat, com direção "entrada", quatro tipos de nota que não são o
   cliente escrevendo: "[Sistema] …", "Agendamento: …", "Lembrete 24h enviado …" e "3 no-shows hoje".
   O Tráfego já tirava essas notas das contas (apps/trafego/origem.js, mesma régua). Aqui elas
   faziam a conversa parecer "cliente esperando resposta": entravam na fila, disparavam o alerta de
   espera e podiam ser respondidas pela IA do funil.
   Enquanto a origem não grava a nota com outro tipo, quem lê a conversa usa esta régua.
   ============================================================ */
'use strict';

const RE_AVISO_DO_SISTEMA = /^\s*(\[sistema\]|agendamento:\s|lembrete 24h enviado|\d+ no-shows hoje)/i;

/** O texto é uma nota do sistema (não é o cliente nem o atendente escrevendo)? */
function ehAvisoDoSistema(texto) {
  return typeof texto === 'string' && RE_AVISO_DO_SISTEMA.test(texto);
}
/** A mensagem (linha de whatsapp_mensagens) é uma nota do sistema? */
const mensagemEhAviso = m => !!m && ehAvisoDoSistema(String(m.corpo ?? ''));

module.exports = { ehAvisoDoSistema, mensagemEhAviso, RE_AVISO_DO_SISTEMA };
