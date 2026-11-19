/* ============================================================
   Diário de decisões (rodada 8, frente T5b): trafego_acoes.

   Quem grava aqui:
   - a ferramenta proposta_criar (T5a) cria a PROPOSTA (status "proposta"). Só isso;
   - uma PESSOA logada aceita, recusa, marca como feita ou registra uma decisão própria (rotas/acoes-trafego.js);
   - a ROTINA (/api/cron/medir) expira proposta sem decisão em 14 dias e mede o efeito na data medir_em.
   Nenhuma ferramenta do modelo chama nada deste arquivo que escreva.

   Medir (regra simples e honesta, igual em API-gestor.md §3):
   - base: a campanha do alvo; a plataforma inteira (conta, conjunto, anúncio, palavra, termo, horário e "pausar");
     a oficina toda (site, WhatsApp, oficina);
   - antes = os 7 dias completos antes da decisão; depois = até 7 dias completos entre o dia seguinte ao "feita"
     e a véspera de medir_em (mínimo 3);
   - compara o primeiro número que existe nos dois lados: retorno, custo por contato, contatos por dia;
   - veredito: melhorou | piorou | sem_diferenca (menos de 5 contatos num lado, ou mudança menor que 15%) | nao_mediu.
   ============================================================ */
'use strict';

const P = require('../motor/periodo');
const S = require('../motor/soma');
const T = require('../motor/texto');
const D = require('./dossie');
const O = require('../origem');
const Registro = require('../registro');

const TIPOS = D.TIPOS_DE_PROPOSTA;
const STATUS = D.STATUS_DE_ACAO;
const PLATAFORMAS_ALVO = ['meta', 'google', 'site', 'whatsapp', 'oficina'];
const NIVEIS_ALVO = ['conta', 'campanha', 'conjunto', 'anuncio', 'palavra', 'termo', 'horario', 'outro'];
const DIAS_PARA_EXPIRAR = 14, DIAS_ANTES = 7, DIAS_DEPOIS = 7, MIN_DIAS_DEPOIS = 3, MIN_CONTATOS = 5, MUDANCA_MINIMA = 0.15;
const MAX_NOTA = 300, MAX_LISTA = 200, PADRAO_LISTA = 50, MAX_MEDIR_POR_VEZ = 100;
const DIA_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

const COLUNAS = 'id, criada_em, origem, autor, tipo, titulo, porque, alvo, evidencias, status, decidida_por, decidida_em, feita_em, nota, medir_em, antes, depois, veredito';

const ROTULO_STATUS = Object.freeze({ proposta: 'Esperando decisão', aceita: 'Aceita, falta fazer', feita: 'Feita', recusada: 'Recusada', expirada: 'Expirou sem decisão' });
const ROTULO_ORIGEM = Object.freeze({ ia: 'Gestor IA', radar: 'Radar', pessoa: 'Pessoa', externa: 'IA de fora' });
const ROTULO_TIPO = Object.freeze({
  pausar: 'Pausar', reativar: 'Reativar', aumentar_verba: 'Aumentar a verba', reduzir_verba: 'Reduzir a verba',
  trocar_criativo: 'Trocar a imagem ou o vídeo', mensagem_pronta: 'Mensagem pronta do anúncio', negativar_termo: 'Bloquear um termo de busca',
  ajustar_horario: 'Mudar o horário dos anúncios', corrigir_rastreio: 'Consertar o rastreio', outro: 'Outra mudança',
});
const ROTULO_VEREDITO = Object.freeze({ melhorou: 'Melhorou', piorou: 'Piorou', sem_diferenca: 'Sem diferença clara', nao_mediu: 'Não deu para medir' });
const ROTULO_PLATAFORMA = Object.freeze({ meta: 'Meta', google: 'Google', site: 'Site', whatsapp: 'WhatsApp', oficina: 'Oficina' });
const ROTULO_NIVEL = Object.freeze({ conta: 'conta inteira', campanha: 'campanha', conjunto: 'conjunto', anuncio: 'anúncio', palavra: 'palavra-chave', termo: 'termo de busca', horario: 'horário', outro: null });
const FALTA_MIGRACAO = 'O diário de decisões ainda não existe no banco: falta aplicar a atualização do banco do IndyCar Tráfego.';

/* ---------- erros ---------- */

/** Erro com status e código (vira JSON { erro, codigo } na rota). */
class ErroDoDiario extends Error {
  constructor(status, codigo, mensagem) { super(mensagem); this.name = 'ErroDoDiario'; this.status = status; this.codigo = codigo; this.publico = true; this.extra = { codigo }; }
}
const tabelaAusente = e => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|relation .* does not exist/i.test(String(e.message || '')));
const semMigracao = () => new ErroDoDiario(503, 'sem_migracao', FALTA_MIGRACAO);
const temporario = () => new ErroDoDiario(503, 'temporario', 'Não deu para ler o diário de decisões agora. Tente de novo em instantes.');

/* ---------- pequenos ---------- */

const normal = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const objeto = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const rotuloPeriodo = (de, ate) => (de === ate ? P.ddmm(de) : `${P.ddmm(de)} a ${P.ddmm(ate)}`);
const maiorData = (a, b) => (a > b ? a : b);

/** "Google › campanha Troca de óleo" */
function rotuloDoAlvo(alvo) {
  const a = objeto(alvo);
  if (!a) return null;
  const partes = [ROTULO_PLATAFORMA[a.plataforma] || null];
  const nivel = ROTULO_NIVEL[a.nivel] || null;
  const nome = a.nome || a.ext || null;
  const resto = [nivel, nome].filter(Boolean).join(' ');
  if (resto) partes.push(resto);
  return partes.filter(Boolean).join(' › ') || null;
}

/** "Custo por contato: 48 (campanhas)": a evidência numa linha pronta para a tela (o valor só entra se o texto ainda não tem). */
function textoDaEvidencia(e) {
  const dado = String(e.dado).trim();
  const valor = e.valor != null && String(e.valor).trim() && !dado.includes(String(e.valor).trim()) ? `: ${String(e.valor).trim()}` : '';
  return `${dado}${valor}`;
}

/** As evidências como a tela usa: [{ fonte, dado, valor }], mais verba e risco (vêm dentro de `evidencias` na tabela). */
function lerEvidencias(ev) {
  const o = objeto(ev);
  const lista = Array.isArray(ev) ? ev : o && Array.isArray(o.itens) ? o.itens : [];
  return {
    itens: lista.map(e => (typeof e === 'string' ? { fonte: null, dado: e, valor: null } : { fonte: e && e.fonte != null ? e.fonte : null, dado: e ? e.dado ?? e.texto ?? null : null, valor: e && e.valor != null ? e.valor : null }))
      .filter(e => e.dado)
      .map(e => ({ ...e, texto: textoDaEvidencia(e) })),
    verba: o && objeto(o.verba) ? o.verba : null,
    risco: o && o.risco === 'alto' ? 'alto' : 'normal',
    risco_motivo: o && o.risco_motivo ? String(o.risco_motivo) : null,
  };
}

function rotuloDoAutor(linha, { nomes, chaves }) {
  if (linha.origem === 'ia') return ROTULO_ORIGEM.ia;
  if (linha.origem === 'radar') return ROTULO_ORIGEM.radar;
  if (linha.origem === 'externa') {
    const id = String(linha.autor || '').replace(/^chave:/, '');
    const nome = chaves.get(id);
    return nome ? `IA de fora: ${nome}` : ROTULO_ORIGEM.externa;
  }
  const p = nomes.get(String(linha.autor || ''));
  return p ? p.nome : ROTULO_ORIGEM.pessoa;
}

/** Uma linha de trafego_acoes no formato da API (API-gestor.md §3). */
function formatarAcao(linha, { nomes = new Map(), chaves = new Map() } = {}) {
  if (!linha) return null;
  const ev = lerEvidencias(linha.evidencias);
  const depois = objeto(linha.depois);
  const vereditoTexto = depois && depois.leitura ? String(depois.leitura) : null;
  const decidida = linha.decidida_por ? nomes.get(String(linha.decidida_por)) : null;
  const criadaDia = P.diaBR(linha.criada_em);
  return {
    id: linha.id,
    criada_em: linha.criada_em || null,
    origem: linha.origem || null, origem_rotulo: ROTULO_ORIGEM[linha.origem] || null,
    autor: rotuloDoAutor(linha, { nomes, chaves }),
    tipo: linha.tipo || null, tipo_rotulo: ROTULO_TIPO[linha.tipo] || ROTULO_TIPO.outro,
    titulo: linha.titulo || null, porque: linha.porque || null,
    alvo: objeto(linha.alvo), alvo_rotulo: rotuloDoAlvo(linha.alvo),
    evidencias: ev.itens, verba: ev.verba, risco: ev.risco, risco_motivo: ev.risco_motivo,
    status: linha.status || null, status_rotulo: ROTULO_STATUS[linha.status] || null,
    vence_em: linha.status === 'proposta' && criadaDia ? P.somarDias(criadaDia, DIAS_PARA_EXPIRAR) : null,
    decidida_por: linha.decidida_por ? (decidida ? decidida.nome : 'Pessoa da equipe') : null,
    decidida_por_id: linha.decidida_por || null,
    decidida_em: linha.decidida_em || null, feita_em: linha.feita_em || null, nota: linha.nota || null,
    medir_em: linha.medir_em || null,
    antes: objeto(linha.antes), depois: depois ? (({ leitura, ...resto }) => resto)(depois) : null,
    veredito: linha.veredito || null, veredito_rotulo: ROTULO_VEREDITO[linha.veredito] || null, veredito_texto: vereditoTexto,
  };
}

/* ---------- julgar (pura) ---------- */

const METRICAS = [
  { campo: 'retorno', sentido: 1, frase: (a, d) => `cada R$ 1 investido virou ${T.dinheiro(a)} antes e ${T.dinheiro(d)} depois` },
  { campo: 'custo_por_contato', sentido: -1, frase: (a, d) => `o custo por contato foi de ${T.dinheiro(a)} para ${T.dinheiro(d)}` },
  { campo: 'contatos_por_dia', sentido: 1, frase: (a, d) => `os contatos por dia foram de ${T.decimal(a)} para ${T.decimal(d)}` },
];

/**
 * O veredito de uma ação na data de medir. PURA.
 * { status, feita_em, antes, depois } → { veredito, texto, metrica, variacao }
 */
function julgar({ status, feita_em, antes, depois }) {
  const nao = motivo => ({ veredito: 'nao_mediu', texto: `Não deu para medir: ${motivo}.`, metrica: null, variacao: null });
  if (status !== 'feita' || !feita_em) return nao('a mudança não foi marcada como feita');
  if (!antes || antes.erro) return nao('faltaram os números de antes da decisão');
  if (!depois || depois.erro) return nao('não deu para ler os números de depois da mudança');
  if (!(depois.dias >= MIN_DIAS_DEPOIS)) return nao(`passou pouco tempo depois da mudança (${T.plural(depois.dias || 0, 'dia', 'dias')}; o mínimo é ${MIN_DIAS_DEPOIS})`);
  const m = METRICAS.find(x => T.finito(antes[x.campo]) && T.finito(depois[x.campo]));
  if (!m) return nao('não há gasto ligado nem contatos para comparar nos dois períodos');
  const comparando = `comparando ${antes.periodo} com ${depois.periodo}`;
  if (T.finito(antes.contatos) && T.finito(depois.contatos) && (antes.contatos < MIN_CONTATOS || depois.contatos < MIN_CONTATOS)) {
    return { veredito: 'sem_diferenca', texto: `Sem diferença clara: poucos contatos para afirmar (${antes.contatos} antes e ${depois.contatos} depois), ${comparando}.`, metrica: m.campo, variacao: null };
  }
  const a = antes[m.campo], d = depois[m.campo];
  const variacao = a === 0 ? (d === 0 ? 0 : (d > 0 ? Infinity : -Infinity)) : (d - a) / Math.abs(a);
  if (Math.abs(variacao) < MUDANCA_MINIMA) {
    return { veredito: 'sem_diferenca', texto: `Sem diferença clara: ${m.frase(a, d)} (mudança menor que ${Math.round(MUDANCA_MINIMA * 100)}%), ${comparando}.`, metrica: m.campo, variacao: T.arredondar(variacao, 4) };
  }
  const melhorou = variacao * m.sentido > 0;
  const texto = `${melhorou ? 'Melhorou' : 'Piorou'}: ${m.frase(a, d)}, ${comparando}.`;
  return { veredito: melhorou ? 'melhorou' : 'piorou', texto, metrica: m.campo, variacao: Number.isFinite(variacao) ? T.arredondar(variacao, 4) : null };
}

/** A base da medida: 'campanha' | 'plataforma' | 'oficina'. PURA. */
function baseDoAlvo(alvo, tipo) {
  const a = objeto(alvo) || {};
  if (a.plataforma === 'meta' || a.plataforma === 'google') {
    if (a.nivel === 'campanha' && (a.ext || a.nome) && tipo !== 'pausar') return 'campanha';
    return 'plataforma';
  }
  return 'oficina';
}
function rotuloDaBase(base, alvo) {
  const a = objeto(alvo) || {};
  if (base === 'campanha') return `a campanha ${a.nome || a.ext}`;
  if (base === 'plataforma') return `o ${ROTULO_PLATAFORMA[a.plataforma] || 'anúncio'} inteiro`;
  return 'a oficina toda';
}

/* ---------- o diário ---------- */

/**
 * Cria o diário. Opções (para teste): sb, fonte, campanhas (motor/campanhas), agora, nomesDosPerfis(ids) → Map(id → { nome }).
 */
function criarDiario(opcoes = {}) {
  const cfg = { sb: null, fonte: null, campanhas: null, agora: null, nomesDosPerfis: null, ...opcoes };
  const banco = () => cfg.sb || require('../db').sb;
  const fonte = () => cfg.fonte || require('../motor/fonte').padrao();
  const campanhas = () => cfg.campanhas || require('../motor/campanhas');
  const agora = () => (cfg.agora ? cfg.agora() : Date.now());
  const hoje = () => P.hojeBR(agora());
  const agoraIso = () => new Date(agora()).toISOString();

  async function nomesDe(ids) {
    const unicos = [...new Set(ids.filter(x => UUID.test(String(x || ''))))];
    if (!unicos.length) return new Map();
    try {
      const fn = cfg.nomesDosPerfis || (lista => require('../equipe').banco().nomesDosPerfis(lista));
      const m = await fn(unicos);
      return m instanceof Map ? m : new Map();
    } catch { return new Map(); }
  }
  async function nomesDasChaves(ids) {
    const unicos = [...new Set(ids.filter(x => UUID.test(String(x || ''))))];
    if (!unicos.length) return new Map();
    try {
      const { data, error } = await banco().from('trafego_ia_chaves').select('id, nome').in('id', unicos);
      return error ? new Map() : new Map((data || []).map(c => [String(c.id), c.nome]));
    } catch { return new Map(); }
  }

  /** Várias linhas no formato da API (resolve os nomes de quem decidiu e de quem registrou). */
  async function formatarVarias(linhas) {
    const lista = linhas || [];
    const pessoas = lista.flatMap(l => [l.decidida_por, l.origem === 'pessoa' ? l.autor : null]);
    const chavesIds = lista.filter(l => l.origem === 'externa').map(l => String(l.autor || '').replace(/^chave:/, ''));
    const [nomes, chaves] = await Promise.all([nomesDe(pessoas), nomesDasChaves(chavesIds)]);
    return lista.map(l => formatarAcao(l, { nomes, chaves }));
  }
  const formatarUma = async linha => (linha ? (await formatarVarias([linha]))[0] : null);

  async function lerLinha(id) {
    if (!UUID.test(String(id || ''))) return null;
    const { data, error } = await banco().from('trafego_acoes').select(COLUNAS).eq('id', id).maybeSingle();
    if (error) { if (tabelaAusente(error)) throw semMigracao(); throw temporario(); }
    return data || null;
  }
  /** Uma ação no formato da API, ou null. */
  async function lerAcao(id) { return formatarUma(await lerLinha(id)); }

  /** GET /api/acoes-trafego */
  async function listar({ status = null, limite = null } = {}) {
    const lista = status ? String(status).split(',').map(s => s.trim()).filter(Boolean) : [];
    const fora = lista.find(s => !STATUS.includes(s));
    if (fora) throw new ErroDoDiario(422, 'status', `Status desconhecido: use ${STATUS.join(', ')}.`);
    const n = Number.parseInt(limite, 10);
    const lim = Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_LISTA) : PADRAO_LISTA;
    const zeros = Object.fromEntries(STATUS.map(s => [s, 0]));
    let q = banco().from('trafego_acoes').select(COLUNAS, { count: 'exact' });
    if (lista.length) q = q.in('status', lista);
    const { data, error, count } = await q.order('criada_em', { ascending: false }).limit(lim);
    if (error) {
      if (tabelaAusente(error)) return { ligado: false, aviso: FALTA_MIGRACAO, total: 0, contagem: zeros, acoes: [] };
      throw temporario();
    }
    const contagem = { ...zeros };
    const todas = await banco().from('trafego_acoes').select('status').limit(5000).then(r => r, () => ({ data: null }));
    for (const l of (todas && todas.data) || []) if (l.status in contagem) contagem[l.status]++;
    const acoes = await formatarVarias(data || []);
    return { ligado: true, aviso: null, total: typeof count === 'number' ? count : acoes.length, contagem, acoes };
  }

  /* ---------- medir ---------- */

  /** Os números da base do alvo num período (dias completos). Nunca lança: em falha devolve a medida com `erro`. */
  async function medir(alvo, tipo, { de, ate }, baseForcada = null) {
    const base = baseForcada || baseDoAlvo(alvo, tipo);
    const dias = de && ate && de <= ate ? P.contarDias(de, ate) : 0;
    const medida = { de, ate, periodo: de && ate ? rotuloPeriodo(de, ate) : null, dias, base, base_rotulo: rotuloDaBase(base, alvo),
      gasto: null, contatos: null, fecharam: null, faturado: null, custo_por_contato: null, retorno: null, contatos_por_dia: null,
      gasto_ligado: false, medido_em: agoraIso(), erro: null };
    if (!dias) return medida;
    try {
      const a = objeto(alvo) || {};
      const q = new URLSearchParams({ de, ate });
      if (base !== 'oficina') q.set('plataforma', a.plataforma);
      const lista = await campanhas().responderLista({ q, fonte: fonte() });
      const ligado = !!(lista && lista.estado && lista.estado.gasto === 'real');
      let n = null;
      if (base === 'oficina') {
        const cont = await fonte().contatos({ de, ate });
        const r = S.resumo((cont && cont.itens) || []);
        n = { contatos: r.contatos, fecharam: r.fecharam, faturado: r.faturado,
          gasto: lista.totais ? lista.totais.gasto : null, custo_por_contato: lista.totais ? lista.totais.custo_por_contato : null, retorno: lista.totais ? lista.totais.retorno : null };
      } else if (base === 'campanha') {
        const c = (lista.campanhas || []).find(x => x.plataforma === a.plataforma
          && ((a.ext && x.ext != null && String(x.ext) === String(a.ext)) || (!a.ext && a.nome && normal(x.nome) === normal(a.nome))));
        n = c || { gasto: ligado ? 0 : null, contatos: 0, fecharam: 0, faturado: 0, custo_por_contato: null, retorno: null };
        if (!c) medida.observacao = 'A campanha não apareceu neste período.';
      } else {
        n = lista.totais || {};
      }
      medida.contatos = T.numOuNulo(n.contatos);
      medida.fecharam = T.numOuNulo(n.fecharam);
      medida.faturado = T.numOuNulo(n.faturado);
      medida.gasto = ligado ? T.numOuNulo(n.gasto) : null;
      medida.custo_por_contato = ligado ? T.numOuNulo(n.custo_por_contato) : null;
      medida.retorno = ligado ? T.numOuNulo(n.retorno) : null;
      medida.contatos_por_dia = medida.contatos != null ? T.arredondar(medida.contatos / dias) : null;
      medida.gasto_ligado = ligado;
    } catch (e) {
      medida.erro = 'Não deu para ler os números agora.';
      Registro.evento('warn', 'diario_medida_falhou', { erro: Registro.limpar(e && e.message), base });
    }
    return medida;
  }

  /** Os 7 dias completos antes de `dia`. */
  const medirAntes = (alvo, tipo, dia) => medir(alvo, tipo, { de: P.somarDias(dia, -DIAS_ANTES), ate: P.somarDias(dia, -1) });

  /** A janela de depois de uma ação feita: do dia seguinte ao "feita" até a véspera de medir_em (no máximo 7 dias). */
  function janelaDepois(linha) {
    const feita = P.diaBR(linha.feita_em);
    if (!feita || !linha.medir_em) return null;
    const ate = P.somarDias(linha.medir_em, -1);
    const de = maiorData(P.somarDias(ate, -(DIAS_DEPOIS - 1)), P.somarDias(feita, 1));
    return { de, ate };
  }

  /* ---------- escritas de pessoa ---------- */

  function lerNota(v) {
    if (v == null || v === '') return null;
    if (typeof v !== 'string') throw new ErroDoDiario(422, 'nota', 'A nota precisa ser um texto.');
    const t = O.texto(v, MAX_NOTA * 2);
    if (t && t.length > MAX_NOTA) throw new ErroDoDiario(422, 'nota', `A nota pode ter no máximo ${MAX_NOTA} letras.`);
    return t;
  }
  const venceu = linha => linha.status === 'proposta' && Date.parse(linha.criada_em) < agora() - DIAS_PARA_EXPIRAR * DIA_MS;

  /** Grava o patch só se o status ainda é o esperado (duas pessoas decidindo ao mesmo tempo: só uma ganha). */
  async function atualizarSe(id, statusEsperado, patch) {
    let q = banco().from('trafego_acoes').update(patch).eq('id', id);
    if (statusEsperado) q = q.eq('status', statusEsperado);
    const { data, error } = await q.select(COLUNAS);
    if (error) { if (tabelaAusente(error)) throw semMigracao(); throw new ErroDoDiario(503, 'temporario', 'Não deu para gravar agora. Tente de novo em instantes.'); }
    return (data || [])[0] || null;
  }

  /** POST /api/acoes-trafego/:id/decidir: só pessoa logada (a rota garante). */
  async function decidir(id, corpo, usuario) {
    const c = objeto(corpo) || {};
    if (c.decisao !== 'aceitar' && c.decisao !== 'recusar') throw new ErroDoDiario(422, 'decisao', 'Diga se aceita ou recusa: "decisao" precisa ser "aceitar" ou "recusar".');
    const nota = lerNota(c.nota);
    const linha = await lerLinha(id);
    if (!linha) throw new ErroDoDiario(404, 'nao_existe', 'Essa proposta não existe mais.');
    if (venceu(linha)) {
      await atualizarSe(linha.id, 'proposta', { status: 'expirada' }).catch(() => null);
      throw new ErroDoDiario(409, 'expirada', `Essa proposta passou de ${DIAS_PARA_EXPIRAR} dias sem decisão e expirou. Peça uma nova ao Gestor se ainda fizer sentido.`);
    }
    if (linha.status !== 'proposta') throw new ErroDoDiario(409, 'ja_decidida', `Essa proposta já foi decidida (${(ROTULO_STATUS[linha.status] || linha.status).toLowerCase()}).`);
    const patch = { status: c.decisao === 'aceitar' ? 'aceita' : 'recusada', decidida_por: UUID.test(String(usuario && usuario.id)) ? usuario.id : null, decidida_em: agoraIso(), nota };
    if (c.decisao === 'aceitar') patch.antes = await medirAntes(linha.alvo, linha.tipo, hoje());
    const nova = await atualizarSe(linha.id, 'proposta', patch);
    if (!nova) throw new ErroDoDiario(409, 'ja_decidida', 'Alguém decidiu essa proposta agora há pouco. Atualize a tela.');
    return formatarUma(nova);
  }

  /** POST /api/acoes-trafego/:id/feita: a pessoa fez a mudança no gerenciador de anúncios. */
  async function marcarFeita(id, corpo, usuario) {
    const c = objeto(corpo) || {};
    const nota = lerNota(c.nota);
    const linha = await lerLinha(id);
    if (!linha) throw new ErroDoDiario(404, 'nao_existe', 'Essa proposta não existe mais.');
    if (linha.status !== 'aceita') throw new ErroDoDiario(409, 'nao_aceita', 'Só dá para marcar como feita uma proposta aceita.');
    const minimo = P.somarDias(hoje(), MIN_DIAS_DEPOIS + 1);
    let medir = linha.medir_em, aviso = null;
    if (!medir || medir < minimo) {
      medir = P.somarDias(hoje(), DIAS_DEPOIS);
      aviso = `A medição passou para ${P.ddmm(medir)}: antes disso não daria tempo de ver o efeito da mudança.`;
    }
    const patch = { status: 'feita', feita_em: agoraIso(), medir_em: medir, depois: null, veredito: null };
    if (nota) patch.nota = linha.nota ? O.texto(`${linha.nota} | Feita: ${nota}`, 700) : nota;
    if (!linha.antes) patch.antes = await medirAntes(linha.alvo, linha.tipo, P.diaBR(linha.decidida_em) || hoje());
    const nova = await atualizarSe(linha.id, 'aceita', patch);
    if (!nova) throw new ErroDoDiario(409, 'nao_aceita', 'Essa proposta mudou agora há pouco. Atualize a tela.');
    void usuario;
    return { acao: await formatarUma(nova), aviso };
  }

  /** POST /api/acoes-trafego: a pessoa registra uma decisão que tomou por conta própria. */
  async function registrarPropria(corpo, usuario) {
    const c = objeto(corpo) || {};
    if (!TIPOS.includes(c.tipo)) throw new ErroDoDiario(422, 'tipo', `Escolha o tipo da mudança: ${TIPOS.join(', ')}.`);
    const titulo = typeof c.titulo === 'string' ? O.texto(c.titulo, 200) : null;
    if (!titulo || titulo.length < 5 || titulo.length > 120) throw new ErroDoDiario(422, 'titulo', 'Escreva o que foi feito em 5 a 120 letras.');
    let porque = null;
    if (c.porque != null && c.porque !== '') {
      if (typeof c.porque !== 'string') throw new ErroDoDiario(422, 'porque', 'O "porquê" precisa ser um texto.');
      porque = O.texto(c.porque, 1200);
      if (porque && porque.length > 1000) throw new ErroDoDiario(422, 'porque', 'O "porquê" pode ter no máximo 1000 letras.');
    }
    let alvo = null;
    if (c.alvo != null) {
      const a = objeto(c.alvo);
      if (!a || !PLATAFORMAS_ALVO.includes(a.plataforma) || !NIVEIS_ALVO.includes(a.nivel)) {
        throw new ErroDoDiario(422, 'alvo', `O alvo precisa de "plataforma" (${PLATAFORMAS_ALVO.join(', ')}) e "nivel" (${NIVEIS_ALVO.join(', ')}).`);
      }
      alvo = { plataforma: a.plataforma, nivel: a.nivel, ext: O.texto(a.ext, 80), nome: O.texto(a.nome, 120) };
    }
    const jaFiz = c.ja_fiz === true;
    const dia = hoje();
    let medir = P.somarDias(dia, DIAS_DEPOIS);
    if (c.medir_em != null && c.medir_em !== '') {
      const minimo = jaFiz ? P.somarDias(dia, MIN_DIAS_DEPOIS + 1) : P.somarDias(dia, 1);
      if (typeof c.medir_em !== 'string' || !DATA.test(c.medir_em) || !P.dataValida(c.medir_em) || c.medir_em < minimo || c.medir_em > P.somarDias(dia, 90)) {
        throw new ErroDoDiario(422, 'medir_em', `"medir_em" é a data de conferir o efeito: de ${P.ddmm(minimo)} até daqui a 90 dias.`);
      }
      medir = c.medir_em;
    }
    const nota = lerNota(c.nota);
    const quem = UUID.test(String(usuario && usuario.id)) ? usuario.id : null;
    const linha = {
      criada_em: agoraIso(), origem: 'pessoa', autor: quem, tipo: c.tipo, titulo, porque, alvo,
      evidencias: { itens: [], verba: null, risco: 'normal', risco_motivo: null },
      status: jaFiz ? 'feita' : 'aceita', decidida_por: quem, decidida_em: agoraIso(), feita_em: jaFiz ? agoraIso() : null,
      nota, medir_em: medir, antes: await medirAntes(alvo, c.tipo, dia),
    };
    const { data, error } = await banco().from('trafego_acoes').insert(linha).select(COLUNAS).single();
    if (error) { if (tabelaAusente(error)) throw semMigracao(); throw new ErroDoDiario(503, 'temporario', 'Não deu para gravar agora. Tente de novo em instantes.'); }
    return formatarUma(data);
  }

  /* ---------- rotina ---------- */

  /** Propostas sem decisão há mais de 14 dias viram "expirada". Devolve quantas. */
  async function expirar() {
    const limite = new Date(agora() - DIAS_PARA_EXPIRAR * DIA_MS).toISOString();
    const { data, error } = await banco().from('trafego_acoes').update({ status: 'expirada' }).eq('status', 'proposta').lt('criada_em', limite).select('id');
    if (error) { if (tabelaAusente(error)) throw semMigracao(); throw temporario(); }
    return (data || []).length;
  }

  /** POST /api/cron/medir: expira e mede o que chegou na data. */
  async function rodarRotina() {
    let expiradas;
    try { expiradas = await expirar(); }
    catch (e) { if (e.codigo === 'sem_migracao') return { ok: false, codigo: 'sem_migracao', erro: FALTA_MIGRACAO }; throw e; }
    const dia = hoje();
    const { data, error } = await banco().from('trafego_acoes').select(COLUNAS).in('status', ['aceita', 'feita']).lte('medir_em', dia).is('veredito', null)
      .order('medir_em', { ascending: true }).limit(MAX_MEDIR_POR_VEZ);
    if (error) throw temporario();
    const medidas = [];
    let erros = 0;
    for (const linha of data || []) {
      try {
        const janela = linha.status === 'feita' ? janelaDepois(linha) : null;
        const base = (objeto(linha.antes) && linha.antes.base) || null;
        const depois = janela ? await medir(linha.alvo, linha.tipo, janela, base) : null;
        const j = julgar({ status: linha.status, feita_em: linha.feita_em, antes: objeto(linha.antes), depois });
        const gravar = { ...(depois || { medido_em: agoraIso() }), leitura: j.texto, metrica: j.metrica, variacao: j.variacao };
        const r = await banco().from('trafego_acoes').update({ depois: gravar, veredito: j.veredito }).eq('id', linha.id).is('veredito', null).select('id');
        if (r.error) throw new Error(r.error.message);
        medidas.push({ id: linha.id, veredito: j.veredito });
      } catch (e) {
        erros++;
        Registro.evento('warn', 'diario_medir_falhou', { id: linha.id, erro: Registro.limpar(e && e.message) });
      }
    }
    return { ok: true, expiradas, medidas, erros };
  }

  return { listar, lerAcao, decidir, marcarFeita, registrarPropria, medir, medirAntes, janelaDepois, expirar, rodarRotina, formatarVarias,
    trocar(novas = {}) { Object.assign(cfg, novas); } };
}

let _padrao = null;
const padrao = () => (_padrao || (_padrao = criarDiario()));

module.exports = {
  TIPOS, STATUS, PLATAFORMAS_ALVO, NIVEIS_ALVO, DIAS_PARA_EXPIRAR, MIN_CONTATOS, MUDANCA_MINIMA, MIN_DIAS_DEPOIS,
  ROTULO_STATUS, ROTULO_ORIGEM, ROTULO_TIPO, ROTULO_VEREDITO, FALTA_MIGRACAO, COLUNAS,
  ErroDoDiario, formatarAcao, lerEvidencias, rotuloDoAlvo, julgar, baseDoAlvo, criarDiario, padrao,
};
