# Rodada 9 · Atendimento

| Área | Prova de uso disponível | Decisão |
| --- | --- | --- |
| Conversas, busca, filtros e resposta | A rodada 1 reproduziu a triagem no mock. Uso por filtro: não dá para saber. | Manter triagem à vista e reunir filtros adicionais em Mais filtros. |
| Atalhos, relatórios, tarefas, equipe e auditoria | Uso recente por controle: não dá para saber. | Manter. |
| Integrações WhatsApp e CodeWords | O diagnóstico da rodada 1 registrou a chave recusada. | Manter o aviso e indicar onde conferir a conexão. |

O resumo Mais filtros é novo. Os filtros mantêm os nomes, com remoção dos emojis nos itens recolhidos.

A suíte completa executa 411 testes. Capturas antigas da rodada 1 estão em `apps/atendimento/qa-out/`.

Para João, confirmar na prévia quais filtros devem voltar à primeira linha. Para Claude, conferir a navegação da Central ao integrar.

Lote 1 em `9301455`. 12 melhorias registradas no MELHORIAS.

A rodada 1 mediu 440 conversas em 30 dias, 259 sem lead vinculado pelo telefone.

Chrome com mock e tráfego externo bloqueado. O painel abre por clique e teclado e cabe em 375 e 1440 px nos temas claro e escuro. As capturas depois estão em `apps/atendimento/qa-out/r9/`. Faltam comparação antes/depois, axe e jornadas completas.

A segunda passagem registrou mais cinco melhorias no histórico de conversas em `a3d3634`, totalizando **17/150**. A suíte passou de 411 para 412 testes, todos verdes. Retomar em R9-ATD-018.

A evidência disponível ainda permite classificar o uso de conversas, mas o uso de cada botão, ajuste e relatório permanece indeterminado. Validar os filtros mais usados na prévia antes de remover controles. O histórico preserva os nomes de botões e telas.
