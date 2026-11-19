# Casa (IndyCar Central): melhorias

Uma linha por melhoria, com o commit onde ela está. Prova: `npm test` da raiz e o roteiro do Chrome
`node tests/r9-casa-browser.mjs` (Supabase de mentira, capturas em `qa-out/r9/antes` e `qa-out/r9/depois`).

## Rodada 9 (19-20/11/2026)

- **R9-CASA-001** · conserto · Aviso da Casa: mensagens com "ok" ou "err" (meta, links) sumiam na hora porque a palavra virava o tempo do aviso; agora ficam 3,2 s, erro fica 6 s e aparece com borda e ícone de grave · `057743b`
- **R9-CASA-002** · conserto · O "Desfazer" de tarefa concluída ou adiada tinha relógio próprio e um aviso anterior podia apagá-lo antes da hora; agora o aviso da Casa tem um relógio só · `8fbefc6`
- **R9-CASA-003** · acessibilidade · Esc fecha o sino e o menu do perfil devolvendo o foco ao botão que abriu e voltando o aria-expanded para falso · `057743b`
- **R9-CASA-004** · conserto · Ao sair (ou quando a sessão cai), o sino e o menu do perfil ficavam abertos para quem entrasse depois · `057743b`
- **R9-CASA-005** · acessibilidade · Botão do tema diz qual tema está ligado ("Tema escuro ligado. Trocar para o claro", aria-pressed) · `057743b`
- **R9-CASA-006** · conserto · Sino mostra "Carregando os avisos…" e, se o banco falha, "Não consegui ler os avisos agora" com tentar de novo; antes ficava em branco como se não houvesse aviso · `f932cd5`
- **R9-CASA-007** · tela · Aviso sozinho do tipo dele aparece direto no sino, sem a caixinha "1 aviso · …" para abrir · `f932cd5`
- **R9-CASA-008** · acessibilidade · Aviso não lido marcado com a palavra "não lido", não só com a barra vermelha · `f932cd5`
- **R9-CASA-009** · conserto · "Marcar todas como lidas" marcava também o que a busca do sino e os adiados escondiam; agora só o que está na tela · `f932cd5`
- **R9-CASA-010** · conserto · Tarefas mostram "Carregando suas tarefas…" e, se o banco falha, erro com tentar de novo; antes a lista vazia parecia "nenhuma tarefa" · `8fbefc6`
- **R9-CASA-011** · conserto · Botão Criar trava enquanto grava ("Criando…"): dois toques não criam a mesma tarefa duas vezes · `8fbefc6`
- **R9-CASA-012** · texto · Criar tarefa sem texto explica o que fazer; se a gravação falha, avisa que o texto continua no campo · `8fbefc6`
- **R9-CASA-013** · acessibilidade · Título da tarefa virou botão: dá para editar pelo teclado e o foco volta ao título depois de salvar ou cancelar · `8fbefc6`
- **R9-CASA-014** · texto · Travessão fora de todos os textos da tela (12 frases em 7 arquivos: resumo do dia, clima, PARAR, ficha, chegadas, relógio, sino, aviso de app fora…), com teste que varre a Casa · `43c74b3`
- **R9-CASA-015** · texto · "Lead" virou "contato" em toda a Casa: cartão "Contatos novos", busca "Contatos (CRM)", Pede atenção, conversão, sino e tarefas · `d9caa67`
- **R9-CASA-016** · texto · "Não sei" é "sem dado": cartão que não carregou e conversão sem base não mostram mais traço; antes de carregar o número mostra "…" · `3fdeb2f`
- **R9-CASA-017** · texto · Bloco da manhã com o título "Ontem e amanhã"; antes repetia "Boa noite, Paulo" logo abaixo da mesma saudação · `57e0696`
- **R9-CASA-018** · conserto · Busca que só achava pessoas dizia "2 resultados em 0 sistema"; agora diz "2 pessoas achadas" (e "1 pessoa · 4 resultados em 3 sistemas" quando tem os dois) · `27dacff`
- **R9-CASA-019** · tela · O Tráfego aparece no "Ir para" da busca, como os outros apps · `27dacff`
- **R9-CASA-020** · tela · Tecla 7 abre o Tráfego e a ajuda de atalhos diz "1 … 7" · `bd6be82`
- **R9-CASA-021** · texto · Links do cliente na ficha: erro em português ("A Central não respondeu", "Sem internet agora"), nunca "Failed to fetch", com botão tentar de novo · `9fcb42b`
- **R9-CASA-022** · aviso · Faixa do Vigia com título curto e o que fazer para cada um dos 23 avisos graves (antes o título era o texto cru do Vigia e só 6 famílias tinham plano), com link para o app certo · `cc15f50`
- **R9-CASA-023** · aviso · Vigia parado há 48 h ou mais aparece em dias ("há 3 dias") e diz que ninguém está de olho nos sistemas enquanto isso · `cc15f50`
- **R9-CASA-024** · acessibilidade · Faixa do Vigia com selo "⚠ Urgente" (cor, ícone e palavra) e o texto do Vigia pequeno embaixo; quando só falhou a leitura, a borda fica neutra · `90540f8`
- **R9-CASA-025** · acessibilidade · Busca sem a lista falsa de opções (axe acusava 2 erros críticos); o leitor de tela ouve o item marcado pelas setas e a contagem de resultados · `27dacff`
- **R9-CASA-026** · acessibilidade · Botão de busca do topo: o nome falado bate com o texto visível (axe label-content-name-mismatch em toda tela) · `2548ddb`
- **R9-CASA-027** · acessibilidade · "Copiar telefone" e "🧾 Orçar" com nome falado que começa pelo texto visível · `3fdeb2f`
- **R9-CASA-028** · acessibilidade · Tabela de desempenho que rola de lado recebe foco pelo teclado e tem nome (axe scrollable-region-focusable) · `3fdeb2f`
- **R9-CASA-029** · acessibilidade · Contraste no tema claro: notas, deltas, vermelho de texto pequeno, selo do Orçador e selo de vencidas com os tons do guia (axe color-contrast zerado) · `e1d9b31`
- **R9-CASA-030** · acessibilidade · Operação e Visão do dono viraram abas de verdade: setas, Home e End trocam a visão e levam o foco; cada painel ligado à sua aba · `3fdeb2f`
- **R9-CASA-031** · acessibilidade · Ajuda de atalhos prende o Tab; antes o foco fugia para a página de trás da janela · `bd6be82`
- **R9-CASA-032** · conserto · A dica do "g…" apagava o aviso com "Desfazer" que estava na tela; agora não atropela aviso com botão · `bd6be82`
- **R9-CASA-033** · acessibilidade · O relógio "atualizado há…" mudava a cada 5 s e o leitor de tela lia tudo; agora só fala quando cai a internet, falha ou volta · `3fdeb2f`
- **R9-CASA-034** · acessibilidade · Filtro "Todos, Por vir, Na oficina" fica dentro do item da lista; antes a lista de horários de hoje ficava inválida para o leitor de tela (axe list) · `3fdeb2f`
- **R9-CASA-035** · acessibilidade · "Pede atenção agora" e Gargalos mostram a gravidade em palavra ("⚠ Urgente", "Atenção"), não só na cor da borda · `3fdeb2f`
- **R9-CASA-036** · tela · Cartões sem a barra colorida de lado (Agora, Pede atenção, saúde, tarefas, sino), como manda o GUIA-VISUAL · `e1d9b31`
- **R9-CASA-037** · tela · Fundo liso, sem o degradê vermelho e azulado · `e1d9b31`
- **R9-CASA-038** · tela · Faturamento dos 7 dias: barras sem degradê, dado em cinza e hoje em vermelho com a palavra "hoje" · `3fdeb2f`
- **R9-CASA-039** · desempenho · Fontes da Casa (Archivo e Barlow Condensed) servidas pela própria Central, com preload, cache de 30 dias e no cache offline; sai a ida ao Google e sai a Inter · `fb82295`
- **R9-CASA-040** · segurança · CSP da Casa fechada: estilo e fonte só da própria Central (saíram fonts.googleapis.com e fonts.gstatic.com) · `76a4d54`
- **R9-CASA-041** · celular · Alvos de toque de 44 px que faltavam: pular para o conteúdo, atualizar, dispensar por hoje, Fechar da ficha, Esqueci a senha, Esc da busca, tentar de novo e as caixinhas de marcar · `e1d9b31`
- **R9-CASA-042** · conserto · Meta do mês aceita como a pessoa escreve: "R$ 80.000", "80 mil", "80k" (antes "R$ 80.000" era recusado) · `43c74b3`
- **R9-CASA-043** · teste · Roteiro do Chrome da Casa com Supabase de mentira: 13 cenários por papel e por falha, 1440 e 375 px, claro e escuro, axe, alvos de toque, palavras proibidas e textos que têm de aparecer · `8710bbe`
