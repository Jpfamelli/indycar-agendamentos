'use strict';
/* Rodada 8 (T5b): o plano da semana (ia/plano.js). Pergunta fixa com os dois períodos, guardado como conversa da oficina,
   o mais recente com texto, dois pedidos ao mesmo tempo, sem conta de anúncio (a pergunta manda não inventar custo) e banco
   sem a tabela. Dublê do modelo; sem rede. */
const test = require('node:test');
const assert = require('node:assert/strict');
const Plano = require('../ia/plano');
const G = require('../ia/gestor');
const { usar, texto, montar, PESSOA, TD } = require('./apoio/gestor-apoio');

const novoPlano = m => Plano.criarPlano({ gestor: m.gestor, nomesDosPerfis: async ids => new Map(ids.map(id => [id, { nome: 'Paulo' }])) });

test('gerar: a pergunta fixa vai ao modelo com os períodos; sem conta ligada pede para não inventar custo; propostas contam', async () => {
  const m = montar({ roteiro: [
    { content: [usar('saude'), usar('funil_por_origem', { periodo: '30d' })] },
    { content: [usar('proposta_criar', { tipo: 'corrigir_rastreio', alvo: { plataforma: 'site', nivel: 'outro', nome: 'Formulário' }, titulo: 'Ligar a origem no formulário do site', porque: '14% dos contatos sem origem em 30 dias.', evidencias: [{ fonte: 'saude', dado: '14% sem origem' }] })] },
    { content: [texto('Semana de arrumar a origem dos contatos.')] },
  ] });
  const plano = novoPlano(m);
  const r = await TD.calado(() => plano.gerar({ usuario: PESSOA }));
  assert.equal(r.ok, true);
  assert.equal(r.plano.texto, 'Semana de arrumar a origem dos contatos.');
  assert.equal(r.plano.propostas.length, 1); assert.equal(r.plano.pedido_por, 'Paulo');
  const pergunta = m.api.chamadas[0].corpo.messages[0].content;
  assert.match(pergunta, /últimos 7 dias \(13\/11 a 19\/11\) e os últimos 30 dias \(21\/10 a 19\/11\)/);
  assert.match(pergunta, /Sem conta de anúncio ligada.*não invente custo/);
  assert.equal(m.sb.tabelas.ia_acoes.filter(x => x.tipo === 'gestor').every(x => x.entrada.ato === 'plano'), true);

  const ultimo = await plano.ultimo();
  assert.equal(ultimo.ligado, true); assert.equal(ultimo.plano.id, r.plano.id); assert.equal(ultimo.plano.texto, r.plano.texto);
  assert.deepEqual(ultimo.plano.propostas, r.plano.propostas);
});

test('dois pedidos ao mesmo tempo: o segundo dá 409 plano_em_andamento; a rotina devolve ok:false sem lançar', async () => {
  const m = montar({ roteiro: [{ esperar: true }], opcoesGestor: { prazoMs: 60 } });
  const plano = novoPlano(m);
  const primeiro = TD.calado(() => plano.gerar({ usuario: PESSOA })).catch(e => e);
  await assert.rejects(plano.gerar({ usuario: PESSOA }), e => e.status === 409 && e.codigo === 'plano_em_andamento');
  const e1 = await primeiro;
  assert.equal(e1.status, 502); assert.equal(e1.codigo, 'tempo'); assert.equal(e1.extra.plano.texto, '');
  const rot = await TD.calado(() => plano.rotina());
  assert.equal(rot.ok, false); assert.equal(rot.codigo, 'tempo');
});

test('último plano: pula o que não tem texto (falhou) e ignora conversa de pessoa com título parecido', async () => {
  const m = montar();
  const conv = (id, criada, mensagens, perfil = null, titulo = 'Plano da semana (12/11)') => ({ id, perfil_id: perfil, titulo, mensagens, criada_em: criada, atualizada_em: criada });
  m.sb.tabelas.trafego_ia_conversas.push(
    conv('aaaaaaaa-0000-4000-8000-000000000001', '2026-11-12T10:00:00Z', [{ papel: 'pessoa', texto: 'p', plano: true }, { papel: 'gestor', texto: 'Plano bom.', em: '2026-11-12T10:01:00Z', propostas: [], parou: 'fim', plano: true, baseado_em: { de: '2026-10-14', ate: '2026-11-12' } }]),
    conv('aaaaaaaa-0000-4000-8000-000000000002', '2026-11-19T10:00:00Z', [{ papel: 'pessoa', texto: 'p', plano: true }, { papel: 'gestor', texto: '', em: '2026-11-19T10:01:00Z', erro: { codigo: 'modelo', erro: 'x' }, plano: true }]),
    conv('aaaaaaaa-0000-4000-8000-000000000003', '2026-11-19T11:00:00Z', [{ papel: 'pessoa', texto: 'Plano da semana?' }, { papel: 'gestor', texto: 'conversa normal' }], PESSOA.id, 'Plano da semana que vem'),
  );
  const r = await novoPlano(m).ultimo();
  assert.equal(r.plano.id, 'aaaaaaaa-0000-4000-8000-000000000001');
  assert.deepEqual(r.plano.baseado_em, { de: '2026-10-14', ate: '2026-11-12', dias: [7, 30], rotulo: 'últimos 7 e 30 dias (14/10 a 12/11)' });
  assert.equal(r.plano.pedido_por, null, 'sem pedido_por: foi a rotina');
  assert.equal(Plano.formatarPlano({ perfil_id: PESSOA.id, mensagens: [{ papel: 'gestor', texto: 'x', plano: true }] }), null);
});

test('banco sem a tabela: GET diz ligado:false com aviso; gerar dá 503 sem_migracao antes de chamar o modelo', async () => {
  const m = montar({ semTabelas: true, roteiro: [{ content: [texto('não devia chegar')] }] });
  const plano = novoPlano(m);
  assert.deepEqual(await plano.ultimo(), { ligado: false, aviso: G.FALTA_MIGRACAO, plano: null });
  await assert.rejects(plano.gerar({ usuario: PESSOA }), e => e.status === 503 && e.codigo === 'sem_migracao' && /plano da semana fica guardado/.test(e.message));
  assert.equal(m.api.chamadas.length, 0);
});
