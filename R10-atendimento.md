# Rodada 10 · Atendimento

Fechada em 20/11/2026. **35 melhorias registradas** (R10-ATD-001 a 035) de uma meta de 150. Parei no número real: cada linha tem teste que falhava antes e passa depois, e não dividi mudança em várias linhas para engordar a conta. As linhas 001 a 006 são do Codex; 007 a 035 são do Claude.

Nada foi publicado, nada foi enviado ao repositório remoto, nenhum SQL foi aplicado, nenhum dado foi apagado e nenhuma credencial foi tocada. Nenhuma mensagem de WhatsApp saiu e o CodeWords de verdade não foi chamado: todos os testes e roteiros usam servidor de mentira com a rede de fora bloqueada.

## Contagem

| Categoria | Linhas |
| --- | --- |
| segurança | 16 |
| conserto | 10 |
| desempenho | 3 |
| tela | 3 |
| teste | 3 |
| **Total** | **35** |

## Testes

| | Antes | Depois |
| --- | --- | --- |
| `npm test` de apps/atendimento | 441 (início do Codex), 447 (quando o Claude assumiu) | **479 passando, 0 falhando** |
| roteiro-r10.cjs (novo, 375 e 1440 px) | não existia | 41 de 41 |
| roteiro-casca.cjs | 2 de 13 sem o .env de verdade | 13 de 13 |
| roteiro-r5c-dono-confirmacao.cjs | 26 de 26 | 26 de 26 |
| roteiro-r6c5.cjs | 124 de 124 | 124 de 124 |
| roteiro-r7c4.cjs | 32 de 32 | 32 de 32 |
| roteiro-rodada4.cjs | 145 de 145 | 145 de 145 |
| roteiro-rodada5.cjs | 74 de 74 | 74 de 74 |
| roteiro-rodada6.cjs | 62 de 62 | 62 de 62 |
| roteiro-tela.cjs | não rodei antes | 220 de 220 |

Os roteiros antigos não tinham sido rodados depois da rodada 9. Rodei todos antes de mexer nas perguntas e de novo depois. O único que caía era o da casca, por depender do .env de verdade (linha 029).

## Commits (branch claude/r9-atendimento)

| Commit | Linhas |
| --- | --- |
| `24b0935`, `b0bf016`, `eb742d1` (Codex) | 001 a 006 |
| `805f7af` | 007 a 011 |
| `554df18` | 012 a 017 |
| `3cbbf90` | 018 a 023 |
| `84e595a` | 024 a 028 |
| `77247f9` | 029 |
| `7b86c31` | 030 a 032 |
| `b7d1c14` | 033 a 035 |
| `bc1d640`, `cb1ea6b`, `122ab66` | registro no MELHORIAS.md |

A mensagem do commit `b7d1c14` fala em "033 a 036". A numeração certa é 033 a 035: as perguntas na janela do app contam como uma linha só.

## As 10 mais importantes

1. **007** · Enviar arquivo aceitava "../outro-balde" no lugar da conversa e gravava a cópia fora da pasta dos anexos com a chave do servidor. Agora só aceita id de conversa de verdade.
2. **017** · Enviar mensagem confere se o telefone do pedido é o da mensagem gravada. Antes dava para marcar uma mensagem como enviada mandando o texto para outro número.
3. **018** · A chave e as mensagens só saem para endereço do CodeWords https e público. http, localhost, rede interna e nome de serviço com "../" são recusados nos 5 pontos de saída.
4. **012 e 013** · Webhook: token errado tem limite por endereço (10 em 10 min, depois 429 sem gravar nada) e só telefone com 10 a 15 dígitos vira conversa.
5. **024** · Excluir conversa com mais de 1.000 mensagens: a cópia de segurança agora tem todas e, se a conta não fechar, nada é apagado. Antes só as 1.000 primeiras iam para a cópia.
6. **030 a 032** · Nota do robô gravada como mensagem recebida ("Agendamento: …", "Lembrete 24h enviado", "N no-shows hoje") não faz mais a conversa voltar como "cliente sem resposta", não dispara o alerta de 30 minutos e não entra na conta da IA do funil.
7. **033** · As 13 perguntas que abriam a janela do navegador abrem na janela do app. O que apaga abre com o foco em Cancelar, excluir conversa só libera o botão quando o nome confere e o Esc fecha só a pergunta. Capturas: `qa-out/r10/depois-excluir-conversa-375.png`, `depois-excluir-conversa-1440.png`, `depois-resolvi-por-outro-meio-375.png`, `depois-resolvi-por-outro-meio-1440.png`.
8. **034** · Tema claro: a logo não é mais uma placa preta. Capturas: `qa-out/r10/depois-logo-claro-375.png` e `depois-logo-claro-1440.png`.
9. **026 a 028** · Menos idas ao CodeWords e ao banco e respostas grandes em gzip (números abaixo).
10. **020 a 022** · Quando o banco ou a IA falham, a tela recebe uma frase simples com o que fazer. Nome de tabela, coluna, regra e resposta crua do provedor ficam só no log do servidor.

As capturas ficam em `apps/atendimento/qa-out/r10/` (fora do git). São só as de depois: a janela do navegador não sai em captura de página, então o "antes" das perguntas é o próprio confirm() do Chrome.

## Desempenho (medido nos testes)

| O que | Antes | Depois | Teste |
| --- | --- | --- | --- |
| Estado do WhatsApp, 8 pedidos em sequência | 8 idas ao CodeWords | 1 ida (vale 20 s; pedidos juntos esperam a mesma consulta) | R10-ATD-026 |
| Tela de entrada, 10 aberturas | 10 consultas ao banco | 1 consulta | R10-ATD-027 |
| Fila com 300 conversas | 22.368 bytes | 1.005 bytes (gzip) | R10-ATD-028 |
| Nomes da equipe | 7.117 bytes | 438 bytes (gzip) | R10-ATD-028 |

Os bytes são do cenário de teste, com dados repetitivos. Com dados de verdade o gzip comprime menos; não medi em produção.

## Segurança fechada

- 003 e 004 (Codex): auditoria não deixa campo sensível escapar em objeto profundo; campos inteiros recusam tipo errado.
- 007, 008, 010, 011: envio de arquivo confere conversa, telefone e tipo, recusa corpo fora do formato e não devolve texto cru do aparelho.
- 012, 013: webhook com limite de token errado e telefone conferido.
- 015: retomada recusa corpo quebrado (antes virava "reenviar tudo").
- 016: limite de tentativas em Religar e Testar conexão.
- 017: telefone do envio conferido contra a mensagem gravada.
- 018: destino do CodeWords só https e público.
- 019: CSP sem a CDN nas conexões permitidas.
- 020, 021, 022: erro do banco e da IA sem texto cru na tela.

## Nomes que mudaram (antes · depois)

Nenhuma aba ou tela mudou de nome. Mudaram os botões das perguntas, que eram "OK" e "Cancelar" do navegador:

| Onde | Antes | Depois |
| --- | --- | --- |
| Excluir conversa | caixa do navegador pedindo o nome · OK | "Excluir a conversa de Fulano?" · campo "Para confirmar, digite o nome" · **Excluir conversa** |
| Apagar mensagens | OK | **Apagar** |
| Apagar registro do histórico | OK | **Apagar** |
| Excluir atalho | OK | **Excluir** |
| Excluir etapa | OK | **Excluir etapa** |
| Etapa com conversas dentro | OK | **Desativar etapa** |
| Conversa já assumida por outro | "Assumir mesmo assim?" · OK | "Quer assumir mesmo assim?" · **Assumir mesmo assim** |
| Reenviar mensagem | OK | **Reenviar** |
| Marcar visíveis como lidas | OK | **Marcar como lidas** |
| Horário fora da Agenda | OK | "Agendar como encaixe?" · **Agendar como encaixe** |
| Retomada, lista "Podem sair agora" | OK | "Reenviar agora?" · **Reenviar com calma** |
| Não saíram, "Resolvi por outro meio" | caixa do navegador "Como você resolveu?" | "Marcar como resolvida fora do WhatsApp?" · campo "Como você resolveu?" · **Marcar como resolvida** |

Os textos das perguntas perderam as palavras em maiúsculas ("TODAS", "CONTINUAM", "DESATIVAR").

## Pendências conhecidas da rodada

| Pendência | Situação |
| --- | --- |
| 10 confirm/prompt do navegador | Feito (eram 13). Linha 033. |
| Logo com placa preta no tema claro | Feito. Linha 034. |
| Borda lateral grossa em tarefas e etapas | Feito pelo Codex. Linha 001. |
| Roteiros antigos sem rodar desde a rodada 9 | Rodados antes e depois. Linhas 029 e 035. |
| Aviso do sistema gravado como mensagem do cliente | Tratado na leitura (030 a 032). A gravação na origem não é deste repositório: ver abaixo. |
| `navegador-r9-b2.mjs` caindo em `#filtrosExtras > summary` | Fica em apps/comunicar (Codex). Não mexi. O Codex registrou que passou com servidor de mentira. |

## Para outra frente

- **Webhook em produção:** o aviso do sistema é gravado pelo robô de fora, não por este app. Se a entrada em produção for a função `supabase/functions/codewords-webhook/index.ts`, o limite de token errado e a conferência de telefone (012 e 013) valem só para o `server.js`: não alterei a função porque não posso publicar, e vale conferir se ela precisa do mesmo.
- **Tráfego:** o SQL que trata as notas do sistema continua sem aplicar. Enquanto isso, a regra única fica em `apps/atendimento/lib/aviso-sistema.js`.
- **Servidor de mentira do CodeWords em outra frente:** o Atendimento agora recusa destino http ou local. Para teste local use `CODEWORDS_LOCAL=1`.
- **Arquivos novos que outras frentes podem reaproveitar:** `lib/resposta.js` (resposta em gzip), `lib/destino-codewords.js`, `lib/aviso-sistema.js`, `scripts/pergunta-roteiro.cjs` (roteiro responde à janela do app).
- **Casca:** `sw.js` foi para a v22 e ganhou `logo-claro.png`.
- **Comunicar:** não toquei em `apps/comunicar`.
- `apps/atendimento/qa-out/` aparece como pasta sem controle no git: são só capturas, não entrou em commit.

## Para o João

- Nada está no ar: tudo fica na cópia `indycar-agendamentos-claude-atendimento`, branch `claude/r9-atendimento`, esperando a junção.
- A meta era 150 e fechei em 35. O que sobrou de ideia sem teste que falhasse antes ficou de fora.
- Decisão sua: pedir ao robô que pare de gravar aviso do sistema como mensagem recebida do cliente. Hoje o app só ignora essas notas na hora de ler.
- A chave do CodeWords continua recusada (401) desde outubro. Nada desta rodada depende dela, mas o WhatsApp de verdade segue sem teste.
- A logo do tema claro foi gerada a partir da oficial (preto virou transparente; a marca do pneu e "CENTRO AUTOMOTIVO" ficaram no escuro da casa). Vale um olhar seu: se preferir a arte original do designer com fundo transparente, é só trocar `public/logo-claro.png`.
- Em 375 px, os botões da pergunta de excluir conversa ficam em duas linhas (Cancelar em cima, Excluir conversa embaixo). Funciona e tem 44 px de toque, mas não ficou alinhado.
