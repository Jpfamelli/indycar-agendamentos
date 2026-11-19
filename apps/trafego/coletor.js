/* ============================================================
   Coletor — orquestra Meta + Google e grava em ads_metricas_dia.
   Também sabe fabricar dados de demonstração, para o painel poder
   ser usado antes de os tokens das plataformas saírem.
   ============================================================ */
'use strict';

const db = require('./db');
const meta = require('./meta');
const google = require('./google');

const NIVEIS = ['campanha', 'conjunto', 'anuncio'];

const iso = d => d.toISOString().slice(0, 10);
const hoje = () => new Date();
const menos = (d, dias) => new Date(d.getTime() - dias * 86400000);

/**
 * Puxa os últimos N dias das duas plataformas.
 *
 * Regravamos sempre uma janela (não só ontem) de propósito: a atribuição do
 * Meta continua creditando conversões a dias já passados por até 7 dias, então
 * um sync "só de ontem" deixa o histórico congelado com números errados.
 */
async function sincronizar({ dias = 7, plataformas = ['meta', 'google'], niveis = NIVEIS } = {}) {
  const ate = iso(hoje());
  const de = iso(menos(hoje(), dias));
  const integracoes = await db.lerIntegracoes();
  const relato = { de, ate, plataformas: {}, erros: [] };

  for (const cred of integracoes) {
    if (cred.ativo === false) continue;
    const canal = cred.canal;                       // 'meta' | 'google'
    if (!plataformas.includes(canal)) continue;

    const motor = canal === 'meta' ? meta : canal === 'google' ? google : null;
    if (!motor) continue;

    let total = 0;
    try {
      for (const nivel of niveis) {
        const linhas = await motor.buscar(cred, nivel, de, ate);
        total += await db.gravarMetricas(linhas);
      }
      relato.plataformas[canal] = { ok: true, linhas: total };
      await db.marcarSync(cred.id, `ok — ${total} linhas`);
    } catch (e) {
      // Uma plataforma quebrada não pode derrubar a outra: o dono precisa
      // do painel do Google mesmo quando o token do Meta vence.
      relato.plataformas[canal] = { ok: false, erro: e.message };
      relato.erros.push(`${canal}: ${e.message}`);
      await db.marcarSync(cred.id, `erro — ${e.message}`.slice(0, 300));
    }
  }

  if (!Object.keys(relato.plataformas).length) {
    relato.erros.push('Nenhuma integração ativa configurada em integracoes_ads.');
  }
  return relato;
}

/**
 * Valida as credenciais gravadas sem gravar nada. Cada resultado traz
 * { titulo, fazer } em português (conexoes.explicarErro), e canal sem linha
 * em integracoes_ads também aparece — "não conectado" é resposta, não silêncio.
 */
async function testarConexoes() {
  const conexoes = require('./conexoes');
  const integracoes = await db.lerIntegracoes();
  const saida = [];
  for (const canal of ['meta', 'google']) {
    if (!integracoes.some(i => i.canal === canal)) {
      saida.push({ canal, ok: false, titulo: `${canal === 'meta' ? 'Meta' : 'Google'} ainda não conectado`,
        fazer: 'Cole as credenciais em Ajustes → Conexões e clique em Testar.' });
      continue;
    }
    saida.push(await conexoes.testar(canal, {}));
  }
  return saida;
}

/* ------------------------------------------------------------
   Dados de demonstração
   ------------------------------------------------------------ */

/* Números calibrados para parecerem uma oficina de verdade: CPA entre R$ 60 e
   R$ 200 e ROAS de 2x a 5x. A `cvr` aqui é conversão sobre CLIQUE, e no
   tráfego local de serviço automotivo ela fica na casa de 1% a 3%. */
const CAMPANHAS = [
  { plat: 'meta',   id: 'demo-m1', nome: '[Meta] Revisão + Troca de Óleo — Taubaté', base: 85,  cvr: 0.018, ticket: 320 },
  { plat: 'meta',   id: 'demo-m2', nome: '[Meta] Remarketing — Clientes 90 dias',    base: 35,  cvr: 0.038, ticket: 480 },
  { plat: 'meta',   id: 'demo-m3', nome: '[Meta] Suspensão e Alinhamento',           base: 60,  cvr: 0.009, ticket: 640 },
  { plat: 'google', id: 'demo-g1', nome: '[Search] oficina mecânica perto de mim',   base: 95,  cvr: 0.028, ticket: 410 },
  { plat: 'google', id: 'demo-g2', nome: '[Search] troca de óleo taubaté',           base: 45,  cvr: 0.040, ticket: 290 },
  { plat: 'google', id: 'demo-g3', nome: '[PMax] Serviços gerais',                   base: 70,  cvr: 0.011, ticket: 520 },
];

const CRIATIVOS = ['Vídeo — Depoimento cliente', 'Estático — Antes e depois', 'Carrossel — Tabela de preços'];

/* Ruído determinístico: o mesmo dia gera sempre o mesmo número, então
   recarregar a página não muda o gráfico e o radar não dispara sozinho. */
function ruido(semente) {
  const x = Math.sin(semente * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Preenche os últimos N dias com números plausíveis de uma oficina.
 * Marca fonte='demo' — o botão "limpar demonstração" apaga só isso.
 */
async function popularDemo(dias = 45) {
  const linhas = [];
  const fim = hoje();

  for (let d = dias; d >= 1; d--) {
    const dia = menos(fim, d);
    const data = iso(dia);
    const semanaDia = dia.getDay();
    // Fim de semana rende menos em oficina; sexta rende mais.
    const sazonal = semanaDia === 0 ? 0.55 : semanaDia === 6 ? 0.75 : semanaDia === 5 ? 1.2 : 1;

    CAMPANHAS.forEach((c, ci) => {
      // A PMax fica pausada 5 dias no meio do período (como acontece de verdade
      // quando o dono segura verba) — a demonstração não pode ser uma linha reta.
      if (c.id === 'demo-g3' && d >= 16 && d <= 20) return;
      // Verba sobe ~1% por semana: o comparativo com o período anterior mostra tendência.
      const tendencia = 1 + ((dias - d) / 7) * 0.01;
      const s = ruido(d * 7 + ci * 31);
      const gasto = +(c.base * sazonal * tendencia * (0.75 + s * 0.5)).toFixed(2);
      const cpm = 22 + ruido(d + ci) * 26;
      const impressoes = Math.round((gasto / cpm) * 1000);
      const ctr = 0.9 + ruido(d * 3 + ci) * 2.2;
      const cliques = Math.max(1, Math.round(impressoes * (ctr / 100)));
      // A campanha m3 degrada de propósito nos últimos 10 dias: dá ao radar
      // e ao relatório algo real para encontrar na demonstração.
      const penal = (c.id === 'demo-m3' && d <= 10) ? 0.25 : 1;
      const conversoes = Math.round(cliques * c.cvr * penal * (0.7 + ruido(d * 11 + ci) * 0.6));
      const receita = +(conversoes * c.ticket * (0.85 + ruido(d * 5 + ci) * 0.3)).toFixed(2);
      // Só o Meta reporta alcance/frequência. Fabricar isso no Google faria a
      // demonstração disparar alertas de fadiga que nunca aconteceriam de verdade.
      const temAlcance = c.plat === 'meta';
      const alcance = temAlcance ? Math.round(impressoes / (1.4 + ruido(d + ci * 3) * 1.6)) : 0;
      const freq = alcance ? +(impressoes / alcance).toFixed(2) : 0;

      const comum = {
        plataforma: c.plat, data,
        conta_ext: c.plat === 'meta' ? 'act_demo' : 'demo',
        conta_nome: c.plat === 'meta' ? 'IndyCar (demo)' : 'IndyCar Google (demo)',
        campanha_ext: c.id, campanha_nome: c.nome,
        fonte: 'demo', atualizado_em: new Date().toISOString(),
      };

      linhas.push({ ...comum, nivel: 'campanha',
        impressoes, alcance, frequencia: freq,
        cliques, gasto, conversoes, valor_conversao: receita });

      // Um conjunto e três criativos por campanha, repartindo o total.
      const conjId = `${c.id}-cj1`;
      linhas.push({ ...comum, nivel: 'conjunto',
        conjunto_ext: conjId, conjunto_nome: 'Público principal — 25-55 · 15km',
        impressoes, alcance, frequencia: freq,
        cliques, gasto, conversoes, valor_conversao: receita });

      CRIATIVOS.forEach((nome, ai) => {
        const fatia = [0.5, 0.3, 0.2][ai];
        const impA = Math.round(impressoes * fatia);
        // Criativo 0 satura: frequência sobe com o tempo de veiculação.
        const alcA = temAlcance ? Math.round(impA / (ai === 0 ? 2.4 + (45 - d) / 22 : 1.5 + ruido(d + ai) * 0.8)) : 0;
        linhas.push({ ...comum, nivel: 'anuncio',
          conjunto_ext: conjId, conjunto_nome: 'Público principal — 25-55 · 15km',
          anuncio_ext: `${c.id}-ad${ai}`, anuncio_nome: nome,
          impressoes: impA, alcance: alcA,
          frequencia: alcA ? +(impA / alcA).toFixed(2) : 0,
          cliques: Math.round(cliques * fatia),
          gasto: +(gasto * fatia).toFixed(2),
          conversoes: Math.round(conversoes * fatia),
          valor_conversao: +(receita * fatia).toFixed(2) });
      });
    });
  }

  // Recriar do zero: dias pausados não podem herdar números de uma demonstração antiga.
  await db.apagarDemo();
  await db.gravarMetricas(linhas);
  return { dias, linhas: linhas.length };
}

module.exports = { sincronizar, testarConexoes, popularDemo, NIVEIS };
