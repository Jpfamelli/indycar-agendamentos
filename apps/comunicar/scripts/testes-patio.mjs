// Pátio + Área do Cliente (16/10/2026) — os avisos do Pátio na fila do Comunicar,
// o "Pronto para ligar", o convite {link_area} e o carteiro conferindo a ordem.
// Sem banco e sem rede: rotas.js de verdade num servidor local com `dados` falso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as A from '../acesso.js';
import { criarApi } from '../rotas.js';
import { renderTemplate, REGUAS, SEGMENTOS, TIPOS_ENVIO, ROTULO_TIPO, TIPOS_SEGURAM_NO_FERIADO, TIPOS_ESPERAM_ATENDIMENTO } from '../dados.js';
import { validadeDoEnvio } from '../carteiro.js';
import { montarProntidao } from '../prontidao.js';
import {
  TIPOS_PATIO, osIdDaChave, conferirPatio, usaLinkArea, linkArea, itemPatioProntidao, MODELO_CONVITE_AREA, PATIO_URL,
} from '../patio.js';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OS = '44444444-4444-4444-8444-444444444444';
const AGORA = Date.parse('2026-10-16T15:00:00Z');
const h = (n) => new Date(AGORA - n * 3600000).toISOString();

test('tipos novos com rótulo: entram nos relatórios/filtros (TIPOS_ENVIO) e não são réguas', () => {
  for (const t of TIPOS_PATIO) {
    assert.ok(TIPOS_ENVIO.includes(t), t);
    assert.ok(ROTULO_TIPO[t], `rótulo de ${t}`);
    assert.ok(!REGUAS.includes(t), `${t} não é régua configurável aqui`);
    assert.ok(!TIPOS_SEGURAM_NO_FERIADO.has(t) && !TIPOS_ESPERAM_ATENDIMENTO.has(t), `${t} é aviso operacional: não espera`);
  }
  assert.equal(ROTULO_TIPO.patio_pronto, 'Pátio: carro pronto');
});

test('pós-venda continua igual: patio_pronto não muda a validade nem substitui a régua', () => {
  assert.ok(validadeDoEnvio('posvenda', { base: '2026-10-16' }));
  assert.equal(validadeDoEnvio('patio_pronto', { base: '2026-10-16' }), null, 'o banco enfileira sem validade; quem confere é conferirPatio');
  assert.ok(REGUAS.includes('posvenda'));
});

test('chave única do Pátio → id da ordem', () => {
  assert.equal(osIdDaChave(`patio_pronto:${OS}`), OS);
  assert.equal(osIdDaChave(`patio_extra:${OS}:2026101610`), OS);
  assert.equal(osIdDaChave(`posvenda:${OS}`), null);
  assert.equal(osIdDaChave(null), null);
});

test('carteiro confere a ordem antes de mandar o aviso do Pátio', () => {
  const env = (tipo, criado = h(1)) => ({ tipo, created_at: criado, chave_unica: `${tipo}:${OS}` });
  assert.equal(conferirPatio(env('patio_pronto'), { id: OS, etapa: 'pronto' }, [], AGORA).acao, 'enviar');
  assert.match(conferirPatio(env('patio_pronto'), { id: OS, etapa: 'entregue' }, [], AGORA).motivo, /já foi entregue/);
  assert.match(conferirPatio(env('patio_pronto'), { id: OS, etapa: 'em_execucao' }, [], AGORA).motivo, /voltou para o serviço/);
  assert.equal(conferirPatio(env('patio_extra'), { id: OS, etapa: 'aguardando_aprovacao' }, [{ status: 'pendente' }], AGORA).acao, 'enviar');
  assert.match(conferirPatio(env('patio_extra'), { id: OS, etapa: 'em_execucao' }, [{ status: 'aprovado' }], AGORA).motivo, /já decidiu/);
  assert.match(conferirPatio(env('patio_entrada'), { id: OS, etapa: 'pronto' }, [], AGORA).motivo, /já está pronto/);
  assert.match(conferirPatio(env('patio_entrada'), { id: OS, etapa: 'cancelado' }, [], AGORA).motivo, /cancelada/);
  assert.match(conferirPatio(env('patio_entrada'), null, [], AGORA).motivo, /apagada/);
  assert.match(conferirPatio(env('patio_entrada', h(30)), { id: OS, etapa: 'recebido' }, [], AGORA).motivo, /mais de 24 h/);
  assert.equal(conferirPatio(env('patio_entrada'), undefined, [], AGORA).acao, 'enviar', 'sem como conferir: manda como o banco pediu');
  assert.equal(conferirPatio({ tipo: 'area_cliente' }, null, [], AGORA).acao, 'enviar');
  assert.equal(conferirPatio({ tipo: 'posvenda' }, null, [], AGORA).acao, 'enviar');
});

test('{link_area}: detecta e monta o link; token/base estranhos → null', () => {
  assert.ok(usaLinkArea(MODELO_CONVITE_AREA.corpo));
  assert.equal(usaLinkArea('Oi {primeiro_nome}'), false);
  assert.equal(linkArea(null, 'ab12cd34ef56ab12cd34'), `${PATIO_URL}/minha/?c=ab12cd34ef56ab12cd34`);
  assert.equal(linkArea('https://x.app/', '<x>'), null);
  assert.equal(linkArea('http://inseguro', 'ab12cd34ef56ab12cd34'), null);
  const txt = renderTemplate(MODELO_CONVITE_AREA.corpo, { nome: 'Maria Souza', carro: 'HB20', link_area: 'https://l' });
  assert.match(txt, /^Oi Maria!/); assert.match(txt, /https:\/\/l/); assert.match(txt, /Quem conhece, Indyca!/);
  assert.doesNotMatch(txt, /prezad|efetu|comparec|veículo/i);
});

test('"Pronto para ligar" ganha o item dos avisos do Pátio (e só quando o servidor manda os fatos)', () => {
  const base = { cfg: { ativo_lembrete: true, ativo_posvenda: true, msg_lembrete: 'x', msg_posvenda: 'y', carteiro_configurado: true }, agora: AGORA };
  assert.ok(!montarProntidao(base).itens.some((i) => i.id === 'patio'));
  const ok = montarProntidao({ ...base, patio: { cfg: { avisar_pronto: true, avisar_extra: true, enviar_link_entrada: true }, fila: { pendentes: 0 } } });
  const it = ok.itens.find((i) => i.id === 'patio');
  assert.equal(it.estado, 'ok'); assert.match(it.texto, /carro pronto/); assert.equal(it.acao.alvo, PATIO_URL);
  assert.equal(itemPatioProntidao({ avisar_pronto: false, avisar_extra: false, enviar_link_entrada: false }).estado, 'aviso');
  assert.match(itemPatioProntidao({ avisar_pronto: true }, { pendentes: 3, maisAntigoEm: h(5) }, AGORA).texto, /3 aviso\(s\) do Pátio esperando/);
  assert.equal(itemPatioProntidao(null).estado, 'aviso');
});

// ---- POST /api/envios com {link_area} --------------------------------------------
const PERFIS = {
  gestor: { id: ID(2), nome: 'Gisele', papel: 'gestor', ativo: true, apps: ['comunicar'] },
  atendente: { id: ID(3), nome: 'Leonardo', papel: 'atendente', ativo: true, apps: ['comunicar'] },
};
async function subir() {
  const d = {
    envios: [], auditoria: [], links: 0,
    clientes: [
      { id: ID(101), nome: 'Maria', telefone: '12999990001', carro: 'HB20', aceita_mensagens: true },
      { id: ID(102), nome: 'Carlos', telefone: '12999990002', carro: 'Corolla', aceita_mensagens: true },
      { id: ID(103), nome: 'Vanderlei', telefone: '12999990003', carro: 'City', aceita_mensagens: false },
    ],
  };
  Object.assign(d, {
    SEGMENTOS, REGUAS, TIPOS_ENVIO, ROTULO_TIPO, renderTemplate,
    ehUuid: (v) => /^[0-9a-f-]{36}$/i.test(String(v || '')),
    auditar: async (...a) => { d.auditoria.push(a); return 1; },
    notificar: async () => null, gestores: async () => [], marcarAcesso: async () => null,
    segmentar: async () => d.clientes.filter((c) => c.aceita_mensagens),
    carregarPorteiro: async () => ({ podeReceber: ({ cliente_id }) => (d.clientes.find((c) => c.id === cliente_id)?.aceita_mensagens === false ? { ok: false } : { ok: true }) }),
    enfileirar: async (e) => { const x = { id: ID(900 + d.envios.length), status: 'pendente', ...e }; d.envios.push(x); return x; },
    enfileirarVarios: async (l) => { d.envios.push(...l); return l.length; },
    gerarLinkArea: async (id) => { d.links++; return d.clientes.some((c) => c.id === id) ? `${PATIO_URL}/minha/?c=${'ab'.repeat(12)}${d.links}` : null; },
    criarPropostaCampanha: async (c) => ({ id: ID(800), status: 'aguardando', ...c }),
  });
  const api = criarApi({
    dados: d, versao: 'teste', runnerToken: 'tok', log: { error() {} },
    autenticar: async (req) => { const p = PERFIS[req.headers['x-teste-perfil']]; if (!p) return { status: 401, codigo: 'sem_login', erro: 'Faça login.' };
      const v = A.verificarAcesso(p); return v.ok ? { usuario: { ...p, email: 'x@t' } } : v; },
    whatsapp: { enviar: async () => ({ ok: true }), status: async () => ({ ok: true }) },
    carteiro: { rodar: async () => ({ ok: true }), lerRespostas: async () => ({ lidas: 0 }) },
  });
  const srv = http.createServer((req, res) => { const url = new URL(req.url, 'http://x'); api.api(req, res, url).catch((e) => api.erroInterno(res, e)); });
  await new Promise((ok) => srv.listen(0, ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const chamar = async (perfil, corpo) => {
    const r = await fetch(base + '/api/envios', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-teste-perfil': perfil }, body: JSON.stringify(corpo) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  return { d, chamar, fechar: () => new Promise((ok) => srv.close(ok)) };
}

test('campanha com {link_area}: um link por cliente, tipo area_cliente, quem pediu para parar fica de fora', async () => {
  const s = await subir();
  try {
    const r = await s.chamar('gestor', { corpo: MODELO_CONVITE_AREA.corpo, destinos: s.d.clientes.map((c) => ({ cliente_id: c.id, telefone: c.telefone, nome: c.nome, carro: c.carro })) });
    assert.equal(r.status, 200);
    assert.equal(r.json.enfileirados, 2); assert.equal(r.json.pulados, 1);
    assert.ok(s.d.envios.every((e) => e.tipo === 'area_cliente'));
    const links = s.d.envios.map((e) => /\/minha\/\?c=(\w+)/.exec(e.corpo)?.[1]);
    assert.equal(new Set(links).size, 2, 'cada cliente com o seu link');
    assert.ok(s.d.envios.every((e) => !e.corpo.includes('{link_area}')));
  } finally { await s.fechar(); }
});

test('avulsa com {link_area}: sem cadastro não manda (sem link quebrado); campanha sem {link_area} segue "campanha"', async () => {
  const s = await subir();
  try {
    const sem = await s.chamar('atendente', { corpo: 'Oi {primeiro_nome}: {link_area}', destinos: [{ telefone: '12999990009', nome: 'Avulso' }] });
    assert.equal(sem.json.enfileirados, 0); assert.match(sem.json.motivo, /sem cadastro/);
    const ok = await s.chamar('atendente', { corpo: 'Oi {primeiro_nome}: {link_area}', destinos: [{ cliente_id: ID(101), telefone: '12999990001', nome: 'Maria' }] });
    assert.equal(ok.json.enfileirados, 1); assert.equal(s.d.envios[0].tipo, 'area_cliente');
    const normal = await s.chamar('gestor', { corpo: 'Oi {primeiro_nome}!', destinos: s.d.clientes.slice(0, 2).map((c) => ({ cliente_id: c.id, telefone: c.telefone, nome: c.nome })) });
    assert.equal(normal.json.enfileirados, 2);
    assert.ok(s.d.envios.slice(-2).every((e) => e.tipo === 'campanha'));
  } finally { await s.fechar(); }
});

test('convite da Área para mais de 300 de uma vez → 400 claro', async () => {
  const s = await subir();
  try {
    const destinos = Array.from({ length: 301 }, (_, i) => ({ cliente_id: ID(2000 + i), telefone: `1299${String(i).padStart(7, '0')}`, nome: 'X' }));
    const r = await s.chamar('gestor', { corpo: '{link_area}', destinos });
    assert.equal(r.status, 400); assert.match(r.json.erro, /no máximo 300/);
  } finally { await s.fechar(); }
});
