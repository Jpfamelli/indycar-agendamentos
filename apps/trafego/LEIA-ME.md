# IndyCar · Central de Tráfego Pago

Dois módulos, um app só, porque os dois leem exatamente os mesmos números:

**Módulo 1 — Painel.** Meta Ads e Google Ads na mesma tela: investimento, CPA,
ROAS, CTR, CPM, ranking de campanhas e de criativos, ritmo do mês contra o
orçamento e o cruzamento com o CRM (conversão de plataforma × venda fechada).

**Módulo 2 — Radar.** Regras de alerta que rodam sozinhas e um relatório diário
no WhatsApp com um parágrafo de diagnóstico escrito pela IA.

Repositório: `Jpfamelli/indycar-ads` (privado). Porta local: **3400**.

---

## Como rodar

```bash
npm install
cp .env.exemplo .env      # e preencha (o .env nunca vai para o git)
node server.js            # http://localhost:3400
```

O login é o mesmo do painel de Atendimento (Supabase Auth). Quem entra:
**admin** sempre; **gestor** só se `ads` estiver em `perfis.apps`. Atendente e
agenda ficam fora mesmo com `ads` na lista, porque aqui aparece margem, verba e
faturamento. O servidor confere isso em toda rota (403 `sem_acesso`) — e, desde
a rodada 5, também pergunta ao banco **`usuario_pode('ads')` com o token da
própria pessoa**: se a função da casa disser não, ninguém entra (nem admin);
se não der para perguntar, vale a regra local. A tela só mostra "Você não
tem acesso a este app" com os links dos apps da pessoa.

Outros comandos:

```bash
npm test                  # 159 testes (node:test), sem banco, sem rede e sem gastar IA
npm run e2e:tela          # roteiro no Chrome (1440 e 375 px) contra o mock, com axe-core — 75 conferências
npm run mock              # tela sem login em http://localhost:3411 (dados inventados)
                          #   ?vazio=1 → estados vazios · ?saude=ok → vigia sem problema · ?chaves=1 → com chave real (sem faixa demo)
                          #   ?papel=admin|gestor|atendente|agenda|desativado|trocar|mfa · ?logado=0 → tela de login
                          #   ?acordando=N → as próximas N chamadas de /api voltam 503 (Render acordando)
                          #   (no mock: senha "errada" falha, código de duas etapas = 123456)
npm run segredos          # procura chave colada por engano nos arquivos do git
npm run auditar           # npm audit (alta/crítica)
```

## Login, perfil e acesso (padrão do ecossistema, rodada 3)

- **Entrar:** mostrar senha, aviso de Caps Lock, lembrar e-mail, frases claras
  (senha errada, usuário desativado, sem internet) e espera progressiva depois
  de 5 erros seguidos neste navegador (15 s, dobrando até 5 min).
- **Esqueci a senha:** manda o link pelo Supabase (`redirectTo` = este app). O
  plano gratuito manda poucos e-mails por hora; o admin também pode gerar senha
  temporária (aí `precisa_trocar_senha` obriga a pessoa a trocar no 1º acesso).
- **Duas etapas (TOTP):** Minha conta → Duas etapas → Ligar → QR code → código.
  Com fator verificado, o login pede o código e o servidor só aceita sessão `aal2`.
- **Menu da conta** (avatar no rodapé da lateral): Meu perfil, Minhas tarefas,
  Trocar senha, Duas etapas, Preferências de notificação, tema, Sair e Sair de
  todos os aparelhos.
- **Sino** (topo): notificações da pessoa (RLS), ao vivo. Alertas do radar e o
  resumo semanal chegam aqui; links de outros apps abrem no app de origem.
- **Último acesso:** gravado em `perfis.ultimo_acesso_em` / `ultimo_app='ads'`
  no máximo a cada 5 min.

## Servidor dormindo (rodada 4)

O Render gratuito dorme e, ao acordar, pode responder 502/503 ("hibernate-wake-error") por alguns minutos.

- `public/sw.js` guarda a casca do app no aparelho: a tela abre mesmo com o servidor dormindo.
- `public/rede.js` (testado): leitura (GET) repete sozinha em 502/503/504/rede com espera crescente (~3 min);
  gravação (POST) nunca repete. A faixa **"O sistema está acordando"** mostra a contagem e "Tentar agora";
  quando volta, aparece "O sistema acordou".
- `compressao.js`: JSON e arquivos de texto com gzip; estáticos na memória já comprimidos.
- Fontes em `public/fontes/` (CSP só 'self').

## Equipe e metas

- **Quem converte os leads de anúncio** (aba Resultados CRM): leads pagos do
  período por `leads.responsavel_id` — leads, agendaram, vieram, vendas,
  conversão, perdidos e receita. Só o nome da pessoa sai do servidor.
- **Metas do mês** (leads, agendamentos, vendas) ficam na tabela `metas`
  (`perfil_id` nulo = loja), visíveis para a equipe toda, com barra, ritmo e
  projeção. As metas antigas guardadas no navegador sobem para o banco sozinhas.

## Notificações automáticas

- **Alerta do radar → sino** de todos que podem abrir o Ads (admin e gestor com
  `ads`), além do registro em `ads_alertas`. "Testar agora" (simulação) não
  notifica ninguém. Chave `ads-alerta-<id>` evita repetir.
- **Resumo semanal de campanhas → sino**, segunda a partir das 8h (piloto
  automático ou `POST /api/cron/semanal?chave=…`). Chave `ads-semana-<segunda>`
  impede mandar duas vezes. Cada pessoa pode desligar em Preferências de
  notificação. **Não vai pelo WhatsApp** — o relatório diário segue desligado.

## Segurança do servidor

CSP completa (script só daqui; o cliente do Supabase sai do `node_modules` em
`/vendor/supabase.js`), HSTS, Permissions-Policy, COOP/CORP, CORS só para os
domínios do ecossistema (origem de fora = 403), limite de 300 chamadas/min por
IP e limite por pessoa nas rotas caras (IA, sync, testes de conexão, WhatsApp,
CSV → 429 com `Retry-After`), UUID validado, erro 5xx sem detalhe interno e
**auditoria** (`registrar_auditoria`, app `ads`) ao salvar credencial (só os
nomes dos campos), mudar Ajustes (telefones mascarados), criar/alterar/apagar
regra, exportar CSV, apagar demonstração, enviar relatório na mão, testar
WhatsApp, salvar meta e trocar senha.

---

## Modo sem chaves (demonstração) — rodada 5

Enquanto nenhuma chave real da Meta ou do Google estiver salva em
`integracoes_ads`, o app está em **modo sem chaves**:

- Ao subir com `ADS_DEMO=1`, sem chave e sem dado nenhum, o servidor **cria
  sozinho 45 dias de demonstração** (campanhas, conjuntos e criativos
  marcados como `demo`). A tela nunca abre vazia.
- A tela mostra uma **faixa "Modo demonstração"** (fechável por sessão) e o
  **selo "demo"** ao lado do título enquanto só houver dados fabricados. Todo
  estado vazio traz o botão "Criar dados de demonstração".
- **Leads, agendamentos e vendas continuam sendo os do CRM de verdade** — só
  o investimento é fabricado, por isso a aba Resultados avisa que os dois não
  se casam por campanha.
- O relatório diário avisa "números de DEMONSTRAÇÃO" no topo e **não vai por
  WhatsApp** (`ADS_DEMO_ENVIA=1` só para testar o caminho da fila).
- "Atualizar dados" explica que faltam as chaves e leva para Ajustes.
- **Ajustes → Conexões → "Onde pegar cada chave"**: guia de seis linhas (conta
  e token da Meta; ID do cliente, developer token, Client ID/secret e refresh
  token do Google). Colou e testou → a faixa some sozinha.

`Ajustes → Modo demonstração` continua com "Popular 45 dias" e "Limpar
demonstração" (apaga só o que é `demo`).

## Leads — do anúncio (ou do site e do WhatsApp) ao CRM — rodada 5

A aba **Leads** lista os leads criados no CRM no período (hoje, ontem, 7, 30
dias ou o período do topo) com canal (Meta, Google, site, WhatsApp, indicação,
orgânico, telefone), campanha (`utm_campaign`), status, agendamento, valor,
responsável e três botões por linha: **CRM** (`?lead=`), **WhatsApp**
(Atendimento `?tel=`) e **Agenda/Agendar**. Filtros por canal, status, "só
sem responsável" e busca por nome, telefone (4+ dígitos) ou campanha; os KPIs
do topo são clicáveis e aplicam o filtro; **Exportar CSV** respeita o filtro.

No **Painel**, o cartão **"Leads de hoje no CRM"** mostra quantos chegaram
por canal (chips clicáveis), quem está sem responsável e os últimos cinco com
link para o CRM. Na aba **Campanhas**, cada linha ganha as colunas do CRM
(**Leads CRM, Custo/lead, Vendas, Custo/venda, ROAS real**) casando a
`utm_campaign` com o nome da campanha — é o ciclo fechado anúncio → lead →
venda — e "ver os N lead(s)" abre a aba Leads já filtrada.

Rotas: `GET /api/leads?de&ate|dias&canal&status&q&pagos=1&sem_responsavel=1`,
`GET /api/leads/hoje`, `GET /api/leads.csv` (auditado). Nada de observações
nem orçamento detalhado sai por aqui; quem vê é admin/gestor com `ads`.

## Endereços dos apps num lugar só — rodada 5

`public/ecossistema.js` guarda os endereços de todos os apps (Agenda, CRM,
Atendimento, Comunicar, Ads, Orçador, Pátio, Site) e monta os links cruzados
(`linkLead`, `linkConversaTel`, `linkAgendamento`, `linkComunicarTel`…). O
servidor (`equipe.js`, `seguranca.js`/CORS, `leads.js`) e a tela (`app.js`,
`conta.js`, seletor "Ecossistema IndyCar", links `data-eco`) leem dali. Na
onda B2, quando os apps passarem a morar em `/crm/`, `/atendimento/` etc. no
domínio da Agenda, **troca-se só esse arquivo**.

## Busca global, atalhos e ajuda — rodada 5

- **Ctrl+K** (ou `/`): busca abas, ações, campanhas, criativos, regras, alertas,
  outros apps do ecossistema e **leads do CRM** (3 letras do nome ou 4 dígitos
  do telefone, últimos 90 dias). ↑↓ navega, Enter abre, Esc fecha.
- **Atalhos**: `1`–`8` abas, `r` atualizar, `t` tema, `n` nova regra,
  `e` exportar CSV da aba, `p` imprimir, `?` ajuda, `Esc` fecha. Nunca disparam
  dentro de campo de texto ou com janela aberta (regra pura em
  `public/busca.js`, testada).
- **Ajuda (?)**: lista de atalhos e "como faço…".
- A aba fica na URL (`?aba=leads`): recarregar ou mandar o link abre no mesmo
  lugar. O período do topo fica lembrado no navegador. O tema segue o do
  aparelho até a pessoa escolher. Impressão (`Ctrl+P`/`p`) sai sem menus.

---

## Resultados CRM — do anúncio à venda

A aba **Resultados CRM** cruza o investimento com o que o CRM registrou:
leads pagos (origem `meta`/`google` ou UTM paga) criados no período, quantos
agendaram (agendamento não cancelado do lead), quantos vieram, quantos
fecharam — e quanto custou cada um. A campanha é casada pela `utm_campaign`
(maiúsculas e acentos não importam).

- **Venda sem valor pago não é R$ 0.** Hoje (09/10/2026) todas as vendas pagas
  do CRM estão sem `valor_pago`: a tela mostra "sem valor lançado" e avisa.
  Lance o valor ao concluir o serviço no CRM para a receita e o ROAS real aparecerem.
- **Sem UTM, só dá para ver o canal.** Os leads atuais não têm `utm_campaign`;
  o guia da aba mostra o parâmetro exato para Meta e Google.
- Metas do mês (agendamentos e vendas) ficam guardadas no navegador.
- O radar ganhou dois alertas que olham o CRM: *campanha sem lead no CRM* e
  *custo por agendamento alto* (acima do CPA alvo).

## Leitura da semana (IA)

No Painel, **Pedir leitura** gera três frases sobre os 7 dias fechados (o que
aconteceu, por quê, o que fazer). Usa `ia_config.modelo_rapido`, respeita
`ia_config.ativo` e o limite diário, e grava cada leitura em `ia_acoes`
(origem `sistema`, tipo `ads_leitura_semana`). A IA só sugere: não pausa
campanha nem mexe em verba.

## Ligando Meta e Google de verdade

**Pela tela:** Ajustes → Conexões → "Ligar a Meta" / "Ligar o Google Ads": cada
guia mostra os passos com marca de feito ("2 de 4 passos"), o próximo passo e um botão que copia a
mensagem pedindo o que falta a quem cuida das contas (`public/guia-conexao.js`). *Testar sem salvar* confere o que foi colado sem gravar;
*Salvar* grava em `integracoes_ads` (campo vazio mantém o valor antigo). O erro
da plataforma vem traduzido com o que fazer.

As credenciais ficam na tabela `integracoes_ads` (a mesma que o CRM já usa). O
app nunca devolve token pela API: a tela só mostra se existe ou não.

**Meta Ads** — precisa de um app no [Meta for Developers](https://developers.facebook.com/)
com a permissão `ads_read`, e de um token de longa duração.
Preencha `meta_access_token` e `meta_ad_account_id` (o número da conta, com ou
sem o `act_`).

> Hoje a linha do Meta está com token de exemplo: o sync devolve
> `Meta API 400: Malformed access token (código 190)`. É esperado até você
> colar o token real.

**Google Ads** — precisa de um **developer token** (solicitado no painel do
Google Ads, aprovação leva alguns dias) e de um consentimento OAuth para gerar
o `refresh_token`. Preencha `google_developer_token`, `google_customer_id`,
`google_client_id`, `google_client_secret`, `google_refresh_token` e, se a
conta estiver sob uma gerenciadora (MCC), também `google_login_customer_id`.

> Ainda não existe linha de Google em `integracoes_ads` — crie uma com
> `canal = 'google'`.

Com as credenciais no lugar, **Ajustes → Testar conexões** valida sem gravar
nada, e **Atualizar dados** puxa os últimos 7 dias.

---

## Regras do radar

Já vêm sete regras prontas (CPA acima do teto, ROAS abaixo da meta, campanha
sem conversão, criativo saturado, CTR baixo, CPM disparado, gasto estourado).
Todas editáveis na aba Radar. A tela e o servidor validam a regra com o mesmo
contrato (`radar.validarRegra`): métrica e operador conhecidos, valor numérico,
janela de 1 a 90 dias, repetição de 1 a 720 horas, mínimos não negativos.

Três detalhes que evitam alarme falso — e que valem entender antes de mexer:

- **A janela termina ontem.** O dia corrente está incompleto; às 9h toda
  campanha tem "CPA altíssimo" porque já gastou e ainda não converteu.
- **Os mínimos (gasto / impressões / conversões)** filtram o que é estatística
  de menos. Sem eles, campanha de R$ 5 dispara "sem conversão" todo dia.
- **O cooldown** impede o mesmo aviso de repetir de hora em hora.

O botão **Testar agora** simula: mostra o que dispararia, ignora o cooldown, e
não grava nem envia nada.

---

## Relatório diário — a decisão de deixar desligado

Em **15/09/2026 o dono pediu para parar de mandar o relatório diário** (ao
Leonardo e ao número que recebia). Desde então ele está **desligado por
configuração**, não por código comentado:

- `ads_config.relatorio_ativo = false` e `ads_config.whatsapp_destinos = []`.
- O piloto automático (`agenda.decidirRelatorio`) só autoriza o envio quando
  **os três** valem ao mesmo tempo: `relatorio_ativo` é `true` de verdade,
  existe ao menos um número cadastrado e a hora configurada já chegou.
- Se a configuração não carregar (banco fora, timeout), o padrão é **não
  enviar nada** naquele ciclo — nem relatório, nem radar.
- Se o envio falhar (ex.: chave do CodeWords recusada), a próxima tentativa só
  acontece uma hora depois, para não gastar IA a cada 15 minutos.
- O botão **Enviar no WhatsApp** da aba Relatórios fica travado com o motivo
  escrito ao lado enquanto o envio estiver desligado ou sem número. A
  **prévia** continua funcionando.

A tela **Ajustes → Avisos no WhatsApp** mostra em três linhas o que está
valendo: *Relatório diário no WhatsApp: ligado/desligado*, *Alertas do radar:
ligado/desligado* e os números de destino (ou "sem destino — nada é enviado").

**Para religar:** em Ajustes, cadastre o(s) número(s) em "Números que
recebem", marque "Enviar relatório diário", escolha a hora e salve. Nada mais
precisa ser mexido. Para desligar de novo, desmarque e salve.

O relatório traz ontem, últimos 7 dias, melhor e pior campanha, ritmo do mês,
o que o CRM registrou e os alertas recentes — fechando com a *leitura do dia*,
escrita pela IA a partir dos números crus. Sem `ANTHROPIC_API_KEY` o relatório
sai igual, só sem esse último parágrafo. Se a IA falhar, o relatório vai assim
mesmo e o erro fica registrado em `ads_relatorios.erro`.

---

## WhatsApp — pela fila do Comunicar (rodada 5)

**O Ads não fala mais com o CodeWords nem com a Cloud API.** Relatório diário,
alertas do radar e o teste de canal entram na fila do Comunicar
(`posvenda_envios`, `criado_por = 'ads'`, `tipo = 'avulsa'`, `status =
'pendente'`) e o carteiro do Comunicar — acordado pelo pg_cron a cada 15 min,
8h–21h — entrega pelo aparelho da oficina, com tentativas, histórico e o
opt-out (PARAR) de sempre. `fila.js` é o único lugar que grava lá.

- `chave_unica` impede repetir: `ads:relatorio:<data>:<telefone>`,
  `ads:radar:<primeiro alerta da rodada>:<telefone>`, `ads:teste:<hora>:<tel>`.
  Duplicata (23505) devolve `duplicada: true`, não erro.
- "ok" nas respostas de `/api/relatorio`, `/api/radar` e `/api/whatsapp/testar`
  quer dizer **entrou na fila**; `ads_relatorios.enviado_em` e
  `ads_alertas.enviado_em` marcam a entrada na fila.
- Texto cortado em 3.900 caracteres e passado pelo **vocabulário da casa**
  (`vocabulario.js`: nada de prezado/efetuar/comparecer/veículo; o relatório
  fecha com "Quem conhece, Indyca! 🏎").
- **Ajustes → Canal de envio** mostra o estado do WhatsApp da oficina (pelo
  `vigia_estado`, sem bater no CodeWords), quantas mensagens deste painel
  estão na fila/enviadas/falharam, a última entrega e a última falha, e
  "Últimas mensagens que este painel pôs na fila". `GET /api/fila` lista.
- Problema no canal (`codewords-fora`, `whatsapp-desconectado`) não perde
  nada: a fila guarda e o Comunicar entrega quando voltar.

---

## Saúde do ecossistema

- `GET /api/ping` — público, devolve só `{ "ok": true }`. É o que o vigia e o
  Render usam para saber se o app está de pé.
- `GET /api/saude` — exige login. Lê `vigia_estado` (problema, desde,
  checado_em, resumo) e devolve junto o estado do piloto automático.
- **Faixa no topo da tela**: aparece, discreta, quando o vigia registrou um
  problema (`codewords-fora`, `whatsapp-desconectado`, `atendimento-fora`…),
  em português de gente, com "desde" e "conferido". Some sozinha quando o
  problema é resolvido.
- **Seletor "Ecossistema IndyCar"** na barra lateral: Agenda · CRM ·
  Atendimento · Comunicar · Tráfego pago (aqui) · Orçador · Site.

---

## Piloto automático

Com `ADS_AUTOMATICO=1` o servidor acorda a cada 15 minutos e decide o que fazer:
sync de hora em hora, radar no intervalo configurado, relatório uma vez por dia
(se a configuração mandar — veja acima).

Se hospedar em serviço que dorme (Render free), deixe `ADS_AUTOMATICO=0` e
chame por fora, com `ADS_CRON_TOKEN` preenchido:

```
POST /api/cron/sync?chave=SEU_TOKEN        de hora em hora
POST /api/cron/radar?chave=SEU_TOKEN       de hora em hora
POST /api/cron/relatorio?chave=SEU_TOKEN   uma vez por dia, às 8h
```

As rotas de cron obedecem à mesma configuração: com o relatório desligado,
`/api/cron/relatorio` gera e grava, mas não envia.

---

## Publicar (Render)

O `render.yaml` descreve o serviço: Node, plano free, `npm install`,
`node server.js`, health check em `/api/ping`, `ADS_AUTOMATICO=0`,
`ADS_DEMO=1`. Variáveis que precisam ser coladas no painel do Render:
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`ANTHROPIC_API_KEY` (opcional). `ADS_CRON_TOKEN` é gerado pelo Render — use o
valor nas rotas de cron de um agendador externo (cron-job.org, por exemplo).

No plano free o serviço dorme e **o piloto automático não roda**: sem o
agendador externo, nada é sincronizado nem avaliado. **Esta rodada (09/10/2026)
deixou tudo pronto no GitHub e não publicou no Render** — sem token de Meta e
Google o app roda em modo demonstração.

---

## Rotas da API (todas em JSON)

| Rota | Login | O que faz |
|---|---|---|
| `GET /api/ping` | não | `{ok:true}` para o vigia |
| `GET /api/config-publica` | não | URL e chave pública do Supabase (tela de login) |
| `POST /api/cron/{sync,radar,relatorio}?chave=` | token | rotinas do piloto por agendador externo |
| `GET /api/saude` | sim | vigia + piloto automático |
| `GET /api/painel` · `/api/ranking` · `/api/historico` · `/api/mes` | sim | módulo 1 |
| `GET/POST /api/config` | sim | metas, destinos, relatório e radar (validados) |
| `GET/POST/DELETE /api/regras` · `GET /api/alertas` · `POST /api/alertas/lidos` · `POST /api/radar` | sim | módulo 2 |
| `GET /api/relatorios` · `POST /api/relatorio` | sim | histórico, prévia e envio |
| `GET /api/whatsapp/status` · `POST /api/whatsapp/testar` · `GET /api/fila` | sim | canal de envio (fila do Comunicar) e o que o Ads pôs nela |
| `GET /api/leads` · `/api/leads/hoje` · `/api/leads.csv` | sim | leads do CRM por período/canal/status/busca, com links cruzados (rodada 5) |
| `GET /api/alertas.csv` · `POST /api/regras/ativa` | sim | CSV dos alertas; liga/desliga regra sem abrir o modal |
| `GET /api/integracoes` · `POST /api/sync` · `POST /api/testar-conexoes` · `POST /api/demo` | sim | conexões e demonstração |
| `POST /api/integracoes/testar` · `POST /api/integracoes` | sim | testar (sem gravar) e salvar credencial colada na tela |
| `GET /api/resultados` · `GET /api/resultados.csv` | sim | Resultados CRM (funil, custos, comparação) e CSV |
| `GET /api/ranking.csv?nivel=campanha\|anuncio` | sim | CSV de campanhas/criativos |
| `POST /api/ia/leitura` · `GET /api/ia/leituras` | sim | leitura da semana com IA (registrada em `ia_acoes`) |
| `GET/POST /api/eu` · `POST /api/eu/senha-trocada` | sim (sem exigir acesso ao app) | perfil, preferências e fim da troca obrigatória |
| `GET/POST /api/metas?mes=AAAA-MM` | sim | metas da loja (tabela `metas`) e progresso do mês |
| `POST /api/semanal` · `POST /api/cron/semanal?chave=` | sim / token | resumo semanal no sino (manual: só para quem pediu) |

Códigos de 401/403 que a tela entende (`codigo`): `login`, `sessao_vencida`,
`desativado`, `sem_perfil`, `sem_acesso` (com `apps`), `trocar_senha`, `mfa`.
429 = limite atingido (`Retry-After`).

Erros vêm sempre como `{ "erro": "…" }` com o status certo: 400 (corpo ou
campo inválido), 401 (sem login), 403 (perfil sem acesso), 404, 405 (método;
cabeçalho `Allow`), 413 (corpo acima de 1 MB), 500. Cada chamada de API é
logada com método, rota, status e duração.

---

## Arquivos

| Arquivo | O que faz |
|---|---|
| `server.js` | API (tabela de rotas), arquivos estáticos, parada educada |
| `db.js` | acesso ao Supabase (service_role), cache leve da config |
| `metricas.js` | CPA, ROAS, CTR e afins — um lugar só |
| `meta.js` / `google.js` | coletores das duas plataformas |
| `coletor.js` | orquestra o sync e gera a demonstração |
| `painel.js` | agregações que a tela consome (módulo 1) |
| `radar.js` | motor de regras (`avaliarRegra`) e validação (`validarRegra`) |
| `relatorio.js` | relatório diário + IA |
| `atribuicao.js` | coorte do CRM por canal/campanha, funil, avisos e CSV (função pura) |
| `resultados.js` | lê leads, agendamentos e conversas e monta a aba Resultados CRM |
| `conexoes.js` | testar/salvar credenciais e traduzir o erro da Meta/Google |
| `leitura.js` | leitura da semana com IA (`ia_config.modelo_rapido`, log em `ia_acoes`) |
| `whatsapp.js` | envio = entrar na fila do Comunicar; situação do canal (vigia + fila) |
| `fila.js` | grava em `posvenda_envios` (criado_por `ads`) com chave única; situação da fila |
| `leads.js` | leads do CRM com canal, campanha, agendamento, responsável e links cruzados; CSV |
| `vocabulario.js` | palavras proibidas → vocabulário da casa; slogan |
| `public/ecossistema.js` | endereços dos apps e links cruzados (servidor e tela) |
| `public/busca.js` | regras puras da busca global e dos atalhos |
| `public/operacao.js` | aba Leads, cartão "leads de hoje", busca Ctrl+K, atalhos, ajuda |
| `agenda.js` | piloto automático e a decisão do relatório diário |
| `auth.js` | porteiro (Supabase Auth): perfil, desativado, nível da sessão (MFA) |
| `equipe.js` | regra de acesso, perfil, último acesso, auditoria, notificações e metas |
| `seguranca.js` | cabeçalhos, CORS, limites e erro sem detalhe interno |
| `semanal.js` | resumo semanal das campanhas para o sino |
| `public/conta.js` | login, esqueci a senha, troca obrigatória, duas etapas, menu do perfil, sino e tarefas |
| `scripts/segredos.mjs` | `npm run segredos` |
| `tests/` | `npm test` — métricas, radar (+ alertas do CRM), whatsapp, agenda, servidor, atribuição, conexões, leitura |
| `scripts/mock-server.mjs` | tela sem login para mexer no visual |
| `MELHORIAS.md` | o que mudou em cada rodada |

Tabelas no banco: `ads_metricas_dia`, `ads_config`, `ads_regras`,
`ads_alertas`, `ads_relatorios` (todas com RLS ligado e sem política de
leitura — só o servidor enxerga). Leitura compartilhada: `vigia_estado`,
`agenda_ia_config`, `codewords_config`, `whatsapp_config`, `integracoes_ads`,
`leads`, `perfis`.
