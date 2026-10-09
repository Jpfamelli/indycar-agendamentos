// Testes das regras PURAS de public/planejamento.js (Semana, conflito, duração,
// relatório, CSV e os links de entrada/saída do ecossistema). Carrega o arquivo
// de verdade — ele se registra em globalThis.Planejamento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/planejamento.js';

const P = globalThis.Planejamento;
const ag = (o) => ({ id: Math.random().toString(36).slice(2), data: '2026-10-09', hora: '09:00', status: 'aguardando', servico: 'Troca de óleo', ...o });

test('telefone: só os dígitos nacionais, sem o 55 do DDI', () => {
  assert.equal(P.telefone('(12) 99141-5355'), '12991415355');
  assert.equal(P.telefone('+55 12 99141-5355'), '12991415355');
  assert.equal(P.telefone('551232211234'), '1232211234');
  assert.equal(P.telefone('55999887766'), '55999887766');      // DDD 55 (RS), 11 dígitos: fica
  assert.equal(P.telefone(null), '');
});

test('periodo: semana começa na segunda; mês tem todos os dias; andar não pula fevereiro', () => {
  const s = P.periodo('2026-10-09', 'semana');                  // sexta
  assert.equal(s.length, 7);
  assert.equal(s[0], '2026-10-05');
  assert.equal(s[6], '2026-10-11');
  assert.equal(P.periodo('2026-10-11', 'semana')[0], '2026-10-05');   // domingo fica na semana que começou na segunda
  assert.equal(P.periodo('2026-02-10', 'mes').length, 28);
  assert.deepEqual(P.periodo('2026-10-09', 'dia'), ['2026-10-09']);
  assert.deepEqual(P.periodo('lixo', 'semana'), []);
  assert.equal(P.andar('2026-01-31', 'mes', 1), '2026-02-01');
  assert.equal(P.andar('2026-10-09', 'semana', -1), '2026-10-02');
  assert.equal(P.andar('2026-10-09', 'dia', 1), '2026-10-10');
});

test('duracao: usa o cadastro de serviços, depois palavras-chave, depois 60 min', () => {
  const t = P.tabelaDuracoes([{ nome: 'Troca de Óleo de Motor', duracao_min: 40 }, { nome: 'Revisão de Motor', duracao_min: 360 }, { nome: 'Lixo', duracao_min: 0 }]);
  assert.equal(P.duracao('troca de oleo de motor', t), 40);           // sem acento/maiúscula
  assert.equal(P.duracao('Revisão de motor completa', t), 360);       // nome do cadastro contido no texto
  assert.equal(P.duracao('Alinhamento 3D'), 45);
  assert.equal(P.duracao('Pastilha de freio'), 90);
  assert.equal(P.duracao('Correia dentada'), 240);
  assert.equal(P.duracao('Coisa nova'), 60);
});

test('conflitos: mesma meia hora; com consultor só os dele; sem consultor só quando lota', () => {
  const lista = [ag({ id: 'a', hora: '09:00', consultor_id: 'c1' }), ag({ id: 'b', hora: '09:20', consultor_id: 'c2' }),
    ag({ id: 'c', hora: '10:00' }), ag({ id: 'd', hora: '09:10', status: 'cancelado' })];
  assert.deepEqual(P.conflitos(lista, ag({ id: 'x', hora: '09:15', consultor_id: 'c1' })).map((a) => a.id), ['a']);
  assert.deepEqual(P.conflitos(lista, ag({ id: 'x', hora: '09:15' }), 3), []);          // 2 perto, capacidade 3: cabe
  assert.deepEqual(P.conflitos(lista, ag({ id: 'x', hora: '09:15' }), 2).map((a) => a.id).sort(), ['a', 'b']);
  assert.deepEqual(P.conflitos(lista, ag({ id: 'a', hora: '09:00', consultor_id: 'c1' }), 5), []);  // ele mesmo não conta
  assert.deepEqual(P.conflitos(lista, ag({ hora: '11:00' })), []);
  assert.deepEqual(P.conflitos(lista, ag({ hora: '09:00', status: 'concluido' })), []);    // desfecho não disputa nada
});

test('ocupacao: conta só os ativos do dia, sobre 19 janelas × capacidade', () => {
  const l = [ag({}), ag({ hora: '10:00' }), ag({ status: 'nao_veio' }), ag({ data: '2026-10-10' })];
  const o = P.ocupacao(l, '2026-10-09', 1);
  assert.equal(o.ativos, 2);
  assert.equal(o.vagas, 19);
  assert.equal(o.pct, 11);
  assert.equal(P.ocupacao(l, '2026-10-09', 2).vagas, 38);
});

test('filtrar: período, situação, consultor, origem, sem telefone e busca por nome/placa/telefone', () => {
  const l = [ag({ cliente_nome: 'Ana Lúcia', placa: 'ABC1D23', telefone: '12991110001', origem: 'Google', consultor_id: 'c1' }),
    ag({ cliente_nome: 'Bruno', data: '2026-10-12', telefone: null, origem: 'WhatsApp', status: 'nao_veio' })];
  assert.equal(P.filtrar(l, { q: 'ana lucia' }).length, 1);
  assert.equal(P.filtrar(l, { q: 'abc1' }).length, 1);
  assert.equal(P.filtrar(l, { q: '1110001' }).length, 1);
  assert.equal(P.filtrar(l, { semTelefone: true })[0].cliente_nome, 'Bruno');
  assert.equal(P.filtrar(l, { inicio: '2026-10-10', fim: '2026-10-31' }).length, 1);
  assert.equal(P.filtrar(l, { status: 'nao_veio', origem: 'WhatsApp' }).length, 1);
  assert.equal(P.filtrar(l, { consultor: 'c1' }).length, 1);
});

test('resumo e grupos: veio / fechou / faltou e as taxas', () => {
  const l = [ag({ status: 'concluido', origem: 'Google' }), ag({ status: 'nao_fechou', origem: 'Google' }),
    ag({ status: 'nao_veio', origem: 'WhatsApp' }), ag({ status: 'aguardando', origem: 'WhatsApp' }), ag({ status: 'cancelado' })];
  const r = P.resumo(l);
  assert.equal(r.total, 5); assert.equal(r.veio, 2); assert.equal(r.fechou, 1); assert.equal(r.faltou, 1);
  assert.equal(r.pendentes, 1); assert.equal(r.cancelados, 1);
  assert.equal(r.taxaFalta, 33);       // 1 falta em 3 desfechos
  assert.equal(r.conversao, 50);       // 1 fechou de 2 que vieram
  const g = P.grupos(l, 'origem');
  assert.equal(g[0].nome, 'Google'); assert.equal(g[0].taxaFalta, 0);
  assert.equal(g.find((x) => x.nome === 'WhatsApp').taxaFalta, 100);
  assert.ok(g.some((x) => x.nome === 'Não informado'));
});

test('csv: BOM, ponto e vírgula, aspas escapadas e fórmula neutralizada', () => {
  const t = P.csv([ag({ cliente_nome: '=HYPERLINK("x")', servico: 'Óleo "sintético"', status: 'nao_veio' })], { nao_veio: 'Não veio' });
  assert.ok(t.startsWith('﻿"Data";"Hora"'));
  assert.ok(t.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(t.includes('"Óleo ""sintético"""'));
  assert.ok(t.includes('"Não veio"'));
});

test('links de saída: contrato do ecossistema (?tel= / ?cliente=&tel=)', () => {
  const l = P.links({ telefone: '+55 (12) 99141-5355', cliente_id: '0b6c3c3e-1d1f-4c3a-9a7b-2b1f0f0e9d11' });
  assert.equal(l.atendimento, 'https://indycar-atendimento.onrender.com/?tel=12991415355');
  assert.equal(l.crm, 'https://indycar-crm.onrender.com/?cliente=0b6c3c3e-1d1f-4c3a-9a7b-2b1f0f0e9d11&tel=12991415355');
  assert.equal(l.comunicar, 'https://indycar-posvenda.onrender.com/?cliente=0b6c3c3e-1d1f-4c3a-9a7b-2b1f0f0e9d11&tel=12991415355');
  assert.deepEqual(P.links({ telefone: '', cliente_id: 'nao-e-uuid' }), {});
  const so = P.links({ cliente_id: '0b6c3c3e-1d1f-4c3a-9a7b-2b1f0f0e9d11' });
  assert.equal(so.atendimento, undefined);                       // sem telefone não há conversa para abrir
  assert.equal(so.crm, 'https://indycar-crm.onrender.com/?cliente=0b6c3c3e-1d1f-4c3a-9a7b-2b1f0f0e9d11');
});

test('link de entrada: lê ?tel= (com/sem 55) e &cliente=, ignora lixo e limpa a URL', () => {
  assert.deepEqual(P.lerEntrada('?tel=5512991415355'), { tel: '12991415355', cliente: '', agendamento: '' });
  assert.deepEqual(P.lerEntrada('?tel=12991415355&cliente=0B6C3C3E-1D1F-4C3A-9A7B-2B1F0F0E9D11'),
    { tel: '12991415355', cliente: '0b6c3c3e-1d1f-4c3a-9a7b-2b1f0f0e9d11', agendamento: '' });
  assert.equal(P.lerEntrada('?tel=123'), null);                  // curto demais para achar alguém
  assert.equal(P.lerEntrada('?cliente=<script>'), null);
  assert.equal(P.lerEntrada('?r=agenda'), null);
  assert.equal(P.semEntrada('https://x.onrender.com/?tel=12991415355&cliente=abc&r=semana#topo'), '/?r=semana#topo');
  assert.equal(P.semEntrada('https://x.onrender.com/?tel=1299'), '/');
});
