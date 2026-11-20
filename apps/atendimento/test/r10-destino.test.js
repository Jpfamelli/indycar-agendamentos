'use strict';
/* Rodada 10: para onde o servidor manda a chave e as mensagens (CodeWords), a regra do navegador (CSP)
   e erros que não saem crus para a tela. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { comServidorR10, tabelasBase, resposta, ID } = require('./apoio/r10-servidor.js');

test('R10-ATD-018: endereço do CodeWords só vale https e público; nome de serviço sem "../"', async () => {
  const D = require('../lib/destino-codewords.js');
  for (const ruim of ['http://runtime.codewords.ai', 'https://localhost:8080', 'https://127.0.0.1', 'https://10.0.0.5', 'https://192.168.1.10', 'https://172.20.1.1',
    'https://169.254.169.254/latest/meta-data', 'https://[::1]', 'https://intranet', 'https://banco.internal', 'file:///etc/passwd', 'https://usuario:senha@exemplo.com', 'nada']) {
    assert.equal(D.enderecoSeguro(ruim, { local: false }).ok, false, ruim);
  }
  assert.deepEqual(D.enderecoSeguro('https://runtime.codewords.ai/', { local: false }), { ok: true, url: 'https://runtime.codewords.ai' });
  assert.equal(D.destinoDoCodeWords({}, { local: false }).base, 'https://runtime.codewords.ai');
  assert.equal(D.destinoDoCodeWords({ servico_conexao: '../../admin' }, { local: false }).ok, false);
  assert.equal(D.destinoDoCodeWords({ service_id: 'fluxo/../x' }, { local: false }).ok, false);
  assert.equal(D.destinoDoCodeWords({ url_envio: 'http://exemplo.com/envia' }, { local: false }).ok, false);
  assert.equal(D.enderecoSeguro('http://localhost:3999', { local: true }).ok, true, 'o servidor de mentira local continua valendo com CODEWORDS_LOCAL=1');

  // no servidor: com endereço interno gravado na configuração, nada sai (nem a chave, nem a mensagem)
  const tabelas = tabelasBase();
  tabelas.codewords_config[0].base_url = 'http://169.254.169.254';
  await comServidorR10({ tabelas, rede: () => resposta(200, '{"status":"success"}') }, async ({ pedir, chamadas, sb }) => {
    const r = await pedir('/api/enviar', { metodo: 'POST', como: 'atendente', corpo: { telefone: '12988887777', corpo: 'oi' } });
    assert.equal(r.corpo.ok, false);
    assert.match(r.corpo.erro, /https/);
    const arq = await pedir('/api/mensagens/enviar-arquivo', { metodo: 'POST', como: 'atendente',
      corpo: { telefone: '12988887777', nome_arquivo: 'a.pdf', mime: 'application/pdf', base64: 'YQ==', conversaId: ID.conversa } });
    assert.equal(arq.status, 503);
    const st = await pedir('/api/whatsapp/status', { como: 'admin' });
    assert.equal(st.corpo.conectado, null);
    await pedir('/api/conversas/assumir', { metodo: 'POST', como: 'atendente', corpo: { conversaId: ID.conversa } });
    await pedir('/api/codewords/testar-chave', { metodo: 'POST', como: 'admin', corpo: {} });
    assert.equal(chamadas.length, 0, 'nenhuma chamada saiu: ' + chamadas.map(c => c.url).join(', '));
    assert.match(sb.db.codewords_config[0].ultimo_erro, /https/, 'o motivo aparece em Integrações');
  });
});

test('R10-ATD-019: a regra do navegador (CSP) não libera conexão com a CDN, só com o próprio app e o Supabase', async () => {
  const S = require('../lib/seguranca.js');
  const csp = S.politicaCSP({ supabaseUrl: 'https://abc.supabase.co' });
  const connect = csp.split('; ').find(d => d.startsWith('connect-src'));
  assert.equal(connect, "connect-src 'self' https://abc.supabase.co wss://abc.supabase.co");
  // nenhum arquivo da tela faz pedido para a CDN (o <script> de reserva usa script-src, não connect-src)
  const pub = path.join(__dirname, '..', 'public');
  for (const f of fs.readdirSync(pub).filter(x => x.endsWith('.js'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(pub, f), 'utf8'), /fetch\([^)]*jsdelivr|importScripts\([^)]*jsdelivr/, f);
  }
});
