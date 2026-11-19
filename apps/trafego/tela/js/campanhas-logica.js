/* ============================================================================
   Campanhas: ordem da classificação, distância para a primeira e mapa de dia e
   hora (lógica pura, testada em tela/_testes/campanhas.test.mjs).
   Nenhuma conta de negócio: custo, retorno e contatos já vêm da API. Aqui só se
   escolhe a ordem de mostrar e se escreve a diferença em palavras.
   ============================================================================ */

import { dinheiro, inteiro, ehNumero, plural } from './formato.js';

/**
 * Critérios da classificação. `melhor`: 'maior' ou 'menor' (custo baixo vem primeiro).
 * `falta`: o que a linha diz quando a campanha não tem esse número.
 */
export const CRITERIOS = [
  { id: 'retorno', rotulo: 'Retorno', campo: 'retorno', melhor: 'maior', falta: 'sem retorno para comparar' },
  { id: 'custo_servico', rotulo: 'Custo por serviço', campo: 'custo_por_servico', melhor: 'menor', falta: 'sem custo por serviço para comparar' },
  { id: 'custo_contato', rotulo: 'Custo por contato', campo: 'custo_por_contato', melhor: 'menor', falta: 'sem custo por contato para comparar' },
  { id: 'contatos', rotulo: 'Contatos', campo: 'contatos', melhor: 'maior', falta: 'sem contatos para comparar' },
  { id: 'gasto', rotulo: 'Gasto', campo: 'gasto', melhor: 'maior', falta: 'sem gasto ligado' },
];
export const CRITERIO_PADRAO = 'retorno';
export const criterio = (id) => CRITERIOS.find((c) => c.id === id) || null;

/** Critérios que têm número em pelo menos uma campanha (os outros não ordenam nada). */
export function criteriosComDado(campanhas) {
  const lista = Array.isArray(campanhas) ? campanhas : [];
  return CRITERIOS.filter((c) => lista.some((x) => x && ehNumero(x[c.campo])));
}

/** O critério pedido, se tiver dado; senão o padrão (retorno) ou o primeiro que tem. */
export function criterioEfetivo(pedido, campanhas) {
  const validos = criteriosComDado(campanhas);
  if (!validos.length) return criterio('contatos');
  return validos.find((c) => c.id === pedido) || validos.find((c) => c.id === CRITERIO_PADRAO) || validos[0];
}

const nomeDe = (c) => String((c && c.nome) || '');

/** Ordem da classificação. Quem não tem o número vai para o fim; empate desempata por contatos e pelo nome. */
export function ordenar(campanhas, id) {
  const c = criterio(id) || criterio(CRITERIO_PADRAO);
  const lista = (Array.isArray(campanhas) ? campanhas : []).filter(Boolean);
  const sinal = c.melhor === 'menor' ? 1 : -1;
  return lista
    .map((x, i) => ({ x, i }))
    .sort((a, b) => {
      const va = a.x[c.campo], vb = b.x[c.campo];
      const ta = ehNumero(va), tb = ehNumero(vb);
      if (ta !== tb) return ta ? -1 : 1;
      if (ta && va !== vb) return sinal * (va - vb);
      const ca = ehNumero(a.x.contatos) ? a.x.contatos : -1;
      const cb = ehNumero(b.x.contatos) ? b.x.contatos : -1;
      if (ca !== cb) return cb - ca;
      const n = nomeDe(a.x).localeCompare(nomeDe(b.x), 'pt-BR');
      return n || a.i - b.i;
    })
    .map((p) => p.x);
}

const QUASE_ZERO = 0.005;
const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * A diferença de uma campanha para a primeira da classificação, em palavras.
 * Devolve { texto, tipo: 'lider' | 'empate' | 'atras' | 'sem_dado' }.
 */
export function distancia(campanha, lider, id) {
  const c = criterio(id) || criterio(CRITERIO_PADRAO);
  const v = campanha ? campanha[c.campo] : null;
  const l = lider ? lider[c.campo] : null;
  if (!ehNumero(v)) return { texto: maiuscula(c.falta), tipo: 'sem_dado' };
  if (campanha === lider || !ehNumero(l)) return { texto: 'Primeira da classificação', tipo: 'lider' };
  const dif = Math.abs(v - l);
  if (dif < QUASE_ZERO) return { texto: 'Empatada com a primeira', tipo: 'empate' };
  const lado = v > l ? 'mais' : 'menos';
  switch (c.id) {
    case 'retorno':
      // Logo abaixo de "R$ 5,01 cada R$ 1 virou": repetir "Cada R$ 1 virou" na linha de baixo só atrapalhava a leitura.
      return { texto: dinheiro(dif, { centavos: true }) + ' a ' + lado + ' que a primeira', tipo: 'atras' };
    case 'custo_servico':
      return { texto: dinheiro(dif) + ' a ' + lado + ' por serviço fechado que a primeira', tipo: 'atras' };
    case 'custo_contato':
      return { texto: dinheiro(dif) + ' a ' + lado + ' por contato que a primeira', tipo: 'atras' };
    case 'contatos':
      return { texto: inteiro(dif) + ' ' + plural(dif, 'contato', 'contatos') + ' a ' + lado + ' que a primeira', tipo: 'atras' };
    default:
      return { texto: dinheiro(dif) + ' a ' + lado + ' de gasto que a primeira', tipo: 'atras' };
  }
}

/** Classificação pronta: [{ campanha, posicao, distancia }] (posição só para quem tem o número). */
export function classificar(campanhas, id) {
  const c = criterio(id) || criterio(CRITERIO_PADRAO);
  const ordem = ordenar(campanhas, c.id);
  const lider = ordem.find((x) => ehNumero(x[c.campo])) || null;
  let posicao = 0;
  return ordem.map((x) => {
    const tem = ehNumero(x[c.campo]);
    if (tem) posicao++;
    return { campanha: x, posicao: tem ? posicao : null, distancia: distancia(x, lider, c.id) };
  });
}

/** O Google conta conversão em fração (1,5): até uma casa, sem zero à toa. */
function numeroCurto(n) {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? inteiro(r) : String(r).replace('.', ',');
}

/**
 * O que a plataforma conta e o que chegou na oficina, numa frase.
 * "A Meta conta 30 conversas; chegaram 22." Devolve null quando falta um dos dois lados.
 */
export function plataformaContraOficina(campanha) {
  const pl = campanha && campanha.contatos_plataforma;
  const of = campanha && campanha.contatos;
  if (!ehNumero(pl) || !ehNumero(of)) return null;
  const google = campanha.plataforma === 'google';
  const quem = google ? 'O Google' : campanha.plataforma === 'meta' ? 'A Meta' : 'A plataforma';
  const conta = google ? plural(pl === 1 ? 1 : 2, 'conversão', 'conversões') : plural(pl === 1 ? 1 : 2, 'conversa', 'conversas');
  return {
    texto: quem + ' conta ' + numeroCurto(pl) + ' ' + conta + '; ' + (of === 1 ? 'chegou ' : 'chegaram ') + inteiro(of) + '.',
    fracao: pl > 0 ? Math.min(1, of / pl) : null,
    sobra: of > pl,
  };
}

/* ------------------------------ mapa de dia e hora ------------------------------ */

const NOME_DO_DIA = { seg: 'seg', ter: 'ter', qua: 'qua', qui: 'qui', sex: 'sex', sab: 'sáb', dom: 'dom' };
const DIA_POR_EXTENSO = { seg: 'segunda', ter: 'terça', qua: 'quarta', qui: 'quinta', sex: 'sexta', sab: 'sábado', dom: 'domingo' };
export const NIVEIS_DO_MAPA = 4;

/** 0 = nenhum contato; 1 a 4 = mais forte conforme chega perto do horário de mais contatos. */
export function nivelDaCelula(n, maior) {
  if (!ehNumero(n) || n <= 0 || !ehNumero(maior) || maior <= 0) return 0;
  return Math.min(NIVEIS_DO_MAPA, Math.max(1, Math.ceil((n / maior) * NIVEIS_DO_MAPA)));
}

/**
 * horarios da API ({ dias, horas, celulas[dia][hora], pico, leitura, total, base }) → o que a grade desenha.
 * Célula sem número vira null (sem dado), nunca zero. Forma errada devolve null (a tela diz "sem dado").
 */
export function montarMapa(horarios) {
  if (!horarios || !Array.isArray(horarios.dias) || !Array.isArray(horarios.horas) || !Array.isArray(horarios.celulas)) return null;
  const dias = horarios.dias.map((d) => {
    const id = String(d);
    return { id, rotulo: NOME_DO_DIA[id] || id, extenso: DIA_POR_EXTENSO[id] || id };
  });
  const horas = horarios.horas.filter(ehNumero).map((hh) => ({ h: hh, rotulo: hh + 'h' }));
  let maior = 0, total = 0;
  const celulas = [];
  dias.forEach((dia, di) => {
    const linha = Array.isArray(horarios.celulas[di]) ? horarios.celulas[di] : [];
    horas.forEach((hora, hi) => {
      const n = ehNumero(linha[hi]) ? linha[hi] : null;
      if (n != null) { maior = Math.max(maior, n); total += n; }
      celulas.push({ di, hi, dia, hora, n });
    });
  });
  for (const c of celulas) c.nivel = nivelDaCelula(c.n, maior);
  return { dias, horas, celulas, maior, total, vazio: total === 0 };
}

/** "terça, 10h: 3 contatos" (para a leitura do ponteiro, do teclado e da tabela). */
export function descreverCelula(c, { um = 'contato', varios = 'contatos' } = {}) {
  if (!c) return '';
  const quantos = c.n == null ? 'sem dado' : c.n === 0 ? 'nenhum ' + um : inteiro(c.n) + ' ' + plural(c.n, um, varios);
  return c.dia.extenso + ', ' + c.hora.rotulo + ': ' + quantos;
}
