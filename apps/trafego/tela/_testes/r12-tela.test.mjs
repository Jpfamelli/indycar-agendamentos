/* Rodada 12 ("no pique do Nexus Ads, só que com a cara da IndyCar"): as cinco seções e Ajustes só do
   administrador, endereço antigo indo para o lugar certo, filtros 7/30/60 dias e Tudo/Meta/Google,
   o herói (frase, funil de três números e passagem), a soma dos dias das campanhas, a jornada do
   cliente, o radar, o texto do relatório e a casca (CSS da casa, fontes, [hidden], sem sigla). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TELAS, lerRota, montarRota, abasDoPapel, periodoDaTela, fonteDaTela, destinoDoIr, PERIODOS_DA_TELA, FONTES } from '../js/rotas.js';
import * as L from '../js/painel-logica.js';

const TELA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => fs.readFileSync(path.join(TELA, rel), 'utf8');
const todoJs = () => fs.readdirSync(path.join(TELA, 'js'), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => ler(path.join('js', f))).join('\n');

/* ------------------------------ navegação ------------------------------ */

test('seções do Nexus Ads com nome de oficina; Ajustes só para o administrador', () => {
  assert.deepEqual(TELAS.map((t) => t.rotulo), ['Visão geral', 'Campanhas', 'Clientes', 'Radar', 'Relatórios', 'Ajustes']);
  assert.deepEqual(abasDoPapel('admin').map((t) => t.id), ['geral', 'campanhas', 'clientes', 'radar', 'relatorios', 'ajustes']);
  assert.deepEqual(abasDoPapel('dono').map((t) => t.id), ['geral', 'campanhas', 'clientes', 'radar', 'relatorios', 'ajustes']);
  assert.deepEqual(abasDoPapel('gestor').map((t) => t.id), ['geral', 'campanhas', 'clientes', 'radar', 'relatorios']);
  assert.deepEqual(abasDoPapel('atendente').map((t) => t.id), ['geral', 'campanhas', 'clientes', 'radar', 'relatorios']);
});

test('endereço antigo vai para o lugar certo; filtro velho fica para trás', () => {
  assert.deepEqual(lerRota('#/resumo?periodo=mes_passado'), { tela: 'geral', params: { periodo: 'mes_passado' } });
  assert.deepEqual(lerRota('#/hoje'), { tela: 'geral', params: {} });
  assert.deepEqual(lerRota('#/jornada?pendencia=sem_valor&lead=abc'), { tela: 'clientes', params: { pendencia: 'sem_valor' } });
  for (const velho of ['', '#/', '#/gestor', '#/folha?mes=2026-10', '#/apresentacao', '#/admin']) assert.deepEqual(lerRota(velho), { tela: 'geral', params: {} }, velho);
  assert.deepEqual(lerRota('#/campanhas?periodo=60d&fonte=google&X-Y=1'), { tela: 'campanhas', params: { periodo: '60d', fonte: 'google' } });
  assert.equal(montarRota('radar', { periodo: '7d', fonte: '', abrir: null }), '#/radar?periodo=7d');
  assert.equal(montarRota('gestor'), '#/geral');
});

test('filtros: 7, 30 e 60 dias (30 é o padrão) e Tudo, Meta ou Google', () => {
  assert.deepEqual(PERIODOS_DA_TELA.map((p) => p.rotulo), ['7 dias', '30 dias', '60 dias']);
  assert.deepEqual(FONTES.map((p) => p.rotulo), ['Tudo', 'Meta', 'Google']);
  assert.equal(periodoDaTela('60d'), '60d');
  assert.equal(periodoDaTela('mes'), '30d');
  assert.equal(periodoDaTela(undefined), '30d');
  assert.equal(fonteDaTela('meta'), 'meta');
  assert.equal(fonteDaTela('tiktok'), '');
});

test('o "ir" dos avisos da API vira tela daqui ou outro app da Central, nunca endereço solto', () => {
  assert.deepEqual(destinoDoIr('jornada?pendencia=sem_resposta'), { tela: 'clientes', params: { pendencia: 'sem_resposta' } });
  assert.deepEqual(destinoDoIr('ajustes?secao=conexoes'), { tela: 'ajustes', params: { secao: 'conexoes' } });
  assert.deepEqual(destinoDoIr('/agenda/'), { fora: '/agenda/' });
  for (const ruim of ['', null, 'javascript:alert(1)', '//mal.example/', 'https://mal.example/', 'coisa?x=1']) assert.equal(destinoDoIr(ruim), null, String(ruim));
});

/* ------------------------------ herói e gráficos ------------------------------ */

test('herói: a frase grande com os três números e a passagem de uma etapa para a outra', () => {
  const H = L.heroi({ contatos: 61, agendaram: 24, vieram: 18, fecharam: 14, faturado: 9800, gasto: 1500, retorno: 6.53, custo_por_servico: 107.14, custo_por_contato: 24.59 });
  const frase = H.frase.map((p) => p.numero || p.texto).join('');
  assert.equal(frase, 'Os anúncios trouxeram 61 conversas no WhatsApp, 24 agendamentos e 14 clientes na oficina.');
  assert.deepEqual(H.etapas.map((e) => e.valor), [61, 24, 14]);
  assert.equal(Math.round(H.etapas[1].passagem * 100), 39);
  assert.equal(Math.round(H.etapas[2].passagem * 100), 58);
  assert.equal(H.etapas[0].passagem, undefined);
  assert.equal(H.retorno, 6.53);
  // uma só, e só do Google
  const um = L.heroi({ contatos: 1, agendaram: 1, fecharam: 1 }, 'google').frase.map((p) => p.numero || p.texto).join('');
  assert.equal(um, 'Os anúncios do Google trouxeram 1 conversa no WhatsApp, 1 agendamento e 1 cliente na oficina.');
  // sem conversa: frase curta, sem "0 clientes"; sem conta: dinheiro continua null (a tela escreve a palavra)
  const nada = L.heroi({ contatos: 0, gasto: null });
  assert.equal(nada.frase.length, 1);
  assert.equal(nada.gasto, null);
  assert.equal(L.heroi(null).etapas[1].passagem, null);
});

test('dias do gráfico: soma a série de cada campanha separando Meta e Google; sem gasto fica null', () => {
  const dias = L.somarDias([
    { plataforma: 'meta', serie: [{ data: '2026-11-02', gasto: 10.1, contatos: 1 }, { data: '2026-11-01', gasto: 5, contatos: 0 }] },
    { plataforma: 'google', serie: [{ data: '2026-11-01', gasto: 2.25, contatos: 2 }] },
    { plataforma: 'anuncio', serie: [{ data: '2026-11-01', gasto: null, contatos: 3 }, { data: 'lixo', gasto: 1, contatos: 1 }] },
    null,
  ]);
  assert.deepEqual(dias, [
    { data: '2026-11-01', meta: 5, google: 2.25, gasto: 7.25, contatos: 5 },
    { data: '2026-11-02', meta: 10.1, google: null, gasto: 10.1, contatos: 1 },
  ]);
  assert.equal(L.somarDias([{ plataforma: 'anuncio', serie: [{ data: '2026-11-01', gasto: null, contatos: 2 }] }])[0].gasto, null);
  assert.deepEqual(L.mediaMovel([1, 2, 3, null, 5], 3), [1, 1.5, 2, 2.5, 4]);
  assert.equal(L.tetoDoEixo(137), 150);
  assert.equal(L.tetoDoEixo(8), 8);
  assert.equal(L.tetoDoEixo(0), 1);
  assert.equal(L.tetoDoEixo(2100), 2500);
});

test('funil por ordem de grandeza e "de cada 100"', () => {
  assert.equal(L.larguraDoFunil(122880, 122880), 1);
  assert.ok(L.larguraDoFunil(21, 122880) > 0.2 && L.larguraDoFunil(21, 122880) < 0.4);
  assert.equal(L.larguraDoFunil(0, 100), 0);
  assert.equal(L.larguraDoFunil(null, 100), 0);
  assert.equal(L.deCada100(2560, 122880), 2);
  assert.equal(L.deCada100(5, 0), null);
});

test('campanhas: melhores = cliente mais barato; selo Boa/Atenção/Ruim; três ordens', () => {
  const lista = [
    { nome: 'A', gasto: 1000, contatos: 19, fecharam: 4, custo_por_servico: 250, faturado: 2700 },
    { nome: 'B', gasto: 470, contatos: 15, fecharam: 8, custo_por_servico: 60, faturado: 5000 },
    { nome: 'C', gasto: 520, contatos: 19, fecharam: 0, custo_por_servico: null },
    { nome: 'D', gasto: null, contatos: 3, fecharam: 1, custo_por_servico: null },
  ];
  assert.deepEqual(L.melhoresCampanhas(lista).map((c) => c.nome), ['B', 'A', 'D']);
  assert.deepEqual(L.ordenarCampanhas(lista).map((c) => c.nome), ['A', 'C', 'B', 'D']);
  assert.deepEqual(L.ordenarCampanhas(lista, 'clientes').map((c) => c.nome), ['B', 'A', 'D', 'C']);
  assert.deepEqual(L.ordenarCampanhas(lista, 'custo').map((c) => c.nome), ['B', 'A', 'D', 'C']);
  assert.deepEqual(L.seloDaCampanha({ leitura: { tom: 'bom' } }), ['bom', 'Boa']);
  assert.deepEqual(L.seloDaCampanha({ leitura: { tom: 'atencao' } }), ['atencao', 'Atenção']);
  assert.deepEqual(L.seloDaCampanha({ leitura: { tom: 'ruim' } }), ['grave', 'Ruim']);
  assert.equal(L.seloDaCampanha({ leitura: { tom: 'neutro' } }), null);
});

/* ------------------------------ clientes, radar e relatório ------------------------------ */

test('jornada do cliente: anúncio → conversa → agendou → veio → valor, e a coluna onde ele está', () => {
  const fechou = { origem: { paga: true, campanha: { nome: 'Freios' } }, chegou_em: '2026-11-10T10:00:00-03:00',
    etapas: [{ id: 'contato', em: 'x' }, { id: 'agendou', em: 'x' }, { id: 'veio', em: 'x' }], etapa_atual: 'fechou', desfecho: { tipo: 'fechou', valor: 890 } };
  const j = L.jornadaDoCliente(fechou);
  assert.deepEqual(j.map((p) => p.id), ['anuncio', 'conversa', 'agendou', 'veio', 'valor']);
  assert.deepEqual(j.map((p) => p.feito), [true, true, true, true, true]);
  assert.equal(j[0].detalhe, 'Freios');
  assert.equal(j[4].valor, 890);
  const semValor = L.jornadaDoCliente({ ...fechou, desfecho: { tipo: 'fechou', valor: null } });
  assert.equal(semValor[4].feito, false);
  assert.equal(semValor[4].detalhe, 'falta lançar');
  // fechou sem etapa de agenda marcada: quem fechou veio e agendou
  assert.deepEqual(L.jornadaDoCliente({ origem: { paga: true }, etapas: [{ id: 'contato', em: 'x' }], desfecho: { tipo: 'fechou', valor: 100 } }).map((p) => p.feito), [true, true, true, true, true]);
  assert.equal(L.colunaDoCliente(fechou), 'fechou');
  assert.equal(L.colunaDoCliente({ etapa_atual: 'oficina', desfecho: { tipo: 'aberto' } }), 'veio');
  assert.equal(L.colunaDoCliente({ etapa_atual: 'agendou', desfecho: { tipo: 'aberto' } }), 'agendou');
  assert.equal(L.colunaDoCliente({ etapa_atual: 'orcamento', desfecho: { tipo: 'aberto' } }), 'conversa');
  assert.equal(L.colunaDoCliente({ etapa_atual: 'veio', desfecho: { tipo: 'nao_fechou' } }), 'nao_fechou');
  const g = L.agruparClientes([fechou, { etapa_atual: 'contato', desfecho: { tipo: 'aberto' } }, null]);
  assert.deepEqual(g.map((x) => [x.id, x.itens.length]), [['conversa', 1], ['agendou', 0], ['veio', 0], ['fechou', 1], ['nao_fechou', 0]]);
});

test('radar: do mais grave para o mais leve, e o número vermelho conta urgente + atenção', () => {
  const r = L.radar([{ titulo: 'c', gravidade: 'baixa' }, { titulo: 'a', gravidade: 'media' }, { titulo: 'b', gravidade: 'alta' }, { gravidade: 'alta' }, null]);
  assert.deepEqual(r.lista.map((a) => a.titulo), ['b', 'a', 'c']);
  assert.equal(r.selo, 2);
  assert.equal(r.leves, 1);
  assert.equal(L.radar(undefined).selo, 0);
});

test('relatório: o texto do WhatsApp vira título, seção, item e negrito para a tela', () => {
  const linhas = L.linhasDoRelatorio('*IndyCar · Relatório da semana*\n\n*Contatos*\n• 46 contatos novos, *31* de anúncio\n\nIndyCar Tráfego');
  assert.deepEqual(linhas.map((l) => l.tipo), ['titulo', 'secao', 'item', 'texto']);
  assert.deepEqual(linhas[2].partes, [{ texto: '46 contatos novos, ', forte: false }, { texto: '31', forte: true }, { texto: ' de anúncio', forte: false }]);
  assert.deepEqual(L.linhasDoRelatorio(null), []);
});

/* ------------------------------ casca ------------------------------ */

test('casca: topo da casa, lateral, barra de baixo, painel.css com [hidden] e cores do indycar.css', () => {
  const html = ler('index.html');
  assert.match(html, /<header class="ic-topo">/);
  assert.match(html, /<span class="ic-nome">IndyCar <b>Tráfego<\/b><\/span>/);
  assert.match(html, /<aside class="lado"/);
  assert.match(html, /<nav class="barra-baixo"/);
  const casa = html.indexOf('href="../casa/indycar.css"'), painel = html.indexOf('href="css/painel.css"');
  assert.ok(casa > 0 && painel > casa, 'o indycar.css vem antes do painel.css');
  const css = ler('css/painel.css');
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  assert.match(css, /var\(--ic-vermelho\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media print/);
  assert.doesNotMatch(css, /font-style:\s*italic/);
  const familias = [...css.matchAll(/font(?:-family)?:[^;]*?(['"]?)([A-Z][A-Za-z ]+)\1\s*(?:,|;)/g)].map((m) => m[2].trim());
  for (const f of familias) assert.ok(['Archivo', 'Barlow Condensed'].includes(f), 'fonte fora da casa: ' + f);
  assert.doesNotMatch(css, /\b(Inter|Roboto|Arial|Helvetica)\b|fonts\.googleapis/);
});

test('sem sigla, sem ajuda e sem palavra de clínica na tela nova', () => {
  const js = todoJs();
  for (const re of [/\bROAS\b/, /\bCPA\b/, /\bCPL\b/, /\bCTR\b/, /\bCPM\b/, /Como usar|\bDicas\b|\btour\b|atalho de teclado/i, /'Ajuda'/, /paciente/i, /cl[ií]nica/i, /[.]innerHTML *=/]) {
    assert.doesNotMatch(js, re, String(re));
  }
});
