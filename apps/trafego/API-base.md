# API base do IndyCar Tráfego (rodada 8, frente T2a)

Rotas da tela nova que esta frente implementa (contrato: `indycar-ferramentas/r8/CONTRATO-API.md` §5.2, §5.4 e §5.5).
As rotas da Jornada e da Origem estão em `API-jornada.md` (frente T2b). Tudo exige login (admin, ou gestor com o app
`ads`): sem login 401, sem acesso 403. Tudo é GET e responde JSON.

**Exemplos**: gerados pelo próprio código (`motor/*.js`) com os dados de mentira de `tests/apoio/trafego-dados.js`, que
imitam a situação de 19/11/2026: nenhuma conta de anúncio ligada, WhatsApp automático parado desde 30/09, 7 contatos.
Listas longas foram encurtadas ("… (N a mais)").

Regras de todas:
- período: `?periodo=hoje|7d|30d|mes|mes_passado` (padrão `mes`) ou `?de=AAAA-MM-DD&ate=AAAA-MM-DD` (até 400 dias);
- `?plataforma=meta|google` (opcional) deixa só os contatos e o gasto daquela plataforma;
- `?fresco=1` ignora a memória de 30 s (cada resposta fica guardada 30 s por período e plataforma);
- dinheiro em reais, taxa em fração de 0 a 1, `null` quando não se sabe (nunca 0 para "não sei"), nunca NaN;
- sem conta de anúncio ligada: campos de gasto em `null` e `estado.gasto = "sem_conta"`;
- demonstração (`fonte = 'demo'` em `ads_metricas_dia`): só aparece se não houver nenhuma linha real na tabela,
  com `estado.demo = true`; custo por contato, custo por serviço e retorno ficam `null` com ela;
- erros: 400 `{ erro }` com frase pronta (período, plataforma, mês, tipo); 503 `{ erro, codigo: "leitura", pedido }`
  quando o banco não respondeu (a tela oferece tentar de novo); leitura secundária que falha não derruba: entra em
  `estado.incompleto` e `estado.aviso`.

Campos a mais do contrato (acrescentados, nada renomeado): `estado.respostas`, `estado.respostas_texto`, `estado.incompleto`, `estado.reserva`, `estado.aviso`, `conexoes.whatsapp`, `agenda.situacao`, `agenda.ocupacao_media`, `ritmo.leitura`, `funil.etapas[respondido].confirmados|desconhecidos`, `plataforma`, `gerado_em`; nas campanhas `chave`, `so_dos_contatos`, `sem_valor`, `comparacao`, `por_que_difere`; no detalhe `contatos_total` e `estado.termos`; em /api/conexoes `faltam` e `estado`; nos relatórios `motor` e `estado`.

## GET /api/hoje

A primeira tela do dono. Parâmetros: período, `plataforma`, `fresco`. Lê em paralelo, uma consulta por tabela
(12 idas ao banco na situação de hoje). Ordem do "o que fazer": gravidade e, dentro dela, WhatsApp parado, contato
esperando, radar, conta de anúncio, pendências e agenda; no máximo 6.

```json
{
  "periodo": {
    "de": "2026-11-01",
    "ate": "2026-11-19",
    "rotulo": "Este mês",
    "anterior": {
      "de": "2026-10-01",
      "ate": "2026-10-19"
    }
  },
  "estado": {
    "gasto": "sem_conta",
    "valores": "faltam",
    "origem": "parcial",
    "demo": false,
    "respostas": "sem_registro",
    "respostas_texto": null,
    "incompleto": [],
    "reserva": false,
    "aviso": null
  },
  "frase": {
    "tipo": "sem_conta",
    "texto": "6 contatos novos neste mês. 4 vieram de anúncio.",
    "apoio": "Ligue a conta de anúncios para ver quanto foi investido e o retorno de cada campanha.",
    "acao": {
      "rotulo": "Ligar conta de anúncios",
      "ir": "ajustes?secao=conexoes"
    }
  },
  "numeros": [
    {
      "id": "investido",
      "rotulo": "Investido em anúncio",
      "valor": null,
      "formato": "dinheiro",
      "apoio": "Conta de anúncios não ligada",
      "antes": null,
      "variacao": null,
      "sentido": "neutro",
      "serie": []
    },
    {
      "id": "contatos",
      "rotulo": "Contatos",
      "valor": 6,
      "formato": "inteiro",
      "apoio": "4 de anúncio",
      "antes": 1,
      "variacao": 5,
      "sentido": "bom",
      "serie": [
        0,
        0,
        "… (17 a mais)"
      ]
    },
    {
      "id": "fechados",
      "rotulo": "Serviços fechados",
      "valor": 2,
      "formato": "inteiro",
      "apoio": "2 de anúncio",
      "antes": 1,
      "variacao": 1,
      "sentido": "bom",
      "serie": [
        0,
        0,
        "… (17 a mais)"
      ]
    },
    {
      "id": "faturado",
      "rotulo": "Faturado",
      "valor": 420,
      "formato": "dinheiro",
      "apoio": "R$ 420 de anúncio · falta o valor de 1 serviço",
      "antes": 300,
      "variacao": 0.4,
      "sentido": "bom",
      "serie": [
        0,
        0,
        "… (17 a mais)"
      ]
    }
  ],
  "derivados": {
    "custo_por_contato": null,
    "custo_por_servico": null,
    "retorno": null,
    "ticket_medio": 420,
    "taxa_fechamento": 0.3333,
    "tempo_resposta_min": null,
    "taxa_falta": null
  },
  "fazer": [
    {
      "id": "whatsapp_parado",
      "gravidade": "alta",
      "origem": "conexao",
      "titulo": "O WhatsApp automático está parado desde 30/09",
      "porque": "Lembretes e respostas não estão saindo. Só o dono da conta consegue gerar a chave nova.",
      "acao": {
        "rotulo": "Abrir o Atendimento",
        "ir": "/atendimento/?aba=integracoes"
      }
    },
    {
      "id": "sem_valor",
      "gravidade": "media",
      "origem": "pendencia",
      "titulo": "1 serviço fechado sem valor",
      "porque": "Sem o valor não dá para saber o retorno de cada anúncio.",
      "acao": {
        "rotulo": "Lançar agora",
        "ir": "jornada?pendencia=sem_valor"
      }
    },
    {
      "id": "sem_origem",
      "gravidade": "media",
      "origem": "pendencia",
      "titulo": "1 contato sem origem",
      "porque": "Sem saber de onde veio o contato não dá para dizer qual anúncio funciona.",
      "acao": {
        "rotulo": "Marcar origem",
        "ir": "jornada?pendencia=sem_origem"
      }
    },
    {
      "id": "sem_motivo",
      "gravidade": "baixa",
      "origem": "pendencia",
      "titulo": "1 contato não fechou e está sem motivo",
      "porque": "Saber por que não fechou mostra o que ajustar: preço, prazo ou atendimento.",
      "acao": {
        "rotulo": "Marcar motivo",
        "ir": "jornada?pendencia=sem_motivo"
      }
    },
    {
      "id": "agenda_vazia",
      "gravidade": "baixa",
      "origem": "agenda",
      "titulo": "Agenda com folga nos próximos dias",
      "porque": "Agenda com folga: 2% dos horários dos próximos 7 dias de trabalho estão tomados. Vale acelerar os anúncios.",
      "acao": {
        "rotulo": "Ligar conta de anúncios",
        "ir": "ajustes?secao=conexoes"
      }
    }
  ],
  "ritmo": {
    "orcamento_mes": null,
    "gasto_ate_hoje": null,
    "esperado_ate_hoje": null,
    "projecao": null,
    "situacao": "sem_meta",
    "meta_contatos": null,
    "dias": [
      {
        "data": "2026-11-01",
        "gasto": null,
        "contatos": 0,
        "contatos_anuncio": 0
      },
      {
        "data": "2026-11-02",
        "gasto": null,
        "contatos": 0,
        "contatos_anuncio": 0
      },
      "… (17 a mais)"
    ],
    "leitura": "Sem a conta de anúncios ligada não dá para acompanhar o gasto do mês."
  },
  "funil": {
    "etapas": [
      {
        "id": "contato",
        "rotulo": "Contatos",
        "total": 6,
        "anuncio": 4,
        "passagem": null
      },
      {
        "id": "respondido",
        "rotulo": "Respondidos",
        "total": null,
        "anuncio": 3,
        "passagem": null,
        "confirmados": 4,
        "desconhecidos": 1
      },
      {
        "id": "orcamento",
        "rotulo": "Com orçamento",
        "total": 1,
        "anuncio": 0,
        "passagem": null
      },
      {
        "id": "agendou",
        "rotulo": "Agendaram",
        "total": 1,
        "anuncio": 1,
        "passagem": 1
      },
      {
        "id": "veio",
        "rotulo": "Vieram",
        "total": 1,
        "anuncio": 1,
        "passagem": 1
      },
      {
        "id": "oficina",
        "rotulo": "Carro na oficina",
        "total": 0,
        "anuncio": 0,
        "passagem": 0
      },
      {
        "id": "fechou",
        "rotulo": "Fecharam",
        "total": 2,
        "anuncio": 2,
        "passagem": null
      }
    ],
    "nao_fecharam": {
      "total": 2,
      "motivos": [
        {
          "id": "caro",
          "rotulo": "Achou caro",
          "n": 1
        }
      ],
      "sem_motivo": 1
    }
  },
  "origens": [
    {
      "id": "meta",
      "rotulo": "Anúncio da Meta",
      "paga": true,
      "contatos": 3,
      "fecharam": 2,
      "faturado": 420,
      "gasto": null,
      "custo_por_contato": null,
      "retorno": null
    },
    {
      "id": "google",
      "rotulo": "Anúncio do Google",
      "paga": true,
      "contatos": 1,
      "fecharam": 0,
      "faturado": 0,
      "gasto": null,
      "custo_por_contato": null,
      "retorno": null
    },
    "… (2 a mais)"
  ],
  "hoje": [
    {
      "lead_id": "lead-06",
      "nome": "Cliente 6",
      "hora": "08:20",
      "origem": {
        "canal": "meta",
        "paga": true,
        "rotulo": "Anúncio da Meta",
        "detalhe": "Troca de óleo R$ 169",
        "campanha": {
          "ext": "1202",
          "nome": "Troca de óleo R$ 169"
        },
        "conjunto": null,
        "anuncio": null,
        "palavra_chave": null,
        "como": "ref",
        "como_rotulo": "pelo código do site",
        "certeza": "certa"
      },
      "etapa_atual": "contato",
      "espera_min": 100
    }
  ],
  "agenda": {
    "dias": [
      {
        "data": "2026-11-19",
        "rotulo": "qui 19",
        "ocupacao": 0,
        "marcados": 0,
        "vagas": 19
      },
      {
        "data": "2026-11-20",
        "rotulo": "sex 20",
        "ocupacao": 0.16,
        "marcados": 2,
        "vagas": 16
      },
      "… (5 a mais)"
    ],
    "leitura": "Agenda com folga: 2% dos horários dos próximos 7 dias de trabalho estão tomados. Vale acelerar os anúncios.",
    "situacao": "vazia",
    "ocupacao_media": 0.02
  },
  "conexoes": {
    "meta": {
      "ligado": false,
      "situacao": "nunca_ligou",
      "ultima_coleta": null,
      "aviso": null,
      "parada": false
    },
    "google": {
      "ligado": false,
      "situacao": "nunca_ligou",
      "ultima_coleta": null,
      "aviso": null,
      "parada": false
    },
    "site": {
      "rastreio": false,
      "ultimo_clique": null,
      "cliques_7d": null
    },
    "whatsapp": {
      "ligado": false,
      "situacao": "chave_recusada",
      "desde": "2026-09-30",
      "aviso": "A chave do WhatsApp foi recusada. Lembretes e respostas não estão saindo desde 30/09. Só o dono da conta consegue gerar a chave nova."
    }
  },
  "plataforma": null,
  "gerado_em": "2026-11-19T13:00:00.000Z"
}
```

## GET /api/conexoes

O mesmo objeto `conexoes` de /api/hoje, mais o passo a passo do que falta. Nenhuma chave ou token sai (viram sim/não
antes de deixar o banco). As rotas antigas (`/api/integracoes*`, `/api/sync`, `/api/config`, `/api/metas`, `/api/eu`) continuam valendo.

```json
{
  "meta": {
    "ligado": false,
    "situacao": "nunca_ligou",
    "ultima_coleta": null,
    "aviso": null,
    "parada": false
  },
  "google": {
    "ligado": false,
    "situacao": "nunca_ligou",
    "ultima_coleta": null,
    "aviso": null,
    "parada": false
  },
  "site": {
    "rastreio": false,
    "ultimo_clique": null,
    "cliques_7d": null
  },
  "whatsapp": {
    "ligado": false,
    "situacao": "chave_recusada",
    "desde": "2026-09-30",
    "aviso": "A chave do WhatsApp foi recusada. Lembretes e respostas não estão saindo desde 30/09. Só o dono da conta consegue gerar a chave nova."
  },
  "passos": [
    {
      "feito": false,
      "titulo": "WhatsApp da oficina ligado",
      "como": "No Atendimento, em Configurações e depois Integrações: gere uma chave nova no CodeWords e cole lá. Só o dono da conta consegue.",
      "acao": {
        "rotulo": "Abrir o Atendimento",
        "ir": "/atendimento/?aba=integracoes"
      }
    },
    {
      "feito": false,
      "titulo": "Site avisando de onde vem cada contato",
      "como": "O botão de WhatsApp do site manda um código junto com a mensagem. Este passo fica pronto no primeiro clique.",
      "acao": {
        "rotulo": "Ver de onde vêm os contatos",
        "ir": "ajustes?secao=origem"
      }
    },
    {
      "feito": false,
      "titulo": "Conta de anúncios da Meta ligada",
      "como": "Em Ajustes, na parte de Conexões: entre com a conta da Meta e escolha a conta de anúncios da oficina.",
      "acao": {
        "rotulo": "Ligar a Meta",
        "ir": "ajustes?secao=conexoes"
      }
    },
    {
      "feito": false,
      "titulo": "Conta do Google Ads ligada",
      "como": "Em Ajustes, na parte de Conexões: entre com a conta do Google e escolha a conta de anúncios da oficina.",
      "acao": {
        "rotulo": "Ligar o Google",
        "ir": "ajustes?secao=conexoes"
      }
    },
    {
      "feito": false,
      "titulo": "Orçamento do mês definido",
      "como": "Em Ajustes: diga quanto pretende investir por mês. Com isso a tela mostra se o gasto está no ritmo.",
      "acao": {
        "rotulo": "Definir o orçamento",
        "ir": "ajustes?secao=metas"
      }
    }
  ],
  "faltam": 5,
  "estado": {
    "incompleto": []
  }
}
```

## GET /api/campanhas

Parâmetros: período, `plataforma`, `fresco`. O contato entra na campanha pelo identificador (`origem.campanha.ext`)
ou, sem ele, pelo nome (sem acento e sem diferença de maiúscula). Campanha que só os contatos conhecem entra com os
campos de gasto em `null` e `so_dos_contatos: true`. Leitura: retorno de 3 ou mais é "bom", de 1,5 a 3 "atencao",
abaixo de 1,5 "ruim"; sem retorno, a régua do custo por contato do Nexus Ads (meta + 35%).

Sem conta ligada (a situação de hoje):

```json
{
  "periodo": {
    "de": "2026-11-01",
    "ate": "2026-11-19",
    "rotulo": "Este mês",
    "anterior": {
      "de": "2026-10-01",
      "ate": "2026-10-19"
    }
  },
  "estado": {
    "gasto": "sem_conta",
    "valores": "faltam",
    "origem": "parcial",
    "demo": false,
    "incompleto": [],
    "reserva": false
  },
  "totais": {
    "gasto": null,
    "impressoes": null,
    "cliques": null,
    "contatos": 4,
    "agendaram": 1,
    "vieram": 1,
    "fecharam": 2,
    "faturado": 420,
    "custo_por_contato": null,
    "custo_por_servico": null,
    "retorno": null,
    "contatos_plataforma": null
  },
  "campanhas": [
    {
      "plataforma": "meta",
      "ext": "1202",
      "nome": "Troca de óleo R$ 169",
      "situacao": "desconhecida",
      "objetivo": null,
      "gasto": null,
      "impressoes": null,
      "cliques": null,
      "taxa_clique": null,
      "custo_por_clique": null,
      "contatos_plataforma": null,
      "contatos": 3,
      "agendaram": 1,
      "vieram": 1,
      "fecharam": 2,
      "faturado": 420,
      "custo_por_contato": null,
      "custo_por_servico": null,
      "retorno": null,
      "sem_valor": 1,
      "leitura": {
        "tom": "neutro",
        "texto": "3 contatos chegaram por esta campanha. Ligue a conta de anúncios para ver o custo. Falta o valor de 1 serviço: o retorno pode ser maior."
      },
      "serie": [
        {
          "data": "2026-11-01",
          "gasto": null,
          "contatos": 0
        },
        {
          "data": "2026-11-02",
          "gasto": null,
          "contatos": 0
        },
        "… (17 a mais)"
      ],
      "filhos": null,
      "chave": "1202",
      "so_dos_contatos": true
    },
    {
      "plataforma": "google",
      "ext": null,
      "nome": "Freios Taubaté",
      "situacao": "desconhecida",
      "objetivo": null,
      "gasto": null,
      "impressoes": null,
      "cliques": null,
      "taxa_clique": null,
      "custo_por_clique": null,
      "contatos_plataforma": null,
      "contatos": 1,
      "agendaram": 0,
      "vieram": 0,
      "fecharam": 0,
      "faturado": 0,
      "custo_por_contato": null,
      "custo_por_servico": null,
      "retorno": null,
      "sem_valor": 0,
      "leitura": {
        "tom": "neutro",
        "texto": "1 contato chegou por esta campanha. Ligue a conta de anúncios para ver o custo."
      },
      "serie": [
        {
          "data": "2026-11-01",
          "gasto": null,
          "contatos": 0
        },
        {
          "data": "2026-11-02",
          "gasto": null,
          "contatos": 0
        },
        "… (17 a mais)"
      ],
      "filhos": null,
      "chave": "nome:freios taubate",
      "so_dos_contatos": true
    }
  ],
  "sem_campanha": {
    "contatos": 0,
    "fecharam": 0,
    "faturado": 0,
    "texto": "Todo contato de anúncio está ligado a uma campanha."
  },
  "horarios": {
    "dias": [
      "seg",
      "ter",
      "… (5 a mais)"
    ],
    "horas": [
      7,
      8,
      "… (12 a mais)"
    ],
    "celulas": [
      [
        0,
        0,
        "… (12 a mais)"
      ],
      [
        0,
        0,
        "… (12 a mais)"
      ],
      "… (5 a mais)"
    ],
    "pico": "ter 10h",
    "leitura": "Ainda são poucos contatos (4) para apontar o melhor horário.",
    "total": 4,
    "base": "anuncio"
  },
  "plataforma": null,
  "comparacao": null,
  "por_que_difere": [
    "A plataforma conta o contato quando a pessoa toca no anúncio e abre a conversa. A oficina só conta quando a primeira mensagem chega.",
    "Quem toca no botão e desiste antes de mandar mensagem conta na plataforma e não na oficina.",
    "… (2 a mais)"
  ]
}
```

Com a Meta ligada e gasto real (R$ 50 por dia de 01/11 a 10/11), só os totais e a primeira campanha:

```json
{
  "totais": {
    "gasto": 500,
    "impressoes": 20000,
    "cliques": 400,
    "contatos": 4,
    "agendaram": 1,
    "vieram": 1,
    "fecharam": 2,
    "faturado": 420,
    "custo_por_contato": 125,
    "custo_por_servico": 250,
    "retorno": 0.84,
    "contatos_plataforma": 30
  },
  "campanhas": [
    {
      "plataforma": "meta",
      "ext": "1202",
      "nome": "Troca de óleo R$ 169",
      "situacao": "ativa",
      "objetivo": "Conversas",
      "gasto": 500,
      "impressoes": 20000,
      "cliques": 400,
      "taxa_clique": 0.02,
      "custo_por_clique": 1.25,
      "contatos_plataforma": 30,
      "contatos": 3,
      "agendaram": 1,
      "vieram": 1,
      "fecharam": 2,
      "faturado": 420,
      "custo_por_contato": 166.67,
      "custo_por_servico": 250,
      "retorno": 0.84,
      "sem_valor": 1,
      "leitura": {
        "tom": "ruim",
        "texto": "Ainda não se paga: cada R$ 1 virou R$ 0,84 em serviço fechado. Falta o valor de 1 serviço: o retorno pode ser maior."
      },
      "serie": [
        {
          "data": "2026-11-01",
          "gasto": 50,
          "contatos": 0
        },
        {
          "data": "2026-11-02",
          "gasto": 50,
          "contatos": 0
        },
        "… (17 a mais)"
      ],
      "filhos": 1,
      "chave": "1202",
      "so_dos_contatos": false
    }
  ],
  "comparacao": {
    "linhas": [
      {
        "plataforma": "meta",
        "custo_por_contato": 166.67,
        "custo_por_servico": 250,
        "fecharam": 2,
        "texto": "Meta: R$ 167 por contato · R$ 250 por serviço fechado"
      }
    ],
    "destaque": ""
  }
}
```

## GET /api/campanhas/:plataforma/:chave

`:plataforma` = `meta` | `google` | `anuncio`; `:chave` = o identificador da campanha, ou `nome:<nome>` (o campo
`chave` da lista já vem pronto; use `encodeURIComponent`). 404 `{ codigo: "sem_campanha" }` quando a campanha não
aparece no período. Os números da oficina por conjunto e por anúncio ficam null quando os contatos não dizem o
conjunto (ou o anúncio). Palavras-chave e termos vêm de `ads_termos_dia` (Google); sem a tabela, `estado.termos = "sem_tabela"`.

```json
{
  "periodo": {
    "de": "2026-11-01",
    "ate": "2026-11-19",
    "rotulo": "Este mês",
    "anterior": {
      "de": "2026-10-01",
      "ate": "2026-10-19"
    }
  },
  "estado": {
    "gasto": "real",
    "valores": "faltam",
    "origem": "parcial",
    "demo": false,
    "incompleto": [],
    "reserva": false,
    "termos": "sem_tabela"
  },
  "campanha": {
    "plataforma": "meta",
    "ext": "1202",
    "nome": "Troca de óleo R$ 169",
    "situacao": "ativa",
    "objetivo": "Conversas",
    "gasto": 500,
    "impressoes": 20000,
    "cliques": 400,
    "taxa_clique": 0.02,
    "custo_por_clique": 1.25,
    "contatos_plataforma": 30,
    "contatos": 3,
    "agendaram": 1,
    "vieram": 1,
    "fecharam": 2,
    "faturado": 420,
    "custo_por_contato": 166.67,
    "custo_por_servico": 250,
    "retorno": 0.84,
    "sem_valor": 1,
    "leitura": {
      "tom": "ruim",
      "texto": "Ainda não se paga: cada R$ 1 virou R$ 0,84 em serviço fechado. Falta o valor de 1 serviço: o retorno pode ser maior."
    },
    "serie": [
      {
        "data": "2026-11-01",
        "gasto": 50,
        "contatos": 0
      },
      {
        "data": "2026-11-02",
        "gasto": 50,
        "contatos": 0
      },
      "… (17 a mais)"
    ],
    "filhos": 1,
    "chave": "1202",
    "so_dos_contatos": false
  },
  "conjuntos": [
    {
      "ext": "cj1",
      "nome": "Taubaté 30 km",
      "gasto": 500,
      "impressoes": 20000,
      "cliques": 400,
      "taxa_clique": 0.02,
      "custo_por_clique": 1.25,
      "contatos_plataforma": 30,
      "contatos": null,
      "agendaram": null,
      "vieram": null,
      "fecharam": null,
      "faturado": null,
      "custo_por_contato": null,
      "custo_por_servico": null,
      "retorno": null,
      "sem_valor": null,
      "anuncios": [
        {
          "ext": "a1",
          "nome": "Vídeo 2",
          "miniatura_url": "https://exemplo.test/a1.jpg",
          "gasto": 500,
          "impressoes": 20000,
          "cliques": 400,
          "taxa_clique": 0.02,
          "custo_por_clique": 1.25,
          "contatos_plataforma": 30,
          "contatos": null,
          "agendaram": null,
          "vieram": null,
          "fecharam": null,
          "faturado": null,
          "custo_por_contato": null,
          "custo_por_servico": null,
          "retorno": null,
          "sem_valor": null
        }
      ]
    }
  ],
  "palavras": [],
  "termos": [],
  "contatos": [
    {
      "lead_id": "lead-06",
      "nome": "Cliente 6",
      "telefone_final": "7766",
      "chegou_em": "2026-11-19T08:20:00-03:00",
      "origem": {
        "canal": "meta",
        "paga": true,
        "rotulo": "Anúncio da Meta",
        "detalhe": "Troca de óleo R$ 169",
        "campanha": {
          "ext": "1202",
          "nome": "Troca de óleo R$ 169"
        },
        "conjunto": null,
        "anuncio": null,
        "palavra_chave": null,
        "como": "ref",
        "como_rotulo": "pelo código do site",
        "certeza": "certa"
      },
      "etapas": [
        {
          "id": "contato",
          "em": "2026-11-19T08:20:00-03:00"
        }
      ],
      "etapa_atual": "contato",
      "desfecho": {
        "tipo": "aberto",
        "valor": null,
        "valor_fonte": null,
        "motivo": null,
        "motivo_rotulo": null,
        "obs": null,
        "em": null,
        "parado_dias": null
      },
      "pendencias": [
        "sem_resposta"
      ],
      "espera_min": 100
    },
    {
      "lead_id": "lead-02",
      "nome": "Cliente 2",
      "telefone_final": "7766",
      "chegou_em": "2026-11-04T10:00:00-03:00",
      "origem": {
        "canal": "meta",
        "paga": true,
        "rotulo": "Anúncio da Meta",
        "detalhe": "Troca de óleo R$ 169",
        "campanha": {
          "ext": "1202",
          "nome": "Troca de óleo R$ 169"
        },
        "conjunto": null,
        "anuncio": null,
        "palavra_chave": null,
        "como": "ref",
        "como_rotulo": "pelo código do site",
        "certeza": "certa"
      },
      "etapas": [
        {
          "id": "contato",
          "em": "2026-11-04T10:00:00-03:00"
        },
        {
          "id": "respondido",
          "em": null,
          "minutos": null
        },
        {
          "id": "fechou",
          "em": "2026-11-04T10:00:00-03:00"
        }
      ],
      "etapa_atual": "fechou",
      "desfecho": {
        "tipo": "fechou",
        "valor": null,
        "valor_fonte": null,
        "motivo": null,
        "motivo_rotulo": null,
        "obs": null,
        "em": "2026-11-04T17:00:00-03:00",
        "parado_dias": null
      },
      "pendencias": [
        "sem_valor"
      ],
      "espera_min": null
    },
    "… (1 a mais)"
  ],
  "contatos_total": 3
}
```

## GET /api/relatorios/texto?tipo=diario|semanal|mensal[&mes=AAAA-MM]

Texto pronto para WhatsApp. Diário = ontem; semanal = os 7 dias até ontem; mensal = o mês pedido (padrão: o mês
passado). Com gasto no trecho, o texto é o do núcleo do Nexus Ads (`motor: "nucleo"`); sem gasto, o do lado da
oficina (`motor: "oficina"`), sem gasto inventado.

```json
{
  "tipo": "semanal",
  "titulo": "Relatório da semana (12/11 a 18/11)",
  "texto": "*IndyCar · Relatório da semana (12/11 a 18/11)*\n\n*Contatos*\n• Nenhum contato novo neste período.\n\n*Anúncios*\n• A conta de anúncios não está ligada: o gasto e o retorno não aparecem aqui.\n\n*Atenção*\n• A chave do WhatsApp foi recusada. Lembretes e respostas não estão saindo desde 30/09. Só o dono da conta consegue gerar a chave nova.\n\nIndyCar Tráfego",
  "periodo": {
    "de": "2026-11-12",
    "ate": "2026-11-18"
  },
  "estado": {
    "gasto": "sem_conta",
    "demo": false,
    "incompleto": [],
    "reserva": false
  },
  "motor": "oficina"
}
```

## GET /api/relatorios/folha?mes=AAAA-MM

Tudo o que a folha A4 do mês mostra (padrão: o mês corrente). Mês que ainda não começou ou formato errado: 400.

```json
{
  "mes": {
    "mes": "2026-11",
    "de": "2026-11-01",
    "ate": "2026-11-19",
    "rotulo": "novembro de 2026",
    "fechado": false
  },
  "periodo": {
    "de": "2026-11-01",
    "ate": "2026-11-19",
    "rotulo": "novembro de 2026",
    "anterior": {
      "de": "2026-10-01",
      "ate": "2026-10-19"
    }
  },
  "estado": {
    "gasto": "sem_conta",
    "valores": "faltam",
    "origem": "parcial",
    "demo": false,
    "respostas": "sem_registro",
    "respostas_texto": null,
    "incompleto": [],
    "reserva": false,
    "aviso": null
  },
  "titulo": "IndyCar · Tráfego · novembro de 2026",
  "frase": {
    "tipo": "sem_conta",
    "texto": "6 contatos novos de novembro de 2026. 4 vieram de anúncio.",
    "apoio": "Ligue a conta de anúncios para ver quanto foi investido e o retorno de cada campanha.",
    "acao": {
      "rotulo": "Ligar conta de anúncios",
      "ir": "ajustes?secao=conexoes"
    }
  },
  "numeros": [
    {
      "id": "investido",
      "rotulo": "Investido em anúncio",
      "valor": null,
      "formato": "dinheiro",
      "apoio": "Conta de anúncios não ligada",
      "antes": null,
      "variacao": null,
      "sentido": "neutro",
      "serie": []
    },
    {
      "id": "contatos",
      "rotulo": "Contatos",
      "valor": 6,
      "formato": "inteiro",
      "apoio": "4 de anúncio",
      "antes": 1,
      "variacao": 5,
      "sentido": "bom",
      "serie": [
        0,
        0,
        "… (17 a mais)"
      ]
    },
    {
      "id": "fechados",
      "rotulo": "Serviços fechados",
      "valor": 2,
      "formato": "inteiro",
      "apoio": "2 de anúncio",
      "antes": 1,
      "variacao": 1,
      "sentido": "bom",
      "serie": [
        0,
        0,
        "… (17 a mais)"
      ]
    },
    {
      "id": "faturado",
      "rotulo": "Faturado",
      "valor": 420,
      "formato": "dinheiro",
      "apoio": "R$ 420 de anúncio · falta o valor de 1 serviço",
      "antes": 300,
      "variacao": 0.4,
      "sentido": "bom",
      "serie": [
        0,
        0,
        "… (17 a mais)"
      ]
    }
  ],
  "derivados": {
    "custo_por_contato": null,
    "custo_por_servico": null,
    "retorno": null,
    "ticket_medio": 420,
    "taxa_fechamento": 0.3333,
    "tempo_resposta_min": null,
    "taxa_falta": null
  },
  "funil": {
    "etapas": [
      {
        "id": "contato",
        "rotulo": "Contatos",
        "total": 6,
        "anuncio": 4,
        "passagem": null
      },
      {
        "id": "respondido",
        "rotulo": "Respondidos",
        "total": null,
        "anuncio": 3,
        "passagem": null,
        "confirmados": 4,
        "desconhecidos": 1
      },
      {
        "id": "orcamento",
        "rotulo": "Com orçamento",
        "total": 1,
        "anuncio": 0,
        "passagem": null
      },
      {
        "id": "agendou",
        "rotulo": "Agendaram",
        "total": 1,
        "anuncio": 1,
        "passagem": 1
      },
      {
        "id": "veio",
        "rotulo": "Vieram",
        "total": 1,
        "anuncio": 1,
        "passagem": 1
      },
      {
        "id": "oficina",
        "rotulo": "Carro na oficina",
        "total": 0,
        "anuncio": 0,
        "passagem": 0
      },
      {
        "id": "fechou",
        "rotulo": "Fecharam",
        "total": 2,
        "anuncio": 2,
        "passagem": null
      }
    ],
    "nao_fecharam": {
      "total": 2,
      "motivos": [
        {
          "id": "caro",
          "rotulo": "Achou caro",
          "n": 1
        }
      ],
      "sem_motivo": 1
    }
  },
  "origens": [
    {
      "id": "meta",
      "rotulo": "Anúncio da Meta",
      "paga": true,
      "contatos": 3,
      "fecharam": 2,
      "faturado": 420,
      "gasto": null,
      "custo_por_contato": null,
      "retorno": null
    },
    {
      "id": "google",
      "rotulo": "Anúncio do Google",
      "paga": true,
      "contatos": 1,
      "fecharam": 0,
      "faturado": 0,
      "gasto": null,
      "custo_por_contato": null,
      "retorno": null
    },
    "… (2 a mais)"
  ],
  "campanhas": [
    {
      "plataforma": "meta",
      "ext": "1202",
      "nome": "Troca de óleo R$ 169",
      "situacao": "desconhecida",
      "objetivo": null,
      "gasto": null,
      "impressoes": null,
      "cliques": null,
      "taxa_clique": null,
      "custo_por_clique": null,
      "contatos_plataforma": null,
      "contatos": 3,
      "agendaram": 1,
      "vieram": 1,
      "fecharam": 2,
      "faturado": 420,
      "custo_por_contato": null,
      "custo_por_servico": null,
      "retorno": null,
      "sem_valor": 1,
      "leitura": {
        "tom": "neutro",
        "texto": "3 contatos chegaram por esta campanha. Ligue a conta de anúncios para ver o custo. Falta o valor de 1 serviço: o retorno pode ser maior."
      },
      "filhos": null,
      "chave": "1202",
      "so_dos_contatos": true
    },
    {
      "plataforma": "google",
      "ext": null,
      "nome": "Freios Taubaté",
      "situacao": "desconhecida",
      "objetivo": null,
      "gasto": null,
      "impressoes": null,
      "cliques": null,
      "taxa_clique": null,
      "custo_por_clique": null,
      "contatos_plataforma": null,
      "contatos": 1,
      "agendaram": 0,
      "vieram": 0,
      "fecharam": 0,
      "faturado": 0,
      "custo_por_contato": null,
      "custo_por_servico": null,
      "retorno": null,
      "sem_valor": 0,
      "leitura": {
        "tom": "neutro",
        "texto": "1 contato chegou por esta campanha. Ligue a conta de anúncios para ver o custo."
      },
      "filhos": null,
      "chave": "nome:freios taubate",
      "so_dos_contatos": true
    }
  ],
  "sem_campanha": {
    "contatos": 0,
    "fecharam": 0,
    "faturado": 0,
    "texto": "Todo contato de anúncio está ligado a uma campanha."
  },
  "horarios": {
    "pico": "ter 10h",
    "leitura": "Ainda são poucos contatos (4) para apontar o melhor horário."
  },
  "texto": "*IndyCar · Relatório de novembro de 2026 (até agora)*\n\n*Contatos*\n• 5 contatos novos, 3 de anúncio\n• 2 serviços fechados, R$ 420 faturados (falta o valor de 1 serviço)\n• Não fecharam: 2 (o motivo que mais aparece: achou caro)\n\n*De onde vieram*\n• Anúncio da Meta: 2, 2 fecharam\n• Anúncio do Google: 1\n• Ainda não sabemos: 1\n• Indicação: 1\n\n*Anúncios*\n• A conta de anúncios não está ligada: o gasto e o retorno não aparecem aqui.\n\n*Atenção*\n• A chave do WhatsApp foi recusada. Lembretes e respostas não estão saindo desde 30/09. Só o dono da conta consegue gerar a chave nova.\n\nIndyCar Tráfego",
  "gerado_em": "2026-11-19T13:00:00.000Z"
}
```

## GET /api/relatorios/apresentacao

As telas do modo apresentação, na ordem em que passam. Mesmo período e mesmas contas de /api/hoje.

```json
{
  "periodo": {
    "de": "2026-11-01",
    "ate": "2026-11-19",
    "rotulo": "Este mês",
    "anterior": {
      "de": "2026-10-01",
      "ate": "2026-10-19"
    }
  },
  "estado": {
    "gasto": "sem_conta",
    "valores": "faltam",
    "origem": "parcial",
    "demo": false,
    "respostas": "sem_registro",
    "respostas_texto": null,
    "incompleto": [],
    "reserva": false,
    "aviso": null
  },
  "telas": [
    {
      "id": "resumo",
      "titulo": "Este mês",
      "frase": {
        "tipo": "sem_conta",
        "texto": "6 contatos novos neste mês. 4 vieram de anúncio.",
        "apoio": "Ligue a conta de anúncios para ver quanto foi investido e o retorno de cada campanha.",
        "acao": {
          "rotulo": "Ligar conta de anúncios",
          "ir": "ajustes?secao=conexoes"
        }
      }
    },
    {
      "id": "numeros",
      "titulo": "Os números",
      "numeros": [
        {
          "id": "investido",
          "rotulo": "Investido em anúncio",
          "valor": null,
          "formato": "dinheiro",
          "apoio": "Conta de anúncios não ligada",
          "antes": null,
          "variacao": null,
          "sentido": "neutro"
        },
        {
          "id": "contatos",
          "rotulo": "Contatos",
          "valor": 6,
          "formato": "inteiro",
          "apoio": "4 de anúncio",
          "antes": 1,
          "variacao": 5,
          "sentido": "bom"
        },
        {
          "id": "fechados",
          "rotulo": "Serviços fechados",
          "valor": 2,
          "formato": "inteiro",
          "apoio": "2 de anúncio",
          "antes": 1,
          "variacao": 1,
          "sentido": "bom"
        },
        {
          "id": "faturado",
          "rotulo": "Faturado",
          "valor": 420,
          "formato": "dinheiro",
          "apoio": "R$ 420 de anúncio · falta o valor de 1 serviço",
          "antes": 300,
          "variacao": 0.4,
          "sentido": "bom"
        }
      ]
    },
    {
      "id": "funil",
      "titulo": "Do contato ao serviço fechado",
      "etapas": [
        {
          "id": "contato",
          "rotulo": "Contatos",
          "total": 6,
          "anuncio": 4,
          "passagem": null
        },
        {
          "id": "agendou",
          "rotulo": "Agendaram",
          "total": 1,
          "anuncio": 1,
          "passagem": 1
        },
        {
          "id": "veio",
          "rotulo": "Vieram",
          "total": 1,
          "anuncio": 1,
          "passagem": 1
        },
        {
          "id": "fechou",
          "rotulo": "Fecharam",
          "total": 2,
          "anuncio": 2,
          "passagem": null
        }
      ],
      "nao_fecharam": {
        "total": 2,
        "motivos": [
          {
            "id": "caro",
            "rotulo": "Achou caro",
            "n": 1
          }
        ],
        "sem_motivo": 1
      }
    },
    {
      "id": "origens",
      "titulo": "De onde vieram os contatos",
      "origens": [
        {
          "id": "meta",
          "rotulo": "Anúncio da Meta",
          "paga": true,
          "contatos": 3,
          "fecharam": 2,
          "faturado": 420,
          "gasto": null,
          "custo_por_contato": null,
          "retorno": null
        },
        {
          "id": "google",
          "rotulo": "Anúncio do Google",
          "paga": true,
          "contatos": 1,
          "fecharam": 0,
          "faturado": 0,
          "gasto": null,
          "custo_por_contato": null,
          "retorno": null
        },
        "… (2 a mais)"
      ]
    },
    {
      "id": "campanhas",
      "titulo": "Campanhas",
      "campanhas": [
        {
          "plataforma": "meta",
          "nome": "Troca de óleo R$ 169",
          "gasto": null,
          "contatos": 3,
          "fecharam": 2,
          "faturado": 420,
          "custo_por_contato": null,
          "retorno": null,
          "leitura": {
            "tom": "neutro",
            "texto": "3 contatos chegaram por esta campanha. Ligue a conta de anúncios para ver o custo. Falta o valor de 1 serviço: o retorno pode ser maior."
          }
        },
        {
          "plataforma": "google",
          "nome": "Freios Taubaté",
          "gasto": null,
          "contatos": 1,
          "fecharam": 0,
          "faturado": 0,
          "custo_por_contato": null,
          "retorno": null,
          "leitura": {
            "tom": "neutro",
            "texto": "1 contato chegou por esta campanha. Ligue a conta de anúncios para ver o custo."
          }
        }
      ]
    },
    {
      "id": "proximos",
      "titulo": "O que fazer agora",
      "itens": [
        {
          "id": "whatsapp_parado",
          "gravidade": "alta",
          "origem": "conexao",
          "titulo": "O WhatsApp automático está parado desde 30/09",
          "porque": "Lembretes e respostas não estão saindo. Só o dono da conta consegue gerar a chave nova.",
          "acao": {
            "rotulo": "Abrir o Atendimento",
            "ir": "/atendimento/?aba=integracoes"
          }
        },
        {
          "id": "sem_valor",
          "gravidade": "media",
          "origem": "pendencia",
          "titulo": "1 serviço fechado sem valor",
          "porque": "Sem o valor não dá para saber o retorno de cada anúncio.",
          "acao": {
            "rotulo": "Lançar agora",
            "ir": "jornada?pendencia=sem_valor"
          }
        },
        "… (3 a mais)"
      ]
    }
  ],
  "gerado_em": "2026-11-19T13:00:00.000Z"
}
```
