// ============================================================
// Freio do webhook do CodeWords (R13C, 22/11/2026).
// Puro: sem Deno.env e sem Supabase, roda no `deno test`.
//
// Mesma regra da versão Node do Atendimento (Central, rodada 10,
// apps/atendimento/server.js): do mesmo endereço, as 10 primeiras
// tentativas com token errado em 10 min ficam registradas; dali em
// diante é 429 SEM gravar nada. Quem manda o token certo passa
// sempre (a conferência do token vem antes do freio).
//
// E a chamada recusada nunca grava o corpo de quem chamou: só o
// tamanho e o nome dos campos (no máximo 20, cada um com 40 letras).
// ============================================================

export const TENTATIVAS_ERRADAS = 10;
export const JANELA_MS = 10 * 60_000;

/** Contador por chave numa janela fixa, com memória limitada (ao encher, sai primeiro o que já venceu). */
export function criarFreio({ maxChaves = 5000 }: { maxChaves?: number } = {}) {
  const mapa = new Map<string, { n: number; ate: number }>();
  function limpar(agora: number) {
    for (const [k, v] of mapa) if (v.ate <= agora) mapa.delete(k);
    // ainda cheio: sai o mais antigo (Map guarda a ordem de entrada)
    while (mapa.size >= maxChaves) mapa.delete(mapa.keys().next().value as string);
  }
  return {
    /** Soma uma tentativa e devolve quantas houve na janela atual. */
    contar(chave: string, janelaMs = JANELA_MS, agora = Date.now()): number {
      let v = mapa.get(chave);
      if (!v || v.ate <= agora) {
        if (!v && mapa.size >= maxChaves) limpar(agora);
        v = { n: 0, ate: agora + janelaMs };
        mapa.set(chave, v);
      }
      v.n += 1;
      return v.n;
    },
    /** Segundos até a janela da chave vencer (para o Retry-After). */
    espera(chave: string, agora = Date.now()): number {
      const v = mapa.get(chave);
      return v ? Math.max(1, Math.ceil((v.ate - agora) / 1000)) : 0;
    },
    get tamanho() { return mapa.size; },
  };
}

/** Endereço de quem chamou: o primeiro do x-forwarded-for (é o que o Supabase põe), senão cf/x-real-ip. */
export function ipDe(h: Headers): string {
  const xff = (h.get("x-forwarded-for") || "").split(",")[0].trim();
  const ip = xff || (h.get("cf-connecting-ip") || "").trim() || (h.get("x-real-ip") || "").trim();
  return /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : "desconhecido";
}

/** O que fica no registro de uma chamada RECUSADA: nada do conteúdo, só o tamanho e o nome dos campos. */
export function resumoDaRecusa(body: unknown, bytes: number): { bytes: number; campos: string[] } {
  const campos = body && typeof body === "object" && !Array.isArray(body)
    ? Object.keys(body as Record<string, unknown>).slice(0, 20)
      .map((k) => k.replace(/[^\w.-]/g, "").slice(0, 40)).filter(Boolean)
    : [];
  return { bytes: Math.max(0, Math.floor(Number(bytes) || 0)), campos };
}
