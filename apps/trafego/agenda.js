/* ============================================================
   Piloto automático — os timers que fazem o sistema trabalhar sozinho.
   Ligado por ADS_AUTOMATICO=1. Quem hospeda em serviço que dorme
   (Render free, por exemplo) deve desligar aqui e chamar as rotas
   /api/cron/* por um agendador externo.
   ============================================================ */
'use strict';

const db = require('./db');
const coletor = require('./coletor');
const radar = require('./radar');
const relatorio = require('./relatorio');
const fechamento_ = { decidir: (...a) => require('./fechamento').decidirEnvioMensal(...a), enviar: o => require('./fechamento').enviarMesAnterior(o) };
const ciclo_ = { avisarGestores: o => require('./ciclo').avisarGestores(o) };

const FUSO = 'America/Sao_Paulo';

/** Hora local de São Paulo, independente do fuso do servidor. */
function horaLocal() {
  const s = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO, hour: '2-digit', hour12: false,
  }).format(new Date());
  return parseInt(s, 10);
}

/** Data local (YYYY-MM-DD) em São Paulo. */
function dataLocal(offsetDias = 0) {
  const d = new Date(Date.now() + offsetDias * 86400000);
  const [dia, mes, ano] = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO }).format(d).split('/');
  return `${ano}-${mes}-${dia}`;
}

const estado = {
  ligado: false,
  ultimoCiclo: null, ultimoSync: null, ultimoRadar: null, ultimoRelatorio: null,
  ultimaTentativaRelatorio: null, ultimaSemana: null, ultimoAvisoCiclo: null, ultimoFechamento: null, motivoFechamento: null,
  // Por que o relatório não saiu no último ciclo — a tela mostra isso.
  relatorio: { motivo: null, decidido_em: null },
  erros: [],
};

function registrar(erro) {
  estado.erros.unshift({ quando: new Date().toISOString(), erro: String(erro?.message || erro) });
  estado.erros = estado.erros.slice(0, 20);
  console.error('⏱  piloto automático:', erro?.message || erro);
}

/**
 * Decide se o relatório diário deve sair agora. Pura, para o teste bater:
 * sem config carregada, desligado, sem destino ou antes da hora = NÃO.
 * Este é o único lugar que autoriza o envio automático.
 */
function decidirRelatorio(cfg, hora = horaLocal()) {
  if (!cfg) return { enviar: false, motivo: 'configuração não carregou — nada é enviado' };
  if (cfg.relatorio_ativo !== true) return { enviar: false, motivo: 'relatório diário desligado em Ajustes' };
  if (!cfg.whatsapp_destinos?.length) return { enviar: false, motivo: 'nenhum número de WhatsApp cadastrado em Ajustes' };
  const alvo = cfg.relatorio_hora ?? 8;
  if (hora < alvo) return { enviar: false, motivo: `aguardando as ${alvo}h` };
  return { enviar: true, motivo: null };
}

/* Injetável nos testes. */
const semanal = { gerar: o => require('./semanal').gerarENotificar(o) };

/** Resumo semanal: segunda-feira, a partir das 8h, uma vez por semana (pura). */
function decidirSemanal(hojeISO, hora, ultimaSemana) {
  const dow = new Date(`${hojeISO}T12:00:00Z`).getUTCDay();
  if (dow !== 1) return { enviar: false, motivo: 'só às segundas' };
  if (hora < 8) return { enviar: false, motivo: 'aguardando as 8h' };
  const { de } = require('./semanal').semanaFechada(hojeISO);
  if (ultimaSemana === de) return { enviar: false, motivo: 'já enviado esta semana' };
  return { enviar: true, semana: de };
}

async function ciclo() {
  estado.ultimoCiclo = new Date().toISOString();

  // Config primeiro. Se não carregar, o ciclo faz só o sync: sem saber se o
  // envio está ligado e para quem, o padrão é NÃO mandar nada.
  let cfg = null;
  try { cfg = await db.lerConfig(); }
  catch (e) { registrar(new Error(`config não carregou (${e.message}) — nenhum envio neste ciclo`)); }

  // 1) Sync: de hora em hora, janela de 7 dias (a atribuição do Meta ainda
  //    mexe em dias passados, então não adianta puxar só ontem).
  try {
    await coletor.sincronizar({ dias: 7 });
    estado.ultimoSync = new Date().toISOString();
  } catch (e) { registrar(e); }

  // 2) Radar: respeita o intervalo configurado. Sem config, não avalia —
  //    o radar.rodar() também lê a config e sem destino não envia, mas aqui
  //    nem gastamos leitura de métricas.
  if (cfg) {
    try {
      const intervalo = (cfg.alertas_intervalo_min || 60) * 60000;
      const passou = !estado.ultimoRadar || Date.now() - new Date(estado.ultimoRadar).getTime() >= intervalo;
      if (cfg.alertas_ativos !== false && passou) {
        await radar.rodar({ enviar: true });
        estado.ultimoRadar = new Date().toISOString();
      }
    } catch (e) { registrar(e); }
  }

  // 3) Resumo semanal no sino dos gestores (não é WhatsApp): segunda a
  //    partir das 8h. A chave ads-semana-<segunda> no banco impede repetir.
  if (cfg) {
    const hoje = dataLocal();
    const d = decidirSemanal(hoje, horaLocal(), estado.ultimaSemana);
    if (d.enviar) {
      try {
        const r = await semanal.gerar({ hojeISO: hoje });
        estado.ultimaSemana = r.de;
      } catch (e) { registrar(e); }
    }
  }

  // 3a) Rodada 6: aviso diário (sino dos gestores) de orçamento parado e carro pronto sem retirar — depois das 9h, uma vez por dia.
  if (cfg && horaLocal() >= 9 && estado.ultimoAvisoCiclo !== dataLocal()) {
    try {
      const r = await ciclo_.avisarGestores({ hojeISO: dataLocal() });
      estado.ultimoAvisoCiclo = dataLocal();
      if (r.enviado) console.log('🔔 aviso do ciclo (anúncio → oficina) enviado.');
    } catch (e) { registrar(e); }
  }

  // 3a2) Rodada 7: fechamento do mês anterior no dia 1 (mesmo opt-in do relatório diário). Reiniciar o servidor não manda de novo.
  if (cfg) {
    const hoje = dataLocal();
    const d = fechamento_.decidir(cfg, hoje, horaLocal(), estado.ultimoFechamento);
    estado.motivoFechamento = d.motivo || null;
    if (d.enviar) {
      try {
        const r = await fechamento_.enviar({ hojeISO: hoje, cfg });
        if (r.enviado) { estado.ultimoFechamento = d.mes; console.log('📈 fechamento do mês enviado.'); }
        else estado.motivoFechamento = r.motivo || 'envio falhou';
      } catch (e) { registrar(e); }
    }
  }

  // 3b) Relatório diário — uma vez por dia, na hora configurada.
  //    Desligado por CONFIGURAÇÃO desde 15/09/2026 (pedido do dono):
  //    ads_config.relatorio_ativo = false e whatsapp_destinos vazio. Para
  //    religar, marque "Enviar relatório diário" em Ajustes e cadastre um
  //    número. A trava de repetição é a referência (ontem) já gravada em
  //    ads_relatorios com enviado_em — reiniciar às 8h05 não manda de novo.
  const decisao = decidirRelatorio(cfg);
  estado.relatorio = { motivo: decisao.motivo, decidido_em: new Date().toISOString() };
  if (decisao.enviar) {
    try {
      // Se o envio falhou (ex.: chave do CodeWords recusada), tenta de novo
      // só de hora em hora — não a cada 15 min, gastando IA à toa.
      const ultima = estado.ultimaTentativaRelatorio ? new Date(estado.ultimaTentativaRelatorio).getTime() : 0;
      if (Date.now() - ultima >= 60 * 60000) {
        const referencia = dataLocal(-1);
        const jaFeito = await db.relatorioDe('diario', referencia);
        if (!jaFeito?.enviado_em) {
          estado.ultimaTentativaRelatorio = new Date().toISOString();
          const r = await relatorio.gerarEEnviar({ referencia, enviar: true });
          if (r.enviado_em) estado.ultimoRelatorio = r.enviado_em;
          else estado.relatorio.motivo = r.erro || 'envio falhou';
        }
      }
    } catch (e) { registrar(e); }
  }
}

let timer = null;

function iniciar() {
  if (timer) return;
  const INTERVALO = 15 * 60000;   // o ciclo decide o que roda; ele só acorda
  // Primeira rodada com atraso: deixa o servidor terminar de subir.
  setTimeout(() => { ciclo().catch(registrar); }, 20_000);
  timer = setInterval(() => { ciclo().catch(registrar); }, INTERVALO);
  estado.ligado = true;
  console.log('⏱  Piloto automático ligado (ciclo a cada 15 min).');
}

function parar() {
  if (timer) { clearInterval(timer); timer = null; }
  estado.ligado = false;
}

module.exports = { fechamento_, iniciar, parar, ciclo, estado, horaLocal, dataLocal, decidirRelatorio, decidirSemanal, semanal };
