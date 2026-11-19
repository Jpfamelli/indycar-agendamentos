/* ============================================================================
   Endereço da tela (lógica pura, testada em tela/_testes/navegacao.test.mjs).
   A tela mora em /trafego/ e navega pelo que vem depois do "#":
     #/hoje · #/jornada?desfecho=aberto&contato=<id> · #/campanhas · #/gestor · #/ajustes
   Assim o endereço guarda tela, período, filtros e o contato aberto, dá para
   mandar o link para alguém, e o servidor não precisa conhecer nenhuma rota de tela.
   ============================================================================ */

export const TELAS = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: 'jornada', rotulo: 'Jornada' },
  { id: 'campanhas', rotulo: 'Campanhas' },
  { id: 'gestor', rotulo: 'Gestor IA' },
  { id: 'ajustes', rotulo: 'Ajustes' },
];
/** Telas que não ficam no menu: abrem dos Ajustes › Relatórios (folha A4 e modo apresentação). */
export const TELAS_SOLTAS = [
  { id: 'folha', rotulo: 'Folha do mês' },
  { id: 'apresentacao', rotulo: 'Apresentação' },
];
const IDS = [...TELAS, ...TELAS_SOLTAS].map((t) => t.id);
const TELA_PADRAO = 'hoje';
const MAX_VALOR = 200;

/** "#/jornada?pendencia=sem_valor" → { tela: 'jornada', params: { pendencia: 'sem_valor' } }. */
export function lerRota(hash) {
  let resto = String(hash == null ? '' : hash);
  if (resto.startsWith('#')) resto = resto.slice(1);
  if (resto.startsWith('/')) resto = resto.slice(1);
  const corte = resto.indexOf('?');
  const nome = (corte >= 0 ? resto.slice(0, corte) : resto).replace(/[/]+$/, '').toLowerCase();
  const consulta = corte >= 0 ? resto.slice(corte + 1) : '';
  const params = {};
  for (const [chave, valor] of new URLSearchParams(consulta)) {
    if (!/^[a-z_]{1,24}$/.test(chave)) continue;
    params[chave] = String(valor).slice(0, MAX_VALOR);
  }
  return { tela: IDS.includes(nome) ? nome : TELA_PADRAO, params };
}

/** { tela, params } → "#/jornada?desfecho=aberto" (chaves em ordem; vazio não entra). */
export function montarRota(tela, params = {}) {
  const nome = IDS.includes(tela) ? tela : TELA_PADRAO;
  const q = new URLSearchParams();
  for (const chave of Object.keys(params).sort()) {
    const valor = params[chave];
    if (valor === '' || valor == null || valor === false) continue;
    q.set(chave, String(valor));
  }
  const consulta = q.toString();
  return '#/' + nome + (consulta ? '?' + consulta : '');
}

/**
 * O campo `ir` das ações da API ("jornada?pendencia=sem_valor", "ajustes?secao=conexoes", "/atendimento/").
 * Devolve { tipo: 'tela', tela, params } para lugar daqui de dentro,
 * { tipo: 'fora', caminho } para outro app, ou null quando não há para onde ir.
 */
export function destinoDaApi(ir) {
  const texto = String(ir == null ? '' : ir).trim();
  if (!texto) return null;
  const m = /^#?[/]?(hoje|jornada|campanhas|gestor|ajustes|folha|apresentacao)(?:[?](.*))?$/.exec(texto);
  if (m) {
    const lida = lerRota('#/' + m[1] + (m[2] ? '?' + m[2] : ''));
    return { tipo: 'tela', tela: lida.tela, params: lida.params };
  }
  return { tipo: 'fora', caminho: texto };
}

/** Junta parâmetros novos aos atuais (para trocar um filtro sem perder os outros). */
export function comParametros(params, mudancas) {
  const saida = { ...params };
  for (const [chave, valor] of Object.entries(mudancas)) {
    if (valor === '' || valor == null) delete saida[chave];
    else saida[chave] = String(valor);
  }
  return saida;
}
