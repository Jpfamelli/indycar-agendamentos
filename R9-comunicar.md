# Rodada 9 · Comunicar

| Área | Prova de uso disponível | Decisão |
| --- | --- | --- |
| Início, prévia, mensagens e réguas | A rodada 1 reproduziu os fluxos no mock. Uso recente por controle: não dá para saber. | Manter os caminhos à vista. |
| Campanhas, Clientes e Satisfação | Uso recente por rota: não dá para saber. | Agrupar em Mais. |
| Rodar agora e indicadores detalhados | Uso recente por controle: não dá para saber. | Agrupar em Mais ações e Mais indicadores. |
| PARAR, auditoria e trava contra envios vencidos | Controles de proteção. | Manter. |

Os nomes das telas e ações foram preservados. Mais, Mais ações e Mais indicadores são novos rótulos de navegação.

A suíte completa executa 310 testes. Capturas antigas da rodada 1 estão em `apps/comunicar/qa-out/`.

Para João, confirmar na prévia se Campanhas deve voltar ao primeiro nível. Para Claude, atualizar o caminho das telas no manual ao integrar.

Lote 1 em `9301455`. 12 melhorias no primeiro commit. Os cinco ajustes de `9c68d71` elevam a rodada a 17 melhorias no MELHORIAS.

O levantamento da rodada 1 registrou zero lembretes criados ou enviados em 32 dias e identificou a chave recusada como bloqueio de envio.

Chrome com mock e tráfego externo bloqueado. O painel abre por clique e teclado e cabe em 375 e 1440 px nos temas claro e escuro. A mesma matriz confirmou respostas atrasadas, falhas de atualização e rejeição de períodos invertidos. As capturas depois estão em `apps/comunicar/qa-out/r9/`. Faltam comparação antes/depois, axe e jornadas completas.

A segunda passagem protege consultas concorrentes, busca e filtros de mensagens. Foram registradas 14 melhorias em `e6bc7ed`, `290e36a` e `8e5b653`, totalizando **31/100**. A suíte passou em **310/310**. Retomar em R9-COM-032. Nenhum nome de botão ou de tela mudou nesta passagem.

O uso de Campanhas, Clientes e Satisfação por rota segue indeterminado. Para João, revisar o agrupamento em Mais e verificar a chave do CodeWords em Atendimento › Configurações › Integrações. Para Claude, conferir o caminho no manual ao integrar.

A retomada registrou a proteção da ficha de `ea9c56f` e aplicou em `e5040f5` proteções à prévia e aos aniversários, com nova tentativa, indicação de carregamento e ajustes de foco. Total **42/100**, próximo **R9-COM-043**. A suíte isolada passou **310/310** e a verificação de sintaxe passou. Faltam repetir no Chrome as jornadas afetadas nesta retomada, concluir a auditoria axe, comparar as capturas e completar o inventário. Nenhum nome de ação ou tela existente mudou.

O lote de Campanhas avançou para **61/100**, de R9-COM-043 a R9-COM-061. O commit `044da23` protege a seleção de público, as buscas e as janelas do assistente. O commit `fb90dce` resolve a dependência do relógio no teste de adiamento seletivo. A suíte passou em **310/310** com Supabase fictício, e o Chrome passou em **4/4** combinações de tema e largura no roteiro `ee3c8a5`. O navegador só permitiu GET e HEAD no mock local. Os nomes das ações existentes foram preservados. Falta completar 39 melhorias a partir de R9-COM-062, cobrir as jornadas restantes, concluir axe-core e o inventário por controle, e montar os comparativos de capturas. Para Claude, Agenda e Atendimento ficam na outra cópia e o manual deve refletir o agrupamento em Mais. Para João, permanece a dúvida sobre manter Campanhas nesse menu sem evidência recente de uso por rota.

## Fechamento dos lotes finais

**100/100** entradas consecutivas no MELHORIAS. Réguas e prazos por serviço (062–081) em `41fc2d5`, registro em `f85ffd7`. Clientes e Satisfação (082–100) em `d6e492a`.

| Área | Controles e fonte de evidência | Decisão |
| --- | --- | --- |
| Início | Saúde do WhatsApp, prévia, indicadores, fila e Rodar agora. A rodada 1 registrou batidas do carteiro e falha de chave. O agregado não identifica cliques nesses controles. | Manter Saúde e prévia. Colocar indicadores e Rodar agora nos menus de expansão. |
| Mensagens | Busca, status, régua, período, limpar filtros, exportar CSV, cancelar, adiar, reenfileirar e encaminhar. O histórico comprova registros da fila. Uso manual por ação indeterminado. | Manter busca e lista. Agrupar filtros complementares. Preservar as ações com suas permissões. |
| Réguas | Ligar, editar mensagem, inserir variável, IA, prévias, relatório, teste para si, salvar, descartar, prazo por serviço e aniversários. A rodada 1 mediu quatro mensagens de pós-venda em 30 dias. Uso por controle indeterminado. | Manter as réguas e preservar ações de revisão. |
| Envio | Hora, janela, intervalos, limites por minuto/hora/dia, domingo, horário comercial, pausa geral e telefone de teste. Uso recente por campo indeterminado. | Manter. Afetam cadência e proteção contra envios fora da janela. |
| Campanhas | Nova campanha, prévia/seleção de público, segmento, modelo, IA, teste para si, envio programado, aprovação e cancelamento. Uso recente por controle indeterminado. | Manter o assistente e agrupar a tela em Mais. |
| Clientes | Busca, ficha, aniversário, importar planilha, PARAR, voltar a receber, tarefa e atalhos para CRM, Agenda e Conversa. Uso recente por controle indeterminado. | Agrupar a tela em Mais. Preservar consentimento e caminhos entre apps. |
| Satisfação | Busca, escolha satisfeito/insatisfeito, nota, comentário, registro e exclusão com permissão. Uso recente por controle indeterminado. | Agrupar a tela em Mais. Preservar entrada de retorno do WhatsApp. |
| Relatórios | Período, régua, volume, resposta, agendamento e exportação. O volume medido na rodada 1 não comprova a abertura dos relatórios. | Manter sob as ações da régua ou do histórico. |

A classificação por controle ficou como **não dá para saber** quando havia apenas medidas de atividade do carteiro. Os números disponíveis vieram do levantamento da rodada 1. Não houve nova consulta ao banco.

| Nome anterior | Nome atual |
| --- | --- |
| Campanhas, Clientes e Satisfação na navegação principal | Mesmas telas dentro de Mais |
| Rodar agora no Início | Rodar agora em Mais ações |
| Indicadores detalhados no Início | Mais indicadores |

Os dois lotes finais passaram em 310/310 com URL de Supabase local fictícia e chave de teste. O comando padrão encontrou bloqueio de subprocessos (`spawn EPERM`). Foram executados os 16 arquivos da suíte individualmente com `node --test --test-isolation=none`. `npm.cmd --prefix apps/comunicar run check` passou.

### Destaques e capturas disponíveis

| Melhoria | Captura depois em apps/comunicar/qa-out/r9 |
| --- | --- |
| Painel inicial mais enxuto | `depois-375-claro.png` |
| Indicadores detalhados sob expansão | `depois-1440-escuro.png` |
| Campanhas em Mais | Roteiro `navegador-campanhas-r9.mjs` |
| Avanço bloqueado com prévia de público desatualizada | Mesmo roteiro |
| Rascunho de réguas descartado de verdade | `reguas-375-claro.png` |
| Alternadores de envio com nomes acessíveis | `reguas-1440-escuro.png` |
| Contagem de clientes acompanha a busca | `clientes-375-claro.png` |
| Controles de consentimento preservados | `clientes-1440-escuro.png` |
| Seleção de satisfação anunciada | `satisfacao-375-claro.png` |
| Foco volta ao campo obrigatório em Satisfação | `satisfacao-1440-escuro.png` |

As referências de antes disponíveis são `qa-out/r1-375.png` e `qa-out/r1-1440.png`. A comparação pareada de todas as telas, a auditoria axe-core e a repetição integral das jornadas da rodada 1 ficaram pendentes.

Para João, validar se Campanhas pode ficar em Mais. Para Claude, integrar os commits locais, atualizar os caminhos do manual e manter a verificação da chave do WhatsApp no Atendimento. Agenda e Atendimento estão com Claude na outra cópia. Nenhum push ou deploy.

Chrome final passou em 4/4 combinações (375 e 1440 px, claro e escuro) no roteiro navegador-clientes-r9.mjs. Conferidos descarte de rascunho, contagem após busca, foco em Satisfação, estado acessível da seleção e ausência de rolagem lateral. O Chrome só permitiu GET e HEAD no mock local.
