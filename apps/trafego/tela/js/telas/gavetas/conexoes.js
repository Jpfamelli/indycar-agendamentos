/* ============================================================================
   Gaveta Conexões: Meta, Google, rastreio do site e WhatsApp.
   GET api/conexoes (passos, API-base.md), GET api/coleta/situacao,
   GET api/integracoes, POST api/coleta/testar, POST api/integracoes,
   POST api/coleta/agora (API-coleta.md da T6).
   O que foi salvo nunca volta para a tela: o campo de acesso diz só que há
   um acesso guardado. Salvar só depois de "Conexão funcionando" no teste.
   ============================================================================ */

import { h, icone, trocar } from '../../dom.js';
import { dataCurta, haQuanto, inteiro, contagem, ehNumero } from '../../formato.js';
import { selo, botaoDaAcao, erroNoCampo } from '../../pecas.js';
import { fraseDoErro } from '../estados.js';

const SITUACAO_DA_CONTA = {
  ok: ['bom', 'Ligada'], nunca_ligou: ['neutro', 'Não ligada'], erro: ['grave', 'Com erro'], token_vencendo: ['atencao', 'Acesso vencendo'],
};
const SITUACAO_DO_WHATSAPP = {
  ok: ['bom', 'Funcionando'], chave_recusada: ['grave', 'Parado: chave recusada'], sem_aparelho: ['neutro', 'Sem aparelho ligado'], sem_noticia: ['atencao', 'Sem notícia'],
};

/* Os passos da Meta e do Google, curtos (o passo a passo inteiro está em CONECTAR.md, que vira capítulo do manual). */
const COMO_PEGAR = {
  meta: [
    'Abra business.facebook.com/settings e entre em Usuários do sistema.',
    'Crie o usuário "Painel IndyCar Tráfego" com a função Funcionário.',
    'Em Atribuir ativos, dê a ele a conta de anúncios da oficina com a permissão Ver desempenho.',
    'Clique em Gerar novo token: validade Nunca e só a permissão ads_read.',
    'Copie o token (começa com EAA) e o número da conta de anúncios e cole aqui. Teste antes de salvar.',
  ],
  google: [
    'No Google Cloud, crie uma conta de serviço e baixe a chave dela em arquivo JSON.',
    'No Google Ads, em Administrador e Acesso, convide o e-mail da conta de serviço com acesso de leitura.',
    'Pegue o ID do cliente no alto do Google Ads (10 números, como 123-456-7890).',
    'Cole o ID e o conteúdo do arquivo JSON aqui. Teste antes de salvar.',
  ],
};

export function montar(ctx, alvo) {
  let saiu = false;
  trocar(alvo, h('p', { class: 'suave', role: 'status' }, 'Carregando as conexões…'));

  async function carregar() {
    const ler = (c) => ctx.leitor.ler(c, { forcar: true }).then((r) => r.dados, (e) => ({ __erro: e }));
    const [conexoes, situacao, integracoes, rastreio] = await Promise.all([ler('api/conexoes'), ler('api/coleta/situacao'), ler('api/integracoes'), ler('api/origem/rastreio')]);
    if (saiu) return;
    if (conexoes.__erro) {
      trocar(alvo, h('p', { class: 'campo-erro', role: 'alert' }, fraseDoErro(conexoes.__erro)), h('button', { class: 'botao', type: 'button', on: { click: carregar } }, icone('atualizar'), 'Tentar de novo'));
      return;
    }
    const contas = situacao && !situacao.__erro && Array.isArray(situacao.contas) ? situacao.contas : [];
    const linhas = Array.isArray(integracoes) ? integracoes : [];
    trocar(alvo,
      passoAPasso(ctx, conexoes),
      h('div', { class: 'conexoes-cartoes' },
        cartaoDeConta(ctx, 'meta', conexoes.meta || {}, contas.find((c) => c.canal === 'meta'), linhas.find((l) => l.canal === 'meta'), carregar),
        cartaoDeConta(ctx, 'google', conexoes.google || {}, contas.find((c) => c.canal === 'google'), linhas.find((l) => l.canal === 'google'), carregar),
        cartaoDoSite(ctx, conexoes.site || {}, rastreio && !rastreio.__erro ? rastreio : null),
        cartaoDoWhatsapp(ctx, conexoes)),
      blocoDaColeta(ctx, situacao && !situacao.__erro ? situacao : null, linhas.length > 0, carregar));
  }
  carregar();
  return { sair() { saiu = true; } };
}

/* ------------------------------ passo a passo ------------------------------ */

function passoAPasso(ctx, c) {
  const passos = Array.isArray(c.passos) ? c.passos : [];
  if (!passos.length) return null;
  const feitos = passos.filter((p) => p.feito).length;
  const lista = h('ol', { class: 'passos' }, passos.map((p, i) => h('li', { class: 'passo', data: { feito: p.feito ? '1' : null } },
      h('span', { class: 'passo-n', 'aria-hidden': 'true' }, p.feito ? icone('certo') : String(i + 1)),
      h('div', { class: 'passo-corpo' },
        h('p', { class: 'passo-titulo' }, p.titulo, h('span', { class: 'so-leitor' }, p.feito ? ' (pronto)' : ' (falta)')),
        !p.feito && p.como ? h('p', { class: 'apoio' }, p.como) : null,
        !p.feito ? botaoDaAcao(ctx, p.acao, 'ligacao passo-acao') : null))));
  // Tudo ligado: o passo a passo vira uma linha (os cinco "feito" ocupavam a primeira tela inteira no celular).
  if (feitos === passos.length) {
    return h('section', { class: 'conexoes-passos conexoes-passos-prontos', 'aria-labelledby': 'tPassos' },
      h('div', { class: 'conexoes-passos-cab' },
        h('h3', { class: 'titulo-p', id: 'tPassos' }, 'Passo a passo'),
        selo('bom', 'Tudo ligado: ' + inteiro(feitos) + ' de ' + inteiro(passos.length))),
      h('details', { class: 'conexoes-passos-ver' }, h('summary', { class: 'ligacao' }, 'Ver os passos'), lista));
  }
  return h('section', { class: 'conexoes-passos', 'aria-labelledby': 'tPassos' },
    h('div', { class: 'conexoes-passos-cab' },
      h('h3', { class: 'titulo-p', id: 'tPassos' }, 'Passo a passo'),
      h('p', { class: 'apoio' }, inteiro(feitos) + ' de ' + inteiro(passos.length) + ' prontos.')),
    lista);
}

/* ------------------------------ Meta e Google ------------------------------ */

function cartaoDeConta(ctx, canal, conexao, conta, linha, recarregar) {
  const nome = canal === 'meta' ? 'Meta (Facebook e Instagram)' : 'Google Ads';
  const situacao = SITUACAO_DA_CONTA[conexao.situacao] || ['neutro', 'Sem informação'];
  const aviso = conta && conta.aviso ? conta.aviso : null;
  const temAcesso = Boolean(linha && (canal === 'meta' ? linha.tem_meta_token : linha.tem_google_token || linha.tem_google_oauth || linha.tem_google_refresh));
  const detalhes = [];
  if (conexao.ultima_coleta) detalhes.push('Números buscados ' + haQuanto(conexao.ultima_coleta) + '.');
  if (conexao.parada) detalhes.push('A leitura automática parou: os números podem estar atrasados.');
  if (conta && conta.token_expira_em) detalhes.push('O acesso vence em ' + dataCurta(conta.token_expira_em) + '.');

  const ids = { conta: 'c-' + canal + '-conta', acesso: 'c-' + canal + '-acesso', gerente: 'c-' + canal + '-gerente' };
  const campoConta = h('input', { id: ids.conta, name: canal === 'meta' ? 'meta_ad_account_id' : 'google_customer_id', type: 'text', inputmode: canal === 'meta' ? 'text' : 'numeric', autocomplete: 'off', spellcheck: 'false',
    placeholder: canal === 'meta' ? 'act_1234567890' : '123-456-7890' });
  const campoAcesso = canal === 'meta'
    ? h('input', { id: ids.acesso, name: 'meta_access_token', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: temAcesso ? 'Já há um token guardado' : 'Começa com EAA' })
    : h('textarea', { id: ids.acesso, name: 'google_conta_servico', rows: '4', autocomplete: 'off', spellcheck: 'false', placeholder: temAcesso ? 'Já há um acesso guardado' : 'Cole aqui o conteúdo do arquivo JSON da conta de serviço' });
  // Google: conta que mora dentro de uma conta gerenciadora (MCC, comum quando uma agência cuida) precisa do ID dela também.
  const campoGerente = canal === 'google'
    ? h('input', { id: ids.gerente, name: 'google_login_customer_id', type: 'text', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false', placeholder: linha && linha.tem_google_mcc ? 'Já há uma conta gerenciadora guardada' : 'Deixe em branco se não houver', 'aria-describedby': ids.gerente + '-apoio' })
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
        t.fazer ? h('p', null, t.fazer) : null,
        Array.isArray(t.avisos) && t.avisos.length ? h('ul', { class: 'conexao-avisos' }, t.avisos.map((a) => h('li', null, a))) : null);
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
      ctx.avisar('Acesso guardado. A próxima leitura já usa ele.');
      recarregar();
    } catch (erro) {
      salvar.disabled = false;
      const campo = erro && erro.corpo && /token|acesso|json/i.test(erro.message) ? campoAcesso : campoGerente && /gerenciadora/i.test(erro.message || '') ? campoGerente : campoConta;
      erroNoCampo(campo, fraseDoErro(erro));
      campo.focus();
    }
  });

  const guardado = temAcesso
    ? 'Já há um acesso guardado' + (linha && linha.salvo_em ? ' desde ' + dataCurta(linha.salvo_em) : '') + '. Ele nunca aparece aqui; para trocar, cole um novo.'
    : 'Nenhum acesso guardado ainda.';
  // Trocar o acesso da Meta e do Google é só do administrador (o servidor recusa com so_admin): o gestor vê a situação e o porquê.
  const papel = ctx.eu && ctx.eu.papel;
  const podeTrocar = !papel || papel === 'admin' || papel === 'dono';
  return h('article', { class: 'conexao-cartao', 'aria-labelledby': 'tc-' + canal },
    h('div', { class: 'conexao-cab' }, h('h3', { class: 'titulo-p', id: 'tc-' + canal }, nome), selo(situacao[0], situacao[1])),
    conexao.aviso ? h('p', null, conexao.aviso) : null,
    aviso ? h('div', { class: 'conexao-problema' }, icone('alerta', 'icone-p'), h('div', null, h('p', { class: 'forte' }, aviso.titulo), aviso.fazer ? h('p', null, aviso.fazer) : null)) : null,
    detalhes.length ? h('p', { class: 'apoio' }, detalhes.join(' ')) : null,
    !podeTrocar ? h('p', { class: 'apoio' }, (temAcesso ? 'Há um acesso guardado. ' : 'Ainda sem acesso guardado. ') + 'Só o administrador da oficina cola ou troca o acesso.') : null,
    !podeTrocar ? null : h('details', { class: 'conexao-acessos', open: !temAcesso || conexao.situacao === 'erro' || conexao.situacao === 'token_vencendo' || Boolean(aviso) },
      h('summary', { class: 'ligacao' }, temAcesso ? 'Trocar o acesso' : 'Colar os acessos'),
      h('div', { class: 'conexao-form' },
        h('p', { class: 'apoio' }, guardado),
        h('label', { class: 'campo', for: ids.conta }, h('span', null, canal === 'meta' ? 'Número da conta de anúncios' : 'ID do cliente no Google Ads'), campoConta),
        h('label', { class: 'campo', for: ids.acesso }, h('span', null, canal === 'meta' ? 'Token de acesso' : 'Conta de serviço (arquivo JSON)'), campoAcesso),
        campoGerente ? h('label', { class: 'campo', for: ids.gerente }, h('span', null, 'ID da conta gerenciadora (se houver)'), campoGerente) : null,
        campoGerente ? h('p', { class: 'apoio conexao-ajuda', id: ids.gerente + '-apoio' }, 'Só se a conta do Google Ads fica dentro de outra (MCC), como quando uma agência cuida dos anúncios. São 10 números.') : null,
        h('div', { class: 'conexao-botoes' }, testar, salvar),
        resultado,
        h('details', { class: 'conexao-como' },
          h('summary', { class: 'ligacao' }, canal === 'meta' ? 'Como pegar o token da Meta (cerca de 15 minutos)' : 'Como pegar o acesso do Google'),
          h('ol', null, COMO_PEGAR[canal].map((t) => h('li', null, t)))))));
}

/* ------------------------------ site e WhatsApp ------------------------------ */

function cartaoDoSite(ctx, site, rastreio) {
  const instalado = rastreio ? rastreio.instalado_no_site : site.rastreio;
  const ultimo = (rastreio && rastreio.ultimo_clique) || site.ultimo_clique;
  const cliques = rastreio && ehNumero(rastreio.cliques_7d) ? rastreio.cliques_7d : site.cliques_7d;
  return h('article', { class: 'conexao-cartao', 'aria-labelledby': 'tc-site' },
    h('div', { class: 'conexao-cab' }, h('h3', { class: 'titulo-p', id: 'tc-site' }, 'Rastreio do site'), instalado ? selo('bom', 'Funcionando') : selo('neutro', 'Não instalado')),
    h('p', null, instalado
      ? [ultimo ? 'Último clique no botão de WhatsApp ' + haQuanto(ultimo) + '. ' : '', ehNumero(cliques) ? contagem(cliques, 'clique', 'cliques') + ' nos últimos 7 dias.' : ''].join('')
      : 'Nenhuma visita chegou nos últimos 30 dias. Sem o rastreio, quem vem pelo site chega sem origem.'),
    h('a', { class: 'ligacao', href: ctx.hrefDaTela('ajustes', { secao: 'origem', parte: 'rastreio' }) }, instalado ? 'Ver a linha do site' : 'Pegar a linha para colar no site', icone('seta', 'icone-p')));
}

function cartaoDoWhatsapp(ctx, c) {
  const w = c.whatsapp || {};
  const situacao = SITUACAO_DO_WHATSAPP[w.situacao] || ['neutro', 'Sem informação'];
  const passo = (Array.isArray(c.passos) ? c.passos : []).find((p) => /whatsapp/i.test(p.titulo || ''));
  const parado = w.situacao && w.situacao !== 'ok';
  return h('article', { class: 'conexao-cartao' + (w.situacao === 'chave_recusada' ? ' conexao-cartao-grave' : ''), 'aria-labelledby': 'tc-whatsapp' },
    h('div', { class: 'conexao-cab' }, h('h3', { class: 'titulo-p', id: 'tc-whatsapp' }, 'WhatsApp da oficina'), selo(situacao[0], situacao[1], w.situacao === 'chave_recusada' ? 'alerta' : undefined)),
    parado && w.desde ? h('p', { class: 'forte' }, 'Desde ' + dataCurta(w.desde) + ' nenhum WhatsApp automático sai e o Tráfego não enxerga as respostas da oficina.') : null,
    w.aviso ? h('p', null, w.aviso) : null,
    parado && passo && passo.como ? h('div', { class: 'conexao-passo' }, h('p', { class: 'apoio' }, 'Para resolver'), h('p', null, passo.como)) : null,
    parado && passo ? botaoDaAcao(ctx, passo.acao, 'botao') : null);
}

/* ------------------------------ buscar os números agora ------------------------------ */

function resumoDaColeta(ultima) {
  if (!ultima || !ultima.plataformas) return null;
  const nomes = { meta: 'Meta', google: 'Google' };
  return Object.entries(ultima.plataformas).map(([canal, p]) => h('li', null,
    h('span', { class: 'forte' }, nomes[canal] || canal),
    p.ok
      ? selo('bom', ehNumero(p.linhas) ? contagem(p.linhas, 'linha lida', 'linhas lidas') : 'Leu')
      : selo('grave', p.titulo || 'Não leu', 'alerta'),
    !p.ok && p.fazer ? h('span', { class: 'apoio' }, p.fazer) : null));
}

function blocoDaColeta(ctx, situacao, temConta, recarregar) {
  const ultima = situacao && situacao.ultima;
  const resultado = h('div', { class: 'coleta-resultado', 'aria-live': 'polite' },
    ultima && ultima.fim ? h('p', { class: 'apoio' }, 'Última busca ' + haQuanto(ultima.fim) + (ultima.origem === 'pessoa' ? ', pedida na tela.' : ', automática.')) : null,
    ultima ? h('ul', { class: 'coleta-lista' }, resumoDaColeta(ultima)) : null);
  const botao = h('button', { class: 'botao', type: 'button', disabled: !temConta }, icone('atualizar'), 'Buscar os números agora');
  botao.addEventListener('click', async () => {
    botao.disabled = true;
    trocar(botao, icone('relogio'), 'Buscando…');
    try {
      const r = await ctx.api.gravar('api/coleta/agora', {});
      ctx.leitor.esquecer('api/');
      trocar(resultado, h('p', { class: 'apoio' }, r.ja_estava_rodando ? 'Já havia uma busca rodando; este é o resultado dela.' : 'Busca feita agora.'), h('ul', { class: 'coleta-lista' }, resumoDaColeta(r)));
      ctx.avisar('Números atualizados.');
    } catch (erro) {
      trocar(resultado, h('p', { class: erro && erro.status === 429 ? 'apoio' : 'campo-erro', role: 'alert' }, fraseDoErro(erro)));
    } finally {
      botao.disabled = false;
      trocar(botao, icone('atualizar'), 'Buscar os números agora');
    }
  });
  return h('section', { class: 'coleta', 'aria-labelledby': 'tColeta' },
    h('h3', { class: 'titulo-p', id: 'tColeta' }, 'Números das plataformas'),
    h('p', { class: 'apoio' }, temConta ? 'O Tráfego busca sozinho de tempos em tempos. Se acabou de mudar algo na Meta ou no Google, busque agora.' : 'Ligue a Meta ou o Google acima para o Tráfego buscar gasto, cliques e conversas.'),
    botao,
    resultado);
}
