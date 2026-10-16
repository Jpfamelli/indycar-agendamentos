// Pátio (16/10/2026) — a Agenda lê a ordem que o banco abriu no "Chegou":
// funções puras (patio.js) + as rotas do server.js por HTTP com banco de mentira.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as real from '../dados.js';
import { _injetar, server } from '../server.js';
import { decidirAcesso } from '../regras.js';
import {
  linkAcompanhar, linkPatio, somaExtrasAprovados, juntarSugestaoComExtras, resumoDaOs,
  entreguesSemDesfecho, textoDoLink, idsDeAgendamento, PATIO_URL,
} from '../patio.js';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OS = (n, o) => ({ id: ID(700 + n), numero: n, etapa: 'em_execucao', agendamento_id: ID(n), token_publico: 'ab12cd34ef56ab12cd34ef56', ...o });

test('link do cliente: {link_base}/acompanhar/?t=<token>; token ou base estranhos → null', () => {
  assert.equal(linkAcompanhar('https://indycar-patio.netlify.app/', 'ab12cd34ef56ab12'), 'https://indycar-patio.netlify.app/acompanhar/?t=ab12cd34ef56ab12');
  assert.equal(linkAcompanhar(null, 'ab12cd34ef56ab12'), `${PATIO_URL}/acompanhar/?t=ab12cd34ef56ab12`);
  assert.equal(linkAcompanhar('https://x.app', '"><script>'), null);
  assert.equal(linkAcompanhar('javascript:alert(1)', 'ab12cd34ef56ab12'), null);
  assert.equal(linkAcompanhar('https://x.app', ''), null);
});

test('link da equipe: /?os=<id> só com uuid', () => {
  assert.equal(linkPatio(ID(1)), `${PATIO_URL}/?os=${ID(1)}`);
  assert.equal(linkPatio('1;drop'), PATIO_URL);
});

test('extras: só os APROVADOS com valor somam (sem erro de centavo)', () => {
  const r = somaExtrasAprovados([{ status: 'aprovado', valor: 0.1 }, { status: 'aprovado', valor: 0.2 }, { status: 'pendente', valor: 500 },
    { status: 'recusado', valor: 900 }, { status: 'aprovado', valor: null }, null]);
  assert.deepEqual(r, { total: 0.3, quantidade: 2 });
});

test('sugestão do "Veio e fechou": extras somam à sugestão que já existia, sem trocar a fonte', () => {
  const base = { valor: 1890, fonte: 'orcamento', rotulo: 'orçamento nº 42 aprovado' };
  const s = juntarSugestaoComExtras(base, [{ status: 'aprovado', valor: 450 }]);
  assert.equal(s.valor, 2340); assert.equal(s.fonte, 'orcamento'); assert.equal(s.base, 1890); assert.equal(s.extras_patio, 450);
  assert.match(s.rotulo, /orçamento nº 42 aprovado \+ 1 extra aprovado no Pátio/);
  // sem sugestão: os extras sozinhos (fonte patio → vira botão, não enche o campo)
  const so = juntarSugestaoComExtras({ valor: null, fonte: null, rotulo: null }, [{ status: 'aprovado', valor: 200 }, { status: 'aprovado', valor: 100 }]);
  assert.equal(so.valor, 300); assert.equal(so.fonte, 'patio'); assert.match(so.rotulo, /2 extras aprovados/);
  // sem extra aprovado: igual ao de antes
  assert.deepEqual(juntarSugestaoComExtras(base, [{ status: 'pendente', valor: 99 }]), base);
});

test('resumo da ordem: rótulo da etapa, contagens e links; cancelada não tem link do cliente', () => {
  const ex = [{ os_id: ID(701), status: 'aprovado', valor: 450 }, { os_id: ID(701), status: 'pendente', valor: 10 }, { os_id: ID(999), status: 'aprovado', valor: 5 }];
  const r = resumoDaOs(OS(1), ex, 'https://indycar-patio.netlify.app');
  assert.equal(r.etapa_rotulo, 'Em execução'); assert.equal(r.extras_pendentes, 1); assert.equal(r.valor_aprovado, 450);
  assert.equal(r.abrir, `${PATIO_URL}/?os=${ID(701)}`);
  assert.match(r.link_cliente, /\/acompanhar\/\?t=ab12/);
  assert.equal(resumoDaOs(OS(1, { etapa: 'cancelado' })).link_cliente, null);
  assert.equal(resumoDaOs(null), null);
  assert.equal(r.token_publico, undefined, 'o token cru só sai dentro do link');
});

test('entregues sem desfecho: só entregue + horário sem Veio e fechou/não fechou/não veio', () => {
  const ordens = [OS(1, { etapa: 'entregue', entregue_em: '2026-10-16T10:00:00Z' }), OS(2, { etapa: 'entregue', entregue_em: '2026-10-16T12:00:00Z' }),
    OS(3, { etapa: 'pronto' }), OS(4, { etapa: 'entregue' }), OS(5, { etapa: 'entregue', agendamento_id: null })];
  const ags = [{ id: ID(1), status: 'compareceu' }, { id: ID(2), status: 'em_atendimento' }, { id: ID(3), status: 'compareceu' }, { id: ID(4), status: 'concluido' }];
  const r = entreguesSemDesfecho(ordens, ags);
  assert.deepEqual(r.map((x) => x.agendamento.id), [ID(2), ID(1)]);   // o mais recente primeiro
});

test('texto do WhatsApp: primeiro nome e "carro" (sem "veículo")', () => {
  const t = textoDoLink({ nome: 'Maria Aparecida', veiculo: '', link: 'https://x/acompanhar/?t=1' });
  assert.match(t, /^Oi Maria!/); assert.match(t, /seu carro/); assert.doesNotMatch(t, /veículo|prezad/i);
  assert.equal(textoDoLink({ nome: 'X' }), '');
});

test('ids da URL: só uuid, sem repetir, até 60', () => {
  assert.deepEqual(idsDeAgendamento(`${ID(1)},${ID(1)}, x ,${ID(2)}`), [ID(1), ID(2)]);
  assert.equal(idsDeAgendamento(Array.from({ length: 80 }, (_, i) => ID(i)).join(',')).length, 60);
});

test('acesso: presença lê o selo do pátio; entregues só gestor', () => {
  const p = (papel) => ({ papel, ativo: true, apps: ['agenda'] });
  assert.equal(decidirAcesso({ perfil: p('agenda'), metodo: 'GET', rota: '/api/patio/agendamentos' }), null);
  assert.equal(decidirAcesso({ perfil: p('agenda'), metodo: 'GET', rota: '/api/patio/entregues' }).status, 403);
  assert.equal(decidirAcesso({ perfil: p('atendente'), metodo: 'GET', rota: '/api/patio/entregues' }).status, 403);
  assert.equal(decidirAcesso({ perfil: p('gestor'), metodo: 'GET', rota: '/api/patio/entregues' }), null);
});

// ---- rotas por HTTP ----
const PESSOAS = {
  gestor: { id: ID(902), email: 'g@t', papel: 'gestor', ativo: true, apps: ['agenda'] },
  atendente: { id: ID(903), email: 'a@t', papel: 'atendente', ativo: true, apps: ['agenda'] },
  agenda: { id: ID(904), email: 'f@t', papel: 'agenda', ativo: true, apps: ['agenda'] },
};
let base;
const pedidos = [];
const fetchOriginal = globalThis.fetch;
before(async () => {
  globalThis.fetch = async (url, opt) => { if (String(url).startsWith(base)) return fetchOriginal(url, opt); throw new Error('rede proibida: ' + url); };
  _injetar({
    dados: { ...real, marcarUltimoAcesso: async () => {}, obterIntegracoes: async () => ({}), obterIaConfig: async () => ({}),
      patioDosAgendamentos: async (ids) => { pedidos.push(ids); return ids.includes(ID(1)) ? { [ID(1)]: resumoDaOs(OS(1)) } : {}; },
      entreguesNoPatioSemDesfecho: async () => [{ id: ID(2), cliente_nome: 'Rogério', status: 'compareceu', patio: resumoDaOs(OS(2, { etapa: 'entregue' })) }] },
    usuarioLogado: async (req) => {
      const t = /Bearer (\S+)/.exec(req.headers.authorization || '')?.[1];
      return PESSOAS[t] ? { usuario: { ...PESSOAS[t] } } : { usuario: null, motivo: 'sem_login' };
    },
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { globalThis.fetch = fetchOriginal; server.close(); });
const chamar = async (quem, rota) => {
  const r = await fetch(base + rota, { headers: quem ? { Authorization: `Bearer ${quem}` } : {} });
  return { status: r.status, j: await r.json().catch(() => null) };
};

test('GET /api/patio/agendamentos: presença e equipe leem; ids lixo são filtrados; sem login 401', async () => {
  const r = await chamar('agenda', `/api/patio/agendamentos?ids=${ID(1)},lixo,${ID(3)}`);
  assert.equal(r.status, 200);
  assert.equal(r.j.itens[ID(1)].etapa_rotulo, 'Em execução');
  assert.deepEqual(pedidos.at(-1), [ID(1), ID(3)]);
  assert.deepEqual((await chamar('atendente', '/api/patio/agendamentos?ids=nada')).j, { itens: {} });
  assert.equal((await chamar(null, `/api/patio/agendamentos?ids=${ID(1)}`)).status, 401);
});

test('GET /api/patio/entregues: só gestor', async () => {
  const g = await chamar('gestor', '/api/patio/entregues');
  assert.equal(g.status, 200); assert.equal(g.j[0].patio.etapa, 'entregue');
  assert.equal((await chamar('atendente', '/api/patio/entregues')).status, 403);
  assert.equal((await chamar('agenda', '/api/patio/entregues')).status, 403);
});
