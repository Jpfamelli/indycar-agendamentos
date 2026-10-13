#!/usr/bin/env node
// Varredura de segredos nos arquivos VERSIONADOS (git ls-files) — `npm run segredos`.
// Sai com código 1 se achar chave de verdade. Nunca imprime o segredo inteiro:
// mostra arquivo, linha, o tipo e só o começo do achado.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PADROES = [
  ['chave service_role / JWT', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['chave da Anthropic', /sk-ant-[A-Za-z0-9_-]{20,}/g],
  ['chave do CodeWords', /cwk-[A-Za-z0-9_-]{16,}/g],
  ['chave secreta do Supabase', /sb_secret_[A-Za-z0-9_-]{16,}/g],
  ['chave do Render', /rnd_[A-Za-z0-9]{20,}/g],
  ['token do GitHub', /gh[pousr]_[A-Za-z0-9]{30,}/g],
  ['token da Meta', /EAA[A-Za-z0-9]{40,}/g],
  ['chave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['senha no código', /(senha|password)\s*[:=]\s*['"][^'"\s]{8,}['"]/gi],
];
// JWT com role "anon" é a chave PÚBLICA do Supabase (vai para o navegador por definição).
function jwtPublico(t) {
  try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8')).role === 'anon'; } catch { return false; }
}
// Testes e mock usam senhas inventadas de propósito.
const IGNORAR_SENHA = /^(tests\/|scripts\/mock-server\.mjs$)/;

const arquivos = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)
  .filter((a) => !/\.(png|jpg|jpeg|ico|sqlite|woff2?)$/i.test(a));
const achados = [];
if (arquivos.some((a) => /(^|\/)\.env$/.test(a))) achados.push({ arquivo: '.env', linha: 0, tipo: '.env versionado', trecho: '' });
for (const arq of arquivos) {
  let txt; try { txt = readFileSync(arq, 'utf8'); } catch { continue; }
  const linhas = txt.split('\n');
  linhas.forEach((l, i) => {
    for (const [tipo, re] of PADROES) {
      re.lastIndex = 0;
      for (const m of l.matchAll(re)) {
        if (tipo.startsWith('chave service_role') && jwtPublico(m[0])) continue;
        if (tipo === 'senha no código' && IGNORAR_SENHA.test(arq)) continue;
        achados.push({ arquivo: arq, linha: i + 1, tipo, trecho: m[0].slice(0, 8) + '…' });
      }
    }
  });
}
if (!achados.length) { console.log(`Nenhum segredo nos ${arquivos.length} arquivos versionados. ✔`); process.exit(0); }
for (const a of achados) console.log(`✖ ${a.arquivo}:${a.linha}  ${a.tipo}  ${a.trecho}`);
console.log(`\n${achados.length} achado(s). Tire do arquivo, troque a chave e use o .env (fora do git).`);
process.exit(1);
