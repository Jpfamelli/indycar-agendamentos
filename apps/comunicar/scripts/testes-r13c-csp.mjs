// R13C — CSP do Comunicar no padrão da Casa: sem script embutido, CDN só no caminho do supabase-js, banco só o projeto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cspDoComunicar, LIB_SUPABASE, cabecalhosSeguros } from '../acesso.js';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const parte = (csp, nome) => csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(nome + ' '));

test('script-src sem unsafe-inline e com o CDN só no caminho do supabase-js', () => {
  const csp = cspDoComunicar({ SUPABASE_URL: 'https://nppfqhavqahapmugnyng.supabase.co' });
  assert.equal(parte(csp, 'script-src'), `script-src 'self' ${LIB_SUPABASE}`);
  assert.equal(parte(csp, 'connect-src'), "connect-src 'self' https://nppfqhavqahapmugnyng.supabase.co wss://nppfqhavqahapmugnyng.supabase.co");
  assert.doesNotMatch(csp, /fonts\.g|\*\.supabase\.co/);
  assert.match(cabecalhosSeguros()['Content-Security-Policy'], /script-src 'self' https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\.45\.4\/;/);
});

test('o index.html não tem script embutido nem onclick, e o supabase-js dele está no caminho liberado', () => {
  assert.doesNotMatch(html, /<script(\s[^>]*)?>(?!<\/script>)\s*[^<\s]/, 'nenhum <script> com código dentro');
  assert.doesNotMatch(html, /\son[a-z]+="/);
  const cdn = [...html.matchAll(/src="(https:\/\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(cdn.length >= 1);
  for (const u of cdn) assert.ok(u.startsWith(LIB_SUPABASE), u);
  assert.match(html, /<script src="tema-inicial\.js\?v=7.6.0"><\/script>/);
});

test('o service worker não busca nada de fora (o connect-src não libera o CDN) e guarda o tema-inicial.js', () => {
  assert.match(sw, /if \(url\.origin !== self\.location\.origin\) return;/);
  assert.match(sw, /'tema-inicial\.js'/);
});
