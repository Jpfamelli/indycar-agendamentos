/* ============================================================================
   Gera img/icone-192.png e img/icone-512.png (rodar só quando o desenho mudar):
     node tela/_mock/gerar-icones.mjs
   O desenho é a assinatura da tela: três mini-setores inclinados no ângulo do
   logo (dois cumpridos em branco, o atual em vermelho) no preto de pista.
   Cabe na zona segura do ícone "maskable" (80% do centro).
   ============================================================================ */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarPuppeteer, CHROME } from './navegador.mjs';

const IMG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'img');

const svg = (lado) => `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0a0a0b"/>
  <g transform="translate(256 256) skewX(-14) translate(-256 -256)">
    <rect x="128" y="150" width="62" height="212" rx="6" fill="#f5f5f5"/>
    <rect x="225" y="150" width="62" height="212" rx="6" fill="#f5f5f5"/>
    <rect x="322" y="150" width="62" height="212" rx="6" fill="#e6192e"/>
  </g>
</svg>`;

const puppeteer = await carregarPuppeteer();
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  for (const lado of [192, 512]) {
    const p = await navegador.newPage();
    await p.setViewport({ width: lado, height: lado });
    await p.setContent('<!doctype html><html><body style="margin:0">' + svg(lado) + '</body></html>');
    await p.screenshot({ path: path.join(IMG, 'icone-' + lado + '.png'), clip: { x: 0, y: 0, width: lado, height: lado } });
    await p.close();
    console.log('img/icone-' + lado + '.png');
  }
} finally {
  await navegador.close();
}
