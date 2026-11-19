import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const ler = (nome) => readFileSync(new URL('../casa/' + nome, import.meta.url), 'utf8');
function casaMock(papel = 'admin') {
  const elemento = () => ({ hidden: true, dataset: {}, setAttribute() {} });
  const faixas = [elemento(), elemento()];
  const els = new Map();
  const document = {
    querySelector(s) {
      if (!els.has(s)) els.set(s, elemento());
      return els.get(s);
    },
    querySelectorAll() { return faixas; },
    addEventListener() {},
    removeEventListener() {},
  };
  const ctx = { document, URL, location: { origin: 'http://localhost:3490' }, setInterval() {}, clearInterval() {} };
  ctx.window = ctx;
  for (const js of ['logica.js', 'logica2.js', 'logica4.js', 'saude.js']) runInNewContext(ler(js), ctx);
  const chamadas = [];
  const estado = {
    resultado: { data: { graves: [], vigia_parado: false } },
    sb: {
      async rpc(nome) {
        chamadas.push(nome);
        return nome === 'vigia_avisos_abertos' ? estado.resultado : { data: {} };
      },
    },
    L: ctx.CasaLogica,
    perfil: { papel },
    visao: () => ({ dono: false }),
    podeUsar: (app) => app === 'atendimento',
    bases: { atendimento: '/atendimento/' },
    toast() {},
    esc: (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
  };
  ctx.CasaModulos[0].montar(estado);
  return { faixas, chamadas, estado, doc: document, desmontar: ctx.CasaModulos[0].desmontar };
}
const chave = { codigo: 'codewords-chave-recusada', dias: 48 };
const backup = { codigo: 'backup-faltando', resumo: '<img src=x>', dias: 2 };

test('Vigia na Casa e no sino: sem graves, um grave, vários, parado, falha e recuperação', async () => {
  const { faixas, estado, doc } = casaMock();
  await estado.saude.atualizar();
  assert.ok(faixas.every((el) => el.hidden));
  estado.resultado = { data: { graves: [chave], vigia_parado: false } };
  await estado.saude.atualizar();
  assert.ok(faixas.every((el) => !el.hidden && el.innerHTML.includes('WhatsApp recusado há 48 dias')));
  assert.match(faixas[0].innerHTML, /atendimento\/\?aba=integracoes/);
  estado.resultado = { data: { graves: [chave, backup], vigia_parado: true, gerado_em: '2026-11-19T12:00:00Z', vigia_conferiu_em: '2026-11-18T00:00:00Z' } };
  await estado.saude.atualizar();
  const html = faixas[0].innerHTML;
  assert.ok(html.indexOf('WhatsApp recusado') < html.indexOf('&lt;img'));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /Vigia não confere há 36 horas/);
  estado.resultado = { error: new Error('sem rede') };
  await estado.saude.atualizar();
  assert.match(faixas[0].innerHTML, /Não deu para conferir/);
  assert.match(faixas[0].innerHTML, /WhatsApp recusado/);
  assert.notEqual(doc.querySelector('#saudeSist').hidden, true);
  estado.resultado = { data: { graves: [], vigia_parado: false } };
  await estado.saude.atualizar();
  assert.ok(faixas.every((el) => el.hidden));
});

test('Vigia: atendente não consulta, gestor consulta e logout esconde as faixas', async () => {
  const atendente = casaMock('atendente');
  await atendente.estado.saude.atualizar();
  assert.ok(!atendente.chamadas.includes('vigia_avisos_abertos'));
  const gestor = casaMock('gestor');
  gestor.estado.resultado = { data: { graves: [chave] } };
  await gestor.estado.saude.atualizar();
  assert.ok(gestor.chamadas.includes('vigia_avisos_abertos'));
  gestor.desmontar();
  assert.ok(gestor.faixas.every((el) => el.hidden));
});
