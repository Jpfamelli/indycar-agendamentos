/* ============================================================================
   Acha o puppeteer-core e o axe-core para o roteiro e o gerador de ícones.
   Ordem: o node_modules do próprio app (devDependencies de apps/trafego) e,
   se ainda não foi instalado, as cópias já baixadas nas ferramentas vizinhas
   (só leitura). PUPPETEER_DIR e AXE_DIR forçam outra pasta.
   O Chrome é o instalado na máquina (CHROME troca o caminho).
   ============================================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(AQUI, '..', '..');
const BACKUPS = path.resolve(APP, '..', '..', '..');

export const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function achar(pacote, forcado, vizinhos) {
  const pastas = [forcado, APP, ...vizinhos.map((v) => path.join(BACKUPS, v))].filter(Boolean);
  for (const pasta of pastas) {
    const req = createRequire(path.join(pasta, 'package.json'));
    try { return req.resolve(pacote); } catch { /* tenta a próxima */ }
  }
  throw new Error('Não achei ' + pacote + '. Rode "npm install" em apps/trafego (está nas devDependencies).');
}

export async function carregarPuppeteer() {
  const arquivo = achar('puppeteer-core', process.env.PUPPETEER_DIR, ['indycar-ferramentas', 'indycar-landing', 'indycar-orcador', 'indycar-patio']);
  const mod = createRequire(arquivo)(arquivo);
  return mod.default || mod;
}

export function caminhoDoAxe() {
  const arquivo = achar('axe-core', process.env.AXE_DIR, ['indycar-landing', 'indycar-orcador', 'indycar-patio', 'indycar-ads']);
  const minificado = path.join(path.dirname(arquivo), 'axe.min.js');
  return fs.existsSync(minificado) ? minificado : arquivo;
}
