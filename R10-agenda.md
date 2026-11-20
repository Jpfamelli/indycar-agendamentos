# Rodada 10 da Agenda

4 de 125 melhorias registradas em `MELHORIAS.md`.

A suíte padrão passou de 564/564 para 565/565 com `npm.cmd test` e isolamento por arquivo. A tentativa em processo único teve interferência entre testes.

- `5c99a4b` — corpos JSON que não sejam objetos são rejeitados antes de gravar configurações. Uma lista recebia HTTP 200 e passou a receber HTTP 400. O arquivo de regressão passou de 12 aprovados e 1 falha para 13 aprovados.
- `97667b3` — o nome da oficina mantém os acentos quando a requisição divide um caractere entre blocos. O teste retornava `Oficina S��o José` antes. Depois, os 14 testes de `tests/r9-agenda-servidor.test.mjs` passaram com `--test-isolation=none` e servidor fictício.

Pendências para a frente A: modo presença em 375 px, medição de `/confirmar/`, cobertura de R9-AGE-014 a 036, comparativos visuais e medições de desempenho. Nenhum rótulo de tela mudou nestes commits.

No commit `77ce05a`, R10-AGE-003 passou de HTTP 200 com gravação no banco fictício para HTTP 400 sem gravação. Suíte completa com `npm.cmd test` passou 566/566.

No commit `b176402`, R10-AGE-004 falhou enquanto o corpo só com espaços retornava uma orientação sobre o nome da oficina. Passou quando a API orientou a enviar JSON válido, sem gravar no banco fictício. A suíte completa passou 567/567.
