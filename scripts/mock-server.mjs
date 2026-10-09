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
import { montarUltimos, hoje, agoraHHMM, horariosLivres, telefoneNacional } from '../dados.js';

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

let AGENDA = [
  ag({ cliente_nome:'Maria Aparecida', cliente_id:CLIENTES[0].id, telefone:'12991110001', veiculo:'HB20', placa:'FHR6F16', servico:'Montagem de pneus e alinhamento', data:dia(0), hora:hm(40),  status:'confirmado', confirmado:1, origem:'Google', lembrete:{ status:'enviado', resposta:'positiva' } }),
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
      totalClientes: 2226, totalConsult: 1,
      semTelefone30d: AGENDA.filter(a => !a.telefone && a.data >= (() => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - 30); return x.toISOString().slice(0, 10); })()).length },
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
    const q = (url.searchParams.get('q') || '').toLowerCase(), d = q.replace(/D/g, '');
    const casa = (vals) => vals.some(x => String(x || '').toLowerCase().includes(q)) ;
    return json(res, 200, {
      agendamentos: AGENDA.filter(a => casa([a.cliente_nome, a.placa, a.veiculo, a.servico]) || (d.length >= 4 && tel(a.telefone).includes(d))).slice(0, 12),
      clientes: CLIENTES.filter(c => casa([c.nome, c.placa, c.veiculo]) || (d.length >= 4 && tel(c.telefone).includes(d))).slice(0, 8) });
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
    let l = soPresenca ? AGENDA.filter(a => a.data === hoje()) : AGENDA;
    const de = url.searchParams.get('de'), ate = url.searchParams.get('ate'), dt = url.searchParams.get('data');
    if (!soPresenca && dt) l = l.filter(a => a.data === dt);
    else if (!soPresenca && (de || ate)) l = l.filter(a => (!de || a.data >= de) && (!ate || a.data <= ate));
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
    if (m === 'PUT') {
      const a = AGENDA[i];
      for (const k of ['cliente_nome', 'telefone', 'veiculo', 'placa', 'servico', 'data', 'hora', 'consultor_id', 'origem', 'status', 'observacoes', 'cliente_id', 'compareceu', 'no_show_notificado_em'])
        if (body[k] !== undefined) a[k] = k === 'telefone' ? (String(body[k] || '').replace(/D/g, '') || null) : body[k];
      if (['aguardando', 'confirmado'].includes(body.status) && body.compareceu === undefined) a.compareceu = null;
      console.log('PUT', a.cliente_nome, JSON.stringify(body));
      return json(res, 200, a);
    }
    return json(res, 200, AGENDA[i]);
  }
  if (p === '/api/agendamentos' && m === 'POST') {
    if (!body.cliente_nome || !body.servico || !body.data || !body.hora) return json(res, 400, { erro:'Informe cliente, serviço, data e hora.' });
    const a = ag({ ...body, telefone: String(body.telefone || '').replace(/D/g, '') || null, status: body.status || 'aguardando' });
    AGENDA.push(a); return json(res, 200, a);
  }
  if (m === 'GET') return json(res, 200, []);              // telas que não são o foco: lista vazia
  return json(res, 200, { ok:true });
}).listen(PORT, () => console.log(`Agenda (dados de MENTIRA) em http://localhost:${PORT}  ·  modo presença: /?papel=agenda`));
