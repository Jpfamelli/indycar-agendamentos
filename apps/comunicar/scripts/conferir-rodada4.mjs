// Conferência da rodada 4 no banco REAL — só LEITURA (nada é gravado).
//   node scripts/conferir-rodada4.mjs
// Roda as mesmas leituras que as rotas novas fazem e as funções puras em cima
// delas: carteiro (batidas + chamadas do pg_cron), prontidão, prévia do mês,
// sugestões de aniversário, casamento de uma lista de teste, indicadores.
import * as dados from '../dados.js';
import { resumirCarteiro } from '../carteiro.js';
import { montarProntidao } from '../prontidao.js';
import { projetarMes } from '../projecao.js';
import { lerLista, casarComClientes, resumirAnalise, montarSugestoes } from '../aniversarios.js';

const ok = (rotulo, v) => console.log(`✔ ${rotulo}:`, typeof v === 'string' ? v : JSON.stringify(v));
const t0 = Date.now();
const cfg = await dados.obterConfig();

const [batidas, chamadas] = await Promise.all([dados.batidasRecentes(24), dados.chamadasRecentes(24)]);
const c = resumirCarteiro({ batidas, chamadas, janela: { inicio: cfg.janela_inicio, fim: cfg.janela_fim } });
ok('carteiro 24 h', { rodadas: c.rodadas24h, chamadas: c.chamadas24h, falhas: c.falhas24h, dormindo: c.dormindo, demorou: c.demorou, reforcosOk: c.reforcosOk, ultima: c.ultimaEm || cfg.ultima_rodada_em });

const [pend, comData, total, testeOk, iaCfg, chave] = await Promise.all([
  dados.contarPendentes(), dados.contarComNascimento(), dados.contarClientesComTelefone(), dados.ultimoTesteOk(), dados.iaConfig(), dados.chaveIA(),
]);
ok('fila pendente', pend);
const pronto = montarProntidao({ cfg, whatsapp: { ok: false, chaveRecusada: true }, carteiro: { ...c, ultimaEm: c.ultimaEm || cfg.ultima_rodada_em },
  aniversarios: { comData, total }, ia: { ativo: iaCfg.ativo, temChave: !!chave }, teste: { ultimoOkEm: testeOk } });
ok('pronto para ligar', `${pronto.prontos}/${pronto.total} · pronto=${pronto.pronto} · faltam: ${pronto.itens.filter((i) => i.estado === 'falta').map((i) => i.id).join(', ')}`);

const t1 = Date.now();
const d = await dados.dadosDaProjecao();
const p = projetarMes({ hoje: dados.hoje(), ...d });
ok(`prévia do mês (${Date.now() - t1} ms; ${d.agendamentos.length} agendamentos, ${d.clientes.length} clientes, ${d.leads.length} orçamentos)`,
  Object.fromEntries(Object.entries(p.porRegua).map(([k, v]) => [k, v.total])));
ok('prévia: total / com as ligadas hoje / estimados', [p.total, p.comAsLigadasHoje, p.estimados]);

const textos = await dados.textosComAniversario();
const ids = [...textos.leads.map((l) => l.cliente_id), ...textos.mensagens.map((m) => m.conversa?.cliente_id)].filter(dados.ehUuid);
const fichas = ids.length ? await dados.buscarClientesPorIds(ids) : [];
const sug = montarSugestoes(textos, new Map(fichas.map((x) => [x.id, x])));
ok('sugestões de aniversário', { lidos: { fichas: textos.fichas.length, crm: textos.leads.length, conversas: textos.mensagens.length }, sugestoes: sug.length });

const clientes = await dados.clientesParaCasar();
const amostra = clientes.filter((x) => x.telefone).slice(0, 3).map((x, i) => `${x.nome} ${x.telefone} ${10 + i}/05`).join('\n') + '\nFulano Que Não Existe 01/01';
const casados = casarComClientes(lerLista(amostra).linhas, clientes);
ok('lista de teste casada (nada gravado)', resumirAnalise(casados));

const ind = await dados.indicadoresEquipe(30);
ok('indicadores 30 dias', ind.map((x) => `${x.nome}: ${x.enviadas} env`).join(' · ') || 'ninguém mandou manual');
ok('último teste ok', testeOk || 'nenhum');
console.log(`\nTudo lido em ${Date.now() - t0} ms — nada foi gravado.`);
