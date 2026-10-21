// Agenda (rodada 6 / C1c): olhar de quem ataca — entradas hostis nas rotas novas não chegam cruas ao PostgREST,
// não vazam dado, e IDs de outro registro não passam. O banco é falso: o teste lê cada URL que o servidor montou.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://supabase.falso', SUPABASE_SERVICE_ROLE_KEY: 'srv-de-teste', SUPABASE_ANON_KEY: 'anon' });
const real = await import('../dados.js');
const fetchOriginal = globalThis.fetch;
const urls = [];
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  if (!u.startsWith('http://supabase.falso')) return fetchOriginal(url, opt);
  urls.push(decodeURIComponent(u.replace(/\+/g, ' ')));
  return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
};
after(() => { globalThis.fetch = fetchOriginal; });

const HOSTIL = [
  '12991821234,or=(id.neq.0)', '12991821234&select=*', '1) or (1=1', "';drop table agendamentos;--", '"><script>alert(1)</script>',
  'ABC1D23,telefone.not.is.null', '*', '%', '12991821234%0aOR%0a1=1', 'a",id.neq.0,x.eq."b', '")),or=(id.neq.0',
];

/** Tira do filtro or=(...) tudo que é legítimo; o que sobra só pode ser vírgula e parêntese. Se a entrada hostil escapou, sobra texto. */
function sobraDoFiltro(url) {
  const m = /[?&]or=\((.*)\)(&|$)/.exec(url);
  if (!m) return '';
  return m[1]
    .replace(/[a-z_0-9]+\.ilike\."[^"]*"/g, '')
    .replace(/[a-z_0-9]+\.ilike\.\*[A-Za-z0-9*]+\*/g, '')
    .replace(/[a-z_0-9]+\.eq\.[A-Za-z0-9]+/g, '')
    .replace(/[,()]/g, '');
}

test('contextoDoClienteParaMarcar: telefone e placa hostis chegam ao banco só como dígitos/letras', async () => {
  for (const h of HOSTIL) {
    urls.length = 0;
    await real.contextoDoClienteParaMarcar({ tel: h, placa: h });
    for (const u of urls.filter((x) => x.includes('/agendamentos'))) assert.equal(sobraDoFiltro(u), '', `entrada ${JSON.stringify(h)} escapou do filtro: ${u.slice(0, 260)}`);
    for (const u of urls) assert.doesNotMatch(u, /drop table|<script|1=1|not\.is\.null/i, `entrada ${JSON.stringify(h)} apareceu crua`);
  }
});
test('contextoDoClienteParaMarcar: telefone curto e sem placa não vai ao banco (nada para procurar)', async () => {
  urls.length = 0;
  const r = await real.contextoDoClienteParaMarcar({ tel: '123', placa: '' });
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { futuros: [], patio: [], orcamentos: [], avisos: [] });
  assert.equal(urls.length, 0);
});
test('listarAgendamentos({ q }): busca hostil fica presa entre aspas (aspas viram espaço, nada escapa do filtro)', async () => {
  for (const h of HOSTIL) {
    urls.length = 0;
    await real.listarAgendamentos({ q: h, de: '2026-10-21', ate: '2026-10-30' }).catch(() => {});
    for (const u of urls) assert.equal(sobraDoFiltro(u), '', `q=${JSON.stringify(h)} escapou do filtro: ${u.slice(0, 300)}`);
  }
});
test('dataBanco: devolve sempre AAAA-MM-DD limpo ou nada; dia que não existe no calendário é recusado', () => {
  assert.equal(real.dataBanco('2026-10-21'), '2026-10-21');
  for (const ruim of ['2026-13-01', '2026-02-30', '21/13/2026', '', null, undefined, '../../etc/passwd', 'abc']) assert.ok(!real.dataBanco(ruim), String(ruim));
  for (const sujo of ["2026-10-21';--", '2026-10-21T00:00', '2026-10-21 OR 1=1']) assert.equal(real.dataBanco(sujo), '2026-10-21', 'o resto da string é descartado, nunca repassado');
});
test('ehUuid: só UUID de verdade (sem aspas, vírgula, parêntese)', () => {
  assert.equal(real.ehUuid('00000000-0000-4000-8000-000000000001'), true);
  for (const ruim of ["x' or 1=1", '00000000-0000-4000-8000-00000000000g', '', null, '00000000-0000-4000-8000-000000000001,or=(id.neq.0)', '../x']) assert.equal(!!real.ehUuid(ruim), false, String(ruim));
});
test('semanaDoQuadroDados: dias fora da faixa ou data estranha caem em valores seguros', async () => {
  urls.length = 0;
  const r = await real.semanaDoQuadroDados("2026-10-21';--", 99999).catch(() => []);
  assert.ok(Array.isArray(r));
  assert.ok(r.length <= 14, 'no máximo 14 dias');
  assert.doesNotMatch(urls.join('\n'), /';--/);
});
