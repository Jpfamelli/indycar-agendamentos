/* ============================================================
   Rodada 7 (C4) — o WhatsApp parou / voltou: guarda no banco (sobrevive a reinício do servidor)
   e avisa SÓ gestor e administrador no sino, uma vez por parada (chave única).
   `aoMudar` é entregue ao criarZap; `restaurar` roda quando o servidor sobe.
   Nenhuma falha daqui derruba o envio de mensagens.
   ============================================================ */
'use strict';

function criarPersistenciaZap({ sb, zap, agora = () => new Date(), log = console.error } = {}) {
  const banco = () => (typeof sb === 'function' ? sb() : sb);

  async function aoMudar(ev) {
    const b = banco();
    if (!b || !ev) return { ok: false, motivo: 'sem_banco' };
    const t = agora().toISOString();
    try {
      if (ev.tipo === 'parou') await b.from('r7_c4_zap').upsert({ id: true, parado: true, codigo: ev.codigo, desde: ev.desde, voltou_em: null, atualizado_em: t });
      else await b.from('r7_c4_zap').upsert({ id: true, parado: false, codigo: ev.codigo, desde: ev.desde, voltou_em: t, ultima_parada_min: ev.minutos, atualizado_em: t });
    } catch (e) { log('zap persistir:', e.message); }
    let avisados = 0;
    try {
      const { data: gente } = await b.from('perfis').select('id,papel').eq('ativo', true).in('papel', ['admin', 'gestor']);
      const parou = ev.tipo === 'parou';
      const titulo = parou ? '⚠ O WhatsApp parou de enviar' : '✅ O WhatsApp voltou: reenvie com calma';
      const corpo = parou
        ? 'As mensagens ficam guardadas. Nada se perde; quando voltar eu aviso.'
        : `Ficou parado ${ev.minutos} min. Abra o aviso para ver o que pode sair, o que precisa do seu olho e o que fica de fora.`;
      for (const p of gente || []) {
        try {
          const { error } = await b.rpc('notificar', { p_perfil: p.id, p_tipo: 'whatsapp', p_titulo: titulo, p_corpo: corpo, p_link: '/?retomada=1', p_app: 'atendimento', p_chave: `zap-${ev.tipo}:${ev.desde}` });
          if (!error) avisados++;
        } catch (e) { log('zap avisar:', e.message); }
      }
    } catch (e) { log('zap equipe:', e.message); }
    return { ok: true, avisados };
  }

  async function restaurar() {
    const b = banco();
    if (!b) return false;
    try {
      const { data } = await b.from('r7_c4_zap').select('parado,codigo,desde').eq('id', true).maybeSingle();
      if (data?.parado && data.codigo && data.desde) return zap.restaurar({ codigo: data.codigo, desde: data.desde });
    } catch (e) { log('zap restaurar:', e.message); }
    return false;
  }

  return { aoMudar, restaurar };
}

module.exports = { criarPersistenciaZap };
