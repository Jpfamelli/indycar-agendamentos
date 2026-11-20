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

/* ============================ lote 7 ============================ */
/** Devolve só o CÓDIGO de cada linha (sem comentário de bloco nem de linha), para procurar texto de tela. */
function semComentarios(arquivo) {
  const ehHtml = arquivo.endsWith('.html');
  const [abre, fecha] = ehHtml ? ['<!--', '-->'] : ['/*', '*/'];
  let bloco = false; const saida = [];
  for (let l of ler(arquivo).split('\n')) {
    let codigo = '';
    for (;;) {
      if (bloco) { const j = l.indexOf(fecha); if (j < 0) { l = ''; break; } bloco = false; l = l.slice(j + fecha.length); continue; }
      const i = l.indexOf(abre); if (i < 0) { codigo += l; break; }
      codigo += l.slice(0, i); l = l.slice(i + abre.length); bloco = true;
    }
    if (!ehHtml) { if (/^\s*\/\//.test(codigo)) codigo = ''; const m = /(^|[^:'"`\\])\/\/ /.exec(codigo); if (m) codigo = codigo.slice(0, m.index + m[1].length); }
    saida.push(codigo);
  }
  return saida;
}
const TELAS = ['public/index.html', 'public/app.js', 'public/apps.js', 'public/conta.js', 'public/planejamento.js', 'public/agenda-planejada.js',
  'public/rodada6.js', 'public/rodada6b.js', 'public/rodada6c.js', 'public/rodada6d.js', 'public/rodada7.js', 'public/rodada7r.js'];

test('R9 lote 7: nenhum texto de tela com travessão no meio da frase (o traço sozinho de "sem dado" continua)', () => {
  for (const f of TELAS) {
    const ruins = semComentarios(f).map((c, i) => [i + 1, c]).filter(([, c]) => / — /.test(c));
    assert.deepEqual(ruins.map(([n, c]) => `${f}:${n} ${c.trim().slice(0, 80)}`), [], f);
  }
});

test('R9 lote 7: recados do servidor sem travessão (erros, motivos, tarefas e avisos automáticos, Google Agenda)', () => {
  for (const f of ['server.js', 'dados.js', 'lembretes.js', 'automacoes.js', 'regras.js', 'faltas.js', 'preagenda.js', 'relatorios.js', 'horarios.js']) {
    const ruins = semComentarios(f).map((c, i) => [i + 1, c]).filter(([, c]) => /['"`][^'"`]* — /.test(c) && !/console\.(warn|error|log)/.test(c));
    assert.deepEqual(ruins.map(([n, c]) => `${f}:${n} ${c.trim().slice(0, 80)}`), [], f);
  }
});

test('R9 lote 7: frases que ficaram em duas (não só trocaram o traço por vírgula)', () => {
  assert.ok(app.includes("'Sem internet. Assim que a conexão voltar eu continuo de onde parou…'"));
  assert.ok(app.includes('Entre de novo. O que você estava digitando ficou guardado.'));
  assert.ok(app.includes('Follow-up: retornos pendentes</h2>'));
  assert.ok(app.includes('${esc(j.inicio)} às ${esc(j.fim)}'));
  assert.ok(app.includes('<option value="">sem login ligado</option>') && app.includes('<option value="">Mensagem livre</option>'));
  assert.ok(html.includes('Sem internet. O que você marcar agora fica guardado no aparelho'));
});

test('R9 lote 7: sem o brilho de enfeite nos botões; a Ajuda cita o botão pelo nome que ele tem', () => {
  const codigo = semComentarios('public/app.js').join('\n');
  assert.ok(!codigo.includes('✨'), 'sobrou ✨ em texto de tela');
  assert.ok(app.includes('>Horários livres</button>'));
  assert.ok(app.includes('id="vf_usar" >Usar ${esc(P.reais(s.valor))}</button>'));
  assert.ok(app.includes('aria-label="Sugerir valor para ${esc(a.cliente_nome)}">${svg(I.money)}</button>'));
  assert.ok(app.includes('Use "Horários livres" para ver as vagas do dia e "Achar pelo nome" para o telefone.'));
  assert.ok(!app.includes('Sugerir horário'));
});

test('R9 lote 7: fontes do próprio app (Archivo e Barlow Condensed), sem Inter e sem domínio de fora', () => {
  assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(html));
  for (const f of ['public/styles.css', 'public/conta.css', 'public/rodada4.css', 'public/planejamento.css', 'public/rodada5.css', 'public/rodada7.css']) assert.ok(!/['"]Inter['"]/.test(ler(f)), f);
  assert.match(ler('public/styles.css'), /font-family:'Archivo',system-ui,sans-serif/);
  for (const arq of ['archivo-variavel.woff2', 'barlow-condensed-600.woff2', 'barlow-condensed-700.woff2']) {
    assert.ok(fs.statSync(new URL('../public/fontes/' + arq, import.meta.url)).size > 10_000, arq);
    assert.ok(css9.includes(`url('./fontes/${arq}') format('woff2')`), arq);
    assert.ok(ler('public/sw.js').includes(`'fontes/${arq}'`), arq + ' na casca guardada');
  }
  assert.ok(html.includes('<link rel="preload" href="./fontes/archivo-variavel.woff2" as="font" type="font/woff2" crossorigin />'));
  const srv = ler('server.js') + ler('regras.js');   // rodada 10: a política de conteúdo mora em regras.js (politicaDeConteudo)
  assert.ok(srv.includes(`"font-src 'self'",`) && srv.includes(`"style-src 'self' 'unsafe-inline'",`));
  assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(srv));
});

test('R9 lote 7: botões principais chapados; verde e campo do "Marcar rápido" com o desenho do app', () => {
  assert.match(regra(css9, '.btn.primary,.btn-novo,.pilula.ativa'), /background:var\(--red\)\}/);
  assert.ok(contraste('#ffffff', '#e6192e') >= 4.5);
  assert.match(regra(css9, '.btn.green'), /background:#15803d/);
  assert.ok(contraste('#ffffff', '#15803d') >= 4.5);
  assert.match(regra(css9, '.r6c-rapido input'), /background:var\(--panel-3\);border:1px solid var\(--border-2\)/);
});

/* ============================ lote 8 ============================ */
test('R9 lote 8: lembrete sem data de verdade não sai com "undefined"; nome vazio não deixa "Oi !"', async () => {
  const { quandoRelativo, textoDoLembrete } = await import('../lembretes.js');
  assert.equal(quandoRelativo('x', '10:00', '2026-11-20'), 'no dia marcado às 10:00');
  assert.equal(quandoRelativo(undefined, '', '2026-11-20'), 'no dia marcado');
  assert.equal(quandoRelativo('2026-13-45', '09:00', '2026-11-20'), 'no dia marcado às 09:00');
  assert.equal(quandoRelativo('2026-11-21', '10:00', '2026-11-20'), 'amanhã às 10:00');
  assert.equal(quandoRelativo('2026-11-25', '08:30:00', '2026-11-20'), 'quarta (25/11) às 08:30');
  const semNome = textoDoLembrete(null, { cliente_nome: '', servico: 'Troca de óleo', data: '2026-11-21', hora: '10:00' }, '2026-11-20');
  assert.match(semNome, /^Oi! Lembrete da IndyCar: seu horário para Troca de óleo é amanhã às 10:00\./);
  const semData = textoDoLembrete('Oi {primeiro_nome} , seu horário é {quando} .', { cliente_nome: 'Maria Aparecida', hora: '10:00' }, '2026-11-20');
  assert.equal(semData, 'Oi Maria, seu horário é no dia marcado às 10:00.');
  assert.doesNotMatch(semNome + semData, /undefined|NaN/);
});

test('R9 lote 8: proposta de pré-agendamento sem data de verdade não sai com "undefined /"', async () => {
  const { rotuloDoDia, textoDePropor } = await import('../preagenda.js');
  assert.equal(rotuloDoDia('bla', '2026-11-20'), 'no dia combinado');
  assert.equal(rotuloDoDia(undefined, '2026-11-20'), 'no dia combinado');
  assert.equal(rotuloDoDia('2026-11-22', '2026-11-20'), 'dom 22/11');
  assert.equal(rotuloDoDia('2026-11-21', '2026-11-20'), 'amanhã');
  assert.doesNotMatch(textoDePropor({ nome: 'Ana', servico: 'Óleo', data: 'bla', hoje: '2026-11-20', periodo: 'manha', sugestao: { hora: '08:30' } }), /undefined|NaN/);
});

test('R9 lote 8: data por extenso em português certo ("20 de novembro de 2026")', () => {
  const i = app.indexOf('function dataExtenso(iso) {');
  const fonte = app.slice(i, app.indexOf('\n}', i) + 2);
  const dataExtenso = new Function('cap', fonte + '; return dataExtenso;')((s) => s.charAt(0).toUpperCase() + s.slice(1));
  assert.equal(dataExtenso('2026-11-20'), 'Sexta-feira, 20 de novembro de 2026');
  assert.equal(dataExtenso('2026-03-01'), 'Domingo, 1 de março de 2026');
});

test('R9 lote 8: "carro", nunca "veículo", na tela de Serviços, nas planilhas e no Google Agenda', () => {
  assert.ok(app.includes('meta.push(`Carro: ${esc(s.tipo_veiculo)}`)'));
  const srv = ler('server.js');
  assert.ok(srv.includes("gerarCSV(['id','cliente','telefone','carro','placa','servico',"));
  assert.ok(srv.includes("gerarCSV(['id','nome','telefone','carro','placa','modelo','origem','criado_em'], rows)"));
  assert.ok(srv.includes('a.veiculo ? `Carro: ${a.veiculo}'));
  for (const f of TELAS) assert.deepEqual(semComentarios(f).filter((c) => /[Vv]eículo/.test(c)), [], f);
});

test('R9 lote 8: a caixa do "Buscar em tudo" não estica na altura', () => {
  assert.match(regra(css9, '.modal-body > .search.larga'), /flex:0 0 auto/);
});

test('R9 lote 8: menu com "Mais" aberto rola em vez de encolher os itens; Remarcar diz o horário atual sem repetir "hoje"', () => {
  assert.match(regra(css9, '.nav > *,.nav-mais-itens > *'), /flex-shrink:0/);
  assert.match(ler('public/styles.css'), /\.nav\{[^}]*overflow-y:auto/);
  assert.ok(app.includes('<small class="muted">Horário atual: ${esc(rotuloDia(a.data, agoraSP().data))} às'));
  assert.ok(!app.includes('Hoje marcado para'));
});

test('R9 lote 8: login sem pulo de layout, erro do primeiro acesso anunciado e app instalado com a cor e a descrição da página', () => {
  assert.equal(html.split('class="login-logo" width="170" height="170"').length - 1, 6);
  assert.ok(!/class="login-logo" \/>/.test(html));
  for (const id of ['erroLogin', 'erroPrimeiro', 'erroEsqueci', 'erroNovaSenha', 'erroMfa']) assert.ok(new RegExp(`id="${id}" role="alert"`).test(html), id);
  const man = JSON.parse(ler('public/manifest.json'));
  assert.equal(man.theme_color, '#070a14');
  assert.equal(man.theme_color, /<meta name="theme-color" content="(#[0-9a-f]{6})"/.exec(html)[1]);
  assert.equal(man.description, /<meta name="description" content="([^"]+)"/.exec(html)[1].replace('Agenda da IndyCar Centro Automotivo', 'Agenda da IndyCar Centro Automotivo'));
  assert.doesNotMatch(man.description, /CRM|IA/);
});

test('R9 lote 8: janelas, recados, login e popovers com 44 px no toque', () => {
  assert.match(regra(toque, '.modal-close'), /min-width:var\(--alvo\);min-height:var\(--alvo\)/);
  assert.match(regra(toque, '.chip-sugestao'), /min-height:var\(--alvo\)/);
  assert.match(regra(toque, '.modal .btn.mini,#f_achar'), /min-width:var\(--alvo\)/);
  assert.match(regra(toque, '.toast .toast-acao'), /min-height:var\(--alvo\)/);
  assert.match(regra(toque, '.switch'), /min-height:var\(--alvo\)/);
  assert.match(regra(toque, '.login-link'), /min-height:var\(--alvo\)/);
  assert.match(regra(toque, '.ver-senha'), /min-height:var\(--alvo\)/);
  // a caixinha da tarefa: área de 44 px, quadradinho de 22 px desenhado por dentro
  assert.match(regra(toque, '.tarefa-check'), /width:var\(--alvo\);height:var\(--alvo\)/);
  assert.match(regra(toque, '.tarefa-check::before'), /width:22px;height:22px/);
});

test('R9 lote 8: texto secundário do tema escuro passa de 4,5:1 sobre painel e popover; o claro segue o dele', () => {
  assert.ok(css9.includes(':root{--muted-2:#8189a0}'));
  for (const fundo of ['#0f1626', '#0d1220', '#111829', '#070a14']) assert.ok(contraste('#8189a0', fundo) >= 4.5, fundo);
  assert.ok(contraste('#646c80', '#0f1626') < 4.5, 'o valor antigo reprovava');
  assert.match(ler('public/styles.css'), /:root\[data-tema="claro"\]\{--foco:#2357a9;--muted-2:#626874\}/);
});

test('R9 lote 8: sugestões do Remarcar com nome falado que contém o que se vê; primeiro acesso sem travessão', () => {
  assert.ok(app.includes('<span class="so-leitor">Remarcar para </span>${esc(rotuloSugestao(s))}<span class="so-leitor"> às ${esc(s.hora)}</span>'));
  assert.ok(!app.includes('aria-label="Usar ${esc(dataBR(s.data))}'));
  assert.ok(html.includes('Crie a sua conta de administrador.'));
  assert.doesNotMatch(semComentarios('public/index.html').join('\n'), /—/);
});

test('R9 lote 8: sobras da última medida (Quadro em 375 px sem rolagem lateral, horário da Semana, "Ver", histórico da ficha)', () => {
  assert.match(regra(toque, '.qd-bar .left,.qd-nav'), /flex-wrap:wrap;min-width:0;max-width:100%/);
  assert.match(regra(toque, '.sem-abrir'), /min-height:var\(--alvo\)/);
  assert.ok(toque.includes('  .btn.mini{min-width:var(--alvo);justify-content:center}'));
  assert.match(css9, /\.ctx-item\{min-height:var\(--alvo\)\}/);
});
