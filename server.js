// IndyCar Agendamentos — servidor HTTP (somente módulos nativos do Node)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import db from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
let _ultimaImportacao = 0; // controle p/ importar ao abrir o painel (no máx 1x/min)

// Token de verificação do webhook do WhatsApp Cloud API (configurável por env)
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'indycar';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(body);
}
const ok = (res, data) => send(res, 200, data);
const bad = (res, msg) => send(res, 400, { erro: msg });
const notFound = (res) => send(res, 404, { erro: 'Não encontrado' });

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

const hoje = () => new Date().toISOString().slice(0, 10);
const soDigitos = (t) => String(t || '').replace(/\D/g, '');

// Normaliza telefone para o formato internacional (DDI Brasil quando faltar)
function telefoneInternacional(telefone) {
  let num = soDigitos(telefone);
  if (num && !num.startsWith('55') && num.length <= 11) num = '55' + num;
  return num;
}

// Monta link de clique-para-conversar do WhatsApp (wa.me)
function linkWhatsApp(telefone, texto) {
  return `https://wa.me/${telefoneInternacional(telefone)}?text=${encodeURIComponent(texto)}`;
}

// Lê a configuração da integração (linha única)
const getWaConfig = () => db.prepare('SELECT * FROM whatsapp_config WHERE id=1').get() || {};

// Envia uma mensagem de texto pela WhatsApp Cloud API (Meta). Usa fetch nativo.
async function enviarCloudAPI(cfg, telefone, texto) {
  const ver = cfg.api_version || 'v21.0';
  const url = `https://graph.facebook.com/${ver}/${cfg.phone_number_id}/messages`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: telefoneInternacional(telefone),
        type: 'text',
        text: { preview_url: false, body: texto },
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.messages?.[0]?.id) return { ok: true, wamid: data.messages[0].id };
    return { ok: false, erro: data.error?.message || `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, erro: String(e?.message || e) };
  }
}

// Despacha uma mensagem (Cloud API se ativa, senão registra p/ link wa.me) e grava no banco.
async function despacharMensagem({ agendamento_id = null, telefone, nome = null, corpo, template_id = null }) {
  const cfg = getWaConfig();
  const usarCloud = !!(cfg.ativo && cfg.phone_number_id && cfg.access_token);
  let status = 'enviado', wamid = null, erro = null, modo = 'wa.me';
  if (usarCloud) {
    modo = 'cloud';
    const r = await enviarCloudAPI(cfg, telefone, corpo);
    if (r.ok) wamid = r.wamid; else { status = 'falhou'; erro = r.erro; }
  }
  const info = db.prepare(`INSERT INTO whatsapp_mensagens
    (agendamento_id, telefone, nome, corpo, direcao, status, wamid, erro, template_id)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(agendamento_id, soDigitos(telefone), nome, corpo,
    'saida', status, wamid, erro, template_id);
  return { id: info.lastInsertRowid, modo, status, erro, corpo, link: linkWhatsApp(telefone, corpo) };
}

// ============================= IA DE ATENDIMENTO =============================
const getIaConfig = () => db.prepare('SELECT * FROM ia_config WHERE id=1').get() || {};

// Config da IA com as chaves mascaradas (nunca devolve as chaves cruas)
function iaConfigMascarada() {
  const c = getIaConfig(); const k = c.api_key || '', ck = c.cw_api_key || '';
  return { ...c, api_key: undefined, cw_api_key: undefined,
    tem_chave: !!k, chave_mask: k ? '••••••••' + k.slice(-4) : '',
    tem_cw_chave: !!ck, cw_chave_mask: ck ? '••••••••' + ck.slice(-4) : '' };
}

// (IA do app removida a pedido: quem atende e faz follow-up é a IA já cadastrada
//  no WhatsApp via CodeWords. O app só importa agendamentos e aciona workflows.)

// --------- CodeWords (runtime.codewords.ai) — workflows ---------
// Contrato REST (do codewords-client): POST {base}/run/{service_id}/ com Authorization: <chave>
// e os inputs como JSON; a resposta é a própria saída do workflow.
async function chamarCodeWords({ base_url, api_key, service_id, path = '', method = 'POST', inputs, background = false }) {
  const base = (base_url || 'https://runtime.codewords.ai').replace(/\/+$/, '');
  const seg = (path || '').replace(/^\/+/, '');
  const url = `${base}/${background ? 'run_async' : 'run'}/${encodeURIComponent(service_id)}/${seg}`;
  try {
    const opt = { method, headers: { Authorization: api_key, 'Content-Type': 'application/json' } };
    if (method !== 'GET') opt.body = JSON.stringify(inputs ?? {});
    const r = await fetch(url, opt);
    const txt = await r.text();
    let data; try { data = JSON.parse(txt); } catch { data = txt; }
    if (!r.ok) return { ok: false, status: r.status,
      erro: (data && data.error) || (typeof data === 'string' && data) || `HTTP ${r.status}` };
    return { ok: true, data };
  } catch (e) { return { ok: false, erro: String(e?.message || e) }; }
}

// Extrai uma lista (array) de um retorno livre de workflow
function extrairListaCW(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const k of ['agendamentos', 'result', 'results', 'data', 'items', 'pendentes', 'rows', 'records']) {
      if (Array.isArray(data[k])) return data[k];
    }
    if (data.result && typeof data.result === 'object' && !Array.isArray(data.result)) return extrairListaCW(data.result);
  }
  return [];
}

// Importa agendamentos pendentes do workflow "Banco de Agendamentos" para o banco local
async function importarAgendamentosCW() {
  // Só UM importador deve puxar do CodeWords (senão os agendamentos se dividem).
  // Por padrão, só o CLOUD (Render define RENDER=true) importa; o local não.
  // Override: IMPORT_ENABLED=1 liga; IMPORT_DISABLED=1 desliga.
  if (process.env.IMPORT_DISABLED === '1') return { ok: false, erro: 'importação desativada (IMPORT_DISABLED)' };
  if (!process.env.RENDER && process.env.IMPORT_ENABLED !== '1')
    return { ok: false, erro: 'importação só no cloud (defina IMPORT_ENABLED=1 p/ ligar no local)' };
  const cfg = getIaConfig();
  if (!cfg.cw_api_key || !cfg.cw_db_service_id)
    return { ok: false, erro: 'Configure a chave e o Service ID do banco de agendamentos.' };
  const resp = await chamarCodeWords({ base_url: cfg.cw_base_url, api_key: cfg.cw_api_key,
    service_id: cfg.cw_db_service_id, path: 'listar', method: 'GET' });
  if (!resp.ok) return { ok: false, erro: resp.erro };
  const itens = extrairListaCW(resp.data);
  let importados = 0;
  for (const a of itens) {
    const nome = a.nome || a.cliente_nome || a.cliente; if (!nome) continue;
    const telefone = soDigitos(a.telefone || a.phone || '');
    const data = a.data || a.date, hora = a.hora || a.time;
    if (!data || !hora) continue;
    if (db.prepare('SELECT id FROM agendamentos WHERE telefone=? AND data=? AND hora=?').get(telefone, data, hora))
      continue; // dedupe
    const veic = [a.veiculo || a['veículo'] || '', a.ano || ''].filter(Boolean).join(' ').trim();
    let cliente_id = null;
    if (telefone) {
      const ex = db.prepare('SELECT id FROM clientes WHERE telefone=?').get(telefone);
      cliente_id = ex ? ex.id : db.prepare('INSERT INTO clientes (nome, telefone, veiculo, placa, origem) VALUES (?,?,?,?,?)')
        .run(nome, telefone, veic || null, a.placa || null, a.origem || 'WhatsApp').lastInsertRowid;
    }
    db.prepare(`INSERT INTO agendamentos
      (cliente_id, cliente_nome, telefone, veiculo, placa, servico, data, hora, origem, status, confirmado)
      VALUES (?,?,?,?,?,?,?,?,?,?,1)`).run(cliente_id, nome, telefone, veic || null, a.placa || null,
      a.servico || a['serviço'] || 'Serviço', data, hora, a.origem || 'WhatsApp', 'confirmado');
    importados++;
  }
  // NÃO marca como importado por padrão: assim o /listar segue devolvendo tudo e o app
  // re-importa (com dedupe por telefone+data+hora) a cada abertura — resiliente ao
  // Render free apagar o banco a cada deploy. (Defina MARK_IMPORTED=1 p/ voltar a marcar.)
  if (itens.length && process.env.MARK_IMPORTED === '1') {
    await chamarCodeWords({ base_url: cfg.cw_base_url, api_key: cfg.cw_api_key,
      service_id: cfg.cw_db_service_id, path: 'marcar_importados', method: 'POST', inputs: {} }).catch(() => {});
  }
  return { ok: true, importados, encontrados: itens.length };
}

// Dispara o workflow de notificação de ausência (cliente que não compareceu)
async function notificarAusencia(ag) {
  const cfg = getIaConfig();
  if (!cfg.cw_api_key || !cfg.cw_noshow_service_id || !ag?.telefone) return { ok: false };
  return chamarCodeWords({ base_url: cfg.cw_base_url, api_key: cfg.cw_api_key, service_id: cfg.cw_noshow_service_id,
    inputs: { nome: ag.cliente_nome, telefone: ag.telefone, veiculo: ag.veiculo || '',
              servico: ag.servico, hora: ag.hora, placa: ag.placa || '' } });
}

// Envia uma mensagem pelo WhatsApp CONECTADO (proxy GOWA, form-data) — confiável, sob meu controle
async function enviarViaGowa(telefone, mensagem) {
  const cfg = getIaConfig();
  if (!cfg.cw_api_key) return { ok: false, erro: 'CodeWords não configurado' };
  const sid = cfg.cw_connect_service_id || 'whatsapp_device_manager';
  const carlosPath = (cfg.cw_service_id || 'indycar_carlos_whatsapp_e3cd01d3').replace(/\/?$/, '/');
  const lst = await chamarCodeWords({ base_url: cfg.cw_base_url, api_key: cfg.cw_api_key, service_id: sid, path: 'devices/list', method: 'POST', inputs: {} });
  const devs = (lst.ok && lst.data && lst.data.devices) || [];
  const logado = devs.find(d => (d.service_path || '') === carlosPath && /^(logged_?in|authenticated|paired)$/i.test(d.gowa_status?.results?.state || ''));
  const deviceId = logado?.device_id || cfg.cw_device_id;
  if (!deviceId) return { ok: false, erro: 'Nenhum número conectado' };
  const base = (cfg.cw_base_url || 'https://runtime.codewords.ai').replace(/\/+$/, '');
  const url = `${base}/run/${sid}/proxy/send/message?device_id=${encodeURIComponent(deviceId)}`;
  const body = new URLSearchParams({ phone: telefoneInternacional(telefone), message: mensagem }).toString();
  try {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: cfg.cw_api_key, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const data = await r.json().catch(() => ({}));
    if (r.ok && /success/i.test(JSON.stringify(data))) return { ok: true, data };
    return { ok: false, erro: data?.message || data?.detail || `HTTP ${r.status}` };
  } catch (e) { return { ok: false, erro: String(e?.message || e) }; }
}

// ============================= INTEGRAÇÕES =============================
const getIntegracoes = () => db.prepare('SELECT * FROM integracoes WHERE id=1').get() || {};

// Dispara o webhook de saída (Zapier/Make/n8n) em segundo plano
function dispararWebhook(evento, payload) {
  const cfg = getIntegracoes();
  if (!cfg.webhook_ativo || !cfg.webhook_url) return;
  fetch(cfg.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evento, em: new Date().toISOString(), ...payload }),
  }).catch((e) => console.error('Webhook saída:', e.message));
}

// Gera o calendário ICS (Google Agenda assina essa URL)
function gerarICS() {
  const emp = db.prepare('SELECT * FROM empresa WHERE id=1').get() || {};
  const ags = db.prepare(`SELECT a.*, c.nome AS consultor_nome FROM agendamentos a
    LEFT JOIN consultores c ON c.id=a.consultor_id
    WHERE a.status NOT IN ('nao_fechou') ORDER BY a.data, a.hora LIMIT 500`).all();
  const durTab = Object.fromEntries(db.prepare('SELECT nome, duracao_min FROM servicos').all().map(s => [s.nome, s.duracao_min]));
  const escTxt = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const fmt = (d, hm) => d.replace(/-/g, '') + 'T' + hm.replace(':', '') + '00';
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IndyCar Agendamentos//PT-BR',
    'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escTxt(emp.nome || 'IndyCar')} — Agendamentos`, 'X-WR-TIMEZONE:America/Sao_Paulo'];
  for (const a of ags) {
    if (!a.data || !a.hora) continue;
    const dur = durTab[a.servico] || 60;
    const ini = new Date(`${a.data}T${a.hora}:00`);
    const fim = new Date(ini.getTime() + dur * 60000);
    const p = (n) => String(n).padStart(2, '0');
    const fimStr = `${fim.getFullYear()}${p(fim.getMonth() + 1)}${p(fim.getDate())}T${p(fim.getHours())}${p(fim.getMinutes())}00`;
    const desc = [`Serviço: ${a.servico}`, a.veiculo ? `Veículo: ${a.veiculo}${a.placa ? ' (' + a.placa + ')' : ''}` : '',
      a.telefone ? `WhatsApp: ${a.telefone}` : '', a.consultor_nome ? `Consultor: ${a.consultor_nome}` : '',
      `Status: ${a.status}`].filter(Boolean).join('\n');
    linhas.push('BEGIN:VEVENT', `UID:indycar-${a.id}@agendamentos`,
      `DTSTART;TZID=America/Sao_Paulo:${fmt(a.data, a.hora)}`,
      `DTEND;TZID=America/Sao_Paulo:${fimStr}`,
      `SUMMARY:${escTxt('🔧 ' + a.cliente_nome + ' — ' + a.servico)}`,
      `DESCRIPTION:${escTxt(desc)}`,
      `LOCATION:${escTxt(emp.endereco || '')}`,
      `STATUS:${a.status === 'nao_veio' ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT');
  }
  linhas.push('END:VCALENDAR');
  return linhas.join('\r\n');
}

// Gera CSV (separador ; — abre direto no Excel BR)
function gerarCSV(colunas, rows) {
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return '﻿' + [colunas.map(q).join(';'), ...rows.map(r => colunas.map(c => q(r[c])).join(';'))].join('\r\n');
}

// "Não veio" → manda o follow-up pelo WhatsApp conectado e registra no histórico
// Registra mensagem de entrada do cliente
function registrarEntrada(telefone, nome, texto) {
  db.prepare(`INSERT INTO whatsapp_mensagens (telefone, nome, corpo, direcao, status)
              VALUES (?,?,?,?,?)`).run(soDigitos(telefone), nome ?? null, texto, 'entrada', 'recebido');
}

// Substitui {nome} {servico} {data} {hora} {veiculo} {placa} no template
function renderTemplate(corpo, ctx) {
  return String(corpo).replace(/\{(\w+)\}/g, (_, k) => (ctx[k] ?? `{${k}}`));
}

function formatarDataBR(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

// ---------------------------------------------------------------------------
// Lógica de negócio / consultas
// ---------------------------------------------------------------------------
function dashboard() {
  const d = hoje();
  const one = (sql, ...p) => db.prepare(sql).get(...p).n;
  const totalHoje      = one('SELECT COUNT(*) n FROM agendamentos WHERE data=?', d);
  const concluidosHoje = one("SELECT COUNT(*) n FROM agendamentos WHERE data=? AND status='concluido'", d);
  const compareceram   = one('SELECT COUNT(*) n FROM agendamentos WHERE data=? AND compareceu=1', d);
  const naoVieram      = one('SELECT COUNT(*) n FROM agendamentos WHERE data=? AND compareceu=0', d);
  const naoFechou      = one("SELECT COUNT(*) n FROM agendamentos WHERE data=? AND status='nao_fechou'", d);
  const aguardando     = one("SELECT COUNT(*) n FROM agendamentos WHERE data=? AND compareceu IS NULL AND status IN ('aguardando','confirmado','em_atendimento')", d);
  const totalClientes  = one('SELECT COUNT(*) n FROM clientes');
  const totalConsult   = one('SELECT COUNT(*) n FROM consultores WHERE ativo=1');

  const agendaHoje = db.prepare(`
    SELECT a.*, c.nome AS consultor_nome, c.cor AS consultor_cor
    FROM agendamentos a LEFT JOIN consultores c ON c.id=a.consultor_id
    WHERE a.data=? ORDER BY a.hora ASC`).all(d);

  const ultimos = db.prepare(`
    SELECT a.*, c.nome AS consultor_nome, c.cor AS consultor_cor
    FROM agendamentos a LEFT JOIN consultores c ON c.id=a.consultor_id
    ORDER BY a.created_at DESC, a.id DESC LIMIT 8`).all();

  return {
    cards: { totalHoje, concluidosHoje, compareceram, totalClientes, totalConsult,
             naoVieram, naoFechou, aguardando },
    agendaHoje, ultimos, data: d,
  };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
async function api(req, res, url) {
  const { pathname, searchParams } = url;
  const m = req.method;
  const seg = pathname.split('/').filter(Boolean); // ['api', ...]
  const body = (m === 'POST' || m === 'PUT' || m === 'PATCH') ? await readBody(req) : {};

  // ---- empresa
  if (pathname === '/api/empresa' && m === 'GET')
    return ok(res, db.prepare('SELECT * FROM empresa WHERE id=1').get());
  if (pathname === '/api/empresa' && m === 'PUT') {
    db.prepare('UPDATE empresa SET nome=?, endereco=?, slogan=?, telefone=? WHERE id=1')
      .run(body.nome, body.endereco, body.slogan, body.telefone);
    return ok(res, db.prepare('SELECT * FROM empresa WHERE id=1').get());
  }

  // ---- dashboard
  if (pathname === '/api/dashboard' && m === 'GET') {
    // Ao abrir o painel, puxa os agendamentos do CodeWords (no máx 1x/min).
    // Essencial no Render free, que "dorme" e não roda o timer de importação.
    if (Date.now() - _ultimaImportacao > 60000) {
      _ultimaImportacao = Date.now();
      try { await Promise.race([importarAgendamentosCW(), new Promise((r) => setTimeout(r, 8000))]); } catch {}
    }
    return ok(res, dashboard());
  }

  // ---- agendamentos
  if (pathname === '/api/agendamentos' && m === 'GET') {
    const cond = [], par = [];
    if (searchParams.get('data'))   { cond.push('a.data=?');   par.push(searchParams.get('data')); }
    if (searchParams.get('status')) { cond.push('a.status=?'); par.push(searchParams.get('status')); }
    if (searchParams.get('q')) {
      cond.push('(a.cliente_nome LIKE ? OR a.placa LIKE ? OR a.veiculo LIKE ? OR a.telefone LIKE ?)');
      const q = '%' + searchParams.get('q') + '%'; par.push(q, q, q, q);
    }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    return ok(res, db.prepare(`
      SELECT a.*, c.nome AS consultor_nome, c.cor AS consultor_cor
      FROM agendamentos a LEFT JOIN consultores c ON c.id=a.consultor_id
      ${where} ORDER BY a.data DESC, a.hora ASC`).all(...par));
  }

  if (pathname === '/api/agendamentos' && m === 'POST') {
    if (!body.cliente_nome || !body.servico || !body.data || !body.hora)
      return bad(res, 'Informe cliente, serviço, data e hora.');
    // dedupe: mesmo horário + mesmo telefone (ou mesmo nome) = mesmo agendamento
    const dup = db.prepare(`SELECT * FROM agendamentos WHERE data=? AND hora=?
      AND ((telefone<>'' AND telefone=?) OR cliente_nome=?)`)
      .get(body.data, body.hora, soDigitos(body.telefone || ''), body.cliente_nome);
    if (dup) return ok(res, dup);
    // vincula/cria cliente pelo telefone
    let clienteId = body.cliente_id ?? null;
    if (!clienteId && body.telefone) {
      const ex = db.prepare('SELECT id FROM clientes WHERE telefone=?').get(soDigitos(body.telefone));
      if (ex) clienteId = ex.id;
      else clienteId = db.prepare(
        'INSERT INTO clientes (nome, telefone, veiculo, placa, origem) VALUES (?,?,?,?,?)')
        .run(body.cliente_nome, soDigitos(body.telefone), body.veiculo ?? null, body.placa ?? null, body.origem ?? 'Google').lastInsertRowid;
    }
    const info = db.prepare(`INSERT INTO agendamentos
      (cliente_id, cliente_nome, telefone, veiculo, placa, servico, data, hora, consultor_id, origem, status, confirmado, valor, observacoes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      clienteId, body.cliente_nome, soDigitos(body.telefone), body.veiculo ?? null, body.placa ?? null,
      body.servico, body.data, body.hora, body.consultor_id ?? null, body.origem ?? 'Google',
      body.status ?? 'aguardando', body.confirmado ? 1 : 0, body.valor ?? 0, body.observacoes ?? null);
    const criado = db.prepare('SELECT * FROM agendamentos WHERE id=?').get(info.lastInsertRowid);
    dispararWebhook('agendamento_criado', { agendamento: criado });
    return ok(res, criado);
  }

  let mm;
  if ((mm = pathname.match(/^\/api\/agendamentos\/(\d+)$/))) {
    const id = +mm[1];
    if (m === 'GET') {
      const a = db.prepare(`SELECT a.*, c.nome AS consultor_nome, c.cor AS consultor_cor
        FROM agendamentos a LEFT JOIN consultores c ON c.id=a.consultor_id WHERE a.id=?`).get(id);
      return a ? ok(res, a) : notFound(res);
    }
    if (m === 'PUT') {
      const a = db.prepare('SELECT * FROM agendamentos WHERE id=?').get(id);
      if (!a) return notFound(res);
      const f = { ...a, ...body };
      db.prepare(`UPDATE agendamentos SET cliente_nome=?, telefone=?, veiculo=?, placa=?, servico=?,
        data=?, hora=?, consultor_id=?, origem=?, status=?, confirmado=?, compareceu=?, valor=?, observacoes=?
        WHERE id=?`).run(f.cliente_nome, soDigitos(f.telefone), f.veiculo, f.placa, f.servico, f.data, f.hora,
        f.consultor_id, f.origem, f.status, f.confirmado ? 1 : 0, f.compareceu, f.valor, f.observacoes, id);
      return ok(res, db.prepare('SELECT * FROM agendamentos WHERE id=?').get(id));
    }
    if (m === 'DELETE') {
      db.prepare('DELETE FROM agendamentos WHERE id=?').run(id);
      return ok(res, { ok: true });
    }
  }

  // mudança rápida de status (botões do card)
  if ((mm = pathname.match(/^\/api\/agendamentos\/(\d+)\/status$/)) && m === 'PATCH') {
    const id = +mm[1];
    const map = {
      confirmado:      { status: 'confirmado', confirmado: 1 },
      compareceu:      { status: 'compareceu', compareceu: 1 },
      nao_veio:        { status: 'nao_veio', compareceu: 0 },
      em_atendimento:  { status: 'em_atendimento' },
      concluido:       { status: 'concluido', compareceu: 1 },
      nao_fechou:      { status: 'nao_fechou' },
      aguardando:      { status: 'aguardando' },
    };
    const ch = map[body.status];
    if (!ch) return bad(res, 'Status inválido.');
    const a = db.prepare('SELECT * FROM agendamentos WHERE id=?').get(id);
    if (!a) return notFound(res);
    db.prepare('UPDATE agendamentos SET status=?, confirmado=?, compareceu=? WHERE id=?').run(
      ch.status,
      ch.confirmado !== undefined ? ch.confirmado : a.confirmado,
      ch.compareceu !== undefined ? ch.compareceu : a.compareceu, id);
    const atualizado = db.prepare('SELECT * FROM agendamentos WHERE id=?').get(id);
    // "Não veio" → aciona a IA do WhatsApp (workflow de ausência) p/ ELA fazer o follow-up.
    // O app não envia mensagem nenhuma por conta própria.
    if (body.status === 'nao_veio') {
      notificarAusencia(atualizado).then((r) => {
        if (atualizado?.telefone) db.prepare(`INSERT INTO whatsapp_mensagens
          (agendamento_id, telefone, nome, corpo, direcao, status, erro) VALUES (?,?,?,?,?,?,?)`)
          .run(atualizado.id, soDigitos(atualizado.telefone), atualizado.cliente_nome,
            `🤖 Follow-up de ausência delegado à IA do WhatsApp (${atualizado.cliente_nome} — ${atualizado.servico})`,
            'saida', r?.ok ? 'delegado_ia' : 'falhou', r?.ok ? null : (r?.erro || 'workflow indisponível'));
      }).catch((e) => console.error('Follow-up IA:', e));
    }
    dispararWebhook('status_alterado', { agendamento: atualizado, novo_status: body.status });
    return ok(res, atualizado);
  }

  // ---- clientes
  if (pathname === '/api/clientes' && m === 'GET') {
    const q = searchParams.get('q');
    if (q) return ok(res, db.prepare(
      'SELECT * FROM clientes WHERE nome LIKE ? OR telefone LIKE ? OR placa LIKE ? ORDER BY nome')
      .all(`%${q}%`, `%${q}%`, `%${q}%`));
    return ok(res, db.prepare('SELECT * FROM clientes ORDER BY nome').all());
  }
  if (pathname === '/api/clientes' && m === 'POST') {
    if (!body.nome) return bad(res, 'Informe o nome.');
    const info = db.prepare(`INSERT INTO clientes (nome, telefone, veiculo, placa, modelo, origem, observacoes)
      VALUES (?,?,?,?,?,?,?)`).run(body.nome, soDigitos(body.telefone), body.veiculo ?? null,
      body.placa ?? null, body.modelo ?? null, body.origem ?? 'Google', body.observacoes ?? null);
    return ok(res, db.prepare('SELECT * FROM clientes WHERE id=?').get(info.lastInsertRowid));
  }
  if ((mm = pathname.match(/^\/api\/clientes\/(\d+)$/))) {
    const id = +mm[1];
    if (m === 'PUT') {
      db.prepare(`UPDATE clientes SET nome=?, telefone=?, veiculo=?, placa=?, modelo=?, origem=?, observacoes=? WHERE id=?`)
        .run(body.nome, soDigitos(body.telefone), body.veiculo, body.placa, body.modelo, body.origem, body.observacoes, id);
      return ok(res, db.prepare('SELECT * FROM clientes WHERE id=?').get(id));
    }
    if (m === 'DELETE') { db.prepare('DELETE FROM clientes WHERE id=?').run(id); return ok(res, { ok: true }); }
  }

  // ---- consultores (equipe)
  if (pathname === '/api/consultores' && m === 'GET')
    return ok(res, db.prepare('SELECT * FROM consultores ORDER BY ativo DESC, nome').all());
  if (pathname === '/api/consultores' && m === 'POST') {
    if (!body.nome) return bad(res, 'Informe o nome.');
    const info = db.prepare('INSERT INTO consultores (nome, telefone, cor) VALUES (?,?,?)')
      .run(body.nome, soDigitos(body.telefone), body.cor ?? '#e6192e');
    return ok(res, db.prepare('SELECT * FROM consultores WHERE id=?').get(info.lastInsertRowid));
  }
  if ((mm = pathname.match(/^\/api\/consultores\/(\d+)$/))) {
    const id = +mm[1];
    if (m === 'PUT') {
      db.prepare('UPDATE consultores SET nome=?, telefone=?, cor=?, ativo=? WHERE id=?')
        .run(body.nome, soDigitos(body.telefone), body.cor, body.ativo ? 1 : 0, id);
      return ok(res, db.prepare('SELECT * FROM consultores WHERE id=?').get(id));
    }
    if (m === 'DELETE') { db.prepare('DELETE FROM consultores WHERE id=?').run(id); return ok(res, { ok: true }); }
  }

  // ---- serviços (Arsenal)
  if (pathname === '/api/servicos' && m === 'GET') {
    const todos = searchParams.get('todos');
    return ok(res, db.prepare(`SELECT * FROM servicos ${todos ? '' : 'WHERE ativo=1'} ORDER BY nome`).all());
  }
  if (pathname === '/api/servicos' && m === 'POST') {
    if (!body.nome) return bad(res, 'Informe o nome do serviço.');
    const info = db.prepare(`INSERT INTO servicos (nome, descricao, preco, duracao_min, categoria, ativo)
      VALUES (?,?,?,?,?,?)`).run(body.nome, body.descricao ?? null, body.preco ?? 0,
      body.duracao_min ?? 60, body.categoria ?? null, body.ativo === 0 ? 0 : 1);
    return ok(res, db.prepare('SELECT * FROM servicos WHERE id=?').get(info.lastInsertRowid));
  }
  if ((mm = pathname.match(/^\/api\/servicos\/(\d+)$/))) {
    const id = +mm[1];
    if (m === 'PUT') {
      db.prepare(`UPDATE servicos SET nome=?, descricao=?, preco=?, duracao_min=?, categoria=?, ativo=? WHERE id=?`)
        .run(body.nome, body.descricao, body.preco ?? 0, body.duracao_min ?? 60, body.categoria, body.ativo ? 1 : 0, id);
      return ok(res, db.prepare('SELECT * FROM servicos WHERE id=?').get(id));
    }
    if (m === 'DELETE') { db.prepare('DELETE FROM servicos WHERE id=?').run(id); return ok(res, { ok: true }); }
  }

  // ---- CRM (métricas)
  if (pathname === '/api/crm' && m === 'GET') {
    const one = (sql, ...p) => db.prepare(sql).get(...p).n;
    const total = one('SELECT COUNT(*) n FROM agendamentos');
    const compareceram = one('SELECT COUNT(*) n FROM agendamentos WHERE compareceu=1');
    const naoVieram = one('SELECT COUNT(*) n FROM agendamentos WHERE compareceu=0');
    const concluidos = one("SELECT COUNT(*) n FROM agendamentos WHERE status='concluido'");
    const porOrigem = db.prepare('SELECT origem, COUNT(*) total FROM agendamentos GROUP BY origem ORDER BY total DESC').all();
    const porConsultor = db.prepare(`SELECT c.nome, COUNT(a.id) total,
        SUM(CASE WHEN a.status='concluido' THEN 1 ELSE 0 END) concluidos
      FROM consultores c LEFT JOIN agendamentos a ON a.consultor_id=c.id
      GROUP BY c.id ORDER BY total DESC`).all();
    const taxaComparecimento = total ? Math.round((compareceram / total) * 100) : 0;
    const taxaConversao = compareceram ? Math.round((concluidos / compareceram) * 100) : 0;
    return ok(res, { total, compareceram, naoVieram, concluidos,
      taxaComparecimento, taxaConversao, porOrigem, porConsultor });
  }

  // ---- follow-up: agendamentos que precisam de retorno (não vieram / não fechou)
  if (pathname === '/api/followup' && m === 'GET') {
    return ok(res, db.prepare(`
      SELECT a.*, c.nome AS consultor_nome FROM agendamentos a
      LEFT JOIN consultores c ON c.id=a.consultor_id
      WHERE a.status IN ('nao_veio','nao_fechou') OR a.compareceu=0
      ORDER BY a.data DESC`).all());
  }

  // ---- integrações (Google Agenda + webhook de saída)
  if (pathname === '/api/integracoes' && m === 'GET') {
    const c = getIntegracoes();
    return ok(res, { ics_token: c.ics_token, webhook_url: c.webhook_url || '', webhook_ativo: !!c.webhook_ativo });
  }
  if (pathname === '/api/integracoes' && m === 'PUT') {
    const c = getIntegracoes();
    db.prepare(`UPDATE integracoes SET webhook_url=?, webhook_ativo=?, atualizado_em=datetime('now','localtime') WHERE id=1`)
      .run(body.webhook_url !== undefined ? body.webhook_url : c.webhook_url,
           body.webhook_ativo !== undefined ? (body.webhook_ativo ? 1 : 0) : c.webhook_ativo);
    return ok(res, { ok: true });
  }
  if (pathname === '/api/integracoes/testar-webhook' && m === 'POST') {
    const urlW = (body.webhook_url || getIntegracoes().webhook_url || '').trim();
    if (!urlW) return bad(res, 'Informe a URL do webhook.');
    try {
      const r = await fetch(urlW, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evento: 'teste', em: new Date().toISOString(), mensagem: 'Teste do IndyCar Agendamentos 🏁' }) });
      return ok(res, { ok: r.ok, status: r.status });
    } catch (e) { return ok(res, { ok: false, erro: String(e?.message || e) }); }
  }

  // ---- feed do Google Agenda (ICS) — protegido pelo token
  if (pathname === '/api/agenda.ics' && m === 'GET') {
    const t = searchParams.get('t');
    if (!t || t !== getIntegracoes().ics_token) return send(res, 403, 'forbidden', { 'Content-Type': 'text/plain' });
    return send(res, 200, gerarICS(), { 'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="indycar-agendamentos.ics"' });
  }

  // ---- exportações CSV (abre no Excel)
  if (pathname === '/api/export/agendamentos.csv' && m === 'GET') {
    const rows = db.prepare(`SELECT a.id, a.cliente_nome AS cliente, a.telefone, a.veiculo, a.placa,
        a.servico, a.data, a.hora, a.status, a.origem, c.nome AS consultor, a.created_at AS criado_em
      FROM agendamentos a LEFT JOIN consultores c ON c.id=a.consultor_id ORDER BY a.data DESC, a.hora`).all();
    return send(res, 200, gerarCSV(['id','cliente','telefone','veiculo','placa','servico','data','hora','status','origem','consultor','criado_em'], rows),
      { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="agendamentos.csv"' });
  }
  if (pathname === '/api/export/clientes.csv' && m === 'GET') {
    const rows = db.prepare('SELECT id, nome, telefone, veiculo, placa, modelo, origem, created_at AS criado_em FROM clientes ORDER BY nome').all();
    return send(res, 200, gerarCSV(['id','nome','telefone','veiculo','placa','modelo','origem','criado_em'], rows),
      { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="clientes.csv"' });
  }

  // ---- histórico (todos, ordenado)
  if (pathname === '/api/historico' && m === 'GET') {
    return ok(res, db.prepare(`
      SELECT a.*, c.nome AS consultor_nome FROM agendamentos a
      LEFT JOIN consultores c ON c.id=a.consultor_id
      ORDER BY a.data DESC, a.hora DESC LIMIT 200`).all());
  }

  // ================= WHATSAPP =================
  // configuração da integração (token de acesso vem mascarado por segurança)
  if (pathname === '/api/whatsapp/config' && m === 'GET') {
    const c = getWaConfig();
    const tok = c.access_token || '';
    return ok(res, { ...c, access_token: undefined,
      tem_token: !!tok, token_mask: tok ? '••••••••' + tok.slice(-4) : '' });
  }
  if (pathname === '/api/whatsapp/config' && m === 'PUT') {
    const c = getWaConfig();
    // só atualiza o token se um novo for digitado (campo vazio mantém o atual)
    const token = (body.access_token && body.access_token.trim()) ? body.access_token.trim() : c.access_token;
    db.prepare(`UPDATE whatsapp_config SET ativo=?, phone_number_id=?, access_token=?,
      business_account_id=?, verify_token=?, api_version=?, numero_exibicao=?,
      lembrete_ativo=?, lembrete_horas=?, atualizado_em=datetime('now','localtime') WHERE id=1`).run(
      body.ativo ? 1 : 0, body.phone_number_id ?? null, token ?? null,
      body.business_account_id ?? null, body.verify_token || 'indycar',
      body.api_version || 'v21.0', body.numero_exibicao ?? null,
      body.lembrete_ativo ? 1 : 0, Number(body.lembrete_horas) || 24);
    const nc = getWaConfig(); const t = nc.access_token || '';
    return ok(res, { ...nc, access_token: undefined, tem_token: !!t,
      token_mask: t ? '••••••••' + t.slice(-4) : '' });
  }
  // testa a conexão com a Cloud API (aceita credenciais no corpo antes de salvar)
  if (pathname === '/api/whatsapp/testar' && m === 'POST') {
    const c = getWaConfig();
    const cfg = { ...c, ...body,
      access_token: (body.access_token && body.access_token.trim()) ? body.access_token.trim() : c.access_token };
    if (!cfg.phone_number_id || !cfg.access_token)
      return bad(res, 'Informe o Phone Number ID e o Access Token.');
    const ver = cfg.api_version || 'v21.0';
    try {
      const r = await fetch(`https://graph.facebook.com/${ver}/${cfg.phone_number_id}?fields=display_phone_number,verified_name,quality_rating`,
        { headers: { Authorization: `Bearer ${cfg.access_token}` } });
      const data = await r.json().catch(() => ({}));
      if (r.ok) return ok(res, { ok: true, numero: data.display_phone_number,
        nome: data.verified_name, qualidade: data.quality_rating });
      return ok(res, { ok: false, erro: data.error?.message || `HTTP ${r.status}` });
    } catch (e) { return ok(res, { ok: false, erro: String(e?.message || e) }); }
  }

  if (pathname === '/api/whatsapp/templates' && m === 'GET')
    return ok(res, db.prepare('SELECT * FROM whatsapp_templates ORDER BY id').all());
  if (pathname === '/api/whatsapp/templates' && m === 'POST') {
    const info = db.prepare('INSERT INTO whatsapp_templates (nome, gatilho, corpo) VALUES (?,?,?)')
      .run(body.nome, body.gatilho ?? 'manual', body.corpo);
    return ok(res, db.prepare('SELECT * FROM whatsapp_templates WHERE id=?').get(info.lastInsertRowid));
  }
  if ((mm = pathname.match(/^\/api\/whatsapp\/templates\/(\d+)$/))) {
    const id = +mm[1];
    if (m === 'PUT') {
      db.prepare('UPDATE whatsapp_templates SET nome=?, gatilho=?, corpo=?, ativo=? WHERE id=?')
        .run(body.nome, body.gatilho, body.corpo, body.ativo ? 1 : 0, id);
      return ok(res, db.prepare('SELECT * FROM whatsapp_templates WHERE id=?').get(id));
    }
    if (m === 'DELETE') { db.prepare('DELETE FROM whatsapp_templates WHERE id=?').run(id); return ok(res, { ok: true }); }
  }

  // histórico de mensagens
  if (pathname === '/api/whatsapp/mensagens' && m === 'GET') {
    const ag = searchParams.get('agendamento_id');
    if (ag) return ok(res, db.prepare('SELECT * FROM whatsapp_mensagens WHERE agendamento_id=? ORDER BY id').all(+ag));
    return ok(res, db.prepare('SELECT * FROM whatsapp_mensagens ORDER BY id DESC LIMIT 100').all());
  }

  // prepara a mensagem (renderiza template para um agendamento) sem enviar
  if (pathname === '/api/whatsapp/preparar' && m === 'POST') {
    const tpl = db.prepare('SELECT * FROM whatsapp_templates WHERE id=?').get(body.template_id);
    if (!tpl) return bad(res, 'Template não encontrado.');
    let ctx = { nome: body.nome ?? '', servico: '', data: '', hora: '', veiculo: '', placa: '' };
    if (body.agendamento_id) {
      const a = db.prepare('SELECT * FROM agendamentos WHERE id=?').get(body.agendamento_id);
      if (a) ctx = { nome: a.cliente_nome, servico: a.servico, data: formatarDataBR(a.data),
                     hora: a.hora, veiculo: a.veiculo ?? '', placa: a.placa ?? '' };
    }
    const corpo = renderTemplate(tpl.corpo, ctx);
    return ok(res, { corpo, telefone: body.telefone ?? '' });
  }

  // envia: registra a mensagem no banco e devolve o link wa.me (clique-para-conversar)
  if (pathname === '/api/whatsapp/enviar' && m === 'POST') {
    let { agendamento_id, telefone, nome, corpo, template_id } = body;
    if (template_id && !corpo) {
      const tpl = db.prepare('SELECT * FROM whatsapp_templates WHERE id=?').get(template_id);
      if (tpl) {
        let ctx = { nome: nome ?? '', servico: '', data: '', hora: '', veiculo: '', placa: '' };
        if (agendamento_id) {
          const a = db.prepare('SELECT * FROM agendamentos WHERE id=?').get(agendamento_id);
          if (a) { ctx = { nome: a.cliente_nome, servico: a.servico, data: formatarDataBR(a.data),
                           hora: a.hora, veiculo: a.veiculo ?? '', placa: a.placa ?? '' };
                   telefone = telefone ?? a.telefone; }
        }
        corpo = renderTemplate(tpl.corpo, ctx);
      }
    }
    if (!telefone || !corpo) return bad(res, 'Informe telefone e mensagem.');
    const r = await despacharMensagem({
      agendamento_id: agendamento_id ?? null, telefone, nome: nome ?? null,
      corpo, template_id: template_id ?? null,
    });
    return ok(res, r);
  }

  // ---- IA: configuração (chaves devolvidas mascaradas)
  if (pathname === '/api/whatsapp/ia/config' && m === 'GET') return ok(res, iaConfigMascarada());
  if (pathname === '/api/whatsapp/ia/config' && m === 'PUT') {
    const c = getIaConfig();
    // merge: só altera o que veio no corpo; o resto mantém o valor atual
    const pick = (k, def) => (body[k] !== undefined ? body[k] : (c[k] ?? def));
    const key = (body.api_key && body.api_key.trim()) ? body.api_key.trim() : c.api_key;
    const ckey = (body.cw_api_key && body.cw_api_key.trim()) ? body.cw_api_key.trim() : c.cw_api_key;
    db.prepare(`UPDATE ia_config SET ativo=?, motor=?, api_key=?, modelo=?, persona=?, saudacao=?,
      cw_api_key=?, cw_service_id=?, cw_db_service_id=?, cw_noshow_service_id=?, cw_connect_service_id=?,
      cw_device_id=?, cw_base_url=?, atualizado_em=datetime('now','localtime') WHERE id=1`).run(
      (body.ativo !== undefined ? (body.ativo ? 1 : 0) : (c.ativo ? 1 : 0)),
      pick('motor', 'anthropic'), key ?? null, pick('modelo', 'claude-opus-4-8'),
      pick('persona', null), pick('saudacao', null), ckey ?? null,
      pick('cw_service_id', null), pick('cw_db_service_id', null), pick('cw_noshow_service_id', null),
      pick('cw_connect_service_id', null), pick('cw_device_id', null), pick('cw_base_url', 'https://runtime.codewords.ai'));
    return ok(res, iaConfigMascarada());
  }
  // (endpoints de IA do app removidos — quem atende é a IA já cadastrada no WhatsApp)
  // CodeWords: disparar um workflow qualquer. Usa a chave salva ou a do corpo.
  if (pathname === '/api/codewords/run' && m === 'POST') {
    const c = getIaConfig();
    const api_key = (body.api_key && body.api_key.trim()) ? body.api_key.trim() : c.cw_api_key;
    const service_id = body.service_id || c.cw_service_id;
    if (!api_key || !service_id) return bad(res, 'Informe service_id e a chave do CodeWords (ou salve na config).');
    const r = await chamarCodeWords({ base_url: body.base_url || c.cw_base_url, api_key, service_id,
      inputs: body.inputs ?? {}, background: !!body.in_background });
    return ok(res, r);
  }
  // CodeWords: importar agendamentos pendentes do workflow "Banco de Agendamentos"
  if (pathname === '/api/codewords/importar' && m === 'POST') {
    return ok(res, await importarAgendamentosCW());
  }
  // WhatsApp via QR Code (CodeWords whatsapp_device_manager)
  if (pathname === '/api/whatsapp/conexao' && m === 'GET') {
    const cfg = getIaConfig();
    if (!cfg.cw_api_key) return ok(res, { configurado: false, erro: 'Configure a chave do CodeWords (aba IA).' });
    const sid = cfg.cw_connect_service_id || 'whatsapp_device_manager';
    let devId = cfg.cw_device_id || '';
    const call = (path, inputs = {}) => chamarCodeWords({ base_url: cfg.cw_base_url, api_key: cfg.cw_api_key,
      service_id: sid, path, method: 'POST', inputs });
    const criarDevice = async () => {
      const sp = (cfg.cw_service_id || 'indycar_carlos_whatsapp_e3cd01d3').replace(/\/?$/, '/');
      const novo = await call('devices', { service_path: sp });
      const nid = novo.ok && (novo.data?.device_id || novo.data?.id);
      if (nid) { devId = nid; db.prepare('UPDATE ia_config SET cw_device_id=? WHERE id=1').run(nid); }
      return !!nid;
    };

    if (devId && url.searchParams.get('acao') === 'reconnect') await call(`devices/${devId}/reconnect`, {});

    const carlosPath = (cfg.cw_service_id || 'indycar_carlos_whatsapp_e3cd01d3').replace(/\/?$/, '/');
    const ehConectado = (s) => /^(logged_?in|authenticated|paired)$/i.test(String(s || '').trim());

    // Lista os devices e PRIORIZA um já conectado (logged_in) do nosso atendente.
    const lst = await call('devices/list', {});
    const devices = (lst.ok && lst.data && lst.data.devices) || [];
    const meus = devices.filter(d => (d.service_path || '') === carlosPath);
    const logado = meus.find(d => ehConectado(d.gowa_status?.results?.state));
    if (logado) {
      if (devId !== logado.device_id) db.prepare('UPDATE ia_config SET cw_device_id=? WHERE id=1').run(logado.device_id);
      return ok(res, { configurado: true, ok: true, conectado: true, status: 'logged_in',
        device_id: logado.device_id, numero: (logado.gowa_status?.results?.jid || '').split('@')[0] || null });
    }

    // Não conectado: reaproveita um device existente do serviço (evita criar duplicados).
    if (!meus.find(d => d.device_id === devId)) devId = meus[0]?.device_id || '';
    if (url.searchParams.get('only') === 'status')
      return ok(res, { configurado: true, ok: true, conectado: false, status: 'disconnected', device_id: devId });

    // Gera/atualiza o QR (cria device só se realmente não houver nenhum).
    if (!devId) await criarDevice();
    let login = devId ? await call(`devices/${devId}/login`, {}) : { ok: false };
    if (!login.ok) { if (await criarDevice()) login = await call(`devices/${devId}/login`, {}); }
    if (!login.ok) return ok(res, { configurado: true, ok: false, erro: login.erro || 'Falha ao gerar QR', device_id: devId });
    return ok(res, { configurado: true, ok: true, conectado: false, status: 'aguardando_leitura',
      qr: login.data?.qr_link || login.data?.qr || '', qr_duration: login.data?.qr_duration || 0, device_id: devId });
  }
  // Cria um dispositivo no whatsapp_device_manager (uma vez) e salva o device_id
  if (pathname === '/api/whatsapp/conexao/criar' && m === 'POST') {
    const cfg = getIaConfig();
    if (!cfg.cw_api_key) return bad(res, 'Configure a chave do CodeWords.');
    const sid = cfg.cw_connect_service_id || 'whatsapp_device_manager';
    const service_path = body.service_path || (cfg.cw_service_id ? cfg.cw_service_id.replace(/\/?$/, '/') : 'indycar_carlos_whatsapp_e3cd01d3/');
    const r = await chamarCodeWords({ base_url: cfg.cw_base_url, api_key: cfg.cw_api_key,
      service_id: sid, path: 'devices', method: 'POST', inputs: { service_path } });
    if (!r.ok) return ok(res, { ok: false, erro: r.erro });
    const deviceId = r.data?.device_id || r.data?.id;
    if (deviceId) db.prepare('UPDATE ia_config SET cw_device_id=? WHERE id=1').run(deviceId);
    return ok(res, { ok: true, device_id: deviceId, raw: r.data });
  }

  // marca status de uma mensagem (entregue/lido)
  if ((mm = pathname.match(/^\/api\/whatsapp\/mensagens\/(\d+)$/)) && m === 'PATCH') {
    db.prepare('UPDATE whatsapp_mensagens SET status=? WHERE id=?').run(body.status, +mm[1]);
    return ok(res, { ok: true });
  }

  // WEBHOOK — verificação (GET) do WhatsApp Cloud API (Meta)
  if (pathname === '/api/whatsapp/webhook' && m === 'GET') {
    const esperado = getWaConfig().verify_token || WHATSAPP_VERIFY_TOKEN;
    if (searchParams.get('hub.mode') === 'subscribe' &&
        searchParams.get('hub.verify_token') === esperado) {
      return send(res, 200, searchParams.get('hub.challenge') || '', { 'Content-Type': 'text/plain' });
    }
    return send(res, 403, 'forbidden', { 'Content-Type': 'text/plain' });
  }
  // WEBHOOK — recebimento (POST): mensagens de entrada e recibos de status
  if (pathname === '/api/whatsapp/webhook' && m === 'POST') {
    try {
      const entry = body?.entry?.[0]?.changes?.[0]?.value;
      const msg = entry?.messages?.[0];
      if (msg) {
        const texto = msg.text?.body || `[${msg.type}]`;
        const nome = entry?.contacts?.[0]?.profile?.name || null;
        registrarEntrada(msg.from, nome, texto);
        // (sem auto-resposta: quem atende é a IA já cadastrada no WhatsApp)
      }
      // recibos de entrega/leitura atualizam a mensagem de saída pelo wamid
      const st = entry?.statuses?.[0];
      if (st?.id) {
        const map = { sent:'enviado', delivered:'entregue', read:'lido', failed:'falhou' };
        db.prepare('UPDATE whatsapp_mensagens SET status=? WHERE wamid=?')
          .run(map[st.status] || st.status, st.id);
      }
    } catch { /* ignora payloads inesperados */ }
    return send(res, 200, 'EVENT_RECEIVED', { 'Content-Type': 'text/plain' });
  }

  return notFound(res);
}

// ---------------------------------------------------------------------------
// Arquivos estáticos
// ---------------------------------------------------------------------------
async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const filePath = normalize(join(PUBLIC, rel));
  if (!filePath.startsWith(PUBLIC)) return notFound(res); // anti path-traversal
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache, must-revalidate',  // evita servir front-end desatualizado
    });
    res.end(data);
  } catch {
    // SPA fallback
    try {
      const html = await readFile(join(PUBLIC, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch { notFound(res); }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return await serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    send(res, 500, { erro: 'Erro interno', detalhe: String(e?.message || e) });
  }
});

// ---------------------------------------------------------------------------
// Lembretes automáticos (agendador)
// ---------------------------------------------------------------------------
function fmtLocal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

async function verificarLembretes() {
  const cfg = getWaConfig();
  if (!cfg.lembrete_ativo) return;
  // envia pelo número conectado (GOWA); se não houver, tenta a Cloud API da Meta
  const temCloud = !!(cfg.ativo && cfg.phone_number_id && cfg.access_token);

  const horas = Number(cfg.lembrete_horas) || 24;
  const limite = fmtLocal(new Date(Date.now() + horas * 3600 * 1000));
  const lista = db.prepare(`SELECT * FROM agendamentos WHERE lembrete_enviado=0
    AND status IN ('aguardando','confirmado') AND telefone IS NOT NULL AND telefone <> ''
    AND datetime(data || ' ' || hora) > datetime('now','localtime')
    AND datetime(data || ' ' || hora) <= ?`).all(limite);
  if (!lista.length) return;

  const tpl = db.prepare("SELECT * FROM whatsapp_templates WHERE gatilho='lembrete' AND ativo=1").get();
  const emp = db.prepare('SELECT nome FROM empresa WHERE id=1').get() || {};
  for (const a of lista) {
    const ctx = { nome: a.cliente_nome, servico: a.servico, data: formatarDataBR(a.data),
                  hora: a.hora, veiculo: a.veiculo || '', placa: a.placa || '' };
    const corpo = tpl ? renderTemplate(tpl.corpo, ctx)
      : `Oi ${a.cliente_nome}! Lembrete do seu agendamento em ${formatarDataBR(a.data)} às ${a.hora} para ${a.servico} na ${emp.nome}. Te esperamos! 🏁`;
    try {
      // 1º tenta o número conectado (GOWA); se falhar e houver Cloud API, usa a Meta
      let r = await enviarViaGowa(a.telefone, corpo);
      if (r.ok) {
        db.prepare(`INSERT INTO whatsapp_mensagens (agendamento_id, telefone, nome, corpo, direcao, status, template_id)
                    VALUES (?,?,?,?,?,?,?)`).run(a.id, soDigitos(a.telefone), a.cliente_nome, corpo, 'saida', 'enviado', tpl?.id ?? null);
      } else if (temCloud) {
        await despacharMensagem({ agendamento_id: a.id, telefone: a.telefone, nome: a.cliente_nome, corpo, template_id: tpl?.id ?? null });
        r = { ok: true };
      }
      if (!r.ok) continue; // sem canal disponível agora — tenta no próximo ciclo
      db.prepare('UPDATE agendamentos SET lembrete_enviado=1 WHERE id=?').run(a.id);
      console.log(`Lembrete enviado: agendamento #${a.id} (${a.cliente_nome})`);
    } catch (e) { console.error('Lembrete:', e); }
  }
}

setInterval(() => verificarLembretes().catch(() => {}), 5 * 60 * 1000); // a cada 5 min
setTimeout(() => verificarLembretes().catch(() => {}), 10 * 1000);      // 10s após iniciar

// Sincroniza (importa) agendamentos do CodeWords periodicamente — só age se configurado
setInterval(() => importarAgendamentosCW().catch(() => {}), 3 * 60 * 1000);
setTimeout(() => importarAgendamentosCW().catch(() => {}), 12 * 1000);

// Espelho local → cloud: o servidor local (banco durável) reenvia seus agendamentos
// pro site online, repovoando-o após os resets do plano free (dedupe no destino).
const MIRROR_URL = process.env.MIRROR_URL || 'https://indycar-agendamentos.onrender.com';
async function espelharParaCloud() {
  if (process.env.RENDER || process.env.MIRROR_DISABLED === '1') return; // só o local espelha
  try {
    const ags = db.prepare('SELECT * FROM agendamentos').all();
    let enviados = 0;
    for (const a of ags) {
      const r = await fetch(MIRROR_URL + '/api/agendamentos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_nome: a.cliente_nome, telefone: a.telefone, veiculo: a.veiculo,
          placa: a.placa, servico: a.servico, data: a.data, hora: a.hora, origem: a.origem,
          status: a.status, confirmado: a.confirmado, observacoes: a.observacoes }),
      }).catch(() => null);
      if (r && r.ok) enviados++;
    }
    if (enviados) console.log(`Espelho → cloud: ${enviados} agendamento(s) verificados/enviados`);
  } catch (e) { console.error('Espelho:', e.message); }
}
setInterval(() => espelharParaCloud().catch(() => {}), 10 * 60 * 1000);
setTimeout(() => espelharParaCloud().catch(() => {}), 20 * 1000);

server.listen(PORT, () => {
  console.log(`\n  🏁 IndyCar Agendamentos rodando em http://localhost:${PORT}\n`);
});
