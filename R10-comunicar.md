# Rodada 10 · Comunicar

Entrega parcial. 27 de 100 melhorias registradas. Próximo número: R10-COM-028.

A suíte de referência passou 310/310 com isolamento padrão do Node. O modo sem isolamento fez os dublês dos testes compartilharem estado, por isso a conferência foi repetida com os subprocessos padrão.

## Para outra frente

Faltam a cobertura dos 69 comportamentos R9-COM-032 a R9-COM-100 e 73 melhorias para a meta do app. Agenda e Atendimento seguem com Claude.

## Para o João

Sem mudanças de nomes ou medições de desempenho neste lote. Os limites de cargo e descrição devolvem erro em vez de salvar conteúdo cortado.

## Chrome

O roteiro compartilhado passou em 375 e 1440 px, nos dois temas, com mocks e bloqueio de rede externa. Cobriu painel recolhível, resposta atrasada, falha de atualização e período inválido.

## Identidade dos mocks

O roteiro compartilhado agora consulta uma rota exclusiva de cada mock, com timeout e bloqueio de redirecionamento, antes de iniciar o Chrome. O teste novo falhou no c?digo anterior e passou no commit `4cbe2d9`. A su?te passou de 310/310 para 311/311. O roteiro foi repetido ap?s o commit e passou nos oito cen?rios: 375 e 1440 px, tema claro e escuro, Atendimento e Comunicar. Os dois servidores eram mocks locais e a intercepta??o de rede ficou ativa.

## Lote retomado

Commit `4debb38` cobre R10-COM-002 e 003. Os dois testes em `scripts/testes-r10-prontidao.mjs` falharam antes e passaram depois. A suíte com isolamento padrão passou de 311 para 313 testes, todos verdes. A execução com isolamento padrão exigiu permissão local para os subprocessos do Node.

O checklist mantém o aviso quando a data do último teste de envio ou da rodada do carteiro ainda está no futuro. Nenhum nome de tela ou controle mudou. A cobertura dos 69 comportamentos da rodada 9 segue pendente. Não houve medição de desempenho neste lote.

## Validação de perfil

O commit `c2b65f6` cobre R10-COM-004 a 008. Os cinco testes de perfil falharam antes e passaram depois. A suíte completa passou de 313 para 318 testes com o isolamento padrão do Node. Cargo, telefone e cor aceitam limpar o campo. Nenhuma chamada a serviços externos foi necessária para estes testes.

## Continuação

- `c7fa7c2` cobre R10-COM-025 a 027. Resultados avançados, relatório de uma régua e comparação entre réguas agora recusam datas inválidas antes da consulta. Os três testes falharam antes e passaram depois. A suíte com o isolamento padrão passou com 337 testes, e `npm.cmd run check` passou.

- `782301e` cobre R10-COM-019 a 024. A reabordagem valida o mapa e os textos individuais, a data de envio, os IDs de orçamento e os motivos. A triagem valida o tipo da opção que delimita o cancelamento. As seis regressões de API falharam antes da correção e passaram depois.
- A suíte passou de 328 para 334 testes. Cada arquivo da suíte rodou em um processo próprio porque o ambiente devolveu `spawn EPERM` ao usar o isolamento automático. `npm.cmd run check` passou. Banco e WhatsApp simulados. Chrome e medições de desempenho pendentes neste lote.

- `3a4944f` cobre R10-COM-009 a 012. O perfil valida corpo, limite do cargo, caracteres do telefone e tipos das preferências de notificação.
- `5d99dff` cobre R10-COM-013 a 018. A API valida título, descrição, prioridade e prazo de tarefas e exige valor booleano explícito no consentimento do cliente. O teste legado continua conferindo que chaves desconhecidas são ignoradas. Um valor inválido de uma preferência reconhecida agora recebe erro.
- A suíte integral passou de 318 para 328 testes. As novas regressões falharam antes das correções e passaram depois. `npm run check` passou. Os testes de API usaram banco e WhatsApp simulados. O Chrome não foi reexecutado nesta continuação.
