/* ============================================================================
   Endereços do ecossistema IndyCar vistos de dentro do Tráfego (lógica pura,
   testada em tela/_testes/navegacao.test.mjs). A mesma ideia de apps/crm/public/apps.js:
   nada na tela começa com "/" na raiz do domínio. Dentro da Central o app mora em
   /trafego/ e os vizinhos em /agenda/, /crm/…; solto (node server.js), os
   vizinhos ficam no endereço público da Central.
   ============================================================================ */

export const CENTRAL_PUBLICA = 'https://indycar-agendamentos.onrender.com/';

const APPS = [
  { id: 'casa', nome: 'Central', caminho: '', descricao: 'início' },
  { id: 'agenda', nome: 'Agenda', caminho: 'agenda/', descricao: 'horários e presença' },
  { id: 'atendimento', nome: 'Atendimento', caminho: 'atendimento/', descricao: 'conversas do WhatsApp' },
  { id: 'crm', nome: 'CRM', caminho: 'crm/', descricao: 'contatos e funil' },
  { id: 'comunicar', nome: 'Comunicar', caminho: 'comunicar/', descricao: 'lembretes e réguas' },
  { id: 'trafego', nome: 'Tráfego', caminho: 'trafego/', descricao: 'do anúncio ao carro entregue' },
  { id: 'patio', nome: 'Pátio', url: 'https://indycar-patio.netlify.app/', descricao: 'carro dentro da oficina' },
  { id: 'orcador', nome: 'Orçador', caminho: 'orcador/', descricao: 'orçamentos' },   // rodada 13C: mora na Central (/orcador/)
  { id: 'site', nome: 'Site', url: 'https://indycar-taubate.netlify.app/', descricao: 'página da oficina' },
];
const ORIGENS_DE_FORA = APPS.filter((a) => a.url).map((a) => new URL(a.url).origin).concat(new URL(CENTRAL_PUBLICA).origin);
/* rodada 13C: endereço antigo do Orçador (links já gravados): vira o mesmo orçamento em /orcador/ da Central */
const ORCADOR_ANTIGO = 'https://indycar-orcador.netlify.app';

/** Pasta da página: "/trafego/" na Central, "/" solto. Sempre termina com "/". */
export function baseDaPagina(pathname) {
  const p = String(pathname || '/');
  if (p.endsWith('/')) return p;
  return p.slice(0, p.lastIndexOf('/') + 1) || '/';
}

/** Raiz da Central vista daqui ("/" quando o app mora em "/trafego/"), ou null quando roda solto. */
export function raizDaCentral(base) {
  if (!base || base === '/') return null;
  return base.slice(0, base.slice(0, -1).lastIndexOf('/') + 1) || '/';
}

/** Lista para o seletor de apps: { id, nome, descricao, url, aqui, fora }. */
export function listaDeApps({ base = '/' } = {}) {
  const raiz = raizDaCentral(base);
  return APPS.map((a) => ({
    id: a.id,
    nome: a.nome,
    descricao: a.descricao,
    url: a.url || (raiz || CENTRAL_PUBLICA) + a.caminho,
    aqui: a.id === 'trafego',
    fora: Boolean(a.url),
  }));
}

/** Um caminho relativo à Central ("/crm/?lead=1" ou "crm/?lead=1") → endereço que funciona daqui. */
export function enderecoNaCentral(caminho, { base = '/' } = {}) {
  const rel = String(caminho == null ? '' : caminho).replace(/^[/]+/, '');
  return (raizDaCentral(base) || CENTRAL_PUBLICA) + rel;
}

/**
 * Só deixa sair link para dentro do ecossistema. Aceita caminho relativo à Central
 * e endereço https de um app conhecido. Qualquer outra coisa (outro site, "javascript:",
 * "//host") devolve null e a tela simplesmente não mostra o link.
 */
export function linkSeguro(href, { base = '/' } = {}) {
  const texto = String(href == null ? '' : href).trim();
  if (!texto || texto.length > 500) return null;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (c < 33 || c === 92 || c === 127) return null;   // espaço, controle e barra invertida não entram em link
  }
  if (/^https:[/][/]/i.test(texto)) {
    try {
      const u = new URL(texto);
      if (u.origin === ORCADOR_ANTIGO) return enderecoNaCentral('orcador/' + u.search + u.hash, { base });
      /* rodada 13C: endereço de produção da Central visto de dentro da Central: fica neste endereço (mesmo login) */
      if (u.origin === new URL(CENTRAL_PUBLICA).origin && raizDaCentral(base)) return enderecoNaCentral(u.pathname + u.search + u.hash, { base });
      return ORIGENS_DE_FORA.includes(u.origin) ? u.href : null;
    } catch {
      return null;
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(texto) || texto.startsWith('//')) return null;
  const limpo = texto.replace(/^([.][.]?[/])+/, '');
  return enderecoNaCentral(limpo, { base });
}

/** Nome da aba de cada app (window.open(url, nome)): clicar de novo volta para a mesma aba. */
export const nomeDaAba = (id) => 'indycar-' + id;

/**
 * Rodada 13C (regra única da Central): o "target" de um link para outro app: a aba nomeada dele ("indycar-crm"…).
 * Link do próprio Tráfego (ou que não é de app conhecido) fica nesta janela: null.
 */
export function abaDoLink(href, { base = '/' } = {}) {
  const app = appDoEndereco(href, { base });
  return app && app !== 'trafego' ? nomeDaAba(app) : null;
}

/** De qual app é este endereço (para escolher a aba). null = não sei. */
export function appDoEndereco(url, { base = '/' } = {}) {
  const texto = String(url || '');
  for (const a of listaDeApps({ base })) {
    if (a.id === 'casa') continue;
    if (texto.startsWith(a.url)) return a.id;
  }
  return null;
}

/**
 * Para onde mandar quem chegou sem sessão: a Casa, com o caminho de volta.
 * A Casa só deve aceitar `voltar` que comece com uma única "/" (mesmo domínio).
 */
export function enderecoDeEntrada({ base = '/', hash = '' } = {}) {
  const raiz = raizDaCentral(base);
  const sufixo = hash && hash !== '#/hoje' ? hash : '';
  const voltar = (raiz ? base : '/trafego/') + sufixo;
  return (raiz || CENTRAL_PUBLICA) + '?voltar=' + encodeURIComponent(voltar);
}
