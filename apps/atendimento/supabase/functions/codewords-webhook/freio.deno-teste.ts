// deno test --allow-read supabase/functions/codewords-webhook/freio.deno-teste.ts   (nome fora do padrão do `node --test`, que é da parte Node)
// (R13C) freio do token errado e registro da recusa sem o corpo de quem chamou.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { criarFreio, ipDe, JANELA_MS, resumoDaRecusa, TENTATIVAS_ERRADAS } from "./freio.ts";

Deno.test("freio: 10 tentativas erradas em 10 min passam (e ficam no registro); a 11ª é recusada", () => {
  const f = criarFreio();
  const t0 = 1_000_000;
  for (let i = 1; i <= TENTATIVAS_ERRADAS; i++) assertEquals(f.contar("webhook-token:1.2.3.4", JANELA_MS, t0 + i), i);
  assert(f.contar("webhook-token:1.2.3.4", JANELA_MS, t0 + 20) > TENTATIVAS_ERRADAS);
  assert(f.espera("webhook-token:1.2.3.4", t0 + 20) > 590);
  // outro endereço não paga pelo primeiro
  assertEquals(f.contar("webhook-token:5.6.7.8", JANELA_MS, t0 + 21), 1);
});

Deno.test("freio: depois da janela o endereço volta a ter as 10 tentativas", () => {
  const f = criarFreio();
  for (let i = 0; i < 15; i++) f.contar("k", JANELA_MS, 0);
  assertEquals(f.contar("k", JANELA_MS, JANELA_MS + 1), 1);
});

Deno.test("freio: memória limitada (não cresce sem fim com endereços novos)", () => {
  const f = criarFreio({ maxChaves: 50 });
  for (let i = 0; i < 500; i++) f.contar(`ip-${i}`, JANELA_MS, 0);
  assert(f.tamanho <= 50, String(f.tamanho));
});

Deno.test("ipDe: primeiro do x-forwarded-for; lixo vira 'desconhecido'", () => {
  assertEquals(ipDe(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })), "203.0.113.9");
  assertEquals(ipDe(new Headers({ "cf-connecting-ip": "2001:db8::1" })), "2001:db8::1");
  assertEquals(ipDe(new Headers({ "x-forwarded-for": "<script>" })), "desconhecido");
  assertEquals(ipDe(new Headers()), "desconhecido");
});

Deno.test("resumoDaRecusa: guarda só tamanho e nome dos campos, nunca o conteúdo", () => {
  const lixo = "x".repeat(64 * 1024);
  const r = resumoDaRecusa({ token: "chute-123", mensagem: lixo, telefone: "12999990000" }, 65_600);
  assertEquals(r, { bytes: 65_600, campos: ["token", "mensagem", "telefone"] });
  const texto = JSON.stringify(r);
  for (const proibido of ["chute-123", "12999990000", "xxxx"]) assert(!texto.includes(proibido), proibido);
  // nomes de campo também são recortados (no máximo 20, 40 letras, sem símbolos)
  const muitos = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`campo<${i}>` + "a".repeat(60), i]));
  const m = resumoDaRecusa(muitos, 10);
  assertEquals(m.campos.length, 20);
  assert(m.campos.every((c) => c.length <= 40 && !/[<>]/.test(c)));
  assertEquals(resumoDaRecusa(null, -5), { bytes: 0, campos: [] });
  assertEquals(resumoDaRecusa(["a"], 3), { bytes: 3, campos: [] });
});

Deno.test("index.ts: a recusa por token usa o freio e não grava recortarPayload(body)", async () => {
  const fonte = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const i = fonte.indexOf("!segredosIguais(enviado, esperado)");
  const bloco = fonte.slice(i, fonte.indexOf("return json(401", i));
  assert(i > 0 && bloco.length > 0);
  assert(bloco.includes("FREIO.contar(") && bloco.includes("TENTATIVAS_ERRADAS"), "tem o freio");
  assert(bloco.includes("status: 429"), "responde 429 sem gravar");
  assert(bloco.indexOf("status: 429") < bloco.indexOf("registrarEvento("), "o 429 vem antes de gravar");
  assert(!bloco.includes("recortarPayload("), "não grava o corpo de quem chamou");
  assert(bloco.includes("resumoDaRecusa("), "grava só o resumo");
});
