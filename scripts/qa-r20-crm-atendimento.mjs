// Roteiro de navegador da RODADA 20 (26/11/2026): CRM + Atendimento + Orçador num app só.
// SÓ servidores de mentira (scripts/mock-central-r20.mjs): nenhum WhatsApp, nenhum banco real. Os dois service workers
// e os cabeçalhos de segurança (CSP, X-Frame-Options) são os de verdade; o Supabase do Orçador é respondido pelo Chrome.
//
//   node scripts/qa-r20-crm-atendimento.mjs            → provas (ok / FALHOU) e capturas em qa-out/r20/
//   node scripts/qa-r20-crm-atendimento.mjs --rapido   → só 1440 escuro
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { subirCentralR20, SUPA_FALSO } from './mock-central-r20.mjs';

const require = createRequire(import.meta.url);
const MONO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const puppeteer = require(process.env.PUPPETEER_CORE || resolve(MONO, '../indycar-ferramentas/node_modules/puppeteer-core'));
const SAIDA = join(MONO, 'qa-out', 'r20');
mkdirSync(SAIDA, { recursive: true });
const RAPIDO = process.argv.includes('--rapido');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (fn, ms = 12000, passo = 200) => { const fim = Date.now() + ms; for (;;) { let v = null; try { v = await fn(); } catch { v = null; } if (v) return v; if (Date.now() > fim) return null; await espera(passo); } };

const central = await subirCentralR20({ porta: Number(process.env.PORT) || 3730 });
const BASE = central.base;
const CAMILA = { nome: 'Camila Rodrigues', tel: '12996830111' }, JOSE = 'c0000000-0000-4000-8000-000000000002', RENATA_TEL = '12977776666';
const cabCrm = { 'Content-Type': 'application/json', Authorization: 'Bearer mock', Cookie: 'mock_papel=gestor' };
const leadsDoCrm = async () => (await fetch(`${BASE}/crm/api/leads`, { headers: cabCrm })).json();
const daCamila = async () => (await leadsDoCrm()).filter((l) => String(l.telefone).replace(/\D/g, '').endsWith(CAMILA.tel));
/* o cartão da Camila no funil do CRM de mentira (o Atendimento de mentira já tem a conversa e o cliente dela) */
await fetch(`${BASE}/crm/api/leads`, { method: 'POST', headers: cabCrm, body: JSON.stringify({ nome: CAMILA.nome, telefone: CAMILA.tel, status: 'contato', servico: 'Alinhamento 3D', carro_modelo: 'Corolla 2020', origem: 'meta', responsavel_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001' }) });

const resultados = [];
const conferir = (nome, ok, detalhe = '') => { resultados.push({ nome, ok: !!ok, detalhe }); console.log(`${ok ? 'ok     ' : 'FALHOU '} ${nome}${detalhe ? '  (' + String(detalhe).slice(0, 220) + ')' : ''}`); };

/* ---------------- Supabase falso do Orçador (o build de verdade pede sessão e três tabelas) ---------------- */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ADMIN = '11111111-1111-4111-8111-111111111111';
const perfilOrc = { id: ADMIN, nome: 'Equipe de teste', email: 'teste@exemplo.invalid', papel: 'admin', ativo: true, apps: ['atendimento', 'crm', 'agenda', 'comunicar', 'orcador'], cargo: null, telefone: null, avatar_cor: '#3b82f6', precisa_trocar_senha: false, preferencias: {}, ultimo_acesso_em: new Date().toISOString() };
const usuario = { id: ADMIN, email: perfilOrc.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z', factors: [] };
const sessao = { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ADMIN, aal: 'aal1', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7200 })}.falsa`, refresh_token: 'renovar-falso', token_type: 'bearer', expires_in: 7200, expires_at: Math.floor(Date.now() / 1000) + 7200, user: usuario };
const tabelas = { perfis: [perfilOrc], orc_categorias: [{ id: 'oleo', nome: 'Óleo', margem_pct: null, ordem: 1 }],
  orc_regras_preco: [{ id: true, desconto_sem_aprovacao_pct: '5', desconto_a_vista_pct: '10', margem_padrao_pct: '40', modo_margem: 'sobre_custo', max_parcelas: 10, parcelas_sem_juros: 10, juros_mensal_pct: '0', parcela_minima: '100', validade_dias: 7 }] };

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 60000, args: ['--no-sandbox', '--disable-background-networking'] });

async function abrir({ papel = 'gestor', w = 1440, tema = 'escuro', caminho = null } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const erros = [], pedidos = [];
  page.on('pageerror', (e) => erros.push('erro: ' + String(e.message).slice(0, 200)));
  /* o Supabase de mentira do Orçador não tem WebSocket (o Chrome não deixa responder um): esse aviso é só do teste */
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('wss://supabase-falso')) erros.push('console: ' + m.text().slice(0, 160) + ' @ ' + String(m.location()?.url || '').slice(0, 90)); });
  page.on('dialog', (d) => d.accept());
  await page.setViewport({ width: w, height: w < 768 ? 812 : 900, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768 });
  await page.evaluateOnNewDocument((t, s) => { try { localStorage.setItem('indycar_tema', t); localStorage.setItem('sb-supabase-falso-auth-token', s); } catch { /* sem storage */ } }, tema, JSON.stringify(sessao));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith(BASE)) { if (req.method() !== 'GET') pedidos.push(req.method() + ' ' + new URL(url).pathname); return req.continue(); }
    if (url.startsWith('data:') || url.startsWith('blob:')) return req.continue();
    if (!url.startsWith(SUPA_FALSO)) return req.respond({ status: 204, body: '' });
    const u = new URL(url);
    const json = (corpo, status = 200, extra = {}) => req.respond({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'content-range', ...extra }, body: JSON.stringify(corpo) });
    if (req.method() === 'OPTIONS') return json({}, 200, { 'access-control-allow-methods': 'GET,POST,PATCH,DELETE' });
    if (u.pathname === '/auth/v1/user') return json(usuario);
    if (u.pathname.startsWith('/auth/v1/')) return json({});
    if (u.pathname.startsWith('/rest/v1/rpc/')) return json(null);
    if (u.pathname.startsWith('/rest/v1/')) {
      const linhas = tabelas[u.pathname.split('/').pop()] ?? [];
      if ((req.headers().accept ?? '').includes('vnd.pgrst.object')) return linhas.length ? json(linhas[0]) : json({ code: 'PGRST116', message: '0 rows' }, 406);
      return json(linhas, 200, { 'content-range': `0-${Math.max(0, linhas.length - 1)}/${linhas.length}` });
    }
    return json({ ok: true });
  });
  await page.goto(`${BASE}/crm/?papel=${papel}`, { waitUntil: 'domcontentloaded' });   // grava o papel no cookie do servidor de mentira
  if (caminho) await page.goto(BASE + caminho, { waitUntil: 'domcontentloaded' });
  return { page, erros, pedidos, ctx, w, tema, papel, cel: w < 768, rot: `[${papel} ${w} ${tema}]` };
}
const moldura = async (page, id) => { const h = await page.$('#' + id); return h ? h.contentFrame() : null; };
const foto = (s, nome) => s.page.screenshot({ path: join(SAIDA, `${nome}-${s.papel}-${s.w}-${s.tema}.png`) });
const irAba = async (s, v) => { await s.page.evaluate((x) => document.querySelector(`.ic-abas .nav-item[data-view="${x}"]`).click(), v); await espera(500); };
const semRolagem = (alvo) => alvo.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const toquesPequenos = (alvo, seletor) => alvo.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 43.5 || r.width < 43.5); }).map((e) => (e.id || e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)).slice(0, 6), seletor);
const pronto = (s) => ate(() => s.page.evaluate(() => typeof PERFIL !== 'undefined' && !!PERFIL && !!window.R20Tela && window.R20Tela.estado.entradaLida), 25000);

/* =====================================================================================================
   1) O dia a dia: funil, "Ver conversa", etapa com um toque, horário marcado na conversa, Conversas, Orçador
   ===================================================================================================== */
async function diaADia(w, tema, completo) {
  const s = await abrir({ papel: 'gestor', w, tema });
  const { page, rot } = s;
  conferir(`${rot} o app abre`, await pronto(s));
  await espera(1200);
  const topo = await page.evaluate(() => ({ nome: document.querySelector('.ic-topo .ic-nome').textContent.replace(/\s+/g, ' ').trim(), titulo: document.title,
    abas: [...document.querySelectorAll('.ic-abas .nav-item')].filter((b) => !b.hidden).map((b) => b.textContent.trim()),
    menu: [...document.querySelectorAll('#menuPerfil [role=menuitem]')].filter((b) => !b.hidden).map((b) => b.textContent.trim()) }));
  conferir(`${rot} topo "IndyCar CRM e Atendimento"`, topo.nome === 'IndyCar CRM e Atendimento' && /CRM e Atendimento/.test(topo.titulo), topo.nome);
  conferir(`${rot} abas: Hoje, Funil, Conversas, Clientes, Orçador (sem Contatos)`, topo.abas.join('|') === 'Hoje|Funil|Conversas|Clientes|Orçador', topo.abas.join('|'));
  conferir(`${rot} Painel, Lista de contatos e Ajustes do WhatsApp no menu da pessoa`, ['Painel', 'Lista de contatos', 'Ajustes do WhatsApp', 'Serviços'].every((x) => topo.menu.includes(x)), topo.menu.join('|'));
  await foto(s, '01-hoje');

  /* ---- Funil e "Ver conversa" ---- */
  await irAba(s, 'pipeline');
  await ate(() => page.evaluate(() => document.querySelectorAll('.kb-card').length > 5));
  const funil = await page.evaluate(() => ({ cartoes: document.querySelectorAll('.kb-card').length, botoes: document.querySelectorAll('.kb-card .kb-conversa').length }));
  conferir(`${rot} todo cartão do funil tem "Ver conversa"`, funil.cartoes > 5 && funil.botoes === funil.cartoes, `${funil.botoes} de ${funil.cartoes}`);
  await page.evaluate(() => { document.querySelector('#search').value = 'Camila'; document.querySelector('#search').dispatchEvent(new Event('input', { bubbles: true })); });
  await espera(600);
  await foto(s, '02-funil');
  const antes = await daCamila();
  await page.evaluate(() => document.querySelector('.kb-card .kb-conversa').click());
  const fr = await ate(() => moldura(page, 'r20MolduraPainel'));
  const noChat = await ate(() => fr.evaluate(() => !document.getElementById('telaApp').hidden && !document.getElementById('chat').hidden && document.getElementById('chatNome').textContent.trim()), 20000);
  conferir(`${rot} o painel abre a conversa do cliente sem sair do CRM`, noChat === CAMILA.nome && new URL(page.url()).pathname === '/crm/', String(noChat));
  const emb = await fr.evaluate(() => ({ classes: document.documentElement.className, topo: getComputedStyle(document.querySelector('.ic-topo')).display, lista: getComputedStyle(document.querySelector('.col-lista')).display,
    campo: !!document.getElementById('campoMensagem')?.offsetParent, login: document.getElementById('telaLogin').hidden, url: location.pathname + location.search }));
  conferir(`${rot} dentro do painel: sem topo, sem lista, sem tela de entrar, com o campo de responder`, emb.topo === 'none' && emb.lista === 'none' && emb.login && emb.campo && /embutido=1/.test(emb.url) && /painel=1/.test(emb.url), JSON.stringify(emb));
  const painel = await page.evaluate(() => { const p = document.getElementById('r20Painel').getBoundingClientRect(); return { nome: document.getElementById('r20PainelNome').textContent, largura: Math.round(p.width), topo: Math.round(p.top), atual: document.querySelector('#r20EtapaPainel .r20-et.atual')?.textContent, etapas: [...document.querySelectorAll('#r20EtapaPainel .r20-et')].map((b) => b.textContent) }; });
  conferir(`${rot} topo do painel: nome, etapa atual e as etapas reais do funil`, painel.nome === CAMILA.nome && painel.atual === 'Em contato' && painel.etapas.join('|') === 'Novo|Em contato|Orçamento|Agendado|Em serviço|Concluído|Perdido', JSON.stringify(painel));
  conferir(`${rot} ${s.cel ? 'no celular o painel ocupa a tela inteira' : 'no computador o painel fica ao lado do funil'}`, s.cel ? painel.largura === w && painel.topo === 0 : painel.largura === 480 && painel.topo > 40, `${painel.largura}px`);
  await foto(s, '03-painel-conversa');

  /* ---- etapa com um toque: a mesma rota do arrastar ---- */
  s.pedidos.length = 0;
  await page.evaluate(() => [...document.querySelectorAll('#r20EtapaPainel .r20-et')].find((b) => b.dataset.etapa === 'orcamento').click());
  const moveu = await ate(async () => (await daCamila())[0]?.status === 'orcamento');
  await ate(() => page.evaluate(() => document.querySelector('#r20EtapaPainel .r20-et.atual')?.textContent === 'Orçamento' && !document.getElementById('toastAcao').hidden), 6000);   // a tela pinta depois da resposta do servidor
  const depoisDeMover = await page.evaluate(() => ({ atual: document.querySelector('#r20EtapaPainel .r20-et.atual')?.textContent, coluna: document.querySelector('.kb-card')?.closest('.kb-col')?.dataset.etapa, toast: document.getElementById('toastTxt').textContent, desfazer: !document.getElementById('toastAcao').hidden }));
  conferir(`${rot} um toque em "Orçamento" move o cartão (mesma rota do funil, com Desfazer)`, moveu && depoisDeMover.atual === 'Orçamento' && depoisDeMover.coluna === 'orcamento' && depoisDeMover.desfazer && s.pedidos.some((p) => /^PATCH \/crm\/api\/leads\//.test(p)), JSON.stringify(depoisDeMover) + ' ' + s.pedidos.join(','));

  if (completo) {
    /* ---- horário marcado na conversa: o cartão vai para Agendado sozinho, sem cartão duplicado ---- */
    const enviosAntes = (await (await fetch(`${BASE}/atendimento/api/_envios`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()).envios.length;
    await fr.evaluate(() => document.getElementById('btnAgendar').click());
    await ate(() => fr.evaluate(() => document.getElementById('modalAgendarBg').classList.contains('aberto') && document.getElementById('agendarServico').options.length > 1));
    await fr.evaluate(() => {
      const f = document.getElementById('formAgendar'), s2 = document.getElementById('agendarServico');
      s2.value = [...s2.options].find((o) => o.value)?.value; s2.dispatchEvent(new Event('change', { bubbles: true }));
      const d = new Date(Date.now() + 3 * 864e5); if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      f.data.value = d.toISOString().slice(0, 10); f.hora.value = '09:00'; f.valor.value = '260';
      f.querySelector('button[type=submit]').click();
    });
    const agendou = await ate(async () => (await daCamila()).some((l) => l.status === 'agendado'), 15000);
    await espera(1500);
    const cam = await daCamila();
    const tela = await page.evaluate(() => ({ atual: document.querySelector('#r20EtapaPainel .r20-et.atual')?.textContent, coluna: document.querySelector('.kb-card')?.closest('.kb-col')?.dataset.etapa, cartoes: document.querySelectorAll('.kb-card').length }));
    conferir(`${rot} horário marcado pela conversa: o cartão vai para "Agendado" sozinho`, agendou && tela.atual === 'Agendado' && tela.coluna === 'agendado', JSON.stringify(tela));
    conferir(`${rot} sem cartão duplicado (continua 1 cartão do cliente; a origem dele não mudou)`, cam.length === antes.length && cam.length === 1 && tela.cartoes === 1 && cam[0].origem === 'meta', `${cam.length} cartão(ões), origem ${cam[0]?.origem}`);
    const noAtd = await fr.evaluate(async () => { const { data } = await clienteSupabase().from('leads').select('id,status').eq('cliente_id', '5f6c1a2e-0001-4abc-9def-000000000001'); return (data || []).map((l) => l.id + ':' + l.status).join(','); });
    conferir(`${rot} no Atendimento foi o cartão aberto que mudou (nenhum cartão novo)`, /l2:agendado/.test(noAtd) && !/,.*:agendado/.test(noAtd.replace('l2:agendado', '')), noAtd);
    const enviosDepois = (await (await fetch(`${BASE}/atendimento/api/_envios`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()).envios.length;
    const rascunho = await fr.evaluate(() => document.getElementById('campoMensagem').value);
    conferir(`${rot} nada foi enviado sozinho (a confirmação fica escrita no campo, esperando a pessoa)`, enviosDepois === enviosAntes && rascunho.length > 10, `${enviosDepois - enviosAntes} envios; rascunho de ${rascunho.length} letras`);
    await foto(s, '04-painel-agendado');
  }

  /* ---- outro cartão: o painel troca de conversa; sem conversa, diz e oferece começar ---- */
  await page.evaluate(() => { document.querySelector('#search').value = ''; document.querySelector('#search').dispatchEvent(new Event('input', { bubbles: true })); });
  await espera(500);
  if (s.cel) { await page.click('#r20PainelFechar'); await espera(300); }
  await fr.evaluate(() => { window.__r20marca = 1; });   // se a moldura recarregar, a marca some
  await page.evaluate(() => [...document.querySelectorAll('.kb-card')].find((c) => !c.textContent.includes('Camila')).querySelector('.kb-conversa').click());
  const vazio = await ate(() => fr.evaluate(() => !document.getElementById('r20SemConversa').hidden && document.getElementById('r20SemConversaTxt').textContent));
  conferir(`${rot} cliente sem conversa: o painel troca sem recarregar, diz isso e oferece começar`, /ainda não tem conversa/.test(vazio || '') && await fr.evaluate(() => window.__r20marca === 1), String(vazio));
  await foto(s, '05-painel-sem-conversa');
  await fr.evaluate(() => document.getElementById('r20Comecar').click());
  const nova = await ate(() => fr.evaluate(() => document.getElementById('modalNovaBg').classList.contains('aberto') && document.getElementById('novaTelefone').value));
  conferir(`${rot} "Começar conversa" abre a conversa nova com o telefone, sem mandar nada`, /\(12\)/.test(nova || ''), String(nova));
  await fr.evaluate(() => document.getElementById('modalNovaBg').classList.remove('aberto'));
  if (s.cel) {
    const peq = [...await toquesPequenos(page, '#r20Painel button'), ...await toquesPequenos(fr, '#r20SemConversa button')];
    conferir(`${rot} toques do painel com 44 px ou mais`, !peq.length, peq.join(' · '));
  }
  conferir(`${rot} painel sem rolagem lateral`, await semRolagem(page) && await semRolagem(fr));
  await page.click('#r20PainelFechar');
  conferir(`${rot} fechar o painel volta para o funil`, await page.evaluate(() => document.getElementById('r20Painel').hidden && document.getElementById('view-pipeline').classList.contains('active')));
  if (s.cel) { const peq = await toquesPequenos(page, '.kb-conversa'); conferir(`${rot} "Ver conversa" com 44 px ou mais no celular`, !peq.length, peq.join(' · ')); }

  /* ---- aba Conversas ---- */
  await irAba(s, 'conversas');
  const fc = await ate(() => moldura(page, 'r20MolduraConversas'));
  await ate(() => fc.evaluate(() => !document.getElementById('telaApp').hidden && document.querySelectorAll('#listaConversas .conversa').length > 0), 20000);
  await espera(800);
  const conv = await fc.evaluate(() => ({ topo: getComputedStyle(document.querySelector('.ic-topo')).display, lista: document.querySelectorAll('#listaConversas .conversa').length, url: location.search, badge: document.getElementById('badgeNaoLidas').hidden ? '' : document.getElementById('badgeNaoLidas').textContent.trim() }));
  const fora = await page.evaluate(() => { const m = document.getElementById('r20MolduraConversas').getBoundingClientRect(); return { badge: document.getElementById('navConversas').dataset.badge || '', hash: location.hash, alto: Math.round(m.height), fim: Math.round(m.bottom), janela: innerHeight, pe: getComputedStyle(document.querySelector('.ic-abas')).position === 'fixed' ? document.querySelector('.ic-abas').offsetHeight : 0 }; });
  conferir(`${rot} Conversas é a caixa de entrada do Atendimento, sem o topo dele`, conv.topo === 'none' && conv.lista > 0 && conv.url === '?embutido=1', JSON.stringify(conv));
  conferir(`${rot} não lidas no topo do app (${fora.badge})`, fora.badge !== '' && fora.badge === conv.badge, `${fora.badge} / ${conv.badge}`);
  conferir(`${rot} a moldura ocupa a tela até o fim (acima das abas, no celular) e o endereço vira #conversas`, fora.hash === '#conversas' && fora.alto > 400 && Math.abs(fora.fim - (fora.janela - fora.pe)) <= 2, JSON.stringify(fora));
  await foto(s, '06-conversas');
  await fc.evaluate(() => [...document.querySelectorAll('#listaConversas .conversa')].find((c) => c.textContent.includes('Camila')).click());
  const barra = await ate(() => page.evaluate(() => !document.getElementById('r20EtapaConversas').hidden && document.querySelector('#r20EtapaConversas .r20-et.atual')?.textContent));
  conferir(`${rot} conversa aberta: a etapa do cartão aparece acima dela`, barra === (completo ? 'Agendado' : 'Orçamento'), String(barra));
  await page.evaluate(() => [...document.querySelectorAll('#r20EtapaConversas .r20-et')].find((b) => b.dataset.etapa === 'em_servico').click());
  const mudou = await ate(async () => (await daCamila())[0]?.status === 'em_servico') && await ate(() => page.evaluate(() => document.querySelector('#r20EtapaConversas .r20-et.atual')?.textContent === 'Em serviço'));
  conferir(`${rot} mudar a etapa de dentro da conversa`, mudou, mudou ? '' : await page.evaluate(() => JSON.stringify({ toast: document.getElementById('toastTxt').textContent, barra: document.getElementById('r20EtapaConversas').innerText.slice(0, 160), modal: document.querySelector('.modal-bg.open, dialog[open]')?.id || '' })) + ' ' + JSON.stringify((await daCamila()).map((l) => l.status)));
  await foto(s, '07-conversa-com-etapa');
  if (s.cel) { const peq = await toquesPequenos(page, '#view-conversas .r20-barra button'); conferir(`${rot} toques da barra da conversa com 44 px ou mais`, !peq.length, peq.join(' · ')); }
  conferir(`${rot} Conversas sem rolagem lateral`, await semRolagem(page) && await semRolagem(fc));
  /* volta o cartão para o próximo tamanho de tela */
  await fetch(`${BASE}/crm/api/leads/${(await daCamila())[0].id}`, { method: 'PATCH', headers: cabCrm, body: JSON.stringify({ status: 'contato' }) });

  /* ---- Ajustes do Atendimento continuam alcançáveis ---- */
  if (s.cel) { await fc.evaluate(() => document.getElementById('btnVoltarLista')?.click()); await espera(300); }
  await page.click('#r20Ajustes');
  const aj = await ate(() => fc.evaluate(() => !document.getElementById('ajustesAbas').hidden && [...document.querySelectorAll('#ajustesAbas .nav-item')].filter((b) => !b.hidden && b.offsetParent).map((b) => b.textContent.trim()).join('|')));
  conferir(`${rot} "Ajustes" abre Minha conta, WhatsApp e chaves, IA… com a volta para as conversas`, /Voltar para as conversas/.test(aj || '') && /WhatsApp e chaves/.test(aj || '') && /IA/.test(aj || ''), String(aj));
  await foto(s, '08-ajustes');
  await fc.evaluate(() => document.querySelector('#ajustesAbas .r20-voltar').click());
  conferir(`${rot} "Voltar para as conversas" volta`, await ate(() => fc.evaluate(() => document.getElementById('aba-conversas').classList.contains('ativa') && document.getElementById('ajustesAbas').hidden)));

  /* ---- "Fazer orçamento" da conversa cai na aba Orçador do app ---- */
  await fc.evaluate(() => [...document.querySelectorAll('#listaConversas .conversa')].find((c) => c.textContent.includes('Camila')).click());
  await ate(() => fc.evaluate(() => !document.getElementById('chat').hidden));
  await fc.evaluate(() => document.getElementById('btnFazerOrcamento').click());
  const orc = await ate(() => page.evaluate(() => document.getElementById('view-orcador').classList.contains('active') && document.getElementById('r20MolduraOrcador').src));
  const uo = orc ? new URL(orc) : null;
  conferir(`${rot} "Fazer orçamento" abre a aba Orçador com o cliente da conversa`, uo && uo.pathname === '/orcador/' && uo.searchParams.get('nome') === CAMILA.nome && /6830111$/.test(uo.searchParams.get('tel') || ''), String(orc));
  const fo = await ate(() => moldura(page, 'r20MolduraOrcador'));
  const orcTela = await ate(() => fo.evaluate(() => document.body.innerText.trim().length > 20 && document.body.innerText.trim().slice(0, 60)), 20000);
  conferir(`${rot} o Orçador de verdade carrega dentro do app`, !!orcTela, String(orcTela));
  await espera(900);
  await foto(s, '09-orcador');
  conferir(`${rot} Orçador sem rolagem lateral`, await semRolagem(page));

  /* ---- Contatos saiu do topo, a lista completa continua no menu ---- */
  await page.evaluate(() => document.querySelector('#menuPerfil [data-view="leads"]').click());
  conferir(`${rot} "Lista de contatos" (filtros, exportar, ações em lote) abre pelo menu`, await ate(() => page.evaluate(() => document.getElementById('view-leads').classList.contains('active') && document.querySelectorAll('#tblLeads tbody tr').length > 3 && document.getElementById('viewTitle').textContent === 'Lista de contatos')));
  await irAba(s, 'clientes');
  await ate(() => page.evaluate(() => document.querySelectorAll('#tblClientes tbody tr[data-id]').length > 3));
  await page.evaluate(() => document.querySelector('#tblClientes a.mini-acao').click());
  conferir(`${rot} "abrir conversa" da lista de Clientes também abre o painel (não sai do app)`, await ate(() => page.evaluate(() => !document.getElementById('r20Painel').hidden)) && new URL(page.url()).pathname === '/crm/');
  await page.evaluate(() => document.getElementById('r20PainelFechar').click());
  const abas0 = (await browser.pages()).length;
  await page.evaluate(() => { const a = document.createElement('a'); a.href = '/orcador/#/historico/11111111-1111-4111-8111-111111111111'; a.id = 'r20LinkTeste'; a.textContent = 'orçamento'; document.querySelector('#view-clientes').append(a); a.click(); a.remove(); });
  const dentro = await ate(() => page.evaluate(() => document.getElementById('view-orcador').classList.contains('active') && /historico\/11111111/.test(document.getElementById('r20MolduraOrcador').src)));
  conferir(`${rot} link de orçamento (ficha, "Orçamento enviado") abre na aba Orçador, sem aba nova do navegador`, dentro && (await browser.pages()).length === abas0);
  conferir(`${rot} zero erro de console`, !s.erros.length, s.erros.slice(0, 4).join(' ‖ '));
  await s.ctx.close();
}

/* =====================================================================================================
   2) Links antigos do Atendimento (Casa, Agenda, Pátio, Tráfego) e service worker LIGADO, duas visitas
   ===================================================================================================== */
async function linksEServiceWorker() {
  const s = await abrir({ papel: 'gestor', w: 1440, tema: 'escuro' });
  const { page } = s; const rot = '[links + sw]';
  await pronto(s);
  const cab = await page.evaluate(async () => { const a = await fetch('/crm/'); const b = await fetch('/atendimento/?embutido=1'); const c = await fetch('/atendimento/api/config');
    return { crm: a.headers.get('content-security-policy'), crmX: a.headers.get('x-frame-options'), crmMic: a.headers.get('permissions-policy'), atd: b.headers.get('content-security-policy'), atdX: b.headers.get('x-frame-options'), apiX: c.headers.get('x-frame-options') }; });
  conferir(`${rot} CSP do CRM: frame-src 'self', continua sem poder ser emoldurado, microfone só do próprio site`, /frame-src 'self'/.test(cab.crm) && /frame-ancestors 'none'/.test(cab.crm) && cab.crmX === 'DENY' && /microphone=\(self\)/.test(cab.crmMic), cab.crmX);
  conferir(`${rot} CSP do Atendimento: frame-ancestors 'self' só na página (a API continua DENY)`, /frame-ancestors 'self'/.test(cab.atd) && cab.atdX === 'SAMEORIGIN' && cab.apiX === 'DENY', `${cab.atdX} / ${cab.apiX}`);

  /* primeira visita: os dois service workers instalam */
  await irAba(s, 'conversas');
  let fc = await ate(() => moldura(page, 'r20MolduraConversas'));
  await ate(() => fc.evaluate(() => !document.getElementById('telaApp').hidden), 20000);
  const sw1 = await ate(() => page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistrations(); return r.length >= 2 && r.every((x) => x.active) && r.map((x) => new URL(x.scope).pathname).sort().join(','); }), 25000);
  conferir(`${rot} 1ª visita: os dois service workers de verdade instalam`, sw1 === '/atendimento/,/crm/', String(sw1));
  const cache = await page.evaluate(async () => { const chaves = await caches.keys(); const c = await caches.open(chaves.find((k) => k.startsWith('indycar-atendimento-'))); const casca = await c.match('/atendimento/'); const t = casca ? await casca.text() : '';
    const crm = await caches.open(chaves.find((k) => /^indycar-crm-v/.test(k))); return { chaves: chaves.join(','), cascaAtd: /id="telaApp"/.test(t) && !/id="kanban"/.test(t), redirecionada: casca?.redirected, r20: !!(await c.match('/atendimento/r20.js')) && !!(await crm.match('/crm/r20.js')) && !!(await crm.match('/crm/r20-regras.js')) && !!(await crm.match('/crm/r20.css')) }; });
  conferir(`${rot} cache v23 (CRM) e v32 (Atendimento) com os arquivos da rodada; a casca guardada é a do Atendimento, não um redirecionamento`, /indycar-crm-v23/.test(cache.chaves) && /indycar-atendimento-v32/.test(cache.chaves) && cache.cascaAtd && !cache.redirecionada && cache.r20, JSON.stringify(cache));

  /* segunda visita: tudo passa pelos service workers */
  await page.goto(`${BASE}/crm/#conversas`, { waitUntil: 'domcontentloaded' });
  await pronto(s);
  fc = await ate(() => moldura(page, 'r20MolduraConversas'));
  const v2 = await ate(async () => { const a = await page.evaluate(() => !!navigator.serviceWorker.controller && document.getElementById('view-conversas').classList.contains('active')); const b = fc && await fc.evaluate(() => !!navigator.serviceWorker.controller && !document.getElementById('telaApp').hidden && document.querySelectorAll('#listaConversas .conversa').length > 0); return a && b; }, 25000);
  conferir(`${rot} 2ª visita com os service workers no controle: /crm/#conversas abre as Conversas na moldura`, v2);

  /* links antigos, com o service worker do Atendimento já no controle de /atendimento/ */
  await page.goto(`${BASE}/atendimento/?conversa=${JOSE}`, { waitUntil: 'domcontentloaded' });
  await pronto(s);
  fc = await ate(() => moldura(page, 'r20MolduraConversas'));
  const jose = await ate(() => fc.evaluate(() => !document.getElementById('chat').hidden && document.getElementById('chatNome').textContent.trim()), 20000);
  conferir(`${rot} /atendimento/?conversa=<id> (link antigo) cai em /crm/ na aba Conversas, já na conversa`, /José/.test(jose || '') && page.url() === `${BASE}/crm/#conversas`, `${jose} · ${page.url()}`);
  await foto(s, '10-link-antigo-conversa');
  await page.goto(`${BASE}/atendimento/?tel=${RENATA_TEL}`, { waitUntil: 'domcontentloaded' });
  await pronto(s);
  fc = await ate(() => moldura(page, 'r20MolduraConversas'));
  const ren = await ate(() => fc.evaluate(() => !document.getElementById('chat').hidden && document.getElementById('chatNome').textContent.trim()), 20000);
  conferir(`${rot} /atendimento/?tel=<telefone> abre a conversa do telefone (e o telefone sai da barra de endereço)`, /Renata/.test(ren || '') && page.url() === `${BASE}/crm/#conversas`, `${ren} · ${page.url()}`);
  await page.goto(`${BASE}/atendimento/?aba=orcador&tel=${RENATA_TEL}&nome=Renata#/historico/11111111-1111-4111-8111-111111111111`, { waitUntil: 'domcontentloaded' });
  await pronto(s);
  const orc = await ate(() => page.evaluate(() => document.getElementById('view-orcador').classList.contains('active') && document.getElementById('r20MolduraOrcador').src));
  conferir(`${rot} /atendimento/?aba=orcador… (cartão e orçamentos da Casa) abre a aba Orçador no orçamento certo`, /\/orcador\/\?tel=12977776666&nome=Renata#\/historico\/11111111/.test(orc || ''), String(orc));
  await page.goto(`${BASE}/atendimento/?aba=integracoes`, { waitUntil: 'domcontentloaded' });
  await pronto(s);
  fc = await ate(() => moldura(page, 'r20MolduraConversas'));
  conferir(`${rot} /atendimento/?aba=integracoes (aviso do Comunicar) abre WhatsApp e chaves`, await ate(() => fc.evaluate(() => document.getElementById('aba-integracoes').classList.contains('ativa')), 20000));
  await page.goto(`${BASE}/atendimento/`, { waitUntil: 'domcontentloaded' });
  await pronto(s);
  conferir(`${rot} /atendimento/ sozinho vai para /crm/#conversas`, await ate(() => page.evaluate(() => location.pathname === '/crm/' && location.hash === '#conversas' && document.getElementById('view-conversas').classList.contains('active'))), page.url());
  const red = (await (await fetch(`${BASE}/__r20/pedidos`)).json()).redirecionados;
  conferir(`${rot} quem redirecionou foi o servidor (302 com o endereço antigo em "atd")`, red.length >= 5 && red.every((r) => r.para.startsWith('/crm/?aba=conversas')), `${red.length} redirecionamentos`);
  conferir(`${rot} zero erro de console`, !s.erros.length, s.erros.slice(0, 4).join(' ‖ '));
  await s.ctx.close();
}

/* =====================================================================================================
   3) WhatsApp parado: a faixa no app unificado
   ===================================================================================================== */
async function whatsappParado() {
  await fetch(`${BASE}/__r20/zap`, { method: 'POST', body: JSON.stringify({ modo: 'chave' }) });
  for (const [papel, w, tema] of RAPIDO ? [['admin', 1440, 'escuro']] : [['admin', 1440, 'escuro'], ['atendente', 375, 'claro']]) {
    const s = await abrir({ papel, w, tema });
    const { page, rot } = s;
    await pronto(s);
    /* o estado do WhatsApp de mentira é decidido quando a página do Atendimento é pedida: abre as Conversas primeiro */
    await irAba(s, 'conversas');
    const fc = await ate(() => moldura(page, 'r20MolduraConversas'));
    await ate(() => fc.evaluate(() => !document.getElementById('telaApp').hidden), 20000);
    await page.evaluate(() => window.R20Tela.verZap());
    const faixa = await ate(() => page.evaluate(() => !document.getElementById('r20Zap').hidden && document.querySelector('.r20-zap-txt').textContent.replace(/\s+/g, ' ').trim()));
    conferir(`${rot} faixa "WhatsApp parado" no app unificado, com desde quando e o que fazer`, /WhatsApp parado desde/.test(faixa || '') && /Ajustes › WhatsApp e chaves/.test(faixa || ''), String(faixa));
    await irAba(s, 'pipeline');
    conferir(`${rot} a faixa continua à vista no Funil`, await page.evaluate(() => { const f = document.getElementById('r20Zap'); return !f.hidden && f.getBoundingClientRect().height > 20; }));
    await foto(s, '11-whatsapp-parado-funil');
    await irAba(s, 'conversas');
    await espera(1500);
    conferir(`${rot} dentro das Conversas a faixa não se repete`, await fc.evaluate(() => getComputedStyle(document.getElementById('faixaSaude')).display === 'none'));
    const botao = await page.evaluate(() => !document.getElementById('r20ZapBtn').hidden);
    conferir(`${rot} ${papel === 'admin' ? 'administrador tem o atalho "Abrir WhatsApp e chaves"' : 'quem não é administrador não vê o atalho da chave'}`, botao === (papel === 'admin'));
    if (papel === 'admin') {
      await page.click('#r20ZapBtn');
      conferir(`${rot} o atalho abre WhatsApp e chaves dentro do app`, await ate(() => fc.evaluate(() => document.getElementById('aba-integracoes').classList.contains('ativa'))));
    }
    if (s.cel) { const peq = await toquesPequenos(page, '#r20Zap button'); conferir(`${rot} toques da faixa com 44 px ou mais`, !peq.length, peq.join(' · ')); }
    conferir(`${rot} sem rolagem lateral com a faixa`, await semRolagem(page));
    await foto(s, '12-whatsapp-parado-conversas');
    conferir(`${rot} zero erro de console`, !s.erros.length, s.erros.slice(0, 4).join(' ‖ '));
    await s.ctx.close();
  }
  await fetch(`${BASE}/__r20/zap`, { method: 'POST', body: JSON.stringify({ modo: '' }) });
}

/* =====================================================================================================
   4) Permissões: quem tinha só um dos dois continua entrando e vendo o que podia
   ===================================================================================================== */
async function permissoes() {
  const abas = (page) => page.evaluate(() => [...document.querySelectorAll('.ic-abas .nav-item')].filter((b) => !b.hidden).map((b) => b.textContent.trim()).join('|'));
  /* só Atendimento */
  for (const [w, tema] of RAPIDO ? [[1440, 'escuro']] : [[1440, 'escuro'], [375, 'claro']]) {
    const s = await abrir({ papel: 'sem_app', w, tema });
    const { page, rot } = s;
    await pronto(s);
    const fc = await ate(() => moldura(page, 'r20MolduraConversas'));
    const dentro = await ate(() => fc.evaluate(() => !document.getElementById('telaApp').hidden && document.querySelectorAll('#listaConversas .conversa').length > 0), 20000);
    const t = await page.evaluate(() => ({ login: document.getElementById('telaLogin').hidden, ativa: document.querySelector('.view.active')?.id, menu: [...document.querySelectorAll('#menuPerfil [role=menuitem]')].filter((b) => !b.hidden).map((b) => b.textContent.trim()).join('|') }));
    conferir(`${rot} só Atendimento: entra direto nas Conversas (sem a tela "sem acesso")`, dentro && t.login && t.ativa === 'view-conversas', JSON.stringify(t));
    conferir(`${rot} só Atendimento: vê Conversas e Orçador, nada do CRM`, (await abas(page)) === 'Conversas|Orçador' && !/Painel|Lista de contatos|Serviços|Equipe/.test(t.menu), `${await abas(page)} · ${t.menu}`);
    await fc.evaluate(() => document.querySelector('#listaConversas .conversa').click());
    await espera(1200);
    conferir(`${rot} só Atendimento: sem etapa do funil na conversa (o funil é do CRM)`, await page.evaluate(() => document.getElementById('r20EtapaConversas').hidden));
    conferir(`${rot} só Atendimento: nenhuma rota do CRM foi pedida além do perfil`, !(await page.evaluate(() => performance.getEntriesByType('resource').map((r) => new URL(r.name).pathname).filter((p) => p.startsWith('/crm/api/') && !/\/api\/(config|perfil|primeiro-acesso)$/.test(p)).join(','))));
    await foto(s, '13-so-atendimento');
    conferir(`${rot} zero erro de console`, !s.erros.length, s.erros.slice(0, 4).join(' ‖ '));
    await s.ctx.close();
  }
  /* só CRM */
  {
    const s = await abrir({ papel: 'so_crm', w: 1440, tema: 'escuro' });
    const { page, rot } = s;
    await pronto(s);
    await irAba(s, 'pipeline');
    await ate(() => page.evaluate(() => document.querySelectorAll('.kb-card').length > 3));
    const t = await page.evaluate(() => ({ botoes: document.querySelectorAll('.kb-conversa').length, ajustes: document.getElementById('mpAjustes').hidden, faixa: document.getElementById('r20Zap').hidden, moldura: document.getElementById('r20MolduraConversas').getAttribute('src') }));
    conferir(`${rot} só CRM: Hoje, Funil, Clientes e Orçador; sem Conversas`, (await abas(page)) === 'Hoje|Funil|Clientes|Orçador', await abas(page));
    conferir(`${rot} só CRM: sem "Ver conversa", sem Ajustes do WhatsApp, e o Atendimento nem é carregado`, t.botoes === 0 && t.ajustes && t.faixa && !t.moldura, JSON.stringify(t));
    await page.goto(`${BASE}/crm/#conversas`, { waitUntil: 'domcontentloaded' });
    await pronto(s);
    conferir(`${rot} só CRM: /crm/#conversas não abre as Conversas`, await page.evaluate(() => !document.getElementById('view-conversas').classList.contains('active')));
    await foto(s, '14-so-crm');
    conferir(`${rot} zero erro de console`, !s.erros.length, s.erros.slice(0, 4).join(' ‖ '));
    await s.ctx.close();
  }
  /* recepção (papel agenda): nenhum dos dois */
  {
    const s = await abrir({ papel: 'agenda', w: 1440, tema: 'escuro' });
    const t = await ate(() => s.page.evaluate(() => !document.getElementById('caixaSemAcesso').hidden && document.getElementById('saTitulo').textContent));
    conferir(`${s.rot} recepção (só Agenda): continua sem acesso, com o nome novo do app`, /CRM e Atendimento/.test(t || ''), String(t));
    await s.ctx.close();
  }
  /* atendente: cartão de colega aparece, mas a etapa não muda por ele */
  {
    const s = await abrir({ papel: 'atendente', w: 1440, tema: 'claro' });
    const { page, rot } = s;
    await pronto(s);
    await irAba(s, 'pipeline');
    await ate(() => page.evaluate(() => document.querySelectorAll('.kb-card').length > 3));
    await page.evaluate(() => { const f = document.getElementById('fRespFunil'); if (f && f.value !== '') { f.value = ''; f.dispatchEvent(new Event('change', { bubbles: true })); } });   // o funil do atendente abre em "meus": aqui interessa o cartão de um colega
    await espera(600);
    const tem = await page.evaluate(() => { const c = document.querySelector('.kb-card.travado .kb-conversa'); if (c) c.click(); return !!c; });
    if (tem) {
      const b = await ate(() => page.evaluate(() => { const bs = [...document.querySelectorAll('#r20EtapaPainel .r20-et')]; return bs.length ? { travados: bs.filter((x) => !x.classList.contains('atual')).every((x) => x.disabled), aviso: document.querySelector('#r20EtapaPainel .r20-etapas').title } : null; }));
      conferir(`${rot} atendente: cartão de colega abre a conversa, mas a etapa fica travada (a mesma regra do funil)`, b && b.travados && b.aviso.length > 5, JSON.stringify(b));
      await foto(s, '15-atendente-cartao-de-colega');
    } else conferir(`${rot} atendente: há cartão de colega para provar a trava`, false);
    conferir(`${rot} zero erro de console`, !s.erros.length, s.erros.slice(0, 4).join(' ‖ '));
    await s.ctx.close();
  }
}

let falhou = false;
try {
  const telas = RAPIDO ? [[1440, 'escuro', true]] : [[1440, 'escuro', true], [375, 'claro', false], [375, 'escuro', false], [1440, 'claro', false]];
  for (const [w, tema, completo] of telas) await diaADia(w, tema, completo);
  await linksEServiceWorker();
  await whatsappParado();
  await permissoes();
} catch (e) { falhou = true; console.error('O roteiro parou:', e?.stack || e); }
const ruins = resultados.filter((r) => !r.ok);
const resumo = `${resultados.length - ruins.length} de ${resultados.length}${falhou ? ' (o roteiro parou no meio)' : ''}`;
console.log(`\n${resumo}`);
writeFileSync(join(SAIDA, 'roteiro-r20.txt'), resultados.map((r) => `${r.ok ? 'ok     ' : 'FALHOU '} ${r.nome}${r.ok || !r.detalhe ? '' : '  (' + r.detalhe + ')'}`).join('\n') + `\n\n${resumo}\n`);
await browser.close();
central.parar();
process.exit(ruins.length || falhou ? 1 : 0);
