// Ferramentas do QA da Rodada 6 (Casa e Agenda): usuário de teste no Auth (criado e APAGADO no fim),
// navegador headless (puppeteer-core + Chrome instalado) e dados de mentira para as RPCs do painel.
// Nada aqui escreve no banco além do usuário de teste. NUNCA imprime chave nem senha.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/USER/.claude/backups/indycar-ferramentas/package.json');
export const puppeteer = require('puppeteer-core');
export const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export function lerEnv(caminho = 'C:/Users/USER/.claude/backups/indycar-agendamentos/.env') {
  return Object.fromEntries(fs.readFileSync(caminho, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
}

export function criarContexto(papel = 'gestor', apps = ['atendimento', 'crm', 'agenda', 'comunicar', 'patio', 'orcador']) {
  const env = lerEnv();
  const URLB = env.SUPABASE_URL, SR = env.SUPABASE_SERVICE_ROLE_KEY;
  const H = { apikey: SR, Authorization: 'Bearer ' + SR, 'Content-Type': 'application/json' };
  const email = `teste-r6-c1-${papel}-${crypto.randomBytes(3).toString('hex')}@indycar.teste`;
  const senha = crypto.randomBytes(18).toString('base64url') + 'Aa1!';
  let uid = null;
  return {
    email, senha, env, get uid() { return uid; },
    async criar() {
      const r = await fetch(URLB + '/auth/v1/admin/users', { method: 'POST', headers: H, body: JSON.stringify({ email, password: senha, email_confirm: true }) });
      const u = await r.json(); uid = u.id;
      if (!uid) throw new Error('não criou usuário de teste: ' + r.status);
      // o gatilho cria o perfil desativado; ativamos com o papel do teste
      await fetch(URLB + '/rest/v1/perfis?id=eq.' + uid, { method: 'PATCH', headers: H,
        body: JSON.stringify({ nome: 'Teste R6 ' + papel, papel, ativo: true, apps, recebe_leads: false, precisa_trocar_senha: false }) });
      return uid;
    },
    async apagar() {
      if (!uid) return null;
      const d = await fetch(URLB + '/auth/v1/admin/users/' + uid, { method: 'DELETE', headers: H });
      uid = null; return d.status;
    },
    /** token de acesso do usuário de teste (para chamar RPCs/rotas como ele) */
    async token() {
      const r = await fetch(URLB + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: senha }) });
      return (await r.json()).access_token;
    },
  };
}

export async function abrirNavegador({ largura = 1440, altura = 900 } = {}) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: largura, height: altura });
  return { browser, page };
}

export async function entrarNaCasa(page, base, ctx) {
  await page.goto(base + '/', { waitUntil: 'networkidle2' });
  await page.waitForSelector('#lEmail', { visible: true, timeout: 30000 });
  await page.type('#lEmail', ctx.email);
  await page.type('#lSenha', ctx.senha);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#casa:not([hidden])', { timeout: 30000 });
}

/** Responde as RPCs da Casa com dados de mentira (o banco real continua só de leitura). */
export async function simularRpcs(page, dados) {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    const m = /\/rest\/v1\/rpc\/(r6_[a-z0-9_]+)/.exec(u);
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (m && dados[m[1]] && req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    if (m && dados[m[1]]) {
      const corpo = typeof dados[m[1]] === 'function' ? dados[m[1]](req) : dados[m[1]];
      return req.respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(corpo) });
    }
    if (req.method() === 'OPTIONS') return req.continue();
    req.continue();
  });
}

const iso = (minAtras) => new Date(Date.now() - minAtras * 60000).toISOString();
export function dadosAgora() {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const carro = (id, numero, cliente, veiculo, placa, min, ex, prev) => ({ id, numero, cliente, telefone_55: '5512991821234', veiculo, placa, desde: iso(min), minutos_na_etapa: min, extras_pendentes: ex, previsao_entrega: prev, orcamento_id: null });
  const etapa = (e, rotulo, carros) => ({ etapa: e, rotulo, normal_min: 60, quantidade: carros.length, mais_antigo_min: carros.length ? 1 : null, carros });
  return {
    hoje, gerado_em: iso(0), kpis: {},
    patio: { total: 5, prontos_esperando_retirada: 1, atrasados: 1, extras_pendentes: 2, entregues_hoje: 0, por_etapa: [
      etapa('recebido', 'Recebido', []), etapa('diagnostico', 'Diagnóstico', []),
      etapa('aguardando_aprovacao', 'Aguardando aprovação', [carro('22222222-2222-4222-8222-222222222222', 32, 'Ana Souza', 'Onix', 'QWE4R56', 1700, 2, iso(-120))]),
      etapa('aguardando_peca', 'Aguardando peça', []),
      etapa('em_execucao', 'Em execução', [carro('33333333-3333-4333-8333-333333333333', 33, 'Carlos', 'HB20', 'HJK7L89', 35, 0, iso(-90))]),
      etapa('teste', 'Teste', []),
      etapa('pronto', 'Pronto', [carro('11111111-1111-4111-8111-111111111111', 31, 'Marcos <b>Lima</b>', 'Gol 1.0', 'ABC1D23', 310, 0, null)]),
    ] },
    orcamentos: { esperando_total: 3, nao_abertos: 2, valor_esperando: 2310, vencendo_hoje: 0, aprovados_sem_horario_total: 2, aprovados_sem_horario: [],
      esperando: [{ id: '44444444-4444-4444-8444-444444444444', numero: 12, cliente: 'Paula Dias', total: 1890.5, enviado_em: iso(3000), visualizado_em: iso(2900), validade: null },
                  { id: '55555555-5555-4555-8555-555555555555', numero: 14, cliente: 'Rui', total: 420, enviado_em: iso(90), visualizado_em: null, validade: null }] },
    conversas_sem_resposta: { total: 2, minhas: 0, sem_dono: 2, aguardando_consultor: 2,
      itens: [{ id: '66666666-6666-4666-8666-666666666666', nome: 'João Pedro', telefone_55: '5512991821234', desde: iso(190), previa: 'Qual o preço da revisão?', dono: null },
              { id: '77777777-7777-4777-8777-777777777777', nome: null, telefone_55: '5512988887777', desde: iso(12), previa: 'Boa tarde', dono: null }] },
    agendamentos_hoje: { total: 4, faltam_chegar: 2, atrasados: 0, no_patio: 1,
      itens: [{ id: '88888888-8888-4888-8888-888888888888', hora: '08:00', cliente: 'Marcos Lima', veiculo: 'Gol', servico: 'Revisão', status: 'compareceu', chegou: true, os_id: '11111111-1111-4111-8111-111111111111', os_etapa: 'pronto' },
              { id: '99999999-9999-4999-8999-999999999999', hora: '23:30', cliente: 'Beatriz', veiculo: 'Civic', servico: 'Freios', status: 'aguardando', chegou: false, os_id: null, os_etapa: null }] },
    tarefas: { abertas: 3, vencidas: 1 },
  };
}
export function dadosExtras() {
  return { leads: { novos_sem_dono: 3, novos_hoje: 5 }, orcamentos: { recusados_7d: 1, vistos: 1 }, conversas: { nao_lidas: 7, antigas: 5 },
    agenda: { chegaram: 1, sem_confirmar: 1, faltaram: 0, orcamentos: { '99999999-9999-4999-8999-999999999999': { id: '44444444-4444-4444-8444-444444444444', numero: 12, status: 'aprovado' } } } };
}
export function dadosDono() {
  const hoje = new Date();
  const serie = Array.from({ length: 7 }, (_, i) => ({ dia: new Date(hoje.getTime() - (6 - i) * 864e5).toISOString().slice(0, 10), valor: [0, 850, 1200, 400, 2300, 1750, 980][i] }));
  return {
    hoje: serie[6].dia, gerado_em: iso(0), serie7: serie,
    faturamento: { hoje: 980, ontem: 1750, semana: 5600, semana_passada: 4200, mes: 18450.5, fechados_hoje: 2, fechados_semana: 9, ticket_semana: 622.22, sem_valor_semana: 1 },
    conversao: { leads: 63, agendaram: 43, fecharam: 36, perdidos: 3, veio: 45, fechou: 40, nao_fechou: 4, nao_veio: 17 },
    orcamentos: { enviados: 20, aprovados: 9, recusados: 4, valor_aprovado: 14300 },
    gargalos: { patio: [{ etapa: 'aguardando_aprovacao', n: 1, horas_mais_antigo: 28.3 }, { etapa: 'em_execucao', n: 1, horas_mais_antigo: 0.6 }], pronto_parado_4h: 1, conversas_2h: 1, orcamentos_24h: 2, leads_sem_dono: 3, horarios_sem_desfecho: 2 },
  };
}
export function dadosBusca() {
  const it = (tipo, app, o) => ({ tipo, app, id: o.id, nome: o.nome, titulo: o.nome, detalhe: o.detalhe || '', telefone_55: '5512991821234', status: o.status || null, extra: o.extra || {}, quando: iso(40), link: 'x', aba: 'indycar-' + app });
  return {
    termo: 'marcos', total: 7, aviso: undefined,
    grupos: {
      clientes: [it('cliente', 'crm', { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nome: 'Marcos Lima', extra: { carro: 'Gol', placa: 'ABC1D23' } })],
      agendamentos: [it('agendamento', 'agenda', { id: '88888888-8888-4888-8888-888888888888', nome: 'Marcos Lima', detalhe: '21/10 08:00 · Gol · Revisão', status: 'compareceu', extra: { os_etapa: 'pronto', os_numero: 31 } })],
      leads: [it('lead', 'crm', { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', nome: 'Marcos Lima', detalhe: 'Gol · Revisão', status: 'orcamento' })],
      conversas: [it('conversa', 'atendimento', { id: '66666666-6666-4666-8666-666666666666', nome: 'Marcos <img src=x onerror=alert(1)>', detalhe: 'obrigado!', status: 'aberta', extra: { aguardando_consultor: false } })],
      patio: [it('os', 'patio', { id: '11111111-1111-4111-8111-111111111111', nome: 'Marcos Lima', status: 'pronto', extra: { numero: 31, etapa: 'pronto', veiculo: 'Gol 1.0', placa: 'ABC1D23' } })],
      orcamentos: [it('orcamento', 'orcador', { id: '44444444-4444-4444-8444-444444444444', nome: 'Marcos Lima', status: 'aprovado', extra: { numero: 12, total: 1890.5 } })],
    },
  };
}
