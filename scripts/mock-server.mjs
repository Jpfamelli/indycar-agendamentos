// ============================================================================
// Servidor de MENTIRA para mexer na tela sem login e sem dado real de cliente.
//
//   node scripts/mock-server.mjs            → http://localhost:3011  (perfil admin)
//   abra  http://localhost:3011/?papel=agenda   para ver o modo presença
//
// Serve a pasta public/ de verdade (o mesmo index.html, app.js e styles.css que
// vão para produção) e responde /api/* com dados inventados, guardados na
// memória. A única coisa trocada no HTML é a biblioteca do Supabase, que vira um
// dublê "já logado". NUNCA é usado em produção: o Render sobe o server.js.
//
// A ordem de "Últimos agendamentos" vem da função REAL (dados.js ›
// montarUltimos), para o que se vê aqui ser o que vai ao ar.
// ============================================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { montarUltimos, hoje, agoraHHMM, horariosLivres, telefoneNacional, casaBusca, cargaDoDia, sugerirConsultor } from '../dados.js';
import { decidirAcesso, decidirNaoVeioNaEdicao, presencaPodeMarcar } from '../regras.js';
import { valorDeEntrada, valorValido, sugerirValor, sugerirLoginDoConsultor, distribuirSemConsultor } from '../dados.js';
import { resumoDaOs, juntarSugestaoComExtras, entreguesSemDesfecho, idsDeAgendamento } from '../patio.js';
import { livresDoDia, proximosDias, duracaoDoServico, janelasDoServico, diaDaSemana, resumoDoDia } from '../horarios.js';
import { esperaQueCabe, aniversariantes } from '../dados.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT || 3011);
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' };

const dia = (n) => { const d = new Date(`${hoje()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hm = (deslocMin) => {            // hora relativa a AGORA, para sempre haver "em 40 min", "atrasado"…
  const [h, m] = agoraHHMM().split(':').map(Number);
  const t = Math.min(23 * 60 + 50, Math.max(5, h * 60 + m + deslocMin));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
let seq = 0;
const ag = (o) => ({ id:`00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, telefone:'12999990000',
  lead_id:'l-mock', veiculo:null, placa:null, origem:'WhatsApp', consultor_nome:'Leonardo', confirmado:0, compareceu:null,
  valor:0, observacoes:'', ...o });

// Clientes de mentira — com aniversário e a chave de mensagens do Comunicar.
const CLI = (o) => ({ id:`10000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, telefone:'12999990000', veiculo:null, modelo:null, placa:null,
  email:null, origem:'Google', observacoes:'', nascimento:null, nascimento_tela:'', aceita_mensagens:1, aceita_mensagens_em:null,
  aceita_mensagens_motivo:null, created_at:'2026-01-10T12:00:00Z', ...o });
const hojeMD = hoje().slice(5);           // 'MM-DD' de hoje, para o aniversário "é hoje"
let CLIENTES = [
  CLI({ nome:'Maria Aparecida', veiculo:'HB20', placa:'FHR6F16', telefone:'12991110001', nascimento:`1904-${hojeMD}`, nascimento_tela: hojeMD.split('-').reverse().join('/') }),
  CLI({ nome:'Carlos Eduardo Nogueira', veiculo:'Corolla', modelo:'2019', placa:'GFK3H26', telefone:'12991110002', nascimento:'1980-03-15', nascimento_tela:'15/03/1980', origem:'WhatsApp' }),
  CLI({ nome:'Vanderlei', veiculo:'City', placa:'FHR6F16', telefone:'12991110003', aceita_mensagens:0, aceita_mensagens_em:'2026-10-02T14:03:00Z', aceita_mensagens_motivo:'Pediu no balcão', origem:'Indicação' }),
  CLI({ nome:'Patrícia Lemos', veiculo:'Onix', telefone:'12991110004', origem:'Instagram' }),
  CLI({ nome:'Sem Telefone', telefone:null }),
];
const fichaDe = (c) => {
  const concl = AGENDA.filter(a => a.cliente_id === c.id && a.status === 'concluido').sort((x, y) => `${y.data} ${y.hora}`.localeCompare(`${x.data} ${x.hora}`))[0];
  const total = AGENDA.filter(a => a.cliente_id === c.id).length;
  if (!concl) return { ...c, ultima_visita:null, proxima_revisao:null, total_agendamentos: total };
  const oleo = /[óo]leo/i.test(concl.servico);
  const d = new Date(`${concl.data}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + (oleo ? 6 : 12));
  return { ...c, ultima_visita:{ data: concl.data, servico: concl.servico, agendamento_id: concl.id },
    proxima_revisao:{ data: d.toISOString().slice(0, 10), meses: oleo ? 6 : 12, rotulo: oleo ? 'Troca de óleo' : 'Revisão geral' }, total_agendamentos: total };
};

/* semearAgenda(): os horários de mentira — POST /api/__reset volta a este estado
   (o roteiro de navegador usa entre um papel e outro). */
let AGENDA = [];
let PATIO = [], EXTRAS = [];
function semearAgenda() {
AGENDA = [
  ag({ cliente_nome:'Maria Aparecida', cliente_id:CLIENTES[0].id, telefone:'12991110001', veiculo:'HB20', placa:'FHR6F16', servico:'Montagem de pneus e alinhamento', data:dia(0), hora:hm(40),  status:'confirmado', confirmado:1, origem:'Google', lembrete:{ status:'enviado', resposta:'positiva' }, orcamento:{ status:'aprovado', numero:42, total:1990, total_a_vista:1890, decidido_em:'2026-10-10T12:00:00Z' } }),
  ag({ cliente_nome:'Carlos Eduardo Nogueira', cliente_id:CLIENTES[1].id, telefone:'12991110002', veiculo:'Corolla', placa:'GFK3H26', servico:'Troca de óleo de câmbio (diálise)', data:dia(0), hora:hm(180), status:'aguardando', lembrete:{ status:'enviado', resposta:null } }),
  ag({ cliente_nome:'Carlos Eduardo Nogueira', cliente_id:CLIENTES[1].id, telefone:'12991110002', veiculo:'Corolla', placa:'GFK3H26', servico:'Troca de óleo de motor', data:dia(-120), hora:'09:00', status:'concluido', compareceu:1, confirmado:1 }),
  ag({ cliente_nome:'Donizetti', veiculo:'ix35', servico:'Pastilha de freio', data:dia(0), hora:hm(-50), status:'confirmado', confirmado:1, origem:'Indicação' }),
  ag({ cliente_nome:'Patrícia Lemos', veiculo:'Onix', servico:'Revisão de suspensão', data:dia(0), hora:hm(-160), status:'compareceu', compareceu:1, confirmado:1 }),
  ag({ cliente_nome:'Diogo Barros', servico:'Alinhamento 3D', data:dia(0), hora:hm(-240), status:'nao_veio', compareceu:0 }),
  ag({ cliente_nome:'Altamir', veiculo:'Ka', placa:'GFK3H26', servico:'Veio cotar troca da correia dentada', data:dia(0), hora:hm(-300), status:'concluido', compareceu:1, confirmado:1 }),
  ag({ cliente_nome:'Renata Figueiredo de Albuquerque Monteiro', veiculo:'Compass', servico:'Diagnóstico com scanner + limpeza de bicos injetores', data:dia(1), hora:'08:30', status:'confirmado', confirmado:1, origem:'Instagram' }),
  ag({ cliente_nome:'Vanderlei', cliente_id:CLIENTES[2].id, telefone:'12991110003', veiculo:'City', placa:'FHR6F16', servico:'Troca de óleo de câmbio', data:dia(1), hora:'14:00', status:'aguardando', lembrete:{ status:'enviado', resposta:'parar' } }),
  ag({ cliente_nome:'José Antônio', veiculo:'S10', servico:'Troca de embreagem', data:dia(4), hora:'09:00', status:'confirmado', confirmado:1, origem:'Telefone' }),
  ag({ cliente_nome:'Luciana Prado', veiculo:'Fit', servico:'Troca de amortecedores', data:dia(-1), hora:'14:30', status:'confirmado', confirmado:1 }),
  ag({ cliente_nome:'Marcos Vinícius', veiculo:'Gol', servico:'Correia dentada', data:dia(-1), hora:'09:00', status:'nao_veio', compareceu:0 }),
  ag({ cliente_nome:'Sueli', veiculo:'Civic', servico:'Troca de óleo de motor', data:dia(-3), hora:'10:00', status:'aguardando' }),
  ag({ cliente_nome:'Cliente Antigo', veiculo:'Palio', servico:'Revisão de motor', data:dia(-20), hora:'11:00', status:'confirmado', confirmado:1 }),
  ag({ cliente_nome:'Rogério (chegou ontem, sem desfecho)', veiculo:'Hilux', servico:'Revisão de motor', data:dia(-1), hora:'08:00', status:'compareceu', compareceu:1, confirmado:1 }),
  ag({ cliente_nome:'Sem Telefone', telefone:null, lead_id:null, servico:'Troca de óleo de motor', data:dia(0), hora:hm(90), status:'aguardando' }),
  ag({ cliente_nome:'Otávio (já pago)', veiculo:'Uno', servico:'Troca de óleo de motor', data:dia(-30), hora:'10:30', status:'concluido', compareceu:1, confirmado:1, valor:280 }),
  ag({ cliente_nome:'Helena (pago)', veiculo:'Kwid', servico:'Troca de óleo de motor', data:dia(-12), hora:'15:00', status:'concluido', compareceu:1, confirmado:1, valor:320 }),
  ag({ cliente_nome:'Bruno (não fechou)', veiculo:'Tracker', servico:'Orçamento de suspensão', data:dia(-2), hora:'16:00', status:'nao_fechou', compareceu:1 }),
];

// Leonardo e Gabriel em alguns horários: carga por consultor e "Minha agenda"
AGENDA[0].consultor_id = '20000000-0000-4000-8000-000000000101'; AGENDA[0].consultor_nome = 'Leonardo';
AGENDA[1].consultor_id = '20000000-0000-4000-8000-000000000102'; AGENDA[1].consultor_nome = 'Gabriel';
AGENDA[7].consultor_id = '20000000-0000-4000-8000-000000000102'; AGENDA[7].consultor_nome = 'Gabriel';
for (const a of AGENDA) if (!a.consultor_id) a.consultor_nome = null;
// Pátio de mentira: Patrícia está em execução (1 extra aprovado, 1 esperando); Rogério já foi ENTREGUE sem desfecho
const patricia = AGENDA.find(a => a.cliente_nome === 'Patrícia Lemos'), rogerio = AGENDA.find(a => a.cliente_nome.startsWith('Rogério'));
PATIO = [
  { id:'30000000-0000-4000-8000-000000000001', numero:101, etapa:'em_execucao', etapa_em:new Date(Date.now() - 50 * 60e3).toISOString(),
    agendamento_id: patricia.id, token_publico:'a1b2c3d4e5f60718293a4b5c', entregue_em:null },
  { id:'30000000-0000-4000-8000-000000000002', numero:98, etapa:'entregue', etapa_em:new Date(Date.now() - 3 * 3600e3).toISOString(),
    agendamento_id: rogerio.id, token_publico:'ffeeddccbbaa009988776655', entregue_em:new Date(Date.now() - 3 * 3600e3).toISOString() },
];
EXTRAS = [
  { os_id: PATIO[0].id, status:'aprovado', valor:450 },
  { os_id: PATIO[0].id, status:'pendente', valor:180 },
  { os_id: PATIO[0].id, status:'recusado', valor:900 },
];
}

semearAgenda();

const MAPA = {
  confirmado:{ status:'confirmado', confirmado:1, compareceu:null }, compareceu:{ status:'compareceu', compareceu:1 },
  nao_veio:{ status:'nao_veio', compareceu:0 }, em_atendimento:{ status:'em_atendimento' },
  concluido:{ status:'concluido', compareceu:1 }, nao_fechou:{ status:'nao_fechou', compareceu:1 },
  aguardando:{ status:'aguardando', compareceu:null }, cancelado:{ status:'cancelado', compareceu:null },
};

function estatisticas() {
  const d = hoje();
  const agendaHoje = AGENDA.filter(a => a.data === d).sort((a, b) => a.hora.localeCompare(b.hora));
  const esperando = (a) => ['aguardando', 'confirmado'].includes(a.status) && a.compareceu !== 1;
  const faltouPeloStatus = (a) => ['nao_veio', 'cancelado'].includes(a.status);
  const veio = (a) => ['concluido', 'nao_fechou'].includes(a.status)
    || (!faltouPeloStatus(a) && (a.compareceu === 1 || ['compareceu', 'em_atendimento'].includes(a.status)));
  const faltou = (a) => !esperando(a) && !veio(a) && (faltouPeloStatus(a) || a.compareceu === 0);
  const seteDias = (() => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - 7); return x.toISOString().slice(0, 10); })();
  const candidatos = AGENDA.filter(a => ['aguardando', 'confirmado', 'nao_veio'].includes(a.status) && a.data >= seteDias);
  return {
    cards: { totalHoje: agendaHoje.length, concluidosHoje: agendaHoje.filter(a => a.status === 'concluido').length,
      compareceram: agendaHoje.filter(a => !esperando(a) && veio(a)).length, naoVieram: agendaHoje.filter(faltou).length,
      naoFechou: agendaHoje.filter(a => a.status === 'nao_fechou').length, aguardando: agendaHoje.filter(esperando).length,
      totalClientes: 2226, totalConsult: 1,
      semTelefone30d: AGENDA.filter(a => !a.telefone && a.data >= (() => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - 30); return x.toISOString().slice(0, 10); })()).length },
    agendaHoje, ultimos: montarUltimos(candidatos, d, agoraHHMM()),
    naOficina: AGENDA.filter(a => ['compareceu', 'em_atendimento'].includes(a.status) && a.data < d && a.data >= seteDias),
    data: d, agora: agoraHHMM(),
  };
}

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };

/* ---------------------------------------------------------------------------
   RODADA 3 — os PAPÉIS do padrão comum de login. Abra com ?papel=:
     admin (padrão) · gestor · atendente (é consultor: tem "Minha agenda") ·
     agenda (Franklin, só presença) · desativado · semacesso (sem a Agenda nos
     apps) · trocarsenha (senha provisória) · mfa (pede o código: 123456)
   As regras de acesso são as REAIS (regras.js), as mesmas do servidor.
   --------------------------------------------------------------------------- */
const PAPEIS_MOCK = ['admin', 'gestor', 'atendente', 'agenda', 'desativado', 'semacesso', 'trocarsenha', 'mfa'];
const U = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CONS = [
  { id: U(101), nome:'Leonardo', cor:'#e6192e', ativo:1, telefone:'12991234567', perfil_id: U(1) },
  { id: U(102), nome:'Gabriel', cor:'#3b82f6', ativo:1, telefone:null, perfil_id: U(3) },
  { id: U(103), nome:'Antigo', cor:'#64748b', ativo:0, telefone:null, perfil_id: null },
  // rodada 4: igual ao banco real ("Consultor Prensencial Gabriel" sem login) — aqui o login reconhecido é o do Franklin
  { id: U(104), nome:'Consultor Presencial Franklin', cor:'#22c55e', ativo:1, telefone:null, perfil_id: null },
];
const PERFIS = {
  admin:       { id: U(1), nome:'João Pedro Famelli', papel:'admin', apps:['atendimento','crm','agenda','comunicar','orcador','ads'], cargo:'Dono' },
  gestor:      { id: U(2), nome:'Leo Gestor', papel:'gestor', apps:['agenda','crm','atendimento'], cargo:'Gerente' },
  atendente:   { id: U(3), nome:'Gabriel', papel:'atendente', apps:['agenda','atendimento'], cargo:'Consultor' },
  agenda:      { id: U(4), nome:'Franklin', papel:'agenda', apps:['agenda'], cargo:'Consultor presencial' },
  desativado:  { id: U(5), nome:'Saiu', papel:'atendente', apps:['agenda'], ativo:false },
  semacesso:   { id: U(6), nome:'Só CRM', papel:'atendente', apps:['crm','atendimento'] },
  trocarsenha: { id: U(7), nome:'Novata', papel:'atendente', apps:['agenda'], precisa_trocar_senha:true },
  mfa:         { id: U(8), nome:'Com Código', papel:'gestor', apps:['agenda','crm'] },
};
let NOTIF = [], TAREFAS = [];
/* RODADA 5: lista de espera, confirmações, serviços com duração e janelas (como no banco real) */
let ESPERA = [], CONFIRMACOES = [];
const SERVICOS_MOCK = [{ nome: 'Troca de óleo', duracao_min: 40 }, { nome: 'Alinhamento 3D', duracao_min: 45 }, { nome: 'Revisão de Motor', duracao_min: 360 }, { nome: 'Freios', duracao_min: 90 }, { nome: 'Diagnóstico com Scanner', duracao_min: 30 }, { nome: 'Correia Dentada', duracao_min: 240 }];
const JANELAS_MOCK = [{ tipo_servico: 'Troca de óleo do motor e filtros', dias: 'seg-sex', inicio: '08:00:00', fim: '11:00:00' }, { tipo_servico: 'Troca de óleo do motor e filtros', dias: 'seg-sex', inicio: '14:00:00', fim: '17:00:00' },
  { tipo_servico: 'Troca de óleo do motor e filtros', dias: 'sabado', inicio: '08:00:00', fim: '11:00:00' }, { tipo_servico: 'Pneus, alinhamento e balanceamento', dias: 'seg-sex', inicio: '08:00:00', fim: '10:00:00' }];
function semearRodada5() {
  const agora = Date.now();
  ESPERA = [
    { id: U(601), status: 'aberta', cliente_nome: 'Joana Ribeiro', telefone: '12991110099', servico: 'Troca de óleo', veiculo: 'Creta', placa: 'ABC1D23', preferencia: 'Manhã', de: dia(0), ate: dia(7), observacoes: 'Só até 10h', cliente_id: null, agendamento_id: null, created_at: new Date(agora - 2 * 864e5).toISOString() },
    { id: U(602), status: 'aberta', cliente_nome: 'Pedro Alcântara', telefone: '12991110098', servico: 'Alinhamento 3D', veiculo: null, placa: null, preferencia: 'Qualquer horário', de: null, ate: null, observacoes: null, cliente_id: null, agendamento_id: null, created_at: new Date(agora - 6 * 3600e3).toISOString() },
    { id: U(603), status: 'agendada', cliente_nome: 'Marina', telefone: '12991110097', servico: 'Freios', veiculo: 'Polo', placa: null, preferencia: 'Tarde', de: null, ate: null, observacoes: null, cliente_id: null, agendamento_id: null, created_at: new Date(agora - 5 * 864e5).toISOString() },
  ];
  CONFIRMACOES = [{ agendamento_id: AGENDA[8]?.id, token: 'a1b2c3d4e5f6a7b8c9d0e1f2ffff', resposta: 'confirmou', respondido_em: new Date(agora - 3600e3).toISOString(), enviado_em: new Date(agora - 7200e3).toISOString(), canal: 'whatsapp' }];
  if (AGENDA[8]) AGENDA[8].confirmacao = { resposta: 'confirmou', respondido_em: CONFIRMACOES[0].respondido_em, enviado_em: CONFIRMACOES[0].enviado_em, canal: 'whatsapp' };
  if (AGENDA[7]) AGENDA[7].confirmacao = { resposta: null, respondido_em: null, enviado_em: new Date(agora - 1800e3).toISOString(), canal: 'whatsapp' };
}
semearRodada5();
function semearRodada3() {
  const agora = Date.now();
  NOTIF = [
    { id: U(201), tipo:'atraso', titulo:'Donizetti está 50 min atrasado', corpo:'Pastilha de freio — marque se veio ou não veio.', link:`/?agendamento=${AGENDA[3].id}`, app:'agenda', lida_em:null, created_at:new Date(agora - 5 * 60e3).toISOString() },
    { id: U(202), tipo:'tarefa', titulo:'Nova tarefa: Reagendar', corpo:'Diogo Barros não veio', link:null, app:'automacao', lida_em:null, created_at:new Date(agora - 40 * 60e3).toISOString() },
    { id: U(203), tipo:'conversa', titulo:'Conversa passada para você: <b>Maria</b>', corpo:'Quero remarcar', link:'/?conversa=abc', app:'atendimento', lida_em:new Date().toISOString(), created_at:new Date(agora - 26 * 3600e3).toISOString() },
  ];
  TAREFAS = [
    { id: U(301), titulo:'Confirmar com o cliente', descricao:'Renata — Diagnóstico, amanhã às 08:30. O lembrete automático é do Comunicar.', origem:'automacao', prioridade:2, vence_em:new Date(agora + 3600e3).toISOString(), status:'aberta', agendamento_id: AGENDA[7].id },
    { id: U(302), titulo:'Reagendar', descricao:'Diogo Barros não veio (Alinhamento 3D).', origem:'automacao', prioridade:1, vence_em:new Date(agora - 3600e3).toISOString(), status:'aberta', agendamento_id: AGENDA[5].id },
  ];
}
let SENHA_TROCADA = false, MFA_OK = false, MFA_LIGADO = false;
const perfilMock = () => {
  const base = PERFIS[PAPEL] || PERFIS.admin;
  const apps = base.papel === 'agenda' ? ['agenda'] : base.apps;
  const cons = CONS.find((c) => c.perfil_id === base.id);
  return { id: base.id, nome: base.nome, email: `${PAPEL}@indycartaubate.com`, papel: base.papel, ativo: base.ativo !== false,
    apps, cargo: base.cargo || '', telefone: '', avatar_cor: '#e50914', preferencias: {},
    pode_agenda: base.papel === 'admin' || apps.includes('agenda'), gestor: ['admin', 'gestor'].includes(base.papel),
    precisa_trocar_senha: !!base.precisa_trocar_senha && !SENHA_TROCADA,
    consultor_id: cons?.id || null, consultor_nome: cons?.nome || null };
};

const DUBLE_SUPABASE = (papel, semSessao = false) => `<script>window.__PAPEL_MOCK=${JSON.stringify(papel)};
(function(){
  var mfaOk=false, ligado=${papel === 'mfa' ? 'true' : 'false'}, logado=${semSessao ? 'false' : 'true'};
  function ok(d){return Promise.resolve({data:d,error:null});}
  window.supabase={createClient:function(){return {
    auth:{
      getSession:function(){return ok({session:logado?{access_token:'mock',user:{email:window.__PAPEL_MOCK+'@indycartaubate.com'}}:null});},
      signInWithPassword:function(c){ if(c.password==='errada') return Promise.resolve({data:null,error:{message:'Invalid login credentials'}}); logado=true; return ok({}); },
      signOut:function(){return ok({});},
      onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}};},
      resetPasswordForEmail:function(){return ok({});},
      updateUser:function(){return ok({user:{}});},
      mfa:{
        getAuthenticatorAssuranceLevel:function(){return ok({currentLevel:mfaOk?'aal2':'aal1',nextLevel:ligado?'aal2':'aal1'});},
        listFactors:function(){return ok({totp:ligado?[{id:'f1',status:'verified'}]:[],all:[]});},
        enroll:function(){return ok({id:'f1',totp:{qr_code:'data:image/svg+xml;utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22180%22 height=%22180%22%3E%3Crect width=%22180%22 height=%22180%22 fill=%22%23eee%22/%3E%3Ctext x=%2230%22 y=%2295%22%3EQR de teste%3C/text%3E%3C/svg%3E',secret:'JBSWY3DPEHPK3PXP'}});},
        challenge:function(){return ok({id:'ch1'});},
        verify:function(o){ if(o.code!=='123456') return Promise.resolve({data:null,error:{message:'Invalid TOTP code entered'}}); mfaOk=true; ligado=true; return ok({}); },
        unenroll:function(){ ligado=false; return ok({}); }
      }
    },
    channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;},
    removeChannel:function(){}
  };}};
})();</script>`;

let PAPEL = 'admin';
let FALHA = { status: 503, vezes: 0 };
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname, m = req.method;
  if (!p.startsWith('/api/')) {
    if (p === '/' || p === '/index.html') {
      const pedido = url.searchParams.get('papel');
      PAPEL = PAPEIS_MOCK.includes(pedido) ? pedido : 'admin';
      SENHA_TROCADA = false; semearRodada3();
      const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8')
        .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase[^"]*"[^>]*><\/script>/, DUBLE_SUPABASE(PAPEL, url.searchParams.get('semsessao') === '1'));
      res.writeHead(200, { 'Content-Type': MIME['.html'] }); return res.end(html);
    }
    if (p === '/sw.js') { res.writeHead(200, { 'Content-Type': MIME['.js'] }); return res.end('/* sem service worker no modo de teste */'); }
    // rodada 5: a página pública do cliente (/confirmar/)
    const arq = path.join(PUBLIC, path.normalize(p === '/confirmar/' || p === '/confirmar' ? '/confirmar/index.html' : p));
    if (!arq.startsWith(PUBLIC) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end('Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(arq)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    return fs.createReadStream(arq).pipe(res);
  }

  let body = {};
  if (m !== 'GET') { let b = ''; for await (const c of req) b += c; try { body = JSON.parse(b || '{}'); } catch {} }
  await new Promise(r => setTimeout(r, 220));            // latência de verdade, para ver o "ocupado" e o esqueleto
  /* RODADA 4 — simular o Render fora do ar: POST /api/__falha { status:503, vezes:N }
     faz os próximos N pedidos da API responderem esse status (o roteiro de
     navegador usa para testar a faixa "acordando" e a fila do desfecho). */
  if (p === '/api/__reset') { semearAgenda(); semearRodada5(); for (const c of CONS) if (c.id === U(104)) c.perfil_id = null; FALHA = { status: 503, vezes: 0 }; return json(res, 200, { ok: true, total: AGENDA.length }); }
  /* ---- RODADA 5: confirmação PÚBLICA (sem login, pelo token) ---- */
  if (p === '/api/publico/confirmacao') {
    const t = m === 'GET' ? url.searchParams.get('t') : body.t;
    const c = CONFIRMACOES.find(x => x.token === t);
    if (!c) return json(res, 404, { erro: 'Este link não vale mais. Fale com a oficina pelo WhatsApp.' });
    const a = AGENDA.find(x => x.id === c.agendamento_id);
    if (m === 'GET') return json(res, 200, { token: c.token, resposta: c.resposta, respondido_em: c.respondido_em, oficina: { nome: 'IndyCar Centro Automotivo', endereco: 'Av. Bandeirantes, 875 — Taubaté/SP', mapa: 'https://www.google.com/maps/search/?api=1&query=Av.+Bandeirantes+875+Taubate', whatsapp: 'https://wa.me/5512996830272' },
      agendamento: { id: a.id, primeiro_nome: a.cliente_nome.split(' ')[0], servico: a.servico, data: a.data, hora: a.hora, status: a.status, veiculo: a.veiculo, consultor: a.consultor_nome, passou: `${a.data} ${a.hora}` < `${hoje()} ${agoraHHMM()}` } });
    if (!['confirmou', 'nao_vem', 'remarcar'].includes(body.resposta)) return json(res, 400, { erro: 'Resposta inválida.' });
    c.resposta = body.resposta; c.respondido_em = new Date().toISOString(); c.observacao = body.observacao || null;
    if (body.resposta === 'confirmou' && ['aguardando', 'confirmado'].includes(a.status)) { a.confirmado = 1; a.status = 'confirmado'; }
    else TAREFAS.unshift({ id: U(450 + TAREFAS.length), titulo: body.resposta === 'remarcar' ? 'Remarcar' : 'Cliente avisou que não vem', descricao: `${a.cliente_nome} respondeu pelo link.`, origem: 'agenda', prioridade: 1, status: 'aberta', agendamento_id: a.id });
    console.log('CONFIRMACAO', a.cliente_nome, body.resposta);
    return json(res, 200, { ok: true, resposta: c.resposta, respondido_em: c.respondido_em });
  }
  if (p === '/api/__falha') { FALHA = { status: Number(body.status) || 503, vezes: Number(body.vezes) || 0 }; return json(res, 200, FALHA); }
  if (FALHA.vezes > 0) { FALHA.vezes--; res.writeHead(FALHA.status, { 'Content-Type':'text/html' }); return res.end('<h1>Service Unavailable (mock)</h1>'); }
  const soPresenca = PAPEL === 'agenda';
  let mm;

  // ---- RODADA 3: porteiro com os papéis (regras.js real) e as rotas novas
  if (p === '/api/versao') return json(res, 200, { versao:'mock' });
  if (!['/api/config', '/api/primeiro-acesso'].includes(p)) {
    const eu = perfilMock();
    const recusa = decidirAcesso({ perfil: eu, metodo: m, rota: p });
    if (recusa) return json(res, recusa.status, { erro: recusa.erro, codigo: recusa.codigo });
  }
  if (p === '/api/perfil' && m === 'GET') return json(res, 200, perfilMock());
  if (p === '/api/perfil' && m === 'PUT') {
    const b = PERFIS[PAPEL] || PERFIS.admin;
    for (const k of ['nome', 'cargo', 'telefone', 'avatar_cor']) if (body[k] !== undefined) b[k] = body[k];
    return json(res, 200, { ...perfilMock(), ...body });
  }
  if (p === '/api/perfil/senha-trocada') { SENHA_TROCADA = true; return json(res, 200, { ok:true }); }
  if (p === '/api/notificacoes' && m === 'GET') return json(res, 200, { itens: NOTIF, naoLidas: NOTIF.filter((n) => !n.lida_em).length });
  if (p === '/api/notificacoes/lidas') {
    for (const n of NOTIF) if (body.todas || (body.ids || []).includes(n.id)) n.lida_em = n.lida_em || new Date().toISOString();
    return json(res, 200, { ok:true });
  }
  if (p === '/api/tarefas' && m === 'GET') return json(res, 200, TAREFAS.filter((t) => t.status === 'aberta'));
  if (p === '/api/tarefas' && m === 'POST') {
    if (!String(body.titulo || '').trim()) return json(res, 400, { erro:'Escreva o que precisa ser feito.' });
    const t = { id: U(400 + TAREFAS.length), status:'aberta', origem:'agenda', prioridade:2, ...body };
    TAREFAS.unshift(t); console.log('TAREFA', JSON.stringify(t)); return json(res, 201, t);
  }
  if ((mm = p.match(/^\/api\/tarefas\/([0-9a-f-]{36})$/)) && m === 'PATCH') {
    const t = TAREFAS.find((x) => x.id === mm[1]); if (!t) return json(res, 404, { erro:'Não encontrado' });
    t.status = body.status; return json(res, 200, t);
  }
  // ---- RODADA 4: valor ao concluir, pendências, contagens, consultor ↔ login
  const antigasMock = () => AGENDA.filter(a => ['compareceu', 'em_atendimento', 'aguardando', 'confirmado'].includes(a.status) && a.data < dia(-7));
  if (p === '/api/contagens') {
    const gestor = ['admin', 'gestor'].includes(perfilMock().papel);
    return json(res, 200, { followup: AGENDA.filter(a => ['nao_veio', 'nao_fechou'].includes(a.status)).length,
      semValor: gestor ? AGENDA.filter(a => a.status === 'concluido' && !(a.valor > 0)).length : null,
      antigas: gestor ? antigasMock().length : null, entregues: gestor ? entreguesSemDesfecho(PATIO, AGENDA).length : null,
      espera: ESPERA.filter(e => e.status === 'aberta').length, semConfirmacao: AGENDA.filter(a => a.data === dia(1) && a.status === 'aguardando' && !a.confirmado).length, proximoDia: dia(1) });
  }
  if (p === '/api/confirmacoes/resumo') {
    if (!['admin', 'gestor'].includes(perfilMock().papel)) return json(res, 403, { erro:'Só o gestor ou o administrador pode fazer isso.' });
    return json(res, 200, { dias: 30, enviadas: 12, abertas: 9, confirmaram: 7, remarcar: 2, nao_vem: 1, sem_resposta: 2, taxa_resposta: 83 });
  }
  /* ---- RODADA 5: horários livres como serviço (as funções REAIS de horarios.js) ---- */
  const baseHor = () => ({ consultores: CONS.filter(c => c.ativo), servicos: SERVICOS_MOCK, janelas: JANELAS_MOCK });
  const agoraMock = () => { const [h, mi] = agoraHHMM().split(':').map(Number); return { data: hoje(), min: h * 60 + mi }; };
  if (p === '/api/horarios-livres/dia') {
    const data = url.searchParams.get('data'), servico = url.searchParams.get('servico') || null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) return json(res, 400, { erro: 'Informe ?data=AAAA-MM-DD.' });
    const b = baseHor();
    const dia = livresDoDia({ data, agora: agoraMock(), agendamentos: AGENDA, consultores: b.consultores, duracao: duracaoDoServico(servico, b.servicos),
      janelas: janelasDoServico(servico, b.janelas, diaDaSemana(data)), consultor_id: url.searchParams.get('consultor_id') || null, ignorar: url.searchParams.get('ignorar') || null });
    const nomes = new Map(b.consultores.map(c => [c.id, c.nome]));
    return json(res, 200, { ...dia, servico, consultores: b.consultores.map(c => ({ id: c.id, nome: c.nome })),
      horarios: dia.horarios.map(h => ({ ...h, consultores: h.consultores_livres.map(id => ({ id, nome: nomes.get(id) })) })), resumo: resumoDoDia(dia) });
  }
  if (p === '/api/horarios-livres/proximos') {
    const b = baseHor(), servico = url.searchParams.get('servico') || null, desde = url.searchParams.get('desde') || hoje();
    const lista = proximosDias({ desde, agora: agoraMock(), dias: Number(url.searchParams.get('dias')) || 7, porDia: (d) => AGENDA.filter(a => a.data === d),
      consultores: b.consultores, duracao: duracaoDoServico(servico, b.servicos), janelasPorDia: (dow) => janelasDoServico(servico, b.janelas, dow) });
    return json(res, 200, { desde, servico, duracao_min: duracaoDoServico(servico, b.servicos), capacidade: b.consultores.length || 1,
      dias_livres: lista.map(x => ({ data: x.data, motivo: x.motivo, horarios: x.horarios.map(h => h.hora), total: x.horarios.length })), resumo: lista.map(resumoDoDia).join(' · ') });
  }
  /* ---- RODADA 5: lista de espera ---- */
  if (p === '/api/espera' && m === 'GET') {
    const st = url.searchParams.get('status') || 'aberta';
    let l = st === 'todas' ? ESPERA : ESPERA.filter(e => e.status === st);
    const d = url.searchParams.get('data'); if (d) l = esperaQueCabe(l, d, url.searchParams.get('servico'));
    return json(res, 200, l);
  }
  if (p === '/api/espera' && m === 'POST') {
    if (!body.cliente_nome || !body.servico) return json(res, 400, { erro: 'Informe o nome e o serviço.' });
    const e = { id: U(650 + ESPERA.length), status: 'aberta', created_at: new Date().toISOString(), cliente_id: null, veiculo: null, placa: null, preferencia: null, de: null, ate: null, observacoes: null, agendamento_id: null, ...body, telefone: String(body.telefone || '').replace(/\D/g, '') || null };
    ESPERA.push(e); console.log('ESPERA', JSON.stringify(e)); return json(res, 201, e);
  }
  if ((mm = p.match(/^\/api\/espera\/([0-9a-f-]{36})$/))) {
    const e = ESPERA.find(x => x.id === mm[1]); if (!e) return json(res, 404, { erro: 'Não encontrado' });
    if (m === 'DELETE') { if (!['admin', 'gestor'].includes(perfilMock().papel)) return json(res, 403, { erro: 'Só o gestor ou o administrador pode fazer isso.' }); ESPERA.splice(ESPERA.indexOf(e), 1); return json(res, 200, { ok: true }); }
    Object.assign(e, body, body.telefone !== undefined ? { telefone: String(body.telefone || '').replace(/\D/g, '') || null } : {}); console.log('ESPERA PATCH', e.cliente_nome, e.status); return json(res, 200, e);
  }
  /* ---- RODADA 5: confirmação, aviso de remarcação, ficha 360, aniversários ---- */
  if ((mm = p.match(/^\/api\/agendamentos\/([0-9a-f-]+)\/confirmacao$/)) && m === 'POST') {
    const a = AGENDA.find(x => x.id === mm[1]); if (!a) return json(res, 404, { erro: 'Não encontrado' });
    if (!['aguardando', 'confirmado'].includes(a.status)) return json(res, 409, { erro: 'Esse horário já teve desfecho — não há o que confirmar.' });
    let c = CONFIRMACOES.find(x => x.agendamento_id === a.id && !x.resposta);
    if (!c) { c = { agendamento_id: a.id, token: 'a1b2c3d4e5f6a7b8c9d0e1f2' + String(CONFIRMACOES.length).padStart(4, '0'), resposta: null, respondido_em: null, enviado_em: new Date().toISOString(), canal: 'whatsapp' }; CONFIRMACOES.push(c); }
    a.confirmacao = { resposta: c.resposta, respondido_em: c.respondido_em, enviado_em: c.enviado_em, canal: c.canal };
    const link = `http://localhost:${PORT}/confirmar/?t=${c.token}`;
    const texto = `Oi ${a.cliente_nome.split(' ')[0]}! Aqui é da IndyCar 🏁 Seu horário de ${a.servico} está marcado para ${a.data.split('-').reverse().join('/')} às ${a.hora}. Confirma pra gente? É só tocar: ${link}`;
    return json(res, 200, { link, texto, whatsapp: a.telefone ? `https://wa.me/55${a.telefone}?text=${encodeURIComponent(texto)}` : null, resposta: c.resposta, enviado_em: c.enviado_em });
  }
  if ((mm = p.match(/^\/api\/agendamentos\/([0-9a-f-]+)\/avisar-remarcacao$/)) && m === 'POST') {
    const a = AGENDA.find(x => x.id === mm[1]); if (!a) return json(res, 404, { erro: 'Não encontrado' });
    if (!a.telefone) return json(res, 200, { enfileirado: false, whatsapp: null, motivo: 'Este horário não tem telefone.' });
    const cli = CLIENTES.find(c => c.id === a.cliente_id);
    const texto = `Oi ${a.cliente_nome.split(' ')[0]}! Seu horário foi remarcado para ${a.data} às ${a.hora}.`;
    if (cli && cli.aceita_mensagens === 0) return json(res, 200, { enfileirado: false, whatsapp: `https://wa.me/55${a.telefone}?text=${encodeURIComponent(texto)}`, motivo: 'O cliente pediu para não receber mensagem automática — abri o WhatsApp para você mandar à mão.' });
    console.log('FILA COMUNICAR', a.cliente_nome, texto); return json(res, 200, { enfileirado: true, whatsapp: null, motivo: null });
  }
  if (p === '/api/clientes/360') {
    const t = telefoneNacional(url.searchParams.get('tel')) || ''; const c = CLIENTES.find(x => telefoneNacional(x.telefone) === t);
    const ags = AGENDA.filter(a => telefoneNacional(a.telefone) === t);
    const os = PATIO.filter(o => ags.some(a => a.id === o.agendamento_id) && o.etapa !== 'cancelado');
    return json(res, 200, { telefone: t, cliente: c ? { ...c, aceita_mensagens: c.aceita_mensagens !== 0 } : null,
      conversa: c ? { id: 'conv-1', etapa: 'Agendado', aguardando_consultor: c.nome.startsWith('Patr'), link: `/?tel=${t}` } : null,
      patio: os.map(o => ({ id: o.id, numero: o.numero, etapa: o.etapa, link: `/?os=${o.id}`, extras_pendentes: EXTRAS.filter(e => e.os_id === o.id && e.status === 'pendente').length })),
      leads: c ? [{ id: 'l1', status: ags.some(a => a.status === 'aguardando') ? 'agendado' : 'concluido', link: `/?lead=l1` }] : [],
      orcamentos: ags.filter(a => a.orcamento).map(a => ({ numero: a.orcamento.numero, status: a.orcamento.status })),
      comunicar: c ? [{ tipo: 'lembrete', status: 'enviado', enviado_em: new Date(Date.now() - 864e5).toISOString(), resposta: 'Confirmado!' }] : [],
      tarefas: TAREFAS.filter(x => ags.some(a => a.id === x.agendamento_id) && x.status === 'aberta'),
      indicacoes: { fez: c && c.nome.startsWith('Maria') ? [{ nome: 'Vanderlei' }] : [], foi_indicado_por: c && c.nome.startsWith('Vander') ? { nome: 'Maria Aparecida' } : null },
      resumo: { total_gasto: ags.reduce((s, a) => s + (a.valor || 0), 0), servicos_feitos: ags.filter(a => a.status === 'concluido').length, faltas: ags.filter(a => a.status === 'nao_veio').length,
        ultima_visita: ags.filter(a => a.status === 'concluido').map(a => a.data).sort().at(-1) || null, proximo_horario: ags.filter(a => ['aguardando', 'confirmado'].includes(a.status)).map(a => a.data).sort()[0] || null,
        mensagens_total: c ? 14 : 0, tarefas_abertas: TAREFAS.filter(x => ags.some(a => a.id === x.agendamento_id) && x.status === 'aberta').length, carro_na_oficina: os.some(o => !['entregue', 'cancelado'].includes(o.etapa)) } });
  }
  if (p === '/api/aniversarios') return json(res, 200, { dias: 7, itens: aniversariantes(CLIENTES, hoje(), Number(url.searchParams.get('dias')) || 7) });
  if (p === '/api/valores/pendentes') return json(res, 200, { dias: 120, itens: AGENDA.filter(a => a.status === 'concluido' && !(a.valor > 0)).sort((x, y) => y.data.localeCompare(x.data)) });
  if (p === '/api/pendencias-antigas') return json(res, 200, antigasMock());
  // ---- Pátio (16/10): selo da etapa, link do cliente e entregues sem desfecho
  if (p === '/api/patio/agendamentos') {
    const ids = idsDeAgendamento(url.searchParams.get('ids'));
    const itens = {};
    for (const o of PATIO) if (ids.includes(o.agendamento_id)) itens[o.agendamento_id] = resumoDaOs(o, EXTRAS, 'https://indycar-patio.netlify.app');
    return json(res, 200, { itens });
  }
  if (p === '/api/patio/entregues') {
    if (!['admin', 'gestor'].includes(perfilMock().papel)) return json(res, 403, { erro:'Só o gestor ou o administrador pode fazer isso.' });
    return json(res, 200, entreguesSemDesfecho(PATIO, AGENDA).map(({ os, agendamento }) => ({ ...agendamento, patio: resumoDaOs(os, EXTRAS) })));
  }
  if ((mm = p.match(/^\/api\/agendamentos\/([0-9a-f-]{36})\/valor-sugerido$/))) {
    const a = AGENDA.find(x => x.id === mm[1]); if (!a) return json(res, 404, { erro:'Não encontrado' });
    const hist = AGENDA.filter(x => x.status === 'concluido' && x.valor > 0).map(x => ({ id: x.id, servico: x.servico, valor: x.valor }));
    const os = PATIO.find(o => o.agendamento_id === a.id);
    return json(res, 200, { ...juntarSugestaoComExtras(sugerirValor({ agendamento: a, orcamentos: a.orcamento ? [a.orcamento] : [], lead: null, historico: hist }), os ? EXTRAS.filter(e => e.os_id === os.id) : []), atual: a.valor || 0 });
  }
  if ((mm = p.match(/^\/api\/agendamentos\/([0-9a-f-]{36})\/valor$/)) && m === 'PUT') {
    const a = AGENDA.find(x => x.id === mm[1]); if (!a) return json(res, 404, { erro:'Não encontrado' });
    const v = valorDeEntrada(body.valor);
    if (v === null || !valorValido(v) || v <= 0) return json(res, 400, { erro:'Valor inválido: use só números, ex.: 350 ou 1.250,00.' });
    if (a.status !== 'concluido') return json(res, 409, { erro:'Só dá para preencher o valor de quem "veio e fechou".' });
    a.valor = v; console.log('VALOR PREENCHIDO', a.cliente_nome, v);
    return json(res, 200, { ok:true, valor: v, lead_atualizado: !!a.lead_id });
  }
  if (p === '/api/consultores/sugestoes-login') {
    const usados = new Set(CONS.map(c => c.perfil_id).filter(Boolean));
    const perfis = Object.values(PERFIS).filter(x => x.ativo !== false).map(x => ({ id: x.id, nome: x.nome, papel: x.papel, ativo: true }));
    return json(res, 200, CONS.filter(c => !c.perfil_id).map(c => ({ consultor_id: c.id, consultor: c.nome, ...sugerirLoginDoConsultor(c, perfis, usados) })).filter(s => s.perfil_id));
  }
  if (p === '/api/consultores/distribuir' && m === 'POST') {
    const doDia = AGENDA.filter(a => a.data === body.data);
    const plano = distribuirSemConsultor({ consultores: CONS, agendamentos: doDia });
    for (const x of plano) { const a = AGENDA.find(y => y.id === x.id); a.consultor_id = x.consultor_id; a.consultor_nome = x.consultor_nome; }
    const sobra = doDia.filter(a => !a.consultor_id && ['aguardando', 'confirmado', 'compareceu', 'em_atendimento'].includes(a.status)).length;
    return json(res, 200, { ok:true, data: body.data, atribuidos: plano.length, sem_vaga: sobra, itens: plano });
  }
  if (p === '/api/consultores' && m === 'GET') return json(res, 200, CONS);
  if (p === '/api/consultores/carga') {
    const d = url.searchParams.get('data') || hoje();
    return json(res, 200, cargaDoDia(CONS, AGENDA, d));
  }
  if (p === '/api/consultores/sugerir') {
    const d = url.searchParams.get('data'), h = url.searchParams.get('hora');
    return json(res, 200, { sugestao: sugerirConsultor({ consultores: CONS, agendamentos: AGENDA, data: d, hora: h, ignorar: url.searchParams.get('ignorar') }),
      carga: cargaDoDia(CONS, AGENDA, d).consultores });
  }
  if (p === '/api/consultores' && m === 'POST') { const c = { id: U(110 + CONS.length), ativo:1, ...body }; CONS.push(c); return json(res, 200, c); }
  if ((mm = p.match(/^\/api\/consultores\/([0-9a-f-]{36})$/)) && m === 'PUT') {
    const c = CONS.find((x) => x.id === mm[1]); Object.assign(c, body); console.log('CONSULTOR', JSON.stringify(c)); return json(res, 200, c);
  }
  if (p === '/api/equipe/nomes') return json(res, 200, Object.values(PERFIS).filter((x) => x.ativo !== false).map((x) => ({ id: x.id, nome: x.nome, papel: x.papel })));
  if (p === '/api/equipe' && m === 'GET') {
    const eu = perfilMock();
    const lista = Object.values(PERFIS).map((x) => ({ id: x.id, nome: x.nome, email: `${x.nome.split(' ')[0].toLowerCase()}@indycartaubate.com`, papel: x.papel,
      ativo: x.ativo === false ? 0 : 1, apps: x.papel === 'agenda' ? ['agenda'] : x.apps, ultimo_acesso_em: x.id === U(3) ? new Date(Date.now() - 3600e3).toISOString() : null,
      ultimo_app: x.id === U(3) ? 'agenda' : null, precisa_trocar_senha: !!x.precisa_trocar_senha }));
    return json(res, 200, { equipe: eu.papel === 'admin' ? lista : lista.filter((x) => x.id === eu.id), souAdmin: eu.papel === 'admin', meuId: eu.id });
  }
  if (p === '/api/equipe/apps') { const x = Object.values(PERFIS).find((y) => y.id === body.id); if (x) x.apps = body.apps; return json(res, 200, { ok:true, apps: body.apps }); }
  if (p === '/api/equipe/papel') { const x = Object.values(PERFIS).find((y) => y.id === body.id); if (x) x.papel = body.papel; return json(res, 200, { ok:true, papel: body.papel }); }
  if (p === '/api/equipe/senha-temporaria') return json(res, 200, { ok:true, senha:'Kp7wQm4ZtR9x' });
  if (p === '/api/export/agendamentos.csv' || p === '/api/export/clientes.csv') {
    res.writeHead(200, { 'Content-Type':'text/csv; charset=utf-8' }); return res.end('﻿"id";"cliente"\r\n"1";"Maria"');
  }

  if (p === '/api/versao') return json(res, 200, { versao:'mock' });
  // ---- rodada 2: link de entrada, histórico, mensagens do Comunicar, horários livres, busca
  const tel = (v) => telefoneNacional(v) || '';
  const doCliente = (cid, t) => AGENDA.filter(a => (cid && a.cliente_id === cid) || (t && tel(a.telefone) === tel(t)))
    .sort((x, y) => `${y.data} ${y.hora}`.localeCompare(`${x.data} ${x.hora}`));
  if (p === '/api/abrir') {
    const t = tel(url.searchParams.get('tel')), cid = url.searchParams.get('cliente') || '';
    const c = CLIENTES.find(x => x.id === cid) || (t ? CLIENTES.find(x => tel(x.telefone) === t) : null) || null;
    const ags = doCliente(c?.id, c?.telefone || t);
    return json(res, 200, { cliente:c, telefone: t || tel(c?.telefone) || null, agendamentos: ags,
      pendentes: ags.filter(a => ['aguardando', 'confirmado', 'compareceu', 'em_atendimento'].includes(a.status)).sort((x, y) => `${x.data} ${x.hora}`.localeCompare(`${y.data} ${y.hora}`)) });
  }
  if (p === '/api/clientes/historico') return json(res, 200, doCliente(url.searchParams.get('cliente_id'), url.searchParams.get('tel')).slice(0, 15));
  if (p === '/api/clientes/mensagens') {
    const cid = url.searchParams.get('cliente_id'), t = tel(url.searchParams.get('tel'));
    const c = CLIENTES.find(x => x.id === cid || (t && tel(x.telefone) === t));
    if (!c) return json(res, 200, { envios:[], respostas:[] });
    return json(res, 200, { envios:[
      { id:'e1', tipo:'lembrete', rotulo:'Lembrete do horário', status:'enviado', quando:new Date(Date.now() - 864e5).toISOString(), resposta:'Confirmado, estarei aí <b>!</b>', resposta_tipo:'positiva' },
      { id:'e2', tipo:'aniversario', rotulo:'Feliz aniversário', status:'enviado', quando:'2026-09-02T12:00:00Z', resposta:null, resposta_tipo:null },
      { id:'e3', tipo:'revisao', rotulo:'Lembrete de revisão', status:'falhou', quando:'2026-08-20T12:00:00Z', resposta:null, resposta_tipo:null },
    ], respostas:[{ id:'r1', satisfeito:true, nota:10, comentario:'Ótimo atendimento', quando:'2026-08-01T12:00:00Z' }] });
  }
  if (p === '/api/horarios-livres') {
    const [h, mi] = agoraHHMM().split(':').map(Number);
    return json(res, 200, { capacidade:1, sugestoes: horariosLivres({ desde: url.searchParams.get('data') || hoje(), agora:{ data:hoje(), min:h * 60 + mi },
      agendamentos: AGENDA, capacidade:1, ignorar: url.searchParams.get('ignorar') }) });
  }
  if (p === '/api/busca') {
    const q = (url.searchParams.get('q') || '').toLowerCase(), d = q.replace(/\D/g, '');
    const casa = (vals) => casaBusca(vals, q);
    return json(res, 200, {
      agendamentos: AGENDA.filter(a => casa([a.cliente_nome, a.placa, a.veiculo, a.servico]) || (d.length >= 4 && tel(a.telefone).includes(d))).slice(0, 12),
      clientes: CLIENTES.filter(c => casa([c.nome, c.placa, c.veiculo]) || (d.length >= 4 && tel(c.telefone).includes(d))).slice(0, 8),
      espera: ESPERA.filter(e => e.status === 'aberta' && (casa([e.cliente_nome, e.placa, e.servico]) || (d.length >= 4 && tel(e.telefone).includes(d)))).slice(0, 6) });
  }
  if (p === '/api/servicos') return json(res, 200, [
    { id:'s1', nome:'Troca de Óleo de Motor', duracao_min:40, ativo:1 }, { id:'s2', nome:'Alinhamento 3D', duracao_min:45, ativo:1 },
    { id:'s3', nome:'Revisão de Motor', duracao_min:360, ativo:1 }, { id:'s4', nome:'Freios', duracao_min:90, ativo:1 },
    { id:'s5', nome:'Diagnóstico com Scanner', duracao_min:30, ativo:1 }]);
  if (p === '/api/config') return json(res, 200, { configurado:true, supabaseUrl:'http://mock.local', supabaseAnonKey:'mock' });
  if (p === '/api/primeiro-acesso') return json(res, 200, { aberto:false });
  // saúde: o cenário real de hoje (chave do CodeWords recusada) — ?saude=ok no HTML não existe; edite aqui para testar sem faixa
  if (p === '/api/saude') return json(res, 200, { ok:false, problema:'codewords-fora', desde:'2026-10-01T16:56:31Z', checado_em:new Date().toISOString(),
    resumo:'O CodeWords (que leva as mensagens do WhatsApp) respondeu com erro 401.' });
  if (p === '/api/whatsapp/config') return json(res, 200, { ativo:0, phone_number_id:'', tem_token:false, token_mask:'', verify_token:'indycar', api_version:'v21.0', numero_exibicao:'' });
  if (p === '/api/whatsapp/ia/config') return json(res, 200, { tem_cw_chave:true, cw_chave_mask:'••••••••abcd', cw_service_id:'indycar_carlos_whatsapp_x', cw_db_service_id:'indycar_agendamentos_db_x', cw_noshow_service_id:'', cw_base_url:'https://runtime.codewords.ai' });
  if (p === '/api/whatsapp/conexao') return json(res, 200, { configurado:true, ok:false, status:401, erro:'A chave do CodeWords foi recusada (401). Nenhum WhatsApp automático sai até trocá-la: peça ao gestor para trocar em Atendimento › Integrações.' });
  if (p === '/api/integracoes') return json(res, 200, { ics_token:'mock-token', webhook_url:'', webhook_ativo:false });
  if (p === '/api/equipe') return json(res, 200, { equipe:[{ id:'u1', nome:'João Pedro Famelli', email:'teste@indycartaubate.com', papel:'admin', ativo:1 }], souAdmin:true, meuId:'u1' });
  // "achar pelo nome": conversas de mentira + clientes
  if (p === '/api/clientes/achar') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    if (q.length < 2) return json(res, 200, []);
    const conv = [{ nome:'Maria Aparecida', telefone:'12991110001', cliente_id:CLIENTES[0].id, quando:'2026-10-08T15:20:00Z', origem:'conversa', veiculo:'HB20', placa:'FHR6F16' },
      { nome:'Marcos Vinícius', telefone:'12991110077', cliente_id:null, quando:'2026-10-07T10:00:00Z', origem:'conversa', veiculo:null, placa:null }];
    const cli = CLIENTES.filter(c => c.telefone).map(c => ({ nome:c.nome, telefone:c.telefone, cliente_id:c.id, quando:c.created_at, origem:'cliente', veiculo:c.veiculo, placa:c.placa }));
    const vistos = new Set(); const saida = [];
    for (const c of [...conv, ...cli]) { if (!c.nome.toLowerCase().includes(q) || vistos.has(c.telefone)) continue; vistos.add(c.telefone); saida.push(c); }
    return json(res, 200, saida.slice(0, 8));
  }
  // clientes: lista, ficha, criar e editar (tudo na memória)
  if (p === '/api/clientes' && m === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const l = q ? CLIENTES.filter(c => [c.nome, c.telefone, c.placa].some(x => String(x || '').toLowerCase().includes(q))) : CLIENTES;
    return json(res, 200, l.slice().sort((a, b) => a.nome.localeCompare(b.nome)));
  }
  if (p === '/api/clientes' && m === 'POST') {
    if (!body.nome) return json(res, 400, { erro:'Informe o nome.' });
    const c = CLI({ ...body, telefone: String(body.telefone || '').replace(/\D/g, '') || null });
    CLIENTES.push(c); return json(res, 200, c);
  }
  if ((mm = p.match(/^\/api\/clientes\/([0-9a-f-]+)\/ficha$/)) && m === 'GET') {
    const c = CLIENTES.find(x => x.id === mm[1]);
    return c ? json(res, 200, fichaDe(c)) : json(res, 404, { erro:'Não encontrado' });
  }
  if ((mm = p.match(/^\/api\/clientes\/([0-9a-f-]+)$/))) {
    const c = CLIENTES.find(x => x.id === mm[1]);
    if (!c) return json(res, 404, { erro:'Não encontrado' });
    if (m === 'DELETE') { CLIENTES = CLIENTES.filter(x => x !== c); return json(res, 200, { ok:true }); }
    if (m === 'PUT') {
      if (body.nascimento !== undefined) {
        const t = String(body.nascimento || '').trim();
        if (!t) { c.nascimento = null; c.nascimento_tela = ''; }
        else { const [d, mo, a] = t.split('/'); if (!d || !mo) return json(res, 400, { erro:'Aniversário inválido. Use DD/MM ou DD/MM/AAAA.' });
          c.nascimento = `${a || '1904'}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`; c.nascimento_tela = a ? `${d}/${mo}/${a}` : `${d}/${mo}`; }
      }
      if (body.aceita_mensagens !== undefined) {
        c.aceita_mensagens = body.aceita_mensagens ? 1 : 0;
        c.aceita_mensagens_em = body.aceita_mensagens ? null : new Date().toISOString();
        c.aceita_mensagens_motivo = body.aceita_mensagens ? null : (body.aceita_mensagens_motivo || 'Pedido feito na Agenda');
      }
      for (const k of ['nome', 'veiculo', 'placa', 'modelo', 'origem', 'observacoes']) if (body[k] !== undefined) c[k] = body[k];
      if (body.telefone !== undefined) c.telefone = String(body.telefone || '').replace(/\D/g, '') || null;
      return json(res, 200, c);
    }
    return json(res, 200, c);
  }
  if (p === '/api/perfil') return json(res, 200, { id:'u1', nome: soPresenca ? 'Franklin' : 'João Pedro Famelli', email:'teste@indycartaubate.com', papel:PAPEL, ativo:true });
  if (p === '/api/empresa') return json(res, 200, { nome:'IndyCar Centro Automotivo', endereco:'Av. Bandeirantes, 875 — Parque Paduan, Taubaté/SP', slogan:'Quem conhece, Indyca!' });
  if (p === '/api/consultores') return json(res, 200, [{ id:'c1', nome:'Leonardo', cor:'#e6192e', ativo:1 }]);
  if (p === '/api/dashboard') return json(res, 200, estatisticas());
  if (p === '/api/followup') return json(res, 200, AGENDA.filter(a => ['nao_veio', 'nao_fechou'].includes(a.status)));
  if (p === '/api/crm') return json(res, 200, { total:97, taxaComparecimento:68, taxaConversao:41, concluidos:20, semConsultor:12,
    porOrigem:[{ origem:'WhatsApp', total:41, faltas:9, vieram:28, fechou:12, taxaFalta:24, taxaFechamento:43 }, { origem:'Google', total:33, faltas:12, vieram:18, fechou:6, taxaFalta:40, taxaFechamento:33 },
      { origem:'Indicação', total:15, faltas:1, vieram:13, fechou:8, taxaFalta:7, taxaFechamento:62 }, { origem:'Instagram', total:8, faltas:3, vieram:5, fechou:1, taxaFalta:38, taxaFechamento:20 }],
    porConsultor:[{ nome:'Leonardo', ativo:1, total:85, vieram:60, faltas:20, concluidos:20, naoFechou:30, taxaFechamento:33, taxaFalta:25 }] });
  if (p === '/api/agendamentos' && m === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    // presença: hoje + quem está na casa de outro dia (chegou e não saiu), sem telefone
    let l = soPresenca ? AGENDA.filter(a => a.data === hoje() || (['compareceu', 'em_atendimento'].includes(a.status) && a.data < hoje())) : AGENDA;
    const de = url.searchParams.get('de'), ate = url.searchParams.get('ate'), dt = url.searchParams.get('data');
    if (!soPresenca && dt) l = l.filter(a => a.data === dt);
    else if (!soPresenca && (de || ate)) l = l.filter(a => (!de || a.data >= de) && (!ate || a.data <= ate));
    if (q) l = l.filter(a => casaBusca([a.cliente_nome, a.placa, a.veiculo, a.servico], q, a.telefone));
    const cons = url.searchParams.get('consultor_id');
    if (cons) l = l.filter(a => a.consultor_id === cons);
    l = l.slice().sort((a, b) => b.data.localeCompare(a.data) || a.hora.localeCompare(b.hora));
    return json(res, 200, soPresenca ? l.map(({ telefone, ...r }) => r) : l);
  }
  if ((mm = p.match(/^\/api\/agendamentos\/([0-9a-f-]+)\/status$/)) && m === 'PATCH') {
    const a = AGENDA.find(x => x.id === mm[1]), ch = MAPA[body.status];
    if (!a) return json(res, 404, { erro:'Agendamento não encontrado.' });
    if (!ch) return json(res, 400, { erro:'Status inválido.' });
    if (soPresenca) { const r = presencaPodeMarcar(a.status, body.status); if (r) return json(res, 403, { erro: r }); }
    // rodada 4: valor junto com "Veio e fechou" (as MESMAS regras do servidor)
    if (body.valor !== undefined && body.valor !== null && body.valor !== '') {
      const v = valorDeEntrada(body.valor);
      if (body.status !== 'concluido' || soPresenca || v === null || !valorValido(v)) return json(res, 400, { erro:'Valor inválido: use só números, ex.: 350 ou 1.250,00.' });
      a.valor = v; console.log('VALOR', a.cliente_nome, v);
    }
    const statusAntes = a.status;
    Object.assign(a, { status: ch.status, confirmado: ch.confirmado ?? a.confirmado,
      compareceu: ch.compareceu !== undefined ? ch.compareceu : a.compareceu });
    // rodada 5: "Chegou" abre a OS no Pátio (aqui, de mentira) e devolve o resumo; "Não veio" diz quem da espera cabe
    let patio = null, espera = null;
    if (body.status === 'compareceu') {
      let os = PATIO.find(o => o.agendamento_id === a.id && o.etapa !== 'cancelado');
      if (!os) { os = { id: `30000000-0000-4000-8000-${String(100 + PATIO.length).padStart(12, '0')}`, numero: 102 + PATIO.length, etapa: 'recebido', etapa_em: new Date().toISOString(), agendamento_id: a.id, token_publico: 'abcdef0123456789abcdef01', entregue_em: null }; PATIO.push(os); }
      patio = resumoDaOs(os, EXTRAS, 'https://indycar-patio.netlify.app');
    }
    if (['nao_veio', 'cancelado'].includes(body.status) && !soPresenca) espera = esperaQueCabe(ESPERA, a.data, a.servico).slice(0, 3);
    // desfez a chegada e a OS do Pátio continua aberta (o banco não cancela): o servidor devolve para a tela avisar
    let patioAberta = null;
    if (['compareceu', 'em_atendimento'].includes(statusAntes) && ['aguardando', 'confirmado', 'cancelado', 'nao_veio'].includes(body.status)) {
      const os = PATIO.find(o => o.agendamento_id === a.id && o.etapa !== 'cancelado' && o.etapa !== 'entregue');
      if (os) patioAberta = resumoDaOs(os, EXTRAS, 'https://indycar-patio.netlify.app');
    }
    return json(res, 200, { ...a, ...(body.status === 'nao_veio' ? { aviso_ausencia:{ ok:true } } : {}), ...(patio ? { patio } : {}), ...(patioAberta ? { patio_aberta: patioAberta } : {}), ...(espera?.length ? { espera } : {}) });
  }
  if ((mm = p.match(/^\/api\/agendamentos\/([0-9a-f-]+)$/))) {
    const i = AGENDA.findIndex(x => x.id === mm[1]);
    if (i < 0) return json(res, 404, { erro:'Agendamento não encontrado.' });
    if (m === 'DELETE') { AGENDA.splice(i, 1); return json(res, 200, { ok:true }); }
    if (m === 'PUT') {
      const a = AGENDA[i];
      const nv = decidirNaoVeioNaEdicao(a, body);
      if (nv.acao === 'perguntar') return json(res, 409, { codigo:'confirmar_aviso', erro:'Marcar "Não veio" manda o WhatsApp de falta para o cliente. Avisar o cliente?' });
      if (nv.acao === 'carimbar') a.no_show_notificado_em = new Date().toISOString();
      if (nv.acao === 'avisar') { a.no_show_notificado_em = new Date().toISOString(); console.log('AVISO DE FALTA ENVIADO (mock)', a.cliente_nome); }
      for (const k of ['cliente_nome', 'telefone', 'veiculo', 'placa', 'servico', 'data', 'hora', 'consultor_id', 'origem', 'status', 'observacoes', 'cliente_id', 'compareceu', 'no_show_notificado_em'])
        if (body[k] !== undefined) a[k] = k === 'telefone' ? (String(body[k] || '').replace(/\D/g, '') || null) : body[k];
      if (['aguardando', 'confirmado'].includes(body.status) && body.compareceu === undefined) a.compareceu = null;
      console.log('PUT', a.cliente_nome, JSON.stringify(body));
      return json(res, 200, { ...a, aviso_ausencia: nv.acao === 'avisar' ? { ok:true } : null });
    }
    return json(res, 200, AGENDA[i]);
  }
  if (p === '/api/agendamentos' && m === 'POST') {
    if (!body.cliente_nome || !body.servico || !body.data || !body.hora) return json(res, 400, { erro:'Informe cliente, serviço, data e hora.' });
    const a = ag({ ...body, telefone: String(body.telefone || '').replace(/\D/g, '') || null, status: body.status || 'aguardando' });
    AGENDA.push(a); return json(res, 200, a);
  }
  if (m === 'GET') return json(res, 200, []);              // telas que não são o foco: lista vazia
  return json(res, 200, { ok:true });
}).listen(PORT, () => console.log(`Agenda (dados de MENTIRA) em http://localhost:${PORT}  ·  modo presença: /?papel=agenda`));
