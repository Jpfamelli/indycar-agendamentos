# 2026-09-17 — Agenda: "Desfazer" reabre o lead no CRM

Migração aplicada no Supabase (projeto nppfqhavqahapmugnyng) com o nome
`agenda_desfazer_reabre_lead`. Altera **só** a função
`public.sincronizar_lead_pelo_agendamento()` (gatilho `agendamentos_sincroniza_lead`).

## O que mudou
- Antes: marcar **Concluído** / **Não fechou** na Agenda fechava o lead, mas voltar o
  horário para Confirmado/Aguardando **não reabria** — a Agenda mostrava o cliente
  pendente e o CRM seguia com a venda fechada (ou perdida).
- Agora: se o lead está exatamente onde a **própria Agenda** o deixou
  (`concluido` vindo de um agendamento `concluido`, `perdido` vindo de `nao_fechou`,
  `em_servico` vindo de `compareceu`/`em_atendimento`, `contato` vindo de
  `nao_veio`/`cancelado`), voltar o horário para `aguardando`/`confirmado`
  devolve o lead para `agendado`.
- Lead fechado **por fora** (direto no CRM) continua intocado.
- `closed_at` zera sozinho ao reabrir (gatilho `leads_fechamento`, já existente).
- O ramo de INSERT e os ramos concluido / nao_fechou ficaram idênticos.

## v2 (mesmo dia, achados da revisão)
- **Lead compartilhado**: se outro horário do mesmo lead tem o mesmo desfecho, desfazer este não reabre o lead.
- **Valor**: ao desfazer um `concluido` que gravou `valor_pago`, o valor volta a 0 (padrão da coluna) — só se ainda for o valor que este horário pôs.

## Como foi testado (sem alterar dado)
Bloco `DO` que conclui → desfaz → marca não fechou → desfaz → simula lead fechado
por fora, e termina com `RAISE EXCEPTION` — o que reverte tudo e devolve o
resultado na mensagem de erro.

## Para reverter
Recriar a função sem a variável `v_desfaz` e sem o último `elsif`
(`new.status in ('aguardando','confirmado') ...`). A versão anterior está no
histórico de migrações do Supabase.
