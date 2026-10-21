'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('../public/r6-regras.js');
const { criarZap } = require('../lib/zap-estado.js');

test('guarda de preço pega dinheiro em vários jeitos e deixa passar números que não são dinheiro', () => {
  for (const t of ['fica R$ 120', 'R$90', 'trezentos reais', 'três mil reais', '3x de 120', '1.200,50', 'sai por 350,', '2 mil', 'custa 450', 'dou desconto de 10%', 'pix 80 reais', '150 conto'])
    assert.ok(R.textoTemPreco(t), t);
  for (const t of ['12 meses de garantia', 'cerca de 30 minutos', 'às 9h30', 'Av. Bandeirantes, 875', 'o carro tem 80 mil km', 'em até 10x sem juros', 'vamos às 14:00'])
    assert.ok(!R.textoTemPreco(t), t);
});

test('o que o cliente pediu: acento e caixa não atrapalham', () => {
  assert.deepStrictEqual(R.oQueOClientePediu(['Quanto CUSTA o alinhamento?']), ['preco']);
  assert.ok(R.oQueOClientePediu(['meu carro já ficou pronto?']).includes('estado_carro'));
  assert.ok(R.oQueOClientePediu(['amanhã posso ir?']).includes('horario'));
  assert.ok(R.oQueOClientePediu(['SOCORRO parou na estrada']).includes('urgencia'));
  assert.ok(R.oQueOClientePediu(['pode ligar pra mim?']).includes('ligacao'));
  assert.ok(R.oQueOClientePediu(['preciso da nota fiscal']).includes('nota_fiscal'));
  assert.deepStrictEqual(R.oQueOClientePediu(['Obrigado!']), ['agradecimento']);
  assert.deepStrictEqual(R.oQueOClientePediu(['👍']), ['agradecimento']);
  assert.ok(R.oQueOClientePediu(['[áudio]']).includes('so_midia'));
  assert.deepStrictEqual(R.oQueOClientePediu(['']), []);
});

test('motivo para passar a gente segue a ordem: urgência > reclamação > pessoa > valor', () => {
  assert.strictEqual(R.motivoParaHumano(['quanto custa? socorro estou parado']), 'urgencia');
  assert.strictEqual(R.motivoParaHumano(['quero falar com o gerente']), 'pessoa');
  assert.strictEqual(R.motivoParaHumano(['quanto fica?']), 'preco');
  assert.strictEqual(R.motivoParaHumano(['[áudio]']), 'so_midia');
  assert.strictEqual(R.motivoParaHumano(['bom dia, tem horário amanhã?']), null);
});

test('pontuação: urgência vence espera; fixada sobe; adiada desce; disparo fica de fora', () => {
  const agora = new Date('2026-10-21T15:00:00Z');
  const base = { id: 'a', nao_lidas: 1, ultima_mensagem_em: '2026-10-21T14:50:00Z', atribuida_a: null };
  const urg = R.pontuarConversa(base, { sem_resposta: true, pedidos: ['urgencia'] }, { agora });
  assert.strictEqual(urg.nivel, 'agora');
  assert.ok(urg.motivos[0].cod === 'urgencia');
  const normal = R.pontuarConversa(base, { sem_resposta: true, pedidos: ['horario'] }, { agora });
  assert.ok(urg.pontos > normal.pontos);
  assert.ok(R.pontuarConversa(base, {}, { agora, fixada: true }).pontos > 400);
  assert.ok(R.pontuarConversa(base, {}, { agora, adiadaAte: '2026-10-21T18:00:00Z' }).pontos < 0);
  assert.ok(R.pontuarConversa({ ...base, tipo: 'disparo' }, {}, { agora }).fora);
  const pronto = R.pontuarConversa({ ...base, nao_lidas: 0 }, { patio: { etapa: 'pronto' } }, { agora });
  assert.ok(pronto.motivos.some(m => m.cod === 'carro_pronto'));
  const colega = R.pontuarConversa({ ...base, atribuida_a: 'x' }, {}, { agora, meuId: 'eu' });
  assert.ok(colega.motivos.some(m => m.cod === 'de_colega'));
});

test('ordenar e próxima da fila ignoram conversa de colega', () => {
  const agora = new Date('2026-10-21T15:00:00Z');
  const lista = [
    { id: '1', nao_lidas: 1, ultima_mensagem_em: '2026-10-21T14:00:00Z', atribuida_a: 'colega' },
    { id: '2', nao_lidas: 1, ultima_mensagem_em: '2026-10-21T14:55:00Z', atribuida_a: null },
    { id: '3', nao_lidas: 0, ultima_mensagem_em: '2026-10-21T14:58:00Z', atribuida_a: null },
  ];
  const m = R.ordenarPorPrioridade(lista, { 1: { sem_resposta: true, pedidos: ['urgencia'] }, 2: { sem_resposta: true, pedidos: ['preco'] } }, { agora, meuId: 'eu' });
  assert.strictEqual(R.proximaDaFila(m, { meuId: 'eu' }).c.id, '2');
  assert.ok(R.resumoDaFila(m).texto.length > 0);
});

test('orçamento: situação, vencido e o que mais importa', () => {
  const agora = new Date('2026-10-21T15:00:00Z');
  assert.strictEqual(R.situacaoOrcamento({ status: 'aprovado' }, agora).cod, 'aprovado_sem_horario');
  assert.strictEqual(R.situacaoOrcamento({ status: 'aprovado', agendamento_id: 'x' }, agora).cod, 'aprovado');
  assert.strictEqual(R.situacaoOrcamento({ status: 'enviado', enviado_em: '2026-10-18T10:00:00Z' }, agora).cod, 'parado');
  assert.strictEqual(R.situacaoOrcamento({ status: 'enviado', enviado_em: '2026-10-21T14:00:00Z', validade: '2026-10-20' }, agora).cod, 'vencido');
  assert.strictEqual(R.situacaoOrcamento({ status: 'enviado', enviado_em: '2026-10-21T10:00:00Z', visualizado_em: '2026-10-21T11:00:00Z' }, agora).cod, 'visualizado');
  const p = R.orcamentoQueImporta([{ id: 'a', status: 'enviado', enviado_em: '2026-10-21T14:00:00Z' }, { id: 'b', status: 'aprovado' }], agora);
  assert.strictEqual(p.id, 'b');
});

test('links: Orçador recebe cliente/tel/nome/carro/placa limpos; sem cliente nem telefone não há link', () => {
  const id = '0bf5de3c-669d-41db-a0f8-6f76343a490b';
  const l = R.linkNovoOrcamento({ clienteId: id, telefone: '5512988660661', nome: 'João <b>', carro: 'Onix 2019', placa: 'abc-1d23' });
  const u = new URL(l);
  assert.strictEqual(u.searchParams.get('cliente'), id);
  assert.strictEqual(u.searchParams.get('tel'), '12988660661');
  assert.strictEqual(u.searchParams.get('nome'), 'João b');
  assert.strictEqual(u.searchParams.get('placa'), 'ABC1D23');
  assert.strictEqual(R.linkNovoOrcamento({ nome: 'x' }), null);
  assert.strictEqual(R.linkNovoOrcamento({ clienteId: 'lixo', telefone: '123' }), null);
  assert.strictEqual(R.linkOrcamento(id), `https://indycar-orcador.netlify.app/#/historico/${id}`);
  assert.strictEqual(R.linkOrcamento('../x'), null);
  assert.strictEqual(R.relCrmLead(id), `/?lead=${id}`);
  assert.strictEqual(R.relAgendamento('nao'), null);
});

test('trilha do pátio e progresso do funil', () => {
  const p = R.passosDoPatio('em_execucao');
  assert.deepStrictEqual(p.map(x => x.estado), ['feito', 'feito', 'feito', 'atual', 'futuro', 'futuro', 'futuro']);
  assert.strictEqual(R.passosDoPatio('aguardando_peca').find(x => x.estado === 'atual').cod, 'em_execucao');
  assert.strictEqual(R.progressoDoFunil({}).falta, 'carro');
  assert.strictEqual(R.progressoDoFunil({ cliente: { carro_modelo: 'Gol' } }).falta, 'servico');
  assert.strictEqual(R.progressoDoFunil({ cliente: { carro_modelo: 'Gol' }, leadAberto: { servico: 'óleo' } }).falta, 'horario');
  assert.ok(R.progressoDoFunil({ cliente: { carro_modelo: 'Gol' }, leadAberto: { servico: 'óleo' }, agendamentos: { futuros: [{}] } }).completo);
});

test('respostas rápidas: sem preço, sem vocabulário proibido, uma pergunta, usam o pátio real', () => {
  const pedidosTodos = Object.keys(R.ROTULO_PEDIDO).concat(['urgencia', 'reclamacao', 'pessoa', 'ligacao', 'preco', 'so_midia', 'agradecimento']);
  const ficha = { nome: 'Maria Silva', carro: 'Onix 2019', horarios: ['quinta às 9h', 'sexta às 14h'], patio: { etapa: 'em_execucao', etapa_rotulo: 'Em execução' }, orc: { numero: 12, rotulo: 'Enviado ao cliente' } };
  for (const p of pedidosTodos) {
    for (const r of R.respostasRapidas([p], ficha)) {
      assert.ok(!R.textoTemPreco(r.texto), `${p}: ${r.texto}`);
      assert.ok(!/prezado|efetuar|comparecer|ve[íi]culo/i.test(r.texto), r.texto);
      assert.ok((r.texto.match(/\?/g) || []).length <= 1, `${p}: perguntas demais`);
    }
  }
  const andamento = R.respostasRapidas(['estado_carro'], ficha)[0];
  assert.ok(/Em execução/.test(andamento.texto) && andamento.acao === 'colar-link-patio');
  assert.ok(/pronto/i.test(R.respostasRapidas(['estado_carro'], { ...ficha, patio: { etapa: 'pronto' } })[0].texto));
  assert.ok(/não achei/.test(R.respostasRapidas(['estado_carro'], { nome: 'Ana' })[0].texto));
  assert.ok(/fora do horário/.test(R.respostasRapidas(['urgencia'], { ...ficha, foraDoHorario: true })[0].texto));
  assert.ok(R.respostasRapidas([], {}).length === 1);
});

test('encaminhamento do sistema nunca cita preço e avisa fora do expediente', () => {
  for (const m of ['urgencia', 'reclamacao', 'pessoa', 'preco', 'so_midia', 'nota_fiscal', 'cancelar', 'x']) {
    assert.ok(!R.textoTemPreco(R.textoDeEncaminhamento(m, 'Ana', true)));
    assert.ok(/fora do horário/.test(R.textoDeEncaminhamento(m, 'Ana', true)));
    assert.ok(!/fora do horário/.test(R.textoDeEncaminhamento(m, 'Ana', false)));
  }
});

test('oficina aberta: seg–sáb 8h–17h30 (São Paulo)', () => {
  assert.ok(R.oficinaAberta(new Date('2026-10-21T15:00:00Z')).aberta);
  assert.strictEqual(R.oficinaAberta(new Date('2026-10-21T21:00:00Z')).reabre, 'amanhã às 8h');
  assert.strictEqual(R.oficinaAberta(new Date('2026-10-25T15:00:00Z')).reabre, 'segunda às 8h');
  assert.strictEqual(R.oficinaAberta(new Date('2026-10-21T09:00:00Z')).reabre, 'hoje às 8h');
});

test('mensagens que não saíram: separa "sem confirmação" das demais', () => {
  const agora = new Date('2026-10-21T15:00:00Z');
  const c = R.classificarNaoSairam([
    { direcao: 'saida', status: 'falhou', erro: 'Sem confirmação: x', created_at: '2026-10-21T14:00:00Z' },
    { direcao: 'saida', status: 'falhou', erro: 'WhatsApp parado', created_at: '2026-10-21T14:30:00Z' },
    { direcao: 'saida', status: 'enviado' }, { direcao: 'entrada', status: 'falhou' }], agora);
  assert.strictEqual(c.total, 2); assert.strictEqual(c.sem_confirmacao.length, 1); assert.strictEqual(c.nao_saiu[0].ha_min, 30);
  assert.ok(/chave/.test(R.textoWhatsappParado('codewords-401')));
});

test('disjuntor do WhatsApp: para, deixa uma sondagem, volta quando dá certo', () => {
  let t = 0; const z = criarZap({ agora: () => t, sondagemMs: 30_000 });
  assert.ok(z.passar().tentar);
  assert.ok(!z.marcar('http-500'));
  assert.ok(z.marcar('codewords-401'));
  assert.ok(!z.passar().tentar); assert.ok(/chave/.test(z.passar().texto));
  t = 31_000;
  const s = z.passar(); assert.ok(s.tentar && s.sondagem);
  assert.ok(!z.passar().tentar, 'só uma sondagem por vez');
  z.marcar('codewords-401'); t = 70_000;
  assert.ok(z.passar().tentar);
  z.limpar(); assert.ok(z.passar().tentar && !z.estado().parado);
});
