// Rodada 13 · o resumo de HOJE nas Réguas (public/hoje.js) e o acabamento da tela.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ler = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ctx = { window: {}, console, Date, Promise, setTimeout };
vm.createContext(ctx);
vm.runInContext(ler('../public/hoje.js'), ctx);
const { montarHoje, estadoEnvio, frase } = ctx.window.R13;

const cfg = { ativo_lembrete: true, ativo_posvenda: true, ativo_retorno: true, ativo_reativacao: false, envia_domingo: false };
const projecao = { dias: [
  { data: '2026-11-24', total: 9, porRegua: { lembrete: 3, retorno: 2, reativacao: 4 } },
  { data: '2026-11-25', total: 1, porRegua: { posvenda: 1 } },
  { data: '2026-11-26', total: 6, porRegua: { lembrete: 5, reativacao: 1 } },
] };
const resumo = { pendentes: 4, semana: { enviadas: 20, respondidas: 5 } };
const ok = { ok: true, conectado: true };

test('conta só as réguas LIGADAS no dia de hoje e no gráfico', () => {
  const h = montarHoje({ resumo, status: ok, projecao, cfg, hoje: '2026-11-24' });
  assert.equal(h.saemHoje, 5);
  assert.equal(JSON.stringify(h.porRegua.map((r) => [r.tipo, r.total])), JSON.stringify([['lembrete', 3], ['retorno', 2]]));
  assert.equal(h.proximos.map((d) => d.total).join(), '5,1,5');
  assert.equal(h.proximos[0].hoje, true);
  assert.equal(h.pico.data, '2026-11-24');
  assert.equal(h.fila, 4);
  assert.equal(h.taxa7, 25);
  assert.equal(h.ligadas, 3);
  assert.equal(h.totalReguas, 8);
});

test('estado do envio: pausa vence, chave recusada e aparelho fora param, instabilidade só avisa', () => {
  assert.equal(estadoEnvio(ok, { pausa_geral: true }), 'pausa');
  assert.equal(estadoEnvio({ ok: false, chaveRecusada: true, classe: 'chave_recusada' }, {}), 'parado');
  assert.equal(estadoEnvio({ ok: false, classe: 'sem_chave' }, {}), 'parado');
  assert.equal(estadoEnvio({ ok: true, conectado: false, classe: 'desconectado' }, {}), 'parado');
  assert.equal(estadoEnvio({ ok: false, classe: 'instabilidade' }, {}), 'atencao');
  assert.equal(estadoEnvio(ok, {}), 'ok');
  assert.equal(estadoEnvio(null, {}), 'desconhecido');
});

test('frase com o WhatsApp parado: diz que nada sai, sem repetir o aviso da Central', () => {
  const h = montarHoje({ resumo, status: { ok: false, chaveRecusada: true }, projecao, cfg, hoje: '2026-11-24' });
  const f = frase(h);
  assert.match(f, /^Hoje nenhuma mensagem automática sai: o WhatsApp da oficina está parado\./);
  assert.match(f, />9<\/span> mensagens esperam ele voltar/); // 5 de hoje + 4 na fila
  assert.doesNotMatch(f, /CodeWords|chave|401|Integra/i);
  assert.match(frase({ ...h, estado: 'pausa' }), /o envio está em pausa/);
});

test('frase com tudo no ar, sem nada para hoje e no domingo', () => {
  const h = montarHoje({ resumo, status: ok, projecao, cfg, hoje: '2026-11-24' });
  assert.match(frase(h), /^Hoje saem <span class="heroi-n">5<\/span> mensagens automáticas/);
  assert.match(frase(h), /5<\/span> clientes responderam nesta semana/);
  const vazio = montarHoje({ resumo: {}, status: ok, projecao: { dias: [{ data: '2026-11-24', porRegua: {} }] }, cfg, hoje: '2026-11-24' });
  assert.equal(frase(vazio), 'Hoje nenhuma régua tem mensagem para sair.');
  const dom = montarHoje({ resumo: {}, status: ok, projecao: { dias: [{ data: '2026-11-22', porRegua: {} }] }, cfg, hoje: '2026-11-22' });
  assert.match(frase(dom), /domingo/);
  const dom2 = montarHoje({ resumo: {}, status: ok, projecao: { dias: [{ data: '2026-11-22', porRegua: {} }] }, cfg: { ...cfg, envia_domingo: true }, hoje: '2026-11-22' });
  assert.doesNotMatch(frase(dom2), /domingo/);
});

test('sem projeção e sem resumo não quebra', () => {
  const h = montarHoje({});
  assert.equal(h.saemHoje, 0);
  assert.equal(h.temProjecao, false);
  assert.equal(h.taxa7, null);
  assert.equal(h.pico, null);
});

test('tela: o herói entra nas Réguas, hoje.js carrega e o teste não sai com o envio parado', () => {
  const html = ler('../public/index.html');
  const app = ler('../public/app.js');
  const css = ler('../public/styles.css');
  const sw = ler('../public/sw.js');
  assert.match(html, /<script src="hoje\.js\?v=7.4.0"><\/script>/);
  assert.match(sw, /'hoje\.js'/);
  assert.match(app, /id="heroiHoje"/);
  assert.match(app, /window\.R13\?\.pintarHoje\(/);
  assert.match(app, /if \(state\.envioParado\) return toast\(/);
  assert.match(app, /topo\.hidden = !n/);
  assert.match(ler('../public/rodada4.js'), /R4\.projecao = projecao/);
  assert.match(css, /\[hidden\]\{display:none!important\}/);
  const r13 = css.slice(css.indexOf('RODADA 13'));
  assert.doesNotMatch(r13, /border-left:\s*[2-9]px/);
  assert.match(r13, /\.ic-topo \.avatar-bottom\{width:44px;height:44px/);
  assert.match(r13, /\.sw\{min-height:44px\}/);
  // mensagens do Pátio/Orçador e dos avisos de outros apps ficam fechadas, como nas réguas
  assert.match(ler('../public/rodada6.js'), /<details class="regua-editar r6-textos">/);
  assert.match(ler('../public/rodada7.js'), /<details class="regua-editar r7-editar">/);
});

test('mensagem pulada porque o cliente saiu da lista não mostra "Reenviar"', () => {
  const app = ler('../public/app.js');
  assert.match(app, /!\(e\.status === 'pulado' && \/não receber\|parar\/i\.test\(e\.motivo_pulado \|\| ''\)\)/);
});
