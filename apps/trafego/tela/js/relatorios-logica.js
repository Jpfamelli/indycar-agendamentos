/* ============================================================================
   Contas puras dos relatórios (sem DOM, testadas em _testes/).
   Meses para escolher, o passo do modo apresentação e as linhas da folha.
   ============================================================================ */

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2026-11" → "novembro de 2026". */
export function rotuloDoMes(id) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(id || ''));
  if (!m) return '';
  const n = Number(m[2]);
  return n >= 1 && n <= 12 ? MESES[n - 1] + ' de ' + m[1] : '';
}

/** Os últimos `quantos` meses, do atual para trás: [{ id: '2026-11', rotulo: 'novembro de 2026 (até hoje)' }]. */
export function mesesParaEscolher(hoje = new Date(), quantos = 12) {
  const ano = hoje.getFullYear(), mes = hoje.getMonth();
  const lista = [];
  for (let i = 0; i < quantos; i++) {
    const d = new Date(ano, mes - i, 1);
    const id = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    lista.push({ id, rotulo: rotuloDoMes(id) + (i === 0 ? ' (até hoje)' : '') });
  }
  return lista;
}

/** O mês fechado mais recente (o padrão do relatório mensal): o mês passado. */
export function mesPassado(hoje = new Date()) {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/** Próxima tela do modo apresentação a partir de uma tecla. null = a tecla não é nossa. */
export function passoDaTecla(tecla, atual, total) {
  if (!total) return null;
  switch (tecla) {
    case 'ArrowRight': case 'PageDown': case ' ': case 'Spacebar': return Math.min(total - 1, atual + 1);
    case 'ArrowLeft': case 'PageUp': return Math.max(0, atual - 1);
    case 'Home': return 0;
    case 'End': return total - 1;
    default: return null;
  }
}

/** Passando sozinho, a última volta para a primeira. */
export const proximaSozinha = (atual, total) => (total ? (atual + 1) % total : 0);

/** Quanto tempo cada tela fica parada passando sozinha (as com mais coisa ficam mais). */
export function tempoDaTela(tela) {
  const itens = (tela && (tela.numeros || tela.etapas || tela.origens || tela.campanhas || tela.itens)) || [];
  return Math.min(20000, 9000 + itens.length * 1500);
}

/** Por que um número da folha está em branco, em palavras (nunca "R$ 0" quando não se sabe). */
export function motivoDoVazio(numero, estado) {
  if (!numero || numero.valor != null) return null;
  if (numero.apoio) return numero.apoio;
  if (estado && estado.gasto === 'sem_conta' && numero.formato === 'dinheiro') return 'Conta de anúncios não ligada';
  return 'sem dado';
}

/** "01/11" de "2026-11-01" (sem depender de fuso: a data vem pronta do servidor). */
const ddmm = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? m[3] + '/' + m[2] : null; };

/**
 * A linha de cima de cada tela da apresentação: "IndyCar Tráfego · Este mês, 01/11 a 19/11".
 * Na tela cujo título já é o nome do período, a linha leva só as datas (antes repetia "Este mês" duas vezes).
 */
export function marcaDaApresentacao(periodo, titulo) {
  const p = periodo || {};
  const de = ddmm(p.de), ate = ddmm(p.ate);
  const datas = de && ate ? (de === ate ? de : de + ' a ' + ate) : '';
  const rotulo = p.rotulo && p.rotulo !== titulo ? p.rotulo : '';
  return 'IndyCar Tráfego' + (rotulo || datas ? ' · ' + [rotulo, datas].filter(Boolean).join(', ') : '');
}
