'use strict';
/* ============================================================
   Rodada 7 (C4) — mensagens da IA que não se repetem nem saem em enxurrada.

   Dois problemas reais para o dia em que a chave do CodeWords voltar:
     1. Enquanto o WhatsApp estava parado a IA foi tentando de novo (cada mensagem do cliente acordava
        a fila) e cada tentativa deixou uma linha "falhou" IGUAL na conversa. Na retomada o cliente
        receberia a mesma frase várias vezes. Agora a IA não cria a segunda cópia: reaproveita a que já espera.
     2. Quando tudo volta, dezenas de respostas poderiam sair no mesmo segundo. Agora a IA sai uma por vez,
        com um intervalo mínimo (padrão 2,5 s), sem passar por cima do entregador que já protege contra duplicar.
   Funções puras ou com o banco injetado: testadas em test/r7c4-envio.test.js.
   ============================================================ */

const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Compara textos ignorando acento, caixa, espaços repetidos e pontuação final. */
function normalizarCorpo(t) {
  return semAcento(t).replace(/[\p{Extended_Pictographic}️]/gu, '').replace(/\s+/g, ' ').replace(/[\s.!?…]+$/g, '').trim();
}

const JA_SAIU = new Set(['enviado', 'entregue', 'lido']);

/**
 * Já existe, nesta conversa, uma mensagem de saída com o MESMO texto?
 * - saiu ou está saindo há pouco (janela curta): é repetição → não manda de novo;
 * - ficou "falhou" (WhatsApp parado): já espera na fila de revisão → não cria outra cópia.
 * Devolve null ou { tipo: 'repetida'|'ja_na_fila', id, status, ha_min }.
 */
async function acharIgual(sb, { conversaId, corpo, agora = new Date(), janelaSaiuMin = 30, janelaFalhouMin = 12 * 60 }) {
  const alvo = normalizarCorpo(corpo);
  if (!alvo || !conversaId) return null;
  const desde = new Date(Number(agora) - Math.max(janelaSaiuMin, janelaFalhouMin) * 60_000).toISOString();
  const { data, error } = await sb.from('whatsapp_mensagens').select('id,corpo,status,erro,created_at')
    .eq('conversa_id', conversaId).eq('direcao', 'saida').gte('created_at', desde).order('created_at', { ascending: false }).limit(40);
  if (error || !Array.isArray(data)) return null;
  for (const m of data) {
    if (normalizarCorpo(m.corpo) !== alvo) continue;
    if (/^Resolvido/.test(m.erro || '')) continue;                 // alguém resolveu por telefone: não conta
    const ha = Math.max(0, Math.round((Number(agora) - Date.parse(m.created_at)) / 60000));
    if (m.status === 'falhou' && ha <= janelaFalhouMin) return { tipo: 'ja_na_fila', id: m.id, status: m.status, ha_min: ha };
    if ((JA_SAIU.has(m.status) || m.status === 'pendente') && ha <= janelaSaiuMin) return { tipo: 'repetida', id: m.id, status: m.status, ha_min: ha };
  }
  return null;
}

/** Fila de espera com intervalo mínimo entre envios da IA. `vez()` resolve quando for a hora de esta mensagem sair. */
function criarRitmo({ intervaloMs = 2500, agora = () => Date.now(), dormir = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let ultimo = -Infinity;
  let cadeia = Promise.resolve();
  let esperando = 0;
  return {
    vez() {
      esperando++;
      const minha = cadeia.then(async () => {
        const falta = ultimo + intervaloMs - agora();
        if (falta > 0) await dormir(falta);
        ultimo = agora();
        esperando--;
      });
      cadeia = minha.catch(() => {});
      return minha;
    },
    get esperando() { return esperando; },
  };
}

module.exports = { normalizarCorpo, acharIgual, criarRitmo, JA_SAIU };
