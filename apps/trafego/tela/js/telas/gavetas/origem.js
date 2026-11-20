/* ============================================================================
   Gaveta "De onde vêm os contatos" (rotas de origem do API-jornada.md, T2b).
   Frases da primeira mensagem (listar, criar, editar, desligar), mensagens
   que se repetem e ainda não dizem a origem (candidatas), testar uma
   mensagem, reaplicar no passado (sempre simula antes), mensagem pronta por
   anúncio (texto, link do WhatsApp e QR) e o rastreio do site.
   Toda mensagem de cliente entra por nó de texto.
   ============================================================================ */

import { h, icone, trocar, focar } from '../../dom.js';
import { inteiro, contagem, dataCurta, haQuanto, hora, ehNumero } from '../../formato.js';
import { selo, origem as marcaDaOrigem, botaoCopiar, salvarArquivo, erroNoCampo } from '../../pecas.js';
import { fraseDoErro } from '../estados.js';

const TIPOS = [{ id: 'contem', rotulo: 'Contém' }, { id: 'comeca', rotulo: 'Começa com' }, { id: 'exata', rotulo: 'É exatamente' }];
const nomeDoTipo = (id) => (TIPOS.find((t) => t.id === id) || TIPOS[0]).rotulo;
const PARTES = [
  { id: 'frases', rotulo: 'Frases' }, { id: 'candidatas', rotulo: 'Mensagens sem origem' }, { id: 'testar', rotulo: 'Testar' },
  { id: 'reaplicar', rotulo: 'Reaplicar no passado' }, { id: 'mensagem', rotulo: 'Mensagem pronta' }, { id: 'rastreio', rotulo: 'Rastreio do site' },
];

let sequencia = 0;
const idNovo = (p) => p + '-' + (++sequencia);

export function montar(ctx, alvo, { parte } = {}) {
  let saiu = false;
  let destinos = [];
  const partes = {};
  for (const p of PARTES) partes[p.id] = h('section', { class: 'origem-parte', id: 'o-' + p.id, 'aria-labelledby': 'o-' + p.id + '-t', tabindex: '-1' });
  const irPara = (id) => { const s = partes[id]; if (s) { s.scrollIntoView({ block: 'start' }); focar(s.querySelector('h3') || s); } };
  trocar(alvo,
    h('nav', { class: 'origem-atalhos', 'aria-label': 'Partes desta gaveta' },
      PARTES.map((p) => h('a', { class: 'ficha', href: '#o-' + p.id, on: { click: (e) => { e.preventDefault(); irPara(p.id); } } }, p.rotulo))),
    PARTES.map((p) => partes[p.id]));

  /* --- frases --- */
  const novaFrase = formularioDeFrase(null);
  async function carregarFrases() {
    trocar(partes.frases, titulo('frases', 'Frases que dizem a origem'), h('p', { class: 'suave' }, 'Carregando…'));
    let d;
    try { d = await ctx.api.ler('api/origem/frases'); } catch (erro) { if (!saiu) trocar(partes.frases, titulo('frases', 'Frases que dizem a origem'), h('p', { class: 'campo-erro' }, fraseDoErro(erro))); return; }
    if (saiu) return;
    destinos = Array.isArray(d.destinos) ? d.destinos : [];
    preencherDestinos();
    const frases = Array.isArray(d.frases) ? d.frases : [];
    trocar(partes.frases,
      titulo('frases', 'Frases que dizem a origem'),
      h('p', { class: 'apoio' }, 'Quando a primeira mensagem do contato traz uma destas frases, o Tráfego já sabe de onde ele veio. A mensagem padrão do anúncio da Meta é a mais comum.'),
      frases.length ? h('p', { class: 'apoio' }, 'Acento, letra maiúscula e pontuação no fim não contam: por isso as frases aparecem em minúsculas e sem acento, do jeito que o Tráfego compara.') : null,
      d.ligado === false ? h('p', { class: 'aviso-caixa' }, icone('info', 'icone-p'), h('span', null, d.aviso || 'Esta parte ainda não está ligada no banco.')) : null,
      frases.length ? h('ul', { class: 'frases' }, frases.map(linhaDaFrase)) : h('p', { class: 'suave' }, 'Nenhuma frase cadastrada ainda.'),
      d.ligado === false ? null : h('details', { class: 'frase-nova', id: 'o-frase-nova' }, h('summary', { class: 'botao' }, icone('mais'), 'Nova frase'), novaFrase.form));
  }

  function linhaDaFrase(f) {
    const li = h('li', { class: 'frase', data: { ativa: f.ativa ? '1' : null } });
    const pintar = () => trocar(li,
      h('div', { class: 'frase-corpo' },
        h('p', { class: 'frase-texto' }, h('span', { class: 'apoio' }, nomeDoTipo(f.tipo) + ' '), h('q', null, f.frase)),
        h('p', { class: 'frase-vira' }, h('span', { class: 'apoio' }, 'vira '), marcaDaOrigem(f.vira || { rotulo: f.rotulo }), f.campanha_nome ? h('span', { class: 'apoio' }, ' · ' + f.campanha_nome) : null),
        linhaDosAcertos(f) ? h('p', { class: 'apoio' }, linhaDosAcertos(f)) : null),
      h('div', { class: 'frase-acoes' },
        f.ativa ? null : selo('neutro', 'Desligada'),
        h('button', { class: 'botao botao-quieto', type: 'button', on: { click: editar } }, 'Editar'),
        h('button', { class: 'botao botao-quieto', type: 'button', on: { click: alternar } }, f.ativa ? 'Desligar' : 'Ligar de novo')));
    async function alternar(e) {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        const r = f.ativa ? await ctx.api.apagar('api/origem/frases/' + encodeURIComponent(f.id)) : await ctx.api.gravar('api/origem/frases/' + encodeURIComponent(f.id), { ativa: true });
        Object.assign(f, r.frase || {});
        pintar();
        ctx.avisar(f.ativa ? 'Frase ligada de novo.' : 'Frase desligada. Os contatos que ela já marcou ficam como estão.');
        li.querySelector('.frase-acoes button:last-child').focus();
      } catch (erro) { b.disabled = false; ctx.avisar(fraseDoErro(erro)); }
    }
    function editar() {
      const edicao = formularioDeFrase(f, {
        aoSalvar: (nova) => { Object.assign(f, nova); pintar(); li.querySelector('.frase-acoes button').focus(); },
        aoCancelar: () => { pintar(); li.querySelector('.frase-acoes button').focus(); },
      });
      trocar(li, edicao.form);
      edicao.campos.frase.focus();
    }
    pintar();
    return li;
  }

  function formularioDeFrase(f, { aoSalvar = null, aoCancelar = null } = {}) {
    const ids = { frase: idNovo('of-frase'), tipo: idNovo('of-tipo'), canal: idNovo('of-canal'), campanha: idNovo('of-camp') };
    const campos = {
      frase: h('input', { id: ids.frase, name: 'frase', type: 'text', maxlength: '200', autocomplete: 'off', required: true }),
      tipo: h('select', { id: ids.tipo }, TIPOS.map((t) => h('option', { value: t.id }, t.rotulo))),
      canal: h('select', { id: ids.canal, 'data-destinos': '1' }),
      campanha: h('input', { id: ids.campanha, name: 'campanha_nome', type: 'text', maxlength: '120', autocomplete: 'off' }),
    };
    if (f) { campos.frase.value = f.frase || ''; campos.tipo.value = f.tipo || 'contem'; campos.campanha.value = f.campanha_nome || ''; }
    preencherSelect(campos.canal, f ? ((f.vira && f.vira.canal) || f.plataforma || '') : '');
    const enviar = h('button', { class: 'botao botao-forte', type: 'submit' }, f ? 'Salvar a frase' : 'Cadastrar a frase');
    const form = h('form', { class: 'frase-form', on: { submit: salvar } },
      h('label', { class: 'campo', for: ids.frase }, h('span', null, 'Frase'), campos.frase),
      h('div', { class: 'frase-form-linha' },
        h('label', { class: 'campo', for: ids.tipo }, h('span', null, 'Como aparece na mensagem'), campos.tipo),
        h('label', { class: 'campo', for: ids.canal }, h('span', null, 'Quem manda essa frase veio de'), campos.canal)),
      h('label', { class: 'campo', for: ids.campanha }, h('span', null, 'Campanha (se souber)'), campos.campanha),
      h('div', { class: 'frase-form-botoes' }, enviar, aoCancelar ? h('button', { class: 'botao botao-quieto', type: 'button', on: { click: aoCancelar } }, 'Cancelar') : null));
    form.addEventListener('keydown', (e) => { if (e.key === 'Escape' && aoCancelar) { e.preventDefault(); e.stopPropagation(); aoCancelar(); } });
    async function salvar(e) {
      e.preventDefault();
      for (const c of Object.values(campos)) erroNoCampo(c, null);
      if (campos.frase.value.trim().length < 2) { erroNoCampo(campos.frase, 'Escreva a frase.'); campos.frase.focus(); return; }
      if (!campos.canal.value) { erroNoCampo(campos.canal, 'Escolha de onde vem quem manda essa frase.'); campos.canal.focus(); return; }
      enviar.disabled = true;
      try {
        const corpo = { frase: campos.frase.value, tipo: campos.tipo.value, canal: campos.canal.value, campanha_nome: campos.campanha.value.trim() || null };
        const r = await ctx.api.gravar(f ? 'api/origem/frases/' + encodeURIComponent(f.id) : 'api/origem/frases', corpo);
        if (aoSalvar) aoSalvar(r.frase || corpo);
        else { ctx.avisar('Frase cadastrada. Os próximos contatos com ela já chegam com origem.'); form.reset(); await carregarFrases(); }
      } catch (erro) {
        const campo = campoDoErro(erro, campos) || campos.frase;
        erroNoCampo(campo, fraseDoErro(erro));
        campo.focus();
      } finally { enviar.disabled = false; }
    }
    return { form, campos };
  }
  function preencherSelect(select, atual) {
    trocar(select, h('option', { value: '' }, 'Escolha'), destinos.map((d) => h('option', { value: d.id }, d.rotulo)));
    select.value = destinos.some((d) => d.id === atual) ? atual : '';
  }
  function preencherDestinos() {
    for (const s of alvo.querySelectorAll('select[data-destinos]')) preencherSelect(s, s.value);
  }

  /* --- candidatas --- */
  async function carregarCandidatas() {
    const t = titulo('candidatas', 'Mensagens que se repetem e ainda não dizem a origem');
    trocar(partes.candidatas, t, h('p', { class: 'suave' }, 'Carregando…'));
    let d;
    try { d = await ctx.api.ler('api/origem/candidatas'); } catch (erro) { if (!saiu) trocar(partes.candidatas, t, h('p', { class: 'campo-erro' }, fraseDoErro(erro))); return; }
    if (saiu) return;
    const lista = Array.isArray(d.candidatas) ? d.candidatas : [];
    trocar(partes.candidatas, t,
      h('p', { class: 'apoio' }, 'Primeiras mensagens que apareceram 3 vezes ou mais nos últimos 6 meses. Se uma delas é de anúncio, vire-a frase.'),
      d.ligado === false ? h('p', { class: 'aviso-caixa' }, icone('info', 'icone-p'), h('span', null, d.aviso || 'Esta parte ainda não está ligada no banco.')) : null,
      lista.length ? h('ul', { class: 'candidatas' }, lista.map((c) => h('li', { class: 'candidata' },
        h('p', { class: 'candidata-texto' }, h('q', null, c.exemplo || c.frase || '')),
        h('p', { class: 'apoio' }, contagem(c.n, 'vez', 'vezes') + (c.ultima_em ? ', a última em ' + dataCurta(c.ultima_em) : '') + (c.sugestao && c.sugestao.rotulo ? '. Parece: ' + c.sugestao.rotulo : '') + '.'),
        h('button', { class: 'botao', type: 'button', on: { click: () => usar(c) } }, 'Usar como frase'))))
        : d.ligado === false ? null : h('p', { class: 'suave' }, 'Nenhuma mensagem repetida sem origem. Bom sinal.'));
  }
  function usar(c) {
    const detalhes = document.getElementById('o-frase-nova');
    if (!detalhes) return;
    detalhes.open = true;
    novaFrase.campos.frase.value = c.exemplo || c.frase || '';
    novaFrase.campos.tipo.value = 'contem';
    if (c.sugestao && c.sugestao.canal) novaFrase.campos.canal.value = c.sugestao.canal;
    detalhes.scrollIntoView({ block: 'center' });
    novaFrase.campos.frase.focus();
    ctx.avisar('A mensagem foi para o formulário de nova frase. Confira de onde ela vem e cadastre.');
  }

  /* --- testar uma mensagem --- */
  function montarTeste() {
    const id = idNovo('o-teste');
    const campo = h('textarea', { id, rows: '3', maxlength: '2000', placeholder: 'Cole aqui a primeira mensagem de um contato' });
    const saida = h('div', { class: 'teste-saida', 'aria-live': 'polite' });
    const botao = h('button', { class: 'botao', type: 'submit' }, 'Testar');
    trocar(partes.testar,
      titulo('testar', 'Testar uma mensagem'),
      h('p', { class: 'apoio' }, 'Veja que origem uma mensagem ganharia. Nada é gravado.'),
      h('form', { class: 'teste-form', on: { submit: async (e) => {
        e.preventDefault();
        erroNoCampo(campo, null);
        if (!campo.value.trim()) { erroNoCampo(campo, 'Cole uma mensagem para testar.'); campo.focus(); return; }
        botao.disabled = true;
        try {
          const r = await ctx.api.gravar('api/origem/testar', { mensagem: campo.value });
          trocar(saida, r.origem
            ? h('p', { class: 'teste-resultado' }, selo('bom', 'Reconhecida'), h('span', null, ' Viraria '), marcaDaOrigem(r.origem, { detalhe: true }),
              h('span', { class: 'apoio' }, ' ' + [r.origem.como_rotulo, r.rotulo ? '(' + r.rotulo + ')' : null, r.codigo ? 'código ' + r.codigo : null].filter(Boolean).join(' ') + '.'))
            : h('p', { class: 'teste-resultado' }, selo('atencao', 'Sem origem'), h('span', null, ' Nenhuma frase nem código reconhece esta mensagem: o contato chegaria como "Ainda não sabemos".')));
        } catch (erro) { erroNoCampo(campo, fraseDoErro(erro)); } finally { botao.disabled = false; }
      } } },
      h('label', { class: 'campo', for: id }, h('span', null, 'Mensagem'), campo), botao),
      saida);
  }

  /* --- reaplicar no passado --- */
  function montarReaplicar() {
    const id = idNovo('o-desde');
    const hoje = new Date();
    const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const campo = h('input', { id, name: 'desde', type: 'date', min: '2024-01-01', max: iso(hoje), value: iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 30)) });
    const saida = h('div', { class: 'reaplicar-saida', 'aria-live': 'polite' });
    const simular = h('button', { class: 'botao', type: 'submit' }, 'Simular');
    trocar(partes.reaplicar,
      titulo('reaplicar', 'Reaplicar no passado'),
      h('p', { class: 'apoio' }, 'Passa as frases e os códigos nos contatos antigos. Primeiro simula e mostra quantos mudariam; só muda depois que você confirmar. Contato com origem marcada à mão não muda.'),
      h('form', { class: 'reaplicar-form', on: { submit: async (e) => {
        e.preventDefault();
        erroNoCampo(campo, null);
        simular.disabled = true;
        trocar(saida, h('p', { class: 'suave' }, 'Simulando…'));
        try {
          const r = await ctx.api.gravar('api/origem/reaplicar', { desde: campo.value, simular: true });
          pintarSimulacao(r);
        } catch (erro) { trocar(saida); erroNoCampo(campo, fraseDoErro(erro)); } finally { simular.disabled = false; }
      } } },
      h('label', { class: 'campo', for: id }, h('span', null, 'Contatos criados desde'), campo), simular),
      saida);
    function pintarSimulacao(r) {
      const mudariam = ehNumero(r.mudariam) ? r.mudariam : 0;
      if (!mudariam) { trocar(saida, h('p', { class: 'teste-resultado' }, selo('neutro', 'Nada mudaria'), h('span', null, ' Dos ' + inteiro(r.analisados) + ' contatos desde ' + dataCurta(r.desde) + ', nenhum ganharia origem nova.'))); return; }
      const aplicar = h('button', { class: 'botao botao-forte', type: 'button' }, 'Aplicar nos ' + inteiro(mudariam) + ' contatos');
      const cancelar = h('button', { class: 'botao botao-quieto', type: 'button', on: { click: () => { trocar(saida, h('p', { class: 'suave' }, 'Nada foi mudado.')); simular.focus(); } } }, 'Não aplicar');
      aplicar.addEventListener('click', async () => {
        aplicar.disabled = true; cancelar.disabled = true;
        try {
          const a = await ctx.api.gravar('api/origem/reaplicar', { desde: r.desde, simular: false });
          ctx.leitor.esquecer('api/');
          trocar(saida, h('p', { class: 'teste-resultado' }, selo('bom', 'Aplicado'), h('span', null, ' ' + contagem(a.mudaram, 'contato ganhou origem', 'contatos ganharam origem') + '.')));
          focar(saida.firstChild);
        } catch (erro) {
          trocar(saida, h('p', { class: 'campo-erro', role: 'alert' }, fraseDoErro(erro)));
          if (erro && erro.codigo === 'simule_primeiro') saida.appendChild(h('p', { class: 'apoio' }, 'Clique em Simular de novo.'));
        }
      });
      trocar(saida,
        h('p', { class: 'reaplicar-total' }, 'Dos ', h('strong', null, inteiro(r.analisados)), ' contatos desde ' + dataCurta(r.desde) + ', ', h('strong', null, inteiro(mudariam)), ' ganhariam origem:'),
        h('table', { class: 'reaplicar-tabela' },
          h('caption', { class: 'so-leitor' }, 'Quantos mudariam, por origem'),
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Passaria a ser'), h('th', { scope: 'col' }, 'Contatos'))),
          h('tbody', null, (r.por_origem || []).map((o) => h('tr', null, h('th', { scope: 'row' }, o.rotulo), h('td', null, inteiro(o.n)))))),
        r.aplicar_ate ? h('p', { class: 'apoio' }, 'Esta simulação vale até ' + hora(r.aplicar_ate) + '.') : null,
        h('div', { class: 'reaplicar-botoes' }, aplicar, cancelar));
      aplicar.focus();
    }
  }

  /* --- mensagem pronta por anúncio --- */
  function montarMensagem() {
    const ids = { rotulo: idNovo('om-rotulo'), plataforma: idNovo('om-plat'), campanha: idNovo('om-camp'), texto: idNovo('om-texto') };
    const campos = {
      rotulo: h('input', { id: ids.rotulo, name: 'rotulo', type: 'text', maxlength: '80', autocomplete: 'off', required: true, placeholder: 'Ex.: Anúncio troca de óleo novembro' }),
      plataforma: h('select', { id: ids.plataforma }, h('option', { value: 'meta' }, 'Anúncio da Meta'), h('option', { value: 'google' }, 'Anúncio do Google'), h('option', { value: '' }, 'Não é anúncio (bio, cartaz, panfleto)')),
      campanha: h('input', { id: ids.campanha, name: 'campanha_nome', type: 'text', maxlength: '120', autocomplete: 'off' }),
      texto: h('input', { id: ids.texto, name: 'texto', type: 'text', maxlength: '300', autocomplete: 'off', placeholder: 'Olá! Quero saber mais.' }),
    };
    const saida = h('div', { class: 'mensagem-saida' });
    const gerar = h('button', { class: 'botao botao-forte', type: 'submit' }, 'Criar a mensagem');
    trocar(partes.mensagem,
      titulo('mensagem', 'Mensagem pronta por anúncio'),
      h('p', { class: 'apoio' }, 'Cada anúncio ganha sua mensagem com um código curto no fim. Quem toca no anúncio manda essa mensagem, e o Tráfego sabe na hora de qual anúncio veio. Use no botão do anúncio de WhatsApp, no link da bio ou num cartaz com o QR.'),
      h('form', { class: 'mensagem-form', on: { submit: async (e) => {
        e.preventDefault();
        for (const c of Object.values(campos)) erroNoCampo(c, null);
        if (campos.rotulo.value.trim().length < 3) { erroNoCampo(campos.rotulo, 'Dê um nome para reconhecer esta mensagem (pelo menos 3 letras).'); campos.rotulo.focus(); return; }
        gerar.disabled = true;
        try {
          const r = await ctx.api.gravar('api/origem/link', {
            rotulo: campos.rotulo.value.trim(), ...(campos.plataforma.value ? { plataforma: campos.plataforma.value } : { paga: false }),
            campanha_nome: campos.campanha.value.trim() || undefined, texto: campos.texto.value.trim() || undefined,
          });
          pintarMensagem(r);
        } catch (erro) {
          const campo = campoDoErro(erro, campos) || campos.rotulo;
          erroNoCampo(campo, fraseDoErro(erro)); campo.focus();
        } finally { gerar.disabled = false; }
      } } },
      h('div', { class: 'frase-form-linha' },
        h('label', { class: 'campo', for: ids.rotulo }, h('span', null, 'Nome do anúncio'), campos.rotulo),
        h('label', { class: 'campo', for: ids.plataforma }, h('span', null, 'Onde vai ser usada'), campos.plataforma)),
      h('div', { class: 'frase-form-linha' },
        h('label', { class: 'campo', for: ids.campanha }, h('span', null, 'Campanha (se souber)'), campos.campanha),
        h('label', { class: 'campo', for: ids.texto }, h('span', null, 'Texto da mensagem (opcional)'), campos.texto)),
      gerar),
      saida);
    function pintarMensagem(r) {
      const codigo = r.frase && r.frase.codigo;
      const qr = r.qr_svg ? h('img', { class: 'mensagem-qr', src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.qr_svg), alt: 'QR code que abre o WhatsApp da oficina com esta mensagem', width: '200', height: '200' }) : null;
      const cartao = h('article', { class: 'mensagem-pronta', 'aria-labelledby': 'om-pronta-t', tabindex: '-1' },
        h('h4', { class: 'titulo-p', id: 'om-pronta-t' }, (r.frase && r.frase.rotulo) || 'Mensagem pronta'),
        h('div', { class: 'mensagem-pronta-corpo' },
          h('div', { class: 'mensagem-pronta-textos' },
            h('p', { class: 'apoio' }, 'Mensagem'),
            h('p', { class: 'caixa-codigo' }, r.texto || ''),
            h('div', { class: 'mensagem-botoes' }, botaoCopiar(ctx, r.texto || '', { rotulo: 'Copiar a mensagem', aviso: 'Mensagem copiada.' })),
            r.link_whatsapp ? [
              h('p', { class: 'apoio' }, 'Link do WhatsApp'),
              h('p', { class: 'caixa-codigo caixa-link' }, r.link_whatsapp),
              h('div', { class: 'mensagem-botoes' }, botaoCopiar(ctx, r.link_whatsapp, { rotulo: 'Copiar o link', aviso: 'Link copiado.' }))] : h('p', { class: 'aviso-caixa' }, icone('info', 'icone-p'), h('span', null, r.aviso || 'Falta o telefone da oficina no cadastro: sem ele não sai o link nem o QR.'))),
          qr ? h('figure', { class: 'mensagem-qr-caixa' }, qr,
            h('figcaption', { class: 'apoio' }, 'Código ' + (codigo || '')),
            h('div', { class: 'mensagem-botoes' },
              h('button', { class: 'botao', type: 'button', on: { click: () => salvarArquivo(new Blob([r.qr_svg], { type: 'image/svg+xml' }), 'qr-' + (codigo || 'mensagem') + '.svg') } }, icone('baixar'), 'Baixar o QR'),
              h('button', { class: 'botao', type: 'button', on: { click: () => imprimir(cartao) } }, icone('imprimir'), 'Imprimir'))) : null));
      trocar(saida, cartao);
      focar(cartao);
    }
  }
  function imprimir(no) {
    const raiz = document.documentElement;
    no.dataset.imprimir = '1';
    raiz.classList.add('imprimindo-um');
    const fim = () => { raiz.classList.remove('imprimindo-um'); delete no.dataset.imprimir; window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    window.print();
    setTimeout(fim, 1000);
  }

  /* --- rastreio do site --- */
  async function carregarRastreio() {
    const t = titulo('rastreio', 'Rastreio do site');
    trocar(partes.rastreio, t, h('p', { class: 'suave' }, 'Carregando…'));
    let d;
    try { d = await ctx.api.ler('api/origem/rastreio'); } catch (erro) { if (!saiu) trocar(partes.rastreio, t, h('p', { class: 'campo-erro' }, fraseDoErro(erro))); return; }
    if (saiu) return;
    trocar(partes.rastreio, t,
      h('p', { class: 'teste-resultado' }, d.instalado_no_site ? selo('bom', 'Funcionando') : selo('neutro', 'Nenhuma visita em 30 dias'),
        h('span', { class: 'apoio' }, d.instalado_no_site
          ? ' Última visita ' + (d.ultima_visita ? haQuanto(d.ultima_visita) : 'sem data') + (ehNumero(d.visitas_7d) ? '. ' + contagem(d.visitas_7d, 'visita', 'visitas') + ' e ' + contagem(d.cliques_7d || 0, 'clique', 'cliques') + ' no WhatsApp em 7 dias.' : '.')
          : ' Cole a linha abaixo no site (antes de fechar o </body>) para saber quem veio pelo site.')),
      d.script ? [
        h('p', { class: 'apoio' }, 'Linha para colar em qualquer site da oficina'),
        h('p', { class: 'caixa-codigo' }, d.script),
        botaoCopiar(ctx, d.script, { rotulo: 'Copiar a linha', aviso: 'Linha copiada. Cole no site, antes de fechar o </body>.' })] : null,
      tabelaDePaginas(d.por_pagina));
  }

  carregarFrases();
  carregarCandidatas();
  montarTeste();
  montarReaplicar();
  montarMensagem();
  carregarRastreio();
  if (parte && partes[parte]) setTimeout(() => { if (!saiu) irPara(parte); }, 300);
  return { sair() { saiu = true; }, parte: (p) => { if (p && partes[p]) irPara(p); } };
}

/** "23 contatos reconhecidos, o último ontem." Sem a contagem, só a data; sem nada, nada (nunca uma linha que começa com vírgula). */
export function linhaDosAcertos(f) {
  const partes = [];
  if (ehNumero(f.acertos)) partes.push(contagem(f.acertos, 'contato reconhecido', 'contatos reconhecidos'));
  const quando = f.ultimo_acerto_em ? haQuanto(f.ultimo_acerto_em) : null;
  if (quando) partes.push((partes.length ? 'o último ' : 'Último contato reconhecido ') + quando);
  return partes.length ? partes.join(', ') + '.' : null;
}

/** "/" é a página inicial; o resto aparece como o endereço da página. */
export const nomeDaPagina = (p) => (!p || p === '/' ? 'Página inicial' : String(p));

/** Páginas mais visitadas nos 7 dias (os mesmos das visitas e cliques do topo); a coluna de cliques some se o servidor não mandar. */
export function tabelaDePaginas(lista) {
  if (!Array.isArray(lista) || !lista.length) return null;
  const comCliques = lista.some((p) => ehNumero(p.cliques));
  return h('table', { class: 'reaplicar-tabela rastreio-paginas' },
    h('caption', { class: 'apoio' }, 'Páginas mais visitadas nos últimos 7 dias'),
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Página'), h('th', { scope: 'col' }, 'Visitas'), comCliques ? h('th', { scope: 'col' }, 'Cliques no WhatsApp') : null)),
    h('tbody', null, lista.map((p) => h('tr', null, h('th', { scope: 'row' }, nomeDaPagina(p.pagina)), h('td', null, inteiro(p.n)),
      comCliques ? h('td', null, ehNumero(p.cliques) ? inteiro(p.cliques) : '') : null))));
}

const titulo = (id, texto) => h('h3', { class: 'titulo-p', id: 'o-' + id + '-t', tabindex: '-1' }, texto);
/** O campo que o servidor apontou no erro (`campo` no corpo, ou o `codigo` quando ele é o nome do campo). */
function campoDoErro(erro, campos) {
  if (!erro) return null;
  const nome = (erro.corpo && erro.corpo.campo) || erro.codigo;
  return nome && Object.prototype.hasOwnProperty.call(campos, nome) ? campos[nome] : null;
}
