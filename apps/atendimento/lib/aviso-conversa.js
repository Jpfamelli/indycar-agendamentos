'use strict';

// A RPC já impede duas inserções concorrentes com a mesma chave.
// Uma linha existente conserva a leitura enquanto o estado continua aberto.
async function avisarConversa(sb, aviso, reabertoEm = null) {
  const r = await sb.rpc('notificar', aviso);
  if (r.error || r.data) return r;
  const campos = {
    titulo: aviso.p_titulo.slice(0, 140),
    corpo: aviso.p_corpo?.slice(0, 400) || null,
  };
  if (reabertoEm) Object.assign(campos, { lida_em: null, created_at: reabertoEm });
  const atualizacao = sb.from('notificacoes').update(campos).eq('perfil_id', aviso.p_perfil).eq('chave', aviso.p_chave);
  return reabertoEm ? atualizacao.select('id').maybeSingle() : atualizacao;
}

module.exports = { avisarConversa };
