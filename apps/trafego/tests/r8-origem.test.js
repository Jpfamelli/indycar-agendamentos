'use strict';
/* Rodada 8 (frente T2b) — regra única de origem do contato.
   atribuicao.canal e leads.canalDe obedecem as colunas novas (origem_paga, origem_plataforma);
   origem.origemDoContato monta o objeto `origem` do contrato da API (§5.1) e é a única fonte dele. */
const test = require('node:test');
const assert = require('node:assert/strict');

const A = require('../atribuicao');
const L = require('../leads');
const O = require('../origem');

test('canal pago: origem_paga verdadeiro manda, com a plataforma de origem_plataforma', () => {
  assert.equal(A.canal({ origem: 'whatsapp', origem_paga: true, origem_plataforma: 'meta' }), 'meta');
  assert.equal(A.canal({ origem: 'whatsapp', origem_paga: true, origem_plataforma: 'google' }), 'google');
  assert.equal(A.canal({ origem: 'meta', origem_paga: true, origem_plataforma: 'google' }), 'google', 'a coluna nova vence a origem antiga do CRM');
  assert.equal(A.canal({ origem: 'indicacao', origem_paga: true, origem_plataforma: 'Meta ' }), 'meta', 'tolera caixa e espaço');
});

test('canal pago: sem origem_paga vale a regra antiga (origem do CRM manda; a UTM só completa)', () => {
  assert.equal(A.canal({ origem: 'google' }), 'google');
  assert.equal(A.canal({ origem: 'whatsapp', utm_source: 'Instagram' }), 'meta');
  assert.equal(A.canal({ origem: 'site', utm_source: 'google', utm_medium: 'cpc' }), 'google');
  assert.equal(A.canal({ origem: 'site', utm_source: 'google', utm_medium: 'organic' }), null);
  assert.equal(A.canal({ origem: 'indicacao', origem_paga: null }), null);
});

test('canal pago: origem_paga falso (sabidamente não pago) nunca vira anúncio, nem com utm de rede social', () => {
  assert.equal(A.canal({ origem: 'organico', origem_paga: false, utm_source: 'instagram', utm_medium: 'bio' }), null);
  assert.equal(A.canal({ origem: 'meta', origem_paga: false }), null);
});

test('canal pago: origem_paga verdadeiro sem plataforma válida cai na regra antiga', () => {
  assert.equal(A.canal({ origem: 'google', origem_paga: true, origem_plataforma: null }), 'google');
  assert.equal(A.canal({ origem: 'whatsapp', origem_paga: true, origem_plataforma: 'tiktok' }), null);
});

test('leads.canalDe segue a mesma regra e mantém os canais da tela antiga', () => {
  assert.equal(L.canalDe({ origem: 'whatsapp', origem_paga: true, origem_plataforma: 'google' }), 'google');
  assert.equal(L.canalDe({ origem: 'organico', origem_paga: false, utm_source: 'instagram' }), 'organico');
  assert.equal(L.canalDe({ origem: 'whatsapp' }), 'whatsapp');
  assert.equal(L.canalDe({ origem: 'organico', utm_source: 'site' }), 'site');
});

test('origemDoContato: anúncio da Meta pelo código do site, com campanha, conjunto e anúncio', () => {
  const o = O.origemDoContato({ origem: 'meta', origem_paga: true, origem_plataforma: 'meta', origem_como: 'ref',
    campanha_ext: '1202', campanha_nome: 'Troca de óleo R$ 169', conjunto_ext: '77', conjunto_nome: 'Taubaté 30 km', anuncio_ext: '9', anuncio_nome: 'Vídeo 2' });
  assert.deepEqual(o, {
    canal: 'meta', paga: true, rotulo: 'Anúncio da Meta',
    detalhe: 'Troca de óleo R$ 169 › Taubaté 30 km › Vídeo 2',
    campanha: { ext: '1202', nome: 'Troca de óleo R$ 169' },
    conjunto: { ext: '77', nome: 'Taubaté 30 km' },
    anuncio: { ext: '9', nome: 'Vídeo 2' },
    palavra_chave: null,
    como: 'ref', como_rotulo: 'pelo código do site', certeza: 'certa',
  });
});

test('origemDoContato: anúncio do Google com palavra-chave', () => {
  const o = O.origemDoContato({ origem: 'google', origem_paga: true, origem_plataforma: 'google', origem_como: 'utm',
    campanha_ext: '555', campanha_nome: 'Freios', palavra_chave: 'troca de pastilha taubaté' });
  assert.equal(o.canal, 'google');
  assert.equal(o.rotulo, 'Anúncio do Google');
  assert.equal(o.palavra_chave, 'troca de pastilha taubaté');
  assert.equal(o.detalhe, 'Freios › “troca de pastilha taubaté”');
  assert.equal(o.como_rotulo, 'pelo endereço do anúncio');
  assert.equal(o.certeza, 'provavel');
});

test('origemDoContato: certeza segue a força da evidência (5 e 4 certa, 3 e 2 provável, 1 palpite, 0 nenhuma)', () => {
  const de = como => O.origemDoContato({ origem: 'meta', origem_paga: true, origem_plataforma: 'meta', origem_como: como }).certeza;
  assert.equal(de('ref'), 'certa'); assert.equal(de('referral'), 'certa'); assert.equal(de('formulario'), 'certa');
  assert.equal(de('manual'), 'certa');
  assert.equal(de('utm'), 'provavel'); assert.equal(de('frase'), 'provavel'); assert.equal(de('frase_padrao'), 'provavel');
  assert.equal(de('ia'), 'palpite');
});

test('origemDoContato: rótulo de como soubemos para cada caminho', () => {
  const de = (como, extra = {}) => O.origemDoContato({ origem: 'meta', origem_paga: true, origem_plataforma: 'meta', origem_como: como, ...extra }).como_rotulo;
  assert.equal(de('ref'), 'pelo código do site');
  assert.equal(de('referral'), 'pelo anúncio (WhatsApp)');
  assert.equal(de('formulario'), 'pelo formulário do site');
  assert.equal(de('frase'), 'pela primeira mensagem');
  assert.equal(de('frase_padrao'), 'pela mensagem padrão de anúncio');
  assert.equal(de('ia'), 'palpite da IA');
  assert.equal(de('manual'), 'marcado à mão');
  assert.equal(de('manual', { rastreio: { marcado_por_nome: 'Carlos Souza' } }), 'marcado por Carlos');
  assert.equal(de('ref', { rastreio: { permanente: true } }), 'pelo código da mensagem pronta');
});

test('origemDoContato: contato antigo do WhatsApp sem evidência nenhuma fica como "Ainda não sabemos"', () => {
  const o = O.origemDoContato({ origem: 'whatsapp' });
  assert.equal(o.canal, 'desconhecida');
  assert.equal(o.paga, null);
  assert.equal(o.rotulo, 'Ainda não sabemos');
  assert.equal(o.detalhe, null);
  assert.equal(o.campanha, null);
  assert.equal(o.como, null);
  assert.equal(o.como_rotulo, null);
  assert.equal(o.certeza, 'nenhuma');
  assert.equal(O.origemDoContato({ origem: 'organico' }).canal, 'desconhecida');
  assert.equal(O.origemDoContato({}).canal, 'desconhecida');
});

test('origemDoContato: origem marcada à mão no passado (sem origem_como) vale como certa', () => {
  const meta = O.origemDoContato({ origem: 'meta', utm_campaign: 'Revisão' });
  assert.equal(meta.canal, 'meta'); assert.equal(meta.paga, true); assert.equal(meta.certeza, 'certa');
  assert.equal(meta.como, null); assert.equal(meta.como_rotulo, 'marcado no CRM');
  assert.deepEqual(meta.campanha, { ext: null, nome: 'Revisão' }, 'contato antigo: a campanha é o utm_campaign');
  const ind = O.origemDoContato({ origem: 'indicacao' });
  assert.equal(ind.canal, 'indicacao'); assert.equal(ind.rotulo, 'Indicação'); assert.equal(ind.paga, false); assert.equal(ind.certeza, 'certa');
  assert.equal(O.origemDoContato({ origem: 'passagem' }).rotulo, 'Passou na porta');
  assert.equal(O.origemDoContato({ origem: 'telefone' }).rotulo, 'Telefone');
});

test('origemDoContato: site e link da bio do Instagram são canais próprios e não pagos', () => {
  const site = O.origemDoContato({ origem: 'organico', utm_source: 'site', utm_medium: 'whatsapp', utm_campaign: 'cambio' });
  assert.equal(site.canal, 'site'); assert.equal(site.rotulo, 'Site'); assert.equal(site.paga, false);
  assert.equal(site.certeza, 'provavel', 'tem endereço gravado: não é pendência de origem');
  assert.equal(site.campanha, null, 'o código do site não é campanha de anúncio');
  assert.equal(site.detalhe, 'cambio');
  const bio = O.origemDoContato({ origem: 'organico', origem_paga: false, origem_como: 'frase', utm_source: 'instagram', utm_medium: 'bio' });
  assert.equal(bio.canal, 'instagram'); assert.equal(bio.rotulo, 'Instagram (link da bio)'); assert.equal(bio.paga, false);
  assert.equal(bio.como_rotulo, 'pela primeira mensagem'); assert.equal(bio.certeza, 'provavel');
});

test('origemDoContato: WhatsApp direto só quando se sabe que não veio de anúncio', () => {
  const o = O.origemDoContato({ origem: 'whatsapp', origem_paga: false, origem_como: 'manual' });
  assert.equal(o.canal, 'whatsapp'); assert.equal(o.rotulo, 'WhatsApp direto'); assert.equal(o.paga, false); assert.equal(o.certeza, 'certa');
});

test('origemDoContato: anúncio sem plataforma conhecida não chuta a plataforma', () => {
  const o = O.origemDoContato({ origem: 'whatsapp', origem_paga: true, origem_plataforma: null, origem_como: 'frase' });
  assert.equal(o.canal, 'desconhecida'); assert.equal(o.paga, true);
  assert.equal(o.rotulo, 'Anúncio (não sabemos de qual plataforma)');
});

test('origemDoContato: texto de cliente nunca vira campo solto nem estoura tamanho', () => {
  const grande = 'x'.repeat(500);
  const o = O.origemDoContato({ origem: 'meta', origem_paga: true, origem_plataforma: 'meta', campanha_nome: grande, palavra_chave: grande });
  assert.ok(o.campanha.nome.length <= 120);
  assert.ok(o.palavra_chave.length <= 120);
  assert.ok(o.detalhe.length <= 300);
  assert.deepEqual(Object.keys(o), ['canal', 'paga', 'rotulo', 'detalhe', 'campanha', 'conjunto', 'anuncio', 'palavra_chave', 'como', 'como_rotulo', 'certeza']);
});

test('leads.lerLeads: banco ainda sem a migração (coluna inexistente) cai nas colunas antigas e o app segue', async () => {
  L.esquecerColunasR8();
  const pedidos = [];
  const sb = { from: () => ({ select: colunas => {
    pedidos.push(colunas);
    const novas = /origem_paga/.test(colunas);
    const fim = { range: async () => (novas
      ? { data: null, error: { code: '42703', message: 'column leads.origem_paga does not exist' } }
      : { data: [{ id: 'l1', origem: 'meta' }], error: null }) };
    return { gte: () => ({ lt: () => ({ order: () => ({ order: () => fim }) }) }) };
  } }) };
  const r = await L.lerLeads('2026-11-01', '2026-11-02', { sb });
  assert.equal(r.length, 1);
  assert.equal(pedidos.length, 2, 'tentou com as colunas novas e repetiu com as antigas');
  assert.ok(/origem_paga/.test(pedidos[0]) && !/origem_paga/.test(pedidos[1]));
  assert.equal(L.temColunasR8(), false);
  await L.lerLeads('2026-11-01', '2026-11-02', { sb });
  assert.equal(pedidos.length, 3, 'por 5 minutos pede direto as colunas antigas');
  L.esquecerColunasR8();
  assert.equal(L.temColunasR8(), true);
});

test('leads.lerLeads: erro que não é de coluna inexistente continua virando frase de gente', async () => {
  L.esquecerColunasR8();
  const sb = { from: () => ({ select: () => ({ gte: () => ({ lt: () => ({ order: () => ({ order: () => ({ range: async () => ({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }) }) }) }) }) }) }) };
  await assert.rejects(() => L.lerLeads('2026-11-01', '2026-11-02', { sb }), /Não foi possível ler os leads do CRM/);
  assert.equal(L.temColunasR8(), true, 'erro comum não desliga as colunas novas');
});

test('leads: as colunas lidas trazem a origem nova e nenhum identificador de clique', () => {
  for (const c of ['origem_paga', 'origem_plataforma', 'campanha_ext', 'campanha_nome', 'conjunto_nome', 'anuncio_nome', 'palavra_chave', 'origem_como', 'origem_em', 'motivo_perda', 'motivo_perda_obs']) {
    assert.ok(L.COLUNAS.split(', ').includes(c), c);
  }
  assert.ok(!/gclid|fbclid|ctwa|gbraid|wbraid/.test(L.COLUNAS), 'identificador de clique é dado pessoal: não é lido');
  assert.ok(!/observacoes/.test(L.COLUNAS));
});

test('rótulos e listas do contrato: canais, motivos e etapas com os textos de tela', () => {
  assert.deepEqual(O.CANAIS, ['meta', 'google', 'site', 'instagram', 'indicacao', 'passagem', 'telefone', 'whatsapp', 'desconhecida']);
  assert.equal(O.rotuloDoCanal('meta'), 'Anúncio da Meta');
  assert.equal(O.rotuloDoCanal('desconhecida'), 'Ainda não sabemos');
  assert.equal(O.rotuloDoCanal('outra-coisa'), 'Ainda não sabemos');
});
