'use strict';
/* Servidor com os papéis da casa (porteiro e banco falsos): quem entra,
   quem recebe 403 com o código certo, e os cabeçalhos de segurança. */
const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../auth');
const equipe = require('../equipe');
const db = require('../db');
const { servidor, limitador } = require('../server');

const ID = n => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const PAPEIS = {
  admin: { usuario: { id: ID(1), papel: 'admin', apps: [], ativo: true } },
  gestor: { usuario: { id: ID(2), papel: 'gestor', apps: ['crm', 'ads'], ativo: true } },
  gestor_sem_ads: { usuario: { id: ID(3), papel: 'gestor', apps: ['crm'], ativo: true } },
  atendente: { usuario: { id: ID(4), papel: 'atendente', apps: ['atendimento', 'ads'], ativo: true } },
  agenda: { usuario: { id: ID(5), papel: 'agenda', apps: ['agenda'], ativo: true } },
  trocar: { usuario: { id: ID(6), papel: 'admin', apps: [], ativo: true, precisa_trocar_senha: true } },
  mfa_aal1: { usuario: { id: ID(7), papel: 'admin', apps: [], ativo: true, mfa: true, aal: 'aal1' } },
  mfa_aal2: { usuario: { id: ID(8), papel: 'admin', apps: [], ativo: true, mfa: true, aal: 'aal2' } },
  desativado: { motivo: 'desativado' },
  vencido: { motivo: 'vencido' },
};

let base;
const auditorias = [], metas = [];
const orig = { identificar: auth.identificar, banco: equipe.banco, lerConfig: db.lerConfig, apagarRegra: db.apagarRegra };
test.before(async () => {
  auth.identificar = async req => PAPEIS[req.headers['x-papel']] || { motivo: 'sem_token' };
  const falso = {
    tocarAcesso: async () => true,
    auditar: async (u, acao, o) => { auditorias.push({ u: u.id, acao, o }); return true; },
    salvarPerfil: async () => {}, senhaTrocada: async () => {},
    lerMetaLoja: async () => null,
    salvarMetaLoja: async m => { metas.push(m); return { id: 'm1', ...m }; },
  };
  equipe.banco = () => falso;
  db.lerConfig = async () => ({ whatsapp_destinos: [], margem_pct: 100 });
  db.apagarRegra = async () => {};
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
test.after(async () => {
  Object.assign(auth, { identificar: orig.identificar });
  equipe.banco = orig.banco; db.lerConfig = orig.lerConfig; db.apagarRegra = orig.apagarRegra;
  servidor.closeAllConnections?.();
  await new Promise(r => servidor.close(r));
});

async function pedir(caminho, papel, { metodo = 'GET', corpo, cabecalhos = {} } = {}) {
  const r = await fetch(base + caminho, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined,
    headers: { 'x-papel': papel || '', 'Content-Type': 'application/json', ...cabecalhos } });
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch {}
  return { status: r.status, json, headers: r.headers };
}

test('admin e gestor com ads entram; gestor sem ads, atendente e agenda recebem 403 sem_acesso com os links', async () => {
  assert.equal((await pedir('/api/config', 'admin')).status, 200);
  assert.equal((await pedir('/api/config', 'gestor')).status, 200);
  for (const p of ['gestor_sem_ads', 'atendente', 'agenda']) {
    const r = await pedir('/api/config', p);
    assert.equal(r.status, 403, p);
    assert.equal(r.json.codigo, 'sem_acesso');
    assert.equal(r.json.erro, 'Você não tem acesso a este app.');
    assert.ok(Array.isArray(r.json.apps));
  }
  const ag = await pedir('/api/config', 'agenda');
  assert.deepEqual(ag.json.apps.map(a => a.app), ['agenda']);
});

test('/api/eu funciona para quem não tem acesso (a tela precisa saber quem é)', async () => {
  const r = await pedir('/api/eu', 'atendente');
  assert.equal(r.status, 200);
  assert.equal(r.json.acesso, false);
  assert.equal(r.json.papel, 'atendente');
  assert.equal((await pedir('/api/eu', 'gestor')).json.acesso, true);
});

test('desativado = 403 desativado; vencido = 401 sessao_vencida; sem token = 401 login', async () => {
  const d = await pedir('/api/config', 'desativado');
  assert.equal(d.status, 403); assert.equal(d.json.codigo, 'desativado');
  const v = await pedir('/api/config', 'vencido');
  assert.equal(v.status, 401); assert.equal(v.json.codigo, 'sessao_vencida');
  const s = await pedir('/api/config', '');
  assert.equal(s.status, 401); assert.equal(s.json.codigo, 'login');
});

test('precisa trocar senha: só /api/eu e /api/eu/senha-trocada respondem', async () => {
  const r = await pedir('/api/config', 'trocar');
  assert.equal(r.status, 403); assert.equal(r.json.codigo, 'trocar_senha');
  assert.equal((await pedir('/api/eu', 'trocar')).status, 200);
  const t = await pedir('/api/eu/senha-trocada', 'trocar', { metodo: 'POST' });
  assert.equal(t.status, 200);
  assert.ok(auditorias.some(a => a.acao === 'senha_trocada'));
});

test('duas etapas ligada: sessão só com senha (aal1) recebe 403 mfa; com código (aal2) entra', async () => {
  const r = await pedir('/api/config', 'mfa_aal1');
  assert.equal(r.status, 403); assert.equal(r.json.codigo, 'mfa');
  assert.equal((await pedir('/api/config', 'mfa_aal2')).status, 200);
});

test('ações sensíveis ficam na auditoria: apagar regra (com UUID validado) e salvar meta', async () => {
  assert.equal((await pedir('/api/regras?id=nao-e-uuid', 'admin', { metodo: 'DELETE' })).status, 400);
  assert.equal((await pedir(`/api/regras?id=${ID(9)}`, 'admin', { metodo: 'DELETE' })).status, 200);
  assert.ok(auditorias.some(a => a.acao === 'ads_regra_apagada' && a.o.registro === ID(9)));
  const m = await pedir('/api/metas', 'gestor', { metodo: 'POST', corpo: { mes: '2026-10', leads: 120, agendamentos: 40 } });
  assert.equal(m.status, 200);
  assert.deepEqual(metas[0], { mes: '2026-10-01', leads: 120, agendamentos: 40 });
  assert.ok(auditorias.some(a => a.acao === 'ads_meta_salva' && a.u === ID(2)));
  assert.equal((await pedir('/api/metas', 'gestor', { metodo: 'POST', corpo: { mes: 'outubro' } })).status, 400);
});

test('perfil: papel e apps nunca passam pelo /api/eu; nome vazio é 400', async () => {
  assert.equal((await pedir('/api/eu', 'gestor', { metodo: 'POST', corpo: { nome: '' } })).status, 400);
  assert.equal((await pedir('/api/eu', 'gestor', { metodo: 'POST', corpo: { nome: 'Gê', papel: 'admin' } })).status, 200);
});

test('cabeçalhos: CSP com frame-ancestors none, HSTS, Permissions-Policy e nosniff', async () => {
  const r = await fetch(base + '/');
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /script-src 'self'(;|$)/, 'nenhum script de fora');
  assert.match(r.headers.get('strict-transport-security'), /max-age=31536000/);
  assert.match(r.headers.get('permissions-policy'), /camera=\(\)/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
});

test('o cliente do Supabase é servido daqui (sem CDN) e a página não chama script de fora', async () => {
  const v = await fetch(base + '/vendor/supabase.js');
  assert.equal(v.status, 200);
  assert.match(v.headers.get('content-type'), /javascript/);
  const html = await (await fetch(base + '/')).text();
  assert.ok(!/<script[^>]+src="https?:/i.test(html), 'nenhum <script src> externo');
  assert.ok(!/<script>(?!\s*<\/script>)/i.test(html), 'nenhum script embutido (a CSP barraria)');
});

test('CORS: origem de fora é 403; do ecossistema recebe Allow-Origin; OPTIONS responde 204', async () => {
  const fora = await pedir('/api/config', 'admin', { cabecalhos: { Origin: 'https://site-malvado.com' } });
  assert.equal(fora.status, 403);
  assert.equal(fora.json.erro, 'origem não permitida');
  const casa = await pedir('/api/config', 'admin', { cabecalhos: { Origin: 'https://indycar-crm.onrender.com' } });
  assert.equal(casa.status, 200);
  assert.equal(casa.headers.get('access-control-allow-origin'), 'https://indycar-crm.onrender.com');
  const pre = await fetch(base + '/api/config', { method: 'OPTIONS', headers: { Origin: 'https://indycar-crm.onrender.com' } });
  assert.equal(pre.status, 204);
});

test('limite por usuário nas rotas caras: a 7ª leitura da IA em 10 min é 429 com Retry-After', async () => {
  limitador.limpar();
  // Não chega na IA: o limite é conferido antes; as 6 primeiras falham por outro motivo (sem chave), tudo bem.
  const leitura = require('../leitura'); const g = leitura.gerar;
  leitura.gerar = async () => ({ ok: true, texto: 'x' });
  try {
    for (let i = 0; i < 6; i++) assert.equal((await pedir('/api/ia/leitura', 'admin', { metodo: 'POST' })).status, 200);
    const r = await pedir('/api/ia/leitura', 'admin', { metodo: 'POST' });
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
    assert.equal((await pedir('/api/ia/leitura', 'gestor', { metodo: 'POST' })).status, 200, 'outra pessoa não é afetada');
  } finally { leitura.gerar = g; limitador.limpar(); }
});

test('limite por IP: acima de 300 chamadas por minuto vira 429', async () => {
  limitador.limpar();
  let ultimo;
  for (let i = 0; i < 301; i++) ultimo = await fetch(base + '/api/ping');
  assert.equal(ultimo.status, 429);
  limitador.limpar();
});

test('erro interno não vaza detalhe do banco', async () => {
  db.lerConfig = async () => { throw new Error('lerConfig: permission denied for table ads_config'); };
  const erro = console.error; console.error = () => {};
  try {
    const r = await pedir('/api/config', 'admin');
    assert.equal(r.status, 500);
    assert.ok(!r.json.erro.includes('permission'));
  } finally { console.error = erro; db.lerConfig = async () => ({ whatsapp_destinos: [] }); }
});

/* ---------------- rodada 5: rotas novas obedecem ao mesmo porteiro ---------------- */
test('rodada 5: /api/leads, /api/leads.csv, /api/alertas.csv, /api/fila e /api/regras/ativa exigem acesso ao Ads', async () => {
  for (const c of ['/api/leads', '/api/leads/hoje', '/api/leads.csv', '/api/alertas.csv', '/api/fila']) {
    assert.equal((await pedir(c, 'gestor_sem_ads')).status, 403, c);
    assert.equal((await pedir(c, 'atendente')).json.codigo, 'sem_acesso', c);
    assert.equal((await pedir(c)).status, 401, c);
  }
  const r = await pedir('/api/regras/ativa', 'admin', { metodo: 'POST', corpo: { id: 'nao-e-uuid', ativa: true } });
  assert.equal(r.status, 400);
  assert.match(r.json.erro, /id da regra/);
  // período e filtros inválidos são 400 antes de qualquer ida ao banco
  const p = await pedir('/api/leads?de=2026-13-99&ate=2026-01-01', 'admin');
  assert.equal(p.status, 400);
});

/* ---------------- revisão de segurança (19/11), achado 4: o que só o administrador faz ---------------- */
test('gestor com o Tráfego não manda o fechamento, não troca acesso da Meta/Google nem os números dos relatórios', async () => {
  const casos = [
    ['/api/fechamento/enviar', { mes: '2026-10' }],
    ['/api/integracoes', { canal: 'meta', meta_access_token: 'x' }],
    ['/api/config', { whatsapp_destinos: ['5512999999999'] }],
  ];
  for (const [c, corpo] of casos) {
    const g = await pedir(c, 'gestor', { metodo: 'POST', corpo });
    assert.equal(g.status, 403, c);
    assert.equal(g.json.codigo, 'so_admin', c);
    const a = await pedir(c, 'admin', { metodo: 'POST', corpo });
    assert.notEqual(a.status, 403, c + ': o administrador passa da porta');
  }
  // o resto da configuração (metas, verba) o gestor continua salvando
  const metas = await pedir('/api/config', 'gestor', { metodo: 'POST', corpo: { meta_cpl: 30 } });
  assert.notEqual(metas.status, 403);
});
