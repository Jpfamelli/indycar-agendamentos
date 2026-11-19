/* ============================================================
   Ciclo — do anúncio ao carro entregue (rodada 6, 21/10/2026).
   Desenha, no Resultados CRM, o que o Orçador e o Pátio mostram dos
   leads de anúncio: orçamento feito/aprovado, carro na oficina,
   entregue, extras e o custo de anúncio por carro.
   Usa as utilidades de app.js ($, $$, esc, brl, int, dec, pct).
   ============================================================ */
'use strict';

function cartaoCiclo(rotulo, valor, sub = '', dica = '') {
  return `<div class="kpi" title="${esc(dica)}"><div class="rotulo">${esc(rotulo)}</div><div class="numero">${valor}</div><div class="var neutro">${sub}</div></div>`;
}

/** Linha da tabela por campanha (canal/campanha/sem UTM) do ciclo. */
function linhaCiclo(g, total = false) {
  const ver = !total && (g.orcados || g.na_oficina)
    ? ` <button type="button" class="link mini" data-leads-res='${esc(JSON.stringify({ q: g.sem_utm ? '' : g.campanha, canal: g.canal, etapa: g.na_oficina ? 'oficina' : '' }))}' title="Ver os leads desta campanha que chegaram à oficina">ver</button>` : '';
  const nome = total ? '<strong>Total</strong>' : `${esc(nomeCanal(g.canal))} · ${esc(g.campanha)}${ver}`;
  return `<tr class="${total ? 'linha-total' : ''}"><th scope="row">${nome}</th>
    <td class="num">${brl(g.gasto)}</td>
    <td class="num">${int(g.orcados)}</td>
    <td class="num">${int(g.orcamentos_aprovados)}${g.orcamentos_enviados ? `<span class="mini"> de ${int(g.orcamentos_enviados)}</span>` : ''}</td>
    <td class="num">${int(g.na_oficina)}${g.no_patio_agora ? `<span class="mini"> · ${int(g.no_patio_agora)} agora</span>` : ''}</td>
    <td class="num">${int(g.entregues)}</td>
    <td class="num">${g.receita_entregues > 0 ? brl(g.receita_entregues) : '—'}${g.entregues_sem_valor ? `<span class="mini sem-valor"> ${int(g.entregues_sem_valor)} sem valor</span>` : ''}</td>
    <td class="num"><strong>${brl(g.custo_carro_na_oficina)}</strong></td>
    <td class="num">${brl(g.custo_carro_entregue)}</td></tr>`;
}

/* Cada aviso do ciclo leva a aba Leads já filtrada na etapa certa. */
const ETAPA_DO_AVISO = { orcamento_parado: 'orc_esperando', pronto_parado: 'patio', aprovado_sem_os: 'orc_aprovado', valor_sugerido: 'entregue', orc_nao_aberto: 'orc_esperando', orc_quente: 'orc_esperando', follow_vencido: 'orc_esperando', validade_vencendo: 'orc_esperando', horario_pedido: 'orc_aprovado', sem_orcamento: 'sem_orcamento' };
/* Atual × período anterior (variação só quando o anterior tem número). */
function comparacaoCiclo(c) {
  if (!c) return '';
  const linhas = [['orcados', 'Orçamentos', int, false], ['orcamentos_aprovados', 'Aprovados', int, false], ['na_oficina', 'Carros na oficina', int, false], ['entregues', 'Entregues', int, false],
    ['receita_entregues', 'Receita paga', brl, false], ['custo_carro_na_oficina', 'Custo por carro', brl, true]];
  return `<details class="guia"><summary>Contra o período anterior</summary><div class="rolar" tabindex="0" role="region" aria-label="Ciclo contra o período anterior"><table><thead><tr><th scope="col">Métrica</th><th scope="col" class="num">Agora</th><th scope="col" class="num">Antes</th><th scope="col" class="num">Variação</th></tr></thead><tbody>${linhas.map(([k, nome, fmt, menor]) => {
    const x = c[k] || {}, v = x.variacao;
    const cls = v == null || Math.abs(v) < 0.5 ? 'neutro' : (menor ? v < 0 : v > 0) ? 'sobe' : 'desce';
    return `<tr><th scope="row">${nome}</th><td class="num">${fmt(x.atual)}</td><td class="num">${fmt(x.anterior)}</td><td class="num ${cls}">${v == null ? '—' : `${v > 0 ? '+' : ''}${dec(v, 0)}%`}</td></tr>`;
  }).join('')}</tbody></table></div></details>`;
}

const ICONE_CICLO = { orcamento_parado: 'sev-alerta', aprovado_sem_os: 'sev-alerta', pronto_parado: 'sev-alerta', valor_sugerido: 'sev-info', orc_quente: 'sev-alerta', desconto_pedido: 'sev-alerta', horario_pedido: 'sev-alerta', follow_vencido: 'sev-alerta', validade_vencendo: 'sev-alerta', lead_parado: 'sev-alerta', orc_nao_aberto: 'sev-info', sem_orcamento: 'sev-info' };

/* Rodada 7: até 3 nomes do aviso, cada um abre o lead no CRM (aba do CRM). */
function nomesDoAviso(a) {
  const itens = (a.itens || []).slice(0, 3).filter(i => i.links && i.links.crm);
  if (!itens.length) return '';
  return `<p class="mini">${itens.map(i => `<button type="button" class="link mini" data-abrir-app="${esc(i.links.crm)}" title="Abrir o lead no CRM">${esc(String(i.nome || '').split(' ')[0] || 'lead')}</button>${i.valor > 0 ? ' ' + brl(i.valor) : ''}`).join(' · ')}${a.quantidade > itens.length ? ` e mais ${int(a.quantidade - itens.length)}` : ''}</p>`;
}

/* Rodada 7: como o cliente se comporta depois do orçamento (abriu? quanto demora para decidir?). */
function comportamentoCiclo(t) {
  if (!t.orcamentos_enviados) return '';
  const p = [];
  if (t.taxa_visualizacao != null) p.push(`${dec(t.taxa_visualizacao, 0)}% abriram o orçamento`);
  if (t.horas_decisao != null) p.push(`decidem em ${t.horas_decisao >= 48 ? dec(t.horas_decisao / 24, 1) + ' dias' : dec(t.horas_decisao, 0) + ' h'} (mediana)`);
  if (t.horas_ate_envio != null) p.push(`${t.horas_ate_envio >= 48 ? dec(t.horas_ate_envio / 24, 1) + ' dias' : dec(t.horas_ate_envio, 0) + ' h'} do lead até o orçamento enviado`);
  if (t.valor_em_aberto > 0) p.push(`${brl(t.valor_em_aberto)} esperando resposta`);
  if (t.valor_recusado > 0) p.push(`${brl(t.valor_recusado)} recusados`);
  if (t.roas_previsto != null) p.push(`ROAS previsto ${dec(t.roas_previsto)}× (aprovado + extras)`);
  return p.length ? `<p class="mini"><strong>Depois do orçamento:</strong> ${p.join(' · ')}.</p>` : '';
}

/* Meta contra Google: uma linha curta por canal. */
function canaisCiclo(c) {
  const l = (c.canais || []).filter(x => x.orcados || x.na_oficina);
  if (l.length < 2) return '';
  return `<p class="mini">${l.map(x => `<strong>${esc(nomeCanal(x.canal))}</strong>: ${int(x.na_oficina)} carro(s) na oficina, ${int(x.entregues)} entregue(s), ${x.custo_carro_na_oficina != null ? brl(x.custo_carro_na_oficina) + ' por carro' : 'sem custo por carro'}`).join(' · ')}</p>`;
}

function desenharCiclo(c) {
  const alvo = $('#crm-ciclo');
  if (!alvo) return;
  if (!c) { alvo.innerHTML = '<p class="mini">Esta leitura não veio agora. Atualize o resultado.</p>'; $('#ciclo-exportar').disabled = true; return; }
  if (c.indisponivel) { alvo.innerHTML = `<p class="recado" role="status">${esc(c.motivo)}</p>`; $('#ciclo-exportar').disabled = true; return; }
  const t = c.total;
  if (!t.orcados && !t.na_oficina) {
    alvo.innerHTML = `<p class="vazio">Nenhum lead de anúncio virou orçamento ou carro na oficina neste período.<span class="mini">O orçamento entra aqui quando é feito para um lead do CRM (botão “Orçar” na aba Leads) e o carro quando a OS nasce do agendamento ou do orçamento.</span></p>`;
    $('#ciclo-exportar').disabled = true; return;
  }
  $('#ciclo-exportar').disabled = false;
  const kpis = [
    cartaoCiclo('Orçamentos', int(t.orcados), `${brl(t.valor_orcado)} orçados`, 'Leads de anúncio com orçamento no Orçador'),
    cartaoCiclo('Aprovados', int(t.orcamentos_aprovados), t.conv_orcamento == null ? 'ninguém decidiu ainda' : `${dec(t.conv_orcamento, 0)}% dos enviados · ticket ${brl(t.ticket_orcamento)}`),
    cartaoCiclo('Na oficina', int(t.na_oficina), (t.no_patio_agora ? `<span class="sobe">${int(t.no_patio_agora)} no pátio agora</span>` : 'nenhum agora') + (t.dias_ate_oficina != null ? ` · mediana ${dec(t.dias_ate_oficina, 1)} d do lead até a OS` : ''), 'Carros com OS no Pátio'),
    cartaoCiclo('Entregues', int(t.entregues), t.extras_aprovados ? `+ ${brl(t.extras_aprovados)} em extras` : '—'),
    cartaoCiclo('Custo por carro', brl(t.custo_carro_na_oficina), t.custo_carro_entregue != null ? `${brl(t.custo_carro_entregue)} por entregue` : 'anúncio ÷ carros na oficina', 'Investimento em anúncio dividido pelos carros que entraram na oficina'),
    cartaoCiclo('Receita paga', t.receita_entregues > 0 ? brl(t.receita_entregues) : '—', t.entregues_sem_valor ? `<span class="sem-valor">${int(t.entregues_sem_valor)} entregue(s) sem valor</span>` : (t.roas_oficina != null ? `ROAS ${dec(t.roas_oficina)}×` : '—')),
  ].join('');
  const topo = c.funil[0].valor || 1;
  const funil = `<ol class="funil" aria-label="Do orçamento ao carro entregue">${c.funil.map((e, i) => `
    <li class="funil-etapa"><div class="funil-rotulo"><span>${esc(e.rotulo)}</span><strong>${int(e.valor)}</strong></div>
      <div class="funil-barra" aria-hidden="true"><span style="width:${Math.max(2, Math.min(100, e.valor * 100 / topo)).toFixed(1)}%"></span></div>
      <p class="mini">${i === 0 ? 'ponto de partida' : e.taxa == null ? '—' : `${dec(e.taxa, 0)}% da etapa anterior`}</p></li>`).join('')}</ol>`;
  const motivos = c.motivos.length
    ? `<p class="mini"><strong>Por que recusaram:</strong> ${c.motivos.map(m => `${esc(m.motivo)} (${int(m.qtd)})`).join(' · ')}</p>` : '';
  const avisos = c.alertas.map(a => `<div class="alerta"><span class="bolha ${ICONE_CICLO[a.tipo] || 'sev-info'}" aria-hidden="true"></span>
      <div class="alerta-txt"><p class="mini">${esc(a.texto)}</p>${nomesDoAviso(a)}${ETAPA_DO_AVISO[a.tipo] ? `<button type="button" class="link mini" data-leads-etapa="${ETAPA_DO_AVISO[a.tipo]}">ver os leads</button>` : ''}</div></div>`).join('');
  alvo.innerHTML = `<div class="cartoes">${kpis}</div>
    ${c.parcial ? '<p class="recado" role="status">O Pátio não respondeu agora: os orçamentos estão certos, mas os carros na oficina ficaram de fora desta leitura.</p>' : ''}
    ${canaisCiclo(c)}
    ${comportamentoCiclo(t)}
    ${c.demo ? '<p class="recado" role="status">O investimento deste período é de demonstração; os orçamentos e carros são do sistema de verdade, então o custo por carro não vale ainda.</p>' : ''}
    <div class="grade-2"><div>${funil}${motivos}${comparacaoCiclo(c.comparacao)}</div><div>${avisos || '<p class="mini">Nenhum aviso do ciclo neste período.</p>'}</div></div>
    <div class="rolar" tabindex="0" role="region" aria-label="Ciclo por campanha (role para o lado para ver tudo)"><table>
      <thead><tr><th scope="col">Campanha</th><th scope="col" class="num">Investido</th><th scope="col" class="num">Orçamentos</th><th scope="col" class="num">Aprovados</th>
      <th scope="col" class="num">Na oficina</th><th scope="col" class="num">Entregues</th><th scope="col" class="num">Receita paga</th>
      <th scope="col" class="num">Custo por carro</th><th scope="col" class="num">Por entregue</th></tr></thead>
      <tbody>${c.campanhas.map(g => linhaCiclo(g)).join('')}${c.campanhas.length > 1 ? linhaCiclo(t, true) : ''}</tbody></table></div>`;
}
