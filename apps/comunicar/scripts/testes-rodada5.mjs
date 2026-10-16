// Rodada 5 (16/10/2026) — carteiro à prova de falhas (CodeWords de MENTIRA, classes de
// erro, cadência, prioridade, intervalo por cliente, limite diário), saúde do WhatsApp,
// réguas ({link_os}/{link_area}, relatório com período), campanhas (segmentos salvos,
// prévia com pulados, teste no meu celular), conectar (ligações) e o preparo para a
// Central (handler exportado, prefixo, caminhos relativos, apps.js).
// Sem banco e sem rede de verdade: tudo local.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as A from '../acesso.js';
import { criarApi } from '../rotas.js';
import * as cart from '../carteiro.js';
import { classificarErro, criarWhatsApp, montarSaude, CLASSES, telefoneInternacional } from '../whatsapp.js';
import {
  renderTemplate, REGUAS, SEGMENTOS, TIPOS_ENVIO, ROTULO_TIPO, decidirFalha, MAX_TENTATIVAS, peneirarSegmento, telefoneNacional,
  montarRelatorio, montarRelatorioPorRegua, montarLigacoes, faltaLink, PADRAO_NUM, somarDias, instanteSP,
} from '../dados.js';
import { linkOs, usaLinkOs, PATIO_URL } from '../patio.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AGORA = Date.parse('2026-10-16T14:00:00Z');

// ============================================================================
// classes de erro — chave recusada ≠ número inválido ≠ instabilidade
// ============================================================================
test('classificarErro: cada erro vira uma classe com texto em português e o que fazer', () => {
  assert.equal(classificarErro({ status: 401, texto: 'Unauthorized' }).classe, 'chave_recusada');
  assert.equal(classificarErro({ status: 403, texto: '' }).classe, 'chave_recusada');
  assert.equal(classificarErro({ status: 200, texto: '{"message":"phone not registered on WhatsApp"}' }).classe, 'numero_invalido');
  assert.equal(classificarErro({ status: 400, texto: 'invalid phone number' }).classe, 'numero_invalido');
  assert.equal(classificarErro({ status: 200, texto: 'device offline' }).classe, 'desconectado');
  assert.equal(classificarErro({ status: 503, texto: 'upstream error' }).classe, 'instabilidade');
  assert.equal(classificarErro({ erro: 'timeout' }).classe, 'instabilidade');
  assert.equal(classificarErro({ erro: 'fetch failed' }).classe, 'instabilidade');
  assert.equal(classificarErro({ status: 429, texto: 'Too Many Requests' }).classe, 'limite');
  assert.equal(classificarErro({ status: 200, texto: '{"status":"skip"}' }).classe, 'nao_entregue');
  assert.equal(classificarErro({ erro: 'CodeWords sem chave' }).classe, 'sem_chave');
  assert.equal(classificarErro({ erro: 'Nenhum WhatsApp conectado' }).classe, 'sem_aparelho');
  const c = classificarErro({ status: 401 });
  assert.equal(c.estrutural, true); assert.equal(c.definitivo, false);
  assert.match(c.motivo, /recusada \(401\)/); assert.match(c.fazer, /Integrações/);
  assert.equal(classificarErro({ status: 200, texto: 'not registered' }).definitivo, true, 'número inválido falha de vez');
  assert.equal(classificarErro({ status: 500 }).estrutural, false, 'instabilidade não para a rodada');
  for (const [k, v] of Object.entries(CLASSES)) { assert.ok(v.titulo && v.motivo && v.fazer, k); assert.doesNotMatch(v.motivo + v.fazer, /prezad|efetu|comparec|veículo/i, k); }
});

test('decidirFalha: espera CRESCENTE (5, 15, 45 min), 3 re-tentativas, definitivo pela classe', () => {
  const t0 = Date.parse('2026-10-16T12:00:00Z');
  assert.equal(MAX_TENTATIVAS, 4);
  assert.equal(decidirFalha('x', 1, t0).esperaMin, 5);
  assert.equal(decidirFalha('x', 2, t0).esperaMin, 15);
  assert.equal(decidirFalha('x', 3, t0).esperaMin, 45);
  assert.equal(decidirFalha('x', 3, t0).enviar_em, '2026-10-16T12:45:00.000Z');
  assert.equal(decidirFalha('x', 4, t0).status, 'falhou');
  assert.equal(decidirFalha('erro qualquer', 1, t0, true).status, 'falhou', 'definitivo dito pela classe');
  assert.equal(decidirFalha('número inválido', 1, t0, false).status, 'pendente', 'a classe vale mais que a regex');
  assert.deepEqual(cart.ESPERAS_MIN, [5, 15, 45]);
  assert.equal(cart.esperaDaTentativa(9), 45);
});

// ============================================================================
// CodeWords de MENTIRA — o whatsapp.js de verdade falando com um servidor local
// ============================================================================
async function codewordsFalso() {
  const estado = { modo: 'ok', chamadas: [], conexoes: [{ phone_id: 'dev1', status: 'logged_in', phone_number: '5512997000000' }] };
  const srv = http.createServer(async (req, res) => {
    let b = ''; for await (const c of req) b += c;
    estado.chamadas.push({ url: req.url, auth: req.headers.authorization, body: b });
    const j = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.headers.authorization !== 'chave-boa') return j(401, { detail: 'Unauthorized' });
    if (req.url.includes('/connections')) return j(200, estado.conexoes);
    if (estado.modo === 'ok') return j(200, { success: true, id: 'abc' });
    if (estado.modo === 'skip') return j(200, { status: 'skip', message: 'device busy' });
    if (estado.modo === 'numero') return j(200, { success: false, message: 'phone not registered on WhatsApp' });
    if (estado.modo === 'offline') return j(200, { message: 'device offline' });
    if (estado.modo === 'erro') return j(500, { detail: 'internal error' });
    if (estado.modo === 'limite') return j(429, { detail: 'Too Many Requests' });
    if (estado.modo === 'lento') { await new Promise((r) => setTimeout(r, 400)); return j(200, { success: true }); }
    return j(200, { success: true });
  });
  await new Promise((ok) => srv.listen(0, ok));
  estado.base = `http://127.0.0.1:${srv.address().port}`;
  estado.fechar = () => new Promise((ok) => srv.close(ok));
  return estado;
}

test('CodeWords falso: sucesso só com "success"; 401 = chave recusada (estrutural); skip/500 tentam de novo; número inválido falha de vez', async () => {
  const cw = await codewordsFalso();
  try {
    const cfg = { api_key: 'chave-boa', servico: 'whatsapp_device_manager', base: cw.base, device_id: 'dev1' };
    const wa = criarWhatsApp({ configWhatsapp: async () => cfg, timeoutEnvioMs: 150 });
    let r = await wa.enviar('12999990001', 'Oi!');
    assert.equal(r.ok, true);
    const ultima = cw.chamadas.at(-1);
    assert.match(ultima.url, /\/run\/whatsapp_device_manager\/proxy\/send\/message\?phone_id=dev1$/);
    assert.match(ultima.body, /phone=5512999990001/, 'telefone com 55');
    assert.equal(ultima.auth, 'chave-boa', 'Authorization com a chave crua');

    cw.modo = 'skip'; r = await wa.enviar('12999990001', 'Oi!');
    assert.equal(r.ok, false); assert.equal(r.classe, 'nao_entregue'); assert.equal(r.estrutural, false); assert.equal(r.definitivo, false);
    cw.modo = 'numero'; r = await wa.enviar('12999990001', 'Oi!');
    assert.equal(r.classe, 'numero_invalido'); assert.equal(r.definitivo, true);
    cw.modo = 'offline'; r = await wa.enviar('12999990001', 'Oi!');
    assert.equal(r.classe, 'desconectado'); assert.equal(r.estrutural, true);
    cw.modo = 'erro'; r = await wa.enviar('12999990001', 'Oi!');
    assert.equal(r.classe, 'instabilidade'); assert.equal(r.estrutural, false);
    cw.modo = 'limite'; r = await wa.enviar('12999990001', 'Oi!');
    assert.equal(r.classe, 'limite');
    cw.modo = 'lento'; r = await wa.enviar('12999990001', 'Oi!');
    assert.equal(r.classe, 'instabilidade', 'timeout = instabilidade'); assert.match(r.erro, /timeout|demorou/i);

    // chave trocada → 401 → estrutural, texto da casa
    const ruim = criarWhatsApp({ configWhatsapp: async () => ({ ...cfg, api_key: 'chave-velha' }) });
    r = await ruim.enviar('12999990001', 'Oi!');
    assert.equal(r.classe, 'chave_recusada'); assert.equal(r.estrutural, true); assert.match(r.erro, /Integrações/);
    const st = await ruim.status(true);
    assert.equal(st.chaveRecusada, true);
    // sem chave / sem aparelho não chamam a rede
    const antes = cw.chamadas.length;
    assert.equal((await criarWhatsApp({ configWhatsapp: async () => ({ ...cfg, api_key: null }) }).enviar('1', 'x')).classe, 'sem_chave');
    assert.equal((await criarWhatsApp({ configWhatsapp: async () => ({ ...cfg, device_id: null }) }).enviar('1', 'x')).classe, 'sem_aparelho');
    assert.equal(cw.chamadas.length, antes);
  } finally { await cw.fechar(); }
});

test('CodeWords falso: status lê /connections (conectado, desconectado, sem o aparelho) e o cache de 60 s', async () => {
  const cw = await codewordsFalso();
  try {
    const cfg = { api_key: 'chave-boa', servico: 'whatsapp_device_manager', base: cw.base, device_id: 'dev1' };
    const wa = criarWhatsApp({ configWhatsapp: async () => cfg });
    let s = await wa.status();
    assert.deepEqual([s.ok, s.conectado, s.numero], [true, true, '5512997000000']);
    cw.conexoes[0].status = 'disconnected';
    s = await wa.status(); assert.equal(s.conectado, true, 'cache de 60 s ainda vale');
    s = await wa.status(true); assert.equal(s.conectado, false); assert.equal(s.classe, 'desconectado');
    cw.conexoes = []; wa.limparCache();
    s = await wa.status(); assert.equal(s.classe, 'sem_aparelho');
    assert.equal(telefoneInternacional('(12) 99999-0001'), '5512999990001');
    assert.equal(telefoneInternacional('5512999990001'), '5512999990001');
  } finally { await cw.fechar(); }
});

// ============================================================================
// cadência, prioridade, intervalo por cliente, limite diário (puros)
// ============================================================================
test('prioridade: pátio pronto › lembrete › pós-venda › … › campanha; empate pela hora', () => {
  const fila = cart.ordenarFila([
    { id: 'c', tipo: 'campanha', enviar_em: '2026-10-16T10:00:00Z' }, { id: 'l', tipo: 'lembrete', enviar_em: '2026-10-16T11:00:00Z' },
    { id: 'p', tipo: 'patio_pronto', enviar_em: '2026-10-16T12:00:00Z' }, { id: 'v', tipo: 'posvenda', enviar_em: '2026-10-16T09:00:00Z' },
    { id: 'c0', tipo: 'campanha', enviar_em: '2026-10-16T08:00:00Z' }, { id: 'x', tipo: 'desconhecido' },
  ]);
  assert.deepEqual(fila.map((e) => e.id), ['p', 'l', 'v', 'c0', 'c', 'x']);
  assert.ok(cart.prioridadeDe('patio_pronto') < cart.prioridadeDe('lembrete') && cart.prioridadeDe('lembrete') < cart.prioridadeDe('posvenda') && cart.prioridadeDe('posvenda') < cart.prioridadeDe('campanha'));
  for (const t of TIPOS_ENVIO) assert.ok(t in cart.PRIORIDADE, `todo tipo tem prioridade: ${t}`);
});

test('cadência: pausa entre envios respeita o limite por minuto; vagas respeitam hora, dia e minuto', () => {
  assert.equal(cart.pausaEntreEnvios(10, { aleatorio: () => 0.5 }), 6000);
  assert.equal(cart.pausaEntreEnvios(60, { aleatorio: () => 0.5 }), 1200, 'nunca abaixo de 1,2 s');
  assert.equal(cart.pausaEntreEnvios(5, { aleatorio: () => 0 }), 10800, '−10 %');
  assert.equal(cart.pausaEntreEnvios(5, { aleatorio: () => 1 }), 13200, '+10 %');
  assert.equal(cart.vagasPorCadencia({ limitePorMinuto: 10, limitePorDia: 300, enviadasHoje: 0, vagasHora: 25 }), 25);
  assert.equal(cart.vagasPorCadencia({ limitePorMinuto: 10, limitePorDia: 300, enviadasHoje: 295, vagasHora: 25 }), 5, 'limite diário');
  assert.equal(cart.vagasPorCadencia({ limitePorMinuto: 1, limitePorDia: 300, enviadasHoje: 0, vagasHora: 25 }), 15, '1/min × 15 min de rodada');
  assert.equal(cart.vagasPorCadencia({ limitePorMinuto: 10, limitePorDia: 300, enviadasHoje: 300, vagasHora: 25 }), 0);
});

test('intervalo por cliente: dois avisos para o mesmo telefone na mesma rodada → o segundo espera; lembrete e pátio não esperam', () => {
  const fila = [
    { id: 'a', tipo: 'campanha', telefone: '12999990001', enviar_em: '2026-10-16T13:00:00Z' },
    { id: 'b', tipo: 'retorno', telefone: '5512999990001', enviar_em: '2026-10-16T13:01:00Z' },
    { id: 'c', tipo: 'campanha', telefone: '12999990002', enviar_em: '2026-10-16T13:02:00Z' },
    { id: 'd', tipo: 'lembrete', telefone: '12999990001', enviar_em: '2026-10-16T13:03:00Z' },
  ];
  const r = cart.separarMesmoCliente(fila, { minutos: 60, agora: AGORA });
  assert.deepEqual(r.agora.map((e) => e.id), ['d', 'c'], 'lembrete primeiro (prioridade) e não espera; o cliente 0001 já recebeu o lembrete, o resto dele espera');
  assert.deepEqual(r.adiados.map((x) => x.envio.id), ['b', 'a'], 'revisão antes da campanha (prioridade)');
  assert.equal(r.adiados[0].enviar_em, new Date(AGORA + 60 * 60000).toISOString());
  const r3 = cart.separarMesmoCliente(fila.filter((e) => e.id !== 'd'), { minutos: 60, agora: AGORA });
  assert.deepEqual(r3.agora.map((e) => e.id), ['b', 'c'], 'sem lembrete: a revisão sai e a campanha do mesmo cliente espera');
  const r2 = cart.separarMesmoCliente(fila, { minutos: 0, agora: AGORA });
  assert.equal(r2.adiados.length, 0, 'zero minutos = desligado');
});

test('horário comercial seg–sáb 8h–17h30 e limite diário escalonando a campanha nos dias seguintes', () => {
  assert.equal(cart.dentroDoHorarioComercial({ diaSemana: 1, hora: 8, minuto: 0 }), true);
  assert.equal(cart.dentroDoHorarioComercial({ diaSemana: 6, hora: 17, minuto: 29 }), true);
  assert.equal(cart.dentroDoHorarioComercial({ diaSemana: 6, hora: 17, minuto: 30 }), false);
  assert.equal(cart.dentroDoHorarioComercial({ diaSemana: 0, hora: 10 }), false);
  assert.equal(cart.dentroDoHorarioComercial({ diaSemana: 3, hora: 7, minuto: 59 }), false);
  const linhas = Array.from({ length: 7 }, (_, i) => ({ id: i }));
  const d = cart.distribuirPorDia(linhas, { limitePorDia: 3, jaHoje: 1, inicioIso: '2026-10-16T14:00:00Z', hoje: '2026-10-16', horaEnvio: '09:30', enviaDomingo: false, feriado: () => null });
  // 16/10 (sex) cabem 2; 17/10 (sáb) 3; domingo pula; 19/10 (seg) 2
  assert.deepEqual(d.porDia, { '2026-10-16': 2, '2026-10-17': 3, '2026-10-19': 2 });
  assert.equal(d.dias, 3);
  assert.equal(d.linhas[0].enviar_em, '2026-10-16T14:00:00Z');
  assert.equal(d.linhas[2].enviar_em, instanteSP('2026-10-17', '09:30').toISOString());
  const f = cart.distribuirPorDia(linhas.slice(0, 4), { limitePorDia: 2, jaHoje: 0, inicioIso: 'x', hoje: '2026-11-01', enviaDomingo: true, feriado: (dia) => (dia === '2026-11-02' ? 'Finados' : null) });
  assert.deepEqual(Object.keys(f.porDia), ['2026-11-01', '2026-11-03'], 'feriado pulado');
  assert.deepEqual(cart.distribuirPorDia([], { limitePorDia: 3, hoje: '2026-10-16' }).porDia, {});
});

// ============================================================================
// saúde do WhatsApp (puro)
// ============================================================================
test('montarSaude: chave recusada → vermelho com o botão para Integrações; conectado → verde; falhas recentes → instável', () => {
  const s = montarSaude({ status: { ok: false, chaveRecusada: true }, fila: { pendentes: 4, atrasados: 2 }, carteiro: { ultimaEm: new Date(AGORA - 5 * 60000).toISOString() }, agora: AGORA });
  assert.equal(s.estado, 'chave_recusada'); assert.equal(s.cor, 'vermelho');
  assert.match(s.acao.alvo, /indycar-atendimento\.onrender\.com\/\?aba=integracoes/); assert.match(s.acao.rotulo, /Colar a chave/);
  assert.ok(s.detalhes.some((d) => /4 mensagens na fila \(2 atrasadas/.test(d)));
  assert.ok(s.detalhes.some((d) => /carteiro rodou há 5 min/.test(d)));
  const ok = montarSaude({ status: { ok: true, conectado: true, numero: '5512997000000' }, agora: AGORA });
  assert.equal(ok.estado, 'ok'); assert.equal(ok.cor, 'verde'); assert.equal(ok.acao, null);
  const inst = montarSaude({ status: { ok: true, conectado: true }, falhas24h: { instabilidade: { total: 5, ultimoErro: 'O CodeWords respondeu 502' } }, agora: AGORA });
  assert.equal(inst.estado, 'instavel'); assert.equal(inst.cor, 'laranja'); assert.match(inst.motivo, /5 envios falharam/);
  const inv = montarSaude({ status: { ok: true, conectado: true }, falhas24h: { numero_invalido: { total: 2 } }, agora: AGORA });
  assert.equal(inv.estado, 'ok'); assert.match(inv.fazer, /2 mensagem\(ns\) falharam por número sem WhatsApp/); assert.equal(inv.acao.alvo, 'mensagens');
  const desc = montarSaude({ status: { ok: true, conectado: false, classe: 'desconectado' } });
  assert.equal(desc.estado, 'desconectado'); assert.match(desc.fazer, /QR code/);
  const semAp = montarSaude({ status: { ok: true, conectado: false, classe: 'sem_aparelho' } });
  assert.equal(semAp.estado, 'sem_aparelho');
  const semResp = montarSaude({ status: { ok: false, classe: 'instabilidade', erro: 'não respondeu em 15 s' } });
  assert.equal(semResp.estado, 'sem_resposta'); assert.match(semResp.motivo, /não respondeu em 15 s/);
  const grav = montarSaude({ status: null, estadoGravado: { estado: 'chave_recusada', em: '2026-10-16T10:00:00Z', motivo: 'recusou' } });
  assert.equal(grav.estado, 'chave_recusada'); assert.equal(grav.motivo, 'recusou');
  assert.equal(montarSaude({}).estado, 'desconhecido');
});

// ============================================================================
// réguas: links, silêncio, relatório com período
// ============================================================================
test('réguas: {link_os} monta o link de acompanhar; sem link a mensagem não sai (faltaLink)', () => {
  assert.equal(linkOs(null, 'ab12cd34ef56ab12cd34'), `${PATIO_URL}/acompanhar/?t=ab12cd34ef56ab12cd34`);
  assert.equal(linkOs('http://x', 'ab12cd34ef56ab12cd34'), null);
  assert.ok(usaLinkOs('Acompanhe: {link_os}')); assert.ok(!usaLinkOs('Oi {nome}'));
  assert.match(faltaLink('x {link_os}', {}), /sem ordem no Pátio/);
  assert.match(faltaLink('x {link_area}', { link_area: '' }), /sem cadastro/);
  assert.equal(faltaLink('x {link_os}', { link_os: 'https://l' }), null);
  assert.equal(faltaLink('x {nome}', {}), null);
  assert.equal(renderTemplate('Oi {primeiro_nome}, acompanhe: {link_os}', { nome: 'Ana Lima', link_os: 'https://p/acompanhar/?t=1' }), 'Oi Ana, acompanhe: https://p/acompanhar/?t=1');
  assert.equal(PADRAO_NUM.intervalo_minimo_dias, 7, 'janela de silêncio padrão de 7 dias');
  assert.equal(PADRAO_NUM.limite_por_minuto, 10); assert.equal(PADRAO_NUM.limite_por_dia, 300); assert.equal(PADRAO_NUM.intervalo_mesmo_cliente_min, 60);
});

test('relatório: opt-out, falhas e período; uma linha por régua', () => {
  const H = '2026-10-16';
  const env = (tipo, status, extra = {}) => ({ tipo, status, enviado_em: status === 'enviado' ? instanteSP(somarDias(H, -3), '10:00').toISOString() : null, enviar_em: instanteSP(somarDias(H, -3), '10:00').toISOString(), ...extra });
  const envios = [env('posvenda', 'enviado', { respondido_em: 'x', resposta_tipo: 'positiva' }), env('posvenda', 'enviado', { respondido_em: 'x', resposta_tipo: 'parar' }), env('posvenda', 'falhou'),
    env('campanha', 'enviado', { agendou_depois_id: ID(1), respondido_em: 'x' }), env('lembrete', 'pendente')];
  const r = montarRelatorio(envios, 'todas', 8, H, { de: '2026-10-01', ate: H });
  assert.deepEqual([r.total.enviadas, r.total.respondidas, r.total.agendaram, r.total.optout, r.total.falharam], [3, 3, 1, 1, 1]);
  assert.equal(r.taxaOptout, 33); assert.deepEqual(r.periodo, { de: '2026-10-01', ate: H });
  const linhas = montarRelatorioPorRegua(envios);
  const pv = linhas.find((l) => l.tipo === 'posvenda');
  assert.deepEqual([pv.enviadas, pv.respondidas, pv.optout, pv.falharam, pv.taxaResposta], [2, 2, 1, 1, 100]);
  assert.equal(linhas.find((l) => l.tipo === 'campanha').agendaram, 1);
  assert.ok(linhas.some((l) => l.tipo === 'aniversario' && l.enviadas === 0), 'réguas sem envio aparecem zeradas');
  assert.equal(linhas[0].tipo, 'posvenda', 'ordenado por enviadas');
});

// ============================================================================
// campanhas: peneira do segmento com os motivos
// ============================================================================
test('peneirarSegmento: quem recebe e quem fica de fora, com o motivo (não quer, sem telefone, repetido, intervalo)', () => {
  const lista = [
    { id: ID(1), nome: 'A', telefone: '12999990001' }, { id: ID(2), nome: 'B', telefone: null },
    { id: ID(3), nome: 'C', telefone: '12999990003', aceita_mensagens: false }, { id: ID(1), nome: 'A de novo', telefone: '12999990001' },
    { id: ID(4), nome: 'D', telefone: '12999990004' }, null,
  ];
  const r = peneirarSegmento(lista, { optOut: new Set([ID(9)]), porteiro: { podeReceber: ({ cliente_id }) => ({ ok: cliente_id !== ID(4) }) } });
  assert.deepEqual(r.recebem.map((c) => c.id), [ID(1), ID(4)], 'quem recebeu outra há pouco RECEBE (campanha é decisão de gente)');
  assert.deepEqual(r.pulados, { nao_quer: 1, sem_telefone: 1, repetido: 1 }); assert.equal(r.recentes, 1);
  assert.equal(r.total, 5);
  const r2 = peneirarSegmento(lista, { optOut: new Set([ID(1)]) });
  assert.deepEqual(r2.recebem.map((c) => c.id), [ID(4)]); assert.equal(r2.pulados.nao_quer, 2);
});

// ============================================================================
// conectar: ligações a partir do cliente_360
// ============================================================================
test('montarLigacoes: do JSON do cliente_360 para os links certos (conversa, lead, OS, orçamento, tarefas)', () => {
  const c360 = {
    telefone: '12999990001',
    conversa: { id: ID(10), status: 'aberta', etapa: 'Orçamento', atribuida_a_nome: 'Leonardo', aguardando_consultor: true },
    leads: [{ id: ID(20), status: 'orcamento', servico: 'freio', responsavel_nome: 'Leo' }],
    patio: [{ id: ID(30), numero: 7, etapa: 'entregue' }, { id: ID(31), numero: 8, etapa: 'em_execucao', extras_pendentes: 1, link_cliente: 'https://p/acompanhar/?t=x' }],
    orcamentos: [{ id: ID(40), status: 'enviado', total: 890 }], agendamentos: [{ id: ID(50), data: '2026-10-20', hora: '09:00', servico: 'óleo', status: 'confirmado' }],
    tarefas: [{ id: ID(60), titulo: 'Ligar', responsavel_nome: 'Leo' }], indicacoes: { fez: [{}, {}], foi_indicado_por: { nome: 'Maria' } }, resumo: { total_gasto: 100 },
  };
  const l = montarLigacoes(c360);
  assert.match(l.conversa.link, /indycar-atendimento\.onrender\.com\/\?conversa=00000000-0000-4000-8000-000000000010$/);
  assert.equal(l.conversa.aguardando_consultor, true); assert.equal(l.conversa.atribuida_a, 'Leonardo');
  assert.match(l.leads[0].link, /indycar-crm\.onrender\.com\/\?lead=/);
  assert.equal(l.carroNaOficina.id, ID(31), 'a ordem aberta, não a entregue');
  assert.match(l.carroNaOficina.link, /indycar-patio\.netlify\.app\/\?os=/);
  assert.match(l.orcamentos[0].link, /indycar-orcador\.netlify\.app\/\?orcamento=/);
  assert.match(l.agendamentos[0].link, /indycar-agendamentos\.onrender\.com\/\?agendamento=/);
  assert.equal(l.tarefas[0].responsavel, 'Leo'); assert.equal(l.indicacoes.fez, 2); assert.equal(l.indicacoes.foiIndicadoPor, 'Maria');
  assert.equal(montarLigacoes(null), null);
  assert.equal(montarLigacoes({ leads: null }).carroNaOficina, null, 'listas nulas não quebram');
});

test('apps.js: um lugar só para os endereços; LINKS montam o registro certo e tiram o 55 do telefone', () => {
  const { APPS, LINKS, semDDI } = globalThis.IndyApps;
  assert.equal(APPS.comunicar.url, 'https://indycar-posvenda.onrender.com');
  assert.equal(A.APPS.atendimento.url, APPS.atendimento.url, 'acesso.js lê do mesmo lugar');
  assert.equal(LINKS.conversaTel('5512999990001'), 'https://indycar-atendimento.onrender.com/?tel=12999990001');
  assert.equal(LINKS.conversaTel(''), null);
  assert.equal(LINKS.integracoes(), 'https://indycar-atendimento.onrender.com/?aba=integracoes');
  assert.equal(LINKS.clienteCrm(ID(1), '55 12 99999-0001'), `https://indycar-crm.onrender.com/?cliente=${ID(1)}&tel=12999990001`);
  assert.equal(LINKS.os(null), null); assert.equal(semDDI('5512999990001'), '12999990001'); assert.equal(semDDI('5599999'), '5599999', 'número curto não perde o começo');
  // o MESMO arquivo roda no navegador: não usa export nem require
  const fonte = readFileSync(join(RAIZ, 'public', 'apps.js'), 'utf8');
  assert.doesNotMatch(fonte, /^\s*(export|import|require)\b/m);
  assert.match(fonte, /window/);
});

// ============================================================================
// preparo para a Central: caminhos relativos, SW/manifest relativos, handler exportado
// ============================================================================
test('frontend: nenhum caminho absoluto para o próprio app (api, sw, manifest, ícones, scripts)', () => {
  const pub = (n) => readFileSync(join(RAIZ, 'public', n), 'utf8');
  const html = pub('index.html');
  assert.doesNotMatch(html, /(href|src)="\/(?!\/)/, 'index.html sem href="/…"');
  assert.match(html, /src="apps\.js\?v=/); assert.match(html, /src="rodada5\.js\?v=/);
  for (const f of ['app.js', 'conta.js', 'rodada4.js', 'rodada5.js', 'acordar.js']) {
    const s = pub(f);
    assert.doesNotMatch(s, /fetch\((['"`])\/api/, `${f}: fetch('/api…')`);
    assert.doesNotMatch(s, /buscar\((['"`])\/api/, `${f}: buscar('/api…')`);
    assert.doesNotMatch(s, /register\(['"]\/sw\.js/, `${f}: register('/sw.js')`);
    assert.doesNotMatch(s, /location\.replace\(['"]\/['"]\)/, `${f}: location.replace('/')`);
  }
  const man = JSON.parse(pub('manifest.json'));
  assert.equal(man.start_url, './'); assert.equal(man.scope, './');
  assert.ok(man.icons.every((i) => i.src.startsWith('./'))); assert.ok(man.shortcuts.every((s) => s.url.startsWith('./')));
  const sw = pub('sw.js');
  assert.match(sw, /const BASE = new URL\('\.\/', self\.location\.href\)\.pathname/);
  assert.doesNotMatch(sw, /'\/api\//); assert.match(sw, /VERSAO = '5\.0\.0'/); assert.match(sw, /rodada5\.js/);
});

test('server.js: exporta handler/iniciar sem dar listen; o handler tira o prefixo (/comunicar) e /api/config devolve o prefixo', async () => {
  process.env.CARTEIRO_DESLIGADO = '1';
  const mod = await import('../server.js');
  assert.equal(typeof mod.handler, 'function'); assert.equal(typeof mod.iniciar, 'function');
  assert.equal(typeof mod.ligarCarteiro, 'function'); assert.equal(mod.normalizarPrefixo('comunicar/'), '/comunicar'); assert.equal(mod.normalizarPrefixo('/'), '');
  const srv = http.createServer((req, res) => { if (/^\/comunicar(\/|$)/.test(req.url)) req.prefixo = '/comunicar'; mod.handler(req, res); });
  await new Promise((ok) => srv.listen(0, ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    let r = await fetch(`${base}/comunicar/api/ping`); assert.equal(r.status, 200); assert.equal((await r.json()).versao, mod.VERSAO);
    r = await fetch(`${base}/comunicar/api/config`); assert.equal((await r.json()).prefixo, '/comunicar', 'a tela sabe onde está');
    r = await fetch(`${base}/api/config`); assert.equal((await r.json()).prefixo, '', 'sozinho: sem prefixo');
    r = await fetch(`${base}/comunicar/manifest.json`); assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /json/);
    r = await fetch(`${base}/comunicar/`); assert.equal(r.status, 200); assert.match(await r.text(), /IndyCar Comunicar/);
    r = await fetch(`${base}/comunicar/api/nada`); assert.equal(r.status, 404);
    r = await fetch(`${base}/comunicar/api/resumo`); assert.equal(r.status, 401, 'login continua exigido com prefixo');
    r = await fetch(`${base}/comunicar/api/rodar`, { method: 'POST' }); assert.equal(r.status, 403, 'carteiro sem token fechado');
  } finally { await new Promise((ok) => srv.close(ok)); }
});

// ============================================================================
// API de verdade (rotas.js) com dados falsos: saúde, segmentos salvos, teste-meu, 360, ligações, relatório
// ============================================================================
const PERFIS = {
  gestor: { id: ID(2), nome: 'Gisele', papel: 'gestor', ativo: true, apps: ['comunicar'], telefone: '12988887777' },
  atendente: { id: ID(3), nome: 'Leonardo', papel: 'atendente', ativo: true, apps: ['comunicar'], telefone: '' },
  atendente2: { id: ID(4), nome: 'Bia', papel: 'atendente', ativo: true, apps: ['comunicar'], telefone: '12977776666' },
};
async function subir({ status = { ok: true, conectado: true, numero: '5512997000000' }, enviar = async () => ({ ok: true }) } = {}) {
  const d = {
    envios: [], auditoria: [], segmentos: [], cfg: { limite_por_minuto: 10, limite_por_hora: 60, limite_por_dia: 3, intervalo_mesmo_cliente_min: 60, janela_inicio: 8, janela_fim: 20, intervalo_minimo_dias: 7, hora_envio: '09:30', envia_domingo: false, whatsapp: { estado: null } },
    clientes: [{ id: ID(101), nome: 'Maria', telefone: '12999990001', carro: 'HB20', aceita_mensagens: true }, { id: ID(102), nome: 'Carlos', telefone: '12999990002', aceita_mensagens: true },
      { id: ID(103), nome: 'Vanderlei', telefone: '12999990003', aceita_mensagens: false }, { id: ID(104), nome: 'Dona', telefone: '12999990004', aceita_mensagens: true }, { id: ID(105), nome: 'Edu', telefone: '12999990005', aceita_mensagens: true }],
  };
  Object.assign(d, {
    SEGMENTOS, REGUAS, TIPOS_ENVIO, ROTULO_TIPO, renderTemplate, hoje: () => '2026-10-16', agoraSP: () => ({ data: '2026-10-16', hora: 10, minuto: 0, diaSemana: 5 }), feriado: () => null,
    ehUuid: (v) => /^[0-9a-f-]{36}$/i.test(String(v || '')), soDigitos: (t) => String(t ?? '').replace(/\D/g, ''), telefoneNacional,
    auditar: async (...a) => { d.auditoria.push(a); return 1; }, notificar: async () => null, gestores: async () => [], marcarAcesso: async () => null,
    obterConfig: async () => d.cfg,
    segmentar: async () => d.clientes.filter((c) => c.aceita_mensagens),
    segmentarComMotivos: async () => ({ lista: d.clientes.filter((c) => c.aceita_mensagens), total: 4, bruto: 5, pulados: { nao_quer: 1, sem_telefone: 0, repetido: 0 }, recentes: 1, intervalo_dias: 7 }),
    carregarPorteiro: async () => ({ podeReceber: ({ cliente_id }) => (d.clientes.find((c) => c.id === cliente_id)?.aceita_mensagens === false ? { ok: false } : { ok: true }) }),
    enfileirar: async (e) => { const x = { id: ID(900 + d.envios.length), status: 'pendente', ...e }; d.envios.push(x); return x; },
    enfileirarVarios: async (l) => { d.envios.push(...l); return l.length; },
    marcarEnvio: async () => null, cargaDeHoje: async () => 1,
    falhasPorClasse: async () => ({ numero_invalido: { total: 2, ultimoErro: 'not registered', ultimoEm: 'x' } }),
    resumoDaFila: async () => ({ pendentes: 3, atrasados: 1, maisAntigoEm: null }),
    batidasRecentes: async () => [{ em: new Date().toISOString(), origem: 'cron', ok: true, enviados: 1 }], chamadasRecentes: async () => [],
    listarSegmentosSalvos: async () => d.segmentos,
    salvarSegmento: async (s) => { if (String(s.nome || '').trim().length < 2) throw new Error('Dê um nome ao segmento (2 a 60 letras).'); const x = { id: ID(700 + d.segmentos.length), ...s, valor: s.valor == null ? null : String(s.valor), usos: 0 }; d.segmentos.push(x); return x; },
    obterSegmentoSalvo: async (id) => d.segmentos.find((s) => s.id === id) || null,
    apagarSegmentoSalvo: async (id) => { const n = d.segmentos.length; d.segmentos = d.segmentos.filter((s) => s.id !== id); return d.segmentos.length < n; },
    marcarSegmentoUsado: async (id) => { const s = d.segmentos.find((x) => x.id === id); if (s) s.usos++; return s; },
    cliente360: async (tel) => (tel === '12999990001' ? { telefone: tel, cliente: { id: ID(101), nome: 'Maria' }, conversa: { id: ID(10), etapa: 'Orçamento' }, leads: [{ id: ID(20), status: 'orcamento' }], patio: [{ id: ID(31), etapa: 'pronto' }], orcamentos: [], tarefas: [], agendamentos: [], indicacoes: {}, resumo: { mensagens_total: 3 } } : { telefone: tel, cliente: null, leads: [], patio: [] }),
    montarLigacoes,
    ligacoesDoEnvio: async (id) => (d.envios.find((e) => e.id === id) ? { envio: { id }, links: { conversa: 'https://x/?conversa=1', lead: null, os: null, agendamento: null }, ligacoes: {} } : null),
    relatorioRegua: async (tipo, semanas, { de, ate }) => ({ tipo: tipo || 'todas', semanas: [], total: { enviadas: 0 }, periodo: { de, ate } }),
    relatorioPorRegua: async ({ de, ate }) => ({ periodo: { de: de || '2026-09-16', ate: ate || '2026-10-16' }, linhas: [] }),
    obterCliente: async (id) => d.clientes.find((c) => c.id === id) || null, agendamentosDoCliente: async () => [{ id: ID(50), data: '2026-10-20', hora: '09:00', servico: 'óleo' }],
    linksDaRegua: async (t) => (/\{link_os\}/.test(t) ? { link_os: '' } : {}), faltaLink, quandoRelativo: () => 'segunda-feira (20/10) às 09:00',
  });
  const api = criarApi({
    dados: d, versao: 'teste', runnerToken: 'tok', log: { error() {} }, prefixo: '',
    autenticar: async (req) => { const p = PERFIS[req.headers['x-teste-perfil']]; if (!p) return { status: 401, codigo: 'sem_login', erro: 'Faça login.' };
      const v = A.verificarAcesso(p); return v.ok ? { usuario: { ...p, email: 'x@t' } } : v; },
    whatsapp: { enviar, status: async () => status, reconferir: () => { d.reconferiu = true; } },
    carteiro: { rodar: async () => ({ ok: true }), lerRespostas: async () => ({ lidas: 0 }), ultimaRodada: () => null },
  });
  const srv = http.createServer((req, res) => { const url = new URL(req.url, 'http://x'); api.api(req, res, url).catch((e) => api.erroInterno(res, e)); });
  await new Promise((ok) => srv.listen(0, ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const chamar = async (perfil, metodo, caminho, corpo) => {
    const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...(perfil ? { 'x-teste-perfil': perfil } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  return { d, chamar, fechar: () => new Promise((ok) => srv.close(ok)) };
}

test('API: /whatsapp/saude junta status, falhas por classe, fila e cadência; reconferir só gestor e esquece a chave em cache', async () => {
  const s = await subir();
  try {
    let r = await s.chamar('atendente', 'GET', '/api/whatsapp/saude');
    assert.equal(r.status, 200); assert.equal(r.json.estado, 'ok'); assert.match(r.json.fazer, /número sem WhatsApp/);
    assert.deepEqual(r.json.cadencia.porMinuto, 10); assert.equal(r.json.cadencia.porDia, 3); assert.equal(r.json.cadencia.janela.fim, 20);
    assert.ok(r.json.detalhes.some((x) => /3 mensagens na fila \(1 atrasada/.test(x)));
    r = await s.chamar('atendente', 'POST', '/api/whatsapp/reconferir', {}); assert.equal(r.status, 403);
    r = await s.chamar('gestor', 'POST', '/api/whatsapp/reconferir', {}); assert.equal(r.status, 200); assert.equal(s.d.reconferiu, true);
    assert.ok(s.d.auditoria.some((a) => a[1] === 'whatsapp_reconferido'));
    r = await s.chamar(null, 'GET', '/api/whatsapp/saude'); assert.equal(r.status, 401);
  } finally { await s.fechar(); }
});

test('API: chave recusada → saúde vermelha com o link para Atendimento › Integrações', async () => {
  const s = await subir({ status: { ok: false, chaveRecusada: true, classe: 'chave_recusada' } });
  try {
    const r = await s.chamar('gestor', 'GET', '/api/whatsapp/saude');
    assert.equal(r.json.estado, 'chave_recusada'); assert.equal(r.json.cor, 'vermelho');
    assert.equal(r.json.acao.alvo, 'https://indycar-atendimento.onrender.com/?aba=integracoes');
  } finally { await s.fechar(); }
});

test('API: segmentos salvos — qualquer um da equipe salva e usa; apaga só o próprio (gestor apaga qualquer); nome curto = 400', async () => {
  const s = await subir();
  try {
    let r = await s.chamar('atendente', 'POST', '/api/segmentos/salvos', { nome: 'Sumidos 6 m', filtro: 'sem_voltar', valor: 6 });
    assert.equal(r.status, 200); assert.equal(r.json.valor, '6'); assert.equal(r.json.criado_por, ID(3));
    const id = r.json.id;
    r = await s.chamar('atendente', 'POST', '/api/segmentos/salvos', { nome: 'x', filtro: 'todos' }); assert.equal(r.status, 400);
    r = await s.chamar('atendente', 'POST', '/api/segmentos/salvos', { nome: 'Inventado', filtro: 'vip' }); assert.equal(r.status, 400);
    r = await s.chamar('atendente2', 'GET', '/api/segmentos/salvos'); assert.equal(r.json.length, 1, 'todos veem');
    r = await s.chamar('atendente2', 'DELETE', `/api/segmentos/salvos/${id}`); assert.equal(r.status, 403, 'não é dela');
    r = await s.chamar('atendente', 'DELETE', `/api/segmentos/salvos/${id}`); assert.equal(r.status, 200);
    r = await s.chamar('gestor', 'POST', '/api/segmentos/salvos', { nome: 'Da Gisele', filtro: 'todos' }); const id2 = r.json.id;
    r = await s.chamar('atendente', 'DELETE', `/api/segmentos/salvos/${id2}`); assert.equal(r.status, 403);
    r = await s.chamar('gestor', 'DELETE', `/api/segmentos/salvos/${ID(999)}`); assert.equal(r.status, 404);
    // campanha pelo segmento salvo marca o uso; a prévia traz os pulados com o motivo
    r = await s.chamar('gestor', 'GET', '/api/segmentos/previa?filtro=todos');
    assert.equal(r.json.bruto, 5); assert.equal(r.json.pulados.nao_quer, 1); assert.equal(r.json.recentes, 1); assert.equal(r.json.intervalo_dias, 7);
    r = await s.chamar('gestor', 'POST', '/api/envios', { corpo: 'Oi {primeiro_nome}!', segmento: { filtro: 'todos' }, segmento_salvo_id: id2 });
    assert.equal(r.status, 200); assert.equal(r.json.enfileirados, 4);
    await new Promise((ok) => setTimeout(ok, 20));
    assert.equal(s.d.segmentos.find((x) => x.id === id2).usos, 1);
    assert.ok(s.d.auditoria.some((a) => a[1] === 'segmento_salvo') && s.d.auditoria.some((a) => a[1] === 'segmento_apagado'));
  } finally { await s.fechar(); }
});

test('API: campanha acima do limite diário é escalonada (hoje cabe 2 de 3, o resto amanhã 9h30) e a resposta diz em quantos dias', async () => {
  const s = await subir();
  try {
    const r = await s.chamar('gestor', 'POST', '/api/envios', { corpo: 'Oi {primeiro_nome}!', segmento: { filtro: 'todos' } });
    assert.equal(r.json.enfileirados, 4); assert.equal(r.json.dias, 2); assert.equal(r.json.limitePorDia, 3);
    assert.deepEqual(Object.values(r.json.porDia), [2, 2]);
    const amanha = s.d.envios.filter((e) => e.enviar_em === instanteSP('2026-10-17', '09:30').toISOString());
    assert.equal(amanha.length, 2);
  } finally { await s.fechar(); }
});

test('API: "mandar para o meu celular" usa o telefone do perfil; sem telefone = 400 claro; WhatsApp recusado = 502 com a classe', async () => {
  const enviados = [];
  const s = await subir({ enviar: async (tel, msg) => { enviados.push({ tel, msg }); return tel === '12977776666' ? { ok: false, erro: 'recusou', classe: 'chave_recusada', fazer: 'cole a chave' } : { ok: true }; } });
  try {
    let r = await s.chamar('gestor', 'POST', '/api/envios/teste-meu', { corpo: 'Oi {primeiro_nome}, {link_area}' });
    assert.equal(r.status, 200); assert.equal(r.json.telefone, '…7777');
    assert.equal(enviados[0].tel, '12988887777'); assert.match(enviados[0].msg, /^\[teste\] Oi Gisele, https:\/\/indycar-patio/);
    assert.ok(s.d.envios.some((e) => /^Teste \(Gisele\)/.test(e.nome) && e.status === 'enviado'), 'fica no histórico como teste');
    r = await s.chamar('atendente', 'POST', '/api/envios/teste-meu', { corpo: 'Oi' }); assert.equal(r.status, 400); assert.equal(r.json.codigo, 'sem_telefone');
    r = await s.chamar('atendente2', 'POST', '/api/envios/teste-meu', { corpo: 'Oi' }); assert.equal(r.status, 502); assert.equal(r.json.classe, 'chave_recusada');
    r = await s.chamar('gestor', 'POST', '/api/envios/teste-meu', { corpo: '' }); assert.equal(r.status, 400);
    assert.ok(s.d.auditoria.some((a) => a[1] === 'envio_teste_proprio' && a[4].telefone === '…7777'), 'auditado com o telefone mascarado');
  } finally { await s.fechar(); }
});

test('API: ficha 360 pelo telefone, ligações de um envio, relatório com período e prévia real', async () => {
  const s = await subir();
  try {
    let r = await s.chamar('atendente', 'GET', '/api/clientes/360?tel=5512999990001');
    assert.equal(r.status, 200); assert.equal(r.json.cliente.nome, 'Maria'); assert.match(r.json.ligacoes.conversa.link, /\?conversa=/); assert.equal(r.json.ligacoes.carroNaOficina.etapa, 'pronto');
    r = await s.chamar('atendente', 'GET', '/api/clientes/360?tel=123'); assert.equal(r.status, 400);
    r = await s.chamar('atendente', 'GET', '/api/clientes/360?tel=12999990009'); assert.equal(r.json.cliente, null); assert.equal(r.json.ligacoes.conversa, null);
    await s.chamar('gestor', 'POST', '/api/envios', { corpo: 'Oi', destinos: [{ cliente_id: ID(101), telefone: '12999990001', nome: 'Maria' }] });
    const id = s.d.envios[0].id;
    r = await s.chamar('atendente', 'GET', `/api/envios/${id}/ligacoes`); assert.equal(r.status, 200); assert.match(r.json.links.conversa, /conversa=/);
    r = await s.chamar('atendente', 'GET', `/api/envios/${ID(555)}/ligacoes`); assert.equal(r.status, 404);
    r = await s.chamar('atendente', 'GET', '/api/relatorio?regua=posvenda&de=2026-10-01&ate=2026-10-16'); assert.deepEqual(r.json.periodo, { de: '2026-10-01', ate: '2026-10-16' });
    r = await s.chamar('atendente', 'GET', '/api/relatorio?de=2026-10-16&ate=2026-10-01'); assert.equal(r.status, 400);
    r = await s.chamar('atendente', 'GET', '/api/relatorio/reguas'); assert.equal(r.json.periodo.ate, '2026-10-16');
    r = await s.chamar('atendente', 'GET', `/api/previa/mensagem?regua=lembrete&cliente_id=${ID(101)}&corpo=${encodeURIComponent('Oi {primeiro_nome}, {quando} {link_os}')}`);
    assert.equal(r.status, 200); assert.match(r.json.texto, /^Oi Maria, segunda-feira/); assert.match(r.json.falta, /sem ordem no Pátio/);
    r = await s.chamar('atendente', 'GET', '/api/previa/mensagem?regua=lembrete&cliente_id=x'); assert.equal(r.status, 400);
    r = await s.chamar('atendente', 'GET', '/api/config'); assert.equal(r.json.prefixo, '');
  } finally { await s.fechar(); }
});

test('acesso: as rotas novas estão no mapa com a permissão certa; permissão desconhecida continua fechada', () => {
  const regra = (m, p) => A.regraDaRota(m, p);
  assert.equal(regra('GET', '/api/whatsapp/saude').perm, 'ver');
  assert.equal(regra('POST', '/api/whatsapp/reconferir').perm, 'rodar');
  assert.equal(regra('POST', '/api/segmentos/salvos').perm, 'segmentos_salvar');
  assert.equal(regra('DELETE', `/api/segmentos/salvos/${ID(1)}`).perm, 'segmentos_salvar');
  assert.equal(regra('POST', '/api/envios/teste-meu').perm, 'teste_proprio'); assert.equal(regra('POST', '/api/envios/teste-meu').caro, true);
  assert.equal(regra('GET', '/api/clientes/360').perm, 'ver');
  assert.equal(regra('GET', `/api/envios/${ID(1)}/ligacoes`).perm, 'ver');
  assert.equal(regra('GET', '/api/relatorio/reguas').perm, 'ver');
  assert.equal(regra('GET', '/api/previa/mensagem').perm, 'ver');
  assert.equal(regra('PUT', '/api/segmentos/salvos')?.metodoErrado, true);
  assert.equal(A.pode({ papel: 'atendente' }, 'teste_proprio'), true);
  assert.equal(A.pode({ papel: 'atendente' }, 'segmentos_apagar'), false);
  assert.equal(A.pode({ papel: 'gestor' }, 'segmentos_apagar'), true);
  assert.match(A.motivo403('segmentos_apagar'), /Só gestor/);
});

test('remarcacao (aviso da Agenda) e campanha vinda do CRM: rótulo, prioridade do lembrete, não espera o intervalo por cliente', () => {
  assert.ok(TIPOS_ENVIO.includes('remarcacao')); assert.equal(ROTULO_TIPO.remarcacao, 'Horário remarcado');
  assert.equal(cart.prioridadeDe('remarcacao'), cart.prioridadeDe('lembrete'));
  const r = cart.separarMesmoCliente([{ id: 'c', tipo: 'campanha', telefone: '12999990001', enviar_em: 'a' }, { id: 'r', tipo: 'remarcacao', telefone: '12999990001', enviar_em: 'b' }], { minutos: 60, agora: AGORA });
  assert.deepEqual(r.agora.map((e) => e.id), ['r'], 'remarcação sai na hora; a campanha do mesmo cliente espera');
  assert.ok(!cart.ordenarFila([{ tipo: 'campanha' }, { tipo: 'remarcacao' }])[0].tipo.includes('campanha'));
});
