# IndyCar Tráfego

O app de tráfego pago da IndyCar: quanto foi investido em anúncio (Meta e Google), quantos contatos chegaram,
o que aconteceu com cada um (respondido, orçamento, agendou, veio, fechou) e quanto voltou em serviço fechado.
Mora dentro da Central em `/trafego/` (`indycar-agendamentos.onrender.com/trafego/`) e também sobe sozinho na
porta **3400** (`node server.js`). Versão 0.7.0 (rodada 8, 19/11/2026).

A versão longa deste arquivo (rodadas 1 a 7: radar, relatório diário, WhatsApp pela fila do Comunicar, ligar
Meta e Google, piloto automático, publicar no Render) está no git: `git show 8719a35:apps/trafego/LEIA-ME.md`.

## Como rodar

```bash
npm install
cp .env.exemplo .env      # e preencha (o .env nunca vai para o git)
node server.js            # http://localhost:3400
npm test                  # node:test, sem banco, sem rede e sem gastar IA
npm run mock              # tela antiga sem login, com dados inventados (porta 3411)
```

Contra o banco de verdade, só com tudo que roda sozinho desligado:
`CRM_AUTOMACOES=0 CARTEIRO_DESLIGADO=1 SINCRONIA=0 AUTOMACOES=0 IA_FUNIL=0 IMPORT_DISABLED=1 ADS_AUTOMATICO=0`.

Login: o da Central (Supabase Auth). Entra admin sempre; gestor só com `ads` em `perfis.apps`.

## Como está organizado

| Onde | O quê |
|---|---|
| `tela/` | tela nova (frente T3), servida na raiz do app |
| `public/` | tela antiga, em `/antiga/` até a rodada de enxugar |
| `server.js` | porteiro, rotas antigas, rotinas e o encaixe de `rotas/` |
| `rotas/*.js` | rotas novas, um arquivo por assunto (como registrar: `rotas/LEIA-ME.md`) |
| `motor/` | contas das rotas novas: `nucleo.mjs` (cópia do Nexus Ads), `adaptador.js`, `periodo.js`, `texto.js`, `soma.js`, `fonte.js` (leitura do banco), `hoje.js`, `campanhas.js`, `relatorios.js`, `ritmo.js`, `agenda-oficina.js`, `conexoes-estado.js`, `horarios.js`, `comparacao.js`, `reserva-jornada.js` |
| `jornada.js`, `origem.js`, `rastreio/` | jornada de cada contato e de onde ele veio (frente T2b) |
| `radar.js` | o único radar de alertas (regras de `ads_regras` + CRM + ciclo + regras da conta do núcleo) |
| `meta.js`, `google.js`, `coletor.js` | coleta das plataformas |
| `enderecos.js`, `seguranca.js`, `registro.js`, `estatico.js` | endereços do ecossistema, segurança, log e arquivos da tela |

## Rotas da tela nova

- `API-base.md`: `/api/hoje`, `/api/campanhas`, `/api/campanhas/:plataforma/:chave`, `/api/conexoes`,
  `/api/relatorios/texto|folha|apresentacao` (cada uma com um exemplo de resposta tirado do código);
- `API-jornada.md`: `/api/jornada*`, `/api/pendencias`, `/api/origem/*`, rastreio do site.

Regras que valem para todas: `null` quando não se sabe (nunca 0 para "não sei"); sem conta de anúncio ligada, gasto
`null` e `estado.gasto = "sem_conta"`; linha de demonstração nunca soma com dado real; texto de tela já sai pronto,
em português simples; uma consulta por tabela e memória de 30 s (`motor/fonte.js`).

## Testes

`node --test --test-concurrency=1` dentro desta pasta. Os da rodada 8 começam com `r8-`; os dados de mentira estão
em `tests/apoio/` (`banco-falso.js` imita o Supabase e conta as consultas; `trafego-dados.js` monta a situação de hoje).

## Publicar

Só o orquestrador publica (a Central sobe o Tráfego em `/trafego/`). O `render.yaml` da raiz do monorrepo explica as
variáveis.
