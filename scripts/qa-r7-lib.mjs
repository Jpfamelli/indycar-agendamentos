// Ferramentas do QA da Rodada 7 / C1 (Casa): reaproveita o que as rodadas anteriores montaram (usuário de teste criado e APAGADO,
// navegador headless, dados de mentira) e acrescenta mocks de qualquer tabela/RPC, do WhatsApp (wa.me) e do servidor de links.
// Nada aqui escreve no banco além do usuário de teste. NUNCA imprime chave nem senha.
import { criarContexto, abrirNavegador, entrarNaCasa, dadosAgora, dadosExtras, dadosDono, dadosBusca, dadosManha, medirTela, TAREFAS, NOTIFS, iso, placar, conf, dorme, visivel, texto, fim } from './qa-r6c-lib.mjs';
export { criarContexto, abrirNavegador, entrarNaCasa, dadosAgora, dadosExtras, dadosDono, dadosBusca, dadosManha, medirTela, iso, placar, conf, dorme, visivel, texto, fim };

export const BASE = process.env.QA_BASE || 'http://localhost:3171';
export const U = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
export const saudeOk = () => ({ verificado_em: Date.now(), apps: { patio: { fora: false, suspeito: false }, orcador: { fora: false, suspeito: false } }, internos: { agenda: { ok: true }, crm: { ok: true }, comunicar: { ok: true }, atendimento: { ok: true } } });

export const RPC_SAUDE = (o = {}) => ({
  gerado_em: new Date().toISOString(),
  whatsapp: { estado: null, desde: null, motivo: null },
  comunicar: { pausa_geral: false, ultima_rodada_em: new Date().toISOString(), lembrete_ligado: false, fila: 0, falhas_24h: 0, enviadas_24h: 3 },
  movere: { ultima_carga: null, cargas: 0 },
  vigia: ['tarefas-acumuladas', 'codewords-chave-recusada', 'notificacoes-acumuladas', 'e2e-falhou'],
  patio_falhas_24h: 0, ...o,
});
export const LIGACOES = () => ({ versao: 'r7', verificacoes: [
  { app: 'Agenda/Pátio', codigo: 'agendamento_chegou_sem_os', descricao: 'Agendamento "compareceu" há mais de 1 h sem OS no Pátio', gravidade: 'alta', quantidade: 3, recentes: 1, como_resolver: 'Abra a entrada pelo botão do Pátio.', links: ['https://indycar-agendamentos.onrender.com/agenda/?agendamento=' + U(901)] },
  { app: 'Orçador', codigo: 'orcamento_sem_cliente', descricao: 'Orçamento enviado sem cliente ligado', gravidade: 'media', quantidade: 2, recentes: 0, como_resolver: 'Confira o telefone.', links: [] },
  { app: 'Pátio', codigo: 'os_sem_cliente', descricao: 'OS sem cliente', gravidade: 'media', quantidade: 0, links: [] },
] });
export const C360 = (tel = '5512991821234', nome = 'Marcos Lima') => ({
  versao: 'r6', cliente: { nome, telefone_55: tel, aceita_mensagens: true },
  resumo: { orcamentos_total: 2, orcamentos_aprovados: 1, valor_orcamentos_em_aberto: 1890.5, nota_media: 5, dias_desde_ultima_visita: 3 },
  patio: [{ numero: 31, veiculo: 'Gol 1.0', placa: 'ABC1D23', etapa: 'pronto', etapa_rotulo: 'Pronto', aberta: true, extras: [{}], link_equipe: 'https://indycar-patio.netlify.app/?os=' + U(31) }],
  orcamentos: [{ numero: 12, status: 'enviado', status_rotulo: 'esperando resposta', total: 1890.5, horas_esperando: 30, veiculo: 'Gol', link_equipe: 'https://indycar-orcador.netlify.app/#/historico/' + U(12) }],
  agendamentos: [{ data: new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), hora: '09:30:00', servico: 'Revisão', status: 'aguardando', link_equipe: 'https://indycar-agendamentos.onrender.com/agenda/?agendamento=' + U(901) }],
  acoes_sugeridas: [{ codigo: 'cobrar_orcamento', app: 'orcador', titulo: 'Cobrar o orçamento nº 12', motivo: 'enviado há 30 h', link: 'https://indycar-orcador.netlify.app/#/historico/' + U(12) }],
  linha_do_tempo: [{ quando: iso(60), app: 'orcador', titulo: 'Orçamento nº 12 enviado', detalhe: 'R$ 1.890,50', link: null }, { quando: iso(500), app: 'patio', titulo: 'Entrou no pátio', detalhe: '', link: null }],
  links: { crm: 'https://indycar-agendamentos.onrender.com/crm/?cliente=' + U(5), nova_cotacao: 'https://indycar-orcador.netlify.app/?tel=5512991821234' },
});
export const TAREFAS_R7 = () => TAREFAS().concat([
  { id: U(101), titulo: 'Reabordar Marcos Lima: orçamento nº 0012 foi recusado', descricao: 'Gol. Recusou por preço há 8 dia(s). Vale chamar no WhatsApp. https://indycar-orcador.netlify.app/#/historico/' + U(12), prioridade: 1, vence_em: iso(-600), status: 'aberta', responsavel_id: null, origem: 'orcador', cliente_id: U(5), lead_id: null },
  { id: U(102), titulo: 'Acompanhar orçamento nº 0014 da Paula', descricao: null, prioridade: 2, vence_em: iso(-3000), status: 'aberta', responsavel_id: null, origem: 'orcador', cliente_id: U(6), lead_id: null },
  { id: U(103), titulo: 'Conferir peça do HB20', descricao: null, prioridade: 2, vence_em: null, status: 'aberta', responsavel_id: null, origem: 'patio' },
]);

/** Interceptação: RPCs e tabelas de mentira, o wa.me em branco e o servidor de links. Registra tudo que seria escrito. */
export function montarMocks7(estado) {
  return (req) => {
    const u = req.url();
    const m = req.method();
    const json = (corpo, status = 200) => req.respond({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(corpo) });
    if (/^https:\/\/wa\.me\//.test(u)) { estado.wa.push(u); return req.respond({ status: 200, contentType: 'text/html', body: '<title>wa</title>' }); }
    if (/\/api\/central\/saude-apps/.test(u)) { estado.saudeChamadas++; return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(estado.saude()) }); }
    if (/\/api\/central\/links-cliente/.test(u)) {
      estado.linksChamadas.push({ metodo: m, corpo: req.postData(), auth: !!req.headers().authorization });
      if (estado.linksResposta) return req.respond({ status: estado.linksResposta.status, contentType: 'application/json', body: JSON.stringify(estado.linksResposta.corpo) });
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, nome: 'Marcos Lima', aceita_mensagens: true, minha: 'https://indycar-patio.netlify.app/minha/?c=tokteste', indique: 'https://indycar-patio.netlify.app/minha/indicado/?i=abc123', acompanhar: 'https://indycar-patio.netlify.app/acompanhar/?t=tok2', os: { numero: 31, etapa_rotulo: 'Pronto' } }) });
    }
    if (/\/agenda\/api\/agendamentos/.test(u) && estado.agendaApi) { return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(typeof estado.agendaApi === 'function' ? estado.agendaApi() : estado.agendaApi) }); }
    const rpc = /\/rest\/v1\/rpc\/([a-z0-9_]+)/.exec(u);
    if (rpc && estado.rpc[rpc[1]] !== undefined) {
      if (m === 'OPTIONS') return req.respond({ status: 204, headers: CORS });
      const v = estado.rpc[rpc[1]];
      estado.chamadasRpc.push({ nome: rpc[1], corpo: req.postData() });
      const atraso = estado.atrasoRpc && estado.atrasoRpc[rpc[1]];
      const responder = () => { try { const r = typeof v === 'function' ? v(req) : v; if (r && r.__status) return json(r.corpo, r.__status); return json(r); } catch (e) { return json({ message: String(e) }, 500); } };
      return atraso ? setTimeout(responder, atraso) : responder();
    }
    const rest = /\/rest\/v1\/([a-z0-9_]+)(\?|$)/.exec(u);
    if (rest && estado.rest[rest[1]] !== undefined) {
      if (m === 'OPTIONS') return req.respond({ status: 204, headers: CORS });
      if (m === 'GET' || m === 'HEAD') { estado.leituras.push(rest[1]); const v = estado.rest[rest[1]]; return json(typeof v === 'function' ? v(u) : v); }
      estado.escritas.push({ tabela: rest[1], metodo: m, url: u, corpo: req.postData() });
      return req.respond({ status: 204, headers: CORS });
    }
    req.continue();
  };
}

export function estadoPadrao() {
  return {
    saudeChamadas: 0, saude: saudeOk, escritas: [], leituras: [], chamadasRpc: [], wa: [], linksChamadas: [],
    rpc: {
      r6_agora: dadosAgora(), r6_c1_agora_extras: dadosExtras(), r6_c1_painel_dono: dadosDono(), r6_busca_global: dadosBusca(), r6_c1c_manha: dadosManha(),
      r6_c1b_painel_consultores: { consultores: [], origens: [] },
      r7_c1_parar: {}, r7_c1_saude_sistemas: RPC_SAUDE(), r7_x3_saude: { ok: true, cron: { falhas_24h: [], faltando: [] }, gatilhos: { faltando: [] }, funcoes_faltando: [], tabelas_faltando: [] },
      r7_x3_ligacoes_quebradas: LIGACOES(), r6_cliente_360: C360(),
    },
    rest: { tarefas: TAREFAS_R7(), notificacoes: NOTIFS(), consultores: [], casa_metas: [],
      orc_tarefas: [{ tarefa_id: U(101), orcamento_id: U(12), tipo: 'reabordar' }, { tarefa_id: U(102), orcamento_id: U(14), tipo: 'followup' }],
      orc_orcamentos: [{ id: U(12), numero: 12 }, { id: U(14), numero: 14 }],
      clientes: [{ id: U(5), nome: 'Marcos Lima', telefone: '5512991821234' }, { id: U(6), nome: 'Paula Dias', telefone: '5512988887777' }],
      patio_os: [], patio_extras: [] },
  };
}

/** Abre um cenário na Casa com usuário de teste (criado e apagado) e mocks. */
export async function cenario7(papel, largura, fn, { apps, ajustar, altura, rotulo } = {}) {
  const ctx = criarContexto(papel, apps);
  const { browser, page } = await abrirNavegador({ largura, altura: altura || (largura < 500 ? 800 : 950) });
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  const estado = estadoPadrao();
  ajustar && ajustar(estado);
  const nome = rotulo || `${papel}/${largura}px`;
  try {
    await ctx.criar();
    await page.setRequestInterception(true);
    page.on('request', montarMocks7(estado));
    await entrarNaCasa(page, BASE, ctx);
    await fn({ page, browser, ctx, erros, estado });
    conf(erros.length === 0, `${nome}: nenhum erro de JS no console${erros.length ? ' → ' + erros.slice(0, 3).join(' | ') : ''}`);
  } catch (e) { conf(false, `${nome}: exceção ${e.message}`); }
  finally { await browser.close(); console.log(`  usuário de teste apagado: ${await ctx.apagar()}`); }
}

/** Espera uma aba nova (window.open) e devolve a URL dela; null se não abrir em `ms`. */
export async function abaNova(browser, acao, ms = 4000) {
  const p = new Promise((res) => browser.once('targetcreated', (t) => res(t)));
  await acao();
  const t = await Promise.race([p, dorme(ms).then(() => null)]);
  if (t) await dorme(600);
  return t ? t.url() : null;
}
