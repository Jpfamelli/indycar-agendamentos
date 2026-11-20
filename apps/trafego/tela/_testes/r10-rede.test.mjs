/* Rodada 10: a conversa da tela com o servidor em rede ruim (js/api.js e js/sessao.js, que não tinham teste).
   Pedido que não volta nunca, gravação que estoura o tempo, duas partes da tela pedindo a mesma coisa juntas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarApi, criarLeitor, ErroApi } from '../js/api.js';
import { lerConfiguracao } from '../js/sessao.js';

const json = (status, corpo, cabecalhos = {}) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...cabecalhos } });
/** Um "fetch" que nunca responde: só termina quando quem pediu desiste (AbortSignal). */
const mudo = (anotar = []) => (url, opcoes = {}) => new Promise((_ok, falha) => {
  anotar.push({ url, opcoes });
  if (opcoes.signal) opcoes.signal.addEventListener('abort', () => falha(Object.assign(new Error('abortado'), { name: 'AbortError' })));
});
const semDormir = async () => {};

test('gravação que estoura o tempo avisa que não dá para saber se gravou (e não repete sozinha)', async () => {
  const pedidos = [];
  const api = criarApi({ base: '/trafego/', token: async () => 't', buscar: mudo(pedidos), tempoLimite: 20, dormir: semDormir });
  await assert.rejects(api.gravar('api/jornada/1/valor', { valor: 750 }), (e) => {
    assert.ok(e instanceof ErroApi);
    assert.equal(e.codigo, 'tempo');
    assert.match(e.message, /não deu para saber se gravou/i);
    assert.match(e.message, /confira/i);
    return true;
  });
  assert.equal(pedidos.length, 1, 'uma tentativa só');
});

test('leitura que estoura o tempo tenta de novo sozinha e, se não der, diz que o servidor demorou', async () => {
  const pedidos = [];
  const esperas = [];
  const api = criarApi({ base: '/trafego/', token: async () => 't', buscar: mudo(pedidos), tempoLimite: 10, dormir: semDormir, aoEsperar: (ms) => esperas.push(ms) });
  await assert.rejects(api.ler('api/hoje'), (e) => { assert.equal(e.codigo, 'tempo'); assert.match(e.message, /demorou demais/i); return true; });
  assert.ok(pedidos.length > 1, 'a leitura repete (foram ' + pedidos.length + ')');
  assert.ok(esperas.length >= 1, 'a tela é avisada da espera');
});

test('baixar arquivo: pedido que não volta é abandonado no tempo limite, com frase de gente', async () => {
  const pedidos = [];
  const api = criarApi({ base: '/trafego/', token: async () => 't', buscar: mudo(pedidos), tempoLimiteDeArquivo: 20 });
  const resultado = await Promise.race([
    api.baixar('api/devolucao/google.csv').then(() => 'baixou', (e) => e),
    new Promise((ok) => setTimeout(() => ok('ficou esperando para sempre'), 400)),
  ]);
  assert.ok(resultado instanceof ErroApi, String(resultado));
  assert.match(resultado.message, /demorou demais/i);
  assert.ok(pedidos[0].opcoes.signal, 'o pedido leva o sinal de desistência');
});

test('duas partes da tela pedindo a mesma leitura ao mesmo tempo fazem um pedido só', async () => {
  let pedidos = 0;
  const api = { ler: async (caminho) => { pedidos++; await new Promise((r) => setTimeout(r, 15)); return { caminho, n: pedidos }; } };
  const leitor = criarLeitor(api);
  const [a, b] = await Promise.all([leitor.ler('api/conexoes'), leitor.ler('api/conexoes')]);
  assert.equal(pedidos, 1, 'foram ' + pedidos + ' pedidos');
  assert.deepEqual(a.dados, b.dados);
  await leitor.ler('api/conexoes', { forcar: true });
  assert.equal(pedidos, 2, 'forçar busca de novo');
  // leitura que falha não fica presa: a próxima tenta outra vez
  let falhar = true;
  const api2 = { ler: async () => { if (falhar) throw new ErroApi('caiu', { status: 0 }); return { ok: true }; } };
  const leitor2 = criarLeitor(api2);
  await assert.rejects(Promise.all([leitor2.ler('api/hoje'), leitor2.ler('api/hoje')]));
  falhar = false;
  assert.deepEqual((await leitor2.ler('api/hoje')).dados, { ok: true });
});

test('esquecer durante uma leitura em curso: a resposta velha não volta para a memória', async () => {
  let soltar;
  let n = 0;
  const api = { ler: () => new Promise((ok) => { n++; const meu = n; soltar = () => ok({ versao: meu }); }) };
  const leitor = criarLeitor(api);
  const primeira = leitor.ler('api/hoje');
  leitor.esquecer('api/hoje');           // gravou alguma coisa no meio do caminho
  soltar();
  await primeira;
  const depois = leitor.ler('api/hoje');
  soltar();
  assert.deepEqual((await depois).dados, { versao: 2 }, 'depois de esquecer, busca de novo em vez de servir o que foi pedido antes da gravação');
});

test('abrir a sessão: a configuração do login que não volta é abandonada e tentada de novo', async () => {
  const pedidos = [];
  let vez = 0;
  const buscar = (url, opcoes) => { vez++; return vez === 1 ? mudo(pedidos)(url, opcoes) : Promise.resolve(json(200, { supabase_url: 'https://x.supabase.co', supabase_anon_key: 'k' })); };
  const esperas = [];
  const cfg = await Promise.race([
    lerConfiguracao('/trafego/', { buscar, tempoLimite: 20, dormir: semDormir, aoEsperar: (ms) => esperas.push(ms) }),
    new Promise((ok) => setTimeout(() => ok('ficou em "Abrindo o Tráfego" para sempre'), 500)),
  ]);
  assert.deepEqual(cfg, { supabase_url: 'https://x.supabase.co', supabase_anon_key: 'k' });
  assert.equal(esperas.length, 1, 'a tela mostrou que está tentando de novo');
});

test('api.js: o login vai no cabeçalho, erro do app vira frase e 401 avisa a casca (cobertura que faltava)', async () => {
  const vistos = [];
  const recusas = [];
  const respostas = [json(200, { ok: 1 }), json(422, { erro: 'Escolha um motivo da lista.', campo: 'motivo' }), json(401, { erro: 'faça login', codigo: 'sessao_vencida' }), json(403, { erro: 'Só o administrador pode.', codigo: 'so_admin' })];
  const api = criarApi({ base: '/trafego/', token: async () => 'segredo', aoRecusar: (s, c) => recusas.push([s, c]), dormir: semDormir,
    buscar: async (url, o) => { vistos.push({ url, o }); return respostas.shift(); } });
  assert.deepEqual(await api.ler('/api/hoje'), { ok: 1 });
  assert.equal(vistos[0].url, '/trafego/api/hoje', 'endereço relativo à pasta da página');
  assert.equal(vistos[0].o.headers.Authorization, 'Bearer segredo');
  await assert.rejects(api.gravar('api/jornada/1/motivo', { motivo: 'x' }), (e) => e.status === 422 && e.message === 'Escolha um motivo da lista.' && e.corpo.campo === 'motivo');
  await assert.rejects(api.ler('api/hoje'), (e) => e.status === 401);
  await assert.rejects(api.gravar('api/ia/chaves', {}), (e) => e.codigo === 'so_admin');
  assert.deepEqual(recusas, [[401, 'sessao_vencida']], 'só a recusa da pessoa para a tela inteira; "só o administrador" fica em quem pediu');
});

test('quem pede "forçar" enquanto a mesma leitura está em curso pega carona nela (Ajustes: a lista e a gaveta de Conexões)', async () => {
  let pedidos = 0;
  const api = { ler: async () => { pedidos++; await new Promise((r) => setTimeout(r, 15)); return { n: pedidos }; } };
  const leitor = criarLeitor(api);
  const [a, b] = await Promise.all([leitor.ler('api/conexoes'), leitor.ler('api/conexoes', { forcar: true })]);
  assert.equal(pedidos, 1);
  assert.deepEqual(a.dados, b.dados);
  leitor.esquecer('api/');                                   // uma gravação no meio: aí o pedido em curso já não serve
  const c = leitor.ler('api/conexoes');
  const d = leitor.ler('api/conexoes', { forcar: true });
  await Promise.all([c, d]);
  assert.equal(pedidos, 2, 'depois de esquecer, um pedido novo (e só um) para os dois');
});
