/* ============================================================
   ROTAS DA RODADA 6 (C3) — login obrigatório em todas.

   GET  /api/r6/fila                       o que sabemos de cada conversa (pedidos, pátio, orçamento, falhas)
   GET  /api/r6/cliente/:id                painel conectado do cliente (pátio, Orçador, Agenda, CRM)
   GET  /api/r6/patio/:clienteId           só a etapa do carro (a ficha pergunta a cada 20 s)
   GET  /api/r6/sugestoes/:conversaId      respostas prontas para o que o cliente acabou de pedir
   GET  /api/r6/conversas/:id/ia           o que a IA está fazendo nesta conversa e por quê
   POST /api/r6/conversas/:id/passar-consultor   {motivo}  aguardando consultor + tarefa
   GET  /api/r6/c5/conversa/:conversaId        Orçador AO VIVO (com o JWT de quem está logado) + pré-agendamentos + ações do 360
   GET  /api/r6/c5/carros                  carros no pátio sem conversa aberta (patio_carros_abertos)
   GET  /api/r6/c5/funil?dias=             (gestor/admin) funil do Orçador (orc_funil, com o JWT do gestor)
   GET  /api/r6/zap                        o WhatsApp está parado? quantas mensagens não saíram
   GET  /api/r6/nao-sairam                 mensagens de saída que falharam (para decidir uma a uma)
   POST /api/r6/nao-sairam/resolver        {mensagemId, nota?} "resolvi por telefone"
   POST /api/r6/testar-mensagem            {texto} (gestor/admin) o que o sistema faria com essa mensagem

   As dependências vêm de fora (server.js) para testar com dublês.
   ============================================================ */
'use strict';

const R6 = require('../public/r6-regras.js');
const { ORIGENS_ECOSSISTEMA } = require('./seguranca.js');
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function criarRotasR6({ getSb, usuarioLogado, dentroDoLimite, readBody, dados, zap, funil = null, copiloto = null, contexto = null, c5 = null, tokenDe = () => null, auditar = async () => ({ ok: true }) }) {
  const enviar = (req, res, code, data) => {
    const corpo = JSON.stringify(data);
    const cab = { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(corpo),
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    const origem = req.headers.origin;
    if (origem && ORIGENS_ECOSSISTEMA.has(origem)) { cab['Access-Control-Allow-Origin'] = origem; cab['Vary'] = 'Origin'; }
    res.writeHead(code, cab);
    res.end(corpo);
    return true;
  };
  const exigir = async (req, res) => {
    const quem = await usuarioLogado(req);
    if (!quem) { enviar(req, res, 401, { ok: false, erro: 'Faça login.' }); return null; }
    return quem;
  };
  const limitar = (req, res, chave, teto, janela = 60_000) => {
    if (dentroDoLimite(chave, teto, janela)) return true;
    enviar(req, res, 429, { ok: false, erro: 'Muitos pedidos seguidos. Espere um minuto.' });
    return false;
  };
  const D = () => (typeof dados === 'function' ? dados() : dados);

  return async function tratar(req, res, pathname) {
    if (!pathname.startsWith('/api/r6/')) return false;
    const semBanco = () => enviar(req, res, 503, { ok: false, erro: 'Servidor sem SUPABASE_SERVICE_ROLE_KEY — não enxergo o Pátio nem o Orçador.' });

    if (pathname === '/api/r6/fila' && req.method === 'GET') {
      const quem = await exigir(req, res); if (!quem) return true;
      if (!limitar(req, res, `r6-fila:${quem.id}`, 90)) return true;
      if (!getSb()) return semBanco();
      const r = await D().filaContexto();
      return enviar(req, res, 200, r);
    }

    let m = /^\/api\/r6\/cliente\/([^/]+)$/.exec(pathname);
    if (m && req.method === 'GET') {
      const quem = await exigir(req, res); if (!quem) return true;
      const id = decodeURIComponent(m[1]);
      if (!RE_UUID.test(id)) return enviar(req, res, 400, { ok: false, erro: 'id de cliente inválido' });
      if (!limitar(req, res, `r6-cliente:${quem.id}`, 120)) return true;
      if (!getSb()) return semBanco();
      const r = await D().painelCliente(id);
      return enviar(req, res, r.ok ? 200 : (r.status || 503), r);
    }

    m = /^\/api\/r6\/patio\/([^/]+)$/.exec(pathname);
    if (m && req.method === 'GET') {
      const quem = await exigir(req, res); if (!quem) return true;
      const id = decodeURIComponent(m[1]);
      if (!RE_UUID.test(id)) return enviar(req, res, 400, { ok: false, erro: 'id de cliente inválido' });
      if (!limitar(req, res, `r6-patio:${quem.id}`, 240)) return true;
      if (!getSb()) return semBanco();
      const r = await D().patioAoVivo(id);
      return enviar(req, res, r.ok ? 200 : (r.status || 503), r);
    }

    m = /^\/api\/r6\/sugestoes\/([^/]+)$/.exec(pathname);
    if (m && req.method === 'GET') {
      const quem = await exigir(req, res); if (!quem) return true;
      const id = decodeURIComponent(m[1]);
      if (!RE_UUID.test(id)) return enviar(req, res, 400, { ok: false, erro: 'id de conversa inválido' });
      if (!limitar(req, res, `r6-sug:${quem.id}`, 120)) return true;
      const sb = getSb(); if (!sb) return semBanco();
      const { data: cv } = await sb.from('conversas').select('id,nome,cliente_id,telefone').eq('id', id).maybeSingle();
      if (!cv) return enviar(req, res, 404, { ok: false, erro: 'Conversa não encontrada.' });
      const { data: msgs } = await sb.from('whatsapp_mensagens').select('direcao,corpo,anexo,anexo_mime,created_at')
        .eq('conversa_id', id).order('created_at', { ascending: false }).limit(12);
      const { textosSemResposta } = require('./r6-dados.js');
      const sem = textosSemResposta((msgs || []).slice().reverse());
      const pedidos = R6.oQueOClientePediu(sem);
      const formulario = R6.lerFormularioSite((msgs || []).filter(x => x.direcao === 'entrada').map(x => x.corpo));
      let painel = null;
      if (cv.cliente_id) painel = await D().painelCliente(cv.cliente_id).catch(() => null);
      const aberta = R6.oficinaAberta(new Date());
      const ficha = {
        nome: painel?.cliente?.nome || cv.nome, carro: painel?.cliente?.carro || null,
        patio: painel?.patio ? { etapa: painel.patio.etapa, etapa_rotulo: painel.patio.etapa_rotulo,
          previsao: painel.patio.previsao_entrega ? new Date(painel.patio.previsao_entrega).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null } : null,
        orc: painel?.orcamentos?.length ? (() => { const p = painel.orcamentos.find(o => o.id === painel.orcamento_principal) || painel.orcamentos[0]; return { numero: p.numero, rotulo: p.rotulo }; })() : null,
        horarios: [], foraDoHorario: !aberta.aberta,
      };
      if (contexto) {
        try {
          const cx = typeof contexto === 'function' ? contexto() : contexto;
          const c = cx ? await cx.montarContexto(id) : null;
          if (c?.ok) ficha.horarios = (c.ficha.horariosSugeridos || []).map(x => x.rotulo).filter(Boolean);
        } catch { /* sem horários: a resposta pergunta o dia */ }
      }
      const respostas = R6.respostasRapidas(pedidos, ficha).filter(r => !R6.textoTemPreco(r.texto));
      return enviar(req, res, 200, { ok: true, pedidos, respostas, formulario, fora_do_horario: !aberta.aberta, reabre: aberta.reabre });
    }

    m = /^\/api\/r6\/conversas\/([^/]+)\/ia$/.exec(pathname);
    if (m && req.method === 'GET') {
      const quem = await exigir(req, res); if (!quem) return true;
      const id = decodeURIComponent(m[1]);
      if (!RE_UUID.test(id)) return enviar(req, res, 400, { ok: false, erro: 'id de conversa inválido' });
      if (!limitar(req, res, `r6-ia:${quem.id}`, 120)) return true;
      if (!getSb()) return semBanco();
      let config = null;
      try { const c = typeof copiloto === 'function' ? copiloto() : copiloto; config = c?.lerConfig ? await c.lerConfig() : null; } catch { /* segue sem a config */ }
      const r = await D().estadoIA(id, { config });
      return enviar(req, res, r.ok ? 200 : (r.status || 503), r);
    }

    m = /^\/api\/r6\/conversas\/([^/]+)\/passar-consultor$/.exec(pathname);
    if (m && req.method === 'POST') {
      const quem = await exigir(req, res); if (!quem) return true;
      const id = decodeURIComponent(m[1]);
      if (!RE_UUID.test(id)) return enviar(req, res, 400, { ok: false, erro: 'id de conversa inválido' });
      if (!limitar(req, res, `r6-passar:${quem.id}`, 30)) return true;
      if (!getSb()) return semBanco();
      const corpo = await readBody(req);
      const motivo = Object.keys(R6.MOTIVO_HUMANO).includes(corpo?.motivo) ? corpo.motivo : 'preco';
      const r = await D().passarParaConsultor({ conversaId: id, perfil: quem, motivo });
      return enviar(req, res, r.ok ? 200 : (r.status || 503), r);
    }

    m = /^\/api\/r6\/c5\/conversa\/([^/]+)$/.exec(pathname);
    if (m && req.method === 'GET') {
      const quem = await exigir(req, res); if (!quem) return true;
      const id = decodeURIComponent(m[1]);
      if (!RE_UUID.test(id)) return enviar(req, res, 400, { ok: false, erro: 'id de conversa inválido' });
      if (!limitar(req, res, `r6c5-con:${quem.id}`, 180)) return true;
      const sb = getSb(); if (!sb || !c5) return semBanco();
      const { data: cv } = await sb.from('conversas').select('id,cliente_id,nome,telefone,telefone_e164').eq('id', id).maybeSingle();
      if (!cv) return enviar(req, res, 404, { ok: false, erro: 'Conversa não encontrada.' });
      let painel = null;
      if (cv.cliente_id) { painel = await D().painelCliente(cv.cliente_id).catch(() => null); if (painel && !painel.ok) painel = null; }
      const telefone = painel?.cliente?.telefone || cv.telefone_e164 || cv.telefone;
      const live = await c5.orcamentosAoVivo({ token: tokenDe(req), telefone, leadId: painel?.lead?.id || null });
      const mesclados = R6.mesclarOrcamentos(painel?.orcamentos || [], live.orcamentos);
      const principal = R6.orcamentoQueImporta(mesclados, new Date());
      const pre = await c5.preAgendamentos({ clienteId: cv.cliente_id, telefone });
      const AVISOS = { sem_permissao: 'Seu acesso não enxerga o Orçador agora. Peça ao administrador para conferir seu perfil.', sem_telefone: null,
        sem_token: 'Sua sessão expirou: entre de novo para ver o Orçador ao vivo.', rede: 'O Orçador não respondeu agora. Mostrando o que já sabíamos.' };
      const aviso = live.ok ? (live.parcial ? 'O Orçador respondeu só em parte agora. Pode faltar algum orçamento.' : null) : (live.motivo in AVISOS ? AVISOS[live.motivo] : 'Não consegui ler o Orçador agora. Mostrando o que já sabíamos.');
      return enviar(req, res, 200, { ok: true, gerado_em: new Date().toISOString(), ao_vivo: live.ok, aviso, orcamentos: mesclados.slice(0, 8),
        orcamento_principal: principal ? principal.id : null, pre_agendamentos: pre, acoes: painel?.acoes || [],
        cliente: { nome: painel?.cliente?.nome || cv.nome || null, carro: painel?.cliente?.carro || null, placa: painel?.cliente?.placa || null },
        link_novo_orcamento: R6.linkNovoOrcamento({ conversaId: id, telefone, nome: painel?.cliente?.nome || cv.nome, placa: painel?.cliente?.placa, veiculo: painel?.cliente?.carro, leadId: painel?.lead?.id }) });
    }

    if (pathname === '/api/r6/c5/funil' && req.method === 'GET') {
      const quem = await exigir(req, res); if (!quem) return true;
      if (!['admin', 'gestor'].includes(quem.papel)) return enviar(req, res, 403, { ok: false, erro: 'Só gestor ou administrador vê o desempenho do Orçador.' });
      if (!limitar(req, res, `r6c5-funil:${quem.id}`, 20)) return true;
      if (!c5) return semBanco();
      const dias = Number(new URL(req.url, 'http://x').searchParams.get('dias')) || 30;
      const r = await c5.funilOrcador({ token: tokenDe(req), dias });
      if (!r.ok) return enviar(req, res, 503, { ok: false, erro: r.motivo === 'sem_permissao' ? 'Seu usuário não tem acesso ao Orçador.' : r.motivo === 'sem_token' ? 'Sua sessão expirou: entre de novo.' : 'Não consegui ver o Orçador agora.' });
      return enviar(req, res, 200, r);
    }

    if (pathname === '/api/r6/c5/carros' && req.method === 'GET') {
      const quem = await exigir(req, res); if (!quem) return true;
      if (!limitar(req, res, `r6c5-carros:${quem.id}`, 60)) return true;
      if (!getSb() || !c5) return semBanco();
      const r = await c5.carrosSemConversa();
      return enviar(req, res, r.ok ? 200 : 503, r);
    }

    if (pathname === '/api/r6/zap' && req.method === 'GET') {
      const quem = await exigir(req, res); if (!quem) return true;
      if (!limitar(req, res, `r6-zap:${quem.id}`, 120)) return true;
      const est = zap.estado();
      let contagem = { nao_saiu: 0, sem_confirmacao: 0 };
      if (getSb()) {
        try { const r = await D().naoSairam({ dias: 3, limite: 300 }); contagem = { nao_saiu: r.nao_saiu.length, sem_confirmacao: r.sem_confirmacao.length }; } catch { /* sem contagem */ }
      }
      return enviar(req, res, 200, { ok: true, ...est, ...contagem, texto: est.parado ? est.texto : '' });
    }

    if (pathname === '/api/r6/nao-sairam' && req.method === 'GET') {
      const quem = await exigir(req, res); if (!quem) return true;
      if (!limitar(req, res, `r6-nsairam:${quem.id}`, 60)) return true;
      if (!getSb()) return semBanco();
      const dias = Math.min(30, Math.max(1, Number(new URL(req.url, 'http://x').searchParams.get('dias')) || 3));
      const r = await D().naoSairam({ dias });
      return enviar(req, res, 200, { ...r, zap: zap.estado() });
    }

    if (pathname === '/api/r6/nao-sairam/resolver' && req.method === 'POST') {
      const quem = await exigir(req, res); if (!quem) return true;
      if (!limitar(req, res, `r6-resolver:${quem.id}`, 40)) return true;
      if (!getSb()) return semBanco();
      const corpo = await readBody(req);
      const r = await D().resolverFora({ mensagemId: corpo?.mensagemId, perfil: quem, nota: typeof corpo?.nota === 'string' ? corpo.nota : '' });
      return enviar(req, res, r.ok ? 200 : (r.status || 503), r);
    }

    if (pathname === '/api/r6/testar-mensagem' && req.method === 'POST') {
      const quem = await exigir(req, res); if (!quem) return true;
      if (!['admin', 'gestor'].includes(quem.papel)) return enviar(req, res, 403, { ok: false, erro: 'Só gestor ou administrador testa mensagens.' });
      if (!limitar(req, res, `r6-teste:${quem.id}`, 60)) return true;
      const corpo = await readBody(req);
      const texto = String(corpo?.texto ?? '').slice(0, 1000);
      if (!texto.trim()) return enviar(req, res, 400, { ok: false, erro: 'Escreva uma mensagem de cliente para testar.' });
      const pedidos = R6.oQueOClientePediu([texto]);
      const motivo = R6.motivoParaHumano([texto]);
      const aberta = R6.oficinaAberta(new Date());
      return enviar(req, res, 200, { ok: true, pedidos, motivo, motivo_rotulo: motivo ? R6.MOTIVO_HUMANO[motivo].rotulo : null,
        passa_para_gente: !!motivo, tem_preco: R6.textoTemPreco(texto),
        resposta_do_sistema: motivo ? R6.textoDeEncaminhamento(motivo, 'Cliente', !aberta.aberta) : null,
        respostas_prontas: R6.respostasRapidas(pedidos, { nome: 'Cliente', foraDoHorario: !aberta.aberta }).map(r => r.rotulo) });
    }

    return enviar(req, res, 404, { ok: false, erro: 'rota não encontrada' });
  };
}

module.exports = { criarRotasR6 };
