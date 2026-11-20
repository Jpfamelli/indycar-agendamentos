# Rodada 9 · CRM

Meta concluída com 125 melhorias numeradas no MELHORIAS do CRM. A suíte passou de 323/323 na abertura da rodada para 328/328 no fechamento, com dados fictícios. O Chrome confirmou Concluir em 375 e 1440 px, nos dois temas, com mock local e bloqueio de destinos externos. As capturas estão em `qa-out/r9/crm-concluir-*.png`.

| Antes | Depois |
| --- | --- |
| Dashboard | Painel |
| Leads | Contatos |
| + Novo Lead | + Novo contato |

O menu Mais concentra as páginas secundárias. O inventário abaixo registra a evidência agregada disponível e indica onde o uso por comando é indeterminado.

## Segundo lote parcial

`faf90d1` acrescenta 5 melhorias, para 15/125 no CRM. Suíte 323/323. A próxima entrada é R9-CRM-016.

| Antes | Depois |
| --- | --- |
| Todos os status | Todas as etapas |
| Novo lead | Novo contato |
| Lead | Contato |

Sem rodada adicional de Chrome neste lote.

## Terceiro lote parcial

O commit `9299314` leva o CRM a 19/125. Suíte local 323/323. Próxima entrada R9-CRM-020.

| Antes | Depois |
| --- | --- |
| Filtrar leads | Filtrar contatos |
| Buscar leads (leitor de tela) | Buscar contatos (leitor de tela) |

Validação de leitor de tela e capturas deste lote ficam pendentes.

## Quarto lote

O commit `254ecdc` adiciona 10 melhorias e leva o app a 29/125. Suíte local 323/323 com Supabase fictício. Próxima entrada R9-CRM-030. A conferência de navegador e leitor de tela deste lote segue pendente.

| Antes | Depois |
| --- | --- |
| Status (cadastro) | Etapa |


## Quinto lote

O commit `af408bd` leva o CRM a 39/125. Suíte CRM 323/323 com Supabase fictício. Próxima entrada R9-CRM-040. A validação de teclado virtual e leitor de tela segue pendente.

A rodada 1 registrou 242 tarefas vencidas, 101 sem dono. Esse volume sustenta manter a fila e a atribuição. A evidência não identifica a ação ou tela de origem de cada tarefa.

## Sexto lote

16 melhorias registradas, total de 55/125. Código em `ab25d95`. Suíte local 323/323 com Supabase fictício. Próxima entrada R9-CRM-056.

| Antes | Depois |
| --- | --- |
| Últimos leads | Contatos recentes |
| Novo Lead (título inicial) | Novo contato |
| Leads sem dono | Contatos sem responsável |
| 1. Quais leads | 1. Contatos a distribuir |
| Performance por canal (últimos 7 dias) | Resultados por canal nos últimos 7 dias |
| Detalhe interno | Nota interna |

As alterações deste lote ainda precisam de conferência de navegador. A prévia deve aferir se os títulos de distribuição e as instruções de campanha são suficientemente claros para a equipe.

## Sétimo lote

Três melhorias em `2bb6191`, total de 58/125. A suíte com banco fictício passou de 323/323 para 325/325. A próxima entrada é R9-CRM-059.

## Inventário inicial e decisões

O levantamento de R1-banco.md usa dados agregados. Sem acesso ao MCP do Supabase e sem telemetria de rota, a evidência abaixo confirma atividade dos registros, quando indicada. O uso dos botões e das abas individuais permanece indeterminado.

| Tela ou grupo de ações | Classe e evidência | Decisão |
| --- | --- | --- |
| Contatos, filtros, edição e ficha | Uso da operação confirmado pelos registros de leads. Uso individual indeterminado. | Manter como acesso direto. |
| Funil, mudança de etapa, perda e conclusão | Uso da operação confirmado por 57 perdas e 134 registros no levantamento de valores. Origem da mudança indeterminada. | Manter o funil e o histórico. |
| Painel, valores pendentes e tarefas | Há 130 registros sem valor pago e 242 tarefas vencidas abertas, 101 sem responsável. Uso da tela indeterminado. | Manter o acesso direto. |
| Hoje e atualização da fila | Há tarefas abertas e contatos sem acompanhamento. Uso da fila indeterminado. | Manter acesso direto. |
| Clientes, aniversário, preferências e histórico | Uso por ação indeterminado. Preferências têm efeito em outros apps. | Manter a ficha e as preferências. |
| Origem, integração de anúncios e resultado por canal | Os relatórios usam a atribuição compartilhada. Uso por tela indeterminado. | Manter via Mais. |
| Equipe, metas, distribuição, relatórios e Resumo do dono | Há tarefas sem responsável. Uso de cada painel e comando indeterminado. | Manter via Mais para os papéis com acesso. |
| Catálogo de serviços e filtro de disponibilidade | O catálogo é compartilhado com a IA. Uso da tela indeterminado. | Manter via Mais. |
| IA, triagem e resumo semanal | Uso recente indeterminado. As sugestões e o histórico dependem das permissões já existentes. | Manter os atalhos da ficha e a tela via Mais. |
| Minha conta, Equipe e sistema | Uso por configuração indeterminado. Inclui perfil, MFA, sessão, notificações e acesso da equipe. | Manter os controles de conta e segurança. |

Para o João, conferir na prévia se Mais é suficiente para quem usa distribuição, metas ou integração todos os dias.

## Oitavo lote

12 melhorias em `bba7a4b`, total de 70/125. Suíte 325/325 com banco fictício. Próxima entrada R9-CRM-071. Concluir foi reconferido em 375 e 1440 px, claro e escuro, com todas as escritas e destinos externos bloqueados.

| Antes | Depois |
| --- | --- |
| Leads sem dono (título da tela) | Distribuir contatos |
| Veículos leves e Todos os veículos (escopo no catálogo) | Carros leves e Todos os carros |

## Nono lote

13 melhorias em `1151ad1`, total de 83/125. Suíte 325/325. Próxima entrada R9-CRM-084.

| Antes | Depois |
| --- | --- |
| Ver lead por lead | Ver contato por contato |

## Décimo lote

13 melhorias em `be91453`, total de 96/125. Suíte 325/325. Próxima entrada R9-CRM-097.

O Chrome confirmou 14 telas sem rolagem lateral, em quatro combinações de tamanho e tema, com redução de movimento, mock local e bloqueio de escritas e destinos externos. A prova de largura, os filtros do catálogo e as duas seções de Configurações estão em qa-out/r9-crm-matriz-final.txt. O catálogo recebeu uma resposta local fictícia interceptada. As capturas do catálogo estão em qa-out/r9/crm-catalogo-*.png.

## Décimo primeiro lote

14 melhorias em `e6df968`, total de 110/125. Suíte 328/328 com banco fictício, incluindo regressões de data, hora e prioridade de tarefas. Próxima entrada R9-CRM-111.

| Antes | Depois |
| --- | --- |
| abrir lead (atalho de tarefa) | Abrir contato |

## Fechamento

O último lote acrescenta R9-CRM-111 a R9-CRM-125. Os commits `cbbb0a3`, `d71c339`, `445d1bd` e `59b1ddf` cobrem contraste, nomes acessíveis, atalhos, tabelas com foco, cartões do Funil e estados do rodízio. O ajuste de foco da tabela de clientes em `445d1bd` integra R9-CRM-114. Os registros de R9-CRM-097 a R9-CRM-110 referenciam o commit `e6df968`.

O Chrome confirmou a criação de contato perdido com motivo Outro e observação em 375 e 1440 px, claro e escuro. Nas quatro combinações, o servidor fictício recebeu também R$ 125,50 no fechamento com valor e zero ao escolher Não sei agora. Somente o POST local de criação de contato foi permitido nesse roteiro. A geometria do diálogo Concluir foi verificada separadamente. O log está em `qa-out/r9-crm-jornadas-final.txt`.

O axe-core encontrou zero violações sérias ou críticas nas 56 verificações das 14 telas, mais quatro verificações da prévia de Distribuir. A mesma matriz confirmou a ausência de rolagem lateral na página. O log está em `qa-out/r9-crm-axe-final.txt`. Os roteiros e as imagens ficam em `qa-out/` nesta cópia.

### Comparativos

Os arquivos seguem `qa-out/r9/{antes,depois}-crm-<tela>-375-claro.png`.

| Tela | Arquivo por tela | Mudança em destaque |
| --- | --- | --- |
| Painel | dashboard | Nova tentativa ao carregar tarefas |
| Contatos | leads | Lista com busca e filtros mais claros |
| Hoje | hoje | Estados de carregamento, vazio e erro |
| Clientes | clientes | Busca protegida de respostas fora de ordem |
| Funil | pipeline | Cartões e navegação por teclado |
| Origem | origem | Resultados por canal com tabela navegável |
| Distribuir contatos | distribuir | Rodízio com bloqueio e orientação de erro |
| Relatórios | relatorios | Exportação bloqueada em intervalo inválido |
| Serviços | servicos | Filtros de catálogo com estado selecionado |
| Configurações | configuracoes | Seções de conta e sistema identificáveis |

| Antes | Depois |
| --- | --- |
| Todos os leads abertos têm dono | Todos os contatos abertos têm responsável |
| Busca global (nome acessível) | Buscar tudo |

### Para o Claude

Agenda e Atendimento seguem na outra cópia. Usar a tabela de nomes para atualizar o manual. No CRM, permanecem sem repetição de ponta a ponta no navegador a cortesia, o cancelamento, o fechamento em lote e a queda de rede ao mover etapa. A validação pós-integração e a medição de uso por ação também ficam abertas. A tabela de inventário agrupa ações por tela porque os dados disponíveis não distinguem cada comando.

### Para o João

Na prévia, confirmar se distribuição, metas e integrações devem ficar em Mais para quem precisa delas todos os dias. Sem contagem por comando, o uso das páginas secundárias segue indeterminado.
