/* ============================================================================
   Metas (Ajustes, rodada 11): quatro números, sem explicação longa.
   GET/POST /api/config. Campo vazio = "ainda não sei" (o servidor guarda nulo);
   a margem de 100% é o "em branco" antigo do servidor e aparece vazia.
   ============================================================================ */

import { h, trocar, focar } from '../../dom.js';
import { ehNumero, lerDinheiro, numero } from '../../formato.js';
import { erroNoCampo } from '../../pecas.js';
import { fraseDoErro } from '../estados.js';

export const CAMPOS = [
  { id: 'orcamento_mensal', rotulo: 'Verba do mês para anúncios', tipo: 'dinheiro' },
  { id: 'cpa_alvo', rotulo: 'Quanto vale pagar por um contato', tipo: 'dinheiro' },
  { id: 'ticket_medio', rotulo: 'Valor médio de um serviço', tipo: 'dinheiro' },
  { id: 'margem_pct', rotulo: 'Margem da oficina', tipo: 'porcento' },
];

const margemCadastrada = (m) => ehNumero(m) && m > 0 && m < 100;

/** Valor guardado → texto do campo. */
export function paraCampo(v, tipo) {
  if (!ehNumero(v)) return '';
  if (tipo === 'porcento' && !margemCadastrada(v)) return '';
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

let seq = 0;

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
      const input = h('input', { id, name: c.id, type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'em branco' });
      input.value = paraCampo(cfg[c.id], c.tipo);
      campos[c.id] = input;
      return h('div', { class: 'meta-linha' },
        h('label', { class: 'campo', for: id },
          h('span', null, c.rotulo),
          h('span', { class: 'entrada-valor entrada-' + c.tipo },
            h('span', { 'aria-hidden': 'true' }, c.tipo === 'porcento' ? '%' : 'R$'),
            input)));
    });
    const salvar = h('button', { class: 'botao botao-forte', type: 'submit' }, 'Salvar metas');
    trocar(alvo, h('form', { class: 'metas-form', novalidate: true, on: { submit: enviar } }, linhas, h('div', { class: 'metas-botoes' }, salvar)));

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
        ctx.avisar('Metas salvas.');
        pintar(novo && typeof novo === 'object' ? novo : { ...cfg, ...corpo });
        focar(alvo.querySelector('.metas-botoes .botao'));
      } catch (erro) {
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
