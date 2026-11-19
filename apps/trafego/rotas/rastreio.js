/* ============================================================
   Rotas públicas do rastreio para sites de fora (rodada 8, frente T2b) — contrato de rastreio §6.

     GET  /rastreio.js     o script portátil (rastreio/rastreio.js sem o cabeçalho), menor que 4 KB, cache de 1 hora
     POST /api/rastreio    registro de visita ou clique; repassa ao banco (trafego_rastreio_registrar) com o IP de quem chamou

   As duas são públicas e com CORS livre (qualquer site chama). O registro:
   - aceita corpo de até 4 KB (lido aqui mesmo, sem passar disso) e só os campos do contrato, cortados;
   - tem limite por IP no servidor, além do limite do banco;
   - responde SEMPRE 200 { ok: true, codigo } ou { ok: true } (sem código quando recusou), sem dizer o motivo;
   - nunca devolve dado de outro visitante e nunca escreve o corpo em log (o identificador de clique é dado pessoal).
   O IP é o que o servidor vê (seg.ipDe); o banco guarda só um resumo embaralhado dele.
   ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ARQUIVO = path.join(__dirname, '..', 'rastreio', 'rastreio.js');
const LIMITE_CORPO = 4096;
const POR_IP = 60;                       // registros por IP a cada 10 minutos (o banco ainda limita 20 por hora)
const JANELA = 10 * 60_000;
const COD = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;
const TIPOS = new Set(['anuncio', 'busca', 'instagram', 'facebook', 'whatsapp', 'outro_site', 'direto']);
const CAMPOS = { utm_source: 80, utm_medium: 80, utm_campaign: 150, utm_content: 150, utm_term: 150,
  gclid: 500, gbraid: 500, wbraid: 500, fbclid: 500, ttclid: 500, msclkid: 500 };

/**
 * O script como sai: sem comentários (bloco e linha inteira), sem recuo, sem linha vazia e sem espaço encostado em
 * pontuação (fora de texto e de expressão regular). As quebras de linha ficam, então o sentido do código não muda.
 * Vale para a fonte de rastreio/rastreio.js, que não tem divisão (toda "/" fora de comentário abre expressão
 * regular) nem "/*" dentro de texto. Os testes rodam ESTA saída, não a fonte.
 */
function scriptServido(fonte = fs.readFileSync(ARQUIVO, 'utf8')) {
  const t = fonte.replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/).map(l => l.trim())
    .filter(l => l && !l.startsWith('//')).join('\n');
  const PONTUACAO = /[=,;{}()[\]<>+\-?:|&!]/;
  let s = '', i = 0;
  while (i < t.length) {
    const c = t[i];
    let j = i + 1;
    if (c === "'" || c === '"') {                                  // texto: copia até a aspa que fecha
      while (j < t.length && t[j] !== c) j += t[j] === '\\' ? 2 : 1;
      j++;
    } else if (c === '/') {                                        // expressão regular: até a "/" que fecha, e as letras depois
      let classe = false;
      while (j < t.length && (classe || t[j] !== '/')) {
        if (t[j] === '\\') j++;
        else if (t[j] === '[') classe = true;
        else if (t[j] === ']') classe = false;
        j++;
      }
      j++;
      while (j < t.length && /[a-z]/i.test(t[j])) j++;
    } else if (c === ' ') {                                        // espaço: só fica entre duas palavras
      while (t[j] === ' ') j++;
      const antes = s[s.length - 1] || '\n', depois = t[j] || '\n';
      if (!PONTUACAO.test(antes) && !PONTUACAO.test(depois) && antes !== '\n' && depois !== '\n') s += ' ';
      i = j;
      continue;
    }
    s += t.slice(i, j);
    i = j;
  }
  return s + '\n';
}

/** Texto curto de uma linha, sem caractere de controle; '' quando não é texto. */
function limpo(v, max) {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v).replace(/\p{Cc}+/gu, ' ').trim().slice(0, max);
}

/**
 * Só os campos do contrato (§6.1 a §6.3), validados e cortados. Identificador de clique fica como chegou
 * (maiúscula e minúscula importam), sem espaço. Nada de nome, telefone ou e-mail passa.
 */
function dadosDoRegistro(c) {
  const o = c && typeof c === 'object' && !Array.isArray(c) ? c : {};
  const d = {};
  const evento = limpo(o.evento, 20).toLowerCase();
  d.evento = evento === 'clique' ? 'clique' : 'visita';
  const codigo = limpo(o.codigo, 5).toUpperCase();
  if (COD.test(codigo)) d.codigo = codigo;
  const servico = limpo(o.servico, 60).toLowerCase().replace(/[^a-z0-9_-]+/g, '').slice(0, 40);
  if (servico) d.servico = servico;
  const pagina = limpo(o.pagina, 400).split(/[?#]/)[0].slice(0, 120);
  if (pagina) d.pagina = pagina;
  const referencia = limpo(o.referencia, 120).toLowerCase();
  if (/^[a-z0-9.-]{1,80}$/.test(referencia)) d.referencia = referencia;
  const tipo = limpo(o.referencia_tipo, 20).toLowerCase();
  if (TIPOS.has(tipo)) d.referencia_tipo = tipo;
  for (const [k, max] of Object.entries(CAMPOS)) {
    const v = limpo(o[k], max);
    if (!v) continue;
    if (max === 500) { if (/^[\x21-\x7e]+$/.test(v)) d[k] = v; }   // identificador: só caracteres visíveis, sem espaço
    else d[k] = v;
  }
  return d;
}

/** Lê o corpo até 4 KB. Passou disso ou falhou: null (e para de ler). */
function lerCorpoPequeno(req) {
  return new Promise(resolve => {
    let bruto = '', pronto = false;
    const fim = v => { if (!pronto) { pronto = true; resolve(v); } };
    req.setEncoding('utf8');
    req.on('data', parte => {
      if (pronto) return;
      bruto += parte;
      if (Buffer.byteLength(bruto) > LIMITE_CORPO) { fim(null); req.resume(); }
    });
    req.on('end', () => fim(bruto));
    req.on('error', () => fim(null));
    req.on('aborted', () => fim(null));
  });
}

module.exports = (ctx) => {
  const { rotaPublica, limitador, db } = ctx;
  let script = null;

  rotaPublica('GET', '/rastreio.js', ({ res }) => {
    if (script == null) script = scriptServido();
    res.writeHead(200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': Buffer.byteLength(script),
    });
    res.end(script);
  }, { corsLivre: true });

  rotaPublica('POST', '/api/rastreio', async ({ req, res, ip }) => {
    res.setHeader('Cache-Control', 'no-store');
    const recusado = { ok: true };
    const anunciado = parseInt(req.headers['content-length'] || '0', 10);
    if (anunciado > LIMITE_CORPO) { req.resume(); return recusado; }
    if (!limitador.permitir(`rastreio|${ip}`, POR_IP, JANELA).ok) { req.resume(); return recusado; }
    const bruto = await lerCorpoPequeno(req);
    if (!bruto) return recusado;
    let corpo;
    try { corpo = JSON.parse(bruto); } catch { return recusado; }
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return recusado;
    const p_dados = { ...dadosDoRegistro(corpo), ip: limpo(ip, 64), user_agent: limpo(req.headers['user-agent'], 200) || undefined };
    try {
      const { data, error } = await db.sb.rpc('trafego_rastreio_registrar', { p_dados });
      if (error || !data || !COD.test(String(data.codigo || ''))) return recusado;
      return { ok: true, codigo: data.codigo };
    } catch { return recusado; }
  }, { corsLivre: true });
};

module.exports.scriptServido = scriptServido;
module.exports.dadosDoRegistro = dadosDoRegistro;
module.exports.LIMITE_CORPO = LIMITE_CORPO;
module.exports.POR_IP = POR_IP;
