/* Página do cliente: confirmar, remarcar ou avisar que não vem (link do WhatsApp, sem login).
   R13C: saiu de dentro do index.html para a CSP recusar script embutido ('unsafe-inline'). */
(function () {
  var card = document.getElementById('card');
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var token = new URLSearchParams(location.search).get('t') || '';
  var API = new URL('../api/publico/confirmacao', location.href).href;
  var DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  function dataBR(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] : iso; }
  function rotuloDia(iso) {
    var d = new Date(iso + 'T12:00:00Z'); if (isNaN(d)) return '';
    var hoje = new Date(); var h = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12));
    var n = Math.round((d - h) / 864e5);
    var sem = DIAS[d.getUTCDay()];
    return (n === 0 ? 'hoje' : n === 1 ? 'amanhã' : sem) + ', ' + dataBR(iso);
  }
  // rodada 10: pedido com teto de 15 s (rede de celular que não responde não deixa a página presa) e recado em português
  function pedir(url, opt) {
    var corta = new AbortController(), relogio = setTimeout(function () { corta.abort(); }, 15000);
    opt = opt || {}; opt.signal = corta.signal;
    return fetch(url, opt).then(function (x) { clearTimeout(relogio); return x.json().catch(function () { return {}; }).then(function (j) { if (!x.ok) { var e = new Error(j.erro || 'Não consegui agora. Tente de novo.'); e.doServidor = true; e.status = x.status; throw e; } return j; }); },
      function (e) { clearTimeout(relogio); throw e; });
  }
  function recado(e) {
    if (e && e.doServidor) return e.message;
    if (e && e.name === 'AbortError') return 'A internet está lenta e a resposta não chegou. Tente de novo.';
    return 'Sem conexão agora. Confira a internet e tente de novo.';
  }
  function falha(msg, podeTentar) {
    card.innerHTML = '<h1>Ops</h1><p class="erro">' + esc(msg) + '</p><p>Se precisar, é só chamar a oficina pelo WhatsApp.</p>' +
      (podeTentar ? '<div class="botoes"><button type="button" id="de_novo">Tentar de novo</button></div>' : '');
    var b = document.getElementById('de_novo');
    if (b) b.addEventListener('click', function () { card.innerHTML = '<h1>Um instante…</h1><p>Buscando o seu horário.</p>'; abrir(); });
  }
  var oficina = {};
  // "Adicionar ao calendário": um .ics gerado aqui mesmo (sem servidor), 1 h de duração
  function linkIcs(ag) {
    if (!ag.data || !ag.hora) return '';
    var d = ag.data.replace(/-/g, ''), h = ag.hora.replace(':', '');
    var fim = String(Number(ag.hora.slice(0, 2)) + 1).padStart(2, '0') + ag.hora.slice(3);
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IndyCar//Agenda//PT-BR', 'BEGIN:VEVENT', 'UID:indycar-' + d + h + '@agenda',
      'DTSTART;TZID=America/Sao_Paulo:' + d + 'T' + h + '00', 'DTEND;TZID=America/Sao_Paulo:' + d + 'T' + fim.replace(':', '') + '00',
      'SUMMARY:IndyCar · ' + String(ag.servico || 'Serviço').replace(/[,;]/g, ' '), 'LOCATION:' + String(oficina.endereco || '').replace(/[,;]/g, ' '),
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  }
  function extras(ag, comCalendario) {
    var h = '';
    if (comCalendario && linkIcs(ag)) h += '<a class="wa cal" href="' + linkIcs(ag) + '" download="indycar-horario.ics">📅 Adicionar ao calendário</a> ';
    if (oficina.mapa) h += '<a class="wa mapa" href="' + esc(oficina.mapa) + '" target="_blank" rel="noopener">📍 Como chegar</a> ';
    if (oficina.whatsapp) h += '<a class="wa" href="' + esc(oficina.whatsapp) + '" target="_blank" rel="noopener">💬 Falar com a oficina</a>';
    return h ? '<div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px">' + h + '</div>' : '';
  }
  function quando(ts) { var d = ts ? new Date(ts) : null; return d && !isNaN(d) ? ' (' + d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) + ')' : ''; }
  function pronto(resposta, ag, respondidoEm) {
    var txt = resposta === 'confirmou' ? ['✅', 'Horário confirmado!', 'Te esperamos ' + rotuloDia(ag.data) + ' às ' + ag.hora + '. Qualquer coisa, é só chamar.']
      : resposta === 'remarcar' ? ['📅', 'Vamos remarcar', 'Nossa equipe já foi avisada e vai te chamar no WhatsApp para achar um horário bom pra você.']
      : ['👍', 'Tudo bem, obrigado por avisar', 'Liberamos o horário. Quando quiser voltar, é só chamar a gente.'];
    card.innerHTML = '<div class="pronto"><div class="ico">' + txt[0] + '</div><b>' + esc(txt[1]) + '</b><p>' + esc(txt[2]) + (respondidoEm ? '<br><small>Você respondeu' + esc(quando(respondidoEm)) + '.</small>' : '') + '</p>' + extras(ag, resposta === 'confirmou') + '</div>';
  }
  function tela(r) {
    var ag = r.agendamento || {};
    oficina = r.oficina || {};
    if (r.resposta) return pronto(r.resposta, ag, r.respondido_em);
    if (ag.passou || ['concluido', 'nao_fechou', 'nao_veio', 'cancelado', 'compareceu', 'em_atendimento'].indexOf(ag.status) >= 0) {
      card.innerHTML = '<h1>Esse horário já passou</h1><p>Se precisar de outro, é só chamar a oficina pelo WhatsApp.</p>' + extras(ag, false);
      return;
    }
    card.innerHTML =
      '<h1>Oi' + (ag.primeiro_nome ? ', ' + esc(ag.primeiro_nome) : '') + '! Seu horário está marcado.</h1>' +
      '<p>Confirma pra gente? Assim a equipe já deixa tudo pronto.</p>' +
      '<div class="hora"><span class="h">' + esc(ag.hora) + '</span><span class="d">' + esc(rotuloDia(ag.data)) + '</span>' +
      '<span class="s">' + esc(ag.servico || 'Serviço') + (ag.veiculo ? ' · ' + esc(ag.veiculo) : '') + '</span></div>' +
      '<div class="botoes">' +
        '<button type="button" class="ok" data-r="confirmou">✅ Confirmo, vou estar aí</button>' +
        '<button type="button" data-r="remarcar">📅 Preciso remarcar</button>' +
        '<button type="button" class="nao" data-r="nao_vem">Não vou conseguir ir</button>' +
      '</div>' +
      '<div id="obs" hidden><textarea id="obs_txt" maxlength="300" placeholder="Quer deixar um recado? (opcional)"></textarea>' +
        '<div class="botoes"><button type="button" class="ok" id="obs_ok">Enviar</button><button type="button" id="obs_volta">Voltar</button></div></div>' +
      '<p class="erro" id="erro" hidden></p>' + extras(ag, false);
    var escolha = null;
    var botoes = card.querySelectorAll('[data-r]');
    function enviar(resposta, observacao) {
      for (var i = 0; i < botoes.length; i++) botoes[i].disabled = true;
      var envia = document.getElementById('obs_ok'); if (envia) envia.disabled = true;
      pedir(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, resposta: resposta, observacao: observacao || null }) })
        .then(function () { pronto(resposta, ag); })
        .catch(function (e) { document.getElementById('erro').hidden = false; document.getElementById('erro').textContent = recado(e); if (envia) envia.disabled = false; for (var i = 0; i < botoes.length; i++) botoes[i].disabled = false; });
    }
    for (var i = 0; i < botoes.length; i++) botoes[i].addEventListener('click', function (ev) {
      var r = ev.currentTarget.getAttribute('data-r');
      if (r === 'confirmou') return enviar(r);
      escolha = r;
      document.getElementById('obs').hidden = false;
      document.querySelector('.botoes').hidden = true;
      document.getElementById('obs_txt').focus();
    });
    document.getElementById('obs_ok').addEventListener('click', function () { enviar(escolha, document.getElementById('obs_txt').value.trim()); });
    document.getElementById('obs_volta').addEventListener('click', function () { document.getElementById('obs').hidden = true; document.querySelector('.botoes').hidden = false; });
  }
  if (!token) return falha('Este link está incompleto.');
  // link que não vale (404) não ganha "Tentar de novo"; sem rede, lentidão ou servidor fora, ganha
  function abrir() {
    pedir(API + '?t=' + encodeURIComponent(token)).then(tela)
      .catch(function (e) { falha(recado(e), !(e && e.doServidor && e.status < 500 && e.status !== 429)); });
  }
  abrir();
})();
