/* ===================== IndyCar Comunicar — Rodada 4 (14/10/2026) =====================
   • Réguas: a próxima saída de cada régua (rodada 11; Início, carteiro e 30 dias saíram)
   • Aniversários: colar lista, arquivo CSV, procurar nas conversas e no CRM
   • "Pedir ao gestor" (ajuda e tour saíram na rodada 11)
   • Rascunhos guardados no aparelho (réguas e campanha) e aviso ao sair
   Usa as funções do app.js (api, openModal, toast, esc, svg, I, state, route…).
   Regra da casa: esc() em TODO dado que vira HTML.
   ======================================================================================= */
(function () {
  'use strict';
  const R4 = {};
  const guardar = (k, v) => { try { if (v === null || v === undefined || v === '') localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem espaço/privado */ } };
  const ler = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const eu = () => state.perfil?.id || 'anonimo';
  const ROTULO = (t) => TIPO[t]?.rotulo || t;
  const EMOJI = (t) => TIPO[t]?.emoji || '✉️';

  // ======================================================================
  // RASCUNHOS — o que a pessoa escreveu fica no aparelho até salvar/enviar
  // ======================================================================
  const SETE_DIAS = 7 * 86400000;
  R4.lerRascunho = (chave) => {
    const r = ler(`comunicar_rascunho_${eu()}_${chave}`);
    if (!r || Date.now() - (r.em || 0) > SETE_DIAS) return '';
    return typeof r.v === 'string' ? r.v : '';
  };
  R4.guardarRascunho = debounce((chave, valor) => guardar(`comunicar_rascunho_${eu()}_${chave}`, valor ? { v: String(valor).slice(0, 4000), em: Date.now() } : null), 400);
  /* Réguas: só volta se ninguém salvou as réguas depois (mesma "versão" da configuração). */
  R4.lerRascunhoReguas = (cfg) => {
    const r = ler(`comunicar_reguas_${eu()}`);
    if (!r || Date.now() - (r.em || 0) > SETE_DIAS || !r.edit) return null;
    if (r.base !== (cfg.updated_at || null)) { guardar(`comunicar_reguas_${eu()}`, null); return null; }
    const edit = {};
    for (const [k, v] of Object.entries(r.edit)) if (String(v) !== String(cfg[k] ?? '')) edit[k] = v;
    return edit;
  };
  R4.guardarRascunhoReguas = (edit) => {
    const n = Object.keys(edit || {}).length;
    guardar(`comunicar_reguas_${eu()}`, n ? { base: state.cfg?.updated_at || null, edit, em: Date.now() } : null);
  };
  window.addEventListener('beforeunload', (e) => {
    if (state.route === 'reguas' && Object.keys(state.cfgEdit || {}).length) { e.preventDefault(); e.returnValue = ''; }
  });

  // ======================================================================
  // PEDIR AO GESTOR — quem não pode fazer algo pede com um clique
  // ======================================================================
  R4.pedirGestor = async (assunto, detalhe = '', btn = null) => {
    if (btn) btn.disabled = true;
    try {
      const r = await api('POST', '/pedir-gestor', { assunto, detalhe });
      toast(r.avisados ? `Pedido enviado: ${plural(r.avisados, 'gestor avisado', 'gestores avisados')} no sino.` : 'Pedido registrado.', 'ok', 5000);
      if (btn) { btn.textContent = '✓ Pedido enviado'; }
    } catch (e) { toast(e.message, 'err'); if (btn) btn.disabled = false; }
  };
  const botaoPedir = (assunto, detalhe, rotulo = 'Pedir ao gestor') =>
    `<button type="button" class="btn btn-mini pedir" data-pedir="${esc(assunto)}" data-detalhe="${esc(detalhe || '')}">🙋 ${esc(rotulo)}</button>`;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pedir]'); if (!b) return;
    R4.pedirGestor(b.dataset.pedir, b.dataset.detalhe || '', b);
  });

  // ======================================================================
  // PRÓXIMOS 30 DIAS — o que sairia se tudo estivesse ligado
  // ======================================================================
  let _projecao = null;
  async function projecao(forcar = false) {
    if (!forcar && _projecao && Date.now() - _projecao.em < 5 * 60000) return _projecao.v;
    /* r13B: o resumo de hoje e a "Próxima saída" pedem juntos — quem chega segundo espera o MESMO pedido */
    if (!forcar && _projecaoNoAr) return _projecaoNoAr;
    _projecaoNoAr = api('GET', '/projecao')
      .then((v) => { _projecao = { v, em: Date.now() }; return v; })
      .finally(() => { _projecaoNoAr = null; });
    return _projecaoNoAr;
  }
  let _projecaoNoAr = null;
  R4.projecao = projecao; // rodada 13: o resumo de hoje usa a mesma projeção (uma chamada só)
  /* Réguas: a próxima saída de cada régua ligada (dia e primeiro nome), pela projeção do servidor. */
  R4.pintarReguas = async function () {
    let p; try { p = await projecao(); } catch { return; }
    if (state.route !== 'reguas') return;
    for (const t of REGUAS) {
      const el = $(`[data-proxima="${t}"]`, view); if (!el) continue;
      if (!$(`[data-cfg="ativo_${t}"]`, view)?.checked) { el.textContent = 'Desligada: nada sai.'; continue; }
      const prox = (p.porRegua?.[t]?.exemplos || []).filter(x => x.data).sort((a, b) => (a.data < b.data ? -1 : 1))[0];
      el.textContent = prox ? `Próxima saída: ${rotuloDia(prox.data)}${prox.nome ? `, para ${String(prox.nome).split(' ')[0]}` : ''}` : 'Próxima saída: ninguém nos próximos 30 dias.';
    }
  };

  // ======================================================================
  // ANIVERSÁRIOS — colar lista · arquivo CSV · procurar nas conversas e no CRM
  // ======================================================================
  const EXEMPLO_LISTA = 'Maria Souza; (12) 99999-0001; 14/05/1988\nJoão Lima 12 98888-0002 02/11\nCarla Dias - 3 de março';
  const STATUS_AN = { casou: ['achei', 'bp-green'], ambiguo: ['mais de um', 'bp-orange'], nao_achou: ['não achei', 'bp-gray'], invalida: ['data?', 'bp-red'] };

  function lerArquivo(arquivo) {
    return new Promise((res, rej) => {
      const leitor = new FileReader();
      leitor.onerror = () => rej(new Error('Não consegui ler o arquivo.'));
      leitor.onload = () => {
        const t = String(leitor.result || '');
        if (!t.includes(String.fromCharCode(0xfffd))) return res(t);
        // planilha salva pelo Excel em "ANSI": lê de novo como Windows-1252
        const l2 = new FileReader(); l2.onload = () => res(String(l2.result || '')); l2.onerror = () => res(t);
        l2.readAsText(arquivo, 'windows-1252');
      };
      leitor.readAsText(arquivo, 'utf-8');
    });
  }

  R4.abrirAniversarios = function (aba = 'colar') {
    const gestor = pode('importar');
    openModal(`<div class="modal-head"><h3>${svg(I.gift)} Aniversários dos clientes</h3><button type="button" class="modal-close" aria-label="Fechar">×</button></div>
      <div class="abas" role="tablist" aria-label="Como cadastrar">
        <button type="button" role="tab" class="aba" data-aba="colar" aria-selected="false">📋 Colar lista</button>
        <button type="button" role="tab" class="aba" data-aba="arquivo" aria-selected="false">📄 Arquivo CSV</button>
        <button type="button" role="tab" class="aba" data-aba="procurar" aria-selected="false">🔎 Procurar nas conversas</button>
        <button type="button" role="tab" class="aba" data-aba="base" aria-selected="false">🎂 Quem já tem</button>
      </div>
      <div class="modal-body" id="anCorpo" role="tabpanel"></div>
      <div class="modal-foot" id="anPe"><button type="button" class="btn" data-fechar>Fechar</button></div>`, { larga:true, classe:'modal-aniv' });
    const corpo = $('#anCorpo'), pe = $('#anPe');
    const ir = (a) => {
      $$('.aba', modal).forEach(b => { const s = b.dataset.aba === a; b.classList.toggle('ativa', s); b.setAttribute('aria-selected', String(s)); });
      pe.innerHTML = '<button type="button" class="btn" data-fechar>Fechar</button>';
      ({ colar: abaColar, arquivo: abaArquivo, procurar: abaProcurar, base: abaBase })[a]();
    };
    $$('.aba', modal).forEach(b => b.addEventListener('click', () => ir(b.dataset.aba)));

    function abaColar() {
      corpo.innerHTML = `<p class="dica">Cole do jeito que tiver: <b>nome, telefone e data</b> numa linha por cliente, em qualquer ordem e separados por espaço, vírgula, ponto e vírgula ou tabulação (dá para copiar direto do Excel). Datas como 14/05/1988, 14/05, 14-05-88 ou "14 de maio" valem. Ninguém recebe nada agora: você confere antes de gravar.</p>
        <div class="field"><label for="anTexto">Lista</label><textarea id="anTexto" style="min-height:150px" placeholder="${esc(EXEMPLO_LISTA)}">${esc(R4.lerRascunho('aniversarios'))}</textarea></div>
        <div id="anResultado"></div>`;
      const ta = $('#anTexto');
      ta.addEventListener('input', () => R4.guardarRascunho('aniversarios', ta.value));
      pe.innerHTML = `<button type="button" class="btn" data-fechar>Fechar</button><button type="button" class="btn primary" id="anConferir">${svg(I.check)} Conferir</button>`;
      $('#anConferir').addEventListener('click', () => analisar(ta.value, 'lista'));
      setTimeout(() => ta.focus(), 30);
    }
    function abaArquivo() {
      corpo.innerHTML = `<p class="dica">Uma planilha salva como <b>CSV</b> (Excel: Arquivo › Salvar como › CSV). Com cabeçalho <i>nome · telefone · nascimento</i> as colunas são achadas sozinhas; sem cabeçalho, cada linha é lida como na lista colada.</p>
        <label class="arquivo-caixa" for="anArq"><span>${svg(I.upload)}</span><b>Escolher arquivo</b><small>.csv ou .txt, até 3.000 linhas</small></label>
        <input type="file" id="anArq" accept=".csv,.txt,text/csv,text/plain" class="sr-only">
        <div id="anResultado"></div>`;
      $('#anArq').addEventListener('change', async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        if (f.size > 3_000_000) return toast('Arquivo grande demais (máximo 3 MB).', 'err');
        try { analisar(await lerArquivo(f), 'csv'); } catch (err) { toast(err.message, 'err'); }
      });
    }
    async function abaProcurar() {
      corpo.innerHTML = `<p class="dica">Procura datas perto de "aniversário", "nasci", "nascimento" nas observações da ficha, nos leads do CRM e no que os clientes escreveram no WhatsApp. Confira o trecho antes de gravar.</p><div id="anResultado"><div class="skel" style="height:120px"></div></div>`;
      let r; try { r = await api('GET', '/aniversarios/sugestoes'); } catch (e) { $('#anResultado').innerHTML = `<p class="form-msg erro">${esc(e.message)}</p>`; return; }
      const box = $('#anResultado'); if (!box) return;
      const lidos = `${r.lidos.fichas} ficha(s), ${r.lidos.crm} contato(s) do CRM e ${r.lidos.conversas} mensagem(ns) com a palavra`;
      if (!r.sugestoes.length) { box.innerHTML = vazio(I.search, 'Nenhuma data encontrada', `Li ${esc(lidos)} e não achei datas novas. Use a lista colada ou o arquivo.`); return; }
      box.innerHTML = `<p class="muted">Li ${esc(lidos)}. Achei <b>${r.sugestoes.length}</b>:</p>
        <div class="an-lista">${r.sugestoes.map((s, i) => `<label class="an-item">
          <input type="checkbox" data-sug="${i}" ${s.troca ? '' : 'checked'}>
          <span class="an-q"><b>${esc(s.nome)}</b> <small>${esc(telBR(s.telefone))}</small><br><span class="badge-pill bp-blue">🎂 ${esc(nascBR(s.data))}</span>${s.troca ? ` <span class="badge-pill bp-orange">hoje: ${esc(nascBR(s.atual))}</span>` : ''} <small class="muted">${esc({ ficha:'ficha', crm:'CRM', conversa:'conversa' }[s.fonte] || s.fonte)}</small>
          <q>${esc(s.trecho)}</q></span></label>`).join('')}</div>`;
      pe.innerHTML = `<button type="button" class="btn" data-fechar>Fechar</button><button type="button" class="btn primary" id="anGravarSug">${svg(I.check)} Gravar as marcadas</button>`;
      $('#anGravarSug').addEventListener('click', () => {
        const itens = $$('[data-sug]:checked', box).map(c => r.sugestoes[Number(c.dataset.sug)]).map(s => ({ cliente_id: s.cliente_id, nascimento: s.data }));
        const troca = $$('[data-sug]:checked', box).some(c => r.sugestoes[Number(c.dataset.sug)].troca);
        gravar(itens, troca, 'conversas');
      });
    }
    async function abaBase() {
      corpo.innerHTML = '<div class="skel" style="height:160px"></div>';
      let d; try { d = await api('GET', '/aniversarios'); } catch (e) { corpo.innerHTML = `<p class="form-msg erro">${esc(e.message)}</p>`; return; }
      const pct = d.total ? Math.round((d.comData / d.total) * 100) : 0;
      corpo.innerHTML = `<div class="rel-nums"><div><b>${d.comData}</b><small>com aniversário</small></div><div><b>${d.total}</b><small>clientes com telefone</small></div><div class="g"><b>${d.proximos.length}</b><small>nos próximos 30 dias</small></div></div>
        <div class="barra-prog" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Clientes com aniversário"><i style="width:${Math.max(pct, d.comData ? 2 : 0)}%"></i></div>
        <p class="dica">A ficha do cliente é a mesma no CRM, na Agenda e no Atendimento: quem já tem data entra sozinho na régua Aniversário.</p>
        ${d.proximos.length ? `<div class="lista-sep">Próximos 30 dias <em>${d.proximos.length}</em></div>${d.proximos.slice(0, 20).map(p => `<div class="ag-linha"><span class="d">${esc(dataCurta(p.data))}</span><span class="s"><b>${esc(p.nome)}</b>${p.aceita ? '' : ' <span class="selo">não quer mensagens</span>'}</span><small class="muted">${p.em_dias === 0 ? 'hoje 🎂' : `em ${plural(p.em_dias, 'dia', 'dias')}`}</small></div>`).join('')}` : ''}
        ${d.semDataRecentes.length ? `<div class="lista-sep">Atendidos há pouco, sem data <em>${d.semDataRecentes.length}</em></div>${d.semDataRecentes.map(c => `<div class="ag-linha"><span class="s"><b>${esc(c.nome)}</b> <small class="muted">${esc(telBR(c.telefone))}</small></span><button type="button" class="btn btn-mini" data-nasc-r4="${esc(c.id)}">${svg(I.gift)} Pôr data</button></div>`).join('')}` : ''}`;
      $$('[data-nasc-r4]', corpo).forEach(b => b.addEventListener('click', () => { const c = d.semDataRecentes.find(x => x.id === b.dataset.nascR4); closeModal(); openNascimentoModal(c); }));
    }

    async function analisar(texto, origem) {
      const box = $('#anResultado'); if (!box) return;
      if (!String(texto || '').trim()) return toast('Cole a lista primeiro.', 'err');
      box.innerHTML = '<div class="skel" style="height:120px"></div>';
      let r; try { r = await api('POST', '/aniversarios/analisar', { texto }); } catch (e) { box.innerHTML = `<p class="form-msg erro">${esc(e.message)}</p>`; return; }
      const s = r.resumo;
      const grava = r.itens.filter(i => i.status === 'casou' && !i.igual);
      box.innerHTML = `<div class="rel-nums an-nums">
          <div class="g"><b>${s.novos}</b><small>datas novas</small></div><div><b>${s.trocas}</b><small>trocariam a data</small></div>
          <div><b>${s.iguais}</b><small>já estavam certas</small></div><div class="${s.ambiguos + s.nao_achou + s.invalidas ? 'p' : ''}"><b>${s.ambiguos + s.nao_achou + s.invalidas}</b><small>para conferir</small></div></div>
        ${r.cortado ? '<p class="form-msg erro">Só as primeiras 3.000 linhas foram lidas.</p>' : ''}
        ${s.trocas ? `<label class="lembrar"><input type="checkbox" id="anSubst" ${gestor ? '' : 'disabled'}> Trocar também as ${s.trocas} datas que já existem${gestor ? '' : ' (só gestor)'}</label>` : ''}
        <div class="an-tabela" role="table" aria-label="Conferência da lista">
          <div class="an-l an-h" role="row"><span role="columnheader" aria-label="Linha">Nº</span><span role="columnheader">Na lista</span><span role="columnheader">Cliente</span><span role="columnheader">Data</span></div>
          ${r.itens.slice(0, 400).map((i, k) => { const [rot, cor] = STATUS_AN[i.status] || ['?', 'bp-gray'];
            return `<div class="an-l" role="row"><span role="cell" class="muted">${i.linha}</span>
              <span role="cell">${esc(i.nome || '—')}${i.telefone ? `<small>${esc(telBR(i.telefone))}</small>` : ''}</span>
              <span role="cell"><span class="badge-pill ${cor}">${esc(rot)}</span> ${i.status === 'casou' ? `${esc(i.cliente_nome)}<small>pelo ${esc(i.como)}</small>` : ''}
                ${i.status === 'ambiguo' ? `<select class="inp an-esc" data-k="${k}" aria-label="Qual cliente é a linha ${i.linha}?"><option value="">qual destes?</option>${i.candidatos.map(c => `<option value="${esc(c.id)}">${esc(c.nome)} · ${esc(telBR(c.telefone))}</option>`).join('')}</select>` : ''}
                ${i.status === 'invalida' ? `<small>${esc(i.erro)}</small>` : ''}</span>
              <span role="cell">${i.data ? esc(nascBR(i.data)) : '—'}${i.troca ? `<small>hoje: ${esc(nascBR(i.atual))}</small>` : ''}${i.igual ? '<small>igual</small>' : ''}</span></div>`; }).join('')}
          ${r.itens.length > 400 ? `<p class="dica">+${r.itens.length - 400} linhas (todas entram na gravação).</p>` : ''}
        </div>`;
      const escolhidos = new Map();
      $$('.an-esc', box).forEach(sel => sel.addEventListener('change', () => { const it = r.itens[Number(sel.dataset.k)]; if (sel.value) escolhidos.set(it.linha, { cliente_id: sel.value, nascimento: it.data }); else escolhidos.delete(it.linha); atualizarBotao(); }));
      const montar = () => {
        const subst = $('#anSubst')?.checked;
        const itens = grava.filter(i => subst || !i.troca).map(i => ({ cliente_id: i.cliente_id, nascimento: i.data }));
        return [...itens, ...escolhidos.values()];
      };
      const atualizarBotao = () => { const b = $('#anGravar'); if (b) { const n = montar().length; b.disabled = !n; b.innerHTML = `${svg(I.check)} Gravar ${plural(n, 'data', 'datas')}`; } };
      pe.innerHTML = `<button type="button" class="btn" data-fechar>Fechar</button>${gestor || montar().length <= 1 ? `<button type="button" class="btn primary" id="anGravar"></button>` : botaoPedir('importar', `Lista com ${montar().length} aniversários para gravar`, 'Pedir ao gestor para gravar')}`;
      $('#anSubst')?.addEventListener('change', atualizarBotao);
      atualizarBotao();
      $('#anGravar')?.addEventListener('click', () => gravar(montar(), !!$('#anSubst')?.checked, origem));
    }

    async function gravar(itens, substituir, origem) {
      if (!itens.length) return toast('Nada marcado para gravar.', 'err');
      const b = $('#anGravar') || $('#anGravarSug'); if (b) b.disabled = true;
      try {
        const r = await api('POST', '/aniversarios/gravar', { itens, substituir, origem });
        R4.guardarRascunho('aniversarios', '');
        toast(`${plural(r.gravados, 'aniversário gravado', 'aniversários gravados')}${r.ignorados ? ` · ${r.ignorados} já tinham data (não troquei)` : ''}.`, 'ok', 6000);
        _projecao = null;
        closeModal();
        if (state.route === 'inicio' || state.route === 'clientes') route(null, { quieto:true });
      } catch (e) { toast(e.message, 'err', 6000); if (b) b.disabled = false; }
    }
    ir(aba);
  };

  // ======================================================================
  // AJUDA por papel (com busca) e TOUR de boas-vindas
  // ======================================================================
  // ======================================================================
  // VOLTOU / APARELHO DE VOLTA — atualiza a tela sem piscar
  // ======================================================================
  let _escondidoEm = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { _escondidoEm = Date.now(); return; }
    if (_escondidoEm && Date.now() - _escondidoEm > 2 * 60000 && !document.body.classList.contains('deslogado') && state.perfil) {
      if (!modalAberto() && !gavetaAberta() && state.route !== 'reguas') route(null, { quieto:true });
    }
  });
  window.Acordar?.ouvir((tipo) => {
    if (tipo !== 'voltou' || !state.perfil) return;
    if (!modalAberto() && !gavetaAberta() && state.route !== 'reguas') setTimeout(() => route(null, { quieto:true }), 300);
  });

  window.R4 = R4;
})();
