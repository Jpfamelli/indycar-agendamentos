// Contrato dos links entre sistemas (C1c): o que a Casa monta é o que a Agenda, o Atendimento, o CRM, o Comunicar e o Orçador entendem —
// o mesmo telefone em qualquer formato chega igual do outro lado. Cobre o caminho Casa -> Agenda -> Pátio/Orçador sem subir nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
await import('../casa/logica.js');
await import('../casa/logica3.js');
const L = globalThis.CasaLogica, W = globalThis.CasaLogica3;
const sandbox = (arq, extra = {}) => { const c = vm.createContext({ URL, URLSearchParams, globalThis: null, ...extra }); c.globalThis = c; c.window = c; vm.runInContext(readFileSync(new URL('../' + arq, import.meta.url), 'utf8'), c); return c; };
const P = sandbox('public/planejamento.js').Planejamento;
const D = sandbox('public/rodada6d.js').R6dPuro;
const links = L.links(L.bases({}));
const FORMATOS = ['5512977776666', '12977776666', '(12) 97777-6666', '+55 12 97777-6666', '55 (12) 97777-6666'];
const NACIONAL = '12977776666';
const U = (u) => new URL(u, 'https://central.test');
const consulta = (url) => U(url).search;
const soDigitos = (t) => String(t || '').replace(/\D/g, '');
const semDDI = (t) => { const d = soDigitos(t); return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d; };

test('Casa -> Agenda: "Marcar horário" chega com o telefone nacional certo e pede horário novo, em qualquer formato', () => {
  for (const f of FORMATOS) {
    const e = P.lerEntrada(consulta(links.agendaNovo({ telefone: f })));
    assert.ok(e, `formato ${f}`); assert.equal(e.tel, NACIONAL, `formato ${f}`); assert.equal(e.novo, true);
  }
});
test('Casa -> Agenda: telefone incompleto ou lixo não vira link que abre errado', () => {
  for (const ruim of ['', null, '123', '9999-9999', 'abc']) {
    const e = P.lerEntrada(consulta(links.agendaNovo({ telefone: ruim })));
    assert.ok(!e || !e.tel, `telefone ${JSON.stringify(ruim)} não pode virar tel`);
  }
});
test('Casa -> Orçador: "novo orçamento" leva telefone com 55 (padrão entre sistemas), nome curto e sem HTML solto', () => {
  const u = U(links.novoOrcamento({ telefone: '(12) 97777-6666', nome: 'Caio Prado' }));
  assert.equal(u.searchParams.get('tel'), '55' + NACIONAL); assert.equal(u.searchParams.get('nome'), 'Caio Prado');
  const longo = U(links.novoOrcamento({ telefone: NACIONAL, nome: 'x'.repeat(500) }));
  assert.ok(longo.searchParams.get('nome').length <= 80);
});
test('Casa -> Atendimento/CRM/Comunicar e Agenda -> os mesmos: o telefone chega equivalente nos dois sentidos', () => {
  const dosApps = P.links({ telefone: '5512977776666' });
  for (const [casa, agenda] of [[links.conversaTel('5512977776666'), dosApps.atendimento], [links.crmTel({ telefone: '5512977776666' }), dosApps.crm], [links.comunicarTel({ telefone: '5512977776666' }), dosApps.comunicar]]) {
    const a = U(casa).searchParams.get('tel'), b = U(agenda).searchParams.get('tel');
    assert.equal(semDDI(a), NACIONAL); assert.equal(semDDI(b), NACIONAL); assert.equal(semDDI(a), semDDI(b));
  }
});
test('WhatsApp: a Casa e a Agenda montam o MESMO endereço para o mesmo número e texto (sem divergir com o tempo)', () => {
  for (const f of FORMATOS) {
    const texto = 'Oi, tudo bem? É da IndyCar & cia.';
    assert.equal(W.linkWhatsApp(f, texto), D.linkWhatsApp(f, texto), `formato ${f}`);
  }
  assert.equal(W.linkWhatsApp('123', 'x'), null); assert.equal(D.linkWhatsApp('123', 'x'), null);
});
test('Ida e volta: telefone_55 do banco -> botão "Marcar" da Casa -> entrada da Agenda devolve o mesmo número', () => {
  for (const fone55 of ['5512977776666', '5512988887777', '551232211234']) {
    const e = P.lerEntrada(consulta(links.agendaNovo({ telefone: fone55 })));
    assert.equal(e.tel, fone55.slice(2));
  }
});
test('Entrada da Agenda: nome vindo de link é limpo (sem < > nem caracteres de controle) e cortado', () => {
  const e = P.lerEntrada('?novo=1&tel=5512977776666&nome=' + encodeURIComponent('<img src=x onerror=1>\u0007Caio ' + 'a'.repeat(300)));
  assert.ok(!/[<>\u0007]/.test(e.nome)); assert.ok(e.nome.length <= 80);
});
test('Entrada da Agenda: o link não carrega o telefone para o endereço salvo (semEntrada tira tudo)', () => {
  const sem = P.semEntrada('https://x.com/agenda/?novo=1&tel=5512977776666&nome=Caio&r=quadro');
  assert.equal(sem, '/agenda/?r=quadro');
});
