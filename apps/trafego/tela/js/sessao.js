/* ============================================================================
   Sessão: o login é o da Casa. A sessão do Supabase fica no armazenamento do
   navegador deste domínio e é a mesma para Agenda, CRM, Atendimento, Comunicar
   e Tráfego. Aqui não existe tela de senha: sem sessão, a pessoa vai para a
   Casa e volta.
   O cliente do Supabase vem de vendor/supabase.js (servido pelo próprio app).
   ============================================================================ */

import * as Rede from './rede.js';
import { ErroApi } from './api.js';

/** Lê a configuração pública (endereço e chave pública do Supabase), esperando o servidor acordar se preciso. */
export async function lerConfiguracao(base, { aoEsperar, dormir, buscar, tempoLimite = 15000 } = {}) {
  const pedir = buscar || ((...a) => fetch(...a));
  const online = () => (typeof navigator !== 'undefined' ? navigator.onLine : undefined);
  const tarefa = async () => {
    /* Rodada 10: este era o único pedido da tela sem tempo limite. Conexão que abre e não responde (Wi-Fi ruim,
       servidor acordando) deixava "Abrindo o Tráfego" na tela para sempre; agora desiste em 15 s e tenta de novo. */
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), tempoLimite);
    try {
      let r;
      try { r = await pedir(base + 'api/config-publica', { cache: 'no-store', signal: controle.signal }); }
      catch { throw new ErroApi(Rede.mensagem(0, online()), { status: 0 }); }
      if (!r.ok) throw new ErroApi(Rede.mensagem(r.status, online()) || 'O servidor não respondeu. Tente de novo em instantes.', { status: r.status });
      try { return await r.json(); }
      catch { throw new ErroApi(Rede.mensagem(0, online()), { status: 0 }); }
    } finally { clearTimeout(relogio); }
  };
  return Rede.comNovasTentativas(tarefa, { aoEsperar, dormir });
}

/**
 * Abre a sessão. Devolve { sb, sessao, token } (sessao null = ninguém logado).
 * Lança ErroApi quando não consegue nem falar com o servidor.
 */
export async function abrirSessao({ base, aoEsperar, dormir, aoSair }) {
  const cfg = await lerConfiguracao(base, { aoEsperar, dormir });
  const fabrica = globalThis.supabase && globalThis.supabase.createClient;
  if (!cfg || !cfg.supabase_url || !cfg.supabase_anon_key || typeof fabrica !== 'function') {
    throw new ErroApi('Não consegui carregar o login do sistema. Recarregue a página; se continuar, avise quem cuida do sistema.', { status: 0, codigo: 'sem_login' });
  }
  const sb = fabrica(cfg.supabase_url, cfg.supabase_anon_key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  let sessao = null;
  try {
    const { data } = await sb.auth.getSession();
    sessao = (data && data.session) || null;
  } catch {
    sessao = null;
  }
  if (sb.auth.onAuthStateChange) {
    sb.auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT' && aoSair) aoSair(); });
  }
  /** Chave sempre fresca: o cliente do Supabase renova sozinho antes de vencer. */
  const token = async () => {
    try {
      const { data } = await sb.auth.getSession();
      return (data && data.session && data.session.access_token) || null;
    } catch {
      return null;
    }
  };
  return { sb, sessao, token };
}

const CHAVE_IDA = 'indycar_trafego_ida';

/** Já mandamos esta pessoa para a Casa agora há pouco? (evita ficar indo e voltando sem parar) */
export function acabouDeIr(agora = Date.now()) {
  try {
    const quando = Number(sessionStorage.getItem(CHAVE_IDA)) || 0;
    return agora - quando < 20000;
  } catch {
    return false;
  }
}
export function marcarIda(agora = Date.now()) {
  try { sessionStorage.setItem(CHAVE_IDA, String(agora)); } catch { /* sem armazenamento: segue */ }
}
export function limparIda() {
  try { sessionStorage.removeItem(CHAVE_IDA); } catch { /* sem armazenamento: segue */ }
}
