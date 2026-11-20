# Rodada 10 · Agenda (conexões, segurança e desempenho)

Frente AGENDA da rodada 10. O Codex fez as linhas 001 a 004 e parou no limite de uso; o Claude assumiu em 20/11/2026
e fez as linhas 005 a 039. Cópia `indycar-agendamentos-claude-agenda`, ramo `claude/r9-agenda`.
Nada foi publicado, nenhum push, nenhum SQL aplicado, nenhuma mensagem mandada, nenhum dado apagado, nenhuma credencial tocada.

## Contagem

- **39 linhas `R10-AGE-`** no `MELHORIAS.md` da raiz, de 001 a 039, sem buraco e sem repetição. A meta era 125.
- **Parei em 39 de propósito.** Pela regra dura (teste que falha antes e passa depois, no máximo 6 linhas por commit,
  atributo solto não conta) foi o que achei de verdade lendo o `server.js` inteiro, a página `/confirmar/` e o modo
  presença. O que sobrou está em "Ficou de fora", sem virar linha.
- Por categoria: segurança 23, conserto 5, aviso 5, desempenho 2, acessibilidade 1, celular 1, texto 1, teste 1.
- Toda linha minha (005 a 038) tem teste que falhava no código de antes; conferi rodando o teste antes de escrever o
  conserto. A 039 é teste de cobertura das linhas R9-AGE-014 a 036 (pedido do recado: uma linha por arquivo de teste).

## Commits (no máximo 6 linhas cada)

| Commit | Linhas | O que |
| --- | --- | --- |
| `5c99a4b`, `97667b3`, `77ce05a`, `b176402` | 001 a 004 | Codex: corpo JSON (lista, acento partido, UTF-8 inválido, só espaços) |
| `a42b8cd` | 005 a 010 | webhook da Meta: sem token padrão, só com a Cloud API ligada, assinatura, campos e situações conferidos |
| `3caa28b` | 011 a 016 | Enviar WhatsApp e configuração da Cloud API: formato, freio, teto de tempo, token só para gestor |
| `2d34a79` | 017 a 020 | CodeWords: endereço https público, chave guardada não sai, ids conferidos, falha de rede em português |
| `2ea6eed` | 021 a 024 e 031 | endereço torto não derruba o servidor, link de confirmação, freio no calendário, casca comprimida |
| `c8b8930` | 025 a 030 | erro do banco fora da tela, edição e cliente conferidos, confirmação pública enxuta, memória de 60 s |
| `699defe` | 032 e 033 | conversas sem horário ignoram aviso do sistema; política de conteúdo só com o projeto configurado |
| `ec9f495` | 034 a 037 | página `/confirmar/` medida e consertada |
| `fd5b266` | 038 e 039 | modo presença em 375 px; teste dos campos da rodada 9 |

Mais três commits só de registro no `MELHORIAS.md` (`b9d4dc6`, `339af64`, `74a9c77`) e o desta entrega.

## Suíte

| | Antes (ramo com o main de 20/11 e as 4 linhas do Codex) | Depois |
| --- | --- | --- |
| `npm test` da raiz | 586 de 586 | **624 de 624** |
| `npm run check` | passa | passa |

Testes novos (38): `tests/r10-agenda-servidor.test.mjs` (27, o `server.js` de verdade por HTTP com banco e porteiro de
mentira), `tests/r10-agenda.test.mjs` (7, funções puras e leitura da tela) e `tests/r10-agenda-campos.test.mjs` (4).
Os três entraram no `test` do `package.json` da raiz. Um teste antigo foi ajustado: `tests/r9-agenda.test.mjs` passou
a ler a política de conteúdo também em `regras.js`, para onde ela foi.

## Desempenho (medido, antes e depois)

| Linha | O que | Antes | Depois |
| --- | --- | --- | --- |
| 030 | consultas ao banco pelos dados da oficina em 5 aberturas de tela | 5 | 1 |
| 030 | consultas ao banco pelas janelas em 5 aberturas | 5 | 1 |
| 031 | casca devolvida em endereço que não é arquivo | 21.808 bytes, sem ETag | 5.721 bytes em brotli; revalidar = 304 vazio |
| 014 | "Testar conexão" da Cloud API sem resposta | sem prazo | 10 s |
| 015 | envio pela Cloud API sem resposta | sem prazo | 15 s |

Página `/confirmar/` (nunca tinha sido medida), primeira visita em 375 px numa rede 4G lenta (400 ms, 1,6 Mbps),
mediana de 3 passadas: **943 ms** até a pergunta aparecer, **18.043 bytes** em **4 pedidos** (página, logo, ícone e a
consulta do horário). Antes das mudanças: 959 ms, 17.577 bytes, 4 pedidos. Ou seja: a página já era leve e **não
ficou mais rápida**; não conto linha de desempenho por ela. O que mudou nela foi contraste, rede ruim e texto.

## Página `/confirmar/` (servidor de verdade com banco de mentira, `scripts/qa-r10-confirmar.mjs`)

8 cenas (pergunta, respondido, horário que passou, link que não vale, link sem token, recado, sem rede ao responder,
sem rede ao abrir) em 375 e 1440 px, claro e escuro: 32 medidas.

| Medida | Antes | Depois |
| --- | --- | --- |
| Com rolagem lateral | 0 de 32 | 0 de 32 |
| Em 375 px com controle menor que 44 px | 0 | 0 |
| Com violação séria do axe-core (contraste) | 24 de 32 | 0 de 32 |
| Texto com travessão | 1 ("seg–sáb") | 0 |
| Sem rede ao responder | "Failed to fetch" | "Sem conexão agora. Confira a internet e tente de novo." |
| Sem rede ao abrir | "Ops", sem saída | "Ops" com "Tentar de novo" |

Capturas em `qa-out/r10/` (não versionado): `antes-confirmar-<cena>-<largura>-<tema>.png` e `depois-...`.

## Modo presença em 375 x 800 (servidor de mentira, papel agenda)

| Medida | Antes | Depois |
| --- | --- | --- |
| Onde começa o primeiro cartão | 927 px (fora da primeira tela) | 509 px |
| "Chegou" e "Não veio" do primeiro cartão na primeira tela | não | sim |
| Rolagem lateral | não | não |

Capturas: `qa-out/r10/antes-presenca-375.png` e `depois-presenca-375.png`. A barra lateral de 74 px continua; ver
"Ficou de fora".

## Segurança: o que foi fechado (23 linhas)

- **Queda sem login (021)**: um `GET //` ou um `Host: [` deixava o pedido sem resposta e a promessa sem tratamento
  derrubava a Agenda rodando sozinha. Agora é 400 na hora.
- **Webhook da Meta (005 a 009)**: o token de verificação padrão era "indycar", escrito no código; qualquer POST
  gravava "mensagem recebida do cliente" sem login. Agora: sem token padrão, só grava com a Cloud API ligada, confere
  a assinatura quando `WHATSAPP_APP_SECRET` existe, e só passa telefone, texto, nome e situação no formato certo.
- **HTML gravado por atendente abrindo na tela do gestor (010)**: a situação de uma mensagem aceitava qualquer texto
  e a tela mostrava sem escapar.
- **Chave do CodeWords (017 e 018)**: "rodar fluxo" mandava a chave guardada para o endereço que viesse no pedido, e
  o endereço base aceitava máquina interna. Agora só https público, e endereço do pedido só com a chave do pedido.
- **Cloud API (013 e 016)**: versão e ID entravam crus no endereço chamado com o token de acesso; o token de
  verificação e o ID da conta iam para qualquer atendente.
- **Link para o cliente (023)**: o domínio do link de confirmação vinha do cabeçalho do pedido.
- **Calendário (024)**: dava para tentar adivinhar o token sem limite; o calendário leva nome, telefone e placa.
- **Entradas sem conferência (011, 012, 019, 027, 028)**: Enviar WhatsApp, Integração, edição de horário, cliente.
- **Erro que vazava detalhe (025 e 026)**, **resposta pública enxuta (029)**, **política de conteúdo (033)**.

Conferido e estava certo (sem mudança): fórmula em planilha exportada, permissão por papel em toda rota que grava
(`regras.js`), limite de 64 KB no corpo, limite por IP na API, tela com `esc()` nos textos de cliente que olhei,
sessão vencida e reenvio com rede ruim na tela principal (`api()` do `app.js` já trata).

## Aviso do sistema gravado como mensagem recebida (pendência do recado)

Procurei nos arquivos da Agenda: **o código da Agenda não grava** "Agendamento: …", "Lembrete 24h enviado" nem
"N no-shows hoje". O único ponto que grava mensagem de entrada é o webhook da Meta, que era aberto a qualquer um
(fechado nas linhas 006 a 008). Esses textos vêm de fora (fluxo do CodeWords ou gatilho do banco); a última
ocorrência citada em `r8/achados/04-consultas.sql` é de 30/09. O que a Agenda sofria com eles foi consertado: o
"Conversas sem horário" do Início listava esses avisos como se fosse cliente pedindo horário (linha 032).

## Nomes que mudaram (antes · depois)

| Onde | Antes | Depois |
| --- | --- | --- |
| WhatsApp › Configuração, campo Token de verificação | vinha preenchido com "indycar" | vazio, com a dica "Crie um com 12 letras ou mais, sem espaço" |
| "Testar conexão" sem os dados | Informe o Phone Number ID e o Access Token. | Informe o ID do número e o token de acesso. |
| Preparar modelo que não existe | Template não encontrado. | Modelo não encontrado. |
| Rodapé da página de confirmação | seg–sáb, 8h às 17h30 | segunda a sábado, 8h às 17h30 |

Nenhuma tela, aba ou botão mudou de nome.

## SQL

Nenhum SQL foi necessário nesta frente. Nada foi escrito em `indycar-ferramentas\sql\`.

## Para outra frente

- **Quem junta os ramos (`package.json` da raiz)**: entraram três arquivos no `test` e `scripts/qa-r10-confirmar.mjs`
  no `check`. Conflito, se houver, é só de lista.
- **Central (`central.js`)**: confere o endereço num `try`, mas repassa para a Agenda o caminho sem o prefixo. O
  conserto da linha 021 cobre a Agenda; vale conferir se `/agenda//` chega bem aos outros apps.
- **Atendimento** (`apps/atendimento/server.js`, linha 2371): monta o endereço com `new URL(req.url, ...)` como a Agenda fazia. Não conferi se está dentro de um `try`; vale o mesmo teste (`GET //`). CRM, Comunicar e Tráfego já fazem dentro de `try`.
- **Tráfego**: o filtro de aviso do sistema da Agenda (`dados.js › ehAvisoDoSistema`) é cópia da regra do
  `apps/trafego/origem.js`. Se um mudar, o outro tem de acompanhar.
- **Casa e Vigia**: a Agenda responde 429 no calendário depois de dez tokens errados do mesmo endereço em 10 min.
- **Manual**: os nomes da tabela acima.

## Para o João

1. **Nada foi publicado.** São 8 commits meus de código, 3 de registro e o desta entrega (mais os 4 do Codex) no ramo `claude/r9-agenda`. Publicar é decisão sua.
2. **Token do webhook da Meta**: se a Cloud API estiver em uso com o token "indycar", a assinatura do webhook continua
   funcionando (a Meta só confere o token na hora de assinar), mas para assinar de novo é preciso criar um token de 12
   letras ou mais em WhatsApp › Configuração. Não olhei o banco de produção para saber qual está salvo.
3. **Mensagens recebidas pela Cloud API**: só são gravadas com "Enviar pela Cloud API" ligado. Se hoje a oficina
   recebe pela Meta com essa chave desligada, o histórico da aba Mensagens para de receber depois de publicar.
4. **`WHATSAPP_APP_SECRET`**: vale colocar o segredo do app da Meta no ambiente do Render. Sem ele o webhook aceita
   entrega sem assinatura (com a Cloud API ligada), como antes.
5. **`AGENDA_URL_PUBLICA`**: se a Agenda atende num domínio próprio (fora do `onrender.com`), coloque esse endereço
   no ambiente. Sem isso o link de confirmação sai com `indycar-agendamentos.onrender.com`, que continua funcionando.
6. **Endereço do CodeWords**: se o endereço salvo em Integração não for https público, os envios param com um recado
   dizendo onde corrigir. O padrão (`https://runtime.codewords.ai`) passa.
7. **Modo presença no celular**: olhar a prévia em 375 px antes de publicar. Mudou só até 560 px de largura.
8. **Meta de 125 não batida**: 39 linhas com prova. Preferi parar a encher.

## Ficou de fora

- **Barra lateral do modo presença no celular**: os 74 px da lateral continuam (logo, apps, tema e conta). Tirar
  dali exige mexer em como os menus se posicionam (eles abrem ao lado do botão); não quis arriscar sem ver no aparelho.
- **Biblioteca do login sem trava de integridade**: o `supabase-js` vem do jsDelivr sem `integrity`. Precisa do
  hash do arquivo publicado; não baixei nada de fora nesta sessão.
- **`script-src 'unsafe-inline'`**: a tela usa `onclick` nos modais. Tirar é reescrever os modais.
- **Token do calendário na URL**: é assim que o Google Agenda assina; continua. O log já não grava a query.
- **`/api/codewords/importar` e a leitura de `/api/whatsapp/ia/config`** seguem abertas a qualquer atendente (chaves
  mascaradas). Não mudei: não conferi quem usa essas duas telas no dia a dia; fica para decidir.
- **Leitor de tela de verdade e celular de verdade**: a conferência foi por axe-core e Chrome de computador em 375 px.
- **Inventário com prova de uso** (rodada 9): continua sem fazer, pelo mesmo motivo (sem leitura do banco de produção).
- **Capturas comparativas das linhas de servidor**: não têm tela; a prova é o teste.
