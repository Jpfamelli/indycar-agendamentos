# Rodada 10 do CRM

1 de 125 melhorias registradas. O commit 387f5ac corrige a leitura de UTF-8 nos cadastros. A regressão por HTTP com banco fictício gravava Jo��o antes e grava João depois. Suíte completa de 328/328 para 329/329 com npm.cmd --prefix apps/crm test.

| Medição | Antes | Depois |
| --- | --- | --- |
| Nome gravado ao dividir o caractere acentuado | Jo��o | João |

O comparativo é de comportamento. Ainda faltam métricas de desempenho e capturas. Nenhum rótulo de tela foi alterado.

Para o Claude: 124 linhas da meta do CRM seguem pendentes, incluindo as provas de regressão da R9 e as medições de desempenho. Novo Lead e Leads novos aguardam decisão do João. Nenhum deploy, acesso ao Supabase real ou envio de WhatsApp foi executado.
