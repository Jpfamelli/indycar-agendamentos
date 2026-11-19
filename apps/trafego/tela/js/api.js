/* ============================================================================
   Conversa com o servidor do app. Endereço sempre relativo à pasta da página
   (o app mora em /trafego/). Leitura repete sozinha enquanto o servidor acorda;
   gravação nunca repete. Erro sempre chega com frase de gente.
   A parte de decisão está em rede.js (testada); aqui fica a cola com o fetch.
   ============================================================================ */

import * as Rede from './rede.js';

export class ErroApi extends Error {
  constructor(mensagem, { status = 0, codigo = null, corpo = null } = {}) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.codigo = codigo;
    this.corpo = corpo;
  }
}

const online = () => (typeof navigator !== 'undefined' && navigator.onLine === false ? false : undefined);

/**
 * criarApi({ base, token, aoRecusar, aoEsperar, aoVoltar })
 *  - base: pasta da página ("/trafego/"); token: () => Promise<string|null>
 *  - aoRecusar(status, codigo, corpo): 401 ou 403 com código (sessão vencida, sem acesso, código de verificação)
 *  - aoEsperar(ms, tentativa) e aoVoltar(): a tela mostra e esconde "o sistema está acordando"
 */
export function criarApi({ base, token, aoRecusar, aoEsperar, aoVoltar, buscar, dormir, tempoLimite = 25000 }) {
  const pedir = buscar || ((...a) => fetch(...a));

  async function umaVez(metodo, caminho, corpo) {
    const chave = token ? await token() : null;
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), tempoLimite);
    let resposta;
    try {
      resposta = await pedir(base + String(caminho).replace(/^[/]+/, ''), {
        method: metodo,
        headers: {
          Accept: 'application/json',
          ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(chave ? { Authorization: 'Bearer ' + chave } : {}),
        },
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
        signal: controle.signal,
        cache: 'no-store',
        keepalive: metodo !== 'GET',
      });
    } catch {
      throw new ErroApi(Rede.mensagem(0, online()), { status: 0 });
    } finally {
      clearTimeout(relogio);
    }
    let dados = null;
    try { dados = await resposta.json(); } catch { dados = null; }
    if (!resposta.ok) throw erroDaResposta(resposta, dados);
    if (dados === null) throw new ErroApi('O servidor respondeu de um jeito que eu não entendi. Tente de novo.', { status: resposta.status });
    return dados;
  }

  /** Resposta de erro → ErroApi com a frase do app (ou a de rede). 401 e 403 com código avisam a casca. */
  function erroDaResposta(resposta, dados) {
    const codigo = (dados && dados.codigo) || null;
    if (Rede.recusaDaCasca(resposta.status, codigo) && aoRecusar) aoRecusar(resposta.status, codigo, dados);
    const frase = (dados && typeof dados.erro === 'string' && dados.erro) || Rede.mensagem(resposta.status, online()) || 'Não deu certo agora. Tente de novo.';
    const erro = new ErroApi(frase, { status: resposta.status, codigo, corpo: dados });
    // Frase vinda do próprio app: ele está acordado. Só a resposta sem frase (página do provedor) conta como "acordando".
    erro.respondeu = Boolean(dados && typeof dados.erro === 'string' && dados.erro);
    return erro;
  }

  async function lerErro(resposta) {
    let dados = null;
    try { dados = await resposta.json(); } catch { dados = null; }
    return erroDaResposta(resposta, dados);
  }

  async function cabecalhos(extra) {
    const chave = token ? await token() : null;
    return { ...extra, ...(chave ? { Authorization: 'Bearer ' + chave } : {}) };
  }

  /**
   * Pergunta que responde em fluxo (text/event-stream). Devolve a Response com o corpo para ler aos pedaços.
   * `sinal` (AbortSignal) para o botão "Parar". Uma tentativa só, sem tempo limite (a resposta pode demorar).
   */
  async function fluxo(caminho, corpo, { sinal } = {}) {
    let resposta;
    try {
      resposta = await pedir(base + String(caminho).replace(/^[/]+/, ''), {
        method: 'POST',
        headers: await cabecalhos({ Accept: 'text/event-stream', 'Content-Type': 'application/json' }),
        body: JSON.stringify(corpo === undefined ? {} : corpo),
        signal: sinal,
        cache: 'no-store',
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw new ErroApi(Rede.mensagem(0, online()), { status: 0 });
    }
    if (!resposta.ok) throw await lerErro(resposta);
    if (!resposta.body) throw new ErroApi('O servidor respondeu de um jeito que eu não entendi. Tente de novo.', { status: resposta.status });
    return resposta;
  }

  /** Arquivo para baixar (CSV): { blob, nome }. O login vai no cabeçalho, por isso não dá para ser um link simples. */
  async function baixar(caminho) {
    let resposta;
    try {
      resposta = await pedir(base + String(caminho).replace(/^[/]+/, ''), { method: 'GET', headers: await cabecalhos({ Accept: '*/*' }), cache: 'no-store' });
    } catch {
      throw new ErroApi(Rede.mensagem(0, online()), { status: 0 });
    }
    if (!resposta.ok) throw await lerErro(resposta);
    const disposicao = resposta.headers.get('Content-Disposition') || '';
    const m = /filename="?([^";]+)"?/i.exec(disposicao);
    return { blob: await resposta.blob(), nome: m ? m[1] : 'arquivo' };
  }

  /** Leitura (GET): tenta de novo sozinha enquanto o servidor acorda. */
  async function ler(caminho) {
    let esperou = false;
    try {
      const dados = await Rede.comNovasTentativas(() => umaVez('GET', caminho), {
        dormir,
        aoEsperar: (ms, tentativa) => { esperou = true; if (aoEsperar) aoEsperar(ms, tentativa); },
      });
      if (esperou && aoVoltar) aoVoltar(null);
      return dados;
    } catch (erro) {
      if (esperou && aoVoltar) aoVoltar(erro);
      throw erro;
    }
  }

  /** Gravação (POST): uma tentativa só. */
  const gravar = (caminho, corpo) => umaVez('POST', caminho, corpo === undefined ? {} : corpo);

  /** Apagar (DELETE): uma tentativa só, como a gravação. */
  const apagar = (caminho) => umaVez('DELETE', caminho);

  return { ler, gravar, apagar, fluxo, baixar };
}

/**
 * Leitor com memória curta: trocar de tela e voltar não busca tudo de novo, e uma
 * atualização segura a tela anterior no lugar (sem piscar esqueleto).
 */
export function criarLeitor(api, { validade = 60000, agora = () => Date.now() } = {}) {
  const guardado = new Map();   // caminho → { dados, em }
  return {
    espiar: (caminho) => guardado.get(caminho) || null,
    async ler(caminho, { forcar = false } = {}) {
      const tem = guardado.get(caminho);
      if (tem && !forcar && agora() - tem.em < validade) return { ...tem, daMemoria: true };
      const dados = await api.ler(caminho);
      const novo = { dados, em: agora() };
      guardado.set(caminho, novo);
      if (guardado.size > 40) guardado.delete(guardado.keys().next().value);
      return { ...novo, daMemoria: false };
    },
    /** Depois de uma gravação: o que começa com estes prefixos precisa ser buscado de novo. */
    esquecer(...prefixos) {
      for (const chave of [...guardado.keys()]) if (!prefixos.length || prefixos.some((p) => chave.startsWith(p))) guardado.delete(chave);
    },
  };
}
