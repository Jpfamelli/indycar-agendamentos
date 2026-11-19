/* ============================================================================
   Servidor de mentira da tela do IndyCar Tráfego (rodada 8, frente T3).

     node tela/_mock/servidor.mjs            → http://localhost:3430/trafego/
     PORTA=3431 BASE=/ node …/servidor.mjs   → app solto, na raiz

   Serve a pasta tela/ do mesmo jeito que o servidor de verdade (mesmos tipos,
   mesma política de segurança, mesmos arquivos escondidos) e responde /api/…
   no formato do CONTRATO-API.md, em cima do mundo inventado de dados.mjs.

   O cenário vem da PÁGINA, não da tela: abra /trafego/?cenario=cheio e toda
   chamada daquela página responde como "cheio" (o servidor lê o endereço da
   página no cabeçalho Referer). Cenários: sem_conta (padrão), cheio,
   falta_valor, comeco, demo. Nada na tela sabe que existe servidor de mentira.

   Para provar os estados de tela, também na página:
     ?sessao=nao        ninguém logado        ?sessao=vencida  a API recusa (401)
     ?acesso=nao        logado sem acesso ao app
     ?falha=hoje|jornada|detalhe|pendencias|gravar   a rota responde erro 500
     ?falha=migracao    gravar motivo ou origem responde 503 "o banco ainda não recebeu a atualização" (a produção de hoje);
                        frases, candidatas e chaves respondem ligado:false com aviso
     ?falha=campanhas|campanha|coleta|gestor|acoes|relatorio|origem|chaves   a rota responde erro 500
     ?incompleto=1      as respostas trazem estado.incompleto (e o aviso pronto na Hoje)
     ?ia=desligada      o Gestor responde 503 (sem chave da IA no servidor)
     ?ia=limite         o Gestor responde 429 (limite do dia)
     ?ia=quebra         o fluxo do Gestor para no meio com um evento "erro"
     ?miniatura=quebrada  a imagem do anúncio responde 404 (a tela mostra a reserva)
     ?lento=1500        cada leitura demora esse tanto (para ver o esqueleto)
     ?acordando=2abc    as 2 primeiras leituras voltam 503 (servidor acordando)
   GET /trafego/_mock/reiniciar devolve os mundos ao estado inicial.

   Portas: só 3430 a 3439 (combinado da rodada).
   ============================================================================ */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as Dados from './dados.mjs';
import * as T3b from './dados-t3b.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const TELA = path.resolve(AQUI, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
/* A mesma política do servidor de verdade (apps/trafego/seguranca.js): se a tela violar, o navegador reclama aqui também. */
const CSP = ["default-src 'self'", "script-src 'self'", "style-src 'self'", "style-src-attr 'unsafe-inline'", "font-src 'self'", "img-src 'self' data: blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"].join('; ');

function cabecalhos(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}
function json(res, status, dados) {
  const corpo = Buffer.from(JSON.stringify(dados));
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Content-Length': corpo.length, 'Cache-Control': 'no-store' });
  res.end(corpo);
}
function pagina(res, status, titulo, miolo) {
  const corpo = Buffer.from('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + titulo + '</title></head><body><h1>' + titulo + '</h1>' + miolo + '</body></html>');
  res.writeHead(status, { 'Content-Type': MIME['.html'], 'Content-Length': corpo.length, 'Cache-Control': 'no-store' });
  res.end(corpo);
}
function csv(res, { status = 200, csv: texto, nome }) {
  const corpo = Buffer.from(texto);
  res.writeHead(status, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Length': corpo.length, 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="' + nome + '"' });
  res.end(corpo);
}
const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let bruto = '';
    req.on('data', (c) => { bruto += c; if (bruto.length > 100000) { reject(new Error('corpo grande demais')); req.destroy(); } });
    req.on('end', () => { try { resolve(bruto.trim() ? JSON.parse(bruto) : {}); } catch { resolve(null); } });
    req.on('error', reject);
  });
}

/* O que não é para o navegador (igual a apps/trafego/estatico.js): o que começa com "_" ou ".", guias .md e testes. */
function escondido(rel) {
  const partes = rel.split(/[\\/]/);
  if (partes.some((p) => p.startsWith('.') || p.startsWith('_'))) return true;
  const nome = partes[partes.length - 1].toLowerCase();
  return nome.endsWith('.md') || /[.]test[.][cm]?js$/.test(nome);
}

export function criar({ base = '/trafego/' } = {}) {
  const BASE = base === '/' ? '/' : '/' + String(base).replace(/^[/]+|[/]+$/g, '') + '/';
  const mundos = new Map();
  const mundo = (cenario) => { if (!mundos.has(cenario)) mundos.set(cenario, Dados.criarMundo(cenario)); return mundos.get(cenario); };
  const acordadas = new Map();

  /* Cenário e modos de falha: do endereço da chamada ou, na falta, do endereço da página (Referer). */
  function contexto(req, url) {
    let daPagina = new URLSearchParams();
    try { daPagina = new URL(req.headers.referer || '').searchParams; } catch { /* sem página conhecida */ }
    const pega = (k) => url.searchParams.get(k) || daPagina.get(k) || '';
    const cenario = Dados.CENARIOS.includes(pega('cenario')) ? pega('cenario') : 'sem_conta';
    return { cenario, falha: pega('falha'), lento: Math.min(5000, Number(pega('lento')) || 0), acesso: pega('acesso'), sessao: pega('sessao'), acordando: pega('acordando'),
      incompleto: pega('incompleto') === '1', ia: pega('ia'), miniatura: pega('miniatura') };
  }

  /* Fluxo do Gestor (text/event-stream): os pedaços saem com espera, como o modelo de verdade. Parar no meio fecha a conexão. */
  async function fluxoDoGestor(req, res, m, ctx) {
    const corpo = await lerCorpo(req);
    const pergunta = corpo && typeof corpo.pergunta === 'string' ? corpo.pergunta.trim() : '';
    if (!pergunta) return json(res, 422, { erro: 'Escreva uma pergunta.', campo: 'pergunta' });
    if (pergunta.length > 2000) return json(res, 422, { erro: 'A pergunta passa de 2.000 letras.', campo: 'pergunta' });
    const conversaId = (corpo.conversa_id && T3b.responderConversa(m, corpo.conversa_id)) ? corpo.conversa_id : T3b.novaConversaId(m);
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    let fechou = false;
    res.on('close', () => { fechou = true; });
    res.write(': o Gestor começou\n\n');
    let resposta = '';
    for (const [evento, dados, espera] of T3b.roteiroDaResposta(m, pergunta, conversaId, { quebra: ctx.ia === 'quebra' })) {
      await dormir(espera);
      if (fechou) return undefined;
      if (evento === 'texto') resposta += dados.texto;
      // Cada evento sai em dois pedaços cortados no meio: a tela tem de juntar (como a rede faz de verdade).
      const bloco = 'event: ' + evento + '\ndata: ' + JSON.stringify(dados) + '\n\n';
      const meio = Math.floor(bloco.length / 2);
      res.write(bloco.slice(0, meio));
      res.write(bloco.slice(meio));
    }
    if (resposta) T3b.guardarConversa(m, conversaId, pergunta, resposta);
    return res.end();
  }

  async function api(req, res, caminho, url) {
    const ctx = contexto(req, url);
    const leitura = req.method === 'GET';
    if (caminho === '/api/ping') return json(res, 200, { ok: true, mentira: true });
    if (caminho === '/api/config-publica') return json(res, 200, { supabase_url: 'http://localhost', supabase_anon_key: 'chave-publica-de-mentira' });
    // Miniatura do anúncio: pública (a tag <img> não manda o login), como a rota da T6.
    const mini = /^[/]api[/]coleta[/]miniatura[/](meta|google)[/]([A-Za-z0-9_-]{1,40})$/.exec(caminho);
    if (mini && leitura) {
      if (ctx.miniatura === 'quebrada') return json(res, 404, { erro: 'Imagem não encontrada.' });
      const svg = Buffer.from(T3b.miniatura(mini[2]));
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Content-Length': svg.length, 'Cache-Control': 'private, max-age=21600' });
      return res.end(svg);
    }
    if (req.headers.authorization !== 'Bearer chave-de-mentira' || ctx.sessao === 'vencida') {
      return json(res, 401, { erro: 'faça login', codigo: ctx.sessao === 'vencida' ? 'sessao_vencida' : 'login' });
    }
    if (caminho === '/api/eu' && leitura) return json(res, 200, ctx.acesso === 'nao' ? { ...Dados.PERFIL, acesso: false, motivo_sem_acesso: 'sem_permissao' } : Dados.PERFIL);
    if (ctx.acesso === 'nao') return json(res, 403, { erro: 'Você não tem acesso a este app.', codigo: 'sem_acesso', apps: ['agenda'] });

    if (leitura && ctx.acordando) {
      const quantas = Number.parseInt(ctx.acordando, 10) || 2, feitas = acordadas.get(ctx.acordando) || 0;
      if (feitas < quantas) {
        acordadas.set(ctx.acordando, feitas + 1);
        // Como o provedor responde enquanto o serviço acorda: uma página, sem JSON e sem frase do app.
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end('<!doctype html><title>Service Unavailable</title><h1>Service Unavailable</h1>');
      }
    }
    if (leitura && ctx.lento) await dormir(ctx.lento);
    // Devolve true quando já respondeu o erro (json() não devolve nada; sem isto a rota respondia duas vezes).
    const quebrou = (nome) => { if (ctx.falha !== nome) return false; json(res, 500, { erro: 'Não foi possível montar esta parte agora. Tente de novo em instantes.' }); return true; };
    const m = mundo(ctx.cenario);
    m.incompleto = ctx.incompleto;
    m.semMigracao = ctx.falha === 'migracao';
    const periodo = url.searchParams.get('periodo') || 'mes';

    if (leitura && caminho === '/api/hoje') return quebrou('hoje') || json(res, 200, Dados.responderHoje(m, periodo));
    if (leitura && caminho === '/api/jornada') return quebrou('jornada') || json(res, 200, Dados.responderJornada(m, url.searchParams));
    if (leitura && caminho === '/api/pendencias') return quebrou('pendencias') || json(res, 200, Dados.responderPendencias(m, periodo));
    if (leitura && caminho === '/api/conexoes') return quebrou('conexoes') || json(res, 200, Dados.responderConexoes(m));

    const partes = caminho.split('/').filter(Boolean);   // ['api', 'jornada', id, acao?]
    if (partes[1] === 'jornada' && partes.length >= 3) {
      if (req.method === 'POST') {
        if (ctx.falha === 'gravar') return json(res, 500, { erro: 'Não consegui gravar agora. Nada foi mudado; tente de novo.' });
        // O banco de produção ainda não recebeu a migração da rodada 8: motivo e origem respondem assim hoje.
        if (ctx.falha === 'migracao' && partes[3] !== 'valor') return json(res, 503, { erro: 'O banco ainda não recebeu a atualização do IndyCar Tráfego. Avise quem cuida do sistema.', codigo: 'sem_migracao' });
        const corpo = await lerCorpo(req);
        if (corpo === null) return json(res, 400, { erro: 'JSON inválido no corpo da requisição.' });
        const nome = Dados.PERFIL.nome.split(' ')[0];
        const r = partes[2] === 'lote' && partes.length === 3 ? Dados.gravarLote(m, corpo, nome) : Dados.gravar(m, decodeURIComponent(partes[2]), partes[3], corpo, nome);
        return json(res, r.status, r.corpo);
      }
      if (leitura && partes.length === 3) {
        if (quebrou('detalhe')) return undefined;
        const d = Dados.responderDetalhe(m, decodeURIComponent(partes[2]));
        return d ? json(res, 200, d) : json(res, 404, { erro: 'Não encontrei esse contato. Ele pode ter sido juntado a outro.' });
      }
    }
    return apiT3b(req, res, caminho, url, ctx, m, partes, quebrou);
  }

  /* As rotas da segunda parte (frente T3b): Campanhas, coleta, origem, chaves, Gestor, diário, relatórios, devolução. */
  async function apiT3b(req, res, caminho, url, ctx, m, partes, quebrou) {
    const leitura = req.method === 'GET';
    const q = url.searchParams;
    const nome = Dados.PERFIL.nome.split(' ')[0];
    const responder = (r) => (r.csv != null ? csv(res, r) : json(res, r.status, r.corpo));
    const corpo = async () => { const c = await lerCorpo(req); return c === null ? undefined : c; };
    const invalido = () => json(res, 400, { erro: 'JSON inválido no corpo da requisição.' });

    // Campanhas
    if (leitura && caminho === '/api/campanhas') return quebrou('campanhas') || json(res, 200, T3b.responderCampanhas(m, q));
    if (leitura && partes[1] === 'campanhas' && partes.length === 4) {
      if (quebrou('campanha')) return undefined;
      let chave;
      try { chave = decodeURIComponent(partes[3]); } catch { return json(res, 400, { erro: 'Chave da campanha inválida.' }); }
      const d = T3b.responderCampanha(m, partes[2], chave, q);
      return d ? json(res, 200, d) : json(res, 404, { erro: 'Essa campanha não aparece neste período.', codigo: 'sem_campanha' });
    }

    // Conexões, coleta e acessos antigos
    if ((partes[1] === 'coleta' || partes[1] === 'integracoes' || caminho === '/api/config') && quebrou('coleta')) return undefined;
    if (leitura && caminho === '/api/coleta/situacao') return json(res, 200, T3b.responderSituacaoDaColeta(m));
    if (req.method === 'POST' && caminho === '/api/coleta/agora') {
      await corpo();
      const r = T3b.coletarAgora(m, Date.now());
      if (r.status === 429) res.setHeader('Retry-After', String(r.corpo.esperar));
      else await dormir(900);
      return responder(r);
    }
    if (req.method === 'POST' && (caminho === '/api/coleta/testar' || caminho === '/api/integracoes/testar')) {
      const c = await corpo();
      if (c === undefined) return invalido();
      await dormir(500);
      return json(res, 200, T3b.testarConexao(m, c));
    }
    if (leitura && caminho === '/api/integracoes') return json(res, 200, T3b.responderIntegracoes(m));
    if (req.method === 'POST' && caminho === '/api/integracoes') { const c = await corpo(); if (c === undefined) return invalido(); return responder(T3b.salvarIntegracao(m, c)); }
    if (leitura && caminho === '/api/config') return json(res, 200, T3b.lerConfig(m));
    if (req.method === 'POST' && caminho === '/api/config') { const c = await corpo(); if (c === undefined) return invalido(); return responder(T3b.salvarConfig(m, c)); }

    // Origem (API-jornada.md)
    if (partes[1] === 'origem') {
      if (quebrou('origem')) return undefined;
      if (leitura && caminho === '/api/origem/frases') return json(res, 200, T3b.responderFrases(m));
      if (leitura && caminho === '/api/origem/candidatas') return json(res, 200, T3b.responderCandidatas(m));
      if (leitura && caminho === '/api/origem/rastreio') return json(res, 200, T3b.responderRastreio(m));
      if (req.method === 'DELETE' && partes[2] === 'frases' && partes[3]) return responder(T3b.gravarFrase(m, decodeURIComponent(partes[3]), {}, { apagar: true }));
      if (req.method === 'POST') {
        const c = await corpo();
        if (c === undefined) return invalido();
        if (caminho === '/api/origem/frases') return responder(T3b.gravarFrase(m, null, c));
        if (partes[2] === 'frases' && partes[3]) return responder(T3b.gravarFrase(m, decodeURIComponent(partes[3]), c));
        if (caminho === '/api/origem/testar') return responder(T3b.testarMensagem(m, c));
        if (caminho === '/api/origem/reaplicar') { await dormir(600); return responder(T3b.reaplicar(m, c, Date.now())); }
        if (caminho === '/api/origem/link') return responder(T3b.mensagemPronta(m, c));
      }
    }

    // Chaves da IA de fora (API-ia.md)
    if (partes[1] === 'ia' && partes[2] === 'chaves') {
      if (quebrou('chaves')) return undefined;
      if (leitura && partes.length === 3) return json(res, 200, T3b.responderChaves(m));
      if (req.method === 'POST' && partes.length === 3) {
        const c = await corpo();
        if (c === undefined) return invalido();
        res.setHeader('Cache-Control', 'no-store');
        return responder(T3b.criarChave(m, c));
      }
      if (req.method === 'DELETE' && partes.length === 4) return responder(T3b.revogarChave(m, decodeURIComponent(partes[3])));
    }

    // Gestor IA e diário de decisões (API-gestor.md, frente T5b)
    if (partes[1] === 'gestor') {
      if (quebrou('gestor')) return undefined;
      const fala = req.method === 'POST';
      if (fala && ctx.ia === 'desligada') return json(res, 503, { erro: 'O Gestor IA está desligado: falta a chave da IA no servidor. O resto do app segue funcionando.', codigo: 'ia_desligada' });
      if (fala && ctx.ia === 'limite') { res.setHeader('Retry-After', '1800'); return json(res, 429, { erro: 'Você já fez 30 perguntas nesta hora. Tente de novo daqui a meia hora.', codigo: 'limite_hora' }); }
      if (fala && caminho === '/api/gestor/perguntar') return fluxoDoGestor(req, res, m, ctx);
      if (leitura && caminho === '/api/gestor/conversas') return json(res, 200, T3b.responderConversas(m));
      if (leitura && partes[2] === 'conversas' && partes[3]) {
        const c = T3b.responderConversa(m, decodeURIComponent(partes[3]));
        return c ? json(res, 200, c) : json(res, 404, { erro: 'Essa conversa não existe mais.', codigo: 'conversa' });
      }
      if (leitura && caminho === '/api/gestor/plano') return json(res, 200, T3b.responderPlano(m));
      if (fala && caminho === '/api/gestor/plano') { await corpo(); await dormir(1200); return responder(T3b.novoPlano(m, nome)); }
    }
    if (partes[1] === 'acoes-trafego') {
      if (quebrou('acoes')) return undefined;
      if (leitura && partes.length === 2) return responder(T3b.responderAcoes(m, q));
      if (req.method === 'POST' && partes.length === 4) {
        const c = await corpo();
        if (c === undefined) return invalido();
        const id = decodeURIComponent(partes[2]);
        if (partes[3] === 'decidir') return responder(T3b.decidir(m, id, c, nome));
        if (partes[3] === 'feita') return responder(T3b.marcarFeita(m, id, c));
      }
    }

    // Relatórios (API-base.md)
    if (leitura && partes[1] === 'relatorios') {
      if (quebrou('relatorio')) return undefined;
      if (partes[2] === 'texto') return responder(T3b.relatorioTexto(m, q.get('tipo') || 'semanal'));
      if (partes[2] === 'folha') return responder(T3b.relatorioFolha(m, q));
      if (partes[2] === 'apresentacao') return json(res, 200, T3b.relatorioApresentacao(m, q));
    }

    // Devolução das vendas (API-coleta.md)
    if (leitura && caminho === '/api/devolucao/google.csv') return responder(T3b.devolucaoGoogle(m));
    if (leitura && caminho === '/api/devolucao/meta') return json(res, 200, T3b.devolucaoMeta(m));

    return json(res, 404, { erro: 'Rota não encontrada.' });
  }

  function estatico(req, res, caminho) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
    if (caminho === '/vendor/supabase.js') caminho = '/_mock/supabase-falso.js';
    else if (caminho === '/antiga' || caminho.startsWith('/antiga/')) return pagina(res, 200, 'Tela antiga (de mentira)', '<p>No servidor de verdade, aqui abre a tela antiga do Tráfego.</p><p><a href="../">Voltar para a tela nova</a></p>');
    else if (caminho === '/_mock/reiniciar') { mundos.clear(); acordadas.clear(); return json(res, 200, { ok: true }); }
    let rel;
    try { rel = caminho === '/' ? 'index.html' : decodeURIComponent(caminho.slice(1)); } catch { rel = '\0'; }
    const arquivo = path.resolve(TELA, rel);
    const liberado = caminho === '/_mock/supabase-falso.js';
    if (rel.includes('\0') || !arquivo.startsWith(TELA + path.sep) || (!liberado && escondido(path.relative(TELA, arquivo)))) { res.writeHead(404, { 'Content-Type': MIME['.txt'] }); return res.end('Não encontrado'); }
    fs.readFile(arquivo, (erro, corpo) => {
      if (erro) { res.writeHead(404, { 'Content-Type': MIME['.txt'] }); return res.end('Não encontrado'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(arquivo).toLowerCase()] || 'application/octet-stream', 'Content-Length': corpo.length, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : corpo);
    });
    return undefined;
  }

  /* Fora da pasta do app: a Central de mentira (a Casa e os vizinhos), só para os links terem aonde chegar. */
  function central(res, url) {
    const voltar = url.searchParams.get('voltar') || '';
    if (url.pathname === '/') {
      const seguro = /^[/](?![/\\])/.test(voltar) ? voltar : null;
      return pagina(res, 200, 'Central (de mentira)', seguro
        ? '<p>Aqui a pessoa entra com e-mail e senha. Depois de entrar, volta para onde estava.</p><p><a id="voltar" href="' + escapar(seguro) + '">Entrar e voltar</a></p>'
        : '<p><a href="' + escapar(BASE) + '">Abrir o Tráfego</a></p>');
    }
    const vizinho = /^[/](agenda|crm|atendimento|comunicar)[/]/.exec(url.pathname);
    if (vizinho) return pagina(res, 200, vizinho[1][0].toUpperCase() + vizinho[1].slice(1) + ' (de mentira)', '<p>No ar de verdade, aqui abre o outro app.</p>');
    res.writeHead(404, { 'Content-Type': MIME['.txt'] });
    return res.end('Não encontrado');
  }

  return http.createServer(async (req, res) => {
    cabecalhos(res);
    try {
      const url = new URL(req.url, 'http://local');
      let caminho = url.pathname;
      if (BASE !== '/') {
        if (caminho === BASE.slice(0, -1)) { res.writeHead(308, { Location: BASE + url.search, 'Cache-Control': 'no-store' }); return res.end(); }
        if (!caminho.startsWith(BASE)) return central(res, url);
        caminho = '/' + caminho.slice(BASE.length);
      }
      if (caminho.startsWith('/api/')) return await api(req, res, caminho, url);
      return estatico(req, res, caminho);
    } catch (erro) {
      console.error(erro);
      if (!res.headersSent) return json(res, 500, { erro: 'O servidor de mentira tropeçou.' });
      return res.end();
    }
  });
}

/** Sobe o servidor e devolve { servidor, endereco, fechar }. Só aceita as portas 3430 a 3439. */
export function subir({ porta = 3430, base = '/trafego/' } = {}) {
  if (!(porta >= 3430 && porta <= 3439)) throw new Error('Use uma porta de 3430 a 3439 (combinado da rodada).');
  const servidor = criar({ base });
  return new Promise((resolve, reject) => {
    servidor.once('error', reject);
    servidor.listen(porta, '127.0.0.1', () => resolve({
      servidor,
      endereco: 'http://localhost:' + porta + (base === '/' ? '/' : '/' + String(base).replace(/^[/]+|[/]+$/g, '') + '/'),
      fechar: () => new Promise((ok) => { if (servidor.closeAllConnections) servidor.closeAllConnections(); servidor.close(() => ok()); }),
    }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  subir({ porta: Number(process.env.PORTA) || 3430, base: process.env.BASE || '/trafego/' }).then(
    ({ endereco }) => console.log('Tela do Tráfego com servidor de mentira em ' + endereco + '\nCenários: ' + Dados.CENARIOS.map((c) => endereco + '?cenario=' + c).join('\n          ')),
    (erro) => { console.error(erro.code === 'EADDRINUSE' ? 'A porta já está em uso. Tente PORTA=3431.' : erro.message); process.exit(1); });
}
