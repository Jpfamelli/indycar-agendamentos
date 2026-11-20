# Rodada 10 do CRM

1 de 125 melhorias registrada em `apps/crm/MELHORIAS.md`. O commit `387f5ac` preserva acentos no cadastro de contatos quando o JSON chega em blocos HTTP (`apps/crm/testes/r10-json.test.cjs`).

A regressão com banco fictício gravava `Jo��o` antes e grava `João` depois. A suíte completa passou de 328/328 para 329/329, patamar confirmado nesta retomada.

Pendências para a frente A: ampliar a cobertura da rodada 9 e repetir as jornadas de cortesia, cancelamento, fechamento em lote e perda de rede ao mover etapa. Comparativos visuais e medições de desempenho seguem pendentes.

“Novo Lead” e “Leads novos” aguardam decisão do João. Nenhum rótulo de tela mudou neste commit.
