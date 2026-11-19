/* Gestor IA, rodada 9: anotar uma mudança feita por conta própria e quem aparece no diário. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { anotacao, quemNoDiario, lerAcao, ONDE_ANOTAR } from '../js/acoes-logica.js';

test('anotacao: confere o formulário com as regras do servidor antes de mandar', () => {
  assert.deepEqual(anotacao({ tipo: '', titulo: 'Pausei a campanha' }), { ok: false, campo: 'tipo', erro: 'Escolha o tipo da mudança.' });
  assert.equal(anotacao({ tipo: 'pausar', titulo: '  ab  ' }).campo, 'titulo');
  assert.equal(anotacao({ tipo: 'pausar', titulo: 'x'.repeat(121) }).campo, 'titulo');
  assert.equal(anotacao({ tipo: 'pausar', titulo: 'Pausei a campanha', porque: 'y'.repeat(1001) }).campo, 'porque');
});

test('anotacao: monta o corpo de POST api/acoes-trafego (já feita, alvo pela escolha de onde)', () => {
  const sem = anotacao({ tipo: 'ajustar_horario', titulo: '  Desliguei   o Google no domingo ', onde: '' });
  assert.deepEqual(sem, { ok: true, corpo: { tipo: 'ajustar_horario', titulo: 'Desliguei o Google no domingo', ja_fiz: true } });
  const campanha = anotacao({ tipo: 'pausar', titulo: 'Pausei a de freios', onde: 'meta', campanha: 'Freios com garantia', porque: 'Não fechava' });
  assert.deepEqual(campanha.corpo.alvo, { plataforma: 'meta', nivel: 'campanha', nome: 'Freios com garantia' });
  assert.equal(campanha.corpo.porque, 'Não fechava');
  assert.deepEqual(anotacao({ tipo: 'pausar', titulo: 'Pausei tudo no Google', onde: 'google' }).corpo.alvo, { plataforma: 'google', nivel: 'conta', nome: 'Google Ads' });
  assert.deepEqual(anotacao({ tipo: 'outro', titulo: 'Atender até 19h', onde: 'oficina' }).corpo.alvo.nivel, 'outro');
  for (const o of ONDE_ANOTAR) assert.ok(['meta', 'google', 'oficina', 'site'].includes(o.id), 'só plataformas que o servidor aceita');
});

test('quemNoDiario: a mudança anotada por uma pessoa não diz que ela "sugeriu"', () => {
  const pessoa = lerAcao({ id: 'a1', origem: 'pessoa', autor: 'Paulo', decidida_por: 'Paulo', status: 'feita', tipo: 'outro', titulo: 'Atender até 19h' });
  assert.equal(quemNoDiario(pessoa), 'Paulo anotou');
  const ia = lerAcao({ id: 'a2', origem: 'ia', status: 'feita', decidida_por: 'Paulo', tipo: 'pausar', titulo: 'Pausar' });
  assert.equal(quemNoDiario(ia), 'Gestor IA sugeriu · Paulo decidiu');
  assert.equal(quemNoDiario(lerAcao({ id: 'a3', origem: 'radar', status: 'expirada', tipo: 'pausar' })), 'Radar sugeriu');
});

import { detalheSemCampanha } from '../js/contatos.js';
test('detalheSemCampanha: na campanha aberta, a linha do contato não repete o nome da campanha', () => {
  assert.equal(detalheSemCampanha('Troca de óleo R$ 169 › Taubaté 30 km › Vídeo 2', 'Troca de óleo R$ 169'), 'Taubaté 30 km › Vídeo 2');
  assert.equal(detalheSemCampanha('Troca de óleo R$ 169', 'Troca de óleo R$ 169'), null);
  assert.equal(detalheSemCampanha('Outra campanha › Vídeo', 'Troca de óleo'), 'Outra campanha › Vídeo');
  assert.equal(detalheSemCampanha('Taubaté › Vídeo', null), 'Taubaté › Vídeo');
  assert.equal(detalheSemCampanha('', 'X'), null);
});
