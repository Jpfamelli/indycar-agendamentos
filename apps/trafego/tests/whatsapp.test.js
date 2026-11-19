'use strict';
/* Rodada 5: o Ads não fala mais com o CodeWords. Toda mensagem entra na fila do
   Comunicar (posvenda_envios, criado_por 'ads', tipo 'avulsa') com chave única.
   Aqui o banco é um dublê: nada de rede. */
const test = require('node:test');
const assert = require('node:assert/strict');
const wa = require('../whatsapp');
const Fila = require('../fila');

/* Dublê do supabase-js: from('posvenda_envios').insert().select().single() e a listagem. */
function sbFalso({ falharComDuplicata = false, falharComErro = null, linhas = [] } = {}) {
  const inseridas = [];
  const sb = {
    inseridas,
    from(tabela) {
      assert.equal(tabela, 'posvenda_envios');
      return {
        insert(linha) {
          inseridas.push(linha);
          return { select: () => ({ single: async () => {
            if (falharComDuplicata) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
            if (falharComErro) return { data: null, error: { message: falharComErro } };
            return { data: { id: `env-${inseridas.length}`, status: 'pendente', enviar_em: linha.enviar_em }, error: null };
          } }) };
        },
        select() { return { eq: () => ({ order: () => ({ limit: async () => ({ data: linhas, error: null }) }) }) }; },
      };
    },
  };
  return sb;
}

test('normalizar: só dígitos e acrescenta 55 quando falta o país', () => {
  assert.equal(wa.normalizar('(12) 97403-2299'), '5512974032299');
  assert.equal(wa.normalizar('+55 12 97403-2299'), '5512974032299');
  assert.equal(wa.normalizar(''), '');
});

test('enviar: entra na fila do Comunicar com criado_por ads, tipo avulsa, pendente e chave única', async () => {
  const sb = sbFalso();
  wa.usarFila(Fila.criar(sb));
  const r = await wa.enviar('12 97403-2299', 'Olá, teste', { chave: 'ads:relatorio:2026-10-15' });
  assert.equal(r.via, 'fila');
  assert.equal(r.id, 'env-1');
  assert.equal(r.duplicada, false);
  const l = sb.inseridas[0];
  assert.equal(l.telefone, '5512974032299');
  assert.equal(l.criado_por, 'ads');
  assert.equal(l.tipo, 'avulsa');
  assert.equal(l.status, 'pendente');
  assert.equal(l.chave_unica, 'ads:relatorio:2026-10-15:5512974032299');
  assert.equal(l.corpo, 'Olá, teste');
  assert.ok(l.enviar_em);
  wa.usarFila(null);
});

test('chave repetida não é erro: a fila já tinha a mensagem (duplicada: true)', async () => {
  wa.usarFila(Fila.criar(sbFalso({ falharComDuplicata: true })));
  const r = await wa.enviar('5512974032299', 'de novo', { chave: 'x' });
  assert.equal(r.duplicada, true);
  assert.equal(r.id, null);
  wa.usarFila(null);
});

test('erro do banco vira frase clara e enviarParaTodos segue para os outros números', async () => {
  const sb = sbFalso({ falharComErro: 'permission denied' });
  wa.usarFila(Fila.criar(sb));
  const r = await wa.enviarParaTodos(['12 97403-2299', '5512988887777'], 'texto', { chave: 'ads:radar:abc' });
  assert.equal(r.length, 2);
  assert.ok(r.every(x => !x.ok));
  assert.match(r[0].erro, /Fila do Comunicar não aceitou/);
  // Chave recebe o sufixo do telefone: o mesmo texto pode ir para dois números.
  assert.equal(sb.inseridas[0].chave_unica, 'ads:radar:abc:5512974032299');
  assert.equal(sb.inseridas[1].chave_unica, 'ads:radar:abc:5512988887777');
  wa.usarFila(null);
});

test('destino vazio e mensagem vazia não chegam à fila', async () => {
  const sb = sbFalso();
  wa.usarFila(Fila.criar(sb));
  await assert.rejects(wa.enviar('', 'x'), /destino vazio/);
  await assert.rejects(wa.enviar('5512974032299', '   '), /Mensagem vazia/);
  await assert.rejects(Fila.criar(sb).enfileirar({ telefone: '123', corpo: 'x' }), /inválido/);
  assert.equal(sb.inseridas.length, 0);
  wa.usarFila(null);
});

test('texto é cortado em 3900 caracteres (abaixo do teto do CodeWords)', async () => {
  const sb = sbFalso();
  wa.usarFila(Fila.criar(sb));
  await wa.enviar('5512974032299', 'a'.repeat(5000));
  assert.equal(sb.inseridas[0].corpo.length, 3900);
  wa.usarFila(null);
});

test('situacao: conta por status, acha o último enviado e a última falha', async () => {
  const linhas = [
    { id: '1', telefone: '55129', status: 'pendente', created_at: '2026-10-16T10:00:00Z', enviar_em: '2026-10-16T10:00:00Z' },
    { id: '2', telefone: '55129', status: 'enviado', enviado_em: '2026-10-15T11:00:00Z', created_at: '2026-10-15T10:00:00Z' },
    { id: '3', telefone: '55129', status: 'falhou', erro: 'chave do CodeWords recusada (401)', created_at: '2026-10-14T10:00:00Z' },
  ];
  const s = await Fila.criar(sbFalso({ linhas })).situacao();
  assert.deepEqual(s.por_status, { pendente: 1, enviado: 1, falhou: 1, cancelado: 0, pulado: 0 });
  assert.equal(s.ultimo_enviado_em, '2026-10-15T11:00:00Z');
  assert.match(s.ultima_falha.erro, /401/);
  assert.equal(s.recentes.length, 3);
});

test('status: traduz o problema do vigia e diz que o canal é a fila do Comunicar', async () => {
  const fila = { situacao: async () => ({ por_status: { pendente: 2, enviado: 0, falhou: 0, cancelado: 0, pulado: 0 }, recentes: [] }) };
  const s = await wa.status({ fresco: true, deps: { fila, lerVigia: async () => ({ problema: 'codewords-chave-recusada', checado_em: '2026-10-16T10:00:00Z' }) } });
  assert.equal(s.via, 'fila do Comunicar');
  assert.equal(s.pronto, false);
  assert.match(s.canal.erro, /CodeWords recusada/);
  assert.equal(s.fila.por_status.pendente, 2);
  const ok = await wa.status({ fresco: true, deps: { fila, lerVigia: async () => ({ problema: null }) } });
  assert.equal(ok.pronto, true);
  assert.equal(ok.canal.erro, null);
});
