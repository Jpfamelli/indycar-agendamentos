/* ============================================================================
   Tela Campanhas (rodada 11): uma lista simples. Campanha, gasto, contatos,
   clientes e custo por cliente, com selo Boa / Atenção / Ruim. O resto fica
   atrás de um único "Ver detalhes". GET api/campanhas.
   ============================================================================ */

import { h, trocar } from '../dom.js';
import { dinheiro, inteiro, ehNumero } from '../formato.js';
import { selo, vazio } from '../pecas.js';
import { seloDaCampanha, ordenarCampanhas } from '../resumo-logica.js';
import * as Estados from './estados.js';
import { periodos } from './periodo.js';

const PLATAFORMA = { meta: 'Meta', google: 'Google' };

export function mostrar(ctx) {
  Estados.buscar(ctx, 'api/campanhas?periodo=' + ctx.periodo, { forma: 'lista', pintar: (d) => pintar(ctx, d) });
  return null;
}

const valor = (texto) => (texto ? h('span', { class: 'c-valor' }, texto) : h('span', { class: 'c-valor c-sem' }, 'sem dado'));

function campanha(c) {
  const s = seloDaCampanha(c);
  const linha = (rotulo, texto) => h('div', { class: 'c-dado' }, h('dt', null, rotulo), h('dd', null, valor(texto)));
  const detalhes = [
    c.leitura && c.leitura.texto ? h('p', null, c.leitura.texto) : null,
    h('dl', { class: 'c-mais' },
      linha('Agendaram', inteiro(c.agendaram)),
      linha('Vieram', inteiro(c.vieram)),
      linha('Faturado', dinheiro(c.faturado)),
      linha('Custo por contato', dinheiro(c.custo_por_contato)),
      ehNumero(c.retorno) ? linha('Cada R$ 1 virou', dinheiro(c.retorno, { centavos: true })) : null),
  ];
  return h('li', { class: 'c-item' },
    h('div', { class: 'c-cab' },
      h('div', { class: 'c-nome' },
        h('h2', null, c.nome || 'Campanha sem nome'),
        h('span', { class: 'c-onde' }, [PLATAFORMA[c.plataforma] || 'Anúncio', c.situacao === 'pausada' ? 'pausada' : null].filter(Boolean).join(' · '))),
      s ? selo(s[0], s[1]) : null),
    h('dl', { class: 'c-numeros' },
      linha('Gasto', dinheiro(c.gasto, { centavos: false })),
      linha('Contatos', inteiro(c.contatos)),
      linha('Clientes', inteiro(c.fecharam)),
      linha('Custo por cliente', dinheiro(c.custo_por_servico, { centavos: false }))),
    h('details', { class: 'camp-detalhes' }, h('summary', null, 'Ver detalhes'), detalhes));
}

function pintar(ctx, d) {
  const estado = d.estado || {};
  ctx.demo(Boolean(estado.demo));
  const lista = ordenarCampanhas(d.campanhas);
  trocar(ctx.miolo,
    h('header', { class: 'r-cab' }, h('h1', { class: 'ic-titulo' }, 'Campanhas'), periodos(ctx)),
    lista.length
      ? h('ul', { class: 'c-lista' }, lista.map(campanha))
      : vazio({ titulo: 'Nenhuma campanha neste período', texto: estado.gasto === 'sem_conta' ? 'Ligue a conta de anúncios em Ajustes para as campanhas aparecerem aqui.' : null }));
}
