# Conferência da tela com a API (rodada 8, frente T3b)

Cada linha: rota, campos que a tela lê e onde aparecem. A doc da rota vence o contrato; quando a doc não mostra o
campo (lista vazia no exemplo), conferi no código do servidor e marquei. O servidor de mentira (`_mock/servidor.mjs`)
responde todas estas rotas no formato das docs, nos cenários `sem_conta`, `cheio`, `comeco` e `demo`.

Legenda: **doc** = está no exemplo da doc · **código** = não está no exemplo, conferido no servidor ·
**a conferir** = rota ou campo sem doc nem servidor nesta árvore (fica para a integração).

## Hoje e Jornada (pente fino pedido no recado)

| Rota | Campos lidos | Onde aparece | Fonte |
|---|---|---|---|
| `GET /api/hoje?periodo=` | `estado.{gasto, valores, origem, demo, respostas, respostas_texto, incompleto, reserva, aviso}` | faixa "incompleto" (novo: `js/aviso.js`, chamada em `hoje.js`), selo de demonstração, "por que falta" das contas, etapa Respondidos | doc |
| | `frase.{tipo, texto, apoio, acao.{rotulo, ir}}` | o muro (frase grande) e o botão dele | doc |
| | `numeros[].{id, rotulo, valor, formato, apoio, antes, variacao, sentido, serie}` | placar de quatro números e a linha "subiu 11%" | doc |
| | `derivados.{custo_por_contato, custo_por_servico, retorno, ticket_medio, taxa_fechamento, tempo_resposta_min, taxa_falta}` | contas embaixo do placar | doc |
| | `fazer[].{id, gravidade, titulo, porque, acao}` | "O que fazer agora" | doc |
| | `ritmo.{dias[].{data, contatos, contatos_anuncio}, orcamento_mes, gasto_ate_hoje, projecao, esperado_ate_hoje, situacao}` | ritmo da verba e colunas por dia | doc |
| | `agenda.{dias[], leitura, situacao, ocupacao_media}` | agenda dos próximos dias | doc |
| | `funil.{etapas[].{id, rotulo, total, anuncio, passagem, confirmados, desconhecidos}, nao_fecharam}` | caminho do contato | doc |
| | `origens[].{id, rotulo, paga, contatos, fecharam, faturado, gasto, custo_por_contato, retorno}` | de onde vieram | doc |
| | `hoje[].{lead_id, nome, hora, origem, etapa_atual, espera_min}` | contatos de hoje | doc |
| | `hoje[].etapas` | os sete traços na linha | **não vem** na doc: a linha agora se arruma sem eles (`css/hoje.css`, `:not(:has(.setores))`). Pedido à T2a: mandar `etapas` em `hoje[]` para os traços aparecerem |
| | `conexoes.{meta, google}.{ligado, situacao, ultima_coleta, aviso, parada}`, `site`, `whatsapp.{situacao, desde, aviso}` | conexões da Hoje; `parada` virou frase "A busca dos números está parada" (novo) | doc |
| `GET /api/jornada` | `itens[]`, `pagina`, `filtros`, `resumo`, `estado` | lista da Jornada; `estado.aviso`/`incompleto` agora na faixa (novo, `jornada.js`) | doc |
| `GET /api/jornada/:lead_id` | contato, `etapas`, `historico`, `rastreio.{clique_em, utm_source, utm_medium, utm_campaign, codigo}`, `links.atendimento` | gaveta do contato | `rastreio.*`: **código** (`jornada.js` › `rastreioDoContato`), a doc só cita os campos no `POST /api/rastreio` |
| `GET /api/pendencias` | `[].{id, n, verbo}` | atalhos de pendência | doc |
| `POST /api/jornada/:id/{valor, motivo, origem}`, `/lote` | corpo e `{ ok, item }` | respostas rápidas | doc |

Divergências achadas e resolvidas na tela: nenhuma de formato. Faltavam só o aviso de resposta incompleta (Hoje e
Jornada) e o campo `parada` das contas (Hoje); os dois entraram.

## Campanhas

| Rota | Campos lidos | Onde aparece | Fonte |
|---|---|---|---|
| `GET /api/campanhas?periodo=&ordem=` | `campanhas[].{plataforma, chave, ext, nome, situacao, gasto, contatos_plataforma, contatos, agendaram, vieram, fecharam, faturado, custo_por_contato, custo_por_servico, retorno, sem_valor, leitura.{tom, texto}, comparacao.{destaque, ...}, so_dos_contatos}` | classificação, "a plataforma diz / a oficina viu", distância para a primeira | doc (`comparacao.destaque` pode vir `""`: a tela não mostra frase vazia) |
| | `sem_campanha.{contatos, fecharam, faturado, texto}` | bloco "Contatos de anúncio sem campanha" com o caminho para a mensagem pronta | doc |
| | `horarios.{grade, pico, leitura}` | mapa de dia e hora e a tabela dele | doc |
| | `estado.{gasto, incompleto, reserva}` | "sem gasto ligado" (nunca "R$ 0") e a faixa | doc |
| `GET /api/campanhas/:plataforma/:chave` | `campanha`, `conjuntos[].anuncios[].{anuncio_ext, nome, miniatura}`, `palavras[]`, `termos[]`, `contatos[]`, `estado.termos` | campanha aberta | doc; itens de `palavras` e `termos` (`palavra, correspondencia, gasto, cliques, contatos` e `termo, cliques, gasto`): **código** (`motor/campanhas.js`, exemplo da doc vem vazio). 404 `sem_campanha`: doc |
| `GET /api/coleta/miniatura/:plataforma/:anuncio_ext` | imagem | miniatura do anúncio (com "sem imagem" quando falha) | doc (API-coleta.md); nunca o endereço do fbcdn |

## Gestor IA (API-gestor.md, apareceu no meio desta frente; a tela e o servidor de mentira foram alinhados)

| Rota | Campos lidos | Onde aparece | Fonte |
|---|---|---|---|
| `POST /api/gestor/perguntar` (fluxo) | eventos `ferramenta.{nome, rotulo}`, `texto.{texto}`, `proposta.{proposta}`, `fim.{conversa_id, parou, aviso}`, `erro.{erro, codigo, conversa_id}` | conversa, "olhando…", nota de resposta cortada (`parou: max_tokens`), aviso de conversa não guardada, erro no meio mantendo o texto | doc |
| | erros antes do fluxo: 422 `pergunta`, 404 `conversa`, 429 `limite_hora`/`limite_dia`, 503 `sem_chave`/`ia_desligada`/`sem_migracao` | nota na conversa com a frase do servidor | doc |
| `GET /api/gestor/conversas` | `{ ligado, aviso, conversas[].{id, titulo, atualizada_em, mensagens, ultima} }` | conversas anteriores | doc |
| `GET /api/gestor/conversas/:id` | `mensagens[].{papel: pessoa/gestor/resumo, texto, mensagens_resumidas, parou, erro}` | reabrir conversa | doc |
| `GET /api/gestor/plano` · `POST` | `{ ligado, aviso, plano.{texto, feito_em, propostas, baseado_em.rotulo, pedido_por} }`; 502 com `plano` parcial | plano da semana | doc |
| `GET /api/acoes-trafego` | `{ ligado, aviso, acoes[] }`; ação: `tipo, tipo_rotulo, titulo, porque, alvo, alvo_rotulo, evidencias[].dado, verba.{atual, nova, por}, risco, risco_motivo, status, status_rotulo, vence_em, autor, decidida_por, decidida_em, feita_em, medir_em, antes, depois, veredito, veredito_rotulo, veredito_texto, nota` | "Para decidir" e diário | doc |
| | `antes/depois.{periodo, base_rotulo, gasto, contatos, fecharam, faturado, custo_por_contato, retorno, contatos_por_dia, erro}` | tabela antes e depois e "Comparando a campanha…" | doc |
| `POST /api/acoes-trafego/:id/decidir` · `/feita` | `{ ok, acao, aviso }`; 409 `ja_decidida`/`expirada`/`nao_aceita` recarrega a lista | botões Aceitar, Recusar, Já fiz | doc |

Divergência resolvida: a tela tinha sido feita pelo recado da T5b (antes da doc). Mudou: `erro.erro` (era `mensagem`),
`risco` "normal", rótulos do servidor, `veredito` por código + `veredito_texto`, envelopes `{ ligado, aviso, … }`.
Ficou de fora: `POST /api/acoes-trafego` (pessoa registra uma mudança que fez por conta própria) e `dado_pessoal`.

## Ajustes

| Rota | Campos lidos | Onde aparece | Fonte |
|---|---|---|---|
| `GET /api/conexoes` | `meta, google, site, whatsapp`, `passos[].{feito, titulo, como, acao}` | Conexões: passo a passo e cartões | doc |
| `GET /api/integracoes` · `POST` | `{ id, canal, conta_nome, ultimo_sync_em, meta_ad_account_id, google_customer_id, meta_token_expira_em, tem_meta_token, tem_google_*}` | "Já há um acesso guardado" (nunca o valor) | **código** (`db.js` › rota antiga que continua valendo) |
| `POST /api/coleta/testar` · `POST /api/coleta/agora` · `GET /api/coleta/situacao` | `{ canal, ok, titulo, fazer, nome, avisos }`, 429 com `esperar` | Testar antes de salvar, "Buscar os números agora" | doc (API-coleta.md); `ultimo_sync_status` nunca aparece cru |
| `GET/POST /api/origem/*` | frases, candidatas, testar, reaplicar (simula antes; 409 `simule_primeiro`), link (`texto, link_whatsapp, qr_svg, aviso`), rastreio | De onde vêm os contatos | doc (API-jornada.md) |
| `GET/POST /api/config` | `orcamento_mensal, cpa_alvo, ticket_medio, margem_pct` | Metas e verba | **código** (`server.js` › `validarConfig`); o erro 400 do servidor traz o nome técnico do campo e a tela troca por frase |
| `GET/POST/DELETE /api/ia/chaves` | `{ ligado, aviso, chaves[] }`, `{ chave, aviso, registro }`, `{ registro, ja_estava }`; 403 `so_admin` | Acesso da IA de fora | doc (API-ia.md); linhas do Claude Code e do Codex: MCP.md e `mcp/exemplos/` |
| `GET /api/relatorios/texto?tipo=&mes=` | `titulo, texto, estado.gasto` | Relatórios: texto para o WhatsApp | doc |
| `GET /api/devolucao/google.csv` · `GET /api/devolucao/meta` | arquivo; `{ pronto, motivo, como, no_prazo, itens[] }`; 409 `banco_sem_colunas` | Devolver as vendas | doc (API-coleta.md) |

## Relatórios

| Rota | Campos lidos | Onde aparece | Fonte |
|---|---|---|---|
| `GET /api/relatorios/folha?mes=` | `mes, titulo, frase, estado.aviso, numeros, derivados, funil, origens, campanhas, sem_campanha, horarios.leitura, gerado_em` | `#/folha` (A4 em uma página) | doc |
| `GET /api/relatorios/apresentacao?periodo=` | `periodo.rotulo, estado, telas[].{id, titulo, frase, numeros, etapas, nao_fecharam, origens, campanhas, itens}` | `#/apresentacao` | doc; `?periodo=` conferido no **código** (`rotas/relatorios.js` aceita `periodo` ou `de`/`ate`) |

## A conferir na integração
1. `hoje[].etapas` na /api/hoje (pedido à T2a); sem ele a linha fica sem os traços, arrumada.
2. Itens de `palavras` e `termos` da campanha aberta: conferidos no código, não na doc.
3. Gestor: só o servidor de mentira foi usado; o formato é o do API-gestor.md, mas o fluxo de verdade não rodou aqui.
4. `/api/integracoes` e `/api/config`: rotas antigas, sem doc nova; conferidas no código.
