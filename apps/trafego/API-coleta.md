# API da coleta e da devolução de vendas (rodada 8, frente T6)

Código: `meta.js`, `google.js`, `coletor.js`, `conexoes.js`, `devolucao.js`, `rotas/coleta.js`.
Testes: `tests/r8-coleta-plataformas.test.js`, `tests/r8-coleta-coletor.test.js`, `tests/r8-devolucao.test.js`
(contra a Meta e o Google de mentira de `scripts/mock-server.mjs`; sem rede e sem banco).
O app só **lê** das plataformas. Nenhuma rota daqui envia dado a Meta ou Google.

## Versões e acesso (conferidos na documentação oficial em 19/11/2026)
| | Em uso | Se recusar | Onde conferir |
|---|---|---|---|
| Meta Marketing API | `v27.0` | cai para `v26.0`, depois `v25.0` (código 2635 ou "unknown version") | developers.facebook.com/docs/marketing-api/overview/versioning |
| Google Ads API | `v26` | cai para `v25`, depois `v24` (404/501) | developers.google.com/google-ads/api/docs/sunset-dates |

- Google: **sem developer token** desde 09/09/2026 (o cabeçalho não é mais enviado; o salvo é ignorado). Entra por
  **conta de serviço** (e-mail em `google_client_id`, chave privada em `google_client_secret`) ou pelo OAuth antigo
  (`google_client_id`, `google_client_secret`, `google_refresh_token`). `google.temAcesso(linha)` diz se a linha basta.
- Meta: token no cabeçalho `Authorization` (nunca na URL), `appsecret_proof` quando o servidor tem `META_APP_SECRET`,
  novas tentativas com espera de 2 s e 8 s nos códigos 1, 2, 4, 17, 32, 341, 613 e 80000 a 80014, pausa de 5 s
  (uso ≥ 75%) ou 60 s (uso ≥ 95%) lida nos cabeçalhos `X-Ad-Account-Usage`, `X-Business-Use-Case-Usage`,
  `X-FB-Ads-Insights-Throttle` e `X-App-Usage`.

### Variáveis de ambiente (todas opcionais)
| Variável | Para quê |
|---|---|
| `META_APP_SECRET` | segredo do app da Meta dono do token: liga o `appsecret_proof` |
| `META_API_VERSION`, `GOOGLE_ADS_API_VERSION` | força uma versão na frente da lista |
| `META_GRAPH_URL`, `GOOGLE_ADS_API_URL`, `GOOGLE_OAUTH_TOKEN_URL` | só para teste: apontar para `npm run mock` (`http://localhost:3411/meta`, `/google`, `/oauth/token`) |

## O que a coleta grava
`ads_metricas_dia`, chave única `(plataforma, data, nivel, entidade_ext)`, níveis `campanha`, `conjunto`, `anuncio`:
- `status`: código da plataforma (`ACTIVE`, `PAUSED`, `ENABLED`…; rótulos em `meta.SITUACOES` e `google.SITUACOES`).
  Na Meta vem do catálogo; se o catálogo falhar, a coluna não é enviada (o valor anterior fica).
- `objetivo`: Meta `objective` (`OUTCOME_ENGAGEMENT`…), Google `advertising_channel_type` (`SEARCH`…); rótulos em
  `meta.OBJETIVOS` e `google.OBJETIVOS`.
- `conversas`: Meta, `onsite_conversion.messaging_conversation_started_7d` ("conversas iniciadas"). Google: nulo.
- `conversoes`: Meta, por grupo vale o maior (conversa iniciada × total de conexões; lead; compra) e os grupos se somam.
- `miniatura_url`: Meta, `creative.thumbnail_url` (endereço do fbcdn, que vence). A tela **não** usa esse endereço:
  usa `coletor.enderecoMiniatura(plataforma, anuncio_ext)` = `api/coleta/miniatura/<plataforma>/<anuncio_ext>`.
- Sem as colunas novas no banco (antes da migração `r8_trafego_v1`), grava sem `objetivo`, `miniatura_url` e
  `conversas` e avisa em `ultimo_sync_status`.

`ads_termos_dia` (Google): uma linha por palavra-chave (`termo` nulo) e uma por termo de busca, por dia, campanha e
grupo, somadas pela chave única. Sem a tabela, a coleta segue e avisa.

`integracoes_ads`: `ultimo_sync_em` (sempre), `ultimo_sync_status` (`ok — 64 linhas · 6 termos` ou
`erro — Meta API 400: … (código 190)`, sem segredo) e, na Meta, `meta_token_expira_em` lido do `debug_token`
(nulo = não vence). A demonstração (`fonte = 'demo'`) é apagada quando a primeira coleta real grava alguma linha.

## Rotas com login (acesso `ads`)

### `POST /api/coleta/agora`
Corpo opcional `{ "dias": 7 }` (1 a 30). No máximo **1 a cada 2 minutos para o app inteiro**: depois disso, `429`
com `Retry-After` e `{ "erro": "A coleta acabou de rodar. Espere 87 segundos para pedir de novo.", "codigo": "coleta_recente", "esperar": 87 }`.
Se uma coleta já está rodando, espera por ela e devolve `ja_estava_rodando: true`. Fica na auditoria (`ads_coleta_agora`).
```json
{ "de": "2026-11-12", "ate": "2026-11-19", "inicio": "2026-11-19T13:00:00.000Z", "fim": "2026-11-19T13:00:04.210Z", "ms": 4210,
  "origem": "pessoa", "ja_estava_rodando": false, "demo_removida": true,
  "plataformas": {
    "meta":   { "ok": false, "titulo": "Token da Meta inválido ou vencido", "fazer": "Gere um token novo de usuário do sistema…", "detalhe": "Meta API 400: Error validating access token: Session has expired… (código 190)", "ms": 310 },
    "google": { "ok": true, "linhas": 24, "termos": 6, "ms": 900, "versao": "v26", "avisos": [] } },
  "erros": [ "meta: Meta API 400: Error validating access token: Session has expired… (código 190)" ] }
```

### `GET /api/coleta/situacao`
```json
{ "rodando": false, "erro": null,
  "ultima": { …mesmo formato de /api/coleta/agora… },
  "contas": [ { "canal": "meta", "ativo": true, "tem_acesso": true, "acesso": "token", "ultimo_sync_em": "2026-11-19T13:00:04Z",
                "ultimo_sync_status": "erro — Meta API 400: … (código 190)", "ok": false,
                "aviso": { "titulo": "Token da Meta inválido ou vencido", "fazer": "…" }, "token_expira_em": null },
              { "canal": "google", "ativo": true, "tem_acesso": true, "acesso": "conta_servico", "ok": true, "aviso": null, … } ] }
```
`acesso` do Google: `conta_servico`, `oauth` ou `null` (falta coisa). `tem_acesso` **não** exige mais o developer token.

### `POST /api/coleta/testar`
- `{}` testa os acessos salvos das duas plataformas; `{ "canal": "meta" | "google", …campos colados }` testa o colado por
  cima do salvo, **sem gravar**. Até 20 testes em 10 minutos por pessoa.
- Campos aceitos: os de `/api/integracoes` e, no Google, `google_conta_servico` (o texto do arquivo JSON da conta de serviço).
```json
{ "resultados": [ { "canal": "meta", "ok": true, "titulo": "Conexão funcionando", "fazer": "Conta: Oficina IndyCar · BRL. Pode salvar.",
    "nome": "Oficina IndyCar", "moeda": "BRL", "versao": "v27.0", "expira_em": "2026-11-24", "acesso": null, "ms": 420,
    "avisos": [ "Este acesso vence em 24/11/2026. Para não vencer, gere um token de usuário do sistema com validade \"Nunca\"." ] } ] }
```
Falha: `{ "canal", "ok": false, "titulo", "fazer", "erro": "<mensagem técnica sem segredo>", "ms" }`. Token sem `ads_read`
dá `ok: false` mesmo com a conta respondendo.

### `GET /api/devolucao/google.csv?formato=central|legado&acao=Venda%20na%20oficina`
Vendas fechadas (com valor, regra da Jornada) dos últimos 90 dias que têm `gclid`, `gbraid` ou `wbraid`, vendidas depois
do clique e com clique de até 90 dias. Baixa `vendas-google-central-AAAA-MM-DD.csv`. Fica na auditoria (`ads_exportou_csv`).
- `central` (padrão, Central de dados do Google Ads): 
  `GCLID,GBRAID,WBRAID,Conversion action,Conversion date and time,Conversion value,Currency,Order ID` e linhas como
  `EAIa…,,,Venda na oficina,2026-11-18T14:35:00-03:00,850.00,BRL,<id do contato>` (um identificador por linha).
- `legado` (Metas › Conversões › Uploads): `Parameters:TimeZone=America/Sao_Paulo`, depois
  `Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Order ID` (só `gclid`).
- O número do pedido é o id do contato: reenviar não duplica.
- Banco sem as colunas de clique: `409 { "erro": "O banco ainda não guarda os identificadores de clique (falta aplicar a atualização do banco).", "codigo": "banco_sem_colunas" }`.

### `GET /api/devolucao/meta`
Vendas dos últimos 30 dias de contatos de anúncio da Meta, para marcar no WhatsApp Business.
```json
{ "pronto": true, "no_prazo": 1, "como": "No app WhatsApp Business: Ferramentas › Atividade de clientes…",
  "itens": [ { "lead_id": "…", "nome": "Paula", "telefone_final": "0001", "valor": 850, "vendido_em": "2026-11-18T14:35:00-03:00",
               "contato_em": "2026-11-15T09:58:00-03:00", "anuncio_ext": "1202…", "anuncio_nome": "Troca de óleo", "campanha_nome": "…",
               "veio_do_anuncio_certo": true, "dias_desde_o_contato": 4, "no_prazo": true, "lista": "Pedido concluído",
               "fazer": "No WhatsApp Business, abra a conversa de Paula (final 0001) e ponha na lista \"Pedido concluído\" (ou \"Pago\")." } ] }
```
O identificador do clique não sai na lista. Banco sem as colunas novas: `{ "pronto": false, "motivo": "…", "itens": [], "no_prazo": 0 }`.

## Rotas públicas

### `GET|POST /api/cron/cliques?chave=<ADS_CRON_TOKEN>`
Para cada contato dos últimos 90 dias com `gclid` e sem campanha (e sem plataforma marcada diferente de Google), pergunta
ao Google o `click_view` do dia do clique (do registro do site em `trafego_rastreio`; senão o dia em que o contato chegou),
um dia por consulta, no máximo 30 dias por rodada, e **preenche só o que está vazio**: campanha, grupo, anúncio,
palavra-chave, `origem_paga = true`, `origem_plataforma = 'google'`, `origem = 'google'` (se era `whatsapp`/`organico`) e
`rastreio.click_view`. Sugestão de agenda: uma vez por dia, depois da coleta.
```json
{ "ok": true, "procurados": 4, "dias_consultados": 3, "ligados": 3, "sem_clique": 1, "erros": [], "ms": 1830 }
```
Sem Google ligado: `{ "ok": false, "motivo": "O Google Ads ainda não está ligado.", … }`. Banco sem as colunas:
`{ "ok": true, "pulado": true, "motivo": "O banco ainda não guarda o gclid do contato…" }`. Chave errada: `401`.

### `GET /api/coleta/miniatura/<meta|google>/<anuncio_ext>`
A imagem do anúncio servida pelo próprio app (a tela fica com `img-src 'self'`). Só serve o endereço gravado pela coleta
para aquele anúncio, se for `https` de `*.fbcdn.net`, `*.facebook.com`, `*.cdninstagram.com`, `*.googleusercontent.com`,
`*.ytimg.com` ou `*.gstatic.com`, sem redirecionamento, só `image/jpeg|png|webp|gif` e até 1 MB. Guarda 6 h na memória
(até 300 imagens). `Cache-Control: private, max-age=21600`. Qualquer falha (endereço vencido, fora da lista): `404`.

## Rotas antigas que continuam (server.js)
`GET/POST /api/integracoes`, `POST /api/integracoes/testar` (agora com `versao`, `expira_em`, `avisos` e conta de serviço),
`POST /api/sync` (`{ dias }` até 90), `POST /api/testar-conexoes`, `GET /api/cron/sync?chave=`: todas passam por este coletor.
