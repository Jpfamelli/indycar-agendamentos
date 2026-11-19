const fs = require('fs');
const rep = (f, a, b) => { const s = fs.readFileSync(f, 'utf8'); if (!s.includes(a)) throw new Error(f + ': ' + a.slice(0, 60)); fs.writeFileSync(f, s.split(a).join(b)); };

/* ciclo.js: dias até a oficina (mediana) e ticket do orçamento aprovado */
rep('ciclo.js', `const ZERO = () => ({ orcados: 0,`, `const ZERO = () => ({ dias_ate_oficina: [], orcados: 0,`);
rep('ciclo.js', `const SOMAVEIS = Object.keys(ZERO());`, `const SOMAVEIS = Object.keys(ZERO()).filter(k => k !== 'dias_ate_oficina');

/** Mediana de uma lista de números (null se vazia). */
function mediana(v) {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b), m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}`);
rep('ciclo.js', `    if (validas.length) {
      g.na_oficina++;`, `    if (validas.length) {
      g.na_oficina++;
      const primeira = Math.min(...validas.map(o => Date.parse(o.created_at)).filter(Number.isFinite));
      const criado = Date.parse(l.created_at);
      if (Number.isFinite(primeira) && Number.isFinite(criado) && primeira >= criado) g.dias_ate_oficina.push((primeira - criado) / 86400000);`);
rep('ciclo.js', `  const t = ZERO();
  for (const g of lista) for (const k of SOMAVEIS) t[k] += g[k] || 0;
  return t;`, `  const t = ZERO();
  for (const g of lista) { for (const k of SOMAVEIS) t[k] += g[k] || 0; t.dias_ate_oficina.push(...(g.dias_ate_oficina || [])); }
  return t;`);
rep('ciclo.js', `    receita_prevista: g.valor_aprovado + g.extras_aprovados,`, `    receita_prevista: g.valor_aprovado + g.extras_aprovados,
    ticket_orcamento: dividir(g.valor_aprovado, g.orcamentos_aprovados),
    dias_ate_oficina: mediana(g.dias_ate_oficina),`);
rep('ciclo.js', `['conv_orcamento', 'Aprovação (%)'],`, `['conv_orcamento', 'Aprovação (%)'], ['ticket_orcamento', 'Ticket do orçamento aprovado'], ['dias_ate_oficina', 'Dias do lead até a oficina (mediana)'],`);

/* ciclo.js (browser) */
rep('public/ciclo.js', `    cartaoCiclo('Aprovados', int(t.orcamentos_aprovados), t.conv_orcamento == null ? 'ninguém decidiu ainda' : \`\${dec(t.conv_orcamento, 0)}% dos enviados · \${brl(t.valor_aprovado)}\`),`, `    cartaoCiclo('Aprovados', int(t.orcamentos_aprovados), t.conv_orcamento == null ? 'ninguém decidiu ainda' : \`\${dec(t.conv_orcamento, 0)}% dos enviados · ticket \${brl(t.ticket_orcamento)}\`),`);
rep('public/ciclo.js', `\${t.no_patio_agora ? \`<span class="sobe">\${int(t.no_patio_agora)} no pátio agora</span>\` : 'nenhum agora'}\`, 'Carros com OS no Pátio'),`, `\${t.no_patio_agora ? \`<span class="sobe">\${int(t.no_patio_agora)} no pátio agora</span>\` : 'nenhum agora'}\${t.dias_ate_oficina != null ? \` · mediana \${dec(t.dias_ate_oficina, 1)} d do lead até a OS\` : ''}\`, 'Carros com OS no Pátio'),`);

/* leads.js: ordem "parados" e idade no CSV */
rep('leads.js', `const ORDENS = ['recentes', 'antigos', 'valor', 'nome'];`, `const ORDENS = ['recentes', 'antigos', 'valor', 'nome', 'parados'];`);
rep('leads.js', `  if (criterio === 'antigos')`, `  // Mais parados primeiro: lead "Novo" há mais tempo, depois os demais por data.
  if (criterio === 'parados') return l.sort((a, b) => (b.status === 'novo') - (a.status === 'novo') || (a.status === 'novo' ? String(a.criado_em).localeCompare(String(b.criado_em)) : String(b.criado_em).localeCompare(String(a.criado_em))));
  if (criterio === 'antigos')`);
rep('leads.js', `['status_nome', 'Status'], ['servico', 'Serviço']`, `['status_nome', 'Status'], ['idade_horas', 'Idade (h)'], ['servico', 'Serviço']`);

/* tela: ordem, KPI parados, ajuda e novidades */
rep('public/index.html', `<option value="nome">Nome A–Z</option>`, `<option value="nome">Nome A–Z</option>
            <option value="parados">Mais parados (novos há mais tempo)</option>`);
rep('public/index.html', `        <li><strong>…para distribuir os leads sem responsável?</strong>`, `        <li><strong>…para saber o que o anúncio virou na oficina?</strong> Resultados CRM → “Do anúncio ao carro entregue” (orçamento no Orçador, carro no Pátio, custo por carro). No Painel, “Oficina agora” mostra os carros e orçamentos de hoje; cada nome abre a OS ou o orçamento na aba do Pátio/Orçador.</li>
        <li><strong>…para distribuir os leads sem responsável?</strong>`);
rep('public/operacao.js', `    kpi('No pátio agora',`, `    kpi('Parados +24 h', int(t.parados || 0), t.parados ? '<span class="desce">sem primeiro toque</span>' : 'ninguém esperando', { status: 'novo', ordem: 'parados' }),
    kpi('No pátio agora',`);
rep('public/operacao.js', `    if ('etapa' in f) $('#leads-etapa').value = f.etapa;`, `    if ('etapa' in f) $('#leads-etapa').value = f.etapa;
    if ('ordem' in f) $('#leads-ordem').value = f.ordem;`);
rep('public/operacao.js', `    if (!localStorage.getItem('ads-novidades-r5')) {`, `    if (!localStorage.getItem('ads-novidades-r6')) {
      setTimeout(() => { aviso('Novo: Resultados CRM mostra o anúncio até o carro entregue, e o Painel tem “Oficina agora”. Links abrem na aba do Pátio, Orçador e CRM.'); }, 2500);
      localStorage.setItem('ads-novidades-r6', '1');
    } else if (!localStorage.getItem('ads-novidades-r5')) {`);
