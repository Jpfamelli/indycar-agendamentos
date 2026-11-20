'use strict';
/* Rodada 10: desempenho com número (idas ao CodeWords, consultas ao banco, bytes na rede) e
   dois consertos de exclusão. server.js de verdade com banco e rede de mentira. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { comServidorR10, tabelasBase, resposta, jwt, ID } = require('./apoio/r10-servidor.js');

const uid = n => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const conexoes = u => (u.endsWith('/connections') ? resposta(200, [{ phone_id: 'aparelho-1', phone_number: '+5512996830272', status: 'logged_in', service_path: 'fluxo_teste/webhook' }]) : null);

/** Pedido cru (sem descomprimir) para medir o que passa na rede. */
function cru(base, caminho, como) {
  return new Promise((ok, ko) => {
    http.get(base + caminho, { headers: { Authorization: `Bearer ${jwt(ID[como])}`, 'Accept-Encoding': 'gzip' } }, r => {
      const p = []; r.on('data', c => p.push(c)); r.on('end', () => ok({ status: r.statusCode, cab: r.headers, bytes: Buffer.concat(p).length, corpo: Buffer.concat(p) }));
    }).on('error', ko);
  });
}

test('R10-ATD-024: excluir conversa com mais de 1.000 mensagens guarda a cópia inteira antes de apagar', async () => {
  const msgs = Array.from({ length: 1500 }, (_, i) => ({ id: uid(i + 1), conversa_id: ID.conversa, telefone: '12988887777', corpo: 'mensagem ' + i, direcao: i % 2 ? 'saida' : 'entrada',
    created_at: new Date(Date.UTC(2026, 9, 1, 12, 0, i)).toISOString() }));
  await comServidorR10({ tabelas: tabelasBase({ whatsapp_mensagens: msgs }), tetoLinhas: 1000 }, async ({ pedir, sb }) => {
    const r = await pedir('/api/conversas/excluir', { metodo: 'POST', como: 'admin', corpo: { conversaId: ID.conversa } });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.apagadas, 1500);
    const copia = sb.db.codewords_eventos.find(e => /conversa excluída/.test(e.resumo));
    assert.equal(copia.payload.mensagens.length, 1500, 'a cópia tem todas as mensagens (o banco entrega 1.000 por vez)');
    assert.equal(copia.payload.mensagens[1499].corpo, 'mensagem 1499');
    assert.equal(sb.db.conversas.length, 0);
  });
});

test('R10-ATD-025: apagar mensagens de duas conversas de uma vez corrige a prévia das duas', async () => {
  const tabelas = tabelasBase({ whatsapp_mensagens: [
    { id: uid(1), conversa_id: ID.conversa, telefone: '12988887777', corpo: 'fica', direcao: 'entrada', created_at: '2026-10-01T12:00:00Z' },
    { id: uid(2), conversa_id: ID.conversa, telefone: '12988887777', corpo: 'apagar A', direcao: 'entrada', created_at: '2026-10-01T12:05:00Z' },
    { id: uid(3), conversa_id: ID.conversa2, telefone: '12977776666', corpo: 'fica B', direcao: 'entrada', created_at: '2026-10-01T13:00:00Z' },
    { id: uid(4), conversa_id: ID.conversa2, telefone: '12977776666', corpo: 'apagar B', direcao: 'entrada', created_at: '2026-10-01T13:05:00Z' },
  ] });
  tabelas.conversas[0].ultima_previa = 'apagar A';
  tabelas.conversas.push({ id: ID.conversa2, telefone: '12977776666', nome: 'Zé', ultima_previa: 'apagar B', ultima_mensagem_em: '2026-10-01T13:05:00Z' });
  await comServidorR10({ tabelas }, async ({ pedir, sb }) => {
    const r = await pedir('/api/mensagens/excluir', { metodo: 'POST', como: 'gestor', corpo: { ids: [uid(2), uid(4)] } });
    assert.equal(r.status, 200);
    const [a, b] = [ID.conversa, ID.conversa2].map(id => sb.db.conversas.find(c => c.id === id));
    assert.equal(a.ultima_previa, 'fica');
    assert.equal(b.ultima_previa, 'fica B', 'a segunda conversa não fica mostrando texto de mensagem apagada');
    assert.equal(b.ultima_mensagem_em, '2026-10-01T13:00:00Z');
  });
});

test('R10-ATD-026: estado do WhatsApp: pedidos juntos e seguidos viram uma ida só ao CodeWords', async () => {
  await comServidorR10({ rede: conexoes }, async ({ pedir, chamadas }) => {
    const juntos = await Promise.all(['admin', 'atendente', 'gestor', 'admin', 'atendente', 'gestor'].map(como => pedir('/api/whatsapp/status', { como })));
    for (const r of juntos) { assert.equal(r.status, 200); assert.equal(r.corpo.conectado, true); }
    await pedir('/api/whatsapp/status', { como: 'admin' });
    await pedir('/api/whatsapp/status', { como: 'atendente' });
    const idas = chamadas.filter(c => c.url.endsWith('/connections')).length;
    console.log(`      [medida] idas ao CodeWords para 8 pedidos de estado em sequência curta: ${idas} (antes: 8)`);
    assert.equal(idas, 1);
  });
});

test('R10-ATD-027: primeiro acesso já fechado não consulta o banco de novo a cada abertura da tela de entrada', async () => {
  await comServidorR10({}, async ({ pedir, sb }) => {
    for (let i = 0; i < 10; i++) assert.equal((await pedir('/api/primeiro-acesso')).corpo.aberto, false);
    const consultas = sb.log.filter(l => l.tabela === 'perfis' && l.op === 'select').length;
    console.log(`      [medida] consultas ao banco em 10 aberturas da tela de entrada: ${consultas} (antes: 10)`);
    assert.equal(consultas, 1);
    const tentativa = await pedir('/api/primeiro-acesso', { metodo: 'POST', corpo: { nome: 'X', email: 'x@teste.invalid', senha: '12345678' } });
    assert.equal(tentativa.status, 403);
  });
  // com o banco vazio continua aberto e conferindo a cada vez (ninguém fica trancado para fora)
  await comServidorR10({ tabelas: tabelasBase({ perfis: [] }) }, async ({ pedir }) => {
    assert.equal((await pedir('/api/primeiro-acesso')).corpo.aberto, true);
    assert.equal((await pedir('/api/primeiro-acesso')).corpo.aberto, true);
  });
});

test('R10-ATD-028: respostas grandes da fila, da equipe e das tarefas saem comprimidas', async () => {
  const conversas = Array.from({ length: 300 }, (_, i) => ({ id: uid(1000 + i), telefone: '129' + String(80000000 + i), telefone_e164: '55129' + String(80000000 + i), nome: 'Cliente de teste ' + i,
    cliente_id: null, atribuida_a: ID.atendente, status: 'aberta', tipo: 'atendimento', nao_lidas: 2, ultima_mensagem_em: new Date(Date.now() - i * 60000).toISOString(), ultima_previa: 'Bom dia, queria um horário para revisão ' + i }));
  const perfis = tabelasBase().perfis.concat(Array.from({ length: 40 }, (_, i) => ({ ...tabelasBase().perfis[1], id: uid(5000 + i), nome: 'Atendente ' + i, email: `a${i}@teste.invalid` })));
  await comServidorR10({ tabelas: tabelasBase({ conversas, perfis }) }, async ({ base }) => {
    const medidas = [];
    for (const [caminho, como] of [['/api/r6/fila', 'atendente'], ['/api/equipe/nomes', 'atendente']]) {
      const r = await cru(base, caminho, como);
      assert.equal(r.status, 200, caminho);
      assert.equal(r.cab['content-encoding'], 'gzip', caminho);
      assert.match(String(r.cab.vary), /Accept-Encoding/);
      const inteiro = require('node:zlib').gunzipSync(r.corpo).length;
      assert.ok(r.bytes < inteiro * 0.4, `${caminho}: ${r.bytes} de ${inteiro}`);
      medidas.push(`${caminho} ${inteiro} → ${r.bytes} bytes`);
    }
    console.log('      [medida] ' + medidas.join(' · '));
    // resposta pequena continua crua (comprimir custaria mais do que economiza)
    const pequena = await cru(base, '/api/r6/zap', 'atendente');
    assert.equal(pequena.cab['content-encoding'], undefined);
  });
});
