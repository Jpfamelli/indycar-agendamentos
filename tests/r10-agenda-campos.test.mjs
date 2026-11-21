// Rodada 10 da Agenda: prende em teste o que as linhas R9-AGE-014 a 036 mudaram nos campos (teclado certo no
// celular, rótulo ligado ao campo, nome falado), que tinham ficado sem teste. Lê o código da tela; não sobe nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ler = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const html = ler('public/index.html');
const app = ler('public/app.js');
/** A marcação do campo com este id (ou name), do "<input" até o ">" que fecha. */
function campo(fonte, id, por = 'id') {
  const m = new RegExp(`<input[^>]*\\b${por}="${id}"[^>]*>`).exec(fonte);
  assert.ok(m, 'não achei o campo ' + id);
  return m[0];
}
const temRotulo = (fonte, id) => new RegExp(`<label[^>]*\\bfor="${id}"`).test(fonte);

test('R9-AGE-014 a 016: login, recuperação e código de duas etapas dizem ao teclado do celular o que a tecla faz', () => {
  assert.match(campo(html, 'mfa_codigo'), /inputmode="numeric"[^>]*autocomplete="one-time-code"[^>]*enterkeyhint="done"/);
  assert.match(campo(html, 'loginSenha', 'name'), /autocomplete="current-password"[^>]*enterkeyhint="go"/);
  assert.match(campo(html, 'es_email'), /type="email"[^>]*enterkeyhint="send"/);
});

test('R9-AGE-017 a 019 e 026 a 029: as buscas são campo de pesquisa, com a tecla Buscar e nome falado', () => {
  for (const [id, nome] of [['qAgenda', 'Buscar agendamento'], ['qCli', 'Buscar cliente'], ['bgQ', 'Buscar agendamentos e clientes']]) {
    const c = campo(app, id);
    assert.match(c, /type="search"/, id); assert.match(c, /enterkeyhint="search"/, id); assert.ok(c.includes(`aria-label="${nome}"`), id);
  }
  assert.match(campo(app, 'qAgenda'), /placeholder="Cliente, placa ou telefone"/);
  // rodada 11: a tela de Serviços (só leitura, o catálogo é do CRM) saiu, e o "Atalho: Ctrl+K" explicado também
  assert.ok(!/id="qServ"/.test(app), 'a busca da tela de Serviços saiu');
  assert.match(app, /Digite pelo menos 2 caracteres\.<\/p>/);
  assert.ok(!app.includes('Atalho: Ctrl+K'));
});

test('R9-AGE-020 a 023 e 031 a 036: campos de configuração com rótulo ligado e o teclado certo', () => {
  assert.ok(temRotulo(app, 'of_nome'), 'rótulo de of_nome');
  assert.match(campo(app, 'of_tel'), /type="tel"[^>]*autocomplete="tel"/);
  // rodada 11: Conectores (webhook, iCal) e a tela de WhatsApp (Cloud API, CodeWords) saíram da Agenda;
  // a conexão do WhatsApp mora no Atendimento › Integrações
  for (const id of ['cn_whk', 'cn_ics', 'cfg_pnid', 'cfg_num', 'cfg_waba', 'cfg_ver', 'cfg_verify', 'cw_base']) assert.ok(!new RegExp(`id="${id}"`).test(app), id + ' saiu');
});

test('R9-AGE-024, 025 e 030: placa em maiúsculas sem corretor e nome da equipe com preenchimento de nome', () => {
  for (const id of ['f_placa', 'c_placa']) {
    const c = campo(app, id);
    assert.match(c, /autocapitalize="characters"/, id); assert.match(c, /spellcheck="false"/, id); assert.match(c, /text-transform:uppercase/, id);
    assert.ok(temRotulo(app, id), 'rótulo de ' + id);
  }
  // rodada 11: "Equipe e acessos" saiu das Configurações da Agenda (mora no Atendimento › Equipe)
  assert.ok(!/id="eq_nome"/.test(app), 'eq_nome saiu');
});
