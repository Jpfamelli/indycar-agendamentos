/* ===================== IndyCar Comunicar — Rodada 15 (25/11/2026) =====================
   Polimento do dia a dia. Funções PURAS (testadas em scripts/testes-r15.mjs):
   • rotuloDiaLista / diaDoEnvio / blocosPorDia: a lista de Mensagens ganha uma linha por dia
     ("Hoje · 3", "Amanhã · 2", "ter 24/11 · 5"), sem repetir o dia ao carregar mais.
   • reenviaveis: quais mensagens que falharam podem voltar para a fila de uma vez.
   • exemploDaMensagem: troca {primeiro_nome}, {carro}... por um cliente de exemplo para o gestor
     aprovar lendo o que o cliente vai ler.
   Regra da casa: esc() em TODO dado que vira HTML (quem chama é que escapa o texto).
   ======================================================================================= */
(function () {
  'use strict';
  var SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

  function isoSP(ts) { var d = new Date(ts); return isNaN(d) ? '' : f.format(d); }
  function somar(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

  /** "Hoje", "Amanhã", "Ontem" ou "ter 24/11" (com o ano quando não é o ano de hoje). */
  function rotuloDiaLista(iso, hoje) {
    if (!iso) return 'Sem data';
    if (iso === hoje) return 'Hoje';
    if (iso === somar(hoje, 1)) return 'Amanhã';
    if (iso === somar(hoje, -1)) return 'Ontem';
    var d = new Date(iso + 'T12:00:00Z');
    var dm = iso.slice(8, 10) + '/' + iso.slice(5, 7);
    return SEMANA[d.getUTCDay()] + ' ' + dm + (iso.slice(0, 4) !== String(hoje || '').slice(0, 4) ? '/' + iso.slice(0, 4) : '');
  }

  /** Em que dia a mensagem "acontece": enviada = quando saiu; as demais = quando está programada. */
  function diaDoEnvio(e) {
    return isoSP(e && e.status === 'enviado' && e.enviado_em ? e.enviado_em : (e && e.enviar_em));
  }

  /** Quebra a lista em blocos de dias vizinhos. `ultimo` = dia do último cartão já na tela (ao carregar mais). */
  function blocosPorDia(lista, ultimo) {
    var blocos = [];
    (lista || []).forEach(function (e) {
      var dia = diaDoEnvio(e);
      var b = blocos[blocos.length - 1];
      if (!b || b.dia !== dia) { b = { dia: dia, itens: [], continua: blocos.length === 0 && dia === ultimo }; blocos.push(b); }
      b.itens.push(e);
    });
    return blocos;
  }

  /** Das mensagens que falharam, as que podem voltar para a fila de uma vez. Fica de fora: "não sabemos se chegou"
      (reenviar pode duplicar) e quem pediu para parar (o carteiro pularia de novo). */
  function reenviaveis(lista) {
    return (lista || []).filter(function (e) {
      return e && e.status === 'falhou' && e.erro_classe !== 'sem_confirmacao' && !/não receber|parar/i.test(e.motivo_pulado || '');
    });
  }

  /** Texto-modelo com um cliente de exemplo (mesma troca do servidor, só para ler). */
  function exemploDaMensagem(corpo, ctx) {
    var c = ctx || {};
    var primeiro = String(c.nome || '').trim().split(/\s+/)[0] || '';
    var mapa = {};
    Object.keys(c).forEach(function (k) { mapa[k] = c[k]; });
    mapa.primeiro_nome = primeiro; mapa.carro = c.carro || 'seu carro';
    return String(corpo == null ? '' : corpo).replace(/\{(\w+)\}/g, function (_, k) { return mapa[k] == null ? '' : mapa[k]; }).replace(/[ \t]{2,}/g, ' ').trim();
  }

  window.R15 = { rotuloDiaLista: rotuloDiaLista, diaDoEnvio: diaDoEnvio, blocosPorDia: blocosPorDia, reenviaveis: reenviaveis, exemploDaMensagem: exemploDaMensagem };
})();
