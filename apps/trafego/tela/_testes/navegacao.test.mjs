/* Lógica pura da tela: filtros da Jornada, endereço das telas, frase principal,
   rede, desfazer, links do ecossistema, valor digitado e as telas soltas (folha e apresentação). */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Filtros from '../js/filtros.js';
import { lerRota, montarRota, destinoDaApi, comParametros } from '../js/rotas.js';
import { partesDaFrase, linhasDaFrase, tamanhoDaFrase } from '../js/frase.js';
import * as Rede from '../js/rede.js';
import { criarDesfazer } from '../js/desfazer.js';
import { linkSeguro, baseDaPagina, raizDaCentral, enderecoDeEntrada, listaDeApps, CENTRAL_PUBLICA } from '../js/ecossistema.js';
import { conferirValor } from '../js/telas/respostas.js';

/* ------------------------------ filtros ------------------------------ */

test('filtros do endereço: o que não é válido volta ao padrão', () => {
  const f = Filtros.filtrosDaRota({ desfecho: 'talvez', paga: '1', canal: 'meta', etapa: 'x', pendencia: 'sem_valor', q: ' <b>Onix</b> ', ordem: 'aleatoria', pagina: '-3' });
  assert.deepEqual(f, { desfecho: '', paga: '1', canal: 'meta', campanha: '', etapa: '', pendencia: 'sem_valor', q: 'bOnix/b', ordem: 'recentes', pagina: 1 });
  assert.equal(Filtros.filtrosDaRota({ pagina: '99999' }).pagina, 9999);
  assert.equal(Filtros.filtrosDaRota({ q: 'a'.repeat(200) }).q.length, 80);
});

test('consulta da API leva o período e só os filtros ligados', () => {
  const q = new URLSearchParams(Filtros.consultaDaApi({ paga: '1', desfecho: 'fechou', pagina: '2' }, '7d', { tamanho: 500 }));
  assert.equal(q.get('periodo'), '7d');
  assert.equal(q.get('paga'), '1');
  assert.equal(q.get('desfecho'), 'fechou');
  assert.equal(q.get('canal'), null);
  assert.equal(q.get('pagina'), '2');
  assert.equal(q.get('tamanho'), '200');
  assert.equal(new URLSearchParams(Filtros.consultaDaApi({}, 'semana')).get('periodo'), 'mes');
});

test('mudar um filtro volta para a página 1; ficha de um toque liga e desliga', () => {
  const base = Filtros.filtrosDaRota({ pagina: '3', desfecho: 'aberto' });
  assert.equal(Filtros.mudar(base, { canal: 'google' }).pagina, 1);
  assert.equal(Filtros.mudar(base, { pagina: 4 }).pagina, 4);
  assert.equal(Filtros.alternar(base, 'desfecho', 'aberto').desfecho, '');
  assert.equal(Filtros.alternar(base, 'desfecho', 'fechou').desfecho, 'fechou');
  assert.equal(Filtros.contarAtivos({ desfecho: 'aberto', paga: '1', ordem: 'valor', pagina: '2' }), 2);
  assert.deepEqual(Filtros.parametrosDaRota(Filtros.filtrosDaRota({ desfecho: 'fechou', ordem: 'recentes' })), { desfecho: 'fechou' });
});

test('filtros ligados viram nomes que a pessoa lê', () => {
  const lidos = Filtros.filtrosLigados({ paga: '1', canal: 'meta', campanha: '123', pendencia: 'sem_origem' },
    { canais: [{ id: 'meta', rotulo: 'Anúncio da Meta' }], campanhas: [{ ext: '123', nome: 'Troca de óleo' }] });
  assert.deepEqual(lidos.map((x) => x.rotulo), ['Só de anúncio', 'Anúncio da Meta', 'Troca de óleo', 'Sem origem']);
});

test('páginas', () => {
  assert.deepEqual(Filtros.paginas({ atual: 2, tamanho: 50, total: 99 }), { atual: 2, ultima: 2, de: 51, ate: 99, total: 99, temAnterior: true, temProxima: false });
  assert.deepEqual(Filtros.paginas({ atual: 9, tamanho: 50, total: 0 }), { atual: 1, ultima: 1, de: 0, ate: 0, total: 0, temAnterior: false, temProxima: false });
});

/* ------------------------------ endereço das telas ------------------------------ */

test('rota: lê e monta; tela desconhecida vira Hoje; chave estranha não entra', () => {
  assert.deepEqual(lerRota('#/jornada?desfecho=aberto&contato=abc'), { tela: 'jornada', params: { desfecho: 'aberto', contato: 'abc' } });
  assert.deepEqual(lerRota(''), { tela: 'hoje', params: {} });
  assert.deepEqual(lerRota('#/admin'), { tela: 'hoje', params: {} });
  assert.deepEqual(lerRota('#/hoje?X-Y=1&ok=2'), { tela: 'hoje', params: { ok: '2' } });
  assert.equal(montarRota('jornada', { pagina: '', desfecho: 'fechou', canal: 'meta' }), '#/jornada?canal=meta&desfecho=fechou');
  assert.equal(montarRota('xyz'), '#/hoje');
});

test('destino das ações da API: tela daqui ou outro app', () => {
  assert.deepEqual(destinoDaApi('jornada?pendencia=sem_valor'), { tipo: 'tela', tela: 'jornada', params: { pendencia: 'sem_valor' } });
  assert.deepEqual(destinoDaApi('ajustes?secao=conexoes'), { tipo: 'tela', tela: 'ajustes', params: { secao: 'conexoes' } });
  assert.deepEqual(destinoDaApi('/atendimento/'), { tipo: 'fora', caminho: '/atendimento/' });
  assert.equal(destinoDaApi(''), null);
  assert.deepEqual(comParametros({ a: '1', b: '2' }, { b: '', c: 3 }), { a: '1', c: '3' });
});

/* ------------------------------ frase principal ------------------------------ */

test('frase: uma sentença por linha, sem perder caractere', () => {
  const frase = { tipo: 'sem_conta', texto: '100 contatos novos neste mês. 30 vieram de anúncio.' };
  const linhas = linhasDaFrase(frase);
  assert.equal(linhas.length, 2);
  assert.equal(linhas.map((l) => l.map((p) => p.texto).join('')).join(' '), frase.texto);
  assert.equal(partesDaFrase({ texto: '' }).length, 0);
  assert.equal(tamanhoDaFrase('30 vieram de anúncio.'), 'g');
  assert.equal(tamanhoDaFrase('Cada R$ 1 em anúncio virou R$ 4,20 na oficina.'), 'm');
  assert.equal(tamanhoDaFrase('R$ 2.340 investidos trouxeram 61 contatos. Falta lançar o valor de 12 serviços para saber o retorno.'), 'p');
});

/* ------------------------------ rede ------------------------------ */

test('rede: servidor acordando repete leitura; gravação nunca repete sozinha', async () => {
  assert.equal(Rede.passageiro(503), true);
  assert.equal(Rede.passageiro(500), false);
  assert.equal(Rede.podeRepetir('get'), true);
  assert.equal(Rede.podeRepetir('POST'), false);
  assert.equal(Rede.textoDaEspera(2000), 'em 2 s');
  assert.equal(Rede.textoDaEspera(90000), 'em 1 min 30 s');
  assert.match(Rede.mensagem(503, true), /acordando/);
  assert.equal(Rede.mensagem(500, true), null);
  let tentativas = 0;
  const esperas = [];
  const r = await Rede.comNovasTentativas(async () => { tentativas++; if (tentativas < 3) throw Object.assign(new Error('x'), { status: 503 }); return 'ok'; },
    { dormir: async () => {}, aoEsperar: (ms) => esperas.push(ms) });
  assert.equal(r, 'ok');
  assert.deepEqual(esperas, [2000, 5000]);
  await assert.rejects(Rede.comNovasTentativas(async () => { throw Object.assign(new Error('banco sem atualização'), { status: 503, respondeu: true }); }, { dormir: async () => {} }), /banco/);
});

/* ------------------------------ desfazer ------------------------------ */

function relogioFalso() {
  const fila = new Map();
  let n = 0;
  return {
    agendar: (fn) => { const id = ++n; fila.set(id, fn); return id; },
    cancelar: (id) => fila.delete(id),
    correr: async () => { const fns = [...fila.values()]; fila.clear(); for (const fn of fns) await fn(); await new Promise((r) => setImmediate(r)); },
  };
}

test('desfazer: nada sai antes do tempo; desfazer cancela; o tempo passa e grava', async () => {
  const relogio = relogioFalso();
  const gravados = [];
  const d = criarDesfazer({ agendar: relogio.agendar, cancelar: relogio.cancelar });
  d.adicionar({ id: 'a', rotulo: 'R$ 750', executar: async () => gravados.push('a') });
  d.adicionar({ id: 'b', rotulo: 'Achou caro', executar: async () => gravados.push('b') });
  assert.deepEqual(gravados, []);
  assert.equal(d.desfazer('a'), true);
  assert.equal(d.desfazer('a'), false);
  await relogio.correr();
  assert.deepEqual(gravados, ['b']);
});

test('desfazer: sair da tela manda o que estava esperando; falha avisa', async () => {
  const relogio = relogioFalso();
  const falhas = [];
  const d = criarDesfazer({ agendar: relogio.agendar, cancelar: relogio.cancelar });
  d.adicionar({ id: 'a', rotulo: 'x', executar: async () => { throw new Error('caiu'); }, aoFalhar: (e) => falhas.push(e.message) });
  d.adicionar({ id: 'a', rotulo: 'y', executar: async () => 'ok' });
  assert.equal(d.pendentes().length, 1);
  assert.deepEqual(await d.confirmarTudo(), [true]);
  assert.equal(d.pendentes().length, 0);
  d.adicionar({ id: 'c', rotulo: 'z', executar: async () => { throw new Error('caiu'); }, aoFalhar: (e) => falhas.push(e.message) });
  assert.deepEqual(await d.confirmarTudo(), [false]);
  assert.deepEqual(falhas, ['caiu']);
});

/* ------------------------------ ecossistema ------------------------------ */

test('links: só para dentro do ecossistema, sempre relativos à Central', () => {
  const base = '/trafego/';
  assert.equal(baseDaPagina('/trafego/'), '/trafego/');
  assert.equal(baseDaPagina('/trafego/index.html'), '/trafego/');
  assert.equal(raizDaCentral(base), '/');
  assert.equal(raizDaCentral('/'), null);
  assert.equal(linkSeguro('/crm/?lead=1', { base }), '/crm/?lead=1');
  assert.equal(linkSeguro('agenda/', { base }), '/agenda/');
  assert.equal(linkSeguro('https://indycar-patio.netlify.app/os/12', { base }), 'https://indycar-patio.netlify.app/os/12');
  for (const ruim of ['javascript:alert(1)', '//mal.example/x', 'https://mal.example/', 'http://indycar-patio.netlify.app/', '/crm/ x', '/a\\b']) assert.equal(linkSeguro(ruim, { base }), null, ruim);
  assert.equal(linkSeguro('/crm/', { base: '/' }), CENTRAL_PUBLICA + 'crm/');
  assert.equal(enderecoDeEntrada({ base, hash: '#/jornada?contato=1' }), '/?voltar=' + encodeURIComponent('/trafego/#/jornada?contato=1'));
  assert.equal(listaDeApps({ base }).find((a) => a.aqui).id, 'trafego');
});

/* ------------------------------ valor digitado ------------------------------ */

test('valor do serviço: aceita o jeito brasileiro e explica quando não dá', () => {
  assert.deepEqual(conferirValor('750'), { valor: 750 });
  assert.deepEqual(conferirValor('1.250,50'), { valor: 1250.5 });
  assert.match(conferirValor('abc').erro, /Digite o valor/);
  assert.match(conferirValor('0,50').erro, /entre/);
  assert.match(conferirValor('200000').erro, /entre/);
});

/* ------------------------------ telas soltas (folha e apresentação) ------------------------------ */

test('folha e apresentação: rotas próprias, fora do menu, e o "ir" da API leva até elas', () => {
  assert.deepEqual(lerRota('#/folha?mes=2026-10'), { tela: 'folha', params: { mes: '2026-10' } });
  assert.deepEqual(lerRota('#/apresentacao?periodo=7d'), { tela: 'apresentacao', params: { periodo: '7d' } });
  assert.equal(montarRota('folha', { mes: '2026-11' }), '#/folha?mes=2026-11');
  assert.deepEqual(destinoDaApi('folha?mes=2026-09'), { tipo: 'tela', tela: 'folha', params: { mes: '2026-09' } });
  assert.deepEqual(destinoDaApi('apresentacao'), { tipo: 'tela', tela: 'apresentacao', params: {} });
});

test('recusaDaCasca: só 401 e 403 que falam da pessoa param o app inteiro (rodada 9)', () => {
  assert.equal(Rede.recusaDaCasca(401, null), true);
  for (const codigo of ['sem_acesso', 'desativado', 'sem_perfil', 'mfa', 'trocar_senha']) assert.equal(Rede.recusaDaCasca(403, codigo), true, codigo);
  // "Só o administrador cria chaves": recusa de uma ação, a gaveta mostra a frase e o app segue.
  assert.equal(Rede.recusaDaCasca(403, 'so_admin'), false);
  assert.equal(Rede.recusaDaCasca(403, null), false);
  assert.equal(Rede.recusaDaCasca(500, 'sem_acesso'), false);
});
