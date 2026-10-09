# Melhorias da Agenda — rodada do ecossistema IndyCar

Cada linha é uma melhoria feita **e verificada** (testes `npm test`, mock em
`http://localhost:3011`, servidor real local em `PORT=3010` e leitura do Supabase).
Data: **09/10/2026**.

## Ficha do cliente (Comunicar)
1. Ficha do cliente ganhou **aniversário** (`DD/MM` ou `DD/MM/AAAA`, com máscara; sem ano o banco guarda 1904 = "só dia e mês") gravado em `clientes.nascimento`.
2. Chave **"Aceita mensagens automáticas"** (`clientes.aceita_mensagens`): desligada, pede o motivo e mostra quando/por quê foi desligada (`aceita_mensagens_em/_motivo`); só grava quando a chave muda, para não recarimbar a data.
3. **Última visita** (último agendamento concluído, casando por `cliente_id` e pelo telefone) e **próxima revisão prevista** = última visita + prazo da regra de `comunicar_regras_retorno` que casar com o serviço (sem acento/maiúscula; sem regra, 6 meses) — `GET /api/clientes/:id/ficha`.
4. **Mini-ficha no modal de agendamento** (última visita, próxima revisão, aniversário, opt-out) com "Abrir ficha", que volta ao agendamento depois de salvar.
5. Lista de clientes com marcas discretas: 🎂 aniversário em até 7 dias (ou hoje) e 🔕 não aceita mensagens, com o motivo no tooltip.
6. `dados.js`: `criarCliente/atualizarCliente/lerCliente` passam os campos novos; funções puras `nascimentoBanco`, `nascimentoTela`, `somarMeses`, `prazoDeRetorno`.
7. **Sonda de capacidade** (`temColuna`, cache de 5 min): as colunas da migração só entram no PATCH quando existem — a migração chegou pela metade durante a rodada e o salvar não quebrou.

## Lembretes agora são do Comunicar
8. Removidos o agendador `verificarLembretes` (setInterval/setTimeout) do `server.js` e `agendamentosParaLembrete/marcarLembreteEnviado` do `dados.js`; comentário no lugar diz que o Comunicar envia.
9. Removida a configuração "Lembretes automáticos / horas antes" da aba WhatsApp › Configuração e da API (`obterWaConfig/salvarWaConfig` não expõem nem gravam `lembrete_*`); no lugar, um aviso com link para o Comunicar.
10. Selo no cartão a partir de `posvenda_envios` (tipo `lembrete`): **"lembrete enviado"**, **"respondeu 👍"**, "respondeu 👎", "pediu p/ parar 🔕", "lembrete na fila", "lembrete falhou" — uma consulta extra barata por lote de ids (`lembretesPorAgendamento`/`anexarLembretes`), só para quem ainda não tem desfecho, tolerante à coluna `resposta_tipo` ausente.

## Saúde do sistema e ecossistema
11. `GET /api/saude` lê `vigia_estado` (linha única) e devolve `{ok, problema, desde, checado_em, resumo}`; liberado também para o papel "agenda"; `Cache-Control: no-store`.
12. **Faixa de saúde** discreta no topo quando há problema: para `codewords-fora` diz em português o que parou e onde se resolve (Atendimento › Integrações), com link; atualiza a cada 5 min e ao voltar a conexão.
13. **Seletor "Ecossistema IndyCar"**: botão *Apps* na barra lateral abre um popover com Agenda · CRM · Atendimento · Comunicar · Orçador · Site, a Agenda marcada "você está aqui"; no celular vira folha no pé da tela; Esc e clique fora fecham.

## Erros do WhatsApp/CodeWords claros
14. `erroCodeWords()`: 401/403 → **"A chave do CodeWords foi recusada (401). Nenhum WhatsApp automático sai até trocá-la: peça ao gestor para trocar em Atendimento › Integrações."**; 404, 429 e 5xx também com texto claro. Vale para `chamarCodeWords`, o aviso de ausência (`enviarViaGowa`) e `/api/whatsapp/conexao`.
15. `enviarViaGowa`: HTTP 200 sem "success" no corpo vira erro "O WhatsApp não confirmou o envio" (200 não é entrega); timeout de 30 s em toda chamada ao CodeWords.

## Service worker
16. `sw.js` → `CACHE = 'indycar-v10'`; `/api` nunca entra no cache (`passaDireto`: só GET, só mesma origem, nunca `/api`), só guarda resposta `ok` do próprio domínio; `/logo.png` entrou no CORE.

## Telefone (pedido do coordenador: 92 de 159 agendamentos sem telefone)
17. Telefone em **destaque** no modal de agendamento; salvar sem telefone mostra "Sem telefone este cliente não recebe lembrete nem pós-venda, e não entra no CRM" e pede um segundo clique em **"Salvar assim mesmo"** (não bloqueia).
18. Botão **"Achar"** pelo nome (ou Enter no campo do nome): `GET /api/clientes/achar?q=` procura em `conversas` (nome/telefone/cliente_id, mais recentes primeiro) e em `clientes`, sem repetir número; um clique preenche telefone, `cliente_id`, carro e placa.
19. Selo discreto **"sem telefone"** no cartão do Início/Agenda (não aparece no modo presença, que não vê telefone).
20. Início: chip **"N agendamentos sem telefone nos últimos 30 dias"** (só quando > 0; hoje são 62) que abre a Agenda já filtrada; botão de filtro "Sem telefone" na Agenda com contagem.
21. `PUT /api/agendamentos/:id`: quando o agendamento ganha ou troca de telefone, o servidor liga `cliente_id` reaproveitando/criando o cliente pelo telefone (`obterOuCriarCliente`) — o gatilho do banco só roda no INSERT.

## Teclado e acessibilidade
22. Atalhos: **N** novo agendamento, **/** foca a busca da tela, **Esc** fecha modal e popover (desligados dentro de campos de texto, com modal aberto e no modo presença).
23. Modal: foco vai para o primeiro campo ao abrir, **Tab fica preso** dentro (cicla), e o foco volta ao botão de origem ao fechar; `role=dialog` + `aria-labelledby`; todo × ganha `aria-label="Fechar"`.
24. `aria-label` nos botões-ícone (clientes, equipe, modelos, copiar, imprimir, apps) e `label for=` em todos os campos dos modais.

## Formulários
25. Máscara leve de telefone `(12) 99999-9999` nos modais de agendamento, cliente e WhatsApp; validação 10–13 dígitos no front e no servidor (`ERRO_TELEFONE`, 400).
26. Aviso **"Fora do expediente (seg–sáb, 8h às 17h30)"** / **"Domingo a oficina não abre"** ao escolher data e hora, sem bloquear; campo de hora com min/max/step.
27. `POST /api/agendamentos` recusa data/hora em formato inválido com 400 claro; `PUT /api/clientes/:id` recusa nome vazio; aniversário inválido → 400 "Use DD/MM ou DD/MM/AAAA".

## Cartões e telas
28. Telefone no cartão e na lista de clientes vira link `tel:` (abre o discador) com botão **copiar** (toast confirma o número).
29. **Folha do dia imprimível**: ícone de impressora em "Agenda de hoje" monta uma tabela limpa com todos os horários de hoje (hora, cliente, carro/placa, serviço, telefone, situação e coluna "Veio?" para marcar à mão) e imprime; `@media print` esconde menu, botões e números.
30. Aviso **offline/online**: faixa "Sem internet — o que você marcar agora não vai ser salvo…" enquanto estiver sem rede e toast "Conexão de volta" ao voltar.
31. Esqueleto (skeleton) nas telas Configurações e WhatsApp no lugar do "Carregando…" solto.
32. Estados vazios por contexto: Clientes (nada na busca × nenhum cliente), Follow-up ("Tudo em dia! 🏁"), Histórico, Equipe/consultores e Agenda filtrada sem telefone.
33. Clientes: a busca mantém o termo depois de salvar/excluir (atualização silenciosa), contador de clientes ao lado da busca, resposta de busca antiga não pinta por cima da nova, botão WhatsApp dentro da ficha.
34. **375 px sem rolagem lateral** (medido: `scrollWidth` 375 = `clientWidth`, modal cabe); faixa compacta no celular (texto menor, link na linha de baixo); botão "Achar" só com ícone.
35. Campos em grade não estouram mais o modal (`min-width:0`) — o campo de aniversário saía pela direita.

## Servidor
36. Corpo da requisição limitado a **64 KB** (413 "grande demais"), JSON inválido → **400 "Corpo inválido: envie JSON"**, array no lugar de objeto vira `{}`; erros sempre `{erro}` com o status do `ErroHttp`.
37. **Log de requisições** da API com método, rota, status e duração em ms (sem a query string, que pode levar o token do ICS).
38. **Desligamento limpo** (SIGTERM/SIGINT): para os timers de importação, `server.close()` deixa as requisições em curso terminarem, teto de 10 s; `requestTimeout`/`headersTimeout` para conexão pendurada.
39. `Cache-Control: public, max-age=30` em `/api/config` (só vem do ambiente).
40. **Headers de segurança** em toda resposta: `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` e CSP simples com `frame-ancestors 'none'` (libera só jsDelivr, Google Fonts e Supabase).

## Testes e documentação
41. `npm test` (node --test) — `tests/dados.test.mjs`: 15 testes das funções puras de `dados.js` (`ordenarPorProximidade`, `montarUltimos` com a reserva de 4 vagas, `dataBanco`, `horaBanco`, `telefoneNacional`, `paraBool`, origem, `nascimento*`, `somarMeses`, `prazoDeRetorno`).
42. `tests/front.test.mjs`: 8 testes das regras do `app.js` (`grupoDoDia`, `foraDoExpediente`, `mascaraTelefone`, `telefoneOk`, `mascaraAniversario`, `diasParaAniversario`, `quandoRel`, `rotuloDia`) rodando o **código real** recortado num sandbox `node:vm`. Pegou um bug de verdade: hora vazia contava como "fora do expediente".
43. `npm run check` (node --check em tudo); mock-server com `/api/saude`, clientes com ficha/achar/PUT e lembretes nos cartões, para mexer na tela sem dado real.
44. README atualizado (lembretes no Comunicar, saúde e ecossistema, ficha do cliente, atalhos, testes, endpoints novos).
45. Textos da aba WhatsApp › Integração revisados: o aviso de falta sai direto pelo WhatsApp da empresa (não existe mais "delegado à IA").

## Rodada 2 (09/10/2026)
Verificado com `npm test` (37 testes, 14 novos), `npm run check`, dois roteiros puppeteer contra o mock
(`npm run mock`, 1366 px e 375 px, tema escuro e claro, modo presença), leitura real do Supabase
(só SELECT) das funções novas de `dados.js` e o `server.js` de verdade numa porta local (versão, 401 sem login).
Revisão do que o Codex deixou pela metade: o módulo puro `planejamento.js` foi aproveitado e reescrito;
a tela por cima (`agenda-planejada.js`, que remendava funções do app.js e baixava a tabela inteira a cada
modal) foi refeita; os links dele usavam `?telefone=`/`?lead=` e viraram o contrato combinado.

### Links entre os apps (conectividade)
46. **Link de entrada** `?tel=<dígitos>` (com ou sem 55) e `&cliente=<uuid>`: um horário pendente → abre o agendamento.
47. Link de cliente com ficha e sem um único pendente → abre a **ficha** com histórico e "Agendar de novo".
48. Vários pendentes do mesmo telefone sem ficha → abre a **Agenda filtrada** por aquele telefone.
49. Telefone sem nada na Agenda → **"Novo agendamento" já com o telefone** (e nome/carro/placa do último atendimento, se houver).
50. `&agendamento=<uuid>` abre aquele horário direto.
51. O telefone **sai da barra de endereço** na hora (`history.replaceState`), antes até do login; fica só na memória até entrar.
52. Papel `agenda` (Franklin) **ignora** o link de cliente (testado: nenhum modal abre, URL limpa).
53. `GET /api/abrir`: acha a ficha pelo id ou por `telefone_e164` e devolve os agendamentos (pendentes em ordem).
54. **Links de saída** no contrato: Atendimento `?tel=`, CRM e Comunicar `?cliente=&tel=` — no modal e na ficha.
55. Ícone **"Abrir conversa"** em todo cartão com telefone (Início, Agenda, Follow-up), abre o Atendimento em outra aba.
56. Regras dos links (`links`, `lerEntrada`, `semEntrada`) em `planejamento.js`, puras e testadas.

### Modal de agendamento
57. **Duração estimada** do serviço pelo cadastro (`servicos.duracao_min`), com reserva por palavra-chave; nunca preço.
58. Aviso de **horário disputado**: outro horário ativo na mesma meia hora do mesmo consultor (ou recepção lotada).
59. **✨ Sugerir horário**: 3 horários livres (seg–sáb 8h–17h, passos de 30 min, capacidade = consultores ativos), espalhados (máx. 2 por dia, 90 min entre eles).
60. Clicar na sugestão preenche data e hora e reconfere expediente e conflito.
61. `dados.horariosLivres` (pura, testada) + `GET /api/horarios-livres` (lê só 15 dias de horários ativos).
62. **Histórico do cliente** no modal (últimas visitas com a situação, resumo veio/faltou/fechou; clicar abre o horário).
63. **Mensagens automáticas do Comunicar** com o que o cliente respondeu (citação) e as notas de satisfação (`/api/clientes/mensagens`).
64. O bloco de contexto se atualiza quando o "Achar" escolhe outro contato ou o telefone muda; resposta antiga não pinta por cima.
65. `openAgendamentoModal(id, pre)` aceita campos pré-preenchidos (link, "Agendar de novo", "+" do dia).
66. `label for` em Origem e Situação; `esc()` também em data/hora dos campos (ajuste do Codex, mantido).

### Remarcar
67. Botão **Remarcar** (ícone de calendário) em todo cartão — a alternativa ao arrastar no celular e no teclado.
68. Modal Remarcar com **sugestões que ignoram o próprio horário**, aviso de expediente e de horário disputado.
69. Remarcar quem **não veio ou cancelou** volta para Aguardando e libera o aviso de ausência para o horário novo.
70. **Desfazer** a remarcação devolve data, hora e situação — voltando a "Não veio" com o carimbo, para o gatilho do banco não mandar outro WhatsApp.

### Semana (tela nova)
71. Menu **SEMANA** (e tecla **S**) com **Dia · Semana · Mês**, setas e "Hoje".
72. **Ocupação por dia**: barra verde/laranja/vermelha (horários ativos ÷ vagas de recepção) e horas de serviço estimadas.
73. **Arrastar** um horário para outro dia remarca na mesma hora, com Desfazer; recusa dia passado e domingo e pergunta se o dia está disputado.
74. Visão **Mês** em calendário (segunda primeiro), com contagem e barra; tocar no dia abre a visão Dia.
75. Filtros: busca (nome, telefone, placa, serviço), situação, consultor, origem e "só sem telefone", recolhidos em "Filtros".
76. **Relatório do período**: marcados, vieram, fecharam, não fecharam, faltaram e taxa de falta, mais tabelas **por consultor** e **por origem**.
77. **Imprimir** o relatório (CSS de impressão próprio, sem menu nem botões) e **baixar CSV** (Excel BR, `;`, BOM, fórmula neutralizada).
78. Botão **+** em cada dia futuro abre "Novo agendamento" já naquela data.
79. Dia que já passou sem nada e domingo vazio não aparecem (no celular viravam rolagem à toa).
80. Só baixa o período na tela: `GET /api/agendamentos?de=&ate=` (400 claro para data inválida ou invertida).

### Busca e CRM
81. **Busca global** (Ctrl+K ou a lupa no topo): agendamentos e clientes de uma vez (`GET /api/busca`); some no modo presença.
82. Telefone digitado só com números acha o gravado **com máscara** pelo CRM (padrão pelos 8 últimos dígitos) — busca global e Agenda.
83. A busca da Agenda também procura pelo **serviço**.
84. CRM: **taxa de falta e de fechamento por origem** (vermelho a partir de 30% de falta).
85. CRM: **desempenho por consultor** com vieram, faltas, fecharam e % de fechamento; consultor inativo marcado.
86. CRM: linha **"Sem consultor"** (hoje 159 de 161 agendamentos não têm consultor — o número aparece para corrigir).
87. Selo do lembrete no cartão mostra **o que o cliente respondeu** ao passar o mouse (escapado; teste com `<img onerror>`).

### Sem internet, folha do dia
88. **Fila sem internet**: desfecho marcado offline fica guardado no aparelho (só id + situação) e o cartão fica tracejado "na fila".
89. A fila é **enviada sozinha** quando a conexão volta e ao abrir o app; recusas viram aviso. Faixa laranja diz quantas faltam.
90. Faixa "sem internet" com o texto novo (o que marcar fica guardado, não se perde).
91. **Folha do dia** impressa ganhou o resumo: marcados, vieram, fecharam, não fecharam, faltaram e sem desfecho.

### Servidor, desempenho e logs
92. Cache de **10 s do /api/dashboard** na memória, invalidado em qualquer gravação e depois de cada importação do CodeWords.
93. Cache de 60 s do `/api/servicos` (mesma invalidação).
94. `GET /api/versao` (sem login, sem dado) + `VERSAO_APP` no app.js: confere qual código está no ar.
95. Log com **id da requisição** (também no cabeçalho `X-Request-Id`), marca **LENTO** acima de 2 s e 5xx vai para o stderr.
96. Rotas novas fora do alcance do papel `agenda` (a lista do que ele pode continua fechada no servidor).

### Visual, celular, testes
97. Topo: lupa ao lado do "Novo agendamento"; no celular os dois ficam numa linha (375 px sem rolagem lateral: medido 375 = 375 em Início, Semana, Agenda e modal).
98. Semana no celular: uma coluna, período em linha própria, botões e sugestões com 40 px de toque; tema claro conferido.
99. `tests/planejamento.test.mjs`: 10 testes (período, duração, conflito, ocupação, filtros, resumo/grupos, CSV, links de saída e de entrada).
100. `tests/dados.test.mjs`: horários livres (ocupado, passado, domingo, capacidade, consultor, ignorar) e padrão de telefone com máscara.
101. `tests/front.test.mjs`: selo do lembrete escapando a resposta do cliente.
102. `npm run check` cobre também `public/*.js` e o service worker; `sw.js` → `indycar-v12` com os arquivos novos no CORE.
103. Mock (`npm run mock`) com as rotas novas (abrir, histórico, mensagens, horários livres, busca, período, PUT/POST) e log do PUT.
104. README: links do ecossistema, Semana, Sugerir horário, contexto do cliente, fila sem internet, atalhos e endpoints novos.
105. Busca global: **Enter abre o primeiro resultado** (agendamento antes de cliente).
106. A Semana **lembra Dia/Semana/Mês neste aparelho** (localStorage com try/catch; sem armazenamento, começa na semana).
107. Botão **"Semana"** na barra da Agenda leva direto para a grade.
