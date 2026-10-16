// Rodada 4 (14/10/2026) — carteiro tolerante ao Render dormindo, "Pronto para
// ligar", prévia do mês, aniversários (lista, CSV, conversas), indicadores por
// pessoa, pedir ao gestor, compressão/ETag e o "acordando" da tela.
// Sem banco e sem rede: funções puras + a API real (rotas.js) com dados falsos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import vm from 'node:vm';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import * as A from '../acesso.js';
import { criarApi, aceitaCodificacao } from '../rotas.js';
import { renderTemplate, REGUAS, SEGMENTOS, TIPOS_ENVIO, ROTULO_TIPO, montarIndicadores, somarDias, instanteSP } from '../dados.js';
import * as an from '../aniversarios.js';
import { projetarMes, diaDeSaida } from '../projecao.js';
import { montarProntidao } from '../prontidao.js';
import * as cart from '../carteiro.js';
import { criarEstaticos } from '../estaticos.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ANO = { anoAtual: 2026 };

// ============================================================================
// aniversários
// ============================================================================
test('aniversários: lerData entende os jeitos comuns e recusa data que não existe', () => {
  const casos = {
    '12/05/1980': '1980-05-12', '12/05/80': '1980-05-12', '5.6.2001': '2001-06-05', '12-05': '1904-05-12', '1980-05-12': '1980-05-12',
    '12 de maio': '1904-05-12', '12 de maio de 1980': '1980-05-12', '12/mai/80': '1980-05-12', '3 Março': '1904-03-03',
    '29/02': '1904-02-29', '12/05/1980 00:00:00': '1980-05-12',
  };
  for (const [t, esperado] of Object.entries(casos)) assert.equal(an.lerData(t, ANO), esperado, t);
  for (const ruim of ['29/02/1981', '31/04/1990', '2030-01-01', '13/13', 'amanhã', '', null, '01/01/1890']) assert.equal(an.lerData(ruim, ANO), null, String(ruim));
});

test('aniversários: lista colada sem cabeçalho — telefone não vira data, nome limpo', () => {
  const { linhas, cabecalho } = an.lerLista('Maria Souza; (12) 99999-0001; 14/10/1988\nJoão 12 99999-0002 02/03\nlixo sem data\nCarla - 3 de maio', ANO);
  assert.equal(cabecalho, false);
  assert.deepEqual(linhas.map((l) => [l.nome, l.telefone, l.data]), [
    ['Maria Souza', '12999990001', '1988-10-14'], ['João', '12999990002', '1904-03-02'], ['lixo sem data', null, null], ['Carla', null, '1904-05-03']]);
  assert.match(linhas[2].erro, /sem data/);
  assert.match(an.lerLista('Marcos 31/02', ANO).linhas[0].erro, /não entendi a data "31.02"/);
  assert.equal(an.lerLista('Marcos 31/02', ANO).linhas[0].nome, 'Marcos');
});

test('aniversários: CSV com cabeçalho (aspas, vírgula no nome) e "data" como coluna', () => {
  const { linhas, cabecalho } = an.lerLista('Nome,Telefone,Data de nascimento\n"Souza, Maria",12999990001,14/10/1988\nJoão,,02/03\nZé,129,31/02', ANO);
  assert.equal(cabecalho, true);
  assert.equal(linhas[0].nome, 'Souza, Maria'); assert.equal(linhas[0].data, '1988-10-14');
  assert.equal(linhas[1].telefone, null); assert.equal(linhas[1].data, '1904-03-02');
  assert.match(linhas[2].erro, /não entendi a data/);
});

test('aniversários: casa por telefone, pelos 8 últimos dígitos e pelo nome; ambíguo não grava', () => {
  const cl = [{ id: 'a', nome: 'Maria Aparecida Souza', telefone: '12999990001', nascimento: null },
    { id: 'b', nome: 'João Silva', telefone: '5512999990002', nascimento: '1904-03-02' },
    { id: 'c', nome: 'Carlos Lima', telefone: '1288887777' }, { id: 'd', nome: 'Carlos Lima', telefone: '1277776666' },
    { id: 'e', nome: 'Ângela Prado', telefone: '1233334444', nascimento: '1970-01-01' }];
  const itens = an.casarComClientes(an.lerLista('Maria Souza; 12 9999-0001; 14/10/1988\nJoão Silva 999990002 02/03\nCarlos Lima 05/05/1970\nFulano 11/11\nangela prado 10/10/1971', ANO).linhas, cl);
  assert.deepEqual(itens.map((i) => i.status), ['casou', 'casou', 'ambiguo', 'nao_achou', 'casou']);
  assert.equal(itens[0].cliente_id, 'a'); assert.equal(itens[0].como, 'telefone');
  assert.equal(itens[1].igual, true);
  assert.equal(itens[2].candidatos.length, 2);
  assert.equal(itens[4].como, 'nome'); assert.equal(itens[4].troca, true);
  const r = an.resumirAnalise(itens);
  assert.deepEqual([r.novos, r.iguais, r.trocas, r.ambiguos, r.nao_achou], [1, 1, 1, 1, 1]);
  assert.deepEqual(an.escolherGravacoes(itens), [{ cliente_id: 'a', nascimento: '1988-10-14' }], 'sem "substituir" não troca data existente');
  assert.equal(an.escolherGravacoes(itens, { substituir: true }).length, 2);
});

test('aniversários: acha data perto de "aniversário/nasci" em texto livre e monta sugestões', () => {
  const achou = an.procurarDatas('Cliente disse: meu aniversário é dia 12/05, ligar antes. Nasci em 3 de maio de 1980', ANO);
  assert.deepEqual(achou.map((x) => x.data), ['1904-05-12', '1980-05-03']);
  assert.deepEqual(an.procurarDatas('Telefone 12 99999-0001, revisão dia 12/05', ANO), [], 'sem a palavra-chave não pega');
  const clientes = new Map([[ID(1), { id: ID(1), nome: 'Ana', telefone: '1', nascimento: null }], [ID(2), { id: ID(2), nome: 'Bia', telefone: '2', nascimento: '1904-10-28' }]]);
  const s = an.montarSugestoes({
    fichas: [{ id: ID(3), nome: 'Caio', telefone: '3', nascimento: null, observacoes: 'aniversário 22/11' }],
    leads: [{ cliente_id: ID(1), observacoes: 'nasceu em 01/02/1990 (nascimento)' }],
    mensagens: [{ corpo: 'é meu aniversário dia 28/10!', conversa: { cliente_id: ID(2) } }, { corpo: 'meu niver é 05/05', conversa: { cliente_id: ID(1) } }],
  }, clientes, ANO);
  assert.deepEqual(s.map((x) => [x.nome, x.data, x.fonte]), [['Caio', '1904-11-22', 'ficha'], ['Ana', '1990-02-01', 'crm']], 'quem já tem a mesma data fica de fora; um por cliente');
});

// ============================================================================
// prévia do mês
// ============================================================================
const CFG = {
  ativo_lembrete: true, ativo_posvenda: false, horas_lembrete: 20, dias_posvenda: 2, meses_retorno: 6, dias_orcamento: 3, dias_nao_fechou: 7,
  meses_reativacao: 12, intervalo_minimo_dias: 7, envia_domingo: false, limite_por_hora: 60, janela_inicio: 8, janela_fim: 20, link_avaliacao: '',
};
const HOJE = '2026-10-14'; // quarta
const AGORA = instanteSP(HOJE, '10:00');

test('projeção: lembrete, pós-venda (certo e estimado), avaliação estimada e opt-out', () => {
  const clientes = [{ id: ID(1), nome: 'Ana', telefone: '1299', nascimento: null }, { id: ID(2), nome: 'Bia', telefone: '1288', aceita_mensagens: false }];
  const ag = [
    { id: ID(10), cliente_id: ID(1), cliente_nome: 'Ana', telefone: '1299', servico: 'óleo', data: '2026-10-16', hora: '09:00', status: 'confirmado' },
    { id: ID(11), cliente_id: ID(1), cliente_nome: 'Ana', telefone: '1299', servico: 'freio', data: '2026-10-13', status: 'concluido' },
    { id: ID(12), cliente_id: ID(2), cliente_nome: 'Bia', telefone: '1288', servico: 'óleo', data: '2026-10-20', hora: '10:00', status: 'aguardando' },
  ];
  const p = projetarMes({ hoje: HOJE, cfg: CFG, agendamentos: ag, clientes, taxaAvaliacao: 1, agora: AGORA });
  assert.equal(p.porRegua.lembrete.total, 1, 'Bia pediu para não receber');
  assert.equal(p.porRegua.posvenda.total, 2, 'concluído + o confirmado (estimado)');
  assert.equal(p.porRegua.posvenda.estimados, 1);
  assert.equal(p.porRegua.avaliacao.total, 2, 'taxa 1 = todo pós-venda vira avaliação');
  assert.ok(p.avisos.some((a) => /link do Google/.test(a)));
  assert.equal(p.porRegua.lembrete.ligada, true); assert.equal(p.porRegua.posvenda.ligada, false);
  assert.equal(p.comAsLigadasHoje, 1);
  assert.equal(p.dias.length, 30); assert.equal(p.dias[0].data, HOJE);
  const lemb = p.itens.find((i) => i.tipo === 'lembrete');
  assert.equal(lemb.data, '2026-10-15', '20 h antes de 16/10 9h = 15/10');
  assert.ok(!p.itens.some((i) => i.telefone), 'telefone não vai para a tela');
});

test('projeção: revisão um convite por cliente e não para quem voltou; reativação; aniversário; intervalo mínimo', () => {
  const clientes = [{ id: ID(1), nome: 'Ana', telefone: '1299', nascimento: '1980-10-20' }, { id: ID(2), nome: 'Caio', telefone: '1277' }, { id: ID(3), nome: 'Duda', telefone: '1266' }];
  const seisMeses = somarDias(HOJE, -180 + 5); // vence daqui a 5 dias
  const ag = [
    { id: ID(20), cliente_id: ID(2), cliente_nome: 'Caio', telefone: '1277', servico: 'Troca de óleo', data: seisMeses, status: 'concluido' },
    { id: ID(21), cliente_id: ID(2), cliente_nome: 'Caio', telefone: '1277', servico: 'Alinhamento', data: somarDias(seisMeses, -1), status: 'concluido' },
    { id: ID(22), cliente_id: ID(3), cliente_nome: 'Duda', telefone: '1266', servico: 'Troca de óleo', data: seisMeses, status: 'concluido' },
    { id: ID(23), cliente_id: ID(3), cliente_nome: 'Duda', telefone: '1266', servico: 'Lavagem', data: somarDias(HOJE, -10), status: 'compareceu' },
    { id: ID(24), cliente_id: ID(1), cliente_nome: 'Ana', telefone: '1299', servico: 'Embreagem', data: somarDias(HOJE, -360 + 3), status: 'concluido' },
  ];
  const p = projetarMes({ hoje: HOJE, cfg: CFG, agendamentos: ag, clientes, agora: AGORA });
  assert.equal(p.porRegua.retorno.total, 1, 'Caio: um convite só; Duda voltou depois');
  assert.equal(p.porRegua.reativacao.total, 1, 'reativação da Ana sai em 17/10');
  assert.equal(p.porRegua.aniversario.total, 0, 'o parabéns de 20/10 cai no intervalo mínimo (igual ao porteiro do carteiro)');
  assert.equal(p.seguradosPeloIntervalo, 1);
  const semIntervalo = projetarMes({ hoje: HOJE, cfg: { ...CFG, intervalo_minimo_dias: 0 }, agendamentos: ag, clientes, agora: AGORA });
  assert.equal(semIntervalo.porRegua.reativacao.total, 1);
  assert.equal(semIntervalo.porRegua.aniversario.total, 1);
});

test('projeção: domingo e feriado empurram o dia (pós-venda segura no feriado; aniversário não)', () => {
  assert.equal(diaDeSaida('2026-10-18', 'posvenda', false), '2026-10-19', 'domingo → segunda');
  assert.equal(diaDeSaida('2026-10-18', 'posvenda', true), '2026-10-18');
  assert.equal(diaDeSaida('2026-11-02', 'posvenda', false), '2026-11-03', 'Finados segura o pós-venda');
  assert.equal(diaDeSaida('2026-11-02', 'aniversario', false), '2026-11-02', 'parabéns sai no feriado');
  assert.equal(diaDeSaida('2026-11-15', 'retorno', false), '2026-11-16', 'feriado no domingo');
});

test('projeção: avisa quando um dia passaria do limite que a janela comporta', () => {
  const clientes = Array.from({ length: 30 }, (_, i) => ({ id: ID(100 + i), nome: `C${i}`, telefone: `12${i}000`, nascimento: '1990-10-15' }));
  const p = projetarMes({ hoje: HOJE, cfg: { ...CFG, limite_por_hora: 2, janela_inicio: 8, janela_fim: 18 }, clientes, agora: AGORA });
  assert.equal(p.pico.total, 30); assert.equal(p.pico.data, '2026-10-15');
  assert.ok(p.avisos.some((a) => /limite por hora/.test(a)));
});

// ============================================================================
// pronto para ligar
// ============================================================================
test('pronto para ligar: hoje (chave recusada, réguas desligadas, sem datas) não está pronto e diz o que fazer', () => {
  const r = montarProntidao({
    cfg: { carteiro_configurado: true }, whatsapp: { ok: false, chaveRecusada: true },
    carteiro: { ultimaEm: new Date().toISOString(), falhas24h: 4 }, aniversarios: { comData: 0, total: 2464 }, ia: { ativo: true, temChave: true }, teste: {},
  });
  assert.equal(r.pronto, false);
  const por = Object.fromEntries(r.itens.map((i) => [i.id, i]));
  assert.equal(por.whatsapp_chave.estado, 'falta'); assert.match(por.whatsapp_chave.texto, /Integrações/); assert.equal(por.whatsapp_chave.acao.tipo, 'link');
  assert.equal(por.whatsapp_aparelho.estado, 'aviso', 'aparelho só dá para conferir depois da chave');
  assert.equal(por.reguas.estado, 'falta'); assert.match(por.reguas.texto, /Lembrete/);
  assert.equal(por.telefone_teste.estado, 'falta');
  assert.equal(por.aniversarios.estado, 'aviso'); assert.match(por.aniversarios.texto, /2464/);
  assert.equal(por.carteiro.estado, 'aviso', '4 falhas em 24 h viram atenção');
  assert.equal(por.ia.estado, 'ok');
  assert.equal(r.proximo.id, 'whatsapp_chave');
});

test('pronto para ligar: tudo configurado = pronto; régua ligada sem texto e pausa geral impedem', () => {
  const cfg = { carteiro_configurado: true, ativo_lembrete: true, ativo_posvenda: true, msg_lembrete: 'x', msg_posvenda: 'y', link_avaliacao: 'https://g.page/x', telefone_teste: '12988887777' };
  const base = { cfg, whatsapp: { ok: true, conectado: true }, carteiro: { ultimaEm: new Date().toISOString() }, aniversarios: { comData: 900, total: 2000 }, ia: { ativo: true, temChave: true }, teste: { ultimoOkEm: new Date().toISOString() } };
  const ok = montarProntidao(base);
  assert.equal(ok.pronto, true); assert.equal(ok.faltam, 0); assert.equal(ok.prontos, ok.total);
  assert.equal(montarProntidao({ ...base, cfg: { ...cfg, msg_posvenda: ' ' } }).pronto, false);
  assert.equal(montarProntidao({ ...base, cfg: { ...cfg, pausa_geral: true } }).pronto, false);
  const avaliacaoSemLink = montarProntidao({ ...base, cfg: { ...cfg, ativo_avaliacao: true, msg_avaliacao: 'z', link_avaliacao: '' } });
  assert.equal(avaliacaoSemLink.itens.find((i) => i.id === 'link_avaliacao').estado, 'falta');
});

// ============================================================================
// carteiro tolerante
// ============================================================================
test('carteiro: validade de cada régua e envio vencido', () => {
  assert.equal(cart.validadeDoEnvio('lembrete', { agendamento: { data: '2026-10-15', hora: '09:00' } }), '2026-10-15T11:00:00.000Z', '1 h antes do horário');
  assert.equal(cart.validadeDoEnvio('aniversario', { base: '2026-10-14' }), instanteSP('2026-10-15', '23:59').toISOString(), 'parabéns vale até o fim do dia seguinte');
  assert.equal(cart.validadeDoEnvio('campanha', { base: '2026-10-14' }), null);
  assert.equal(cart.validadeDoEnvio('posvenda', {}), null, 'sem base, sem validade');
  assert.equal(cart.envioVencido({ expira_em: '2026-10-14T10:00:00Z' }, Date.parse('2026-10-14T10:00:01Z')), true);
  assert.equal(cart.envioVencido({ expira_em: null }), false);
});

test('carteiro: reserva presa e decisão do reforço (espelho da função do banco)', () => {
  const agora = Date.parse('2026-10-14T19:00:00Z');
  assert.equal(cart.reservaPresa({ status: 'pendente', enviando_em: '2026-10-14T18:40:00Z' }, agora), true);
  assert.equal(cart.reservaPresa({ status: 'pendente', enviando_em: '2026-10-14T18:50:00Z' }, agora), false);
  assert.equal(cart.reservaPresa({ status: 'enviado', enviando_em: '2026-10-14T18:00:00Z' }, agora), false);
  assert.equal(cart.deveReforcar({ ultimaRodadaEm: '2026-10-14T18:50:00Z', agora, horaSP: 16 }), false, '10 min: a chamada normal deu conta');
  assert.equal(cart.deveReforcar({ ultimaRodadaEm: '2026-10-14T18:35:00Z', agora, horaSP: 16 }), true, '25 min sem rodar');
  assert.equal(cart.deveReforcar({ ultimaRodadaEm: '2026-10-14T18:35:00Z', ultimoReforcoEm: '2026-10-14T18:57:00Z', agora, horaSP: 16 }), false, 'reforço há 3 min');
  assert.equal(cart.deveReforcar({ ultimaRodadaEm: null, agora, horaSP: 22 }), false, 'fora do horário');
});

test('carteiro: lembrete confere o horário de agora (cancelado, remarcado, em cima da hora)', () => {
  const cfg = { horas_lembrete: 20, msg_lembrete: 'Oi {primeiro_nome}, seu horário é {quando}.' };
  const agora = Date.parse('2026-10-14T13:00:00Z'); // 10h SP
  const envio = { corpo: 'Oi Ana, seu horário é amanhã às 09:00.', expira_em: cart.validadeDoEnvio('lembrete', { agendamento: { data: '2026-10-15', hora: '09:00' } }) };
  const ag = { cliente_nome: 'Ana Souza', status: 'confirmado', data: '2026-10-15', hora: '09:00' };
  assert.deepEqual(cart.conferirLembrete(envio, ag, cfg, agora), { acao: 'enviar' });
  assert.equal(cart.conferirLembrete(envio, { ...ag, status: 'cancelado' }, cfg, agora).acao, 'pular');
  assert.match(cart.conferirLembrete(envio, null, cfg, agora).motivo, /apagado/);
  assert.equal(cart.conferirLembrete(envio, { ...ag, data: '2026-10-14', hora: '10:30' }, cfg, agora).acao, 'pular', 'menos de 1 h');
  const rem = cart.conferirLembrete(envio, { ...ag, data: '2026-10-20', hora: '14:00' }, cfg, agora, '2026-10-14');
  assert.equal(rem.acao, 'atualizar'); assert.match(rem.corpo, /20\/10|terça/);
  assert.equal(rem.enviar_em, new Date(instanteSP('2026-10-20', '14:00').getTime() - 20 * 3600000).toISOString(), 'remarcado para longe: espera a hora certa');
});

test('carteiro: resumo das 24 h conta 503, tempo esgotado, reforços e buracos', () => {
  const agora = Date.parse('2026-10-14T22:30:00Z'); // 19h30 SP
  const em = (minAtras) => new Date(agora - minAtras * 60000).toISOString();
  const batidas = [em(5), em(20), em(35), em(95), em(110)].map((x, i) => ({ em: x, origem: i === 1 ? 'reforco' : 'cron', ok: true, enviados: i === 0 ? 2 : 0 }));
  const chamadas = [
    { em: em(5), origem: 'cron', status_code: 200 }, { em: em(20), origem: 'reforco', status_code: 200 },
    { em: em(50), origem: 'cron', status_code: 503 }, { em: em(65), origem: 'cron', status_code: null, timed_out: true }, { em: em(80), origem: 'cron', erro: 'falhou' },
  ];
  const r = cart.resumirCarteiro({ batidas, chamadas, agora });
  assert.equal(r.rodadas24h, 5); assert.equal(r.enviadas24h, 2);
  assert.equal(r.falhas24h, 3); assert.equal(r.dormindo, 1); assert.equal(r.demorou, 1); assert.equal(r.reforcosOk, 1);
  assert.equal(r.buracos.length, 1); assert.equal(r.buracos[0].minutos, 60);
  assert.equal(r.ultimaEm, em(5));
  assert.equal(r.chamadas[0].em, em(5), 'a lista começa pela mais recente'); assert.equal(r.batidas[0].em, em(5));
  assert.equal(cart.situacaoDaChamada({ status_code: 202 }), 'ok');
});

test('carteiro: esperarAte devolve o valor de "demorou" sem cancelar a promessa; comTentativas repete', async () => {
  let terminou = false;
  const lenta = new Promise((r) => setTimeout(() => { terminou = true; r('feito'); }, 60));
  assert.equal(await cart.esperarAte(lenta, 10, 'demorou'), 'demorou');
  assert.equal(await lenta, 'feito'); assert.equal(terminou, true);
  assert.equal(await cart.esperarAte(Promise.resolve(1), 50, 'x'), 1);
  let n = 0;
  assert.equal(await cart.comTentativas(async () => { if (++n < 3) throw new Error('engasgo'); return 'ok'; }, { esperaMs: 1 }), 'ok');
  await assert.rejects(cart.comTentativas(async () => { throw new Error('sempre'); }, { vezes: 2, esperaMs: 1 }), /sempre/);
});

// ============================================================================
// acordar.js (a tela) — roda num "navegador" de mentira
// ============================================================================
function carregarAcordar(fetchFalso, online = true) {
  const raiz = { fetch: fetchFalso, navigator: { onLine: online }, setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)), clearTimeout, setInterval: () => 0, clearInterval: () => {} };
  raiz.window = raiz;
  vm.runInNewContext(readFileSync(join(AQUI, '..', 'public', 'acordar.js'), 'utf8'), raiz);
  return raiz.Acordar;
}
const resp = (status, tipo = 'application/json') => ({ status, ok: status >= 200 && status < 300, headers: { get: (k) => (k.toLowerCase() === 'content-type' ? tipo : null) } });

test('acordando: só o 503/502/504 do Render (sem JSON) é "servidor dormindo"; só repete o que é seguro', () => {
  const Ac = carregarAcordar(async () => resp(200));
  assert.equal(Ac.ehAcordando(503, 'text/html'), true);
  assert.equal(Ac.ehAcordando(503, 'application/json; charset=utf-8'), false, 'o 503 do próprio app (IA desligada) é resposta de verdade');
  assert.equal(Ac.ehAcordando(500, 'text/html'), false);
  assert.equal(Ac.podeRepetir('GET', 'rede', true), true);
  assert.equal(Ac.podeRepetir('POST', 'servidor'), true, 'o pedido nem chegou ao app');
  assert.equal(Ac.podeRepetir('POST', 'rede', true), false, 'pode ter chegado: não manda duas vezes');
  assert.equal(Ac.podeRepetir('POST', 'rede', false), true, 'aparelho offline: nem saiu');
  assert.deepEqual([0, 1, 2, 3, 4, 5, 20].map(Ac.esperaDa), [2, 4, 8, 12, 20, 30, 30]);
  assert.ok(Ac.ESPERAS.reduce((s, x) => s + x, 0) >= 180, 'espera crescente até ~3 min');
});

test('acordando: a chamada espera o servidor voltar (uma sonda só) e segue sozinha', async () => {
  const vistos = [];
  let dormindo = 3;
  const Ac = carregarAcordar(async (url) => {
    vistos.push(url);
    if (dormindo > 0) { dormindo--; return resp(503, 'text/html'); }
    return resp(200);
  });
  const eventos = [];
  Ac.ouvir((t) => eventos.push(t));
  const [a, b] = await Promise.all([Ac.buscar('/api/resumo'), Ac.buscar('/api/saude', { method: 'GET' })]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.ok(vistos.includes('/api/ping'), 'quem sonda é o /api/ping');
  assert.ok(eventos.includes('dormindo') && eventos.includes('voltou'));
  assert.equal(Ac.acordando, false);
});

test('acordando: POST com o 503 do próprio app (JSON) volta na hora; rede caída num POST não repete', async () => {
  let n = 0;
  const Ac = carregarAcordar(async () => { n++; return resp(503, 'application/json'); });
  const r = await Ac.buscar('/api/ia/escrever', { method: 'POST' });
  assert.equal(r.status, 503); assert.equal(n, 1);
  const Ac2 = carregarAcordar(async () => { throw new TypeError('Failed to fetch'); }, true);
  await assert.rejects(Ac2.buscar('/api/envios', { method: 'POST' }), /Failed to fetch/);
});

// ============================================================================
// API de verdade (rotas.js) com dados falsos
// ============================================================================
const PERFIS = {
  admin: { id: ID(1), nome: 'João Admin', papel: 'admin', ativo: true, apps: [] },
  gestor: { id: ID(2), nome: 'Gisele Gestora', papel: 'gestor', ativo: true, apps: ['comunicar'] },
  atendente: { id: ID(3), nome: 'Leonardo', papel: 'atendente', ativo: true, apps: ['comunicar'] },
  agenda: { id: ID(5), nome: 'Franklin', papel: 'agenda', ativo: true, apps: ['agenda'] },
};
function dadosFalsos() {
  const d = {
    auditoria: [], notificacoes: [], gravados: [],
    clientes: [{ id: ID(101), nome: 'Maria Souza', telefone: '12999990001', nascimento: null }, { id: ID(102), nome: 'Carlos Lima', telefone: '12999990002', nascimento: '1980-01-01' }],
    contagens: { resumo: 0, pend: 7 },
  };
  Object.assign(d, {
    SEGMENTOS, REGUAS, TIPOS_ENVIO, ROTULO_TIPO, renderTemplate,
    ehUuid: (v) => /^[0-9a-f-]{36}$/i.test(String(v || '')), soDigitos: (t) => String(t ?? '').replace(/\D/g, ''), hoje: () => '2026-10-14',
    auditar: async (perfil, acao, tabela, registro, detalhes) => { d.auditoria.push({ perfil, acao, detalhes }); return 1; },
    notificar: async (n) => { d.notificacoes.push(n); return ID(900 + d.notificacoes.length); },
    gestores: async () => [PERFIS.admin.id, PERFIS.gestor.id],
    marcarAcesso: async () => null,
    resumo: async () => { d.contagens.resumo++; return { pendentes: 3 }; },
    obterConfig: async () => ({ carteiro_configurado: true, janela_inicio: 8, janela_fim: 20, ultima_rodada_em: '2026-10-14T21:50:00Z', telefone_teste: '12988887777' }),
    salvarConfig: async (b) => ({ ...b }),
    batidasRecentes: async () => [{ em: new Date().toISOString(), origem: 'cron', ok: true, enviados: 1 }],
    chamadasRecentes: async () => [{ em: new Date().toISOString(), origem: 'cron', status_code: 503 }],
    contarPendentes: async () => d.contagens.pend,
    contarComNascimento: async () => 1, contarClientesComTelefone: async () => 2,
    iaConfig: async () => ({ ativo: true }), chaveIA: async () => 'x', ultimoTesteOk: async () => null,
    dadosDaProjecao: async () => ({ cfg: { ...CFG }, regras: [], agendamentos: [], clientes: d.clientes, leads: [], taxaAvaliacao: null }),
    clientesParaCasar: async () => d.clientes,
    gravarNascimentos: async (itens, { substituir }) => { d.gravados.push({ itens, substituir }); return { gravados: itens.length, erros: [] }; },
    textosComAniversario: async () => ({ fichas: [], leads: [{ cliente_id: ID(101), observacoes: 'aniversário 05/05' }], mensagens: [] }),
    buscarClientesPorIds: async (ids) => d.clientes.filter((c) => ids.includes(c.id)),
    indicadoresEquipe: async () => montarIndicadores([
      { criado_por_id: PERFIS.atendente.id, criado_por: 'Leonardo', status: 'enviado', respondido_em: 'x' },
      { criado_por_id: PERFIS.gestor.id, criado_por: 'Gisele', status: 'enviado' },
      { criado_por_id: PERFIS.gestor.id, criado_por: 'Gisele', nome: 'Teste (Gisele)', status: 'enviado' },
    ]),
  });
  return d;
}
async function subir(extra = {}) {
  const d = dadosFalsos();
  const rodadas = [];
  const api = criarApi({
    dados: d, versao: 'teste', runnerToken: 'tok', log: { error() {} },
    autenticar: async (req) => {
      const p = PERFIS[req.headers['x-teste-perfil']];
      if (!p) return { status: 401, codigo: 'sem_login', erro: 'Faça login.' };
      const v = A.verificarAcesso(p); if (!v.ok) return v;
      return { usuario: { ...p } };
    },
    whatsapp: { status: async () => ({ ok: false, chaveRecusada: true }) },
    carteiro: { rodar: async (origem) => { rodadas.push(origem); await new Promise((r) => setTimeout(r, extra.demora ?? 0)); return { ok: true, enviados: 1, origem }; } },
    esperaRodarMs: extra.esperaRodarMs ?? 25_000,
  });
  const srv = http.createServer((req, res) => api.api(req, res, new URL(req.url, 'http://x')).catch((e) => api.erroInterno(res, e)));
  await new Promise((ok) => srv.listen(0, ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const chamar = async (perfil, metodo, caminho, corpo, cab = {}) => {
    const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...(perfil ? { 'x-teste-perfil': perfil } : {}), ...cab }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const texto = await r.text(); let json = null; try { json = JSON.parse(texto); } catch { /* não é json */ }
    return { status: r.status, json, headers: r.headers };
  };
  return { d, rodadas, chamar, base, fechar: () => new Promise((ok) => srv.close(ok)) };
}

test('API: /api/rodar diz a origem e responde 202 quando a rodada demora (o pg_cron não estoura mais)', async () => {
  const rapido = await subir();
  try {
    const r = await rapido.chamar(null, 'POST', '/api/rodar?origem=reforco', {}, { 'x-runner-token': 'tok' });
    assert.equal(r.status, 200); assert.equal(r.json.origem, 'reforco');
    await rapido.chamar(null, 'POST', '/api/rodar', {}, { 'x-runner-token': 'tok', 'x-origem': 'github' });
    await rapido.chamar(null, 'POST', '/api/rodar?origem=qualquer', {}, { 'x-runner-token': 'tok' });
    await rapido.chamar('admin', 'POST', '/api/rodar-agora', {});
    assert.deepEqual(rapido.rodadas, ['reforco', 'github', 'cron', 'manual']);
  } finally { await rapido.fechar(); }
  const lento = await subir({ demora: 80, esperaRodarMs: 10 });
  try {
    const r = await lento.chamar(null, 'POST', '/api/rodar?origem=cron', {}, { 'x-runner-token': 'tok' });
    assert.equal(r.status, 202); assert.equal(r.json.emAndamento, true);
  } finally { await lento.fechar(); }
});

test('API: pronto, carteiro, contagem da fila e prévia do mês (com papéis)', async () => {
  const s = await subir();
  try {
    const p = await s.chamar('atendente', 'GET', '/api/pronto');
    assert.equal(p.status, 200); assert.equal(p.json.pronto, false); assert.equal(p.json.gestor, false);
    assert.equal(p.json.itens.find((i) => i.id === 'whatsapp_chave').estado, 'falta');
    const c = await s.chamar('atendente', 'GET', '/api/carteiro');
    assert.equal(c.json.falhas24h, 1); assert.equal(c.json.configurado, true);
    assert.equal((await s.chamar('gestor', 'GET', '/api/fila/contagem')).json.pendentes, 7);
    const m = await s.chamar('gestor', 'GET', '/api/projecao');
    assert.equal(m.status, 200); assert.equal(m.json.dias.length, 30);
    assert.equal((await s.chamar('agenda', 'GET', '/api/projecao')).status, 403);
    assert.equal((await s.chamar(null, 'GET', '/api/pronto')).status, 401);
  } finally { await s.fechar(); }
});

test('API: aniversários — analisar, gravar (lista só gestor; "substituir" só gestor) e sugestões', async () => {
  const s = await subir();
  try {
    const a = await s.chamar('atendente', 'POST', '/api/aniversarios/analisar', { texto: 'Maria Souza 12 99999-0001 14/05/1988\nCarlos Lima 02/02/1981' });
    assert.equal(a.status, 200); assert.equal(a.json.resumo.novos, 1); assert.equal(a.json.resumo.trocas, 1);
    assert.equal((await s.chamar('atendente', 'POST', '/api/aniversarios/analisar', { texto: '  ' })).status, 400);
    const lista = [{ cliente_id: ID(101), nascimento: '1988-05-14' }, { cliente_id: ID(102), nascimento: '02/02/1981' }];
    const neg = await s.chamar('atendente', 'POST', '/api/aniversarios/gravar', { itens: lista });
    assert.equal(neg.status, 403); assert.match(neg.json.erro, /gestor/);
    const um = await s.chamar('atendente', 'POST', '/api/aniversarios/gravar', { itens: lista.slice(0, 1), substituir: true });
    assert.equal(um.status, 200); assert.equal(s.d.gravados[0].substituir, false, 'atendente não substitui');
    const g = await s.chamar('gestor', 'POST', '/api/aniversarios/gravar', { itens: [...lista, { cliente_id: 'lixo', nascimento: '1/1/2000' }, { cliente_id: ID(103), nascimento: '31/02' }], substituir: true });
    assert.equal(g.json.gravados, 2); assert.equal(s.d.gravados[1].substituir, true);
    assert.equal(s.d.gravados[1].itens[1].nascimento, '1981-02-02', 'data normalizada no servidor');
    assert.ok(s.d.auditoria.some((x) => x.acao === 'aniversarios_gravados'));
    const sug = await s.chamar('atendente', 'GET', '/api/aniversarios/sugestoes');
    assert.equal(sug.json.sugestoes.length, 1); assert.equal(sug.json.sugestoes[0].fonte, 'crm');
  } finally { await s.fechar(); }
});

test('API: pedir ao gestor avisa os gestores (menos a própria pessoa) e indicadores respeitam o papel', async () => {
  const s = await subir();
  try {
    const r = await s.chamar('atendente', 'POST', '/api/pedir-gestor', { assunto: 'ligar', detalhe: 'Pode ligar o pós-venda?' });
    assert.equal(r.json.avisados, 2);
    assert.match(s.d.notificacoes[0].titulo, /Leonardo pede: ligar/);
    assert.ok(s.d.notificacoes[0].chave.startsWith(`pedido:${PERFIS.atendente.id}:ligar:`), 'um pedido por assunto por dia');
    const g = await s.chamar('gestor', 'POST', '/api/pedir-gestor', { assunto: 'nao-existe' });
    assert.equal(g.json.avisados, 1, 'gestor não avisa a si mesmo'); assert.match(s.d.notificacoes[2].titulo, /ajuda/);
    const at = await s.chamar('atendente', 'GET', '/api/equipe/indicadores');
    assert.deepEqual(at.json.pessoas.map((p) => p.nome), ['Leonardo']); assert.equal(at.json.pessoas[0].taxaResposta, 100);
    const ge = await s.chamar('gestor', 'GET', '/api/equipe/indicadores');
    assert.equal(ge.json.pessoas.length, 2); assert.equal(ge.json.pessoas.find((p) => p.nome === 'Gisele').enviadas, 1, 'teste de WhatsApp não conta');
  } finally { await s.fechar(); }
});

test('API: resposta grande vai comprimida (br/gzip) e o resumo tem cache curto', async () => {
  const s = await subir();
  try {
    const r = await fetch(`${s.base}/api/projecao`, { headers: { 'x-teste-perfil': 'gestor', 'Accept-Encoding': 'br' } });
    assert.equal(r.headers.get('content-encoding'), 'br');
    await s.chamar('gestor', 'GET', '/api/resumo'); await s.chamar('gestor', 'GET', '/api/resumo');
    assert.equal(s.d.contagens.resumo, 1, 'segunda chamada veio do cache');
  } finally { await s.fechar(); }
  assert.equal(aceitaCodificacao('gzip, deflate, br', 'br'), true);
  assert.equal(aceitaCodificacao('gzip;q=0, br;q=1', 'gzip'), false);
  assert.equal(aceitaCodificacao('brotli', 'br'), false);
  assert.equal(aceitaCodificacao('', 'gzip'), false);
});

test('rotas novas: todas na tabela do porteiro com a permissão certa', () => {
  const perm = (m, c) => A.regraDaRota(m, c)?.perm;
  assert.equal(perm('GET', '/api/pronto'), 'ver');
  assert.equal(perm('POST', '/api/aniversarios/gravar'), 'cliente_editar');
  assert.equal(A.regraDaRota('POST', '/api/aniversarios/gravar').caro, true);
  assert.equal(perm('POST', '/api/pedir-gestor'), 'ver');
  assert.equal(A.regraDaRota('POST', '/api/pronto').metodoErrado, true);
});

// ============================================================================
// arquivos da tela: memória, compressão e ETag
// ============================================================================
test('estáticos: comprime, responde 304 com ETag, HEAD sem corpo, nada fora da pasta', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'comunicar-est-'));
  writeFileSync(join(pasta, 'index.html'), '<!doctype html><title>x</title>' + 'a'.repeat(3000));
  writeFileSync(join(pasta, 'app.js'), 'console.log(1);' + ' '.repeat(2000));
  const servir = criarEstaticos({ pasta, mime: { '.html': 'text/html', '.js': 'text/javascript' }, seguros: { 'X-Content-Type-Options': 'nosniff' } });
  const srv = http.createServer((req, res) => servir(req, res, new URL(req.url, 'http://x').pathname));
  await new Promise((ok) => srv.listen(0, ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const crua = (caminho, cab = {}, metodo = 'GET') => new Promise((ok) => http.request(base + caminho, { method: metodo, headers: cab }, (r) => {
      const partes = []; r.on('data', (c) => partes.push(c)); r.on('end', () => ok({ status: r.statusCode, headers: r.headers, corpo: Buffer.concat(partes) }));
    }).end());
    const gz = await crua('/app.js', { 'accept-encoding': 'gzip' });
    assert.equal(gz.headers['content-encoding'], 'gzip'); assert.match(gunzipSync(gz.corpo).toString(), /console\.log/);
    const br = await crua('/', { 'accept-encoding': 'gzip, br' });
    assert.equal(br.headers['content-encoding'], 'br'); assert.match(brotliDecompressSync(br.corpo).toString(), /<title>x/);
    assert.equal(br.headers['cache-control'], 'no-cache, must-revalidate');
    assert.equal(br.headers['x-content-type-options'], 'nosniff');
    const de304 = await crua('/', { 'if-none-match': br.headers.etag });
    assert.equal(de304.status, 304); assert.equal(de304.corpo.length, 0);
    const head = await crua('/app.js', {}, 'HEAD');
    assert.equal(head.status, 200); assert.equal(head.corpo.length, 0);
    assert.equal((await crua('/..%2f..%2fetc%2fpasswd')).status, 404);
    assert.equal((await crua('/nao-existe.js')).status, 404);
    const spa = await crua('/qualquer-tela');
    assert.equal(spa.status, 200); assert.match(spa.corpo.toString(), /<title>x/);
    assert.equal((await crua('/app.js', {}, 'POST')).status, 405);
  } finally { srv.close(); rmSync(pasta, { recursive: true, force: true }); }
});

test('indicadores por pessoa: agrupa, ignora teste e calcula a taxa de resposta', () => {
  const r = montarIndicadores([
    { criado_por_id: 'a', criado_por: 'Ana', status: 'enviado', respondido_em: 'x', agendou_depois_id: 'y' },
    { criado_por_id: 'a', criado_por: 'Ana', status: 'enviado' },
    { criado_por_id: 'a', criado_por: 'Ana', status: 'pendente' },
    { criado_por_id: 'b', criado_por: 'Bia', status: 'falhou' },
    { criado_por_id: 'b', nome: 'Teste (Bia)', status: 'enviado' },
  ], [{ criado_por: 'b', criado_por_nome: 'Bia', status: 'aprovada', decidido_por: 'a', decidido_por_nome: 'Ana' }]);
  const ana = r.find((p) => p.perfil_id === 'a'), bia = r.find((p) => p.perfil_id === 'b');
  assert.deepEqual([ana.enviadas, ana.naFila, ana.responderam, ana.agendaram, ana.taxaResposta, ana.decidiu], [2, 1, 1, 1, 50, 1]);
  assert.deepEqual([bia.enviadas, bia.falharam, bia.propostas, bia.aprovadas, bia.taxaResposta], [0, 1, 1, 1, null]);
});

test('preferências: merge profundo não apaga o que a Agenda, o CRM e o Atendimento guardaram', () => {
  const atual = { tema: 'claro', agenda: { visao: 'semana', filtros: { consultor: 'x' } }, notificacoes: { reclamacao: true, tarefa_agenda: false, atendimento: { som: true } } };
  const novo = A.camposDoMeuPerfil({ preferencias: { notificacoes: { reclamacao: false, aprovacao: true } } }).campos.preferencias;
  const r = A.mesclarPreferencias(atual, novo);
  assert.deepEqual(r, { tema: 'claro', agenda: { visao: 'semana', filtros: { consultor: 'x' } }, notificacoes: { reclamacao: false, tarefa_agenda: false, atendimento: { som: true }, aprovacao: true } });
  assert.equal(atual.notificacoes.reclamacao, true, 'não altera o original');
  assert.deepEqual(A.mesclarPreferencias(null, { a: { b: 1 } }), { a: { b: 1 } });
  assert.deepEqual(A.mesclarPreferencias({ a: 1 }, null), { a: 1 });
  assert.equal(Object.prototype.polluted, undefined);
  A.mesclarPreferencias({}, JSON.parse('{"__proto__":{"polluted":1}}'));
  assert.equal({}.polluted, undefined, 'sem poluir o protótipo');
});
