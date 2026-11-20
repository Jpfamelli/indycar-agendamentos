# Rodada 10 · Comunicar

Entrega parcial. 1 de 100 melhorias registradas.

A suíte de referência passou 310/310 com isolamento padrão do Node. O modo sem isolamento fez os dublês dos testes compartilharem estado, por isso a conferência foi repetida com os subprocessos padrão.

## Para outra frente

Faltam a cobertura dos 69 comportamentos R9-COM-032 a R9-COM-100 e 99 melhorias para a meta do app.

## Para o João

Sem mudanças de nomes, correções de segurança ou medições de desempenho neste app.

## Chrome

O roteiro compartilhado passou em 375 e 1440 px, nos dois temas, com mocks e bloqueio de rede externa. Cobriu painel recolhível, resposta atrasada, falha de atualização e período inválido.

## Identidade dos mocks

O roteiro compartilhado agora consulta uma rota exclusiva de cada mock, com timeout e bloqueio de redirecionamento, antes de iniciar o Chrome. O teste novo falhou no c?digo anterior e passou no commit `4cbe2d9`. A su?te passou de 310/310 para 311/311. A execu??o do Chrome registrada acima ? anterior a esse commit.
