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

## Rodada 3 (13/10/2026)
Verificado com `npm test` (75 testes, 38 novos: papéis, server.js por HTTP com banco e porteiro injetados,
aviso de falta, busca sem acento, consultor/carga, automações com relógio injetável, regras da tela de
conta), roteiro puppeteer contra o mock (`npm run mock`, 8 papéis, 1440 e 375 px, tema claro: 123/123),
leitura real do Supabase (só SELECT) das funções novas de `dados.js` e o `server.js` de verdade na porta
3010 (sem login 401, token falso 401, CORS, cabeçalhos, arquivos novos). `npm audit` 0 e `npm run segredos` limpo.

### Login, perfil e acesso (padrão comum)
108. Login: botão **Mostrar/Esconder senha** (aria-pressed) também nas telas de senha nova e trocar senha.
109. Aviso de **Caps Lock ligado** em todo campo de senha.
110. **"Lembrar meu e-mail neste aparelho"** (localStorage com try/catch; desmarcado esquece).
111. Recados claros: senha errada, acesso desativado, sem internet, servidor de login fora, limite de tentativas.
112. **Espera progressiva** depois de 5 erros seguidos neste aparelho (15 s, dobrando até 5 min).
113. **Esqueci a senha**: link do Supabase com volta para a Agenda, e-mail já preenchido, aviso do limite do plano gratuito e da senha temporária.
114. Volta do link de recuperação (`PASSWORD_RECOVERY`) abre a tela de **senha nova** antes de qualquer outra coisa.
115. **Troca obrigatória** (`precisa_trocar_senha`): cria a senha (8+, iguais, diferente do e-mail) antes de entrar e o servidor desliga a marca (`POST /api/perfil/senha-trocada`, auditado).
116. Sem a Agenda em `perfis.apps` → tela **"Você não tem acesso à Agenda"** com links dos apps que a pessoa usa.
117. O **servidor confere papel e app em TODA rota** (`regras.js › decidirAcesso`): sem o app → 403 `sem_acesso_app` (só o próprio perfil e a troca de senha passam).
118. **Desativado no meio do uso** → 403 `desativado` (não confunde com senha errada); a tela sai e volta ao login com o aviso.
119. Mudar papel, apps ou acesso de alguém **limpa o cache do porteiro na hora** (antes valia até 60 s).
120. **Verificação em duas etapas (TOTP)**: ligar com QR + chave, confirmar o código, desligar.
121. Duas etapas exigidas depois da senha na tela e **no servidor** (fator verificado + token aal1 → 401 `mfa_pendente`).
122. **Menu do perfil** no avatar: Meu perfil, Trocar senha, Duas etapas, Notificações, Tema, Sair, Sair de todos os aparelhos.
123. **Meu perfil**: nome, cargo, telefone (com máscara) e cor do avatar; e-mail só leitura; papel/apps/ativo nunca passam por essa rota (testado).
124. **Sair** e **Sair de todos os aparelhos** (`signOut({scope:'global'})`) — a Agenda não tinha botão de sair.
125. **Último acesso** gravado pelo servidor no máximo a cada 5 min (`ultimo_acesso_em`, `ultimo_app='agenda'`).
126. **Preferências de notificação** (atrasos, tarefas novas, som) em `perfis.preferencias` — só chaves conhecidas e booleanas.
127. Configurações › Minha conta refeita: resumo do perfil, estado das duas etapas e os botões de cada ação.

### Sino e minhas tarefas
128. **Sino** no topo: só as notificações da pessoa (filtro pelo id do token, nunca do corpo — testado), contador, marcar lida e todas.
129. Tempo real (canal do Supabase em `notificacoes`) + consulta a cada minuto e ao voltar para a aba; bipe opcional.
130. Link da notificação: relativo abre no app de origem; agendamento da Agenda abre o modal sem recarregar; link absoluto só de domínio do ecossistema (`javascript:` e site de fora recusados — testado).
131. **Minhas tarefas**: prazo (atrasada em vermelho), prioridade alta marcada, concluir com **Desfazer**, botão "Abrir" o agendamento.
132. **Nova tarefa** pelo painel ou pelo botão **Tarefa** do modal do agendamento (já ligada a ele e ao cliente).
133. Franklin (papel agenda) vê sino e as tarefas DELE; não cria tarefa.
134. API de tarefas: concluir/reabrir só responsável, quem criou ou gestor; UUID validado; 30 por minuto.

### Equipe e acessos
135. Papel **Gestor** no cadastro e na troca de função.
136. **Apps de cada pessoa** em chips (`POST /api/equipe/apps`, só admin; admin entra em todos, "só presença" fica só com a Agenda).
137. **Senha temporária** gerada no servidor (12 caracteres sem 0/O/1/l), mostrada uma vez, liga a troca obrigatória; a senha nunca vai para a auditoria.
138. Cadastro novo já pede "criar a senha no primeiro login" (desmarcável) e grava `convidado_por`.
139. Lista da equipe mostra **último acesso** e "vai criar a senha no 1º login".
140. Trocar para/de "só presença" acerta `perfis.apps` sozinho.

### Mais funcionários: consultores
141. Migração **`ag_consultor_perfil`** (aditiva): `consultores.perfil_id` → perfis, índice único parcial; advisors sem WARN novo.
142. Cadastro de consultor com **ligação opcional ao login** (lista só com nome e função; login já ligado aparece desabilitado).
143. Equipe/Consultores com colunas **Login**, **Hoje** e **Amanhã** (carga) e "N hoje sem consultor".
144. **Consultor sugerido** no modal: menor carga no dia e livre naquela meia hora; pré-escolhido em agendamento novo, botão "Usar" e a carga de cada um ao lado.
145. Consultor "obrigatório-ish": salvar sem consultor avisa UMA vez ("Salvar sem consultor"), sem bloquear.
146. **"Minha agenda"** na Agenda para quem é consultor (filtro no servidor `consultor_id=`, lembrado no aparelho).
147. **Capacidade por consultor** na sugestão de horário: o consultor livre E a recepção com vaga; cada sugestão diz quem está livre.
148. Dois carros do mesmo consultor no mesmo horário (índice `agendamentos_slot_uk`) viram 409 com recado claro em vez de 500.
149. `GET /api/consultores/carga` e `/api/consultores/sugerir` (funções puras `cargaDoDia`/`sugerirConsultor`, testadas).

### Aviso de falta acidental bloqueado
150. Edição para "Não veio" **sem resposta → 409** `confirmar_aviso`: nada gravado, nada enviado (testado).
151. `avisar_cliente:false` → carimba `no_show_notificado_em` no MESMO update do status: o gatilho do banco não dispara.
152. `avisar_cliente:true` → mesmo fluxo do cartão (envia uma vez, carimba, solta o carimbo se falhar).
153. O modal pergunta **"Avisar o cliente pelo WhatsApp?"** antes de salvar; mudar a situação desfaz a escolha.
154. Agendamento novo nunca nasce "Não veio"; desfazer remarcação continua devolvendo o carimbo sem perguntar.

### Busca sem acento
155. Agenda: **"oleo" acha "Óleo"** (no banco real: 0 → 21 agendamentos), sem DDL nem extensão.
156. Busca global, Clientes e "Achar pelo nome" também sem acento ("jose" acha "José").

### Automações (tarefas e avisos, sem WhatsApp)
157. **16h**: horário do próximo dia útil sem confirmação → tarefa **"Confirmar com o cliente"** para o consultor (ou um gestor); sábado olha a segunda.
158. **Faltou** → tarefa **"Reagendar"** para quem atendeu a conversa (senão o consultor, senão um gestor) — na hora em que marca e no ciclo.
159. **30 min de atraso sem desfecho** → notificação para o consultor (ou os gestores), chave `atraso:<id>` para não repetir.
160. Automações só no servidor de produção (`RENDER`) ou com `AUTOMACOES=1`: servidor local de teste nunca cria tarefa.
161. `automacoes.js › planejar` puro com relógio injetável; `rodarAutomacoes` não para por erro de uma gravação.

### Segurança do servidor
162. `regras.js`: allowlist da presença e lista do gestor num lugar só, testadas por papel.
163. Só gestor/admin **apaga**, **exporta** e **muda configuração** (oficina, WhatsApp, IA, integrações, CodeWords, serviços); a tela esconde para os outros (`body.gestor`).
164. **Auditoria** (`registrar_auditoria`): apagar agendamento/cliente/consultor, exportar CSV, mudar desfecho já registrado, mudar papel/apps/acesso, senha temporária, cadastros e configuração (chaves aparecem como •••).
165. **CORS** só para os domínios do ecossistema (preflight 204); outra origem → 403.
166. **HSTS** e Cross-Origin-Opener-Policy.
167. **Limite por IP** em toda a API (300/min, IP real pelo X-Forwarded-For) e por pessoa nas rotas caras (30/min).
168. Erro interno **sem detalhe** (código da requisição; o detalhe fica só no log); recados de formulário continuam em português.
169. UUID validado nos parâmetros (`consultor_id`, `ignorar`, `agendamento_id`); busca cortada em 80 caracteres.
170. CSV do servidor neutraliza fórmula (= + - @).
171. `esc()` também escapa aspas simples.
172. **Exportar CSV** vai com o token (o link antigo levava 401) e Conectores (que mostra o token do Google Agenda) só para gestor.
173. `npm run segredos`: varre os arquivos versionados (JWT anon liberado) — limpo; `package-lock.json` para o `npm audit` (0).

### Testes e ferramentas
174. `tests/servidor.test.mjs`: o server.js de verdade por HTTP com banco e porteiro de mentira (14 testes).
175. `tests/regras.test.mjs`, `tests/automacoes.test.mjs`, `tests/conta.test.mjs` e 6 testes novos em `dados.test.mjs`.
176. Mock com os 8 papéis (`?papel=admin|gestor|atendente|agenda|desativado|semacesso|trocarsenha|mfa`, `&semsessao=1` = tela de login), usando as MESMAS regras do servidor.
177. `server.js` importável sem abrir porta nem ligar timers (`EH_PRINCIPAL`); service worker `indycar-v13` com conta.js/conta.css.

## Rodada 4 (14/10/2026)
Foco: valor ao concluir, consultor ligado ao login, modo recepção para o Franklin, velocidade do Início,
resiliência (Render fora/acordando, rede caindo no meio), tour e ajuda por papel, folha do dia, acessibilidade.
Verificado com `npm test` (100 testes, 25 novos em `tests/rodada4.test.mjs` e `tests/rodada4-servidor.test.mjs`),
`npm run check`, roteiro puppeteer contra o mock (`npm run mock`, admin/gestor/atendente/agenda, 1440 e 375 px,
tema claro e escuro, servidor fora simulado com `POST /api/__falha` e rede cortada no meio do PATCH: **100/100**),
leitura real do Supabase (só SELECT) das funções novas de `dados.js` e o `server.js` de verdade na porta 3010
(401 sem login, brotli, ETag/304, service worker abrindo a casca e a biblioteca do login SEM rede).
Sem DDL nesta rodada (nada novo no banco).

### Valor ao concluir ("Veio e fechou")
178. "Veio e fechou" abre uma janelinha com o **valor do serviço (opcional)** antes de fechar.
179. **Sugestão de valor** em 4 níveis: orçamento aprovado do Orçador › valor já anotado no horário › valor orçado do lead no CRM › mediana dos últimos serviços com o mesmo nome (`dados.sugerirValor`, pura e testada).
180. Orçamento aprovado e valor anotado já entram no campo; as sugestões menos firmes ficam num botão ✨ com a origem escrita ("média de 2 serviços iguais").
181. O botão principal diz o que vai acontecer: "Fechar com R$ 1.890,00".
182. **"Fechar sem valor"** continua valendo — ninguém fica travado.
183. Esc, × ou clique fora **desistem**: nada é enviado (`_aoFecharModal`, avisado também quando outro modal abre por cima).
184. Máscara do campo (uma vírgula, 2 casas) e erro claro para valor inválido, sem fechar a janela.
185. O servidor grava o valor **no mesmo update do status** — o gatilho do banco copia para `leads.valor_pago` e o faturamento do CRM deixa de nascer zerado.
186. Validação no servidor: formatos do Brasil ("1.250,50", "R$ 350"), teto de R$ 200 mil, só junto com "Veio e fechou", presença não manda valor (400/403 claros).
187. A tela e o servidor leem o valor do **mesmo jeito** (`planejamento.valorDeTela` × `dados.valorDeEntrada`, conferido em teste).
188. O recado depois de fechar mostra o valor ("Maria: veio e fechou — R$ 1.890,00 — foi para o CRM").
189. Sem conexão, o valor vai junto na fila do aparelho.
190. `GET /api/agendamentos/:id/valor-sugerido` (equipe; o papel presença não vê).

### Pendências do gestor (menu PENDÊNCIAS)
191. Tela **Pendências** (só gestor/admin): concluídos **sem valor** dos últimos 120 dias (hoje 60 no banco real) com o campo de valor em cada linha.
192. **Enter salva e pula para o próximo** campo; ✨ por linha traz a sugestão.
193. `PUT /api/agendamentos/:id/valor` grava no horário **e** no lead do CRM (só lead Concluído sem valor, ou com o valor antigo deste horário — o gatilho não roda quando a situação não muda) e vai para a auditoria (`preencheu_valor`).
194. Preencher valor de quem não fechou → 409 claro; valor zero ou inválido → 400.
195. Total preenchido na sessão aparece no topo do painel.
196. **Horários de mais de 7 dias sem desfecho** (hoje 47 no banco real) listados com os desfechos de sempre — sumiam do Início e prendiam o lead. Nada é migrado sozinho: cada um é decidido pela pessoa.
197. Para esses antigos, **"Não veio (sem avisar)"**: marca sem mandar o WhatsApp de falta semanas depois.
198. Selo no menu PENDÊNCIAS (sem valor + antigos) e chips no Início do gestor ("60 concluídos sem valor", "47 horários antigos sem desfecho").
199. Atendente não vê o menu nem os chips; pelo endereço vê "Só para o gestor" (o servidor recusa com 403 de qualquer jeito).
200. No celular cada linha de valor vira um cartãozinho (sem tabela para rolar de lado).
201. Aba CRM: **faturamento registrado na Agenda**, ticket médio e quantos concluídos estão sem valor, com o botão "Preencher".
202. Desempenho por consultor ganhou a coluna **Faturado**.

### Consultor
203. **Ligar o consultor ao login com UM clique**: a Equipe mostra "Ligar a Gabriel" quando o sistema reconhece a pessoa pelo nome (no banco real: "Consultor Prensencial Gabriel" → login "Gabriel").
204. Reconhecimento sem acento e sem palavras de cargo ("consultor", "presencial", até o erro "prensencial"); empate não sugere; login já ligado e inativo ficam de fora (`dados.sugerirLoginDoConsultor`, testada).
205. Ligar tem **Desfazer** no recado.
206. Login já ligado a outro consultor → recado claro (409) em vez do recado do horário disputado.
207. **Carga dos próximos 7 dias** em barrinhas por consultor (e a linha "Sem consultor").
208. **Distribuir** os horários de hoje e amanhã sem consultor: menor carga primeiro, nunca dois carros do mesmo consultor na mesma meia hora (índice `agendamentos_slot_uk`), auditado; quem não coube é contado.

### Modo recepção (Franklin, papel "só presença")
209. Tela nova de recepção: **relógio e data grandes**; as três abas são os números do dia.
210. Cartão grande: hora, nome, carro e placa em letra grande; serviço e consultor embaixo.
211. Dois botões de **64 px** para o dedo: "Chegou" (verde cheio) e "Não veio".
212. "Não veio" **pede confirmação no próprio cartão** ("o cliente recebe uma mensagem no WhatsApp") — toque sem querer não manda nada.
213. **Desfazer a chegada** (no recado e no cartão em "Já chegaram"): o servidor deixa a presença voltar só de "compareceu" para aguardando/confirmado (`regras.presencaPodeMarcar`, testada).
214. "Chegou mesmo assim" para quem foi marcado como "Não veio" e apareceu.
215. Tamanho da letra **A / A+ / A++**, guardado no perfil (`preferencias.agenda_letra`) e no aparelho.
216. Busca por **nome ou placa** (sem acento, placa sem hífen).
217. Atualiza sozinha a cada 2 min — só repinta se algo mudou e nunca debaixo do dedo (cartão ocupado ou confirmando).
218. Botões de **tela cheia** e **"Tela acesa"** (Wake Lock, pedido de novo quando a aba volta) para o tablet do balcão.
219. Imprime a folha do dia (sem telefone) direto da recepção.
220. A recepção abre a **Ajuda** (botão ?) com o "como faço" dela e volta com "← Voltar para a recepção".
221. Marcação da recepção também vai para a **fila** quando a conexão ou o servidor cai.
222. Textos da recepção falam "Chegou" (não "Compareceu"); 375 px sem rolagem lateral.

### Velocidade do Início
223. `/api/dashboard` **não espera mais a importação do CodeWords** (até 8 s por abertura): ela roda por fora e invalida o cache quando traz algo.
224. `GET /api/contagens` (só COUNT no banco) no lugar da lista inteira do follow-up a cada troca de tela; no máximo a cada 30 s.
225. O Início **pinta na hora o último painel** guardado na aba (sessionStorage, até 15 min, marca "atualizando…") e o novo entra por cima em silêncio.
226. O painel guardado some ao gravar qualquer coisa, ao sair da conta e quando a sessão cai; não troca a tela debaixo de modal aberto.
227. O Início é pedido **junto** com a oficina e os consultores (antes esperava os dois).
228. Respostas JSON acima de 1,5 KB vão em **brotli/gzip** (o painel tem ~30 KB).
229. Arquivos da tela com **ETag → 304** (conferir a versão não baixa o arquivo de novo).
230. Compressão dos arquivos guardada na memória: `app.js` 254 KB → 67 KB em brotli (medido no servidor real local).
231. Ícones e logo com cache de 1 dia.
232. Biblioteca do login com **versão fixa** (2.117.2: sem redirecionamento, cache "immutable") e `preconnect` ao CDN.
233. Janela de WhatsApp busca **só o registro** (antes baixava a agenda inteira ou todos os clientes para achar um).

### Resiliência (Render fora / acordando / rede caindo)
234. Leitura que esbarra em 502/503/504 ou na rede caindo **tenta de novo sozinha** com espera crescente (1, 2, 4, 8, 15, 30… s, ~3 min no total, com sorteio).
235. Faixa azul **"O sistema está acordando, tentando de novo… (tentativa N)"** enquanto isso; some sozinha.
236. Recado **"O sistema voltou"** quando volta.
237. Gravação nunca é repetida às cegas: 502/503/504 vira o recado "O sistema está reiniciando e não conseguiu salvar agora…".
238. Desfecho marcado com o **servidor fora** também vai para a fila (antes só sem internet).
239. Teto de 25 s por pedido: conexão pendurada vira "sem resposta" e não trava a tela.
240. A espera acorda na hora quando a internet volta.
241. Faixa da fila com **"Ver"**: lista as marcações guardadas com **Cancelar** e "Tentar enviar agora".
242. A fila tenta sozinha a cada 30 s enquanto tiver algo (o evento "online" não dispara quando o problema é o servidor).
243. A fila para em erro de sessão/acesso (não descarta a marcação) e só descarta o que o servidor recusou de verdade.
244. Testado o **pedido cortado no meio** (rede abortada no PATCH): vai para a fila e sai quando a rede volta.
245. Service worker `indycar-v14`: rede primeiro, mas com **3 s de paciência** — passou disso (ou 502/503 do Render), serve a casca guardada.
246. O service worker guarda a **biblioteca do login**: sem rede a tela abre de verdade (testado offline: capa e supabase-js carregam; a CSP ganhou o CDN em `connect-src` para isso).
247. **Rascunho do agendamento**: o formulário fica guardado na aba enquanto se digita; fechou sem salvar (clique fora, sessão caiu, recarregou) → volta ao abrir de novo, com "Descartar". Salvar ou Cancelar apagam.
248. Tela que não carregou mostra **"Tentar de novo"** (antes: "Erro ao carregar: Failed to fetch").
249. Sessão vencida não pinta erro por baixo da tela de login.

### Mais funcionários: tour e ajuda
250. **Tour de boas-vindas** na primeira vez, por papel: recepção (5 passos), equipe (5) e gestor (+ Pendências).
251. O tour destaca o botão de cada passo, prende o foco, fecha com Esc e fica marcado no perfil (`preferencias.agenda_tour`) e no aparelho.
252. Preferências do perfil agora são **mescladas**: gravar as da Agenda não apaga as que os outros apps guardam na mesma coluna (`juntarPreferencias`, testada).
253. Tela **AJUDA** (menu e tecla **?**): "como faço…" do papel, atalhos de teclado e o que pedir ao gestor.
254. "Ver o tour de novo" na Ajuda.

### Folha do dia
255. Imprimir abre a escolha do dia: **hoje, amanhã ou outra data**.
256. Telefone **opcional** na folha (desmarcar quando ela fica à vista no balcão).
257. Colunas novas: **#**, **Consultor**, observação curta, **"Chegou?"** e **"Fechou?"** para marcar à mão; cancelados fora.
258. A folha sai **deitada** (página com nome só para ela — a Semana continua em pé), cabeçalho repetido em cada página e linha "Conferido por".

### Acessibilidade
259. Link **"Pular para o conteúdo"** no topo.
260. Menu com `aria-current="page"` e **título da aba por tela** ("Pendências · IndyCar Agenda").
261. Troca de tela **anunciada** ao leitor de tela (região invisível).
262. Recado de erro com `role=alert` (anunciado na hora); os comuns com `status`.
263. Abas do dia com `role=tablist/tab`, `aria-selected` e **setas / Home / End** no teclado (Início e recepção).
264. `label for` nos campos das janelas de modelo e de WhatsApp; Histórico com rolagem própria e `scope` nos títulos.
265. Foco visível nas abas, chips, botões da recepção e itens da Ajuda.
266. Texto só para leitor de tela não empurra mais a página para o lado no celular (achado no 375 px da Equipe e das Pendências).
267. Rótulo "RELACIONAMENTO" do menu não corta mais; o menu esmaece no pé quando ainda tem item para rolar.
268. Contraste do texto secundário no tema claro conferido (≥ 4,5:1).

### Testes e ferramentas
269. `tests/rodada4.test.mjs` (14): valor, sugestão, consultor ↔ login, distribuição, preferências, presença, rotas de gestor, resiliência, recepção, carga da semana.
270. `tests/rodada4-servidor.test.mjs` (11): o server.js por HTTP — valor no PATCH, painel de valores, contagens por papel, desfazer chegada, sugestão de login, distribuir, brotli/gzip, ETag/304, versão e service worker.
271. Mock: `POST /api/__falha {status, vezes}` (simula o Render fora), `POST /api/__reset`, rotas novas e um consultor sem login para testar o "Ligar a …".
272. Versão `2026-10-14-r4` em `/api/versao` e no app.
273. ETag aceito também na forma fraca (W/"…") que o proxy do Render devolve quando ele mesmo comprime — achado conferindo em produção (antes o 304 virava 200).
