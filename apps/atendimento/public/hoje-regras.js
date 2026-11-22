/* ============================================================
   IndyCar Atendimento · hoje-regras.js (Rodada 13, 22/11/2026)
   Regras PURAS da tela de entrada "Hoje" (sem rede, sem DOM). Carregado no navegador (window.Hoje) e no Node.
     · fraseDeHoje: a frase grande do resumo, com os números marcados
     · chegadasPorHora: as conversas que chegaram hoje, hora a hora (o gráfico pequeno)
     · atenderAgora: quem atender primeiro, a partir da fila já pontuada (r6-regras.js)
   Testado em test/r13-hoje.test.js.
   ============================================================ */
(function (raiz) {
  'use strict';
  const n = (v) => Math.max(0, Math.floor(Number(v) || 0));
  const plural = (q, um, varios) => (q === 1 ? um : varios);

  /** Hora (0 a 23) e dia (AAAA-MM-DD) de um instante no fuso da oficina (São Paulo, UTC-3 fixo). */
  function horaSP(ts) {
    const ms = typeof ts === 'number' ? ts : Date.parse(ts);
    if (!Number.isFinite(ms)) return null;
    const d = new Date(ms - 3 * 3600_000);
    return { dia: d.toISOString().slice(0, 10), hora: d.getUTCHours() };
  }

  /**
   * A frase grande do topo. Devolve pedaços: { t: 'texto' } ou { n: número } (o número sai em destaque).
   * Só entra o que tem número; sem nada para fazer, diz que está tudo em dia.
   */
  function fraseDeHoje(c = {}) {
    const novos = n(c.novos), esperando = n(c.esperando), naMesa = n(c.naMesa), naoLidas = n(c.naoLidas);
    const partes = [];
    if (novos) partes.push([{ t: plural(novos, 'chegou ', 'chegaram ') }, { n: novos }, { t: plural(novos, ' conversa nova', ' conversas novas') }]);
    if (esperando) partes.push([{ n: esperando }, { t: plural(esperando, ' cliente espera resposta', ' clientes esperam resposta') }]);
    else if (naoLidas) partes.push([{ n: naoLidas }, { t: plural(naoLidas, ' conversa está sem ler', ' conversas estão sem ler') }]);
    if (naMesa) partes.push([{ n: naMesa }, { t: plural(naMesa, ' orçamento está na mesa', ' orçamentos estão na mesa') }]);
    if (!partes.length) return [{ t: 'Hoje está tudo em dia: ninguém esperando resposta.' }];
    // "Hoje chegaram 3…" quando tem conversa nova; senão "Hoje, 2 clientes…".
    const out = [{ t: novos ? 'Hoje ' : 'Hoje, ' }];
    partes.forEach((p, i) => {
      if (i > 0) out.push({ t: i === partes.length - 1 ? ' e ' : ', ' });
      out.push(...p);
    });
    out.push({ t: '.' });
    return out;
  }
  /** A frase em texto corrido (leitor de tela, título, testes). */
  const fraseEmTexto = (pedacos) => pedacos.map((p) => (p.n !== undefined ? String(p.n) : p.t)).join('');

  /**
   * Conversas que chegaram HOJE, hora a hora. Mostra pelo menos das 7h às 19h (o horário da oficina) e estica se
   * alguém chegou antes ou depois. Devolve { horas: [{ hora, total }], total, pico }.
   */
  function chegadasPorHora(instantes = [], agora = Date.now()) {
    const hoje = horaSP(agora)?.dia;
    const conta = new Map();
    let total = 0;
    for (const ts of instantes) {
      const h = horaSP(ts);
      if (!h || h.dia !== hoje) continue;
      conta.set(h.hora, (conta.get(h.hora) || 0) + 1);
      total++;
    }
    const usadas = [...conta.keys()];
    const de = Math.min(7, ...usadas), ate = Math.max(19, ...usadas);
    const horas = [];
    for (let h = de; h <= ate; h++) horas.push({ hora: h, total: conta.get(h) || 0 });
    const pico = horas.reduce((m, x) => (x.total > m.total ? x : m), { hora: null, total: 0 });
    return { horas, total, pico: pico.total ? pico : null };
  }

  const SELO = { agora: { rotulo: 'Agora', tom: 'ruim' }, logo: { rotulo: 'Logo', tom: 'atencao' }, hoje: { rotulo: 'Hoje', tom: 'neutro' } };

  /**
   * Quem atender primeiro: as conversas da fila pontuada (r6-regras.js: [{ c, p }]) que pedem resposta,
   * sem as de colega (quando não é gestor), na ordem da fila. Cada uma vem com o motivo curto e o selo.
   */
  function atenderAgora(marcadas = [], { meuId = null, gestor = false, limite = 4 } = {}) {
    const out = [];
    for (const m of marcadas) {
      if (!m || !m.c || !m.p || m.p.fora || !SELO[m.p.nivel]) continue;
      if (!gestor && m.c.atribuida_a && meuId && m.c.atribuida_a !== meuId) continue;
      const motivo = (m.p.motivos || [])[0];
      out.push({ id: m.c.id, nome: m.c.nome || '', telefone: m.c.telefone || '', nivel: m.p.nivel, selo: SELO[m.p.nivel],
        motivo: motivo ? String(motivo.texto || '') : '' });
      if (out.length >= limite) break;
    }
    return out;
  }

  const Hoje = { horaSP, fraseDeHoje, fraseEmTexto, chegadasPorHora, atenderAgora, SELO };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hoje;
  else raiz.Hoje = Hoje;
})(typeof window !== 'undefined' ? window : globalThis);
