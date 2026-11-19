'use strict';
/* Rodada 8 (T5b): o laço do Gestor IA com o dublê do modelo (sem rede). Laço de ferramentas, limite de 8 voltas, proposta
   vira evento, conversa guardada e continuada, corte do histórico em 40 mensagens, limite do dia, falta de chave, IA
   desligada, erro do modelo no meio do fluxo, recusa, prazo, pessoa que fecha a conexão, 30 por hora, validação, banco sem
   a tabela, troca automática de modelo e o que vai em cada chamada (cache, esforço, ferramentas). */
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../ia/gestor');
const I = require('../ia/instrucoes');
const F = require('../ia/ferramentas');
const { usar, texto, clienteFalso, montar, perguntar, PESSOA, ADMIN, TD } = require('./apoio/gestor-apoio');

const PROPOSTA = (n = 1) => ({ tipo: 'pausar', alvo: { plataforma: 'meta', nivel: 'anuncio', ext: `55${n}`, nome: `Vídeo ${n}` }, titulo: `Pausar o anúncio Vídeo ${n}`,
  porque: 'Custo por contato de R$ 84 em 30 dias e nenhum serviço fechado.', evidencias: [{ fonte: 'campanhas', dado: 'custo por contato R$ 84 em 30 dias', valor: 84 }] });
const tipos = eventos => eventos.map(e => e.tipo);
const resultadosDe = corpo => corpo.messages.flatMap(m => (Array.isArray(m.content) ? m.content : [])).filter(b => b.type === 'tool_result');

test('laço: lê, propõe e responde; eventos na ordem, proposta no formato do diário, fim com a conversa e o uso', async () => {
  const m = montar({ roteiro: [
    { content: [texto('Vou conferir o que está ligado.'), usar('saude')] },
    { content: [usar('resumo_do_periodo', { periodo: '7d' }), usar('proposta_criar', PROPOSTA())] },
    { content: [texto('Os anúncios não mostram custo porque falta ligar a conta.\n\n- 7 contatos em 30 dias.')] },
  ] });
  const { eventos, out } = await perguntar(m, { corpo: { pergunta: 'Como estão os anúncios?' } });

  assert.deepEqual(tipos(eventos).filter(t => t !== 'texto'), ['ferramenta', 'ferramenta', 'ferramenta', 'proposta', 'fim']);
  assert.ok(tipos(eventos).indexOf('texto') < tipos(eventos).indexOf('ferramenta'), 'o texto da 1ª volta sai antes das ferramentas');
  assert.deepEqual(eventos.filter(e => e.tipo === 'ferramenta').map(e => [e.nome, e.rotulo]),
    [['saude', 'Conferindo o que está ligado'], ['resumo_do_periodo', 'Lendo o resumo do período'], ['proposta_criar', 'Escrevendo uma sugestão']]);
  const texto1 = eventos.filter(e => e.tipo === 'texto').map(e => e.texto).join('');
  assert.equal(texto1, 'Vou conferir o que está ligado.\n\nOs anúncios não mostram custo porque falta ligar a conta.\n\n- 7 contatos em 30 dias.', 'as voltas se separam com linha em branco');
  assert.equal(out.texto, texto1);

  const p = eventos.find(e => e.tipo === 'proposta').proposta;
  assert.equal(p.status, 'proposta'); assert.equal(p.origem, 'ia'); assert.equal(p.autor, 'Gestor IA');
  assert.equal(p.titulo, 'Pausar o anúncio Vídeo 1'); assert.equal(p.alvo_rotulo, 'Meta › anúncio Vídeo 1');
  assert.equal(p.evidencias[0].texto, 'custo por contato R$ 84 em 30 dias');
  assert.equal(p.vence_em, '2026-12-03');
  assert.equal(m.sb.tabelas.trafego_acoes.length, 1);
  assert.equal(m.sb.tabelas.trafego_acoes[0].status, 'proposta');

  const fim = eventos.at(-1);
  assert.equal(fim.parou, 'fim'); assert.equal(fim.modelo, 'claude-opus-5-5'); assert.equal(fim.aviso, null);
  assert.deepEqual(fim.uso, { entrada: 3600, saida: 240, cache_lido: 2000, cache_criado: 1000, chamadas: 3, ferramentas: 3 });

  const conversa = m.sb.tabelas.trafego_ia_conversas.find(c => c.id === fim.conversa_id);
  assert.equal(conversa.perfil_id, PESSOA.id);
  assert.equal(conversa.titulo, 'Como estão os anúncios?');
  assert.deepEqual(conversa.mensagens.map(x => x.papel), ['pessoa', 'gestor']);
  assert.equal(conversa.mensagens[1].texto, texto1);
  assert.deepEqual(conversa.mensagens[1].ferramentas, ['saude', 'resumo_do_periodo', 'proposta_criar']);
  assert.deepEqual(conversa.mensagens[1].propostas, [p.id]);

  // Uma linha em ia_acoes por chamada ao modelo (tipo gestor), mais as da porta (T5a) por ferramenta.
  const chamadas = m.sb.tabelas.ia_acoes.filter(x => x.tipo === 'gestor');
  assert.equal(chamadas.length, 3);
  for (const [i, c] of chamadas.entries()) {
    assert.equal(c.origem, 'trafego'); assert.equal(c.status, 'executada'); assert.equal(c.modelo, 'claude-opus-5-5');
    assert.equal(c.perfil_id, PESSOA.id); assert.equal(c.tokens_entrada, 1200); assert.equal(c.tokens_saida, 80);
    assert.ok(Number.isFinite(c.duracao_ms));
    assert.deepEqual(c.entrada, { ato: 'pergunta', conversa_id: fim.conversa_id, volta: i + 1 });
    assert.ok(!JSON.stringify(c).includes('Como estão os anúncios'), 'a pergunta não vai para ia_acoes');
  }
  assert.deepEqual(chamadas[0].saida.ferramentas_pedidas, ['saude']);
  assert.deepEqual(m.sb.tabelas.ia_acoes.filter(x => x.tipo !== 'gestor').map(x => `${x.tipo}:${x.status}`),
    ['porta:saude:executada', 'porta:resumo_do_periodo:executada', 'porta:proposta_criar:proposta']);
});

test('o pedido ao modelo: modelo forte, esforço medium, sem "thinking" (o padrão adaptativo), cache no sistema e no topo, 13 ferramentas sem a de dado pessoal', async () => {
  const m = montar({ roteiro: [{ content: [usar('saude')] }, { content: [texto('Pronto.')] }], ia: { modelo_forte: 'claude-opus-5-5' } });
  await perguntar(m, { corpo: { pergunta: 'Tudo ligado?' } });
  const [c1, c2] = m.api.chamadas.map(x => x.corpo);
  assert.equal(m.api.chamadas[0].canal, 'messages'); assert.ok(m.api.chamadas[0].temSinal);
  assert.equal(c1.model, 'claude-opus-5-5'); assert.equal(c1.max_tokens, 16000);
  assert.deepEqual(c1.output_config, { effort: 'medium' });
  assert.ok(!('thinking' in c1) && !('temperature' in c1) && !('tool_choice' in c1));
  assert.deepEqual(c1.cache_control, { type: 'ephemeral' });
  assert.equal(c1.system.length, 1); assert.deepEqual(c1.system[0].cache_control, { type: 'ephemeral' });
  assert.equal(c1.system[0].text, I.SISTEMA, 'o sistema é fixo (cache)');
  assert.deepEqual(c1.tools.map(t => t.name), F.FERRAMENTAS.filter(f => f.nome !== 'conversa').map(f => f.nome));
  for (const t of c1.tools) { assert.ok(t.description && t.input_schema && t.input_schema.type === 'object'); assert.ok(!('eager_input_streaming' in t)); }
  assert.deepEqual(c1.tools, c2.tools, 'a lista de ferramentas não muda entre voltas (cache)');
  // A pergunta vai com o dia de hoje na mensagem da pessoa (o sistema fica sem data).
  assert.equal(c1.messages.length, 1);
  assert.equal(c1.messages[0].content, `${I.linhaDoDia(TD.AGORA)}\n\nTudo ligado?`);
  assert.match(c1.messages[0].content, /^Hoje é quinta, 19\/11\/2026/);
  // 2ª volta: o pedido de ferramenta do modelo como veio e o resultado em JSON.
  assert.deepEqual(c2.messages.map(x => x.role), ['user', 'assistant', 'user']);
  assert.equal(c2.messages[1].content[0].type, 'tool_use');
  const [r] = resultadosDe(c2);
  assert.equal(r.tool_use_id, c2.messages[1].content[0].id);
  assert.ok(!r.is_error);
  assert.match(JSON.parse(r.content).resumo, /conta de anúncio/);
  const tudo = JSON.stringify(m.api.chamadas);
  for (const segredo of ['SUPABASE', 'service_role', 'ica_', 'sk-ant', 'postgres://', process.env.ADS_CRON_TOKEN || 'nada-de-cron']) {
    assert.ok(!tudo.includes(segredo), `nada de "${segredo}" no contexto do modelo`);
  }
});

test('limite de 8 voltas: a 8ª vai sem ferramentas (tool_choice none) e com o aviso para responder; se insistir, para com frase clara', async () => {
  const insiste = montar({ roteiro: [{ content: [usar('saude')] }] });
  const { eventos, out } = await perguntar(insiste, { corpo: { pergunta: 'Me explica tudo.' } });
  assert.equal(insiste.api.chamadas.length, 8);
  insiste.api.chamadas.slice(0, 7).forEach(c => assert.ok(!('tool_choice' in c.corpo)));
  assert.deepEqual(insiste.api.chamadas[7].corpo.tool_choice, { type: 'none' });
  const ultimoUser = insiste.api.chamadas[7].corpo.messages.at(-1);
  assert.equal(ultimoUser.content.at(-1).type, 'text');
  assert.match(ultimoUser.content.at(-1).text, /responda agora com o que já leu/);
  assert.equal(out.parou, 'voltas');
  assert.match(out.texto, /Parei de consultar aqui/);
  assert.equal(eventos.at(-1).tipo, 'fim'); assert.equal(eventos.at(-1).parou, 'voltas');
  assert.equal(eventos.filter(e => e.tipo === 'ferramenta').length, 7, 'a 8ª volta não roda ferramenta');

  const obedece = montar({ roteiro: [(corpo) => (corpo.tool_choice ? { content: [texto('Com o que li: tudo certo.')] } : { content: [usar('saude')] })] });
  const r2 = await perguntar(obedece, { corpo: { pergunta: 'Me explica tudo.' } });
  assert.equal(obedece.api.chamadas.length, 8);
  assert.equal(r2.out.parou, 'fim');
  assert.equal(r2.out.texto, 'Com o que li: tudo certo.');
});

test('no máximo duas propostas por resposta: a 3ª volta como erro para o modelo e não grava nada', async () => {
  const m = montar({ roteiro: [
    { content: [usar('proposta_criar', PROPOSTA(1)), usar('proposta_criar', PROPOSTA(2)), usar('proposta_criar', PROPOSTA(3))] },
    { content: [texto('Deixei duas sugestões.')] },
  ] });
  const { eventos } = await perguntar(m, { corpo: { pergunta: 'O que eu pauso?' } });
  assert.equal(eventos.filter(e => e.tipo === 'proposta').length, 2);
  assert.equal(m.sb.tabelas.trafego_acoes.length, 2);
  const rs = resultadosDe(m.api.chamadas[1].corpo);
  assert.deepEqual(rs.map(r => !!r.is_error), [false, false, true]);
  assert.match(rs[2].content, /Já há 2 propostas/);
});

test('ferramenta com erro (argumento fora do esquema, nome que não existe) volta para o modelo como erro, em palavras', async () => {
  const m = montar({ roteiro: [
    { content: [usar('campanhas', { nivel: 'qualquer' }), usar('pausar_tudo', {}), usar('conversa', { lead_id: 'x' })] },
    { content: [texto('Não deu para ler tudo.')] },
  ] });
  const { out } = await perguntar(m, { corpo: { pergunta: 'Campanhas?' } });
  const rs = resultadosDe(m.api.chamadas[1].corpo);
  assert.deepEqual(rs.map(r => r.is_error), [true, true, true]);
  assert.match(rs[1].content, /não existe/);
  assert.match(rs[2].content, /dado pessoal/, 'sem ver_pii a ferramenta conversa é recusada pela camada (permissão em código)');
  assert.equal(out.parou, 'fim');
});

test('conversa guardada e continuada: o histórico volta como texto; conversa de outra pessoa dá 404; plano vira conversa nova da pessoa', async () => {
  const m = montar({ roteiro: [{ content: [texto('Primeira resposta.')] }] });
  const a = await perguntar(m, { corpo: { pergunta: 'Primeira pergunta' } });
  const id = a.out.conversa_id;
  m.api.chamadas.length = 0;
  const b = await perguntar(m, { corpo: { pergunta: 'Segunda pergunta', conversa_id: id } });
  assert.equal(b.out.conversa_id, id);
  const msgs = m.api.chamadas[0].corpo.messages;
  assert.deepEqual(msgs.map(x => [x.role, typeof x.content === 'string' ? x.content.split('\n').at(-1) : null]),
    [['user', 'Primeira pergunta'], ['assistant', 'Primeira resposta.'], ['user', 'Segunda pergunta']]);
  const conversa = m.sb.tabelas.trafego_ia_conversas.find(c => c.id === id);
  assert.equal(conversa.mensagens.length, 4);
  assert.equal(m.sb.tabelas.trafego_ia_conversas.length, 1);

  await assert.rejects(m.gestor.preparar({ usuario: ADMIN, corpo: { pergunta: 'x', conversa_id: id } }), e => e.status === 404 && e.codigo === 'conversa');
  await assert.rejects(m.gestor.abrirConversa(id, ADMIN), e => e.status === 404);
  const aberta = await m.gestor.abrirConversa(id, PESSOA);
  assert.equal(aberta.plano, false); assert.equal(aberta.mensagens.length, 4);
  const lista = await m.gestor.listarConversas(PESSOA);
  assert.equal(lista.ligado, true); assert.equal(lista.conversas[0].mensagens, 4); assert.equal(lista.conversas[0].ultima, 'Primeira resposta.');
  assert.equal((await m.gestor.listarConversas(ADMIN)).conversas.length, 0);

  // Pergunta em cima do plano da semana (conversa sem dono): abre uma conversa da pessoa, que começa com o plano.
  const plano = { id: 'aaaaaaaa-1111-4222-8333-444444444444', perfil_id: null, titulo: I.tituloDoPlano(TD.AGORA), criada_em: '2026-11-17T10:00:00.000Z', atualizada_em: '2026-11-17T10:01:00.000Z',
    mensagens: [{ papel: 'pessoa', texto: 'Faça o plano', em: '2026-11-17T10:00:00.000Z', plano: true }, { papel: 'gestor', texto: 'Semana de ligar a conta.', em: '2026-11-17T10:01:00.000Z', plano: true }] };
  m.sb.tabelas.trafego_ia_conversas.push(plano);
  const c = await perguntar(m, { corpo: { pergunta: 'Por que ligar a conta?', conversa_id: plano.id } });
  assert.notEqual(c.out.conversa_id, plano.id);
  const nova = m.sb.tabelas.trafego_ia_conversas.find(x => x.id === c.out.conversa_id);
  assert.equal(nova.perfil_id, PESSOA.id);
  assert.match(nova.titulo, /^Sobre o plano da semana \(17\/11\)/);
  assert.deepEqual(nova.mensagens.map(x => x.papel), ['pessoa', 'gestor', 'pessoa', 'gestor']);
  assert.ok(nova.mensagens.every(x => x.plano !== true), 'a cópia não fica marcada como plano');
  assert.equal(plano.mensagens.length, 2, 'o plano não muda');
});

test('corte do histórico: passou de 40 mensagens, as mais antigas viram um resumo; o modelo recebe o resumo como texto', async () => {
  const velhas = [];
  for (let i = 1; i <= 20; i++) {
    velhas.push({ papel: 'pessoa', texto: `Pergunta ${i}`, em: `2026-11-${String(i).padStart(2, '0')}T12:00:00.000Z` });
    velhas.push({ papel: 'gestor', texto: `Resposta ${i}. Mais detalhe aqui.`, em: `2026-11-${String(i).padStart(2, '0')}T12:01:00.000Z`, propostas: i === 2 ? ['p1'] : [] });
  }
  const id = 'bbbbbbbb-1111-4222-8333-444444444444';
  const m = montar({ roteiro: [{ content: [texto('Resposta 21.')] }], tabelasExtra: { trafego_ia_conversas: [{ id, perfil_id: PESSOA.id, titulo: 'Longa', mensagens: velhas, criada_em: '2026-11-01T12:00:00Z', atualizada_em: '2026-11-18T12:00:00Z' }] } });
  await perguntar(m, { corpo: { pergunta: 'Pergunta 21', conversa_id: id } });
  const guardada = m.sb.tabelas.trafego_ia_conversas.find(c => c.id === id).mensagens;
  assert.equal(guardada.length, 40);
  assert.equal(guardada[0].papel, 'resumo');
  assert.equal(guardada[0].mensagens_resumidas, 3);
  assert.match(guardada[0].texto, /Pergunta \(01\/11\): Pergunta 1\nResposta: Resposta 1\.\nPergunta \(02\/11\): Pergunta 2/);
  assert.deepEqual(guardada.slice(-2).map(x => x.texto), ['Pergunta 21', 'Resposta 21.']);
  // O que foi para o modelo nesta volta: as 40 guardadas antes + a pergunta (o corte vale para a próxima).
  assert.equal(m.api.chamadas[0].corpo.messages.length, 41);

  // Unidades: o resumo acumula a contagem e nunca passa de 3000 letras.
  const cheia = Array.from({ length: 60 }, (_, i) => ({ papel: i % 2 ? 'gestor' : 'pessoa', texto: `${'x'.repeat(300)} ${i}.`, em: '2026-11-10T12:00:00Z' }));
  const uma = G.encaixar(cheia);
  assert.equal(uma.length, 40); assert.equal(uma[0].mensagens_resumidas, 21);
  const duas = G.encaixar([...uma, { papel: 'pessoa', texto: 'mais', em: '2026-11-11T12:00:00Z' }, { papel: 'gestor', texto: 'ok', em: '2026-11-11T12:00:00Z' }]);
  assert.equal(duas.length, 40); assert.equal(duas[0].mensagens_resumidas, 23);
  assert.ok(duas[0].texto.length <= 3000);
  const modelo = G.paraModelo(duas);
  assert.equal(modelo[0].role, 'user'); assert.match(modelo[0].content, /^Resumo do começo desta conversa/);
  assert.equal(G.paraModelo([{ papel: 'gestor', texto: 'oi' }])[0].role, 'user', 'a lista sempre começa pela pessoa');
});

test('limite do dia (ia_config.limite_chamadas_dia, como no Atendimento) e IA desligada: 429 e 503 antes de chamar o modelo', async () => {
  const hoje = '2026-11-19T12:00:00.000Z', ontem = '2026-11-19T02:00:00.000Z'; // 02h UTC = 23h de ontem em Brasília
  const linhas = [
    { id: 'g1', origem: 'trafego', tipo: 'gestor', status: 'executada', created_at: hoje },
    { id: 'g2', origem: 'trafego', tipo: 'gestor', status: 'erro', created_at: hoje },
    { id: 'g3', origem: 'trafego', tipo: 'gestor', status: 'executada', created_at: ontem },
    { id: 'p1', origem: 'trafego', tipo: 'porta:saude', status: 'executada', created_at: hoje },
    { id: 'a1', origem: 'atendimento', tipo: 'gestor', status: 'executada', created_at: hoje },
  ];
  const m = montar({ roteiro: [{ content: [texto('ok')] }], ia: { limite_chamadas_dia: 2 }, tabelasExtra: { ia_acoes: linhas } });
  assert.equal(await m.gestor.chamadasDeHoje(), 2, 'só as do Gestor, de hoje (Brasília)');
  await assert.rejects(m.gestor.preparar({ usuario: PESSOA, corpo: { pergunta: 'oi' } }), e => e.status === 429 && e.codigo === 'limite_dia' && /2 chamadas do dia/.test(e.message));
  assert.equal(m.api.chamadas.length, 0);
  m.gestor.trocar({ lerConfig: async () => ({ ativo: true, modelo_forte: 'claude-opus-5-5', limite_chamadas_dia: 3 }) });
  await perguntar(m, { corpo: { pergunta: 'oi' } });
  assert.equal(m.api.chamadas.length, 1);
  m.gestor.trocar({ lerConfig: async () => ({ ativo: false, modelo_forte: 'claude-opus-5-5', limite_chamadas_dia: 3000 }) });
  await assert.rejects(m.gestor.preparar({ usuario: PESSOA, corpo: { pergunta: 'oi' } }), e => e.status === 503 && e.codigo === 'ia_desligada' && /resto do app segue/.test(e.message));
});

test('sem chave da IA: 503 sem_chave com frase clara; sem chamar o modelo nem gravar conversa', async () => {
  const salvo = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const m = montar({ cliente: null });
    await assert.rejects(m.gestor.preparar({ usuario: PESSOA, corpo: { pergunta: 'oi' } }), e => e.status === 503 && e.codigo === 'sem_chave' && /falta a chave da IA/.test(e.message));
    const semDuble = G.criarGestor({ sb: m.sb });
    assert.equal(semDuble.temChave(), false, 'sem ANTHROPIC_API_KEY no ambiente, o Gestor fica desligado');
    await assert.rejects(semDuble.preparar({ usuario: PESSOA, corpo: { pergunta: 'oi' } }), e => e.codigo === 'sem_chave');
    assert.equal(m.sb.tabelas.trafego_ia_conversas.length, 0);
  } finally { if (salvo !== undefined) process.env.ANTHROPIC_API_KEY = salvo; }
});

test('erro do modelo no meio do fluxo: o que chegou fica, sai UM evento erro (sem fim), a conversa guarda o pedaço e o erro', async () => {
  const quebra = Object.assign(new Error('Internal server error'), { status: 500 });
  const m = montar({ roteiro: [{ content: [usar('saude')] }, { parcial: 'Os anúncios estão', erro: quebra }] });
  const { eventos, out } = await perguntar(m, { corpo: { pergunta: 'Como estão?' } });
  assert.deepEqual(tipos(eventos), ['ferramenta', 'texto', 'erro']);
  assert.equal(eventos[1].texto, 'Os anúncios estão');
  const erro = eventos.at(-1);
  assert.equal(erro.codigo, 'modelo'); assert.match(erro.erro, /o que já chegou continua valendo/);
  assert.ok(erro.conversa_id);
  assert.ok(!JSON.stringify(eventos).includes('Internal server error'), 'detalhe técnico não vai para a tela');
  const msg = m.sb.tabelas.trafego_ia_conversas[0].mensagens[1];
  assert.equal(msg.texto, 'Os anúncios estão'); assert.equal(msg.erro.codigo, 'modelo'); assert.equal(msg.parou, null);
  assert.deepEqual(m.sb.tabelas.ia_acoes.filter(x => x.tipo === 'gestor').map(x => x.status), ['executada', 'erro']);
  assert.equal(out.erro.codigo, 'modelo');

  const ocupado = montar({ roteiro: [Object.assign(new Error('Overloaded'), { status: 529 })] });
  const r2 = await perguntar(ocupado, { corpo: { pergunta: 'oi' } });
  assert.deepEqual(tipos(r2.eventos), ['erro']); assert.equal(r2.eventos[0].codigo, 'modelo_ocupado');
});

test('recusa (stop_reason refusal), resposta cortada (max_tokens) e resposta vazia', async () => {
  const recusa = montar({ roteiro: [{ content: [], stop_reason: 'refusal' }] });
  const r1 = await perguntar(recusa, { corpo: { pergunta: 'oi' } });
  assert.deepEqual(tipos(r1.eventos), ['erro']); assert.equal(r1.eventos[0].codigo, 'recusa');

  const cortada = montar({ roteiro: [{ content: [texto('Comecei a'), usar('saude')], stop_reason: 'max_tokens' }] });
  const r2 = await perguntar(cortada, { corpo: { pergunta: 'oi' } });
  assert.equal(r2.out.parou, 'max_tokens');
  assert.equal(r2.eventos.filter(e => e.tipo === 'ferramenta').length, 0, 'pedido de ferramenta cortado não roda');
  assert.equal(r2.eventos.at(-1).tipo, 'fim'); assert.equal(r2.eventos.at(-1).parou, 'max_tokens');

  const vazia = montar({ roteiro: [{ content: [] }] });
  const r3 = await perguntar(vazia, { corpo: { pergunta: 'oi' } });
  assert.equal(r3.out.texto, 'Não consegui escrever uma resposta desta vez. Tente perguntar de outro jeito.');
});

test('prazo de 90 s (aqui 40 ms) e pessoa que fecha a conexão: o modelo é abortado; prazo dá erro "tempo", fechar não manda nada', async () => {
  const lento = montar({ roteiro: [{ content: [usar('saude')] }, { esperar: true }], opcoesGestor: { prazoMs: 40 } });
  const r1 = await perguntar(lento, { corpo: { pergunta: 'oi' } });
  assert.deepEqual(tipos(r1.eventos), ['ferramenta', 'erro']);
  assert.equal(r1.eventos[1].codigo, 'tempo'); assert.match(r1.eventos[1].erro, /90 segundos/);

  const fecha = montar({ roteiro: [{ esperar: true }] });
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 20);
  const r2 = await perguntar(fecha, { corpo: { pergunta: 'oi' }, sinal: ctrl.signal });
  assert.deepEqual(r2.eventos, [], 'ninguém ouvindo: nada de fim nem erro');
  assert.equal(r2.out.parou, 'cliente');
  const msg = fecha.sb.tabelas.trafego_ia_conversas[0].mensagens[1];
  assert.equal(msg.erro.codigo, 'parado');
});

test('30 perguntas por hora por pessoa; a 31ª dá 429 com a espera; outra pessoa segue', async () => {
  const m = montar({ roteiro: [{ content: [texto('ok')] }] });
  for (let i = 0; i < 30; i++) await m.gestor.preparar({ usuario: PESSOA, corpo: { pergunta: `p${i}` } });
  await assert.rejects(m.gestor.preparar({ usuario: PESSOA, corpo: { pergunta: 'mais uma' } }), e => e.status === 429 && e.codigo === 'limite_hora' && e.esperar > 0 && /30 perguntas/.test(e.message));
  await m.gestor.preparar({ usuario: ADMIN, corpo: { pergunta: 'oi' } });
});

test('validação: pergunta vazia, longa, conversa_id torto; dado pessoal só para administrador (e aí a ferramenta conversa entra)', async () => {
  const m = montar({ roteiro: [{ content: [texto('ok')] }] });
  const falha = (corpo, usuario = PESSOA, ehAdmin = false) => m.gestor.preparar({ usuario, corpo, ehAdmin });
  await assert.rejects(falha({}), e => e.status === 422 && e.codigo === 'pergunta');
  await assert.rejects(falha({ pergunta: '   ' }), e => e.codigo === 'pergunta');
  await assert.rejects(falha({ pergunta: 42 }), e => e.codigo === 'pergunta');
  await assert.rejects(falha({ pergunta: 'x'.repeat(2001) }), e => e.status === 422 && /2000/.test(e.message));
  await assert.rejects(falha({ pergunta: 'oi', conversa_id: '../../etc' }), e => e.status === 422 && e.codigo === 'conversa_id');
  await assert.rejects(falha({ pergunta: 'oi', conversa_id: 'cccccccc-1111-4222-8333-444444444444' }), e => e.status === 404);
  await assert.rejects(falha({ pergunta: 'oi', dado_pessoal: true }), e => e.status === 403 && e.codigo === 'so_admin');
  const p = await falha({ pergunta: '  oi\u0000 tudo\r\nbem  ' });
  assert.equal(p.pergunta, 'oi  tudo\nbem', 'controle vira espaço; quebra de linha fica');
  assert.deepEqual(p.permissoes, { escopos: ['ler', 'propor'], ver_pii: false });
  const adm = await falha({ pergunta: 'Leia a conversa do contato', dado_pessoal: true }, ADMIN, true);
  assert.equal(adm.permissoes.ver_pii, true);
  await TD.calado(() => m.gestor.responder(adm, {}));
  assert.ok(m.api.chamadas.at(-1).corpo.tools.some(t => t.name === 'conversa'));
});

test('banco sem a tabela das conversas: responde do mesmo jeito, fim com conversa_id nulo e o aviso; lista diz ligado:false', async () => {
  const m = montar({ roteiro: [{ content: [texto('Respondo mesmo assim.')] }], semTabelas: true });
  const { eventos } = await perguntar(m, { corpo: { pergunta: 'oi' } });
  const fim = eventos.at(-1);
  assert.equal(fim.tipo, 'fim'); assert.equal(fim.conversa_id, null); assert.equal(fim.aviso, G.FALTA_MIGRACAO);
  const lista = await m.gestor.listarConversas(PESSOA);
  assert.deepEqual(lista, { ligado: false, aviso: G.FALTA_MIGRACAO, conversas: [] });
  await assert.rejects(m.gestor.criarConversa({}, PESSOA), e => e.status === 503 && e.codigo === 'sem_migracao');
});

test('troca automática de modelo na recusa: Opus/Sonnet 5.5 vão pelo canal beta com fallbacks; 400 da beta tenta de novo sem ela', async () => {
  const m = montar({ roteiro: [{ content: [texto('ok')] }], opcoesGestor: { fallback: undefined } });
  const salvo = process.env.GESTOR_FALLBACK;
  delete process.env.GESTOR_FALLBACK;
  try {
    await perguntar(m, { corpo: { pergunta: 'oi' } });
    const c = m.api.chamadas[0];
    assert.equal(c.canal, 'beta'); assert.deepEqual(c.corpo.betas, [G.BETA_FALLBACK]); assert.equal(c.corpo.fallbacks, 'default');

    const recusa400 = montar({ roteiro: [(corpo) => (corpo.fallbacks ? Object.assign(new Error('fallbacks: unknown parameter'), { status: 400 }) : { content: [texto('ok sem beta')] })], opcoesGestor: { fallback: undefined } });
    const r = await perguntar(recusa400, { corpo: { pergunta: 'oi' } });
    assert.equal(r.out.texto, 'ok sem beta');
    assert.deepEqual(recusa400.api.chamadas.map(x => x.canal), ['beta', 'messages']);
    await perguntar(recusa400, { corpo: { pergunta: 'de novo' } });
    assert.equal(recusa400.api.chamadas.at(-1).canal, 'messages', 'depois de recusada, não tenta mais a beta');

    process.env.GESTOR_FALLBACK = '0';
    const desligado = montar({ roteiro: [{ content: [texto('ok')] }], opcoesGestor: { fallback: undefined } });
    await perguntar(desligado, { corpo: { pergunta: 'oi' } });
    assert.equal(desligado.api.chamadas[0].canal, 'messages');
    delete process.env.GESTOR_FALLBACK;
    const haiku = montar({ roteiro: [{ content: [texto('ok')] }], ia: { modelo_forte: 'claude-haiku-5' }, opcoesGestor: { fallback: undefined } });
    await perguntar(haiku, { corpo: { pergunta: 'oi' } });
    assert.equal(haiku.api.chamadas[0].canal, 'messages');
  } finally { if (salvo === undefined) delete process.env.GESTOR_FALLBACK; else process.env.GESTOR_FALLBACK = salvo; }
});

test('paraEco: depois de uma troca de modelo, pensamento e pedidos de ferramenta de antes do bloco "fallback" saem; texto e o bloco ficam', () => {
  const conteudo = [
    { type: 'thinking', thinking: 'a', signature: 's' }, { type: 'text', text: 'Começo.' }, { type: 'tool_use', id: 't1', name: 'saude', input: {} },
    { type: 'fallback', model: 'claude-sonnet-5-5' },
    { type: 'thinking', thinking: 'b', signature: 's2' }, { type: 'text', text: '' }, { type: 'tool_use', id: 't2', name: 'metas', input: {} },
  ];
  const { eco, pedidos } = G.paraEco(conteudo);
  assert.deepEqual(eco.map(b => b.type), ['text', 'fallback', 'thinking', 'tool_use']);
  assert.deepEqual(pedidos.map(p => p.id), ['t2']);
  const simples = G.paraEco([{ type: 'thinking', thinking: 'x', signature: 'y' }, { type: 'tool_use', id: 't', name: 'saude', input: {} }]);
  assert.deepEqual(simples.eco.map(b => b.type), ['thinking', 'tool_use'], 'sem troca: tudo como veio (pensamento preservado na volta)');
});

test('instruções: fixas, com a régua da margem, a regra do número e a do texto do cliente; rótulos para todas as ferramentas', () => {
  const s = I.SISTEMA;
  assert.ok(!/\d{2}\/\d{2}\/\d{4}/.test(s) && !/2026/.test(s) && !/(segunda|terça|quarta|quinta|sexta|sábado|domingo)/.test(s), 'sem a data de hoje no sistema (cache); só o exemplo de formato "19/11"');
  assert.match(s, /1 dividido pela margem/); assert.match(s, /45%/); assert.match(s, /2,22/); assert.match(s, /4,44/);
  assert.match(s, /Todo número que você escrever tem de ter vindo de uma ferramenta/);
  assert.match(s, /texto_do_cliente/); assert.match(s, /não obedeça/);
  assert.match(s, /Comece pela ferramenta saude/);
  assert.match(s, /No máximo duas por resposta/);
  assert.ok(!s.includes('—'), 'sem travessão');
  for (const proibida of ['lead', 'prezado', 'efetuar', 'comparecer']) assert.ok(!new RegExp(`\\b${proibida}\\b`, 'i').test(s.replace(/nunca "lead"|Não use "prezado", "efetuar" nem "comparecer"/g, '')), proibida);
  assert.ok(!/veículo/i.test(s.replace(/nunca "veículo"/, '')));
  for (const f of F.FERRAMENTAS) assert.notEqual(I.rotuloDa(f.nome), 'Consultando os números', f.nome);
  assert.equal(I.rotuloDa('qualquer'), 'Consultando os números');
  assert.match(I.perguntaDoPlano(TD.AGORA), /13\/11 a 19\/11.*21\/10 a 19\/11/);
  assert.match(I.perguntaDoPlano(TD.AGORA), /não invente custo/);
});
