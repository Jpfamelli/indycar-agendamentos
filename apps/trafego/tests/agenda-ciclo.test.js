'use strict';
/* O ciclo do piloto automático de ponta a ponta, com dublês no lugar do
   banco e dos envios: prova que o relatório diário só sai quando a config
   manda, que config quebrada = nada enviado, e que uma falha de envio não
   vira tentativa a cada 15 minutos. */
const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const coletor = require('../coletor');
const radar = require('../radar');
const relatorio = require('../relatorio');
const agenda = require('../agenda');

const originais = {
  lerConfig: db.lerConfig, relatorioDe: db.relatorioDe,
  sincronizar: coletor.sincronizar, rodar: radar.rodar, gerarEEnviar: relatorio.gerarEEnviar,
};
let chamadas;
function armar({ cfg, jaFeito = null, resultadoEnvio = { enviado_em: null, erro: 'CodeWords: chave do CodeWords recusada (401)' } }) {
  chamadas = { gerar: 0, radar: 0, sync: 0 };
  db.lerConfig = async () => { if (cfg instanceof Error) throw cfg; return cfg; };
  db.relatorioDe = async () => jaFeito;
  coletor.sincronizar = async () => { chamadas.sync++; return { plataformas: {}, erros: [] }; };
  radar.rodar = async () => { chamadas.radar++; return { disparados: 0 }; };
  relatorio.gerarEEnviar = async () => { chamadas.gerar++; return resultadoEnvio; };
  agenda.semanal.gerar = async () => { chamadas.semanal = (chamadas.semanal || 0) + 1; return { de: 'x' }; };
  agenda.estado.ultimoRadar = null;
  agenda.estado.ultimaTentativaRelatorio = null;
  agenda.estado.ultimoRelatorio = null;
  agenda.estado.erros = [];
}
test.after(() => {
  db.lerConfig = originais.lerConfig; db.relatorioDe = originais.relatorioDe;
  coletor.sincronizar = originais.sincronizar; radar.rodar = originais.rodar; relatorio.gerarEEnviar = originais.gerarEEnviar;
});

const ligada = { relatorio_ativo: true, relatorio_hora: 0, whatsapp_destinos: ['5512999990000'], alertas_ativos: true, alertas_intervalo_min: 60 };

test('config desligada: sync e radar rodam, relatório NÃO é gerado', async () => {
  armar({ cfg: { ...ligada, relatorio_ativo: false } });
  await agenda.ciclo();
  assert.equal(chamadas.sync, 1);
  assert.equal(chamadas.radar, 1);
  assert.equal(chamadas.gerar, 0);
  assert.ok(agenda.estado.relatorio.motivo.includes('desligado'));
});

test('config que não carrega: só o sync roda; radar e relatório ficam parados e o erro é registrado', async () => {
  armar({ cfg: new Error('timeout do banco') });
  await agenda.ciclo();
  assert.equal(chamadas.sync, 1);
  assert.equal(chamadas.radar, 0);
  assert.equal(chamadas.gerar, 0);
  assert.ok(agenda.estado.erros[0].erro.includes('nenhum envio'));
  assert.ok(agenda.estado.relatorio.motivo.includes('não carregou'));
});

test('ligada, com destino e na hora: gera e envia uma vez; a repetição no mesmo dia é barrada pelo registro', async () => {
  armar({ cfg: ligada, resultadoEnvio: { enviado_em: '2026-10-09T11:00:00.000Z' } });
  await agenda.ciclo();
  assert.equal(chamadas.gerar, 1);
  assert.equal(agenda.estado.ultimoRelatorio, '2026-10-09T11:00:00.000Z');
  assert.equal(agenda.estado.relatorio.motivo, null);

  // Reiniciou o servidor: o banco já tem o relatório de ontem com enviado_em.
  armar({ cfg: ligada, jaFeito: { enviado_em: '2026-10-09T11:00:00.000Z' } });
  await agenda.ciclo();
  assert.equal(chamadas.gerar, 0);
});

test('envio falhou: tenta de novo só depois de uma hora, não a cada ciclo', async () => {
  armar({ cfg: ligada });
  await agenda.ciclo();
  assert.equal(chamadas.gerar, 1);
  assert.ok(agenda.estado.relatorio.motivo.includes('recusada'));
  await agenda.ciclo();
  await agenda.ciclo();
  assert.equal(chamadas.gerar, 1, 'não pode gastar IA a cada 15 min');
  agenda.estado.ultimaTentativaRelatorio = new Date(Date.now() - 61 * 60000).toISOString();
  await agenda.ciclo();
  assert.equal(chamadas.gerar, 2);
});

test('radar respeita o intervalo configurado entre rodadas', async () => {
  armar({ cfg: { ...ligada, relatorio_ativo: false, alertas_intervalo_min: 60 } });
  await agenda.ciclo();
  await agenda.ciclo();
  assert.equal(chamadas.radar, 1);
  agenda.estado.ultimoRadar = new Date(Date.now() - 61 * 60000).toISOString();
  await agenda.ciclo();
  assert.equal(chamadas.radar, 2);
});

test('radar desligado em Ajustes não roda', async () => {
  armar({ cfg: { ...ligada, relatorio_ativo: false, alertas_ativos: false } });
  await agenda.ciclo();
  assert.equal(chamadas.radar, 0);
});
