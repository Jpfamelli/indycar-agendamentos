/* ============================================================================
   Rede e servidor acordando (lógica pura, testada em tela/_testes/navegacao.test.mjs).
   Origem: apps/trafego/public/rede.js (rodada 4), reescrito como módulo ES.
   O Render gratuito dorme: a primeira chamada pode voltar 502, 503 ou 504, ou
   cair a conexão por alguns minutos. Leitura tenta de novo sozinha, com espera
   crescente. Gravação nunca repete sozinha (gravar duas vezes é pior que avisar).
   ============================================================================ */

/* 2 s, 5 s, 10 s, 20 s, 40 s, 1 min, 1 min: cerca de 3 min no total. */
export const ESPERAS = [2000, 5000, 10000, 20000, 40000, 60000, 60000];

/** Status que querem dizer "servidor dormindo, acordando ou caminho caiu". 0 = sem resposta. */
export function passageiro(status) {
  return [0, 408, 429, 502, 503, 504, 520, 521, 522, 523, 524].includes(status);
}

/**
 * 401, ou 403 que fala da PESSOA (sem acesso ao app, desativada, sem perfil, código de verificação, trocar senha):
 * a casca para tudo e mostra o caminho. Outro 403 com código (ex.: "so_admin", só o administrador cria chave)
 * é recusa de UMA ação: quem pediu mostra a frase ali mesmo e o resto do app segue funcionando.
 */
const RECUSAS_DA_PESSOA = new Set(['sem_acesso', 'desativado', 'sem_perfil', 'mfa', 'trocar_senha']);
export function recusaDaCasca(status, codigo) {
  return status === 401 || (status === 403 && RECUSAS_DA_PESSOA.has(codigo));
}

/** Só GET e HEAD repetem sozinhos. */
export function podeRepetir(metodo) {
  const m = String(metodo || 'GET').toUpperCase();
  return m === 'GET' || m === 'HEAD';
}

export function espera(n, esperas = ESPERAS) {
  return n >= 0 && n < esperas.length ? esperas[n] : null;
}

export function textoDaEspera(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return 'em ' + s + ' s';
  const m = Math.floor(s / 60), r = s % 60;
  return r ? 'em ' + m + ' min ' + r + ' s' : 'em ' + m + ' min';
}

/** Frase para a pessoa (nunca "Erro 503" cru). null quando o status não é de rede. */
export function mensagem(status, online) {
  if (online === false) return 'Sem internet. O que está na tela continua aqui; quando a conexão voltar eu tento de novo.';
  if (status === 0) return 'Não consegui falar com o servidor. O que está na tela continua aqui; tente de novo em instantes.';
  if (status === 429) return 'Muitos pedidos seguidos. Espere um pouco e tente de novo.';
  if (passageiro(status)) return 'O sistema está acordando: o servidor dorme quando ninguém usa. Tente de novo em instantes.';
  return null;
}

/**
 * Roda `tarefa(tentativa)` e repete enquanto ela lançar erro com `status` passageiro.
 * `aoEsperar(ms, tentativa)` avisa a tela; `dormir(ms)` é trocável no teste; `cancelado()` interrompe.
 */
export async function comNovasTentativas(tarefa, opcoes = {}) {
  const dormir = opcoes.dormir || ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let n = 0; ; n++) {
    try {
      return await tarefa(n);
    } catch (e) {
      const ms = espera(n, opcoes.esperas);
      const status = e && typeof e.status === 'number' ? e.status : null;
      // "respondeu": o servidor está de pé e disse o que houve (ex.: 503 "o banco ainda não recebeu a atualização"). Repetir não muda nada.
      if (ms === null || status === null || !passageiro(status) || (e && e.respondeu) || (opcoes.cancelado && opcoes.cancelado())) throw e;
      if (opcoes.aoEsperar) opcoes.aoEsperar(ms, n + 1, e);
      await dormir(ms);
      if (opcoes.cancelado && opcoes.cancelado()) throw e;
    }
  }
}
