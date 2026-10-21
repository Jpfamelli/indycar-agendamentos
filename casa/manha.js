/* Casa — "Bom dia" (rodada 6, C1c): o que ficou de ontem e o que vem amanhã, numa chamada só (r6_c1c_manha).
   Para a recepção: quem ainda não confirmou amanhã, com o recado pronto no WhatsApp. Para o dono: ontem fechou quanto,
   quem veio, o que ficou sem baixa e os carros prontos esperando retirada. Pode dispensar por hoje. */
(function () {
  'use strict';
  const MOD = { nome: 'manha' };
  let C = null, L = null, W = null, timer = null, ultimo = null;
  const $ = (s) => document.querySelector(s);
  const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
  const chave = (hoje) => `indycar_manha_${hoje}`;

  function destino(app) {
    const l = C.links;
    return { agenda: l.agenda(), patio: l.patioPainel ? l.patioPainel() : C.bases.patio }[app] || C.bases[app];
  }

  function desenhar(m) {
    const sec = $('#manha');
    const hoje = m.hoje || L.hojeSP();
    const r = W.resumoManha(m, { gestor: !!C.visao().dono });
    if (r.vazio || ler(chave(hoje)) === '1') { sec.hidden = true; return; }
    $('#manhaTitulo').textContent = `${L.saudacao()}, ${W.primeiroNome(C.perfil.nome || '') || 'tudo certo por aí?'}`.replace(/, $/, '');
    $('#manhaOntem').textContent = r.ontem;
    $('#manhaAmanha').textContent = r.amanha;
    $('#manhaPend').innerHTML = r.pendencias.map((p) => {
      const dest = C.podeUsar(p.app) ? destino(p.app) : null;
      const miolo = `<span class="a-num">${Number(p.n)}</span><span class="a-txt">${C.esc(p.texto)}${p.extra ? `<small>${C.esc(p.extra)}</small>` : ''}</span><span class="a-seta" aria-hidden="true">›</span>`;
      return `<li class="grav-${p.grav}">${dest ? `<a class="atencao-item" href="${C.esc(dest)}" target="${C.esc(L.nomeDaAba(p.app))}">${miolo}</a>` : `<span class="atencao-item">${miolo}</span>`}</li>`;
    }).join('');
    // quem não confirmou amanhã: um toque abre o WhatsApp com o recado pronto
    const naoConf = ((m.amanha && m.amanha.lista) || []).filter((x) => !x.confirmado);
    const caixa = $('#manhaLembrar');
    caixa.hidden = !naoConf.length;
    caixa.innerHTML = naoConf.length ? `<h3>Amanhã, sem confirmar</h3><ul class="manha-lista">${naoConf.map((x) => {
      const a = W.acaoDaLinha('lembrar', x, hoje, m.amanha.data);
      const ver = C.podeUsar('agenda') ? `<a class="linha" href="${C.esc(C.links.agenda(x.id))}" target="${C.esc(L.nomeDaAba('agenda'))}">` : '<span class="linha">';
      return `<li class="com-acao">${ver}<span class="l-a"><b>${C.esc(L.hora5(x.hora))}</b> ${C.esc(x.cliente || 'Cliente')}</span><span class="l-b">${C.esc([x.veiculo, x.servico].filter(Boolean).join(' · '))}</span>${C.podeUsar('agenda') ? '</a>' : '</span>'}` +
        (a ? `<a class="wa-mini" href="${C.esc(a.url)}" target="${C.esc(L.nomeDaAba('whatsapp'))}" rel="noopener noreferrer" aria-label="Lembrar ${C.esc(x.cliente || 'cliente')} pelo WhatsApp">💬 ${C.esc(a.rotulo)}</a>` : '<span class="wa-mini wa-sem">sem telefone</span>') + '</li>';
    }).join('')}</ul>` : '';
    sec.hidden = false;
  }

  async function carregar() {
    try {
      const r = await C.sb.rpc('r6_c1c_manha');
      if (r.error) throw r.error;
      ultimo = r.data; desenhar(r.data);
    } catch { /* o "Bom dia" é um extra: sem ele a Casa segue igual */ if (!ultimo) $('#manha').hidden = true; }
  }

  MOD.montar = function (casa) {
    C = casa; L = casa.L; W = window.CasaLogica3; ultimo = null;
    const V = casa.visao();
    const sec = $('#manha');
    if (!sec || !W || !(V.agenda || V.dono || C.perfil.papel === 'agenda')) { if (sec) sec.hidden = true; return; }
    $('#manhaFechar').onclick = () => { gravar(chave((ultimo && ultimo.hoje) || L.hojeSP()), '1'); sec.hidden = true; C.toast('Volta amanhã cedo.', 1500); };
    carregar();
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) carregar(); }, 15 * 60_000);
  };
  MOD.desmontar = function () { clearInterval(timer); timer = null; ultimo = null; const s = $('#manha'); if (s) s.hidden = true; };
  (window.CasaModulos = window.CasaModulos || []).push(MOD);
})();
