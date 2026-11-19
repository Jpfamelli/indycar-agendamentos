'use strict';
/* Rodada 8 (T2b) — as rotas da jornada pelo servidor de verdade, com porteiro e banco de mentira:
   quem entra, o formato do que volta, o que fica gravado e o que vai para a auditoria. */
const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../auth');
const equipe = require('../equipe');
const db = require('../db');
const Jornada = require('../jornada');
const { criarBanco } = require('./apoio/banco-falso');
const { servidor, ROTAS_COM_ERRO } = require('../server');

const ID = n => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const PAPEIS = {
  admin: { usuario: { id: ID(1), papel: 'admin', apps: [], ativo: true, nome: 'Marina Costa' } },
  limitado: { usuario: { id: ID(7), papel: 'admin', apps: [], ativo: true, nome: 'Teste Limite' } },
  gestor_sem_ads: { usuario: { id: ID(3), papel: 'gestor', apps: ['crm'], ativo: true } },
};
const L_FECHOU = ID('a'), L_PERDEU = ID('b'), L_NOVO = ID('c'), NAO_EXISTE = ID('f');
const MARCO = 'de=2026-03-01&ate=2026-03-31';
const dia = (d, hora = '10:00') => new Date(`2026-03-${String(d).padStart(2, '0')}T${hora}:00-03:00`).toISOString();

const lead = (id, extra = {}) => ({
  id, cliente_id: null, responsavel_id: null, nome: 'Fulano de Tal Sobrenome', telefone: '12991237766', telefone_e164: '+5512991237766', origem: 'whatsapp',
  status: 'novo', valor_pago: null, valor_orcado: null, servico: 'Freios', carro_modelo: 'Gol 2015', placa: 'ABC1D23', utm_source: null, utm_medium: null, utm_campaign: null,
  created_at: dia(10), closed_at: null, updated_at: dia(10), ultimo_contato_em: null, motivo_perda: null, motivo_perda_obs: null, ...extra,
});

let base, sb, pedidosDeOrigem = [];
const auditorias = [];
const orig = { identificar: auth.identificar, banco: equipe.banco, sb: db.sb, temDados: db.temDados, temDadosReais: db.temDadosReais, temChaves: db.temChaves };

function novoBanco() {
  pedidosDeOrigem = [];
  return criarBanco({
    leads: [
      lead(L_FECHOU, { status: 'concluido', closed_at: dia(12), nome: 'Bruno Alves Pereira' }),
      lead(L_PERDEU, { status: 'perdido', closed_at: dia(13), nome: 'Carla Dias', telefone: '12988885555', telefone_e164: '+5512988885555', created_at: dia(11) }),
      lead(L_NOVO, { nome: 'Davi Lima', created_at: dia(14) }),
    ],
    agendamentos: [], orc_orcamentos: [], patio_os: [], patio_extras: [], clientes: [], perfis: [], conversas: [], crm_atividades: [],
    whatsapp_mensagens: Array.from({ length: 40 }, (_, d) => ({ id: `s${d}`, direcao: 'saida', status: 'enviado', wamid: `w${d}`, created_at: new Date(Date.parse('2026-02-25T12:00:00Z') + d * 86400000).toISOString() })),
  }, { rpc: {
    trafego_primeiras_mensagens: ({ p_leads }) => p_leads.map(id => ({ lead_id: id, primeira_entrada_em: dia(10, '10:00'), primeira_entrada_texto: 'Oi, quanto fica o freio?', primeira_saida_em: dia(10, '10:08'), entradas: 1, saidas: 1 })),
    trafego_aplicar_origem: ({ p_lead, p, p_como }, banco) => {
      pedidosDeOrigem.push({ p_lead, p, p_como });
      const l = banco.tabelas.leads.find(x => x.id === p_lead);
      Object.assign(l, { origem: p.origem, origem_paga: p.paga, origem_plataforma: p.plataforma || null, origem_como: p_como, campanha_nome: p.campanha_nome || null });
      return true;
    },
  } });
}

test.before(async () => {
  auth.identificar = async req => PAPEIS[req.headers['x-papel']] || { motivo: 'sem_token' };
  equipe.banco = () => ({ tocarAcesso: async () => true, auditar: async (u, acao, o) => { auditorias.push({ quem: u.id, acao, ...o }); return true; } });
  db.temDados = async () => false; db.temDadosReais = async () => false; db.temChaves = async () => false;
  sb = novoBanco(); db.sb = sb;
  Jornada.esquecer();
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
test.after(async () => {
  Object.assign(auth, { identificar: orig.identificar });
  equipe.banco = orig.banco;
  Object.assign(db, { sb: orig.sb, temDados: orig.temDados, temDadosReais: orig.temDadosReais, temChaves: orig.temChaves });
  servidor.closeAllConnections?.();
  await new Promise(r => servidor.close(r));
});

async function pedir(caminho, { papel = 'admin', metodo = 'GET', corpo } = {}) {
  const r = await fetch(base + caminho, { method: metodo, body: corpo === undefined ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)), headers: { ...(papel ? { 'x-papel': papel } : {}), 'Content-Type': 'application/json' } });
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch { /* não é JSON */ }
  return { status: r.status, json, texto, headers: r.headers };
}

test('o arquivo de rotas da jornada carrega sem erro', () => {
  assert.equal(ROTAS_COM_ERRO.includes('jornada.js'), false);
});

test('sem login é 401 e sem o app é 403 em todas as rotas da jornada', async () => {
  const rotas = [['GET', `/api/jornada?${MARCO}`], ['GET', `/api/jornada/${L_FECHOU}`], ['GET', `/api/pendencias?${MARCO}`],
    ['POST', `/api/jornada/${L_FECHOU}/valor`], ['POST', `/api/jornada/${L_PERDEU}/motivo`], ['POST', `/api/jornada/${L_NOVO}/origem`], ['POST', '/api/jornada/lote']];
  for (const [metodo, caminho] of rotas) {
    assert.equal((await pedir(caminho, { metodo, papel: null, corpo: metodo === 'POST' ? {} : undefined })).status, 401, `${metodo} ${caminho} sem login`);
    assert.equal((await pedir(caminho, { metodo, papel: 'gestor_sem_ads', corpo: metodo === 'POST' ? {} : undefined })).status, 403, `${metodo} ${caminho} sem o app`);
  }
  assert.deepEqual(sb.tabelas.leads.map(l => l.valor_pago), [null, null, null], 'nada foi gravado');
  assert.equal(auditorias.length, 0);
});

test('GET /api/jornada: formato do contrato, nome curto e só o final do telefone', async () => {
  const r = await pedir(`/api/jornada?${MARCO}`);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json), ['periodo', 'estado', 'totais', 'funil', 'filtros', 'itens', 'pagina']);
  assert.equal(r.json.periodo.de, '2026-03-01');
  assert.equal(typeof r.json.periodo.rotulo, 'string');
  assert.equal(r.json.estado.gasto, 'sem_conta');
  assert.equal(r.json.estado.demo, false);
  assert.equal(r.json.estado.respostas, 'ok');
  assert.deepEqual(r.json.pagina, { atual: 1, tamanho: 50, total: 3 });
  assert.deepEqual(r.json.itens.map(i => i.nome), ['Davi L.', 'Carla D.', 'Bruno P.']);
  assert.deepEqual(r.json.itens.map(i => i.telefone_final), ['7766', '5555', '7766']);
  assert.equal(r.json.totais.contatos, 3);
  assert.equal(r.json.totais.respondidos, 3);
  assert.equal(r.json.totais.sem_valor, 1);
  assert.equal(r.json.totais.sem_motivo, 1);
  assert.equal(r.json.funil.etapas.length, 7);
  assert.equal(/Sobrenome|Pereira|12991237766|12988885555|ABC1D23/.test(r.texto), false, 'a lista não leva nome inteiro, telefone inteiro nem placa');
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('GET /api/jornada: filtros, busca e paginação pela consulta; filtro inválido e período inválido são 400', async () => {
  const fechou = await pedir(`/api/jornada?${MARCO}&desfecho=fechou`);
  assert.deepEqual(fechou.json.itens.map(i => i.lead_id), [L_FECHOU]);
  assert.equal(fechou.json.totais.contatos, 1);
  const busca = await pedir(`/api/jornada?${MARCO}&q=${encodeURIComponent('8888-5555')}`);
  assert.deepEqual(busca.json.itens.map(i => i.lead_id), [L_PERDEU]);
  const pagina = await pedir(`/api/jornada?${MARCO}&tamanho=2&pagina=2`);
  assert.deepEqual(pagina.json.pagina, { atual: 2, tamanho: 2, total: 3 });
  assert.equal(pagina.json.itens.length, 1);
  const ruim = await pedir(`/api/jornada?${MARCO}&canal=tiktok`);
  assert.equal(ruim.status, 400);
  assert.equal(ruim.json.campo, 'canal');
  assert.equal(typeof ruim.json.erro, 'string');
  assert.equal((await pedir('/api/jornada?periodo=semana')).status, 400);
  assert.equal((await pedir('/api/jornada?de=2026-03-31&ate=2026-03-01')).status, 400);
  assert.equal((await pedir('/api/jornada?periodo=mes')).status, 200, 'o período padrão é o mês');
});

test('GET /api/jornada/:lead_id: nome e telefone inteiros; contato que não existe é 404', async () => {
  const r = await pedir(`/api/jornada/${L_FECHOU}`);
  assert.equal(r.status, 200);
  assert.equal(r.json.nome, 'Bruno Alves Pereira');
  assert.equal(r.json.telefone, '5512991237766');
  for (const k of ['linha_do_tempo', 'primeira_mensagem', 'rastreio', 'historico', 'links']) assert.ok(k in r.json, k);
  assert.equal(r.json.links.crm, `/crm/?lead=${L_FECHOU}`);
  const nada = await pedir(`/api/jornada/${NAO_EXISTE}`);
  assert.equal(nada.status, 404);
  assert.equal(nada.json.erro, 'Contato não encontrado.');
  assert.equal((await pedir('/api/jornada/123')).status, 404, 'o que não é id não casa com rota nenhuma');
});

test('GET /api/pendencias: quatro filas; a de origem leva a primeira mensagem', async () => {
  const r = await pedir(`/api/pendencias?${MARCO}`);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json), ['periodo', 'estado', 'sem_valor', 'sem_motivo', 'sem_origem', 'sem_resposta']);
  assert.deepEqual([r.json.sem_valor.n, r.json.sem_motivo.n, r.json.sem_origem.n, r.json.sem_resposta.n], [1, 1, 3, 0]);
  assert.equal(r.json.sem_origem.itens[0].primeira_mensagem, 'Oi, quanto fica o freio?');
  assert.equal(r.json.sem_valor.itens[0].lead_id, L_FECHOU);
  assert.equal(r.json.estado.gasto, 'sem_conta');
});

test('POST valor: grava em leads.valor_pago, devolve o desfecho e audita sem dado de cliente', async () => {
  auditorias.length = 0;
  const r = await pedir(`/api/jornada/${L_FECHOU}/valor`, { metodo: 'POST', corpo: { valor: '750,50' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.deepEqual({ tipo: r.json.desfecho.tipo, valor: r.json.desfecho.valor, fonte: r.json.desfecho.valor_fonte }, { tipo: 'fechou', valor: 750.5, fonte: 'manual' });
  assert.equal(sb.tabelas.leads[0].valor_pago, 750.5);
  assert.deepEqual(auditorias, [{ quem: ID(1), acao: 'trafego_valor_lancado', tabela: 'leads', registro: L_FECHOU, detalhes: { antes: null, valor: 750.5 } }]);
  const lista = await pedir(`/api/jornada?${MARCO}&desfecho=fechou`);
  assert.equal(lista.json.itens[0].desfecho.valor, 750.5, 'a lista já mostra o valor novo');
  assert.equal(lista.json.totais.faturado, 750.5);
  // recusas: campo inválido (422), contato que não fechou (409), contato que não existe (404)
  const invalido = await pedir(`/api/jornada/${L_FECHOU}/valor`, { metodo: 'POST', corpo: { valor: 'caro' } });
  assert.equal(invalido.status, 422); assert.equal(invalido.json.campo, 'valor');
  assert.equal((await pedir(`/api/jornada/${L_FECHOU}/valor`, { metodo: 'POST', corpo: {} })).status, 422);
  assert.equal((await pedir(`/api/jornada/${L_FECHOU}/valor`, { metodo: 'POST', corpo: '[1,2]' })).status, 422);
  assert.equal((await pedir(`/api/jornada/${L_NOVO}/valor`, { metodo: 'POST', corpo: { valor: 100 } })).status, 409);
  assert.equal((await pedir(`/api/jornada/${NAO_EXISTE}/valor`, { metodo: 'POST', corpo: { valor: 100 } })).status, 404);
  assert.equal((await pedir(`/api/jornada/${L_FECHOU}/valor`, { metodo: 'POST', corpo: '{quebrado' })).status, 400);
  assert.equal(auditorias.length, 1, 'recusa não vai para a auditoria como gravação');
});

test('POST motivo: só em contato que não fechou; a observação não vai para a auditoria', async () => {
  auditorias.length = 0;
  const r = await pedir(`/api/jornada/${L_PERDEU}/motivo`, { metodo: 'POST', corpo: { motivo: 'caro', obs: 'falou que o vizinho faz por menos' } });
  assert.equal(r.status, 200);
  assert.deepEqual({ tipo: r.json.desfecho.tipo, motivo: r.json.desfecho.motivo, rotulo: r.json.desfecho.motivo_rotulo, obs: r.json.desfecho.obs },
    { tipo: 'nao_fechou', motivo: 'caro', rotulo: 'Achou caro', obs: 'falou que o vizinho faz por menos' });
  assert.deepEqual(auditorias, [{ quem: ID(1), acao: 'trafego_motivo_marcado', tabela: 'leads', registro: L_PERDEU, detalhes: { motivo: 'caro', com_observacao: true } }]);
  const invalido = await pedir(`/api/jornada/${L_PERDEU}/motivo`, { metodo: 'POST', corpo: { motivo: 'porque sim' } });
  assert.equal(invalido.status, 422); assert.equal(invalido.json.campo, 'motivo'); assert.equal(invalido.json.opcoes.length, 9);
  assert.equal((await pedir(`/api/jornada/${L_FECHOU}/motivo`, { metodo: 'POST', corpo: { motivo: 'caro' } })).status, 409);
});

test('POST origem: vai para a função do banco como "manual" com quem marcou, devolve a origem nova e audita', async () => {
  auditorias.length = 0;
  const r = await pedir(`/api/jornada/${L_NOVO}/origem`, { metodo: 'POST', corpo: { canal: 'google', campanha_nome: 'Freios Taubaté' } });
  assert.equal(r.status, 200);
  assert.deepEqual(pedidosDeOrigem, [{ p_lead: L_NOVO, p_como: 'manual', p: { paga: true, plataforma: 'google', origem: 'google', campanha_nome: 'Freios Taubaté', marcado_por: ID(1), marcado_por_nome: 'Marina' } }]);
  assert.deepEqual({ canal: r.json.origem.canal, paga: r.json.origem.paga, rotulo: r.json.origem.rotulo, como: r.json.origem.como, certeza: r.json.origem.certeza },
    { canal: 'google', paga: true, rotulo: 'Anúncio do Google', como: 'manual', certeza: 'certa' });
  assert.deepEqual(auditorias, [{ quem: ID(1), acao: 'trafego_origem_marcada', tabela: 'leads', registro: L_NOVO, detalhes: { canal: 'google', campanha_ext: null, campanha: 'Freios Taubaté' } }]);
  const invalido = await pedir(`/api/jornada/${L_NOVO}/origem`, { metodo: 'POST', corpo: { canal: 'desconhecida' } });
  assert.equal(invalido.status, 422); assert.equal(invalido.json.campo, 'canal');
  const pend = await pedir(`/api/pendencias?${MARCO}`);
  assert.equal(pend.json.sem_origem.n, 2, 'o contato marcado saiu da fila de origem');
});

test('POST lote: resultado por contato, auditoria de cada gravação e teto de 50', async () => {
  auditorias.length = 0;
  sb.tabelas.leads[0].valor_pago = null;
  const r = await pedir('/api/jornada/lote', { metodo: 'POST', corpo: { itens: [
    { lead_id: L_FECHOU, valor: 900 }, { lead_id: L_PERDEU, motivo: 'prazo' }, { lead_id: L_NOVO, valor: 50 }, { lead_id: 'x', valor: 50 },
  ] } });
  assert.equal(r.status, 200);
  assert.deepEqual({ ok: r.json.ok, feitos: r.json.feitos }, { ok: false, feitos: 2 });
  assert.deepEqual(r.json.erros.map(e => e.lead_id), [L_NOVO, 'x']);
  assert.deepEqual(Object.keys(r.json), ['ok', 'feitos', 'erros'], 'o que é só para a auditoria não volta para a tela');
  assert.deepEqual(auditorias.map(a => [a.acao, a.registro, a.detalhes.em_lote]), [['trafego_valor_lancado', L_FECHOU, true], ['trafego_motivo_marcado', L_PERDEU, true]]);
  assert.equal(sb.tabelas.leads[0].valor_pago, 900);
  const demais = await pedir('/api/jornada/lote', { metodo: 'POST', corpo: { itens: Array.from({ length: 51 }, () => ({ lead_id: L_FECHOU, valor: 1 })) } });
  assert.equal(demais.status, 422);
  assert.equal((await pedir('/api/jornada/lote', { metodo: 'POST', corpo: {} })).status, 422);
});

test('limite por pessoa nas escritas: depois do teto vem 429 com Retry-After, e o limite de uma pessoa não trava a outra', async () => {
  let ultimo = null;
  for (let i = 0; i < 13; i++) ultimo = await pedir('/api/jornada/lote', { metodo: 'POST', papel: 'limitado', corpo: { itens: [{ lead_id: L_NOVO, valor: 10 }] } });
  assert.equal(ultimo.status, 429);
  assert.ok(Number(ultimo.headers.get('retry-after')) > 0);
  assert.equal(ultimo.json.codigo, 'limite');
  assert.equal((await pedir('/api/jornada/lote', { metodo: 'POST', papel: 'admin', corpo: { itens: [{ lead_id: L_NOVO, valor: 10 }] } })).status, 200);
});

test('banco fora do ar: a resposta é uma frase de gente com o número do pedido, sem detalhe interno', async () => {
  const quebrado = criarBanco({}, {});
  db.sb = quebrado; Jornada.esquecer();
  try {
    const r = await pedir(`/api/jornada?${MARCO}`);
    assert.equal(r.status, 500);
    assert.match(r.json.erro, /^Não foi possível ler os leads do CRM/);
    assert.equal(/PGRST|schema cache|relation/i.test(r.texto), false);
  } finally { db.sb = sb; Jornada.esquecer(); }
});
