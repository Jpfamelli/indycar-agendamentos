# Rodada 10 da Agenda

2 de 125 melhorias registradas em `MELHORIAS.md`.

A suíte padrão passou de 564/564 para 565/565 com `npm.cmd test` e isolamento por arquivo. A tentativa em processo único teve interferência entre testes.

- `5c99a4b` — corpos JSON que não sejam objetos são rejeitados antes de gravar configurações. Uma lista recebia HTTP 200 e passou a receber HTTP 400. O arquivo de regressão passou de 12 aprovados e 1 falha para 13 aprovados.
- `97667b3` — o nome da oficina mantém os acentos quando a requisição divide um caractere entre blocos. O teste retornava `Oficina S��o José` antes. Depois, os 14 testes de `tests/r9-agenda-servidor.test.mjs` passaram com `--test-isolation=none` e servidor fictício.

Pendências para a frente A: modo presença em 375 px, medição de `/confirmar/`, cobertura de R9-AGE-014 a 036, comparativos visuais e medições de desempenho. Nenhum rótulo de tela mudou nestes commits.
