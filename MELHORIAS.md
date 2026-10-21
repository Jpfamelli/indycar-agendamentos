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

## Pátio (16/10/2026)
O "Chegou" da Agenda já abre a ordem no IndyCar Pátio (gatilho do banco). A Agenda passa a mostrar o que acontece lá dentro.
274. **Selo da etapa do Pátio** no cartão de quem chegou (Início, Agenda, Pendências e modo recepção): "Em execução · 1 p/ aprovar", "Pronto", "Entregue"… com a cor da etapa.
275. O selo é um link: toca e abre a ordem no Pátio (`https://indycar-patio.netlify.app/?os=<id>`); no cartão do painel há também o botão "Abrir no Pátio".
276. Uma chamada só por tela (`GET /api/patio/agendamentos?ids=…`, até 60 ids, só uuid), guardada 30 s no aparelho; sem o Pátio o cartão fica como sempre.
277. Na ficha do agendamento: bloco do Pátio com etapa, nº da ordem, extras aprovados, **"Link de acompanhamento"** (copia) e **"Enviar pelo WhatsApp"** (texto pronto, "carro", sem "prezado").
278. O link do cliente segue `patio_config.link_base` (lido do banco, cache 60 s) + `/acompanhar/?t=<token>`; ordem cancelada não tem link; o token cru nunca sai fora do link.
279. **"Veio e fechou" soma os extras APROVADOS** pelo cliente no Pátio à sugestão que já existia (orçamento > valor do horário > CRM > média); recusados e pendentes não entram.
280. A soma não troca a fonte da sugestão: só orçamento/valor anotado preenchem o campo; extras sozinhos viram o botão ✨; o que a pessoa digitou nunca é sobrescrito.
281. **Pendências: "Entregues no Pátio sem desfecho"** — o carro saiu da oficina e a Agenda ainda não tem Veio e fechou/não fechou; cartão com os dois desfechos (só gestor, `GET /api/patio/entregues`).
282. Contagem nova `entregues` em `/api/contagens` (só gestor): entra no selo do menu Pendências e vira chip no Início.
283. Recepção (papel agenda) vê o selo do pátio (rota liberada só para leitura); a lista de entregues continua só do gestor.
284. `patio.js` com as regras puras (links, soma em centavos, entregues sem desfecho, ids) e `tests/patio.test.mjs` (11 testes, inclusive as rotas por HTTP e os papéis).
285. Mock com ordens de mentira (Patrícia em execução com extras; Rogério entregue sem desfecho) e roteiro de navegador em 1440/375 px sem rolagem lateral.
286. Versão `2026-10-16-patio`, service worker `indycar-v15`.

## Rodada 5 (16/10/2026)
Foco: horários livres como SERVIÇO (para a IA do Atendimento oferecer horário), lista de espera, confirmação do
cliente pelo link, "Chegou" com a OS do Pátio, visão 360 do cliente, aniversários, recepção mais simples e a
preparação para a IndyCar Central (handler exportado, tudo relativo). Verificado com `npm test` (135 testes, 24 novos
em `tests/horarios.test.mjs` e `tests/rodada5-servidor.test.mjs`), `npm run check`, roteiro puppeteer contra o mock
(admin e Franklin, 1440 e 375 px: **51/51**, capturas em `capturas-r5/`), leitura do banco real e DO-block revertido
(`scripts/sql/teste_ag_rodada5.sql`), `get_advisors` depois da migração.

### Horários livres como serviço (missão 1)
287. Módulo puro `horarios.js`: todos os horários livres de um dia (não só 3 sugestões), com `livresDoDia`, `proximosDias`, `duracaoDoServico`, `janelasDoServico`, `resumoDoDia` e `lerParametros` — 11 testes.
288. Regra de duração por serviço: `servicos.duracao_min` (nome igual ou contido, o mais específico ganha), senão palavras-chave, senão 60 min — e o serviço precisa caber até as 17h30.
289. Janelas de agendamento (`janelas_agendamento`) do tipo que casa com o serviço (sem acento, palavra em comum) limitam o horário de chegada; faixa vazia (08:00–08:00) é ignorada; sem janela, o expediente inteiro vale.
290. Capacidade = consultores ativos; um consultor nunca tem dois carros na mesma meia hora (a mesma regra do índice `agendamentos_slot_uk`); cada horário diz quais consultores estão livres.
291. Hoje só a partir de 30 min de agora; domingo, dia passado e consultor inativo devolvem `aberto:false` com o motivo.
292. `motivo` explica o "nenhum": `domingo` · `passou` · `encerrado` · `lotado` · `fora_da_janela` · `consultor_inativo` (a tela e a IA mostram a frase certa).
293. `GET /api/horarios-livres/dia?data&servico&consultor_id&ignorar` → grade completa com `resumo` em texto ("sex 17/10: 08:00, 08:30 (+5)") pronto para a IA colar na conversa.
294. `GET /api/horarios-livres/proximos?desde&servico&dias&quantos` → os próximos dias com vaga (pula domingo, para em N dias com horário).
295. Data inválida → 400 claro; as duas rotas entram no freio de rotas caras (30/min por pessoa); o papel `agenda` não oferece horário (403); sem login 401.
296. Função SQL `agenda_horarios_livres(p_dia date, p_servico text, p_consultor uuid)` (migração `ag_rodada5_horarios_espera_confirmacao`, cópia em `scripts/sql/2026-10-16_ag_rodada5.sql`): o MESMO cálculo em plpgsql para quem não depende do servidor (Edge Functions, IA, pg_cron).
297. A função é SECURITY DEFINER com `search_path = ''`, só equipe (`usuario_equipe()`) ou a chave de serviço; anon e perfil sem papel recebem 42501 (testado em DO-block revertido).
298. Auxiliar `normalizar_texto_agenda(text)` (imutável, sem acento) para casar serviço × cadastro × janela no banco.
299. Conferido no banco real: amanhã com "Troca de óleo" devolve 6 horários dentro da janela 08–11 com 40 min; sem serviço 17 horários; domingo e dia passado devolvem o motivo.
300. `dados.horariosLivresDoDia` e `horariosProximosDias` leem serviços/janelas/consultores com cache de 60 s e só os agendamentos vivos do período (uma consulta).
301. Contrato publicado no README (seção "Horários livres como serviço") e mandado ao coordenador pela Ponte.

### Lista de espera (encaixe)
302. Tabela `ag_lista_espera` (RLS: equipe lê/cria/edita, gestor apaga; `telefone_e164` gerada pelo mesmo `normalizar_telefone` dos clientes; índices por status e telefone).
303. Menu **ESPERA** (tecla E) com selo de quantos estão esperando; filtros Esperando · Agendadas · Canceladas.
304. "Entrar na lista de espera": nome, telefone, serviço (com o catálogo), carro, placa, preferência (manhã/tarde/sábado…), período "a partir de / até" e observações.
305. Com telefone, a espera é ligada à ficha existente pelo `telefone_e164` (sem criar cliente novo por uma espera).
306. Cada item diz há quantos dias espera, o período que serve e tem WhatsApp pronto ("abriu um horário para …"), Editar e Cancelar (com Desfazer).
307. **Encaixar** abre o Novo agendamento já preenchido e cai no primeiro horário livre do dia (pela duração do serviço); ao salvar, a espera vira "agendada" com o `agendamento_id` (auditado).
308. "Não veio" e cancelado devolvem no recado quem da lista cabe naquele dia (serviço igual primeiro, depois o mais antigo) com o botão "N na espera", que abre a lista já com a pessoa destacada.
309. No Novo agendamento, o botão "Lista de espera" leva o que já foi digitado (nome, telefone, serviço, carro, data) para a espera — nada se perde quando não há horário.
310. A Agenda ganhou o botão "Espera" com a contagem; o chip do menu e `/api/contagens` trazem `espera` para toda a equipe.
311. Validações no servidor: nome e serviço obrigatórios, telefone com DDD, datas reais, período não invertido, ids uuid; apagar é só do gestor (regras.js + teste).
312. Função pura `esperaQueCabe` (testada): abertas cujo período inclui o dia, serviço igual primeiro.
313. No celular cada espera vira cartão com os botões em linha (375 px sem rolagem lateral).

### Confirmação do cliente (link/WhatsApp) e o selo "confirmou"
314. Tabela `ag_confirmacoes` (token de 36 hex, canal, aberto/respondido, resposta confirmou|nao_vem|remarcar, observação); só a equipe lê; só o servidor grava.
315. Botão ✓ **Pedir confirmação** no cartão (e no horário aberto) de quem ainda vai vir e tem telefone: o servidor gera o link e o texto; a pessoa manda pelo WhatsApp (abre com o texto) ou copia.
316. O link é reaproveitado por 72 h (o cliente recebe sempre o mesmo) e respeita a base da requisição + prefixo (funciona sozinho e sob a Central).
317. Página pública `public/confirmar/` (sem login, caminhos relativos, 375 px, tema claro/escuro, `noindex`): primeiro nome, dia, hora, serviço e três botões grandes — Confirmo · Preciso remarcar · Não vou conseguir.
318. "Remarcar" e "Não vou" pedem um recado opcional; reabrir o link mostra a resposta já dada; horário que passou ou com desfecho avisa; token inválido tem recado claro.
319. `GET/POST /api/publico/confirmacao` sem login, pelo token, com freio de 40 pedidos por 10 min por IP (testado: o 41º leva 429); a resposta nunca inclui telefone.
320. "Confirmou" liga `agendamentos.confirmado` e passa Aguardando → Confirmado (gatilho `ag_confirmacao_aplica` + o servidor garante) — o cartão fica verde e a tarefa "Confirmar com o cliente" não nasce.
321. "Remarcar"/"Não vem" viram tarefa prioridade 1 para o consultor do horário (ou um gestor), com o recado do cliente na descrição.
322. Selo no cartão: "✓ confirmou pelo link" (verde), "quer remarcar", "avisou que não vem" e "pedido de confirmação enviado" (cinza, com a hora no tooltip) — anexado só a quem ainda não tem desfecho (`anexarConfirmacoes`).
323. Horário com desfecho recusa o pedido (409); o papel `agenda` não pede confirmação (403).
324. Texto do pedido sem "prezado/veículo/efetuar/comparecer" (teste conferindo).

### "Chegou" com a OS do Pátio, no-show com remarcação e remarcar melhor
325. O PATCH de "Chegou" devolve a ordem que o Pátio acabou de abrir (`patio`: nº, etapa, link) — o recado diz "OS nº 123 aberta no Pátio" com o botão **Abrir no Pátio** (recepção e painel), sem segunda chamada.
326. O selo do Pátio no cartão passou a mostrar o nº da OS ("OS 101 · Em execução · 1 p/ aprovar").
327. "Não veio" ganhou **Remarcar** com um clique no próprio recado (abre o Remarcar daquele horário) — e o aviso de quem está na espera.
328. O Remarcar mostra a grade de **todos os horários livres do dia** (duração do serviço, janelas, consultores) com ‹ › para andar o dia, além dos 3 "próximos dias" de sempre; clicar preenche data/hora.
329. O ✨ do Novo agendamento virou "Horários livres": a mesma grade do dia escolhido (recalcula ao trocar data ou serviço) + as 3 sugestões; chips já mostram quem está livre no tooltip.
330. Depois de remarcar, o recado oferece **Avisar o cliente**: `POST /api/agendamentos/:id/avisar-remarcacao` põe uma mensagem avulsa na fila do Comunicar (`posvenda_envios`, tipo avulsa, vence em 24 h, chave única por horário — não repete).
331. O aviso respeita `clientes.aceita_mensagens`: quem pediu para não receber faz o WhatsApp abrir com o texto pronto em vez de entrar na fila; sem telefone, o recado diz; tudo auditado (`avisou_remarcacao`).
332. Semana › **Dia** ganhou a grade das meias horas (8h–17h30) com quantos carros há em cada casa e a capacidade; casas que já passaram ficam apagadas.
333. **Arrastar um horário para uma casa de hora** remarca a HORA (no dia ou entre dias, mantendo a hora quando solta no dia); sempre com confirmação "de → para" (arrastar sem querer acontece), aviso de disputa e Desfazer no recado.
334. Soltar numa hora que já passou hoje avisa em vez de remarcar.
335. Recado com mais de uma ação (`toast({ acoes:[…] })`): Avisar o cliente + Desfazer, Remarcar + espera, Abrir no Pátio + Desfazer.

### Busca, atalhos e impressão
336. Ctrl+K: ↑ ↓ andam pelos resultados e Enter abre o marcado (ou o primeiro); dica de teclado na própria janela.
337. A busca da Agenda acha telefone completo (com ou sem 55) pela coluna `telefone_e164` (índice) e placa digitada com hífen/espaço ("ABC-1D23") acha a gravada seca.
338. Atalhos de uma letra para as telas: I início · A agenda · E espera · C clientes · F follow-up · H histórico · P pendências (só gestor) — fora de campo de texto e fora da recepção.
339. Ajuda lista os atalhos novos e os "como faço" novos (pedir confirmação, lista de espera, visão 360, arrastar para a hora, OS no Chegou, na casa).
340. Tour da equipe ganhou o passo da lista de espera.
341. A tela Agenda ganhou o botão de imprimir a folha (hoje, amanhã ou outra data) — antes só no Início.

### Recepção (Franklin) mais simples
342. Resumo grande no topo: **N na casa** (carros dentro da oficina, inclusive os que chegaram outro dia), **N chegam hoje** e o próximo a chegar (hora + nome).
343. A recepção passa a receber também quem chegou em outro dia e ainda não saiu (`naCasaDeOutrosDias`, 7 dias), sempre sem telefone — o cartão mostra "desde ontem".
344. "Chegou" mostra a OS do Pátio e o botão Abrir no Pátio no recado (ver 325); o selo com o nº da OS entra em "Já chegaram".
345. A recepção não chama nada da ficha 360, espera, aniversários ou busca global (todas guardadas por `emPresenca()`), e o servidor recusa com 403 de qualquer jeito — tela não quebra (roteiro com o papel agenda em 1440 e 375 px).
346. Tour e Ajuda da recepção explicam o nº da OS e o "na casa".

### Ficha do cliente com `cliente_360` e telefone normalizado
347. `GET /api/clientes/360?tel=` (equipe; rpc `cliente_360` da base pelo telefone normalizado) — se a rpc recusar ou faltar, devolve `indisponivel` e a ficha de sempre continua.
348. Dobra **Visão 360** na ficha do cliente e no agendamento (quando há telefone): gasto total, serviços feitos, faltas, última visita, próximo horário e mensagens.
349. Chips com link: conversa no Atendimento (etapa, "aguardando consultor"), carro no Pátio (OS, etapa, extras p/ aprovar), leads abertos no CRM, orçamentos (último status), tarefas abertas, indicações feitas/recebidas, opt-out.
350. A dobra abre sozinha quando há algo urgente (carro no pátio, lead aberto ou cliente aguardando consultor) e fica fechada no resto.
351. A última mensagem do Comunicar aparece com tipo, data, status e a resposta do cliente.
352. Links cruzados por `telefone_e164` (`?tel=`) em todos os chips — nada de redigitar telefone.

### Aniversário do cliente (pendência das rodadas 3/4, sem bloquear)
353. Campo **Aniversário (opcional)** no Novo/Editar agendamento com máscara DD/MM; ao salvar, vai para a ficha do cliente (`clientes.nascimento`); se falhar, o agendamento já está salvo e o recado explica.
354. O rascunho do agendamento guarda o aniversário também.
355. Chip **🎂 N aniversários esta semana** (ou "hoje") no Início para a equipe; `GET /api/aniversarios?dias=7` com cache de 10 min (uma varredura de `clientes.nascimento`).
356. Lista dos aniversariantes com "em N dias", idade (quando o ano é real; 1904 = só dia/mês), carro, opt-out, WhatsApp "parabéns" pronto e Abrir ficha — a mensagem automática continua sendo do Comunicar.
357. Função pura `aniversariantes` (testada): hoje = 0 dias, virada de ano, ignora quem não tem data.

### Preparação para a IndyCar Central (missão 5)
358. `server.js` exporta `{ handler, iniciar, server, VERSAO }`; o `http.createServer` usa o `handler`; `listen` só quando é o programa principal.
359. `iniciar({ ouvir:false })` prepara (config, token do ICS) e liga os timers sem abrir porta — é como a Central monta a Agenda.
360. Os timers (importação do CodeWords, automações) só nascem em `iniciar()`: importar o módulo (testes, Central) não dispara nada; `unref` para não segurar o processo.
361. `baseDaRequisicao(req)`: links que o servidor monta para fora (confirmação) usam `X-Forwarded-Proto/Host` + `req.prefixo` (testado com os cabeçalhos do Render).
362. `public/apps.js` (`IndyCarApps`): UM lugar com os endereços de Agenda, CRM, Atendimento, Comunicar, Orçador, Pátio, Site e Ads; `window.INDYCAR_APPS` antes dele redefine tudo (a Central põe `/crm/` etc.).
363. `IndyCarApps.raiz()` / `raizAbsoluta()`: a raiz deste app ("/" ou "/agenda/"); todo `fetch` do app.js, o registro do service worker, o primeiro acesso, o download de CSV, a URL do ICS e do webhook partem dela.
364. `index.html` sem nenhum caminho absoluto (`./styles.css`, `./app.js`…); `manifest.json` com `start_url`/`scope`/ícones/atalhos relativos; atalho novo "Lista de espera".
365. `sw.js` (`indycar-v16`) calcula a raiz pelo `self.registration.scope`, guarda a casca relativa (com `apps.js` e `rodada5.css`) e nunca guarda `/api/` nem `/confirmar/`.
366. `planejamento.js`, `conta.js` e o seletor "Apps" leem os endereços do `IndyCarApps` (com reserva de produção para os testes no Node); a faixa de saúde, a Conexão do WhatsApp e o link do Comunicar idem.
367. `conta.js`: "esqueci a senha" volta para a raiz do app, sair volta para a raiz, links das notificações relativos à raiz.
368. Teste garante: nenhum `fetch('/api`, nenhum `register('/sw.js')` e nenhum endereço `onrender/netlify` fixo fora do `apps.js`.
369. README: tabela de TODAS as variáveis de ambiente que o servidor lê e a seção "Preparado para a IndyCar Central".
370. `GET /confirmar/` é servido como pasta estática (index.html da pasta) — qualquer pasta em `public/` funciona assim.

### Bugs achados e corrigidos
371. `blocoPatioNaFicha` cortava o primeiro nome com `split(/s+/)` (barra perdida): "Oi Maria Aparecida!" em vez de "Oi Maria!" no texto do link de acompanhamento.
372. `dataBanco` aceitava mês 99 / dia 32 e virava 500 genérico lá no Postgres; agora é null → 400 claro (em todas as rotas que recebem data).
373. Mock: três `replace(/D/g)` (barra perdida) deixavam telefone com máscara nos agendamentos de mentira e quebravam a busca por dígitos.
374. Mock: `tel` usado antes de ser declarado (TDZ) derrubava o servidor de mentira na ficha 360; id da espera nova colidia com uma existente.
375. Ficha do cliente: a chave "Aceita mensagens automáticas" tinha a caixinha solta no meio e o texto fora da linha.
376. O teste do `conta.js` lia `CONTA_APPS` até o primeiro `};` — agora entende a função imediata.

### Servidor, segurança e miudezas
377. `PATCH /status` de "Não veio"/cancelado NÃO entrega a lista de espera ao papel agenda (ele não enxerga espera).
378. `POST /api/espera` grava `criado_por` com o id do token, nunca do corpo; `atualizarEspera` carimba `resolvido_em/por` ao agendar/cancelar e limpa ao reabrir.
379. Auditoria: `espera_agendada`, `espera_cancelada`, `apagou_espera`, `avisou_remarcacao`.
380. `ag_confirmacao_aplica()` teve EXECUTE revogado de anon/authenticated (migração `ag_rodada5_revoke_trigger_fn`) — `get_advisors` sem aviso novo além do genérico das rpc SECURITY DEFINER (igual à `cliente_360`).
381. `scripts/sql/teste_ag_rodada5.sql`: teste reproduzível (anon 42501, sem perfil 42501, espera com `telefone_e164`, confirmação liga `confirmado`) — tudo revertido.
382. Versão `2026-10-16-r5` em `/api/versao` e no app; `npm run check` cobre `horarios.js` e `apps.js`.
383. `/api/contagens` devolve `espera` para toda a equipe (o selo do menu não precisa da lista).
384. Grade de horários no modal: `escolhido` destacado em vermelho; chips com o fim do serviço e quem está livre no tooltip; "lotado"/"fora da janela"/"encerrou" explicados em português.
385. Toast: ações secundárias esmaecidas; todas desligadas ao fechar (nada de Enter em botão invisível).
386. Rótulo do "Chegou" na recepção com "desde ontem/sex 10/10" quando o carro é de outro dia; `aria-label` do cartão diz desde quando.
387. CSS novo isolado em `rodada5.css` (só variáveis de `styles.css`: os dois temas funcionam); `[hidden]{display:none!important}` mantido.
388. Roteiro puppeteer da rodada (`capturas-r5/`, 16 telas): admin 1440/375, Franklin 1440/375 e a página pública do cliente em 375 px, sem rolagem lateral e sem erro de console além dos 403/404 propositais.

### Segunda leva (depois do roteiro): confirmação no dia a dia, espera em todo lugar, página do cliente
389. Chip no Início para a equipe toda: "N horários de amanhã sem confirmação" (próximo dia útil — sábado aponta para segunda) → abre a Agenda já filtrada para pedir pelo link.
390. `/api/contagens` ganhou `semConfirmacao` (só COUNT: aguardando e `confirmado=false` no próximo dia útil) e `proximoDia`.
391. Agenda: botão-filtro **Sem confirmação** com a contagem (só horários à frente ainda não confirmados) e estado vazio "Todo mundo confirmado".
392. Semana: filtro "Só sem confirmação" junto dos outros (função `filtrar` pura, respeita o selo do link).
393. Semana: "+N na espera" no cabeçalho de cada dia (quem da lista serve para aquele dia) — toque abre a lista.
394. Folha do dia: coluna "Confirmou?" já vem marcada ☑ para quem confirmou (pelo link ou pela equipe).
395. CSV de agendamentos ganhou as colunas `confirmado` e `valor`.
396. Ctrl+K busca também a **lista de espera** (nome, placa, serviço, telefone); o resultado abre a lista com a pessoa destacada.
397. Aba CRM (gestor): painel "Confirmação pelo link · 30 dias" — taxa de resposta, quantos confirmaram, pediram remarcar, avisaram que não vêm, sem resposta e quantos abriram o link.
398. `GET /api/confirmacoes/resumo?dias=` (gestor; `regras.js` + teste 403 para atendente).
399. "Remarcar"/"Não vem" pelo link também tocam o **sino** de quem cuida do horário (consultor ou gestor), com chave única por horário+resposta (o cliente tocar duas vezes não repete).
400. Página do cliente: depois de confirmar, **Adicionar ao calendário** (.ics de 1 h gerado na própria página, com o endereço da oficina).
401. Página do cliente: **Como chegar** (Google Maps pelo endereço de `agenda_empresa`) e **Falar com a oficina** (WhatsApp da empresa) — a rota pública manda só dados públicos da oficina, nunca o telefone do cliente (teste).
402. Equipe: cada consultor ativo mostra "livre às HH:MM" (primeira meia hora livre dele hoje) ou "sem vaga hoje", a partir do serviço de horários.
403. `GET /api/horarios-livres/dia` devolve também `total` e `proximo` (o primeiro livre) — a IA responde "o mais cedo é às 08:30" sem percorrer a lista.
404. Editar agendamento mostra a linha "Confirmou pelo link em…", "Pediu para remarcar…", "Avisou que não vem…" ou "Pedido enviado em… sem resposta".
405. Recepção: o botão Atualizar mostra a hora da última atualização ("10:48") — a pessoa sabe que a tela está viva.
406. Tour da recepção ganhou o passo "Quem está na casa".
407. Cadastrar/editar consultor ou serviço esquece a base dos horários livres na hora (o cache de 60 s não mostra grade velha).
408. Mudar o aniversário na ficha esquece a lista de aniversariantes (o chip do Início acompanha).
409. `GET /api/espera?data=&servico=` devolve só quem cabe naquele dia (mesma regra do recado do "Não veio").
410. Espera: o modal avisa "A partir de" depois de "Até" antes de enviar; o servidor recusa também.
411. Encaixar prefere a data "a partir de" da espera quando é futura; senão hoje.
412. Grade de horários: ‹ › nunca voltam para antes de hoje e pulam o domingo.
413. Recados com ação ficam mais tempo na tela (9–10 s) para dar tempo de tocar em "Remarcar"/"Avisar o cliente".
414. Seletor "Apps" passou a listar o **Pátio** e esconde app sem endereço (Tráfego pago, que não está publicado).
415. `IndyCarApps.url(app, '?lead=…')` monta links cruzados com os caminhos relativos que a `cliente_360` devolve (`/?lead=`, `/?os=`, `/?conversa=`) — funciona nos endereços de hoje e nos da Central.
416. O Pátio ganhou endereço no `apps.js` (`patio`) e o selo/links do Pátio na Agenda continuam vindo do servidor (`patio_config.link_base`).
417. A rota antiga `GET /api/horarios-livres` (3 sugestões) continua igual — nada que já usava quebrou.
418. `/api/aniversarios` com `Cache-Control: private, max-age=300` (o navegador não repete a varredura a cada troca de tela).
419. A página pública nunca entra no cache do service worker e responde `no-store` (cada toque do cliente é verdade).
420. Tela Agenda: ao abrir pelo chip "sem confirmação" o filtro "sem telefone" é desligado (um filtro de cada vez, sem lista vazia por engano).
421. README: lista de endpoints com todas as rotas novas (horários livres, espera, confirmação, 360, aniversários, aviso de remarcação, resumo das confirmações).
422. Mock: rotas novas (`/confirmacoes/resumo`, espera na busca, oficina na confirmação, `semConfirmacao`) e dados de mentira (duas esperas abertas e uma agendada, uma confirmação respondida e uma pendente, janelas e durações iguais às do banco).
423. Testes: +2 (contagens/resumo/busca/CSV e página pública + sino) — total 135.
424. Roteiro de navegador repetido depois da segunda leva: 51/51, sem erro de console novo.
425. Pedir confirmação vai para a auditoria (`pediu_confirmacao`: cliente, data, hora, canal) — o gestor vê quem pediu o quê.
426. `POST /api/espera` com freio de 30 por minuto por pessoa (um script distraído não enche a lista).
427. Espera ligada a uma ficha mostra o botão de abrir a ficha do cliente (com a Visão 360) direto da lista.
428. Página do cliente: ao reabrir o link, mostra quando a resposta foi dada ("Você respondeu (16/10 10:48)").
429. A notificação do sino abre o horário certo na própria Agenda (link `/?agendamento=`), sem recarregar — no celular do consultor também.
430. Apagar uma espera (gestor) pede confirmação; cancelar tem Desfazer; reabrir devolve à lista — ninguém some por engano.
431. Botões-filtro da Agenda ("Sem telefone", "Sem confirmação") com `aria-pressed` e contagem anunciada.
432. O ✓ de pedir confirmação some de horários que já passaram, de quem não tem telefone e de quem já confirmou pelo link — só aparece quando faz sentido.
433. Notificação com link absoluto só abre se o endereço for de um app do ecossistema — a lista agora é a única do `apps.js` (com o Pátio).
434. Selos do menu (Espera, Follow-up, Pendências) somem no zero em vez de mostrar "0".
435. Os filtros da Semana (inclusive "sem confirmação") ficam valendo ao andar o período com ‹ ›.
436. A rota de horários livres do dia é a mesma usada pelo Remarcar, pelo Novo agendamento, pelo Encaixar e pela Equipe — uma regra só, testada uma vez.

### Como verifiquei
- `npm test`: 135 testes (horários livres puros, rotas novas por HTTP com banco/porteiro de mentira, papéis, caminhos relativos, versão).
- `npm run check`; roteiro puppeteer-core + Chrome contra `npm run mock` (51 conferências); capturas em `capturas-r5/`.
- Banco real: só leitura (`agenda_horarios_livres` para amanhã/domingo/ontem) e DO-block revertido (`scripts/sql/teste_ag_rodada5.sql`); `get_advisors` security depois da migração.
- Produção: `publicar.mjs agenda` e conferência de `/api/versao`, `/confirmar/?t=x`, `/apps.js`, `/api/horarios-livres/dia` (401 sem login) e `/api/publico/confirmacao` (404 com token inválido).

### Pendências
- `cliente_360` ainda não traz `avaliacoes` nem o histórico do pátio por etapa com tempos — quando a base ganhar, a dobra 360 só precisa de um chip.
- O aviso de remarcação entra como mensagem **avulsa** na fila do Comunicar (não há tipo `remarcacao` no CHECK de `posvenda_envios`); pedido ao coordenador: tipo próprio com rótulo e ícone no Comunicar.
- A Central (onda B2) precisa: montar `handler` sob `/agenda/` com `req.prefixo`, definir `window.INDYCAR_APPS` antes do `apps.js`, e manter `/confirmar/` acessível sem login no prefixo (o link do cliente já sai com o prefixo).
- Arrastar na Semana continua só com mouse (o celular usa o Remarcar com a grade).

## Rodada 5 · Onda C · C7 — verificação da Agenda e da recepção (16/10/2026)
Bugs achados e corrigidos (cada um com teste em `tests/r5c-agenda.test.mjs`):
1. Editar um agendamento mandava TODOS os campos do modal aberto (situação, hora, confirmação): o "Chegou" da recepção voltava a Aguardando. Agora só vai o que mudou (`Planejamento.soMudancas`).
2. Horários livres (JS e função SQL `agenda_horarios_livres`) ignoravam que o índice `agendamentos_slot_uk` segura a casa de quem já foi concluído/não fechou: oferecia hora que o banco recusava (migração `r5c_agenda_horarios_livres_indice`).
3. Balcão: marcar de novo quem foi cancelado/faltou na mesma hora devolvia o cancelado ("salvo" sem agendar); dois clientes com o mesmo nome e telefones diferentes viravam um só.
4. Link de confirmação: resposta repetida refazia tarefa e sino; link de horário já atendido/de dia que passou ainda aceitava resposta (409 agora).
5. Aviso de remarcação: 3 remarcações seguidas deixavam 3 mensagens contraditórias na fila; agora só vale a do horário atual; usa o tipo `remarcacao` do Comunicar; voltar a um horário antigo reativa o aviso.
6. Desfazer "Chegou" deixava a OS aberta no Pátio sem avisar (carro-fantasma): o servidor devolve `patio_aberta` e a tela avisa.
7. Recepção não pode marcar "Não veio" em quem já chegou (mandaria WhatsApp de falta a quem está na oficina).
8. Valor/CSV: `Number()` puro virava "1.250,50" em 0 e 1,25; agora `valorDeEntrada`; CSV sai com vírgula decimal. Nome/serviço em branco ou objeto → 400.
9. Cache dos horários era esquecido ANTES de gravar serviço/consultor (e não ao apagar); automação das 16h não pede "confirme" a quem já respondeu remarcar/não vem; segundo encaixe da espera dá 409; SIGNED_OUT em outro app volta ao login; toast com 2 botões no celular não vira coluna de 80 px; trocar consultor atualiza a grade.
Pendências: script inline do index.html ainda exige 'unsafe-inline' na CSP; cancelar a OS do Pátio ao desfazer o Chegou é do Pátio (gatilho patio_da_agenda).

## Decisão do João (16/10/2026) — aviso de falta sem confirmação não sai duas vezes
- O aviso de "Não veio" (`enviarViaGowa`) soltava o carimbo `no_show_notificado_em` em QUALQUER falha, inclusive timeout — o próximo clique em "Não veio" mandava de novo, mesmo se o primeiro tivesse chegado. Agora timeout/conexão caída depois do pedido (`regras.js#semConfirmacaoDoErro`) devolve `semConfirmacao` e o carimbo **fica**; a tela diz "não sabemos se o aviso chegou — confira na conversa do cliente antes de mandar de novo". Recusa antes de enviar e 5xx com resposta continuam soltando o carimbo (próximo clique tenta de novo). A leitura do corpo agora também cai no mesmo tratamento.
- Bug achado no caminho: salvar um agendamento pela edição com "Não veio" mostrava sempre "sem telefone — nenhum aviso enviado" (passava o aviso em vez da resposta para `recadoDeAusencia`). Corrigido.
- Testes em `tests/servidor.test.mjs` (timeout e conexão caída não reenviam; conexão recusada e 500 liberam o novo clique).

## Rodada 6 (21/10/2026) — Casa e Agenda (C1)

### Busca global da Casa (Ctrl+K)
437. 🔗 Busca em TODOS os sistemas numa chamada só (`r6_busca_global`, do X3 — fonte única; a primeira versão do C1 foi removida): clientes, Agenda, Pátio, Orçador, Atendimento, CRM e envios do Comunicar — telefone, nome, placa ou nº da OS/orçamento.
438. A função do X3 é SECURITY INVOKER: o RLS de cada tabela decide o que cada pessoa vê (mecânico só enxerga o Pátio; testado com perfis reais).
439. Telefone com máscara/parcial (`12 99182`), placa antiga e Mercosul (`ABC-1D23`), `#31` (OS/orçamento) e nome sem acento — o texto digitado é classificado antes de ir ao banco (vazio/curto nem chama).
440. 🔗 Cada resultado abre na aba nomeada do app dele já no registro certo (`/agenda/?agendamento=`, `/crm/?lead=`, `/atendimento/?conversa=`, Pátio `?os=`, Orçador `#/historico/<id>`, Comunicar `?tel=`).
441. 🔗 O cliente achado traz atalhos para as outras telas: CRM, Conversa, Comunicar e "Novo orçamento" já com telefone e nome (o Orçador aceita `?tel=&nome=`).
442. 🔗 O horário achado mostra a etapa do carro no Pátio (`Pátio #31`) e dá o atalho para ele.
443. 🔗 Telefone sem resultado oferece "Marcar horário / Abrir conversa / Novo orçamento / Ver no CRM" com o número já preenchido.
444. Ctrl+K (ou ⌘K) abre e fecha, até com o cursor num campo; "/" também abre; Esc fecha e devolve o foco a quem estava; a rolagem da página trava só enquanto a caixa está aberta.
445. Setas movem a seleção, Enter abre na aba do app, Tab não escapa da caixa (foco preso), leitor de tela recebe `role=listbox/option` e `aria-activedescendant`.
446. Resposta atrasada é descartada (número de sequência): digitar rápido não mostra resultado de uma busca velha; debounce de 220 ms.
447. O trecho digitado fica destacado (`<mark>`), com o texto escapado (nome com `<img onerror>` aparece como texto — testado).
448. Busca vazia mostra as últimas 6 buscas e os atalhos "Ir para" só dos apps liberados.
449. Botão de busca no topo (em 375 px vira só a lupa) e botão "Buscar cliente" nas ações rápidas.

### "Agora" — painel de comando
450. O "Agora" vem de `r6_agora` (X3) mais `r6_c1_agora_extras` (leads sem dono, recusados, não lidas, orçamento de cada horário) em vez de três consultas separadas: Pátio, orçamentos, conversas, agenda de hoje e leads no mesmo instante.
451. 🔗 Carros no pátio com a etapa ao vivo, tempo parado na etapa (verde/laranja/vermelho pelo limite de cada etapa), extras esperando o cliente e previsão de entrega vencida; cada carro abre a OS na aba `indycar-patio`.
452. Chips por etapa (Diagnóstico 2 · Em execução 1 · Pronto 1…) e resumo "1 pronto para retirar · 1 com previsão vencida · 2 extras esperando aprovação".
453. 🔗 Orçamentos esperando resposta: valor, idade, selo "visto" quando o cliente abriu o link, aprovados sem horário e recusados da semana; abre o orçamento na aba `indycar-orcador`.
454. Conversas esperando o consultor: espera colorida (>30 min laranja, >2 h vermelho), prévia da mensagem e telefone formatado quando não há nome; as de mais de 7 dias entram só como número.
455. 🔗 Horários de hoje mostram a etapa do carro (🔧 Pronto) e o orçamento ligado ao horário (🧾 aprovado) em cada linha.
456. Horários de hoje com filtro Todos / Por vir / Na oficina e contagem de "sem confirmar" e "não veio".
457. Leads novos sem responsável (7 dias) e quantos chegaram hoje, com atalho para o CRM.
458. "Pede atenção agora": lista priorizada (pronto parado >4 h, previsão vencida, conversa >2 h, extras, aprovado sem horário, sem confirmar, lead sem dono) — cada item abre a tela certa.
459. 🔗 Ações rápidas por permissão: Novo horário, Nova entrada no pátio, Novo orçamento, Modo TV do pátio.
460. 🔗 Selo vivo nos atalhos de cada app (Atendimento 2, Pátio 5, Orçador 3, Agenda 4, CRM 3).
461. Tempo real: Pátio, extras, orçamentos, conversas e agendamentos (a tabela `agendamentos` entrou na publicação realtime) atualizam o painel com debounce de 0,7 s; relógio de reserva de 60 s.
462. Indicador "ao vivo · atualizado há N min" com ponto verde/laranja/vermelho e botão atualizar; recarrega ao voltar para a aba.
463. Sem internet aparece faixa clara e o painel mantém o último que carregou; volta sozinho quando a conexão volta.
464. Falha de um cartão não derruba os outros: mensagem + "tentar de novo".
465. Os tempos de etapa/espera andam sozinhos a cada minuto sem ir ao banco.

### Visões por papel e visão do dono
466. Visão do dono (admin/gestor): faturamento de hoje, da semana (com ▲/▼ sobre a semana passada), do mês e orçamentos aprovados (`r6_c1_painel_dono`, só gestor — o atendente recebe erro 42501, testado).
467. Gráfico de faturamento dos últimos 7 dias, acessível (aria-label com os valores) e sem `style=""` (a CSP da Casa não deixa; alturas pelo CSSOM).
468. Conversão de 30 dias: leads que agendaram/fecharam, quem veio e fechou, faltas e orçamentos aprovados.
469. 🔗 Gargalos ranqueados (carro parado além do limite da etapa, pronto >4 h, conversa >2 h, orçamento >24 h, lead sem dono, horário sem desfecho), cada um abre a tela do problema.
470. Aviso quando há fechamentos sem valor ("o faturamento está subestimado") com link para a Agenda.
471. Seletor Operação / Visão do dono lembrado por aparelho; gestor abre na visão do dono, atendente na operação.
472. Mecânico vê só "Meus carros no pátio" (os dele), sem modo de nova entrada; recepção (Franklin) vê o Pátio e o cartão "abra a Agenda para marcar presença".

### Sino unificado e tarefas
473. Sino com filtro por app (com contagem de não lidas de cada um), "só não lidas" e grupos Hoje / Ontem / Esta semana / Antes.
474. Marcar uma como lida (✓) e "Marcar todas" respeitando o filtro do app; se falhar, desfaz na tela.
475. Contagem no título da aba `(3) IndyCar Central`.
476. Aviso do navegador opcional (botão no sino) quando chega aviso novo com a Central em segundo plano.
477. Topo do sino repete as 3 coisas que mais pedem atenção.
478. Links de notificação: `javascript:`, `//outro.com` e domínio de fora caem na raiz do app (teste unitário).
479. Tarefas: prazo (hoje 17h30 / amanhã 9h / 7 dias) e "urgente" na hora de criar; depois das 17h30 "hoje" vira amanhã cedo para não nascer vencida.
480. Tarefas urgentes e vencidas primeiro, selo "N vencidas".
481. 🔗 Cada tarefa tem "abrir conversa / lead / horário / cliente" na aba do app de origem.
482. Concluir tarefa tem "Desfazer" por 6 s.

### Teclado, acessibilidade, servidor
483. Atalhos: `g` + `a/t/c/m/p/o` abre cada app na aba dele, `n` nova tarefa, `s` sino, `r` atualizar, `?` ajuda — nunca disparam digitando num campo.
484. Janela "Atalhos do teclado" (botão `?` no topo e tecla `?`).
485. "Pular para o conteúdo", foco visível e `aria-live` no indicador ao vivo.
486. Atalhos da grade de apps na ordem fixa Agenda → Atendimento → CRM → Comunicar → Pátio → Orçador, com o cargo do perfil no menu.
487. `/api/central/config` entrega os endereços do Pátio e do Orçador (variáveis `PATIO_URL`/`ORCADOR_URL`, só https, sem usuário/senha) — a Casa deixa de ter URL fixa.
488. `/casa/<arquivo inexistente>` responde 404 da Casa (antes caía na Agenda e devolvia a página dela no lugar do script).
489. COOP da Casa passou de `same-origin` para `same-origin-allow-popups` (necessário para reaproveitar abas nomeadas). Achado: Pátio e Orçador mandam `same-origin` no Netlify, então o navegador não reencontra a aba deles — pedido a P1/O2.
490. Service worker da Casa v3 guarda os novos módulos para abrir sem rede.
491. 16 testes novos das regras puras (`tests/casa-r6.test.mjs`) + roteiro puppeteer da Casa (`npm run qa:casa`, 42 conferências) com usuário de teste criado e apagado.

### Lote 2 — Casa recebe links de fora; Agenda ligada ao Orçador e ao Pátio
492. 🔗 `/?busca=<termo>` na Casa abre a busca global já preenchida (outros apps linkam assim) e limpa o endereço da barra.
493. O redirecionamento antigo `/?x` → `/agenda/` não engole mais a consulta `busca` (teste: `/?busca=` 200, `/?novo=1` 308).
494. 🔗 Agenda: cada horário mostra o selo do orçamento ligado (número, status, total, "visto") com "Abrir orçamento" na aba `indycar-orcador`, direto em `#/historico/<id>`.
495. 🔗 Ficha do horário: bloco "Orçamento" com Abrir (se existe) ou "Criar orçamento" levando cliente, telefone com 55 e nome.
496. 🔗 Início da Agenda: faixa "No pátio agora" com a etapa ao vivo de cada carro e quantos extras esperam o cliente.
497. 🔗 Clicar no carro da faixa abre a OS no Pátio na aba `indycar-patio` (Agenda segue na dela).
498. 🔗 Início da Agenda: faixa "Aprovados esperando horário" (orçamentos aprovados sem agendamento).
499. 🔗 "Marcar horário" no aprovado abre o novo horário já com nome, telefone e observação citando o orçamento.
500. Nova origem "Orçador" na lista de origens do agendamento.
501. 🔗 Salvar o horário ligado a um orçamento manda `orcamento_id`; o servidor liga o orçamento ao horário novo só se ele ainda não tinha horário.
502. `orcamento_id` que não é UUID é ignorado, e o campo nunca é gravado em `agendamentos`.
503. Orçador ou Pátio fora do ar não derrubam a Agenda: a rota responde 200 com aviso e lista vazia.
504. Recepção (papel `agenda`) leva 403 nas rotas de orçamento e de pátio; sem login, 401.
505. Nome de cliente vindo do orçamento entra como texto (HTML escapado) nas faixas e no formulário.
506. 🔗 `/agenda/?novo=1&tel=…` abre o NOVO horário com o cliente; o telefone sai da barra de endereço.
507. 🔗 `IndyCarApps.abrir(href)`: qualquer link do ecossistema abre em `window.open(url,'indycar-<app>')`.
508. 🔗 Clique em link de outro app dentro da Agenda é interceptado e vai para a aba nomeada dele.
509. 🔗 Recado da OS no Pátio abre pela mesma regra de aba nomeada.
510. Servidor: arquivo estático com extensão inexistente responde 404 (antes devolvia a página inicial com 200).
511. Service worker da Agenda v19 guarda `rodada6.js/css` para abrir sem rede.
512. `orcador.js` puro: endereço só https sem credencial, veículo jsonb → texto + placa, resumo, aprovado-para-agendar, escolha do orçamento aprovado entre vários (5 testes).
513. Realtime passou a incluir `agendamentos` (a Casa atualiza a agenda de hoje sozinha).
514. Roteiro puppeteer da Agenda (`scripts/qa-r6-agenda.mjs`, 16 conferências) e `/?busca=` coberto no da Casa (44).

### Lote 3 — Central e passadas de caça a bugs
515. Central: cada pedido ganha `X-Request-Id` (aceita o do proxy se for simples, senão cria um) para achar a linha no log do Render.
516. Central: pedido que demora mais de 3 s é registrado com método, caminho, status e o mesmo id.
517. 🔗 `/patio/…` e `/orcador/…` na Central redirecionam (302) para o app de verdade, mantendo caminho e consulta; `/patiozinho` não é pego.
518. Celular 375px: as faixas "No pátio agora" e "Aprovados esperando horário" não geram rolagem horizontal (conferido no puppeteer, 18 conferências da Agenda).
519. Caça a bugs (atacante): `ids` fora de UUID, `limite` absurdo e `orcamento_id` forjado são ignorados/limitados; a ligação só acontece se o orçamento ainda não tinha horário; recepção leva 403 — tudo coberto por teste.
520. `get_advisors` (segurança) depois das migrações `r6_c1_*`: nenhum aviso novo (as funções ficaram SECURITY INVOKER; sobram só os 3 avisos antigos do projeto).

## Como verifiquei (C1)
`npm test` (198 passando), `npm run check`, `node scripts/qa-r6-casa.mjs` (44), `qa-r6-agenda.mjs` (18), `qa-r6-rpc.mjs` (13): servidor local na porta 3055, usuário de teste criado e apagado, rotas novas simuladas por interceptação (nada gravado no banco real).

## Pendências (C1)
- Total honesto desta rodada: 520 − 436 = 85 itens verificados (≈30 com 🔗), abaixo da meta de 230/40. O que ficou para uma próxima rodada: mais conexões da Agenda (lembretes pelo Comunicar, encaixe/remarcar com horários livres), ping de Pátio/Orçador com aviso na Casa, ajustes finos de 375px na Casa.
- Pedido a P1/O2: `Cross-Origin-Opener-Policy: same-origin-allow-popups` no `netlify.toml` do Pátio e do Orçador, para a aba nomeada ser reaproveitada.
- Outros apps podem linkar `/?busca=<termo>` na Casa e `/agenda/?novo=1&tel=55…` para novo horário.
