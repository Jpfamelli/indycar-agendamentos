// Rodada 8 (rodada 3 da segurança, adiantada): o Render fica atrás da Cloudflare, e o primeiro item do
// X-Forwarded-For é o que o próprio cliente manda (dá para forjar e fugir do limitador). O IP passa a vir do
// cf-connecting-ip, que a Cloudflare sobrescreve. Sem ele (máquina local), fica como era.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const ATD = require('../apps/atendimento/lib/seguranca.js');
const CRM = require('../apps/crm/lib/seguranca.js');
const COM = await import('../apps/comunicar/acesso.js');

const forjado = (extra = {}) => ({ headers: { 'x-forwarded-for': '1.2.3.4, 104.16.0.1', ...extra }, socket: { remoteAddress: '10.0.0.9' } });

test('IP pela Cloudflare: o cf-connecting-ip vence o X-Forwarded-For forjado (Atendimento, CRM, Comunicar)', () => {
  const req = forjado({ 'cf-connecting-ip': '187.10.20.30' });
  assert.equal(ATD.ipDoCliente(req, { confiarProxy: true }), '187.10.20.30');
  assert.equal(CRM.ipDe(req, { atrasDeProxy: true }), '187.10.20.30');
  assert.equal(COM.ipDe(req), '187.10.20.30');
});

test('IP pela Cloudflare: cabeçalho inválido é ignorado e o comportamento antigo continua', () => {
  const req = forjado({ 'cf-connecting-ip': '<script>' });
  assert.equal(ATD.ipDoCliente(req, { confiarProxy: true }), '1.2.3.4');
  assert.equal(CRM.ipDe(req, { atrasDeProxy: true }), '1.2.3.4');
  assert.equal(COM.ipDe(req), '1.2.3.4');
  // fora da nuvem o Atendimento e o CRM não confiam em cabeçalho nenhum
  assert.equal(ATD.ipDoCliente(forjado({ 'cf-connecting-ip': '187.10.20.30' })), '10.0.0.9');
  assert.equal(CRM.ipDe(forjado({ 'cf-connecting-ip': '187.10.20.30' })), '10.0.0.9');
});

test('IP pela Cloudflare: Agenda (server.js) e Central (saúde dos apps) leem o cf-connecting-ip primeiro', () => {
  const agenda = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const central = fs.readFileSync(new URL('../central.js', import.meta.url), 'utf8');
  const corpo = agenda.slice(agenda.indexOf('function ipDaRequisicao'), agenda.indexOf('function ipDentroDoLimite'));
  assert.ok(corpo.indexOf("cf-connecting-ip") > 0 && corpo.indexOf("cf-connecting-ip") < corpo.indexOf('x-forwarded-for'));
  const saude = central.slice(central.indexOf("'/api/central/saude-apps'"), central.indexOf('dentroDoFreioDaSaude(ip)'));
  assert.ok(saude.indexOf("cf-connecting-ip") > 0 && saude.indexOf("cf-connecting-ip") < saude.indexOf('x-forwarded-for'));
});
