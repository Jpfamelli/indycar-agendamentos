# Rodada 9 · Agenda

Frente AGENDA da rodada 9. O Codex fez as linhas 001 a 036 e parou no limite de uso; o Claude assumiu em 20/11/2026
e fez as linhas 037 a 125. Cópia de trabalho `indycar-agendamentos-claude-agenda`, ramo `claude/r9-agenda`.
Nada foi publicado, nenhum SQL foi aplicado, nenhuma mensagem saiu, nenhum dado foi apagado.

## Contagem

- **125 linhas `R9-AGE-`** no `MELHORIAS.md` da raiz, de 001 a 125, sem buraco e sem repetição.
- 001 a 036: Codex (commits `8c60a72`, `faf90d1`, `9299314`, `254ecdc`, `af408bd`).
- 037 a 125: Claude, em 5 commits de código (`75ebed2`, `c3a42fe`, `edd283e`, `3d367b9`, `6934efc`), mais `b8914ff`
  (sobras da última medida, sem linha nova) e 3 commits de registro (`250b786`, `42f5d41`, `9c849d5`).
- Por categoria (as 125): acessibilidade 38, celular 33, texto 17, conserto 13, tela 10, segurança 8, aviso 2,
  teste 2, enxugar 1, desempenho 1.
- **Uma linha foi corrigida**: a 071 dizia que o X das janelas de WhatsApp ganhou nome, mas o `openModal` já punha
  esse nome sozinho. Ela passou a apontar outra melhoria de verdade (o botão "Usar R$ ..." da janela "Veio e fechou").
- **Feito além da conta, sem linha** (está no código e nos testes): logo do login com espaço reservado (sem pulo
  de layout), erro do primeiro acesso anunciado ao leitor de tela, cor e descrição do app instalado iguais às da
  página, sugestões do Remarcar com nome falado igual ao texto, texto do primeiro acesso sem travessão, histórico
  da ficha do cliente com 44 px.
- Observação para a amostra: as linhas 014 a 036 (Codex) são de um atributo por linha (`enterkeyhint`, `for`,
  `inputmode`) e não têm teste próprio. Não mexi nelas nem na contagem delas.

## Suíte

| | Antes | Depois |
| --- | --- | --- |
| `npm test` da raiz | 463 de 463 | **503 de 503** |
| `npm run check` | passa | passa |

- Antes de tudo a cópia não tinha `node_modules` (11 testes da Central falhavam por falta de `@supabase/supabase-js`).
  Rodei `npm ci` na cópia; a pasta não é versionada.
- Testes novos: `tests/r9-agenda.test.mjs` (28) e `tests/r9-agenda-servidor.test.mjs` (12, o `server.js` de verdade
  por HTTP com banco de mentira). Os dois entraram na lista do `npm test` no `package.json` da raiz.
- Um teste antigo foi atualizado junto com o texto: `tests/c1c-agenda.test.mjs` (o texto do dia copiado para o
  WhatsApp deixou de ter travessão).

## Medida no navegador (servidor de mentira, nada no banco de verdade)

Três ferramentas novas em `scripts/`, todas sobem `scripts/mock-server.mjs` numa porta própria (3461 a 3464):

- `qa-r9-agenda.mjs`: as 18 telas em 375 e 1440 px, claro e escuro (72 medidas). Mede rolagem lateral, alvo de
  toque menor que 44 px, violações sérias do axe-core e travessão no texto.
- `qa-r9-modais.mjs`: 20 janelas, popovers, telas de login e o modo presença, nas mesmas quatro combinações.
- `qa-r9-sonda.mjs`: abre uma tela e roda um trecho de JS (usada para conferir cada conserto).

| Medida das 18 telas | Antes | Depois |
| --- | --- | --- |
| Medidas com rolagem lateral | 0 de 72 | 0 de 72 |
| Medidas em 375 px com algum controle menor que 44 px | 36 de 36 | 0 de 36 |
| Controles diferentes menores que 44 px (seletor e tamanho) | 111 | 0 |
| Medidas com violação séria do axe-core | 72 de 72 | 0 de 72 |
| Violações sérias diferentes (tela, regra e elemento) | 78 | 0 |
| Frases de tela com travessão no meio | 6 | 0 |

Última medida das telas (`qa-out/r9/medida-depois.json`, depois do commit `b8914ff`): 72 medidas, nenhuma com
rolagem lateral, nenhum controle menor que 44 px, nenhuma violação séria do axe-core. Os 16 achados que o relatório
ainda lista são o traço sozinho de célula vazia. No meio do caminho a medida pegou duas regressões minhas: a fila de avisos do Início alargou a página em 375 px
(consertada antes de commitar) e o campo de data redesenhado alargou a barra do Quadro em 375 px (entrou no commit
`75ebed2` e foi consertada no `b8914ff`).

Medida das janelas (`qa-out/r9/medida-janelas.json`): na primeira passada, 31 das 80 medidas tinham controle
menor que 44 px (19 controles diferentes, o X de fechar com 13 x 22 px entre eles) e 8 tinham contraste abaixo de
4,5:1. Na última passada, 80 medidas, nenhuma com rolagem lateral, controle pequeno ou violação séria. Três cenas
(editar agendamento, "Não veio" e ficha do cliente) não abriam por seletor errado no meu roteiro; consertei o
roteiro e medi as três à parte (`medida-janelas-parte.json`, 12 medidas): o único achado foi o histórico da ficha
com 22 px de altura, consertado no `b8914ff` e conferido com a sonda (44 px, sem rolagem lateral).

O que sobra de travessão na tela é só o traço sozinho de "sem dado" nas células de tabela (Clientes, CRM, Equipe,
Relatórios). Ficou de propósito: é marca de célula vazia, não pontuação.

Capturas em `qa-out/r9/` (não versionado): `antes-<tela>-<largura>-<tema>.png` e `depois-...` das 18 telas,
`antes-janela-<nome>-<largura>.png` das janelas.

## As 10 mais importantes

| # | Linha | O que mudou | Captura antes · depois (`qa-out/r9/`) |
| --- | --- | --- | --- |
| 1 | 083 a 087 | Webhook de saída: o servidor só chama endereço https e público, com teto de 8 s, sem seguir redirecionamento, com freio no teste e recado sem detalhe de rede. Antes dava para fazer o servidor bater em máquina interna | sem tela (teste `R9 webhook`) |
| 2 | 037 a 052, 121 a 123 | Tudo que se toca no celular tem 44 px: botões, ações dos cartões, abas, filtros, campos, X das janelas, links do login | `antes-agenda-375-escuro.png` · `depois-agenda-375-escuro.png` |
| 3 | 072 | Início no celular: os avisos do dia viram uma fila que rola de lado; a lista de horários aparece na primeira tela | `antes-inicio-375-escuro.png` · `depois-inicio-375-escuro.png` |
| 4 | 053 a 062, 124 | Contraste AA nos dois temas (selos verdes e laranja do claro, "Chegou" da recepção, cartões apagados do Quadro e da Semana, texto secundário do escuro) | `antes-quadro-1440-claro.png` · `depois-quadro-1440-claro.png` |
| 5 | 117 | "Buscar em tudo": a caixa de busca tinha 320 px de altura e empurrava os resultados | `antes-janela-busca-375.png` · conferido com a sonda |
| 6 | 119 | Menu com "Mais" aberto: os itens encolhiam (ícone de 21 px virava 14); agora o menu rola | `antes-clientes-1440-escuro.png` · `depois-clientes-1440-escuro.png` |
| 7 | 074 a 076 | Sem faixa grossa colorida na lateral dos cartões (Quadro, confirmações, espera), como pede o guia visual | `antes-quadro-1440-escuro.png` · `depois-quadro-1440-escuro.png` |
| 8 | 105 a 107 | Fontes do próprio app (Archivo e Barlow Condensed, as do guia): sai a Inter e o Google Fonts, a política de conteúdo fecha | `antes-inicio-1440-escuro.png` · `depois-inicio-1440-escuro.png` |
| 9 | 088, 089, 093 | Serviços, modelos do WhatsApp e dados da oficina validados no servidor (antes gravava nome em branco e preço negativo) | sem tela (teste `R9 serviços`, `R9 modelos`, `R9 dados da oficina`) |
| 10 | 094 a 102, 114 a 116, 118 | Textos: nenhuma frase de tela ou recado do servidor com travessão; lembrete sem "Oi !" nem "undefined"; data "20 de novembro de 2026" | `antes-followup-1440-escuro.png` · `depois-followup-1440-escuro.png` |

## Nomes que mudaram (o manual é gerado de novo depois)

| Antes | Depois | Onde |
| --- | --- | --- |
| DASHBOARD | INÍCIO | etiqueta do topo (Codex; agora também enquanto a tela carrega) |
| Agenda de hoje (lista) | Horários de hoje | Início (Codex) |
| Compareceram hoje | Chegaram hoje | Início (Codex) |
| Compareceu e não fechou | Vieram e não fecharam | Início (Codex) |
| Phone Number ID | ID do número | WhatsApp (Codex) |
| Business Account ID (WABA) | ID da conta do WhatsApp (WABA) | WhatsApp (Codex) |
| Base URL | Endereço base do CodeWords | WhatsApp (Codex) |
| ✨ Horários livres | Horários livres | botão do Novo agendamento |
| ✨ R$ 1.890,00 | Usar R$ 1.890,00 | sugestão de valor em "Veio e fechou" |
| Follow-up — retornos pendentes | Follow-up: retornos pendentes | título da tela |
| Hoje marcado para ... | Horário atual: ... | janela Remarcar |
| — sem login ligado — | sem login ligado | lista do consultor |
| — Mensagem livre — | Mensagem livre | lista de modelos |
| Já tenho conta — entrar | Já tenho conta, entrar | primeiro acesso |
| Veículo: | Carro: | tela de Serviços |
| coluna `veiculo` | coluna `carro` | planilhas de clientes e de agendamentos |

Nenhuma aba, tela ou rota mudou de nome nesta parte. Nada saiu do menu além do que o Codex já tinha recolhido em "Mais".

## Para outra frente

- **Quem junta os ramos (package.json da raiz)**: acrescentei `tests/r9-agenda.test.mjs` e
  `tests/r9-agenda-servidor.test.mjs` ao `test`, e `scripts/qa-r9-agenda.mjs`, `qa-r9-sonda.mjs` e
  `qa-r9-modais.mjs` ao `check`. Se outra frente mexeu na mesma linha, o conflito é só de lista.
- **Central e Casa (`central.js`)**: a política de conteúdo da Casa ainda libera `fonts.googleapis.com` e
  `fonts.gstatic.com` (linhas 192 e 193). A Agenda não precisa mais deles. As fontes ficaram em `public/fontes/`
  (cópia de `apps/trafego/tela/fontes/`); se a Central passar a servir uma pasta de fontes só, dá para tirar a cópia.
- **Comunicar**: o lembrete que a Agenda monta quando o modelo do Comunicar vem vazio agora diz "no dia marcado"
  se a data for inválida. Se o Comunicar tem a mesma função do lado dele, vale o mesmo cuidado.
- **Banco (rodada 10)**: o endereço gravado em `agenda_empresa` tem travessão ("875 — Parque Paduan"). A Agenda
  troca na hora de mostrar; quem lê a tabela em outro app mostra o travessão. Basta salvar de novo em Configurações.
- **Manual**: os nomes da tabela acima.

## Para o João

1. **Olhar a prévia antes de publicar**: a letra mudou (Archivo no lugar da Inter), os botões vermelhos ficaram
   chapados e os cartões do Quadro perderam a faixa colorida da lateral (a cor do estado virou uma marca pequena ao
   lado da hora). É o que mais muda de cara.
2. **Webhook em Conectores**: se o endereço salvo hoje não começar com `https://` ou for de rede interna, ele
   deixa de ser chamado depois de publicar. Não consegui olhar o banco de produção nesta sessão; vale abrir
   Conectores e tocar em Testar.
3. **Planilhas**: a coluna `veiculo` virou `carro`. Se alguém importa essas planilhas em outro lugar, avisar.
4. **Quadro dentro de "Mais"** (pendência que o Codex deixou): confirmar se fica ali ou volta para o menu principal.
5. Nada foi publicado. Para ir ao ar é juntar o ramo `claude/r9-agenda` e publicar pela rotina de sempre.

## Ficou de fora

- **Inventário com prova de uso** (o método do `R2-repaginar-e-enxugar.md`): não fiz. Não tive leitura do banco
  de produção nesta sessão e o recado proíbe inventar uso. Nada foi cortado nem escondido por mim.
- **Leitor de tela de verdade e teclado virtual de celular**: a conferência foi por axe-core e medida no Chrome
  de computador em 375 px. Ninguém ouviu a tela num leitor nem digitou num celular.
- **Página pública `/confirmar/`** (a que o cliente abre pelo link): não entrou na medida.
- **Modo presença em 375 px**: a barra de cima (relógio, tamanho da letra, contadores) toma a primeira tela
  inteira antes da lista. A recepção usa tablet ou computador, então deixei como está; em celular é ruim.
- **Emojis como ícone** nos botões do Quadro (Mover, Repetir, Conversa, Imprimir) e no botão de tema: continuam.
- A tarefa atrasada no popover "Minhas tarefas" ainda tem a borda vermelha na lateral.
