# Rodada 10 · Atendimento

Entrega parcial. 1 de 150 melhorias registradas.

| Melhoria | Antes | Depois |
| --- | --- | --- |
| R10-ATD-001 | Borda lateral de 3 px em tarefas e no cartão atrasado do funil | Borda de 1 px, com cor de estado preservada |

O teste `test/r10-cartoes.test.js` falhou antes da mudança (0/1) e passou depois. A suíte passou de 441/441 para 442/442 com `NODE_OPTIONS=--test-isolation=none`, pois o ambiente bloqueou os subprocessos de teste.

Nenhum nome de botão, aba ou tela mudou. Sem medições de desempenho ou correções de segurança neste lote.

## Para outra frente

Faltam 149 melhorias. O roteiro compartilhado `apps/comunicar/scripts/navegador-r9-b2.mjs`, as confirmações, a logo no tema claro e a revisão dos roteiros antigos seguem pendentes.

## Para o João

As evidências antes/depois deste ajuste vieram do teste automatizado de CSS. A conferência visual é uma etapa separada.

## Chrome

Com mock local e rede externa bloqueada, o roteiro compartilhado passou em 375 e 1440 px, nos dois temas. O seletor de Mais filtros continua no HTML e o timeout relatado não se reproduziu nessa execução.

O roteiro próprio `roteiro-r9.cjs` passou 161/164. Três verificações da conversa em 375×812 falharam juntas: a área de mensagens mediu 0 px, a barra de telas ficou visível e o aviso de WhatsApp da conversa ficou oculto. Em 375×667 os três pontos passaram. Capturas posteriores em `apps/atendimento/qa-out/r9/`.
