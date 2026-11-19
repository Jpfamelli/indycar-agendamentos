// ============================================================================
// Servidor de MENTIRA para mexer na tela sem login e sem dado real.
//
//   node scripts/mock-server.mjs            → http://localhost:3411
//   http://localhost:3411/?vazio=1          → sem dados (estados vazios / modo demonstração)
//   http://localhost:3411/?saude=ok         → vigia sem problema (faixa escondida)
//
// Serve a pasta public/ de verdade (o mesmo index.html, app.js e styles.css
// que vão para produção) e responde /api/* com números inventados, guardados
// na memória. A única coisa trocada no HTML é a biblioteca do Supabase, que
// vira um dublê "já logado". NUNCA é usado em produção: o Render sobe o
// server.js. A matemática (CPA, ROAS, CTR…) vem do metricas.js REAL.
// ============================================================================
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const M = require('../metricas.js');
const A = require('../atribuicao.js');
const { coorte } = require('./coorte-demo.cjs');
const { periodoAnterior } = require('../painel.js');
const R = require('../resultados.js');
const C = require('../conexoes.js');
const LD = require('./leads-demo.cjs');
const L = require('../leads.js');
let SEM_CHAVES = true;   // rodada 5: ?chaves=1 simula chaves coladas (faixa de demonstração some)
let FILA = [];           // rodada 5: mensagens que o painel pôs na fila do Comunicar
let LEITURAS = [];

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT || 3411);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

let VAZIO = false;
// Rodada 4: ?acordando=N → as próximas N chamadas de /api respondem 503 como o Render acordando.
let ACORDANDO = 0;
let SAUDE_OK = false;
let PAPEL = 'admin', LOGADO = true, TROCOU = false;
let META = null;
const E = require('../equipe.js');
const { RESP } = require('./coorte-demo.cjs');
const NOMES_RESP = new Map([[RESP[0], { nome: 'Ana Souza', ativo: true }], [RESP[1], { nome: 'Beto Lima', ativo: true }], [RESP[2], { nome: 'Carla Dias', ativo: false }]]);
const PERFIS_MOCK = {
  admin: { papel: 'admin', apps: ['atendimento', 'crm', 'agenda', 'comunicar', 'orcador', 'ads'], nome: 'João Dono', cargo: 'Dono' },
  gestor: { papel: 'gestor', apps: ['crm', 'ads'], nome: 'Gê Gestora', cargo: 'Marketing' },
  atendente: { papel: 'atendente', apps: ['atendimento', 'crm', 'ads'], nome: 'Ana Souza', cargo: 'Consultora' },
  agenda: { papel: 'agenda', apps: ['agenda'], nome: 'Franklin', cargo: 'Recepção' },
  trocar: { papel: 'gestor', apps: ['ads'], nome: 'Novo Gestor', precisa_trocar_senha: true },
  mfa: { papel: 'admin', apps: ['ads'], nome: 'Admin Seguro' },
};
function euMock(token) {
  if (PAPEL === 'desativado') return null;
  const base = PERFIS_MOCK[PAPEL] || PERFIS_MOCK.admin;
  return { id: '99999999-9999-4999-8999-999999999999', email: 'dono@indycartaubate.com', avatar_cor: '#3b82f6', telefone: '12999990000',
    preferencias: {}, ...base, precisa_trocar_senha: base.precisa_trocar_senha === true && !TROCOU, mfa: PAPEL === 'mfa', aal: String(token).endsWith('-aal2') ? 'aal2' : 'aal1' };
}

const iso = d => d.toISOString().slice(0, 10);
const ruido = s => { const x = Math.sin(s * 12.9898) * 43758.5453; return x - Math.floor(x); };

const CAMPANHAS = [
  { plat: 'meta',   id: 'm1', nome: '[Meta] Revisão + Troca de Óleo — Taubaté', base: 85, cvr: 0.018, ticket: 320 },
  { plat: 'meta',   id: 'm2', nome: '[Meta] Remarketing — Clientes 90 dias',    base: 35, cvr: 0.038, ticket: 480 },
  { plat: 'meta',   id: 'm3', nome: '[Meta] Suspensão e Alinhamento',           base: 60, cvr: 0.009, ticket: 640 },
  { plat: 'google', id: 'g1', nome: '[Search] oficina mecânica perto de mim',   base: 95, cvr: 0.028, ticket: 410 },
  { plat: 'google', id: 'g2', nome: '[Search] troca de óleo taubaté',           base: 45, cvr: 0.040, ticket: 290 },
];
const CRIATIVOS = ['Vídeo — Depoimento cliente', 'Estático — Antes e depois', 'Carrossel — Tabela de preços'];

/* Linhas diárias de campanha e de criativo para uma janela (inclusiva). */
function linhas(de, ate, nivel = 'campanha') {
  if (VAZIO) return [];
  const saida = [];
  for (let d = new Date(`${de}T00:00:00Z`); iso(d) <= ate; d = new Date(d.getTime() + 86400000)) {
    const data = iso(d), dia = Math.round(d.getTime() / 86400000);
    CAMPANHAS.forEach((c, ci) => {
      const gasto = +(c.base * (0.75 + ruido(dia * 7 + ci * 31) * 0.5)).toFixed(2);
      const impressoes = Math.round((gasto / (22 + ruido(dia + ci) * 26)) * 1000);
      const cliques = Math.max(1, Math.round(impressoes * ((0.9 + ruido(dia * 3 + ci) * 2.2) / 100)));
      const penal = c.id === 'm3' ? 0.25 : 1;
      const conversoes = Math.round(cliques * c.cvr * penal * (0.7 + ruido(dia * 11 + ci) * 0.6));
      const receita = +(conversoes * c.ticket * (0.85 + ruido(dia * 5 + ci) * 0.3)).toFixed(2);
      const alcance = c.plat === 'meta' ? Math.round(impressoes / (1.4 + ruido(dia + ci * 3) * 1.6)) : 0;
      const comum = { plataforma: c.plat, data, campanha_ext: c.id, campanha_nome: c.nome };
      if (nivel === 'campanha') {
        saida.push({ ...comum, nivel, entidade_ext: c.id, entidade_nome: c.nome, impressoes, alcance,
          frequencia: alcance ? impressoes / alcance : 0, cliques, gasto, conversoes, valor_conversao: receita });
      } else {
        CRIATIVOS.forEach((nome, ai) => {
          const f = [0.5, 0.3, 0.2][ai], impA = Math.round(impressoes * f);
          const alcA = alcance ? Math.round(impA / (ai === 0 ? 3.6 : 1.7)) : 0;
          saida.push({ ...comum, nivel, entidade_ext: `${c.id}-ad${ai}`, entidade_nome: nome, impressoes: impA, alcance: alcA,
            frequencia: alcA ? impA / alcA : 0, cliques: Math.round(cliques * f), gasto: +(gasto * f).toFixed(2),
            conversoes: Math.round(conversoes * f), valor_conversao: +(receita * f).toFixed(2) });
        });
      }
    });
  }
  return saida;
}

function periodo(q) {
  if (q.get('de') && q.get('ate')) return { de: q.get('de'), ate: q.get('ate') };
  const dias = Math.min(365, Math.max(1, parseInt(q.get('dias') || '7', 10) || 7));
  const fim = new Date(Date.now() - 86400000);
  return { de: iso(new Date(fim.getTime() - (dias - 1) * 86400000)), ate: iso(fim) };
}
const agrupar = (ls, f) => { const m = new Map(); for (const l of ls) { const k = f(l); if (!m.has(k)) m.set(k, []); m.get(k).push(l); } return m; };

let CONFIG = {
  cpa_alvo: 90, roas_alvo: 3, orcamento_mensal: 9000, ticket_medio: null, margem_pct: 100,
  whatsapp_destinos: [], relatorio_ativo: false, relatorio_hora: 8, alertas_ativos: true, alertas_intervalo_min: 60,
};
let REGRAS = [
  { id: '11111111-1111-4111-8111-111111111111', nome: 'CPA acima do teto', ativa: true, plataforma: null, nivel: 'campanha', metrica: 'cpa', operador: '>', valor: 120, janela_dias: 3, min_gasto: 150, min_conversoes: 0, min_impressoes: 0, severidade: 'critico', cooldown_horas: 24, mensagem: null },
  { id: '22222222-2222-4222-8222-222222222222', nome: 'Criativo saturado', ativa: true, plataforma: 'meta', nivel: 'anuncio', metrica: 'frequencia', operador: '>', valor: 3.5, janela_dias: 7, min_gasto: 80, min_conversoes: 0, min_impressoes: 2000, severidade: 'alerta', cooldown_horas: 72, mensagem: '{entidade} com frequência {valor} em {janela} dias — hora de trocar o criativo.' },
  { id: '33333333-3333-4333-8333-333333333333', nome: 'CTR baixo (<1%)', ativa: false, plataforma: null, nivel: 'campanha', metrica: 'ctr', operador: '<', valor: 1, janela_dias: 7, min_gasto: 100, min_conversoes: 0, min_impressoes: 5000, severidade: 'info', cooldown_horas: 48, mensagem: null },
];
const agoraMenos = h => new Date(Date.now() - h * 3600000).toISOString();
let ALERTAS = [
  { id: 'a1', regra_nome: 'CPA acima do teto', severidade: 'critico', mensagem: 'CPA acima do teto: [Meta] Suspensão e Alinhamento está com CPA em R$ 212,40 (limite R$ 120,00).', criado_em: agoraMenos(3), enviado_em: null, lido_em: null },
  { id: 'a3', regra_nome: 'Do anúncio à oficina', severidade: 'alerta', nivel: 'conta', plataforma: 'meta', entidade_ext: 'ciclo:orc_quente', entidade_nome: 'Do anúncio à oficina', mensagem: '2 cliente(s) abriram o orçamento e não responderam (R$ 1.240,00). É a hora de ligar. Quem: Marcos (R$ 640,00), Paula (R$ 600,00).', criado_em: agoraMenos(1), enviado_em: null, lido_em: null },
  { id: 'a2', regra_nome: 'Criativo saturado', severidade: 'alerta', mensagem: 'Vídeo — Depoimento cliente (em [Meta] Revisão + Troca de Óleo — Taubaté) com frequência 4,12 em 7 dias — hora de trocar o criativo.', criado_em: agoraMenos(26), enviado_em: null, lido_em: agoraMenos(20) },
];

const NOMES_LEAD = ['Marcos Silva', 'Paula Mendes', 'Roberto Alves', 'Camila Duarte', 'Tiago Prado', 'Fernanda Lima', 'Lucas Barros', 'Juliana Rocha'];
const NL = String.fromCharCode(10);
function enfileirarMock(telefone, chave) {
  const id = 'env-' + (FILA.length + 1);
  FILA.unshift({ id, telefone, status: 'pendente', erro: null, enviar_em: new Date().toISOString(), enviado_em: null, created_at: new Date().toISOString(), tentativas: 0, chave: chave + ':' + telefone });
  return id;
}
function situacaoFila() {
  const por = { pendente: 0, enviado: 0, falhou: 0, cancelado: 0, pulado: 0 };
  for (const e of FILA) if (e.status in por) por[e.status]++;
  return { por_status: por, ultimo_enviado_em: FILA.find(e => e.status === 'enviado')?.enviado_em || null, ultima_falha: null, recentes: FILA.slice(0, 20) };
}
function textoRelatorio(ref) {
  return ['📊 *IndyCar · Tráfego pago* — ' + ref.split('-').reverse().join('/'), '', '*Ontem*',
    '• Investido: R$ 318,40 (+6% ↑ vs. dia anterior)', '• Conversões: 7 (+17% ↑)', '• CPA: R$ 45,49 · meta R$ 90,00',
    '• ROAS: 8,20x · meta 3x', '• CTR: 2,01% · CPM: R$ 31,20', '', '*Últimos 7 dias*',
    '• R$ 2.210,00 investidos · 41 conversões · CPA R$ 53,90 · ROAS 7,10x',
    '• 🟢 Melhor CPA: [Search] troca de óleo taubaté — R$ 28,10', '• 🔴 Pior CPA: [Meta] Suspensão e Alinhamento — R$ 212,40'].join(NL);
}

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
/* Dublê do Supabase no navegador: sessão, MFA, notificações e tarefas em memória.
   ?papel= admin | gestor | atendente | agenda | desativado | trocar | mfa · ?logado=0 abre no login. */
const DUBLE_SUPABASE = papel => `<script>(function(){
var PAPEL=${JSON.stringify(papel)}, logado=${JSON.stringify(LOGADO)}, aal=PAPEL==='mfa'?'aal1':'aal1', fatores=PAPEL==='mfa'?[{id:'f1',status:'verified',factor_type:'totp',created_at:new Date().toISOString()}]:[];
var sessao=function(){return {access_token:'mock-'+PAPEL+(aal==='aal2'?'-aal2':''),user:{email:'dono@indycartaubate.com'}}};
var ouvintes=[];
var NOTIF=[{id:'n1',tipo:'ads_alerta',titulo:'Radar: 1 alerta(s) crítico(s)',corpo:'CPA acima do teto: [Meta] Suspensão e Alinhamento',link:'/?aba=radar',app:'ads',lida_em:null,created_at:new Date(Date.now()-3600e3).toISOString()},
 {id:'n2',tipo:'lead_atribuido',titulo:'Lead passado para você',corpo:'Maria — revisão',link:'/?lead=1',app:'crm',lida_em:null,created_at:new Date(Date.now()-7200e3).toISOString()},
 {id:'n3',tipo:'ads_semana',titulo:'Semana 05/10–11/10: R$ 2.210,00 em anúncios, 41 lead(s)',corpo:'CRM: 41 lead(s), 18 agendamento(s), 9 venda(s).',link:'/?aba=painel',app:'ads',lida_em:new Date().toISOString(),created_at:new Date(Date.now()-86400e3).toISOString()}];
var TAREFAS=[{id:'t1',titulo:'Revisar UTMs das campanhas do Meta',descricao:null,vence_em:new Date(Date.now()-86400e3).toISOString(),prioridade:2,origem:'manual',status:'aberta',created_at:new Date().toISOString()},
 {id:'t2',titulo:'Ligar para o Google sobre o developer token',descricao:'Pedido de aprovação parado',vence_em:null,prioridade:1,origem:'crm',status:'aberta',created_at:new Date().toISOString()}];
function q(tab){var lista=tab==='notificacoes'?NOTIF:TAREFAS, filtros=[], patch=null, novo=null, conta=false;
 var o={select:function(c,op){if(op&&op.count)conta=true;return o},order:function(){return o},limit:function(){return o},
  eq:function(k,v){filtros.push(function(x){return k==='responsavel_id'||x[k]===v});return o},is:function(k){filtros.push(function(x){return x[k]==null});return o},
  update:function(p){patch=p;return o},insert:function(p){novo=p;return o},
  then:function(ok,ruim){var r;if(novo){var t=Object.assign({id:'t'+Date.now(),status:'aberta',origem:'manual',created_at:new Date().toISOString()},novo);TAREFAS.unshift(t);r={data:[t],error:null}}
   else{var sel=lista.filter(function(x){return filtros.every(function(f){return f(x)})});
    if(patch){sel.forEach(function(x){Object.assign(x,patch)});r={data:sel,error:null}}
    else r=conta?{count:sel.length,data:null,error:null}:{data:sel.map(function(x){return Object.assign({},x)}),error:null}}
   return Promise.resolve(r).then(ok,ruim)}};return o}
window.supabase={createClient:function(){return {
 auth:{getSession:async function(){return {data:{session:logado?sessao():null}}},
  getUser:async function(){return {data:{user:{email:'dono@indycartaubate.com'}}}},
  onAuthStateChange:function(f){ouvintes.push(f);return {data:{subscription:{unsubscribe:function(){}}}}},
  signInWithPassword:async function(c){if(c.password==='errada')return {data:null,error:{message:'Invalid login credentials'}};logado=true;return {data:{session:sessao()},error:null}},
  signOut:async function(){logado=false;return {error:null}},
  resetPasswordForEmail:async function(){return {error:null}},
  updateUser:async function(){return {data:{},error:null}},
  mfa:{getAuthenticatorAssuranceLevel:async function(){return {data:{currentLevel:aal,nextLevel:fatores.some(function(f){return f.status==='verified'})?'aal2':'aal1'}}},
   listFactors:async function(){return {data:{totp:fatores.filter(function(f){return f.status==='verified'}),all:fatores},error:null}},
   enroll:async function(){var f={id:'f'+Date.now(),status:'unverified',created_at:new Date().toISOString()};fatores.push(f);return {data:{id:f.id,totp:{qr_code:'data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; viewBox=&quot;0 0 10 10&quot;><rect width=&quot;10&quot; height=&quot;10&quot; fill=&quot;#fff&quot;/><rect x=&quot;2&quot; y=&quot;2&quot; width=&quot;6&quot; height=&quot;6&quot;/></svg>'.replace(/&quot;/g,'"')),secret:'JBSWY3DPEHPK3PXP'}},error:null}},
   challengeAndVerify:async function(o){if(o.code!=='123456')return {error:{message:'invalid'}};fatores.forEach(function(f){if(f.id===o.factorId)f.status='verified'});aal='aal2';return {data:{},error:null}},
   unenroll:async function(o){fatores=fatores.filter(function(f){return f.id!==o.factorId});aal='aal1';return {error:null}}}},
 from:q, channel:function(){var c={on:function(){return c},subscribe:function(){return c}};return c}, removeChannel:function(){}
}}};})();</script>`;

// ============================================================================
// Rodada 8 (frente T6): Meta e Google DE MENTIRA, no formato das versões em vigor
// (Graph/Marketing API v27.0 e Google Ads API v26, conferidas em 19/11/2026).
// O app aponta para cá com:
//   META_GRAPH_URL=http://localhost:3411/meta
//   GOOGLE_ADS_API_URL=http://localhost:3411/google
//   GOOGLE_OAUTH_TOKEN_URL=http://localhost:3411/oauth/token
// Casos de erro, escolhidos pelo valor colado (nada disto é acesso de verdade):
//   Meta  token TOKEN-FALSO (ok) · TOKEN-FALSO-VENCIDO (190) · TOKEN-FALSO-SEM-PERMISSAO (200)
//         TOKEN-FALSO-LIMITE (17 na 1ª chamada de cada endereço) · TOKEN-FALSO-QUENTE (uso da conta em 85%)
//         TOKEN-FALSO-60D (vence em 5 dias) · TOKEN-FALSO-SEM-ESCOPO (sem ads_read)
//         conta act_2222222222 recusa a v27.0 (2635) · act_3333333333 sem gasto · act_0000000000 não existe
//         paginação: insights vêm de 4 em 4 linhas, com paging.next (que traz o token, como a Meta faz)
//   Google refresh refresh-falso (ok) · refresh-vencido (invalid_grant) · client secret segredo-errado (invalid_client)
//         conta de serviço: JWT conferido com a chave pública passada em criarPlataformasFalsas({ chavePublica })
//         cliente 1111111111 = projeto sem acesso de produção · 4444444444 = sem permissão na conta
//         5555555555 = 429 na 1ª consulta · versão fora de `versoesGoogle` = 404
//         click_view exige um dia só e no máximo 90 dias atrás
// ============================================================================
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'); // segredos: permitido (imagem PNG de 1 pixel em base64; o trecho EAA é coincidência)
const META_CAMPANHAS = [
  { id: '120000000000001', nome: 'Troca de óleo R$ 169', objetivo: 'OUTCOME_ENGAGEMENT', status: 'ACTIVE' },
  { id: '120000000000002', nome: 'Revisão completa', objetivo: 'OUTCOME_LEADS', status: 'PAUSED' },
];
const metaConjunto = c => ({ id: c.id.replace(/^120/, '121'), nome: `Público 15 km · ${c.nome}`, status: c.status });
const metaAnuncios = c => [1, 2].map(i => ({ id: `${c.id.replace(/^120/, '122')}${i}`, nome: `Criativo ${i} · ${c.nome}`, status: i === 2 ? 'PAUSED' : c.status }));
const GOOGLE_CAMP = { id: '2000001', nome: 'Pesquisa oficina Taubaté', canal: 'SEARCH', status: 'ENABLED' };
const GOOGLE_GRUPO = { id: '3000001', nome: 'oficina mecânica', status: 'ENABLED' };
const GOOGLE_AD = { id: '4000001', nome: 'Anúncio de texto 1', status: 'ENABLED' };

const diasEntre = (de, ate) => { const out = []; for (let t = Date.parse(`${de}T12:00:00Z`); t <= Date.parse(`${ate}T12:00:00Z`); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10)); return out; };
const lerCorpoBruto = req => new Promise(ok => { let s = ''; req.on('data', c => { s += c; }); req.on('end', () => ok(s)); req.on('error', () => ok('')); });
const enviarJson = (res, status, obj, cab = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...cab }); res.end(JSON.stringify(obj)); return true; };
const b64urlDecode = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function criarPlataformasFalsas({ versoesMeta = ['v25.0', 'v26.0', 'v27.0'], versoesGoogle = ['v24', 'v25', 'v26'], segredoApp = null,
  chavePublica = null, cliques = {}, hoje = null } = {}) {
  const estado = { pedidos: [], tokens: new Set(), contadores: new Map() };
  const vez = k => { const n = (estado.contadores.get(k) || 0) + 1; estado.contadores.set(k, n); return n; };
  const hojeISO = () => hoje || new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

  function meta(req, res, url) {
    const partes = url.pathname.split('/').filter(Boolean);   // meta, v27.0, act_123, insights
    const v = partes[1], resto = partes.slice(2), q = url.searchParams;
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : (q.get('access_token') || '');
    estado.pedidos.push({ plataforma: 'meta', caminho: url.pathname, query: url.search, autorizacao: !!auth });
    const erro = (status, code, message, sub, cab) => enviarJson(res, status, { error: { message, type: 'OAuthException', code, error_subcode: sub, fbtrace_id: 'AFalso' } }, cab);
    const uso = { 'X-Ad-Account-Usage': JSON.stringify({ acc_id_util_pct: token === 'TOKEN-FALSO-QUENTE' ? 85 : 3, reset_time_duration: 0, ads_api_access_tier: 'development_access' }) };
    if (!versoesMeta.includes(v) || (resto[0] === 'act_2222222222' && v === 'v27.0')) {
      return erro(400, 2635, `(#2635) You are calling a deprecated version of the Ads API. Please update to the latest version: ${versoesMeta[versoesMeta.length - 2] || 'v26.0'}.`);
    }
    if (!token) return erro(400, 2500, 'An active access token must be used to query information about the current user.');
    if (token === 'TOKEN-FALSO-VENCIDO') return erro(400, 190, 'Error validating access token: Session has expired on Tuesday, 18-Nov-26 10:00:00 PST.', 463);
    if (!token.startsWith('TOKEN-FALSO')) return erro(400, 190, 'Invalid OAuth access token - Cannot parse access token');
    if (segredoApp) {
      const esperado = crypto.createHmac('sha256', segredoApp).update(token).digest('hex');
      if (q.get('appsecret_proof') !== esperado) return erro(400, 100, 'Invalid appsecret_proof provided in the API argument');
    }
    if (resto[0] === 'debug_token') {
      const agora = Math.floor(Date.now() / 1000);
      return enviarJson(res, 200, { data: { app_id: '1000000000', type: 'SYSTEM_USER', application: 'Painel de mentira', is_valid: true,
        expires_at: token === 'TOKEN-FALSO-60D' ? agora + 5 * 86400 : 0, data_access_expires_at: agora + 90 * 86400,
        scopes: token === 'TOKEN-FALSO-SEM-ESCOPO' ? ['business_management'] : ['ads_read', 'business_management'] } }, uso);
    }
    if (token === 'TOKEN-FALSO-SEM-PERMISSAO') return erro(403, 200, '(#200) Requires ads_read permission to manage the object');
    if (token === 'TOKEN-FALSO-LIMITE' && vez(`limite|${url.pathname}`) === 1) {
      return erro(400, 17, 'User request limit reached', 2446079, { 'X-Business-Use-Case-Usage': JSON.stringify({ 1000: [{ type: 'ads_management', call_count: 100, total_cputime: 30, total_time: 40, estimated_time_to_regain_access: 0 }] }) });
    }
    const conta = resto[0] || '';
    if (!/^act_\d+$/.test(conta)) return erro(400, 100, 'Unsupported get request.');
    if (conta === 'act_0000000000') return erro(400, 100, `Unsupported get request. Object with ID '${conta}' does not exist, cannot be loaded due to missing permissions, or does not support this operation.`, 33);
    if (resto.length === 1) return enviarJson(res, 200, { id: conta, name: 'Oficina de Mentira', account_status: 1, currency: 'BRL', timezone_name: 'America/Sao_Paulo' }, uso);
    const origem = `http://${req.headers.host}`;
    const paginar = lista => {
      const depois = Math.max(0, parseInt(q.get('after') || '0', 10) || 0);
      const pagina = lista.slice(depois, depois + 4);
      const corpo = { data: pagina };
      if (depois + 4 < lista.length) {
        const prox = new URLSearchParams(q); prox.set('after', String(depois + 4)); prox.set('access_token', token);
        corpo.paging = { cursors: { before: 'A', after: 'B' }, next: `${origem}${url.pathname}?${prox}` };
      }
      return enviarJson(res, 200, corpo, uso);
    };
    if (resto[1] === 'campaigns') return paginar(META_CAMPANHAS.map(c => ({ id: c.id, name: c.nome, objective: c.objetivo, effective_status: c.status })));
    if (resto[1] === 'adsets') return paginar(META_CAMPANHAS.map(c => { const s = metaConjunto(c); return { id: s.id, name: s.nome, effective_status: s.status }; }));
    if (resto[1] === 'ads') {
      return paginar(META_CAMPANHAS.flatMap(c => metaAnuncios(c).map(a => ({ id: a.id, name: a.nome, effective_status: a.status,
        creative: { id: `9${a.id}`, thumbnail_url: `https://scontent.xx.fbcdn.net/v/t45.1600-4/anuncio-${a.id}.jpg?stp=dst-jpg_p320x320&oe=6750ABCD` } }))));
    }
    if (resto[1] === 'insights') {
      if (conta === 'act_3333333333') return enviarJson(res, 200, { data: [] }, uso);
      let periodo;
      try { periodo = JSON.parse(q.get('time_range') || '{}'); } catch { periodo = {}; }
      if (!periodo.since || !periodo.until || q.get('time_increment') !== '1') return erro(400, 100, 'Invalid parameter');
      const nivel = q.get('level');
      const linhas = [];
      for (const dia of diasEntre(periodo.since, periodo.until)) {
        for (const c of META_CAMPANHAS) {
          const comum = { date_start: dia, date_stop: dia, campaign_id: c.id, campaign_name: c.nome, objective: c.objetivo,
            impressions: '1000', reach: '800', frequency: '1.25', clicks: '30', spend: '25.50',
            actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '3' },
              { action_type: 'onsite_conversion.total_messaging_connection', value: '4' }, { action_type: 'link_click', value: '30' }],
            action_values: [] };
          if (nivel === 'campaign') linhas.push(comum);
          const s = metaConjunto(c);
          if (nivel === 'adset') linhas.push({ ...comum, adset_id: s.id, adset_name: s.nome });
          if (nivel === 'ad') for (const a of metaAnuncios(c)) linhas.push({ ...comum, adset_id: s.id, adset_name: s.nome, ad_id: a.id, ad_name: a.nome });
        }
      }
      return paginar(linhas);
    }
    return erro(400, 100, 'Unsupported get request.');
  }

  async function oauth(req, res) {
    const corpo = new URLSearchParams(await lerCorpoBruto(req));
    estado.pedidos.push({ plataforma: 'oauth', grant: corpo.get('grant_type') });
    const emitir = () => { const t = `ya29.falso-${vez('token')}`; estado.tokens.add(t); return enviarJson(res, 200, { access_token: t, expires_in: 3599, token_type: 'Bearer' }); };
    if (corpo.get('grant_type') === 'refresh_token') {
      if (corpo.get('client_secret') === 'segredo-errado') return enviarJson(res, 401, { error: 'invalid_client', error_description: 'Unauthorized' });
      if (corpo.get('refresh_token') === 'refresh-vencido') return enviarJson(res, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
      return emitir();
    }
    if (corpo.get('grant_type') === 'urn:ietf:params:oauth:grant-type:jwt-bearer') {
      const [cab, dados, assinatura] = String(corpo.get('assertion') || '').split('.');
      let claims = {};
      try { claims = JSON.parse(b64urlDecode(dados).toString('utf8')); } catch { /* fica vazio */ }
      const okAssinatura = !chavePublica || (cab && assinatura && crypto.createVerify('RSA-SHA256').update(`${cab}.${dados}`).verify(chavePublica, b64urlDecode(assinatura)));
      if (!okAssinatura) return enviarJson(res, 400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' });
      if (!/gserviceaccount\.com$/.test(claims.iss || '') || !String(claims.scope || '').includes('auth/adwords')) return enviarJson(res, 400, { error: 'invalid_scope', error_description: 'Invalid scope.' });
      return emitir();
    }
    return enviarJson(res, 400, { error: 'unsupported_grant_type' });
  }

  async function googleAds(req, res, url) {
    const partes = url.pathname.split('/').filter(Boolean);   // google, v26, customers, 123, googleAds:searchStream
    const v = partes[1], cliente = partes[3];
    const corpo = JSON.parse((await lerCorpoBruto(req)) || '{}');
    estado.pedidos.push({ plataforma: 'google', caminho: url.pathname, devToken: req.headers['developer-token'] != null, login: req.headers['login-customer-id'] || null, query: corpo.query });
    const falha = (status, statusApi, message, errorCode) => enviarJson(res, status, [{ error: { code: status, message, status: statusApi,
      details: errorCode ? [{ '@type': 'type.googleapis.com/google.ads.googleads.v26.errors.GoogleAdsFailure', errors: [{ errorCode, message }] }] : [] } }]);
    if (!versoesGoogle.includes(v)) { res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' }); res.end('<!DOCTYPE html><title>Error 404 (Not Found)</title>'); return true; }
    const auth = String(req.headers.authorization || '');
    if (!estado.tokens.has(auth.replace(/^Bearer /, ''))) return falha(401, 'UNAUTHENTICATED', 'Request is missing required authentication credential.');
    if (cliente === '1111111111') return falha(403, 'PERMISSION_DENIED', 'The Google Cloud project is not approved for production access.', { authorizationError: 'CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION' });
    if (cliente === '4444444444') return falha(403, 'PERMISSION_DENIED', "User doesn't have permission to access customer.", { authorizationError: 'USER_PERMISSION_DENIED' });
    if (cliente === '5555555555' && vez(`cota|${cliente}`) === 1) return falha(429, 'RESOURCE_EXHAUSTED', 'Too many requests.', { quotaError: 'RESOURCE_TEMPORARILY_EXHAUSTED' });
    const gaql = String(corpo.query || '');
    const de = gaql.match(/FROM\s+(\w+)/i)?.[1];
    const faixa = gaql.match(/BETWEEN '(\d{4}-\d{2}-\d{2})' AND '(\d{4}-\d{2}-\d{2})'/);
    const umDia = gaql.match(/segments\.date = '(\d{4}-\d{2}-\d{2})'/);
    const dias = faixa ? diasEntre(faixa[1], faixa[2]) : umDia ? [umDia[1]] : [];
    const metr = { impressions: '500', clicks: '20', costMicros: '15500000', conversions: 2, conversionsValue: 0 };
    const camp = { resourceName: `customers/${cliente}/campaigns/${GOOGLE_CAMP.id}`, id: GOOGLE_CAMP.id, name: GOOGLE_CAMP.nome, status: GOOGLE_CAMP.status, advertisingChannelType: GOOGLE_CAMP.canal };
    const grupo = { resourceName: `customers/${cliente}/adGroups/${GOOGLE_GRUPO.id}`, id: GOOGLE_GRUPO.id, name: GOOGLE_GRUPO.nome, status: GOOGLE_GRUPO.status };
    let resultados = [];
    if (de === 'customer') resultados = [{ customer: { resourceName: `customers/${cliente}`, id: cliente, descriptiveName: 'Oficina de Mentira', currencyCode: 'BRL', timeZone: 'America/Sao_Paulo' } }];
    else if (de === 'campaign') resultados = dias.map(d => ({ campaign: camp, metrics: metr, segments: { date: d } }));
    else if (de === 'ad_group') resultados = dias.map(d => ({ campaign: camp, adGroup: grupo, metrics: metr, segments: { date: d } }));
    else if (de === 'ad_group_ad') resultados = dias.map(d => ({ campaign: camp, adGroup: grupo, adGroupAd: { ad: { id: GOOGLE_AD.id, name: GOOGLE_AD.nome }, status: GOOGLE_AD.status }, metrics: metr, segments: { date: d } }));
    else if (de === 'keyword_view') resultados = dias.map(d => ({ campaign: camp, adGroup: grupo, adGroupCriterion: { criterionId: '5000001', keyword: { text: 'oficina mecanica', matchType: 'PHRASE' } }, metrics: metr, segments: { date: d } }));
    else if (de === 'search_term_view') {
      resultados = dias.flatMap(d => ['EXACT', 'NEAR_EXACT'].map(tipo => ({ searchTermView: { searchTerm: 'oficina mecanica taubate', status: 'NONE' }, campaign: camp, adGroup: grupo,
        metrics: { impressions: '100', clicks: '5', costMicros: '4000000', conversions: 1 }, segments: { date: d, searchTermMatchType: tipo, keyword: { info: { text: 'oficina mecanica', matchType: 'PHRASE' } } } })));
    } else if (de === 'click_view') {
      if (!umDia || faixa) return falha(400, 'INVALID_ARGUMENT', 'Queries including ClickView must have a filter limiting the results to one day.', { queryError: 'EXPECTED_FILTERS_ON_DATE_RANGE' });
      const dif = Math.round((Date.parse(`${hojeISO()}T00:00:00Z`) - Date.parse(`${umDia[1]}T00:00:00Z`)) / 86400000);
      if (dif >= 90) return falha(400, 'INVALID_ARGUMENT', 'The date is too old for ClickView.', { queryError: 'DATE_RANGE_TOO_WIDE' });
      resultados = (cliques[umDia[1]] || []).map(c => ({ clickView: { gclid: c.gclid, keywordInfo: { text: c.palavra || 'oficina mecanica', matchType: 'PHRASE' },
        adGroupAd: `customers/${cliente}/adGroupAds/${GOOGLE_GRUPO.id}~${GOOGLE_AD.id}` }, campaign: camp, adGroup: grupo, segments: { date: umDia[1] } }));
    } else return falha(400, 'INVALID_ARGUMENT', 'Error in query: unexpected input.', { queryError: 'UNEXPECTED_INPUT' });
    const meio = Math.ceil(resultados.length / 2);
    return enviarJson(res, 200, [{ results: resultados.slice(0, meio), requestId: 'falso1' }, { results: resultados.slice(meio), requestId: 'falso1' }].filter((b, i) => i === 0 || b.results.length));
  }

  async function tratar(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const p = url.pathname;
    if (p.startsWith('/meta/')) return meta(req, res, url);
    if (p === '/oauth/token' && req.method === 'POST') return oauth(req, res);
    if (p.startsWith('/google/') && req.method === 'POST') return googleAds(req, res, url);
    if (p.startsWith('/img/')) { res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': String(PNG_1X1.length) }); res.end(PNG_1X1); return true; }
    return false;
  }
  return { tratar, estado };
}

/** Sobe só as plataformas de mentira numa porta (0 = qualquer livre). Usado pelos testes. */
export function subirPlataformasFalsas(opcoes = {}) {
  const p = criarPlataformasFalsas(opcoes);
  const srv = http.createServer(async (req, res) => {
    try { if (!(await p.tratar(req, res))) enviarJson(res, 404, { erro: 'não existe na plataforma de mentira' }); }
    catch (e) { enviarJson(res, 500, { erro: String(e?.message || e) }); }
  });
  return new Promise(ok => srv.listen(opcoes.porta || 0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${srv.address().port}`;
    ok({ url, meta: `${url}/meta`, google: `${url}/google`, oauth: `${url}/oauth/token`, estado: p.estado,
      fechar: () => new Promise(f => { srv.closeAllConnections?.(); srv.close(() => f()); }) });
  }));
}

const PLATAFORMAS = criarPlataformasFalsas();
const ehPrincipal = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const servidorMock = http.createServer(async (req, res) => {
  if (await PLATAFORMAS.tratar(req, res)) return;   // rodada 8: Meta e Google de mentira
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname, m = req.method, q = url.searchParams;

  if (!p.startsWith('/api/')) {
    if (p === '/' || p === '/index.html') {
      if (q.has('vazio')) VAZIO = q.get('vazio') === '1';
      if (q.has('saude')) SAUDE_OK = q.get('saude') === 'ok';
      if (q.has('papel')) PAPEL = q.get('papel');
      if (q.has('chaves')) SEM_CHAVES = q.get('chaves') !== '1';
      LOGADO = q.get('logado') !== '0';
      ACORDANDO = Math.max(0, Math.min(50, Number(q.get('acordando')) || 0));
      const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8')
        .replace(/<script src="[^"]*supabase[^"]*"><\/script>/, DUBLE_SUPABASE(PAPEL));
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' }); return res.end(html);
    }
    const arq = path.join(PUBLIC, path.normalize(p));
    if (!arq.startsWith(PUBLIC) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end('Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(arq)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    return fs.createReadStream(arq).pipe(res);
  }

  if (ACORDANDO > 0) {
    ACORDANDO--;
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<html><body>Service Unavailable · hibernate-wake-error</body></html>');
  }

  let body = {};
  if (m !== 'GET') { let b = ''; for await (const c of req) b += c; try { body = JSON.parse(b || '{}'); } catch {} }
  await new Promise(r => setTimeout(r, 180));   // latência de verdade, para ver o "ocupado"

  if (p === '/api/ping') return json(res, 200, { ok: true });
  if (p === '/api/config-publica') return json(res, 200, { supabase_url: 'http://mock.local', supabase_anon_key: 'mock' });

  /* ---- porteiro de mentira, com as mesmas regras do server.js ---- */
  if (!p.startsWith('/api/cron/')) {
    const tok = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const u = euMock(tok);
    if (!u) return json(res, 403, { erro: 'Seu usuário foi desativado. Fale com o administrador.', codigo: 'desativado' });
    if (p === '/api/eu' && m === 'GET') return json(res, 200, E.perfilPublico(u));
    if (p === '/api/eu' && m === 'POST') { try { const v = E.validarPerfil(body); Object.assign(PERFIS_MOCK[PAPEL] || PERFIS_MOCK.admin, v.notificacoes ? { preferencias: { notificacoes: v.notificacoes } } : {}, v); return json(res, 200, { ok: true }); } catch (e) { return json(res, 400, { erro: e.message }); } }
    if (p === '/api/eu/senha-trocada') { TROCOU = true; return json(res, 200, { ok: true }); }
    if (u.mfa && u.aal !== 'aal2') return json(res, 403, { erro: 'Digite o código de verificação para continuar.', codigo: 'mfa' });
    if (u.precisa_trocar_senha) return json(res, 403, { erro: 'Troque sua senha para continuar.', codigo: 'trocar_senha' });
    if (!E.acessoAds(u).ok) return json(res, 403, { erro: 'Você não tem acesso a este app.', codigo: 'sem_acesso', apps: E.appsDaPessoa(u) });
  }
  if (p === '/api/metas' && m === 'GET') {
    const hoje = iso(new Date()), mes = hoje.slice(0, 7), dia = Number(hoje.slice(8, 10));
    const diasMes = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
    const t = A.consolidar({ ...coorte(`${mes}-01`, hoje, VAZIO), metricas: [] }).total;
    return json(res, 200, { mes, meta: META, dia, dias_mes: diasMes, feito: { leads: t.leads, agendamentos: t.agendamentos, vendas: t.fechados },
      progresso: META ? { leads: E.progresso(t.leads, META.leads, dia, diasMes), agendamentos: E.progresso(t.agendamentos, META.agendamentos, dia, diasMes), vendas: E.progresso(t.fechados, META.vendas, dia, diasMes) } : null });
  }
  if (p === '/api/metas' && m === 'POST') { try { const v = E.validarMeta(body); META = { id: 'm1', ...(META || {}), ...v, updated_at: new Date().toISOString() }; return json(res, 200, META); } catch (e) { return json(res, 400, { erro: e.message }); } }
  if (p === '/api/semanal') return json(res, 200, { de: '2026-10-05', ate: '2026-10-11', titulo: 'Semana 05/10–11/10: R$ 2.210,00 em anúncios, 41 lead(s)', corpo: 'Investido R$ 2.210,00 (+6% contra a semana anterior). CRM: 41 lead(s), 18 agendamento(s), 9 venda(s).', enviadas: 1, destinatarios: 1 });

  /* ---- rodada 5: leads do CRM, fila do Comunicar, CSV de alertas, interruptor de regra ---- */
  if (p === '/api/leads/hoje') {
    const hoje = L.hojeBR(), r = LD.listar({ de: hoje, ate: hoje, limite: 8 }, VAZIO);
    return json(res, 200, { dia: hoje, ...r.resumo_periodo, ultimos: r.leads, ultimo_em: r.leads[0]?.criado_em || null, link_crm: 'https://indycar-crm.onrender.com/' });
  }
  if (p === '/api/leads' || p === '/api/leads.csv') {
    const { de, ate } = periodo(q);
    const r = LD.listar({ de, ate, canal: q.get('canal'), status: q.get('status'), q: q.get('q'), soPagos: q.get('pagos') === '1', semResponsavel: q.get('sem_responsavel') === '1', etapa: q.get('etapa') || null, ordem: q.get('ordem') || 'recentes', limite: Number(q.get('limite')) || 300 }, VAZIO);
    if (p.endsWith('.csv')) { res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="leads-' + de + '-a-' + ate + '.csv"' }); return res.end(L.csv(r.leads)); }
    return json(res, 200, r);
  }
  if (p === '/api/alertas.csv') { res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="alertas-radar.csv"' }); return res.end(A.montarCSV([['criado_em', 'Quando'], ['severidade', 'Severidade'], ['mensagem', 'Mensagem']], ALERTAS)); }
  if (p === '/api/regras/ativa') { REGRAS = REGRAS.map(r => (r.id === body.id ? { ...r, ativa: body.ativa === true } : r)); return json(res, 200, REGRAS.find(r => r.id === body.id) || {}); }
  if (p === '/api/fila') return json(res, 200, situacaoFila());

  if (p === '/api/saude') return json(res, 200, SAUDE_OK
    ? { ok: true, problema: null, desde: null, checado_em: new Date().toISOString(), resumo: 'tudo certo',
        piloto: { ligado: true, automatico: true, ultimoSync: agoraMenos(0.4), ultimoRadar: agoraMenos(0.4), ultimoRelatorio: null, relatorio: { motivo: 'relatório diário desligado em Ajustes' }, erros: [] }, ia: false, supabase: true, demo: true, sem_chaves: SEM_CHAVES, tem_dados_reais: !SEM_CHAVES, fila: situacaoFila() }
    : { ok: false, versao: '0.5.0-mock', problema: 'codewords-chave-recusada', problemas: ['codewords-chave-recusada', 'comunicar-carteiro-parado'], desde: '2026-10-01T16:56:31.089Z', checado_em: new Date().toISOString(), chaves: { meta: SEM_CHAVES ? 'recusada' : 'ok', google: 'sem_token' },
        resumo: 'O CodeWords (que leva as mensagens do WhatsApp) respondeu com erro 401. O Carlos pode estar sem responder os clientes.',
        piloto: { ligado: true, automatico: true, ultimoSync: agoraMenos(0.4), ultimoRadar: agoraMenos(0.4), ultimoRelatorio: null, relatorio: { motivo: 'relatório diário desligado em Ajustes' }, erros: [] }, ia: false, supabase: true, demo: true, sem_chaves: SEM_CHAVES, tem_dados_reais: !SEM_CHAVES, fila: situacaoFila() });

  if (p === '/api/painel') {
    // A rota de resultados abaixo usa a mesma matemática do servidor.
    const { de, ate } = periodo(q);
    const plat = q.get('plataforma') || null;
    const atual = linhas(de, ate).filter(l => !plat || l.plataforma === plat);
    const tam = Math.round((new Date(ate) - new Date(de)) / 86400000) + 1;
    const antFim = new Date(new Date(`${de}T00:00:00Z`).getTime() - 86400000);
    const anterior = linhas(iso(new Date(antFim.getTime() - (tam - 1) * 86400000)), iso(antFim)).filter(l => !plat || l.plataforma === plat);
    const total = M.consolidar(atual), totalAnt = M.consolidar(anterior);
    const comparacao = {};
    for (const k of ['gasto', 'cliques', 'impressoes', 'conversoes', 'valor_conversao', 'cpa', 'roas', 'ctr', 'cpc', 'cpm'])
      comparacao[k] = { atual: total[k], anterior: totalAnt[k], variacao: M.variacao(total[k], totalAnt[k]) };
    const por_plataforma = [...agrupar(atual, l => l.plataforma)].map(([pl, ls]) => ({ plataforma: pl, ...M.consolidar(ls) })).sort((a, b) => b.gasto - a.gasto);
    const serie = [...agrupar(atual, l => l.data)].map(([data, ls]) => {
      const t = M.consolidar(ls), pp = {};
      for (const [pl, x] of agrupar(ls, l => l.plataforma)) pp[pl] = M.somar(x).gasto;
      return { data, gasto: t.gasto, conversoes: t.conversoes, receita: t.valor_conversao, cpa: t.cpa, roas: t.roas, meta: pp.meta || 0, google: pp.google || 0 };
    }).sort((a, b) => a.data.localeCompare(b.data));
    const crm = VAZIO ? {} : { meta: { leads: 23, fechados: 9, receita: 0, sem_valor: 9 }, google: { leads: 31, fechados: 14, receita: 6380, sem_valor: 3 } };
    return json(res, 200, { periodo: { de, ate }, total, total_anterior: totalAnt, comparacao, lucro: M.lucro(total, CONFIG.margem_pct),
      metas: { cpa_alvo: CONFIG.cpa_alvo, roas_alvo: CONFIG.roas_alvo, orcamento_mensal: CONFIG.orcamento_mensal, margem_pct: CONFIG.margem_pct }, por_plataforma, serie, crm });
  }
  if (p === '/api/resultados' || p === '/api/resultados.csv') {
    if (q.get('falha') === '1') return json(res, 503, { erro: 'CRM sintético indisponível. Tente novamente.' });
    const { de, ate } = periodo(q), anterior = periodoAnterior(de, ate);
    const opcoes = { plataforma: q.get('plataforma') || null, margem: CONFIG.margem_pct, cpaAlvo: CONFIG.cpa_alvo };
    const atual = A.consolidar({ ...coorte(de, ate, VAZIO), metricas: linhas(de, ate), ...opcoes });
    const ant = A.consolidar({ ...coorte(anterior.de, anterior.ate, VAZIO), metricas: linhas(anterior.de, anterior.ate), ...opcoes });
    const resultado = R.montar(atual, ant, { de, ate, anterior, margem: CONFIG.margem_pct, demo: !VAZIO,
      criterio: 'MOCK: leads, conversas, agendamentos e vendas inventados.' });
    { const cr = coorte(de, ate, VAZIO); const pagos = cr.leads.filter(l => A.canal(l)); resultado.ciclo = R.cicloDe ? await R.cicloDe({ leads: cr.leads }, atual, { ler: async () => ({ ok: true, porLead: require('./ciclo-demo.cjs').porLeadDemo(pagos) }) }) : null; }
    if (resultado.ciclo && !resultado.ciclo.indisponivel) resultado.ciclo.demo = !VAZIO;
    resultado.equipe = await R.equipeDe(coorte(de, ate, VAZIO), opcoes.plataforma, async () => NOMES_RESP);
    if (p.endsWith('.csv')) { res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="resultados-crm-${de}-a-${ate}.csv"` }); return res.end(A.csv(resultado)); }
    return json(res, 200, resultado);
  }
  /* Rodada 7: fila "o que fazer agora", preparo, ligação e fechamento — passando pelos módulos REAIS com leitura inventada. */
  if (p === '/api/acoes') {
    if (q.get('falha') === '1') return json(res, 200, { indisponivel: true, motivo: 'Orçador e Pátio não responderam agora.', itens: [], total: 0 });
    const hoje = L.hojeBR(), cr = coorte(hoje.slice(0, 8) + '01', hoje, VAZIO);
    cr.leads = cr.leads.map((l, i) => ({ ...l, nome: l.nome || NOMES_LEAD[i % NOMES_LEAD.length], telefone: l.telefone || '1299' + String(1000000 + i * 137).slice(0, 7) }));
    const pagos = cr.leads.filter(l => A.canal(l));
    const fila = await require('../ciclo.js').acoes({ lerLeads: async () => cr.leads, ler: async () => ({ ok: true, porLead: require('./ciclo-demo.cjs').porLeadDemo(pagos) }) });
    const AC = require('../acoes.js');
    return json(res, 200, { ...fila, alertas: undefined, frase: AC.frase(fila), radar: VAZIO ? [] : AC.acoesDoRadar(ALERTAS.map(a => ({ nivel: 'campanha', entidade_nome: 'Suspensão e Alinhamento', ...a }))) });
  }
  if (p === '/api/acoes.csv') {
    const hoje = L.hojeBR(), cr = coorte(hoje.slice(0, 8) + '01', hoje, VAZIO), pagos = cr.leads.filter(l => A.canal(l));
    const fila = await require('../ciclo.js').acoes({ lerLeads: async () => cr.leads, ler: async () => ({ ok: true, porLead: require('./ciclo-demo.cjs').porLeadDemo(pagos) }) });
    const AC = require('../acoes.js');
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="o-que-fazer-agora.csv"' });
    return res.end(A.montarCSV(AC.CAMPOS_CSV, AC.linhasCSV(fila)));
  }
  if (p === '/api/ligacao') return json(res, 200, require('../ciclo.js').qualidadeLigacao({ orcamentos: [{ status: 'enviado', lead_id: 'x' }, { status: 'aprovado', lead_id: 'y' }, { status: 'enviado' }], os: [{ etapa: 'recebido', lead_id: 'x' }] }));
  if (p === '/api/preparo') return json(res, 200, require('../preparo.js').montar({ chaves: VAZIO ? {} : (q.get('chaves') === '1' ? { meta: 'ok', google: 'ok' } : { meta: 'recusada', google: 'sem_token' }), config: CONFIG, temDados: !VAZIO, temDadosReais: false, ia: false, ligacao: null, canalWhatsApp: true, dadosDemo: !VAZIO }));
  if (p === '/api/fechamento') {
    const F = require('../fechamento.js'), per = F.periodoDoMes(q.get('mes') || L.hojeBR().slice(0, 7), L.hojeBR());
    if (!per) return json(res, 400, { erro: 'Escolha um mês que já começou (formato AAAA-MM).' });
    const hoje = L.hojeBR(), cr = coorte(hoje.slice(0, 8) + '01', hoje, VAZIO), pagos = cr.leads.filter(l => A.canal(l));
    const ciclo = { indisponivel: false, ...require('../ciclo.js').consolidarCiclo({ leads: pagos, porLead: require('./ciclo-demo.cjs').porLeadDemo(pagos), resultado: { campanhas: [{ canal: 'meta', campanha: 'Revisão', sem_utm: false, gasto: 2600 }, { canal: 'google', campanha: 'Freios', sem_utm: false, gasto: 1610 }] } }) };
    const f = F.consolidar(per, { demo: !VAZIO, total: { gasto: 4210, leads: 54, cpl: 78, agendamentos: 23, fechados: 23, receita: 6380 }, ciclo }, null);
    return json(res, 200, { ok: true, ...f, texto: F.texto(f), veredito: F.veredito(f) });
  }
  if (p === '/api/fechamento.csv') {
    const F = require('../fechamento.js'), per = F.periodoDoMes(q.get('mes') || L.hojeBR().slice(0, 7), L.hojeBR());
    if (!per) return json(res, 400, { erro: 'Escolha um mês que já começou (formato AAAA-MM).' });
    const f = F.consolidar(per, { demo: !VAZIO, total: { gasto: 4210, leads: 54, cpl: 78, agendamentos: 23, fechados: 23, receita: 6380 } }, null);
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="fechamento.csv"' });
    return res.end(A.montarCSV(F.CAMPOS_CSV, F.linhasCSV(f)));
  }
  if (p === '/api/fechamento/enviar') return json(res, 400, { erro: 'o investimento é de demonstração; cole as chaves reais antes de mandar o fechamento por WhatsApp' });
  if (p === '/api/ciclo.csv') return json(res, 503, { erro: 'sem ciclo no mock' });
  if (p === '/api/oficina-agora') {
    const hoje = L.hojeBR(), r = LD.listar({ de: hoje.slice(0, 8) + '01', ate: hoje, limite: 1000 }, VAZIO);
    const pat = r.leads.filter(l => l.ciclo?.os?.no_patio), esp = r.leads.filter(l => l.ciclo?.orcamento?.status === 'enviado');
    return json(res, 200, { indisponivel: false, dias: 30, no_patio: pat.length, prontos_parados: pat.filter(l => l.ciclo.os.pronto_horas >= 24).length, orc_esperando: esp.length, valor_esperando: esp.reduce((s, l) => s + (l.ciclo.orcamento.total || 0), 0),
      carros: pat.slice(0, 6).map(l => ({ nome: l.nome, carro: l.carro, etapa_nome: l.ciclo.os.etapa_nome, link_os: l.links.os, pronto_horas: l.ciclo.os.pronto_horas })), orcamentos: esp.slice(0, 6).map(l => ({ nome: l.nome, total: l.ciclo.orcamento.total, esperando_horas: l.ciclo.orcamento.esperando_horas, link_orcamento: l.links.orcamento, link_crm: l.links.crm })) });
  }
  if (p === '/api/ranking.csv') {
    const { de, ate } = periodo(q);
    const ls = linhas(de, ate, q.get('nivel') || 'campanha');
    const itens = [...agrupar(ls, l => l.entidade_ext)].map(([, x]) => ({ plataforma: x[0].plataforma, nome: x[0].entidade_nome, ...M.consolidar(x) }));
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="campanhas-${de}-a-${ate}.csv"` });
    return res.end(A.montarCSV([['plataforma', 'Plataforma'], ['nome', 'Nome'], ['gasto', 'Investido'], ['conversoes', 'Conversões'], ['cpa', 'CPA']], itens));
  }
  if (p === '/api/ia/leituras') return json(res, 200, LEITURAS);
  if (p === '/api/ia/leitura') {
    if (q.get('falha') === '1' || VAZIO) return json(res, 503, { erro: 'Sem ANTHROPIC_API_KEY no servidor: a leitura com IA não está disponível.' });
    const l = { ok: true, id: 'l' + Date.now(), modelo: 'claude-sonnet-5-5', demonstracao: true, criado_em: new Date().toISOString(),
      texto: 'Semana de demonstração: R$ 2.210 investidos viraram 41 conversões, mas o CRM mostra custo por agendamento de R$ 150, acima do alvo de R$ 90. A campanha Suspensão e Alinhamento gasta R$ 60 por dia com CPA de R$ 212 e quase não gera agendamento. Pause essa campanha e mova a verba para a busca de troca de óleo, que agenda mais barato.' };
    LEITURAS = [l, ...LEITURAS].slice(0, 5);
    return json(res, 200, l);
  }
  if (p === '/api/integracoes/testar') {
    const canal = body.canal;
    const v = C.validarCredencial(canal, body);
    if (!v.ok) return json(res, 200, { canal, ok: false, titulo: 'Dados em formato errado', fazer: v.erro });
    const erro = canal === 'meta' ? 'Meta API 400: Malformed access token (código 190)' : 'OAuth Google 400: invalid_grant';
    return json(res, 200, { canal, ok: false, ...C.explicarErro(erro), erro });
  }
  if (p === '/api/integracoes' && m === 'POST') {
    const v = C.validarCredencial(body.canal, body);
    if (!v.ok) return json(res, 400, { erro: v.erro });
    return json(res, 200, { canal: body.canal, ativo: true, tem_meta_token: !!v.cred.meta_access_token });
  }
  if (p === '/api/mes') {
    const agora = new Date(), de = iso(new Date(agora.getFullYear(), agora.getMonth(), 1));
    const t = M.consolidar(linhas(de, iso(agora)));
    const diasCorridos = agora.getDate(), diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
    const projecao = (t.gasto / diasCorridos) * diasNoMes;
    const lm = LD.listar({ de, ate: iso(agora), limite: 1 }, VAZIO).resumo_periodo;
    return json(res, 200, { gasto: t.gasto, receita: t.valor_conversao, conversoes: t.conversoes, orcamento: CONFIG.orcamento_mensal, projecao,
      leads: VAZIO ? null : { total: lm.total, pagos: lm.pagos, agendados: lm.agendados, fechados: lm.fechados, sem_responsavel: lm.sem_responsavel, custo_lead_pago: lm.pagos ? t.gasto / lm.pagos : null },
      dias_corridos: diasCorridos, dias_no_mes: diasNoMes, lucro: M.lucro(t, CONFIG.margem_pct), desvio: CONFIG.orcamento_mensal ? projecao - CONFIG.orcamento_mensal : null });
  }
  if (p === '/api/ranking') {
    const { de, ate } = periodo(q);
    const nivel = q.get('nivel') || 'campanha', ordenar = q.get('ordenar') || 'gasto';
    const ls = linhas(de, ate, nivel).filter(l => !q.get('plataforma') || l.plataforma === q.get('plataforma'));
    const itens = [...agrupar(ls, l => `${l.plataforma}|${l.entidade_ext}`)].map(([k, x]) => ({
      plataforma: k.split('|')[0], entidade_ext: k.split('|')[1], nome: x[x.length - 1].entidade_nome, campanha_nome: x[x.length - 1].campanha_nome,
      dias_ativos: new Set(x.map(l => l.data)).size, ...M.consolidar(x) }));
    itens.sort((a, b) => (b[ordenar] ?? -Infinity) - (a[ordenar] ?? -Infinity));
    if (nivel === 'campanha' && q.get('crm') !== '0') {
      const resultado = A.consolidar({ ...coorte(de, ate, VAZIO), metricas: ls, margem: CONFIG.margem_pct, cpaAlvo: CONFIG.cpa_alvo });
      return json(res, 200, A.juntarRankingComCRM(itens, resultado));
    }
    return json(res, 200, itens);
  }
  if (p === '/api/integracoes') return json(res, 200, VAZIO ? [] : [
    { id: 'i1', canal: 'meta', ativo: true, conta_nome: 'IndyCar Centro Automotivo', ultimo_sync_em: agoraMenos(2), ultimo_sync_status: 'erro — Meta API 400: Malformed access token', tem_meta_token: true, tem_google_token: false, tem_meta_conta: true, meta_token_expira_em: new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10) },
    { id: 'i2', canal: 'google', ativo: true, conta_nome: null, ultimo_sync_em: null, ultimo_sync_status: null, tem_meta_token: false, tem_google_token: false, tem_google_cliente: true, tem_google_developer_token: false, tem_google_oauth: false, tem_google_refresh: false },
  ]);
  if (p === '/api/config' && m === 'GET') return json(res, 200, CONFIG);
  if (p === '/api/config' && m === 'POST') {
    if (body.relatorio_hora != null && (body.relatorio_hora < 0 || body.relatorio_hora > 23)) return json(res, 400, { erro: 'relatorio_hora: use uma hora de 0 a 23' });
    CONFIG = { ...CONFIG, ...body, relatorio_ativo: body.relatorio_ativo === true,
      whatsapp_destinos: (body.whatsapp_destinos || []).map(t => { let n = String(t).replace(/[^0-9]/g, ''); if (n && n.length <= 11) n = '55' + n; return n; }).filter(n => n.length >= 12) };
    return json(res, 200, CONFIG);
  }
  if (p === '/api/regras' && m === 'GET') return json(res, 200, VAZIO ? [] : REGRAS);
  if (p === '/api/regras' && m === 'POST') {
    if (!body.nome) return json(res, 400, { erro: 'Dê um nome à regra.' });
    if (!Number.isFinite(Number(body.valor))) return json(res, 400, { erro: 'Informe o valor limite (um número).' });
    const r = { ...body, id: body.id || `${Date.now()}-0000-4000-8000-000000000000`.slice(0, 36) };
    REGRAS = body.id ? REGRAS.map(x => (x.id === body.id ? r : x)) : [...REGRAS, r];
    return json(res, 200, r);
  }
  if (p === '/api/regras' && m === 'DELETE') { REGRAS = REGRAS.filter(r => r.id !== q.get('id')); return json(res, 200, { apagado: true }); }
  if (p === '/api/alertas') return json(res, 200, VAZIO ? [] : (q.get('nao_lidos') === '1' ? ALERTAS.filter(a => !a.lido_em) : ALERTAS).filter(a => !q.get('severidade') || a.severidade === q.get('severidade')).map(a => ({ ...a, acao: require('../acoes.js').acaoDoAlerta({ nivel: 'campanha', entidade_nome: 'Suspensão e Alinhamento', ...a }) })));
  if (p === '/api/alertas/lidos') { ALERTAS = ALERTAS.map(a => ((body.ids || []).includes(a.id) ? { ...a, lido_em: new Date().toISOString() } : a)); return json(res, 200, { ok: true }); }
  if (p === '/api/radar') return json(res, 200, { avaliadas: REGRAS.filter(r => r.ativa).length, simulacao: true, disparados: VAZIO ? 0 : 1, suprimidos: 0,
    alertas: VAZIO ? [] : [{ severidade: 'critico', regra_nome: 'CPA acima do teto', mensagem: 'CPA acima do teto: [Meta] Suspensão e Alinhamento está com CPA em R$ 198,10 (limite R$ 120,00).' }], envio: null, motivo_sem_envio: 'simulação' });
  if (p === '/api/relatorios') return json(res, 200, VAZIO ? [] : [
    { id: 'r1', referencia: iso(new Date(Date.now() - 86400000)), resumo_ia: null, enviado_em: null, erro: 'relatório diário desligado em Ajustes', created_at: new Date().toISOString() },
    { id: 'r2', referencia: '2026-08-13', resumo_ia: null, enviado_em: null, erro: 'IA: 401 invalid x-api-key · nenhum número de destino cadastrado', created_at: '2026-08-14T11:03:14Z' },
  ]);
  if (p === '/api/relatorio') {
    const ref = iso(new Date(Date.now() - 86400000));
    const motivo = body.enviar !== true ? 'prévia — nada foi enviado' : CONFIG.relatorio_ativo !== true ? 'relatório diário desligado em Ajustes'
      : !CONFIG.whatsapp_destinos.length ? 'nenhum número de WhatsApp cadastrado em Ajustes' : null;
    const envio = motivo ? null : CONFIG.whatsapp_destinos.map(d => ({ destino: d, ok: true, via: 'fila', id: enfileirarMock(d, 'ads:relatorio:' + ref) }));
    return json(res, 200, { referencia: ref, texto: textoRelatorio(ref), resumo_ia: null, enviado_em: envio ? new Date().toISOString() : null, erro: body.enviar === true ? motivo : null, envio, motivo_sem_envio: motivo });
  }
  if (p === '/api/whatsapp/status') return json(res, 200, { via: 'fila do Comunicar', fila: situacaoFila(),
    canal: SAUDE_OK ? { conectado: true, problema: null, erro: null } : { conectado: false, problema: 'codewords-fora', erro: 'chave do CodeWords recusada — gere uma chave nova em Atendimento › Configurações; a fila guarda as mensagens até lá' },
    pronto: SAUDE_OK, conferido_em: new Date().toISOString() });
  if (p === '/api/whatsapp/testar') {
    if (!CONFIG.whatsapp_destinos.length) return json(res, 400, { erro: 'cadastre ao menos um número em Ajustes antes de testar o envio' });
    const envio = CONFIG.whatsapp_destinos.map(d => ({ destino: d, ok: true, via: 'fila', id: enfileirarMock(d, 'ads:teste:' + Date.now()), duplicada: false }));
    return json(res, 200, { ok: true, envio, via: 'fila' });
  }
  if (p === '/api/sync') return json(res, 200, { plataformas: { meta: { ok: false, erro: 'Meta API 400: Malformed access token' } }, erros: ['meta: Meta API 400: Malformed access token'] });
  if (p === '/api/testar-conexoes') return json(res, 200, [
    { canal: 'meta', ok: false, ...C.explicarErro('Meta API 400: Malformed access token (código 190)'), erro: 'Meta API 400: Malformed access token (código 190)' },
    { canal: 'google', ok: false, titulo: 'Google ainda não conectado', fazer: 'Cole as credenciais em Ajustes → Conexões e clique em Testar.' }]);
  if (p === '/api/demo') { VAZIO = !!body.limpar; return json(res, 200, body.limpar ? { limpo: true } : { dias: 45, linhas: 1350 }); }
  return json(res, 404, { erro: 'rota não encontrada (mock)' });
});
if (ehPrincipal) servidorMock.listen(PORT, () => console.log(`mock da Central de Tráfego em http://localhost:${PORT}  (?vazio=1 · ?saude=ok · ?chaves=1 · ?papel=…)`));
