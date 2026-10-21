// Chama as RPCs reais da Casa como usuários de teste (só leitura) e confere permissões.
import { criarContexto } from './qa-r6-lib.mjs';
let ok = 0, falha = 0;
const conf = (c, t) => { c ? ok++ : falha++; console.log((c ? '✔ ' : '✖ ') + t); };
for (const papel of ['gestor', 'atendente', 'mecanico']) {
  const ctx = criarContexto(papel, papel === 'mecanico' ? ['patio'] : undefined);
  try {
    await ctx.criar();
    const t = await ctx.token(); const U = ctx.env.SUPABASE_URL;
    const rpc = async (n, b = {}) => { const r = await fetch(`${U}/rest/v1/rpc/${n}`, { method: 'POST', headers: { apikey: ctx.env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json().catch(() => null) }; };
    const a = await rpc('r6_agora', { p_limite: 40 }); conf(a.s === 200 && a.j.patio, `${papel}: r6_agora responde`);
    const e = await rpc('r6_c1_agora_extras'); conf(e.s === 200 && e.j.agenda, `${papel}: r6_c1_agora_extras responde`);
    const b = await rpc('r6_busca_global', { p_termo: 'a1', p_limite: 3 }); conf(b.s === 200 && b.j.grupos, `${papel}: r6_busca_global responde`);
    const d = await rpc('r6_c1_painel_dono');
    conf(papel === 'gestor' ? d.s === 200 && d.j.faturamento : d.s >= 400, `${papel}: painel do dono ${papel === 'gestor' ? 'abre' : 'é negado (' + d.s + ')'}`);
    if (papel === 'mecanico') conf(!(b.j.grupos.conversas || []).length && !(b.j.grupos.leads || []).length && !(a.j.conversas_sem_resposta?.total), 'mecânico: busca/agora não trazem conversas nem leads');
  } catch (er) { conf(false, papel + ': ' + er.message); } finally { await ctx.apagar(); }
}
console.log(`${ok} ok, ${falha} falha(s)`); if (falha) process.exitCode = 1;
