/* Rodada 18: contas da "casa em ordem". Funções puras, sem DOM:
   rodam no navegador (window.CrmR18), no servidor (lib/rodada18.js), no servidor de mentira e nos testes.
   1. Tarefas atrasadas em lote: concluir, passar para hoje/amanhã ou para outra pessoa, com desfazer.
   2. Contatos "Agendado" sem horário na Agenda. Nada é apagado. */
(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.CrmR18 = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const DIA = 864e5, HORA = 3600e3, FUSO = 3 * HORA;          // São Paulo, sem horário de verão (-03:00)
  const ACOES = ['concluir', 'hoje', 'amanha', 'reatribuir'];
  const MAX_LOTE = 300;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ehUuid = v => typeof v === 'string' && UUID.test(v);
  const ms = v => { const t = Date.parse(v); return Number.isFinite(t) ? t : NaN; };
  const n = (q, um, varios) => `${q} ${q === 1 ? um : varios}`;

  /** Meia-noite (em ms UTC) do dia de São Paulo que contém `t`, deslocado `mais` dias. */
  function inicioDiaBrt(t, mais = 0) {
    const d = new Date(t - FUSO);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + mais) + FUSO;
  }
  /**
   * Novo prazo de "passar para hoje" (18h; depois das 17h, daqui a 1 hora, arredondado
   * para o quarto de hora e no máximo 23h45) e "passar para amanhã" (9h).
   */
  function novoPrazo(acao, agora = Date.now()) {
    const hoje = inicioDiaBrt(agora);
    if (acao === 'amanha') return new Date(hoje + DIA + 9 * HORA).toISOString();
    if (acao !== 'hoje') return null;
    const seis = hoje + 18 * HORA;
    if (agora <= seis - HORA) return new Date(seis).toISOString();
    const q = 15 * 60e3, t = Math.ceil((agora + HORA) / q) * q;
    return new Date(Math.min(t, hoje + DIA - q)).toISOString();
  }
  /** "18h" / "9h" / "21h15" no fuso de São Paulo. */
  function horaCurta(iso) {
    const t = ms(iso); if (!Number.isFinite(t)) return '';
    const d = new Date(t - FUSO), h = d.getUTCHours(), m = d.getUTCMinutes();
    return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  }
  /** Dias inteiros de atraso (0 = venceu hoje mais cedo). */
  function diasAtraso(vence, agora = Date.now()) {
    const t = ms(vence); if (!Number.isFinite(t) || t >= agora) return 0;
    return Math.max(0, Math.round((inicioDiaBrt(agora) - inicioDiaBrt(t)) / DIA));
  }
  const atrasada = (t, agora = Date.now()) => !!t && t.status === 'aberta' && Number.isFinite(ms(t.vence_em)) && ms(t.vence_em) < agora;
  /** Mesma regra do servidor (lib/tarefas.js): gestor, quem cuida, quem criou ou tarefa sem dono. */
  const podeMexerTarefa = (t, quem, gestor) => !!t && !!quem && (!!gestor || t.responsavel_id === quem.id || t.criado_por === quem.id || !t.responsavel_id);

  /** Atrasadas mais antigas primeiro; depois prioridade (3 = urgente) e título. */
  function ordenarAtrasadas(lista) {
    return [...(lista || [])].sort((a, b) => ms(a.vence_em) - ms(b.vence_em) || (Number(b.prioridade) || 2) - (Number(a.prioridade) || 2) || String(a.titulo).localeCompare(String(b.titulo), 'pt-BR'));
  }
  /** Quantas por pessoa (null = sem responsável), maior primeiro. nomes: Map(id -> nome). */
  function porPessoa(lista, nomes = new Map()) {
    const m = new Map();
    for (const t of lista || []) { const k = t.responsavel_id || null; m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].map(([id, total]) => ({ id, nome: id ? (nomes.get(id) || 'Alguém da equipe') : 'Sem responsável', total }))
      .sort((a, b) => b.total - a.total || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  }

  /** Confere o pedido do lote. Devolve {acao, ids, responsavel_id} ou {erro}. */
  function validarLote(b) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return { erro: 'Pedido inválido.' };
    if (!ACOES.includes(b.acao)) return { erro: 'Ação inválida (concluir, hoje, amanha ou reatribuir).' };
    const ids = Array.isArray(b.ids) ? b.ids : [];
    if (!ids.length || ids.length > MAX_LOTE) return { erro: `Escolha de 1 a ${MAX_LOTE} tarefas por vez.` };
    const vistos = new Set();
    for (const id of ids) { if (!ehUuid(id) || vistos.has(id)) return { erro: 'Lista com tarefa inválida ou repetida.' }; vistos.add(id); }
    if (b.acao === 'reatribuir' && !ehUuid(b.responsavel_id)) return { erro: 'Escolha para quem passar as tarefas.' };
    return { acao: b.acao, ids, responsavel_id: b.acao === 'reatribuir' ? b.responsavel_id : null };
  }
  /** O que muda em uma tarefa (o "depois"). */
  function mudanca(acao, t, { agora = Date.now(), para = null } = {}) {
    if (acao === 'concluir') return { status: 'feita' };
    if (acao === 'hoje' || acao === 'amanha') return { vence_em: novoPrazo(acao, agora) };
    if (acao === 'reatribuir') return { responsavel_id: para };
    return null;
  }
  /** Por que esta tarefa fica de fora do lote (ou null se pode). */
  function motivoFora(t, acao, quem, gestor, { para = null } = {}) {
    if (!t) return 'não existe mais';
    if (t.status !== 'aberta') return 'já foi fechada';
    if (!podeMexerTarefa(t, quem, gestor)) return 'é de colega';
    if (acao === 'reatribuir' && t.responsavel_id === para) return 'já é dessa pessoa';
    return null;
  }
  const foto = t => ({ status: t.status, vence_em: t.vence_em ?? null, responsavel_id: t.responsavel_id ?? null });
  const mesmoInstante = (a, b) => (a == null && b == null) || (a != null && b != null && ms(a) === ms(b));
  /** Desfazer só vale se a tarefa continua exatamente como o lote deixou. */
  function aindaComoDepois(atual, depois) {
    if (!atual || !depois) return false;
    return atual.status === depois.status && mesmoInstante(atual.vence_em, depois.vence_em) && (atual.responsavel_id ?? null) === (depois.responsavel_id ?? null);
  }
  /** Item de desfazer bem formado (vem da tela: confere antes de usar). */
  function itemDesfazerValido(x) {
    if (!x || !ehUuid(x.id) || !x.antes || !x.depois) return false;
    for (const f of [x.antes, x.depois]) {
      if (!['aberta', 'feita'].includes(f.status)) return false;
      if (f.vence_em != null && !Number.isFinite(ms(f.vence_em))) return false;
      if (f.responsavel_id != null && !ehUuid(f.responsavel_id)) return false;
    }
    return x.antes.status === 'aberta';
  }

  /* ---------- R19: o "antes" de cada tarefa do lote, guardado na auditoria ----------
     A auditoria corta listas em 200 itens e textos em 500 letras: por isso vai em pedaços de 5 tarefas por texto
     ("id,prazo em ms,responsável;…"), e assim cabe um lote inteiro de 300. */
  const JANELA_DESFAZER_MS = 7 * DIA;
  const FOTOS_POR_TEXTO = 5;
  function empacotarFotos(feitos) {
    const partes = (feitos || []).map(f => `${f.id},${Number.isFinite(ms(f.antes.vence_em)) ? ms(f.antes.vence_em) : ''},${f.antes.responsavel_id || ''}`);
    const out = [];
    for (let i = 0; i < partes.length; i += FOTOS_POR_TEXTO) out.push(partes.slice(i, i + FOTOS_POR_TEXTO).join(';'));
    return out;
  }
  /** Map(id -> {status:'aberta', vence_em, responsavel_id}) a partir do que empacotarFotos gravou. */
  function desempacotarFotos(fotos) {
    const m = new Map();
    for (const txt of Array.isArray(fotos) ? fotos : []) for (const parte of String(txt || '').split(';')) {
      const [id, v, resp] = parte.split(',');
      if (!ehUuid(id)) continue;
      m.set(id, { status: 'aberta', vence_em: v && Number.isFinite(Number(v)) ? new Date(Number(v)).toISOString() : null, responsavel_id: ehUuid(resp) ? resp : null });
    }
    return m;
  }
  /** Como a tarefa ficou depois do lote, a partir do "antes" e do que a auditoria diz que foi feito. */
  function depoisDoLote(det, antes) {
    if (!det || !antes) return null;
    if (det.acao === 'concluir') return { status: 'feita', vence_em: antes.vence_em, responsavel_id: antes.responsavel_id };
    if (det.acao === 'hoje' || det.acao === 'amanha') return Number.isFinite(ms(det.vence_em)) ? { status: 'aberta', vence_em: det.vence_em, responsavel_id: antes.responsavel_id } : null;
    if (det.acao === 'reatribuir') return ehUuid(det.para) ? { status: 'aberta', vence_em: antes.vence_em, responsavel_id: det.para } : null;
    return null;
  }
  /**
   * Para cada id pedido, o lote MAIS NOVO (da própria pessoa) em que a tarefa entrou, com o antes e o depois dele.
   * lotes: linhas da auditoria (mais nova primeiro). daTela: Map(id -> item mandado pela tela), usado só nos lotes
   * antigos, que não guardaram as fotos. Tarefa que não está em lote nenhum fica de fora.
   */
  function planosDeDesfazer(ids, lotes, daTela = new Map()) {
    const planos = new Map(), lidos = (lotes || []).map(l => ({ l, d: l.detalhes || {}, fotos: desempacotarFotos((l.detalhes || {}).fotos) }));
    for (const id of ids || []) {
      for (const { l, d, fotos } of lidos) {
        if (fotos.has(id)) { const antes = fotos.get(id), depois = depoisDoLote(d, antes); if (depois) planos.set(id, { lote: l.id, antes, depois }); break; }
        if (!fotos.size && Array.isArray(d.ids) && d.ids.includes(id)) {
          const x = daTela.get(id);
          if (itemDesfazerValido(x)) planos.set(id, { lote: l.id, antes: { status: 'aberta', vence_em: x.antes.vence_em ?? null, responsavel_id: x.antes.responsavel_id ?? null }, depois: foto(x.depois) });
          break;
        }
      }
    }
    return planos;
  }

  /** Pergunta da confirmação, com a contagem antes de gravar. */
  function textoConfirmar(acao, qtd, { agora = Date.now(), nomePara = '' } = {}) {
    const q = n(qtd, 'tarefa atrasada', 'tarefas atrasadas');
    const fim = '\n\nDá para desfazer logo depois. Nada é apagado.';
    if (acao === 'concluir') return `Concluir ${q}?${fim}`;
    if (acao === 'hoje') return `Passar ${q} para hoje, ${horaCurta(novoPrazo('hoje', agora))}?${fim}`;
    if (acao === 'amanha') return `Passar ${q} para amanhã, ${horaCurta(novoPrazo('amanha', agora))}?${fim}`;
    if (acao === 'reatribuir') return `Passar ${q} para ${nomePara || 'outra pessoa'}?${nomePara === 'você' ? '' : ' Ela recebe um aviso de cada uma.'}${fim}`;
    return '';
  }
  /** Frase do resultado (aviso com Desfazer). */
  function textoFeito(acao, qtd, { agora = Date.now(), nomePara = '' } = {}) {
    const q = n(qtd, 'tarefa', 'tarefas');
    if (acao === 'concluir') return `${q} ${qtd === 1 ? 'concluída' : 'concluídas'}`;
    if (acao === 'hoje') return `${q} para hoje, ${horaCurta(novoPrazo('hoje', agora))}`;
    if (acao === 'amanha') return `${q} para amanhã, ${horaCurta(novoPrazo('amanha', agora))}`;
    if (acao === 'reatribuir') return `${q} ${qtd === 1 ? 'passada' : 'passadas'} para ${nomePara || 'outra pessoa'}`;
    return q;
  }

  /**
   * Contatos "Agendado" sem horário futuro na Agenda e sem carro na oficina.
   * sinais = R6.construirSinais(...) (agendamento, patio, entregue). Mais parados primeiro.
   */
  function agendadosSemHorario(leads, sinais, { agora = Date.now() } = {}) {
    const out = [];
    for (const l of leads || []) {
      if (!l || l.status !== 'agendado') continue;
      const s = (sinais || {})[l.id] || {};
      if (s.agendamento || s.patio || s.entregue) continue;
      const t = Math.max(...[l.updated_at, l.created_at].map(ms).filter(Number.isFinite), -Infinity);
      out.push({ id: l.id, nome: l.nome || '', telefone: l.telefone || null, cliente_id: l.cliente_id || null, carro_modelo: l.carro_modelo || null, servico: l.servico || null,
        valor_orcado: Number(l.valor_orcado) || 0, responsavel_id: l.responsavel_id || null,
        dias: Number.isFinite(t) ? Math.max(0, Math.floor((agora - t) / DIA)) : 0, pre_agendamento: !!s.pre_agendamento });
    }
    return out.sort((a, b) => b.dias - a.dias || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  }
  /** Link da Agenda para marcar o horário já com o cliente (parâmetros que a Agenda lê: tel, cliente, novo, nome). */
  function caminhoAgenda(it) {
    const d = String(it && it.telefone || '').replace(/\D/g, '');
    const q = new URLSearchParams();
    if (d.length >= 10) q.set('tel', d);
    if (ehUuid(it && it.cliente_id)) q.set('cliente', it.cliente_id);
    if (![...q.keys()].length) return null;
    q.set('novo', '1');
    if (it.nome) q.set('nome', String(it.nome).replace(/[<>]/g, '').slice(0, 80));
    return '/?' + q.toString();
  }

  return { ACOES, MAX_LOTE, novoPrazo, horaCurta, diasAtraso, atrasada, podeMexerTarefa, ordenarAtrasadas, porPessoa, validarLote, mudanca, motivoFora, foto,
    aindaComoDepois, itemDesfazerValido, empacotarFotos, desempacotarFotos, depoisDoLote, planosDeDesfazer, JANELA_DESFAZER_MS, textoConfirmar, textoFeito, agendadosSemHorario, caminhoAgenda, inicioDiaBrt };
});
