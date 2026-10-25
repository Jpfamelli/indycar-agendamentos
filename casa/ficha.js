/* Casa — ficha rápida do cliente (rodada 7, C1). Abre da busca global (botão "Ficha" em cada pessoa) e junta, numa janela só,
   o que cada sistema sabe do mesmo telefone (r6_cliente_360): carro no Pátio, orçamentos, próximos horários, o que fazer agora
   e a linha do tempo. Cada botão leva ao registro certo na aba do app dele. Os links do cliente (Minha IndyCar, indique um amigo,
   acompanhar o carro) nascem no servidor da Central (POST /api/central/links-cliente), só para a equipe logada. WhatsApp sempre
   passa pela guarda do PARAR (parar.js). A ficha só lê: nada é gravado. */
(function () {
  'use strict';
  const MOD = { nome: 'ficha' };
  let C = null, L = null, N = null, W = null, aberta = false, seq = 0, ultimoFoco = null, atual = null;
  const $ = (s) => document.querySelector(s);

  const wa = (tel55, texto, rotulo, classe = 'wa-mini', aria = '') => {
    const u = W.linkWhatsApp(tel55, texto);
    return u ? `<a class="${classe}" href="${C.esc(u)}" target="${C.esc(L.nomeDaAba('whatsapp'))}" rel="noopener noreferrer" aria-label="${C.esc(aria || rotulo)}">💬 ${C.esc(rotulo)}</a>` : '';
  };
  const app = (url, k, rotulo, classe = 'ficha-link') => (url && C.podeUsar(k) ? `<a class="${classe}" href="${C.esc(url)}" target="${C.esc(L.nomeDaAba(k))}">${C.esc(rotulo)} ↗</a>` : '');
  const quandoCurto = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleString('pt-BR', { timeZone: L.FUSO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''; };
  const dataCurta = (d) => String(d || '').split('-').reverse().slice(0, 2).join('/');

  function bloco(titulo, html, extra = '') { return html ? `<section class="ficha-bloco ${extra}"><h3>${C.esc(titulo)}</h3>${html}</section>` : ''; }

  function desenhar(f, bruto) {
    $('#fichaTit').textContent = f.nome;
    $('#fichaSub').textContent = f.telefone;
    $('#fichaChips').innerHTML = f.chips.map((c) => `<span class="pil">${C.esc(c)}</span>`).join('') + (f.aceita ? '' : '<span class="pil pil-ruim">pediu para parar</span>');
    const oi = W.mensagemWa('oi', { nome: f.nome });
    const barra = [
      f.tel55 ? wa(f.tel55, oi, 'WhatsApp', 'wa-mini', `Abrir o WhatsApp de ${f.nome}`) : '',
      f.telefone ? `<button type="button" class="ficha-btn" data-copiar-tel="${C.esc(f.tel55)}">📋 Copiar telefone</button>` : '',
      f.tel55 && C.podeUsar('patio') ? '<button type="button" class="ficha-btn" data-ficha-links>🔗 Links do cliente</button>' : '',
      app(f.links.crm, 'crm', 'CRM'), app(f.links.atendimento, 'atendimento', 'Conversa'), app(f.links.comunicar, 'comunicar', 'Comunicar'),
      app(f.links.cotacao, 'orcador', 'Novo orçamento'), f.tel55 ? app(C.links.agendaNovo({ telefone: f.tel55 }), 'agenda', 'Marcar horário') : '',
    ].filter(Boolean).join('');
    const acoes = f.acoes.map((a) => {
      const ir = a.link ? (L.appDoLink(a.link, location.origin, C.bases) || a.app) : '';
      const botao = a.link && C.podeUsar(ir) ? `<a class="ficha-link" href="${C.esc(a.link)}" target="${C.esc(L.nomeDaAba(ir))}">Abrir ↗</a>` : '';
      return `<li class="ficha-acao" data-acao="${C.esc(a.codigo)}"><span class="a-txt"><b>${C.esc(a.titulo)}</b>${a.motivo ? `<small>${C.esc(a.motivo)}</small>` : ''}</span>${botao}</li>`;
    }).join('');
    const patio = f.patio.map((o) => `<li><span class="a-txt"><b>#${C.esc(o.numero)}</b> ${C.esc([o.veiculo, o.placa].filter(Boolean).join(' · ') || 'Carro')}<small>${C.esc(o.etapa)}${o.atrasado ? ' · parado além do normal' : ''}${o.extras ? ` · ${o.extras} extra${o.extras > 1 ? 's' : ''} esperando o cliente` : ''}</small></span>${app(o.link, 'patio', 'Abrir a OS')}</li>`).join('');
    const orc = f.orcamentos.map((q) => `<li><span class="a-txt"><b>${C.esc(L.numeroOrc(q.numero))}</b> ${C.esc(L.brl(q.total))}<small>${C.esc(q.status)}${q.veiculo ? ' · ' + C.esc(q.veiculo) : ''}${q.esperandoHoras >= 6 ? ` · esperando há ${C.esc(L.duracao(q.esperandoHoras * 36e5))}` : ''}</small></span>${app(q.link, 'orcador', 'Abrir')}</li>`).join('');
    const ag = f.agenda.map((a) => `<li><span class="a-txt"><b>${C.esc(dataCurta(a.data))} ${C.esc(a.hora)}</b> ${C.esc(a.servico || 'Horário')}<small>${C.esc(a.status)}</small></span>${app(a.link, 'agenda', 'Abrir')}</li>`).join('');
    const linha = f.linha.map((e) => `<li><span class="a-txt"><b>${C.esc(e.titulo)}</b>${e.detalhe ? `<small>${C.esc(e.detalhe)}</small>` : ''}</span><time>${C.esc(quandoCurto(e.quando))}</time></li>`).join('');
    $('#fichaCorpo').innerHTML =
      `<div class="ficha-barra">${barra}</div><div id="fichaLinks" class="ficha-links" hidden></div>` +
      bloco('Fazer agora', acoes ? `<ul class="ficha-lista">${acoes}</ul>` : '', 'ficha-agora') +
      bloco('Carro na oficina', patio ? `<ul class="ficha-lista">${patio}</ul>` : '') +
      bloco('Orçamentos', orc ? `<ul class="ficha-lista">${orc}</ul>` : '') +
      bloco('Próximos horários', ag ? `<ul class="ficha-lista">${ag}</ul>` : '') +
      bloco('Linha do tempo', linha ? `<ul class="ficha-lista ficha-tempo">${linha}</ul>` : '') +
      (f.vazio ? '<p class="vazio vazio-ensina"><b>Cliente sem histórico ainda.</b><span>Quando ele marcar um horário, pedir um orçamento ou entrar no pátio, tudo aparece aqui.</span></p>' : '');
    atual = { f, bruto };
  }

  async function abrir(dados) {
    const tel = typeof dados === 'string' ? dados : dados && (dados.tel55 || dados.telefone);
    const e164 = L.telefoneE164(tel);
    if (!e164) { C.toast('Esse telefone não parece válido.'); return; }
    if (!aberta) { aberta = true; ultimoFoco = document.activeElement; }
    const minha = ++seq;
    $('#ficha').hidden = false;
    document.body.classList.add('modal-aberto');
    $('#fichaTit').textContent = (dados && dados.nome) || L.formatarTelefone(e164);
    $('#fichaSub').textContent = L.formatarTelefone(e164);
    $('#fichaChips').innerHTML = '';
    $('#fichaCorpo').innerHTML = '<p class="vazio" role="status">Juntando o que cada sistema sabe…</p>';
    setTimeout(() => $('#fichaFechar').focus(), 20);
    try {
      const { data, error } = await C.sb.rpc('r6_cliente_360', { p_telefone: e164 });
      if (minha !== seq) return;
      if (error) throw error;
      desenhar(N.fichaDe(data, C.bases, location.origin), data);
    } catch (e) {
      if (minha !== seq) return;
      $('#fichaCorpo').innerHTML = `<p class="vazio vazio-erro">${navigator.onLine ? 'Não consegui montar a ficha agora.' : 'Sem internet.'} <button type="button" class="btn-link" data-ficha-de-novo="${C.esc(e164)}">tentar de novo</button></p>`;
    }
  }
  function fechar() {
    if (!aberta) return;
    aberta = false; seq++; atual = null;
    $('#ficha').hidden = true;
    document.body.classList.remove('modal-aberto');
    try { ultimoFoco && ultimoFoco.focus && ultimoFoco.focus(); } catch { /* sumiu */ }
  }

  /** Links do cliente: pede ao servidor da Central (que confere o login e chama a função do banco). */
  async function links() {
    if (!atual) return;
    const caixa = $('#fichaLinks'), btn = document.querySelector('[data-ficha-links]');
    const f = atual.f;
    caixa.hidden = false; caixa.innerHTML = '<p class="vazio" role="status">Gerando os links…</p>';
    if (btn) btn.disabled = true;
    try {
      const { data: { session } } = await C.sb.auth.getSession();
      const r = await fetch('/api/central/links-cliente', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session ? session.access_token : '') }, body: JSON.stringify({ telefone: f.tel55 }), cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || 'falhou');
      if (!d.ok) { caixa.innerHTML = `<p class="vazio">${d.motivo === 'cliente_nao_encontrado' ? 'Esse telefone ainda não é cliente cadastrado — marque um horário ou crie um orçamento primeiro.' : 'Os links não estão disponíveis agora.'}</p>`; return; }
      const nome = f.nome && !/^\(/.test(f.nome) ? f.nome : d.nome;
      const linhas = [
        ['minha', 'Minha IndyCar (histórico do carro)', d.minha, `Aqui está a sua Minha IndyCar, com o histórico do seu carro: `],
        ['acompanhar', d.os ? `Acompanhar o carro (OS #${d.os.numero}${d.os.etapa_rotulo ? ' · ' + d.os.etapa_rotulo : ''})` : 'Acompanhar o carro', d.acompanhar, 'Acompanhe o seu carro na oficina, em tempo real: '],
        ['indique', 'Indique um amigo', d.indique, 'Indique um amigo para a IndyCar por este link: '],
      ].filter((x) => x[2]);
      caixa.innerHTML = linhas.length ? `<h3>Links do cliente</h3><ul class="ficha-lista">${linhas.map(([k, rot, url, frase]) => `<li data-link="${C.esc(k)}"><span class="a-txt"><b>${C.esc(rot)}</b><input class="ficha-url" readonly value="${C.esc(url)}" aria-label="${C.esc(rot)}" /></span>
          <button type="button" class="ficha-btn" data-copiar-url="${C.esc(url)}">Copiar</button>${wa(f.tel55, `${W.mensagemWa('oi', { nome })} ${frase}${url}`, 'Mandar', 'wa-mini', `Mandar o link ${rot} pelo WhatsApp`)}</li>`).join('')}</ul>` +
        (d.aceita_mensagens === false ? '<p class="dono-nota">Este cliente pediu para não receber mensagens: copie o link, mas não mande pelo WhatsApp.</p>' : '') : '<p class="vazio">Sem links para este cliente agora.</p>';
    } catch (e) {
      caixa.innerHTML = `<p class="vazio vazio-erro">Não consegui gerar os links agora. ${C.esc(String(e && e.message || '').slice(0, 80))}</p>`;
    } finally { if (btn) btn.disabled = false; }
  }
  async function copiar(texto, msg) {
    try { await navigator.clipboard.writeText(texto); C.toast(msg); } catch { C.toast('Não consegui copiar neste navegador.'); }
  }

  MOD.montar = function (casa) {
    C = casa; L = casa.L; N = window.CasaLogica4; W = window.CasaLogica3; aberta = false; seq = 0; atual = null;
    C.ficha = { abrir, fechar, aberta: () => aberta };
    $('#fichaFechar').onclick = fechar;
    $('#ficha').onclick = (e) => {
      if (e.target.id === 'ficha') return fechar();
      if (e.target.closest('[data-ficha-links]')) return links();
      const t = e.target.closest('[data-copiar-tel]'); if (t) return copiar(L.formatarTelefone(t.dataset.copiarTel), 'Telefone copiado.');
      const u = e.target.closest('[data-copiar-url]'); if (u) return copiar(u.dataset.copiarUrl, 'Link copiado.');
      const d = e.target.closest('[data-ficha-de-novo]'); if (d) return abrir(d.dataset.fichaDeNovo);
    };
    $('#ficha').onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); }
      if (e.key === 'Tab') {
        const foc = [...$('#ficha').querySelectorAll('input:not([readonly]), a[href], button:not(:disabled)')].filter((el) => el.offsetParent !== null);
        if (!foc.length) return;
        const p = foc[0], u = foc[foc.length - 1];
        if (e.shiftKey && document.activeElement === p) { e.preventDefault(); u.focus(); }
        else if (!e.shiftKey && document.activeElement === u) { e.preventDefault(); p.focus(); }
      }
    };
  };
  MOD.desmontar = function () { aberta = false; seq++; atual = null; const f = $('#ficha'); if (f) f.hidden = true; document.body.classList.remove('modal-aberto'); };
  (window.CasaModulos = window.CasaModulos || []).push(MOD);
})();
