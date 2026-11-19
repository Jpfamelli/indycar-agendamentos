/* ============================================================
   Ações — "o que fazer agora", do teste ao real, fechamento do mês e
   qualidade da ligação (rodada 7, 25/10/2026).
   Usa as utilidades de app.js ($, $$, esc, brl, int, api, aviso) e
   abrirNaCasa (operacao.js), que abre cada app na aba nomeada dele.
   ============================================================ */
'use strict';

/* Só endereços https dos apps da casa viram botão; qualquer outra coisa some. */
const linkSeguro = u => (typeof u === 'string' && /^https:\/\//.test(u) && Ecossistema.appDaUrl(u) ? u : null);
const NOME_APP = { crm: 'CRM', atendimento: 'Atendimento', orcador: 'Orçador', patio: 'Pátio', agenda: 'Agenda' };
let acoesFiltro = '', acoesTodas = false, acoesMostrarTratados = false;

/* "Já tratei": esconde o item só hoje, só neste navegador (não muda nada no CRM nem no Orçador). */
const chaveTratados = () => 'ads-acoes-tratadas-' + new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
function lerTratados() { try { return new Set(JSON.parse(localStorage.getItem(chaveTratados()) || '[]')); } catch { return new Set(); } }
function gravarTratados(s) { try { localStorage.setItem(chaveTratados(), JSON.stringify([...s].slice(-300))); } catch { /* navegador sem armazenamento: o item volta amanhã ou ao recarregar */ } }
const idDaAcao = x => `${x.lead_id || x.tipo}:${x.tipo}`;

function horasTxt(h) { return h == null ? '' : h >= 48 ? `${Math.floor(h / 24)} dias` : `${Math.round(h)} h`; }

function desenharAcao(x) {
  const botoes = (x.botoes || []).map(b => linkSeguro(b.link)
    ? `<button type="button" class="btn btn-fantasma btn-mini" data-abrir-app="${esc(b.link)}" title="Abre na aba do ${esc(NOME_APP[b.app] || b.app)}">${esc(b.rotulo)}</button>` : '').join('');
  const recado = x.recado ? `<button type="button" class="btn btn-fantasma btn-mini" data-copiar-texto="${esc(x.recado)}" title="Copia um recado pronto para colar no WhatsApp">Copiar recado</button>` : '';
  const detalhes = [x.carro, x.placa, x.campanha].filter(Boolean).map(esc).join(' · ');
  return `<li class="acao" data-tipo="${esc(x.tipo)}">
    <div class="acao-topo"><strong>${esc(x.nome || 'Cliente')}</strong> <span class="chip-ciclo">${esc(x.titulo)}</span>${x.sem_responsavel ? ' <span class="chip-ciclo" title="Este lead ainda não tem responsável no CRM">sem dono</span>' : ''}${x.valor > 0 && !String(x.motivo || '').includes('R$') ? ` <span class="mini">${brl(x.valor)}</span>` : ''}</div>
    <p class="mini">${esc(x.motivo || '')}${detalhes ? ` · ${detalhes}` : ''}</p>
    <div class="linha-botoes">${botoes}${recado}<button type="button" class="btn btn-fantasma btn-mini" data-acao-tratei="${esc(idDaAcao(x))}" title="Esconde este item por hoje, só neste navegador">Já tratei</button></div></li>`;
}

function pintarAcoes(v) {
  const alvo = $('#bloco-acoes');
  if (!alvo) return;
  if (v.indisponivel) { alvo.innerHTML = `<p class="mini desce">${esc(v.motivo)}</p>`; return; }
  const radar = (v.radar || []).map(a => `<li class="acao"><div class="acao-topo"><span class="bolha sev-${esc(a.severidade)}" aria-hidden="true"></span> <strong>${esc(a.campanha || 'Campanha')}</strong></div>
      <p class="mini">${esc(String(a.mensagem || '').slice(0, 200))}</p>
      <div class="linha-botoes"><button type="button" class="btn btn-fantasma btn-mini" data-ver-campanha-acao="${esc(a.campanha || '')}">Ver a campanha</button></div></li>`).join('');
  const avisoParcial = v.parcial ? '<p class="mini desce">O Pátio não respondeu agora: a fila está sem os avisos de carro pronto.</p>' : (v.desatualizado ? '<p class="mini desce">Mostrando a última leitura boa: o Orçador e o Pátio não responderam agora.</p>' : '');
  if (!v.total && !radar) { alvo.innerHTML = '<p class="vazio">Ninguém esperando você agora.<span class="mini">Nenhum orçamento aberto sem resposta, desconto pedido, carro pronto sem retirar ou lead novo parado.</span></p>'; return; }
  const tratados = lerTratados();
  const pino = $('#pino-acoes');
  if (pino) { const n = v.itens.filter(x => !tratados.has(idDaAcao(x))).length; pino.textContent = String(n); pino.hidden = n === 0; }
  const escondidos = v.itens.filter(x => tratados.has(idDaAcao(x))).length;
  const visiveis = acoesMostrarTratados ? v.itens : v.itens.filter(x => !tratados.has(idDaAcao(x)));
  const itens = (acoesFiltro ? visiveis.filter(x => x.tipo === acoesFiltro) : visiveis);
  const mostrados = acoesTodas ? itens : itens.slice(0, 8);
  const chips = Object.entries(v.por_tipo || {}).map(([t, n]) => {
    const nome = (v.itens.find(x => x.tipo === t) || {}).titulo || t;
    return `<button type="button" class="chip-canal${acoesFiltro === t ? ' ativo' : ''}" data-acao-filtro="${esc(t)}" aria-pressed="${acoesFiltro === t}">${esc(nome)} <strong>${int(n)}</strong></button>`;
  }).join('');
  alvo.innerHTML = `${avisoParcial}${v.total ? `<p class="mini"><strong>${esc(v.frase || '')}</strong></p>` : ''}
    ${chips ? `<div class="chips-canal">${chips}</div>` : ''}
    ${mostrados.length ? `<ul class="lista-acoes">${mostrados.map(desenharAcao).join('')}</ul>` : '<p class="mini">Nenhum item neste filtro.</p>'}
    ${escondidos ? `<p class="mini">${int(escondidos)} item(ns) marcado(s) como tratado(s) hoje. <button type="button" class="link mini" data-acoes-tratados>${acoesMostrarTratados ? 'esconder de novo' : 'mostrar'}</button></p>` : ''}
    ${itens.length > mostrados.length ? `<button type="button" class="link mini" data-acoes-mais>ver mais ${int(itens.length - mostrados.length)}</button>` : ''}
    ${radar ? `<h4 class="subtitulo">Alertas de campanha sem leitura</h4><ul class="lista-acoes">${radar}</ul>` : ''}`;
}

async function carregarAcoes(fresco = false) {
  const alvo = $('#bloco-acoes');
  if (!alvo) return;
  try { estado.acoes = await api(`/api/acoes${fresco ? '?fresco=1' : ''}`); pintarAcoes(estado.acoes); }
  catch (e) { alvo.innerHTML = `<p class="mini desce">Não consegui montar a fila agora. ${esc(e.message)}</p>`; }
}

/* ---------------- do teste ao real (Ajustes) ---------------- */
const ROTULO_IR = { ajustes: 'Abrir Ajustes', painel: 'Abrir o Painel', resultados: 'Abrir Resultados CRM' };
const MODO_TXT = { real: ['Números reais', 'on'], demonstracao: ['Demonstração', 'meio'], vazio: ['Sem dados', 'off'] };
async function carregarPreparo() {
  const alvo = $('#bloco-preparo');
  if (!alvo) return;
  try {
    const p = await api('/api/preparo');
    const [rotulo, cls] = MODO_TXT[p.modo] || MODO_TXT.vazio;
    const marca = { ok: '✓', falta: '○', atencao: '!', opcional: '·' };
    alvo.innerHTML = `<p><span class="pilula ${cls}">${esc(rotulo)}</span> <span class="mini">${int(p.feitos)} de ${int(p.total)} passos feitos</span></p>
      <p class="mini">${esc(p.frase)}</p>
      <ol class="passos">${p.passos.map(x => `<li class="${x.estado === 'ok' ? 'feito' : ''}${x.id === p.proximo ? ' proximo' : ''}"><span class="passo-marca" aria-hidden="true">${marca[x.estado] || '○'}</span>
        <div><strong>${esc(x.titulo)}</strong><span class="so-leitor">${x.estado === 'ok' ? ': feito' : x.estado === 'opcional' ? ': opcional' : ': falta'}</span>
        <p class="mini">${esc(x.como)}</p>${x.estado !== 'ok' && x.aba ? `<button type="button" class="link mini" data-ir-aba="${esc(x.aba)}">${esc(ROTULO_IR[x.aba] || 'Abrir')}</button>` : ''}</div></li>`).join('')}</ol>`;
  } catch (e) { alvo.innerHTML = `<p class="mini desce">Não consegui conferir o preparo agora. ${esc(e.message)}</p>`; }
}

/* ---------------- fechamento do mês (Relatórios) ---------------- */
function mesAtual() { const d = new Date(Date.now() - 3 * 3600000); return d.toISOString().slice(0, 7); }
async function gerarFechamento() {
  const mes = $('#fech-mes').value || mesAtual(), saida = $('#fech-texto'), est = $('#fech-estado');
  est.textContent = 'Montando o fechamento…';
  try {
    const r = await api(`/api/fechamento?mes=${encodeURIComponent(mes)}`);
    saida.textContent = r.texto; saida.hidden = false;
    $('#fech-copiar').hidden = false; $('#fech-enviar').hidden = false; $('#fech-csv').hidden = false;
    est.textContent = r.demo ? 'Investimento de demonstração: o envio por WhatsApp fica bloqueado até as chaves reais.' : `Período ${dataBR(r.periodo.de)} a ${dataBR(r.periodo.ate)}${r.periodo.parcial ? ' (mês em andamento)' : ''}.`;
  } catch (e) { est.textContent = e.message; saida.hidden = true; }
}

/* ---------------- ligação dos orçamentos ao lead (Resultados CRM) ---------------- */
async function carregarLigacao() {
  const alvo = $('#ciclo-ligacao');
  if (!alvo) return;
  try {
    const l = await api('/api/ligacao');
    if (l.indisponivel) { alvo.innerHTML = `<span class="mini">${esc(l.motivo)}</span>`; return; }
    alvo.innerHTML = `<span class="pilula ${l.saudavel ? 'on' : 'meio'}">${l.saudavel ? 'Ligação em dia' : 'Ligação incompleta'}</span> <span class="mini">${esc(l.frase)}</span>`;
  } catch { alvo.innerHTML = ''; }
}

document.addEventListener('click', e => {
  const ab = e.target.closest('[data-abrir-app]');
  if (ab) { const u = linkSeguro(ab.dataset.abrirApp); if (u) abrirNaCasa(u); return; }
  const cp = e.target.closest('[data-copiar-texto]');
  if (cp) { navigator.clipboard?.writeText(cp.dataset.copiarTexto).then(() => aviso('Recado copiado. É só colar no WhatsApp.')).catch(() => aviso('Não consegui copiar; selecione o texto à mão.', true)); return; }
  const ir = e.target.closest('[data-ir-aba]');
  if (ir) { trocarAba(ir.dataset.irAba); return; }
  const fl = e.target.closest('[data-acao-filtro]');
  if (fl) { acoesFiltro = acoesFiltro === fl.dataset.acaoFiltro ? '' : fl.dataset.acaoFiltro; acoesTodas = false; if (estado.acoes) pintarAcoes(estado.acoes); return; }
  const tr = e.target.closest('[data-acao-tratei]');
  if (tr) { const s = lerTratados(); s.add(tr.dataset.acaoTratei); gravarTratados(s); if (estado.acoes) pintarAcoes(estado.acoes); aviso('Escondido por hoje. Amanhã volta se continuar parado.'); return; }
  if (e.target.closest('[data-acoes-tratados]')) { acoesMostrarTratados = !acoesMostrarTratados; if (estado.acoes) pintarAcoes(estado.acoes); return; }
  if (e.target.closest('[data-acoes-mais]')) { acoesTodas = true; if (estado.acoes) pintarAcoes(estado.acoes); return; }
  const vc = e.target.closest('[data-ver-campanha-acao]');
  if (vc) { $('#busca-campanhas').value = vc.dataset.verCampanhaAcao; trocarAba('campanhas'); return; }
  // Botão do alerta do radar: leva à aba certa já filtrada.
  const al = e.target.closest('[data-acao-alerta]');
  if (al) {
    let a; try { a = JSON.parse(al.dataset.acaoAlerta); } catch { return; }
    if (a.aba === 'leads') abrirLeadsCom({ q: a.q || '', canal: a.canal || '', quando: '30' });
    else if (a.aba === 'campanhas') { $('#busca-campanhas').value = a.q || ''; trocarAba('campanhas'); }
    else if (a.aba === 'criativos') { $('#busca-criativos').value = a.q || ''; trocarAba('criativos'); }
    else { trocarAba(a.aba || 'painel'); if (a.ancora) setTimeout(() => document.getElementById(a.ancora)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150); }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const mes = $('#fech-mes'); if (mes) mes.value = mesAtual();
  $('#fech-gerar')?.addEventListener('click', gerarFechamento);
  $('#fech-csv')?.addEventListener('click', e => ocupado(e.currentTarget, async () => { try { await baixarCSV(`/api/fechamento.csv?mes=${encodeURIComponent($('#fech-mes').value || mesAtual())}`, 'fechamento-do-mes.csv'); aviso('CSV do fechamento baixado.'); } catch (err) { aviso(err.message, true); } }));
  $('#fech-copiar')?.addEventListener('click', () => navigator.clipboard?.writeText($('#fech-texto').textContent).then(() => aviso('Fechamento copiado.')).catch(() => aviso('Não consegui copiar.', true)));
  $('#fech-enviar')?.addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true;
    try {
      const r = await api('/api/fechamento/enviar', { method: 'POST', body: JSON.stringify({ mes: $('#fech-mes').value || mesAtual() }) });
      aviso(r.ok ? 'Fechamento na fila do WhatsApp.' : 'Não entrou na fila: ' + (r.envio?.[0]?.erro || 'motivo desconhecido'), !r.ok);
    } catch (err) { aviso(err.message, true); }
    finally { b.disabled = false; }
  });
  $('#acoes-atualizar')?.addEventListener('click', () => carregarAcoes(true));
  $('#acoes-csv')?.addEventListener('click', e => ocupado(e.currentTarget, async () => { try { await baixarCSV('/api/acoes.csv', 'o-que-fazer-agora.csv'); aviso('CSV da fila baixado.'); } catch (err) { aviso(err.message, true); } }));
});
