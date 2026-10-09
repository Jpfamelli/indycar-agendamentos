// IndyCar Agendamentos — servidor HTTP (somente módulos nativos do Node)
// Persistência: Supabase (PostgREST) via dados.js / supabase.js — não há mais SQLite.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize, sep } from 'node:path';
import * as dados from './dados.js';
import { selecionarUm } from './supabase.js';
import { conferirConfiguracao } from './supabase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
let _ultimaImportacao = 0; // controle p/ importar ao abrir o painel (no máx 1x/min)

// Token de verificação do webhook do WhatsApp Cloud API (configurável por env)
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'indycar';

/* O WhatsApp DA EMPRESA — (12) 99683-0272, o número do site e do cartão.
   É por ele que sai aviso de falta e lembrete. Tem que ser o mesmo que o
   painel de atendimento usa; se divergir, o cliente recebe o lembrete de um
   número e responde para outro. */
const NUMERO_DA_EMPRESA = process.env.WHATSAPP_NUMERO || '5512996830272';

// Os ids agora são uuid: as rotas de item não podem mais casar apenas dígitos.
const UUID = '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})';

/* Marca da versão no ar — aparece em /api/versao e no app.js (VERSAO_APP).
   Serve para conferir, depois do deploy, que o Render subiu ESTE código. */
const VERSAO = '2026-10-09-r2';

/* Cache curtinho na memória do servidor para as leituras mais pesadas (painel,
   serviços). Qualquer gravação (POST/PUT/PATCH/DELETE) ou importação do
   CodeWords troca a "geração" e invalida tudo na hora: ninguém vê número velho
   depois de marcar um desfecho. */
let _geracao = 0;
const _memo = new Map();   // chave -> { geracao, ate, valor }
async function lembrar(chave, ms, fn) {
  const m = _memo.get(chave);
  if (m && m.geracao === _geracao && m.ate > Date.now()) return m.valor;
  const valor = await fn();
  if (_memo.size > 50) _memo.clear();
  _memo.set(chave, { geracao: _geracao, ate: Date.now() + ms, valor });
  return valor;
}
const invalidarCache = () => { _geracao++; };

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

/* Erro com status HTTP: o catch geral do servidor devolve `{erro}` com esse
   código em vez de um 500 genérico. Toda resposta de erro da API tem o mesmo
   formato — a tela só lê `erro`. */
class ErroHttp extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

/* Corpo de requisição: no máximo 64 KB (um agendamento tem uns 600 bytes; o
   webhook da Meta, uns 2 KB). Acima disso a conexão é cortada com 413 em vez
   de deixar alguém encher a memória do servidor. JSON quebrado vira 400 claro —
   antes virava `{}` em silêncio e o erro aparecia só lá na frente, como
   "Informe cliente, serviço, data e hora". */
const LIMITE_CORPO = 64 * 1024;
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '', tamanho = 0, estourou = false;
    req.on('data', (c) => {
      if (estourou) return;
      tamanho += c.length;
      if (tamanho > LIMITE_CORPO) {
        estourou = true;
        req.resume();                      // descarta o resto sem travar o socket
        reject(new ErroHttp(413, 'Corpo da requisição grande demais (limite de 64 KB).'));
        return;
      }
      raw += c;
    });
    req.on('error', (e) => reject(new ErroHttp(400, 'Não consegui ler a requisição: ' + (e?.message || e))));
    req.on('end', () => {
      if (estourou) return;
      if (!raw.trim()) return resolve({});
      try {
        const j = JSON.parse(raw);
        // array ou valor solto no lugar do objeto quebraria o `body.campo` lá na frente
        resolve(j && typeof j === 'object' && !Array.isArray(j) ? j : {});
      } catch { reject(new ErroHttp(400, 'Corpo inválido: envie JSON.')); }
    });
  });
}

/* Telefone digitado na tela: ou vazio, ou DDD + número (10/11 dígitos; 12/13
   com o 55 na frente). Só vale para o que vem do formulário — a importação do
   CodeWords e os registros antigos não passam por aqui. */
function telefoneParecValido(t) {
  const d = soDigitos(t);
  if (!d) return true;
  return d.length >= 10 && d.length <= 13;
}
const ERRO_TELEFONE = 'Telefone incompleto: use DDD + número, ex.: (12) 99999-9999.';

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
/* O que dizer quando o CodeWords recusa. 401/403 é SEMPRE a chave: desde 01/10
   ela está recusada e nenhum WhatsApp automático sai — a mensagem tem de dizer
   isso e onde se resolve, em vez de um "HTTP 401" que ninguém entende. */
const ERRO_CHAVE_CODEWORDS = 'A chave do CodeWords foi recusada (401). Nenhum WhatsApp automático sai até '
  + 'trocá-la: peça ao gestor para trocar em Atendimento › Integrações.';
function erroCodeWords(status, detalhe) {
  if (status === 401 || status === 403) return ERRO_CHAVE_CODEWORDS;
  if (status === 404) return 'O CodeWords não achou esse fluxo/conexão (404). Confira o Service ID e se o número está pareado no Atendimento.';
  if (status === 429) return 'O CodeWords está limitando as chamadas (429). Tente de novo em alguns minutos.';
  if (status >= 500) return `O CodeWords está com problema do lado dele (HTTP ${status}). Tente de novo mais tarde.`;
  return detalhe || `O CodeWords respondeu HTTP ${status}.`;
}

// Contrato REST (do codewords-client): POST {base}/run/{service_id}/ com Authorization: <chave>
// e os inputs como JSON; a resposta é a própria saída do workflow.
async function chamarCodeWords({ base_url, api_key, service_id, path = '', method = 'POST', inputs, background = false }) {
  const base = (base_url || 'https://runtime.codewords.ai').replace(/\/+$/, '');
  const seg = (path || '').replace(/^\/+/, '');
  const url = `${base}/${background ? 'run_async' : 'run'}/${encodeURIComponent(service_id)}/${seg}`;
  try {
    const opt = { method, headers: { Authorization: api_key, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000) };
    if (method !== 'GET') opt.body = JSON.stringify(inputs ?? {});
    const r = await fetch(url, opt);
    const txt = await r.text();
    let data; try { data = JSON.parse(txt); } catch { data = txt; }
    if (!r.ok) {
      const detalhe = (data && (data.error || data.detail || data.message)) || (typeof data === 'string' && data.slice(0, 200)) || '';
      return { ok: false, status: r.status, erro: erroCodeWords(r.status, detalhe) };
    }
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
  let importados = 0, ignorados = 0, falhados = 0;
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
      // repetido = tratado: conta como ignorado para o ciclo fechar e marcar
      if (jaExiste) { ignorados++; continue; }

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
         da agenda e a oficina perde a pessoa. Então importa e AVISA.
         hoje() é no fuso da oficina: com toISOString (UTC), das 21h em diante
         um agendamento DE HOJE era acusado de "já passou" sem ter passado. */
      const suspeita = data < hoje();
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
      /* erro (banco fora do ar, etc.) NÃO é "ignorado de vez": conta à parte,
         para o ciclo não ser dado como completo e o item não ser marcado */
      falhados++;
      console.error('Importação CodeWords (item falhou):', e?.message || e);
    }
  }
  /* Marca como importado DEPOIS de um ciclo completo. Sem marcar, o /listar
     devolvia os mesmos itens para sempre e agendamento APAGADO na agenda
     ressuscitava a cada importação — foi medido: o dono apagava um teste e ele
     voltava sozinho. Só marca quando todo item foi tratado (importado ou
     ignorado de vez), para não perder item em ciclo que estourou no meio.
     (Defina MARK_IMPORTED=0 p/ voltar ao comportamento antigo.) */
  if (itens.length && importados + ignorados === itens.length
      && process.env.MARK_IMPORTED !== '0') {
    await chamarCodeWords({ base_url: cfg.cw_base_url, api_key: cfg.cw_api_key,
      service_id: cfg.cw_db_service_id, path: 'marcar_importados', method: 'POST', inputs: {} })
      .catch((e) => console.error('marcar_importados:', e?.message || e));
  }
  return { ok: true, importados, ignorados, encontrados: itens.length };
}

/* Aviso de ausência ("sentimos sua falta") — enviado DIRETO pelo WhatsApp da
   empresa, na hora do clique.

   Já foi delegado a um workflow do CodeWords, e depois a um fluxo /no-show do
   Carlos. Os dois morreram na migração /devices → /connections: TODA tentativa
   desde 11/08 falhou com 404 e nenhum cliente recebeu nada — o painel dizia
   "delegado à IA" e a mensagem não existia. Mandar direto pelo proxy do número
   conectado (o mesmo caminho do Pós-venda, testado de verdade) não depende de
   fluxo de terceiro. O cliente responde e cai no Carlos normalmente. */
async function enviarAvisoDeAusencia(ag) {
  if (!dados.soDigitos(ag?.telefone)) return { ok: false, erro: 'agendamento sem telefone' };
  const tpl = await dados.templatePorGatilho('followup').catch(() => null);
  const corpo = tpl
    ? renderTemplate(tpl.corpo, {
        nome: ag.cliente_nome, servico: ag.servico, data: formatarDataBR(ag.data),
        hora: String(ag.hora || '').slice(0, 5), veiculo: ag.veiculo ?? '', placa: ag.placa ?? '',
      })
    : `Olá ${ag.cliente_nome}, sentimos sua falta hoje na IndyCar! 🙁 Seu horário de `
    + `${ag.servico} era às ${String(ag.hora || '').slice(0, 5)}. Quer remarcar? `
    + 'É só responder por aqui. 🏁';
  // sem veículo/placa o modelo deixa espaço duplo ("Seu  ainda…") — comprime
  const corpoLimpo = corpo.replace(/ {2,}/g, ' ').replace(/ \(\)/g, '');
  const r = await enviarViaGowa(ag.telefone, corpoLimpo);
  // registra a MENSAGEM DE VERDADE (não um recado técnico): é o que o painel mostra
  await dados.registrarMensagem({
    agendamento_id: ag.id, telefone: ag.telefone, nome: ag.cliente_nome,
    corpo: corpoLimpo, direcao: 'saida', status: r.ok ? 'enviado' : 'falhou',
    erro: r.ok ? null : (r.erro || 'envio falhou'),
  }).catch((e) => console.error('Registro do aviso de ausência:', e?.message || e));
  return { ok: r.ok, erro: r.ok ? null : (r.erro || 'envio falhou') };
}

/* Qual aparelho de WhatsApp é o da empresa.
   Fonte única: a tabela `codewords_config`, a mesma que o painel de
   atendimento usa e mantém atualizada quando alguém repareia. A agenda já
   teve cópia própria disso em `agenda_ia_config` e o resultado foi ficar com
   um aparelho velho — aviso de falta saindo por uma linha e a conversa por
   outra, ou não saindo. A cópia local virou só reserva. */
async function aparelhoDaEmpresa(cfg) {
  try {
    const central = await selecionarUm('codewords_config', 'select=device_id&limit=1');
    if (central?.device_id) return central.device_id;
  } catch { /* sem acesso à tabela: cai para a config local */ }
  return cfg.cw_device_id || null;
}

// Envia uma mensagem pelo WhatsApp CONECTADO (proxy GOWA, form-data)
async function enviarViaGowa(telefone, mensagem) {
  const cfg = await getIaConfig();
  if (!cfg.cw_api_key) return { ok: false, erro: 'CodeWords não configurado' };
  const sid = cfg.cw_connect_service_id || 'whatsapp_device_manager';
  /* Antes isto listava /devices para descobrir o aparelho. O CodeWords
     aposentou esse endpoint (410) e a listagem passou a voltar vazia — o
     aviso de falta parou de sair sem ninguém perceber. */
  const deviceId = await aparelhoDaEmpresa(cfg);
  if (!deviceId) {
    return { ok: false,
      erro: 'Nenhum WhatsApp conectado. Reconecte em Atendimento › Configurações › Conexão do WhatsApp.' };
  }
  const base = (cfg.cw_base_url || 'https://runtime.codewords.ai').replace(/\/+$/, '');
  /* `phone_id`, não `device_id`: o CodeWords renomeou o parâmetro quando
     trocou /devices por /connections. Com o nome antigo dá 404
     "No connection found" mesmo com o número conectado. */
  const url = `${base}/run/${sid}/proxy/send/message?phone_id=${encodeURIComponent(deviceId)}`;
  const body = new URLSearchParams({ phone: telefoneInternacional(telefone), message: mensagem }).toString();
  try {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: cfg.cw_api_key, 'Content-Type': 'application/x-www-form-urlencoded' }, body,
      signal: AbortSignal.timeout(30000) });
    const data = await r.json().catch(() => ({}));
    // HTTP 200 não é entrega: o GOWA responde 200 com {code:'ERROR'} — confere o conteúdo
    if (r.ok && /success/i.test(JSON.stringify(data))) return { ok: true, data };
    if (!r.ok) return { ok: false, status: r.status, erro: erroCodeWords(r.status, data?.message || data?.detail) };
    return { ok: false, erro: 'O WhatsApp não confirmou o envio: ' + (data?.message || data?.detail || data?.code || 'resposta sem sucesso') };
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
   Cada uma tem o próprio segredo (token do ICS, verify_token do webhook).
   /api/primeiro-acesso entra aqui porque, por definição, ainda não existe
   ninguém para fazer login — ela mesma se fecha assim que houver um perfil. */
const ROTAS_SEM_LOGIN = new Set([
  '/api/config', '/api/agenda.ics', '/api/whatsapp/webhook', '/api/primeiro-acesso', '/api/versao',
]);

/* Freio por chave (IP ou usuário): um token válido — ou um script distraído —
   não pode criar conta em rajada nem martelar a tela de primeiro acesso. */
const USO = new Map();   // chave -> { qtd, zeraEm }

function dentroDoLimite(chave, teto, janelaMs) {
  const agora = Date.now();
  const atual = USO.get(chave);
  if (!atual || atual.zeraEm <= agora) {
    if (USO.size > 500) USO.clear();
    USO.set(chave, { qtd: 1, zeraEm: agora + janelaMs });
    return true;
  }
  if (atual.qtd >= teto) return false;
  atual.qtd++;
  return true;
}

/** Texto vindo de fora: só string ou número, cortado no limite.
    Objeto e array viram vazio — sem isto um `{}` no lugar do e-mail viraria
    a string "[object Object]" e seria gravada como se fosse um nome. */
function texto1(v, max) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return '';
  return String(v).slice(0, max);
}

const EMAIL_PARECE_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* O Supabase recusa em inglês ("A user with this email address has already
   been registered"). Aqui isso vira um recado que diz o que fazer a seguir —
   e e-mail repetido vira 409, que a tela trata diferente de erro genérico. */
function recusaDeCadastro(e) {
  const msg = String(e?.message || e);
  if (/already been registered|already exists|email_exists/i.test(msg)) {
    return { status: 409,
      erro: 'Já existe alguém cadastrado com esse e-mail. Se a pessoa perdeu o acesso, '
          + 'devolva pela lista da equipe em vez de cadastrar de novo.' };
  }
  return { status: 400, erro: msg };
}

async function api(req, res, url) {
  const { pathname, searchParams } = url;
  const m = req.method;

  // A tela precisa saber onde fica o Supabase para montar o login.
  // A chave publicável é pública por design.
  // Só a marca da versão (nada de dado): para conferir o deploy sem login.
  if (pathname === '/api/versao' && m === 'GET')
    return send(res, 200, { versao: VERSAO }, { 'Cache-Control': 'no-store' });

  if (pathname === '/api/config' && m === 'GET') {
    // Só vem do ambiente: 30 s de cache no navegador evita bater aqui a cada abertura de aba.
    return send(res, 200, {
      supabaseUrl: SUPA_URL,
      supabaseAnonKey: SUPA_ANON,
      configurado: !!(SUPA_URL && SUPA_ANON && SUPA_SRV),
    }, { 'Cache-Control': 'public, max-age=30' });
  }

  /* ---- primeiro acesso ----
     Enquanto NÃO existir ninguém cadastrado, esta rota deixa criar a conta do
     dono, já como administrador. Assim que houver um perfil ela se fecha e
     passa a responder 403 — daí em diante quem cadastra é o administrador, em
     Configurações › Equipe.

     Não usa o cadastro público do Supabase de propósito: ele exige confirmação
     por e-mail e recusa domínio que não seja de e-mail de verdade — o
     @indycartaubate.com voltava com "Email address is invalid". */
  if (pathname === '/api/primeiro-acesso' && m === 'GET') {
    return ok(res, { aberto: (await dados.contarPerfis()) === 0 });
  }

  if (pathname === '/api/primeiro-acesso' && m === 'POST') {
    // Ninguém está logado para chegar aqui, então o freio possível é o IP.
    const ip = req.socket?.remoteAddress || 'desconhecido';
    if (!dentroDoLimite(`primeiro:${ip}`, 5, 600_000)) {
      return send(res, 429, { erro: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' });
    }
    if ((await dados.contarPerfis()) > 0) {
      return send(res, 403, {
        erro: 'O sistema já tem gente cadastrada. Peça ao administrador para criar o seu acesso.' });
    }

    const bruto = await readBody(req);
    const nome  = texto1(bruto.nome, 80).trim();
    const email = texto1(bruto.email, 160).trim().toLowerCase();
    const senha = texto1(bruto.senha, 200);
    if (!nome) return bad(res, 'Informe o seu nome.');
    if (!EMAIL_PARECE_VALIDO.test(email)) return bad(res, 'Esse e-mail não parece válido. Confira e tente de novo.');
    if (senha.length < 8) return bad(res, 'A senha precisa ter pelo menos 8 caracteres.');

    /* papel 'admin' explícito: o gatilho do banco já marca o primeiro assim,
       mas dois cadastros ao mesmo tempo poderiam deixar o dono como atendente
       dentro do próprio sistema. */
    try {
      const criado = await dados.criarMembro({ nome, email, senha, papel: 'admin' });
      return send(res, 201, { ok: true, email, aviso: criado.aviso });
    } catch (e) {
      const r = recusaDeCadastro(e);
      return send(res, r.status, { erro: r.erro });
    }
  }

  // Guardamos QUEM está logado: a aba Configurações precisa do id do perfil,
  // e ele tem de vir do token conferido aqui — nunca do corpo da requisição.
  let usuario = null;
  if (!ROTAS_SEM_LOGIN.has(pathname)) {
    usuario = await usuarioLogado(req);
    if (!usuario) return send(res, 401, { erro: 'Faça login para usar a Agenda.' });
  }
  // Quem manda na equipe. Conferido AQUI: esconder o botão na tela não protege nada.
  const ehAdmin = usuario?.papel === 'admin';

  /* Papel 'agenda' (ex.: Franklin): entra SÓ para marcar presença. Vê a agenda
     de hoje e aperta Compareceu / Não veio — e mais nada. Sem métricas, sem
     clientes, sem WhatsApp, sem histórico. A lista do que ele PODE é esta: */
  const soPresenca = usuario?.papel === 'agenda';
  if (soPresenca) {
    const liberado =
         (pathname === '/api/perfil' && m === 'GET')
      || (pathname === '/api/empresa' && m === 'GET')
      || (pathname === '/api/saude' && m === 'GET')     // a faixa de saúde vale para todo mundo
      || (pathname === '/api/agendamentos' && m === 'GET')
      || (m === 'PATCH' && new RegExp(`^/api/agendamentos/${UUID}/status$`).test(pathname));
    if (!liberado) {
      return send(res, 403, { erro: 'Seu acesso é só para marcar presença na agenda de hoje.' });
    }
  }

  const body = (m === 'POST' || m === 'PUT' || m === 'PATCH') ? await readBody(req) : {};
  if (m !== 'GET' && m !== 'HEAD') invalidarCache();

  /* ---- saúde do sistema (faixa no topo da tela) ----
     Lê a linha única de vigia_estado, que o vigia mantém. Hoje: problema
     'codewords-fora' desde 01/10 — chave do CodeWords recusada, nenhum WhatsApp
     automático sai. Sem problema: {ok:true, problema:null}. */
  if (pathname === '/api/saude' && m === 'GET')
    return send(res, 200, await dados.obterSaude(), { 'Cache-Control': 'no-store' });

  // ---- empresa
  if (pathname === '/api/empresa' && m === 'GET')
    return ok(res, await dados.obterEmpresa());
  if (pathname === '/api/empresa' && m === 'PUT') {
    if (!String(body.nome ?? '').trim()) return bad(res, 'Informe o nome da oficina.');
    return ok(res, await dados.salvarEmpresa(body));
  }

  // ---- perfil de quem está logado (aba Configurações → Minha conta)
  if (pathname === '/api/perfil' && m === 'GET')
    return ok(res, await dados.obterPerfil(usuario.id, usuario.email));
  if (pathname === '/api/perfil' && m === 'PUT') {
    const nome = String(body.nome ?? '').trim();
    if (!nome) return bad(res, 'Informe o seu nome.');
    // sempre usuario.id: ninguém renomeia o perfil de outra pessoa por aqui
    return ok(res, await dados.atualizarPerfilNome(usuario.id, nome, usuario.email));
  }

  /* ---- equipe: quem tem acesso ao sistema (Configurações › Equipe) ----
     É o mesmo login da Agenda, do CRM e do Atendimento: cadastrar, rebaixar ou
     cortar alguém aqui vale nos três. Por isso tudo abaixo exige papel admin
     conferido no servidor, e nada aceita o id de quem chama vindo do corpo. */
  if (pathname === '/api/equipe' && m === 'GET') {
    // quem não é administrador enxerga apenas o próprio cadastro
    const equipe = await dados.listarEquipe(ehAdmin ? null : usuario.id);
    return ok(res, { equipe, souAdmin: ehAdmin, meuId: usuario.id });
  }

  if (pathname === '/api/equipe' && m === 'POST') {
    if (!ehAdmin) return send(res, 403, { erro: 'Só o administrador cadastra a equipe.' });
    if (!dentroDoLimite(`equipe:${usuario.id}`, 10, 60_000)) {
      return send(res, 429, { erro: 'Muitos cadastros seguidos. Espere um minuto e continue.' });
    }
    const nome  = texto1(body.nome, 80).trim();
    const email = texto1(body.email, 160).trim().toLowerCase();
    const senha = texto1(body.senha, 200);
    // 'agenda' = só marca presença na Agenda (não entra nos outros sistemas)
    const papel = ['admin', 'agenda'].includes(body.papel) ? body.papel : 'atendente';
    if (!nome) return bad(res, 'Informe o nome da pessoa.');
    if (!EMAIL_PARECE_VALIDO.test(email)) return bad(res, 'Esse e-mail não parece válido. Confira e tente de novo.');
    if (senha.length < 8) return bad(res, 'A senha precisa ter pelo menos 8 caracteres.');

    try {
      return send(res, 201, { ok: true, ...(await dados.criarMembro({ nome, email, senha, papel })) });
    } catch (e) {
      const r = recusaDeCadastro(e);
      return send(res, r.status, { erro: r.erro });
    }
  }

  if (pathname === '/api/equipe/papel' && m === 'POST') {
    if (!ehAdmin) return send(res, 403, { erro: 'Só o administrador muda a função da equipe.' });
    const id = texto1(body.id, 60);
    const papel = ['admin', 'agenda'].includes(body.papel) ? body.papel : 'atendente';
    if (!dados.ehUuid(id)) return bad(res, 'Informe de quem você quer mudar a função.');

    const alvo = await dados.resumoDoPerfil(id);
    if (!alvo) return send(res, 404, { erro: 'Não encontrei essa pessoa na equipe. Atualize a página.' });

    /* Rebaixar o último administrador tranca todo mundo para fora: ninguém
       mais cadastra ninguém, e a tela de primeiro acesso não reabre porque ela
       só aparece quando NÃO existe nenhum perfil. */
    if (papel !== 'admin' && alvo.papel === 'admin' && alvo.ativo
        && (await dados.contarAdminsAtivos()) <= 1) {
      return send(res, 409, {
        erro: 'Este é o único administrador. Promova outra pessoa antes de rebaixar esta.' });
    }

    await dados.definirPapel(id, papel);
    return ok(res, { ok: true, papel });
  }

  if (pathname === '/api/equipe/ativo' && m === 'POST') {
    if (!ehAdmin) return send(res, 403, { erro: 'Só o administrador tira ou devolve acesso.' });
    const id = texto1(body.id, 60);
    const ativo = body.ativo === true;
    if (!dados.ehUuid(id)) return bad(res, 'Informe de quem você quer mudar o acesso.');
    if (!ativo && id === usuario.id) {
      return bad(res, 'Você não pode desligar o próprio acesso. Peça a outro administrador.');
    }

    if (!ativo) {
      const alvo = await dados.resumoDoPerfil(id);
      if (!alvo) return send(res, 404, { erro: 'Não encontrei essa pessoa na equipe. Atualize a página.' });
      /* Mesma armadilha da troca de função, e a regra de "não desligar a si
         mesmo" acima não cobre: dois administradores podem se desligar um ao
         outro em sequência e sobrar ninguém. */
      if (alvo.papel === 'admin' && alvo.ativo && (await dados.contarAdminsAtivos()) <= 1) {
        return send(res, 409, {
          erro: 'Este é o único administrador com acesso. Promova outra pessoa antes de tirar o desta.' });
      }
    }

    await dados.definirAtivo(id, ativo);
    return ok(res, { ok: true, ativo });
  }

  // ---- janelas de agendamento (leitura) — é o que a IA usa p/ oferecer horário
  if (pathname === '/api/janelas' && m === 'GET')
    return ok(res, await dados.listarJanelas());

  // ---- catálogo de serviços (leitura) — quem edita é o CRM
  if (pathname === '/api/catalogo' && m === 'GET')
    return ok(res, await dados.listarCatalogo());

  // ---- dashboard
  if (pathname === '/api/dashboard' && m === 'GET') {
    // Ao abrir o painel, puxa os agendamentos do CodeWords (no máx 1x/min).
    // Essencial no Render free, que "dorme" e não roda o timer de importação.
    if (Date.now() - _ultimaImportacao > 60000) {
      _ultimaImportacao = Date.now();
      try {
        await Promise.race([importarAgendamentosCW(), new Promise((r) => setTimeout(r, 8000))]);
      } catch {}
      invalidarCache();          // a importação pode ter trazido agendamento novo
    }
    // 10 s de cache: várias abas/pessoas abrindo o Início não viram 7 consultas cada
    return ok(res, await lembrar('dashboard', 10_000, () => dados.estatisticas()));
  }

  // ---- agendamentos
  if (pathname === '/api/agendamentos' && m === 'GET') {
    // Quem só marca presença enxerga apenas o DIA DE HOJE, sem telefone —
    // o filtro é imposto aqui, não na tela.
    if (soPresenca) {
      const lista = await dados.listarAgendamentos({ data: hoje() });
      return ok(res, lista.map(({ telefone, ...resto }) => resto));
    }
    const de = searchParams.get('de'), ate = searchParams.get('ate');
    if ((de && !dados.dataBanco(de)) || (ate && !dados.dataBanco(ate))) return bad(res, 'Período inválido: use de=AAAA-MM-DD e ate=AAAA-MM-DD.');
    if (de && ate && dados.dataBanco(de) > dados.dataBanco(ate)) return bad(res, 'Período invertido: "de" vem depois de "ate".');
    return ok(res, await dados.listarAgendamentos({
      de: de || undefined, ate: ate || undefined,
      data: searchParams.get('data') || undefined,
      status: searchParams.get('status') || undefined,
      q: searchParams.get('q') || undefined,
    }));
  }

  if (pathname === '/api/agendamentos' && m === 'POST') {
    if (!body.cliente_nome || !body.servico || !body.data || !body.hora)
      return bad(res, 'Informe cliente, serviço, data e hora.');
    if (!dados.dataBanco(body.data) || !dados.horaBanco(body.hora))
      return bad(res, 'Data ou hora em formato inválido.');
    if (!telefoneParecValido(body.telefone)) return bad(res, ERRO_TELEFONE);
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
      if (body.telefone !== undefined && !telefoneParecValido(body.telefone)) return bad(res, ERRO_TELEFONE);
      // merge: o que não veio no corpo mantém o valor atual
      const novo = { ...a, ...body };
      /* Ganhou telefone (ou trocou)? Liga à ficha do cliente — reaproveitando
         pelo telefone ou criando. O gatilho do banco (vincular_cliente_no_
         agendamento) só roda no INSERT: um agendamento que nasceu sem telefone
         e foi corrigido depois ficava sem cliente_id para sempre, e por isso
         sem lembrete, sem pós-venda e sem ficha no CRM. */
      const telNovo = soDigitos(body.telefone);
      if (telNovo && !dados.ehUuid(body.cliente_id) && (!a.cliente_id || telNovo !== soDigitos(a.telefone))) {
        novo.cliente_id = await dados.obterOuCriarCliente({
          nome: novo.cliente_nome, telefone: telNovo,
          veiculo: novo.veiculo ?? null, placa: novo.placa ?? null, origem: novo.origem ?? 'Google',
        }) ?? a.cliente_id ?? null;
      }
      /* Voltar para Aguardando/Confirmado zera o comparecimento: esses status
         significam "ainda não chegou". Sem isto, um "Não veio" marcado por
         engano e corrigido pela edição ficava preso na aba "Não vieram" —
         o bit compareceu=0 antigo continuava gravado. */
      if (body.status !== undefined && body.compareceu === undefined
          && ['aguardando', 'confirmado'].includes(body.status)) {
        novo.compareceu = null;
      }
      const atualizado = await dados.atualizarAgendamento(id, novo);
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
      // aguardando/confirmado = "ainda não chegou": zeram o comparecimento,
      // senão desfazer um "Não veio" deixava o bit antigo preso.
      confirmado:      { status: 'confirmado', confirmado: true, compareceu: null },
      compareceu:      { status: 'compareceu', compareceu: true },
      nao_veio:        { status: 'nao_veio', compareceu: false },
      em_atendimento:  { status: 'em_atendimento' },
      concluido:       { status: 'concluido', compareceu: true },
      // "Veio e não fechou": a pessoa ESTEVE na oficina, então compareceu=true —
      // senão um "Não veio" corrigido para isto ficava com o selo "Não veio" preso.
      nao_fechou:      { status: 'nao_fechou', compareceu: true },
      aguardando:      { status: 'aguardando', compareceu: null },
      // cancelado = a visita não aconteceu: zera o bit, senão um cancelado que um
      // dia teve compareceu=true contava em "Compareceram" e caía em "Na oficina".
      cancelado:       { status: 'cancelado', compareceu: null },
    };
    const ch = map[body.status];
    if (!ch) return bad(res, 'Status inválido.');
    // Quem só marca presença aperta Compareceu ou Não veio — nada além disso.
    // (Fechar ou não a venda é desfecho comercial: fica com quem usa o Início.)
    if (soPresenca && !['compareceu', 'nao_veio'].includes(body.status)) {
      return send(res, 403, { erro: 'Seu acesso só permite marcar se o cliente veio ou não.' });
    }
    const a = await dados.obterAgendamento(id);
    if (!a) return notFound(res);
    // Presença não mexe em quem JÁ tem desfecho comercial: um "Compareceu" aqui
    // desfaria o "Veio e fechou" do atendimento e reabriria a venda no CRM.
    if (soPresenca && ['concluido', 'nao_fechou'].includes(a.status)) {
      return send(res, 403, { erro: 'Este cliente já tem o desfecho registrado pelo atendimento — só o painel principal pode mudar.' });
    }
    /* "Não veio" manda o aviso de ausência NA HORA — uma vez só. O carimbo
       no_show_notificado_em vai JUNTO com a troca de status: assim o gatilho
       do banco (edge function) vê o campo preenchido e não dispara também,
       senão o cliente receberia duas mensagens. Clique repetido não reenvia. */
    const avisar = body.status === 'nao_veio'
      && !a.no_show_notificado_em
      && !!dados.soDigitos(a.telefone);
    const atualizado = await dados.atualizarAgendamento(id, {
      status: ch.status,
      confirmado: ch.confirmado !== undefined ? ch.confirmado : a.confirmado,
      compareceu: ch.compareceu !== undefined ? ch.compareceu : a.compareceu,
      ...(avisar ? { no_show_notificado_em: new Date().toISOString() } : {}),
    });
    let avisoAusencia = null;
    if (avisar && atualizado) {
      try {
        avisoAusencia = await enviarAvisoDeAusencia(atualizado);
      } catch (e) { avisoAusencia = { ok: false, erro: String(e?.message || e) }; }
      if (!avisoAusencia.ok) {
        // solta o carimbo: o próximo clique em "Não veio" tenta enviar de novo
        await dados.atualizarAgendamento(id, { no_show_notificado_em: null })
          .catch((e) => console.error('Liberar reenvio do aviso:', e?.message || e));
      }
    } else if (body.status === 'nao_veio' && a.no_show_notificado_em) {
      avisoAusencia = { ok: true, repetido: true };
    }
    await dispararWebhook('status_alterado', { agendamento: atualizado, novo_status: body.status });
    return ok(res, { ...atualizado, aviso_ausencia: avisoAusencia });
  }

  /* ---- link de entrada do ecossistema (?tel=&cliente=) ----
     O Atendimento, o CRM e o Comunicar abrem a Agenda com o telefone do
     cliente. Aqui vira: ficha (se houver) + agendamentos dele. */
  if (pathname === '/api/abrir' && m === 'GET') {
    const tel = dados.soDigitos(texto1(searchParams.get('tel'), 20));
    const cliente = texto1(searchParams.get('cliente'), 40).trim();
    if (!dados.ehUuid(cliente) && tel.length < 10) return bad(res, 'Informe ?tel= com DDD ou ?cliente=<id>.');
    return send(res, 200, await dados.abrirPeloLink({ cliente, tel }), { 'Cache-Control': 'no-store' });
  }

  // ---- histórico do cliente na Agenda e mensagens do Comunicar (modal e ficha)
  if ((pathname === '/api/clientes/historico' || pathname === '/api/clientes/mensagens') && m === 'GET') {
    const cliente_id = texto1(searchParams.get('cliente_id'), 40).trim();
    const telefone = dados.soDigitos(texto1(searchParams.get('tel'), 20));
    if (!dados.ehUuid(cliente_id) && telefone.length < 10) return ok(res, pathname.endsWith('historico') ? [] : { envios: [], respostas: [] });
    if (pathname.endsWith('historico')) return ok(res, await dados.historicoDoCliente({ cliente_id, telefone }, 15));
    return ok(res, await dados.mensagensDoCliente({ cliente_id, telefone }));
  }

  // ---- "✨ Sugerir horário": janelas livres calculadas aqui (sem IA, sem outro domínio)
  if (pathname === '/api/horarios-livres' && m === 'GET') {
    const data = searchParams.get('data');
    if (data && !dados.dataBanco(data)) return bad(res, 'Data inválida.');
    return send(res, 200, await dados.sugerirHorarios({
      data: data || undefined,
      consultor_id: searchParams.get('consultor_id') || undefined,
      ignorar: searchParams.get('ignorar') || undefined,
    }), { 'Cache-Control': 'no-store' });
  }

  // ---- busca global (Ctrl+K): agendamentos + clientes
  if (pathname === '/api/busca' && m === 'GET') {
    const q = texto1(searchParams.get('q'), 80).trim();
    return ok(res, await dados.buscaGlobal(q));
  }

  // ---- clientes
  if (pathname === '/api/clientes' && m === 'GET')
    return ok(res, await dados.listarClientes(searchParams.get('q') || undefined));
  if (pathname === '/api/clientes' && m === 'POST') {
    if (!String(body.nome ?? '').trim()) return bad(res, 'Informe o nome.');
    if (!telefoneParecValido(body.telefone)) return bad(res, ERRO_TELEFONE);
    try { return ok(res, await dados.criarCliente(body)); }
    catch (e) { if (/Aniversário inválido/.test(e?.message)) return bad(res, e.message); throw e; }
  }
  // "Achar pelo nome": telefone de quem já conversou (conversas) ou já tem ficha (clientes)
  if (pathname === '/api/clientes/achar' && m === 'GET') {
    const q = texto1(searchParams.get('q'), 80).trim();
    if (q.length < 2) return ok(res, []);
    return ok(res, await dados.acharContato(q));
  }
  // Ficha: cadastro + última visita + próxima revisão prevista (regras do Comunicar)
  if ((mm = pathname.match(new RegExp(`^/api/clientes/${UUID}/ficha$`))) && m === 'GET') {
    const f = await dados.fichaDoCliente(mm[1]);
    return f ? ok(res, f) : notFound(res);
  }
  if ((mm = pathname.match(new RegExp(`^/api/clientes/${UUID}$`)))) {
    const id = mm[1];
    if (m === 'PUT') {
      if (body.nome !== undefined && !String(body.nome ?? '').trim()) return bad(res, 'Informe o nome.');
      if (body.telefone !== undefined && !telefoneParecValido(body.telefone)) return bad(res, ERRO_TELEFONE);
      try {
        const c = await dados.atualizarCliente(id, body);
        return c ? ok(res, c) : notFound(res);
      } catch (e) { if (/Aniversário inválido/.test(e?.message)) return bad(res, e.message); throw e; }
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
  if (pathname === '/api/servicos' && m === 'GET') {
    const todos = !!searchParams.get('todos');
    return ok(res, await lembrar('servicos:' + todos, 60_000, () => dados.listarServicos(todos)));
  }
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

  /* Situação do WhatsApp da empresa — SÓ LEITURA.
     Esta tela já pareou aparelho por conta própria, com QR e device próprio.
     Duas telas parear cada uma o seu deu no que deu: a agenda ficou com um
     aparelho e o atendimento com outro, e ninguém sabia qual estava valendo.
     Agora quem conecta é o painel de atendimento, e aqui só se mostra o
     estado. O CodeWords também aposentou /devices — virou /connections, com
     código de pareamento no lugar do QR. */
  if (pathname === '/api/whatsapp/conexao' && m === 'GET') {
    const cfg = await getIaConfig();
    if (!cfg.cw_api_key) return ok(res, { configurado: false, erro: 'Configure a chave do CodeWords (aba IA).' });

    const base = (cfg.cw_base_url || 'https://runtime.codewords.ai').replace(/\/+$/, '');
    const sid  = cfg.cw_connect_service_id || 'whatsapp_device_manager';
    const numeroEmpresa = '+' + String(NUMERO_DA_EMPRESA).replace(/\D/g, '');

    try {
      const r = await fetch(`${base}/run/${sid}/connections`, {
        headers: { Authorization: cfg.cw_api_key }, signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) return ok(res, { configurado: true, ok: false, status: r.status, erro: erroCodeWords(r.status) });

      const lista = await r.json();
      const nossas = (Array.isArray(lista) ? lista : []).filter((c) => c.phone_number === numeroEmpresa);
      const viva = nossas.find((c) => /logged_in|connected/i.test(String(c.status || '')));

      if (viva) {
        return ok(res, { configurado: true, ok: true, conectado: true, status: 'logged_in',
          device_id: viva.phone_id, numero: numeroEmpresa,
          recebendo: !!viva.service_path,
          aviso: viva.service_path ? null
            : 'Conectado, mas sem receber: falta religar no painel de atendimento.' });
      }
      return ok(res, { configurado: true, ok: true, conectado: false, status: 'disconnected',
        numero: numeroEmpresa,
        onde_reconectar: 'Atendimento › Configurações › Equipe e sistema › Conexão do WhatsApp' });
    } catch (e) {
      return ok(res, { configurado: true, ok: false, erro: `Não deu para falar com o CodeWords: ${e.message}` });
    }
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

/* Cabeçalhos de segurança em TODA resposta. A CSP é simples de propósito: a
   tela usa script/estilo inline (tema no <head>, onclick nos modais), carrega
   o supabase-js do jsDelivr e as fontes do Google; fala com o Supabase direto
   do navegador (login). frame-ancestors 'none' = ninguém embute a Agenda num
   iframe (clickjacking). */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
function cabecalhosDeSeguranca(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', CSP);
}

const server = http.createServer(async (req, res) => {
  const inicio = process.hrtime.bigint();
  const url = new URL(req.url, `http://${req.headers.host}`);
  cabecalhosDeSeguranca(res);
  // Log só da API, com duração — sem a query string, que pode carregar o token do ICS.
  if (url.pathname.startsWith('/api/')) {
    // id curto por requisição: aparece no log e volta no cabeçalho X-Request-Id,
    // para casar a reclamação "deu erro às 10h" com a linha certa do log do Render
    const rid = Math.random().toString(36).slice(2, 8);
    res.setHeader('X-Request-Id', rid);
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
      const lento = ms > 2000 ? ' LENTO' : '';
      const linha = `${req.method} ${url.pathname} ${res.statusCode} ${ms.toFixed(0)}ms [${rid}]${lento}`;
      (res.statusCode >= 500 ? console.error : console.log)(linha);
    });
  }
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return await serveStatic(req, res, url.pathname);
  } catch (e) {
    // ErroHttp (413, 400 de JSON…) sai com o próprio código; o resto é 500.
    const status = Number.isInteger(e?.status) && e.status >= 400 && e.status < 600 ? e.status : 500;
    if (status === 500) console.error(e);
    if (res.headersSent) { try { res.end(); } catch { /* conexão já foi */ } return; }
    // a tela só lê 'erro'; sem isso as mensagens claras em português
    // (ex.: "preencha SUPABASE_SERVICE_ROLE_KEY no .env") nunca apareceriam
    send(res, status, { erro: String(e?.message || 'Erro interno') });
  }
});
// Requisição que fica pendurada (cliente sumiu no meio) não segura a conexão para sempre.
server.requestTimeout = 60_000;
server.headersTimeout = 30_000;

// ---------------------------------------------------------------------------
// Lembretes automáticos: NÃO saem mais daqui.
// Quem manda o lembrete de agendamento é o COMUNICAR (indycar-posvenda), com a
// régua dele, o opt-out do cliente (clientes.aceita_mensagens) e a resposta
// gravada em posvenda_envios (tipo 'lembrete'). A Agenda só mostra o selinho
// "lembrete enviado / respondeu" no cartão. O agendador verificarLembretes e a
// configuração "Lembretes automáticos" da aba WhatsApp foram removidos em 09/10.
// ---------------------------------------------------------------------------

// Os agendadores registram o erro em vez de engoli-lo — sem isso, uma falha do
// Supabase (400/401/enum) desapareceria e o diagnóstico ficaria impossível.
const aviso = (onde) => (e) => console.error(`${onde}:`, e?.message || e);

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

const TIMERS = [
  setInterval(() => importarAgendamentosCW().then(invalidarCache).catch(aviso('Importação CodeWords')), IMPORT_MIN * 60 * 1000),
  setTimeout(() => importarAgendamentosCW().then(invalidarCache).catch(aviso('Importação CodeWords')), 12 * 1000),
];

/* Desligamento limpo: o Render manda SIGTERM a cada deploy. Para de aceitar
   conexão nova, deixa as requisições em curso terminarem (até 10 s) e sai —
   sem cortar um PATCH de "Veio e fechou" no meio. */
let _desligando = false;
function desligar(sinal) {
  if (_desligando) return;
  _desligando = true;
  console.log(`\n  ${sinal}: encerrando a Agenda com cuidado…`);
  for (const t of TIMERS) clearTimeout(t);
  server.close(() => { console.log('  Conexões encerradas. Até logo. 🏁'); process.exit(0); });
  setTimeout(() => { console.error('  Tempo esgotado: saindo mesmo assim.'); process.exit(1); }, 10_000).unref();
}
process.on('SIGTERM', () => desligar('SIGTERM'));
process.on('SIGINT', () => desligar('SIGINT'));

/* O espelho local → cloud foi REMOVIDO. Os dois lados usam o MESMO Supabase
   (nada a espelhar) e, desde que o login entrou, o POST sem token levava 401
   em silêncio — só martelava o cloud a cada 10 minutos sem efeito nenhum. */

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
