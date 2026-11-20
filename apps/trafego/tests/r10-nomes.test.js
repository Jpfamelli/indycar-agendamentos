'use strict';
/* Rodada 10 (conexões: o mesmo nome para a mesma coisa): o que a porta da IA responde e o que os guias mandam
   clicar têm de usar os nomes que estão na tela. Se a tela mudar um nome, este teste avisa. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Chaves = require('../ia/chaves');
const F = require('../ia/ferramentas');

const APP = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(APP, ...p), 'utf8');
const telaAjustes = ler('tela', 'js', 'telas', 'ajustes.js');
const gavetas = ['chaves', 'conexoes', 'devolucao', 'origem', 'metas', 'relatorios'].map(g => ler('tela', 'js', 'telas', 'gavetas', g + '.js')).join('\n');
/** As partes dos Ajustes, como a tela chama (titulo: '…'). */
const PARTES = [...telaAjustes.matchAll(/titulo: '([^']+)'/g)].map(m => m[1]);

test('porta da IA: as respostas mandam para a parte dos Ajustes que existe na tela', async () => {
  assert.ok(PARTES.includes('Acesso da IA de fora'), 'a tela chama a parte de "Acesso da IA de fora"');
  const semChave = await Chaves.autenticar({ headers: {}, socket: {} }, new URLSearchParams());
  const naUrl = await Chaves.autenticar({ headers: {}, socket: {} }, new URLSearchParams('chave=ica_x'));
  const torta = await Chaves.autenticar({ headers: { authorization: 'Bearer ica_curta', 'cf-connecting-ip': '192.0.2.50' }, socket: {} }, new URLSearchParams());
  for (const r of [semChave, naUrl, torta]) {
    const citada = /Ajustes › ([^).]+)/.exec(r.mensagem);
    assert.ok(citada, r.mensagem);
    assert.ok(PARTES.includes(citada[1].trim()), `"${citada[1]}" não é uma parte dos Ajustes (${PARTES.join(', ')})`);
  }
  Chaves.tentativas.limpar();
});

test('porta da IA: quando falta permissão, a frase cita a opção com o nome que está no formulário da chave', () => {
  const propor = F.FERRAMENTAS.find(f => f.escopo === 'propor');
  const comPii = F.FERRAMENTAS.find(f => f.pii);
  const semPropor = F.podeUsar(propor, { escopos: ['ler'], ver_pii: false });
  const semPii = F.podeUsar(comPii, { escopos: ['ler', 'propor'], ver_pii: false });
  for (const r of [semPropor, semPii]) {
    assert.equal(r.ok, false);
    const opcao = /"([A-ZÁÉÍÓÚ][^"]{8,})"/.exec(r.mensagem);
    assert.ok(opcao, 'a frase cita a opção da tela: ' + r.mensagem);
    assert.ok(gavetas.includes("'" + opcao[1] + "'"), `"${opcao[1]}" não aparece no formulário da chave`);
    assert.match(r.mensagem, /Ajustes › Acesso da IA de fora/);
  }
});

test('guias (CONECTAR.md e MCP.md): toda parte dos Ajustes e todo botão do app citado existe na tela', () => {
  for (const guia of ['CONECTAR.md', 'MCP.md']) {
    const texto = ler(guia);
    for (const m of texto.matchAll(/Ajustes › ([^\n]{0,60})/g)) {
      const depois = m[1].replace(/\*/g, '');
      assert.ok(PARTES.some(p => depois.startsWith(p)), `${guia}: "Ajustes › ${depois.slice(0, 40)}" não começa por uma parte que existe (${PARTES.join(', ')})`);
    }
    for (const antigo of ['Vendas para o Google', 'Vendas da Meta para marcar', 'Chaves da IA', 'aba Radar', 'aba Painel', 'aba Resultados']) {
      assert.ok(!texto.includes(antigo), `${guia} ainda cita "${antigo}", nome que não está na tela`);
    }
  }
  const conectar = ler('CONECTAR.md');
  for (const botao of ['Colar os acessos', 'Testar', 'Salvar', 'Buscar os números agora', 'Baixar o arquivo do Google', 'Meta: vendas para marcar no WhatsApp Business', 'ID da conta gerenciadora (se']) {
    assert.ok(conectar.includes(botao), 'o guia cita "' + botao + '"');
    assert.ok(gavetas.includes(botao), '"' + botao + '" está na tela');
  }
});
