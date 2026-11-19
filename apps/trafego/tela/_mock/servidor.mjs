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
     ?falha=migracao    gravar motivo ou origem responde 503 "o banco ainda não recebeu a atualização" (a produção de hoje)
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
    return { cenario, falha: pega('falha'), lento: Math.min(5000, Number(pega('lento')) || 0), acesso: pega('acesso'), sessao: pega('sessao'), acordando: pega('acordando') };
  }

  async function api(req, res, caminho, url) {
    const ctx = contexto(req, url);
    const leitura = req.method === 'GET';
    if (caminho === '/api/ping') return json(res, 200, { ok: true, mentira: true });
    if (caminho === '/api/config-publica') return json(res, 200, { supabase_url: 'http://localhost', supabase_anon_key: 'chave-publica-de-mentira' });
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
    const quebrou = (nome) => ctx.falha === nome && json(res, 500, { erro: 'Não foi possível montar esta parte agora. Tente de novo em instantes.' });
    const m = mundo(ctx.cenario);
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
        if (ctx.falha === 'migracao' && partes[3] !== 'valor') return json(res, 503, { erro: 'O banco ainda não recebeu a atualização do IndyCar Tráfego. Avise quem cuida do sistema.', codigo: 'falta_migracao' });
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
