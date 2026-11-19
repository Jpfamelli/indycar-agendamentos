/* ============================================================
   Operação profissional (rodada 5, 16/10/2026): aba Leads (do anúncio ao
   CRM), busca global Ctrl+K, atalhos de teclado, ajuda, links do
   ecossistema num lugar só e o modo "sem chaves" (demonstração marcada).
   Usa as utilidades de app.js ($, $$, esc, api, aviso, brl, int, trocarAba).
   ============================================================ */
'use strict';

/* ---------------- links do ecossistema (um lugar só) ---------------- */
function ligarLinksEco() {
  $$('[data-eco]').forEach(a => { const u = Ecossistema.url(a.dataset.eco); if (u) a.href = u + '/'; });
}

/* Rodada 6: link para outro app da casa abre na aba NOMEADA dele (indycar-crm, indycar-orcador…): clicar de novo
   reaproveita a aba em vez de empilhar abas, e a tela de tráfego continua onde estava. Vale para links que a tela
   criar depois (captura no documento). Os apps da casa são nossos: sem noopener, para o nome da aba funcionar. */
function nomearAbasDaCasa(doc = document) {
  doc.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.button > 0) return;
    const app = Ecossistema.appDaUrl(a.href);
    if (!app) return;
    a.target = Ecossistema.alvo(app);
    a.rel = 'noreferrer';
  }, true);
}
/** Abre uma URL do ecossistema na aba nomeada do app (ou nova aba, se for de fora). */
function abrirNaCasa(url) {
  const app = Ecossistema.appDaUrl(url);
  window.open(url, app ? Ecossistema.alvo(app) : '_blank', app ? '' : 'noopener');
}

/* ---------------- leads: do anúncio ao CRM ---------------- */
const NOME_CANAL = { meta: 'Meta', google: 'Google', site: 'Site', whatsapp: 'WhatsApp', indicacao: 'Indicação', organico: 'Orgânico', telefone: 'Telefone', outro: 'Outro' };
const CLASSE_STATUS = { novo: 'st-novo', contato: 'st-contato', orcamento: 'st-orcamento', agendado: 'st-agendado', em_servico: 'st-agendado', concluido: 'st-ok', perdido: 'st-perdido' };
let consultaLeads = 0, ultimoLeads = null;

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const diaMenos = (iso, n) => new Date(new Date(`${iso}T12:00:00Z`).getTime() - n * 86400000).toISOString().slice(0, 10);

/* Período da aba Leads: hoje, ontem, 7, 30 ou o período do topo (dias fechados). */
function paramsLeads() {
  const p = new URLSearchParams();
  const quando = $('#leads-quando').value, hoje = hojeSP();
  if (quando === 'hoje') { p.set('de', hoje); p.set('ate', hoje); }
  else if (quando === 'ontem') { p.set('de', diaMenos(hoje, 1)); p.set('ate', diaMenos(hoje, 1)); }
  else if (quando === 'topo') p.set('dias', String(estado.periodo));
  else if (quando === 'mes') { p.set('de', `${hoje.slice(0, 7)}-01`); p.set('ate', hoje); }
  else { p.set('de', diaMenos(hoje, Number(quando) - 1)); p.set('ate', hoje); }
  const canal = $('#leads-canal').value;
  if (canal === 'pagos') p.set('pagos', '1'); else if (canal) p.set('canal', canal);
  if ($('#leads-status').value) p.set('status', $('#leads-status').value);
  if ($('#leads-sem-resp').checked) p.set('sem_responsavel', '1');
  const q = $('#leads-q').value.trim();
  if (q) p.set('q', q);
  if ($('#leads-etapa').value) p.set('etapa', $('#leads-etapa').value);
  if ($('#leads-ordem').value !== 'recentes') p.set('ordem', $('#leads-ordem').value);
  if (estado.leadsLimite) p.set('limite', String(estado.leadsLimite));
  return p;
}

/** "Criar tarefa" a partir de um lead: abre Minhas tarefas com o título pronto e o lead ligado. */
function abrirTarefaDoLead(l) {
  $('#tarefa-titulo').value = `Ligar para ${l.nome}${l.servico ? ` (${l.servico})` : ''}`.slice(0, 140);
  $('#tarefa-titulo').dataset.leadId = l.id || ''; $('#tarefa-titulo').dataset.clienteId = l.cliente_id || '';
  $('#tarefa-vence').value = hojeSP();
  $('#modal-tarefas').showModal(); carregarTarefas(); $('#tarefa-titulo').focus();
}

const seloCanal = c => `<span class="selo selo-canal selo-${esc(c)}">${esc(NOME_CANAL[c] || c)}</span>`;
/* "há 12 min", "há 3 h", "há 2 dias" */
function haQuanto(t) {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(t)) / 60000));
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  if (min < 48 * 60) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} dias`;
}
const seloStatus = l => `<span class="selo ${CLASSE_STATUS[l.status] || ''}">${esc(l.status_nome)}</span>`;
const quandoTxt = t => {
  if (!t) return '—';
  const d = new Date(t), hoje = hojeSP(), dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  return dia === hoje ? `hoje ${hora}` : dia === diaMenos(hoje, 1) ? `ontem ${hora}` : `${dia.slice(8, 10)}/${dia.slice(5, 7)} ${hora}`;
};

/* Rodada 6: o que o Orçador e o Pátio sabem do lead (chips que abrem a tela deles). */
function chipsCiclo(l) {
  const c = l.ciclo;
  if (!c) return '';
  const o = c.orcamento, p = c.os, saida = [];
  if (o) {
    const espera = o.esperando_horas != null && o.esperando_horas >= 48 ? ` · há ${Math.round(o.esperando_horas / 24)} dias` : '';
    saida.push(`<a class="chip-ciclo chip-orc-${esc(o.status)}" href="${esc(o.link)}" target="_blank" rel="noopener noreferrer" title="Abrir o orçamento${o.numero ? ' nº ' + esc(o.numero) : ''} no Orçador">Orç.${o.numero ? ' ' + esc(o.numero) : ''} ${esc(o.status_nome.toLowerCase())}${o.total != null ? ' ' + brl(o.total) : ''}${espera}</a>`);
  }
  if (p) {
    const parado = p.pronto_horas != null && p.pronto_horas >= 24 ? ` · pronto há ${Math.round(p.pronto_horas / 24)} dia(s)` : '';
    saida.push(`<a class="chip-ciclo ${p.no_patio ? 'chip-patio-agora' : 'chip-patio-fim'}" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer" title="Abrir a OS${p.numero ? ' nº ' + esc(p.numero) : ''} no Pátio">Pátio${p.numero ? ' OS ' + esc(p.numero) : ''}: ${esc(p.etapa_nome.toLowerCase())}${parado}</a>`);
  }
  if (o && o.quente) saida.push(`<span class="chip-ciclo chip-patio-agora" title="O cliente abriu o orçamento e ainda não respondeu: bom momento para ligar">abriu há ${o.visto_horas >= 48 ? Math.round(o.visto_horas / 24) + ' dias' : (o.visto_horas || 0) + ' h'}, sem resposta</span>`);
  if (o && o.desconto_pedido) saida.push('<span class="chip-ciclo" title="O cliente pediu desconto e espera o gestor">pediu desconto</span>');
  if (o && o.follow_vencido) saida.push('<span class="chip-ciclo" title="O retorno combinado com o cliente já venceu">retorno vencido</span>');
  if (o && o.pediu_horario) saida.push('<span class="chip-ciclo" title="O cliente aprovou e pediu horário, mas o carro ainda não tem OS">pediu horário</span>');
  if (o && o.status === 'enviado' && o.esperando_horas != null && o.esperando_horas >= 48) saida.push(`<button type="button" class="chip-ciclo" data-copiar-recado='${esc(JSON.stringify({ nome: l.nome, total: o.total }))}' title="Copiar um recado pronto para o WhatsApp">copiar recado</button>`);
  if (p && p.link_cliente && p.no_patio) saida.push(`<button type="button" class="chip-ciclo" data-copiar-link="${esc(p.link_cliente)}" title="Copiar o link que o cliente usa para acompanhar o carro">link do cliente</button>`);
  if (c.extras_aprovados > 0) saida.push(`<span class="chip-ciclo" title="Extras aprovados pelo cliente no Pátio">+ ${brl(c.extras_aprovados)} extras</span>`);
  return saida.length ? `<div class="chips-ciclo">${saida.join('')}</div>` : '';
}

/* Recado de retomada de orçamento (vocabulário da casa; o valor é o do orçamento, nunca inventado). */
function recadoOrcamento({ nome, total }) {
  const primeiro = String(nome || '').trim().split(/\s+/)[0] || '';
  return `Oi${primeiro ? ', ' + primeiro : ''}! Aqui é da IndyCar. Passando para saber se deu tudo certo com o orçamento${total != null ? ' de ' + brl(total) : ''}. Posso ajudar com alguma dúvida ou já garantir o seu horário? Quem conhece, Indyca! 🏎`;
}

function linhaLead(l) {
  const ag = l.agendamento;
  const agTxt = ag ? `${dataBR(ag.data)} ${String(ag.hora || '').slice(0, 5)}<span class="mini"> · ${esc(ag.status)}</span>` : '<span class="mini">—</span>';
  const valor = l.status === 'concluido'
    ? (l.sem_valor ? `<a class="sem-valor" href="${esc(l.links.crm)}" target="_blank" rel="noopener noreferrer" title="Venda concluída sem valor pago: lançar o valor no CRM">sem valor · lançar</a>` : brl(l.valor_pago))
    : (l.valor_orcado ? `<span class="mini">orç. ${brl(l.valor_orcado)}</span>` : '—');
  // data-rotulo: em 375 px a linha vira cartão e cada célula mostra o nome da coluna. Lead de menos de 1 h ganha "novo".
  const recente = l.criado_em && Date.now() - Date.parse(l.criado_em) < 3600000;
  return `<tr class="${recente ? 'lead-recente' : ''}">
    <td class="num" data-rotulo="Quando"><span class="mini">${esc(quandoTxt(l.criado_em))}</span>${recente ? ' <span class="selo st-ok" title="Chegou há menos de 1 hora">novo</span>' : ''}</td>
    <th scope="row" class="nome-forte" data-rotulo="Lead">${esc(l.nome)}<br><span class="mini">${l.telefone ? `<button type="button" class="link mini" data-copiar-tel="${esc(l.telefone)}" title="Copiar o telefone">${esc(fmtTel(l.telefone))}</button>` : '—'}${l.carro ? ` · ${esc(l.carro)}` : ''}${l.placa ? ` · <span class="placa">${esc(l.placa)}</span>` : ''}</span></th>
    <td data-rotulo="Canal">${seloCanal(l.canal)}${l.campanha ? `<br><span class="mini" title="utm_campaign">${esc(l.campanha)}</span>` : ''}</td>
    <td data-rotulo="Status">${seloStatus(l)}${l.parado ? ` <span class="selo st-perdido" title="Lead novo há mais de 24 h sem primeiro toque">parado ${Math.max(1, Math.round(l.idade_horas / 24))} d</span>` : ''}${l.servico ? `<br><span class="mini">${esc(l.servico)}</span>` : ''}${chipsCiclo(l)}</td>
    <td data-rotulo="Agendamento">${agTxt}</td>
    <td class="num" data-rotulo="Valor">${valor}</td>
    <td data-rotulo="Responsável">${l.responsavel ? esc(l.responsavel) : '<span class="mini apagado-txt">sem responsável</span>'}</td>
    <td class="acoes-lead" data-rotulo="Abrir"><a class="btn btn-fantasma btn-mini" href="${esc(l.links.crm)}" target="_blank" rel="noopener noreferrer" title="Abrir este lead no CRM">CRM</a>${l.telefone ? '' : ' <span class="mini apagado-txt" title="Sem telefone no CRM: não dá para abrir conversa nem agendar por aqui">sem telefone</span>'}
      ${l.links.atendimento ? `<a class="btn btn-fantasma btn-mini" href="${esc(l.links.atendimento)}" target="_blank" rel="noopener noreferrer" title="Abrir a conversa no Atendimento">WhatsApp</a>` : ''}
      ${l.links.agenda ? `<a class="btn btn-fantasma btn-mini" href="${esc(l.links.agenda)}" target="_blank" rel="noopener noreferrer" title="${ag ? 'Abrir o agendamento na Agenda' : 'Agendar na Agenda'}">${ag ? 'Agenda' : 'Agendar'}</a>` : ''}
      ${l.links.orcador ? `<a class="btn btn-fantasma btn-mini" href="${esc(l.links.orcador)}" target="_blank" rel="noopener noreferrer" title="${l.ciclo?.orcamento ? 'Fazer outro orçamento para este cliente' : 'Montar orçamento no Orçador (já com o cliente)'}">${l.ciclo?.orcamento ? 'Orçar de novo' : 'Orçar'}</a>` : ''}
      <button type="button" class="btn btn-fantasma btn-mini" data-tarefa-lead='${esc(JSON.stringify({ id: l.id, cliente_id: l.cliente_id, nome: l.nome, servico: l.servico }))}' title="Criar uma tarefa para mim sobre este lead">Tarefa</button></td>
  </tr>`;
}

function desenharKPIsLeads(r) {
  const t = r.resumo, pc = t.por_canal || {};
  // Cada KPI é um botão: clicar aplica o filtro correspondente.
  const kpi = (rotulo, valor, sub = '', filtro = null) => `<button type="button" class="kpi kpi-botao" ${filtro ? `data-filtro='${esc(JSON.stringify(filtro))}'` : 'disabled'} title="${filtro ? 'Filtrar por ' + rotulo.toLowerCase() : ''}"><div class="rotulo">${rotulo}</div><div class="numero">${valor}</div><div class="var neutro">${sub}</div></button>`;
  $('#leads-kpis').innerHTML = [
    kpi('Leads', int(t.total), `${int(t.pagos)} de anúncio`, { canal: '', status: '', semResp: false }),
    kpi('Site', int(pc.site || 0), 'formulário do site', { canal: 'site' }),
    kpi('WhatsApp', int(pc.whatsapp || 0), 'direto no número', { canal: 'whatsapp' }),
    kpi('Anúncios', int((pc.meta || 0) + (pc.google || 0)), `Meta ${int(pc.meta || 0)} · Google ${int(pc.google || 0)}`, { canal: 'pagos' }),
    kpi('Agendaram', int(t.agendados), t.total ? `${dec(t.agendados * 100 / t.total, 0)}% dos leads` : '—', { status: 'agendado' }),
    kpi('Vendas', int(t.fechados), t.sem_valor ? `<span class="sem-valor">${int(t.sem_valor)} sem valor</span>` : (t.receita ? brl(t.receita) : '—'), { status: 'concluido' }),
    kpi('Parados +24 h', int(t.parados || 0), t.parados ? '<span class="desce">sem primeiro toque</span>' : 'ninguém esperando', { status: 'novo', ordem: 'parados' }),
    kpi('No pátio agora', int(t.no_patio || 0), t.entregues_oficina ? `${int(t.entregues_oficina)} já entregue(s)` : 'carros desses leads', { etapa: 'patio' }),
    kpi('Sem orçamento', int(t.sem_orcamento || 0), t.sem_orcamento ? '<span class="desce">agendado ou em serviço</span>' : 'todos orçados', { etapa: 'sem_orcamento' }),
    kpi('Orçamento esperando', int(t.orc_esperando || 0), t.orc_esperando ? brl(t.valor_orcado_aberto) : 'ninguém aguardando', { etapa: 'orc_esperando' }),
    kpi('Abriram e não responderam', int(t.orc_quentes || 0), t.orc_quentes ? '<span class="desce">hora de ligar</span>' : 'ninguém assim', { etapa: 'orc_quente' }),
    kpi('Pediram desconto', int(t.descontos || 0), t.descontos ? '<span class="desce">esperam o gestor</span>' : 'nenhum pedido', { etapa: 'desconto' }),
    kpi('Sem responsável', int(t.sem_responsavel), t.sem_responsavel ? '<span class="desce">distribua no CRM</span>' : 'todos com dono', { semResp: true }),
  ].join('');
  $$('#leads-kpis [data-filtro]').forEach(b => b.addEventListener('click', () => {
    const f = JSON.parse(b.dataset.filtro);
    if ('canal' in f) $('#leads-canal').value = f.canal;
    if ('status' in f) $('#leads-status').value = f.status;
    if ('semResp' in f) $('#leads-sem-resp').checked = f.semResp;
    if ('etapa' in f) $('#leads-etapa').value = f.etapa;
    if ('ordem' in f) $('#leads-ordem').value = f.ordem;
    carregarLeads();
  }));
}

async function carregarLeads() {
  const n = ++consultaLeads, status = $('#leads-estado');
  status.textContent = 'Lendo os leads do CRM…';
  $('#aba-leads').setAttribute('aria-busy', 'true');
  $('#leads-exportar').disabled = true; ultimoLeads = null;
  try {
    const p = paramsLeads(), r = await api(`/api/leads?${p}`);
    if (n !== consultaLeads) return;
    ultimoLeads = { dados: r, params: p.toString() };
    const filtrado = r.resumo.total !== r.total_periodo;
    if (r.ciclo_ok === false) aviso(r.ciclo_erro, true);
    status.textContent = `${dataBR(r.periodo.de)}${r.periodo.de !== r.periodo.ate ? ` a ${dataBR(r.periodo.ate)}` : ''} · ${int(r.resumo.total)} lead(s)${filtrado ? ` de ${int(r.total_periodo)} no período (filtro aplicado)` : ''}${r.cortado ? ' · mostrando os primeiros' : ''}.`;
    desenharKPIsLeads(r);
    estado.leads = r.leads;   // a busca global procura aqui também (sem nova chamada)
    // Chips por status (clicáveis) em cima da tabela
    const ps = r.resumo.por_status || {};
    const chipsStatus = Object.entries(r.status_nomes || {}).filter(([k]) => ps[k]).map(([k, n]) => `<button type="button" class="chip-canal" data-leads-status="${esc(k)}" title="Só ${n}"><span class="selo ${CLASSE_STATUS[k] || ''}">${esc(n)}</span> <strong>${int(ps[k])}</strong></button>`).join('');
    $('#lista-leads').innerHTML = r.leads.length
      ? `<div class="chips-canal">${chipsStatus}</div><div class="rolar" tabindex="0" role="region" aria-label="Leads do período"><table class="tabela-leads"><thead><tr>
          <th scope="col" class="num">Quando</th><th scope="col">Lead</th><th scope="col">Canal · campanha</th><th scope="col">Status</th>
          <th scope="col">Agendamento</th><th scope="col" class="num">Valor</th><th scope="col">Responsável</th><th scope="col">Abrir</th></tr></thead>
          <tbody>${r.leads.map(linhaLead).join('')}</tbody></table></div>
          ${r.cortado ? '<p class="mini">Mostrando os primeiros. <button type="button" class="link" data-leads-mais>Carregar até 1.000</button> ou use o CSV (até 5 mil).</p>' : ''}`
      : (r.total_periodo
        ? `<p class="vazio">Nenhum lead com esses filtros. <button type="button" class="link" id="leads-limpar-2">Limpar filtros</button></p>`
        : `<p class="vazio">Nenhum lead chegou ao CRM neste período.<span class="mini">Leads entram pelo site (formulário), pelo WhatsApp (o Atendimento cria sozinho) e pelos anúncios com UTM. Para testar, crie um lead no CRM: ele aparece aqui na hora.</span><a class="btn btn-fantasma btn-mini" data-eco="crm" href="${esc(Ecossistema.url('crm'))}/" target="_blank" rel="noopener noreferrer">Abrir o CRM</a></p>`);
    $$('#lista-leads [data-leads-status]').forEach(b => b.addEventListener('click', () => { $('#leads-status').value = b.dataset.leadsStatus; carregarLeads(); }));
    $('#leads-limpar-2')?.addEventListener('click', limparFiltrosLeads);
    $('#leads-exportar').disabled = !r.leads.length;
  } catch (e) {
    if (n !== consultaLeads) return;
    status.textContent = 'Leads indisponíveis agora.';
    $('#leads-kpis').innerHTML = '';
    $('#lista-leads').innerHTML = `<p class="recado" role="alert">${esc(e.message)}</p><button class="btn btn-fantasma btn-mini" type="button" id="leads-tentar">Tentar de novo</button>`;
    $('#leads-tentar').addEventListener('click', carregarLeads);
  } finally { if (n === consultaLeads) $('#aba-leads').removeAttribute('aria-busy'); }
}

function limparFiltrosLeads() {
  $('#leads-q').value = ''; $('#leads-canal').value = ''; $('#leads-status').value = ''; $('#leads-quando').value = '7'; $('#leads-sem-resp').checked = false;
  $('#leads-etapa').value = ''; $('#leads-ordem').value = 'recentes'; estado.leadsLimite = null;
  carregarLeads();
}

/** Abre a aba Leads já filtrada (vindo do Painel, de Campanhas ou da busca). */
function abrirLeadsCom({ q = '', canal = '', status = '', quando = '30', semResp = false, etapa = '' } = {}) {
  $('#leads-etapa').value = etapa;
  $('#leads-q').value = q; $('#leads-canal').value = canal; $('#leads-status').value = status; $('#leads-quando').value = quando; $('#leads-sem-resp').checked = semResp;
  trocarAba('leads');
}

/* Rodada 6: cartão "Oficina agora" do Painel — carros no pátio e orçamentos esperando, com atalho para a OS/orçamento. */
async function carregarOficinaAgora() {
  const alvo = $('#bloco-oficina');
  if (!alvo) return;
  try {
    const v = await api('/api/oficina-agora');
    if (v.indisponivel) { alvo.innerHTML = `<p class="mini desce">${esc(v.motivo)}</p>`; return; }
    const carros = v.carros.map(c => `<li><a href="${esc(c.link_os)}" target="_blank" rel="noopener noreferrer" title="Abrir a OS no Pátio">${esc(c.nome)}</a> <span class="mini">${c.carro ? esc(c.carro) + ' · ' : ''}<span class="chip-ciclo chip-patio-agora">${esc(c.etapa_nome.toLowerCase())}</span>${c.pronto_horas >= 24 ? ` · pronto há ${Math.round(c.pronto_horas / 24)} dia(s)` : ''}</span></li>`).join('');
    const orcs = v.orcamentos.map(c => `<li><a href="${esc(c.link_orcamento)}" target="_blank" rel="noopener noreferrer" title="Abrir o orçamento no Orçador">${esc(c.nome)}</a> <span class="mini">${brl(c.total)}${c.esperando_horas != null ? ` · ${esc(haQuanto(new Date(Date.now() - c.esperando_horas * 3600000).toISOString()).replace('há ', 'esperando há '))}` : ''} · <a href="${esc(c.link_crm)}" target="_blank" rel="noopener noreferrer">lead</a></span></li>`).join('');
    alvo.innerHTML = (v.no_patio || v.orc_esperando)
      ? `<div class="cartoes">
          <div class="kpi"><div class="rotulo">Carros no pátio</div><div class="numero">${int(v.no_patio)}</div><div class="var ${v.prontos_parados ? 'desce' : 'neutro'}">${v.prontos_parados ? int(v.prontos_parados) + ' pronto(s) sem retirar' : 'nenhum parado'}</div></div>
          <div class="kpi"><div class="rotulo">Orçamentos esperando</div><div class="numero">${int(v.orc_esperando)}</div><div class="var neutro">${brl(v.valor_esperando)} em aberto</div></div>
          <div class="kpi"><div class="rotulo">Entregues (30 dias)</div><div class="numero">${int(v.entregues || 0)}</div><div class="var neutro">${v.receita_entregues > 0 ? brl(v.receita_entregues) + ' pagos' : 'sem valor lançado'}</div></div></div>
        <div class="grade-2"><div>${carros ? `<ul class="ultimos-leads">${carros}</ul>` : '<p class="mini">Nenhum carro de anúncio no pátio.</p>'}</div>
        <div>${orcs ? `<ul class="ultimos-leads">${orcs}</ul>` : '<p class="mini">Nenhum orçamento esperando.</p>'}</div></div>`
      : `<p class="vazio">Nenhum carro de anúncio no pátio e nenhum orçamento esperando resposta.<span class="mini">Últimos ${int(v.dias)} dias de leads de Meta e Google.</span></p>`;
  } catch (e) { alvo.innerHTML = `<p class="mini desce">Não consegui ler o Pátio e o Orçador agora. ${esc(e.message)}</p>`; }
}

/* Cartão "Leads de hoje" no Painel. */
async function carregarLeadsHoje() {
  const alvo = $('#bloco-leads-hoje');
  try {
    const h = await api('/api/leads/hoje');
    estado.leadsHoje = h.ultimos || [];
    const pc = h.por_canal || {};
    const pino = $('#pino-leads'); pino.hidden = !h.total; pino.textContent = String(h.total);
    const chips = [['site', 'Site'], ['whatsapp', 'WhatsApp'], ['meta', 'Meta'], ['google', 'Google'], ['indicacao', 'Indicação'], ['organico', 'Orgânico'], ['telefone', 'Telefone']]
      .filter(([c]) => pc[c]).map(([c, n]) => `<button type="button" class="chip-canal" data-leads-canal="${c}" title="Ver só ${n}">${seloCanal(c)} <strong>${int(pc[c])}</strong></button>`).join('');
    alvo.innerHTML = h.total
      ? `<div class="leads-hoje-topo"><span class="numero">${int(h.total)}</span><span class="mini">lead(s) novo(s) hoje${h.ultimo_em ? ` · último ${esc(haQuanto(h.ultimo_em))}` : ''}${h.sem_responsavel ? ` · <button type="button" class="link desce" data-leads-sem-resp title="Ver os leads de hoje sem responsável">${int(h.sem_responsavel)} sem responsável</button>` : ''}</span></div>
         <div class="chips-canal">${chips}</div>
         <ul class="ultimos-leads">${h.ultimos.slice(0, 5).map(l => `<li>${seloCanal(l.canal)} <a href="${esc(l.links.crm)}" target="_blank" rel="noopener noreferrer" title="Abrir no CRM">${esc(l.nome)}</a>
           <span class="mini">${esc(quandoTxt(l.criado_em))} · ${esc(l.status_nome)}${l.campanha ? ` · ${esc(l.campanha)}` : ''}</span></li>`).join('')}</ul>`
      : `<p class="vazio">Nenhum lead novo hoje ainda.<span class="mini">Quando alguém preenche o site, manda WhatsApp ou clica num anúncio com UTM, aparece aqui e no CRM.</span></p>`;
    alvo.querySelectorAll('[data-leads-canal]').forEach(b => b.addEventListener('click', () => abrirLeadsCom({ canal: b.dataset.leadsCanal, quando: 'hoje' })));
    alvo.querySelector('[data-leads-sem-resp]')?.addEventListener('click', () => abrirLeadsCom({ quando: 'hoje', semResp: true }));
  } catch (e) { alvo.innerHTML = `<p class="mini desce">Não consegui ler o CRM agora. ${esc(e.message)}</p>`; }
}

/* ---------------- busca global (Ctrl+K) ---------------- */
let itensBusca = [], buscaCRM = null, buscaSel = 0, buscaTimer = null;

function itensFixos() {
  const abas = Object.entries(TITULOS).map(([k, [t, s]]) => ({ tipo: 'aba', titulo: t, detalhe: s, abrir: () => trocarAba(k) }));
  const acoes = [
    { tipo: 'ação', titulo: 'Nova regra do radar', detalhe: 'abre o formulário', abrir: () => { trocarAba('radar'); abrirRegra(null); } },
    { tipo: 'ação', titulo: 'Trocar tema', detalhe: 'claro / escuro', abrir: () => aplicarTema(temaAtual() === 'claro' ? 'escuro' : 'claro', true) },
    { tipo: 'ação', titulo: 'Atualizar dados', detalhe: 'puxa Meta e Google de novo', abrir: () => $('#btn-sync').click() },
    { tipo: 'ação', titulo: 'O que fazer agora', detalhe: 'clientes de anúncio esperando você', abrir: () => { trocarAba('painel'); setTimeout(() => document.getElementById('cartao-acoes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200); } },
    { tipo: 'ação', titulo: 'Fechamento do mês', detalhe: 'texto para o dono, com copiar e enviar', abrir: () => { trocarAba('relatorios'); setTimeout(() => $('#fech-gerar').click(), 300); } },
    { tipo: 'ação', titulo: 'Gerar prévia do relatório', detalhe: 'não envia nada', abrir: () => { trocarAba('relatorios'); setTimeout(() => $('#btn-previa').click(), 200); } },
    { tipo: 'ação', titulo: 'Minha conta', detalhe: 'perfil, senha, duas etapas', abrir: () => abrirConta('perfil') },
    { tipo: 'ação', titulo: 'Minhas tarefas', detalhe: 'abertas com você', abrir: () => { $('#modal-tarefas').showModal(); carregarTarefas(); } },
    { tipo: 'ação', titulo: 'Ajuda e atalhos', detalhe: '?', abrir: abrirAjuda },
  ];
  const campanhas = (estado.ranking || []).map(c => ({ tipo: 'campanha', titulo: c.nome, detalhe: `${c.plataforma === 'meta' ? 'Meta' : 'Google'} · ${brl(c.gasto)} · CPA ${brl(c.cpa)}`, abrir: () => { $('#busca-campanhas').value = c.nome; trocarAba('campanhas'); } }));
  const criativos = (estado.criativos || []).map(c => ({ tipo: 'criativo', titulo: c.nome, detalhe: `${c.campanha_nome || ''} · ${brl(c.gasto)}`, abrir: () => trocarAba('criativos') }));
  const regras = (regrasCache || []).map(r => ({ tipo: 'regra', titulo: r.nome, detalhe: `${ROTULO_METRICA[r.metrica] || r.metrica} ${r.operador} ${dec(r.valor)}${r.ativa ? '' : ' · desligada'}`, abrir: () => { trocarAba('radar'); abrirRegra(r); } }));
  const alertas = (estado.alertas || []).slice(0, 40).map(a => ({ tipo: 'alerta', titulo: a.regra_nome || 'Alerta', detalhe: String(a.mensagem || '').slice(0, 120), abrir: () => trocarAba('radar') }));
  // Leads já carregados (aba Leads e "hoje"): resposta na hora, antes de a busca no CRM voltar.
  const vistos = new Set();
  const leadsLocais = [...(estado.leadsHoje || []), ...(estado.leads || [])].filter(l => !vistos.has(l.id) && vistos.add(l.id)).slice(0, 300)
    .map(l => ({ tipo: 'lead', titulo: l.nome, telefone: l.telefone, detalhe: `${fmtTel(l.telefone)} · ${NOME_CANAL[l.canal] || l.canal} · ${l.status_nome}${l.placa ? ' · ' + l.placa : ''}`, abrir: () => abrirNaCasa(l.links.crm) }));
  // Rodada 6: o carro no Pátio e o orçamento do lead também aparecem na busca (nome, placa ou telefone) e abrem direto na tela deles.
  const cicloLocais = [...(estado.leadsHoje || []), ...(estado.leads || [])].filter(l => l.links?.os || l.links?.orcamento).slice(0, 300).flatMap(l => [
    l.links.os && { tipo: 'os', titulo: `OS de ${l.nome}`, telefone: l.telefone, detalhe: `Pátio · ${l.ciclo.os.etapa_nome}${l.placa ? ' · ' + l.placa : ''} · ${fmtTel(l.telefone)}`, abrir: () => abrirNaCasa(l.links.os) },
    l.links.orcamento && { tipo: 'orçamento', titulo: `Orçamento de ${l.nome}`, telefone: l.telefone, detalhe: `Orçador · ${l.ciclo.orcamento.status_nome}${l.ciclo.orcamento.total != null ? ' · ' + brl(l.ciclo.orcamento.total) : ''}${l.placa ? ' · ' + l.placa : ''}`, abrir: () => abrirNaCasa(l.links.orcamento) },
  ].filter(Boolean));
  // Rodada 7: os itens da fila "o que fazer agora" também aparecem na busca e abrem a primeira tela útil (conversa, orçamento, OS…).
  const acoesFila = ((estado.acoes && estado.acoes.itens) || []).filter(x => x.botoes && x.botoes[0]).slice(0, 60)
    .map(x => ({ tipo: 'ação', titulo: `${x.nome || 'Cliente'} · ${x.titulo}`, telefone: x.telefone, detalhe: `${x.motivo || ''}${x.placa ? ' · ' + x.placa : ''}`, abrir: () => abrirNaCasa(x.botoes[0].link) }));
  const eco = Ecossistema.ORDEM.filter(k => !Ecossistema.APPS[k].aqui).map(k => ({ tipo: 'app', titulo: Ecossistema.nome(k), detalhe: 'abrir outro sistema do ecossistema', abrir: () => { abrirNaCasa(Ecossistema.url(k) + '/'); } }));
  return [...abas, ...acoes, ...campanhas, ...criativos, ...regras, ...alertas, ...leadsLocais, ...cicloLocais, ...acoesFila, ...eco];
}

function abrirBusca() {
  fecharMenus();
  const m = $('#modal-busca');
  itensBusca = itensFixos(); buscaCRM = null; buscaSel = 0;
  $('#busca-q').value = '';
  desenharBusca();
  if (!m.open) m.showModal();
  $('#busca-q').focus();
}

function desenharBusca() {
  const q = $('#busca-q').value;
  const locais = q.trim() ? Busca.filtrar(itensBusca, q, 10) : itensBusca.filter(i => i.tipo === 'aba').slice(0, 8);
  const lista = [...(buscaCRM || []), ...locais].slice(0, 14);
  buscaSel = Math.min(buscaSel, Math.max(0, lista.length - 1));
  $('#busca-lista').innerHTML = lista.length
    ? lista.map((it, i) => `<li role="option" aria-selected="${i === buscaSel}" class="${i === buscaSel ? 'sel' : ''}" data-i="${i}">
        <span class="busca-tipo">${esc(it.tipo)}</span><div><strong>${esc(it.titulo)}</strong>${it.detalhe ? `<span class="mini">${esc(it.detalhe)}</span>` : ''}</div></li>`).join('')
    : `<li class="mini vazio-busca">${q.trim() ? (Busca.valeBuscarNoCRM(q) ? 'Nada por aqui. Procurando no CRM…' : 'Nada encontrado. Para procurar lead, digite 3 letras do nome ou 4 dígitos do telefone.') : 'Digite para buscar.'}</li>`;
  $('#busca-lista').dataset.n = String(lista.length);
  $('#busca-lista')._itens = lista;
}

async function buscarNoCRM(q) {
  if (!Busca.valeBuscarNoCRM(q)) { buscaCRM = null; return desenharBusca(); }
  try {
    const hoje = hojeSP();
    const r = await api(`/api/leads?de=${diaMenos(hoje, 89)}&ate=${hoje}&q=${encodeURIComponent(q)}&limite=6`);
    if ($('#busca-q').value !== q) return;
    const jaLocais = new Set(itensBusca.filter(i => i.tipo === 'lead').map(i => i.titulo + i.telefone));
    buscaCRM = r.leads.filter(l => !jaLocais.has(l.nome + l.telefone)).map(l => ({ tipo: 'lead', titulo: l.nome, telefone: l.telefone,
      detalhe: `${fmtTel(l.telefone)} · ${NOME_CANAL[l.canal] || l.canal} · ${l.status_nome} · ${quandoTxt(l.criado_em)}`,
      abrir: () => abrirNaCasa(l.links.crm) }));
    if (!buscaCRM.length) buscaCRM = [{ tipo: 'lead', titulo: `Nenhum lead "${q}" nos últimos 90 dias`, detalhe: 'abrir a aba Leads com esta busca', abrir: () => abrirLeadsCom({ q, quando: '30' }) }];
  } catch { buscaCRM = null; }
  desenharBusca();
}

function escolherBusca(i) {
  const it = ($('#busca-lista')._itens || [])[i];
  if (!it) {
    // Enter sem resultado: abre a aba Leads com a busca (procura em 30 dias, com filtros à mão).
    const q = $('#busca-q').value.trim();
    if (q) { $('#modal-busca').close(); abrirLeadsCom({ q, quando: '30' }); }
    return;
  }
  $('#modal-busca').close();
  it.abrir();
}

/* ---------------- ajuda e atalhos ---------------- */
function abrirAjuda() {
  fecharMenus();
  $('#lista-atalhos').innerHTML = Busca.ATALHOS.map(a => `<li><kbd>${esc(a.tecla)}</kbd><span>${esc(a.rotulo)}</span></li>`).join('');
  $('#ajuda-versao').textContent = estado.versao ? `Central de Tráfego Pago v${estado.versao}` : '';
  const m = $('#modal-ajuda');
  if (!m.open) m.showModal();
}

function executarAtalho(acao) {
  if (!acao) return false;
  if (acao === 'fechar') {
    const aberto = $$('dialog[open]');
    if (aberto.length) { aberto.at(-1).close(); return true; }
    fecharMenus(); return true;
  }
  if (acao === 'busca') { abrirBusca(); return true; }
  if (acao === 'ajuda') { abrirAjuda(); return true; }
  if (acao.startsWith('aba:')) { trocarAba(acao.slice(4)); return true; }
  if (acao === 'atualizar') { recarregarAbaAtual(); aviso('Atualizando…'); return true; }
  if (acao === 'tema') { aplicarTema(temaAtual() === 'claro' ? 'escuro' : 'claro', true); return true; }
  if (acao === 'nova-regra') { trocarAba('radar'); abrirRegra(null); return true; }
  if (acao === 'imprimir') { window.print(); return true; }
  if (acao === 'exportar') {
    const alvo = { leads: '#leads-exportar', resultados: '#crm-exportar', campanhas: '[data-csv="campanha"]', criativos: '[data-csv="anuncio"]', radar: '#btn-csv-alertas' }[estado.aba];
    const b = alvo && $(alvo);
    if (b && !b.disabled) { b.click(); return true; }
    aviso('Esta aba não tem CSV para exportar.'); return true;
  }
  return false;
}

function ligarOperacao() {
  ligarLinksEco(); nomearAbasDaCasa();
  $('#form-leads').addEventListener('submit', e => { e.preventDefault(); carregarLeads(); });
  $('#leads-canal').addEventListener('change', carregarLeads);
  $('#leads-status').addEventListener('change', carregarLeads);
  $('#leads-etapa').addEventListener('change', carregarLeads);
  $('#leads-quando').addEventListener('change', carregarLeads);
  $('#leads-limpar').addEventListener('click', limparFiltrosLeads);
  $('#leads-exportar').addEventListener('click', e => ocupado(e.currentTarget, async () => {
    if (!ultimoLeads) return;
    try { await baixarCSV(`/api/leads.csv?${ultimoLeads.params}`, 'leads.csv'); aviso('CSV dos leads baixado com o filtro da tela.'); }
    catch (erro) { aviso(erro.message, true); }
  }));
  $$('[data-ir]').forEach(b => b.addEventListener('click', () => trocarAba(b.dataset.ir)));
  $('#btn-oficina-patio')?.addEventListener('click', () => abrirLeadsCom({ canal: 'pagos', etapa: 'patio', quando: '30' }));
  $('#btn-leads-hoje-lista').addEventListener('click', () => abrirLeadsCom({ quando: 'hoje' }));
  // Primeira visita depois da rodada 5: um aviso curto do que mudou (uma vez por navegador).
  try {
    if (!localStorage.getItem('ads-novidades-r7')) {
      setTimeout(() => { aviso('Novo: o Painel tem “O que fazer agora” (clientes de anúncio esperando você, com botões para a conversa, o orçamento e a OS) e Relatórios tem o fechamento do mês.'); }, 2500);
      localStorage.setItem('ads-novidades-r7', '1');
    } else if (!localStorage.getItem('ads-novidades-r6')) {
      setTimeout(() => { aviso('Novo: Resultados CRM mostra o anúncio até o carro entregue, e o Painel tem “Oficina agora”. Links abrem na aba do Pátio, Orçador e CRM.'); }, 2500);
      localStorage.setItem('ads-novidades-r6', '1');
    } else if (!localStorage.getItem('ads-novidades-r5')) {
      setTimeout(() => { aviso('Novo: aba Leads (tecla 2), busca em tudo com Ctrl+K e a tecla ? mostra os atalhos.'); }, 2500);
      localStorage.setItem('ads-novidades-r5', '1');
    }
  } catch {}

  // Busca global
  $('#btn-busca').addEventListener('click', abrirBusca);
  $('#form-busca').addEventListener('submit', e => { e.preventDefault(); escolherBusca(buscaSel); });
  $('#busca-q').addEventListener('input', () => {
    buscaSel = 0; buscaCRM = null; desenharBusca();
    clearTimeout(buscaTimer);
    const q = $('#busca-q').value.trim();
    if (q) buscaTimer = setTimeout(() => buscarNoCRM(q), 350);
  });
  $('#busca-q').addEventListener('keydown', e => {
    const n = Number($('#busca-lista').dataset.n || 0);
    if (e.key === 'ArrowDown') { e.preventDefault(); buscaSel = (buscaSel + 1) % Math.max(1, n); desenharBusca(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); buscaSel = (buscaSel - 1 + Math.max(1, n)) % Math.max(1, n); desenharBusca(); }
  });
  $('#busca-lista').addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) escolherBusca(Number(li.dataset.i)); });
  // Clique fora da caixa fecha o diálogo
  $$('#modal-busca, #modal-ajuda').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

  // Ajuda
  $('#btn-ajuda').addEventListener('click', abrirAjuda);

  // Atalhos de teclado (regra pura em busca.js)
  document.addEventListener('keydown', e => {
    if ($('#app').hidden) return;
    const alvo = e.target;
    const emCampo = alvo && (/^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || alvo.isContentEditable);
    const acao = Busca.acaoDaTecla({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, emCampo, modalAberto: !!$('dialog[open]') });
    if (acao === 'fechar' && !$('dialog[open]') && $('#menu-conta').hidden && $('#painel-sino').hidden) return;
    if (executarAtalho(acao)) e.preventDefault();
  });

  // Filtro de campanhas pelo nome (aba Campanhas)
  $('#busca-campanhas').addEventListener('input', () => filtrarTabela('#tabela-campanhas', $('#busca-campanhas').value));
  $('#busca-criativos').addEventListener('input', () => filtrarTabela('#tabela-criativos', $('#busca-criativos').value));
  // Ordem da lista de leads e "carregar mais"
  $('#leads-ordem').addEventListener('change', carregarLeads);
  $('#lista-leads').addEventListener('click', e => {
    const rec = e.target.closest('[data-copiar-recado]');
    if (rec) { navigator.clipboard?.writeText(recadoOrcamento(JSON.parse(rec.dataset.copiarRecado))).then(() => aviso('Recado copiado. É só colar no WhatsApp.')).catch(() => aviso('Não consegui copiar; selecione o texto à mão.', true)); return; }
    const lk = e.target.closest('[data-copiar-link]');
    if (lk) { navigator.clipboard?.writeText(lk.dataset.copiarLink).then(() => aviso('Link do cliente copiado.')).catch(() => aviso('Não consegui copiar o link.', true)); return; }
    if (e.target.closest('[data-leads-mais]')) { estado.leadsLimite = 1000; carregarLeads(); }
    const cp = e.target.closest('[data-copiar-tel]');
    if (cp) navigator.clipboard?.writeText(cp.dataset.copiarTel).then(() => aviso('Telefone copiado.'), () => aviso('Não deu para copiar aqui.', true));
    const tf = e.target.closest('[data-tarefa-lead]');
    if (tf) abrirTarefaDoLead(JSON.parse(tf.dataset.tarefaLead));
  });
  // Cartão "leads de hoje" se atualiza sozinho a cada 5 min e ao voltar para a aba do navegador.
  setInterval(() => {
    if ($('#app').hidden || document.visibilityState !== 'visible') return;
    if (estado.aba === 'painel') { carregarLeadsHoje().catch(() => {}); carregarOficinaAgora().catch(() => {}); carregarAcoes().catch(() => {}); }
    else if (typeof carregarAcoes === 'function') carregarAcoes().catch(() => {});   // o pino "esperando você" do Painel segue fresco nas outras abas
    // Nas outras abas só o pino "Leads" se atualiza (chamada leve, com cache de 30 s no servidor).
    else api('/api/leads/hoje').then(h => { const p = $('#pino-leads'); p.hidden = !h.total; p.textContent = String(h.total); }).catch(() => {});
  }, 5 * 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('#app').hidden && estado.aba === 'painel') carregarLeadsHoje().catch(() => {}); });
}

/* Esconde linhas da tabela que não casam com o termo (puro DOM; a conta já veio do servidor). */
function filtrarTabela(sel, termo) {
  const q = Busca.normalizar(termo);
  const linhas = $$(`${sel} tbody tr`);
  let vistas = 0;
  linhas.forEach(tr => { const ok = !q || Busca.normalizar(tr.textContent).includes(q); tr.hidden = !ok; if (ok) vistas++; });
  const aviso = $(`${sel} .filtro-vazio`);
  if (aviso) aviso.remove();
  if (linhas.length && !vistas) $(`${sel} table`)?.insertAdjacentHTML('afterend', `<p class="mini filtro-vazio">Nenhuma campanha com "${esc(termo)}".</p>`);
}
