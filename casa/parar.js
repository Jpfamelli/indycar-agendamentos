/* Casa — guarda do PARAR (rodada 7, C1). Os recados de WhatsApp da Casa são manuais (a pessoa aperta enviar), então a
   Casa mesma precisa respeitar quem pediu para não receber mensagem no Comunicar. Um só lugar cuida de TODOS os
   botões 💬 (Agora, Bom dia, tarefas, busca, ficha): um observador acha qualquer link https://wa.me/… que apareça na tela,
   pergunta ao banco de uma vez (r7_c1_parar, guardado por 5 min) e troca o botão de quem pediu para parar por um aviso.
   Se o cliente é novo no cache, o clique espera a resposta antes de abrir o WhatsApp. Sem resposta do banco, pergunta. */
(function () {
  'use strict';
  const MOD = { nome: 'parar' };
  let C = null, L = null, N = null, cache = {}, obs = null, timer = null, emVoo = null, falhouEm = 0;
  const SELETOR = 'a[href^="https://wa.me/"]';

  function consultar(tels) {
    const lista = (tels || []).filter(Boolean);
    if (!lista.length) return Promise.resolve(true);
    if (emVoo) return emVoo.then(() => consultar(N.paraConsultar(lista, cache)));
    emVoo = C.sb.rpc('r7_c1_parar', { p_telefones: lista }).then(({ data, error }) => {
      if (error) throw error;
      N.guardarParar(cache, lista, data);
      falhouEm = 0;
      return true;
    }).catch(() => { falhouEm = Date.now(); return false; }).finally(() => { emVoo = null; });
    return emVoo;
  }

  function bloqueado(a, motivo) {
    const s = document.createElement('span');
    s.className = (a.className || 'wa-mini') + ' wa-parar';
    s.dataset.parar = motivo;
    s.dataset.tel = N.telefoneDoLinkWa(a.href);
    s.setAttribute('role', 'img');
    s.setAttribute('aria-label', N.textoBloqueado(motivo));
    s.title = N.textoBloqueado(motivo);
    s.textContent = '🚫 Pediu para parar';
    if (C.podeUsar('comunicar')) {
      const l = document.createElement('a');
      l.className = 'wa-parar-ver';
      l.href = C.links.comunicarTel({ telefone: s.dataset.tel });
      l.target = L.nomeDaAba('comunicar');
      l.textContent = 'Comunicar ↗';
      l.setAttribute('aria-label', 'Ver no Comunicar quem pediu para parar');
      s.appendChild(document.createTextNode(' '));
      s.appendChild(l);
    }
    a.replaceWith(s);
  }

  function varrer() {
    if (!C || !C.perfil) return;
    const links = [...document.querySelectorAll(SELETOR)];
    if (!links.length) return;
    const tels = links.map((a) => N.telefoneDoLinkWa(a.href));
    links.forEach((a, i) => {
      const e = N.estadoParar(cache, tels[i]);
      if (e.estado === 'bloqueado') bloqueado(a, e.motivo);
    });
    const falta = N.paraConsultar(tels, cache);
    // depois de uma falha espera 20 s para não martelar o banco; o clique continua perguntando na hora
    if (falta.length && Date.now() - falhouEm > 20_000) consultar(falta).then((ok) => { if (ok) varrer(); });
  }
  function agendar() { clearTimeout(timer); timer = setTimeout(varrer, 40); }

  /** Avisa quem quiser saber (ex.: a tarefa que oferece "concluir") que o WhatsApp foi aberto de verdade. */
  function avisarAberto(a) { try { a.dispatchEvent(new CustomEvent('casa-wa-aberto', { bubbles: true, detail: { tel: N.telefoneDoLinkWa(a.href) } })); } catch { /* sem evento */ } }

  /** Clique num link do WhatsApp: bloqueado não abre; desconhecido espera o banco; sem banco, pergunta. */
  async function aoClicar(e) {
    if (!C || !C.perfil) return;
    const a = e.target.closest && e.target.closest(SELETOR);
    if (!a) return;
    const tel = N.telefoneDoLinkWa(a.href);
    if (!tel) { e.preventDefault(); e.stopImmediatePropagation(); C.toast('Esse número de WhatsApp não parece válido.'); return; }
    let est = N.estadoParar(cache, tel);
    if (est.estado === 'livre') { avisarAberto(a); return; }
    e.preventDefault(); e.stopImmediatePropagation();
    if (est.estado === 'bloqueado') { C.toast(N.AVISO_PARAR_BLOQUEADO, 5000); return; }
    const ok = await consultar([tel]);
    est = N.estadoParar(cache, tel);
    if (est.estado === 'bloqueado') { varrer(); C.toast(N.AVISO_PARAR_BLOQUEADO, 5000); return; }
    if (!ok || est.estado !== 'livre') { if (!window.confirm(N.AVISO_PARAR_SEM_CONFERIR)) return; }
    window.open(a.href, L.nomeDaAba('whatsapp'));
    avisarAberto(a);
  }
  function aoClicarAuxiliar(e) {
    if (e.button !== 1 || !C) return;
    const a = e.target.closest && e.target.closest(SELETOR);
    if (!a) return;
    const est = N.estadoParar(cache, N.telefoneDoLinkWa(a.href));
    if (est.estado !== 'livre') e.preventDefault();   // clique do meio não escapa da guarda
  }

  MOD.montar = function (casa) {
    C = casa; L = casa.L; N = window.CasaLogica4; cache = {}; falhouEm = 0; emVoo = null;
    C.parar = { estado: (tel) => N.estadoParar(cache, tel), consultar, varrer, cache: () => cache, limpar: () => { cache = {}; } };
    obs = new MutationObserver(agendar);
    obs.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', aoClicar, true);
    document.addEventListener('auxclick', aoClicarAuxiliar, true);
    agendar();
  };
  MOD.desmontar = function () {
    if (obs) obs.disconnect();
    obs = null; clearTimeout(timer);
    document.removeEventListener('click', aoClicar, true);
    document.removeEventListener('auxclick', aoClicarAuxiliar, true);
    cache = {}; C = null;
  };
  (window.CasaModulos = window.CasaModulos || []).push(MOD);
})();
