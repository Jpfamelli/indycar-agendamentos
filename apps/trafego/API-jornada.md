# API da jornada, da origem e do rastreio (IndyCar Tráfego, rodada 8, frente T2b)

Rotas de `rotas/jornada.js`, `rotas/origem.js` e `rotas/rastreio.js`. Contrato: `r8/CONTRATO-API.md` §5.1, §5.3, §5.5
e `r8/CONTRATO-RASTREIO.md` §6. Os exemplos abaixo saíram das rotas de verdade (servidor do app com banco de mentira,
19/11/2026); listas longas foram cortadas e marcadas com `…`.

Montado na Central, tudo fica debaixo de `/trafego` (ex.: `/trafego/api/jornada`).

## Regras comuns
- **Login**: toda rota `/api/jornada*`, `/api/pendencias` e `/api/origem/*` exige login e o acesso ao app (admin ou
  quem tem o app `ads`). Sem login: `401 { erro, codigo: 'login' }`; sem o app: `403`.
- **Erro** sai sempre como `{ erro, ...extra }`: `400` filtro ou período inválido (`campo`), `404` não existe,
  `409` a situação não permite (`codigo`), `422` campo inválido (`campo`, às vezes `opcoes`), `429` limite por pessoa
  (`Retry-After`, `codigo: 'limite'`), `502` o banco não respondeu (frase curta), `503 codigo: 'sem_migracao'` o banco
  ainda não tem a migração da rodada 8. Erro 5xx leva `pedido` (o número para achar no log).
- **Limite por pessoa** (a cada 10 min): leitura da jornada 600, detalhe 300, escrita 120, lote 12; origem: leitura 300,
  escrita de frase 60, candidatas 30, testar 120, reaplicar 20, mensagem pronta 30. O limite por IP do servidor vale também.
- **Período** (`/api/jornada`, `/api/pendencias`): `periodo=hoje|7d|30d|mes|mes_passado` (padrão `mes`) ou `de=AAAA-MM-DD&ate=AAAA-MM-DD`.
  `fresco=1` ignora a memória curta (1 min) e lê o banco de novo.
- **Dado pessoal**: a lista leva nome curto (`Bruno P.`) e só os 4 últimos dígitos do telefone; nome e telefone inteiros
  só no detalhe. Identificador de clique (`gclid`, `fbclid`, `ctwa_clid` e afins) nunca sai em resposta nenhuma destas
  rotas e nunca vai para log. Texto de cliente (mensagem, nome) volta como dado; a tela escapa antes de pôr em HTML.
- **Banco sem a migração da rodada 8**: leitura responde `200` com `ligado: false` e `aviso`; escrita responde `503`
  `{ erro, codigo: 'sem_migracao' }`. A jornada continua funcionando com as colunas antigas (origem pela regra antiga).
- **Auditoria**: toda escrita grava em `auditoria` o que foi escolhido (canal, motivo, valor, código), nunca texto livre.

---

## Jornada

### GET /api/jornada
Lista paginada de contatos do período, com totais, funil e filtros (contrato §5.3).

| Parâmetro | Valores |
|---|---|
| período | ver Regras comuns |
| `canal` | `meta`, `google`, `site`, `instagram`, `indicacao`, `passagem`, `telefone`, `whatsapp`, `desconhecida` |
| `paga` | `1` (veio de anúncio) ou `0` |
| `campanha` | id da campanha na plataforma (ou o nome, quando não há id), até 120 letras |
| `desfecho` | `fechou`, `nao_fechou`, `aberto` |
| `etapa` | `contato`, `respondido`, `orcamento`, `agendou`, `veio`, `oficina`, `fechou` |
| `pendencia` | `sem_origem`, `sem_valor`, `sem_motivo`, `sem_resposta` |
| `q` | busca por nome, telefone ou placa (até 80) |
| `ordem` | `recentes` (padrão), `valor`, `parados` |
| `pagina`, `tamanho` | página a partir de 1; tamanho padrão 50, máximo 200 |

Valor fora da lista é `400` com `campo` (não vira lista vazia calada).

```json
{
  "periodo": { "de": "2026-03-01", "ate": "2026-03-31", "rotulo": "01/03 a 31/03", "anterior": { "de": "2026-01-29", "ate": "2026-02-28" } },
  "estado": { "gasto": "sem_conta", "valores": "nenhum", "origem": "parcial", "demo": false, "respostas": "ok",
              "respostas_desde": null, "respostas_ate": null, "respostas_texto": null, "ciclo": "ok" },
  "totais": { "contatos": 3, "de_anuncio": 1, "respondidos": 3, "com_orcamento": 0, "agendaram": 0, "vieram": 1, "fecharam": 1,
              "nao_fecharam": 1, "abertos": 1, "faturado": null, "sem_origem": 2, "sem_valor": 1, "sem_motivo": 1, "sem_resposta": 0,
              "na_oficina": 1, "respondidos_confirmados": 3, "resposta_desconhecida": 0,
              "conversas_novas": 0, "conversas_novas_anuncio": 0, "conversas_novas_viraram_contato": 0 },
  "funil": {
    "etapas": [
      { "id": "contato", "rotulo": "Contatos", "total": 3, "anuncio": 1, "passagem": null },
      { "id": "respondido", "rotulo": "Respondidos", "total": 3, "anuncio": 1, "passagem": 1, "confirmados": 3, "desconhecidos": 0 },
      "…"
    ],
    "nao_fecharam": { "total": 1, "motivos": [], "sem_motivo": 1 }
  },
  "filtros": {
    "canais": [ { "id": "desconhecida", "rotulo": "Ainda não sabemos", "n": 2 }, { "id": "meta", "rotulo": "Anúncio da Meta", "n": 1 } ],
    "campanhas": [ { "ext": null, "nome": "Freios março", "plataforma": "meta", "n": 1 } ],
    "desfechos": [ { "id": "fechou", "rotulo": "Fechou", "n": 1 }, "…" ],
    "motivos": [],
    "pendencias": [ { "id": "sem_origem", "rotulo": "Sem origem", "n": 2 }, "…" ],
    "etapas": [ { "id": "contato", "rotulo": "Contatos", "n": 3 }, "…" ]
  },
  "itens": [ "… um item como o do detalhe abaixo, sem os campos do detalhe e com nome curto …" ],
  "pagina": { "atual": 1, "tamanho": 2, "total": 3 }
}
```
`estado.respostas = 'sem_registro'` (com `respostas_desde`, `respostas_ate` e `respostas_texto`) quando o sistema não
registrou nenhuma resposta da oficina numa janela (achado 02): nesse trecho `respondido` fica com `minutos: null` e sem
pendência `sem_resposta`.

### GET /api/jornada/:lead_id
Um contato: o item do §5.3 com nome e telefone inteiros, mais `linha_do_tempo`, `primeira_mensagem`, `rastreio`,
`historico` e `links`. Contato que não existe: `404`.

```json
{
  "lead_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "nome": "Bruno Alves Pereira", "telefone_final": "7766",
  "carro": "Gol 2015", "servico": "Freios", "chegou_em": "2026-03-10T10:00:00-03:00", "cliente_novo": null,
  "origem": { "canal": "meta", "paga": true, "rotulo": "Anúncio da Meta", "detalhe": "Freios março",
              "campanha": { "ext": null, "nome": "Freios março" }, "conjunto": null, "anuncio": null, "palavra_chave": null,
              "como": "ref", "como_rotulo": "pelo código do site", "certeza": "certa" },
  "etapas": [ { "id": "contato", "em": "2026-03-10T10:00:00-03:00" },
              { "id": "respondido", "em": "2026-03-10T10:08:00-03:00", "minutos": 8 },
              { "id": "veio", "em": null }, { "id": "oficina", "em": null, "os": null },
              { "id": "fechou", "em": "2026-03-12T10:00:00-03:00" } ],
  "etapa_atual": "fechou",
  "desfecho": { "tipo": "fechou", "valor": null, "valor_fonte": null, "motivo": null, "motivo_rotulo": null, "obs": null,
                "em": "2026-03-12T10:00:00-03:00", "parado_dias": null },
  "responsavel": null, "pendencias": ["sem_valor"], "espera_min": null,
  "telefone": "5512991237766",
  "linha_do_tempo": [ { "em": "2026-03-10T10:00:00-03:00", "tipo": "mudanca", "titulo": "Contato chegou", "detalhe": "Freios" },
                      { "em": "2026-03-12T10:00:00-03:00", "tipo": "mudanca", "titulo": "Fechou o serviço", "detalhe": "Falta lançar o valor" } ],
  "primeira_mensagem": "Oi, quanto fica o freio?",
  "rastreio": null,
  "historico": { "visitas_antes": 0, "gasto_antes": 0, "cliente_desde": null },
  "links": { "crm": "/crm/?lead=aaaaaaaa-…", "atendimento": "/atendimento/?tel=5512991237766", "agenda": "/agenda/?tel=5512991237766" }
}
```
`origem.certeza`: `certa` · `provavel` · `palpite` · `nenhuma`. `desfecho.valor_fonte`: `patio` > `orcamento` > `agenda` > `manual`.

### GET /api/pendencias
Quatro filas de trabalho do período (até 30 itens cada). A fila `sem_origem` leva a `primeira_mensagem` do cliente.

```json
{
  "periodo": { "…": "…" }, "estado": { "…": "…" },
  "sem_valor":    { "n": 1, "itens": [ { "lead_id": "aaaaaaaa-…", "nome": "Bruno P.", "…": "o item do §5.3" } ] },
  "sem_motivo":   { "n": 1, "itens": [ { "lead_id": "bbbbbbbb-…", "nome": "Carla D.", "…": "o item do §5.3" } ] },
  "sem_origem":   { "n": 2, "itens": [ { "lead_id": "cccccccc-…", "nome": "Davi L.", "…": "o item do §5.3", "primeira_mensagem": "Oi, quanto fica o freio?" } ] },
  "sem_resposta": { "n": 0, "itens": [] }
}
```

### POST /api/jornada/:lead_id/valor
Corpo `{ "valor": 750.5 }` (aceita `"750,50"`). Só contato que fechou (`409` se não); valor de R$ 1 a R$ 100.000 com
duas casas (`422`). Grava `leads.valor_pago`.
```json
{ "ok": true, "desfecho": { "tipo": "fechou", "valor": 750.5, "valor_fonte": "manual", "motivo": null, "motivo_rotulo": null,
  "obs": null, "em": "2026-03-12T10:00:00-03:00", "parado_dias": null } }
```

### POST /api/jornada/:lead_id/motivo
Corpo `{ "motivo": "caro", "obs": "texto opcional" }`. Motivos: `caro`, `concorrente`, `sem_retorno`, `desistiu`,
`nao_fazemos`, `prazo`, `sem_urgencia`, `sem_vaga`, `outro`. Só contato que não fechou (`409`). A observação não vai para a auditoria.
```json
{ "ok": true, "desfecho": { "tipo": "nao_fechou", "valor": null, "valor_fonte": null, "motivo": "caro", "motivo_rotulo": "Achou caro",
  "obs": "achou caro", "em": "2026-03-13T10:00:00-03:00", "parado_dias": null } }
```

### POST /api/jornada/:lead_id/origem
Origem marcada à mão. Corpo `{ "canal": "google", "campanha_ext?": "…", "campanha_nome?": "…", "anuncio_ext?": "…",
"anuncio_nome?": "…", "obs?": "…" }`; `canal` é um dos canais menos `desconhecida` (`422` com `opcoes`). Vai para a
função do banco `trafego_aplicar_origem(lead, dados, 'manual')`, que só grava se a evidência for mais forte que a atual.
```json
{ "ok": true, "origem": { "canal": "google", "paga": true, "rotulo": "Anúncio do Google", "detalhe": "Freios Taubaté",
  "campanha": { "ext": null, "nome": "Freios Taubaté" }, "conjunto": null, "anuncio": null, "palavra_chave": null,
  "como": "manual", "como_rotulo": "marcado à mão", "certeza": "certa" } }
```

### POST /api/jornada/lote
Até 50 de uma vez (`422` acima). Corpo `{ "itens": [ { "lead_id", "valor?", "motivo?", "obs?", "origem?" } ] }`: cada item pode
trazer valor, motivo e origem (`origem` é o canal em texto ou o mesmo objeto da rota de origem). Um item com erro não derruba os outros.
```json
{ "ok": false, "feitos": 1, "erros": [ { "lead_id": "cccccccc-…", "erro": "Só dá para lançar valor em contato que já fechou." } ] }
```

---

## Origem (Ajustes › De onde vêm os contatos)

Destinos que a tela oferece para uma frase ou mensagem pronta (`canal`): `meta`, `google`, `site`, `instagram`,
`indicacao`, `passagem`, `telefone`, `whatsapp`, `anuncio` (anúncio sem saber a plataforma) e `a_confirmar`.

### GET /api/origem/frases
Frases da primeira mensagem e a origem que cada uma dá (`vira`, objeto do §5.1). Até 500, ligadas primeiro.
```json
{ "ligado": true,
  "frases": [ { "id": "dddddddd-…", "frase": "ola! tenho interesse e queria mais informacoes", "tipo": "comeca", "como": "frase_padrao",
                "ativa": true, "paga": true, "plataforma": "meta", "campanha_ext": null, "campanha_nome": null, "anuncio_ext": null,
                "anuncio_nome": null, "rotulo": "Mensagem padrão de anúncio da Meta", "acertos": 12, "ultimo_acerto_em": null,
                "criada_em": "2026-11-19T10:00:00Z",
                "vira": { "canal": "meta", "paga": true, "rotulo": "Anúncio da Meta", "detalhe": null, "campanha": null, "conjunto": null,
                          "anuncio": null, "palavra_chave": null, "como": "frase_padrao", "como_rotulo": "pela mensagem padrão de anúncio",
                          "certeza": "provavel" } } ],
  "destinos": [ { "id": "meta", "rotulo": "Anúncio da Meta" }, "…", { "id": "a_confirmar", "rotulo": "A confirmar" } ] }
```
Sem a migração: `{ "ligado": false, "aviso": "Esta parte ainda não está ligada: falta aplicar no banco a atualização do Tráfego (rodada 8).", "frases": [], "destinos": [ … ] }`.

### POST /api/origem/frases
Corpo `{ "frase", "tipo?": "exata|comeca|contem" (padrão contem), "canal", "como?": "frase|frase_padrao", "rotulo?",
"campanha_ext?", "campanha_nome?", "anuncio_ext?", "anuncio_nome?" }`. A frase é guardada como o banco compara
(minúsculas, sem acento, sem pontuação no fim); mínimo 8 letras para `contem`, 6 para `comeca`, 2 para `exata`.
Frase repetida: `409 codigo: 'repetida'`.
```json
{ "ok": true, "frase": { "id": "…", "frase": "vi o anuncio da troca de oleo", "tipo": "contem", "como": "frase", "ativa": true,
  "paga": true, "plataforma": "meta", "campanha_nome": "Óleo novembro", "…": "…",
  "vira": { "canal": "meta", "rotulo": "Anúncio da Meta", "detalhe": "Óleo novembro", "como_rotulo": "pela primeira mensagem", "certeza": "provavel", "…": "…" } } }
```

### POST /api/origem/frases/:id
Muda só o que vier (mesmos campos, mais `ativa: true|false`). Frase que não existe: `404`. Resposta igual à de criar.

### DELETE /api/origem/frases/:id
Desliga a frase (`ativa: false`). Não apaga a linha: os contatos que ela já marcou ficam como estão. Resposta igual à de criar.

### GET /api/origem/candidatas
Primeiras mensagens que se repetem (3 vezes ou mais em 180 dias) e ainda não dão origem nenhuma, com um palpite
(`sugestao`, só para a pessoa confirmar). Até 100.
```json
{ "ligado": true, "candidatas": [ { "frase": "vi o anuncio no instagram e quero orcamento", "n": 5,
  "exemplo": "Vi o anúncio no Instagram e quero orçamento", "ultima_em": "2026-11-18T12:00:00Z",
  "sugestao": { "canal": "meta", "rotulo": "Anúncio da Meta" } } ] }
```

### POST /api/origem/testar
Corpo `{ "mensagem": "…" }` (até 2.000 letras). Diz o que essa mensagem viraria, sem gravar nada.
```json
{ "origem": { "canal": "meta", "paga": true, "rotulo": "Anúncio da Meta", "detalhe": "Óleo novembro",
              "campanha": { "ext": null, "nome": "Óleo novembro" }, "conjunto": null, "anuncio": null, "palavra_chave": null,
              "como": "ref", "como_rotulo": "pelo código da mensagem pronta", "certeza": "certa" },
  "frase_id": null, "codigo": "K7M2P", "rotulo": "Anúncio troca de óleo" }
```
Mensagem sem código nem frase: `{ "origem": null, "frase_id": null, "codigo": null, "rotulo": null }`.

### POST /api/origem/reaplicar
Passa a régua de origem nos contatos criados desde `desde` (`AAAA-MM-DD`, a partir de 2024, não no futuro).
**Sempre simula primeiro**: com `simular: true` (ou sem `simular`) só conta; para aplicar, mande `simular: false` com o
mesmo `desde` de uma simulação feita há menos de 10 minutos pela mesma pessoa. Cada simulação vale uma aplicação.
Sem isso: `409 codigo: 'simule_primeiro'`. Só a aplicação é auditada.
```json
{ "simulado": true, "desde": "2026-08-01", "analisados": 766, "com_mensagem": 569, "com_sinal": 120,
  "por_origem": [ { "rotulo": "Anúncio da Meta", "n": 52 }, { "rotulo": "Anúncio (plataforma a confirmar)", "n": 15 } ],
  "por_frase": [ { "frase": "ola! tenho interesse e queria mais informacoes", "n": 40 } ],
  "mudariam": 86, "aplicar_ate": "2026-11-19T13:36:55.212Z" }
```
Aplicando: os mesmos campos com `"simulado": false` e `"mudaram": 86` no lugar de `mudariam` e `aplicar_ate`.

### POST /api/origem/link
Mensagem pronta para anúncio de "clique para o WhatsApp", link da bio ou cartaz (contrato de rastreio §6.6). Corpo
`{ "rotulo", "plataforma?": "meta|google", "paga?": true|false, "campanha_ext?", "campanha_nome?", "anuncio_nome?", "texto?" }`.
Cria uma linha permanente em `trafego_rastreio` (`evento: 'link'`) com um código novo de 5 letras e devolve o texto
(com ` [ref CODIGO]` no fim), o link `wa.me` com o telefone de `empresa.telefone` e o QR code desse link em SVG (feito
no app, `rastreio/qr.js`). Com `plataforma`, é anúncio; sem `plataforma`, só é anúncio com `paga: true`.
`texto` padrão: "Olá! Quero saber mais."; texto que já traz `[ref` é `422`.
Não cadastra o texto em `trafego_frases`: o código já identifica (certeza máxima) e um "Olá! Quero saber mais."
cadastrado como frase marcaria como anúncio quem nunca viu o anúncio.
```json
{ "ok": true,
  "frase": { "codigo": "DZ37K", "rotulo": "Anúncio troca de óleo", "criada_em": null,
             "origem": { "canal": "meta", "paga": true, "rotulo": "Anúncio da Meta", "detalhe": "Óleo novembro",
                         "campanha": { "ext": null, "nome": "Óleo novembro" }, "conjunto": null, "anuncio": null, "palavra_chave": null,
                         "como": "ref", "como_rotulo": "pelo código da mensagem pronta", "certeza": "certa" } },
  "texto": "Olá! Quero saber da troca de óleo. [ref DZ37K]",
  "link_whatsapp": "https://wa.me/5512996830272?text=Ol%C3%A1!%20Quero%20saber%20da%20troca%20de%20%C3%B3leo.%20%5Bref%20DZ37K%5D",
  "qr_svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 53 53\" width=\"424\" height=\"424\" shape-rendering=\"crispEdges\" role=\"img\" aria-label=\"QR code\">…</svg>" }
```
Sem telefone da oficina no cadastro: grava do mesmo jeito, com `link_whatsapp: null`, `qr_svg: null` e `aviso`.

### GET /api/origem/rastreio
Situação do rastreio do site (últimos 30 dias) e a linha para colar no site de fora.
```json
{ "ligado": true, "script": "<script src=\"https://indycar-agendamentos.onrender.com/trafego/rastreio.js\" async></script>",
  "instalado_no_site": true, "ultima_visita": "2026-11-18T13:26:55.126Z", "ultimo_clique": "2026-11-18T13:33:35.126Z",
  "cliques_7d": 1, "visitas_7d": 2, "por_pagina": [ { "pagina": "/servicos/oleo", "n": 2 } ] }
```
`instalado_no_site` é verdadeiro quando chegou alguma visita em 30 dias (do site da IndyCar ou de um site de fora:
os dois gravam na mesma tabela). O endereço do script vem de `TRAFEGO_URL` quando o ambiente define.

---

## Públicas (sem login, CORS livre)

### GET /rastreio.js
O script portátil (`rastreio/rastreio.js`, servido sem comentários e compactado, 3.765 bytes hoje, teto 4 KB).
Cabeçalhos: `Content-Type: text/javascript; charset=utf-8`, `Cache-Control: public, max-age=3600`,
`Cross-Origin-Resource-Policy: cross-origin`, `Access-Control-Allow-Origin: *`.

Uso: `<script src="https://indycar-agendamentos.onrender.com/trafego/rastreio.js" async></script>`.
Opcional: `data-registro="https://…/api/rastreio"` no `<script>`; `data-servico="cambio"` no link do WhatsApp.
O script guarda a chegada em `localStorage['indycar_rastreio']` por 30 dias, registra a visita na primeira interação
(ou depois de 4 s com a página visível), acrescenta ` [ref CODIGO]` aos links `wa.me`, `api.whatsapp.com/send`,
`web.whatsapp.com/send` e `whatsapp://send` (link sem texto ganha `Olá! [ref CODIGO]`) e registra o clique com `keepalive`.

### POST /api/rastreio
Corpo JSON (pode vir como `text/plain`, para não precisar de pré-voo) de até 4 KB:
`{ "evento": "visita|clique", "codigo?", "servico?", "pagina?", "referencia?", "referencia_tipo?", "utm_source?", "utm_medium?",
"utm_campaign?", "utm_content?", "utm_term?", "gclid?", "gbraid?", "wbraid?", "fbclid?", "ttclid?", "msclkid?" }`.
Campo fora da lista é descartado; tudo é cortado no tamanho do contrato; identificador de clique fica como chegou
(maiúscula e minúscula importam). O servidor acrescenta o IP que ele vê e o navegador de quem chamou e repassa para
`trafego_rastreio_registrar` (o banco guarda só um resumo embaralhado do IP).
Limite: 60 registros por IP a cada 10 minutos no servidor (o banco ainda limita 20 por hora).

Resposta **sempre** `200`:
```json
{ "ok": true, "codigo": "K7M2P" }
```
ou `{ "ok": true }` sem código quando recusou (corpo grande, JSON ruim, acima do limite, banco fora do ar ou sem a
função). O motivo nunca é dito.
