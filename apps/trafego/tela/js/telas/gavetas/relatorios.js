/* ============================================================================
   Gaveta "Relatórios" (API-base.md › /api/relatorios/*).
   Texto pronto para o WhatsApp (dia, semana ou mês) com copiar: nada sai
   sozinho. A folha A4 do mês e o modo apresentação abrem em telas próprias
   (#/folha?mes=AAAA-MM e #/apresentacao).
   ============================================================================ */

import { h, icone, trocar } from '../../dom.js';
import { botaoCopiar } from '../../pecas.js';
import { fraseDoErro } from '../estados.js';
import { mesesParaEscolher, mesPassado } from '../../relatorios-logica.js';

const TIPOS = [
  { id: 'diario', rotulo: 'Dia', apoio: 'ontem' },
  { id: 'semanal', rotulo: 'Semana', apoio: 'os 7 dias até ontem' },
  { id: 'mensal', rotulo: 'Mês', apoio: 'um mês inteiro' },
];

let seq = 0;

export function montar(ctx, alvo) {
  let saiu = false;
  let pedido = 0;
  const n = ++seq;
  const meses = mesesParaEscolher(new Date());
  let tipo = 'semanal';
  let mes = mesPassado(new Date());

  /* --- texto para o WhatsApp --- */
  const saida = h('div', { class: 'relatorio-saida', 'aria-live': 'polite', 'aria-busy': 'false' });
  const grupo = 'rel-tipo-' + n;
  const idMes = 'rel-mes-' + n;
  const selMes = h('select', { id: idMes, on: { change: () => { mes = selMes.value; carregar(); } } },
    meses.slice(1).map((m) => h('option', { value: m.id }, m.rotulo)));
  selMes.value = mes;
  const campoMes = h('label', { class: 'campo relatorio-mes', for: idMes, hidden: tipo !== 'mensal' }, h('span', null, 'Qual mês'), selMes);
  const tipos = h('fieldset', { class: 'opcoes opcoes-linha' },
    h('legend', { class: 'campo-rotulo' }, 'Relatório de'),
    TIPOS.map((t) => h('label', { class: 'opcao' },
      h('input', { type: 'radio', name: grupo, value: t.id, checked: t.id === tipo || null, on: { change: () => { tipo = t.id; campoMes.hidden = tipo !== 'mensal'; carregar(); } } }),
      h('span', null, h('span', { class: 'opcao-texto' }, t.rotulo), h('span', { class: 'apoio' }, t.apoio)))));

  async function carregar() {
    const minha = ++pedido;
    saida.setAttribute('aria-busy', 'true');
    // Enquanto o texto novo não chega, o anterior não pode ser copiado: antes dava para trocar para "Dia"
    // e copiar o da semana sem perceber (o título ainda dizia "semana").
    for (const b of saida.querySelectorAll('button')) b.disabled = true;
    const tituloAntigo = saida.querySelector('.relatorio-titulo');
    if (tituloAntigo) tituloAntigo.textContent = 'Buscando o relatório…';
    let r;
    try {
      r = await ctx.api.ler('api/relatorios/texto?tipo=' + tipo + (tipo === 'mensal' ? '&mes=' + encodeURIComponent(mes) : ''));
    } catch (erro) {
      if (saiu || minha !== pedido) return;
      saida.setAttribute('aria-busy', 'false');
      // Antes ficava só a frase do erro: para tentar de novo era preciso trocar de relatório e voltar.
      trocar(saida, h('p', { class: 'campo-erro' }, fraseDoErro(erro)),
        h('div', { class: 'relatorio-botoes' }, h('button', { class: 'botao', type: 'button', on: { click: carregar } }, icone('atualizar'), 'Tentar de novo')));
      return;
    }
    if (saiu || minha !== pedido) return;
    saida.setAttribute('aria-busy', 'false');
    const texto = String(r && r.texto || '');
    const semConta = r && r.estado && r.estado.gasto === 'sem_conta';
    trocar(saida,
      h('p', { class: 'relatorio-titulo' }, r && r.titulo ? r.titulo : 'Relatório'),
      h('pre', { class: 'relatorio-texto', tabindex: '0', 'aria-label': 'Texto do relatório' }, texto),
      h('div', { class: 'relatorio-botoes' }, botaoCopiar(ctx, texto, { rotulo: 'Copiar o texto', classe: 'botao botao-forte', aviso: 'Texto copiado. Cole no WhatsApp de quem precisa ver.' })),
      semConta ? h('p', { class: 'apoio' }, 'Sem conta de anúncios ligada, o texto fala só do lado da oficina: nenhum gasto inventado.') : null);
  }

  /* --- folha do mês --- */
  const idFolha = 'rel-folha-' + n;
  const selFolha = h('select', { id: idFolha, on: { change: () => linkFolha.setAttribute('href', ctx.hrefDaTela('folha', { mes: selFolha.value })) } },
    meses.map((m) => h('option', { value: m.id }, m.rotulo)));
  const linkFolha = h('a', { class: 'botao', href: ctx.hrefDaTela('folha', { mes: meses[0].id }) }, icone('imprimir'), 'Abrir a folha');

  /* --- apresentação --- */
  const periodo = ctx.periodo && ctx.periodo !== 'mes' ? { periodo: ctx.periodo } : {};
  const linkApresentacao = h('a', { class: 'botao', href: ctx.hrefDaTela('apresentacao', periodo) }, icone('tela-cheia'), 'Abrir o modo apresentação');

  trocar(alvo,
    h('section', { class: 'relatorio-bloco', 'aria-labelledby': 'rel-texto-t-' + n },
      h('h3', { class: 'titulo-p', id: 'rel-texto-t-' + n }, 'Texto para o WhatsApp'),
      h('p', { class: 'apoio' }, 'O resumo pronto, do jeito que fica bom no WhatsApp. Nada é enviado sozinho: você copia e manda para quem precisa ver.'),
      h('div', { class: 'relatorio-escolha' }, tipos, campoMes),
      saida),
    h('section', { class: 'relatorio-bloco', 'aria-labelledby': 'rel-folha-t-' + n },
      h('h3', { class: 'titulo-p', id: 'rel-folha-t-' + n }, 'Folha do mês para imprimir'),
      h('p', { class: 'apoio' }, 'Uma página A4, preto no branco: os números do mês, de onde vieram os contatos e as campanhas. Boa para a reunião ou para guardar.'),
      h('div', { class: 'relatorio-linha' }, h('label', { class: 'campo', for: idFolha }, h('span', null, 'Mês'), selFolha), linkFolha)),
    h('section', { class: 'relatorio-bloco', 'aria-labelledby': 'rel-apres-t-' + n },
      h('h3', { class: 'titulo-p', id: 'rel-apres-t-' + n }, 'Modo apresentação'),
      h('p', { class: 'apoio' }, 'Tela cheia com os números grandes, para a TV da oficina ou para mostrar ao sócio. Passa sozinho ou com as setas do teclado.'),
      linkApresentacao));

  carregar();
  return { sair() { saiu = true; } };
}
