# Rodada 8 · R1 Casa (frente D)

Ramo `codex/r8-r1-casa`, base `ecd645a`. Trabalho na cópia `indycar-agendamentos-codex-d`.

## Mudanças

1. Em `casa/saude.js`, admin e gestor leem `vigia_avisos_abertos()`. Casa e sino mostram os graves na ordem da RPC, o tempo, a ação e o caminho do CodeWords até a aba Integrações do Atendimento. Falha de leitura aparece junto da última leitura disponível.
2. Em `casa/logica4.js`, Saúde dos sistemas usa a RPC do Vigia. Os sinais de WhatsApp, Comunicar, Movere e Pátio têm fontes próprias.
3. Em `casa/sino.js`, grupos por tipo expandem para mostrar os avisos e podem ser marcados como lidos. Ao marcar, o foco vai para o resumo do grupo e o sino continua aberto. A faixa do Vigia fica acima dos grupos.
4. Em `apps/atendimento/lib/automacoes.js`, o tempo de espera começa na primeira mensagem após a última resposta encontrada. Mensagens adicionais reaproveitam o aviso pela chave. Uma resposta seguida de nova espera abre outro período.
5. Em `apps/atendimento/lib/ia-funil.js`, a aprovação de proposta reaproveita uma chave por conversa e só reabre a leitura quando começa um novo conjunto de propostas pendentes. Alerta de mensagem suspeita usa o período de encaminhamento quando existe. Ações automáticas bem-sucedidas dispensam aviso de aprovação.
6. O arquivo `2026-11-19_r8_R1-casa_sino_ensaio.sql` tem uma consulta de contagem e um ensaio que termina em `TESTE_REVERTIDO`. O total histórico informado pelo banco é 3.666 não lidos, de 3.726. Somando os seis tipos com recorte de sete dias, há pelo menos 2.740 antigos não lidos no retrato da R1. O total exato depende do SELECT. A integração Supabase está indisponível nesta sessão.

## Mapa de jornadas

| Pessoa | Passos | Resultado esperado | Prova |
| --- | --- | --- | --- |
| Equipe | Errar a senha e entrar com a senha de teste | Tela orienta e permite tentar de novo | Chrome simulado |
| Gestor | Abrir Casa com WhatsApp recusado há 48 dias | Faixa com idade, ação e Integrações | Chrome e teste local |
| Administrador | Abrir Casa com dois graves | Ambos visíveis, mais antigo primeiro | Teste local |
| Gestor | Última leitura há 36 h | Vigia parado com duração | Teste local |
| Gestor | Falha da RPC e recuperação | Aviso de falha e última leitura, depois normaliza | Teste local |
| Gestor | Abrir Casa com Vigia em dia e sem graves | Faixa oculta | Teste local |
| Atendente | Abrir a Casa | A tela não consulta essa RPC | Teste local |
| Gestor | Expandir o grupo de espera no sino | Dois avisos disponíveis separadamente | Chrome simulado |
| Gestor | Marcar grupo como lido | Contador baixa e faixa do Vigia continua no topo | Chrome simulado |
| Gestor com ads | Abrir o cartão Tráfego | `/trafego/`, aba `indycar-ads` | Chrome simulado |
| Gestor | Abrir Casa em celular | Layout sem rolagem lateral | Chrome simulado |
| Equipe | Buscar cliente e conferir o destino | Resultado preserva o vínculo com a conversa | Chrome simulado |
| Equipe | Buscar com falha simulada | Erro visível e saída por Escape | Chrome simulado |
| Equipe | Abrir tarefas, concluir e desfazer | Tarefa sai e retorna à lista | Chrome simulado |
| Gestor | Ver Saúde e visão do dono | Leituras independentes e escopo por papel | Suíte da raiz |

## Decisões para a junção

- Acrescentar `tests/r8-casa-vigia.test.mjs` à linha de teste da raiz. Rodar isoladamente com `node --test tests/r8-casa-vigia.test.mjs`.
- Copiar o SQL para a pasta de ferramentas, rodar primeiro o SELECT para obter a contagem exata e decidir se marca os antigos. A rotina do Atendimento remove lidos depois de 60 dias, portanto a mudança de estado também os torna elegíveis futuramente. Nenhum SQL foi aplicado.
- `aguardando` vem do gatilho `conversas_notifica`, em `2026-10-13_rodada3_base.sql`. Já cria somente na transição para aguardando. A chave legada por hora pode suprimir um reingresso na mesma hora. Atualizar o conteúdo enquanto a conversa aguarda exigiria mudar o gatilho.
- A janela de entradas da espera segue em oito horas. Quando a resposta sai dessa janela, a rotina busca o marco entre as últimas 30 saídas antigas. Uma conversa com 30 registros de sistema seguidos nessa faixa perde o marco. Confirmar esse caso com volume maior antes de estender a janela.
- Validar com login real os papéis e a RPC depois da junção. Os roteiros antigos de navegador que criam e apagam usuário no Supabase ficaram fora da execução. O roteiro novo intercepta respostas no Chrome.

## Provas

- `npm test` na raiz passou 458/458 em `ecd645a` e na frente D. A comparação usou a revisão base extraída localmente com as mesmas dependências.
- `npm --prefix apps/atendimento test -- --test-isolation=none` passou 406/406 antes e 408/408 depois. Inclui continuidade da espera com outra mensagem, novo período depois de responder, resposta fora da janela, atualização pela chave e reabertura para leitura.
- `node --test tests/r8-casa-vigia.test.mjs` passou 2/2. O mock cobre sem problema, um grave, vários, parado, falha e recuperação.
- O Chrome comparou antes e depois em 375 e 1440 px, nos temas claro e escuro da própria Casa. A base não mostrava a faixa nem o controle de grupo. A frente manteve o sino aberto com foco no grupo após marcar como lido e passou sem rolagem lateral ou exceções JavaScript nos cenários ensaiados. Axe-core encontrou zero violações graves ou críticas na faixa e no sino.
- O link Tráfego aponta para `/trafego/` na aba `indycar-ads` para admin e gestor com `ads`. O cartão ficou oculto para gestor sem `ads` e atendente com `ads`.
- Casa e Tráfego responderam HTTP 200 a GET sem sessão. A consulta à RPC em produção depende de sessão autenticada.

O roteiro do Chrome roda com `node tests/r8-casa-browser.mjs`. `CASA_BASELINE_DIR` aponta para a árvore base extraída quando se quer repetir as capturas anteriores. `CASA_AXE_PATH` aponta para `axe.min.js`. As capturas ficam em `qa-out/`.
