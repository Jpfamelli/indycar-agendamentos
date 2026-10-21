// QA da Casa (C1c): meta do mês guardada no banco (casa_metas) e não só no aparelho.   node scripts/qa-r6c-meta.mjs
import { cenario, conf, fim, dorme, texto } from './qa-r6c-lib.mjs';

const mes = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
const irParaODono = async (page) => { await page.waitForSelector('#cPatio:not([hidden])', { timeout: 20000 }); await page.evaluate(() => window.Casa.painel.trocarVisao('dono')); await page.waitForSelector('#donoMeta [data-meta], #donoMeta .dono-botoes', { timeout: 15000 }); await dorme(600); };

await cenario('gestor', 1280, async ({ page, estado }) => {
  await irParaODono(page);
  conf(/Defina uma meta/.test(await texto(page, '#donoMeta')), 'Meta: sem meta no banco e sem meta local, pede para definir');
  await page.evaluate(() => { window.prompt = () => '80.000'; });
  await page.click('#donoMeta [data-meta]'); await dorme(800);
  conf(estado.metas[mes()] === 80000, `Meta: salvou 80000 no banco para o mês ${mes()} (${JSON.stringify(estado.metas)})`);
  conf(/Meta de R\$\s?80\.000/.test(await texto(page, '#donoMeta')), 'Meta: a barra mostra a meta nova na hora');
  await page.evaluate(() => { window.prompt = () => 'abc'; });
  const antes = estado.escritas.length;
  await page.click('#donoMeta [data-meta]'); await dorme(500);
  conf(estado.escritas.length === antes && estado.metas[mes()] === 80000, 'Meta: valor sem sentido ("abc") não grava nada e mantém a meta');
  await page.evaluate(() => { window.prompt = () => '99999999999'; });
  await page.click('#donoMeta [data-meta]'); await dorme(500);
  conf(estado.metas[mes()] !== 99999999999, 'Meta: valor absurdo (maior que 100 milhões) não grava');
  await page.evaluate(() => { window.prompt = () => ''; });
  await page.click('#donoMeta [data-meta]'); await dorme(800);
  conf(estado.metas[mes()] === undefined && /Defina uma meta/.test(await texto(page, '#donoMeta')), 'Meta: deixar vazio tira a meta do banco e da tela');
});

await cenario('gestor', 1280, async ({ page, estado }) => {
  await irParaODono(page);
  conf(/Meta de R\$\s?90\.000/.test(await texto(page, '#donoMeta')), 'Meta: aparelho novo (sem nada local) já mostra a meta que o dono definiu em outro aparelho');
  conf(await page.evaluate(() => !localStorage.getItem('indycar_central_meta_mes')), 'Meta: nada precisou estar guardado neste aparelho');
}, { ajustar: (e) => { e.metas[mes()] = 90000; } });

await cenario('gestor', 1280, async ({ page, estado }) => {
  await page.waitForSelector('#cPatio:not([hidden])', { timeout: 20000 });
  await page.evaluate(() => { try { localStorage.setItem('indycar_central_meta_mes', '70000'); } catch {} window.Casa.painel.trocarVisao('dono'); window.Casa.painel.atualizar(); });
  await page.waitForSelector('#donoMeta .dono-botoes', { timeout: 15000 }); await dorme(1800);
  conf(estado.metas[mes()] === 70000, `Meta: a meta que só existia neste aparelho sobe para o banco uma vez (${JSON.stringify(estado.metas)})`);
  conf(/Meta de R\$\s?70\.000/.test(await texto(page, '#donoMeta')), 'Meta: e continua aparecendo na barra');
});

fim();
