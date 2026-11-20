# Rodada 9 · CRM

Entrega parcial. Lote 8c60a72, 10 registros no MELHORIAS. Suíte 323/323 antes e depois do ajuste do diálogo. O Chrome confirmou Concluir em 375 e 1440 px, nos dois temas, com mock local e bloqueio de todas as escritas e de destinos externos. Capturas disponíveis em qa-out/r9/crm-concluir-*.png.

| Antes | Depois |
| --- | --- |
| Dashboard | Painel |
| Leads | Contatos |
| + Novo Lead | + Novo contato |

O menu Mais preserva as páginas secundárias. Uso por rota e decisão de corte continuam por conferir. Para o Claude, faltam a matriz completa de jornadas e axe-core, as capturas comparativas, o inventário com evidência e os demais lotes. Para o João, confirmar a posição das telas secundárias depois da prévia.

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
