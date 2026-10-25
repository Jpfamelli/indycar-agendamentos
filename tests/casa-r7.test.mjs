// Casa (rodada 7, C1): regras puras de casa/logica4.js — PARAR, tarefas por origem, saúde dos sistemas, ligações, ficha, sino, busca, papéis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
await import('../casa/logica.js');
await import('../casa/logica2.js');
await import('../casa/logica3.js');
await import('../casa/logica4.js');
const L = globalThis.CasaLogica, M = globalThis.CasaLogica2, W = globalThis.CasaLogica3, N = globalThis.CasaLogica4;
const B = L.bases();
const ORIGEM = 'https://indycar-agendamentos.onrender.com';
const UUID = '11111111-1111-4111-8111-111111111111';

/* ---------------- telefone e PARAR ---------------- */
test('nacional: qualquer formato vira DDD+número; lixo vira vazio', () => {
  for (const v of ['(12) 99182-1234', '+55 12 99182-1234', '5512991821234', '12991821234', '012991821234']) assert.equal(N.nacional(v), '12991821234', v);
  assert.equal(N.nacional('1232211234'), '1232211234');
  for (const v of ['', null, undefined, 'abc', '123', '9918-1234']) assert.equal(N.nacional(v), '', String(v));
});
test('telefoneDoLinkWa: só link https://wa.me/ vale; outros hosts e javascript: não', () => {
  assert.equal(N.telefoneDoLinkWa('https://wa.me/5512991821234?text=Oi'), '12991821234');
  assert.equal(N.telefoneDoLinkWa('https://wa.me/5512991821234'), '12991821234');
  for (const v of ['https://evil.com/wa.me/5512991821234', 'http://wa.me/5512991821234', 'javascript:alert(1)', 'https://wa.me/abc', '', null]) assert.equal(N.telefoneDoLinkWa(v), '', String(v));
});
test('PARAR: cache de 5 min — livre, bloqueado, desconhecido e vencido', () => {
  const agora = 1_000_000;
  const cache = {};
  assert.equal(N.estadoParar(cache, '12991821234', agora).estado, 'desconhecido');
  N.guardarParar(cache, ['12991821234', '12988887777'], { 12988887777: 'optout' }, agora);
  assert.equal(N.estadoParar(cache, '(12) 99182-1234', agora + 1000).estado, 'livre');
  const b = N.estadoParar(cache, '5512988887777', agora + 1000);
  assert.equal(b.estado, 'bloqueado'); assert.equal(b.motivo, 'optout');
  assert.equal(N.estadoParar(cache, '12991821234', agora + N.VALIDADE_PARAR_MS + 1).estado, 'desconhecido', 'cache vencido pergunta de novo');
  assert.equal(N.estadoParar(cache, 'lixo', agora).estado, 'invalido');
});
test('PARAR: só consulta o que falta, sem repetir, sem lixo e no máximo 80', () => {
  const agora = 5;
  const cache = { 12991821234: { motivo: null, em: agora } };
  const falta = N.paraConsultar(['12991821234', '(12) 98888-7777', '5512988887777', 'lixo', ''], cache, agora);
  assert.deepEqual(falta, ['12988887777']);
  const muitos = Array.from({ length: 200 }, (_, i) => '1299000' + String(1000 + i));
  assert.equal(N.paraConsultar(muitos, {}, agora).length, 80);
  assert.deepEqual(N.paraConsultar(null, {}, agora), []);
});
test('PARAR: resposta estranha do banco nunca bloqueia por engano nem quebra', () => {
  const c = N.guardarParar({}, ['12991821234'], { 12991821234: '<script>' }, 1);
  assert.equal(c['12991821234'].motivo, null);
  assert.doesNotThrow(() => N.guardarParar({}, ['12991821234'], null, 1));
  assert.doesNotThrow(() => N.guardarParar({}, null, 'x', 1));
});
test('PARAR: textos explicam o motivo e quem religa', () => {
  assert.match(N.textoBloqueado('parar'), /respondeu PARAR/);
  assert.match(N.textoBloqueado('optout'), /não receber mensagens/);
  assert.match(N.textoBloqueado('qualquer'), /não receber mensagens/, 'motivo desconhecido cai no texto geral');
  assert.match(N.AVISO_PARAR_BLOQUEADO, /gestor/);
  assert.match(N.AVISO_PARAR_SEM_CONFERIR, /Abrir o WhatsApp mesmo assim\?/);
});

/* ---------------- tarefas ---------------- */
test('tarefas: todas as 12 origens aceitas pelo banco têm ícone e rótulo', () => {
  const origens = ['manual', 'atendimento', 'crm', 'agenda', 'comunicar', 'orcador', 'ia', 'automacao', 'ads', 'patio', 'site', 'area_cliente'];
  for (const o of origens) { const i = N.infoDaTarefa({ origem: o }); assert.ok(i.ico && i.origem, o); }
  assert.equal(N.infoDaTarefa({ origem: 'inventada' }).origem, 'minha', 'origem desconhecida cai em "minha"');
  assert.equal(N.infoDaTarefa({ origem: 'orcador' }).app, 'orcador');
});
test('tarefas do Orçador: o tipo vem de orc_tarefas e define ícone, selo e recado de WhatsApp', () => {
  const t = { origem: 'orcador' };
  const r = N.infoDaTarefa(t, { tipo: 'reabordar', orcamento_id: UUID });
  assert.equal(r.tipo.rotulo, 'Reabordar'); assert.equal(r.ico, '🔁'); assert.equal(r.orcamentoId, UUID); assert.equal(r.querWa, true);
  assert.equal(N.infoDaTarefa(t, { tipo: 'manual', orcamento_id: UUID }).querWa, false, 'tarefa manual do orçamento não oferece WhatsApp');
  assert.equal(N.infoDaTarefa(t, { tipo: 'reabordar', orcamento_id: 'x' }).orcamentoId, null, 'orcamento_id que não é UUID é ignorado');
  assert.equal(N.infoDaTarefa(t, { tipo: 'inventado', orcamento_id: UUID }).tipo, null);
  for (const k of ['reabordar', 'followup', 'sem_resposta', 'agendar', 'manual']) assert.ok(N.TIPOS_ORC_TAREFA[k].rotulo, k);
});
test('tarefas: filtro do Orçador e contagem de reabordar só olham tarefas abertas', () => {
  assert.equal(N.ehDoOrcador({ origem: 'orcador', status: 'aberta' }), true);
  assert.equal(N.ehDoOrcador({ origem: 'orcador', status: 'feita' }), false);
  assert.equal(N.ehDoOrcador({ origem: 'manual', status: 'aberta' }), false);
  const ts = [{ id: 'a', status: 'aberta' }, { id: 'b', status: 'aberta' }, { id: 'c', status: 'feita' }, { id: 'd', status: 'aberta' }];
  const ligas = { a: { tipo: 'reabordar' }, b: { tipo: 'followup' }, c: { tipo: 'reabordar' } };
  assert.equal(N.contarReabordar(ts, ligas), 1);
  assert.equal(N.contarReabordar(ts, null), 0);
});
test('tarefas: o link da descrição só vale se for de um app da casa; o texto sai sem o endereço', () => {
  const d = 'Recusou por preço há 8 dia(s). https://evil.com/x https://indycar-orcador.netlify.app/#/historico/' + UUID;
  assert.equal(N.linkDaDescricao(d, B, ORIGEM), 'https://indycar-orcador.netlify.app/#/historico/' + UUID);
  assert.equal(N.linkDaDescricao('só https://evil.com/x', B, ORIGEM), '');
  assert.equal(N.linkDaDescricao(null, B, ORIGEM), '');
  assert.doesNotMatch(N.descricaoLimpa(d), /https?:/);
  assert.ok(N.descricaoLimpa('x'.repeat(900)).length <= 220);
});
test('WhatsApp de reabordar: recado com nome e número do orçamento, sem "veículo" nem promessa de preço', () => {
  const t = W.mensagemWa('reabordar', { nome: 'MARCOS lima', numero: 12 });
  assert.match(t, /^Oi Marcos!/); assert.match(t, /#0012/); assert.doesNotMatch(t, /ve[ií]culo|prezado|efetuar|comparecer|R\$/i);
  assert.equal(W.acaoDaLinha('reabordar', { nome: 'A', telefone: '12991821234', numero: 3 }, '2026-10-25').rotulo, 'Reabordar');
  assert.equal(W.acaoDaLinha('reabordar', { nome: 'A', telefone: '123' }, '2026-10-25'), null, 'sem telefone válido não há botão');
});

/* ---------------- saúde dos sistemas ---------------- */
const sondaOk = { apps: { patio: { fora: false, suspeito: false }, orcador: { fora: false, suspeito: false } }, internos: { agenda: { ok: true }, crm: { ok: true } } };
const rpcOk = () => ({ whatsapp: { estado: 'ok' }, comunicar: { pausa_geral: false, fila: 0, falhas_24h: 0, enviadas_24h: 4, ultima_rodada_em: new Date().toISOString() }, movere: { ultima_carga: new Date().toISOString(), cargas: 3 }, vigia: [], patio_falhas_24h: 0 });
test('saúde: tudo certo vira "Todos os sistemas em ordem"', () => {
  const s = N.saudeSistemas({ rpc: rpcOk(), sonda: sondaOk });
  assert.equal(s.pior, 'ok'); assert.equal(s.problemas, 0);
  assert.equal(N.resumoDaSaude(s).texto, 'Todos os sistemas em ordem');
});
test('saúde: WhatsApp — cada estado do banco vira tom e plano B; chave recusada é problema', () => {
  for (const [estado, tom] of [['chave_recusada', 'ruim'], ['sem_chave', 'ruim'], ['sem_aparelho', 'ruim'], ['desconectado', 'ruim'], ['instabilidade', 'aviso'], ['limite', 'aviso'], ['ok', 'ok']]) {
    const r = rpcOk(); r.whatsapp = { estado, desde: new Date(Date.now() - 600000).toISOString() };
    const w = N.saudeSistemas({ rpc: r, sonda: sondaOk }).itens.find((i) => i.k === 'whatsapp');
    assert.equal(w.tom, tom, estado);
    if (tom !== 'ok') assert.ok(w.plano, 'plano B para ' + estado);
  }
});
test('saúde: código do monitor sem estado no banco ainda deixa o WhatsApp com problema (caso real de hoje)', () => {
  const r = rpcOk(); r.whatsapp = { estado: null }; r.vigia = ['tarefas-acumuladas', 'codewords-chave-recusada', 'notificacoes-acumuladas', 'e2e-falhou'];
  const s = N.saudeSistemas({ rpc: r, sonda: sondaOk });
  assert.equal(s.itens.find((i) => i.k === 'whatsapp').tom, 'ruim');
  assert.match(s.itens.find((i) => i.k === 'whatsapp').plano, /seu WhatsApp/, 'plano manda usar o próprio WhatsApp');
  assert.equal(s.itens.find((i) => i.k === 'monitor').tom, 'aviso');
  assert.match(N.resumoDaSaude(s).texto, /WhatsApp com problema/);
});
test('saúde: Pátio/Orçador fora vêm da sonda, com motivo, há quanto tempo e plano B', () => {
  const agora = 1_000_000_000;
  const sonda = { apps: { patio: { fora: true, desde: agora - 9 * 60000, motivo: 'http_503' }, orcador: { fora: false, suspeito: true } } };
  const s = N.saudeSistemas({ rpc: rpcOk(), sonda, agoraMs: agora });
  const p = s.itens.find((i) => i.k === 'patio');
  assert.equal(p.tom, 'ruim'); assert.match(p.detalhes[0], /503/); assert.match(p.detalhes[0], /9 min/); assert.ok(p.plano);
  assert.equal(s.itens.find((i) => i.k === 'orcador').tom, 'aviso', 'uma falha só é atenção, não problema');
});
test('saúde: Comunicar — pausa geral, falhas e fila parada; Movere sem carga é neutro, não alarme', () => {
  const agora = Date.now();
  const r = rpcOk(); r.comunicar = { pausa_geral: true, fila: 4, falhas_24h: 6, ultima_rodada_em: new Date(agora - 3 * 3600000).toISOString() }; r.movere = { ultima_carga: null, cargas: 0 };
  const s = N.saudeSistemas({ rpc: r, sonda: sondaOk, agoraMs: agora });
  const c = s.itens.find((i) => i.k === 'comunicar');
  assert.equal(c.tom, 'ruim'); assert.ok(c.detalhes.some((d) => /pausa geral/.test(d))); assert.ok(c.detalhes.some((d) => /fila/.test(d)));
  const m = s.itens.find((i) => i.k === 'movere');
  assert.equal(m.tom, 'neutro'); assert.match(m.resumo, /Ainda sem acesso real/);
});
test('saúde: Movere com carga velha avisa; carga de hoje não', () => {
  const agora = Date.now();
  const velha = rpcOk(); velha.movere = { ultima_carga: new Date(agora - 9 * 86400000).toISOString(), cargas: 1 };
  assert.equal(N.saudeSistemas({ rpc: velha, sonda: sondaOk, agoraMs: agora }).itens.find((i) => i.k === 'movere').tom, 'aviso');
  assert.equal(N.saudeSistemas({ rpc: rpcOk(), sonda: sondaOk, agoraMs: agora }).itens.find((i) => i.k === 'movere').tom, 'ok');
});
test('saúde: app da própria Central que não subiu e rotinas do banco (gestor) entram na lista', () => {
  const sonda = { ...sondaOk, internos: { agenda: { ok: true }, crm: { ok: false, motivo: 'nao_subiu' } } };
  const banco = { gatilhos: { faltando: ['g1'], desligados: [] }, cron: { faltando: [], falhas_24h: [{ job: 'x' }, { job: 'y' }] }, funcoes_faltando: [], tabelas_faltando: [] };
  const s = N.saudeSistemas({ rpc: rpcOk(), sonda, banco });
  assert.equal(s.itens.find((i) => i.k === 'apps').tom, 'ruim');
  const mon = s.itens.find((i) => i.k === 'monitor');
  assert.equal(mon.tom, 'ruim'); assert.ok(mon.detalhes.some((d) => /2 rotinas/.test(d)));
});
test('saúde: código estranho do monitor não vira HTML nem derruba (só [a-z0-9_-])', () => {
  assert.equal(N.regraDoCodigo('<img src=x>'), null);
  assert.equal(N.regraDoCodigo('x'.repeat(200)), null);
  assert.equal(N.regraDoCodigo('codigo-novo-qualquer').area, 'monitor');
  const r = rpcOk(); r.vigia = ['<b>', null, 5, 'backup-faltando'];
  const s = N.saudeSistemas({ rpc: r, sonda: sondaOk });
  assert.equal(s.itens.find((i) => i.k === 'backup').tom, 'aviso');
});
test('saúde: sem nenhuma leitura mostra "sem leitura" em vez de "tudo certo"', () => {
  assert.equal(N.resumoDaSaude(null).tom, 'neutro');
  assert.equal(N.resumoDaSaude({ itens: [] }).tom, 'neutro');
});

/* ---------------- ligações entre sistemas ---------------- */
const REL = { verificacoes: [
  { app: 'Agenda/Pátio', codigo: 'agendamento_chegou_sem_os', descricao: 'Chegou sem OS', gravidade: 'alta', quantidade: 30, recentes: 1, como_resolver: 'Abra a entrada.', links: ['https://evil.com/x', 'https://indycar-agendamentos.onrender.com/agenda/?agendamento=' + UUID] },
  { app: 'Orçador', codigo: 'orcamento_sem_cliente', descricao: 'Sem cliente', gravidade: 'media', quantidade: 2, recentes: 2, links: [] },
  { app: 'Pátio', codigo: 'nada', descricao: 'zero', gravidade: 'alta', quantidade: 0, links: [] },
  { app: 'CRM', codigo: 'lead_x', descricao: 'Lead', gravidade: 'baixa', quantidade: 9, recentes: 0, links: ['javascript:alert(1)'] },
] };
test('ligações: só o que tem caso, graves primeiro, app certo e só link de app da casa', () => {
  const r = N.resumoLigacoes(REL, B, ORIGEM);
  assert.deepEqual(r.itens.map((i) => i.codigo), ['agendamento_chegou_sem_os', 'orcamento_sem_cliente', 'lead_x']);
  assert.equal(r.total, 41); assert.equal(r.tipos, 3); assert.equal(r.alta, 1);
  assert.equal(r.itens[0].app, 'agenda'); assert.match(r.itens[0].link, /agendamento=/);
  assert.equal(r.itens[2].link, '', 'javascript: nunca vira link');
  assert.equal(N.resumoLigacoes(null, B, ORIGEM).itens.length, 0);
  assert.equal(N.resumoLigacoes(REL, B, ORIGEM, 1).itens.length, 1, 'respeita o limite');
});

/* ---------------- ficha rápida ---------------- */
test('ficha: monta o resumo, corta listas e descarta link de fora', () => {
  const hoje = L.hojeSP();
  const c = {
    cliente: { nome: '<b>Marcos</b>', telefone_55: '5512991821234', aceita_mensagens: true },
    resumo: { orcamentos_total: 3, orcamentos_aprovados: 1, valor_orcamentos_em_aberto: 1890.5, nota_media: 4.5, dias_desde_ultima_visita: 0 },
    patio: [{ numero: 31, veiculo: 'Gol', placa: 'abc1d23', etapa: 'pronto', etapa_rotulo: 'Pronto', aberta: true, extras: [{}, {}], link_equipe: 'https://indycar-patio.netlify.app/?os=' + UUID }, { numero: 5, etapa: 'entregue' }],
    orcamentos: [{ numero: 12, status: 'enviado', total: 1890.5, horas_esperando: 30, link_equipe: 'https://evil.com/o' }],
    agendamentos: [{ data: hoje, hora: '14:00:00', servico: 'Revisão', status: 'aguardando' }, { data: '2020-01-01', hora: '08:00', status: 'concluido' }],
    acoes_sugeridas: [{ codigo: 'cobrar_orcamento', app: 'orcador', titulo: 'Cobrar', motivo: 'parado', link: 'https://indycar-orcador.netlify.app/#/historico/' + UUID }],
    linha_do_tempo: Array.from({ length: 30 }, (_, i) => ({ quando: '2026-10-2' + (i % 9), app: 'crm', titulo: 'Evento ' + i })),
    links: { crm: 'https://indycar-agendamentos.onrender.com/crm/?cliente=' + UUID, nova_cotacao: 'javascript:alert(1)' },
  };
  const f = N.fichaDe(c, B, ORIGEM);
  assert.equal(f.nome, '<b>Marcos</b>', 'o nome sai como texto (o desenho escapa)');
  assert.equal(f.telefone, '(12) 99182-1234'); assert.equal(f.tel55, '5512991821234');
  assert.equal(f.patio.length, 1, 'OS entregue não é carro na oficina'); assert.equal(f.patio[0].extras, 2); assert.equal(f.patio[0].placa, 'ABC-1D23');
  assert.equal(f.orcamentos[0].link, '', 'link de fora é descartado');
  assert.equal(f.agenda.length, 1, 'só horários de hoje em diante');
  assert.equal(f.acoes[0].titulo, 'Cobrar'); assert.match(f.acoes[0].link, /orcador/);
  assert.equal(f.linha.length, 10);
  assert.equal(f.links.cotacao, '', 'javascript: descartado'); assert.match(f.links.crm, /\/crm\//);
  assert.ok(f.chips.includes('3 orçamentos') && f.chips.includes('1 aprovado') && f.chips.includes('esteve aqui hoje'));
  assert.equal(f.vazio, false);
});
test('ficha: cliente sem nada fica vazio e aceita dados faltando; pediu para parar vira aviso', () => {
  assert.equal(N.fichaDe({}, B, ORIGEM).vazio, true);
  assert.equal(N.fichaDe(null, B, ORIGEM).nome, 'Cliente');
  const f = N.fichaDe({ cliente: { nome: 'Ana', telefone_55: '5512991821234' }, acoes_sugeridas: [{ codigo: 'nao_mandar_mensagens' }] }, B, ORIGEM);
  assert.equal(f.aceita, false); assert.match(f.acoes[0].titulo, /parar/);
  assert.equal(N.fichaDe({ cliente: { nome: 'Ana', aceita_mensagens: false } }, B, ORIGEM).aceita, false);
});

/* ---------------- sino ---------------- */
test('sino: "amanhã 8h" pula domingo e usa o fuso da oficina; 1 h e 3 h somam certo', () => {
  const sexta = new Date('2026-10-23T20:00:00-03:00');   // sexta à noite
  const sab = N.ateQuando('amanha', sexta);
  assert.equal(new Date(sab).toISOString(), '2026-10-24T11:00:00.000Z', 'sábado 8h (UTC-3)');
  const sabado = new Date('2026-10-24T20:00:00-03:00');
  assert.equal(new Date(N.ateQuando('amanha', sabado)).toISOString(), '2026-10-26T11:00:00.000Z', 'de sábado pula para segunda 8h');
  assert.equal(N.ateQuando('1h', sexta) - sexta.getTime(), 3600000);
  assert.equal(N.ateQuando('3h', sexta) - sexta.getTime(), 3 * 3600000);
  assert.equal(N.ateQuando('lixo', sexta) - sexta.getTime(), 3600000, 'opção desconhecida cai em 1 h');
  assert.equal(N.OPCOES_ADIAR.length, 3);
});
test('sino: quando o aviso adiado volta', () => {
  assert.equal(N.quandoVolta(1000 + 30 * 60000, 1000), 'volta em 30 min');
  assert.match(N.quandoVolta(1000 + 5 * 3600000, 1000), /^volta em 5 h/);
  assert.equal(N.quandoVolta(1000, 5000), 'volta em 1 min');
});
test('sino: aviso de tarefas vencidas (sem app e sem link no banco) leva para a lista de tarefas, não para uma aba', () => {
  const a = N.acaoDoAviso({ tipo: 'tarefas_vencidas', app: null, link: null }, B, ORIGEM);
  assert.deepEqual(a, { acao: 'tarefas', filtro: 'vencidas' });
  assert.equal(N.acaoDoAviso({ tipo: 'x', app: 'tarefas' }, B, ORIGEM).acao, 'tarefas');
  assert.equal(N.appDoAviso({ tipo: 'tarefas_vencidas', app: null }), 'tarefas');
  assert.equal(N.appDoAviso({ tipo: 'lead', app: 'crm' }), 'crm');
  assert.equal(N.appDoAviso({ tipo: 'qualquer', app: null }), null);
});
test('sino: aviso com link normal abre no app; sem destino conhecido não abre nada', () => {
  const a = N.acaoDoAviso({ tipo: 'aguardando', app: 'atendimento', link: '/?conversa=' + UUID }, B, ORIGEM);
  assert.equal(a.acao, 'abrir'); assert.match(a.url, /\/atendimento\/\?conversa=/);
  const p = N.acaoDoAviso({ tipo: 'patio', app: 'patio', link: '/#/gestao' }, B, ORIGEM);
  assert.equal(p.url, 'https://indycar-patio.netlify.app/#/gestao');
  assert.equal(N.acaoDoAviso({ tipo: 'x', app: 'agenda', link: 'javascript:alert(1)' }, B, ORIGEM).acao, 'abrir', 'link malicioso cai na raiz do app, nunca executa');
  assert.equal(N.acaoDoAviso({ tipo: 'x', app: null, link: null }, B, ORIGEM).acao, 'nada');
  assert.equal(N.acaoDoAviso(null, B, ORIGEM).acao, 'nada');
});
test('sino: os tipos que existem de verdade no banco têm ícone e rótulo de grupo', () => {
  for (const t of ['aguardando', 'ia', 'resumo', 'tarefas_vencidas', 'espera', 'resumo_semanal', 'lead', 'tarefa', 'atraso', 'conversa', 'patio']) assert.notEqual(M.iconeDoAviso({ tipo: t }), '🔔', t);
  for (const t of ['aguardando', 'ia', 'resumo', 'tarefas_vencidas', 'espera', 'resumo_semanal']) assert.notEqual(M.rotuloTipo(t), t, t);
  assert.equal(M.iconeDoAviso({ tipo: 'desconhecido', app: null }), '🔔');
});
test('sino: busca por texto ignora acento e maiúscula e exige todas as palavras', () => {
  const l = [{ titulo: 'Orçamento do João foi visto', app: 'orcador', tipo: 'orcamento_visto' }, { titulo: 'Conversa esperando', corpo: 'Maria Silva', app: 'atendimento', tipo: 'aguardando' }];
  assert.equal(N.filtrarPorTexto(l, 'ORCAMENTO joao').length, 1);
  assert.equal(N.filtrarPorTexto(l, 'maria silva').length, 1);
  assert.equal(N.filtrarPorTexto(l, 'maria joao').length, 0);
  assert.equal(N.filtrarPorTexto(l, '  ').length, 2);
  assert.equal(N.filtrarPorTexto(l, 'atendimento').length, 1, 'também acha pelo nome do app');
});

/* ---------------- busca ---------------- */
test('busca: pessoas por telefone, sem repetir os sistemas, com limite', () => {
  const x3 = { pessoas: [
    { telefone_55: '5512991821234', nome: 'Marcos', achou_em: ['agendamento', 'cliente', 'os', 'os', 'xyz'] },
    { telefone_55: null, nome: 'Sem Fone' },
    { telefone_55: '5512988887777', nome: null, achou_em: [] },
  ] };
  const p = N.pessoasDaBusca(x3);
  assert.equal(p.length, 2);
  assert.deepEqual(p[0].achouEm, ['Agenda', 'cliente', 'Pátio', 'xyz']);
  assert.equal(p[1].nome, '(12) 98888-7777', 'sem nome usa o telefone');
  assert.equal(N.pessoasDaBusca(x3, 1).length, 1);
  assert.deepEqual(N.pessoasDaBusca(null), []);
});
test('busca: filtros trazem a contagem do banco (antes do corte) e dizem quantos ficaram de fora', () => {
  const grupos = [{ k: 'patio', nome: 'Pátio', linhas: [{}, {}] }, { k: 'orcamentos', nome: 'Orçamentos', linhas: [{}] }];
  const f = N.filtrosDaBusca(grupos, { patio: 9, orcamentos: 1 });
  assert.deepEqual(f.map((x) => [x.k, x.n]), [['', 3], ['patio', 9], ['orcamentos', 1]]);
  assert.equal(N.alemDoCorte(grupos[0], { patio: 9 }), 7);
  assert.equal(N.alemDoCorte(grupos[1], { orcamentos: 1 }), 0);
  assert.equal(N.alemDoCorte(grupos[1], null), 0);
});
test('busca: o resultado leva o telefone de cada linha e as pessoas/contagens do banco', () => {
  const r = L.adaptarBusca({ termo: 'marcos', pessoas: [{ telefone_55: '5512991821234' }], contagens: { clientes: 1 }, grupos: { clientes: [{ id: UUID, nome: 'Marcos', telefone_55: '5512991821234', extra: {} }] } });
  assert.equal(r.pessoas.length, 1); assert.equal(r.contagens.clientes, 1);
  const g = L.linhasDaBusca(r, { papel: 'gestor', ativo: true, apps: null }, B);
  assert.equal(g[0].linhas[0].tel, '5512991821234');
  assert.equal(L.adaptarBusca({ aviso: 'curto' }).vazio, true);
});

/* ---------------- papéis ---------------- */
test('recepção: quem falta chegar, o próximo e os atrasados', () => {
  const lista = [
    { id: 'a', hora: '08:00', status: 'compareceu' }, { id: 'b', hora: '09:00', status: 'aguardando' },
    { id: 'c', hora: '10:30', status: 'confirmado' }, { id: 'd', hora: '14:00', status: 'aguardando' }, { id: 'e', hora: '11:00', status: 'cancelado' },
  ];
  const r = N.chegadasDaRecepcao(lista, '10:00', '2026-10-25');
  assert.equal(r.total, 5); assert.equal(r.falta, 3); assert.equal(r.chegaram, 1);
  assert.equal(r.proximo.id, 'c'); assert.deepEqual(r.atrasados.map((x) => x.id), ['b']);
  assert.equal(N.chegadasDaRecepcao([], '10:00', 'x').proximo, null);
  assert.equal(N.chegadasDaRecepcao(null, '10:00', 'x').total, 0);
});
test('mecânico: carro pronto vem primeiro, depois o mais antigo na etapa, com o tom do tempo parado', () => {
  const agora = Date.now();
  const h = (n) => new Date(agora - n * 3600000).toISOString();
  const r = N.ordemDoMecanico([
    { id: 1, etapa: 'em_execucao', etapa_em: h(1) }, { id: 2, etapa: 'pronto', etapa_em: h(1) },
    { id: 3, etapa: 'diagnostico', etapa_em: h(5) }, { id: 4, etapa: 'pronto', etapa_em: h(6) },
  ], agora);
  assert.deepEqual(r.map((c) => c.id), [4, 2, 3, 1]);
  assert.equal(r[2].tom, 'atrasado', 'diagnóstico parado 5 h passou do limite de 4 h');
  assert.deepEqual(N.ordemDoMecanico(null), []);
});

/* ---------------- comandos e atalhos ---------------- */
test('comandos novos da paleta aparecem para quem pode e somem para quem não pode', () => {
  const gestor = { papel: 'gestor', ativo: true, apps: null }, mec = { papel: 'mecanico', ativo: true, apps: ['patio'] };
  const ids = (p) => M.comandos(p).map((c) => c.id);
  for (const id of ['saude', 'tarefas-vencidas', 'tarefas-orcador', 'recolher', 'ligacoes']) assert.ok(ids(gestor).includes(id), id);
  for (const id of ['saude', 'tarefas-orcador', 'ligacoes']) assert.ok(!ids(mec).includes(id), 'mecânico não vê ' + id);
  assert.ok(M.filtrarComandos(M.comandos(gestor), 'whatsapp fora').some((c) => c.id === 'saude'), 'acha a saúde por palavra-chave');
});
test('tarefa adiar 3 dias: pula domingo e sempre às 9h', () => {
  const sexta = new Date('2026-10-23T10:00:00-03:00');
  assert.equal(M.adiarTarefa(null, sexta, 3), '2026-10-27T09:00:00-03:00', 'sex +3 úteis (sáb, seg, ter)');
});
