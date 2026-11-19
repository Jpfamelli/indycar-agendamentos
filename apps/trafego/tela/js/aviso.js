/* ============================================================================
   O aviso de "resposta incompleta" (lógica pura, testada em
   tela/_testes/gestor-e-campanhas.test.mjs).
   A API manda `estado.aviso` pronto em /api/hoje. As outras rotas (campanhas,
   relatórios) mandam só `estado.incompleto` (as leituras que falharam) e
   `estado.reserva` (os contatos vieram só do cadastro): a frase sai daqui, com
   os mesmos nomes que o servidor usa (motor/hoje.js, NOME_DA_LEITURA).
   ============================================================================ */

const NOME_DA_LEITURA = Object.freeze({
  metas: 'as metas', alertas: 'os alertas', rastreio: 'os cliques do site', conexoes: 'as contas de anúncio',
  whatsapp: 'a situação do WhatsApp', whatsapp_desde: 'a situação do WhatsApp', agenda: 'a agenda', agenda_capacidade: 'a agenda',
  agenda_servicos: 'a agenda', jornada: 'os detalhes dos contatos', termos: 'as palavras-chave',
});

/** Frase do aviso, ou null quando a resposta veio inteira. */
export function avisoDoEstado(estado) {
  if (!estado || typeof estado !== 'object') return null;
  if (typeof estado.aviso === 'string' && estado.aviso.trim()) return estado.aviso.trim();
  const ids = Array.isArray(estado.incompleto) ? estado.incompleto : [];
  const nomes = [...new Set(ids.map((id) => NOME_DA_LEITURA[id] || null).filter(Boolean))];
  const partes = [];
  if (nomes.length) partes.push('Não deu para ler agora: ' + (nomes.length > 1 ? nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1] : nomes[0]) + '.');
  else if (ids.length) partes.push('Uma parte desta tela não pôde ser lida agora.');
  if (estado.reserva === true) partes.push('Os contatos vêm só do cadastro: sem agenda, orçamento, pátio nem resposta da oficina.');
  return partes.length ? partes.join(' ') + ' O resto está certo; tente atualizar daqui a pouco.' : null;
}

/** Liga ou tira a faixa "incompleto" da casca conforme o estado da resposta. */
export function mostrarAviso(ctx, estado) {
  const texto = avisoDoEstado(estado);
  ctx.faixa('incompleto', texto ? { icone: 'alerta', texto } : null);
}
