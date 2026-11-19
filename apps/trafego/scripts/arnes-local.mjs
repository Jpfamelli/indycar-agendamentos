#!/usr/bin/env node
/* ============================================================================================
   Arnês local de LEITURA do Tráfego (rodada 8, frente T7b, integração). Uso só nesta máquina.

   NÃO é carregado pelo servidor, pela Central nem em produção (scripts/ não é servido nem importado).
   Sobe a Central inteira NESTE processo, contra o banco do .env da raiz, com tudo que roda sozinho
   desligado, e troca SÓ AQUI a conferência do login do Tráfego por uma pessoa de teste administradora:
     - só para GET, só vindo de 127.0.0.1/::1 e só com o cabeçalho X-Arnes-Local igual a um valor
       sorteado nesta execução (nunca impresso); qualquer outro pedido segue a conferência de verdade;
     - qualquer escrita do Tráfego no banco (insert, update, upsert, delete, função fora da lista de
       leitura) é BARRADA antes de sair e anotada; auditoria e "último acesso" viram nada.
   Nenhuma senha é digitada e nenhum desvio de login existe no código do servidor.

   Uso:
     node apps/trafego/scripts/arnes-local.mjs --conferir [--porta 3482]   lê as rotas GET, imprime o resumo e fecha
     node apps/trafego/scripts/arnes-local.mjs --ficar [--porta 3482] [--minutos 15]
                                                       deixa a Central no ar (para o conferir-tudo) e fecha sozinha
   O resumo não tem nome, telefone nem texto de cliente: só situação, tempo, tamanho e contagens.
   ============================================================================================ */
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..', '..');
const argv = process.argv.slice(2);
const opcao = (nome, padrao) => { const i = argv.indexOf(nome); return i >= 0 && argv[i + 1] ? argv[i + 1] : padrao; };
const MODO = argv.includes('--ficar') ? 'ficar' : 'conferir';
const PORTA = Number(opcao('--porta', '3482'));
if (!(PORTA >= 3480 && PORTA <= 3489)) { console.error('Porta fora da faixa 3480 a 3489.'); process.exit(2); }

/* 1. Ambiente: o .env da raiz (banco) e tudo que roda sozinho DESLIGADO. Sem chave da IA e sem chave de rotina. */
try { process.loadEnvFile(join(RAIZ, '.env')); } catch { /* sem .env: a Central sobe sem banco */ }
Object.assign(process.env, {
  PORT: String(PORTA), CRM_AUTOMACOES: '0', CARTEIRO_DESLIGADO: '1', SINCRONIA: '0', AUTOMACOES: '0', IA_FUNIL: '0',
  IMPORT_DISABLED: '1', MIRROR_DISABLED: '1', ADS_AUTOMATICO: '0', TRAFEGO_AUTOMATICO: '0', ADS_DEMO: '0', ADS_DEMO_ENVIA: '0',
});
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ADS_CRON_TOKEN;
delete process.env.RENDER;

const require = createRequire(join(RAIZ, 'apps', 'trafego', 'server.js'));

/* 2. Guarda de escrita no cliente do banco do Tráfego (o mesmo objeto que todo módulo do app usa). */
const BARRADAS = [];
const RPC_DE_LEITURA = new Set(['trafego_primeiras_mensagens', 'trafego_conversas_novas', 'trafego_frases_candidatas',
  'trafego_janelas', 'trafego_origem_da_mensagem', 'trafego_rastreio_evidencia', 'usuario_pode']);
const db = require('./db');
const fromOriginal = db.sb.from.bind(db.sb), rpcOriginal = db.sb.rpc.bind(db.sb);
db.sb.from = (tabela) => {
  const b = fromOriginal(tabela);
  return new Proxy(b, {
    get(alvo, prop, rec) {
      if (prop === 'insert' || prop === 'update' || prop === 'upsert' || prop === 'delete') {
        return () => { BARRADAS.push(`${prop} ${tabela}`); throw new Error(`arnês: escrita barrada (${prop} em ${tabela})`); };
      }
      const v = Reflect.get(alvo, prop, rec);
      return typeof v === 'function' ? v.bind(alvo) : v;
    },
  });
};
db.sb.rpc = (nome, args, op) => {
  if (!RPC_DE_LEITURA.has(nome)) {
    BARRADAS.push(`rpc ${nome}`);
    return Promise.resolve({ data: null, error: { code: 'ARNES', message: `arnês: função ${nome} barrada (pode gravar)` } });
  }
  return rpcOriginal(nome, args, op);
};

/* 3. Equipe: último acesso, auditoria e avisos viram nada (são escritas). */
const equipe = require('./equipe');
const daEquipe = equipe.banco();
daEquipe.tocarAcesso = async () => false;
for (const k of ['auditar', 'salvarPerfil', 'senhaTrocada', 'notificarGestores', 'notificarUm', 'salvarMetaLoja']) {
  if (typeof daEquipe[k] === 'function') daEquipe[k] = async () => { BARRADAS.push(`equipe.${k}`); return null; };
}

/* 4. Login: pessoa de teste administradora, só para GET local com o cabeçalho sorteado. */
const SESSAO = randomBytes(24).toString('base64url');
const PESSOA = Object.freeze({ id: '00000000-0000-4000-8000-0000000a7b70', nome: 'Arnês local (teste)', email: null, papel: 'admin',
  ativo: true, apps: ['ads'], pode_ads: true, aal: 'aal1', mfa: false, precisa_trocar_senha: false });
const auth = require('./auth');
const identificarDeVerdade = auth.identificar;
const LOCAIS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
auth.identificar = async (req) => {
  if (req.method === 'GET' && LOCAIS.has(req.socket && req.socket.remoteAddress) && req.headers['x-arnes-local'] === SESSAO) {
    return { usuario: { ...PESSOA, apps: [...PESSOA.apps] } };
  }
  return identificarDeVerdade(req);
};

/* 5. A Central no mesmo processo. */
const central = await import(pathToFileURL(join(RAIZ, 'central.js')).href);
const { server } = await central.iniciarCentral({ porta: PORTA });
const BASE = `http://127.0.0.1:${PORTA}`;

function fechar(codigo = 0) {
  server.closeAllConnections?.();
  server.close(() => process.exit(codigo));
  setTimeout(() => process.exit(codigo), 3000).unref();
}

if (MODO === 'ficar') {
  const minutos = Math.min(60, Math.max(1, Number(opcao('--minutos', '15')) || 15));
  console.log(`  arnês: Central de leitura no ar em ${BASE} por até ${minutos} min (Ctrl+C fecha).`);
  setTimeout(() => { console.log('  arnês: tempo esgotado, fechando.'); fechar(0); }, minutos * 60_000).unref();
  process.on('SIGINT', () => fechar(0));
  process.on('SIGTERM', () => fechar(0));
} else {
  const T = require('./motor/texto');
  const resultado = { rotas: [], numeros: {}, coerencia: [], barradas: null };
  async function ler(caminho, { logado = true } = {}) {
    const t0 = performance.now();
    const r = await fetch(BASE + caminho, { headers: logado ? { 'X-Arnes-Local': SESSAO } : {} });
    const corpo = await r.text();
    const ms = Math.round(performance.now() - t0);
    let json = null;
    try { json = JSON.parse(corpo); } catch { /* não é JSON */ }
    const linha = { rota: caminho.replace(/\/[0-9a-f-]{36}$/i, '/<id>').replace(/(campanhas\/[a-z]+\/)[^?]+/, '$1<chave>'),
      status: r.status, ms, kb: Math.round(corpo.length / 102.4) / 10, tipo: (r.headers.get('content-type') || '').split(';')[0] };
    if (json && typeof json === 'object') {
      const nf = T.naoFinitos(json);
      linha.nao_finitos = nf.length;
      if (json.estado && Array.isArray(json.estado.incompleto)) linha.incompleto = json.estado.incompleto;
      if (r.status >= 400) linha.erro = String(json.erro || '').slice(0, 160);
    }
    resultado.rotas.push(linha);
    return { status: r.status, json, corpo };
  }

  const h = await ler('/trafego/api/hoje');
  const h2 = await ler('/trafego/api/hoje');                       // segunda: da memória de 30 s
  await ler('/trafego/api/hoje?periodo=30d');
  const j = await ler('/trafego/api/jornada?tamanho=50');
  await ler('/trafego/api/jornada?periodo=30d&tamanho=50');
  const p = await ler('/trafego/api/pendencias');
  const primeiro = j.json && Array.isArray(j.json.itens) && j.json.itens[0] ? j.json.itens[0].lead_id : null;
  if (primeiro) await ler(`/trafego/api/jornada/${primeiro}`);
  const c = await ler('/trafego/api/campanhas');
  await ler('/trafego/api/campanhas?periodo=30d');
  const umaCampanha = c.json && Array.isArray(c.json.campanhas) && c.json.campanhas[0];
  if (umaCampanha) await ler(`/trafego/api/campanhas/${umaCampanha.plataforma}/${encodeURIComponent(umaCampanha.chave)}`);
  await ler('/trafego/api/conexoes');
  await ler('/trafego/api/relatorios/texto');
  await ler('/trafego/api/relatorios/folha');
  await ler('/trafego/api/relatorios/apresentacao');
  await ler('/trafego/api/origem/frases');
  await ler('/trafego/api/origem/candidatas');
  await ler('/trafego/api/origem/rastreio');
  await ler('/trafego/api/coleta/situacao');
  await ler('/trafego/api/acoes-trafego');
  await ler('/trafego/api/gestor/conversas');
  await ler('/trafego/api/gestor/plano');
  await ler('/trafego/api/ia/chaves');
  await ler('/trafego/api/eu');
  await ler('/trafego/api/ping', { logado: false });
  await ler('/trafego/api/hoje', { logado: false });                 // sem o cabeçalho: tem de dar 401
  const tela = await ler('/trafego/', { logado: false });
  resultado.tela_titulo = (/<title>([^<]*)<\/title>/i.exec(tela.corpo) || [])[1] || null;
  await ler('/trafego/rastreio.js', { logado: false });

  /* números para comparar com o banco (só contagens) */
  const tj = (j.json && j.json.totais) || {};
  resultado.numeros.jornada_mes = { periodo: j.json && j.json.periodo, contatos: tj.contatos, de_anuncio: tj.de_anuncio, fecharam: tj.fecharam,
    sem_valor: tj.sem_valor, sem_origem: tj.sem_origem, nao_fecharam: tj.nao_fecharam, sem_motivo: tj.sem_motivo, faturado: tj.faturado,
    conversas_novas: tj.conversas_novas, conversas_novas_anuncio: tj.conversas_novas_anuncio, conversas_novas_viraram_contato: tj.conversas_novas_viraram_contato,
    estado: j.json && j.json.estado ? { gasto: j.json.estado.gasto, valores: j.json.estado.valores, origem: j.json.estado.origem, respostas: j.json.estado.respostas, ciclo: j.json.estado.ciclo } : null };
  const nh = h.json && Array.isArray(h.json.numeros) ? Object.fromEntries(h.json.numeros.map(n => [n.id, n.valor])) : {};
  resultado.numeros.hoje_mes = { ...nh, frase: h.json && h.json.frase ? h.json.frase.tipo : null, fazer: h.json && h.json.fazer ? h.json.fazer.map(f => f.id) : null,
    hoje_lista: h.json && h.json.hoje ? h.json.hoje.length : null, hoje_com_etapas: h.json && h.json.hoje ? h.json.hoje.filter(x => Array.isArray(x.etapas) && x.etapas.length).length : null,
    estado_gasto: h.json && h.json.estado ? h.json.estado.gasto : null };
  resultado.numeros.pendencias = p.json && p.json.sem_valor ? { sem_valor: p.json.sem_valor && p.json.sem_valor.n, sem_motivo: p.json.sem_motivo && p.json.sem_motivo.n,
    sem_origem: p.json.sem_origem && p.json.sem_origem.n, sem_resposta: p.json.sem_resposta && p.json.sem_resposta.n } : null;
  resultado.numeros.campanhas_mes = c.json && c.json.totais ? { campanhas: c.json.campanhas.length, contatos_de_anuncio: c.json.totais.contatos, gasto: c.json.totais.gasto,
    sem_campanha: c.json.sem_campanha && c.json.sem_campanha.contatos, regua: c.json.regua_retorno } : null;

  /* coerência entre as rotas (a mesma janela tem de dar os mesmos números) */
  const igual = (nome, a, b) => resultado.coerencia.push({ nome, a, b, ok: a === b });
  igual('hoje.contatos = jornada.contatos', nh.contatos, tj.contatos);
  igual('hoje.fechados = jornada.fecharam', nh.fechados, tj.fecharam);
  igual('campanhas.contatos = jornada.de_anuncio', c.json?.totais?.contatos, tj.de_anuncio);
  igual('pendencias.sem_valor = jornada.sem_valor', p.json?.sem_valor?.n, tj.sem_valor);
  igual('pendencias.sem_origem = jornada.sem_origem', p.json?.sem_origem?.n, tj.sem_origem);
  igual('segunda leitura de /api/hoje igual à primeira', JSON.stringify(h2.json && h2.json.numeros), JSON.stringify(h.json && h.json.numeros));

  resultado.barradas = [...new Set(BARRADAS)];
  console.log('\n===ARNES_RESULTADO===\n' + JSON.stringify(resultado, null, 1) + '\n===FIM===');
  fechar(0);
}
