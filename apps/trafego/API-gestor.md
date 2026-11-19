# Gestor IA e diário de decisões (rodada 8, frente T5b)

O Gestor IA é o "engenheiro no rádio" de dentro do app: lê tudo pela mesma porta das ferramentas da IA
(`ia/ferramentas.js`, frente T5a), fala curto com o dono e **propõe**. Quem decide é uma pessoa logada, na tela;
quem mexe no gerenciador de anúncios é a pessoa. Nenhuma ferramenta do modelo decide, marca como feita ou muda status.

Todas as rotas abaixo são relativas à base do app (na Central: `/trafego`). As logadas passam pelo login e pelo acesso
`ads` de sempre; as de rotina (`/api/cron/*`) pedem `?chave=` (a mesma do cron antigo).
Erro antes de qualquer resposta: JSON `{ erro: "frase para gente", codigo }` com o status certo.

## 1. Conversa

### `POST /api/gestor/perguntar` (resposta em fluxo)
Corpo: `{ "pergunta": "texto (1 a 2000 letras)", "conversa_id": "uuid (opcional, continua uma conversa)", "dado_pessoal": false }`
- `dado_pessoal: true` só vale para administrador (senão 403 `so_admin`): libera, só nesta pergunta, a ferramenta
  `conversa` (mensagens do WhatsApp de um contato) e o nome e o telefone completos. Fica na auditoria
  (`trafego_gestor_dado_pessoal`). Sem isso o Gestor roda **sem** dado pessoal (nome curto, telefone só o final).

Erros antes do fluxo (JSON):

| Status | `codigo` | Quando |
|---|---|---|
| 422 | `pergunta` | pergunta vazia ou com mais de 2000 letras |
| 422 | `conversa_id` | `conversa_id` fora do formato uuid |
| 404 | `conversa` | a conversa não existe ou é de outra pessoa |
| 403 | `so_admin` | `dado_pessoal: true` sem ser administrador |
| 429 | `limite_hora` | 30 perguntas por hora por pessoa (perguntas e planos pedidos na tela); `Retry-After` em segundos |
| 429 | `limite_dia` | `ia_config.limite_chamadas_dia` atingido (conta as chamadas do Gestor ao modelo no dia) |
| 503 | `sem_chave` | servidor sem `ANTHROPIC_API_KEY` (o resto do app segue funcionando) |
| 503 | `ia_desligada` | `ia_config.ativo = false` |
| 503 | `sem_migracao` | `conversa_id` mandado, mas o banco ainda não tem `trafego_ia_conversas` |

Resposta `200`, `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-store`. Cada evento é um bloco
`event: <tipo>` + `data: <json numa linha>` + linha em branco. Linhas que começam com `:` só mantêm a conexão viva
(ignore). Os tipos:

| Evento | `data` | Quando |
|---|---|---|
| `ferramenta` | `{ "nome": "campanhas", "rotulo": "Olhando as campanhas" }` | o Gestor começou a consultar uma ferramenta (pode vir várias vezes) |
| `texto` | `{ "texto": "pedaço da resposta" }` | pedaço da resposta; junte na ordem. Formatação possível: parágrafo (linha em branco), lista (`- ` no começo da linha), negrito (`**assim**`). Nada mais (sem título, sem tabela, sem link) |
| `proposta` | `{ "proposta": <ação do diário, formato do §3> }` | o Gestor registrou uma proposta (status `proposta`); no máximo duas por resposta |
| `fim` | `{ "conversa_id": "uuid", "uso": { "entrada", "saida", "cache_lido", "cache_criado", "chamadas", "ferramentas" }, "modelo": "claude-opus-5-5", "parou": "fim", "aviso": null }` | terminou bem. **Último evento.** `conversa_id` vem `null` (e `aviso` diz por quê) quando o banco ainda não tem a tabela das conversas |
| `erro` | `{ "erro": "frase para gente", "codigo": "tempo", "conversa_id": "uuid" }` | parou no meio. **Último evento** (não vem `fim` depois). O que já chegou continua valendo e fica guardado na conversa |

- `rotulo` da ferramenta: `saude` "Conferindo o que está ligado" · `resumo_do_periodo` "Lendo o resumo do período" ·
  `funil_por_origem` "Olhando o caminho dos contatos" · `campanhas` "Olhando as campanhas" · `palavras_e_termos` "Olhando as palavras de busca" ·
  `contatos` "Olhando os contatos" · `contato` "Abrindo um contato" · `conversa` "Lendo uma conversa" ·
  `motivos_de_nao_fechar` "Vendo por que não fecharam" · `agenda` "Olhando a agenda" · `horarios` "Olhando os horários" ·
  `metas` "Conferindo as metas" · `diario_de_decisoes` "Relendo as decisões anteriores" · `proposta_criar` "Escrevendo uma sugestão".
- `parou` no `fim`: `fim` (respondeu), `voltas` (chegou ao máximo de 8 idas ao modelo e respondeu com o que tinha),
  `max_tokens` (a resposta foi cortada no tamanho máximo).
- `codigo` do `erro`: `tempo` (passou de 90 s), `modelo` (a IA não respondeu), `modelo_ocupado` (a IA está sobrecarregada:
  tente em instantes), `recusa` (a IA se recusou a responder esta pergunta), `interno` (erro nosso).
- Parar no meio: é só fechar a conexão (abortar o `fetch`). O servidor para de chamar o modelo e guarda o que já tinha saído.
- Exemplo (sem conta de anúncio ligada):

```
event: ferramenta
data: {"nome":"saude","rotulo":"Conferindo o que está ligado"}

event: ferramenta
data: {"nome":"funil_por_origem","rotulo":"Olhando o caminho dos contatos"}

event: texto
data: {"texto":"Sem conta de anúncio ligada não dá para dizer quanto custou cada contato. O que dá para ver:\n\n"}

event: texto
data: {"texto":"- **Anúncio da Meta**: 18 contatos, 3 fecharam\n"}

event: fim
data: {"conversa_id":"6f1c…","uso":{"entrada":812,"saida":240,"cache_lido":9120,"cache_criado":0,"chamadas":3,"ferramentas":2},"modelo":"claude-opus-5-5","parou":"fim","aviso":null}
```

### `GET /api/gestor/conversas`
As conversas da pessoa logada, da mais recente para a mais antiga (até 30). Os planos da semana não entram aqui.

```json
{ "ligado": true, "aviso": null,
  "conversas": [ { "id": "uuid", "titulo": "Como estão os anúncios este mês?", "criada_em": "2026-11-19T13:10:00.000Z",
                   "atualizada_em": "2026-11-19T13:10:40.000Z", "mensagens": 4, "ultima": "Sem conta de anúncio ligada não dá…" } ] }
```
Sem a tabela no banco: `{ "ligado": false, "aviso": "As conversas ainda não ficam guardadas: falta aplicar a atualização do banco do IndyCar Tráfego.", "conversas": [] }`.

### `GET /api/gestor/conversas/:id`
A conversa inteira (da pessoa logada, ou um plano da semana, que é da oficina). 404 `conversa` se não existe ou é de outra pessoa.

```json
{ "id": "uuid", "titulo": "Como estão os anúncios este mês?", "criada_em": "…", "atualizada_em": "…", "plano": false,
  "mensagens": [
    { "papel": "pessoa", "texto": "Como estão os anúncios este mês?", "em": "2026-11-19T13:10:00.000Z" },
    { "papel": "gestor", "texto": "Sem conta de anúncio ligada…", "em": "2026-11-19T13:10:40.000Z",
      "ferramentas": ["saude", "funil_por_origem"], "propostas": ["uuid"], "parou": "fim", "erro": null } ] }
```
- `papel`: `pessoa`, `gestor` ou `resumo` (quando a conversa passa de 40 mensagens, as mais antigas viram uma mensagem
  `resumo` no começo, com `texto` e `mensagens_resumidas`).
- Mensagem do Gestor que parou no meio tem `erro: { codigo, erro }` e o texto que chegou até ali.

### `POST /api/gestor/conversas`
Abre uma conversa vazia: `{ "titulo": "opcional (até 80 letras)" }` → `{ "ok": true, "conversa": { id, titulo, criada_em, atualizada_em, plano: false, mensagens: [] } }`.
503 `sem_migracao` sem a tabela. (Não é obrigatório: perguntar sem `conversa_id` já abre uma.)

## 2. Plano da semana

O plano é uma conversa do Gestor com uma pergunta fixa ("olhe os últimos 7 e 30 dias e diga o que fazer esta semana"),
guardada em `trafego_ia_conversas` como conversa **da oficina** (sem dono), com `plano: true`.

### `GET /api/gestor/plano`

```json
{ "ligado": true, "aviso": null,
  "plano": { "id": "uuid (da conversa)", "feito_em": "2026-11-19T10:00:12.000Z",
             "texto": "Semana de enxergar antes de gastar mais.\n\n- …",
             "propostas": ["uuid", "uuid"],
             "baseado_em": { "de": "2026-10-21", "ate": "2026-11-19", "dias": [7, 30], "rotulo": "últimos 7 e 30 dias (21/10 a 19/11)" },
             "pedido_por": "Paulo", "parou": "fim", "erro": null } }
```
Sem plano ainda: `"plano": null`. Sem a tabela: `"ligado": false`, `"plano": null` e `aviso`. `pedido_por` é `null` quando quem fez foi a rotina.

### `POST /api/gestor/plano`
Gera um plano novo e devolve `{ "ok": true, "plano": { …o mesmo objeto…, "uso": { … } } }` (leva até 90 s; não é fluxo).
Mesmos erros da pergunta (`limite_hora`, `limite_dia`, `sem_chave`, `ia_desligada`) e mais: 503 `sem_migracao` sem a tabela
das conversas; 502 com `codigo` `modelo`, `modelo_ocupado`, `tempo` ou `recusa` quando a IA não terminou
(`{ erro, codigo, plano }`, com o que chegou até ali).

### `POST /api/cron/plano?chave=` (rotina, sem login; também `GET`)
O mesmo, chamado pela rotina da semana. 401 sem a chave certa. Responde `{ ok: true, plano: { id, feito_em, propostas, parou } }`
ou `{ ok: false, codigo, erro }`.

## 3. Diário de decisões (`trafego_acoes`)

### Uma ação (formato único: lista, evento `proposta` do fluxo e respostas das escritas)

```jsonc
{ "id": "uuid", "criada_em": "2026-11-19T13:10:30.000Z",
  "origem": "ia", "origem_rotulo": "Gestor IA",              // ia "Gestor IA" · radar "Radar" · pessoa "Pessoa" · externa "IA de fora"
  "autor": "Gestor IA",                                       // nome da pessoa, "Gestor IA", "Radar" ou "IA de fora: <nome da chave>"
  "tipo": "pausar", "tipo_rotulo": "Pausar",
  "titulo": "Pausar a campanha Troca de óleo do Google", "porque": "Gastou R$ 319 em 30 dias e nenhum contato fechou.",
  "alvo": { "plataforma": "google", "nivel": "campanha", "ext": "2231", "nome": "Troca de óleo" },
  "alvo_rotulo": "Google › campanha Troca de óleo",
  "evidencias": [ { "fonte": "campanhas", "dado": "gasto de R$ 319 de 21/10 a 19/11, 0 fechados", "valor": 319 } ],
  "verba": null,                                              // { "atual": 50, "nova": 60, "por": "dia" } nas de verba
  "risco": "normal", "risco_motivo": null,                    // "alto" + frase: aumento acima de 30% ou acima do teto do mês
  "status": "proposta", "status_rotulo": "Esperando decisão",
  "vence_em": "2026-12-03",                                   // só em "proposta": depois disso vira "expirada"
  "decidida_por": null, "decidida_por_id": null, "decidida_em": null, "feita_em": null, "nota": null,
  "medir_em": "2026-11-26",
  "antes": null, "depois": null,
  "veredito": null, "veredito_rotulo": null, "veredito_texto": null }
```
- `status` e rótulos: `proposta` "Esperando decisão" · `aceita` "Aceita, falta fazer" · `feita` "Feita" · `recusada` "Recusada" ·
  `expirada` "Expirou sem decisão".
- `tipo` (lista fechada) e rótulos: `pausar` "Pausar" · `reativar` "Reativar" · `aumentar_verba` "Aumentar a verba" ·
  `reduzir_verba` "Reduzir a verba" · `trocar_criativo` "Trocar a imagem ou o vídeo" · `mensagem_pronta` "Mensagem pronta do anúncio" ·
  `negativar_termo` "Bloquear um termo de busca" · `ajustar_horario` "Mudar o horário dos anúncios" ·
  `corrigir_rastreio` "Consertar o rastreio" · `outro` "Outra mudança".
- `antes` e `depois` têm a mesma forma (`null` enquanto não medido):

```jsonc
{ "de": "2026-11-12", "ate": "2026-11-18", "periodo": "12/11 a 18/11", "dias": 7,
  "base": "campanha", "base_rotulo": "a campanha Troca de óleo",   // campanha · plataforma ("o Google inteiro") · oficina ("a oficina toda")
  "gasto": 319.5, "contatos": 9, "fecharam": 1, "faturado": 420, "custo_por_contato": 35.5, "retorno": 1.31,
  "contatos_por_dia": 1.29, "gasto_ligado": true, "medido_em": "2026-11-19T13:20:00.000Z", "erro": null }
```
  `null` em número = não se sabe (sem conta ligada, sem valor lançado). `erro` = frase quando não deu para ler os números naquela hora.
- `veredito` (escrito pelo servidor, nunca pela IA): `melhorou` "Melhorou" · `piorou` "Piorou" · `sem_diferenca` "Sem diferença clara" ·
  `nao_mediu` "Não deu para medir"; `veredito_texto` explica com os números (ex.: "Melhorou: o custo por contato foi de R$ 48 para
  R$ 36, comparando 06/10 a 12/10 com 14/10 a 20/10.").

**Como o servidor mede (regra simples e honesta):**
1. Base: a campanha do alvo (Meta ou Google, nível campanha); a plataforma inteira para conta, conjunto, anúncio, palavra, termo,
   horário e para **pausar** (campanha pausada não tem número depois); a oficina toda para site, WhatsApp e oficina.
2. `antes` = os 7 dias completos antes da decisão (gravado quando a pessoa aceita ou registra a decisão).
   `depois` = até 7 dias completos entre o dia seguinte ao "feita" e a véspera de `medir_em` (mínimo 3 dias).
3. Número comparado, o primeiro que existir nos dois lados: retorno (maior é melhor) → custo por contato (menor é melhor) →
   contatos por dia (maior é melhor).
4. `nao_mediu`: não foi marcada como feita, faltou o `antes`, menos de 3 dias depois da mudança, ou nenhum dos três números existe
   nos dois lados. `sem_diferenca`: menos de 5 contatos em um dos lados (pouco para afirmar) ou mudança menor que 15%.
   Senão `melhorou` ou `piorou`.

### `GET /api/acoes-trafego`
Consulta: `status` (um ou vários separados por vírgula: `proposta,aceita`), `limite` (padrão 50, máximo 200).

```jsonc
{ "ligado": true, "aviso": null, "total": 12,
  "contagem": { "proposta": 2, "aceita": 1, "feita": 6, "recusada": 2, "expirada": 1 },
  "acoes": [ /* ação */ ] }                                  // mais nova primeiro
```
Sem a tabela: `{ "ligado": false, "aviso": "O diário de decisões ainda não existe no banco: falta aplicar a atualização do banco do IndyCar Tráfego.", "total": 0, "contagem": { …zeros… }, "acoes": [] }`.
422 `status` com status fora da lista.

### `POST /api/acoes-trafego/:id/decidir`
Corpo `{ "decisao": "aceitar" | "recusar", "nota": "opcional, até 300 letras" }` → `{ "ok": true, "acao": <ação> }`.
- Aceitar grava `antes` (os 7 dias antes de hoje, na base do alvo), `decidida_por`, `decidida_em`. **Não muda nada no anúncio**:
  a pessoa faz a mudança no gerenciador e depois marca "Já fiz".
- 404 `nao_existe` · 409 `ja_decidida` (não está mais em `proposta`) · 409 `expirada` (passou de 14 dias sem decisão; vira
  `expirada`) · 422 `decisao` · 422 `nota` · 503 `sem_migracao`.

### `POST /api/acoes-trafego/:id/feita`
Corpo `{ "nota": "opcional" }` → `{ "ok": true, "acao": <ação>, "aviso": null }`. Só de `aceita` para `feita` (409 `nao_aceita`).
Se a medição cairia cedo demais (menos de 3 dias depois de hoje), `medir_em` passa para daqui a 7 dias e o `aviso` diz isso.

### `POST /api/acoes-trafego`
A pessoa registra uma decisão que tomou por conta própria (entra no diário e é medida igual):
`{ "tipo", "titulo" (5 a 120 letras), "porque"? (até 1000), "alvo"? { plataforma, nivel, ext?, nome? }, "medir_em"? (AAAA-MM-DD, de amanhã a 90 dias), "ja_fiz"? true|false, "nota"? }`
→ `{ "ok": true, "acao": <ação> }` com `origem: "pessoa"`, status `feita` (com `ja_fiz: true`) ou `aceita`, `antes` já medido.
422 com `codigo` = o campo errado (`tipo`, `titulo`, `porque`, `alvo`, `medir_em`, `nota`).

### `POST /api/cron/medir?chave=` (rotina diária, sem login; também `GET`)
1. Propostas com mais de 14 dias sem decisão viram `expirada`.
2. Ações `aceita` ou `feita` com `medir_em` até hoje e sem veredito ganham `depois` e `veredito`.

→ `{ "ok": true, "expiradas": 1, "medidas": [ { "id": "uuid", "veredito": "melhorou" } ], "erros": 0 }`.
Sem a tabela: `{ "ok": false, "codigo": "sem_migracao", "erro": "…" }`.

## 4. Custo, limites e o que fica registrado
- Modelo: `ia_config.modelo_forte` (hoje `claude-opus-5-5`), esforço `medium`, pensamento adaptativo (o padrão do modelo),
  resposta em fluxo. Laço de ferramentas no servidor: no máximo 8 idas ao modelo (a 8ª sem ferramentas, para responder com o
  que já leu) e 90 s.
- Cache de prompt: um marcador fixo no fim das instruções (cobre a lista de ferramentas e as instruções) e o cache automático
  da conversa.
- Recusa da IA: nos modelos Opus 5.5 e Sonnet 5.5 o pedido vai com a troca automática de modelo do lado da Anthropic
  (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`); desligue com `GESTOR_FALLBACK=0`. Se mesmo assim recusar:
  `erro` com `codigo: "recusa"`.
- Cada chamada ao modelo vira uma linha em `ia_acoes`: `origem = 'trafego'`, `tipo = 'gestor'`, `status` (`executada` ou `erro`),
  `perfil_id`, `modelo`, `tokens_entrada`, `tokens_saida`, `duracao_ms`, `entrada` `{ ato: pergunta|plano, conversa_id, volta }`,
  `saida` `{ parou, cache_lido, cache_criado, ferramentas_pedidas }`. A pergunta e a resposta **não** vão para `ia_acoes` (ficam só
  na conversa). Cada ferramenta usada vira também a linha `porta:<ferramenta>` da T5a (porta `gestor`).
- `ia_config.ativo` e `ia_config.limite_chamadas_dia` valem como no Atendimento (o limite conta as linhas `tipo = 'gestor'` do dia).
- O modelo nunca recebe chave, token nem endereço do banco. Texto de cliente só chega dentro de `texto_do_cliente` (resultado de
  ferramenta). A resposta do modelo vai para a tela como texto (a tela usa `textContent`).
