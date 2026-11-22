/* ============================================================================
   Resumo do HOJE da Agenda (rodada 13) — regras PURAS (sem DOM, sem banco).
   Carregado antes do app.js no navegador (window.HojeResumo) e importado pelos
   testes no Node (globalThis.HojeResumo). Monta a frase grande do topo, os
   quatro números e o gráfico de horários por hora, no molde do herói do Tráfego.
   ============================================================================ */
(function (root) {
  'use strict';

  /* Mesma regra de public/app.js › grupoDoDia e de dados.js › estatisticas():
     o STATUS explícito manda antes do bit compareceu. Mudou lá? Muda aqui. */
  function grupo(a) {
    if (['aguardando', 'confirmado'].includes(a.status) && a.compareceu !== 1) return 'vem';
    if (['concluido', 'nao_fechou'].includes(a.status)) return 'chegou';
    if (['nao_veio', 'cancelado'].includes(a.status)) return 'faltou';
    if (a.compareceu === 1 || ['compareceu', 'em_atendimento'].includes(a.status)) return 'chegou';
    if (a.compareceu === 0) return 'faltou';
    return 'vem';
  }

  const minutos = (hm) => { const x = /^(\d{1,2}):(\d{2})/.exec(String(hm || '')); return x ? Number(x[1]) * 60 + Number(x[2]) : null; };

  /** Os números do dia. Cancelado não conta como horário (não ia acontecer). */
  function resumo(lista, agoraHm) {
    const dia = (lista || []).filter((a) => a && a.status !== 'cancelado');
    const r = { total: dia.length, chegaram: 0, vem: 0, faltaram: 0, atrasados: 0, confirmados: 0 };
    const agora = minutos(agoraHm);
    for (const a of dia) {
      const g = grupo(a);
      if (g === 'chegou') r.chegaram++;
      else if (g === 'faltou') r.faltaram++;
      else {
        r.vem++;
        if (a.confirmado || a.status === 'confirmado') r.confirmados++;
        const m = minutos(a.hora);
        if (agora != null && m != null && m < agora - 10) r.atrasados++;
      }
    }
    const pct = (n) => (r.total ? Math.round((n / r.total) * 100) : 0);
    r.pctChegaram = pct(r.chegaram);
    r.pctFaltaram = pct(r.faltaram);
    return r;
  }

  const plural = (n, um, varios) => (n === 1 ? um : varios);
  const juntar = (partes) => (partes.length <= 1 ? partes.join('') : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`);

  /** A frase do topo em pedaços: { t } é texto e { n } é número (vai em vermelho grande). */
  function frase(r, o = {}) {
    if (!r.total) {
      return o.fechado
        ? [{ t: 'Hoje a oficina não abre. ' }, { t: 'Nenhum horário marcado.' }]
        : [{ t: 'Nenhum horário marcado para hoje ainda.' }];
    }
    const out = [{ t: 'Hoje ' + plural(r.total, 'é ', 'são ') }, { n: r.total }, { t: plural(r.total, ' horário', ' horários') }];
    const partes = [];
    if (r.chegaram) partes.push([{ n: r.chegaram }, { t: plural(r.chegaram, ' já chegou', ' já chegaram') }]);
    if (r.vem) partes.push([{ n: r.vem }, { t: plural(r.vem, ' ainda vem', ' ainda vêm') }]);
    if (r.faltaram) partes.push([{ n: r.faltaram }, { t: plural(r.faltaram, ' não veio', ' não vieram') }]);
    if (!partes.length) return [...out, { t: '.' }];
    out.push({ t: ': ' });
    partes.forEach((p, i) => {
      if (i > 0) out.push({ t: i === partes.length - 1 ? ' e ' : ', ' });
      out.push(...p);
    });
    out.push({ t: '.' });
    return out;
  }
  /** A mesma frase em texto corrido (leitor de tela, título, testes). */
  const fraseTexto = (r, o) => frase(r, o).map((p) => (p.n != null ? String(p.n) : p.t)).join('');

  /** Horários por hora cheia, separados em chegou / vem / faltou. Vai de 8 h às 17 h e
      estica se houver horário fora disso. */
  function porHora(lista) {
    const dia = (lista || []).filter((a) => a && a.status !== 'cancelado' && minutos(a.hora) != null);
    const horas = dia.map((a) => Math.floor(minutos(a.hora) / 60));
    const de = Math.min(8, ...horas), ate = Math.max(17, ...horas);
    const barras = [];
    for (let h = de; h <= ate; h++) barras.push({ h, chegou: 0, vem: 0, faltou: 0, total: 0 });
    for (const a of dia) {
      const b = barras[Math.floor(minutos(a.hora) / 60) - de];
      b[grupo(a)]++; b.total++;
    }
    const maximo = Math.max(1, ...barras.map((b) => b.total));
    return { de, ate, barras, maximo };
  }

  root.HojeResumo = Object.freeze({ grupo, resumo, frase, fraseTexto, porHora, juntar });
})(typeof globalThis !== 'undefined' ? globalThis : window);
