'use strict';
/* Rodada 8 (frente T2a) — GET /api/campanhas e o detalhe (motor/campanhas.js) com banco de mentira e jornada dublê:
   sem conta (campanhas conhecidas pelos contatos, gasto null), gasto real com demonstração separada, ligação do contato
   pela campanha (identificador ou nome), detalhe com conjuntos, anúncios, palavras e termos, e desempenho. Sem rede. */
const test = require('node:test');
const assert = require('node:assert/strict');

const C = require('../motor/campanhas');
const T = require('../motor/texto');
const D = require('./apoio/trafego-dados');

const q = (s = '') => new URLSearchParams(s);
const limpo = r => { assert.deepEqual(T.naoFinitos(r), []); assert.deepEqual(T.textosRuins(r), []); };
const dia = d => `2026-11-${String(d).padStart(2, '0')}`;

/** Meta: campanha 1202 com um conjunto e um anúncio, 10 dias de R$ 50; e demonstração que não pode entrar. */
function metricasMeta() {
  const linhas = [];
  for (let d = 1; d <= 10; d++) {
    linhas.push(D.metrica(`m${d}`, { data: dia(d), campanha_ext: '1202' }));
    linhas.push(D.metrica(`cj${d}`, { nivel: 'conjunto', data: dia(d), campanha_ext: '1202', conjunto_ext: 'cj1', conjunto_nome: 'Taubaté 30 km' }));
    linhas.push(D.metrica(`an${d}`, { nivel: 'anuncio', data: dia(d), campanha_ext: '1202', conjunto_ext: 'cj1', anuncio_ext: 'a1', anuncio_nome: 'Vídeo 2', miniatura_url: 'https://exemplo.test/a1.jpg' }));
  }
  linhas.push(D.metrica('demo', { data: dia(2), campanha_ext: 'demo-1', campanha_nome: 'Demonstração', fonte: 'demo', gasto: 5000 }));
  return linhas;
}

test('sem conta: as campanhas vêm dos contatos, com gasto null e a chave pronta para o detalhe', async () => {
  const { fonte, sb } = D.fonteDeTeste();
  const r = await D.calado(() => C.responderLista({ q: q(), fonte }));
  limpo(r);
  assert.equal(r.estado.gasto, 'sem_conta');
  assert.equal(r.totais.gasto, null);
  assert.equal(r.totais.contatos, 4, 'só contato de anúncio');
  assert.deepEqual(r.campanhas.map(c => [c.plataforma, c.ext, c.nome, c.chave, c.contatos]),
    [['meta', '1202', 'Troca de óleo R$ 169', '1202', 3], ['google', null, 'Freios Taubaté', 'nome:freios taubate', 1]]);
  for (const c of r.campanhas) {
    assert.deepEqual([c.gasto, c.impressoes, c.cliques, c.custo_por_contato, c.retorno, c.filhos, c.situacao], [null, null, null, null, null, null, 'desconhecida']);
    assert.equal(c.so_dos_contatos, true);
    assert.equal(c.serie.length, 19);
    assert.ok(c.serie.every(p => p.gasto === null));
    assert.equal(c.leitura.tom, 'neutro');
    assert.match(c.leitura.texto, /Ligue a conta de anúncios/);
  }
  assert.equal(r.sem_campanha.contatos, 0);
  assert.deepEqual(r.horarios.dias, ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']);
  assert.equal(r.horarios.celulas.length, 7);
  assert.ok(r.horarios.celulas.every(l => l.length === r.horarios.horas.length));
  assert.equal(r.comparacao, null);
  assert.ok(sb.idas() <= 10, `foram ${sb.idas()} consultas`);

  const det = await D.calado(() => C.responderDetalhe({ plataforma: 'google', chave: encodeURIComponent('nome:Freios Taubaté'), fonte }));
  limpo(det);
  assert.equal(det.campanha.nome, 'Freios Taubaté');
  assert.deepEqual([det.conjuntos, det.palavras, det.termos], [[], [], []]);
  assert.deepEqual(det.contatos.map(i => i.lead_id), ['lead-03']);
});

test('gasto real: demonstração fora, contato ligado pelo identificador ou pelo nome, leitura com retorno', async () => {
  const itens = [...D.contatosDeHoje(),
    D.item(20, { dia: dia(8), canal: 'meta', campanha: { ext: null, nome: 'TROCA DE ÓLEO r$ 169' }, etapas: ['contato', 'respondido', 'fechou'], desfecho: 'fechou', valor: 1500 }),
    D.item(21, { dia: dia(9), canal: 'meta' })];
  const { fonte } = D.fonteDeTeste({ itens, tabelas: D.tabelasDeHoje({ ads_metricas_dia: metricasMeta() }) });
  const r = await D.calado(() => C.responderLista({ q: q(), fonte }));
  limpo(r);
  assert.equal(r.estado.gasto, 'real');
  assert.equal(r.totais.gasto, 500, 'os R$ 5.000 de demonstração não entram');
  assert.ok(!r.campanhas.some(c => c.ext === 'demo-1'));
  const c = r.campanhas[0];
  assert.deepEqual([c.ext, c.situacao, c.objetivo, c.gasto, c.impressoes, c.cliques, c.filhos, c.so_dos_contatos], ['1202', 'ativa', 'Conversas', 500, 20000, 400, 1, false]);
  assert.equal(c.contatos, 4, 'três pelo identificador e um pelo nome (sem acento e sem diferença de maiúscula)');
  assert.deepEqual([c.fecharam, c.faturado, c.sem_valor], [3, 1920, 1]);
  assert.equal(c.taxa_clique, 0.02);
  assert.equal(c.custo_por_clique, 1.25);
  assert.equal(c.contatos_plataforma, 30);
  assert.equal(c.custo_por_contato, 125);
  assert.equal(c.retorno, 3.84);
  assert.deepEqual(c.leitura, { tom: 'bom', texto: 'Se paga bem: cada R$ 1 virou R$ 3,84 em serviço fechado. Falta o valor de 1 serviço: o retorno pode ser maior.' });
  assert.equal(c.serie[0].gasto, 50);
  assert.deepEqual(r.sem_campanha, { contatos: 1, fecharam: 0, faturado: 0, texto: 'Contatos de anúncio que não conseguimos ligar a uma campanha.' });
  assert.ok(r.comparacao && r.comparacao.linhas.length === 1);

  const g = await D.calado(() => C.responderLista({ q: q('plataforma=google'), fonte }));
  assert.deepEqual(g.campanhas.map(x => x.nome), ['Freios Taubaté']);
  assert.equal(g.totais.contatos, 1);
});

test('leitura da campanha: régua do custo (meta), pouco gasto, gasto sem contato e demonstração', () => {
  const n = o => ({ gasto: 300, contatos: 10, fecharam: 0, faturado: 0, sem_valor: 0, custo_por_contato: 30, retorno: 0, ...o });
  assert.equal(C.leituraDaCampanha(n(), { tipo: 'real', meta: 40 }).tom, 'bom');
  assert.equal(C.leituraDaCampanha(n({ custo_por_contato: 50 }), { tipo: 'real', meta: 40 }).tom, 'atencao');
  assert.match(C.leituraDaCampanha(n({ custo_por_contato: 90 }), { tipo: 'real', meta: 40 }).texto, /^Custo por contato alto: R\$ 90,00 por contato, a meta é R\$ 40,00\./);
  assert.match(C.leituraDaCampanha(n(), { tipo: 'real' }).texto, /Defina a meta/);
  assert.equal(C.leituraDaCampanha(n({ gasto: 8 }), { tipo: 'real', meta: 40 }).tom, 'neutro');
  assert.deepEqual(C.leituraDaCampanha(n({ contatos: 0, custo_por_contato: null }), { tipo: 'real', meta: 40 }), { tom: 'ruim', texto: 'Gastou R$ 300 e nenhum contato chegou à oficina.' });
  assert.equal(C.leituraDaCampanha(n({ fecharam: 2, faturado: 600, retorno: 2 }), { tipo: 'real' }).tom, 'atencao');
  assert.equal(C.leituraDaCampanha(n(), { tipo: 'demo' }).tom, 'neutro');
});

test('demonstração: números da plataforma aparecem, custo e retorno não', async () => {
  const demo = metricasMeta().map(l => ({ ...l, fonte: 'demo' }));
  const { fonte } = D.fonteDeTeste({ tabelas: D.tabelasDeHoje({ ads_metricas_dia: demo }) });
  const r = await D.calado(() => C.responderLista({ q: q(), fonte }));
  limpo(r);
  assert.equal(r.estado.demo, true);
  assert.equal(r.estado.gasto, 'demo');
  assert.ok(r.totais.gasto > 0);
  assert.deepEqual([r.totais.custo_por_contato, r.totais.retorno], [null, null]);
  assert.ok(r.campanhas.every(c => c.custo_por_contato === null && c.retorno === null));
});

test('detalhe: conjuntos e anúncios; números da oficina null quando o contato não diz o conjunto', async () => {
  const termos = [
    { data: dia(3), plataforma: 'google', campanha_ext: 'g1', palavra_chave: 'freio taubate', correspondencia: 'frase', termo: null, cliques: 10, gasto: 30, impressoes: 100 },
    { data: dia(4), plataforma: 'google', campanha_ext: 'g1', palavra_chave: 'freio taubate', correspondencia: 'frase', termo: null, cliques: 5, gasto: 20, impressoes: 80 },
    { data: dia(4), plataforma: 'google', campanha_ext: 'g1', palavra_chave: 'freio taubate', correspondencia: 'frase', termo: 'troca de pastilha taubate', cliques: 7, gasto: 21, impressoes: 40 },
  ];
  const linhas = [...metricasMeta(), D.metrica('g1', { plataforma: 'google', campanha_ext: 'g1', campanha_nome: 'Freios Taubaté', data: dia(3), gasto: 50 })];
  const itens = [...D.contatosDeHoje(), D.item(30, { dia: dia(5), canal: 'google', campanha: { ext: 'g1', nome: 'Freios Taubaté' }, palavra: 'Freio Taubaté', etapas: ['contato', 'fechou'], desfecho: 'fechou', valor: 800 })];
  const { fonte } = D.fonteDeTeste({ itens, tabelas: D.tabelasDeHoje({ ads_metricas_dia: linhas, ads_termos_dia: termos }) });

  const meta = await D.calado(() => C.responderDetalhe({ plataforma: 'meta', chave: '1202', fonte }));
  limpo(meta);
  assert.equal(meta.conjuntos.length, 1);
  const cj = meta.conjuntos[0];
  assert.deepEqual([cj.ext, cj.nome, cj.gasto, cj.contatos, cj.retorno], ['cj1', 'Taubaté 30 km', 500, null, null]);
  assert.deepEqual(cj.anuncios.map(a => [a.ext, a.nome, a.miniatura_url, a.gasto, a.contatos]), [['a1', 'Vídeo 2', 'https://exemplo.test/a1.jpg', 500, null]]);
  assert.equal(meta.contatos.length, 3);

  const google = await D.calado(() => C.responderDetalhe({ plataforma: 'google', chave: 'g1', fonte }));
  limpo(google);
  assert.equal(google.estado.termos, 'ok');
  assert.deepEqual(google.palavras, [{ palavra: 'freio taubate', correspondencia: 'frase', gasto: 50, cliques: 15, contatos: 1, fecharam: 1, faturado: 800 }]);
  assert.deepEqual(google.termos, [{ termo: 'troca de pastilha taubate', cliques: 7, gasto: 21 }]);

  assert.equal(await D.calado(() => C.responderDetalhe({ plataforma: 'meta', chave: 'nao-existe', fonte })), null);
  assert.throws(() => C.responderDetalhe({ plataforma: 'tiktok', chave: '1', fonte }), e => e.status === 400);
  assert.throws(() => C.responderDetalhe({ plataforma: 'meta', chave: '%E0%A4%A', fonte }), e => e.status === 400);
});

test('desempenho: 1.000 contatos e 90 dias de métricas em menos de 1,5 s, sem consulta por contato', async () => {
  const itens = Array.from({ length: 1000 }, (_, n) => D.item(n, { dia: `2026-11-${String(1 + (n % 19)).padStart(2, '0')}`, hora: `${String(7 + (n % 12)).padStart(2, '0')}:10`,
    canal: n % 3 ? 'meta' : 'google', campanha: { ext: `c${n % 6}`, nome: `Campanha ${n % 6}` }, etapas: n % 4 ? ['contato'] : ['contato', 'fechou'],
    desfecho: n % 4 ? 'aberto' : 'fechou', valor: n % 8 ? 250 : null }));
  const linhas = [];
  for (let d = 0; d < 90; d++) {
    const data = new Date(Date.parse('2026-08-22T12:00:00Z') + d * 86400000).toISOString().slice(0, 10);
    for (let c = 0; c < 6; c++) {
      const plataforma = c % 3 ? 'meta' : 'google';
      linhas.push(D.metrica(`p${d}-${c}`, { data, plataforma, campanha_ext: `c${c}`, campanha_nome: `Campanha ${c}`, gasto: 30 }));
      linhas.push(D.metrica(`q${d}-${c}`, { data, plataforma, nivel: 'conjunto', campanha_ext: `c${c}`, conjunto_ext: `cj${c}`, gasto: 30 }));
    }
  }
  const { fonte, sb } = D.fonteDeTeste({ itens, tabelas: D.tabelasDeHoje({ ads_metricas_dia: linhas }) });
  const t0 = performance.now();
  const r = await D.calado(() => C.responderLista({ q: q('periodo=30d'), fonte }));
  const ms = performance.now() - t0;
  limpo(r);
  assert.ok(ms < 1500, `levou ${Math.round(ms)} ms`);
  assert.equal(r.campanhas.length, 6);
  assert.equal(r.totais.contatos, 1000);
  assert.ok(sb.idas() <= 10, `foram ${sb.idas()} consultas`);
});
