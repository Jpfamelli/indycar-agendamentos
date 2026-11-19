/* ============================================================
   IndyCar — Central de Tráfego Pago (Node puro, sem framework)

   Módulo 1 · Painel: Meta + Google num lugar só, com metas e ranking.
   Módulo 2 · Radar: regras de alerta e relatório diário no WhatsApp.

   Contrato das rotas /api/*: resposta SEMPRE em JSON; erro vem como
   { erro } com o status certo (400 corpo ruim, 401 sem login, 403 sem
   perfil, 404 rota, 405 método, 413 corpo grande, 500 o resto).
   ============================================================ */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

/* Configuração por arquivo .env — `setx` não funciona na máquina do dono
   (acesso ao Registro negado). Variáveis já no ambiente têm prioridade. */
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) { process.loadEnvFile(envPath); console.log('📄 Configuração lida de .env'); }
} catch (e) { console.warn('⚠️  Não consegui ler o .env:', e.message); }

const db = require('./db');
const painel = require('./painel');
const coletor = require('./coletor');
const radar = require('./radar');
const relatorio = require('./relatorio');
const agenda = require('./agenda');
const auth = require('./auth');
const whatsapp = require('./whatsapp');
const M = require('./metricas');
const resultados = require('./resultados');
const atribuicao = require('./atribuicao');
const conexoes = require('./conexoes');
const leitura = require('./leitura');
const equipe = require('./equipe');
const seg = require('./seguranca');
const semanal = require('./semanal');
const leads = require('./leads');
const Fila = require('./fila');

const compressao = require('./compressao');
const Estatico = require('./estatico');
const Registro = require('./registro');
const enderecos = require('./enderecos');

const PORT = process.env.PORT || 3400;
const VERSAO = (() => { try { return require('./package.json').version; } catch { return '?'; } })();
const PUBLIC = path.join(__dirname, 'public');
const CRON_TOKEN = process.env.ADS_CRON_TOKEN || '';
const LIMITE_CORPO = 1_000_000;   // 1 MB — nenhuma rota precisa de mais

/* Rodada 8: a tela nova mora em tela/ (raiz do app quando existir tela/index.html) e a antiga
   continua em /antiga/. Tipos, cache e a regra de prefixo estão em estatico.js. */
const TELA = path.join(__dirname, 'tela');

class ErroHttp extends Error {
  constructor(status, mensagem, extra = {}) { super(mensagem); this.status = status; this.publico = true; this.extra = extra; }
}

/* Cabeçalhos de segurança em TODA resposta (CSP, HSTS, Permissions-Policy…). */
const cabecalhosBase = seg.cabecalhos;

/* Limites: por IP em toda a API e por usuário nas rotas caras. */
const limitador = seg.criarLimitador();
const LIMITE_IP_MIN = 300;

/* O cliente do Supabase da tela vem do node_modules (sem CDN de terceiro). */
function acharNoNodeModules(...partes) {
  for (let dir = __dirname, anterior = ''; dir !== anterior; anterior = dir, dir = path.dirname(dir)) {
    const alvo = path.join(dir, 'node_modules', ...partes);
    if (fs.existsSync(alvo)) return alvo;
  }
  return path.join(__dirname, 'node_modules', ...partes);
}
const VENDOR = {
  '/vendor/supabase.js': acharNoNodeModules('@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'),
};

const json = (res, code, dados) => {
  // Rodada 4: respostas grandes (painel, ranking, resultados) vão com gzip quando o navegador aceita.
  const tipo = 'application/json; charset=utf-8';
  const { corpo, cabecalhos } = compressao.preparar(res.req, Buffer.from(JSON.stringify(dados)), tipo);
  res.writeHead(code, {
    'Content-Type': tipo,
    'Content-Length': corpo.length,
    'Cache-Control': 'no-store',
    ...cabecalhos,
  });
  res.end(corpo);
};

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let bruto = '', excedeu = false;
    req.on('data', c => {
      if (excedeu) return;
      bruto += c;
      if (bruto.length > LIMITE_CORPO) {
        excedeu = true;
        reject(new ErroHttp(413, 'corpo da requisição muito grande (máximo 1 MB)'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (excedeu) return;
      if (!bruto.trim()) return resolve({});
      try {
        const o = JSON.parse(bruto);
        resolve(o && typeof o === 'object' ? o : {});
      } catch { reject(new ErroHttp(400, 'JSON inválido no corpo da requisição')); }
    });
    req.on('error', reject);
  });
}

/* Rodada 4: arquivo da memória (comprimido uma vez) e gzip quando o navegador aceita.
   Rodada 8: tela/ na raiz, public/ em /antiga/, e nada supõe a raiz do domínio (estatico.js). */
const estatico = Estatico.criar({ dirTela: TELA, dirAntiga: PUBLIC, vendor: VENDOR, antigaLigada: process.env.TRAFEGO_TELA_ANTIGA === '1' });
const servirEstatico = (req, res, caminho) => estatico.servir(req, res, caminho);

/* ------------------------------------------------------------
   Datas e filtros do período pedido pela tela
   ------------------------------------------------------------ */
const iso = d => d.toISOString().slice(0, 10);
const DATA_ISO = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function periodoDaQuery(q) {
  const de = q.get('de'), ate = q.get('ate');
  if (de || ate) {
    const valida = s => DATA_ISO.test(s || '') && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
    if (!valida(de) || !valida(ate) || de > ate) throw new ErroHttp(400, 'Informe datas válidas, com início antes do fim.');
    if ((Date.parse(ate) - Date.parse(de)) / 86400000 >= 365) throw new ErroHttp(400, 'Escolha no máximo 365 dias.');
    return { de, ate };
  }
  const dias = Math.min(365, Math.max(1, parseInt(q.get('dias') || '7', 10) || 7));
  // Termina ontem: o dia corrente ainda está sendo preenchido pelas
  // plataformas e distorce qualquer média.
  const fim = new Date(Date.now() - 86400000);
  return { de: iso(new Date(fim.getTime() - (dias - 1) * 86400000)), ate: iso(fim) };
}

const NIVEIS = new Set(['conta', 'campanha', 'conjunto', 'anuncio']);
const PLATAFORMAS = new Set(['meta', 'google']);
const nivelDe = q => (NIVEIS.has(q.get('nivel')) ? q.get('nivel') : 'campanha');
const platDe = q => (PLATAFORMAS.has(q.get('plataforma')) ? q.get('plataforma') : null);
const limiteDe = (q, padrao, maximo) => Math.min(maximo, Math.max(1, parseInt(q.get('limite') || String(padrao), 10) || padrao));

/* O relatório completo carrega o payload inteiro; a tela só precisa disso. */
const resumoDoRelatorio = r => ({
  referencia: r.referencia, texto: r.texto, resumo_ia: r.resumo_ia,
  enviado_em: r.enviado_em, erro: r.erro, envio: r.envio, motivo_sem_envio: r.motivo_sem_envio,
});

function enviarCSV(res, nome, texto) {
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${nome.replace(/[^A-Za-z0-9_.-]/g, '_')}"`,
    'Cache-Control': 'no-store',
  });
  res.end(texto);
}

/* ------------------------------------------------------------
   Validação da configuração (Ajustes)
   ------------------------------------------------------------ */
function validarConfig(c) {
  const saida = {};
  const numOuNulo = (campo, min = 0, max = Infinity) => {
    if (!(campo in c)) return;
    if (c[campo] === null || c[campo] === '') { saida[campo] = null; return; }
    const v = Number(c[campo]);
    if (!Number.isFinite(v) || v < min || v > max) {
      throw new ErroHttp(400, `${campo}: informe um número entre ${min} e ${max === Infinity ? 'infinito' : max}`);
    }
    saida[campo] = v;
  };
  numOuNulo('cpa_alvo'); numOuNulo('roas_alvo'); numOuNulo('orcamento_mensal'); numOuNulo('ticket_medio');
  numOuNulo('margem_pct', 0, 100);
  if (saida.margem_pct === null) saida.margem_pct = 100;

  if ('whatsapp_destinos' in c) {
    if (!Array.isArray(c.whatsapp_destinos)) throw new ErroHttp(400, 'whatsapp_destinos deve ser uma lista de telefones');
    const vistos = new Set();
    saida.whatsapp_destinos = c.whatsapp_destinos
      .map(t => whatsapp.normalizar(t))
      .filter(t => t.length >= 12 && t.length <= 15 && !vistos.has(t) && vistos.add(t))
      .slice(0, 10);
  }
  if ('relatorio_ativo' in c) saida.relatorio_ativo = c.relatorio_ativo === true;
  if ('alertas_ativos' in c) saida.alertas_ativos = c.alertas_ativos !== false;
  if ('relatorio_hora' in c) {
    const h = Number(c.relatorio_hora);
    if (!Number.isInteger(h) || h < 0 || h > 23) throw new ErroHttp(400, 'relatorio_hora: use uma hora de 0 a 23');
    saida.relatorio_hora = h;
  }
  if ('alertas_intervalo_min' in c) {
    const m = Number(c.alertas_intervalo_min);
    if (!Number.isInteger(m) || m < 15 || m > 1440) throw new ErroHttp(400, 'alertas_intervalo_min: use de 15 a 1440 minutos');
    saida.alertas_intervalo_min = m;
  }
  return saida;
}

/* ------------------------------------------------------------
   Rotas com login — tabela caminho -> { MÉTODO: handler }
   Handler devolve o objeto que vira JSON 200, ou lança ErroHttp.
   ------------------------------------------------------------ */
const rotas = new Map();
const rotasPadrao = [];   // rodada 8: rotas com parâmetro no caminho (RegExp) — o handler recebe `m` (resultado do exec)
const rota = (metodo, caminho, fn) => {
  if (caminho instanceof RegExp) {
    let r = rotasPadrao.find(x => String(x.alvo) === String(caminho));
    if (!r) { r = { alvo: caminho, metodos: {} }; rotasPadrao.push(r); }
    r.metodos[metodo] = fn;
    return;
  }
  if (!rotas.has(caminho)) rotas.set(caminho, {});
  rotas.get(caminho)[metodo] = fn;
};
/* Rodada 8: rotas SEM login (cada uma cuida da própria autenticação: chave de IA, chave de cron, ou nada).
   `alvo` é o caminho exato ou uma RegExp; `opcoes.corsLivre` deixa qualquer site chamar (ex.: script de rastreio). */
const publicas = [];
const rotaPublica = (metodo, alvo, fn, opcoes = {}) => {
  let r = publicas.find(x => String(x.alvo) === String(alvo));
  if (!r) { r = { alvo, metodos: {}, opcoes }; publicas.push(r); }
  r.metodos[metodo] = fn;
};
function acharPublica(caminho) {
  for (const r of publicas) {
    if (typeof r.alvo === 'string') { if (r.alvo === caminho) return { rota: r, m: null }; }
    else { const m = r.alvo.exec(caminho); if (m) return { rota: r, m }; }
  }
  return null;
}

/* --- saúde do ecossistema (faixa no topo da tela) --- */
rota('GET', '/api/saude', async () => {
  const v = await db.lerVigia();
  return {
    ok: !v?.problema,
    versao: VERSAO,
    problema: v?.problema || null,
    // Rodada 5: o vigia pode ter mais de um problema aberto — a faixa lista todos.
    problemas: v?.problemas && typeof v.problemas === 'object' ? Object.keys(v.problemas) : (v?.problema ? [v.problema] : []),
    desde: v?.desde || null,
    checado_em: v?.checado_em || null,
    resumo: v?.ultimo_resumo || null,
    piloto: { ...agenda.estado, automatico: process.env.ADS_AUTOMATICO === '1' },
    ia: !!process.env.ANTHROPIC_API_KEY,
    ia_modelo: process.env.ANTHROPIC_API_KEY ? (await db.lerIaConfig().catch(() => db.IA_PADRAO)).modelo_rapido : null,
    supabase: auth.configurado(),
    demo: process.env.ADS_DEMO === '1',
    // Rodada 5: "modo sem chaves" — sem token real de Meta/Google, tudo que aparece é demonstração.
    chaves: await db.estadoChaves(),
    sem_chaves: !(await db.temChaves()),
    tem_dados_reais: await db.temDadosReais(),
    tem_dados: await db.temDados(),
    fila: await Fila.fila().situacao({ limite: 5 }).then(f => ({ por_status: f.por_status, ultimo_enviado_em: f.ultimo_enviado_em, ultima_falha: f.ultima_falha })).catch(() => null),
  };
});

/* ===================== LEADS · do anúncio ao CRM (rodada 5) ===================== */
const CANAL_LEAD = q => (leads.CANAIS.includes(q.get('canal')) ? q.get('canal') : null);
const STATUS_LEAD = q => (leads.STATUS.includes(q.get('status')) ? q.get('status') : null);
const BUSCA = q => String(q.get('q') || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || null;
const filtrosLeads = q => ({ canal: CANAL_LEAD(q), status: STATUS_LEAD(q), q: BUSCA(q), soPagos: q.get('pagos') === '1', semResponsavel: q.get('sem_responsavel') === '1',
  etapa: leads.ETAPAS_CICLO.includes(q.get('etapa')) ? q.get('etapa') : null,
  ordem: leads.ORDENS.includes(q.get('ordem')) ? q.get('ordem') : 'recentes' });
rota('GET', '/api/leads', ({ q }) => leads.listar({ ...periodoDaQuery(q), ...filtrosLeads(q), limite: limiteDe(q, 300, 1000) }));
rota('GET', '/api/leads/hoje', () => leads.hoje());
/* Rodada 6: carros de anúncio na oficina e orçamentos esperando (cartão "Oficina agora" do Painel). Cache de 60 s. */
let cacheOficina = { valor: null, em: 0 };
rota('GET', '/api/oficina-agora', async ({ q }) => {
  if (q.get('fresco') !== '1' && cacheOficina.valor && Date.now() - cacheOficina.em < 60_000) return cacheOficina.valor;
  const v = await require('./ciclo').agora();
  if (!v.indisponivel) cacheOficina = { valor: v, em: Date.now() };
  return v;
});
/* Rodada 7: "o que fazer agora" — fila de clientes de anúncio esperando o consultor, com atalhos (cache de 60 s). */
let cacheAcoes = { valor: null, em: 0, chave: '' };
rota('GET', '/api/acoes', async ({ q }) => {
  const dias = Math.min(90, Math.max(1, parseInt(q.get('dias') || '30', 10) || 30)), limite = limiteDe(q, 40, 100), chave = dias + ':' + limite;
  if (q.get('fresco') !== '1' && cacheAcoes.valor && cacheAcoes.chave === chave && Date.now() - cacheAcoes.em < 60_000) return cacheAcoes.valor;
  const [fila, alertas] = await Promise.all([require('./ciclo').acoes({ dias, limite }), db.listarAlertas({ limite: 40, naoLidos: true }).catch(() => [])]);
  const A = require('./acoes');
  // Rodada 7: Orçador/Pátio fora agora, mas houve uma leitura boa nos últimos 15 min: mostra a última, marcada como desatualizada.
  if (fila.indisponivel && cacheAcoes.valor && cacheAcoes.chave === chave && Date.now() - cacheAcoes.em < 900_000) return { ...cacheAcoes.valor, desatualizado: true, radar: A.acoesDoRadar(alertas) };
  const v = { ...fila, alertas: undefined, frase: A.frase(fila), radar: A.acoesDoRadar(alertas) };
  if (!fila.indisponivel) cacheAcoes = { valor: v, em: Date.now(), chave };
  return v;
});
rota('GET', '/api/acoes.csv', async ({ q, res, usuario }) => {
  const f = await require('./ciclo').acoes({ dias: Math.min(90, Math.max(1, parseInt(q.get('dias') || '30', 10) || 30)), limite: 100 });
  if (f.indisponivel) throw new ErroHttp(503, f.motivo);
  await equipe.banco().auditar(usuario, 'ads_exportou_csv', { detalhes: { arquivo: 'acoes', quantidade: f.itens.length } });
  const AC = require('./acoes');
  enviarCSV(res, `o-que-fazer-agora-${hojeBR()}.csv`, atribuicao.montarCSV(AC.CAMPOS_CSV, AC.linhasCSV(f)));
});
/* Rodada 7: os orçamentos e as OS recentes estão ligados a um lead? (cache de 5 min) */
let cacheLigacao = { valor: null, em: 0 };
rota('GET', '/api/ligacao', async ({ q }) => {
  if (q.get('fresco') !== '1' && cacheLigacao.valor && Date.now() - cacheLigacao.em < 300_000) return cacheLigacao.valor;
  const v = await require('./ciclo').ligacao();
  if (!v.indisponivel) cacheLigacao = { valor: v, em: Date.now() };
  return v;
});
/* Rodada 7: do teste ao real — em que modo o painel está e o que falta. */
rota('GET', '/api/preparo', () => require('./preparo').ler());
/* Rodada 7: fechamento do mês para o dono (texto pronto + números); POST manda no WhatsApp pelo Comunicar. */
rota('GET', '/api/fechamento', async ({ q }) => {
  const r = await require('./fechamento').gerar({ mes: q.get('mes') || hojeBR().slice(0, 7), hojeISO: hojeBR() });
  if (!r.ok) throw new ErroHttp(400, r.erro);
  return r;
});
rota('GET', '/api/fechamento.csv', async ({ q, res, usuario }) => {
  const F = require('./fechamento');
  const r = await F.gerar({ mes: q.get('mes') || hojeBR().slice(0, 7), hojeISO: hojeBR() });
  if (!r.ok) throw new ErroHttp(400, r.erro);
  await equipe.banco().auditar(usuario, 'ads_exportou_csv', { detalhes: { arquivo: 'fechamento', mes: r.periodo.mes } });
  enviarCSV(res, `fechamento-${r.periodo.mes}.csv`, atribuicao.montarCSV(F.CAMPOS_CSV, F.linhasCSV(r)));
});
/* Revisão de segurança (19/11), achado 4: três coisas sensíveis passam a ser só do administrador (o gestor com o
   Tráfego liberado continua vendo e propondo): mandar o fechamento do mês pelo WhatsApp da oficina, trocar as
   credenciais da Meta e do Google e trocar os números que recebem os relatórios. */
const soAdmin = (usuario, oQue) => {
  if (!equipe.ehAdmin(usuario)) throw new ErroHttp(403, `Só o administrador pode ${oQue}.`, { codigo: 'so_admin' });
};
rota('POST', '/api/fechamento/enviar', async ({ corpo, usuario }) => {
  soAdmin(usuario, 'mandar o fechamento do mês pelo WhatsApp');
  const c = await corpo();
  const cfg = await db.lerConfig({ fresco: true });
  if (!cfg.whatsapp_destinos.length) throw new ErroHttp(400, 'cadastre ao menos um número em Ajustes antes de enviar');
  const r = await require('./fechamento').gerar({ mes: String(c.mes || hojeBR().slice(0, 7)), hojeISO: hojeBR() });
  if (!r.ok) throw new ErroHttp(400, r.erro);
  if (r.demo && process.env.ADS_DEMO_ENVIA !== '1') throw new ErroHttp(400, 'o investimento é de demonstração; cole as chaves reais antes de mandar o fechamento por WhatsApp');
  await equipe.banco().auditar(usuario, 'ads_fechamento_enviado', { detalhes: { mes: r.periodo.mes } });
  const envio = await whatsapp.enviarParaTodos(cfg.whatsapp_destinos, r.texto, { chave: `ads:fechamento:${r.periodo.mes}:${r.periodo.ate}`, perfil_id: usuario.id });
  return { ok: envio.some(e => e.ok), envio, periodo: r.periodo };
});
rota('GET', '/api/leads.csv', async ({ q, res, usuario }) => {
  const p = periodoDaQuery(q);
  const filtros = filtrosLeads(q);
  await equipe.banco().auditar(usuario, 'ads_exportou_csv', { detalhes: { arquivo: 'leads', ...p, ...filtros } });
  const r = await leads.listar({ ...p, ...filtros, limite: 5000 });
  // O nome do arquivo diz o filtro: leads-site-2026-10-01-a-2026-10-16.csv
  const rotulo = filtros.soPagos ? 'anuncios' : filtros.canal || (filtros.semResponsavel ? 'sem-responsavel' : filtros.status || 'todos');
  enviarCSV(res, `leads-${rotulo}-${p.de}-a-${p.ate}.csv`, leads.csv(r.leads));
});

/* ===================== MÓDULO 1 · PAINEL ===================== */

rota('GET', '/api/painel', async ({ q }) => {
  const { de, ate } = periodoDaQuery(q);
  return painel.resumo({ de, ate, plataforma: platDe(q) });
});

rota('GET', '/api/ranking', async ({ q }) => {
  const { de, ate } = periodoDaQuery(q);
  const ordenar = M.ROTULO[q.get('ordenar')] ? q.get('ordenar') : 'gasto';
  const nivel = nivelDe(q);
  const lista = await painel.ranking({ de, ate, nivel, plataforma: platDe(q), ordenar, limite: limiteDe(q, 50, 200) });
  // Rodada 5: na aba Campanhas, cada linha ganha o que o CRM viu dela (leads, vendas, custo real). CRM fora não derruba o ranking.
  if (nivel === 'campanha' && q.get('crm') !== '0') {
    try { return atribuicao.juntarRankingComCRM(lista, await resultadosComCache({ de, ate, plataforma: platDe(q) })); }
    catch { return lista.map(r => ({ ...r, crm: null, crm_motivo: 'CRM indisponível agora' })); }
  }
  return lista;
});
/* A coorte do CRM é a leitura mais pesada (leads + agendamentos + conversas): o ranking reaproveita por 60 s
   a mesma chave (período + plataforma) — trocar de ordem ou refazer a aba não refaz a conta. */
const cacheResultados = new Map();
async function resultadosComCache(p) {
  const chave = `${p.de}|${p.ate}|${p.plataforma || ''}`;
  const c = cacheResultados.get(chave);
  if (c && Date.now() - c.em < 60_000) return c.valor;
  const valor = await resultados.resumo(p);
  if (cacheResultados.size > 50) cacheResultados.clear();
  cacheResultados.set(chave, { valor, em: Date.now() });
  return valor;
}

rota('GET', '/api/historico', async ({ q }) => {
  const { de, ate } = periodoDaQuery(q);
  const entidade = q.get('entidade');
  if (!entidade) throw new ErroHttp(400, 'informe a entidade');
  return painel.historico({ entidade, nivel: nivelDe(q), de, ate });
});

rota('GET', '/api/mes', async () => {
  const m = await painel.ritmoDoMes();
  // Rodada 5: leads do mês (todos os canais) e custo por lead pago no cartão "Mês corrente". CRM fora não derruba o cartão.
  m.leads = await leads.resumoDoMes({ gastoMes: m.gasto }).catch(() => null);
  return m;
});
/* --- Resultados CRM: leads, agendamentos e vendas por canal/campanha --- */
rota('GET', '/api/resultados', ({ q }) => resultados.resumo({ ...periodoDaQuery(q), plataforma: platDe(q) }));
rota('GET', '/api/resultados.csv', async ({ q, res, usuario }) => {
  const p = periodoDaQuery(q);
  await equipe.banco().auditar(usuario, 'ads_exportou_csv', { detalhes: { arquivo: 'resultados', ...p, plataforma: platDe(q) } });
  enviarCSV(res, `resultados-crm-${platDe(q) || 'meta-google'}-${p.de}-a-${p.ate}.csv`, atribuicao.csv(await resultados.resumo({ ...p, plataforma: platDe(q) })));
});

/* Rodada 6: do anúncio ao carro entregue em CSV (mesmas contas da tela). Sem ciclo legível, devolve 503 com frase. */
rota('GET', '/api/ciclo.csv', async ({ q, res, usuario }) => {
  const p = periodoDaQuery(q);
  const r = await resultados.resumo({ ...p, plataforma: platDe(q) });
  if (!r.ciclo || r.ciclo.indisponivel) throw new ErroHttp(503, r.ciclo?.motivo || 'Ciclo indisponível agora. Tente de novo em instantes.');
  await equipe.banco().auditar(usuario, 'ads_exportou_csv', { detalhes: { arquivo: 'ciclo', ...p, plataforma: platDe(q) } });
  enviarCSV(res, `ciclo-anuncio-ao-carro-${platDe(q) || 'meta-google'}-${p.de}-a-${p.ate}.csv`, require('./ciclo').csv(r.ciclo));
});

/* Ranking em CSV (campanhas ou criativos), com as mesmas contas da tela. */
const CAMPOS_RANKING = [['plataforma', 'Plataforma'], ['nome', 'Nome'], ['campanha_nome', 'Campanha'], ['dias_ativos', 'Dias ativos'],
  ['gasto', 'Investido'], ['impressoes', 'Impressões'], ['cliques', 'Cliques'], ['ctr', 'CTR (%)'], ['cpc', 'CPC'], ['cpm', 'CPM'],
  ['conversoes', 'Conversões'], ['cpa', 'CPA'], ['valor_conversao', 'Receita na plataforma'], ['roas', 'ROAS'], ['frequencia', 'Frequência']];
rota('GET', '/api/ranking.csv', async ({ q, res, usuario }) => {
  const { de, ate } = periodoDaQuery(q);
  const nivel = nivelDe(q);
  await equipe.banco().auditar(usuario, 'ads_exportou_csv', { detalhes: { arquivo: nivel === 'anuncio' ? 'criativos' : 'campanhas', de, ate, plataforma: platDe(q) } });
  let lista = await painel.ranking({ de, ate, nivel, plataforma: platDe(q), ordenar: 'gasto', limite: 500 });
  let campos = CAMPOS_RANKING;
  // Rodada 5: o CSV de campanhas leva as colunas do CRM (leads, vendas, custo real) — o mesmo que a tela mostra.
  if (nivel === 'campanha') {
    try {
      lista = atribuicao.juntarRankingComCRM(lista, await resultadosComCache({ de, ate, plataforma: platDe(q) }))
        .map(r => ({ ...r, crm_leads: r.crm?.leads ?? null, crm_agendamentos: r.crm?.agendamentos ?? null, crm_vendas: r.crm?.fechados ?? null,
          crm_custo_lead: r.crm?.cpl ?? null, crm_custo_venda: r.crm?.custo_venda ?? null, crm_roas_real: r.crm?.roas_real ?? null, oficina_carros: r.oficina?.na_oficina ?? null, oficina_custo_carro: r.oficina?.custo_carro ?? null, crm_motivo: r.crm ? '' : r.crm_motivo }));
      campos = [...CAMPOS_RANKING, ['crm_leads', 'Leads no CRM'], ['crm_agendamentos', 'Agendamentos (CRM)'], ['crm_vendas', 'Vendas (CRM)'],
        ['crm_custo_lead', 'Custo por lead (CRM)'], ['crm_custo_venda', 'Custo por venda (CRM)'], ['crm_roas_real', 'ROAS real'], ['oficina_carros', 'Carros na oficina'], ['oficina_custo_carro', 'Custo por carro na oficina'], ['crm_motivo', 'Observação']];
    } catch { /* CRM fora: o CSV sai só com as colunas da plataforma */ }
  }
  const texto = atribuicao.montarCSV(campos, lista);
  enviarCSV(res, `${nivel === 'anuncio' ? 'criativos' : 'campanhas'}-${de}-a-${ate}.csv`, texto);
});

/* --- IA: leitura da semana (sob demanda; registrada em ia_acoes) --- */
rota('POST', '/api/ia/leitura', async ({ usuario }) => {
  const r = await leitura.gerar({ usuario });
  if (!r.ok) throw new ErroHttp(503, r.erro);
  return r;
});
rota('GET', '/api/ia/leituras', () => leitura.ultimas(5));

/* --- colar e testar credenciais (nunca devolve token) --- */
const canalDoCorpo = c => {
  if (c.canal !== 'meta' && c.canal !== 'google') throw new ErroHttp(400, 'canal deve ser meta ou google');
  return c.canal;
};
rota('POST', '/api/integracoes/testar', async ({ corpo }) => { const c = await corpo(); return conexoes.testar(canalDoCorpo(c), c); });
rota('POST', '/api/integracoes', async ({ corpo, usuario }) => {
  soAdmin(usuario, 'trocar o acesso da Meta e do Google');
  const c = await corpo();
  const canal = canalDoCorpo(c);
  let r;
  try { r = await conexoes.salvar(canal, c); }
  catch (e) { if (e.status === 400) throw new ErroHttp(400, e.message); throw e; }
  // Só os NOMES dos campos preenchidos — nunca o valor do token.
  const campos = Object.keys(c).filter(k => k !== 'canal' && typeof c[k] === 'string' && c[k].trim()).slice(0, 20);
  await equipe.banco().auditar(usuario, 'ads_credencial_salva', { tabela: 'integracoes_ads', registro: canal, detalhes: { canal, campos } });
  return r;
});

rota('GET', '/api/integracoes', async () => {
  const lista = await db.lerIntegracoes();
  // Nunca devolver token. A tela só precisa saber se existe.
  return lista.map(db.mascararIntegracao);
});

rota('POST', '/api/sync', async ({ corpo }) => {
  const c = await corpo();
  const dias = Math.min(90, Math.max(1, parseInt(c.dias, 10) || 7));
  return coletor.sincronizar({ dias });
});

rota('POST', '/api/testar-conexoes', () => coletor.testarConexoes());

rota('POST', '/api/demo', async ({ corpo, usuario }) => {
  const c = await corpo();
  if (c.limpar) {
    await db.apagarDemo();
    await equipe.banco().auditar(usuario, 'ads_demo_apagada', { tabela: 'ads_metricas_dia' });
    return { limpo: true };
  }
  const dias = Math.min(180, Math.max(7, parseInt(c.dias, 10) || 45));
  // Rodada 5: com chave funcionando e dado real na tabela, a demonstração não entra (não se mistura com o real).
  if (await db.temChaves() && await db.temDadosReais()) throw new ErroHttp(400, 'Já há dados reais das plataformas: a demonstração não se mistura com eles. Se quiser testar, apague os dados reais primeiro (não há botão para isso de propósito).');
  return coletor.popularDemo(dias);
});

/* --- configuração e metas (usada pelos dois módulos) --- */
rota('GET', '/api/config', () => db.lerConfig({ fresco: true }));
rota('POST', '/api/config', async ({ corpo, usuario }) => {
  const v = validarConfig(await corpo());
  if (v.whatsapp_destinos !== undefined) soAdmin(usuario, 'trocar os números que recebem os relatórios');
  await db.salvarConfig(v);
  // Telefones mascarados no registro (só os 4 últimos dígitos).
  const detalhes = { ...v };
  if (v.whatsapp_destinos) detalhes.whatsapp_destinos = v.whatsapp_destinos.map(t => '•••' + t.slice(-4));
  await equipe.banco().auditar(usuario, 'ads_config_alterada', { tabela: 'ads_config', registro: 'true', detalhes });
  return db.lerConfig({ fresco: true });
});

/* --- metas de marketing da loja (tabela metas, perfil_id nulo) --- */
const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
rota('GET', '/api/metas', async ({ q }) => {
  const hoje = hojeBR();
  const mes = q.get('mes') || hoje.slice(0, 7);
  let dia1;
  try { dia1 = equipe.validarMeta({ mes }).mes; } catch (e) { throw new ErroHttp(400, e.message); }
  const meta = await equipe.banco().lerMetaLoja(dia1);
  const ultimoDia = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
  const corrente = mes === hoje.slice(0, 7);
  if (mes > hoje.slice(0, 7)) return { mes, meta, progresso: null, futuro: true };
  const ate = corrente ? hoje : `${mes}-${String(ultimoDia).padStart(2, '0')}`;
  const r = await resultados.resumo({ de: dia1, ate });
  const dia = corrente ? Number(hoje.slice(8, 10)) : ultimoDia;
  return {
    mes, meta, dia, dias_mes: ultimoDia,
    feito: { leads: r.total.leads, agendamentos: r.total.agendamentos, vendas: r.total.fechados },
    progresso: meta ? {
      leads: equipe.progresso(r.total.leads, meta.leads, dia, ultimoDia),
      agendamentos: equipe.progresso(r.total.agendamentos, meta.agendamentos, dia, ultimoDia),
      vendas: equipe.progresso(r.total.fechados, meta.vendas, dia, ultimoDia),
    } : null,
  };
});
rota('POST', '/api/metas', async ({ corpo, usuario }) => {
  let v;
  try { v = equipe.validarMeta(await corpo()); } catch (e) { throw new ErroHttp(e.status || 400, e.message); }
  const salva = await equipe.banco().salvarMetaLoja(v);
  await equipe.banco().auditar(usuario, 'ads_meta_salva', { tabela: 'metas', registro: salva.id, detalhes: v });
  return salva;
});

/* --- resumo semanal no sino (manual: só para quem clicou, sem trava) --- */
rota('POST', '/api/semanal', ({ usuario }) => semanal.gerarENotificar({ hojeISO: hojeBR(), manualPara: usuario.id }));

/* --- eu: perfil, preferências e troca de senha (sem exigir acesso ao app) --- */
rota('GET', '/api/eu', ({ usuario }) => equipe.perfilPublico(usuario));
rota('POST', '/api/eu', async ({ corpo, usuario }) => {
  let v;
  try { v = equipe.validarPerfil(await corpo()); } catch (e) { throw new ErroHttp(e.status || 400, e.message); }
  await equipe.banco().salvarPerfil(usuario, v);
  auth.esquecer();
  return { ok: true };
});
rota('POST', '/api/eu/senha-trocada', async ({ usuario }) => {
  await equipe.banco().senhaTrocada(usuario);
  await equipe.banco().auditar(usuario, 'senha_trocada', { tabela: 'perfis', registro: usuario.id });
  auth.esquecer();
  return { ok: true };
});
/* Rotas que funcionam para qualquer pessoa logada e ativa, mesmo sem acesso ao Ads
   (a tela precisa saber quem é para mostrar "Você não tem acesso" e trocar senha). */
const SEM_EXIGIR_ACESSO = new Set(['/api/eu', '/api/eu/senha-trocada']);

/* ===================== MÓDULO 2 · RADAR ===================== */

rota('GET', '/api/regras', () => db.listarRegras());
rota('POST', '/api/regras', async ({ corpo, usuario }) => {
  const bruto = await corpo();
  if (bruto.id != null && !equipe.ehUuid(bruto.id)) throw new ErroHttp(400, 'id da regra inválido');
  const v = radar.validarRegra(bruto);
  if (!v.ok) throw new ErroHttp(400, v.erro);
  const salva = await db.salvarRegra(v.regra);
  const r = v.regra;
  await equipe.banco().auditar(usuario, bruto.id ? 'ads_regra_alterada' : 'ads_regra_criada', {
    tabela: 'ads_regras', registro: salva?.id || bruto.id || null,
    detalhes: { nome: r.nome, metrica: r.metrica, operador: r.operador, valor: r.valor, ativa: r.ativa },
  });
  return salva;
});
rota('DELETE', '/api/regras', async ({ q, usuario }) => {
  const id = q.get('id');
  if (!id) throw new ErroHttp(400, 'informe o id');
  if (!equipe.ehUuid(id)) throw new ErroHttp(400, 'id da regra inválido');
  await db.apagarRegra(id);
  await equipe.banco().auditar(usuario, 'ads_regra_apagada', { tabela: 'ads_regras', registro: id });
  return { apagado: true };
});

const SEVERIDADES = new Set(radar.SEVERIDADES);
rota('GET', '/api/alertas', async ({ q }) => {
  const lista = await db.listarAlertas({ limite: limiteDe(q, 50, 200), naoLidos: q.get('nao_lidos') === '1' });
  // Rodada 5: filtro por severidade e por plataforma na própria rota (a tela só pinta).
  const sev = SEVERIDADES.has(q.get('severidade')) ? q.get('severidade') : null, plat = platDe(q);
  return lista.filter(a => (!sev || a.severidade === sev) && (!plat || a.plataforma === plat)).map(a => ({ ...a, acao: require('./acoes').acaoDoAlerta(a) }));
});
const CAMPOS_ALERTAS_CSV = [['criado_em', 'Quando'], ['severidade', 'Severidade'], ['plataforma', 'Plataforma'], ['regra_nome', 'Regra'],
  ['entidade_nome', 'Campanha/criativo'], ['metrica', 'Métrica'], ['valor_medido', 'Medido'], ['valor_limite', 'Limite'], ['mensagem', 'Mensagem'],
  ['enviado_em', 'Enviado em'], ['lido_em', 'Lido em']];
rota('GET', '/api/alertas.csv', async ({ q, res, usuario }) => {
  const sev = SEVERIDADES.has(q.get('severidade')) ? q.get('severidade') : null;
  const lista = (await db.listarAlertas({ limite: limiteDe(q, 500, 2000), naoLidos: q.get('nao_lidos') === '1' })).filter(a => !sev || a.severidade === sev);
  await equipe.banco().auditar(usuario, 'ads_exportou_csv', { detalhes: { arquivo: 'alertas', quantidade: lista.length } });
  const fmt = t => (t ? new Date(t).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
  enviarCSV(res, `alertas-radar${sev ? '-' + sev : ''}-${hojeBR()}.csv`, atribuicao.montarCSV(CAMPOS_ALERTAS_CSV,
    lista.map(a => ({ ...a, criado_em: fmt(a.criado_em), enviado_em: fmt(a.enviado_em), lido_em: fmt(a.lido_em) }))));
});
/* Liga/desliga uma regra sem abrir o modal (só o campo `ativa`). */
rota('POST', '/api/regras/ativa', async ({ corpo, usuario }) => {
  const c = await corpo();
  if (!equipe.ehUuid(c.id)) throw new ErroHttp(400, 'id da regra inválido');
  const regras = await db.listarRegras();
  const atual = regras.find(r => r.id === c.id);
  if (!atual) throw new ErroHttp(404, 'regra não encontrada');
  const salva = await db.salvarRegra({ ...atual, ativa: c.ativa === true });
  await equipe.banco().auditar(usuario, 'ads_regra_alterada', { tabela: 'ads_regras', registro: c.id, detalhes: { nome: atual.nome, ativa: c.ativa === true } });
  return salva;
});
rota('POST', '/api/alertas/lidos', async ({ corpo }) => {
  const { ids } = await corpo();
  await db.marcarAlertasLidos(Array.isArray(ids) ? ids.filter(equipe.ehUuid).slice(0, 500) : []);
  return { ok: true };
});

rota('POST', '/api/radar', async ({ corpo }) => {
  const c = await corpo();
  // Simulação por padrão: quem clica "testar" não deve disparar WhatsApp
  // para o dono sem querer.
  const r = await radar.rodar({ enviar: c.enviar === true, ignorarCooldown: c.ignorar_cooldown === true });
  // Rodada 7: a simulação também mostra para onde cada alerta leva.
  return { ...r, alertas: (r.alertas || []).map(a => ({ ...a, acao: require('./acoes').acaoDoAlerta(a) })) };
});

rota('GET', '/api/relatorios', () => db.listarRelatorios(30));
rota('POST', '/api/relatorio', async ({ corpo, usuario }) => {
  const c = await corpo();
  if (c.enviar === true) await equipe.banco().auditar(usuario, 'ads_relatorio_enviado_manual', { tabela: 'ads_relatorios' });
  const r = await relatorio.gerarEEnviar({
    referencia: DATA_ISO.test(c.referencia || '') ? c.referencia : undefined,
    enviar: c.enviar === true,
    comIA: c.com_ia !== false,
  });
  return resumoDoRelatorio(r);
});

/* --- canal de WhatsApp (CodeWords + reserva Cloud API) --- */
rota('GET', '/api/whatsapp/status', ({ q }) => whatsapp.status({ fresco: q.get('fresco') === '1' }));
rota('POST', '/api/whatsapp/testar', async ({ usuario }) => {
  await equipe.banco().auditar(usuario, 'ads_whatsapp_teste', {});
  const cfg = await db.lerConfig({ fresco: true });
  if (!cfg.whatsapp_destinos.length) throw new ErroHttp(400, 'cadastre ao menos um número em Ajustes antes de testar o envio');
  const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const texto = `🏎 *IndyCar · Tráfego pago* — teste de envio (${quando}). Se esta mensagem chegou, a fila do Comunicar está entregando. Quem conhece, Indyca! 🏎`;
  // Rodada 5: vai pela fila do Comunicar; "ok" = entrou na fila (o carteiro entrega no próximo ciclo, 8h–21h).
  const envio = await whatsapp.enviarParaTodos(cfg.whatsapp_destinos, texto, { chave: `ads:teste:${Date.now()}`, perfil_id: usuario.id });
  return { ok: envio.some(e => e.ok), envio, via: 'fila' };
});
/* Fila do Comunicar: o que o Ads já colocou lá (últimos envios e contagens). */
rota('GET', '/api/fila', ({ q }) => Fila.fila().situacao({ limite: limiteDe(q, 20, 100) }));

/* ------------------------------------------------------------
   Rodada 8 — rotas em arquivos próprios (rotas/*.js)
   Cada arquivo exporta (ctx) => { ctx.rota(...); ctx.rotaPublica(...); }.
   Assim cada frente registra as suas rotas sem editar este arquivo.
   Um arquivo que falha ao carregar não derruba o app: fica no log e em ROTAS_COM_ERRO.
   ------------------------------------------------------------ */
const ROTAS_DIR = path.join(__dirname, 'rotas');
const ROTAS_CARREGADAS = [];
const ROTAS_COM_ERRO = [];
/* Chave das rotinas (/api/cron/…), integração r8: no cabeçalho X-Cron-Chave (o pg_cron usa este: a chave não fica em
   endereço nem em log de acesso) ou em ?chave= (o jeito antigo). Comparação em tempo constante. Sem ADS_CRON_TOKEN no
   ambiente nenhuma chave serve (401), que é o estado seguro. Não depende de TRAFEGO_AUTOMATICO. */
function chaveDeCronOk(q, req) {
  if (!CRON_TOKEN) return false;
  const doCabecalho = req && req.headers ? req.headers['x-cron-chave'] : null;
  // revisão de segurança (19/11): só o cabeçalho; ?chave= no endereço fica em log de acesso e não vale mais
  const dada = String((typeof doCabecalho === 'string' && doCabecalho) || '');
  if (!dada) return false;
  const resumo = v => require('node:crypto').createHash('sha256').update(String(v)).digest();
  return require('node:crypto').timingSafeEqual(resumo(dada), resumo(CRON_TOKEN));
}
/* exigirCron(q, req): para rotas públicas de rotina (/api/cron/…). */
const exigirCron = (q, req) => { if (!chaveDeCronOk(q, req)) throw new ErroHttp(401, 'chave inválida'); };
/* Rodada 8: `registro` (log de uma linha em JSON, sem dado pessoal) e `enderecos` (apps da casa) também vão no encaixe.
   Toda rota recebe `pedido` nos argumentos: `pedido.id` e `pedido.medir(nome, fn)` para o tempo de cada etapa. */
const ctxRotas = { rota, rotaPublica, exigirCron, json, ErroHttp, lerCorpo, db, auth, seg, equipe, limitador, periodoDaQuery, platDe, limiteDe, hojeBR, VERSAO, registro: Registro, enderecos };
if (fs.existsSync(ROTAS_DIR)) {
  for (const arq of fs.readdirSync(ROTAS_DIR).filter(n => n.endsWith('.js')).sort()) {
    try {
      const registrar = require(path.join(ROTAS_DIR, arq));
      if (typeof registrar !== 'function') throw new Error('o arquivo precisa exportar uma função (ctx) => {…}');
      registrar(ctxRotas);
      ROTAS_CARREGADAS.push(arq);
    } catch (e) {
      ROTAS_COM_ERRO.push(arq);
      console.error(`✖ rotas/${arq} não carregou:`, e.stack || e.message);
    }
  }
}

/* ------------------------------------------------------------
   Tratamento de cada requisição
   ------------------------------------------------------------ */
/* É esta a função que a Central chama (handler): recebe a URL já sem o prefixo e req.prefixo ('/trafego').
   Nunca rejeita: o que escapar vira 500 em JSON, com o app sozinho ou montado na Central. */
async function tratar(req, res) {
  try { await atender(req, res); }
  catch (e) {
    Registro.evento('error', 'falha_inesperada', { id: req.pedido?.id || null, metodo: req.method, erro: e?.message || String(e), tipo: e?.name || null });
    if (!res.headersSent) json(res, 500, { erro: 'erro interno' });
    else if (!res.writableEnded) res.end();
  }
}

async function atender(req, res) {
  cabecalhosBase(res);
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch { return json(res, 400, { erro: 'Endereço inválido.' }); }
  const caminho = url.pathname;
  const q = url.searchParams;

  const publica = acharPublica(caminho);
  if (!caminho.startsWith('/api/') && !publica) return servirEstatico(req, res, caminho);

  // Rodada 8: cada pedido tem um identificador (o da Central, quando o app está montado nela) e o tempo
  // de cada etapa. A consulta (?q=…) nunca vai para o log; número comprido no caminho (telefone) também não.
  const pedido = Registro.criarPedido({ id: Registro.idDoPedido(req, res), metodo: req.method, rota: Registro.rotaDoLog(caminho, publica?.m ? publica.m.slice(1) : []) });
  req.pedido = pedido;

  // Log com duração de cada chamada de API. /api/ping fica de fora: o vigia
  // bate nele o dia inteiro e isso só suja o log.
  if (caminho !== '/api/ping') {
    const inicio = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
      const marca = res.statusCode >= 500 ? '✖' : res.statusCode >= 400 ? '△' : '·';
      // Rodada 5: quem fez (papel + começo do id) — histórico de operação sem expor e-mail.
      const quem = req.quem ? ` ${req.quem}` : '';
      console.log(`${marca} ${req.method} ${caminho.replace(/[0-9]{8,}/g, ':n')} ${res.statusCode} ${ms.toFixed(0)}ms${quem} [${pedido.id}]`);
      // Passou de 1 s: uma linha a mais dizendo qual etapa (leitura do banco, montagem) levou o tempo.
      const lento = pedido.resumoSeLento({ status: res.statusCode, ms });
      if (lento) Registro.evento('warn', lento.evento, { ...lento.campos, quem: req.quem || null });
    });
  }

  try {
    // CORS: só os domínios do ecossistema (e localhost) chamam a API de outro site.
    if (publica && publica.rota.opcoes.corsLivre) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    } else if (!seg.cors(req, res)) throw new ErroHttp(403, 'origem não permitida');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    // Limite por IP em toda a API (o vigia também passa por aqui).
    const ip = seg.ipDe(req);
    const porIp = limitador.permitir(`ip|${ip}`, LIMITE_IP_MIN, 60_000);
    if (!porIp.ok) { res.setHeader('Retry-After', String(porIp.esperar)); throw new ErroHttp(429, `Muitas chamadas seguidas. Espere ${porIp.esperar} s.`); }

    // Corpo grande é recusado antes de qualquer trabalho — inclusive do login.
    const anunciado = parseInt(req.headers['content-length'] || '0', 10);
    if (anunciado > LIMITE_CORPO) throw new ErroHttp(413, 'corpo da requisição muito grande (máximo 1 MB)');

    /* --- públicas: o vigia e a tela de login --- */
    if (caminho === '/api/ping') {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new ErroHttp(405, 'use GET');
      return json(res, 200, { ok: true });
    }
    if (caminho === '/api/config-publica') {
      return json(res, 200, { supabase_url: auth.URL_SB, supabase_anon_key: auth.ANON });
    }

    /* --- rodada 8: rotas públicas registradas em rotas/*.js (cada uma se autentica) --- */
    if (publica) {
      const fnPublica = publica.rota.metodos[req.method];
      if (!fnPublica) {
        res.setHeader('Allow', Object.keys(publica.rota.metodos).join(', '));
        throw new ErroHttp(405, `método não permitido — use ${Object.keys(publica.rota.metodos).join(' ou ')}`);
      }
      const saidaPublica = await fnPublica({ req, res, q, caminho, ip, m: publica.m, corpo: () => lerCorpo(req), pedido });
      if (!res.writableEnded) json(res, 200, saidaPublica ?? { ok: true });
      return;
    }

    /* --- cron externo: autentica por token, não por login --- */
    if (caminho.startsWith('/api/cron/')) {
      if (!chaveDeCronOk(q, req)) throw new ErroHttp(401, 'chave inválida');
      if (caminho === '/api/cron/sync')     return json(res, 200, await coletor.sincronizar({ dias: 7 }));
      if (caminho === '/api/cron/radar')     return json(res, 200, await radar.rodar({ enviar: true }));
      if (caminho === '/api/cron/relatorio') return json(res, 200, resumoDoRelatorio(await relatorio.gerarEEnviar({ enviar: true })));
      if (caminho === '/api/cron/ciclo')     return json(res, 200, await require('./ciclo').avisarGestores({ hojeISO: hojeBR() }));
      if (caminho === '/api/cron/fechamento') {
        const hoje = hojeBR(), cfg = await db.lerConfig({ fresco: true });
        const d = require('./fechamento').decidirEnvioMensal(cfg, q.get('forcar') === '1' ? hoje.slice(0, 8) + '01' : hoje, agenda.horaLocal(), null);
        return json(res, 200, d.enviar ? await require('./fechamento').enviarMesAnterior({ hojeISO: hoje, cfg }) : { enviado: false, motivo: d.motivo });
      }
      if (caminho === '/api/cron/semanal')   return json(res, 200, await semanal.gerarENotificar({ hojeISO: hojeBR() }));
      throw new ErroHttp(404, 'rota de cron desconhecida');
    }

    /* --- daqui para baixo, tudo exige login --- */
    const quem = await auth.identificar(req);
    const usuario = quem.usuario;
    if (!usuario) {
      if (quem.motivo === 'desativado') throw new ErroHttp(403, 'Seu usuário foi desativado. Fale com o administrador.', { codigo: 'desativado' });
      if (quem.motivo === 'sem_perfil') throw new ErroHttp(403, 'Seu usuário ainda não tem perfil na equipe. Fale com o administrador.', { codigo: 'sem_perfil' });
      if (quem.motivo === 'indisponivel') throw new ErroHttp(503, 'Não foi possível conferir o login agora. Tente de novo em instantes.', { codigo: 'indisponivel' });
      throw new ErroHttp(401, 'faça login', { codigo: quem.motivo === 'vencido' ? 'sessao_vencida' : 'login' });
    }
    equipe.banco().tocarAcesso(usuario).catch(() => {});
    req.quem = `${usuario.papel || '?'}:${String(usuario.id || '').slice(0, 8)}`;

    const livre = SEM_EXIGIR_ACESSO.has(caminho);
    if (!livre) {
      // Verificação em duas etapas ligada: a sessão precisa ter passado pelo código.
      if (usuario.mfa && usuario.aal !== 'aal2') throw new ErroHttp(403, 'Digite o código de verificação para continuar.', { codigo: 'mfa' });
      if (usuario.precisa_trocar_senha === true) throw new ErroHttp(403, 'Troque sua senha para continuar.', { codigo: 'trocar_senha' });
      const acesso = equipe.acessoAds(usuario);
      if (!acesso.ok) throw new ErroHttp(403, 'Você não tem acesso a este app.', { codigo: 'sem_acesso', apps: equipe.appsDaPessoa(usuario) });
    }

    // Limite por usuário nas rotas caras (IA, plataformas, WhatsApp, exportar).
    const caro = seg.LIMITES_CAROS[`${req.method} ${caminho}`];
    if (caro) {
      const r = limitador.permitir(`u|${usuario.id}|${req.method} ${caminho}`, caro, 10 * 60_000);
      if (!r.ok) { res.setHeader('Retry-After', String(r.esperar)); throw new ErroHttp(429, `Você já usou isso muitas vezes agora. Espere ${Math.ceil(r.esperar / 60)} min.`); }
    }

    let metodos = rotas.get(caminho), m = null;
    if (!metodos) for (const r of rotasPadrao) { m = r.alvo.exec(caminho); if (m) { metodos = r.metodos; break; } }
    if (!metodos) throw new ErroHttp(404, 'rota não encontrada');
    if (m) pedido.definirRota(Registro.rotaDoLog(caminho, m.slice(1)));
    const fn = metodos[req.method];
    if (!fn) {
      res.setHeader('Allow', Object.keys(metodos).join(', '));
      throw new ErroHttp(405, `método não permitido — use ${Object.keys(metodos).join(' ou ')}`);
    }
    const saida = await fn({ req, res, q, usuario, m, corpo: () => lerCorpo(req), pedido });
    if (!res.writableEnded) json(res, 200, saida ?? { ok: true });
  } catch (e) {
    const status = e.status || 500;
    // Erro interno (banco, rede) não vaza detalhe: o log recebe rota, etapa e tipo do erro (sem dado pessoal);
    // a tela recebe uma frase de gente e o número do pedido, para quem atende achar a linha certa.
    if (status >= 500) { const r = pedido.resumoDoErro(e, { status, quem: req.quem }); Registro.evento('error', r.evento, r.campos); }
    if (!res.writableEnded) json(res, status, { erro: seg.mensagemPublica(e), ...(e.extra || {}), ...(status >= 500 ? { pedido: pedido.id } : {}) });
  }
}

const servidor = http.createServer((req, res) => { tratar(req, res); });

/* ------------------------------------------------------------
   Subida e parada educada
   ------------------------------------------------------------ */
/* As rotinas que rodam sozinhas (coleta, radar, relatório, avisos). Ligar duas vezes não duplica nada. */
const rotinasPedidas = () => process.env.ADS_AUTOMATICO === '1' || process.env.TRAFEGO_AUTOMATICO === '1';
function ligarRotinas() { agenda.iniciar(); return agenda.estado.ligado; }
function desligarRotinas() { agenda.parar(); return agenda.estado.ligado; }

/**
 * Sobe o app.
 *   iniciar()            -> porta do ambiente (3400), como sempre
 *   iniciar(3411)        -> na porta pedida
 *   iniciar({ ouvir: false, rotinas })  -> SEM abrir porta (montado na Central, que chama `handler`).
 *     `rotinas`: true liga, false não liga; sem dizer, segue ADS_AUTOMATICO=1 ou TRAFEGO_AUTOMATICO=1.
 *     Devolve { ouvindo: false, rotinas } em vez do servidor.
 */
function iniciar(opcoes = PORT) {
  const o = opcoes && typeof opcoes === 'object' ? opcoes : { porta: opcoes };
  const porta = o.porta ?? PORT;
  if (o.ouvir === false) {
    const ligar = o.rotinas === undefined ? rotinasPedidas() : o.rotinas === true;
    if (ligar) ligarRotinas();
    return { ouvindo: false, rotinas: agenda.estado.ligado, versao: VERSAO };
  }
  servidor.listen(porta, () => {
    console.log('🏎  IndyCar · Tráfego');
    console.log(`   http://localhost:${porta}${estatico.temTelaNova() ? '' : '   (tela nova ainda não está em tela/: servindo a antiga)'}`);
    if (!auth.configurado()) {
      console.log('   ⚠️  Falta configurar o .env (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).');
      console.log('      Copie .env.exemplo para .env e preencha.');
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('   ℹ️  Sem ANTHROPIC_API_KEY: o relatório sai só com números, sem a leitura do dia.');
    }
    if (o.rotinas === undefined ? rotinasPedidas() : o.rotinas === true) ligarRotinas();
    else console.log('   ℹ️  Piloto automático desligado (ADS_AUTOMATICO≠1). Use as rotas /api/cron/*.');
    // Rodada 5: modo sem chaves — sem token real e sem dado nenhum, o app semeia a demonstração sozinho
    // (marcada como demo) para a tela nunca abrir vazia enquanto o João não cola as chaves.
    if (process.env.ADS_DEMO === '1' && auth.configurado()) semearDemoSePreciso().catch(e => console.warn('   ⚠️  demonstração automática:', e.message));
  });
  return servidor;
}

async function semearDemoSePreciso() {
  if (await db.temChaves()) return false;
  if (await db.temDados()) return false;
  const r = await coletor.popularDemo(45);
  console.log(`   🧪 Modo sem chaves: demonstração criada sozinha (${r.linhas} linhas, 45 dias, marcadas como demo).`);
  return true;
}

/* SIGTERM é como o Render (e o Ctrl+C) avisam que vão derrubar o processo:
   para os timers, deixa as respostas em curso terminarem e sai limpo. Se
   algo travar, 8 s depois sai de qualquer jeito. */
let encerrando = false;
function encerrar(sinal) {
  if (encerrando) return;
  encerrando = true;
  console.log(`⏹  ${sinal} recebido — encerrando com calma...`);
  agenda.parar();
  servidor.close(() => { console.log('   servidor fechado.'); process.exit(0); });
  setTimeout(() => { console.warn('   demorou; saindo assim mesmo.'); process.exit(1); }, 8000).unref();
}

if (require.main === module) {
  iniciar();
  process.on('SIGTERM', () => encerrar('SIGTERM'));
  process.on('SIGINT', () => encerrar('SIGINT'));
}

module.exports = { handler: tratar, VERSAO, ROTAS_CARREGADAS, ROTAS_COM_ERRO, ctxRotas, servidor, iniciar, encerrar, ligarRotinas, desligarRotinas, estatico, tratar, validarConfig, periodoDaQuery, LIMITE_CORPO, ErroHttp, limitador, semearDemoSePreciso };
