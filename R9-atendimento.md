# Rodada 9 · Atendimento

Frente começada pelo Codex (R9-ATD-001 a 017) e continuada pelo Claude (R9-ATD-018 a 110) no ramo `claude/r9-atendimento`.

## Contagem

**110 de 150.** Faltam 40. Parei em 110 porque o que restava para chegar a 150 dentro da cota seria inflação (mesma correção contada por tela), e a regra da rodada invalida a contagem nesse caso. As 110 linhas estão em `apps/atendimento/MELHORIAS.md`, numeradas sem buraco e sem repetição, cada uma com o commit.

| Categoria | Quantas |
| --- | --- |
| celular | 36 |
| acessibilidade | 23 |
| conserto | 18 |
| texto | 10 |
| teste | 8 |
| enxugar | 5 |
| tela | 5 |
| segurança | 3 |
| aviso | 2 |

## Suíte antes e depois

| Conferência | Antes | Depois |
| --- | --- | --- |
| `npm test` de `apps/atendimento` | 412 | 441, todos passando |
| Roteiro novo no Chrome (`scripts/roteiro-r9.cjs`, servidor de mentira, porta 3473) | não existia | 164 de 164 |
| Roteiro antigo da tela (`scripts/roteiro-tela.cjs`, servidor de mentira) | quebrava com os textos novos | 220 de 220 |
| axe-core (11 telas, 375 e 1440 px, tema claro e escuro, 15 janelas e telas de entrada) | várias falhas sérias de contraste e de região que rola | nenhuma falha séria |
| `scripts/segredos.mjs` | limpo | limpo (131 arquivos) |

Todo teste de navegador rodou no servidor de mentira, com bloqueio de qualquer pedido que não fosse para localhost. Nada foi publicado, nenhum SQL aplicado, nenhuma mensagem de WhatsApp enviada, CodeWords nunca chamado.

## As 10 melhores

Capturas em `apps/atendimento/qa-out/r9/` (`antes-<tela>-<largura>-<tema>.png` e `depois-...`). A pasta não está no git.

1. **Conversa aberta com o WhatsApp parado, no celular.** A área das mensagens ficava com 0 px de altura em 375×812: a pessoa abria a conversa e não via nada. Agora a conversa ocupa a tela inteira e as mensagens têm no mínimo 160 px. Ver `depois-conversa-aberta-375x812.png`.
2. **A mesma falha em notebook 1366×768.** As faixas, os chips e as propostas empurravam as mensagens para fora. Agora elas têm no mínimo 150 px e as propostas rolam. Ver `depois-conversa-aberta-1366x768.png`.
3. **Lista de conversas no computador.** A regra de 44 px valia também no mouse e esticava a lista para 658 px. Ficou só no celular e em tela de toque.
4. **Toque de 44 px no celular** em todas as telas: lista, janelas, copiloto, tarefas, equipe, faixas da retomada.
5. **Contraste AA no tema claro e no escuro**: vermelho, verde e azul de texto, plaquinhas, dono da conversa, selo de espera.
6. **Gráficos com resumo em texto** para o leitor de tela, e regiões que rolam alcançáveis pelo teclado.
7. **Ficha do cliente no Sugerir entra limpa e dentro da cerca.** O texto que vem da tela é tratado como dado, não como ordem para a IA.
8. **Formulários que conferem e dizem o porquê**: telefone da Nova conversa, comando do atalho, placa no formato da busca, sem duplo envio.
9. **Selo do CodeWords.** Com a chave recusada, o cartão dizia "ligado" logo abaixo da faixa que dizia que o WhatsApp parou. Agora diz "chave recusada".
10. **Tarefas pelo servidor**: avisos em português simples, a carga da equipe não zera quando a leitura falha, e as linhas têm limite.

## Nomes que mudaram

| Onde | Antes | Depois |
| --- | --- | --- |
| Tela de entrada, link | Já tenho conta — entrar | Já tenho conta: entrar |
| Motivo de passar a conversa | Assunto técnico — precisa de consultor | Assunto técnico: precisa de consultor |
| Aviso de Equipe, Auditoria e Tarefas com servidor antigo | "... ainda não chegou no servidor" (com nome de rota) | "... ainda não está disponível", com o que fazer |
| Integrações, selo do CodeWords com chave recusada | ligado | chave recusada |
| Celular, botão de tema | na barra de cima | só no menu do perfil |
| Celular, barra de telas | sempre à vista | some com a conversa aberta e volta ao sair dela |

Nenhuma tela ou aba mudou de nome. Os demais textos só perderam o travessão.

## Para outra frente

- Arquivo novo `apps/atendimento/public/r9-regras.js` (regras puras, carregado antes do `app.js`) e `sw.js` em `v21`. A Central serve a pasta inteira, então não precisa de ajuste, só conferir a navegação ao integrar.
- O CSS novo usa `:has()` e `color-mix()`. Funciona em Chrome, Edge, Safari e Firefox atuais, não em navegador antigo.
- `apps/atendimento/qa-out/` não está no `.gitignore`. Não adicionar ao commit.
- A cópia de trabalho não tinha `node_modules`. Criei uma junção para o `node_modules` da pasta `indycar-agendamentos` (fora do git). Sem ela, 2 testes falham.
- Só rodei de novo o roteiro antigo `roteiro-tela.cjs`. Os outros (r5c, r6c5, r7c4, rodada4, rodada5, rodada6, casca) não foram rodados depois das mudanças.
- Não toquei em `apps/comunicar`, `apps/crm`, `apps/trafego`, `casa/` nem na raiz (fora este arquivo).

## Para o João

- Faltam 40 melhorias para as 150. Dá para seguir em outra passada, com os itens abaixo como ponto de partida.
- Confirmar na prévia quais filtros devem ficar na primeira linha das conversas (pendência que veio do Codex: não dá para saber o uso por filtro).
- No celular a barra de telas some enquanto a conversa está aberta. Se preferir que ela fique, é uma regra de CSS.
- Ainda há 10 perguntas de confirmação na janela do navegador (`confirm` e `prompt`). Troquei pela janela do app e desfiz, porque os roteiros antigos dependem da janela do navegador. Vale trocar junto com os roteiros.
- Os cartões de tarefa e de etapa ainda têm borda lateral grossa colorida, que o guia visual pede para tirar.
- No tema claro a logo aparece com a placa preta.
- O CodeWords segue recusando a chave. A tela avisa, mas o envio só volta quando a chave for trocada.

## Do Codex (lotes 1 e 2, R9-ATD-001 a 017)

Painel Mais filtros nas conversas e cinco melhorias no histórico, em `9301455` e `a3d3634`. A rodada 1 mediu 440 conversas em 30 dias, 259 sem lead ligado pelo telefone.
