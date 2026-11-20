# Melhorias — Central de Tráfego Pago

Uma linha por melhoria. Só entra o que ficou feito e verificado.

## 09/10/2026 — rodada do ecossistema (pedido do João)

### Repositório e entrega
1. `git init` com `.gitignore` (node_modules, .env, logs, backups, .claude), `.gitattributes` (LF) e `.env.exemplo` sem valores; commit inicial preservando o estado de 15/09 (com o relatório comentado) antes de qualquer mudança.
2. Repositório privado `Jpfamelli/indycar-ads` criado e publicado no GitHub; conferido com `gh repo view` (PRIVATE) e `git ls-files | grep -c '^.env$'` = 0.
3. `package.json` 0.2.0 com `npm test` (node:test) e `npm run mock`.

### Relatório diário e configuração (desligamento por configuração)
4. `agenda.js`: relatório diário restaurado (descomentado) e governado por `decidirRelatorio(cfg, hora)` — só envia com `relatorio_ativo === true`, destino cadastrado e hora chegada; config que não carrega = nenhum envio (nem radar) naquele ciclo; motivo exposto em `estado.relatorio` e na tela.
5. `db.lerConfig` normaliza `relatorio_ativo` (opt-in: só `true` gravado liga), `alertas_ativos`, `relatorio_hora` e `alertas_intervalo_min`, com cache de 60 s invalidado ao salvar.
6. `relatorio.gerarEEnviar`: envio só com `relatorio_ativo === true` e destinos; devolve `motivo_sem_envio` e grava o motivo em `ads_relatorios.erro`.
7. Falha de envio do relatório automático só é retentada uma vez por hora (não a cada ciclo de 15 min) — coberto por teste com dublês do banco e do envio.
8. Tela Ajustes → cartão "Avisos no WhatsApp" com três linhas de estado: *Relatório diário no WhatsApp: ligado/desligado (· às Xh)*, *Alertas do radar: ligado/desligado (· a cada N min)* e os destinos formatados ou "sem destino — nada é enviado, nem relatório nem alertas".
9. Tela Relatórios: botão "Enviar no WhatsApp" travado com o motivo ao lado quando o envio está desligado ou sem número; a prévia segue funcionando.
10. `validarConfig` no servidor: hora 0–23, intervalo 15–1440, margem 0–100, números ≥ 0, destinos normalizados (55+DDD), sem duplicata, só 12–15 dígitos, máximo 10; booleanos só com `true` de verdade — erro 400 com frase; o POST devolve a config fresca.

### WhatsApp (unificado com o ecossistema)
11. `whatsapp.js`: envio primeiro pelo aparelho do CodeWords (`agenda_ia_config.cw_api_key` + `codewords_config.device_id`, `Authorization` com a chave crua, corpo `application/x-www-form-urlencoded`, sucesso só com `success` na resposta) e Cloud API da Meta como reserva; os erros dos dois canais vêm juntos na mensagem.
12. 401 do CodeWords vira "chave do CodeWords recusada (401) — gere uma chave nova em Atendimento › Configurações" (no envio e na conferência do canal).
13. `whatsapp.status()` consulta `/connections` do CodeWords e a reserva (cache 60 s) → `GET /api/whatsapp/status`; cartão "Canal de envio" em Ajustes com *Conferir canal* e *Enviar teste* (`POST /api/whatsapp/testar`, exige destino cadastrado e confirmação).

### Saúde e ecossistema
14. `GET /api/ping` público devolvendo só `{ok:true}` (para o vigia); `render.yaml` com `healthCheckPath: /api/ping`.
15. `GET /api/saude` (com login) lê `vigia_estado` (problema, desde, checado_em, resumo; cache 30 s) e devolve junto o estado do piloto, IA, Supabase e modo demonstração.
16. Faixa discreta de saúde no topo da tela quando `problema` não é nulo, com o código do vigia traduzido (CodeWords fora, WhatsApp desconectado, Atendimento/Agenda fora do ar…) e "desde · conferido"; some quando o problema é nulo (`?saude=ok` no mock).
17. Seletor "Ecossistema IndyCar" na barra lateral: Agenda · CRM · Atendimento · Comunicar · Tráfego pago (· você está aqui) · Orçador · Site — troca de sistema ao escolher.
18. Cartão "Piloto automático" mostra último sync/radar/relatório, o motivo de o relatório não ter saído e se está em modo demonstração.

### Servidor
19. Tabela de rotas: 404 e 405 (com cabeçalho `Allow`) em JSON; `ErroHttp` com status certo; 400 para JSON inválido; 413 para corpo acima de 1 MB — recusado pelo `Content-Length` antes do login e também durante a leitura.
20. Log de cada chamada de API com método, rota, status e duração em ms (`/api/ping` fora do log para o vigia não sujar).
21. Encerramento educado em SIGTERM/SIGINT: para os timers, fecha o servidor, sai 0; limite de 8 s.
22. Cabeçalhos de segurança em toda resposta (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`); `Cache-Control: no-store` na API, `no-cache` no HTML e 5 min em CSS/JS; proteção contra path traversal com `path.normalize` e `decodeURIComponent` seguro.
23. `server.js` só sobe quando executado direto (`require.main`) e exporta `servidor`, `validarConfig`, `periodoDaQuery` para os testes; `periodoDaQuery` recusa `de > ate`.
24. `POST /api/regras` valida com `radar.validarRegra` (métrica, operador, valor, janela 1–90, cooldown 1–720, mínimos ≥ 0, severidade, id) — 400 com frase.

### Radar
25. `avaliarRegra` extraída como função pura (pisos, métrica sem base, agrupamento por entidade, cooldown, mapa de disparos mutável) e usada por `rodar()`; `motivo_sem_envio` passa a incluir falha de envio.

### Testes e ferramentas
26. `npm test`: 59 testes em 6 arquivos — métricas (divisões por zero, variação, formato pt-BR), radar (regra, pisos, janela, cooldown, texto, validação), whatsapp (CodeWords/Cloud/401 com `fetch` dublê), agenda (decisão e ciclo completo com dublês), servidor (ping, 401, 405, 413, estáticos, validarConfig).
27. `scripts/mock-server.mjs` (porta 3411): a tela real sem login, com números inventados passando pelo `metricas.js` de verdade; `?vazio=1` para estados vazios e `?saude=ok` para a faixa escondida.

### Tela
28. Tema claro/escuro com a regra da casa: variáveis de cor, `body` sem transition, `<html data-trocando-tema>` por um quadro ao trocar, preferência em `localStorage` aplicada antes do CSS pintar, `theme-color` acompanhando; gráficos SVG seguem o tema por classes.
29. 375 px sem rolagem horizontal (`minmax(0,1fr)` na grade, `min-width:0` na lateral, barra lateral vira cabeçalho com abas roláveis, KPIs em 2 colunas, botão Atualizar em linha própria) — medido pelo DOM (`scrollWidth` = 375 nas abas Painel, Radar e Ajustes).
30. Acessibilidade: link "Pular para o conteúdo", `aria-current` na aba ativa, `role=status`/`aria-live` na faixa e no aviso, regras viram `<button>` com `aria-label`, `progressbar` no orçamento do mês, `aria-busy` em botão ocupado, `:focus-visible`, `type="button"` em todos os botões, `role=alert` nos recados.
31. Validação da regra na tela com o mesmo contrato do servidor: recado dentro do modal e foco no campo errado (nome vazio, valor vazio, janela fora de 1–90…); erros devolvidos pelo servidor também aparecem no modal.
32. Estados vazios explicam o modo demonstração em uma frase (gráficos, campanhas, criativos, alertas, integrações).
33. `esc()` em todos os templates — operador, severidade, id e plataforma das regras e alertas entravam crus no HTML (`<` quebrava a lista de regras).
34. Telefones exibidos como `+55 12 97403-2299` (`fmtTel`) nos avisos, no canal e no campo de destinos; o servidor continua guardando só dígitos.

### Documentação e publicação
35. `LEIA-ME.md` reescrito: como rodar, testar e usar o mock; como publicar no Render (free sem piloto, rotas `/api/cron/*` por agendador); a decisão do relatório desligado, por que o padrão é não enviar e como religar; canal de WhatsApp; saúde do ecossistema; tabela de rotas e erros.
36. `.env.exemplo` sem valores, com `ADS_MODELO_IA` e `ADS_AUTOMATICO=0` por padrão; `render.yaml` com `ADS_DEMO=1` e o comentário sobre o relatório desligado.

## Rodada 2 (09/10/2026)

Começou com o Codex (13:27, parou por limite com 9 arquivos sem commit: rota de CSV, atribuição e aba de resultados). O trabalho dele foi revisado e aproveitado como base; o que estava incompleto foi terminado.

### Conectividade com o CRM (ROI real)
37. Aba **Resultados CRM** (base do Codex, terminada): coorte de leads criados no período (horário de Brasília) com o status de hoje, por canal e por campanha, separada dos números das plataformas.
38. Funil do anúncio à venda: leads → agendaram (agendamento não cancelado do lead) → vieram à oficina → venda fechada, com taxa de passagem e % do total.
39. Conversas no WhatsApp contadas pelo `cliente_id` da conversa, mostradas fora da escada do funil (no banco real só 1 de 41 leads pagos tem conversa; "3900% da etapa anterior" mentia); taxa acima de 100% vira "—".
40. Custo por lead, **custo por agendamento** e **custo por venda fechada** por canal e campanha; ROAS real e ROI com a margem de Ajustes.
41. Venda concluída sem `valor_pago` **não vira R$ 0 de receita**: receita, ROAS, ticket e ROI ficam "sem valor lançado" e sobe um aviso (no banco real: 19 de 19 vendas pagas sem valor); receita parcial ganha asterisco e ticket só sobre as vendas com valor.
42. Grupo sem investimento (leads sem UTM) mostra custo "—", não R$ 0,00.
43. Comparação com o período anterior de mesmo tamanho (leads, agendamentos, vendas, investido, custos) com setas e cor certa (custo que cai é verde).
44. Metas do mês de agendamentos e de vendas com barra, ritmo e projeção ("Abaixo do ritmo: projeção de 59, faltam 103"); sugestão de meta pelo orçamento ÷ CPA alvo de Ajustes.
45. Avisos de atribuição: canal sem UTM (um aviso por canal, em vez de acusar "sem lead" em toda campanha), campanha que gastou ≥ R$ 150 sem lead no CRM, custo por agendamento acima do CPA alvo, custo por venda acima do dobro do alvo, vendas sem valor e leads de canais não pagos fora da conta.
46. Guia curto de UTM (Meta e Google) com a regra do nome igual ao do Gerenciador e o lembrete de lançar o valor pago; link para o CRM.
47. Nome da campanha exibido como está no Gerenciador (a chave de casamento continua sem acento/caixa).
48. Leitura do CRM paginada (1.000 por vez, teto 50 mil) e agendamentos/conversas lidos em lotes de 150 ids (URL do `in` não estoura); nenhum id ou dado de cliente sai na resposta (conferido no banco real).
49. Faixa "investimento de demonstração × CRM real" quando o gasto é todo `demo`.
50. Painel › Plataforma × CRM: receita "sem valor lançado" quando todas as vendas estão sem valor, asterisco quando é parcial, e frase com atalho para Resultados CRM.
51. `leadsPorCanal` (Painel e relatório) passou a usar o dia de Brasília (`-03:00`) e conta vendas sem valor; relatório do WhatsApp escreve "sem valor lançado" em vez de R$ 0,00.

### Radar
52. Alerta novo **Campanha sem lead no CRM** (gastou e não gerou lead, quando o canal usa UTM).
53. Alerta novo **Custo por agendamento alto** (acima do CPA alvo, com ≥ 2 agendamentos) e **Custo por venda alto** (crítico, ≥ 3 vendas e mais que o dobro do alvo).
54. Alertas do CRM entram em `ads_alertas` no formato do enum (plataforma/nível), com cooldown de 24 h por campanha e tipo, sem duplicar na mesma rodada; falha do CRM não derruba o radar (`erro_crm` na resposta e no aviso do "Testar agora").

### Exportar
55. CSV de Resultados CRM (`/api/resultados.csv`): BOM, ponto e vírgula, vírgula decimal (abre certo no Excel pt-BR), fórmula neutralizada (`=`, `+`, `-`, `@`), total por canal, "sem valor lançado" e nome do arquivo com o período.
56. CSV de campanhas e de criativos (`/api/ranking.csv`) com as mesmas contas da tela; botão "Exportar CSV" nas duas abas.
57. Download autenticado pela tela respeitando o nome do arquivo do servidor; sessão vencida devolve ao login.

### Conexões Meta e Google
58. Guia curto na tela para **colar o token da Meta** (onde gerar, permissão `ads_read`, longa duração, número da conta).
59. Guia curto para **colar as chaves do Google Ads** (developer token, client ID/secret, refresh token, ID do cliente e MCC).
60. "Testar sem salvar" usa o que foi colado por cima do que está gravado e não grava nada; "Salvar" grava em `integracoes_ads` (a mesma do CRM) e campo vazio mantém o valor antigo; senhas limpas depois de salvar; token nunca volta pela API.
61. Validação de formato antes de chamar a plataforma (conta só dígitos com ou sem `act_`, token sem espaço, customer id com 10 dígitos, client id `.apps.googleusercontent.com`).
62. Erro cru traduzido em título + o que fazer: Meta 190 (token vencido), 200/10 (sem `ads_read`), 100 (conta errada), limite de chamadas; Google `invalid_grant`, `invalid_client`, developer token não aprovado/inválido, MCC faltando, conta não encontrada, rede/timeout; "mensagem técnica" recolhida e sem token (`semSegredo`).
63. "Testar conexões" mostra os dois canais em cartões, inclusive "Google ainda não conectado" (antes ficava em silêncio); conferido no banco real.
64. Aviso de token da Meta vencendo (≤ 10 dias) ou vencido na lista de conexões, a partir de `meta_token_expira_em`.
65. Cache do access token do Google por credencial (trocar o refresh token não reaproveita o token antigo) e timeout de 20 s nas chamadas da Meta e do Google.

### IA
66. **Leitura da semana** sob demanda no Painel: 3 frases (o que aconteceu, por quê, o que fazer) sobre os 7 dias fechados, com plataformas, metas, campanhas, CRM, alertas e o estado das conexões; só sugere, não mexe em campanha.
67. Modelo lido de `ia_config.modelo_rapido` (cache 60 s, reserva `claude-sonnet-5-5`); respeita `ia_config.ativo`, `limite_chamadas_dia` e `instrucoes_extras`; system com prompt caching; dados cercados por marca aleatória e tratados como DADO.
68. Toda leitura (e todo erro) registrada em `ia_acoes` com origem `sistema`, tipo `ads_leitura_semana`, modelo, tokens e duração; última leitura reaparece ao abrir o painel.
69. Correção: `claude-sonnet-5-5` gastava o `max_tokens` inteiro pensando e devolvia texto vazio — `thinking: between_tools` na leitura e no relatório diário (verificado com chamada real).
70. Relatório diário passou a usar o modelo de `ia_config` (o padrão antigo `claude-sonnet-5` não existe), prompt caching, timeout de 30 s e a regra "venda sem valor não é receita zero".
71. Texto da IA limpo de markdown, no máximo 3 frases de até 30 palavras, cortado no espaço com reticências.

### Tela, acessibilidade e demonstração
72. Gráficos com "Ver em tabela" (os mesmos números em tabela) e `aria-label` com o resumo do período.
73. Número do KPI nunca quebra no meio ("R$ 2.239,0 / 6"): encolhe com `clamp` e `nowrap`; 2 colunas no celular.
74. Tabelas novas com `scope` nos cabeçalhos, região rolável focável, `aria-busy` durante a leitura, `role=alert` nos erros e "Tentar de novo".
75. 375 px sem rolagem horizontal e tema claro nas abas Painel, Resultados CRM e Ajustes (medido pelo DOM: `scrollWidth` = 375 e 1366); nenhum erro de console.
76. `type="button"` em todas as abas; Resultados CRM logo depois do Painel.
77. Demonstração mais realista: PMax pausada 5 dias no meio do período, verba subindo ~1% por semana, e a demonstração é recriada do zero (apaga só `demo` antes).
78. Mock (porta 3411) com coorte inventada de oficina (conversa, agendamento, falta, venda com e sem valor), leitura de IA, teste de conexão e CSV.

### Servidor e testes
79. `periodoDaQuery` estrito: data inexistente, só um lado, invertida ou mais de 365 dias = 400 com frase (antes caía em silêncio para "últimos 7 dias").
80. Rotas novas: `GET /api/resultados(.csv)`, `GET /api/ranking.csv`, `POST /api/ia/leitura`, `GET /api/ia/leituras`, `POST /api/integracoes/testar`, `POST /api/integracoes`; `/api/saude` informa o modelo da IA.
81. `npm test`: 93 testes (eram 59) — atribuição e funil, CSV, conexões (tradução, formato, sem vazar token), leitura com cliente falso (modelo, cache, cerca de dados, limite, IA desligada, erro registrado), alertas do CRM no radar e login nas rotas novas.

## Rodada 3 (13/10/2026)

Pedido do João: segurança, login, perfil, acesso por app, equipe, automações e testes. Nada publicado no Render; relatório diário continua desligado.

### Login, perfil e acesso (padrão do ecossistema)
1. Regra de acesso nova: admin sempre; gestor só com `ads` em `perfis.apps`; atendente e agenda ficam fora mesmo com `ads` na lista (antes entrava admin/dono/gestor sem olhar `apps`; no banco real o atendente com `ads` agora é barrado).
2. O servidor confere o acesso em TODA rota e devolve 403 `sem_acesso` com os links dos apps que a pessoa pode usar.
3. Tela "Você não tem acesso a este app" com botões para os apps da pessoa (papel agenda vê só a Agenda).
4. Usuário desativado no meio do uso: 403 `desativado` e a tela volta ao login com o aviso; cache do porteiro caiu de 60 s para 30 s.
5. Sessão vencida: 401 `sessao_vencida` volta ao login com aviso; o token é renovado sozinho antes de cada chamada.
6. Login com mostrar/ocultar senha, aviso de Caps Lock e "Lembrar meu e-mail".
7. Mensagens claras no login (senha errada, e-mail não confirmado, desativado, sem internet, limite) e espera progressiva depois de 5 erros seguidos (15 s dobrando até 5 min).
8. "Esqueci a senha" (`resetPasswordForEmail` com volta para este app), resposta neutra e aviso do limite de e-mails do plano gratuito.
9. Volta do link de recuperação (`PASSWORD_RECOVERY`) abre a tela de senha nova.
10. Troca obrigatória (`precisa_trocar_senha`): tela de senha nova (mínimo 8, diferente do e-mail, repetir); o servidor bloqueia o resto com 403 `trocar_senha` e `/api/eu/senha-trocada` desliga a marca (auditado).
11. Verificação em duas etapas (TOTP) em Minha conta: QR code + chave, ativar com código, desligar; restos não verificados são limpos antes.
12. Login com duas etapas: código pedido depois da senha; o servidor só aceita sessão `aal2` de quem tem fator verificado (403 `mfa`).
13. Menu da conta no rodapé da lateral (avatar com iniciais e cor): Meu perfil, Minhas tarefas, Trocar senha, Duas etapas, Notificações, tema, Sair e Sair de todos os aparelhos.
14. `GET/POST /api/eu`: perfil sem segredo; nome/cargo/telefone/cor validados; papel e apps nunca passam; preferências mescladas sem apagar as de outros apps.
15. Último acesso (`ultimo_acesso_em`, `ultimo_app='ads'`) gravado pelo servidor no máximo a cada 5 min por pessoa.
16. Sino de notificações: só as minhas (RLS), ao vivo (realtime), contador, marcar lida e todas, links resolvidos pelo app de origem (só domínios do ecossistema).
17. Minhas tarefas: abertas comigo, atrasada destacada, criar com prazo, concluir; contador no menu.
18. Link `/?aba=radar` (das notificações) abre direto na aba certa.

### Equipe e metas
19. Resultados por responsável (`leads.responsavel_id`) na aba Resultados CRM: leads, agendaram, vieram, vendas, conversão, perdidos e receita por vendedor, selo "melhor conversão", "Sem responsável" e pessoa desativada marcada; só o nome sai do servidor (conferido no banco real: hoje os 36 leads pagos de 30 dias estão sem responsável).
20. Metas de marketing na tabela `metas` (loja = `perfil_id` nulo): leads, agendamentos e vendas do mês, com barra, ritmo e projeção; `GET/POST /api/metas`; vistas pela equipe toda.
21. Metas antigas guardadas no navegador sobem para o banco uma vez, sozinhas.

### Automações
22. Alerta do radar vira notificação no sino de quem pode abrir o Ads (rpc `notificar`, chave `ads-alerta-<id>`), além do registro em `ads_alertas`; "Testar agora" não notifica.
23. Resumo semanal de campanhas no sino: segunda a partir das 8h pelo piloto ou `POST /api/cron/semanal`, chave `ads-semana-<segunda>` (não repete); investido e variação, leads/agendamentos/vendas do CRM, custo por agendamento, melhor CPA e campanha que gastou sem converter. Não vai por WhatsApp.
24. Botão "Ver o resumo agora" (Relatórios) manda o resumo só para quem clicou.
25. Preferências de notificação por pessoa (alertas do radar, resumo semanal) respeitadas pelo servidor.

### Segurança do servidor
26. Cabeçalhos: CSP completa (script só daqui, `frame-ancestors 'none'`), HSTS, Permissions-Policy, COOP/CORP e Referrer-Policy `strict-origin-when-cross-origin`.
27. Cliente do Supabase servido do `node_modules` (`/vendor/supabase.js`, sem CDN) e tema em `tema.js` — a CSP não precisa de script embutido; conferido no servidor real sem nenhum erro de CSP.
28. CORS só para os domínios do ecossistema e localhost (origem de fora = 403; OPTIONS = 204).
29. Limite de 300 chamadas/min por IP e limite por pessoa nas rotas caras (IA 6/10 min, sync, testes de conexão, WhatsApp, relatório, CSV, demonstração) com 429 e `Retry-After`.
30. Erro 5xx não vaza detalhe interno (vai para o log; a tela recebe frase de gente); UUID validado em regras e em "marcar alertas lidos".
31. Auditoria (`registrar_auditoria`, app `ads`): salvar token Meta/Google (só os nomes dos campos), mudar Ajustes (telefones mascarados), criar/alterar/apagar regra, exportar CSV, apagar demonstração, enviar relatório na mão, testar WhatsApp, salvar meta e trocar senha.
32. `npm run segredos` (varre os arquivos do git; testado com chave falsa — acusa e sai com 1) e `npm run auditar`; `npm audit`: 0 vulnerabilidades.

### Testes
33. `npm test`: 127 testes (eram 93) — papéis no servidor (admin, gestor, gestor sem ads, atendente, agenda, desativado, vencido, troca de senha, duas etapas aal1/aal2), CORS, limites, cabeçalhos, erro sem detalhe, auditoria, equipe por responsável, metas, resumo semanal e alerta virando notificação.
34. Mock com papéis (`?papel=…`, `?logado=0`) e dublê do Supabase com duas etapas, sino e tarefas; roteiro de navegador (puppeteer + Chrome, 1440 e 375 px) com 56 checagens, todas ok e sem erro de console.

## Rodada 4 (14/10/2026)

Pedido do João: o Render gratuito deu 503 "hibernate-wake-error" por ~5 min em 14/10 — o app precisa lidar bem com isso; guia de conexão Meta/Google ainda mais simples; testes. **Nada publicado no Render; relatório diário continua desligado.** Verificado com `npm test` (141 testes) e `npm run e2e:tela` (32 conferências no Chrome, 1440 e 375 px, com o mock respondendo 503 de propósito).

### Servidor acordando
1. Faixa "O sistema está acordando" por cima da tela (no login e no app): explica que o servidor gratuito dorme, mostra "tento de novo em X s (tentativa N)" e "há X min", e diz que o que está na tela continua aqui.
2. Leituras (GET) que pegam 502/503/504, 408/429/52x ou queda de rede tentam de novo sozinhas com espera crescente (2 s, 5 s, 10 s, 20 s, 40 s, 1 min, 1 min ≈ 3 min) — antes era "Erro 503" na hora.
3. "Tentar agora" (e a internet voltando) corta a espera e tenta na hora.
4. Quando responde de novo: aviso "O sistema acordou. Pode continuar de onde parou." e a faixa some.
5. Gravações (POST) nunca repetem sozinhas (nada de salvar duas vezes): falham com frase de gente e o que foi digitado fica no formulário.
6. 502/503/504 do Render (página HTML, sem o `{ erro }` do nosso servidor) viram "O sistema está acordando…" — nunca "Erro 503", "hibernate" ou "Service Unavailable" na tela.
7. Tela de entrar: a configuração pública (`/api/config-publica`) também tenta de novo com a faixa; quando o servidor acorda, o formulário aparece sozinho.
8. Service worker (`public/sw.js`): a casca do app (HTML, CSS, JS, cliente do Supabase e fontes) abre do aparelho quando o servidor dorme, demora mais de 6 s ou responde 5xx — em vez da página de erro do Render. `/api/*` e o Supabase nunca passam por ele.

### Velocidade
9. Respostas JSON acima de 1 KB vão com gzip quando o navegador aceita (painel, ranking, resultados).
10. Arquivos da tela ficam na memória do servidor já comprimidos (relidos só se mudarem): o cliente do Supabase (~200 KB) sai com ~55 KB.
11. `sw.js` servido sem cache (a versão nova chega na hora); `Vary: Accept-Encoding` em tudo que pode ir comprimido.
12. Fontes no próprio app (DM Sans e Barlow Condensed, subconjunto latino) com preload: nada do Google, e a CSP fechou `style-src`/`font-src` em 'self'.

### Guia de conexão Meta/Google (mais simples)
13. "Ligar a Meta" em 4 passos com marca de feito: número da conta, token com ads_read, conexão testada, token dentro da validade.
14. "Ligar o Google Ads" em 5 passos: ID do cliente, developer token, Client ID e secret, refresh token, conexão testada.
15. O título de cada guia mostra o progresso ("2 de 4 passos" / "pronto") mesmo fechado, e o próximo passo fica destacado.
16. Só o que falta aparece com a explicação de onde achar; o último teste com erro manda "Testar sem salvar" para ver o que fazer.
17. Token da Meta vencendo em até 7 dias (ou vencido) vira passo pendente com "vence em X dia(s)".
18. "Copiar mensagem pedindo o que falta": texto pronto para mandar no WhatsApp de quem cuida das contas (sem segredo, avisa que não precisa mandar senha).
19. Links diretos: Meta for Developers, Gerenciador de Anúncios, Google Ads, Credenciais do Google Cloud e OAuth Playground.
20. `/api/integracoes` passou a dizer sim/não por campo (conta, developer token, OAuth, refresh, MCC) — nunca o valor (teste confere que nenhum segredo sai).

### Perfil e acessibilidade
21. Preferências de notificação: o servidor relê `perfis.preferencias` e muda só "notificacoes"; se a releitura falhar, não grava nada (antes gravava em cima de `{}` e apagava o que a Agenda, o CRM e o Orçador guardaram).
22. Vermelho de texto com contraste AA (`--vermelho-txt`) em links, pílulas "desligado", marca da lateral e links dos guias (antes 3,5–4,0:1).
23. Iniciais do avatar com contraste AA: a cor escolhida continua, com o fundo escurecido (antes 3,7:1).
24. Regras desligadas do radar continuam "apagadas", mas legíveis (antes 2:1).
25. Tabelas que rolam de lado alcançáveis pelo teclado e com nome para o leitor de tela (axe: scrollable-region-focusable).

### Testes
26. `tests/rodada4.test.js` (14 testes): regras de nova tentativa, frases, guia Meta/Google (validade, erro, mensagem sem segredo), integração mascarada sem segredo, gzip e memória dos estáticos, preferências (mescla e não grava sem releitura) e o servidor real (sw.js sem cache, gzip, fontes, CSP sem Google, faixa no HTML).
27. `npm run e2e:tela` (`scripts/roteiro-navegador.mjs`): sobe o mock e confere no Chrome em 1440 e 375 px o servidor acordando (`?acordando=N` responde 503 como o Render), o aviso de volta, o login acordando, o guia em passos, fontes locais, sem rolagem lateral, sem erro de JS e axe-core (WCAG 2.1 AA) em Painel, Resultados, Radar e Ajustes.

## Rodada 5 (16/10/2026)

Pedido do João (rodada 5, onda A): fechar o ciclo anúncio → lead → venda, padrão de login/acesso completo com `usuario_pode('ads')` no servidor, relatório e alertas pela fila do Comunicar (nada de CodeWords direto), modo "sem chaves" com demonstração marcada, operação profissional (atalhos, busca, estados vazios, CSV com filtro, 375 px, tema). **Nada publicado no Render; relatório diário continua desligado por configuração.** Verificado com `npm test` (159 testes, verdes em rodadas seguidas), `npm run e2e:tela` (75 conferências no Chrome, 1440 e 375 px, axe-core AA) e leitura só-leitura do banco real (leads, fila, vigia, chaves); gravação na fila do Comunicar ensaiada em DO-block revertido (insere, bloqueia a duplicata, desfaz).

### Endereços dos apps num lugar só
1. `public/ecossistema.js`: um arquivo (UMD, serve ao servidor e à tela) com os endereços de Agenda, CRM, Atendimento, Comunicar, Ads, Orçador, Pátio e Site — na onda B2 troca-se só ele.
2. Links cruzados prontos no formato que os apps entendem: `linkLead` (`?lead=`), `linkClienteCRM`, `linkTelCRM`, `linkConversa`, `linkConversaTel` (`?tel=`), `linkAgendaTel`, `linkAgendamento` (`?agendamento=`), `linkComunicarTel`, `linkOrcadorTel`.
3. Telefone normalizado do ecossistema (`55DDDNÚMERO`) numa função só (`Ecossistema.telefone`), usada pelo WhatsApp, pelos leads e pela busca.
4. `equipe.js` monta a lista "apps da pessoa" a partir do ecossistema (o Pátio entrou sozinho na tela "sem acesso").
5. CORS do servidor (`seguranca.js`) lê as origens do mesmo arquivo — o Pátio passou a poder chamar a API.
6. `conta.js`: origens das notificações e `linkDaNotificacao` vêm do ecossistema; link de fora do ecossistema (ou `//evil`) vai para a raiz (testado).
7. Seletor "Ecossistema IndyCar" da lateral montado a partir da ordem do arquivo (ganhou o Pátio).
8. Links fixos do HTML ("Abrir o CRM", "Abrir o Comunicar") viram `data-eco` preenchidos na hora pelo arquivo central — nenhum endereço duplicado na página.

### Fila do Comunicar (nada de CodeWords direto)
9. `fila.js`: relatório diário, alertas do radar e teste de canal entram em `posvenda_envios` com `criado_por 'ads'`, `tipo 'avulsa'`, `status 'pendente'`, `enviar_em` agora — o carteiro do Comunicar entrega (horário, tentativas e opt-out PARAR respeitados).
10. `chave_unica` por mensagem e telefone (`ads:relatorio:<data>:<tel>`, `ads:radar:<alerta>:<tel>`, `ads:teste:<hora>:<tel>`): o mesmo relatório nunca vai duas vezes para o mesmo número; duplicata (23505) devolve `duplicada: true` em vez de erro.
11. `whatsapp.js` reescrito como casca da fila: `enviar`/`enviarParaTodos` mantêm a assinatura, "ok" passa a significar "entrou na fila"; o código do CodeWords e da Cloud API saiu do app (menos superfície, nenhuma chave lida).
12. Corpo cortado em 3.900 caracteres (abaixo do teto do CodeWords) e telefone validado (12–15 dígitos) antes de gravar; um número ruim não impede os outros.
13. `perfil_id` de quem clicou vai em `criado_por_id` no teste manual (rastreável no Comunicar).
14. `whatsapp.status()` não consulta mais o CodeWords: lê o problema do vigia (`vigia_estado`) e a fila do Ads; traduz `codewords-chave-recusada`, `codewords-fora`, `whatsapp-desconectado`, `whatsapp-sem-config`, `whatsapp-sem-receber`, `comunicar-fora`, `comunicar-carteiro-parado`, `comunicar-fila-parada` para frases com o que fazer.
15. `fila.situacao()`: contagem por status, última entrega, última falha e as 20 mensagens mais recentes deste painel → `GET /api/fila` e `GET /api/saude.fila`.
16. Relatório com números de demonstração **não vai por WhatsApp** (motivo escrito: "números de demonstração não vão por WhatsApp"); `ADS_DEMO_ENVIA=1` só para ensaiar o caminho da fila.
17. Alertas enviados marcam `enviado_em` quando entram na fila; o texto do radar passa pelo vocabulário da casa.
18. Ajustes → Canal de envio reescrito: diz que o caminho é a fila do Comunicar, mostra "no ar / com problema", quantas mensagens estão na fila / enviadas / falharam, última entrega e última falha, e o botão virou "Pôr um teste na fila" com link "Abrir o Comunicar".
19. "Últimas mensagens que este painel pôs na fila": tabela com quando, para quem (formatado), situação (pílula) e detalhe (erro ou a chave sem o telefone).
20. Relatórios: histórico mostra "na fila do Comunicar" em vez de "enviado"; os avisos de envio e de teste explicam que sai no próximo ciclo do carteiro (a cada 15 min, 8h–21h).
21. Ensaio contra o banco real em DO-block revertido: a linha no formato do `fila.js` entra (status pendente) e a segunda com a mesma chave é bloqueada pela unicidade — nada ficou gravado.

### Leads — do anúncio (ou do site e do WhatsApp) ao CRM
22. `leads.js`: lê `leads` do CRM por período (horário de Brasília), com colunas explícitas (sem observações), paginando até 5 mil.
23. Canal do lead para a tela: pago (Meta/Google) pela mesma regra de atribuição; `site` pela `utm_source`; senão a origem do CRM (whatsapp, indicação, orgânico, telefone); desconhecido vira "outro".
24. Cada lead vem com o agendamento mais recente (data, hora, status; cancelado não conta), o nome do responsável (só o nome) e os links CRM / Atendimento / Agenda / Comunicar prontos.
25. Venda concluída sem `valor_pago` vem marcada `sem_valor` (nunca vira R$ 0); orçamento aparece como "orç. R$ X" enquanto não fecha.
26. `GET /api/leads?de&ate|dias&canal&status&q&pagos=1&sem_responsavel=1&limite` — filtros validados contra listas fechadas; busca por nome, campanha, serviço, carro, responsável ou telefone (4+ dígitos).
27. `GET /api/leads/hoje`: contagens por canal e por status, sem responsável, vendas e os últimos 8 do dia.
28. `GET /api/leads.csv` com o mesmo filtro da tela (auditado em `registrar_auditoria`, até 5 mil linhas, BOM + ponto e vírgula + proteção contra fórmula, link do CRM em cada linha).
29. Rotas novas sob o mesmo porteiro: gestor sem `ads`, atendente e papel agenda recebem 403 `sem_acesso`; sem token 401; período inválido 400 antes de tocar no banco (testado).
30. Aba **Leads** nova (atalho `2`): busca, canal (todos / só anúncios / Meta / Google / site / WhatsApp / indicação / orgânico / telefone), status, "quando" (hoje, ontem, 7, 30 dias ou o período do topo), "só sem responsável", Filtrar / Limpar / Exportar CSV.
31. Seis KPIs clicáveis que aplicam o filtro (Leads, Site, WhatsApp, Anúncios com Meta × Google, Vendas com "N sem valor", Sem responsável com "distribua no CRM").
32. Tabela com quando ("hoje 14:17", "ontem 09:51"), lead (nome, telefone formatado, carro), canal + campanha (UTM), status (selo colorido) + serviço, agendamento, valor, responsável e três botões por linha: **CRM** (`?lead=`), **WhatsApp** (Atendimento `?tel=`), **Agenda** (`?agendamento=`) ou **Agendar** (`?tel=`).
33. Linha de estado: período, quantos leads, "de N no período (filtro aplicado)" e aviso quando a lista foi cortada.
34. Estados vazios que ensinam: com filtro ("Nenhum lead com esses filtros · Limpar filtros") e sem filtro (como os leads entram: site, WhatsApp, anúncios com UTM; "crie um lead no CRM: aparece aqui na hora").
35. Falha de leitura vira recado com "Tentar de novo" (nunca "zero leads").
36. Em 375 px cada lead vira um **cartão** (nome, telefone, quando, canal, status, agendamento, valor, responsável e os botões), sem tabela de oito colunas rolando de lado.
37. **Painel → "Leads de hoje no CRM"**: total do dia, "N sem responsável" (clicável: abre a lista já filtrada), chips por canal clicáveis, os últimos cinco com link para o CRM, botões "Ver a lista" e "Abrir o CRM".
38. Pino verde "Leads" na navegação com a contagem do dia.
39. Painel → tabela "Plataforma × CRM" ganhou "ver leads" por canal (abre a aba Leads no período do topo).
40. `leads.fraseDoDia`: "N lead(s) novo(s) no CRM: 2 do site, 1 pelo WhatsApp, 3 de anúncio (Meta 2 · Google 1). 2 sem responsável." — usada no relatório diário.
41. Leitura só-leitura no banco real: 117 leads de 01/09 a 16/10 por canal (google 40, whatsapp 62, indicação 3, meta 4, orgânico 4, telefone 4), agendamento e links montados; todos sem responsável (pendência 5 da PASSAGEM, não é bug deste app).

### Ciclo fechado nas Campanhas (anúncio → lead → venda)
42. `atribuicao.juntarRankingComCRM` (pura, testada): cada campanha do ranking ganha o que o CRM viu dela — leads, agendamentos, vieram, vendas, receita, custo por lead, por agendamento, por venda e ROAS real — casando a `utm_campaign` com o nome da campanha sem acento/caixa.
43. Grupo do CRM só com gasto (nenhum lead casou) não vira "0 leads": a linha explica o motivo ("N lead(s) do canal sem utm_campaign" ou "nenhum lead com esta UTM no período").
44. `GET /api/ranking` (nível campanha) devolve as colunas do CRM; CRM fora não derruba o ranking (`crm: null`, `crm_motivo`); `crm=0` desliga.
45. Aba Campanhas: cinco colunas verdes **Leads CRM, Custo/lead, Vendas (asterisco = sem valor), Custo/venda, ROAS real** com a explicação de como casam; "ver os N lead(s)" abre a aba Leads filtrada pela campanha.
46. Rodapé da tabela quando nada casou: aponta para "Como marcar os anúncios (UTM)".
47. Campo "filtrar campanhas…" na aba (filtra as linhas pelo nome sem nova chamada; aviso quando nada casa).

### Relatório, resumo semanal e leitura da IA no vocabulário da casa
48. `vocabulario.js`: palavras proibidas (prezado, efetuar, comparecer, veículo e variações) → vocabulário da casa (olá, fazer, vir/veio/presença, carro), mantendo maiúscula; `conferir()` para os testes.
49. Relatório diário passa inteiro pelo vocabulário — inclusive a leitura escrita pela IA — e fecha com "Quem conhece, Indyca! 🏎".
50. Relatório ganhou o bloco "Leads de ontem no CRM" por canal (site, WhatsApp, anúncio), fechando o ciclo no texto que o dono lê.
51. Relatório com investimento só de demonstração avisa no topo "Números de DEMONSTRAÇÃO (fabricados)".
52. Texto do radar e título/corpo do resumo semanal passam pelo vocabulário (testado com "veículo" e "comparecimento").
53. Resumo semanal ganhou o funil inteiro: "No total N lead(s) novo(s) (site X, WhatsApp Y, anúncios Z), W sem responsável".
54. Leitura da semana (IA) recebe `leads_semana_todos_canais` (total, por canal, sem responsável) — a IA enxerga o funil inteiro, não só o pago.
55. Teste de canal com o slogan e sem jargão de API.

### Porteiro: `usuario_pode('ads')` conferido no banco
56. `auth.podeNoBanco(token, app)`: chama a rpc `usuario_pode` com o token da própria pessoa (RLS/função da casa), 6 s de timeout; devolve true/false ou null se não deu para perguntar (testado com fetch dublê: URL, Bearer e `p_app`).
57. `acessoAds`: "não" do banco manda (nem admin entra); null cai na regra local; atendente segue fora mesmo com "sim" do banco (regra de verba/margem).
58. `/api/eu` informa `acesso_conferido_no_banco` (a tela sabe se a decisão veio da função da casa).
59. Resultado fica no cache de 30 s do porteiro junto com o perfil (uma pergunta extra por sessão, não por clique).

### Modo sem chaves (demonstração marcada)
60. `db.classificarChave` (pura): token de exemplo que a plataforma recusou (`ultimo_sync_status` começando com "erro") **não conta como chave** — era o caso real da linha da Meta; `estadoChaves()` devolve meta/google = ok | recusada | sem_token.
61. `/api/saude` devolve `chaves`, `sem_chaves`, `tem_dados_reais` e a situação da fila.
62. Ao subir com `ADS_DEMO=1`, sem chave funcionando e sem dado nenhum, o servidor cria os 45 dias de demonstração sozinho (log explica; `semearDemoSePreciso` exportado).
63. Faixa "Modo demonstração" no topo (fechável por sessão) dizendo se falta colar a chave ou se a colada foi recusada, com link para Ajustes → Conexões.
64. Selo "demo" ao lado do título enquanto só houver dados fabricados; some sozinho quando entra dado real (`?chaves=1` no mock, conferido no roteiro).
65. Todo estado vazio traz o botão "Criar dados de demonstração" (sem ir a Ajustes); o texto da dica deixou de mandar "clicar em Popular 45 dias".
66. "Atualizar dados" no modo sem chaves não bate nas plataformas: explica o que falta e leva a Ajustes.
67. Ajustes → Conexões → "Onde pegar cada chave (guia curto)": seis linhas (conta e token da Meta; ID do cliente, developer token, Client ID/secret e refresh token do Google) com onde achar cada uma e o que fazer depois.
68. Piloto automático em Ajustes mostra "sem chaves de Meta/Google (modo demonstração)".
69. `.env.exemplo` explica o modo sem chaves e `ADS_DEMO_ENVIA`.

### Busca global, atalhos e ajuda
70. `public/busca.js` (puro, testado): filtro por começo > conteúdo > telefone (4+ dígitos) > todas as palavras em qualquer ordem, sem acento/caixa; `valeBuscarNoCRM` (3 letras ou 4 dígitos).
71. **Ctrl+K** (ou `/`) abre a busca em tudo: abas, ações (nova regra, trocar tema, atualizar, prévia do relatório, minha conta, minhas tarefas, ajuda), campanhas, criativos, regras, alertas, outros apps do ecossistema e **leads do CRM** (últimos 90 dias, debounce de 350 ms).
72. ↑↓ navega, Enter abre, Esc fecha, clique fora fecha; lead abre no CRM; "nenhum lead X" oferece abrir a aba Leads com a busca.
73. Botão "Buscar · Ctrl K" na lateral (compacto no celular).
74. Atalhos: `1`–`8` abas, `r` atualizar, `t` tema, `n` nova regra, `e` exportar CSV da aba, `p` imprimir, `?` ajuda, `Esc` fecha menu/busca/janela — nunca disparam dentro de campo de texto nem com janela aberta (regra pura testada).
75. Dica de tecla (`kbd`) em cada item da navegação ao passar o mouse/focar, e `title` nos botões com atalho.
76. Janela **Ajuda (?)** com a lista de atalhos e "Como faço…" (ver se o anúncio virou venda, achar lead pelo telefone, ligar Meta/Google, receber o relatório, parar alerta repetido, exportar).
77. A aba fica na URL (`?aba=leads`): recarregar ou mandar o link abre no mesmo lugar (o link do sino `?aba=radar` continua valendo).
78. Período do topo lembrado no navegador.
79. Tema segue o do aparelho (claro/escuro) até a pessoa escolher.
80. Impressão limpa (`Ctrl+P`/`p`): sem lateral, botões, faixas e janelas; cartões não quebram no meio; título ganha "— IndyCar · Tráfego pago".
81. No celular, trocar de aba volta ao topo da página.

### Radar e alertas
82. Interruptor liga/desliga em cada regra (role `switch`, `aria-checked`, rótulo "Ligar/Desligar a regra X") sem abrir o modal — `POST /api/regras/ativa` valida UUID, 404 se não existir, auditado.
83. "Duplicar" no modal da regra: cópia sem id, nome "(cópia)", salva como regra nova.
84. Filtro de severidade (críticos / alertas / informativos) e por plataforma na rota `GET /api/alertas` (validados contra listas fechadas).
85. `GET /api/alertas.csv` (auditado, limite 2 mil): quando, severidade, plataforma, regra, campanha/criativo, métrica, medido, limite, mensagem, na fila em, lido em.
86. Lista de alertas mostra "novo" no não lido e "na fila do WhatsApp" no enviado; data curta (dd/mm hh:mm).
87. Estados vazios do Radar explicam (dias fechados, "Testar agora", as sete regras prontas).
88. Regra desligada continua legível (contraste AA conferido pelo axe depois de ligar/desligar no roteiro).

### Segurança e servidor
89. Limite por pessoa nas exportações novas (`GET /api/leads.csv`, `GET /api/alertas.csv`: 30 em 10 min).
90. Exportar leads e alertas registra `ads_exportou_csv` na auditoria com o filtro usado.
91. Alterar `ativa` da regra registra `ads_regra_alterada` com nome e estado.
92. `db.temDadosReais()` e `db.temDados()` com `head: true` (contagem sem baixar linhas).
93. Service worker `ads-casca-v2`: casca inclui `ecossistema.js`, `busca.js` e `operacao.js` (o app abre do aparelho com o servidor dormindo, inclusive a aba Leads).
94. Faixa de saúde da tela conhece os códigos reais do vigia (`codewords-chave-recusada` — o problema em aberto desde 01/10 — além de `crm-fora`, `comunicar-fora`, `comunicar-carteiro-parado`, `comunicar-fila-parada`), cada um com a frase do que acontece e onde resolver.

### Testes e ferramentas
95. `tests/rodada5.test.js` (19 testes): ecossistema (links cruzados, origens, notificação), vocabulário, leads (canal, linha, filtros, listar com banco falso, CSV sem observações, frase do dia), ranking × CRM, `acessoAds` com `pode_ads`, `podeNoBanco`, relatório (leads de ontem, slogan, demo, vocabulário), radar/semanal no vocabulário, busca, atalhos, classificação de chaves, códigos do vigia.
96. `tests/whatsapp.test.js` reescrito para a fila (8 testes): linha gravada (criado_por, tipo, status, chave com telefone), duplicata, erro do banco, validações, corte em 3.900, situação e status do canal.
97. `tests/papeis.test.js`: rotas novas obedecem ao porteiro (403/401/400).
98. `scripts/leads-demo.cjs`: leads inventados (nomes, telefones, canais, UTMs, status, valores) passando pelo `leads.js` real.
99. Mock: `/api/leads`, `/api/leads/hoje`, `/api/leads.csv`, `/api/alertas.csv`, `/api/regras/ativa`, `/api/fila`, ranking com colunas do CRM, saúde com `chaves`/`sem_chaves`, canal de envio e relatório pela fila (em memória), `?chaves=1`.
100. `npm run e2e:tela` ampliado: 75 conferências (eram 32) — leads de hoje, faixa e selo demo, aba Leads (tabela, links `?lead=`, URL, filtro por canal, sem rolagem lateral), campanhas × CRM, interruptor e filtro do radar, canal pela fila e guia de chaves, atalho `1`, Ctrl+K com campanha e lead, `?` ajuda, `t` tema claro, `?chaves=1` sem faixa, axe-core AA também em Leads e Campanhas.
101. Dois ajustes de contraste achados pelo axe no roteiro (tecla `kbd` da lateral e regra desligada) corrigidos para AA.
102. `package.json` 0.5.0; LEIA-ME com as seções novas (modo sem chaves, Leads, endereços, busca/atalhos, fila do Comunicar, rotas e arquivos).

### Terceira leva — operação do dia a dia nos leads, Painel e Radar
103. Ordem da lista de leads (`leads.ordenar`, puro e testado; `?ordem=recentes|antigos|valor|nome` validado no servidor) com o seletor "Ordem" na aba.
104. "Quando" ganhou **Mês corrente**.
105. Chips por status (Novo, Em contato, Orçamento, Agendado, Venda fechada, Perdido) com contagem em cima da tabela — clicar filtra.
106. Lista cortada mostra "Carregar até 1.000" (ou o CSV até 5 mil) em vez de esconder que faltou gente.
107. Telefone do lead é um botão: um clique copia.
108. Botão **Orçar** por lead (Orçador `?tel=&nome=`; link `orcador` no `leads.js`).
109. Botão **Tarefa** por lead: abre Minhas tarefas com o título pronto ("Ligar para Fulano (serviço)"), vencimento hoje e a tarefa gravada com `lead_id`/`cliente_id` e origem `ads`; a lista de tarefas mostra "abrir o lead no CRM" nas que têm lead.
110. KPI **Agendaram** (quantos leads têm agendamento, % dos leads; `resumo.agendados`) — clicável.
111. Lead que chegou há menos de 1 hora vem marcado **novo** (selo e barra verde na linha).
112. Venda concluída sem valor vira o link "sem valor · lançar", que abre o lead no CRM para lançar o valor pago.
113. Cartão "Leads de hoje" se atualiza sozinho a cada 5 min e ao voltar para a aba do navegador (pino da navegação acompanha), mostra "último há X min" e ganhou "Abrir o Atendimento"; "Ver a lista de hoje" abre a aba Leads já em "Hoje".
114. `leads.hoje` com cache de 30 s no servidor: vários navegadores atualizando o cartão não batem no banco a cada um (testado).
115. Busca global inclui os leads já carregados (resposta na hora) e não repete os que a consulta ao CRM devolve.
116. CSV dos leads com o canal por extenso (Meta, Site, WhatsApp…) e nome do arquivo com o filtro (`leads-site-…`, `leads-anuncios-…`, `leads-sem-responsavel-…`).
117. Painel: KPI **Leads no CRM** do período com o custo real por lead (clicável: abre a aba Leads só com anúncios).
118. Painel → Mês corrente: leads do mês em todos os canais (total, de anúncio, agendaram, fecharam), custo por lead pago e sem responsável (`/api/mes.leads`, `leads.resumoDoMes`; CRM fora não derruba o cartão).
119. Painel → Plataforma × CRM: coluna **Custo por venda real** e "ver leads" por canal.
120. Resultados CRM: "ver" em cada canal e campanha abre a aba Leads filtrada; "Ver quais são" nos leads sem responsável.
121. Campanhas: ordens "Mais leads no CRM" e "Menor custo por venda (CRM)" (na tela, sobre as colunas do CRM).
122. Criativos: campo "filtrar criativos…".
123. Ranking × CRM reaproveita a coorte do CRM por 60 s (mesmo período e plataforma): trocar a ordem não refaz a leitura mais pesada do app.
124. Radar: "ver a campanha" em cada alerta abre Campanhas filtrada pelo nome.
125. Radar: "Marcar lidos" fica desabilitado quando não há alerta novo; CSV dos alertas respeita o filtro de severidade; contador "N regra(s) · M ligada(s)"; severidade lida pelo leitor de tela.
126. Relatórios: **Copiar texto** da prévia (para mandar à mão enquanto o WhatsApp da oficina está fora) e "ver texto" no histórico mostra o relatório daquele dia.
127. Conexões: pílula **chave colada / chave recusada / sem chave** por plataforma, com o que fazer quando recusada.
128. Ajustes: "N número(s) reconhecido(s)" enquanto digita os destinos; "Hora do envio (Brasília)".
129. Faixa do vigia lista todos os problemas abertos (`vigia_estado.problemas` → `/api/saude.problemas`): "Também em aberto: …".
130. Demonstração não entra por cima de dado real (`POST /api/demo` recusa com frase quando há chave funcionando e dado real).
131. Log do servidor registra quem fez cada chamada (papel + começo do id, sem e-mail) — histórico de operação.
132. Versão do app em `/api/saude.versao` e no rodapé da Ajuda.
133. Título da janela acompanha a aba ("Leads · IndyCar Tráfego pago"); foco vai para o título ao trocar de aba (leitor de tela anuncia); no celular o item ativo da navegação rola para o centro.
134. Celular: "?" e o sino na mesma linha do "Atualizar dados" (antes cada um ocupava uma linha).
135. Meu perfil mostra o último acesso (quando e em qual app) e se o acesso foi conferido no banco.
136. Tela "sem acesso" diz como pedir (marcar "ads" no perfil em Atendimento › Equipe).
137. Ajuda: "como distribuir os leads sem responsável"; estado vazio da aba Leads com "Abrir o CRM".
138. Aviso único por navegador na primeira abertura depois da rodada: "Novo: aba Leads (tecla 2), Ctrl+K e ? mostra os atalhos".
139. Testes: `rodada5.test.js` com 18 testes (ordem, agendaram, CSV por extenso, último acesso, cache de hoje); 158 no total.
140. Roteiro no Chrome com 75 conferências (ordem "Nome A–Z", chip de status, Tarefa do lead, Copiar texto na prévia, chave recusada e 2º problema do vigia).
141. O filtro de plataforma do topo ("Só Meta" / "Só Google") passou a valer também para a lista de alertas do Radar.
142. CSV de campanhas leva as colunas do CRM (leads, agendamentos, vendas, custo por lead, custo por venda, ROAS real e a observação de por que não casou) — o mesmo que a tela mostra; CRM fora, o CSV sai só com as colunas da plataforma.
143. Nomes de arquivo dizem o filtro: `resultados-crm-meta-…`, `alertas-radar-critico-…`, `leads-site-…`.
144. Busca global: Enter sem resultado abre a aba Leads com o termo (30 dias) em vez de não fazer nada.
145. Faixa "Modo demonstração" oferece "Criar dados de demonstração" quando a tabela está vazia (`/api/saude.tem_dados`) — o app sai do zero com um clique.
146. Lead sem telefone no CRM mostra "sem telefone" no lugar dos botões de WhatsApp/Agenda (não some em silêncio).
147. Pino "Leads" da navegação se atualiza a cada 5 min em qualquer aba (chamada leve, cache de 30 s no servidor); o cartão inteiro só no Painel.
148. Busca de leads no servidor limpa caracteres de controle e corta em 80 caracteres antes de ir ao banco.
149. CRM fora não derruba nem o relatório diário (o bloco "Leads de ontem" some), nem a leitura da IA, nem o resumo semanal (`catch` em cada leitura de leads) — testado o caminho sem banco.
150. CSV dos leads sai na mesma ordem da tela (a ordem é aplicada no servidor antes do filtro de limite).

### Como verifiquei
- `npm test`: 159 testes, verdes em rodadas seguidas (paralelo e `--test-concurrency=1`).
- `npm run e2e:tela`: 75/75 no Chrome instalado, 1440 × 900 e 375 × 812, axe-core WCAG 2.1 AA, sem erro de JS; capturas `qa-out/r5-*.png` (painel, leads, cartões em 375, campanhas, busca, tema claro, ajustes).
- Banco real, só leitura: `leads.listar`/`hoje`, `whatsapp.status` (vigia + fila), `estadoChaves` (Meta = recusada, Google = sem token → modo sem chaves), ranking × CRM.
- Banco real, DO-block revertido: inserção no formato do `fila.js` em `posvenda_envios` aceita pelas CHECKs; duplicata bloqueada pela unicidade; tudo desfeito.

### Pendências
- Publicar o Ads só quando houver token real da Meta e developer token do Google (decisão do João); até lá roda local na 3400 em modo sem chaves.
- O carteiro do Comunicar precisa estar vivo (pg_cron `comunicar-carteiro`) para as mensagens do Ads saírem — e a chave do CodeWords continua recusada desde 01/10 (pendência 1 da PASSAGEM): tudo fica na fila até lá.
- Os 117 leads de set/out estão sem responsável (pendência 5 da PASSAGEM); a aba Leads e o relatório mostram isso, não resolvem.
- Nenhum lead atual tem `utm_campaign`: as colunas do CRM em Campanhas só casam quando os anúncios levarem a UTM (guia em Resultados CRM).
- Duas rodadas de `npm test` terminaram com exit 1 sem mensagem enquanto outro Chrome/mock rodava na máquina; não reproduzi em 6 rodadas limpas — fica anotado.
- Onda B2: ao mudar os apps para `/crm/`, `/atendimento/` etc., alterar só `public/ecossistema.js` (e o `start_url`/escopo do service worker se o Ads também for para o domínio da Agenda).

## Rodada 6 (21/10/2026)

Tema: o anúncio só vale se virar carro na oficina. Ligamos o lead do CRM ao orçamento do Orçador e à OS do Pátio, e os links cruzados passam a abrir cada app na aba dele.

### Do anúncio ao carro entregue (ciclo.js)
151. 🔗 Novo módulo `ciclo.js`: lê `orc_orcamentos.lead_id` (rascunho não conta) dos leads de anúncio, em lotes de 150, sem nome nem telefone.
152. 🔗 A OS do Pátio é achada por três caminhos (`patio_os.lead_id`, orçamento de origem e agendamento) e a mesma OS nunca conta duas vezes.
153. 🔗 Extras do Pátio (aprovado, pendente, recusado) somados por lead.
154. 🔗 Por campanha: orçamentos feitos, enviados, aprovados, recusados, valor orçado e valor aprovado.
155. 🔗 **Custo por carro na oficina** (investimento ÷ carros com OS) e custo por carro entregue, por campanha e no total.
156. 🔗 Receita paga das entregas, ticket da oficina e ROAS da oficina; entrega sem valor no CRM é marcada, nunca vira R$ 0.
157. 🔗 Receita prevista = orçamento aprovado + extras aprovados (diferente da paga).
158. 🔗 Ticket do orçamento aprovado e mediana de dias do lead até a OS (total e por campanha).
159. 🔗 Motivos de recusa do Orçador (`motivo_cod`) por extenso e ordenados ("preço (2) · foi para outro lugar (1)").
160. 🔗 Aviso: orçamento de anúncio esperando resposta há mais de 48 h, com o valor somado.
161. 🔗 Aviso: orçamento aprovado há mais de 3 dias e o carro ainda não entrou no Pátio (OS cancelada não conta).
162. 🔗 Aviso: carro de anúncio pronto há mais de 24 h sem retirar.
163. 🔗 Aviso: entrega sem valor pago no CRM mostra a soma do orçamento aprovado + extras como conferência para lançar o valor.
164. Campanha que gastou e não trouxe lead entra na conta: o investimento do ciclo bate com o do Resultados CRM.
165. 🔗 Escada do ciclo (orçamento feito → aprovado → carro na oficina → entregue) com taxa só quando a etapa não passa da anterior.
166. 🔗 Cartão "Do anúncio ao carro entregue" no Resultados CRM: 6 números, escada, avisos, motivos de recusa e tabela por campanha.
167. 🔗 "ver os leads" em cada aviso e em cada campanha do ciclo abre a aba Leads já filtrada na etapa certa.
168. 🔗 CSV do ciclo (`/api/ciclo.csv`, auditado, sem dados de cliente, com proteção contra fórmula).
169. Orçador ou Pátio fora do ar: o cartão diz "não consegui ler" e o resto do Resultados CRM segue certo (nada quebra).

### Aba Leads
170. 🔗 Chip do orçamento em cada lead (status, valor, "há N dias" quando passa de 48 h) que abre `#/historico/<id>` no Orçador.
171. 🔗 Chip do Pátio (etapa; "pronto há N dia(s)") que abre `?os=<id>` no Pátio.
172. 🔗 Chip "+ R$ extras" quando o cliente aprovou extras no Pátio.
173. 🔗 Filtro "Etapa depois do CRM": já entrou na oficina, no pátio agora, orçamento esperando, aprovado, entregue, agendado sem orçamento.
174. 🔗 KPIs "No pátio agora" e "Orçamento esperando" (com o valor em aberto); clicar aplica o filtro.
175. 🔗 "Orçar" leva cliente, telefone, nome e o id do lead ao Orçador; vira "Orçar de novo" quando já há orçamento.
176. 🔗 Orçador/Pátio fora: a lista abre sem os chips e avisa em frase.
177. 🔗 CSV dos leads ganha placa, orçamento, pátio, idade e os links do orçamento e da OS.
178. Placa do carro na linha do lead (normalizada) e busca pela placa na lista.
179. Selo "parado N d" em lead que continua "Novo" há mais de 24 h; KPI "Parados +24 h" e ordem "Mais parados".

### Painel e busca
180. 🔗 Cartão "Oficina agora": carros de anúncio no pátio (etapa, pronto há N dias) e orçamentos esperando, com atalho para a OS e o orçamento.
181. 🔗 `/api/oficina-agora` com cache de 60 s e botões "Abrir o Pátio" / "Abrir o Orçador".
182. 🔗 Ctrl+K acha a OS e o orçamento do lead (por nome, placa ou telefone) e abre na aba do Pátio/Orçador.
183. 🔗 Aviso diário no sino dos gestores (a partir das 9h, chave por dia): orçamento sem resposta há 48 h e carro pronto sem retirar; só avisa quando há o que fazer.
184. 🔗 O aviso do sino abre `?aba=leads&etapa=orc_esperando` já filtrado; `/api/cron/ciclo` para quem usa agendador externo.

### Links e abas nomeadas
185. 🔗 CRM, Atendimento, Comunicar e Agenda passam a usar os caminhos da Central (`/crm/`, `/atendimento/`, `/comunicar/`, `/agenda/`) em vez dos serviços antigos.
186. 🔗 CORS e links de sino aceitam só `https://host` (sem caminho) e continuam aceitando os endereços antigos que já estão em sinos gravados.
187. 🔗 Clique em link de outro app abre na aba nomeada dele (`indycar-crm`, `indycar-orcador`, `indycar-patio`…): clicar de novo reaproveita a aba (vale para links criados depois).
188. 🔗 Ctrl+K e o seletor do ecossistema abrem na aba nomeada (`abrirNaCasa`).
189. 🔗 `Ecossistema.linkOrcamento`, `linkOS`, `appDaUrl` e `alvo`: um lugar só para montar e reconhecer links (endereço mais específico vence; host parecido de golpe não casa).

### Relatórios e IA
190. 🔗 Relatório diário do WhatsApp ganha "Da campanha à oficina (7 dias)" com orçamentos, carros, custo por carro e receita paga.
191. 🔗 Resumo semanal do sino leva a frase "Oficina: …".
192. 🔗 Leitura da semana (IA) recebe `oficina` e é orientada a usar custo por carro como medida acima do custo por lead.
193. 🔗 O relatório do dia manda `oficina_7d` à IA e grava o total da oficina no payload salvo.

### Mais ciclo (terceira leva)
199. 🔗 "Contra o período anterior" no cartão do ciclo (orçamentos, aprovados, carros, entregues, receita, custo por carro; variação só com base maior que zero).
200. 🔗 Meta × Google em uma linha: carros na oficina, entregues e custo por carro de cada canal.
201. 🔗 Aba Campanhas ganha as colunas "Carros" e "Custo/carro" (casando pelo nome da campanha) e o CSV do ranking leva as duas.
202. 🔗 Chips da aba Leads mostram o número do orçamento e da OS.
203. 🔗 "copiar recado": mensagem pronta (vocabulário da casa, valor do orçamento, nunca inventado) para orçamento sem resposta há 48 h.
204. 🔗 "link do cliente": copia o link de acompanhar o carro (`/acompanhar/?t=`) de quem está no pátio.
205. 🔗 KPI e filtro "Sem orçamento": lead agendado ou em serviço que não tem orçamento no Orçador.
206. 🔗 "Oficina agora" também mostra carros entregues nos últimos 30 dias e quanto foi pago.
207. Bug real fechado: `orc_orcamentos.rascunho` aceita NULL e o filtro antigo (`neq true`) descartaria esses orçamentos do ciclo; agora lê NULL e false, e rascunho verdadeiro fica de fora (testado com banco falso).
208. Orçador/Pátio lentos não travam a tela: a leitura do ciclo desiste em 9 s e a aba segue sem os chips, com frase.
209. Limiares dos avisos em variáveis de ambiente (`ADS_ORC_ESPERA_H`, padrão 48; `ADS_PRONTO_PARADO_H`, padrão 24), sem mexer no código.
210. `/api/ciclo.csv` e `/api/oficina-agora` entram nas rotas com limite por pessoa (30 e 120 em 10 min).

### Servidor, ferramentas e testes
194. `npm test` passa a rodar com `--test-concurrency=1`: em paralelo o executor encerrava com código 1 sem mensagem (pendência da rodada 5).
195. Corrigido ao longo da rodada: `$$` colapsado em `$` por `String.replace` quebrou a tela (3 linhas); pego pelo roteiro do navegador e coberto por 14 conferências novas.
196. Service worker v3 (inclui `ciclo.js`); ajuda "…para saber o que o anúncio virou na oficina?" e aviso único de novidades da rodada 6.
197. Mock e roteiro: ciclo inventado passando pelo `ciclo.js` real (`scripts/ciclo-demo.cjs`), 89 conferências no Chrome (1440 e 375 px, axe AA).
198. `tests/rodada6.test.js` com 47 testes (ligação, avisos, custo por carro, ordem, CSV, links, aviso do sino, banco falso, relatório, semanal, NULL do rascunho, limite de tempo, comparação, canais, ranking).

### Como verifiquei
- `npm test` (concorrência 1): todos verdes; `tests/rodada6.test.js` 47/47.
- `npm run e2e:tela`: 89 conferências, 0 falhas (1440 e 375 px, axe-core), capturas `qa-out/r6-*.png`.
- Banco real, só leitura: `Ciclo.ler` sobre os 126 leads de set/out e `Ciclo.agora()` (sem erro; orçamentos e OS vêm vazios porque o banco foi limpo e nada está ligado a lead ainda). Nenhuma migração nem escrita.

### Pendências
- Pedido ao Orçador (O2): ao abrir `/?tel=…&lead=<id>`, gravar `orc_orcamentos.lead_id`. Hoje o Ads já manda `lead` no link "Orçar", mas sem isso o ciclo só vê orçamentos feitos a partir do CRM/Atendimento que gravem `lead_id`. O Pátio já grava `lead_id`/`orcamento_id`/`agendamento_id` e é lido pelos três.
- Pedido à Casa (C1): ler `?busca=` seria útil; o Ads não gera esse link ainda.
- Ads continua local (porta 3400, não publicado); `ecossistema.js` agora aponta a Central.

## Rodada 7 (25/10/2026) — X2 Ads

Tema: o Orçador agora grava `lead_id` no orçamento, então o anúncio fecha o ciclo até o carro entregue. Esta rodada usa isso para (1) dizer quem está esperando o consultor, (2) transformar alerta em ação com atalho para a tela certa, (3) entregar ao dono o fechamento do mês e (4) deixar claro o que é demonstração e o que falta para ser real.

### ROI do anúncio ao carro (ciclo.js)
211. 🔗 O orçamento é achado também pelo agendamento do lead (Orçador com `lead_id` ou só com `agendamento_id`), sem contar duas vezes.
212. 🔗 A OS cujo orçamento de origem só tem agendamento acha o lead certo.
213. `unirOrcamentos`: o mesmo orçamento vindo por dois caminhos entra uma vez só (o do `lead_id` vence).
214. O valor aprovado usa `total_aprovado` (com o desconto à vista que o Orçador gravou) e o valor sugerido ao lançar o pagamento também.
215. 🔗 Colunas novas do Orçador lidas (`total_aprovado`, `visualizado_em`, `follow_up_em`, `desconto_pedido_em`, `desconto_aprovado_em`, `horario_pedido`, `validade`, `agendamento_id`), conferidas no esquema real.
216. Taxa de abertura do orçamento (abriram ÷ enviados), por campanha e no total.
217. Mediana de horas entre o envio e a decisão do cliente.
218. Mediana de horas do lead até o orçamento enviado.
219. Valor esperando resposta e valor recusado, por campanha e no total.
220. 🔗 Extras recusados no Pátio somados por campanha.
221. ROAS previsto (orçamento aprovado + extras ÷ investimento), antes de o cliente pagar.
222. "Depois do orçamento" no Resultados CRM: abertura, tempo de decisão, tempo até o envio, valor em aberto, recusado e ROAS previsto numa linha.

### Avisos novos do ciclo (cada um com itens e atalhos)
223. 🔗 Cliente abriu o orçamento e não respondeu (entre 2 h e o prazo de espera): a hora de ligar.
224. 🔗 Orçamento enviado há mais de 24 h que o cliente nem abriu (confira se o link chegou).
225. 🔗 Retorno combinado com o cliente (`follow_up_em`) já venceu.
226. 🔗 Cliente pediu desconto e o gestor ainda não respondeu.
227. 🔗 Cliente aprovou e pediu horário, mas o carro ainda não tem OS.
228. 🔗 Orçamento vence em até 48 h.
229. 🔗 Lead de anúncio continua "Novo" há mais de 24 h, sem primeiro toque.
230. 🔗 Lead de anúncio já agendado ou em serviço, sem orçamento no Orçador.
231. 🔗 Todos os avisos (os 4 antigos e os 8 novos) levam até 8 itens com nome, canal, campanha, carro, placa e links: lead (CRM), conversa (Atendimento), Agenda, orçamento (Orçador), OS (Pátio) e "Orçar".
232. Limiares em variáveis de ambiente, sem mexer no código: `ADS_ORC_NAO_ABERTO_H` (24), `ADS_ORC_QUENTE_H` (2), `ADS_LEAD_PARADO_H` (24).
233. 🔗 No Resultados CRM cada aviso mostra até 3 nomes que abrem o lead na aba do CRM.
234. 🔗 "Ver os leads" funciona também para os 6 tipos novos (abre a aba Leads já filtrada).

### "O que fazer agora" (acoes.js + cartão do Painel)
235. Fila única ordenada: peso do tipo + valor em jogo (até 15) + tempo parado (até 10).
236. Um lead aparece uma vez só, pelo motivo de maior pontuação (não cinco linhas para a mesma pessoa).
237. Motivo em frase com número ("abriu há 5 h e não respondeu · R$ 900,00"; vira "3 dias" depois de 48 h).
238. 🔗 Botões por tipo, cada um na aba nomeada do app (`indycar-atendimento`, `indycar-orcador`, `indycar-patio`, `indycar-crm`, `indycar-agenda`).
239. Botão só aparece se o link existe (sem telefone não há "Abrir a conversa"); só endereço https reconhecido do ecossistema vira botão.
240. Recado pronto por tipo, com o primeiro nome, o carro e o valor do orçamento, no vocabulário da casa (nada de "veículo/prezado"); desconto não tem recado automático (decisão do gestor).
241. Frase-resumo ("N cliente(s) esperando você (R$ X em jogo): …") com os 3 tipos mais pesados.
242. 🔗 `/api/acoes` com cache de 60 s; se o Orçador/Pátio caírem, mostra a última leitura boa (até 15 min) marcada como desatualizada.
243. 🔗 Cartão "O que fazer agora" no Painel, com filtro por tipo (chips), "ver mais" e botão Atualizar.
244. "Já tratei": esconde o item por hoje só neste navegador, avisa quantos estão escondidos e deixa mostrar de novo.
245. Selo "sem dono" no item cujo lead ainda não tem responsável no CRM.
246. "Copiar recado" no item.
247. 🔗 CSV da fila (`/api/acoes.csv`): links de cada registro, recado e "sem responsável"; auditado, 503 com frase se a fonte cair, proteção contra fórmula.
248. 🔗 Ctrl+K acha os itens da fila ("Marcos · Cliente pediu desconto") e abre a primeira tela útil.
249. Os alertas de campanha sem leitura (críticos primeiro) aparecem no mesmo cartão, com "Ver a campanha".
250. Limite por pessoa nas rotas novas (`acoes` 120, `acoes.csv` 30, `ligacao` 30, `fechamento` 30 e o envio 5 em 10 min).

### Alertas que viram ação
251. 🔗 O radar grava os alertas do ciclo em `ads_alertas` (um por tipo), então chegam ao sino e ao WhatsApp como os de campanha.
252. Alerta do ciclo: nível conta, plataforma do canal que mais aparece nos itens, 24 h de repetição.
253. Mensagem do alerta com até 3 nomes e valores ("Quem: Ana (R$ 800,00), …").
254. Orçador/Pátio fora do ar não derrubam o radar (`erro_ciclo` na resposta); `ciclo:false` desliga a checagem.
255. 🔗 `/api/alertas` devolve `acao` em cada alerta e a tela troca "ver a campanha" pelo botão certo: campanha, criativo, aba Leads da campanha (alerta do CRM) ou o cartão do Painel (alerta do ciclo).
256. 🔗 Alerta de "campanha sem lead no CRM" abre a aba Leads já filtrada pela campanha e pelo canal.
257. "Testar agora" também mostra o botão de cada alerta simulado.
258. 🔗 Aviso diário do sino usa a fila inteira ("N cliente(s) esperando você") e o link leva ao cartão (`?aba=painel&ancora=cartao-acoes`).
259. `?ancora=` na URL rola até o cartão certo depois de abrir.
260. 🔗 Resumo semanal do sino ganha a frase de quem está esperando.
261. 🔗 Relatório diário do WhatsApp ganha "O que fazer hoje" com os 5 primeiros (nome e motivo).
262. A IA do relatório recebe quantos esperam o consultor e o valor em jogo; o payload salvo guarda o mesmo.

### Aba Leads
263. 🔗 Chips novos na linha do lead: "abriu há N h, sem resposta", "pediu desconto", "retorno vencido", "pediu horário".
264. 🔗 Três filtros novos em "Etapa depois do CRM": abriu e não respondeu, pediu desconto, retorno venceu.
265. KPIs "Abriram e não responderam" e "Pediram desconto" (clicar aplica o filtro).
266. CSV dos leads ganha "Sinal do orçamento" (ainda não abriu; abriu há N h; pediu desconto; retorno vencido).

### Robustez e demonstração clara
267. 🔗 Só o Pátio fora do ar: os orçamentos continuam valendo (`parcial: 'patio'`) e a tela avisa que os carros ficaram de fora, em vez de zerar o ciclo.
268. Erro de rede ou gateway na leitura do Orçador/Pátio tenta de novo uma vez; erro de permissão não repete.
269. Qualidade da ligação (pura): % dos orçamentos enviados com lead ou agendamento e % das OS ligadas, com a frase do que fazer ("use o botão Orçar do CRM").
270. 🔗 `/api/ligacao` (só colunas de ligação, sem nome nem telefone) e a linha "Ligação em dia / incompleta" no Resultados CRM.
271. "Do teste ao real" (`preparo.js`): modo (demonstração / real / sem dados), passos em ordem e o próximo passo, em frase de gente.
272. Cartão "Do teste ao real" em Ajustes, com o passo da Meta, do Google, dos dados, das metas, do número do WhatsApp, do relatório, do canal e da ligação.
273. Cada leitura do preparo que falha vira "não sei", nunca erro de tela.
274. Resultados CRM avisa que o custo por carro usa investimento de demonstração quando o gasto é fabricado.

### Relatórios para o dono
275. 🔗 Fechamento do mês (`fechamento.js`): investido, leads, carros, entregues, valor pago, custo por carro e campanhas, contra o mês anterior, lendo CRM + Orçador + Pátio.
276. Mês em andamento vai até ontem e é marcado "parcial"; mês futuro, mês do dia 1 e formato errado viram frase, não erro.
277. Veredito em uma frase (voltou N reais por real investido / ainda não cobre / nenhum valor lançado / nenhum carro), com aviso quando há entrega sem valor.
278. Se o Orçador/Pátio caírem, o fechamento sai sem o bloco da oficina e diz isso.
279. 🔗 Aba Relatórios: cartão "Fechamento do mês" (gerar, copiar, enviar).
280. 🔗 Envio manual pela fila do Comunicar: recusa sem número cadastrado, recusa investimento de demonstração, chave `ads:fechamento:<mês>` impede repetir, fica na auditoria.
281. 🔗 No dia 1, depois da hora do relatório, o fechamento do mês anterior sai sozinho (mesmo opt-in do relatório diário); `/api/cron/fechamento` para quem usa agendador externo.

### Mais da rodada (segunda leva)
286. O aviso do ciclo sobe para crítico quando o cliente espera demais: desconto pedido há +24 h, carro pronto há +72 h, aprovado sem OS há +7 dias (vai para o sino e o WhatsApp como crítico).
287. 🔗 Pino "esperando você" no menu Painel (conta só o que não foi marcado como tratado), atualizado a cada 5 min mesmo em outra aba.
288. Cada passo que falta em "Do teste ao real" tem botão que leva à aba certa (Ajustes, Painel, Resultados).
289. 🔗 Ctrl+K ganha as ações "O que fazer agora" e "Fechamento do mês".
290. CSV do fechamento (`/api/fechamento.csv`, auditado, com proteção contra fórmula) e botão na tela.
291. Bug real fechado: o custo por lead do fechamento lia um campo que não existe (`custo_lead`; o do CRM é `cpl`) e nunca aparecia; achado pelo teste novo.

### Testes e ferramentas
282. `tests/rodada7.test.js` com 63 testes (ligação, avisos, métricas, fila, radar, sino, relatório, semanal, leads, qualidade da ligação, preparo, fechamento, CSV, segurança).
283. `tests/rodada7-http.test.js` com 11 testes das rotas novas com porteiro e banco falsos (403 sem o app, cache, desatualizado, CSV e auditoria, `acao` nos alertas, fechamento e seu envio, cron).
284. Roteiro do navegador: 150 conferências (61 novas) em 1440 e 375 px com axe: fila, filtro, "Já tratei", CSV, Ctrl+K, alerta que leva à aba, ligação, fechamento, preparo, Orçador/Pátio fora.
285. Mock com as rotas novas passando pelos módulos reais (`acoes`, `preparo`, `fechamento`, `ciclo`); service worker v4 e ajuda com 3 perguntas novas; aviso único de novidades.

### Como verifiquei
- `npm test` (concorrência 1): 280 testes verdes (206 de antes + 63 + 11 desta rodada).
- `npm run e2e:tela`: 150 conferências, 0 falhas (capturas `qa-out/r7-*.png`).
- Banco real, só leitura: `Ciclo.acoes` leu 25 leads de anúncio dos últimos 30 dias (4 "agendado sem orçamento"); `Ciclo.ligacao` e `Fechamento.gerar` sem erro (orçamentos e OS ainda vazios); `Preparo.ler` diz "demonstração" e o passo da Meta com chave recusada. Nenhuma escrita, nenhuma migração, nada publicado.

### Pendências
- Os avisos "abriu e não respondeu", "desconto pedido" e "pediu horário" dependem de o Orçador gravar `visualizado_em`, `desconto_pedido_em` e `horario_pedido`; as colunas existem, mas `orc_orcamentos` está vazia em produção, então só se prova com banco falso.
- Chaves reais da Meta e do Google e WhatsApp (CodeWords) continuam do lado do João; até lá o fechamento e o relatório automático não saem em demonstração (de propósito).
- Ads continua local (porta 3400, não publicado), a pedido da rodada.

## Rodada 9 (19-20/11/2026)

Frente R9-trafego (Claude), branch `claude/r9-trafego`. Cada linha tem o commit que a prova.

- **R9-TRF-001** · segurança · Número de WhatsApp da oficina saiu dos dados de mentira da tela, dos testes e do exemplo da API-jornada.md (número inventado): nenhuma captura ou teste carrega mais o número de verdade · `84301af`
- **R9-TRF-002** · tela · Ajustes › Conexões › Google Ads: campo novo "ID da conta gerenciadora (se houver)", com explicação; o servidor já aceitava, mas sem o campo a conta debaixo de uma MCC (agência) não ligava · `7684167`
- **R9-TRF-003** · enxugar · Ajustes › Conexões: com tudo ligado, o passo a passo de cinco linhas vira uma só ("Tudo ligado: 5 de 5") com "Ver os passos"; no celular as contas sobem para a primeira tela · `7684167`
- **R9-TRF-004** · tela · Ajustes › Conexões: com o acesso da Meta ou do Google vencendo, o formulário "Trocar o acesso" já abre sozinho (antes ficava fechado embaixo do aviso) · `7684167`
- **R9-TRF-005** · texto · Conexões (Hoje e Ajustes): "Última leitura há 13 h" vira "Números buscados há 13 h", a mesma palavra do botão "Buscar os números agora" · `7684167`
- **R9-TRF-006** · tela · Borda lateral grossa colorida (passo do WhatsApp em Conexões e resumo da conversa do Gestor) trocada por contorno fino, como pede o guia visual · `7684167`
- **R9-TRF-007** · texto · MCP.md: "Ajustes › Chaves da IA" vira "Acesso da IA de fora" e as opções da chave com os nomes da tela (Só ler os números, Ler e deixar sugestões, Criar a chave) · `1c6dc56`
- **R9-TRF-008** · texto · CONECTAR.md: nomes da tela de hoje (cartão, "Colar os acessos", "Conta de serviço (arquivo JSON)", "ID da conta gerenciadora (se houver)", "Buscar os números agora" no lugar de "Coletar agora") · `1c6dc56`
- **R9-TRF-009** · tela · Hoje › O que fazer agora: o selo Urgente/Atenção sobe para antes do título, em toda ação (antes ora ficava ao lado, ora embaixo do botão) · `0ae8452`
- **R9-TRF-010** · celular · Hoje › Contatos de hoje: quem espera resposta ganha o selo "esperando há…" em linha própria; a origem não corta mais em "Anúncio do…" em 375 px · `0ae8452`
- **R9-TRF-011** · texto · Hoje › Conexões: o link "Ver o que falta ligar" vira "Ver as conexões" quando tudo está funcionando (com teste novo em hoje-logica.test.mjs) · `0ae8452`
- **R9-TRF-012** · celular · Jornada no celular: sem valor na ficha, a origem e a campanha usam a largura inteira (antes cortava em "Troca de ól…" com meia linha vazia ao lado) · `741b8ed`
- **R9-TRF-013** · texto · Jornada e campanha aberta: contato que andou hoje aparece "nesta etapa desde hoje" em vez de "parado desde hoje" · `741b8ed`
- **R9-TRF-014** · segurança · Mandar mensagem pelo WhatsApp do dono (teste de envio, relatório com "enviar" e alertas do radar com "enviar") passa a ser só do administrador, como já era o fechamento do mês; simular continua livre para o gestor (teste novo r9-permissoes-http) · `e0baba8`
- **R9-TRF-015** · segurança · Pôr ou tirar os números de demonstração (POST /api/demo, que grava e apaga na tabela de números que todos veem) passa a ser só do administrador (coberto no mesmo teste) · `e0baba8`
- **R9-TRF-016** · conserto · Gestor que abria Ajustes › Acesso da IA de fora (ou tentava salvar um acesso) via o app inteiro trocar por "Você não tem acesso ao Tráfego": agora só 401 e 403 que falam da pessoa param o app; "só o administrador" aparece na própria gaveta (teste novo em navegacao.test.mjs; mock ?papel=gestor) · `4121594`
- **R9-TRF-017** · tela · Ajustes › Acesso da IA de fora: para quem não é administrador, o formulário "Criar uma chave" nem aparece (antes preenchia e só então ouvia o "não") · `3a34d7d`
- **R9-TRF-018** · tela · Ajustes › Conexões: para quem não é administrador, o formulário de colar o acesso da Meta e do Google vira a frase "Só o administrador da oficina cola ou troca o acesso", com a situação de cada conta · `3a34d7d`
- **R9-TRF-019** · texto · Avisos do canal de WhatsApp apontam para "Atendimento › Integrações" (o menu "Atendimento › Configurações" não existe) e perderam os travessões (teste novo r9-textos) · `e144e8d`
- **R9-TRF-020** · texto · Passo a passo das Conexões diz o que se faz de verdade: Meta = colar o número da conta e o token, Google = colar o ID e o arquivo JSON (não existe "entrar com a conta"); WhatsApp = Integrações no grupo Sistema, em runtime.codewords.ai; orçamento = Ajustes › Metas e verba · `e144e8d`
- **R9-TRF-021** · tela · Gestor IA › Diário: "Anotar uma mudança que eu fiz" (tipo, o que foi feito, onde, campanha, por quê): quem mexe no anúncio por conta própria registra e o Tráfego mede a semana antes e a semana depois (a rota existia sem botão); confere antes de mandar e põe o erro no campo certo (teste r9-gestor + navegador) · `c8aaaf5`
- **R9-TRF-022** · texto · Gestor IA › Diário: o que uma pessoa anotou aparece "Paulo anotou", não mais "Paulo sugeriu, Paulo decidiu" · `c8aaaf5`
- **R9-TRF-023** · enxugar · Gestor IA › Diário: mostra as 5 decisões mais novas e "Ver as outras N decisões" (no celular o diário inteiro passava de três telas); o foco vai para a primeira que estava escondida · `c8aaaf5`
- **R9-TRF-024** · tela · Campanha aberta › Contatos desta campanha: cada linha mostra o conjunto e o anúncio ("Taubaté 30 km › Vídeo 2") em vez de repetir o nome da campanha que já está no título (teste em r9-gestor.test.mjs) · `9d66e81`
- **R9-TRF-025** · texto · Campanhas › classificação: embaixo de "R$ 5,01 cada R$ 1 virou" a distância diz "R$ 4,30 a menos que a primeira" (antes repetia "Cada R$ 1 virou" na linha de baixo) · `9d66e81`
- **R9-TRF-026** · tela · Hoje › De onde vieram os contatos: com contato em "Ainda não sabemos" (costuma ser a maior barra), o bloco diz quantos são e leva direto ao mutirão "Dizer de onde vieram" · `af4aa30`
- **R9-TRF-027** · conserto · Ajustes › Metas e verba: margem em branco (o servidor guarda 100%) aparecia como "100" no campo e a conta dizia "100% de margem", enquanto a classificação usava 45%; agora o campo fica vazio e a conta usa a mesma premissa de 45%, dita com todas as letras · `7eaf268`
- **R9-TRF-028** · tela · Ajustes › Metas e verba: a conta de cabeça diz a partir de quanto a campanha se paga ("cada R$ 1 em anúncio vira mais de R$ 2,22 em serviço fechado; acima de R$ 4,44 ela é boa"), a mesma régua da classificação, mesmo sem valor do serviço · `7eaf268`
- **R9-TRF-029** · conserto · Ajustes › De onde vêm os contatos › Rastreio do site: a tabela dizia "Cliques no WhatsApp por página (30 dias)", mas contava visitas dos últimos 7 dias; agora diz "Páginas mais visitadas nos últimos 7 dias" e a soma bate com as visitas do topo · `027bacd`
- **R9-TRF-030** · tela · Ajustes › Rastreio do site: o servidor manda os cliques no WhatsApp de cada página e a tabela ganha a coluna "Cliques no WhatsApp" (qual página leva a conversa); "/" aparece como "Página inicial" (teste em r8-origem-http e r9-ajustes) · `027bacd`
- **R9-TRF-031** · texto · Ajustes › Frases que dizem a origem: explica que acento, maiúscula e pontuação no fim não contam, por isso as frases aparecem "ola! tenho interesse… informacoes" (parecia erro de digitação) · `027bacd`
- **R9-TRF-032** · conserto · Ajustes › Frases: a linha "N contatos reconhecidos, o último…" não começa mais com vírgula nem mostra "null" quando falta a contagem ou a data vem inválida (teste em r9-ajustes) · `027bacd`
- **R9-TRF-033** · conserto · Ajustes › Devolver as vendas › Google: sem venda de clique do Google, o botão baixava um arquivo só com o cabeçalho (subir isso no Google não serve para nada); agora o servidor diz quantas vendas foram (X-Vendas) e a tela avisa "Nada para subir" sem baixar (teste em r9-devolucao-http) · `abd5744`
- **R9-TRF-034** · texto · Ajustes › Devolver as vendas › Google: depois de baixar, diz "2 vendas em vendas-google-central-….csv" em vez de só o nome do arquivo · `abd5744`
- **R9-TRF-035** · enxugar · Ajustes › Devolver as vendas › Meta: só as vendas ainda no prazo ficam à vista (são as que pedem ação); as que passaram de 7 dias vão para "N vendas fora do prazo (só para conferir)", fechado (caso "devolucao" no r9-comportamentos) · `abd5744`
- **R9-TRF-036** · conserto · Relatórios › Folha do mês: com mais de 8 campanhas, a folha não dizia que faltavam (o servidor cortava em 8 antes e o "Mais N campanhas" nunca aparecia); agora vem campanhas_total e a folha diz "Mais 4 campanhas na tela Campanhas (aqui vão as 8 de maior gasto)", com "Mais 1 campanha" no singular (testes em r8-relatorios e r9-ajustes) · `c431fa5`
- **R9-TRF-037** · texto · Modo apresentação: a linha de cima repetia o título na primeira tela ("IndyCar Tráfego, Este mês" em cima de "ESTE MÊS"); agora diz as datas ("IndyCar Tráfego, 01/11 a 19/11") e nas outras telas "Este mês, 01/11 a 19/11" (teste em r9-ajustes) · `2930e86`
- **R9-TRF-038** · conserto · Modo apresentação › De onde vieram: origem com um serviço fechado dizia "1 fecharam"; agora "1 fechou" · `2930e86`
- **R9-TRF-039** · texto · Modo apresentação › Campanhas: campanha sem gasto ligado dizia "contatos; sem gasto ligado" embaixo do número que já diz "contatos"; agora só "sem gasto ligado" · `2930e86`
- **R9-TRF-040** · segurança · Servidor › diário de decisões: registrar, decidir e marcar como feita não tinham limite (um script com a sessão de alguém enchia o diário); agora 60 escritas em 10 min por pessoa, com 429 e Retry-After (teste em r9-limites) · `8d0dcd6`
- **R9-TRF-041** · segurança · Servidor › Gestor IA: criar conversa nova (uma linha no banco por pedido) entra nas rotas com limite por pessoa, 30 em 10 min (teste em r9-limites) · `8d0dcd6`
- **R9-TRF-042** · texto · Jornada › contato aberto (e o nome das etapas para leitor de tela): "Chegou até Fechou, etapa 7 de 7. Serviço fechado." virou "Etapa 7 de 7: Fechou."; "Chegou até Agendou, etapa 4 de 7" virou "Etapa 4 de 7: Agendou" (teste em setores.test) · `ca3ea8d`
- **R9-TRF-043** · texto · Jornada › contato › Situação: "Valor: valor da Agenda." virou "O valor veio da Agenda: para corrigir, mude lá." (o valor da Agenda, do Pátio e do orçamento vale sobre o lançado à mão, e a tela não oferece corrigir: agora diz onde se corrige) · `ca3ea8d`
- **R9-TRF-044** · texto · Gestor IA › proposta de risco alto: "Aumento de 40%, acima de 30%." virou "Aumento de 40% de uma vez (o passo seguro é até 30%)." (o 30% não dizia o que era; teste em r8-ia-ferramentas) · `3cb1905`
- **R9-TRF-045** · texto · Gestor IA › proposta acima da verba: "passa do teto mensal de R$ 3.000" virou "no mês daria R$ 3.200, acima da verba do mês (R$ 3.000)", com o nome que a tela Metas e verba usa e o valor que a proposta daria no mês · `3cb1905`
- **R9-TRF-046** · enxugar · Gestor IA › Diário: decisão ainda sem medição repetia "ainda não medido" em cada linha da tabela (quatro vezes no celular); agora a tabela tem só a coluna Antes e uma linha diz "O depois sai em 26/11, quando o Tráfego mede." ou "O depois é medido quando a mudança for feita." (teste em r9-gestor) · `3cb1905`
- **R9-TRF-047** · enxugar · Campanha aberta › Contatos desta campanha: cada linha repetia a marca "Anúncio da Meta" (todo contato da campanha veio dela); agora fica só "Taubaté 30 km › Vídeo 2", e a marca volta quando o contato não diz de qual anúncio veio (caso "campanha-contatos" no r9-comportamentos) · `1a6960d`
- **R9-TRF-048** · celular · Campanha aberta › Contatos desta campanha: mostra os 6 mais recentes e "Ver os outros N contatos" (no celular, 15 contatos davam três telas antes do link da Jornada); o foco vai para o sétimo ao abrir · `1a6960d`
- **R9-TRF-049** · texto · Hoje › Ritmo do mês: o selo "Acima da verba" aparecia com R$ 2.341 gastos de R$ 3.000 (era a projeção); agora diz "Vai passar da verba" ou, quando já passou, "Passou da verba"; "Abaixo da verba" virou "Vai sobrar verba" (teste em hoje-logica) · `08f304c`
- **R9-TRF-050** · texto · Hoje › Ritmo do mês: "O risco marca o esperado até hoje" (lia como risco de perder dinheiro) virou "A marca na barra é o esperado até hoje: R$ 1.900." · `08f304c`
- **R9-TRF-051** · conserto · Jornada › Esperando resposta: contato cuja "primeira mensagem" é um aviso do sistema gravado como recebido ("Agendamento: …", "Lembrete 24h enviado", "N no-shows hoje"; o banco só tira o "[Sistema]") aparecia esperando resposta sem o cliente ter escrito; agora fica "não dá para saber" e o aviso não vira primeira mensagem (achado D1 item 6; teste em r9-avisos-do-sistema) · `4db842d`
- **R9-TRF-052** · conserto · Jornada › contato › Linha do tempo: aviso do sistema aparecia como "Cliente escreveu: Lembrete 24h enviado"; agora "Aviso do sistema", do lado da oficina, e a "Primeira mensagem do cliente" pula o aviso (teste em r9-avisos-do-sistema) · `4db842d`
- **R9-TRF-053** · conserto · Ajustes › Mensagens que se repetem: "Lembrete 24h enviado" (48 vezes) e "[Sistema] …" podiam aparecer como mensagem de cliente para virar frase; agora nunca entram na lista (teste em r9-avisos-do-sistema) · `4db842d`
- **R9-TRF-054** · conserto · IA de fora › ferramenta conversa: aviso do sistema gravado como recebido saía como de: 'cliente' (a IA leria "Agendamento: …" como pedido do cliente); agora sai como de: 'sistema' (API-ia.md atualizado) · `4db842d`
- **R9-TRF-055** · celular · Casca no celular: botão ou campo levado à tela (Tab, link interno, rolar até) parava atrás da barra fixa de baixo; no teste, o toque em "Os anúncios estão se pagando?" caía em "Jornada". Agora a página reserva a altura da barra (scroll-padding-bottom), só abaixo de 62em (caso "gestor-pergunta-pronta" no r9-comportamentos) · `94eeea1`
- **R9-TRF-056** · acessibilidade · Gestor IA: ao tocar numa pergunta pronta (ou em Perguntar), o botão fica desligado enquanto ele responde e o foco caía no fim da página; agora o foco vai para a resposta, sem abrir o teclado do celular (caso "gestor-pergunta-pronta") · `94eeea1`
- **R9-TRF-057** · tela · Gestor IA › Para decidir: "Recusar" gravava no primeiro toque (no celular fica colado em "Aceitar"); agora abre "Por que não? (opcional, fica no diário)" com "Recusar a sugestão" e "Voltar" (Esc volta); o porquê vira a nota do diário, que o Gestor lê pela ferramenta de decisões (caso "gestor-recusar" no r9-comportamentos) · `37e59d7`
- **R9-TRF-058** · texto · Campanhas › Meta e Google: quando a Meta trazia o serviço fechado mais barato, a frase dizia "o Meta trouxe serviço fechado mais barato"; agora "a Meta trouxe…" (teste em r8-motor-pecas) · `5b5e261`
- **R9-TRF-059** · texto · Gestor IA › Diário: decisão medida na plataforma inteira dizia "Comparando o Meta inteiro."; agora "Comparando a Meta inteira." (teste em r9-artigos) · `5b5e261`
- **R9-TRF-060** · texto · Radar › investimento parou numa plataforma: o alerta dizia "O investimento no Meta caiu…"; agora "O investimento na Meta caiu…" (teste em r9-artigos) · `ea3cd29`
- **R9-TRF-061** · conserto · Botões de copiar (texto do relatório, chaves da IA, código do site): cada cópia dava erro na página (e.currentTarget nulo depois do await) e o foco não voltava de propósito; agora o botão é guardado antes (caso copiar em r9-comportamentos) · `5784d73`
- **R9-TRF-062** · conserto · Ajustes › Relatórios: ao trocar de Semana para Dia, o texto da semana continuava copiável (e com o título da semana) até o novo chegar; agora o copiar fica desligado e o título diz "Buscando o relatório…" (caso relatorio-trocar) · `b6f546a`
- **R9-TRF-063** · aviso · Ajustes › Relatórios: quando o texto não vinha, ficava só a frase do erro (para tentar de novo era preciso trocar de relatório e voltar); agora tem "Tentar de novo" ali mesmo (caso relatorio-falha) · `aebc57e`
- **R9-TRF-064** · tela · Ajustes › Acesso da IA de fora: a caixa vazia da chave recém-criada somava mais um espaço e deixava 80 px em branco entre a explicação e "Chaves criadas"; agora 40 px, como o resto da gaveta (medido no navegador) · `0b75ca3`
- **R9-TRF-065** · celular · Jornada e contatos da campanha no celular: a situação comprida ("Esperando resposta", "há 17 h 48 min") cortava o carro e o serviço em "Renegade 2019, Troca d…"; agora usam a ficha inteira e o serviço longo desce de linha (4 de 50 cortados → 0, medido a 375 px) · `9f4bf55`
- **R9-TRF-066** · conserto · Ajustes › Conexões: depois de "Buscar os números agora", os cartões de cima continuavam com "Números buscados há 16 h" (e o aviso de coleta parada) até sair e voltar; agora a gaveta é relida com fresco=1 e o foco volta ao botão (caso conexoes-buscar) · `35873a6`
- **R9-TRF-067** · conserto · Servidor: depois de guardar um acesso da Meta/Google ou de "Buscar os números agora", o Hoje e as Conexões ainda respondiam por até 30 s com a leitura guardada de antes ("não ligada", "Números buscados há 16 h"); agora quem grava esquece essa memória (r9-memoria-das-telas) · `28c6747`
- **R9-TRF-068** · conserto · Servidor: depois de lançar valores, motivos ou origens no mutirão, voltar ao Hoje (ou às Campanhas) em menos de 30 s ainda mostrava "4 serviços sem valor" e o faturado antigo (a fonte guardava a lista por cima da jornada); agora toda gravação da jornada esquece essa memória (r9-memoria-das-telas) · `127207e`
- **R9-TRF-069** · conserto · Servidor: depois de salvar as metas (verba do mês, valor médio, margem), o Hoje seguia até 30 s com o ritmo e a conta de cabeça das metas antigas; agora salvar esquece a leitura guardada (r9-memoria-config-http) · `7350f23`
- **R9-TRF-070** · conserto · Ajustes › De onde vêm os contatos › Aplicar de novo: depois de "N contatos ganharam origem", a Jornada e o Hoje seguiam até 45 s com "Ainda não sabemos" (memória da jornada); agora aplicar de verdade esquece essa memória, simular não (r9-memoria-das-telas) · `c5ce210`
- **R9-TRF-071** · conserto · Gestor IA › Perguntas prontas: a oficina sem nenhum contato via "Por que tantos contatos estão sem origem?" e "Quem está esperando resposta?" (temContatos nunca mudava); agora a tela conta os contatos dos últimos 30 dias e mostra as perguntas de quem está começando (caso gestor-prontas-comeco) · `cddef6c`
- **R9-TRF-072** · enxugar · Hoje › Ritmo do mês, oficina começando: um gráfico vazio (eixo de 1 a 19, "Nenhum contato no período" e a legenda "de anúncio / outros contatos") ocupava meia tela sem nenhuma coluna; agora uma frase: "Nenhum contato neste mês ainda…" (caso hoje-ritmo-vazio) · `11ec973`
- **R9-TRF-073** · tela · Tela "Você não tem acesso ao Tráfego": a barra de baixo, as abas do topo e o Ajustes continuavam ali, mas nenhum link abria nada (a tela parada não navega); agora somem e fica só o caminho de volta para a Central (caso sem-acesso-nav) · `e317f0d`
- **R9-TRF-074** · tela · Tela sem acesso: o botão da conta mostrava "?" para quem estava logado (as iniciais só eram pintadas depois de passar pelo acesso); agora mostra as iniciais e o menu com "Sair" para entrar com outro usuário (caso sem-acesso-nav) · `d402886`
- **R9-TRF-075** · desempenho · Servidor › arquivos da tela: saíam sem ETag, então o index.html (no-cache) e a casca que o service worker pede pela rede eram baixados inteiros de novo (324 KB com gzip, 61 arquivos) a cada abertura depois de 5 min; agora com ETag, quem já tem a versão recebe 304 sem corpo (r9-estatico-etag) · `4646d70`
- **R9-TRF-076** · conserto · Campanhas: o "Ver campanhas" de um alerta do radar no Hoje leva ?plataforma=meta (ou google), mas a lista ignorava o filtro e mostrava todas sem avisar; agora mostra só as daquela plataforma, diz "Só as campanhas da Meta. Ver todas" e a troca de ordem mantém o filtro (caso campanhas-plataforma) · `1ebdcca`
- **R9-TRF-077** · texto · Hoje › Do contato ao serviço fechado: toda etapa sem porcentagem dizia "passagem sem dado" (até quando a etapa anterior tinha zero ou quando mais gente chegou do que na anterior); agora "ninguém na etapa anterior", "inclui quem pulou etapa" ou "sem dado da etapa anterior" (teste em hoje-logica) · `7f24352`
- **R9-TRF-078** · acessibilidade · Hoje › De onde vieram os contatos: o número de cada origem levava " contatos" só para o leitor de tela, e a origem com um contato era lida "1 contatos"; agora "1 contato" (caso hoje-origens-leitor) · `a8b3fff`
- **R9-TRF-079** · celular · Celular deitado (360 px de altura): o topo fixo e a barra de baixo de 64 px comiam 126 px, sobrando 234 para o conteúdo; agora o topo rola com a página e a barra fica numa linha só com alvo de 44 px (sobram 315 px, medido no Hoje, no mutirão e no Gestor) · `e7429d2`
- **R9-TRF-080** · conserto · Fila de pendências › Ver o contato inteiro: "Voltar para a lista" (ou Esc, ou Fechar) levava para a lista filtrada da Jornada, que a pessoa nunca tinha visto, e a fila se perdia; agora o botão diz "Voltar para a fila" e volta para ela, no mesmo contato (caso fila-ver-contato) · `68e3c0f`
- **R9-TRF-081** · conserto · Campanhas: abrir uma campanha da lista filtrada ("Só as campanhas do Google") e tocar em "Voltar para a classificação" (ou Esc) voltava para a lista com todas; agora volta para a mesma lista filtrada, com o foco na campanha aberta (caso campanhas-plataforma) · `dcace3c`
- **R9-TRF-082** · tela · Ajustes › lista das partes: o item Conexões não dizia nada sobre o estado (era preciso abrir para saber); agora mostra "Faltam 2 passos", "Pede atenção" (acesso vencendo, coleta parada, WhatsApp parado) ou "Tudo ligado" (teste em hoje-logica e caso ajustes-estado-conexoes) · `4a642ff`

## Rodada 10 (20/11/2026)

Frente R10-trafego (Claude), branch `claude/r9-trafego`. Foco: conexões, segurança e desempenho. Cada linha tem um teste que falhava antes e passa depois, e o commit que a prova. Suíte: 766 antes, 802 depois.

- **R10-TRF-001** · segurança · Rotas da tela antiga (`/api/sync`, `/api/dashboard`, `/api/alertas`, fechamento por WhatsApp, `POST /api/eu` e as demais) respondiam com a tela antiga desligada; agora devolvem 404 `tela_antiga` e só abrem com `TRAFEGO_TELA_ANTIGA=1`, a mesma chave da tela (teste r10-servidor) · `2cb880c`
- **R10-TRF-002** · conserto · Texto com acento que chegava partido entre dois pacotes da rede era gravado com um sinal estranho no lugar da letra; o servidor agora junta os pedaços antes de ler (teste r10-servidor) · `2cb880c`
- **R10-TRF-003** · segurança · O teto de 1 MB por pedido contava letras, não bytes (texto com acento passava do teto), e o servidor seguia recebendo depois de recusar; agora conta bytes e para de ler (teste r10-servidor) · `2cb880c`
- **R10-TRF-004** · segurança · Metas e verba aceitavam qualquer coisa no lugar do número (lista, texto, valor absurdo); agora só número, com teto por campo (custo por cliente até R$ 100 mil, verba do mês até R$ 10 milhões) e recusa com frase clara (teste r10-servidor) · `2cb880c`
- **R10-TRF-005** · segurança · A chave das rotinas automáticas podia ser tentada sem limite; depois de 10 chaves erradas em 10 minutos do mesmo endereço, a resposta passa a ser 429 com o tempo de espera (teste r10-servidor) · `2cb880c`
- **R10-TRF-006** · segurança · Erro de uma biblioteca que trazia "status" (401, 404) saía para fora com a mensagem interna e podia derrubar a sessão de quem estava logado; agora só erro do próprio app sai com a frase, o resto vira 500 genérico (teste r10-servidor) · `2cb880c`
- **R10-TRF-007** · conserto · Gestor: endereço de conversa com "%" torto dava erro 500; agora responde 400 (teste r10-entradas) · `3ce0181`
- **R10-TRF-008** · segurança · A regra do navegador liberava a página para falar com qualquer projeto `*.supabase.co` e por conexão `wss`, que a tela nova não usa; agora só o endereço do projeto configurado (o `wss` volta apenas com a tela antiga ligada) (teste r10-entradas) · `3ce0181`
- **R10-TRF-009** · segurança · `package.json` e `package-lock.json` podiam ser baixados pelo endereço do app (mostravam as versões das bibliotecas); agora 404 (teste r10-entradas) · `3ce0181`
- **R10-TRF-010** · segurança · Quem tem papel de gestor via os telefones de aviso inteiros ao abrir as metas; agora vê só o final ("•••1234"), e o administrador segue vendo tudo (teste r10-entradas) · `3ce0181`
- **R10-TRF-011** · segurança · Salvar metas e criar ou listar chaves da IA não tinham limite de pedidos por pessoa; agora 30 gravações de metas, 10 chaves novas e 120 listagens por janela, com 429 depois disso (teste r10-entradas) · `3ce0181`
- **R10-TRF-012** · desempenho · A memória dos arquivos da tela guardava 40 arquivos e a tela tem 58: a cada abertura 53 arquivos eram comprimidos de novo (cerca de 65 ms de processador e 53 leituras de disco); agora cabem 300 arquivos ou 32 MB e a segunda abertura comprime 0 (teste r10-desempenho-servidor) · `03c0020`
- **R10-TRF-013** · conserto · Quando o Supabase respondia 5xx ou 429 ao conferir o login, o app tratava como "sessão inválida" e mandava a pessoa entrar de novo; agora responde "indisponível" e não guarda a recusa (teste r10-desempenho-servidor) · `03c0020`
- **R10-TRF-014** · desempenho · Ao abrir uma tela, 6 pedidos juntos da mesma pessoa faziam 18 idas ao Supabase para conferir o mesmo login; agora os 6 esperam a mesma conferência: 3 idas (teste r10-desempenho-servidor) · `03c0020`
- **R10-TRF-015** · segurança · A porta da IA de fora aceitava tentativas de chave sem limite, cada uma indo ao banco; depois de 20 chaves erradas em 10 minutos do mesmo endereço, responde 429 sem consultar o banco (teste r10-portas-publicas) · `6e9cf75`
- **R10-TRF-016** · desempenho · Anúncio sem imagem: cada abertura da lista repetia a consulta e o pedido à plataforma (5 aberturas, 5 consultas); agora a falta fica guardada por 10 minutos (5 aberturas, 1 consulta) (teste r10-portas-publicas) · `6e9cf75`
- **R10-TRF-017** · desempenho · O arquivo de rastreio que o site carrega em toda página vinha inteiro toda vez (3.765 bytes); agora tem etiqueta e, sem mudança, a resposta é 304 com 0 bytes (teste r10-portas-publicas) · `6e9cf75`
- **R10-TRF-018** · desempenho · O mesmo arquivo de rastreio, na primeira visita, ia sem compressão: 3.765 bytes; agora vai comprimido: 1.905 bytes (teste r10-portas-publicas) · `6e9cf75`
- **R10-TRF-019** · aviso · Gravação que estourava o tempo dizia só que estava sem conexão, e a pessoa tocava de novo sem saber se tinha gravado; agora diz "Demorou demais e não deu para saber se gravou. Atualize a tela e confira antes de tentar de novo." (teste r10-rede) · `90d92a8`
- **R10-TRF-020** · conserto · Baixar arquivo (o do Google, a planilha) não tinha tempo limite: com a rede travada o botão ficava girando para sempre; agora desiste em 60 segundos com frase clara (teste r10-rede) · `90d92a8`
- **R10-TRF-021** · desempenho · Ajustes: a lista das partes e a gaveta de Conexões pediam a mesma leitura ao mesmo tempo (7 pedidos para abrir); leituras iguais em curso agora são uma só (6 pedidos) (teste r10-rede) · `90d92a8`
- **R10-TRF-022** · conserto · Uma leitura pedida antes de uma gravação podia chegar depois dela e voltar para a memória da tela com o número velho; agora a resposta de antes da gravação é descartada (teste r10-rede) · `90d92a8`
- **R10-TRF-023** · conserto · Na abertura, a leitura da configuração do login não tinha tempo limite: com a rede travada a tela ficava em "Abrindo o Tráfego" para sempre; agora desiste em 15 segundos, avisa e tenta de novo (teste r10-rede) · `90d92a8`
- **R10-TRF-024** · desempenho · As 4 fontes da tela valiam 1 hora no navegador, com 4 idas ao servidor a cada abertura depois disso; agora valem 30 dias: 0 idas (teste r10-desempenho-servidor) · `90d92a8`
- **R10-TRF-025** · texto · As respostas da porta da IA mandavam para "Ajustes › Chaves da IA", nome que não existe na tela; agora dizem "Ajustes › Acesso da IA de fora" e, quando falta permissão, citam a opção como está no formulário da chave (teste r10-nomes) · `75387c4`
- **R10-TRF-026** · texto · Guia CONECTAR.md mandava clicar em "Vendas para o Google" e "Vendas da Meta para marcar", nomes antigos; agora usa "Ajustes › Devolver as vendas às plataformas", "Baixar o arquivo do Google" e "Meta: vendas para marcar no WhatsApp Business", e o teste falha se a tela mudar um nome (teste r10-nomes) · `75387c4`
- **R10-TRF-027** · texto · Guia MCP.md recomendava uma chave sem "ver dado pessoal", opção que não existe com esse nome; agora cita "Só ler os números" e "Ver nome e conversa completa dos clientes", como no formulário (teste r10-nomes) · `bb01c53`

Nomes que mudaram (antes · depois):

| Onde | Antes | Depois |
| --- | --- | --- |
| Respostas da porta da IA e da ponte | Ajustes › Chaves da IA | Ajustes › Acesso da IA de fora |
| MCP.md | "ver dado pessoal" | "Ver nome e conversa completa dos clientes" |
| CONECTAR.md | Vendas para o Google | Baixar o arquivo do Google |
| CONECTAR.md | Vendas da Meta para marcar | Meta: vendas para marcar no WhatsApp Business |

Paradas aqui: 27 linhas, não 100. O app já estava bem fechado e o que sobrou eram ajustes soltos que a regra da rodada não deixa contar. As 18 que faltaram na rodada 9 não foram somadas: não havia 18 de verdade.
