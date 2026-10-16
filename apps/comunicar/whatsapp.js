// -----------------------------------------------------------------------------
// WhatsApp da empresa pelo CodeWords (rodada 5) — a fiação do envio, separada do
// server.js para ser TESTADA com um CodeWords de mentira (scripts/testes-rodada5.mjs).
//
//   • classificarErro(): o que deu errado, em português e em CLASSE —
//       chave_recusada ≠ numero_invalido ≠ instabilidade ≠ sem_aparelho…
//     A classe decide o que o carteiro faz: estrutural para a rodada (todos
//     falhariam igual), definitivo falha de vez, o resto tenta de novo com espera.
//   • criarWhatsApp(): enviar() e status() com a configuração injetada
//     (chave/aparelho vêm do banco: agenda_ia_config + codewords_config).
//   • montarSaude(): o painel "Saúde do WhatsApp" — estado, motivo e o botão
//     que leva ao lugar certo (Atendimento › Configurações › Integrações).
// HTTP 200 do CodeWords NÃO é entrega: só "success" no corpo conta.
// -----------------------------------------------------------------------------
import './public/apps.js';

const LINKS = globalThis.IndyApps.LINKS;
const INTEGRACOES = 'Atendimento › Configurações › Integrações › Chave de API';

/** As classes de erro, com o texto que a equipe lê e o que fazer. */
export const CLASSES = {
  chave_recusada: {
    estrutural: true, definitivo: false, cor: 'vermelho',
    titulo: 'Chave do CodeWords recusada',
    motivo: 'O CodeWords recusou a chave da oficina (401). Nenhuma mensagem sai nem entra até trocar.',
    fazer: `Gere uma chave nova em runtime.codewords.ai e cole em ${INTEGRACOES}. O carteiro volta a mandar sozinho na rodada seguinte.`,
    acao: 'integracoes',
  },
  sem_chave: {
    estrutural: true, definitivo: false, cor: 'vermelho',
    titulo: 'CodeWords sem chave',
    motivo: 'Nenhuma chave do CodeWords está cadastrada.',
    fazer: `Cole a chave em ${INTEGRACOES}.`, acao: 'integracoes',
  },
  sem_aparelho: {
    estrutural: true, definitivo: false, cor: 'vermelho',
    titulo: 'Nenhum WhatsApp conectado',
    motivo: 'O número da oficina não está ligado ao CodeWords.',
    fazer: 'Reconecte o número no Atendimento (ler o QR code com o celular da oficina).', acao: 'integracoes',
  },
  desconectado: {
    estrutural: true, definitivo: false, cor: 'laranja',
    titulo: 'WhatsApp da oficina desconectado',
    motivo: 'O CodeWords conhece o número, mas ele está fora do ar (celular desligado, sem internet ou sessão caída).',
    fazer: 'Ligue o celular da oficina e confira a conexão; se continuar, leia o QR code de novo no Atendimento.', acao: 'integracoes',
  },
  limite: {
    estrutural: false, definitivo: false, cor: 'laranja',
    titulo: 'CodeWords pediu para esperar',
    motivo: 'O CodeWords devolveu "muitas requisições" (429).',
    fazer: 'Nada a fazer: o carteiro espera e tenta de novo com cadência menor.', acao: null,
  },
  numero_invalido: {
    estrutural: false, definitivo: true, cor: 'cinza',
    titulo: 'Número sem WhatsApp',
    motivo: 'O telefone do cliente não existe ou não tem WhatsApp.',
    fazer: 'Confira o número na ficha do cliente (CRM) — tentar de novo não adianta.', acao: 'ficha',
  },
  nao_entregue: {
    estrutural: false, definitivo: false, cor: 'laranja',
    titulo: 'CodeWords não confirmou a entrega',
    motivo: 'O CodeWords respondeu sem "success" (skip ou erro no aparelho).',
    fazer: 'O carteiro tenta de novo com espera crescente (5, 15 e 45 min).', acao: null,
  },
  instabilidade: {
    estrutural: false, definitivo: false, cor: 'laranja',
    titulo: 'Instabilidade no CodeWords',
    motivo: 'O CodeWords demorou demais ou respondeu com erro (5xx/rede).',
    fazer: 'O carteiro tenta de novo com espera crescente (5, 15 e 45 min); se persistir, confira o status do CodeWords.', acao: null,
  },
  desconhecido: {
    estrutural: false, definitivo: false, cor: 'laranja',
    titulo: 'Erro não reconhecido',
    motivo: 'O CodeWords respondeu algo que o Comunicar não conhece.',
    fazer: 'O carteiro tenta de novo; se repetir, mande o texto do erro para quem cuida do sistema.', acao: null,
  },
};
export const ERRO_CHAVE_RECUSADA = `A chave do CodeWords foi recusada (401). Gere uma nova em runtime.codewords.ai e cole em ${INTEGRACOES}.`;

const RE_NUMERO = /inv[aá]lid|not.*(registered|on whatsapp|exist)|n[aã]o (tem|possui|est[aá] no) whatsapp|n[aã]o existe|unknown (number|recipient)|recipient.*not found|phone number.*(invalid|not)/i;
const RE_DESCON = /device (is )?(offline|not connected|disconnected|not logged)|logged ?out|not logged in|no (active )?(device|session|connection)|desconectad|session (closed|expired)|not connected/i;
const RE_REDE = /timeout|timed ?out|abort|ECONN|ENOTFOUND|EAI_AGAIN|fetch failed|network|socket hang up|UND_ERR/i;

/**
 * Classifica o que o CodeWords (ou a rede) devolveu.
 *   { status, texto, erro } → { classe, motivo, estrutural, definitivo, titulo, fazer }
 * `status` = HTTP; `texto` = corpo; `erro` = mensagem interna (sem chave, sem aparelho, exceção).
 */
export function classificarErro({ status = null, texto = '', erro = '' } = {}) {
  const t = String(texto || ''), e = String(erro || '');
  let classe = 'desconhecido';
  if (/sem chave/i.test(e)) classe = 'sem_chave';
  else if (/nenhum whatsapp conectado|sem aparelho/i.test(e)) classe = 'sem_aparelho';
  else if (status === 401 || status === 403 || /recusad|unauthorized|forbidden|invalid (api )?key|api key/i.test(t + ' ' + e)) classe = 'chave_recusada';
  else if (status === 429 || /too many|rate ?limit/i.test(t)) classe = 'limite';
  else if (RE_NUMERO.test(t) || RE_NUMERO.test(e)) classe = 'numero_invalido';
  else if (RE_DESCON.test(t) || RE_DESCON.test(e)) classe = 'desconectado';
  else if ((status !== null && status >= 500) || RE_REDE.test(e) || RE_REDE.test(t)) classe = 'instabilidade';
  else if (status !== null && status >= 200 && status < 300) classe = 'nao_entregue';
  else if (status !== null && status >= 400) classe = 'desconhecido';
  const c = CLASSES[classe];
  const detalhe = (t || e).replace(/\s+/g, ' ').trim().slice(0, 140);
  return {
    classe, estrutural: c.estrutural, definitivo: c.definitivo, titulo: c.titulo, fazer: c.fazer, acao: c.acao,
    motivo: classe === 'chave_recusada' ? ERRO_CHAVE_RECUSADA : `${c.motivo}${detalhe && classe !== 'sem_chave' && classe !== 'sem_aparelho' ? ` (${detalhe})` : ''}`,
  };
}

/** Telefone com DDI para o CodeWords (10/11 dígitos → 55 na frente). */
export function telefoneInternacional(telefone) {
  let num = String(telefone ?? '').replace(/\D/g, '');
  if (num && num.length <= 11) num = '55' + num;
  return num;
}

/**
 * O cliente do WhatsApp. `configWhatsapp(forcar)` devolve { api_key, servico, base, device_id }.
 * `fetchFn` e `relogio` são injetáveis para os testes.
 */
export function criarWhatsApp({ configWhatsapp, fetchFn = (...a) => fetch(...a), timeoutEnvioMs = 20000, timeoutStatusMs = 15000 }) {
  let _cacheStatus = { valor: null, em: 0 };

  async function enviar(telefone, mensagem) {
    const cfg = await configWhatsapp();
    if (!cfg?.api_key) return { ok: false, ...classificarErro({ erro: 'CodeWords sem chave' }), erro: `CodeWords sem chave (${INTEGRACOES}).` };
    if (!cfg?.device_id) return { ok: false, ...classificarErro({ erro: 'Nenhum WhatsApp conectado' }), erro: 'Nenhum WhatsApp conectado — reconecte no painel de atendimento.' };
    const url = `${cfg.base}/run/${cfg.servico}/proxy/send/message?phone_id=${encodeURIComponent(cfg.device_id)}`;
    const body = new URLSearchParams({ phone: telefoneInternacional(telefone), message: mensagem }).toString();
    try {
      const r = await fetchFn(url, {
        method: 'POST',
        headers: { Authorization: cfg.api_key, 'Content-Type': 'application/x-www-form-urlencoded' },
        body, signal: AbortSignal.timeout(timeoutEnvioMs),
      });
      const texto = await r.text();
      let data = {};
      try { data = JSON.parse(texto); } catch { /* resposta sem JSON */ }
      // HTTP 200 não é entrega: o proxy responde 200 com "skip"/"error" (e até "success": false).
      const sucesso = data && typeof data === 'object' && Object.keys(data).length
        ? (data.success === true || /^(success|sent|ok)$/i.test(String(data.status || '')))
        : /success/i.test(texto);
      if (r.ok && sucesso) return { ok: true, status: r.status };
      const c = classificarErro({ status: r.status, texto: data?.message || data?.detail || data?.error || texto });
      const erro = c.classe === 'chave_recusada' ? ERRO_CHAVE_RECUSADA
        : (data?.message || data?.detail || data?.error || `O CodeWords respondeu ${r.status}: ${texto.slice(0, 120)}`);
      return { ok: false, status: r.status, ...c, erro: String(erro) };
    } catch (e) {
      const c = classificarErro({ erro: String(e?.name === 'TimeoutError' ? 'timeout' : (e?.message || e)) });
      return { ok: false, status: 0, ...c, erro: e?.name === 'TimeoutError' ? 'O CodeWords demorou mais de 20 s para responder (timeout).' : String(e?.message || e) };
    }
  }

  /** Situação da conexão (cache de 60 s: a chamada leva até 15 s). */
  async function status(forcar = false) {
    if (!forcar && _cacheStatus.valor && Date.now() - _cacheStatus.em < 60_000) return _cacheStatus.valor;
    const r = await statusAgora(forcar);
    _cacheStatus = { valor: r, em: Date.now() };
    return r;
  }
  async function statusAgora(forcar = false) {
    const cfg = await configWhatsapp(forcar);
    if (!cfg?.api_key) return { ok: false, classe: 'sem_chave', erro: 'CodeWords não configurado.' };
    try {
      const r = await fetchFn(`${cfg.base}/run/${cfg.servico}/connections`, {
        headers: { Authorization: cfg.api_key }, signal: AbortSignal.timeout(timeoutStatusMs),
      });
      if (r.status === 401 || r.status === 403) return { ok: false, chaveRecusada: true, classe: 'chave_recusada', erro: ERRO_CHAVE_RECUSADA };
      if (!r.ok) return { ok: false, classe: r.status === 429 ? 'limite' : 'instabilidade', erro: `O CodeWords respondeu ${r.status}.` };
      const lista = await r.json();
      const minha = (Array.isArray(lista) ? lista : []).find((c) => c.phone_id === cfg.device_id);
      if (!cfg.device_id || !minha) return { ok: true, conectado: false, classe: 'sem_aparelho', aparelhos: Array.isArray(lista) ? lista.length : 0 };
      const viva = /(^|[^a-z])(logged_in|connected|online)([^a-z]|$)/i.test(String(minha.status || '')); // "disconnected" NÃO é conectado
      return viva
        ? { ok: true, conectado: true, numero: minha.phone_number || null }
        : { ok: true, conectado: false, classe: 'desconectado', situacao: String(minha.status || ''), numero: minha.phone_number || null };
    } catch (e) { return { ok: false, classe: 'instabilidade', erro: e?.name === 'TimeoutError' ? 'O CodeWords não respondeu em 15 s.' : String(e?.message || e) }; }
  }

  return { enviar, status, statusAgora, limparCache: () => { _cacheStatus = { valor: null, em: 0 }; } };
}

/** Rótulo curto por classe (telas, CSV, notificações). */
export const ROTULO_CLASSE = Object.fromEntries(Object.entries(CLASSES).map(([k, v]) => [k, v.titulo]));

/**
 * O painel "Saúde do WhatsApp" — PURO.
 *   status      = o que statusWhatsapp devolveu ({ ok, conectado, chaveRecusada, classe, numero, erro })
 *   falhas24h   = { [classe]: { total, ultimoErro, ultimoEm } } (dados.falhasPorClasse)
 *   fila        = { pendentes, atrasados, maisAntigoEm }
 *   carteiro    = { ultimaEm, falhas24h (chamadas 503/tempo), parouPor (aviso da última rodada) }
 *   estadoGravado = { estado, em, motivo } (posvenda_config.whatsapp_*) — vale quando o status não foi lido
 * Devolve { estado, cor, titulo, motivo, fazer, acao, numero, detalhes[], classes[] }.
 */
export function montarSaude({ status = null, falhas24h = {}, fila = {}, carteiro = {}, estadoGravado = null, agora = Date.now() } = {}) {
  const classes = Object.entries(falhas24h || {}).map(([classe, v]) => ({ classe, rotulo: ROTULO_CLASSE[classe] || classe, total: Number(v?.total) || 0, ultimoErro: v?.ultimoErro || null, ultimoEm: v?.ultimoEm || null }))
    .filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
  const detalhes = [];
  const pend = Number(fila.pendentes) || 0, atras = Number(fila.atrasados) || 0;
  if (pend) detalhes.push(`${pend} mensage${pend === 1 ? 'm' : 'ns'} na fila${atras ? ` (${atras} atrasada${atras === 1 ? '' : 's'} há mais de 2 h)` : ''}`);
  if (carteiro.ultimaEm) {
    const min = Math.round((agora - new Date(carteiro.ultimaEm).getTime()) / 60000);
    detalhes.push(min < 1 ? 'carteiro rodou agora' : `carteiro rodou há ${min} min`);
  }
  if (Number(carteiro.falhas24h) > 0) detalhes.push(`${carteiro.falhas24h} chamada(s) do banco encontraram o servidor dormindo nas últimas 24 h`);

  const comPlano = (estado, classe, extra = {}) => {
    const c = CLASSES[classe] || CLASSES.desconhecido;
    const acao = c.acao === 'integracoes' ? { tipo: 'link', alvo: LINKS.integracoes(), rotulo: 'Colar a chave no Atendimento' }
      : c.acao === 'ficha' ? { tipo: 'rota', alvo: 'mensagens', rotulo: 'Ver as que falharam' } : null;
    return { estado, cor: c.cor, titulo: c.titulo, motivo: extra.motivo || c.motivo, fazer: c.fazer, acao, numero: status?.numero || null, detalhes, classes, classe, ...extra };
  };

  // 1. o que a última leitura do CodeWords disse
  if (status?.chaveRecusada || status?.classe === 'chave_recusada') return comPlano('chave_recusada', 'chave_recusada', { motivo: ERRO_CHAVE_RECUSADA });
  if (status?.classe === 'sem_chave') return comPlano('sem_chave', 'sem_chave');
  if (status?.ok && status.conectado) {
    // conectado, mas a fila está travando? (instabilidade recente)
    const inst = classes.find((x) => ['instabilidade', 'nao_entregue', 'limite', 'desconectado'].includes(x.classe));
    if (inst && inst.total >= 3) return comPlano('instavel', inst.classe, { titulo: 'WhatsApp conectado, mas com falhas', motivo: `${inst.total} envios falharam nas últimas 24 h (${inst.rotulo.toLowerCase()}). Último erro: ${inst.ultimoErro || '—'}`, cor: 'laranja' });
    const inv = classes.find((x) => x.classe === 'numero_invalido');
    return { estado: 'ok', cor: 'verde', titulo: 'WhatsApp conectado', motivo: `O número da oficina${status.numero ? ` (${status.numero})` : ''} está conectado e a chave foi aceita.`,
      fazer: inv ? `${inv.total} mensagem(ns) falharam por número sem WhatsApp — confira os telefones em Mensagens › Falharam.` : (pend ? 'A fila sai na cadência configurada (limite por minuto e por hora).' : 'Nada pendente.'),
      acao: inv ? { tipo: 'rota', alvo: 'mensagens', rotulo: 'Ver as que falharam' } : null, numero: status.numero || null, detalhes, classes, classe: null };
  }
  if (status?.ok && status.conectado === false) return comPlano(status.classe === 'sem_aparelho' ? 'sem_aparelho' : 'desconectado', status.classe === 'sem_aparelho' ? 'sem_aparelho' : 'desconectado');
  if (status && status.ok === false) {
    const classe = status.classe === 'limite' ? 'limite' : 'instabilidade';
    return comPlano('sem_resposta', classe, { titulo: 'CodeWords sem resposta agora', motivo: `${CLASSES[classe].motivo} ${status.erro ? `(${status.erro})` : ''}`.trim() });
  }
  // 2. sem leitura ao vivo: o que o carteiro gravou na última tentativa
  if (estadoGravado?.estado && CLASSES[estadoGravado.estado]) return comPlano(estadoGravado.estado, estadoGravado.estado, { motivo: estadoGravado.motivo || CLASSES[estadoGravado.estado].motivo, gravadoEm: estadoGravado.em });
  return { estado: 'desconhecido', cor: 'cinza', titulo: 'WhatsApp: ainda verificando', motivo: 'O Comunicar ainda não conseguiu falar com o CodeWords nesta sessão.', fazer: 'Espere um instante ou clique em "Conferir agora".', acao: null, numero: null, detalhes, classes, classe: null };
}
