# Melhorias — IndyCar Comunicar

Só o que ficou feito e verificado. Cada linha é uma melhoria.

## Tela (09/10/2026)

Marca e PWA

1. App vira **IndyCar Comunicar** em tudo: título da aba, topo ("Central de comunicação com o cliente" + "Quem conhece, Indyca! 🏎"), tela de login, manifest e descrição.
2. `manifest.json` novo: nome, short_name "Comunicar", scope, idioma e atalhos (Nova campanha, Mensagens).
3. `sw.js` com cache `comunicar-v1`: nunca guarda `/api`, só guarda resposta boa do próprio domínio, inclui o logo na casca.

Casca, navegação e acessibilidade

4. Barra lateral com as 6 telas (Início, Réguas, Mensagens, Campanhas, Clientes, Satisfação), `aria-label` em cada item (o texto some no celular) e `aria-current` na tela ativa.
5. Seletor **Ecossistema IndyCar** (Agenda, CRM, Atendimento, Comunicar "você está aqui", Orçador, Site) em popover: abre pelo botão Apps, fecha com Esc ou clique fora e devolve o foco.
6. Faixa de saúde no topo de **todas** as telas quando `GET /api/saude` traz problema (texto pronto para `codewords-fora` + link "Abrir Atendimento"), rechecada a cada 5 min.
7. Faixa "sem internet" enquanto o navegador estiver offline, com recado quando voltar.
8. Selo na aba Mensagens com a quantidade na fila (99+ quando passa).
9. Esqueleto por tela enquanto carrega + entrada suave dos cartões; os números dos cartões sobem de 0 até o valor (respeita `prefers-reduced-motion`).
10. Atalhos de teclado: **N** abre nova campanha, **/** foca a busca da tela, **Esc** fecha popover, modal ou gaveta (nessa ordem).
11. Modal com foco preso (Tab e Shift+Tab não saem), foco no primeiro campo ao abrir e devolvido a quem abriu ao fechar; botão × com `aria-label`; `aria-labelledby` no título.
12. Gaveta lateral (ficha do cliente) com a mesma disciplina de foco, Esc e clique fora; trava a rolagem do fundo enquanto aberta.
13. Toast novo (ícone, barra de tempo, erro em vermelho), sempre por `textContent` — nome de cliente nunca vira HTML.
14. Tema claro/escuro mantido (`indycar_tema`, `data-trocando-tema`, body sem transition) e balão de WhatsApp com cor própria em cada tema.
15. `[hidden]{display:none!important}`, `esc()` em todo dado que vira HTML (inclui aspas simples) e 375 px sem rolagem lateral em todas as telas e modais.
16. Visual da família: numerais em Barlow Condensed (cartões, Por régua, 48 h, ficha, campanhas), cartões com barra colorida e brilho, hover que levanta o cartão.

Início

17. Abertura com a data por extenso e manchete que muda: "N mensagens na fila · X saíram hoje", "Fila limpa" ou "Envios pausados".
18. Faixa de situação: WhatsApp conectado / desconectado / **chave recusada** / sem resposta (chega depois de a tela pintar, com "verificando…"), última rodada do carteiro ("há 27 min · 3 enviadas"), janela de envio e domingo, falhas em 30 dias (último erro no `title`), chips das réguas ligadas; fica vermelha com a pausa geral.
19. Cinco cartões: Na fila (com atrasadas há +2 h), Enviadas 7 dias (quantas hoje), Responderam 7 dias (% das enviadas), Agendaram pela mensagem 30 dias (receita em R$ quando houver) e Satisfação % (nota média · respostas).
20. "Por régua" em grade com enviadas / responderam / agendaram, chip ligada/desligada e "N pediu p/ parar"; no celular os cabeçalhos encurtam (Env. · Resp. · Agend.) e nada rola de lado.
21. "Próximas 48 h" com o número grande, se a régua de lembrete está ligada, e quantos clientes pediram para não receber.
22. "Aniversariantes do mês" (dia, nome, telefone), até 8 com atalho "ver todos em Clientes".
23. **Rodar agora** (`POST /api/rodar-agora`): resumo em toast (novas na fila, enviadas, falhas, puladas, aviso) e tela atualizada sem piscar.
24. **Prévia de hoje** (`GET /api/previa`) em modal: chips por régua com contagem (marca as desligadas), lista nome/telefone/corpo, seções Pulados e Adiados com o motivo, erros do servidor.

Réguas

25. Faixa **Envio**: hora de envio, janela início/fim (0–24 h), intervalo mínimo com explicação de uma linha, telefone de teste com máscara, domingo e **Pausa geral** em vermelho destacado.
26. Oito cartões na ordem pedida, cada um com cor, ícone, interruptor animado (Ligada/Desligada) — desligado fica apagado.
27. Parâmetro numérico inline em cada régua ("Mandar **20** horas antes do horário · 1–72"); fora da faixa o campo fica destacado e o salvar é barrado.
28. Mensagem com chips de variáveis clicáveis (comuns + específicas `{quando}`, `{meses}`, `{link_avaliacao}`) inseridos onde está o cursor.
29. Prévia em balão de WhatsApp com cliente de exemplo, atualizada a cada letra, com a hora de envio e ✓✓ — usa a mesma troca de variáveis do servidor.
30. "Quem receberia hoje" por régua (`GET /api/previa?regua=`) e "Mandar teste para mim" (`POST /api/envios/teste`), com o erro do servidor (502) em toast.
31. Régua **Avaliação**: campo do link do Google e explicação de uma linha ("dispara sozinha quando o cliente responde bem ao pós-venda; sem o link, não sai").
32. Régua **Revisão**: prazos por serviço com edição inline (nome, palavras, meses, ativo), mensagem própria opcional (lápis), apagar com confirmação e linha para adicionar — salva na hora (`GET/POST/PUT/DELETE /api/regras-retorno`).
33. Só o que mudou vai no `PUT /api/comunicar/config`; barra flutuante "N alterações sem salvar" com Descartar/Salvar, cartão alterado ganha borda, Salvar também no topo.
34. Validações antes de salvar: janela começa antes de terminar, link começa com `https://`, telefone de teste com 10+ dígitos.
35. Papel não gestor: aviso "só gestor altera as réguas", campos travados e 403 do servidor vira aviso claro.

Mensagens

36. Pílulas de status (todas, na fila, enviadas, falharam, canceladas, puladas) + filtro por tipo + busca por nome/telefone/texto (`GET /api/envios?status&tipo&q`) e contador "N na lista".
37. Filtros e busca atualizam só a lista — o campo mantém o foco e o cursor de quem digita.
38. Cartão com ícone e rótulo do tipo, nome (abre a ficha) e telefone, corpo, "sai/programada/enviada em", tentativas, erro, motivo pulado e selo "agendou depois".
39. Resposta do cliente em balão colorido pelo tom: positiva (gostou), negativa (reclamou), parar (pediu para parar), neutra — com a hora.
40. Ações: Cancelar (na fila), Reenviar (falhou/cancelada/pulada) e Abrir conversa (Atendimento).

Campanhas

41. Modal **Nova campanha** em 3 passos com indicador (Para quem → Mensagem → Quando), Voltar/Avançar e validação por passo.
42. Passo 1: grupo por segmento (`GET /api/segmentos`) com valor editável quando houver e prévia ao vivo (total + amostra), ou um cliente específico com busca e sugestões (bloqueia quem pediu para parar).
43. Passo 2: modelos prontos por categoria (`GET /api/modelos`) para começar, chips de variáveis (inclui `{detalhe}`), contador de caracteres (alerta acima de 700) e prévia com o primeiro cliente da amostra.
44. Passo 3: agora (dentro da janela) ou dia e hora, resumo (para quem, tamanho, quando) e `POST /api/envios` por segmento ou por destinos; toast com enfileirados e pulados.
45. Histórico agrupado por mensagem e dia (ou por `lote`, quando o servidor mandar) com enviadas / responderam / agendaram, "na fila" e falhas.
46. "Nova campanha" no topo da tela e na barra superior; a ficha do cliente abre a campanha já com ele escolhido.

Clientes

47. Busca por nome, telefone ou placa (`GET /api/clientes?q`) sem perder o foco; contadores (total, com aniversário, fora da lista).
48. Linha do cliente: avatar com iniciais, nome (abre a ficha), telefone formatado, carro + placa, aniversário com lápis e interruptor "Mensagens"; selo "não quer mensagens"; no celular vira duas linhas sem esmagar o nome.
49. Desligar mensagens pede confirmação com motivo opcional (`PUT {aceita_mensagens:false, motivo}`); religar é direto; o interruptor volta se cancelar.
50. Aniversário aceita DD/MM/AAAA ou só DD/MM (ano 1904 aparece como dia/mês).
51. Ficha em gaveta: próxima revisão em destaque (vencida fica laranja), serviços / faltas / satisfação, últimas mensagens com resposta e selo "agendou depois", satisfação com origem, últimos agendamentos com status legível; interruptor e aniversário na própria ficha; botão "Mandar mensagem".
52. Importar planilha continua (CSV ou colar do Excel), com prévia e avisos do servidor.

Satisfação

53. Quatro cartões: Satisfeitos (quantos vieram do WhatsApp sozinhos), Insatisfeitos, Satisfação % e Nota média.
54. Lista com origem (💬 WhatsApp automático ou ✍️ manual), estrelas, comentário, quem registrou e apagar.
55. Registro manual com busca de cliente (sugestões), botões Satisfeito/Insatisfeito, estrelas clicáveis (radiogroup) e comentário.

Ferramentas

56. `scripts/mock-server.mjs` (`npm run mock`, porta 3511): serve o `public/` real, dublê do Supabase já logado, todas as rotas com dados coerentes, modos `?papel=atendente` e `?saude=ok`; usa `renderTemplate`, `REGUAS`, `ROTULO_TIPO`, `SEGMENTOS`, `prazoDeRetorno`, `quandoRelativo` e `classificarResposta` do `dados.js` real.
57. `package.json` com `mock`, `dev` e `check`; README reescrito para o Comunicar.

### Como foi verificado (09/10/2026)

- `node --check` em app.js, sw.js, mock-server.mjs, server.js e dados.js; manifest e package.json parseados.
- Capturas com puppeteer-core + Chrome (desktop 1366×900 e celular 375×812 @2x): 30 telas/estados (as 6 telas, prévia, campanha nos 3 passos, ficha, aniversário, filtro de mensagens, tema claro) — zero rolagem lateral, zero erro de console.
- 50 fluxos automatizados contra o mock limpo: rodar agora, ecossistema, tema, atalhos, Tab preso, prévia por régua, teste de WhatsApp (sucesso e 502), chips, faixa numérica, descartar, regras inline (editar/adicionar), pausa geral, filtros/busca/cancelar/reenviar, ficha pela mensagem, campanha completa (segmento com valor, modelo, contador, sem data, na fila, histórico), clientes (busca, opt-out com motivo, religar, aniversário DD/MM, ficha → mandar mensagem, importar), satisfação manual, papel atendente (travas + 403), faixa de saúde + chave recusada, celular (pílulas, nome legível, grade sem rolagem).

## Motor e banco (09/10/2026) — Claude, coordenador

### Banco (migrações `comunicar_v1`, `comunicar_v1_1`, `endurecimento_indycar_2026_10_09`; cópias em `scripts/sql/`)
58. Consentimento do cliente: `clientes.aceita_mensagens` (+ data e motivo); quem responde PARAR no WhatsApp sai da lista sozinho.
59. Índice de aniversário por mês/dia (expressão IMMUTABLE com `extract`; `to_char` não serve).
60. Cinco réguas novas na configuração (lembrete, orçamento parado, não fechou, reativação, avaliação) com textos padrão no tom da casa.
61. Janela de envio configurável (início/fim), domingo opcional, pausa geral, intervalo mínimo entre mensagens de relacionamento e telefone de teste.
62. Fila guarda a resposta do cliente (texto, tom, quando), a conversa e o lead ligados, o agendamento que veio depois, tentativas e motivo de pulo; status novo `pulado`.
63. Checks de status/tipo ampliados e seis índices novos na fila (telefone, agendamento, lead, conversa, tipo, respondidas).
64. Satisfação com origem (manual × WhatsApp automático) e texto original da resposta.
65. Tabela `comunicar_regras_retorno`: prazo de revisão por tipo de serviço, 13 regras prontas (óleo 6 m, freios 12 m, correia 24 m…).
66. Tabela `comunicar_modelos`: 10 mensagens prontas (promoção, viagem, chuva, datas, avaliação…).
67. Gatilho `comunicar_registrar_resposta`: a resposta do cliente fecha o ciclo da mensagem (positiva/negativa/parar/neutra, com emojis).
68. PARAR desliga o cliente e pula na hora tudo o que estava na fila para ele.
69. Resposta ao pós-venda vira registro de satisfação automático (sem ninguém digitar).
70. Satisfeito + régua ligada → convite de avaliação no Google 3 minutos depois (dedupe por envio).
71. Gatilho `comunicar_atribuir_agendamento`: agendamento novo é atribuído à última mensagem enviada (até 21 dias) → métrica "agendaram pela mensagem" e receita.
72. pg_cron `comunicar-carteiro` acorda o servidor a cada 15 min (o GitHub Actions throttla para ~3 vezes/dia); token guardado no banco por script, nunca no chat.
73. Lote de campanha (`posvenda_envios.lote`) e última rodada do carteiro gravada no banco (o Render dorme e perde a memória).
74. Endurecimento: EXECUTE revogado de anon/authenticated em 14 funções SECURITY DEFINER que ainda estavam abertas via /rest/v1/rpc (gatilhos continuam disparando — testado como `authenticated` com JWT simulado).
75. `search_path` fixo nas 12 funções auxiliares de texto do banco.
76. 13 índices para chaves estrangeiras sem índice (conversas, leads, perfis, mensagens, etapas…).
77. Gatilhos testados em produção com bloco `DO` + `RAISE EXCEPTION` (auto-reverte): resposta positiva → satisfação; PARAR → opt-out + campanha pulada.

### Camada de dados (`dados.js`)
78. Utilidades puras: `agoraSP`, `instanteSP`, `quandoRelativo` ("hoje às 14:30", "amanhã às 09:00", "sexta-feira (13/10) às 09:00"), `prazoDeRetorno` (sem acento, por ordem), `classificarResposta` (espelho do gatilho), `semAcento`.
79. `renderTemplate` com `{quando}`, `{meses}`, `{link_avaliacao}`, `{detalhe}` e limpeza de espaços.
80. Porteiro de consentimento: opt-out grava `pulado` com motivo (transparência); intervalo mínimo só adia, nunca consome a chave única.
81. Régua lembrete de horário: X horas antes, só agendamentos aguardando/confirmado, nunca com menos de 1 h.
82. Régua orçamento parado: leads em `orcamento` sem movimento há N dias (janela de 7 dias, uma vez por lead).
83. Régua não fechou: N dias depois, só se o cliente não voltou.
84. Régua reativação: último serviço há N meses, sem voltar nem horário marcado, uma vez por ano.
85. Régua revisão refeita: vencimento por regra de serviço, janela de 7 dias, um convite por cliente, mensagem própria por regra.
86. Prévia/simulação de todas as réguas sem gravar nada (`gerarTudo({simular:true})`, também por régua) — é o "Quem receberia hoje" da tela.
87. Segmentos para campanhas (todos, aniversariantes do mês, atendidos em N dias, sem voltar há N meses, faltaram em 30 dias, fizeram um serviço) sempre sem quem pediu para não receber.
88. Ficha do cliente para o Comunicar: resumo 360, último serviço, próxima revisão prevista, últimas mensagens com resposta, satisfação, agendamentos.
89. Resumo do painel ampliado: 7 e 30 dias, respondidas, agendaram e receita atribuída, por régua, fila atrasada, próximas 48 h, fora da lista, nota média.
90. Reenviar mensagem que falhou, foi cancelada ou pulada; cancelar continua só para pendente.
91. Busca na fila por nome, telefone (com ou sem 55), texto e resposta; limite configurável.
92. Busca de clientes por telefone com/sem 55 e por placa; `fichaCliente`; regras de retorno e modelos com CRUD validado.
93. Histórico por cliente lido uma vez só (último serviço + última visita) para reativação e segmento "sem voltar" — sem N consultas.
94. Teste a seco de todas as consultas contra o banco real (nenhuma gravação) + 10 testes puros (`npm test`) + workflow `testes.yml`.

### Servidor (`server.js`)
95. Carteiro respeita janela, domingo e pausa geral; para a rodada em erro estrutural (chave/aparelho) devolvendo a mensagem à fila em vez de marcar tudo como falha; conta tentativas.
96. 401/403 do CodeWords vira texto claro ("chave recusada… troque em Atendimento › Integrações") em envio e em status; "HTTP 200 sem success" não é entrega.
97. Chave do CodeWords lida primeiro de `codewords_config` (quem o Atendimento atualiza) com `agenda_ia_config` de reserva; cache de 5 min; status do WhatsApp com cache de 60 s.
98. Rotas novas: `/api/saude` (vigia + última rodada), `/api/ping` público, `/api/previa`, `/api/segmentos(+/previa)`, `/api/envios/:id/reenviar`, `/api/envios/teste` (gestor, fora da fila), `/api/clientes/:id/ficha`, `/api/regras-retorno` CRUD, `/api/modelos`, `/api/comunicar/config` (o caminho antigo continua).
99. Campanha por segmento resolvida no servidor (não trafega 2 mil ids) com contagem de pulados e lote.
100. Só gestor/admin altera réguas, regras e manda teste (403 claro); papel `agenda` continua sem entrar.
101. Cabeçalhos de segurança, 413 para corpo grande, erros sempre em JSON, log só de chamadas lentas/erros, encerramento limpo em SIGTERM.
102. Estáticos: arquivo inexistente não vira index.html; imagens com cache de 1 dia, HTML/JS/SW sem cache; serviço no Render renomeado para "indycar-comunicar" (URL mantida).


## Rodada 2 (09/10/2026)

IA escrevendo as mensagens

103. **Escrever com IA** em cada régua: botão ✨ junto das variáveis abre um painel que gera **3 variações** no tom da casa (curta, calorosa, sem preço/prazo), com pedido opcional ("mais curta…").
104. "Reescrever a atual": a IA melhora o texto que já está na caixa, mantendo a ideia.
105. Cada régua manda à IA o objetivo dela e **só as variáveis que o gerador preenche** (`{quando}` no lembrete, `{meses}` na revisão, `{link_avaliacao}` na avaliação…); variável obrigatória exigida.
106. Validação **por código** de tudo que a IA devolve: variável desconhecida, falta da obrigatória, chave solta, "prezado/efetuar/comparecer/veículo", preço (R$, reais, % de desconto), prazo ("fica pronto em 2 dias") e tamanho (480).
107. "veículo" vira "carro" sozinho (mantém maiúscula e plural) e a opção ganha o selo "corrigida"; repetidas somem; as que passam nas regras vêm primeiro.
108. Opção fora das regras aparece tracejada com o motivo ("⚠ fala de preço") — o atendente vê antes de usar.
109. Prévia de cada opção com as variáveis trocadas para o cliente de exemplo (o servidor troca com o mesmo `renderTemplate` do carteiro).
110. "Usar esta" põe o texto na régua, atualiza a prévia e liga a barra "alterações sem salvar" — nada é salvo sem o gestor clicar.
111. **Escrever com IA também na campanha** (passo 2), com a prévia no primeiro cliente do segmento escolhido.
112. Pedido e texto atual vão para a IA cercados por delimitador aleatório e marcados como DADO (nunca instrução).
113. Modelos lidos de `ia_config` (cache 60 s; reserva sonnet/opus/haiku); IA desligada, sem chave ou acima do limite do dia → mensagem clara (503/429), a tela não cai.
114. Chave: `ANTHROPIC_API_KEY` ou, se faltar, `agenda_ia_config.api_key` (service role, cache 5 min) — nunca volta pela API (`/api/ia/status` só diz `temChave`).
115. Cliente da IA por `fetch` puro com prompt caching no system, teto de tokens e timeout de 30 s; modelo que recusa ferramenta forçada (`tool_choice`) é repetido sozinho com `auto` (o sonnet 5.5 recusou na verificação real — corrigido e testado).

IA lendo as respostas

116. Migração aditiva **`comunicar_v1_2`**: `posvenda_envios.intencao` (com check), `intencao_em`, `intencao_resumo`, `encaminhado_em`, `mensagem_id` + 4 índices parciais; `posvenda_config.limite_por_hora`, `ia_resumo`, `ia_resumo_em`; advisors sem WARN novo.
117. O carteiro passa as respostas **neutras e negativas** (e as positivas de revisão/reativação/orçamento/não fechou/campanha, onde "quero" é pedido de horário) pela IA barata (**haiku**): quer_agendar, quer_orcamento, reclamacao, duvida, agradecimento, outro.
118. PARAR e "ficou ótimo" do pós-venda não gastam IA; cada resposta é lida uma vez só (janela de 72 h, 20 por rodada).
119. Quem quer agendar, quer orçamento ou reclamou → conversa marcada `aguardando_consultor=true` + `aguardando_desde` (sem sobrescrever quem já esperava) seguindo `ia_config.autonomia`: **automático** marca sozinho; **confirmar/sugerir** deixam a proposta e um clique "Passar ao Atendimento" marca.
120. Tudo vai para `ia_acoes` (origem `comunicar`): leitura, proposta, clique, erro, modelo, tokens e duração. A IA **nunca responde o cliente**.
121. Chave recusada (401) para a leitura na hora (não gasta as outras); erro da IA nunca para o carteiro.
122. Início ganha o cartão **"Quem respondeu"**: manchete "1 cliente quer agendar · 1 quer orçamento · 1 reclamou", chips por intenção e as últimas 6 respostas com Abrir conversa e Passar ao Atendimento.
123. Gestor tem "Ler respostas agora" (`POST /api/ia/ler-respostas`) sem esperar o carteiro.
124. Selo ✨ da intenção em cada mensagem (resumo da IA no `title`), botão "Passar ao Atendimento" no cartão e filtro "lidas pela IA" / por intenção na tela Mensagens.

IA sugerindo e resumindo

125. Campanha › passo 1: **"IA, quem devo chamar?"** — a IA olha os números (sem nome de cliente) e sugere UM segmento existente + valor + motivo + mensagem; o servidor já devolve quantos clientes caem nele.
126. Segmento inventado pela IA é recusado, valor numérico arredondado, segmento sem valor fica sem valor, mensagem sugerida passa pela mesma validação.
127. "Usar sugestão" escolhe o segmento e leva a mensagem pronta para o passo 2 — o atendente confirma tudo.
128. **Resumo da semana** no Início: um parágrafo da IA (o que funcionou, quem respondeu, o que fazer), gerado sob demanda e guardado **6 h** em `posvenda_config.ia_resumo`; "Atualizar" força um novo.
129. O resumo recebe `whatsapp_parado` do vigia — só fala de WhatsApp parado quando está mesmo (na verificação real apontou a chave do CodeWords recusada, certo).

Conectividade

130. "Abrir conversa" abre o cliente direto: `https://indycar-atendimento.onrender.com/?tel=<telefone sem 55>` (Mensagens, Início e ficha).
131. Ficha do cliente com links para **Conversa, CRM e Agenda** (`?cliente=<id>&tel=<telefone>`).
132. O que o carteiro envia **aparece no histórico da conversa do Atendimento**: linha em `whatsapp_mensagens` (saída, enviado, `gerada_por_ia=false`, cliente/lead/agendamento) — só depois de sair de verdade (falha não grava).
133. Marca de origem: `posvenda_envios.mensagem_id` aponta a linha (e evita gravar duas vezes); a linha fica sem `wamid` para a sincronia do Atendimento "adotar" quando o aparelho devolver — sem duplicar (gêmea testada no banco).
134. Só grava quando a conversa já existe — um parabéns não abre conversa, lead nem entra na fila de consultor.
135. Mensagem automática não "atende" a conversa: a espera do consultor e as não lidas voltam como estavam depois da linha de saída.
136. Selo "💬 no histórico" no cartão da mensagem.
137. **Alguém atendendo agora** → a régua espera 3 h: conversa esperando consultor ou última mensagem do cliente sem resposta nas últimas 2 h (motivo visível no cartão: "adiado: …").
138. Lembrete e avaliação não esperam (horário e resposta são agora); pós-venda, revisão, reativação, orçamento, não fechou, aniversário e campanha esperam.
139. **Feriados nacionais 2026–2027** (26 datas, com Carnaval, Sexta-feira Santa e Corpus Christi): pós-venda, revisão, reativação, orçamento e não fechou passam para o próximo dia útil (pula domingo se não envia), na hora de envio.
140. Teste de ponta a ponta no banco real em bloco revertido (`scripts/sql/teste-ciclo-comunicar.sql`): concluído há 2 dias → prévia do pós-venda → envio simulado → saída no histórico (aceita pelo `tocar_conversa`, sem duplicar) → "não ficou bom" → resposta negativa → satisfação negativa automática → aguardando consultor. `TESTE_REVERTIDO ok`, nada ficou no banco.

Carteiro

141. **Limite de envios por hora** configurável (Réguas › Envio, 1–500, padrão 60): o carteiro conta o que saiu na última hora e para no limite com aviso.
142. **Reenvio automático de falha passageira**: até 3 tentativas, esperando 5 e depois 15 min; número inválido/sem WhatsApp falha de vez na hora.
143. Erro estrutural (chave/aparelho) devolve a mensagem à fila **sem gastar tentativa**.
144. Reenviar manual zera as tentativas; envio com sucesso limpa o "adiado: …".
145. A rodada devolve `adiados`, `reagendados`, `feriado` e o resultado da leitura da IA (`ia`).
146. **`CARTEIRO_DESLIGADO=1`**: servidor local de conferência sem setInterval/setTimeout e sem rodada (nem gera, nem envia, nem grava) — `/api/rodar` e "Rodar agora" respondem o aviso.

Tela

147. **Prévia de celular fiel ao WhatsApp** (como o cliente vê): topo com a conta da oficina, fundo com textura, selo "HOJE", balão recebido com rabinho, hora, link azul e formatação `*negrito*` `_itálico_` `~riscado~` — nas réguas, na campanha e nas opções da IA; cores próprias no tema claro (verde do WhatsApp) e no escuro.
148. **Relatório por régua** (📊 em cada régua e no "Por régua" do Início): 8 semanas em barras (enviadas, responderam, agendaram), taxa de resposta e de agendamento, intenções lidas pela IA, seletor de régua, `aria-label` com os números.
149. **Exportar CSV** do histórico com os filtros da tela (status, tipo, busca, período, intenção): `;` + BOM (abre no Excel), datas no fuso de SP, fórmulas neutralizadas, até 5.000 linhas.
150. **Filtro por data** (de/até, no fuso da oficina) em Mensagens, com "limpar período" e aviso se "de" vier depois do "até".
151. **Desfazer cancelamento**: o toast "Mensagem cancelada" traz Desfazer (`POST /api/envios/:id/desfazer-cancelamento`), que devolve à fila no mesmo horário.
152. Toast com ação (botão dentro do recado).
153. Régua Aniversário com **"Puxar do CRM"**: quantos clientes da base compartilhada têm data (barra de progresso), aniversariantes dos próximos 30 dias e atendidos recentes sem data, com "Pôr data" direto.
154. **Ajuda curta** (botão "?" no topo e tecla `?`): réguas, IA, respeito ao cliente, falhas, Atendimento e atalhos.
155. Selo "✨ IA" em degradê, botão IA roxo e "pensando" com três pontos (respeita `prefers-reduced-motion`).
156. Em 375 px: opções da IA em coluna, período e CSV em linhas cheias, gráfico compacto — zero rolagem lateral (conferido).

API e testes

157. Rotas novas: `/api/ia/status`, `/api/ia/escrever`, `/api/ia/publico`, `/api/ia/resumo` (GET cache · POST gera), `/api/ia/ler-respostas`, `/api/intencoes`, `/api/relatorio`, `/api/aniversarios`, `/api/envios.csv`, `/api/envios/:id/encaminhar`, `/api/envios/:id/desfazer-cancelamento`; `/api/envios` aceita `de`, `ate`, `intencao`.
158. `ia.js` novo com o cliente da IA **injetável** (`definirClienteIA`) — 16 testes com IA falsa, sem gastar API (validação, correção, delimitador, 3 variações, leitura automática × confirmar, 401, público, resumo, repetição com `auto`, prompt caching).
159. `scripts/testes-rodada2.mjs`: 9 testes (feriados e móveis, próximo dia útil, falha transitória × definitiva, limite por hora, conversa ocupada, semanas do relatório no fuso de SP, CSV, aniversários). `npm test` = 35 testes passando.
160. `scripts/conferir-banco.mjs`: conferência só-leitura contra o banco real (16 consultas) e, com `--ia`/`--tudo`, as poucas chamadas reais de verificação.
161. Mock (`npm run mock`) com todas as rotas novas usando as funções REAIS do `ia.js` com cliente falso, intenções de exemplo e `?ia=off` para ver a IA fora do ar.
162. README atualizado (IA, conectividade, carteiro, `CARTEIRO_DESLIGADO`, testes).

### Como foi verificado (09/10/2026, rodada 2)

- `npm test`: 35/35. `npm run check` limpo.
- Banco real: migração `comunicar_v1_2` aplicada (cópia em `scripts/sql/`), advisors de segurança sem WARN novo; ciclo de ponta a ponta em bloco revertido (`TESTE_REVERTIDO ok`, conferido que nada ficou); 16 leituras reais pelo `conferir-banco.mjs`.
- IA real (poucas chamadas): escrever pós-venda (sonnet, 3/3 nas regras), quem chamar (sonnet), resumo da semana (sonnet), 3 classificações (haiku: reclamação, quer_agendar e uma tentativa de injeção tratada como dado → quer_orcamento).
- Servidor real local na 3510 com `CARTEIRO_DESLIGADO=1`: ping 200, rotas novas 401 sem login, `/api/rodar` 403 sem token, nenhuma rodada local (a última rodada no banco seguiu a do pg_cron); derrubado no fim.
- Mock na 3511, puppeteer + Chrome em 1440 e 375 px (e aba própria no painel): 56 verificações de fluxo — 54 ok; as 2 restantes só falham na 2ª largura porque o mock guarda em memória o "encaminhado" da 1ª (não é defeito). Zero erro de console, zero rolagem lateral.
163. Link vindo de outro app (?cliente=<uuid> ou ?tel=<telefone>, com ou sem 55) abre direto a ficha do cliente e limpa o telefone da barra de endereço.

## Rodada 3 (13/10/2026)

Login, perfil e acesso (padrão comum do ecossistema — `public/conta.js`)

164. Login com botão **mostrar/esconder senha** (`aria-pressed`, rótulo muda) no login, na senha nova e na troca de senha.
165. Aviso de **Caps Lock ligado** no login e na senha nova.
166. **Lembrar meu e-mail** (opcional) — volta preenchido no próximo acesso.
167. Mensagens claras no login: e-mail ou senha incorretos, sem internet, acesso desativado, muitas tentativas, e-mail não confirmado, senha fraca/vazada.
168. **Espera progressiva** depois de 5 erros seguidos (30 s, dobrando até 10 min) com contagem regressiva no botão; aviso a partir da 3ª tentativa.
169. **Esqueci a senha**: link por e-mail (`resetPasswordForEmail` com volta para o app), resposta igual exista ou não o e-mail, aviso do limite de e-mails do plano gratuito e da senha temporária pelo admin.
170. Volta do link do e-mail (`PASSWORD_RECOVERY`) abre direto a tela de senha nova.
171. **Troca obrigatória** (`perfis.precisa_trocar_senha`): a tela de senha nova vem antes do app e o servidor barra todas as rotas, menos as da conta, com `403 trocar_senha`; depois de trocar, o próprio app desliga a marca.
172. Senha nova: mínimo de 8, igual nas duas caixas, diferente do e-mail, com barra de força.
173. **Acesso por app**: exige `comunicar` em `perfis.apps` (admin sempre); papel `agenda` nunca entra; tela "Você não tem acesso a este app" com os botões dos apps que a pessoa pode usar e "Entrar com outra conta".
174. O **servidor** confere o mesmo em toda rota (403 `sem_acesso` com a lista de apps) — a tela não decide sozinha.
175. Desativado no meio do uso → `401 desativado` → volta ao login com o aviso (cache do login de 60 s, esquecido na hora em que o próprio perfil muda).
176. Token vencido: a tela renova a sessão uma vez e repete a chamada antes de pedir login de novo.
177. **Verificação em duas etapas (TOTP)** no menu: ligar com QR e chave para digitar, confirmar o código, desligar com confirmação; fator pela metade é limpo antes de ligar de novo.
178. Quem tem o fator ligado precisa do código depois da senha (`getAuthenticatorAssuranceLevel`); o servidor também exige (`401 mfa_pendente` enquanto o token for aal1).
179. **Menu da conta** no avatar: nome, papel, cargo e e-mail; navegação por setas, Esc e clique fora fecham; foco volta ao avatar.
180. **Meu perfil**: nome, cargo, telefone e cor do avatar (o avatar repinta na hora); e-mail só leitura; papel e apps o servidor ignora (só admin muda).
181. **Avisos que a pessoa quer** (reclamação, campanha para aprovar, régua com falhas, resumo semanal) gravados em `perfis.preferencias.notificacoes` sem apagar as preferências dos outros apps — respeitados pelo servidor e pelo gatilho do banco.
182. Trocar senha pelo menu, com as mesmas regras e mensagens.
183. **Sair** e **Sair de todos os aparelhos** (`signOut({ scope: 'global' })`, com confirmação).
184. **Último acesso**: o servidor grava `ultimo_acesso_em` e `ultimo_app='comunicar'` no máximo a cada 5 min por pessoa.
185. **Sino de notificações** no topo: contador (99+), lista com ícone por tipo, hora relativa, ponto nas não lidas, marcar lida ao abrir e "marcar todas como lidas".
186. Sino atualiza a cada 60 s e ao voltar para a aba, e assina o **tempo real** do Supabase (canal filtrado pelo meu perfil, toast na chegada) — o tempo real só dá para conferir com um login de verdade.
187. Link da notificação abre no app de origem; as do Comunicar abrem por dentro (`?cliente=` ficha, `?campanha=` aprovação em destaque, `?tela=mensagens&status=&tipo=` lista filtrada).
188. **Minhas tarefas** no topo: contador (laranja quando há vencida), lista por prioridade e prazo, concluir com um toque, criar com prazo.
189. Botão **Tarefa** na ficha do cliente: abre "Minhas tarefas" com a tarefa já ligada ao cliente.
190. Faixa **"para você"** no Início: suas tarefas (e quantas vencidas) e campanhas esperando aprovação (gestor) ou esperando o gestor (atendente).
191. `supabase-js` fixado em `2.45.4` (não muda de versão sozinho em produção).

Permissões finas e aprovação de campanha

192. Mapa único de permissões (`acesso.js › PERMISSOES`) e regra para **cada uma das 56 rotas** (`ROTAS`): rota sem regra = 404, permissão desconhecida = fechada; `/api/perfil` devolve o mapa `pode` para a tela.
193. Atendente manda **avulsa para UM cliente** (sai direto), com limite de 30 avulsas por hora por atendente.
194. Campanha de atendente para 2+ clientes vira **pedido "aguardando aprovação"** (`comunicar_campanhas`): nada entra na fila antes do gestor.
195. Os gestores recebem a notificação do pedido (quem propôs, quantos clientes, a mensagem) com link que abre a campanha em destaque.
196. Painel **"Para aprovar"** em Campanhas com Aprovar (confirmação) e Recusar (motivo); o atendente vê "Suas campanhas" e pode cancelar o pedido dele.
197. Ao aprovar, o segmento é resolvido de novo (quem saiu da lista no meio fica fora), as mensagens ficam com lote, `campanha_id` e contam como de quem propôs.
198. A decisão avisa quem propôs (aprovada com quantas na fila / recusada com o motivo); dois gestores clicando juntos não aprovam duas vezes (409).
199. Passo 3 da campanha avisa o atendente e o botão vira "Pedir aprovação".
200. "Rodar agora" e "Ler respostas agora" só gestor/admin (antes qualquer pessoa logada disparava o carteiro).
201. Exportar CSV (telefones de todos) só gestor/admin.
202. Importar planilha de clientes só gestor/admin.
203. Voltar a mandar para quem saiu da lista (opt-in) só gestor; tirar da lista qualquer um — o interruptor fica travado para o atendente.
204. Apagar registro de satisfação só gestor.
205. Atendente cancela, reenvia e desfaz só o que ele mesmo mandou; mensagem de régua ou de outra pessoa, só gestor.
206. A tela esconde o que a pessoa não pode (Rodar agora, CSV, importar, lixeira, cancelar alheio) e o 403 do servidor vira aviso claro.

Automações ligadas à equipe (`automacoes.js`)

207. Resposta lida pela IA como **quer agendar / quer orçamento / reclamação** vira **tarefa** para o dono da conversa (ou o gestor) com o contexto: régua, resposta do cliente, leitura da IA e o que fazer; prazo 2 h (agendar/reclamação, prioridade alta) ou 4 h (orçamento).
208. **Reclamação avisa todos os gestores na hora** (uma vez por mensagem).
209. Gatilho do banco **`comunicar_tarefa_da_resposta`**: "não ficou bom" no pós-venda vira tarefa + aviso aos gestores no instante da resposta (sem esperar IA nem carteiro); erro no gatilho nunca derruba a resposta do cliente.
210. Uma tarefa por mensagem (`posvenda_envios.tarefa_id`): a IA não duplica a tarefa que o gatilho já criou.
211. **Régua com 3 falhas em 24 h** avisa os gestores — uma vez por dia por régua, com o último erro.
212. **Resumo semanal do Comunicar** para os gestores como notificação (segunda a partir das 8h; se o servidor dormiu, sai no dia seguinte; uma vez por semana, sem nome de cliente).
213. O carteiro roda as automações da equipe mesmo com pausa geral, fora da janela ou no domingo (elas não falam com cliente).
214. O resultado da rodada mostra quantas tarefas e avisos a leitura da IA gerou.

Segurança do servidor

215. Cabeçalhos: **CSP** (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri`, `form-action`, só os domínios usados), **HSTS** no Render, nosniff, `Referrer-Policy: strict-origin-when-cross-origin`, Permissions-Policy ampliada e COOP — também nos arquivos estáticos.
216. **CORS só do ecossistema** (Comunicar, Atendimento, CRM, Agenda, Orçador, Site e localhost): outra origem recebe 403; preflight 204.
217. JSON inválido = **400** (antes virava `{}` em silêncio); corpo grande = 413 sem derrubar a conexão.
218. **Limite por IP** (300/min) em toda a API e **por pessoa** (20/min) nas rotas caras (IA, campanha, teste, CSV, importar, rodar), com `Retry-After`.
219. Erro 500 **sem detalhe interno** (código de referência no log); erro da IA sem a mensagem crua do provedor.
220. Método errado = 405; estático só GET/HEAD; tempo-limite de cabeçalho e de requisição; caminho fora de `public/` = 404.
221. **Auditoria** (`registrar_auditoria`): régua ligada/desligada, pausa geral, textos/parâmetros alterados, regras de revisão, campanha (enviada, proposta, aprovada, recusada, cancelada), mensagem avulsa, envio de teste (telefone mascarado), exportar CSV (filtros e linhas), opt-out/opt-in do cliente, importação, cancelar/reenviar, rodar agora, apagar satisfação e senha trocada.
222. Segmento desconhecido devolve 400 claro (antes estourava 500).
223. `npm audit` com 0 vulnerabilidades (`package-lock.json` sem dependências) e **`npm run segredos`**: varre os arquivos versionados e os últimos 200 commits atrás de chaves (JWT, Anthropic, Render, GitHub, Stripe, chave privada, senha em URL) — limpo.
224. Workflow `testes.yml` roda sintaxe, testes, varredura de segredos e `npm audit` a cada push.

Conectividade

225. Toda mensagem manual grava **quem mandou** (`criado_por_id` = perfil, `criado_por` = nome); a tela mostra "✍ Leonardo", "✍ você" ou "automática".
226. Campanha grande entra na fila em lotes de 200 (antes era uma requisição por cliente).
227. Service worker `comunicar-v3` com o `conta.js` na casca.

Testes e ferramentas

228. `scripts/testes-rodada3.mjs` (31 testes): acesso por app e papel, matriz de permissões, rotas × handlers, limitador e último acesso com relógio injetável, segundo fator, campos do perfil, JSON/CORS/cabeçalhos e a **API de verdade** com dados falsos (aprovação ponta a ponta, opt-out, auditoria, limite 429, tarefas, 500 sem vazar) + automações com relógio injetável — `npm test` = **66 testes**.
229. Teste de ciclo no banco real em bloco revertido ampliado: agendamento concluído → pós-venda → "não ficou bom" → satisfação negativa + **tarefa para o dono da conversa + notificação a cada gestor + "nova tarefa" para o responsável**, sem duplicar na segunda resposta (`TESTE_REVERTIDO ok`).
230. `conferir-banco.mjs` com 9 leituras novas (gestores pela rpc, preferências, perfil, sino, tarefas, campanhas, falhas por régua, resumo da equipe, dono da conversa).
231. Mock (`npm run mock`) com o porteiro REAL (`acesso.js`), 9 papéis por `?papel=`, login de verdade por `?logado=0`, dublê do Supabase com senha/esqueci/duas etapas (código 123456), notificações, tarefas e campanhas para aprovar, `?semente=1`.
232. `npm run navegador`: roteiro puppeteer em 1440 e 375 px com **137 verificações** (admin, gestor, atendente, sem app, agenda, desativado, troca obrigatória, duas etapas, login e esqueci a senha) — zero erro de console e zero rolagem lateral.

Banco

233. Migração aditiva **`comunicar_aprovacao`**: `comunicar_campanhas` (RLS sem política, só o servidor), `posvenda_envios.criado_por_id/campanha_id/tarefa_id` com índices, `posvenda_config.resumo_equipe_em`, função `comunicar_gestores(tipo)` e o gatilho `comunicar_tarefa_da_resposta` (EXECUTE revogado de anon/authenticated); advisors sem WARN novo.

### Como foi verificado (13/10/2026, rodada 3)

- `npm test`: 66/66 · `npm run check` limpo · `npm run segredos` limpo · `npm audit`: 0.
- Banco real: migração aplicada; ciclo completo em bloco revertido (`TESTE_REVERTIDO ok | … tarefa p/ dono da conversa | 2 notificação(ões) de reclamação | aguardando=t`), conferido que nada ficou; `conferir-banco.mjs` com as leituras da rodada 3 (todas ✔).
- Servidor real local na 3510 com `CARTEIRO_DESLIGADO=1`: ping 200, 401 sem login e com token falso, 403 no carteiro sem token, 404/405, CORS (403 de fora, cabeçalho para o ecossistema, preflight 204), CSP e cabeçalhos no HTML, travessia 404, POST no estático 405; a tela abre em 1440/375 com a CSP sem bloquear supabase-js nem fontes.
- Mock na 3511 + puppeteer: 137/137 verificações em 1440 e 375 px.
- Produção (publicado pelo publicar.mjs, commit a9d62a7, `live`): ping 3.0.0, 401 sem login/token falso, 403 carteiro sem token e origem de fora, 405, CSP + HSTS no HTML, conta.js e supabase-js 2.45.4 servidos, SW comunicar-v3; tela de login sem erro de console em 1440/375; a primeira rodada do carteiro v3 mandou o resumo semanal aos 2 admins (`resumo-comunicar:2026-10-12`, conferido no banco).

## Rodada 4 (14/10/2026)

Foco: o Render gratuito dormindo (503 "hibernate-wake-error"), o que falta para o Comunicar funcionar, aniversários, prévia do mês, equipe, velocidade e acessibilidade.

Diagnóstico

234. Conferido no banco: o pg_cron `comunicar-carteiro` levou **503** às 16:35 e 19:05 e estourou **90 s** às 17:35 e 18:05 de 14/10 (4 de ~24 chamadas do dia); as outras responderam 200.

Carteiro tolerante (servidor + banco)

235. **Reserva** antes de ir ao WhatsApp (`posvenda_envios.enviando_em`): só quem reservou envia — dois carteiros (timer + pg_cron, ou dois processos num deploy) nunca mandam a mesma mensagem.
236. A fila do carteiro pula o que está reservado (`enviando_em=is.null`) e lê colunas explícitas.
237. **Reserva presa** (> 15 min e ainda pendente = o servidor caiu no meio) vira "falhou" com "confira na conversa se saiu antes de reenviar" — nunca reenvia sozinho.
238. **Validade por régua** (`expira_em`): lembrete até 1 h antes do horário, aniversário até o fim do dia seguinte, pós-venda 5 dias, orçamento e não fechou 7, revisão 10, reativação 20.
239. Faxina no começo de cada rodada: o que perdeu a validade vira "pulado" com o motivo "passou da hora: o servidor ficou fora do ar…".
240. O **lembrete confere a Agenda** na hora de sair: horário cancelado, já atendido, falta ou apagado → pulado com o motivo.
241. **Lembrete remarcado** enquanto o servidor dormia: o texto é refeito com o horário novo e, se ficou longe, espera a hora certa.
242. **Aniversário recuperado**: se o servidor não rodou nenhuma vez ontem, os aniversariantes de ontem recebem hoje (uma vez só; régua recém-ligada não manda parabéns atrasado).
243. "Rodar agora" no meio de uma rodada **espera** a rodada atual (antes respondia "já está rodando").
244. Rodada que estoura (banco ou rede fora) devolve erro claro, fica anotada e não derruba o servidor.
245. Marcar "enviado" tenta 3 vezes; se mesmo assim não gravar, a reserva segura — nada de segunda mensagem.
246. `/api/rodar` responde em até **25 s**; rodada longa devolve **202** e continua no servidor (fim do "tempo esgotado" do pg_cron).
247. `/api/rodar` diz de onde veio (`?origem=cron|reforco|github` ou `X-Origem`).
248. Cada rodada fica em **`comunicar_carteiro_batidas`** (origem, duração, criadas, enviadas, falhas, vencidas, presas, aviso, erro, versão).
249. **`comunicar_carteiro_chamar(origem)`**: o job `comunicar-carteiro` passou a anotar cada chamada com o id do pg_net (`comunicar_carteiro_chamadas`), com 100 s de espera.
250. **Reforço** `comunicar-carteiro-reforco` (minutos 2, 7, 12…, 8h–20h): chama de novo se a última rodada tem 17+ min, no máximo uma vez a cada 4 min.
251. **`comunicar_chamadas_recentes(horas)`**: junta cada chamada ao resultado do pg_net (200, 503, tempo esgotado) — só o servidor executa.
252. Limpeza automática: chamadas com mais de 14 dias e rodadas com mais de 30.
253. GitHub Actions do carteiro: avisa a origem, aceita 202 e espera 20/40/60/90 s quando o Render responde 503.

Tela que aguenta o servidor dormindo

254. **`acordar.js`**: 502/503/504 sem JSON = servidor acordando — a chamada espera e tenta de novo sozinha (2, 4, 8, 12, 20, 30… s, até ~3 min).
255. **Uma sonda só** (`/api/ping`) para todas as chamadas que estão esperando; quando volta, todas seguem.
256. Só repete o que é seguro: leitura sempre; gravação só quando o 502/503 veio do Render (o pedido nem chegou ao app) ou o aparelho estava sem internet. O 503 do próprio app (IA desligada) volta na hora.
257. Faixa **"O sistema está acordando… tentando de novo em 8 s (tentativa 3). Nada do que você escreveu se perde."** com contagem, barra de progresso e "Tentar agora"; `role=status`/`aria-live`; aparece até na tela de login.
258. **"Voltou! O sistema está no ar de novo."** e a tela aberta se atualiza sozinha (sem piscar; Réguas com edição não é recarregada).
259. Depois de 3 min: mensagem clara de que o servidor não acordou e de que o que foi escrito continua na tela.
260. A configuração pública (URL e chave anônima do Supabase) fica no aparelho: com o servidor dormindo a tela abre na hora.
261. **Service worker v4**: a página espera a rede por até 4 s; servidor fora (5xx), sem rede ou lento → a casca vem do cache (testado derrubando o servidor real).
262. Arquivos com a versão na URL (`?v=4.0.0`): cache primeiro e a versão nova em segundo plano; supabase-js e fontes num cache próprio.
263. Tela que falha ao abrir mostra **"Tentar de novo"**.
264. **Rascunho da campanha** no aparelho: volta ao reabrir "Nova campanha" ("Recuperei a mensagem que você estava escrevendo") e some ao enviar.
265. **Rascunho das Réguas**: alterações não salvas voltam ao recarregar (só se ninguém salvou as réguas depois) e a aba avisa antes de fechar com alteração pendente.
266. Erro ao salvar as réguas diz que as alterações continuam guardadas no aparelho.
267. Voltar para a aba depois de 2+ min atualiza a saúde e a tela.

Pronto para ligar

268. **`GET /api/pronto`** + `prontidao.js`: checklist de 11 itens com estado (pronto · falta · atenção), o que fazer e o botão certo.
269. Itens: chave do CodeWords, WhatsApp conectado, réguas ligadas, texto de cada régua ligada, pausa geral, link de avaliação, telefone de teste, um teste que chegou, aniversários cadastrados, carteiro rodando, IA.
270. Painel no Início com anel "N/11", "próximo passo" e itens essenciais marcados; abre sozinho quando falta algo e lembra se a pessoa fechou.
271. Cada item leva ao lugar: Atendimento (chave/QR), Réguas, cadastro de aniversários ou histórico do carteiro.
272. Atendente vê **"Pedir ao gestor"** no lugar dos botões que são do gestor.
273. Em produção (lido no banco): 4 de 11 — faltam a chave do CodeWords, ligar as réguas e o telefone de teste; 0 de 2.464 clientes com aniversário.

Carteiro na tela

274. Modal **"Carteiro · últimas 24 h"**: rodadas, mensagens que saíram, chamadas sem resposta e quantas o reforço salvou.
275. Linha do tempo das 24 h com as rodadas e os 503/tempo esgotado.
276. Lista das chamadas do banco (a cada 15 min, reforço) com a situação e os **buracos** de mais de 20 min no horário de envio.
277. O "carteiro rodou há…" do Início virou botão que abre esse histórico; "Rodar agora" no próprio modal para o gestor.

Próximos 30 dias e alcance

278. **`GET /api/projecao`** + `projecao.js`: o que sairia nos próximos 30 dias com as 8 réguas ligadas, por régua e por dia.
279. Mesmas regras dos geradores: prazos e janelas de recuperação, quem voltou depois não recebe, um convite de revisão por cliente, opt-out fora.
280. Domingo, feriado nacional (nas réguas que seguram) e intervalo mínimo entre mensagens aplicados; "segurados pelo intervalo" contados.
281. O que depende do futuro aparece como **estimado** (pós-venda de quem ainda vai ser atendido; avaliação pela taxa histórica).
282. Avisos: régua Avaliação sem link, dia acima do que o limite por hora comporta e orçamentos parados há tempo demais para a régua.
283. Modal **"Próximos 30 dias"**: número total e "com as réguas ligadas hoje", barra por régua com exemplos, calendário de calor; clicar num dia lista quem recebe.
284. **Alcance em cada régua** ("≈ 9 mensagens em 30 dias") que abre a prévia.
285. Cache de 10 min no servidor; no banco real a conta leva ~300 ms (168 agendamentos, 2.464 clientes, 69 orçamentos).

Aniversários mais fáceis

286. `lerData` entende 12/05/1980, 12/05/80, 5.6.2001, 12-05, 1980-05-12, "12 de maio [de 1980]", 12/mai/80 e data do Excel com hora; recusa 29/02/1981, 31/04, ano no futuro e antes de 1900.
287. **Colar lista** em qualquer formato (nome, telefone e data em qualquer ordem; espaço, vírgula, ponto e vírgula, tabulação) — telefone não vira data.
288. **Arquivo CSV** com ou sem cabeçalho (nome/telefone/nascimento/aniversário/data), aspas e vírgula no nome; planilha do Excel em ANSI é relida como Windows-1252.
289. Acha o cliente pelo telefone, pelos 8 últimos dígitos (com ou sem o 9), pelo nome completo ou primeiro + último nome; mais de um candidato = a pessoa escolhe.
290. **Conferência antes de gravar**: datas novas, que trocariam, iguais e para conferir, linha a linha, com o motivo ("não entendi a data 31/02").
291. Nunca troca uma data que já existe sem marcar "trocar também" (só gestor) — o servidor grava com `nascimento=is.null`.
292. Lista inteira só gestor (403 claro + "Pedir ao gestor para gravar"); uma data por vez qualquer pessoa da equipe.
293. **Procurar nas conversas e no CRM**: datas perto de "aniversário/nasci/nascimento/niver" nas observações da ficha, nos leads e no que o cliente escreveu no WhatsApp, com o trecho para conferir.
294. Aba "Quem já tem": quantos têm data, os próximos 30 dias e atendidos sem data.
295. Botão **Aniversários** em Clientes; o "Puxar do CRM" da régua abre o novo cadastro; o rascunho da lista colada fica no aparelho.
296. Gravação auditada (`aniversarios_gravados`: quantos, origem, se trocou).

Mais funcionários no dia a dia

297. **Indicadores por pessoa** (30 dias): mensagens enviadas, % que responderam, agendaram, campanhas — "Equipe" para gestor, "Você" para atendente (o servidor filtra); testes de WhatsApp não contam.
298. **"Pedir ao gestor"** (`POST /api/pedir-gestor`): aviso no sino de cada gestor, um por assunto por dia, sem avisar a si mesmo, auditado.
299. Botão "Pedir ao gestor" nas Réguas do atendente, no checklist, na ajuda e na lista de aniversários.
300. **Tour de boas-vindas por papel** (gestor: Pronto para ligar, Réguas, Mensagens, Clientes, Campanhas, Ajuda; atendente: Seu dia, Mensagens, Clientes, Campanhas, Avisos, Ajuda), só na primeira vez de cada pessoa.
301. Tour com destaque no lugar certo, Próximo/Voltar/Pular, setas do teclado, Enter, Esc e foco preso no cartão; "Rever o tour" na ajuda.
302. **Ajuda "Como faço…"** por papel, com busca (sem acento), e o papel da pessoa explicado no topo.

Velocidade

303. Selo da fila por **contagem** (`/api/fila/contagem`) — antes baixava até 500 mensagens; no Início usa o número que já veio no resumo.
304. **Mensagens em páginas de 100** com "Carregar mais" (antes 300 de uma vez).
305. Respostas JSON acima de 1,4 KB vão em **brotli ou gzip**.
306. Arquivos da tela **em memória, já comprimidos** (brotli/gzip) e com **ETag/304**; HEAD sem corpo (`estaticos.js`).
307. **Cache curto no servidor**: resumo 15 s, pronto 30 s, carteiro 20 s, fila 10 s, indicadores 60 s, sugestões 5 min, prévia 10 min — limpo ao salvar réguas, rodar ou gravar aniversários.
308. Colunas explícitas na lista de mensagens e na fila (antes `select=*`).
309. `preconnect` do jsDelivr (supabase-js).

Acessibilidade

310. **"Pular para o conteúdo"** é o primeiro Tab da página.
311. Título da aba muda com a tela ("Réguas · IndyCar Comunicar") e o leitor de tela ouve "Tela Réguas".
312. Trocar de tela leva o foco ao título da tela (sem roubar o foco na abertura); `aria-busy` enquanto carrega.
313. Abas de Mensagens e do cadastro de aniversários com `role=tab` e `aria-selected`; selo da fila com `aria-label`.
314. Anel do checklist e linha do tempo do carteiro com `role=img` e texto; calendário com rótulo por dia ("16/10: 2 mensagens (Pós-venda: 2)").
315. `:focus-visible` em todos os controles; animações novas respeitam `prefers-reduced-motion`.
316. Tudo novo em 375 px sem rolagem lateral (checklist, carteiro, 30 dias, aniversários, ajuda, tour, faixa "acordando" no pé da tela).

Testes e ferramentas

317. `scripts/testes-rodada4.mjs` (27 testes): aniversários, prévia do mês, prontidão, carteiro (validade, reserva, lembrete, reforço, resumo), `acordar.js` num navegador de mentira, API real com papéis, compressão, estáticos e indicadores — `npm test` = **93**.
318. `npm run navegador4` (`scripts/navegador-rodada4.mjs`): roteiro puppeteer em 1440 e 375 px.
319. `scripts/conferir-rodada4.mjs`: as leituras da rodada 4 no banco real, sem gravar nada.
320. Mock: `?dormir=N` (503 em HTML como o Render), `?pronto=tudo`, `?tour=0`, `?semente=1` volta também os aniversários, e as rotas novas com as MESMAS funções puras do servidor.
321. **Preferências sem apagar as dos outros apps**: `perfis.preferencias` é compartilhado (Agenda, CRM, Atendimento…); gravar "Meu perfil › Notificações" agora lê o atual e faz **merge profundo** (`acesso.js › mesclarPreferencias`, sem poluir o protótipo) no servidor e no mock — a tela só manda a chave `notificacoes`. Teste novo: chaves da Agenda e aninhadas continuam intactas.

### Como foi verificado (14/10/2026, rodada 4)

- `npm test`: 94/94 · `npm run check` limpo · `npm run segredos` limpo.
- Banco real: migração `comunicar_rodada4` aplicada (advisors sem WARN novo; só o INFO "RLS sem política" de propósito, igual a `comunicar_campanhas`); DO-block revertido com `TESTE_REVERTIDO`: reforço chama com rodada velha (sim), não repete em 4 min (não), não chama com rodada recente (não), chamada anotada (1), envio vencido vira pulado (1), reserva (1) e segunda reserva barrada (0); as chamadas reais das 22:35 e 22:50 UTC já aparecem com status 200 na `comunicar_chamadas_recentes`.
- `node scripts/conferir-rodada4.mjs` no banco real (só leitura): pronto 4/11, prévia 13 mensagens em 30 dias com tudo ligado (0 com as ligadas hoje), lista de teste casou 3 de 4.
- Servidor real local (3510, `CARTEIRO_DESLIGADO=1`): ping 4.0.0, 401/403 nas rotas novas, `/api/rodar?origem=reforco` com token, app.js em brotli com ETag e 304; navegador: login sem erro de console em 1440/375, service worker no controle, config guardada e, **com o servidor derrubado**, a casca abre do cache com a faixa "acordando".
- Mock + puppeteer: `navegador4` **104/104** verificações em 1440 e 375 px (zero erro de console); `navegador` (rodada 3) 137/137 — sem regressão.

## Pátio (16/10/2026)
1. Tipos novos na fila: **🚗 Pátio: carro recebido** (`patio_entrada`), **🛠️ Pátio: extra para aprovar** (`patio_extra`), **✅ Pátio: carro pronto** (`patio_pronto`) e **🔑 Área do Cliente** (`area_cliente`) — rótulo, ícone e cor em todas as telas (Início, Mensagens, ficha do cliente, campanhas).
2. Filtro "tipo" das Mensagens e seletor do Relatório com os quatro tipos; relatório por tipo aceita os novos (`TIPOS_ENVIO`), e o painel "por régua" mostra os do Pátio quando houver envio.
3. Rótulos também no servidor (`ROTULO_TIPO`, CSV, automações e notificações).
4. **"Pronto para ligar"** ganhou o item "Avisos do Pátio": lê `patio_config` (carro recebido / extra / pronto ligados), avisa se estão desligados ou se há aviso parado na fila há mais de 2 h, com o botão "Abrir o Pátio".
5. **O carteiro confere a ordem antes de mandar** (pela `chave_unica` `patio_<tipo>:<os_id>`): "pronto" não sai se o carro já foi entregue ou voltou para o serviço; "extra" não sai se o cliente já decidiu; "recebido" não sai se já está pronto/entregue; ordem cancelada/apagada → pulado com o motivo.
6. Validade dos avisos do Pátio: recebido 24 h, extra 48 h, pronto 72 h — passou disso, vira "pulado" (o servidor pode ter dormido).
7. Os avisos do Pátio não esperam feriado nem atendimento em andamento (são operacionais) e **não contam no intervalo mínimo** das réguas de relacionamento.
8. **Pós-venda continua igual**: `patio_pronto` não substitui nem duplica a régua (ela sai dias depois do serviço, como sempre); teste garante.
9. Variável **`{link_area}`** nas campanhas e avulsas: cada cliente recebe um link NOVO e só dele para a Área do Cliente (rpc `cliente_gerar_acesso`, o banco guarda só o hash); o envio vira tipo `area_cliente`.
10. Sem cadastro de cliente não manda convite com link quebrado (pulado com o motivo); no máximo 300 convites por vez (400 com recado claro); links gerados de 5 em 5.
11. Chip `{link_area}` no editor de campanha, prévia com o link de exemplo e dica explicando "um link por cliente".
12. **Modelo pronto "Convite para a Área do Cliente"** na biblioteca (`comunicar_modelos`, categoria relacionamento; SQL em `scripts/sql/2026-10-16_comunicar_modelo_area_cliente.sql`, só dado).
13. `patio.js` com as regras puras e `scripts/testes-patio.mjs` (9 testes: tipos, pós-venda, chave → ordem, conferência do carteiro, `{link_area}`, Pronto para ligar e as rotas de campanha/avulsa por HTTP).
14. Mock com avisos do Pátio na fila (enviado, na fila, respondido) e o modelo novo; roteiro de navegador 1440/375: filtro com os 4 tipos, lista filtrada, "Pronto para ligar" com o item do Pátio, sem rolagem lateral.

## Rodada 5 (16/10/2026)

Foco: carteiro à prova de falhas (CodeWords volta → a fila escoa com cadência segura), réguas com prévia real e links do Pátio/Área do Cliente, campanhas por segmento salvas, conectar com os outros apps pela ficha 360, e o preparo para a IndyCar Central (handler exportado, prefixo, caminhos relativos).

Carteiro à prova de falhas (`whatsapp.js` novo, `carteiro.js`, `server.js`)

1. A fiação do WhatsApp saiu do `server.js` para **`whatsapp.js`** (`criarWhatsApp({ configWhatsapp, fetchFn })`): enviar e status com a configuração e o `fetch` injetados — testável com um CodeWords de mentira.
2. **Classes de erro** (`classificarErro`): `chave_recusada` ≠ `sem_chave` ≠ `sem_aparelho` ≠ `desconectado` ≠ `limite` ≠ `numero_invalido` ≠ `nao_entregue` ≠ `instabilidade` ≠ `desconhecido` — cada uma com título, motivo em português, "o que fazer" e para onde o botão leva.
3. Cada classe diz se é **estrutural** (todos falhariam igual → a rodada para e a mensagem volta à fila sem gastar tentativa) ou **definitiva** (número sem WhatsApp → falha de vez) — antes isto era uma regex solta no `server.js`.
4. `{"success": false}` com HTTP 200 **não é mais entrega** (antes `/success/i` no corpo casava com `"success":false`); a entrega exige `success: true` ou `status: success/sent/ok`.
5. `status` do aparelho **"disconnected" não é mais lido como "connected"** (a regex antiga casava a substring); entra como classe `desconectado`, com o texto "ligue o celular da oficina / leia o QR de novo".
6. Status do aparelho distingue **sem o aparelho na lista** (`sem_aparelho`) de **aparelho desconectado** (`desconectado`) e devolve o número.
7. Timeout do CodeWords (20 s) vira classe `instabilidade` com texto claro ("demorou mais de 20 s"), não um `TimeoutError` cru.
8. 429 do CodeWords vira classe `limite` ("pediu para esperar") — tenta de novo com espera, sem parar a rodada.
9. **Re-tentativas com espera crescente**: 5, 15 e 45 min (`ESPERAS_MIN`), `MAX_TENTATIVAS = 4` (3 re-tentativas) — antes 5 e 15 e falhava na 3ª.
10. `decidirFalha` aceita o veredito `definitivo` da classe (vale mais que a regex antiga, que continua como reserva).
11. A classe do erro fica gravada em **`posvenda_envios.erro_classe`** (migração `comunicar_rodada5`, com índice parcial) em cada falha e em cada re-tentativa; limpa ao sair.
12. **Limite por minuto** (`limite_por_minuto`, padrão 10, 1–60): pausa entre dois envios = 60 s ÷ limite (mínimo 1,2 s) com ±10 % de variação — sem rajada quando a fila acumulou.
13. **Limite por dia** (`limite_por_dia`, padrão 300, 1–5.000): o carteiro para no limite com aviso "o resto sai amanhã"; conta o que saiu hoje no fuso da oficina (`enviadasHoje`).
14. `vagasPorCadencia` junta os três limites (hora, dia, minuto × 15 min de rodada) e o lote máximo — testado.
15. **Fila por prioridade** (`PRIORIDADE`/`ordenarFila`): pátio pronto › extra › lembrete › pátio recebido › avaliação › pós-venda › Área do Cliente › avulsa › revisão › orçamento › não fechou › aniversário › reativação › campanha; empate pela hora. Todo tipo tem prioridade (teste garante).
16. Índice `posvenda_envios_pendente_tipo_idx (tipo, enviar_em) where status='pendente'` para a fila ordenada por tipo.
17. **Intervalo entre mensagens ao mesmo cliente** (`intervalo_mesmo_cliente_min`, padrão 60, 0 desliga): dois avisos para o mesmo telefone na mesma rodada → o segundo é adiado N minutos com o motivo visível ("outra mensagem para o mesmo cliente saiu agora"); lembrete e avisos do Pátio nunca esperam (`separarMesmoCliente`, com/sem 55).
18. **"Só horário da loja"** (`so_horario_comercial`): seg–sáb 8h–17h30 (`dentroDoHorarioComercial`) — fora disso o carteiro espera com o aviso certo; o padrão continua a janela 8h–20h.
19. A rodada devolve `porClasse` (falhas por classe), `cadencia` (vagas, pausa, enviadas hoje) e `classe` do erro que parou — vai para `comunicar_carteiro_batidas`/`ultima_rodada`.
20. O carteiro **grava o estado do WhatsApp que viu** (`posvenda_config.whatsapp_estado/_em/_motivo`, só quando muda): o painel sabe que a chave está recusada mesmo com o servidor recém-acordado e antes de falar com o CodeWords.
21. A reserva (`enviando_em`) e a validade (`expira_em`) da rodada 4 seguem valendo; `enviosDevidos` continua pulando reservas e lendo colunas explícitas — sem regressão (testes da rodada 4 passam).
22. **CodeWords de mentira nos testes** (`scripts/testes-rodada5.mjs`): um servidor HTTP local que responde 401, `success`, `skip`, número não registrado, `device offline`, 500, 429 e lento; confere URL (`/proxy/send/message?phone_id=`), telefone com 55, `Authorization` com a chave crua, e que sem chave/sem aparelho **não chama a rede**.
23. `/api/rodar` e o "Rodar agora" continuam iguais; a rodada em andamento continua sendo compartilhada (rodada 4).

Saúde do WhatsApp (Início)

24. **Painel "Saúde do WhatsApp"** (`montarSaude`, puro; `GET /api/whatsapp/saude`, cache 20 s): estado (ok · chave recusada · sem chave · sem aparelho · desconectado · instável · sem resposta · desconhecido), cor, título, motivo e "o que fazer" em português.
25. **Botão que leva ao lugar certo**: chave recusada/sem chave/sem aparelho/desconectado → "Colar a chave no Atendimento" abre `indycar-atendimento.onrender.com/?aba=integracoes` (Atendimento › Configurações › Integrações); número sem WhatsApp → "Ver as que falharam" abre Mensagens › Falharam.
26. Conectado mas com 3+ falhas de instabilidade/não entregue nas 24 h → estado **"WhatsApp conectado, mas com falhas"** (laranja) com o último erro.
27. Falhas das últimas 24 h **por classe** (`falhasPorClasse`, lê `erro_classe` e classifica os antigos pelo texto) como chips: "Número sem WhatsApp · 2", "Instabilidade · 5"…
28. Detalhes: fila (pendentes e atrasadas há mais de 2 h, `resumoDaFila`), "carteiro rodou há N min" e chamadas do banco que acharam o servidor dormindo.
29. Linha da **cadência** no painel: até N/min, N/h, N/dia · N min entre avisos ao mesmo cliente · janela · "só horário da loja".
30. **"Conferir agora"** (gestor, `POST /api/whatsapp/reconferir`): esquece a chave em cache (5 min) e o status (60 s) — o João cola a chave nova e vê o verde na hora, sem esperar o cache; auditado (`whatsapp_reconferido`).
31. Sem leitura ao vivo o painel usa o estado gravado pelo carteiro; sem nada, "ainda verificando" com "Conferir agora".
32. Painel em vermelho quando a chave está recusada; ponto pulsante quando conectado; atendente vê tudo, só não tem o "Conferir agora".
33. O "Pronto para ligar" aponta o item da chave para **Integrações** direto (`LINKS.integracoes()`), não mais para a raiz do Atendimento.
34. Textos de todas as classes conferidos por teste contra o vocabulário proibido (prezado/efetuar/comparecer/veículo).

Réguas

35. Variável **`{link_os}`** (acompanhar a ordem do Pátio ligada ao agendamento) no lembrete e no pós-venda — o gerador busca `patio_os.token_publico` pelo `agendamento_id` e monta `{link_base}/acompanhar/?t=…` (`linkOs`, `ordensPorAgendamento`).
36. Variável **`{link_area}`** (Área do Cliente, um link novo por cliente pela rpc `cliente_gerar_acesso`) em todas as réguas, com teto de 60 links por rodada.
37. **Sem o link a mensagem não sai**: cliente sem cadastro (`{link_area}`) ou horário sem ordem no Pátio (`{link_os}`) vão para "pulados" da prévia com o motivo — nunca um link vazio para o cliente (`faltaLink`, `corpoDaRegua`).
38. Os links são resolvidos **só quando o texto pede** (nenhuma consulta a mais nas réguas que não usam) e com cache por rodada (`ctx.links`).
39. Em simulação (prévia) o `{link_area}` vira um marcador e **não gera token** de verdade.
40. Chips `{link_os}`/`{link_area}` (tracejados, com dica) no editor de cada régua que os aceita; a prévia de exemplo mostra o link do Pátio.
41. **"Ver como um cliente real"** em cada régua (`GET /api/previa/mensagem`): busca o cliente, mostra nome/carro/placa, o último horário dele, a mensagem como ele recebe (com os links dele) e avisa quando para ele a mensagem não sairia; lembra o último cliente escolhido.
42. Cada cartão mostra a **prioridade** na fila e a **janela de silêncio** ("silêncio 7 d" para as réguas de relacionamento; "não espera silêncio" para lembrete, pós-venda, avaliação) — o chip acompanha o intervalo mínimo enquanto você digita.
43. Faixa Envio ganhou **Por minuto**, **Por dia**, **Mesmo cliente** e **Só horário da loja** (salvos pelo `PUT /api/comunicar/config` com faixas validadas no servidor; mudar acende "1 alteração sem salvar").
44. **Relatório por régua com período**: 8 semanas · 30 dias · 90 dias · este mês · escolher datas (de/até no fuso da oficina); `GET /api/relatorio?de&ate` (400 se "de" vem depois do "até").
45. O relatório ganhou **pediram para parar** (opt-out), **negativas** e **falharam**, com taxa de opt-out; o gráfico de 8 semanas continua.
46. **Tabela "Por régua"** no mesmo período (`GET /api/relatorio/reguas`, cache 60 s): enviadas, responderam (%), agendaram depois, pediram para parar, falharam — réguas sem envio aparecem zeradas; ordenado por enviadas.
47. O período escolhido fica lembrado no aparelho.

Campanhas

48. **Segmentos salvos** (tabela `comunicar_segmentos`, RLS sem política = só o servidor): nome, filtro, valor, quem salvou, usos e último uso.
49. Chips "Meus segmentos" no passo 1: clicar escolhe filtro e valor; o `×` apaga (confirmação).
50. **"Salvar segmento"** na prévia (nome sugerido pelo filtro); qualquer um da equipe salva; **apagar segmento de outra pessoa só gestor** (403 claro "Só gestor apaga segmento salvo por outra pessoa"); nome com menos de 2 letras e filtro inventado = 400.
51. Campanha disparada por um segmento salvo **conta o uso** (`usos`, `usado_em`) — os mais usados aparecem primeiro.
52. **Prévia honesta**: quantos recebem e **quantos ficam de fora, com o motivo** (pediram para parar, sem telefone, repetidos) — `peneirarSegmento` é a MESMA peneira do envio (`/api/segmentos/previa` → `bruto`, `pulados`).
53. Quem recebeu outra mensagem da oficina há menos de N dias aparece como **aviso** ("já receberam outra há menos de 7 dias — recebem mesmo assim"): campanha é decisão de gente, e a prévia bate com o que sai.
54. **"Mandar para o meu celular"** no passo 2 (`POST /api/envios/teste-meu`, qualquer um da equipe): o texto chega no telefone do **próprio perfil**, prefixado "[teste]", fora da fila; sem telefone no perfil → aviso e abre "Meu perfil"; WhatsApp recusado → 502 com a classe; auditado com o telefone mascarado.
55. **Limite diário nas campanhas**: o que não cabe hoje é **escalonado nos dias seguintes** na hora de envio, pulando domingo (se não envia) e feriado (`distribuirPorDia`); a resposta diz "escalonadas em N dias (limite de 300/dia)" e o passo 3 avisa antes.
56. A campanha aprovada pelo gestor passa pela mesma distribuição diária.
57. Resultado da campanha traz `puladosDetalhe` (quem pediu para parar × sem link da Área) e `porDia`.
58. Agendamento da campanha ("Em uma data") continua e agora respeita o limite diário do dia escolhido.

Conectar (ficha 360 e ligações)

59. **`public/apps.js`**: UM lugar para os endereços dos apps (Agenda, CRM, Atendimento, Comunicar, Orçador, Pátio, Site) e os links que abrem o registro certo (`LINKS.conversa/conversaTel/lead/clienteCrm/agendamento/os/orcamento/integracoes`) — vale para a tela (`window.IndyApps`) e para o servidor (`globalThis.IndyApps`, importado por `acesso.js`). O mesmo arquivo roda nos dois lados (teste garante que não usa export/require).
60. `acesso.APPS`, `conta.js`, `app.js` (ecossistema, ficha, "Abrir conversa"), `prontidao.js` e o `rodada5.js` leem de lá — nenhum endereço duplicado; o Pátio entrou no seletor "Ecossistema IndyCar".
61. **Ficha do cliente › "Nos outros apps"** (rpc `cliente_360(p_telefone)` pelo telefone normalizado, `ligacoesDoCliente`/`montarLigacoes`): conversa no Atendimento (etapa, com quem está, esperando consultor → `/?conversa=`), **carro na oficina** (OS, etapa → `/?os=`), leads no CRM (status, serviço, responsável → `/?lead=`), horário na Agenda (`/?agendamento=`), orçamento (`/?orcamento=`), ficha completa no CRM.
62. Na ficha: **tarefas abertas** ligadas ao cliente (com quem), indicações ("Indicou 2 amigos" / "Veio por indicação de…") e um resumo (mensagens trocadas, leads abertos, gasto, última visita).
63. Sem a rpc (papel sem direito, cliente sem conversa) a ficha mostra os links pelo telefone — nada quebra.
64. **"Onde toca"** em cada mensagem (`GET /api/envios/:id/ligacoes`): conversa (pelo `conversa_id` ou pelo telefone), lead, horário na Agenda, ordem do Pátio (pela `chave_unica` `patio_*` ou pela OS do agendamento) e ficha no CRM; diz quando a mensagem só está ligada à conversa.
65. **`GET /api/clientes/360?tel=`** (com ou sem 55, com máscara): a ficha 360 de um telefone mesmo sem cadastro de cliente; modal "Ficha 360" (`R5.abrir360`).
66. Busca de mensagens por telefone usa **`telefone_e164`** (coluna gerada, com índice): 10+ dígitos = igualdade exata, com ou sem 55; menos dígitos = contém (telefone e telefone_e164).
67. `enviosDoTelefone(tel)` para a ficha 360 e o relatório por telefone.
68. Links do sino/"sem acesso" e o "Abrir conversa" continuam funcionando — agora pelo `apps.js`.

Preparo para a IndyCar Central (onda B2)

69. **`server.js` exporta `{ handler, iniciar, ligarCarteiro, desligarCarteiro, normalizarPrefixo, VERSAO }`**; o `listen`, os timers do carteiro e os `SIGTERM/SIGINT` só acontecem quando o arquivo é o programa principal (`node server.js`) — importar o módulo não sobe servidor nem roda carteiro (teste importa e usa o handler).
70. **`req.prefixo`** (mandado pela Central) ou a variável **`PREFIXO`** (`/comunicar`): o handler tira o prefixo do caminho antes de decidir entre API e arquivo; `GET /api/config` devolve `prefixo` para a tela.
71. `normalizarPrefixo` aceita `comunicar/`, `/comunicar`, `/` → sem barra final, nunca `//`.
72. **Frontend com caminhos RELATIVOS**: `api/…` (não `/api/…`) no `app.js`, `acordar.js` (sonda `api/ping` pela `baseURI`) e no CSV; `register('sw.js')`; `manifest.json`, `styles.css`, ícones, logo e scripts sem barra inicial — funciona em `/` e em `/comunicar/` (testado contra o servidor real com `PREFIXO=/comunicar`).
73. **Service worker relativo** (`BASE = new URL('./', self.location).pathname`): casca, API (`${BASE}api/`) e navegação pelo prefixo; versão `comunicar-v5.0.0` (a antiga é apagada no `activate`).
74. **Manifest relativo**: `start_url`/`scope` `./`, ícones `./icon-…`, atalhos `./?abrir=campanha` e `./?tela=mensagens`.
75. O atalho do manifest **`?abrir=campanha`** passou a funcionar (abre "Nova campanha" e limpa a URL).
76. `conta.js`: "esqueci a senha" volta para a raiz do app (`new URL('./', location)`), e "sair" recarrega a raiz do app — não `/` fixo.
77. Versão `5.0.0` em `package.json`, `/api/ping`, `?v=5.0.0` nos arquivos e no service worker.
78. **URL do pg_cron documentada** (README › Carteiro externo e `scripts/sql/trocar-carteiro-url.sql`): `posvenda_config.carteiro_url` = `https://indycar-posvenda.onrender.com/api/rodar`; trocar = um UPDATE (não foi trocado) + a URL fixa do `carteiro.yml`; o `RUNNER_TOKEN` da Central tem de ser o mesmo `runner_token`.
79. `GET /api/ping` sem prefixo continua respondendo quando o prefixo está ligado (o vigia e o `publicar.mjs` não quebram).

Banco (migração `comunicar_rodada5`, cópia em `scripts/sql/2026-10-16_comunicar_rodada5.sql`)

80. `posvenda_config`: `limite_por_minuto`, `limite_por_dia`, `intervalo_mesmo_cliente_min`, `so_horario_comercial`, `whatsapp_estado` (check), `whatsapp_estado_em`, `whatsapp_motivo` — todas com padrão e check.
81. `posvenda_envios.erro_classe` (check) + índice parcial; `posvenda_envios_pendente_tipo_idx`.
82. `comunicar_segmentos` (check de filtro, FK em perfis, RLS ligado sem política, `revoke` de anon/authenticated, índice por criador) — mesmo padrão de `comunicar_campanhas`.
83. Comentários nas colunas e na tabela; advisors de segurança sem WARN novo (só o INFO "RLS sem política" de propósito, igual às outras `comunicar_*`); nada das funções da base, de `patio_*` nem de `tocar_conversa` foi tocado.

Mock, testes e ferramentas

84. Mock (`npm run mock`): `?whatsapp=ok|recusada|desconectado|instavel` pinta cada estado da saúde; segmentos salvos de exemplo (reset com `?semente=1`); prévia do segmento com a peneira REAL; `/api/whatsapp/saude`, `/reconferir`, `/segmentos/salvos` (GET/POST/DELETE com a regra do dono), `/envios/teste-meu`, `/clientes/360`, `/envios/:id/ligacoes`, `/relatorio/reguas`, `/previa/mensagem`, ficha com `ligacoes` (dublê do `cliente_360`), `/api/config` com `prefixo`.
85. `scripts/testes-rodada5.mjs` (**23 testes**, `npm test` = **126**): classes de erro, espera crescente, CodeWords falso (envio e status), prioridade, cadência, intervalo por cliente, horário comercial, limite diário por dias, saúde em todos os estados, `{link_os}`/`faltaLink`, relatório com opt-out/período/por régua, peneira do segmento, `montarLigacoes`, `apps.js` nos dois lados, caminhos relativos (varre `public/`), **handler exportado com prefixo** (sobe o `server.js` real sem listen), e a API de verdade: saúde/reconferir (403 para atendente), segmentos salvos (dono × gestor, 400, uso contado), escalonamento diário, teste-meu (sem telefone 400, recusado 502, auditoria mascarada), 360, ligações, relatório, prévia real, mapa de rotas e permissões.
86. `scripts/navegador-rodada5.mjs` (`npm run navegador5`): **96 verificações** em 1440 e 375 px — saúde recusada/ok/conferir agora, cadência, chips de link, prioridade/silêncio, prévia real, salvar cadência, relatório com período e por régua, segmentos salvos (usar, salvar, apagar alheio = 403), pulados com motivo, teste no meu celular, "Onde toca", busca por telefone, ficha 360, atendente, atalho `?abrir=campanha`; zero erro de console, zero rolagem lateral.
87. Roteiros antigos atualizados e verdes: rodada 4 (o "Pronto para ligar" tem 12 itens desde o Pátio) **104/104**; rodada 3 **137/137** (espera da campanha ajustada).
88. `npm run check` cobre `whatsapp.js`, `public/apps.js` e `public/rodada5.js`; `capturas-r5/` no `.gitignore`.
89. Corrigido na passada: `$$` virando `$` em dois seletores (bug do próprio patch, pego pelo roteiro de navegador — "`$(…).forEach is not a function`").

Avisos do coordenador (fim da rodada)

90. Tipo **`remarcacao`** (aviso de horário remarcado que a Agenda manda; antes entrava como `avulsa`): rótulo "Horário remarcado" e ícone 🔄 em todas as telas, filtro de Mensagens, seletor do relatório, rótulo nas automações/CSV, **prioridade igual à do lembrete** e sai na hora mesmo que o cliente tenha recebido outra mensagem agora (operacional).
91. Campanha proposta pelo **CRM** (`comunicar_campanhas` com `aguardando`, lista de `destinos`, `criado_por_nome`; notificação `/?campanha=<id>`): a tela Campanhas abre a proposta em destaque e mostra o selo **"veio do CRM"** (coluna nova `comunicar_campanhas.origem`, padrão `comunicar`, migração `comunicar_rodada5_origem`; sem a coluna preenchida, lista de destinos sem segmento é lida como vinda do CRM); "lista de N clientes" no lugar de "clientes escolhidos"; aprovar enfileira pela lista com a mesma peneira.

### Como foi verificado (16/10/2026, rodada 5)

- `npm run check` limpo · `npm test` **127/127** (24 novos) · `npm run segredos` limpo.
- Banco real: migrações `comunicar_rodada5` e `comunicar_rodada5_origem` aplicadas pelo MCP (`apply_migration`), colunas e tabela conferidas por leitura (`limite_por_minuto=10`, `limite_por_dia=300`, `intervalo_mesmo_cliente_min=60`, `whatsapp_estado=null`, `carteiro_url=https://indycar-posvenda.onrender.com/api/rodar`); `comunicar_segmentos` com RLS ligado e 0 políticas (de propósito); advisors de segurança sem WARN novo. Nada foi gravado na fila nem enviado.
- Servidor real local (`CARTEIRO_DESLIGADO=1`, `PORT=3510`, `PREFIXO=/comunicar`): `/comunicar/api/ping` 5.0.0, `/comunicar/api/config` → `prefixo: "/comunicar"`, `/comunicar/api/whatsapp/saude` 401 sem login, `/comunicar/api/rodar` 403 sem token, `/comunicar/sw.js` e `/comunicar/app.js` (brotli) 200, `/api/ping` sem prefixo continua 200.
- Mock na 3511 + puppeteer + Chrome: `navegador5` **96/96**, `navegador4` **104/104**, `navegador` (rodada 3) **137/137**, em 1440 e 375 px, zero erro de console, zero rolagem lateral. Capturas em `capturas-r5/`.
- Produção (commit d105b31, deploy dep-db9336brjlhs73e1uefg `live`): ping 5.0.0, `/api/config` com `prefixo`, index com os 6 scripts `?v=5.0.0` relativos, manifest `./`, SW 5.0.0, `apps.js`/`rodada5.js` 200; sem login 401 em saúde/segmentos/teste-meu/360, carteiro 403 sem token, origem de fora 403, CSP + HSTS; a primeira rodada da v5 (`inicio`, 14:16 UTC) ficou anotada em `comunicar_carteiro_batidas` com `versao=5.0.0`, ok, 0 falhas.

### Pendências (rodada 5)

- O Atendimento ainda não abre a aba Integrações por `?aba=integracoes` — o link do Comunicar já manda assim (o botão abre o Atendimento e o João clica em Integrações até o agente do Atendimento ler o parâmetro).
- O limite diário escalona campanhas, mas as **réguas** não são escalonadas (param no limite do dia e saem no dia seguinte, como antes).
- Quando a Central nascer: trocar `posvenda_config.carteiro_url` (modelo em `scripts/sql/trocar-carteiro-url.sql`) e a URL do `carteiro.yml`; abrir o app sempre como `/comunicar/` (com a barra).
