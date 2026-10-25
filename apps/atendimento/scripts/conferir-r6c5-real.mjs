// Conferência SÓ LEITURA contra o banco real (Rodada 6, C5): carros sem conversa, fila com recusado/pré-agendamento,
// ações do 360 e as consultas que não dependem do login de ninguém. Não grava nada e não imprime telefone nem nome inteiro.
// Uso (da pasta apps/atendimento):  node --env-file=../../.env scripts/conferir-r6c5-real.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');
const { criarC5 } = require('../lib/r6c5.js');
const { criarR6 } = require('../lib/r6-dados.js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (use --env-file).'); process.exit(2); }
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const c5 = criarC5({ sb, fetch, supabaseUrl: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY || '' });
const primeiro = (n) => String(n || '').split(' ')[0] + '…';
let falhou = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhou++; console.log(`${cond ? 'OK  ' : 'FALHOU'} ${nome}${extra ? ' — ' + extra : ''}`); };

const carros = await c5.carrosSemConversa();
ok('patio_carros_abertos responde (service key)', carros.ok === true, carros.erro || '');
console.log('   no pátio:', carros.total_no_patio, '· sem conversa:', carros.carros?.length, (carros.carros || []).slice(0, 3).map((c) => `${primeiro(c.nome)} ${c.etapa}`).join(' | '));

const dados = criarR6({ sb, log: () => {} });
const fila = await dados.filaContexto({ forcar: true });
ok('filaContexto responde sem avisos de consulta', fila.ok && !(fila.avisos || []).length, (fila.avisos || []).join(' | '));
const itens = Object.values(fila.conversas || {});
console.log('   conversas na fila:', itens.length, '· com pré-agendamento:', itens.filter((x) => x.pre).length, '· com orçamento recusado:', itens.filter((x) => x.orc?.cod === 'recusado').length);

const { data: cv } = await sb.from('conversas').select('id,cliente_id').eq('tipo', 'atendimento').not('cliente_id', 'is', null).order('ultima_mensagem_em', { ascending: false }).limit(1).maybeSingle();
if (cv) {
  const p = await dados.painelCliente(cv.cliente_id);
  ok('painelCliente monta a ficha com acoes (r6_cliente_360)', p.ok && Array.isArray(p.acoes), p.erro || p.aviso || '');
  console.log('   ações sugeridas:', (p.acoes || []).map((a) => a.codigo).join(', ') || 'nenhuma', '· orçamentos:', p.orcamentos?.length);
  const pre = await c5.preAgendamentos({ clienteId: cv.cliente_id, telefone: p.cliente?.telefone });
  ok('preAgendamentos consulta a Agenda sem erro', Array.isArray(pre), `${pre.length} encontrados`);
  const semLogin = await c5.orcamentosAoVivo({ token: null, telefone: p.cliente?.telefone });
  ok('sem login de ninguém o Orçador ao vivo NÃO responde (as RPCs exigem a pessoa)', semLogin.ok === false && semLogin.motivo === 'sem_token');
} else console.log('   (nenhuma conversa com cliente cadastrado para conferir a ficha)');

const { data: motivos } = await sb.from('orc_orcamentos').select('id,motivo_cod,motivo_recusa').eq('status', 'recusado').limit(3);
ok('motivo da recusa lido do orçamento', Array.isArray(motivos), `${(motivos || []).length} recusados no banco`);
console.log(falhou ? `\n${falhou} FALHOU` : '\nTudo certo (só leitura).');
process.exit(falhou ? 1 : 0);
