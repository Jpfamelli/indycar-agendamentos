// Rodada 10 da Agenda: funções puras e leitura do código da tela. Não sobe servidor nem toca o banco.
// Cada teste aqui falhava no código de antes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { oportunidadesDeHorario } from '../dados.js';
import * as regras from '../regras.js';

const ler = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('R10-AGE-032: "Conversas sem horário" não lista aviso do próprio sistema como se fosse o cliente pedindo horário', () => {
  const msg = (telefone_e164, corpo, nome = 'Cliente') => ({ telefone_e164, corpo, nome });
  const lista = oportunidadesDeHorario([
    msg('12991110001', 'Agendamento: sexta 21/11 às 9h'),
    msg('12991110002', 'Lembrete 24h enviado para o cliente (amanhã 14:30)'),
    msg('12991110003', '3 no-shows hoje, remarcar os horários'),
    msg('12991110004', '[Sistema] Lead criado, agendar retorno'),
    msg('12991110005', 'Oi, queria agendar uma troca de óleo', 'Maria'),
    msg('12991110006', '  agendamento: terça 8h'),
  ]);
  assert.deepEqual(lista, [{ telefone: '12991110005', nome: 'Maria' }]);
  // quem escreveu de verdade DEPOIS de um aviso do sistema continua aparecendo
  assert.equal(oportunidadesDeHorario([msg('12991110001', 'Agendamento: sexta 9h'), msg('12991110001', 'pode marcar às 10h?')]).length, 1);
});

test('R10-AGE-033: a política de conteúdo libera só o projeto do Supabase configurado (sem curinga) e fecha plugin', () => {
  assert.equal(typeof regras.politicaDeConteudo, 'function');
  const csp = regras.politicaDeConteudo('https://abcdefghijklmnop.supabase.co');
  assert.match(csp, /connect-src 'self' https:\/\/abcdefghijklmnop\.supabase\.co wss:\/\/abcdefghijklmnop\.supabase\.co https:\/\/cdn\.jsdelivr\.net/);
  assert.doesNotMatch(csp, /\*\.supabase\.co/);
  assert.match(csp, /object-src 'none'/); assert.match(csp, /frame-ancestors 'none'/);
  // endereço torto ou ausente (instalação nova) não derruba o login: volta ao curinga
  for (const ruim of ['', null, 'http://sem-https.supabase.co', 'não é endereço']) assert.match(regras.politicaDeConteudo(ruim), /https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co/);
  const servidor = ler('server.js');
  assert.match(servidor, /const CSP = politicaDeConteudo\(SUPA_URL\);/);
  assert.doesNotMatch(servidor, /\*\.supabase\.co/);
});

/* ---- página pública /confirmar/ (medida em scripts/qa-r10-confirmar.mjs; aqui fica preso para não voltar atrás) ---- */
const conf = ler('public/confirmar/index.html');
const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const varDe = (bloco, nome) => new RegExp(`--${nome}:(#[0-9a-f]{6})`).exec(bloco)?.[1];

test('R10-AGE-034: página de confirmação com contraste AA nos botões, links e avisos, no claro e no escuro', () => {
  const escuro = /:root\{([^}]*)\}/.exec(conf)[1];
  const claro = /prefers-color-scheme:light\)\{:root\{([^}]*)\}/.exec(conf)[1];
  const sobreVerde = varDe(escuro, 'sobre-verde');
  assert.ok(sobreVerde, 'existe a cor do texto sobre o verde');
  assert.ok(contraste(sobreVerde, varDe(escuro, 'green')) >= 4.5, 'botão "Confirmo"');
  assert.ok(contraste(sobreVerde, '#25d366') >= 4.5, 'link do WhatsApp');
  assert.ok(contraste(varDe(escuro, 'red-txt'), varDe(escuro, 'card')) >= 4.5 && contraste(varDe(escuro, 'red-txt'), varDe(escuro, 'bg')) >= 4.5, 'vermelho de texto no escuro');
  assert.ok(contraste(varDe(claro, 'red-txt'), varDe(claro, 'card')) >= 4.5 && contraste(varDe(claro, 'red-txt'), varDe(claro, 'bg')) >= 4.5, 'vermelho de texto no claro');
  assert.match(conf, /button\.ok\{[^}]*color:var\(--sobre-verde\)\}/);
  assert.match(conf, /button\.nao\{[^}]*color:var\(--red-txt\)\}/);
  assert.match(conf, /\.erro\{color:var\(--red-txt\)/); assert.match(conf, /\.pe em\{color:var\(--red-txt\)/);
  const cal = /a\.wa\.cal\{background:(#[0-9a-f]{6});color:#fff\}/.exec(conf), mapa = /a\.wa\.mapa\{background:(#[0-9a-f]{6});color:#fff\}/.exec(conf);
  assert.ok(cal && contraste('#ffffff', cal[1]) >= 4.5, 'Adicionar ao calendário'); assert.ok(mapa && contraste('#ffffff', mapa[1]) >= 4.5, 'Como chegar');
  assert.doesNotMatch(conf, /style="background:#3b82f6"|color:#ff5d6c/);
});

test('R10-AGE-035: sem rede ao responder, a página de confirmação fala em português e tem teto de 15 s', () => {
  assert.doesNotMatch(conf, /textContent = e\.message/, 'o erro cru do navegador ("Failed to fetch") não vai mais para a tela');
  assert.match(conf, /textContent = recado\(e\)/);
  assert.match(conf, /return 'Sem conexão agora\. Confira a internet e tente de novo\.'/);
  assert.match(conf, /new AbortController\(\), relogio = setTimeout\(function \(\) \{ corta\.abort\(\); \}, 15000\)/);
  assert.match(conf, /A internet está lenta e a resposta não chegou/);
  assert.equal((conf.match(/[^.\w]fetch\(/g) || []).length, 1, 'todo pedido passa pelo mesmo caminho com teto');
  assert.match(conf, /if \(envia\) envia\.disabled = true/, 'o Enviar do recado não aceita toque duplo');
});

test('R10-AGE-036: sem rede ao abrir, a página de confirmação oferece "Tentar de novo" (link que não vale continua sem)', () => {
  assert.match(conf, /<button type="button" id="de_novo">Tentar de novo<\/button>/);
  assert.match(conf, /falha\(recado\(e\), !\(e && e\.doServidor && e\.status < 500 && e\.status !== 429\)\)/);
  assert.match(conf, /b\.addEventListener\('click', function \(\) \{[^}]*abrir\(\); \}\)/);
});

test('R10-AGE-037: página de confirmação sem travessão no horário de funcionamento e sem nome de fonte proibida', () => {
  assert.doesNotMatch(conf.replace(/<!--[\s\S]*?-->/g, ''), /[—–]/);
  assert.match(conf, /segunda a sábado, 8h às 17h30/);
  assert.doesNotMatch(conf, /\b(Inter|Roboto)\b/);
  // o id interno do horário saiu da resposta pública (R10-AGE-029): o calendário não depende mais dele
  assert.doesNotMatch(conf, /ag\.id\b/);
});

test('R10-AGE-038: modo presença no celular (até 560 px): relógio, ferramentas, contadores e abas em uma linha cada, cabeçalho curto', () => {
  const css = ler('public/rodada9.css');
  const i = css.indexOf('RODADA 10: modo presença no celular');
  assert.ok(i > 0, 'o bloco da rodada 10 existe');
  const bloco = css.slice(i);
  assert.match(bloco, /@media \(max-width:560px\)\{/);
  assert.match(bloco, /body\.recepcao :is\(\.rec-ferramentas,\.rec-resumo,\.rec-abas\)\{flex-wrap:nowrap;overflow-x:auto/);
  assert.match(bloco, /body\.recepcao \.rec-relogio b\{font-size:calc\(30px \* var\(--rec,1\)\)\}/, 'o relógio encolhe mas continua seguindo o tamanho da letra');
  assert.match(bloco, /body\.recepcao \.topbar \.company-logo,body\.recepcao \.topbar \.company-sub\{display:none\}/);
  assert.match(bloco, /body\.recepcao \.topbar\{[^}]*flex-direction:row/);
  assert.match(bloco, /body\.recepcao \.rec-btn\{[^}]*min-height:56px/, 'Chegou e Não veio continuam grandes');
  // fora do celular nada muda: todas as regras novas estão dentro do @media
  assert.doesNotMatch(bloco.slice(0, bloco.indexOf('@media')), /\{[^}]*\}/);
  assert.ok(Number(ler('public/sw.js').match(/indycar-agenda-v(\d+)/)[1]) >= 38, 'casca guardada com versão nova');
});
