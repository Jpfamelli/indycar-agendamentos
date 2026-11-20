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
- **R9-CASA-044** · conserto · Sino: os botões ⏱ (adiar) e ✓ (lida) herdavam largura 100% e cada aviso virava três colunas iguais, com o texto espremido num terço; agora têm 44 px fixos e o aviso usa o resto · `051cde9`
- **R9-CASA-045** · celular · Sino no celular abre como folha de altura inteira logo abaixo do topo, com os filtros de app numa linha que rola de lado e o título "Notificações" antes do "só não lidas" · `051cde9`
- **R9-CASA-046** · acessibilidade · Menu do perfil pelo teclado: ao abrir o foco vai para "Trocar senha", setas, Home e End andam entre as opções, Tab fecha, e o avatar avisa que abre um menu · `9a9ef76`
- **R9-CASA-047** · texto · Visão do dono: o gráfico de 7 dias sem nenhum valor diz o que falta ("o valor entra quando o horário é marcado fechou na Agenda") em vez de sete barras vazias que pareciam quebradas · `fc6d030`
- **R9-CASA-048** · texto · Ritmo do mês sem nada fechado não diz mais "no ritmo de agora o mês fecha em R$ 0,00"; explica que a projeção aparece depois do primeiro "fechou" com valor · `fc6d030`
- **R9-CASA-049** · celular · App instalado da Central com a barra do sistema escura como o topo (era vermelha) e descrição que inclui o Tráfego · `1f07401`
- **R9-CASA-050** · teste · Roteiro de teclado e cliques no Chrome (tests/r9-casa-interacoes.mjs): foco do menu, abas, ajuda, tecla 7, busca falada, edição de tarefa, Desfazer, sino, meta, Criar com banco lento, sair, cartões vazios e toque · `17010e3`
- **R9-CASA-051** · segurança · Ao sair (no botão ou em outra aba), o aparelho esquece as buscas recentes, que guardavam nome e telefone de cliente, e os avisos adiados; o próximo no mesmo computador da oficina não vê nada disso. Tema e e-mail lembrado ficam · `08d877e`
- **R9-CASA-052** · conserto · Cartões do Agora vazios (Pátio, Orçamentos, Conversas, Hoje, Contatos) cabem no cartão: a dica não quebrava linha e a coluna crescia até 766 px, cortando o número e o texto em qualquer tela · `b527881`
- **R9-CASA-053** · texto · Mecânico sem carro vê "Nenhum carro passado para você" e onde ver os outros; antes lia "nenhum carro dentro da oficina" e a dica do "+ Nova entrada", botão que ele nem tem · `e1dddd5`
- **R9-CASA-054** · celular · Linhas dos cartões cabem no celular: valor e tempo do orçamento ("2 dias", "1 h 30 min") saíam do cartão; agora o nome desce de linha e o selo "aprovado · sem horário" aparece inteiro · `7a2ab26`
- **R9-CASA-055** · texto · Ligações entre sistemas dizem "3 registros soltos para arrumar" (era "3 casos em 1 tipo") e explicam numa linha o que é um registro solto · `410b8e1`
- **R9-CASA-056** · texto · Visão do dono sem palavra difícil: "ticket" virou "média de R$ X por carro" e "o faturamento está subestimado" virou "o faturamento de verdade é maior que o mostrado" · `65e2d04`
- **R9-CASA-057** · texto · A busca fecha num botão "Fechar"; antes dizia "Esc", tecla que não existe no celular · `70c7165`
- **R9-CASA-058** · celular · Em tela de toque some a cola de teclado: o "Ctrl K" do botão de busca e o pé "↑ ↓ escolher · Enter · Esc" da busca; no computador continuam · `886db15`
- **R9-CASA-059** · texto · Pede atenção e gargalos com horas por extenso ("há mais de 4 horas"; o "4 h" partia em duas linhas no celular) e "1 deles há mais de 4 horas" no lugar de "1 há mais de 4 h" · `7e32bef`
- **R9-CASA-060** · segurança · "Esqueci a senha" espera a resposta (botão desligado) e não pede de novo o mesmo e-mail no mesmo minuto: dois toques gastavam dois envios do limite por hora e o segundo voltava "Muitas tentativas" por cima do aviso de sucesso · `f568c21`
- **R9-CASA-061** · celular · O aviso do pé usa a largura da tela: com "left 50%" ele só podia ter metade e, no celular, virava uma coluna de 188 px e 9 linhas por cima do "Entrar" e do "Esqueci a senha" · `baf4152`
- **R9-CASA-062** · texto · Ficha do cliente: o orçamento diz "esperando resposta há 1 dia · Onix" (antes "esperando resposta · Onix · esperando há 1 dia") · `54e7c25`
- **R9-CASA-063** · acessibilidade · Sinal de saúde ao lado do logo: o leitor de tela ouve qual sistema tem problema e o ponto de problema mostra "!" (era só um ponto colorido com title, que o celular não mostra) · `ce1b901`
- **R9-CASA-064** · tela · Número de pendências de cada app no canto do cartão: em ATENDIMENTO e ORÇADOR descia sozinho para a linha de baixo · `6e72927`
- **R9-CASA-065** · conserto · Busca que falhou avisa o leitor de tela e tem "tentar de novo"; antes só apagando e digitando de novo · `7716910`
- **R9-CASA-066** · tela · Meta do mês num campo do próprio bloco (era uma janela do navegador): teclado de números no celular, erro dentro do campo sem perder o que foi digitado, Esc cancela e o foco volta ao botão · `052d45e`
- **R9-CASA-067** · acessibilidade · Botão de recolher cartão diz "Mostrar/Esconder a lista de" e o nome atual do cartão; o mecânico ouvia "Carros no pátio" no cartão "Meus carros no pátio" · `c5153c3`
- **R9-CASA-068** · acessibilidade · Tarefas não perdem o foco: depois de concluir, o foco vai para a tarefa seguinte (ou para o campo de nova tarefa); depois de adiar, fica na mesma (antes caía no começo da página) · `c74b258`
- **R9-CASA-069** · texto · Botões de adiar tarefa dizem quanto: "adiar 1 dia" e "adiar 3 dias" (eram "adiar ›", que parecia abrir menu, e "+3 dias"), e o nome falado começa pelo que se vê · `521356d`
- **R9-CASA-070** · acessibilidade · Erro na entrada aponta o campo (borda, foco e texto selecionado; o campo lê a mensagem) e diz qual falta, e-mail ou senha; vale também para o código de verificação e a senha nova · `0c50c96`
- **R9-CASA-071** · segurança · Biblioteca do Supabase vinda do CDN com integrity sha384: conferido no Chrome que a verdadeira carrega e uma alterada é barrada · `90d7faa`
- **R9-CASA-072** · segurança · CSP da Casa libera o CDN só no caminho da biblioteca do Supabase (antes o cdn.jsdelivr.net inteiro, que serve qualquer pacote do npm e arquivo do GitHub); conferido no Chrome · `ac0729a`
- **R9-CASA-073** · tela · "dispensar por hoje" do Ontem e amanhã tem "Desfazer" (antes só voltava no dia seguinte), o foco vai para o conteúdo e as marcas de dias velhos saem do aparelho · `ce93429`
- **R9-CASA-074** · acessibilidade · Sino pelo teclado: o ⏱ leva o foco às opções de adiar; adiar e marcar ✓ deixam o foco no aviso ou no vizinho (antes caía no começo da página) · `d862dbc`
- **R9-CASA-075** · acessibilidade · Busca e ficha sem marco duplicado: o pé e o cabeçalho delas eram footer/header e o leitor de tela ouvia um segundo rodapé e um segundo topo da página; axe de todas as gravidades zerado nas janelas · `b2e6a06`
- **R9-CASA-076** · acessibilidade · "Ir para" (tecla t, comandos da busca, aviso do sino, nova tarefa) leva o foco junto (antes a página rolava e o foco ficava no topo) e só anima a rolagem para quem não pediu menos movimento · `e194964`
- **R9-CASA-077** · tela · "g depois f" abre o Tráfego (antes só o 7 abria) e a dica do "g" lista só os apps que a pessoa pode abrir (antes os seis fixos, inclusive os sem acesso) · `7cc993c`
- **R9-CASA-078** · aviso · Atalho de app fora do ar ("Nova entrada no pátio", "Novo orçamento", "Modo TV do pátio") escreve "· fora do ar" e explica ao passar o mouse (antes só borda tracejada e cor cinza); medido no Chrome com Pátio e Orçador fora · `6c029df`
- **R9-CASA-079** · acessibilidade · Ficha: erro ao montar e respostas dos links do cliente ("ainda não é cliente cadastrado", "sem links") são faladas ao leitor de tela (antes só o "Juntando…" era) · `909c590`
- **R9-CASA-080** · texto · Faturamento da semana diz "▲ 33% a mais" / "▼ 5% a menos" e "comparado com a semana passada até este mesmo dia" (era "▲ 33%" só com a cor, "novo" e "vs. mesma altura"); a seta não é lida, a palavra é · `094e585`
- **R9-CASA-081** · aviso · Sistemas que mudam juntos viram um aviso só ("Pátio e Orçador ficaram com problema."); antes saía um por sistema e só o último ficava na tela · `9ff0c65`
- **R9-CASA-082** · conserto · Busca reaberta depois de uma pesquisa: setas e Enter na tela inicial voltam a abrir o item marcado (antes só redesenhavam a tela; provado no Chrome) · `8fee93b`
- **R9-CASA-083** · acessibilidade · Buscas recentes entram nas setas da busca, com contorno na marcada e nome falado "Buscar de novo: HB20" (antes as setas pulavam as recentes) · `8ae1a08`
- **R9-CASA-084** · acessibilidade · Filtros das tarefas e do sino deixam o foco no filtro escolhido (antes ia para o corpo da página; no Chrome, BODY antes e o filtro depois) · `489803b`
- **R9-CASA-085** · acessibilidade · "limpar" as buscas recentes devolve o foco ao campo e avisa "Buscas recentes apagadas." (antes o foco caía no corpo da página) · `39af6ca`
- **R9-CASA-086** · acessibilidade · "tentar de novo" das tarefas e do sino deixa o foco no título "Minhas tarefas" e na busca do sino (antes o botão sumia ao redesenhar e o foco caía no corpo da página) · `14b2755`

## Rodada 10 (20/11/2026)

Foco: segurança, conexões, desempenho medido e falha de rede. Cada linha tem uma prova que roda, falha no código de
antes e passa no de agora: os testes `r10-…` de `tests/r10-casa-servidor.test.mjs`, `tests/r10-casa-central.test.mjs` e
`tests/r10-casa.test.mjs` (entram no `npm test`) e as provas de tela `r10-…` de `node tests/r10-casa-browser.mjs`
(Chrome com o Supabase de mentira de `tests/r10-casa-mock/`; `--antes <pasta>` roda as mesmas provas na Casa de um
commit anterior). Medição de desempenho: `node tests/r10-casa-medir.mjs`.

- **R10-CASA-001** · conserto · Links do cliente: pedido com corpo "null", número, texto ou lista derrubava a rota com erro 500; agora volta 400 "Pedido inválido" (teste r10-corpo) · `35f96b5`
- **R10-CASA-002** · segurança · Links do cliente: o que não tem forma de token do Supabase é recusado sem a Central perguntar nada ao Supabase (antes cada lixo virava uma consulta) (teste r10-forma-do-token) · `35f96b5`
- **R10-CASA-003** · segurança · Links do cliente: 10 logins recusados em 1 minuto do mesmo endereço e o seguinte espera (429), sem ir ao Supabase; outro endereço não é afetado (teste r10-freio-de-login) · `35f96b5`
- **R10-CASA-004** · segurança · Links do cliente: os mapas do limite e do login guardado eram zerados inteiros ao encher, o que soltava quem estava no limite e apagava o login de quem estava trabalhando; agora saem só os vencidos e os de menor peso (teste r10-poda) · `35f96b5`
- **R10-CASA-005** · segurança · Links do cliente: frase de erro do banco não vai mais para a tela ("permission denied for table…"); só código curto como cliente_nao_encontrado passa (teste r10-motivo) · `35f96b5`
- **R10-CASA-006** · aviso · Links do cliente: limite e "não consegui conferir o acesso" dizem em quanto tempo tentar (Retry-After 60 e 30) e o método errado diz qual usar (Allow: POST) (teste r10-esperar) · `35f96b5`
- **R10-CASA-007** · segurança · Rotas da Central (/api/ping, /api/central/config, /api/central/saude-apps) e arquivos da Casa só aceitam leitura: POST, PUT e DELETE respondem 405 com Allow (antes respondiam como leitura ou caíam na Agenda) (teste r10-metodos) · `98a180b`
- **R10-CASA-008** · conserto · /api/central/<rota que não existe> responde 404 da própria Central; antes caía na Agenda, que respondia como se a rota fosse dela (teste r10-rota-desconhecida) · `98a180b`
- **R10-CASA-009** · segurança · CSP da Casa: conexão só com o Supabase da oficina (antes qualquer *.supabase.co passava; um script injetado podia mandar dado para o projeto de outra pessoa) (teste r10-csp-banco) · `98a180b`
- **R10-CASA-010** · segurança · CSP da Casa: imagem só da própria Casa, sem "data:" (nenhuma tela usa imagem embutida; o teste varre os arquivos) (teste r10-csp-imagens) · `98a180b`
- **R10-CASA-011** · desempenho · CSS e JS da Casa levam a marca do conteúdo no endereço e ficam guardados 1 ano no navegador: na segunda abertura, de 23 pedidos ao servidor (20 deles "304, não mudou") para 3 (teste r10-marca; medição r10-casa-medir) · `98a180b`
- **R10-CASA-012** · segurança · Log de pedido lento não escreve mais o token do link do cliente (/confirmar/<token>): pedaço comprido do endereço sai cortado (teste r10-log) · `98a180b`
- **R10-CASA-013** · desempenho · O service worker pede os mesmos endereços com marca que a página já baixou: primeira visita de 52 pedidos para 32 e de 197,9 kB de CSS e JS para 99,1 kB (antes baixava os 20 arquivos duas vezes) (teste r10-sw-marcas; medição r10-casa-medir) · `04b3606`
- **R10-CASA-014** · tela · App da Central que não subiu: quem abre /crm/ (ou outro) no navegador vê uma página que explica e deixa tentar de novo ou voltar para a Casa, no lugar de um JSON cru; a API continua em JSON (teste r10-app-fora) · `04b3606`
- **R10-CASA-015** · segurança · Freio da saúde dos apps: uma enxurrada de 500 endereços zerava o mapa e soltava quem já estava freado; agora saem os parados e os que menos perguntaram (teste r10-freio-saude) · `04b3606`
- **R10-CASA-016** · conserto · Tarefas: dois toques seguidos em "adiar 1 dia" adiavam dois dias e gravavam duas vezes; agora o segundo toque espera o primeiro terminar (prova r10-adiar-duplo) · `e19432f`
- **R10-CASA-017** · desempenho · Tempo real em rajada: 8 mudanças juntas nas tarefas ou 8 avisos juntos no sino viravam 8 leituras da lista inteira cada; agora 1 leitura, 400 ms depois da última (prova r10-rajada) · `e19432f`
- **R10-CASA-018** · conserto · Quando a internet volta, o sino e as tarefas releem na hora; antes só o painel relia e as tarefas ficavam em "não consegui ler" até alguém clicar (prova r10-rede-voltou) · `e19432f`
- **R10-CASA-019** · conserto · Tarefas não tinham relógio nem volta: se o tempo real caísse, a lista ficava velha. Agora relê ao voltar para a aba depois de mais de 1 minuto (prova r10-tarefas-aba) · `e19432f`
- **R10-CASA-020** · aviso · Login vencido: cada bloco dizia "não consegui ler" para sempre; agora a Casa tenta renovar uma vez e, se não der, volta para a tela de entrar dizendo "Sua sessão venceu. Entre de novo para continuar." (prova e teste r10-sessao-vencida) · `52a8fac`
- **R10-CASA-021** · conserto · Duas abas: a aba parada na tela de entrar abre a Casa sozinha quando o login acontece em outra aba ou em outro app (prova r10-entrou-em-outra-aba) · `52a8fac`
- **R10-CASA-022** · segurança · Duas abas: se outra pessoa entra em outra aba, esta Casa deixava na tela o painel, as tarefas e os avisos de quem estava antes; agora desmonta, apaga as buscas guardadas e monta para quem entrou (prova r10-outra-pessoa) · `52a8fac`
- **R10-CASA-023** · conserto · Código de verificação: dois toques em "Confirmar" mandavam o código duas vezes e o segundo voltava "não confere" por cima do que deu certo; o botão trava e diz "Conferindo…" (prova r10-codigo) · `52a8fac`
- **R10-CASA-024** · texto · Código de verificação sem internet dizia "Código não confere"; agora diz que está sem internet e que o código pode estar certo (prova e teste r10-codigo-rede) · `52a8fac`
- **R10-CASA-025** · conserto · Senha nova: dois toques em gravar trocavam a senha duas vezes (a segunda podia voltar "precisa ser diferente da atual"); o botão trava e diz "Gravando…" (prova r10-senha-dupla) · `52a8fac`
- **R10-CASA-026** · conserto · Painel: uma leitura que nunca voltava (rede que caiu no meio) deixava o painel sem atualizar até recarregar a página, nem pelo botão; passados 25 s a leitura velha é abandonada (prova r10-painel-pendurado) · `23e7898`
- **R10-CASA-027** · desempenho · Voltar para a aba segundos depois de ler refazia 4 pedidos (painel, extras, sino e saúde dos apps); agora 0 se a leitura tem menos de 15 s (30 s na saúde) (prova r10-volta-da-aba) · `23e7898`
- **R10-CASA-028** · aviso · Saúde do Pátio e do Orçador: quando a própria conferência falhava a Casa não dizia nada (parecia "tudo no ar"); na segunda falha seguida ela diz que não conseguiu conferir, com "verificar de novo" (prova r10-saude-sem-leitura) · `23e7898`
- **R10-CASA-029** · aviso · Links do cliente na ficha: sem resposta ficava em "Gerando os links…" para sempre; em 15 s desiste, diz "A Central demorou demais para responder" e deixa tentar de novo (prova e teste r10-links-tempo) · `ab3b6f4`
- **R10-CASA-030** · conserto · Configuração do login que falha na abertura: a tela mandava recarregar e nenhum botão funcionava; agora tem "Tentar de novo" e a Casa tenta sozinha quando a internet volta (prova r10-config-de-novo) · `ab3b6f4`
- **R10-CASA-031** · conserto · Meta do mês: tirada em um aparelho, voltava para o banco por qualquer outro que ainda tivesse a meta antiga guardada; agora o aparelho sobe a meta que só existia nele uma vez e depois copia o banco (prova r10-meta) · `ab3b6f4`
- **R10-CASA-032** · segurança · Ao sair, a meta do mês (dado do dono) não fica mais guardada no computador da oficina; o tema e o e-mail lembrado ficam (prova r10-meta-sair) · `ab3b6f4`
- **R10-CASA-033** · segurança · Ao sair (ou quando a sessão cai, ou outra pessoa entra), a Casa só era escondida: nomes e telefones de cliente, tarefas, avisos e o faturamento continuavam na página e piscavam para quem entrasse depois. Agora o conteúdo é apagado junto (prova r10-sair-limpa) · `4671bbf`
- **R10-CASA-034** · conserto · A conta de senhas erradas não vencia: quem errou 5 vezes num dia, dias depois errava uma e já esperava 20 s ou mais. Passados 15 minutos do último erro, a conta zera (prova r10-erros-antigos) · `4671bbf`
- **R10-CASA-035** · conserto · Tarefas ganham relógio próprio: com a aba à vista, relê de 2 em 2 minutos mesmo se o tempo real cair (a Casa fica aberta o dia todo no balcão; o painel e o sino já tinham) (prova r10-tarefas-relogio) · `4671bbf`
- **R10-CASA-036** · aviso · Ficha do cliente e busca: leitura sem resposta ficava em "Juntando o que cada sistema sabe…" ou "Buscando…" para sempre; em 15 s desistem e oferecem tentar de novo (prova r10-leitura-pendurada) · `4671bbf`
