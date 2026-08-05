// -----------------------------------------------------------------------------
// Cliente REST mínimo do Supabase (PostgREST) — fetch nativo, zero dependências.
//
// Substitui o antigo db.js (SQLite). Aqui NÃO existe SQL: tudo vira requisição
// HTTP para ${SUPABASE_URL}/rest/v1/<tabela>?<filtros>.
//
// A chave usada é a service_role, que IGNORA o RLS. Ela é o "servidor da oficina":
// NUNCA pode ser enviada ao navegador nem aparecer em resposta de rota.
// -----------------------------------------------------------------------------

// Configuração por arquivo .env (nunca por variável de ambiente do Windows).
// Em produção (Render) as variáveis já vêm do ambiente e o .env não existe —
// por isso a falha ao ler o arquivo é silenciosa.
try {
  process.loadEnvFile();
} catch {
  /* sem .env: usa as variáveis já presentes no ambiente */
}

const TEMPO_LIMITE_MS = 15000; // 15s por requisição
const PAGINA_PADRAO = 1000;    // PostgREST/Supabase limitam a resposta; paginamos manualmente

// Chaves de consulta que NÃO são filtro de linha (não protegem um UPDATE/DELETE)
const NAO_SAO_FILTRO = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict']);

// Erro de banco com mensagem em português e o status HTTP preservado.
export class ErroSupabase extends Error {
  constructor(mensagem, status = 0, detalhe = null) {
    super(mensagem);
    this.name = 'ErroSupabase';
    this.status = status;
    this.detalhe = detalhe;
  }
}

let _credenciais = null;
function credenciais() {
  if (_credenciais) return _credenciais;
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const chave = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !chave) {
    throw new ErroSupabase(
      'Supabase não configurado: preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env.',
      0,
    );
  }
  _credenciais = { url, chave };
  return _credenciais;
}

// Avisa no boot sem derrubar o processo (o erro real aparece na primeira requisição).
export function conferirConfiguracao() {
  try {
    credenciais();
    return { ok: true };
  } catch (e) {
    console.error('\n  ⚠  ' + e.message + '\n');
    return { ok: false, erro: e.message };
  }
}

// Aceita string ('select=*&id=eq.1'), URLSearchParams ou objeto simples.
function montarConsulta(consulta) {
  if (!consulta) return '';
  if (typeof consulta === 'string') return consulta.replace(/^\?/, '');
  if (consulta instanceof URLSearchParams) return consulta.toString();
  const p = new URLSearchParams();
  for (const [chave, valor] of Object.entries(consulta)) {
    if (valor === undefined || valor === null) continue;
    p.append(chave, String(valor));
  }
  return p.toString();
}

// Trava de segurança: no PostgREST um UPDATE/DELETE sem filtro atinge a TABELA INTEIRA.
// Um id 'undefined' que virasse consulta vazia apagaria tudo — aqui isso vira erro.
function exigirFiltro(consulta, operacao, tabela) {
  const qs = montarConsulta(consulta);
  const pares = new URLSearchParams(qs);
  let temFiltro = false;
  for (const chave of pares.keys()) {
    if (!NAO_SAO_FILTRO.has(chave)) { temFiltro = true; break; }
  }
  if (!temFiltro) {
    throw new ErroSupabase(
      `Operação "${operacao}" na tabela "${tabela}" foi bloqueada por não ter filtro — ` +
      'sem filtro o PostgREST afetaria todas as linhas.',
      0,
    );
  }
  return qs;
}

function mensagemDoErro(status, tabela, detalhe) {
  const fim = detalhe ? ` (${detalhe})` : '';
  if (status === 401 || status === 403)
    return `Supabase recusou a credencial ao acessar "${tabela}" — confira SUPABASE_SERVICE_ROLE_KEY no .env.${fim}`;
  if (status === 404)
    return `Tabela ou rota "${tabela}" não existe no Supabase.${fim}`;
  if (status === 409)
    return `Conflito ao gravar em "${tabela}" — registro duplicado ou chave estrangeira inválida.${fim}`;
  if (status === 400)
    return `Requisição inválida para "${tabela}" — provável coluna, tipo ou valor de enum incorreto.${fim}`;
  return `Erro ${status} do Supabase na tabela "${tabela}".${fim}`;
}

async function requisitar(metodo, tabela, consulta, opcoes = {}) {
  const { corpo, prefer, cabecalhos } = opcoes;
  const { url, chave } = credenciais();
  const qs = montarConsulta(consulta);
  const alvo = `${url}/rest/v1/${tabela}${qs ? '?' + qs : ''}`;

  const headers = {
    apikey: chave,
    Authorization: `Bearer ${chave}`,
    Accept: 'application/json',
    ...cabecalhos,
  };
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  let resposta;
  try {
    resposta = await fetch(alvo, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
  } catch (e) {
    const nome = e?.name || '';
    if (nome === 'TimeoutError' || nome === 'AbortError') {
      throw new ErroSupabase(
        `O Supabase não respondeu em ${TEMPO_LIMITE_MS / 1000}s ao acessar "${tabela}". Tente novamente.`, 0);
    }
    throw new ErroSupabase(
      `Não foi possível falar com o Supabase (tabela "${tabela}"): ${e?.message || e}`, 0);
  }

  const bruto = metodo === 'HEAD' ? '' : await resposta.text().catch(() => '');

  if (!resposta.ok) {
    let detalhe = bruto ? bruto.slice(0, 400) : '';
    try {
      const j = JSON.parse(bruto);
      detalhe = j.message || j.details || j.hint || detalhe;
    } catch { /* corpo não era JSON */ }
    throw new ErroSupabase(mensagemDoErro(resposta.status, tabela, detalhe), resposta.status, detalhe);
  }

  let dados = null;
  if (bruto) {
    try { dados = JSON.parse(bruto); } catch { dados = null; }
  }
  return { resposta, dados };
}

// ----------------------------------------------------------------------------
// Helpers públicos
// ----------------------------------------------------------------------------

/** SELECT: devolve sempre um array (vazio se não houver linhas). */
export async function selecionar(tabela, consulta = 'select=*') {
  const { dados } = await requisitar('GET', tabela, consulta);
  return Array.isArray(dados) ? dados : (dados ? [dados] : []);
}

/** SELECT de uma linha só: devolve o objeto ou null. */
export async function selecionarUm(tabela, consulta = 'select=*') {
  const linhas = await selecionar(tabela, consulta);
  return linhas[0] ?? null;
}

/**
 * SELECT paginado: percorre todas as páginas até acabar.
 * Necessário porque o PostgREST corta a resposta silenciosamente (max-rows).
 */
export async function selecionarTudo(tabela, consulta = 'select=*', tamanho = PAGINA_PADRAO) {
  const acumulado = [];
  let deslocamento = 0;
  for (;;) {
    const p = new URLSearchParams(montarConsulta(consulta));
    p.set('limit', String(tamanho));
    p.set('offset', String(deslocamento));
    const pagina = await selecionar(tabela, p);
    acumulado.push(...pagina);
    if (pagina.length < tamanho) break;
    deslocamento += tamanho;
    if (deslocamento > 100000) break; // trava de segurança
  }
  return acumulado;
}

/** INSERT: devolve as linhas criadas (com o id gerado). Substitui lastInsertRowid. */
export async function inserir(tabela, linhas, consulta = '') {
  const corpo = Array.isArray(linhas) ? linhas : [linhas];
  const { dados } = await requisitar('POST', tabela, consulta, {
    corpo,
    prefer: 'return=representation',
  });
  return Array.isArray(dados) ? dados : [];
}

/** INSERT de uma linha só: devolve o objeto criado. */
export async function inserirUm(tabela, linha, consulta = '') {
  const criadas = await inserir(tabela, linha, consulta);
  return criadas[0] ?? null;
}

/** UPDATE (PATCH): exige filtro. Devolve as linhas alteradas. */
export async function atualizar(tabela, filtro, campos) {
  const qs = exigirFiltro(filtro, 'UPDATE', tabela);
  const { dados } = await requisitar('PATCH', tabela, qs, {
    corpo: campos,
    prefer: 'return=representation',
  });
  return Array.isArray(dados) ? dados : [];
}

/** UPDATE de uma linha só: devolve o objeto atualizado ou null. */
export async function atualizarUm(tabela, filtro, campos) {
  const linhas = await atualizar(tabela, filtro, campos);
  return linhas[0] ?? null;
}

/** DELETE: exige filtro. Devolve as linhas removidas. */
export async function remover(tabela, filtro) {
  const qs = exigirFiltro(filtro, 'DELETE', tabela);
  const { dados } = await requisitar('DELETE', tabela, qs, { prefer: 'return=representation' });
  return Array.isArray(dados) ? dados : [];
}

/** COUNT(*): usa HEAD + Prefer: count=exact e lê o cabeçalho Content-Range. */
export async function contar(tabela, consulta = '') {
  const p = new URLSearchParams(montarConsulta(consulta));
  if (!p.has('select')) p.set('select', 'id');
  const { resposta } = await requisitar('HEAD', tabela, p, {
    prefer: 'count=exact',
    cabecalhos: { 'Range-Unit': 'items' },
  });
  const faixa = resposta.headers.get('content-range') || '';
  const total = Number(faixa.split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}

/** Chamada de função (RPC) no Postgres. */
export async function rpc(nome, argumentos = {}) {
  const { dados } = await requisitar('POST', `rpc/${nome}`, '', { corpo: argumentos });
  return dados;
}

export default {
  selecionar, selecionarUm, selecionarTudo,
  inserir, inserirUm, atualizar, atualizarUm, remover, contar, rpc,
  conferirConfiguracao, ErroSupabase,
};
