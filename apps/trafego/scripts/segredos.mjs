// ============================================================================
// npm run segredos — varre os arquivos VERSIONADOS (git ls-files) atrás de
// chave colada por engano: Supabase, Anthropic, Meta, Google, GitHub, JWT,
// chave privada. Também confere que nenhum .env entrou no git.
// Sai com código 1 se achar algo (mostra arquivo:linha e o tipo, nunca o valor).
// ============================================================================
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const PADROES = [
  ['chave secreta do Supabase', /sb_secret_[A-Za-z0-9_-]{10,}/],
  ['JWT (service_role / anon com assinatura)', /eyJ[A-Za-z0-9_-]{10,}[.]eyJ[A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{10,}/],
  ['chave da Anthropic', /sk-ant-[A-Za-z0-9_-]{10,}/],
  ['token da Meta', /EAA[A-Za-z0-9]{40,}/],
  ['chave do Google', /AIza[0-9A-Za-z_-]{30,}/],
  ['refresh token do Google', /1[/][/]0[A-Za-z0-9_-]{30,}/],
  ['client secret do Google', /GOCSPX-[A-Za-z0-9_-]{10,}/],
  ['token do GitHub', /gh[pousr]_[A-Za-z0-9]{30,}/],
  ['chave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

const arquivos = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split(/[\r\n]+/).filter(Boolean);
const achados = [];
for (const a of arquivos) {
  if (/(^|[/])[.]env($|[.])/.test(a) && !a.endsWith('.env.exemplo')) achados.push(`${a}: arquivo .env versionado`);
  if (/[.](png|jpe?g|webp|ico|gif|woff2?|zip)$/i.test(a)) continue;
  let texto;
  try { texto = fs.readFileSync(a, 'utf8'); } catch { continue; }
  texto.split(/[\r\n]/).forEach((linha, i) => {
    for (const [nome, re] of PADROES) if (re.test(linha)) achados.push(`${a}:${i + 1}: ${nome}`);
  });
}
if (achados.length) {
  console.error(`✖ ${achados.length} possível(is) segredo(s) em arquivo versionado:`);
  for (const x of achados) console.error('  ' + x);
  process.exit(1);
}
console.log(`✔ nenhum segredo em ${arquivos.length} arquivos versionados`);
