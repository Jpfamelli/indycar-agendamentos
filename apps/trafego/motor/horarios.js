/* ============================================================
   Mapa de horários dos contatos (rodada 8, frente T2a).

   ORIGEM das peças puras (repositório Nexus Ads, só leitura; commit 5ea0047 de 25/10/2026):
     nexus-ads/web/app/rel-logica.js  ->  matrizCalor, picoCalor, faixasCalor   (cópia fiel)
     nexus-ads/web/app/anuncios.js    ->  sugestaoHorarios                      (cópia adaptada)
   O que mudou em sugestaoHorarios: a frase fala "contatos" (não "conversas"), não cita a tela das
   plataformas e, quando várias janelas empatam, fica a que começa numa hora com contato
   (a original ficava com a primeira, que podia começar em horas vazias).

   O que é daqui: horariosDosContatos(), que monta o bloco `horarios` do contrato da API (§5.4)
   a partir dos contatos da jornada, sempre na hora de Brasília.
   ============================================================ */
'use strict';

const P = require('./periodo');

/* ---------- cópia fiel de rel-logica.js ---------- */

/** Mapa de calor [{dow,hora,qtd}] -> matriz 7 × 24 (0 = domingo). */
function matrizCalor(lista = []) {
  const m = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const x of lista || []) { const d = +x.dow, hh = +x.hora; if (d >= 0 && d < 7 && hh >= 0 && hh < 24) m[d][hh] += +x.qtd || 0; }
  return m;
}

/** Horário de pico: {dow, hora, qtd, empates} de maior volume (null sem dados). `empates` = quantos outros horários têm o mesmo número. */
function picoCalor(m) {
  let melhor = null, empates = 0;
  m.forEach((lin, d) => lin.forEach((q, hh) => {
    if (!(q > 0)) return;
    if (!melhor || q > melhor.qtd) { melhor = { dow: d, hora: hh, qtd: q }; empates = 0; } else if (q === melhor.qtd) empates++;
  }));
  return melhor ? { ...melhor, empates } : null;
}

/** Faixas do dia (madrugada/manhã/tarde/noite): soma de cada uma e a mais forte. */
function faixasCalor(m) {
  const FAIXAS = [['madrugada', 0], ['manhã', 6], ['tarde', 12], ['noite', 18]];
  const soma = FAIXAS.map(([nome, ini]) => ({ nome, ini, fim: ini + 5, total: (m || []).reduce((s, lin) => s + (lin || []).slice(ini, ini + 6).reduce((a, b) => a + (+b || 0), 0), 0) }));
  const total = soma.reduce((s, f) => s + f.total, 0);
  const forte = total ? soma.reduce((a, b) => (b.total > a.total ? b : a)) : null;
  return { faixas: soma.map(f => ({ ...f, pct: total ? Math.round(f.total / total * 100) : 0 })), total, forte };
}

/* ---------- cópia adaptada de anuncios.js ---------- */

/**
 * A janela de `largura` horas seguidas com mais contatos ("Das 18h às 22h chegam 41% dos contatos...").
 * "" com menos de `minimo` contatos ou quando nenhuma janela se destaca (25% do total ou menos).
 * A janela pode atravessar a meia-noite.
 */
function sugestaoHorarios(m24, { minimo = 20, largura = 4, deQuem = 'dos contatos' } = {}) {
  const porHora = Array.from({ length: 24 }, (_, hh) => (m24 || []).reduce((s, lin) => s + (+((lin || [])[hh]) || 0), 0));
  const total = porHora.reduce((a, b) => a + b, 0);
  if (total < minimo) return '';
  let melhor = -1, ini = 0;
  for (let h0 = 0; h0 < 24; h0++) {
    let s = 0;
    for (let k = 0; k < largura; k++) s += porHora[(h0 + k) % 24];
    // no empate, prefere a janela que já começa numa hora com contato
    if (s > melhor || (s === melhor && porHora[h0] > 0 && !(porHora[ini] > 0))) { melhor = s; ini = h0; }
  }
  const pct = Math.round(melhor / total * 100);
  if (pct <= 25) return '';
  const fim = (ini + largura) % 24;
  const de = ini === 0 ? 'Da meia-noite' : `Das ${ini}h`, ate = fim === 0 ? 'à meia-noite' : `às ${fim}h`;
  return `${de} ${ate} chegam ${pct}% ${deQuem}: se a verba for curta, concentre os anúncios nesse horário.`;
}

/* ---------- o bloco `horarios` do contrato ---------- */

/* O contrato começa a semana na segunda; a matriz do Nexus começa no domingo. */
const DIAS = Object.freeze(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']);
const DOW_DO_DIA = Object.freeze([1, 2, 3, 4, 5, 6, 0]);
const HORA_INICIO = 7, HORA_FIM = 20;
const dois = n => String(n).padStart(2, '0');

/** Hora cheia (0–23) de Brasília de um instante; null se não for data. */
function horaCheiaBR(iso) {
  const hm = P.horaBR(iso);
  return hm ? Number(hm.slice(0, 2)) : null;
}

/**
 * Bloco `horarios` da API: { dias, horas, celulas, pico, leitura } + { total, base }.
 *   celulas[d][h] = contatos de `dias[d]` na hora `horas[h]`.
 *   base = 'anuncio' quando há contato de anúncio no período (o mapa é só deles) ou 'todos'.
 * A grade vai das 7h às 20h e cresce para caber qualquer contato fora disso.
 */
function horariosDosContatos(contatos = []) {
  const comHora = [];
  for (const c of contatos || []) {
    if (!c) continue;
    const dia = P.diaBR(c.chegou_em), hora = horaCheiaBR(c.chegou_em);
    if (!dia || hora == null || !/[T ][0-9]{2}:/.test(String(c.chegou_em))) continue;     // data sem hora não diz o horário
    comHora.push({ dow: P.diaDaSemana(dia), hora, qtd: 1, paga: !!(c.origem && c.origem.paga === true) });
  }
  const deAnuncio = comHora.filter(x => x.paga);
  const base = deAnuncio.length ? 'anuncio' : 'todos';
  const usados = base === 'anuncio' ? deAnuncio : comHora;
  const m = matrizCalor(usados);
  const total = usados.length;

  let ini = HORA_INICIO, fim = HORA_FIM;
  for (const x of usados) { if (x.hora < ini) ini = x.hora; if (x.hora > fim) fim = x.hora; }
  const horas = [];
  for (let hh = ini; hh <= fim; hh++) horas.push(hh);
  const celulas = DOW_DO_DIA.map(dow => horas.map(hh => m[dow][hh]));

  const p = picoCalor(m);
  const pico = p ? `${DIAS[DOW_DO_DIA.indexOf(p.dow)]} ${dois(p.hora)}h` : null;
  const deQuem = base === 'anuncio' ? 'dos contatos de anúncio' : 'dos contatos';

  let leitura;
  if (!total) leitura = 'Ainda não há contatos com horário neste período.';
  else {
    const sugestao = sugestaoHorarios(m, { deQuem });
    if (sugestao) leitura = sugestao;
    else if (total < 20) leitura = `Ainda são poucos contatos (${total}) para apontar o melhor horário.`;
    else leitura = 'Os contatos chegam espalhados pelo dia: nenhum horário se destaca.';
    if (base === 'todos') leitura += ' O mapa mostra todos os contatos, porque nenhum deste período está marcado como de anúncio.';
  }
  return { dias: DIAS.slice(), horas, celulas, pico, leitura, total, base };
}

module.exports = { matrizCalor, picoCalor, faixasCalor, sugestaoHorarios, horariosDosContatos, DIAS };
