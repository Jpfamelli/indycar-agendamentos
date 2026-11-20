# Rodada 10 do CRM

45 de 125 melhorias registradas em `apps/crm/MELHORIAS.md`. O commit `387f5ac` preserva acentos no cadastro de contatos quando o JSON chega em blocos HTTP (`apps/crm/testes/r10-json.test.cjs`).

A regressão com banco fictício gravava `Jo��o` antes e grava `João` depois. A suíte completa passou de 328/328 para 329/329, patamar confirmado nesta retomada.

Pendências para a frente A: ampliar a cobertura da rodada 9 e repetir as jornadas de cortesia, cancelamento, fechamento em lote e perda de rede ao mover etapa. Comparativos visuais e outras medições de desempenho seguem pendentes.

“Novo Lead” e “Leads novos” aguardam decisão do João. Nenhum rótulo de tela mudou neste commit.

No commit `77ce05a`, R10-CRM-002 passou de HTTP 201 com gravação no banco fictício para HTTP 400 sem gravação. Suíte completa com `npm.cmd --prefix apps/crm test` passou 330/330.

No commit `802154f`, R10-CRM-003 passou de HTTP 201 com gravação para HTTP 415 sem gravação quando a requisição declara uma codificação incompatível. A suíte passou 331/331 com Supabase fictício.

O commit `4911a42` valida telefone com letras, valor booleano, placa em lista e motivo de perda em lista. As quatro regressões falharam antes e passaram depois. A suíte do CRM passou 335/335 com Supabase fictício.

Agenda e Atendimento ficaram sob responsabilidade do Claude. A rodada 10 do CRM continua em R10-CRM-046.

O commit `60fc802` valida quatro campos do perfil. Os testes retornavam HTTP 200 antes e passaram a exigir HTTP 400 preservando cada campo. Suíte isolada: 339/339. A matriz de Chrome e a medição feita nesta retomada constam abaixo.
O commit `e8f518b` rejeita papel desconhecido, alteração de acesso sem booleano, senha temporária acima do limite e opção de troca de senha com tipo inválido. As cinco regressões retornavam 200 ou 201 antes. Agora retornam 400, preservam os perfis da equipe e não geram auditoria de alteração. A suíte isolada passou de 339/339 para 344/344.

No commit 988ede8, seis regressões de investimento falharam antes da validação. Depois, as seis rejeitaram os dados inválidos com HTTP 400, sem gravar métricas ou auditoria. Suíte isolada 350/350.

No commit f40c469, as três regressões de integração passaram a retornar HTTP 400 e a preservar a configuração e a auditoria no Supabase fictício. Suíte completa 353/353.

Chrome com mock local e interceptação de toda conexão externa: 12 verificações passaram em 375 e 1440 px, nos temas claro e escuro. Foram testados cadastro como perdido com motivo Outro e fechamento com valor pago ou pendente. Log local em apps/crm/qa-out/r10-jornadas.log. A cobertura dessas jornadas não inclui cancelamento do diálogo, fechamento em lote ou perda de rede ao mover a etapa.

Os commits 4d738e7 e a139891 cobrem data de cadastro, valores monetários e tipos de título, descrição, prioridade e prazo das tarefas. As seis regressões falharam antes da correção e passaram depois, com Supabase fictício. A suíte do CRM passou de 344/344 para 360/360 nesta retomada.

| Operação medida no Supabase fictício | Antes | Depois |
| --- | ---: | ---: |
| Operações na tabela de configuração ao salvar uma integração | 2 | 1 |

O teste 4d81988 mediu a mudança no commit f40c469. O axe-core executou 60 verificações sem violações sérias ou críticas no Chrome, a 375 e 1440 px, em claro e escuro. A matriz usou somente leituras no mock local, com tráfego externo bloqueado. Log local em apps/crm/qa-out/r10-axe-matriz.log.

Faltam 80 melhorias para a meta. Agenda e Atendimento ficam com Claude, na outra cópia. A decisão sobre os termos “Novo Lead” e “Leads novos” segue com João.

Os commits 96474a4, 293e192 e dc312ee completam as melhorias 032 a 045. O lote valida cadastro da equipe, metas, rodízio, auditoria de exportação, automações e ações da IA. As seis regressões de IA retornavam HTTP 200 antes da correção e passaram a retornar 400, preservando as tarefas e ações fictícias. A suíte completa passou de 360/360 para 374/374 com Supabase fictício. A matriz anterior de Chrome se refere às melhorias até 031.
