// Rodada 9 da Agenda (20/11/2026): o que foi medido no navegador (scripts/qa-r9-agenda.mjs) fica preso aqui,
// para não voltar atrás. Testes de leitura do código da tela e de funções puras: não sobem servidor nem tocam o banco.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ler = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const css9 = ler('public/rodada9.css');
const app = ler('public/app.js');
const html = ler('public/index.html');
/** bloco "toque": tudo que vale só em tela estreita ou aparelho de toque */
const toque = [...css9.matchAll(/@media \(max-width:720px\),\(pointer:coarse\)\{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
const regra = (texto, seletor) => { const i = texto.indexOf(seletor + '{'); assert.ok(i >= 0, 'falta a regra ' + seletor); return texto.slice(i, texto.indexOf('}', i) + 1); };

test('R9 lote 6: a folha rodada9.css entra na página e na casca guardada (cache novo)', () => {
  assert.match(html, /rodada7\.css" \/>\s*<link rel="stylesheet" href="\.\/rodada9\.css"/);
  const sw = ler('public/sw.js');
  assert.match(sw, /'rodada9\.css'/);
  assert.ok(Number(sw.match(/indycar-agenda-v(\d+)/)[1]) >= 32);
  assert.match(css9, /\[hidden\]\{display:none!important\}/);
});

test('R9 lote 6: alvo de toque de 44 px nos controles do dia a dia (só em toque ou tela estreita)', () => {
  for (const s of ['.btn,.btn.mini', '.btn-novo', '.pilula', '.tab', '.act', '.search input', 'a.badge-pill', 'button.badge-pill', '.tema-toggle'])
    assert.match(regra(toque, s), /min-height:var\(--alvo\)/, s);
  for (const s of ['.icon-btn', '.copiar', '.avatar-bottom', '.sem-nav .icon-btn'])
    assert.match(regra(toque, s), /width:var\(--alvo\);height:var\(--alvo\)/, s);
  assert.match(regra(toque, '.act.ico'), /min-width:var\(--alvo\)/);
  assert.match(regra(toque, '.tel a'), /min-height:var\(--alvo\)/);
  assert.match(regra(toque, '.faixa-link,.r6-mais'), /min-height:var\(--alvo\)/);
  assert.ok(toque.includes('.field input:not([type=checkbox]):not([type=radio]),.field select,.inp,select,input[type=date],input[inputmode=decimal]{min-height:var(--alvo)}'));
  assert.match(regra(toque, '.qd-semana'), /minmax\(var\(--alvo\),1fr\)\);overflow-x:auto/);
  assert.match(regra(toque, '#qdAnt,#qdProx'), /min-width:var\(--alvo\)/);
  // fora do bloco de toque: os botões do computador não engordam
  assert.ok(!css9.split('@media')[0].includes('.btn,.btn.mini{'));
  assert.match(regra(css9, '.pular-conteudo'), /min-height:var\(--alvo\)/);
  assert.match(ler('public/styles.css'), /--alvo:44px/);
});

test('R9 lote 6: "Filtros" e "Mais" continuam com a setinha (summary não vira flex)', () => {
  assert.doesNotMatch(regra(toque, 'summary'), /display:flex/);
});

test('R9 lote 6: contraste AA no tema claro e nas peças que esmaeciam o texto', () => {
  assert.ok(css9.includes(':root[data-tema="claro"]{--green-txt:#0a6b33}'));
  assert.ok(css9.includes(':root[data-tema="claro"]{--wa-txt:#0a6b33}'));
  assert.ok(css9.includes(':root[data-tema="claro"]{--orange-txt:#7a4303}'));
  assert.match(regra(css9, '.rec-chegou'), /color:#04170b/);
  assert.match(regra(css9, '.sem-item.finalizado,.sem-dia.passado'), /opacity:1/);
  assert.match(regra(css9, '.qd-dia.hoje .qd-dia-n'), /var\(--orange-txt\)/);
  assert.match(regra(css9, '.qd-dia.fechado'), /opacity:1/);
  assert.match(regra(css9, '.qd-card.s-nao_veio,.qd-card.s-cancelado,.qd-card.s-nao_fechou'), /opacity:1/);
  assert.match(regra(css9, '.qd-card.s-concluido'), /opacity:1/);
  assert.match(regra(css9, '.r7r-delta.bom'), /var\(--green-txt\)/);
  assert.match(regra(css9, '.r7r-delta.ruim,.r7r-ruim'), /var\(--red-txt\)/);
  assert.ok(css9.includes(':root:not([data-tema="claro"]) .bp-gray{color:#a3abbe}'));
  // o verde vivo do WhatsApp não fica mais fixo no título (1,73 no claro)
  assert.doesNotMatch(app, /color:#25d366/);
  assert.equal(app.split('class="titulo-wa"').length - 1, 2);
});

/** contraste WCAG entre duas cores #rrggbb */
function contraste(a, b) {
  const lum = (h) => { const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05);
}
test('R9 lote 6: as cores novas passam de 4,5:1 sobre o fundo medido', () => {
  assert.ok(contraste('#0a6b33', '#d4e7e0') >= 4.5);   // verde sobre a tinta verde do claro
  assert.ok(contraste('#7a4303', '#f5eee4') >= 4.5);   // laranja sobre a tinta laranja do claro
  assert.ok(contraste('#04170b', '#22c55e') >= 4.5);   // "Chegou" no escuro
  assert.ok(contraste('#04170b', '#16a34a') >= 4.5);   // "Chegou" no claro
  assert.ok(contraste('#a3abbe', '#292e3a') >= 4.5);   // selo cinza no escuro
});

test('R9 lote 6: o nome falado contém o texto que se vê (selos, Semana, Quadro e conta)', () => {
  const r6 = ler('public/rodada6.js'), sem = ler('public/agenda-planejada.js'), r6c = ler('public/rodada6c.js');
  const iPatio = app.indexOf('selo-patio" href');
  assert.doesNotMatch(app.slice(iPatio, iPatio + 500), /aria-label=/);
  assert.ok(app.includes('<span class="so-leitor">No Pátio: </span>'));
  const iOrc = r6.indexOf('function seloOrc');
  assert.doesNotMatch(r6.slice(iOrc, iOrc + 700), /aria-label=/);
  assert.ok(r6.includes('<span aria-hidden="true">🧾 </span><span class="so-leitor">Orçamento </span>'));
  assert.ok(sem.includes('<span class="so-leitor">Abrir </span><span class="sem-hora">'));
  assert.doesNotMatch(sem, /class="sem-abrir"[^>]*aria-label/);
  assert.ok(r6c.includes(`<span class="so-leitor"> \${x.total === 1 ? 'horário' : 'horários'}</span>`));
  assert.ok(r6c.includes('<span class="so-leitor">oficina fechada</span>'));
  assert.ok(app.includes("el.setAttribute('aria-label', `${el.textContent}, sua conta. Abrir o menu`)"));
  assert.ok(html.includes('aria-label="IC, sua conta. Abrir o menu"'));
});

test('R9 lote 6: Quadro com linhas de verdade para o leitor de tela', () => {
  const r6b = ler('public/rodada6b.js');
  assert.ok(r6b.includes('<div class="qd-linha" role="row"><div class="qd-th qd-canto" role="columnheader">hora</div>${cabeca}</div>'));
  assert.ok(r6b.includes('<div class="qd-linha" role="row"><div class="qd-hh'));
  assert.ok(r6b.includes("linhas += '</div>';"));
  assert.match(regra(css9, '.qd-linha'), /display:contents/);
});

test('R9 lote 6: tabelas que rolam de lado recebem foco e têm nome; webhook com rótulo; fechar com nome', () => {
  assert.equal(app.split('<div class="tabela-rolagem" tabindex="0" role="region" aria-label="Tabela, role de lado para ver tudo">').length - 1, 5);
  assert.ok(!app.includes('<div class="tabela-rolagem">'));
  assert.ok(app.includes('class="panel-body tabela-rola" tabindex="0" role="region" aria-label="Tabela por consultor"'));
  assert.ok(ler('public/agenda-planejada.js').includes('class="sem-tabela" tabindex="0" role="region" aria-label="Tabela: ${esc(titulo)}"'));
  assert.ok(app.includes('<label for="cfg_webhook">URL do Webhook'));
  for (const m of app.matchAll(/<button[^>]*class="modal-close"[^>]*>/g)) assert.match(m[0], /aria-label="Fechar"/, m[0]);
});

test('R9 lote 6: Início no celular, avisos numa fila e rótulos do menu sem quebrar', () => {
  assert.ok(app.includes('<div class="hero-chips">${c.semTelefone30d > 0'));
  assert.ok(app.includes('Horários falados no WhatsApp</button></div>'));
  const cel = css9.slice(css9.indexOf('@media (max-width:640px){'));
  assert.match(regra(cel, '.hero-chips'), /flex-wrap:nowrap;overflow-x:auto/);
  assert.match(regra(cel, '.nav-item span'), /font-size:9px;overflow-wrap:normal;white-space:nowrap/);
  assert.match(regra(css9, '.hero-dia > div:first-child'), /min-width:0/);
});

test('R9 lote 6: sem faixa grossa na lateral dos cartões (Quadro, confirmações e espera)', () => {
  assert.match(regra(css9, '.qd-card'), /border-left:1px solid var\(--border\)/);
  assert.match(regra(css9, '.qd-topo::before'), /background:var\(--st\)/);
  assert.match(regra(css9, '.r7c-cab.pend,.r7c-cab.ok,.r7p-cab,.r7p-cab.urg'), /border-left:0/);
  assert.match(regra(css9, '.espera-item.r7-esp-ruim'), /border:1px solid #d64545/);
  assert.doesNotMatch(css9, /border-left:\s*[3-9]px/);
  assert.ok(css9.includes('#qdData{background:var(--panel-3)'));
});

test('R9 lote 6: textos (endereço sem travessão, etiqueta do Início, horários por extenso, vírgula decimal)', () => {
  assert.ok(html.includes('id="empresaEndereco">Av. Bandeirantes, 875, Taubaté/SP<'));
  assert.ok(html.includes('id="pageTag">INÍCIO<'));
  // a mesma troca que a tela faz com o endereço que vem do cadastro
  const m = app.match(/String\(state\.empresa\.endereco \|\| ''\)\.replace\((\/.+?\/g), ', '\)/);
  assert.ok(m, 'o endereço do cadastro passa pela troca');
  const re = new RegExp(m[1].slice(1, -2), 'g');
  assert.equal('Av. Bandeirantes, 875 — Parque Paduan, Taubaté/SP'.replace(re, ', '), 'Av. Bandeirantes, 875, Parque Paduan, Taubaté/SP');
  assert.equal('Rua A, 10 – Centro'.replace(re, ', '), 'Rua A, 10, Centro');
  assert.ok(ler('public/rodada7r.js').includes("${escH(d.marcados)} ${d.marcados === 1 ? 'horário' : 'horários'}"));
  assert.ok(ler('public/agenda-planejada.js').includes('String(Math.round(oc.cargaMin / 6) / 10).replace(".", ",")} h de serviço'));
});
