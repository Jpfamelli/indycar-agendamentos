/* ============================================================
   IndyCar CRM — rodada 6, segunda leva (C5, 21/10/2026), servidor
   Conexões vivas do lead com os outros sistemas:
   - Orçador: status do orçamento ao vivo (enviado, visto, aprovado, recusado) pelas
     rpcs orc_status_por_lead / orc_status_por_telefone, lidas COM O LOGIN DE QUEM PEDIU
     (as rpcs conferem o perfil; com a chave de serviço elas voltam vazias).
   - Site: observações "CARRO NO PÁTIO AGORA", "Cliente já cadastrado" e "Horário escolhido".
   - Orçador → Agenda: pré-agendamentos ("PRÉ-AGENDAMENTO …") esperando confirmação.
   - Pátio: patio_carros_abertos() para mostrar a etapa e achar carros sem lead.
   - Ficha: r6_cliente_360 (links absolutos, ações sugeridas) com plano B no cliente_360.
   - Busca em todos os sistemas (r6_busca_global), "Agora na casa" (r6_agora) e
     ligações quebradas (r6_ligacoes_quebradas, só gestor).
   Funções puras no topo (testáveis sem banco); rotas embaixo.
   ============================================================ */
'use strict';

const U = require('./util-servidor');
const APPS = require('./apps');
const R5 = require('./rodada5');
const { ehUuid, falha, ehGestor, r2, DIA } = U;
const ABERTAS = R5.ABERTAS;
const e164 = R5.normalizarTelefone;

const ms = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : NaN; };
const semControle = s => String(s ?? '').replace(/[\p{C}]/gu, ' ').replace(/\s+/g, ' ').trim();
const semAcento = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/* ---------------- endereços que a casa conhece ---------------- */
const DOMINIOS_DA_CASA = new Set([
  'indycar-agendamentos.onrender.com', 'indycar-atendimento.onrender.com', 'indycar-crm.onrender.com', 'indycar-posvenda.onrender.com',
  'indycar-orcador.netlify.app', 'indycar-patio.netlify.app', 'indycar-taubate.netlify.app', 'wa.me',
]);
/** Só devolve o endereço se for http(s) de um domínio da casa (ou caminho relativo do próprio app). Senão null. */
function linkSeguro(href, { extras = [] } = {}) {
  const s = String(href ?? '').trim();
  if (!s || /[\u0000-\u001f\u007f\s]/.test(s)) return null;
  if (s.startsWith('/') && !s.startsWith('//') && !s.includes('\\')) return s.length <= 600 ? s : null;
  let u; try { u = new URL(s); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  const hosts = new Set([...DOMINIOS_DA_CASA, ...extras]);
  try { for (const h of APPS.origens()) hosts.add(new URL(h).hostname); } catch { /* segue */ }
  if (!hosts.has(u.hostname.toLowerCase())) return null;
  return s.length <= 900 ? s : null;
}

/* ---------------- rpc com o login de quem pediu ---------------- */
const bearerDe = req => { const m = /^\s*bearer\s+(\S+)\s*$/i.exec(req?.headers?.authorization || ''); return m ? m[1] : null; };
/**
 * Chama uma função do banco COM O JWT DA PESSOA. As rpcs do Orçador (orc_status_*) conferem
 * `usuario_ativo()` e o papel; com a chave de serviço elas devolvem vazio.
 * Devolve { data, error } (nunca lança, nunca imprime o token).
 */
async function rpcComoUsuario({ fetch: f, url, anonKey, token, timeoutMs = 8000 }, nome, args = {}) {
  if (!f || !url || !anonKey || !token) return { data: null, error: { message: 'sem_login_para_rpc', codigo: 'sem_login' } };
  if (!/^[a-z0-9_]+$/.test(nome)) return { data: null, error: { message: 'nome_invalido' } };
  try {
    const r = await f(`${String(url).replace(/\/$/, '')}/rest/v1/rpc/${nome}`, {
      method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(args), signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    let corpo = null; try { corpo = await r.json(); } catch { /* sem corpo */ }
    if (!r.ok) return { data: null, error: { message: String(corpo?.message || corpo?.erro || 'falha ' + r.status).slice(0, 200), codigo: String(corpo?.code || r.status) } };
    return { data: corpo, error: null };
  } catch (e) { return { data: null, error: { message: String(e?.message || e).slice(0, 200), codigo: 'rede' } }; }
}

/* ---------------- observações que os outros sistemas escrevem no lead ---------------- */
const ROTULO_ETAPA = { recebido: 'Recebido', diagnostico: 'Diagnóstico', aguardando_aprovacao: 'Aguardando aprovação', aguardando_peca: 'Aguardando peça', em_execucao: 'Em execução', teste: 'Teste', pronto: 'Pronto', entregue: 'Entregue' };
const rotuloEtapa = e => ROTULO_ETAPA[String(e || '').replace(/\s+/g, '_').toLowerCase()] || semControle(e).slice(0, 40);
/**
 * Lê o que o site, o Orçador e a Agenda escreveram em `leads.observacoes`.
 * Tudo que sai daqui vai para a tela com esc(); aqui só limpa e corta.
 */
function lerObservacoes(obs) {
  const t = String(obs ?? '').slice(0, 6000);
  const out = { carro_no_patio: null, cliente_ja_cadastrado: false, horario_escolhido: null, orcador: [], recusas: {}, pre_agendamento: false };
  const patio = /CARRO NO P[ÁA]TIO AGORA(?::\s*OS\s*n[º°o.]*\s*(\d{1,7})\s*(?:\(([^)\n]{1,60})\))?)?/i.exec(t);
  if (patio) out.carro_no_patio = { os_numero: patio[1] ? Number(patio[1]) : null, etapa: patio[2] ? semControle(patio[2]).replace(/\s+/g, '_').toLowerCase() : null, etapa_rotulo: patio[2] ? rotuloEtapa(patio[2]) : null };
  out.cliente_ja_cadastrado = /Cliente j[áa] cadastrado na oficina/i.test(t);
  const h = /Hor[áa]rio escolhido[^:\n]{0,40}:\s*([^\n]{1,120})/i.exec(t);
  if (h) out.horario_escolhido = semControle(h[1]).replace(/[.;]+$/, '');
  for (const linha of t.split(/\n+/)) {
    const m = /^\s*\[Or[çc]ador\s+(\d{2}\/\d{2})\s+(\d{2}:\d{2})\]\s*(.{1,400})$/.exec(linha);
    if (!m) continue;
    const txt = semControle(m[3]);
    out.orcador.push({ quando: `${m[1]} ${m[2]}`, texto: txt });
    const rec = /Or[çc]amento n[º°o.]*\s*0*(\d{1,7})\s+recusado(?:\s*[—–-]\s*motivo:\s*(.+?))?\.?$/i.exec(txt);
    if (rec) out.recusas[Number(rec[1])] = rec[2] ? semControle(rec[2]).replace(/\.$/, '') : null;
  }
  out.orcador = out.orcador.slice(-8);
  out.pre_agendamento = /PR[ÉE]-AGENDAMENTO/i.test(t);
  return out;
}

/* ---------------- orçamento ao vivo ---------------- */
const TOM = { neutro: 'neutro', ok: 'ok', atencao: 'atencao', alerta: 'alerta' };
/**
 * Em que pé está o orçamento (linha de orc_status_cliente) e o que fazer a seguir.
 * `visto_dias`/`enviado_dias` em dias inteiros desde o evento.
 */
function classificarOrcamento(o, agora = Date.now()) {
  const st = String(o?.status || '');
  const dias = v => { const t = ms(v); return Number.isFinite(t) ? Math.max(0, Math.floor((agora - t) / DIA)) : null; };
  const enviado_dias = dias(o?.enviado_em), visto_dias = dias(o?.visualizado_em), decidido_dias = dias(o?.decidido_em);
  const base = { enviado_dias, visto_dias, decidido_dias };
  if (st === 'aprovado') {
    if (!o.agendamento_id) return { ...base, cod: 'aprovado_sem_horario', rotulo: 'Aprovado, falta marcar o horário', tom: TOM.atencao, acao: 'Marcar o horário na Agenda', peso: 1 };
    return { ...base, cod: 'aprovado', rotulo: o.aprovado_parcial ? 'Aprovado em parte' : 'Aprovado', tom: TOM.ok, acao: 'Acompanhar o carro no Pátio', peso: 6 };
  }
  if (st === 'recusado') return { ...base, cod: 'recusado', rotulo: 'Recusado', tom: TOM.alerta, acao: 'Entender o motivo e ver se cabe outra opção', peso: 3 };
  if (st === 'expirado') return { ...base, cod: 'expirado', rotulo: 'Venceu a validade', tom: TOM.atencao, acao: 'Refazer o orçamento e avisar o cliente', peso: 4 };
  if (st === 'aberto') return { ...base, cod: 'montagem', rotulo: 'Em montagem (ainda não enviado)', tom: TOM.neutro, acao: 'Terminar e enviar', peso: 7 };
  if (st === 'enviado') {
    if (o.visualizado_em) return { ...base, cod: 'visto', rotulo: visto_dias ? `O cliente abriu há ${visto_dias} d e não respondeu` : 'O cliente abriu e ainda não respondeu', tom: visto_dias >= 1 ? TOM.alerta : TOM.atencao, acao: 'Perguntar se ficou alguma dúvida', peso: 2 };
    if (enviado_dias >= 2) return { ...base, cod: 'parado', rotulo: `Enviado há ${enviado_dias} d e ainda não aberto`, tom: TOM.alerta, acao: 'Confirmar se o cliente recebeu o link', peso: 2 };
    return { ...base, cod: 'enviado', rotulo: 'Enviado, esperando o cliente', tom: TOM.neutro, acao: 'Esperar a resposta', peso: 5 };
  }
  return { ...base, cod: 'outro', rotulo: semControle(st) || 'Sem situação', tom: TOM.neutro, acao: '', peso: 9 };
}
/** Valor que a pessoa pode ver: o aprovado (se houver) senão o total; null quando o papel não vê valores. */
function valorDoOrcamento(o) {
  const a = o?.total_aprovado, t = o?.total;
  if (a != null && Number(a) > 0) return r2(a);
  if (t != null && Number.isFinite(Number(t))) return r2(t);
  return null;
}
/** Junta as linhas do Orçador numa lista pronta para a tela, com o motivo da recusa lido das observações do lead. */
function prepararOrcamentos(linhas, { observacoes = '', agora = Date.now() } = {}) {
  const recusas = lerObservacoes(observacoes).recusas;
  const itens = (Array.isArray(linhas) ? linhas : []).filter(o => o && ehUuid(o.id)).map(o => {
    const c = classificarOrcamento(o, agora);
    const link = o.link_orcador && linkSeguro(o.link_orcador) ? o.link_orcador : APPS.linkApp('orcador', '/#/historico/' + encodeURIComponent(o.id));
    return {
      id: o.id, numero: o.numero ?? null, status: o.status, situacao: c, valor: valorDoOrcamento(o), parcial: !!o.aprovado_parcial, carro: semControle(o.carro).slice(0, 80) || null, placa: o.placa || null,
      servicos: semControle(o.servicos).slice(0, 160) || null, enviado_em: o.enviado_em || null, visualizado_em: o.visualizado_em || null, decidido_em: o.decidido_em || null, follow_up_em: o.follow_up_em || null,
      agendamento_id: o.agendamento_id || null, motivo: o.status === 'recusado' ? (recusas[o.numero] ?? null) : null,
      link_equipe: link, link_cliente: o.link_cliente && linkSeguro(o.link_cliente) ? o.link_cliente : null, criado_em: o.criado_em || null,
    };
  });
  itens.sort((a, b) => a.situacao.peso - b.situacao.peso || String(b.criado_em || '').localeCompare(String(a.criado_em || '')));
  return itens;
}
/** Números do conjunto: o que pede ação, valor esperando resposta, valor aprovado. */
function resumirOrcamentos(itens) {
  const lista = itens || [];
  const conta = {};
  for (const i of lista) conta[i.situacao.cod] = (conta[i.situacao.cod] || 0) + 1;
  const soma = f => r2(lista.filter(f).reduce((s, i) => s + (Number(i.valor) || 0), 0));
  const esperando = i => ['enviado', 'visto', 'parado'].includes(i.situacao.cod);
  const principal = lista.find(i => i.situacao.peso < 5) || lista[0] || null;
  return {
    total: lista.length, contagem: conta, principal_id: principal ? principal.id : null,
    esperando: lista.filter(esperando).length, valor_esperando: soma(esperando),
    aprovados: lista.filter(i => i.status === 'aprovado').length, valor_aprovado: soma(i => i.status === 'aprovado'),
    recusados: lista.filter(i => i.status === 'recusado').length,
    pede_acao: lista.filter(i => ['visto', 'parado', 'recusado', 'aprovado_sem_horario', 'expirado'].includes(i.situacao.cod)).length,
  };
}

/* ---------------- pré-agendamento criado pelo Orçador ---------------- */
const ehPreAgendamento = a => /^\s*PR[ÉE]-AGENDAMENTO/i.test(String(a?.observacoes || '')) && a?.status === 'aguardando';
/** Horários da Agenda que o cliente pediu pela página do orçamento e ainda ninguém confirmou. */
function prepararPreAgendamentos(ags, { agora = Date.now(), prefixo = '' } = {}) {
  return (Array.isArray(ags) ? ags : []).filter(ehPreAgendamento).map(a => {
    const hora = String(a.hora || '08:00').slice(0, 5);
    const quando = a.data ? `${String(a.data).slice(0, 10)}T${hora}:00-03:00` : null;
    const t = ms(quando);
    const orc = /Or[çc]amento n[º°o.]*\s*0*(\d{1,7})/i.exec(String(a.observacoes));
    return { id: a.id, data: a.data ? String(a.data).slice(0, 10) : null, hora, quando, passou: Number.isFinite(t) && t < agora, em_horas: Number.isFinite(t) ? Math.round((t - agora) / 3600_000) : null,
      servico: semControle(a.servico).slice(0, 120) || null, veiculo: semControle(a.veiculo).slice(0, 80) || null, placa: a.placa || null, orcamento_numero: orc ? Number(orc[1]) : null,
      link: ehUuid(a.id) ? APPS.linkApp('agenda', '/?agendamento=' + a.id, { prefixo }) : null };
  }).sort((x, y) => String(x.quando).localeCompare(String(y.quando)));
}

/* ---------------- carros no pátio × leads ---------------- */
/** Dos carros abertos (patio_carros_abertos), os que pertencem a este lead. */
function carrosDoLead(carros, lead) {
  const tel = e164(lead?.telefone);
  return (Array.isArray(carros) ? carros : []).filter(c => c && (c.lead_id === lead?.id || (lead?.cliente_id && c.cliente_id === lead.cliente_id) || (tel && e164(c.telefone) === tel)))
    .map(c => ({ os_id: c.os_id, numero: c.numero ?? null, etapa: c.etapa, etapa_rotulo: rotuloEtapa(c.etapa), etapa_em: c.etapa_em || null, placa: c.placa || null, previsao_entrega: c.previsao_entrega || null,
      link: ehUuid(c.os_id) ? APPS.linkApp('patio', '/?os=' + c.os_id) : null }));
}
/** Carros dentro da oficina que NENHUM lead aberto enxerga: cliente que está pagando e o CRM nem sabe. */
function carrosSemLead(carros, leads) {
  const abertos = (leads || []).filter(l => ABERTAS.includes(l.status));
  const porId = new Set(abertos.map(l => l.id)), porCli = new Set(abertos.map(l => l.cliente_id).filter(Boolean)), porTel = new Set(abertos.map(l => e164(l.telefone)).filter(Boolean));
  return (Array.isArray(carros) ? carros : []).filter(c => c && !(c.lead_id && porId.has(c.lead_id)) && !(c.cliente_id && porCli.has(c.cliente_id)) && !(e164(c.telefone) && porTel.has(e164(c.telefone))));
}

/* ---------------- link "Novo orçamento" no contrato do Orçador ---------------- */
const RE_PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
/**
 * Link do Orçador já com tudo que a gente sabe (contrato `r6_link_nova_cotacao`):
 * ?cliente=&tel=&nome=&lead=&agendamento=&os=&placa=&veiculo=&servico=. Parâmetro vazio ou inválido sai de fora.
 */
function linkNovoOrcamento(d = {}, opts) {
  const p = new URLSearchParams();
  const uuid = (k, v) => { if (ehUuid(v)) p.set(k, String(v).toLowerCase()); };
  uuid('cliente', d.cliente_id); const t = e164(d.telefone); if (t) p.set('tel', '55' + t);
  const limpa = (v, n) => semControle(String(v ?? '').replace(/[<>]/g, '')).slice(0, n);
  const nome = limpa(d.nome, 80); if (nome) p.set('nome', nome);
  uuid('lead', d.lead_id); uuid('agendamento', d.agendamento_id); uuid('os', d.os_id); uuid('conversa', d.conversa_id);
  const placa = String(d.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (RE_PLACA.test(placa)) p.set('placa', placa);
  const veic = limpa(d.veiculo, 80); if (veic) p.set('veiculo', veic);
  const serv = limpa(d.servico, 120); if (serv) p.set('servico', serv);
  const q = p.toString();
  return APPS.linkApp('orcador', '/' + (q ? '?' + q : ''), opts);
}
const linkOrcamento = (id, opts) => APPS.linkApp('orcador', '/#/historico/' + encodeURIComponent(id), opts);

/* ---------------- ações sugeridas pela ficha 360 ---------------- */
const CODIGOS_ACAO = new Set(['extra_pendente', 'enviar_link_acompanhar', 'cobrar_orcamento', 'agendar_orcamento', 'responder', 'responder_avaliacao', 'criar_orcamento', 'nao_mandar_mensagens']);
/** Filtra as ações do banco: só códigos conhecidos, texto limpo e link de domínio da casa. */
function acoesSugeridas(lista) {
  return (Array.isArray(lista) ? lista : []).filter(a => a && CODIGOS_ACAO.has(a.codigo)).slice(0, 8).map(a => ({
    codigo: a.codigo, app: ['crm', 'atendimento', 'agenda', 'patio', 'orcador', 'comunicar'].includes(a.app) ? a.app : null,
    titulo: semControle(a.titulo).slice(0, 120), motivo: semControle(a.motivo).slice(0, 220), link: linkSeguro(a.link), texto: a.texto ? semControle(a.texto).slice(0, 500) : null,
  }));
}
/** Linha do tempo do banco (r6_cliente_360): só eventos com data válida e link seguro. */
function linhaDoTempoR6(lista, limite = 40) {
  return (Array.isArray(lista) ? lista : []).filter(e => e && Number.isFinite(ms(e.quando))).slice(0, limite).map(e => ({
    quando: e.quando, tipo: semControle(e.tipo).slice(0, 20), app: semControle(e.app).slice(0, 20), titulo: semControle(e.titulo).slice(0, 140), detalhe: semControle(e.detalhe).slice(0, 220), link: linkSeguro(e.link),
  }));
}

/* ---------------- busca em todos os sistemas ---------------- */
const GRUPOS_BUSCA = ['clientes', 'conversas', 'leads', 'agendamentos', 'patio', 'orcamentos'];
/** Sanitiza a resposta de r6_busca_global: grupos conhecidos, link seguro, aba nomeada certa. */
function prepararBuscaGlobal(r) {
  const out = { termo: semControle(r?.termo).slice(0, 80), total: Number(r?.total) || 0, aviso: r?.aviso ? semControle(r.aviso).slice(0, 160) : null, grupos: {}, contagens: r?.contagens && typeof r.contagens === 'object' ? r.contagens : {}, permissoes: r?.permissoes || null };
  for (const g of GRUPOS_BUSCA) {
    out.grupos[g] = ((r?.grupos && r.grupos[g]) || []).slice(0, 30).map(i => {
      const app = ['crm', 'atendimento', 'agenda', 'patio', 'orcador'].includes(i.app) ? i.app : null;
      return { tipo: semControle(i.tipo).slice(0, 20), id: ehUuid(i.id) ? i.id : null, titulo: semControle(i.titulo).slice(0, 140), detalhe: semControle(i.detalhe).slice(0, 220), nome: semControle(i.nome).slice(0, 100),
        telefone: i.telefone ? semControle(i.telefone).slice(0, 20) : null, status: i.status ? semControle(i.status).slice(0, 30) : null, app, aba: app ? 'indycar-' + app : null, link: linkSeguro(i.link), quando: i.quando || null, score: Number(i.score) || 0 };
    }).filter(i => i.titulo || i.nome);
  }
  return out;
}

/* ---------------- "Agora na casa" (r6_agora) ---------------- */
const KPIS_AGORA = ['carros_no_patio', 'extras_pendentes', 'carros_atrasados', 'prontos_esperando_retirada', 'orcamentos_esperando', 'orcamentos_aprovados_sem_horario', 'conversas_sem_resposta', 'agendamentos_hoje', 'faltam_chegar', 'tarefas_vencidas'];
function prepararAgora(r) {
  const k = {}; for (const n of KPIS_AGORA) k[n] = Number(r?.kpis?.[n]) || 0;
  return { gerado_em: r?.gerado_em || null, hoje: r?.hoje || null, kpis: k, valor_orcamentos_esperando: r2(r?.orcamentos?.valor_esperando),
    etapas: ((r?.patio?.por_etapa) || []).map(e => ({ etapa: String(e.etapa || ''), rotulo: semControle(e.rotulo).slice(0, 30), quantidade: Number(e.quantidade) || 0, mais_antigo_min: Number(e.mais_antigo_min) || 0 })).filter(e => e.etapa) };
}
/** Frases curtas do que pede atenção na casa agora, para o gestor. */
function atencaoDaCasa(a) {
  const k = a.kpis, out = [];
  const pl = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  if (k.carros_atrasados) out.push({ nivel: 'alerta', texto: `${pl(k.carros_atrasados, 'carro está', 'carros estão')} há mais tempo que o normal na mesma etapa do Pátio.` });
  if (k.extras_pendentes) out.push({ nivel: 'atencao', texto: `${pl(k.extras_pendentes, 'extra espera', 'extras esperam')} o cliente decidir.` });
  if (k.prontos_esperando_retirada) out.push({ nivel: 'atencao', texto: `${pl(k.prontos_esperando_retirada, 'carro pronto espera', 'carros prontos esperam')} o cliente retirar.` });
  if (k.orcamentos_aprovados_sem_horario) out.push({ nivel: 'atencao', texto: `${pl(k.orcamentos_aprovados_sem_horario, 'orçamento aprovado está', 'orçamentos aprovados estão')} sem horário na Agenda.` });
  if (k.conversas_sem_resposta) out.push({ nivel: 'alerta', texto: `${pl(k.conversas_sem_resposta, 'conversa sem resposta', 'conversas sem resposta')} no Atendimento.` });
  if (k.faltam_chegar) out.push({ nivel: 'neutro', texto: `${pl(k.faltam_chegar, 'cliente ainda não chegou', 'clientes ainda não chegaram')} para o horário de hoje.` });
  return out;
}

/* ---------------- ligações quebradas (r6_ligacoes_quebradas, gestor) ---------------- */
function prepararLigacoes(r) {
  return { gerado_em: r?.gerado_em || null, total_problemas: Number(r?.total_problemas) || 0,
    verificacoes: (Array.isArray(r?.verificacoes) ? r.verificacoes : []).slice(0, 30).map(v => ({ codigo: semControle(v.codigo).slice(0, 60), app: semControle(v.app).slice(0, 20), descricao: semControle(v.descricao).slice(0, 200), quantidade: Number(v.quantidade) || 0,
      amostra: (Array.isArray(v.amostra) ? v.amostra : []).filter(x => typeof x === 'string' && x.length <= 60).slice(0, 5) })).sort((a, b) => b.quantidade - a.quantidade) };
}

/* ---------------- ficha pelo contrato do X3, com plano B ---------------- */
/** r6_cliente_360; se a função ainda não existir no banco, cai no cliente_360 antigo. */
async function fichaDoCliente(sb, tel) {
  let r = await sb.rpc('r6_cliente_360', { p_telefone: tel });
  if (r.error && /não existe|does not exist|function|42883|PGRST202/i.test(String(r.error.message || '') + String(r.error.code || ''))) r = await sb.rpc('cliente_360', { p_telefone: tel });
  return r;
}

/* ============================================================ rotas */
async function lerSeguro(consulta) { try { const { data, error } = await consulta; return error ? { erro: error.message || 'falha', dados: [] } : { erro: null, dados: data || [] }; } catch (e) { return { erro: String(e?.message || e), dados: [] }; } }

async function rotasR6c(c) {
  const { req, res, url, pathname: p, quem, json, freio, sb, prefixo = '' } = c;
  const m = req.method;
  const gestor = ehGestor(quem.papel);
  const precisa = () => { if (!sb) throw falha(503, 'Disponível só com o banco compartilhado (Supabase).'); return sb; };
  const frear = (nome, teto, janela) => { if (!freio.dentro(nome + ':' + quem.id, teto, janela)) throw falha(429, 'Muitos pedidos seguidos. Espere um pouco.'); };
  const agora = (c.agora || Date.now)();
  const comoUsuario = (nome, args) => rpcComoUsuario({ fetch: c.fetch, url: c.supabaseUrl, anonKey: c.anonKey, token: bearerDe(req) }, nome, args);

  /* ---------- tudo que os outros sistemas sabem deste lead, numa chamada ---------- */
  const mc = p.match(/^\/api\/leads\/([0-9a-fA-F-]{36})\/conexoes$/);
  if (mc && m === 'GET') {
    precisa(); frear('conexoes', 90, 60_000);
    const lead = ehUuid(mc[1]) ? await c.store.getLead(mc[1]) : null;
    if (!lead) throw falha(404, 'Lead não encontrado.');
    const tel = e164(lead.telefone);
    const avisos = [];
    const [orcR, agR, carR, fichaR] = await Promise.all([
      comoUsuario('orc_status_por_lead', { p_lead: lead.id }),
      lerSeguro(sb.from('agendamentos').select('id,data,hora,status,observacoes,servico,veiculo,placa,lead_id,cliente_id').eq('lead_id', lead.id).in('status', ['aguardando', 'confirmado'])),
      sb.rpc('patio_carros_abertos').then(r => r, e => ({ data: null, error: e })),
      tel ? fichaDoCliente(sb, tel) : Promise.resolve({ data: null, error: null }),
    ]);
    if (orcR.error) avisos.push(orcR.error.codigo === 'sem_login' ? 'Orçamentos: sem login para consultar o Orçador.' : 'Orçamentos: o Orçador não respondeu agora.');
    if (agR.erro) avisos.push('Agenda: não consegui ler os horários.');
    if (carR.error) avisos.push('Pátio: não consegui ver os carros agora.');
    if (fichaR.error) avisos.push('Ficha do cliente indisponível agora.');
    const itens = prepararOrcamentos(orcR.data, { observacoes: lead.observacoes, agora });
    const ficha = fichaR.data && typeof fichaR.data === 'object' ? fichaR.data : null;
    json(res, 200, {
      lead_id: lead.id, gerado_em: new Date(agora).toISOString(), avisos,
      site: lerObservacoes(lead.observacoes),
      orcamentos: { itens, resumo: resumirOrcamentos(itens), consultou_orcador: !orcR.error },
      pre_agendamentos: prepararPreAgendamentos(agR.dados, { agora, prefixo }),
      patio: { carros: carrosDoLead(carR.data, lead) },
      acoes_sugeridas: acoesSugeridas(ficha?.acoes_sugeridas),
      linha_do_tempo: linhaDoTempoR6(ficha?.linha_do_tempo),
      links: {
        novo_orcamento: linkNovoOrcamento({ cliente_id: lead.cliente_id || ficha?.cliente?.id, telefone: lead.telefone, nome: lead.nome, lead_id: lead.id, placa: lead.placa, veiculo: lead.carro_modelo, servico: lead.servico }, { prefixo }),
        crm: linkSeguro(ficha?.links?.crm), atendimento: linkSeguro(ficha?.links?.atendimento) || (tel ? APPS.linkApp('atendimento', '/?tel=55' + tel, { prefixo }) : null),
        whatsapp: tel ? 'https://wa.me/55' + tel : null,
      },
    });
    return true;
  }

  /* ---------- carros dentro da oficina agora × leads (oportunidades sem lead) ---------- */
  if (p === '/api/patio/carros' && m === 'GET') {
    precisa(); frear('patio-carros', 60, 60_000);
    const [carR, leads] = await Promise.all([sb.rpc('patio_carros_abertos').then(r => r, e => ({ data: null, error: e })), c.store.todosOsLeads()]);
    if (carR.error) throw falha(503, 'Não consegui ver os carros do Pátio agora.');
    const carros = Array.isArray(carR.data) ? carR.data : [];
    const sem = carrosSemLead(carros, leads);
    const nomes = new Map();
    const ids = [...new Set(sem.map(x => x.cliente_id).filter(ehUuid))];
    if (ids.length) { const r = await lerSeguro(sb.from('clientes').select('id,nome').in('id', ids)); for (const x of r.dados) nomes.set(x.id, x.nome); }
    json(res, 200, { total: carros.length, sem_lead_total: sem.length,
      sem_lead: sem.slice(0, 40).map(x => ({ os_id: x.os_id, numero: x.numero ?? null, etapa: x.etapa, etapa_rotulo: rotuloEtapa(x.etapa), etapa_em: x.etapa_em || null, placa: x.placa || null, telefone: x.telefone || null, nome: nomes.get(x.cliente_id) || null,
        link: ehUuid(x.os_id) ? APPS.linkApp('patio', '/?os=' + x.os_id) : null })) });
    return true;
  }

  /* ---------- busca em todos os sistemas (Ctrl+K) ---------- */
  if (p === '/api/busca-tudo' && m === 'GET') {
    frear('busca-tudo', 90, 60_000);
    const q = String(url.searchParams.get('q') || '').trim().slice(0, 80);
    if (q.replace(/\s+/g, '').length < 2) { json(res, 200, prepararBuscaGlobal({ termo: q, aviso: 'Digite pelo menos 2 letras.', grupos: {} })); return true; }
    const r = await comoUsuario('r6_busca_global', { p_termo: q, p_limite: Math.max(1, Math.min(10, Number(url.searchParams.get('limite')) || 5)) });
    if (r.error) throw falha(503, r.error.codigo === 'sem_login' ? 'Sua sessão não chegou ao servidor. Entre de novo.' : 'A busca entre os sistemas não respondeu agora.');
    json(res, 200, prepararBuscaGlobal(r.data));
    return true;
  }

  /* ---------- "Agora na casa": números do Pátio, Orçador, Atendimento e Agenda ---------- */
  if (p === '/api/agora' && m === 'GET') {
    frear('agora', 60, 60_000);
    const r = await comoUsuario('r6_agora', { p_limite: 3 });
    if (r.error) throw falha(503, 'Não consegui ver a casa agora.');
    const a = prepararAgora(r.data);
    json(res, 200, { ...a, atencao: gestor ? atencaoDaCasa(a) : [] });
    return true;
  }

  /* ---------- ligações quebradas entre os sistemas (gestor) ---------- */
  if (p === '/api/ligacoes-quebradas' && m === 'GET') {
    precisa(); frear('ligacoes', 20, 60_000);
    if (!gestor) throw falha(403, 'Só um gestor vê as ligações quebradas entre os sistemas.', { codigo: 'so_gestor' });
    const r = await comoUsuario('r6_ligacoes_quebradas', { p_amostra: 3 });
    if (r.error) throw falha(503, 'Não consegui conferir as ligações agora.');
    json(res, 200, prepararLigacoes(r.data));
    return true;
  }

  /* ---------- registrar o MESMO contato em vários leads de uma vez (ex.: avisei todos por WhatsApp) ---------- */
  if (p === '/api/leads/contato-lote' && m === 'POST') {
    precisa(); frear('contato-lote', 15, 60_000);
    const R6 = require('./rodada6');
    const b = await c.lerCorpo();
    const ids = Array.isArray(b?.ids) ? [...new Set(b.ids.filter(ehUuid))] : [];
    if (!ids.length || ids.length > 100) throw falha(400, 'Escolha de 1 a 100 leads.');
    const dado = R6.validarContato({ ...b, ids: undefined, criar_tarefa: false }, agora);
    if (dado.tipo === 'nota') throw falha(400, 'No lote, registre um contato (ligação, WhatsApp ou visita).');
    const todos = await c.store.todosOsLeads();
    const alvo = todos.filter(l => ids.includes(String(l.id)));
    const abertos = alvo.filter(l => ABERTAS.includes(l.status));
    const podem = abertos.filter(l => (c.podeEditarLead ? c.podeEditarLead(l, quem) : true));
    const feitos = [];
    for (const lead of podem) {
      const ef = R6.efeitoDoContato(lead, dado);
      const { error } = await sb.from('crm_atividades').insert({ lead_id: lead.id, cliente_id: lead.cliente_id || null, tipo: dado.tipo, resultado: dado.resultado, texto: dado.texto, proximo_contato_em: dado.proximo ? new Date(dado.proximo).toISOString() : null, criado_por: quem.id });
      if (error) continue;
      const patch = { ultimo_contato_em: new Date(agora).toISOString(), tentativas_contato: ef.tentativas };
      if (dado.proximo !== undefined) patch.proximo_contato_em = dado.proximo ? new Date(dado.proximo).toISOString() : null;
      await sb.from('leads').update(patch).eq('id', lead.id);
      if (ef.status) { try { await c.store.updateLead(lead.id, { status: ef.status }); } catch { /* o contato já está salvo */ } }
      feitos.push(lead.id);
    }
    if (c.limparCache) c.limparCache();
    require('./rodada6').esquecerSinais();
    if (c.auditar) await c.auditar(quem, 'lead_contato_lote', { tabela: 'leads', detalhes: { quantidade: feitos.length, tipo: dado.tipo, resultado: dado.resultado, de_colegas: abertos.length - podem.length, fechados: alvo.length - abertos.length } });
    json(res, 201, { ok: true, registrados: feitos.length, ids: feitos, de_colegas: abertos.length - podem.length, fechados: alvo.length - abertos.length, inexistentes: ids.length - alvo.length });
    return true;
  }

  return false;
}

module.exports = {
  rotasR6c, linkSeguro, DOMINIOS_DA_CASA, bearerDe, rpcComoUsuario, lerObservacoes, rotuloEtapa, classificarOrcamento, valorDoOrcamento, prepararOrcamentos, resumirOrcamentos,
  ehPreAgendamento, prepararPreAgendamentos, carrosDoLead, carrosSemLead, linkNovoOrcamento, linkOrcamento, acoesSugeridas, linhaDoTempoR6, prepararBuscaGlobal, prepararAgora, atencaoDaCasa,
  prepararLigacoes, fichaDoCliente, CODIGOS_ACAO, GRUPOS_BUSCA, KPIS_AGORA,
};
