/* ============================================================================
   Gaveta "Devolver as vendas às plataformas" (API-coleta.md › /api/devolucao/*).
   Google: o arquivo das vendas que vieram de clique, para subir na Central de
   dados do Google Ads. Meta: a lista das vendas para marcar no WhatsApp
   Business. Nada é mandado sozinho; o app só prepara.
   ============================================================================ */

import { h, icone, trocar } from '../../dom.js';
import { dinheiro, dataCurta, contagem, ehNumero } from '../../formato.js';
import { selo, salvarArquivo } from '../../pecas.js';
import { fraseDoErro } from '../estados.js';

let seq = 0;

export function montar(ctx, alvo) {
  let saiu = false;
  const n = ++seq;
  const saidaGoogle = h('div', { class: 'devolucao-saida', 'aria-live': 'polite' });
  const listaMeta = h('div', { class: 'devolucao-meta' }, h('p', { class: 'suave' }, 'Carregando…'));
  const baixar = h('button', { class: 'botao botao-forte', type: 'button', on: { click: baixarGoogle } }, icone('baixar'), 'Baixar o arquivo do Google');

  trocar(alvo,
    h('p', { class: 'apoio devolucao-intro' }, 'Quando o Google e a Meta sabem quais contatos viraram serviço fechado, eles passam a mostrar o anúncio para mais gente parecida com quem fecha, e não só com quem clica. Aqui o Tráfego prepara essas vendas para você entregar a eles.'),
    h('section', { class: 'devolucao-bloco', 'aria-labelledby': 'dv-g-' + n },
      h('h3', { class: 'titulo-p', id: 'dv-g-' + n }, 'Google: arquivo das vendas'),
      h('p', { class: 'apoio' }, 'Vendas fechadas dos últimos 90 dias de quem chegou por clique no anúncio do Google. Suba o arquivo em Google Ads, Ferramentas, Central de dados. Mandar de novo não duplica: cada venda vai com o número do contato.'),
      baixar, saidaGoogle),
    h('section', { class: 'devolucao-bloco', 'aria-labelledby': 'dv-m-' + n },
      h('h3', { class: 'titulo-p', id: 'dv-m-' + n }, 'Meta: vendas para marcar no WhatsApp Business'),
      listaMeta));

  async function baixarGoogle() {
    baixar.disabled = true;
    trocar(saidaGoogle, h('p', { class: 'suave' }, 'Preparando o arquivo…'));
    try {
      const { blob, nome } = await ctx.api.baixar('api/devolucao/google.csv');
      if (saiu) return;
      salvarArquivo(blob, nome || 'vendas-google.csv');
      trocar(saidaGoogle, h('p', { class: 'teste-resultado' }, selo('bom', 'Arquivo pronto'), h('span', { class: 'apoio' }, ' ' + (nome || 'vendas-google.csv') + '. Se não apareceu, veja a pasta de downloads.')));
    } catch (erro) {
      if (saiu) return;
      trocar(saidaGoogle, h('p', { class: 'aviso-caixa' }, icone('info', 'icone-p'), h('span', null, erro && erro.codigo === 'banco_sem_colunas'
        ? 'Ainda não dá: o banco não guarda os cliques do Google. Falta aplicar a atualização do banco do Tráfego; avise quem cuida do sistema.'
        : fraseDoErro(erro))));
    } finally { baixar.disabled = false; }
  }

  async function carregarMeta() {
    let d;
    try { d = await ctx.api.ler('api/devolucao/meta'); } catch (erro) { if (!saiu) trocar(listaMeta, h('p', { class: 'campo-erro' }, fraseDoErro(erro))); return; }
    if (saiu) return;
    if (!d || d.pronto === false) {
      trocar(listaMeta, h('p', { class: 'aviso-caixa' }, icone('info', 'icone-p'), h('span', null, (d && d.motivo) || 'Esta parte ainda não está pronta no banco.')));
      return;
    }
    const itens = Array.isArray(d.itens) ? d.itens : [];
    trocar(listaMeta,
      h('p', { class: 'apoio' }, d.como || 'No app WhatsApp Business, ponha a conversa de cada venda na lista "Pedido concluído" em até 7 dias do contato.'),
      itens.length
        ? [h('p', { class: 'devolucao-resumo' }, contagem(itens.length, 'venda de anúncio da Meta', 'vendas de anúncio da Meta') + ' nos últimos 30 dias; ' + (ehNumero(d.no_prazo) ? contagem(d.no_prazo, 'ainda está no prazo', 'ainda estão no prazo') : 'veja o prazo de cada uma') + '.'),
          h('ul', { class: 'devolucao-lista' }, itens.map(item))]
        : h('p', { class: 'suave' }, 'Nenhuma venda de contato que veio de anúncio da Meta nos últimos 30 dias.'));
  }

  function item(v) {
    return h('li', { class: 'devolucao-item', data: { prazo: v.no_prazo ? '1' : null } },
      h('div', { class: 'devolucao-item-cab' },
        h('p', { class: 'devolucao-nome' }, (v.nome || 'Contato') + (v.telefone_final ? ' (final ' + v.telefone_final + ')' : '')),
        v.no_prazo ? selo('bom', 'No prazo') : selo('fora', 'Fora do prazo')),
      h('p', { class: 'apoio' }, [
        ehNumero(v.valor) ? dinheiro(v.valor) : null,
        v.vendido_em ? 'vendido em ' + dataCurta(v.vendido_em) : null,
        v.anuncio_nome || v.campanha_nome ? 'anúncio ' + (v.anuncio_nome || v.campanha_nome) : null,
      ].filter(Boolean).join(', ') + '.'),
      v.fazer ? h('p', { class: 'devolucao-fazer' }, v.fazer) : null);
  }

  carregarMeta();
  return { sair() { saiu = true; } };
}
