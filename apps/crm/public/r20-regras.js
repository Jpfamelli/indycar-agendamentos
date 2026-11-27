/* ============================================================
   IndyCar CRM e Atendimento · r20-regras.js (Rodada 20, 26/11/2026)
   Regras PURAS do app unificado (sem DOM, sem rede). No navegador: window.R20Regras. No Node: require.
   Testado em testes/r20-unificado.test.cjs.
     · modoDaPessoa      o que cada login vê: as telas do CRM, as Conversas, o Orçador
     · lerEntrada        endereço de entrada (/crm/#conversas, /crm/?aba=conversas&atd=…) -> aba e o que abrir nela
     · enderecoDaMoldura endereço do Atendimento embutido (lista inteira ou só a conversa do painel)
     · enderecoDoOrcador só "?…" e "#…" do próprio Orçador entram na moldura
     · cartaoDoTelefone  de qual cartão do funil é a conversa aberta
     · telDoLink         um link "abrir conversa" (/atendimento/?tel=…) vira painel, sem sair da tela
   ============================================================ */
(function (raiz, fabrica) {
  const m = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else raiz.R20Regras = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ABAS_DO_TOPO = ['hoje', 'pipeline', 'conversas', 'clientes', 'orcador'];
  /* nome no endereço (#funil) -> nome da tela */
  const ABA_DO_ENDERECO = { hoje: 'hoje', funil: 'pipeline', conversas: 'conversas', clientes: 'clientes', orcador: 'orcador', painel: 'dashboard', contatos: 'leads' };
  const ENDERECO_DA_ABA = { hoje: 'hoje', pipeline: 'funil', conversas: 'conversas', clientes: 'clientes', orcador: 'orcador' };
  /* telas de Ajustes do Atendimento que um link antigo pode pedir (?aba=integracoes do Comunicar, por exemplo) */
  const AJUSTES_ATD = ['config', 'integracoes', 'ia', 'atalhos', 'etapas', 'equipe', 'auditoria'];
  /* o que o Orçador entende no endereço (o resto fica de fora) */
  const CHAVES_ORCADOR = ['tel', 'nome', 'cliente', 'carro', 'veiculo', 'placa', 'servico', 'conversa', 'lead', 'agendamento', 'os', 'extra', 'orcamento'];
  const ABERTAS = ['novo', 'contato', 'orcamento', 'agendado', 'em_servico'];
  const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const digitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
  /** Telefone como o CRM compara: só DDD + número (10 ou 11 dígitos); '' se não for telefone. */
  function tel(v) {
    let d = digitos(v);
    if (d.length === 12 || d.length === 13) d = d.replace(/^55/, '');
    return d.length === 10 || d.length === 11 ? d : '';
  }

  /**
   * O que este login vê no app unificado. `pode(app)` responde se o perfil usa aquele app (CrmUtils.acessoApp).
   * `naCentral`: as Conversas e o Orçador são molduras de /atendimento/ e /orcador/, que só existem na Central.
   *   crm        Hoje, Funil, Clientes e o menu do CRM
   *   conversas  aba Conversas, "Ver conversa" no funil e a faixa do WhatsApp
   *   orcador    aba Orçador (o próprio Orçador confere a permissão dele)
   *   entra      false = nenhum dos dois apps: fica a tela "sem acesso" de sempre
   */
  function modoDaPessoa(pode, naCentral) {
    const crm = !!pode('crm');
    const conversas = !!naCentral && !!pode('atendimento');
    return { crm, conversas, orcador: !!naCentral && (crm || conversas), entra: crm || conversas, inicio: crm ? 'hoje' : 'conversas' };
  }

  /** Só "?…", "#…" ou vazio: é o que vai depois de /orcador/ na moldura. Qualquer outra coisa vira null. */
  function enderecoDoOrcador(endereco) {
    const s = String(endereco == null ? '' : endereco);
    if (s === '') return '';
    if (s.length > 600 || /[\s<>"'\\]/.test(s)) return null;
    if (s.startsWith('#')) return s;
    if (!s.startsWith('?')) return null;
    const i = s.indexOf('#');
    const busca = i < 0 ? s : s.slice(0, i), frag = i < 0 ? '' : s.slice(i);
    const veio = new URLSearchParams(busca), fica = new URLSearchParams();
    for (const k of CHAVES_ORCADOR) if (veio.get(k)) fica.set(k, veio.get(k));
    return (fica.toString() ? '?' + fica : '') + frag;
  }

  /** Endereço do Atendimento embutido. `extra` é a consulta antiga ("tel=…&x=…"); `painel` = só a conversa (painel do funil). */
  function enderecoDaMoldura(base, extra, { painel = false } = {}) {
    const q = new URLSearchParams(String(extra || ''));
    q.delete('embutido'); q.delete('painel');
    const fim = new URLSearchParams();
    fim.set('embutido', '1');
    if (painel) fim.set('painel', '1');
    for (const [k, v] of q) if (/^[a-z_]{1,24}$/i.test(k) && String(v).length <= 200) fim.set(k, v);
    return String(base || '') + '?' + fim.toString();
  }

  /**
   * Lê o endereço de entrada do app. Devolve { aba, moldura, orcador, limpar }:
   *   aba      tela que abre ('conversas', 'orcador', 'pipeline'…) ou null (segue a última usada)
   *   moldura  consulta para o Atendimento embutido (conversa/telefone/tela de Ajustes), ou null
   *   orcador  "?…#…" para o Orçador, ou null
   *   limpar   true quando o endereço trazia pedido (sai da barra depois de lido: telefone não fica no histórico)
   */
  function lerEntrada(busca, fragmento) {
    const out = { aba: null, moldura: null, orcador: null, limpar: false };
    let q;
    try { q = new URLSearchParams(String(busca || '')); } catch { return out; }
    const frag = String(fragmento || '');
    const pedida = String(q.get('aba') || '').toLowerCase();
    if (pedida === 'conversas' || pedida === 'orcador') {
      out.limpar = true;
      let atd;
      try { atd = new URLSearchParams(String(q.get('atd') || '')); } catch { atd = new URLSearchParams(); }
      const dentro = String(atd.get('aba') || '').toLowerCase();
      if (pedida === 'orcador' || dentro === 'orcador') {
        const src = pedida === 'orcador' && !q.get('atd') ? q : atd;
        out.aba = 'orcador';
        out.orcador = enderecoDoOrcador('?' + src.toString() + (frag.startsWith('#/') ? frag : '')) || '';
        return out;
      }
      out.aba = 'conversas';
      atd.delete('embutido'); atd.delete('painel');
      if (dentro && !AJUSTES_ATD.includes(dentro)) atd.delete('aba');
      const resto = atd.toString();
      out.moldura = resto || null;
      return out;
    }
    const m = /^#([a-z]{3,12})$/.exec(frag);
    if (m && ABA_DO_ENDERECO[m[1]]) out.aba = ABA_DO_ENDERECO[m[1]];
    return out;
  }

  /** O cartão do funil de um telefone: o aberto mais novo; sem aberto, o mais novo de todos; sem nenhum, null. */
  function cartaoDoTelefone(leads, telefone) {
    const t = tel(telefone);
    if (!t) return null;
    const meus = (leads || []).filter((l) => l && tel(l.telefone) === t);
    if (!meus.length) return null;
    const novo = (a, b) => (String(a.created_at || '') < String(b.created_at || '') ? 1 : String(a.created_at || '') > String(b.created_at || '') ? -1 : 0);
    const abertos = meus.filter((l) => ABERTAS.includes(l.status)).sort(novo);
    return abertos[0] || meus.sort(novo)[0];
  }

  /** Um link para a conversa de um telefone no Atendimento (/atendimento/?tel=…) -> o telefone; outro link -> ''. */
  function telDoLink(href, baseAtendimento, origem) {
    if (!href || !baseAtendimento) return '';
    try {
      const u = new URL(String(href), origem || 'http://x.local');
      const b = new URL(String(baseAtendimento), origem || 'http://x.local');
      if (u.origin !== b.origin || u.pathname !== b.pathname) return '';
      if (u.searchParams.get('aba')) return '';
      return tel(u.searchParams.get('tel'));
    } catch { return ''; }
  }

  /** Pedido de "abrir no CRM" vindo da conversa embutida: só o que o CRM sabe abrir. */
  function pedidoDoCrm(endereco, origem) {
    try {
      const u = new URL(String(endereco || ''), origem || 'http://x.local');
      const lead = u.searchParams.get('lead'), cliente = u.searchParams.get('cliente'), t = tel(u.searchParams.get('tel') || u.searchParams.get('t'));
      const p = new URLSearchParams();
      if (lead && /^[0-9a-fA-F-]{1,36}$/.test(lead)) p.set('lead', lead);
      if (cliente && RE_UUID.test(cliente)) p.set('cliente', cliente);
      if (t) p.set('tel', t);
      return p.toString() ? p : null;
    } catch { return null; }
  }

  /** Texto da faixa "WhatsApp parado" (a resposta de /atendimento/api/r18/zap). null = sem faixa. */
  function textoZap(zap) {
    if (!zap || !zap.parado) return null;
    const s = String(zap.situacao || '');
    return { titulo: String(zap.titulo || 'WhatsApp parado'), situacao: s.charAt(0).toUpperCase() + s.slice(1), acao: String(zap.acao || '') };
  }

  return { ABAS_DO_TOPO, ABA_DO_ENDERECO, ENDERECO_DA_ABA, AJUSTES_ATD, ABERTAS, tel, modoDaPessoa, enderecoDoOrcador, enderecoDaMoldura, lerEntrada, cartaoDoTelefone, telDoLink, pedidoDoCrm, textoZap };
});
