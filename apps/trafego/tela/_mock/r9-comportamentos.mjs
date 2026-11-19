/* ============================================================================
   Comportamentos da rodada 9 no navegador (servidor de mentira, nada real).

     PORTA=3532 node tela/_mock/r9-comportamentos.mjs [nome…]   (de apps/trafego)

   Cada caso abre a tela, faz o que a pessoa faria e confere o resultado.
   Sai com código 1 se algum caso falhar. Capturas em qa-out/r9/comportamentos/.
   ============================================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { subir } from './servidor.mjs';
import { carregarPuppeteer, CHROME } from './navegador.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.resolve(AQUI, '..', '..', 'qa-out', 'r9', 'comportamentos');
const PORTA = Number(process.env.PORTA) || 3532;
const filtro = process.argv.slice(2);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function texto(pagina, seletor) { return pagina.$eval(seletor, (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => ''); }
function conferir(cond, msg) { if (!cond) throw new Error(msg); }

export const CASOS = {
  /* Gestor › Diário: anotar uma mudança feita por conta própria. */
  async 'gestor-anotar'(pagina, endereco) {
    await pagina.goto(endereco + '?cenario=cheio#/gestor', { waitUntil: 'networkidle0' });
    await pagina.click('.anotar-abrir');
    await pagina.click('.anotar-form button[type="submit"]');
    conferir((await texto(pagina, '#anTipo-erro')) === 'Escolha o tipo da mudança.', 'sem tipo, o erro aparece no campo');
    conferir(await pagina.$eval('#anTipo', (el) => document.activeElement === el), 'o foco vai para o campo com erro');
    await pagina.select('#anTipo', 'ajustar_horario');
    await pagina.type('#anTitulo', 'Desliguei os anúncios do Google no domingo');
    await pagina.select('#anOnde', 'google');
    await pagina.click('.anotar-form button[type="submit"]');
    await pagina.waitForSelector('.toast');
    conferir(/Anotado no diário/.test(await texto(pagina, '.toast')), 'aviso de anotado');
    const primeiro = await texto(pagina, '.diario-item');
    conferir(/anotou/.test(primeiro) && /Desliguei os anúncios do Google no domingo/.test(primeiro), 'o diário mostra a anotação no topo: ' + primeiro.slice(0, 120));
    conferir(!(await pagina.$eval('.anotar', (el) => el.open)), 'o formulário fecha depois de anotar');
  },

  /* Gestor › Diário: as 5 decisões mais novas aparecem; o resto fica a um toque. */
  async 'gestor-diario-curto'(pagina, endereco) {
    await pagina.goto(endereco + '?cenario=cheio#/gestor', { waitUntil: 'networkidle0' });
    const antes = await pagina.$$eval('.diario-item', (l) => l.length);
    conferir(antes === 5, 'mostra 5 de início (mostrou ' + antes + ')');
    const rotulo = await texto(pagina, '.diario-mais');
    conferir(/Ver as outras \d+ decisões|Ver a decisão mais antiga/.test(rotulo), 'botão diz quantas faltam: ' + rotulo);
    await pagina.click('.diario-mais');
    const depois = await pagina.$$eval('.diario-item', (l) => l.length);
    conferir(depois > 5, 'abre o resto');
    conferir(await pagina.$eval('.diario-item:nth-child(6)', (el) => document.activeElement === el), 'o foco vai para a primeira que estava escondida');
  },
};

const puppeteer = await carregarPuppeteer();
fs.mkdirSync(SAIDA, { recursive: true });
const { endereco, fechar } = await subir({ porta: PORTA });
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--force-prefers-reduced-motion', '--no-first-run'] });
let falhas = 0;
try {
  for (const [nome, caso] of Object.entries(CASOS)) {
    if (filtro.length && !filtro.some((f) => nome.startsWith(f))) continue;
    for (const largura of [1440, 375]) {
      const pagina = await navegador.newPage();
      await pagina.setViewport({ width: largura, height: largura < 768 ? 812 : 900 });
      await fetch(endereco + '_mock/reiniciar').catch(() => {});
      const erros = [];
      pagina.on('pageerror', (e) => erros.push(String(e.message || e)));
      try {
        await caso(pagina, endereco, largura);
        await esperar(200);
        if (erros.length) throw new Error('erro na página: ' + erros[0]);
        console.log('ok       ' + nome + '-' + largura);
      } catch (e) {
        falhas++;
        console.log('FALHOU   ' + nome + '-' + largura + '  ' + e.message);
      } finally {
        await pagina.screenshot({ path: path.join(SAIDA, nome + '-' + largura + '.png'), fullPage: true }).catch(() => {});
        await pagina.close();
      }
    }
  }
} finally {
  await navegador.close();
  await fechar();
}
process.exitCode = falhas ? 1 : 0;
