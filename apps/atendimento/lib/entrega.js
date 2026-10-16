'use strict';
/* ============================================================
   Entrega de mensagem que não duplica (rodada 4)
   O Render gratuito às vezes dorme no meio do expediente. A tela agora tenta
   de novo sozinha quando o servidor não responde — e ao reabrir a página ela
   retoma as entregas que ficaram pela metade. Para isso não virar mensagem
   repetida no WhatsApp do cliente, o envio passa a carregar o id da linha em
   whatsapp_mensagens e este módulo garante:
   - já saiu (status enviado/entregue/lido)? responde ok sem mandar de novo;
   - já está saindo (outra aba/tentativa)? recusa com 409 em vez de mandar 2×;
   - terminou? grava a situação na própria linha pelo servidor (vale mesmo que
     a aba tenha fechado no meio).
   ============================================================ */

const JA_SAIU = new Set(['enviado', 'entregue', 'lido']);

/* 16/10 (decisão do João): timeout ou conexão caída DEPOIS de mandar o pedido ao
   CodeWords = "não sabemos se chegou". Não tenta de novo sozinho (o cliente receberia
   duas); a linha fica 'falhou' com o erro começando por PREFIXO_SEM_CONFIRMACAO e a tela
   mostra "Chegou" / "Reenviar". Recusa antes de enviar (DNS, conexão recusada) segue
   como falha comum. */
const PREFIXO_SEM_CONFIRMACAO = 'Sem confirmação';
const RE_ANTES_DE_ENVIAR = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|UND_ERR_CONNECT_TIMEOUT|ERR_TLS|CERT_|ERR_INVALID_URL/i;
const RE_CAIU_NO_MEIO = /ECONNRESET|EPIPE|ECONNABORTED|UND_ERR_SOCKET|UND_ERR_CLOSED|other side closed|socket hang up|terminated/i;
/** O erro do fetch deixa dúvida se a mensagem saiu? (timeout ou conexão caída depois do pedido) */
function semConfirmacaoDoErro(e) {
  if (!e) return false;
  if (e.name === 'TimeoutError' || e.name === 'AbortError' || e?.cause?.name === 'TimeoutError') return true;
  const t = [e.code, e.message, e.cause?.code, e.cause?.message].filter(Boolean).join(' ');
  if (RE_ANTES_DE_ENVIAR.test(t)) return false;
  return RE_CAIU_NO_MEIO.test(t);
}
const ehSemConfirmacao = erro => String(erro || '').startsWith(PREFIXO_SEM_CONFIRMACAO);
const ERRO_JA_SEM_CONFIRMACAO = PREFIXO_SEM_CONFIRMACAO + ': não sabemos se esta mensagem chegou. Confira na conversa do WhatsApp; se não chegou, use "Reenviar".';
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function criarEntregador({ banco, enviar, agora = () => Date.now(), travaMs = 120_000 } = {}) {
  const emAndamento = new Map();   // mensagemId -> desde

  async function entregar(dados, mensagemId) {
    if (!mensagemId) return { ...(await enviar(dados)), semId: true };
    if (!RE_UUID.test(String(mensagemId))) return { ok: false, status: 400, erro: 'Identificador da mensagem inválido.', codigo: 'mensagem_invalida' };

    const desde = emAndamento.get(mensagemId);
    if (desde && agora() - desde < travaMs) {
      return { ok: false, status: 409, emAndamento: true, codigo: 'ja_saindo', erro: 'Esta mensagem já está saindo — aguarde um instante.' };
    }
    const sb = banco();
    let linha = null;
    if (sb) {
      const { data } = await sb.from('whatsapp_mensagens').select('id,status,direcao,conversa_id,erro').eq('id', mensagemId).maybeSingle();
      linha = data || null;
      if (linha && linha.direcao !== 'saida') return { ok: false, status: 400, erro: 'Só mensagem de saída pode ser enviada.', codigo: 'mensagem_invalida' };
      if (linha && JA_SAIU.has(linha.status)) return { ok: true, jaEnviada: true };
      // ficou sem confirmação: só sai de novo quando alguém clicar em "Reenviar" (nunca numa retomada automática)
      if (linha && linha.status === 'falhou' && ehSemConfirmacao(linha.erro) && dados?.reenviar !== true) {
        return { ok: false, status: 409, codigo: 'sem_confirmacao', semConfirmacao: true, erro: ERRO_JA_SEM_CONFIRMACAO };
      }
    }
    emAndamento.set(mensagemId, agora());
    try {
      const r = await enviar(dados);
      if (sb && linha && !r.desligado) {
        const status = r.ok ? 'enviado' : 'falhou';
        await sb.from('whatsapp_mensagens').update({ status, erro: r.ok ? null : String(r.erro || 'não saiu').slice(0, 300) })
          .eq('id', mensagemId).then(() => {}, () => {});
      }
      return r;
    } finally {
      emAndamento.delete(mensagemId);
    }
  }

  return { entregar, emAndamento };
}

module.exports = { criarEntregador, JA_SAIU, PREFIXO_SEM_CONFIRMACAO, semConfirmacaoDoErro, ehSemConfirmacao };
