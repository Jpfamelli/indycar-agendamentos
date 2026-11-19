'use strict';
/* Rodada 3: regra de acesso por papel + apps, perfil público, metas,
   notificações para gestores, auditoria e último acesso (banco falso). */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../equipe');

const P = {
  admin: { id: '11111111-1111-4111-8111-111111111111', papel: 'admin', apps: [] },
  gestorComAds: { id: '22222222-2222-4222-8222-222222222222', papel: 'gestor', apps: ['crm', 'ads'] },
  gestorSemAds: { id: '33333333-3333-4333-8333-333333333333', papel: 'gestor', apps: ['crm'] },
  atendenteComAds: { id: '44444444-4444-4444-8444-444444444444', papel: 'atendente', apps: ['atendimento', 'crm', 'ads'] },
  agenda: { id: '55555555-5555-4555-8555-555555555555', papel: 'agenda', apps: ['agenda', 'crm'] },
};

test('acessoAds: admin sempre; gestor só com ads; atendente e agenda nunca', () => {
  assert.equal(E.acessoAds(P.admin).ok, true);
  assert.equal(E.acessoAds(P.gestorComAds).ok, true);
  assert.deepEqual(E.acessoAds(P.gestorSemAds), { ok: false, motivo: 'sem_app' });
  assert.deepEqual(E.acessoAds(P.atendenteComAds), { ok: false, motivo: 'papel' });
  assert.deepEqual(E.acessoAds(P.agenda), { ok: false, motivo: 'papel' });
  assert.deepEqual(E.acessoAds(null), { ok: false, motivo: 'login' });
  assert.equal(E.acessoAds({ papel: 'gestor', apps: null }).ok, false);
});

test('appsDaPessoa: links só do que a pessoa usa; papel agenda vê só a Agenda', () => {
  assert.deepEqual(E.appsDaPessoa(P.gestorSemAds).map(a => a.app), ['crm']);
  assert.deepEqual(E.appsDaPessoa(P.agenda).map(a => a.app), ['agenda']);
  // Rodada 5: os apps vêm de public/ecossistema.js (COM_LOGIN menos o próprio Ads).
  assert.equal(E.appsDaPessoa(P.admin).length, require('../public/ecossistema.js').COM_LOGIN.length - 1);
  assert.ok(E.appsDaPessoa(P.admin).some(a => a.app === 'patio'));
  assert.ok(E.appsDaPessoa(P.atendenteComAds).every(a => a.url.startsWith('https://')));
});

test('perfilPublico: diz se tem acesso e nunca carrega campos estranhos', () => {
  const p = E.perfilPublico({ ...P.gestorSemAds, email: 'g@x.com', nome: 'Gê', token: 'SEGREDO', preferencias: { notificacoes: { ads_alertas: false } } });
  assert.equal(p.acesso, false);
  assert.equal(p.motivo_sem_acesso, 'sem_app');
  assert.equal(p.preferencias.notificacoes.ads_alertas, false);
  assert.equal(p.preferencias.notificacoes.ads_semana, true);
  assert.ok(!JSON.stringify(p).includes('SEGREDO'));
});

test('validarPerfil: limpa texto, telefone só dígitos, cor #rrggbb e recusa nome vazio', () => {
  const v = E.validarPerfil({ nome: '  Ana  ', cargo: 'Gestora', telefone: '(12) 99999-0000', avatar_cor: '#AABBCC', notificacoes: { ads_alertas: false } });
  assert.deepEqual(v, { nome: 'Ana', cargo: 'Gestora', telefone: '12999990000', avatar_cor: '#AABBCC', notificacoes: { ads_alertas: false, ads_semana: true } });
  assert.throws(() => E.validarPerfil({ nome: '' }), /nome/);
  assert.throws(() => E.validarPerfil({ telefone: '123' }), /telefone/);
  assert.throws(() => E.validarPerfil({ avatar_cor: 'red' }), /avatar_cor/);
  assert.throws(() => E.validarPerfil({ nome: 'x'.repeat(81) }), /80/);
  assert.equal('papel' in E.validarPerfil({ papel: 'admin', apps: ['ads'] }), false, 'papel e apps nunca passam');
});

test('validarMeta e progresso: mês AAAA-MM, inteiros de 1 a 100 mil, ritmo pelo dia do mês', () => {
  assert.deepEqual(E.validarMeta({ mes: '2026-10', leads: '120', vendas: '' }), { mes: '2026-10-01', leads: 120, vendas: null });
  assert.throws(() => E.validarMeta({ mes: '2026-13' }), /mes/);
  assert.throws(() => E.validarMeta({ mes: '2026-10', leads: 1.5 }), /leads/);
  assert.throws(() => E.validarMeta({ mes: '2026-10', agendamentos: 0 }), /agendamentos/);
  const p = E.progresso(30, 100, 10, 31);
  assert.equal(p.projecao, 93);
  assert.equal(p.situacao, 'abaixo');
  assert.equal(p.faltam, 70);
  assert.equal(E.progresso(50, 100, 10, 31).situacao, 'no_ritmo');
  assert.equal(E.progresso(100, 100, 10, 31).situacao, 'batida');
  assert.equal(E.progresso(5, null, 10, 31), null);
});

/* ---------------- banco falso ---------------- */
function bancoFalso({ perfis = [], falharRpc = false } = {}) {
  const log = { updates: [], rpcs: [], inserts: [] };
  const consulta = tabela => {
    const q = {
      _f: {},
      select() { return q; }, eq(c, v) { q._f[c] = v; return q; }, is() { return q; }, in() { return q; },
      update(p) { log.updates.push({ tabela, p }); return q; },
      insert(p) { log.inserts.push({ tabela, p }); return q; },
      maybeSingle: async () => ({ data: tabela === 'perfis' ? { preferencias: { outroApp: 1, notificacoes: { crm_x: false } } } : null, error: null }),
      single: async () => ({ data: { id: 'm1' }, error: null }),
      then(ok) { return Promise.resolve({ data: tabela === 'perfis' ? perfis : [], error: null }).then(ok); },
    };
    return q;
  };
  return {
    log,
    from: consulta,
    rpc: async (nome, args) => { log.rpcs.push({ nome, args }); return falharRpc ? { data: null, error: { message: 'x' } } : { data: 'id-novo', error: null }; },
  };
}

test('notificarGestores: só quem pode abrir o Ads e respeita a preferência de cada um', async () => {
  const sb = bancoFalso({ perfis: [
    { ...P.admin, ativo: true },
    { ...P.gestorComAds, ativo: true, preferencias: { notificacoes: { ads_alertas: false } } },
    { ...P.gestorSemAds, ativo: true }, { ...P.atendenteComAds, ativo: true }, { ...P.agenda, ativo: true },
  ] });
  const eq = E.criar(sb);
  const r = await eq.notificarGestores({ tipo: 'ads_alerta', titulo: 't', corpo: 'c', chave: 'k1', preferencia: 'ads_alertas' });
  assert.equal(r.destinatarios, 2);
  assert.equal(r.enviadas, 1);
  assert.deepEqual(sb.log.rpcs.map(x => x.args.p_perfil), [P.admin.id]);
  assert.equal(sb.log.rpcs[0].nome, 'notificar');
  assert.equal(sb.log.rpcs[0].args.p_app, 'ads');
  assert.equal(sb.log.rpcs[0].args.p_chave, 'k1');
});

test('auditar: chama registrar_auditoria e nunca derruba a ação se falhar', async () => {
  const sb = bancoFalso();
  assert.equal(await E.criar(sb).auditar(P.admin, 'ads_exportou_csv', { detalhes: { a: 1 } }), true);
  assert.equal(sb.log.rpcs[0].nome, 'registrar_auditoria');
  assert.equal(sb.log.rpcs[0].args.p_app, 'ads');
  const ruim = bancoFalso({ falharRpc: true });
  const avisar = console.warn; console.warn = () => {};
  try { assert.equal(await E.criar(ruim).auditar(P.admin, 'x'), false); } finally { console.warn = avisar; }
});

test('tocarAcesso: grava no máximo a cada 5 min por pessoa', async () => {
  const sb = bancoFalso();
  const eq = E.criar(sb);
  const t0 = Date.parse('2026-10-13T12:00:00Z');
  assert.equal(await eq.tocarAcesso(P.admin, t0), true);
  assert.equal(await eq.tocarAcesso(P.admin, t0 + 60_000), false);
  assert.equal(await eq.tocarAcesso(P.admin, t0 + 5 * 60_000), true);
  assert.equal(sb.log.updates.length, 2);
  assert.equal(sb.log.updates[0].p.ultimo_app, 'ads');
  // quem acabou de entrar pelo Ads (ultimo_acesso_em recente) não grava de novo
  const outro = { ...P.gestorComAds, ultimo_app: 'ads', ultimo_acesso_em: new Date(t0 - 60_000).toISOString() };
  assert.equal(await eq.tocarAcesso(outro, t0), false);
});

test('salvarPerfil: mescla preferências sem apagar as de outros apps', async () => {
  const sb = bancoFalso();
  await E.criar(sb).salvarPerfil(P.admin, { nome: 'Ana', notificacoes: { ads_alertas: false, ads_semana: true } });
  const up = sb.log.updates.find(u => u.tabela === 'perfis').p;
  assert.equal(up.nome, 'Ana');
  assert.equal(up.preferencias.outroApp, 1);
  assert.equal(up.preferencias.notificacoes.crm_x, false);
  assert.equal(up.preferencias.notificacoes.ads_alertas, false);
  assert.equal('papel' in up, false);
});
