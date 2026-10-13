// Regras de acesso, aviso de falta e erros (regras.js) — puras.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decidirAcesso, podeUsarApp, rotaDaPresenca, rotaDeGestor, decidirNaoVeioNaEdicao,
  mudaDesfechoRegistrado, origemPermitida, mensagemSegura,
} from '../regras.js';

const U = '11111111-2222-4333-8444-555555555555';
const P = (papel, apps = ['agenda'], ativo = true) => ({ papel, apps, ativo });

test('podeUsarApp: admin sempre; resto precisa de "agenda" em apps; desativado nunca', () => {
  assert.equal(podeUsarApp(P('admin', [])), true);
  assert.equal(podeUsarApp(P('atendente', ['crm'])), false);
  assert.equal(podeUsarApp(P('gestor', ['agenda'])), true);
  assert.equal(podeUsarApp(P('admin', [], false)), false);
  assert.equal(podeUsarApp(null), false);
});

test('decidirAcesso: cada papel', () => {
  assert.equal(decidirAcesso({ perfil: null, metodo: 'GET', rota: '/api/agendamentos' }).status, 401);
  assert.equal(decidirAcesso({ perfil: P('atendente', ['agenda'], false), metodo: 'GET', rota: '/api/perfil' }).codigo, 'desativado');
  // sem o app: só o próprio perfil e a troca de senha
  assert.equal(decidirAcesso({ perfil: P('atendente', ['crm']), metodo: 'GET', rota: '/api/agendamentos' }).codigo, 'sem_acesso_app');
  assert.equal(decidirAcesso({ perfil: P('atendente', ['crm']), metodo: 'GET', rota: '/api/perfil' }), null);
  assert.equal(decidirAcesso({ perfil: P('atendente', ['crm']), metodo: 'POST', rota: '/api/perfil/senha-trocada' }), null);
  // presença
  assert.equal(decidirAcesso({ perfil: P('agenda'), metodo: 'PATCH', rota: `/api/agendamentos/${U}/status` }), null);
  assert.equal(decidirAcesso({ perfil: P('agenda'), metodo: 'PUT', rota: `/api/agendamentos/${U}` }).codigo, 'so_presenca');
  assert.equal(decidirAcesso({ perfil: P('agenda'), metodo: 'GET', rota: '/api/crm' }).codigo, 'so_presenca');
  assert.equal(decidirAcesso({ perfil: P('agenda'), metodo: 'PATCH', rota: `/api/tarefas/${U}` }), null);
  assert.equal(decidirAcesso({ perfil: P('agenda'), metodo: 'PATCH', rota: '/api/tarefas/qualquer' }).codigo, 'so_presenca', 'UUID conferido');
  // gestor x atendente
  assert.equal(decidirAcesso({ perfil: P('atendente'), metodo: 'DELETE', rota: `/api/clientes/${U}` }).codigo, 'so_gestor');
  assert.equal(decidirAcesso({ perfil: P('gestor'), metodo: 'DELETE', rota: `/api/clientes/${U}` }), null);
  assert.equal(decidirAcesso({ perfil: P('atendente'), metodo: 'PUT', rota: `/api/agendamentos/${U}` }), null);
  assert.equal(decidirAcesso({ perfil: P('admin', []), metodo: 'GET', rota: '/api/export/clientes.csv' }), null);
});

test('rotas: allowlist da presença e lista do gestor', () => {
  assert.equal(rotaDaPresenca('GET', '/api/agendamentos'), true);
  assert.equal(rotaDaPresenca('DELETE', `/api/agendamentos/${U}`), false);
  assert.equal(rotaDaPresenca('GET', '/api/clientes'), false);
  assert.equal(rotaDeGestor('GET', '/api/export/agendamentos.csv'), true);
  assert.equal(rotaDeGestor('PUT', '/api/integracoes'), true);
  assert.equal(rotaDeGestor('GET', '/api/agendamentos'), false);
});

test('aviso de falta pela edição: pergunta, carimba ou avisa', () => {
  const pend = { status: 'confirmado', no_show_notificado_em: null };
  assert.equal(decidirNaoVeioNaEdicao(pend, { status: 'nao_veio' }).acao, 'perguntar');
  assert.equal(decidirNaoVeioNaEdicao(pend, { status: 'nao_veio', avisar_cliente: false }).acao, 'carimbar');
  assert.equal(decidirNaoVeioNaEdicao(pend, { status: 'nao_veio', avisar_cliente: true }).acao, 'avisar');
  // desfazer a remarcação devolve o carimbo antigo: não pergunta
  assert.equal(decidirNaoVeioNaEdicao(pend, { status: 'nao_veio', no_show_notificado_em: '2026-10-10T10:00:00Z' }).acao, 'carimbar');
  // já estava nao_veio, ou já carimbado: o gatilho não dispara, nada a fazer
  assert.equal(decidirNaoVeioNaEdicao({ status: 'nao_veio' }, { status: 'nao_veio' }).acao, 'nada');
  assert.equal(decidirNaoVeioNaEdicao({ status: 'aguardando', no_show_notificado_em: 'x' }, { status: 'nao_veio' }).acao, 'nada');
  assert.equal(decidirNaoVeioNaEdicao(pend, { observacoes: 'oi' }).acao, 'nada');
});

test('mudaDesfechoRegistrado: só quando JÁ havia desfecho', () => {
  assert.equal(mudaDesfechoRegistrado('concluido', 'nao_fechou'), true);
  assert.equal(mudaDesfechoRegistrado('nao_veio', 'aguardando'), true);
  assert.equal(mudaDesfechoRegistrado('confirmado', 'concluido'), false);
  assert.equal(mudaDesfechoRegistrado('concluido', 'concluido'), false);
});

test('origemPermitida: mesmo domínio, ecossistema e localhost; o resto não', () => {
  assert.equal(origemPermitida(undefined, 'x'), true);
  assert.equal(origemPermitida('https://indycar-agendamentos.onrender.com', 'indycar-agendamentos.onrender.com'), true);
  assert.equal(origemPermitida('https://indycar-orcador.netlify.app', 'indycar-agendamentos.onrender.com'), true);
  assert.equal(origemPermitida('https://evil.example', 'indycar-agendamentos.onrender.com'), false);
  assert.equal(origemPermitida('http://localhost:3011', 'localhost:3010'), true);
  assert.equal(origemPermitida('lixo', 'h'), false);
});

test('mensagemSegura: recado nosso passa; erro interno vira genérico com código', () => {
  assert.deepEqual(mensagemSegura(Object.assign(new Error('Corpo inválido: envie JSON.'), { status: 400 })), { status: 400, erro: 'Corpo inválido: envie JSON.' });
  assert.equal(mensagemSegura(new Error('Data em formato inválido.')).status, 400);
  const interno = mensagemSegura(Object.assign(new Error('Erro 500 na tabela "x" (stack)'), { name: 'ErroSupabase', status: 500 }), 'ab12');
  assert.equal(interno.status, 500);
  assert.match(interno.erro, /ab12/);
  assert.doesNotMatch(interno.erro, /tabela/);
  assert.equal(mensagemSegura(new TypeError('cannot read x of undefined')).status, 500);
  const dup = mensagemSegura(Object.assign(new Error('Conflito'), { name: 'ErroSupabase', status: 409, detalhe: 'duplicate key value violates unique constraint "agendamentos_slot_uk"' }));
  assert.equal(dup.status, 409);
  assert.match(dup.erro, /consultor já tem um carro/);
});
