/* ============================================================================
   Endereço da tela (lógica pura, testada em tela/_testes/r12-tela.test.mjs).
   Rodada 12 (no pique do Nexus Ads, com a cara da IndyCar):
     #/geral · #/campanhas · #/clientes · #/radar · #/relatorios · #/ajustes
   Filtros que valem para todas: ?periodo=7d|30d|60d e ?fonte=meta|google.
   Endereço antigo (#/resumo, #/hoje, #/jornada…) abre o lugar certo da tela nova.
   ============================================================================ */

export const TELAS = [
  { id: 'geral', rotulo: 'Visão geral', icone: 'painel' },
  { id: 'campanhas', rotulo: 'Campanhas', icone: 'campanhas' },
  { id: 'clientes', rotulo: 'Clientes', icone: 'clientes' },
  { id: 'radar', rotulo: 'Radar', icone: 'radar' },
  { id: 'relatorios', rotulo: 'Relatórios', icone: 'relatorio' },
  { id: 'ajustes', rotulo: 'Ajustes', icone: 'ajustes', so_admin: true },
];
const IDS = TELAS.map((t) => t.id);
const TELA_PADRAO = 'geral';
const MAX_VALOR = 200;

/** Endereços que existiam antes da rodada 12 e para onde vão agora. */
const ANTIGAS = { resumo: 'geral', hoje: 'geral', jornada: 'clientes', pendencias: 'clientes', fila: 'clientes' };
/** Filtros antigos que não fazem mais sentido na tela nova (o Resumo antigo levava "mes"). */
const SO_DA_TELA_NOVA = new Set(['periodo', 'fonte', 'pendencia', 'tipo', 'ordem', 'campanha', 'etapa']);

/** "#/campanhas?periodo=60d" → { tela: 'campanhas', params: { periodo: '60d' } }. */
export function lerRota(hash) {
  let resto = String(hash == null ? '' : hash);
  if (resto.startsWith('#')) resto = resto.slice(1);
  if (resto.startsWith('/')) resto = resto.slice(1);
  const corte = resto.indexOf('?');
  let nome = (corte >= 0 ? resto.slice(0, corte) : resto).replace(/[/]+$/, '').toLowerCase();
  const consulta = corte >= 0 ? resto.slice(corte + 1) : '';
  const antiga = Object.prototype.hasOwnProperty.call(ANTIGAS, nome);
  if (antiga) nome = ANTIGAS[nome];
  if (!IDS.includes(nome)) return { tela: TELA_PADRAO, params: {} };
  const params = {};
  for (const [chave, valor] of new URLSearchParams(consulta)) {
    if (!/^[a-z_]{1,24}$/.test(chave)) continue;
    if (antiga && !SO_DA_TELA_NOVA.has(chave)) continue;
    params[chave] = String(valor).slice(0, MAX_VALOR);
  }
  return { tela: nome, params };
}

/** { tela, params } → "#/campanhas?periodo=60d" (chaves em ordem; vazio não entra). */
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

export const ehAdmin = (papel) => !papel || papel === 'admin' || papel === 'dono';

/** Telas que a pessoa vê na navegação: Ajustes só para o administrador. */
export function abasDoPapel(papel) {
  return TELAS.filter((t) => !t.so_admin || ehAdmin(papel));
}

/* ------------------------------ filtros ------------------------------ */

export const PERIODOS_DA_TELA = [{ id: '7d', rotulo: '7 dias' }, { id: '30d', rotulo: '30 dias' }, { id: '60d', rotulo: '60 dias' }];
export const PERIODO_DA_TELA = '30d';
export const FONTES = [{ id: '', rotulo: 'Tudo' }, { id: 'meta', rotulo: 'Meta' }, { id: 'google', rotulo: 'Google' }];

export const periodoDaTela = (id) => (PERIODOS_DA_TELA.some((p) => p.id === id) ? id : PERIODO_DA_TELA);
export const fonteDaTela = (id) => (id === 'meta' || id === 'google' ? id : '');

/**
 * Para onde leva o "ir" que a API manda nos avisos ("jornada?pendencia=sem_valor", "ajustes?secao=conexoes", "/agenda/").
 * Devolve { tela, params } para dentro do Tráfego, { fora: '/agenda/' } para outro app da Central, ou null.
 */
export function destinoDoIr(ir) {
  const texto = String(ir == null ? '' : ir).trim();
  if (!texto) return null;
  if (texto.startsWith('/')) return /^\/[a-z0-9-]+\/[^\s]*$/i.test(texto) && !texto.startsWith('//') ? { fora: texto } : null;
  const rota = lerRota('#/' + texto);
  const nome = texto.split('?')[0].toLowerCase();
  if (!IDS.includes(nome) && !Object.prototype.hasOwnProperty.call(ANTIGAS, nome)) return null;
  return rota;
}
