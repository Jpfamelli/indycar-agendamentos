# Rodada 9 · Comunicar

| Área | Prova de uso disponível | Decisão |
| --- | --- | --- |
| Início, prévia, mensagens e réguas | A rodada 1 reproduziu os fluxos no mock. Uso recente por controle: não dá para saber. | Manter os caminhos à vista. |
| Campanhas, Clientes e Satisfação | Uso recente por rota: não dá para saber. | Agrupar em Mais. |
| Rodar agora e indicadores detalhados | Uso recente por controle: não dá para saber. | Agrupar em Mais ações e Mais indicadores. |
| PARAR, auditoria e trava contra envios vencidos | Controles de proteção. | Manter. |

Os nomes das telas e ações foram preservados. Mais, Mais ações e Mais indicadores são novos rótulos de navegação.

A suíte completa executa 310 testes. Capturas antigas da rodada 1 estão em `apps/comunicar/qa-out/`.

Para João, confirmar na prévia se Campanhas deve voltar ao primeiro nível. Para Claude, atualizar o caminho das telas no manual ao integrar.

Lote 1 em `9301455`. 12 melhorias no primeiro commit. Os cinco ajustes de `9c68d71` elevam a rodada a 17 melhorias no MELHORIAS.

O levantamento da rodada 1 registrou zero lembretes criados ou enviados em 32 dias e identificou a chave recusada como bloqueio de envio.

Chrome com mock e tráfego externo bloqueado. O painel abre por clique e teclado e cabe em 375 e 1440 px nos temas claro e escuro. A mesma matriz confirmou respostas atrasadas, falhas de atualização e rejeição de períodos invertidos. As capturas depois estão em `apps/comunicar/qa-out/r9/`. Faltam comparação antes/depois, axe e jornadas completas.

A segunda passagem protege consultas concorrentes, busca e filtros de mensagens. Foram registradas 14 melhorias em `e6bc7ed`, `290e36a` e `8e5b653`, totalizando **31/100**. A suíte passou em **310/310**. Retomar em R9-COM-032. Nenhum nome de botão ou de tela mudou nesta passagem.

O uso de Campanhas, Clientes e Satisfação por rota segue indeterminado. Para João, revisar o agrupamento em Mais e verificar a chave do CodeWords em Atendimento › Configurações › Integrações. Para Claude, conferir o caminho no manual ao integrar.

A retomada registrou a proteção da ficha de `ea9c56f` e aplicou em `e5040f5` proteções à prévia e aos aniversários, com nova tentativa, indicação de carregamento e ajustes de foco. Total **42/100**, próximo **R9-COM-043**. A suíte isolada passou **310/310** e a verificação de sintaxe passou. Faltam repetir no Chrome as jornadas afetadas nesta retomada, concluir a auditoria axe, comparar as capturas e completar o inventário. Nenhum nome de ação ou tela existente mudou.

O lote de Campanhas avançou para **61/100**, de R9-COM-043 a R9-COM-061. O commit `044da23` protege a seleção de público, as buscas e as janelas do assistente. O commit `fb90dce` resolve a dependência do relógio no teste de adiamento seletivo. A suíte passou em **310/310** com Supabase fictício, e o Chrome passou em **4/4** combinações de tema e largura no roteiro `ee3c8a5`. O navegador só permitiu GET e HEAD no mock local. Os nomes das ações existentes foram preservados. Falta completar 39 melhorias a partir de R9-COM-062, cobrir as jornadas restantes, concluir axe-core e o inventário por controle, e montar os comparativos de capturas. Para Claude, Agenda e Atendimento ficam na outra cópia e o manual deve refletir o agrupamento em Mais. Para João, permanece a dúvida sobre manter Campanhas nesse menu sem evidência recente de uso por rota.
