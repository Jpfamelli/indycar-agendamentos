'use strict';
/* Leads inventados para o mock da aba Leads (rodada 5). Nomes e telefones
   fabricados; passa pelo leads.js REAL (montarLinha, filtrar, resumo, csv). */
const L = require('../leads.js');
const { RESP } = require('./coorte-demo.cjs');

const NOMES = ['Marcos Pereira', 'Juliana Costa', 'Rafael Nunes', 'Camila Rocha', 'Eduardo Lima', 'Patrícia Alves', 'Thiago Mendes', 'Fernanda Souza', 'Bruno Carvalho', 'Letícia Martins'];
const CARROS = ['Onix 2019', 'HB20 2021', 'Corolla 2018', 'Gol 2016', 'Compass 2022', 'Civic 2017', 'Kwid 2020', 'Strada 2023'];
const SERVICOS = ['Revisão', 'Troca de óleo', 'Suspensão', 'Freios', 'Diagnóstico digital', 'Alinhamento'];
const CAMPANHAS = { meta: ['[Meta] Revisão + Troca de Óleo — Taubaté', '[Meta] Suspensão e Alinhamento'], google: ['[Search] troca de óleo taubaté', '[Search] oficina mecânica perto de mim'] };
const ORIGENS = ['meta', 'google', 'whatsapp', 'site', 'google', 'meta', 'indicacao', 'whatsapp', 'organico', 'meta'];
const STATUS = ['novo', 'contato', 'agendado', 'concluido', 'orcamento', 'perdido', 'agendado', 'contato', 'concluido', 'novo'];
const NOMES_RESP = new Map([[RESP[0], { nome: 'Ana Souza', ativo: true }], [RESP[1], { nome: 'Beto Lima', ativo: true }], [RESP[2], { nome: 'Carla Dias', ativo: false }]]);

/** Leads crus (como viriam do banco) de um período, 4 a 7 por dia. */
function brutos(de, ate, vazio = false) {
  if (vazio) return [];
  const saida = [];
  let n = 0;
  for (let t = Date.parse(`${de}T12:00:00Z`); t <= Date.parse(`${ate}T12:00:00Z`); t += 86400000) {
    const dia = Math.round(t / 86400000), qtd = 4 + (dia % 4);
    for (let i = 0; i < qtd; i++) {
      const k = (dia * 3 + i) % 10, origem = ORIGENS[k];
      const hora = 8 + ((dia + i * 3) % 10), min = (i * 17) % 60;
      const criado = new Date(Date.parse(`${new Date(t).toISOString().slice(0, 10)}T${String(hora).padStart(2, '0')}:${String(min).padStart(2, '0')}:00-03:00`));
      const status = STATUS[(k + dia) % 10];
      saida.push({
        id: `lead-${dia}-${i}`, cliente_id: `cli-${dia}-${i}`, responsavel_id: [RESP[0], RESP[1], null, RESP[2], RESP[0]][(i + dia) % 5],
        nome: NOMES[(k + i) % 10], telefone: `5512${String(970000000 + ((dia * 97 + i * 1013) % 29999999)).padStart(9, '0')}`,
        origem: origem === 'site' ? 'organico' : origem, utm_source: origem === 'site' ? 'site' : origem === 'meta' ? 'instagram' : origem === 'google' ? 'google' : null,
        utm_medium: origem === 'google' ? 'cpc' : null, utm_campaign: CAMPANHAS[origem] ? CAMPANHAS[origem][i % 2] : null,
        status, servico: SERVICOS[(dia + i) % 6], carro_modelo: CARROS[(dia * 2 + i) % 8],
        valor_pago: status === 'concluido' && i % 3 !== 0 ? 280 + ((dia + i) % 6) * 90 : null, valor_orcado: status === 'orcamento' ? 450 + i * 30 : null,
        created_at: criado.toISOString(), closed_at: status === 'concluido' || status === 'perdido' ? new Date(criado.getTime() + 2 * 86400000).toISOString() : null,
      });
      n++;
    }
  }
  return saida.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Resultado no formato de leads.listar(). */
function listar({ de, ate, canal = null, status = null, q = null, soPagos = false, semResponsavel = false, etapa = null, ordem = 'recentes', limite = 300 }, vazio = false) {
  const crus = brutos(de, ate, vazio), Cd = require('../ciclo.js'), pl = require('./ciclo-demo.cjs').porLeadDemo(crus);
  const linhas = crus.map(l => L.montarLinha({ ...l, placa: l.placa || 'ABC' + (1000 + (l.id.length * 37 + l.id.charCodeAt(l.id.length - 1)) % 9000) }, {
    ciclo: Cd.resumoDoLead(pl.get(l.id)),
    agendamento: ['agendado', 'concluido', 'em_servico'].includes(l.status) ? { id: `ag-${l.id}`, data: l.created_at.slice(0, 10), hora: '09:30', status: l.status === 'concluido' ? 'concluido' : 'confirmado' } : null,
    responsavel: l.responsavel_id ? NOMES_RESP.get(l.responsavel_id) : null,
  }));
  const filtrados = L.ordenar(L.filtrar(linhas, { canal, status, q, soPagos, semResponsavel, etapa }), ordem);
  return { periodo: { de, ate }, total_periodo: linhas.length, resumo: L.resumo(filtrados), resumo_periodo: L.resumo(linhas),
    leads: filtrados.slice(0, limite), cortado: filtrados.length > limite, canais: L.CANAIS, status_nomes: L.STATUS_NOME };
}

module.exports = { brutos, listar, NOMES_RESP };
