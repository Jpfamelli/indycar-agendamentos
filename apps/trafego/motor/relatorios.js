/* ============================================================
   Relatórios da tela nova (rodada 8, frente T2a) — contrato da API §5.5:

     GET /api/relatorios/texto?tipo=diario|semanal|mensal[&mes=AAAA-MM]  ->  { titulo, texto } pronto para WhatsApp
     GET /api/relatorios/folha?mes=AAAA-MM                               ->  dados da folha A4 do mês
     GET /api/relatorios/apresentacao[?periodo=…]                         ->  dados do modo apresentação

   De onde vem o texto:
   - havendo gasto (real, ou só demonstração), o texto é o do núcleo do Nexus Ads (motor/nucleo.mjs: relDiario,
     relSemanal, relMensal), que é o motor único dos relatórios; ele recebe as métricas sem demonstração misturada
     e os contatos da jornada, e sai pelas palavras da casa (textoDaCasa: sem travessão, sem sigla solta);
   - sem gasto nenhum no trecho (sem conta ligada, a situação de hoje), o núcleo só falaria de zeros: o texto é o
     do lado da oficina, montado aqui com as MESMAS somas de /api/hoje (motor/soma.js).
   Janelas: diário = ontem; semanal = os 7 dias até ontem; mensal = o mês pedido (padrão: o mês passado).
   A folha e a apresentação reaproveitam as respostas de /api/hoje e /api/campanhas (mesma memória de 30 s).
   ============================================================ */
'use strict';

const P = require('./periodo');
const T = require('./texto');
const S = require('./soma');
const Ad = require('./adaptador');
const Hoje = require('./hoje');
const Campanhas = require('./campanhas');
const Fonte = require('./fonte');

const TIPOS = Object.freeze(['diario', 'semanal', 'mensal']);
const MAX_DIAS_DO_MOTOR = 400;
const MAX_CAMPANHAS_FOLHA = 8;
const MAX_CAMPANHAS_APRESENTACAO = 5;
const SEMANA_CURTA = Object.freeze(['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']);
/** Espaço que não quebra (160) e o estreito (8239), escritos pelo código do caractere. */
const ESPACO_ESPECIAL = new RegExp(`[${String.fromCharCode(160, 8239)}]`, 'g');

/* ---------- janelas ---------- */

/** O mês do relatório mensal: ?mes=AAAA-MM; sem ele, o mês passado. */
function mesDoRelatorio(q, hoje) {
  if (q.get('mes')) return P.mesDaConsulta(q, { hoje });
  const passado = P.somarDias(P.inicioDoMes(hoje), -1);
  return P.mesDaConsulta(new URLSearchParams(`mes=${passado.slice(0, 7)}`), { hoje });
}

/** { tipo, de, ate, rotulo, titulo, mes? } da janela de cada relatório. 400 para tipo que não existe. */
function janelaDoTexto(q, hoje) {
  const tipo = q.get('tipo') || 'diario';
  if (!TIPOS.includes(tipo)) throw P.recusar('Escolha o relatório: diario, semanal ou mensal.');
  const ontem = P.somarDias(hoje, -1);
  if (tipo === 'diario') return { tipo, de: ontem, ate: ontem, titulo: `Relatório de ontem (${SEMANA_CURTA[P.diaDaSemana(ontem)]}, ${P.ddmm(ontem)})` };
  if (tipo === 'semanal') { const de = P.somarDias(ontem, -6); return { tipo, de, ate: ontem, titulo: `Relatório da semana (${P.ddmm(de)} a ${P.ddmm(ontem)})` }; }
  const m = mesDoRelatorio(q, hoje);
  return { tipo, de: m.de, ate: m.ate, mes: m, titulo: `Relatório de ${m.rotulo.toLowerCase()}${m.fechado ? '' : ' (até agora)'}` };
}

/* ---------- texto do lado da oficina (sem gasto) ---------- */

/**
 * O relatório em texto quando não há gasto no trecho: contatos, serviços fechados, faturado, de onde vieram,
 * por que não fecharam e o que precisa de atenção. PURA. d = { janela, itens, conexoes, estadoGasto }.
 */
function textoDaOficina({ janela, itens = [], conexoes = null, estadoGasto = 'sem_conta' }) {
  const r = S.resumo(itens), pagos = itens.filter(S.deAnuncio), rAn = S.resumo(pagos);
  const L = [`*IndyCar · ${janela.titulo}*`, ''];
  L.push('*Contatos*');
  if (!r.contatos) L.push('• Nenhum contato novo neste período.');
  else {
    L.push(`• ${T.plural(r.contatos, 'contato novo', 'contatos novos')}, ${T.inteiro(rAn.contatos)} de anúncio`);
    if (r.fecharam) {
      const valor = r.faturado != null ? `, ${T.dinheiro(r.faturado)} faturados` : '';
      const falta = r.sem_valor ? ` (falta o valor de ${T.plural(r.sem_valor, 'serviço', 'serviços')})` : '';
      L.push(`• ${T.plural(r.fecharam, 'serviço fechado', 'serviços fechados')}${valor}${falta}`);
    } else L.push('• Nenhum serviço fechado ainda entre esses contatos.');
    const f = S.funil(itens);
    if (f.nao_fecharam.total) {
      const motivo = f.nao_fecharam.motivos[0];
      L.push(`• Não fecharam: ${T.inteiro(f.nao_fecharam.total)}${motivo ? ` (o motivo que mais aparece: ${motivo.rotulo.toLowerCase()})` : ''}`);
    }
    L.push('', '*De onde vieram*');
    for (const o of Hoje.origensDoPeriodo(itens, { conhecido: false, tipo: 'vazio', linhas: [] }).slice(0, 6)) {
      L.push(`• ${o.rotulo}: ${T.inteiro(o.contatos)}${o.fecharam ? `, ${T.plural(o.fecharam, 'fechou', 'fecharam')}` : ''}`);
    }
  }
  L.push('', '*Anúncios*');
  L.push(estadoGasto === 'sem_conta'
    ? '• A conta de anúncios não está ligada: o gasto e o retorno não aparecem aqui.'
    : '• Não chegou número de anúncio deste período.');
  const wa = conexoes && conexoes.whatsapp;
  if (wa && wa.situacao !== 'ok' && wa.aviso) L.push('', '*Atenção*', `• ${wa.aviso}`);
  L.push('', 'IndyCar Tráfego');
  return T.textoDaCasa(L.join('\n'));
}

/* ---------- texto do núcleo (com gasto) ---------- */

/** O texto do núcleo para a janela. `M` = motor montado (Ad.montarMotor). null se o núcleo não tem o trecho. */
function textoDoNucleo(M, janela) {
  if (janela.tipo === 'diario') return M.relDiario(M.R);
  if (janela.tipo === 'semanal') return M.relSemanal(M.R);
  const [ano, mes] = janela.mes.mes.split('-').map(Number);
  const m = M.mesesDados().find(x => x.ano === ano && x.mes === mes - 1);
  return m ? M.relMensal(m) : null;
}

/* ---------- leitura ---------- */

const medirCom = pedido => (nome, fn) => (pedido && typeof pedido.medir === 'function' ? pedido.medir(nome, fn) : fn());

/**
 * GET /api/relatorios/texto. Devolve { tipo, titulo, texto, periodo: { de, ate }, estado: { gasto, demo }, motor }.
 * `motor` (a mais) diz quem escreveu: 'nucleo' (com gasto) ou 'oficina' (sem gasto).
 */
function responderTexto({ q = new URLSearchParams(), pedido = null, fonte = Fonte.padrao() } = {}) {
  const hoje = fonte.hoje();
  const janela = janelaDoTexto(q, hoje);
  const fresco = q.get('fresco') === '1', o = { fresco }, medir = medirCom(pedido);
  return fonte.guardar(`texto|${janela.tipo}|${janela.de}|${janela.ate}`, async () => {
    // o núcleo compara com o trecho anterior (dia, semana ou mês antes): lê desde o começo do trecho anterior
    const inicio = janela.tipo === 'mensal' ? P.inicioDoMes(P.somarDias(janela.de, -1)) : P.somarDias(janela.ate, -13);
    const ontem = P.somarDias(hoje, -1);
    const [linhas, haReal, contatos, config, conexoes] = await Promise.all([
      medir('metricas', () => fonte.metricas({ de: inicio, ate: ontem, niveis: ['campanha', 'anuncio'] }, o)),
      medir('ha_real', () => fonte.haReal(o)),
      medir('contatos', () => fonte.contatos({ de: inicio, ate: ontem }, o)),
      medir('metas', () => fonte.config(o)),
      medir('conexoes', () => fonte.conexoes(o)),
    ]);
    const g = S.gastoDoTrecho(S.linhasEntre(linhas, janela.de, janela.ate), { haReal });
    const estadoGasto = S.estadoDoGasto(g.tipo, { haReal, conexoes });
    const doTrecho = S.noPeriodo(contatos.itens, janela.de, janela.ate);
    let texto = null, motor = 'oficina';
    if (g.conhecido) {
      const todas = S.gastoDoTrecho(linhas, { haReal }).linhas;
      const dias = Math.min(MAX_DIAS_DO_MOTOR, P.contarDias(inicio, ontem));
      texto = await medir('motor', async () => {
        const { M } = await Ad.montarMotor({ metricas: todas, contatos: contatos.itens, config, hoje, dias });
        return textoDoNucleo(M, janela);
      });
      if (texto) {
        motor = 'nucleo';
        // o núcleo formata dinheiro com espaço que não quebra (o do Intl): vira espaço comum, como no resto do app
        texto = T.textoDaCasa(texto).replace(ESPACO_ESPECIAL, ' ');
        if (g.tipo === 'demo') texto = `Números de demonstração: ligue a conta de anúncios para ver os da oficina.\n\n${texto}`;
      }
    }
    if (!texto) texto = textoDaOficina({ janela, itens: doTrecho, conexoes, estadoGasto });
    return { tipo: janela.tipo, titulo: janela.titulo, texto, periodo: { de: janela.de, ate: janela.ate },
      estado: { gasto: estadoGasto, demo: estadoGasto === 'demo', incompleto: fonte.falhas(), reserva: !!contatos.reserva }, motor };
  }, o);
}

/** O período (formato do contrato) de um mês: o anterior é o mês de antes até o mesmo dia. */
function periodoDoMes(m) {
  const antesDe = P.inicioDoMes(P.somarDias(m.de, -1));
  const antesAte = m.fechado ? P.fimDoMes(antesDe) : P.mesmoDiaMesesAtras(m.ate, 1);
  return { de: m.de, ate: m.ate, rotulo: m.rotulo, anterior: { de: antesDe, ate: antesAte < antesDe ? antesDe : antesAte }, chave: 'datas' };
}

const semSerie = c => { const { serie, ...resto } = c; return resto; };

/** GET /api/relatorios/folha?mes=AAAA-MM: tudo o que a folha A4 do mês mostra. */
function responderFolha({ q = new URLSearchParams(), pedido = null, fonte = Fonte.padrao() } = {}) {
  const hoje = fonte.hoje();
  const m = P.mesDaConsulta(q, { hoje });
  const fresco = q.get('fresco') === '1';
  return fonte.guardar(`folha|${m.mes}|${m.ate}`, async () => {
    const periodo = periodoDoMes(m);
    const consulta = new URLSearchParams(`de=${periodo.de}&ate=${periodo.ate}${fresco ? '&fresco=1' : ''}`);
    const [painel, campanhas, relatorio] = await Promise.all([
      Hoje.carregarEMontar({ periodo, fonte, fresco, pedido }),
      Campanhas.responderLista({ q: consulta, pedido, fonte }),
      responderTexto({ q: new URLSearchParams(`tipo=mensal&mes=${m.mes}${fresco ? '&fresco=1' : ''}`), pedido, fonte }),
    ]);
    return {
      mes: { mes: m.mes, de: m.de, ate: m.ate, rotulo: m.rotulo, fechado: m.fechado },
      periodo: painel.periodo, estado: painel.estado,
      titulo: `IndyCar · Tráfego · ${m.rotulo}`,
      frase: painel.frase, numeros: painel.numeros, derivados: painel.derivados, funil: painel.funil, origens: painel.origens,
      campanhas: campanhas.campanhas.slice(0, MAX_CAMPANHAS_FOLHA).map(semSerie), sem_campanha: campanhas.sem_campanha,
      horarios: { pico: campanhas.horarios.pico, leitura: campanhas.horarios.leitura },
      texto: relatorio.texto,
      gerado_em: new Date(fonte.agora()).toISOString(),
    };
  }, { fresco });
}

/**
 * GET /api/relatorios/apresentacao[?periodo=…]: as telas do modo apresentação, na ordem em que passam.
 * Cada tela: { id, titulo, … } com o que ela mostra. Mesmo período e mesmas contas de /api/hoje.
 */
async function responderApresentacao({ q = new URLSearchParams(), pedido = null, fonte = Fonte.padrao() } = {}) {
  const [painel, campanhas] = await Promise.all([Hoje.responder({ q, pedido, fonte }), Campanhas.responderLista({ q, pedido, fonte })]);
  const etapas = painel.funil.etapas.filter(e => ['contato', 'agendou', 'veio', 'fechou'].includes(e.id));
  const telas = [
    { id: 'resumo', titulo: painel.periodo.rotulo, frase: painel.frase },
    { id: 'numeros', titulo: 'Os números', numeros: painel.numeros.map(({ serie, ...n }) => n) },
    { id: 'funil', titulo: 'Do contato ao serviço fechado', etapas, nao_fecharam: painel.funil.nao_fecharam },
    { id: 'origens', titulo: 'De onde vieram os contatos', origens: painel.origens },
  ];
  const top = campanhas.campanhas.slice(0, MAX_CAMPANHAS_APRESENTACAO).map(c => ({ plataforma: c.plataforma, nome: c.nome, gasto: c.gasto, contatos: c.contatos,
    fecharam: c.fecharam, faturado: c.faturado, custo_por_contato: c.custo_por_contato, retorno: c.retorno, leitura: c.leitura }));
  if (top.length) telas.push({ id: 'campanhas', titulo: 'Campanhas', campanhas: top });
  telas.push({ id: 'proximos', titulo: 'O que fazer agora', itens: painel.fazer });
  return { periodo: painel.periodo, estado: painel.estado, telas, gerado_em: painel.gerado_em };
}

module.exports = {
  TIPOS, mesDoRelatorio, janelaDoTexto, textoDaOficina, textoDoNucleo, periodoDoMes,
  responderTexto, responderFolha, responderApresentacao,
};
