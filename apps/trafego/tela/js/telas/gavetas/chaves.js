/* ============================================================================
   Gaveta "Acesso da IA de fora" (API-ia.md › Chaves e MCP.md).
   Criar mostra a chave UMA vez, com copiar e o aviso; a lista nunca mostra a
   chave, só o começo dela. Revogar pede confirmação ali mesmo. Embaixo, o que
   colar no Claude Code e no Codex (com SUA_CHAVE no lugar da chave).
   ============================================================================ */

import { h, icone, trocar, focar } from '../../dom.js';
import { contagem, dataCurta, haQuanto, ehNumero } from '../../formato.js';
import { selo, botaoCopiar, erroNoCampo } from '../../pecas.js';
import { fraseDoErro } from '../estados.js';
import { baseDaPagina } from '../../ecossistema.js';

/** Endereço do MCP visto desta página (o app mora na mesma base das rotas /api). */
export function enderecoDoMcp(loc = location) {
  return loc.origin + baseDaPagina(loc.pathname) + 'mcp';
}

/** O que a chave pode fazer, em palavras. */
export function podeFazer(chave) {
  const escopos = Array.isArray(chave && chave.escopos) ? chave.escopos : [];
  const base = escopos.includes('propor') ? 'Lê os números e deixa sugestões para você aprovar' : 'Só lê os números';
  return base + (chave && chave.ver_pii ? '; vê nome e conversa completa dos clientes.' : '.');
}

export function linhaDoClaudeCode(endereco) {
  return 'claude mcp add --transport http indycar-trafego ' + endereco + ' --header "Authorization: Bearer SUA_CHAVE"';
}
export function blocoDoCodex(endereco) {
  return [
    '# ~/.codex/config.toml',
    '[mcp_servers.indycar_trafego]',
    'url = "' + endereco + '"',
    'bearer_token_env_var = "INDYCAR_TRAFEGO_CHAVE"',
    'tool_timeout_sec = 60',
  ].join('\n');
}

let seq = 0;

export function montar(ctx, alvo) {
  let saiu = false;
  const lista = h('div', { class: 'chaves-lista-caixa' });
  const nova = h('div', { class: 'chave-nova-caixa' });
  const endereco = enderecoDoMcp();
  trocar(alvo,
    h('p', { class: 'apoio chaves-intro' }, 'Uma chave deixa uma IA que você usa no computador (Claude Code ou Codex) ler os números da oficina pelo mesmo caminho do Gestor IA. Ela nunca mexe nos anúncios: no máximo deixa uma sugestão para você aprovar no Gestor.'),
    nova,
    h('section', { class: 'chaves-bloco', 'aria-labelledby': 'ch-lista-t' }, h('h3', { class: 'titulo-p', id: 'ch-lista-t' }, 'Chaves criadas'), lista),
    h('section', { class: 'chaves-bloco', 'aria-labelledby': 'ch-criar-t' }, h('h3', { class: 'titulo-p', id: 'ch-criar-t' }, 'Criar uma chave'), formulario()),
    h('section', { class: 'chaves-bloco', 'aria-labelledby': 'ch-ligar-t' },
      h('h3', { class: 'titulo-p', id: 'ch-ligar-t' }, 'Como ligar na IA'),
      h('p', { class: 'apoio' }, 'Troque SUA_CHAVE pela chave criada. No Codex, a chave fica na variável INDYCAR_TRAFEGO_CHAVE do computador, fora do arquivo.'),
      h('p', { class: 'campo-rotulo' }, 'Claude Code (cole no terminal)'),
      h('pre', { class: 'caixa-codigo' }, linhaDoClaudeCode(endereco)),
      botaoCopiar(ctx, linhaDoClaudeCode(endereco), { rotulo: 'Copiar a linha do Claude Code', aviso: 'Linha copiada. Troque SUA_CHAVE pela chave antes de rodar.' }),
      h('p', { class: 'campo-rotulo' }, 'Codex (arquivo de configuração)'),
      h('pre', { class: 'caixa-codigo' }, blocoDoCodex(endereco)),
      botaoCopiar(ctx, blocoDoCodex(endereco), { rotulo: 'Copiar o bloco do Codex', aviso: 'Bloco copiado.' })));

  async function carregar({ focarNa = null } = {}) {
    let d;
    try { d = await ctx.api.ler('api/ia/chaves'); } catch (erro) {
      if (saiu) return;
      if (erro && erro.codigo === 'so_admin') trocar(lista, h('p', { class: 'aviso-caixa' }, icone('info', 'icone-p'), h('span', null, 'Só o administrador da oficina vê, cria e revoga as chaves da IA.')));
      else trocar(lista, h('p', { class: 'campo-erro' }, fraseDoErro(erro)));
      return;
    }
    if (saiu) return;
    const chaves = Array.isArray(d.chaves) ? d.chaves : [];
    trocar(lista,
      d.ligado === false ? h('p', { class: 'aviso-caixa' }, icone('info', 'icone-p'), h('span', null, d.aviso || 'As chaves ainda não estão ligadas no banco.')) : null,
      chaves.length ? h('ul', { class: 'chaves' }, chaves.map(linha)) : d.ligado === false ? null : h('p', { class: 'suave' }, 'Nenhuma chave criada. Sem chave, nenhuma IA de fora lê os números.'));
    if (focarNa) { const alvoFoco = lista.querySelector('[data-id="' + CSS.escape(focarNa) + '"] .chave-nome'); if (alvoFoco) focar(alvoFoco); }
  }

  function linha(k) {
    const li = h('li', { class: 'chave', data: { id: k.id, ativa: k.ativa ? '1' : null } });
    const acoes = h('div', { class: 'chave-acoes' });
    const pintarAcoes = () => trocar(acoes, k.ativa
      ? h('button', { class: 'botao botao-quieto', type: 'button', on: { click: confirmar } }, icone('lixo'), 'Revogar')
      : selo('fora', 'Revogada' + (k.revogada_em ? ' em ' + dataCurta(k.revogada_em) : '')));
    function confirmar() {
      const sim = h('button', { class: 'botao botao-forte', type: 'button' }, 'Revogar a chave');
      const nao = h('button', { class: 'botao botao-quieto', type: 'button', on: { click: () => { pintarAcoes(); acoes.querySelector('button').focus(); } } }, 'Manter a chave');
      const pergunta = h('p', { class: 'chave-pergunta', id: 'ch-conf-' + (++seq) }, 'Revogar a chave "' + (k.nome || '') + '"? Quem usa esta chave perde o acesso na hora. Não dá para desfazer.');
      sim.addEventListener('click', async () => {
        sim.disabled = true; nao.disabled = true;
        try {
          await ctx.api.apagar('api/ia/chaves/' + encodeURIComponent(k.id));
          ctx.leitor.esquecer('api/ia/');
          ctx.avisar('Chave revogada. Ela parou de funcionar agora.');
          await carregar({ focarNa: k.id });
        } catch (erro) { sim.disabled = false; nao.disabled = false; ctx.avisar(fraseDoErro(erro)); }
      });
      const caixa = h('div', { class: 'chave-confirmar', role: 'group', 'aria-labelledby': pergunta.id, on: { keydown: (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); nao.click(); } } } },
        pergunta, h('div', { class: 'chave-botoes' }, sim, nao));
      trocar(acoes, caixa);
      nao.focus();
    }
    pintarAcoes();
    const uso = k.ultimo_uso_em ? 'Último uso ' + haQuanto(k.ultimo_uso_em) + (ehNumero(k.usos) ? ', ' + contagem(k.usos, 'chamada', 'chamadas') + ' no total' : '') + '.' : 'Ainda não foi usada.';
    trocar(li,
      h('div', { class: 'chave-corpo' },
        h('p', { class: 'chave-nome', tabindex: '-1' }, k.nome || 'Sem nome', h('span', { class: 'chave-prefixo' }, ' ' + (k.prefixo || '') + '…')),
        h('p', { class: 'apoio' }, podeFazer(k)),
        h('p', { class: 'apoio' }, 'Criada em ' + dataCurta(k.criada_em) + (k.criada_por ? ' por ' + k.criada_por : '') + '. ' + uso)),
      acoes);
    return li;
  }

  function formulario() {
    const id = 'ch-nome-' + (++seq);
    const nome = h('input', { id, name: 'nome', type: 'text', maxlength: '60', autocomplete: 'off', placeholder: 'Ex.: Claude Code do João' });
    const grupo = 'ch-escopo-' + seq;
    const opcao = (valor, texto, apoio, marcada) => h('label', { class: 'opcao' },
      h('input', { type: 'radio', name: grupo, value: valor, checked: marcada || null }),
      h('span', null, h('span', { class: 'opcao-texto' }, texto), h('span', { class: 'apoio' }, apoio)));
    const pii = h('input', { type: 'checkbox' });
    const criar = h('button', { class: 'botao botao-forte', type: 'submit' }, icone('chave'), 'Criar a chave');
    const form = h('form', { class: 'chave-form', novalidate: true, on: { submit: async (e) => {
      e.preventDefault();
      erroNoCampo(nome, null);
      const texto = nome.value.trim();
      if (texto.length < 2) { erroNoCampo(nome, 'Dê um nome que diga quem vai usar a chave (de 2 a 60 letras).'); nome.focus(); return; }
      const escolhido = form.querySelector('input[name="' + grupo + '"]:checked');
      criar.disabled = true;
      try {
        const r = await ctx.api.gravar('api/ia/chaves', { nome: texto, escopos: escolhido && escolhido.value === 'propor' ? ['ler', 'propor'] : ['ler'], ver_pii: pii.checked });
        form.reset();
        ctx.leitor.esquecer('api/ia/');
        mostrarNova(r);
        carregar();
      } catch (erro) {
        erroNoCampo(nome, erro && erro.codigo === 'so_admin' ? 'Só o administrador da oficina cria chaves.' : fraseDoErro(erro));
        nome.focus();
      } finally { criar.disabled = false; }
    } } },
      h('label', { class: 'campo', for: id }, h('span', null, 'Quem vai usar'), nome),
      h('fieldset', { class: 'opcoes' },
        h('legend', { class: 'campo-rotulo' }, 'O que a chave pode fazer'),
        opcao('ler', 'Só ler os números', 'Campanhas, contatos, horários e o diário. Bom para perguntar e analisar.', true),
        opcao('propor', 'Ler e deixar sugestões', 'A IA pode registrar uma sugestão; ela só vale depois que alguém aceita no Gestor.', false)),
      h('label', { class: 'opcao' }, pii,
        h('span', null, h('span', { class: 'opcao-texto' }, 'Ver nome e conversa completa dos clientes'),
          h('span', { class: 'apoio' }, 'Deixe desmarcado se não precisar: sem isso a IA vê só o primeiro nome e o final do telefone.'))),
      criar);
    return form;
  }

  function mostrarNova(r) {
    const chave = String(r && r.chave || '');
    const titulo = h('h3', { class: 'titulo-p', id: 'ch-nova-t', tabindex: '-1' }, 'Chave criada: copie agora');
    const fechar = h('button', { class: 'botao botao-quieto', type: 'button', on: { click: () => {
      trocar(nova);
      const item = lista.querySelector('.chave .chave-nome');
      if (item) focar(item);
    } } }, 'Já guardei');
    trocar(nova, h('section', { class: 'chave-nova', 'aria-labelledby': 'ch-nova-t' },
      titulo,
      h('p', { class: 'chave-nova-aviso' }, icone('alerta', 'icone-p'), h('span', null, 'Ela aparece só desta vez. Guarde num gerenciador de senhas. Se perder, revogue e crie outra.')),
      h('p', { class: 'caixa-codigo chave-valor' }, chave),
      h('div', { class: 'chave-botoes' }, botaoCopiar(ctx, chave, { rotulo: 'Copiar a chave', classe: 'botao botao-forte', aviso: 'Chave copiada. Cole no gerenciador de senhas.' }), fechar),
      r && r.aviso ? h('p', { class: 'apoio' }, r.aviso) : null));
    focar(titulo);
  }

  carregar();
  return { sair() { saiu = true; trocar(nova); } };
}
