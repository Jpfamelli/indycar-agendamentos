/* Lógica pura da segunda parte da tela (frente T3b): leitor do fluxo do Gestor IA,
   interpretador de formatação, classificação das campanhas e mapa de dia e hora. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarLeitorDeEventos, interpretar, olhando, lerFluxo } from '../js/fluxo.js';
import { blocosDoTexto, partesDaLinha, montarBlocos } from '../js/formatacao.js';
import {
  ordenar, classificar, distancia, criterioEfetivo, criteriosComDado, plataformaContraOficina,
  montarMapa, nivelDaCelula, descreverCelula,
} from '../js/campanhas-logica.js';

/* ------------------------------ fluxo de eventos ------------------------------ */

test('fluxo: evento cortado no meio da linha só sai quando o bloco termina', () => {
  const l = criarLeitorDeEventos();
  assert.deepEqual(l.empurrar('event: tex'), []);
  assert.deepEqual(l.empurrar('to\ndata: {"texto":"Ol'), []);
  assert.deepEqual(l.empurrar('á"}\n'), []);
  const saida = l.empurrar('\n');
  assert.equal(saida.length, 1);
  assert.deepEqual(interpretar(saida[0]), { tipo: 'texto', texto: 'Olá' });
});

test('fluxo: "\\r\\n" partido entre dois pedaços não vira linha em branco a mais', () => {
  const l = criarLeitorDeEventos();
  const a = l.empurrar('event: ferramenta\r');
  const b = l.empurrar('\ndata: {"nome":"campanhas"}\r\n\r\n');
  assert.equal(a.length + b.length, 1);
  assert.deepEqual(interpretar(b[0]), { tipo: 'ferramenta', nome: 'campanhas', rotulo: null });
});

test('fluxo: comentário é ignorado, várias linhas de dado se juntam, fim solta o último bloco', () => {
  const l = criarLeitorDeEventos();
  const s = l.empurrar(': mantendo viva\n\nevent: texto\ndata: "linha 1\ndata: linha 2"\n');
  assert.deepEqual(s, []);
  const fim = l.fim();
  assert.equal(fim.length, 1);
  assert.equal(fim[0].dados, '"linha 1\nlinha 2"');
});

test('fluxo: evento desconhecido não quebra; erro traz a frase; fim traz a conversa', () => {
  assert.deepEqual(interpretar({ evento: 'pensando', dados: '{}' }), { tipo: 'desconhecido', evento: 'pensando' });
  assert.deepEqual(interpretar({ evento: 'erro', dados: '{"erro":"O modelo não respondeu.","codigo":"modelo","conversa_id":"c-9"}' }), { tipo: 'erro', mensagem: 'O modelo não respondeu.', codigo: 'modelo', conversa_id: 'c-9' });
  assert.equal(interpretar({ evento: 'erro', dados: '' }).mensagem, 'A resposta parou no meio.');
  assert.deepEqual(interpretar({ evento: 'fim', dados: '{"conversa_id":42,"uso":{"entrada":10}}' }), { tipo: 'fim', conversa_id: '42', uso: { entrada: 10 }, parou: 'fim', aviso: null });
  // API-gestor.md: "parou" diz se a resposta foi cortada; "aviso" quando a conversa não pôde ser guardada.
  assert.deepEqual(interpretar({ evento: 'fim', dados: '{"conversa_id":null,"parou":"max_tokens","aviso":"As conversas ainda não ficam guardadas."}' }),
    { tipo: 'fim', conversa_id: null, uso: null, parou: 'max_tokens', aviso: 'As conversas ainda não ficam guardadas.' });
  assert.equal(interpretar({ evento: 'proposta', dados: '{"proposta":{"id":"a1","titulo":"Pausar"}}' }).proposta.id, 'a1');
  // Sem "event:", o tipo pode vir dentro do JSON.
  assert.deepEqual(interpretar({ evento: 'message', dados: '{"tipo":"texto","texto":"oi"}' }), { tipo: 'texto', texto: 'oi' });
  // Texto cru (sem JSON), inclusive um número solto, continua texto.
  assert.deepEqual(interpretar({ evento: 'texto', dados: '3' }), { tipo: 'texto', texto: '3' });
  assert.deepEqual(interpretar({ evento: 'texto', dados: 'sem aspas' }), { tipo: 'texto', texto: 'sem aspas' });
});

test('fluxo: o que o Gestor está olhando, em palavras do dono', () => {
  assert.equal(olhando({ nome: 'campanhas' }), 'olhando as campanhas…');
  assert.equal(olhando({ nome: 'x', rotulo: 'Lendo a agenda...' }), 'lendo a agenda…');
  assert.equal(olhando({}), 'consultando os números…');
});

test('fluxo: lerFluxo lê um corpo de verdade em pedaços cortados', async () => {
  const bytes = new TextEncoder().encode('event: texto\ndata: {"texto":"Cada R$ 1 "}\n\nevent: texto\ndata: {"texto":"virou R$ 4"}\n\nevent: fim\ndata: {"conversa_id":"c1"}\n\n');
  const corpo = new ReadableStream({
    start(c) { for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7)); c.close(); },
  });
  const vistos = [];
  await lerFluxo(corpo, (e) => vistos.push(e));
  assert.equal(vistos.filter((e) => e.tipo === 'texto').map((e) => e.texto).join(''), 'Cada R$ 1 virou R$ 4');
  assert.equal(vistos[vistos.length - 1].conversa_id, 'c1');
});

/* ------------------------------ formatação ------------------------------ */

test('formatação: parágrafo, lista e negrito', () => {
  const b = blocosDoTexto('A campanha **Óleo** traz contato barato.\n\n- Custo por contato: R$ 38\n- Fecharam 6\n\n1. Pausar\n2. Medir em 7 dias');
  assert.equal(b.length, 3);
  assert.deepEqual(b[0].partes, [{ texto: 'A campanha ', forte: false }, { texto: 'Óleo', forte: true }, { texto: ' traz contato barato.', forte: false }]);
  assert.equal(b[1].tipo, 'lista');
  assert.equal(b[1].ordenada, false);
  assert.equal(b[1].itens.length, 2);
  assert.equal(b[2].ordenada, true);
});

test('formatação: texto hostil não vira marcação, asterisco solto fica como está', () => {
  const hostil = '<img src=x onerror=alert(1)> **<b>oi</b>** e <script>alert(2)</script> **sem fim';
  const b = blocosDoTexto(hostil);
  const juntado = b[0].partes.map((p) => p.texto).join('');
  assert.ok(juntado.includes('<img src=x onerror=alert(1)>'));
  assert.ok(juntado.includes('<script>alert(2)</script>'));
  assert.ok(juntado.endsWith('**sem fim'));
  assert.deepEqual(b[0].partes.find((p) => p.forte), { texto: '<b>oi</b>', forte: true });
  // A montagem só cria nós com o texto como filho de texto (o h falso registra o que recebeu).
  const criados = [];
  const hFalso = (tag, props, ...filhos) => { criados.push({ tag, filhos: filhos.flat(3) }); return { tag, filhos: filhos.flat(3) }; };
  montarBlocos(b, hFalso);
  assert.deepEqual(criados.map((c) => c.tag).sort(), ['p', 'strong']);
  assert.ok(criados.every((c) => c.filhos.every((f) => typeof f === 'string' || (f && f.tag))));
  assert.deepEqual(partesDaLinha('****'), [{ texto: '****', forte: false }]);
});

test('formatação: título com # vira parágrafo em negrito; linha recuada continua o item', () => {
  const b = blocosDoTexto('## Resumo\n- Primeiro ponto\n  que continua aqui\nDepois.');
  assert.deepEqual(b[0], { tipo: 'paragrafo', partes: [{ texto: 'Resumo', forte: true }] });
  assert.equal(b[1].itens[0].map((p) => p.texto).join(''), 'Primeiro ponto que continua aqui');
  assert.equal(b[2].tipo, 'paragrafo');
});

/* ------------------------------ classificação ------------------------------ */

const CAMPANHAS = [
  { nome: 'Freios', plataforma: 'meta', retorno: 2.1, custo_por_servico: 210, custo_por_contato: 52, contatos: 9, gasto: 900 },
  { nome: 'Óleo', plataforma: 'meta', retorno: 4.55, custo_por_servico: 150, custo_por_contato: 40, contatos: 22, gasto: 900 },
  { nome: 'Busca', plataforma: 'google', retorno: null, custo_por_servico: null, custo_por_contato: 61.3, contatos: 7, gasto: 429 },
  { nome: 'Revisão', plataforma: 'meta', retorno: 2.1, custo_por_servico: 300, custo_por_contato: 70, contatos: 12, gasto: 600 },
];

test('classificação: retorno maior na frente, sem número no fim, empate por contatos', () => {
  assert.deepEqual(ordenar(CAMPANHAS, 'retorno').map((c) => c.nome), ['Óleo', 'Revisão', 'Freios', 'Busca']);
  assert.deepEqual(ordenar(CAMPANHAS, 'custo_servico').map((c) => c.nome), ['Óleo', 'Freios', 'Revisão', 'Busca']);
  assert.deepEqual(ordenar(CAMPANHAS, 'contatos').map((c) => c.nome), ['Óleo', 'Revisão', 'Freios', 'Busca']);
  const c = classificar(CAMPANHAS, 'retorno');
  assert.deepEqual(c.map((x) => x.posicao), [1, 2, 3, null]);
});

test('classificação: distância para a primeira em palavras', () => {
  const [oleo, freios] = ordenar(CAMPANHAS, 'custo_contato');
  assert.equal(distancia(oleo, oleo, 'custo_contato').texto, 'Primeira da classificação');
  assert.equal(distancia(freios, oleo, 'custo_contato').texto, 'R$ 12 a mais por contato que a primeira');
  assert.equal(distancia(CAMPANHAS[0], CAMPANHAS[1], 'retorno').texto, 'Cada R$ 1 virou R$ 2,45 a menos que na primeira');
  assert.equal(distancia(CAMPANHAS[0], CAMPANHAS[3], 'retorno').texto, 'Empatada com a primeira');
  assert.equal(distancia(CAMPANHAS[2], CAMPANHAS[1], 'retorno').tipo, 'sem_dado');
  assert.equal(distancia(CAMPANHAS[0], CAMPANHAS[1], 'contatos').texto, '13 contatos a menos que a primeira');
});

test('classificação: sem conta ligada (tudo null) cai em contatos; critério sem dado some', () => {
  const semConta = [{ nome: 'A', contatos: 3, retorno: null, gasto: null }, { nome: 'B', contatos: 5, retorno: null, gasto: null }];
  assert.deepEqual(criteriosComDado(semConta).map((c) => c.id), ['contatos']);
  assert.equal(criterioEfetivo('retorno', semConta).id, 'contatos');
  assert.equal(criterioEfetivo('gasto', CAMPANHAS).id, 'gasto');
  assert.equal(criterioEfetivo('inventado', CAMPANHAS).id, 'retorno');
  assert.equal(criterioEfetivo('retorno', []).id, 'contatos');
});

test('plataforma contra oficina: a diferença dita em frase', () => {
  assert.equal(plataformaContraOficina({ plataforma: 'meta', contatos_plataforma: 30, contatos: 22 }).texto, 'A Meta conta 30 conversas; chegaram 22.');
  assert.equal(plataformaContraOficina({ plataforma: 'google', contatos_plataforma: 1.5, contatos: 1 }).texto, 'O Google conta 1,5 conversões; chegou 1.');
  assert.equal(plataformaContraOficina({ plataforma: 'meta', contatos_plataforma: null, contatos: 3 }), null);
  assert.equal(plataformaContraOficina({ plataforma: 'meta', contatos_plataforma: 4, contatos: 6 }).sobra, true);
});

/* ------------------------------ mapa de dia e hora ------------------------------ */

test('mapa: monta a grade, nível pela proporção do maior, null não vira zero', () => {
  const m = montarMapa({ dias: ['seg', 'sab'], horas: [7, 8, 9], celulas: [[0, 4, null], [1, 2, 8]], pico: 'sab 09h' });
  assert.equal(m.celulas.length, 6);
  assert.equal(m.maior, 8);
  assert.equal(m.total, 15);
  assert.deepEqual(m.celulas.map((c) => c.nivel), [0, 2, 0, 1, 1, 4]);
  assert.equal(m.celulas[2].n, null);
  assert.equal(m.dias[1].rotulo, 'sáb');
  assert.equal(descreverCelula(m.celulas[5]), 'sábado, 9h: 8 contatos');
  assert.equal(descreverCelula(m.celulas[0]), 'segunda, 7h: nenhum contato');
  assert.equal(descreverCelula(m.celulas[2]), 'segunda, 9h: sem dado');
  assert.equal(nivelDaCelula(3, 0), 0);
  assert.equal(montarMapa({ dias: 'x' }), null);
  assert.equal(montarMapa({ dias: [], horas: [], celulas: [] }).vazio, true);
});

/* ------------------------------ propostas e diário ------------------------------ */
import { lerAcao, veredito, quemFaz, antesEDepois, separar, perguntasProntas } from '../js/acoes-logica.js';
import { avisoDoEstado } from '../js/aviso.js';

test('propostas: evidência no formato da tabela (itens, risco) e em lista simples dão a mesma forma', () => {
  const daTabela = lerAcao({ id: 7, tipo: 'aumentar_verba', status: 'proposta', titulo: 'Subir a verba', alvo: { plataforma: 'meta', nome: 'Óleo' },
    evidencias: { itens: [{ fonte: 'campanhas', dado: 'custo por contato R$ 31 em 30 dias', valor: 31 }], verba: { atual: 50, nova: 70, por: 'dia' }, risco: 'alto', risco_motivo: 'Risco alto: aumento de 40%, acima de 30%.' } });
  assert.equal(daTabela.id, '7');
  assert.equal(daTabela.risco, 'alto');
  assert.equal(daTabela.riscoMotivo, 'Aumento de 40%, acima de 30%.');
  assert.deepEqual(daTabela.evidencias, ['custo por contato R$ 31 em 30 dias']);
  assert.deepEqual(daTabela.verba, { atual: 50, nova: 70, por: 'dia' });
  const daLista = lerAcao({ id: 'x', tipo: 'pausar', status: 'aceita', risco: 'baixo', evidencias: ['R$ 319 e nenhum serviço', { texto: 'custo R$ 64' }, { rotulo: 'Contatos', valor: 9, periodo: '12/11 a 18/11' }, null, 3] });
  assert.deepEqual(daLista.evidencias, ['R$ 319 e nenhum serviço', 'custo R$ 64', 'Contatos: 9 (12/11 a 18/11)']);
  assert.equal(daLista.titulo, 'Pausar');
  assert.equal(daLista.statusTexto.texto, 'Aceita, falta fazer');
  assert.equal(lerAcao(null), null);
  assert.equal(lerAcao({ id: 1, status: 'inventado' }).status, 'proposta');
});

test('propostas: deixa claro que nada é feito sozinho e onde a pessoa faz', () => {
  assert.match(quemFaz(lerAcao({ id: 1, alvo: { plataforma: 'google' } })), /Nada é feito sozinho.*no Google Ads\./);
  assert.match(quemFaz(lerAcao({ id: 1, alvo: { plataforma: 'meta' } })), /Gerenciador de Anúncios da Meta/);
  assert.match(quemFaz(lerAcao({ id: 1, alvo: {} })), /Quem faz é você\./);
});

test('diário: veredito por extenso ou por código, desconhecido sem cor de julgamento', () => {
  assert.equal(veredito('sem diferença clara').id, 'sem_diferenca');
  assert.equal(veredito('sem_diferenca').texto, 'Sem diferença clara');
  assert.equal(veredito('Não deu para medir.').id, 'nao_mediu');
  assert.equal(veredito('melhorou').tom, 'bom');
  assert.equal(veredito('piorou').tom, 'grave');
  assert.deepEqual(veredito('meio a meio'), { id: 'outro', tom: 'neutro', texto: 'Meio a meio', icone: 'ponto' });
  assert.equal(veredito(null), null);
});

test('diário: antes e depois só com as medidas conhecidas; separa o que pede decisão', () => {
  const linhas = antesEDepois({ contatos: 9, custo_por_contato: 58, periodo: '27/10 a 02/11', coisa: 1 }, { contatos: 12, custo_por_contato: 41 });
  assert.deepEqual(linhas.map((l) => [l.id, l.antes, l.depois]), [['contatos', 9, 12], ['custo_por_contato', 58, 41]]);
  assert.deepEqual(antesEDepois(null, null), []);
  const { abertas, diario } = separar([{ id: 1, status: 'proposta' }, { id: 2, status: 'aceita' }, { id: 3, status: 'feita' }, { id: 4, status: 'recusada' }]);
  assert.deepEqual(abertas.map((a) => a.id), ['1', '2']);
  assert.deepEqual(diario.map((a) => a.id), ['2', '3', '4']);
});

test('perguntas prontas mudam com a conta ligada', () => {
  assert.ok(perguntasProntas({ temConta: false }).includes('De onde vêm os contatos que fecham?'));
  assert.ok(perguntasProntas({ temConta: true }).includes('Qual campanha eu pauso?'));
  for (const lista of [perguntasProntas({ temConta: false }), perguntasProntas({ temConta: true }), perguntasProntas({ temContatos: false })]) {
    assert.ok(lista.length >= 3 && lista.length <= 5);
  }
});

test('aviso de resposta incompleta: frase pronta da API ou montada pelas leituras que falharam', () => {
  assert.equal(avisoDoEstado({ aviso: 'Não deu para ler agora: a agenda.' }), 'Não deu para ler agora: a agenda.');
  assert.equal(avisoDoEstado({ incompleto: [], reserva: false }), null);
  assert.equal(avisoDoEstado(null), null);
  assert.match(avisoDoEstado({ incompleto: ['agenda', 'agenda_capacidade', 'termos'] }), /^Não deu para ler agora: a agenda e as palavras-chave\./);
  assert.match(avisoDoEstado({ incompleto: [], reserva: true }), /só do cadastro/);
  assert.match(avisoDoEstado({ incompleto: ['coisa_nova'] }), /Uma parte desta tela/);
});

/* ------------------------------ formato do API-gestor.md §3 ------------------------------ */

test('ação no formato do API-gestor.md: rótulos do servidor valem, risco normal não vira selo, veredito por extenso', () => {
  const a = lerAcao({
    id: 'u-1', criada_em: '2026-11-19T13:10:30.000Z', origem: 'externa', origem_rotulo: 'IA de fora', autor: 'IA de fora: Claude Code do João',
    tipo: 'negativar_termo', tipo_rotulo: 'Bloquear um termo de busca', titulo: 'Bloquear "curso de mecânica"', porque: 'Gasta sem trazer contato.',
    alvo: { plataforma: 'google', nivel: 'campanha', ext: '2231', nome: 'Troca de óleo' }, alvo_rotulo: 'Google › campanha Troca de óleo',
    evidencias: [{ fonte: 'palavras_e_termos', dado: 'R$ 84 gastos e 0 contato com o termo', valor: 84 }],
    verba: null, risco: 'normal', risco_motivo: null, status: 'feita', status_rotulo: 'Feita', vence_em: null,
    medir_em: '2026-11-26',
    antes: { periodo: '05/11 a 11/11', base: 'campanha', base_rotulo: 'a campanha Troca de óleo', contatos: 9, custo_por_contato: 35.5, contatos_por_dia: 1.29, gasto_ligado: true, erro: null },
    depois: { periodo: '13/11 a 19/11', base: 'campanha', base_rotulo: 'a campanha Troca de óleo', contatos: 12, custo_por_contato: 28, contatos_por_dia: 1.71, gasto_ligado: true, erro: null },
    veredito: 'sem_diferenca', veredito_rotulo: 'Sem diferença clara', veredito_texto: 'Sem diferença clara: a mudança foi menor que 15%.',
  });
  assert.equal(a.nomeDoTipo, 'Bloquear um termo de busca');
  assert.equal(a.alvoRotulo, 'Google › campanha Troca de óleo');
  assert.equal(a.autor, 'IA de fora: Claude Code do João');
  assert.equal(a.risco, 'normal');
  assert.deepEqual(a.evidencias, ['R$ 84 gastos e 0 contato com o termo']);
  assert.equal(a.veredito.id, 'sem_diferenca');
  assert.equal(a.veredito.texto, 'Sem diferença clara');
  assert.equal(a.vereditoTexto, 'Sem diferença clara: a mudança foi menor que 15%.');
  assert.equal(a.venceEm, null);
  const linhas = antesEDepois(a.antes, a.depois);
  assert.deepEqual(linhas.map((l) => l.id), ['contatos', 'custo_por_contato', 'contatos_por_dia']);
  assert.equal(linhas[2].depois, 1.71);
});

test('ação esperando decisão: prazo de vencimento, rótulo do status e risco alto com o motivo', () => {
  const a = lerAcao({ id: 'u-2', tipo: 'aumentar_verba', status: 'proposta', status_rotulo: 'Esperando decisão', vence_em: '2026-12-03',
    risco: 'alto', risco_motivo: 'Aumento de 40%, acima de 30%.', verba: { atual: 50, nova: 70, por: 'dia' }, evidencias: [] });
  assert.equal(a.statusTexto.texto, 'Esperando decisão');
  assert.equal(a.venceEm, '2026-12-03');
  assert.equal(a.risco, 'alto');
  assert.equal(a.riscoMotivo, 'Aumento de 40%, acima de 30%.');
  assert.deepEqual(a.verba, { atual: 50, nova: 70, por: 'dia' });
  // Sem rótulo do servidor, o daqui (mesmas palavras do API-gestor.md).
  assert.equal(lerAcao({ id: 'x', status: 'expirada' }).statusTexto.texto, 'Expirou sem decisão');
  assert.equal(lerAcao({ id: 'x', tipo: 'trocar_criativo' }).nomeDoTipo, 'Trocar a imagem ou o vídeo');
  assert.equal(lerAcao({ id: 'x', origem: 'radar' }).autor, 'Radar');
});
