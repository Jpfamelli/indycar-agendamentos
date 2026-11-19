/* ============================================================
   Preparo — "do teste ao real" (rodada 7, 25/10/2026).
   Sem as chaves reais da Meta e do Google o app roda em demonstração.
   Este módulo diz, em frases do dia a dia, em que modo o painel está e
   o que falta para os números serem de verdade — sem esconder nada atrás
   de jargão. A montagem é pura (testada); a leitura do banco é injetada.
   ============================================================ */
'use strict';

const db = require('./db');

/** Pura: monta a lista de passos e o modo do painel. Cada entrada é só o estado já lido. */
function montar({ chaves = {}, config = {}, temDados = false, temDadosReais = false, ia = false, ligacao = null, canalWhatsApp = null, dadosDemo = false } = {}) {
  const ok = c => chaves[c] === 'ok';
  const recusada = c => chaves[c] === 'recusada';
  const rotulo = { meta: 'Meta (Facebook e Instagram)', google: 'Google Ads' };
  const passoChave = c => ({
    id: `chave_${c}`, titulo: `Conectar ${rotulo[c]}`,
    estado: ok(c) ? 'ok' : recusada(c) ? 'atencao' : 'falta',
    como: ok(c) ? 'A plataforma aceitou a chave.'
      : recusada(c) ? 'A chave foi colada, mas a plataforma recusou: gere outra em Ajustes → Conexões e use “Testar sem salvar”.'
      : c === 'meta' ? 'Cole o token da Marketing API em Ajustes → Conexões (o guia mostra o passo a passo).'
      : 'Cole o token de desenvolvedor e o de acesso do Google Ads em Ajustes → Conexões.',
    aba: 'ajustes',
  });
  const destinos = (config.whatsapp_destinos || []).length;
  const passos = [
    passoChave('meta'), passoChave('google'),
    { id: 'dados_reais', titulo: 'Receber números de verdade', estado: temDadosReais ? 'ok' : 'falta',
      como: temDadosReais ? 'Já há investimento real no banco.' : 'Depois de conectar uma plataforma, toque em “Atualizar dados” no topo.', aba: 'painel' },
    { id: 'metas', titulo: 'Dizer quanto custa um bom resultado', estado: config.cpa_alvo || config.orcamento_mensal ? 'ok' : 'falta',
      como: config.cpa_alvo || config.orcamento_mensal ? 'Metas cadastradas: o painel marca o que está acima do limite.' : 'Cadastre o custo por resultado e o orçamento do mês em Ajustes → Metas.', aba: 'ajustes' },
    { id: 'whatsapp_destino', titulo: 'Cadastrar quem recebe os avisos no WhatsApp', estado: destinos ? 'ok' : 'falta',
      como: destinos ? `${destinos} número(s) cadastrado(s).` : 'Cadastre o número do dono em Ajustes → Avisos no WhatsApp. Sem isso nada é enviado.', aba: 'ajustes' },
    { id: 'relatorio', titulo: 'Ligar o relatório diário', estado: config.relatorio_ativo === true ? 'ok' : 'falta',
      como: config.relatorio_ativo === true ? `Sai todo dia às ${config.relatorio_hora ?? 8}h.` : 'Está desligado. Ligue em Ajustes quando os números forem reais.', aba: 'ajustes' },
    { id: 'whatsapp_canal', titulo: 'WhatsApp da oficina funcionando', estado: canalWhatsApp == null ? 'atencao' : canalWhatsApp ? 'ok' : 'atencao',
      como: canalWhatsApp == null ? 'Não consegui conferir o canal agora.' : canalWhatsApp ? 'O canal do Comunicar está de pé.' : 'O canal do WhatsApp está com problema: os avisos esperam na fila do Comunicar até voltar.', aba: 'ajustes' },
    { id: 'ia', titulo: 'Leitura do dia escrita pela IA (opcional)', estado: ia ? 'ok' : 'opcional',
      como: ia ? 'Ligada.' : 'Sem a chave da IA o relatório sai só com os números. Não impede nada.', aba: 'ajustes' },
    { id: 'ligacao', titulo: 'Orçamentos ligados ao lead (custo por carro)', estado: !ligacao || ligacao.indisponivel ? 'atencao' : ligacao.saudavel ? 'ok' : 'atencao',
      como: !ligacao || ligacao.indisponivel ? 'Não consegui conferir o Orçador agora.' : ligacao.frase, aba: 'resultados' },
  ];
  const obrigatorios = passos.filter(p => p.estado !== 'opcional');
  const feitos = obrigatorios.filter(p => p.estado === 'ok').length;
  const comChave = ok('meta') || ok('google');
  const modo = !temDados ? 'vazio' : (!comChave || (dadosDemo && !temDadosReais)) ? 'demonstracao' : 'real';
  const proximo = obrigatorios.find(p => p.estado !== 'ok') || null;
  const frase = modo === 'real' ? (proximo ? `Painel com números reais. Próximo passo: ${proximo.titulo}.` : 'Painel com números reais e tudo configurado.')
    : modo === 'demonstracao' ? `Painel em DEMONSTRAÇÃO: o investimento é fabricado. ${proximo ? `Para o real: ${proximo.titulo}.` : ''}`.trim()
    : 'Painel vazio: crie a demonstração ou conecte a Meta/Google.';
  return { modo, feitos, total: obrigatorios.length, proximo: proximo ? proximo.id : null, frase, passos };
}

/** Lê o estado do banco e monta (cada leitura que falha vira "não sei", nunca erro). */
async function ler({ deps = {} } = {}) {
  const d = {
    chaves: deps.chaves || (() => db.estadoChaves()), config: deps.config || (() => db.lerConfig()),
    temDados: deps.temDados || (() => db.temDados()), temDadosReais: deps.temDadosReais || (() => db.temDadosReais()),
    ligacao: deps.ligacao || (() => require('./ciclo').ligacao()),
    canal: deps.canal || (() => require('./whatsapp').status().then(s => s.pronto)),
    ia: deps.ia || (() => !!process.env.ANTHROPIC_API_KEY),
  };
  const seguro = async (f, padrao) => { try { return await f(); } catch { return padrao; } };
  const [chaves, config, temDados, temDadosReais, ligacao, canal, ia] = await Promise.all([
    seguro(d.chaves, {}), seguro(d.config, {}), seguro(d.temDados, false), seguro(d.temDadosReais, false), seguro(d.ligacao, null), seguro(d.canal, null), seguro(d.ia, false),
  ]);
  return montar({ chaves, config, temDados, temDadosReais, ia, ligacao, canalWhatsApp: canal, dadosDemo: temDados && !temDadosReais });
}

module.exports = { montar, ler };
