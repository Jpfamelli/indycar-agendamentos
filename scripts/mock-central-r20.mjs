// Central de MENTIRA da rodada 20 (26/11/2026): CRM + Atendimento + Orçador num app só, sem tocar em nada real.
//
//   node scripts/mock-central-r20.mjs            → http://localhost:3720/crm/?papel=gestor
//   PORT=3720 MOCK_LEADS=90 node scripts/mock-central-r20.mjs
//
// O que é de verdade e o que é de mentira:
//   · /crm/*          proxy para o servidor de mentira do CRM (apps/crm/scripts/mock-server.mjs, MOCK_PREFIXO=/crm)
//   · /atendimento/*  proxy para o servidor de mentira do Atendimento (apps/atendimento/scripts/mock-server.mjs,
//                     PREFIXO=/atendimento/, UNIFICADO=1, SW_REAL=1): dados inventados, nenhum WhatsApp, nenhum banco
//   · /orcador/*      o build de verdade (apps/orcador/); o Supabase dele é respondido pelo roteiro de navegador
//   · /casa/*         os arquivos de verdade da Casa (padrão visual, fontes, logo)
//   · o REDIRECIONAMENTO /atendimento/ → /crm/ é a regra de verdade (lib/crm-atendimento.js, a mesma da central.js)
//   · os CABEÇALHOS de segurança das páginas são os de verdade: a CSP do CRM (apps/crm/lib/seguranca.js), a do
//     Atendimento (apps/atendimento/lib/seguranca.js) e a do Orçador (central.js), calculadas sobre o HTML servido.
//     Assim a moldura (frame-src / frame-ancestors / X-Frame-Options) é provada no navegador, com service worker.
//   · os dois service workers são os de verdade (o mock do CRM tira o registro da página; aqui ele volta).
//
// Papel: o CRM de mentira guarda o papel num cookie (/crm/?papel=gestor); o Atendimento de mentira decide o papel no
// endereço da página. Este proxy repassa o papel do cookie para a página do Atendimento:
//   admin, gestor, atendente → o mesmo · sem_app (só Atendimento) → atendente · so_crm (só CRM) → semapp
// Ganchos de teste: POST /__r20/zap {modo: 'chave'|'celular'|'silencio'|''} liga a faixa "WhatsApp parado".
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { destinoDoAtendimento } from '../lib/crm-atendimento.js';

const require = createRequire(import.meta.url);
const MONO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEG_CRM = require('../apps/crm/lib/seguranca.js');
const SEG_ATD = require('../apps/atendimento/lib/seguranca.js');
export const SUPA_FALSO = 'https://supabase-falso.teste';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
const PAPEL_NO_ATENDIMENTO = { admin: 'admin', gestor: 'gestor', atendente: 'atendente', sem_app: 'atendente', so_crm: 'semapp', agenda: 'agenda', deslogado: 'deslogado' };
/* quem é cada papel no Atendimento de mentira (o token dele é "mock-<id>"; o do CRM de mentira é outro) */
const ID_NO_ATENDIMENTO = { admin: '11111111-1111-4111-8111-111111111111', atendente: '22222222-2222-4222-8222-222222222222', gestor: '33333333-3333-4333-8333-333333333333',
  sem_app: '22222222-2222-4222-8222-222222222222', so_crm: '66666666-6666-4666-8666-666666666666' };
const so = (v) => { let d = String(v ?? '').replace(/D/g, ''); if (d.length === 12 || d.length === 13) d = d.replace(/^55/, ''); return d; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** A CSP do Orçador como a central.js monta (cspDoOrcador), sem carregar a Central inteira. */
function cspDoOrcador() {
  const banco = `${SUPA_FALSO} ${SUPA_FALSO.replace(/^http/, 'ws')}`;
  return ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "font-src 'self'", "img-src 'self' data: blob:",
    `connect-src 'self' ${banco}`, "worker-src 'self'", "manifest-src 'self'", "media-src 'self' blob:",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'"].join('; ');
}

function estatico(res, dir, resto, cab = {}) {
  let rel;
  try { rel = resto === '/' || !resto ? 'index.html' : decodeURIComponent(resto); } catch { res.writeHead(400); return res.end(); }
  const alvo = normalize(join(dir, rel));
  if (!alvo.startsWith(dir + sep) || !existsSync(alvo) || statSync(alvo).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('nao achei'); }
  res.writeHead(200, { 'Content-Type': TIPOS[extname(alvo)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cab });
  return res.end(readFileSync(alvo));
}

/** Pede ao servidor de mentira e devolve { status, headers, corpo } (corpo inteiro, sem compressão).
 *  Resposta que não acaba (o "tempo real" de mentira do CRM, text/event-stream) é repassada ao vivo para `res` e a
 *  promessa devolve null; quando o navegador desiste do pedido, o pedido ao servidor de mentira é desfeito junto. */
function pedir(porta, req, caminho, corpo, res) {
  return new Promise((ok, no) => {
    const headers = { ...req.headers, host: `127.0.0.1:${porta}` };
    delete headers['accept-encoding'];
    const p = http.request({ host: '127.0.0.1', port: porta, path: caminho, method: req.method, headers }, (r) => {
      if (res && String(r.headers['content-type'] || '').includes('text/event-stream')) {
        res.writeHead(r.statusCode, r.headers); r.pipe(res); r.on('error', () => res.destroy());
        /* Com o service worker do CRM ligado, este pedido passa por ele, e o Chrome mantém a ligação aberta mesmo depois
           de a página sair: seis páginas depois, o limite de seis ligações por endereço trava tudo. Só existe aqui (na
           oficina o tempo real é um WebSocket do Supabase, em outro endereço). Por isso a resposta fecha sozinha a cada
           12 s e o EventSource da página liga de novo. */
        const fim = setTimeout(() => { try { res.end(); } catch { /* já fechou */ } p.destroy(); }, 12000);
        res.on('close', () => clearTimeout(fim));
        return ok(null);
      }
      const partes = [];
      r.on('data', (c) => partes.push(c));
      r.on('end', () => ok({ status: r.statusCode, headers: r.headers, corpo: Buffer.concat(partes) }));
    });
    p.on('error', no);
    if (res) res.on('close', () => { if (!res.writableEnded) p.destroy(); });
    if (corpo && corpo.length) p.write(corpo);
    p.end();
  });
}
const lerCorpo = (req) => new Promise((ok) => { const b = []; req.on('data', (c) => b.push(c)); req.on('end', () => ok(Buffer.concat(b))); });

export async function subirCentralR20({ porta = 3720, leads = Number(process.env.MOCK_LEADS) || 90, sw = true, log = false } = {}) {
  const PORTA_CRM = porta + 1, PORTA_ATD = porta + 2;
  const filhos = [];
  const subir = (arquivo, env) => {
    const f = spawn(process.execPath, [join(MONO, arquivo)], { env: { ...process.env, ...env }, stdio: log ? 'inherit' : 'ignore' });
    filhos.push(f);
  };
  subir('apps/crm/scripts/mock-server.mjs', { PORT: String(PORTA_CRM), MOCK_PREFIXO: '/crm', MOCK_LEADS: String(leads) });
  subir('apps/atendimento/scripts/mock-server.mjs', { PORT: String(PORTA_ATD), PREFIXO: '/atendimento/', UNIFICADO: '1', SW_REAL: '1' });
  const estado = { zap: '', pedidos: [], espelhados: [] };

  async function espelharLeads(op, resposta, cookie) {
    if (op.tabela !== 'leads' || !['update', 'insert'].includes(op.acao) || resposta.error) return;
    const linhas = Array.isArray(resposta.data) ? resposta.data : resposta.data ? [resposta.data] : [];
    const cab = { 'Content-Type': 'application/json', Authorization: 'Bearer mock', Cookie: cookie };
    const noCrm = await (await fetch(`http://127.0.0.1:${PORTA_CRM}/crm/api/leads`, { headers: cab })).json();
    for (const l of linhas) {
      const t = so(l.telefone || l.telefone_e164);
      if (!t) continue;
      const campos = { status: l.status, servico: l.servico || undefined, valor_orcado: l.valor_orcado ?? undefined, carro_modelo: l.carro_modelo || undefined, placa: l.placa || undefined };
      const igual = (Array.isArray(noCrm) ? noCrm : []).filter((x) => so(x.telefone) === t && ['novo', 'contato', 'orcamento'].includes(x.status))[0];
      if (op.acao === 'update' && igual) await fetch(`http://127.0.0.1:${PORTA_CRM}/crm/api/leads/${igual.id}`, { method: 'PATCH', headers: cab, body: JSON.stringify(campos) });
      else if (op.acao === 'insert') await fetch(`http://127.0.0.1:${PORTA_CRM}/crm/api/leads`, { method: 'POST', headers: cab, body: JSON.stringify({ nome: l.nome, telefone: t, origem: l.origem || 'whatsapp', ...campos }) });
      estado.espelhados.push({ acao: op.acao, telefone: t, status: l.status, noCartao: igual?.id || null });
    }
  }

  const servidor = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://central.local');
      const caminho = u.pathname;
      if (caminho === '/__r20/zap' && req.method === 'POST') {
        try { estado.zap = String(JSON.parse((await lerCorpo(req)).toString() || '{}').modo || ''); } catch { estado.zap = ''; }
        res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, zap: estado.zap }));
      }
      if (caminho === '/__r20/pedidos') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ redirecionados: estado.pedidos.slice(-200), espelhados: estado.espelhados.slice(-200) })); }
      if (caminho === '/api/central/config') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ supabaseUrl: SUPA_FALSO, supabaseAnonKey: 'anon-falsa', orcadorNaCentral: true })); }
      if (caminho === '/tema-inicial.js') return estatico(res, join(MONO, 'public'), '/tema-inicial.js');   // a Central de verdade serve da pasta da Agenda
      if (caminho.startsWith('/casa/')) return estatico(res, join(MONO, 'casa'), caminho.slice('/casa'.length));
      if (caminho === '/orcador') { res.writeHead(308, { Location: '/orcador/' + u.search }); return res.end(); }
      if (caminho.startsWith('/orcador/')) {
        return estatico(res, join(MONO, 'apps', 'orcador'), caminho.slice('/orcador'.length), { 'Content-Security-Policy': cspDoOrcador(), 'X-Frame-Options': 'SAMEORIGIN',
          'Permissions-Policy': 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)', 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' });
      }
      /* a regra de verdade: a página do Atendimento aberta direto vai para o app unificado */
      const destino = destinoDoAtendimento(caminho, u.search, req.method);
      if (destino) { estado.pedidos.push({ de: caminho + u.search, para: destino }); res.writeHead(302, { Location: destino, 'Cache-Control': 'no-store', 'Content-Length': 0 }); return res.end(); }
      for (const p of ['/crm', '/atendimento']) if (caminho === p) { res.writeHead(308, { Location: p + '/' + u.search }); return res.end(); }

      const corpo = req.method === 'GET' || req.method === 'HEAD' ? null : await lerCorpo(req);
      if (caminho.startsWith('/crm/')) {
        const r = await pedir(PORTA_CRM, req, req.url, corpo, res);
        if (!r) return;
        const h = { ...r.headers };
        delete h['content-length']; delete h['transfer-encoding'];
        let saida = r.corpo;
        const html = String(h['content-type'] || '').includes('text/html') && (caminho === '/crm/' || caminho === '/crm/index.html');
        if (html) {
          let texto = saida.toString('utf8');
          if (sw) texto = texto.replace('if (false) navigator.serviceWorker', "if ('serviceWorker' in navigator) navigator.serviceWorker");
          saida = Buffer.from(texto);
          h['content-security-policy'] = SEG_CRM.cspPagina({ hashes: SEG_CRM.hashesScripts(texto), supabaseUrl: '' });
          h['permissions-policy'] = SEG_CRM.PERMISSOES_PAGINA;
        } else if (caminho.startsWith('/crm/api/')) h['content-security-policy'] = SEG_CRM.CSP_API;
        h['x-frame-options'] = 'DENY'; h['x-content-type-options'] = 'nosniff'; h['cross-origin-opener-policy'] = 'same-origin';
        if (caminho === '/crm/sw.js') h['cache-control'] = 'no-cache';
        res.writeHead(r.status, h); return res.end(saida);
      }
      if (caminho.startsWith('/atendimento/')) {
        let alvo = req.url;
        const pagina = (caminho === '/atendimento/' || caminho === '/atendimento/index.html') && req.method === 'GET';
        if (pagina) {
          /* o papel do cookie do CRM de mentira vale para a página embutida; a faixa de saúde antiga fica quieta
             (saude=ok) e o WhatsApp parado é ligado pelo gancho /__r20/zap */
          const cookie = /(?:^|;\s*)mock_papel=([a-z_]+)/.exec(req.headers.cookie || '')?.[1] || 'admin';
          if (!u.searchParams.get('papel')) u.searchParams.set('papel', PAPEL_NO_ATENDIMENTO[cookie] || 'admin');
          if (estado.zap) u.searchParams.set('zap', estado.zap); else u.searchParams.set('saude', 'ok');
          u.searchParams.set('envio', 'ok');
          alvo = u.pathname + u.search;
        }
        /* na vida real o login é um só (o mesmo token vale nos dois apps); aqui cada servidor de mentira tem o seu:
           pedido da tela do CRM para a API do Atendimento (a faixa do WhatsApp) troca o token pelo do mesmo papel */
        const cookiePapel = /(?:^|;s*)mock_papel=([a-z_]+)/.exec(req.headers.cookie || '')?.[1] || 'admin';
        if (caminho.startsWith('/atendimento/api/') && req.headers.authorization && !/^Bearer mock-/.test(req.headers.authorization)) req.headers.authorization = 'Bearer mock-' + (ID_NO_ATENDIMENTO[cookiePapel] || ID_NO_ATENDIMENTO.admin);
        const r = await pedir(PORTA_ATD, req, alvo, corpo);
        /* UM banco só, como na vida real: o que a conversa grava em "leads" (o cartão que foi para Agendado, ou o
           cartão novo) aparece no funil do CRM de mentira. Sem isto cada servidor de mentira teria o seu funil. */
        if (caminho === '/atendimento/api/_mock' && corpo) { try { await espelharLeads(JSON.parse(corpo.toString() || '{}'), JSON.parse(r.corpo.toString() || '{}'), req.headers.cookie || ''); } catch { /* espelho é só do teste */ } }
        const h = { ...r.headers, ...SEG_ATD.cabecalhosBase({ https: false }) };
        delete h['content-length']; delete h['transfer-encoding'];
        if (pagina && String(h['content-type'] || '').includes('text/html')) {
          h['Content-Security-Policy'] = SEG_ATD.politicaCSP({ supabaseUrl: '', hashes: SEG_ATD.hashesDosScripts(r.corpo.toString('utf8')) });
          h['X-Frame-Options'] = 'SAMEORIGIN';
        }
        res.writeHead(r.status, h); return res.end(r.corpo);
      }
      if (caminho === '/' || caminho === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<!doctype html><meta charset="utf-8"><title>Casa de mentira</title><p>Casa de mentira (rodada 20). <a href="/crm/?papel=gestor">CRM e Atendimento</a></p>');
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('fora da Central de mentira');
    } catch (e) {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('servidor de mentira fora: ' + (e?.message || e));
    }
  });
  await new Promise((ok) => servidor.listen(porta, '127.0.0.1', ok));
  for (const [p, caminho] of [[PORTA_CRM, '/crm/api/ping'], [PORTA_ATD, '/__qa/mock']]) {
    let ok = false;
    for (let i = 0; i < 60 && !ok; i++) { try { ok = (await fetch(`http://127.0.0.1:${p}${caminho}`)).status < 500; } catch { /* subindo */ } if (!ok) await espera(250); }
    if (!ok) throw new Error('o servidor de mentira da porta ' + p + ' não subiu');
  }
  const parar = () => { for (const f of filhos) { try { f.kill(); } catch { /* já foi */ } } try { servidor.close(); } catch { /* idem */ } };
  process.on('exit', parar);
  return { base: `http://localhost:${porta}`, porta, parar, estado };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const c = await subirCentralR20({ porta: Number(process.env.PORT) || 3720, log: !!process.env.MOCK_LOG });
  console.log(`Central de mentira (rodada 20) em ${c.base}/crm/?papel=gestor  ·  papéis: admin, gestor, atendente, sem_app (só Atendimento), so_crm (só CRM)`);
}
