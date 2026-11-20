/* ============================================================
   DESTINO DO CODEWORDS (rodada 10)
   O endereço do CodeWords (base_url, url_envio) e os nomes do serviço e do fluxo vêm da
   tabela codewords_config, que a tela de Integrações grava. É para lá que o servidor manda
   a chave e as mensagens dos clientes. Por isso só vale endereço https e público: nada de
   http, localhost, rede interna ou endereço de metadados da nuvem. E os nomes que entram no
   caminho só têm letra, número, ponto, traço e sublinhado (sem "../").
   CODEWORDS_LOCAL=1 libera http e localhost para o servidor de mentira na máquina de quem desenvolve.
   Regras puras, testadas em test/r10-destino.test.js.
   ============================================================ */
'use strict';

const PADRAO = 'https://runtime.codewords.ai';
const RE_TRECHO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

/** O host é de rede interna, da própria máquina ou de metadados? */
function hostInterno(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan')) return true;
  if (!h.includes('.') && !h.includes(':')) return true;                 // nome solto ("intranet")
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (h.includes(':')) return h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:');   // IPv6 local
  return false;
}

/** Endereço https e público → { ok, url } (sem barra no fim); senão { ok:false, erro }. */
function enderecoSeguro(valor, { local = process.env.CODEWORDS_LOCAL === '1' } = {}) {
  let u;
  try { u = new URL(String(valor || '').trim()); } catch { return { ok: false, erro: 'O endereço do CodeWords em Integrações não é um endereço válido.' }; }
  if (u.username || u.password) return { ok: false, erro: 'O endereço do CodeWords em Integrações não pode ter usuário e senha.' };
  if (!local) {
    if (u.protocol !== 'https:') return { ok: false, erro: 'O endereço do CodeWords em Integrações precisa começar com https.' };
    if (hostInterno(u.hostname)) return { ok: false, erro: 'O endereço do CodeWords em Integrações precisa ser público (não pode ser da rede interna).' };
  } else if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, erro: 'O endereço do CodeWords em Integrações não é um endereço válido.' };
  }
  return { ok: true, url: (u.origin + u.pathname).replace(/\/+$/, '') + u.search };
}

/** Nome que entra no caminho (serviço de conexão, fluxo): vazio usa o padrão; torto é recusado. */
function trechoSeguro(valor, padrao = null) {
  const v = String(valor ?? '').trim();
  if (!v) return { ok: true, valor: padrao };
  return RE_TRECHO.test(v) ? { ok: true, valor: v } : { ok: false };
}

/**
 * A configuração inteira → { ok, base, servico, fluxo, urlEnvio } ou { ok:false, erro }.
 * `base` sem barra no fim; `urlEnvio` só quando preenchida (também https e pública).
 */
function destinoDoCodeWords(cfg, opc) {
  const b = enderecoSeguro(cfg?.base_url || PADRAO, opc);
  if (!b.ok) return b;
  const servico = trechoSeguro(cfg?.servico_conexao, 'whatsapp_device_manager');
  if (!servico.ok) return { ok: false, erro: 'O nome do serviço de conexão do CodeWords em Integrações tem caractere que não vale.' };
  const fluxo = trechoSeguro(cfg?.service_id, null);
  if (!fluxo.ok) return { ok: false, erro: 'O Service ID do fluxo em Integrações tem caractere que não vale.' };
  let urlEnvio = null;
  if (cfg?.url_envio) {
    const e = enderecoSeguro(cfg.url_envio, opc);
    if (!e.ok) return { ok: false, erro: e.erro.replace('O endereço do CodeWords', 'A URL de envio') };
    urlEnvio = e.url;
  }
  return { ok: true, base: b.url, servico: servico.valor, fluxo: fluxo.valor, urlEnvio };
}

module.exports = { destinoDoCodeWords, enderecoSeguro, trechoSeguro, hostInterno, PADRAO };
