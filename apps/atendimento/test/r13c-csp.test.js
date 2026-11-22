'use strict';
/* R13C — CSP do Atendimento no padrão da Casa: o CDN só no caminho do supabase-js de reserva. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SEG = require('../lib/seguranca');

test('o supabase-js de reserva do index.html está dentro do caminho que a CSP libera', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const urls = [...html.matchAll(/https:\/\/cdn\.jsdelivr\.net\/[^"'\\<>\s]+/g)].map((m) => m[0]);
  assert.ok(urls.length >= 1);
  for (const u of urls) assert.ok(u.startsWith(SEG.LIB_RESERVA), u);
});

test('script-src sem CDN inteiro, sem unsafe-inline; connect-src só o projeto', () => {
  const csp = SEG.politicaCSP({ supabaseUrl: 'https://nppfqhavqahapmugnyng.supabase.co', hashes: ["'sha256-abc'"] });
  const script = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('script-src'));
  assert.equal(script, `script-src 'self' ${SEG.LIB_RESERVA} 'sha256-abc'`);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
  assert.match(csp, /connect-src 'self' https:\/\/nppfqhavqahapmugnyng\.supabase\.co wss:\/\/nppfqhavqahapmugnyng\.supabase\.co/);
  assert.doesNotMatch(csp, /\*\.supabase\.co/);
});
