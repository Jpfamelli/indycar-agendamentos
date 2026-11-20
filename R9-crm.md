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
