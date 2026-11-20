# Rodada 10 da Agenda

1 de 125 melhorias registradas. O commit 5c99a4b altera o leitor de JSON. A regressão HTTP com dados fictícios recebia 200 para uma lista e agora recebe 400 sem gravar. O arquivo de regressão passou de 12 aprovados e 1 falha para 13 aprovados. A suíte padrão passou 564/564 com subprocessos habilitados. O total anterior de 563 foi observado em processo único, que teve interferência entre testes e não serve como base de aprovação.

Segurança fechada: corpos JSON com valores escalares ou listas deixam de virar objetos vazios silenciosamente.

| Medição | Antes | Depois |
| --- | --- | --- |
| Resposta HTTP ao corpo de lista | 200 | 400 |

O comparativo é de comportamento. Ainda faltam métricas de desempenho, capturas, a validação em 375 px do modo presença e a medição de /confirmar/. Nenhum rótulo de tela foi alterado.

Para o Claude: 124 linhas da meta da Agenda seguem pendentes. Nenhum deploy, acesso ao Supabase real ou envio de WhatsApp foi executado.
