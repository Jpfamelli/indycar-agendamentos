/* ============================================================
   IndyCar Atendimento — r7-regras.js (Rodada 7 · C4, 25/10/2026)
   Regras PURAS da segunda rodada do Atendimento (sem rede, sem DOM). Carregado no navegador (window.R7) e no Node.
     · links que levam o cliente de uma conversa para os outros sistemas já preenchidos
       (entrada no Pátio, nova cotação no Orçador, Minha IndyCar do cliente)
     · horários reais da Agenda (dias com vagas, períodos, escolha do consultor)
     · serviços citados pelo cliente → texto do pedido do orçamento
     · a retomada do WhatsApp: textos e contagens que a tela mostra
   Testado em test/r7c4-links.test.js e test/r7c4-horarios.test.js.
   ============================================================ */
(function (raiz) {
  'use strict';
  const R6 = raiz.R6 || (typeof require !== 'undefined' ? require('./r6-regras.js') : null);
  const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const soDigitos = (t) => String(t ?? '').replace(/\D/g, '');
  const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const limpar = (t, max) => String(t ?? '').replace(/[\p{C}<>{}\\]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const BASE_PATIO = 'https://indycar-patio.netlify.app';
  const BASE_ORCADOR = 'https://indycar-orcador.netlify.app';
  const ehUuid = (v) => RE_UUID.test(String(v || ''));
  const placaValida = (p) => /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p);
  const normPlaca = (p) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const telE164 = (t) => { let d = soDigitos(t); if (/^\d{10,11}$/.test(d)) d = '55' + d; return /^55\d{10,11}$/.test(d) ? d : ''; };

  /* ---------------- 1) Entrada no Pátio ----------------
     Contrato do Pátio (indycar-patio/app/js/conexoes.js + entrada-r7.js):
       /?entrada=1&orcamento=&agendamento=&cliente=&tel=&nome=&placa=&carro=&servico=&lead=&conversa=&origem=&queixa=
     Só vai o que é válido; o Pátio descarta o resto e tira os dados da barra de endereço depois de ler. */
  function linkEntradaPatio(d = {}, base = BASE_PATIO) {
    const p = new URLSearchParams();
    p.set('entrada', '1');
    let temAlgo = false;
    for (const [param, chave] of [['orcamento', 'orcamentoId'], ['agendamento', 'agendamentoId'], ['cliente', 'clienteId'], ['lead', 'leadId'], ['conversa', 'conversaId'], ['os', 'osId']]) {
      if (ehUuid(d[chave])) { p.set(param, d[chave].toLowerCase()); temAlgo = true; }
    }
    const tel = telE164(d.telefone);
    if (tel) { p.set('tel', tel); temAlgo = true; }
    const nome = limpar(R6 ? R6.nomeSeguro(d.nome, 80) : d.nome, 80);
    if (nome && nome !== '(nome oculto)') p.set('nome', nome);
    const placa = normPlaca(d.placa);
    if (placaValida(placa)) { p.set('placa', placa); temAlgo = true; }
    const carro = limpar(d.carro || d.veiculo, 80);
    if (carro) p.set('carro', carro);
    const servico = limpar(d.servico, 200);
    if (servico) p.set('servico', servico);
    const queixa = limpar(d.queixa, 300);
    if (queixa) p.set('queixa', queixa);
    p.set('origem', 'atendimento');
    if (!temAlgo) return null;
    return `${String(base).replace(/\/+$/, '')}/?${p.toString()}`;
  }

  /* ---------------- 2) Nova cotação COMPLETA no Orçador ----------------
     Contrato do Orçador (web/src/telas/cotacao/entrada.ts): #/cotacao?origem=&conversa=&lead=&agendamento=&os=&placa=&carro=&ano=&pedido=&ia=1
     O telefone, o nome e o cliente seguem pelo contrato antigo (?tel= ?nome= ?cliente=). */
  function linkNovaCotacaoCompleta(d = {}, { ia = false, base = BASE_ORCADOR } = {}) {
    const p = new URLSearchParams();
    p.set('origem', 'atendimento');
    for (const [param, chave] of [['conversa', 'conversaId'], ['lead', 'leadId'], ['agendamento', 'agendamentoId'], ['os', 'osId'], ['cliente', 'clienteId']]) {
      if (ehUuid(d[chave])) p.set(param, d[chave].toLowerCase());
    }
    const tel = telE164(d.telefone);
    if (tel) p.set('tel', tel);
    const nome = limpar(R6 ? R6.nomeSeguro(d.nome, 80) : d.nome, 80);
    if (nome && nome !== '(nome oculto)') p.set('nome', nome);
    const placa = normPlaca(d.placa);
    if (placaValida(placa)) p.set('placa', placa);
    const carro = limpar(d.carro || d.veiculo, 80);
    if (carro) p.set('carro', carro);
    const ano = Number(d.ano);
    if (Number.isInteger(ano) && ano >= 1950 && ano <= new Date().getFullYear() + 1) p.set('ano', String(ano));
    const km = Number(String(d.km ?? '').replace(/\D/g, ''));
    if (Number.isInteger(km) && km > 0 && km <= 999999) p.set('km', String(km));
    const pedido = limpar(d.pedido || d.servico, 600);
    if (pedido) p.set('pedido', pedido);
    if (ia && pedido) p.set('ia', '1');
    if (!p.has('conversa') && !p.has('tel') && !p.has('lead') && !p.has('agendamento')) return null;
    return `${String(base).replace(/\/+$/, '')}/#/cotacao?${p.toString()}`;
  }

  /* ---------------- 2b) Marcador [OS NNN] da página Acompanhar ----------------
     O cliente abre o WhatsApp pela página Acompanhar e a mensagem começa com "[OS 414]". Só vale o NÚMERO (1 a 6 dígitos),
     só no começo da mensagem, e só liga a ordem se o telefone da OS for o mesmo da conversa (confere em r7-dados). */
  function marcadorOS(texto) {
    const m = /^\s*\[\s*OS\s*#?\s*(\d{1,6})\s*\]/i.exec(String(texto ?? '').slice(0, 40));
    return m ? Number(m[1]) : null;
  }
  /** Mesmo telefone? compara os últimos 10 dígitos (DDD + número), ignora 55 e o nono dígito faltando. */
  function mesmoTelefone(a, b) {
    const x = soDigitos(a), y = soDigitos(b);
    if (x.length < 10 || y.length < 10) return false;
    const ddd = (d) => (d.length >= 12 && d.startsWith('55') ? d.slice(2, 4) : d.slice(0, 2));
    return x.slice(-8) === y.slice(-8) && ddd(x) === ddd(y);
  }

  /* ---------------- 3) Serviços que o cliente citou ---------------- */
  const PALAVRAS_FRACAS = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'com', 'para', 'por', 'em', 'no', 'na', 'a', 'o', 'um', 'uma', 'completo', 'completa', 'geral', 'basico', 'basica']);
  const tokensDe = (nome) => semAcento(nome).split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !PALAVRAS_FRACAS.has(t));
  const raiz4 = (t) => t.slice(0, Math.max(4, t.length - 2));
  /** Dos nomes do catálogo, quais aparecem no que o cliente escreveu (todas as palavras fortes do nome, pela raiz). Até 3, os mais específicos primeiro. */
  function servicosCitados(textos, nomes = []) {
    const t = semAcento((Array.isArray(textos) ? textos : [textos]).join(' '));
    if (!t.trim()) return [];
    const palavrasTexto = t.split(/[^a-z0-9]+/).filter(Boolean);
    const tem = (tok) => palavrasTexto.some((w) => w.startsWith(raiz4(tok)) || raiz4(tok).startsWith(w.slice(0, Math.max(4, w.length - 2))) && w.length >= 4);
    const achados = [];
    for (const nome of nomes) {
      const toks = tokensDe(nome);
      if (!toks.length) continue;
      if (toks.every(tem)) achados.push({ nome, forca: toks.length });
    }
    achados.sort((a, b) => b.forca - a.forca);
    // se "Troca de óleo do motor" e "Troca de óleo" casam, fica só o mais específico
    const out = [];
    for (const a of achados) {
      const tk = new Set(tokensDe(a.nome));
      if (out.some((o) => { const ok = tokensDe(o); return [...tk].every((x) => ok.includes(x)); })) continue;
      out.push(a.nome);
      if (out.length >= 3) break;
    }
    return out;
  }
  /** Qual item da lista de serviços (select) combina com o texto — para o Agendar já vir com o serviço escolhido. */
  function melhorServico(alvo, itens = []) {
    const a = semAcento(alvo).trim();
    if (!a) return null;
    let melhor = null, pontos = 0;
    for (const it of itens) {
      const n = semAcento(it.nome);
      let s = 0;
      if (n === a) s = 100;
      else if (n.includes(a) || a.includes(n)) s = 60;
      else { const toks = tokensDe(it.nome); const hit = toks.filter((tk) => a.includes(raiz4(tk))).length; s = toks.length ? Math.round(40 * hit / toks.length) : 0; }
      if (s > pontos) { pontos = s; melhor = it; }
    }
    return pontos >= 40 ? melhor : null;
  }

  /* ---------------- 4) Horários reais da Agenda ---------------- */
  const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  function partesSP(d) {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
    const g = (t) => f.find((x) => x.type === t).value;
    return { dia: `${g('year')}-${g('month')}-${g('day')}`, min: (Number(g('hour')) % 24) * 60 + Number(g('minute')) };
  }
  const somarDias = (dia, n) => { const d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const diaDaSemana = (dia) => new Date(dia + 'T12:00:00Z').getUTCDay();
  /** "seg 26/10" */
  function rotuloDia(dia) { const [, m, d] = String(dia).split('-'); return `${DIAS_CURTOS[diaDaSemana(dia)]} ${d}/${m}`; }
  /** Os próximos dias em que a oficina abre (sem domingo), começando em hoje se ainda dá tempo (até 16h30). */
  function proximosDiasUteis(agora = new Date(), n = 5) {
    const { dia, min } = partesSP(agora);
    const out = [];
    let d = min <= 16 * 60 + 30 && diaDaSemana(dia) !== 0 ? dia : somarDias(dia, 1);
    while (out.length < n) { if (diaDaSemana(d) !== 0) out.push(d); d = somarDias(d, 1); }
    return out;
  }
  const periodoDaHora = (hora) => { const h = Number(String(hora).slice(0, 2)); return h < 12 ? 'manhã' : 'tarde'; };
  /**
   * Resposta de `agenda_horarios_livres` de vários dias → dias com vagas, só do futuro (hoje: a partir de 1 h depois de agora).
   * entrada: [{ data, aberto, motivo, horarios:[{hora,fim,livres,consultores_livres}], capacidade, duracao_min }]
   */
  function resumirDias(dias = [], agora = new Date(), { antecedenciaMin = 60 } = {}) {
    const { dia: hoje, min: agoraMin } = partesSP(agora);
    return dias.filter(Boolean).map((d) => {
      const horarios = (d.horarios || []).filter((h) => Number(h.livres) > 0)
        .filter((h) => d.data > hoje || (d.data === hoje && Number(String(h.hora).slice(0, 2)) * 60 + Number(String(h.hora).slice(3, 5)) >= agoraMin + antecedenciaMin))
        .map((h) => ({ hora: String(h.hora).slice(0, 5), fim: String(h.fim || '').slice(0, 5), livres: Number(h.livres) || 0, periodo: periodoDaHora(h.hora), consultores_livres: Array.isArray(h.consultores_livres) ? h.consultores_livres.filter(ehUuid) : [] }));
      return { data: d.data, rotulo: rotuloDia(d.data), aberto: d.aberto !== false, motivo: d.motivo || null, total: horarios.length, duracao_min: d.duracao_min || null,
        manha: horarios.filter((h) => h.periodo === 'manhã'), tarde: horarios.filter((h) => h.periodo === 'tarde') };
    });
  }
  /** Duas opções para oferecer: de preferência dias diferentes e períodos diferentes (regra da casa). */
  function duasOpcoes(dias = []) {
    const comVaga = dias.filter((d) => d.total > 0);
    if (!comVaga.length) return [];
    const primeiro = comVaga[0];
    const a = (primeiro.manha[0] || primeiro.tarde[0]);
    const outroDia = comVaga.slice(1).find((d) => d.total > 0);
    let b = null;
    if (outroDia) b = (a.periodo === 'manhã' ? (outroDia.tarde[0] || outroDia.manha[0]) : (outroDia.manha[0] || outroDia.tarde[0])), b && (b = { ...b, data: outroDia.data, rotulo: outroDia.rotulo });
    if (!b) { const oposto = a.periodo === 'manhã' ? primeiro.tarde[0] : primeiro.manha[0]; if (oposto) b = { ...oposto, data: primeiro.data, rotulo: primeiro.rotulo }; }
    return [{ ...a, data: primeiro.data, rotulo: primeiro.rotulo }, ...(b ? [b] : [])];
  }
  const textoOpcao = (o) => `${o.rotulo.replace(/^(\S+) /, (_, d) => ({ seg: 'segunda', ter: 'terça', qua: 'quarta', qui: 'quinta', sex: 'sexta', 'sáb': 'sábado', dom: 'domingo' })[d] + ', ')} às ${o.hora.replace(/^0/, '').replace(':00', 'h').replace(/:(\d\d)/, 'h$1')}`;
  /** O horário escolhido ainda tem vaga? { livre, motivo, alternativas } — usado antes de gravar. */
  function conferirEscolha(diaResumo, hora) {
    if (!diaResumo) return { livre: false, motivo: 'sem_dados' };
    if (!diaResumo.aberto) return { livre: false, motivo: diaResumo.motivo === 'domingo' ? 'domingo' : 'fechado' };
    const h = [...diaResumo.manha, ...diaResumo.tarde].find((x) => x.hora === String(hora).slice(0, 5));
    if (h) return { livre: true, vagas: h.livres, consultores_livres: h.consultores_livres };
    return { livre: false, motivo: 'ocupado', alternativas: [...diaResumo.manha, ...diaResumo.tarde].slice(0, 4).map((x) => x.hora) };
  }

  /* ---------------- 5) Retomada do WhatsApp: textos da tela ---------------- */
  function textoResumoRetomada(p = {}) {
    const e = p.enviar?.length ?? p.enviar ?? 0, r = p.revisar?.length ?? p.revisar ?? 0, x = p.pular?.length ?? p.pular ?? 0;
    const partes = [];
    if (e) partes.push(`${e} pode${e > 1 ? 'm' : ''} sair agora`);
    if (r) partes.push(`${r} precisa${r > 1 ? 'm' : ''} do seu olho`);
    if (x) partes.push(`${x} fica${x > 1 ? 'm' : ''} de fora`);
    return partes.join(' · ') || 'Nada esperando.';
  }
  function textoDuracaoParado(min) {
    if (min == null || !Number.isFinite(min)) return '';
    if (min < 2) return 'há instantes';
    if (min < 60) return `há ${Math.round(min)} min`;
    if (min < 1440) return `há ${Math.round(min / 60)} h`;
    const d = Math.floor(min / 1440), h = Math.round((min % 1440) / 60);
    return `há ${d} dia${d > 1 ? 's' : ''}${h ? ` e ${h} h` : ''}`;
  }

  raiz.R7 = { linkEntradaPatio, linkNovaCotacaoCompleta, marcadorOS, mesmoTelefone, servicosCitados, melhorServico, rotuloDia, proximosDiasUteis, resumirDias, duasOpcoes, textoOpcao, conferirEscolha,
    periodoDaHora, textoResumoRetomada, textoDuracaoParado, partesSP, somarDias, telE164, ehUuid, BASE_PATIO, BASE_ORCADOR };
  if (typeof module !== 'undefined' && module.exports) module.exports = raiz.R7;
})(typeof window !== 'undefined' ? window : globalThis);
