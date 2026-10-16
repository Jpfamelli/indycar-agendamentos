// ============================================================================
// Servidor de MENTIRA para mexer na tela do Comunicar sem login e sem dado
// real de cliente.
//
//   npm run mock   (ou  node scripts/mock-server.mjs)  → http://localhost:3511
//   abra  http://localhost:3511/?papel=atendente  para ver o modo "só olha"
//   abra  http://localhost:3511/?saude=ok         para esconder a faixa de saúde
//   rodada 3 — ?papel= admin | gestor | atendente | atendente2 | agenda | desativado |
//   sem_app | trocar_senha | mfa   (o porteiro é o acesso.js REAL: mesmas regras do
//   servidor) · ?logado=0 abre a tela de login (senha "errada" simula erro;
//   código de duas etapas de teste: 123456)
//
// Serve a pasta public/ de verdade (o mesmo index.html, app.js e styles.css que
// vão para produção) e responde /api/* com dados inventados, guardados na
// memória. A única coisa trocada no HTML é a biblioteca do Supabase, que vira um
// dublê "já logado". NUNCA é usado em produção: o Render sobe o server.js.
//
// As funções puras vêm do dados.js REAL (renderTemplate, prazoDeRetorno…), para
// o que se vê aqui ser o que vai ao ar.
// ============================================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderTemplate, REGUAS, ROTULO_TIPO, SEGMENTOS, prazoDeRetorno, quandoRelativo,
  classificarResposta, hoje, somarDias, paraCSV, COLUNAS_CSV_ENVIOS, montarRelatorio, montarAniversarios,
  instanteSP, dataBanco,
} from '../dados.js';
import * as ia from '../ia.js';
import * as A from '../acesso.js';
import * as auto from '../automacoes.js';
// rodada 4: as MESMAS funções puras do servidor
import { montarProntidao } from '../prontidao.js';
import { projetarMes } from '../projecao.js';
import { resumirCarteiro } from '../carteiro.js';
import { lerLista, casarComClientes, resumirAnalise, montarSugestoes, lerData } from '../aniversarios.js';
import { montarIndicadores } from '../dados.js';
import { MODELO_CONVITE_AREA, usaLinkArea, linkArea, linkOs, PATIO_URL } from '../patio.js';
// rodada 5: as MESMAS funções puras do servidor (saúde do WhatsApp, pulados do segmento, relatório por régua, ligações)
import { montarSaude, classificarErro } from '../whatsapp.js';
import { peneirarSegmento, montarRelatorioPorRegua, montarLigacoes } from '../dados.js';
import { LINKS } from '../acesso.js';

/* IA de MENTIRA: o mock usa as funções REAIS do ia.js (validação, correção de
   vocabulário, prévia) com um cliente falso — nada vai para a Anthropic. */
const VARIACOES_FALSAS = {
  lembrete: ['Oi {primeiro_nome}! Passando para lembrar do seu horário {quando} para {servico}. Confirma pra mim? Se precisar remarcar, é só responder. 🏁',
    'Oi {primeiro_nome}, tudo certo? Seu horário na IndyCar é {quando}. Posso confirmar?', 'Lembrete: {quando} tem {servico} do seu veículo aqui na IndyCar. Confirma? 🔧'],
  posvenda: ['Oi {primeiro_nome}! Ficou tudo certo com o {carro} depois do {servico}? Qualquer coisa é só responder aqui. 🔧',
    'Oi {primeiro_nome}, aqui é da IndyCar! Como o {carro} está rodando depois do serviço? Me conta por aqui.', 'Prezado {nome}, como ficou o serviço?'],
  campanha: ['Oi {primeiro_nome}! Que tal um check-up no {carro} antes das férias? O diagnóstico digital é gratuito, leva uns 30 min. Quer agendar? 🏁',
    'Oi {primeiro_nome}, tudo bem? A IndyCar está com horários livres esta semana para o {carro}. Posso reservar um pra você?', 'Oi {primeiro_nome}! Troca de óleo por R$ 199 só esta semana!'],
};
let IA_LIGADA = true;
ia.definirClienteIA({
  async criar(args) {
    await new Promise((r) => setTimeout(r, 650));
    if (!IA_LIGADA) throw Object.assign(new Error('A chave da IA foi recusada (401).'), { status: 401 });
    const pedido = args.mensagens?.[0]?.content || '';
    const nome = args.escolha?.name;
    if (nome === 'propor_mensagens') {
      const regua = (pedido.match(/régua "(\w+)"/) || [])[1] || 'campanha';
      const base = VARIACOES_FALSAS[regua] || VARIACOES_FALSAS.campanha.map((t) => t.replace('{carro}', '{carro}'));
      const extra = regua === 'avaliacao' ? ['Que bom que gostou, {primeiro_nome}! 🙌 Uma avaliação rápida no Google ajuda demais: {link_avaliacao}', 'Obrigado pela confiança, {primeiro_nome}! Se puder, deixa sua nota: {link_avaliacao}', 'Valeu, {primeiro_nome}! Avalia a gente? {link_avaliacao}'] : base;
      return { conteudo: [{ type: 'tool_use', name: nome, input: { variacoes: extra } }], uso: {}, modelo: args.modelo, ms: 650 };
    }
    if (nome === 'sugerir') {
      return { conteudo: [{ type: 'tool_use', name: nome, input: { segmento: 'sem_voltar', valor: 6, motivo: '4 clientes estão há mais de 6 meses sem voltar e 2 das últimas campanhas de revisão viraram agendamento.', mensagem: 'Oi {primeiro_nome}! Faz um tempinho que o {carro} não passa aqui. Que tal um diagnóstico digital gratuito, uns 30 min com scanner? É só responder para agendar. 🏁' } }], uso: {}, modelo: args.modelo, ms: 650 };
    }
    return { conteudo: [{ type: 'text', text: 'Semana boa no Comunicar: 9 mensagens saíram e 5 clientes responderam (56%). A campanha de freios na chuva foi a que mais rendeu — um cliente já pediu horário para sábado. O ponto de atenção é o pós-venda do Donizetti, que reclamou de barulho na roda: vale ligar hoje. Para esta semana, ligue a régua Reativação: há 4 clientes sumidos há mais de 6 meses.' }], uso: {}, modelo: args.modelo, ms: 650 };
  },
});

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT || 3511);
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' };

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const agora = () => new Date().toISOString();
const horasAtras = (h) => new Date(Date.now() - h * 3600000).toISOString();
const diasAtras = (d) => new Date(Date.now() - d * 86400000).toISOString();
const hojeAs = (hm) => new Date(`${hoje()}T${hm}:00-03:00`).toISOString();
const mes = hoje().slice(5, 7);

// ---- perfis de mentira (rodada 3) ------------------------------------------
const PID = (n) => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;
const TODOS_APPS = ['atendimento', 'crm', 'agenda', 'comunicar', 'orcador', 'ads'];
const PERFIS = {
  admin:        { id: PID(1), nome:'João Pedro Famelli', email:'joao@indycartaubate.com', papel:'admin', ativo:true, apps: TODOS_APPS, cargo:'Dono', telefone:'12988887777' },
  gestor:       { id: PID(2), nome:'Gisele Prado', email:'gisele@indycartaubate.com', papel:'gestor', ativo:true, apps:['comunicar', 'crm', 'atendimento'], cargo:'Gerente' },
  atendente:    { id: PID(3), nome:'Leonardo', email:'leonardo@indycartaubate.com', papel:'atendente', ativo:true, apps:['comunicar', 'atendimento', 'crm', 'agenda'], cargo:'Consultor' },
  atendente2:   { id: PID(4), nome:'Bia Ramos', email:'bia@indycartaubate.com', papel:'atendente', ativo:true, apps:['comunicar', 'atendimento'] },
  agenda:       { id: PID(5), nome:'Franklin', email:'franklin@indycartaubate.com', papel:'agenda', ativo:true, apps:['agenda'] },
  sem_app:      { id: PID(6), nome:'Carla', email:'carla@indycartaubate.com', papel:'atendente', ativo:true, apps:['atendimento', 'crm'] },
  desativado:   { id: PID(7), nome:'Ex-funcionário', email:'ex@indycartaubate.com', papel:'atendente', ativo:false, apps:['comunicar'] },
  trocar_senha: { id: PID(8), nome:'Nova Atendente', email:'nova@indycartaubate.com', papel:'atendente', ativo:true, apps:['comunicar'], precisa_trocar_senha:true },
  mfa:          { id: PID(9), nome:'Marina Duas Etapas', email:'marina@indycartaubate.com', papel:'gestor', ativo:true, apps:['comunicar'], mfa:true },
};
let PAPEL = 'admin', LOGADO = true;
const perfil = () => PERFIS[PAPEL] || PERFIS.admin;
const ehGestor = () => A.ehGestor(perfil());
const nomeDe = (id) => Object.values(PERFIS).find((x) => x.id === id)?.nome || null;

// ---- clientes -------------------------------------------------------------
const cli = (o) => ({ id: uuid(), telefone:'12999990000', carro:null, carro_modelo:null, placa:null, email:null, nascimento:null,
  aceita_mensagens:true, aceita_mensagens_em:null, aceita_mensagens_motivo:null, observacoes:null, created_at: diasAtras(300), ...o });
const CLIENTES = [
  cli({ nome:'Maria Aparecida Souza', telefone:'12999990001', carro:'HB20 2019', carro_modelo:'HB20', placa:'FHR6F16', nascimento:`1988-${mes}-14` }),
  cli({ nome:'Carlos Eduardo Nogueira', telefone:'12999990002', carro:'Corolla 2021', carro_modelo:'Corolla', placa:'GFK3H26', nascimento:'1975-03-02' }),
  cli({ nome:'Donizetti Ferreira', telefone:'12999990003', carro:'ix35 2016', carro_modelo:'ix35', placa:'EVR2C44', nascimento:`1904-${mes}-27` }),
  cli({ nome:'Patrícia Lemos', telefone:'12999990004', carro:'Onix 2020', carro_modelo:'Onix', placa:'RKA1D23', nascimento:'1992-11-09' }),
  cli({ nome:'Diogo Barros', telefone:'12999990005', carro:'Tracker 2022', carro_modelo:'Tracker', placa:'SRT4E55' }),
  cli({ nome:'Renata Figueiredo de Albuquerque Monteiro', telefone:'12999990006', carro:'Compass 2019', carro_modelo:'Compass', placa:'FZX7A88', nascimento:`1980-${mes}-03` }),
  cli({ nome:'Vanderlei Santos', telefone:'12999990007', carro:'City 2018', carro_modelo:'City', placa:'FHR6F16', aceita_mensagens:false,
    aceita_mensagens_em: diasAtras(12), aceita_mensagens_motivo:'pediu pelo WhatsApp: PARAR' }),
  cli({ nome:'José Antônio Ribeiro', telefone:'12999990008', carro:'S10 2017', carro_modelo:'S10', placa:'DKL9B11', nascimento:'1968-07-21' }),
  cli({ nome:'Luciana Prado', telefone:'12999990009', carro:'Fit 2015', carro_modelo:'Fit', placa:'EJM3F77', nascimento:`1990-${mes}-30` }),
  cli({ nome:'Marcos Vinícius', telefone:'12999990010', carro:'Gol 2014', carro_modelo:'Gol', placa:'DTZ5G66' }),
  cli({ nome:'Sueli Martins', telefone:'12999990011', carro:'Civic 2020', carro_modelo:'Civic', placa:'RUV8H99', nascimento:'1983-05-05' }),
  cli({ nome:'Sem Telefone da Silva', telefone:null, carro:'Palio 2010', carro_modelo:'Palio' }),
  cli({ nome:'Bruno Henrique', telefone:'12999990013', carro:'Kicks 2021', carro_modelo:'Kicks', placa:'SNB2J33', aceita_mensagens:false,
    aceita_mensagens_em: diasAtras(40), aceita_mensagens_motivo:'desligado no painel por João Pedro: pediu no balcão' }),
];
const porId = (id) => CLIENTES.find((c) => c.id === id);
const NASC0 = new Map(CLIENTES.map((c) => [c.id, c.nascimento])); // rodada 4: ?semente=1 também volta as datas
const C = (i) => CLIENTES[i];

// ---- config ---------------------------------------------------------------
const CFG = {
  ativo_lembrete:true, ativo_posvenda:true, ativo_avaliacao:true, ativo_retorno:true, ativo_aniversario:true,
  ativo_orcamento:false, ativo_nao_fechou:false, ativo_reativacao:false,
  msg_lembrete:'Oi {primeiro_nome}! Lembrete da IndyCar: seu horário para {servico} é {quando}. Posso confirmar? Se precisar remarcar, é só responder por aqui. 🏁',
  msg_posvenda:'Oi {primeiro_nome}! Aqui é da IndyCar. Ficou tudo certo com o {carro} depois do serviço de {servico}? Qualquer coisa, é só responder por aqui. 🔧',
  msg_avaliacao:'Que bom que ficou tudo certo, {primeiro_nome}! 🙌 Se puder, deixa uma avaliação rápida no Google, ajuda muito a gente: {link_avaliacao}',
  msg_retorno:'Oi {primeiro_nome}! Já faz {meses} meses que fizemos {servico} no {carro}. Que tal agendar a revisão? É só responder por aqui. 🏁',
  msg_aniversario:'Feliz aniversário, {primeiro_nome}! 🎂 A equipe da IndyCar deseja um dia incrível. Quem conhece, Indyca! 🏎',
  msg_orcamento:'Oi {primeiro_nome}, aqui é da IndyCar! Conseguiu dar uma olhada no orçamento do {carro}? Se ficou alguma dúvida, me chama por aqui que a gente resolve junto. 🔧',
  msg_nao_fechou:'Oi {primeiro_nome}! Passando para saber se ainda posso ajudar com o {carro}. Quando quiser retomar, é só me chamar por aqui, sem compromisso. 🏁',
  msg_reativacao:'Oi {primeiro_nome}, tudo bem? Faz um tempo que a gente não vê o {carro} por aqui. Que tal um check-up gratuito de 30 min com scanner? É só responder por aqui para agendar. 🏁',
  dias_posvenda:2, meses_retorno:6, horas_lembrete:20, dias_orcamento:3, dias_nao_fechou:7, meses_reativacao:12,
  intervalo_minimo_dias:7, janela_inicio:8, janela_fim:20, hora_envio:'09:30', link_avaliacao:'https://g.page/r/indycar-taubate/review',
  envia_domingo:false, pausa_geral:false, telefone_teste:'12988887777', carteiro_configurado:true, updated_at: diasAtras(3),
  limite_por_hora:60, ia_resumo:null, ia_resumo_em:null,
  // rodada 5: cadência segura e o estado do WhatsApp que o carteiro gravou
  limite_por_minuto:10, limite_por_dia:300, intervalo_mesmo_cliente_min:60, so_horario_comercial:false,
  whatsapp: { estado:'chave_recusada', em: diasAtras(8), motivo:'A chave do CodeWords foi recusada (401).' },
};

// ---- regras de retorno e modelos (iguais ao SQL da migração) ---------------
const regra = (rotulo, palavras, meses, ordem, extra = {}) => ({ id: uuid(), rotulo, palavras, meses, mensagem:'', ativo:true, ordem, ...extra });
let REGRAS = [
  regra('Troca de óleo do motor', ['óleo', 'oleo', 'lubrifica'], 6, 10),
  regra('Filtros', ['filtro'], 6, 20),
  regra('Alinhamento e balanceamento', ['alinhamento', 'balanceamento', 'cambagem', 'caster'], 6, 30),
  regra('Freios', ['freio', 'pastilha', 'disco', 'lona', 'sapata'], 12, 40),
  regra('Suspensão e direção', ['suspens', 'amortecedor', 'pivô', 'bucha', 'terminal', 'bandeja'], 12, 50),
  regra('Correia dentada', ['correia', 'tensor'], 24, 60, { mensagem:'Oi {primeiro_nome}! A correia dentada do {carro} já tem {meses} meses — vale conferir antes que vire dor de cabeça. Posso agendar? 🏁' }),
  regra('Pneus', ['pneu', 'rodízio', 'rodizio'], 12, 70),
  regra('Bateria', ['bateria'], 18, 80, { ativo:false }),
  regra('Revisão e diagnóstico', ['revis', 'check', 'diagn', 'scanner'], 6, 140),
];
const MODELOS = [
  ['Promoção de troca de óleo', 'promoção', 'Oi {primeiro_nome}! Essa semana a IndyCar está com condição especial na troca de óleo com filtro. Quer garantir um horário para o {carro}? É só responder por aqui. 🏁'],
  ['Check-up antes de viajar', 'sazonal', 'Oi {primeiro_nome}! Vai pegar estrada no feriado? A IndyCar faz um check-up de viagem com scanner em 30 min, sem custo. Quer reservar um horário para o {carro}? 🛣️'],
  ['Freios na época de chuva', 'sazonal', 'Oi {primeiro_nome}, com as chuvas chegando vale conferir freios e pneus do {carro}. A gente faz a avaliação gratuita e só mexe no que precisar. Posso agendar? 🌧️'],
  ['Dia do Cliente', 'datas', 'Hoje é o Dia do Cliente e a IndyCar quer agradecer você, {primeiro_nome}! Obrigado pela confiança. Quem conhece, Indyca! 🏎️'],
  ['Fim de ano', 'datas', 'Oi {primeiro_nome}! A equipe da IndyCar Centro Automotivo deseja a você e à sua família um Natal cheio de paz e um ano novo de estradas tranquilas. 🎄🏁'],
  ['Convite para avaliar no Google', 'relacionamento', 'Oi {primeiro_nome}! Se o atendimento da IndyCar foi bom para você, uma avaliação rápida no Google ajuda muito a gente a crescer. Obrigado! ⭐'],
  ['Aviso de horário especial', 'aviso', 'Oi {primeiro_nome}! Avisando que a IndyCar terá horário especial: {detalhe}. Qualquer coisa, é só chamar por aqui. 🏁'],
  ['Reagendar quem faltou', 'relacionamento', 'Oi {primeiro_nome}, sentimos sua falta no horário de hoje. Aconteceu algum imprevisto? Me diz um dia e horário bons para você que eu reservo de novo. 🏁'],
  ['Pesquisa rápida', 'relacionamento', 'Oi {primeiro_nome}! De 0 a 10, quanto você indicaria a IndyCar para um amigo? Sua resposta ajuda a gente a melhorar. 🙏'],
  [MODELO_CONVITE_AREA.titulo, MODELO_CONVITE_AREA.categoria, MODELO_CONVITE_AREA.corpo],
].map(([titulo, categoria, corpo], i) => ({ id: uuid(), titulo, categoria, corpo, ordem:(i + 1) * 10 }));

// ---- agendamentos (só para a ficha) ------------------------------------------
const AG = [
  { cliente: C(0), servico:'Troca de óleo e filtro', data: somarDias(hoje(), -170), status:'concluido', valor:380 },
  { cliente: C(0), servico:'Alinhamento 3D', data: somarDias(hoje(), -40), status:'concluido', valor:150 },
  { cliente: C(0), servico:'Revisão de freios', data: somarDias(hoje(), 1), hora:'09:00', status:'confirmado', valor:0 },
  { cliente: C(1), servico:'Troca de óleo de câmbio (diálise)', data: somarDias(hoje(), -3), status:'concluido', valor:890 },
  { cliente: C(2), servico:'Pastilha de freio', data: somarDias(hoje(), -2), status:'concluido', valor:420 },
  { cliente: C(3), servico:'Revisão de suspensão', data: somarDias(hoje(), -2), status:'nao_fechou', valor:0 },
  { cliente: C(4), servico:'Alinhamento 3D', data: somarDias(hoje(), -1), status:'nao_veio', valor:0 },
  { cliente: C(5), servico:'Correia dentada', data: somarDias(hoje(), -735), status:'concluido', valor:1250 },
  { cliente: C(7), servico:'Troca de embreagem', data: somarDias(hoje(), -400), status:'concluido', valor:2100 },
  { cliente: C(8), servico:'Troca de amortecedores', data: somarDias(hoje(), -365), status:'concluido', valor:1400 },
  { cliente: C(10), servico:'Troca de óleo de motor', data: somarDias(hoje(), -183), status:'concluido', valor:360 },
  { cliente: C(10), servico:'Diagnóstico com scanner', data: somarDias(hoje(), 0), hora:'15:30', status:'aguardando', valor:0 },
].map((a) => ({ id: uuid(), hora:'10:00', veiculo: a.cliente.carro, placa: a.cliente.placa, ...a }));

// ---- envios ---------------------------------------------------------------
const env = (c, tipo, extra = {}) => {
  const base = { id: uuid(), cliente_id: c?.id ?? null, agendamento_id:null, lead_id:null, telefone: c?.telefone ?? extra.telefone, nome: c?.nome ?? extra.nome,
    tipo, lote:null, status:'pendente', erro:null, enviado_em:null, respondido_em:null, resposta:null, resposta_tipo:null, agendou_depois_id:null,
    tentativas:0, motivo_pulado:null, criado_por:'gerador', created_at: diasAtras(1), enviar_em: hojeAs(CFG.hora_envio) };
  const e = { ...base, ...extra };
  if (!e.corpo) e.corpo = renderTemplate(CFG[`msg_${tipo}`] || 'Oi {primeiro_nome}!', { nome: e.nome, carro: c?.carro, placa: c?.placa, servico:'troca de óleo', meses: CFG.meses_retorno, quando: quandoRelativo(somarDias(hoje(), 1), '09:00'), link_avaliacao: CFG.link_avaliacao });
  if (e.resposta && !e.resposta_tipo) e.resposta_tipo = classificarResposta(e.resposta);
  return e;
};
const enviado = (h, extra = {}) => ({ status:'enviado', enviado_em: horasAtras(h), enviar_em: horasAtras(h + 0.2), created_at: horasAtras(h + 1), tentativas:1, ...extra });
const ENVIOS_SEMENTE = [
  // Pátio (16/10): avisos que o banco enfileira pelo app do Pátio
  env(C(2), 'patio_entrada', { corpo: `Oi ${C(2).nome.split(' ')[0]}! O ${C(2).carro} já está com a gente na IndyCar. Você pode acompanhar cada etapa por aqui: https://indycar-patio.netlify.app/acompanhar/?t=ab12… 🏁`, criado_por:'patio', ...enviado(5) }),
  env(C(2), 'patio_extra', { corpo: `Oi ${C(2).nome.split(' ')[0]}, encontramos um item que precisa da sua decisão no ${C(2).carro}. Veja a foto e aprove ou recuse por aqui: https://indycar-patio.netlify.app/acompanhar/?t=ab12…`, criado_por:'patio', enviar_em: horasAtras(0.5), created_at: horasAtras(0.5) }),
  env(C(5), 'patio_pronto', { corpo: `Boa notícia, ${C(5).nome.split(' ')[0]}! O ${C(5).carro} está pronto para retirada. Seg a sáb, 8h às 17h30. 🏁`, criado_por:'patio', ...enviado(8, { resposta:'Passo aí às 17h!', respondido_em: horasAtras(7.5) }) }),
  env(C(8), 'area_cliente', { corpo: `Oi ${C(8).nome.split(' ')[0]}! Agora você tem a sua Área do Cliente da IndyCar… https://indycar-patio.netlify.app/minha/?c=f00d… 🏁`, criado_por:'Leonardo', ...enviado(30) }),
  env(C(10), 'remarcacao', { corpo: `Oi ${C(10).nome.split(' ')[0]}! Seu horário na IndyCar mudou: agora é ${quandoRelativo(somarDias(hoje(), 2), '14:00')}. Qualquer coisa, é só responder. 🏁`, criado_por:'agenda', ...enviado(1) }),
  env(C(0), 'lembrete', { corpo: renderTemplate(CFG.msg_lembrete, { nome:C(0).nome, carro:C(0).carro, servico:'revisão de freios', quando: quandoRelativo(somarDias(hoje(), 1), '09:00') }), enviar_em: horasAtras(-2) }),
  env(C(10), 'lembrete', { corpo: renderTemplate(CFG.msg_lembrete, { nome:C(10).nome, carro:C(10).carro, servico:'diagnóstico com scanner', quando: quandoRelativo(hoje(), '15:30') }), ...enviado(3, { resposta:'Confirmado, obrigado!', respondido_em: horasAtras(2.5) }) }),
  env(C(1), 'posvenda', { corpo: renderTemplate(CFG.msg_posvenda, { nome:C(1).nome, carro:C(1).carro, servico:'troca de óleo de câmbio' }), ...enviado(26, { resposta:'Ficou ótimo, carro tá outro! 👍', respondido_em: horasAtras(25) }) }),
  env(C(1), 'avaliacao', { corpo: renderTemplate(CFG.msg_avaliacao, { nome:C(1).nome, link_avaliacao: CFG.link_avaliacao }), criado_por:'gatilho', ...enviado(24.9) }),
  env(C(2), 'posvenda', { corpo: renderTemplate(CFG.msg_posvenda, { nome:C(2).nome, carro:C(2).carro, servico:'pastilha de freio' }), ...enviado(27, { resposta:'Não ficou bom, continua com barulho na roda', respondido_em: horasAtras(26), intencao:'reclamacao', intencao_resumo:'barulho na roda voltou depois da pastilha', intencao_em: horasAtras(25.8), mensagem_id: uuid() }) }),
  env(C(3), 'nao_fechou', { ...enviado(50) }),
  env(C(5), 'retorno', { corpo: renderTemplate(REGRAS[5].mensagem, { nome:C(5).nome, carro:C(5).carro, meses:24, servico:'correia dentada' }), ...enviado(72, { agendou_depois_id: uuid() }) }),
  env(C(8), 'retorno', { corpo: renderTemplate(CFG.msg_retorno, { nome:C(8).nome, carro:C(8).carro, meses:12, servico:'troca de amortecedores' }), ...enviado(96, { agendou_depois_id: uuid() }) }),
  env(C(0), 'aniversario', { corpo: renderTemplate(CFG.msg_aniversario, { nome:C(0).nome, carro:C(0).carro }), enviar_em: hojeAs('09:30') }),
  env(C(6), 'aniversario', { status:'pulado', motivo_pulado:'cliente pediu para não receber mensagens' }),
  env(C(9), 'reativacao', { status:'falhou', erro:'O CodeWords respondeu 500: device offline', tentativas:2, enviar_em: diasAtras(1), created_at: diasAtras(1) }),
  env(C(4), 'campanha', { corpo: renderTemplate(MODELOS[2].corpo, { nome:C(4).nome, carro:C(4).carro }), criado_por:'João Pedro', ...enviado(120) }),
  env(C(7), 'campanha', { corpo: renderTemplate(MODELOS[2].corpo, { nome:C(7).nome, carro:C(7).carro }), criado_por:'João Pedro', ...enviado(120, { resposta:'Quero sim, pode ser sábado?', respondido_em: horasAtras(118), agendou_depois_id: uuid(), intencao:'quer_agendar', intencao_resumo:'quer horário no sábado', intencao_em: horasAtras(117.8), encaminhado_em: horasAtras(117.8) }) }),
  env(C(10), 'campanha', { corpo: renderTemplate(MODELOS[2].corpo, { nome:C(10).nome, carro:C(10).carro }), criado_por:'João Pedro', ...enviado(120, { resposta:'PARAR', respondido_em: horasAtras(119) }) }),
  env(C(3), 'campanha', { corpo: renderTemplate(MODELOS[0].corpo, { nome:C(3).nome, carro:C(3).carro }), criado_por:'Leonardo', status:'cancelado', enviar_em: diasAtras(9), created_at: diasAtras(9) }),
  env(C(8), 'campanha', { corpo: renderTemplate(MODELOS[0].corpo, { nome:C(8).nome, carro:C(8).carro }), criado_por:'Leonardo', ...enviado(216) }),
  env(C(1), 'campanha', { corpo: renderTemplate(MODELOS[0].corpo, { nome:C(1).nome, carro:C(1).carro }), criado_por:'Leonardo', ...enviado(216, { resposta:'Obrigado, por enquanto não', respondido_em: horasAtras(210), intencao:'agradecimento', intencao_em: horasAtras(209.8) }) }),
  env(C(9), 'retorno', { corpo: renderTemplate(CFG.msg_retorno, { nome:C(9).nome, carro:C(9).carro, meses:6, servico:'troca de óleo' }), ...enviado(30, { resposta:'Quanto fica a revisão completa?', respondido_em: horasAtras(28), intencao:'quer_orcamento', intencao_resumo:'pergunta o preço da revisão', intencao_em: horasAtras(27.9), mensagem_id: uuid() }) }),
  env(C(11), 'avulsa', { corpo:'Oi Bruno! Sua peça chegou, pode trazer o carro amanhã de manhã. 🏁', criado_por:'Leonardo', ...enviado(5) }),
  env(null, 'avulsa', { telefone:'12988887777', nome:'Teste (João Pedro)', corpo:'Teste do IndyCar Comunicar: se você recebeu isto, o WhatsApp está saindo. 🏁', criado_por:'João Pedro', ...enviado(30) }),
  env(C(10), 'orcamento', { status:'pendente', enviar_em: horasAtras(3), created_at: horasAtras(4) }),
];

const PERFIS_BASE = JSON.parse(JSON.stringify(PERFIS));
let ENVIOS;
const semearEnvios = () => { ENVIOS = ENVIOS_SEMENTE.map((e) => ({ ...e, criado_por_id: e.criado_por === 'Leonardo' ? PID(3) : (e.criado_por === 'João Pedro' ? PID(1) : null) })); };
semearEnvios();

// ---- rodada 3: notificações, tarefas e campanhas aguardando aprovação ---------------
let NOTIFS = [], TAREFAS = [], CAMPANHAS = [];
const notif = (perfilId, tipo, titulo, corpo, link, horas, lida = false) => ({ id: uuid(), perfil_id: perfilId, tipo, titulo, corpo, link, app:'comunicar', lida_em: lida ? horasAtras(horas - 0.1) : null, created_at: horasAtras(horas) });
const tarefa = (resp, titulo, descricao, cliente, prioridade, venceH, extra = {}) => ({ id: uuid(), titulo, descricao, responsavel_id: resp, criado_por: null, cliente_id: cliente?.id || null,
  cliente_nome: cliente?.nome || null, cliente_telefone: cliente?.telefone || null, origem:'comunicar', prioridade, vence_em: horasAtras(-venceH), status:'aberta', created_at: horasAtras(26), ...extra });
/** Semente da rodada 3 — `/?semente=1` volta tudo ao começo (os testes de navegador usam). */
function semearR3() {
  NOTIFS = []; TAREFAS = []; CAMPANHAS = [];
  for (const k of Object.keys(PERFIS)) PERFIS[k] = JSON.parse(JSON.stringify(PERFIS_BASE[k]));
  for (const k of ['admin', 'gestor', 'mfa']) {
    const id = PERFIS[k].id;
    NOTIFS.push(notif(id, 'reclamacao', 'Donizetti Ferreira reclamou', 'barulho na roda voltou depois da pastilha', `/?cliente=${C(2).id}`, 25.8));
    NOTIFS.push(notif(id, 'resumo_semanal', 'Resumo da semana do Comunicar', '9 mensagens saíram, 5 responderam (56%) · 2 agendaram pela mensagem · 1 reclamação.', '/', 30, true));
  }
  NOTIFS.push(notif(PID(3), 'tarefa', 'Nova tarefa: Reclamou: Donizetti Ferreira', 'Prazo: hoje', null, 25.7));
  NOTIFS.push(notif(PID(3), 'campanha', 'Campanha recusada por Gisele Prado', 'Esta semana não: o pátio está cheio.', '/?tela=campanhas', 50, true));
  NOTIFS.push({ ...notif(PID(3), 'aguardando', 'Marcos Vinícius está esperando um consultor', 'Quanto fica a revisão completa?', `/?conversa=${uuid()}`, 2), app:'atendimento' });
  TAREFAS.push(tarefa(PID(3), 'Reclamou: Donizetti Ferreira', 'Respondeu à mensagem de Pós-venda: "Não ficou bom, continua com barulho na roda"\nLeitura da IA: barulho na roda voltou depois da pastilha\nLigue ou responda hoje.', C(2), 1, -1));
  TAREFAS.push(tarefa(PID(3), 'Quer orçamento: Marcos Vinícius', 'Respondeu à mensagem de Revisão: "Quanto fica a revisão completa?"\nMonte o orçamento ou chame para o diagnóstico gratuito.', C(9), 2, 3));
  TAREFAS.push(tarefa(PID(1), 'Conferir a chave do CodeWords', 'Régua Reativação: 3 mensagens falharam.', null, 2, 20, { origem:'manual' }));
  CAMPANHAS.push({ id: uuid(), status:'aguardando', corpo: MODELOS[0].corpo, detalhe:null, segmento:{ filtro:'todos', valor:null }, destinos:null, total_previsto: 10,
    enviar_em:null, criado_por: PID(3), criado_por_nome:'Leonardo', decidido_por:null, decidido_por_nome:null, decidido_em:null, motivo_recusa:null, created_at: horasAtras(3) });
  CAMPANHAS.push({ id: uuid(), status:'aguardando', origem:'crm', corpo: 'Oi {primeiro_nome}! Seu orçamento do {carro} ainda está de pé — quer que eu reserve um horário? 🏁', detalhe:null, segmento:null, destinos:[C(1), C(3), C(4)].map((c) => ({ cliente_id: c.id, telefone: c.telefone, nome: c.nome, carro: c.carro, placa: c.placa })), total_previsto: 3,
    enviar_em:null, criado_por: PID(3), criado_por_nome:'Leonardo (CRM)', decidido_por:null, decidido_por_nome:null, decidido_em:null, motivo_recusa:null, created_at: horasAtras(1) });
  CAMPANHAS.push({ id: uuid(), status:'recusada', corpo: MODELOS[1].corpo, detalhe:null, segmento:{ filtro:'sem_voltar', valor:6 }, destinos:null, total_previsto: 4,
    enviar_em:null, criado_por: PID(3), criado_por_nome:'Leonardo', decidido_por: PID(2), decidido_por_nome:'Gisele Prado', decidido_em: horasAtras(50), motivo_recusa:'Esta semana não: o pátio está cheio.', created_at: horasAtras(52) });
}
semearR3();

/** O mesmo papel de notificar do banco: dedupe por (perfil, chave). */
const lojaMock = {
  gestores: async (tipo) => Object.values(PERFIS).filter((x) => x.ativo && (x.papel === 'admin' || (x.papel === 'gestor' && x.apps.includes('comunicar')))
    && (!tipo || x.preferencias?.notificacoes?.[tipo] !== false)).map((x) => x.id),
  notificar: async (n) => {
    if (n.chave && NOTIFS.some((x) => x.perfil_id === n.perfil && x.chave === n.chave)) return null;
    const x = { id: uuid(), perfil_id: n.perfil, tipo: n.tipo, titulo: n.titulo, corpo: n.corpo, link: n.link, app: n.app || 'comunicar', chave: n.chave, lida_em: null, created_at: agora() };
    NOTIFS.unshift(x); return x.id;
  },
};

// ---- satisfação -----------------------------------------------------------
let RESPOSTAS = [
  { id: uuid(), cliente_id:C(1).id, envio_id: ENVIOS[2].id, satisfeito:true, nota:null, comentario:'Ficou ótimo, carro tá outro! 👍', registrado_por:'WhatsApp (automático)', origem:'whatsapp', created_at: horasAtras(25) },
  { id: uuid(), cliente_id:C(2).id, envio_id: ENVIOS[4].id, satisfeito:false, nota:null, comentario:'Não ficou bom, continua com barulho na roda', registrado_por:'WhatsApp (automático)', origem:'whatsapp', created_at: horasAtras(26) },
  { id: uuid(), cliente_id:C(3).id, envio_id:null, satisfeito:true, nota:5, comentario:'Elogiou o atendimento do Leonardo no balcão.', registrado_por:'João Pedro', origem:'manual', created_at: diasAtras(4) },
  { id: uuid(), cliente_id:C(8).id, envio_id:null, satisfeito:true, nota:4, comentario:null, registrado_por:'Leonardo', origem:'manual', created_at: diasAtras(9) },
  { id: uuid(), cliente_id:C(0).id, envio_id:null, satisfeito:true, nota:5, comentario:'Voltou só para agradecer.', registrado_por:'Leonardo', origem:'manual', created_at: diasAtras(20) },
];

// ---- saúde e carteiro -------------------------------------------------------
let SAUDE_OK = false;
let WA_MODO = null; // rodada 5 (null = segue SAUDE_OK)
let SEGMENTOS_SALVOS = [];
const semearSegmentos = () => { SEGMENTOS_SALVOS = [
  { id: uuid(), nome:'Sumidos há 6 meses', filtro:'sem_voltar', valor:'6', criado_por: PID(1), criado_por_nome:'João Pedro Famelli', usado_em: diasAtras(3), usos: 2, created_at: diasAtras(20) },
  { id: uuid(), nome:'Fizeram óleo', filtro:'servico', valor:'óleo', criado_por: PID(3), criado_por_nome:'Leonardo', usado_em: null, usos: 0, created_at: diasAtras(2) },
]; };
semearSegmentos();
// rodada 4: Render dormindo de mentira e o histórico do carteiro (24 h com dois 503 e um tempo esgotado)
let DORMIR_ATE = 0, CHAMADAS_DORMINDO = 0, PRONTO_TUDO = false;
const minAtras = (n) => new Date(Date.now() - n * 60000).toISOString();
const BATIDAS = () => Array.from({ length: 40 }, (_, i) => ({ em: minAtras(10 + i * 15), origem: i % 7 === 3 ? 'reforco' : 'cron', ok: true, enviados: i % 5 === 0 ? 2 : 0, criados: i % 9 === 0 ? 1 : 0 }))
  .filter((b, i) => i !== 12 && i !== 13);
const CHAMADAS = () => Array.from({ length: 40 }, (_, i) => ({ em: minAtras(10 + i * 15), origem: i % 7 === 3 ? 'reforco' : 'cron',
  status_code: [12, 20].includes(i) ? 503 : i === 13 ? null : 200, timed_out: i === 13, erro: i === 13 ? 'Timeout of 100000 ms reached' : null }));
const ultimaRodada = { em: horasAtras(0.4), resultado:{ ok:true, gerado:{ criados:3, pulados:1 }, enviados:3, falhas:0 } };


const lerCliente = (c) => c && ({ ...c });
const digitos = (t) => String(t ?? '').replace(/\D/g, '');

function resumo() {
  const ini7 = diasAtras(7), ini30 = diasAtras(30), inicioDia = hojeAs('00:00');
  const env30 = ENVIOS.filter((e) => e.created_at >= ini30);
  const enviados30 = env30.filter((e) => e.status === 'enviado');
  const enviados7 = enviados30.filter((e) => e.enviado_em >= ini7);
  const porRegua = {};
  for (const tipo of [...REGUAS, 'campanha', 'avulsa']) {
    const meus = enviados30.filter((e) => e.tipo === tipo);
    if (!meus.length && !CFG[`ativo_${tipo}`]) continue;
    porRegua[tipo] = { rotulo: ROTULO_TIPO[tipo], ligada: CFG[`ativo_${tipo}`] ?? null, enviadas: meus.length,
      respondidas: meus.filter((e) => e.respondido_em).length, positivas: meus.filter((e) => e.resposta_tipo === 'positiva').length,
      negativas: meus.filter((e) => e.resposta_tipo === 'negativa').length, pararam: meus.filter((e) => e.resposta_tipo === 'parar').length,
      agendaram: meus.filter((e) => e.agendou_depois_id).length };
  }
  const notas = RESPOSTAS.map((r) => Number(r.nota)).filter((n) => n >= 1 && n <= 5);
  const sat = RESPOSTAS.filter((r) => r.satisfeito).length;
  return {
    pendentes: ENVIOS.filter((e) => e.status === 'pendente').length,
    vencidos: ENVIOS.filter((e) => e.status === 'pendente' && e.enviar_em <= horasAtras(2)).length,
    enviadosHoje: enviados30.filter((e) => e.enviado_em >= inicioDia).length,
    falhas: env30.filter((e) => e.status === 'falhou').length,
    ultimoErro: env30.find((e) => e.status === 'falhou')?.erro || null,
    semana:{ enviadas: enviados7.length, respondidas: enviados7.filter((e) => e.respondido_em).length },
    mes30:{ enviadas: enviados30.length, respondidas: enviados30.filter((e) => e.respondido_em).length,
      agendaram: enviados30.filter((e) => e.agendou_depois_id).length, concluidos:2, receita:2650 },
    porRegua, reguasLigadas: REGUAS.filter((r) => CFG[`ativo_${r}`]), pausaGeral: CFG.pausa_geral,
    janela:{ inicio: CFG.janela_inicio, fim: CFG.janela_fim, domingo: CFG.envia_domingo }, carteiroConfigurado: CFG.carteiro_configurado,
    comNascimento: CLIENTES.filter((c) => c.nascimento).length,
    aniversariantesDoMes: CLIENTES.filter((c) => c.nascimento && c.nascimento.slice(5, 7) === mes)
      .map((c) => ({ nome:c.nome, telefone:c.telefone, dia:Number(c.nascimento.slice(8, 10)) })).sort((a, b) => a.dia - b.dia),
    foraDaLista: CLIENTES.filter((c) => c.aceita_mensagens === false).length,
    proximos48h: AG.filter((a) => ['aguardando', 'confirmado'].includes(a.status)).length,
    satisfacao:{ total: RESPOSTAS.length, satisfeitos: sat, insatisfeitos: RESPOSTAS.length - sat,
      pct: RESPOSTAS.length ? Math.round((sat / RESPOSTAS.length) * 100) : null,
      notaMedia: notas.length ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10 : null },
  };
}

/* Prévia das réguas: simula o que entraria na fila agora. */
function previa(so) {
  const porRegua = {}, lista = [], pulados = [], adiados = [];
  const push = (tipo, c, corpo, extra = {}) => {
    const item = { tipo, cliente_id:c.id, telefone:c.telefone, nome:c.nome, corpo, enviar_em: hojeAs(CFG.hora_envio) };
    if (c.aceita_mensagens === false) { pulados.push({ ...item, motivo:'cliente pediu para não receber mensagens', definitivo:true }); return; }
    if (extra.recente) { adiados.push({ ...item, motivo:`já recebeu mensagem há menos de ${CFG.intervalo_minimo_dias} dias`, definitivo:false }); return; }
    lista.push(item);
  };
  const gerar = {
    lembrete: () => AG.filter((a) => ['aguardando', 'confirmado'].includes(a.status)).forEach((a) =>
      push('lembrete', a.cliente, renderTemplate(CFG.msg_lembrete, { nome:a.cliente.nome, carro:a.veiculo, placa:a.placa, servico:a.servico, quando: quandoRelativo(a.data, a.hora) }))),
    posvenda: () => AG.filter((a) => a.status === 'concluido' && a.data === somarDias(hoje(), -CFG.dias_posvenda)).forEach((a) =>
      push('posvenda', a.cliente, renderTemplate(CFG.msg_posvenda, { nome:a.cliente.nome, carro:a.veiculo, placa:a.placa, servico:a.servico }))),
    retorno: () => AG.filter((a) => a.status === 'concluido').forEach((a) => {
      const { meses, regra: r } = prazoDeRetorno(a.servico, REGRAS, CFG.meses_retorno);
      const vence = somarDias(a.data, meses * 30);
      if (vence <= hoje() && vence >= somarDias(hoje(), -7)) push('retorno', a.cliente, renderTemplate(r?.mensagem || CFG.msg_retorno, { nome:a.cliente.nome, carro:a.veiculo, placa:a.placa, servico:a.servico, meses }));
    }),
    aniversario: () => CLIENTES.filter((c) => c.telefone && c.nascimento && c.nascimento.slice(5) === hoje().slice(5)).forEach((c) =>
      push('aniversario', c, renderTemplate(CFG.msg_aniversario, { nome:c.nome, carro:c.carro, placa:c.placa }))),
    orcamento: () => push('orcamento', C(10), renderTemplate(CFG.msg_orcamento, { nome:C(10).nome, carro:C(10).carro }), { recente:true }),
    nao_fechou: () => AG.filter((a) => a.status === 'nao_fechou').forEach((a) => push('nao_fechou', a.cliente, renderTemplate(CFG.msg_nao_fechou, { nome:a.cliente.nome, carro:a.veiculo }))),
    reativacao: () => [C(6), C(7)].forEach((c) => push('reativacao', c, renderTemplate(CFG.msg_reativacao, { nome:c.nome, carro:c.carro }))),
  };
  for (const [tipo, fn] of Object.entries(gerar)) {
    if (so && so !== tipo) continue;
    const antes = [lista.length, pulados.length, adiados.length];
    fn();
    porRegua[tipo] = { ligada: !!CFG[`ativo_${tipo}`], criados:0, previa: lista.length - antes[0], pulados: pulados.length - antes[1], adiados: adiados.length - antes[2] };
  }
  return { simulado:true, porRegua, criados:0, pulados: pulados.length, adiados: adiados.length, previa: lista, puladosDetalhe: pulados, adiadosDetalhe: adiados, erros: [] };
}

function segmentar(filtro, valor) {
  const ok = (c) => c.telefone && c.aceita_mensagens !== false;
  switch (filtro) {
    case 'todos': return CLIENTES.filter(ok);
    case 'aniversariantes_mes': return CLIENTES.filter((c) => ok(c) && c.nascimento && c.nascimento.slice(5, 7) === mes);
    case 'atendidos': { const d = Number(valor) || 90; const ids = new Set(AG.filter((a) => a.status === 'concluido' && a.data >= somarDias(hoje(), -d)).map((a) => a.cliente.id)); return CLIENTES.filter((c) => ok(c) && ids.has(c.id)); }
    case 'sem_voltar': { const m = Number(valor) || 6; const ids = new Set(AG.filter((a) => a.status === 'concluido' && a.data <= somarDias(hoje(), -m * 30)).map((a) => a.cliente.id)); return CLIENTES.filter((c) => ok(c) && ids.has(c.id)); }
    case 'faltaram': { const ids = new Set(AG.filter((a) => a.status === 'nao_veio').map((a) => a.cliente.id)); return CLIENTES.filter((c) => ok(c) && ids.has(c.id)); }
    case 'servico': { const p = String(valor || '').toLowerCase(); if (p.length < 2) return []; const ids = new Set(AG.filter((a) => a.status === 'concluido' && a.servico.toLowerCase().includes(p)).map((a) => a.cliente.id)); return CLIENTES.filter((c) => ok(c) && ids.has(c.id)); }
    default: return null;
  }
}

/** Filtros novos da fila: período (fuso de SP) e intenção lida pela IA. */
function filtrarExtra(l, sp) {
  const de = dataBanco(sp.get('de')), ate = dataBanco(sp.get('ate')), int = sp.get('intencao');
  if (de) l = l.filter((e) => e.enviar_em >= instanteSP(de, '00:00').toISOString());
  if (ate) l = l.filter((e) => e.enviar_em < instanteSP(somarDias(ate, 1), '00:00').toISOString());
  if (int && int !== 'todas') l = l.filter((e) => (int === 'qualquer' ? !!e.intencao : e.intencao === int));
  return l;
}

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }); res.end(JSON.stringify(obj)); };
/* Dublê do supabase-js: sessão, login (senha "errada" falha), esqueci a senha,
   senha nova, sair e duas etapas (código 123456). Nada sai daqui. */
const dubleSupabase = () => `<script>window.__MOCK=${JSON.stringify({ logado: LOGADO, mfa: !!perfil().mfa, email: perfil().email })};
(function(){var M=window.__MOCK,aal2=!M.mfa,sessao=M.logado,fatores=M.mfa?[{id:'f1',status:'verified',friendly_name:'Celular',created_at:'2026-10-01T12:00:00Z'}]:[];
var tok=function(){return aal2?'mock-aal2':'mock-aal1'};
window.supabase={createClient:function(){return{auth:{
  getSession:async function(){return{data:{session:sessao?{access_token:tok(),user:{email:M.email}}:null}}},
  refreshSession:async function(){return{data:{session:sessao?{access_token:tok()}:null}}},
  signInWithPassword:async function(c){if(c.password==='errada')return{error:{message:'Invalid login credentials'}};sessao=true;return{error:null}},
  signOut:async function(){sessao=false;return{error:null}},
  resetPasswordForEmail:async function(){return{error:null}},
  updateUser:async function(d){if(d&&d.password==='senha-fraca')return{error:{message:'Password is known to be weak'}};return{data:{},error:null}},
  onAuthStateChange:function(){return{data:{subscription:{unsubscribe:function(){}}}}},
  mfa:{getAuthenticatorAssuranceLevel:async function(){return{data:{currentLevel:aal2?'aal2':'aal1',nextLevel:fatores.some(function(f){return f.status==='verified'})?'aal2':'aal1'}}},
    listFactors:async function(){return{data:{totp:fatores,all:fatores},error:null}},
    challengeAndVerify:async function(a){if(a.code!=='123456')return{error:{message:'Invalid TOTP code entered'}};aal2=true;fatores.forEach(function(f){if(f.id===a.factorId)f.status='verified'});return{data:{},error:null}},
    enroll:async function(){var f={id:'f'+(fatores.length+2),status:'unverified',friendly_name:'Comunicar'};fatores.push(f);return{data:{id:f.id,totp:{qr_code:'data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="#fff"/><rect x="20" y="20" width="40" height="40"/><rect x="120" y="20" width="40" height="40"/><rect x="20" y="120" width="40" height="40"/><rect x="80" y="80" width="20" height="20"/></svg>'),secret:'JBSWY3DPEHPK3PXP'}},error:null}},
    unenroll:async function(a){fatores=fatores.filter(function(f){return f.id!==a.factorId});return{data:{},error:null}}}}}}};})();</script>`;

/** Status do WhatsApp conforme ?whatsapp= (rodada 5) ou ?saude= */
function statusWA() {
  const modo = WA_MODO || (SAUDE_OK ? 'ok' : 'recusada');
  if (modo === 'ok') return { ok:true, conectado:true, numero:'5512997000000' };
  if (modo === 'desconectado') return { ok:true, conectado:false, classe:'desconectado', situacao:'disconnected', numero:'5512997000000' };
  if (modo === 'instavel') return { ok:false, classe:'instabilidade', erro:'O CodeWords respondeu 502.' };
  if (modo === 'numero') return { ok:true, conectado:true, numero:'5512997000000' };
  return { ok:false, chaveRecusada:true, classe:'chave_recusada', erro:'A chave do CodeWords foi recusada (401).' };
}
/** Candidatos BRUTOS do segmento (antes de tirar opt-out/sem telefone) — a peneira real decide. */
function segmentarBruto(filtro, valor) {
  switch (filtro) {
    case 'todos': return CLIENTES.slice();
    case 'aniversariantes_mes': return CLIENTES.filter((c) => c.nascimento && c.nascimento.slice(5, 7) === mes);
    case 'atendidos': { const d = Number(valor) || 90; const ids = new Set(AG.filter((a) => a.status === 'concluido' && a.data >= somarDias(hoje(), -d)).map((a) => a.cliente.id)); return CLIENTES.filter((c) => ids.has(c.id)); }
    case 'sem_voltar': { const mz = Number(valor) || 6; const ids = new Set(AG.filter((a) => a.status === 'concluido' && a.data <= somarDias(hoje(), -mz * 30)).map((a) => a.cliente.id)); return CLIENTES.filter((c) => ids.has(c.id)); }
    case 'faltaram': { const ids = new Set(AG.filter((a) => a.status === 'nao_veio').map((a) => a.cliente.id)); return CLIENTES.filter((c) => ids.has(c.id)); }
    case 'servico': { const pz = String(valor || '').toLowerCase(); if (pz.length < 2) return []; const ids = new Set(AG.filter((a) => a.status === 'concluido' && a.servico.toLowerCase().includes(pz)).map((a) => a.cliente.id)); return CLIENTES.filter((c) => ids.has(c.id)); }
    default: return null;
  }
}
/** O que a rpc cliente_360 devolveria para um cliente de mentira (conversa, lead, pátio, tarefas). */
function c360Mock(c, tel) {
  if (!c) return { telefone: tel, conversa: null, leads: [], patio: [], orcamentos: [], tarefas: [], agendamentos: [], indicacoes: {}, resumo: null };
  const ags = AG.filter((a) => a.cliente.id === c.id);
  const i = CLIENTES.indexOf(c);
  return {
    telefone: digitos(c.telefone),
    conversa: i % 3 !== 1 ? { id: PID(500 + i), status:'aberta', etapa: ['Novo contato', 'Orçamento', 'Agendado'][i % 3], atribuida_a_nome: i % 2 ? 'Leonardo' : null, aguardando_consultor: i === 2 } : null,
    leads: i % 2 === 0 ? [{ id: PID(600 + i), status: ['orcamento', 'agendado', 'concluido'][i % 3], servico: ags[0]?.servico || 'Revisão', valor_orcado: 450, responsavel_nome: 'Leonardo', created_at: diasAtras(5) }] : [],
    patio: i === 0 ? [{ id: PID(700), numero: 1042, etapa:'em_execucao', veiculo: c.carro, placa: c.placa, extras_pendentes: 1, link_cliente: `${PATIO_URL}/acompanhar/?t=ab12cd34ef56ab12cd34ef56` }] : (i === 5 ? [{ id: PID(705), numero: 1031, etapa:'entregue', veiculo: c.carro, placa: c.placa, extras_pendentes: 0 }] : []),
    orcamentos: i === 2 ? [{ id: PID(800), status:'enviado', total: 890, created_at: diasAtras(2) }] : [],
    tarefas: TAREFAS.filter((t) => t.cliente_id === c.id && t.status === 'aberta').map((t) => ({ id: t.id, titulo: t.titulo, vence_em: t.vence_em, responsavel_nome: nomeDe(t.responsavel_id), origem: t.origem })),
    agendamentos: ags.slice(0, 5).map((a) => ({ id: a.id, data: a.data, hora: a.hora, servico: a.servico, status: a.status, consultor_nome: 'Leonardo' })),
    indicacoes: i === 7 ? { fez: [{}, {}], foi_indicado_por: null } : (i === 8 ? { fez: [], foi_indicado_por: { nome: 'Maria Aparecida Souza' } } : {}),
    resumo: { mensagens_total: 12 + i, leads_abertos: i % 2 === 0 ? 1 : 0, total_gasto: ags.filter((a) => a.status === 'concluido').reduce((s2, a) => s2 + a.valor, 0), ultima_visita: ags.find((a) => a.status === 'concluido')?.data || null },
  };
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname, m = req.method;
  if (!p.startsWith('/api/')) {
    if (p === '/' || p === '/index.html') {
      if (url.searchParams.has('papel')) { const k = url.searchParams.get('papel'); PAPEL = PERFIS[k] ? k : 'admin'; }
      LOGADO = url.searchParams.get('logado') !== '0';
      if (url.searchParams.get('semente') === '1') { semearEnvios(); semearR3(); semearSegmentos(); WA_MODO = null; for (const c of CLIENTES) c.nascimento = NASC0.get(c.id) ?? null; }
      if (url.searchParams.has('saude')) SAUDE_OK = url.searchParams.get('saude') === 'ok';
      if (url.searchParams.has('ia')) IA_LIGADA = url.searchParams.get('ia') !== 'off';
      // rodada 4: ?dormir=20 → por 20 s toda a API responde 503 em HTML (como o Render acordando)
      if (url.searchParams.has('dormir')) DORMIR_ATE = Date.now() + (Number(url.searchParams.get('dormir')) || 20) * 1000;
      // ?pronto=tudo → o checklist sai todo verde (WhatsApp ok, réguas, datas…)
      if (url.searchParams.has('pronto')) PRONTO_TUDO = url.searchParams.get('pronto') === 'tudo';
      // rodada 5: ?whatsapp=ok|recusada|desconectado|instavel|numero → o painel "Saúde do WhatsApp" em cada estado
      if (url.searchParams.has('whatsapp')) WA_MODO = url.searchParams.get('whatsapp') || 'recusada';
      const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8')
        .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase[^"]*"><\/script>/, dubleSupabase());
      res.writeHead(200, { 'Content-Type': MIME['.html'] }); return res.end(html);
    }
    if (p === '/sw.js') { res.writeHead(200, { 'Content-Type': MIME['.js'] }); return res.end('/* sem service worker no modo de teste */'); }
    const arq = path.join(PUBLIC, path.normalize(p));
    if (!arq.startsWith(PUBLIC) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end('Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(arq)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    return fs.createReadStream(arq).pipe(res);
  }

  if (Date.now() < DORMIR_ATE) {
    CHAMADAS_DORMINDO++;
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'x-render-routing': 'hibernate-wake-error' });
    return res.end('<html><body>Service Unavailable</body></html>');
  }
  let body = {};
  if (m !== 'GET') { let b = ''; for await (const c of req) b += c; try { body = JSON.parse(b || '{}'); } catch {} }
  await new Promise((r) => setTimeout(r, 180));            // latência de verdade, para ver o esqueleto
  const naoGestor = () => json(res, 403, { erro:'Só gestor altera as réguas.' });
  let mm;

  if (p === '/api/config') return json(res, 200, { configurado:true, supabaseUrl:'http://mock.local', supabaseAnonKey:'mock', app:'IndyCar Comunicar', versao:'5.0.0-mock', prefixo:'' });
  if (p === '/api/ping') return json(res, 200, { ok:true, versao:'4.0.0-mock' });

  /* Porteiro: as MESMAS regras do servidor (acesso.js) — rota, acesso ao app,
     segundo fator, troca de senha obrigatória e permissão do papel. */
  const regra = A.regraDaRota(m, p);
  if (regra?.metodoErrado) return json(res, 405, { erro:'Método não permitido.' });
  const eu = perfil();
  if (regra && !regra.publica) {
    if (!/^Bearer mock/.test(req.headers.authorization || '')) return json(res, 401, { erro:'Faça login para usar o Comunicar.', codigo:'sem_login' });
    const v = A.verificarAcesso(eu);
    if (!v.ok) return json(res, v.status, { erro: v.erro, codigo: v.codigo, apps: v.apps });
    if (eu.mfa && req.headers.authorization !== 'Bearer mock-aal2') return json(res, 401, { erro:'Digite o código do seu app autenticador.', codigo:'mfa_pendente' });
    if (eu.precisa_trocar_senha && regra.perm !== 'conta') return json(res, 403, { erro:'Troque sua senha para continuar.', codigo:'trocar_senha' });
    if (!A.pode(eu, regra.perm)) return json(res, 403, { erro: A.motivo403(regra.perm), codigo:'sem_permissao' });
  }

  // ---- conta: perfil, sino, tarefas
  if (p === '/api/perfil' && m === 'GET') return json(res, 200, {
    id: eu.id, nome: eu.nome, email: eu.email, papel: eu.papel, cargo: eu.cargo || '', telefone: eu.telefone || '', avatar_cor: eu.avatar_cor || null,
    apps: eu.apps, precisa_trocar_senha: !!eu.precisa_trocar_senha, notificacoes: eu.preferencias?.notificacoes || {},
    pode: Object.fromEntries(Object.keys(A.PERMISSOES).map((k) => [k, A.pode(eu, k)])) });
  if (p === '/api/perfil' && m === 'PUT') {
    const { campos, erro } = A.camposDoMeuPerfil(body);
    if (erro) return json(res, 400, { erro });
    if (campos.preferencias) campos.preferencias = A.mesclarPreferencias(eu.preferencias, campos.preferencias);
    Object.assign(eu, campos);
    return json(res, 200, { ok:true, nome: eu.nome, cargo: eu.cargo, telefone: eu.telefone, avatar_cor: eu.avatar_cor, notificacoes: eu.preferencias?.notificacoes || {} });
  }
  if (p === '/api/perfil/senha-trocada' && m === 'POST') { eu.precisa_trocar_senha = false; return json(res, 200, { ok:true }); }
  if (p === '/api/notificacoes' && m === 'GET') {
    const minhas = NOTIFS.filter((n) => n.perfil_id === eu.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return json(res, 200, { lista: minhas.slice(0, 30), naoLidas: minhas.filter((n) => !n.lida_em).length });
  }
  if (p === '/api/notificacoes/lidas' && m === 'POST') { let n = 0; for (const x of NOTIFS) if (x.perfil_id === eu.id && !x.lida_em) { x.lida_em = agora(); n++; } return json(res, 200, { ok:true, marcadas:n }); }
  if ((mm = p.match(/^\/api\/notificacoes\/([0-9a-f-]+)\/lida$/)) && m === 'POST') {
    const x = NOTIFS.find((n) => n.id === mm[1] && n.perfil_id === eu.id); if (!x) return json(res, 404, { erro:'Não encontrado.' });
    x.lida_em = agora(); return json(res, 200, x);
  }
  if (p === '/api/tarefas' && m === 'GET') return json(res, 200, TAREFAS.filter((t) => t.responsavel_id === eu.id && t.status === 'aberta')
    .sort((a, b) => a.prioridade - b.prioridade || String(a.vence_em || 'z').localeCompare(String(b.vence_em || 'z'))));
  if (p === '/api/tarefas' && m === 'POST') {
    const titulo = String(body.titulo || '').trim();
    if (titulo.length < 2) return json(res, 400, { erro:'Escreva o que precisa ser feito.' });
    const c = porId(body.cliente_id);
    const t = tarefa(body.responsavel_id || eu.id, titulo, body.descricao || null, c, [1, 2, 3].includes(Number(body.prioridade)) ? Number(body.prioridade) : 2, 0,
      { vence_em: body.vence_em || null, criado_por: eu.id, created_at: agora() });
    TAREFAS.unshift(t); return json(res, 200, t);
  }
  if ((mm = p.match(/^\/api\/tarefas\/([0-9a-f-]+)\/concluir$/)) && m === 'POST') {
    const t = TAREFAS.find((x) => x.id === mm[1]); if (!t) return json(res, 404, { erro:'Não encontrado.' });
    if (!ehGestor() && t.responsavel_id !== eu.id && t.criado_por !== eu.id) return json(res, 403, { erro:'Essa tarefa é de outra pessoa.', codigo:'sem_permissao' });
    if (t.status !== 'aberta') return json(res, 400, { erro:'Essa tarefa já foi concluída.' });
    t.status = 'feita'; return json(res, 200, t);
  }

  // ---- campanhas com aprovação
  if (p === '/api/campanhas/aprovacao' && m === 'GET') {
    const st = url.searchParams.get('status');
    const l = CAMPANHAS.filter((c) => (ehGestor() || c.criado_por === eu.id) && (!st || st === 'todas' || c.status === st));
    return json(res, 200, { lista: l, aguardando: l.filter((c) => c.status === 'aguardando').length, gestor: ehGestor() });
  }
  if ((mm = p.match(/^\/api\/campanhas\/([0-9a-f-]+)\/(aprovar|recusar|cancelar)$/)) && m === 'POST') {
    const c = CAMPANHAS.find((x) => x.id === mm[1]); if (!c) return json(res, 404, { erro:'Não encontrado.' });
    if (c.status !== 'aguardando') return json(res, 409, { erro:'Essa campanha já foi decidida.' });
    if (mm[2] === 'cancelar' && !ehGestor() && c.criado_por !== eu.id) return json(res, 403, { erro:'Só quem propôs (ou um gestor) cancela essa campanha.', codigo:'sem_permissao' });
    Object.assign(c, { decidido_por: eu.id, decidido_por_nome: eu.nome, decidido_em: agora() });
    if (mm[2] === 'recusar') { c.status = 'recusada'; c.motivo_recusa = String(body.motivo || '').slice(0, 200) || null; }
    if (mm[2] === 'cancelar') c.status = 'cancelada';
    let r = { enfileirados:0, pulados:0 };
    if (mm[2] === 'aprovar') {
      c.status = 'aprovada';
      const lista = c.segmento ? (segmentar(c.segmento.filtro, c.segmento.valor) || []) : (c.destinos || []).map((d) => porId(d.cliente_id)).filter(Boolean);
      const lote = uuid();
      for (const cli of lista) { ENVIOS.unshift(env(cli, 'campanha', { lote, campanha_id: c.id, corpo: renderTemplate(c.corpo, { nome: cli.nome, carro: cli.carro, placa: cli.placa }), enviar_em: agora(), created_at: agora(), criado_por: c.criado_por_nome, criado_por_id: c.criado_por })); r.enfileirados++; }
      Object.assign(c, { lote, enfileirados: r.enfileirados, pulados: 0 });
    }
    if (mm[2] !== 'cancelar') await auto.avisarDecisaoDeCampanha({ campanha: c, loja: lojaMock });
    return json(res, 200, { ok:true, campanha: c, ...r });
  }
  if (p === '/api/resumo') return json(res, 200, resumo());
  if (p === '/api/saude') return json(res, 200, SAUDE_OK
    ? { ok:true, problema:null, desde:null, checado_em: agora(), resumo:null, whatsappParado:false, versao:'2.0.0-mock', ultimaRodada }
    : { ok:false, problema:'codewords-fora', desde: diasAtras(8), checado_em: agora(), resumo:'CodeWords respondeu 401 nas últimas 3 checagens.', whatsappParado:true, versao:'2.0.0-mock', ultimaRodada });
  if (p === '/api/whatsapp/status') return json(res, 200, statusWA());

  // ---- rodada 5 -------------------------------------------------------------------
  if (p === '/api/whatsapp/saude' || (p === '/api/whatsapp/reconferir' && m === 'POST')) {
    if (p.endsWith('reconferir') && !ehGestor()) return json(res, 403, { erro: A.motivo403('rodar'), codigo:'sem_permissao' });
    const falhas = {};
    for (const e of ENVIOS) if (e.erro && ['falhou', 'pendente'].includes(e.status)) { const cl = e.erro_classe || classificarErro({ texto: e.erro }).classe; const x = (falhas[cl] ||= { total:0, ultimoErro:null, ultimoEm:null }); x.total++; if (!x.ultimoErro) { x.ultimoErro = e.erro; x.ultimoEm = e.enviar_em; } }
    const pend = ENVIOS.filter((e) => e.status === 'pendente');
    const s = montarSaude({ status: statusWA(), falhas24h: falhas, fila: { pendentes: pend.length, atrasados: pend.filter((e) => e.enviar_em <= horasAtras(2)).length }, carteiro: { ultimaEm: ultimaRodada.em, falhas24h: 3 }, estadoGravado: CFG.whatsapp });
    return json(res, 200, { ...s, cadencia: { porMinuto: CFG.limite_por_minuto, porHora: CFG.limite_por_hora, porDia: CFG.limite_por_dia, mesmoCliente: CFG.intervalo_mesmo_cliente_min, janela: { inicio: CFG.janela_inicio, fim: CFG.janela_fim }, soHorarioComercial: !!CFG.so_horario_comercial }, conferidoEm: agora() });
  }
  if (p === '/api/segmentos/salvos' && m === 'GET') return json(res, 200, SEGMENTOS_SALVOS.slice().sort((a, b) => String(b.usado_em || '').localeCompare(String(a.usado_em || '')) || (a.created_at < b.created_at ? 1 : -1)));
  if (p === '/api/segmentos/salvos' && m === 'POST') {
    const nome = String(body.nome || '').trim();
    if (nome.length < 2) return json(res, 400, { erro:'Dê um nome ao segmento (2 a 60 letras).' });
    if (!SEGMENTOS.some((x) => x.id === body.filtro)) return json(res, 400, { erro:'Segmento desconhecido.' });
    const sg = { id: uuid(), nome: nome.slice(0, 60), filtro: body.filtro, valor: body.valor == null || body.valor === '' ? null : String(body.valor), criado_por: eu.id, criado_por_nome: eu.nome, usado_em: null, usos: 0, created_at: agora() };
    SEGMENTOS_SALVOS.unshift(sg); return json(res, 200, sg);
  }
  if ((mm = p.match(/^\/api\/segmentos\/salvos\/([0-9a-f-]+)$/)) && m === 'DELETE') {
    const sg = SEGMENTOS_SALVOS.find((x) => x.id === mm[1]); if (!sg) return json(res, 404, { erro:'Não encontrado.' });
    if (sg.criado_por !== eu.id && !ehGestor()) return json(res, 403, { erro: A.motivo403('segmentos_apagar'), codigo:'sem_permissao' });
    SEGMENTOS_SALVOS = SEGMENTOS_SALVOS.filter((x) => x.id !== mm[1]); return json(res, 200, { ok:true });
  }
  if (p === '/api/envios/teste-meu' && m === 'POST') {
    if (!digitos(eu.telefone || '')) return json(res, 400, { erro:'Cadastre seu celular em "Meu perfil" para receber o teste.', codigo:'sem_telefone' });
    if (!String(body.corpo || '').trim()) return json(res, 400, { erro:'Escreva a mensagem antes de testar.' });
    if (statusWA().chaveRecusada) return json(res, 502, { erro:'A chave do CodeWords foi recusada (401). Gere uma nova em runtime.codewords.ai e cole em Atendimento › Configurações › Integrações.', classe:'chave_recusada' });
    return json(res, 200, { ok:true, telefone: '…' + digitos(eu.telefone).slice(-4) });
  }
  if (p === '/api/clientes/360') {
    const tel = digitos(url.searchParams.get('tel') || '');
    if (tel.length < 10) return json(res, 400, { erro:'Informe o telefone com DDD.' });
    const c = CLIENTES.find((x) => digitos(x.telefone).endsWith(tel.slice(-10)));
    return json(res, 200, { telefone: tel, cliente: c ? { id: c.id, nome: c.nome, telefone: c.telefone, carro_modelo: c.carro_modelo, placa: c.placa } : null, ligacoes: montarLigacoes(c360Mock(c, tel)), resumo: null });
  }
  if ((mm = p.match(/^\/api\/envios\/([0-9a-f-]+)\/ligacoes$/)) && m === 'GET') {
    const e = ENVIOS.find((x) => x.id === mm[1]); if (!e) return json(res, 404, { erro:'Não encontrado.' });
    const c = porId(e.cliente_id); const lig = montarLigacoes(c360Mock(c, e.telefone));
    const osId = e.tipo?.startsWith('patio_') ? uuid() : null;
    return json(res, 200, { envio: { id: e.id, tipo: e.tipo, status: e.status, nome: e.nome, telefone: e.telefone, cliente_id: e.cliente_id },
      links: { conversa: lig?.conversa?.link || LINKS.conversaTel(e.telefone), lead: lig?.leads?.[0]?.link || null, agendamento: e.agendamento_id ? LINKS.agendamento(e.agendamento_id) : (lig?.agendamentos?.[0]?.link || null), os: LINKS.os(osId || lig?.carroNaOficina?.id || null), cliente_crm: LINKS.clienteCrm(e.cliente_id, e.telefone) }, ligacoes: lig });
  }
  if (p === '/api/relatorio/reguas') {
    const de = dataBanco(url.searchParams.get('de')) || somarDias(hoje(), -30), ate = dataBanco(url.searchParams.get('ate')) || hoje();
    const l = ENVIOS.filter((e) => e.enviar_em >= instanteSP(de, '00:00').toISOString() && e.enviar_em < instanteSP(somarDias(ate, 1), '00:00').toISOString());
    return json(res, 200, { periodo: { de, ate }, linhas: montarRelatorioPorRegua(l) });
  }
  if (p === '/api/previa/mensagem') {
    const c = porId(url.searchParams.get('cliente_id')); if (!c) return json(res, 404, { erro:'Não encontrado.' });
    const corpo = String(url.searchParams.get('corpo') || '');
    const a = AG.filter((x) => x.cliente.id === c.id).sort((x, y) => (x.data < y.data ? 1 : -1))[0] || null;
    const temOs = a && c.id === C(0).id;
    const links = { link_os: /\{link_os\}/.test(corpo) ? (temOs ? linkOs(null, 'ab12cd34ef56ab12cd34ef56') : '') : undefined, link_area: /\{link_area\}/.test(corpo) ? `${PATIO_URL}/minha/?c=(link-do-cliente)` : undefined };
    const falta = /\{link_os\}/.test(corpo) && !links.link_os ? 'sem ordem no Pátio para este horário (o {link_os} ficaria vazio)' : null;
    const texto = renderTemplate(corpo, { nome: c.nome, carro: c.carro, placa: c.placa, servico: a?.servico || 'o serviço', meses: CFG.meses_retorno, quando: a ? quandoRelativo(a.data, a.hora) : 'amanhã às 09:00', link_avaliacao: CFG.link_avaliacao, detalhe:'…', ...links });
    return json(res, 200, { cliente: { id: c.id, nome: c.nome, telefone: c.telefone, carro: c.carro, placa: c.placa }, agendamento: a ? { id: a.id, data: a.data, hora: a.hora, servico: a.servico, status: a.status } : null, texto, falta });
  }

  if ((p === '/api/comunicar/config' || p === '/api/posvenda/config') && m === 'GET') return json(res, 200, CFG);
  if ((p === '/api/comunicar/config' || p === '/api/posvenda/config') && m === 'PUT') {
    if (!ehGestor()) return naoGestor();
    for (const [k, v] of Object.entries(body)) if (k in CFG) CFG[k] = k === 'telefone_teste' ? digitos(v) : v;
    CFG.updated_at = agora();
    return json(res, 200, CFG);
  }
  if (p === '/api/previa') return json(res, 200, previa(url.searchParams.get('regua')));
  if (p === '/api/rodar-agora' && m === 'POST') {
    const pr = previa(null);
    const novos = pr.previa.filter((x) => REGUAS.includes(x.tipo) && CFG[`ativo_${x.tipo}`]).slice(0, 2);
    for (const x of novos) ENVIOS.unshift(env(porId(x.cliente_id), x.tipo, { corpo:x.corpo, created_at: agora() }));
    const r = { ok:true, gerado:{ porRegua: pr.porRegua, criados: novos.length, pulados: pr.pulados }, enviados: CFG.pausa_geral ? 0 : 1, falhas:0,
      aviso: CFG.pausa_geral ? 'Envios pausados: a pausa geral está ligada.' : undefined };
    if (!CFG.pausa_geral) { const pend = ENVIOS.find((e) => e.status === 'pendente'); if (pend) { pend.status = 'enviado'; pend.enviado_em = agora(); pend.tentativas = 1; } }
    ultimaRodada.em = agora(); ultimaRodada.resultado = r;
    return json(res, 200, r);
  }

  // ---- fila
  if (p === '/api/envios' && m === 'GET') {
    const st = url.searchParams.get('status'), tipo = url.searchParams.get('tipo'), q = (url.searchParams.get('q') || '').toLowerCase();
    let l = ENVIOS.slice();
    if (st && st !== 'todas') l = l.filter((e) => e.status === st);
    if (tipo && tipo !== 'todos') l = l.filter((e) => e.tipo === tipo);
    if (q) l = l.filter((e) => [e.nome, e.corpo, e.telefone].some((x) => String(x || '').toLowerCase().includes(q)));
    l = filtrarExtra(l, url.searchParams);
    l.sort((a, b) => (a.enviar_em < b.enviar_em ? 1 : -1));
    const ini = Number(url.searchParams.get('offset')) || 0;
    return json(res, 200, l.slice(ini, ini + (Number(url.searchParams.get('limite')) || 300)));
  }

  // ---- rodada 4 ---------------------------------------------------------------
  if (p === '/api/fila/contagem') return json(res, 200, { pendentes: ENVIOS.filter((e) => e.status === 'pendente').length });
  if (p === '/api/carteiro') return json(res, 200, { ...resumirCarteiro({ batidas: BATIDAS(), chamadas: CHAMADAS(), janela: { inicio: CFG.janela_inicio, fim: CFG.janela_fim } }), configurado: true, janela: { inicio: CFG.janela_inicio, fim: CFG.janela_fim } });
  if (p === '/api/pronto') {
    const fatos = PRONTO_TUDO
      ? { cfg: CFG, whatsapp: { ok: true, conectado: true }, carteiro: resumirCarteiro({ batidas: BATIDAS(), chamadas: CHAMADAS() }), aniversarios: { comData: 9, total: 12 }, ia: { ativo: true, temChave: true }, teste: { ultimoOkEm: horasAtras(30) } }
      : { cfg: { ...CFG, link_avaliacao: SAUDE_OK ? CFG.link_avaliacao : '' }, whatsapp: SAUDE_OK ? { ok: true, conectado: true } : { ok: false, chaveRecusada: true },
          carteiro: resumirCarteiro({ batidas: BATIDAS(), chamadas: CHAMADAS() }), aniversarios: { comData: CLIENTES.filter((c) => c.nascimento).length, total: CLIENTES.filter((c) => c.telefone).length },
          ia: { ativo: IA_LIGADA, temChave: true }, teste: { ultimoOkEm: null } };
    fatos.patio = { cfg: { avisar_pronto: true, avisar_extra: true, enviar_link_entrada: true }, fila: { pendentes: ENVIOS.filter((e) => e.status === 'pendente' && e.tipo?.startsWith('patio_')).length, maisAntigoEm: null } };
    return json(res, 200, { ...montarProntidao(fatos), gestor: ehGestor() });
  }
  if (p === '/api/projecao') {
    const agendamentos = AG.map((a) => ({ id: a.id, cliente_id: a.cliente.id, cliente_nome: a.cliente.nome, telefone: a.cliente.telefone, servico: a.servico, data: a.data, hora: a.hora, status: a.status }));
    const leads = [{ id: uuid(), cliente_id: C(4).id, nome: C(4).nome, telefone: C(4).telefone, status: 'orcamento', updated_at: diasAtras(2) }];
    return json(res, 200, projetarMes({ hoje: hoje(), cfg: CFG, regras: REGRAS, agendamentos, clientes: CLIENTES, leads, taxaAvaliacao: 0.5 }));
  }
  if (p === '/api/aniversarios/analisar' && m === 'POST') {
    const lido = lerLista(String(body.texto || ''));
    if (!lido.linhas.length) return json(res, 400, { erro: 'Não achei nenhuma linha com conteúdo.' });
    const itens = casarComClientes(lido.linhas, CLIENTES);
    return json(res, 200, { itens, resumo: resumirAnalise(itens), cabecalho: lido.cabecalho, cortado: !!lido.cortado });
  }
  if (p === '/api/aniversarios/gravar' && m === 'POST') {
    const itens = (Array.isArray(body.itens) ? body.itens : []).filter((i) => porId(i.cliente_id) && lerData(i.nascimento));
    if (!itens.length) return json(res, 400, { erro: 'Nada para gravar: escolha pelo menos um cliente com data válida.' });
    if (itens.length > 1 && !A.pode(eu, 'importar')) return json(res, 403, { erro: 'Gravar uma lista inteira é com o gestor. Peça a ele, ou cadastre um por vez na ficha.', codigo: 'sem_permissao' });
    let gravados = 0;
    for (const i of itens) { const c = porId(i.cliente_id); if (c.nascimento && !(body.substituir && A.pode(eu, 'importar'))) continue; c.nascimento = lerData(i.nascimento); gravados++; }
    return json(res, 200, { ok: true, gravados, ignorados: itens.length - gravados, erros: [] });
  }
  if (p === '/api/aniversarios/sugestoes') {
    const textos = { fichas: [{ ...C(4), observacoes: 'Cliente comentou: meu aniversário é 22/11, quer desconto no mês.' }],
      leads: [{ cliente_id: C(9).id, observacoes: 'Nasci em 3 de março de 1985 — disse no telefone' }],
      mensagens: [{ corpo: 'Semana que vem é meu aniversário, dia 28/10! Dá pra marcar depois?', conversa: { cliente_id: C(11).id } }] };
    const mapa = new Map(CLIENTES.map((c) => [c.id, c]));
    return json(res, 200, { sugestoes: montarSugestoes(textos, mapa), lidos: { fichas: 1, crm: 1, conversas: 1 } });
  }
  if (p === '/api/pedir-gestor' && m === 'POST') {
    const ids = (await lojaMock.gestores()).filter((id) => id !== eu.id);
    let avisados = 0;
    for (const perfilId of ids) if (await lojaMock.notificar({ perfil: perfilId, tipo: 'pedido', titulo: `${eu.nome} pede: ${body.assunto || 'ajuda'}`, corpo: body.detalhe || null, link: '/?tela=reguas', chave: `pedido:${eu.id}:${body.assunto}:${hoje()}` })) avisados++;
    return json(res, 200, { ok: true, avisados });
  }
  if (p === '/api/equipe/indicadores') {
    const todos = montarIndicadores(ENVIOS, CAMPANHAS);
    return json(res, 200, { dias: 30, gestor: ehGestor(), pessoas: ehGestor() ? todos : todos.filter((x) => x.perfil_id === eu.id) });
  }
  if (p === '/api/envios.csv' && m === 'GET') {
    let l = filtrarExtra(ENVIOS.slice(), url.searchParams);
    const st = url.searchParams.get('status'), tipo = url.searchParams.get('tipo');
    if (st && st !== 'todas') l = l.filter((e) => e.status === st);
    if (tipo && tipo !== 'todos') l = l.filter((e) => e.tipo === tipo);
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="comunicar-mensagens-${hoje()}.csv"` });
    return res.end(paraCSV(l.sort((a, b) => (a.enviar_em < b.enviar_em ? 1 : -1)), COLUNAS_CSV_ENVIOS));
  }
  if ((mm = p.match(/^\/api\/envios\/([0-9a-f-]+)\/desfazer-cancelamento$/)) && m === 'POST') {
    const e = ENVIOS.find((x) => x.id === mm[1]);
    if (!e || e.status !== 'cancelado') return json(res, 400, { erro:'Essa mensagem não está cancelada.' });
    e.status = 'pendente'; return json(res, 200, e);
  }
  if ((mm = p.match(/^\/api\/envios\/([0-9a-f-]+)\/encaminhar$/)) && m === 'POST') {
    const e = ENVIOS.find((x) => x.id === mm[1]);
    if (!e) return json(res, 404, { erro:'Não encontrado' });
    e.encaminhado_em = agora(); return json(res, 200, { ok:true });
  }
  if (p === '/api/relatorio') {
    const regua = url.searchParams.get('regua');
    const l = ENVIOS.filter((e) => !regua || regua === 'todas' || e.tipo === regua);
    return json(res, 200, montarRelatorio(l, regua || null, 8));
  }
  if (p === '/api/intencoes') {
    const dias = Number(url.searchParams.get('dias')) || 7;
    const lista = ENVIOS.filter((e) => e.intencao && e.respondido_em >= diasAtras(dias)).sort((a, b) => (a.respondido_em < b.respondido_em ? 1 : -1));
    const contagem = {}; for (const e of lista) contagem[e.intencao] = (contagem[e.intencao] || 0) + 1;
    return json(res, 200, { contagem, lista });
  }
  if (p === '/api/aniversarios') {
    const ags = AG.filter((a) => a.status === 'concluido').map((a) => ({ cliente_id: a.cliente.id, data: a.data }));
    return json(res, 200, await montarAniversarios(CLIENTES.filter((c) => c.nascimento), CLIENTES.filter((c) => c.telefone).length, ags, hoje(), async (ids) => ids.map(porId).filter(Boolean)));
  }

  // ---- IA (cliente falso, funções reais)
  if (p === '/api/ia/status') return json(res, 200, { ativo: IA_LIGADA, temChave: true, autonomia: 'confirmar', chamadasHoje: 3, limite: 2000 });
  if (p === '/api/ia/escrever' && m === 'POST') {
    try {
      const regua = String(body.regua || 'campanha');
      const r = await ia.escreverMensagem({ regua, pedido: body.pedido, textoAtual: body.texto }, { chave:'falsa', modelos: ia.MODELOS_RESERVA });
      const ex = { nome:'Maria Aparecida Souza', carro:'HB20 2019', placa:'FHR6F16', servico:'troca de óleo', quando:'amanhã às 09:00', meses:6, detalhe:'sábado até 12h', link_avaliacao: CFG.link_avaliacao, ...(body.exemplo || {}) };
      return json(res, 200, { variacoes: r.variacoes.map((v) => ({ ...v, previa: renderTemplate(v.texto, ex) })), modelo: r.modelo });
    } catch (e) { return json(res, 502, { erro: `A IA não respondeu agora: ${e.message}` }); }
  }
  if (p === '/api/ia/publico' && m === 'POST') {
    try {
      const r = await ia.sugerirPublico({ numeros: resumo(), segmentos: SEGMENTOS }, { chave:'falsa', modelos: ia.MODELOS_RESERVA });
      const l = segmentar(r.segmento, r.valor) || [];
      delete r.uso;
      return json(res, 200, { ...r, previa: { total: l.length, amostra: l.slice(0, 8).map((c) => ({ id:c.id, nome:c.nome, carro:c.carro })) } });
    } catch (e) { return json(res, 502, { erro: `A IA não respondeu agora: ${e.message}` }); }
  }
  if (p === '/api/ia/resumo' && m === 'GET') return json(res, 200, { texto: CFG.ia_resumo, em: CFG.ia_resumo_em, valido: !!CFG.ia_resumo });
  if (p === '/api/ia/resumo' && m === 'POST') {
    if (!body.forcar && CFG.ia_resumo) return json(res, 200, { texto: CFG.ia_resumo, em: CFG.ia_resumo_em, valido: true, cache: true });
    try {
      const r = await ia.resumirSemana({ numeros: resumo() }, { chave:'falsa', modelos: ia.MODELOS_RESERVA });
      CFG.ia_resumo = r.texto; CFG.ia_resumo_em = agora();
      return json(res, 200, { texto: r.texto, em: CFG.ia_resumo_em, valido: true, cache: false });
    } catch (e) { return json(res, 502, { erro: `A IA não respondeu agora: ${e.message}` }); }
  }
  if (p === '/api/ia/ler-respostas' && m === 'POST') {
    if (!ehGestor()) return json(res, 403, { erro:'Só gestor dispara a leitura agora.' });
    return json(res, 200, { lidas: 0, chamaram: 0, propostas: 0, erros: 0, porIntencao: {} });
  }
  if (p === '/api/envios' && m === 'POST') {
    const corpo = String(body.corpo ?? '').trim();
    if (!corpo) return json(res, 400, { erro:'Escreva a mensagem.' });
    let destinos = Array.isArray(body.destinos) ? body.destinos : [];
    if (!destinos.length && body.segmento?.filtro) destinos = (segmentar(body.segmento.filtro, body.segmento.valor) || []).map((c) => ({ cliente_id:c.id, telefone:c.telefone, nome:c.nome, carro:c.carro, placa:c.placa }));
    if (!destinos.length) return json(res, 400, { erro:'Escolha pelo menos um cliente.' });
    const caminho = auto.destinoDoPedido(eu, destinos.length);
    if (caminho === 'proposta') {
      const c = { id: uuid(), status:'aguardando', corpo, detalhe: body.detalhe || null, segmento: body.segmento?.filtro ? { filtro: body.segmento.filtro, valor: body.segmento.valor ?? null } : null,
        destinos: body.segmento?.filtro ? null : destinos, total_previsto: destinos.length, enviar_em: body.enviar_em || null,
        criado_por: eu.id, criado_por_nome: eu.nome, decidido_por:null, decidido_por_nome:null, decidido_em:null, motivo_recusa:null, created_at: agora() };
      CAMPANHAS.unshift(c);
      const avisados = await auto.avisarPropostaDeCampanha({ campanha: c, loja: lojaMock });
      return json(res, 200, { ok:true, aguardando:true, campanha:c, avisados, enfileirados:0, pulados:0 });
    }
    const area = usaLinkArea(corpo);
    const tipo = area ? 'area_cliente' : caminho === 'avulsa' ? 'avulsa' : 'campanha';
    const lote = tipo === 'campanha' ? uuid() : null;
    let enfileirados = 0, pulados = 0;
    for (const d of destinos) {
      const c = porId(d.cliente_id);
      if (c?.aceita_mensagens === false) { pulados++; continue; }
      if (area && !c) { pulados++; continue; }
      ENVIOS.unshift(env(c, tipo, { lote, telefone:d.telefone, nome:d.nome, corpo: renderTemplate(corpo, { nome:d.nome, carro:d.carro, placa:d.placa, detalhe:'', link_area: area ? linkArea(null, 'f00d' + uuid().replace(/-/g, '')) : '' }),
        enviar_em: body.enviar_em || agora(), created_at: agora(), criado_por: eu.nome, criado_por_id: eu.id }));
      enfileirados++;
    }
    return json(res, 200, { ok:true, enfileirados, pulados });
  }
  if (p === '/api/envios/teste' && m === 'POST') {
    if (!ehGestor()) return json(res, 403, { erro:'Só gestor pode mandar teste.' });
    if (!SAUDE_OK) return json(res, 502, { erro:'A chave do CodeWords foi recusada (401). Gere uma nova em runtime.codewords.ai e cole em Atendimento › Configurações › Integrações.' });
    return json(res, 200, { ok:true });
  }
  if ((mm = p.match(/^\/api\/envios\/([0-9a-f-]+)\/(cancelar|reenviar|desfazer-cancelamento)$/)) && m === 'POST' && !ehGestor()
      && ENVIOS.find((x) => x.id === mm[1])?.criado_por_id !== eu.id) return json(res, 403, { erro: A.motivo403('cancelar_qualquer'), codigo:'sem_permissao' });
  if ((mm = p.match(/^\/api\/envios\/([0-9a-f-]+)\/cancelar$/)) && m === 'POST') {
    const e = ENVIOS.find((x) => x.id === mm[1]);
    if (!e || e.status !== 'pendente') return json(res, 400, { erro:'Só dá para cancelar mensagem que ainda não saiu.' });
    e.status = 'cancelado'; return json(res, 200, e);
  }
  if ((mm = p.match(/^\/api\/envios\/([0-9a-f-]+)\/reenviar$/)) && m === 'POST') {
    const e = ENVIOS.find((x) => x.id === mm[1]);
    if (!e || !['falhou', 'cancelado', 'pulado'].includes(e.status)) return json(res, 400, { erro:'Só dá para reenviar mensagem que falhou, foi cancelada ou pulada.' });
    Object.assign(e, { status:'pendente', erro:null, motivo_pulado:null, enviar_em: agora() }); return json(res, 200, e);
  }

  // ---- segmentos, modelos, regras
  if (p === '/api/segmentos') return json(res, 200, SEGMENTOS);
  if (p === '/api/segmentos/previa') {
    const bruto = segmentarBruto(url.searchParams.get('filtro') || 'todos', url.searchParams.get('valor'));
    if (!bruto) return json(res, 400, { erro:'Segmento desconhecido.' });
    const recentes = new Set(ENVIOS.filter((e) => ['enviado', 'pendente'].includes(e.status) && ['campanha', 'avulsa', 'retorno', 'reativacao', 'orcamento', 'nao_fechou', 'aniversario'].includes(e.tipo) && e.enviar_em >= diasAtras(CFG.intervalo_minimo_dias)).map((e) => e.cliente_id));
    const r = peneirarSegmento(bruto, { porteiro: { podeReceber: ({ cliente_id }) => ({ ok: !recentes.has(cliente_id) }) } });
    return json(res, 200, { total: r.recebem.length, bruto: r.total, pulados: r.pulados, recentes: r.recentes, intervalo_dias: CFG.intervalo_minimo_dias, amostra: r.recebem.slice(0, 12).map((c) => ({ id:c.id, nome:c.nome, telefone:c.telefone, carro:c.carro, placa:c.placa })) });
  }
  if (p === '/api/modelos') return json(res, 200, MODELOS);
  if (p === '/api/regras-retorno' && m === 'GET') return json(res, 200, REGRAS.slice().sort((a, b) => a.ordem - b.ordem));
  if (p === '/api/regras-retorno' && m === 'POST') {
    if (!ehGestor()) return naoGestor();
    const palavras = (Array.isArray(body.palavras) ? body.palavras : String(body.palavras || '').split(/[,;\n]/)).map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (!body.rotulo || !palavras.length) return json(res, 400, { erro:'Dê um nome à regra e pelo menos uma palavra do serviço.' });
    const r = regra(String(body.rotulo).trim(), palavras, Number(body.meses), 100, { mensagem: body.mensagem || '', ativo: body.ativo !== false });
    REGRAS.push(r); return json(res, 200, r);
  }
  if ((mm = p.match(/^\/api\/regras-retorno\/([0-9a-f-]+)$/))) {
    if (!ehGestor()) return naoGestor();
    const i = REGRAS.findIndex((x) => x.id === mm[1]);
    if (i < 0) return json(res, 404, { erro:'Não encontrado' });
    if (m === 'DELETE') { REGRAS.splice(i, 1); return json(res, 200, { ok:true }); }
    const r = REGRAS[i];
    if (body.rotulo !== undefined) r.rotulo = String(body.rotulo).trim();
    if (body.palavras !== undefined) r.palavras = (Array.isArray(body.palavras) ? body.palavras : String(body.palavras).split(/[,;\n]/)).map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (body.meses !== undefined) r.meses = Number(body.meses);
    if (body.mensagem !== undefined) r.mensagem = String(body.mensagem);
    if (body.ativo !== undefined) r.ativo = body.ativo === true;
    return json(res, 200, r);
  }

  // ---- clientes
  if (p === '/api/clientes' && m === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase(), d = digitos(q);
    let l = CLIENTES.slice();
    if (q) l = l.filter((c) => c.nome.toLowerCase().includes(q) || (c.placa || '').toLowerCase().includes(q) || (d.length >= 4 && (c.telefone || '').includes(d)));
    return json(res, 200, l.sort((a, b) => a.nome.localeCompare(b.nome)).map(lerCliente));
  }
  if (p === '/api/clientes/importar' && m === 'POST') {
    const linhas = Array.isArray(body.linhas) ? body.linhas : [];
    let criados = 0, atualizados = 0, ignorados = 0; const avisos = [];
    linhas.forEach((l, i) => {
      const tel = digitos(l.telefone);
      if (!l.nome || tel.length < 8) { ignorados++; avisos.push(`Linha ${i + 1}: sem nome ou telefone válido — pulada.`); return; }
      const ex = CLIENTES.find((c) => digitos(c.telefone) === tel);
      if (ex) { atualizados++; if (l.nascimento) ex.nascimento = l.nascimento.includes('/') ? '1904-' + l.nascimento.split('/').reverse().slice(0, 2).join('-') : l.nascimento; }
      else { CLIENTES.push(cli({ nome:l.nome, telefone:tel, carro:l.veiculo || null, placa:l.placa || null })); criados++; }
    });
    return json(res, 200, { criados, atualizados, ignorados, avisos });
  }
  if ((mm = p.match(/^\/api\/clientes\/([0-9a-f-]+)\/ficha$/)) && m === 'GET') {
    const c = porId(mm[1]); if (!c) return json(res, 404, { erro:'Não encontrado' });
    const ags = AG.filter((a) => a.cliente.id === c.id).sort((a, b) => (a.data < b.data ? 1 : -1));
    const ultimo = ags.find((a) => a.status === 'concluido') || null;
    let proximaRevisao = null;
    if (ultimo) { const { meses, regra: r } = prazoDeRetorno(ultimo.servico, REGRAS, CFG.meses_retorno); proximaRevisao = { data: somarDias(ultimo.data, meses * 30), meses, regra: r?.rotulo || 'padrão', servico: ultimo.servico }; }
    const feitos = ags.filter((a) => a.status === 'concluido');
    return json(res, 200, {
      cliente: lerCliente(c),
      resumo:{ servicos_feitos: feitos.length, faltas: ags.filter((a) => a.status === 'nao_veio').length, total_gasto: feitos.reduce((s, a) => s + a.valor, 0),
        ultimo_servico_em: ultimo?.data || null, proximo_horario: ags.find((a) => ['aguardando', 'confirmado'].includes(a.status))?.data || null },
      ultimoServico: ultimo ? { id: ultimo.id, servico: ultimo.servico, data: ultimo.data, status: ultimo.status, valor: ultimo.valor } : null,
      proximaRevisao,
      agendamentos: ags.slice(0, 6).map(({ cliente, ...a }) => a),
      envios: ENVIOS.filter((e) => e.cliente_id === c.id).slice(0, 10),
      respostas: RESPOSTAS.filter((r) => r.cliente_id === c.id).slice(0, 5),
      ligacoes: montarLigacoes(c360Mock(c, c.telefone)),
    });
  }
  if ((mm = p.match(/^\/api\/clientes\/([0-9a-f-]+)$/)) && m === 'PUT') {
    const c = porId(mm[1]); if (!c) return json(res, 404, { erro:'Não encontrado' });
    if (body.aceita_mensagens === true && !A.pode(eu, 'optout_religar')) return json(res, 403, { erro: A.motivo403('optout_religar'), codigo:'sem_permissao' });
    if (body.nascimento !== undefined) {
      const t = String(body.nascimento).trim(); let v = null;
      let x = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (x) v = `${x[3]}-${x[2].padStart(2, '0')}-${x[1].padStart(2, '0')}`;
      x = t.match(/^(\d{1,2})\/(\d{1,2})$/); if (x) v = `1904-${x[2].padStart(2, '0')}-${x[1].padStart(2, '0')}`;
      c.nascimento = v;
    }
    if (body.aceita_mensagens === true || body.aceita_mensagens === false) {
      c.aceita_mensagens = body.aceita_mensagens; c.aceita_mensagens_em = agora();
      c.aceita_mensagens_motivo = body.aceita_mensagens ? null : `desligado no painel por ${eu.nome}${body.motivo ? `: ${body.motivo}` : ''}`;
    }
    return json(res, 200, lerCliente(c));
  }

  // ---- satisfação
  if (p === '/api/satisfacao' && m === 'GET') return json(res, 200, RESPOSTAS.map((r) => ({ ...r, cliente_nome: porId(r.cliente_id)?.nome ?? null, cliente_telefone: porId(r.cliente_id)?.telefone ?? null })));
  if (p === '/api/satisfacao' && m === 'POST') {
    if (!porId(body.cliente_id)) return json(res, 400, { erro:'Escolha o cliente.' });
    if (body.satisfeito !== true && body.satisfeito !== false) return json(res, 400, { erro:'Diga se o cliente ficou satisfeito ou não.' });
    const r = { id: uuid(), cliente_id: body.cliente_id, envio_id:null, satisfeito: body.satisfeito, nota: body.nota || null, comentario: body.comentario || null,
      registrado_por: eu.nome, origem:'manual', created_at: agora() };
    RESPOSTAS.unshift(r); return json(res, 200, r);
  }
  if ((mm = p.match(/^\/api\/satisfacao\/([0-9a-f-]+)$/)) && m === 'DELETE') { RESPOSTAS = RESPOSTAS.filter((r) => r.id !== mm[1]); return json(res, 200, { ok:true }); }

  if (m === 'GET') return json(res, 200, []);
  return json(res, 200, { ok:true });
}).listen(PORT, () => console.log(`Comunicar (dados de MENTIRA) em http://localhost:${PORT}  ·  papéis: /?papel=admin|gestor|atendente|agenda|desativado|sem_app|trocar_senha|mfa  ·  login: /?logado=0  ·  sem alerta: /?saude=ok`));
