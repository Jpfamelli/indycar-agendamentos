# Rodada 10 · Atendimento

Entrega parcial. 6 de 150 melhorias registradas.

| Melhoria | Antes | Depois |
| --- | --- | --- |
| R10-ATD-001 | Borda lateral de 3 px em tarefas e no cartão atrasado do funil | Borda de 1 px, com cor de estado preservada |

O teste `test/r10-cartoes.test.js` falhou antes da mudança (0/1) e passou depois. A suíte passou de 441/441 para 442/442 com `NODE_OPTIONS=--test-isolation=none`, pois o ambiente bloqueou os subprocessos de teste.

Nenhum nome de botão, aba ou tela mudou. Sem medições de desempenho ou correções de segurança neste lote.

## Para outra frente

Faltam 144 melhorias. O roteiro compartilhado `apps/comunicar/scripts/navegador-r9-b2.mjs`, as confirmações, a logo no tema claro e a revisão dos roteiros antigos seguem pendentes.

## Para o João

As evidências antes/depois deste ajuste vieram do teste automatizado de CSS. A conferência visual é uma etapa separada.

## Chrome

Com mock local e rede externa bloqueada, o roteiro compartilhado passou em 375 e 1440 px, nos dois temas. O seletor de Mais filtros continua no HTML e o timeout relatado não se reproduziu nessa execução.

O roteiro próprio `roteiro-r9.cjs` passou 161/164. Três verificações da conversa em 375×812 falharam juntas: a área de mensagens mediu 0 px, a barra de telas ficou visível e o aviso de WhatsApp da conversa ficou oculto. Em 375×667 os três pontos passaram. Capturas posteriores em `apps/atendimento/qa-out/r9/`.

## Continuação

A barreira do roteiro R9 restringe a rede à origem exata do mock e permite imagens embutidas. O teste novo falhou antes da inclusão da barreira e passou com a implementação. Suíte do Atendimento: 443/443 com `node --test --test-isolation=none`. A barreira nova foi verificada pelo teste unitário e o roteiro com mock passou 164/164 no Chrome. As sete verificações de 375×812 passaram. As três falhas anteriores ficam registradas acima e não se reproduziram nesta execução.

## Lote retomado

Commit `eb742d1` cobre R10-ATD-003 a 006. Os quatro testes em `test/r10-validacao.test.js` falharam antes e passaram depois. A suíte passou de 443 para 447 testes, todos verdes com `node --test --test-isolation=none`.

A auditoria omite objetos além do limite de profundidade, campos inteiros recusam tipos indevidos, datas impossíveis são rejeitadas e o limitador para de recomendar espera após a janela expirar. Este lote foi verificado em testes locais. Nenhum nome de tela ou controle mudou. Faltam a conferência visual da logo, a migração das confirmações e a reexecução dos roteiros antigos. Não houve medição de desempenho.
