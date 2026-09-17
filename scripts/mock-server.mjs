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
import { montarUltimos, hoje, agoraHHMM } from '../dados.js';

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

let AGENDA = [
  ag({ cliente_nome:'Maria Aparecida', veiculo:'HB20', placa:'FHR6F16', servico:'Montagem de pneus e alinhamento', data:dia(0), hora:hm(40),  status:'confirmado', confirmado:1, origem:'Google' }),
  ag({ cliente_nome:'Carlos Eduardo Nogueira', veiculo:'Corolla', placa:'GFK3H26', servico:'Troca de óleo de câmbio (diálise)', data:dia(0), hora:hm(180), status:'aguardando' }),
  ag({ cliente_nome:'Donizetti', veiculo:'ix35', servico:'Pastilha de freio', data:dia(0), hora:hm(-50), status:'confirmado', confirmado:1, origem:'Indicação' }),
  ag({ cliente_nome:'Patrícia Lemos', veiculo:'Onix', servico:'Revisão de suspensão', data:dia(0), hora:hm(-160), status:'compareceu', compareceu:1, confirmado:1 }),
  ag({ cliente_nome:'Diogo Barros', servico:'Alinhamento 3D', data:dia(0), hora:hm(-240), status:'nao_veio', compareceu:0 }),
  ag({ cliente_nome:'Altamir', veiculo:'Ka', placa:'GFK3H26', servico:'Veio cotar troca da correia dentada', data:dia(0), hora:hm(-300), status:'concluido', compareceu:1, confirmado:1 }),
  ag({ cliente_nome:'Renata Figueiredo de Albuquerque Monteiro', veiculo:'Compass', servico:'Diagnóstico com scanner + limpeza de bicos injetores', data:dia(1), hora:'08:30', status:'confirmado', confirmado:1, origem:'Instagram' }),
  ag({ cliente_nome:'Vanderlei', veiculo:'City', placa:'FHR6F16', servico:'Troca de óleo de câmbio', data:dia(1), hora:'14:00', status:'aguardando' }),
  ag({ cliente_nome:'José Antônio', veiculo:'S10', servico:'Troca de embreagem', data:dia(4), hora:'09:00', status:'confirmado', confirmado:1, origem:'Telefone' }),
  ag({ cliente_nome:'Luciana Prado', veiculo:'Fit', servico:'Troca de amortecedores', data:dia(-1), hora:'14:30', status:'confirmado', confirmado:1 }),
  ag({ cliente_nome:'Marcos Vinícius', veiculo:'Gol', servico:'Correia dentada', data:dia(-1), hora:'09:00', status:'nao_veio', compareceu:0 }),
  ag({ cliente_nome:'Sueli', veiculo:'Civic', servico:'Troca de óleo de motor', data:dia(-3), hora:'10:00', status:'aguardando' }),
  ag({ cliente_nome:'Cliente Antigo', veiculo:'Palio', servico:'Revisão de motor', data:dia(-20), hora:'11:00', status:'confirmado', confirmado:1 }),
  ag({ cliente_nome:'Rogério (chegou ontem, sem desfecho)', veiculo:'Hilux', servico:'Revisão de motor', data:dia(-1), hora:'08:00', status:'compareceu', compareceu:1, confirmado:1 }),
  ag({ cliente_nome:'Sem Telefone', telefone:null, lead_id:null, servico:'Troca de óleo de motor', data:dia(0), hora:hm(90), status:'aguardando' }),
  ag({ cliente_nome:'Bruno (não fechou)', veiculo:'Tracker', servico:'Orçamento de suspensão', data:dia(-2), hora:'16:00', status:'nao_fechou', compareceu:1 }),
];

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
      totalClientes: 2226, totalConsult: 1 },
    agendaHoje, ultimos: montarUltimos(candidatos, d, agoraHHMM()),
    naOficina: AGENDA.filter(a => ['compareceu', 'em_atendimento'].includes(a.status) && a.data < d && a.data >= seteDias),
    data: d, agora: agoraHHMM(),
  };
}

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const DUBLE_SUPABASE = `<script>window.supabase={createClient:()=>({auth:{
  getSession:async()=>({data:{session:{access_token:'mock'}}}),
  signInWithPassword:async()=>({error:null}),signOut:async()=>({error:null}),
  onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})};</script>`;

let PAPEL = 'admin';
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname, m = req.method;
  if (!p.startsWith('/api/')) {
    if (p === '/' || p === '/index.html') {
      PAPEL = url.searchParams.get('papel') === 'agenda' ? 'agenda' : 'admin';
      const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8')
        .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase[^"]*"><\/script>/, DUBLE_SUPABASE);
      res.writeHead(200, { 'Content-Type': MIME['.html'] }); return res.end(html);
    }
    if (p === '/sw.js') { res.writeHead(200, { 'Content-Type': MIME['.js'] }); return res.end('/* sem service worker no modo de teste */'); }
    const arq = path.join(PUBLIC, path.normalize(p));
    if (!arq.startsWith(PUBLIC) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end('Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(arq)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    return fs.createReadStream(arq).pipe(res);
  }

  let body = {};
  if (m !== 'GET') { let b = ''; for await (const c of req) b += c; try { body = JSON.parse(b || '{}'); } catch {} }
  await new Promise(r => setTimeout(r, 220));            // latência de verdade, para ver o "ocupado" e o esqueleto
  const soPresenca = PAPEL === 'agenda';
  let mm;

  if (p === '/api/config') return json(res, 200, { configurado:true, supabaseUrl:'http://mock.local', supabaseAnonKey:'mock' });
  if (p === '/api/primeiro-acesso') return json(res, 200, { aberto:false });
  if (p === '/api/perfil') return json(res, 200, { id:'u1', nome: soPresenca ? 'Franklin' : 'João Pedro Famelli', email:'teste@indycartaubate.com', papel:PAPEL, ativo:true });
  if (p === '/api/empresa') return json(res, 200, { nome:'IndyCar Centro Automotivo', endereco:'Av. Bandeirantes, 875 — Parque Paduan, Taubaté/SP', slogan:'Quem conhece, Indyca!' });
  if (p === '/api/consultores') return json(res, 200, [{ id:'c1', nome:'Leonardo', cor:'#e6192e', ativo:1 }]);
  if (p === '/api/dashboard') return json(res, 200, estatisticas());
  if (p === '/api/followup') return json(res, 200, AGENDA.filter(a => ['nao_veio', 'nao_fechou'].includes(a.status)));
  if (p === '/api/crm') return json(res, 200, { total:97, taxaComparecimento:68, taxaConversao:41, concluidos:20,
    porOrigem:[{ origem:'WhatsApp', total:41 }, { origem:'Google', total:33 }, { origem:'Indicação', total:15 }, { origem:'Instagram', total:8 }],
    porConsultor:[{ nome:'Leonardo', total:97, concluidos:20 }] });
  if (p === '/api/agendamentos' && m === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    let l = soPresenca ? AGENDA.filter(a => a.data === hoje()) : AGENDA;
    if (q) l = l.filter(a => [a.cliente_nome, a.placa, a.veiculo, a.telefone].some(x => String(x || '').toLowerCase().includes(q)));
    l = l.slice().sort((a, b) => b.data.localeCompare(a.data) || a.hora.localeCompare(b.hora));
    return json(res, 200, soPresenca ? l.map(({ telefone, ...r }) => r) : l);
  }
  if ((mm = p.match(/^\/api\/agendamentos\/([0-9a-f-]+)\/status$/)) && m === 'PATCH') {
    const a = AGENDA.find(x => x.id === mm[1]), ch = MAPA[body.status];
    if (!a) return json(res, 404, { erro:'Agendamento não encontrado.' });
    if (!ch) return json(res, 400, { erro:'Status inválido.' });
    if (soPresenca && !['compareceu', 'nao_veio'].includes(body.status))
      return json(res, 403, { erro:'Seu acesso só permite marcar se o cliente veio ou não.' });
    if (soPresenca && ['concluido', 'nao_fechou'].includes(a.status))
      return json(res, 403, { erro:'Este cliente já tem o desfecho registrado pelo atendimento — só o painel principal pode mudar.' });
    Object.assign(a, { status: ch.status, confirmado: ch.confirmado ?? a.confirmado,
      compareceu: ch.compareceu !== undefined ? ch.compareceu : a.compareceu });
    return json(res, 200, { ...a, ...(body.status === 'nao_veio' ? { aviso_ausencia:{ ok:true } } : {}) });
  }
  if ((mm = p.match(/^\/api\/agendamentos\/([0-9a-f-]+)$/))) {
    const i = AGENDA.findIndex(x => x.id === mm[1]);
    if (i < 0) return json(res, 404, { erro:'Agendamento não encontrado.' });
    if (m === 'DELETE') { AGENDA.splice(i, 1); return json(res, 200, { ok:true }); }
    return json(res, 200, AGENDA[i]);
  }
  if (m === 'GET') return json(res, 200, []);              // telas que não são o foco: lista vazia
  return json(res, 200, { ok:true });
}).listen(PORT, () => console.log(`Agenda (dados de MENTIRA) em http://localhost:${PORT}  ·  modo presença: /?papel=agenda`));
