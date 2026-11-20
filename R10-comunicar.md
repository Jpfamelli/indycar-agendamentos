# Rodada 10 · Comunicar

Entrega parcial. 3 de 100 melhorias registradas.

A suíte de referência passou 310/310 com isolamento padrão do Node. O modo sem isolamento fez os dublês dos testes compartilharem estado, por isso a conferência foi repetida com os subprocessos padrão.

## Para outra frente

Faltam a cobertura dos 69 comportamentos R9-COM-032 a R9-COM-100 e 97 melhorias para a meta do app.

## Para o João

Sem mudanças de nomes, correções de segurança ou medições de desempenho neste app.

## Chrome

O roteiro compartilhado passou em 375 e 1440 px, nos dois temas, com mocks e bloqueio de rede externa. Cobriu painel recolhível, resposta atrasada, falha de atualização e período inválido.

## Identidade dos mocks

O roteiro compartilhado agora consulta uma rota exclusiva de cada mock, com timeout e bloqueio de redirecionamento, antes de iniciar o Chrome. O teste novo falhou no c?digo anterior e passou no commit `4cbe2d9`. A su?te passou de 310/310 para 311/311. O roteiro foi repetido ap?s o commit e passou nos oito cen?rios: 375 e 1440 px, tema claro e escuro, Atendimento e Comunicar. Os dois servidores eram mocks locais e a intercepta??o de rede ficou ativa.

## Lote retomado

Commit `4debb38` cobre R10-COM-002 e 003. Os dois testes em `scripts/testes-r10-prontidao.mjs` falharam antes e passaram depois. A suíte com isolamento padrão passou de 311 para 313 testes, todos verdes. A execução com isolamento padrão exigiu permissão local para os subprocessos do Node.

O checklist mantém o aviso quando a data do último teste de envio ou da rodada do carteiro ainda está no futuro. Nenhum nome de tela ou controle mudou. A cobertura dos 69 comportamentos da rodada 9 segue pendente. Não houve medição de desempenho neste lote.
