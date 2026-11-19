/* ============================================================================
   Gaveta "Metas e verba" (GET/POST /api/config, rota antiga que continua valendo).
   Quatro números, cada um com uma frase dizendo para que serve. Campo vazio =
   "ainda não sei" (o servidor guarda nulo); a margem vazia o servidor guarda como 100%,
   que não é margem de oficina: a tela mostra em branco e faz a conta com a premissa de 45%,
   a mesma régua do servidor (motor/campanhas.js, reguaDoRetorno).
   ============================================================================ */

import { h, trocar, focar } from '../../dom.js';
import { dinheiro, ehNumero, lerDinheiro, numero } from '../../formato.js';
import { erroNoCampo } from '../../pecas.js';
import { fraseDoErro } from '../estados.js';

export const CAMPOS = [
  { id: 'orcamento_mensal', rotulo: 'Verba do mês para anúncios', tipo: 'dinheiro',
    para: 'O Tráfego avisa quando o gasto do mês passa do ritmo desta verba e não propõe aumento acima dela.' },
  { id: 'cpa_alvo', rotulo: 'Quanto vale pagar por um contato', tipo: 'dinheiro',
    para: 'Campanha que fica acima deste custo por contato aparece como "Atenção" na classificação.' },
  { id: 'ticket_medio', rotulo: 'Valor médio de um serviço', tipo: 'dinheiro',
    para: 'Usado quando um serviço fechado ainda não tem valor lançado, para estimar o retorno.' },
  { id: 'margem_pct', rotulo: 'Margem da oficina', tipo: 'porcento',
    para: 'Quanto de cada serviço sobra depois das peças e da mão de obra. Com ela, o retorno mostra o que sobrou, não só o que entrou.' },
];

/** Margem que o servidor usa quando a oficina não cadastrou (nula, 0 ou 100%). */
export const MARGEM_PREMISSA = 45;
const margemCadastrada = (m) => ehNumero(m) && m > 0 && m < 100;

/** Valor guardado → texto do campo. */
export function paraCampo(v, tipo) {
  if (!ehNumero(v)) return '';
  if (tipo === 'porcento' && !margemCadastrada(v)) return '';   // 100% é o "em branco" antigo do servidor
  if (tipo === 'porcento') return numero(v, Number.isInteger(v) ? 0 : 1);
  return numero(v, Number.isInteger(v) ? 0 : 2);
}

/** Texto do campo → valor para gravar (null = em branco). Devolve { valor } ou { erro }. */
export function doCampo(texto, tipo) {
  const t = String(texto == null ? '' : texto).trim();
  if (!t) return { valor: null };
  if (tipo === 'porcento') {
    const n = Number(t.replace('%', '').replace(',', '.').trim());
    if (!Number.isFinite(n) || n < 0 || n > 100) return { erro: 'Use um número de 0 a 100.' };
    return { valor: Math.round(n * 10) / 10 };
  }
  const n = lerDinheiro(t);
  if (n === null || n < 0) return { erro: 'Escreva um valor em reais, por exemplo 1.500 ou 45,90.' };
  return { valor: n };
}

/** A conta que o dono faz de cabeça: quanto sobra de um serviço e quanto dá para pagar por contato. */
export function contaDeCabeca(cfg) {
  const premissa = !margemCadastrada(cfg.margem_pct);
  const margem = premissa ? MARGEM_PREMISSA : cfg.margem_pct;
  const frases = [];
  if (premissa) frases.push('Sem margem cadastrada, o Tráfego faz as contas com ' + MARGEM_PREMISSA + '%, uma premissa.');
  if (ehNumero(cfg.ticket_medio)) {
    frases.push('Com ' + dinheiro(cfg.ticket_medio) + ' por serviço e ' + numero(margem, Number.isInteger(margem) ? 0 : 1) + '% de margem, cada serviço fechado deixa ' + dinheiro(cfg.ticket_medio * margem / 100) + '.');
  }
  // A régua da classificação (a mesma do servidor): abaixo de 1/margem a campanha não se paga; acima de 2/margem é boa.
  frases.push('Uma campanha se paga quando cada R$ 1 em anúncio vira mais de ' + dinheiro(100 / margem, { centavos: true }) + ' em serviço fechado; acima de ' + dinheiro(200 / margem, { centavos: true }) + ' ela é boa.');
  return frases.join(' ');
}

let seq = 0;

/** Erro do campo de valor: a frase fica embaixo da caixa com o "R$", não dentro dela. */
function erroMeta(input, texto) {
  const id = input.id + '-erro';
  const velha = document.getElementById(id);
  if (velha) velha.remove();
  erroNoCampo(input, texto);
  const msg = document.getElementById(id);
  if (msg) input.parentElement.insertAdjacentElement('afterend', msg);
}

export function montar(ctx, alvo) {
  let saiu = false;
  trocar(alvo, h('p', { class: 'suave' }, 'Carregando…'));
  (async () => {
    let cfg;
    try { cfg = await ctx.api.ler('api/config'); } catch (erro) { if (!saiu) trocar(alvo, h('p', { class: 'campo-erro' }, fraseDoErro(erro))); return; }
    if (saiu) return;
    pintar(cfg || {});
  })();

  function pintar(cfg) {
    const campos = {};
    const linhas = CAMPOS.map((c) => {
      const id = 'meta-' + c.id + '-' + (++seq);
      const idPara = id + '-para';
      const input = h('input', { id, name: c.id, type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-describedby': idPara, placeholder: c.tipo === 'porcento' ? 'em branco, 45' : null });
      input.value = paraCampo(cfg[c.id], c.tipo);
      campos[c.id] = input;
      return h('div', { class: 'meta-linha' },
        h('label', { class: 'campo', for: id },
          h('span', null, c.rotulo),
          h('span', { class: 'entrada-valor entrada-' + c.tipo },
            h('span', { 'aria-hidden': 'true' }, c.tipo === 'porcento' ? '%' : 'R$'),
            input)),
        h('p', { class: 'apoio meta-para', id: idPara }, c.para));
    });
    const conta = h('p', { class: 'meta-conta', 'aria-live': 'polite' }, contaDeCabeca(cfg) || '');
    const salvar = h('button', { class: 'botao botao-forte', type: 'submit' }, 'Salvar metas e verba');
    const form = h('form', { class: 'metas-form', novalidate: true, on: { submit: enviar, input: () => {
      const rascunho = {};
      for (const c of CAMPOS) { const r = doCampo(campos[c.id].value, c.tipo); rascunho[c.id] = r.erro ? null : r.valor; }
      conta.textContent = contaDeCabeca(rascunho) || '';
    } } },
      h('p', { class: 'apoio' }, 'Em branco quer dizer "ainda não sei": o Tráfego não inventa o número.'),
      linhas, conta, h('div', { class: 'metas-botoes' }, salvar));
    trocar(alvo, form);

    async function enviar(e) {
      e.preventDefault();
      const corpo = {};
      let primeiro = null;
      for (const c of CAMPOS) {
        erroMeta(campos[c.id], null);
        const r = doCampo(campos[c.id].value, c.tipo);
        if (r.erro) { erroMeta(campos[c.id], r.erro); primeiro = primeiro || campos[c.id]; continue; }
        corpo[c.id] = r.valor;
      }
      if (primeiro) { primeiro.focus(); return; }
      salvar.disabled = true;
      try {
        const novo = await ctx.api.gravar('api/config', corpo);
        ctx.leitor.esquecer('api/');
        ctx.avisar('Metas e verba salvas.');
        pintar(novo && typeof novo === 'object' ? novo : { ...cfg, ...corpo });
        focar(alvo.querySelector('.metas-botoes .botao'));
      } catch (erro) {
        // O servidor antigo responde "orcamento_mensal: informe um número…": nunca mostrar o nome técnico.
        const alvoErro = CAMPOS.find((c) => String(erro && erro.message || '').startsWith(c.id));
        const campo = alvoErro ? campos[alvoErro.id] : campos.orcamento_mensal;
        erroMeta(campo, alvoErro ? (alvoErro.tipo === 'porcento' ? 'Use um número de 0 a 100.' : 'Esse valor não foi aceito. Escreva um valor em reais, sem sinal de menos.') : fraseDoErro(erro));
        campo.focus();
        salvar.disabled = false;
      }
    }
  }
  return { sair() { saiu = true; } };
}

