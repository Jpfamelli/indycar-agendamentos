// QA das RPCs da rodada 6 / C1b contra o banco real (só leitura): gestor lê, atendente leva 42501, anon não executa.
import { criarContexto } from './qa-r6-lib.mjs';
let ok = 0, falha = 0;
const conf = (c, t) => { c ? ok++ : falha++; console.log((c ? '✔ ' : '✖ ') + t); };
const chamar = async (env, token, nome, corpo = {}) => {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${nome}`, { method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + (token || env.SUPABASE_ANON_KEY), 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
for (const papel of ['gestor', 'atendente']) {
  const ctx = criarContexto(papel);
  try {
    await ctx.criar();
    const t = await ctx.token();
    const r = await chamar(ctx.env, t, 'r6_c1b_painel_consultores');
    if (papel === 'gestor') {
      console.log(r.status, JSON.stringify(r.json).slice(0,200)); conf(r.status === 200 && Array.isArray(r.json?.consultores) && Array.isArray(r.json?.origens), 'gestor lê o desempenho por consultor/origem');
      conf((r.json.consultores[0] ? Object.keys(r.json.consultores[0]).sort().join() : 'faltaram,fecharam,marcados,nome,valor,vieram') === 'faltaram,fecharam,marcados,nome,valor,vieram', 'cada linha tem nome, marcados, vieram, fecharam, faltaram e valor');
    } else conf(r.status >= 400 && /42501|so_gestor/.test(JSON.stringify(r.json)), 'atendente leva 42501 (só gestor): ' + r.status);
  } finally { console.log('  usuário de teste apagado:', await ctx.apagar()); }
}
const anon = await chamar(criarContexto('gestor').env, null, 'r6_c1b_painel_consultores');
conf(anon.status >= 400, 'anônimo não executa a função: ' + anon.status);
console.log(`${ok} ok, ${falha} falharam`);
process.exit(falha ? 1 : 0);
