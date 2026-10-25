// IndyCar Agendamentos — servidor HTTP (somente módulos nativos do Node)
// Persistência: Supabase (PostgREST) via dados.js / supabase.js — não há mais SQLite.
import http from 'node:http';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize, sep, resolve } from 'node:path';
import * as dadosReal from './dados.js';
import { selecionarUm } from './supabase.js';
import { conferirConfiguracao } from './supabase.js';
import {
  decidirAcesso, decidirNaoVeioNaEdicao, mudaDesfechoRegistrado, origemPermitida, mensagemSegura, ehGestor,
  presencaPodeMarcar, semConfirmacaoDoErro,
} from './regras.js';
import { rodarAutomacoes, proximoDiaUtil } from './automacoes.js';
import { idsDeAgendamento, entradaDoChegou } from './patio.js';
import { resumoDosLembretes } from './lembretes.js';
import { lerParametros as lerParametrosDeHorario, resumoDoDia } from './horarios.js';

/* A camada de dados é trocável SÓ nos testes (tests/servidor.test.mjs injeta
   um banco de mentira com _injetar). Em produção é sempre o dados.js. */
let dados = dadosReal;

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
const VERSAO = '2026-10-16-r5';

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
/* Compressão (rodada 4, velocidade): resposta acima de 1,5 KB vai em brotli
   (nível 4: rápido) ou gzip quando o navegador aceita. O painel do Início tem
   ~30 KB de JSON — no 4G da oficina isso pesa. Abaixo disso não compensa. */
const MIN_COMPRIMIR = 1500;
function codificacaoAceita(req) {
  const ae = String(req?.headers?.['accept-encoding'] || '');
  if (/\bbr\b/.test(ae)) return 'br';
  if (/\bgzip\b/.test(ae)) return 'gzip';
  return null;
}
function comprimir(buf, cod) {
  if (cod === 'br') return zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } });
  return zlib.gzipSync(buf, { level: 6 });
}
function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  const cod = Buffer.byteLength(body) >= MIN_COMPRIMIR ? codificacaoAceita(res.req) : null;
  if (cod) {
    const vary = [res.getHeader('Vary'), 'Accept-Encoding'].filter(Boolean).join(', ');
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Encoding': cod, Vary: vary, ...headers });
    return res.end(comprimir(Buffer.from(body), cod));
  }
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
  return { ok: r.ok, erro: r.ok ? null : (r.erro || 'envio falhou'), ...(r.semConfirmacao ? { semConfirmacao: true } : {}) };
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
    const txt = await r.text();   // conexão caindo AQUI (cabeçalho já veio) também é "sem confirmação" (catch abaixo)
    let data = {}; try { data = JSON.parse(txt); } catch { /* sem JSON */ }
    // HTTP 200 não é entrega: o GOWA responde 200 com {code:'ERROR'} — confere o conteúdo
    if (r.ok && /success/i.test(JSON.stringify(data))) return { ok: true, data };
    if (!r.ok) return { ok: false, status: r.status, erro: erroCodeWords(r.status, data?.message || data?.detail) };
    return { ok: false, erro: 'O WhatsApp não confirmou o envio: ' + (data?.message || data?.detail || data?.code || 'resposta sem sucesso') };
  } catch (e) {
    // 16/10: o pedido saiu e a resposta não voltou (timeout / conexão caída) — pode ter chegado ao cliente
    if (semConfirmacaoDoErro(e)) return { ok: false, semConfirmacao: true,
      erro: 'não sabemos se chegou: o WhatsApp não respondeu a tempo depois do pedido. Confira na conversa antes de mandar de novo' };
    return { ok: false, erro: String(e?.message || e) };
  }
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

// valor na planilha BR: vírgula decimal (350,50), inteiro sem casas, zero/vazio em branco — com ponto o Excel lê 1250.5 como texto ou data
const valorParaPlanilha = (n) => { const v = Number(n); return Number.isFinite(v) && v > 0 ? (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',')) : ''; };

// Gera CSV (separador ; — abre direto no Excel BR)
function gerarCSV(colunas, rows) {
  // célula que começa com = + - @ vira texto (o Excel executaria como fórmula)
  const q = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
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

/* Confere o token e devolve { usuario } — com papel, ativo e apps do perfil —
   ou { usuario: null, motivo }. Desativado NÃO é "sem login": a tela precisa
   dizer "seu acesso foi desativado" em vez de "senha errada". O cache de 60 s
   evita perguntar ao Supabase a cada clique; mudar papel/ativo/apps pela tela
   da equipe limpa o cache na hora (esquecerLogins). */
function nivelDoToken(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).aal || 'aal1'; }
  catch { return 'aal1'; }
}
async function usuarioLogadoReal(req) {
  const auth = req.headers['authorization'] || '';
  const achado = /^\s*bearer\s+(\S+)\s*$/i.exec(auth);      // "Bearer" é case-insensitive
  const token = achado ? achado[1] : null;
  if (!token || !SUPA_URL || !SUPA_ANON || !SUPA_SRV) return { usuario: null, motivo: 'sem_login' };

  const lembrado = CACHE_LOGIN.get(token);
  if (lembrado && lembrado.expira > Date.now()) return lembrado.negado ? { usuario: null, motivo: lembrado.negado } : { usuario: lembrado.usuario };

  const vence = validadeDoToken(token);
  if (vence && vence <= Date.now()) return { usuario: null, motivo: 'sem_login' };   // já venceu: nem pergunta

  const negar = (motivo = 'sem_login') => {
    if (CACHE_LOGIN.size > 500) CACHE_LOGIN.clear();
    CACHE_LOGIN.set(token, { negado: motivo, expira: Date.now() + 30_000 });
    return { usuario: null, motivo };
  };

  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { apikey: SUPA_ANON, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return negar();
    const usuario = await r.json();
    if (!usuario?.id) return negar();
    /* Verificação em duas etapas: quem tem fator TOTP verificado só passa com
       token de nível aal2 (depois do código). Sem isso, a senha sozinha
       abriria a API mesmo com a tela pedindo o código. */
    const temFator = (usuario.factors || []).some((f) => f.status === 'verified');
    if (temFator && nivelDoToken(token) !== 'aal2') return negar('mfa_pendente');

    const cab = { headers: { apikey: SUPA_SRV, Authorization: `Bearer ${SUPA_SRV}` }, signal: AbortSignal.timeout(8000) };
    let p = await fetch(`${SUPA_URL}/rest/v1/perfis?select=ativo,papel,apps,ultimo_acesso_em&id=eq.${encodeURIComponent(usuario.id)}`, cab);
    // banco sem as colunas novas (ainda): cai para o básico em vez de trancar todo mundo
    if (p.status === 400) p = await fetch(`${SUPA_URL}/rest/v1/perfis?select=ativo,papel&id=eq.${encodeURIComponent(usuario.id)}`, cab);
    if (!p.ok) return { usuario: null, motivo: 'sem_login' };    // banco fora: não guarda a recusa
    const [perfil] = await p.json();
    if (!perfil) return negar();
    if (!perfil.ativo) return negar('desativado');
    usuario.papel = perfil.papel;
    usuario.ativo = !!perfil.ativo;
    usuario.apps = perfil.papel === 'agenda' ? ['agenda'] : (Array.isArray(perfil.apps) ? perfil.apps : ['agenda']);
    usuario.ultimo_acesso_em = perfil.ultimo_acesso_em || null;

    if (CACHE_LOGIN.size > 500) CACHE_LOGIN.clear();
    CACHE_LOGIN.set(token, { usuario, expira: Math.min(Date.now() + 60_000, vence || Infinity) });
    return { usuario };
  } catch { return { usuario: null, motivo: 'sem_login' }; }
}
let usuarioLogado = usuarioLogadoReal;
/** Mudou papel/ativo/apps de alguém: o porteiro esquece o que tinha guardado. */
const esquecerLogins = () => CACHE_LOGIN.clear();

/* Último acesso: no máximo uma gravação a cada 5 min por pessoa. */
const _ultimoAcesso = new Map();
function marcarAcesso(usuario) {
  const agora = Date.now();
  const antes = _ultimoAcesso.get(usuario.id) ?? (usuario.ultimo_acesso_em ? Date.parse(usuario.ultimo_acesso_em) : 0);
  if (agora - antes < 5 * 60_000) return;
  _ultimoAcesso.set(usuario.id, agora);
  if (_ultimoAcesso.size > 500) _ultimoAcesso.clear();
  Promise.resolve(dados.marcarUltimoAcesso?.(usuario.id, 'agenda')).catch(() => { /* coluna ausente: segue */ });
}

/* Rotas que o CodeWords/Google chamam de fora e não falam Supabase Auth.
   Cada uma tem o próprio segredo (token do ICS, verify_token do webhook).
   /api/primeiro-acesso entra aqui porque, por definição, ainda não existe
   ninguém para fazer login — ela mesma se fecha assim que houver um perfil. */
const ROTAS_SEM_LOGIN = new Set([
  '/api/config', '/api/agenda.ics', '/api/whatsapp/webhook', '/api/primeiro-acesso', '/api/versao',
  // rodada 5: a página de confirmação que o CLIENTE abre (token no lugar do login)
  '/api/publico/confirmacao',
]);

/* Endereço público desta Agenda, visto de fora (atrás do proxy do Render vem
   X-Forwarded-Proto). Com a Central, req.prefixo (ex.: '/agenda') entra no fim:
   é a base dos links que o servidor monta para o cliente (confirmação). */
function baseDaRequisicao(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (req.socket?.encrypted ? 'https' : 'http');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  const prefixo = String(req.prefixo || '').replace(/\/+$/, '');
  return `${proto}://${host}${prefixo}`;
}

/* Rotas que custam caro (varrem a tabela, chamam serviço de fora): no máximo
   30 por minuto por pessoa. */
const ROTAS_CARAS = new Set([
  '/api/busca', '/api/export/agendamentos.csv', '/api/export/clientes.csv', '/api/horarios-livres',
  '/api/codewords/run', '/api/codewords/importar', '/api/integracoes/testar-webhook', '/api/whatsapp/testar',
  '/api/whatsapp/conexao', '/api/clientes/achar', '/api/consultores/sugerir',
  '/api/horarios-livres/dia', '/api/horarios-livres/proximos', '/api/clientes/360', '/api/aniversarios',
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

/* Campos de texto de um agendamento vindos de fora (tela, IA, integração): objeto/lista no lugar de
   texto virava "[object Object]" no banco; nome ou serviço só com espaços virava cartão em branco; e
   valor digitado "350,50" ou "1.250,00" virava 0 ou 1,25 por causa do Number() puro. Corrige o corpo
   no lugar e devolve o recado de erro (ou null). */
const LIMITES_TEXTO = { cliente_nome: 160, servico: 200, veiculo: 120, placa: 20, observacoes: 4000 };
function conferirCamposDoAgendamento(body, { criando = false } = {}) {
  for (const [k, max] of Object.entries(LIMITES_TEXTO)) {
    if (body[k] === undefined || body[k] === null) continue;
    if (typeof body[k] === 'object') return `Campo inválido: ${k}.`;
    body[k] = String(body[k]).slice(0, max);
    if (k === 'cliente_nome' || k === 'servico') body[k] = body[k].trim();
  }
  if (criando || body.cliente_nome !== undefined) if (!body.cliente_nome) return 'Informe o nome do cliente.';
  if (criando || body.servico !== undefined) if (!body.servico) return 'Informe o serviço.';
  if (body.valor !== undefined && body.valor !== null && body.valor !== '') {
    const n = dados.valorDeEntrada(typeof body.valor === 'number' ? body.valor : texto1(body.valor, 20));
    if (n === null || !dados.valorValido(n)) return `Valor inválido: use só números, ex.: 350 ou 1.250,00 (até R$ ${dados.VALOR_MAXIMO.toLocaleString('pt-BR')}).`;
    body.valor = n;
  } else if (body.valor === '') delete body.valor;
  return null;
}

const PAPEIS_EQUIPE = ['admin', 'gestor', 'atendente', 'agenda'];
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

/* ---------------------------------------------------------------------------
   MUDANÇA DE SITUAÇÃO — um caminho só para o cartão (PATCH /status) e para a
   edição que escolheu "avisar o cliente". É aqui que o aviso de falta sai, UMA
   vez, com o carimbo no_show_notificado_em gravado JUNTO com o status (o
   gatilho do banco vê o carimbo e não manda de novo).
   --------------------------------------------------------------------------- */
const MAPA_STATUS = {
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

async function mudarStatus({ antes: a, status, usuario, valor }) {
  const ch = MAPA_STATUS[status];
  /* "Não veio" manda o aviso de ausência NA HORA — uma vez só. Clique repetido não reenvia. */
  const avisar = status === 'nao_veio' && !a.no_show_notificado_em && !!dados.soDigitos(a.telefone);
  let atualizado = await dados.atualizarAgendamento(a.id, {
    status: ch.status,
    confirmado: ch.confirmado !== undefined ? ch.confirmado : a.confirmado,
    compareceu: ch.compareceu !== undefined ? ch.compareceu : a.compareceu,
    ...(status === 'concluido' && valor !== undefined ? { valor } : {}),
    ...(avisar ? { no_show_notificado_em: new Date().toISOString() } : {}),
  });
  let avisoAusencia = null;
  if (avisar && atualizado) {
    try {
      avisoAusencia = await enviarAvisoDeAusencia(atualizado);
    } catch (e) { avisoAusencia = { ok: false, erro: String(e?.message || e) }; }
    if (!avisoAusencia.ok && !avisoAusencia.semConfirmacao) {
      // solta o carimbo: o próximo clique em "Não veio" tenta enviar de novo
      // (sem confirmação NÃO solta: pode ter chegado — clicar de novo mandaria dois)
      await dados.atualizarAgendamento(a.id, { no_show_notificado_em: null })
        .catch((e) => console.error('Liberar reenvio do aviso:', e?.message || e));
    }
  } else if (status === 'nao_veio' && a.no_show_notificado_em) {
    avisoAusencia = { ok: true, repetido: true };
  }
  await depoisDeMudarStatus({ antes: a, depois: atualizado, usuario, via: 'cartao' });
  return { atualizado, avisoAusencia };
}

/** O que vem depois de qualquer troca de situação: webhook, auditoria e automação. */
async function depoisDeMudarStatus({ antes: a, depois, usuario, via }) {
  if (!depois) return;
  await dispararWebhook('status_alterado', { agendamento: depois, novo_status: depois.status });
  // mudar um desfecho JÁ registrado (fechou / não fechou / não veio) fica na auditoria
  if (mudaDesfechoRegistrado(a.status, depois.status)) {
    await dados.auditar(usuario?.id, 'mudou_desfecho', 'agendamentos', a.id,
      { de: a.status, para: depois.status, via, cliente: a.cliente_nome });
  }
  // faltou: a tarefa "Reagendar" nasce na hora (sem esperar o próximo ciclo)
  if (depois.status === 'nao_veio') agendarAutomacoes(2_000);
}

/* Rodada 7 (C2): o link da entrada PRONTA no Pátio para um horário que chegou (com o orçamento que existir). Sem telefone nem nome. */
async function entradaDoPatioDe(a) {
  const [orcMapa, base] = await Promise.all([
    dados.orcamentosDosAgendamentos ? dados.orcamentosDosAgendamentos([a.id]).catch(() => ({})) : {},
    dados.linkBaseDoPatio ? dados.linkBaseDoPatio().catch(() => undefined) : undefined,
  ]);
  return entradaDoChegou(a, (orcMapa || {})[a.id] || null, base);
}

async function api(req, res, url) {
  const { pathname, searchParams } = url;
  const m = req.method;
  let mm0;

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

  /* ---- RODADA 5: confirmação pelo CLIENTE (sem login; o token é a chave) ----
     GET  ?t=<token>  → o horário dele (primeiro nome, serviço, dia, hora) e a resposta já dada
     POST { t, resposta: confirmou|nao_vem|remarcar, observacao? } → grava; "confirmou"
     liga agendamentos.confirmado (gatilho ag_confirmacao_aplica). Freio por IP. */
  if (pathname === '/api/publico/confirmacao') {
    const ip = ipDaRequisicao(req);
    if (!dentroDoLimite(`publico:${ip}`, 40, 600_000)) return send(res, 429, { erro: 'Muitas tentativas. Espere alguns minutos.' }, { 'Cache-Control': 'no-store' });
    if (m === 'GET') {
      const c = await dados.confirmacaoPorToken(texto1(searchParams.get('t'), 80));
      if (!c) return send(res, 404, { erro: 'Este link não vale mais. Fale com a oficina pelo WhatsApp.' }, { 'Cache-Control': 'no-store' });
      // dados públicos da oficina para a página: como chegar e falar com a gente (nada de cliente)
      const emp = await dados.obterEmpresa().catch(() => ({}));
      const endereco = String(emp?.endereco || '').trim();
      c.oficina = { nome: emp?.nome || 'IndyCar Centro Automotivo', endereco: endereco || null,
        mapa: endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}` : null,
        whatsapp: `https://wa.me/${String(NUMERO_DA_EMPRESA).replace(/\D/g, '')}` };
      return send(res, 200, c, { 'Cache-Control': 'no-store' });
    }
    if (m === 'POST') {
      const corpo = await readBody(req);
      const resposta = texto1(corpo.resposta, 20);
      if (!['confirmou', 'nao_vem', 'remarcar'].includes(resposta)) return bad(res, 'Resposta inválida.');
      const r = await dados.responderConfirmacao(texto1(corpo.t, 80), resposta, texto1(corpo.observacao, 300).trim() || null);
      if (!r) return send(res, 404, { erro: 'Este link não vale mais. Fale com a oficina pelo WhatsApp.' }, { 'Cache-Control': 'no-store' });
      // horário que já passou / já teve desfecho: não aceita (a página já avisa; aqui é contra link velho e script)
      if (r.encerrado) return send(res, 409, { erro: 'Esse horário já passou ou já foi atendido. Fale com a oficina pelo WhatsApp.' }, { 'Cache-Control': 'no-store' });
      // mesma resposta de novo (toque duplo, duas abas): confirma de novo ao cliente, sem tarefa nem sino repetidos
      if (r.repetido) return send(res, 200, { ok: true, resposta: r.resposta, respondido_em: r.respondido_em, repetido: true }, { 'Cache-Control': 'no-store' });
      invalidarCache();
      /* "Não vem" / "quer remarcar" vira TAREFA para a equipe (quem atende a conversa, o consultor ou um gestor —
         a mesma regra das automações). "Confirmou" não precisa de ninguém. */
      if (resposta !== 'confirmou') {
        try {
          const a = await dados.obterAgendamento(r.agendamento_id);
          if (a) {
            const [consultores, gestores] = await Promise.all([dados.listarConsultores().catch(() => []), dados.gestoresAtivos().catch(() => [])]);
            const dono = consultores.find((c) => c.id === a.consultor_id)?.perfil_id || gestores[0]?.id || null;
            await dados.criarTarefa({
              titulo: resposta === 'remarcar' ? 'Remarcar' : 'Cliente avisou que não vem',
              descricao: `${a.cliente_nome} respondeu pelo link de confirmação: ${resposta === 'remarcar' ? 'quer remarcar' : 'não vai conseguir vir'} (${a.servico}, ${formatarDataBR(a.data)} às ${String(a.hora).slice(0, 5)}).${corpo.observacao ? ' Recado: ' + texto1(corpo.observacao, 300) : ''}`,
              responsavel_id: dono, agendamento_id: a.id, cliente_id: a.cliente_id || null, origem: 'agenda', prioridade: 1,
            });
            // e o sino toca na hora para quem vai cuidar (chave única: não repete se o cliente tocar duas vezes)
            if (dono && dados.notificar) {
              await dados.notificar({ perfil_id: dono, tipo: 'confirmacao', app: 'agenda', chave: `confirmacao:${a.id}:${resposta}`,
                titulo: `${a.cliente_nome} ${resposta === 'remarcar' ? 'quer remarcar' : 'avisou que não vem'}`,
                corpo: `${a.servico} · ${formatarDataBR(a.data)} às ${String(a.hora).slice(0, 5)} — respondeu pelo link de confirmação.`,
                link: `/?agendamento=${a.id}` }).catch(() => null);
            }
          }
        } catch (e) { console.warn('Confirmação → tarefa:', e?.message || e); }
      }
      return send(res, 200, { ok: true, resposta: r.resposta, respondido_em: r.respondido_em }, { 'Cache-Control': 'no-store' });
    }
    return notFound(res);
  }

  if (pathname === '/api/primeiro-acesso' && m === 'POST') {
    // Ninguém está logado para chegar aqui, então o freio possível é o IP.
    const ip = ipDaRequisicao(req);
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
    const quem = await usuarioLogado(req);
    usuario = quem.usuario;
    if (!usuario) {
      // desativado no meio do uso: 403 com código — a tela volta ao login com o aviso certo
      if (quem.motivo === 'desativado') {
        return send(res, 403, { erro: 'Seu acesso foi desativado. Fale com o administrador.', codigo: 'desativado' });
      }
      if (quem.motivo === 'mfa_pendente') {
        return send(res, 401, { erro: 'Falta o código da verificação em duas etapas.', codigo: 'mfa_pendente' });
      }
      return send(res, 401, { erro: 'Faça login para usar a Agenda.', codigo: 'sem_login' });
    }
    /* Papel e app conferidos AQUI, em toda rota (regras.js, testado):
       - sem 'agenda' em perfis.apps (e não admin) → 403 "sem acesso a este app"
       - papel 'agenda' (Franklin): allowlist de presença
       - apagar/exportar/configurar: só gestor ou admin */
    const recusa = decidirAcesso({ perfil: usuario, metodo: m, rota: pathname });
    if (recusa) return send(res, recusa.status, { erro: recusa.erro, codigo: recusa.codigo });
    marcarAcesso(usuario);
    // rotas caras: freio por pessoa (um script distraído não derruba o servidor)
    if (ROTAS_CARAS.has(pathname) && !dentroDoLimite(`caro:${usuario.id}:${pathname}`, 30, 60_000)) {
      return send(res, 429, { erro: 'Muitos pedidos seguidos. Espere um minuto e tente de novo.' });
    }
  }
  // Quem manda na equipe. Conferido AQUI: esconder o botão na tela não protege nada.
  const ehAdmin = usuario?.papel === 'admin';
  const souGestor = ehGestor(usuario?.papel);
  /* Papel 'agenda' (ex.: Franklin): entra SÓ para marcar presença — a allowlist
     está em regras.js (rotaDaPresenca) e já foi conferida acima. */
  const soPresenca = usuario?.papel === 'agenda';

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
    await dados.auditar(usuario.id, 'mudou_configuracao', 'agenda_empresa', null, { campos: Object.keys(body) });
    return ok(res, await dados.salvarEmpresa(body));
  }

  // ---- perfil de quem está logado (aba Configurações → Minha conta)
  if (pathname === '/api/perfil' && m === 'GET')
    return ok(res, await dados.obterPerfil(usuario.id, usuario.email));
  if (pathname === '/api/perfil' && m === 'PUT') {
    /* "Meu perfil": nome, cargo, telefone, cor do avatar e preferências de
       notificação. Sempre usuario.id (ninguém mexe no perfil de outra pessoa
       por aqui) e NUNCA papel/apps/ativo — esses são do administrador. */
    const campos = {};
    if (body.nome !== undefined) {
      campos.nome = texto1(body.nome, 80).trim();
      if (!campos.nome) return bad(res, 'Informe o seu nome.');
    }
    if (body.cargo !== undefined) campos.cargo = texto1(body.cargo, 60).trim() || null;
    if (body.telefone !== undefined) {
      if (!telefoneParecValido(body.telefone)) return bad(res, ERRO_TELEFONE);
      campos.telefone = soDigitos(texto1(body.telefone, 20)) || null;
    }
    if (body.avatar_cor !== undefined) {
      if (!/^#[0-9a-fA-F]{6}$/.test(texto1(body.avatar_cor, 7))) return bad(res, 'Cor inválida.');
      campos.avatar_cor = body.avatar_cor;
    }
    if (body.preferencias !== undefined) {
      const p = body.preferencias && typeof body.preferencias === 'object' && !Array.isArray(body.preferencias) ? body.preferencias : {};
      // só chaves conhecidas, só booleano: nada de JSON arbitrário no perfil
      // agenda_tour = já viu o tour de boas-vindas; agenda_letra = tamanho da letra no modo recepção
      campos.preferencias = Object.fromEntries(['notif_atraso', 'notif_tarefas', 'notif_som', 'agenda_tour']
        .filter((k) => typeof p[k] === 'boolean').map((k) => [k, p[k]]));
      if (['normal', 'grande', 'enorme'].includes(p.agenda_letra)) campos.preferencias.agenda_letra = p.agenda_letra;
    }
    if (!Object.keys(campos).length) return bad(res, 'Nada para salvar.');
    return ok(res, await dados.atualizarMeuPerfil(usuario.id, campos, usuario.email));
  }
  // Troca obrigatória de senha concluída (a tela já trocou com sb.auth.updateUser)
  if (pathname === '/api/perfil/senha-trocada' && m === 'POST') {
    await dados.marcarSenhaTrocada(usuario.id);
    await dados.auditar(usuario.id, 'trocou_senha_obrigatoria', 'perfis', usuario.id);
    return ok(res, { ok: true });
  }

  /* ---- sino de notificações (só as MINHAS: o filtro é o id do token) ---- */
  if (pathname === '/api/notificacoes' && m === 'GET') {
    return send(res, 200, await dados.listarNotificacoes(usuario.id), { 'Cache-Control': 'no-store' });
  }
  if (pathname === '/api/notificacoes/lidas' && m === 'POST') {
    const ids = Array.isArray(body.ids) ? body.ids.map((x) => texto1(x, 40)) : null;
    if (!ids && body.todas !== true) return bad(res, 'Diga quais notificações (ids) ou todas.');
    return ok(res, { ok: true, marcadas: await dados.marcarNotificacoesLidas(usuario.id, ids) });
  }

  /* ---- minhas tarefas ---- */
  if (pathname === '/api/tarefas' && m === 'GET') {
    const st = searchParams.get('status');
    return send(res, 200, await dados.listarTarefasDe(usuario.id, { status: ['aberta', 'feita'].includes(st) ? st : 'aberta' }),
      { 'Cache-Control': 'no-store' });
  }
  if (pathname === '/api/tarefas' && m === 'POST') {
    if (!dentroDoLimite(`tarefa:${usuario.id}`, 30, 60_000)) return send(res, 429, { erro: 'Muitas tarefas seguidas. Espere um minuto.' });
    const titulo = texto1(body.titulo, 200).trim();
    if (!titulo) return bad(res, 'Escreva o que precisa ser feito.');
    for (const k of ['responsavel_id', 'agendamento_id', 'cliente_id']) {
      if (body[k] !== undefined && body[k] !== null && body[k] !== '' && !dados.ehUuid(texto1(body[k], 40))) return bad(res, 'Identificador inválido.');
    }
    const venc = texto1(body.vence_em, 40);
    if (venc && Number.isNaN(Date.parse(venc))) return bad(res, 'Prazo inválido.');
    const t = await dados.criarTarefa({
      titulo, descricao: texto1(body.descricao, 1000).trim() || null,
      responsavel_id: body.responsavel_id || usuario.id, criado_por: usuario.id,
      agendamento_id: body.agendamento_id || null, cliente_id: body.cliente_id || null,
      prioridade: body.prioridade, vence_em: venc || null, origem: 'agenda',
    });
    return send(res, 201, t);
  }
  if ((mm0 = pathname.match(new RegExp(`^/api/tarefas/${UUID}$`))) && m === 'PATCH') {
    const t = await dados.obterTarefa(mm0[1]);
    if (!t) return notFound(res);
    // concluir/reabrir: quem é responsável, quem criou ou gestor
    if (t.responsavel_id !== usuario.id && t.criado_por !== usuario.id && !souGestor) {
      return send(res, 403, { erro: 'Essa tarefa é de outra pessoa.' });
    }
    if (!['aberta', 'feita', 'cancelada'].includes(body.status)) return bad(res, 'Situação inválida.');
    return ok(res, await dados.mudarStatusTarefa(t.id, body.status));
  }

  /* ---- auditoria (admin): o que a Agenda registrou por último ---- */
  if (pathname === '/api/auditoria' && m === 'GET') {
    if (!ehAdmin) return send(res, 403, { erro: 'Só o administrador vê a auditoria.' });
    return ok(res, await dados.ultimasAuditorias?.(50) ?? []);
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

  /* Nomes da equipe ativa (sem e-mail) — para o gestor ligar um consultor a um
     login no cadastro de consultores. Só id, nome e função. */
  if (pathname === '/api/equipe/nomes' && m === 'GET') {
    const lista = await dados.listarEquipe(null);
    return ok(res, lista.filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome, papel: p.papel })));
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
    const papel = PAPEIS_EQUIPE.includes(body.papel) ? body.papel : 'atendente';
    if (!nome) return bad(res, 'Informe o nome da pessoa.');
    if (!EMAIL_PARECE_VALIDO.test(email)) return bad(res, 'Esse e-mail não parece válido. Confira e tente de novo.');
    if (senha.length < 8) return bad(res, 'A senha precisa ter pelo menos 8 caracteres.');
    if (senha.toLowerCase() === email) return bad(res, 'A senha não pode ser igual ao e-mail.');

    try {
      /* A senha foi o admin quem escolheu: no primeiro login a pessoa troca pela
         dela (precisa_trocar_senha), a não ser que o admin desmarque. */
      const criado = await dados.criarMembro({ nome, email, senha, papel, convidadoPor: usuario.id,
        trocarSenha: body.trocar_senha !== false });
      await dados.auditar(usuario.id, 'cadastrou_pessoa', 'perfis', criado.id, { papel, email });
      return send(res, 201, { ok: true, ...criado });
    } catch (e) {
      const r = recusaDeCadastro(e);
      return send(res, r.status, { erro: r.erro });
    }
  }

  if (pathname === '/api/equipe/papel' && m === 'POST') {
    if (!ehAdmin) return send(res, 403, { erro: 'Só o administrador muda a função da equipe.' });
    const id = texto1(body.id, 60);
    const papel = PAPEIS_EQUIPE.includes(body.papel) ? body.papel : 'atendente';
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

    await dados.definirPapel(id, papel, alvo.papel);
    esquecerLogins();
    await dados.auditar(usuario.id, 'mudou_papel', 'perfis', id, { de: alvo.papel, para: papel });
    return ok(res, { ok: true, papel });
  }

  // Quais apps a pessoa usa (admin). O papel 'agenda' fica sempre só com a Agenda.
  if (pathname === '/api/equipe/apps' && m === 'POST') {
    if (!ehAdmin) return send(res, 403, { erro: 'Só o administrador muda os apps de alguém.' });
    const id = texto1(body.id, 60);
    if (!dados.ehUuid(id)) return bad(res, 'Informe de quem você quer mudar os apps.');
    if (!Array.isArray(body.apps)) return bad(res, 'Envie a lista de apps.');
    const alvo = await dados.resumoDoPerfil(id);
    if (!alvo) return send(res, 404, { erro: 'Não encontrei essa pessoa na equipe. Atualize a página.' });
    if (alvo.papel === 'agenda') return bad(res, 'Quem só marca presença usa apenas a Agenda. Mude a função antes.');
    if (alvo.papel === 'admin') return bad(res, 'O administrador sempre entra em todos os apps.');
    const apps = await dados.definirApps(id, body.apps.map((a) => texto1(a, 20)));
    esquecerLogins();
    await dados.auditar(usuario.id, 'mudou_apps', 'perfis', id, { apps });
    return ok(res, { ok: true, apps });
  }

  /* Senha temporária (admin): quando o e-mail de "esqueci a senha" não chega
     (o plano gratuito do Supabase manda poucos por hora). Aparece UMA vez para o
     admin entregar em mãos; a pessoa troca pela dela no próximo login. */
  if (pathname === '/api/equipe/senha-temporaria' && m === 'POST') {
    if (!ehAdmin) return send(res, 403, { erro: 'Só o administrador gera senha temporária.' });
    if (!dentroDoLimite(`senhatemp:${usuario.id}`, 5, 600_000)) return send(res, 429, { erro: 'Muitas senhas seguidas. Espere alguns minutos.' });
    const id = texto1(body.id, 60);
    if (!dados.ehUuid(id)) return bad(res, 'Informe para quem é a senha.');
    if (id === usuario.id) return bad(res, 'Para a sua própria senha use "Trocar senha" no seu perfil.');
    const alvo = await dados.resumoDoPerfil(id);
    if (!alvo) return send(res, 404, { erro: 'Não encontrei essa pessoa na equipe. Atualize a página.' });
    const senha = await dados.definirSenhaTemporaria(id);
    await dados.auditar(usuario.id, 'gerou_senha_temporaria', 'perfis', id, null);   // a senha nunca vai para a auditoria
    return send(res, 200, { ok: true, senha }, { 'Cache-Control': 'no-store' });
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
    esquecerLogins();                       // desativado: perde o acesso no próximo clique, não em 60 s
    await dados.auditar(usuario.id, ativo ? 'devolveu_acesso' : 'tirou_acesso', 'perfis', id, null);
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
    /* RODADA 4 (velocidade): a importação roda POR FORA — antes o Início
       esperava até 8 s pelo CodeWords (que hoje responde 401) antes de mostrar
       qualquer número. Agora o painel sai na hora com o que está no banco; o
       que a importação trouxer aparece na próxima atualização (o cache é
       invalidado quando ela termina). Ainda no máximo 1x/min. */
    if (Date.now() - _ultimaImportacao > 60000) {
      _ultimaImportacao = Date.now();
      importarAgendamentosCW().then((r) => { if (r?.importados) invalidarCache(); })
        .catch(aviso('Importação CodeWords (painel)'));
    }
    // 10 s de cache: várias abas/pessoas abrindo o Início não viram 7 consultas cada
    return ok(res, await lembrar('dashboard', 10_000, () => dados.estatisticas()));
  }

  // ---- agendamentos
  if (pathname === '/api/agendamentos' && m === 'GET') {
    // Quem só marca presença enxerga apenas o DIA DE HOJE, sem telefone —
    // o filtro é imposto aqui, não na tela.
    if (soPresenca) {
      /* rodada 5: além de hoje, quem está NA CASA de outro dia (chegou e ainda não
         saiu), para a recepção ver quem está dentro — sempre sem telefone. */
      const [deHoje, naCasa] = await Promise.all([
        dados.listarAgendamentos({ data: hoje() }),
        dados.naCasaDeOutrosDias ? dados.naCasaDeOutrosDias(7).catch(() => []) : [],
      ]);
      return ok(res, [...deHoje, ...naCasa].map(({ telefone, telefone_e164, ...resto }) => resto));
    }
    const de = searchParams.get('de'), ate = searchParams.get('ate');
    if ((de && !dados.dataBanco(de)) || (ate && !dados.dataBanco(ate))) return bad(res, 'Período inválido: use de=AAAA-MM-DD e ate=AAAA-MM-DD.');
    if (de && ate && dados.dataBanco(de) > dados.dataBanco(ate)) return bad(res, 'Período invertido: "de" vem depois de "ate".');
    const data = searchParams.get('data');
    if (data && !dados.dataBanco(data)) return bad(res, 'Data inválida.');
    const cons = searchParams.get('consultor_id');
    if (cons && !dados.ehUuid(cons)) return bad(res, 'Consultor inválido.');
    return ok(res, await dados.listarAgendamentos({
      de: de || undefined, ate: ate || undefined,
      data: data || undefined,
      status: searchParams.get('status') || undefined,
      q: texto1(searchParams.get('q'), 80).trim() || undefined,
      consultor_id: cons || undefined,
    }));
  }

  if (pathname === '/api/agendamentos' && m === 'POST') {
    if (!body.cliente_nome || !body.servico || !body.data || !body.hora)
      return bad(res, 'Informe cliente, serviço, data e hora.');
    { const erroCampos = conferirCamposDoAgendamento(body, { criando: true }); if (erroCampos) return bad(res, erroCampos); }
    if (!dados.dataBanco(body.data) || !dados.horaBanco(body.hora))
      return bad(res, 'Data ou hora em formato inválido.');
    if (!telefoneParecValido(body.telefone)) return bad(res, ERRO_TELEFONE);
    for (const k of ['consultor_id', 'cliente_id']) {
      if (body[k] && !dados.ehUuid(texto1(body[k], 40))) return bad(res, 'Identificador inválido.');
    }
    // "Não veio" não nasce num agendamento novo: o aviso de falta é do cartão
    if (body.status === 'nao_veio') body.status = 'aguardando';
    // dedupe: mesmo horário + mesmo telefone (ou mesmo nome) = mesmo agendamento
    const dup = await dados.agendamentoDuplicado(
      body.data, body.hora, soDigitos(body.telefone || ''), body.cliente_nome, { soVivos: true });
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
    const { orcamento_id: orcamentoDeOrigem, ...corpoSemOrc } = body;
    const criado = await dados.criarAgendamento({ ...corpoSemOrc, cliente_id: clienteId });
    await dispararWebhook('agendamento_criado', { agendamento: criado });
    /* rodada 6: marcado a partir de um orçamento aprovado do Orçador → o orçamento ganha o horário (só se ainda estava solto) */
    let orcamentoLigado = false;
    if (orcamentoDeOrigem && dados.ehUuid(texto1(orcamentoDeOrigem, 40)) && dados.ligarOrcamentoAoAgendamento && criado?.id) {
      orcamentoLigado = await dados.ligarOrcamentoAoAgendamento(orcamentoDeOrigem, criado.id).catch(() => false);
    }
    return ok(res, orcamentoLigado ? { ...criado, orcamento_ligado: true } : criado);
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
      if (body.consultor_id && !dados.ehUuid(texto1(body.consultor_id, 40))) return bad(res, 'Consultor inválido.');
      { const erroCampos = conferirCamposDoAgendamento(body); if (erroCampos) return bad(res, erroCampos); }
      /* "Não veio" pela EDIÇÃO: o gatilho do banco mandaria o WhatsApp de falta
         sem ninguém pedir. Só passa com resposta explícita (regras.js):
         avisar_cliente true → mesmo fluxo do cartão; false → carimba junto. */
      const naoVeio = decidirNaoVeioNaEdicao(a, body);
      if (naoVeio.acao === 'perguntar') {
        return send(res, 409, { codigo: 'confirmar_aviso',
          erro: 'Marcar "Não veio" manda o WhatsApp de falta para o cliente. Avisar o cliente?' });
      }
      const { avisar_cliente, ...resto } = body;
      // merge: o que não veio no corpo mantém o valor atual
      const novo = { ...a, ...resto };
      if (naoVeio.acao === 'carimbar') novo.no_show_notificado_em = new Date().toISOString();
      if (naoVeio.acao === 'avisar') { delete novo.status; delete novo.compareceu; }   // o status vai pelo fluxo do cartão, logo abaixo
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
      if (body.status === 'nao_veio' && naoVeio.acao !== 'avisar' && body.compareceu === undefined) novo.compareceu = false;
      let atualizado = await dados.atualizarAgendamento(id, novo);
      if (!atualizado) return notFound(res);
      let avisoAusencia = null;
      if (naoVeio.acao === 'avisar') {
        const r = await mudarStatus({ antes: atualizado, status: 'nao_veio', usuario });
        atualizado = r.atualizado; avisoAusencia = r.avisoAusencia;
      } else if (body.status !== undefined && body.status !== a.status) {
        await depoisDeMudarStatus({ antes: a, depois: atualizado, usuario, via: 'edicao' });
      }
      return ok(res, { ...atualizado, aviso_ausencia: avisoAusencia });
    }
    if (m === 'DELETE') {
      const a = await dados.obterAgendamento(id);
      if (!a) return notFound(res);
      await dados.removerAgendamento(id);
      // quem apagou o quê (o gatilho do banco guarda a linha; aqui fica QUEM foi)
      await dados.auditar(usuario.id, 'apagou_agendamento', 'agendamentos', id,
        { cliente: a.cliente_nome, data: a.data, hora: a.hora, status: a.status });
      return ok(res, { ok: true });
    }
  }

  /* ---- RODADA 4: valor ao concluir ----
     Sugestão (orçamento aprovado > valor do horário > orçado no CRM > média do
     serviço). Só sugere: a pessoa confirma, troca ou deixa em branco. */
  if ((mm = pathname.match(new RegExp(`^/api/agendamentos/${UUID}/valor-sugerido$`))) && m === 'GET') {
    const s = await dados.valorSugerido(mm[1]);
    return s ? send(res, 200, s, { 'Cache-Control': 'no-store' }) : notFound(res);
  }
  // Painel do gestor: concluídos sem valor (o faturamento do CRM nasce zerado sem isto)
  if (pathname === '/api/valores/pendentes' && m === 'GET') {
    const dias = Math.min(365, Math.max(7, Number(searchParams.get('dias')) || 120));
    return send(res, 200, { itens: await dados.concluidosSemValor({ dias }), dias }, { 'Cache-Control': 'no-store' });
  }
  if ((mm = pathname.match(new RegExp(`^/api/agendamentos/${UUID}/valor$`))) && m === 'PUT') {
    const valor = dados.valorDeEntrada(typeof body.valor === 'number' ? body.valor : texto1(body.valor, 20));
    if (valor === null || !dados.valorValido(valor) || valor <= 0) {
      return bad(res, `Valor inválido: use só números, ex.: 350 ou 1.250,00 (até R$ ${dados.VALOR_MAXIMO.toLocaleString('pt-BR')}).`);
    }
    const a = await dados.obterAgendamento(mm[1]);
    if (!a) return notFound(res);
    if (a.status !== 'concluido') return send(res, 409, { erro: 'Só dá para preencher o valor de quem "veio e fechou".' });
    const r = await dados.preencherValor(a.id, valor);
    await dados.auditar(usuario.id, 'preencheu_valor', 'agendamentos', a.id, { de: r.antes, para: valor, cliente: a.cliente_nome, lead: r.lead_atualizado });
    return ok(res, { ok: true, valor, lead_atualizado: r.lead_atualizado });
  }
  /* Contagens baratas para o Início e o menu (HEAD + count, sem trazer linha):
     follow-up para todo mundo; concluídos sem valor e pendências antigas só
     para o gestor (é ele quem resolve). Uma chamada no lugar da lista inteira
     do follow-up a cada troca de tela. */
  if (pathname === '/api/contagens' && m === 'GET') {
    const [followup, semValor, antigas, entregues, espera, semConfirmacaoAmanha] = await Promise.all([
      dados.contarFollowup().catch(() => null),
      souGestor ? dados.contarConcluidosSemValor().catch(() => null) : null,
      souGestor ? dados.contarPendenciasAntigas().catch(() => null) : null,
      souGestor ? dados.entreguesNoPatioSemDesfecho().then((l) => l.length).catch(() => null) : null,
      dados.contarEspera ? dados.contarEspera().catch(() => null) : null,
      // amanhã (próximo dia útil) ainda sem confirmação: o chip do Início lembra de pedir
      dados.contarSemConfirmacao ? dados.contarSemConfirmacao(proximoDiaUtil(hoje())).catch(() => null) : null,
    ]);
    return send(res, 200, { followup, semValor, antigas, entregues, espera, semConfirmacao: semConfirmacaoAmanha, proximoDia: proximoDiaUtil(hoje()) }, { 'Cache-Control': 'no-store' });
  }
  /* ---- PÁTIO (16/10/2026): o banco abre a ordem no "Chegou"; aqui só leitura ----
     ?ids=<uuid,uuid…> (até 60) → { itens: { [agendamento_id]: resumo da ordem } } */
  if (pathname === '/api/patio/agendamentos' && m === 'GET') {
    const ids = idsDeAgendamento(searchParams.get('ids'));
    const itens = ids.length ? await dados.patioDosAgendamentos(ids).catch(() => null) : {};
    if (itens === null) return send(res, 200, { itens: {}, erro: 'Pátio indisponível agora.' }, { 'Cache-Control': 'no-store' });
    return send(res, 200, { itens }, { 'Cache-Control': 'no-store' });
  }
  /* ---- ORÇADOR (rodada 6): orçamento de cada horário e aprovados esperando horário (só leitura) ---- */
  if (pathname === '/api/orcamentos/agendamentos' && m === 'GET') {
    const ids = idsDeAgendamento(searchParams.get('ids'));
    const itens = ids.length && dados.orcamentosDosAgendamentos ? await dados.orcamentosDosAgendamentos(ids).catch(() => null) : {};
    if (itens === null) return send(res, 200, { itens: {}, erro: 'Orçador indisponível agora.' }, { 'Cache-Control': 'no-store' });
    return send(res, 200, { itens }, { 'Cache-Control': 'no-store' });
  }
  if (pathname === '/api/orcamentos/aprovados' && m === 'GET') {
    const itens = dados.orcamentosAprovadosSemHorario ? await dados.orcamentosAprovadosSemHorario({ limite: Number(searchParams.get('limite')) || 12 }).catch(() => null) : [];
    if (itens === null) return send(res, 200, { itens: [], erro: 'Orçador indisponível agora.' }, { 'Cache-Control': 'no-store' });
    return send(res, 200, { itens }, { 'Cache-Control': 'no-store' });
  }
  // Pátio ao vivo no Início: todos os carros dentro da oficina agora
  if (pathname === '/api/patio/agora' && m === 'GET') {
    const itens = dados.patioAgora ? await dados.patioAgora({ limite: Number(searchParams.get('limite')) || 12 }).catch(() => null) : [];
    if (itens === null) return send(res, 200, { itens: [], erro: 'Pátio indisponível agora.' }, { 'Cache-Control': 'no-store' });
    return send(res, 200, { itens }, { 'Cache-Control': 'no-store' });
  }
  // Pendências: entregue no Pátio e sem "Veio e fechou / Veio e não fechou" na Agenda
  if (pathname === '/api/patio/entregues' && m === 'GET') {
    return send(res, 200, await dados.entreguesNoPatioSemDesfecho().catch(() => []), { 'Cache-Control': 'no-store' });
  }
  // Pendências antigas: passou há mais de 7 dias sem desfecho (só lista; resolve pelos botões)
  if (pathname === '/api/pendencias-antigas' && m === 'GET') {
    return send(res, 200, await dados.pendenciasAntigas(), { 'Cache-Control': 'no-store' });
  }

  /* rodada 7 (C2): a entrada pronta no Pátio de um horário (ficha, cartão de quem já chegou). Sem dado pessoal na resposta. */
  if ((mm = pathname.match(new RegExp(`^/api/agendamentos/${UUID}/entrada-patio$`))) && m === 'GET') {
    const a = await dados.obterAgendamento(mm[1]);
    if (!a) return notFound(res);
    const e = await entradaDoPatioDe(a);
    return send(res, 200, { ...e, chegou: ['compareceu', 'em_atendimento', 'concluido', 'nao_fechou'].includes(a.status) || a.compareceu === true || a.compareceu === 1 }, { 'Cache-Control': 'no-store' });
  }

  // mudança rápida de status (botões do card)
  if ((mm = pathname.match(new RegExp(`^/api/agendamentos/${UUID}/status$`))) && m === 'PATCH') {
    const id = mm[1];
    if (!MAPA_STATUS[body.status]) return bad(res, 'Status inválido.');
    // Quem só marca presença aperta Compareceu ou Não veio — nada além disso.
    // (Fechar ou não a venda é desfecho comercial: fica com quem usa o Início.)
    if (soPresenca && !['compareceu', 'nao_veio', 'aguardando', 'confirmado'].includes(body.status)) {
      return send(res, 403, { erro: 'Seu acesso só permite marcar se o cliente veio ou não.' });
    }
    /* "Veio e fechou" com o VALOR do serviço (opcional): vai no MESMO update do
       status, e o gatilho do banco copia para leads.valor_pago — o faturamento
       do CRM deixa de nascer zerado. Vazio = fecha sem valor (não bloqueia). */
    let valor;
    if (body.valor !== undefined && body.valor !== null && body.valor !== '') {
      if (body.status !== 'concluido' || soPresenca) return bad(res, 'O valor só vai junto com "Veio e fechou".');
      valor = dados.valorDeEntrada(typeof body.valor === 'number' ? body.valor : texto1(body.valor, 20));
      if (!dados.valorValido(valor) || valor === null) return bad(res, `Valor inválido: use só números, ex.: 350 ou 1.250,00 (até R$ ${dados.VALOR_MAXIMO.toLocaleString('pt-BR')}).`);
    }
    const a = await dados.obterAgendamento(id);
    if (!a) return notFound(res);
    // Presença não mexe em quem JÁ tem desfecho comercial: um "Compareceu" aqui
    // desfaria o "Veio e fechou" do atendimento e reabriria a venda no CRM.
    // E só desfaz a PRÓPRIA chegada (compareceu → aguardando/confirmado).
    if (soPresenca) {
      const recusa = presencaPodeMarcar(a.status, body.status);
      if (recusa) return send(res, 403, { erro: recusa });
    }
    const { atualizado, avisoAusencia } = await mudarStatus({ antes: a, status: body.status, usuario, valor });
    /* rodada 5: "Chegou" abre a ordem no Pátio (gatilho do banco, na mesma transação) —
       devolve o nº da OS e o link na hora, para o recado "OS nº 123 aberta — Abrir". */
    let patio = null;
    if (['compareceu', 'em_atendimento'].includes(body.status) && atualizado && dados.patioDosAgendamentos) {
      patio = await dados.patioDosAgendamentos([a.id]).then((r) => r?.[a.id] || null).catch(() => null);
    }
    /* Desfez a chegada (ou virou falta/cancelado) e o Pátio já tinha aberto a ordem: o banco NÃO cancela a OS
       sozinho — um "Chegou" no cartão errado deixaria um carro-fantasma no quadro do mecânico. Devolve a OS
       para a tela avisar quem mexeu (cancelar a ordem é no Pátio). */
    let patioAberta = null;
    if (['compareceu', 'em_atendimento'].includes(a.status) && ['aguardando', 'confirmado', 'cancelado', 'nao_veio'].includes(body.status) && atualizado && dados.patioDosAgendamentos) {
      const os = await dados.patioDosAgendamentos([a.id]).then((r) => r?.[a.id] || null).catch(() => null);
      if (os && os.etapa !== 'entregue') patioAberta = os;
    }
    /* rodada 7: o "Chegou" já devolve a ENTRADA PRONTA do Pátio (?entrada=1&agendamento=&orcamento=) */
    let entrada = null;
    if (['compareceu', 'em_atendimento'].includes(body.status) && atualizado) entrada = await entradaDoPatioDe(atualizado).catch(() => null);
    // um horário vagou (não veio / cancelado): quem está na lista de espera serviria?
    let espera = null;
    if (['nao_veio', 'cancelado'].includes(body.status) && atualizado && dados.listarEspera && !soPresenca) {
      espera = await dados.listarEspera({ status: 'aberta', limite: 100 }).then((l) => dados.esperaQueCabe(l, a.data, a.servico).slice(0, 3)).catch(() => null);
    }
    return ok(res, { ...atualizado, aviso_ausencia: avisoAusencia, ...(patio ? { patio } : {}), ...(entrada ? { entrada } : {}), ...(patioAberta ? { patio_aberta: patioAberta } : {}), ...(espera?.length ? { espera } : {}) });
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

  /* ---- RODADA 5: HORÁRIOS LIVRES COMO SERVIÇO (é o que a IA do Atendimento usa) ----
     GET /api/horarios-livres/dia?data=AAAA-MM-DD&servico=<texto>&consultor_id=<uuid>&ignorar=<uuid>
       → { data, aberto, motivo, duracao_min, capacidade, janelas, consultores, horarios:[{hora, fim, livres, consultores_livres, consultores}], resumo }
     GET /api/horarios-livres/proximos?desde=&servico=&dias=7&consultor_id=
       → { desde, dias, duracao_min, capacidade, dias_livres:[{data, horarios:[...], total}], resumo }
     Mesmas regras da função SQL agenda_horarios_livres(p_dia, p_servico, p_consultor). */
  if (pathname === '/api/horarios-livres/dia' && m === 'GET') {
    const q = lerParametrosDeHorario(searchParams);
    if (q.dataInvalida || !q.data) return bad(res, 'Informe ?data=AAAA-MM-DD.');
    const dia = await dados.horariosLivresDoDia({ data: q.data, servico: q.servico, consultor_id: q.consultor_id, ignorar: q.ignorar });
    return send(res, 200, { ...dia, total: dia.horarios?.length || 0, proximo: dia.horarios?.[0]?.hora || null, resumo: resumoDoDia(dia) }, { 'Cache-Control': 'no-store' });
  }
  if (pathname === '/api/horarios-livres/proximos' && m === 'GET') {
    const q = lerParametrosDeHorario({ get: (k) => (k === 'data' ? searchParams.get('desde') : searchParams.get(k)) });
    if (q.dataInvalida) return bad(res, 'Período inválido: use desde=AAAA-MM-DD.');
    const r = await dados.horariosProximosDias({ desde: q.data, servico: q.servico, dias: q.dias, consultor_id: q.consultor_id,
      quantosDias: Math.min(14, Math.max(1, Number(searchParams.get('quantos')) || 5)) });
    return send(res, 200, { ...r, resumo: r.dias_livres.map((d) => resumoDoDia({ ...d, aberto: true, horarios: d.horarios.map((h) => ({ hora: h })) })).join(' · ') }, { 'Cache-Control': 'no-store' });
  }

  /* ---- RODADA 5: LISTA DE ESPERA (encaixe) ---- */
  if (pathname === '/api/espera' && m === 'GET') {
    const st = texto1(searchParams.get('status'), 10) || 'aberta';
    let lista = await dados.listarEspera({ status: ['aberta', 'agendada', 'cancelada', 'todas'].includes(st) ? st : 'aberta' });
    const d = dados.dataBanco(searchParams.get('data') || '');
    if (d) lista = dados.esperaQueCabe(lista, d, texto1(searchParams.get('servico'), 120) || null);
    return send(res, 200, lista, { 'Cache-Control': 'no-store' });
  }
  if (pathname === '/api/espera' && m === 'POST') {
    if (!dentroDoLimite(`espera:${usuario.id}`, 30, 60_000)) return send(res, 429, { erro: 'Muitas esperas seguidas. Espere um minuto.' });
    if (!texto1(body.cliente_nome, 120).trim()) return bad(res, 'Informe o nome do cliente.');
    if (!texto1(body.servico, 160).trim()) return bad(res, 'Informe o serviço.');
    if (!telefoneParecValido(body.telefone)) return bad(res, ERRO_TELEFONE);
    if (body.cliente_id && !dados.ehUuid(texto1(body.cliente_id, 40))) return bad(res, 'Identificador inválido.');
    for (const k of ['de', 'ate']) if (body[k] && !dados.dataBanco(body[k])) return bad(res, 'Data inválida.');
    const e = await dados.criarEspera({ ...body, criado_por: usuario.id });
    return send(res, 201, e);
  }
  /* rodada 6 (C1b): encaixe com horários livres REAIS — os melhores horários para essa pessoa da espera (serviço, datas, preferência) */
  if ((mm = pathname.match(new RegExp(`^/api/espera/${UUID}/horarios$`))) && m === 'GET') {
    if (!dentroDoLimite(`espera-horarios:${usuario.id}`, 60, 60_000)) return send(res, 429, { erro: 'Muitos pedidos seguidos. Espere um minuto.' });
    const e = await dados.obterEspera(mm[1]);
    if (!e) return notFound(res);
    if (e.status !== 'aberta') return send(res, 200, { itens: [], motivo: 'Essa pessoa já saiu da lista de espera.' }, { 'Cache-Control': 'no-store' });
    return send(res, 200, await dados.horariosDaEspera(e), { 'Cache-Control': 'no-store' });
  }
  if ((mm = pathname.match(new RegExp(`^/api/espera/${UUID}$`)))) {
    const atual = await dados.obterEspera(mm[1]);
    if (!atual) return notFound(res);
    if (m === 'PATCH') {
      if (body.telefone !== undefined && !telefoneParecValido(body.telefone)) return bad(res, ERRO_TELEFONE);
      if (body.agendamento_id && !dados.ehUuid(texto1(body.agendamento_id, 40))) return bad(res, 'Identificador inválido.');
      // dois encaixes do mesmo cliente (duas telas): o segundo não pode trocar o horário do primeiro em silêncio
      if (body.status === 'agendada' && atual.status === 'agendada' && atual.agendamento_id && body.agendamento_id && atual.agendamento_id !== body.agendamento_id) {
        return send(res, 409, { erro: 'Essa pessoa já foi encaixada em outro horário. Confira na Agenda antes de marcar de novo.' });
      }
      const statusAntes = atual.status, nomeAntes = atual.cliente_nome;
      const e = await dados.atualizarEspera(mm[1], body, usuario.id);
      if (body.status && body.status !== statusAntes) await dados.auditar(usuario.id, 'espera_' + body.status, 'ag_lista_espera', mm[1], { cliente: nomeAntes, agendamento: body.agendamento_id || null });
      return ok(res, e);
    }
    if (m === 'DELETE') {
      await dados.removerEspera(mm[1]);
      await dados.auditar(usuario.id, 'apagou_espera', 'ag_lista_espera', mm[1], { cliente: atual.cliente_nome });
      return ok(res, { ok: true });
    }
  }

  /* ---- RODADA 5: confirmação do cliente (link/WhatsApp) e o selo "confirmou" ----
     POST /api/agendamentos/:id/confirmacao → { link, texto, whatsapp } — a equipe manda o link; o cliente responde na página pública. */
  if ((mm = pathname.match(new RegExp(`^/api/agendamentos/${UUID}/confirmacao$`))) && m === 'POST') {
    const a = await dados.obterAgendamento(mm[1]);
    if (!a) return notFound(res);
    if (!['aguardando', 'confirmado'].includes(a.status)) return send(res, 409, { erro: 'Esse horário já teve desfecho — não há o que confirmar.' });
    const c = await dados.criarConfirmacao({ agendamento_id: a.id, canal: texto1(body.canal, 20) || 'whatsapp', criado_por: usuario.id });
    if (!c) return notFound(res);
    await dados.auditar(usuario.id, 'pediu_confirmacao', 'agendamentos', a.id, { cliente: a.cliente_nome, data: a.data, hora: a.hora, canal: c.canal });
    const link = `${baseDaRequisicao(req)}/confirmar/?t=${encodeURIComponent(c.token)}`;
    const primeiro = String(a.cliente_nome || '').trim().split(/\s+/)[0] || 'tudo bem';
    const quando = `${formatarDataBR(a.data)} às ${String(a.hora || '').slice(0, 5)}`;
    const texto = `Oi ${primeiro}! Aqui é da IndyCar 🏁 Seu horário de ${a.servico} está marcado para ${quando}. Confirma pra gente? É só tocar: ${link}`;
    const tel = dados.soDigitos(a.telefone);
    const whatsapp = tel.length >= 10 ? linkWhatsApp(tel, texto) : null;
    return send(res, 200, { link, texto, whatsapp, resposta: c.resposta, enviado_em: c.enviado_em }, { 'Cache-Control': 'no-store' });
  }

  /* ---- RODADA 5: avisar o cliente de uma REMARCAÇÃO pela fila do Comunicar ----
     POST /api/agendamentos/:id/avisar-remarcacao → { enfileirado, whatsapp, motivo }.
     Entra como mensagem avulsa pendente em posvenda_envios (o carteiro envia, com
     o intervalo e o opt-out dele). Se não der (sem telefone, cliente pediu para não
     receber, fila fora), devolve o link do WhatsApp com o texto pronto. */
  if ((mm = pathname.match(new RegExp(`^/api/agendamentos/${UUID}/avisar-remarcacao$`))) && m === 'POST') {
    const a = await dados.obterAgendamento(mm[1]);
    if (!a) return notFound(res);
    const tel = dados.soDigitos(a.telefone);
    if (tel.length < 10) return send(res, 200, { enfileirado: false, whatsapp: null, motivo: 'Este horário não tem telefone.' });
    const primeiro = String(a.cliente_nome || '').trim().split(/\s+/)[0] || 'tudo bem';
    const texto = `Oi ${primeiro}! Aqui é da IndyCar 🏁 Seu horário de ${a.servico} foi remarcado para ${formatarDataBR(a.data)} às ${String(a.hora || '').slice(0, 5)}. Se não ficar bom pra você, é só responder por aqui que a gente ajusta. Quem conhece, Indyca!`;
    const whatsapp = linkWhatsApp(tel, texto);
    const r = dados.enfileirarAvisoDeRemarcacao ? await dados.enfileirarAvisoDeRemarcacao(a, texto, usuario).catch((e) => ({ ok: false, motivo: e?.message })) : { ok: false, motivo: 'fila indisponível' };
    if (r.ok) await dados.auditar(usuario.id, 'avisou_remarcacao', 'agendamentos', a.id, { cliente: a.cliente_nome, data: a.data, hora: a.hora, via: 'comunicar' });
    return send(res, 200, { enfileirado: !!r.ok, whatsapp, motivo: r.ok ? null : (r.motivo || 'A fila do Comunicar não aceitou agora — abri o WhatsApp com o texto pronto.') }, { 'Cache-Control': 'no-store' });
  }

  /* ---- RODADA 6 (C1b): LEMBRETES ligados ao Comunicar -------------------------------------------
     GET  /api/agendamentos/:id/lembrete  → { situacao, envio, cfg }  (a verdade: na fila? enviado? respondeu? por que não sai?)
     POST /api/agendamentos/:id/lembrete  → coloca UM lembrete na fila do Comunicar agora ({reenviar:true} só com o aval da pessoa)
     GET  /api/lembretes?data=            → situação de todos os horários do dia (padrão: amanhã útil) + resumo
     POST /api/lembretes/lote {data}      → lembra todos os que podem receber e ainda não foram lembrados */
  if ((mm = pathname.match(new RegExp(`^/api/agendamentos/${UUID}/lembrete$`)))) {
    const a = await dados.obterAgendamento(mm[1]);
    if (!a) return notFound(res);
    if (m === 'GET') return send(res, 200, await dados.lembreteDoAgendamento(a), { 'Cache-Control': 'no-store' });
    if (m === 'POST') {
      if (!dentroDoLimite(`lembrete:${usuario.id}`, 40, 60_000)) return send(res, 429, { erro: 'Muitos lembretes seguidos. Espere um minuto.' });
      const r = await dados.enfileirarLembrete(a, usuario, { reenviar: body.reenviar === true, hojeIso: hoje() }).catch((e) => ({ ok: false, motivo: e?.message || 'A fila do Comunicar não aceitou agora.' }));
      if (r.ok && !r.repetido) await dados.auditar(usuario.id, r.reenvio ? 'reenviou_lembrete' : 'pediu_lembrete', 'agendamentos', a.id, { cliente: a.cliente_nome, data: a.data, hora: a.hora });
      return send(res, r.jaEnviado ? 409 : 200, { ...r, ...(await dados.lembreteDoAgendamento(a).catch(() => ({}))) }, { 'Cache-Control': 'no-store' });
    }
  }
  if (pathname === '/api/lembretes' && m === 'GET') {
    let d = searchParams.get('data');
    if (d && !dados.dataBanco(d)) return bad(res, 'Data inválida.');
    d = d ? dados.dataBanco(d) : proximoDiaUtil(hoje());
    const r = await dados.lembretesDoDia(d);
    return send(res, 200, { ...r, resumo: resumoDosLembretes(r.itens) }, { 'Cache-Control': 'no-store' });
  }
  if (pathname === '/api/lembretes/lote' && m === 'POST') {
    if (!dentroDoLimite(`lembrete-lote:${usuario.id}`, 6, 60_000)) return send(res, 429, { erro: 'Espere um minuto antes de lembrar o dia inteiro de novo.' });
    const d = dados.dataBanco(body.data || '');
    if (!d) return bad(res, 'Informe a data (AAAA-MM-DD).');
    if (d < hoje()) return bad(res, 'Esse dia já passou.');
    const dia = await dados.lembretesDoDia(d);
    const alvo = dia.itens.filter((i) => i.situacao.podeMandar && i.situacao.codigo !== 'enviado').slice(0, 60);
    const saida = { pedidos: 0, na_fila: 0, falhas: 0, pulados: dia.itens.length - alvo.length };
    for (const i of alvo) {
      const a = await dados.obterAgendamento(i.id);
      const r = a ? await dados.enfileirarLembrete(a, usuario, { hojeIso: hoje() }).catch(() => ({ ok: false })) : { ok: false };
      saida.pedidos++;
      if (r.ok) saida.na_fila++; else saida.falhas++;
    }
    await dados.auditar(usuario.id, 'lembrou_o_dia', 'agendamentos', null, { data: d, ...saida });
    return send(res, 200, saida, { 'Cache-Control': 'no-store' });
  }

  /* ---- RODADA 6 (C1b): QUADRO por consultor ----
     GET  /api/quadro?data=                → { data, lista, livres, lembretes } numa só ida (o Quadro abre mais rápido)
     POST /api/agendamentos/:id/mover {data, hora, consultor_id} → muda horário/consultor CONFERINDO de novo, no servidor,
          se a vaga ainda existe (duas pessoas arrastando ao mesmo tempo não fazem dois carros no mesmo horário). 409 se não cabe. */
  if (pathname === '/api/quadro' && m === 'GET') {
    const d = dados.dataBanco(searchParams.get('data') || '') || hoje();
    const [lista, livres, lemb] = await Promise.all([
      dados.listarAgendamentos({ data: d }),
      dados.horariosLivresDoDia({ data: d }).catch(() => null),
      dados.lembretesDoDia(d).catch(() => null),
    ]);
    const duracoes = await dados.duracoesDosAgendamentos(lista).catch(() => ({}));
    return send(res, 200, { data: d, lista, livres, duracoes, lembretes: lemb && { ...lemb, resumo: resumoDosLembretes(lemb.itens) } }, { 'Cache-Control': 'no-store' });
  }
  /* rodada 6 (C1c): a faixa de dias do Quadro (quantos horários e a lotação de cada dia) */
  if (pathname === '/api/quadro/semana' && m === 'GET') {
    const d = dados.dataBanco(searchParams.get('data') || '') || hoje();
    const n = Math.min(14, Math.max(1, Number(searchParams.get('dias')) || 7));
    return send(res, 200, { dias: await dados.semanaDoQuadroDados(d, n) }, { 'Cache-Control': 'no-store' });
  }
  /* rodada 6 (C1c): na hora de marcar — este cliente/carro já tem horário? já está no pátio? tem orçamento esperando? */
  if (pathname === '/api/contexto-cliente' && m === 'GET') {
    if (!dentroDoLimite(`ctx-cliente:${usuario.id}`, 120, 60_000)) return send(res, 429, { erro: 'Muitos pedidos seguidos. Espere um minuto.' });
    const ign = texto1(searchParams.get('ignorar'), 40);
    return send(res, 200, await dados.contextoDoClienteParaMarcar({ tel: texto1(searchParams.get('tel'), 24), placa: texto1(searchParams.get('placa'), 16), ignorar: dados.ehUuid(ign) ? ign : null }), { 'Cache-Control': 'no-store' });
  }
  if ((mm = pathname.match(new RegExp(`^/api/agendamentos/${UUID}/mover$`))) && m === 'POST') {
    if (!dentroDoLimite(`mover:${usuario.id}`, 60, 60_000)) return send(res, 429, { erro: 'Muitas trocas seguidas. Espere um minuto.' });
    const a = await dados.obterAgendamento(mm[1]);
    if (!a) return notFound(res);
    const data = dados.dataBanco(body.data || '');
    const hora = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.hora || '')) ? String(body.hora) : null;
    const cons = body.consultor_id ? texto1(body.consultor_id, 40) : null;
    if (!data || !hora) return bad(res, 'Informe data e hora.');
    if (cons && !dados.ehUuid(cons)) return bad(res, 'Consultor inválido.');
    if (!['aguardando', 'confirmado'].includes(a.status)) return send(res, 409, { erro: 'Só dá para mover quem ainda não chegou.' });
    const dia = await dados.horariosLivresDoDia({ data, servico: a.servico, consultor_id: cons, ignorar: a.id });
    const cabe = dia.aberto !== false && (dia.horarios || []).some((h) => h.hora === hora && (cons ? (h.consultores_livres || []).includes(cons) : (h.livres || 0) > 0));
    if (!cabe) return send(res, 409, { erro: 'Esse horário acabou de ser ocupado ou não cabe para esse consultor. Escolha outro.', codigo: 'horario_ocupado' });
    const antes = { data: a.data, hora: a.hora, consultor_id: a.consultor_id || null };
    const novo = await dados.atualizarAgendamento(a.id, { ...a, data, hora, consultor_id: cons });
    if (!novo) return notFound(res);
    await dados.auditar(usuario.id, 'moveu_no_quadro', 'agendamentos', a.id, { cliente: a.cliente_nome, de: antes, para: { data, hora, consultor_id: cons } });
    return send(res, 200, novo);
  }

  /* ---- RODADA 5: ficha 360 (rpc cliente_360 da base) e aniversários ---- */
  if (pathname === '/api/clientes/360' && m === 'GET') {
    const tel = dados.soDigitos(texto1(searchParams.get('tel'), 20));
    if (tel.length < 10) return bad(res, 'Informe ?tel= com DDD.');
    try {
      return send(res, 200, await dados.cliente360(tel), { 'Cache-Control': 'no-store' });
    } catch (e) {
      if (e?.status === 400 && !e?.name) return bad(res, e.message);
      // a rpc pode recusar (42501) ou não existir ainda: a ficha de sempre continua
      return send(res, 200, { indisponivel: true, erro: 'A ficha completa não está disponível agora.' }, { 'Cache-Control': 'no-store' });
    }
  }
  // resumo das confirmações pelo link (gestor; aba CRM)
  if (pathname === '/api/confirmacoes/resumo' && m === 'GET') {
    const dias = Math.min(365, Math.max(7, Number(searchParams.get('dias')) || 30));
    return send(res, 200, await dados.resumoDasConfirmacoes(dias), { 'Cache-Control': 'no-store' });
  }
  if (pathname === '/api/aniversarios' && m === 'GET') {
    const dias = Math.min(31, Math.max(0, Number(searchParams.get('dias')) || 7));
    return send(res, 200, { dias, itens: await dados.aniversariosProximos(dias) }, { 'Cache-Control': 'private, max-age=300' });
  }

  // ---- "✨ Sugerir horário": janelas livres calculadas aqui (sem IA, sem outro domínio)
  if (pathname === '/api/horarios-livres' && m === 'GET') {
    const data = searchParams.get('data');
    if (data && !dados.dataBanco(data)) return bad(res, 'Data inválida.');
    return send(res, 200, await dados.sugerirHorarios({
      data: data || undefined,
      consultor_id: dados.ehUuid(searchParams.get('consultor_id') || '') ? searchParams.get('consultor_id') : undefined,
      ignorar: dados.ehUuid(searchParams.get('ignorar') || '') ? searchParams.get('ignorar') : undefined,
    }), { 'Cache-Control': 'no-store' });
  }

  // ---- busca global (Ctrl+K): agendamentos + clientes
  if (pathname === '/api/busca' && m === 'GET') {
    const q = texto1(searchParams.get('q'), 80).trim();
    // rodada 5: a lista de espera entra na busca (quem está esperando também é "gente da oficina")
    const [r, espera] = await Promise.all([dados.buscaGlobal(q), dados.buscarEspera ? dados.buscarEspera(q).catch(() => []) : []]);
    return ok(res, { ...r, espera });
  }

  // ---- clientes
  if (pathname === '/api/clientes' && m === 'GET')
    return ok(res, await dados.listarClientes(texto1(searchParams.get('q'), 80).trim() || undefined));
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
        if (body.nascimento !== undefined) dados.esquecerAniversarios?.();
        return c ? ok(res, c) : notFound(res);
      } catch (e) { if (/Aniversário inválido/.test(e?.message)) return bad(res, e.message); throw e; }
    }
    if (m === 'DELETE') {
      const c = await dados.obterCliente(id);
      if (!c) return notFound(res);
      await dados.removerCliente(id);
      await dados.auditar(usuario.id, 'apagou_cliente', 'clientes', id, { nome: c.nome });
      return ok(res, { ok: true });
    }
  }

  // ---- consultores (equipe)
  if (pathname === '/api/consultores' && m === 'GET')
    return ok(res, await dados.listarConsultores());
  // carga do dia por consultor (Equipe, modal e "Minha agenda")
  if (pathname === '/api/consultores/carga' && m === 'GET') {
    const data = searchParams.get('data');
    if (data && !dados.dataBanco(data)) return bad(res, 'Data inválida.');
    const { linhas, ...carga } = await dados.cargaPorConsultor(data || hoje());
    return send(res, 200, carga, { 'Cache-Control': 'no-store' });
  }
  // consultor sugerido para data/hora: o de menor carga e livre naquela meia hora (só sugere)
  if (pathname === '/api/consultores/sugerir' && m === 'GET') {
    const data = searchParams.get('data'), hora = searchParams.get('hora');
    if (!dados.dataBanco(data)) return bad(res, 'Data inválida.');
    if (hora && !dados.horaBanco(hora)) return bad(res, 'Hora inválida.');
    return send(res, 200, await dados.consultorSugerido({ data, hora,
      ignorar: dados.ehUuid(searchParams.get('ignorar') || '') ? searchParams.get('ignorar') : undefined }),
      { 'Cache-Control': 'no-store' });
  }
  /* RODADA 4 — consultor ligado ao login com UM clique: para cada consultor sem
     login, o login que provavelmente é a mesma pessoa (nomes sem acento e sem
     palavras de cargo; empate não sugere). Só sugere; quem liga é o gestor. */
  if (pathname === '/api/consultores/sugestoes-login' && m === 'GET') {
    const [consultores, equipe] = await Promise.all([dados.listarConsultores(), dados.listarEquipe(null)]);
    const usados = new Set(consultores.map((c) => c.perfil_id).filter(Boolean));
    const ativos = equipe.filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome, papel: p.papel, ativo: true }));
    const sugestoes = consultores.filter((c) => !c.perfil_id)
      .map((c) => ({ consultor_id: c.id, consultor: c.nome, ...dados.sugerirLoginDoConsultor(c, ativos, usados) }))
      .filter((s) => s.perfil_id);
    return send(res, 200, sugestoes, { 'Cache-Control': 'no-store' });
  }
  /* Distribui os horários SEM consultor de um dia (menor carga primeiro, sem
     dois carros do mesmo consultor na mesma meia hora). Gestor. */
  if (pathname === '/api/consultores/distribuir' && m === 'POST') {
    const data = dados.dataBanco(texto1(body.data, 10));
    if (!data) return bad(res, 'Data inválida.');
    const [consultores, ags] = await Promise.all([dados.listarConsultores(), dados.agendamentosVivosDoDia(data)]);
    const plano = dados.distribuirSemConsultor({ consultores, agendamentos: ags });
    const semConsultorAntes = ags.filter((x) => !x.consultor_id).length;
    const feitos = [];
    for (const p of plano) {
      try { await dados.atualizarAgendamento(p.id, { consultor_id: p.consultor_id }); feitos.push(p); }
      catch (e) { console.warn('Distribuir consultor:', e?.message || e); }
    }
    if (feitos.length) await dados.auditar(usuario.id, 'distribuiu_consultores', 'agendamentos', null, { data, total: feitos.length });
    const sobra = semConsultorAntes - feitos.length;
    return ok(res, { ok: true, data, atribuidos: feitos.length, sem_vaga: Math.max(0, sobra), itens: feitos });
  }
  if (pathname === '/api/consultores' && m === 'POST') {
    const nome = texto1(body.nome, 80).trim();
    if (!nome) return bad(res, 'Informe o nome.');
    if (body.perfil_id && !dados.ehUuid(texto1(body.perfil_id, 40))) return bad(res, 'Login inválido.');
    if (!telefoneParecValido(body.telefone)) return bad(res, ERRO_TELEFONE);
    const c = await dados.criarConsultor({ ...body, nome });
    dados.esquecerBaseDosHorarios?.();
    await dados.auditar(usuario.id, 'cadastrou_consultor', 'consultores', c?.id, { nome, perfil_id: body.perfil_id || null });
    return ok(res, c);
  }
  if ((mm = pathname.match(new RegExp(`^/api/consultores/${UUID}$`)))) {
    const id = mm[1];
    if (m === 'PUT') {
      if (body.nome !== undefined && !texto1(body.nome, 80).trim()) return bad(res, 'Informe o nome.');
      if (body.perfil_id && !dados.ehUuid(texto1(body.perfil_id, 40))) return bad(res, 'Login inválido.');
      if (body.telefone !== undefined && !telefoneParecValido(body.telefone)) return bad(res, ERRO_TELEFONE);
      const c = await dados.atualizarConsultor(id, body);
      dados.esquecerBaseDosHorarios?.();
      if (c && body.perfil_id !== undefined) await dados.auditar(usuario.id, 'ligou_consultor_login', 'consultores', id, { perfil_id: body.perfil_id || null });
      return c ? ok(res, c) : notFound(res);
    }
    if (m === 'DELETE') {
      await dados.removerConsultor(id);
      dados.esquecerBaseDosHorarios?.();
      await dados.auditar(usuario.id, 'apagou_consultor', 'consultores', id, null);
      return ok(res, { ok: true });
    }
  }

  // ---- serviços (Arsenal)
  if (pathname === '/api/servicos' && m === 'GET') {
    const todos = !!searchParams.get('todos');
    return ok(res, await lembrar('servicos:' + todos, 60_000, () => dados.listarServicos(todos)));
  }
  if (pathname === '/api/servicos' && m === 'POST') {
    if (!body.nome) return bad(res, 'Informe o nome do serviço.');
    const novo = await dados.criarServico(body);
    dados.esquecerBaseDosHorarios?.();   // DEPOIS de gravar: esquecer antes deixava um pedido no meio guardar a base velha por 60 s
    return ok(res, novo);
  }
  if ((mm = pathname.match(new RegExp(`^/api/servicos/${UUID}$`)))) {
    const id = mm[1];
    if (m === 'PUT') {
      const s = await dados.atualizarServico(id, body);
      dados.esquecerBaseDosHorarios?.();
      return s ? ok(res, s) : notFound(res);
    }
    if (m === 'DELETE') { await dados.removerServico(id); dados.esquecerBaseDosHorarios?.(); return ok(res, { ok: true }); }
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
    await dados.auditar(usuario.id, 'mudou_configuracao', 'agenda_integracoes', null, { campos: Object.keys(body).filter((k) => k !== 'ics_token') });
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
    await dados.auditar(usuario.id, 'exportou_csv', 'agendamentos', null, { linhas: lista.length });
    const rows = lista.map((a) => ({
      id: a.id, cliente: a.cliente_nome, telefone: a.telefone, veiculo: a.veiculo, placa: a.placa,
      servico: a.servico, data: a.data, hora: a.hora, status: a.status, confirmado: a.confirmado ? 'sim' : 'não', valor: valorParaPlanilha(a.valor),
      origem: a.origem, consultor: a.consultor_nome, criado_em: a.created_at,
    }));
    return send(res, 200, gerarCSV(['id','cliente','telefone','veiculo','placa','servico','data','hora','status','confirmado','valor','origem','consultor','criado_em'], rows),
      { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="agendamentos.csv"' });
  }
  if (pathname === '/api/export/clientes.csv' && m === 'GET') {
    const lista = await dados.listarClientes();
    await dados.auditar(usuario.id, 'exportou_csv', 'clientes', null, { linhas: lista.length });
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
    await dados.auditar(usuario.id, 'mudou_configuracao', 'agenda_whatsapp_config', null,
      { campos: Object.keys(body).map((k) => (k === 'access_token' ? 'access_token(•••)' : k)) });
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
    if (ag && !dados.ehUuid(ag)) return bad(res, 'Agendamento inválido.');
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
    await dados.auditar(usuario.id, 'mudou_configuracao', 'agenda_ia_config', null,
      { campos: Object.keys(body).map((k) => (/key/.test(k) ? k + '(•••)' : k)) });
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
const _estaticos = new Map();   // caminho -> { chave, bruto, etag, comp:{br,gzip} }
const TEXTUAIS = new Set(['.html', '.css', '.js', '.json', '.svg']);
async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const filePath = normalize(join(PUBLIC, rel));
  // anti path-traversal: compara COM o separador, senão uma pasta irmã
  // chamada "publicX" passaria no teste (e o %2e%2e escapa do new URL)
  if (filePath !== PUBLIC && !filePath.startsWith(PUBLIC + sep)) return notFound(res);
  try {
    /* RODADA 4 (velocidade): ETag + 304 e compressão guardada na memória.
       HTML/JS/CSS continuam "no-cache" (sempre conferem a versão), mas a
       conferência agora custa um 304 vazio em vez do arquivo inteiro de novo;
       ícones e logo ficam um dia no cache do navegador. */
    let info = await stat(filePath), alvo = filePath;
    // pasta (ex.: /confirmar/) → o index.html dela
    if (info.isDirectory()) { alvo = join(filePath, 'index.html'); info = await stat(alvo); }
    if (!info.isFile()) throw new Error('não é arquivo');
    return servirArquivo(req, res, alvo, info);
  } catch {
    /* rodada 6: arquivo com extensão que não existe (/rodada9.js, /foto.png) é 404 — antes devolvia o index.html com 200 e o navegador tentava rodar HTML como script */
    if (/\.(?:js|mjs|css|map|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|json|txt|xml)$/i.test(pathname)) return notFound(res);
    // SPA fallback
    try {
      const html = await readFile(join(PUBLIC, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch { notFound(res); }
  }
}
function servirArquivo(req, res, filePath, info) {
    const ext = extname(filePath);
    const chave = `${filePath}|${info.mtimeMs}|${info.size}`;
    let item = _estaticos.get(filePath);
    if (!item || item.chave !== chave) {
      const bruto = readFileSync(filePath);
      item = { chave, bruto, etag: `"${createHash('sha1').update(bruto).digest('base64url').slice(0, 20)}"`, comp: {} };
      _estaticos.set(filePath, item);
    }
    const cabecalho = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ['.png', '.ico', '.svg'].includes(ext) ? 'public, max-age=86400' : 'no-cache, must-revalidate',
      ETag: item.etag,
      Vary: 'Accept-Encoding',
    };
    // comparação fraca: o proxy do Render devolve W/"…" quando ele mesmo comprime
    if (String(req.headers['if-none-match'] || '').split(/\s*,\s*/).map((e) => e.replace(/^W\//, '')).includes(item.etag)) {
      res.writeHead(304, cabecalho);
      return res.end();
    }
    const cod = TEXTUAIS.has(ext) && item.bruto.length >= MIN_COMPRIMIR ? codificacaoAceita(req) : null;
    if (cod) {
      item.comp[cod] ||= cod === 'br'
        ? zlib.brotliCompressSync(item.bruto, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } })
        : zlib.gzipSync(item.bruto, { level: 9 });
      res.writeHead(200, { ...cabecalho, 'Content-Encoding': cod });
      return res.end(req.method === 'HEAD' ? undefined : item.comp[cod]);
    }
    res.writeHead(200, cabecalho);
    res.end(req.method === 'HEAD' ? undefined : item.bruto);
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
  // jsdelivr: o service worker guarda a biblioteca do login (versão fixa) para a casca abrir sem rede
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdn.jsdelivr.net",
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
  // HTTPS sempre (o Render serve só HTTPS; o navegador passa a recusar http por 1 ano)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

/* Limite por IP em toda a API (além do limite por pessoa nas rotas caras):
   300 pedidos por minuto é muito acima do uso normal de uma tela aberta. */
const USO_IP = new Map();
function ipDaRequisicao(req) {
  // atrás do proxy do Render o IP do cliente vem no X-Forwarded-For (o primeiro)
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket?.remoteAddress || 'desconhecido';
}
function ipDentroDoLimite(ip, teto = 300, janelaMs = 60_000) {
  const agora = Date.now();
  const atual = USO_IP.get(ip);
  if (!atual || atual.zeraEm <= agora) {
    if (USO_IP.size > 2000) USO_IP.clear();
    USO_IP.set(ip, { qtd: 1, zeraEm: agora + janelaMs });
    return true;
  }
  return ++atual.qtd <= teto;
}

/* ---------------------------------------------------------------------------
   HANDLER (rodada 5 — preparação da IndyCar Central): toda requisição passa por
   aqui. Exportado para a Central montar a Agenda sob um prefixo (/agenda/): ela
   reescreve req.url sem o prefixo e põe req.prefixo = '/agenda' — o que a tela
   precisa é relativo e o que o servidor monta (link de confirmação) usa o
   prefixo. Rodando sozinho (node server.js), req.prefixo não existe e nada muda.
   --------------------------------------------------------------------------- */
async function handler(req, res) {
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
    if (url.pathname.startsWith('/api/')) {
      /* CORS: só os domínios do ecossistema IndyCar (regras.js). Pedido de outro
         site é recusado ANTES de qualquer coisa — com ou sem token. */
      const origem = req.headers.origin;
      if (!origemPermitida(origem, req.headers.host)) return send(res, 403, { erro: 'Origem não permitida.' });
      if (origem) {
        res.setHeader('Access-Control-Allow-Origin', origem);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Max-Age', '600');
      }
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      if (!ipDentroDoLimite(ipDaRequisicao(req))) {
        return send(res, 429, { erro: 'Muitos pedidos deste aparelho. Espere um minuto.' }, { 'Retry-After': '60' });
      }
      return await api(req, res, url);
    }
    return await serveStatic(req, res, url.pathname);
  } catch (e) {
    // ErroHttp (413, 400 de JSON…) sai com o próprio código e o recado em
    // português; erro interno (banco, rede, bug) vira genérico com o código da
    // requisição — o detalhe fica SÓ no log (regras.js › mensagemSegura).
    const rid = res.getHeader('X-Request-Id') || '';
    const { status, erro } = mensagemSegura(e, rid);
    if (status >= 500) console.error(`[${rid}]`, e);
    else if (e?.name === 'ErroSupabase') console.warn(`[${rid}]`, e?.message || e);
    if (res.headersSent) { try { res.end(); } catch { /* conexão já foi */ } return; }
    send(res, status, { erro });
  }
}

const server = http.createServer(handler);
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

/* Automações (tarefas "Confirmar com o cliente" às 16h, "Reagendar" quando
   falta, notificação de atraso de 30 min) — automacoes.js. Rodam a cada 5 min
   SÓ no servidor de produção (RENDER=true) ou com AUTOMACOES=1: um servidor
   local de teste nunca cria tarefa no banco de verdade. */
const AUTOMACOES_LIGADAS = process.env.AUTOMACOES === '1' || (!!process.env.RENDER && process.env.AUTOMACOES !== '0');
let _automacaoRodando = false, _automacaoTimer = null;
async function cicloDeAutomacoes() {
  if (!AUTOMACOES_LIGADAS || _automacaoRodando) return;
  _automacaoRodando = true;
  try { await rodarAutomacoes({ dados }); }
  catch (e) { console.error('Automações:', e?.message || e); }
  finally { _automacaoRodando = false; }
}
/** Pede um ciclo daqui a pouco (ex.: alguém acabou de marcar "Não veio"). */
function agendarAutomacoes(ms = 2000) {
  if (!AUTOMACOES_LIGADAS) return;
  clearTimeout(_automacaoTimer);
  _automacaoTimer = setTimeout(cicloDeAutomacoes, ms);
  _automacaoTimer.unref?.();
}

/* Roda como programa (node server.js) ou importado pelos testes? Só o programa
   liga timers e abre a porta. */
const EH_PRINCIPAL = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/* Os timers só nascem em iniciar(): importado pelos testes (ou pela Central
   antes de iniciar) o módulo não dispara nada. Uma vez só. */
const TIMERS = [];
function ligarTimers() {
  if (TIMERS.length) return;
  TIMERS.push(
    setInterval(() => importarAgendamentosCW().then(invalidarCache).catch(aviso('Importação CodeWords')), IMPORT_MIN * 60 * 1000),
    setTimeout(() => importarAgendamentosCW().then(invalidarCache).catch(aviso('Importação CodeWords')), 12 * 1000),
    setInterval(cicloDeAutomacoes, 5 * 60 * 1000),
    setTimeout(cicloDeAutomacoes, 45 * 1000),
  );
  for (const t of TIMERS) t.unref?.();
}

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

/* O espelho local → cloud foi REMOVIDO. Os dois lados usam o MESMO Supabase
   (nada a espelhar) e, desde que o login entrou, o POST sem token levava 401
   em silêncio — só martelava o cloud a cada 10 minutos sem efeito nenhum. */

// ---------------------------------------------------------------------------
// Subida
// ---------------------------------------------------------------------------
/**
 * Prepara o app (config de IA pelo ambiente, token do ICS) e liga os timers
 * (importação do CodeWords, automações). A Central chama `iniciar({ ouvir:false })`
 * para usar só o handler no servidor dela; sozinho, abre a porta.
 */
async function iniciar({ ouvir = true, porta = PORT } = {}) {
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
  ligarTimers();
  if (!ouvir) return { handler, server, desligar };

  await new Promise((ok) => server.listen(porta, () => {
    console.log(`\n  🏁 IndyCar Agendamentos rodando em http://localhost:${porta}`);
    console.log('  Banco: Supabase (PostgREST)\n');
    ok();
  }));
  return { handler, server, desligar };
}

if (EH_PRINCIPAL) {
  process.on('SIGTERM', () => desligar('SIGTERM'));
  process.on('SIGINT', () => desligar('SIGINT'));
  iniciar();
}

/* ---- só para os testes (tests/servidor.test.mjs): banco e porteiro de mentira ---- */
export function _injetar({ dados: d, usuarioLogado: u } = {}) {
  if (d) dados = d;
  if (u) usuarioLogado = u;
  esquecerLogins();
  USO.clear(); USO_IP.clear();
}
export { server, handler, iniciar, VERSAO };
