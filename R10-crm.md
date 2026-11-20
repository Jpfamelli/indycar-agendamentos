# Rodada 10 do CRM

11 de 125 melhorias registradas em `apps/crm/MELHORIAS.md`. O commit `387f5ac` preserva acentos no cadastro de contatos quando o JSON chega em blocos HTTP (`apps/crm/testes/r10-json.test.cjs`).

A regressão com banco fictício gravava `Jo��o` antes e grava `João` depois. A suíte completa passou de 328/328 para 329/329, patamar confirmado nesta retomada.

Pendências para a frente A: ampliar a cobertura da rodada 9 e repetir as jornadas de cortesia, cancelamento, fechamento em lote e perda de rede ao mover etapa. Comparativos visuais e medições de desempenho seguem pendentes.

“Novo Lead” e “Leads novos” aguardam decisão do João. Nenhum rótulo de tela mudou neste commit.

No commit `77ce05a`, R10-CRM-002 passou de HTTP 201 com gravação no banco fictício para HTTP 400 sem gravação. Suíte completa com `npm.cmd --prefix apps/crm test` passou 330/330.

No commit `802154f`, R10-CRM-003 passou de HTTP 201 com gravação para HTTP 415 sem gravação quando a requisição declara uma codificação incompatível. A suíte passou 331/331 com Supabase fictício.

O commit `4911a42` valida telefone com letras, valor booleano, placa em lista e motivo de perda em lista. As quatro regressões falharam antes e passaram depois. A suíte do CRM passou 335/335 com Supabase fictício.

Agenda e Atendimento ficaram sob responsabilidade do Claude. A rodada 10 do CRM continua em R10-CRM-012.

O commit `60fc802` valida quatro campos do perfil. Os testes retornavam HTTP 200 antes e passaram a exigir HTTP 400 preservando cada campo. Su?te isolada: 339/339. Chrome, axe-core e medi??es de desempenho seguem pendentes nesta rodada.
