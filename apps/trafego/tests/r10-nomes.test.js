'use strict';
/* Rodada 10 (conexões: o mesmo nome para a mesma coisa) e rodada 11 (o Tráfego ficou com três abas): o que a porta
   da IA responde e o que os guias mandam clicar têm de usar os nomes que estão na tela, e nada pode mandar para uma
   parte da tela que saiu (Acesso da IA de fora, Devolver as vendas, De onde vêm os contatos, Relatórios). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Chaves = require('../ia/chaves');
const F = require('../ia/ferramentas');

const APP = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(APP, ...p), 'utf8');
const telaAjustes = ler('tela', 'js', 'telas', 'ajustes.js');
const partesDaTela = telaAjustes + '\n' + ['conexoes', 'metas'].map(g => ler('tela', 'js', 'telas', 'gavetas', g + '.js')).join('\n');
/** As seções dos Ajustes, como a tela chama (os títulos h2). */
const PARTES = [...telaAjustes.matchAll(/id: 't[A-Z][a-z]+' \}, '([^']+)'\)/g)].map(m => m[1]);
const SAIRAM = ['Acesso da IA de fora', 'Devolver as vendas às plataformas', 'De onde vêm os contatos', 'Relatórios', 'Metas e verba', 'Chaves da IA'];

test('Ajustes tem só Conexões e Metas, e as partes que saíram não existem mais na tela', () => {
  assert.deepEqual(PARTES, ['Conexões', 'Metas']);
  for (const g of ['chaves', 'devolucao', 'origem', 'relatorios']) {
    assert.equal(fs.existsSync(path.join(APP, 'tela', 'js', 'telas', 'gavetas', g + '.js')), false, g + '.js saiu da tela');
  }
});

test('porta da IA: as respostas não mandam para uma parte da tela que saiu, e ensinam o caminho que existe', async () => {
  const semChave = await Chaves.autenticar({ headers: {}, socket: {} }, new URLSearchParams());
  const naUrl = await Chaves.autenticar({ headers: {}, socket: {} }, new URLSearchParams('chave=ica_x'));
  const torta = await Chaves.autenticar({ headers: { authorization: 'Bearer ica_curta', 'cf-connecting-ip': '192.0.2.50' }, socket: {} }, new URLSearchParams());
  for (const r of [semChave, naUrl, torta]) {
    assert.doesNotMatch(r.mensagem, /Ajustes ›/, r.mensagem);
    assert.match(r.mensagem, /POST \/api\/ia\/chaves/);
    assert.match(r.mensagem, /MCP\.md/);
  }
  Chaves.tentativas.limpar();
  assert.match(ler('MCP.md'), /POST \/trafego\/api\/ia\/chaves/, 'MCP.md ensina a criar a chave');
});

test('porta da IA: quando falta permissão, a frase cita o campo do pedido da chave', () => {
  const propor = F.FERRAMENTAS.find(f => f.escopo === 'propor');
  const comPii = F.FERRAMENTAS.find(f => f.pii);
  const semPropor = F.podeUsar(propor, { escopos: ['ler'], ver_pii: false });
  const semPii = F.podeUsar(comPii, { escopos: ['ler', 'propor'], ver_pii: false });
  assert.match(semPropor.mensagem, /escopos \["ler", "propor"\]/);
  assert.match(semPii.mensagem, /ver_pii: true/);
  for (const r of [semPropor, semPii]) {
    assert.equal(r.ok, false);
    assert.doesNotMatch(r.mensagem, /Ajustes ›/);
    assert.match(r.mensagem, /MCP\.md, parte 1/);
  }
});

test('guias (CONECTAR.md e MCP.md): toda parte dos Ajustes e todo botão citado existe na tela; nada cita o que saiu', () => {
  for (const guia of ['CONECTAR.md', 'MCP.md']) {
    const texto = ler(guia);
    for (const m of texto.matchAll(/Ajustes › ([^\n]{0,60})/g)) {
      const depois = m[1].replace(/\*/g, '');
      assert.ok(PARTES.some(p => depois.startsWith(p)), `${guia}: "Ajustes › ${depois.slice(0, 40)}" não começa por uma parte que existe (${PARTES.join(', ')})`);
    }
    for (const antigo of [...SAIRAM, 'Vendas para o Google', 'Vendas da Meta para marcar', 'aba Radar', 'aba Painel', 'aba Resultados', 'Baixar o arquivo do Google']) {
      assert.ok(!texto.includes(antigo), `${guia} ainda cita "${antigo}", nome que não está na tela`);
    }
  }
  const conectar = ler('CONECTAR.md');
  for (const botao of ['Colar os acessos', 'Testar', 'Salvar', 'Buscar os números agora', 'ID da conta gerenciadora (se']) {
    assert.ok(conectar.includes(botao), 'o guia cita "' + botao + '"');
    assert.ok(partesDaTela.includes(botao), '"' + botao + '" está na tela');
  }
});
