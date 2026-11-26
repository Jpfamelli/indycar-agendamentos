/* ============================================================================
   Conexões (Ajustes, rodada 11): Meta, Google, rastreio do site e WhatsApp,
   cada um com o estado em uma palavra. Meta e Google têm "Trocar o acesso"
   (testar antes de salvar) e há o botão "Buscar os números agora".
   GET api/conexoes, api/coleta/situacao, api/integracoes, api/origem/rastreio;
   POST api/coleta/testar, api/integracoes, api/coleta/agora.
   O que foi salvo nunca volta para a tela.
   ============================================================================ */

import { h, icone, trocar } from '../../dom.js';
import { dataCurta, haQuanto, contagem, ehNumero } from '../../formato.js';
import { selo, erroNoCampo } from '../../pecas.js';
import { fraseDoErro } from '../estados.js';

const SITUACAO_DA_CONTA = {
  ok: ['bom', 'Ligada'], nunca_ligou: ['neutro', 'Não ligada'], erro: ['grave', 'Com erro'], token_vencendo: ['atencao', 'Acesso vencendo'],
};
const SITUACAO_DO_WHATSAPP = {
  ok: ['bom', 'Funcionando'], chave_recusada: ['grave', 'Parado'], sem_aparelho: ['neutro', 'Sem aparelho ligado'], sem_noticia: ['atencao', 'Sem notícia'],
};

export function montar(ctx, alvo) {
  let saiu = false;
  trocar(alvo, h('p', { class: 'suave', role: 'status' }, 'Carregando as conexões…'));

  async function carregar({ fresco = false } = {}) {
    const ler = (c) => ctx.leitor.ler(c, { forcar: true }).then((r) => r.dados, (e) => ({ __erro: e }));
    const [conexoes, situacao, integracoes, rastreio] = await Promise.all([ler('api/conexoes' + (fresco ? '?fresco=1' : '')), ler('api/coleta/situacao'), ler('api/integracoes'), ler('api/origem/rastreio')]);
    if (saiu) return;
    if (conexoes.__erro) {
      trocar(alvo, h('p', { class: 'campo-erro', role: 'alert' }, fraseDoErro(conexoes.__erro)), h('button', { class: 'botao', type: 'button', on: { click: () => carregar() } }, icone('atualizar'), 'Tentar de novo'));
      return;
    }
    const contas = situacao && !situacao.__erro && Array.isArray(situacao.contas) ? situacao.contas : [];
    const linhas = Array.isArray(integracoes) ? integracoes : [];
    trocar(alvo,
      h('div', { class: 'conexoes-cartoes' },
        cartaoDeConta(ctx, 'meta', conexoes.meta || {}, contas.find((c) => c.canal === 'meta'), linhas.find((l) => l.canal === 'meta'), carregar),
        cartaoDeConta(ctx, 'google', conexoes.google || {}, contas.find((c) => c.canal === 'google'), linhas.find((l) => l.canal === 'google'), carregar),
        cartaoDoSite(conexoes.site || {}, rastreio && !rastreio.__erro ? rastreio : null),
        cartaoDoWhatsapp(conexoes)),
      blocoDaColeta(ctx, situacao && !situacao.__erro ? situacao : null, linhas.length > 0, carregar));
  }
  carregar();
  return { sair() { saiu = true; } };
}

/* ------------------------------ Meta e Google ------------------------------ */

function cartaoDeConta(ctx, canal, conexao, conta, linha, recarregar) {
  const nome = canal === 'meta' ? 'Meta (Facebook e Instagram)' : 'Google Ads';
  const situacao = SITUACAO_DA_CONTA[conexao.situacao] || ['neutro', 'Sem informação'];
  const aviso = conta && conta.aviso ? conta.aviso : null;
  const temAcesso = Boolean(linha && (canal === 'meta' ? linha.tem_meta_token : linha.tem_google_token || linha.tem_google_oauth || linha.tem_google_refresh));
  const detalhes = [];
  if (conexao.ultima_coleta) detalhes.push('Números buscados ' + haQuanto(conexao.ultima_coleta) + '.');
  if (conexao.parada) detalhes.push('A leitura automática parou.');
  if (conta && conta.token_expira_em) detalhes.push('O acesso vence em ' + dataCurta(conta.token_expira_em) + '.');

  const ids = { conta: 'c-' + canal + '-conta', acesso: 'c-' + canal + '-acesso', gerente: 'c-' + canal + '-gerente' };
  const campoConta = h('input', { id: ids.conta, name: canal === 'meta' ? 'meta_ad_account_id' : 'google_customer_id', type: 'text', inputmode: canal === 'meta' ? 'text' : 'numeric', autocomplete: 'off', spellcheck: 'false',
    placeholder: canal === 'meta' ? 'act_1234567890' : '123-456-7890' });
  const campoAcesso = canal === 'meta'
    ? h('input', { id: ids.acesso, name: 'meta_access_token', type: 'text', class: 'campo-segredo', autocomplete: 'off', autocapitalize: 'off', 'data-lpignore': 'true', 'data-1p-ignore': 'true', spellcheck: 'false', placeholder: temAcesso ? 'Já há um token guardado' : 'Começa com EAA' })
    : h('textarea', { id: ids.acesso, name: 'google_conta_servico', rows: '4', autocomplete: 'off', spellcheck: 'false', placeholder: temAcesso ? 'Já há um acesso guardado' : 'Cole aqui o arquivo JSON da conta de serviço' });
  const campoGerente = canal === 'google'
    ? h('input', { id: ids.gerente, name: 'google_login_customer_id', type: 'text', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false', placeholder: linha && linha.tem_google_mcc ? 'Já há uma conta gerenciadora guardada' : 'Deixe em branco se não houver' })
    : null;
  const resultado = h('div', { class: 'conexao-resultado', 'aria-live': 'polite' });
  let testado = null;   // os valores que passaram no teste (Salvar só vale para eles)
  const valores = () => (canal === 'meta'
    ? { canal, meta_ad_account_id: campoConta.value.trim() || undefined, meta_access_token: campoAcesso.value.trim() || undefined }
    : { canal, google_customer_id: campoConta.value.trim() || undefined, google_login_customer_id: campoGerente.value.trim() || undefined, google_conta_servico: campoAcesso.value.trim() || undefined });
  const assinatura = () => JSON.stringify(valores());
  const salvar = h('button', { class: 'botao botao-forte', type: 'button', disabled: true }, 'Salvar');
  const testar = h('button', { class: 'botao', type: 'button' }, 'Testar');
  for (const campo of [campoConta, campoAcesso, campoGerente].filter(Boolean)) campo.addEventListener('input', () => { salvar.disabled = testado !== assinatura(); erroNoCampo(campo, null); });

  testar.addEventListener('click', async () => {
    testar.disabled = true;
    trocar(testar, icone('relogio'), 'Testando…');
    trocar(resultado);
    try {
      const r = await ctx.api.gravar('api/coleta/testar', valores());
      const t = (r && Array.isArray(r.resultados) ? r.resultados : []).find((x) => x.canal === canal) || null;
      if (!t) throw new Error('sem resultado');
      trocar(resultado,
        h('p', { class: 'conexao-teste' }, t.ok ? selo('bom', t.titulo || 'Conexão funcionando') : selo('grave', t.titulo || 'Não funcionou', 'alerta')),
        t.fazer ? h('p', null, t.fazer) : null);
      testado = t.ok ? assinatura() : null;
      salvar.disabled = !t.ok;
    } catch (erro) {
      trocar(resultado, h('p', { class: 'campo-erro', role: 'alert' }, erro && erro.name === 'ErroApi' ? fraseDoErro(erro) : 'O teste não respondeu. Tente de novo.'));
    } finally {
      testar.disabled = false;
      trocar(testar, 'Testar');
    }
  });
  salvar.addEventListener('click', async () => {
    if (testado !== assinatura()) { trocar(resultado, h('p', { class: 'campo-erro', role: 'alert' }, 'Teste de novo antes de salvar: os campos mudaram depois do teste.')); return; }
    salvar.disabled = true;
    try {
      await ctx.api.gravar('api/integracoes', valores());
      campoAcesso.value = '';
      ctx.leitor.esquecer('api/conexoes', 'api/integracoes', 'api/coleta', 'api/hoje', 'api/campanhas');
      ctx.avisar('Acesso guardado.');
      recarregar();
    } catch (erro) {
      salvar.disabled = false;
      const campo = erro && erro.corpo && /token|acesso|json/i.test(erro.message) ? campoAcesso : campoGerente && /gerenciadora/i.test(erro.message || '') ? campoGerente : campoConta;
      erroNoCampo(campo, fraseDoErro(erro));
      campo.focus();
    }
  });

  return h('article', { class: 'conexao-cartao', 'aria-labelledby': 'tc-' + canal },
    h('div', { class: 'conexao-cab' }, h('h3', { class: 'titulo-p', id: 'tc-' + canal }, nome), selo(situacao[0], situacao[1])),
    aviso ? h('div', { class: 'conexao-problema' }, icone('alerta', 'icone-p'), h('div', null, h('p', { class: 'forte' }, aviso.titulo), aviso.fazer ? h('p', null, aviso.fazer) : null)) : null,
    detalhes.length ? h('p', { class: 'apoio' }, detalhes.join(' ')) : null,
    h('details', { class: 'conexao-acessos', open: !temAcesso || conexao.situacao === 'erro' || conexao.situacao === 'token_vencendo' || Boolean(aviso) },
      h('summary', { class: 'ligacao' }, temAcesso ? 'Trocar o acesso' : 'Colar os acessos'),
      h('div', { class: 'conexao-form' },
        h('label', { class: 'campo', for: ids.conta }, h('span', null, canal === 'meta' ? 'Número da conta de anúncios' : 'ID do cliente no Google Ads'), campoConta),
        h('label', { class: 'campo', for: ids.acesso }, h('span', null, canal === 'meta' ? 'Token de acesso' : 'Conta de serviço (arquivo JSON)'), campoAcesso),
        campoGerente ? h('label', { class: 'campo', for: ids.gerente }, h('span', null, 'ID da conta gerenciadora (se houver)'), campoGerente) : null,
        h('div', { class: 'conexao-botoes' }, testar, salvar),
        resultado)));
}

/* ------------------------------ site e WhatsApp ------------------------------ */

function cartaoDoSite(site, rastreio) {
  const instalado = rastreio ? rastreio.instalado_no_site : site.rastreio;
  const cliques = rastreio && ehNumero(rastreio.cliques_7d) ? rastreio.cliques_7d : site.cliques_7d;
  return h('article', { class: 'conexao-cartao', 'aria-labelledby': 'tc-site' },
    h('div', { class: 'conexao-cab' }, h('h3', { class: 'titulo-p', id: 'tc-site' }, 'Rastreio do site'), instalado ? selo('bom', 'Funcionando') : selo('neutro', 'Não instalado')),
    instalado && ehNumero(cliques) ? h('p', { class: 'apoio' }, contagem(cliques, 'clique', 'cliques') + ' no WhatsApp em 7 dias.') : null);
}

function cartaoDoWhatsapp(c) {
  const w = c.whatsapp || {};
  const situacao = SITUACAO_DO_WHATSAPP[w.situacao] || ['neutro', 'Sem informação'];
  const parado = w.situacao && w.situacao !== 'ok';
  return h('article', { class: 'conexao-cartao', 'aria-labelledby': 'tc-whatsapp' },
    h('div', { class: 'conexao-cab' }, h('h3', { class: 'titulo-p', id: 'tc-whatsapp' }, 'WhatsApp da oficina'), selo(situacao[0], situacao[1], w.situacao === 'chave_recusada' ? 'alerta' : undefined)),
    parado && w.desde ? h('p', { class: 'apoio' }, 'Desde ' + dataCurta(w.desde) + '. Resolva no Atendimento.') : null);
}

/* ------------------------------ buscar os números agora ------------------------------ */

function blocoDaColeta(ctx, situacao, temConta, recarregar) {
  const ultima = situacao && situacao.ultima;
  const resultado = h('p', { class: 'apoio', 'aria-live': 'polite' }, ultima && ultima.fim ? 'Última busca ' + haQuanto(ultima.fim) + '.' : '');
  const botao = h('button', { class: 'botao', type: 'button', disabled: !temConta }, icone('atualizar'), 'Buscar os números agora');
  botao.addEventListener('click', async () => {
    botao.disabled = true;
    trocar(botao, icone('relogio'), 'Buscando…');
    try {
      await ctx.api.gravar('api/coleta/agora', {});
      ctx.leitor.esquecer('api/');
      ctx.avisar('Números atualizados.');
      await recarregar({ fresco: true });
      const novo = document.querySelector('.coleta .botao');
      if (novo && novo !== botao) novo.focus();
    } catch (erro) {
      trocar(resultado, fraseDoErro(erro));
      botao.disabled = false;
      trocar(botao, icone('atualizar'), 'Buscar os números agora');
    }
  });
  return h('div', { class: 'coleta' }, botao, resultado);
}
