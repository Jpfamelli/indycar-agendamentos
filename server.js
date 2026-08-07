// IndyCar Agendamentos — servidor HTTP (somente módulos nativos do Node)
// Persistência: Supabase (PostgREST) via dados.js / supabase.js — não há mais SQLite.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize, sep } from 'node:path';
import * as dados from './dados.js';
import { conferirConfiguracao } from './supabase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
let _ultimaImportacao = 0; // controle p/ importar ao abrir o painel (no máx 1x/min)

// Token de verificação do webhook do WhatsApp Cloud API (configurável por env)
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'indycar';

// Os ids agora são uuid: as rotas de item não podem mais casar apenas dígitos.
const UUID = '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})';

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

// Data de hoje no fuso da oficina (America/Sao_Paulo) — não em UTC.
const hoje = dados.hoje;
const soDigitos = dados.soDigitos;

// Normaliza telefone para o formato internacional (DDI Brasil quando faltar)
function telefoneInternacional(telefone) {
  let num = soDigitos(telefone);
  // O '55' só é DDI quando o número tem 12-13 dígitos. Um celular do RS
  // (DDD 55, 11 dígitos) começa com 55 e PRECISA do DDI mesmo assim —
  // decidir pelo prefixo mandaria a mensagem para o número errado.
  if (num && num.length <= 11) num = '55' + num;
  return num;
}

// Monta link de clique-para-conversar do WhatsApp (wa.me)
function linkWhatsApp(telefone, texto) {
  return `https://wa.me/${telefoneInternacional(telefone)}?text=${encodeURIComponent(texto)}`;
}

// Lê a configuração da integração (linha única). AGORA É ASSÍNCRONA.
const getWaConfig = () => dados.obterWaConfig();

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
async function despacharMensagem({ agendamento_id = null, telefone, nome = null, corpo }) {
  const cfg = await getWaConfig();
  const usarCloud = !!(cfg.ativo && cfg.phone_number_id && cfg.access_token);
  let status = 'enviado', wamid = null, erro = null, modo = 'wa.me';
  if (usarCloud) {
    modo = 'cloud';
    const r = await enviarCloudAPI(cfg, telefone, corpo);
    if (r.ok) wamid = r.wamid; else { status = 'falhou'; erro = r.erro; }
  }
  // O id agora vem do próprio INSERT (Prefer: return=representation), não de lastInsertRowid.
  const msg = await dados.registrarMensagem({
    agendamento_id, telefone, nome, corpo, direcao: 'saida', status, wamid, erro,
  });
  return { id: msg?.id ?? null, modo, status, erro, corpo, link: linkWhatsApp(telefone, corpo) };
}

// ============================= IA DE ATENDIMENTO =============================
const getIaConfig = () => dados.obterIaConfig();

// Config da IA com as chaves mascaradas (nunca devolve as chaves cruas)
async function iaConfigMascarada() {
  const c = await getIaConfig();
  const k = c.api_key || '', ck = c.cw_api_key || '';
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

// Importa agendamentos pendentes do workflow "Banco de Agendamentos" para o Supabase
async function importarAgendamentosCW() {
  // Só UM importador deve puxar do CodeWords (senão os agendamentos se dividem).
  // Por padrão, só o CLOUD (Render define RENDER=true) importa; o local não.
  // Override: IMPORT_ENABLED=1 liga; IMPORT_DISABLED=1 desliga.
  if (process.env.IMPORT_DISABLED === '1') return { ok: false, erro: 'importação desativada (IMPORT_DISABLED)' };
  if (!process.env.RENDER && process.env.IMPORT_ENABLED !== '1')
    return { ok: false, erro: 'importação só no cloud (defina IMPORT_ENABLED=1 p/ ligar no local)' };
  const cfg = await getIaConfig();
  if (!cfg.cw_api_key || !cfg.cw_db_service_id)
    return { ok: false, erro: 'Configure a chave e o Service ID do banco de agendamentos.' };
  const resp = await chamarCodeWords({ base_url: cfg.cw_base_url, api_key: cfg.cw_api_key,
    service_id: cfg.cw_db_service_id, path: 'listar', method: 'GET' });
  if (!resp.ok) return { ok: false, erro: resp.erro };
  const itens = extrairListaCW(resp.data);
  let importados = 0, ignorados = 0;
  for (const a of itens) {
    // Um item inválido não pode abortar a importação inteira.
    try {
      const nome = a.nome || a.cliente_nome || a.cliente;
      if (!nome) { ignorados++; continue; }
      // O fluxo do CodeWords manda o número em "tel" — sem ele aqui, o
      // agendamento entrava com telefone vazio e NÃO se ligava ao cadastro
      // do cliente nem ao lead do CRM.
      const telefone = soDigitos(a.tel || a.telefone || a.phone
                              || a.celular || a.whatsapp || a.numero || '');
      // O SQLite aceitava qualquer texto em data/hora; o Postgres rejeita (22007).
      const data = dados.dataBanco(a.data || a.date);
      const hora = dados.horaBanco(a.hora || a.time);
      if (!data || !hora) { ignorados++; continue; }

      // dedupe por telefone + data + hora, com a hora normalizada dos DOIS lados
      // (o Postgres devolve '09:00:00' e o workflow manda '09:00')
      // passa o nome também: item sem telefone (comum) ficaria sem dedupe nenhum
      // e reentraria a cada importação
      const jaExiste = await dados.agendamentoDuplicado(data, hora, telefone, nome);
      if (jaExiste) continue;

      const veic = [a.veiculo || a['veículo'] || '', a.ano || ''].filter(Boolean).join(' ').trim();
      let cliente_id = null;
      if (telefone) {
        cliente_id = await dados.obterOuCriarCliente({
          nome, telefone, veiculo: veic || null, placa: a.placa || null,
          origem: a.origem || 'WhatsApp',
        });
      }
      /* Data no passado é quase sempre erro de interpretação lá na origem
         (o cliente diz "amanhã" e volta uma data de anos atrás). Não dá para
         adivinhar a correta — mas deixar passar calado é pior: o horário some
         da agenda e a oficina perde a pessoa. Então importa e AVISA. */
      const hoje = new Date().toISOString().slice(0, 10);
      const suspeita = data < hoje;
      if (suspeita) {
        console.warn(`⚠️  Importação: "${nome}" veio com data ${data}, que já passou. `
                   + 'Provável erro de data no fluxo do CodeWords — confira na agenda.');
      }

      await dados.criarAgendamento({
        cliente_id, cliente_nome: nome, telefone, veiculo: veic || null, placa: a.placa || null,
        servico: a.servico || a['serviço'] || 'Serviço', data, hora,
        origem: a.origem || 'WhatsApp', status: 'confirmado', confirmado: true,
        observacoes: suspeita
          ? `⚠️ Data ${data.split('-').reverse().join('/')} veio do CodeWords e já passou — `
          + 'confirme o dia com o cliente antes de contar com este horário.'
          : null,
      });
      importados++;
    } catch (e) {
      ignorados++;
      console.error('Importação CodeWords (item ignorado):', e?.message || e);
    }
  }
  // NÃO marca como importado por padrão: assim o /listar segue devolvendo tudo e o app
  // re-importa (com dedupe por telefone+data+hora) a cada abertura.
  // (Defina MARK_IMPORTED=1 p/ voltar a marcar.)
  if (itens.length && process.env.MARK_IMPORTED === '1') {
    await chamarCodeWords({ base_url: cfg.cw_base_url, api_key: cfg.cw_api_key,
      service_id: cfg.cw_db_service_id, path: 'marcar_importados', method: 'POST', inputs: {} }).catch(() => {});
  }
  return { ok: true, importados, ignorados, encontrados: itens.length };
}

// Dispara o workflow de notificação de ausência (cliente que não compareceu)
/* Avisa a IA do WhatsApp que o cliente não apareceu, para ELA fazer o
   follow-up e tentar remarcar.

   RODA A QUALQUER HORA. O fluxo tem um campo `respeitar_horario_comercial`
   que vem ligado por padrão — era ele que segurava o aviso fora do
   expediente. Quem furou às 22h precisa ser chamado de volta igual, então
   mandamos false. Para voltar a respeitar o expediente, é só definir
   NOSHOW_SO_NO_EXPEDIENTE=1 no .env. */
async function notificarAusencia(ag) {
  const cfg = await getIaConfig();
  if (!cfg.cw_api_key || !cfg.cw_noshow_service_id || !ag?.telefone) {
    return { ok: false, erro: 'CodeWords não configurado ou agendamento sem telefone' };
  }
  return chamarCodeWords({
    base_url: cfg.cw_base_url, api_key: cfg.cw_api_key,
    service_id: cfg.cw_noshow_service_id,
    inputs: {
      nome:     ag.cliente_nome || '',
      telefone: String(ag.telefone).replace(/\D/g, ''),
      veiculo:  ag.veiculo || '',
      servico:  ag.servico || '',
      hora:     String(ag.hora || '').slice(0, 5),
      placa:    ag.placa || '',
      respeitar_horario_comercial: process.env.NOSHOW_SO_NO_EXPEDIENTE === '1',
    },
  });
}

// Envia uma mensagem pelo WhatsApp CONECTADO (proxy GOWA, form-data)
async function enviarViaGowa(telefone, mensagem) {
  const cfg = await getIaConfig();
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
const getIntegracoes = () => dados.obterIntegracoes();

// Dispara o webhook de saída (Zapier/Make/n8n). A leitura da config é aguardada;
// o POST em si é proposital "dispare e esqueça" (com catch) para não segurar a resposta.
async function dispararWebhook(evento, payload) {
  const cfg = await getIntegracoes();
  if (!cfg.webhook_ativo || !cfg.webhook_url) return;
  fetch(cfg.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evento, em: new Date().toISOString(), ...payload }),
  }).catch((e) => console.error('Webhook saída:', e.message));
}

// Gera o calendário ICS (Google Agenda assina essa URL)
async function gerarICS() {
  const [emp, ags, dur] = await Promise.all([
    dados.obterEmpresa(),
    dados.agendamentosParaICS(500),
    dados.duracoesDeServicos(),
  ]);
  const escTxt = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  // hora chega normalizada em HH:MM da camada de dados
  const fmt = (d, hm) => d.replace(/-/g, '') + 'T' + String(hm).replace(/:/g, '').slice(0, 4) + '00';
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IndyCar Agendamentos//PT-BR',
    'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escTxt(emp.nome || 'IndyCar')} — Agendamentos`, 'X-WR-TIMEZONE:America/Sao_Paulo'];
  for (const a of ags) {
    if (!a.data || !a.hora) continue;
    // prioriza o servico_id (exato); só cai no nome quando não houver vínculo
    const minutos = dur.porId.get(a.servico_id)
      ?? dur.porNome.get(String(a.servico || '').trim().toLowerCase())
      ?? 60;
    const ini = new Date(`${a.data}T${a.hora}:00`);
    if (Number.isNaN(ini.getTime())) continue;
    const fim = new Date(ini.getTime() + minutos * 60000);
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
  return '\ufeff' + [colunas.map(q).join(';'), ...rows.map(r => colunas.map(c => q(r[c])).join(';'))].join('\r\n');
}

// Registra mensagem de entrada do cliente (webhook da Meta)
async function registrarEntrada(telefone, nome, texto) {
  await dados.registrarMensagem({
    telefone, nome: nome ?? null, corpo: texto, direcao: 'entrada', status: 'recebido',
  });
}

// Substitui {nome} {servico} {data} {hora} {veiculo} {placa} no template
function renderTemplate(corpo, ctx) {
  return String(corpo).replace(/\{(\w+)\}/g, (_, k) => (ctx[k] ?? `{${k}}`));
}

function formatarDataBR(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).split('-');
  return `${d}/${m}/${a}`;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
/* ---------------------------------------------------------------------------
   Porteiro — a Agenda ficou publicada na internet e guarda nome, telefone,
   placa e histórico dos clientes. Mesmo login do CRM e do Atendimento
   (Supabase Auth): o navegador manda o token, aqui a gente confere se ele
   vale E se o perfil continua ativo.
   --------------------------------------------------------------------------- */
const SUPA_URL  = process.env.SUPABASE_URL || '';
const SUPA_ANON = process.env.SUPABASE_ANON_KEY || '';
const SUPA_SRV  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const CACHE_LOGIN = new Map();   // token -> { usuario, expira } | { negado, expira }

function validadeDoToken(token) {
  try {
    const [, carga] = token.split('.');
    const { exp } = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8'));
    return Number.isFinite(exp) ? exp * 1000 : 0;
  } catch { return 0; }
}

async function usuarioLogado(req) {
  const auth = req.headers['authorization'] || '';
  const achado = /^\s*bearer\s+(\S+)\s*$/i.exec(auth);      // "Bearer" é case-insensitive
  const token = achado ? achado[1] : null;
  if (!token || !SUPA_URL || !SUPA_ANON || !SUPA_SRV) return null;

  const lembrado = CACHE_LOGIN.get(token);
  if (lembrado && lembrado.expira > Date.now()) return lembrado.negado ? null : lembrado.usuario;

  const vence = validadeDoToken(token);
  if (vence && vence <= Date.now()) return null;            // já venceu: nem pergunta

  const negar = () => {
    if (CACHE_LOGIN.size > 500) CACHE_LOGIN.clear();
    CACHE_LOGIN.set(token, { negado: true, expira: Date.now() + 30_000 });
    return null;
  };

  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { apikey: SUPA_ANON, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return negar();
    const usuario = await r.json();
    if (!usuario?.id) return negar();

    const p = await fetch(
      `${SUPA_URL}/rest/v1/perfis?select=ativo,papel&id=eq.${encodeURIComponent(usuario.id)}`,
      { headers: { apikey: SUPA_SRV, Authorization: `Bearer ${SUPA_SRV}` },
        signal: AbortSignal.timeout(8000) });
    if (!p.ok) return negar();
    const [perfil] = await p.json();
    if (!perfil?.ativo) return negar();
    usuario.papel = perfil.papel;

    if (CACHE_LOGIN.size > 500) CACHE_LOGIN.clear();
    CACHE_LOGIN.set(token, { usuario, expira: Math.min(Date.now() + 60_000, vence || Infinity) });
    return usuario;
  } catch { return null; }
}

/* Rotas que o CodeWords/Google chamam de fora e não falam Supabase Auth.
   Cada uma tem o próprio segredo (token do ICS, verify_token do webhook). */
const ROTAS_SEM_LOGIN = new Set(['/api/config', '/api/agenda.ics', '/api/whatsapp/webhook']);

async function api(req, res, url) {
  const { pathname, searchParams } = url;
  const m = req.method;

  // A tela precisa saber onde fica o Supabase para montar o login.
  // A chave publicável é pública por design.
  if (pathname === '/api/config' && m === 'GET') {
    return send(res, 200, {
      supabaseUrl: SUPA_URL,
      supabaseAnonKey: SUPA_ANON,
      configurado: !!(SUPA_URL && SUPA_ANON && SUPA_SRV),
    });
  }

  if (!ROTAS_SEM_LOGIN.has(pathname) && !await usuarioLogado(req)) {
    return send(res, 401, { erro: 'Faça login para usar a Agenda.' });
  }

  const body = (m === 'POST' || m === 'PUT' || m === 'PATCH') ? await readBody(req) : {};

  // ---- empresa
  if (pathname === '/api/empresa' && m === 'GET')
    return ok(res, await dados.obterEmpresa());
  if (pathname === '/api/empresa' && m === 'PUT')
    return ok(res, await dados.salvarEmpresa(body));

  // ---- dashboard
  if (pathname === '/api/dashboard' && m === 'GET') {
    // Ao abrir o painel, puxa os agendamentos do CodeWords (no máx 1x/min).
    // Essencial no Render free, que "dorme" e não roda o timer de importação.
    if (Date.now() - _ultimaImportacao > 60000) {
      _ultimaImportacao = Date.now();
      try { await Promise.race([importarAgendamentosCW(), new Promise((r) => setTimeout(r, 8000))]); } catch {}
    }
    return ok(res, await dados.estatisticas());
  }

  // ---- agendamentos
  if (pathname === '/api/agendamentos' && m === 'GET') {
    return ok(res, await dados.listarAgendamentos({
      data: searchParams.get('data') || undefined,
      status: searchParams.get('status') || undefined,
      q: searchParams.get('q') || undefined,
    }));
  }

  if (pathname === '/api/agendamentos' && m === 'POST') {
    if (!body.cliente_nome || !body.servico || !body.data || !body.hora)
      return bad(res, 'Informe cliente, serviço, data e hora.');
    // dedupe: mesmo horário + mesmo telefone (ou mesmo nome) = mesmo agendamento
    const dup = await dados.agendamentoDuplicado(
      body.data, body.hora, soDigitos(body.telefone || ''), body.cliente_nome);
    if (dup) return ok(res, dup);
    // vincula/cria cliente pelo telefone
    let clienteId = body.cliente_id ?? null;
    if (!clienteId && body.telefone) {
      clienteId = await dados.obterOuCriarCliente({
        nome: body.cliente_nome, telefone: body.telefone,
        veiculo: body.veiculo ?? null, placa: body.placa ?? null,
        origem: body.origem ?? 'Google',
      });
    }
    const criado = await dados.criarAgendamento({ ...body, cliente_id: clienteId });
    await dispararWebhook('agendamento_criado', { agendamento: criado });
    return ok(res, criado);
  }

  let mm;
  if ((mm = pathname.match(new RegExp(`^/api/agendamentos/${UUID}$`)))) {
    const id = mm[1];
    if (m === 'GET') {
      const a = await dados.obterAgendamento(id);
      return a ? ok(res, a) : notFound(res);
    }
    if (m === 'PUT') {
      const a = await dados.obterAgendamento(id);
      if (!a) return notFound(res);
      // merge: o que não veio no corpo mantém o valor atual
      const atualizado = await dados.atualizarAgendamento(id, { ...a, ...body });
      return atualizado ? ok(res, atualizado) : notFound(res);
    }
    if (m === 'DELETE') {
      await dados.removerAgendamento(id);
      return ok(res, { ok: true });
    }
  }

  // mudança rápida de status (botões do card)
  if ((mm = pathname.match(new RegExp(`^/api/agendamentos/${UUID}/status$`))) && m === 'PATCH') {
    const id = mm[1];
    const map = {
      confirmado:      { status: 'confirmado', confirmado: true },
      compareceu:      { status: 'compareceu', compareceu: true },
      nao_veio:        { status: 'nao_veio', compareceu: false },
      em_atendimento:  { status: 'em_atendimento' },
      concluido:       { status: 'concluido', compareceu: true },
      nao_fechou:      { status: 'nao_fechou' },
      aguardando:      { status: 'aguardando' },
      cancelado:       { status: 'cancelado' },
    };
    const ch = map[body.status];
    if (!ch) return bad(res, 'Status inválido.');
    const a = await dados.obterAgendamento(id);
    if (!a) return notFound(res);
    const atualizado = await dados.atualizarAgendamento(id, {
      status: ch.status,
      confirmado: ch.confirmado !== undefined ? ch.confirmado : a.confirmado,
      compareceu: ch.compareceu !== undefined ? ch.compareceu : a.compareceu,
    });
    // "Não veio" → aciona a IA do WhatsApp (workflow de ausência) p/ ELA fazer o follow-up.
    // O app não envia mensagem nenhuma por conta própria.
    if (body.status === 'nao_veio' && atualizado?.telefone) {
      try {
        const r = await notificarAusencia(atualizado);
        await dados.registrarMensagem({
          agendamento_id: atualizado.id, telefone: atualizado.telefone, nome: atualizado.cliente_nome,
          corpo: `🤖 Follow-up de ausência delegado à IA do WhatsApp (${atualizado.cliente_nome} — ${atualizado.servico})`,
          direcao: 'saida',
          status: r?.ok ? 'delegado_ia' : 'falhou',
          erro: r?.ok ? null : (r?.erro || 'workflow indisponível'),
        });
      } catch (e) { console.error('Follow-up IA:', e?.message || e); }
    }
    await dispararWebhook('status_alterado', { agendamento: atualizado, novo_status: body.status });
    return ok(res, atualizado);
  }

  // ---- clientes
  if (pathname === '/api/clientes' && m === 'GET')
    return ok(res, await dados.listarClientes(searchParams.get('q') || undefined));
  if (pathname === '/api/clientes' && m === 'POST') {
    if (!body.nome) return bad(res, 'Informe o nome.');
    return ok(res, await dados.criarCliente(body));
  }
  if ((mm = pathname.match(new RegExp(`^/api/clientes/${UUID}$`)))) {
    const id = mm[1];
    if (m === 'PUT') {
      const c = await dados.atualizarCliente(id, body);
      return c ? ok(res, c) : notFound(res);
    }
    if (m === 'DELETE') { await dados.removerCliente(id); return ok(res, { ok: true }); }
  }

  // ---- consultores (equipe)
  if (pathname === '/api/consultores' && m === 'GET')
    return ok(res, await dados.listarConsultores());
  if (pathname === '/api/consultores' && m === 'POST') {
    if (!body.nome) return bad(res, 'Informe o nome.');
    return ok(res, await dados.criarConsultor(body));
  }
  if ((mm = pathname.match(new RegExp(`^/api/consultores/${UUID}$`)))) {
    const id = mm[1];
    if (m === 'PUT') {
      const c = await dados.atualizarConsultor(id, body);
      return c ? ok(res, c) : notFound(res);
    }
    if (m === 'DELETE') { await dados.removerConsultor(id); return ok(res, { ok: true }); }
  }

  // ---- serviços (Arsenal)
  if (pathname === '/api/servicos' && m === 'GET')
    return ok(res, await dados.listarServicos(!!searchParams.get('todos')));
  if (pathname === '/api/servicos' && m === 'POST') {
    if (!body.nome) return bad(res, 'Informe o nome do serviço.');
    return ok(res, await dados.criarServico(body));
  }
  if ((mm = pathname.match(new RegExp(`^/api/servicos/${UUID}$`)))) {
    const id = mm[1];
    if (m === 'PUT') {
      const s = await dados.atualizarServico(id, body);
      return s ? ok(res, s) : notFound(res);
    }
    if (m === 'DELETE') { await dados.removerServico(id); return ok(res, { ok: true }); }
  }

  // ---- CRM (métricas)
  if (pathname === '/api/crm' && m === 'GET')
    return ok(res, await dados.metricasCrm());

  // ---- follow-up: agendamentos que precisam de retorno (não vieram / não fechou)
  if (pathname === '/api/followup' && m === 'GET')
    return ok(res, await dados.listarFollowup());

  // ---- integrações (Google Agenda + webhook de saída)
  if (pathname === '/api/integracoes' && m === 'GET') {
    const c = await getIntegracoes();
    return ok(res, { ics_token: c.ics_token, webhook_url: c.webhook_url || '', webhook_ativo: !!c.webhook_ativo });
  }
  if (pathname === '/api/integracoes' && m === 'PUT') {
    await dados.salvarIntegracoes(body);
    return ok(res, { ok: true });
  }
  if (pathname === '/api/integracoes/testar-webhook' && m === 'POST') {
    const urlW = (body.webhook_url || (await getIntegracoes()).webhook_url || '').trim();
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
    // sem token nem consulta o banco
    if (!t) return send(res, 403, 'forbidden', { 'Content-Type': 'text/plain' });
    const cfg = await getIntegracoes(); // await obrigatório: sem ele a comparação viraria Promise
    if (!cfg.ics_token || t !== cfg.ics_token)
      return send(res, 403, 'forbidden', { 'Content-Type': 'text/plain' });
    return send(res, 200, await gerarICS(), { 'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="indycar-agendamentos.ics"' });
  }

  // ---- exportações CSV (abre no Excel)
  if (pathname === '/api/export/agendamentos.csv' && m === 'GET') {
    const lista = await dados.listarTodosAgendamentos('select=*,consultores(nome,cor)&order=data.desc,hora.asc');
    const rows = lista.map((a) => ({
      id: a.id, cliente: a.cliente_nome, telefone: a.telefone, veiculo: a.veiculo, placa: a.placa,
      servico: a.servico, data: a.data, hora: a.hora, status: a.status, origem: a.origem,
      consultor: a.consultor_nome, criado_em: a.created_at,
    }));
    return send(res, 200, gerarCSV(['id','cliente','telefone','veiculo','placa','servico','data','hora','status','origem','consultor','criado_em'], rows),
      { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="agendamentos.csv"' });
  }
  if (pathname === '/api/export/clientes.csv' && m === 'GET') {
    const lista = await dados.listarClientes();
    const rows = lista.map((c) => ({
      id: c.id, nome: c.nome, telefone: c.telefone, veiculo: c.veiculo,
      placa: c.placa, modelo: c.modelo, origem: c.origem, criado_em: c.created_at,
    }));
    return send(res, 200, gerarCSV(['id','nome','telefone','veiculo','placa','modelo','origem','criado_em'], rows),
      { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="clientes.csv"' });
  }

  // ---- histórico (todos, ordenado)
  if (pathname === '/api/historico' && m === 'GET')
    return ok(res, await dados.listarHistorico(200));

  // ================= WHATSAPP =================
  // configuração da integração (token de acesso vem mascarado por segurança)
  if (pathname === '/api/whatsapp/config' && m === 'GET') {
    const c = await getWaConfig();
    const tok = c.access_token || '';
    return ok(res, { ...c, access_token: undefined,
      tem_token: !!tok, token_mask: tok ? '••••••••' + tok.slice(-4) : '' });
  }
  if (pathname === '/api/whatsapp/config' && m === 'PUT') {
    const c = await getWaConfig();
    // só atualiza o token se um novo for digitado (campo vazio mantém o atual)
    const token = (body.access_token && body.access_token.trim()) ? body.access_token.trim() : c.access_token;
    const nc = await dados.salvarWaConfig({ ...body, access_token: token ?? null });
    const t = nc.access_token || '';
    return ok(res, { ...nc, access_token: undefined, tem_token: !!t,
      token_mask: t ? '••••••••' + t.slice(-4) : '' });
  }
  // testa a conexão com a Cloud API (aceita credenciais no corpo antes de salvar)
  if (pathname === '/api/whatsapp/testar' && m === 'POST') {
    const c = await getWaConfig();
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
    return ok(res, await dados.listarTemplates());
  if (pathname === '/api/whatsapp/templates' && m === 'POST') {
    if (!body.nome || !body.corpo) return bad(res, 'Informe o nome e o corpo do modelo.');
    return ok(res, await dados.criarTemplate(body));
  }
  if ((mm = pathname.match(new RegExp(`^/api/whatsapp/templates/${UUID}$`)))) {
    const id = mm[1];
    if (m === 'PUT') {
      const t = await dados.atualizarTemplate(id, body);
      return t ? ok(res, t) : notFound(res);
    }
    if (m === 'DELETE') { await dados.removerTemplate(id); return ok(res, { ok: true }); }
  }

  // histórico de mensagens
  if (pathname === '/api/whatsapp/mensagens' && m === 'GET') {
    const ag = searchParams.get('agendamento_id');
    return ok(res, await dados.listarMensagens(ag ? { agendamento_id: ag } : {}));
  }

  // prepara a mensagem (renderiza template para um agendamento) sem enviar
  if (pathname === '/api/whatsapp/preparar' && m === 'POST') {
    const tpl = await dados.obterTemplate(body.template_id);
    if (!tpl) return bad(res, 'Template não encontrado.');
    let ctx = { nome: body.nome ?? '', servico: '', data: '', hora: '', veiculo: '', placa: '' };
    if (body.agendamento_id) {
      const a = await dados.obterAgendamento(body.agendamento_id);
      if (a) ctx = { nome: a.cliente_nome, servico: a.servico, data: formatarDataBR(a.data),
                     hora: a.hora, veiculo: a.veiculo ?? '', placa: a.placa ?? '' };
    }
    return ok(res, { corpo: renderTemplate(tpl.corpo, ctx), telefone: body.telefone ?? '' });
  }

  // envia: registra a mensagem no banco e devolve o link wa.me (clique-para-conversar)
  if (pathname === '/api/whatsapp/enviar' && m === 'POST') {
    let { agendamento_id, telefone, nome, corpo, template_id } = body;
    if (template_id && !corpo) {
      const tpl = await dados.obterTemplate(template_id);
      if (tpl) {
        let ctx = { nome: nome ?? '', servico: '', data: '', hora: '', veiculo: '', placa: '' };
        if (agendamento_id) {
          const a = await dados.obterAgendamento(agendamento_id);
          if (a) { ctx = { nome: a.cliente_nome, servico: a.servico, data: formatarDataBR(a.data),
                           hora: a.hora, veiculo: a.veiculo ?? '', placa: a.placa ?? '' };
                   telefone = telefone ?? a.telefone; }
        }
        corpo = renderTemplate(tpl.corpo, ctx);
      }
    }
    if (!telefone || !corpo) return bad(res, 'Informe telefone e mensagem.');
    return ok(res, await despacharMensagem({
      agendamento_id: agendamento_id ?? null, telefone, nome: nome ?? null, corpo,
    }));
  }

  // ---- IA: configuração (chaves devolvidas mascaradas)
  if (pathname === '/api/whatsapp/ia/config' && m === 'GET') return ok(res, await iaConfigMascarada());
  if (pathname === '/api/whatsapp/ia/config' && m === 'PUT') {
    const c = await getIaConfig();
    // merge: só altera o que veio no corpo; o resto mantém o valor atual
    const pick = (k, def) => (body[k] !== undefined ? body[k] : (c[k] ?? def));
    const key = (body.api_key && body.api_key.trim()) ? body.api_key.trim() : c.api_key;
    const ckey = (body.cw_api_key && body.cw_api_key.trim()) ? body.cw_api_key.trim() : c.cw_api_key;
    await dados.salvarIaConfig({
      ativo: body.ativo !== undefined ? body.ativo : c.ativo,
      motor: pick('motor', 'anthropic'),
      api_key: key ?? null,
      modelo: pick('modelo', 'claude-opus-4-8'),
      persona: pick('persona', null),
      saudacao: pick('saudacao', null),
      cw_api_key: ckey ?? null,
      cw_service_id: pick('cw_service_id', null),
      cw_db_service_id: pick('cw_db_service_id', null),
      cw_noshow_service_id: pick('cw_noshow_service_id', null),
      cw_connect_service_id: pick('cw_connect_service_id', null),
      cw_device_id: pick('cw_device_id', null),
      cw_base_url: pick('cw_base_url', 'https://runtime.codewords.ai'),
    });
    return ok(res, await iaConfigMascarada());
  }
  // CodeWords: disparar um workflow qualquer. Usa a chave salva ou a do corpo.
  if (pathname === '/api/codewords/run' && m === 'POST') {
    const c = await getIaConfig();
    const api_key = (body.api_key && body.api_key.trim()) ? body.api_key.trim() : c.cw_api_key;
    const service_id = body.service_id || c.cw_service_id;
    if (!api_key || !service_id) return bad(res, 'Informe service_id e a chave do CodeWords (ou salve na config).');
    return ok(res, await chamarCodeWords({ base_url: body.base_url || c.cw_base_url, api_key, service_id,
      inputs: body.inputs ?? {}, background: !!body.in_background }));
  }
  // CodeWords: importar agendamentos pendentes do workflow "Banco de Agendamentos"
  if (pathname === '/api/codewords/importar' && m === 'POST')
    return ok(res, await importarAgendamentosCW());

  // WhatsApp via QR Code (CodeWords whatsapp_device_manager)
  if (pathname === '/api/whatsapp/conexao' && m === 'GET') {
    const cfg = await getIaConfig();
    if (!cfg.cw_api_key) return ok(res, { configurado: false, erro: 'Configure a chave do CodeWords (aba IA).' });
    const sid = cfg.cw_connect_service_id || 'whatsapp_device_manager';
    let devId = cfg.cw_device_id || '';
    const call = (path, inputs = {}) => chamarCodeWords({ base_url: cfg.cw_base_url, api_key: cfg.cw_api_key,
      service_id: sid, path, method: 'POST', inputs });
    const criarDevice = async () => {
      const sp = (cfg.cw_service_id || 'indycar_carlos_whatsapp_e3cd01d3').replace(/\/?$/, '/');
      const novo = await call('devices', { service_path: sp });
      const nid = novo.ok && (novo.data?.device_id || novo.data?.id);
      if (nid) { devId = nid; await dados.salvarCampoIa('cw_device_id', nid); }
      return !!nid;
    };

    if (devId && searchParams.get('acao') === 'reconnect') await call(`devices/${devId}/reconnect`, {});

    const carlosPath = (cfg.cw_service_id || 'indycar_carlos_whatsapp_e3cd01d3').replace(/\/?$/, '/');
    const ehConectado = (s) => /^(logged_?in|authenticated|paired)$/i.test(String(s || '').trim());

    // Lista os devices e PRIORIZA um já conectado (logged_in) do nosso atendente.
    const lst = await call('devices/list', {});
    const devices = (lst.ok && lst.data && lst.data.devices) || [];
    const meus = devices.filter(d => (d.service_path || '') === carlosPath);
    const logado = meus.find(d => ehConectado(d.gowa_status?.results?.state));
    if (logado) {
      if (devId !== logado.device_id) await dados.salvarCampoIa('cw_device_id', logado.device_id);
      return ok(res, { configurado: true, ok: true, conectado: true, status: 'logged_in',
        device_id: logado.device_id, numero: (logado.gowa_status?.results?.jid || '').split('@')[0] || null });
    }

    // Não conectado: reaproveita um device existente do serviço (evita criar duplicados).
    if (!meus.find(d => d.device_id === devId)) devId = meus[0]?.device_id || '';
    if (searchParams.get('only') === 'status')
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
    const cfg = await getIaConfig();
    if (!cfg.cw_api_key) return bad(res, 'Configure a chave do CodeWords.');
    const sid = cfg.cw_connect_service_id || 'whatsapp_device_manager';
    const service_path = body.service_path || (cfg.cw_service_id ? cfg.cw_service_id.replace(/\/?$/, '/') : 'indycar_carlos_whatsapp_e3cd01d3/');
    const r = await chamarCodeWords({ base_url: cfg.cw_base_url, api_key: cfg.cw_api_key,
      service_id: sid, path: 'devices', method: 'POST', inputs: { service_path } });
    if (!r.ok) return ok(res, { ok: false, erro: r.erro });
    const deviceId = r.data?.device_id || r.data?.id;
    if (deviceId) await dados.salvarCampoIa('cw_device_id', deviceId);
    return ok(res, { ok: true, device_id: deviceId, raw: r.data });
  }

  // marca status de uma mensagem (entregue/lido)
  if ((mm = pathname.match(new RegExp(`^/api/whatsapp/mensagens/${UUID}$`))) && m === 'PATCH') {
    await dados.atualizarStatusMensagem(mm[1], body.status);
    return ok(res, { ok: true });
  }

  // WEBHOOK — verificação (GET) do WhatsApp Cloud API (Meta)
  if (pathname === '/api/whatsapp/webhook' && m === 'GET') {
    const cfg = await getWaConfig();
    const esperado = cfg.verify_token || WHATSAPP_VERIFY_TOKEN;
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
        // await obrigatório: sem ele o webhook responderia 200 antes de gravar
        await registrarEntrada(msg.from, nome, texto);
        // (sem auto-resposta: quem atende é a IA já cadastrada no WhatsApp)
      }
      // recibos de entrega/leitura atualizam a mensagem de saída pelo wamid
      const st = entry?.statuses?.[0];
      if (st?.id) {
        const map = { sent:'enviado', delivered:'entregue', read:'lido', failed:'falhou' };
        await dados.atualizarStatusPorWamid(st.id, map[st.status] || st.status);
      }
    } catch (e) {
      // o webhook da Meta precisa receber 200 mesmo se a gravação falhar,
      // mas o erro não pode sumir em silêncio
      console.error('Webhook WhatsApp:', e?.message || e);
    }
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
  // anti path-traversal: compara COM o separador, senão uma pasta irmã
  // chamada "publicX" passaria no teste (e o %2e%2e escapa do new URL)
  if (filePath !== PUBLIC && !filePath.startsWith(PUBLIC + sep)) return notFound(res);
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
    // a tela só lê 'erro'; sem isso as mensagens claras em português
    // (ex.: "preencha SUPABASE_SERVICE_ROLE_KEY no .env") nunca apareceriam
    send(res, 500, { erro: String(e?.message || 'Erro interno') });
  }
});

// ---------------------------------------------------------------------------
// Lembretes automáticos (agendador)
// ---------------------------------------------------------------------------
async function verificarLembretes() {
  const cfg = await getWaConfig(); // await obrigatório: sem ele cfg seria uma Promise
  if (!cfg.lembrete_ativo) return;
  // envia pelo número conectado (GOWA); se não houver, tenta a Cloud API da Meta
  const temCloud = !!(cfg.ativo && cfg.phone_number_id && cfg.access_token);

  const horas = Number(cfg.lembrete_horas) || 24;
  const lista = await dados.agendamentosParaLembrete(horas);
  if (!lista.length) return;

  const [tpl, emp] = await Promise.all([
    dados.templatePorGatilho('lembrete'),
    dados.obterEmpresa(),
  ]);
  for (const a of lista) {
    const ctx = { nome: a.cliente_nome, servico: a.servico, data: formatarDataBR(a.data),
                  hora: a.hora, veiculo: a.veiculo || '', placa: a.placa || '' };
    const corpo = tpl ? renderTemplate(tpl.corpo, ctx)
      : `Oi ${a.cliente_nome}! Lembrete do seu agendamento em ${formatarDataBR(a.data)} às ${a.hora} para ${a.servico} na ${emp.nome}. Te esperamos! 🏁`;
    try {
      // 1º tenta o número conectado (GOWA); se falhar e houver Cloud API, usa a Meta
      let r = await enviarViaGowa(a.telefone, corpo);
      if (r.ok) {
        await dados.registrarMensagem({ agendamento_id: a.id, telefone: a.telefone,
          nome: a.cliente_nome, corpo, direcao: 'saida', status: 'enviado' });
      } else if (temCloud) {
        await despacharMensagem({ agendamento_id: a.id, telefone: a.telefone, nome: a.cliente_nome, corpo });
        r = { ok: true };
      }
      if (!r.ok) continue; // sem canal disponível agora — tenta no próximo ciclo
      await dados.marcarLembreteEnviado(a.id);
      console.log(`Lembrete enviado: agendamento ${a.id} (${a.cliente_nome})`);
    } catch (e) { console.error('Lembrete:', e?.message || e); }
  }
}

// Os agendadores registram o erro em vez de engoli-lo — sem isso, uma falha do
// Supabase (400/401/enum) desapareceria e o diagnóstico ficaria impossível.
const aviso = (onde) => (e) => console.error(`${onde}:`, e?.message || e);

setInterval(() => verificarLembretes().catch(aviso('Lembretes')), 5 * 60 * 1000); // a cada 5 min
setTimeout(() => verificarLembretes().catch(aviso('Lembretes')), 10 * 1000);      // 10s após iniciar

// Importa agendamentos do CodeWords — roda 24/7.
//
// ATENÇÃO À COTA: cada execução consome 1 run do plano do CodeWords.
// Consumo por mês = (60 / IMPORT_INTERVALO_MIN) × 24 × 30:
//    3 min → 14.400/mês   (era isto que esgotava a cota de 2.500 em ~5 dias)
//   10 min →  4.320/mês
//   15 min →  2.880/mês   ← padrão
//   30 min →  1.440/mês
// Ajuste por IMPORT_INTERVALO_MIN conforme o plano contratado.
//
// Isto NÃO é o Carlos. Ele conversa no WhatsApp pelo CodeWords, sem passar
// por aqui, e não para. Isto é só a busca por agendamentos que ele registrou.
const IMPORT_MIN = Math.max(1, Number(process.env.IMPORT_INTERVALO_MIN) || 15);

setInterval(() => importarAgendamentosCW().catch(aviso('Importação CodeWords')), IMPORT_MIN * 60 * 1000);
setTimeout(() => importarAgendamentosCW().catch(aviso('Importação CodeWords')), 12 * 1000);

// Espelho local → cloud: o servidor local reenvia seus agendamentos pro site online.
// ATENÇÃO: com local e cloud apontando para o MESMO Supabase o espelho é redundante.
// Defina MIRROR_DISABLED=1 na virada para não gerar tráfego/duplicação inútil.
const MIRROR_URL = process.env.MIRROR_URL || 'https://indycar-agendamentos.onrender.com';
async function espelharParaCloud() {
  if (process.env.RENDER || process.env.MIRROR_DISABLED === '1') return; // só o local espelha
  try {
    const ags = await dados.listarTodosAgendamentos('select=*');
    let enviados = 0;
    for (const a of ags) {
      const r = await fetch(MIRROR_URL + '/api/agendamentos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // hora/origem/confirmado já vão no formato que a outra ponta espera (HH:MM, rótulo, 0/1)
        body: JSON.stringify({ cliente_nome: a.cliente_nome, telefone: a.telefone, veiculo: a.veiculo,
          placa: a.placa, servico: a.servico, data: a.data, hora: a.hora, origem: a.origem,
          status: a.status, confirmado: a.confirmado, observacoes: a.observacoes }),
      }).catch(() => null);
      if (r && r.ok) enviados++;
    }
    if (enviados) console.log(`Espelho → cloud: ${enviados} agendamento(s) verificados/enviados`);
  } catch (e) { console.error('Espelho:', e?.message || e); }
}
setInterval(() => espelharParaCloud().catch(aviso('Espelho')), 10 * 60 * 1000);
setTimeout(() => espelharParaCloud().catch(aviso('Espelho')), 20 * 1000);

// ---------------------------------------------------------------------------
// Subida
// ---------------------------------------------------------------------------
async function iniciar() {
  conferirConfiguracao(); // avisa (sem derrubar) se faltar SUPABASE_URL/KEY

  // Preenche a config de IA a partir do ambiente e garante o token do feed ICS.
  // NÃO há mais seed de empresa/consultores/serviços/clientes: o banco é
  // COMPARTILHADO com o CRM e o Atendimento e já tem os dados reais.
  try {
    const aplicados = await dados.aplicarConfigDoAmbiente();
    if (aplicados.length) console.log('Config de IA preenchida pelo ambiente:', aplicados.join(', '));
    await dados.garantirIcsToken();
  } catch (e) {
    console.error('Aviso na inicialização (o servidor segue no ar):', e?.message || e);
  }

  server.listen(PORT, () => {
    console.log(`\n  🏁 IndyCar Agendamentos rodando em http://localhost:${PORT}`);
    console.log('  Banco: Supabase (PostgREST)\n');
  });
}

iniciar();
