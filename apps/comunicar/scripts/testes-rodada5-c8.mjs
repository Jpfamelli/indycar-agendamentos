// Rodada 5 · verificação C8 (16/10/2026) — a rodada do carteiro de PONTA A PONTA, com um banco de
// mentira em memória e um CodeWords de mentira: o que SAIRIA quando a chave nova for colada.
// Cobre: prioridade real, mensagem velha vence, aviso de pátio de carro entregue não sai, quem
// pediu PARAR não recebe (nem o que já estava na fila), no máximo N por cliente por dia (também
// entre rodadas), 429 não gasta tentativa, dois carteiros ao mesmo tempo não duplicam, horário
// comercial em fuso de São Paulo, campanha com telefone repetido, cancelar lote no meio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as real from '../dados.js';
import * as carteiro from '../carteiro.js';
import * as patio from '../patio.js';
import { criarWhatsApp } from '../whatsapp.js';
import { enviarFila } from '../rodada.js';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// terça-feira 20/10/2026 às 11:00 em São Paulo (14:00Z) — dentro da janela
const AGORA = new Date('2026-10-20T14:00:00Z');
const h = (horas) => new Date(AGORA.getTime() + horas * 3600000).toISOString();
const CFG = { janela_inicio: 8, janela_fim: 20, pausa_geral: false, envia_domingo: false, so_horario_comercial: false,
  limite_por_hora: 60, limite_por_minuto: 10, limite_por_dia: 300, intervalo_mesmo_cliente_min: 60, hora_envio: '09:30',
  horas_lembrete: 20, msg_lembrete: '' };

function mundo({ clientes = [], agendas = [], ordens = [], enviados = [], modo = 'ok' } = {}) {
  const m = { envios: [], enviadasWa: [], modo, n: 0, agendas: new Map(agendas.map((a) => [a.id, a])), ordens: new Map(ordens.map((o) => [o.id, o])), clientes };
  m.add = (e) => { const x = { id: ID(1000 + ++m.n), status: 'pendente', enviando_em: null, tentativas: 0, enviar_em: h(-1), created_at: h(-1), expira_em: null, chave_unica: null, cliente_id: null, agendamento_id: null, erro: null, ...e }; m.envios.push(x); return x; };
  for (const e of enviados) m.add({ status: 'enviado', ...e });
  const por = (id) => m.envios.find((e) => e.id === id);
  const inicioDia = real.instanteSP(real.agoraSP(AGORA).data, '00:00').getTime();
  const dados = {
    ...real,
    agoraSP: (i) => real.agoraSP(i || AGORA),
    async enviosDevidos(limite, { tipos = null, exceto = null } = {}) {
      return m.envios.filter((e) => e.status === 'pendente' && !e.enviando_em && Date.parse(e.enviar_em) <= AGORA.getTime()
        && (!tipos || tipos.includes(e.tipo)) && (!exceto || !exceto.includes(e.tipo)))
        .sort((a, b) => a.enviar_em.localeCompare(b.enviar_em)).slice(0, limite).map((e) => ({ ...e }));
    },
    async enviadasNaUltimaHora() { return m.envios.filter((e) => e.status === 'enviado' && Date.parse(e.enviado_em) >= AGORA.getTime() - 3600000).length; },
    async enviadasHoje() { return m.envios.filter((e) => e.status === 'enviado' && Date.parse(e.enviado_em) >= inicioDia).length; },
    async adiarEnvio(id, quando, motivo) { Object.assign(por(id), { enviar_em: quando, motivo_pulado: `adiado: ${motivo}` }); },
    async marcarEnvio(id, status, erro = null, tentativas, extra = {}) {
      Object.assign(por(id), { status, erro, enviando_em: null, ...(status === 'enviado' ? { enviado_em: AGORA.toISOString() } : {}), ...(Number.isInteger(tentativas) ? { tentativas } : {}), ...extra });
    },
    async atualizarEnvio(id, campos) { Object.assign(por(id), { enviando_em: null, ...campos }); },
    async reservarEnvio(id) { const e = por(id); if (!e || e.status !== 'pendente' || e.enviando_em) return null; e.enviando_em = AGORA.toISOString(); return e; },
    async agendamentosPorIds(ids) { return new Map(ids.filter((i) => m.agendas.has(i)).map((i) => [i, m.agendas.get(i)])); },
    async ordensDoPatio() { return m.ordens; },
    async ocupacaoDaConversa() { return { ocupada: false, conversa: undefined }; },
    async registrarNoHistorico() { return null; },
    async clientesFora(fila) {
      const fora = m.clientes.filter((c) => c.aceita_mensagens === false);
      const tels = new Set(fora.map((c) => real.telefoneNacional(c.telefone)));
      return { ids: new Set(fora.map((c) => c.id)), tels: new Set(fila.map((e) => real.telefoneNacional(e.telefone)).filter((t) => tels.has(t))) };
    },
    async contatosDoDia() {
      const ultimos = new Map(), contagem = new Map();
      for (const e of m.envios.filter((x) => x.status === 'enviado')) {
        const t = real.telefoneNacional(e.telefone), ms = Date.parse(e.enviado_em);
        if (!ultimos.has(t) || ultimos.get(t) < ms) ultimos.set(t, ms);
        if (ms >= inicioDia) contagem.set(t, (contagem.get(t) || 0) + 1);
      }
      return { ultimos, contagem };
    },
  };
  const wa = criarWhatsApp({
    configWhatsapp: async () => ({ api_key: 'k', servico: 's', base: 'http://cw', device_id: 'dev' }),
    fetchFn: async (url, opts) => {
      const phone = new URLSearchParams(opts.body).get('phone');
      if (m.modo === 'ok') { m.enviadasWa.push(phone); return new Response(JSON.stringify({ success: true }), { status: 200 }); }
      if (m.modo === '401') return new Response('{"detail":"Unauthorized"}', { status: 401 });
      if (m.modo === '429') return new Response('{"detail":"Too Many Requests"}', { status: 429 });
      if (m.modo === 'skip') return new Response('{"status":"skip"}', { status: 200 });
      return new Response('{}', { status: 500 });
    },
  });
  const rodar = (extra = {}) => enviarFila({ cfg: { ...CFG, ...extra }, dados, wa, patio, carteiro, dormir: async () => {}, agora: AGORA, log: { error() {} } });
  return { m, dados, wa, rodar, por };
}

const tel = (n) => `1299900${String(n).padStart(4, '0')}`;

test('chave recusada (401): NADA sai, a mensagem volta à fila sem gastar tentativa e a rodada para na primeira', async () => {
  const w = mundo({ modo: '401' });
  const a = w.m.add({ tipo: 'patio_pronto', telefone: tel(1) });
  w.m.add({ tipo: 'posvenda', telefone: tel(2) });
  const r = await w.rodar();
  assert.equal(r.enviados, 0); assert.equal(r.classe, 'chave_recusada');
  assert.equal(w.por(a.id).status, 'pendente'); assert.equal(w.por(a.id).tentativas, 0);
  assert.equal(w.m.envios.filter((e) => e.enviando_em).length, 0, 'nenhuma reserva presa');
  assert.equal(w.m.enviadasWa.length, 0);
});

test('429 do CodeWords: para a rodada, NÃO gasta tentativa e adia 10 min (antes cada 429 gastava uma das 4 tentativas)', async () => {
  const w = mundo({ modo: '429' });
  const ids = [1, 2, 3].map((n) => w.m.add({ tipo: 'posvenda', telefone: tel(n) }).id);
  const r = await w.rodar();
  assert.equal(r.classe, 'limite');
  assert.equal(w.m.envios.filter((e) => e.tentativas > 0).length, 0);
  assert.equal(w.por(ids[0]).status, 'pendente');
  assert.equal(w.por(ids[0]).enviar_em, h(1 / 6));
  assert.equal(w.por(ids[1]).enviar_em, h(-1), 'as outras nem foram tentadas');
});

test('fila acumulada: o pátio pronto novinho sai ANTES de 200 campanhas antigas (prioridade vale mesmo fora das 40 mais velhas)', async () => {
  const w = mundo({ ordens: [{ id: ID(70), etapa: 'pronto', extras: [] }] });
  for (let i = 0; i < 200; i++) w.m.add({ tipo: 'campanha', telefone: tel(100 + i), enviar_em: h(-48 - i / 100) });
  const pronto = w.m.add({ tipo: 'patio_pronto', telefone: tel(1), chave_unica: `patio_pronto:${ID(70)}`, enviar_em: h(-0.1), created_at: h(-0.1) });
  const r = await w.rodar();
  assert.ok(r.enviados > 0);
  assert.equal(w.por(pronto.id).status, 'enviado');
  assert.equal(w.m.enviadasWa[0], '55' + tel(1), 'o primeiro a sair é o pátio pronto');
});

test('limites: no máximo 25 por rodada e o limite diário conta o que já saiu hoje', async () => {
  const w = mundo();
  for (let i = 0; i < 80; i++) w.m.add({ tipo: 'campanha', telefone: tel(i) });
  const r = await w.rodar();
  assert.equal(r.enviados, 25);
  const w2 = mundo({ enviados: Array.from({ length: 298 }, (_, i) => ({ tipo: 'campanha', telefone: tel(500 + i), enviado_em: h(-2) })) });
  for (let i = 0; i < 20; i++) w2.m.add({ tipo: 'campanha', telefone: tel(i) });
  const r2 = await w2.rodar();
  assert.equal(r2.enviados, 2, 'sobram 2 do limite de 300/dia');
});

test('o limite diário zera à meia-noite de SÃO PAULO, não de UTC (21h-23h59 SP já é o dia seguinte em UTC)', async () => {
  const noite = new Date('2026-10-20T23:30:00Z'); // 20:30 SP — a janela já fechou, mas o corte do dia é o que importa
  const dia = real.agoraSP(noite).data;
  assert.equal(dia, '2026-10-20');
  const inicio = real.instanteSP(dia, '00:00').toISOString();
  assert.equal(inicio, '2026-10-20T03:00:00.000Z', 'meia-noite SP = 03:00Z');
});

test('mensagem velha vence: lembrete depois do horário, aniversário de ontem e aviso do pátio antigo não saem', async () => {
  const w = mundo({
    agendas: [{ id: ID(50), status: 'confirmado', data: '2026-10-20', hora: '11:30', cliente_nome: 'X' }],
    ordens: [{ id: ID(71), etapa: 'pronto', extras: [] }],
  });
  const lembrete = w.m.add({ tipo: 'lembrete', telefone: tel(1), agendamento_id: ID(50), enviar_em: h(-20) }); // horário em 30 min: < 60 min
  const pronto = w.m.add({ tipo: 'patio_pronto', telefone: tel(2), chave_unica: `patio_pronto:${ID(71)}`, created_at: h(-80), enviar_em: h(-80) });
  const vencida = w.m.add({ tipo: 'aniversario', telefone: tel(3), expira_em: h(-5) });
  const r = await w.rodar();
  assert.equal(r.enviados, 0);
  assert.equal(w.por(lembrete.id).status, 'pulado'); assert.match(w.por(lembrete.id).motivo_pulado, /passou da hora/);
  assert.equal(w.por(pronto.id).status, 'pulado'); assert.match(w.por(pronto.id).motivo_pulado, /72 h/);
  assert.equal(w.por(vencida.id).status, 'pendente', 'vencida por expira_em é varrida pela faxina do começo da rodada');
  assert.equal(carteiro.envioVencido(vencida, AGORA.getTime()), true);
});

test('carro já entregue não recebe "está pronto"; extra já decidido não é cobrado de novo; apagada/cancelada pulam', async () => {
  const w = mundo({ ordens: [
    { id: ID(72), etapa: 'entregue', extras: [] }, { id: ID(73), etapa: 'pronto', extras: [{ status: 'aprovado' }] }, { id: ID(74), etapa: 'cancelado', extras: [] },
  ] });
  const a = w.m.add({ tipo: 'patio_pronto', telefone: tel(1), chave_unica: `patio_pronto:${ID(72)}` });
  const b = w.m.add({ tipo: 'patio_extra', telefone: tel(2), chave_unica: `patio_extra:${ID(73)}:2026102010` });
  const c = w.m.add({ tipo: 'patio_entrada', telefone: tel(3), chave_unica: `patio_entrada:${ID(74)}` });
  const d = w.m.add({ tipo: 'patio_pronto', telefone: tel(4), chave_unica: `patio_pronto:${ID(75)}` }); // ordem apagada
  const r = await w.rodar();
  assert.equal(r.enviados, 0);
  for (const x of [a, b, c, d]) assert.equal(w.por(x.id).status, 'pulado', x.tipo);
});

test('quem pediu PARAR não recebe nada — nem o que já estava na fila (cliente_id OU telefone, com ou sem 55)', async () => {
  const w = mundo({ clientes: [{ id: ID(201), telefone: tel(1), aceita_mensagens: false }, { id: ID(202), telefone: tel(2), aceita_mensagens: true }] });
  const a = w.m.add({ tipo: 'campanha', telefone: tel(1), cliente_id: ID(201) });
  const b = w.m.add({ tipo: 'lembrete', telefone: '55' + tel(1) }); // só pelo telefone, com DDI
  const c = w.m.add({ tipo: 'patio_pronto', telefone: tel(1), cliente_id: null });
  const ok = w.m.add({ tipo: 'campanha', telefone: tel(2), cliente_id: ID(202) });
  const r = await w.rodar();
  assert.equal(r.enviados, 1);
  for (const x of [a, b, c]) { assert.equal(w.por(x.id).status, 'pulado'); assert.match(w.por(x.id).motivo_pulado, /não receber/); }
  assert.equal(w.por(ok.id).status, 'enviado');
  assert.deepEqual(w.m.enviadasWa, ['55' + tel(2)]);
});

test('ninguém recebe 5 mensagens no mesmo dia: o teto vale também entre rodadas e as sobras vão para o próximo dia útil', async () => {
  const w = mundo();
  for (const tipo of ['posvenda', 'campanha', 'reativacao', 'orcamento', 'aniversario']) w.m.add({ tipo, telefone: tel(9) });
  const r1 = await w.rodar();
  assert.equal(r1.enviados, 1, 'dentro da rodada: 1 por cliente');
  // 70 min depois (passou o intervalo de 60) a rodada seguinte manda mais uma — e assim até o teto de 3
  for (let rodada = 2; rodada <= 6; rodada++) {
    for (const e of w.m.envios.filter((x) => x.status === 'pendente')) if (Date.parse(e.enviar_em) > AGORA.getTime()) e.enviar_em = h(-1); // simula o tempo passando
    for (const e of w.m.envios.filter((x) => x.status === 'enviado')) e.enviado_em = new Date(Date.parse(e.enviado_em) - 70 * 60000).toISOString();
    await w.rodar();
  }
  const saiu = w.m.envios.filter((e) => e.status === 'enviado').length;
  assert.equal(saiu, carteiro.MAX_MENSAGENS_CLIENTE_DIA, `saíram ${saiu}`);
  const resto = w.m.envios.filter((e) => e.status === 'pendente');
  assert.equal(resto.length, 2);
  for (const e of resto) { assert.ok(Date.parse(e.enviar_em) > AGORA.getTime() + 12 * 3600000, 'vai para amanhã'); assert.match(e.motivo_pulado, /já recebeu 3 mensagens hoje/); }
});

test('intervalo por cliente vale ENTRE rodadas: quem recebeu há 10 min só recebe outra aviso de relacionamento depois de 60 min', async () => {
  const w = mundo({ enviados: [{ tipo: 'posvenda', telefone: tel(5), enviado_em: h(-10 / 60) }] });
  const e = w.m.add({ tipo: 'campanha', telefone: tel(5) });
  const op = w.m.add({ tipo: 'patio_pronto', telefone: tel(5), chave_unica: `patio_pronto:${ID(76)}` });
  w.m.ordens.set(ID(76), { id: ID(76), etapa: 'pronto', extras: [] });
  const r = await w.rodar();
  assert.equal(w.por(e.id).status, 'pendente'); assert.ok(Date.parse(w.por(e.id).enviar_em) > AGORA.getTime());
  assert.equal(w.por(op.id).status, 'enviado', 'aviso operacional (carro pronto) nunca espera pelo intervalo');
  assert.equal(r.enviados, 1);
});

test('dois carteiros ao mesmo tempo (pg_cron + GitHub + reforço): cada mensagem sai UMA vez só', async () => {
  const w = mundo();
  for (let i = 0; i < 12; i++) w.m.add({ tipo: 'posvenda', telefone: tel(i) });
  await Promise.all([w.rodar(), w.rodar(), w.rodar()]);
  const unicos = new Set(w.m.enviadasWa);
  assert.equal(w.m.enviadasWa.length, unicos.size, 'nenhum telefone recebeu duas vezes');
  assert.equal(w.m.enviadasWa.length, 12);
});

test('falha passageira (CodeWords 500/skip): re-tenta com 5, 15, 45 min e só depois falha; reserva nunca fica presa', async () => {
  const w = mundo({ modo: 'skip' });
  const e = w.m.add({ tipo: 'posvenda', telefone: tel(1) });
  await w.rodar();
  assert.equal(w.por(e.id).status, 'pendente'); assert.equal(w.por(e.id).tentativas, 1); assert.equal(w.por(e.id).enviar_em, h(5 / 60));
  w.por(e.id).enviar_em = h(-1); w.por(e.id).tentativas = 3;
  await w.rodar();
  assert.equal(w.por(e.id).status, 'falhou'); assert.equal(w.por(e.id).enviando_em, null);
});

test('horário: "só horário comercial" usa São Paulo — 17h30 em SP (20:30Z) fecha, 17h29 abre; domingo e fora da janela seguram', async () => {
  const w = mundo(); w.m.add({ tipo: 'posvenda', telefone: tel(1) });
  const com = (iso) => enviarFila({ cfg: { ...CFG, so_horario_comercial: true }, dados: { ...w.dados, agoraSP: (i) => real.agoraSP(new Date(iso)) }, wa: w.wa, patio, carteiro, dormir: async () => {}, agora: new Date(iso), log: { error() {} } });
  assert.match((await com('2026-10-20T20:30:00Z')).aviso, /horário comercial/);
  assert.equal((await com('2026-10-20T20:29:00Z')).bloqueado, undefined);
  assert.match((await com('2026-10-25T14:00:00Z')).aviso, /Domingo/);
  assert.match((await com('2026-10-20T23:00:00Z')).aviso, /janela/);
  assert.match((await com('2026-10-20T10:59:00Z')).aviso, /janela/, '07:59 SP ainda é antes das 8h');
});

test('pausa geral segura tudo, inclusive aviso de pátio', async () => {
  const w = mundo(); const e = w.m.add({ tipo: 'patio_pronto', telefone: tel(1) });
  const r = await w.rodar({ pausa_geral: true });
  assert.equal(r.bloqueado, true); assert.equal(w.por(e.id).status, 'pendente');
});

test('carteiro: separarMesmoCliente é pura e respeita o teto mesmo sem histórico', () => {
  const fila = ['campanha', 'campanha', 'campanha', 'campanha'].map((tipo, i) => ({ id: i, tipo, telefone: '5512999990001', enviar_em: h(-i) }));
  const r = carteiro.separarMesmoCliente(fila, { minutos: 0, agora: AGORA.getTime() });
  assert.equal(r.agora.length, 3); assert.equal(r.adiados.length, 1);
  assert.equal(carteiro.telDe('+55 (12) 99999-0001'), '12999990001');
});

// ---------------------------------------------------------------------------
// dados.js de verdade, com o PostgREST de mentira: confere o texto das consultas
// ---------------------------------------------------------------------------
async function comFetchFalso(fn) {
  process.env.SUPABASE_URL = 'http://pg.local'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-teste';
  const chamadas = []; const original = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    chamadas.push({ url: String(url), metodo: opts.method || 'GET', corpo: opts.body });
    const lista = (opts.method === 'PATCH') ? [{ id: ID(1) }, { id: ID(2) }] : [];
    return new Response(JSON.stringify(lista), { status: 200, headers: { 'content-type': 'application/json', 'content-range': '0-0/0' } });
  };
  try { await fn(chamadas); } finally { globalThis.fetch = original; }
}

test('dados: expirarAtrasados varre campanha/avulsa/avaliação por enviar_em e avisos do pátio por created_at, só o que ninguém reservou', async () => {
  await comFetchFalso(async (chamadas) => {
    const n = await real.expirarAtrasados('x', carteiro.LIMITE_ATRASO_H, AGORA.getTime());
    const urls = chamadas.map((c) => decodeURIComponent(c.url));
    for (const tipo of ['campanha', 'area_cliente', 'avulsa', 'avaliacao', 'remarcacao']) assert.ok(urls.some((u) => u.includes(`tipo=eq.${tipo}`) && u.includes('enviar_em=lt.') && u.includes('enviando_em=is.null')), tipo);
    for (const tipo of ['patio_entrada', 'patio_extra', 'patio_pronto']) assert.ok(urls.some((u) => u.includes(`tipo=eq.${tipo}`) && u.includes('created_at=lt.')), tipo);
    assert.ok(chamadas.every((c) => c.metodo === 'PATCH' && c.url.includes('status=eq.pendente')));
    assert.equal(n, 2 * (Object.keys(carteiro.LIMITE_ATRASO_H).length + 3));
    const corte = urls.find((u) => u.includes('tipo=eq.campanha')).match(/enviar_em=lt\.([^&]+)/)[1];
    assert.equal(corte, h(-72));
  });
});

test('dados: enviosDevidos separa urgentes (in) dos demais (not.in) e clientesFora consulta por id e por telefone_e164', async () => {
  await comFetchFalso(async (chamadas) => {
    await real.enviosDevidos(60, { tipos: carteiro.TIPOS_URGENTES });
    await real.enviosDevidos(100, { exceto: carteiro.TIPOS_URGENTES });
    const [u1, u2] = chamadas.map((c) => decodeURIComponent(c.url));
    assert.match(u1, /tipo=in\.\(patio_pronto,/); assert.match(u2, /tipo=not\.in\.\(patio_pronto,/);
    chamadas.length = 0;
    await real.clientesFora([{ cliente_id: ID(9), telefone: '5512999990001' }, { cliente_id: null, telefone: '12999990002' }]);
    const us = chamadas.map((c) => decodeURIComponent(c.url));
    assert.ok(us.some((u) => u.includes('aceita_mensagens=is.false') && u.includes(`id=in.(${ID(9)})`)));
    assert.ok(us.some((u) => u.includes('telefone_e164=in.(12999990001,12999990002)')), 'DDI 55 sai antes de consultar a coluna normalizada');
  });
});

test('dados: cancelarLote só cancela pendente sem reserva do lote; id inválido não faz nada', async () => {
  await comFetchFalso(async (chamadas) => {
    assert.equal(await real.cancelarLote('lixo'), 0); assert.equal(chamadas.length, 0);
    assert.equal(await real.cancelarLote(ID(5)), 2);
    const u = decodeURIComponent(chamadas[0].url);
    assert.match(u, new RegExp(`lote=eq.${ID(5)}`)); assert.match(u, /status=eq\.pendente/); assert.match(u, /enviando_em=is\.null/);
    assert.match(chamadas[0].corpo, /"status":"cancelado"/);
  });
});

// ---------------------------------------------------------------------------
// API: campanha com telefone repetido/curto, e cancelar o que falta do lote
// ---------------------------------------------------------------------------
import http from 'node:http';
import * as A from '../acesso.js';
import { criarApi } from '../rotas.js';
import { SEGMENTOS, REGUAS, TIPOS_ENVIO, ROTULO_TIPO, renderTemplate } from '../dados.js';

async function subirApi() {
  const PERFIS = {
    gestor: { id: ID(2), nome: 'Gisele', papel: 'gestor', ativo: true, apps: ['comunicar'] },
    atendente: { id: ID(3), nome: 'Leonardo', papel: 'atendente', ativo: true, apps: ['comunicar'] },
  };
  const d = { envios: [], cancelou: [] };
  Object.assign(d, {
    SEGMENTOS, REGUAS, TIPOS_ENVIO, ROTULO_TIPO, renderTemplate, ehUuid: real.ehUuid,
    auditar: async () => 1, notificar: async () => null, gestores: async () => [], marcarAcesso: async () => null,
    obterConfig: async () => ({ limite_por_dia: 300, hora_envio: '09:30' }),
    carregarPorteiro: async () => ({ podeReceber: () => ({ ok: true }) }),
    enfileirarVarios: async (l) => { d.envios.push(...l); return l.length; },
    cancelarLote: async (lote) => { d.cancelou.push(lote); return 7; },
  });
  const api = criarApi({
    dados: d, versao: 'teste', runnerToken: 'tok', log: { error() {} },
    autenticar: async (req) => { const p = PERFIS[req.headers['x-teste-perfil']]; if (!p) return { status: 401, codigo: 'sem_login', erro: 'Faça login.' };
      const v = A.verificarAcesso(p); return v.ok ? { usuario: { ...p, email: 'x@t' } } : v; },
    whatsapp: { enviar: async () => ({ ok: true }), status: async () => ({ ok: true }) },
    carteiro: { rodar: async () => ({ ok: true }), lerRespostas: async () => ({ lidas: 0 }) },
  });
  const srv = http.createServer((req, res) => { const url = new URL(req.url, 'http://x'); api.api(req, res, url).catch((e) => api.erroInterno(res, e)); });
  await new Promise((ok) => srv.listen(0, ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const chamar = async (perfil, caminho, corpo) => {
    const r = await fetch(base + caminho, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(perfil ? { 'x-teste-perfil': perfil } : {}) }, body: JSON.stringify(corpo || {}) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  return { d, chamar, fechar: () => new Promise((ok) => srv.close(ok)) };
}

test('campanha: o mesmo telefone (dois cadastros, com ou sem 55) recebe UMA vez; número curto não entra', async () => {
  const s = await subirApi();
  try {
    const r = await s.chamar('gestor', '/api/envios', { corpo: 'Oi {primeiro_nome}!', destinos: [
      { cliente_id: ID(1), telefone: '12999990001', nome: 'Maria' }, { cliente_id: ID(2), telefone: '5512999990001', nome: 'Maria (2)' },
      { cliente_id: ID(3), telefone: '(12) 99999-0001', nome: 'Maria (3)' }, { cliente_id: ID(4), telefone: '12345', nome: 'Curto' }, { cliente_id: ID(5), telefone: '12999990002', nome: 'Carlos' },
    ] });
    assert.equal(r.status, 200); assert.equal(r.json.enfileirados, 2); assert.equal(r.json.pulados, 3);
    assert.deepEqual(s.d.envios.map((e) => e.nome), ['Maria', 'Carlos']);
  } finally { await s.fechar(); }
});

test('cancelar a campanha no meio: só gestor; atendente leva 403 e nada é cancelado; id ruim = 404', async () => {
  const s = await subirApi();
  try {
    const lote = ID(55);
    let r = await s.chamar('atendente', `/api/lotes/${lote}/cancelar`); assert.equal(r.status, 403); assert.equal(s.d.cancelou.length, 0);
    r = await s.chamar(null, `/api/lotes/${lote}/cancelar`); assert.equal(r.status, 401);
    r = await s.chamar('gestor', `/api/lotes/${lote}/cancelar`); assert.equal(r.status, 200); assert.equal(r.json.cancelados, 7); assert.deepEqual(s.d.cancelou, [lote]);
    r = await s.chamar('gestor', '/api/lotes/lixo/cancelar'); assert.equal(r.status, 404);
  } finally { await s.fechar(); }
});

test('duplo clique: o mesmo pedido de campanha em 30 s é recusado (409) e não enfileira em dobro; texto diferente passa', async () => {
  const s = await subirApi();
  try {
    const pedido = { corpo: 'Oi {primeiro_nome}, check-up grátis!', destinos: [{ cliente_id: ID(1), telefone: '12999990001', nome: 'Maria' }, { cliente_id: ID(2), telefone: '12999990002', nome: 'Carlos' }] };
    const a = await s.chamar('gestor', '/api/envios', pedido); assert.equal(a.status, 200); assert.equal(a.json.enfileirados, 2);
    const b = await s.chamar('gestor', '/api/envios', pedido); assert.equal(b.status, 409); assert.equal(b.json.codigo, 'pedido_repetido');
    assert.equal(s.d.envios.length, 2, 'nada em dobro');
    const c = await s.chamar('gestor', '/api/envios', { ...pedido, corpo: 'Outro texto' }); assert.equal(c.status, 200);
  } finally { await s.fechar(); }
});
