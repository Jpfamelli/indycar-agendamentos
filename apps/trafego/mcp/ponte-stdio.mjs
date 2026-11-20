#!/usr/bin/env node
/* ============================================================
   Ponte local stdio ↔ POST /mcp do IndyCar Tráfego (rodada 8, frente T5a).
   Para o Claude Desktop e qualquer cliente MCP que só fale stdio: cada linha JSON-RPC que chega no stdin
   vira um POST no servidor (com o cabeçalho Authorization), e a resposta volta como uma linha no stdout.

   Variáveis:
     INDYCAR_TRAFEGO_CHAVE  a chave ica_… (obrigatória; nunca é impressa)
     INDYCAR_TRAFEGO_URL    o endereço do MCP (padrão https://indycar-agendamentos.onrender.com/trafego/mcp).
                            Só https, ou http em localhost/127.0.0.1 (a chave não viaja aberta pela internet).
   Sem dependência: só node:http/https (sem conexão presa: a ponte termina assim que o stdin fecha).
   ============================================================ */
import { createInterface } from 'node:readline';
import http from 'node:http';
import https from 'node:https';

const URL_MCP = process.env.INDYCAR_TRAFEGO_URL || 'https://indycar-agendamentos.onrender.com/trafego/mcp';
const CHAVE = process.env.INDYCAR_TRAFEGO_CHAVE || '';
const ESPERA_MS = 120_000;

function sair(frase) { process.stderr.write(`[indycar-trafego] ${frase}\n`); process.exit(1); }
if (!/^ica_[A-Za-z0-9]{40}$/.test(CHAVE)) sair('Falta a variável INDYCAR_TRAFEGO_CHAVE com a chave ica_… (crie em Ajustes › Acesso da IA de fora).');
let destino;
try { destino = new URL(URL_MCP); } catch { sair('INDYCAR_TRAFEGO_URL não é um endereço válido.'); }
const local = destino.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(destino.hostname);
if (destino.protocol !== 'https:' && !local) sair('INDYCAR_TRAFEGO_URL precisa começar com https:// (ou ser http://localhost para teste).');

let versao = null;                         // a versão combinada no initialize vai em todo pedido seguinte
const pendentes = new Set();
const escrever = obj => process.stdout.write(`${JSON.stringify(obj)}\n`);
const falha = (id, mensagem) => { if (id !== undefined) escrever({ jsonrpc: '2.0', id, error: { code: -32603, message: mensagem } }); };

/** POST sem manter conexão aberta. Devolve { status, texto }. */
function postar(corpo, cabecalhos) {
  return new Promise((resolve, reject) => {
    const lib = destino.protocol === 'https:' ? https : http;
    const req = lib.request(destino, { method: 'POST', agent: false, headers: { ...cabecalhos, Connection: 'close', 'Content-Length': Buffer.byteLength(corpo) } }, res => {
      const partes = [];
      res.on('data', c => partes.push(c));
      res.on('end', () => resolve({ status: res.statusCode, texto: Buffer.concat(partes).toString('utf8') }));
      res.on('error', reject);
    });
    req.setTimeout(ESPERA_MS, () => req.destroy(Object.assign(new Error('tempo'), { code: 'TEMPO' })));
    req.on('error', reject);
    req.end(corpo);
  });
}

async function repassar(linha) {
  let msg;
  try { msg = JSON.parse(linha); } catch { escrever({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido.' } }); return; }
  const id = msg && typeof msg === 'object' ? msg.id : undefined;
  const cabecalhos = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${CHAVE}` };
  if (versao && msg.method !== 'initialize') cabecalhos['MCP-Protocol-Version'] = versao;
  let r;
  try { r = await postar(linha, cabecalhos); }
  catch (e) { falha(id, `Sem conexão com o IndyCar Tráfego (${e && e.code === 'TEMPO' ? 'demorou demais' : 'rede'}).`); return; }
  if (r.status === 202) return;
  let corpo = null;
  try { corpo = JSON.parse(r.texto); } catch { corpo = null; }
  if (corpo && msg.method === 'initialize' && corpo.result && corpo.result.protocolVersion) versao = corpo.result.protocolVersion;
  if (corpo && corpo.jsonrpc === '2.0' && (corpo.result !== undefined || corpo.error !== undefined)) { if (id !== undefined) escrever({ ...corpo, id: corpo.id ?? id }); return; }
  falha(id, `O servidor respondeu ${r.status}${corpo && corpo.erro ? `: ${corpo.erro}` : ''}.`);
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', linha => {
  if (!linha.trim()) return;
  const p = repassar(linha).catch(() => {});
  pendentes.add(p);
  p.finally(() => pendentes.delete(p));
});
rl.on('close', async () => { while (pendentes.size) await Promise.all([...pendentes]); process.exitCode = 0; });
