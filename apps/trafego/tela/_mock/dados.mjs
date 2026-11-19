/* ============================================================================
   Mundo de mentira do IndyCar Tráfego (rodada 8, frente T3).

   Cada cenário é uma lista de contatos inventados (nomes, telefones e carros
   de mentira) gerada sempre igual, a partir de uma semente. Todas as respostas
   (/api/hoje, /api/jornada, /api/pendencias…) são somadas em cima da MESMA
   lista, no formato do CONTRATO-API.md (§5), para a tela Hoje e a Jornada
   nunca discordarem entre si.

   Aqui mora conta de negócio (funil, retorno, custo): é o papel do servidor.
   A tela não faz nenhuma dessas contas; só mostra o que chega.

   "Agora" é fixo (19/11/2026, 10:30 de Brasília) para as capturas saírem iguais.
   ============================================================================ */

import { dinheiro, inteiro, ehNumero, plural } from '../js/formato.js';

export const AGORA_ISO = '2026-11-19T10:30:00-03:00';
const AGORA = Date.parse(AGORA_ISO);
const HOJE = '2026-11-19';
const MIN = 60000;

export const CENARIOS = ['sem_conta', 'cheio', 'falta_valor', 'comeco', 'demo'];

/* ------------------------------ datas ------------------------------ */

const dois = (n) => String(n).padStart(2, '0');
const meioDia = (data) => Date.parse(data + 'T12:00:00-03:00');
const somarDias = (data, n) => new Date(meioDia(data) + n * 86400000).toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((meioDia(b) - meioDia(a)) / 86400000);
const listaDeDias = (de, ate) => { const s = []; for (let d = de; d <= ate; d = somarDias(d, 1)) s.push(d); return s; };
/** Instante → texto ISO no fuso de Brasília. */
const isoBr = (ms) => new Date(ms - 3 * 3600000).toISOString().slice(0, 19) + '-03:00';
const dataDe = (iso) => String(iso).slice(0, 10);
const diaMes = (data) => data.slice(8, 10) + '/' + data.slice(5, 7);
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const NOME_DO_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const semana = (data) => new Date(meioDia(data)).getUTCDay();

export function periodoDe(id) {
  switch (id) {
    case 'hoje': return { id: 'hoje', de: HOJE, ate: HOJE, rotulo: 'Hoje', quando: 'hoje', anterior: { de: '2026-11-18', ate: '2026-11-18' } };
    case '7d': return { id: '7d', de: '2026-11-13', ate: HOJE, rotulo: '7 dias', quando: 'nos últimos 7 dias', anterior: { de: '2026-11-06', ate: '2026-11-12' } };
    case '30d': return { id: '30d', de: '2026-10-21', ate: HOJE, rotulo: '30 dias', quando: 'nos últimos 30 dias', anterior: { de: '2026-09-21', ate: '2026-10-20' } };
    case 'mes_passado': return { id: 'mes_passado', de: '2026-10-01', ate: '2026-10-31', rotulo: 'Mês passado', quando: 'no mês passado', anterior: { de: '2026-09-01', ate: '2026-09-30' } };
    default: return { id: 'mes', de: '2026-11-01', ate: HOJE, rotulo: 'Este mês', quando: 'neste mês', anterior: { de: '2026-10-01', ate: '2026-10-19' } };
  }
}
const periodoPublico = (p) => ({ de: p.de, ate: p.ate, rotulo: p.rotulo, anterior: p.anterior });

/* ------------------------------ sorteio com semente ------------------------------ */

function criarSorteio(semente) {
  let a = semente >>> 0;
  const proximo = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const entre = (min, max) => min + Math.floor(proximo() * (max - min + 1));
  const um = (lista) => lista[Math.floor(proximo() * lista.length)];
  const chance = (p) => proximo() < p;
  const embaralhar = (lista) => {
    const s = lista.slice();
    for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(proximo() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
    return s;
  };
  const pesado = (pares) => {
    const total = pares.reduce((n, [, peso]) => n + peso, 0);
    let x = proximo() * total;
    for (const [valor, peso] of pares) { x -= peso; if (x < 0) return valor; }
    return pares[pares.length - 1][0];
  };
  return { proximo, entre, um, chance, embaralhar, pesado };
}

/* ------------------------------ gente, carros e campanhas inventados ------------------------------ */

const NOMES = ['João', 'Maria', 'Carlos', 'Ana', 'Pedro', 'Juliana', 'Rafael', 'Fernanda', 'Lucas', 'Patrícia', 'Marcos', 'Camila', 'Bruno', 'Aline', 'Diego', 'Renata', 'Thiago', 'Vanessa', 'Gustavo', 'Débora', 'Fábio', 'Simone', 'André', 'Letícia', 'Rodrigo', 'Tatiane', 'Eduardo', 'Priscila', 'Vinícius', 'Sueli', 'Wagner', 'Elaine', 'Márcio', 'Cristiane', 'Leandro', 'Rosana', 'Sérgio', 'Michele', 'Alex', 'Bianca'];
const SOBRENOMES = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Lima', 'Araújo', 'Fernandes', 'Carvalho', 'Gomes', 'Martins', 'Rocha', 'Ribeiro', 'Alves', 'Monteiro', 'Barbosa', 'Cardoso', 'Teixeira', 'Moreira', 'Correia'];
const CARROS = ['Onix 2019', 'HB20 2021', 'Gol 2015', 'Corolla 2018', 'Strada 2022', 'Civic 2017', 'Kwid 2020', 'Renegade 2019', 'Fiesta 2014', 'Sandero 2016', 'Compass 2021', 'Uno 2012', 'Polo 2020', 'Creta 2022', 'Saveiro 2018', 'Ka 2017', 'Argo 2021', 'Fit 2013'];
const SERVICOS = ['Troca de óleo', 'Freios', 'Suspensão', 'Alinhamento e balanceamento', 'Revisão', 'Embreagem', 'Ar-condicionado', 'Injeção eletrônica', 'Bateria', 'Escapamento', 'Correia dentada'];
const RESPONSAVEIS = ['Carlos', 'Bia', 'Rafa'];
const VALORES = [169, 280, 380, 450, 540, 620, 690, 760, 890, 980, 1120, 1250, 1450, 1890];

const CAMPANHAS = {
  meta: [
    { ext: '120211450001', nome: 'Troca de óleo R$ 169', conjunto: 'Taubaté 30 km', anuncios: ['Vídeo 2', 'Foto do elevador'], mensagem: 'Quero garantir minha vaga na troca de óleo por R$ 169' },
    { ext: '120211450002', nome: 'Revisão de férias', conjunto: 'Vale do Paraíba', anuncios: ['Carrossel'], mensagem: 'Quero agendar uma avaliação gratuita' },
    { ext: '120211450003', nome: 'Freios com garantia', conjunto: 'Taubaté 15 km', anuncios: ['Vídeo 1'], mensagem: 'Olá! Tenho interesse e queria mais informações, por favor.' },
  ],
  google: [
    { ext: '20881330001', nome: 'Oficina em Taubaté', palavras: ['oficina mecânica perto de mim', 'oficina em taubaté'], mensagem: 'Vi o anúncio no Google e gostaria de um orçamento' },
    { ext: '20881330002', nome: 'Troca de óleo', palavras: ['troca de óleo taubaté', 'troca de óleo preço'], mensagem: 'Vi o anúncio no Google, quanto fica a troca de óleo?' },
  ],
};
const ROTULO_DO_CANAL = {
  meta: 'Anúncio da Meta', google: 'Anúncio do Google', site: 'Site', instagram: 'Instagram (link da bio)', indicacao: 'Indicação',
  passagem: 'Passou na porta', telefone: 'Telefone', whatsapp: 'WhatsApp direto', desconhecida: 'Ainda não sabemos',
};
const ORGANICAS = ['indicacao', 'indicacao', 'indicacao', 'passagem', 'passagem', 'instagram', 'instagram', 'site', 'telefone', 'whatsapp'];
const MENSAGENS = {
  site: ['Vim pelo site e quero agendar uma avaliação', 'Oi, vi o site de vocês. Fazem revisão completa?'],
  instagram: ['Oi, vi o perfil de vocês no Instagram', 'Boa tarde! Vi o link na bio, queria um orçamento'],
  indicacao: ['Boa tarde, o Marcos me indicou vocês', 'Oi, minha cunhada arruma o carro aí e me passou o contato'],
  passagem: ['Passei aí na frente hoje cedo, vocês mexem com suspensão?', 'Bom dia, vi a oficina na avenida'],
  telefone: ['Liguei mais cedo e pediram para chamar aqui'],
  whatsapp: ['Oi, tudo bem? Preciso arrumar o freio', 'Bom dia, vocês têm horário amanhã?'],
  desconhecida: ['Bom dia, vocês fazem freio?', 'Oi, quanto fica a troca de óleo do HB20?', 'Boa tarde', 'Tem horário para essa semana?', 'Olá, o carro está fazendo um barulho na frente', 'Oi'],
};
const ETAPAS = ['contato', 'respondido', 'orcamento', 'agendou', 'veio', 'oficina', 'fechou'];
const ROTULO_DA_ETAPA = { contato: 'Contatos', respondido: 'Respondidos', orcamento: 'Com orçamento', agendou: 'Agendaram', veio: 'Vieram', oficina: 'Carro na oficina', fechou: 'Fecharam' };
const MOTIVOS = { caro: 'Achou caro', concorrente: 'Foi em outra oficina', sem_retorno: 'Parou de responder', desistiu: 'Desistiu do serviço', nao_fazemos: 'Não fazemos o serviço', prazo: 'Prazo não atendeu', sem_urgencia: 'Não era urgente', sem_vaga: 'Não tinha vaga', outro: 'Outro' };

/* ------------------------------ a receita de cada cenário ------------------------------ */

/* grupo: { tipo: 'paga' | 'sem' | 'organica', n, fechou, nao, meta? (quantos dos pagos são da Meta),
            valores? (lista exata dos valores lançados; o resto dos fechados fica sem valor),
            motivos? (lista exata; o resto dos que não fecharam fica sem motivo) }
   Sem `valores`/`motivos`, sorteia com as taxas do cenário. */
const RECEITAS = {
  sem_conta: {
    semente: 1119, contas: false, demo: false, respostasAte: '2026-10-04', taxaFalta: 0.26, conversas: { novas: 216, anuncio: 51 },
    partes: [
      { de: '2026-09-01', ate: '2026-09-30', grupos: [{ tipo: 'paga', n: 34, fechou: 8, nao: 9 }, { tipo: 'sem', n: 47, fechou: 9, nao: 12 }, { tipo: 'organica', n: 37, fechou: 11, nao: 9 }] },
      { de: '2026-10-01', ate: '2026-10-19', grupos: [{ tipo: 'paga', n: 24, fechou: 5, nao: 6 }, { tipo: 'sem', n: 35, fechou: 6, nao: 8 }, { tipo: 'organica', n: 27, fechou: 7, nao: 6 }] },
      { de: '2026-10-20', ate: '2026-10-31', grupos: [{ tipo: 'paga', n: 13, fechou: 3, nao: 3 }, { tipo: 'sem', n: 18, fechou: 3, nao: 4 }, { tipo: 'organica', n: 14, fechou: 4, nao: 3 }] },
      { de: '2026-11-01', ate: HOJE, hoje: 5, grupos: [
        { tipo: 'paga', n: 30, meta: 18, fechou: 5, nao: 2, valores: [890, 1250], motivos: ['caro'] },
        { tipo: 'sem', n: 40, fechou: 3, nao: 3, valores: [], motivos: [] },
        { tipo: 'organica', n: 30, fechou: 6, nao: 3, valores: [760, 380], motivos: ['sem_retorno', 'concorrente'] }] },
    ],
  },
  cheio: {
    semente: 2311, contas: true, demo: false, respostasAte: null, taxaFalta: 0.12, conversas: { novas: 143, anuncio: 71 },
    gasto: { '2026-09': { meta: 1800, google: 1000 }, '2026-10a': { meta: 1350, google: 750 }, '2026-10b': { meta: 840, google: 460 }, '2026-11': { meta: 1500, google: 840.5 } },
    orcamento: 3000,
    partes: [
      { de: '2026-09-01', ate: '2026-09-30', grupos: [{ tipo: 'paga', n: 58, fechou: 13, nao: 14 }, { tipo: 'sem', n: 22, fechou: 4, nao: 6 }, { tipo: 'organica', n: 35, fechou: 11, nao: 8 }] },
      { de: '2026-10-01', ate: '2026-10-19', grupos: [{ tipo: 'paga', n: 52, fechou: 12, nao: 11 }, { tipo: 'sem', n: 12, fechou: 2, nao: 3 }, { tipo: 'organica', n: 22, fechou: 7, nao: 5 }] },
      { de: '2026-10-20', ate: '2026-10-31', grupos: [{ tipo: 'paga', n: 30, fechou: 7, nao: 7 }, { tipo: 'sem', n: 8, fechou: 1, nao: 2 }, { tipo: 'organica', n: 15, fechou: 5, nao: 3 }] },
      { de: '2026-11-01', ate: HOJE, hoje: 6, semResposta: 2, grupos: [
        { tipo: 'paga', n: 61, meta: 37, fechou: 14, nao: 6, valores: [450, 620, 980, 1250, 380, 890, 1500, 760, 540, 1120, 690, 650], motivos: ['caro', 'caro', 'sem_retorno', 'concorrente', 'prazo'] },
        { tipo: 'sem', n: 12, fechou: 2, nao: 2, valores: [1200], motivos: ['caro'] },
        { tipo: 'organica', n: 26, fechou: 7, nao: 4, valores: [890, 1340, 760, 980, 1450, 800], motivos: ['sem_retorno', 'desistiu', 'sem_urgencia'] }] },
    ],
  },
  comeco: { semente: 7, contas: false, demo: false, respostasAte: null, taxaFalta: null, conversas: null, partes: [] },
};
/* Gasto real, mas nenhum serviço fechado de anúncio tem valor: a frase vira "falta lançar". */
RECEITAS.falta_valor = {
  ...RECEITAS.cheio, semente: 2312,
  partes: RECEITAS.cheio.partes.map((p) => (p.de === '2026-11-01'
    ? { ...p, grupos: p.grupos.map((g) => (g.tipo === 'paga' ? { ...g, valores: [] } : g)) }
    : p)),
};
/* Demonstração: números inventados e marcados como tal. Leva também os nomes "difíceis" (compridos, com sinais). */
RECEITAS.demo = {
  ...RECEITAS.cheio, semente: 3707, demo: true, orcamento: 2500, conversas: null,
  gasto: { '2026-09': { meta: 1500, google: 700 }, '2026-10a': { meta: 1100, google: 500 }, '2026-10b': { meta: 700, google: 320 }, '2026-11': { meta: 1280, google: 610 } },
  partes: [
    { de: '2026-09-01', ate: '2026-09-30', grupos: [{ tipo: 'paga', n: 44, fechou: 11, nao: 10 }, { tipo: 'sem', n: 8, fechou: 1, nao: 2 }, { tipo: 'organica', n: 30, fechou: 9, nao: 7 }] },
    { de: '2026-10-01', ate: '2026-10-19', grupos: [{ tipo: 'paga', n: 36, fechou: 9, nao: 8 }, { tipo: 'sem', n: 5, fechou: 1, nao: 1 }, { tipo: 'organica', n: 21, fechou: 6, nao: 5 }] },
    { de: '2026-10-20', ate: '2026-10-31', grupos: [{ tipo: 'paga', n: 22, fechou: 5, nao: 5 }, { tipo: 'sem', n: 3, fechou: 0, nao: 1 }, { tipo: 'organica', n: 12, fechou: 4, nao: 2 }] },
    { de: '2026-11-01', ate: HOJE, hoje: 4, hostis: true, grupos: [
      { tipo: 'paga', n: 44, meta: 27, fechou: 11, nao: 5, valores: [450, 620, 980, 1250, 380, 890, 1500, 760, 540, 1120, 690], motivos: ['caro', 'sem_retorno', 'concorrente', 'prazo', 'caro'] },
      { tipo: 'sem', n: 4, fechou: 0, nao: 0, valores: [], motivos: [] },
      { tipo: 'organica', n: 24, fechou: 6, nao: 3, valores: [890, 1340, 760, 980, 1450, 800], motivos: ['sem_retorno', 'desistiu', 'sem_urgencia'] }] },
  ],
};

const HOSTIS = [
  { nome: 'Maria Aparecida dos Santos Nascimento de Oliveira Albuquerque', carro: 'Volkswagen Saveiro Cabine Estendida Cross 1.6 2018', servico: 'Alinhamento, balanceamento, troca das quatro pastilhas e revisão dos 60 mil' },
  { nome: '<b>Zé</b> & Filhos "Auto" <script>alert(1)</script>', carro: 'Gol <i>G5</i>', servico: 'Freios & suspensão' },
  { nome: 'Lu 🚗', carro: null, servico: null },
];

/* ------------------------------ montagem de um contato ------------------------------ */

function origemDoContato(tipo, s, receita) {
  const base = { canal: tipo, paga: false, rotulo: ROTULO_DO_CANAL[tipo], detalhe: null, campanha: null, conjunto: null, anuncio: null, palavra_chave: null, como: null, como_rotulo: null, certeza: 'nenhuma' };
  if (tipo === 'meta') {
    const c = s.um(CAMPANHAS.meta);
    // Sem conta ligada, parte dos contatos de anúncio só é reconhecida pela mensagem padrão: sabe-se que é anúncio, não de qual campanha.
    if (!receita.contas && s.chance(0.3)) {
      return { ...base, paga: true, como: 'frase_padrao', como_rotulo: 'pela mensagem padrão de anúncio', certeza: 'provavel', _mensagem: 'Olá! Tenho interesse e queria mais informações, por favor.' };
    }
    const anuncio = s.um(c.anuncios);
    const comoRef = s.chance(0.6);
    return { ...base, paga: true, detalhe: c.nome + ' › ' + c.conjunto + ' › ' + anuncio, campanha: { ext: c.ext, nome: c.nome }, conjunto: { ext: c.ext + '10', nome: c.conjunto }, anuncio: { ext: c.ext + '11', nome: anuncio },
      como: comoRef ? 'referral' : 'frase', como_rotulo: comoRef ? 'pelo anúncio (WhatsApp)' : 'pela primeira mensagem', certeza: comoRef ? 'certa' : 'provavel', _mensagem: c.mensagem };
  }
  if (tipo === 'google') {
    const c = s.um(CAMPANHAS.google);
    const palavra = s.um(c.palavras);
    const porUtm = s.chance(0.55);
    return { ...base, paga: true, detalhe: c.nome + ' › ' + palavra, campanha: { ext: c.ext, nome: c.nome }, palavra_chave: palavra,
      como: porUtm ? 'utm' : 'frase', como_rotulo: porUtm ? 'pelo endereço do anúncio' : 'pela primeira mensagem', certeza: porUtm ? 'certa' : 'provavel', _mensagem: c.mensagem, _utm: porUtm ? c : null };
  }
  if (tipo === 'desconhecida') return { ...base, paga: null, _mensagem: s.um(MENSAGENS.desconhecida) };
  const mensagem = s.um(MENSAGENS[tipo]);
  if (tipo === 'site') return { ...base, como: 'ref', como_rotulo: 'pelo código do site', certeza: 'certa', _mensagem: mensagem };
  if (tipo === 'instagram') return { ...base, como: 'frase', como_rotulo: 'pela primeira mensagem', certeza: 'provavel', _mensagem: mensagem };
  if (tipo === 'whatsapp') return { ...base, como: 'ia', como_rotulo: 'palpite da IA', certeza: 'palpite', _mensagem: mensagem };
  const quem = s.um(RESPONSAVEIS);
  return { ...base, como: 'manual', como_rotulo: 'marcado por ' + quem, certeza: 'certa', _mensagem: mensagem };
}

/** Empurra um instante para dentro do horário da oficina (8h às 18h, sem domingo). */
function emHorario(ms, s) {
  const d = new Date(ms - 3 * 3600000);   // relógio de Brasília lido como UTC
  const hora = d.getUTCHours();
  if (hora < 8) d.setUTCHours(8, s.entre(0, 50), 0, 0);
  else if (hora >= 18) { d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(8, s.entre(0, 50), 0, 0); }
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.getTime() + 3 * 3600000;
}

function pendenciasDe(c) {
  const p = [];
  if (c.origem.certeza === 'nenhuma') p.push('sem_origem');
  if (c.desfecho.tipo === 'fechou' && c.desfecho.valor == null) p.push('sem_valor');
  if (c.desfecho.tipo === 'nao_fechou' && !c.desfecho.motivo) p.push('sem_motivo');
  if (c._semResposta) p.push('sem_resposta');
  return p;
}

function criarContato(mundo, s, spec) {
  const receita = mundo.receita;
  const n = ++mundo.contador;
  const id = '0000' + dois(mundo.indice) + '00-0000-4000-8000-' + String(n).padStart(12, '0');
  const hostil = spec.hostil || null;
  const primeiro = s.um(NOMES), sobrenome = s.um(SOBRENOMES);
  const nome = hostil ? hostil.nome : primeiro + ' ' + (s.chance(0.3) ? s.um(SOBRENOMES) + ' ' : '') + sobrenome;
  const partesDoNome = nome.split(' ');
  const nomeCurto = hostil ? nome : partesDoNome[0] + ' ' + partesDoNome[partesDoNome.length - 1][0] + '.';
  const telefone = '5512990' + String(100000 + (mundo.indice * 20000 + n * 37) % 900000).slice(0, 6);
  const carro = hostil ? hostil.carro : s.chance(0.88) ? s.um(CARROS) : null;
  const servico = hostil ? hostil.servico : s.chance(0.9) ? s.um(SERVICOS) : null;
  const origem = origemDoContato(spec.canal, s, receita);
  const mensagem = origem._mensagem; delete origem._mensagem;
  const utm = origem._utm || null; delete origem._utm;

  // Chegada: dia sorteado no trecho; hora de oficina (alguns chegam fora do horário).
  const chegou = spec.chegou != null ? spec.chegou : Date.parse(spec.data + 'T' + dois(s.pesado([[s.entre(7, 11), 5], [s.entre(12, 17), 5], [s.entre(18, 22), 2]])) + ':' + dois(s.entre(0, 59)) + ':00-03:00');
  const teto = AGORA - 10 * MIN;
  const semRegistroDeResposta = receita.respostasAte != null && dataDe(isoBr(chegou)) > receita.respostasAte;

  // Até onde chegou.
  let ate;
  if (spec.desfecho === 'fechou') ate = 6;
  else if (spec.desfecho === 'nao_fechou') ate = s.pesado([[0, 15], [1, 30], [2, 35], [3, 15], [4, 5]]);
  else ate = spec.ate != null ? spec.ate : s.pesado([[0, 30], [1, 22], [2, 18], [3, 16], [4, 8], [5, 6]]);

  // Horário de cada etapa (cada uma depois da anterior, nunca depois de "agora").
  const passos = [0, s.pesado([[s.entre(1, 6), 5], [s.entre(7, 30), 3], [s.entre(31, 120), 2]]), s.entre(60, 1500), s.entre(30, 2000), s.entre(600, 2800), s.entre(10, 40), s.entre(180, 2500)];
  const tempos = [chegou];
  for (let i = 1; i <= ate; i++) tempos.push(Math.max(tempos[i - 1] + MIN, emHorario(tempos[i - 1] + passos[i] * MIN, s)));
  if (spec.desfecho === 'aberto') {
    while (ate > 0 && tempos[ate] > teto) { ate--; tempos.pop(); }
  } else if (tempos[ate] > teto) {
    const folga = Math.max(MIN, (teto - chegou) / (ate + 1));
    for (let i = 1; i <= ate; i++) tempos[i] = chegou + folga * i;
  }
  if (semRegistroDeResposta && spec.desfecho === 'aberto' && ate === 1) ate = 0;   // sem registro de resposta não dá para estar "em respondido"

  const numeroOrcamento = 20 + (n % 70), os = 5 + (n % 40);
  const valorOrcado = s.um(VALORES);
  const etapas = [];
  for (let i = 0; i <= ate; i++) {
    const em = isoBr(tempos[i]);
    if (i === 0) etapas.push({ id: 'contato', em });
    else if (i === 1) {
      if (semRegistroDeResposta || s.chance(0.04)) etapas.push({ id: 'respondido', em: null, minutos: null });
      else etapas.push({ id: 'respondido', em, minutos: Math.round((tempos[1] - tempos[0]) / MIN) });
    }
    else if (i === 2) { if (ate === 2 || !s.chance(0.3)) etapas.push({ id: 'orcamento', em, valor: valorOrcado, numero: numeroOrcamento }); }
    else if (i === 3) etapas.push({ id: 'agendou', em, para: isoBr(ate >= 4 ? tempos[4] : emHorario(Math.min(tempos[3] + s.entre(600, 2800) * MIN, AGORA + 3 * 86400000), s)) });
    else if (i === 4) etapas.push({ id: 'veio', em });
    else if (i === 5) { if (ate === 5 || !s.chance(0.25)) etapas.push({ id: 'oficina', em, os }); }
    else etapas.push({ id: 'fechou', em });
  }
  if (ate === 0 && semRegistroDeResposta) etapas.push({ id: 'respondido', em: null, minutos: null, desconhecido: true });
  const tem = (etapa) => etapas.some((e) => e.id === etapa);
  const ultimo = tempos[ate];

  let desfecho;
  if (spec.desfecho === 'fechou') {
    const valor = spec.valor != null ? spec.valor : null;
    desfecho = { tipo: 'fechou', valor, valor_fonte: valor == null ? null : tem('oficina') ? 'patio' : tem('orcamento') ? 'orcamento' : s.chance(0.5) ? 'agenda' : 'manual', motivo: null, motivo_rotulo: null, obs: null, em: isoBr(ultimo), parado_dias: null };
  } else if (spec.desfecho === 'nao_fechou') {
    const em = Math.min(ultimo + s.entre(600, 4000) * MIN, teto);
    desfecho = { tipo: 'nao_fechou', valor: null, valor_fonte: null, motivo: spec.motivo || null, motivo_rotulo: spec.motivo ? MOTIVOS[spec.motivo] : null, obs: spec.motivo === 'caro' && s.chance(0.5) ? 'Disse que achou mais barato na concorrência.' : null, em: isoBr(em), parado_dias: null };
  } else {
    desfecho = { tipo: 'aberto', valor: null, valor_fonte: null, motivo: null, motivo_rotulo: null, obs: null, em: null, parado_dias: Math.max(0, Math.floor((AGORA - ultimo) / 86400000)) };
  }

  const novo = s.chance(0.7);
  const contato = {
    lead_id: id, nome, nome_curto: nomeCurto, telefone, carro, servico, placa: 'IND' + String(1000 + (n * 7) % 9000),
    chegou_em: isoBr(chegou), cliente_novo: n % 13 === 0 ? null : novo, origem, etapas, etapa_atual: ETAPAS[ate], desfecho,
    responsavel: s.chance(0.8) ? s.um(RESPONSAVEIS) : null,
    primeira_mensagem: mensagem,
    rastreio: origem.canal === 'site' || utm ? {
      pagina: origem.canal === 'site' ? '/agendar' : '/troca-de-oleo', servico: servico || null,
      utm_source: utm ? 'google' : null, utm_medium: utm ? 'cpc' : null, utm_campaign: utm ? utm.nome : null,
      codigo: 'IC-' + String(1000 + (n * 13) % 9000), clique_em: isoBr(chegou - s.entre(1, 9) * MIN) } : null,
    historico: novo ? { visitas_antes: 0, gasto_antes: 0, cliente_desde: null } : { visitas_antes: s.entre(1, 5), gasto_antes: s.entre(3, 40) * 100, cliente_desde: '20' + s.entre(23, 25) + '-' + dois(s.entre(1, 12)) + '-' + dois(s.entre(1, 28)) },
    _semResposta: Boolean(spec.semResposta),
    _numeroOrcamento: numeroOrcamento, _os: os, _valorOrcado: valorOrcado, _n: n,
  };
  contato.pendencias = pendenciasDe(contato);
  return contato;
}

const RESPOSTAS_DA_OFICINA = ['Bom dia! Consigo te atender ainda hoje. Qual é o carro e o ano?', 'Oi! Fazemos sim. Me passa o modelo do carro que eu já te digo o valor.', 'Boa tarde! Temos horário amanhã cedo. Quer que eu reserve?'];
const CONVERSA = [
  ['mensagem_cliente', 'É um carro 1.0, completo. Dá para fazer no mesmo dia?'],
  ['mensagem_oficina', 'Dá sim. Deixando até as 9h, fica pronto no fim da tarde.'],
  ['mensagem_cliente', 'E aceita cartão?'],
  ['mensagem_oficina', 'Aceita, em até 3 vezes sem juros.'],
  ['mensagem_cliente', 'Vou ver com a minha esposa e te aviso.'],
  ['mensagem_oficina', 'Combinado. Qualquer coisa é só chamar.'],
  ['mensagem_cliente', 'Pode marcar então.'],
  ['mensagem_oficina', 'Marcado. Te espero!'],
];
const FONTE_DO_VALOR = { patio: 'do Pátio', orcamento: 'do orçamento aprovado', agenda: 'da Agenda', manual: 'lançado à mão' };

function linhaDoTempo(c) {
  const linha = [{ em: c.chegou_em, tipo: 'mudanca', titulo: 'Contato chegou', detalhe: c.servico }];
  if (c.primeira_mensagem) linha.push({ em: c.chegou_em, tipo: 'mensagem_cliente', titulo: 'Cliente escreveu', detalhe: c.primeira_mensagem });
  if (c.origem.certeza !== 'nenhuma') linha.push({ em: c.chegou_em, tipo: 'origem', titulo: 'Origem: ' + c.origem.rotulo, detalhe: [c.origem.como_rotulo, c.origem.detalhe].filter(Boolean).join(' · ') || null });
  for (const e of c.etapas) {
    if (!e.em) continue;
    if (e.id === 'respondido') {
      linha.push({ em: e.em, tipo: 'mensagem_oficina', titulo: 'Oficina respondeu', detalhe: RESPOSTAS_DA_OFICINA[c._n % RESPOSTAS_DA_OFICINA.length] });
      // Um a cada cinco tem conversa comprida: é o caso que faz a linha do tempo guardar o meio.
      if (c._n % 5 === 0) CONVERSA.forEach(([tipo, fala], i) => linha.push({ em: isoBr(Date.parse(e.em) + (i + 1) * 4 * MIN), tipo, titulo: tipo === 'mensagem_cliente' ? 'Cliente escreveu' : 'Oficina respondeu', detalhe: fala }));
    }
    if (e.id === 'orcamento') linha.push({ em: e.em, tipo: 'orcamento', titulo: 'Orçamento nº ' + e.numero + ' enviado', detalhe: dinheiro(e.valor) });
    if (e.id === 'agendou') linha.push({ em: e.em, tipo: 'agendamento', titulo: 'Agendou para ' + diaMes(dataDe(e.para)) + ' às ' + e.para.slice(11, 16), detalhe: 'confirmado' });
    if (e.id === 'veio') linha.push({ em: e.em, tipo: 'agendamento', titulo: 'Veio no horário marcado', detalhe: null });
    if (e.id === 'oficina') linha.push({ em: e.em, tipo: 'os', titulo: 'Carro entrou na oficina (ordem de serviço nº ' + e.os + ')', detalhe: c.servico });
    if (e.id === 'fechou') linha.push({ em: e.em, tipo: 'mudanca', titulo: 'Fechou o serviço', detalhe: c.desfecho.valor != null ? dinheiro(c.desfecho.valor) + ' (' + FONTE_DO_VALOR[c.desfecho.valor_fonte || 'manual'] + ')' : 'Falta lançar o valor' });
  }
  if (c.desfecho.tipo === 'nao_fechou') linha.push({ em: c.desfecho.em, tipo: 'mudanca', titulo: 'Não fechou', detalhe: c.desfecho.motivo ? MOTIVOS[c.desfecho.motivo] : 'Falta dizer o motivo' });
  return linha.sort((a, b) => Date.parse(a.em) - Date.parse(b.em)).slice(0, 60);
}

function linksDe(c) {
  const tem = (id) => c.etapas.some((e) => e.id === id);
  const links = { crm: '/crm/?lead=' + c.lead_id, atendimento: '/atendimento/?tel=' + c.telefone, agenda: '/agenda/?tel=' + c.telefone };
  if (tem('orcamento')) links.orcamento = 'https://indycar-orcador.netlify.app/#/historico/' + c._numeroOrcamento;
  if (tem('oficina')) links.patio = 'https://indycar-patio.netlify.app/?os=' + c._os;
  return links;
}

/** O item da jornada, como a lista devolve (nome abreviado e só o final do telefone). */
function itemPublico(c) {
  return {
    lead_id: c.lead_id, nome: c.nome_curto, telefone_final: c.telefone.slice(-4), carro: c.carro, servico: c.servico,
    chegou_em: c.chegou_em, cliente_novo: c.cliente_novo, origem: c.origem, etapas: c.etapas, etapa_atual: c.etapa_atual,
    desfecho: c.desfecho, responsavel: c.responsavel, pendencias: c.pendencias,
    espera_min: c._semResposta ? Math.max(0, Math.floor((AGORA - Date.parse(c.chegou_em)) / MIN)) : null,
  };
}

/* ------------------------------ o mundo ------------------------------ */

function distribuir(total, dias, s) {
  // Reparte um valor pelos dias (fim de semana pesa menos), em centavos exatos.
  const pesos = dias.map((d) => (semana(d) === 0 ? 0.35 : semana(d) === 6 ? 0.7 : 1) * (0.75 + s.proximo() * 0.5));
  const soma = pesos.reduce((a, b) => a + b, 0);
  let resto = Math.round(total * 100);
  return dias.map((d, i) => {
    const centavos = i === dias.length - 1 ? resto : Math.round((total * 100 * pesos[i]) / soma);
    resto -= centavos;
    return centavos / 100;
  });
}

export function criarMundo(cenario) {
  const nome = CENARIOS.includes(cenario) ? cenario : 'sem_conta';
  const receita = RECEITAS[nome];
  const s = criarSorteio(receita.semente);
  const mundo = { cenario: nome, receita, indice: CENARIOS.indexOf(nome) + 1, contador: 0, contatos: [], gasto: new Map() };

  for (const parte of receita.partes) {
    const dias = listaDeDias(parte.de, parte.ate);
    const cedo = dias.filter((d) => diasEntre(d, HOJE) >= 3);
    const specs = [];
    for (const g of parte.grupos) {
      const metas = g.tipo === 'paga' ? (g.meta != null ? g.meta : Math.round(g.n * 0.6)) : 0;
      const valores = g.valores || null, motivos = g.motivos || null;
      for (let i = 0; i < g.n; i++) {
        const canal = g.tipo === 'sem' ? 'desconhecida' : g.tipo === 'organica' ? ORGANICAS[i % ORGANICAS.length] : null;
        const desfecho = i < g.fechou ? 'fechou' : i < g.fechou + g.nao ? 'nao_fechou' : 'aberto';
        const spec = { canal, desfecho, grupo: g.tipo };
        if (desfecho === 'fechou') spec.valor = valores ? (i < valores.length ? valores[i] : null) : (s.chance(0.6) ? s.um(VALORES) : null);
        if (desfecho === 'nao_fechou') { const j = i - g.fechou; spec.motivo = motivos ? (j < motivos.length ? motivos[j] : null) : (s.chance(0.6) ? s.um(Object.keys(MOTIVOS)) : null); }
        specs.push(spec);
      }
      // Quem é da Meta e quem é do Google: sorteado dentro do grupo pago, na quantidade pedida.
      if (g.tipo === 'paga') {
        const pagos = specs.filter((x) => x.grupo === 'paga' && !x.canal);
        s.embaralhar(pagos).forEach((x, i) => { x.canal = i < metas ? 'meta' : 'google'; });
      }
    }
    // Datas: quem já teve desfecho chegou há pelo menos três dias; os de hoje são contatos em aberto, de manhã.
    const abertos = s.embaralhar(specs.filter((x) => x.desfecho === 'aberto'));
    const deHoje = parte.hoje && parte.ate === HOJE ? abertos.slice(0, parte.hoje) : [];
    deHoje.forEach((x, i) => {
      x.chegou = Date.parse(HOJE + 'T07:30:00-03:00') + Math.round(((i + 0.4) / deHoje.length) * 170) * MIN;
      x.ate = i % 3 === 1 ? 1 : 0;
      if (parte.semResposta && i >= deHoje.length - 1) { x.ate = 0; x.semResposta = true; }
    });
    if (parte.semResposta > 1) {
      // Um contato de ontem à tarde também ficou sem resposta.
      const outro = abertos[deHoje.length];
      if (outro) { outro.chegou = Date.parse('2026-11-18T16:42:00-03:00'); outro.ate = 0; outro.semResposta = true; }
    }
    for (const x of specs) {
      if (x.chegou != null) continue;
      const base = x.desfecho === 'aberto' ? dias.filter((d) => d !== HOJE || !parte.hoje) : (cedo.length ? cedo : dias.slice(0, 1));
      x.data = s.um(base.length ? base : dias);
    }
    if (parte.hostis) {
      const alvos = specs.filter((x) => x.desfecho !== 'aberto').slice(0, 2).concat(specs.filter((x) => x.desfecho === 'aberto' && x.chegou == null).slice(0, 1));
      alvos.forEach((x, i) => { x.hostil = HOSTIS[i]; });
    }
    for (const x of s.embaralhar(specs)) mundo.contatos.push(criarContato(mundo, s, x));
  }
  mundo.contatos.sort((a, b) => Date.parse(b.chegou_em) - Date.parse(a.chegou_em));

  // Gasto por dia e por plataforma (só com conta ligada).
  if (receita.contas && receita.gasto) {
    const trechos = [['2026-09', '2026-09-01', '2026-09-30'], ['2026-10a', '2026-10-01', '2026-10-19'], ['2026-10b', '2026-10-20', '2026-10-31'], ['2026-11', '2026-11-01', HOJE]];
    for (const [chave, de, ate] of trechos) {
      const dias = listaDeDias(de, ate);
      const meta = distribuir(receita.gasto[chave].meta, dias, s), google = distribuir(receita.gasto[chave].google, dias, s);
      dias.forEach((d, i) => mundo.gasto.set(d, { meta: meta[i], google: google[i] }));
    }
  }
  return mundo;
}

/* ------------------------------ contas (o papel do servidor) ------------------------------ */

const noPeriodo = (mundo, de, ate) => mundo.contatos.filter((c) => { const d = dataDe(c.chegou_em); return d >= de && d <= ate; });
const ehPago = (c) => c.origem.paga === true;
const indiceDaEtapa = (c) => (c.desfecho.tipo === 'fechou' ? 6 : ETAPAS.indexOf(c.etapa_atual));
const arredondar = (v, casas = 2) => (ehNumero(v) ? Math.round(v * 10 ** casas) / 10 ** casas : null);
const dividir = (a, b, casas = 2) => (ehNumero(a) && ehNumero(b) && b > 0 ? arredondar(a / b, casas) : null);
const somaDosValores = (lista) => lista.reduce((n, c) => n + (c.desfecho.tipo === 'fechou' && c.desfecho.valor != null ? c.desfecho.valor : 0), 0);

function gastoNoPeriodo(mundo, de, ate) {
  if (!mundo.receita.contas) return null;
  let meta = 0, google = 0;
  for (const d of listaDeDias(de, ate)) { const g = mundo.gasto.get(d); if (g) { meta += g.meta; google += g.google; } }
  return { meta: arredondar(meta), google: arredondar(google), total: arredondar(meta + google) };
}

/** As respostas da oficina têm registro neste período? (achado 2: desde outubro a sincronia parou) */
function respostasNoPeriodo(mundo, ate) {
  const limite = mundo.receita.respostasAte;
  return limite == null || ate <= limite;
}

function montarFunil(mundo, lista, periodo) {
  const semResposta = !respostasNoPeriodo(mundo, periodo.ate);
  let anterior = null;
  const etapas = ETAPAS.map((id, i) => {
    const desconhecida = id === 'respondido' && semResposta;
    const chegaram = lista.filter((c) => indiceDaEtapa(c) >= i);
    const total = desconhecida ? null : chegaram.length;
    const anuncio = desconhecida ? null : chegaram.filter(ehPago).length;
    const passagem = i === 0 ? null : dividir(total, anterior, 4);
    anterior = total;
    return { id, rotulo: ROTULO_DA_ETAPA[id], total, anuncio, passagem };
  });
  const perdidos = lista.filter((c) => c.desfecho.tipo === 'nao_fechou');
  const porMotivo = new Map();
  for (const c of perdidos) if (c.desfecho.motivo) porMotivo.set(c.desfecho.motivo, (porMotivo.get(c.desfecho.motivo) || 0) + 1);
  return {
    etapas,
    nao_fecharam: {
      total: perdidos.length,
      motivos: [...porMotivo].map(([id, n]) => ({ id, rotulo: MOTIVOS[id], n })).sort((a, b) => b.n - a.n),
      sem_motivo: perdidos.filter((c) => !c.desfecho.motivo).length,
    },
  };
}

function estadoDe(mundo, lista, periodo) {
  const r = mundo.receita;
  const fechados = lista.filter((c) => c.desfecho.tipo === 'fechou');
  const comValor = fechados.filter((c) => c.desfecho.valor != null).length;
  const semOrigem = lista.filter((c) => c.origem.certeza === 'nenhuma').length;
  const estado = {
    gasto: r.demo ? 'demo' : r.contas ? 'real' : lista.length ? 'sem_conta' : 'sem_dados',
    valores: !fechados.length || comValor === 0 ? 'nenhum' : comValor < fechados.length ? 'faltam' : 'ok',
    origem: !lista.length || semOrigem === lista.length ? 'nenhuma' : semOrigem ? 'parcial' : 'ok',
    demo: r.demo,
    // Campos a mais (recados T2a e T2b): o sistema não registra a resposta da oficina desde a data abaixo.
    respostas: respostasNoPeriodo(mundo, periodo.ate) ? 'ok' : 'sem_registro',
    respostas_desde: respostasNoPeriodo(mundo, periodo.ate) ? null : somarDias(r.respostasAte, 1),
    // Campos a mais da API-base (T2a): leitura secundária que falhou. ?incompleto=1 na página liga (ver servidor.mjs).
    incompleto: mundo.incompleto ? ['agenda'] : [], reserva: false, aviso: mundo.incompleto ? 'Não deu para ler agora: a agenda.' : null,
  };
  if (mundo.cenario === 'comeco') { estado.gasto = 'sem_dados'; estado.valores = 'nenhum'; estado.origem = 'nenhuma'; }
  return estado;
}

function conexoesDe(mundo) {
  const r = mundo.receita;
  if (mundo.cenario === 'comeco') {
    return {
      meta: { ligado: false, situacao: 'nunca_ligou', ultima_coleta: null, aviso: null },
      google: { ligado: false, situacao: 'nunca_ligou', ultima_coleta: null, aviso: null },
      site: { rastreio: false, ultimo_clique: null, cliques_7d: 0 },
      whatsapp: { ligado: false, situacao: 'sem_aparelho', desde: null, aviso: 'Nenhum aparelho de WhatsApp ligado ao Atendimento ainda.' },
    };
  }
  if (!r.contas) {
    return {
      meta: { ligado: false, situacao: 'nunca_ligou', ultima_coleta: null, aviso: 'O acesso salvo é de exemplo: o gasto ainda não entra.' },
      google: { ligado: false, situacao: 'nunca_ligou', ultima_coleta: null, aviso: null },
      site: { rastreio: true, ultimo_clique: '2026-11-19T09:12:00-03:00', cliques_7d: 23 },
      whatsapp: { ligado: false, situacao: 'chave_recusada', desde: '2026-10-05', aviso: 'A chave de acesso foi recusada. Nenhum WhatsApp automático sai até trocar a chave no Atendimento.' },
    };
  }
  return {
    meta: { ligado: true, situacao: 'ok', ultima_coleta: '2026-11-19T06:10:00-03:00', aviso: null },
    google: { ligado: true, situacao: 'token_vencendo', ultima_coleta: '2026-11-19T06:12:00-03:00', aviso: 'O acesso do Google vence em 6 dias. Renove para a coleta não parar.' },
    site: { rastreio: true, ultimo_clique: '2026-11-19T10:04:00-03:00', cliques_7d: 61 },
    whatsapp: { ligado: true, situacao: 'ok', desde: '2026-08-14', aviso: null },
  };
}

function agendaDe(mundo) {
  if (mundo.cenario === 'comeco') return { dias: [], leitura: null };
  const marcados = mundo.receita.contas ? [9, 9, 4, 8, 7, 5, 3] : [7, 8, 3, 4, 2, 1, 0];
  const datas = ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'];
  const dias = datas.map((data, i) => {
    const cabem = semana(data) === 6 ? 5 : 10;
    const n = Math.min(marcados[i], cabem);
    return { data, rotulo: DIAS_SEMANA[semana(data)] + ' ' + Number(data.slice(8, 10)), ocupacao: arredondar(n / cabem, 2), marcados: n, vagas: cabem - n };
  });
  return { dias, leitura: mundo.receita.contas ? 'Hoje e sexta estão quase cheios: não precisa acelerar anúncio agora.' : 'Sexta está quase cheia. De segunda em diante sobra bastante horário.' };
}

function variacao(valor, antes) {
  return ehNumero(valor) && ehNumero(antes) && antes > 0 ? arredondar((valor - antes) / antes, 4) : null;
}
function numeroDoPlacar(id, rotulo, valor, formato, apoio, antes, seSobe, serie) {
  const v = variacao(valor, antes);
  const sentido = v == null || Math.abs(v) < 0.005 || seSobe === 'neutro' ? 'neutro' : (v > 0) === (seSobe === 'bom') ? 'bom' : 'ruim';
  return { id, rotulo, valor, formato, apoio, antes: ehNumero(antes) ? antes : null, variacao: v, sentido, serie };
}

const conta = (n, um, varios) => inteiro(n) + ' ' + plural(n, um, varios);

export function responderHoje(mundo, periodoId) {
  const p = periodoDe(periodoId);
  const r = mundo.receita;
  const lista = noPeriodo(mundo, p.de, p.ate), antes = noPeriodo(mundo, p.anterior.de, p.anterior.ate);
  const dias = listaDeDias(p.de, p.ate);
  const pagos = lista.filter(ehPago);
  const fechados = lista.filter((c) => c.desfecho.tipo === 'fechou'), fechadosAntes = antes.filter((c) => c.desfecho.tipo === 'fechou');
  const fechadosPagos = fechados.filter(ehPago);
  const comValor = fechados.filter((c) => c.desfecho.valor != null);
  const faturado = somaDosValores(fechados), faturadoPago = somaDosValores(fechadosPagos), faturadoAntes = somaDosValores(fechadosAntes);
  const gasto = gastoNoPeriodo(mundo, p.de, p.ate), gastoAntes = gastoNoPeriodo(mundo, p.anterior.de, p.anterior.ate);
  const estado = estadoDe(mundo, lista, p);
  const semValor = fechados.length - comValor.length;
  const semValorPago = fechadosPagos.filter((c) => c.desfecho.valor == null).length;
  const semMotivo = lista.filter((c) => c.pendencias.includes('sem_motivo')).length;
  const semOrigem = lista.filter((c) => c.pendencias.includes('sem_origem')).length;
  const esperando = lista.filter((c) => c.pendencias.includes('sem_resposta'));
  const conexoes = conexoesDe(mundo);
  const agenda = agendaDe(mundo);
  const retorno = gasto && faturadoPago > 0 ? dividir(faturadoPago, gasto.total, 2) : null;
  const porDia = (fn) => dias.map((d) => fn(lista.filter((c) => dataDe(c.chegou_em) === d), d));

  /* --- frase principal --- */
  let frase;
  if (!lista.length) {
    const doZero = mundo.cenario === 'comeco';
    frase = { tipo: 'comeco', texto: doZero ? 'Ainda não chegou nenhum contato por aqui.' : 'Nenhum contato novo ' + p.quando + '.',
      apoio: doZero ? 'Quando o primeiro contato entrar pelo WhatsApp, pelo site ou pelo CRM, esta tela mostra de onde ele veio e como terminou.' : 'Troque o período para ver os contatos de antes.',
      acao: doZero ? { rotulo: 'Ver o que falta ligar', ir: 'ajustes?secao=conexoes' } : null, destaque: doZero ? 'nenhum contato' : 'Nenhum contato novo' };
  } else if (gasto && retorno != null) {
    frase = { tipo: 'retorno', texto: 'Cada R$ 1 em anúncio virou ' + dinheiro(retorno, { centavos: true }) + ' na oficina.',
      apoio: dinheiro(gasto.total) + ' investidos, ' + dinheiro(faturadoPago) + ' em serviços fechados que vieram de anúncio.',
      acao: semValorPago ? { rotulo: 'Lançar os ' + semValorPago + ' valores que faltam', ir: 'jornada?pendencia=sem_valor' } : null,
      destaque: dinheiro(retorno, { centavos: true }) };
  } else if (gasto) {
    frase = { tipo: 'falta_valor', texto: dinheiro(gasto.total) + ' investidos trouxeram ' + conta(pagos.length, 'contato', 'contatos') + '. Falta lançar o valor de ' + conta(semValorPago, 'serviço', 'serviços') + ' para saber o retorno.',
      apoio: 'O retorno aparece assim que os serviços fechados que vieram de anúncio tiverem valor.',
      acao: { rotulo: 'Lançar valores', ir: 'jornada?pendencia=sem_valor' }, destaque: conta(pagos.length, 'contato', 'contatos') };
  } else {
    frase = { tipo: 'sem_conta', texto: conta(lista.length, 'contato novo', 'contatos novos') + ' ' + p.quando + '. ' + inteiro(pagos.length) + ' ' + plural(pagos.length, 'veio', 'vieram') + ' de anúncio.',
      apoio: 'Sem conta de anúncio ligada, ainda não dá para saber quanto custou cada contato nem o retorno.',
      acao: { rotulo: 'Ligar conta de anúncios', ir: 'ajustes?secao=conexoes' }, destaque: inteiro(pagos.length) + ' ' + plural(pagos.length, 'veio', 'vieram') + ' de anúncio' };
  }

  /* --- os quatro números --- */
  const numeros = [
    numeroDoPlacar('investido', 'Investido em anúncio', gasto ? gasto.total : null, 'dinheiro',
      gasto ? 'Meta ' + dinheiro(gasto.meta) + ' · Google ' + dinheiro(gasto.google) : 'Falta ligar a conta de anúncios.',
      gastoAntes ? gastoAntes.total : null, 'neutro', gasto ? porDia((_l, d) => { const g = mundo.gasto.get(d); return g ? arredondar(g.meta + g.google) : 0; }) : []),
    numeroDoPlacar('contatos', 'Contatos novos', lista.length, 'inteiro', inteiro(pagos.length) + ' de anúncio', antes.length, 'bom', porDia((l) => l.length)),
    numeroDoPlacar('fechados', 'Serviços fechados', fechados.length, 'inteiro', inteiro(fechadosPagos.length) + ' de anúncio', fechadosAntes.length, 'bom', porDia((l) => l.filter((c) => c.desfecho.tipo === 'fechou').length)),
    numeroDoPlacar('faturado', 'Faturado', fechados.length && !comValor.length ? null : faturado, 'dinheiro',
      !fechados.length ? 'Nenhum serviço fechado ' + p.quando + '.' : semValor ? inteiro(comValor.length) + ' de ' + conta(fechados.length, 'serviço', 'serviços') + ' com valor lançado' : dinheiro(faturadoPago) + ' vieram de anúncio',
      semValor ? null : faturadoAntes || null, 'bom', porDia((l) => somaDosValores(l))),   // com valor faltando, comparar enganaria
  ];

  const respondidos = lista.flatMap((c) => c.etapas.filter((e) => e.id === 'respondido' && ehNumero(e.minutos)).map((e) => e.minutos)).sort((a, b) => a - b);
  const derivados = {
    custo_por_contato: gasto ? dividir(gasto.total, pagos.length) : null,
    custo_por_servico: gasto ? dividir(gasto.total, fechadosPagos.length) : null,
    retorno,
    ticket_medio: dividir(faturado, comValor.length),
    taxa_fechamento: dividir(fechados.length, lista.length, 4),
    tempo_resposta_min: estado.respostas === 'ok' && respondidos.length ? respondidos[Math.floor(respondidos.length / 2)] : null,
    taxa_falta: lista.length ? r.taxaFalta : null,
  };

  /* --- o que fazer agora (no máximo 6, do mais importante para o menos) --- */
  const fazer = [];
  if (conexoes.whatsapp.situacao === 'chave_recusada') {
    fazer.push({ id: 'whatsapp_parado', gravidade: 'alta', origem: 'conexao', titulo: 'O WhatsApp automático está parado desde ' + diaMes(conexoes.whatsapp.desde),
      porque: 'Lembretes de horário e respostas do sistema não estão saindo. A chave de acesso foi recusada; só quem é dono da conta consegue gerar outra.',
      acao: { rotulo: 'Abrir o Atendimento', ir: '/atendimento/' } });
  }
  if (esperando.length) {
    fazer.push({ id: 'sem_resposta', gravidade: 'alta', origem: 'resposta', titulo: conta(esperando.length, 'contato está esperando', 'contatos estão esperando') + ' resposta',
      porque: 'Quem escreve e fica sem resposta costuma fechar com a primeira oficina que responder.',
      acao: { rotulo: 'Ver quem espera', ir: 'jornada?pendencia=sem_resposta' } });
  }
  if (mundo.cenario === 'comeco') {
    fazer.push({ id: 'ligar_conta', gravidade: 'media', origem: 'conexao', titulo: 'Ligar a conta de anúncios', porque: 'É de lá que vem o gasto. Com ele, a tela calcula o custo de cada contato.', acao: { rotulo: 'Ver como ligar', ir: 'ajustes?secao=conexoes' } });
    fazer.push({ id: 'rastreio', gravidade: 'media', origem: 'conexao', titulo: 'Colocar o rastreio no site', porque: 'Uma linha no site basta para saber de onde veio quem clicou no botão do WhatsApp.', acao: { rotulo: 'Ver o passo a passo', ir: 'ajustes?secao=conexoes' } });
    fazer.push({ id: 'whatsapp', gravidade: 'baixa', origem: 'conexao', titulo: 'Ligar o WhatsApp da oficina', porque: 'Com o aparelho ligado, cada conversa nova já entra aqui como contato.', acao: { rotulo: 'Abrir o Atendimento', ir: '/atendimento/' } });
  } else if (!r.contas) {
    fazer.push({ id: 'sem_conta', gravidade: 'media', origem: 'conexao', titulo: 'Nenhuma conta de anúncio ligada',
      porque: 'A tela já sabe quantos contatos vieram de anúncio, mas não quanto custou cada um.', acao: { rotulo: 'Ligar conta de anúncios', ir: 'ajustes?secao=conexoes' } });
  }
  if (conexoes.google.situacao === 'token_vencendo') {
    fazer.push({ id: 'acesso_vencendo', gravidade: 'media', origem: 'conexao', titulo: 'O acesso do Google vence em 6 dias', porque: 'Se vencer, o gasto do Google para de entrar e o custo por contato fica errado.', acao: { rotulo: 'Renovar o acesso', ir: 'ajustes?secao=conexoes' } });
  }
  if (semValor) {
    fazer.push({ id: 'sem_valor', gravidade: 'media', origem: 'pendencia', titulo: conta(semValor, 'serviço fechado', 'serviços fechados') + ' sem valor',
      porque: 'Sem o valor não dá para saber quanto dinheiro cada origem trouxe.', acao: { rotulo: 'Lançar agora', ir: 'jornada?pendencia=sem_valor' } });
  }
  if (semOrigem) {
    fazer.push({ id: 'sem_origem', gravidade: 'media', origem: 'pendencia', titulo: conta(semOrigem, 'contato', 'contatos') + ' sem origem',
      porque: 'Ainda não sabemos de onde ' + plural(semOrigem, 'ele veio', 'eles vieram') + '. Leva um toque por contato.', acao: { rotulo: 'Dizer de onde vieram', ir: 'jornada?pendencia=sem_origem' } });
  }
  if (semMotivo) {
    fazer.push({ id: 'sem_motivo', gravidade: 'baixa', origem: 'pendencia', titulo: conta(semMotivo, 'contato que não fechou está', 'contatos que não fecharam estão') + ' sem motivo',
      porque: 'O motivo mostra onde a oficina perde serviço: preço, prazo ou falta de retorno.', acao: { rotulo: 'Dizer o motivo', ir: 'jornada?pendencia=sem_motivo' } });
  }
  const cheio = agenda.dias.find((d) => d.ocupacao >= 0.8);
  if (cheio) {
    fazer.push({ id: 'agenda', gravidade: 'baixa', origem: 'agenda', titulo: 'A agenda de ' + (cheio.data === HOJE ? 'hoje' : NOME_DO_DIA[semana(cheio.data)]) + ' está quase cheia',
      porque: conta(cheio.vagas, 'horário livre', 'horários livres') + ' nesse dia. Se for acelerar anúncio, mire na semana que vem.', acao: { rotulo: 'Abrir a Agenda', ir: '/agenda/' } });
  }

  /* --- ritmo do mês --- */
  const diasDoMes = 30;
  const ritmo = gasto && p.id === 'mes'
    ? { orcamento_mes: r.orcamento, gasto_ate_hoje: gasto.total, esperado_ate_hoje: arredondar((r.orcamento * dias.length) / diasDoMes, 0),
        projecao: arredondar((gasto.total / dias.length) * diasDoMes, 0), situacao: 'no_ritmo', meta_contatos: null }
    : { orcamento_mes: null, gasto_ate_hoje: gasto ? gasto.total : null, esperado_ate_hoje: null, projecao: null, situacao: 'sem_meta', meta_contatos: null };
  if (ritmo.orcamento_mes) ritmo.situacao = ritmo.projecao > ritmo.orcamento_mes * 1.08 ? 'acima' : ritmo.projecao < ritmo.orcamento_mes * 0.85 ? 'abaixo' : 'no_ritmo';
  ritmo.dias = porDia((l, d) => { const g = mundo.gasto.get(d); return { data: d, gasto: g ? arredondar(g.meta + g.google) : null, contatos: l.length, contatos_anuncio: l.filter(ehPago).length }; });

  /* --- de onde vieram --- */
  const porCanal = new Map();
  for (const c of lista) { if (!porCanal.has(c.origem.canal)) porCanal.set(c.origem.canal, []); porCanal.get(c.origem.canal).push(c); }
  const origens = [...porCanal].map(([id, l]) => {
    const f = l.filter((c) => c.desfecho.tipo === 'fechou');
    const valorados = f.filter((c) => c.desfecho.valor != null).length;
    const g = gasto && (id === 'meta' || id === 'google') ? gasto[id] : null;
    const fat = f.length && !valorados ? null : somaDosValores(f);
    return { id, rotulo: ROTULO_DO_CANAL[id], paga: id === 'meta' || id === 'google' ? true : id === 'desconhecida' ? null : false,
      contatos: l.length, fecharam: f.length, faturado: fat, gasto: g, custo_por_contato: dividir(g, l.length), retorno: g && fat ? dividir(fat, g) : null };
  }).sort((a, b) => (a.id === 'desconhecida') - (b.id === 'desconhecida') || (b.paga === true) - (a.paga === true) || b.contatos - a.contatos);

  /* --- contatos de hoje --- */
  const hoje = noPeriodo(mundo, HOJE, HOJE).map((c) => ({
    lead_id: c.lead_id, nome: c.nome_curto, hora: c.chegou_em.slice(11, 16), origem: c.origem, etapa_atual: c.etapa_atual,
    espera_min: c.pendencias.includes('sem_resposta') ? Math.round((AGORA - Date.parse(c.chegou_em)) / MIN) : null,
    // Igual à API-base (T2a): os contatos de hoje vêm SEM etapas; a tela não desenha mini-setores aqui (pedido anotado para a T2a).
  }));

  return { periodo: periodoPublico(p), estado, frase, numeros, derivados, fazer: fazer.slice(0, 6), ritmo, funil: montarFunil(mundo, lista, p), origens, hoje, agenda, conexoes };
}

/* ------------------------------ jornada ------------------------------ */

const ACENTOS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
const semAcento = (t) => String(t == null ? '' : t).normalize('NFD').replace(ACENTOS, '').toLowerCase();

function filtrar(lista, q) {
  let s = lista;
  const canal = q.get('canal'), paga = q.get('paga'), campanha = q.get('campanha'), desfecho = q.get('desfecho'), etapa = q.get('etapa'), pendencia = q.get('pendencia');
  const busca = semAcento(q.get('q') || '').trim();
  if (canal) s = s.filter((c) => c.origem.canal === canal);
  if (paga === '1') s = s.filter(ehPago);
  if (paga === '0') s = s.filter((c) => !ehPago(c));
  if (campanha) s = s.filter((c) => c.origem.campanha && c.origem.campanha.ext === campanha);
  if (desfecho) s = s.filter((c) => c.desfecho.tipo === desfecho);
  if (etapa) s = s.filter((c) => c.etapa_atual === etapa);
  if (pendencia) s = s.filter((c) => c.pendencias.includes(pendencia));
  if (busca) {
    const digitos = busca.replace(/[^0-9]/g, '');
    s = s.filter((c) => semAcento(c.nome).includes(busca) || semAcento(c.carro).includes(busca) || semAcento(c.placa).includes(busca) || (digitos.length >= 3 && c.telefone.includes(digitos)));
  }
  return s;
}

function ordenar(lista, ordem) {
  const s = lista.slice();
  if (ordem === 'valor') return s.sort((a, b) => (b.desfecho.valor ?? -1) - (a.desfecho.valor ?? -1));
  if (ordem === 'parados') return s.sort((a, b) => (b.desfecho.parado_dias ?? -1) - (a.desfecho.parado_dias ?? -1));
  return s;
}

function totaisDe(mundo, lista, periodo) {
  const sabeResposta = respostasNoPeriodo(mundo, periodo.ate);
  const n = (fn) => lista.filter(fn).length;
  const chegou = (i) => n((c) => indiceDaEtapa(c) >= i);
  const fechados = lista.filter((c) => c.desfecho.tipo === 'fechou');
  const conversas = periodo.id === 'mes' ? mundo.receita.conversas : null;
  return {
    contatos: lista.length, de_anuncio: n(ehPago), respondidos: sabeResposta ? chegou(1) : null, com_orcamento: chegou(2), agendaram: chegou(3), vieram: chegou(4),
    fecharam: fechados.length, nao_fecharam: n((c) => c.desfecho.tipo === 'nao_fechou'), abertos: n((c) => c.desfecho.tipo === 'aberto'),
    faturado: fechados.length && !fechados.some((c) => c.desfecho.valor != null) ? null : somaDosValores(fechados),
    sem_origem: n((c) => c.pendencias.includes('sem_origem')), sem_valor: n((c) => c.pendencias.includes('sem_valor')),
    sem_motivo: n((c) => c.pendencias.includes('sem_motivo')), sem_resposta: sabeResposta ? n((c) => c.pendencias.includes('sem_resposta')) : null,
    // Campos a mais (recado T2b): primeira mensagem recebida de cada telefone no período.
    conversas_novas: conversas ? conversas.novas : null, conversas_novas_anuncio: conversas ? conversas.anuncio : null,
  };
}

function opcoesDeFiltro(lista) {
  const porCanal = new Map(), porCampanha = new Map(), porDesfecho = new Map(), porMotivo = new Map();
  for (const c of lista) {
    porCanal.set(c.origem.canal, (porCanal.get(c.origem.canal) || 0) + 1);
    porDesfecho.set(c.desfecho.tipo, (porDesfecho.get(c.desfecho.tipo) || 0) + 1);
    if (c.desfecho.motivo) porMotivo.set(c.desfecho.motivo, (porMotivo.get(c.desfecho.motivo) || 0) + 1);
    if (c.origem.campanha) {
      const k = c.origem.campanha.ext;
      if (!porCampanha.has(k)) porCampanha.set(k, { ext: k, nome: c.origem.campanha.nome, plataforma: c.origem.canal, n: 0, fecharam: 0 });
      const linha = porCampanha.get(k);
      linha.n++;
      if (c.desfecho.tipo === 'fechou') linha.fecharam++;   // campo a mais: a tela de espera das Campanhas usa
    }
  }
  const ROTULO_DESFECHO = { fechou: 'Fechou', nao_fechou: 'Não fechou', aberto: 'Em aberto' };
  return {
    canais: [...porCanal].map(([id, n]) => ({ id, rotulo: ROTULO_DO_CANAL[id], n })).sort((a, b) => b.n - a.n),
    campanhas: [...porCampanha.values()].sort((a, b) => b.n - a.n),
    desfechos: [...porDesfecho].map(([id, n]) => ({ id, rotulo: ROTULO_DESFECHO[id], n })),
    motivos: [...porMotivo].map(([id, n]) => ({ id, rotulo: MOTIVOS[id], n })).sort((a, b) => b.n - a.n),
  };
}

export function responderJornada(mundo, q) {
  const p = periodoDe(q.get('periodo'));
  const doPeriodo = noPeriodo(mundo, p.de, p.ate);
  const filtrados = ordenar(filtrar(doPeriodo, q), q.get('ordem'));
  const tamanho = Math.min(200, Math.max(1, Number.parseInt(q.get('tamanho'), 10) || 50));
  const paginas = Math.max(1, Math.ceil(filtrados.length / tamanho));
  const atual = Math.min(paginas, Math.max(1, Number.parseInt(q.get('pagina'), 10) || 1));
  return {
    periodo: periodoPublico(p), estado: estadoDe(mundo, doPeriodo, p),
    totais: totaisDe(mundo, filtrados, p), funil: montarFunil(mundo, filtrados, p), filtros: opcoesDeFiltro(doPeriodo),
    itens: filtrados.slice((atual - 1) * tamanho, atual * tamanho).map(itemPublico),
    pagina: { atual, tamanho, total: filtrados.length },
  };
}

export function responderDetalhe(mundo, id) {
  const c = mundo.contatos.find((x) => x.lead_id === id);
  if (!c) return null;
  return { ...itemPublico(c), nome: c.nome, telefone: c.telefone, linha_do_tempo: linhaDoTempo(c), primeira_mensagem: c.primeira_mensagem, rastreio: c.rastreio, historico: c.historico, links: linksDe(c) };
}

export function responderPendencias(mundo, periodoId) {
  const p = periodoDe(periodoId);
  const lista = noPeriodo(mundo, p.de, p.ate);
  const sabeResposta = respostasNoPeriodo(mundo, p.ate);
  const grupo = (id, comMensagem = false) => {
    const todos = lista.filter((c) => c.pendencias.includes(id));
    return { n: todos.length, itens: todos.slice(0, 30).map((c) => (comMensagem ? { ...itemPublico(c), primeira_mensagem: c.primeira_mensagem } : itemPublico(c))) };
  };
  return { sem_valor: grupo('sem_valor'), sem_motivo: grupo('sem_motivo'), sem_origem: grupo('sem_origem', true), sem_resposta: sabeResposta ? grupo('sem_resposta') : { n: null, itens: [] } };
}

export function responderConexoes(mundo) {
  const c = conexoesDe(mundo);
  const passos = [
    { feito: c.whatsapp.situacao === 'ok', titulo: 'WhatsApp da oficina ligado',
      como: c.whatsapp.situacao === 'ok' ? 'Cada conversa nova entra como contato.' : c.whatsapp.situacao === 'chave_recusada' ? 'No Atendimento, em Configurações e depois Integrações: gere uma chave nova no CodeWords e cole lá. Só o dono da conta consegue.' : 'Ligue o aparelho da oficina no Atendimento.',
      acao: c.whatsapp.situacao === 'ok' ? null : { rotulo: 'Abrir o Atendimento', ir: '/atendimento/?aba=integracoes' } },
    { feito: c.site.rastreio === true, titulo: 'Site avisando de onde vem cada contato',
      como: c.site.rastreio ? 'O botão de WhatsApp do site já manda o código junto com a mensagem.' : 'O botão de WhatsApp do site manda um código junto com a mensagem. Este passo fica pronto no primeiro clique.',
      acao: { rotulo: 'Ver de onde vêm os contatos', ir: 'ajustes?secao=origem' } },
    { feito: c.meta.ligado, titulo: 'Conta de anúncios da Meta ligada',
      como: c.meta.ligado ? 'O gasto do Instagram e do Facebook entra todo dia de manhã.' : 'Em Ajustes, na parte de Conexões: entre com a conta da Meta e escolha a conta de anúncios da oficina.',
      acao: c.meta.ligado ? null : { rotulo: 'Ligar a Meta', ir: 'ajustes?secao=conexoes' } },
    { feito: c.google.ligado, titulo: 'Conta do Google Ads ligada',
      como: c.google.ligado ? 'O gasto do Google entra todo dia de manhã.' : 'Em Ajustes, na parte de Conexões: entre com a conta do Google e escolha a conta de anúncios da oficina.',
      acao: c.google.ligado ? null : { rotulo: 'Ligar o Google', ir: 'ajustes?secao=conexoes' } },
    { feito: Boolean(mundo.receita.orcamento), titulo: 'Orçamento do mês definido',
      como: mundo.receita.orcamento ? 'A tela Hoje mostra se o gasto está no ritmo da verba.' : 'Em Ajustes: diga quanto pretende investir por mês. Com isso a tela mostra se o gasto está no ritmo.',
      acao: mundo.receita.orcamento ? null : { rotulo: 'Definir o orçamento', ir: 'ajustes?secao=metas' } },
  ];
  return { ...c, passos, faltam: passos.filter((p) => !p.feito).length, estado: { incompleto: [] } };
}

/* ------------------------------ gravações ------------------------------ */

const erro = (status, frase) => ({ status, corpo: { erro: frase } });

export function gravar(mundo, id, tipo, corpo, quem = 'você') {
  const c = mundo.contatos.find((x) => x.lead_id === id);
  if (!c) return erro(404, 'Não encontrei esse contato.');
  if (tipo === 'valor') {
    const valor = Number(corpo && corpo.valor);
    if (!Number.isFinite(valor)) return erro(422, 'Informe o valor do serviço em reais, por exemplo 750 ou 750,50.');
    if (valor < 1 || valor > 100000) return erro(422, 'O valor do serviço precisa ficar entre R$ 1 e R$ 100.000.');
    if (c.desfecho.tipo !== 'fechou') return erro(409, 'Só dá para lançar valor em contato que já fechou.');
    const antes = c.desfecho.valor;
    const lancado = Math.round(valor * 100) / 100;
    // Fonte mais forte que o lançamento à mão (Pátio, orçamento, Agenda) continua valendo: o servidor avisa em vez de fingir.
    const forte = c.desfecho.valor_fonte && c.desfecho.valor_fonte !== 'manual';
    if (!forte) c.desfecho = { ...c.desfecho, valor: lancado, valor_fonte: 'manual' };
    c.pendencias = pendenciasDe(c);
    const aviso = forte && c.desfecho.valor !== lancado ? 'O valor que vale continua sendo o ' + FONTE_DO_VALOR[c.desfecho.valor_fonte] + ' (' + dinheiro(c.desfecho.valor) + '). O que você lançou ficou guardado.' : null;
    return { status: 200, corpo: { ok: true, antes, valor: lancado, desfecho: c.desfecho, aviso } };
  }
  if (tipo === 'motivo') {
    const motivo = corpo && corpo.motivo;
    if (!MOTIVOS[motivo]) return erro(422, 'Escolha um motivo da lista.');
    if (c.desfecho.tipo !== 'nao_fechou') return erro(409, 'Só dá para marcar o motivo em contato que não fechou.');
    c.desfecho = { ...c.desfecho, motivo, motivo_rotulo: MOTIVOS[motivo], obs: corpo.obs ? String(corpo.obs).slice(0, 300) : null };
    c.pendencias = pendenciasDe(c);
    return { status: 200, corpo: { ok: true, motivo, obs: c.desfecho.obs, desfecho: c.desfecho } };
  }
  if (tipo === 'origem') {
    const canal = corpo && corpo.canal;
    if (!ROTULO_DO_CANAL[canal] || canal === 'desconhecida') return erro(422, 'Escolha uma das origens da lista.');
    c.origem = { canal, paga: canal === 'meta' || canal === 'google', rotulo: ROTULO_DO_CANAL[canal], detalhe: corpo.campanha_nome || null,
      campanha: corpo.campanha_ext ? { ext: String(corpo.campanha_ext), nome: corpo.campanha_nome || null } : null, conjunto: null, anuncio: null, palavra_chave: null,
      como: 'manual', como_rotulo: 'marcado por ' + quem, certeza: 'certa' };
    c.pendencias = pendenciasDe(c);
    return { status: 200, corpo: { ok: true, canal, origem: c.origem } };
  }
  return erro(404, 'Não conheço essa gravação.');
}

export function gravarLote(mundo, corpo, quem) {
  const itens = Array.isArray(corpo && corpo.itens) ? corpo.itens.slice(0, 50) : [];
  let feitos = 0;
  const erros = [];
  for (const item of itens) {
    const passos = [];
    if (item.valor != null) passos.push(['valor', { valor: item.valor }]);
    if (item.motivo) passos.push(['motivo', { motivo: item.motivo, obs: item.obs }]);
    if (item.origem) passos.push(['origem', item.origem]);
    let falhou = null;
    for (const [tipo, dados] of passos) { const r = gravar(mundo, item.lead_id, tipo, dados, quem); if (r.status !== 200) falhou = r.corpo.erro; }
    if (falhou) erros.push({ lead_id: item.lead_id, erro: falhou }); else feitos++;
  }
  return { status: 200, corpo: { ok: erros.length === 0, feitos, erros } };
}

export const PERFIL = {
  id: '00000000-0000-4000-8000-00000000eu01', email: 'dono@oficina.test', nome: 'Paulo Mendes', papel: 'admin', cargo: null, telefone: null, avatar_cor: null,
  apps: ['agenda', 'crm', 'atendimento', 'comunicar', 'ads'], precisa_trocar_senha: false, preferencias: { notificacoes: { ads_alertas: true, ads_semana: true } },
  acesso: true, motivo_sem_acesso: null, acesso_conferido_no_banco: true, ultimo_acesso_em: '2026-11-18T18:02:00-03:00', ultimo_app: 'ads',
  apps_disponiveis: ['agenda', 'crm', 'atendimento', 'comunicar', 'ads'], eh_admin: true,
};

/* Para dados-t3b.mjs (frente T3b): as mesmas somas, para Campanhas e relatórios nunca discordarem da Hoje. */
export { noPeriodo, itemPublico, ehPago, gastoNoPeriodo, estadoDe, conexoesDe, somaDosValores, listaDeDias, dataDe, periodoPublico,
  ROTULO_DO_CANAL, CAMPANHAS, HOJE, AGORA, MIN, arredondar, dividir, MOTIVOS, isoBr, semana, montarFunil };
