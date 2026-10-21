// Casa (rodada 6): regras puras de casa/logica.js — busca, links, sino, atenção, visão do dono.
import { test } from 'node:test';
import assert from 'node:assert/strict';
await import('../casa/logica.js');
const L = globalThis.CasaLogica;
const U = '11111111-1111-4111-8111-111111111111';

test('telefone: normaliza para 55DDDNÚMERO e formata', () => {
  assert.equal(L.telefoneE164('(12) 99182-1234'), '5512991821234');
  assert.equal(L.telefoneE164('5512991821234'), '5512991821234');
  assert.equal(L.telefoneE164('0 12 3622-1234'), '551236221234');
  assert.equal(L.telefoneE164('123'), '');
  assert.equal(L.formatarTelefone('5512991821234'), '(12) 99182-1234');
  assert.equal(L.formatarTelefone('551236221234'), '(12) 3622-1234');
});
test('placa: antiga e Mercosul', () => {
  assert.equal(L.formatarPlaca('abc1d23'), 'ABC-1D23');
  assert.equal(L.formatarPlaca('abc-1234'), 'ABC-1234');
});
test('classificarBusca separa telefone, placa, número e nome', () => {
  assert.equal(L.classificarBusca('a').valido, false);
  assert.equal(L.classificarBusca('(12) 99182-1234').tipo, 'telefone');
  assert.equal(L.classificarBusca('ABC-1D23').tipo, 'placa');
  assert.equal(L.classificarBusca('#31').tipo, 'numero');
  assert.equal(L.classificarBusca('31').numero, 31);
  assert.equal(L.classificarBusca('maria silva').tipo, 'nome');
});
test('destacar escapa HTML e marca o trecho sem acento', () => {
  assert.equal(L.destacar('João <b>', 'joao'), '<mark>João</mark> &lt;b&gt;');
  assert.equal(L.destacar('x', 'x'), 'x');
  assert.equal(L.destacar('<img onerror=1>', 'zzz'), '&lt;img onerror=1&gt;');
});
test('links: rotas que os apps aceitam, só com uuid válido', () => {
  const l = L.links();
  assert.equal(l.agenda(U), `/agenda/?agendamento=${U}`);
  assert.equal(l.agenda('x'), '/agenda/');
  assert.equal(l.conversa(U), `/atendimento/?conversa=${U}`);
  assert.equal(l.crmLead(U), `/crm/?lead=${U}`);
  assert.equal(l.os(U), `https://indycar-patio.netlify.app/?os=${U}`);
  assert.equal(l.orcamento(U), `https://indycar-orcador.netlify.app/#/historico/${U}`);
  assert.equal(l.novoOrcamento({ telefone: '(12) 99182-1234', nome: 'Ana' }), 'https://indycar-orcador.netlify.app/?tel=5512991821234&nome=Ana');
  assert.equal(l.agendaNovo({ telefone: '12991821234' }), '/agenda/?novo=1&tel=5512991821234');
});
test('bases: só https de verdade troca o endereço do Pátio/Orçador', () => {
  assert.equal(L.bases({ patio: 'http://x.com' }).patio, 'https://indycar-patio.netlify.app/');
  assert.equal(L.bases({ patio: 'https://p.exemplo.com' }).patio, 'https://p.exemplo.com/');
});
test('appDoLink acha o app dono do endereço (aba nomeada)', () => {
  const o = 'https://indycar-agendamentos.onrender.com';
  assert.equal(L.appDoLink('/crm/?lead=1', o), 'crm');
  assert.equal(L.appDoLink('/agenda/', o), 'agenda');
  assert.equal(L.appDoLink('https://indycar-patio.netlify.app/?os=1', o), 'patio');
  assert.equal(L.appDoLink('https://indycar-orcador.netlify.app/#/historico', o), 'orcador');
  assert.equal(L.appDoLink('https://evil.com/crm/', o), null);
  assert.equal(L.nomeDaAba('patio'), 'indycar-patio');
});
test('linkDaNotificacao: relativo entra no app, javascript:/outro domínio caem na raiz do app', () => {
  const o = 'https://indycar-agendamentos.onrender.com/';
  const b = L.bases();
  assert.equal(L.linkDaNotificacao({ app: 'crm', link: '?lead=9' }, b, o), 'https://indycar-agendamentos.onrender.com/crm/?lead=9');
  assert.equal(L.linkDaNotificacao({ app: 'crm', link: 'javascript:alert(1)' }, b, o), '/crm/');
  assert.equal(L.linkDaNotificacao({ app: 'crm', link: '//evil.com/x' }, b, o), '/crm/');
  assert.equal(L.linkDaNotificacao({ app: 'crm', link: 'https://evil.com/x' }, b, o), '/crm/');
  assert.equal(L.linkDaNotificacao({ app: 'patio', link: `https://indycar-patio.netlify.app/?os=${U}` }, b, o), `https://indycar-patio.netlify.app/?os=${U}`);
});
test('sino: agrupa por dia, filtra por app e não lidas', () => {
  const agora = new Date('2026-10-21T15:00:00Z');
  const lista = [
    { id: 1, app: 'crm', created_at: '2026-10-21T14:00:00Z' },
    { id: 2, app: 'patio', created_at: '2026-10-20T14:00:00Z', lida_em: 'x' },
    { id: 3, app: 'crm', created_at: '2026-10-10T14:00:00Z' },
  ];
  assert.deepEqual(L.organizarNotificacoes(lista, { agora }).map((g) => g.nome), ['Hoje', 'Ontem', 'Antes']);
  assert.equal(L.organizarNotificacoes(lista, { agora, app: 'crm' }).length, 2);
  assert.equal(L.organizarNotificacoes(lista, { agora, soNaoLidas: true }).flatMap((g) => g.itens).length, 2);
  assert.deepEqual(L.contagemPorApp(lista), { crm: 2 });
  assert.equal(L.tituloDaAba(3), '(3) IndyCar Central');
  assert.equal(L.tituloDaAba(0), 'IndyCar Central');
});
test('etapas do Pátio: tom pelo tempo parado', () => {
  const agora = Date.parse('2026-10-21T12:00:00Z');
  assert.equal(L.tomDaEtapa('diagnostico', '2026-10-21T11:30:00Z', agora), 'ok');
  assert.equal(L.tomDaEtapa('diagnostico', '2026-10-21T09:30:00Z', agora), 'atencao');
  assert.equal(L.tomDaEtapa('diagnostico', '2026-10-21T07:00:00Z', agora), 'atrasado');
  assert.equal(L.duracao(35 * 60000), '35 min');
  assert.equal(L.duracao(3 * 3600000 + 20 * 60000), '3 h 20 min');
  assert.equal(L.duracao(50 * 3600000), '2 dias');
  assert.equal(L.previsao('2026-10-21T10:00:00Z', 'em_execucao', agora).atrasada, true);
  assert.equal(L.previsao('2026-10-21T10:00:00Z', 'pronto', agora).texto, '');
});
test('visao: cada papel vê o seu painel', () => {
  const todos = ['agenda', 'atendimento', 'crm', 'comunicar', 'patio', 'orcador'];
  const adm = L.visao({ papel: 'admin', ativo: true, apps: todos });
  assert.ok(adm.dono && adm.conversas && adm.patio && adm.orcamentos && adm.agenda);
  assert.equal(adm.padrao, 'dono');
  const mec = L.visao({ papel: 'mecanico', ativo: true, apps: ['patio'] });
  assert.ok(mec.patio && mec.soMeusCarros && !mec.conversas && !mec.agenda && !mec.dono);
  const rec = L.visao({ papel: 'agenda', ativo: true, apps: ['agenda', 'patio'] });
  assert.ok(rec.recepcao && !rec.agenda && rec.patio);
  const at = L.visao({ papel: 'atendente', ativo: true, apps: ['atendimento', 'agenda'] });
  assert.ok(at.conversas && at.agenda && !at.patio && !at.orcamentos && !at.dono);
  assert.equal(L.podeUsar({ papel: 'atendente', ativo: false, apps: todos }, 'crm'), false);
});
test('atencao: prioriza e conta; gargalos só passam do limite', () => {
  const l = L.links(), v = L.visao({ papel: 'admin', ativo: true, apps: [] });
  const agora = Date.parse('2026-10-21T12:00:00Z');
  const a = { patio: { prontos: 1, extras_pendentes: 2, atrasados: 0, lista: [{ etapa: 'pronto', etapa_em: '2026-10-21T05:00:00Z' }] },
    conversas: { esperando: 2, lista: [{ id: U, aguardando_desde: '2026-10-21T08:00:00Z' }] }, orcamentos: { esperando: 1, aprovados_sem_horario: 0, lista: [{ id: U, enviado_em: '2026-10-20T08:00:00Z' }] },
    agenda: { sem_confirmar: 0 }, leads: { novos_sem_dono: 4 } };
  const r = L.atencao(a, v, l, agora);
  assert.equal(r[0].grav, 3);
  assert.ok(r.find((x) => x.k === 'conversas').url.includes('conversa=' + U));
  assert.ok(r.find((x) => x.k === 'leads'));
  assert.equal(r.find((x) => x.k === 'confirmar'), undefined);
  const g = L.gargalos({ gargalos: { patio: [{ etapa: 'diagnostico', n: 2, horas_mais_antigo: 9 }, { etapa: 'em_execucao', n: 1, horas_mais_antigo: 1 }], conversas_2h: 1 } }, l);
  assert.deepEqual(g.map((x) => x.k), ['etapa-diagnostico', 'conversas'].sort((p, q) => (p === 'conversas' ? 1 : -1)));
});
test('dono: variação, taxas e barras', () => {
  assert.deepEqual(L.variacao(150, 100), { pct: 50, sinal: 1, novo: false });
  assert.equal(L.variacao(0, 0), null);
  assert.equal(L.variacao(10, 0).novo, true);
  const c = L.conversao({ conversao: { leads: 10, agendaram: 5, fecharam: 2, fechou: 3, nao_fechou: 1, nao_veio: 1, veio: 3 }, orcamentos: { enviados: 4, aprovados: 1 } });
  assert.deepEqual([c.leadsAgendaram, c.leadsFecharam, c.fechamento, c.falta, c.orcAprovados], [50, 20, 75, 25, 25]);
  assert.equal(L.conversao({}).fechamento, null);
  const b = L.barras([{ dia: '2026-10-20', valor: 0 }, { dia: '2026-10-21', valor: 200 }, { dia: '2026-10-22', valor: 1 }]);
  assert.deepEqual(b.map((x) => x.pct), [0, 100, 4]);
  assert.match(L.brl(1234.5).replace(/ /g, ' '), /R\$ 1\.234,50/);
});
test('linhasDaBusca: monta grupos, atalhos só dos apps liberados', () => {
  const res = { clientes: [{ id: U, nome: 'Ana', telefone: '5512991821234', carro: 'Gol', placa: 'ABC1D23' }], patio: [{ id: U, numero: 7, nome: 'Ana', veiculo: 'Gol', placa: 'ABC1D23', etapa: 'pronto', etapa_em: new Date().toISOString() }], orcamentos: [] };
  const so = L.linhasDaBusca(res, { papel: 'atendente', ativo: true, apps: ['agenda', 'crm'] }, L.bases());
  assert.deepEqual(so.map((g) => g.k), ['clientes', 'patio']);
  const cli = so[0].linhas[0];
  assert.deepEqual(cli.atalhos.map((a) => a.app), ['crm']);
  assert.equal(L.filtrarPorPermissao(so, { papel: 'atendente', ativo: true, apps: ['agenda', 'crm'] }).length, 1);
  assert.equal(L.linhasDaBusca({ vazio: true }, null).length, 0);
});

test('adaptarAgora: junta r6_agora (X3) com os extras do C1 no formato da Casa', () => {
  const x3 = { hoje: '2026-10-21', patio: { total: 2, prontos_esperando_retirada: 1, atrasados: 0, extras_pendentes: 1, por_etapa: [
      { etapa: 'diagnostico', quantidade: 1, carros: [{ id: 'a', numero: 1, cliente: 'Ana', desde: '2026-10-21T10:00:00Z', extras_pendentes: 1 }] },
      { etapa: 'pronto', quantidade: 1, carros: [{ id: 'b', numero: 2, cliente: 'Bia', desde: '2026-10-21T11:00:00Z' }] }] },
    orcamentos: { esperando_total: 2, aprovados_sem_horario_total: 1, esperando: [{ id: 'o', numero: 5, cliente: 'Rui', total: 10 }] },
    conversas_sem_resposta: { total: 1, itens: [{ id: 'c', nome: 'Zé', telefone_55: '5512', desde: 'x', previa: 'oi' }] },
    agendamentos_hoje: { total: 1, itens: [{ id: 'g1', hora: '09:00', cliente: 'Lia', status: 'confirmado', os_etapa: null }] } };
  const a = L.adaptarAgora(x3, { leads: { novos_sem_dono: 3 }, orcamentos: { recusados_7d: 2, vistos: 1 }, agenda: { chegaram: 4, orcamentos: { g1: { id: 'o', numero: 5, status: 'aprovado' } } } });
  assert.equal(a.patio.lista[0].numero, 2, 'pronto vem primeiro');
  assert.deepEqual(a.patio.por_etapa, { diagnostico: 1, pronto: 1 });
  assert.equal(a.patio.prontos, 1); assert.equal(a.orcamentos.aprovados_sem_horario, 1); assert.equal(a.orcamentos.recusados_7d, 2);
  assert.equal(a.agenda.lista[0].orc_status, 'aprovado'); assert.equal(a.agenda.lista[0].confirmado, true); assert.equal(a.agenda.chegaram, 4);
  assert.equal(a.leads.novos_sem_dono, 3); assert.equal(a.conversas.lista[0].telefone, '5512');
  assert.equal(L.adaptarAgora(null).patio.total, 0, 'resposta vazia não quebra');
});
test('adaptarBusca: grupos do X3 viram linhas com os links da Casa', () => {
  const it = (o) => ({ telefone_55: '5512991821234', extra: {}, ...o });
  const r = L.adaptarBusca({ termo: 'x', grupos: { clientes: [it({ id: U, nome: 'Ana', extra: { carro: 'Gol' } })], patio: [it({ id: U, nome: 'Ana', extra: { numero: 3, etapa: 'pronto' } })], orcamentos: [it({ id: U, nome: 'Ana', status: 'enviado', extra: { numero: 9, total: 5 } })] } });
  const g = L.linhasDaBusca(r, { papel: 'admin', ativo: true, apps: [] }, L.bases());
  assert.deepEqual(g.map((x) => x.k), ['clientes', 'patio', 'orcamentos']);
  assert.equal(g[1].linhas[0].url, `https://indycar-patio.netlify.app/?os=${U}`);
  assert.equal(g[2].linhas[0].titulo, '#0009 Ana');
  assert.equal(L.adaptarBusca({ aviso: 'curto' }).vazio, true);
});
