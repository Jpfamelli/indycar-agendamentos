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
