// Casa, rodada 19 (revisão da R18):
//  - "WhatsApp parado" por silêncio: a Casa e o Atendimento usam a MESMA conta (4 horas de expediente, feriado não conta).
//    Antes a Casa media 20 h corridas: dizia "tudo em ordem" a tarde inteira com o Atendimento dizendo "parado", e num
//    domingo quieto acusava a chave com o WhatsApp funcionando.
//  - sino: o lote vai em pedaços de 100 ids e conta o que o banco gravou de verdade (marcar e desfazer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../casa/logica.js');
await import('../casa/logica2.js');
await import('../casa/logica4.js');
await import('../casa/logica5.js');
const L5 = globalThis.CasaLogica5;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const R18 = createRequire(import.meta.url)(join(RAIZ, 'apps/atendimento/lib/r18.js'));
const ler = (f) => readFileSync(join(RAIZ, 'casa', f), 'utf8');
const em = (iso) => Date.parse(iso + '-03:00');   // hora de São Paulo

test('a Casa e o Atendimento contam as mesmas horas de expediente (dia útil, noite, fim de semana, feriado)', () => {
  const pares = [
    ['2026-11-24T08:24:45', '2026-11-25T10:00:00'],   // o caso real de 25/11
    ['2026-11-24T17:00:00', '2026-11-25T09:00:00'],   // a noite
    ['2026-11-27T17:30:00', '2026-11-30T08:30:00'],   // sexta à tarde → segunda cedo
    ['2026-11-28T11:00:00', '2026-11-29T22:00:00'],   // sábado → domingo à noite
    ['2026-11-19T16:00:00', '2026-11-23T11:00:00'],   // atravessa o feriado de 20/11
    ['2026-12-24T12:00:00', '2026-12-26T12:00:00'],   // Natal
    ['2026-04-02T15:00:00', '2026-04-06T10:00:00'],   // Sexta-feira Santa
    ['2026-02-13T17:00:00', '2026-02-18T09:00:00'],   // Carnaval
  ];
  for (const [de, ate] of pares) {
    const casa = L5.horasDeExpediente(em(de), em(ate)), at = R18.horasComerciais(em(de), em(ate));
    assert.equal(casa, at, `${de} → ${ate}`);
  }
  assert.equal(L5.SILENCIO_H, R18.LIMIAR_SILENCIO_H, 'o mesmo corte nas duas telas');
  // e a decisão é a mesma, minuto a minuto, numa semana inteira com feriado no meio
  const ultima = '2026-11-18T16:40:00';
  for (let t = em('2026-11-18T16:40:00'); t < em('2026-11-25T18:00:00'); t += 17 * 60_000) {
    const casa = !!L5.whatsappParado({ ultimaEntrada: new Date(em(ultima)).toISOString(), agoraMs: t });
    const at = R18.decidirZap({ ultimaEntrada: new Date(em(ultima)).toISOString(), agora: t }).parado;
    assert.equal(casa, at, new Date(t).toISOString());
  }
});

test('a parada de 24/11 aparece na Casa na mesma hora do Atendimento (antes: 16 horas depois)', () => {
  const ultima = new Date(em('2026-11-24T08:24:45')).toISOString();
  assert.equal(L5.whatsappParado({ ultimaEntrada: ultima, agoraMs: em('2026-11-24T12:20:00') }), null);
  const p = L5.whatsappParado({ ultimaEntrada: ultima, agoraMs: em('2026-11-24T12:30:00') });
  assert.equal(p.codigo, 'sem-receber', 'terça 12h30: 4 h de expediente sem mensagem');
  assert.equal(p.desdeMs, em('2026-11-24T08:24:45'));
});

test('domingo quieto e feriado não acusam a chave com o WhatsApp funcionando', () => {
  const sab = new Date(em('2026-11-28T11:30:00')).toISOString();
  assert.equal(L5.whatsappParado({ ultimaEntrada: sab, agoraMs: em('2026-11-29T20:00:00') }), null, 'sábado 11h30 → domingo 20h (32 h corridas, meia hora de expediente)');
  assert.equal(L5.whatsappParado({ ultimaEntrada: sab, agoraMs: em('2026-11-30T07:50:00') }), null, 'segunda antes de abrir');
  const fer = new Date(em('2026-11-20T11:52:00')).toISOString();
  assert.equal(L5.whatsappParado({ ultimaEntrada: fer, agoraMs: em('2026-11-20T17:09:00') }), null, '20/11/2026, feriado: o caso medido no banco');
  assert.equal(L5.ehFeriado(Date.UTC(2026, 10, 20)), true);
  assert.equal(L5.ehFeriado(Date.UTC(2026, 10, 25)), false);
});

test('sino: lote em pedaços de 100 e texto do desfazer com a contagem de verdade', () => {
  const ids = Array.from({ length: 300 }, (_, i) => 'n' + i);
  assert.deepEqual(L5.pedacos(ids, 100).map((p) => p.length), [100, 100, 100]);
  assert.deepEqual(L5.pedacos(ids.slice(0, 131), 100).map((p) => p.length), [100, 31]);
  assert.deepEqual(L5.pedacos([], 100), []);
  assert.deepEqual(L5.pedacos(['a'], 100), [['a']]);
  assert.equal(L5.textoDesfeito(131, 131), '131 avisos voltaram para não lidos.');
  assert.equal(L5.textoDesfeito(1, 1), '1 aviso voltou para não lido.');
  assert.equal(L5.textoDesfeito(128, 131), '128 avisos voltaram para não lidos (3 já tinham sido mexidos e ficaram como está).');
  assert.equal(L5.textoDesfeito(0, 1), 'Nenhum aviso voltou para não lido (1 já tinha sido mexido e ficou como está).');
  const s = ler('sino.js');
  assert.match(s, /N5\(\)\.pedacos\(ids, 100\)/, 'nenhuma escrita leva mais de 100 ids no endereço');
  assert.match(s, /\.in\('id', parte\)\)\.select\('id'\)/, 'cada pedaço devolve o que mudou');
  assert.match(s, /return \{ ok: feitos\.length > 0, em: agora, ids: feitos \}/, 'o "desfazer" guarda só o que o banco marcou');
  assert.ok(!/\.in\('id', feitos\)|\.in\('id', d\.ids\)/.test(s), 'a escrita de uma vez só, com todos os ids, saiu');
  assert.match(s, /N5\(\)\.textoDesfeito\(feitos\.length, d\.n\)/);
});

test('versões: o navegador e o service worker pegam os arquivos novos', () => {
  const html = ler('index.html');
  assert.match(html, /logica5\.js\?v=7/);
  assert.match(html, /sino\.js\?v=16/);
  assert.match(ler('sw.js'), /indycar-casa-v26/);
});
