/* ============================================================
   IndyCar · Central de Tráfego Pago — front (JS puro).
   Nenhuma conta acontece aqui: o servidor manda os números já
   derivados, para o painel e o radar nunca discordarem.
   ============================================================ */
'use strict';

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let sb = null;            // cliente Supabase (só para o login)
let token = null;
let estado = { periodo: 7, plataforma: '', aba: 'painel', dados: null, cfg: null };

/* ---------------- utilidades ---------------- */

const brl = v => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const int = v => (v == null ? '—' : Math.round(Number(v)).toLocaleString('pt-BR'));
const dec = (v, c = 2) => (v == null ? '—' : Number(v).toFixed(c).replace('.', ','));
const pct = v => (v == null ? '—' : `${dec(v)}%`);
const vezes = v => (v == null ? '—' : `${dec(v)}x`);
const dataBR = s => (s ? s.split('-').reverse().join('/') : '—');
const curto = s => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '');
const dataHora = t => (t ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca');

/* +55 12 97403-2299 — só para mostrar; o servidor guarda só dígitos. */
function fmtTel(t) {
  const n = String(t || '').replace(/[^0-9]/g, '');
  if (n.length < 12) return n || '—';
  const pais = n.slice(0, 2), ddd = n.slice(2, 4), resto = n.slice(4);
  return `+${pais} ${ddd} ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
}

/* Texto vindo do banco (nome de campanha, mensagem de alerta) nunca entra
   por innerHTML sem passar por aqui. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Estado vazio com a explicação do modo demonstração em uma frase. */
const DEMO_DICA = 'Sem as chaves da Meta e do Google o app roda em modo demonstração: dá para criar 45 dias de números fabricados (marcados como demo) e ver tudo funcionando.';
/* Rodada 5: no modo sem chaves, o estado vazio traz o botão de criar a demonstração ali mesmo. */
const vazio = (msg, dica = true) => `<p class="vazio">${esc(msg)}${dica ? `<span class="mini">${DEMO_DICA}</span>${estado.semChaves ? '<button type="button" class="btn btn-fantasma btn-mini" data-demo-criar>Criar dados de demonstração</button>' : ''}` : ''}</p>`;

function aviso(msg, erro = false) {
  const el = $('#aviso');
  el.textContent = msg;
  el.classList.toggle('erro', erro);
  el.hidden = false;
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => { el.hidden = true; }, erro ? 8000 : 3500);
}

/* ---------------- servidor acordando (rodada 4) ----------------
   O Render gratuito dorme. Leitura (GET) que pega 502/503/504 ou falha de rede tenta de novo
   sozinha com espera crescente (até ~3 min) e mostra a faixa "O sistema está acordando";
   gravação (POST) nunca repete sozinha: avisa e deixa o que foi digitado na tela. */
const acordando = { ativo: false, desde: 0, proxima: 0, tentativa: 0, relogio: null };

function desenharAcordando() {
  const faixa = $('#faixa-acordando');
  if (!faixa) return;
  if (!acordando.ativo) { faixa.hidden = true; return; }
  const falta = Math.max(0, acordando.proxima - Date.now());
  const minutos = Math.floor((Date.now() - acordando.desde) / 60000);
  const online = navigator.onLine !== false;
  faixa.hidden = false;
  faixa.innerHTML = `<span class="faixa-icone" aria-hidden="true">⏳</span>
    <div><strong>${online ? 'O sistema está acordando' : 'Sem internet'}${minutos >= 1 ? ` · há ${minutos} min` : ''}</strong>
    <p class="mini">${online
      ? `O servidor gratuito dorme quando ninguém usa. Tento de novo sozinho ${falta > 900 ? Rede.textoEspera(falta) : 'agora'} (tentativa ${acordando.tentativa + 1}). Não precisa recarregar: o que está na tela continua aqui.`
      : 'Assim que a conexão voltar eu tento de novo. O que está na tela continua aqui.'}</p>
    <button class="btn btn-fantasma btn-mini" type="button" id="btn-tentar-agora">Tentar agora</button></div>`;
}

function mostrarAcordando(ms, tentativa) {
  if (!acordando.ativo) { acordando.ativo = true; acordando.desde = Date.now(); }
  acordando.proxima = Date.now() + ms;
  acordando.tentativa = tentativa;
  desenharAcordando();
  if (!acordando.relogio) acordando.relogio = setInterval(desenharAcordando, 1000);
}

function esconderAcordando() {
  if (!acordando.ativo) return;
  acordando.ativo = false;
  clearInterval(acordando.relogio);
  acordando.relogio = null;
  desenharAcordando();
  aviso('O sistema acordou. Pode continuar de onde parou.');
}

/* Espera que o "Tentar agora" (ou a internet voltando) corta na hora. */
function dormirAcordando(ms) {
  return new Promise(resolve => {
    const fim = () => { clearTimeout(t); window.removeEventListener('ads:tentar-agora', fim); window.removeEventListener('online', fim); resolve(); };
    const t = setTimeout(fim, ms);
    window.addEventListener('ads:tentar-agora', fim);
    window.addEventListener('online', fim);
  });
}
document.addEventListener('click', e => {
  if (e.target.closest('#btn-tentar-agora')) window.dispatchEvent(new Event('ads:tentar-agora'));
});

async function chamarUmaVez(rota, opcoes) {
  // Token sempre fresco: o cliente do Supabase renova sozinho antes de vencer.
  await renovarToken();
  let r;
  try {
    r = await fetch(rota, {
      ...opcoes,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opcoes.headers || {}),
      },
    });
  } catch {
    throw Object.assign(new Error(Rede.mensagem(0, navigator.onLine)), { status: 0 });
  }
  const corpo = await r.json().catch(() => ({}));
  // Sessão vencida, usuário desativado, sem acesso, troca de senha ou código pendente:
  // a tela volta ao passo certo (conta.js) e a chamada falha com a frase do servidor.
  if (r.status === 401 || (r.status === 403 && corpo.codigo)) tratarCodigo(r.status, corpo);
  if (!r.ok) {
    // 502/503/504 do Render acordando chegam sem o { erro } do nosso servidor: frase de gente, nunca "Erro 503".
    const frase = corpo.erro || Rede.mensagem(r.status, navigator.onLine) || `Não deu certo (erro ${r.status}). Tente de novo.`;
    throw Object.assign(new Error(frase), { status: r.status, doServidor: !!corpo.erro });
  }
  return corpo;
}

async function api(rota, opcoes = {}) {
  const repetir = Rede.podeRepetir(opcoes.method);
  try {
    const corpo = repetir
      ? await Rede.comNovasTentativas(() => chamarUmaVez(rota, opcoes), { aoEsperar: mostrarAcordando, dormir: dormirAcordando })
      : await chamarUmaVez(rota, opcoes);
    esconderAcordando();
    return corpo;
  } catch (e) {
    if (repetir && acordando.ativo && Rede.passageiro(e.status)) {
      // ~3 min sem resposta: a faixa diz isso com todas as letras e fica o botão para tentar de novo.
      acordando.proxima = Date.now() + 60000;
      desenharAcordando();
    }
    throw e;
  }
}

const ocupado = async (botao, tarefa) => {
  botao.disabled = true;
  botao.setAttribute('aria-busy', 'true');
  try { return await tarefa(); }
  finally { botao.disabled = false; botao.removeAttribute('aria-busy'); }
};

/* ---------------- tema claro/escuro ---------------- */

function aplicarTema(t, trocando = false) {
  const html = document.documentElement;
  if (trocando) html.setAttribute('data-trocando-tema', '');
  html.setAttribute('data-tema', t);
  try { localStorage.setItem('ads-tema', t); } catch {}
  const btn = $('#btn-tema');
  btn.textContent = t === 'claro' ? '☾ Escuro' : '☀ Claro';
  btn.setAttribute('aria-pressed', String(t === 'claro'));
  document.querySelector('meta[name="theme-color"]').setAttribute('content', t === 'claro' ? '#f4f4f6' : '#0a0a0b');
  // Regra da casa: desliga as transições por um quadro e solta no seguinte.
  if (trocando) requestAnimationFrame(() => requestAnimationFrame(() => html.removeAttribute('data-trocando-tema')));
}
const temaAtual = () => (document.documentElement.getAttribute('data-tema') === 'claro' ? 'claro' : 'escuro');

/* ---------------- ecossistema ---------------- */

/* Rodada 5: os endereços vêm de public/ecossistema.js (um lugar só para servidor e tela). */
const ECOSSISTEMA = Ecossistema.ORDEM.map(k => [Ecossistema.nome(k), Ecossistema.APPS[k].aqui ? 'aqui' : Ecossistema.url(k) + '/']);

function montarSeletorEco() {
  const sel = $('#seletor-eco');
  sel.innerHTML = ECOSSISTEMA.map(([nome, url]) =>
    `<option value="${esc(url)}"${url === 'aqui' ? ' selected' : ''}>${esc(nome)}${url === 'aqui' ? ' · você está aqui' : ''}</option>`).join('');
  sel.addEventListener('change', () => {
    const url = sel.value;
    if (url && url !== 'aqui') window.location.href = url;
  });
}

/* ---------------- abrir o app (o login está em conta.js) ---------------- */

async function abrirApp(sessao, eu) {
  token = sessao.access_token;
  $('#tela-login').hidden = true;
  $('#app').hidden = false;
  desenharConta(eu, sessao);
  // A faixa de saúde não pode travar o resto se o vigia estiver fora.
  carregarSaude().catch(() => {});
  carregarUltimaLeitura();
  ligarSino(eu);
  contarTarefas(eu).catch(() => {});
  // Link de notificação (?aba=radar) ou recarregar a página abre direto na aba certa.
  const aba = new URLSearchParams(location.search).get('aba');
  // Rodada 6: ?aba=leads&etapa=orc_esperando (link do aviso do sino) já abre a lista filtrada.
  const etapaLink = new URLSearchParams(location.search).get('etapa');
  if (aba === 'leads' && etapaLink) { $('#leads-etapa').value = etapaLink; $('#leads-quando').value = '30'; }
  if (aba && TITULOS[aba] && aba !== 'painel') trocarAba(aba);
  const ancora = new URLSearchParams(location.search).get('ancora');
  if (ancora && /^[a-z-]+$/.test(ancora)) setTimeout(() => document.getElementById(ancora)?.scrollIntoView({ block: 'start' }), 1200);
  try {
    await Promise.all([carregarPainel(), carregarAlertas(), carregarConfig()]);
  } catch (e) {
    aviso(e.message, true);
  }
}

/* Rodada 5: a aba fica na URL (?aba=) — recarregar ou mandar o link abre no mesmo lugar. */
function guardarAbaNaUrl(nome) {
  try {
    const u = new URL(location.href);
    if (nome === 'painel') u.searchParams.delete('aba'); else u.searchParams.set('aba', nome);
    history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams : '') + u.hash);
  } catch {}
}

/* ---------------- navegação ---------------- */

const TITULOS = {
  painel: ['Painel', 'Visão geral do período'],
  leads: ['Leads', 'Do anúncio (ou do site e do WhatsApp) ao CRM'],
  resultados: ['Resultados CRM', 'Leads, vendas e receita atribuída'],
  campanhas: ['Campanhas', 'Onde o dinheiro está indo'],
  criativos: ['Criativos', 'Qual anúncio está segurando o resultado'],
  radar: ['Radar', 'Regras de alerta e disparos recentes'],
  relatorios: ['Relatórios', 'O resumo que vai para o WhatsApp'],
  ajustes: ['Ajustes', 'Metas, avisos, conexões e piloto automático'],
};

function trocarAba(nome) {
  estado.aba = nome;
  $$('.nav-item').forEach(b => {
    const ativo = b.dataset.aba === nome;
    b.classList.toggle('ativo', ativo);
    if (ativo) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $$('.aba').forEach(s => { s.hidden = s.id !== `aba-${nome}`; });
  const [t, s] = TITULOS[nome];
  $('#titulo-aba').firstChild.textContent = t + ' ';
  $('#subtitulo-aba').textContent = s;
  document.title = `${t} · IndyCar Tráfego pago`;
  guardarAbaNaUrl(nome);
  // Celular: a aba nova começa do topo e o item ativo da navegação rola para o meio; o foco vai para o título (leitor de tela anuncia a troca).
  if (window.innerWidth < 860) { window.scrollTo({ top: 0, behavior: 'auto' }); $('.nav-item.ativo')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }
  $('#titulo-aba').focus({ preventScroll: true });

  if (nome === 'leads') carregarLeads();
  if (nome === 'campanhas') carregarRanking('campanha');
  if (nome === 'resultados') { carregarResultados(); carregarLigacao().catch(() => {}); }
  if (nome === 'criativos') carregarRanking('anuncio');
  if (nome === 'radar') { carregarAlertas(); carregarRegras(); }
  if (nome === 'relatorios') { carregarRelatorios(); desenharEstadoRelatorio(); }
  if (nome === 'ajustes') { carregarIntegracoes(); carregarSaude(); carregarStatusWhatsapp(); carregarPreparo().catch(() => {}); }
}

const params = () => {
  const p = new URLSearchParams({ dias: String(estado.periodo) });
  if (estado.plataforma) p.set('plataforma', estado.plataforma);
  return p;
};

/* ---------------- painel ---------------- */

async function carregarPainel() {
  const d = await api(`/api/painel?${params()}`);
  estado.dados = d;
  desenharKPIs(d);
  desenharGraficoGasto(d.serie);
  desenharGraficoCPA(d.serie);
  desenharPlataformas(d.por_plataforma);
  desenharCRM(d);
  carregarLeadsHoje().catch(() => {});
  carregarOficinaAgora().catch(() => {});
  carregarAcoes().catch(() => {});
  const mes = await api('/api/mes');
  desenharMes(mes);
}

/* Para CPA/CPC/CPM/frequência, cair é bom. Pintar tudo de verde quando sobe
   diria que "CPA subiu 40%" é uma boa notícia. */
const MENOR_MELHOR = new Set(['cpa', 'cpc', 'cpm', 'frequencia']);

function classeVar(chave, v) {
  if (v == null || Math.abs(v) < 0.5) return 'neutro';
  const bom = MENOR_MELHOR.has(chave) ? v < 0 : v > 0;
  return bom ? 'sobe' : 'desce';
}

function desenharKPIs(d) {
  const t = d.total, c = d.comparacao;
  const cartao = (rotulo, valor, chave, extra = '') => {
    const v = c[chave]?.variacao;
    const sinal = v == null ? '' : `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
    const seta = v == null ? '' : v > 0.5 ? ' ↑' : v < -0.5 ? ' ↓' : ' →';
    return `<div class="kpi ${extra}">
      <div class="rotulo">${rotulo}</div>
      <div class="numero">${valor}</div>
      <div class="var ${classeVar(chave, v)}">${sinal ? sinal + seta + ' vs. período anterior' : '—'}</div>
    </div>`;
  };

  const metaCpa = d.metas.cpa_alvo && t.cpa != null && t.cpa > d.metas.cpa_alvo;
  const metaRoas = d.metas.roas_alvo && t.roas != null && t.roas < d.metas.roas_alvo;

  $('#cartoes').innerHTML = [
    cartao('Investido', brl(t.gasto), 'gasto'),
    cartao('Conversões', int(t.conversoes), 'conversoes'),
    cartao('CPA', brl(t.cpa), 'cpa', metaCpa ? 'destaque' : ''),
    cartao('ROAS', vezes(t.roas), 'roas', metaRoas ? 'destaque' : ''),
    cartao('CTR', pct(t.ctr), 'ctr'),
    cartao('CPM', brl(t.cpm), 'cpm'),
    `<div class="kpi">
       <div class="rotulo">Resultado</div>
       <div class="numero ${d.lucro >= 0 ? 'sobe' : 'desce'}">${brl(d.lucro)}</div>
       <div class="var neutro">receita × margem ${dec(d.metas.margem_pct, 0)}% − mídia</div>
     </div>`,
    // Rodada 5: o que o CRM viu dos canais pagos no período — leads e custo real por lead (clicável: abre a aba Leads).
    ...(() => {
      const canais = Object.values(d.crm || {});
      const leadsCRM = canais.reduce((s, v) => s + (v.leads || 0), 0);
      const custo = leadsCRM > 0 && t.gasto > 0 ? t.gasto / leadsCRM : null;
      return [`<button type="button" class="kpi kpi-botao" data-leads-pagos title="Ver os leads de anúncio do período">
        <div class="rotulo">Leads no CRM</div><div class="numero">${int(leadsCRM)}</div>
        <div class="var neutro">${custo != null ? `custo real por lead ${brl(custo)}` : 'de anúncio, no período'}</div></button>`];
    })(),
  ].join('');
  $('#cartoes [data-leads-pagos]')?.addEventListener('click', () => abrirLeadsCom({ canal: 'pagos', quando: 'topo' }));
}

/* --- gráficos em SVG, desenhados à mão (nenhuma biblioteca externa).
       Cores de eixo e grade vêm do CSS (classes), para seguirem o tema. --- */

const L = 44, R = 12, T = 12, B = 24;   // margens internas do gráfico

function moldura(largura, altura) {
  return { l: L, r: largura - R, t: T, b: altura - B, w: largura - L - R, h: altura - T - B };
}

function eixoY(m, max, formatar) {
  let s = '';
  for (let i = 0; i <= 4; i++) {
    const y = m.b - (m.h * i) / 4;
    s += `<line class="grade" x1="${m.l}" y1="${y}" x2="${m.r}" y2="${y}" />`;
    s += `<text x="${m.l - 6}" y="${y + 4}" text-anchor="end" font-size="10">${formatar((max * i) / 4)}</text>`;
  }
  return s;
}

function rotulosX(m, serie) {
  // Em 90 dias não cabe um rótulo por dia; mostramos ~8.
  const passo = Math.max(1, Math.ceil(serie.length / 8));
  return serie.map((p, i) => {
    if (i % passo && i !== serie.length - 1) return '';
    const x = m.l + (m.w * (i + 0.5)) / serie.length;
    return `<text x="${x}" y="${m.b + 16}" text-anchor="middle" font-size="10">${curto(p.data)}</text>`;
  }).join('');
}

/* Os mesmos números do gráfico em tabela (leitor de tela e quem prefere ler). */
function tabelaSerie(serie, colunas) {
  if (!serie.length) return '<p class="mini">Sem dados.</p>';
  return `<div class="rolar" tabindex="0" role="region" aria-label="Tabela (role para o lado para ver tudo)"><table><thead><tr><th scope="col">Dia</th>${colunas.map(([t]) => `<th scope="col" class="num">${t}</th>`).join('')}</tr></thead>
    <tbody>${serie.map(p => `<tr><th scope="row">${curto(p.data)}</th>${colunas.map(([, f]) => `<td class="num">${f(p)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function desenharGraficoGasto(serie) {
  const alvo = $('#grafico-gasto');
  $('#tabela-gasto').innerHTML = tabelaSerie(serie, [['Meta', p => brl(p.meta)], ['Google', p => brl(p.google)], ['Total', p => brl(p.meta + p.google)]]);
  if (!serie.length) { alvo.innerHTML = vazio('Sem dados no período.'); return; }
  const W = 640, H = 210, m = moldura(W, H);
  const max = Math.max(...serie.map(p => p.meta + p.google), 1);
  const larg = (m.w / serie.length) * 0.62;

  const barras = serie.map((p, i) => {
    const x = m.l + (m.w * (i + 0.5)) / serie.length - larg / 2;
    const hMeta = (p.meta / max) * m.h;
    const hGoogle = (p.google / max) * m.h;
    return `<g><title>${curto(p.data)} — Meta ${brl(p.meta)} · Google ${brl(p.google)}</title>
      <rect x="${x}" y="${m.b - hMeta}" width="${larg}" height="${hMeta}" fill="#0866ff" rx="2" />
      <rect x="${x}" y="${m.b - hMeta - hGoogle}" width="${larg}" height="${hGoogle}" fill="#fbbc05" rx="2" />
    </g>`;
  }).join('');

  alvo.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
    aria-label="Investimento diário por plataforma: ${serie.length} dias, total Meta ${brl(serie.reduce((s, p) => s + p.meta, 0))} e Google ${brl(serie.reduce((s, p) => s + p.google, 0))}. Detalhe em Ver em tabela.">
    ${eixoY(m, max, v => (v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v)))}
    ${barras}${rotulosX(m, serie)}</svg>`;
}

function desenharGraficoCPA(serie) {
  const alvo = $('#grafico-cpa');
  $('#tabela-cpa').innerHTML = tabelaSerie(serie, [['Conversões', p => int(p.conversoes)], ['CPA', p => brl(p.cpa)]]);
  if (!serie.length) { alvo.innerHTML = vazio('Sem dados no período.', false); return; }
  const W = 640, H = 210, m = moldura(W, H);
  const maxConv = Math.max(...serie.map(p => p.conversoes), 1);
  const maxCpa = Math.max(...serie.map(p => p.cpa || 0), 1);
  const larg = (m.w / serie.length) * 0.62;

  const barras = serie.map((p, i) => {
    const x = m.l + (m.w * (i + 0.5)) / serie.length - larg / 2;
    const h = (p.conversoes / maxConv) * m.h;
    return `<rect class="barra-conv" x="${x}" y="${m.b - h}" width="${larg}" height="${h}" rx="2">
      <title>${curto(p.data)} — ${int(p.conversoes)} conversões</title></rect>`;
  }).join('');

  // Dias sem CPA (nenhuma conversão) quebram a linha em vez de virar zero:
  // desenhar zero sugeriria "CPA excelente" onde não houve resultado.
  const pontos = serie.map((p, i) => ({
    x: m.l + (m.w * (i + 0.5)) / serie.length,
    y: p.cpa == null ? null : m.b - (p.cpa / maxCpa) * m.h,
    p,
  }));
  let d = '', abriu = false;
  for (const pt of pontos) {
    if (pt.y == null) { abriu = false; continue; }
    d += `${abriu ? 'L' : 'M'}${pt.x.toFixed(1)},${pt.y.toFixed(1)} `;
    abriu = true;
  }
  const bolinhas = pontos.filter(pt => pt.y != null).map(pt =>
    `<circle cx="${pt.x}" cy="${pt.y}" r="3" fill="#e50914">
       <title>${curto(pt.p.data)} — CPA ${brl(pt.p.cpa)}</title></circle>`).join('');

  alvo.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="CPA e conversões por dia: ${int(serie.reduce((s, p) => s + p.conversoes, 0))} conversões em ${serie.length} dias. Detalhe em Ver em tabela.">
    ${eixoY(m, maxCpa, v => (v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v)))}
    ${barras}<path d="${d}" fill="none" stroke="#e50914" stroke-width="2" stroke-linejoin="round" />
    ${bolinhas}${rotulosX(m, serie)}</svg>`;
}

const selo = p => `<span class="selo selo-${esc(p)}">${p === 'meta' ? 'Meta' : p === 'google' ? 'Google' : esc(p)}</span>`;

function desenharPlataformas(lista) {
  if (!lista.length) { $('#tabela-plataformas').innerHTML = vazio('Sem dados no período.', false); return; }
  $('#tabela-plataformas').innerHTML = `<div class="rolar" tabindex="0" role="region" aria-label="Tabela (role para o lado para ver tudo)"><table>
    <thead><tr><th>Plataforma</th><th class="num">Investido</th><th class="num">Conv.</th>
      <th class="num">CPA</th><th class="num">ROAS</th><th class="num">CTR</th></tr></thead>
    <tbody>${lista.map(p => `<tr>
      <td>${selo(p.plataforma)}</td>
      <td class="num">${brl(p.gasto)}</td><td class="num">${int(p.conversoes)}</td>
      <td class="num">${brl(p.cpa)}</td><td class="num">${vezes(p.roas)}</td><td class="num">${pct(p.ctr)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

/* Rodada 5: leads do mês (todos os canais) e custo por lead pago, no mesmo cartão do orçamento. */
function linhaLeadsMes(m) {
  const l = m.leads;
  if (!l) return '';
  return `<p class="mini">Leads no mês: <strong>${int(l.total)}</strong> (${int(l.pagos)} de anúncio · ${int(l.agendados)} agendaram · ${int(l.fechados)} fecharam)${l.custo_lead_pago != null ? ` · custo por lead pago <strong>${brl(l.custo_lead_pago)}</strong>` : ''}${l.sem_responsavel ? ` · <span class="desce">${int(l.sem_responsavel)} sem responsável</span>` : ''}</p>`;
}
function desenharMes(m) {
  if (!m.orcamento) {
    $('#bloco-mes').innerHTML = `<p class="mini">Investido no mês: <strong>${brl(m.gasto)}</strong> · projeção ${brl(m.projecao)}.</p>
      <p class="mini">Defina o orçamento em Ajustes para acompanhar o ritmo.</p>${linhaLeadsMes(m)}`;
    return;
  }
  const usado = Math.min(100, (m.gasto / m.orcamento) * 100);
  const estoura = m.desvio > 0;
  $('#bloco-mes').innerHTML = `
    <div class="numero" style="font-size:1.8rem">${brl(m.gasto)}</div>
    <p class="mini">de ${brl(m.orcamento)} — dia ${int(m.dias_corridos)} de ${int(m.dias_no_mes)}</p>
    <div class="barra ${estoura ? '' : 'ok'}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${usado.toFixed(0)}" aria-label="Orçamento do mês usado"><span style="width:${usado.toFixed(1)}%"></span></div>
    <p class="mini">Projeção do mês: <strong>${brl(m.projecao)}</strong>
      <span class="${estoura ? 'desce' : 'sobe'}">
        (${estoura ? '+' : ''}${brl(m.desvio)} ${estoura ? 'acima' : 'abaixo'} do orçamento)</span></p>
    <p class="mini">Receita atribuída: ${brl(m.receita)} · resultado ${brl(m.lucro)}</p>${linhaLeadsMes(m)}`;
}

function desenharCRM(d) {
  const canais = Object.entries(d.crm || {});
  if (!canais.length) {
    $('#tabela-crm').innerHTML = vazio('Nenhum lead com origem meta/google no período.', false);
    return;
  }
  const semValor = canais.reduce((n, [, v]) => n + (v.sem_valor || 0), 0);
  const conv = Object.fromEntries(d.por_plataforma.map(p => [p.plataforma, p]));
  $('#tabela-crm').innerHTML = `<div class="rolar" tabindex="0" role="region" aria-label="Tabela (role para o lado para ver tudo)"><table>
    <thead><tr><th>Canal</th><th class="num">Conv. na plataforma</th><th class="num">Leads no CRM</th>
      <th class="num">Fechados</th><th class="num">Receita real</th><th class="num">Custo por lead real</th><th class="num">Custo por venda real</th><th></th></tr></thead>
    <tbody>${canais.map(([canal, v]) => {
      const gasto = conv[canal]?.gasto || 0;
      return `<tr>
        <td>${selo(canal)}</td>
        <td class="num">${int(conv[canal]?.conversoes)}</td>
        <td class="num">${int(v.leads)}</td>
        <td class="num">${int(v.fechados)}</td>
        <td class="num">${v.fechados && v.sem_valor === v.fechados ? '<span class="sem-valor">sem valor lançado</span>' : `${brl(v.receita)}${v.sem_valor ? `<span class="sem-valor" title="${int(v.sem_valor)} venda(s) sem valor"> *</span>` : ''}`}</td>
        <td class="num">${v.leads ? brl(gasto / v.leads) : '—'}</td>
        <td class="num">${v.fechados && gasto ? brl(gasto / v.fechados) : '—'}</td>
        <td><button type="button" class="link mini" data-leads-canal-topo="${esc(canal)}">ver leads</button></td>
      </tr>`;
    }).join('')}</tbody></table></div>
    ${semValor ? `<p class="mini">${int(semValor)} venda(s) concluída(s) sem valor pago no CRM — a receita real fica incompleta. Detalhes em <button type="button" class="link" data-ir="resultados">Resultados CRM</button>.</p>` : ''}`;
  $$('#tabela-crm [data-ir]').forEach(b => b.addEventListener('click', () => trocarAba(b.dataset.ir)));
  $$('#tabela-crm [data-leads-canal-topo]').forEach(b => b.addEventListener('click', () => abrirLeadsCom({ canal: b.dataset.leadsCanalTopo, quando: 'topo' })));
}

/* ---------------- rankings ---------------- */

async function carregarRanking(nivel) {
  const p = params();
  p.set('nivel', nivel);
  // Rodada 5: as duas ordens pelo CRM são da tela (o servidor ordena por métrica de plataforma).
  const ordemCRM = nivel === 'campanha' && /_crm$/.test($('#ordenar-campanhas').value) ? $('#ordenar-campanhas').value : null;
  if (nivel === 'campanha') p.set('ordenar', ordemCRM ? 'gasto' : $('#ordenar-campanhas').value);
  let lista = await api(`/api/ranking?${p}`);
  if (ordemCRM === 'leads_crm') lista = [...lista].sort((a, b) => (b.crm?.leads || 0) - (a.crm?.leads || 0) || b.gasto - a.gasto);
  if (ordemCRM === 'custo_venda_crm') lista = [...lista].sort((a, b) => (a.crm?.custo_venda ?? Infinity) - (b.crm?.custo_venda ?? Infinity) || b.gasto - a.gasto);
  const alvo = nivel === 'campanha' ? '#tabela-campanhas' : '#tabela-criativos';
  if (nivel === 'campanha') estado.ranking = lista; else estado.criativos = lista;   // a busca global procura aqui
  if (!lista.length) { $(alvo).innerHTML = vazio('Sem dados no período.'); return; }

  const colFreq = nivel === 'anuncio', colCRM = nivel === 'campanha';
  // Rodada 5 (Campanhas): o que o CRM viu de cada campanha — leads, vendas e custo real.
  const crmCel = (x, f) => (x.crm ? f(x.crm) : `<span class="mini" title="${esc(x.crm_motivo || '')}">—</span>`);
  $(alvo).innerHTML = `<div class="rolar" tabindex="0" role="region" aria-label="Tabela (role para o lado para ver tudo)"><table>
    <thead><tr><th></th><th>${colFreq ? 'Criativo' : 'Campanha'}</th>
      <th class="num">Investido</th><th class="num">Impr.</th><th class="num">Cliques</th>
      <th class="num">CTR</th><th class="num">Conv.</th><th class="num">CPA</th>
      <th class="num">ROAS</th>${colFreq ? '<th class="num">Freq.</th>' : ''}
      ${colCRM ? '<th class="num col-crm" title="Leads no CRM com esta utm_campaign">Leads CRM</th><th class="num col-crm">Custo/lead</th><th class="num col-crm">Vendas</th><th class="num col-crm">Custo/venda</th><th class="num col-crm">ROAS real</th><th class="num col-crm" title="Carros desta campanha que chegaram ao Pátio">Carros</th><th class="num col-crm">Custo/carro</th>' : ''}</tr></thead>
    <tbody>${lista.map(x => {
      const fadiga = colFreq && x.frequencia >= 3.5;
      return `<tr>
        <td>${selo(x.plataforma)}</td>
        <td class="nome-forte">${esc(x.nome)}${colFreq && x.campanha_nome ? `<br><span class="mini">${esc(x.campanha_nome)}</span>` : ''}
          ${colCRM && x.crm?.leads ? `<br><button type="button" class="link mini" data-leads-campanha="${esc(x.nome)}">ver os ${int(x.crm.leads)} lead(s)</button>` : ''}</td>
        <td class="num">${brl(x.gasto)}</td>
        <td class="num">${int(x.impressoes)}</td>
        <td class="num">${int(x.cliques)}</td>
        <td class="num">${pct(x.ctr)}</td>
        <td class="num">${int(x.conversoes)}</td>
        <td class="num">${brl(x.cpa)}</td>
        <td class="num">${vezes(x.roas)}</td>
        ${colFreq ? `<td class="num ${fadiga ? 'desce' : ''}">${dec(x.frequencia)}</td>` : ''}
        ${colCRM ? `<td class="num col-crm">${crmCel(x, c => int(c.leads))}</td>
          <td class="num col-crm">${crmCel(x, c => brl(c.cpl))}</td>
          <td class="num col-crm">${crmCel(x, c => `${int(c.fechados)}${c.receita_desconhecida && c.fechados ? '<span class="sem-valor" title="vendas sem valor pago no CRM">*</span>' : ''}`)}</td>
          <td class="num col-crm">${crmCel(x, c => brl(c.custo_venda))}</td>
          <td class="num col-crm">${crmCel(x, c => vezes(c.roas_real))}</td>
          <td class="num col-crm">${x.oficina ? int(x.oficina.na_oficina) : '<span class="mini">—</span>'}</td>
          <td class="num col-crm">${x.oficina ? brl(x.oficina.custo_carro) : '<span class="mini">—</span>'}</td>` : ''}
      </tr>`;
    }).join('')}</tbody></table></div>
    ${colCRM && lista.every(x => !x.crm) ? `<p class="mini">Nenhuma campanha casou com o CRM: ${esc(lista[0].crm_motivo || 'sem UTM')}. Veja “Como marcar os anúncios (UTM)” em Resultados CRM.</p>` : ''}`;
  if (colCRM) {
    $$(`${alvo} [data-leads-campanha]`).forEach(b => b.addEventListener('click', () => abrirLeadsCom({ q: b.dataset.leadsCampanha, canal: 'pagos', quando: 'topo' })));
    if ($('#busca-campanhas').value) filtrarTabela(alvo, $('#busca-campanhas').value);
  }
}

/* ---------------- radar ---------------- */

const NOME_SEVERIDADE = { critico: 'Crítico', alerta: 'Alerta', info: 'Informativo' };
async function carregarAlertas() {
  const sev = $('#filtro-severidade')?.value || '';
  // Rodada 5: o filtro de plataforma do topo ("Só Meta") também vale para os alertas.
  const lista = await api(`/api/alertas?limite=60${sev ? `&severidade=${sev}` : ''}${estado.plataforma ? `&plataforma=${estado.plataforma}` : ''}`);
  estado.alertas = lista;   // a busca global procura aqui
  if (!sev) {
    const naoLidos = lista.filter(a => !a.lido_em).length;
    const pino = $('#pino-alertas');
    pino.textContent = String(naoLidos);
    pino.hidden = naoLidos === 0;
  }

  $('#btn-marcar-lidos').disabled = !lista.some(a => !a.lido_em);
  $('#lista-alertas').innerHTML = lista.length
    ? lista.map(a => `<div class="alerta ${a.lido_em ? '' : 'novo'}">
        <span class="bolha sev-${esc(a.severidade)}" aria-hidden="true"></span><span class="so-leitor">${esc(NOME_SEVERIDADE[a.severidade] || a.severidade)}: </span>
        <div class="alerta-txt">
          <p>${esc(a.mensagem)}</p>
          <p class="mini">${esc(a.regra_nome || '')} · ${new Date(a.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            ${a.enviado_em ? '· na fila do WhatsApp' : ''}${a.lido_em ? '' : ' · <strong>novo</strong>'}
            ${a.acao ? ` · <button type="button" class="link mini" data-acao-alerta='${esc(JSON.stringify(a.acao))}'>${esc(a.acao.rotulo)}</button>` : (a.entidade_nome ? ` · <button type="button" class="link mini" data-ver-campanha="${esc(a.nivel === 'campanha' ? a.entidade_nome : (a.campanha_nome || a.entidade_nome))}">ver a campanha</button>` : '')}</p>
        </div></div>`).join('')
    : (sev ? '<p class="vazio">Nenhum alerta com esta severidade.</p>' : vazio('Nenhum alerta ainda. O radar avalia dias fechados: ou está tudo dentro dos limites, ou ainda não há dados suficientes. “Testar agora” mostra o que dispararia.', false));
  // Rodada 5: do alerta direto para a campanha (aba Campanhas filtrada pelo nome).
  $$('#lista-alertas [data-ver-campanha]').forEach(b => b.addEventListener('click', () => { $('#busca-campanhas').value = b.dataset.verCampanha; trocarAba('campanhas'); }));
}

/* Resultado do "testar agora": não existe no banco, então é pintado direto
   na lista com um aviso de que é simulação. Some ao recarregar a aba. */
function mostrarSimulacao(alertas) {
  $('#lista-alertas').innerHTML = `<p class="mini">Simulação — nada foi gravado nem enviado.</p>` + (alertas.length
    ? alertas.map(a => `<div class="alerta">
        <span class="bolha sev-${esc(a.severidade)}" aria-hidden="true"></span>
        <div class="alerta-txt"><p>${esc(a.mensagem)}</p>
          <p class="mini">${esc(a.regra_nome || '')}</p></div></div>`).join('')
    : vazio('Nenhuma regra dispararia agora.', false));
}

const ROTULO_METRICA = {
  cpa: 'CPA', roas: 'ROAS', ctr: 'CTR', cpm: 'CPM', cpc: 'CPC', frequencia: 'Frequência',
  gasto: 'Investimento', conversoes: 'Conversões', cliques: 'Cliques', impressoes: 'Impressões',
};
const ROTULO_NIVEL = { conta: 'conta', campanha: 'campanha', conjunto: 'conjunto', anuncio: 'criativo' };

let regrasCache = [];

async function carregarRegras() {
  regrasCache = await api('/api/regras');
  // Rodada 5: interruptor liga/desliga sem abrir o modal; a linha continua abrindo a edição.
  $('#regras-conta').textContent = regrasCache.length ? `${regrasCache.length} regra(s) · ${regrasCache.filter(r => r.ativa).length} ligada(s)` : '';
  $('#lista-regras').innerHTML = regrasCache.length
    ? regrasCache.map(r => `<div class="regra-linha ${r.ativa ? '' : 'desligada'}">
        <button type="button" class="regra" data-id="${esc(r.id)}" aria-label="Editar regra ${esc(r.nome)}">
          <div>
            <div class="nome-forte">${esc(r.nome)}</div>
            <div class="regra-cond">${esc(ROTULO_NIVEL[r.nivel] || r.nivel)} · ${esc(ROTULO_METRICA[r.metrica] || r.metrica)} ${esc(r.operador)} ${dec(r.valor)}
              · ${int(r.janela_dias)}d${r.plataforma ? ` · ${esc(r.plataforma)}` : ''}${r.ativa ? '' : ' · desligada'}</div>
          </div>
          <span class="bolha sev-${esc(r.severidade)}" aria-hidden="true"></span>
        </button>
        <button type="button" class="interruptor" role="switch" aria-checked="${r.ativa ? 'true' : 'false'}" data-ativa="${esc(r.id)}" aria-label="${r.ativa ? 'Desligar' : 'Ligar'} a regra ${esc(r.nome)}"><span></span></button>
      </div>`).join('')
    : vazio('Nenhuma regra cadastrada. Clique em “Nova regra” — ou comece pelas sete prontas (CPA, ROAS, sem conversão, criativo saturado, CTR, CPM, gasto).', false);

  $$('#lista-regras .regra').forEach(el =>
    el.addEventListener('click', () => abrirRegra(regrasCache.find(r => r.id === el.dataset.id))));
  $$('#lista-regras [data-ativa]').forEach(el => el.addEventListener('click', () => ocupado(el, async () => {
    const r = regrasCache.find(x => x.id === el.dataset.ativa);
    try {
      await api('/api/regras/ativa', { method: 'POST', body: JSON.stringify({ id: r.id, ativa: !r.ativa }) });
      aviso(`Regra “${r.nome}” ${r.ativa ? 'desligada' : 'ligada'}.`);
      await carregarRegras();
    } catch (e) { aviso(e.message, true); }
  })));
}

function abrirRegra(regra) {
  const novo = !regra;
  $('#titulo-regra').textContent = novo ? 'Nova regra' : 'Editar regra';
  $('#regra-id').value = regra?.id || '';
  $('#regra-nome').value = regra?.nome || '';
  $('#regra-nivel').value = regra?.nivel || 'campanha';
  $('#regra-plataforma').value = regra?.plataforma || '';
  $('#regra-metrica').value = regra?.metrica || 'cpa';
  $('#regra-operador').value = regra?.operador || '>';
  $('#regra-valor').value = regra?.valor ?? '';
  $('#regra-janela').value = regra?.janela_dias ?? 3;
  $('#regra-severidade').value = regra?.severidade || 'alerta';
  $('#regra-cooldown').value = regra?.cooldown_horas ?? 24;
  $('#regra-min-gasto').value = regra?.min_gasto ?? 100;
  $('#regra-min-impressoes').value = regra?.min_impressoes ?? 0;
  $('#regra-min-conversoes').value = regra?.min_conversoes ?? 0;
  $('#regra-mensagem').value = regra?.mensagem || '';
  $('#regra-recado').hidden = true;
  $('#btn-apagar-regra').hidden = novo;
  $('#btn-duplicar-regra').hidden = novo;
  $('#modal-regra').showModal();
  $('#regra-nome').focus();
}

/* Mesmo contrato do servidor (radar.validarRegra): o erro aparece dentro do
   modal, ao lado do campo, antes de qualquer ida ao banco. */
function validarRegraTela(c) {
  const inteiro = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  if (!c.nome) return ['Dê um nome à regra.', '#regra-nome'];
  if (c.nome.length > 80) return ['O nome pode ter até 80 caracteres.', '#regra-nome'];
  if (!Number.isFinite(c.valor) || c.valor < 0) return ['Informe o valor limite: um número maior ou igual a zero.', '#regra-valor'];
  if (!inteiro(c.janela_dias, 1, 90)) return ['Janela: use um número inteiro de 1 a 90 dias.', '#regra-janela'];
  if (!inteiro(c.cooldown_horas, 1, 720)) return ['Repetir só após: de 1 a 720 horas.', '#regra-cooldown'];
  if (!Number.isFinite(c.min_gasto) || c.min_gasto < 0) return ['Gasto mínimo: número maior ou igual a zero.', '#regra-min-gasto'];
  if (!Number.isFinite(c.min_impressoes) || c.min_impressoes < 0) return ['Impressões mínimas: número maior ou igual a zero.', '#regra-min-impressoes'];
  if (!Number.isFinite(c.min_conversoes) || c.min_conversoes < 0) return ['Conversões mínimas: número maior ou igual a zero.', '#regra-min-conversoes'];
  return null;
}

const numeroOu = (sel, padrao) => {
  const v = $(sel).value.trim();
  return v === '' ? padrao : Number(v);
};

async function salvarRegra(e) {
  e.preventDefault();
  const corpo = {
    nome: $('#regra-nome').value.trim(),
    nivel: $('#regra-nivel').value,
    plataforma: $('#regra-plataforma').value || null,
    metrica: $('#regra-metrica').value,
    operador: $('#regra-operador').value,
    valor: numeroOu('#regra-valor', NaN),
    janela_dias: numeroOu('#regra-janela', 3),
    severidade: $('#regra-severidade').value,
    cooldown_horas: numeroOu('#regra-cooldown', 24),
    min_gasto: numeroOu('#regra-min-gasto', 0),
    min_impressoes: numeroOu('#regra-min-impressoes', 0),
    min_conversoes: numeroOu('#regra-min-conversoes', 0),
    mensagem: $('#regra-mensagem').value.trim() || null,
    ativa: true,
  };
  const recado = $('#regra-recado');
  const problema = validarRegraTela(corpo);
  if (problema) {
    recado.textContent = problema[0];
    recado.hidden = false;
    $(problema[1]).focus();
    return;
  }
  recado.hidden = true;
  const id = $('#regra-id').value;
  if (id) corpo.id = id;
  try {
    await api('/api/regras', { method: 'POST', body: JSON.stringify(corpo) });
    $('#modal-regra').close();
    await carregarRegras();
    aviso('Regra salva.');
  } catch (e) {
    recado.textContent = e.message;
    recado.hidden = false;
  }
}

/* ---------------- relatórios ---------------- */

async function carregarRelatorios() {
  const lista = await api('/api/relatorios');
  $('#lista-relatorios').innerHTML = lista.length
    ? `<div class="rolar" tabindex="0" role="region" aria-label="Tabela (role para o lado para ver tudo)"><table>
        <thead><tr><th>Referência</th><th>Envio</th><th>Leitura do dia</th><th></th></tr></thead>
        <tbody>${lista.map((r, i) => `<tr>
          <td>${dataBR(r.referencia)}</td>
          <td>${r.enviado_em ? '✅ na fila do Comunicar' : (r.erro ? `⚠️ ${esc(r.erro)}` : '— não enviado')}</td>
          <td>${esc((r.resumo_ia || '').slice(0, 180))}${(r.resumo_ia || '').length > 180 ? '…' : ''}</td>
          <td>${r.texto ? `<button type="button" class="link mini" data-ver-relatorio="${i}">ver texto</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>`
    : vazio('Nenhum relatório gerado ainda. Clique em “Gerar prévia” para ver como ele fica.', false);
  // Rodada 5: "ver texto" mostra o relatório daquele dia na prévia (dá para copiar e mandar à mão).
  $$('#lista-relatorios [data-ver-relatorio]').forEach(b => b.addEventListener('click', () => {
    const r = lista[Number(b.dataset.verRelatorio)];
    $('#previa-relatorio').textContent = r.texto; $('#previa-relatorio').hidden = false; $('#btn-copiar-relatorio').hidden = false;
    $('#previa-relatorio').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

/* Por que o botão "Enviar" está travado — vem da mesma config de Ajustes. */
function desenharEstadoRelatorio() {
  const c = estado.cfg;
  const el = $('#relatorio-estado'), btn = $('#btn-enviar-relatorio');
  if (!c) return;
  const bloqueio = c.relatorio_ativo !== true ? 'relatório diário desligado em Ajustes'
    : !c.whatsapp_destinos?.length ? 'nenhum número de WhatsApp cadastrado em Ajustes'
    : null;
  if (bloqueio) {
    el.innerHTML = `Envio: <strong class="desce">${esc(bloqueio)}</strong> — a prévia continua funcionando; nada é enviado.`;
    btn.disabled = true;
    btn.title = bloqueio;
  } else {
    el.innerHTML = `Envio automático às ${esc(c.relatorio_hora)}h para ${c.whatsapp_destinos.map(t => esc(fmtTel(t))).join(', ')}. A prévia não envia nada.`;
    btn.disabled = false;
    btn.title = '';
  }
}

/* ---------------- ajustes ---------------- */

async function carregarConfig() {
  const c = await api('/api/config');
  estado.cfg = c;
  $('#cfg-cpa').value = c.cpa_alvo ?? '';
  $('#cfg-roas').value = c.roas_alvo ?? '';
  $('#cfg-orcamento').value = c.orcamento_mensal ?? '';
  $('#cfg-ticket').value = c.ticket_medio ?? '';
  $('#cfg-margem').value = c.margem_pct ?? 100;
  $('#cfg-destinos').value = (c.whatsapp_destinos || []).map(fmtTel).join(', ');
  $('#cfg-relatorio-ativo').checked = c.relatorio_ativo === true;
  $('#cfg-relatorio-hora').value = c.relatorio_hora ?? 8;
  $('#cfg-alertas-ativos').checked = c.alertas_ativos !== false;
  $('#cfg-intervalo').value = c.alertas_intervalo_min ?? 60;
  desenharAvisos(c);
  desenharEstadoRelatorio();
}

/* O que está ligado e para quem — em três linhas, sem texto comprido. */
function desenharAvisos(c) {
  const destinos = c.whatsapp_destinos || [];
  const pilula = (on, txtOn, txtOff, meio = false) =>
    `<span class="pilula ${on ? 'on' : meio ? 'meio' : 'off'}">${on ? txtOn : txtOff}</span>`;
  $('#bloco-avisos').innerHTML = `
    <div class="estado-linha">${pilula(c.relatorio_ativo === true, 'ligado', 'desligado')}
      <span>Relatório diário no WhatsApp${c.relatorio_ativo === true ? ` · às ${esc(c.relatorio_hora ?? 8)}h` : ''}</span></div>
    <div class="estado-linha">${pilula(c.alertas_ativos !== false, 'ligado', 'desligado')}
      <span>Alertas do radar${c.alertas_ativos !== false ? ` · a cada ${esc(c.alertas_intervalo_min ?? 60)} min` : ''}</span></div>
    <div class="estado-linha">${pilula(destinos.length > 0, `${destinos.length} ${destinos.length === 1 ? 'número' : 'números'}`, 'sem destino', true)}
      <span>${destinos.length ? destinos.map(t => esc(fmtTel(t))).join(', ') : 'Nenhum número cadastrado — nada é enviado, nem relatório nem alertas.'}</span></div>`;
}

const numOuNulo = sel => {
  const v = $(sel).value.trim();
  return v === '' ? null : parseFloat(v);
};

async function salvarConfig(e) {
  e.preventDefault();
  try {
    const c = await api('/api/config', { method: 'POST', body: JSON.stringify({
      cpa_alvo: numOuNulo('#cfg-cpa'),
      roas_alvo: numOuNulo('#cfg-roas'),
      orcamento_mensal: numOuNulo('#cfg-orcamento'),
      ticket_medio: numOuNulo('#cfg-ticket'),
      margem_pct: numOuNulo('#cfg-margem') ?? 100,
      whatsapp_destinos: $('#cfg-destinos').value.split(',').map(s => s.trim()).filter(Boolean),
      relatorio_ativo: $('#cfg-relatorio-ativo').checked,
      relatorio_hora: parseInt($('#cfg-relatorio-hora').value, 10),
      alertas_ativos: $('#cfg-alertas-ativos').checked,
      alertas_intervalo_min: parseInt($('#cfg-intervalo').value, 10),
    }) });
    await carregarConfig();
    const ligado = c.relatorio_ativo === true && c.whatsapp_destinos?.length;
    aviso(ligado ? `Salvo. Relatório diário ligado às ${c.relatorio_hora}h.` : 'Salvo. Relatório diário continua desligado.');
  } catch (e) { aviso(e.message, true); }
}

/* Token da Meta de longa duração vence em ~60 dias: avisar antes. */
function venceTxt(i) {
  if (i.canal !== 'meta' || !i.meta_token_expira_em) return '';
  const dias = Math.ceil((new Date(`${i.meta_token_expira_em}T23:59:59-03:00`) - Date.now()) / 86400000);
  if (dias < 0) return ` · <strong class="desce">token venceu em ${esc(dataBR(i.meta_token_expira_em))}</strong>`;
  if (dias <= 10) return ` · <strong class="desce">token vence em ${dias} dia(s)</strong>`;
  return ` · vence em ${esc(dataBR(i.meta_token_expira_em))}`;
}

/* Rodada 4: guia de conexão em passos — o que está feito, o próximo passo e a mensagem pronta para pedir o resto. */
function desenharGuia(canal, i) {
  const passos = canal === 'meta' ? GuiaConexao.passosMeta(i) : GuiaConexao.passosGoogle(i);
  const r = GuiaConexao.resumo(passos);
  const prog = $(`#progresso-${canal}`);
  if (prog) {
    prog.textContent = r.pronto ? '· pronto' : `· ${r.feitos} de ${r.total} passos`;
    prog.classList.toggle('ok', r.pronto);
  }
  const caixa = $(`#passos-${canal}`);
  if (!caixa) return;
  const pedido = GuiaConexao.mensagemPedido(canal, passos);
  caixa.innerHTML = `<ol class="passos">${passos.map((p, n) => `<li class="${p.feito ? 'feito' : ''}${p === r.proximo ? ' proximo' : ''}">
      <span class="passo-marca" aria-hidden="true">${p.feito ? '✓' : n + 1}</span>
      <div><strong>${esc(p.titulo)}</strong><span class="so-leitor">${p.feito ? ': feito' : ': falta'}</span>
      ${p.feito ? '' : `<p class="mini">${esc(p.como)}</p>`}</div></li>`).join('')}</ol>
    ${pedido ? `<button class="btn btn-fantasma btn-mini" type="button" data-copiar-pedido="${canal}">Copiar mensagem pedindo o que falta</button>` : ''}`;
  caixa.dataset.pedido = pedido;
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-copiar-pedido]');
  if (!b) return;
  const texto = $(`#passos-${b.dataset.copiarPedido}`)?.dataset.pedido || '';
  try { await navigator.clipboard.writeText(texto); aviso('Mensagem copiada: cole no WhatsApp de quem cuida da conta.'); }
  catch { aviso('Não deu para copiar aqui. Selecione o texto dos passos e copie à mão.', true); }
});

async function carregarIntegracoes() {
  let lista = [];
  try { lista = await api('/api/integracoes'); }
  finally {
    desenharGuia('meta', lista.find(i => i.canal === 'meta'));
    desenharGuia('google', lista.find(i => i.canal === 'google'));
  }
  $('#lista-integracoes').innerHTML = lista.length
    ? lista.map(i => {
        const pronto = i.canal === 'meta' ? i.tem_meta_token : i.tem_google_token;
        // Rodada 5: chave colada mas recusada pela plataforma aparece como "recusada", não como "preenchida".
        const recusada = pronto && /^erro/i.test(String(i.ultimo_sync_status || ''));
        return `<div class="alerta">
          <span class="bolha ${recusada ? 'sev-critico' : pronto ? 'sev-info' : 'sev-alerta'}" aria-hidden="true"></span>
          <div class="alerta-txt">
            <p>${selo(i.canal)} ${esc(i.conta_nome || '(sem nome)')} <span class="pilula ${recusada ? 'off' : pronto ? 'on' : 'meio'}">${recusada ? 'chave recusada' : pronto ? 'chave colada' : 'sem chave'}</span></p>
            <p class="mini">${recusada ? 'A plataforma recusou a chave colada: gere outra e toque em “Testar sem salvar”.' : pronto ? 'Credencial preenchida' : 'Falta token'}${venceTxt(i)}
              ${i.ultimo_sync_em ? ` · último sync ${new Date(i.ultimo_sync_em).toLocaleString('pt-BR')}` : ' · nunca sincronizou'}
              ${i.ultimo_sync_status ? ` · ${esc(i.ultimo_sync_status)}` : ''}</p>
          </div></div>`;
      }).join('')
    : vazio('Nenhuma integração cadastrada em integracoes_ads.');
}

/* ---------------- saúde: faixa no topo + piloto automático ---------------- */

/* Códigos que o vigia grava em vigia_estado, em português de gente. */
const PROBLEMAS = {
  'codewords-chave-recusada': ['Chave do CodeWords recusada', 'o serviço que leva as mensagens do WhatsApp recusou a chave (401) — nenhum WhatsApp sai do ecossistema; os avisos deste painel ficam guardados na fila do Comunicar até a chave nova ser colada em Atendimento › Configurações.'],
  'codewords-fora': ['CodeWords fora', 'o serviço que leva as mensagens do WhatsApp não está respondendo — nenhum WhatsApp sai do ecossistema; os avisos deste painel esperam na fila.'],
  'crm-fora': ['CRM fora do ar', 'o CRM não está respondendo (a aba Leads e os Resultados leem direto do banco e continuam).'],
  'comunicar-fora': ['Comunicar fora do ar', 'o carteiro da fila de WhatsApp não está respondendo — relatório e alertas ficam na fila até voltar.'],
  'comunicar-carteiro-parado': ['Carteiro parado', 'o carteiro do Comunicar parou de rodar — as mensagens ficam na fila até ele voltar.'],
  'comunicar-fila-parada': ['Fila de WhatsApp parada', 'há mensagens vencidas na fila do Comunicar sem sair.'],
  'whatsapp-desconectado': ['WhatsApp desconectado', 'o WhatsApp da empresa desconectou — nenhuma mensagem sai até reconectar em Atendimento › Configurações.'],
  'whatsapp-sem-config': ['WhatsApp sem configuração', 'falta chave ou aparelho do WhatsApp em Atendimento › Configurações.'],
  'whatsapp-sem-receber': ['WhatsApp sem receber', 'o WhatsApp está conectado mas não recebe mensagens — religue o fluxo em Atendimento › Configurações.'],
  'atendimento-fora': ['Atendimento fora do ar', 'o painel de Atendimento não está respondendo.'],
  'agenda-fora': ['Agenda fora do ar', 'o sistema da Agenda não está respondendo.'],
  'sincronia-parada': ['Sincronização parada', 'as mensagens do WhatsApp não estão sendo sincronizadas.'],
};

function desenharFaixa(s) {
  const faixa = $('#faixa-saude');
  if (!s || !s.problema) { faixa.hidden = true; faixa.innerHTML = ''; return; }
  const [titulo, texto] = PROBLEMAS[s.problema] || [s.problema, s.resumo || 'o vigia registrou um problema.'];
  // Rodada 5: o vigia pode ter mais de um problema aberto — os outros aparecem em uma linha.
  const outros = (s.problemas || []).filter(p => p !== s.problema).map(p => (PROBLEMAS[p] ? PROBLEMAS[p][0] : p));
  faixa.innerHTML = `<span class="faixa-icone" aria-hidden="true">⚠️</span>
    <div><strong>Vigia · ${esc(titulo)}</strong> — ${esc(texto)}
      ${outros.length ? `<p class="mini">Também em aberto: ${esc(outros.join(' · '))}.</p>` : ''}
      <p class="mini">desde ${esc(dataHora(s.desde))} · conferido ${esc(dataHora(s.checado_em))}</p></div>`;
  faixa.hidden = false;
}

/* Rodada 5: modo sem chaves — faixa (fechável por sessão) e selo "demo" no título. */
function desenharDemo(s) {
  estado.semChaves = s.sem_chaves === true;
  const demoNaTela = estado.semChaves && !s.tem_dados_reais;
  $('#selo-demo').hidden = !demoNaTela;
  const faixa = $('#faixa-demo');
  let fechada = false; try { fechada = sessionStorage.getItem('ads-faixa-demo') === '1'; } catch {}
  if (!estado.semChaves || fechada) { faixa.hidden = true; return; }
  const ch = s.chaves || {};
  const recusadas = ['meta', 'google'].filter(c => ch[c] === 'recusada').map(c => (c === 'meta' ? 'Meta' : 'Google'));
  const motivo = recusadas.length
    ? `a chave colada da ${recusadas.join(' e do ')} está sendo recusada pela plataforma (toque em “Testar sem salvar” em Ajustes → Conexões para ver o que fazer).`
    : 'nenhuma chave da Meta ou do Google foi colada ainda.';
  faixa.innerHTML = `<span class="faixa-icone" aria-hidden="true">🧪</span>
    <div><strong>Modo demonstração</strong> — ${esc(motivo)} ${demoNaTela ? 'Os números de investimento são fabricados (marcados como demo); leads e vendas são do CRM de verdade.' : 'Sem chave, nada de novo entra das plataformas.'}
      <p class="mini"><button type="button" class="link" data-ir="ajustes">Colar as chaves em Ajustes → Conexões</button>${s.tem_dados === false ? ' · <button type="button" class="link" data-demo-criar>Criar dados de demonstração</button>' : ''} · <button type="button" class="link" id="fechar-faixa-demo">Entendi, esconder hoje</button></p></div>`;
  faixa.hidden = false;
  $('#fechar-faixa-demo').addEventListener('click', () => { try { sessionStorage.setItem('ads-faixa-demo', '1'); } catch {} faixa.hidden = true; });
  faixa.querySelector('[data-ir]').addEventListener('click', () => trocarAba('ajustes'));
}

async function carregarSaude() {
  const s = await api('/api/saude');
  estado.versao = s.versao || null;
  desenharFaixa(s);
  desenharDemo(s);
  const p = s.piloto || {};
  $('#bloco-saude').innerHTML = `
    <p class="mini">Piloto automático: <strong>${p.automatico ? 'ligado' : 'desligado'}</strong>${p.automatico ? '' : ' (rotas /api/cron/* por agendador externo)'}</p>
    <p class="mini">Último sync: ${esc(dataHora(p.ultimoSync))} · último radar: ${esc(dataHora(p.ultimoRadar))}</p>
    <p class="mini">Último relatório enviado: ${esc(dataHora(p.ultimoRelatorio))}${p.relatorio?.motivo ? ` · <span class="neutro">${esc(p.relatorio.motivo)}</span>` : ''}</p>
    <p class="mini">Leitura com IA: ${s.ia ? 'disponível' : 'sem ANTHROPIC_API_KEY'}${s.sem_chaves ? ' · <strong>sem chaves de Meta/Google</strong> (modo demonstração)' : ''}</p>
    ${(p.erros || []).length ? `<p class="mini desce">Último erro: ${esc(p.erros[0].erro)}</p>` : ''}`;
}

const NOME_STATUS_FILA = { pendente: 'na fila', enviado: 'enviado', falhou: 'falhou', cancelado: 'cancelado', pulado: 'pulado' };
async function carregarStatusWhatsapp(fresco = false) {
  const alvo = $('#bloco-whatsapp');
  alvo.innerHTML = '<p class="mini">Conferindo o canal…</p>';
  try {
    const s = await api(`/api/whatsapp/status${fresco ? '?fresco=1' : ''}`);
    const c = s.canal || {}, f = s.fila || {}, por = f.por_status || {};
    alvo.innerHTML = `
      <div class="estado-linha"><span class="pilula ${c.conectado ? 'on' : 'off'}">${c.conectado ? 'no ar' : 'com problema'}</span>
        <span>WhatsApp da oficina (pelo Comunicar)</span>
        ${c.erro ? `<span class="mini desce">${esc(c.erro)}</span>` : ''}</div>
      <div class="estado-linha"><span class="pilula ${f.erro ? 'off' : por.pendente ? 'meio' : 'on'}">${f.erro ? 'sem leitura' : `${int(por.pendente || 0)} na fila`}</span>
        <span>Mensagens deste painel: ${f.erro ? esc(f.erro) : `${int(por.enviado || 0)} enviada(s) · ${int(por.falhou || 0)} falhou`}${f.ultimo_enviado_em ? ` · última entrega ${esc(dataHora(f.ultimo_enviado_em))}` : ''}</span>
        ${f.ultima_falha ? `<span class="mini desce">última falha: ${esc(f.ultima_falha.erro || '')}</span>` : ''}</div>
      <p class="mini">${s.pronto ? 'Pronto: o que entrar na fila sai no próximo ciclo do carteiro (a cada 15 min, 8h–21h).' : 'Enquanto o canal estiver com problema, as mensagens ficam guardadas na fila e saem quando voltar.'} Conferido ${esc(dataHora(s.conferido_em))}.</p>`;
    const fila = $('#bloco-fila');
    const recentes = (f.recentes || []).slice(0, 6);
    fila.innerHTML = recentes.length ? `<details class="guia"><summary>Últimas mensagens que este painel pôs na fila (${recentes.length})</summary>
      <div class="rolar" tabindex="0" role="region" aria-label="Fila do Comunicar"><table><thead><tr><th>Quando</th><th>Para</th><th>Situação</th><th>Detalhe</th></tr></thead>
      <tbody>${recentes.map(e => `<tr><td>${esc(dataHora(e.created_at))}</td><td>${esc(fmtTel(e.telefone))}</td>
        <td><span class="pilula ${e.status === 'enviado' ? 'on' : e.status === 'falhou' ? 'off' : 'meio'}">${esc(NOME_STATUS_FILA[e.status] || e.status)}</span></td>
        <td class="mini">${esc(e.erro || (e.chave || '').replace(/:\d{12,15}$/, '') || '')}</td></tr>`).join('')}</tbody></table></div></details>` : '';
  } catch (e) {
    alvo.innerHTML = `<p class="mini desce">${esc(e.message)}</p>`;
  }
}

/* ---------------- ligações ---------------- */

function ligarEventos() {
  ligarResultados();
  ligarConexoes();
  ligarOperacao();
  $('#filtro-severidade').addEventListener('change', () => carregarAlertas().catch(e => aviso(e.message, true)));
  $('#btn-csv-alertas').addEventListener('click', e => ocupado(e.currentTarget, async () => {
    const sev = $('#filtro-severidade').value;
    try { await baixarCSV(`/api/alertas.csv?limite=500${sev ? `&severidade=${sev}` : ''}`, 'alertas.csv'); aviso(`CSV dos alertas baixado${sev ? ' (só ' + sev + ')' : ''}.`); }
    catch (erro) { aviso(erro.message, true); }
  }));
  // "Criar dados de demonstração" dentro de qualquer estado vazio (modo sem chaves).
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-demo-criar]');
    if (b) ocupado(b, async () => {
      try { const r = await api('/api/demo', { method: 'POST', body: JSON.stringify({ dias: 45 }) }); aviso(`Demonstração criada: ${r.linhas} linhas em ${r.dias} dias (marcadas como demo).`); await recarregarAbaAtual(); await carregarSaude(); }
      catch (erro) { aviso(erro.message, true); }
    });
  });
  $('#btn-leitura').addEventListener('click', pedirLeitura);
  $('#btn-tema').addEventListener('click', () => aplicarTema(temaAtual() === 'claro' ? 'escuro' : 'claro', true));
  $$('.nav-item').forEach(b => b.addEventListener('click', () => trocarAba(b.dataset.aba)));
  montarSeletorEco();

  $('#filtro-periodo').addEventListener('change', e => {
    estado.periodo = parseInt(e.target.value, 10);
    $('#subtitulo-aba').textContent = `Últimos ${estado.periodo} dias fechados`;
    try { localStorage.setItem('ads-periodo', String(estado.periodo)); } catch {}
    recarregarAbaAtual();
  });
  // Rodada 5: o período escolhido fica lembrado neste navegador.
  try {
    const lembrado = parseInt(localStorage.getItem('ads-periodo') || '', 10);
    if ([7, 14, 30, 90].includes(lembrado)) { estado.periodo = lembrado; $('#filtro-periodo').value = String(lembrado); }
  } catch {}
  $('#filtro-plataforma').addEventListener('change', e => {
    estado.plataforma = e.target.value;
    recarregarAbaAtual();
  });
  $('#ordenar-campanhas').addEventListener('change', () => carregarRanking('campanha'));

  $('#btn-sync').addEventListener('click', e => ocupado(e.currentTarget, async () => {
    // Modo sem chaves: não adianta bater nas plataformas — diz o que falta e onde.
    if (estado.semChaves) { aviso('Sem as chaves da Meta e do Google ainda: cole em Ajustes → Conexões. Os números na tela são de demonstração.', true); trocarAba('ajustes'); return; }
    try {
      const r = await api('/api/sync', { method: 'POST', body: JSON.stringify({ dias: 7 }) });
      const linhas = Object.values(r.plataformas || {}).reduce((s, p) => s + (p.linhas || 0), 0);
      aviso(r.erros.length ? `Sync parcial: ${r.erros.join(' · ')}` : `Atualizado — ${linhas} linhas.`, r.erros.length > 0);
      await recarregarAbaAtual();
    } catch (e) { aviso(e.message, true); }
  }));

  $('#btn-testar-radar').addEventListener('click', e => ocupado(e.currentTarget, async () => {
    try {
      // Simulação: mostra o que dispararia, sem mandar WhatsApp, sem cooldown
      // e sem gravar nada no histórico.
      const r = await api('/api/radar', { method: 'POST', body: JSON.stringify({ enviar: false, ignorar_cooldown: true }) });
      aviso(`${r.disparados} alerta(s) dispararam de ${r.avaliadas} regra(s) + checagens do CRM. Nada foi enviado nem gravado.${r.erro_crm ? ` (CRM indisponível: ${r.erro_crm})` : ''}`);
      mostrarSimulacao(r.alertas);
    } catch (e) { aviso(e.message, true); }
  }));

  $('#btn-marcar-lidos').addEventListener('click', e => ocupado(e.currentTarget, async () => {
    try {
      const lista = await api('/api/alertas?nao_lidos=1&limite=200');
      await api('/api/alertas/lidos', { method: 'POST', body: JSON.stringify({ ids: lista.map(a => a.id) }) });
      await carregarAlertas();
    } catch (e) { aviso(e.message, true); }
  }));

  $('#btn-nova-regra').addEventListener('click', () => abrirRegra(null));
  $('#form-regra').addEventListener('submit', salvarRegra);
  $('#btn-cancelar-regra').addEventListener('click', () => $('#modal-regra').close());
  // Rodada 5: duplicar = mesma regra sem id, nome com "(cópia)"; salva como nova.
  $('#btn-duplicar-regra').addEventListener('click', () => {
    $('#regra-id').value = '';
    $('#regra-nome').value = `${$('#regra-nome').value} (cópia)`.slice(0, 80);
    $('#titulo-regra').textContent = 'Nova regra (cópia)';
    $('#btn-apagar-regra').hidden = true; $('#btn-duplicar-regra').hidden = true;
    $('#regra-nome').focus(); $('#regra-nome').select();
  });
  $('#btn-apagar-regra').addEventListener('click', async () => {
    const id = $('#regra-id').value;
    if (!id || !confirm('Apagar esta regra?')) return;
    try {
      await api(`/api/regras?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      $('#modal-regra').close();
      await carregarRegras();
      aviso('Regra apagada.');
    } catch (e) { aviso(e.message, true); }
  });

  $('#btn-previa').addEventListener('click', e => ocupado(e.currentTarget, async () => {
    try {
      const r = await api('/api/relatorio', { method: 'POST', body: JSON.stringify({ enviar: false }) });
      $('#previa-relatorio').textContent = r.texto;
      $('#previa-relatorio').hidden = false;
      $('#btn-copiar-relatorio').hidden = false;
      if (r.erro) aviso(r.erro, true);
    } catch (e) { aviso(e.message, true); }
  }));

  $('#btn-enviar-relatorio').addEventListener('click', e => ocupado(e.currentTarget, async () => {
    if (!confirm('Enviar o relatório de ontem no WhatsApp para os números cadastrados?')) return;
    try {
      const r = await api('/api/relatorio', { method: 'POST', body: JSON.stringify({ enviar: true }) });
      $('#previa-relatorio').textContent = r.texto;
      $('#previa-relatorio').hidden = false;
      aviso(r.enviado_em ? 'Relatório na fila do Comunicar: sai no próximo ciclo do carteiro (8h–21h).' : `Não enviado: ${r.motivo_sem_envio || r.erro || 'motivo desconhecido'}`, !r.enviado_em);
      await carregarRelatorios();
    } catch (e) { aviso(e.message, true); }
  }));

  $('#form-config').addEventListener('submit', salvarConfig);
  // Rodada 5: copiar o texto do relatório para mandar à mão enquanto o WhatsApp da oficina está fora.
  $('#btn-copiar-relatorio').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#previa-relatorio').textContent); aviso('Relatório copiado: cole no WhatsApp.'); }
    catch { aviso('Não deu para copiar aqui. Selecione o texto e copie à mão.', true); }
  });
  // Quantos números a tela reconhece no campo de destinos (antes de salvar).
  $('#cfg-destinos').addEventListener('input', () => {
    const n = $('#cfg-destinos').value.split(',').map(s => s.replace(/\D/g, '')).filter(d => d.length >= 10 && d.length <= 13).length;
    $('#cfg-destinos-conta').textContent = $('#cfg-destinos').value.trim() ? `${n} número(s) reconhecido(s)` : '';
  });

  $('#btn-testar-conexoes').addEventListener('click', e => ocupado(e.currentTarget, async () => {
    try {
      const r = await api('/api/testar-conexoes', { method: 'POST' });
      $('#resultado-conexoes').innerHTML = r.map(cartaoTeste).join('');
      aviso(r.every(x => x.ok) ? 'Meta e Google respondendo.' : 'Alguma conexão precisa de atenção — veja abaixo.', !r.every(x => x.ok));
    } catch (e) { aviso(e.message, true); }
  }));

  $('#btn-status-whatsapp').addEventListener('click', e => ocupado(e.currentTarget, () => carregarStatusWhatsapp(true)));
  $('#btn-testar-whatsapp').addEventListener('click', e => ocupado(e.currentTarget, async () => {
    const destinos = estado.cfg?.whatsapp_destinos || [];
    if (!destinos.length) { aviso('Cadastre ao menos um número em “Avisos no WhatsApp” e salve antes de testar.', true); return; }
    if (!confirm(`Enviar uma mensagem de teste para ${destinos.map(fmtTel).join(', ')}?`)) return;
    try {
      const r = await api('/api/whatsapp/testar', { method: 'POST' });
      const falhas = (r.envio || []).filter(x => !x.ok);
      aviso(r.ok ? 'Teste na fila do Comunicar: chega no próximo ciclo do carteiro (a cada 15 min, 8h–21h).'
        : `Não entrou na fila: ${falhas[0]?.erro || 'motivo desconhecido'}`, !r.ok);
      await carregarStatusWhatsapp(true);
    } catch (e) { aviso(e.message, true); }
  }));

  $('#btn-demo').addEventListener('click', e => ocupado(e.currentTarget, async () => {
    try {
      const r = await api('/api/demo', { method: 'POST', body: JSON.stringify({ dias: 45 }) });
      aviso(`Demonstração criada: ${r.linhas} linhas em ${r.dias} dias.`);
      await recarregarAbaAtual();
    } catch (e) { aviso(e.message, true); }
  }));

  $('#btn-limpar-demo').addEventListener('click', e => ocupado(e.currentTarget, async () => {
    if (!confirm('Apagar todos os dados de demonstração? Os dados reais não são tocados.')) return;
    try {
      await api('/api/demo', { method: 'POST', body: JSON.stringify({ limpar: true }) });
      aviso('Demonstração removida.');
      await recarregarAbaAtual();
    } catch (e) { aviso(e.message, true); }
  }));
}

async function recarregarAbaAtual() {
  try {
    if (estado.aba === 'painel') await carregarPainel();
    else if (estado.aba === 'leads') await carregarLeads();
    else if (estado.aba === 'resultados') await carregarResultados();
    else if (estado.aba === 'campanhas') await carregarRanking('campanha');
    else if (estado.aba === 'criativos') await carregarRanking('anuncio');
    else if (estado.aba === 'radar') { await carregarAlertas(); await carregarRegras(); }
    else if (estado.aba === 'relatorios') await carregarRelatorios();
    else if (estado.aba === 'ajustes') { await carregarIntegracoes(); await carregarSaude(); await carregarStatusWhatsapp(); }
  } catch (e) { aviso(e.message, true); }
}

/* ---------------- Resultados CRM ----------------
   Do anúncio à venda: leads, conversas, agendamentos e vendas da coorte
   do período. Falha de leitura nunca vira "zero vendas"; venda sem valor
   pago nunca vira "R$ 0 de receita". */

let consultaCRM = 0, ultimoCRM = null;
const paramsCRM = () => {
  const p = params();
  if (estado.datasCRM) { p.delete('dias'); p.set('de', estado.datasCRM.de); p.set('ate', estado.datasCRM.ate); }
  return p;
};
const nomeCanal = c => (c === 'meta' ? 'Meta' : c === 'google' ? 'Google' : c === 'todos' ? 'Todos' : String(c || ''));

/* Receita honesta: null + venda = "sem valor lançado"; parcial ganha asterisco. */
function receitaTxt(g) {
  if (g.receita_desconhecida) return '<span class="sem-valor" title="Vendas concluídas sem valor pago no CRM">sem valor lançado</span>';
  if (g.receita_parcial) return `${brl(g.receita)}<span class="sem-valor" title="${int(g.sem_valor)} venda(s) sem valor pago"> *</span>`;
  return brl(g.receita);
}

function tabelaResultados(linhas, campanhas = false) {
  if (!linhas.length) return vazio('Nada neste período.', false);
  const cols = ['Investido', 'Leads', 'Conversas', 'Agend.', 'Vendas', 'Receita paga', 'Custo/lead', 'Custo/agend.', 'Custo/venda', 'ROAS real'];
  return `<div class="rolar" tabindex="0" role="region" aria-label="Resultados ${campanhas ? 'por campanha' : 'por canal'}"><table>
    <thead><tr><th scope="col">${campanhas ? 'Campanha' : 'Canal'}</th>${cols.map(t => `<th scope="col" class="num">${t}</th>`).join('')}</tr></thead>
    <tbody>${linhas.map(g => `<tr>
      <th scope="row" class="nome-forte">${selo(g.canal)}${campanhas ? ` ${esc(g.campanha)}` : ''}${g.leads ? ` <button type="button" class="link mini" data-leads-res='${esc(JSON.stringify(campanhas ? { q: g.sem_utm ? '' : g.campanha, canal: g.canal } : { canal: g.canal }))}' title="Ver estes leads">ver</button>` : ''}</th>
      <td class="num">${brl(g.gasto)}</td><td class="num">${int(g.leads)}</td><td class="num">${int(g.conversas)}</td>
      <td class="num">${int(g.agendamentos)}</td><td class="num">${int(g.fechados)}</td><td class="num">${receitaTxt(g)}</td>
      <td class="num">${brl(g.cpl)}</td><td class="num">${brl(g.custo_agendamento)}</td><td class="num">${brl(g.custo_venda)}</td>
      <td class="num">${vezes(g.roas_real)}</td></tr>`).join('')}</tbody></table></div>`;
}

function desenharKPIsCRM(d) {
  const t = d.total, c = d.comparacao;
  const kpi = (rotulo, valor, chave, menorMelhor = false, extra = '') => {
    const v = c[chave]?.variacao;
    const cls = v == null || Math.abs(v) < 0.5 ? 'neutro' : (menorMelhor ? v < 0 : v > 0) ? 'sobe' : 'desce';
    const txt = v == null ? 'sem base anterior' : `${v > 0 ? '+' : ''}${v.toFixed(0)}% vs. anterior`;
    return `<div class="kpi ${extra}"><div class="rotulo">${rotulo}</div><div class="numero">${valor}</div><div class="var ${cls}">${txt}</div></div>`;
  };
  $('#crm-kpis').innerHTML = [
    kpi('Leads pagos', int(t.leads), 'leads'),
    kpi('Agendamentos', int(t.agendamentos), 'agendamentos'),
    kpi('Vendas', int(t.fechados), 'fechados'),
    kpi('Custo por lead', brl(t.cpl), 'cpl', true),
    kpi('Custo por agend.', brl(t.custo_agendamento), 'custo_agendamento', true,
      d.metas_cpa && t.custo_agendamento > d.metas_cpa ? 'destaque' : ''),
    kpi('Custo por venda', brl(t.custo_venda), 'custo_venda', true),
    t.receita_desconhecida
      ? `<div class="kpi destaque"><div class="rotulo">Receita paga</div><div class="numero sem-valor">sem valor</div><div class="var desce">${int(t.sem_valor)} venda(s) sem valor no CRM</div></div>`
      : kpi('Receita paga', `${brl(t.receita)}${t.receita_parcial ? '*' : ''}`, 'receita'),
  ].join('');
}

/* Funil em barras horizontais: largura = % do topo; texto diz a passagem. */
function desenharFunil(f, conversas = 0) {
  const topo = f[0]?.valor || 0;
  if (!topo) { $('#crm-funil').innerHTML = vazio('Nenhum lead pago no período.', false); return; }
  $('#crm-funil').innerHTML = `<ol class="funil" aria-label="Funil do anúncio à venda">${f.map((e, i) => `
    <li class="funil-etapa">
      <div class="funil-rotulo"><span>${esc(e.rotulo)}</span><strong>${int(e.valor)}</strong></div>
      <div class="funil-barra" aria-hidden="true"><span style="width:${Math.max(2, Math.min(100, e.do_topo ?? 0)).toFixed(1)}%"></span></div>
      <p class="mini">${i === 0 ? '100% dos leads' : `${e.taxa == null ? '—' : `${dec(e.taxa, 0)}% da etapa anterior`} · ${dec(e.do_topo, 0)}% do total`}</p>
    </li>`).join('')}</ol>
    <p class="mini">Conversaram no WhatsApp: <strong>${int(conversas)}</strong> de ${int(topo)} leads (${dec(conversas * 100 / topo, 0)}%). Quem agenda por telefone não aparece aqui.</p>`;
}

function desenharComparacao(d) {
  const linhas = [['leads', 'Leads', int, false], ['agendamentos', 'Agendamentos', int, false], ['fechados', 'Vendas', int, false],
    ['gasto', 'Investido', brl, null], ['cpl', 'Custo por lead', brl, true], ['custo_agendamento', 'Custo por agendamento', brl, true],
    ['custo_venda', 'Custo por venda', brl, true]];
  $('#crm-comparacao').innerHTML = `<p class="mini">${dataBR(d.periodo.de)} a ${dataBR(d.periodo.ate)} contra ${dataBR(d.periodo_anterior.de)} a ${dataBR(d.periodo_anterior.ate)}</p>
    <div class="rolar" tabindex="0" role="region" aria-label="Tabela (role para o lado para ver tudo)"><table><thead><tr><th scope="col">Métrica</th><th scope="col" class="num">Agora</th><th scope="col" class="num">Antes</th><th scope="col" class="num">Variação</th></tr></thead>
    <tbody>${linhas.map(([k, nome, fmt, menor]) => {
      const c = d.comparacao[k] || {}, v = c.variacao;
      const cls = v == null || menor === null || Math.abs(v) < 0.5 ? 'neutro' : (menor ? v < 0 : v > 0) ? 'sobe' : 'desce';
      const seta = v == null ? '' : v > 0.5 ? ' ↑' : v < -0.5 ? ' ↓' : ' →';
      return `<tr><th scope="row">${nome}</th><td class="num">${fmt(c.atual)}</td><td class="num">${fmt(c.anterior)}</td>
        <td class="num ${cls}">${v == null ? '—' : `${v > 0 ? '+' : ''}${dec(v, 0)}%${seta}`}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

const ICONE_AVISO = { sem_valor: 'sev-alerta', sem_utm: 'sev-info', sem_lead: 'sev-alerta', custo_agendamento: 'sev-alerta', custo_venda: 'sev-critico' };
function desenharAvisosCRM(d) {
  const extra = [];
  if (d.nao_atribuidos) extra.push({ tipo: 'sem_utm', canal: 'todos', campanha: '(outros canais)', texto: `${int(d.nao_atribuidos)} lead(s) do período vieram de canais não pagos (WhatsApp direto, indicação, orgânico) e ficam fora desta conta.` });
  const lista = [...d.alertas, ...extra];
  $('#crm-alertas').innerHTML = lista.length ? lista.map(a => `<div class="alerta">
      <span class="bolha ${ICONE_AVISO[a.tipo] || 'sev-info'}" aria-hidden="true"></span>
      <div class="alerta-txt"><p><strong>${esc(nomeCanal(a.canal))} · ${esc(a.campanha)}</strong></p><p class="mini">${esc(a.texto)}</p></div></div>`).join('')
    : '<p class="mini">Nenhum aviso neste período.</p>';
}

async function carregarResultados() {
  const consulta = ++consultaCRM;
  const status = $('#crm-estado');
  status.textContent = 'Lendo leads, conversas e agendamentos do CRM…';
  $('#aba-resultados').setAttribute('aria-busy', 'true');
  $('#crm-exportar').disabled = true; ultimoCRM = null;
  try {
    const p = paramsCRM(), d = await api(`/api/resultados?${p}`);
    if (consulta !== consultaCRM) return;
    ultimoCRM = { dados: d, params: p.toString() };
    d.metas_cpa = estado.cfg?.cpa_alvo || null;
    if (!estado.datasCRM) { $('#crm-de').value = d.periodo.de; $('#crm-ate').value = d.periodo.ate; }
    status.textContent = `${dataBR(d.periodo.de)} a ${dataBR(d.periodo.ate)} · conferido ${dataHora(d.atualizado_em)} · ${d.criterio}`;
    const demo = $('#crm-aviso-demo');
    demo.hidden = !d.aviso_demo;
    demo.innerHTML = d.aviso_demo ? `<span class="faixa-icone" aria-hidden="true">ℹ️</span><div>${esc(d.aviso_demo)}</div>` : '';
    desenharKPIsCRM(d);
    desenharFunil(d.funil, d.total.conversas);
    desenharComparacao(d);
    $('#crm-canais').innerHTML = tabelaResultados(d.canais);
    $('#crm-campanhas').innerHTML = tabelaResultados(d.campanhas, true)
      + (d.campanhas.some(g => g.receita_parcial) ? '<p class="mini">* receita parcial: parte das vendas está sem valor pago no CRM.</p>' : '');
    desenharAvisosCRM(d);
    desenharCiclo(d.ciclo);
    $('#crm-equipe').innerHTML = tabelaEquipe(d.equipe);
    // Rodada 5: "ver" em cada canal/campanha e no "sem responsável" abre a aba Leads já filtrada, no mesmo período.
    const quandoRes = estado.datasCRM ? 'topo' : 'topo';
    $$('#aba-resultados [data-leads-res]').forEach(b => b.addEventListener('click', () => abrirLeadsCom({ ...JSON.parse(b.dataset.leadsRes), quando: quandoRes })));
    $$('#crm-ciclo [data-leads-etapa]').forEach(b => b.addEventListener('click', () => abrirLeadsCom({ canal: 'pagos', etapa: b.dataset.leadsEtapa, quando: quandoRes })));
    $('#crm-equipe [data-leads-sem-resp]')?.addEventListener('click', () => abrirLeadsCom({ canal: 'pagos', semResp: true, quando: quandoRes }));
    $('#crm-exportar').disabled = false;
    carregarMetaCRM();
  } catch (e) {
    if (consulta !== consultaCRM) return;
    status.textContent = 'Resultados indisponíveis agora.';
    for (const id of ['#crm-kpis', '#crm-funil', '#crm-comparacao', '#crm-canais', '#crm-campanhas', '#crm-alertas', '#crm-equipe', '#crm-ciclo']) $(id).innerHTML = '';
    $('#crm-funil').innerHTML = `<p class="recado" role="alert">${esc(e.message)}</p><button class="btn btn-fantasma btn-mini" type="button" id="crm-tentar">Tentar de novo</button>`;
    $('#crm-tentar').addEventListener('click', carregarResultados);
  } finally { if (consulta === consultaCRM) $('#aba-resultados').removeAttribute('aria-busy'); }
}

/* Quem converte os leads de anúncio (leads.responsavel_id). */
function tabelaEquipe(lista) {
  if (lista == null) return '<p class="mini">Não foi possível ler a equipe agora.</p>';
  if (!lista.length) return '<p class="mini">Nenhum lead pago no período.</p>';
  const maxConv = Math.max(...lista.filter(l => !l.sem_responsavel && l.leads >= 3).map(l => l.conversao || 0), 0);
  return `<div class="rolar" tabindex="0" role="region" aria-label="Resultados por responsável"><table>
    <thead><tr><th scope="col">Responsável</th>${['Leads', 'Agendaram', 'Vieram', 'Vendas', 'Conversão', 'Perdidos', 'Receita'].map(t => `<th scope="col" class="num">${t}</th>`).join('')}</tr></thead>
    <tbody>${lista.map(l => `<tr class="${l.sem_responsavel ? 'apagado' : ''}">
      <th scope="row">${esc(l.nome)}${l.inativo ? ' <span class="mini">(desativado)</span>' : ''}${!l.sem_responsavel && maxConv > 0 && l.conversao === maxConv && l.leads >= 3 ? ' <span class="selo selo-ok">melhor conversão</span>' : ''}</th>
      <td class="num">${int(l.leads)} <span class="mini">${l.meta ? `M ${int(l.meta)}` : ''}${l.meta && l.google ? ' · ' : ''}${l.google ? `G ${int(l.google)}` : ''}</span></td>
      <td class="num">${int(l.agendamentos)} <span class="mini">${pct(l.tx_agendamento)}</span></td>
      <td class="num">${int(l.compareceram)}</td>
      <td class="num"><strong>${int(l.fechados)}</strong></td>
      <td class="num">${pct(l.conversao)}</td>
      <td class="num">${int(l.perdidos)}</td>
      <td class="num">${l.receita == null ? '<span class="mini">sem valor lançado</span>' : brl(l.receita) + (l.sem_valor ? '*' : '')}</td></tr>`).join('')}</tbody></table></div>
    ${lista.some(l => l.sem_responsavel) ? '<p class="mini">“Sem responsável”: lead que ninguém pegou no CRM. <button type="button" class="link" data-leads-sem-resp>Ver quais são</button> e distribua lá.</p>' : ''}`;
}

/* Metas mensais da loja (tabela metas, perfil_id nulo): leads, agendamentos e vendas. */
function textoMeta(p) {
  if (p.situacao === 'batida') return 'Meta batida.';
  if (p.situacao === 'no_ritmo') return `No ritmo: projeção de ${int(p.projecao)}.`;
  return `Abaixo do ritmo: projeção de ${int(p.projecao)}, faltam ${int(p.faltam)}.`;
}
function barraMeta(rotulo, p) {
  return `<div class="meta-linha"><div class="funil-rotulo"><span>${rotulo}</span><strong>${int(p.feito)} de ${int(p.meta)}</strong></div>
    <div class="barra ${p.situacao !== 'abaixo' ? 'ok' : ''}" role="progressbar" aria-label="${rotulo}: ${int(p.feito)} de ${int(p.meta)}" aria-valuemin="0" aria-valuemax="${p.meta}" aria-valuenow="${Math.min(p.meta, p.feito)}"><span style="width:${Number(p.pct).toFixed(1)}%"></span></div>
    <p class="mini">${textoMeta(p)}</p></div>`;
}
/* Metas que ficaram no navegador (rodada 2) sobem para o banco uma vez. */
function metasAntigasDoNavegador() {
  const ler = k => { try { const n = Number(localStorage.getItem(k)); return Number.isInteger(n) && n > 0 && n <= 100000 ? n : null; } catch { return null; } };
  return { vendas: ler('ads-meta-vendas'), agendamentos: ler('ads-meta-agendamentos') };
}
let consultaMeta = 0;
async function carregarMetaCRM() {
  const alvo = $('#crm-progresso');
  const n = ++consultaMeta;
  try {
    let d = await api('/api/metas');
    const antigas = metasAntigasDoNavegador();
    if (!d.meta && (antigas.vendas || antigas.agendamentos)) {
      await api('/api/metas', { method: 'POST', body: JSON.stringify({ mes: d.mes, ...antigas }) });
      try { localStorage.removeItem('ads-meta-vendas'); localStorage.removeItem('ads-meta-agendamentos'); } catch {}
      d = await api('/api/metas');
    }
    if (n !== consultaMeta) return;
    $('#crm-meta-leads').value = d.meta?.leads || '';
    $('#crm-meta-ag').value = d.meta?.agendamentos || '';
    $('#crm-meta').value = d.meta?.vendas || '';
    const sugestao = estado.cfg?.orcamento_mensal && estado.cfg?.cpa_alvo ? Math.floor(estado.cfg.orcamento_mensal / estado.cfg.cpa_alvo) : null;
    const p = d.progresso || {};
    if (!p.leads && !p.agendamentos && !p.vendas) {
      alvo.innerHTML = `<p class="mini">Defina uma meta para acompanhar o mês (até agora: ${int(d.feito?.leads)} lead(s), ${int(d.feito?.agendamentos)} agendamento(s), ${int(d.feito?.vendas)} venda(s)).${sugestao ? ` Pelo orçamento e o CPA alvo de Ajustes, dá para mirar em ~${int(sugestao)} agendamentos.` : ''}</p>`;
      return;
    }
    alvo.innerHTML = (p.leads ? barraMeta('Leads', p.leads) : '')
      + (p.agendamentos ? barraMeta('Agendamentos', p.agendamentos) : '')
      + (p.vendas ? barraMeta('Vendas', p.vendas) : '')
      + `<p class="mini">Dia ${d.dia} de ${d.dias_mes}. Todos os canais pagos.${d.meta?.updated_at ? ` Meta atualizada ${esc(dataHora(d.meta.updated_at))}.` : ''}</p>`;
  } catch (e) { if (n === consultaMeta) alvo.innerHTML = `<p class="mini desce">Não foi possível conferir as metas agora. ${esc(e.message)}</p>`; }
}

/* Baixa um CSV autenticado (o navegador não manda o token num link). */
async function baixarCSV(rota, nome) {
  await renovarToken();
  const r = await fetch(rota, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401 || r.status === 403) { const c = await r.clone().json().catch(() => ({})); if (r.status === 401 || c.codigo) tratarCodigo(r.status, c); }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'Não foi possível exportar.');
  const disp = r.headers.get('Content-Disposition') || '';
  const m = /filename="([^"]+)"/.exec(disp);
  const url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
  a.href = url; a.download = m ? m[1] : nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ligarResultados() {
  $('#form-periodo-crm').addEventListener('submit', e => {
    e.preventDefault();
    const de = $('#crm-de').value, ate = $('#crm-ate').value;
    if (!de || !ate) { aviso('Escolha as duas datas.', true); (de ? $('#crm-ate') : $('#crm-de')).focus(); return; }
    if (de > ate) { aviso('O início precisa ser antes do fim.', true); $('#crm-de').focus(); return; }
    estado.datasCRM = { de, ate }; carregarResultados();
  });
  $('#crm-reset').addEventListener('click', () => { estado.datasCRM = null; carregarResultados(); });
  $('#form-meta-crm').addEventListener('submit', e => {
    e.preventDefault();
    const ler = sel => { const v = $(sel).value.trim(); return v === '' ? null : Number(v); };
    const leads = ler('#crm-meta-leads'), vendas = ler('#crm-meta'), ag = ler('#crm-meta-ag');
    for (const [v, sel] of [[leads, '#crm-meta-leads'], [vendas, '#crm-meta'], [ag, '#crm-meta-ag']]) {
      if (v != null && (!Number.isInteger(v) || v < 1 || v > 100000)) { aviso('Use metas inteiras de 1 a 100 mil.', true); $(sel).focus(); return; }
    }
    const mes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7);
    ocupado(e.submitter || $('#form-meta-crm [type="submit"]'), async () => {
      try {
        await api('/api/metas', { method: 'POST', body: JSON.stringify({ mes, leads, agendamentos: ag, vendas }) });
        aviso('Metas salvas para a equipe.'); carregarMetaCRM();
      } catch (erro) { aviso(erro.message, true); }
    });
  });
  $('#crm-limpar-meta').addEventListener('click', async () => {
    const mes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7);
    try { await api('/api/metas', { method: 'POST', body: JSON.stringify({ mes, leads: null, agendamentos: null, vendas: null }) }); carregarMetaCRM(); }
    catch (erro) { aviso(erro.message, true); }
  });
  $('#btn-semanal').addEventListener('click', e => ocupado(e.currentTarget, async () => {
    try {
      const r = await api('/api/semanal', { method: 'POST' });
      $('#semanal-estado').textContent = `${r.titulo} — ${r.corpo} (mandado para o seu sino)`;
    } catch (erro) { aviso(erro.message, true); }
  }));
  $('#crm-exportar').addEventListener('click', e => ocupado(e.currentTarget, async () => {
    if (!ultimoCRM) return;
    try { await baixarCSV(`/api/resultados.csv?${ultimoCRM.params}`, 'resultados-crm.csv'); aviso('CSV baixado — só números, sem dados de clientes.'); }
    catch (erro) { aviso(erro.message, true); }
  }));
  $('#ciclo-exportar').addEventListener('click', e => ocupado(e.currentTarget, async () => {
    if (!ultimoCRM) return;
    try { await baixarCSV(`/api/ciclo.csv?${ultimoCRM.params}`, 'ciclo-anuncio-ao-carro.csv'); aviso('CSV do ciclo baixado — só números, sem dados de clientes.'); }
    catch (erro) { aviso(erro.message, true); }
  }));
  $$('[data-csv]').forEach(b => b.addEventListener('click', e => ocupado(e.currentTarget, async () => {
    const p = params(); p.set('nivel', b.dataset.csv);
    try { await baixarCSV(`/api/ranking.csv?${p}`, `${b.dataset.csv}.csv`); aviso('CSV baixado.'); }
    catch (erro) { aviso(erro.message, true); }
  })));
}

/* ---------------- leitura da semana (IA) ---------------- */

function desenharLeitura(l) {
  $('#bloco-leitura').innerHTML = `<blockquote class="leitura-texto">${esc(l.texto)}</blockquote>
    <p class="mini">${esc(dataHora(l.criado_em))}${l.modelo ? ` · ${esc(l.modelo)}` : ''}${l.demonstracao ? ' · sobre dados de demonstração' : ''} · registrada no histórico da IA</p>`;
}
async function carregarUltimaLeitura() {
  try { const [l] = await api('/api/ia/leituras'); if (l) desenharLeitura(l); } catch {}
}
async function pedirLeitura(e) {
  const btn = e.currentTarget;
  await ocupado(btn, async () => {
    $('#bloco-leitura').setAttribute('aria-busy', 'true');
    $('#bloco-leitura').insertAdjacentHTML('afterbegin', '<p class="mini" id="leitura-pensando">Lendo a semana…</p>');
    try { desenharLeitura(await api('/api/ia/leitura', { method: 'POST' })); }
    catch (erro) { $('#leitura-pensando')?.remove(); aviso(erro.message, true); }
    finally { $('#bloco-leitura').removeAttribute('aria-busy'); }
  });
}

/* ---------------- conexões: testar e salvar credenciais ---------------- */

function cartaoTeste(r) {
  return `<div class="teste-con ${r.ok ? 'ok' : 'falha'}">
    <p><span class="pilula ${r.ok ? 'on' : 'off'}">${r.ok ? 'ok' : 'falhou'}</span> <strong>${esc(nomeCanal(r.canal))} · ${esc(r.titulo || (r.ok ? 'Conexão funcionando' : 'Falhou'))}</strong></p>
    <p class="mini">${esc(r.fazer || '')}</p>
    ${!r.ok && r.erro ? `<details><summary class="mini">Mensagem técnica</summary><p class="mini"><code>${esc(r.erro)}</code></p></details>` : ''}</div>`;
}
const dadosCred = form => Object.fromEntries([...form.querySelectorAll('input[name]')].map(i => [i.name, i.value.trim()]));
function ligarConexoes() {
  $$('.form-cred').forEach(form => {
    const canal = form.dataset.canal, saida = form.querySelector('.resultado-cred');
    form.querySelector('[data-acao="testar"]').addEventListener('click', e => ocupado(e.currentTarget, async () => {
      saida.innerHTML = '<p class="mini">Testando…</p>';
      try { saida.innerHTML = cartaoTeste(await api('/api/integracoes/testar', { method: 'POST', body: JSON.stringify({ canal, ...dadosCred(form) }) })); }
      catch (erro) { saida.innerHTML = `<p class="recado" role="alert">${esc(erro.message)}</p>`; }
    }));
    form.addEventListener('submit', e => {
      e.preventDefault();
      ocupado(form.querySelector('[type="submit"]'), async () => {
        try {
          await api('/api/integracoes', { method: 'POST', body: JSON.stringify({ canal, ...dadosCred(form) }) });
          form.querySelectorAll('input[type="password"]').forEach(i => { i.value = ''; });
          saida.innerHTML = '<p class="mini sobe">Salvo. Clique em “Testar conexões” para conferir.</p>';
          await carregarIntegracoes();
        } catch (erro) { saida.innerHTML = `<p class="recado" role="alert">${esc(erro.message)}</p>`; }
      });
    });
  });
}

/* A partida fica em conta.js (login, perfil, sino e tarefas), carregado depois deste arquivo. */
