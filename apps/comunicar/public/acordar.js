/* =====================================================================
   IndyCar Comunicar — "o sistema está acordando" (rodada 4)

   O Render gratuito dorme e, ao acordar, às vezes responde 502/503/504
   ("hibernate-wake-error") por alguns minutos. Em vez de erro cru:
     • a chamada espera e tenta de novo sozinha (2, 4, 8, 12, 20, 30… s,
       até ~3 min), com UMA sonda só (/api/ping) para todas as chamadas;
     • aparece uma faixa "O sistema está acordando… tentando de novo em 8 s"
       com "Tentar agora";
     • quando volta, avisa ("Voltou!") e TODAS as chamadas que esperavam
       seguem — o que a pessoa estava digitando continua na tela.
   Só repete sozinho o que é seguro: leitura (GET) sempre; gravação só quando
   a resposta veio do Render e não do Comunicar (502/503 sem JSON = o pedido
   nem chegou ao app) ou quando o aparelho estava sem internet.
   ===================================================================== */
(function (raiz) {
  'use strict';
  var ESPERAS = [2, 4, 8, 12, 20, 30, 30, 30, 30, 30]; // segundos (≈ 3 min no total)
  /* Rodada 5: a API é RELATIVA à página (funciona em / e em /comunicar/ na Central). */
  function caminhoApi(rota) { try { return new URL('api/' + String(rota).replace(/^\/+/, ''), (raiz.document && raiz.document.baseURI) || raiz.location.href).href; } catch (e) { return '/api/' + rota; } }
  var LIMITE_MS = 200 * 1000;

  /** A resposta é do Render dormindo (e não do nosso servidor)? */
  function ehAcordando(status, tipo) {
    return (status === 502 || status === 503 || status === 504) && !/json/i.test(String(tipo || ''));
  }
  /** Pode repetir sozinho? motivo: 'servidor' (Render) | 'rede' (fetch falhou) */
  function podeRepetir(metodo, motivo, online) {
    var m = String(metodo || 'GET').toUpperCase();
    if (m === 'GET' || m === 'HEAD') return true;
    if (motivo === 'servidor') return true;            // o pedido não chegou ao app
    return motivo === 'rede' && online === false;      // nem saiu do aparelho
  }
  function esperaDa(n) { return ESPERAS[Math.min(n, ESPERAS.length - 1)]; }

  // ---- estado compartilhado: uma sonda só para todas as chamadas ---------------
  var estado = { acordando: false, tentativa: 0, proximaEm: 0, desde: 0, promessa: null, resolver: null, rejeitar: null, timer: null, tique: null };
  var ouvintes = [];
  function avisar(tipo, dados) { ouvintes.forEach(function (fn) { try { fn(tipo, dados || {}); } catch (e) { /* ouvinte quebrado não derruba */ } }); }

  function sondar() {
    clearTimeout(estado.timer);
    estado.tentativa++;
    avisar('tentando', { tentativa: estado.tentativa });
    raiz.fetch(caminhoApi('ping'), { cache: 'no-store' }).then(function (r) {
      if (r.ok) return terminar(true);
      agendar();
    }).catch(agendar);
  }
  function agendar() {
    if (Date.now() - estado.desde > LIMITE_MS) return terminar(false);
    var s = esperaDa(estado.tentativa);
    estado.proximaEm = Date.now() + s * 1000;
    avisar('esperando', { tentativa: estado.tentativa, segundos: s, proximaEm: estado.proximaEm });
    estado.timer = setTimeout(sondar, s * 1000);
  }
  function terminar(voltou) {
    clearTimeout(estado.timer);
    var res = estado.resolver, rej = estado.rejeitar, demorou = Date.now() - estado.desde;
    estado.acordando = false; estado.promessa = null; estado.tentativa = 0;
    if (voltou) { avisar('voltou', { ms: demorou }); res && res(); }
    else { avisar('desistiu', { ms: demorou }); rej && rej(new Error('O servidor não acordou em 3 minutos. Tente de novo daqui a pouco — o que você escreveu continua aqui.')); }
  }
  /** Promessa que resolve quando o servidor voltar (começa a sondar se ainda não começou). */
  function esperarVoltar() {
    if (estado.promessa) return estado.promessa;
    estado.acordando = true; estado.desde = Date.now(); estado.tentativa = 0;
    estado.promessa = new Promise(function (res, rej) { estado.resolver = res; estado.rejeitar = rej; });
    avisar('dormindo', {});
    agendar();
    return estado.promessa;
  }
  function tentarAgora() { if (estado.acordando) sondar(); }

  /**
   * fetch com paciência. Devolve a Response (de sucesso ou erro do próprio app);
   * só rejeita quando desiste (3 min) ou quando não é seguro repetir.
   */
  function buscar(url, opcoes) {
    opcoes = opcoes || {};
    var metodo = opcoes.method || 'GET';
    function uma() {
      return raiz.fetch(url, opcoes).then(function (r) {
        if (ehAcordando(r.status, r.headers.get('content-type'))) {
          if (!podeRepetir(metodo, 'servidor')) return r;
          return esperarVoltar().then(uma);
        }
        return r;
      }, function (erro) {
        var online = raiz.navigator ? raiz.navigator.onLine : true;
        if (!podeRepetir(metodo, 'rede', online)) throw erro;
        return esperarVoltar().then(uma);
      });
    }
    return estado.promessa ? estado.promessa.then(uma) : uma();
  }

  // ---- a faixa na tela (criada sob demanda; funciona até na tela de login) ------
  function faixa() {
    var doc = raiz.document; if (!doc || !doc.body) return null;
    var f = doc.getElementById('faixaAcordando');
    if (f) return f;
    f = doc.createElement('div');
    f.id = 'faixaAcordando'; f.className = 'faixa-acordando'; f.hidden = true;
    f.setAttribute('role', 'status'); f.setAttribute('aria-live', 'polite');
    f.innerHTML = '<span class="fa-giro" aria-hidden="true"></span><span class="fa-txt"></span>' +
      '<button type="button" class="fa-btn">Tentar agora</button><i class="fa-barra" aria-hidden="true"></i>';
    f.querySelector('.fa-btn').addEventListener('click', tentarAgora);
    doc.body.appendChild(f);
    return f;
  }
  var tiqueTimer = null;
  ouvintes.push(function (tipo, d) {
    var f = faixa(); if (!f) return;
    var txt = f.querySelector('.fa-txt');
    clearInterval(tiqueTimer);
    if (tipo === 'dormindo' || tipo === 'tentando') {
      f.hidden = false; f.classList.remove('voltou');
      txt.textContent = d.tentativa ? 'O sistema está acordando… tentando de novo agora (tentativa ' + d.tentativa + ').' : 'O sistema está acordando… isso leva até 1 minuto.';
    } else if (tipo === 'esperando') {
      f.hidden = false;
      var pinta = function () {
        var s = Math.max(0, Math.ceil((d.proximaEm - Date.now()) / 1000));
        txt.textContent = 'O sistema está acordando… tentando de novo em ' + s + ' s' + (d.tentativa ? ' (tentativa ' + (d.tentativa + 1) + ')' : '') + '. Nada do que você escreveu se perde.';
      };
      pinta(); tiqueTimer = setInterval(pinta, 1000);
      var barra = f.querySelector('.fa-barra');
      barra.style.animation = 'none'; void barra.offsetWidth; barra.style.animation = 'faEncher ' + d.segundos + 's linear forwards';
    } else if (tipo === 'voltou') {
      f.classList.add('voltou'); txt.textContent = 'Voltou! O sistema está no ar de novo.';
      setTimeout(function () { f.hidden = true; f.classList.remove('voltou'); }, 3500);
    } else if (tipo === 'desistiu') {
      f.classList.remove('voltou');
      txt.textContent = 'O servidor não acordou em 3 minutos. Tente de novo daqui a pouco.';
    }
  });

  raiz.Acordar = {
    buscar: buscar, ehAcordando: ehAcordando, podeRepetir: podeRepetir, esperaDa: esperaDa, ESPERAS: ESPERAS,
    esperarVoltar: esperarVoltar, tentarAgora: tentarAgora,
    ouvir: function (fn) { ouvintes.push(fn); },
    get acordando() { return estado.acordando; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
