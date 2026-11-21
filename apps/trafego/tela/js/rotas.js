/* ============================================================================
   Endereço da tela (lógica pura, testada em tela/_testes/navegacao.test.mjs).
   Rodada 11: três abas só. #/resumo · #/campanhas · #/ajustes
   Endereço antigo (#/hoje, #/jornada, #/gestor, #/folha…) abre o Resumo.
   ============================================================================ */

export const TELAS = [
  { id: 'resumo', rotulo: 'Resumo' },
  { id: 'campanhas', rotulo: 'Campanhas' },
  { id: 'ajustes', rotulo: 'Ajustes' },
];
const IDS = TELAS.map((t) => t.id);
const TELA_PADRAO = 'resumo';
const MAX_VALOR = 200;

/** "#/campanhas?periodo=mes_passado" → { tela: 'campanhas', params: { periodo: 'mes_passado' } }. */
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
  return { tela: IDS.includes(nome) ? nome : TELA_PADRAO, params: IDS.includes(nome) ? params : {} };
}

/** { tela, params } → "#/campanhas?periodo=mes_passado" (chaves em ordem; vazio não entra). */
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

/** Abas que a pessoa vê: Ajustes só para o administrador. */
export function abasDoPapel(papel) {
  const admin = !papel || papel === 'admin' || papel === 'dono';
  return TELAS.filter((t) => t.id !== 'ajustes' || admin);
}
