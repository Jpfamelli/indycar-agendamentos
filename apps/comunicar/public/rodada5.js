/* ===================== IndyCar Comunicar — Rodada 5 (16/10/2026) =====================
   • Saúde do WhatsApp: estado, motivo em português e o botão para o lugar certo
   • Réguas: prévia REAL (um cliente de verdade, com {link_os}/{link_area})
   • Relatório por régua com período (enviadas, responderam, agendaram, pediram para parar)
   • Campanhas: segmentos salvos, prévia com os pulados e o motivo, teste no meu celular
   • Conectar: ligações de um envio (conversa, lead, horário, ordem do Pátio) e a ficha 360
   • Atalho do manifest (?abrir=campanha) e caminhos relativos (Central)
   Usa as funções do app.js (api, openModal, toast, esc, svg, I, state, route…).
   Regra da casa: esc() em TODO dado que vira HTML.
   ======================================================================================= */
(function () {
  'use strict';
  const R5 = {};
  const LINKS = (window.IndyApps && window.IndyApps.LINKS) || {};
  const ROT = (t) => TIPO[t]?.rotulo || t;
  const EMOJI = (t) => TIPO[t]?.emoji || '✉️';
  const ler = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem espaço */ } };

  // ======================================================================
  // CAMPANHAS — segmentos salvos, prévia com pulados, teste no meu celular
  // ======================================================================
  R5.htmlPulados = function (p) {
    if (!p || !p.pulados) return '';
    const pu = p.pulados; const total = (pu.nao_quer || 0) + (pu.sem_telefone || 0) + (pu.repetido || 0);
    const rec = p.recentes ? `<div class="seg-pul aviso" title="Campanha é decisão sua: eles recebem mesmo assim, mas vale saber">⏳ ${plural(p.recentes, 'já recebeu', 'já receberam')} outra mensagem da oficina há menos de ${p.intervalo_dias} dias (recebem mesmo assim).</div>` : '';
    if (!total) return `<div class="seg-pul ok">${svg(I.check)} Ninguém fica de fora: todos os ${p.bruto ?? p.total} têm telefone e aceitam mensagens.</div>` + rec;
    const partes = [pu.nao_quer && `<span title="responderam PARAR ou foram desligados no painel">🚫 ${plural(pu.nao_quer, 'pediu para parar', 'pediram para parar')}</span>`,
      pu.sem_telefone && `<span>📵 ${plural(pu.sem_telefone, 'sem telefone', 'sem telefone')}</span>`,
      pu.repetido && `<span>👥 ${plural(pu.repetido, 'repetido', 'repetidos')}</span>`].filter(Boolean);
    return `<div class="seg-pul"><b>${plural(total, 'fica de fora', 'ficam de fora')} de ${p.bruto ?? (p.total + total)}:</b> ${partes.join(' · ')}</div>` + rec;
  };
  R5.segmentosSalvos = async function (forcar = false) {
    if (!forcar && state._segSalvos && Date.now() - state._segSalvos.em < 60000) return state._segSalvos.v;
    const v = await api('GET', '/segmentos/salvos').catch(() => []);
    state._segSalvos = { v, em: Date.now() };
    return v;
  };
  R5.htmlSegmentosSalvos = function (lista, filtroAtual, valorAtual) {
    if (!lista?.length) return '';
    const ativo = (s) => s.filtro === filtroAtual && String(s.valor ?? '') === String(valorAtual ?? '');
    return `<div class="seg-salvos" aria-label="Segmentos salvos"><small>Meus segmentos</small>${lista.map(s => `<button type="button" class="chip-seg${ativo(s) ? ' on' : ''}" data-seg-usar="${esc(s.id)}" title="${esc(SEG_ROT(s.filtro))}${s.valor ? ` (${esc(s.valor)})` : ''}${s.usos ? ` · usado ${s.usos}×` : ''}">${esc(s.nome)}<i data-seg-apagar="${esc(s.id)}" role="button" aria-label="Apagar segmento ${esc(s.nome)}" title="Apagar">×</i></button>`).join('')}</div>`;
  };
  const SEG_ROT = (f) => (state.segmentos || []).find(s => s.id === f)?.rotulo || f;
  R5.salvarSegmento = async function (filtro, valor, nomeSugerido) {
    const nome = prompt('Nome para este segmento (ex.: "Sumidos há 6 meses"):', nomeSugerido || '');
    if (nome === null) return null;
    try {
      const s = await api('POST', '/segmentos/salvos', { nome, filtro, valor });
      state._segSalvos = null; toast(`Segmento "${s.nome}" salvo.`); return s;
    } catch (e) { toast(e.message, 'err'); return null; }
  };
  R5.apagarSegmento = async function (id) {
    if (!confirm('Apagar este segmento salvo? As campanhas já enviadas não mudam.')) return false;
    try { await api('DELETE', `/segmentos/salvos/${id}`); state._segSalvos = null; toast('Segmento apagado.'); return true; }
    catch (e) { toast(e.message, 'err'); return false; }
  };
  /** "Mandar para o meu celular": o texto chega no telefone do perfil de quem escreve. */
  R5.testeMeu = async function (corpo, btn) {
    if (!String(corpo || '').trim()) return toast('Escreva a mensagem antes de testar.', 'err');
    if (btn) { btn.disabled = true; }
    try {
      const r = await api('POST', '/envios/teste-meu', { corpo });
      toast(`Teste enviado para o seu celular (${r.telefone}). Olhe o WhatsApp.`, 'ok', 5000);
    } catch (e) {
      if (e.codigo === 'sem_telefone') { toast('Cadastre seu celular em "Meu perfil" para receber o teste.', 'err', 6000); setTimeout(() => $('#avatarPerfil')?.click(), 400); }
      else toast(`Não saiu: ${e.message}`, 'err', 6000);
    } finally { if (btn) btn.disabled = false; }
  };

  // ======================================================================
  // ATALHO do manifest (?abrir=campanha) — os outros links vivem no app.js
  // ======================================================================
  R5.abrirAtalho = function () {
    const p = new URLSearchParams(location.search);
    const abrir = p.get('abrir'); if (!abrir) return false;
    history.replaceState(null, '', location.pathname);
    if (abrir === 'campanha') setTimeout(() => openCampanhaModal(), 400);
    return true;
  };

  window.R5 = R5;
})();
