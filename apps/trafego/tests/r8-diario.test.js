'use strict';
/* Rodada 8 (T5b): o diário de decisões (trafego_acoes). Aceitar (com o "antes"), recusar, marcar como feita, registrar
   decisão própria, medir na data com os QUATRO vereditos (melhorou, piorou, sem diferença clara, não deu para medir),
   expirar proposta parada, duas pessoas decidindo ao mesmo tempo, banco sem a tabela. Números do motor por dublê; sem rede. */
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../ia/decisoes');
const { criarBanco } = require('./apoio/banco-falso');
const { comUuid, PESSOA, TD } = require('./apoio/gestor-apoio');

const ID = n => `${String(n).repeat(8)}-aaaa-4aaa-8aaa-${String(n).repeat(12)}`;
const ALVO = (ext, nome = ext) => ({ plataforma: 'meta', nivel: 'campanha', ext, nome });

/** O motor de campanhas por dublê: números por período (de|ate) e plataforma. */
function campanhasFalsas(porPeriodo = {}, { gasto = 'real' } = {}) {
  const pedidos = [];
  return {
    pedidos,
    async responderLista({ q }) {
      const de = q.get('de'), ate = q.get('ate'), plat = q.get('plataforma') || null;
      pedidos.push({ de, ate, plat });
      const p = porPeriodo[`${de}|${ate}`] || porPeriodo.padrao || { campanhas: [], totais: {} };
      if (p instanceof Error) throw p;
      return { estado: { gasto }, totais: p.totais || {}, campanhas: p.campanhas || [] };
    },
  };
}
const camp = (ext, n) => ({ plataforma: 'meta', ext, nome: ext, gasto: 0, contatos: 0, fecharam: 0, faturado: 0, custo_por_contato: null, retorno: null, ...n });
const proposta = (n, o = {}) => ({ id: ID(n), criada_em: '2026-11-18T12:00:00.000Z', origem: 'ia', autor: 'gestor', tipo: 'reduzir_verba', titulo: `Ação ${n}`, porque: 'Custo alto.',
  alvo: ALVO(`c${n}`), evidencias: { itens: [{ fonte: 'campanhas', dado: 'custo por contato', valor: 50 }], verba: null, risco: 'normal', risco_motivo: null },
  status: 'proposta', decidida_por: null, decidida_em: null, feita_em: null, nota: null, medir_em: '2026-11-26', antes: null, depois: null, veredito: null, ...o });

function montar({ acoes = [], porPeriodo = {}, semTabela = false, gasto = 'real', agora = TD.relogio() } = {}) {
  const sb = comUuid(criarBanco(semTabela ? {} : { trafego_acoes: acoes, trafego_ia_chaves: [] }));
  const campanhas = campanhasFalsas(porPeriodo, { gasto });
  const fonte = { contatos: async () => ({ itens: [] }) };
  const diario = D.criarDiario({ sb, fonte, campanhas, agora, nomesDosPerfis: async ids => new Map(ids.map(id => [id, { nome: id === PESSOA.id ? 'Paulo' : 'Outra' }])) });
  return { sb, diario, campanhas, agora };
}

test('julgar (pura): os quatro vereditos e as regras de cautela', () => {
  const antes = { periodo: '03/11 a 09/11', contatos: 10, custo_por_contato: 50, retorno: null, contatos_por_dia: 1.43 };
  const depois = o => ({ periodo: '11/11 a 17/11', dias: 7, contatos: 12, custo_por_contato: 30, retorno: null, contatos_por_dia: 1.71, ...o });
  const feita = { status: 'feita', feita_em: '2026-11-10T12:00:00Z', antes };

  const m = D.julgar({ ...feita, depois: depois() });
  assert.equal(m.veredito, 'melhorou'); assert.equal(m.metrica, 'custo_por_contato'); assert.equal(m.variacao, -0.4);
  assert.equal(m.texto, 'Melhorou: o custo por contato foi de R$ 50,00 para R$ 30,00, comparando 03/11 a 09/11 com 11/11 a 17/11.');
  const p = D.julgar({ ...feita, antes: { ...antes, retorno: 5 }, depois: depois({ retorno: 2 }) });
  assert.equal(p.veredito, 'piorou'); assert.equal(p.metrica, 'retorno', 'retorno vem antes do custo por contato');
  const s = D.julgar({ ...feita, depois: depois({ custo_por_contato: 46 }) });
  assert.equal(s.veredito, 'sem_diferenca'); assert.match(s.texto, /mudança menor que 15%/);
  const poucos = D.julgar({ ...feita, depois: depois({ contatos: 3 }) });
  assert.equal(poucos.veredito, 'sem_diferenca'); assert.match(poucos.texto, /poucos contatos para afirmar \(10 antes e 3 depois\)/);
  for (const [caso, frase] of [
    [{ status: 'aceita', feita_em: null, antes, depois: depois() }, /não foi marcada como feita/],
    [{ ...feita, antes: null, depois: depois() }, /faltaram os números de antes/],
    [{ ...feita, depois: { ...depois(), erro: 'x' } }, /não deu para ler os números de depois/],
    [{ ...feita, depois: depois({ dias: 2 }) }, /passou pouco tempo depois da mudança \(2 dias; o mínimo é 3\)/],
    [{ ...feita, antes: { periodo: 'x', contatos: null }, depois: depois({ contatos: null, custo_por_contato: null, contatos_por_dia: null }) }, /não há gasto ligado nem contatos/],
  ]) {
    const j = D.julgar(caso);
    assert.equal(j.veredito, 'nao_mediu'); assert.match(j.texto, frase);
  }
  // Sem gasto ligado, compara contatos por dia (maior é melhor).
  const semGasto = D.julgar({ ...feita, antes: { periodo: 'a', contatos: 7, contatos_por_dia: 1 }, depois: depois({ contatos: 14, custo_por_contato: null, contatos_por_dia: 2 }) });
  assert.equal(semGasto.veredito, 'melhorou'); assert.equal(semGasto.metrica, 'contatos_por_dia');
});

test('baseDoAlvo: campanha, plataforma (conta, anúncio, pausar) e oficina', () => {
  assert.equal(D.baseDoAlvo(ALVO('c1'), 'reduzir_verba'), 'campanha');
  assert.equal(D.baseDoAlvo(ALVO('c1'), 'pausar'), 'plataforma', 'pausar uma campanha se mede na plataforma inteira');
  assert.equal(D.baseDoAlvo({ plataforma: 'google', nivel: 'termo', nome: 'grátis' }, 'negativar_termo'), 'plataforma');
  assert.equal(D.baseDoAlvo({ plataforma: 'whatsapp', nivel: 'outro' }, 'mensagem_pronta'), 'oficina');
  assert.equal(D.baseDoAlvo(null, 'outro'), 'oficina');
});

test('aceitar: grava o "antes" (7 dias antes de hoje, na campanha do alvo), quem e quando; não decide de novo', async () => {
  const { diario, sb, campanhas } = montar({ acoes: [proposta(1)], porPeriodo: {
    '2026-11-12|2026-11-18': { campanhas: [camp('c1', { gasto: 700, contatos: 14, fecharam: 2, faturado: 1800, custo_por_contato: 50, retorno: 2.57 })], totais: {} },
  } });
  const a = await diario.decidir(ID(1), { decisao: 'aceitar', nota: 'Vamos testar.' }, PESSOA);
  assert.equal(a.status, 'aceita'); assert.equal(a.status_rotulo, 'Aceita, falta fazer');
  assert.equal(a.decidida_por, 'Paulo'); assert.equal(a.decidida_por_id, PESSOA.id); assert.equal(a.decidida_em, '2026-11-19T13:00:00.000Z');
  assert.equal(a.nota, 'Vamos testar.');
  assert.equal(a.antes.periodo, '12/11 a 18/11'); assert.equal(a.antes.dias, 7); assert.equal(a.antes.base, 'campanha');
  assert.equal(a.antes.base_rotulo, 'a campanha c1');
  assert.equal(a.antes.custo_por_contato, 50); assert.equal(a.antes.retorno, 2.57); assert.equal(a.antes.contatos_por_dia, 2);
  assert.deepEqual(campanhas.pedidos, [{ de: '2026-11-12', ate: '2026-11-18', plat: 'meta' }]);
  assert.equal(sb.tabelas.trafego_acoes[0].status, 'aceita');
  await assert.rejects(diario.decidir(ID(1), { decisao: 'recusar' }, PESSOA), e => e.status === 409 && e.codigo === 'ja_decidida');
});

test('recusar e as validações: decisão errada, nota longa, id que não existe', async () => {
  const { diario } = montar({ acoes: [proposta(2)] });
  await assert.rejects(diario.decidir(ID(2), { decisao: 'talvez' }, PESSOA), e => e.status === 422 && e.codigo === 'decisao');
  await assert.rejects(diario.decidir(ID(2), { decisao: 'recusar', nota: 'x'.repeat(301) }, PESSOA), e => e.status === 422 && e.codigo === 'nota');
  await assert.rejects(diario.decidir(ID(9), { decisao: 'recusar' }, PESSOA), e => e.status === 404 && e.codigo === 'nao_existe');
  await assert.rejects(diario.decidir('nao-e-uuid', { decisao: 'recusar' }, PESSOA), e => e.status === 404);
  const r = await diario.decidir(ID(2), { decisao: 'recusar', nota: 'Agora não.' }, PESSOA);
  assert.equal(r.status, 'recusada'); assert.equal(r.antes, null, 'recusar não mede nada'); assert.equal(r.nota, 'Agora não.');
});

test('proposta com mais de 14 dias: decidir dá 409 expirada e ela vira "expirada"', async () => {
  const { diario, sb } = montar({ acoes: [proposta(3, { criada_em: '2026-11-04T12:00:00.000Z' })] });
  await assert.rejects(diario.decidir(ID(3), { decisao: 'aceitar' }, PESSOA), e => e.status === 409 && e.codigo === 'expirada' && /14 dias/.test(e.message));
  assert.equal(sb.tabelas.trafego_acoes[0].status, 'expirada');
});

test('duas pessoas decidindo ao mesmo tempo: só uma ganha, a outra recebe 409', async () => {
  const { diario, sb } = montar({ acoes: [proposta(4)] });
  const r = await Promise.allSettled([diario.decidir(ID(4), { decisao: 'aceitar' }, PESSOA), diario.decidir(ID(4), { decisao: 'recusar' }, PESSOA)]);
  assert.deepEqual(r.map(x => x.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(r.find(x => x.status === 'rejected').reason.status, 409);
  assert.equal(sb.tabelas.trafego_acoes[0].status, r.find(x => x.status === 'fulfilled').value.status);
});

test('marcar como feita: só de "aceita"; medição cedo demais passa para daqui a 7 dias com aviso; limpa veredito velho', async () => {
  const { diario, sb } = montar({ acoes: [
    proposta(5),
    proposta(6, { status: 'aceita', decidida_por: PESSOA.id, decidida_em: '2026-11-18T12:00:00.000Z', medir_em: '2026-11-20', antes: { periodo: 'x', contatos: 1 }, veredito: 'nao_mediu', depois: { leitura: 'velha' } }),
    proposta(7, { status: 'aceita', decidida_por: PESSOA.id, decidida_em: '2026-11-18T12:00:00.000Z', medir_em: '2026-12-01', antes: { periodo: 'x', contatos: 1 } }),
  ] });
  await assert.rejects(diario.marcarFeita(ID(5), {}, PESSOA), e => e.status === 409 && e.codigo === 'nao_aceita');
  const cedo = await diario.marcarFeita(ID(6), { nota: 'Baixei a verba.' }, PESSOA);
  assert.equal(cedo.acao.status, 'feita'); assert.equal(cedo.acao.feita_em, '2026-11-19T13:00:00.000Z');
  assert.equal(cedo.acao.medir_em, '2026-11-26'); assert.match(cedo.aviso, /passou para 26\/11/);
  assert.equal(cedo.acao.veredito, null); assert.equal(cedo.acao.depois, null);
  assert.equal(sb.tabelas.trafego_acoes[1].nota, 'Baixei a verba.');
  const certo = await diario.marcarFeita(ID(7), {}, PESSOA);
  assert.equal(certo.acao.medir_em, '2026-12-01'); assert.equal(certo.aviso, null);
  await assert.rejects(diario.marcarFeita(ID(7), {}, PESSOA), e => e.codigo === 'nao_aceita');
});

test('medir na data (rotina): os quatro vereditos gravados com o "depois" e a leitura; o que já tem veredito ou é futuro fica', async () => {
  const feita = { status: 'feita', decidida_por: PESSOA.id, decidida_em: '2026-11-09T12:00:00.000Z', feita_em: '2026-11-10T15:00:00.000Z', medir_em: '2026-11-18' };
  const antes = n => ({ periodo: '03/11 a 09/11', dias: 7, base: 'campanha', contatos: 10, contatos_por_dia: 1.43, ...n });
  const { diario, sb, campanhas } = montar({ acoes: [
    proposta(1, { ...feita, alvo: ALVO('cA'), antes: antes({ custo_por_contato: 50, retorno: null }) }),
    proposta(2, { ...feita, alvo: ALVO('cB'), antes: antes({ custo_por_contato: 40, retorno: 5 }) }),
    proposta(3, { ...feita, alvo: ALVO('cC'), antes: antes({ custo_por_contato: 40, retorno: null }) }),
    proposta(4, { status: 'aceita', decidida_por: PESSOA.id, decidida_em: '2026-11-09T12:00:00.000Z', medir_em: '2026-11-18', alvo: ALVO('cD'), antes: antes({ custo_por_contato: 40 }) }),
    proposta(5, { ...feita, feita_em: '2026-11-16T15:00:00.000Z', medir_em: '2026-11-19', alvo: ALVO('cE'), antes: antes({ custo_por_contato: 40 }) }),
    proposta(6, { ...feita, alvo: ALVO('cA'), antes: antes({ custo_por_contato: 50 }), veredito: 'melhorou', depois: { leitura: 'já medida' } }),
    proposta(7, { ...feita, medir_em: '2026-11-25', alvo: ALVO('cA'), antes: antes({ custo_por_contato: 50 }) }),
    proposta(8, { criada_em: '2026-11-04T12:00:00.000Z' }),
    proposta(9, { criada_em: '2026-11-09T12:00:00.000Z' }),
  ], porPeriodo: {
    '2026-11-11|2026-11-17': { campanhas: [
      camp('cA', { gasto: 360, contatos: 12, custo_por_contato: 30 }),
      camp('cB', { gasto: 500, contatos: 10, fecharam: 2, faturado: 1000, custo_por_contato: 50, retorno: 2 }),
      camp('cC', { gasto: 420, contatos: 10, custo_por_contato: 42 }),
    ] },
  } });
  const r = await TD.calado(() => diario.rodarRotina());
  assert.equal(r.ok, true); assert.equal(r.erros, 0);
  assert.equal(r.expiradas, 1, 'só a proposta com mais de 14 dias');
  assert.equal(sb.tabelas.trafego_acoes.find(a => a.id === ID(8)).status, 'expirada');
  assert.equal(sb.tabelas.trafego_acoes.find(a => a.id === ID(9)).status, 'proposta');
  const vereditos = Object.fromEntries(r.medidas.map(x => [x.id, x.veredito]));
  assert.deepEqual(vereditos, { [ID(1)]: 'melhorou', [ID(2)]: 'piorou', [ID(3)]: 'sem_diferenca', [ID(4)]: 'nao_mediu', [ID(5)]: 'nao_mediu' });
  assert.ok(!campanhas.pedidos.some(p => p.de === '2026-11-18'), 'a de medir_em futuro não foi medida');

  const lista = (await diario.listar({ status: 'feita,aceita' })).acoes;
  const a = id => lista.find(x => x.id === id);
  assert.equal(a(ID(1)).veredito_rotulo, 'Melhorou');
  assert.equal(a(ID(1)).veredito_texto, 'Melhorou: o custo por contato foi de R$ 50,00 para R$ 30,00, comparando 03/11 a 09/11 com 11/11 a 17/11.');
  assert.equal(a(ID(1)).depois.periodo, '11/11 a 17/11'); assert.equal(a(ID(1)).depois.dias, 7); assert.equal(a(ID(1)).depois.custo_por_contato, 30);
  assert.ok(!('leitura' in a(ID(1)).depois), 'a leitura sai como veredito_texto');
  assert.match(a(ID(2)).veredito_texto, /^Piorou: cada R\$ 1 investido virou R\$ 5,00 antes e R\$ 2,00 depois/);
  assert.equal(a(ID(3)).veredito_rotulo, 'Sem diferença clara');
  assert.equal(a(ID(4)).veredito_rotulo, 'Não deu para medir'); assert.match(a(ID(4)).veredito_texto, /não foi marcada como feita/);
  assert.match(a(ID(5)).veredito_texto, /passou pouco tempo depois da mudança \(2 dias/);
  assert.equal(sb.tabelas.trafego_acoes.find(x => x.id === ID(6)).depois.leitura, 'já medida', 'já medida não muda');

  // Rodar de novo não mede o que já tem veredito.
  const de = await TD.calado(() => diario.rodarRotina());
  assert.deepEqual(de.medidas, []); assert.equal(de.expiradas, 0);
});

test('medir: sem gasto ligado não há custo nem retorno (null, não zero); falha do motor vira "não deu para medir"', async () => {
  const { diario } = montar({ gasto: 'sem_conta', porPeriodo: { padrao: { campanhas: [camp('c1', { gasto: 0, contatos: 7, custo_por_contato: 0, retorno: 0 })], totais: {} } } });
  const m = await diario.medir(ALVO('c1'), 'reduzir_verba', { de: '2026-11-12', ate: '2026-11-18' });
  assert.equal(m.gasto, null); assert.equal(m.custo_por_contato, null); assert.equal(m.retorno, null);
  assert.equal(m.contatos, 7); assert.equal(m.contatos_por_dia, 1); assert.equal(m.gasto_ligado, false);
  const sumiu = await diario.medir(ALVO('c9'), 'reduzir_verba', { de: '2026-11-12', ate: '2026-11-18' });
  assert.equal(sumiu.contatos, 0); assert.match(sumiu.observacao, /não apareceu/);

  const quebrado = montar({ porPeriodo: { padrao: new Error('banco fora') } });
  const q = await TD.calado(() => quebrado.diario.medir(ALVO('c1'), 'reduzir_verba', { de: '2026-11-12', ate: '2026-11-18' }));
  assert.equal(q.erro, 'Não deu para ler os números agora.');
  assert.equal(D.julgar({ status: 'feita', feita_em: 'x', antes: { contatos: 9 }, depois: { ...q, dias: 7 } }).veredito, 'nao_mediu');
});

test('registrar decisão própria: validação campo a campo; "já fiz" entra como feita, com antes medido e medir em 7 dias', async () => {
  const { diario } = montar({ porPeriodo: { padrao: { campanhas: [camp('c1', { gasto: 300, contatos: 7, custo_por_contato: 42.86 })], totais: {} } } });
  const erro = async (corpo, codigo) => assert.rejects(diario.registrarPropria(corpo, PESSOA), e => e.status === 422 && e.codigo === codigo);
  await erro({ tipo: 'apagar_tudo', titulo: 'Qualquer coisa' }, 'tipo');
  await erro({ tipo: 'pausar', titulo: 'oi' }, 'titulo');
  await erro({ tipo: 'pausar', titulo: 'Pausei o vídeo', porque: 42 }, 'porque');
  await erro({ tipo: 'pausar', titulo: 'Pausei o vídeo', alvo: { plataforma: 'tiktok', nivel: 'conta' } }, 'alvo');
  await erro({ tipo: 'pausar', titulo: 'Pausei o vídeo', medir_em: '2026-11-20', ja_fiz: true }, 'medir_em');
  await erro({ tipo: 'pausar', titulo: 'Pausei o vídeo', medir_em: '2027-05-01' }, 'medir_em');
  await erro({ tipo: 'pausar', titulo: 'Pausei o vídeo', nota: 5 }, 'nota');
  const a = await diario.registrarPropria({ tipo: 'reduzir_verba', titulo: 'Baixei a verba da campanha c1', alvo: ALVO('c1'), ja_fiz: true }, PESSOA);
  assert.equal(a.origem, 'pessoa'); assert.equal(a.autor, 'Paulo'); assert.equal(a.status, 'feita');
  assert.equal(a.medir_em, '2026-11-26'); assert.equal(a.antes.periodo, '12/11 a 18/11'); assert.equal(a.antes.custo_por_contato, 42.86);
  const b = await diario.registrarPropria({ tipo: 'mensagem_pronta', titulo: 'Vou trocar a mensagem pronta' }, PESSOA);
  assert.equal(b.status, 'aceita'); assert.equal(b.antes.base, 'oficina');
});

test('listar: contagem por status, filtro, limite e status errado', async () => {
  const { diario } = montar({ acoes: [proposta(1), proposta(2, { status: 'aceita' }), proposta(3, { status: 'recusada' }), proposta(4, { status: 'recusada' })] });
  const tudo = await diario.listar();
  assert.equal(tudo.ligado, true); assert.equal(tudo.total, 4);
  assert.deepEqual(tudo.contagem, { proposta: 1, aceita: 1, feita: 0, recusada: 2, expirada: 0 });
  assert.equal((await diario.listar({ status: 'recusada' })).acoes.length, 2);
  assert.equal((await diario.listar({ limite: '1' })).acoes.length, 1);
  await assert.rejects(diario.listar({ status: 'aceita,apagada' }), e => e.status === 422 && e.codigo === 'status');
  const p = tudo.acoes.find(x => x.id === ID(1));
  assert.equal(p.tipo_rotulo, 'Reduzir a verba'); assert.equal(p.alvo_rotulo, 'Meta › campanha c1'); assert.equal(p.evidencias[0].texto, 'custo por contato: 50');
});

test('banco sem a tabela: lista diz ligado:false com aviso; escritas dão 503 sem_migracao; a rotina devolve ok:false', async () => {
  const { diario } = montar({ semTabela: true });
  const l = await diario.listar();
  assert.equal(l.ligado, false); assert.equal(l.aviso, D.FALTA_MIGRACAO); assert.deepEqual(l.acoes, []);
  await assert.rejects(diario.decidir(ID(1), { decisao: 'aceitar' }, PESSOA), e => e.status === 503 && e.codigo === 'sem_migracao');
  await assert.rejects(diario.marcarFeita(ID(1), {}, PESSOA), e => e.codigo === 'sem_migracao');
  await assert.rejects(diario.registrarPropria({ tipo: 'pausar', titulo: 'Pausei o vídeo' }, PESSOA), e => e.codigo === 'sem_migracao');
  assert.deepEqual(await diario.rodarRotina(), { ok: false, codigo: 'sem_migracao', erro: D.FALTA_MIGRACAO });
});
