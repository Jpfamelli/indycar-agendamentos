// Varredura de segredos — `npm run segredos`.
// Olha TODOS os arquivos versionados (git ls-files) e o histórico recente atrás
// de chaves que nunca podem estar no repositório: JWT do Supabase (service_role),
// chave da Anthropic, do Render, do GitHub, do Stripe, chave privada, senha em URL.
// Sai com código 1 se achar algo (o GitHub Actions barra o push).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const PADROES = [
  ['JWT (Supabase anon/service_role)', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/],
  ['Chave nova do Supabase (sb_secret)', /sb_secret_[A-Za-z0-9_-]{16,}/],
  ['Chave da Anthropic', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['Chave do Render', /rnd_[A-Za-z0-9]{20,}/],
  ['Token do GitHub', /\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/],
  ['Chave do Stripe', /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}/],
  ['Chave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Senha em URL de banco', /postgres(ql)?:\/\/[^:\s]+:[^@\s]{6,}@/],
  ['Atribuição de segredo', /\b(SUPABASE_SERVICE_ROLE_KEY|ANTHROPIC_API_KEY|RUNNER_TOKEN|RENDER_API_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{16,}/],
];
// Este arquivo descreve os padrões; os testes usam valores de mentira curtos.
const IGNORAR = new Set(['scripts/segredos.mjs', 'package-lock.json']);
// Falsos positivos conhecidos: o valor EXATO de mentira que o banco falso dos testes usa
// (scripts/banco-falso.mjs). Só esse texto é perdoado; qualquer outro valor continua barrado.
const FALSOS_CONHECIDOS = new Set([
  "SUPABASE_SERVICE_ROLE_KEY = 'chave-falsa-de-teste",
]);
export const ehFalsoConhecido = (trecho) => FALSOS_CONHECIDOS.has(String(trecho));
export const casa = (re, linha) => {
  const g = new RegExp(re.source, 'g');
  return (linha.match(g) || []).some((m) => !ehFalsoConhecido(m));
};

function varrer() {
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const achados = [];

  for (const arq of git(['ls-files']).split('\n').filter(Boolean)) {
    if (IGNORAR.has(arq) || /\.(png|jpe?g|ico|woff2?|gif|webp)$/i.test(arq)) continue;
    let texto;
    try { texto = readFileSync(arq, 'utf8'); } catch { continue; }
    texto.split('\n').forEach((linha, i) => {
      for (const [nome, re] of PADROES) if (casa(re, linha)) achados.push(`${arq}:${i + 1} — ${nome}`);
    });
  }

  // histórico: os últimos 200 commits (uma chave apagada continua no git)
  const historico = git(['log', '-p', '-n', '200', '--no-color', '--', '.', ':(exclude)scripts/segredos.mjs']);
  for (const [nome, re] of PADROES) {
    const g = new RegExp(re.source, 'g');
    const n = (historico.match(g) || []).filter((l) => !l.startsWith('-') && !ehFalsoConhecido(l)).length;
    if (n) achados.push(`histórico do git — ${nome} (${n}x)`);
  }

  if (achados.length) {
    console.error(`✖ ${achados.length} possível(is) segredo(s) no repositório (o valor não é mostrado):`);
    for (const a of achados) console.error('  ' + a);
    process.exit(1);
  }
  console.log(`✔ Nenhum segredo nos ${git(['ls-files']).split('\n').filter(Boolean).length} arquivos versionados nem nos últimos 200 commits.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) varrer();
