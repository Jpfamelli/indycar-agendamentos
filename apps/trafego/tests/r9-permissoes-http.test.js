'use strict';
process.env.TRAFEGO_TELA_ANTIGA = '1'; // rodada 10: estas rotas são da tela antiga e ficam fechadas sem esta chave
/* Rodada 9: o que sai pelo WhatsApp do dono e o que mexe nos números de todos é só do administrador.
   O gestor com o Tráfego liberado continua vendo, simulando e propondo (a mesma regra do fechamento do mês). */
process.env.ADS_CRON_TOKEN = 'chave-de-teste';
const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../auth');
const equipe = require('../equipe');
const db = require('../db');
const whatsapp = require('../whatsapp');
const Radar = require('../radar');
const relatorio = require('../relatorio');
const coletor = require('../coletor');
const { servidor } = require('../server');

const ID = n => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const PAPEIS = {
  admin: { usuario: { id: ID(1), papel: 'admin', apps: [], ativo: true } },
  gestor: { usuario: { id: ID(2), papel: 'gestor', apps: ['ads'], ativo: true } },
};

let base;
const enviados = [], radares = [], relatorios = [], demos = [];
const orig = { identificar: auth.identificar, banco: equipe.banco, lerConfig: db.lerConfig, enviar: whatsapp.enviarParaTodos, rodar: Radar.rodar,
  gerar: relatorio.gerarEEnviar, popular: coletor.popularDemo, apagar: db.apagarDemo, temChaves: db.temChaves, temDadosReais: db.temDadosReais };

test.before(async () => {
  auth.identificar = async req => PAPEIS[req.headers['x-papel']] || { motivo: 'sem_token' };
  equipe.banco = () => ({ tocarAcesso: async () => true, auditar: async () => true });
  db.lerConfig = async () => ({ whatsapp_destinos: ['5512990001234'], margem_pct: 45 });
  whatsapp.enviarParaTodos = async (d, t) => { enviados.push(t); return d.map(x => ({ destino: x, ok: true })); };
  Radar.rodar = async (o) => { radares.push(o); return { avaliadas: 0, disparados: 0, suprimidos: 0, alertas: [], envio: null }; };
  relatorio.gerarEEnviar = async (o) => { relatorios.push(o); return { texto: 'resumo', enviado: o.enviar === true, envio: [] }; };
  coletor.popularDemo = async (dias) => { demos.push(dias); return { ok: true, dias }; };
  db.apagarDemo = async () => { demos.push('apagou'); };
  db.temChaves = async () => false; db.temDadosReais = async () => false;
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
test.after(async () => {
  auth.identificar = orig.identificar; equipe.banco = orig.banco; db.lerConfig = orig.lerConfig; whatsapp.enviarParaTodos = orig.enviar;
  Radar.rodar = orig.rodar; relatorio.gerarEEnviar = orig.gerar; coletor.popularDemo = orig.popular; db.apagarDemo = orig.apagar;
  db.temChaves = orig.temChaves; db.temDadosReais = orig.temDadosReais;
  servidor.closeAllConnections?.();
  await new Promise(r => servidor.close(r));
});

async function pedir(caminho, papel, corpo = {}) {
  const r = await fetch(base + caminho, { method: 'POST', headers: { 'x-papel': papel, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  return { status: r.status, json: await r.json().catch(() => null) };
}

test('gestor não manda nada pelo WhatsApp do dono: teste, relatório e alertas pedem administrador', async () => {
  for (const [caminho, corpo] of [['/api/whatsapp/testar', {}], ['/api/relatorio', { enviar: true }], ['/api/radar', { enviar: true }]]) {
    const r = await pedir(caminho, 'gestor', corpo);
    assert.equal(r.status, 403, caminho);
    assert.equal(r.json.codigo, 'so_admin', caminho);
    assert.match(r.json.erro, /Só o administrador pode/, caminho);
  }
  assert.equal(enviados.length, 0, 'nada entrou na fila do WhatsApp');
  assert.ok(!radares.some(o => o.enviar), 'o radar não rodou enviando');
  assert.ok(!relatorios.some(o => o.enviar), 'o relatório não rodou enviando');
});

test('gestor continua simulando o radar e vendo o relatório (sem enviar)', async () => {
  assert.equal((await pedir('/api/radar', 'gestor', {})).status, 200);
  assert.equal((await pedir('/api/relatorio', 'gestor', { enviar: false })).status, 200);
});

test('administrador manda o teste e o relatório', async () => {
  assert.equal((await pedir('/api/whatsapp/testar', 'admin')).status, 200);
  assert.equal(enviados.length, 1);
  assert.equal((await pedir('/api/relatorio', 'admin', { enviar: true })).status, 200);
  assert.ok(relatorios.some(o => o.enviar === true));
});

test('demonstração (pôr ou tirar) é só do administrador', async () => {
  const g = await pedir('/api/demo', 'gestor', { dias: 30 });
  assert.equal(g.status, 403);
  assert.equal((await pedir('/api/demo', 'gestor', { limpar: true })).status, 403);
  assert.equal(demos.length, 0, 'nada foi gravado nem apagado');
  assert.equal((await pedir('/api/demo', 'admin', { dias: 30 })).status, 200);
  assert.deepEqual(demos, [30]);
});
