// Casa, rodada 15: as tarefas vencidas da própria pessoa em "Pede atenção", o último número que aparece na hora ao abrir
// (só contagens, só da mesma pessoa e do mesmo dia) e o "Fechar" no pé do sino. Sem rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../casa/logica.js');
await import('../casa/logica2.js');
await import('../casa/logica4.js');
await import('../casa/logica5.js');
const L = globalThis.CasaLogica, L4 = globalThis.CasaLogica4, L5 = globalThis.CasaLogica5;
const CASA = join(dirname(fileURLToPath(import.meta.url)), '..', 'casa');
const ler = (f) => readFileSync(join(CASA, f), 'utf8');
const perfil = (papel, apps) => ({ papel, apps, ativo: true });
const AGORA = Date.parse('2026-11-25T14:00:00-03:00');
const antes = (min) => new Date(AGORA - min * 60000).toISOString();

test('tarefas vencidas: conta só o que já passou do prazo e diz há quanto tempo venceu a mais velha', () => {
  const r = L5.tarefasVencidas([{ vence_em: antes(90) }, { vence_em: antes(5 * 1440) }, { vence_em: new Date(AGORA + 3600e3).toISOString() }, { vence_em: null }, null], AGORA);
  assert.deepEqual(r, { n: 2, maisAntiga: 5 * 1440 * 60000 });
  assert.deepEqual(L5.tarefasVencidas([], AGORA), { n: 0, maisAntiga: null });
  assert.deepEqual(L5.tarefasVencidas(null, AGORA), { n: 0, maisAntiga: null });
});

test('tarefas vencidas: com a lista cortada em 100, vale a contagem do banco', () => {
  const lista = Array.from({ length: 100 }, (_, i) => ({ vence_em: antes(10 + i) }));
  assert.equal(L5.tarefasVencidas(lista, AGORA, 137).n, 137);
  assert.equal(L5.tarefasVencidas(lista, AGORA, 3).n, 100, 'contagem menor que a lista não vale');
  assert.equal(L5.tarefasVencidas(lista, AGORA, null).n, 100);
});

test('pede atenção: a equipe com o Atendimento vê "N tarefas suas passaram do prazo" e o toque abre as tarefas', () => {
  const v = L.visao(perfil('atendente', ['atendimento', 'agenda']));
  assert.equal(v.tarefas, true);
  const bases = L.bases();
  const item = (m, ms) => L.atencao({ minhas_tarefas: { vencidas: m, mais_antiga: ms } }, v, L.links(bases), AGORA).find((x) => x.k === 'tarefas');
  const a = item(2, 5 * 864e5);
  assert.equal(a.texto, '2 tarefas suas passaram do prazo');
  assert.equal(a.extra, 'a mais antiga venceu há 5 dias');
  assert.equal(a.grav, 2, 'mais de 3 dias pesa mais');
  assert.equal(a.app, 'atendimento');
  assert.equal(item(1, 2 * 36e5).texto, '1 tarefa sua passou do prazo');
  assert.equal(item(1, 2 * 36e5).grav, 1);
  assert.equal(item(1, 10 * 6e4).extra, '', 'venceu agora há pouco: sem "há 10 min" no meio do aviso');
  assert.equal(item(0, 0), undefined, 'sem tarefa vencida, sem aviso');
  assert.equal(L.atencao({}, v, L.links(bases), AGORA).some((x) => x.k === 'tarefas'), false, 'leitura que falhou não inventa aviso');
});

test('pede atenção: o link das tarefas é o mesmo que o aviso "tarefas vencidas" do sino usa', () => {
  const bases = L.bases();
  const doSino = L4.acaoDoAviso({ tipo: 'tarefas_vencidas' }, bases, 'https://central.test').url;
  assert.equal(L.links(bases).tarefas(), doSino);
  assert.match(doSino, /\?tarefas$/);
  const comAba = { ...bases, atendimento: '/atendimento/?aba=x' };
  assert.equal(L.links(comAba).tarefas(), '/atendimento/?aba=x&tarefas');
});

test('tarefas: recepção e mecânico não ganham o aviso (as tarefas são da equipe)', () => {
  assert.equal(L.visao(perfil('agenda', ['agenda', 'patio'])).tarefas, false);
  assert.equal(L.visao(perfil('mecanico', ['patio'])).tarefas, false);
  assert.equal(L.visao(perfil('atendente', ['agenda'])).tarefas, false, 'sem o Atendimento liberado não há para onde ir');
  assert.equal(L.visao(perfil('admin', ['atendimento'])).tarefas, true);
});

test('último número: guarda só contagens (nenhum nome, telefone, placa ou valor)', () => {
  const d = {
    conversas: { esperando: 3, lista: [{ nome: 'Gabi', telefone: '12999990000' }] },
    agenda: { total: 4, chegaram: 1, lista: [{ nome: 'Hugo' }] },
    patio: { total: 4, prontos: 1, lista: [{ placa: 'AAA0A00', nome: 'Ana' }] },
    orcamentos: { esperando: 2, lista: [{ nome: 'Elisa', total: 980 }] },
    minhas_tarefas: { vencidas: 2 },
  };
  const s = L5.instantaneoDe(d, 'perfil-1', AGORA, '2026-11-25');
  assert.deepEqual(s, { em: AGORA, perfil: 'perfil-1', dia: '2026-11-25', d: { conversas: { esperando: 3 }, agenda: { total: 4, chegaram: 1 }, patio: { total: 4 }, orcamentos: { esperando: 2 } } });
  const texto = JSON.stringify(s);
  for (const proibido of ['Gabi', '1299999', 'AAA0A00', 'Ana', 'Elisa', '980', 'Hugo']) assert.equal(texto.includes(proibido), false, proibido);
  assert.equal(L5.instantaneoDe(null, 'x', AGORA), null);
  assert.equal(L5.instantaneoDe(d, '', AGORA), null);
  assert.equal(L5.instantaneoDe({ agenda: null }, 'x', AGORA), null);
});

test('último número: só vale para a mesma pessoa, no mesmo dia e com menos de 6 horas', () => {
  const s = L5.instantaneoDe({ patio: { total: 4 } }, 'p1', AGORA, '2026-11-25');
  assert.equal(L5.instantaneoValido(s, 'p1', AGORA + 3 * 36e5, '2026-11-25'), s);
  assert.equal(L5.instantaneoValido(s, 'p2', AGORA, '2026-11-25'), null, 'outra pessoa no mesmo aparelho');
  assert.equal(L5.instantaneoValido(s, 'p1', AGORA + 7 * 36e5, '2026-11-25'), null, 'passou de 6 horas');
  assert.equal(L5.instantaneoValido(s, 'p1', AGORA + 12 * 36e5, '2026-11-26'), null, 'outro dia');
  assert.equal(L5.instantaneoValido(s, 'p1', AGORA - 1000, '2026-11-25'), null, 'relógio do aparelho voltou');
  for (const lixo of [null, 'texto', {}, { d: {}, perfil: 'p1' }, []]) assert.equal(L5.instantaneoValido(lixo, 'p1', AGORA, '2026-11-25'), null);
});

test('último número: o herói pinta com ele, a leitura de verdade o troca, e ele sai do aparelho junto com a pessoa', () => {
  const painel = ler('painel.js'), casa = ler('casa.js'), css = ler('r13.css');
  assert.match(painel, /instantaneoValido\(lerInstante\(\), C\.perfil\.id\)/);
  assert.match(painel, /gravarInstante\(d\);/, 'cada leitura boa atualiza o guardado');
  assert.match(painel, /fr\.classList\.remove\('heroi-velho'\)/, 'a leitura de verdade tira o "apagado"');
  assert.match(painel, /Não consegui atualizar\. Os números são de/, 'sem rede, o herói segue com o número e diz de que hora ele é');
  assert.match(casa, /LS_DA_PESSOA = \[[^\]]*'indycar_central_heroi'/, 'sair apaga o guardado');
  assert.match(css, /\.heroi-frase\.heroi-velho \{ opacity: \.6/);
});

test('tarefas: a leitura é só das tarefas abertas da própria pessoa e o tempo real as acompanha', () => {
  const painel = ler('painel.js');
  assert.match(painel, /from\('tarefas'\)\.select\('vence_em', \{ count: 'exact' \}\)\.eq\('status', 'aberta'\)\.eq\('responsavel_id', C\.perfil\.id\)/);
  assert.match(painel, /filter: `responsavel_id=eq\.\$\{C\.perfil\.id\}`/);
  assert.match(painel, /V\.tarefas \? lerMinhasTarefas\(\) : Promise\.resolve\(null\)/, 'recepção e mecânico nem pedem');
});

test('sino: "Fechar" no pé (celular) e escondido no computador', () => {
  const sino = ler('sino.js'), css = ler('r13.css');
  assert.match(sino, /data-sino-fechar>Fechar<\/button>/);
  assert.match(sino, /if \(e\.target\.closest\('\[data-sino-fechar\]'\)\) \{ alternar\(false\); return; \}/);
  assert.match(css, /\.sino-fechar \{[^}]*min-height: 48px/);
  assert.match(css, /@media \(min-width: 48em\) \{ \.sino-fechar \{ display: none; \} \}/);
});

test('arquivos mudados trazem versão nova no index e no service worker', () => {
  const html = ler('index.html'), sw = ler('sw.js');
  for (const m of [/r13\.css\?v=4/, /logica5\.js\?v=4/, /painel\.js\?v=19/, /sino\.js\?v=14/, /casa\.js\?v=17/, /logica\.js\?v=13/]) assert.match(html, m);
  assert.match(sw, /indycar-casa-v22/);
});
