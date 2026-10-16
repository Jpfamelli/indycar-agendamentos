# IndyCar Comunicar

Central de comunicação com o cliente da IndyCar Centro Automotivo (Taubaté).
Tudo sai pelo **WhatsApp da empresa**, o mesmo número do painel de Atendimento.

- **Réguas automáticas**: lembrete de horário, pós-venda ("ficou tudo certo?"),
  avaliação no Google, revisão por tipo de serviço, aniversário, orçamento
  parado, não fechou e reativação.
- **Campanhas** por segmento (todos, aniversariantes, atendidos há N dias, sem
  voltar há N meses, faltaram, fizeram um serviço) ou para um cliente só.
- **Opt-out**: quem responde PARAR sai da lista sozinho; dá para desligar no painel.
- **Satisfação** automática pela resposta do cliente ao pós-venda (+ registro manual).
- **Atribuição**: agendamento que vem depois de uma mensagem conta para a régua.

Node puro (sem dependências), HTML/CSS/JS puro, login Supabase igual ao CRM, à
Agenda e ao Atendimento. Porta **3500**.

## IA (rodada 2)

A IA trabalha nas mensagens, mas **nunca fala sozinha com o cliente**:

- **Escrever com IA** (réguas e campanha): 3 opções no tom da casa, validadas por
  código (variável desconhecida, palavra proibida, preço/prazo, tamanho) e com a
  prévia já trocada para um cliente de exemplo.
- **Leitura das respostas**: no carteiro, as neutras/negativas passam pelo haiku →
  quer agendar, quer orçamento, reclamou, dúvida, agradeceu. Quem pede gente vai
  para `aguardando_consultor` no Atendimento (sozinho em `autonomia=automatico`;
  com um clique em `confirmar`). Tudo em `ia_acoes` (origem `comunicar`).
- **"IA, quem devo chamar?"** na campanha e **resumo da semana** no Início (cache 6 h).
- Chave: `ANTHROPIC_API_KEY` ou `agenda_ia_config.api_key`; modelos de `ia_config`.
  Cliente injetável (`ia.js › definirClienteIA`) — os testes usam IA falsa.

## Equipe, acesso e segurança (rodada 3)

- **Quem entra**: admin sempre; gestor/atendente só com `comunicar` em `perfis.apps`;
  papel `agenda` nunca. Sem acesso → tela "Você não tem acesso a este app" com os
  apps que a pessoa pode usar (o servidor devolve 403 `sem_acesso` em toda rota).
- **Login** (`public/conta.js`): mostrar senha, Caps Lock, lembrar e-mail, espera
  progressiva depois de 5 erros, esqueci a senha (link por e-mail), troca
  obrigatória (`precisa_trocar_senha`), duas etapas (TOTP) e sair de todos os aparelhos.
- **Permissões** (`acesso.js › PERMISSOES`, uma regra para CADA rota em `ROTAS`):
  atendente vê tudo e manda avulsa para UM cliente; campanha para um grupo feita por
  atendente fica **aguardando aprovação** (`comunicar_campanhas`) e o gestor recebe o
  aviso no sino; réguas, teste, "rodar agora", CSV, importar, religar opt-out e apagar
  satisfação só gestor/admin; atendente cancela/reenvia só o que ele mandou.
- **Quem mandou**: `posvenda_envios.criado_por_id` (perfil) + `criado_por` (nome na tela).
- **Automações da equipe** (`automacoes.js`): resposta lida pela IA como quer agendar /
  quer orçamento / reclamação vira TAREFA para o dono da conversa (ou o gestor);
  reclamação avisa os gestores na hora; "não ficou bom" no pós-venda já vira tarefa +
  aviso pelo gatilho `comunicar_tarefa_da_resposta` (no banco); régua com 3 falhas em
  24 h avisa os gestores; resumo semanal para os gestores na segunda de manhã.
- **Servidor**: CSP com `frame-ancestors 'none'`, HSTS (no Render), nosniff,
  Referrer/Permissions-Policy, CORS só do ecossistema, JSON inválido = 400, corpo
  grande = 413, limite por IP (300/min) e por pessoa nas rotas caras (20/min; avulsa
  do atendente 30/h), erro 500 sem detalhe interno, auditoria (`registrar_auditoria`)
  de régua, pausa, campanha, teste, CSV, opt-out, importação, regras e satisfação.
- Migração `comunicar_aprovacao` (`scripts/sql/2026-10-13_comunicar_aprovacao.sql`).

## Confiabilidade, prontidão e prévia (rodada 4)

- **Render dormindo** (`public/acordar.js`): 502/503/504 sem JSON = servidor acordando.
  A tela mostra "O sistema está acordando… tentando de novo em N s" e tenta sozinha
  (2, 4, 8, 12, 20, 30… s, até ~3 min, uma sonda só no `/api/ping`); quando volta,
  avisa e segue. Gravação só é repetida quando o pedido nem chegou ao app.
  O service worker (`comunicar-v4.0.0`) abre a casca do cache com o servidor fora.
- **Carteiro tolerante** (`carteiro.js`): cada envio é reservado (`enviando_em`) antes
  do WhatsApp — dois carteiros nunca mandam a mesma mensagem; reserva presa > 15 min
  vira "falhou: confira antes de reenviar" (nunca reenvia sozinho); validade por régua
  (`expira_em`: lembrete até 1 h antes do horário, parabéns até o fim do dia seguinte…);
  o lembrete confere a Agenda na hora (cancelado → pula; remarcado → texto novo);
  aniversariantes de ontem recuperados se o servidor não rodou nenhuma vez ontem.
- **pg_cron**: `comunicar-carteiro` (5,20,35,50 min) chama `comunicar_carteiro_chamar('cron')`
  e o **reforço** `comunicar-carteiro-reforco` (2,7,12… min) chama de novo se a última
  rodada tem 17+ min. Cada chamada fica em `comunicar_carteiro_chamadas` (status do
  pg_net pela rpc `comunicar_chamadas_recentes`) e cada rodada em `comunicar_carteiro_batidas`.
  `/api/rodar?origem=` responde em até 25 s (rodada longa → 202 e continua).
- **Pronto para ligar** (`prontidao.js`, `GET /api/pronto`): 11 itens com o que fazer.
- **Próximos 30 dias** (`projecao.js`, `GET /api/projecao`): o que sairia por régua e
  por dia com tudo ligado (mesmas regras dos geradores) + alcance em cada régua.
- **Aniversários** (`aniversarios.js`): colar lista, CSV (até do Excel em ANSI) e
  procurar nas fichas/CRM/conversas; confere antes de gravar; lista inteira só gestor.
- **Equipe**: indicadores por pessoa (30 dias), "Pedir ao gestor" (sino), tour de
  boas-vindas por papel e ajuda "Como faço…" com busca. Rascunhos no aparelho.
- Migração `comunicar_rodada4` (`scripts/sql/2026-10-14_comunicar_rodada4.sql`).

## Carteiro à prova de falhas, saúde do WhatsApp e Central (rodada 5)

- **WhatsApp separado** (`whatsapp.js`, testado com um CodeWords de MENTIRA): cada erro vira
  uma CLASSE — `chave_recusada` ≠ `numero_invalido` ≠ `instabilidade` ≠ `desconectado` ≠
  `limite` ≠ `nao_entregue` — gravada em `posvenda_envios.erro_classe`. Estrutural para a
  rodada (todos falhariam igual); definitivo falha de vez; o resto tenta de novo com
  espera CRESCENTE (5, 15, 45 min; `MAX_TENTATIVAS=4`). `{"success":false}` não é entrega.
- **Cadência segura** (Réguas › Envio): limite por minuto (padrão 10), por hora (60) e
  por dia (300 — campanha maior é escalonada nos dias seguintes, na hora de envio),
  `intervalo_mesmo_cliente_min` (60: dois avisos para o mesmo cliente não saem em
  sequência; lembrete e Pátio não esperam) e "só horário da loja" (seg–sáb 8h–17h30).
  Fila ordenada por PRIORIDADE (`carteiro.js › PRIORIDADE`: pátio pronto › extra ›
  lembrete › … › campanha) para quando o CodeWords volta e a fila acumulou.
- **Saúde do WhatsApp** (Início, `GET /api/whatsapp/saude`): estado, motivo em português,
  o que fazer e o botão "Colar a chave no Atendimento" (`/?aba=integracoes`); falhas das
  24 h por classe; `POST /api/whatsapp/reconferir` (gestor) esquece a chave em cache.
  O carteiro grava o último estado em `posvenda_config.whatsapp_estado`.
- **Réguas**: `{link_os}` (acompanhar a ordem do Pátio do horário) e `{link_area}`
  (Área do Cliente, um link por cliente) — sem o link a mensagem NÃO sai (fica em
  "pulados" da prévia com o motivo); "ver como um cliente real" (`GET /api/previa/mensagem`);
  prioridade e janela de silêncio em cada cartão; relatório com período e por régua
  (`GET /api/relatorio?de&ate`, `GET /api/relatorio/reguas`: enviadas, responderam,
  agendaram depois, pediram para parar, falharam).
- **Campanhas**: segmentos salvos (`comunicar_segmentos`, `GET/POST/DELETE /api/segmentos/salvos`),
  prévia com quem fica de fora e por quê (`/api/segmentos/previa` → `pulados`, `recentes`),
  "Mandar para o meu celular" (`POST /api/envios/teste-meu`, telefone do perfil).
- **Conectar**: ficha com "Nos outros apps" (rpc `cliente_360` pelo telefone normalizado:
  conversa, lead, carro na oficina, orçamentos, tarefas, indicações), "Onde toca" em cada
  mensagem (`GET /api/envios/:id/ligacoes`), `GET /api/clientes/360?tel=`; buscas por
  `telefone_e164`. Links de todos os apps num lugar só: `public/apps.js` (tela e servidor).
- **Central (onda B2)**: `server.js` exporta `{ handler, iniciar, ligarCarteiro, VERSAO }`
  e só dá `listen` quando é o programa principal; aceita `req.prefixo` ou a variável
  `PREFIXO` (ex.: `/comunicar`) — `/api/config` devolve `prefixo`. Frontend, service
  worker e manifest são RELATIVOS (funcionam em `/` e em `/comunicar/`). Abra sempre
  com a barra final (`/comunicar/`). Migração `comunicar_rodada5`.

## Conectividade

- "Abrir conversa" → `indycar-atendimento.onrender.com/?tel=<telefone>`; a ficha tem
  links para Conversa, CRM e Agenda.
- O que o carteiro envia vira linha de saída no histórico da conversa
  (`whatsapp_mensagens`), só se a conversa já existe, uma vez por envio
  (`posvenda_envios.mensagem_id`).
- Régua espera 3 h se alguém está atendendo o cliente (esperando consultor ou
  mensagem sem resposta há menos de 2 h); feriado nacional segura as réguas de
  relacionamento; limite por hora; falha passageira tenta de novo (até 3 vezes).

## Rodar

```bash
npm start            # produção local (precisa de .env com SUPABASE_*)
npm run dev          # com --watch
npm run mock         # tela com dados de MENTIRA em http://localhost:3511 — sem login
npm run check        # node --check em tudo
npm test             # 126 testes (funções puras, IA falsa, carteiro, papéis, aprovação, automações, API, rodadas 4 e 5, CodeWords falso) — sem banco
npm run segredos     # nenhuma chave nos arquivos versionados nem no histórico
npm run navegador    # roteiro puppeteer da rodada 3 em 1440 e 375 px contra o mock (precisa do mock no ar)
npm run navegador4   # roteiro da rodada 4 (pronto, carteiro, 30 dias, aniversários, tour, acordando)
npm run navegador5   # roteiro da rodada 5 (saúde do WhatsApp, cadência, prévia real, relatório, segmentos, onde toca, ficha 360)
node scripts/conferir-banco.mjs [--ia] [--tudo]   # leituras no banco real (+ poucas chamadas reais de IA)
node scripts/conferir-rodada4.mjs                 # leituras da rodada 4 no banco real (nada é gravado)
```

Servidor real local **sem enviar nada**: `CARTEIRO_DESLIGADO=1` (sem timers, sem
rodada, "Rodar agora" só avisa). Ex. no PowerShell:
`$env:CARTEIRO_DESLIGADO='1'; $env:PORT='3510'; node server.js`.

Teste do ciclo no banco (auto-reverte): `scripts/sql/teste-ciclo-comunicar.sql`.

No modo `mock` (o porteiro é o `acesso.js` de verdade):
- `/?papel=admin|gestor|atendente|atendente2|agenda|desativado|sem_app|trocar_senha|mfa`
  troca a pessoa (código de duas etapas de teste: `123456`); `/?logado=0` abre o login
  (senha `errada` simula erro); `/?semente=1` volta os dados ao começo;
- `/?papel=atendente` mostra o modo atendente (réguas travadas, campanha vira pedido de aprovação);
- `/?saude=ok` esconde a faixa de saúde e marca o WhatsApp como conectado.
- rodada 4: `/?dormir=20` faz a API responder 503 em HTML por 20 s (o Render acordando);
  `/?pronto=tudo` deixa o checklist verde; `/?tour=0` não abre o tour de boas-vindas.

## Telas

| Tela | O que faz |
| --- | --- |
| Início | Fila, enviadas, respostas, agendaram pela mensagem, satisfação; situação do WhatsApp e do carteiro; por régua; próximas 48 h; aniversariantes; **Rodar agora** e **Prévia de hoje** |
| Réguas | Faixa **Envio** (hora, janela, domingo, intervalo mínimo, telefone de teste, pausa geral) + 8 cartões com interruptor, mensagem com chips de variáveis, parâmetro, prévia, "Quem receberia hoje" e "Mandar teste para mim". A régua Revisão traz os prazos por serviço |
| Mensagens | Fila e histórico com filtros por status/tipo/busca, resposta do cliente, selo "agendou depois", cancelar/reenviar |
| Campanhas | Nova campanha em 3 passos (para quem → mensagem → quando) e histórico agrupado por mensagem e dia |
| Clientes | Busca, aniversário, interruptor "aceita mensagens", ficha em gaveta (próxima revisão, mensagens, satisfação), importar planilha |
| Satisfação | Satisfeitos/insatisfeitos/nota média, origem (WhatsApp automático ou manual), registro manual |

## Arquivos

- `server.js` — HTTP, login (token → perfil → acesso → duas etapas), WhatsApp, carteiro, estáticos
- `rotas.js` — TODAS as rotas `/api/*` e o porteiro de cada uma (testado com dados falsos)
- `acesso.js` — papéis, permissões, regra de cada rota, limites, CORS, cabeçalhos (puro)
- `automacoes.js` — tarefas e avisos para a equipe, resumo semanal (relógio injetável)
- `public/conta.js` — login, senha, duas etapas, sem acesso, menu do perfil, sino e tarefas
- `dados.js` — réguas (geradores), segmentos, porteiro de consentimento, resumo, feriados, histórico no Atendimento, relatório, CSV
- `ia.js` — IA: escrever, ler respostas, sugerir público, resumo; validação das regras da casa
- `carteiro.js` — regras puras do envio tolerante (validade, reserva, lembrete, reforço, resumo 24 h, prioridade, cadência, limite diário)
- `whatsapp.js` — CodeWords: enviar/status com configuração injetada, classes de erro e o painel "Saúde do WhatsApp" (puro)
- `public/apps.js` — endereços e links dos apps do ecossistema (tela E servidor) · `public/rodada5.js` — telas da rodada 5
- `prontidao.js` · `projecao.js` · `aniversarios.js` — checklist, prévia do mês e leitura de aniversários (puros)
- `estaticos.js` — arquivos da tela em memória, br/gzip e ETag
- `public/acordar.js` — "o sistema está acordando" · `public/rodada4.js` — telas da rodada 4
- `supabase.js` — cliente REST mínimo do Supabase
- `public/` — a tela (index.html, app.js, styles.css, sw.js, manifest.json)
- `scripts/mock-server.mjs` — servidor falso para mexer na tela sem login
- `scripts/sql/` — migrações aplicadas no Supabase
- `MELHORIAS.md` — registro do que mudou e foi verificado

## Carteiro externo

O Render gratuito dorme. O `pg_cron` do Supabase (de 15 em 15 min + reforço de 5 em 5
quando a chamada falha) e o GitHub Actions chamam `POST /api/rodar?origem=…` com o
`RUNNER_TOKEN` para acordar o carteiro. Histórico das 24 h: Início › "carteiro rodou…".

**A URL que o pg_cron chama** fica em `posvenda_config.carteiro_url` — hoje
`https://indycar-posvenda.onrender.com/api/rodar` (jobs `comunicar-carteiro` e
`comunicar-carteiro-reforco` → funções `comunicar_carteiro_chamar`/`comunicar_carteiro_reforco`,
que leem a URL e o `runner_token` dessa linha). Quando o Comunicar passar a viver na Central
(`/comunicar/`), troque SÓ esse valor com um UPDATE (modelo pronto em
`scripts/sql/trocar-carteiro-url.sql`) e a URL fixa em `.github/workflows/carteiro.yml`;
o `RUNNER_TOKEN` do servidor da Central tem de ser o mesmo `runner_token`.
