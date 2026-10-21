'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { criarSbFalso } = require('./apoio/sb-falso.js');
const { criarR6 } = require('../lib/r6-dados.js');

const CLI = '0bf5de3c-669d-41db-a0f8-6f76343a490b';
const CONV = '33b965a4-65e0-4562-a1b0-952466991b2c';
const CONV2 = '44b965a4-65e0-4562-a1b0-952466991b2c';
const OS = '55b965a4-65e0-4562-a1b0-952466991b2c';
const AGORA = new Date('2026-10-21T15:00:00Z');
const iso = (min) => new Date(AGORA.getTime() - min * 60000).toISOString();

function montar(extra = {}, opc = {}) {
  const sb = criarSbFalso({
    conversas: [
      { id: CONV, cliente_id: CLI, telefone: '5512988660661', telefone_e164: '5512988660661', tipo: 'atendimento', desfecho: null, nao_lidas: 1, ultima_mensagem_em: iso(10), atribuida_a: null },
      { id: CONV2, cliente_id: null, telefone: '5512977771111', telefone_e164: '5512977771111', tipo: 'atendimento', desfecho: null, nao_lidas: 0, ultima_mensagem_em: iso(30), atribuida_a: null },
    ],
    whatsapp_mensagens: [
      { id: 'm1', conversa_id: CONV, direcao: 'saida', corpo: 'Oi!', created_at: iso(60), status: 'enviado' },
      { id: 'm2', conversa_id: CONV, direcao: 'entrada', corpo: 'meu carro já ficou pronto? quanto deu?', created_at: iso(10), status: 'recebido' },
      { id: 'm3', conversa_id: CONV2, direcao: 'entrada', corpo: '', anexo: 'x.ogg', anexo_mime: 'audio/ogg', created_at: iso(30), status: 'recebido' },
      { id: 'f1', conversa_id: CONV2, direcao: 'saida', corpo: 'a', status: 'falhou', erro: 'WhatsApp parado', created_at: iso(40) },
      { id: 'f2', conversa_id: CONV2, direcao: 'saida', corpo: 'b', status: 'falhou', erro: 'Sem confirmação: x', created_at: iso(41) },
      { id: 'f3', conversa_id: CONV2, direcao: 'saida', corpo: 'c', status: 'falhou', erro: 'Resolvido fora do WhatsApp por Ana', created_at: iso(42) },
    ],
    patio_os: [{ id: OS, numero: 7, etapa: 'pronto', etapa_em: iso(40), cliente_id: CLI, telefone: '12988660661', veiculo: 'Onix', placa: 'ABC1D23' }],
    patio_extras: [{ os_id: OS, status: 'pendente', created_at: iso(300), descricao: 'pastilha' }],
    orc_orcamentos: [{ id: 'o1', numero: 12, status: 'aprovado', cliente_id: CLI, cliente_telefone: '12988660661', created_at: iso(2000), agendamento_id: null }],
    tarefas: [], r6_c3_marcas: [],
    ...extra,
  }, { relogio: () => AGORA, ...opc });
  return { sb, r6: criarR6({ sb, agora: () => AGORA, log: () => {} }) };
}

test('fila: pedidos do cliente, carro no pátio, orçamento e mensagens que não saíram', async () => {
  const { r6 } = montar();
  const r = await r6.filaContexto({ forcar: true });
  assert.ok(r.ok);
  const a = r.conversas[CONV];
  assert.ok(a.sem_resposta);
  assert.ok(a.pedidos.includes('estado_carro') && a.pedidos.includes('preco'));
  assert.strictEqual(a.patio.etapa, 'pronto');
  assert.strictEqual(a.patio.extras_pendentes, 1);
  assert.ok(a.patio.extra_min >= 290);
  assert.strictEqual(a.orc.cod, 'aprovado_sem_horario');
  const b = r.conversas[CONV2];
  assert.deepStrictEqual(b.pedidos.includes('so_midia'), true, 'áudio sem texto vira pedido de mídia');
  assert.deepStrictEqual(b.falhas, { nao_saiu: 1, sem_confirmacao: 1 }, 'a resolvida fora não conta');
  assert.strictEqual(r.resumo.no_patio, 1);
});

test('fila: erro numa tabela vira aviso e não derruba o resto', async () => {
  const { r6 } = montar({}, { falhas: { patio_os: { msg: 'sem permissão' } } });
  const r = await r6.filaContexto({ forcar: true });
  assert.ok(r.ok && r.conversas[CONV] && !r.conversas[CONV].patio);
  assert.ok(r.avisos.some(x => /pátio/.test(x)));
});

test('não saíram: lista com nome, separa sem confirmação e esconde as resolvidas', async () => {
  const { r6 } = montar();
  const r = await r6.naoSairam({ dias: 3 });
  assert.strictEqual(r.total, 2);
  assert.strictEqual(r.nao_saiu[0].id, 'f1');
  assert.strictEqual(r.sem_confirmacao[0].id, 'f2');
});

test('resolver fora do WhatsApp: marca, audita e não aceita mensagem que saiu', async () => {
  let aud = 0;
  const { sb } = montar();
  const r6 = criarR6({ sb, agora: () => AGORA, log: () => {}, auditar: async () => { aud++; return { ok: true }; } });
  const bom = await r6.resolverFora({ mensagemId: '00000000-0000-4000-8000-0000000000f1', perfil: { id: 'p1', nome: 'Ana' } });
  assert.strictEqual(bom.status, 404);
  sb.db.whatsapp_mensagens.push({ id: '66b965a4-65e0-4562-a1b0-952466991b2c', conversa_id: CONV2, direcao: 'saida', status: 'falhou', erro: 'x', created_at: iso(5) });
  sb.db.whatsapp_mensagens.push({ id: '77b965a4-65e0-4562-a1b0-952466991b2c', conversa_id: CONV2, direcao: 'saida', status: 'enviado', created_at: iso(5) });
  const ok = await r6.resolverFora({ mensagemId: '66b965a4-65e0-4562-a1b0-952466991b2c', perfil: { id: 'p1', nome: 'Ana' }, nota: 'liguei' });
  assert.ok(ok.ok); assert.ok(/Ana/.test(ok.erro_texto) && /liguei/.test(ok.erro_texto));
  assert.strictEqual(sb.db.r6_c3_marcas.length, 1);
  assert.strictEqual(aud, 1);
  assert.strictEqual((await r6.resolverFora({ mensagemId: '77b965a4-65e0-4562-a1b0-952466991b2c', perfil: {} })).status, 409);
  assert.strictEqual((await r6.resolverFora({ mensagemId: 'lixo' })).status, 400);
});

test('passar para o consultor: marca a espera, cria uma tarefa só e não duplica', async () => {
  const { sb, r6 } = montar();
  const a = await r6.passarParaConsultor({ conversaId: CONV, perfil: { id: 'p1', nome: 'Ana' }, motivo: 'preco' });
  assert.ok(a.ok && a.tarefa_id);
  assert.strictEqual(sb.db.conversas.find(c => c.id === CONV).aguardando_consultor, true);
  assert.strictEqual(sb.db.tarefas.length, 1);
  assert.strictEqual(sb.db.tarefas[0].responsavel_id, 'p1');
  const b = await r6.passarParaConsultor({ conversaId: CONV, perfil: { id: 'p1' }, motivo: 'preco' });
  assert.ok(b.ok && b.ja_estava && !b.tarefa_id);
  assert.strictEqual(sb.db.tarefas.length, 1);
  assert.strictEqual((await r6.passarParaConsultor({ conversaId: 'x' })).status, 400);
});

test('painel do cliente junta pátio, orçamentos, agenda e CRM do r6_cliente_360 e monta os links', async () => {
  const r360 = {
    resumo: { total_gasto: 300, servicos_feitos: 1 },
    patio: [{ id: OS, numero: 7, etapa: 'aguardando_aprovacao', etapa_rotulo: 'Aguardando aprovação do cliente', veiculo: 'Onix', placa: 'ABC1D23', extras: [{ descricao: 'pastilha', urgencia: 'seguranca', valor: 200 }], link_cliente: 'https://indycar-patio.netlify.app/acompanhar/?t=' + 'a'.repeat(32), link_equipe: 'https://indycar-patio.netlify.app/?os=' + OS }],
    orcamentos: [{ id: '88b965a4-65e0-4562-a1b0-952466991b2c', numero: 12, status: 'aprovado', total: 900, link_cliente: null }],
    agendamentos: [{ id: '99b965a4-65e0-4562-a1b0-952466991b2c', data: '2026-10-22', hora: '09:00:00', inicio_em: '2026-10-22T12:00:00Z', status: 'confirmado', servico: 'Óleo', link_equipe: 'https://x/agenda/?agendamento=1' }],
    leads: [{ id: 'aab965a4-65e0-4562-a1b0-952466991b2c', status: 'orcamento', servico: 'Freio', link_equipe: 'https://x/crm/?lead=1', responsavel_nome: 'Gabriel' }],
    linha_do_tempo: [{ tipo: 'mensagem', quando: iso(5), titulo: 'a' }, { tipo: 'lead', quando: iso(50), titulo: 'b' }],
    tarefas: [{ status: 'aberta' }, { status: 'feita' }],
  };
  const { sb } = montar({ clientes: [{ id: CLI, nome: 'Maria Silva', telefone: '5512988660661', telefone_e164: '5512988660661', carro_modelo: 'Onix', carro_ano: '2019', placa: 'ABC1D23' }] },
    { rpc: { r6_cliente_360: () => ({ data: r360, error: null }) } });
  const r6 = criarR6({ sb, agora: () => AGORA, log: () => {} });
  const p = await r6.painelCliente(CLI);
  assert.ok(p.ok);
  assert.strictEqual(p.patio.etapa, 'aguardando_aprovacao');
  assert.ok(/acompanhar/.test(p.patio.texto_link) && /Oi Maria/.test(p.patio.texto_link));
  assert.strictEqual(p.patio.passos.find(x => x.estado === 'atual').cod, 'aguardando_aprovacao');
  assert.strictEqual(p.orcamentos[0].cod, 'aprovado_sem_horario');
  assert.ok(/#\/historico\//.test(p.orcamentos[0].abrir));
  assert.strictEqual(p.agendamentos.proximo.hora, '09:00');
  assert.strictEqual(p.lead.responsavel_nome, 'Gabriel');
  assert.ok(p.proximos.some(x => x.cod === 'extra') && p.proximos.some(x => x.cod === 'agendar'));
  assert.ok(p.situacao.length >= 3);
  assert.strictEqual(p.tarefas_abertas, 1);
  assert.ok(p.timeline.length === 2);
  const u = new URL(p.links.novo_orcamento.replace('#/cotacao?', 'cotacao?'));
  assert.ok(p.links.novo_orcamento.includes('#/cotacao?origem=atendimento'));
  assert.strictEqual(u.searchParams.get('tel'), '5512988660661');
  assert.strictEqual(u.searchParams.get('placa'), 'ABC1D23');
  assert.strictEqual((await r6.painelCliente('lixo')).status, 400);
  assert.strictEqual((await r6.painelCliente('bbb965a4-65e0-4562-a1b0-952466991b2c')).status, 404);
});

test('painel: se o r6_cliente_360 falhar, ainda devolve o cliente com aviso', async () => {
  const { sb } = montar({ clientes: [{ id: CLI, nome: 'Maria', telefone: '5512988660661', telefone_e164: '5512988660661' }] });
  const p = await criarR6({ sb, agora: () => AGORA, log: () => {} }).painelCliente(CLI);
  assert.ok(p.ok && p.aviso && p.orcamentos.length === 0 && p.links.novo_orcamento);
});

test('estado da IA: situação, motivo do humano e quantas ações sozinhas', async () => {
  const { sb, r6 } = montar({
    ia_acoes: [
      { id: 'a1', conversa_id: CONV, tipo: 'copiloto', status: 'executada', entrada: { funil: { humano: 'preco' } }, saida: { enviadas: ['x'] }, created_at: iso(5), perfil_id: null },
      { id: 'a2', conversa_id: CONV, tipo: 'responder', status: 'executada', perfil_id: null, created_at: iso(5) },
      { id: 'a3', conversa_id: CONV, tipo: 'agendar', status: 'proposta', perfil_id: null, created_at: iso(4) },
    ],
    at_ia_fila: [],
  });
  const e = await r6.estadoIA(CONV, { config: { ativo: true, funil_ativo: true } });
  assert.strictEqual(e.situacao, 'ligada');
  assert.strictEqual(e.humano.cod, 'preco');
  assert.strictEqual(e.sozinhas, 1); assert.strictEqual(e.esperando_clique, 1);
  sb.db.conversas.find(c => c.id === CONV).assumida_em = iso(1);
  assert.strictEqual((await r6.estadoIA(CONV, {})).situacao, 'humano_assumiu');
  assert.strictEqual((await r6.estadoIA(CONV, { config: { ativo: false } })).situacao, 'desligada');
});

test('resolver fora: a nota perde quebra de linha e caractere de controle, e é cortada em 120', async () => {
  const { sb, r6 } = montar();
  const id = '88b965a4-65e0-4562-a1b0-952466991b2c';
  const nada = await r6.resolverFora({ mensagemId: '99b965a4-65e0-4562-a1b0-952466991b2c', perfil: { id: 'p', nome: 'Ana' }, nota: 'x' });
  assert.strictEqual(nada.ok, false, 'mensagem que não existe');
  sb.db.whatsapp_mensagens.push({ id, conversa_id: CONV2, direcao: 'saida', corpo: 'z', status: 'falhou', erro: 'WhatsApp parado', created_at: iso(5) });
  const ok = await r6.resolverFora({ mensagemId: id, perfil: { id: 'p', nome: 'Ana\nMaria' }, nota: 'liguei\r\n\u0007para ele ' + 'a'.repeat(300) });
  assert.ok(ok.ok);
  const e = sb.db.whatsapp_mensagens.find((m) => m.id === id).erro;
  assert.ok(!/[\n\r\u0007]/.test(e), JSON.stringify(e));
  assert.ok(e.startsWith('Resolvido fora do WhatsApp por Ana Maria: liguei para ele'), e);
  assert.ok(e.length <= 'Resolvido fora do WhatsApp por Ana Maria: '.length + 120);
});

test('painel: "link visto" vem da própria OS (o r6_cliente_360 não traz) e some o aviso de mandar o link', async () => {
  const mk = (visto) => {
    const r360 = { patio: [{ id: OS, numero: 7, etapa: 'em_execucao', veiculo: 'Onix', link_cliente: 'https://indycar-patio.netlify.app/acompanhar/?t=' + 'b'.repeat(32) }] };
    const { sb } = montar({ clientes: [{ id: CLI, nome: 'Maria', telefone: '5512988660661', telefone_e164: '5512988660661' }],
      patio_os: [{ id: OS, numero: 7, etapa: 'em_execucao', etapa_em: iso(40), cliente_id: CLI, telefone: '12988660661', link_visto_em: visto }] },
    { rpc: { r6_cliente_360: () => ({ data: r360, error: null }) } });
    return criarR6({ sb, agora: () => AGORA, log: () => {} }).painelCliente(CLI);
  };
  const nunca = await mk(null);
  assert.strictEqual(nunca.patio.link_visto_em, null);
  assert.ok(nunca.proximos.some((x) => x.cod === 'link'), 'ainda não abriu: sugere mandar o link');
  const visto = await mk(iso(10));
  assert.ok(visto.patio.link_visto_em);
  assert.ok(!visto.proximos.some((x) => x.cod === 'link'), 'já abriu: não pede para mandar de novo');
});

test('painel: eventos do orçamento (conexão, enviado, aprovado, recusado) entram na linha do tempo; outros tipos ficam de fora', async () => {
  const OID = '88b965a4-65e0-4562-a1b0-952466991b2c';
  const r360 = { orcamentos: [{ id: OID, numero: 12, status: 'enviado', total: 500, created_at: iso(900) }], linha_do_tempo: [] };
  const { sb } = montar({ clientes: [{ id: CLI, nome: 'Maria', telefone: '5512988660661', telefone_e164: '5512988660661' }],
    orc_eventos: [
      { id: 1, orcamento_id: OID, tipo: 'conexao', created_at: iso(30) },
      { id: 2, orcamento_id: OID, tipo: 'enviado', created_at: iso(60) },
      { id: 3, orcamento_id: OID, tipo: 'editado', created_at: iso(10) },
    ] }, { rpc: { r6_cliente_360: () => ({ data: r360, error: null }) } });
  const p = await criarR6({ sb, agora: () => AGORA, log: () => {} }).painelCliente(CLI);
  assert.deepStrictEqual(p.eventos_orcamento.map((e) => e.evento), ['conexao', 'enviado']);
  assert.match(p.eventos_orcamento[0].titulo, /Orçamento nº 12 conectado a esta conversa/);
  assert.ok(p.timeline.some((e) => /enviado ao cliente/.test(e.titulo)));
});
